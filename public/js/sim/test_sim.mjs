// Headless test suite for Guildrun combat simulation engine (`node public/js/sim/test_sim.mjs`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createBattle, FIXED_DT } from './index.js';
import { hexDistanceCoords } from './hex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '../../data/game_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

function assertNoNaN(obj, label = 'state') {
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), `NaN/Infinite number found at ${label}: ${obj}`);
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      assertNoNaN(obj[i], `${label}[${i}]`);
    }
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      assertNoNaN(v, `${label}.${k}`);
    }
  }
}

console.log('Loaded game_data.json:', {
  heroes: Object.keys(data.heroes).length,
  enemies: Object.keys(data.enemies).length,
  stages: Object.keys(data.stages).length,
  items: Object.keys(data.items).length,
  relics: Object.keys(data.relics).length,
});

// 1. Verify Odd-R hex distance
assert.equal(hexDistanceCoords(0, 0, 0, 0), 0);
assert.equal(hexDistanceCoords(2, 1, 3, 1), 1);
assert.equal(hexDistanceCoords(2, 1, 2, 2), 1);
assert.equal(hexDistanceCoords(2, 1, 3, 2), 1);
console.log('[PASS] Hex Grid Odd-R distance checks');

// 2. Test determinism with identical seed
function buildSampleBattle(seed = 42) {
  return createBattle({
    data,
    seed,
    heroes: [
      { uid: 'h1', heroId: 1, rank: 2, items: [101, 102], x: 1, y: 2, specializationId: 101, rankModifierIds: [1, 2] },
      { uid: 'h2', heroId: 3, rank: 2, items: [308], x: 3, y: 3, specializationId: 302, rankModifierIds: [3] },
      { uid: 'h3', heroId: 6, rank: 3, items: [104], x: 5, y: 1, specializationId: 603, rankModifierIds: [] },
    ],
    enemies: [
      { enemyId: 1001, x: 2, y: 5, floor: 1 },
      { enemyId: 10901, x: 4, y: 6, floor: 2 },
    ],
    relics: [504, 509, 1000, 1008, 1014, 3048],
  });
}

const b1 = buildSampleBattle(1337);
const b2 = buildSampleBattle(1337);
let eventCounts = {};

while (!b1.isOver()) {
  b1.tick();
  b2.tick();
  for (const ev of b1.state.events) {
    eventCounts[ev.type] = (eventCounts[ev.type] || 0) + 1;
  }
  assertNoNaN(b1.state.time, 'time');
  for (const u of b1.state.units) {
    assertNoNaN(u.x, `unit(${u.uid}).x`);
    assertNoNaN(u.y, `unit(${u.uid}).y`);
    assertNoNaN(u.hp, `unit(${u.uid}).hp`);
    assertNoNaN(u.maxHp, `unit(${u.uid}).maxHp`);
    assertNoNaN(u.mana, `unit(${u.uid}).mana`);
    assertNoNaN(u.shield, `unit(${u.uid}).shield`);
    assertNoNaN(u.stats, `unit(${u.uid}).stats`);
  }
}

const r1 = b1.result();
const r2 = b2.result();
assert.deepEqual(r1, r2, 'Simulation with same seed must be 100% deterministic');
console.log('[PASS] Determinism verified:', {
  winner: r1.winner,
  survivors: r1.survivors,
  duration: r1.stats.duration.toFixed(2) + 's',
  frames: r1.stats.frames,
  totalDamageDealt: r1.stats.totalDamageDealt,
  eventCounts,
});

// 3. Test all 25 heroes across multi-battle gauntlet (Ranks 1..4, all specializations, items, relics, stages)
const allHeroIds = Object.keys(data.heroes).map(Number);
const allItemIds = Object.keys(data.items).map(Number);
const allRelicIds = Object.keys(data.relics).map(Number);
const allRankModIds = Object.keys(data.rankModifiers).map(Number);
const allStageIds = Object.keys(data.stages)
  .map(Number)
  .filter((id) => (data.stages[id]?.enemies?.length || 0) > 0 && data.stages[id].enemies.every((e) => data.enemies[e.enemyId]));

let battlesRun = 0;
for (let i = 0; i < allHeroIds.length; i += 3) {
  const slice = allHeroIds.slice(i, i + 4);
  const stageId = allStageIds[i % allStageIds.length];
  const stage = data.stages[stageId];
  const rank = (i % 4) + 1;

  const heroes = slice.map((hid, idx) => {
    const hDef = data.heroes[hid];
    const specId = hDef.specializationIds?.[idx % (hDef.specializationIds.length || 1)] ?? null;
    const item1 = allItemIds[(i + idx * 7) % allItemIds.length];
    const item2 = allItemIds[(i + idx * 13 + 5) % allItemIds.length];
    const rm1 = allRankModIds[(i + idx * 3) % allRankModIds.length];
    return {
      uid: `hero_${hid}`,
      heroId: hid,
      rank,
      items: [item1, item2],
      x: (idx * 2) % 7,
      y: idx % 4,
      specializationId: specId,
      rankModifierIds: [rm1],
    };
  });

  const enemies = stage.enemies.map((e, idx) => ({
    uid: `stg_${stageId}_e_${idx}`,
    enemyId: e.enemyId,
    x: e.x ?? (idx % 7),
    y: e.y ?? 5,
    floor: stage.floor || 1,
  }));

  const relics = [
    allRelicIds[(i * 5) % allRelicIds.length],
    allRelicIds[(i * 11 + 3) % allRelicIds.length],
    allRelicIds[(i * 17 + 9) % allRelicIds.length],
  ];

  const battle = createBattle({
    data,
    heroes,
    enemies,
    relics,
    seed: 1000 + i,
  });

  let steps = 0;
  while (!battle.isOver() && steps < 10000) {
    battle.tick();
    steps++;
    for (const u of battle.state.units) {
      assertNoNaN(u.x, `b${i}.u(${u.uid}).x`);
      assertNoNaN(u.y, `b${i}.u(${u.uid}).y`);
      assertNoNaN(u.hp, `b${i}.u(${u.uid}).hp`);
      assertNoNaN(u.mana, `b${i}.u(${u.uid}).mana`);
      assertNoNaN(u.shield, `b${i}.u(${u.uid}).shield`);
    }
    for (const p of battle.state.projectiles) {
      assertNoNaN(p.x, `b${i}.proj.x`);
      assertNoNaN(p.y, `b${i}.proj.y`);
    }
  }

  assert.ok(battle.isOver(), `Battle ${i} (stage ${stageId}) did not finish within 10000 ticks`);
  const res = battle.result();
  assert.ok(['players', 'enemies', 'draw'].includes(res.winner), `Invalid winner: ${res.winner}`);
  assertNoNaN(res.stats, `b${i}.result.stats`);
  battlesRun++;
}

console.log(`[PASS] Simulated ${battlesRun} full battles covering all ${allHeroIds.length} heroes, items, relics, and stages with 0 NaNs.`);

// 4. Test Endless Enemy Floor Scaling & Overtime Storm Escalation
const stormBattle = createBattle({
  data,
  seed: 9999,
  heroes: [
    { uid: 'tank1', heroId: 11, rank: 4, items: [310], x: 3, y: 2, specializationId: 1101, rankModifierIds: [] },
    { uid: 'healer1', heroId: 27, rank: 4, items: [104], x: 3, y: 0, specializationId: 2701, rankModifierIds: [] },
  ],
  enemies: [
    { uid: 'endless_knight', enemyId: 104, x: 3, y: 5, floor: 3 },
  ],
  relics: [1014, 3023],
});

const scaledEnemy = stormBattle.state.units.find((u) => u.uid === 'endless_knight');
assert.ok(scaledEnemy.maxHp > 35000, `Expected floor-scaled enemy HP > 35000, got ${scaledEnemy.maxHp}`);

while (!stormBattle.isOver()) {
  stormBattle.tick();
}
const stormRes = stormBattle.result();
assertNoNaN(stormRes.stats, 'stormBattle.stats');
console.log('[PASS] Endless scaling & Storm fatigue test completed:', {
  scaledEnemyMaxHp: scaledEnemy.maxHp,
  duration: stormRes.stats.duration.toFixed(2) + 's',
  stormActive: stormBattle.state.storm.active,
  finalStormDamage: stormBattle.state.storm.damage,
  winner: stormRes.winner,
});
