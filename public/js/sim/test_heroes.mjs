// Comprehensive automated verification suite for all 25 playable heroes,
// 25 hero ActiveAbilities, 76 hero PassiveAbilities, 75 Rank B Specializations,
// and 105 Rank A/S RankModifiers in Guildrun.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBattle, FIXED_DT } from './index.js';
import { getAbilityTiming } from './abilities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '../../data/game_data.json');
const gameData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const EXPECTED_HERO_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 26, 27,
];

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function assertNoNaNsInBattle(battle, contextLabel) {
  const { state } = battle;
  assert(Number.isFinite(state.time), `${contextLabel}: state.time is finite`);
  for (const u of state.units) {
    assert(Number.isFinite(u.hp) && !Number.isNaN(u.hp), `${contextLabel}: unit ${u.uid} hp is finite (${u.hp})`);
    assert(Number.isFinite(u.maxHp) && u.maxHp > 0, `${contextLabel}: unit ${u.uid} maxHp > 0 (${u.maxHp})`);
    assert(Number.isFinite(u.mana) && !Number.isNaN(u.mana), `${contextLabel}: unit ${u.uid} mana is finite (${u.mana})`);
    assert(Number.isFinite(u.shield) && !Number.isNaN(u.shield), `${contextLabel}: unit ${u.uid} shield is finite (${u.shield})`);
    assert(Number.isFinite(u.x) && Number.isFinite(u.y), `${contextLabel}: unit ${u.uid} coords finite (${u.x}, ${u.y})`);
    for (const [k, v] of Object.entries(u.stats || {})) {
      assert(Number.isFinite(v) && !Number.isNaN(v), `${contextLabel}: unit ${u.uid} stat ${k} is finite (${v})`);
    }
    for (const [k, v] of Object.entries(u.statuses || {})) {
      assert(Number.isFinite(v) && !Number.isNaN(v), `${contextLabel}: unit ${u.uid} status ${k} is finite (${v})`);
    }
  }
}

function makeDummyEnemies(count = 3, hpOverride = 5000) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      uid: `dummy_enemy_${i}`,
      enemyId: 1001,
      x: 2 + i,
      y: 4,
    });
  }
  return { list, hpOverride };
}

function tuneEnemies(battle, hpOverride = 5000) {
  for (const u of battle.state.units) {
    if (u.team === 2) {
      u.maxHp = hpOverride;
      u.hp = hpOverride;
      u.stats.BaseAttackDamage = 10;
      u.stats.Defense = 10;
    }
  }
}

console.log('=== Suite 1: All 25 Playable Heroes Roster & Rank C (Rank 1) Baseline ===');
{
  const dataHeroIds = Object.keys(gameData.heroes).map(Number).sort((a, b) => a - b);
  assert(
    JSON.stringify(dataHeroIds) === JSON.stringify(EXPECTED_HERO_IDS),
    `game_data.json has exact 25 playable hero IDs: ${dataHeroIds.join(', ')}`
  );

  for (const heroId of EXPECTED_HERO_IDS) {
    const hDef = gameData.heroes[heroId];
    assert(hDef && hDef.name, `Hero ${heroId} has valid definition (${hDef?.name})`);

    const battle = createBattle({
      data: gameData,
      heroes: [
        { uid: `hero_${heroId}`, heroId, rank: 1, x: 3, y: 3 },
        { uid: `ally_${heroId}`, heroId: 2, rank: 1, x: 2, y: 3 },
      ],
      enemies: makeDummyEnemies(2).list,
      seed: 100 + heroId,
    });
    tuneEnemies(battle, 4000);

    const unit = battle.state.units.find((u) => u.uid === `hero_${heroId}`);
    assert(!!unit, `Hero ${heroId} (${hDef.name}) spawned on board at Rank C`);
    assert(unit.rank === 1, `Hero ${heroId} has rank 1`);
    assert(unit.maxHp > 0 && unit.hp === unit.maxHp, `Hero ${heroId} starts at full HP (${unit.hp}/${unit.maxHp})`);

    if (hDef.startWithActiveAbility) {
      assert(
        unit.activeAbilityId === hDef.activeAbilityId,
        `Hero ${heroId} (${hDef.name}) starts with activeAbilityId ${hDef.activeAbilityId}`
      );
    } else {
      assert(
        unit.activeAbilityId === null && unit.passiveAbilityIds.includes(hDef.passiveAbilityId),
        `Hero ${heroId} (${hDef.name}) starts with passiveAbilityId ${hDef.passiveAbilityId} and null activeAbilityId`
      );
    }

    for (let f = 0; f < 120; f++) {
      battle.tick(FIXED_DT);
    }
    assertNoNaNsInBattle(battle, `RankC_Hero_${heroId}_${hDef.name}`);
    assert(
      unit.combatStats.damageDealt > 0 || unit.combatStats.healingDone > 0 || unit.combatStats.shieldGranted > 0,
      `Hero ${heroId} (${hDef.name}) contributed in Rank C combat`
    );
  }
}

console.log('=== Suite 2: All 25 Hero Active Abilities Deep Mechanics Verification ===');
{
  // Map of heroId -> specializationId that unlocks their ActiveAbility (for passive-start heroes)
  const ACTIVE_UNLOCK_SPEC = {
    1: 101,
    5: 501,
    7: 702,
    9: 901,
    11: 1101,
    12: 1201,
    15: 1503,
    18: 1802,
    21: 2101,
  };

  function runHeroAbilityCast(heroId, opts = {}) {
    const hDef = gameData.heroes[heroId];
    const specId = opts.specializationId !== undefined ? opts.specializationId : (ACTIVE_UNLOCK_SPEC[heroId] ?? null);
    const rank = opts.rank || (specId ? 2 : 1);
    const battle = createBattle({
      data: gameData,
      heroes: [
        {
          uid: 'caster',
          heroId,
          rank,
          specializationId: specId,
          x: opts.casterX ?? 3,
          y: opts.casterY ?? 3,
        },
        {
          uid: 'ally1',
          heroId: 2,
          rank: 1,
          x: 2,
          y: 3,
        },
      ],
      enemies: opts.enemies || [
        { uid: 'e1', enemyId: 1001, x: 3, y: 4 },
        { uid: 'e2', enemyId: 1001, x: 4, y: 4 },
        { uid: 'e3', enemyId: 1001, x: 2, y: 5 },
      ],
      seed: opts.seed || 42,
      shardsGenerated: opts.shardsGenerated ?? 20,
    });

    tuneEnemies(battle, opts.enemyHp ?? 8000);
    const caster = battle.state.units.find((u) => u.uid === 'caster');
    const ally = battle.state.units.find((u) => u.uid === 'ally1');
    const enemies = battle.state.units.filter((u) => u.team === 2);

    if (opts.forceAbilityId) {
      caster.activeAbilityId = opts.forceAbilityId;
    }
    if (caster.maxMana <= 0) caster.maxMana = 100;

    if (opts.damageCaster) {
      caster.hp = Math.max(10, Math.floor(caster.maxHp * 0.4));
    }
    if (opts.damageAlly && ally) {
      ally.hp = Math.max(10, Math.floor(ally.maxHp * 0.3));
    }
    if (opts.advanceTime) {
      battle.state.time = opts.advanceTime;
    }
    if (opts.setupFn) {
      opts.setupFn(battle, caster, ally, enemies);
    }

    // Trigger full mana so next tick begins ActiveAbility cast
    caster.mana = caster.maxMana;
    const collectedEvents = [];
    const totalTicks = opts.ticks ?? 95; // ~3.0s to cover windup + projectile flight + AoE ticks
    for (let i = 0; i < totalTicks; i++) {
      const st = battle.tick(FIXED_DT);
      if (st.events.length > 0) {
        collectedEvents.push(...st.events);
      }
    }
    assertNoNaNsInBattle(battle, `ActiveAbility_Hero_${heroId}_${hDef.name}`);
    return { battle, caster, ally, enemies, collectedEvents };
  }

  // 1. Irini (ID 1, Ability 1: Gathering Storm)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(1);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 1), 'Irini casts Ability 1 (Gathering Storm)');
    assert(caster.combatStats.damageDealt > 0, `Irini Gathering Storm dealt magic damage (${caster.combatStats.damageDealt})`);
  }

  // 2. Hoyoung (ID 2, Ability 2: Killshot)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(2);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 2), 'Hoyoung casts Ability 2 (Killshot)');
    assert(caster.combatStats.damageDealt > 0, `Hoyoung Killshot dealt physical damage (${caster.combatStats.damageDealt})`);
  }

  // 3. Reyna (ID 3, Ability 3: Triple Threat)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(3);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 3), 'Reyna casts Ability 3 (Triple Threat)');
    assert(caster.combatStats.damageDealt > 0, 'Reyna Triple Threat dealt 3-punch physical damage');
    assert(caster.combatStats.shieldGranted > 0, `Reyna Triple Threat granted lasting Shields (${caster.combatStats.shieldGranted})`);
  }

  // 4. Yuuna (ID 4, Ability 4: Shuriken Shadow Strike + Spec 403 The Nightshade Poison on Crit)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(4, {
      specializationId: 403,
      setupFn: (_b, c) => {
        c.statMods.Crit.combatFlat += 100; // Guarantee crit so The Nightshade applies Poison
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 4), 'Yuuna casts Ability 4 (Shuriken Shadow Strike)');
    assert(caster.combatStats.damageDealt > 0, 'Yuuna Shuriken Shadow Strike dealt physical damage');
    assert(collectedEvents.some((e) => e.type === 'dash' && e.abilityId === 4), 'Yuuna teleports behind target');
    assert(enemies.some((e) => (e.statuses.Poison || 0) > 0), 'Yuuna crits applied Poison stacks via The Nightshade');
  }

  // 5. Zuri (ID 5, Ability 5: Petrification)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(5, { ticks: 50 });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 5), 'Zuri casts Ability 5 (Petrification)');
    assert(caster.combatStats.damageDealt > 0, `Zuri Petrification dealt magic damage (${caster.combatStats.damageDealt})`);
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Stun') || enemies.some((e) => (e.statuses.Stun || 0) > 0),
      'Zuri Petrification stunned enemies targeting her'
    );
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Poison') || enemies.some((e) => (e.statuses.Poison || 0) > 0),
      'Zuri Petrification inflicted Poison stacks'
    );
  }

  // 6. Aria (ID 6, Ability 6: Requiem Barrage)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(6);
    assert(collectedEvents.some((e) => e.type === 'aoe' && e.abilityId === 6), 'Aria spawns Requiem Barrage AoE zone');
    assert(caster.combatStats.damageDealt > 0, 'Aria Requiem Barrage dealt magic damage to enemies in AoE');
  }

  // 7. Nyx (ID 7, Ability 7: Wild Flurry) - including kill recast jump
  {
    const { caster, collectedEvents } = runHeroAbilityCast(7, {
      setupFn: (_b, _c, _a, es) => {
        es[0].hp = 20; // First enemy dies mid-combo -> Nyx jumps to next enemy and recasts
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 7), 'Nyx casts Ability 7 (Wild Flurry)');
    assert(caster.combatStats.damageDealt > 0, 'Nyx Wild Flurry dealt 5-hit combo damage');
    assert(collectedEvents.some((e) => e.type === 'dash' && e.abilityId === 7), 'Nyx Wild Flurry jumped to nearest enemy on kill');
  }

  // 8. Pollen (ID 8, Ability 8: Sanctuary of Bloom) - base and Stall(15)
  {
    const { caster, ally, collectedEvents } = runHeroAbilityCast(8, { advanceTime: 16.0, damageAlly: true });
    assert(collectedEvents.some((e) => e.type === 'aoe' && e.abilityId === 8), 'Pollen spawns Sanctuary of Bloom AoE');
    assert(caster.combatStats.shieldGranted > 0, 'Pollen Sanctuary of Bloom shielded allies in AoE');
    assert(
      collectedEvents.some((e) => e.type === 'heal' && e.targetUid === ally.uid),
      'Pollen Sanctuary of Bloom after Stall(15) heals allies in AoE'
    );
  }

  // 9. Niklas (ID 9, Ability 9: Wheel and Deal)
  {
    const { battle, caster, collectedEvents } = runHeroAbilityCast(9, {
      setupFn: (_b, c) => {
        c._niklasCasts = 3; // Next cast is 4th cast -> creates random item
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 9), 'Niklas casts Ability 9 (Wheel and Deal)');
    assert(caster.combatStats.damageDealt > 0, 'Niklas Wheel and Deal dealt physical damage');
    assert(collectedEvents.some((e) => e.type === 'status' && e.status === 'Stun'), 'Niklas Wheel and Deal stunned target');
    assert(battle.result().itemsCreated >= 1, `Niklas created an item on 4th cast (${battle.result().itemsCreated})`);
  }

  // 10. Fiona (ID 10, Ability 10: Vault Spark)
  {
    const { caster, ally, collectedEvents } = runHeroAbilityCast(10, { damageAlly: true });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 10), 'Fiona casts Ability 10 (Vault Spark)');
    assert(caster.combatStats.shieldGranted > 0, `Fiona Vault Spark granted Shield (${caster.combatStats.shieldGranted})`);
    assert(ally.shield > 0, 'Fiona Vault Spark shielded lowest-% HP ally');
  }

  // 11. Rowan (ID 11, Ability 11: Fault Line)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(11);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 11), 'Rowan casts Ability 11 (Fault Line)');
    assert(caster.combatStats.shieldGranted > 0, `Rowan Fault Line granted Shield (${caster.combatStats.shieldGranted})`);
    assert(caster.combatStats.damageDealt > 0, `Rowan Fault Line dealt AoE damage (${caster.combatStats.damageDealt})`);
    assert(collectedEvents.some((e) => e.type === 'status' && e.status === 'Stun'), 'Rowan Fault Line stunned enemies in front');
  }

  // 12. Skorn (ID 12, Ability 12: Come At Me!)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(12, { ticks: 20 });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 12), 'Skorn casts Ability 12 (Come At Me!)');
    assert(caster.combatStats.shieldGranted > 0, 'Skorn Come At Me! granted Shield');
    assert(caster.combatStats.damageDealt > 0, 'Skorn Come At Me! dealt shield-scaled magic damage');
    assert(enemies.every((e) => e.targetUid === caster.uid), 'Skorn Come At Me! taunted all enemies');
  }

  // 13. Logan (ID 13, Ability 13: Execution) - including T1/T2/T3 thresholds
  {
    const { caster, collectedEvents } = runHeroAbilityCast(13, {
      setupFn: (_b, c) => {
        c._loganDamageDealt = 650; // Meets T1 (200), T2 (400), and T3 (600) thresholds
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 13), 'Logan casts Ability 13 (Execution)');
    assert((caster.permanentGains.Attack || 0) >= 25, 'Logan T1 threshold granted +25 Attack');
    assert((caster.permanentGains.Crit || 0) >= 25, 'Logan T2 threshold granted +25 Crit');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Stun'),
      'Logan T3 threshold stunned enemies in AoE'
    );
  }

  // 14. Funke (ID 14, Ability 14: Wildfire)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(14);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 14), 'Funke casts Ability 14 (Wildfire)');
    assert(caster.combatStats.damageDealt > 0, 'Funke Wildfire dealt magic damage');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Burn') || enemies.some((e) => (e.statuses.Burn || 0) > 0),
      'Funke Wildfire applied Burn'
    );
  }

  // 15. Tilly (ID 15, Ability 15: Pirouette)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(15);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 15), 'Tilly casts Ability 15 (Pirouette)');
    assert(caster.stats.OmniVamp >= 8 && caster.stats.Crit > 15, 'Tilly Pirouette buffed Crit and Omnivamp');
    assert(caster.combatStats.damageDealt > 0, 'Tilly Pirouette dealt AoE physical damage');
  }

  // 16. Gustav (ID 16, Ability 16: Blizzard)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(16);
    assert(collectedEvents.some((e) => e.type === 'aoe' && e.abilityId === 16), 'Gustav spawns Blizzard AoE');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Frost') || enemies.some((e) => (e.statuses.Frost || 0) > 0),
      'Gustav Blizzard applied Frost in AoE'
    );
    assert(caster.combatStats.damageDealt > 0, 'Gustav Blizzard dealt AoE magic damage');
  }

  // 17. Ratna (ID 17, Ability 17: Starfall)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(17, {
      setupFn: (_b, c, _a, es) => {
        c.statMods.Crit.combatFlat += 100; // Guarantee Crit -> Stun all enemies
        es[0].hp = 50; // Guarantee kill -> permanent Magic gain
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 17), 'Ratna casts Ability 17 (Starfall)');
    assert(caster.combatStats.damageDealt > 0, `Ratna Starfall dealt magic damage (${caster.combatStats.damageDealt})`);
    assert((caster.permanentGains.Magic || 0) >= 10, `Ratna Starfall gained permanent Magic on kill (${caster.permanentGains.Magic})`);
    assert(collectedEvents.some((e) => e.type === 'status' && e.status === 'Stun'), 'Ratna Starfall stunned all enemies on Crit');
  }

  // 18. Rip (ID 18, Ability 18: Rampage)
  {
    let baseMaxHp = 0;
    const { caster, collectedEvents } = runHeroAbilityCast(18, {
      setupFn: (_b, c) => {
        baseMaxHp = c.maxHp;
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 18), 'Rip casts Ability 18 (Rampage)');
    assert(caster.maxHp > baseMaxHp, `Rip Rampage increased MaxHP (${baseMaxHp} -> ${caster.maxHp})`);
    assert(caster.stats.OmniVamp > 0, `Rip Rampage increased Omnivamp (${caster.stats.OmniVamp})`);
  }

  // 20. Karsu (ID 20, Ability 20: Snowpiercer)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(20);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 20), 'Karsu casts Ability 20 (Snowpiercer)');
    assert(caster.combatStats.damageDealt > 0, 'Karsu Snowpiercer dealt arrow volley damage');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Frost') || enemies.some((e) => (e.statuses.Frost || 0) > 0),
      'Karsu Snowpiercer applied Frost'
    );
  }

  // 21. Ming (ID 21, Ability 21: Searing Mantra)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(21);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 21), 'Ming casts Ability 21 (Searing Mantra)');
    assert(caster.combatStats.damageDealt > 0, 'Ming Searing Mantra dealt magic damage');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Burn') || enemies.some((e) => (e.statuses.Burn || 0) > 0),
      'Ming Searing Mantra inflicted Burn'
    );
    assert(collectedEvents.some((e) => e.type === 'status' && e.status === 'Stun'), 'Ming Searing Mantra stunned surrounding enemies');
  }

  // 22. Pimenta (ID 22, Ability 22: Pepper Spray)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(22, { advanceTime: 16.0 });
    assert(collectedEvents.some((e) => e.type === 'aoe' && e.abilityId === 22), 'Pimenta spawns Pepper Spray poison cloud AoE');
    assert(caster.combatStats.damageDealt > 0, 'Pimenta Pepper Spray dealt AoE damage');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Poison') || enemies.some((e) => (e.statuses.Poison || 0) > 0),
      'Pimenta Pepper Spray inflicted Poison'
    );
  }

  // 23. Sal (ID 23, Ability 23: Permafrost)
  {
    const { caster, enemies, collectedEvents } = runHeroAbilityCast(23, { ticks: 150 });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 23), 'Sal casts Ability 23 (Permafrost)');
    assert(!!caster._salPermafrost, 'Sal Permafrost buff active on caster');
    assert(
      collectedEvents.some((e) => e.type === 'status' && e.status === 'Frost') || enemies.some((e) => (e.statuses.Frost || 0) > 0),
      'Sal Permafrost auto-attacks splash Frost'
    );
  }

  // 24. Dragomir (ID 24, Ability 24: Devour)
  {
    const { battle, caster, collectedEvents } = runHeroAbilityCast(24, {
      damageCaster: true,
      setupFn: (_b, _c, _a, es) => {
        es[0].hp = 50; // Kill target -> gain Shards
      },
    });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 24), 'Dragomir casts Ability 24 (Devour)');
    assert(caster.combatStats.damageDealt > 0, 'Dragomir Devour dealt magic damage');
    assert(caster.combatStats.healingDone > 0, `Dragomir Devour healed Dragomir via Omnivamp (${caster.combatStats.healingDone})`);
    assert(battle.result().shardsEarned >= 2, `Dragomir Devour granted Shards on kill (${battle.result().shardsEarned})`);
  }

  // 26. Kai (ID 26, Ability 28: Resolute Strike)
  {
    const { caster, collectedEvents } = runHeroAbilityCast(26);
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 28), 'Kai casts Ability 28 (Resolute Strike)');
    assert(caster.combatStats.shieldGranted > 0, `Kai Resolute Strike granted Shield (${caster.combatStats.shieldGranted})`);
    assert(caster.combatStats.damageDealt > 0, `Kai Resolute Strike dealt physical AoE damage (${caster.combatStats.damageDealt})`);
  }

  // 27. Grace (ID 27, Ability 29: Salvation) - including heal, shield, and Stall(20) resurrection
  {
    const { caster, ally, collectedEvents } = runHeroAbilityCast(27, { damageAlly: true });
    assert(collectedEvents.some((e) => e.type === 'cast' && e.abilityId === 29), 'Grace casts Ability 29 (Salvation)');
    assert(caster.combatStats.shieldGranted > 0, `Grace Salvation shielded lowest-HP ally (${caster.combatStats.shieldGranted})`);
    assert(caster.combatStats.healingDone > 0, `Grace Salvation healed lowest-HP ally (${caster.combatStats.healingDone})`);
    assert(ally.shield > 0, 'Grace Salvation ally has active Shield');

    // Also verify Stall(20) dead ally resurrection
    const resTest = runHeroAbilityCast(27, {
      advanceTime: 21.0,
      setupFn: (_b, _c, a) => {
        a.hp = 0;
        a.state = 'Dead';
      },
    });
    assert(resTest.ally.hp > 0 && resTest.ally.state !== 'Dead', 'Grace Salvation resurrects dead ally after Stall(20)');
  }
}

console.log('=== Suite 3: All 75 Specializations at Rank B (Rank 2) ===');
{
  const specEntries = Object.values(gameData.specializations);
  assert(specEntries.length === 75, `game_data.json has 75 specializations (found ${specEntries.length})`);

  for (const spec of specEntries) {
    const heroId = Math.floor(Number(spec.id) / 100);
    const hDef = gameData.heroes[heroId];
    assert(!!hDef, `Specialization ${spec.id} (${spec.name}) maps to valid hero ${heroId}`);

    const isBackupSpec = /\[Backup/i.test(
      (spec.passiveAbilityId && gameData.passiveAbilities[spec.passiveAbilityId]?.description) || ''
    );

    const battle = createBattle({
      data: gameData,
      heroes: [
        {
          uid: `spec_hero_${spec.id}`,
          heroId,
          rank: 2,
          specializationId: spec.id,
          benched: isBackupSpec,
          x: isBackupSpec ? -1 : 3,
          y: 3,
        },
        {
          uid: 'front_ally',
          heroId: 2,
          rank: 2,
          x: 2,
          y: 3,
        },
      ],
      enemies: makeDummyEnemies(3).list,
      seed: 1000 + Number(spec.id),
      shardsGenerated: 20,
    });
    tuneEnemies(battle, 6000);

    if (!isBackupSpec) {
      const unit = battle.state.units.find((u) => u.uid === `spec_hero_${spec.id}`);
      assert(!!unit, `Spec ${spec.id} (${spec.name}) hero spawned on board`);
      if (spec.classId != null) {
        assert(unit.classIds.includes(Number(spec.classId)), `Spec ${spec.id} added classId ${spec.classId}`);
      }
      if (spec.activeAbilityId != null) {
        assert(unit.activeAbilityId === Number(spec.activeAbilityId), `Spec ${spec.id} set activeAbilityId ${spec.activeAbilityId}`);
      }
      if (spec.passiveAbilityId != null) {
        assert(unit.passiveAbilityIds.includes(Number(spec.passiveAbilityId)), `Spec ${spec.id} added passiveAbilityId ${spec.passiveAbilityId}`);
      }

      // Damage unit & ally slightly so heals/shields can trigger, and grant full mana if active ability exists
      unit.hp = Math.floor(unit.maxHp * 0.7);
      const ally = battle.state.units.find((u) => u.uid === 'front_ally');
      if (ally) ally.hp = Math.floor(ally.maxHp * 0.6);
      if (unit.activeAbilityId != null && unit.maxMana > 0) {
        unit.mana = unit.maxMana;
      }
    }

    for (let f = 0; f < 90; f++) {
      battle.tick(FIXED_DT);
    }
    assertNoNaNsInBattle(battle, `Spec_${spec.id}_${spec.name}`);
  }

  // Targeted checks for key specialization overrides:
  // Spec 2602 (Kai - The Bold): reduces cast windup/duration by 1.0s
  {
    const baseTiming = getAbilityTiming(28, { specializationId: null });
    const boldTiming = getAbilityTiming(28, { specializationId: 2602 });
    assert(boldTiming.totalDuration < baseTiming.totalDuration, 'Kai Spec 2602 (The Bold) reduces Resolute Strike cast duration');
  }

  // Spec 1001 (Fiona - The Right Hand): creates an item every 5 casts
  {
    const battle = createBattle({
      data: gameData,
      heroes: [{ uid: 'fiona', heroId: 10, rank: 2, specializationId: 1001, x: 3, y: 3 }],
      enemies: makeDummyEnemies(1).list,
      seed: 55,
    });
    tuneEnemies(battle, 9000);
    const fiona = battle.state.units.find((u) => u.uid === 'fiona');
    fiona._fionaSpecCasts = 4; // Next cast is 5th
    fiona.mana = fiona.maxMana;
    for (let i = 0; i < 40; i++) battle.tick(FIXED_DT);
    assert(battle.result().itemsCreated >= 1, 'Fiona Spec 1001 (The Right Hand) created an item on 5th cast');
  }

  // Spec 2702 (Grace - The Benevolent): grants permanent primary stat after Stall(15) up to 1 + rank times
  {
    const battle = createBattle({
      data: gameData,
      heroes: [
        { uid: 'grace', heroId: 27, rank: 2, specializationId: 2702, x: 3, y: 3 },
        { uid: 'taro', heroId: 2, rank: 2, x: 2, y: 3 },
      ],
      enemies: makeDummyEnemies(1).list,
      seed: 77,
    });
    tuneEnemies(battle, 9000);
    const grace = battle.state.units.find((u) => u.uid === 'grace');
    const taro = battle.state.units.find((u) => u.uid === 'taro');
    taro.hp = Math.floor(taro.maxHp * 0.3);
    battle.state.time = 16.0; // Past Stall(15)
    grace.mana = grace.maxMana;
    for (let i = 0; i < 40; i++) battle.tick(FIXED_DT);
    assert(
      Object.values(taro.permanentGains).some((v) => v > 0),
      `Grace Spec 2702 (The Benevolent) granted permanent class primary stats to ally (${JSON.stringify(taro.permanentGains)})`
    );
  }
}

console.log('=== Suite 4: Rank A (3) & Rank S (4) Scaling + All 105 Rank Modifiers ===');
{
  // Verify Rank 1 -> 2 -> 3 -> 4 stat scaling on all 25 heroes
  for (const heroId of EXPECTED_HERO_IDS) {
    const hps = [];
    for (const rank of [1, 2, 3, 4]) {
      const b = createBattle({
        data: gameData,
        heroes: [{ uid: 'h', heroId, rank, x: 3, y: 3 }],
        enemies: makeDummyEnemies(1).list,
        seed: 1,
      });
      const u = b.state.units.find((x) => x.uid === 'h');
      hps.push(u.maxHp);
    }
    assert(
      hps[0] < hps[1] && hps[1] < hps[2] && hps[2] < hps[3],
      `Hero ${heroId} MaxHP scales strictly upward across Ranks C/B/A/S: ${hps.join(' -> ')}`
    );
  }

  // Test all 105 RankModifiers at Rank S (Rank 4)
  const rmEntries = Object.values(gameData.rankModifiers);
  assert(rmEntries.length === 105, `game_data.json has 105 rankModifiers (found ${rmEntries.length})`);

  for (let i = 0; i < rmEntries.length; i++) {
    const rm = rmEntries[i];
    const heroId = EXPECTED_HERO_IDS[i % EXPECTED_HERO_IDS.length];
    const isBackupRm =
      (rm.tags || []).includes('Backup') ||
      /\[Backup|<backup>/i.test(rm.description || '') ||
      [...(rm.effects || []), ...(rm.specialEffects || [])].some((e) => e.type === 'ReserveOnlyModularEffect');

    const battle = createBattle({
      data: gameData,
      heroes: [
        {
          uid: `rm_hero_${rm.id}`,
          heroId,
          rank: 4,
          rankModifierIds: [rm.id],
          benched: isBackupRm,
          x: isBackupRm ? -1 : 3,
          y: 3,
        },
        {
          uid: 'board_ally',
          heroId: 2,
          rank: 4,
          x: 2,
          y: 3,
        },
      ],
      enemies: makeDummyEnemies(2).list,
      seed: 2000 + Number(rm.id),
    });
    tuneEnemies(battle, 8000);

    for (let f = 0; f < 60; f++) {
      battle.tick(FIXED_DT);
    }
    assertNoNaNsInBattle(battle, `RankModifier_${rm.id}_${rm.name}`);
  }
}

console.log(`\n========================================`);
console.log(`HEROES & ABILITIES TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
if (failed > 0) {
  console.error('Failures:', failures);
  process.exit(1);
}
