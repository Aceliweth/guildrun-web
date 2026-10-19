// Character stat table, Hero rank scaling (HeroesSingleton), Enemy floor scaling (e(N) polynomial),
// Frost stat reductions, and scaling formula evaluation.

export const ALL_STATS = [
  'MaxHealth',
  'MaxMana',
  'StartingMana',
  'ManaRegen',
  'MoveSpeed',
  'Defense',
  'BaseAttackDamage',
  'Attack',
  'Magic',
  'AttackRange',
  'BaseAttackSpeed',
  'AttackSpeed',
  'Crit',
  'ManaLockTime',
  'OmniVamp',
  'DamageAmp',
  'HPPerSecond',
  'BaseTrueDamage',
  'BonusTrueDamage',
  'FrostResistance',
  'StunResistance',
];

export const BASIC_STATS = [
  'MaxHealth',
  'Defense',
  'Attack',
  'Magic',
  'AttackSpeed',
  'Crit',
  'ManaRegen',
];

const DEFAULT_BASE_STATS = {
  MaxHealth: 500,
  MaxMana: 100,
  StartingMana: 0,
  ManaRegen: 5,
  MoveSpeed: 1.5,
  Defense: 20,
  BaseAttackDamage: 25,
  Attack: 0,
  Magic: 0,
  AttackRange: 1,
  BaseAttackSpeed: 0.5,
  AttackSpeed: 0,
  Crit: 15,
  ManaLockTime: 1.0,
  OmniVamp: 0,
  DamageAmp: 0,
  HPPerSecond: 0,
  BaseTrueDamage: 0,
  BonusTrueDamage: 0,
  FrostResistance: 0,
  StunResistance: 0,
};

export function createStatModTable(baseStats = {}) {
  const mods = {};
  for (let i = 0; i < ALL_STATS.length; i++) {
    const s = ALL_STATS[i];
    const baseVal = Number.isFinite(Number(baseStats[s])) ? Number(baseStats[s]) : (DEFAULT_BASE_STATS[s] || 0);
    mods[s] = {
      base: baseVal,
      rankFlat: 0,
      rankPct: 0,
      constFlat: 0,
      constPct: 0,
      combatFlat: 0,
      combatPct: 0,
      permFlat: 0,
      permPct: 0,
      tempFlat: 0,
      tempPct: 0,
      override: null,
    };
  }
  return mods;
}

export function resetTemporaryBonuses(unit) {
  for (let i = 0; i < ALL_STATS.length; i++) {
    const s = ALL_STATS[i];
    const m = unit.statMods[s];
    if (m) {
      m.tempFlat = 0;
      m.tempPct = 0;
    }
  }
}

export function addStatBonus(unit, statName, value, isPercent = false, layer = 'combat', data = null) {
  if (!unit || !statName || !Number.isFinite(value) || value === 0) return;
  const m = unit.statMods?.[statName];
  if (!m) return;

  const prevMaxHp = unit.maxHp || m.base || 1;
  // Convert fractional percent (e.g. 0.25) vs percentage points (e.g. 25):
  // In ModularEffect actions, ModifyStatPercentAction uses fractional (0.20 = 20%),
  // so callers pass percentage points (e.g., 20 for +20%).
  if (isPercent) {
    if (layer === 'const') m.constPct += value;
    else if (layer === 'temp') m.tempPct += value;
    else if (layer === 'perm') {
      m.permPct += value;
      unit.permanentGains[statName] = (unit.permanentGains[statName] || 0) + value;
    } else if (layer === 'rank') m.rankPct += value;
    else m.combatPct += value;
  } else {
    if (layer === 'const') m.constFlat += value;
    else if (layer === 'temp') m.tempFlat += value;
    else if (layer === 'perm') {
      m.permFlat += value;
      unit.permanentGains[statName] = (unit.permanentGains[statName] || 0) + value;
    } else if (layer === 'rank') m.rankFlat += value;
    else m.combatFlat += value;
  }

  recalculateStats(unit, data);

  // If MaxHealth increased mid-combat (or at initialization), grant the gained HP to current HP too
  if (statName === 'MaxHealth' && unit.hp > 0) {
    const deltaHp = unit.maxHp - prevMaxHp;
    if (deltaHp > 0 && layer !== 'temp') {
      unit.hp = Math.min(unit.maxHp, unit.hp + deltaHp);
    } else if (unit.hp > unit.maxHp) {
      unit.hp = unit.maxHp;
    }
  }
}

/**
 * Applies HeroesSingleton rank scaling for rank 1..4 based on base per-rank increases
 * plus the hero's classes' primaryStat and secondaryStats.
 */
export function applyHeroRankScaling(unit, data) {
  const rank = Math.max(1, Math.min(4, Math.round(unit.rank || 1)));
  const r = rank - 1;
  if (r <= 0) return;

  const hs = data?.singletons?.HeroesSingleton || {};
  // Base per-rank bonuses
  addStatBonus(unit, 'MaxHealth', r * ((hs.HealthPercentageIncreasePerRank ?? 0.125) * 100), true, 'rank', data);
  addStatBonus(unit, 'ManaRegen', r * (hs.ManaRegenFlatIncreasePerRank ?? 1), false, 'rank', data);
  addStatBonus(unit, 'Defense', r * (hs.DefenseFlatIncreasePerRank ?? 8), false, 'rank', data);
  addStatBonus(unit, 'Attack', r * (hs.AttackFlatIncreasePerRank ?? 6), false, 'rank', data);
  addStatBonus(unit, 'Magic', r * (hs.MagicFlatIncreasePerRank ?? 6), false, 'rank', data);
  addStatBonus(unit, 'AttackSpeed', r * (hs.AttackSpeedFlatIncreasePerRank ?? 5), false, 'rank', data);
  addStatBonus(unit, 'Crit', r * (hs.CritFlatIncreasePerRank ?? 4), false, 'rank', data);

  const primaryMap = {
    MaxHealth: { val: (hs.PrimaryHealthPercentageIncreasePerRank ?? 0.25) * 100, pct: true },
    ManaRegen: { val: hs.PrimaryManaRegenFlatIncreasePerRank ?? 4, pct: false },
    Defense: { val: hs.PrimaryDefenseFlatIncreasePerRank ?? 30, pct: false },
    Attack: { val: hs.PrimaryAttackFlatIncreasePerRank ?? 25, pct: false },
    Magic: { val: hs.PrimaryMagicFlatIncreasePerRank ?? 25, pct: false },
    AttackSpeed: { val: hs.PrimaryAttackSpeedFlatIncreasePerRank ?? 20, pct: false },
    Crit: { val: hs.PrimaryCritFlatIncreasePerRank ?? 15, pct: false },
  };

  const secondaryMap = {
    MaxHealth: { val: (hs.SecondaryHealthPercentageIncreasePerRank ?? 0.125) * 100, pct: true },
    ManaRegen: { val: hs.SecondaryManaRegenFlatIncreasePerRank ?? 1, pct: false },
    Defense: { val: hs.SecondaryDefenseFlatIncreasePerRank ?? 8, pct: false },
    Attack: { val: hs.SecondaryAttackFlatIncreasePerRank ?? 6, pct: false },
    Magic: { val: hs.SecondaryMagicFlatIncreasePerRank ?? 6, pct: false },
    AttackSpeed: { val: hs.SecondaryAttackSpeedFlatIncreasePerRank ?? 5, pct: false },
    Crit: { val: hs.SecondaryCritFlatIncreasePerRank ?? 4, pct: false },
  };

  const classesDict = data?.classes || {};
  for (const cid of unit.classIds || []) {
    const cls = classesDict[cid] || classesDict[String(cid)];
    if (!cls) continue;
    const p = primaryMap[cls.primaryStat];
    if (p) {
      addStatBonus(unit, cls.primaryStat, r * p.val, p.pct, 'rank', data);
    }
    for (const secStat of cls.secondaryStats || []) {
      const s = secondaryMap[secStat];
      if (s) {
        addStatBonus(unit, secStat, r * s.val, s.pct, 'rank', data);
      }
    }
  }
}

/**
 * Applies enemy wave/floor scaling from `data.enemyScaling[scalingId]`
 * using `e(N) = N * (0.43092 + 0.07815 * N)` per EnemyData..ctor in simulation_decompiled.json.
 * Note: In a full run, Act 1 has 12 floors, so Floor 13 is Endless Floor 1 (`endlessFloorIndex = 0`, `N = 0`),
 * Floor 14 is Endless Floor 2 (`endlessFloorIndex = 1`, `N = 1`), etc.
 * If a caller passes `floor < 13` directly on an Endless enemy (e.g. unit test passing `floor: 3`), `N = floor`.
 */
export function applyEnemyFloorScaling(unit, scalingId, floor, data, endlessFloorIndex = null) {
  const rawFloor = Math.max(0, Number(floor) || 0);
  const N =
    endlessFloorIndex != null && Number(endlessFloorIndex) >= 0
      ? Number(endlessFloorIndex)
      : rawFloor >= 13
        ? rawFloor - 13
        : rawFloor;

  if (scalingId == null) {
    // Act 1 enemies (scalingId == null) already have their exact floor & difficulty stats in balancing_data.json!
    // Only apply fallback Endless scaling if this enemy was spawned in Endless Mode (endlessFloorIndex > 0 or floor >= 13).
    const endlessN =
      endlessFloorIndex != null && Number(endlessFloorIndex) > 0
        ? Number(endlessFloorIndex)
        : rawFloor >= 13
          ? rawFloor - 13
          : 0;
    if (endlessN > 0) {
      const endlessHpPct = (Math.pow(1.18, endlessN) - 1) * 100;
      const endlessOffPct = (Math.pow(1.14, endlessN) - 1) * 100;
      const endlessDefFlat = endlessN * 8;
      const endlessAspdPct = Math.min(150, endlessN * 6);
      addStatBonus(unit, 'MaxHealth', endlessHpPct, true, 'const', data);
      addStatBonus(unit, 'Attack', endlessOffPct, true, 'const', data);
      addStatBonus(unit, 'Magic', endlessOffPct, true, 'const', data);
      addStatBonus(unit, 'Defense', endlessDefFlat, false, 'const', data);
      addStatBonus(unit, 'AttackSpeed', endlessAspdPct, true, 'const', data);
    }
    return;
  }

  if (N <= 0) return;
  const scalingList = data?.enemyScaling?.[scalingId] || data?.enemyScaling?.[String(scalingId)];
  if (!Array.isArray(scalingList) || scalingList.length === 0) return;

  const exponent = N * (0.43092 + 0.07815 * N);
  for (let i = 0; i < scalingList.length; i++) {
    const entry = scalingList[i];
    const stat = entry.TargetStatType;
    const val = Number(entry.Value) || 0;
    const m = unit.statMods?.[stat];
    if (!m) continue;

    let bonus = 0;
    if (entry.ScalingType === 'Additive' || entry.ScalingType === 'Linear') {
      bonus = val * exponent;
    } else if (entry.ScalingType === 'Percentage' || entry.ScalingType === 'Exponential') {
      const baseStat = m.base;
      const scaled = Math.min(baseStat * Math.pow(val, exponent), 500000000);
      bonus = scaled - baseStat;
    }
    if (bonus !== 0 && Number.isFinite(bonus)) {
      addStatBonus(unit, stat, bonus, false, 'const', data);
    }
  }
}

export function recalculateStats(unit, data = null) {
  const statusSingleton = data?.singletons?.StatusSingleton || {};
  const heroesSingleton = data?.singletons?.HeroesSingleton || {};
  const frostStacks = Math.max(0, unit.statuses?.Frost || 0);
  const frostResist = Math.max(0, Math.min(0.9, (unit.statMods?.FrostResistance?.base || 0) + (unit.statMods?.FrostResistance?.constFlat || 0)));
  const effectiveFrost = frostStacks * (1 - frostResist);

  const frostAsRed = effectiveFrost * (statusSingleton.FrostAttackSpeedReductionPerStack ?? 0.5);
  const frostDefRed = effectiveFrost * (statusSingleton.FrostDefenseReductionPerStack ?? 0.5);

  for (let i = 0; i < ALL_STATS.length; i++) {
    const s = ALL_STATS[i];
    const m = unit.statMods[s];
    if (!m) continue;

    if (m.override != null && Number.isFinite(m.override)) {
      unit.stats[s] = m.override;
      continue;
    }

    let flat = m.base + m.rankFlat + m.constFlat + m.combatFlat + m.permFlat + m.tempFlat;
    let pct = m.rankPct + m.constPct + m.combatPct + m.permPct + m.tempPct;

    if (s === 'Defense') {
      flat -= frostDefRed;
      flat -= unit.statuses?.StatReductionDefense || 0;
    } else if (s === 'AttackSpeed') {
      flat -= frostAsRed;
    }

    let total = flat * (1 + pct / 100);
    if (!Number.isFinite(total)) total = m.base || 0;

    if (s === 'MaxHealth') total = Math.max(1, Math.round(total));
    else if (s === 'MaxMana') total = Math.max(0, Math.round(total));
    else if (s === 'AttackRange') total = Math.max(1, Math.round(total));
    else if (s === 'MoveSpeed') total = Math.max(0.2, total);

    unit.stats[s] = total;
  }

  unit.maxHp = Math.max(1, Math.round(unit.stats.MaxHealth));
  unit.maxMana = (unit.team === 1 && unit.activeAbilityId == null)
    ? 0
    : Math.max(0, Math.round(unit.stats.MaxMana));
  if (unit.maxMana === 0) unit.mana = 0;

  const minAps = heroesSingleton.MinAttacksPerSecond ?? 0.2;
  const maxAps = heroesSingleton.MaxAttacksPerSecond ?? 5.0;
  const baseAs = Math.max(0.1, unit.stats.BaseAttackSpeed || 0.5);
  const asBonus = unit.stats.AttackSpeed || 0;
  unit.attacksPerSecond = Math.max(minAps, Math.min(maxAps, baseAs * Math.max(0.1, 1 + asBonus / 100)));
}

/**
 * Evaluates a `Scalings` array:
 * `[{ Stat: 'Magic', Rank1Factor: 1.5, Rank2Factor: 2.5, Rank3Factor: 4.5, Rank4Factor: 7.5 }]`
 */
export function evaluateScalings(unit, scalings, baseValue = 0, extraPerRank = 0) {
  const rank = Math.max(1, Math.min(4, Math.round(unit?.rank || 1)));
  let total = (Number(baseValue) || 0) + (Number(extraPerRank) || 0) * (rank - 1);
  if (!Array.isArray(scalings) || !unit) return total;

  const rankKey = `Rank${rank}Factor`;
  for (let i = 0; i < scalings.length; i++) {
    const sc = scalings[i];
    if (!sc) continue;
    const statName = sc.Stat || sc.StatType;
    const factor = Number(sc[rankKey] ?? sc.Rank1Factor ?? sc.Factor ?? 0) || 0;
    const statVal = getUnitStat(unit, statName);
    total += statVal * factor;
  }
  return total;
}

export function getUnitStat(unit, statName) {
  if (!unit || !statName) return 0;
  if (statName === 'Rank') return unit.rank || 1;
  if (statName === 'Shield' || statName === 'Shields') return unit.shield || 0;
  if (statName === 'Health' || statName === 'CurrentHealth') return unit.hp || 0;
  if (statName === 'MissingHealth') return Math.max(0, (unit.maxHp || 0) - (unit.hp || 0));
  return Number(unit.stats?.[statName]) || 0;
}
