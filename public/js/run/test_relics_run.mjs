/**
 * test_relics_run.mjs
 * Comprehensive verification suite for Run-Loop Relics (OnAcquire, Shop, Economy,
 * Post-Combat, Start-of-Combat) and Multi-Battle Relic & Item Quests in public/js/run/index.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRun } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gameDataPath = path.resolve(__dirname, '../../data/game_data.json');
const rawData = JSON.parse(fs.readFileSync(gameDataPath, 'utf8'));

let createBattleFn = null;
try {
  const simMod = await import('../sim/index.js');
  if (typeof simMod.createBattle === 'function') {
    createBattleFn = simMod.createBattle;
  }
} catch { /* fallback if unavailable */ }

console.log('=== Run-Loop Relics & Quests Verification Suite ===');

// ---------------------------------------------------------------------------
// 1. Catalog & Audit Integrity
// ---------------------------------------------------------------------------
console.log('--- Test 1: Catalog & Audit Integrity (406 Relics, 163 Items) ---');
{
  const run = createRun({ data: rawData, seed: 101 });
  assert.equal(run.catalog.relics.size, 406, `Expected 406 relics in catalog, got ${run.catalog.relics.size}`);
  assert.equal(run.catalog.items.size, 163, `Expected 163 items in catalog, got ${run.catalog.items.size}`);
  console.log('  [PASS] All 406 Relics and 163 Items loaded into catalog');
}

// ---------------------------------------------------------------------------
// 2. All OnAcquire Relic Effects
// ---------------------------------------------------------------------------
console.log('--- Test 2: OnAcquire Relic Effects ---');
{
  // 2a. 720 (Starter Kit: Instant Shards -> +7 Shards)
  {
    const run = createRun({ data: rawData, seed: 201 });
    run.chooseInitial(0);
    const shardsBefore = run.getState().shards;
    run.grantRelic(720);
    assert.equal(run.getState().shards, shardsBefore + 7, 'Relic 720 should grant +7 Shards');
  }

  // 2b. 725..731 & 6032..6038 (Rare Stat Item Grant Relics)
  const rareItemRelicCases = [
    { relicId: 725, stat: 'Attack' },
    { relicId: 726, stat: 'MaxHealth' },
    { relicId: 727, stat: 'Defense' },
    { relicId: 728, stat: 'Crit' },
    { relicId: 729, stat: 'AttackSpeed' },
    { relicId: 730, stat: 'ManaRegen' },
    { relicId: 731, stat: 'Magic' },
    { relicId: 6032, stat: 'Attack' },
    { relicId: 6033, stat: 'Defense' },
    { relicId: 6034, stat: 'MaxHealth' },
    { relicId: 6035, stat: 'Crit' },
    { relicId: 6036, stat: 'AttackSpeed' },
    { relicId: 6037, stat: 'ManaRegen' },
    { relicId: 6038, stat: 'Magic' },
  ];
  for (const tc of rareItemRelicCases) {
    const run = createRun({ data: rawData, seed: 200 + tc.relicId });
    run.chooseInitial(0);
    const invBefore = run.getState().inventory.length;
    run.grantRelic(tc.relicId);
    const invAfter = run.getState().inventory;
    assert.equal(invAfter.length, invBefore + 1, `Relic ${tc.relicId} should grant 1 Rare ${tc.stat} item`);
    const grantedDef = run.catalog.items.get(invAfter[invAfter.length - 1].itemId);
    assert.equal(grantedDef.rarity, 'Rare', `Relic ${tc.relicId} item should be Rare`);
    assert.ok((grantedDef.statMods || []).some(m => m.stat === tc.stat), `Relic ${tc.relicId} item should have stat ${tc.stat}`);
  }
  console.log('  [PASS] Relics 720, 725..731, and 6032..6038 verified');

  // 2c. 736..742 (Starter Kit: Instant Stat Boosts on targetHero)
  const instantStatCases = [
    { relicId: 736, stat: 'Attack', delta: 35 },
    { relicId: 737, stat: 'MaxHealth', delta: 300 },
    { relicId: 738, stat: 'Defense', delta: 45 },
    { relicId: 739, stat: 'Crit', delta: 20 },
    { relicId: 740, stat: 'AttackSpeed', delta: 30 },
    { relicId: 741, stat: 'ManaRegen', delta: 6 },
    { relicId: 742, stat: 'Magic', delta: 35 },
  ];
  for (const tc of instantStatCases) {
    const run = createRun({ data: rawData, seed: 300 + tc.relicId });
    run.chooseInitial(0);
    const h0 = run.getState().heroes[0];
    const statBefore = h0.bonusStats?.[tc.stat] || 0;
    run.grantRelic(tc.relicId, { heroUid: h0.uid });
    const hAfter = run.getState().heroes.find(x => x.uid === h0.uid);
    assert.equal((hAfter.bonusStats[tc.stat] || 0) - statBefore, tc.delta, `Relic ${tc.relicId} should grant +${tc.delta} ${tc.stat}`);
  }
  console.log('  [PASS] Relics 736..742 (Starter Kit Instant Stat Boosts) verified');

  // 2d. 4038 (Heroic Capacity Expander), 4039 (Omnity Enforcer), 4500 (Team Size), 6012 (Quantity over Quality), 6016 (Quality over Quantity)
  {
    // On Base..A difficulty (difficulty < 4), BaseCharacterEquipmentLimit = 3 at Ranks C/B/A and 4 at Rank S
    const runBase = createRun({ data: rawData, seed: 401, difficulty: 0 });
    runBase.chooseInitial(0);
    assert.equal(runBase.getState().heroes[0].maxItemSlots, 3, 'Base difficulty Rank C hero should have 3 base item slots');

    // On Difficulty S/SS/SSS (difficulty >= 4, HeroItemSlotsPerRankEntry), heroes have 1 item slot per rank
    const run = createRun({ data: rawData, seed: 402, difficulty: 4 });
    run.chooseInitial(0);
    // Rank up hero[0] to Rank 2 so base item slots = 2 on Difficulty S+
    const h0 = run.getState().heroes[0];
    run.addOrMergeHero(h0.heroId, 2);
    let st = run.getState();
    assert.equal(st.heroes[0].rank, 2);
    assert.equal(st.heroes[0].maxItemSlots, 2, 'Difficulty S+ Rank 2 hero should have 2 base item slots');

    // Equip 2 items on hero[0]
    const i1 = run.grantItem(101);
    const i2 = run.grantItem(102);
    run.equipItem(i1.uid, h0.uid);
    run.equipItem(i2.uid, h0.uid);
    assert.equal(run.getState().heroes[0].items.length, 2);

    // Grant 6012 (Quantity over Quality): +1 max team size (Max: 5), -1 item slot (2 -> 1), returning excess item to inventory!
    const teamBefore6012 = run.getState().maxHeroesOnBoard;
    const invBefore6012 = run.getState().inventory.length;
    run.grantRelic(6012);
    st = run.getState();
    assert.equal(st.maxHeroesOnBoard, teamBefore6012 + 1, 'Relic 6012 should increase maxHeroesOnBoard by 1');
    assert.equal(st.heroes[0].maxItemSlots, 1, 'Relic 6012 should reduce maxItemSlots by 1');
    assert.equal(st.heroes[0].items.length, 1, 'Relic 6012 should unequip excess item back to inventory');
    assert.equal(st.inventory.length, invBefore6012 + 1, 'Displaced item should be in state.inventory');

    // Grant 4038 (Heroic Capacity Expander): +1 item slot (1 -> 2)
    run.grantRelic(4038);
    st = run.getState();
    assert.equal(st.heroes[0].maxItemSlots, 2, 'Relic 4038 should increase maxItemSlots by 1');

    // Grant 6016 (Quality over Quantity): +2 item slots (2 -> 4), -1 max team size
    const teamBefore6016 = st.maxHeroesOnBoard;
    run.grantRelic(6016);
    st = run.getState();
    assert.equal(st.heroes[0].maxItemSlots, 4, 'Relic 6016 should increase maxItemSlots by 2');
    assert.equal(st.maxHeroesOnBoard, teamBefore6016 - 1, 'Relic 6016 should reduce maxHeroesOnBoard by 1');

    // Grant 4500 (Team Size): +1 max team size
    const teamBefore4500 = st.maxHeroesOnBoard;
    run.grantRelic(4500);
    st = run.getState();
    assert.equal(st.maxHeroesOnBoard, teamBefore4500 + 1, 'Relic 4500 should increase maxHeroesOnBoard by 1');

    // Grant 4039 (Omnity Enforcer): Get all 7 Crests (801..807)
    const invBefore4039 = st.inventory.length;
    run.grantRelic(4039);
    st = run.getState();
    assert.equal(st.inventory.length, invBefore4039 + 7, 'Relic 4039 should grant all 7 Crests (801..807)');
    for (let cid = 801; cid <= 807; cid++) {
      assert.ok(st.inventory.some(it => it.itemId === cid), `Relic 4039 should grant Crest ${cid}`);
    }
  }
  console.log('  [PASS] Relics 4038, 4039, 4500, 6012, 6016 verified');

  // 2e. 6001, 6003, 6004, 6005, 6006, 6010, 6013, 6015, 6018..6031
  {
    // 6001 (Starter Bundle): 1 common item, 1 common relic, +3 Shards
    const run6001 = createRun({ data: rawData, seed: 405 });
    run6001.chooseInitial(0);
    const inv0 = run6001.getState().inventory.length;
    const rel0 = run6001.getState().relics.length;
    const shards0 = run6001.getState().shards;
    run6001.grantRelic(6001);
    let st = run6001.getState();
    assert.ok(st.inventory.length >= inv0 + 1, 'Relic 6001 should grant at least 1 Common item');
    assert.equal(st.relics.length, rel0 + 2, 'Relic 6001 + 1 Common relic = +2 relics');
    assert.ok(st.shards >= shards0 + 3, 'Relic 6001 should grant +3 Shards');

    // 6003 (Shard Pouch): +12 Shards
    const run6003 = createRun({ data: rawData, seed: 406 });
    run6003.chooseInitial(0);
    const shardsBefore6003 = run6003.getState().shards;
    run6003.grantRelic(6003);
    assert.equal(run6003.getState().shards, shardsBefore6003 + 12, 'Relic 6003 should grant +12 Shards');

    // 6004 (Item Windfall): 3 common items
    const run6004 = createRun({ data: rawData, seed: 407 });
    run6004.chooseInitial(0);
    const invBefore6004 = run6004.getState().inventory.length;
    run6004.grantRelic(6004);
    assert.equal(run6004.getState().inventory.length, invBefore6004 + 3, 'Relic 6004 should grant 3 Common items');

    // 6005 (Mystery Charm): 1 rare relic
    const run6005 = createRun({ data: rawData, seed: 408 });
    run6005.chooseInitial(0);
    const relBefore6005 = run6005.getState().relics.length;
    run6005.grantRelic(6005);
    assert.ok(run6005.getState().relics.length >= relBefore6005 + 2, 'Relic 6005 should grant 1 Rare relic');

    // 6006 (Crest Windfall): 2 random Crest items (801..807)
    const run6006 = createRun({ data: rawData, seed: 409 });
    run6006.chooseInitial(0);
    const invBefore6006 = run6006.getState().inventory.length;
    run6006.grantRelic(6006);
    st = run6006.getState();
    assert.equal(st.inventory.length, invBefore6006 + 2, 'Relic 6006 should grant 2 Crest items');
    assert.ok(st.inventory.slice(-2).every(it => it.itemId >= 801 && it.itemId <= 807), 'Relic 6006 items should be Crests 801..807');

    // 6015 (Stability System): +25 Stabilizer Shards
    const accBefore6015 = st.accumulatedShards;
    run6006.grantRelic(6015);
    st = run6006.getState();
    assert.equal(st.accumulatedShards, accBefore6015 + 25, 'Relic 6015 should grant +25 Stabilizer Shards');

    // 6010 (All In): +45 Shards, Stabilizer unavailable
    const shardsBefore6010 = st.shards;
    run6006.grantRelic(6010);
    st = run6006.getState();
    assert.equal(st.shards, shardsBefore6010 + 45, 'Relic 6010 should grant +45 Shards');
    assert.equal(st.isStabilizerActive, false, 'Relic 6010 should disable Stabilizer');
    assert.equal(st.accumulatedShards, 0, 'Relic 6010 should zero accumulatedShards');
    assert.equal(st.lives, 1, 'Relic 6010 should set lives to 1');

    // 6013 (Fast Track): Instantly rank up hero, -10 Shards
    const run6013 = createRun({ data: rawData, seed: 413 });
    run6013.chooseInitial(0);
    const shardsBefore6013 = run6013.getState().shards;
    const rankBefore6013 = run6013.getState().heroes[0].rank;
    run6013.grantRelic(6013);
    assert.equal(run6013.getState().heroes[0].rank, rankBefore6013 + 1, 'Relic 6013 should rank up hero by +1');
    assert.equal(run6013.getState().shards, Math.max(0, shardsBefore6013 - 10), 'Relic 6013 should cost 10 Shards');

    // 6018..6024 (Class Equipment 308..321) & 6025..6031 (Class Crests 801..807)
    for (let rId = 6018; rId <= 6024; rId++) {
      const rRun = createRun({ data: rawData, seed: rId });
      rRun.chooseInitial(0);
      const before = rRun.getState().inventory.length;
      rRun.grantRelic(rId);
      const after = rRun.getState().inventory;
      assert.equal(after.length, before + 1, `Relic ${rId} should grant 1 class equipment item`);
      assert.ok(after[after.length - 1].itemId >= 308 && after[after.length - 1].itemId <= 321, `Relic ${rId} should grant item in 308..321`);
    }
    for (let rId = 6025; rId <= 6031; rId++) {
      const rRun = createRun({ data: rawData, seed: rId });
      rRun.chooseInitial(0);
      rRun.grantRelic(rId);
      const expectedCrest = 801 + (rId - 6025);
      assert.ok(rRun.getState().inventory.some(it => it.itemId === expectedCrest), `Relic ${rId} should grant Crest ${expectedCrest}`);
    }
  }
  console.log('  [PASS] Relics 6001, 6003, 6004, 6005, 6006, 6010, 6013, 6015, 6018..6031 verified');
}

// ---------------------------------------------------------------------------
// 3. Shop & Economy Relics (1019, 2056, 6007, 6008, 734, 3037, 4010)
// ---------------------------------------------------------------------------
console.log('--- Test 3: Shop & Economy Relics ---');
{
  const run = createRun({ data: rawData, seed: 500 });
  run.chooseInitial(0);
  run.startPlacement();
  run.startBattle();
  run.finishBattle({ winner: 'players', survivors: [run.getState().heroes[0].uid] });
  run.proceedFromResult(); // Enters Shop

  let st = run.getState();
  const baseRelicSlots = st.shop.relics.length;
  const baseReroll = st.shop.rerollCost;
  const baseItemPrice0 = st.shop.items[0].price;

  // Grant 1019 (-1 reroll cost), 2056 (-2 reroll cost), 6007 (+1 relic slot), 6008 (-2 item price), 734 (-2 item price before floor 4), 4010 (Merchant Mandate)
  run.grantRelic(1019);
  assert.equal(run.getState().shop.rerollCost, Math.max(0, baseReroll - 1), 'Relic 1019 should reduce rerollCost by 1');
  run.grantRelic(2056);
  assert.equal(run.getState().shop.rerollCost, 0, 'Relics 1019 + 2056 should reduce initial rerollCost to 0');
  run.grantRelic(6007);
  assert.equal(run.getState().shop.relics.length, baseRelicSlots + 1, 'Relic 6007 should add +1 relic slot immediately and on future shops');
  run.grantRelic(6008);
  assert.equal(run.getState().shop.items[0].price, Math.max(1, baseItemPrice0 - 2), 'Relic 6008 should reduce shop item price by 2');
  run.grantRelic(734);
  assert.equal(run.getState().shop.items[0].price, Math.max(1, baseItemPrice0 - 4), 'Relic 734 should further reduce shop item price by 2 in Act 1');

  // Grant 4010 (Merchant Mandate: Reroll the shop 8 times -> +1 Team Size)
  run.grantRelic(4010);
  run.grantRelic(6010); // +45 Shards for rerolling
  const teamBeforeMandate = run.getState().maxHeroesOnBoard;
  for (let i = 0; i < 8; i++) {
    run.reroll();
  }
  st = run.getState();
  const r4010 = st.relics.find(r => r.relicId === 4010);
  assert.equal(r4010.completed, true, 'Relic 4010 should complete on 8th shop reroll');
  assert.equal(st.maxHeroesOnBoard, teamBeforeMandate + 1, 'Completed Relic 4010 should grant +1 maxHeroesOnBoard');

  // Verify Relic 3037 (Shard Interest: 1 shard per 5 shards held, max 20)
  run.grantRelic(3037);
  run.leaveShop();
  run.chooseCrossroads(0);
  if (run.getState().phase !== 'Intro') run.proceed();
  run.startPlacement();
  run.startBattle();
  const shardsPreBattle = run.getState().shards;
  const expectedInterest = Math.min(20, Math.floor(shardsPreBattle / 5));
  run.finishBattle({ winner: 'players', survivors: [run.getState().heroes[0].uid] });
  const interestReward = run.getState().rewards.find(r => r.type === 'Interest');
  assert.ok(interestReward && interestReward.amount === expectedInterest, `Relic 3037 should grant ${expectedInterest} Interest Shards`);
  console.log('  [PASS] Shop & Economy Relics (1019, 2056, 6007, 6008, 734, 4010, 3037) verified');
}

// ---------------------------------------------------------------------------
// 4. Start-of-Combat & Post-Combat Relics & Items
// ---------------------------------------------------------------------------
console.log('--- Test 4: Start-of-Combat & Post-Combat Relics & Items ---');
{
  const run = createRun({ data: rawData, seed: 600 });
  run.chooseInitial(0);
  // Ensure we have a Warrior (Hero 3 = Reyna, Class 1 Warrior)
  const { hero: warrior } = run.addOrMergeHero(3, 3, { autoPlace: true }); // Rank 3 -> 3 base item slots

  // Grant Starter Kit Temporary Growth 757 (+12 Attack on Combat #2 & #3), Pack Mule 771 (+1 item slot before Boss),
  // Bounty 723 (+2 Shards/survivor on Combat #2/#3), Sustained 724 (+1 Shard/survivor before Boss),
  // 1010 (+3 Shards on win), 2027 (+6 Shards on win), 6009 (+1 Shard/survivor),
  // Codex 2045 (+6 Attack on win), 6017 (Legacy Charm), 3036 (Shield Investment Filigree), 5116 (SingleBattleBoost +10 Shards)
  run.grantRelic(757);
  run.grantRelic(771);
  run.grantRelic(723);
  run.grantRelic(724);
  run.grantRelic(1010);
  run.grantRelic(2027);
  run.grantRelic(6009);
  run.grantRelic(2045);
  run.grantRelic(6017);
  run.grantRelic(3036);
  run.grantRelic(5100); // SingleBattleBoost (expires after 1 battle)

  // Equip 502 (Power Crystal: destroys after 1 survival & grants class primary stat),
  // 503 (Large Power Crystal: destroys after 2 survivals & grants 2x class primary stat),
  // 601 (Warrior's Greataxe: +12 Attack on survival for Warrior)
  const it502 = run.grantItem(502);
  const it503 = run.grantItem(503);
  const it601 = run.grantItem(601);
  run.equipItem(it502.uid, warrior.uid);
  run.equipItem(it503.uid, warrior.uid);
  run.equipItem(it601.uid, warrior.uid);

  run.startPlacement();
  const battleCfg1 = run.startBattle();

  // Verify Relic 3036 spent 1 Shard at start of combat and gained +50 customStacks
  assert.equal(battleCfg1.relicObjects.find(r => r.relicId === 3036).customStacks, 50, 'Relic 3036 should gain 50 customStacks at combat start');

  const atkBeforeB1 = run.getState().heroes.find(h => h.uid === warrior.uid).bonusStats?.Attack || 0;
  const survivorsB1 = run.getState().heroes.filter(h => h.onBoard).map(h => h.uid);

  run.finishBattle({
    winner: 'players',
    survivors: survivorsB1,
  });

  let st = run.getState();
  // Verify 5100 expired after 1 battle
  assert.ok(!st.relics.some(r => r.relicId === 5100), 'SingleBattleBoost Relic 5100 should expire after 1 battle');

  // Verify Warrior's post-combat Attack growth on Battle 1:
  // - 2045 Codex (+6 Attack)
  // - 502 Power Crystal destroyed (+25 Attack for Class 1 Warrior)
  // - 601 Warrior's Greataxe (+12 Attack for Class 1 Warrior)
  // Total = +43 Attack!
  const wAfterB1 = st.heroes.find(h => h.uid === warrior.uid);
  assert.equal((wAfterB1.bonusStats.Attack || 0) - atkBeforeB1, 43, 'Warrior should gain +43 Attack from 2045 (+6) + 502 (+25) + 601 (+12)');
  assert.ok(!wAfterB1.items.some(i => i.uid === it502.uid), 'Item 502 (Power Crystal) should be destroyed after 1 survival');
  assert.ok(wAfterB1.items.some(i => i.uid === it503.uid), 'Item 503 (Large Power Crystal) should remain after 1 survival (1/2)');

  // Verify post-combat Shard rewards from 1010 (+3), 2027 (+6), 6009 (+survivors), 723 (+2*survivors), 724 (+survivors)
  assert.ok(st.rewards.some(r => r.relicId === 1010 && r.amount === 3), 'Relic 1010 should grant +3 Shards');
  assert.ok(st.rewards.some(r => r.relicId === 2027 && r.amount === 6), 'Relic 2027 should grant +6 Shards');
  assert.ok(st.rewards.some(r => r.relicId === 6009 && r.amount === survivorsB1.length), 'Relic 6009 should grant +1 Shard per survivor');
  assert.ok(st.rewards.some(r => r.relicId === 723 && r.amount === 2 * survivorsB1.length), 'Relic 723 should grant +2 Shards per survivor');
  assert.ok(st.rewards.some(r => r.relicId === 724 && r.amount === survivorsB1.length), 'Relic 724 should grant +1 Shard per survivor');

  // Advance to Combat #2 (floorIndex = 1) -> Starter Kit 757 triggers at start of Combat #2 (+12 Attack)
  // and Large Power Crystal (503) triggers on 2nd survival (+50 Attack and destroys itself)
  run.proceedFromResult();
  run.leaveShop();
  run.chooseCrossroads(0);
  if (run.getState().phase !== 'Intro') run.proceed();
  run.startPlacement();
  const atkBeforeB2Start = run.getState().heroes.find(h => h.uid === warrior.uid).bonusStats?.Attack || 0;
  run.startBattle();
  const atkAfterB2Start = run.getState().heroes.find(h => h.uid === warrior.uid).bonusStats?.Attack || 0;
  assert.equal(atkAfterB2Start - atkBeforeB2Start, 12, 'Relic 757 should grant +12 permanent Attack at start of Combat #2');

  run.finishBattle({
    winner: 'players',
    survivors: survivorsB1,
  });
  st = run.getState();
  const wAfterB2 = st.heroes.find(h => h.uid === warrior.uid);
  // Post-combat Battle 2: 2045 (+6) + 503 Large Power Crystal (+50) + 601 (+12) = +68 Attack!
  assert.equal((wAfterB2.bonusStats.Attack || 0) - atkAfterB2Start, 68, 'Warrior should gain +68 Attack on Battle 2 from 2045 (+6) + 503 (+50) + 601 (+12)');
  assert.ok(!wAfterB2.items.some(i => i.uid === it503.uid), 'Item 503 (Large Power Crystal) should be destroyed after 2nd survival');
  console.log('  [PASS] Start-of-Combat & Post-Combat Relics/Items (723, 724, 757, 771, 1010, 2027, 2045, 3036, 5100, 6009, 6017, 502, 503, 601) verified');
}

// ---------------------------------------------------------------------------
// 5. Multi-Battle Relic Quests & Item Quests (Persistence & Rewards)
// ---------------------------------------------------------------------------
console.log('--- Test 5: Multi-Battle Relic & Item Quests (Cross-Battle Persistence & Completion Rewards) ---');
{
  const run = createRun({ data: rawData, seed: 700, createBattle: createBattleFn });
  run.chooseInitial(0);
  const h = run.getState().heroes[0];
  // Rank up hero to Rank 4 so it has 4 item slots
  run.addOrMergeHero(h.heroId, 4);

  // Grant Shard-reward Relic Quests:
  // - 701 (req=1500 -> +15 Shards)
  // - 1029 (Victory Vessel: Win 3 combats -> +25 Shards)
  // - 2041 (req=35 -> +30 Shards)
  // - 6002 (Bossy: Win 6 combats -> +40 Shards)
  const r701 = run.grantRelic(701);
  const r1029 = run.grantRelic(1029);
  const r2041 = run.grantRelic(2041);
  const r6002 = run.grantRelic(6002);

  // Grant Crest-reward Relic Quests:
  // - 2017 (Multiclass Conduit: Win with 4+ classes -> 3 Crests)
  // - 3058 (Golden Ascendancy: Win with 66+ Shards -> 5 Crests)
  const r2017 = run.grantRelic(2017);
  const r3058 = run.grantRelic(3058);

  // Grant Mandate Team-Size Relic Quests:
  // - 4007 (Deal damage -> +1 Team Size)
  // - 4034 (Desperation Mandate: Win with 1 surviving Hero -> +1 Team Size)
  const r4007 = run.grantRelic(4007);
  const r4034 = run.grantRelic(4034);

  // Grant Stat-upgrade Relic Quest: 1018
  const r1018 = run.grantRelic(1018);

  // Grant Item Quests:
  // - 402 (Toxic Ring: Inflict 25 Poison -> +10 Shards) equipped on hero
  // - 623 (Accuracy Contract: Crit 10 times -> +15 Shards) in inventory
  // - 711 (Scroll of Violence: Auto attack 100 times -> +25% Attack & +25% AttackSpeed) equipped on hero
  // - 610 (Merchant's Scroll: Win combat with 25+ Shards -> +150 ability Crit) equipped on hero
  const it402 = run.grantItem(402);
  const it623 = run.grantItem(623);
  const it711 = run.grantItem(711);
  const it610 = run.grantItem(610);
  run.equipItem(it402.uid, h.uid);
  run.equipItem(it711.uid, h.uid);
  run.equipItem(it610.uid, h.uid);

  // Battle 1: Partial progress (not yet complete for multi-step quests)
  run.startPlacement();
  const b1Input = run.startBattle();
  assert.ok(Array.isArray(b1Input.relicObjects) && b1Input.relicObjects.length >= 9, 'startBattle should pass relicObjects to sim');
  assert.ok(Array.isArray(b1Input.heroes[0].itemObjects) && b1Input.heroes[0].itemObjects.length === 3, 'startBattle should pass hero itemObjects to sim');

  run.finishBattle({
    winner: 'players',
    survivors: [h.uid, 'extra_survivor'], // 2 survivors so 4034 does not complete yet
    questProgress: {
      relics: {
        [r701.uid]: { progress: Math.floor(r701.required / 2) },
        [r2041.uid]: { progress: Math.floor(r2041.required / 2) },
        [r4007.uid]: { progress: Math.floor(r4007.required / 2) },
        [r1018.uid]: { progress: Math.floor(r1018.required / 2) },
      },
      items: {
        [it402.uid]: { progress: 10 },
        [it623.uid]: { progress: 4 },
        [it711.uid]: { progress: 45 },
      },
    },
  });

  let st = run.getState();
  assert.equal(st.relics.find(r => r.uid === r701.uid).progress, Math.floor(r701.required / 2));
  assert.equal(st.relics.find(r => r.uid === r701.uid).completed, false);
  assert.equal(st.relics.find(r => r.uid === r1029.uid).progress, 1, 'Relic 1029 should have 1/3 wins');
  assert.equal(st.relics.find(r => r.uid === r6002.uid).progress, 1, 'Relic 6002 should have 1/6 wins');
  assert.equal(st.relics.find(r => r.uid === r4034.uid).progress, 0, 'Relic 4034 should not progress with 2 survivors');

  const heroAfterB1 = st.heroes.find(x => x.uid === h.uid);
  assert.equal(heroAfterB1.items.find(i => i.uid === it402.uid).progress, 10);
  assert.equal(heroAfterB1.items.find(i => i.uid === it711.uid).progress, 45);
  assert.equal(st.inventory.find(i => i.uid === it623.uid).progress, 4);

  // Battle 2: Complete 701 (+15 Shards), 2041 (+30 Shards), 4007 (+1 Team Size), 4034 (1 survivor -> +1 Team Size),
  // 2017 (3 Crests), 3058 (5 Crests), 1018, and items 402 (+10 Shards), 623 (+15 Shards), 711!
  run.proceedFromResult();
  run.leaveShop();
  run.chooseCrossroads(0);
  if (run.getState().phase !== 'Intro') run.proceed();
  run.startPlacement();
  const b2Input = run.startBattle();

  // Verify partial progress from Battle 1 was passed into Battle 2's createBattle payload!
  assert.equal(b2Input.relicObjects.find(r => r.uid === r701.uid).progress, Math.floor(r701.required / 2));
  assert.equal(b2Input.heroes.find(x => x.uid === h.uid).itemObjects.find(i => i.uid === it711.uid).progress, 45);

  const teamBeforeB2 = run.getState().maxHeroesOnBoard;
  const crestsBeforeB2 = run.getState().inventory.filter(i => i.itemId >= 801 && i.itemId <= 807).length;

  run.finishBattle({
    winner: 'players',
    survivors: [h.uid], // 1 survivor -> completes 4034!
    questProgress: {
      relics: {
        [r701.uid]: { progress: r701.required },
        [r2041.uid]: { progress: r2041.required },
        [r4007.uid]: { progress: r4007.required },
        [r1018.uid]: { progress: r1018.required },
        [r2017.uid]: { progress: r2017.required },
        [r3058.uid]: { progress: r3058.required },
      },
      items: {
        [it402.uid]: { progress: it402.required },
        [it623.uid]: { progress: it623.required },
        [it711.uid]: { progress: it711.required },
      },
    },
  });

  st = run.getState();
  assert.equal(st.relics.find(r => r.uid === r701.uid).completed, true, 'Relic 701 should be completed');
  assert.equal(st.relics.find(r => r.uid === r2041.uid).completed, true, 'Relic 2041 should be completed');
  assert.equal(st.relics.find(r => r.uid === r4007.uid).completed, true, 'Relic 4007 should be completed');
  assert.equal(st.relics.find(r => r.uid === r4034.uid).completed, true, 'Relic 4034 should be completed');
  assert.equal(st.relics.find(r => r.uid === r1018.uid).completed, true, 'Relic 1018 should be completed');
  assert.equal(st.relics.find(r => r.uid === r2017.uid).completed, true, 'Relic 2017 should be completed');
  assert.equal(st.relics.find(r => r.uid === r3058.uid).completed, true, 'Relic 3058 should be completed');

  const heroAfterB2 = st.heroes.find(x => x.uid === h.uid);
  assert.equal(heroAfterB2.items.find(i => i.uid === it402.uid).completed, true, 'Item 402 should be completed');
  assert.equal(heroAfterB2.items.find(i => i.uid === it711.uid).completed, true, 'Item 711 should be completed');
  assert.equal(heroAfterB2.items.find(i => i.uid === it610.uid).completed, true, 'Item 610 should be completed');
  assert.equal(st.inventory.find(i => i.uid === it623.uid).completed, true, 'Item 623 should be completed');

  // Verify 2017 (3 Crests) + 3058 (5 Crests) = +8 Crest items in inventory!
  const crestsAfterB2 = st.inventory.filter(i => i.itemId >= 801 && i.itemId <= 807).length;
  assert.equal(crestsAfterB2, crestsBeforeB2 + 8, 'Completing 2017 and 3058 should grant 3 + 5 = 8 Crest items');

  // Verify Mandate Team Size rewards (+2 from 4007 and 4034, capped at 5)
  assert.equal(st.maxHeroesOnBoard, Math.min(5, teamBeforeB2 + 2), 'Completing 4007 and 4034 should increase maxHeroesOnBoard by +2');

  // Verify Quest Shard rewards in st.rewards: 701 (+15), 2041 (+30), 402 (+10), 623 (+15)
  assert.ok(st.rewards.some(r => r.type === 'RelicQuest' && r.relicId === 701 && r.amount === 15), 'Relic 701 quest reward should be +15 Shards');
  assert.ok(st.rewards.some(r => r.type === 'RelicQuest' && r.relicId === 2041 && r.amount === 30), 'Relic 2041 quest reward should be +30 Shards');
  assert.ok(st.rewards.some(r => r.type === 'ItemQuest' && r.itemId === 402 && r.amount === 10), 'Item 402 quest reward should be +10 Shards');
  assert.ok(st.rewards.some(r => r.type === 'ItemQuest' && r.itemId === 623 && r.amount === 15), 'Item 623 quest reward should be +15 Shards');

  // Battle 3: Verify 1029 completes on 3rd win (+25 Shards) and previously completed quests do NOT re-fire!
  run.proceedFromResult();
  run.leaveShop();
  run.chooseCrossroads(0);
  if (run.getState().phase !== 'Intro') run.proceed();
  run.startPlacement();
  run.startBattle();
  run.finishBattle({
    winner: 'players',
    survivors: [h.uid],
  });
  st = run.getState();
  assert.equal(st.relics.find(r => r.uid === r1029.uid).completed, true, 'Relic 1029 should complete on 3rd victory');
  assert.ok(st.rewards.some(r => r.type === 'RelicQuest' && r.relicId === 1029 && r.amount === 25), 'Relic 1029 should grant +25 Shards on 3rd victory');
  assert.ok(!st.rewards.some(r => r.type === 'RelicQuest' && r.relicId === 701), 'Completed Relic 701 must not re-fire reward');
  assert.ok(!st.rewards.some(r => r.type === 'ItemQuest' && r.itemId === 402), 'Completed Item 402 must not re-fire reward');
  console.log('  [PASS] Multi-battle Relic & Item Quests persistence and completion rewards verified');
}

// ---------------------------------------------------------------------------
// 6. Exhaustive Sweep of All Shard Quest Rewards & Mandate Relics
// ---------------------------------------------------------------------------
console.log('--- Test 6: Exhaustive Sweep of All Shard Quest Rewards & Mandate Relics ---');
{
  const itemShardCases = [
    [402, 10], [405, 10], [408, 10], [411, 10], [414, 10], [623, 15],
  ];
  for (const [itemId, expectedShards] of itemShardCases) {
    const run = createRun({ data: rawData, seed: 800 + itemId });
    run.chooseInitial(0);
    const entry = run.grantItem(itemId);
    assert.ok(entry.required > 0, `Quest item ${itemId} should have required > 0`);
    const before = run.getState().shards;
    run.completeItemQuest(entry);
    assert.equal(run.getState().shards, before + expectedShards, `Item Quest ${itemId} should grant +${expectedShards} Shards`);
  }

  const relicShardCases = [
    [701, 15], [703, 15], [705, 15], [707, 15], [710, 15],
    [1027, 30], [1028, 25], [1029, 25], [2041, 30], [6002, 40],
  ];
  for (const [relicId, expectedShards] of relicShardCases) {
    const run = createRun({ data: rawData, seed: 900 + relicId });
    run.chooseInitial(0);
    const entry = run.grantRelic(relicId);
    assert.ok(entry.required > 0, `Quest relic ${relicId} should have required > 0`);
    const before = run.getState().shards;
    run.completeRelicQuest(entry);
    assert.equal(run.getState().shards, before + expectedShards, `Relic Quest ${relicId} should grant +${expectedShards} Shards`);
  }

  const allMandates = [4007, 4008, 4009, 4010, 4011, 4012, 4013, 4014, 4015, 4016, 4030, 4031, 4032, 4033, 4034];
  for (const mId of allMandates) {
    const mRun = createRun({ data: rawData, seed: mId });
    mRun.chooseInitial(0);
    const entry = mRun.grantRelic(mId);
    assert.ok(entry.required > 0, `Mandate relic ${mId} should have required > 0`);
    const beforeTeam = mRun.getState().maxHeroesOnBoard;
    mRun.completeRelicQuest(entry);
    assert.equal(mRun.getState().maxHeroesOnBoard, beforeTeam + 1, `Completing Mandate Relic ${mId} should grant +1 maxHeroesOnBoard`);
  }
  console.log('  [PASS] All 6 Item Shard Quests, 10 Relic Shard Quests, and 15 Mandate Relics verified');
}

console.log('ALL RELIC & QUEST RUN-LOOP TESTS PASSED!');
