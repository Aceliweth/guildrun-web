// Active Ability execution and exact animation timings for all Hero and Enemy ActiveAbilities in game_data.json.

import { hexDistance, findNearestAvailableCell } from './hex.js';
import { addStatBonus, evaluateScalings, getUnitStat } from './stats.js';
import { executeModularEffect } from './effects.js';

// Exact per-ability wind-up (time from castStart to primary impact/spawn) and total animation lock duration
// derived from CharacterVisualConfig.AnimationSettings (SkillAttack Duration, Hit, FixedDuration, ActionTimestamps)
// and ActiveAbilitySheetHolder (Delay, movementDuration).
export const ABILITY_TIMINGS = {
  // --- Heroes ---
  1: { windup: 0.45, totalDuration: 1.15, vfxKind: 'irini_spear' }, // Irini: Gathering Storm
  2: { windup: 1.25, totalDuration: 2.25, vfxKind: 'hoyoung_snipe', targetType: 'FarthestEnemy' }, // Hoyoung: Killshot
  3: { windup: 0.28, totalDuration: 1.45, vfxKind: 'reyna_combo' }, // Reyna: Triple Threat
  4: { windup: 1.15, totalDuration: 2.45, vfxKind: 'ayaka_shuriken', targetType: 'LowestHealthEnemy' }, // Yuuna/Ayaka: Shuriken Shadow Strike
  5: { windup: 0.60, totalDuration: 1.95, vfxKind: 'selkhera_petrify' }, // Zuri/Selkhera: Petrification
  6: { windup: 0.50, totalDuration: 2.50, vfxKind: 'seraphael_barrage' }, // Aria/Seraphael: Requiem Barrage
  7: { windup: 0.65, totalDuration: 2.20, vfxKind: 'nyxa_flurry' }, // Nyx/Nyxa: Wild Flurry
  8: { windup: 0.50, totalDuration: 2.30, vfxKind: 'floeria_bloom' }, // Pollen/Floeria: Sanctuary of Bloom
  9: { windup: 1.15, totalDuration: 2.40, vfxKind: 'niklas_slam' }, // Niklas: Wheel and Deal
  10: { windup: 0.65, totalDuration: 2.00, vfxKind: 'fiona_shield' }, // Fiona: Vault Spark
  11: { windup: 1.10, totalDuration: 2.35, vfxKind: 'rook_fissure' }, // Rowan/Rook: Fault Line
  12: { windup: 0.55, totalDuration: 2.20, vfxKind: 'skorn_taunt' }, // Skorn: Come At Me!
  13: { windup: 0.85, totalDuration: 2.05, vfxKind: 'logan_leap' }, // Logan: Execution
  14: { windup: 1.20, totalDuration: 2.35, vfxKind: 'funke_molotov' }, // Funke: Wildfire
  15: { windup: 0.50, totalDuration: 1.95, vfxKind: 'tilly_spin' }, // Tilly: Pirouette
  16: { windup: 0.95, totalDuration: 2.15, vfxKind: 'gustav_blizzard' }, // Gustav: Blizzard
  17: { windup: 0.60, totalDuration: 1.85, vfxKind: 'ratna_starfall' }, // Ratna: Starfall
  18: { windup: 0.35, totalDuration: 1.00, vfxKind: 'cenk_roar' }, // Rip/Cenk: Rampage
  20: { windup: 0.73, totalDuration: 2.20, vfxKind: 'javryn_volley' }, // Karsu/Javryn: Snowpiercer
  21: { windup: 0.52, totalDuration: 2.20, vfxKind: 'ming_mantra' }, // Ming: Searing Mantra
  22: { windup: 0.50, totalDuration: 1.95, vfxKind: 'pimenta_spray' }, // Pimenta: Pepper Spray
  23: { windup: 0.50, totalDuration: 1.75, vfxKind: 'sal_permafrost' }, // Sal: Permafrost
  24: { windup: 0.35, totalDuration: 1.33, vfxKind: 'dragomir_devour' }, // Dragomir: Devour
  28: { windup: 1.45, totalDuration: 2.65, vfxKind: 'joey_slam' }, // Kai/Joey: Resolute Strike
  29: { windup: 0.85, totalDuration: 1.85, vfxKind: 'josephina_salvation' }, // Grace/Josephina: Salvation

  // --- Enemies & Bosses ---
  100: { windup: 0.50, totalDuration: 0.90, vfxKind: 'slime_cleanse' }, // Slime: Rejuvenating Blow
  101: { windup: 0.55, totalDuration: 1.33, vfxKind: 'golem_slam' }, // Forest Golem: Slam
  102: { windup: 0.85, totalDuration: 1.65, vfxKind: 'archer_snipe' }, // Mushroom Archer: Wild Shot
  103: { windup: 0.45, totalDuration: 1.10, vfxKind: 'healer_bloom' }, // Mushroom Healer
  104: { windup: 0.55, totalDuration: 1.15, vfxKind: 'frost_storm' }, // Mushroom Frost Mage: Frost Storm
  105: { windup: 0.55, totalDuration: 1.15, vfxKind: 'fire_storm' }, // Mushroom Fire Mage: Fire Storm
  106: { windup: 0.45, totalDuration: 1.05, vfxKind: 'tank_bash' }, // Mushroom Tank: Bash
  107: { windup: 0.65, totalDuration: 1.55, vfxKind: 'vine_hook', targetType: 'FarthestEnemy' }, // Plant Monster: Vine Snag
  108: { windup: 0.55, totalDuration: 1.55, vfxKind: 'spider_web', targetType: 'FarthestEnemy' }, // Spider: Ensnare
  109: { windup: 0.40, totalDuration: 1.17, vfxKind: 'snake_venom' }, // Snake: Noxious Venom
  110: { windup: 0.37, totalDuration: 1.00, vfxKind: 'lizard_bounce', targetType: 'LowestHealthEnemy' }, // Lizard: Bounce
  111: { windup: 0.45, totalDuration: 1.05, vfxKind: 'tank_bash' },
  112: { windup: 0.85, totalDuration: 1.65, vfxKind: 'archer_snipe' },
  113: { windup: 0.55, totalDuration: 1.15, vfxKind: 'frost_storm' },
  114: { windup: 0.55, totalDuration: 1.15, vfxKind: 'fire_storm' },
  115: { windup: 0.40, totalDuration: 1.17, vfxKind: 'snake_venom' },
  116: { windup: 0.55, totalDuration: 1.55, vfxKind: 'spider_web', targetType: 'FarthestEnemy' },
  117: { windup: 0.37, totalDuration: 1.00, vfxKind: 'lizard_bounce', targetType: 'LowestHealthEnemy' },
  118: { windup: 0.55, totalDuration: 1.15, vfxKind: 'frost_storm' },
  119: { windup: 0.55, totalDuration: 1.15, vfxKind: 'fire_storm' },
  20101: { windup: 1.15, totalDuration: 2.50, vfxKind: 'dragon_fire' }, // Fire Dragon: Flame Breath
  20102: { windup: 1.15, totalDuration: 2.50, vfxKind: 'dragon_frost' }, // Frost Dragon: Frost Breath
  20103: { windup: 1.15, totalDuration: 2.50, vfxKind: 'dragon_poison' }, // Poison Dragon: Poison Breath
  20104: { windup: 0.50, totalDuration: 1.33, vfxKind: 'demon_anger' }, // Demon Boss: Anger
  20105: { windup: 0.45, totalDuration: 1.33, vfxKind: 'hydra_bite' }, // Hydra: Venomous Bite
  30000: { windup: 0.45, totalDuration: 1.10, vfxKind: 'vine_root', targetType: 'FarthestEnemy' }, // Rank B Root
  30001: { windup: 0.45, totalDuration: 1.10, vfxKind: 'lizard_bounce', targetType: 'FarthestEnemy' }, // Rank B Jump to Backline
  30002: { windup: 0.55, totalDuration: 1.30, vfxKind: 'golem_slam' }, // Rank B Slam Attack
};

export const HERO_DEFAULT_ACTIVE_ABILITY = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  17: 17,
  18: 18,
  20: 20,
  21: 21,
  22: 22,
  23: 23,
  24: 24,
  26: 28,
  27: 29,
};

export function getAbilityTiming(abilityId, caster = null) {
  const id = Number(abilityId);
  const base = ABILITY_TIMINGS[id] || { windup: 0.6, totalDuration: 1.35, vfxKind: 'generic' };
  if (id === 28 && (caster?._boldSpec || caster?.specializationId === 2602)) {
    return {
      ...base,
      windup: Math.max(0.35, base.windup - 1.0),
      totalDuration: Math.max(1.0, base.totalDuration - 1.0),
    };
  }
  return base;
}

export function executeActiveAbility(sim, caster) {
  if (!caster) return false;
  let abId = caster.activeAbilityId;
  if (abId == null && caster.isHero) {
    const spec = caster.specializationId != null ? sim.data?.specializations?.[caster.specializationId] : null;
    abId = spec?.activeAbilityId ?? HERO_DEFAULT_ACTIVE_ABILITY[caster.defId] ?? null;
  } else if (caster.isHero && Number(abId) >= 101 && sim.data?.specializations?.[abId]) {
    const spec = sim.data.specializations[abId];
    abId = spec.activeAbilityId ?? HERO_DEFAULT_ACTIVE_ABILITY[caster.defId] ?? abId;
  }
  if (abId == null) return false;
  const ab = sim.data?.activeAbilities?.[abId] || sim.data?.activeAbilities?.[String(abId)];
  if (!ab) return false;

  const timing = getAbilityTiming(ab.id ?? abId, caster);
  let target = sim.getUnit(caster.targetUid) || sim.findClosestEnemy(caster);
  if (timing.targetType) {
    target = sim.findTargetByType(caster, timing.targetType) || target;
  }

  // Ally-targeting abilities (Fiona Vault Spark = 10, Grace Salvation = 29) pass lowest-% HP ally to OnAbilityCast
  let castEventTarget = target;
  if (ab.id === 10 || ab.id === 29) {
    const lowAlly = sim
      .getAliveUnits(caster.team)
      .sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp))[0];
    if (lowAlly) castEventTarget = lowAlly;
  }

  caster.combatStats.casts = (caster.combatStats.casts || 0) + 1;

  sim.emitEvent({
    type: 'cast',
    sourceUid: caster.uid,
    targetUid: castEventTarget?.uid ?? caster.uid,
    abilityId: ab.id,
    abilityName: ab.name,
    vfxKind: timing.vfxKind,
    windup: timing.windup,
    totalDuration: timing.totalDuration,
    x: caster.x,
    y: caster.y,
    targetX: castEventTarget?.x ?? caster.x,
    targetY: castEventTarget?.y ?? caster.y,
  });

  // Trigger OnAbilityCast effects
  sim.fireTrigger('OnAbilityCast', { source: caster, target: castEventTarget, abilityId: ab.id });

  // Execute any top-level serialized ModularEffects on the ability
  // (Skip OnInterval effects when AreaOfEffectAction is present in ab.actions, since AreaOfEffectAction spawns the zone with those effects)
  const hasAoeAction = Array.isArray(ab.actions) && ab.actions.some((a) => (a?.type || a?.$type) === 'AreaOfEffectAction');
  if (Array.isArray(ab.effects) && ab.effects.length > 0) {
    for (const eff of ab.effects) {
      if (hasAoeAction && eff?.Trigger === 'OnInterval') continue;
      executeModularEffect(sim, { ...eff, _ownerUid: caster.uid }, { source: caster, target: castEventTarget });
    }
  }

  const actions = ab.actions || [];
  let currentTarget = target;

  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    if (!act) continue;
    const type = act.type || act.$type;

    switch (type) {
      case 'SetTargetAbilityAction': {
        const nt = sim.findTargetByType(caster, act.targetingType || 'LowestHealthEnemy');
        if (nt) {
          currentTarget = nt;
          caster.targetUid = nt.uid;
        }
        break;
      }

      case 'VisuallyMoveToTargetAbilityAction':
      case 'AyakaMoveBehindTargetAbilityAction':
      case 'LizardInFrontOfTargetAbilityAction': {
        const tType = act.targetingType || act.TargetingType;
        const moveTgt = tType ? sim.findTargetByType(caster, tType) : currentTarget;
        if (moveTgt) {
          currentTarget = moveTgt;
          caster.targetUid = moveTgt.uid;
          const prefY = type === 'AyakaMoveBehindTargetAbilityAction' ? moveTgt.cellY + 1 : moveTgt.cellY - 1;
          const moveKind = type === 'LizardInFrontOfTargetAbilityAction' ? 'leap' : 'shadow_dash';
          sim.teleportUnit(caster, moveTgt.cellX, prefY, { moveKind, abilityId: ab.id });
        }
        break;
      }

      case 'HookFurthestEnemyAbilityAction': {
        const far = sim.findTargetByType(caster, 'FarthestEnemy');
        if (far) {
          currentTarget = far;
          caster.targetUid = far.uid;
          const dest = findNearestAvailableCell(caster.cellX, caster.cellY, sim.units, 7, 8, far.uid);
          sim.teleportUnit(far, dest.x, dest.y, { moveKind: 'vine_pull', pullerUid: caster.uid, abilityId: ab.id });
        }
        break;
      }

      case 'IriniSpearThrowAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const triggers = Math.max(1, sim.rushTriggersThisGame + sim.stallTriggersThisGame);
        const perTrig =
          (Number(act.baseDamagePerTrigger) || 10) +
          getUnitStat(caster, 'AttackSpeed') * (Number(act.attackSpeedScalingPercent) || 0.2) +
          getUnitStat(caster, 'Attack') * (Number(act.attackScalingPercent) || 0.1) +
          getUnitStat(caster, 'Magic') * (Number(act.magicScalingPercent) || 0.1);
        const dmg = perTrig * triggers;
        sim.spawnAbilityProjectileOrHit(caster, tgt, dmg, act.projectileSpeed || 6.0, {
          origin: 'ability',
          damageType: 'magic',
          canCrit: true,
          abilityId: ab.id,
          vfxKind: 'irini_spear',
          forceProjectile: true,
        });
        break;
      }

      case 'HoyoungAbilityAction': {
        const far = sim.findTargetByType(caster, 'FarthestEnemy') || currentTarget;
        if (!far) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 250, atkCfg.ExtraDamagePerRank || 0);
        let bonusCrit = getUnitStat(caster, 'Crit') + 50 * (caster.rank || 1);
        if ((caster._hunterCastsRemaining || 0) > 0) {
          caster._hunterCastsRemaining--;
          bonusCrit += 50 * (caster.rank || 1);
        }
        sim.spawnAbilityProjectileOrHit(caster, far, dmg, act.projectileSpeed || 12.0, {
          origin: 'ability',
          damageType: 'physical',
          canCrit: true,
          bonusCrit,
          abilityId: ab.id,
          vfxKind: 'hoyoung_snipe',
          forceProjectile: true,
        });
        break;
      }

      case 'ReynaAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const mult = Math.min(
          Number(act.maxPercent) || 5.0,
          1.0 +
            (getUnitStat(caster, 'Attack') * (Number(act.adScalingPercent) || 1.0)) / 100 +
            (getUnitStat(caster, 'Magic') * (Number(act.apScalingPercent) || 0.5)) / 100
        );
        const shieldPct = caster._brawlerSpec ? (Number(act.brawlerPercent) || 0.66) : (Number(act.shieldPercent) || 0.33);
        const baseAuto = sim.getAutoAttackDamage(caster);
        const hits = act.attacks?.attacks?.length || 3;
        for (let h = 0; h < hits; h++) {
          const hitTgt = tgt.hp > 0 ? tgt : sim.findClosestEnemy(caster);
          if (!hitTgt) break;
          sim.fireTrigger('OnAutoAttack', { source: caster, target: hitTgt });
          const dealt = sim.dealDamage(caster, hitTgt, baseAuto * mult, {
            origin: 'ability',
            damageType: 'physical',
            canCrit: true,
            abilityId: ab.id,
            comboHit: h + 1,
          });
          if (dealt > 0) {
            sim.applyShield(caster, caster, dealt * shieldPct, 999.0);
          }
        }
        break;
      }

      case 'AyakaDamageAction': {
        const low = sim.findTargetByType(caster, 'LowestHealthEnemy') || currentTarget;
        if (!low) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmgPerShuriken = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 150, atkCfg.ExtraDamagePerRank || 0);
        const crit = getUnitStat(caster, 'Crit');
        const thresh = Math.max(1, Number(act.critThreshold) || 40);
        const count = Math.min(
          Number(act.maxShurikens) || 10,
          (Number(act.baseShuriken) || 1) + (caster._extraShurikens || 0) + Math.floor(crit / thresh)
        );
        for (let s = 0; s < count; s++) {
          const shTgt = low.hp > 0 ? low : sim.findTargetByType(caster, 'LowestHealthEnemy');
          if (!shTgt) break;
          const bonusCrit = caster._nightshadeSpec && (shTgt.statuses?.Poison || 0) > 0 ? 150 : 0;
          sim.emitEvent({
            type: 'projectile',
            sourceUid: caster.uid,
            targetUid: shTgt.uid,
            fromX: caster.x,
            fromY: caster.y,
            toX: shTgt.x,
            toY: shTgt.y,
            speed: 9.0,
            vfxKind: 'ayaka_shuriken',
            abilityId: ab.id,
            isAbility: true,
          });
          sim.dealDamage(caster, shTgt, dmgPerShuriken, {
            origin: 'ability',
            damageType: 'physical',
            canCrit: true,
            bonusCrit,
            abilityId: ab.id,
          });
        }
        break;
      }

      case 'EffectAbilityAction': {
        // Zuri Petrification (ab.id === 5): ensure at least currentTarget is targeting Zuri if no enemy currently targets her
        if (ab.id === 5) {
          const enemyTeam = caster.team === 1 ? 2 : 1;
          const aliveEnemies = sim.getAliveUnits(enemyTeam);
          if (aliveEnemies.length > 0 && !aliveEnemies.some((e) => e.targetUid === caster.uid)) {
            const fallbackTgt = currentTarget || sim.findClosestEnemy(caster) || aliveEnemies[0];
            if (fallbackTgt) fallbackTgt.targetUid = caster.uid;
          }
        }
        const blocks = act.effectBlocks || [];
        for (const blk of blocks) {
          const dur = Number(blk.Duration) || 0;
          for (const eff of blk.Effects || []) {
            const wrapped = { ...eff, _ownerUid: caster.uid, _origin: 'ActiveAbility' };
            if (dur > 0 && dur < 500) {
              sim.addTimedEffect(wrapped, dur);
            } else {
              executeModularEffect(sim, wrapped, { source: caster, target: currentTarget }, 'combat');
            }
          }
        }
        // Sal Permafrost (ab.id === 23): "This ability stacks."
        if (ab.id === 23 && caster._salPermafrost) {
          caster._salPermafrostStacks = (caster._salPermafrostStacks || 0) + 1;
          const stacks = caster._salPermafrostStacks;
          caster._salPermafrost.frost *= stacks;
          caster._salPermafrost.baseDmg *= stacks;
          caster._salPermafrost.magicPct *= stacks;
        }
        break;
      }

      case 'SeraphaelAbilityAction': {
        let dur = Number(act.duration) || 2.5;
        if (caster._crescendoSpec) {
          if (sim.isStallReached(caster, 20)) dur += 1.0;
          if (sim.isStallReached(caster, 40)) dur += 1.0;
          if (sim.isStallReached(caster, 60)) dur += 1.0;
        }
        const effs = caster._harmonySpec && act.harmonyEffects?.length ? act.harmonyEffects : act.regularEffects;
        sim.spawnAoeZone(caster, currentTarget || caster, act.regularAoeEntry?.assetRef, dur, effs);
        break;
      }

      case 'NyxaAction': {
        const mult =
          (Number(act.percentDamage) || 1.0) +
          getUnitStat(caster, 'AttackSpeed') / ((Number(act.attackSpeedScalingInterval) || 2) * 100) +
          (getUnitStat(caster, 'Attack') + getUnitStat(caster, 'Magic')) / ((Number(act.attackAndMagicScalingInterval) || 3) * 100);
        const hits = act.attacks?.attacks?.length || 5;
        let comboTarget = currentTarget || sim.findClosestEnemy(caster);
        let recasts = 0;

        for (let h = 0; h < hits; h++) {
          if (!comboTarget || comboTarget.hp <= 0) {
            comboTarget = sim.findClosestEnemy(caster);
            if (!comboTarget) break;
          }
          const wasAlive = comboTarget.hp > 0;
          sim.fireTrigger('OnAutoAttack', { source: caster, target: comboTarget });
          sim.dealDamage(caster, comboTarget, sim.getAutoAttackDamage(caster) * mult, {
            origin: 'ability',
            damageType: 'physical',
            canCrit: true,
            abilityId: ab.id,
            comboHit: h + 1,
          });
          if (wasAlive && comboTarget.hp <= 0 && recasts < 1) {
            recasts++;
            const nextEnemy = sim.findClosestEnemy(caster);
            if (nextEnemy) {
              const dest = findNearestAvailableCell(nextEnemy.cellX, nextEnemy.cellY, sim.units, 7, 8, caster.uid);
              sim.teleportUnit(caster, dest.x, dest.y, { moveKind: 'shadow_dash', abilityId: ab.id });
              comboTarget = nextEnemy;
              h = -1; // restart 5-hit combo once
            }
          }
        }
        break;
      }

      case 'FloeriaAbilityAction': {
        let dur = Number(act.duration) || 5.0;
        const stall15 = sim.isStallReached(caster, 15);
        if (caster._bloomerSpec && stall15) dur += Number(act.bloomerDurationIncrease) || 1.0;
        let effs = stall15 && act.stallEffects?.length ? act.stallEffects : act.regularEffects;
        if (caster._bloomerSpec && stall15 && act.theBloomerEffects?.length) {
          effs = act.theBloomerEffects;
        } else if (caster._earthsChildSpec && sim.isStallReached(caster, 20) && act.earthsChildEffects?.length) {
          effs = act.earthsChildEffects;
        } else if (caster._faeKissSpec && sim.isStallReached(caster, 10) && act.faeKissEffects?.length) {
          effs = act.faeKissEffects;
        }
        if (caster._faeKissSpec && sim.isStallReached(caster, 30) && !caster._faeKissStall30Fired) {
          caster._faeKissStall30Fired = true;
          const mult = (33 * (caster.rank || 1)) / 100;
          for (const e of sim.getAliveUnits(caster.team === 1 ? 2 : 1)) {
            for (const st of ['Burn', 'Frost', 'Poison', 'Bleed']) {
              const cur = e.statuses?.[st] || 0;
              if (cur > 0) sim.applyStatus(caster, e, st, Math.max(1, Math.round(cur * mult)));
            }
          }
        }
        const aoeName = (stall15 && act.stallAoeEntry?.assetRef) || act.regularAoeEntry?.assetRef;
        sim.spawnAoeZone(caster, caster, aoeName, dur, effs);
        break;
      }

      case 'NiklasAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 225, atkCfg.ExtraDamagePerRank || 0);
        sim.dealDamage(caster, tgt, dmg, { origin: 'ability', damageType: 'physical', canCrit: true });
        sim.applyStatus(caster, tgt, 'Stun', 1, Number(act.baseStunDuration) || 3.0);
        const interval = Math.max(1, Number(act.castInterval ?? act.castsPerItem) || 4);
        const totalCasts = (caster._niklasCasts != null ? ++caster._niklasCasts : caster.combatStats.casts) || 0;
        if (totalCasts > 0 && totalCasts % interval === 0) {
          sim.itemsCreatedInBattle = (sim.itemsCreatedInBattle || 0) + 1;
        }
        break;
      }

      case 'FionaAction': {
        const sh = evaluateScalings(caster, act.shieldScalings, act.shieldAmount || 250);
        const dur = Number(act.duration) || 10.0;
        const inc = Math.max(1, Number(act.allyManaRegenIncrement) || 12);
        const count = (Number(act.baseAllies) || 1) + Math.floor(getUnitStat(caster, 'ManaRegen') / inc);
        const allies = sim
          .getAliveUnits(caster.team)
          .sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp))
          .slice(0, count);
        for (const a of allies) {
          sim.applyShield(caster, a, sh, dur);
        }
        const fionaCasts = (caster._fionaSpecCasts != null ? ++caster._fionaSpecCasts : caster.combatStats.casts) || 0;
        if (
          (caster.specializationId === 1001 || (caster.passiveAbilityIds || []).includes(101001)) &&
          fionaCasts > 0 &&
          fionaCasts % 5 === 0
        ) {
          sim.itemsCreatedInBattle = (sim.itemsCreatedInBattle || 0) + 1;
        }
        break;
      }

      case 'RookAction': {
        const aoeName = act.regularAoeEntry?.assetRef || 'RookAoeEntry';
        for (const eff of act.regularEffects || []) {
          executeModularEffect(
            sim,
            { ...eff, _ownerUid: caster.uid },
            {
              source: caster,
              target: currentTarget,
              aoeCenter: { x: caster.x, y: caster.y },
              aoeEntry: sim.data?.aoe?.[aoeName],
            }
          );
        }
        break;
      }

      case 'SkornShieldTauntAction': {
        sim.tauntAllEnemies(caster);
        const r = caster.rank || 1;
        const perStall =
          (Number(act.baseShieldPerStall) || 10) +
          getUnitStat(caster, 'Defense') * (Number(act.shieldDefensePercent) || 0.1) +
          getUnitStat(caster, 'Magic') * (Number(act.shieldMagicPercent) || 0.1);
        const sh = (Number(act.shieldsPerRank) || 100) * r + perStall * Math.max(1, sim.stallTriggersThisGame);
        sim.applyShield(caster, caster, sh, Number(act.duration) || 10.0);
        break;
      }

      case 'SkornShieldDamageAction': {
        const pct = Number(act.shieldPercentDamage) || 0.5;
        const dmg = (caster.shield || 0) * pct;
        if (dmg > 0) {
          for (const e of sim.getAliveUnits(caster.team === 1 ? 2 : 1)) {
            if (e.targetUid === caster.uid || hexDistance(caster, e) <= 2) {
              sim.dealDamage(caster, e, dmg, { origin: 'ability', damageType: 'magic', canCrit: true });
            }
          }
        }
        break;
      }

      case 'LoganAbilityAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 175, atkCfg.ExtraDamagePerRank || 0);
        const dealt = sim.dealDamage(caster, tgt, dmg, { origin: 'ability', damageType: 'physical', canCrit: true });
        const prevLoganDmg = caster._loganDamageDealt || 0;
        caster._loganDamageDealt = prevLoganDmg + dealt;
        if (!caster._loganT1Granted && caster._loganDamageDealt >= 200) {
          caster._loganT1Granted = true;
          addStatBonus(caster, 'Attack', 25, false, 'perm', sim.data);
        }
        if (!caster._loganT2Granted && caster._loganDamageDealt >= 400) {
          caster._loganT2Granted = true;
          addStatBonus(caster, 'Crit', 25, false, 'perm', sim.data);
        }
        if (caster._juggernautSpec && dealt > 0) {
          const shPct = (25 + 50 * (caster.rank || 1)) / 100;
          sim.applyShield(caster, caster, dealt * shPct, 999.0);
        }
        const aoeName = act.regularAoeEntry?.assetRef || 'LoganMediumAoeEntry';
        for (const eff of act.regularEffects || []) {
          executeModularEffect(
            sim,
            { ...eff, _ownerUid: caster.uid },
            {
              source: caster,
              target: tgt,
              aoeCenter: { x: tgt.x, y: tgt.y },
              aoeEntry: sim.data?.aoe?.[aoeName],
            }
          );
        }
        break;
      }

      case 'FunkeAbilityAction': {
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 175);
        const burn = Math.max(1, Math.round((Number(act.baseBurn) || 0) + getUnitStat(caster, 'Magic') * (Number(act.burnMagicMod) || 0.75)));
        const rng = getUnitStat(caster, 'AttackRange');
        const enemyTeam = caster.team === 1 ? 2 : 1;
        let hitEnemies = sim.getAliveUnits(enemyTeam).filter((e) => hexDistance(caster, e) <= rng + 1);
        if (hitEnemies.length === 0) {
          const fallback = currentTarget || sim.findClosestEnemy(caster);
          if (fallback) hitEnemies = [fallback];
        }
        const hasDetonator = caster.specializationId === 1403 || (caster.passiveAbilityIds || []).includes(101403);
        for (const e of hitEnemies) {
          const hadBurnBefore = (e.statuses?.Burn || 0) > 0;
          if (burn > 0) {
            sim.applyStatus(caster, e, 'Burn', burn);
          }
          if (hasDetonator && !hadBurnBefore && (e.statuses?.Burn || 0) > 0) {
            const ticks = 7 * (caster.rank || 1);
            sim.dealDamage(caster, e, e.statuses.Burn * ticks, { origin: 'status', damageType: 'burn', canCrit: false });
          }
          if (e.hp > 0) {
            sim.spawnAbilityProjectileOrHit(caster, e, dmg, act.projectileSpeed || 4.0, {
              origin: 'ability',
              damageType: 'magic',
              canCrit: true,
              abilityId: ab.id,
              vfxKind: 'funke_molotov',
              forceProjectile: true,
            });
          }
        }
        break;
      }

      case 'TillyAction': {
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 75);
        const rng = getUnitStat(caster, 'AttackRange');
        const enemyTeam = caster.team === 1 ? 2 : 1;
        let hitEnemies = sim.getAliveUnits(enemyTeam).filter((e) => hexDistance(caster, e) <= rng + 1);
        if (hitEnemies.length === 0) {
          const fallback = currentTarget || sim.findClosestEnemy(caster);
          if (fallback) hitEnemies = [fallback];
        }
        for (const e of hitEnemies) {
          sim.dealDamage(caster, e, dmg, { origin: 'ability', damageType: 'physical', canCrit: true });
        }
        break;
      }

      case 'GustavAbilityAction': {
        const dur = Number(act.duration) || 5.0;
        const effs = caster._glacierSpec && act.glacierEffects?.length ? act.glacierEffects : act.regularEffects;
        const centerUnit = caster._glacierSpec ? caster : (currentTarget || caster);
        sim.spawnAoeZone(caster, centerUnit, act.regularAoeEntry?.assetRef, dur, effs);
        break;
      }

      case 'RatnaAbilityAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 190);
        const targets = [tgt];
        if (caster._magnanimousSpec && (caster.combatStats.casts || 1) <= 1 + (caster.rank || 1)) {
          const low = sim.findTargetByType(caster, 'LowestHealthEnemy') || tgt;
          if (low) targets.push(low);
        }
        for (const t of targets) {
          if (t.hp <= 0) continue;
          const wasAlive = t.hp > 0;
          const res = sim.dealDamageWithMeta(caster, t, dmg, { origin: 'ability', damageType: 'magic', canCrit: true });
          if (res.isCrit) {
            const stunDur = 0.5 * (caster.rank || 1);
            for (const e of sim.getAliveUnits(caster.team === 1 ? 2 : 1)) {
              sim.applyStatus(caster, e, 'Stun', 1, stunDur);
            }
          }
          if (wasAlive && t.hp <= 0) {
            addStatBonus(caster, 'Magic', 10 * (caster.rank || 1), false, 'perm', sim.data);
          }
        }
        break;
      }

      case 'JavrynAction': {
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 25);
        const inc = Math.max(1, Number(act.shotAttackSpeedIncrement) || 50);
        const numShots = Math.min(
          Number(act.maxShots) || 14,
          (Number(act.numShots) || 5) + Math.floor(getUnitStat(caster, 'AttackSpeed') / inc)
        );
        const frostPerHit = (Number(act.baseFrost) || 3) + (Number(act.frostPerRank) || 2) * Math.max(0, (caster.rank || 1) - 1);
        const enemies = sim
          .getAliveUnits(caster.team === 1 ? 2 : 1)
          .sort((a, b) => hexDistance(caster, a) - hexDistance(caster, b));
        if (enemies.length === 0) break;
        const hasFallingSnow = caster.specializationId === 2001 || (caster.passiveAbilityIds || []).includes(102001);
        const bonusCrit = hasFallingSnow && sim.isStallReached(caster, 15) ? 33 * (caster.rank || 1) : 0;
        for (let s = 0; s < numShots; s++) {
          const e = enemies[s % enemies.length];
          if (e && e.hp > 0) {
            if (frostPerHit > 0) {
              sim.applyStatus(caster, e, 'Frost', frostPerHit);
            }
            sim.spawnAbilityProjectileOrHit(caster, e, dmg, act.projectileSpeed || 6.0, {
              origin: 'ability',
              damageType: 'physical',
              canCrit: true,
              bonusCrit,
              abilityId: ab.id,
              vfxKind: 'javryn_volley',
              forceProjectile: true,
            });
          }
        }
        break;
      }

      case 'MingAbilityAction': {
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 100, atkCfg.ExtraDamagePerRank || 100);
        const burn = (Number(act.burnPerRush) || 7) * Math.max(1, sim.rushTriggersThisGame);
        const stunDur = Number(act.stunDuration) || 3.0;
        const enemyTeam = caster.team === 1 ? 2 : 1;
        let hitList = sim.getAliveUnits(enemyTeam).filter((e) => hexDistance(caster, e) <= 1);
        if (hitList.length === 0) {
          const tgt = currentTarget || sim.findClosestEnemy(caster);
          if (tgt) hitList = [tgt];
        }
        for (const e of hitList) {
          sim.dealDamage(caster, e, dmg, { origin: 'ability', damageType: 'magic', canCrit: true });
          sim.applyStatus(caster, e, 'Burn', burn);
          sim.applyStatus(caster, e, 'Stun', 1, stunDur);
        }
        break;
      }

      case 'PimentaAbilityAction': {
        let dur = Number(act.duration) || 4.0;
        if (caster._seasonedSpec) dur += Number(act.seasonedDurationIncrease) || 1.0;
        const aoeName = caster._seasonedSpec ? act.seasonedAoeEntry?.assetRef : act.regularAoeEntry?.assetRef;
        const effs =
          sim.isStallReached(caster, 15) && Array.isArray(act.pepperSprayEffects) && act.pepperSprayEffects.length > 0
            ? act.pepperSprayEffects
            : act.regularEffects;
        sim.spawnAoeZone(caster, caster, aoeName, dur, effs);
        break;
      }

      case 'DragomirAction': {
        const isSanguine = caster.specializationId === 2402 || (caster.passiveAbilityIds || []).includes(102402);
        const tgt = (isSanguine ? sim.findTargetByType(caster, 'LowestHealthEnemy') : null) || currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        if (isSanguine) caster.targetUid = tgt.uid;
        const omniGain = 1 + getUnitStat(caster, 'Crit') * 0.1;
        addStatBonus(caster, 'OmniVamp', omniGain, false, 'combat', sim.data);
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 250);
        const wasAlive = tgt.hp > 0;
        const killX = tgt.x;
        const killY = tgt.y;
        sim.dealDamage(caster, tgt, dmg, { origin: 'ability', damageType: 'magic', canCrit: true });
        if (wasAlive && tgt.hp <= 0) {
          const rank = caster.rank || 1;
          let shards = 2 * rank; // [2+2_Rank] = 2 + 2*(rank-1) = 2*rank (2/4/6/8)
          if (caster.specializationId === 2401 || (caster.passiveAbilityIds || []).includes(102401)) {
            shards += 1 + rank; // The Greedy bonus shards on kill
          }
          sim.gainShards(shards, { source: caster, target: tgt, x: killX, y: killY });
          if (isSanguine) {
            sim.giveMana(caster, 60);
            sim.applyStatus(caster, caster, 'Stealth', 1, 4.0);
          }
        }
        break;
      }

      case 'JoeAbilityAction': {
        if (caster.specializationId === 2601 || (caster.passiveAbilityIds || []).includes(102601)) {
          caster._shieldAmp = (60 + getUnitStat(caster, 'Attack') * 0.25) / 100;
        }
        const sh =
          (Number(act.baseShield) || 300) +
          getUnitStat(caster, 'Attack') * (Number(act.shieldAttackScalingPercent) || 4.0) +
          getUnitStat(caster, 'Magic') * (Number(act.shieldMagicScalingPercent) || 2.5);
        sim.applyShield(caster, caster, sh, Number(act.shieldDuration) || 10.0);
        const aoeName = caster._boldSpec ? act.protectorAoeEntry?.assetRef : act.regularAoeEntry?.assetRef;
        const aoeEntry = sim.data?.aoe?.[aoeName];
        const enemyTeam = caster.team === 1 ? 2 : 1;
        const anyNear = sim.getAliveUnits(enemyTeam).some((e) => hexDistance(caster, e) <= (caster._boldSpec ? 3 : 2));
        const fallbackTgt = currentTarget || sim.findClosestEnemy(caster) || caster;
        const aoeCenter = anyNear ? { x: caster.x, y: caster.y } : { x: fallbackTgt.x, y: fallbackTgt.y };
        for (const eff of act.regularEffects || []) {
          executeModularEffect(
            sim,
            { ...eff, _ownerUid: caster.uid },
            {
              source: caster,
              target: currentTarget,
              aoeCenter,
              aoeEntry,
            }
          );
        }
        break;
      }

      case 'JosephinaAction': {
        const sh = evaluateScalings(caster, act.shieldScalings, act.baseShieldAmount || 125);
        const dur = (Number(act.shieldBaseDuration) || 6) * (1 + (getUnitStat(caster, 'ManaRegen') * (Number(act.mrShieldDurationPercent) || 0.25)) / 100);
        const healAmt = sh * (Number(act.healPercent) || 0.5);
        // After Stall(20), if a Hero is dead, resurrect them first!
        if (sim.isStallReached(caster, 20) && typeof sim.getDeadUnits === 'function') {
          const deadAllies = sim.getDeadUnits(caster.team);
          if (deadAllies.length > 0) {
            const revived = deadAllies[0];
            sim.resurrectUnit(caster, revived, healAmt);
            sim.applyShield(caster, revived, sh, dur);
            if (!caster._selflessSpec || !sim.isStallReached(caster, 10)) {
              break;
            }
          }
        }
        let recipients = [];
        if (caster._selflessSpec && sim.isStallReached(caster, 10)) {
          recipients = sim.getAliveUnits(caster.team);
        } else {
          const low = sim
            .getAliveUnits(caster.team)
            .sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp))[0];
          if (low) recipients = [low];
        }
        const hasBenevolent = caster.specializationId === 2702 || (caster.passiveAbilityIds || []).includes(102702);
        const canBenevolent =
          hasBenevolent &&
          sim.isStallReached(caster, 15) &&
          (caster._benevolentTriggers || 0) < 1 + (caster.rank || 1);
        if (canBenevolent && recipients.length > 0) {
          caster._benevolentTriggers = (caster._benevolentTriggers || 0) + 1;
        }
        for (const r of recipients) {
          sim.applyShield(caster, r, sh, dur);
          sim.healUnit(caster, r, healAmt);
          if (canBenevolent) {
            for (const cid of r.classIds || []) {
              const cls = sim.data?.classes?.[cid];
              if (cls?.primaryStat) {
                addStatBonus(r, cls.primaryStat, 10, true, 'perm', sim.data);
              }
            }
          }
        }
        break;
      }

      // --- Enemy ActiveAbility Actions ---
      case 'SlimeAction': {
        const pct = Number(act.cleansePercent) || 0.33;
        for (const st of ['Burn', 'Frost', 'Poison', 'Bleed']) {
          if ((caster.statuses?.[st] || 0) > 0) {
            caster.statuses[st] = Math.max(0, Math.floor(caster.statuses[st] * (1 - pct)));
          }
        }
        break;
      }

      case 'MeleeAbilityAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 50, atkCfg.ExtraDamagePerRank || 0);
        sim.dealDamage(caster, tgt, dmg, { origin: 'ability', damageType: 'physical', canCrit: true });
        break;
      }

      case 'ForestGolemAction':
      case 'SkeletonSmashAction': {
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 100);
        const stunDur = type === 'ForestGolemAction' ? 2.5 : 2.0;
        for (const e of sim.getAliveUnits(caster.team === 1 ? 2 : 1)) {
          if (hexDistance(caster, e) <= 1) {
            sim.dealDamage(caster, e, dmg, { origin: 'ability', damageType: 'physical', canCrit: true });
            sim.applyStatus(caster, e, 'Stun', 1, stunDur);
          }
        }
        break;
      }

      case 'SnipeAbilityAction': {
        const enemies = sim.getAliveUnits(caster.team === 1 ? 2 : 1);
        const rndTgt = sim.prng.pick(enemies) || currentTarget;
        if (!rndTgt) break;
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const dmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 125);
        sim.spawnAbilityProjectileOrHit(caster, rndTgt, dmg, 8.0, {
          origin: 'ability',
          damageType: 'physical',
          canCrit: true,
          abilityId: ab.id,
          vfxKind: 'archer_snipe',
          forceProjectile: true,
        });
        break;
      }

      case 'MushroomHealerAction': {
        const heal = (Number(act.amount) || 150) + getUnitStat(caster, 'Magic') * (Number(act.magicScaling) || 1.0);
        const lowAlly = sim
          .getAliveUnits(caster.team)
          .sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp))[0];
        if (lowAlly) sim.healUnit(caster, lowAlly, heal);
        break;
      }

      case 'AreaOfEffectAction': {
        const dur = Number(act.duration) || 3.0;
        const centerUnit = act.position === 'Owner' ? caster : (currentTarget || caster);
        const aoeRef = act.aoeEntry?.assetRef || act.areaOfEffectEntry || act.aoeAssetRef || act.aoeId;
        sim.spawnAoeZone(caster, centerUnit, aoeRef, dur, act.effects);
        break;
      }

      case 'SpiderEnsnareAction': {
        const far = sim.findTargetByType(caster, act.TargetingType || 'FarthestEnemy') || currentTarget;
        if (!far) break;
        const poison = Math.round((Number(act.basePoison) || 0) + getUnitStat(caster, 'Crit') * (Number(act.critPoisonScaling) || 0.25));
        if (poison > 0) sim.applyStatus(caster, far, 'Poison', poison);
        sim.applyStatus(caster, far, 'Stun', 1, Number(act.stunDuration) || 2.0);
        break;
      }

      case 'SnakeAction': {
        const dur = Number(act.duration) || 4.0;
        const aoeRef = act.regularAoeEntry?.assetRef || act.areaOfEffectEntry || 'SnakeAoeEntry';
        sim.spawnAoeZone(caster, currentTarget || caster, aoeRef, dur, act.regularEffects || act.effects || (act.effect ? [act.effect] : []));
        break;
      }

      case 'HydraAction': {
        const tgt = currentTarget || sim.findClosestEnemy(caster);
        if (!tgt) break;
        const heads = Math.max(1, caster._hydraHeads || 3);
        const atkCfg = act.attacks?.attacks?.[0] || {};
        const rawDmg = evaluateScalings(caster, atkCfg.Scalings, atkCfg.Damage || 0);
        const dmgPerHead = rawDmg > 0 ? rawDmg : Math.max(15, getUnitStat(caster, 'BaseAttackDamage') * 1.5);
        const inc = Math.max(1, Number(act.poisonPerHeadAttackInterval) || 20);
        const poisonPerHead = (Number(act.basePoisonPerHead) || 2) + Math.floor(getUnitStat(caster, 'Attack') / inc);
        sim.dealDamage(caster, tgt, dmgPerHead * heads, { origin: 'ability', damageType: 'physical', canCrit: true });
        sim.applyStatus(caster, tgt, 'Poison', poisonPerHead * heads);
        break;
      }

      default:
        break;
    }
  }

  return true;
}
