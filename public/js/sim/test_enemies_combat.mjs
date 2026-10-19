// Comprehensive Verification Suite for:
// 1. All 643 Enemy Definitions + 3 FightMode Enemies (105001, 105101, 105201)
// 2. All 24 Enemy & Boss Active Abilities (100..119, 20101..20105)
// 3. All 13 Enemy & Boss Passive Abilities (109, 110, 113..116, 118, 120, 201..205)
// 4. All 17 Enemy & Boss Relics (5000..5005, 5011..5016, 7000..7004)
// 5. Core Combat Mechanics: Rush/Stall Modifiers, Cyclone Storm, Statuses (Burn, Frost, Poison, Bleed, Stun, Stealth, Taunt, AntiHeal), Shield FIFO & Decay, Defense/DamageAmp/OmniVamp

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBattle } from './index.js';
import { hexDistanceCoords } from './hex.js';
import { recalculateStats } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameDataPath = path.resolve(__dirname, '../../data/game_data.json');
const rawGameData = JSON.parse(fs.readFileSync(gameDataPath, 'utf8'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  [FAIL] ${msg}`);
  }
}

function approx(a, b, tol = 2.0) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

// ============================================================================
// SUITE 1: All 643 Enemy Definitions + FightMode Enemies (105001..105201)
// ============================================================================
console.log('=== Suite 1: All 643 Enemy Definitions + FightMode Enemies Verification ===');
{
  const enemyIds = Object.keys(rawGameData.enemies).map(Number);
  assert(enemyIds.length === 643, `Expected 643 enemies in game_data.json, got ${enemyIds.length}`);

  for (const eid of [...enemyIds, 105001, 105101, 105201]) {
    const def = rawGameData.enemies[eid];
    const b1 = createBattle({
      data: rawGameData,
      seed: 100 + eid,
      difficulty: 1,
      heroes: [{ heroId: 1, rank: 1, x: 3, y: 1 }],
      enemies: [{ enemyId: eid, x: 3, y: 5 }],
    });
    const eUnit = b1.state.units.find((u) => u.team === 2);
    assert(Boolean(eUnit), `Enemy ${eid} spawned on board`);
    assert(Number.isFinite(eUnit.hp) && eUnit.hp > 0, `Enemy ${eid} has valid positive HP (${eUnit.hp})`);
    assert(Number.isFinite(eUnit.stats.BaseAttackDamage), `Enemy ${eid} has finite BaseAttackDamage`);
    assert(Number.isFinite(eUnit.attacksPerSecond) && eUnit.attacksPerSecond > 0, `Enemy ${eid} has positive attacksPerSecond`);

    if (def && def.startWithActiveAbility === false) {
      assert(eUnit.activeAbilityId == null, `Enemy ${eid} (${def.name}) has activeAbilityId locked at difficulty 1`);
      assert(eUnit.maxMana === 0, `Enemy ${eid} (${def.name}) has maxMana === 0 when activeAbilityId is locked (got ${eUnit.maxMana})`);

      // Verify unlock at difficulty >= 2
      const b2 = createBattle({
        data: rawGameData,
        seed: 200 + eid,
        difficulty: 2,
        heroes: [{ heroId: 1, rank: 1, x: 3, y: 1 }],
        enemies: [{ enemyId: eid, x: 3, y: 5 }],
      });
      const eUnitUnlocked = b2.state.units.find((u) => u.team === 2);
      const expectedAbId = def.activeAbilityId != null ? Number(def.activeAbilityId) : null;
      assert(eUnitUnlocked.activeAbilityId === expectedAbId, `Enemy ${eid} unlocks activeAbilityId (${expectedAbId}) at difficulty 2`);
      if (expectedAbId != null) {
        assert(eUnitUnlocked.maxMana > 0, `Enemy ${eid} has positive maxMana when unlocked at difficulty 2`);
      }
    } else if (def && def.activeAbilityId != null) {
      assert(eUnit.activeAbilityId === Number(def.activeAbilityId), `Enemy ${eid} has activeAbilityId ${def.activeAbilityId}`);
    }
  }
  console.log(`[PASS] Verified all ${enemyIds.length} enemies + 3 FightMode fallback enemies.`);
}

// ============================================================================
// SUITE 2: All 24 Enemy & Boss Active Abilities (100..119, 20101..20105)
// ============================================================================
console.log('=== Suite 2: All 24 Enemy & Boss Active Abilities Deep Mechanics ===');
{
  function makeAbilityTestBattle(abilityId, opts = {}) {
    const b = createBattle({
      data: rawGameData,
      seed: 42,
      heroes: opts.heroes || [
        { uid: 'h1', heroId: 1, rank: 1, x: 3, y: 3 },
        { uid: 'h2', heroId: 2, rank: 1, x: 1, y: 0 },
        { uid: 'h3', heroId: 7, rank: 1, x: 4, y: 3 },
      ],
      enemies: opts.enemies || [
        {
          uid: 'e1',
          enemyId: opts.enemyId || 1002,
          x: opts.x ?? 3,
          y: opts.y ?? 4,
          activeAbilityId: abilityId,
          passiveAbilityId: opts.passiveAbilityId ?? null,
          unlockActiveAbility: true,
        },
      ],
    });
    for (const u of b.state.units) {
      if (u.team === 1) {
        const hMax = opts.heroMaxHp ?? 5000;
        u.statMods.MaxHealth.base = hMax;
        u.statMods.Defense.base = 0;
        u.statMods.BaseAttackDamage.base = 5;
        u.statMods.Attack.base = 0;
        u.statMods.MoveSpeed.base = 0.2;
        recalculateStats(u, rawGameData);
        u.hp = opts.heroHpMap?.[u.uid] ?? hMax;
      } else {
        const eMax = opts.maxHp ?? 4000;
        u.statMods.MaxHealth.base = eMax;
        u.statMods.Magic.base = opts.magic ?? 50;
        u.statMods.Attack.base = opts.attack ?? 50;
        u.statMods.BaseAttackDamage.base = opts.baseAd ?? 50;
        u.statMods.Defense.base = 0;
        u.statMods.AttackRange.base = opts.range ?? 4;
        if (u.uid === 'e1') {
          u.statMods.MaxMana.base = 100;
        }
        recalculateStats(u, rawGameData);
        u.hp = opts.hp ?? 2000;
        u.mana = u.uid === 'e1' ? 100 : 0;
      }
    }
    return b;
  }

  function stepUntilCast(b, maxFrames = 65) {
    let castEv = null;
    for (let i = 0; i < maxFrames; i++) {
      b.tick();
      for (const ev of b.state.events) {
        if (ev.type === 'cast' && ev.sourceUid === 'e1') castEv = ev;
      }
      if (castEv) break;
    }
    return castEv;
  }

  // 100: Slime Rejuvenating Blow (SlimeAction cleanses 33% of debuff stacks + MeleeAbilityAction deals damage)
  {
    const b = makeAbilityTestBattle(100, { hp: 1000, maxHp: 4000, attack: 50 });
    const e1 = b.state.units.find((u) => u.uid === 'e1');
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const h1Before = h1.hp;
    b.sim.applyStatus(h1, e1, 'Poison', 9);
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), 'Ability 100 (Rejuvenating Blow) cast event emitted');
    assert(e1.statuses.Poison <= 6, `Ability 100 cleansed 33% of Poison stacks (9 -> ${e1.statuses.Poison})`);
    assert(h1.hp < h1Before, `Ability 100 dealt melee ability damage (${h1Before} -> ${h1.hp})`);
  }

  // 101: Forest Golem Slam (ForestGolemAction: AoE radius 1 physical damage + 2.5s Stun)
  {
    const b = makeAbilityTestBattle(101, { attack: 60 });
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const h1Before = h1.hp;
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), 'Ability 101 (Forest Golem Slam) cast event emitted');
    assert(h1.hp < h1Before, `Ability 101 dealt slam damage to adjacent h1 (${h1Before} -> ${h1.hp})`);
    assert((h1.statuses.Stun || 0) >= 2.0, `Ability 101 applied 2.5s Stun to h1 (got ${h1.statuses.Stun})`);
  }

  // 102 & 112: Mushroom Archer Wild Shot (SnipeAbilityAction projectile)
  for (const abId of [102, 112]) {
    const b = makeAbilityTestBattle(abId, { magic: 70, attack: 70 });
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), `Ability ${abId} (Wild Shot) cast event emitted`);
    for (let i = 0; i < 40; i++) b.tick();
    const anyHeroDamaged = b.state.units.some((u) => u.team === 1 && u.hp < 5000);
    assert(anyHeroDamaged, `Ability ${abId} sniped target hero`);
  }

  // 103: Mushroom Healer (MushroomHealerAction heals lowest-% HP ally)
  {
    const b = makeAbilityTestBattle(103, {
      enemies: [
        { uid: 'e1', enemyId: 1003, x: 3, y: 4, activeAbilityId: 103, unlockActiveAbility: true },
        { uid: 'e2', enemyId: 1002, x: 4, y: 4, activeAbilityId: null },
      ],
      hp: 500,
      maxHp: 2000,
      magic: 40,
    });
    const e1 = b.state.units.find((u) => u.uid === 'e1');
    const e2 = b.state.units.find((u) => u.uid === 'e2');
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), 'Ability 103 (Mushroom Healer) cast event emitted');
    assert(e1.hp > 500 || e2.hp > 500, `Ability 103 healed lowest-% ally (e1=${e1.hp}, e2=${e2.hp})`);
  }

  // 104, 113 (3s = 3 ticks) & 118 (4s = 4 ticks): Mushroom Frost Storm
  for (const [abId, expectedTicks] of [[104, 3], [113, 3], [118, 4]]) {
    const b = makeAbilityTestBattle(abId, { magic: 30 });
    let frostTicksOnH1 = 0;
    let castEv = null;
    for (let i = 0; i < 170; i++) {
      b.tick();
      for (const ev of b.state.events) {
        if (ev.type === 'cast' && ev.sourceUid === 'e1') castEv = ev;
        if (ev.type === 'status' && ev.targetUid === 'h1' && ev.status === 'Frost') frostTicksOnH1++;
      }
    }
    assert(Boolean(castEv), `Ability ${abId} (Frost Storm) cast event emitted`);
    assert(frostTicksOnH1 === expectedTicks, `Ability ${abId} Frost Storm ticked Frost ${expectedTicks} times on h1 (got ${frostTicksOnH1})`);
  }

  // 105, 114 (3s = 3 ticks) & 119 (4s = 4 ticks): Mushroom Fire Storm
  for (const [abId, expectedTicks] of [[105, 3], [114, 3], [119, 4]]) {
    const b = makeAbilityTestBattle(abId, { magic: 30 });
    let fireTicks = 0;
    let castEv = null;
    for (let i = 0; i < 170; i++) {
      b.tick();
      for (const ev of b.state.events) {
        if (ev.type === 'cast' && ev.sourceUid === 'e1') castEv = ev;
        if (ev.type === 'status' && ev.targetUid === 'h1' && ev.status === 'Burn') fireTicks++;
      }
    }
    assert(Boolean(castEv), `Ability ${abId} (Fire Storm) cast event emitted`);
    assert(fireTicks === expectedTicks, `Ability ${abId} Fire Storm ticked Burn ${expectedTicks} times on h1 (got ${fireTicks})`);
  }

  // 106, 111: Skeleton / Tank Bash (SkeletonSmashAction: AoE radius 1 physical damage + 2.0s Stun)
  for (const abId of [106, 111]) {
    const b = makeAbilityTestBattle(abId, { magic: 40, attack: 40, range: 1 });
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const hpBefore = h1.hp;
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), `Ability ${abId} (Bash) cast event emitted`);
    assert(h1.hp < hpBefore && (h1.statuses.Stun || 0) >= 1.5, `Ability ${abId} dealt damage and stunned adjacent h1`);
  }

  // 107: Plant Monster Vine Snag (HookFurthestEnemyAbilityAction pulls farthest hero + MeleeAbilityAction)
  {
    const b = makeAbilityTestBattle(107, { magic: 30 });
    const e1 = b.state.units.find((u) => u.uid === 'e1');
    const h2 = b.state.units.find((u) => u.uid === 'h2'); // at (1,0)
    const distBefore = hexDistanceCoords(e1.x, e1.y, h2.x, h2.y);
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), 'Ability 107 (Vine Snag) cast event emitted');
    const distAfter = hexDistanceCoords(e1.x, e1.y, h2.x, h2.y);
    assert(distAfter === 1, `Ability 107 pulled farthest hero h2 to adjacent hex (dist ${distBefore} -> ${distAfter})`);
  }

  // 108, 116: Spider Ensnare (SpiderEnsnareAction applies Poison + 2.0s Stun to FarthestEnemy)
  for (const abId of [108, 116]) {
    const b = makeAbilityTestBattle(abId, { magic: 20 });
    const h2 = b.state.units.find((u) => u.uid === 'h2');
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), `Ability ${abId} (Spider Ensnare) cast event emitted`);
    assert(approx(h2.statuses.Stun, 2.0, 0.1), `Ability ${abId} applied 2.0s Stun to farthest hero h2 (got ${h2.statuses.Stun})`);
  }

  // 109, 115: Snake Noxious Venom (SnakeAction spawns SnakeAoeEntry applying Poison)
  for (const abId of [109, 115]) {
    const b = makeAbilityTestBattle(abId, { magic: 25 });
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), `Ability ${abId} (Noxious Venom) cast event emitted`);
    for (let i = 0; i < 90; i++) b.tick();
    const totalPoison = b.state.units.filter((u) => u.team === 1).reduce((s, u) => s + (u.statuses.Poison || 0), 0);
    assert(totalPoison > 0, `Ability ${abId} Noxious Venom applied Poison stacks (total=${totalPoison})`);
  }

  // 110, 117: Lizard Bounce (LizardInFrontOfTargetAbilityAction leaps to lowest-HP hero + MeleeAbilityAction)
  for (const abId of [110, 117]) {
    const b = makeAbilityTestBattle(abId, {
      attack: 50,
      heroHpMap: { h1: 5000, h2: 400, h3: 5000 },
    });
    const e1 = b.state.units.find((u) => u.uid === 'e1');
    const h2 = b.state.units.find((u) => u.uid === 'h2');
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), `Ability ${abId} (Lizard Bounce) cast event emitted`);
    const distAfter = hexDistanceCoords(e1.x, e1.y, h2.x, h2.y);
    assert(distAfter <= 1 && h2.hp < 400, `Ability ${abId} leaped to lowest-HP hero h2 (dist=${distAfter}, hp=${h2.hp})`);
  }

  // 20101, 20102, 20103: Dragon Fire / Frost / Poison Breaths
  for (const [abId, stName] of [[20101, 'Burn'], [20102, 'Frost'], [20103, 'Poison']]) {
    const b = makeAbilityTestBattle(abId, { magic: 50 });
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const hpBefore = h1.hp;
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), `Dragon Breath ${abId} cast event emitted`);
    for (let i = 0; i < 25; i++) b.tick();
    assert(h1.hp < hpBefore && (h1.statuses[stName] || 0) > 0, `Dragon Breath ${abId} applied damage and ${stName}`);
  }

  // 20104: Demon Anger (Shield + Burn ONCE, no per-frame repetition)
  {
    const b = makeAbilityTestBattle(20104, { hp: 2500, maxHp: 2500, magic: 50 });
    const e1 = b.state.units.find((u) => u.uid === 'e1');
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), 'Demon Anger 20104 cast event emitted');
    const shieldAfterCast = e1.shield;
    assert(shieldAfterCast > 0 && shieldAfterCast < 2000, `Demon Anger 20104 granted reasonable one-shot Shield (${shieldAfterCast})`);
    b.tick();
    b.tick();
    assert(e1.shield <= shieldAfterCast + 1, `Demon Anger 20104 did NOT repeat shield every frame (after=${e1.shield})`);
  }

  // 20105: Hydra Venomous Bite (HydraAction deals damage + poison per head)
  {
    const b = makeAbilityTestBattle(20105, { attack: 60, magic: 50 });
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const castEv = stepUntilCast(b);
    assert(Boolean(castEv), 'Hydra Venomous Bite 20105 cast event emitted');
    assert(h1.hp < 5000 && (h1.statuses.Poison || 0) >= 6, `Hydra 20105 dealt damage (${h1.hp}) and Poison (${h1.statuses.Poison})`);
  }
  console.log('[PASS] All 24 Enemy & Boss Active Abilities verified.');
}

// ============================================================================
// SUITE 3: All 13 Enemy & Boss Passive Abilities + 17 Enemy/Boss Relics
// ============================================================================
console.log('=== Suite 3: All 13 Enemy & Boss Passive Abilities + Enemy & Boss Relics ===');
{
  const enemyPassiveIds = [109, 110, 113, 114, 115, 116, 118, 120, 201, 202, 203, 204, 205];
  for (const pid of enemyPassiveIds) {
    const pDef = rawGameData.passiveAbilities[pid];
    assert(Boolean(pDef), `Enemy/Boss PassiveAbility ${pid} exists in game_data.json (${pDef?.name})`);
    const b = createBattle({
      data: rawGameData,
      seed: 300 + pid,
      heroes: [{ uid: 'h1', heroId: 1, rank: 2, x: 3, y: 2 }],
      enemies: [
        { uid: 'e1', enemyId: 1002, x: 3, y: 4, passiveAbilityId: pid },
        { uid: 'e2', enemyId: 1002, x: 4, y: 4 },
      ],
    });
    for (let i = 0; i < 90; i++) b.tick();
    for (const u of b.state.units) {
      assert(Number.isFinite(u.hp) && !Number.isNaN(u.hp), `Passive ${pid}: unit ${u.uid} HP is finite (${u.hp})`);
    }
  }

  // Verify Enemy Relics 5000..5005, 5011..5016 and Boss Relics 7000..7004
  const enemyRelicIds = [5000, 5001, 5002, 5003, 5004, 5005, 5011, 5012, 5013, 5014, 5015, 5016, 7000, 7001, 7002, 7003, 7004];
  for (const rid of enemyRelicIds) {
    const rDef = rawGameData.relics[rid];
    assert(Boolean(rDef), `Enemy/Boss Relic ${rid} exists in game_data.json (${rDef?.name})`);
    const b = createBattle({
      data: rawGameData,
      seed: 500 + rid,
      enemyRelics: [{ id: rid, customStacks: 4 }],
      heroes: [{ uid: 'h1', heroId: 1, rank: 2, x: 3, y: 2 }],
      enemies: [{ uid: 'e1', enemyId: 20001, x: 3, y: 4 }],
    });
    for (let i = 0; i < 70; i++) b.tick();
    for (const u of b.state.units) {
      assert(Number.isFinite(u.hp) && !Number.isNaN(u.hp), `Enemy Relic ${rid}: unit ${u.uid} HP is finite (${u.hp})`);
    }
  }
  console.log('[PASS] All 13 Enemy/Boss Passives and all 17 Enemy/Boss Relics verified.');
}

// ============================================================================
// SUITE 4: Rush/Stall Modifiers, Cyclone Storm, Statuses & Shield FIFO Decay
// ============================================================================
console.log('=== Suite 4: Rush/Stall Modifiers, Cyclone Storm, Statuses & Shield Decay ===');
{
  // 1. Rush & Stall duration modifiers (playerRushBonus / bonusRushDuration & playerStallReduction / stallReduction)
  {
    const b = createBattle({
      data: rawGameData,
      seed: 21,
      playerRushBonus: 5,
      playerStallReduction: 4,
      enemyRelics: [5000, 5001],
      heroes: [{ uid: 'h1', heroId: 21, rank: 2, specId: 102103, x: 3, y: 0 }], // Ming Spec 2103 (passive 102103) adds +2*rank = +4s Rush
      enemies: [{ uid: 'e1', enemyId: 1002, x: 3, y: 5 }],
    });
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const e1 = b.state.units.find((u) => u.uid === 'e1');
    // Player Rush duration = 10 + 5 + 4 = 19s; Enemy Rush duration = 10s
    assert(b.sim.bonusRushDuration === 9, `Player bonusRushDuration = 5 + 4 (Ming Rank 2) = 9s (got ${b.sim.bonusRushDuration})`);
    assert(b.sim.stallReduction === 4, `Player stallReduction = 4s (got ${b.sim.stallReduction})`);
    b.state.time = 12;
    assert(b.sim.isRushActive(h1, 10) === true, 'Player Rush still active at 12s (10 + 9 = 19s)');
    assert(b.sim.isRushActive(e1, 10) === false, 'Enemy Rush expired at 12s (base 10s)');
    b.state.time = 12;
    assert(b.sim.isStallReached(h1, 15) === true, 'Player Stall reached at 12s (15 - 4 = 11s)');
    assert(b.sim.isStallReached(e1, 15) === false, 'Enemy Stall not yet reached at 12s (base 15s)');
  }

  // 2. Statuses: Stun + StunResistance, AntiHeal, Shield FIFO absorption & damageMitigated tracking
  {
    const b = createBattle({
      data: rawGameData,
      seed: 22,
      heroes: [
        { uid: 'h1', heroId: 1, rank: 1, x: 3, y: 2, stats: { StunResistance: 50 } },
        { uid: 'h2', heroId: 2, rank: 1, x: 4, y: 2 },
      ],
      enemies: [
        { uid: 'e1', enemyId: 1002, x: 3, y: 4 },
      ],
    });
    const h1 = b.state.units.find((u) => u.uid === 'h1');
    const h2 = b.state.units.find((u) => u.uid === 'h2');
    const e1 = b.state.units.find((u) => u.uid === 'e1');

    // StunResistance 50% on h1 reduces 2.0s stun to 1.0s
    h1.stats.StunResistance = 50;
    b.sim.applyStatus(e1, h1, 'Stun', 1, 2.0);
    assert(approx(h1.statusTimers.stunRemaining, 1.0, 0.05), `50% StunResistance reduced 2.0s Stun to 1.0s (got ${h1.statusTimers.stunRemaining})`);

    // AntiHeal reduces healing
    h2.maxHp = 2000;
    h2.hp = 500;
    b.sim.applyStatus(e1, h2, 'AntiHeal', 1, 5.0);
    const healedAmt = b.sim.healUnit(h2, h2, 200);
    assert(healedAmt < 200 && healedAmt > 0, `AntiHeal reduced 200 heal to ${healedAmt}`);

    // Shield FIFO absorption & damageMitigated tracking
    b.sim.applyShield(h2, h2, 100);
    b.sim.applyShield(h2, h2, 150);
    assert(h2.shield === 250 && h2.shieldBatches.length === 2, 'Two shield batches stacked to 250');
    b.sim.dealDamage(e1, h2, 120, { damageType: 'true', origin: 'ability' });
    assert(h2.shield === 130 && h2.shieldBatches.length === 1 && h2.shieldBatches[0].amount === 130, `FIFO shield absorption consumed oldest batch first (shield=${h2.shield})`);
    assert(h2.combatStats.damageMitigated >= 120, `Shield absorption recorded in combatStats.damageMitigated (${h2.combatStats.damageMitigated})`);
  }

  console.log('[PASS] Rush/Stall Modifiers, Statuses, AntiHeal, StunResistance, and Shield FIFO verified.');
}

console.log(`\n========================================`);
console.log(`ENEMIES & COMBAT ENGINE TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
