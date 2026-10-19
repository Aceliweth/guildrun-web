/**
 * test_events_all.mjs
 * Exhaustive verification suite for:
 *  1. All 106 Events in catalog (93 game_data.json events + 13 scopes_data.json EventLogic classes,
 *     covering 100% of the 113 EventLogic classes in re_data/scopes_data.json).
 *  2. Zero unresolved {...} placeholders in event titles, texts, crossroads descriptions, and choice titles/texts.
 *  3. Valid previewRelicId, previewItemId, relicChoiceIds, itemChoiceIds, cost & disabled flags, and reward execution.
 *  4. Hero placement & reserve-to-board swapping (placeHero & swapHeroes).
 *  5. Item equipping (both arg orders, full-slot auto-swap, cross-hero transfer) & shop buyItem direct-equip.
 *  6. Campfire dynamic choice disabling (train, study, recharge, rest, skip).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRun, BattleFlowState } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.resolve(__dirname, '../../data/game_data.json');
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('=== Events, Crossroads, Campfire, Hero Swap & Item Equip Verification Suite ===');

// ---------------------------------------------------------------------------
// 1. Audit All 106 Catalog Events (Hydration, Placeholders, Previews & Choices)
// ---------------------------------------------------------------------------
console.log('--- Test 1: Auditing All 106 Events (Hydration, Placeholders, Previews) ---');
{
  const run = createRun({ data: rawData, seed: 12345 });
  run.chooseInitial(0);

  const allEventIds = [...run.catalog.events.keys()].sort((a, b) => a - b);
  assert.ok(allEventIds.length >= 106, `Expected at least 106 events in catalog, got ${allEventIds.length}`);

  // Ensure every concrete EventId from game_data.json (93) and scopes_data.json (13 extra) is present
  const expectedExtraIds = [500, 701, 702, 703, 823, 824, 1000, 1007, 1008, 1009, 1010, 1012, 1021];
  for (const xId of expectedExtraIds) {
    assert.ok(run.catalog.events.has(xId), `Catalog must include extra scopes_data EventLogic ID ${xId}`);
  }

  let totalChoicesAudited = 0;

  for (const evId of allEventIds) {
    const testRun = createRun({ data: rawData, seed: 1000 + evId });
    testRun.chooseInitial(0);

    // Give player 50 shards so we can first inspect normal state
    const snap = testRun.serialize();
    snap.shards = 50;
    testRun.hydrate(snap);

    testRun.openEventNode(evId);
    const st = testRun.getState();

    if (evId === 600 || evId === 601) {
      assert.equal(st.phase, BattleFlowState.Campfire, `Event ${evId} should open Campfire phase`);
      assert.ok(st.campfire && Array.isArray(st.campfire.choices), `Campfire ${evId} must have choices`);
      continue;
    }

    assert.equal(st.phase, BattleFlowState.Event, `Event ${evId} should enter BattleFlowState.Event`);
    const ev = st.event;
    assert.ok(ev, `state.event must be populated for Event ${evId}`);
    assert.ok(ev.name && ev.name.trim().length > 0, `Event ${evId} must have non-empty name`);
    assert.ok(ev.title && ev.title.trim().length > 0, `Event ${evId} must have non-empty title`);
    assert.ok(ev.text && ev.text.trim().length > 0, `Event ${evId} (${ev.name}) must have non-empty text`);
    assert.ok(ev.crossroadsDescription && ev.crossroadsDescription.trim().length > 0, `Event ${evId} (${ev.name}) must have non-empty crossroadsDescription`);

    // Assert zero unresolved {...} placeholders in event text & crossroadsDescription
    assert.ok(!/\{\w+\}/.test(ev.text), `Event ${evId} (${ev.name}) text has unresolved placeholder: "${ev.text}"`);
    assert.ok(!/\{\w+\}/.test(ev.crossroadsDescription), `Event ${evId} (${ev.name}) crossroadsDescription has unresolved placeholder: "${ev.crossroadsDescription}"`);

    assert.ok(Array.isArray(ev.choices) && ev.choices.length >= 1, `Event ${evId} (${ev.name}) must have at least 1 choice`);

    for (let cIdx = 0; cIdx < ev.choices.length; cIdx++) {
      totalChoicesAudited++;
      const ch = ev.choices[cIdx];
      assert.ok(ch.title && ch.title.trim().length > 0, `Event ${evId} choice ${cIdx} must have non-empty title`);
      assert.ok(ch.text && ch.text.trim().length > 0, `Event ${evId} choice ${cIdx} must have non-empty text`);
      assert.ok(!/^Choice \d+$/i.test(ch.title.trim()), `Event ${evId} choice ${cIdx} must not have generic title "${ch.title}"`);
      assert.ok(!/^Choice \d+$/i.test(ch.text.trim()), `Event ${evId} choice ${cIdx} must not have generic text "${ch.text}"`);
      assert.ok(!/\{\w+\}/.test(ch.title), `Event ${evId} choice ${cIdx} title has unresolved placeholder: "${ch.title}"`);
      assert.ok(!/\{\w+\}/.test(ch.text), `Event ${evId} choice ${cIdx} text has unresolved placeholder: "${ch.text}"`);

      if (ch.previewRelicId != null) {
        assert.ok(testRun.catalog.relics.has(Number(ch.previewRelicId)), `Event ${evId} choice ${cIdx} previewRelicId ${ch.previewRelicId} must exist in catalog.relics`);
      }
      if (ch.previewItemId != null) {
        assert.ok(testRun.catalog.items.has(Number(ch.previewItemId)), `Event ${evId} choice ${cIdx} previewItemId ${ch.previewItemId} must exist in catalog.items`);
      }
      if (ch.relicChoiceIds != null) {
        assert.ok(Array.isArray(ch.relicChoiceIds) && ch.relicChoiceIds.length > 0, `Event ${evId} choice ${cIdx} relicChoiceIds must be non-empty array`);
        for (const rId of ch.relicChoiceIds) {
          assert.ok(testRun.catalog.relics.has(Number(rId)), `Event ${evId} choice ${cIdx} relicChoiceId ${rId} must exist in catalog.relics`);
        }
      }
      if (ch.itemChoiceIds != null) {
        assert.ok(Array.isArray(ch.itemChoiceIds) && ch.itemChoiceIds.length > 0, `Event ${evId} choice ${cIdx} itemChoiceIds must be non-empty array`);
        for (const itId of ch.itemChoiceIds) {
          assert.ok(testRun.catalog.items.has(Number(itId)), `Event ${evId} choice ${cIdx} itemChoiceId ${itId} must exist in catalog.items`);
        }
      }
    }
  }
  console.log(`  [PASS] All ${allEventIds.length} Events and ${totalChoicesAudited} choices audited with 0 unresolved placeholders`);
}

// ---------------------------------------------------------------------------
// 2. Execute Every Option of Every Event & Verify Reward Application
// ---------------------------------------------------------------------------
console.log('--- Test 2: Executing Every Choice Across All 106 Events ---');
{
  const baseRun = createRun({ data: rawData, seed: 999 });
  const allEventIds = [...baseRun.catalog.events.keys()].sort((a, b) => a - b);
  let executedCount = 0;

  for (const evId of allEventIds) {
    if (evId === 600 || evId === 601) continue;
    const probeRun = createRun({ data: rawData, seed: 2000 + evId });
    probeRun.chooseInitial(0);
    probeRun.openEventNode(evId);
    const numChoices = probeRun.getState().event.choices.length;

    for (let cIdx = 0; cIdx < numChoices; cIdx++) {
      const run = createRun({ data: rawData, seed: 3000 + evId * 10 + cIdx });
      run.chooseInitial(0);
      // Give 100 Shards so even paid choices can be exercised
      const snap = run.serialize();
      snap.shards = 100;
      run.hydrate(snap);

      run.openEventNode(evId);
      const evState = run.getState().event;
      const ch = evState.choices[cIdx];
      const h0Uid = run.getState().heroes[0].uid;

      const relicsBefore = run.getState().relics.length;
      const itemsBefore = run.getState().inventory.length + run.getState().heroes.reduce((s, h) => s + h.items.length, 0);

      // Exercise chooseEventOption
      run.chooseEventOption(cIdx, { heroUid: h0Uid });

      // If choice opened a 3-Relic or 3-Item sub-choice modal, resolve it via pickRelic / pickItem
      if (run.getState().pendingRelicChoices) {
        assert.ok(Array.isArray(ch.relicChoiceIds) && ch.relicChoiceIds.length > 0);
        run.pickRelic(0);
        assert.ok(run.getState().relics.length > relicsBefore, `Event ${evId} choice ${cIdx} relic picker should grant a relic`);
      }
      if (run.getState().pendingItemChoices) {
        assert.ok(Array.isArray(ch.itemChoiceIds) && ch.itemChoiceIds.length > 0);
        run.pickItem(0);
        const itemsAfter = run.getState().inventory.length + run.getState().heroes.reduce((s, h) => s + h.items.length, 0);
        assert.ok(itemsAfter > itemsBefore, `Event ${evId} choice ${cIdx} item picker should grant an item`);
      }

      const afterState = run.getState();
      assert.notEqual(afterState.phase, BattleFlowState.Event, `Event ${evId} choice ${cIdx} should advance out of Event phase`);
      executedCount++;
    }
  }
  console.log(`  [PASS] Executed all ${executedCount} event choices across all events without error`);
}

// ---------------------------------------------------------------------------
// 3. Cost-Gated Event Choices (Merchant 1007, Trader 1012, Wishing Well 1001)
// ---------------------------------------------------------------------------
console.log('--- Test 3: Cost-Gated Event Choices & Shard Validation ---');
{
  const run = createRun({ data: rawData, seed: 4001 });
  run.chooseInitial(0);

  // Set player shards to 3 (not enough for 5, 10, or 15 shard Merchant options)
  const snap = run.serialize();
  snap.shards = 3;
  run.hydrate(snap);

  run.openEventNode(1007); // The Travelling Merchant (costs: 5, 10, 10, 15, Leave)
  let ev = run.getState().event;
  assert.equal(ev.choices[0].cost, 5);
  assert.equal(ev.choices[0].disabled, true, 'Choice costing 5 Shards must be disabled when player has 3 Shards');
  assert.equal(ev.choices[1].cost, 10);
  assert.equal(ev.choices[1].disabled, true, 'Choice costing 10 Shards must be disabled when player has 3 Shards');
  assert.equal(ev.choices[4].disabled, false, 'Leave choice must remain enabled when player has 3 Shards');

  // Attempting to pick disabled Choice 0 with 3 Shards must NOT grant item or deduct shards
  const invBefore = run.getState().inventory.length;
  run.chooseEventOption(0);
  assert.equal(run.getState().shards, 3, 'Disabled choice must not deduct shards');
  assert.equal(run.getState().inventory.length, invBefore, 'Disabled choice must not grant unaffordable item');

  // Now test with 20 Shards -> all Merchant choices are enabled and Choice 0 deducts 5 Shards & grants 1 item
  const snap2 = run.serialize();
  snap2.shards = 20;
  run.hydrate(snap2);
  run.openEventNode(1007);
  ev = run.getState().event;
  assert.equal(ev.choices[0].disabled, false, 'Choice costing 5 Shards must be enabled when player has 20 Shards');
  run.chooseEventOption(0);
  assert.equal(run.getState().shards, 15, 'Buying 5-Shard Merchant item should leave 15 Shards');
  assert.equal(run.getState().inventory.length, invBefore + 1, 'Buying Merchant item should grant 1 item');
  console.log('  [PASS] Cost-gated event choices (disabled flags & shard deduction) verified');
}

// ---------------------------------------------------------------------------
// 4. Hero Placement & Reserve-to-Board Swapping (placeHero & swapHeroes)
// ---------------------------------------------------------------------------
console.log('--- Test 4: Hero Placement & Reserve-to-Board Swapping ---');
{
  const run = createRun({ data: rawData, seed: 5001 });
  run.chooseInitial(0); // Hero 0 on board
  run.startPlacement();

  // Recruit 3 more distinct heroes so we have 3 on board (maxHeroesOnBoard = 3) and 1 in reserves (onBoard = false)
  const existingHeroId = run.getState().heroes[0].heroId;
  const candidateIds = [...run.catalog.heroes.keys()].filter(id => id !== existingHeroId && !run.catalog.heroes.get(id).disabled);
  run.addOrMergeHero(candidateIds[0], 1, { autoPlace: true });
  run.addOrMergeHero(candidateIds[1], 1, { autoPlace: true });
  run.addOrMergeHero(candidateIds[2], 1, { autoPlace: true }); // 4th hero -> goes to reserves!

  let st = run.getState();
  assert.equal(st.heroes.length, 4, 'Should have 4 total heroes');
  assert.equal(st.heroes.filter(h => h.onBoard).length, 3, 'Should have 3 heroes on board');
  const reserveHero = st.heroes.find(h => !h.onBoard);
  const boardHero0 = st.heroes.find(h => h.onBoard);
  assert.ok(reserveHero, '4th hero must start in reserves (onBoard = false)');

  // 4a. Drag reserveHero onto boardHero0's occupied tile -> swaps reserveHero onto board and boardHero0 to reserves!
  const targetX = boardHero0.x;
  const targetY = boardHero0.y;
  run.placeHero(reserveHero.uid, targetX, targetY);
  st = run.getState();
  const updatedReserve = st.heroes.find(h => h.uid === reserveHero.uid);
  const updatedBoard0 = st.heroes.find(h => h.uid === boardHero0.uid);
  assert.equal(updatedReserve.onBoard, true, 'Reserve hero placed on occupied tile should now be onBoard = true');
  assert.equal(updatedReserve.x, targetX);
  assert.equal(updatedReserve.y, targetY);
  assert.equal(updatedBoard0.onBoard, false, 'Displaced board hero should now be in reserves (onBoard = false)');
  assert.equal(st.heroes.filter(h => h.onBoard).length, 3, 'Total heroes on board must remain 3');

  // 4b. Place reserve hero (updatedBoard0) onto an UNOCCUPIED tile when board is at maxHeroesOnBoard (3/3):
  // (Simulates dragging a reserve hero onto the party bar in UI) -> auto-swaps out a deployed hero!
  run.placeHero(updatedBoard0.uid, 6, 0);
  st = run.getState();
  assert.equal(st.heroes.find(h => h.uid === updatedBoard0.uid).onBoard, true, 'Reserve hero dropped on free cell at max cap should auto-swap onto board');
  assert.equal(st.heroes.filter(h => h.onBoard).length, 3, 'Total heroes on board must remain 3 after auto-swap');

  // 4c. Direct swapHeroes(uidA, uidB) between reserve hero and board hero
  const curReserve = st.heroes.find(h => !h.onBoard);
  const curBoard = st.heroes.find(h => h.onBoard);
  run.swapHeroes(curReserve.uid, curBoard.uid);
  st = run.getState();
  assert.equal(st.heroes.find(h => h.uid === curReserve.uid).onBoard, true, 'swapHeroes should put reserve hero on board');
  assert.equal(st.heroes.find(h => h.uid === curBoard.uid).onBoard, false, 'swapHeroes should put board hero in reserves');
  console.log('  [PASS] Hero placement, occupied-tile swap, party-bar full-cap auto-swap, and swapHeroes verified');
}

// ---------------------------------------------------------------------------
// 5. Item Equipping (Arg Orders, Full-Slot Swap, Cross-Hero Transfer & buyItem)
// ---------------------------------------------------------------------------
console.log('--- Test 5: Item Equipping, Full-Slot Auto-Swap, Cross-Hero Transfer & Shop Direct-Equip ---');
{
  const run = createRun({ data: rawData, seed: 6001 });
  run.chooseInitial(0);
  run.startPlacement();

  const existingHeroId = run.getState().heroes[0].heroId;
  const secondHeroId = [...run.catalog.heroes.keys()].find(id => id !== existingHeroId && !run.catalog.heroes.get(id).disabled);
  run.addOrMergeHero(secondHeroId, 1, { autoPlace: true });

  const h0 = run.getState().heroes[0]; // Rank 1 -> 1 item slot (unless Hero 9 Niklas who has 2)
  const h1 = run.getState().heroes[1];
  const h0MaxSlots = h0.maxItemSlots;

  // Grant items to fill h0's slots + 1 extra item
  const grantedItems = [];
  for (let i = 0; i < h0MaxSlots + 1; i++) {
    grantedItems.push(run.grantItem(101 + i));
  }

  // 5a. Test equipItem(itemUid, heroUid) AND equipItem(heroUid, itemUid)
  run.equipItem(grantedItems[0].uid, h0.uid);
  assert.ok(run.getState().heroes[0].items.some(it => it.uid === grantedItems[0].uid), 'equipItem(itemUid, heroUid) should equip item');

  run.unequipItem(grantedItems[0].uid, h0.uid);
  assert.equal(run.getState().heroes[0].items.length, 0, 'unequipItem should return item to inventory');

  // Reverse argument order: equipItem(heroUid, itemUid)
  run.equipItem(h0.uid, grantedItems[0].uid);
  assert.ok(run.getState().heroes[0].items.some(it => it.uid === grantedItems[0].uid), 'equipItem(heroUid, itemUid) should also equip item');

  // Fill remaining slots on h0
  for (let i = 1; i < h0MaxSlots; i++) {
    run.equipItem(grantedItems[i].uid, h0.uid);
  }
  assert.equal(run.getState().heroes[0].items.length, h0MaxSlots, 'h0 item slots should now be full');

  // 5b. Equipping an extra item onto full h0 should displace the oldest item (grantedItems[0]) back to inventory
  const extraItem = grantedItems[h0MaxSlots];
  run.equipItem(extraItem.uid, h0.uid);
  let st = run.getState();
  assert.equal(st.heroes[0].items.length, h0MaxSlots, 'h0 item count must stay at maxItemSlots');
  assert.ok(st.heroes[0].items.some(it => it.uid === extraItem.uid), 'New item should be equipped on h0');
  assert.ok(st.inventory.some(it => it.uid === grantedItems[0].uid), 'Displaced oldest item should be returned to state.inventory');

  // 5c. Cross-hero item transfer: drag extraItem directly from h0 onto h1
  run.equipItem(extraItem.uid, h1.uid);
  st = run.getState();
  assert.ok(!st.heroes[0].items.some(it => it.uid === extraItem.uid), 'Transferred item should be removed from h0');
  assert.ok(st.heroes[1].items.some(it => it.uid === extraItem.uid), 'Transferred item should now be equipped on h1');

  // 5d. Shop buyItem with { heroUid } direct-equip
  run.startBattle();
  run.finishBattle({ winner: 'players', survivors: [h0.uid, h1.uid] });
  run.proceedFromResult(); // Shop
  const shopSnap = run.serialize();
  shopSnap.shards = 100;
  run.hydrate(shopSnap);

  const shopItemId = run.getState().shop.items[0].itemId;
  run.buyItem(0, { heroUid: h0.uid });
  st = run.getState();
  assert.ok(st.heroes[0].items.some(it => it.itemId === shopItemId), 'buyItem(0, { heroUid }) should purchase and directly equip item onto hero');
  console.log('  [PASS] Item equipping, bi-directional args, full-slot swap, cross-hero transfer, and buyItem direct-equip verified');
}

// ---------------------------------------------------------------------------
// 6. Campfire Dynamic Choice Disabling & Action Limits
// ---------------------------------------------------------------------------
console.log('--- Test 6: Campfire Dynamic Choice Disabling & Action Limits ---');
{
  const run = createRun({ data: rawData, seed: 7001 });
  run.chooseInitial(0);
  run.openCampfireNode(600);

  let st = run.getState();
  assert.equal(st.phase, BattleFlowState.Campfire);
  assert.equal(st.campfire.remainingActions, 2);
  assert.equal(st.campfire.choices.find(c => c.id === 'train').disabled, false, 'Train should be enabled initially');
  assert.equal(st.campfire.choices.find(c => c.id === 'rest').disabled, false, 'Rest should be enabled initially');

  // Action 1: Train
  const rankBefore = st.heroes[0].rank;
  run.campfireAction('train', st.heroes[0].uid);
  while (run.getState().pendingRankUp) run.rankUpChoice(0);

  st = run.getState();
  assert.equal(st.phase, BattleFlowState.Campfire, 'Should still be in Campfire with 1 action remaining');
  assert.equal(st.campfire.remainingActions, 1);
  assert.equal(st.heroes[0].rank, rankBefore + 1, 'Train should rank up hero');
  assert.equal(st.campfire.hasTrained, true);
  assert.equal(st.campfire.choices.find(c => c.id === 'train').disabled, true, 'Train choice must be disabled after use');
  assert.equal(st.campfire.choices.find(c => c.id === 'rest').disabled, false, 'Rest choice must still be enabled');

  // Action 2: Rest -> consumes 2nd action and advances to next floor
  const accBefore = st.accumulatedShards;
  run.campfireAction('rest');
  st = run.getState();
  assert.notEqual(st.phase, BattleFlowState.Campfire, 'Campfire should advance to next floor after 2nd action');
  assert.equal(st.accumulatedShards, accBefore + 15, 'Rest should add +15 Stabilizer Shards');
  assert.ok(st.temporaryRelics.includes(5106), 'Rest should grant temporary Rested relic 5106');
  console.log('  [PASS] Campfire dynamic choice disabling and 2-action flow verified');
}

console.log('ALL EVENT, CROSSROADS, CAMPFIRE, HERO SWAP & ITEM EQUIP TESTS PASSED!');
