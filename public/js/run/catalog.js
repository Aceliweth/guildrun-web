// Catalog: normalizes whatever shape game_data.json has (CONTRACT shape, or raw balancing `sheets`) into
// fast lookup tables used by the run state machine. Every accessor tolerates missing fields.
//
// Source-of-truth: numbers come from data.singletons / sheets (raw balancing_data.json values).
// FALLBACK_* constants below are only used when game_data.json lacks the section entirely; they MIRROR the raw
// values of re_data/balancing_data.json (verified 2026-10, not the *_spec.md defaults).

// ---------------------------------------------------------------------------------------------------------------
// Fallbacks mirroring balancing_data.json
// ---------------------------------------------------------------------------------------------------------------
export const FALLBACK_SINGLETONS = {
  PlayerSingleton: { StartingShards: 15, StartingAccumulatedShards: 10, AccumulatedShardsPerFightWon: 10 },
  RewardSelectionSingleton: { InitialSelectionSize: 3, initialSelectionHeroPoolID: 1, basicInitialSelectionRelicPoolID: 200, specialInitialSelectionRelicPoolID: 201, ShardRewardPerSurvivingHero: 2, StartingBonusTokens: 0, MaxBonusTokens: 4 },
  CampfireSingleton: { DefaultStartingActions: 2, LifeRecoveredByRest: 15, OriginChoiceCount: 6 },
  HeroesSingleton: { StartingMaxHeroesOnBoard: 3, MaxTotalHeroes: 6, MaxItemSlots: 6, MaxHeroRank: 4 },
  EquipmentSingleton: { BaseCharacterEquipmentLimit: 3 },
  EventsSingleton: { maxRankUpPerChunk: [{ Chunk: 0, MaxRank: 1 }, { Chunk: 1, MaxRank: 2 }], RelicsToShowOnClassEvent: 4, ClassEventSettings: [] },
  ShopSingleton: {
    ShardInterestInterval: 5, MaxShardInterest: 20, RandomSaleDiscount: 0.25,
    HeroChoicesPerShop: 3, HeroChoicesPerSuperShop: 3, ItemChoicesPerShop: 2, ItemChoicesPerSuperShop: 4,
    RelicChoicesPerShop: 1, RelicChoicesPerSuperShop: 3, BaseTeamSizeCost: 25, BaseRerollCost: 1, RerollCostIncrement: 1,
    TeamSizeIncrementCost: 50, SuperShopBaseRerollCost: 7, FallbackSellMultiplier: 0.660004, guaranteedTeamSizeIncreaseRelicId: 4500,
    TeamSizeIncreaseRarityTypes: ['LegendaryQuest', 'TeamSize'],
    heroRankChances: [[0, 1, 85], [0, 2, 0], [0, 3, -10], [0, 4, 0], [1, 1, 45], [1, 2, 50], [1, 3, 5], [1, 4, -10]].map(([c, e, v]) => ({ ChunkIndex: c, Element: e, Chance: v })),
    itemRarityChances: [[0, 'Common', 66], [0, 'Rare', 33], [0, 'Epic', -10], [1, 'Common', 33], [1, 'Rare', 66], [1, 'Epic', 1]].map(([c, e, v]) => ({ ChunkIndex: c, Element: e, Chance: v })),
    relicRarityChances: [[0, 'Common', 66], [0, 'Rare', 33], [0, 'Epic', -5], [1, 'Common', 33], [1, 'Rare', 66], [1, 'Epic', 1]].map(([c, e, v]) => ({ ChunkIndex: c, Element: e, Chance: v })),
    heroRankChanceIncreases: [{ ChunkIndex: 0, Element: 3, Chance: 2.5 }, { ChunkIndex: 1, Element: 4, Chance: 2.5 }, { ChunkIndex: 0, Element: 2, Chance: 10 }],
    itemRarityChanceIncreases: [{ ChunkIndex: 0, Element: 'Epic', Chance: 5 }, { ChunkIndex: 1, Element: 'Epic', Chance: 10 }],
    relicRarityChanceIncreases: [{ ChunkIndex: 0, Element: 'Epic', Chance: 5 }, { ChunkIndex: 1, Element: 'Epic', Chance: 10 }],
    heroRankCosts: [{ Element: 1, Value: 15 }, { Element: 2, Value: 25 }, { Element: 3, Value: 35 }, { Element: 4, Value: 45 }],
    itemRarityCosts: [{ Element: 'Common', Value: 5 }, { Element: 'Rare', Value: 15 }, { Element: 'Epic', Value: 25 }, { Element: 'Unique', Value: 5 }],
    relicRarityCosts: [['Common', 10], ['Rare', 20], ['Epic', 30], ['Legendary', 40], ['CommonQuest', 15], ['RareQuest', 20], ['EpicQuest', 25], ['LegendaryQuest', 25], ['TeamSize', 40]].map(([e, v]) => ({ Element: e, Value: v })),
    heroRankResaleMultipliers: [], itemRarityResaleMultipliers: [], superShopHeroRankResaleMultipliers: [], superShopItemRarityResaleMultipliers: [],
    guaranteedRelicsOfRarity: [{ Rarity: 'Legendary', Count: 1 }, { Rarity: 'LegendaryQuest', Count: 1 }],
    guaranteedItemsOfRarity: [{ Rarity: 'Epic', Count: 1 }],
    superShopHeroRankChances: [[0, 1, 30], [0, 2, 50], [0, 3, 20], [0, 4, 0], [1, 1, 15], [1, 2, 40], [1, 3, 40], [1, 4, 5]].map(([c, e, v]) => ({ ChunkIndex: c, Element: e, Chance: v })),
    superShopItemRarityChances: [[0, 'Common', 30], [0, 'Rare', 50], [0, 'Epic', 20], [1, 'Common', 10], [1, 'Rare', 60], [1, 'Epic', 30]].map(([c, e, v]) => ({ ChunkIndex: c, Element: e, Chance: v })),
    superShopRelicRarityChances: [[0, 'Common', 30], [0, 'Rare', 50], [0, 'Epic', 20], [0, 'Legendary', 0], [1, 'Common', 10], [1, 'Rare', 60], [1, 'Epic', 30], [1, 'Legendary', 0]].map(([c, e, v]) => ({ ChunkIndex: c, Element: e, Chance: v })),
  },
  DifficultiesSingleton: {
    difficulties: [
      { StageDifficultyIndex: 1, modifiers: [] },
      { StageDifficultyIndex: 1, modifiers: [{ name: 'HeroesStartBattlesDamagedEntry' }] },
      { StageDifficultyIndex: 2, modifiers: [] },
      { StageDifficultyIndex: 2, modifiers: [{ name: 'SurvivingHeroRewardDeltaEntry' }] },
      { StageDifficultyIndex: 2, modifiers: [{ name: 'HeroItemSlotsPerRankEntry' }] },
      { StageDifficultyIndex: 3, modifiers: [] },
      { StageDifficultyIndex: 3, modifiers: [{ name: 'ActBossRelicEntry' }] },
    ],
  },
};

export const FALLBACK_DIFFICULTY_MODIFIERS = [
  { Title: 'ActBossRelicEntry', stageRelicPairs: [{ StageId: 30601, RelicId: 7000 }, { StageId: 30602, RelicId: 7001 }, { StageId: 301301, RelicId: 7002 }, { StageId: 301303, RelicId: 7003 }, { StageId: 301302, RelicId: 7004 }], fallbackRelicId: 7000 },
  { Title: 'HeroItemSlotDeltaEntry', ItemSlotDelta: -1 },
  { Title: 'HeroItemSlotsPerRankEntry' },
  { Title: 'HeroesStartBattlesDamagedEntry', HealthPercentage: 0.899994 },
  { Title: 'ShardStabilizerStartingValueOverrideEntry', StartingValue: 5 },
  { Title: 'ShopAntiSaleEntry', PriceIncreasePercentage: 0.25, AntiSaleChance: 0.5 },
  { Title: 'ShopRerollCostDeltaEntry', CostDelta: 1 },
  { Title: 'SurvivingHeroRewardDeltaEntry', RewardDelta: -1 },
];

// Act1Entry (singletons.ActEntry) mirrored
export const FALLBACK_ACT_ENTRY = {
  Title: 'Act1Entry', endlessCrossroadsId: 123, fightCrossroadsPerRun: 1, fightCrossroadsChance: 0.330002,
  ActChunks: [
    { regularCrossroadsPoolId: 5, randomCrossroadsPoolId: 10, FloorNodes: [
      { FightType: 'SpecificStage', specificId: 10000, EventOverrideType: 'SpecificCrossroads', crossroadsId: 23, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'CrossroadsFromPool', crossroadsId: 6, StageModifierCrossroadsData: { ModifierChoices: [{ enemyRelicPoolId: 70, rewardRelicPoolIds: [105, 106, 107] }] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'StageModifierChoice', crossroadsId: 12, StageModifierCrossroadsData: { ModifierChoices: [{ enemyRelicPoolId: 70, rewardRelicPoolIds: [105, 106, 107] }] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 10401, EventOverrideType: 'CrossroadsFromPool', crossroadsId: 7, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: 34 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'SpecificCrossroads', crossroadsId: 50, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'NoCrossroads', crossroadsId: 53, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: -1 },
    ] },
    { regularCrossroadsPoolId: 6, randomCrossroadsPoolId: 11, FloorNodes: [
      { FightType: 'RandomFromPoolingLogic', specificId: 10000, EventOverrideType: 'CrossroadsFromPool', crossroadsId: 8, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: 35 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'StageModifierChoice', crossroadsId: 113, StageModifierCrossroadsData: { ModifierChoices: [{ enemyRelicPoolId: 71, rewardRelicPoolIds: [108, 109, 110] }] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'SpecificCrossroads', crossroadsId: 113, StageModifierCrossroadsData: { ModifierChoices: [{ enemyRelicPoolId: 71, rewardRelicPoolIds: [108, 109, 110] }] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 10401, EventOverrideType: 'CrossroadsFromPool', crossroadsId: 9, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: 36 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'SpecificCrossroads', crossroadsId: 53, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: -1 },
      { FightType: 'RandomFromPoolingLogic', specificId: 0, EventOverrideType: 'NoCrossroads', crossroadsId: 53, StageModifierCrossroadsData: { ModifierChoices: [] }, fightCrossroadsId: -1 },
    ] },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------
const ENUM_RARITY = ['None', 'Common', 'Rare', 'Epic', 'Unique', 'UniqueRare', 'Legendary', 'Enemy', 'CommonQuest', 'RareQuest', 'EpicQuest', 'LegendaryQuest', 'SingleBattleBoost', 'ActBoss', 'TeamSize'];
const ENUM_STAGE_TYPE = { 0: 'None', 1: 'Normal', 2: 'MiniBoss', 3: 'Boss', 10: 'EventFight', 50: 'Endless' };
const ENUM_FLOOR_FIGHT = ['RandomFromPoolingLogic', 'SpecificStage'];
const ENUM_EVENT_OVERRIDE = ['None', 'NoCrossroads', 'SpecificCrossroads', 'StageModifierChoice', 'CrossroadsFromPool'];
const ENUM_PATH = ['None', 'Event', 'Stage', 'StageModifier'];

export function pick(o, ...names) {
  if (!o || typeof o !== 'object') return undefined;
  for (const n of names) if (o[n] !== undefined && o[n] !== null) return o[n];
  return undefined;
}
function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function entryId(e) {
  if (e == null) return undefined;
  if (typeof e === 'number') return e;
  if (typeof e === 'string') return Number(e);
  const id = pick(e, 'id', 'Id');
  if (typeof id === 'object' && id) return num(id.id, undefined);
  return id === undefined ? undefined : num(id, undefined);
}
function toList(coll) {
  if (!coll) return [];
  if (Array.isArray(coll)) return coll;
  if (typeof coll === 'object') {
    if (Array.isArray(coll.Entries)) return coll.Entries;
    return Object.entries(coll).map(([k, v]) => (v && typeof v === 'object' && entryId(v) === undefined ? { ...v, id: num(k) } : v));
  }
  return [];
}
function enumName(v, table) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Array.isArray(table) ? table[v] : table[v];
  return undefined;
}
function locText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.text || v.en || v.key || '';
}
function locKey(v) { return v && typeof v === 'object' ? v.key || '' : ''; }

function normWeightedList(raw) {
  if (!raw) return [];
  let arr = null;
  if (Array.isArray(raw)) arr = raw;
  else {
    for (const k of ['entries', 'elements', 'WeightedRewards', 'WeightedRelics', 'WeightedEvents', 'WeightedRankModifiers', 'WeightedStatMods', 'WeightedCrossroads', 'WeightedFights', 'weighted', 'ids', 'items', 'heroes', 'relics', 'events'])
      if (Array.isArray(raw[k])) { arr = raw[k]; break; }
    if (!arr) for (const v of Object.values(raw)) if (Array.isArray(v) && v.length && (typeof v[0] === 'number' || typeof v[0] === 'object')) { arr = v; break; }
  }
  if (!arr) return [];
  return arr.map(e => {
    if (typeof e === 'number' || typeof e === 'string') return { id: num(e), weight: 10 };
    const id = pick(e, 'elementId', 'relicId', 'eventID', 'eventId', 'heroId', 'itemId', 'statModId', 'rankModifierId', 'crossroadsId', 'id');
    const idn = typeof id === 'object' && id ? num(id.id) : num(id, NaN);
    return { id: idn, weight: num(pick(e, 'Weight', 'weight'), 10) };
  }).filter(e => Number.isFinite(e.id));
}

function normPools(rawColl) {
  const map = new Map();
  for (const p of toList(rawColl)) {
    const id = entryId(p);
    if (id === undefined) continue;
    map.set(id, {
      id,
      title: pick(p, 'title', 'name') || '',
      disabled: !!pick(p, 'DisabledInGame', 'disabled'),
      targetClassId: num(pick(p, 'targetClassID', 'targetClassId', 'classId'), 0),
      targetRank: num(pick(p, 'TargetRank', 'targetRank', 'rank'), 0),
      entries: normWeightedList(p),
    });
  }
  return map;
}

function normReward(r) {
  if (!r) return null;
  const shards = Array.isArray(r.shards) ? r.shards : null;
  const range = pick(r, 'GoldRewardRange', 'goldRewardRange', 'gold') || {};
  const min = shards && shards[0] != null
    ? num(shards[0], 0)
    : num(pick(range, 'FromInclusive', 'min', 'from'), num(pick(r, 'minGold', 'MinGoldReward'), 0));
  const max = shards && shards[1] != null
    ? num(shards[1], min)
    : num(pick(range, 'ToInclusive', 'max', 'to'), num(pick(r, 'maxGold', 'MaxGoldReward'), min));
  return {
    min, max,
    heroPool: num(pick(r, 'HeroPool', 'heroPool', 'heroPoolId'), -1),
    itemPool: num(pick(r, 'EquipmentPool', 'itemPool', 'equipmentPool', 'itemPoolId'), -1),
    relicPool: num(pick(r, 'RelicPool', 'relicPool', 'relicPoolId'), 0),
  };
}

function deriveStageDifficulty(id) {
  // Stage ids encode difficulty in their leading digit(s): 1xxxx/2xxxx/3xxxx, 1xxxxx/2xxxxx/3xxxxx.
  if (id >= 100000) return Math.floor(id / 100000);
  if (id >= 10000 && id < 40000) return Math.floor(id / 10000);
  return 0;
}

// Synthesized choices for C# EventLogic-driven events that have empty EventChoices in EventSheetHolder
// (verified against re_data/scopes_data.json event_catalog and re_data/localization.json tables.Events).
const SYNTHESIZED_EVENT_CHOICES = {
  500: [
    { title: 'Claim Class Relic', text: 'Get a class relic for your guild.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 60 }] },
  ],
  503: [
    { title: 'Take Item', text: 'Get {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 39 }] },
    { title: 'Take Relic', text: 'Get {name}.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 61 }] },
  ],
  504: [
    { title: 'Take Item', text: 'Get {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 40 }] },
    { title: 'Take Relic', text: 'Get {name}.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 62 }] },
  ],
  505: [
    { title: 'Take Item', text: 'Get {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 41 }] },
    { title: 'Take Relic', text: 'Get {name}.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 63 }] },
  ],
  506: [
    { title: 'Shard Starter Kit', text: 'Receive [15 Shards]<shard> for your guild.', rewards: [{ type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 15, UpperAmount: 15 }] },
    { title: 'Equipment Starter Kit', text: 'Receive 1 Common Item and [5 Shards]<shard>.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 3 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 5, UpperAmount: 5 }] },
    { title: 'Training Starter Kit', text: 'Grant a Small Stat Bonus to a Hero and [5 Shards]<shard>.', rewards: [{ type: 'StatModEventChoiceReward', RewardType: 'GrantStatsToHero', Amount: 1, entryId: 1 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 5, UpperAmount: 5 }] },
  ],
  1022: [
    { title: 'Take Item', text: 'Get an item for [{class}]<bold>: {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 38 }] },
    { title: 'Take Relic', text: 'Get a relic for [{class}]<bold>: {name}.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 60 }] },
  ],
  1023: [
    { title: 'Take Item', text: 'Gain a {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 38 }] },
    { title: 'Take Item', text: 'Gain a {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 38 }] },
    { title: 'Take Item', text: 'Gain a {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 38 }] },
  ],
  1024: [
    { title: 'Meditate', text: 'Choose a {rank}-rank or lower Hero to rank up. Your Heroes lose [{statlosspercent}% basic stats]<basicstat> for the next {combatcount} combats.', rewards: [{ type: 'EventChoiceReward', RewardType: 'HeroRankUp', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5112 }] },
    { title: 'Investigate', text: 'Gain a {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 112 }] },
    { title: 'Investigate', text: 'Gain a {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 110 }] },
  ],
  1025: [
    { title: 'Green Path', text: 'Get {name} after winning {combatcount} combat(s).', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 101 }] },
    { title: 'Blue Path', text: 'Get {name} after winning {combatcount} combat(s).', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 102 }] },
    { title: 'Purple Path', text: 'Get {name} after winning {combatcount} combat(s).', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 2 }] },
    { title: 'Golden Path', text: 'Get {name} after winning {combatcount} combat(s).', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 1 }] },
  ],
  1026: [
    { title: 'Ignore', text: 'The Act Boss will reward [{shardbonus} more Shards]<shard>.', rewards: [{ type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5113 }] },
    { title: 'Bold', text: 'Choose from {itemcount} [rare items]<rare>. Your Heroes take damage equal to [{damagepercent}% of their Max HP]<maxhp> at the start of the next combat.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 3, entryId: 2 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5115 }] },
    { title: 'Reckless', text: 'Choose from {itemcount} [epic items]<epic>. Your Heroes take damage equal to [{damagepercent}% of their Max HP]<maxhp> at the start of the next combat.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 3, entryId: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5127 }] },
  ],
  1027: [
    { title: 'Meadow', text: 'Gain a {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 112 }] },
    { title: 'Chasm', text: 'Gain [{shardbonus} more Shards]<shard> per combat victory for the next {combatcount} combats, but your Heroes lose [{statlosspercent}% basic stats]<basicstat> for these combats.', rewards: [{ type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5116 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 10, UpperAmount: 10 }] },
    { title: 'Forest', text: 'Choose from {reliccount} [epic relics]<epic>. Get the relic after your next combat victory. Heroes lose [{statlosspercent}% basic stats]<basicstat> for that combat.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 3, entryId: 103 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5117 }] },
  ],
  1028: [
    { title: 'Safe', text: 'Gain {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 3 }] },
    { title: 'Seek Item', text: 'Gain {name} after winning next combat. Heroes start that combat with [Poison]<poison> equal to [{poisonpercent}% of their Max HP]<maxhp>.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5118 }] },
    { title: 'Seek Relic', text: 'Gain {name} after winning your next combat. Earn no [Shards]<shard> for that combat victory.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 103 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5119 }] },
  ],
  1029: [
    { title: 'Drink', text: 'Grant a Small Stat Bonus to a Hero and gain [10 Shards]<shard>.', rewards: [{ type: 'StatModEventChoiceReward', RewardType: 'GrantStatsToHero', Amount: 1, entryId: 1 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 10, UpperAmount: 10 }] },
    { title: 'Drink More', text: 'Gamble for {name}, but earn [5 fewer Shards]<shard> on your next combat victory.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 102 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5125 }] },
    { title: 'Leave', text: 'Walk away from the well.', rewards: [] },
  ],
  1030: [
    { title: 'First Debt', text: 'Choose from {reliccount} [common relics]<common>. Earn [{shards} fewer Shards]<shard> for your next combat victory.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 3, entryId: 101 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5121 }] },
    { title: 'Second Debt', text: 'Choose from {reliccount} [rare relics]<rare>. Earn [{shards} fewer Shards]<shard> for your next combat victory.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 3, entryId: 102 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5122 }] },
    { title: 'Final Debt', text: 'Choose from {reliccount} [epic relics]<epic>. Earn [{shards} fewer Shards]<shard> for your next combat victory. Your Heroes take damage equal to [{damagepercent}% of their Max HP]<maxhp> at the start of every combat.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 3, entryId: 103 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 798 }] },
    { title: 'Walk Away', text: 'Decline the offer.', rewards: [] },
  ],
  1031: [
    { title: 'Left', text: 'Open the left urn to claim {relic}.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 102 }] },
    { title: 'Center', text: 'Open the center urn to claim [{shards} Shards]<shard>.', rewards: [{ type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 15, UpperAmount: 15 }] },
    { title: 'Right', text: 'Open the right urn to claim {name}.', rewards: [{ type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 2 }] },
  ],
  1032: [
    { title: 'Shards', text: 'Defeat the creature in 1v1 combat to gain [{shards} Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: '1v1Fight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5500 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 20, UpperAmount: 20 }] },
    { title: 'Item', text: 'Defeat the creature in 1v1 combat to gain {name}.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: '1v1Fight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5502 }, { type: 'EquipmentPoolEventChoiceReward', RewardType: 'ItemsFromPool', Amount: 1, entryId: 1 }] },
    { title: 'Relic', text: 'Defeat the creature in 1v1 combat to gain {name}.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: '1v1Fight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5501 }, { type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 102 }] },
  ],
  1033: [
    { title: '30s', text: 'Survive for 30 seconds to gain [10 Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'SurvivalFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5503 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 10, UpperAmount: 10 }] },
    { title: '40s', text: 'Survive for 40 seconds to gain [20 Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'SurvivalFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5504 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 20, UpperAmount: 20 }] },
    { title: '50s', text: 'Survive for 50 seconds to gain [30 Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'SurvivalFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5505 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 30, UpperAmount: 30 }] },
  ],
  1034: [
    { title: 'Fight', text: 'Defeat the creature to gain [10 Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'DealDamageFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5506 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 10, UpperAmount: 10 }] },
    { title: 'Fight Tougher', text: 'Defeat the creature with [+100% Max HP]<maxhp> to gain [20 Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'DealDamageFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5507 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 20, UpperAmount: 20 }] },
    { title: 'Fight Toughest', text: 'Defeat the creature with [+200% Max HP]<maxhp> to gain [30 Shards]<shard>.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'DealDamageFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5508 }, { type: 'RangeEventChoiceReward', RewardType: 'Shards', Amount: 30, UpperAmount: 30 }] },
  ],
  1035: [
    { title: 'Alone', text: 'Defeat the {bossname} in 1v1 combat to gain {relicname}. The Hero will have [{statreduction}% reduced basic stats]<basicstat> for this combat.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'HydraFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5509 }, { type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 103 }] },
    { title: 'Rushed', text: 'Defeat the {bossname} within {timelimit} seconds to get {relicname}.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'HydraFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5510 }, { type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 103 }] },
    { title: 'Scared', text: 'Defeat the {bossname} to get {relicname}. Your Heroes will have [{statreduction}% reduced basic stats]<basicstat> for this combat.', rewards: [{ type: 'EventChoiceReward', RewardType: 'QueueEventFight', group: 'HydraFight', Amount: 1 }, { type: 'SpecificRelicReward', RewardType: 'SpecificRelic', relicId: 5511 }, { type: 'RelicPoolEventChoiceReward', RewardType: 'RelicFromPool', Amount: 1, entryId: 103 }] },
  ],
  1036: [
    { title: 'Rest', text: 'Heroes gain [+{statbonus}% basic stats]<basicstat> next combat.', rewards: [{ type: 'RelicPoolEventChoiceReward', RewardType: 'ActivateEnemyRelic', Amount: 1, entryId: 83 }, { type: 'EventChoiceReward', RewardType: 'RestoreLife', Amount: 1 }] },
  ],
};

// Metadata fallbacks for events that have null text or crossroadsDescription in game_data.json
const EVENT_METADATA_FALLBACKS = {
  600: { text: 'Rest by the campfire and prepare your Heroes for the battles ahead.', crossroadsDescription: 'Perform [2]<bold> Campfire actions: Train, Study, Recharge, or Rest.' },
  601: { text: 'Rest by the campfire and prepare your Heroes for the battles ahead.', crossroadsDescription: 'Perform [2]<bold> Campfire actions: Train, Study, Recharge, or Rest.' },
  780: { text: 'Choose an [Epic Item]<epic> to claim for your guild.', crossroadsDescription: 'Choose from [3]<bold> [Epic Items]<epic>.' },
  800: { text: 'A wandering Warrior offers to join your guild.' },
  801: { text: 'A wandering Tank offers to join your guild.' },
  802: { text: 'A wandering Vanguard offers to join your guild.' },
  803: { text: 'A wandering Assassin offers to join your guild.' },
  804: { text: 'A wandering Duelist offers to join your guild.' },
  805: { text: 'A wandering Mystic offers to join your guild.' },
  806: { text: 'A wandering Mage offers to join your guild.' },
  809: { text: 'A wandering Hero offers to join your guild.' },
  810: { text: 'You discover a glittering pile of Shards along the path.', crossroadsDescription: 'Get [10 Shards]<shard>.' },
  811: { text: 'You discover a large cache of Shards hidden among the rocks.', crossroadsDescription: 'Get [20 Shards]<shard>.' },
  812: { text: 'You pry open a heavy chest overflowing with Shards.', crossroadsDescription: 'Get [30 Shards]<shard>.' },
  819: { text: 'You find a piece of equipment left behind by a previous expedition.' },
  820: { text: 'You find a finely crafted piece of rare equipment.' },
  821: { text: 'You unearth a masterwork piece of epic equipment.' },
  822: { text: 'You stumble upon an abandoned supply crate filled with gear.' },
  830: { text: 'An ancient relic rests upon a weathered pedestal.' },
  831: { text: 'A rare relic radiates power from within a crystal shrine.' },
  832: { text: 'An epic relic of immense power floats above an altar.' },
  840: { text: 'An inscribed quest relic awaits a worthy guild.' },
  841: { text: 'A rare quest relic hums with untold potential.' },
  850: { text: 'A surge of Rift mastery allows one of your Heroes to ascend in rank.' },
  870: { text: 'A shrine dedicated to Warriors offers its blessing.' },
  871: { text: 'A shrine dedicated to Tanks offers its blessing.' },
  872: { text: 'A shrine dedicated to Vanguards offers its blessing.' },
  873: { text: 'A shrine dedicated to Assassins offers its blessing.' },
  874: { text: 'A shrine dedicated to Duelists offers its blessing.' },
  875: { text: 'A shrine dedicated to Mystics offers its blessing.' },
  876: { text: 'A shrine dedicated to Mages offers its blessing.' },
  877: { text: 'A shrine attuned to your guild\'s classes offers a relic.' },
  890: { text: 'A seasoned C-Rank adventurer offers to join your party.' },
  891: { text: 'A veteran B-Rank adventurer offers to join your party.' },
  892: { text: 'A minor Rift blessing enhances one of your Heroes.' },
  893: { text: 'A potent Rift blessing strengthens one of your Heroes.' },
  894: { text: 'A major Rift blessing empowers one of your Heroes.' },
  895: { text: 'An ancient tome allows a Hero to retrain their specialization or rank bonus.' },
  896: { text: 'A crystalline wellspring restores energy to your Shard Stabilizer.' },
  897: { text: 'Choose whether to promote a Hero to a higher rank or retrain their abilities.' },
  898: { text: 'Choose whether to promote a Hero to a higher rank or retrain their abilities.' },
  902: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Attack.' },
  903: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Max HP.' },
  904: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Defense.' },
  905: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Crit.' },
  906: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Attack Speed.' },
  907: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Mana Regen.' },
  908: { text: 'Channel the Rift\'s energy to permanently boost a Hero\'s Magic.' },
  909: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Attack.' },
  910: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Max HP.' },
  911: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Defense.' },
  912: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Crit.' },
  913: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Attack Speed.' },
  914: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Mana Regen.' },
  915: { text: 'A strong surge of Rift energy permanently boosts a Hero\'s Magic.' },
  1013: { crossroadsDescription: 'Choose a [Class Banner Relic]<rare> for your guild.' },
  1016: { text: 'A wandering Hero crosses your path and offers to join your cause.' },
  1022: { crossroadsDescription: 'Get a class [Item]<bold> or [Relic]<bold>.' },
  1023: { crossroadsDescription: 'Choose a [Signature Item]<rare> for your Heroes\' classes.' },
  1024: { crossroadsDescription: 'Rank up a Hero or claim a [Crystal]<rare> item.' },
  1025: { crossroadsDescription: 'Follow a path to earn a [Relic]<rare> or [Item]<epic>.' },
  1026: { crossroadsDescription: 'Risk starting damage next combat to choose from [3 Rare or Epic Items]<epic>.' },
  1027: { crossroadsDescription: 'Choose between a [Crystal]<rare>, extra [Shards]<shard>, or an [Epic Relic]<epic>.' },
  1028: { crossroadsDescription: 'Claim a safe item or risk a combat penalty for an [Epic Item or Relic]<epic>.' },
  1029: { crossroadsDescription: 'Drink from the well for a blessing or gamble for a high-rarity reward.' },
  1030: { crossroadsDescription: 'Take a Shard debt to choose from [3 Common, Rare, or Epic Relics]<epic>.' },
  1031: { crossroadsDescription: 'Open one of three mysterious urns for a [Relic]<rare> or [Shards]<shard>.' },
  1032: { crossroadsDescription: 'Fight a 1v1 trial combat to win [20 Shards]<shard>, an [Epic Item]<epic>, or a [Rare Relic]<rare>.' },
  1033: { crossroadsDescription: 'Survive an endurance trial to win up to [30 Shards]<shard>.' },
  1034: { crossroadsDescription: 'Deal damage in a trial combat to win up to [30 Shards]<shard>.' },
  1035: { crossroadsDescription: 'Win a boss rematch trial to claim an [Epic Relic]<epic>.' },
  1036: { text: 'You find a quiet sanctuary in the Rift where your Heroes can rest and gather their strength.', crossroadsDescription: 'Rest to grant Heroes [+{statbonus}% basic stats]<basicstat> next combat.' },
  2001: { text: 'Choose 1 of 3 [Epic Items]<epic> to claim.' },
  2002: { text: 'Choose 1 of 3 [Rare Relics]<rare> to claim.' },
  2003: { text: 'Choose 1 of 3 [Epic Relics]<epic> to claim.' },
  2005: { text: 'Choose 1 of 3 [Warrior Relics]<rare> to empower your guild.' },
  2006: { text: 'Choose 1 of 3 [Tank Relics]<rare> to empower your guild.' },
  2007: { text: 'Choose 1 of 3 [Vanguard Relics]<rare> to empower your guild.' },
  2008: { text: 'Choose 1 of 3 [Assassin Relics]<rare> to empower your guild.' },
  2009: { text: 'Choose 1 of 3 [Duelist Relics]<rare> to empower your guild.' },
  2010: { text: 'Choose 1 of 3 [Mystic Relics]<rare> to empower your guild.' },
  2011: { text: 'Choose 1 of 3 [Mage Relics]<rare> to empower your guild.' },
  2013: { text: 'Choose 1 of 3 [Common Items]<common> to claim.' },
  2014: { text: 'Choose 1 of 3 [Rare Items]<rare> to claim.' },
};

// Extra EventLogic classes present in re_data/scopes_data.json (event_catalog) & re_data/localization.json
const EXTRA_SCOPES_EVENTS = [
  {
    id: 500,
    name: 'Class Relic Shrine',
    text: 'An ancient shrine resonates with the combat disciplines of your guild.',
    crossroadsDescription: 'Choose a [Class Relic]<rare> for your guild.',
    choices: SYNTHESIZED_EVENT_CHOICES[500],
  },
  {
    id: 701,
    name: 'A New Challenger',
    text: 'A wandering Hero crosses your path and offers to join your guild.',
    crossroadsDescription: 'Get a random [Hero]<bold>.',
    choices: [
      { title: null, text: null, rewards: [{ RewardType: 'HeroesFromPool', entryId: 1, HeroRank: 1, Amount: 1 }] },
    ],
  },
  {
    id: 702,
    name: 'The Rift Conduit',
    text: 'An ancient Rift conduit hums with capacity-expanding energy.',
    crossroadsDescription: 'Gain a [Team Size Relic]<legendary>.',
    choices: [
      { title: null, text: null, rewards: [{ RewardType: 'SpecificRelic', relicId: 1001, Amount: 1 }] },
    ],
  },
  {
    id: 703,
    name: 'The Grand Rift Conduit',
    text: 'A towering Rift stabilizer offers room for another champion on the battlefield.',
    crossroadsDescription: 'Gain a [Team Size Relic]<legendary>.',
    choices: [
      { title: null, text: null, rewards: [{ RewardType: 'SpecificRelic', relicId: 1002, Amount: 1 }] },
    ],
  },
  {
    id: 823,
    name: 'Rift Breeze',
    text: 'A refreshing Rift breeze invigorates your entire party.',
    crossroadsDescription: 'Every Hero gains [+{amount} {stat}]<bold>.',
    choices: [
      { title: null, text: null, rewards: [{ RewardType: 'GrantStatsToHero', entryId: 1, Amount: 1, allHeroes: true }] },
    ],
  },
  {
    id: 824,
    name: 'Rift Surge',
    text: 'A surge of concentrated Rift energy empowers your entire party.',
    crossroadsDescription: 'Every Hero gains [+{amount} {stat}]<bold>.',
    choices: [
      { title: null, text: null, rewards: [{ RewardType: 'GrantStatsToHero', entryId: 2, Amount: 1, allHeroes: true }] },
    ],
  },
  {
    id: 1000,
    name: 'The Shard Broker',
    text: 'A hooded broker offers a massive cache of Shards at the cost of temporary battle fatigue.',
    crossroadsDescription: 'Make a high-stakes deal for [75 Shards]<shard>.',
    choices: [
      { title: 'Take the Deal', text: 'Gain [75 Shards]<shard>, but your Heroes lose [15% basic stats]<basicstat> next combat.', rewards: [{ RewardType: 'Shards', Amount: 75, UpperAmount: 75 }, { RewardType: 'SpecificRelic', relicId: 5112 }] },
      { title: 'Modest Exchange', text: 'Gain [20 Shards]<shard>.', rewards: [{ RewardType: 'Shards', Amount: 20, UpperAmount: 20 }] },
      { title: 'Decline', text: 'Leave without making a deal.', rewards: [] },
    ],
  },
  {
    id: 1007,
    name: 'The Travelling Merchant',
    text: '"Looking for a bargain?" asks the merchant.',
    crossroadsDescription: 'Buy discounted items or relics from the Travelling Merchant.',
    choices: [
      { title: 'Buy Item', text: 'Pay [5 Shards]<shard> to get {name}.', cost: 5, rewards: [{ RewardType: 'Shards', Amount: -5, UpperAmount: -5 }, { RewardType: 'ItemsFromPool', entryId: 3, Amount: 1 }] },
      { title: 'Buy Relic', text: 'Pay [10 Shards]<shard> to get {name}.', cost: 10, rewards: [{ RewardType: 'Shards', Amount: -10, UpperAmount: -10 }, { RewardType: 'RelicFromPool', entryId: 101, Amount: 1 }] },
      { title: 'Buy Rare Item', text: 'Pay [10 Shards]<shard> to get {name}.', cost: 10, rewards: [{ RewardType: 'Shards', Amount: -10, UpperAmount: -10 }, { RewardType: 'ItemsFromPool', entryId: 2, Amount: 1 }] },
      { title: 'Buy Rare Relic', text: 'Pay [15 Shards]<shard> to get {name}.', cost: 15, rewards: [{ RewardType: 'Shards', Amount: -15, UpperAmount: -15 }, { RewardType: 'RelicFromPool', entryId: 102, Amount: 1 }] },
      { title: 'Leave', text: 'Leave the merchant\'s stall.', rewards: [] },
    ],
  },
  {
    id: 1008,
    name: 'The Mysterious Machine',
    text: 'You find a strange contraption.',
    crossroadsDescription: 'Use the Mysterious Machine to rank up a Hero or forge items.',
    choices: [
      { title: 'Rank Up', text: 'Rank up a Hero.', rewards: [{ RewardType: 'HeroRankUp', Amount: 1 }] },
      { title: 'Get Items', text: 'Gain 2 random [rare items]<rare>.', rewards: [{ RewardType: 'ItemsFromPool', entryId: 2, Amount: 2 }] },
    ],
  },
  {
    id: 1009,
    name: 'The Ancient Machine',
    text: 'You find a strange contraption humming with energy.',
    crossroadsDescription: 'Rank up a C-Rank Hero or gain 2 [rare items]<rare>.',
    choices: [
      { title: 'Rank Up', text: 'Choose a C-rank Hero to rank up.', rewards: [{ RewardType: 'HeroRankUp', Amount: 1 }] },
      { title: 'Get Items', text: 'Gain 2 random [rare items]<rare>.', rewards: [{ RewardType: 'ItemsFromPool', entryId: 2, Amount: 2 }] },
    ],
  },
  {
    id: 1010,
    name: 'The Collector\'s Offer',
    text: 'A Rift collector offers you a choice of rare artifacts.',
    crossroadsDescription: 'Make a deal for a [Rare Relic]<rare>.',
    choices: [
      { title: 'Accept Deal', text: 'Choose from {reliccount} [rare relics]<rare>. Your Heroes lose [15% basic stats]<basicstat> next combat.', rewards: [{ RewardType: 'RelicFromPool', entryId: 102, Amount: 3 }, { RewardType: 'SpecificRelic', relicId: 5112 }] },
      { title: 'Safe Relic', text: 'Gain {name}.', rewards: [{ RewardType: 'RelicFromPool', entryId: 101, Amount: 1 }] },
      { title: 'Leave', text: 'Decline the offer.', rewards: [] },
    ],
  },
  {
    id: 1012,
    name: 'The Rift Trader',
    text: 'A nomadic trader offers to exchange Shards and equipment.',
    crossroadsDescription: 'Trade Shards or equipment with a nomadic trader.',
    choices: [
      { title: 'Buy Rare Gear', text: 'Pay [10 Shards]<shard> to choose from {itemcount} [rare items]<rare>.', cost: 10, rewards: [{ RewardType: 'Shards', Amount: -10, UpperAmount: -10 }, { RewardType: 'ItemsFromPool', entryId: 2, Amount: 3 }] },
      { title: 'Scavenge Shards', text: 'Gain [15 Shards]<shard>.', rewards: [{ RewardType: 'Shards', Amount: 15, UpperAmount: 15 }] },
      { title: 'Leave', text: 'Decline the trade.', rewards: [] },
    ],
  },
  {
    id: 1021,
    name: 'The Guild Vault',
    text: 'Inside the vault lie relics and armaments attuned to your Heroes\' classes.',
    crossroadsDescription: 'Choose a class item, a class relic, or [10 Shards]<shard>.',
    choices: [
      { title: 'Take Class Item', text: 'Gain {name}.', rewards: [{ RewardType: 'ItemsFromPool', entryId: 38, Amount: 1 }] },
      { title: 'Take Class Relic', text: 'Gain {name}.', rewards: [{ RewardType: 'RelicFromPool', entryId: 60, Amount: 1 }] },
      { title: 'Take Shards', text: 'Gain [10 Shards]<shard>.', rewards: [{ RewardType: 'Shards', Amount: 10, UpperAmount: 10 }] },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------------------------
export function buildCatalog(data = {}) {
  const sheets = data.sheets || {};
  const sheetEntries = name => (sheets[name] && sheets[name].Entries) || [];
  const pools = data.pools || {};
  const singletons = data.singletons || {};
  const warnings = [];

  const S = name => ({ ...(FALLBACK_SINGLETONS[name] || {}), ...(singletons[name] || {}) });

  // ---- heroes
  const heroes = new Map();
  for (const h of toList(data.heroes).concat(data.heroes ? [] : sheetEntries('HeroSheetHolder'))) {
    const id = entryId(h); if (id === undefined) continue;
    let classIds = pick(h, 'classIds');
    if (!Array.isArray(classIds)) classIds = [pick(h, 'class1ID', 'classId'), pick(h, 'class2ID')].map(x => num(x, -1)).filter(x => x > 0);
    heroes.set(id, {
      id, name: pick(h, 'name') || locText(h.NameLocaKey) || `Hero ${id}`,
      classIds, guildId: num(pick(h, 'guildId', 'guildID'), 0),
      disabled: !!pick(h, 'DisabledInGame', 'disabled'),
      specializationIds: Array.isArray(h.specializationIds) ? h.specializationIds.slice() : [],
    });
  }

  // ---- items / relics / rank modifiers
  const normRarityThing = (coll, fallbackSheet) => {
    const m = new Map();
    for (const it of toList(coll).concat(coll ? [] : sheetEntries(fallbackSheet))) {
      const id = entryId(it); if (id === undefined) continue;
      m.set(id, {
        id, name: pick(it, 'name') || locText(it.NameLocaKey) || `#${id}`,
        rarity: enumName(pick(it, 'rarity', 'Rarity'), ENUM_RARITY) || 'Common',
        disabled: !!pick(it, 'DisabledInGame', 'disabled'),
        price: pick(it, 'price'),
        description: pick(it, 'description') || locText(it.DescriptionLocaKey) || '',
        descriptionVars: pick(it, 'descriptionVars') || [],
        icon: pick(it, 'icon') || null,
        statMods: pick(it, 'statMods', 'StatModifications') || [],
      });
    }
    return m;
  };
  const items = normRarityThing(data.items, 'ItemSheetHolder');
  const relics = normRarityThing(data.relics, 'RelicSheetHolder');
  const rankModifiers = normRarityThing(data.rankModifiers, 'RankModifierSheetHolder');

  // ---- specializations
  const specializations = new Map();
  for (const s of toList(data.specializations).concat(data.specializations ? [] : sheetEntries('HeroSpecializationSheetHolder'))) {
    const id = entryId(s); if (id === undefined) continue;
    specializations.set(id, {
      id,
      heroId: num(pick(s, 'heroId'), Math.floor(id / 100)),
      name: pick(s, 'name') || locText(s.NameLocaKey) || `Spec ${id}`,
      classId: num(pick(s, 'classId'), 0),
      activeAbilityId: pick(s, 'activeAbilityId') ?? null,
      passiveAbilityId: pick(s, 'passiveAbilityId') ?? null,
    });
  }
  const specsByHero = new Map();
  for (const c of sheetEntries('HeroSpecializationChoiceSheetHolder')) specsByHero.set(num(c.heroId), (c.specializationIds || []).slice());
  for (const h of heroes.values()) if (h.specializationIds.length && !specsByHero.has(h.id)) specsByHero.set(h.id, h.specializationIds.slice());
  for (const s of specializations.values()) {
    if (!specsByHero.has(s.heroId)) specsByHero.set(s.heroId, []);
    const l = specsByHero.get(s.heroId);
    if (!l.includes(s.id) && l.length < 6) l.push(s.id);
  }

  // ---- stat mods
  const statMods = new Map();
  for (const s of toList(data.statMods || pools.statMods).concat((data.statMods || pools.statMods) ? [] : sheetEntries('StatModSheetHolder'))) {
    const id = entryId(s); if (id === undefined) continue;
    statMods.set(id, { id, title: pick(s, 'title', 'name') || '', stat: pick(s, 'TargetStat', 'stat', 'targetStat'), value: num(pick(s, 'Value', 'value'), 0) });
  }

  // ---- stages & fight modes
  const stages = new Map();
  const fightModes = new Map();
  for (const s of toList(data.stages).concat(data.stages ? [] : sheetEntries('StageSheetHolder'))) {
    const id = entryId(s); if (id === undefined) continue;
    let enemies = pick(s, 'enemies');
    if (!Array.isArray(enemies)) enemies = (s.EnemyPlacements || []).map(p => ({ enemyId: entryId(p.enemyId) ?? num(p.enemyId), x: num(p.Position?.x), y: num(p.Position?.y) }));
    const rawSt = pick(s, 'stageType', 'StageType');
    if (rawSt === 'FightMode') {
      fightModes.set(id, {
        id, group: pick(s, 'GroupName', 'groupName', 'group') || '', act: num(pick(s, 'ActNumber', 'act'), 1),
        type: pick(s, 'FightModeType', 'fightMode', 'type') || 'Normal', thresholds: pick(s, 'Thresholds', 'thresholds') || [],
        victoryRewards: (pick(s, 'VictoryRewards', 'victoryRewards') || []).map(normReward),
        defeatRewards: (pick(s, 'DefeatRewards', 'defeatRewards') || []).map(normReward),
        enemies,
      });
      continue;
    }
    const st = enumName(rawSt, ENUM_STAGE_TYPE) || 'Normal';
    stages.set(id, {
      id,
      act: num(pick(s, 'act', 'ActNumber', 'actNumber'), 0),
      floor: num(pick(s, 'floor', 'FloorNumber', 'floorNumber'), 0),
      stageType: st,
      difficulty: num(pick(s, 'difficultyIndex', 'DifficultyIndex', 'difficulty'), deriveStageDifficulty(id)),
      group: pick(s, 'groupName', 'GroupName', 'group', 'encounterGroup') || `stage${id}`,
      fightMode: pick(s, 'fightMode', 'FightModeType') || 'Normal',
      enemies,
      rewards: normReward(pick(s, 'rewards', 'StageRewards', 'victoryRewards')),
      defeatRewards: normReward(pick(s, 'defeatRewards', 'DefeatStageRewards')),
      disabled: !!pick(s, 'DisabledInGame', 'disabled'),
      width: num(pick(s, 'width', 'Width'), 7), height: num(pick(s, 'height', 'Height'), 8),
      background: s.background || null,
      backgroundLayers: s.backgroundLayers || null,
    });
  }
  // Restore diff=1 Floor 1-3 stages (10101, 10102, 10201, 10202, 10301, 10302, 10303) if overwritten by FightModeSheetHolder
  for (const overwrittenId of [10101, 10102, 10201, 10202, 10301, 10302, 10303]) {
    if (!stages.has(overwrittenId) && stages.has(overwrittenId + 10000)) {
      const twin = stages.get(overwrittenId + 10000);
      stages.set(overwrittenId, {
        ...twin,
        id: overwrittenId,
        difficulty: 1,
        enemies: (twin.enemies || []).map(e => {
          const cand = e.enemyId >= 200000 && e.enemyId < 300000
            ? e.enemyId - 100000
            : (e.enemyId >= 20000 && e.enemyId < 30000 ? e.enemyId - 10000 : e.enemyId);
          const hasCand = !data.enemies || data.enemies[cand] !== undefined;
          return { ...e, enemyId: hasCand ? cand : e.enemyId };
        }),
      });
    }
  }
  if (!stages.size) warnings.push('no stages in data');

  for (const f of toList(data.fightModes).concat(data.fightModes ? [] : sheetEntries('FightModeSheetHolder'))) {
    const id = entryId(f); if (id === undefined || fightModes.has(id)) continue;
    fightModes.set(id, {
      id, group: pick(f, 'GroupName', 'groupName') || '', act: num(pick(f, 'ActNumber', 'act'), 0),
      type: pick(f, 'FightModeType', 'type') || 'Normal', thresholds: pick(f, 'Thresholds', 'thresholds') || [],
      victoryRewards: (pick(f, 'VictoryRewards', 'victoryRewards') || []).map(normReward),
      defeatRewards: (pick(f, 'DefeatRewards', 'defeatRewards') || []).map(normReward),
      enemies: (f.EnemyPlacements || f.enemies || []).map(p => p.Position ? ({ enemyId: entryId(p.enemyId) ?? num(p.enemyId), x: num(p.Position.x), y: num(p.Position.y) }) : p),
    });
  }

  // ---- events
  const events = new Map();
  const allEventSources = toList(data.events)
    .concat(data.events ? [] : sheetEntries('EventSheetHolder'))
    .concat(EXTRA_SCOPES_EVENTS);
  for (const e of allEventSources) {
    const id = entryId(e); if (id === undefined || events.has(id)) continue;
    let rawChoices = pick(e, 'choices', 'EventChoices') || [];
    if (!rawChoices.length && SYNTHESIZED_EVENT_CHOICES[id]) {
      rawChoices = SYNTHESIZED_EVENT_CHOICES[id];
    }
    const metaFallback = EVENT_METADATA_FALLBACKS[id] || {};
    const evName = pick(e, 'name', 'title') || metaFallback.name || `Event ${id}`;
    const evText = pick(e, 'text') || locText(e.MainTextLocaKey) || metaFallback.text || e.crossroadsDescription || metaFallback.crossroadsDescription || evName;
    const evCrossroads = e.crossroadsDescription || locText(e.CrossroadsDescriptionLocaKey) || metaFallback.crossroadsDescription || evText;
    events.set(id, {
      id,
      name: evName,
      nameKey: e.nameKey || null,
      title: pick(e, 'title', 'name') || evName,
      text: evText,
      textKey: e.textKey || null,
      crossroadsDescription: evCrossroads,
      crossroadsDescriptionKey: e.crossroadsDescriptionKey || null,
      image: pick(e, 'image') || (e.EventArtwork && e.EventArtwork.name) || null,
      icon: pick(e, 'icon') || null,
      disabled: !!pick(e, 'DisabledInGame', 'disabled'),
      choices: rawChoices.map((c) => {
        const rawTitle = c.title || locText(c.ChoiceTitleLocaKey) || null;
        const rawText = typeof c.text === 'string' ? c.text : (locText(c.ChoiceTextLocaKey) || null);
        return {
          title: rawTitle,
          titleKey: c.titleKey || locKey(c.ChoiceTitleLocaKey) || null,
          text: rawText,
          textKey: c.textKey || locKey(c.ChoiceTextLocaKey) || null,
          textVars: c.textVars || null,
          outcome: typeof c.outcome === 'string' ? c.outcome : locText(c.ChoiceOutcomeTextLocaKey),
          outcomeKey: c.outcomeKey || null,
          outcomeVars: c.outcomeVars || null,
          cost: c.cost ?? null,
          rewards: (pick(c, 'rewards', 'Rewards') || []).slice(),
        };
      }),
    });
  }

  // ---- crossroads
  const crossroads = new Map();
  for (const c of toList(data.crossroads).concat(data.crossroads ? [] : sheetEntries('CrossroadsSheetHolder'))) {
    const id = entryId(c); if (id === undefined) continue;
    crossroads.set(id, {
      id, name: pick(c, 'name') || locText(c.NameLocaKey) || '',
      poolType: pick(c, 'PoolType', 'poolType') || 'Regular',
      disabled: !!pick(c, 'DisabledInGame', 'disabled'),
      paths: (pick(c, 'Paths', 'paths') || []).map(p => ({
        pathType: enumName(pick(p, 'PathType', 'pathType'), ENUM_PATH) || 'Event',
        eventId: num(pick(p, 'eventId', 'eventID'), -1),
        eventPoolId: num(pick(p, 'eventPoolId', 'eventPoolID'), -1),
        stageId: num(pick(p, 'stageId'), -1),
      })),
    });
  }

  // ---- pools
  const P = (key, sheet) => normPools(pools[key] || data[key] || (sheets[sheet] ? sheets[sheet].Entries : null));
  const heroPools = P('heroPools', 'HeroPoolSheetHolder');
  const itemPools = P('itemPools', 'ItemPoolSheetHolder');
  const relicPools = P('relicPools', 'RelicPoolSheetHolder');
  const eventPools = P('eventPools', 'EventPoolSheetHolder');
  const rankModifierPools = P('rankModifierPools', 'RankModifierPoolSheetHolder');
  const statModPools = P('statModPools', 'StatModPoolSheetHolder');
  const crossroadsPools = P('crossroadsPools', 'CrossroadsPoolSheetHolder');
  const fightEventPools = P('fightEventPools', 'FightEventPoolSheetHolder');

  // ---- acts
  let actRaw = [];
  if (Array.isArray(data.acts) && data.acts.length) actRaw = data.acts;
  else if (data.acts && typeof data.acts === 'object' && (data.acts.ActChunks || data.acts.chunks)) actRaw = [data.acts];
  else if (singletons.ActEntry) actRaw = [singletons.ActEntry];
  if (!actRaw.length || !actRaw.some(a => a && (a.ActChunks || a.chunks))) { actRaw = [FALLBACK_ACT_ENTRY]; warnings.push('acts missing → FALLBACK_ACT_ENTRY'); }
  const acts = actRaw.filter(a => a && (a.ActChunks || a.chunks)).map(a => ({
    title: a.Title || a.title || '',
    endlessCrossroadsId: num(pick(a, 'endlessCrossroadsId'), -1),
    fightCrossroadsPerRun: num(pick(a, 'fightCrossroadsPerRun'), 0),
    fightCrossroadsChance: num(pick(a, 'fightCrossroadsChance'), 0),
    chunks: (a.ActChunks || a.chunks).map(c => ({
      regularCrossroadsPoolId: num(c.regularCrossroadsPoolId, -1),
      randomCrossroadsPoolId: num(c.randomCrossroadsPoolId, -1),
      floors: (c.FloorNodes || c.floors || []).map(f => ({
        fightType: enumName(pick(f, 'FightType', 'fightType'), ENUM_FLOOR_FIGHT) || 'RandomFromPoolingLogic',
        specificId: num(pick(f, 'specificId'), 0),
        eventOverrideType: enumName(pick(f, 'EventOverrideType', 'eventOverrideType'), ENUM_EVENT_OVERRIDE) || 'NoCrossroads',
        crossroadsId: num(pick(f, 'crossroadsId'), -1),
        fightCrossroadsId: num(pick(f, 'fightCrossroadsId'), -1),
        modifierChoices: ((f.StageModifierCrossroadsData && f.StageModifierCrossroadsData.ModifierChoices) || f.modifierChoices || []).map(m => ({
          enemyRelicPoolId: num(m.enemyRelicPoolId, -1), rewardRelicPoolIds: (m.rewardRelicPoolIds || []).slice(),
        })),
      })),
    })),
  }));

  // ---- difficulties
  const diffS = S('DifficultiesSingleton');
  const difficulties = (diffS.difficulties || FALLBACK_SINGLETONS.DifficultiesSingleton.difficulties).map((d, i) => ({
    index: i,
    stageDifficultyIndex: num(d.StageDifficultyIndex, 1),
    modifierNames: (d.modifiers || []).map(m => (typeof m === 'string' ? m : m.assetRef || m.name || m.Title)).filter(Boolean),
  }));
  const diffMods = new Map();
  for (const m of (Array.isArray(data.difficultyModifiers) && data.difficultyModifiers.length ? data.difficultyModifiers : FALLBACK_DIFFICULTY_MODIFIERS)) {
    const t = m.Title || m._assetName || m.name; if (t) diffMods.set(t, m);
  }

  // ---- class event settings (EventsSingleton.ClassEventSettings)
  const classEventRelics = new Map();
  for (const ce of (S('EventsSingleton').ClassEventSettings || [])) {
    const ids = [];
    for (const inp of ce.Inputs || []) for (const o of inp.Outputs || []) if (o.relicId) ids.push(o.relicId);
    classEventRelics.set(num(ce.classId), ids);
  }

  // ---- board
  const board = { width: 7, height: 8, playerRows: [0, 1, 2, 3], ...(data.board || {}) };

  return {
    data, warnings, S, board,
    heroes, items, relics, rankModifiers, specializations, specsByHero, statMods,
    stages, fightModes, events, crossroads, acts, difficulties, diffMods, classEventRelics,
    heroPools, itemPools, relicPools, eventPools, rankModifierPools, statModPools, crossroadsPools, fightEventPools,
    heroName: id => (heroes.get(id) || {}).name || `Hero ${id}`,
    itemName: id => (items.get(id) || {}).name || `Item ${id}`,
    relicName: id => (relics.get(id) || {}).name || `Relic ${id}`,
    /** valid weighted entries of a pool (filters disabled / unknown ids for the given lookup) */
    poolEntries(poolMap, poolId, lookup) {
      const p = poolMap.get(num(poolId));
      if (!p) return [];
      return p.entries.filter(e => !lookup || (lookup.has(e.id) && !lookup.get(e.id).disabled));
    },
  };
}

export const Enums = { ENUM_RARITY, ENUM_STAGE_TYPE, ENUM_FLOOR_FIGHT, ENUM_EVENT_OVERRIDE, ENUM_PATH };
