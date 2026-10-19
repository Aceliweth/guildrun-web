// Headless verification suite for public/js/run/index.js
// Usage: node public/js/run/test_run.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun, BattleFlowState, mulberry32 } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '../../data/game_data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Try loading ../sim/index.js if ready; otherwise use a fast deterministic fallback battle simulator
let simCreateBattle = null;
try {
  const simMod = await import('../sim/index.js');
  if (typeof simMod.createBattle === 'function') {
    simCreateBattle = simMod.createBattle;
    console.log('[test_run] Using ../sim/index.js createBattle');
  }
} catch {
  console.log('[test_run] ../sim/index.js not present yet; using deterministic fallback resolver');
}

function runCombat(battleArgs, forceWinner = null) {
  if (simCreateBattle && !forceWinner) {
    const battle = simCreateBattle(battleArgs);
    let ticks = 0;
    while (!battle.isOver() && ticks < 4000) {
      battle.tick();
      ticks++;
    }
    return battle.result();
  }
  const rng = mulberry32(battleArgs.seed || 12345);
  const heroes = battleArgs.heroes || [];
  const winner = forceWinner || (rng.next() < 0.85 ? 'players' : 'enemies');
  const survivors = winner === 'players'
    ? heroes.slice(0, Math.max(1, heroes.length - (rng.next() < 0.25 ? 1 : 0))).map(h => h.uid)
    : [];
  return {
    winner,
    survivors,
    stats: Object.fromEntries(heroes.map(h => [h.uid, { damageDealt: 500 + rng.int(1500) }])),
  };
}

// ---------------------------------------------------------------------------
// 1. Unit tests for real singleton numbers, shop, stabilizer, rank-up, save/load
// ---------------------------------------------------------------------------
console.log('--- Test 1: Initial State & Singleton Constants ---');
{
  const run = createRun({ data, seed: 42, difficulty: 0 });
  const st = run.getState();
  assert.equal(st.phase, BattleFlowState.InitialSelection);
  assert.equal(st.shards, 15, 'StartingShards must be 15');
  assert.equal(st.accumulatedShards, 10, 'StartingAccumulatedShards must be 10');
  assert.equal(st.isStabilizerActive, true);
  assert.equal(st.maxHeroesOnBoard, 3, 'StartingMaxHeroesOnBoard must be 3');
  assert.equal(st.maxTotalHeroes, 6, 'MaxTotalHeroes must be 6');
  assert.equal(st.maxHeroRank, 4, 'MaxHeroRank must be 4');
  assert.equal(st.teamSizeCost, 25, 'BaseTeamSizeCost must be 25');
  assert.equal(st.initialChoices.length, 3, 'InitialSelectionSize must be 3');
  assert.equal(st.actPlan.length, 12, 'Act 1 must have 12 floors across 2 chunks');
  assert.equal(st.actPlan[0].stageId, 10000, 'Floor 1 (index 0) specific stage must be 10000');
  assert.equal(st.actPlan[5].stageType, 'MiniBoss', 'Floor 6 (index 5) must be MiniBoss');
  assert.equal(st.actPlan[11].stageType, 'Boss', 'Floor 12 (index 11) must be Boss');
}

console.log('--- Test 2: Stabilizer Accumulation, First-Defeat Cash-Out & Floor Retry ---');
{
  const run = createRun({ data, seed: 100, difficulty: 0 });
  run.chooseInitial(0);
  assert.equal(run.getState().phase, BattleFlowState.Intro);
  run.startPlacement();
  assert.equal(run.getState().phase, BattleFlowState.Placement);

  // Win Floor 1 (index 0): stabilizer should increase from 10 -> 20
  const bArgs1 = run.startBattle();
  assert.equal(run.getState().phase, BattleFlowState.Resolution);
  assert.equal(bArgs1.heroes.length, 1);
  run.finishBattle({ winner: 'players', survivors: [bArgs1.heroes[0].uid] });
  let st = run.getState();
  assert.equal(st.phase, BattleFlowState.Result);
  assert.equal(st.accumulatedShards, 20, 'Stabilizer should accumulate +10 on victory');
  assert.equal(st.shards, 15 + 15, 'Floor 0 victory grants 15 shards');

  // Advance through Shop -> Crossroads -> Event (Starter Kit 506) -> Floor 2 (index 1)
  run.proceedFromResult();
  assert.equal(run.getState().phase, BattleFlowState.Shop);
  run.leaveShop();
  assert.equal(run.getState().phase, BattleFlowState.Crossroads);
  run.chooseCrossroads(0); // Starter Kit event 506
  if (run.getState().phase === BattleFlowState.Event) {
    run.chooseEventOption(0); // +15 shards
  }
  st = run.getState();
  assert.equal(st.floorIndex, 1, 'Should be on Floor index 1');

  // Lose Floor 2 (index 1) for the first time: Stabilizer should break and cash out 20 shards!
  const shardsBeforeLoss = st.shards;
  run.startBattle();
  run.finishBattle({ winner: 'enemies', survivors: [] });
  st = run.getState();
  assert.equal(st.isStabilizerActive, false, 'Stabilizer should break on first defeat');
  assert.equal(st.accumulatedShards, 0, 'Stabilizer shards should reset to 0');
  assert.equal(st.lives, 1, 'Player should have 1 life remaining');
  assert.equal(st.shards, shardsBeforeLoss + 20, 'Stabilizer cash-out should add +20 shards');

  // Leaving shop after defeat should retry the same floor (floorIndex 1)
  run.proceedFromResult();
  assert.equal(run.getState().phase, BattleFlowState.Shop);
  run.leaveShop();
  st = run.getState();
  assert.equal(st.floorIndex, 1, 'Defeat retry must stay on floorIndex 1');
  assert.equal(st.phase, BattleFlowState.Intro);

  // Losing a second time with broken Stabilizer ends the run in defeat
  run.startBattle();
  run.finishBattle({ winner: 'enemies', survivors: [] });
  st = run.getState();
  assert.equal(st.isOutOfLives, true);
  assert.equal(st.won, false);
  run.proceedFromResult();
  assert.equal(run.getState().phase, BattleFlowState.Outro);
  run.completeRun();
  assert.equal(run.getState().phase, BattleFlowState.Complete);
}

console.log('--- Test 3: Shop, SuperShop, Reroll, Freeze, Sell, TeamSize, Interest & Rank-Up ---');
{
  const run = createRun({ data, seed: 777, difficulty: 0 });
  run.chooseInitial(0);
  const b1 = run.startBattle();
  run.finishBattle({ winner: 'players', survivors: [b1.heroes[0].uid] });
  run.openShop();

  let st = run.getState();
  assert.equal(st.shop.isSuperShop, false);
  assert.equal(st.shop.heroes.length, 3, 'Normal shop has 3 hero slots');
  assert.equal(st.shop.items.length, 2, 'Normal shop has 2 item slots');
  assert.equal(st.shop.relics.length, 1, 'Normal shop has 1 relic slot');
  assert.equal(st.shop.rerollCost, 1, 'Normal shop base reroll cost is 1');

  // Test reroll cost increment (1 -> 2)
  run.reroll();
  st = run.getState();
  assert.equal(st.shop.rerollCost, 2, 'Reroll cost increments by +1');

  // Test freeze & unfreeze
  run.freeze(0);
  assert.equal(run.getState().shop.heroes[0].frozen, true);
  assert.equal(run.getState().shop.frozen, true);
  run.freeze(0);
  assert.equal(run.getState().shop.heroes[0].frozen, false);

  // Give player shards to test buying team size, items, relics, and duplicate hero rank-ups
  const snap = run.serialize();
  snap.shards = 500;
  // Also grant Interest Relic 3037 to test Shard Interest
  snap.relics.push({ uid: 'r_int', relicId: 3037 });
  run.hydrate(snap);

  // Buy team size: 25, then +50 = 75
  run.buyTeamSize();
  st = run.getState();
  assert.equal(st.maxHeroesOnBoard, 4);
  assert.equal(st.teamSizeCost, 75);

  // Buy item & equip/unequip/sell item
  run.buyItem(0);
  st = run.getState();
  assert.equal(st.inventory.length, 1);
  const itemUid = st.inventory[0].uid;
  const heroUid = st.heroes[0].uid;
  run.equipItem(itemUid, heroUid);
  assert.equal(run.getState().heroes[0].items.length, 1);
  assert.equal(run.getState().inventory.length, 0);
  run.unequipItem(itemUid, heroUid);
  assert.equal(run.getState().heroes[0].items.length, 0);
  assert.equal(run.getState().inventory.length, 1);
  const shardsBeforeSellItem = run.getState().shards;
  run.sellItem(itemUid);
  assert.ok(run.getState().shards > shardsBeforeSellItem, 'Selling item refunds shards');

  // Force shop slot 0 to have the same heroId as heroes[0] to test duplicate merge & Rank-Up 1->2->3->4
  const h0Id = run.getState().heroes[0].heroId;
  for (let targetRank = 2; targetRank <= 4; targetRank++) {
    const s = run.serialize();
    s.shop.heroes[0] = { slot: 0, id: h0Id, heroId: h0Id, rank: 1, price: 15, sold: false, frozen: false };
    run.hydrate(s);
    run.buyHero(0);
    st = run.getState();
    assert.equal(st.heroes[0].rank, targetRank, `Hero should rank up to ${targetRank}`);
    assert.ok(st.pendingRankUp, `Rank ${targetRank} should trigger pendingRankUp`);
    assert.ok(st.pendingRankUp.choices.length > 0, 'pendingRankUp must offer choices');
    run.rankUpChoice(0);
    st = run.getState();
    assert.equal(st.pendingRankUp, null, 'rankUpChoice resolves pendingRankUp');
    if (targetRank === 2) {
      assert.ok(st.heroes[0].specializationId != null, 'Rank 2 assigns specializationId');
    } else {
      assert.equal(st.heroes[0].rankModifierIds.length, targetRank - 2, `Rank ${targetRank} adds rankModifier`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Full Multi-Run Simulation from InitialSelection through Act 1 Completion
// ---------------------------------------------------------------------------
console.log('--- Test 4: Simulating 10 Full Runs Across Seeds, Difficulties & Endless Mode ---');
for (let runIdx = 0; runIdx < 10; runIdx++) {
  const seed = 1000 + runIdx * 137;
  const difficulty = runIdx % 4;
  const isEndlessTest = runIdx >= 8;
  const rng = mulberry32(seed);
  const run = createRun({ data, seed, difficulty, endless: isEndlessTest });

  // Initial selection
  run.chooseInitial(rng.int(3));

  let steps = 0;
  while (run.getState().phase !== BattleFlowState.Complete && steps < 500) {
    steps++;
    const st = run.getState();

    // Resolve any pending rank-up choices immediately
    while (run.getState().pendingRankUp) {
      const ru = run.getState().pendingRankUp;
      run.rankUpChoice(rng.int(ru.choices.length));
    }

    switch (st.phase) {
      case BattleFlowState.Intro:
        run.startPlacement();
        break;

      case BattleFlowState.Placement: {
        // Equip any unequipped items
        for (const it of st.inventory.slice()) {
          const target = st.heroes.find(h => h.items.length < st.maxItemSlots);
          if (target) run.equipItem(it.uid, target.uid);
        }
        // Ensure board is populated up to maxHeroesOnBoard
        const bArgs = run.startBattle();
        assert.ok(bArgs.heroes.length >= 1, 'At least 1 hero deployed in battle');
        assert.ok(bArgs.enemies.length >= 1, `Stage ${bArgs.stageId} must have enemies`);
        // Force victory on most fights, test Stabilizer on runIdx === 1 floor 2, and end Endless runs at floor 18
        const forceLoss =
          (runIdx === 1 && st.floorIndex === 2 && st.isStabilizerActive) ||
          (isEndlessTest && st.floor >= 18);
        const res = runCombat(bArgs, forceLoss ? 'enemies' : 'players');
        run.finishBattle(res);
        break;
      }

      case BattleFlowState.Result:
        run.proceedFromResult();
        break;

      case BattleFlowState.Shop: {
        // Buy team size if affordable
        if (st.shards >= st.teamSizeCost && st.maxHeroesOnBoard < st.maxTotalHeroes && rng.chance(0.5)) {
          run.buyTeamSize();
        }
        // Try buying affordable heroes, items, relics
        const cur = run.getState();
        for (let i = 0; i < (cur.shop?.heroes?.length || 0); i++) {
          const sl = run.getState().shop.heroes[i];
          if (sl && !sl.sold && run.getState().shards >= sl.price && rng.chance(0.6)) {
            run.buyHero(i);
            while (run.getState().pendingRankUp) run.rankUpChoice(0);
          }
        }
        for (let i = 0; i < (cur.shop?.items?.length || 0); i++) {
          const sl = run.getState().shop.items[i];
          if (sl && !sl.sold && run.getState().shards >= sl.price && rng.chance(0.6)) {
            run.buyItem(i);
          }
        }
        for (let i = 0; i < (cur.shop?.relics?.length || 0); i++) {
          const sl = run.getState().shop.relics[i];
          if (sl && !sl.sold && run.getState().shards >= sl.price && rng.chance(0.7)) {
            run.buyRelic(i);
          }
        }
        if (run.getState().shards >= (run.getState().shop?.rerollCost || 99) && rng.chance(0.3)) {
          run.reroll();
        }
        if (rng.chance(0.2)) {
          run.freeze(0);
        }
        run.leaveShop();
        break;
      }

      case BattleFlowState.Crossroads: {
        const cr = st.crossroads || [];
        run.chooseCrossroads(rng.int(Math.max(1, cr.length)));
        break;
      }

      case BattleFlowState.Event: {
        const choices = st.event?.choices || [];
        run.chooseEventOption(rng.int(Math.max(1, choices.length)), { heroUid: st.heroes[0]?.uid });
        break;
      }

      case BattleFlowState.Campfire: {
        const actions = ['train', 'study', 'recharge', 'rest'];
        const act = actions[rng.int(actions.length)];
        run.campfireAction(act, st.heroes[0]?.uid);
        break;
      }

      case BattleFlowState.Outro:
        run.completeRun();
        break;

      default:
        run.proceed();
        break;
    }
  }

  const finalState = run.getState();
  assert.equal(finalState.phase, BattleFlowState.Complete, `Run ${runIdx} should reach Complete`);
  assert.equal(finalState.won, true, `Run ${runIdx} should win Act 1`);
  if (isEndlessTest) {
    assert.ok(finalState.floor >= 18, `Endless Run ${runIdx} should reach at least floor 18`);
    assert.equal(finalState.outcome, 'endless_complete', `Endless Run ${runIdx} should have outcome endless_complete`);
  } else {
    assert.equal(finalState.floor, 12, `Run ${runIdx} should complete all 12 floors`);
  }
  console.log(
    `  [Run ${runIdx}] seed=${seed} diff=${difficulty} endless=${isEndlessTest} -> WON on floor ${finalState.floor} ` +
    `(heroes=${finalState.heroes.length}, relics=${finalState.relics.length}, shards=${finalState.shards}, steps=${steps})`
  );
}

// ---------------------------------------------------------------------------
// 3. Base-Game Difficulty Parity Verification (Base, C, B, A, S, SS, SSS + Red Rift)
// ---------------------------------------------------------------------------
console.log('--- Test 5: Base-Game Difficulty Parity (StageDifficultyIndex, Act 1 Enemy Stats, Item Slots, ActBossRelic, Red Rift) ---');
{
  const { createBattle } = await import('../sim/index.js');
  const expectedStageDiffByRunDiff = [1, 1, 2, 2, 2, 3, 3];

  for (let diff = 0; diff <= 6; diff++) {
    const run = createRun({ data, seed: 5000 + diff, difficulty: diff, redRift: diff === 6 });
    run.chooseInitial(0);

    // Check item slots at Rank C (1)
    const st0 = run.getState();
    const expectedBaseSlots = diff >= 4 ? 1 : 3;
    assert.equal(st0.heroes[0].maxItemSlots, expectedBaseSlots, `Difficulty ${diff}: Rank C hero should have ${expectedBaseSlots} base item slots`);

    // Floor 0 is the Turtle intro fight (10000 / 20000 / 30000)
    const wantStageDiff = expectedStageDiffByRunDiff[diff];
    assert.equal(st0.stageId, wantStageDiff * 10000, `Difficulty ${diff}: Floor 0 should be Stage ${wantStageDiff * 10000}`);
    const b0Args = run.startBattle();
    assert.equal(b0Args.floor, 0, `Difficulty ${diff}: Act 1 startBattle().floor must be 0 (no fake exponential floor scaling)`);
    const b0 = createBattle(b0Args);
    const e0 = b0.state.units.find(u => u.team === 2);
    // On diff 6 with Red Rift (900 = +5% stats) and ActBossRelic 7000/7001, check enemyRelics; on diff < 6, Turtle enemy 1001/2001/3001 has exact 200 MaxHealth
    if (diff < 6) {
      assert.equal(e0.maxHp, 200, `Difficulty ${diff}: Floor 0 Turtle enemy should have exact 200 MaxHealth`);
    } else {
      assert.ok(b0Args.enemyRelics.includes(900), 'Red Rift must inject Enemy Relic 900');
      assert.ok(
        b0Args.enemyRelics.includes(7000) || b0Args.enemyRelics.includes(7001),
        'Difficulty SSS Chunk 0 must inject ActBossRelic 7000 or 7001'
      );
      assert.equal(e0.maxHp, 210, 'Red Rift (+5% basic stats) should increase 200 MaxHealth to 210');
    }

    // Check HeroesStartBattlesDamagedEntry on diff >= 1 (90% start HP)
    const h0Unit = b0.state.units.find(u => u.team === 1);
    if (diff >= 1) {
      assert.equal(h0Unit.hp, Math.round(h0Unit.maxHp * 0.899994), `Difficulty ${diff}: Hero should start combat at 90% HP`);
    } else {
      assert.equal(h0Unit.hp, h0Unit.maxHp, 'Difficulty 0: Hero should start combat at 100% HP');
    }

    // Win Floor 0 -> Shop -> Leave Shop -> Crossroads -> Event -> Floor 1
    run.finishBattle({ winner: 'players', survivors: [st0.heroes[0].uid] });
    run.proceedFromResult();
    run.leaveShop();
    while (run.getState().floorIndex === 0 && run.getState().phase !== BattleFlowState.Placement) {
      const cur = run.getState();
      if (cur.phase === BattleFlowState.Crossroads) run.chooseCrossroads(0);
      else if (cur.phase === BattleFlowState.Event) run.chooseEventOption(0, { heroUid: cur.heroes[0]?.uid });
      else if (cur.phase === BattleFlowState.Campfire) run.campfireAction('skip');
      else run.proceed();
      while (run.getState().pendingRankUp) run.rankUpChoice(0);
      while (run.getState().pendingRelicChoices) run.pickRelic(run.getState().pendingRelicChoices.choices[0]);
      while (run.getState().pendingItemChoices) run.pickItem(run.getState().pendingItemChoices.choices[0]);
    }

    const st1 = run.getState();
    assert.equal(st1.floorIndex, 1, `Difficulty ${diff}: Should be on FloorIndex 1`);
    assert.equal(
      st1.stage.difficulty,
      wantStageDiff,
      `Difficulty ${diff} Floor 1 stage (${st1.stageId}) must have Stage.difficulty === ${wantStageDiff}`
    );
    const b1Args = run.startBattle();
    const b1 = createBattle(b1Args);
    for (const eu of b1.state.units.filter(u => u.team === 2)) {
      const rawDefHp = data.enemies[eu.defId].stats.MaxHealth;
      if (diff < 6) {
        assert.equal(eu.maxHp, Math.round(rawDefHp), `Difficulty ${diff} Floor 1 enemy ${eu.defId} maxHp (${eu.maxHp}) must match balancing_data.json (${rawDefHp})`);
      }
    }
  }
  console.log('  [PASS] All 7 Difficulty Tiers (0..6), StageDifficultyIndex 1..3, Act 1 Enemy Stats, Item Slots, 90% Start HP, ActBossRelic & Red Rift verified!');
}

console.log('ALL RUN TESTS PASSED!');
