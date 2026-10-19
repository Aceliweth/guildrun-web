// Guildrun Web — Run Meta-Loop & State Machine (public/js/run/index.js)
// Implements BattleFlowState:
//   InitialSelection -> Intro -> Placement -> Resolution -> Result -> Shop -> Crossroads -> Outro -> Complete
//   plus Event and Campfire nodes, hero rank-up / specialization / rank modifiers, shop odd-smoothing,
//   Shard Stabilizer (two-chance life & pre-boss cash-out), and localStorage persistence.

import { buildCatalog, FALLBACK_SINGLETONS } from './catalog.js';
import { mulberry32, calculateCurrentSeed, deriveRng, randomSeed } from './rng.js';
import { getLang, txt, statName } from '../data.js';

export { buildCatalog, FALLBACK_SINGLETONS } from './catalog.js';
export { mulberry32, calculateCurrentSeed, deriveRng, randomSeed } from './rng.js';

export const SAVE_STORAGE_KEY = 'guildrun.run.save.v1';

export const BattleFlowState = Object.freeze({
  InitialSelection: 'InitialSelection',
  Intro: 'Intro',
  Placement: 'Placement',
  Resolution: 'Resolution',
  Result: 'Result',
  Shop: 'Shop',
  Crossroads: 'Crossroads',
  Campfire: 'Campfire',
  Event: 'Event',
  Outro: 'Outro',
  Complete: 'Complete',
});

const FLOW_ENUM_INDEX = {
  InitialSelection: 0,
  Intro: 1,
  Placement: 2,
  Resolution: 3,
  Result: 4,
  Shop: 5,
  Crossroads: 6,
  Outro: 7,
  Complete: 8,
  Campfire: 6,
  Event: 6,
};

const INTEREST_RELIC_ID = 3037;
const TEAM_SIZE_RELIC_ID = 4500;
const RESTED_RELIC_ID = 5106;
const EVENT_TEAM_SIZE_RELICS = new Set([4500]);

const MANDATE_TEAM_SIZE_RELICS = new Set([
  4007, 4008, 4009, 4010, 4011, 4012, 4013, 4014, 4015, 4016,
  4030, 4031, 4032, 4033, 4034,
]);

const RELIC_QUEST_SHARD_REWARDS = new Map([
  [701, 15],
  [703, 15],
  [705, 15],
  [707, 15],
  [710, 15],
  [1027, 30],
  [1028, 25],
  [1029, 25],
  [2041, 30],
  [6002, 40],
]);

const ITEM_QUEST_SHARD_REWARDS = new Map([
  [402, 10],
  [405, 10],
  [408, 10],
  [411, 10],
  [414, 10],
  [623, 15],
]);

const CLASS_PRIMARY_STAT_BONUS = new Map([
  [1, { stat: 'Attack', val: 25 }],
  [2, { stat: 'Defense', val: 30 }],
  [3, { stat: 'MaxHealth', val: 200 }],
  [4, { stat: 'Crit', val: 15 }],
  [5, { stat: 'AttackSpeed', val: 20 }],
  [6, { stat: 'ManaRegen', val: 4 }],
  [7, { stat: 'Magic', val: 25 }],
]);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function cloneJson(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

export function createRun({ data = {}, seed, difficulty = 0, endless = true, redRift = false } = {}) {
  const catalog = buildCatalog(data);
  const playerS = catalog.S('PlayerSingleton');
  const rewardS = catalog.S('RewardSelectionSingleton');
  const shopS = catalog.S('ShopSingleton');
  const campfireS = catalog.S('CampfireSingleton');
  const heroesS = catalog.S('HeroesSingleton');
  const equipS = catalog.S('EquipmentSingleton');
  const eventsS = catalog.S('EventsSingleton');

  const isFr = () => (typeof getLang === 'function' ? getLang() === 'fr' : false);
  const L = (fr, en) => (isFr() ? fr : en);
  let lastLocaleLang = typeof getLang === 'function' ? getLang() : 'fr';

  function locStatName(stat) {
    if (typeof statName === 'function' && stat) return statName(stat);
    return stat || L('Attaque', 'Attack');
  }
  function locRelicName(rId) {
    const rawR = data.relics?.[rId];
    const catR = catalog.relics.get(Number(rId));
    return txt(rawR?.nameKey || catR?.nameKey || rawR?.name || catR?.name || L(`Relique #${rId}`, `Relic #${rId}`));
  }
  function locRelicDesc(rId) {
    const rawR = data.relics?.[rId];
    const catR = catalog.relics.get(Number(rId));
    return txt(rawR?.descriptionKey || catR?.descriptionKey || rawR?.description || catR?.description || '');
  }
  function locItemName(itId) {
    const rawIt = data.items?.[itId];
    const catIt = catalog.items.get(Number(itId));
    return txt(rawIt?.nameKey || catIt?.nameKey || rawIt?.name || catIt?.name || L(`Objet #${itId}`, `Item #${itId}`));
  }
  function locItemDesc(itId) {
    const rawIt = data.items?.[itId];
    const catIt = catalog.items.get(Number(itId));
    const base = txt(rawIt?.descriptionKey || catIt?.descriptionKey || rawIt?.description || catIt?.description || '');
    if (base) return base;
    return (catIt?.statMods || []).map(m => `+${m.value}${m.isPercent ? '%' : ''} ${locStatName(m.stat)}`).join(', ');
  }
  function locHeroName(hId) {
    const rawH = data.heroes?.[hId];
    const catH = catalog.heroes.get(Number(hId));
    return txt(rawH?.nameKey || catH?.nameKey || rawH?.name || catH?.name || catalog.heroName(hId));
  }
  function locClassName(cid) {
    const c = data.classes?.[cid] || catalog.classes?.get?.(Number(cid));
    const fallbackEn = ['Warrior', 'Tank', 'Vanguard', 'Assassin', 'Duelist', 'Mystic', 'Mage'][(Number(cid) - 1 + 7) % 7] || 'Warrior';
    const fallbackFr = ['Guerrier', 'Tank', 'Avant-garde', 'Assassin', 'Duelliste', 'Mystique', 'Mage'][(Number(cid) - 1 + 7) % 7] || 'Guerrier';
    return txt(c?.nameKey || c?.name || L(fallbackFr, fallbackEn));
  }
  function locEventName(ev) {
    if (!ev) return '';
    const rawEv = data.events?.[ev.id];
    return txt(rawEv?.nameKey || ev.nameKey || rawEv?.name || ev.name || ev.title || '');
  }
  function locEventText(ev) {
    if (!ev) return '';
    const rawEv = data.events?.[ev.id];
    return txt(rawEv?.textKey || ev.textKey || rawEv?.text || ev.text || '');
  }
  function locEventCrossroadsDesc(ev) {
    if (!ev) return '';
    const rawEv = data.events?.[ev.id];
    return txt(rawEv?.crossroadsDescriptionKey || ev.crossroadsDescriptionKey || rawEv?.crossroadsDescription || ev.crossroadsDescription || '');
  }

  const runSeed = (seed !== undefined && seed !== null && Number.isFinite(Number(seed)))
    ? (Number(seed) >>> 0)
    : randomSeed();

  // Resolve difficulty & active cumulative difficulty modifiers
  const diffIndex = clamp(Math.floor(Number(difficulty) || 0), 0, Math.max(0, catalog.difficulties.length - 1));
  const activeDiffMods = new Map();
  for (let i = 0; i <= diffIndex && i < catalog.difficulties.length; i++) {
    for (const modName of catalog.difficulties[i].modifierNames) {
      const mod = catalog.diffMods.get(modName) || { Title: modName };
      activeDiffMods.set(modName, mod);
    }
  }
  const stageDifficultyIndex = catalog.difficulties[diffIndex]?.stageDifficultyIndex || 1;

  // Real numbers from singletons & difficulty modifiers
  const startingShards = Number(playerS.StartingShards ?? 15);
  const stabilizerOverride = activeDiffMods.get('ShardStabilizerStartingValueOverrideEntry');
  const startingAccumulatedShards = stabilizerOverride?.StartingValue != null
    ? Number(stabilizerOverride.StartingValue)
    : Number(playerS.StartingAccumulatedShards ?? 10);
  const accumulatedPerWin = Number(playerS.AccumulatedShardsPerFightWon ?? 10);

  const survivingHeroDelta = Number(activeDiffMods.get('SurvivingHeroRewardDeltaEntry')?.RewardDelta ?? 0);
  const baseSurvivingHeroReward = Math.max(0, Number(rewardS.ShardRewardPerSurvivingHero ?? 2) + survivingHeroDelta);

  const shardInterestInterval = Math.max(1, Number(shopS.ShardInterestInterval ?? 5));
  const maxShardInterest = Number(shopS.MaxShardInterest ?? 20);
  const baseTeamSizeCost = Number(shopS.BaseTeamSizeCost ?? 25);
  const teamSizeIncrementCost = Number(shopS.TeamSizeIncrementCost ?? 50);
  const rerollDelta = Number(activeDiffMods.get('ShopRerollCostDeltaEntry')?.CostDelta ?? 0);
  const baseRerollCost = Number(shopS.BaseRerollCost ?? 1) + rerollDelta;
  const superShopBaseRerollCost = Number(shopS.SuperShopBaseRerollCost ?? 7) + rerollDelta;
  const rerollCostIncrement = Number(shopS.RerollCostIncrement ?? 1);
  const sellMultiplier = Number(shopS.FallbackSellMultiplier ?? data.shopPrices?.sellMultiplier ?? 0.660004);
  const saleDiscountRate = Number(shopS.RandomSaleDiscount ?? 0.25);

  const startingMaxHeroesOnBoard = Number(heroesS.StartingMaxHeroesOnBoard ?? 3);
  const maxTotalHeroes = Number(heroesS.MaxTotalHeroes ?? 6);
  const maxHeroRank = Number(heroesS.MaxHeroRank ?? 4);
  const maxItemSlots = Math.max(1, Number(heroesS.MaxItemSlots ?? equipS.BaseCharacterEquipmentLimit ?? 6));

  const heroRankCosts = new Map([[1, 15], [2, 25], [3, 35], [4, 45]]);
  for (const e of shopS.heroRankCosts || []) heroRankCosts.set(Number(e.Element), Number(e.Value));
  if (data.shopPrices?.heroRank) {
    for (const [k, v] of Object.entries(data.shopPrices.heroRank)) heroRankCosts.set(Number(k), Number(v));
  }

  const itemRarityCosts = new Map([['Common', 5], ['Rare', 15], ['Epic', 25], ['Unique', 5]]);
  for (const e of shopS.itemRarityCosts || []) itemRarityCosts.set(String(e.Element), Number(e.Value));
  if (data.shopPrices?.itemRarity) {
    for (const [k, v] of Object.entries(data.shopPrices.itemRarity)) itemRarityCosts.set(String(k), Number(v));
  }

  const relicRarityCosts = new Map([
    ['Common', 10], ['Rare', 20], ['Epic', 30], ['Legendary', 40],
    ['CommonQuest', 15], ['RareQuest', 20], ['EpicQuest', 25], ['LegendaryQuest', 25], ['TeamSize', 40],
  ]);
  for (const e of shopS.relicRarityCosts || []) relicRarityCosts.set(String(e.Element), Number(e.Value));
  if (data.shopPrices?.relicRarity) {
    for (const [k, v] of Object.entries(data.shopPrices.relicRarity)) relicRarityCosts.set(String(k), Number(v));
  }

  // Mutable serializable state
  let state = {
    version: 1,
    seed: runSeed,
    difficulty: diffIndex,
    stageDifficultyIndex,
    redRift: !!redRift,
    phase: BattleFlowState.InitialSelection,
    flowState: BattleFlowState.InitialSelection,
    act: 1,
    actIndex: 0,
    chunkIndex: 0,
    floorInChunk: 0,
    floorIndex: 0, // 0-based floor index within act (0..11)
    floor: 1,      // 1-based display floor (1..12)
    endlessFloorIndex: -1,
    endlessScore: 0,
    allowEndless: !!endless,

    shards: startingShards,
    accumulatedShards: startingAccumulatedShards,
    isStabilizerActive: true,
    lives: 2,
    maxLives: 2,
    isOutOfLives: false,
    won: null,
    outcome: null,

    maxHeroesOnBoard: startingMaxHeroesOnBoard,
    maxTotalHeroes,
    maxHeroRank,
    maxItemSlots,
    teamSizeUpgradesPurchased: 0,
    teamSizeCost: baseTeamSizeCost,

    heroes: [],
    inventory: [],
    relics: [],
    temporaryRelics: [],     // single-battle player relics (e.g. Rested 4502)
    nextBattleEnemyRelics: [], // enemy relics from StageModifier or Event
    actBossRelicId: null,    // active ActBossRelicEntry relic (7000..7004) during non-boss floors on Difficulty SSS
    act2ActBossStacks: 0,    // Burn/Frost/Poison stack counter for Relics 7002..7004 in Chunk 1
    pendingStageModRewardPools: [], // relic pool IDs to reward on winning a StageModifier fight

    initialSelectRerolls: 0,
    shopRefreshCount: 0,
    globalRerolls: 0,
    rngCounter: 0,
    uidSeq: 1,

    initialChoices: [],
    actPlan: [],
    usedFights: [],
    usedEvents: [],
    queuedEventFight: null,
    returnFloorAfterEventFight: null,

    stageId: null,
    stage: null,
    enemies: [],

    shop: null,
    shopVisitsByChunk: [0, 0],
    shopDiscounts: { hero: 0, relic: 0 },
    oddSmoothing: {
      heroRank: { 1: 0, 2: 0, 3: 0, 4: 0 },
      itemRarity: { Common: 0, Rare: 0, Epic: 0 },
      relicRarity: { Common: 0, Rare: 0, Epic: 0, Legendary: 0 },
    },

    crossroads: [],
    event: null,
    campfire: null,

    pendingRankUp: null,
    pendingRankUpQueue: [],
    pendingRelicChoices: null,
    pendingRelicQueue: [],
    pendingItemChoices: null,
    pendingItemQueue: [],

    lastResult: null,
    rewards: [],
    stats: {
      fightsWon: 0,
      fightsLost: 0,
      totalShardsEarned: startingShards,
      totalShardsSpent: 0,
      heroesRecruited: 0,
      itemsAcquired: 0,
      relicsAcquired: 0,
    },
    log: [],
  };

  function nextUid(prefix) {
    return `${prefix}${state.uidSeq++}`;
  }

  function logMsg(msg) {
    state.log.push(msg);
    if (state.log.length > 100) state.log.shift();
  }

  function getFlowSeed(tag = 'step') {
    const base = calculateCurrentSeed({
      initialSelectRerolls: state.initialSelectRerolls,
      shopRefreshCount: state.shopRefreshCount,
      flow: FLOW_ENUM_INDEX[state.phase] ?? 0,
      currentFloor: state.floorIndex,
      endlessFloorIndex: state.endlessFloorIndex,
      runSeed: state.seed,
    });
    state.rngCounter = (state.rngCounter + 1) | 0;
    return deriveRng(base, tag, state.rngCounter);
  }

  function setPhase(phase) {
    state.phase = phase;
    state.flowState = phase;
  }

  function syncTeamSizeCost() {
    state.teamSizeCost = baseTeamSizeCost + state.teamSizeUpgradesPurchased * teamSizeIncrementCost;
  }

  // ---------------------------------------------------------------------------
  // Board & Hero Helpers
  // ---------------------------------------------------------------------------
  function getPlayerRows() {
    return Array.isArray(catalog.board?.playerRows) && catalog.board.playerRows.length
      ? catalog.board.playerRows
      : [0, 1, 2, 3];
  }

  function findFreeBoardTile(excludeHeroUid = null) {
    const W = catalog.board?.width || 7;
    const playerRows = [1, 2, 0, 3].filter(r => getPlayerRows().includes(r));
    const occupied = new Set(
      state.heroes
        .filter(h => h.onBoard && h.uid !== excludeHeroUid && h.x != null && h.y != null)
        .map(h => `${h.x},${h.y}`)
    );
    const colOrder = [1, 2, 3, 4, 5, 0, 6].filter(c => c < W);
    for (const r of playerRows) {
      for (const c of colOrder) {
        if (!occupied.has(`${c},${r}`)) return { x: c, y: r };
      }
    }
    return { x: 1, y: playerRows[0] ?? 1 };
  }

  function countHeroesOnBoard(excludeHeroUid = null) {
    return state.heroes.filter(h => h.onBoard && h.uid !== excludeHeroUid).length;
  }

  function hasRelic(relicId) {
    relicId = Number(relicId);
    return state.relics.some(r => Number(r.relicId) === relicId) || state.temporaryRelics.includes(relicId);
  }

  function getQuestRequiredProgress(def) {
    if (!def?.quest) return 0;
    return Math.max(0, Number(def.quest.effect?.requiredProgress ?? def.quest.requiredProgress ?? 0));
  }

  function addHeroBonusStat(hero, stat, delta) {
    if (!hero || !stat || !Number.isFinite(Number(delta)) || Number(delta) === 0) return;
    if (!hero.bonusStats) hero.bonusStats = {};
    const val = Number(delta);
    const normStat = (stat === 'MaxHP' || stat === 'Health' || stat === 'HP') ? 'MaxHealth' : stat;
    hero.bonusStats[normStat] = (hero.bonusStats[normStat] || 0) + val;
    if (normStat === 'MaxHealth') {
      hero.bonusStats.MaxHP = hero.bonusStats.MaxHealth;
    }
  }

  function normalizeItemEntry(it) {
    if (!it) return null;
    if (typeof it !== 'object') {
      const itemId = Number(it);
      const rawIt = data.items?.[itemId] || data.items?.[String(itemId)] || catalog.items.get(itemId);
      return {
        uid: nextUid('i'),
        itemId,
        progress: 0,
        required: getQuestRequiredProgress(rawIt),
        completed: false,
        customStacks: 0,
      };
    }
    const itemId = Number(it.itemId ?? it.id);
    const rawIt = data.items?.[itemId] || data.items?.[String(itemId)] || catalog.items.get(itemId);
    if (!it.uid) it.uid = nextUid('i');
    it.itemId = itemId;
    if (typeof it.progress !== 'number') it.progress = 0;
    if (typeof it.required !== 'number') it.required = getQuestRequiredProgress(rawIt);
    if (typeof it.completed !== 'boolean') it.completed = it.required > 0 && it.progress >= it.required;
    if (typeof it.customStacks !== 'number') it.customStacks = 0;
    return it;
  }

  function normalizeRelicEntry(r) {
    if (!r) return null;
    if (typeof r !== 'object') {
      const relicId = Number(r);
      const rawR = data.relics?.[relicId] || data.relics?.[String(relicId)] || catalog.relics.get(relicId);
      return {
        uid: nextUid('r'),
        relicId,
        progress: 0,
        required: getQuestRequiredProgress(rawR),
        completed: false,
        customStacks: 0,
      };
    }
    const relicId = Number(r.relicId ?? r.id);
    const rawR = data.relics?.[relicId] || data.relics?.[String(relicId)] || catalog.relics.get(relicId);
    if (!r.uid) r.uid = nextUid('r');
    r.relicId = relicId;
    if (typeof r.progress !== 'number') r.progress = 0;
    if (typeof r.required !== 'number') r.required = getQuestRequiredProgress(rawR);
    if (typeof r.completed !== 'boolean') r.completed = r.required > 0 && r.progress >= r.required;
    if (typeof r.customStacks !== 'number') r.customStacks = 0;
    return r;
  }

  function syncQuestMetadata() {
    state.inventory = (state.inventory || []).map(it => normalizeItemEntry(it)).filter(Boolean);
    for (const h of state.heroes || []) {
      h.items = (h.items || []).map(it => normalizeItemEntry(it)).filter(Boolean);
      if (h.bonusStats && h.bonusStats.MaxHP != null && h.bonusStats.MaxHealth == null) {
        h.bonusStats.MaxHealth = h.bonusStats.MaxHP;
      }
    }
    state.relics = (state.relics || []).map(r => normalizeRelicEntry(r)).filter(Boolean);
  }

  function getHeroMaxItemSlots(hero) {
    if (!hero) return 1;
    // GameRegistryDataReader.GetBaseItemSlotCount (0x18050F6D0):
    // - If HeroItemSlotsPerRankEntry is active (Difficulty S, SS, SSS): base slots = hero.rank (1 at C, 2 at B, 3 at A, 4 at S)
    // - Otherwise (Difficulty Base, C, B, A): base slots = EquipmentSingleton.BaseCharacterEquipmentLimit (3) at Ranks C/B/A, and +1 (4) at Rank S (4)
    const rank = clamp(Number(hero.rank) || 1, 1, 4);
    const baseEquipLimit = Number(equipS.BaseCharacterEquipmentLimit ?? 3);
    let slots = activeDiffMods.has('HeroItemSlotsPerRankEntry')
      ? rank
      : (rank >= 4 ? baseEquipLimit + 1 : baseEquipLimit);
    const slotDeltaMod = activeDiffMods.get('HeroItemSlotDeltaEntry');
    if (slotDeltaMod?.ItemSlotDelta != null) {
      slots += Number(slotDeltaMod.ItemSlotDelta) || 0;
    }
    // Niklas innate passive 10901 (Red Hot Deals): +1 item slot
    if (Number(hero.heroId) === 9) slots += 1;
    // Specializations granting +1 item slot: 902 (The Executive), 1301 (The Iron), 1501 (The Stylish), 1701 (The Fashionable)
    if ([902, 1301, 1501, 1701].includes(Number(hero.specializationId))) slots += 1;
    // Relics modifying item slots
    const isActBossFloor = state.stage?.stageType === 'Boss' && state.endlessFloorIndex < 0;
    if (hasRelic(4038)) slots = Math.min(5, slots + 1); // Heroic Capacity Expander
    if (hasRelic(6016)) slots = Math.min(6, slots + 2); // Quality over Quantity
    if (hasRelic(771) && !isActBossFloor) slots = Math.min(6, slots + 1); // Starter Kit: Sustained Item Expansion
    if (hasRelic(6012)) slots = Math.max(1, slots - 1); // Quantity over Quality
    return clamp(slots, 1, 6);
  }

  function syncAllHeroItemSlots() {
    for (const h of state.heroes) {
      h.maxItemSlots = getHeroMaxItemSlots(h);
      // If a hero's maxItemSlots decreased below their currently equipped items, return excess to inventory
      while (Array.isArray(h.items) && h.items.length > h.maxItemSlots) {
        const displaced = h.items.pop();
        if (displaced) state.inventory.push(displaced);
      }
    }
  }

  function getHeroClasses(hero) {
    const def = catalog.heroes.get(Number(hero.heroId));
    const classes = new Set(def?.classIds || []);
    if (hero.specializationId != null) {
      const spec = catalog.specializations.get(Number(hero.specializationId));
      if (spec?.classId) classes.add(Number(spec.classId));
    }
    for (const it of hero.items || []) {
      const iid = Number(typeof it === 'object' ? it.itemId : it);
      if (iid >= 801 && iid <= 807) classes.add(iid - 800);
      if (iid >= 701 && iid <= 707) classes.add(iid - 700);
    }
    return [...classes].filter(c => c > 0);
  }

  function buildRankUpChoices(hero, targetRank) {
    const rng = getFlowSeed(`rankup_${hero.heroId}_${targetRank}`);
    if (targetRank === 2) {
      const specs = (catalog.specsByHero.get(Number(hero.heroId)) || []).slice();
      if (specs.length) {
        return {
          type: 'specialization',
          heroUid: hero.uid,
          heroId: hero.heroId,
          rank: targetRank,
          choices: specs.slice(0, 3),
        };
      }
    }
    // Rank 3 (A) or Rank 4 (S) -> RankModifier choices matching hero's class & targetRank
    const classes = getHeroClasses(hero);
    const ownedMods = new Set((hero.rankModifierIds || []).map(Number));
    const candidateEntries = [];
    for (const pool of catalog.rankModifierPools.values()) {
      if (pool.disabled || pool.id === 999) continue;
      const rankMatches = pool.targetRank === targetRank || (targetRank >= 3 && pool.targetRank === 3);
      const classMatches = !classes.length || classes.includes(pool.targetClassId);
      if (rankMatches && classMatches) {
        for (const e of pool.entries) {
          if (!ownedMods.has(e.id) && catalog.rankModifiers.has(e.id)) {
            candidateEntries.push(e);
          }
        }
      }
    }
    if (!candidateEntries.length) {
      for (const rm of catalog.rankModifiers.values()) {
        if (!rm.disabled && !ownedMods.has(rm.id)) {
          candidateEntries.push({ id: rm.id, weight: 10 });
        }
      }
    }
    const picked = rng.weightedDistinct(candidateEntries, 3);
    if (!picked.length) return null;
    return {
      type: 'rankModifier',
      heroUid: hero.uid,
      heroId: hero.heroId,
      rank: targetRank,
      choices: picked,
    };
  }

  function enqueueRankUp(payload) {
    if (!payload || !payload.choices || !payload.choices.length) return;
    if (!state.pendingRankUp) {
      state.pendingRankUp = payload;
    } else {
      state.pendingRankUpQueue.push(payload);
    }
  }

  function enqueueRelicChoice(payload) {
    if (!payload || !payload.choices || !payload.choices.length) return;
    if (!state.pendingRelicChoices) {
      state.pendingRelicChoices = payload;
    } else {
      state.pendingRelicQueue.push(payload);
    }
  }

  function enqueueItemChoice(payload) {
    if (!payload || !payload.choices || !payload.choices.length) return;
    if (!state.pendingItemChoices) {
      state.pendingItemChoices = payload;
    } else {
      state.pendingItemQueue.push(payload);
    }
  }

  function rollDistinctRelicsFromPool(rng, poolId, count = 3, excludeIds = []) {
    const excluded = new Set(excludeIds.map(Number));
    let pool = catalog.poolEntries(catalog.relicPools, Number(poolId), catalog.relics)
      .filter(e => !hasRelic(e.id) && !excluded.has(e.id));
    if (pool.length < count) {
      for (const fallbackPoolId of [101, 102, 103, 1, 2, 3]) {
        const extra = catalog.poolEntries(catalog.relicPools, fallbackPoolId, catalog.relics)
          .filter(e => !hasRelic(e.id) && !excluded.has(e.id) && !pool.some(p => p.id === e.id));
        pool = pool.concat(extra);
        if (pool.length >= count) break;
      }
    }
    const picked = rng.weightedDistinct(pool, count);
    picked.forEach(id => excluded.add(id));
    return picked;
  }

  function rollDistinctItemsFromPool(rng, poolId, count = 3, excludeIds = []) {
    const excluded = new Set(excludeIds.map(Number));
    let pool = catalog.poolEntries(catalog.itemPools, Number(poolId), catalog.items)
      .filter(e => !excluded.has(e.id));
    if (pool.length < count) {
      for (const fallbackPoolId of [3, 2, 1]) {
        const extra = catalog.poolEntries(catalog.itemPools, fallbackPoolId, catalog.items)
          .filter(e => !excluded.has(e.id) && !pool.some(p => p.id === e.id));
        pool = pool.concat(extra);
        if (pool.length >= count) break;
      }
    }
    const picked = rng.weightedDistinct(pool, count);
    picked.forEach(id => excluded.add(id));
    return picked;
  }

  function rankUpHeroInternal(hero, targetRank = null) {
    if (!hero) return false;
    const oldRank = hero.rank || 1;
    const nextRank = clamp(targetRank != null ? targetRank : oldRank + 1, oldRank, state.maxHeroRank);
    if (nextRank <= oldRank) return false;
    for (let r = oldRank + 1; r <= nextRank; r++) {
      hero.rank = r;
      hero.maxItemSlots = getHeroMaxItemSlots(hero);
      const choiceObj = buildRankUpChoices(hero, r);
      if (choiceObj) enqueueRankUp(choiceObj);
    }
    logMsg(`${catalog.heroName(hero.heroId)} ranked up to Rank ${hero.rank}!`);
    return true;
  }

  function addOrMergeHero(heroId, rank = 1, { autoPlace = true } = {}) {
    heroId = Number(heroId);
    rank = clamp(Number(rank) || 1, 1, state.maxHeroRank);
    const existing = state.heroes.find(h => Number(h.heroId) === heroId);
    if (existing) {
      const targetRank = Math.min(state.maxHeroRank, Math.max(existing.rank + 1, rank));
      rankUpHeroInternal(existing, targetRank);
      return { hero: existing, merged: true };
    }
    if (state.heroes.length >= state.maxTotalHeroes) {
      return { hero: null, merged: false, full: true };
    }
    const canPlace = autoPlace && countHeroesOnBoard() < state.maxHeroesOnBoard;
    const pos = canPlace ? findFreeBoardTile() : { x: null, y: null };
    const newHero = {
      uid: nextUid('h'),
      heroId,
      rank: 1,
      maxItemSlots: 1,
      x: pos.x,
      y: pos.y,
      onBoard: canPlace,
      items: [],
      specializationId: null,
      rankModifierIds: [],
      bonusStats: {},
    };
    newHero.maxItemSlots = getHeroMaxItemSlots(newHero);
    state.heroes.push(newHero);
    state.stats.heroesRecruited += 1;
    if (rank > 1) {
      rankUpHeroInternal(newHero, rank);
    }
    return { hero: newHero, merged: false };
  }

  function grantItem(itemId) {
    itemId = Number(itemId);
    if (!catalog.items.has(itemId)) return null;
    const rawIt = data.items?.[itemId] || data.items?.[String(itemId)] || catalog.items.get(itemId);
    const required = getQuestRequiredProgress(rawIt);
    const entry = {
      uid: nextUid('i'),
      itemId,
      progress: 0,
      required,
      completed: false,
      customStacks: 0,
    };
    state.inventory.push(entry);
    state.stats.itemsAcquired += 1;
    return entry;
  }

  function grantRandomItemByFilter(filterFn, fallbackPoolId = 3) {
    const rng = getFlowSeed('grant_item');
    const candidates = [...catalog.items.values()].filter(it => !it.disabled && filterFn(it));
    if (candidates.length) {
      const picked = rng.pick(candidates);
      if (picked) return grantItem(picked.id);
    }
    const pool = catalog.poolEntries(catalog.itemPools, fallbackPoolId, catalog.items);
    const fid = rng.weighted(pool) ?? 101;
    return grantItem(fid);
  }

  function completeItemQuest(itemEntry, rewardList = null) {
    if (!itemEntry) return false;
    itemEntry.completed = true;
    if (itemEntry.required > 0 && (itemEntry.progress || 0) < itemEntry.required) {
      itemEntry.progress = itemEntry.required;
    }
    if (itemEntry._rewardGranted) return false;
    itemEntry._rewardGranted = true;

    const itemId = Number(itemEntry.itemId);
    const shardReward = ITEM_QUEST_SHARD_REWARDS.get(itemId) || 0;
    if (shardReward > 0) {
      if (Array.isArray(rewardList)) {
        rewardList.push({ type: 'ItemQuest', itemId, amount: shardReward });
      } else {
        state.shards += shardReward;
        state.stats.totalShardsEarned += shardReward;
      }
    }
    logMsg(`Item Quest completed: ${catalog.itemName(itemId)}!`);
    return true;
  }

  function completeRelicQuest(relicEntry, rng = null, rewardList = null) {
    if (!relicEntry) return false;
    relicEntry.completed = true;
    if (relicEntry.required > 0 && (relicEntry.progress || 0) < relicEntry.required) {
      relicEntry.progress = relicEntry.required;
    }
    if (relicEntry._rewardGranted) return false;
    relicEntry._rewardGranted = true;

    const relicId = Number(relicEntry.relicId);
    const activeRng = rng || getFlowSeed(`relic_quest_complete_${relicId}`);

    // 1. Shard Rewards (701, 703, 705, 707, 710, 1027, 1028, 1029, 2041, 6002)
    const shardReward = RELIC_QUEST_SHARD_REWARDS.get(relicId) || 0;
    if (shardReward > 0) {
      if (Array.isArray(rewardList)) {
        rewardList.push({ type: 'RelicQuest', relicId, amount: shardReward });
      } else {
        state.shards += shardReward;
        state.stats.totalShardsEarned += shardReward;
      }
    }

    // 2. Crest Item Rewards (2017 Multiclass Conduit -> 3 Crests; 3058 Golden Ascendancy -> 5 Crests)
    if (relicId === 2017 || relicId === 3058) {
      const crestCount = relicId === 3058 ? 5 : 3;
      const crests = [801, 802, 803, 804, 805, 806, 807];
      for (let i = 0; i < crestCount; i++) {
        const pickedCrest = activeRng.pick(crests) ?? (801 + (i % 7));
        grantItem(pickedCrest);
      }
    }

    // 3. Mandate Team Size Rewards (4007..4016, 4030..4034 -> +1 team size, Max: 5)
    if (MANDATE_TEAM_SIZE_RELICS.has(relicId)) {
      state.maxHeroesOnBoard = Math.min(state.maxTotalHeroes, Math.max(state.maxHeroesOnBoard, Math.min(5, state.maxHeroesOnBoard + 1)));
      logMsg(`${catalog.relicName(relicId)} completed! Team size increased to ${state.maxHeroesOnBoard}!`);
    } else {
      logMsg(`Relic Quest completed: ${catalog.relicName(relicId)}!`);
    }

    return true;
  }

  function grantRelic(relicId, { temporary = false, heroUid = null } = {}) {
    relicId = Number(relicId);
    if (!catalog.relics.has(relicId)) return null;
    if (temporary) {
      if (!state.temporaryRelics.includes(relicId)) state.temporaryRelics.push(relicId);
      syncAllHeroItemSlots();
      return { relicId, temporary: true };
    }
    if (hasRelic(relicId) && relicId !== TEAM_SIZE_RELIC_ID) {
      return state.relics.find(r => Number(r.relicId) === relicId);
    }
    const rawR = data.relics?.[relicId] || data.relics?.[String(relicId)] || catalog.relics.get(relicId);
    const required = getQuestRequiredProgress(rawR);
    const entry = {
      uid: nextUid('r'),
      relicId,
      progress: 0,
      required,
      completed: false,
      customStacks: 0,
    };
    state.relics.push(entry);
    state.stats.relicsAcquired += 1;

    const rng = getFlowSeed(`on_acquire_relic_${relicId}`);
    const targetHero = (heroUid != null ? state.heroes.find(h => String(h.uid) === String(heroUid)) : null) || state.heroes[0] || null;

    if (EVENT_TEAM_SIZE_RELICS.has(relicId)) {
      state.maxHeroesOnBoard = Math.min(state.maxTotalHeroes, Math.max(state.maxHeroesOnBoard, Math.min(5, state.maxHeroesOnBoard + 1)));
      logMsg(`Team size increased to ${state.maxHeroesOnBoard}!`);
    }

    // Execute OnAcquire effects for Starter, Instant & Economy Relics
    switch (relicId) {
      case 720: // Starter Kit: Instant Shards (+7)
        state.shards += 7;
        state.stats.totalShardsEarned += 7;
        break;
      case 725: case 6032: // Rare Attack Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'Attack'), 2);
        break;
      case 726: case 6034: // Rare Max HP Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'MaxHealth'), 2);
        break;
      case 727: case 6033: // Rare Defense Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'Defense'), 2);
        break;
      case 728: case 6035: // Rare Crit Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'Crit'), 2);
        break;
      case 729: case 6036: // Rare Attack Speed Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'AttackSpeed'), 2);
        break;
      case 730: case 6037: // Rare Mana Regen Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'ManaRegen'), 2);
        break;
      case 731: case 6038: // Rare Magic Item
        grantRandomItemByFilter(it => it.rarity === 'Rare' && (it.statMods || []).some(m => m.stat === 'Magic'), 2);
        break;
      case 734: // Starter Kit: Temporary Item Discount (until Combat #4, items cost 2 less)
        if (state.shop?.items && state.floorIndex < 4) {
          for (const slot of state.shop.items) {
            if (!slot.sold) slot.price = Math.max(1, slot.price - 2);
          }
        }
        break;
      case 736: // Starter Kit: Instant Attack Boost (+35 Attack)
        addHeroBonusStat(targetHero, 'Attack', 35);
        break;
      case 737: // Starter Kit: Instant Max HP Boost (+300 MaxHealth)
        addHeroBonusStat(targetHero, 'MaxHealth', 300);
        break;
      case 738: // Starter Kit: Instant Defense Boost (+45 Defense)
        addHeroBonusStat(targetHero, 'Defense', 45);
        break;
      case 739: // Starter Kit: Instant Crit Boost (+20 Crit)
        addHeroBonusStat(targetHero, 'Crit', 20);
        break;
      case 740: // Starter Kit: Instant Attack Speed Boost (+30 AttackSpeed)
        addHeroBonusStat(targetHero, 'AttackSpeed', 30);
        break;
      case 741: // Starter Kit: Instant Mana Regen Boost (+6 ManaRegen)
        addHeroBonusStat(targetHero, 'ManaRegen', 6);
        break;
      case 742: // Starter Kit: Instant Magic Boost (+35 Magic)
        addHeroBonusStat(targetHero, 'Magic', 35);
        break;
      case 1019: // Basic Differentiator: Shop rerolls cost 1 less
        if (state.shop) state.shop.rerollCost = Math.max(0, (state.shop.rerollCost ?? 0) - 1);
        break;
      case 2056: // Advanced Differentiator: Shop rerolls cost 2 less
        if (state.shop) state.shop.rerollCost = Math.max(0, (state.shop.rerollCost ?? 0) - 2);
        break;
      case 6001: { // Starter Bundle: 1 common item, 1 common relic, +3 Shards
        grantRandomItemByFilter(it => it.rarity === 'Common', 3);
        const cPool = catalog.poolEntries(catalog.relicPools, 101, catalog.relics).filter(e => !hasRelic(e.id));
        const crId = rng.weighted(cPool);
        if (crId) grantRelic(crId);
        state.shards += 3;
        state.stats.totalShardsEarned += 3;
        break;
      }
      case 6003: // Shard Pouch: +12 Shards
        state.shards += 12;
        state.stats.totalShardsEarned += 12;
        break;
      case 6004: // Item Windfall: 3 common items
        for (let k = 0; k < 3; k++) grantRandomItemByFilter(it => it.rarity === 'Common', 3);
        break;
      case 6005: { // Mystery Charm: 1 rare relic
        const rPool = catalog.poolEntries(catalog.relicPools, 102, catalog.relics).filter(e => !hasRelic(e.id));
        const rrId = rng.weighted(rPool);
        if (rrId) grantRelic(rrId);
        break;
      }
      case 6006: { // Crest Windfall: 2 random Crest items (801..807)
        const crests = [801, 802, 803, 804, 805, 806, 807];
        const c1 = rng.pick(crests) ?? 801;
        const c2 = rng.pick(crests.filter(x => x !== c1)) ?? 802;
        grantItem(c1);
        grantItem(c2);
        break;
      }
      case 6007: { // Relic Bazaar: The shop shows an additional relic
        if (state.shop?.relics) {
          const extraId = rollDistinctRelicsFromPool(rng, 101, 1, state.shop.relics.map(s => s.relicId))[0];
          if (extraId) {
            const rDef = catalog.relics.get(extraId);
            const rRarity = rDef?.rarity || 'Common';
            const rPrice = relicRarityCosts.get(rRarity) ?? rDef?.price ?? 10;
            state.shop.relics.push({
              slot: state.shop.relics.length,
              id: extraId,
              relicId: extraId,
              rarity: rRarity,
              price: rPrice,
              discount: 0,
              frozen: false,
              sold: false,
            });
          }
        }
        break;
      }
      case 6008: // Item Bazaar: Items cost 2 fewer Shards
        if (state.shop?.items) {
          for (const slot of state.shop.items) {
            if (!slot.sold) slot.price = Math.max(1, slot.price - 2);
          }
        }
        break;
      case 6010: // All In: +45 Shards, Stabilizer unavailable
        state.shards += 45;
        state.stats.totalShardsEarned += 45;
        state.isStabilizerActive = false;
        state.accumulatedShards = 0;
        state.lives = 1;
        break;
      case 6012: // Quantity over Quality: +1 max team size (Max: 5), -1 item slot
        state.maxHeroesOnBoard = Math.min(5, state.maxHeroesOnBoard + 1);
        break;
      case 6013: // Fast Track: Instantly rank up the hero, -10 Shards
        state.shards = Math.max(0, state.shards - 10);
        if (targetHero) {
          rankUpHeroInternal(targetHero, (targetHero.rank || 1) + 1);
        }
        break;
      case 6015: // Stability System: +25 Stabilizer Shards
        state.accumulatedShards += 25;
        break;
      case 6016: { // Quality over Quantity: +2 item slots, -1 max team size
        state.maxHeroesOnBoard = Math.max(1, state.maxHeroesOnBoard - 1);
        // If deployed heroes now exceed maxHeroesOnBoard, bench excess heroes
        const deployed = state.heroes.filter(h => h.onBoard);
        while (deployed.length > state.maxHeroesOnBoard) {
          const excess = deployed.pop();
          if (excess) {
            excess.onBoard = false;
            excess.x = null;
            excess.y = null;
          }
        }
        break;
      }
      case 6018: grantItem(rng.pick([308, 309]) ?? 308); break; // Warrior Equipment
      case 6019: grantItem(rng.pick([310, 311]) ?? 310); break; // Tank Equipment
      case 6020: grantItem(rng.pick([312, 313]) ?? 312); break; // Vanguard Equipment
      case 6021: grantItem(rng.pick([314, 315]) ?? 314); break; // Assassin Equipment
      case 6022: grantItem(rng.pick([316, 317]) ?? 316); break; // Duelist Equipment
      case 6023: grantItem(rng.pick([318, 319]) ?? 318); break; // Mystic Equipment
      case 6024: grantItem(rng.pick([320, 321]) ?? 320); break; // Mage Equipment
      case 6025: case 6026: case 6027: case 6028: case 6029: case 6030: case 6031:
        grantItem(801 + (relicId - 6025));
        break;
      case 4039: // Omnity Enforcer: Get all 7 Crests
        for (let cid = 801; cid <= 807; cid++) grantItem(cid);
        break;
      default:
        break;
    }

    syncAllHeroItemSlots();
    return entry;
  }

  function applyStatModToHero(hero, statModId) {
    if (!hero) return null;
    const sm = catalog.statMods.get(Number(statModId));
    if (!sm || !sm.stat) return null;
    addHeroBonusStat(hero, sm.stat, Number(sm.value || 0));
    return sm;
  }

  // ---------------------------------------------------------------------------
  // Act & Stage Construction (ActBuilder.BuildActData & RandomizeChunkStages)
  // ---------------------------------------------------------------------------
  function buildActPlan() {
    const actDef = catalog.acts[0];
    const rng = getFlowSeed('act_builder');
    const plan = [];
    const usedStageIds = new Set(state.usedFights);
    let globalFloor = 0;

    const chunks = actDef?.chunks || [];
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      const usedGroupsInChunk = new Set();
      const floors = chunk.floors || [];

      for (let fIdx = 0; fIdx < floors.length; fIdx++) {
        const fNode = floors[fIdx];
        let pickedStage = null;

        if (fNode.fightType === 'SpecificStage' && fNode.specificId > 0) {
          // Try difficulty-adjusted specific stage ID first (e.g. 10000 -> 20000 -> 30000)
          const diffStageId = fNode.specificId >= 10000 && fNode.specificId < 20000
            ? fNode.specificId + (stageDifficultyIndex - 1) * 10000
            : fNode.specificId;
          pickedStage = catalog.stages.get(diffStageId) || catalog.stages.get(fNode.specificId);
        }

        if (!pickedStage) {
          // Filter candidate stages for act 1, floor = globalFloor
          let candidates = [...catalog.stages.values()].filter(s =>
            !s.disabled &&
            s.act === 1 &&
            s.floor === globalFloor &&
            s.stageType !== 'EventFight' &&
            s.stageType !== 'Endless' &&
            !usedStageIds.has(s.id)
          );
          const diffMatched = candidates.filter(s => s.difficulty === stageDifficultyIndex);
          if (diffMatched.length) candidates = diffMatched;
          const groupFiltered = candidates.filter(s => !usedGroupsInChunk.has(s.group));
          if (groupFiltered.length) candidates = groupFiltered;

          pickedStage = rng.pick(candidates);
        }

        if (!pickedStage) {
          // Fallback to any non-empty stage
          pickedStage = [...catalog.stages.values()].find(s => !s.disabled && s.enemies?.length) || null;
        }

        if (pickedStage) {
          usedStageIds.add(pickedStage.id);
          if (pickedStage.group) usedGroupsInChunk.add(pickedStage.group);
        }

        plan.push({
          floorIndex: globalFloor,
          floor: globalFloor + 1,
          chunkIndex: cIdx,
          floorInChunk: fIdx,
          stageId: pickedStage?.id ?? null,
          stageType: pickedStage?.stageType || (fIdx === floors.length - 1 ? (cIdx === chunks.length - 1 ? 'Boss' : 'MiniBoss') : 'Normal'),
          eventOverrideType: fNode.eventOverrideType || 'NoCrossroads',
          crossroadsId: fNode.crossroadsId ?? -1,
          fightCrossroadsId: fNode.fightCrossroadsId ?? -1,
          regularCrossroadsPoolId: chunk.regularCrossroadsPoolId ?? -1,
          randomCrossroadsPoolId: chunk.randomCrossroadsPoolId ?? -1,
          modifierChoices: fNode.modifierChoices || [],
          cleared: false,
        });
        globalFloor++;
      }
    }

    state.actPlan = plan;
    state.usedFights = [...usedStageIds];
  }

  function syncActBossRelicForCurrentFloor() {
    const bossRelicMod = activeDiffMods.get('ActBossRelicEntry');
    if (!bossRelicMod || state.endlessFloorIndex >= 0) {
      state.actBossRelicId = null;
      return;
    }
    const node = state.actPlan[state.floorIndex];
    if (!node) {
      state.actBossRelicId = null;
      return;
    }
    // DifficultyService.OnActBossReached (0x180428900): ClearActBossRelics when reaching the chunk's MiniBoss/Boss floor itself
    if (node.stageType === 'MiniBoss' || node.stageType === 'Boss') {
      state.actBossRelicId = null;
      return;
    }
    // DifficultyService.OnActStarted (0x180428950): Look at the last floor of the current chunk and activate its paired ActBossRelic
    const chunkNodes = state.actPlan.filter(n => n.chunkIndex === node.chunkIndex);
    const chunkBossNode = chunkNodes[chunkNodes.length - 1];
    const bossStageId = Number(chunkBossNode?.stageId);
    const pair = (bossRelicMod.stageRelicPairs || []).find(p => Number(p.StageId) === bossStageId);
    const relicId = pair ? Number(pair.RelicId) : Number(bossRelicMod.fallbackRelicId ?? 7000);
    state.actBossRelicId = relicId || null;
    if (node.chunkIndex === 1 && state.act2ActBossStacks <= 0) {
      state.act2ActBossStacks = relicId === 7002 ? 4 : relicId === 7003 ? 3 : relicId === 7004 ? 2 : 0;
    }
  }

  function loadCurrentFloorStage() {
    if (state.endlessFloorIndex >= 0) {
      state.actBossRelicId = null;
      const eIdx = state.endlessFloorIndex;
      const rng = getFlowSeed(`endless_stage_${eIdx}`);
      const isEndlessBoss = (eIdx + 1) % 6 === 0;
      const isEndlessMiniBoss = !isEndlessBoss && (eIdx + 1) % 3 === 0;

      let pool = [];
      if (isEndlessBoss) {
        pool = [...catalog.stages.values()].filter(s => s.stageType === 'Boss' && !s.disabled);
      } else if (isEndlessMiniBoss) {
        pool = [...catalog.stages.values()].filter(s => s.stageType === 'MiniBoss' && !s.disabled);
      } else {
        pool = [...catalog.stages.values()].filter(s => s.stageType === 'Endless' && !s.disabled);
      }
      if (!pool.length) {
        pool = [...catalog.stages.values()].filter(s => s.stageType === 'Endless' && !s.disabled);
      }
      const stg = pool.length ? pool[eIdx % pool.length] : catalog.stages.get(state.stageId);
      if (stg) {
        state.stageId = stg.id;
        const rawStage = data.stages?.[stg.id];
        state.stage = cloneJson(rawStage && rawStage.stageType !== 'FightMode' ? rawStage : { ...(rawStage || {}), ...stg });
        state.stage.stageType = isEndlessBoss ? 'Boss' : isEndlessMiniBoss ? 'MiniBoss' : 'Endless';
        const baseEnemies = cloneJson(stg.enemies || []);

        // Add reinforcement enemies on later Endless floors (starting from Endless floor 4+, i.e. eIdx >= 3)
        const extraCount = Math.min(4, Math.floor(eIdx / 3));
        const usedPos = new Set(baseEnemies.map(e => `${e.x},${e.y}`));
        const stageEnemyIds = [];
        for (const s of pool) {
          for (const se of s.enemies || []) {
            if (se && se.enemyId != null) stageEnemyIds.push(se.enemyId);
          }
        }
        const candidateIds = stageEnemyIds.length > 0
          ? stageEnemyIds
          : Object.values(data.enemies || {})
              .filter(e => e && !e.disabled && !String(e.name || '').toLowerCase().includes('boss'))
              .map(e => e.id ?? e.enemyId);
        const W = catalog.board?.width || 7;
        const H = catalog.board?.height || 8;
        const freeCells = [];
        for (let y = Math.max(4, H - 4); y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!usedPos.has(`${x},${y}`)) freeCells.push({ x, y });
          }
        }
        for (let k = 0; k < extraCount && freeCells.length > 0 && candidateIds.length > 0; k++) {
          const cellIdx = rng.int(freeCells.length);
          const cell = freeCells.splice(cellIdx, 1)[0];
          const pickedEnemyId = rng.pick(candidateIds) ?? baseEnemies[0]?.enemyId;
          if (cell && pickedEnemyId != null) {
            baseEnemies.push({
              enemyId: pickedEnemyId,
              x: cell.x,
              y: cell.y,
              direction: 'None',
            });
          }
        }
        state.stage.enemies = baseEnemies;
        state.enemies = cloneJson(baseEnemies);
      }
      return;
    }

    const node = state.actPlan[state.floorIndex];
    if (!node) return;
    state.chunkIndex = node.chunkIndex;
    state.floorInChunk = node.floorInChunk;
    state.floor = node.floorIndex + 1;
    const stg = catalog.stages.get(node.stageId);
    if (stg) {
      state.stageId = stg.id;
      const rawStage = data.stages?.[stg.id];
      // Merge normalized catalog stage fields (difficulty, stageType, floor, act) with rawStage
      state.stage = cloneJson({ ...(rawStage || {}), ...stg });
      state.enemies = cloneJson(stg.enemies || []);
    }
    syncActBossRelicForCurrentFloor();
  }

  // ---------------------------------------------------------------------------
  // Initial Selection
  // ---------------------------------------------------------------------------
  function rollInitialSelection() {
    const rng = getFlowSeed('initial_selection');
    const count = Math.max(1, Number(rewardS.InitialSelectionSize ?? 3));
    const heroPoolId = Number(rewardS.initialSelectionHeroPoolID ?? 1);
    const relicPoolId = Number(rewardS.basicInitialSelectionRelicPoolID ?? 200);

    let heroEntries = catalog.poolEntries(catalog.heroPools, heroPoolId, catalog.heroes);
    if (!heroEntries.length) {
      heroEntries = [...catalog.heroes.values()].filter(h => !h.disabled).map(h => ({ id: h.id, weight: 10 }));
    }
    let relicEntries = catalog.poolEntries(catalog.relicPools, relicPoolId, catalog.relics);
    if (!relicEntries.length) {
      relicEntries = catalog.poolEntries(catalog.relicPools, 101, catalog.relics);
    }

    const pickedHeroes = rng.weightedDistinct(heroEntries, count);
    const pickedRelics = rng.weightedDistinct(relicEntries, count);

    state.initialChoices = pickedHeroes.map((heroId, idx) => ({
      slot: idx,
      heroId,
      relicId: pickedRelics[idx] ?? pickedRelics[0] ?? null,
      rank: 1,
    }));
  }

  // ---------------------------------------------------------------------------
  // Shop & Odd Smoothing (ShopService)
  // ---------------------------------------------------------------------------
  function isCurrentStageSuperShopEligible() {
    const stType = state.stage?.stageType;
    return stType === 'MiniBoss' || stType === 'Elite' || stType === 'Boss';
  }

  function getChunkTableWeights(table, chunkIdx, smoothingMap, isSuper) {
    const effectiveChunk = clamp(chunkIdx, 0, 1);
    const entries = (table || []).filter(e => Number(e.ChunkIndex) === effectiveChunk);
    return entries.map(e => {
      const key = e.Element;
      const base = Number(e.Chance ?? 0);
      const smooth = (!isSuper && smoothingMap && smoothingMap[key] != null) ? Number(smoothingMap[key]) : 0;
      return { id: key, base, weight: Math.max(0, base + smooth) };
    });
  }

  function resetShop(isNewFloor = true) {
    const isSuper = state.lastResult?.winner === 'players' && isCurrentStageSuperShopEligible();
    const chunkIdx = clamp(state.chunkIndex, 0, 1);
    if (isNewFloor) {
      state.shopVisitsByChunk[chunkIdx] = (state.shopVisitsByChunk[chunkIdx] || 0) + 1;
    }

    const rng = getFlowSeed(isNewFloor ? `shop_floor_${state.floorIndex}` : `shop_reroll_${state.shopRefreshCount}`);
    const prevShop = state.shop;

    const heroSlotsCount = Number(isSuper ? (shopS.HeroChoicesPerSuperShop ?? 3) : (shopS.HeroChoicesPerShop ?? 3));
    const itemSlotsCount = Number(isSuper ? (shopS.ItemChoicesPerSuperShop ?? 4) : (shopS.ItemChoicesPerShop ?? 2));
    const relicSlotsCount = Number(isSuper ? (shopS.RelicChoicesPerSuperShop ?? 3) : (shopS.RelicChoicesPerShop ?? 1)) + (hasRelic(6007) ? 1 : 0);

    // Check anti-sale modifier on normal shops
    const antiSaleMod = !isSuper ? activeDiffMods.get('ShopAntiSaleEntry') : null;
    const hasAntiSale = !!(antiSaleMod && rng.chance(Number(antiSaleMod.AntiSaleChance ?? 0.5)));
    const priceMultiplier = hasAntiSale ? (1 + Number(antiSaleMod.PriceIncreasePercentage ?? 0.25)) : 1;

    // 1. Roll Hero Choices (ShopService.RandomizeHeroChoices + BuildHeroChoice)
    const heroRankTable = isSuper ? shopS.superShopHeroRankChances : shopS.heroRankChances;
    const allHeroEntries = catalog.poolEntries(catalog.heroPools, 1, catalog.heroes);
    const ownedByHeroId = new Map(state.heroes.map(h => [Number(h.heroId), h]));
    const rosterFull = state.heroes.length >= state.maxTotalHeroes;
    const usedHeroIds = new Set();
    const rolledHeroRanks = new Set();
    const heroSlots = [];

    for (let i = 0; i < heroSlotsCount; i++) {
      const prevH = prevShop?.heroes?.[i];
      if (isNewFloor && prevH && (prevH.frozen || prevShop?.frozen) && !prevH.sold) {
        const owned = ownedByHeroId.get(Number(prevH.heroId));
        if (!owned || owned.rank < state.maxHeroRank) {
          const frozenRank = owned ? clamp(owned.rank + 1, 2, state.maxHeroRank) : Number(prevH.rank || 1);
          const frozenBasePrice = heroRankCosts.get(frozenRank) ?? catalog.heroes.get(Number(prevH.heroId))?.price ?? 15;
          const frozenPrice = owned && frozenRank !== prevH.rank
            ? Math.max(1, Math.round(frozenBasePrice * priceMultiplier * (1 - (prevH.discount || 0) / 100)))
            : prevH.price;
          usedHeroIds.add(Number(prevH.heroId));
          rolledHeroRanks.add(frozenRank);
          heroSlots.push({ ...prevH, rank: frozenRank, price: frozenPrice, slot: i, frozen: true });
          continue;
        }
      }
      const rankWeights = getChunkTableWeights(heroRankTable, chunkIdx, state.oddSmoothing.heroRank, isSuper);
      const rolledRank = Number(rng.weighted(rankWeights) || 1);

      // Filter eligible heroes:
      // - Never offer a hero already in this shop or already at max rank (S = 4)
      // - If roster is full (6 heroes), only offer owned heroes below max rank
      const basePool = allHeroEntries.filter(e => {
        if (usedHeroIds.has(e.id)) return false;
        const owned = ownedByHeroId.get(Number(e.id));
        if (owned && owned.rank >= state.maxHeroRank) return false;
        if (rosterFull && !owned) return false;
        return true;
      });

      const candidatePool = basePool.length ? basePool : allHeroEntries;
      const heroId = rng.weighted(candidatePool) ?? 1;
      usedHeroIds.add(heroId);

      // If the player already owns this hero at rank R, its shop offer rank is ALWAYS R + 1 (never <= R),
      // and its price increases to the cost of rank R + 1 (25 for B, 35 for A, 45 for S)!
      const ownedHero = ownedByHeroId.get(Number(heroId));
      const rank = ownedHero
        ? clamp((ownedHero.rank || 1) + 1, 2, state.maxHeroRank)
        : clamp(rolledRank, 1, state.maxHeroRank);

      rolledHeroRanks.add(rank);
      if (!isSuper && state.oddSmoothing.heroRank[rank] != null) {
        state.oddSmoothing.heroRank[rank] = 0;
      }

      const basePrice = heroRankCosts.get(rank) ?? catalog.heroes.get(heroId)?.price ?? 15;
      let discount = 0;
      if (state.shopDiscounts.hero > 0 && i === 0) {
        discount = saleDiscountRate;
      }
      const finalPrice = Math.max(1, Math.round(basePrice * priceMultiplier * (1 - discount)));
      heroSlots.push({
        slot: i,
        id: heroId,
        heroId,
        rank,
        price: finalPrice,
        discount: discount > 0 ? Math.round(discount * 100) : 0,
        frozen: false,
        sold: false,
      });
    }

    // 2. Roll Item Choices
    const itemRarityTable = isSuper ? shopS.superShopItemRarityChances : shopS.itemRarityChances;
    const itemPoolByRarity = { Common: 3, Rare: 2, Epic: 1 };
    const usedItemIds = new Set();
    const rolledItemRarities = new Set();
    const itemSlots = [];
    const itemFlatDiscount = (hasRelic(6008) ? 2 : 0) + (hasRelic(734) && state.floorIndex < 4 ? 2 : 0);

    for (let i = 0; i < itemSlotsCount; i++) {
      const prevIt = prevShop?.items?.[i];
      if (isNewFloor && prevIt && (prevIt.frozen || prevShop?.frozen) && !prevIt.sold) {
        usedItemIds.add(Number(prevIt.itemId));
        itemSlots.push({ ...prevIt, slot: i, frozen: true });
        continue;
      }
      let rarity;
      // In SuperShop, first guaranteed item is Epic per ShopSingleton.guaranteedItemsOfRarity
      if (isSuper && i === 0 && (shopS.guaranteedItemsOfRarity || []).some(g => g.Rarity === 'Epic')) {
        rarity = 'Epic';
      } else {
        const rarWeights = getChunkTableWeights(itemRarityTable, chunkIdx, state.oddSmoothing.itemRarity, isSuper);
        rarity = String(rng.weighted(rarWeights) || 'Common');
      }
      rolledItemRarities.add(rarity);
      if (!isSuper && state.oddSmoothing.itemRarity[rarity] != null) {
        state.oddSmoothing.itemRarity[rarity] = 0;
      }

      const poolId = itemPoolByRarity[rarity] || 3;
      let pool = catalog.poolEntries(catalog.itemPools, poolId, catalog.items).filter(e => !usedItemIds.has(e.id));
      if (!pool.length) {
        pool = [...catalog.items.values()]
          .filter(it => !it.disabled && it.rarity === rarity && !usedItemIds.has(it.id))
          .map(it => ({ id: it.id, weight: 10 }));
      }
      const itemId = rng.weighted(pool) ?? [...catalog.items.keys()][0];
      usedItemIds.add(itemId);
      const itemDef = catalog.items.get(itemId);
      const actualRarity = itemDef?.rarity || rarity;
      const basePrice = itemRarityCosts.get(actualRarity) ?? itemDef?.price ?? 5;
      const finalPrice = Math.max(1, Math.round(basePrice * priceMultiplier) - itemFlatDiscount);

      itemSlots.push({
        slot: i,
        id: itemId,
        itemId,
        rarity: actualRarity,
        price: finalPrice,
        frozen: false,
        sold: false,
      });
    }

    // 3. Roll Relic Choices
    const relicRarityTable = isSuper ? shopS.superShopRelicRarityChances : shopS.relicRarityChances;
    const relicPoolByRarity = { Common: 101, Rare: 102, Epic: 103, Legendary: 104 };
    const ownedRelicIds = new Set(state.relics.map(r => Number(r.relicId)));
    const usedRelicIds = new Set(ownedRelicIds);
    const rolledRelicRarities = new Set();
    const relicSlots = [];

    for (let i = 0; i < relicSlotsCount; i++) {
      const prevR = prevShop?.relics?.[i];
      if (isNewFloor && prevR && (prevR.frozen || prevShop?.frozen) && !prevR.sold && !ownedRelicIds.has(Number(prevR.relicId))) {
        usedRelicIds.add(Number(prevR.relicId));
        relicSlots.push({ ...prevR, slot: i, frozen: true });
        continue;
      }
      let rarity;
      if (isSuper && i === 0 && (shopS.guaranteedRelicsOfRarity || []).some(g => g.Rarity === 'Legendary')) {
        rarity = 'Legendary';
      } else {
        const rarWeights = getChunkTableWeights(relicRarityTable, chunkIdx, state.oddSmoothing.relicRarity, isSuper);
        rarity = String(rng.weighted(rarWeights) || 'Common');
      }
      rolledRelicRarities.add(rarity);
      if (!isSuper && state.oddSmoothing.relicRarity[rarity] != null) {
        state.oddSmoothing.relicRarity[rarity] = 0;
      }

      const poolId = relicPoolByRarity[rarity] || 101;
      let pool = catalog.poolEntries(catalog.relicPools, poolId, catalog.relics).filter(e => !usedRelicIds.has(e.id));
      if (!pool.length) {
        pool = [...catalog.relics.values()]
          .filter(r => !r.disabled && r.rarity === rarity && !usedRelicIds.has(r.id))
          .map(r => ({ id: r.id, weight: 10 }));
      }
      if (!pool.length) {
        pool = catalog.poolEntries(catalog.relicPools, 102, catalog.relics).filter(e => !usedRelicIds.has(e.id));
      }
      const relicId = rng.weighted(pool) ?? 3001;
      usedRelicIds.add(relicId);
      const relicDef = catalog.relics.get(relicId);
      const actualRarity = relicDef?.rarity || rarity;
      const basePrice = relicRarityCosts.get(actualRarity) ?? relicDef?.price ?? 15;
      const discount = (state.shopDiscounts.relic > 0 && i === 0) ? saleDiscountRate : 0;
      const finalPrice = Math.max(1, Math.round(basePrice * priceMultiplier * (1 - discount)));

      relicSlots.push({
        slot: i,
        id: relicId,
        relicId,
        rarity: actualRarity,
        price: finalPrice,
        discount: discount > 0 ? Math.round(discount * 100) : 0,
        frozen: false,
        sold: false,
      });
    }

    // SuperShop guaranteed TeamSize relic (4500) per ShopSingleton._guaranteedTeamSizeIncreaseRelicId
    const guaranteedTeamRelicId = Number(shopS.guaranteedTeamSizeIncreaseRelicId ?? TEAM_SIZE_RELIC_ID);
    if (isSuper && catalog.relics.has(guaranteedTeamRelicId) && state.maxHeroesOnBoard < state.maxTotalHeroes) {
      const teamRelicDef = catalog.relics.get(guaranteedTeamRelicId);
      const teamRelicPrice = relicRarityCosts.get('TeamSize') ?? teamRelicDef?.price ?? 40;
      relicSlots.push({
        slot: relicSlots.length,
        id: guaranteedTeamRelicId,
        relicId: guaranteedTeamRelicId,
        rarity: teamRelicDef?.rarity || 'TeamSize',
        price: teamRelicPrice,
        frozen: false,
        sold: false,
      });
    }

    // 4. Odd Smoothing increments for normal shops (ShopService.SmoothChancesFromSales)
    if (!isSuper) {
      for (const inc of shopS.heroRankChanceIncreases || []) {
        if (Number(inc.ChunkIndex) === chunkIdx && !rolledHeroRanks.has(Number(inc.Element))) {
          const k = Number(inc.Element);
          state.oddSmoothing.heroRank[k] = (state.oddSmoothing.heroRank[k] || 0) + Number(inc.Chance || 0);
        }
      }
      for (const inc of shopS.itemRarityChanceIncreases || []) {
        if (Number(inc.ChunkIndex) === chunkIdx && !rolledItemRarities.has(String(inc.Element))) {
          const k = String(inc.Element);
          state.oddSmoothing.itemRarity[k] = (state.oddSmoothing.itemRarity[k] || 0) + Number(inc.Chance || 0);
        }
      }
      for (const inc of shopS.relicRarityChanceIncreases || []) {
        if (Number(inc.ChunkIndex) === chunkIdx && !rolledRelicRarities.has(String(inc.Element))) {
          const k = String(inc.Element);
          state.oddSmoothing.relicRarity[k] = (state.oddSmoothing.relicRarity[k] || 0) + Number(inc.Chance || 0);
        }
      }
    }

    const rerollRelicDiscount = (hasRelic(1019) ? 1 : 0) + (hasRelic(2056) ? 2 : 0);
    const rerollsThisShop = isNewFloor ? 0 : ((prevShop?.rerollsThisShop || 0) + 1);
    const rawRerollCost = (isSuper ? superShopBaseRerollCost : baseRerollCost) + rerollsThisShop * rerollCostIncrement - rerollRelicDiscount;
    const rerollCost = Math.max(0, rawRerollCost);

    state.shop = {
      isSuperShop: isSuper,
      heroes: heroSlots,
      items: itemSlots,
      relics: relicSlots,
      rerollsThisShop,
      rerollCost,
      teamSizeCost: state.teamSizeCost,
      frozen: isNewFloor ? !!(prevShop?.frozen && [...heroSlots, ...itemSlots, ...relicSlots].some(s => s.frozen)) : false,
    };
  }

  // ---------------------------------------------------------------------------
  // Crossroads, Campfire & Event Builders
  // ---------------------------------------------------------------------------
  function interpolateTemplate(str, vars) {
    if (!str || typeof str !== 'string') return '';
    if (!vars || typeof vars !== 'object') return str;
    return str.replace(/\{(\w+)\}/g, (match, key) => {
      const k = key.toLowerCase();
      if (vars[key] !== undefined && vars[key] !== null) return String(vars[key]);
      if (vars[k] !== undefined && vars[k] !== null) return String(vars[k]);
      return match;
    });
  }

  function buildCrossroadsVarsForEvent(ev) {
    if (!ev) return {};
    const partyClasses = [...new Set(state.heroes.flatMap(h => getHeroClasses(h)))];
    const primaryClassId = partyClasses[0] || 1;
    const primaryClassName = locClassName(primaryClassId);
    const vars = {
      amount: 15,
      shards: 15,
      shardbonus: 15,
      stat: locStatName('Attack'),
      statbonus: 15,
      statlosspercent: 15,
      statreduction: 15,
      reliccount: 3,
      itemcount: 3,
      combatcount: 2,
      stuncombatcount: 2,
      maxhpbonus: 250,
      burnpercent: 20,
      poisonpercent: 20,
      defensepenalty: 20,
      damagepercent: 20,
      time: 10,
      stuntime: 3,
      stunduration: 3,
      timelimit: 25,
      survivetime: 30,
      goodchance: 50,
      badchance: 50,
      rank: 'B',
      class: primaryClassName,
      hero: state.heroes[0] ? locHeroName(state.heroes[0].heroId) : L('Héros', 'Hero'),
      bossname: L('Boss de la Faille', 'Rift Boss'),
      name: primaryClassName,
      relic: L('Relique', 'Relic'),
      relicname: L('Relique', 'Relic'),
      item: L('Objet', 'Item'),
    };
    const firstCh = (ev.choices || [])[0];
    const firstRw = (firstCh?.rewards || [])[0];
    if (firstRw) {
      if (firstRw.RewardType === 'GrantStatsToHero' || firstRw.RewardType === 'SpecificStatMod') {
        const smId = firstRw.statModId ?? (catalog.poolEntries(catalog.statModPools, Number(firstRw.entryId ?? 1), catalog.statMods)[0]?.id ?? Number(firstRw.entryId ?? 1));
        const sm = catalog.statMods.get(Number(smId));
        if (sm) {
          vars.amount = sm.value;
          vars.stat = locStatName(sm.stat);
          vars.statbonus = sm.value;
        }
      } else if (firstRw.RewardType === 'Shards') {
        const amt = Math.abs(Number(firstRw.Amount || 15));
        vars.amount = amt;
        vars.shards = amt;
      }
    }
    if (ev.id === 1036) {
      vars.statbonus = 20;
      vars.amount = 20;
    }
    return vars;
  }

  function buildCrossroadsForCurrentNode() {
    const rng = getFlowSeed(`crossroads_${state.floorIndex}`);

    if (state.endlessFloorIndex >= 0) {
      const endlessEvents = catalog.poolEntries(catalog.eventPools, 11, catalog.events);
      const picked = rng.weightedDistinct(endlessEvents, 3);
      state.crossroads = picked.map((evId, idx) => {
        const ev = catalog.events.get(evId);
        const cVars = buildCrossroadsVarsForEvent(ev);
        return {
          index: idx,
          pathType: 'Event',
          type: 'Event',
          eventId: evId,
          title: locEventName(ev) || L(`Bénédiction Infinie #${idx + 1}`, `Endless Boon #${idx + 1}`),
          description: interpolateTemplate(locEventCrossroadsDesc(ev) || locEventText(ev) || '', cVars),
          crossroadsVars: cVars,
          image: ev?.image || null,
          icon: ev?.icon || null,
        };
      });
      return state.crossroads;
    }

    const node = state.actPlan[state.floorIndex];
    const choices = [];
    const usedEventIds = new Set(state.usedEvents);

    const pushEventOption = (evId, overrideType = null) => {
      const ev = catalog.events.get(Number(evId));
      if (!ev) return;
      const isCampfire = ev.id === 600 || ev.id === 601 || /campfire|feu de camp/i.test(ev.name || '');
      const cVars = buildCrossroadsVarsForEvent(ev);
      choices.push({
        index: choices.length,
        pathType: overrideType || (isCampfire ? 'Campfire' : 'Event'),
        type: overrideType || (isCampfire ? 'Campfire' : 'Event'),
        eventId: ev.id,
        title: locEventName(ev),
        description: interpolateTemplate(locEventCrossroadsDesc(ev) || locEventText(ev) || '', cVars),
        crossroadsVars: cVars,
        image: ev.image || null,
        icon: ev.icon || null,
      });
    };

    if (node) {
      // 1. SpecificCrossroads or CrossroadsFromPool
      let crId = node.crossroadsId;
      if (node.eventOverrideType === 'CrossroadsFromPool' && crId > 0) {
        const crPool = catalog.poolEntries(catalog.crossroadsPools, crId, catalog.crossroads);
        if (crPool.length) crId = rng.weighted(crPool);
      }

      if (node.modifierChoices?.length && (node.eventOverrideType === 'StageModifierChoice' || node.eventOverrideType === 'CrossroadsFromPool')) {
        const modSpec = node.modifierChoices[0];
        const enemyPool = catalog.poolEntries(catalog.relicPools, modSpec.enemyRelicPoolId, catalog.relics);
        const enemyRelicId = rng.weighted(enemyPool) ?? 5000;
        const enemyRelic = catalog.relics.get(enemyRelicId);
        const rawEnemyRelic = data.relics?.[enemyRelicId];
        const isEpicReward = Number(modSpec.enemyRelicPoolId) === 71 || (modSpec.rewardRelicPoolIds || []).includes(108);
        const rewardRarity = isEpicReward ? 'Epic' : 'Rare';
        const rewardTag = isEpicReward ? 'epic' : 'rare';
        const enemyDesc = locRelicDesc(enemyRelicId) || L('Les ennemis gagnent un bonus de puissance de combat.', 'Enemies gain bonus combat power.');
        const rewardRarityFr = isEpicReward ? 'Reliques Épiques' : 'Reliques Rares';
        choices.push({
          index: choices.length,
          pathType: 'StageModifier',
          type: 'StageModifier',
          enemyRelicId,
          rewardRelicPoolIds: (modSpec.rewardRelicPoolIds || []).slice(),
          rewardRarity,
          title: L('Combat de Défi', 'Challenge Encounter'),
          subtitle: locRelicName(enemyRelicId) || L('Mutation de la Faille', 'Rift Mutation'),
          description: isFr()
            ? `${enemyDesc}\n\n[Récompense :]<bold> Choisissez [1]<bold> parmi [3]<bold> [${rewardRarityFr}]<${rewardTag}> après avoir gagné le prochain combat.`
            : `${enemyDesc}\n\n[Reward:]<bold> Choose [1]<bold> of [3]<bold> [${rewardRarity} Relics]<${rewardTag}> after winning the next battle.`,
          enemyRelicValues: rawEnemyRelic?.descriptionVars || enemyRelic?.descriptionVars || [],
          icon: rawEnemyRelic?.icon || enemyRelic?.icon || null,
        });
      }

      const crDef = catalog.crossroads.get(Number(crId));
      if (crDef && crDef.paths?.length) {
        for (const p of crDef.paths) {
          if (p.eventId > 0 && catalog.events.has(p.eventId)) {
            pushEventOption(p.eventId);
          } else if (p.eventPoolId > 0) {
            let pool = catalog.poolEntries(catalog.eventPools, p.eventPoolId, catalog.events)
              .filter(e => !usedEventIds.has(e.id) && !choices.some(c => c.eventId === e.id));
            if (!pool.length) {
              pool = catalog.poolEntries(catalog.eventPools, p.eventPoolId, catalog.events)
                .filter(e => !choices.some(c => c.eventId === e.id));
            }
            const evId = rng.weighted(pool);
            if (evId !== undefined) pushEventOption(evId);
          }
        }
      }
    }

    // Ensure at least 2 meaningful choices on regular floors (add curated event or direct Stage path)
    if (choices.length === 0) {
      const fallbackPoolId = state.chunkIndex === 0 ? 25 : 26;
      const pool = catalog.poolEntries(catalog.eventPools, fallbackPoolId, catalog.events)
        .filter(e => !usedEventIds.has(e.id));
      const picked = rng.weightedDistinct(pool, 2);
      for (const evId of picked) pushEventOption(evId);
    }

    // Always offer a direct Combat / Stage advancement option if not already a mandatory single-path event
    const nextNode = state.actPlan[state.floorIndex + 1];
    if (nextNode && !choices.some(c => c.pathType === 'Stage')) {
      const nextStg = catalog.stages.get(nextNode.stageId);
      choices.push({
        index: choices.length,
        pathType: 'Stage',
        type: 'Stage',
        stageId: nextNode.stageId,
        stageType: nextStg?.stageType || nextNode.stageType || 'Normal',
        floor: nextNode.floor,
        title: L(`Combat Standard (Étage ${nextNode.floor})`, `Regular Encounter (Floor ${nextNode.floor})`),
        description: L('Avancez directement au prochain combat de la Faille sans modificateur.', 'Proceed directly to the next Rift battle without modifiers.'),
      });
    }

    state.crossroads = choices;
    return choices;
  }

  function buildCampfireChoiceList(maxRankAllowed) {
    const rankLetter = ['C', 'B', 'A', 'S'][maxRankAllowed] || 'A';
    const healAmt = Number(campfireS.LifeRecoveredByRest ?? 15);
    return [
      {
        id: 'train',
        title: L('S\'entraîner', 'Train'),
        description: L(
          `Promouvoir un Héros (jusqu'au Rang ${rankLetter}).`,
          `Rank up a Hero (up to Rank ${rankLetter}).`
        ),
        disabled: false,
      },
      {
        id: 'study',
        title: L('Étudier', 'Study'),
        description: L(
          'Réapprendre la spécialisation ou le modificateur de rang d\'un Héros.',
          'Retrain a Hero specialization or rank modifier.'
        ),
        disabled: false,
      },
      {
        id: 'recharge',
        title: L('Recharger', 'Recharge'),
        description: L(
          `Restaurer votre Stabilisateur d'Éclats (+${healAmt} Éclats de Stabilisateur).`,
          `Restore your Shard Stabilizer (+${healAmt} Stabilizer Shards).`
        ),
        disabled: false,
      },
      {
        id: 'rest',
        title: L('Se reposer', 'Rest'),
        description: L(
          'Les Héros gagnent +20% de stats de base lors du prochain combat.',
          'Heroes gain +20% basic stats in the next combat.'
        ),
        disabled: false,
      },
      {
        id: 'skip',
        title: L('Continuer', 'Proceed'),
        description: L(
          'Quitter le feu de camp et avancer à l\'étage suivant.',
          'Leave the campfire and advance to the next floor.'
        ),
        disabled: false,
      },
    ];
  }

  function syncCampfireChoices() {
    if (!state.campfire || !Array.isArray(state.campfire.choices)) return;
    const freshDefs = buildCampfireChoiceList(state.campfire.maxRankUpAllowed ?? 2);
    const freshById = new Map(freshDefs.map(c => [c.id, c]));
    const canAnyHeroRankUp = state.heroes.some(h => (h.rank || 1) < state.maxHeroRank);
    for (const ch of state.campfire.choices) {
      const fresh = freshById.get(ch.id);
      if (fresh) {
        ch.title = fresh.title;
        ch.description = fresh.description;
      }
      if (ch.id === 'train') {
        ch.disabled = !!state.campfire.hasTrained || !canAnyHeroRankUp;
      } else if (ch.id === 'study') {
        ch.disabled = !!state.campfire.hasStudied || state.heroes.length === 0;
      } else if (ch.id === 'recharge') {
        ch.disabled = !!state.campfire.hasRecharged;
      } else if (ch.id === 'rest') {
        ch.disabled = !!state.campfire.hasRested;
      } else {
        ch.disabled = false;
      }
    }
  }

  function openCampfireNode(eventId = 600) {
    const startActions = Math.max(1, Number(campfireS.DefaultStartingActions ?? 2));
    const maxRankAllowed = (eventsS.maxRankUpPerChunk || []).find(x => Number(x.Chunk) === state.chunkIndex)?.MaxRank ?? 2;
    state.event = null;
    state.campfire = {
      eventId,
      remainingActions: startActions,
      maxActions: startActions,
      lifeRecoveredByRest: Number(campfireS.LifeRecoveredByRest ?? 15),
      maxRankUpAllowed: maxRankAllowed,
      hasTrained: false,
      hasStudied: false,
      hasRecharged: false,
      hasRested: false,
      choices: buildCampfireChoiceList(maxRankAllowed),
    };
    syncCampfireChoices();
    setPhase(BattleFlowState.Campfire);
    return getState();
  }

  function hydrateEventChoices(ev, rawEv) {
    const rng = getFlowSeed(`event_hydrate_${ev.id}`);
    const evId = Number(ev.id);
    const partyClasses = [...new Set(state.heroes.flatMap(h => getHeroClasses(h)))];
    const allClassIds = [...partyClasses, ...[1, 2, 3, 4, 5, 6, 7].filter(c => !partyClasses.includes(c))];
    const usedRelicsInEvent = [];
    const usedItemsInEvent = [];

    const makeSpecificRelicChoice = (rId, extraTitle = null, extraRewards = [], customText = null) => {
      const r = catalog.relics.get(Number(rId));
      const rawR = data.relics?.[rId];
      const rName = locRelicName(rId);
      const rDesc = locRelicDesc(rId);
      const text = customText
        ? interpolateTemplate(customText, { name: `[${rName}]<rare>`, relic: `[${rName}]<rare>`, relicname: `[${rName}]<rare>`, combatcount: 1 })
        : (rDesc
          ? L(`Obtenez [${rName}]<rare> : ${rDesc}`, `Gain [${rName}]<rare>: ${rDesc}`)
          : L(`Obtenez [${rName}]<rare>.`, `Gain [${rName}]<rare>.`));
      return {
        title: extraTitle || L(`Prendre ${rName}`, `Take ${rName}`),
        text,
        textVars: { name: rName, relic: rName, relicname: rName, reliccount: 3, combatcount: 1 },
        values: rawR?.descriptionVars || r?.descriptionVars || [],
        previewRelicId: Number(rId),
        cost: null,
        disabled: false,
        rewards: [{ RewardType: 'SpecificRelic', relicId: Number(rId) }, ...extraRewards],
      };
    };

    const makeSpecificItemChoice = (itId, extraTitle = null, extraRewards = [], customText = null) => {
      const it = catalog.items.get(Number(itId));
      const rawIt = data.items?.[itId];
      const itName = locItemName(itId);
      const itDesc = locItemDesc(itId);
      const text = customText
        ? interpolateTemplate(customText, { name: `[${itName}]<rare>`, item: `[${itName}]<rare>`, itemWithDesc: `${itName} (${itDesc})`, combatcount: 1 })
        : (itDesc
          ? L(`Obtenez [${itName}]<rare> : ${itDesc}`, `Gain [${itName}]<rare>: ${itDesc}`)
          : L(`Obtenez [${itName}]<rare>.`, `Gain [${itName}]<rare>.`));
      return {
        title: extraTitle || L(`Prendre ${itName}`, `Take ${itName}`),
        text,
        textVars: { name: itName, item: itName, itemWithDesc: `${itName} (${itDesc})`, itemcount: 3, combatcount: 1 },
        values: rawIt?.descriptionVars || it?.descriptionVars || [],
        previewItemId: Number(itId),
        cost: null,
        disabled: false,
        rewards: [{ RewardType: 'SpecificItem', itemId: Number(itId) }, ...extraRewards],
      };
    };

    const getClassName = (cid) => locClassName(cid);

    // 1. Event 1013 (The Guild Banner) & Event 500 (Class Relic Shrine)
    if (evId === 1013 || evId === 500) {
      return allClassIds.slice(0, 3).map((cid) => {
        const className = getClassName(cid);
        let classRelics = (catalog.classEventRelics.get(cid) || []).filter(id => !hasRelic(id));
        if (classRelics.length < 3) {
          const extra = rollDistinctRelicsFromPool(rng, 60, 3, classRelics.concat(usedRelicsInEvent));
          classRelics = classRelics.concat(extra);
        }
        const picked3 = rng.weightedDistinct(classRelics.map(id => ({ id, weight: 10 })), 3);
        picked3.forEach(id => usedRelicsInEvent.push(id));
        return {
          title: L(`Emblème : ${className}`, `${className} Design`),
          text: L(
            `Choisissez [1]<bold> parmi [3]<bold> [Reliques de Bannière ${className}]<rare>.`,
            `Choose [1]<bold> of [3]<bold> [${className} Banner Relics]<rare>.`
          ),
          textVars: { name: className, class: className, relic: className, reliccount: 3 },
          relicChoiceIds: picked3,
          previewRelicId: picked3[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [],
        };
      });
    }

    // 2. Event 506: Starter Kit (Floor 1)
    if (evId === 506) {
      const commonRelics3 = rollDistinctRelicsFromPool(rng, 101, 3, usedRelicsInEvent);
      const commonItems3 = rollDistinctItemsFromPool(rng, 3, 3, usedItemsInEvent);
      return [
        {
          title: L('Ravitaillement de Reliques', 'Relic Supply'),
          text: L(
            'Choisissez [1]<bold> parmi [3]<bold> [Reliques Communes]<common> et gagnez [5 Éclats]<shard>.',
            'Choose [1]<bold> of [3]<bold> [Common Relics]<common> and gain [5 Shards]<shard>.'
          ),
          textVars: { reliccount: 3, amount: 5, shards: 5 },
          relicChoiceIds: commonRelics3,
          previewRelicId: commonRelics3[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'Shards', Amount: 5, UpperAmount: 5 }],
        },
        {
          title: L('Ravitaillement d\'Équipement', 'Equipment Supply'),
          text: L(
            'Choisissez [1]<bold> parmi [3]<bold> [Objets Communs]<common> et gagnez [5 Éclats]<shard>.',
            'Choose [1]<bold> of [3]<bold> [Common Items]<common> and gain [5 Shards]<shard>.'
          ),
          textVars: { itemcount: 3, amount: 5, shards: 5 },
          itemChoiceIds: commonItems3,
          previewItemId: commonItems3[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'Shards', Amount: 5, UpperAmount: 5 }],
        },
        makeSpecificRelicChoice(6003, L('Bourse d\'Éclats (+12 Éclats)', 'Shard Pouch (+12 Shards)')),
      ];
    }

    // 3. Events 503, 504, 505: Three Paths (The Altar, The Fallen Beast, The Abandoned Camp)
    if (evId === 503 || evId === 504 || evId === 505) {
      const relicPoolByEvent = {
        503: [400, 402, 403, 405, 406, 409, 412, 418, 421],
        504: [401, 407, 410, 411, 413, 416, 417, 422, 423],
        505: [404, 408, 414, 415, 419, 420, 3003, 3037, 3047],
      };
      const itemPoolByEvent = { 503: 39, 504: 40, 505: 41 };
      let rCandidates = (relicPoolByEvent[evId] || []).filter(id => catalog.relics.has(id) && !hasRelic(id));
      if (rCandidates.length < 2) {
        rCandidates = rCandidates.concat(rollDistinctRelicsFromPool(rng, 102, 3, rCandidates));
      }
      const pickedRelics = rng.weightedDistinct(rCandidates.map(id => ({ id, weight: 10 })), 2);
      const pickedItem = rollDistinctItemsFromPool(rng, itemPoolByEvent[evId] || 2, 1, usedItemsInEvent)[0] ?? 201;
      return [
        makeSpecificItemChoice(pickedItem, L('Prendre l\'Objet', 'Take Item')),
        makeSpecificRelicChoice(pickedRelics[0] ?? 3001, L('Prendre la Relique', 'Take Relic')),
        makeSpecificRelicChoice(pickedRelics[1] ?? 3002),
      ];
    }

    // 4. Event 2002 (Choose a Rare Relic), Event 2003 (Random Epic Relic), Events 2005..2011 (Choose a Class Relic)
    if (evId === 2002 || evId === 2003 || (evId >= 2005 && evId <= 2011)) {
      const poolId = evId === 2003 ? 103 : (evId >= 2005 && evId <= 2011 ? (11 + (evId - 2005)) : 102);
      const picked3 = rollDistinctRelicsFromPool(rng, poolId, 3, usedRelicsInEvent);
      return picked3.map(rId => makeSpecificRelicChoice(rId));
    }

    // 5. Event 2001 (Choose an Epic Item), Event 2013 (Choose an Item), Event 2014 (Choose a Rare Item)
    if (evId === 2001 || evId === 2013 || evId === 2014) {
      const poolId = evId === 2001 ? 1 : (evId === 2014 ? 2 : 3);
      const picked3 = rollDistinctItemsFromPool(rng, poolId, 3, usedItemsInEvent);
      return picked3.map(itId => makeSpecificItemChoice(itId));
    }

    // 6. C# EventLogic-driven events 1022..1036
    if (evId === 1022) { // The Reflecting Pool
      const cId = allClassIds[0] || 1;
      const cName = getClassName(cId);
      const classItem = rollDistinctItemsFromPool(rng, 38, 1, usedItemsInEvent)[0] ?? (308 + ((cId - 1) % 7) * 2);
      const classRelic = rollDistinctRelicsFromPool(rng, 60, 1, usedRelicsInEvent)[0] ?? 3001;
      return [
        makeSpecificItemChoice(classItem, L('Prendre l\'Objet', 'Take Item'), [], L(`Obtenez un objet pour [${cName}]<bold> : {name}.`, `Get an item for [${cName}]<bold>: {name}.`)),
        makeSpecificRelicChoice(classRelic, L('Prendre la Relique', 'Take Relic'), [], L(`Obtenez une relique pour [${cName}]<bold> : {name}.`, `Get a relic for [${cName}]<bold>: {name}.`)),
      ];
    }
    if (evId === 1023) { // Express Delivery
      const sigItems = rollDistinctItemsFromPool(rng, 38, 3, usedItemsInEvent);
      return sigItems.map(itId => makeSpecificItemChoice(itId, L('Prendre l\'Objet', 'Take Item')));
    }
    if (evId === 1024) { // The Ringing Fall
      const powerCrystal = catalog.items.has(502) ? 502 : (rollDistinctItemsFromPool(rng, 112, 1, usedItemsInEvent)[0] ?? 502);
      const statCrystal = catalog.items.has(504) ? 504 : (rollDistinctItemsFromPool(rng, 110, 1, usedItemsInEvent)[0] ?? 504);
      return [
        {
          title: L('Méditer', 'Meditate'),
          text: L(
            'Choisissez un Héros de rang B ou inférieur pour le promouvoir. Vos Héros perdent [15% de stats de base]<basicstat> pendant les 2 prochains combats.',
            'Choose a B-rank or lower Hero to rank up. Your Heroes lose [15% basic stats]<basicstat> for the next 2 combats.'
          ),
          textVars: { rank: 'B', statlosspercent: 15, combatcount: 2 },
          previewRelicId: 5112,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'HeroRankUp', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5112 }],
        },
        makeSpecificItemChoice(powerCrystal, L('Examiner (Cristal de Puissance)', 'Investigate (Power Crystal)')),
        makeSpecificItemChoice(statCrystal, L('Examiner (Cristal de Protection)', 'Investigate (Protection Crystal)')),
      ];
    }
    if (evId === 1025) { // The Etched Path
      const cRelic = rollDistinctRelicsFromPool(rng, 101, 1, usedRelicsInEvent)[0] ?? 1003;
      const rRelic = rollDistinctRelicsFromPool(rng, 102, 1, usedRelicsInEvent)[0] ?? 2001;
      const rItem = rollDistinctItemsFromPool(rng, 2, 1, usedItemsInEvent)[0] ?? 201;
      const eItem = rollDistinctItemsFromPool(rng, 1, 1, usedItemsInEvent)[0] ?? 301;
      return [
        makeSpecificRelicChoice(cRelic, L('Sentier Vert', 'Green Path'), [], L('Obtenez {name} sur le Sentier Vert.', 'Get {name} along the Green Path.')),
        makeSpecificRelicChoice(rRelic, L('Sentier Bleu', 'Blue Path'), [], L('Obtenez {name} sur le Sentier Bleu.', 'Get {name} along the Blue Path.')),
        makeSpecificItemChoice(rItem, L('Sentier Violet', 'Purple Path'), [], L('Obtenez {name} sur le Sentier Violet.', 'Get {name} along the Purple Path.')),
        makeSpecificItemChoice(eItem, L('Sentier Doré', 'Golden Path'), [], L('Obtenez {name} sur le Sentier Doré.', 'Get {name} along the Golden Path.')),
      ];
    }
    if (evId === 1026) { // The Rift Puppy
      const rareItems3 = rollDistinctItemsFromPool(rng, 2, 3, usedItemsInEvent);
      const epicItems3 = rollDistinctItemsFromPool(rng, 1, 3, usedItemsInEvent);
      return [
        {
          title: L('Ignorer', 'Ignore'),
          text: L('Le Boss de l\'Acte rapportera [25 Éclats supplémentaires]<shard>.', 'The Act Boss will reward [25 more Shards]<shard>.'),
          textVars: { shardbonus: 25, shards: 25 },
          previewRelicId: 5113,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5113 }],
        },
        {
          title: L('Audacieux', 'Bold'),
          text: L(
            'Choisissez parmi 3 [objets rares]<rare>. Vos Héros subissent des dégâts égaux à [20% de leurs PV Max]<maxhp> au début du prochain combat.',
            'Choose from 3 [rare items]<rare>. Your Heroes take damage equal to [20% of their Max HP]<maxhp> at the start of the next combat.'
          ),
          textVars: { itemcount: 3, damagepercent: 20 },
          itemChoiceIds: rareItems3,
          previewItemId: rareItems3[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5115 }],
        },
        {
          title: L('Téméraire', 'Reckless'),
          text: L(
            'Choisissez parmi 3 [objets épiques]<epic>. Vos Héros subissent des dégâts égaux à [35% de leurs PV Max]<maxhp> au début du prochain combat.',
            'Choose from 3 [epic items]<epic>. Your Heroes take damage equal to [35% of their Max HP]<maxhp> at the start of the next combat.'
          ),
          textVars: { itemcount: 3, damagepercent: 35 },
          itemChoiceIds: epicItems3,
          previewItemId: epicItems3[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5127 }],
        },
      ];
    }
    if (evId === 1027) { // Three Paths
      const crystalItem = rollDistinctItemsFromPool(rng, 112, 1, usedItemsInEvent)[0] ?? 502;
      const epicRelics3 = rollDistinctRelicsFromPool(rng, 103, 3, usedRelicsInEvent);
      return [
        makeSpecificItemChoice(crystalItem, L('Prairie', 'Meadow')),
        {
          title: L('Gouffre', 'Chasm'),
          text: L(
            'Gagnez [10 Éclats de plus]<shard> par victoire lors des 2 prochains combats, mais vos Héros perdent [15% de stats de base]<basicstat> pendant ces combats.',
            'Gain [10 more Shards]<shard> per combat victory for the next 2 combats, but your Heroes lose [15% basic stats]<basicstat> for these combats.'
          ),
          textVars: { shardbonus: 10, shards: 10, combatcount: 2, statlosspercent: 15 },
          previewRelicId: 5116,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5116 }, { RewardType: 'Shards', Amount: 10, UpperAmount: 10 }],
        },
        {
          title: L('Forêt', 'Forest'),
          text: L(
            'Choisissez parmi 3 [reliques épiques]<epic>. Vos Héros perdent [20% de stats de base]<basicstat> lors du prochain combat.',
            'Choose from 3 [epic relics]<epic>. Heroes lose [20% basic stats]<basicstat> for the next combat.'
          ),
          textVars: { reliccount: 3, statlosspercent: 20 },
          relicChoiceIds: epicRelics3,
          previewRelicId: epicRelics3[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5117 }],
        },
      ];
    }
    if (evId === 1028) { // The Fairy Ring
      const safeItem = rollDistinctItemsFromPool(rng, 3, 1, usedItemsInEvent)[0] ?? 101;
      const epicItem = rollDistinctItemsFromPool(rng, 1, 1, usedItemsInEvent)[0] ?? 301;
      const epicRelic = rollDistinctRelicsFromPool(rng, 103, 1, usedRelicsInEvent)[0] ?? 3001;
      return [
        makeSpecificItemChoice(safeItem, L('Prudent', 'Safe')),
        makeSpecificItemChoice(
          epicItem,
          L('Chercher un Objet', 'Seek Item'),
          [{ RewardType: 'SpecificRelic', relicId: 5118 }],
          L(
            'Obtenez {name}. Vos Héros commencent le prochain combat avec du [Poison]<poison> égal à [20% de leurs PV Max]<maxhp>.',
            'Gain {name}. Heroes start the next combat with [Poison]<poison> equal to [20% of their Max HP]<maxhp>.'
          )
        ),
        makeSpecificRelicChoice(
          epicRelic,
          L('Chercher une Relique', 'Seek Relic'),
          [{ RewardType: 'SpecificRelic', relicId: 5119 }],
          L(
            'Obtenez {name}. Vous ne gagnez aucun [Éclat]<shard> lors de votre prochaine victoire.',
            'Gain {name}. Earn no [Shards]<shard> for your next combat victory.'
          )
        ),
      ];
    }
    if (evId === 1029) { // The Well of Temptations
      const rareRelic = rollDistinctRelicsFromPool(rng, 102, 1, usedRelicsInEvent)[0] ?? 2001;
      const statPool = catalog.poolEntries(catalog.statModPools, 1, catalog.statMods);
      const smId = statPool.length ? (rng.weighted(statPool) ?? statPool[0].id) : 1;
      const sm = catalog.statMods.get(Number(smId)) || { id: 1, stat: 'Attack', value: 15 };
      const statLabel = locStatName(sm.stat);
      return [
        {
          title: L('Boire', 'Drink'),
          text: L(
            `Octroie +[${sm.value} ${statLabel}]<pos> à un Héros et gagnez [10 Éclats]<shard>.`,
            `Grant a Hero +[${sm.value} ${sm.stat}]<pos> and gain [10 Shards]<shard>.`
          ),
          textVars: { stat: statLabel, statbonus: sm.value, amount: 10, shards: 10 },
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificStatMod', statModId: sm.id }, { RewardType: 'Shards', Amount: 10, UpperAmount: 10 }],
        },
        makeSpecificRelicChoice(
          rareRelic,
          L('Boire Encore', 'Drink More'),
          [{ RewardType: 'SpecificRelic', relicId: 5125 }],
          L(
            'Obtenez {name}, mais gagnez [5 Éclats de moins]<shard> lors de votre prochaine victoire.',
            'Gain {name}, but earn [5 fewer Shards]<shard> on your next combat victory.'
          )
        ),
        {
          title: L('Partir', 'Leave'),
          text: L('S\'éloigner du puits.', 'Walk away from the well.'),
          textVars: {},
          cost: null,
          disabled: false,
          rewards: [],
        },
      ];
    }
    if (evId === 1030) { // The Debtor
      const cRelics = rollDistinctRelicsFromPool(rng, 101, 3, usedRelicsInEvent);
      const rRelics = rollDistinctRelicsFromPool(rng, 102, 3, usedRelicsInEvent);
      const eRelics = rollDistinctRelicsFromPool(rng, 103, 3, usedRelicsInEvent);
      return [
        {
          title: L('Première Dette', 'First Debt'),
          text: L(
            'Choisissez parmi 3 [reliques communes]<common>. Gagnez [5 Éclats de moins]<shard> lors de votre prochaine victoire.',
            'Choose from 3 [common relics]<common>. Earn [5 fewer Shards]<shard> for your next combat victory.'
          ),
          textVars: { reliccount: 3, shards: 5 },
          relicChoiceIds: cRelics,
          previewRelicId: cRelics[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5121 }],
        },
        {
          title: L('Deuxième Dette', 'Second Debt'),
          text: L(
            'Choisissez parmi 3 [reliques rares]<rare>. Gagnez [15 Éclats de moins]<shard> lors de votre prochaine victoire.',
            'Choose from 3 [rare relics]<rare>. Earn [15 fewer Shards]<shard> for your next combat victory.'
          ),
          textVars: { reliccount: 3, shards: 15 },
          relicChoiceIds: rRelics,
          previewRelicId: rRelics[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5122 }],
        },
        {
          title: L('Dette Finale', 'Final Debt'),
          text: L(
            'Choisissez parmi 3 [reliques épiques]<epic>. Gagnez [15 Éclats de moins]<shard> à la prochaine victoire et vos Héros subissent [15% de leurs PV Max]<maxhp> en dégâts au début de chaque combat.',
            'Choose from 3 [epic relics]<epic>. Earn [15 fewer Shards]<shard> next victory and Heroes take [15% Max HP]<maxhp> damage at the start of every combat.'
          ),
          textVars: { reliccount: 3, shards: 15, damagepercent: 15 },
          relicChoiceIds: eRelics,
          previewRelicId: eRelics[0] ?? null,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'SpecificRelic', relicId: 5122 }, { RewardType: 'SpecificRelic', relicId: 798 }],
        },
        {
          title: L('S\'en aller', 'Walk Away'),
          text: L('Refuser l\'offre.', 'Decline the offer.'),
          textVars: {},
          cost: null,
          disabled: false,
          rewards: [],
        },
      ];
    }
    if (evId === 1031) { // The Three Urns
      const urnRelic = rollDistinctRelicsFromPool(rng, 102, 1, usedRelicsInEvent)[0] ?? 2001;
      const urnItem = rollDistinctItemsFromPool(rng, 2, 1, usedItemsInEvent)[0] ?? 201;
      return [
        makeSpecificRelicChoice(urnRelic, L('Urne de Gauche', 'Left Urn'), [], L('Ouvrir l\'urne de gauche pour obtenir {name}.', 'Open the left urn to claim {name}.')),
        {
          title: L('Urne du Milieu', 'Center Urn'),
          text: L('Ouvrir l\'urne du milieu pour obtenir [15 Éclats]<shard>.', 'Open the center urn to claim [15 Shards]<shard>.'),
          textVars: { shards: 15, amount: 15 },
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'Shards', Amount: 15, UpperAmount: 15 }],
        },
        makeSpecificItemChoice(urnItem, L('Urne de Droite', 'Right Urn'), [], L('Ouvrir l\'urne de droite pour obtenir {name}.', 'Open the right urn to claim {name}.')),
      ];
    }
    if (evId === 1032) { // Trial: Single Combat
      const epicItem = rollDistinctItemsFromPool(rng, 1, 1, usedItemsInEvent)[0] ?? 301;
      const rareRelic = rollDistinctRelicsFromPool(rng, 102, 1, usedRelicsInEvent)[0] ?? 2001;
      return [
        {
          title: L('Éclats', 'Shards'),
          text: L('Vaincre la créature en duel 1c1 pour gagner [20 Éclats]<shard>.', 'Defeat the creature in 1v1 combat to gain [20 Shards]<shard>.'),
          textVars: { shards: 20, amount: 20 },
          previewRelicId: 5500,
          cost: null,
          disabled: false,
          rewards: [
            { RewardType: 'QueueEventFight', group: '1v1Fight', Amount: 1 },
            { RewardType: 'SpecificRelic', relicId: 5500 },
            { RewardType: 'Shards', Amount: 20, UpperAmount: 20 },
          ],
        },
        makeSpecificItemChoice(
          epicItem,
          L('Objet', 'Item'),
          [{ RewardType: 'QueueEventFight', group: '1v1Fight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5502 }],
          L('Vaincre la créature en duel 1c1 pour obtenir {name}.', 'Defeat the creature in 1v1 combat to gain {name}.')
        ),
        makeSpecificRelicChoice(
          rareRelic,
          L('Relique', 'Relic'),
          [{ RewardType: 'QueueEventFight', group: '1v1Fight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5501 }],
          L('Vaincre la créature en duel 1c1 pour obtenir {name}.', 'Defeat the creature in 1v1 combat to gain {name}.')
        ),
      ];
    }
    if (evId === 1033) { // Trial: Endurance
      return [
        {
          title: '30s',
          text: L('Survivre pendant 30 secondes pour gagner [10 Éclats]<shard>.', 'Survive for 30 seconds to gain [10 Shards]<shard>.'),
          textVars: { survivetime: 30, shards: 10, amount: 10 },
          previewRelicId: 5503,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'QueueEventFight', group: 'SurvivalFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5503 }, { RewardType: 'Shards', Amount: 10, UpperAmount: 10 }],
        },
        {
          title: '40s',
          text: L('Survivre pendant 40 secondes pour gagner [20 Éclats]<shard>.', 'Survive for 40 seconds to gain [20 Shards]<shard>.'),
          textVars: { survivetime: 40, shards: 20, amount: 20 },
          previewRelicId: 5504,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'QueueEventFight', group: 'SurvivalFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5504 }, { RewardType: 'Shards', Amount: 20, UpperAmount: 20 }],
        },
        {
          title: '50s',
          text: L('Survivre pendant 50 secondes pour gagner [30 Éclats]<shard>.', 'Survive for 50 seconds to gain [30 Shards]<shard>.'),
          textVars: { survivetime: 50, shards: 30, amount: 30 },
          previewRelicId: 5505,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'QueueEventFight', group: 'SurvivalFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5505 }, { RewardType: 'Shards', Amount: 30, UpperAmount: 30 }],
        },
      ];
    }
    if (evId === 1034) { // Trial: Demolition
      return [
        {
          title: L('Combattre', 'Fight'),
          text: L('Vaincre la créature pour gagner [10 Éclats]<shard>.', 'Defeat the creature to gain [10 Shards]<shard>.'),
          textVars: { shards: 10, amount: 10 },
          previewRelicId: 5506,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'QueueEventFight', group: 'DealDamageFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5506 }, { RewardType: 'Shards', Amount: 10, UpperAmount: 10 }],
        },
        {
          title: L('Combat Difficile', 'Fight Tougher'),
          text: L('Vaincre la créature avec [+100% de PV Max]<maxhp> pour gagner [20 Éclats]<shard>.', 'Defeat the creature with [+100% Max HP]<maxhp> to gain [20 Shards]<shard>.'),
          textVars: { maxhpbonus: 100, shards: 20, amount: 20 },
          previewRelicId: 5507,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'QueueEventFight', group: 'DealDamageFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5507 }, { RewardType: 'Shards', Amount: 20, UpperAmount: 20 }],
        },
        {
          title: L('Combat Extrême', 'Fight Toughest'),
          text: L('Vaincre la créature avec [+200% de PV Max]<maxhp> pour gagner [30 Éclats]<shard>.', 'Defeat the creature with [+200% Max HP]<maxhp> to gain [30 Shards]<shard>.'),
          textVars: { maxhpbonus: 200, shards: 30, amount: 30 },
          previewRelicId: 5508,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'QueueEventFight', group: 'DealDamageFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5508 }, { RewardType: 'Shards', Amount: 30, UpperAmount: 30 }],
        },
      ];
    }
    if (evId === 1035) { // Trial: Rematch
      const epicRelics = rollDistinctRelicsFromPool(rng, 103, 3, usedRelicsInEvent);
      return [
        makeSpecificRelicChoice(
          epicRelics[0] ?? 3001,
          L('Seul', 'Alone'),
          [{ RewardType: 'QueueEventFight', group: 'HydraFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5509 }],
          L(
            'Vaincre le Boss de la Faille en 1c1 pour obtenir {name}. Le Héros a [20% de stats de base en moins]<basicstat> pour ce combat.',
            'Defeat the Rift Boss in 1v1 combat to gain {name}. The Hero has [20% reduced basic stats]<basicstat> for this combat.'
          )
        ),
        makeSpecificRelicChoice(
          epicRelics[1] ?? 3002,
          L('Pressé', 'Rushed'),
          [{ RewardType: 'QueueEventFight', group: 'HydraFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5510 }],
          L('Vaincre le Boss de la Faille en moins de 25 secondes pour obtenir {name}.', 'Defeat the Rift Boss within 25 seconds to gain {name}.')
        ),
        makeSpecificRelicChoice(
          epicRelics[2] ?? 3003,
          L('Effrayé', 'Scared'),
          [{ RewardType: 'QueueEventFight', group: 'HydraFight', Amount: 1 }, { RewardType: 'SpecificRelic', relicId: 5511 }],
          L(
            'Vaincre le Boss de la Faille pour obtenir {name}. Vos Héros ont [20% de stats de base en moins]<basicstat> pour ce combat.',
            'Defeat the Rift Boss to gain {name}. Your Heroes have [20% reduced basic stats]<basicstat> for this combat.'
          )
        ),
      ];
    }
    if (evId === 1036) { // Rest
      const healAmt = Number(campfireS.LifeRecoveredByRest ?? 15);
      return [
        {
          title: L('Se reposer', 'Rest'),
          text: L(
            `Les Héros gagnent [+20% de stats de base]<basicstat> au prochain combat et récupèrent +[${healAmt}]<pos> Éclats de Stabilisateur.`,
            `Heroes gain [+20% basic stats]<basicstat> next combat and recover +[${healAmt}]<pos> Stabilizer Shards.`
          ),
          textVars: { statbonus: 20, amount: 20 },
          previewRelicId: RESTED_RELIC_ID,
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'ActivateEnemyRelic', entryId: 83, specificRelicId: RESTED_RELIC_ID }, { RewardType: 'RestoreLife', Amount: 1 }],
        },
      ];
    }

    const rawChoices = cloneJson(ev.choices || []);
    if (rawChoices.length === 0) {
      const cRelic = rollDistinctRelicsFromPool(rng, 101, 1, usedRelicsInEvent)[0] ?? 3001;
      const rRelics3 = rollDistinctRelicsFromPool(rng, 102, 3, usedRelicsInEvent);
      const rItem = rollDistinctItemsFromPool(rng, 2, 1, usedItemsInEvent)[0] ?? 201;
      return [
        makeSpecificRelicChoice(cRelic),
        {
          title: L('Fouiller plus profondément', 'Search Deeper'),
          text: L(
            'Choisissez [1]<bold> parmi [3]<bold> [Reliques Rares]<rare>, mais les ennemis sont renforcés au prochain combat.',
            'Choose [1]<bold> of [3]<bold> [Rare Relics]<rare>, but enemies are empowered next combat.'
          ),
          textVars: { reliccount: 3 },
          relicChoiceIds: rRelics3,
          previewRelicId: rRelics3[0],
          cost: null,
          disabled: false,
          rewards: [{ RewardType: 'ActivateEnemyRelic', entryId: 70, Amount: 1 }],
        },
        makeSpecificItemChoice(rItem),
      ];
    }

    // 7. Standard Events with choices in game_data.json / catalog.js: resolve all placeholders & attach Relic/Item previews/pickers
    return rawChoices.map((ch, idx) => {
      const rewards = Array.isArray(ch.rewards) ? ch.rewards.slice() : [];
      const rawCh = rawEv?.choices?.[idx] || ch;
      const rawTitle = txt(rawCh?.titleKey || ch.titleKey || rawCh?.title || ch.title || '');
      const rawText = txt(rawCh?.textKey || ch.textKey || rawCh?.text || ch.text || '');

      let previewRelicId = null;
      let previewItemId = null;
      let previewHeroId = null;
      let previewHeroRank = 1;
      let relicChoiceIds = null;
      let itemChoiceIds = null;
      let statModObj = null;
      let statModAllHeroes = false;
      let shardDelta = null;
      let enemyRelicName = null;

      const updatedRewards = [];
      for (const rw of rewards) {
        if (rw.RewardType === 'SpecificRelic') {
          const rId = Number(rw.relicId ?? rw.entryId ?? 3001);
          if (!previewRelicId) previewRelicId = rId;
          usedRelicsInEvent.push(rId);
          updatedRewards.push({ RewardType: 'SpecificRelic', relicId: rId });
        } else if (rw.RewardType === 'SpecificItem') {
          const itId = Number(rw.itemId ?? rw.entryId ?? 101);
          if (!previewItemId) previewItemId = itId;
          usedItemsInEvent.push(itId);
          updatedRewards.push({ RewardType: 'SpecificItem', itemId: itId });
        } else if (rw.RewardType === 'RelicFromPool') {
          const poolId = Number(rw.entryId ?? 101);
          const count = Math.max(1, Number(rw.Amount ?? 1));
          const wantsChoice = /choose|choisissez|\{reliccount\}/i.test(rawText) || count > 1 || /choose|choisissez/i.test(locEventName(ev) || ev.name || '');
          if (wantsChoice) {
            const rolled = rollDistinctRelicsFromPool(rng, poolId, 3, usedRelicsInEvent);
            relicChoiceIds = rolled;
            previewRelicId = rolled[0] ?? null;
          } else {
            const rolled = rollDistinctRelicsFromPool(rng, poolId, 1, usedRelicsInEvent);
            const rId = rolled[0] ?? 3001;
            previewRelicId = rId;
            updatedRewards.push({ RewardType: 'SpecificRelic', relicId: rId });
          }
        } else if (rw.RewardType === 'ClassEvent') {
          const targetClass = allClassIds[idx % allClassIds.length] || 1;
          let classRelics = (catalog.classEventRelics.get(targetClass) || []).filter(id => !hasRelic(id) && !usedRelicsInEvent.includes(id));
          if (!classRelics.length) {
            classRelics = rollDistinctRelicsFromPool(rng, 60, 1, usedRelicsInEvent);
          }
          const rId = rng.pick(classRelics) ?? 3001;
          usedRelicsInEvent.push(rId);
          previewRelicId = rId;
          updatedRewards.push({ RewardType: 'SpecificRelic', relicId: rId });
        } else if (rw.RewardType === 'ItemsFromPool') {
          const poolId = Number(rw.entryId ?? 3);
          const count = Math.max(1, Number(rw.Amount ?? 1));
          const wantsChoice = /choose|choisissez|\{itemcount\}/i.test(rawText) || (evId === 780 && idx === 0);
          if (wantsChoice) {
            const rolled = rollDistinctItemsFromPool(rng, poolId, 3, usedItemsInEvent);
            itemChoiceIds = rolled;
            previewItemId = rolled[0] ?? null;
          } else {
            const rolled = rollDistinctItemsFromPool(rng, poolId, count, usedItemsInEvent);
            previewItemId = rolled[0] ?? 101;
            for (const itId of rolled) {
              updatedRewards.push({ RewardType: 'SpecificItem', itemId: itId });
            }
          }
        } else if (rw.RewardType === 'GrantStatsToHero') {
          const poolId = Number(rw.entryId ?? 1);
          const pool = catalog.poolEntries(catalog.statModPools, poolId, catalog.statMods);
          const smId = pool.length ? (rng.weighted(pool) ?? pool[0].id) : poolId;
          statModObj = catalog.statMods.get(Number(smId)) || { id: smId, stat: 'Attack', value: 15, isPercent: false };
          statModAllHeroes = !!rw.allHeroes || evId === 823 || evId === 824 || /every hero|all heroes|chaque héros|tous les héros/i.test(ev.crossroadsDescription || '');
          updatedRewards.push({ RewardType: 'SpecificStatMod', statModId: statModObj.id, allHeroes: statModAllHeroes });
        } else if (rw.RewardType === 'Shards') {
          const lo = Number(rw.Amount ?? 10);
          const hi = Number(rw.UpperAmount ?? lo);
          shardDelta = rng.rangeInclusive(lo, hi);
          updatedRewards.push({ RewardType: 'Shards', Amount: shardDelta, UpperAmount: shardDelta });
        } else if (rw.RewardType === 'ActivateEnemyRelic') {
          const poolId = Number(rw.entryId ?? 70);
          const pool = catalog.poolEntries(catalog.relicPools, poolId, catalog.relics);
          const erId = rng.weighted(pool) ?? (poolId === 83 ? RESTED_RELIC_ID : 5000);
          enemyRelicName = locRelicName(erId);
          if (poolId === 83 && !previewRelicId) previewRelicId = erId;
          updatedRewards.push({ RewardType: 'ActivateEnemyRelic', entryId: poolId, specificRelicId: erId });
        } else if (rw.RewardType === 'RandomHeroOfClass' || rw.RewardType === 'HeroesFromPool') {
          const poolId = Number(rw.entryId ?? 1);
          const heroRank = clamp(Number(rw.HeroRank ?? 1), 1, state.maxHeroRank);
          const pool = catalog.poolEntries(catalog.heroPools, poolId, catalog.heroes);
          const hId = rng.weighted(pool) ?? 1;
          previewHeroId = hId;
          previewHeroRank = heroRank;
          updatedRewards.push({ RewardType: 'SpecificHero', heroId: hId, HeroRank: heroRank });
        } else {
          updatedRewards.push(rw);
        }
      }

      // Special event choice fixes where game_data.json omitted secondary rewards:
      // Event 1006 Choice 2 ("Get a rare item" in addition to retraining)
      if (evId === 1006 && idx === 2 && !previewItemId) {
        const rIt = rollDistinctItemsFromPool(rng, 2, 1, usedItemsInEvent)[0] ?? 201;
        previewItemId = rIt;
        updatedRewards.push({ RewardType: 'SpecificItem', itemId: rIt });
      }
      // Event 1018 Choice 0 ("Choose from {reliccount} common relics")
      if (evId === 1018 && idx === 0 && !relicChoiceIds) {
        const cRels = rollDistinctRelicsFromPool(rng, 101, 3, usedRelicsInEvent);
        relicChoiceIds = cRels;
        previewRelicId = cRels[0] ?? null;
      }
      // Event 1019 Choice 1 ("Choose 1 of {reliccount} relics which each increase a stat")
      if (evId === 1019 && idx === 1 && !relicChoiceIds) {
        const statBoostRelics = [736, 737, 738, 739, 740, 741, 742].filter(id => catalog.relics.has(id) && !hasRelic(id));
        const pickedStatRelics = rng.weightedDistinct(statBoostRelics.map(id => ({ id, weight: 10 })), 3);
        relicChoiceIds = pickedStatRelics.length ? pickedStatRelics : rollDistinctRelicsFromPool(rng, 101, 3, usedRelicsInEvent);
        previewRelicId = relicChoiceIds[0] ?? null;
      }

      // If choice text mentions {name} or {relic} and no Relic/Item was rolled yet, roll one so {name} is real
      if (!previewRelicId && !previewItemId && /\{(name|relic)\}/i.test(rawTitle + ' ' + rawText)) {
        const fallbackRelic = rollDistinctRelicsFromPool(rng, 101, 1, usedRelicsInEvent)[0] ?? 3001;
        previewRelicId = fallbackRelic;
        updatedRewards.push({ RewardType: 'SpecificRelic', relicId: fallbackRelic });
      }

      const rObj = previewRelicId ? catalog.relics.get(previewRelicId) : null;
      const rawR = previewRelicId ? data.relics?.[previewRelicId] : null;
      const itObj = previewItemId ? catalog.items.get(previewItemId) : null;
      const rawIt = previewItemId ? data.items?.[previewItemId] : null;

      const rName = previewRelicId ? locRelicName(previewRelicId) : L('Relique', 'Relic');
      const rDesc = previewRelicId ? locRelicDesc(previewRelicId) : '';
      const itName = previewItemId ? locItemName(previewItemId) : L('Objet', 'Item');
      const itDesc = previewItemId ? locItemDesc(previewItemId) : '';
      const hName = previewHeroId ? locHeroName(previewHeroId) : (state.heroes[0] ? locHeroName(state.heroes[0].heroId) : L('Héros', 'Hero'));
      const statLabel = statModObj ? locStatName(statModObj.stat) : locStatName('Attack');

      const textVars = {
        reliccount: relicChoiceIds ? relicChoiceIds.length : 3,
        itemcount: itemChoiceIds ? itemChoiceIds.length : 3,
        combatcount: 2,
        stuncombatcount: 2,
        amount: shardDelta != null ? Math.abs(shardDelta) : (statModObj ? statModObj.value : 15),
        shards: shardDelta != null ? Math.abs(shardDelta) : 15,
        shardbonus: 15,
        stat: statLabel,
        statbonus: statModObj ? statModObj.value : 15,
        statlosspercent: 15,
        statreduction: 15,
        maxhpbonus: 250,
        burnpercent: 20,
        poisonpercent: 20,
        defensepenalty: 20,
        damagepercent: 20,
        time: 10,
        stuntime: 3,
        stunduration: 3,
        timelimit: 25,
        survivetime: 20,
        goodchance: 50,
        badchance: 50,
        rank: ['C', 'B', 'A', 'S'][clamp((previewHeroRank || 2) - 1, 0, 3)] || 'B',
        class: getClassName(allClassIds[idx % allClassIds.length] || 1),
        hero: hName,
        bossname: L('Boss de la Faille', 'Rift Boss'),
        name: previewRelicId ? rName : (previewItemId ? itName : (previewHeroId ? hName : getClassName(allClassIds[idx % allClassIds.length] || 1))),
        relic: rName,
        relicname: enemyRelicName || rName,
        item: itName,
        itemWithDesc: itDesc ? `${itName} (${itDesc})` : itName,
        ...(ch.textVars || {}),
      };

      // Handle events 780, 800..915, 1016 where ch.title / ch.text is null in game_data.json
      let finalTitle = rawTitle;
      let finalText = rawText;
      if (!finalTitle && !finalText) {
        if (itemChoiceIds && itemChoiceIds.length > 0) {
          finalTitle = L('Choisir un Équipement', 'Choose Equipment');
          finalText = L(
            `Choisissez [1]<bold> parmi [${itemChoiceIds.length}]<bold> [Objets]<epic>.`,
            `Choose [1]<bold> of [${itemChoiceIds.length}]<bold> [Items]<epic>.`
          );
        } else if (relicChoiceIds && relicChoiceIds.length > 0) {
          finalTitle = L('Choisir une Relique', 'Choose a Relic');
          finalText = L(
            `Choisissez [1]<bold> parmi [${relicChoiceIds.length}]<bold> [Reliques]<rare>.`,
            `Choose [1]<bold> of [${relicChoiceIds.length}]<bold> [Relics]<rare>.`
          );
        } else if (previewItemId) {
          const count = updatedRewards.filter(r => r.RewardType === 'SpecificItem').length;
          finalTitle = count > 1
            ? L(`Prendre ${count} Objets`, `Take ${count} Items`)
            : L(`Prendre ${itName}`, `Take ${itName}`);
          finalText = count > 1
            ? L(`Obtenez [${count} Objets]<rare> dont [${itName}]<rare>.`, `Gain [${count} Items]<rare> including [${itName}]<rare>.`)
            : (itDesc
              ? L(`Obtenez [${itName}]<rare> : ${itDesc}`, `Gain [${itName}]<rare>: ${itDesc}`)
              : L(`Obtenez [${itName}]<rare>.`, `Gain [${itName}]<rare>.`));
        } else if (previewRelicId) {
          finalTitle = L(`Prendre ${rName}`, `Take ${rName}`);
          finalText = rDesc
            ? L(`Obtenez [${rName}]<rare> : ${rDesc}`, `Gain [${rName}]<rare>: ${rDesc}`)
            : L(`Obtenez [${rName}]<rare>.`, `Gain [${rName}]<rare>.`);
        } else if (statModObj) {
          finalTitle = L(`Entraîner ${statLabel}`, `Train ${statModObj.stat}`);
          finalText = statModAllHeroes
            ? L(
              `Chaque Héros gagne +[${statModObj.value}${statModObj.isPercent ? '%' : ''}]<pos> ${statLabel}.`,
              `Every Hero gains +[${statModObj.value}${statModObj.isPercent ? '%' : ''}]<pos> ${statModObj.stat}.`
            )
            : L(
              `Octroie +[${statModObj.value}${statModObj.isPercent ? '%' : ''}]<pos> ${statLabel} à un Héros.`,
              `Grant a Hero +[${statModObj.value}${statModObj.isPercent ? '%' : ''}]<pos> ${statModObj.stat}.`
            );
        } else if (previewHeroId) {
          const rankLetter = ['C', 'B', 'A', 'S'][clamp(previewHeroRank - 1, 0, 3)] || 'C';
          finalTitle = L(`Recruter ${hName}`, `Recruit ${hName}`);
          finalText = L(
            `Recrutez [${hName}]<bold> (Rang ${rankLetter}) dans votre guilde.`,
            `Recruit [${hName}]<bold> (Rank ${rankLetter}) to your guild.`
          );
        } else if (shardDelta != null && shardDelta > 0) {
          finalTitle = L(`Prendre ${shardDelta} Éclats`, `Take ${shardDelta} Shards`);
          finalText = L(`Gagnez [${shardDelta} Éclats]<shard>.`, `Gain [${shardDelta} Shards]<shard>.`);
        } else if (updatedRewards.some(r => r.RewardType === 'HeroRankUp')) {
          finalTitle = L('Promouvoir un Héros', 'Rank Up a Hero');
          finalText = L('Promouvoir un Héros au rang supérieur.', 'Promote a Hero to the next Rank.');
        } else if (updatedRewards.some(r => r.RewardType === 'ReRollRankModifier')) {
          finalTitle = L('Réentraîner un Héros', 'Retrain a Hero');
          finalText = L('Réapprendre la spécialisation ou le bonus de rang d\'un Héros.', 'Retrain a Hero\'s specialization or rank bonus.');
        } else if (updatedRewards.some(r => r.RewardType === 'RestoreLife')) {
          const healAmt = Number(campfireS.LifeRecoveredByRest ?? 15);
          finalTitle = L('Restaurer le Stabilisateur', 'Restore Stabilizer');
          finalText = L(`Restaure +[${healAmt}]<pos> Éclats de Stabilisateur.`, `Restore +[${healAmt}]<pos> Stabilizer Shards.`);
        } else if (updatedRewards.length === 0) {
          finalTitle = L('Partir', 'Leave');
          finalText = L('Partir sans prendre de récompense.', 'Leave without taking the reward.');
        } else {
          finalTitle = locEventName(ev) || `Option ${idx + 1}`;
          finalText = locEventCrossroadsDesc(ev) || L('Réclamer cette récompense de la Faille.', 'Claim this Rift reward.');
        }
      }

      const explicitCost = ch.cost != null ? Number(ch.cost) : (shardDelta != null && shardDelta < 0 && rawChoices.length > 1 ? Math.abs(shardDelta) : null);
      const isDisabled = explicitCost != null && explicitCost > 0 && state.shards < explicitCost;

      const resolvedTitle = interpolateTemplate(finalTitle || `Option ${idx + 1}`, textVars);
      const resolvedText = interpolateTemplate(finalText || resolvedTitle, textVars);

      return {
        ...ch,
        title: resolvedTitle,
        text: resolvedText,
        textVars,
        previewRelicId,
        previewItemId,
        previewHeroId,
        relicChoiceIds,
        itemChoiceIds,
        cost: explicitCost,
        disabled: isDisabled,
        values: (previewRelicId && !relicChoiceIds)
          ? (rawR?.descriptionVars || rObj?.descriptionVars || [])
          : (previewItemId && !itemChoiceIds)
            ? (rawIt?.descriptionVars || itObj?.descriptionVars || [])
            : [],
        rewards: updatedRewards,
      };
    });
  }

  function openEventNode(eventId) {
    const numId = Number(eventId);
    if (numId === 600 || numId === 601) {
      return openCampfireNode(numId);
    }
    const ev = catalog.events.get(numId);
    if (!ev) {
      return advanceToNextFloor();
    }
    if (!state.usedEvents.includes(ev.id)) state.usedEvents.push(ev.id);
    const rawEv = data.events?.[ev.id];
    const rngCounterBeforeHydrate = state.rngCounter;
    const hydratedChoices = hydrateEventChoices(ev, rawEv);
    const evVars = buildCrossroadsVarsForEvent(ev);
    const firstChoiceVars = hydratedChoices[0]?.textVars || {};
    const mergedEvVars = { ...evVars, ...firstChoiceVars };
    const evName = locEventName(ev);
    const evTextRaw = locEventText(ev) || locEventCrossroadsDesc(ev) || evName;
    const evCrossroadsRaw = locEventCrossroadsDesc(ev) || evTextRaw;
    const resolvedEvText = interpolateTemplate(evTextRaw, mergedEvVars);
    const resolvedCrossroadsDesc = interpolateTemplate(evCrossroadsRaw, mergedEvVars);
    state.campfire = null;
    state.event = {
      id: ev.id,
      eventId: ev.id,
      name: evName,
      nameKey: ev.nameKey || rawEv?.nameKey || null,
      title: evName,
      text: resolvedEvText,
      textKey: ev.textKey || rawEv?.textKey || null,
      crossroadsDescription: resolvedCrossroadsDesc,
      textVars: mergedEvVars,
      image: ev.image,
      icon: ev.icon,
      choices: hydratedChoices,
      _rngCounterBeforeHydrate: rngCounterBeforeHydrate,
    };
    setPhase(BattleFlowState.Event);
    return getState();
  }

  function advanceToNextFloor() {
    state.event = null;
    state.campfire = null;
    state.crossroads = [];

    // Check if an EventFight was queued by an event choice
    if (state.queuedEventFight != null) {
      const fightStage = catalog.stages.get(Number(state.queuedEventFight));
      state.queuedEventFight = null;
      if (fightStage) {
        state.returnFloorAfterEventFight = state.floorIndex;
        state.stageId = fightStage.id;
        state.stage = cloneJson(data.stages?.[fightStage.id] || fightStage);
        state.enemies = cloneJson(fightStage.enemies || []);
        setPhase(BattleFlowState.Intro);
        return getState();
      }
    }

    if (state.endlessFloorIndex >= 0) {
      state.endlessFloorIndex += 1;
      state.floor += 1;
      loadCurrentFloorStage();
      // Endless mode skips Intro per RunSessionService.StartIntro
      setPhase(BattleFlowState.Placement);
      return getState();
    }

    if (state.floorIndex + 1 < state.actPlan.length) {
      state.floorIndex += 1;
      loadCurrentFloorStage();
      setPhase(BattleFlowState.Intro);
      return getState();
    }

    // All floors in Act completed
    if (state.allowEndless) {
      state.endlessFloorIndex = 0;
      state.floor += 1;
      loadCurrentFloorStage();
      setPhase(BattleFlowState.Placement);
      return getState();
    }

    state.won = true;
    state.outcome = 'victory';
    setPhase(BattleFlowState.Outro);
    return getState();
  }

  // ---------------------------------------------------------------------------
  // Initialize Run
  // ---------------------------------------------------------------------------
  buildActPlan();
  loadCurrentFloorStage();
  rollInitialSelection();

  // ---------------------------------------------------------------------------
  // Public API Methods
  // ---------------------------------------------------------------------------
  function refreshLocale() {
    lastLocaleLang = typeof getLang === 'function' ? getLang() : 'fr';
    if (state.campfire) {
      syncCampfireChoices();
    }
    if (Array.isArray(state.crossroads) && state.crossroads.length > 0) {
      for (const ch of state.crossroads) {
        const pType = String(ch.pathType || ch.type || 'Stage');
        if (pType === 'Stage') {
          const fl = ch.floor ?? (state.actPlan[state.floorIndex + 1]?.floor || (state.floor + 1));
          ch.title = L(`Combat Standard (Étage ${fl})`, `Regular Encounter (Floor ${fl})`);
          ch.description = L(
            'Avancez directement au prochain combat de la Faille sans modificateur.',
            'Proceed directly to the next Rift battle without modifiers.'
          );
        } else if (pType === 'StageModifier') {
          const isEpicReward = ch.rewardRarity === 'Epic';
          const rewardTag = isEpicReward ? 'epic' : 'rare';
          const rewardRarityFr = isEpicReward ? 'Reliques Épiques' : 'Reliques Rares';
          const enemyDesc = ch.enemyRelicId
            ? (locRelicDesc(ch.enemyRelicId) || L('Les ennemis gagnent un bonus de puissance de combat.', 'Enemies gain bonus combat power.'))
            : L('Les ennemis gagnent un bonus de puissance de combat.', 'Enemies gain bonus combat power.');
          ch.title = L('Combat de Défi', 'Challenge Encounter');
          if (ch.enemyRelicId) {
            ch.subtitle = locRelicName(ch.enemyRelicId) || L('Mutation de la Faille', 'Rift Mutation');
          }
          ch.description = isFr()
            ? `${enemyDesc}\n\n[Récompense :]<bold> Choisissez [1]<bold> parmi [3]<bold> [${rewardRarityFr}]<${rewardTag}> après avoir gagné le prochain combat.`
            : `${enemyDesc}\n\n[Reward:]<bold> Choose [1]<bold> of [3]<bold> [${ch.rewardRarity || 'Rare'} Relics]<${rewardTag}> after winning the next battle.`;
        } else if (ch.eventId != null) {
          const ev = catalog.events.get(Number(ch.eventId));
          if (ev) {
            const cVars = buildCrossroadsVarsForEvent(ev);
            ch.title = locEventName(ev) || ch.title;
            ch.description = interpolateTemplate(locEventCrossroadsDesc(ev) || locEventText(ev) || '', cVars);
            ch.crossroadsVars = cVars;
          }
        }
      }
    }
    if (state.event && state.event.id != null) {
      const ev = catalog.events.get(Number(state.event.id));
      const rawEv = data.events?.[state.event.id];
      if (ev) {
        const savedCounter = state.rngCounter;
        if (typeof state.event._rngCounterBeforeHydrate === 'number') {
          state.rngCounter = state.event._rngCounterBeforeHydrate;
        }
        const hydratedChoices = hydrateEventChoices(ev, rawEv);
        state.rngCounter = savedCounter;
        const evVars = buildCrossroadsVarsForEvent(ev);
        const firstChoiceVars = hydratedChoices[0]?.textVars || {};
        const mergedEvVars = { ...evVars, ...firstChoiceVars };
        const evName = locEventName(ev);
        const evTextRaw = locEventText(ev) || locEventCrossroadsDesc(ev) || evName;
        const evCrossroadsRaw = locEventCrossroadsDesc(ev) || evTextRaw;
        state.event.name = evName;
        state.event.title = evName;
        state.event.text = interpolateTemplate(evTextRaw, mergedEvVars);
        state.event.crossroadsDescription = interpolateTemplate(evCrossroadsRaw, mergedEvVars);
        state.event.textVars = mergedEvVars;
        state.event.choices = hydratedChoices;
      }
    }
    if (state.pendingRelicChoices) {
      state.pendingRelicChoices.title = L('CHOISISSEZ UNE RELIQUE', 'CHOOSE A RELIC');
      if (state.pendingRelicChoices.source === 'StageModifier') {
        state.pendingRelicChoices.subtitle = L(
          'Récompense de Défi — Choisissez 1 Relique parmi 3',
          'Challenge Encounter Reward — Choose 1 of 3 Relics'
        );
      }
    }
    if (state.pendingItemChoices) {
      state.pendingItemChoices.title = L('CHOISISSEZ UN OBJET', 'CHOOSE AN ITEM');
    }
  }

  function getState() {
    if (typeof getLang === 'function' && getLang() !== lastLocaleLang) {
      refreshLocale();
    }
    syncQuestMetadata();
    syncAllHeroItemSlots();
    if (state.campfire) syncCampfireChoices();
    return {
      ...state,
      board: catalog.board,
      shopPrices: data.shopPrices || null,
    };
  }

  function chooseInitial(index = 0) {
    if (state.phase !== BattleFlowState.InitialSelection) return getState();
    const idx = clamp(Number(index) || 0, 0, Math.max(0, state.initialChoices.length - 1));
    const choice = state.initialChoices[idx] || state.initialChoices[0];
    if (choice) {
      if (choice.heroId) {
        addOrMergeHero(choice.heroId, choice.rank || 1, { autoPlace: true });
      }
      if (choice.relicId) {
        grantRelic(choice.relicId);
      }
    }
    loadCurrentFloorStage();
    setPhase(BattleFlowState.Intro);
    return getState();
  }

  function rerollInitial() {
    if (state.phase !== BattleFlowState.InitialSelection) return getState();
    state.initialSelectRerolls += 1;
    rollInitialSelection();
    return getState();
  }

  function startPlacement() {
    if (state.phase === BattleFlowState.Intro) {
      setPhase(BattleFlowState.Placement);
    }
    return getState();
  }

  function swapHeroes(heroUidA, heroUidB) {
    if (state.phase === BattleFlowState.Intro) setPhase(BattleFlowState.Placement);
    const heroA = state.heroes.find(h => String(h.uid) === String(heroUidA) || Number(h.heroId) === Number(heroUidA));
    const heroB = state.heroes.find(h => String(h.uid) === String(heroUidB) || Number(h.heroId) === Number(heroUidB));
    if (!heroA || !heroB || heroA.uid === heroB.uid) return getState();

    const aOnBoard = !!heroA.onBoard;
    const bOnBoard = !!heroB.onBoard;
    const ax = heroA.x;
    const ay = heroA.y;
    const bx = heroB.x;
    const by = heroB.y;

    if (aOnBoard && bOnBoard) {
      heroA.x = bx;
      heroA.y = by;
      heroB.x = ax;
      heroB.y = ay;
    } else if (aOnBoard && !bOnBoard) {
      heroA.onBoard = false;
      heroA.x = null;
      heroA.y = null;
      heroB.onBoard = true;
      heroB.x = ax;
      heroB.y = ay;
    } else if (!aOnBoard && bOnBoard) {
      heroB.onBoard = false;
      heroB.x = null;
      heroB.y = null;
      heroA.onBoard = true;
      heroA.x = bx;
      heroA.y = by;
    }
    return getState();
  }

  function placeHero(heroUid, x, y) {
    if (state.phase === BattleFlowState.Intro) setPhase(BattleFlowState.Placement);
    const hero = state.heroes.find(h => String(h.uid) === String(heroUid) || Number(h.heroId) === Number(heroUid));
    if (!hero) return getState();

    // Support placeHero(heroUid, targetHeroUid) for direct hero-to-hero swapping
    if (y === undefined && x != null) {
      const targetHero = state.heroes.find(h => String(h.uid) === String(x));
      if (targetHero) {
        return swapHeroes(hero.uid, targetHero.uid);
      }
    }

    const W = catalog.board?.width || 7;
    const playerRows = new Set(getPlayerRows());
    const tx = clamp(Math.floor(Number(x) || 0), 0, W - 1);
    const ty = playerRows.has(Math.floor(Number(y))) ? Math.floor(Number(y)) : (getPlayerRows()[0] ?? 0);

    const occupant = state.heroes.find(h => h.onBoard && h.uid !== hero.uid && h.x === tx && h.y === ty);
    if (occupant) {
      if (hero.onBoard) {
        occupant.x = hero.x;
        occupant.y = hero.y;
      } else {
        occupant.onBoard = false;
        occupant.x = null;
        occupant.y = null;
      }
    } else if (!hero.onBoard && countHeroesOnBoard(hero.uid) >= state.maxHeroesOnBoard) {
      // Board is at max team size and target tile is empty (e.g. dragged reserve hero onto party bar):
      // auto-swap out the last deployed board hero so the swap always succeeds!
      const deployed = state.heroes.filter(h => h.onBoard && h.uid !== hero.uid);
      const displaced = deployed[deployed.length - 1];
      if (displaced) {
        displaced.onBoard = false;
        displaced.x = null;
        displaced.y = null;
      } else {
        return getState();
      }
    }

    hero.x = tx;
    hero.y = ty;
    hero.onBoard = true;
    return getState();
  }

  function benchHero(heroUid) {
    if (state.phase === BattleFlowState.Intro) setPhase(BattleFlowState.Placement);
    const hero = state.heroes.find(h => String(h.uid) === String(heroUid) || Number(h.heroId) === Number(heroUid));
    if (!hero) return getState();
    hero.onBoard = false;
    hero.x = null;
    hero.y = null;
    return getState();
  }

  function equipItem(arg1, arg2) {
    if (state.phase === BattleFlowState.Intro) setPhase(BattleFlowState.Placement);
    let itemUid = arg1;
    let heroUid = arg2;

    // Support both equipItem(itemUid, heroUid) and equipItem(heroUid, itemUid)
    const arg1IsHero = state.heroes.some(h => String(h.uid) === String(arg1));
    const arg2IsHero = state.heroes.some(h => String(h.uid) === String(arg2));
    if (arg1IsHero && !arg2IsHero) {
      heroUid = arg1;
      itemUid = arg2;
    }

    const hero = state.heroes.find(h => String(h.uid) === String(heroUid) || Number(h.heroId) === Number(heroUid));
    if (!hero) return getState();
    const maxSlots = getHeroMaxItemSlots(hero);
    hero.maxItemSlots = maxSlots;
    if (maxSlots <= 0) return getState();

    // If item is already equipped on this target hero, no-op
    if (hero.items.some(it => String(it.uid) === String(itemUid))) {
      return getState();
    }

    let itemObj = null;
    let fromHero = null;
    let itemIdx = state.inventory.findIndex(it => String(it.uid) === String(itemUid));
    if (itemIdx < 0) {
      itemIdx = state.inventory.findIndex(it => Number(it.itemId) === Number(itemUid));
    }
    if (itemIdx >= 0) {
      [itemObj] = state.inventory.splice(itemIdx, 1);
    } else {
      // Check if item is currently equipped on another hero (cross-hero item transfer)
      for (const h of state.heroes) {
        if (h.uid === hero.uid) continue;
        let eqIdx = h.items.findIndex(it => String(it.uid) === String(itemUid));
        if (eqIdx < 0) eqIdx = h.items.findIndex(it => Number(it.itemId) === Number(itemUid));
        if (eqIdx >= 0) {
          fromHero = h;
          [itemObj] = h.items.splice(eqIdx, 1);
          break;
        }
      }
    }
    if (!itemObj) return getState();

    // If target hero's item slots are full, unequip the oldest item to inventory (or swap to fromHero)
    while (hero.items.length >= maxSlots) {
      const displaced = hero.items.shift();
      if (displaced) {
        if (fromHero && fromHero.items.length < getHeroMaxItemSlots(fromHero)) {
          fromHero.items.push(displaced);
        } else {
          state.inventory.push(displaced);
        }
      }
    }

    hero.items.push(itemObj);
    return getState();
  }

  function unequipItem(itemUid, heroUid) {
    const hero = heroUid != null
      ? state.heroes.find(h => String(h.uid) === String(heroUid))
      : state.heroes.find(h => h.items.some(it => String(it.uid) === String(itemUid)));
    if (!hero) return getState();
    let idx = hero.items.findIndex(it => String(it.uid) === String(itemUid));
    if (idx < 0) idx = hero.items.findIndex(it => Number(it.itemId) === Number(itemUid));
    if (idx < 0) return getState();
    const [itemObj] = hero.items.splice(idx, 1);
    state.inventory.push(itemObj);
    return getState();
  }

  function startBattle() {
    // Ensure at least 1 hero is deployed on the board if the player owns heroes
    if (countHeroesOnBoard() === 0 && state.heroes.length > 0) {
      for (const h of state.heroes) {
        if (countHeroesOnBoard() >= state.maxHeroesOnBoard) break;
        const pos = findFreeBoardTile(h.uid);
        h.x = pos.x;
        h.y = pos.y;
        h.onBoard = true;
      }
    }

    while (state.pendingRelicChoices) {
      pickRelic(0);
    }
    while (state.pendingItemChoices) {
      pickItem(0);
    }
    syncQuestMetadata();
    syncAllHeroItemSlots();
    setPhase(BattleFlowState.Resolution);

    // Starter Kit: Temporary Stat Growth (757..763): "At the start of Combat #2 and Combat #3, Heroes permanently gain [X] [Stat]."
    const combatNumber = state.stats.fightsWon + state.stats.fightsLost + 1;
    if (combatNumber === 2 || combatNumber === 3 || state.floorIndex === 1 || state.floorIndex === 2) {
      const tempGrowthMap = [
        { relicId: 757, stat: 'Attack', val: 12 },
        { relicId: 758, stat: 'MaxHealth', val: 100 },
        { relicId: 759, stat: 'Defense', val: 15 },
        { relicId: 760, stat: 'Crit', val: 7 },
        { relicId: 761, stat: 'AttackSpeed', val: 10 },
        { relicId: 762, stat: 'ManaRegen', val: 2 },
        { relicId: 763, stat: 'Magic', val: 12 },
      ];
      for (const tg of tempGrowthMap) {
        const rObj = state.relics.find(r => Number(r.relicId) === tg.relicId);
        if (rObj && (rObj.customStacks || 0) < 2) {
          rObj.customStacks = (rObj.customStacks || 0) + 1;
          for (const h of state.heroes) {
            addHeroBonusStat(h, tg.stat, tg.val);
          }
        }
      }
    }

    // Relic 3059 (Reserve Ascendancy): When completed, at start of combat Heroes in Reserves permanently gain a small amount of every stat
    const r3059 = state.relics.find(r => Number(r.relicId) === 3059 && r.completed);
    if (r3059) {
      for (const h of state.heroes) {
        if (!h.onBoard) {
          addHeroBonusStat(h, 'Attack', 12);
          addHeroBonusStat(h, 'Magic', 12);
          addHeroBonusStat(h, 'Defense', 15);
          addHeroBonusStat(h, 'MaxHealth', 100);
          addHeroBonusStat(h, 'AttackSpeed', 10);
          addHeroBonusStat(h, 'Crit', 7);
          addHeroBonusStat(h, 'ManaRegen', 2);
        }
      }
    }

    // Relic 3036 (Shield Investment Filigree): At start of combat, spend 1 Shard to apply Shields and permanently increase by 50
    const r3036 = state.relics.find(r => Number(r.relicId) === 3036);
    if (r3036 && state.shards >= 1) {
      state.shards -= 1;
      state.stats.totalShardsSpent += 1;
      r3036.customStacks = (r3036.customStacks || 0) + 50;
    }

    const battleSeed = calculateCurrentSeed({
      initialSelectRerolls: state.initialSelectRerolls,
      shopRefreshCount: state.shopRefreshCount,
      flow: FLOW_ENUM_INDEX.Resolution,
      currentFloor: state.floorIndex,
      endlessFloorIndex: state.endlessFloorIndex,
      runSeed: state.seed,
    });

    const damagedMod = activeDiffMods.get('HeroesStartBattlesDamagedEntry');
    const startHpPct = damagedMod?.HealthPercentage != null ? Number(damagedMod.HealthPercentage) : 1.0;

    // Collect enemy relics (ActBossRelicEntry + Red Rift + StageModifier enemy relics)
    const enemyRelics = state.nextBattleEnemyRelics.slice();
    if (state.redRift && !enemyRelics.includes(900)) {
      enemyRelics.push(900);
    }
    syncActBossRelicForCurrentFloor();
    if (state.actBossRelicId != null) {
      const bRelicId = Number(state.actBossRelicId);
      if (state.act2ActBossStacks > 0 && (bRelicId === 7002 || bRelicId === 7003 || bRelicId === 7004)) {
        enemyRelics.push({ relicId: bRelicId, customStacks: state.act2ActBossStacks });
      } else if (!enemyRelics.includes(bRelicId)) {
        enemyRelics.push(bRelicId);
      }
    }

    // Pass both deployed AND reserve (benched) heroes so Backup passives & ReserveOnlyModularEffects work!
    const allBattleHeroes = state.heroes.map(h => ({
      uid: h.uid,
      heroId: h.heroId,
      rank: h.rank || 1,
      maxItemSlots: getHeroMaxItemSlots(h),
      items: (h.items || []).map(it => (typeof it === 'object' ? it.itemId : it)),
      itemObjects: (h.items || []).map(it => ({ ...normalizeItemEntry(it) })),
      x: h.x ?? 0,
      y: h.y ?? 0,
      onBoard: !!h.onBoard,
      benched: !h.onBoard,
      specializationId: h.specializationId ?? null,
      rankModifierIds: (h.rankModifierIds || []).slice(),
      bonusStats: { ...(h.bonusStats || {}) },
      startHpPercent: startHpPct,
    }));

    const enemies = (state.enemies || []).map(e => ({
      enemyId: e.enemyId,
      x: e.x,
      y: e.y,
      direction: e.direction || 'None',
      floor: state.endlessFloorIndex >= 0 ? state.endlessFloorIndex : 0,
      endlessFloorIndex: state.endlessFloorIndex >= 0 ? state.endlessFloorIndex : null,
    }));

    const partnerRelicIds = Array.isArray(state.partnerRelics)
      ? state.partnerRelics.map(r => Number(r?.relicId ?? r?.id ?? r)).filter(id => Number.isFinite(id) && !state.relics.some(sr => Number(sr.relicId) === id))
      : [];

    const relics = [
      ...state.relics.map(r => r.relicId),
      ...state.temporaryRelics,
      ...partnerRelicIds,
    ];

    const relicObjects = [
      ...state.relics.map(r => ({ ...normalizeRelicEntry(r) })),
      ...state.temporaryRelics.map(id => ({
        uid: `temp_${id}`,
        relicId: Number(id),
        progress: 0,
        required: 0,
        completed: false,
        customStacks: 0,
        temporary: true,
      })),
      ...partnerRelicIds.map(id => ({
        uid: `coop_partner_${id}`,
        relicId: Number(id),
        progress: 0,
        required: 0,
        completed: true,
        customStacks: 0,
        isPartnerRelic: true,
      })),
    ];

    return {
      data,
      heroes: allBattleHeroes,
      enemies,
      relics,
      relicObjects,
      enemyRelics,
      stage: state.stage,
      stageId: state.stageId,
      act: state.act,
      floor: state.endlessFloorIndex >= 0 ? state.endlessFloorIndex : 0,
      displayFloor: state.floor,
      endlessFloorIndex: state.endlessFloorIndex >= 0 ? state.endlessFloorIndex : null,
      difficulty: state.difficulty,
      shardsInBank: state.shards,
      shardsGenerated: state.stats.totalShardsEarned || 0,
      rerolls: state.globalRerolls || 0,
      seed: battleSeed,
    };
  }

  function applyQuestProgressEntry(entry, upd) {
    if (!entry || upd == null) return false;
    if (typeof upd === 'number') {
      if (upd < (entry.progress || 0) && !entry.completed) {
        entry.progress = (entry.progress || 0) + upd;
      } else {
        entry.progress = upd;
      }
      return true;
    }
    if (typeof upd === 'object') {
      if (upd.delta != null) {
        entry.progress = (entry.progress || 0) + Number(upd.delta || 0);
      } else if (upd.progress != null) {
        const nextP = Number(upd.progress || 0);
        if (nextP < (entry.progress || 0) && !entry.completed && !upd.completed) {
          entry.progress = (entry.progress || 0) + nextP;
        } else {
          entry.progress = nextP;
        }
      }
      if (upd.customStacks != null) {
        entry.customStacks = Number(upd.customStacks || 0);
      }
      if (upd.completed === true) {
        entry.completed = true;
      }
      if (upd.rewardGranted === true) {
        entry._rewardGranted = true;
      }
      return true;
    }
    return false;
  }

  function finishBattle(result = {}) {
    syncQuestMetadata();
    const winner = String(result?.winner || (result?.victory ? 'players' : 'enemies')).toLowerCase();
    const isVictory = winner === 'players' || winner === 'player' || winner === 'victory';
    const deployedHeroes = state.heroes.filter(h => h.onBoard);
    const deployedCount = Math.max(1, deployedHeroes.length);
    const survivorUids = new Set(Array.isArray(result?.survivors) ? result.survivors.map(String) : []);
    const survivingCount = Array.isArray(result?.survivors)
      ? result.survivors.length
      : (isVictory ? deployedCount : 0);

    const stg = catalog.stages.get(Number(state.stageId)) || state.stage;
    const isEventFight = stg?.stageType === 'EventFight';
    const isFinalBossFloor = stg?.stageType === 'Boss' && state.endlessFloorIndex < 0;
    const nextPlanNode = state.actPlan[state.floorIndex + 1];
    const isNextFloorFinalBoss = !isFinalBossFloor && nextPlanNode?.stageType === 'Boss' && state.endlessFloorIndex < 0;

    const rewardList = [];
    const rng = getFlowSeed(`battle_reward_${state.floorIndex}`);

    // 0. Apply permanent stat gains earned during combat (from abilities, passives, rank modifiers, relics)
    if (result?.permanentGains && typeof result.permanentGains === 'object') {
      for (const [uid, gains] of Object.entries(result.permanentGains)) {
        const hero = state.heroes.find(h => String(h.uid) === String(uid));
        if (!hero || !gains || typeof gains !== 'object') continue;
        for (const [stat, val] of Object.entries(gains)) {
          addHeroBonusStat(hero, stat, Number(val));
        }
      }
    }

    // 0b. Shards generated during combat (abilities, items, relics)
    const combatGeneratedShards = Math.max(0, Math.round(Number(result?.shardsEarned || 0)));
    if (combatGeneratedShards > 0) {
      rewardList.push({ type: 'CombatGenerated', amount: combatGeneratedShards });
    }

    // 0c. Merge quest progress from result.questProgress (items and relics)
    const allPlayerItems = [
      ...state.heroes.flatMap(h => (h.items || []).map(it => ({ item: it, hero: h }))),
      ...state.inventory.map(it => ({ item: it, hero: null })),
    ];
    const updatedItemUids = new Set();
    const updatedRelicUids = new Set();

    const qpItems = result?.questProgress?.items ?? result?.itemObjects;
    if (qpItems) {
      if (Array.isArray(qpItems)) {
        for (const upd of qpItems) {
          if (!upd) continue;
          const match = allPlayerItems.find(({ item }) =>
            (upd.uid != null && String(item.uid) === String(upd.uid)) ||
            (upd.uid == null && Number(item.itemId) === Number(upd.itemId ?? upd.id) && !updatedItemUids.has(item.uid))
          );
          if (match && applyQuestProgressEntry(match.item, upd)) {
            updatedItemUids.add(match.item.uid);
          }
        }
      } else if (typeof qpItems === 'object') {
        for (const [key, upd] of Object.entries(qpItems)) {
          for (const { item } of allPlayerItems) {
            if (String(item.uid) === String(key) || (Number(item.itemId) === Number(key) && !updatedItemUids.has(item.uid))) {
              if (applyQuestProgressEntry(item, upd)) {
                updatedItemUids.add(item.uid);
              }
            }
          }
        }
      }
    }

    const qpRelics = result?.questProgress?.relics ?? result?.relicObjects;
    if (qpRelics) {
      if (Array.isArray(qpRelics)) {
        for (const upd of qpRelics) {
          if (!upd) continue;
          const match = state.relics.find(r =>
            (upd.uid != null && String(r.uid) === String(upd.uid)) ||
            (upd.uid == null && Number(r.relicId) === Number(upd.relicId ?? upd.id) && !updatedRelicUids.has(r.uid))
          );
          if (match && applyQuestProgressEntry(match, upd)) {
            updatedRelicUids.add(match.uid);
          }
        }
      } else if (typeof qpRelics === 'object') {
        for (const [key, upd] of Object.entries(qpRelics)) {
          for (const r of state.relics) {
            if (String(r.uid) === String(key) || (Number(r.relicId) === Number(key) && !updatedRelicUids.has(r.uid))) {
              if (applyQuestProgressEntry(r, upd)) {
                updatedRelicUids.add(r.uid);
              }
            }
          }
        }
      }
    }

    // Fallback combat-stats quest progression when sim did not supply explicit questProgress for an item/relic
    const totalShieldGranted = Number(result?.stats?.totalShieldGranted || 0);
    const totalDamageDealt = Number(result?.stats?.totalDamageDealt || 0);
    const perUnitStats = result?.stats?.perUnit || {};
    const totalCasts = Object.values(perUnitStats).reduce((s, u) => s + (Number(u?.casts) || 0), 0);

    for (const { item, hero } of allPlayerItems) {
      if (item.completed || updatedItemUids.has(item.uid)) continue;
      const iid = Number(item.itemId);
      const uStat = hero ? perUnitStats[hero.uid] : null;
      if (iid === 423 && combatGeneratedShards > 0) {
        item.progress = (item.progress || 0) + combatGeneratedShards;
      } else if ((iid === 414 || iid === 611 || iid === 722) && totalShieldGranted > 0) {
        item.progress = (item.progress || 0) + (uStat?.shieldGranted ?? totalShieldGranted);
      } else if (iid === 712 && (uStat?.casts || 0) > 0) {
        item.progress = (item.progress || 0) + Number(uStat.casts);
      } else if ((iid === 621 || iid === 713) && (uStat?.damageTaken || 0) > 0) {
        item.progress = (item.progress || 0) + Number(uStat.damageTaken);
      }
    }

    for (const r of state.relics) {
      if (r.completed || updatedRelicUids.has(r.uid)) continue;
      const rid = Number(r.relicId);
      if ((rid === 719 || rid === 1022 || rid === 2029 || rid === 3038) && combatGeneratedShards > 0) {
        r.progress = (r.progress || 0) + combatGeneratedShards;
      } else if ((rid === 710 || rid === 1026 || rid === 2044 || rid === 3035 || rid === 4009) && totalShieldGranted > 0) {
        r.progress = (r.progress || 0) + totalShieldGranted;
      } else if ((rid === 4007 || rid === 4008) && totalDamageDealt > 0) {
        r.progress = (r.progress || 0) + totalDamageDealt;
      } else if (rid === 2059 && totalCasts > 0) {
        r.progress = (r.progress || 0) + totalCasts;
      }
    }

    // 1. Shard Stabilizer accumulation on Victory (before cash-out checks)
    if (isVictory && !isEventFight && state.isStabilizerActive) {
      state.accumulatedShards += accumulatedPerWin;
    }

    // 2. Base Combat Gold Reward (with SingleBattleBoost victory shard modifiers)
    const rewardCfg = isVictory ? stg?.rewards : stg?.defeatRewards;
    let baseGold = 0;
    if (rewardCfg && (rewardCfg.max > 0 || rewardCfg.min > 0)) {
      baseGold = rng.rangeInclusive(rewardCfg.min, rewardCfg.max);
    } else if (isVictory) {
      baseGold = state.floorIndex === 0 ? 15 : 20;
    }
    if (isVictory) {
      if (hasRelic(5119)) baseGold = 0; // The Fairy Ring: Earn no Shards for combat victory
      if (hasRelic(5121)) baseGold = Math.max(0, baseGold - 5);  // The Debtor: -5 Shards
      if (hasRelic(5122)) baseGold = Math.max(0, baseGold - 15); // The Debtor: -15 Shards
      if (hasRelic(5123)) baseGold = Math.max(0, baseGold - 10); // The Cursed Urn: -10 Shards
      if (hasRelic(5125)) baseGold = Math.max(0, baseGold - 5);  // The Well of Temptation: -5 Shards
    }
    if (baseGold > 0) {
      rewardList.push({ type: isVictory ? 'Victory' : 'Defeat', amount: baseGold });
    }

    // 3. Surviving Hero Shard Bonus (on non-FinalBoss victory, after Floor 0)
    if (isVictory && !isFinalBossFloor && state.floorIndex > 0 && survivingCount > 0 && baseSurvivingHeroReward > 0) {
      const survBonus = survivingCount * baseSurvivingHeroReward;
      rewardList.push({ type: 'SurvivingHeroes', amount: survBonus, survivors: survivingCount });
    }

    // 3b. End-of-combat Relic & Passive Triggers
    const totalFightsSoFar = state.stats.fightsWon + state.stats.fightsLost + 1;
    if (isVictory && hasRelic(1010)) {
      rewardList.push({ type: 'Relic', relicId: 1010, amount: 3 });
    }
    if (isVictory && hasRelic(2027)) {
      rewardList.push({ type: 'Relic', relicId: 2027, amount: 6 });
    }
    if (hasRelic(6009) && survivingCount > 0) {
      rewardList.push({ type: 'Relic', relicId: 6009, amount: survivingCount });
    }
    // 723 Starter Kit: Temporary Shard Boost ("For Combat #2 and Combat #3, earn 2 extra Shards per surviving Hero at end of combat")
    if (hasRelic(723) && totalFightsSoFar <= 3 && survivingCount > 0) {
      rewardList.push({ type: 'Relic', relicId: 723, amount: 2 * survivingCount });
    }
    // 724 Starter Kit: Sustained Shard Boost ("Until the Act Boss, earn 1 extra Shard per surviving Hero at end of combat")
    if (hasRelic(724) && !isFinalBossFloor && survivingCount > 0) {
      rewardList.push({ type: 'Relic', relicId: 724, amount: survivingCount });
    }

    // Codex Relics (2045..2051): On combat victory, permanently increase the stat gained by Heroes
    if (isVictory) {
      const codexGrowthMap = [
        { relicId: 2045, stat: 'Attack', val: 6 },
        { relicId: 2046, stat: 'Magic', val: 6 },
        { relicId: 2047, stat: 'OmniVamp', val: 2 },
        { relicId: 2048, stat: 'MaxHealth', val: 50 },
        { relicId: 2049, stat: 'Defense', val: 10 },
        { relicId: 2050, stat: 'Crit', val: 4 },
        { relicId: 2051, stat: 'AttackSpeed', val: 5 },
      ];
      for (const cx of codexGrowthMap) {
        const rObj = state.relics.find(r => Number(r.relicId) === cx.relicId);
        if (rObj) {
          rObj.customStacks = (rObj.customStacks || 0) + cx.val;
          for (const h of state.heroes) {
            addHeroBonusStat(h, cx.stat, cx.val);
          }
        }
      }

      // 6017 Legacy Charm: Every 2 combat victories, permanently increase basic stats by 1%
      const r6017 = state.relics.find(r => Number(r.relicId) === 6017);
      if (r6017) {
        r6017.progress = (r6017.progress || 0) + 1;
        if (r6017.progress % 2 === 0) {
          r6017.customStacks = (r6017.customStacks || 0) + 1;
        }
      }

      // ActBossRelicEntry (7002..7004): On combat victory during Chunk 1, increment act2ActBossStacks
      if (state.actBossRelicId != null) {
        const bRelicId = Number(state.actBossRelicId);
        if (bRelicId === 7002) state.act2ActBossStacks = (state.act2ActBossStacks || 0) + 4;
        else if (bRelicId === 7003) state.act2ActBossStacks = (state.act2ActBossStacks || 0) + 3;
        else if (bRelicId === 7004) state.act2ActBossStacks = (state.act2ActBossStacks || 0) + 2;
      }
    }

    if (hasRelic(6017) && deployedHeroes.length > survivingCount && survivingCount > 0) {
      const deadCount = deployedHeroes.length - survivingCount;
      const aliveHeroes = deployedHeroes.filter(h => survivorUids.size === 0 || survivorUids.has(String(h.uid)));
      for (let i = 0; i < deadCount; i++) {
        const ben = rng.pick(aliveHeroes);
        if (ben) {
          addHeroBonusStat(ben, 'Attack', 1);
          addHeroBonusStat(ben, 'MaxHealth', 10);
        }
      }
    }

    // 3c. Post-combat Item triggers (502 Power Crystal, 503 Large Power Crystal, 504 Protection Crystal, 505 Force Crystal, 601 Warrior's Greataxe)
    for (const h of deployedHeroes) {
      if (!Array.isArray(h.items) || h.items.length === 0) continue;
      const survived = survivorUids.size > 0 ? survivorUids.has(String(h.uid)) : isVictory;
      const heroClasses = getHeroClasses(h);
      const remainingItems = [];

      for (const it of h.items) {
        const iid = Number(it?.itemId ?? it);
        if (iid === 502 && survived) {
          // Power Crystal: Destroy when holder survives combat & grant primary stats for each class
          for (const cid of heroClasses) {
            const bonus = CLASS_PRIMARY_STAT_BONUS.get(Number(cid));
            if (bonus) addHeroBonusStat(h, bonus.stat, bonus.val);
          }
          continue;
        }
        if (iid === 503 && survived) {
          // Large Power Crystal: Destroy after holder survives 2 combats & grant 2x primary stats for each class
          it.progress = (it.progress || 0) + 1;
          if (it.progress >= 2) {
            for (const cid of heroClasses) {
              const bonus = CLASS_PRIMARY_STAT_BONUS.get(Number(cid));
              if (bonus) addHeroBonusStat(h, bonus.stat, bonus.val * 2);
            }
            continue;
          }
        }
        if (iid === 504 || iid === 505) {
          // Protection Crystal & Force Crystal: Destroy at end of combat if used 2 times
          it.progress = (it.progress || 0) + 1;
          if (it.progress >= 2) {
            continue;
          }
        }
        if (iid === 601 && survived && heroClasses.includes(1)) {
          // Warrior's Greataxe: On combat survival, if held by a Warrior, gains +12 Attack
          if (!updatedItemUids.has(it.uid)) {
            it.customStacks = (it.customStacks || 0) + 12;
          }
          addHeroBonusStat(h, 'Attack', 12);
        }
        remainingItems.push(it);
      }
      h.items = remainingItems;
    }

    // Niklas (Hero 9, innate passive 10901 Red Hot Deals):
    // If Niklas survives combat and has at least 1 item, consume leftmost item for permanent stats + 80% Shard value
    for (const h of deployedHeroes) {
      if (Number(h.heroId) === 9 && Array.isArray(h.items) && h.items.length > 0) {
        const survived = survivorUids.size > 0 ? survivorUids.has(String(h.uid)) : isVictory;
        if (survived) {
          const consumed = h.items.shift();
          const itemDef = catalog.items.get(Number(consumed?.itemId ?? consumed));
          if (itemDef) {
            for (const sm of itemDef.statMods || []) {
              if (!sm || !sm.stat) continue;
              addHeroBonusStat(h, sm.stat, Number(sm.value || 0));
            }
            const baseCost = itemRarityCosts.get(itemDef.rarity || 'Common') ?? itemDef.price ?? 10;
            const refund = Math.max(1, Math.round(baseCost * 0.8));
            rewardList.push({ type: 'RedHotDeals', amount: refund });
          }
        }
      }
    }

    // Niklas (Hero 9, Active 9 Wheel and Deal): grant random item(s) created in combat
    const itemsCreated = Math.max(0, Number(result?.itemsCreated) || 0);
    for (let ic = 0; ic < itemsCreated; ic++) {
      const allItemEntries = Array.from(catalog.items.values()).filter(it => !it.disabled);
      if (allItemEntries.length > 0) {
        const pickedItem = rng.pick(allItemEntries);
        if (pickedItem) {
          grantItem(pickedItem.id);
          rewardList.push({ type: 'ItemCreated', itemId: pickedItem.id });
        }
      }
    }

    // 3d. SingleBattleBoost & Event Trial Relics (5100..5128, 5500..5511) post-combat rewards & expiration
    const activeSingleBattleIds = new Set([
      ...state.relics.map(r => Number(r.relicId)),
      ...state.temporaryRelics.map(Number),
    ]);
    for (const sbId of activeSingleBattleIds) {
      if (sbId === 5113 && isVictory && isFinalBossFloor) {
        rewardList.push({ type: 'Relic', relicId: 5113, amount: 25 });
      } else if (sbId === 5114) {
        const rId = rollDistinctRelicsFromPool(rng, 102, 1)[0] ?? 2001;
        grantRelic(rId);
      } else if (sbId === 5116 && isVictory) {
        rewardList.push({ type: 'Relic', relicId: 5116, amount: 10 });
      } else if (sbId === 5117) {
        const rId = rollDistinctRelicsFromPool(rng, 103, 1)[0] ?? 3001;
        grantRelic(rId);
      } else if (sbId === 5118) {
        const itId = rollDistinctItemsFromPool(rng, 2, 1)[0] ?? 601;
        grantItem(itId);
      } else if (sbId === 5119) {
        const rId = rollDistinctRelicsFromPool(rng, 102, 1)[0] ?? 2001;
        grantRelic(rId);
      } else if (sbId === 5124) {
        const rId = rollDistinctRelicsFromPool(rng, 102, 1)[0] ?? 2001;
        grantRelic(rId);
      } else if (sbId === 5126) {
        const itId = rollDistinctItemsFromPool(rng, 2, 1)[0] ?? 601;
        grantItem(itId);
      } else if (sbId === 5128) {
        grantRelic(799);
        for (const h of state.heroes) addHeroBonusStat(h, 'MaxHealth', 500);
      } else if (sbId === 5500 && isVictory) {
        rewardList.push({ type: 'Relic', relicId: 5500, amount: 20 });
      } else if (sbId === 5501 && isVictory) {
        const rId = rollDistinctRelicsFromPool(rng, 102, 1)[0] ?? 2001;
        grantRelic(rId);
      } else if (sbId === 5502 && isVictory) {
        const itId = rollDistinctItemsFromPool(rng, 2, 1)[0] ?? 601;
        grantItem(itId);
      } else if ((sbId === 5503 || sbId === 5506) && isVictory) {
        rewardList.push({ type: 'Relic', relicId: sbId, amount: 10 });
      } else if ((sbId === 5504 || sbId === 5507) && isVictory) {
        rewardList.push({ type: 'Relic', relicId: sbId, amount: 20 });
      } else if ((sbId === 5505 || sbId === 5508) && isVictory) {
        rewardList.push({ type: 'Relic', relicId: sbId, amount: 30 });
      } else if ((sbId === 5509 || sbId === 5510 || sbId === 5511) && isVictory) {
        const rId = rollDistinctRelicsFromPool(rng, 103, 1)[0] ?? 3001;
        grantRelic(rId);
      }
    }
    // Expire single-battle boost relics from state.relics (except 5113 before Boss and multi-battle 5116)
    state.relics = state.relics.filter(r => {
      const rid = Number(r.relicId);
      if (rid === 5113) return !isFinalBossFloor;
      if (rid === 5116) return true;
      if ((rid >= 5100 && rid <= 5128) || (rid >= 5500 && rid <= 5511)) return false;
      return true;
    });

    // 3e. Evaluate Run-Level OnCombatVictory Quests & Complete Eligible Item/Relic Quests
    const preQuestShardsEarned = rewardList.reduce((s, r) => s + (typeof r.amount === 'number' && r.amount > 0 ? r.amount : 0), 0);
    const bankShardsForVictoryQuests = state.shards + preQuestShardsEarned;

    if (isVictory) {
      // Item 610 (Merchant's Scroll): Win a combat with 25 or more Shards in the bank
      for (const { item } of allPlayerItems) {
        if (!item.completed && Number(item.itemId) === 610 && (state.shards >= 25 || bankShardsForVictoryQuests >= 25)) {
          item.progress = Math.max(item.progress || 0, item.required || 1);
        }
      }

      // Compute class distributions across deployedHeroes and all state.heroes
      const deployedClassCounts = new Map();
      let deployedHasSharedClass = false;
      const seenDeployedClasses = new Set();
      for (const h of deployedHeroes) {
        for (const cid of getHeroClasses(h)) {
          deployedClassCounts.set(cid, (deployedClassCounts.get(cid) || 0) + 1);
          if (seenDeployedClasses.has(cid)) deployedHasSharedClass = true;
          seenDeployedClasses.add(cid);
        }
      }
      const maxSameClassInPlay = Math.max(0, ...deployedClassCounts.values());

      const allRosterClassCounts = new Map();
      const allRosterUniqueClasses = new Set();
      for (const h of state.heroes) {
        for (const cid of getHeroClasses(h)) {
          allRosterClassCounts.set(cid, (allRosterClassCounts.get(cid) || 0) + 1);
          allRosterUniqueClasses.add(cid);
        }
      }
      const maxSameClassInRoster = Math.max(0, ...allRosterClassCounts.values());
      const reserveHeroesCount = state.heroes.filter(h => !h.onBoard).length;
      const uniqueDeployedRanks = new Set(deployedHeroes.map(h => Number(h.rank) || 1)).size;

      for (const r of state.relics) {
        if (r.completed || updatedRelicUids.has(r.uid)) continue;
        const rid = Number(r.relicId);
        switch (rid) {
          case 1027: // Unity Vessel: Win combat with 3+ Heroes of same Class in play
            if (maxSameClassInPlay >= 3) r.progress = (r.progress || 0) + 1;
            break;
          case 1028: // Divergence Vessel: Win combat with 3+ Heroes in play where no Class is shared
            if (deployedHeroes.length >= 3 && !deployedHasSharedClass) r.progress = (r.progress || 0) + 1;
            break;
          case 1029: // Victory Vessel: Win 3 combats
            r.progress = (r.progress || 0) + 1;
            break;
          case 2017: // Multiclass Conduit: Win combat with 4+ combined classes in play
            if (seenDeployedClasses.size >= 4) r.progress = (r.progress || 0) + 1;
            break;
          case 3058: // Golden Ascendancy: Win combat with 66+ Shards in bank
            if (state.shards >= 66 || bankShardsForVictoryQuests >= 66) r.progress = (r.progress || 0) + 1;
            break;
          case 3059: // Reserve Ascendancy: Win combat with 2+ Heroes in reserves
            if (reserveHeroesCount >= 2) r.progress = (r.progress || 0) + 1;
            break;
          case 4012: // Unity Mandate: Win combat with 4+ heroes of same class in combat or reserves
            if (maxSameClassInRoster >= 4) r.progress = (r.progress || 0) + 1;
            break;
          case 4013: // Omnity Mandate: Win combat with all 7 classes in combat or reserves
            if (allRosterUniqueClasses.size >= 7) r.progress = (r.progress || 0) + 1;
            break;
          case 4014: // Greed Mandate: Win combat with 100+ Shards in bank
            if (state.shards >= 100 || bankShardsForVictoryQuests >= 100) r.progress = (r.progress || 0) + 1;
            break;
          case 4030: // Victory Mandate: Win 4 combats
            r.progress = (r.progress || 0) + 1;
            break;
          case 4031: // Ascension Mandate: Win combat with Heroes of 3+ different ranks in combat
            if (uniqueDeployedRanks >= 3) r.progress = (r.progress || 0) + 1;
            break;
          case 4034: // Desperation Mandate: Win combat with only 1 surviving Hero
            if (survivingCount === 1) r.progress = (r.progress || 0) + 1;
            break;
          case 6002: // Bossy: Win 6 combats
            r.progress = (r.progress || 0) + 1;
            break;
          default:
            break;
        }
      }
    }

    // Complete any Item Quests and Relic Quests that have met their requiredProgress
    for (const { item } of allPlayerItems) {
      if ((item.required > 0 && (item.progress || 0) >= item.required) || item.completed) {
        completeItemQuest(item, rewardList);
      }
    }
    for (const r of state.relics.slice()) {
      if ((r.required > 0 && (r.progress || 0) >= r.required) || r.completed) {
        completeRelicQuest(r, rng, rewardList);
      }
    }

    // 4. Shard Interest (Relic 3037: 1 shard per 5 shards held, max 20)
    if (hasRelic(INTEREST_RELIC_ID)) {
      const interest = Math.min(Math.floor(state.shards / shardInterestInterval), maxShardInterest);
      if (interest > 0) {
        rewardList.push({ type: 'Interest', amount: interest });
      }
    }

    // 5. StageModifier bonus relic rewards on victory (present 3 Relics for player to choose 1)
    if (isVictory && state.pendingStageModRewardPools.length > 0) {
      const candidateRelics = [];
      for (const poolId of state.pendingStageModRewardPools) {
        const picked = rollDistinctRelicsFromPool(rng, poolId, 1, candidateRelics);
        if (picked.length > 0) candidateRelics.push(picked[0]);
      }
      if (candidateRelics.length < 3) {
        const extra = rollDistinctRelicsFromPool(rng, state.pendingStageModRewardPools[0] || 102, 3 - candidateRelics.length, candidateRelics);
        candidateRelics.push(...extra);
      }
      if (candidateRelics.length > 0) {
        enqueueRelicChoice({
          title: L('CHOISISSEZ UNE RELIQUE', 'CHOOSE A RELIC'),
          subtitle: L('Récompense de Défi — Choisissez 1 Relique parmi 3', 'Challenge Encounter Reward — Choose 1 of 3 Relics'),
          choices: candidateRelics,
          canSkip: true,
          advanceAfterPick: false,
          source: 'StageModifier',
        });
        rewardList.push({
          type: 'StageModifierRelic',
          choices: candidateRelics.slice(),
          relicId: candidateRelics[0],
          pickedRelicId: null,
        });
      }
    }
    state.pendingStageModRewardPools = [];
    state.nextBattleEnemyRelics = [];
    state.temporaryRelics = [];

    // 6. Stabilizer Cash-Out & Life Handling (PlayerService.DecrementLife & OnBattleFinished)
    if (!isVictory && !isEventFight) {
      state.stats.fightsLost += 1;
      if (state.isStabilizerActive && !isFinalBossFloor) {
        // Case A: First defeat breaks Stabilizer and cashes out accumulated shards!
        const payout = state.accumulatedShards;
        if (payout > 0) {
          rewardList.push({ type: 'Stabilizer', amount: payout });
        }
        state.isStabilizerActive = false;
        state.accumulatedShards = 0;
        state.lives = 1;
        logMsg(`Shard Stabilizer triggered! Cashed out +${payout} Shards.`);
      } else {
        // Case B: Stabilizer already broken OR Final Boss defeat -> Out of Lives
        state.lives = 0;
        state.isOutOfLives = true;
        if (state.endlessFloorIndex >= 0 || state.actBossCleared) {
          state.won = true;
          state.outcome = 'endless_complete';
        } else {
          state.won = false;
          state.outcome = 'defeat';
        }
      }
    } else if (isVictory) {
      state.stats.fightsWon += 1;
      if (state.actPlan[state.floorIndex] && !isEventFight) {
        state.actPlan[state.floorIndex].cleared = true;
      }
      // Pre-Final-Boss undefeated Stabilizer cash-out so player can spend shards in the final shop!
      if (isNextFloorFinalBoss && state.isStabilizerActive) {
        const payout = state.accumulatedShards;
        if (payout > 0) {
          rewardList.push({ type: 'Stabilizer', amount: payout });
        }
        state.isStabilizerActive = false;
        state.accumulatedShards = 0;
        logMsg(`Pre-Boss Stabilizer cash-out: +${payout} Shards!`);
      }
      if (isFinalBossFloor) {
        state.actBossCleared = true;
        if (!state.allowEndless) {
          state.won = true;
          state.outcome = 'victory';
        } else {
          logMsg('Final Boss defeated! Entering ENDLESS MODE — climb as high as you can!');
        }
      }
      if (state.endlessFloorIndex >= 0) {
        state.endlessScore = Math.max(state.endlessScore || 0, state.endlessFloorIndex + 1);
      }
    }

    // Apply all shard rewards
    let totalEarned = 0;
    for (const r of rewardList) {
      if (typeof r.amount === 'number' && r.amount > 0) {
        totalEarned += r.amount;
      }
    }
    state.shards += totalEarned;
    state.stats.totalShardsEarned += totalEarned;

    state.rewards = rewardList;
    state.lastResult = {
      ...result,
      winner: isVictory ? 'players' : (winner === 'draw' ? 'draw' : 'enemies'),
      victory: isVictory,
      survivors: Array.isArray(result?.survivors) ? result.survivors : [],
      shardsEarned: totalEarned,
      rewards: rewardList,
    };

    // Pre-roll shop offers so state.shop is ready immediately after combat
    if (!state.isOutOfLives && !(isFinalBossFloor && isVictory && !state.allowEndless)) {
      resetShop(true);
    }

    setPhase(BattleFlowState.Result);
    return getState();
  }

  function proceedFromResult() {
    if (state.phase !== BattleFlowState.Result) return getState();
    if (state.isOutOfLives || state.won === true) {
      setPhase(BattleFlowState.Outro);
      return getState();
    }
    // If returning from an EventFight, return to the floor's Shop
    if (state.returnFloorAfterEventFight != null) {
      state.floorIndex = state.returnFloorAfterEventFight;
      state.returnFloorAfterEventFight = null;
      loadCurrentFloorStage();
    }
    return openShop();
  }

  function openShop() {
    if (state.isOutOfLives || state.won === true) {
      setPhase(BattleFlowState.Outro);
      return getState();
    }
    if (!state.shop) {
      resetShop(true);
    }
    setPhase(BattleFlowState.Shop);
    return getState();
  }

  function buyHero(slotIndex = 0) {
    if (!state.shop?.heroes) return getState();
    const slot = state.shop.heroes[Number(slotIndex)];
    if (!slot || slot.sold) return getState();
    const price = Number(slot.price ?? 0);
    if (state.shards < price) return getState();

    const isDuplicate = state.heroes.some(h => Number(h.heroId) === Number(slot.heroId));
    if (!isDuplicate && state.heroes.length >= state.maxTotalHeroes) {
      return getState();
    }

    state.shards -= price;
    state.stats.totalShardsSpent += price;
    slot.sold = true;
    slot.frozen = false;
    if (state.shopDiscounts.hero > 0) state.shopDiscounts.hero = Math.max(0, state.shopDiscounts.hero - 1);

    addOrMergeHero(slot.heroId, slot.rank || 1, { autoPlace: true });
    return getState();
  }

  function buyItem(slotIndex = 0, opts = null) {
    if (!state.shop?.items) return getState();
    const slot = state.shop.items[Number(slotIndex)];
    if (!slot || slot.sold) return getState();
    const price = Number(slot.price ?? 0);
    if (state.shards < price) return getState();

    state.shards -= price;
    state.stats.totalShardsSpent += price;
    slot.sold = true;
    slot.frozen = false;

    const entry = grantItem(slot.itemId);
    const targetHeroUid = opts && typeof opts === 'object' ? opts.heroUid : opts;
    if (entry && targetHeroUid != null) {
      equipItem(entry.uid, targetHeroUid);
    } else if (entry && opts && typeof opts === 'object' && opts.autoEquip) {
      const candidate = state.heroes.find(h => h.onBoard && h.items.length < getHeroMaxItemSlots(h))
        || state.heroes.find(h => h.items.length < getHeroMaxItemSlots(h));
      if (candidate) equipItem(entry.uid, candidate.uid);
    }
    return getState();
  }

  function buyRelic(slotIndex = 0) {
    if (!state.shop?.relics) return getState();
    const slot = state.shop.relics[Number(slotIndex)];
    if (!slot || slot.sold) return getState();
    const price = Number(slot.price ?? 0);
    if (state.shards < price) return getState();

    state.shards -= price;
    state.stats.totalShardsSpent += price;
    slot.sold = true;
    slot.frozen = false;
    if (state.shopDiscounts.relic > 0) state.shopDiscounts.relic = Math.max(0, state.shopDiscounts.relic - 1);

    grantRelic(slot.relicId);
    return getState();
  }

  function reroll() {
    if (!state.shop) return getState();
    const cost = Number(state.shop.rerollCost ?? baseRerollCost);
    if (state.shards < cost) return getState();

    state.shards -= cost;
    state.stats.totalShardsSpent += cost;
    state.shopRefreshCount += 1;
    state.globalRerolls += 1;

    // Progress OnShopReroll quests (4010 Merchant Mandate: Reroll the shop 8 times)
    syncQuestMetadata();
    for (const r of state.relics) {
      if (!r.completed && Number(r.relicId) === 4010) {
        r.progress = (r.progress || 0) + 1;
        if (r.progress >= (r.required || 8)) {
          completeRelicQuest(r);
        }
      }
    }

    // Unfreeze on reroll per ShopService.RerollShop
    state.shop.frozen = false;
    for (const list of [state.shop.heroes, state.shop.items, state.shop.relics]) {
      for (const s of list || []) s.frozen = false;
    }

    resetShop(false);
    return getState();
  }

  function freeze(arg1, arg2) {
    if (!state.shop) return getState();
    if (arg1 === undefined || arg1 === null) {
      const nextFrozen = !state.shop.frozen;
      state.shop.frozen = nextFrozen;
      for (const list of [state.shop.heroes, state.shop.items, state.shop.relics]) {
        for (const s of list || []) {
          if (!s.sold) s.frozen = nextFrozen;
        }
      }
      return getState();
    }
    if (typeof arg1 === 'string' && arg2 !== undefined) {
      const key = arg1.startsWith('hero') ? 'heroes' : arg1.startsWith('item') ? 'items' : 'relics';
      const slot = state.shop[key]?.[Number(arg2)];
      if (slot && !slot.sold) slot.frozen = !slot.frozen;
    } else {
      const idx = Number(arg1);
      const allSlots = [...(state.shop.heroes || []), ...(state.shop.items || []), ...(state.shop.relics || [])];
      const target = state.shop.heroes?.[idx] || allSlots[idx];
      if (target && !target.sold) target.frozen = !target.frozen;
    }
    state.shop.frozen = [...(state.shop.heroes || []), ...(state.shop.items || []), ...(state.shop.relics || [])]
      .some(s => s.frozen && !s.sold);
    return getState();
  }

  function sellHero(heroUid) {
    if (state.heroes.length <= 1) return getState();
    const idx = state.heroes.findIndex(h => String(h.uid) === String(heroUid) || Number(h.heroId) === Number(heroUid));
    if (idx < 0) return getState();

    const [removed] = state.heroes.splice(idx, 1);
    // Return equipped items to inventory
    if (Array.isArray(removed.items) && removed.items.length) {
      for (const it of removed.items) state.inventory.push(it);
    }

    const baseCost = heroRankCosts.get(removed.rank || 1) ?? 15;
    const refund = Math.max(1, Math.floor(baseCost * sellMultiplier));
    state.shards += refund;
    state.stats.totalShardsEarned += refund;
    return getState();
  }

  function sellItem(itemUid) {
    let itemObj = null;
    const invIdx = state.inventory.findIndex(it => String(it.uid) === String(itemUid) || Number(it.itemId) === Number(itemUid));
    if (invIdx >= 0) {
      [itemObj] = state.inventory.splice(invIdx, 1);
    } else {
      for (const h of state.heroes) {
        const eqIdx = h.items.findIndex(it => String(it.uid) === String(itemUid) || Number(it.itemId) === Number(itemUid));
        if (eqIdx >= 0) {
          [itemObj] = h.items.splice(eqIdx, 1);
          break;
        }
      }
    }
    if (!itemObj) return getState();

    const def = catalog.items.get(Number(itemObj.itemId));
    const baseCost = itemRarityCosts.get(def?.rarity || 'Common') ?? def?.price ?? 5;
    const refund = Math.max(1, Math.floor(baseCost * sellMultiplier));
    state.shards += refund;
    state.stats.totalShardsEarned += refund;
    return getState();
  }

  function buyTeamSize() {
    if (state.maxHeroesOnBoard >= state.maxTotalHeroes) return getState();
    syncTeamSizeCost();
    if (state.shards < state.teamSizeCost) return getState();

    state.shards -= state.teamSizeCost;
    state.stats.totalShardsSpent += state.teamSizeCost;
    state.teamSizeUpgradesPurchased += 1;
    state.maxHeroesOnBoard = Math.min(state.maxTotalHeroes, state.maxHeroesOnBoard + 1);
    syncTeamSizeCost();
    if (state.shop) state.shop.teamSizeCost = state.teamSizeCost;
    return getState();
  }

  function applySpecializationSideEffects(hero, specId) {
    if (!hero) return;
    syncAllHeroItemSlots();
    // Irini spec 103 (The Olympic, passiveAbilityId 10103): "Gain the unique quest item Zeus's Thunder" (Item 500)
    if (Number(specId) === 103) {
      const itemObj = grantItem(500);
      if (itemObj && hero.items.length < getHeroMaxItemSlots(hero)) {
        equipItem(itemObj.uid, hero.uid);
      }
    }
  }

  function rankUpChoice(choiceIndex = 0, explicitChoice = null) {
    const ru = state.pendingRankUp;
    if (!ru) return getState();

    const hero = state.heroes.find(h => String(h.uid) === String(ru.heroUid)) || state.heroes[0];
    const rawPicked = explicitChoice != null
      ? (typeof explicitChoice === 'object' ? (explicitChoice.id ?? explicitChoice.specializationId ?? explicitChoice.rankModifierId) : explicitChoice)
      : (ru.choices?.[clamp(Number(choiceIndex) || 0, 0, Math.max(0, (ru.choices?.length || 1) - 1))] ?? ru.choices?.[0]);
    const pickedId = Number(rawPicked);

    if (hero && Number.isFinite(pickedId)) {
      if (ru.type === 'specialization' || catalog.specializations.has(pickedId)) {
        hero.specializationId = pickedId;
        applySpecializationSideEffects(hero, pickedId);
      } else if (ru.type === 'rankModifier' || catalog.rankModifiers.has(pickedId)) {
        if (!Array.isArray(hero.rankModifierIds)) hero.rankModifierIds = [];
        if (ru.retrain && hero.rankModifierIds.length > 0) {
          hero.rankModifierIds[hero.rankModifierIds.length - 1] = pickedId;
        } else if (!hero.rankModifierIds.includes(pickedId)) {
          hero.rankModifierIds.push(pickedId);
        }
      }
    }

    state.pendingRankUp = state.pendingRankUpQueue.shift() || null;
    return getState();
  }

  function chooseSpecialization(heroUid, specId) {
    const hero = state.heroes.find(h => String(h.uid) === String(heroUid) || Number(h.heroId) === Number(heroUid)) || state.heroes[0];
    if (!hero) return getState();
    const sid = Number(specId);
    if (Number.isFinite(sid) && catalog.specializations.has(sid)) {
      hero.specializationId = sid;
      applySpecializationSideEffects(hero, sid);
    }
    if (state.pendingRankUp && String(state.pendingRankUp.heroUid) === String(hero.uid)) {
      state.pendingRankUp = state.pendingRankUpQueue.shift() || null;
    }
    return getState();
  }

  function pickRelic(relicIdOrIndex = 0) {
    const pr = state.pendingRelicChoices;
    if (!pr || !Array.isArray(pr.choices) || pr.choices.length === 0) return getState();

    const numArg = Number(relicIdOrIndex);
    let chosenId = pr.choices[0];
    if (pr.choices.map(Number).includes(numArg)) {
      chosenId = numArg;
    } else if (Number.isFinite(numArg) && numArg >= 0 && numArg < pr.choices.length) {
      chosenId = pr.choices[Math.floor(numArg)];
    }

    if (chosenId != null) {
      grantRelic(chosenId);
      for (const rw of state.rewards || []) {
        if (rw.type === 'StageModifierRelic' && !rw.pickedRelicId) {
          rw.pickedRelicId = chosenId;
          rw.relicId = chosenId;
          break;
        }
      }
    }

    const shouldAdvance = !!pr.advanceAfterPick;
    state.pendingRelicChoices = state.pendingRelicQueue.shift() || null;

    if (!state.pendingRelicChoices && !state.pendingItemChoices && shouldAdvance && state.phase === BattleFlowState.Event) {
      return advanceToNextFloor();
    }
    return getState();
  }

  function skipRelicReward() {
    const pr = state.pendingRelicChoices;
    if (!pr) return getState();
    const shouldAdvance = !!pr.advanceAfterPick;
    state.pendingRelicChoices = state.pendingRelicQueue.shift() || null;
    if (!state.pendingRelicChoices && !state.pendingItemChoices && shouldAdvance && state.phase === BattleFlowState.Event) {
      return advanceToNextFloor();
    }
    return getState();
  }

  function pickItem(itemIdOrIndex = 0) {
    const pi = state.pendingItemChoices;
    if (!pi || !Array.isArray(pi.choices) || pi.choices.length === 0) return getState();

    const numArg = Number(itemIdOrIndex);
    let chosenId = pi.choices[0];
    if (pi.choices.map(Number).includes(numArg)) {
      chosenId = numArg;
    } else if (Number.isFinite(numArg) && numArg >= 0 && numArg < pi.choices.length) {
      chosenId = pi.choices[Math.floor(numArg)];
    }

    if (chosenId != null) {
      grantItem(chosenId);
    }

    const shouldAdvance = !!pi.advanceAfterPick;
    state.pendingItemChoices = state.pendingItemQueue.shift() || null;

    if (!state.pendingRelicChoices && !state.pendingItemChoices && shouldAdvance && state.phase === BattleFlowState.Event) {
      return advanceToNextFloor();
    }
    return getState();
  }

  function skipItemReward() {
    const pi = state.pendingItemChoices;
    if (!pi) return getState();
    const shouldAdvance = !!pi.advanceAfterPick;
    state.pendingItemChoices = state.pendingItemQueue.shift() || null;
    if (!state.pendingRelicChoices && !state.pendingItemChoices && shouldAdvance && state.phase === BattleFlowState.Event) {
      return advanceToNextFloor();
    }
    return getState();
  }

  function leaveShop() {
    // Auto-claim any unpicked StageModifier relic if leaving shop in headless mode
    while (state.pendingRelicChoices) {
      pickRelic(0);
    }
    while (state.pendingItemChoices) {
      pickItem(0);
    }
    if (state.isOutOfLives || state.won === true) {
      setPhase(BattleFlowState.Outro);
      return getState();
    }
    // If the player lost the floor (Stabilizer broke), retry the current floor after shopping!
    const currentPlanNode = state.actPlan[state.floorIndex];
    if (state.endlessFloorIndex < 0 && currentPlanNode && !currentPlanNode.cleared && state.lastResult && !state.lastResult.victory) {
      loadCurrentFloorStage();
      setPhase(BattleFlowState.Intro);
      return getState();
    }
    return openCrossroads();
  }

  function openCrossroads() {
    const node = state.actPlan[state.floorIndex];
    // If floor has NoCrossroads (e.g. Floor 5 MiniBoss -> advance directly to Floor 6; Floor 11 Boss -> Outro/Endless)
    if (state.endlessFloorIndex < 0 && node && node.eventOverrideType === 'NoCrossroads') {
      return advanceToNextFloor();
    }
    buildCrossroadsForCurrentNode();
    if (!state.crossroads.length) {
      return advanceToNextFloor();
    }
    setPhase(BattleFlowState.Crossroads);
    return getState();
  }

  function chooseCrossroads(index = 0) {
    if (state.phase !== BattleFlowState.Crossroads) return getState();
    const idx = clamp(Number(index) || 0, 0, Math.max(0, state.crossroads.length - 1));
    const choice = state.crossroads[idx] || state.crossroads[0];
    if (!choice) return advanceToNextFloor();

    const pType = String(choice.pathType || choice.type || 'Stage');
    if (pType === 'StageModifier') {
      if (choice.enemyRelicId) {
        state.nextBattleEnemyRelics.push(Number(choice.enemyRelicId));
      }
      if (Array.isArray(choice.rewardRelicPoolIds)) {
        state.pendingStageModRewardPools.push(...choice.rewardRelicPoolIds.map(Number));
      }
      return advanceToNextFloor();
    }
    if (pType === 'Campfire' || choice.eventId === 600 || choice.eventId === 601) {
      openCampfireNode(choice.eventId || 600);
      return getState();
    }
    if (pType === 'Event' && choice.eventId != null) {
      openEventNode(choice.eventId);
      return getState();
    }
    return advanceToNextFloor();
  }

  function applyEventReward(reward, targetHero) {
    if (!reward) return;
    const rng = getFlowSeed(`event_reward_${reward.RewardType}`);
    const rType = reward.RewardType;
    const amount = Number(reward.Amount ?? 1);

    switch (rType) {
      case 'SpecificRelic': {
        if (reward.relicId != null) grantRelic(Number(reward.relicId), { heroUid: targetHero?.uid });
        break;
      }
      case 'SpecificItem': {
        if (reward.itemId != null) grantItem(Number(reward.itemId));
        break;
      }
      case 'SpecificStatMod': {
        if (reward.statModId != null) {
          if (reward.allHeroes) {
            for (const h of state.heroes) applyStatModToHero(h, Number(reward.statModId));
          } else {
            applyStatModToHero(targetHero, Number(reward.statModId));
          }
        }
        break;
      }
      case 'SpecificHero': {
        if (reward.heroId != null) {
          const heroRank = clamp(Number(reward.HeroRank ?? 1), 1, state.maxHeroRank);
          addOrMergeHero(Number(reward.heroId), heroRank, { autoPlace: true });
        }
        break;
      }
      case 'Shards': {
        const hi = Number(reward.UpperAmount ?? amount);
        const delta = rng.rangeInclusive(amount, hi);
        state.shards = Math.max(0, state.shards + delta);
        if (delta > 0) state.stats.totalShardsEarned += delta;
        else state.stats.totalShardsSpent += Math.abs(delta);
        break;
      }
      case 'ItemsFromPool': {
        const poolId = Number(reward.entryId ?? 3);
        const pool = catalog.poolEntries(catalog.itemPools, poolId, catalog.items);
        const count = Math.max(1, amount);
        for (let i = 0; i < count; i++) {
          const itemId = rng.weighted(pool) ?? [...catalog.items.keys()][0];
          if (itemId != null) grantItem(itemId);
        }
        break;
      }
      case 'RelicFromPool': {
        const poolId = Number(reward.entryId ?? 101);
        const pool = catalog.poolEntries(catalog.relicPools, poolId, catalog.relics)
          .filter(e => !hasRelic(e.id));
        const count = Math.max(1, amount);
        for (let i = 0; i < count; i++) {
          const relicId = rng.weighted(pool) ?? 3001;
          if (relicId != null) grantRelic(relicId, { heroUid: targetHero?.uid });
        }
        break;
      }
      case 'ActivateEnemyRelic': {
        const poolId = Number(reward.entryId ?? 83);
        let relicId = reward.specificRelicId;
        if (relicId == null) {
          const pool = catalog.poolEntries(catalog.relicPools, poolId, catalog.relics);
          relicId = rng.weighted(pool) ?? RESTED_RELIC_ID;
        }
        if (poolId === 83 || relicId === RESTED_RELIC_ID) {
          grantRelic(relicId, { temporary: true });
        } else {
          state.nextBattleEnemyRelics.push(Number(relicId));
        }
        break;
      }
      case 'GrantStatsToHero': {
        const poolId = Number(reward.entryId ?? 1);
        const pool = catalog.poolEntries(catalog.statModPools, poolId, catalog.statMods);
        const smId = pool.length ? rng.weighted(pool) : poolId;
        if (smId != null) {
          if (reward.allHeroes) {
            for (const h of state.heroes) applyStatModToHero(h, smId);
          } else {
            applyStatModToHero(targetHero, smId);
          }
        }
        break;
      }
      case 'HeroRankUp': {
        const candidate = (targetHero && targetHero.rank < state.maxHeroRank)
          ? targetHero
          : state.heroes.find(h => h.rank < state.maxHeroRank) || targetHero;
        if (candidate) rankUpHeroInternal(candidate, candidate.rank + 1);
        break;
      }
      case 'ReRollRankModifier': {
        const hero = targetHero || state.heroes[0];
        if (hero) {
          const targetRank = hero.rank >= 3 ? hero.rank : 2;
          const choiceObj = buildRankUpChoices(hero, targetRank);
          if (choiceObj) {
            choiceObj.retrain = true;
            enqueueRankUp(choiceObj);
          }
        }
        break;
      }
      case 'RestoreLife': {
        const healAmt = Number(campfireS.LifeRecoveredByRest ?? 15);
        if (!state.isStabilizerActive) {
          state.isStabilizerActive = true;
          state.lives = 2;
          state.accumulatedShards = healAmt;
        } else {
          state.accumulatedShards += healAmt;
        }
        break;
      }
      case 'RandomHeroOfClass':
      case 'HeroesFromPool': {
        const poolId = Number(reward.entryId ?? 1);
        const heroRank = clamp(Number(reward.HeroRank ?? 1), 1, state.maxHeroRank);
        const pool = catalog.poolEntries(catalog.heroPools, poolId, catalog.heroes);
        const heroId = rng.weighted(pool) ?? 1;
        addOrMergeHero(heroId, heroRank, { autoPlace: true });
        break;
      }
      case 'OneTimeRelicDiscount': {
        state.shopDiscounts.relic += Math.max(1, amount);
        break;
      }
      case 'OneTimeHeroDiscount': {
        state.shopDiscounts.hero += Math.max(1, amount);
        break;
      }
      case 'ClassEvent': {
        const heroClasses = state.heroes.flatMap(h => getHeroClasses(h));
        const targetClass = heroClasses[0] || 1;
        const classRelics = (catalog.classEventRelics.get(targetClass) || []).filter(id => !hasRelic(id));
        const picked = rng.pick(classRelics);
        if (picked) {
          grantRelic(picked, { heroUid: targetHero?.uid });
        } else {
          const pool = catalog.poolEntries(catalog.relicPools, 60, catalog.relics).filter(e => !hasRelic(e.id));
          const fallbackId = rng.weighted(pool);
          if (fallbackId) grantRelic(fallbackId, { heroUid: targetHero?.uid });
        }
        break;
      }
      case 'IncreaseEndlessModeScore': {
        state.endlessScore += Math.max(1, amount);
        break;
      }
      case 'QueueEventFight': {
        const group = reward.group || '1v1Fight';
        const wantEventDiff = 90 + stageDifficultyIndex;
        let candidates = [...catalog.stages.values()].filter(
          s => s.stageType === 'EventFight' && s.group === group && s.difficulty === wantEventDiff
        );
        if (candidates.length === 0) {
          candidates = [...catalog.stages.values()].filter(s => s.stageType === 'EventFight' && s.group === group);
        }
        const pickedStage = rng.pick(candidates) || [...catalog.stages.values()].find(s => s.stageType === 'EventFight');
        if (pickedStage) state.queuedEventFight = pickedStage.id;
        break;
      }
      case 'SkipCampfireChallenge':
      default:
        break;
    }
  }

  function chooseEventOption(choiceIndex = 0, opts = {}) {
    if (state.phase === BattleFlowState.Campfire) {
      return campfireAction(choiceIndex, opts?.heroUid ?? opts);
    }
    if (state.phase !== BattleFlowState.Event || !state.event) return getState();

    // If a Relic/Item sub-choice modal is already open in this event, resolve it
    if (state.pendingRelicChoices) {
      return pickRelic(choiceIndex);
    }
    if (state.pendingItemChoices) {
      return pickItem(choiceIndex);
    }

    const choices = state.event.choices || [];
    const idx = clamp(Number(choiceIndex) || 0, 0, Math.max(0, choices.length - 1));
    let choice = choices[idx];

    // If the requested choice costs more shards than the player currently has, do not grant unaffordable rewards
    if (choice && (choice.disabled || (choice.cost != null && Number(choice.cost) > state.shards))) {
      const fallbackFree = choices.find(c => !c.disabled && (c.cost == null || Number(c.cost) <= state.shards) && (!c.rewards || c.rewards.length === 0));
      choice = fallbackFree || null;
    }

    const heroUid = typeof opts === 'object' ? opts?.heroUid : opts;
    const targetHero = (heroUid != null ? state.heroes.find(h => String(h.uid) === String(heroUid)) : null) || state.heroes[0] || null;

    if (choice && Array.isArray(choice.rewards)) {
      for (const rw of choice.rewards) {
        applyEventReward(rw, targetHero);
      }
    }

    const pickedRelicId = typeof opts === 'object' && opts?.pickedRelicId != null ? Number(opts.pickedRelicId) : null;
    const pickedItemId = typeof opts === 'object' && opts?.pickedItemId != null ? Number(opts.pickedItemId) : null;

    // If this event choice has 3 relics: either directly grant the clicked relic icon, or open the 3-Relic picker modal
    if (choice && Array.isArray(choice.relicChoiceIds) && choice.relicChoiceIds.length > 0) {
      if (pickedRelicId != null && choice.relicChoiceIds.map(Number).includes(pickedRelicId)) {
        grantRelic(pickedRelicId, { heroUid: targetHero?.uid });
      } else {
        enqueueRelicChoice({
          title: L('CHOISISSEZ UNE RELIQUE', 'CHOOSE A RELIC'),
          subtitle: choice.title || state.event.name || L('Choisissez 1 Relique parmi 3', 'Choose 1 of 3 Relics'),
          choices: choice.relicChoiceIds.slice(),
          canSkip: false,
          advanceAfterPick: false,
          source: 'Event',
        });
      }
    }

    // If this event choice has 3 items: either directly grant the clicked item icon, or open the 3-Item picker modal
    if (choice && Array.isArray(choice.itemChoiceIds) && choice.itemChoiceIds.length > 0) {
      if (pickedItemId != null && choice.itemChoiceIds.map(Number).includes(pickedItemId)) {
        grantItem(pickedItemId, { autoEquip: true });
      } else {
        enqueueItemChoice({
          title: L('CHOISISSEZ UN OBJET', 'CHOOSE AN ITEM'),
          subtitle: choice.title || state.event.name || L('Choisissez 1 Objet parmi 3', 'Choose 1 of 3 Items'),
          choices: choice.itemChoiceIds.slice(),
          canSkip: false,
          advanceAfterPick: false,
          source: 'Event',
        });
      }
    }

    return advanceToNextFloor();
  }

  function campfireAction(actionOrObj = 'rest', heroUidArg = null) {
    if (state.phase !== BattleFlowState.Campfire && state.phase !== BattleFlowState.Event) {
      return getState();
    }
    if (!state.campfire) {
      openCampfireNode(600);
    }

    let action = actionOrObj;
    let heroUid = heroUidArg;
    if (actionOrObj && typeof actionOrObj === 'object') {
      action = actionOrObj.action ?? actionOrObj.type ?? actionOrObj.id ?? actionOrObj.index ?? 'rest';
      heroUid = actionOrObj.heroUid ?? heroUidArg;
    }
    if (typeof action === 'number') {
      action = ['train', 'study', 'recharge', 'rest', 'skip'][clamp(action, 0, 4)] || 'rest';
    }
    const actKey = String(action || 'rest').toLowerCase();

    const targetHero = (heroUid != null ? state.heroes.find(h => String(h.uid) === String(heroUid)) : null)
      || state.heroes.find(h => h.rank < state.maxHeroRank)
      || state.heroes[0]
      || null;

    if (actKey === 'skip' || actKey === 'leave' || actKey === 'proceed') {
      state.campfire.remainingActions = 0;
      return advanceToNextFloor();
    }

    if (actKey === 'train' || actKey === 'rankup') {
      if (!state.campfire.hasTrained && targetHero && targetHero.rank < state.maxHeroRank) {
        rankUpHeroInternal(targetHero, targetHero.rank + 1);
      }
      state.campfire.hasTrained = true;
    } else if (actKey === 'study' || actKey === 'retrain' || actKey === 'origin') {
      if (!state.campfire.hasStudied && targetHero) {
        const targetRank = targetHero.rank >= 3 ? targetHero.rank : 2;
        const choiceObj = buildRankUpChoices(targetHero, targetRank);
        if (choiceObj) {
          choiceObj.retrain = true;
          enqueueRankUp(choiceObj);
        }
      }
      state.campfire.hasStudied = true;
    } else if (actKey === 'recharge' || actKey === 'restore_life') {
      if (!state.campfire.hasRecharged) {
        const healAmt = Number(campfireS.LifeRecoveredByRest ?? 15);
        if (!state.isStabilizerActive) {
          state.isStabilizerActive = true;
          state.lives = 2;
          state.accumulatedShards = healAmt;
        } else {
          state.accumulatedShards += healAmt;
        }
      }
      state.campfire.hasRecharged = true;
    } else if (actKey === 'rest' || actKey === 'heal') {
      if (!state.campfire.hasRested) {
        const healAmt = Number(campfireS.LifeRecoveredByRest ?? 15);
        state.accumulatedShards += healAmt;
        grantRelic(RESTED_RELIC_ID, { temporary: true });
      }
      state.campfire.hasRested = true;
    }

    syncCampfireChoices();
    state.campfire.remainingActions = Math.max(0, (state.campfire.remainingActions ?? 1) - 1);
    if (state.campfire.remainingActions <= 0) {
      return advanceToNextFloor();
    }
    return getState();
  }

  function completeRun() {
    setPhase(BattleFlowState.Complete);
    return getState();
  }

  function enterEndless() {
    state.allowEndless = true;
    state.endlessFloorIndex = Math.max(0, state.endlessFloorIndex + 1);
    state.won = null;
    state.outcome = null;
    loadCurrentFloorStage();
    setPhase(BattleFlowState.Placement);
    return getState();
  }

  function proceed() {
    if (state.pendingRelicChoices) {
      return pickRelic(0);
    }
    if (state.pendingItemChoices) {
      return pickItem(0);
    }
    switch (state.phase) {
      case BattleFlowState.InitialSelection:
        return chooseInitial(0);
      case BattleFlowState.Intro:
        return startPlacement();
      case BattleFlowState.Result:
        return proceedFromResult();
      case BattleFlowState.Shop:
        return leaveShop();
      case BattleFlowState.Crossroads:
        return chooseCrossroads(0);
      case BattleFlowState.Event:
        return chooseEventOption(0);
      case BattleFlowState.Campfire:
        return campfireAction('skip');
      case BattleFlowState.Outro:
        return completeRun();
      default:
        return getState();
    }
  }

  // ---------------------------------------------------------------------------
  // Serialization & LocalStorage Save/Load
  // ---------------------------------------------------------------------------
  function serialize() {
    return cloneJson(state);
  }

  function hydrate(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return getState();
    state = {
      ...state,
      ...cloneJson(snapshot),
    };
    // Auto-recover any saved Endless Mode run that lost due to the pre-fix floor=13 exponential scaling bug (>50M damage)
    if (state.endlessFloorIndex >= 0 && state.lastResult && state.lastResult.winner === 'enemies') {
      const perUnit = state.lastResult.stats?.perUnit || {};
      const hadBuggedOneTap = Object.values(perUnit).some(
        u => (Number(u?.damageTaken) || 0) > 50_000_000 || (Number(u?.damageDealt) || 0) > 50_000_000
      );
      if (hadBuggedOneTap) {
        state.lives = Math.max(1, state.lives || 1);
        state.isOutOfLives = false;
        state.outcome = null;
        state.lastResult = null;
        if (state.stats && state.stats.fightsLost > 0) {
          state.stats.fightsLost -= 1;
        }
        loadCurrentFloorStage();
        setPhase(BattleFlowState.Placement);
      }
    }
    return getState();
  }

  function save(storageKey = SAVE_STORAGE_KEY) {
    const payload = serialize();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      }
    } catch { /* ignore storage quota/SSR errors */ }
    return payload;
  }

  function load(storageKey = SAVE_STORAGE_KEY) {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          return hydrate(JSON.parse(raw));
        }
      }
    } catch { /* ignore */ }
    return getState();
  }

  // ---------------------------------------------------------------------------
  // Co-Op Trading & Squad Relic Sync
  // ---------------------------------------------------------------------------
  function coopAddShards(delta) {
    const d = Math.round(Number(delta) || 0);
    state.shards = Math.max(0, state.shards + d);
    if (d > 0) state.stats.totalShardsEarned = (state.stats.totalShardsEarned || 0) + d;
    return getState();
  }

  function coopSendItem(itemUidOrId) {
    let idx = state.inventory.findIndex(it => String(it.uid) === String(itemUidOrId) || Number(it.itemId) === Number(itemUidOrId));
    if (idx >= 0) {
      const [removed] = state.inventory.splice(idx, 1);
      return { ok: true, itemId: removed.itemId, state: getState() };
    }
    for (const h of state.heroes) {
      const hIdx = (h.items || []).findIndex(it => String(it.uid) === String(itemUidOrId) || Number(it.itemId) === Number(itemUidOrId));
      if (hIdx >= 0) {
        const [removed] = h.items.splice(hIdx, 1);
        return { ok: true, itemId: removed.itemId, state: getState() };
      }
    }
    return { ok: false, state: getState() };
  }

  function coopSendHero(heroUid) {
    const idx = state.heroes.findIndex(h => String(h.uid) === String(heroUid));
    if (idx < 0) return { ok: false, state: getState() };
    if (state.heroes.length <= 1) return { ok: false, reason: 'last_hero', state: getState() };
    const [removed] = state.heroes.splice(idx, 1);
    for (const it of removed.items || []) {
      state.inventory.push(it);
    }
    // Ensure at least 1 hero is on board
    if (!state.heroes.some(h => h.onBoard) && state.heroes.length > 0) {
      state.heroes[0].onBoard = true;
      state.heroes[0].x = 3;
      state.heroes[0].y = 5;
    }
    return {
      ok: true,
      hero: { heroId: removed.heroId, rank: removed.rank || 1 },
      state: getState(),
    };
  }

  function coopReceiveGift(gift = {}) {
    if (!gift || typeof gift !== 'object') return getState();
    if (gift.kind === 'shards') {
      const amt = Math.max(1, Math.round(Number(gift.amount) || 5));
      state.shards += amt;
      state.stats.totalShardsEarned = (state.stats.totalShardsEarned || 0) + amt;
    } else if (gift.kind === 'item' && gift.itemId != null) {
      grantItem(Number(gift.itemId));
    } else if (gift.kind === 'hero' && gift.heroId != null) {
      addOrMergeHero(Number(gift.heroId), Number(gift.rank) || 1, { autoPlace: true });
    }
    return getState();
  }

  function coopSyncPartnerRelics(relicList = []) {
    state.partnerRelics = Array.isArray(relicList) ? relicList.slice() : [];
    return getState();
  }

  return {
    catalog,
    getState,
    refreshLocale,
    // Co-Op
    coopAddShards,
    coopSendItem,
    coopSendHero,
    coopReceiveGift,
    coopSyncPartnerRelics,
    // Initial draft
    chooseInitial,
    selectInitial: chooseInitial,
    pickInitial: chooseInitial,
    rerollInitial,
    // Intro & Placement
    startPlacement,
    finishIntro: startPlacement,
    proceedFromIntro: startPlacement,
    placeHero,
    moveHero: placeHero,
    deployHero: placeHero,
    swapHeroes,
    benchHero,
    unplaceHero: benchHero,
    moveToBench: benchHero,
    equipItem,
    giveItem: equipItem,
    unequipItem,
    removeItem: unequipItem,
    // Combat Resolution & Result
    startBattle,
    finishBattle,
    proceedFromResult,
    // Shop & Economy
    openShop,
    buyHero,
    purchaseHero: buyHero,
    buyItem,
    purchaseItem: buyItem,
    buyRelic,
    purchaseRelic: buyRelic,
    reroll,
    rerollShop: reroll,
    freeze,
    toggleFreeze: freeze,
    freezeShop: freeze,
    sellHero,
    sellItem,
    buyTeamSize,
    upgradeTeamSize: buyTeamSize,
    leaveShop,
    closeShop: leaveShop,
    // Rank-up, Specializations & Relic/Item Picker
    rankUpChoice,
    chooseRankUp: rankUpChoice,
    selectSpecialization: rankUpChoice,
    chooseSpecialization,
    pickRelic,
    chooseRelic: pickRelic,
    skipRelicReward,
    pickItem,
    chooseItem: pickItem,
    skipItemReward,
    grantRelic,
    grantItem,
    completeRelicQuest,
    completeItemQuest,
    addOrMergeHero,
    // Crossroads, Events & Campfire
    openCrossroads,
    chooseCrossroads,
    selectCrossroads: chooseCrossroads,
    pickCrossroads: chooseCrossroads,
    openEventNode,
    openCampfireNode,
    chooseEventOption,
    selectEventChoice: chooseEventOption,
    chooseEvent: chooseEventOption,
    campfireAction,
    // Outro, Endless & Generic step
    completeRun,
    enterEndless,
    proceed,
    next: proceed,
    // Persistence
    serialize,
    hydrate,
    save,
    load,
  };
}

export function loadRun({ data = {}, storageKey = SAVE_STORAGE_KEY } = {}) {
  const run = createRun({ data });
  run.load(storageKey);
  return run;
}

export function hasSavedRun(storageKey = SAVE_STORAGE_KEY) {
  try {
    if (typeof localStorage !== 'undefined') {
      return !!localStorage.getItem(storageKey);
    }
  } catch { /* ignore */ }
  return false;
}

export function clearSavedRun(storageKey = SAVE_STORAGE_KEY) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(storageKey);
    }
  } catch { /* ignore */ }
}
