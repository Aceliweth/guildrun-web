// Guildrun deterministic combat simulation engine.
// Exports `createBattle({ data, heroes, enemies, relics, enemyRelics, seed })` per CONTRACT.md.

import { createPrng } from './prng.js';
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  hexDistance,
  hexDistanceCoords,
  cellToWorld,
  worldDistanceSq,
  findNearestAvailableCell,
  findNextStep,
} from './hex.js';
import {
  createStatModTable,
  resetTemporaryBonuses,
  addStatBonus,
  applyHeroRankScaling,
  applyEnemyFloorScaling,
  recalculateStats,
  getUnitStat,
} from './stats.js';
import {
  buildPassiveAbilityEffects,
  buildItemEffects,
  buildRelicEffects,
  buildQuestRewardEffects,
  checkEffectAttachmentAndCondition,
  executeModularEffect,
  unitHasClass,
} from './effects.js';
import { executeActiveAbility, getAbilityTiming } from './abilities.js';

export const FIXED_DT = 0.032;
const MAX_BATTLE_TIME = 180.0;
// Default fallback wind-up when an ability is not in ABILITY_TIMINGS.
export const CAST_WINDUP = 0.6;

export function createBattle({
  data = {},
  heroes = [],
  enemies = [],
  relics = [],
  relicObjects = null,
  enemyRelics = [],
  seed = 1,
  floor = 0,
  endlessFloorIndex = null,
  difficulty = 0,
  bonusRushDuration = 0,
  playerRushBonus = 0,
  stallReduction = 0,
  playerStallReduction = 0,
  shardsInBank = null,
  shardsGenerated = 15,
  rushTriggers = 1,
  stallTriggers = 1,
  rerolls = 0,
} = {}) {
  const prng = createPrng(seed);
  const battleSingleton = data?.singletons?.BattleSingleton || {};
  const statusSingleton = data?.singletons?.StatusSingleton || {};
  const heroesSingleton = data?.singletons?.HeroesSingleton || {};

  const units = [];
  const benchUnits = [];
  const unitByUid = new Map();
  const activeEffects = [];
  const questStates = [];
  const timedEffects = [];
  const projectiles = [];
  const aoes = [];
  let nextProjId = 1;
  let nextAoeId = 1;

  const state = {
    time: 0,
    frame: 0,
    units,
    projectiles,
    aoes,
    events: [],
    storm: {
      active: false,
      timeUntilStart: battleSingleton.SecondsUntilStormStart ?? 50.0,
      elapsedStorm: 0,
      tickTimer: battleSingleton.DamageInterval ?? 1.0,
      damage: battleSingleton.DamagePerInterval ?? 5,
    },
  };

  let over = false;
  let winner = null;

  // Simulation context object shared with effects.js and abilities.js
  const sim = {
    data,
    prng,
    units,
    benchUnits,
    state,
    storm: state.storm,
    difficulty: Math.max(0, Number(difficulty) || 0),
    bonusRushDuration: (Number(bonusRushDuration) || 0) + (Number(playerRushBonus) || 0),
    stallReduction: (Number(stallReduction) || 0) + (Number(playerStallReduction) || 0),
    get playerRushBonus() {
      return this.bonusRushDuration;
    },
    set playerRushBonus(v) {
      this.bonusRushDuration = Number(v) || 0;
    },
    get playerStallReduction() {
      return this.stallReduction;
    },
    set playerStallReduction(v) {
      this.stallReduction = Number(v) || 0;
    },
    bonusTeamSize: 0,
    heroStormDamageReduction: 0,
    frostDealsDamage: false,
    riftbreakerActive: false,
    riftbreakerTimer: 0,
    survivalDuration: 0,
    shardsInBank:
      shardsInBank != null
        ? Math.max(0, Number(shardsInBank) || 0)
        : Math.max(0, Number(shardsGenerated) || 15),
    shardsGeneratedThisGame: Math.max(0, Number(shardsGenerated) || 15),
    rushTriggersThisGame: Math.max(1, Number(rushTriggers) || 1),
    stallTriggersThisGame: Math.max(1, Number(stallTriggers) || 1),
    rerollsThisGame: Math.max(0, Number(rerolls) || 0),
    shardsEarnedInBattle: 0,
    itemsCreatedInBattle: 0,

    getUnit: (uid) => unitByUid.get(uid) || null,
    getAliveUnits: (team = null) =>
      units.filter((u) => u.hp > 0 && u.state !== 'Dead' && (team == null || u.team === team)),
    getDeadUnits: (team = null) =>
      units.filter((u) => (u.hp <= 0 || u.state === 'Dead') && (team == null || u.team === team)),
    emitEvent: (ev) => {
      state.events.push(ev);
    },
    isRushActive: (unit, baseDur = 10) => {
      const isEnemy = unit?.team === 2;
      const rushBonus = isEnemy ? (unit?.bonusRushDuration || 0) : (sim.bonusRushDuration || 0) + (unit?.bonusRushDuration || 0);
      return state.time < baseDur + rushBonus + (unit?._rushRefreshOffset || 0);
    },
    isStallReached: (unit, baseDur = 15) => {
      const isEnemy = unit?.team === 2;
      const stallRed = isEnemy ? (unit?.stallReduction || 0) : (sim.stallReduction || 0) + (unit?.stallReduction || 0);
      return state.time >= Math.max(1, baseDur - stallRed);
    },
    refreshUnitRush: (unit) => {
      if (unit) unit._rushRefreshOffset = state.time;
      sim.rushTriggersThisGame++;
      sim.fireTrigger('OnRushStart', { source: unit });
      sim.fireTrigger('OnRushOrStallTriggered', { source: unit });
    },
    gainShards: (amt, meta = {}) => {
      const a = Math.max(0, Math.round(amt || 0));
      if (a > 0) {
        sim.shardsEarnedInBattle += a;
        sim.shardsGeneratedThisGame += a;
        sim.shardsInBank += a;
        const src = meta.source || null;
        const tgt = meta.target || src || null;
        sim.emitEvent({
          type: 'shards',
          amount: a,
          totalEarned: sim.shardsEarnedInBattle,
          sourceUid: src?.uid ?? null,
          targetUid: tgt?.uid ?? null,
          x: meta.x ?? tgt?.x ?? src?.x ?? 3.0,
          y: meta.y ?? tgt?.y ?? src?.y ?? 3.0,
        });
        sim.fireTrigger('OnShardsGenerated', {
          amount: a,
          value: a,
          source: src,
          target: tgt,
          _fromShardBonus: !!meta._fromShardBonus,
        });
      }
    },
    resurrectUnit: (source, target, healAmount) => {
      if (!target || target.hp > 0) return 0;
      const pos = findNearestAvailableCell(target.cellX, target.cellY, units, BOARD_WIDTH, BOARD_HEIGHT);
      target.cellX = pos.x;
      target.cellY = pos.y;
      target.x = pos.x;
      target.y = pos.y;
      const w = cellToWorld(pos.x, pos.y);
      target.worldX = w.x;
      target.worldZ = w.z;
      target.state = 'Idle';
      target.statuses = {
        Burn: 0,
        Frost: 0,
        Poison: 0,
        Bleed: 0,
        Stun: 0,
        Stealth: 0,
        Shield: 0,
        DamageImmunity: 0,
        AntiHeal: 0,
      };
      const restored = Math.max(1, Math.min(target.maxHp, Math.round(healAmount || target.maxHp * 0.5)));
      target.hp = restored;
      if (source) {
        source.combatStats.healingDone = (source.combatStats.healingDone || 0) + restored;
      }
      sim.emitEvent({
        type: 'heal',
        sourceUid: source?.uid ?? null,
        targetUid: target.uid,
        amount: restored,
        resurrected: true,
        x: target.x,
        y: target.y,
      });
      return restored;
    },
    addTimedEffect: (eff, duration) => {
      const ownerUnit = sim.getUnit(eff._ownerUid);
      executeModularEffect(sim, eff, { source: ownerUnit }, 'temp');
      const statActions = (eff.actions || []).filter((a) => {
        const t = a?.type || a?.$type || '';
        return /^Modify.*Stat|^SetStatsToHigher/i.test(t) && t !== 'ModifyPermanentStatAction';
      });
      const hasSalPermafrost = (eff.actions || []).some((a) => (a?.type || a?.$type) === 'SalActiveEffectAction');
      if (statActions.length > 0 || hasSalPermafrost || typeof eff.customRun === 'function') {
        timedEffects.push({
          eff: statActions.length > 0 ? { ...eff, actions: statActions } : { ...eff, actions: [] },
          remaining: duration,
          clearSalPermafrostOnExpire: hasSalPermafrost,
        });
      }
    },
  };

  function createUnitObject({
    uid,
    team,
    defId,
    name,
    isHero,
    rank = 1,
    maxItemSlots = null,
    guildId = 0,
    classIds = [],
    baseStats = {},
    attackType = 'Melee',
    projectileSpeed = 6.0,
    activeAbilityId = null,
    passiveAbilityIds = [],
    specializationId = null,
    items = [],
    rankModifierIds = [],
    x = 0,
    y = 0,
    startHpPercent = 1.0,
  }) {
    const pos = findNearestAvailableCell(x, y, units, BOARD_WIDTH, BOARD_HEIGHT);
    const world = cellToWorld(pos.x, pos.y);
    const statMods = createStatModTable(baseStats);

    const unit = {
      uid,
      team,
      defId,
      name: name || `${isHero ? 'Hero' : 'Enemy'} ${defId}`,
      isHero,
      rank: Math.max(1, Math.min(4, Math.round(rank || 1))),
      maxItemSlots: Math.max(1, Math.min(4, Math.round(maxItemSlots || rank || 1))),
      guildId,
      classIds: [...classIds],
      specializationId,
      items: [...items],
      rankModifierIds: [...rankModifierIds],
      attackType: attackType || ((baseStats.AttackRange || 1) > 1 ? 'Ranged' : 'Melee'),
      projectileSpeed: Number(projectileSpeed) || 6.0,
      activeAbilityId,
      passiveAbilityIds: [...passiveAbilityIds],
      x: pos.x,
      y: pos.y,
      cellX: pos.x,
      cellY: pos.y,
      nextCellX: null,
      nextCellY: null,
      moveFromX: pos.x,
      moveFromY: pos.y,
      moveProgress: 0,
      worldX: world.x,
      worldZ: world.z,
      facing: team === 1 ? 1 : -1,
      statMods,
      stats: {},
      permanentGains: {},
      hp: 100,
      maxHp: 100,
      mana: 0,
      maxMana: 100,
      lockedMana: 0,
      manaLockTimer: 0,
      manaRegenTimer: statusSingleton.GlobalManaRegenInterval ?? 2.0,
      hpRegenTimer: 1.0,
      shield: 0,
      shieldBatches: [],
      statuses: {
        Burn: 0,
        Poison: 0,
        Frost: 0,
        Bleed: 0,
        Stun: 0,
        Stealth: 0,
        AntiHeal: 0,
        DamageImmunity: 0,
      },
      statusTimers: {
        burnTick: statusSingleton.BurnDamageInterval ?? 1.0,
        poisonTick: statusSingleton.PoisonDamageInterval ?? 2.0,
        frostTick: statusSingleton.FrostDissipationInterval ?? 2.0,
        stunRemaining: 0,
        stealthRemaining: 0,
        immunityRemaining: 0,
        antiHealRemaining: 0,
        stunResistRemaining: 0,
      },
      state: 'Idle',
      targetUid: null,
      attackTimer: 0,
      attacksPerSecond: 0.5,
      startHpPercent: Math.max(0.05, Math.min(1.0, Number(startHpPercent) || 1.0)),
      combatStats: {
        damageDealt: 0,
        damageTaken: 0,
        damageMitigated: 0,
        healingDone: 0,
        shieldGranted: 0,
        kills: 0,
        casts: 0,
      },
    };

    if (unit.activeAbilityId == null) {
      unit.statMods.MaxMana.base = 0;
    }
    recalculateStats(unit, data);
    return unit;
  }

  // 1. Initialize Player Heroes (team = 1)
  heroes.forEach((hInput, idx) => {
    if (!hInput) return;
    const heroId = Number(hInput.heroId ?? hInput.id ?? hInput.defId ?? 1);
    const heroDef = data?.heroes?.[heroId] || data?.heroes?.[String(heroId)] || {};
    const uid = String(hInput.uid || `hero_${heroId}_${idx}`);
    const rank = Math.max(1, Math.min(4, Number(hInput.rank) || 1));

    const classIds = Array.isArray(heroDef.classIds) ? heroDef.classIds.map(Number) : [];
    let activeAbilityId = heroDef.startWithActiveAbility !== false ? (heroDef.activeAbilityId ?? null) : null;
    const passiveAbilityIds = heroDef.passiveAbilityId != null ? [Number(heroDef.passiveAbilityId)] : [];

    // Apply Specialization (bonus class, activeAbility override, additional passiveAbility)
    const rawSpecId = hInput.specializationId ?? hInput.specId ?? null;
    const specId =
      rawSpecId != null && Number(rawSpecId) > 100000 && !data?.specializations?.[rawSpecId]
        ? Number(rawSpecId) - 100000
        : rawSpecId;
    if (specId != null) {
      const spec = data?.specializations?.[specId] || data?.specializations?.[String(specId)];
      if (spec) {
        if (spec.classId != null && !classIds.includes(Number(spec.classId))) {
          classIds.push(Number(spec.classId));
        }
        if (spec.activeAbilityId != null) {
          activeAbilityId = Number(spec.activeAbilityId);
        }
        if (spec.passiveAbilityId != null && !passiveAbilityIds.includes(Number(spec.passiveAbilityId))) {
          passiveAbilityIds.push(Number(spec.passiveAbilityId));
        }
      }
    }

    const rawItemInputs =
      Array.isArray(hInput.itemObjects) && hInput.itemObjects.length > 0
        ? hInput.itemObjects
        : (hInput.items || []);
    const equippedItemObjs = [];
    rawItemInputs.forEach((it, itemIdx) => {
      if (it == null) return;
      const isObj = typeof it === 'object';
      const itemId = Number(isObj ? (it.itemId ?? it.id) : it);
      if (!Number.isFinite(itemId)) return;
      const hasExplicitUid = isObj && it.uid != null;
      const itemUid = hasExplicitUid ? String(it.uid) : `${uid}_item_${itemId}_${itemIdx}`;
      const progress = isObj && it.progress != null ? Number(it.progress) || 0 : 0;
      const completed = isObj ? !!it.completed : false;
      const customStacks =
        isObj && it.customStacks != null
          ? Number(it.customStacks) || 0
          : Number(hInput.itemCustomStacks?.[itemId] ?? hInput.customStacks ?? 0) || 0;
      equippedItemObjs.push({
        uid: itemUid,
        hasExplicitUid,
        itemId,
        progress,
        completed,
        customStacks,
        _addedClass: false,
      });
    });

    const itemIds = equippedItemObjs.map((it) => it.itemId);
    const rankModIds = (hInput.rankModifierIds || []).filter((x) => x != null);

    const isBenched = hInput.benched === true || hInput.onBoard === false || (hInput.x != null && hInput.x < 0);
    const unit = createUnitObject({
      uid,
      team: 1,
      defId: heroId,
      name: heroDef.name || `Hero ${heroId}`,
      isHero: true,
      rank,
      maxItemSlots: hInput.maxItemSlots || rank,
      guildId: heroDef.guildId || 0,
      classIds,
      baseStats: { ...(heroDef.stats || {}), ...(hInput.stats || {}) },
      attackType: heroDef.attackType || 'Melee',
      projectileSpeed: heroDef.projectileSpeed || 6.0,
      activeAbilityId,
      passiveAbilityIds,
      specializationId: specId,
      items: itemIds,
      rankModifierIds: rankModIds,
      x: hInput.x ?? hInput.col ?? (idx % BOARD_WIDTH),
      y: hInput.y ?? hInput.row ?? Math.min(3, Math.floor(idx / BOARD_WIDTH)),
      startHpPercent: hInput.startHpPercent ?? 1.0,
    });
    unit.maxItemSlots = hInput.maxItemSlots || rank;
    unit.isBenched = isBenched;

    // Apply permanent / bonus stats from run state if provided
    const bonusStats = hInput.bonusStats || hInput.permanentBonuses || {};
    for (const [st, val] of Object.entries(bonusStats)) {
      if (Number.isFinite(Number(val)) && Number(val) !== 0) {
        addStatBonus(unit, st, Number(val), false, 'const', data);
      }
    }

    // Check if any equipped item adds a class before rank scaling
    for (const itemObj of equippedItemObjs) {
      const itemDef = data?.items?.[itemObj.itemId] || data?.items?.[String(itemObj.itemId)];
      if (!itemDef) continue;
      for (const eff of [...(itemDef.effects || []), ...(itemDef.specialEffects || [])]) {
        for (const act of eff.actions || []) {
          if ((act.type === 'AddHeroClassAction' || act.type === 'AddHeroClassOrModifyStatPercentAction') && act.ClassId) {
            const cid = Number(act.ClassId);
            if (!unit.classIds.includes(cid)) {
              unit.classIds.push(cid);
              itemObj._addedClass = true;
            }
          }
        }
      }
    }

    // Apply HeroesSingleton rank scaling
    applyHeroRankScaling(unit, data);

    function registerItemQuestIfPresent(itemObj) {
      const itemDef = data?.items?.[itemObj.itemId] || data?.items?.[String(itemObj.itemId)];
      if (!itemDef?.quest) return;
      const qEff = itemDef.quest.effect || itemDef.quest;
      const goal = Math.max(1, Number(qEff.requiredProgress ?? itemDef.quest.goal ?? 1));
      const isDone = !!itemObj.completed || itemObj.progress >= goal;
      questStates.push({
        kind: 'item',
        uid: itemObj.uid,
        hasExplicitUid: itemObj.hasExplicitUid,
        id: itemObj.itemId,
        ownerUid: unit.uid,
        effect: {
          ...qEff,
          _ownerUid: unit.uid,
          _origin: 'ItemQuest',
          _itemId: itemObj.itemId,
          _triggerCount: 0,
        },
        progress: isDone ? Math.max(goal, itemObj.progress) : Math.max(0, itemObj.progress),
        goal,
        completed: isDone,
        completedFromStart: isDone,
        rewardActivated: false,
      });
    }

    if (isBenched) {
      benchUnits.push(unit);
      unitByUid.set(unit.uid, unit);

      for (const itemObj of equippedItemObjs) {
        const itemDef = data?.items?.[itemObj.itemId] || data?.items?.[String(itemObj.itemId)];
        if (Array.isArray(itemDef?.statMods)) {
          for (const sm of itemDef.statMods) {
            addStatBonus(unit, sm.stat, Number(sm.value) || 0, !!sm.percent, 'const', data);
          }
        }
        registerItemQuestIfPresent(itemObj);
      }
      recalculateStats(unit, data);

      // Register ReserveOnlyModularEffect / Backup RankModifier effects
      for (const rmId of rankModIds) {
        const rmDef = data?.rankModifiers?.[rmId] || data?.rankModifiers?.[String(rmId)];
        if (!rmDef) continue;
        const allRmEffs = [...(rmDef.effects || []), ...(rmDef.specialEffects || [])];
        const hasExplicitReserveEff = allRmEffs.some((e) => e.type === 'ReserveOnlyModularEffect');
        const isBackupRm = (rmDef.tags || []).includes('Backup') || /\[Backup\]|<backup>/i.test(rmDef.description || '');
        for (const eff of allRmEffs) {
          if (eff.type === 'ReserveOnlyModularEffect' || (!hasExplicitReserveEff && isBackupRm)) {
            activeEffects.push({ ...eff, _ownerUid: unit.uid, _origin: 'RankModifier', _rmId: rmId });
          }
        }
      }

      // Register Backup PassiveAbility effects
      for (const paId of passiveAbilityIds) {
        const paDef = data?.passiveAbilities?.[paId] || data?.passiveAbilities?.[String(paId)];
        if (!paDef) continue;
        const isBackupPa =
          (paDef.tags || []).includes('Backup') ||
          /\[Backup|<backup>/i.test(paDef.description || '') ||
          [...(paDef.effects || []), ...(paDef.specialEffects || [])].some((e) => e.type === 'ReserveOnlyModularEffect');
        if (isBackupPa) {
          const paEffs = buildPassiveAbilityEffects(paId, unit, data);
          for (const eff of paEffs) activeEffects.push(eff);
        }
      }
      return;
    }

    units.push(unit);
    unitByUid.set(unit.uid, unit);

    // Register Item statMods + non-quest Item effects + Item Quests
    for (const itemObj of equippedItemObjs) {
      const itemId = itemObj.itemId;
      const itemDef = data?.items?.[itemId] || data?.items?.[String(itemId)];
      if (!itemDef) continue;

      if (Array.isArray(itemDef.statMods)) {
        for (const sm of itemDef.statMods) {
          addStatBonus(unit, sm.stat, Number(sm.value) || 0, !!sm.percent, 'const', data);
        }
      }

      const builtItemEffects = buildItemEffects(itemId, unit, data, itemObj.customStacks);
      for (const eff of builtItemEffects) {
        activeEffects.push({
          ...eff,
          _itemUid: itemObj.uid,
          _addedClass: !!itemObj._addedClass,
        });
      }

      registerItemQuestIfPresent(itemObj);
    }

    // Register RankModifier effects (skip ReserveOnlyModularEffect when deployed on board)
    for (const rmId of rankModIds) {
      const rmDef = data?.rankModifiers?.[rmId] || data?.rankModifiers?.[String(rmId)];
      if (!rmDef) continue;
      for (const eff of [...(rmDef.effects || []), ...(rmDef.specialEffects || [])]) {
        if (eff.type === 'ReserveOnlyModularEffect') continue;
        activeEffects.push({ ...eff, _ownerUid: unit.uid, _origin: 'RankModifier', _rmId: rmId });
      }
    }

    // Register PassiveAbility effects (skip Backup-only passives when deployed on board)
    for (const paId of passiveAbilityIds) {
      const paDef = data?.passiveAbilities?.[paId] || data?.passiveAbilities?.[String(paId)];
      const isBackupOnly = paDef && /\[Backup Only\]/i.test(paDef.description || '');
      if (isBackupOnly) continue;
      const paEffs = buildPassiveAbilityEffects(paId, unit, data);
      for (const eff of paEffs) {
        if (eff.type === 'ReserveOnlyModularEffect') continue;
        activeEffects.push(eff);
      }
    }
  });

  // 2. Initialize Enemy Units (team = 2)
  const FIGHT_MODE_FALLBACK_ENEMIES = {
    105001: {
      id: 105001,
      name: 'Mimic',
      attackType: 'Melee',
      activeAbilityId: 106,
      passiveAbilityId: null,
      startWithActiveAbility: true,
      scalingId: 1,
      stats: { MaxHealth: 2800, BaseAttackDamage: 65, BaseAttackSpeed: 0.65, Defense: 35, AttackRange: 1, MoveSpeed: 1.5, MaxMana: 100, ManaRegen: 5 },
    },
    105101: {
      id: 105101,
      name: 'Swamp Giant',
      attackType: 'Melee',
      activeAbilityId: 101,
      passiveAbilityId: 110,
      startWithActiveAbility: true,
      scalingId: 1,
      stats: { MaxHealth: 4500, BaseAttackDamage: 85, BaseAttackSpeed: 0.5, Defense: 50, AttackRange: 1, MoveSpeed: 1.3, MaxMana: 100, ManaRegen: 5 },
    },
    105201: {
      id: 105201,
      name: 'Crab',
      attackType: 'Melee',
      activeAbilityId: 106,
      passiveAbilityId: null,
      startWithActiveAbility: true,
      scalingId: 1,
      stats: { MaxHealth: 3200, BaseAttackDamage: 60, BaseAttackSpeed: 0.6, Defense: 65, AttackRange: 1, MoveSpeed: 1.4, MaxMana: 100, ManaRegen: 5 },
    },
  };

  enemies.forEach((eInput, idx) => {
    if (!eInput) return;
    let enemyId = Number(eInput.enemyId ?? eInput.id ?? eInput.defId ?? 1001);
    if (eInput.autoScaleDifficulty && sim.difficulty >= 2 && enemyId >= 100000 && enemyId < 200000) {
      const tier = Math.min(3, Math.floor(sim.difficulty));
      const candidateId = tier * 100000 + (enemyId % 100000);
      if (data?.enemies?.[candidateId] || data?.enemies?.[String(candidateId)]) {
        enemyId = candidateId;
      }
    }
    const enemyDef =
      data?.enemies?.[enemyId] ||
      data?.enemies?.[String(enemyId)] ||
      FIGHT_MODE_FALLBACK_ENEMIES[enemyId] || {
        id: enemyId,
        name: `Enemy ${enemyId}`,
        stats: { MaxHealth: 400, BaseAttackDamage: 20, BaseAttackSpeed: 0.5, Defense: 10, AttackRange: 1, MoveSpeed: 1.5 },
      };
    const uid = String(eInput.uid || `enemy_${enemyId}_${idx}`);
    const passiveIds =
      eInput.passiveAbilityId !== undefined
        ? (eInput.passiveAbilityId != null ? [Number(eInput.passiveAbilityId)] : [])
        : (enemyDef.passiveAbilityId != null ? [Number(enemyDef.passiveAbilityId)] : []);
    const hasStartActive =
      enemyDef.startWithActiveAbility !== false || sim.difficulty >= 2 || eInput.unlockActiveAbility === true;
    const enemyActiveId =
      eInput.activeAbilityId !== undefined
        ? eInput.activeAbilityId
        : hasStartActive
          ? (enemyDef.activeAbilityId ?? null)
          : null;

    // Ensure enemies spawn in rows 4..7 if y was in 0..3
    const rawY = eInput.y ?? eInput.row ?? (4 + Math.min(3, Math.floor(idx / BOARD_WIDTH)));
    const unit = createUnitObject({
      uid,
      team: 2,
      defId: enemyId,
      name: enemyDef.name || `Enemy ${enemyId}`,
      isHero: false,
      rank: 1,
      classIds: [],
      baseStats: { ...(enemyDef.stats || {}), ...(eInput.stats || {}) },
      attackType: enemyDef.attackType || 'Melee',
      projectileSpeed: enemyDef.projectileSpeed || 5.0,
      activeAbilityId: enemyActiveId,
      passiveAbilityIds: passiveIds,
      x: eInput.x ?? eInput.col ?? (idx % BOARD_WIDTH),
      y: rawY,
    });

    // Apply floor scaling (`e(N) = N * (0.43092 + 0.07815 * N)`)
    const eFloor = eInput.floor ?? floor ?? 0;
    const eEndlessIdx = eInput.endlessFloorIndex ?? eInput.scalingAmount ?? endlessFloorIndex;
    applyEnemyFloorScaling(unit, enemyDef.scalingId, eFloor, data, eEndlessIdx);

    units.push(unit);
    unitByUid.set(unit.uid, unit);

    for (const paId of passiveIds) {
      const paEffs = buildPassiveAbilityEffects(paId, unit, data);
      for (const eff of paEffs) activeEffects.push(eff);
    }
  });

  // 3. Register Player Relics, Relic Quests & Enemy Relics
  const rawRelicInputs =
    Array.isArray(relicObjects) && relicObjects.length > 0 ? relicObjects : (relics || []);
  rawRelicInputs.forEach((rInput, rIdx) => {
    if (rInput == null) return;
    const isObj = typeof rInput === 'object';
    const rId = Number(isObj ? (rInput.relicId ?? rInput.id) : rInput);
    if (!Number.isFinite(rId)) return;
    const hasExplicitUid = isObj && rInput.uid != null;
    const rUid = hasExplicitUid ? String(rInput.uid) : `relic_${rId}_${rIdx}`;
    const hasExplicitProgress = isObj && rInput.progress != null;
    const progress = hasExplicitProgress ? Number(rInput.progress) || 0 : 0;
    const completed = isObj ? !!rInput.completed : false;
    const customStacks = isObj && rInput.customStacks != null ? Number(rInput.customStacks) || 0 : 0;

    for (const eff of buildRelicEffects(rId, data, false, customStacks)) {
      activeEffects.push({ ...eff, _relicUid: rUid });
    }

    const rDef = data?.relics?.[rId] || data?.relics?.[String(rId)];
    if (rDef?.quest) {
      const qEff = rDef.quest.effect || rDef.quest;
      const goal = Math.max(1, Number(qEff.requiredProgress ?? rDef.quest.goal ?? 1));
      let initProg = progress;
      if (!hasExplicitProgress && qEff.Trigger === 'OnShopReroll' && sim.rerollsThisGame > 0) {
        initProg = sim.rerollsThisGame;
      }
      const isDone = completed || initProg >= goal;
      questStates.push({
        kind: 'relic',
        uid: rUid,
        hasExplicitUid,
        id: rId,
        ownerUid: null,
        effect: {
          ...qEff,
          _ownerUid: null,
          _origin: 'RelicQuest',
          _relicId: rId,
          _triggerCount: 0,
        },
        progress: isDone ? Math.max(goal, initProg) : Math.max(0, initProg),
        goal,
        completed: isDone,
        completedFromStart: isDone,
        rewardActivated: false,
      });
    }
  });

  for (const erInput of enemyRelics || []) {
    const isObj = typeof erInput === 'object' && erInput !== null;
    const rId = isObj ? (erInput.relicId ?? erInput.id) : erInput;
    if (rId == null) continue;
    const customStacks = isObj && erInput.customStacks != null ? Number(erInput.customStacks) || 0 : 0;
    for (const eff of buildRelicEffects(rId, data, true, customStacks)) {
      activeEffects.push(eff);
    }
  }

  function activateQuestRewards(q, { fromStart = false } = {}) {
    if (!q || q.rewardActivated) return;
    q.rewardActivated = true;
    const owner = q.ownerUid ? sim.getUnit(q.ownerUid) : null;
    if (q.kind === 'item' && owner?.isBenched) return;

    const rewardEffs = buildQuestRewardEffects(q.kind, q.id, owner, data);
    for (const rEff of rewardEffs) {
      rEff._triggerCount = 0;
      rEff._intervalTimer = Number(rEff.EffectInterval) || 1.0;
      rEff._stallFired = false;

      if (rEff.Trigger === 'OnAcquire') {
        if (!fromStart) {
          executeModularEffect(sim, rEff, { source: owner }, 'combat');
        }
        continue;
      }

      activeEffects.push(rEff);

      if (!fromStart) {
        if (rEff.Trigger === 'Constant') {
          if (rEff.Keyword === 'Rush') {
            if (sim.isRushActive(owner, rEff.RushDuration || 10)) {
              executeModularEffect(sim, rEff, { source: owner }, 'temp');
            }
          } else if (rEff.Keyword === 'Stall') {
            if (sim.isStallReached(owner, rEff.StallDuration || 15)) {
              rEff._stallFired = true;
              executeModularEffect(sim, rEff, { source: owner }, 'combat');
            }
          } else {
            executeModularEffect(sim, rEff, { source: owner }, 'const');
          }
        } else if (rEff.Trigger === 'OnCombatStart') {
          executeModularEffect(sim, rEff, { source: owner }, 'combat');
        } else if (rEff.Trigger === 'PerFrameEvaluation') {
          if (
            (!rEff.Keyword || rEff.Keyword === 'None') ||
            (rEff.Keyword === 'Rush' && sim.isRushActive(owner, rEff.RushDuration || 10)) ||
            (rEff.Keyword === 'Stall' && sim.isStallReached(owner, rEff.StallDuration || 15))
          ) {
            executeModularEffect(sim, rEff, { source: owner }, 'temp');
          }
        }
      }
    }

    if (!fromStart) {
      for (let i = 0; i < units.length; i++) {
        if (units[i].hp > 0) recalculateStats(units[i], data);
      }
    }
  }

  function evaluateQuests(triggerType, ctx = {}) {
    for (let i = 0; i < questStates.length; i++) {
      const q = questStates[i];
      if (q.completed) continue;
      const eff = q.effect;
      if (!eff || eff.Trigger !== triggerType) continue;

      const owner = q.ownerUid ? sim.getUnit(q.ownerUid) : null;
      if (q.kind === 'item' && owner?.isBenched && eff.AttachmentType !== 'Global') {
        continue;
      }

      if (eff.Keyword === 'Rush' && !sim.isRushActive(owner, eff.RushDuration || 10)) continue;
      if (eff.Keyword === 'Stall' && !sim.isStallReached(owner, eff.StallDuration || 15)) continue;

      if (!checkEffectAttachmentAndCondition(sim, eff, { ...ctx, _preCheck: false })) continue;

      const inc = Math.max(1, Number(eff.TriggerIncrement) || 1);
      eff._triggerCount = (eff._triggerCount || 0) + 1;
      if (eff._triggerCount % inc !== 0) continue;

      const actionType = eff.questAction || 'IncrementProgressByOne';
      let delta = 1;
      if (actionType === 'IncrementProgressByTriggerValue') {
        delta = Math.max(0, Math.round(Number(ctx.value ?? ctx.amount ?? 0)));
      }
      if (delta <= 0) continue;

      q.progress = Math.min(q.goal, q.progress + delta);
      if (q.progress >= q.goal && !q.completed) {
        q.completed = true;
        sim.emitEvent({
          type: 'questComplete',
          kind: q.kind,
          id: q.id,
          uid: q.uid,
          ownerUid: q.ownerUid ?? null,
        });
        activateQuestRewards(q, { fromStart: false });
      }
    }
  }

  // Activate rewards for any quest already completed prior to battle start
  for (const q of questStates) {
    if (q.completed) {
      activateQuestRewards(q, { fromStart: true });
    }
  }

  // Initialize internal timers on all activeEffects
  for (const eff of activeEffects) {
    eff._triggerCount = 0;
    eff._intervalTimer = Number(eff.EffectInterval) || 1.0;
    eff._stallFired = false;
  }

  // 4. Combat helper methods on `sim`
  sim.findClosestEnemy = function findClosestEnemy(unit) {
    const oppTeam = unit.team === 1 ? 2 : 1;
    const allOpps = sim.getAliveUnits(oppTeam);
    if (allOpps.length === 0) return null;

    // Filter out Stealthed enemies unless all enemies are Stealthed
    const visible = allOpps.filter((o) => (o.statuses?.Stealth || 0) <= 0);
    const candidates = visible.length > 0 ? visible : allOpps;

    if (unit.preferFarthestTarget) {
      return sim.findTargetByType(unit, 'FarthestEnemy');
    }

    let best = null;
    let bestHex = Infinity;
    let bestWorld = Infinity;
    for (const cand of candidates) {
      const hd = hexDistance(unit, cand);
      const wd = worldDistanceSq(unit, cand);
      if (hd < bestHex || (hd === bestHex && wd < bestWorld)) {
        bestHex = hd;
        bestWorld = wd;
        best = cand;
      }
    }
    return best;
  };

  sim.findTargetByType = function findTargetByType(unit, targetingType) {
    const isAlly = String(targetingType || '').includes('Ally');
    const targetTeam = isAlly ? unit.team : (unit.team === 1 ? 2 : 1);
    const list = sim.getAliveUnits(targetTeam).filter((u) => !isAlly || u.uid !== unit.uid);
    if (list.length === 0) return isAlly && unit.hp > 0 ? unit : null;

    const visible = isAlly ? list : list.filter((u) => (u.statuses?.Stealth || 0) <= 0);
    const pool = visible.length > 0 ? visible : list;

    switch (targetingType) {
      case 'FarthestEnemy':
      case 'FarthestAlly':
        return pool.slice().sort((a, b) => hexDistance(unit, b) - hexDistance(unit, a) || worldDistanceSq(unit, b) - worldDistanceSq(unit, a))[0];
      case 'LowestHealthEnemy':
      case 'LowestHealthAlly':
        return pool.slice().sort((a, b) => a.hp - b.hp)[0];
      case 'MostThreateningEnemy':
      case 'MostThreateningAlly':
        return pool.slice().sort((a, b) => getUnitStat(b, 'Attack') + getUnitStat(b, 'Magic') - (getUnitStat(a, 'Attack') + getUnitStat(a, 'Magic')))[0];
      case 'RandomEnemy':
      case 'RandomAlly':
        return prng.pick(pool);
      default:
        return sim.findClosestEnemy(unit);
    }
  };

  sim.teleportUnit = function teleportUnit(unit, prefX, prefY, opts = {}) {
    if (!unit || unit.hp <= 0) return;
    const fromX = unit.x;
    const fromY = unit.y;
    const dest = findNearestAvailableCell(prefX, prefY, units, BOARD_WIDTH, BOARD_HEIGHT, unit.uid);
    unit.cellX = dest.x;
    unit.cellY = dest.y;
    unit.x = dest.x;
    unit.y = dest.y;
    unit.nextCellX = null;
    unit.nextCellY = null;
    unit.moveProgress = 0;
    const w = cellToWorld(dest.x, dest.y);
    unit.worldX = w.x;
    unit.worldZ = w.z;
    sim.emitEvent({
      type: 'dash',
      sourceUid: unit.uid,
      fromX,
      fromY,
      toX: dest.x,
      toY: dest.y,
      moveKind: opts.moveKind || 'dash',
      abilityId: opts.abilityId ?? null,
      pullerUid: opts.pullerUid ?? null,
    });
  };

  sim.tauntAllEnemies = function tauntAllEnemies(taunter) {
    if (!taunter || taunter.hp <= 0) return;
    const oppTeam = taunter.team === 1 ? 2 : 1;
    for (const e of sim.getAliveUnits(oppTeam)) {
      e.targetUid = taunter.uid;
    }
  };

  sim.giveMana = function giveMana(unit, amount) {
    if (!unit || unit.hp <= 0 || unit.maxMana <= 0) return;
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) return;
    if (unit.manaLockTimer > 0) {
      unit.lockedMana = (unit.lockedMana || 0) + amt;
    } else {
      unit.mana = Math.min(unit.maxMana, (unit.mana || 0) + amt);
    }
  };

  sim.healUnit = function healUnit(source, target, rawAmount) {
    if (!target || target.hp <= 0 || target.state === 'Dead') return 0;
    let amt = Number(rawAmount) || 0;
    if (amt <= 0) return 0;
    if ((target.statuses?.AntiHeal || 0) > 0) {
      amt *= battleSingleton.AntiHealReductionFactor ?? 0.5;
    }
    const heal = Math.max(0, Math.round(amt));
    if (heal <= 0) return 0;
    const prevHp = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + heal);
    const actual = target.hp - prevHp;
    if (source) {
      source.combatStats.healingDone = (source.combatStats.healingDone || 0) + actual;
    }
    if (actual > 0) {
      sim.emitEvent({
        type: 'heal',
        sourceUid: source?.uid ?? target.uid,
        targetUid: target.uid,
        amount: actual,
        x: target.x,
        y: target.y,
      });
    }
    return actual;
  };

  sim.applyShield = function applyShield(source, target, rawAmount, duration = 10.0, extraCtx = {}) {
    if (!target || target.hp <= 0 || target.state === 'Dead') return 0;
    let amt = Number(rawAmount) || 0;
    if (source?._shieldAmp) amt *= 1 + source._shieldAmp;
    if (target._shieldAmp && source?.uid !== target.uid) amt *= 1 + target._shieldAmp;
    const shieldAmt = Math.round(amt);
    if (shieldAmt <= 0) return 0;

    target.shieldBatches.push({
      amount: shieldAmt,
      remaining: Math.max(0.5, Number(duration) || 10.0),
    });
    target.shield = (target.shield || 0) + shieldAmt;
    target.statuses.Shield = target.shield;

    if (source) {
      source.combatStats.shieldGranted = (source.combatStats.shieldGranted || 0) + shieldAmt;
    }

    sim.emitEvent({
      type: 'shield',
      sourceUid: source?.uid ?? target.uid,
      targetUid: target.uid,
      amount: shieldAmt,
      duration,
      x: target.x,
      y: target.y,
    });

    const shCtx = {
      source,
      target,
      status: 'Shield',
      amount: shieldAmt,
      value: shieldAmt,
      ...extraCtx,
    };
    sim.fireTrigger('OnShieldApplied', shCtx);
    sim.fireTrigger('OnStatusStacksApplied', shCtx);
    return shieldAmt;
  };
  sim.grantShield = sim.applyShield;

  sim.applyStatus = function applyStatus(source, target, statusName, rawAmount = 1, duration = null, extraCtx = {}) {
    if (!target || target.hp <= 0 || target.state === 'Dead' || !statusName) return;
    let amount = Math.round(Number(rawAmount) || 1);
    if (source?._debuffAmp && ['Burn', 'Frost', 'Poison', 'Bleed'].includes(statusName)) {
      amount = Math.max(1, Math.round(amount * (1 + source._debuffAmp)));
    }
    if (amount <= 0) return;

    switch (statusName) {
      case 'Stun': {
        const rawStunRes = Number(target.stats?.StunResistance) || 0;
        const normStunRes = rawStunRes > 1 ? rawStunRes / 100 : rawStunRes;
        const resist = Math.min(
          0.85,
          normStunRes +
            (target.statusTimers.stunResistRemaining > 0
              ? (statusSingleton.StunResistanceBonusAmount ?? 0.25)
              : 0)
        );
        const baseDur =
          Number(duration) ||
          (Number(rawAmount) > 0 && Number(rawAmount) !== 1 ? Number(rawAmount) : 0) ||
          statusSingleton.StunDuration ||
          1.5;
        const dur = baseDur * (1 - resist);
        if (dur > 0.05) {
          target.statusTimers.stunRemaining = Math.max(target.statusTimers.stunRemaining || 0, dur);
          target.statuses.Stun = target.statusTimers.stunRemaining;
        }
        break;
      }
      case 'Stealth': {
        const dur = Number(duration) || 3.0;
        target.statuses.Stealth = 1;
        target.statusTimers.stealthRemaining = Math.max(target.statusTimers.stealthRemaining || 0, dur);
        // Enemies currently targeting a newly stealthed unit re-target
        for (const u of units) {
          if (u.team !== target.team && u.targetUid === target.uid) {
            u.targetUid = null;
          }
        }
        break;
      }
      case 'DamageImmunity': {
        const dur = Number(duration) || 2.0;
        target.statuses.DamageImmunity = 1;
        target.statusTimers.immunityRemaining = Math.max(target.statusTimers.immunityRemaining || 0, dur);
        break;
      }
      case 'AntiHeal': {
        const dur = Number(duration) || 4.0;
        target.statuses.AntiHeal = 1;
        target.statusTimers.antiHealRemaining = Math.max(target.statusTimers.antiHealRemaining || 0, dur);
        break;
      }
      case 'Burn':
      case 'Poison':
      case 'Frost':
      case 'Bleed': {
        target.statuses[statusName] = (target.statuses[statusName] || 0) + amount;
        if (statusName === 'Frost') {
          recalculateStats(target, data);
        }
        break;
      }
      default:
        target.statuses[statusName] = (target.statuses[statusName] || 0) + amount;
        break;
    }

    sim.emitEvent({
      type: 'status',
      sourceUid: source?.uid ?? null,
      targetUid: target.uid,
      status: statusName,
      amount,
      stacks: target.statuses[statusName],
      x: target.x,
      y: target.y,
    });

    sim.fireTrigger('OnStatusStacksApplied', {
      source,
      target,
      status: statusName,
      amount,
      value: amount,
      ...extraCtx,
    });
  };

  sim.getAutoAttackDamage = function getAutoAttackDamage(unit) {
    const baseAd = Math.max(1, unit.stats?.BaseAttackDamage || 25);
    const ad = unit.stats?.Attack || 0;
    return baseAd * Math.max(0.1, 1 + ad / 100);
  };

  sim.dealDamageWithMeta = function dealDamageWithMeta(source, target, rawDamage, opts = {}) {
    if (!target || target.hp <= 0 || target.state === 'Dead') {
      return { dealt: 0, isCrit: false, shieldAbsorbed: 0 };
    }
    if ((target.statuses?.DamageImmunity || 0) > 0 && !opts.ignoresImmunity) {
      return { dealt: 0, isCrit: false, shieldAbsorbed: 0 };
    }

    const origin = opts.origin || 'attack';
    const damageType = opts.damageType || 'physical';
    const canCrit = !!opts.canCrit;
    const isTrue = damageType === 'true' || opts.isTrueDamage === true;

    let dmg = Math.max(0, Number(rawDamage) || 0);
    if (dmg <= 0) return { dealt: 0, isCrit: false, shieldAbsorbed: 0 };

    // DamageAmp bonus on attacker
    if (source && (origin === 'attack' || origin === 'ability')) {
      const amp = source.stats?.DamageAmp || 0;
      if (amp !== 0) dmg *= Math.max(0.1, 1 + amp / 100);
    }

    let bonusCrit = Number(opts.bonusCrit) || 0;
    if (!opts._inTrigger && source && (origin === 'attack' || origin === 'ability')) {
      const dmgCtx = {
        source,
        target,
        origin,
        damageType,
        canCrit,
        bonusCrit: 0,
        _isDamageDealingContext: true,
      };
      sim.fireTrigger('OnDamageDealingContext', dmgCtx);
      bonusCrit += Number(dmgCtx.bonusCrit) || 0;
    }

    // Crit roll
    let isCrit = false;
    if (canCrit && source) {
      const critStat = (source.stats?.Crit || 0) + bonusCrit;
      if (prng.chance(Math.min(100, critStat))) {
        isCrit = true;
        // Base 1.5x crit multiplier + 0.01x per Crit above 100
        const critMult = 1.5 + Math.max(0, critStat - 100) * 0.01;
        dmg *= critMult;
      }
    }

    const preMitigation = Math.max(1, Math.round(dmg));

    // Hyperbolic Defense mitigation: 100 / (100 + Defense)
    if (!isTrue && origin !== 'status' && origin !== 'storm') {
      const def = target.stats?.Defense || 0;
      const mult = def >= 0 ? 100 / (100 + def) : 2 - 100 / (100 - def);
      dmg *= mult;
    }

    const finalDamage = Math.max(1, Math.round(dmg));
    const mitigated = Math.max(0, preMitigation - finalDamage);

    // FIFO Shield absorption
    let remaining = finalDamage;
    let shieldAbsorbed = 0;
    if (!opts.ignoresShield && target.shield > 0 && target.shieldBatches.length > 0) {
      for (let i = 0; i < target.shieldBatches.length && remaining > 0; i++) {
        const b = target.shieldBatches[i];
        const take = Math.min(b.amount, remaining);
        b.amount -= take;
        remaining -= take;
        shieldAbsorbed += take;
      }
      target.shieldBatches = target.shieldBatches.filter((b) => b.amount > 0);
      target.shield = target.shieldBatches.reduce((sum, b) => sum + b.amount, 0);
      target.statuses.Shield = target.shield;
    }

    if (remaining > 0) {
      target.hp = Math.max(0, target.hp - remaining);
    }

    if (source) {
      source.combatStats.damageDealt = (source.combatStats.damageDealt || 0) + finalDamage;
      // OmniVamp healing
      const omni = source.stats?.OmniVamp || 0;
      if (omni > 0 && finalDamage > 0 && source.hp > 0) {
        sim.healUnit(source, source, (finalDamage * omni) / 100);
      }
    }
    target.combatStats.damageTaken = (target.combatStats.damageTaken || 0) + finalDamage;
    target.combatStats.damageMitigated =
      (target.combatStats.damageMitigated || 0) + mitigated + shieldAbsorbed;

    sim.emitEvent({
      type: 'damage',
      sourceUid: source?.uid ?? null,
      targetUid: target.uid,
      amount: finalDamage,
      rawAmount: preMitigation,
      mitigated,
      shieldAbsorbed,
      crit: isCrit,
      isCrit,
      origin,
      damageType,
      x: target.x,
      y: target.y,
    });

    // Fire damage & crit triggers (guarded against infinite recursion)
    if (!opts._inTrigger) {
      const trigCtx = {
        source,
        target,
        amount: finalDamage,
        value: finalDamage,
        shieldAbsorbed,
        origin,
        isCrit,
        status: damageType === 'burn' ? 'Burn' : damageType === 'poison' ? 'Poison' : null,
      };
      if (isCrit) sim.fireTrigger('OnGlobalCrit', trigCtx);
      if (shieldAbsorbed > 0) {
        sim.fireTrigger('OnShieldRemovedFromDamage', {
          ...trigCtx,
          amount: shieldAbsorbed,
          value: shieldAbsorbed,
        });
      }
      sim.fireTrigger('OnDamageDealt', trigCtx);
      sim.fireTrigger('OnDamageReceived', trigCtx);
      if (origin === 'attack') {
        sim.fireTrigger('OnAttackDamageDealt', trigCtx);
        sim.fireTrigger('OnAttackDamageReceived', trigCtx);
      } else if (origin === 'ability') {
        sim.fireTrigger('OnAbilityDamageDealt', trigCtx);
        sim.fireTrigger('OnAbilityDamageReceived', trigCtx);
      } else if (origin === 'status') {
        sim.fireTrigger('OnStatusDamageReceived', trigCtx);
      }
    }

    if (target.hp <= 0 && target.state !== 'Dead') {
      handleUnitDeath(target, source);
    }

    return { dealt: finalDamage, isCrit, shieldAbsorbed };
  };

  sim.dealDamage = function dealDamage(source, target, rawDamage, opts = {}) {
    return sim.dealDamageWithMeta(source, target, rawDamage, opts).dealt;
  };

  function handleUnitDeath(unit, killer) {
    if (!unit || unit.state === 'Dead') return;
    unit.hp = 0;
    unit.state = 'Dead';
    unit.shield = 0;
    unit.shieldBatches = [];
    unit.nextCellX = null;
    unit.nextCellY = null;

    if (killer) {
      killer.combatStats.kills = (killer.combatStats.kills || 0) + 1;
    }

    sim.emitEvent({
      type: 'death',
      uid: unit.uid,
      targetUid: unit.uid,
      sourceUid: killer?.uid ?? null,
      killerUid: killer?.uid ?? null,
      team: unit.team,
      x: unit.x,
      y: unit.y,
    });

    sim.fireTrigger('OnCharacterKilled', { source: killer, target: unit });
  }

  sim.spawnAbilityProjectileOrHit = function spawnAbilityProjectileOrHit(source, target, damage, speed = 6.0, opts = {}) {
    if (!source || !target) return;
    const dist = hexDistance(source, target);
    if ((dist <= 1 && !opts.forceProjectile) || speed <= 0) {
      sim.dealDamage(source, target, damage, opts);
      if (opts.onHitStatus) {
        sim.applyStatus(source, target, opts.onHitStatus.status, opts.onHitStatus.amount);
      }
      return;
    }
    const id = nextProjId++;
    const effSpeed = dist <= 1 ? Math.max(7.5, Number(speed) || 8.0) : Math.max(2.5, Number(speed) || 6.0);
    projectiles.push({
      id,
      uid: id,
      sourceUid: source.uid,
      targetUid: target.uid,
      team: source.team,
      x: source.x,
      y: source.y,
      fromX: source.x,
      fromY: source.y,
      toX: target.x,
      toY: target.y,
      speed: effSpeed,
      damage,
      kind: opts.damageType || 'magic',
      vfxKind: opts.vfxKind || 'ability_proj',
      abilityId: opts.abilityId ?? source.activeAbilityId ?? null,
      isAbility: true,
      opts,
    });
    sim.emitEvent({
      type: 'projectile',
      id,
      sourceUid: source.uid,
      targetUid: target.uid,
      fromX: source.x,
      fromY: source.y,
      toX: target.x,
      toY: target.y,
      speed: effSpeed,
      vfxKind: opts.vfxKind || 'ability_proj',
      abilityId: opts.abilityId ?? source.activeAbilityId ?? null,
      isAbility: true,
    });
  };

  sim.spawnAoeZone = function spawnAoeZone(source, centerUnit, aoeAssetRef, duration, effectsList) {
    if (!Array.isArray(effectsList) || effectsList.length === 0) return;
    const aoeEntry = aoeAssetRef ? data?.aoe?.[aoeAssetRef] : null;
    const cx = centerUnit?.x ?? source?.x ?? 3;
    const cy = centerUnit?.y ?? source?.y ?? 3;
    const dur = Math.max(0.2, Number(duration) || 3.0);
    const zoneEffects = effectsList.map((e) => {
      const iv = Math.max(0.1, Number(e.EffectInterval) || 1.0);
      return {
        ...e,
        _ownerUid: source?.uid ?? null,
        _intervalTimer: 0.01, // fire first tick almost immediately
        _ticksRemaining: Math.max(1, Math.floor((dur + 0.001) / iv)),
      };
    });
    const id = nextAoeId++;
    aoes.push({
      id,
      sourceUid: source?.uid ?? null,
      team: source?.team ?? 1,
      abilityId: source?.activeAbilityId ?? null,
      aoeAssetRef: aoeAssetRef || '',
      x: cx,
      y: cy,
      aoeEntry,
      totalDuration: dur,
      remainingDuration: dur,
      effects: zoneEffects,
    });
    sim.emitEvent({
      type: 'aoe',
      id,
      sourceUid: source?.uid ?? null,
      team: source?.team ?? 1,
      abilityId: source?.activeAbilityId ?? null,
      aoeAssetRef: aoeAssetRef || '',
      x: cx,
      y: cy,
      duration: dur,
      aoeEntry,
    });
  };

  sim.fireTrigger = function fireTrigger(triggerType, ctx = {}) {
    if (sim._firingTriggerDepth > 4) return;
    sim._firingTriggerDepth = (sim._firingTriggerDepth || 0) + 1;
    try {
      const effectCount = activeEffects.length;
      for (let i = 0; i < effectCount; i++) {
        const eff = activeEffects[i];
        if (!eff || eff.Trigger !== triggerType) continue;
        const effOwner = sim.getUnit(eff._ownerUid) || (eff._origin === 'EnemyRelic' ? { team: 2 } : null);
        if (eff.Keyword === 'Rush' && !sim.isRushActive(effOwner, eff.RushDuration || 10)) continue;
        if (eff.Keyword === 'Stall' && !sim.isStallReached(effOwner, eff.StallDuration || 15)) continue;

        if (!checkEffectAttachmentAndCondition(sim, eff, { ...ctx, _preCheck: true })) continue;

        const inc = Math.max(1, Number(eff.TriggerIncrement) || 1);
        eff._triggerCount = (eff._triggerCount || 0) + 1;
        if (eff._triggerCount % inc !== 0) continue;

        executeModularEffect(sim, eff, ctx);
      }

      evaluateQuests(triggerType, ctx);
    } finally {
      sim._firingTriggerDepth--;
    }
  };

  // 5. Evaluate initial Constant effects (non-Stall, non-Rush)
  for (const eff of activeEffects) {
    if (eff.Trigger === 'Constant' && (!eff.Keyword || eff.Keyword === 'None')) {
      executeModularEffect(sim, eff, {}, 'const');
    }
  }

  // Finalize starting HP and StartingMana after Constant stats are applied
  for (const u of units) {
    recalculateStats(u, data);
    u.hp = Math.max(1, Math.round(u.maxHp * (u.startHpPercent ?? 1.0)));
    u.mana = Math.min(u.maxMana, Math.max(0, Math.round(u.stats.StartingMana || 0)));
  }

  // Fire OnCombatStart and initial Rush triggers
  sim.fireTrigger('OnCombatStart', {});
  sim.fireTrigger('OnRushStart', {});
  sim.fireTrigger('OnRushOrStallTriggered', {});

  sim.activeEffects = activeEffects;
  sim.questStates = questStates;
  sim.evaluateFramePassives = function evaluateFramePassives(previewTime = null) {
    if (previewTime != null && Number.isFinite(Number(previewTime))) {
      state.time = Math.max(0, Number(previewTime));
    }
    for (let i = 0; i < units.length; i++) {
      if (units[i].hp > 0) resetTemporaryBonuses(units[i]);
    }
    for (let i = 0; i < benchUnits.length; i++) {
      resetTemporaryBonuses(benchUnits[i]);
    }
    for (let i = 0; i < activeEffects.length; i++) {
      const eff = activeEffects[i];
      const owner = eff._ownerUid ? sim.getUnit(eff._ownerUid) : null;
      if (eff._ownerUid && (!owner || owner.hp <= 0)) continue;
      const timingUnit = owner || (eff._origin === 'EnemyRelic' ? { team: 2 } : null);

      if (eff.Keyword === 'Rush') {
        if (sim.isRushActive(timingUnit, eff.RushDuration || 10)) {
          if (eff.Trigger === 'Constant' || eff.Trigger === 'PerFrameEvaluation') {
            executeModularEffect(sim, eff, { source: owner }, 'temp');
          }
        }
        continue;
      }
      if (eff.Keyword === 'Stall') {
        if (sim.isStallReached(timingUnit, eff.StallDuration || 15)) {
          if (!eff._stallFired) {
            eff._stallFired = true;
            sim.fireTrigger('OnStallStart', { source: owner });
            sim.fireTrigger('OnRushOrStallTriggered', { source: owner });
            if (eff.Trigger === 'Constant') {
              executeModularEffect(sim, eff, { source: owner }, 'combat');
            }
          }
          if (eff.Trigger === 'PerFrameEvaluation') {
            executeModularEffect(sim, eff, { source: owner }, 'temp');
          }
        }
        continue;
      }
      if (eff.Trigger === 'PerFrameEvaluation') {
        executeModularEffect(sim, eff, { source: owner }, 'temp');
      }
    }
    for (let i = 0; i < units.length; i++) {
      if (units[i].hp > 0) recalculateStats(units[i], data);
    }
    for (let i = 0; i < benchUnits.length; i++) {
      recalculateStats(benchUnits[i], data);
    }
  };

  // 6. Main Simulation Tick (dt = 0.032s)
  function tick(dt = FIXED_DT) {
    state.events = [];
    if (over) return state;

    state.time = +(state.time + dt).toFixed(6);
    state.frame += 1;

    // --- System 1: TemporaryEffectsSystem & EffectsUpdateSystem ---
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.hp <= 0) continue;
      resetTemporaryBonuses(u);
    }

    if (!sim._baseStallFired && sim.isStallReached(null, 15)) {
      sim._baseStallFired = true;
      const hasDefaultStallEffect = activeEffects.some((e) => e.Keyword === 'Stall' && (e.StallDuration || 15) === 15);
      if (!hasDefaultStallEffect) {
        sim.stallTriggersThisGame++;
        sim.fireTrigger('OnStallStart', {});
        sim.fireTrigger('OnRushOrStallTriggered', {});
      }
    }

    for (let i = 0; i < activeEffects.length; i++) {
      const eff = activeEffects[i];
      const owner = eff._ownerUid ? sim.getUnit(eff._ownerUid) : null;
      if (eff._ownerUid && (!owner || owner.hp <= 0)) continue;
      const timingUnit = owner || (eff._origin === 'EnemyRelic' ? { team: 2 } : null);

      if (eff.Keyword === 'Rush') {
        if (sim.isRushActive(timingUnit, eff.RushDuration || 10)) {
          if (eff.Trigger === 'Constant' || eff.Trigger === 'PerFrameEvaluation') {
            executeModularEffect(sim, eff, { source: owner }, 'temp');
          } else if (eff.Trigger === 'OnInterval') {
            eff._intervalTimer -= dt;
            if (eff._intervalTimer <= 0) {
              eff._intervalTimer = Math.max(0.1, Number(eff.EffectInterval) || 1.0);
              executeModularEffect(sim, eff, { source: owner }, 'combat');
            }
          }
        }
        continue;
      }

      if (eff.Keyword === 'Stall') {
        if (sim.isStallReached(timingUnit, eff.StallDuration || 15)) {
          if (!eff._stallFired) {
            eff._stallFired = true;
            sim.stallTriggersThisGame++;
            sim.fireTrigger('OnStallStart', { source: owner });
            sim.fireTrigger('OnRushOrStallTriggered', { source: owner });
            if (eff.Trigger === 'Constant') {
              executeModularEffect(sim, eff, { source: owner }, 'combat');
            }
          }
          if (eff.Trigger === 'PerFrameEvaluation') {
            executeModularEffect(sim, eff, { source: owner }, 'temp');
          } else if (eff.Trigger === 'OnInterval') {
            eff._intervalTimer -= dt;
            if (eff._intervalTimer <= 0) {
              eff._intervalTimer = Math.max(0.1, Number(eff.EffectInterval) || 1.0);
              executeModularEffect(sim, eff, { source: owner }, 'combat');
            }
          }
        }
        continue;
      }

      if (eff.Trigger === 'PerFrameEvaluation') {
        executeModularEffect(sim, eff, { source: owner }, 'temp');
      } else if (eff.Trigger === 'OnInterval') {
        eff._intervalTimer -= dt;
        if (eff._intervalTimer <= 0) {
          eff._intervalTimer = Math.max(0.1, Number(eff.EffectInterval) || 1.0);
          executeModularEffect(sim, eff, { source: owner }, 'combat');
        }
      }
    }

    evaluateQuests('PerFrameEvaluation', {});

    // Timed ability effects
    for (let i = timedEffects.length - 1; i >= 0; i--) {
      const te = timedEffects[i];
      te.remaining -= dt;
      if (te.remaining <= 0) {
        if (te.clearSalPermafrostOnExpire) {
          const ownerUnit = sim.getUnit(te.eff._ownerUid);
          if (ownerUnit) ownerUnit._salPermafrost = null;
        }
        timedEffects.splice(i, 1);
      } else if ((te.eff.actions && te.eff.actions.length > 0) || typeof te.eff.customRun === 'function') {
        executeModularEffect(sim, te.eff, { source: sim.getUnit(te.eff._ownerUid) }, 'temp');
      }
    }

    for (let i = 0; i < units.length; i++) {
      if (units[i].hp > 0) recalculateStats(units[i], data);
    }

    // --- System 2: StatusUpdateSystem & Health Regen ---
    const burnInterval = statusSingleton.BurnDamageInterval ?? 1.0;
    const poisonInterval = statusSingleton.PoisonDamageInterval ?? 2.0;
    const frostInterval = statusSingleton.FrostDissipationInterval ?? 2.0;
    const burnPerStack = statusSingleton.BurnDamagePerStack ?? 1;
    const poisonPerStack = statusSingleton.PoisonDamagePerStack ?? 1;

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.hp <= 0 || u.state === 'Dead') continue;

      // Poison tick
      if ((u.statuses.Poison || 0) > 0) {
        u.statusTimers.poisonTick -= dt;
        if (u.statusTimers.poisonTick <= 0) {
          u.statusTimers.poisonTick = poisonInterval;
          const pDmg = u.statuses.Poison * poisonPerStack;
          sim.dealDamage(null, u, pDmg, { origin: 'status', damageType: 'poison', canCrit: false });
          if (u.hp <= 0) continue;
        }
      }

      // Burn tick (1 dmg/stack every 1.0s + -1 stack decay)
      if ((u.statuses.Burn || 0) > 0) {
        u.statusTimers.burnTick -= dt;
        if (u.statusTimers.burnTick <= 0) {
          u.statusTimers.burnTick = burnInterval;
          const bDmg = u.statuses.Burn * burnPerStack;
          sim.dealDamage(null, u, bDmg, { origin: 'status', damageType: 'burn', canCrit: false });
          u.statuses.Burn = Math.max(0, u.statuses.Burn - 1);
          if (u.hp <= 0) continue;
        }
      }

      // Frost dissipation every 2.0s
      if ((u.statuses.Frost || 0) > 0) {
        u.statusTimers.frostTick -= dt;
        if (u.statusTimers.frostTick <= 0) {
          u.statusTimers.frostTick = frostInterval;
          if (sim.frostDealsDamage && u.team === 2) {
            sim.dealDamage(null, u, u.statuses.Frost, { origin: 'status', damageType: 'frost', canCrit: false });
          }
          u.statuses.Frost = Math.max(0, u.statuses.Frost - 1);
          recalculateStats(u, data);
          if (u.hp <= 0) continue;
        }
      }

      // Timed statuses (Stun, Stealth, DamageImmunity, AntiHeal, StunResistance)
      if (u.statusTimers.stunResistRemaining > 0) {
        u.statusTimers.stunResistRemaining = Math.max(0, u.statusTimers.stunResistRemaining - dt);
      }
      if ((u.statuses.Stun || 0) > 0) {
        u.statusTimers.stunRemaining -= dt;
        if (u.statusTimers.stunRemaining <= 0) {
          u.statuses.Stun = 0;
          u.statusTimers.stunRemaining = 0;
          u.statusTimers.stunResistRemaining = statusSingleton.StunResistanceBonusDuration ?? 15.0;
        }
      }
      if ((u.statuses.Stealth || 0) > 0) {
        u.statusTimers.stealthRemaining -= dt;
        if (u.statusTimers.stealthRemaining <= 0) {
          u.statuses.Stealth = 0;
          u.statusTimers.stealthRemaining = 0;
        }
      }
      if ((u.statuses.DamageImmunity || 0) > 0) {
        u.statusTimers.immunityRemaining -= dt;
        if (u.statusTimers.immunityRemaining <= 0) {
          u.statuses.DamageImmunity = 0;
          u.statusTimers.immunityRemaining = 0;
        }
      }
      if ((u.statuses.AntiHeal || 0) > 0) {
        u.statusTimers.antiHealRemaining -= dt;
        if (u.statusTimers.antiHealRemaining <= 0) {
          u.statuses.AntiHeal = 0;
          u.statusTimers.antiHealRemaining = 0;
        }
      }

      // Shield batch timers
      if (u.shieldBatches.length > 0) {
        let expiredAny = false;
        for (let s = u.shieldBatches.length - 1; s >= 0; s--) {
          u.shieldBatches[s].remaining -= dt;
          if (u.shieldBatches[s].remaining <= 0) {
            u.shieldBatches.splice(s, 1);
            expiredAny = true;
          }
        }
        if (expiredAny) {
          u.shield = u.shieldBatches.reduce((sum, b) => sum + b.amount, 0);
          u.statuses.Shield = u.shield;
        }
      }

      // HPPerSecond regeneration every 1.0s
      const hps = u.stats.HPPerSecond || 0;
      if (hps > 0 && u.hp < u.maxHp) {
        u.hpRegenTimer -= dt;
        if (u.hpRegenTimer <= 0) {
          u.hpRegenTimer = 1.0;
          sim.healUnit(u, u, hps);
        }
      }
    }

    // --- System 3: ManaRegenSystem ---
    const manaInterval = statusSingleton.GlobalManaRegenInterval ?? 2.0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.hp <= 0 || u.state === 'Dead' || u.maxMana <= 0) continue;

      if (u.manaLockTimer > 0) {
        u.manaLockTimer -= dt;
        if (u.manaLockTimer <= 0) {
          u.manaLockTimer = 0;
          if (u.lockedMana > 0) {
            u.mana = Math.min(u.maxMana, u.mana + u.lockedMana);
            u.lockedMana = 0;
          }
        }
      }

      if ((u.statuses.Stun || 0) <= 0) {
        u.manaRegenTimer -= dt;
        if (u.manaRegenTimer <= 0) {
          u.manaRegenTimer = manaInterval;
          const regen = Math.round(u.stats.ManaRegen || 0);
          if (regen > 0) sim.giveMana(u, regen);
        }
      }
    }

    // --- System 4 & 5: Targeting, Pathfinding & EntityFsmSystem ---
    const manaPerAttack = heroesSingleton.ManaGeneratedPerAttack ?? 5;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.hp <= 0 || u.state === 'Dead') continue;

      if ((u.statuses.Stun || 0) > 0) {
        u.state = 'Hurt';
        continue;
      }

      // Validate or acquire target
      let target = u.targetUid ? sim.getUnit(u.targetUid) : null;
      if (!target || target.hp <= 0 || target.state === 'Dead' || ((target.statuses?.Stealth || 0) > 0 && sim.getAliveUnits(target.team).some((o) => (o.statuses?.Stealth || 0) <= 0))) {
        target = sim.findClosestEnemy(u);
        u.targetUid = target?.uid ?? null;
      }
      if (!target) {
        u.state = 'Idle';
        continue;
      }

      // Update facing toward target
      if (target.x !== u.x) {
        u.facing = target.x >= u.x ? 1 : -1;
      }

      // Ultimate wind-up in progress: stay locked in the cast, resolve at the impact frame.
      if (u.castTimer > 0) {
        u.state = 'ActiveAbility';
        u.castTimer -= dt;
        if (u.castTimer <= 0) {
          u.castTimer = 0;
          executeActiveAbility(sim, u);
        }
        continue;
      }

      // Ultimate follow-through recovery: keep unit in ActiveAbility until the 3D skill animation completes.
      if ((u.postCastTimer || 0) > 0) {
        u.state = 'ActiveAbility';
        u.postCastTimer = Math.max(0, u.postCastTimer - dt);
        continue;
      }

      // Check ActiveAbility cast when mana is full
      if (u.activeAbilityId != null && u.maxMana > 0 && u.mana >= u.maxMana) {
        const timing = getAbilityTiming(u.activeAbilityId);
        const castTgt = timing.targetType ? (sim.findTargetByType(u, timing.targetType) || target) : target;
        if (castTgt) u.targetUid = castTgt.uid;
        u.state = 'ActiveAbility';
        u.mana = 0;
        u.lockedMana = 0;
        u.attackTimer = 0;
        u.castTimer = timing.windup;
        u.postCastTimer = Math.max(0.15, timing.totalDuration - timing.windup);
        u.manaLockTimer = Math.max(0.25, Number(u.stats.ManaLockTime) || 1.0) + timing.totalDuration;
        sim.emitEvent({
          type: 'castStart',
          sourceUid: u.uid,
          targetUid: (castTgt || target).uid,
          abilityId: u.activeAbilityId,
          vfxKind: timing.vfxKind,
          windup: timing.windup,
          totalDuration: timing.totalDuration,
          x: u.x,
          y: u.y,
          targetX: (castTgt || target).x,
          targetY: (castTgt || target).y,
        });
        continue;
      }

      // If currently mid-step between hex cells, continue interpolating movement
      if (u.nextCellX != null && u.nextCellY != null) {
        u.state = 'MoveToTarget';
        const stepSpeed = Math.max(0.4, u.stats.MoveSpeed || 1.5);
        u.moveProgress += dt * stepSpeed;
        if (u.moveProgress >= 1.0) {
          u.cellX = u.nextCellX;
          u.cellY = u.nextCellY;
          u.x = u.cellX;
          u.y = u.cellY;
          u.nextCellX = null;
          u.nextCellY = null;
          u.moveProgress = 0;
          // Re-evaluate closest enemy after completing hex step
          const closer = sim.findClosestEnemy(u);
          if (closer) {
            target = closer;
            u.targetUid = closer.uid;
          }
        } else {
          u.x = u.moveFromX + (u.nextCellX - u.moveFromX) * u.moveProgress;
          u.y = u.moveFromY + (u.nextCellY - u.moveFromY) * u.moveProgress;
          const w = cellToWorld(u.x, u.y);
          u.worldX = w.x;
          u.worldZ = w.z;
          continue;
        }
        const w = cellToWorld(u.x, u.y);
        u.worldX = w.x;
        u.worldZ = w.z;
      }

      const dist = hexDistanceCoords(u.cellX, u.cellY, target.cellX, target.cellY);
      const atkRange = Math.max(1, Math.round(u.stats.AttackRange || 1));

      if (dist <= atkRange) {
        // In attack range -> Attack state
        u.state = 'Attack';
        u.attackTimer += dt * u.attacksPerSecond;
        if (u.attackTimer >= 1.0) {
          u.attackTimer -= 1.0;

          // Bleed deals 1 dmg/stack on attack
          if ((u.statuses.Bleed || 0) > 0) {
            const bleedDmg = u.statuses.Bleed * (statusSingleton.BleedDamagePerStack ?? 1);
            sim.dealDamage(null, u, bleedDmg, { origin: 'status', damageType: 'bleed', canCrit: false });
            if (u.hp <= 0) continue;
          }

          // Generate mana on attack
          sim.giveMana(u, manaPerAttack);

          const isRanged = u.attackType === 'Ranged' || atkRange > 1;
          sim.emitEvent({
            type: 'attack',
            sourceUid: u.uid,
            targetUid: target.uid,
            isRanged,
            x: u.x,
            y: u.y,
          });

          sim.fireTrigger('OnAutoAttack', { source: u, target });

          const autoDmg = sim.getAutoAttackDamage(u);
          if (isRanged && dist > 1) {
            const pid = nextProjId++;
            projectiles.push({
              id: pid,
              uid: pid,
              sourceUid: u.uid,
              targetUid: target.uid,
              team: u.team,
              x: u.x,
              y: u.y,
              fromX: u.x,
              fromY: u.y,
              toX: target.x,
              toY: target.y,
              speed: Math.max(3.0, u.projectileSpeed || 6.0),
              damage: autoDmg,
              kind: 'physical',
              opts: { origin: 'attack', damageType: 'physical', canCrit: true },
            });
            sim.emitEvent({
              type: 'projectile',
              id: pid,
              sourceUid: u.uid,
              targetUid: target.uid,
              fromX: u.x,
              fromY: u.y,
              toX: target.x,
              toY: target.y,
              speed: u.projectileSpeed || 6.0,
            });
          } else {
            performAutoAttackHit(u, target, autoDmg);
          }
        }
      } else {
        // Out of range -> find next hex step via backwards multi-source Dijkstra
        const step = findNextStep(u, target, units, BOARD_WIDTH, BOARD_HEIGHT);
        if (step) {
          u.state = 'MoveToTarget';
          u.moveFromX = u.cellX;
          u.moveFromY = u.cellY;
          u.nextCellX = step.x;
          u.nextCellY = step.y;
          u.moveProgress = 0;
        } else {
          u.state = 'Idle';
        }
      }
    }

    // --- System 6: ProjectileSystem & AreaOfEffectSystem ---
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const tgt = sim.getUnit(p.targetUid);
      const src = sim.getUnit(p.sourceUid);
      if (tgt && tgt.hp > 0) {
        p.toX = tgt.x;
        p.toY = tgt.y;
      }
      const dx = p.toX - p.x;
      const dy = p.toY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 0.15) {
        projectiles.splice(i, 1);
        if (tgt && tgt.hp > 0) {
          if (p.opts?.origin === 'attack') {
            performAutoAttackHit(src, tgt, p.damage);
          } else {
            sim.dealDamage(src, tgt, p.damage, p.opts);
            if (p.opts?.onHitStatus) {
              sim.applyStatus(src, tgt, p.opts.onHitStatus.status, p.opts.onHitStatus.amount);
            }
          }
        }
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }

    for (let i = aoes.length - 1; i >= 0; i--) {
      const zone = aoes[i];
      zone.remainingDuration -= dt;
      if (zone.remainingDuration <= 0) {
        aoes.splice(i, 1);
        continue;
      }
      const src = sim.getUnit(zone.sourceUid);
      for (const eff of zone.effects) {
        if (eff._ticksRemaining !== undefined && eff._ticksRemaining <= 0) continue;
        eff._intervalTimer -= dt;
        if (eff._intervalTimer <= 0) {
          eff._intervalTimer = Math.max(0.15, Number(eff.EffectInterval) || 1.0);
          if (eff._ticksRemaining !== undefined) eff._ticksRemaining -= 1;
          executeModularEffect(
            sim,
            eff,
            {
              source: src,
              aoeCenter: { x: zone.x, y: zone.y },
              aoeEntry: zone.aoeEntry,
            },
            'combat'
          );
        }
      }
    }

    // --- System 7: StormSystem & Riftbreaker ---
    if (!state.storm.active) {
      state.storm.timeUntilStart -= dt;
      if (state.storm.timeUntilStart <= 0) {
        state.storm.active = true;
        state.storm.timeUntilStart = 0;
        state.storm.tickTimer = battleSingleton.DamageInterval ?? 1.0;
        state.storm.damage = battleSingleton.DamagePerInterval ?? 5;
      }
    } else {
      state.storm.elapsedStorm += dt;
      state.storm.tickTimer -= dt;
      if (state.storm.tickTimer <= 0) {
        state.storm.tickTimer = battleSingleton.DamageInterval ?? 1.0;
        const curStormDmg = state.storm.damage;
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (u.hp <= 0 || u.state === 'Dead') continue;
          let d = curStormDmg;
          if (u.team === 1 && sim.heroStormDamageReduction > 0) {
            d = Math.max(0, Math.floor(d * (1 - sim.heroStormDamageReduction)));
          }
          if (d > 0) {
            sim.dealDamage(null, u, d, { origin: 'storm', damageType: 'true', canCrit: false });
          }
        }
        const expStart = battleSingleton.SecondsUntilExponentialStorm ?? 15.0;
        if (state.storm.elapsedStorm < expStart) {
          state.storm.damage += battleSingleton.DamageIncreasePerInterval ?? 5;
        } else {
          state.storm.damage = Math.floor(state.storm.damage * (battleSingleton.ExponentialIncreasePerInterval ?? 1.5));
        }
      }
    }

    if (sim.riftbreakerActive) {
      sim.riftbreakerTimer -= dt;
      if (sim.riftbreakerTimer <= 0) {
        sim.riftbreakerTimer = battleSingleton.RiftBreakerDamageInterval ?? 0.25;
        const pct = battleSingleton.RiftBreakerMaxHPPercentageDamage ?? 0.05;
        for (const e of sim.getAliveUnits(2)) {
          sim.dealDamage(null, e, Math.max(1, Math.round(e.maxHp * pct)), { origin: 'storm', damageType: 'true', canCrit: false });
        }
      }
    }

    // --- System 8: EndConditionSystem ---
    const alivePlayers = sim.getAliveUnits(1);
    const aliveEnemies = sim.getAliveUnits(2);

    if (sim.survivalDuration > 0 && state.time >= sim.survivalDuration && alivePlayers.length > 0) {
      over = true;
      winner = 'players';
    } else if (aliveEnemies.length === 0 && alivePlayers.length > 0) {
      over = true;
      winner = 'players';
    } else if (alivePlayers.length === 0 && aliveEnemies.length > 0) {
      over = true;
      winner = 'enemies';
    } else if (alivePlayers.length === 0 && aliveEnemies.length === 0) {
      over = true;
      winner = 'draw';
    } else if (state.time >= MAX_BATTLE_TIME) {
      over = true;
      winner = 'enemies';
    }

    if (over && winner === 'players') {
      for (const h of alivePlayers) {
        sim.fireTrigger('OnHeroCombatSurvived', { source: h, target: h });
      }
      sim.fireTrigger('OnCombatVictory', {});
    }

    return state;
  }

  function performAutoAttackHit(attacker, target, autoDmg) {
    if (!attacker || !target || target.hp <= 0) return;

    // BaseTrueDamage conversion & BonusTrueDamage addition
    const baseTruePct = Math.min(100, Math.max(0, attacker.stats?.BaseTrueDamage || 0)) / 100;
    const bonusTruePct = Math.max(0, attacker.stats?.BonusTrueDamage || 0) / 100;
    const physPart = autoDmg * (1 - baseTruePct);
    const truePart = autoDmg * (baseTruePct + bonusTruePct);

    if (physPart > 0) {
      sim.dealDamage(attacker, target, physPart, { origin: 'attack', damageType: 'physical', canCrit: true });
    }
    if (truePart > 0 && target.hp > 0) {
      sim.dealDamage(attacker, target, truePart, { origin: 'attack', damageType: 'true', canCrit: false });
    }

    // Sal Permafrost active buff: splash bonus magic damage & Frost to nearest enemy to target
    if (attacker._salPermafrost && target.hp > 0) {
      const sp = attacker._salPermafrost;
      const bonus = sp.baseDmg + getUnitStat(attacker, 'Magic') * sp.magicPct;
      const canCrit = attacker.specializationId === 2303;
      const splashTargets = [target];
      const near = sim.findTargetByType(target, 'NearestAlly');
      if (near && near.uid !== target.uid) splashTargets.push(near);
      for (const st of splashTargets) {
        sim.dealDamage(attacker, st, bonus, { origin: 'effect', damageType: 'magic', canCrit });
        sim.applyStatus(attacker, st, 'Frost', sp.frost);
      }
    }
  }

  function isOver() {
    return over;
  }

  function result() {
    const alivePlayers = sim.getAliveUnits(1);
    const aliveEnemies = sim.getAliveUnits(2);
    const resolvedWinner =
      winner ||
      (aliveEnemies.length === 0 && alivePlayers.length > 0
        ? 'players'
        : alivePlayers.length === 0 && aliveEnemies.length > 0
          ? 'enemies'
          : 'draw');

    const perUnit = {};
    const permanentGains = {};
    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    let totalDamageMitigated = 0;
    let totalHealingDone = 0;
    let totalShieldGranted = 0;

    for (const u of units) {
      perUnit[u.uid] = { ...u.combatStats };
      if (u.team === 1) {
        totalDamageDealt += u.combatStats.damageDealt || 0;
        totalDamageTaken += u.combatStats.damageTaken || 0;
        totalDamageMitigated += u.combatStats.damageMitigated || 0;
        totalHealingDone += u.combatStats.healingDone || 0;
        totalShieldGranted += u.combatStats.shieldGranted || 0;
        if (Object.keys(u.permanentGains).length > 0) {
          permanentGains[u.uid] = { ...u.permanentGains };
        }
      }
    }
    for (const u of benchUnits) {
      if (u.team === 1 && u.permanentGains && Object.keys(u.permanentGains).length > 0) {
        permanentGains[u.uid] = { ...u.permanentGains };
      }
    }

    const questProgress = { items: {}, relics: {} };
    for (const q of questStates) {
      const entry = {
        id: q.id,
        uid: q.uid,
        ownerUid: q.ownerUid ?? null,
        progress: q.progress,
        goal: q.goal,
        completed: q.completed,
      };
      const bucket = q.kind === 'item' ? questProgress.items : questProgress.relics;
      if (q.hasExplicitUid && q.uid != null) {
        bucket[q.uid] = entry;
      }
      if (bucket[q.id] == null || q.completed) {
        bucket[q.id] = entry;
      }
    }

    return {
      winner: resolvedWinner,
      survivors: alivePlayers.filter((u) => !u.isReinforcement).map((u) => u.uid),
      allSurvivors: alivePlayers.map((u) => ({
        uid: u.uid,
        heroId: u.defId,
        rank: u.rank,
        hp: u.hp,
        maxHp: u.maxHp,
        hpRatio: u.maxHp > 0 ? Math.max(0.25, u.hp / u.maxHp) : 1,
        items: u.items || [],
        specializationId: u.specializationId,
        rankModifierIds: u.rankModifierIds || [],
        isReinforcement: !!u.isReinforcement,
      })),
      shardsEarned: sim.shardsEarnedInBattle,
      itemsCreated: sim.itemsCreatedInBattle,
      bonusTeamSize: sim.bonusTeamSize,
      permanentGains,
      questProgress,
      stats: {
        duration: state.time,
        frames: state.frame,
        perUnit,
        totalDamageDealt,
        totalDamageTaken,
        totalDamageMitigated,
        totalHealingDone,
        totalShieldGranted,
      },
    };
  }

  function spawnReinforcements(survivorSpecs = [], partnerName = 'Allié') {
    if (over || !Array.isArray(survivorSpecs) || survivorSpecs.length === 0) return [];
    const spawned = [];
    const occupied = new Set(
      sim.getAliveUnits().map((u) => `${Math.round(u.x)},${Math.round(u.y)}`)
    );
    const findEmptyHexNear = (cx, cy, occ) => {
      for (let r = 0; r <= 5; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x >= 0 && x < 7 && y >= 0 && y < 8 && !occ.has(`${x},${y}`)) {
              return { x, y };
            }
          }
        }
      }
      return null;
    };

    for (let i = 0; i < survivorSpecs.length; i++) {
      const rInput = survivorSpecs[i];
      if (!rInput) continue;
      const heroId = Number(rInput.heroId ?? rInput.defId ?? rInput.id ?? 1);
      const heroDef = data?.heroes?.[heroId] || data?.heroes?.[String(heroId)] || {};
      const uid = `reinf_${rInput.uid || `${heroId}_${i}`}`;
      if (units.some((u) => u.uid === uid)) continue;

      const rank = Math.max(1, Math.min(4, Number(rInput.rank) || 1));
      const classIds = Array.isArray(heroDef.classIds) ? heroDef.classIds.map(Number) : [];
      let activeAbilityId = heroDef.startWithActiveAbility !== false ? (heroDef.activeAbilityId ?? null) : null;
      const passiveAbilityIds = heroDef.passiveAbilityId != null ? [Number(heroDef.passiveAbilityId)] : [];

      const specId = rInput.specializationId ?? rInput.specId ?? null;
      if (specId != null) {
        const spec = data?.specializations?.[specId] || data?.specializations?.[String(specId)];
        if (spec) {
          if (spec.classId != null && !classIds.includes(Number(spec.classId))) classIds.push(Number(spec.classId));
          if (spec.activeAbilityId != null) activeAbilityId = Number(spec.activeAbilityId);
          if (spec.passiveAbilityId != null && !passiveAbilityIds.includes(Number(spec.passiveAbilityId))) {
            passiveAbilityIds.push(Number(spec.passiveAbilityId));
          }
        }
      }

      const spot = findEmptyHexNear(2 + (i * 2) % 4, 5 + (i % 2), occupied) || { x: 1 + (i % 5), y: 6 };
      occupied.add(`${spot.x},${spot.y}`);

      const itemIds = (rInput.items || []).map((it) => Number(typeof it === 'object' ? (it.itemId ?? it.id) : it)).filter(Number.isFinite);
      const hpRatio = Math.max(0.35, Math.min(1.0, Number(rInput.hpRatio ?? 0.85)));

      const unit = createUnitObject({
        uid,
        team: 1,
        defId: heroId,
        name: `${heroDef.name || `Hero ${heroId}`} (${partnerName})`,
        isHero: true,
        rank,
        maxItemSlots: rank,
        guildId: heroDef.guildId || 0,
        classIds,
        baseStats: { ...(heroDef.stats || {}) },
        attackType: heroDef.attackType || 'Melee',
        projectileSpeed: heroDef.projectileSpeed || 6.0,
        activeAbilityId,
        passiveAbilityIds,
        specializationId: specId,
        items: itemIds,
        rankModifierIds: rInput.rankModifierIds || [],
        x: spot.x,
        y: spot.y,
        startHpPercent: hpRatio,
      });
      unit.isReinforcement = true;
      unit.partnerName = partnerName;

      applyHeroRankScaling(unit, data);
      for (const iid of itemIds) {
        const itemDef = data?.items?.[iid] || data?.items?.[String(iid)];
        if (itemDef && Array.isArray(itemDef.statMods)) {
          for (const sm of itemDef.statMods) {
            addStatBonus(unit, sm.stat, Number(sm.value) || 0, !!(sm.percent || sm.isPercent), 'const', data);
          }
        }
      }
      unit.hp = Math.max(1, Math.round(unit.maxHp * hpRatio));
      unit.mana = Math.min(unit.maxMana, Math.round((unit.maxMana || 100) * 0.4));
      units.push(unit);
      spawned.push(unit);

      sim.emitEvent({
        type: 'reinforcementSpawn',
        unitUid: unit.uid,
        heroId,
        name: unit.name,
        partnerName,
        x: unit.x,
        y: unit.y,
      });
    }
    return spawned;
  }

  sim.spawnReinforcements = spawnReinforcements;

  return {
    tick,
    state,
    isOver,
    result,
    sim,
    spawnReinforcements,
  };
}
