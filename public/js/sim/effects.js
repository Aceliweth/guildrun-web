// ModularEffect interpreter, condition/action evaluator, and C# codegen PassiveAbility/Relic synthesizer.

import { hexDistance, getNeighbors, isUnitInsideAoe } from './hex.js';
import { BASIC_STATS, addStatBonus, evaluateScalings, getUnitStat, recalculateStats } from './stats.js';

const CLASS_TAG_TO_ID = {
  warrior: 1,
  warriors: 1,
  tank: 2,
  tanks: 2,
  vanguard: 3,
  vanguards: 3,
  assassin: 4,
  assassins: 4,
  duelist: 5,
  duelists: 5,
  mystic: 6,
  mystics: 6,
  mage: 7,
  mages: 7,
};

const STAT_TAG_TO_NAME = {
  attack: 'Attack',
  ad: 'Attack',
  defense: 'Defense',
  magic: 'Magic',
  ap: 'Magic',
  maxhp: 'MaxHealth',
  maxhealth: 'MaxHealth',
  health: 'MaxHealth',
  hp: 'MaxHealth',
  attackspeed: 'AttackSpeed',
  crit: 'Crit',
  manaregen: 'ManaRegen',
  omnivamp: 'OmniVamp',
  damageamp: 'DamageAmp',
  'hp/s': 'HPPerSecond',
  hps: 'HPPerSecond',
  hppersecond: 'HPPerSecond',
  attackrange: 'AttackRange',
  startingmana: 'StartingMana',
};

const DEBUFF_STATUSES = ['Burn', 'Frost', 'Poison', 'Bleed', 'Stun'];

export function unitHasClass(unit, classId) {
  if (!unit || !classId) return false;
  return Array.isArray(unit.classIds) && unit.classIds.includes(Number(classId));
}

export function countDebuffTypes(unit) {
  if (!unit || !unit.statuses) return 0;
  let c = 0;
  if ((unit.statuses.Burn || 0) > 0) c++;
  if ((unit.statuses.Frost || 0) > 0) c++;
  if ((unit.statuses.Poison || 0) > 0) c++;
  if ((unit.statuses.Bleed || 0) > 0) c++;
  return c;
}

export function countTotalDebuffStacks(unit) {
  if (!unit || !unit.statuses) return 0;
  return (
    Math.max(0, unit.statuses.Burn || 0) +
    Math.max(0, unit.statuses.Frost || 0) +
    Math.max(0, unit.statuses.Poison || 0) +
    Math.max(0, unit.statuses.Bleed || 0)
  );
}

/**
 * Evaluates inline `[base+factor_Stat]<statcalc_...>` expressions from descriptions.
 * Supports:
 * - `10+20_AttackSpeed+10_Attack` (where 20_AttackSpeed in damage/shield/heal means 20% of AttackSpeed, or in status/rank means flat/ratio)
 * - `1+1/33_AttackSpeed` (1 + Math.floor(AttackSpeed / 33))
 * - `150|250|450|750_Magic` (rank-dependent percentage)
 */
export function evalStatCalcExpr(expr, unit, isStatusCount = false) {
  if (!expr || !unit) return 0;
  const rankIdx = Math.max(0, Math.min(3, (unit.rank || 1) - 1));
  const parts = String(expr).split('+');
  let total = 0;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) continue;
    if (!p.includes('_')) {
      const n = parseFloat(p);
      if (Number.isFinite(n)) total += n;
      continue;
    }
    const [coeffStr, statRaw] = p.split('_');
    const statVal = getUnitStat(unit, statRaw);
    let coeff = 0;

    if (coeffStr.includes('|')) {
      const rankParts = coeffStr.split('|');
      const rv = parseFloat(rankParts[Math.min(rankIdx, rankParts.length - 1)]);
      coeff = Number.isFinite(rv) ? rv / 100 : 0;
    } else if (coeffStr.includes('/')) {
      const [num, den] = coeffStr.split('/').map(Number);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        total += Math.floor((statVal * num) / den);
        continue;
      }
    } else {
      const rawNum = parseFloat(coeffStr);
      if (Number.isFinite(rawNum)) {
        if (statRaw === 'Rank') {
          coeff = rawNum;
          total += coeff * Math.max(0, (unit.rank || 1) - 1);
          continue;
        }
        coeff = isStatusCount && rawNum <= 10 ? rawNum : rawNum / 100;
      }
    }
    total += statVal * coeff;
  }
  return total;
}

/**
 * Synthesizes runtime effect descriptors for PassiveAbilities (which have no serialized `effects` in game_data.json).
 */
export function buildPassiveAbilityEffects(paId, owner, data) {
  const id = Number(paId);
  const pa = data?.passiveAbilities?.[id] || data?.passiveAbilities?.[String(id)];
  if (!pa) return [];

  // If it already has serialized effects, wrap them
  if (Array.isArray(pa.effects) && pa.effects.length > 0) {
    return pa.effects.map((e) => ({ ...e, _origin: 'PassiveAbility', _ownerUid: owner.uid }));
  }

  const list = [];
  const add = (eff) => list.push({ _origin: 'PassiveAbility', _ownerUid: owner.uid, _paId: id, ...eff });

  switch (id) {
    // --- Enemy Passives ---
    case 109: // Regeneration (Slime): Gain 0+1%_MaxHealth HP/S
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => addStatBonus(owner, 'HPPerSecond', owner.maxHp * 0.01, false, 'combat', sim.data),
      });
      break;
    case 110: // Oak Skin (Forest Golem): Start of Combat: Gain 100% Magic Defense
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => addStatBonus(owner, 'Defense', getUnitStat(owner, 'Magic'), false, 'combat', sim.data),
      });
      break;
    case 113: // Shields Up! (Mushroom Tank): Every 10s: Gain 10% MaxHealth Shield
      add({
        Trigger: 'OnInterval',
        EffectInterval: 10.0,
        customRun: (sim) => sim.applyShield(owner, owner, owner.maxHp * 0.1, 10.0),
      });
      break;
    case 114: // Poisonous (Spider): Every 3 Attacks: Inflict 0+1/33_Crit Poison
    case 120: // Poisonous (Spider): Every 3 auto attacks: inflict 1+1/33_Crit Poison
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        TriggerIncrement: 3,
        customRun: (sim, ctx) => {
          const base = id === 120 ? 1 : 0;
          const stacks = base + Math.floor(getUnitStat(owner, 'Crit') / 33);
          if (ctx.target && stacks > 0) sim.applyStatus(owner, ctx.target, 'Poison', stacks);
        },
      });
      break;
    case 115: // Lizard Leap: Start of combat: jump to enemy backline opposite starting position
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const oppY = 7 - owner.cellY;
          sim.teleportUnit(owner, owner.cellX, oppY);
        },
      });
      break;
    case 116: // Explosive (Firefly): On death, deal 50+100%_Magic dmg and 20+1/5_Magic Burn to adjacent enemies
      add({
        Trigger: 'OnCharacterKilled',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim) => {
          const dmg = 50 + getUnitStat(owner, 'Magic');
          const burn = 20 + Math.floor(getUnitStat(owner, 'Magic') / 5);
          for (const u of sim.getAliveUnits(owner.team === 1 ? 2 : 1)) {
            if (hexDistance(owner, u) <= 1) {
              sim.dealDamage(owner, u, dmg, { origin: 'ability', damageType: 'magic', canCrit: false });
              sim.applyStatus(owner, u, 'Burn', burn);
            }
          }
        },
      });
      break;
    case 118: // Venomous (Snake): Start of combat: +10 Omnivamp; Every 3 attacks: inflict 1+1/50_Crit Poison
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => addStatBonus(owner, 'OmniVamp', 10, false, 'combat', sim.data),
      });
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        TriggerIncrement: 3,
        customRun: (sim, ctx) => {
          if (ctx.target) {
            sim.applyStatus(owner, ctx.target, 'Poison', 1 + Math.floor(getUnitStat(owner, 'Crit') / 50));
          }
        },
      });
      break;
    case 201: // Flaming Attacks (Dragon)
    case 202: // Freezing Attacks (Dragon)
    case 203: // Toxic Attacks (Dragon)
      add({
        Trigger: 'OnAttackDamageDealt',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          const magic = getUnitStat(owner, 'Magic');
          if (id === 201) sim.applyStatus(owner, ctx.target, 'Burn', 3 + Math.floor(magic / 10));
          else if (id === 202) sim.applyStatus(owner, ctx.target, 'Frost', 2 + Math.floor(magic / 15));
          else if (id === 203) sim.applyStatus(owner, ctx.target, 'Poison', 1 + Math.floor(magic / 20));
          const splash = (ctx.amount || 30) * 0.66;
          for (const u of sim.getAliveUnits(ctx.target.team)) {
            if (u.uid !== ctx.target.uid && hexDistance(ctx.target, u) <= 1) {
              sim.dealDamage(owner, u, splash, { origin: 'effect', damageType: 'physical', canCrit: false });
            }
          }
        },
      });
      break;
    case 204: // Fury (Demon): At 50% HP, +25 AS, 25% MaxHP Shield, 100% Attack Burn on all Heroes
      add({
        Trigger: 'OnDamageReceived',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim) => {
          if (owner._triggered204 || owner.hp > owner.maxHp * 0.5) return;
          owner._triggered204 = true;
          addStatBonus(owner, 'AttackSpeed', 25, false, 'combat', sim.data);
          sim.applyShield(owner, owner, owner.maxHp * 0.25, 10.0);
          const burn = Math.max(1, Math.round(getUnitStat(owner, 'Attack')));
          for (const h of sim.getAliveUnits(1)) {
            sim.applyStatus(owner, h, 'Burn', burn);
          }
        },
      });
      break;
    case 205: // Three Heads (Hydra): 3 heads, loses head at 66% & 33% HP, +15 HP/S per head, bonus attacks
      owner._hydraHeads = 3;
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => addStatBonus(owner, 'HPPerSecond', 45, false, 'combat', sim.data),
      });
      add({
        Trigger: 'OnDamageReceived',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim) => {
          const ratio = owner.hp / Math.max(1, owner.maxHp);
          if (owner._hydraHeads === 3 && ratio <= 0.66) {
            owner._hydraHeads = 2;
            addStatBonus(owner, 'HPPerSecond', -15, false, 'combat', sim.data);
          }
          if (owner._hydraHeads === 2 && ratio <= 0.33) {
            owner._hydraHeads = 1;
            addStatBonus(owner, 'HPPerSecond', -15, false, 'combat', sim.data);
          }
        },
      });
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          const extra = (owner._hydraHeads || 1) - 1;
          if (extra > 0 && ctx.target) {
            const dmg = sim.getAutoAttackDamage(owner) * 0.33;
            for (let k = 0; k < extra; k++) {
              sim.dealDamage(owner, ctx.target, dmg, { origin: 'attack', damageType: 'physical', canCrit: true });
            }
          }
        },
      });
      break;

    // --- Hero Passives ---
    case 10101: // Limitless (Irini): Each auto attack, +1 AS. After Stall(15), auto attacks deal 100% AS bonus damage.
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          addStatBonus(owner, 'AttackSpeed', 1, false, 'combat', sim.data);
          if (sim.isStallReached(owner, 15) && ctx.target) {
            const bonus = getUnitStat(owner, 'AttackSpeed');
            sim.dealDamage(owner, ctx.target, bonus, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        },
      });
      break;
    case 10102: // The Mighty (Irini): After Stall(10), whenever a Duelist auto attacks, +Rank AS and +Rank Attack.
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (sim.isStallReached(owner, 10) && ctx.source?.team === owner.team && unitHasClass(ctx.source, 5)) {
            const r = owner.rank || 1;
            addStatBonus(ctx.source, 'AttackSpeed', r, false, 'combat', sim.data);
            addStatBonus(ctx.source, 'Attack', r, false, 'combat', sim.data);
          }
        },
      });
      break;
    case 10201: // The Conduit (Hoyoung): On kill, +3 ManaRegen and Stealth 4s.
      add({
        Trigger: 'OnCharacterKilled',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          addStatBonus(owner, 'ManaRegen', 3, false, 'perm', sim.data);
          sim.applyStatus(owner, owner, 'Stealth', 1, 4.0);
        },
      });
      break;
    case 10202: // The Hunter (Hoyoung): Killshot gains 50+50_Rank Crit the first 1+1_Rank casts. On kill, +1 Shard/hex.
      owner._hunterCastsRemaining = 1 + (owner.rank || 1);
      add({
        Trigger: 'OnCharacterKilled',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          const dist = ctx.target ? hexDistance(owner, ctx.target) : 1;
          sim.gainShards(dist, { source: owner, target: ctx.target || owner });
        },
      });
      break;
    case 10203: // The Sniper (Hoyoung): Target furthest enemy. Auto attacks gain (10+10_Rank) AD and (3+3_Rank) Crit per hex.
      owner.preferFarthestTarget = true;
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          const dist = hexDistance(owner, ctx.target);
          const r = owner.rank || 1;
          addStatBonus(owner, 'Attack', (10 + 10 * (r - 1)) * dist, false, 'temp', sim.data);
          addStatBonus(owner, 'Crit', (3 + 3 * (r - 1)) * dist, false, 'temp', sim.data);
        },
      });
      break;
    case 10301: // The Champion (Reyna): +3 Attack per Rush triggered. For Rush(8), Warriors gain +1 Crit & +1 Omnivamp per Rush.
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const triggers = Math.max(1, sim.rushTriggersThisGame);
          addStatBonus(owner, 'Attack', 3 * triggers, false, 'combat', sim.data);
        },
      });
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 8.0,
        customRun: (sim) => {
          const triggers = Math.max(1, sim.rushTriggersThisGame);
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 1)) {
              addStatBonus(h, 'Crit', triggers, false, 'temp', sim.data);
              addStatBonus(h, 'OmniVamp', triggers, false, 'temp', sim.data);
            }
          }
        },
      });
      break;
    case 10302: // The Brawler (Reyna): Triple Threat +33% Shields. +1 Attack per 10 Shields up to 50% MaxHP.
      owner._brawlerSpec = true;
      add({
        Trigger: 'PerFrameEvaluation',
        customRun: (sim) => {
          const bonus = Math.min(owner.maxHp * 0.5, Math.floor((owner.shield || 0) / 10));
          addStatBonus(owner, 'Attack', bonus, false, 'temp', sim.data);
        },
      });
      break;
    case 10303: // The Boxer (Reyna): Every 3 auto attacks, deal 50+225%_Attack bonus damage and 3+1/5_AS Burn.
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        TriggerIncrement: 3,
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          const dmg = 50 + getUnitStat(owner, 'Attack') * 2.25;
          const burn = 3 + Math.floor(getUnitStat(owner, 'AttackSpeed') / 5);
          sim.dealDamage(owner, ctx.target, dmg, { origin: 'effect', damageType: 'physical', canCrit: true });
          sim.applyStatus(owner, ctx.target, 'Burn', burn);
        },
      });
      break;
    case 10401: // The Shadow (Yuuna): Below 75% HP -> Stealth 4s + 40 Mana + 5*Rank Crit.
      add({
        Trigger: 'OnDamageReceived',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim) => {
          if (owner._shadowTriggered || owner.hp > owner.maxHp * 0.75) return;
          owner._shadowTriggered = true;
          sim.applyStatus(owner, owner, 'Stealth', 1, 4.0);
          sim.giveMana(owner, 40);
          addStatBonus(owner, 'Crit', 5 * (owner.rank || 1), false, 'perm', sim.data);
        },
      });
      break;
    case 10402: // The Collector (Yuuna): +1 shuriken. On kill, gain 5 Shards.
      owner._extraShurikens = (owner._extraShurikens || 0) + 1;
      add({
        Trigger: 'OnCharacterKilled',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!owner._collectorTriggered) {
            owner._collectorTriggered = true;
            sim.gainShards(5, { source: owner, target: ctx.target || owner });
          }
        },
      });
      break;
    case 10403: // The Nightshade (Yuuna): Whenever an Assassin Crits, inflict 4*Rank Poison.
      owner._nightshadeSpec = true;
      add({
        Trigger: 'OnGlobalCrit',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === owner.team && unitHasClass(ctx.source, 4) && ctx.target) {
            sim.applyStatus(ctx.source, ctx.target, 'Poison', 4 * (owner.rank || 1));
          }
        },
      });
      break;
    case 10501: // Stone Skin (Zuri): On Crit, gain +1 Defense and +1 Magic (up to max triggers).
      add({
        Trigger: 'OnGlobalCrit',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          const maxTrig = 2 + Math.floor(getUnitStat(owner, 'Crit') / 20) + Math.floor(getUnitStat(owner, 'Defense') / 60);
          owner._stoneSkinCount = (owner._stoneSkinCount || 0) + 1;
          if (owner._stoneSkinCount <= maxTrig) {
            addStatBonus(owner, 'Defense', 1, false, 'perm', sim.data);
            addStatBonus(owner, 'Magic', 1, false, 'perm', sim.data);
          }
        },
      });
      break;
    case 10502: // The Serpent's Kiss (Zuri): When auto attacked, inflict Poison and gain +Rank HP/S.
      add({
        Trigger: 'OnAttackDamageReceived',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim, ctx) => {
          const p = 1 + Math.floor(getUnitStat(owner, 'Defense') / 60) + Math.floor(getUnitStat(owner, 'Magic') / 50);
          if (ctx.source) sim.applyStatus(owner, ctx.source, 'Poison', p);
          addStatBonus(owner, 'HPPerSecond', owner.rank || 1, false, 'combat', sim.data);
        },
      });
      break;
    case 10503: // The Bladedancer (Zuri): Rush(10) and Stall(20) bonus damage & heal on auto attack.
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          if (sim.isRushActive(owner, 10)) {
            const v = 5 + getUnitStat(owner, 'Crit') + getUnitStat(owner, 'Magic') * 0.5;
            sim.dealDamage(owner, ctx.target, v, { origin: 'effect', damageType: 'magic', canCrit: false });
            sim.healUnit(owner, owner, v);
          }
          if (sim.isStallReached(owner, 20)) {
            const v = 5 + getUnitStat(owner, 'Crit') + getUnitStat(owner, 'Defense') * 0.5;
            sim.dealDamage(owner, ctx.target, v, { origin: 'effect', damageType: 'magic', canCrit: false });
            sim.healUnit(owner, owner, v);
          }
        },
      });
      break;
    case 10601: // The Crescendo (Aria): On Stall trigger +3 Magic; After Stall(20,40,60) +50% Magic.
      owner._crescendoSpec = true;
      add({
        Trigger: 'OnStallStart',
        AttachmentType: 'Global',
        customRun: (sim) => addStatBonus(owner, 'Magic', 3, false, 'perm', sim.data),
      });
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 20.0,
        customRun: (sim) => addStatBonus(owner, 'Magic', 50, true, 'combat', sim.data),
      });
      break;
    case 10602: // The Resplendent (Aria): Mages inflict +(10+10*Rank)% more Debuffs; Aria +50% more.
      owner._debuffAmp = (owner._debuffAmp || 0) + 0.5;
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const bonus = (10 + 10 * (owner.rank || 1)) / 100;
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 7)) h._debuffAmp = (h._debuffAmp || 0) + bonus;
          }
        },
      });
      break;
    case 10603: // The Harmony (Aria)
      owner._harmonySpec = true;
      break;
    case 10701: // The Keen-Eyed (Nyx): Assassins and Duelists execute enemies below (15+5*Rank)% MaxHP.
      add({
        Trigger: 'OnDamageDealt',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (!ctx.source || !ctx.target || ctx.source.team !== owner.team || ctx.target.hp <= 0) return;
          if (unitHasClass(ctx.source, 4) || unitHasClass(ctx.source, 5)) {
            const thresh = (15 + 5 * (owner.rank || 1)) / 100;
            if (ctx.target.hp / Math.max(1, ctx.target.maxHp) <= thresh) {
              sim.dealDamage(ctx.source, ctx.target, ctx.target.hp + 9999, { origin: 'effect', damageType: 'true', ignoresShield: true });
            }
          }
        },
      });
      break;
    case 10702: // Ferality (Nyx): For Rush(5), gain 5+25%_AS AS and 5+25%_AD AD. Every 12 attacks refresh Rush.
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 5.0,
        customRun: (sim) => {
          addStatBonus(owner, 'AttackSpeed', 5 + getUnitStat(owner, 'AttackSpeed') * 0.25, false, 'temp', sim.data);
          addStatBonus(owner, 'Attack', 5 + getUnitStat(owner, 'Attack') * 0.25, false, 'temp', sim.data);
        },
      });
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        TriggerIncrement: 12,
        customRun: (sim) => sim.refreshUnitRush(owner),
      });
      break;
    case 10703: // The Spark (Nyx): Stall(10) Burn, Stall(20) Frost, Stall(30) Poison on auto attack
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          const as = getUnitStat(owner, 'AttackSpeed');
          if (sim.isStallReached(owner, 10)) sim.applyStatus(owner, ctx.target, 'Burn', 1 + Math.floor(as / 50));
          if (sim.isStallReached(owner, 20)) sim.applyStatus(owner, ctx.target, 'Frost', 1 + Math.floor(as / 75));
          if (sim.isStallReached(owner, 30)) sim.applyStatus(owner, ctx.target, 'Poison', 1 + Math.floor(as / 100));
        },
      });
      break;
    case 10801: // The Bloomer (Pollen)
      owner._bloomerSpec = true;
      break;
    case 10802: // The Fae's Kiss (Pollen)
      owner._faeKissSpec = true;
      break;
    case 10803: // The Earth's Child (Pollen)
      owner._earthsChildSpec = true;
      break;
    case 10901: // Red Hot Deals (Niklas): For Rush(14), auto attacks inflict (1+MaxHP/500) Burn per item
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (sim.isRushActive(owner, 14) && ctx.target) {
            const itemsCount = Math.max(1, (owner.items || []).length);
            const burn = (1 + Math.floor(owner.maxHp / 500)) * itemsCount;
            sim.applyStatus(owner, ctx.target, 'Burn', burn);
          }
        },
      });
      break;
    case 10902: // The Executive (Niklas): For Rush(15), gain 33% MaxHP Shield per equipped item
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const itemsCount = Math.max(1, (owner.items || []).length);
          sim.applyShield(owner, owner, owner.maxHp * 0.33 * itemsCount, 15.0);
        },
      });
      break;
    case 10903: // The Hoarder (Niklas): For Rush(20), Vanguards/Tanks reflect 1 dmg per Shard generated
      add({
        Trigger: 'OnAttackDamageReceived',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (sim.isRushActive(owner, 20) && ctx.target?.team === owner.team && ctx.source) {
            if (unitHasClass(ctx.target, 2) || unitHasClass(ctx.target, 3)) {
              sim.dealDamage(ctx.target, ctx.source, Math.max(5, sim.shardsGeneratedThisGame), { origin: 'effect', damageType: 'physical', canCrit: false });
            }
          }
        },
      });
      break;
    case 101001: // The Right Hand (Fiona): Every 5 casts, gain 2*Rank Shards
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        TriggerIncrement: 5,
        customRun: (sim) => sim.gainShards(2 * (owner.rank || 1), { source: owner }),
      });
      break;
    case 101002: // The Lustrous (Fiona): On cast, gain 33% MaxHP Shield. When shielded Hero damaged, inflict 1*Rank Burn.
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => sim.applyShield(owner, owner, owner.maxHp * 0.33, 10.0),
      });
      add({
        Trigger: 'OnDamageReceived',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (ctx.target?.team === owner.team && (ctx.target.shield || 0) > 0 && ctx.source && ctx.source.team !== owner.team) {
            sim.applyStatus(owner, ctx.source, 'Burn', owner.rank || 1);
          }
        },
      });
      break;
    case 101003: // The Tycoon (Fiona): At start of combat, Heroes gain 75 + 4*ManaRegen MaxHP
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const bonus = 75 + getUnitStat(owner, 'ManaRegen') * 4;
          for (const h of sim.getAliveUnits(owner.team)) {
            addStatBonus(h, 'MaxHealth', bonus, false, 'combat', sim.data);
          }
        },
      });
      break;
    case 101101: // Hearty (Rowan): After Stall(10), gain 2 + MaxHP/100 + Defense/15 HP/S
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 10.0,
        customRun: (sim) => {
          const hps = 2 + Math.floor(owner.maxHp / 100) + Math.floor(getUnitStat(owner, 'Defense') / 15);
          addStatBonus(owner, 'HPPerSecond', hps, false, 'combat', sim.data);
        },
      });
      break;
    case 101102: // The Protector (Rowan): On auto attack, gain 3% MaxHP Shield, deal (50+25*Rank)% of Shield bonus damage
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          sim.applyShield(owner, owner, owner.maxHp * 0.03, 10.0);
          if (ctx.target && owner.shield > 0) {
            const pct = (50 + 25 * (owner.rank || 1)) / 100;
            const dmg = Math.min(owner.maxHp * 10, owner.shield * pct);
            sim.dealDamage(owner, ctx.target, dmg, { origin: 'effect', damageType: 'physical', canCrit: false });
          }
        },
      });
      break;
    case 101103: // The Friend (Rowan): On Stall trigger, permanently gain 20 MaxHP and 5 Defense
      add({
        Trigger: 'OnStallStart',
        AttachmentType: 'Global',
        customRun: (sim) => {
          addStatBonus(owner, 'MaxHealth', 20, false, 'perm', sim.data);
          addStatBonus(owner, 'Defense', 5, false, 'perm', sim.data);
        },
      });
      break;
    case 101201: // Retribution (Skorn): When auto attacked after Stall(10), deal 2+100%_Magic dmg and 1+Def/50 Poison
      add({
        Trigger: 'OnAttackDamageReceived',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim, ctx) => {
          if (sim.isStallReached(owner, 10) && ctx.source) {
            sim.dealDamage(owner, ctx.source, 2 + getUnitStat(owner, 'Magic'), { origin: 'effect', damageType: 'magic', canCrit: false });
            sim.applyStatus(owner, ctx.source, 'Poison', 1 + Math.floor(getUnitStat(owner, 'Defense') / 50));
          }
        },
      });
      break;
    case 101202: // The Winter's Bite (Skorn): Inflicting Poison also inflicts Frost; inflicting Frost grants 10*Rank Shield
      add({
        Trigger: 'OnStatusStacksApplied',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (ctx.status === 'Poison' && ctx.target && !ctx._fromWintersBite) {
            sim.applyStatus(owner, ctx.target, 'Frost', ctx.amount || 1, null, { _fromWintersBite: true });
          } else if (ctx.status === 'Frost') {
            sim.applyShield(owner, owner, 10 * (owner.rank || 1), 10.0);
          }
        },
      });
      break;
    case 101203: // The Bristleguard (Skorn): Start of combat: per Tank, inflict 10*Rank Poison on enemies & +10*Rank Def to Heroes
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const tanks = sim.getAliveUnits(owner.team).filter((u) => unitHasClass(u, 2)).length;
          if (tanks <= 0) return;
          const val = 10 * (owner.rank || 1) * tanks;
          for (const e of sim.getAliveUnits(owner.team === 1 ? 2 : 1)) sim.applyStatus(owner, e, 'Poison', val);
          for (const h of sim.getAliveUnits(owner.team)) addStatBonus(h, 'Defense', val, false, 'combat', sim.data);
        },
      });
      break;
    case 101301: // The Iron (Logan): For Rush(12), Warriors gain 2*Rank Attack & Defense per Rush trigger
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 12.0,
        customRun: (sim) => {
          const val = 2 * (owner.rank || 1) * Math.max(1, sim.rushTriggersThisGame);
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 1)) {
              addStatBonus(h, 'Attack', val, false, 'temp', sim.data);
              addStatBonus(h, 'Defense', val, false, 'temp', sim.data);
            }
          }
        },
      });
      break;
    case 101302: // The Juggernaut (Logan): Execution damage grants (25+50*Rank)% lasting Shield
      owner._juggernautSpec = true;
      break;
    case 101303: // The Momentous (Logan): On kill, +40 Mana, +15 Attack, +5 Crit
      add({
        Trigger: 'OnCharacterKilled',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          sim.giveMana(owner, 40);
          addStatBonus(owner, 'Attack', 15, false, 'perm', sim.data);
          addStatBonus(owner, 'Crit', 5, false, 'perm', sim.data);
        },
      });
      break;
    case 101401: // The Stoked (Funke): When enemy in range takes Burn damage, Mages +Rank Magic, Funke +1 Mana
      add({
        Trigger: 'OnStatusDamageReceived',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (ctx.status === 'Burn' && ctx.target && ctx.target.team !== owner.team) {
            if (hexDistance(owner, ctx.target) <= getUnitStat(owner, 'AttackRange')) {
              sim.giveMana(owner, 1);
            }
            for (const h of sim.getAliveUnits(owner.team)) {
              if (unitHasClass(h, 7) && hexDistance(h, ctx.target) <= getUnitStat(h, 'AttackRange')) {
                addStatBonus(h, 'Magic', owner.rank || 1, false, 'combat', sim.data);
              }
            }
          }
        },
      });
      break;
    case 101402: // The Inferno (Funke): +2 AttackRange. Start of combat & Stall(15): inflict 25+Magic/3 Burn in range
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          addStatBonus(owner, 'AttackRange', 2, false, 'const', sim.data);
          const burn = 25 + Math.floor(getUnitStat(owner, 'Magic') / 3);
          for (const e of sim.getAliveUnits(owner.team === 1 ? 2 : 1)) {
            if (hexDistance(owner, e) <= getUnitStat(owner, 'AttackRange')) sim.applyStatus(owner, e, 'Burn', burn);
          }
        },
      });
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 15.0,
        customRun: (sim) => {
          const burn = 25 + Math.floor(getUnitStat(owner, 'Magic') / 3);
          for (const e of sim.getAliveUnits(owner.team === 1 ? 2 : 1)) {
            if (hexDistance(owner, e) <= getUnitStat(owner, 'AttackRange')) sim.applyStatus(owner, e, 'Burn', burn);
          }
        },
      });
      break;
    case 101403: // The Detonator (Funke): On cast, enemies in range take 7*Rank ticks of Burn damage
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          const ticks = 7 * (owner.rank || 1);
          for (const e of sim.getAliveUnits(owner.team === 1 ? 2 : 1)) {
            const b = e.statuses?.Burn || 0;
            if (b > 0 && hexDistance(owner, e) <= getUnitStat(owner, 'AttackRange')) {
              sim.dealDamage(owner, e, b * ticks, { origin: 'status', damageType: 'burn', canCrit: false });
            }
          }
        },
      });
      break;
    case 101501: // Luxurious (Tilly): Gain 25% AD as AS and 25% AS as AD. Every 25 attacks gain 2*Rank Shards.
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const ad = getUnitStat(owner, 'Attack');
          const as = getUnitStat(owner, 'AttackSpeed');
          addStatBonus(owner, 'AttackSpeed', ad * 0.25, false, 'combat', sim.data);
          addStatBonus(owner, 'Attack', as * 0.25, false, 'combat', sim.data);
        },
      });
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        TriggerIncrement: 25,
        customRun: (sim, ctx) => sim.gainShards(2 * (owner.rank || 1), { source: owner, target: ctx.target || owner }),
      });
      break;
    case 101502: // The Stylish (Tilly): On auto attack, bonus damage per Shard generated
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (ctx.target && sim.shardsGeneratedThisGame > 0) {
            sim.dealDamage(owner, ctx.target, sim.shardsGeneratedThisGame, { origin: 'effect', damageType: 'physical', canCrit: false });
          }
        },
      });
      break;
    case 101503: // The Sharp (Tilly): Rush(10) Warriors +8*Rank% AD & +4*Rank% Crit; Stall(20) Duelists +8*Rank% AS & +4*Rank% Crit
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 10.0,
        customRun: (sim) => {
          const r = owner.rank || 1;
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 1)) {
              addStatBonus(h, 'Attack', 8 * r, true, 'temp', sim.data);
              addStatBonus(h, 'Crit', 4 * r, true, 'temp', sim.data);
            }
          }
        },
      });
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 20.0,
        customRun: (sim) => {
          const r = owner.rank || 1;
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 5)) {
              addStatBonus(h, 'AttackSpeed', 8 * r, true, 'combat', sim.data);
              addStatBonus(h, 'Crit', 4 * r, true, 'combat', sim.data);
            }
          }
        },
      });
      break;
    case 101601: // The Investor (Gustav): Start of combat give all Heroes +4 ManaRegen
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(owner.team)) addStatBonus(h, 'ManaRegen', 4, false, 'combat', sim.data);
        },
      });
      break;
    case 101602: // The Glacier (Gustav): Blizzard applies +75% Defense Shields; Stall(25) +2*Rank Defense
      owner._glacierSpec = true;
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 25.0,
        customRun: (sim) => addStatBonus(owner, 'Defense', 2 * (owner.rank || 1), false, 'perm', sim.data),
      });
      break;
    case 101603: // The Avalanche (Gustav): On cast, +1 Shard, +1 ManaRegen, +5 Magic
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          sim.gainShards(1, { source: owner });
          addStatBonus(owner, 'ManaRegen', 1, false, 'combat', sim.data);
          addStatBonus(owner, 'Magic', 5, false, 'combat', sim.data);
        },
      });
      break;
    case 101701: // The Fashionable (Ratna): Start of combat +45 Magic, +3 ManaRegen, +6 HP/S per item rarity
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const count = Math.max(1, (owner.items || []).length * 2);
          addStatBonus(owner, 'Magic', 45 * count, false, 'combat', sim.data);
          addStatBonus(owner, 'ManaRegen', 3 * count, false, 'combat', sim.data);
          addStatBonus(owner, 'HPPerSecond', 6 * count, false, 'combat', sim.data);
        },
      });
      break;
    case 101702: // The Ostentatious (Ratna): On cast, other Heroes gain 25% of Ratna's Magic & ManaRegen
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          const m = getUnitStat(owner, 'Magic') * 0.25;
          const mr = getUnitStat(owner, 'ManaRegen') * 0.25;
          for (const h of sim.getAliveUnits(owner.team)) {
            if (h.uid !== owner.uid) {
              addStatBonus(h, 'Magic', m, false, 'combat', sim.data);
              addStatBonus(h, 'ManaRegen', mr, false, 'combat', sim.data);
            }
          }
        },
      });
      break;
    case 101703: // The Magnanimous (Ratna): Starfall also hits lowest health enemy; on kill Stealth 4s + Crit
      owner._magnanimousSpec = true;
      add({
        Trigger: 'OnCharacterKilled',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          sim.applyStatus(owner, owner, 'Stealth', 1, 4.0);
          addStatBonus(owner, 'Crit', 3 + 2 * (owner.rank || 1), false, 'perm', sim.data);
        },
      });
      break;
    case 101801: // Bloodthirsty (Rip): Rush(10) +5% MaxHP Attack; below 50% HP refresh Rush & +2% MaxHP AS
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 10.0,
        customRun: (sim) => addStatBonus(owner, 'Attack', owner.maxHp * 0.05, false, 'temp', sim.data),
      });
      add({
        Trigger: 'OnDamageReceived',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim) => {
          if (!owner._bloodthirstyTriggered && owner.hp <= owner.maxHp * 0.5) {
            owner._bloodthirstyTriggered = true;
            sim.refreshUnitRush(owner);
            addStatBonus(owner, 'AttackSpeed', owner.maxHp * 0.02, false, 'combat', sim.data);
          }
        },
      });
      break;
    case 101802: // The Glutton (Rip): On Rush trigger, permanently gain 33 MaxHP
      add({
        Trigger: 'OnRushStart',
        AttachmentType: 'Global',
        customRun: (sim) => addStatBonus(owner, 'MaxHealth', 33, false, 'perm', sim.data),
      });
      break;
    case 101803: // The Brute (Rip): On Crit, steal 50% Crit Health from target
      add({
        Trigger: 'OnGlobalCrit',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          const amt = getUnitStat(owner, 'Crit') * 0.5;
          if (ctx.target && amt > 0) {
            sim.dealDamage(owner, ctx.target, amt, { origin: 'effect', damageType: 'true', canCrit: false });
            sim.healUnit(owner, owner, amt);
          }
        },
      });
      break;
    case 102001: // The Falling Snow (Karsu): On auto attack reduce MaxMana by 1 (min 40); Stall(15) +33*Rank Crit
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          if (owner.maxMana > 40) {
            addStatBonus(owner, 'MaxMana', -1, false, 'combat', sim.data);
          }
        },
      });
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 15.0,
        customRun: (sim) => addStatBonus(owner, 'Crit', 33 * (owner.rank || 1), false, 'combat', sim.data),
      });
      break;
    case 102002: // The Warband (Karsu): On cast permanently gain +2 Crit, +3 Attack, +4 AttackSpeed
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          addStatBonus(owner, 'Crit', 2, false, 'perm', sim.data);
          addStatBonus(owner, 'Attack', 3, false, 'perm', sim.data);
          addStatBonus(owner, 'AttackSpeed', 4, false, 'perm', sim.data);
        },
      });
      break;
    case 102003: // The Frostbite (Karsu): On auto attack fire bonus arrow inflicting Frost and (1+10% AD)% damage
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          const frost = 1 + Math.floor(getUnitStat(owner, 'AttackSpeed') / 100);
          const pct = Math.min(2.0, (1 + getUnitStat(owner, 'Attack') * 0.1) / 100);
          sim.applyStatus(owner, ctx.target, 'Frost', frost);
          sim.dealDamage(owner, ctx.target, sim.getAutoAttackDamage(owner) * pct, { origin: 'attack', damageType: 'physical', canCrit: true });
        },
      });
      break;
    case 102101: // Inner Flame (Ming): Each second inflict MaxHP/600 Burn on adjacent enemies (doubled during Rush(7))
      add({
        Trigger: 'OnInterval',
        EffectInterval: 1.0,
        customRun: (sim) => {
          let burn = Math.max(1, Math.floor(owner.maxHp / 600));
          if (sim.isRushActive(owner, 7)) burn *= 2;
          for (const e of sim.getAliveUnits(owner.team === 1 ? 2 : 1)) {
            if (hexDistance(owner, e) <= 1) sim.applyStatus(owner, e, 'Burn', burn);
          }
        },
      });
      break;
    case 102102: // The Tempered (Ming): For Rush(15), Vanguards gain (20+30*Rank)% MaxHP
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 15.0,
        customRun: (sim) => {
          const pct = 20 + 30 * ((owner.rank || 1) - 1);
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 3)) addStatBonus(h, 'MaxHealth', pct, true, 'temp', sim.data);
          }
        },
      });
      break;
    case 102103: // The Enlightened (Ming): Rush duration +2*Rank s; Rush(1) DamageImmunity
      add({
        Trigger: 'Constant',
        customRun: (sim) => {
          sim.bonusRushDuration += 2 * (owner.rank || 1);
        },
      });
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          sim.applyStatus(owner, owner, 'DamageImmunity', 1, 1.0 + (sim.bonusRushDuration || 0));
        },
      });
      break;
    case 102201: // The Spicy (Pimenta): On auto attack, per debuff type on target inflict (2+Rank) more & deal (10+75% AS) dmg
      add({
        Trigger: 'OnAutoAttack',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (!ctx.target) return;
          const types = countDebuffTypes(ctx.target);
          if (types <= 0) return;
          const more = 1 + (owner.rank || 1);
          for (const st of ['Burn', 'Frost', 'Poison', 'Bleed']) {
            if ((ctx.target.statuses?.[st] || 0) > 0) sim.applyStatus(owner, ctx.target, st, more);
          }
          const dmg = (10 + getUnitStat(owner, 'AttackSpeed') * 0.75) * types;
          sim.dealDamage(owner, ctx.target, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
        },
      });
      break;
    case 102202: // The Seasoned (Pimenta): Pepper Spray expands/lasts +1s; Stall(15) Tanks & Mages +20*Rank Defense
      owner._seasonedSpec = true;
      add({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 15.0,
        customRun: (sim) => {
          const val = 20 * (owner.rank || 1);
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 2) || unitHasClass(h, 7)) addStatBonus(h, 'Defense', val, false, 'combat', sim.data);
          }
        },
      });
      break;
    case 102203: // The Lover (Pimenta): Start of combat Heroes behind Pimenta +15 AS
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(owner.team)) {
            if (h.cellY < owner.cellY && Math.abs(h.cellX - owner.cellX) <= 1) {
              addStatBonus(h, 'AttackSpeed', h.defId === 23 ? 30 : 15, false, 'perm', sim.data);
            }
          }
        },
      });
      break;
    case 102301: // The Breezy (Sal): Whenever a Mage or Duelist inflicts a Debuff, +Rank AS and +Rank Magic
      add({
        Trigger: 'OnStatusStacksApplied',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === owner.team && DEBUFF_STATUSES.includes(ctx.status)) {
            if (unitHasClass(ctx.source, 7) || unitHasClass(ctx.source, 5)) {
              const r = owner.rank || 1;
              addStatBonus(ctx.source, 'AttackSpeed', r, false, 'combat', sim.data);
              addStatBonus(ctx.source, 'Magic', r, false, 'combat', sim.data);
            }
          }
        },
      });
      break;
    case 102302: // The Lover (Sal): Start of combat Heroes in front of Sal +20 Defense
      add({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(owner.team)) {
            if (h.cellY > owner.cellY && Math.abs(h.cellX - owner.cellX) <= 1) {
              addStatBonus(h, 'Defense', h.defId === 22 ? 40 : 20, false, 'perm', sim.data);
            }
          }
        },
      });
      break;
    case 102303: // The Brisk (Sal): On Crit inflict 1*Rank Frost; On cast gain 33% AD + 33% Magic Crit
      add({
        Trigger: 'OnGlobalCrit',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (ctx.target) sim.applyStatus(owner, ctx.target, 'Frost', owner.rank || 1);
        },
      });
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          const c = (getUnitStat(owner, 'Attack') + getUnitStat(owner, 'Magic')) * 0.33;
          addStatBonus(owner, 'Crit', c, false, 'combat', sim.data);
        },
      });
      break;
    case 102401: // The Greedy (Dragomir): On cast gain +Rank Omnivamp and +Rank Crit
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          const r = owner.rank || 1;
          addStatBonus(owner, 'OmniVamp', r, false, 'perm', sim.data);
          addStatBonus(owner, 'Crit', r, false, 'perm', sim.data);
        },
      });
      break;
    case 102402: // The Sanguine (Dragomir): On cast +5*Rank Omnivamp & teleport behind lowest HP enemy
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          addStatBonus(owner, 'OmniVamp', 5 * (owner.rank || 1), false, 'combat', sim.data);
          const low = sim.findTargetByType(owner, 'LowestHealthEnemy');
          if (low) sim.teleportUnit(owner, low.cellX, Math.min(7, low.cellY + 1));
        },
      });
      break;
    case 102403: // The Kingpin (Dragomir): Rush(8) Assassins and Vanguards gain +1 Omnivamp & +1 Crit per Shard
      add({
        Trigger: 'Constant',
        Keyword: 'Rush',
        RushDuration: 8.0,
        customRun: (sim) => {
          const sh = Math.max(2, sim.shardsGeneratedThisGame);
          for (const h of sim.getAliveUnits(owner.team)) {
            if (unitHasClass(h, 4) || unitHasClass(h, 3)) {
              addStatBonus(h, 'OmniVamp', sh, false, 'temp', sim.data);
              addStatBonus(h, 'Crit', sh, false, 'temp', sim.data);
            }
          }
        },
      });
      break;
    case 102601: // The Unstoppable (Kai): +60% Shields; whenever Kai gains Shields, + (9+6*(Rank-1)) Attack
      owner._shieldAmp = (owner._shieldAmp || 0) + 0.6;
      add({
        Trigger: 'OnShieldApplied',
        AttachmentType: 'OwnerIsTarget',
        customRun: (sim) => {
          addStatBonus(owner, 'Attack', 9 + 6 * ((owner.rank || 1) - 1), false, 'combat', sim.data);
        },
      });
      break;
    case 102602: // The Bold (Kai): Resolute Strike 1s faster & larger; On cast after Stall(15) gain 100+400%_Def Shield
      owner._boldSpec = true;
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim) => {
          if (sim.isStallReached(owner, 15)) {
            sim.applyShield(owner, owner, 100 + getUnitStat(owner, 'Defense') * 4, 999.0);
          }
        },
      });
      break;
    case 102603: // The Intrepid (Kai): On Crit during Rush(6), +Rank AD & (100+200% AD) Shield; Warriors on Crit -Def
      add({
        Trigger: 'OnGlobalCrit',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (ctx.source?.uid === owner.uid && sim.isRushActive(owner, 6)) {
            addStatBonus(owner, 'Attack', owner.rank || 1, false, 'perm', sim.data);
            sim.applyShield(owner, owner, 100 + getUnitStat(owner, 'Attack') * 2, 999.0);
          }
          if (ctx.source?.team === owner.team && unitHasClass(ctx.source, 1) && ctx.target) {
            addStatBonus(ctx.target, 'Defense', -(1 + (owner.rank || 1)), false, 'combat', sim.data);
          }
        },
      });
      break;
    case 102701: // The Selfless (Grace): After Stall(10), Salvation targets all Heroes
      owner._selflessSpec = true;
      break;
    case 102702: // The Benevolent (Grace): On cast after Stall(15), give target +15% primary stats
      add({
        Trigger: 'OnAbilityCast',
        AttachmentType: 'OwnerIsSource',
        customRun: (sim, ctx) => {
          if (sim.isStallReached(owner, 15)) {
            const tgt = ctx.target || owner;
            for (const s of BASIC_STATS) addStatBonus(tgt, s, 10, true, 'perm', sim.data);
          }
        },
      });
      break;
    case 102703: // The Radiant (Grace): Whenever a Mystic Shields a Hero, give that Hero 4*Rank Attack & Magic
      add({
        Trigger: 'OnShieldApplied',
        AttachmentType: 'Global',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === owner.team && unitHasClass(ctx.source, 6) && ctx.target?.team === owner.team) {
            const val = 4 * (owner.rank || 1);
            addStatBonus(ctx.target, 'Attack', val, false, 'combat', sim.data);
            addStatBonus(ctx.target, 'Magic', val, false, 'combat', sim.data);
          }
        },
      });
      break;
    default:
      // Parse description fallback if any custom passive id was added
      return parseDescriptionEffects(pa.description, 'PassiveAbility', owner.uid, id);
  }

  return list;
}

/**
 * Builds runtime ModularEffect descriptors for an equipped Item (non-quest effects + specialEffects).
 * Base statMods are applied separately via itemDef.statMods in index.js, so we strip the duplicate
 * initial Constant NoCondition Owner ModifyStatAction effect when statMods are present.
 */
export function buildItemEffects(itemId, owner, data, customStacks = 0) {
  const id = Number(itemId);
  const itemDef = data?.items?.[id] || data?.items?.[String(id)];
  if (!itemDef || !owner) return [];

  const list = [];
  const hasStatMods = Array.isArray(itemDef.statMods) && itemDef.statMods.length > 0;
  const rawEffects = Array.isArray(itemDef.effects) ? itemDef.effects : [];

  for (let i = 0; i < rawEffects.length; i++) {
    const eff = rawEffects[i];
    if (!eff || eff.type === 'QuestEffect') continue;
    if (
      i === 0 &&
      hasStatMods &&
      eff.Trigger === 'Constant' &&
      (!eff.Keyword || eff.Keyword === 'None') &&
      (!eff.TargetType || eff.TargetType === 'Owner') &&
      (!eff.condition || eff.condition.type === 'NoCondition') &&
      Array.isArray(eff.actions) &&
      eff.actions.length > 0 &&
      eff.actions.every((a) => a.type === 'ModifyStatAction')
    ) {
      continue;
    }
    list.push({
      ...eff,
      _origin: 'Item',
      _ownerUid: owner.uid,
      _itemId: id,
      _customStacks: Number(customStacks) || 0,
    });
  }

  const LEGACY_STACK_CONFIG = {
    601: { stat: 'Attack', amount: 12 },
    602: { stat: 'Defense', amount: 2 },
    603: { stat: 'MaxHealth', amount: 20 },
    604: { stat: 'Crit', amount: 4 },
    605: { stat: 'AttackSpeed', amount: 1 },
    606: { stat: 'Magic', amount: 10 },
    607: { stat: 'ManaRegen', amount: 1 },
  };
  const legacyCfg = LEGACY_STACK_CONFIG[id];

  for (const eff of itemDef.specialEffects || []) {
    if (!eff || eff.type === 'QuestEffect') continue;
    const copy = {
      ...eff,
      _origin: 'Item',
      _ownerUid: owner.uid,
      _itemId: id,
      _customStacks: Number(customStacks) || 0,
    };
    if (legacyCfg && (!Array.isArray(copy.actions) || copy.actions.length === 0)) {
      copy.actions = [
        {
          type: 'ModifyPermanentStatAction',
          StatType: legacyCfg.stat,
          Value: legacyCfg.amount,
          _legacyStackItem: true,
        },
      ];
    } else if (legacyCfg && Array.isArray(copy.actions)) {
      copy.actions = copy.actions.map((a) =>
        a.type === 'ApplyItemStatsFromLegacyStacksAction'
          ? { ...a, stat: legacyCfg.stat, amountPerStack: legacyCfg.amount || a.amountPerStack || 1 }
          : a
      );
    }
    list.push(copy);
  }

  return list;
}

/**
 * Extracts and wraps the reward ModularEffects for a completed Item or Relic Quest.
 */
export function buildQuestRewardEffects(kind, defId, owner, data) {
  const id = Number(defId);
  const def =
    kind === 'item'
      ? data?.items?.[id] || data?.items?.[String(id)]
      : data?.relics?.[id] || data?.relics?.[String(id)];
  if (!def) return [];

  const origin = kind === 'item' ? 'ItemQuestReward' : 'RelicQuestReward';
  const ownerUid = owner?.uid ?? null;
  const rawRewards = [];

  if (Array.isArray(def.quest?.reward?.RewardEffects)) {
    rawRewards.push(...def.quest.reward.RewardEffects);
  }
  if (Array.isArray(def.quest?.effect?.Rewards)) {
    for (const rw of def.quest.effect.Rewards) {
      if (Array.isArray(rw?.RewardEffects)) {
        rawRewards.push(...rw.RewardEffects);
      } else if (rw?.type === 'ItemFromPoolReward') {
        rawRewards.push({
          Trigger: 'OnAcquire',
          AttachmentType: 'Global',
          TargetType: 'Player',
          condition: { type: 'NoCondition' },
          actions: [{ type: 'CreateItemFromPoolAction', itemPoolId: rw.itemPoolId || 27 }],
        });
      }
    }
  }

  for (const eff of [...(def.effects || []), ...(def.specialEffects || [])]) {
    if (eff?.type === 'QuestEffect' && rawRewards.length === 0) {
      if (Array.isArray(eff.reward?.RewardEffects)) rawRewards.push(...eff.reward.RewardEffects);
      for (const rw of eff.Rewards || []) {
        if (Array.isArray(rw?.RewardEffects)) rawRewards.push(...rw.RewardEffects);
      }
    }
  }

  return rawRewards.map((re) => ({
    ...re,
    _origin: origin,
    _ownerUid: ownerUid,
    _itemId: kind === 'item' ? id : undefined,
    _relicId: kind === 'relic' ? id : undefined,
    _triggerCount: 0,
    _intervalTimer: Number(re.EffectInterval) || 1.0,
    _stallFired: false,
  }));
}

/**
 * Parses localized descriptions for Relics (and fallback passives) that live in C# codegen (`effects: []`).
 * Note: Quest Relics do NOT activate their quest rewards here; the Quest Engine in index.js activates
 * quest rewards when `completed: true` at battle start or dynamically when completed mid-battle.
 */
export function buildRelicEffects(relicId, data, isEnemyRelic = false, customStacks = 0) {
  const id = Number(relicId);
  const relic = data?.relics?.[id] || data?.relics?.[String(id)];
  if (!relic) return [];

  const list = [];
  const origin = isEnemyRelic || relic.rarity === 'Enemy' || relic.rarity === 'ActBoss' ? 'EnemyRelic' : 'Relic';

  // Include non-quest serialized effects if present
  if (Array.isArray(relic.effects) && relic.effects.length > 0) {
    for (const e of relic.effects) {
      if (e.type === 'QuestEffect') continue;
      list.push({ ...e, _origin: origin, _relicId: id, _customStacks: Number(customStacks) || 0 });
    }
    if (list.length > 0 || relic.quest) return list;
  }

  if (relic.quest) {
    return list;
  }

  const addR = (eff) =>
    list.push({ _origin: origin, _relicId: id, _customStacks: Number(customStacks) || 0, ...eff });

  switch (id) {
    case 538: // Vanguard's Rally Banner: For Rush(10), Vanguards gain 1 Attack and 1 Defense per 25 Max HP
      addR({
        Trigger: 'PerFrameEvaluation',
        Keyword: 'Rush',
        RushDuration: 10,
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if (!unitHasClass(h, 3)) continue;
            const bonus = Math.floor(h.maxHp / 25);
            if (bonus > 0) {
              addStatBonus(h, 'Attack', bonus, false, 'temp', sim.data);
              addStatBonus(h, 'Defense', bonus, false, 'temp', sim.data);
            }
          }
        },
      });
      return list;
    case 548: // Assassin's Smokescreen Banner: Stealth 3s first time below 33% Max HP
    case 2007: // Assassin's Emblem: If Assassin in combat, Heroes gain Stealth 3s first time below 66% Max HP
      addR({
        Trigger: 'OnDamageReceived',
        customRun: (sim, ctx) => {
          const u = ctx.target;
          if (!u || u.team !== 1) return;
          if (id === 548) {
            if (!unitHasClass(u, 4) || u._smokescreen548 || u.hp > u.maxHp * 0.33) return;
            u._smokescreen548 = true;
            sim.applyStatus(u, u, 'Stealth', 1, 3.0);
          } else {
            if (u._emblem2007 || u.hp > u.maxHp * 0.66) return;
            if (!sim.getAliveUnits(1).some((h) => unitHasClass(h, 4))) return;
            u._emblem2007 = true;
            sim.applyStatus(u, u, 'Stealth', 1, 3.0);
          }
        },
      });
      return list;
    case 550: // Assassin's Greed Banner: Assassins gain 1 Attack and 1 Magic per 5 Shards generated this game
    case 564: // Duelist's Precision Banner: Duelists gain 1 Crit per 5 Shards generated this game
    case 3060: // Shard Energy Velocitizer: Heroes gain 1 Attack Speed per 5 Shards generated this game
      addR({
        Trigger: 'PerFrameEvaluation',
        customRun: (sim) => {
          const stacks = Math.floor((sim.shardsGeneratedThisGame || 0) / 5);
          if (stacks <= 0) return;
          for (const h of sim.getAliveUnits(1)) {
            if (id === 550 && unitHasClass(h, 4)) {
              addStatBonus(h, 'Attack', stacks, false, 'temp', sim.data);
              addStatBonus(h, 'Magic', stacks, false, 'temp', sim.data);
            } else if (id === 564 && unitHasClass(h, 5)) {
              addStatBonus(h, 'Crit', stacks, false, 'temp', sim.data);
            } else if (id === 3060) {
              addStatBonus(h, 'AttackSpeed', stacks, false, 'temp', sim.data);
            }
          }
        },
      });
      return list;
    case 556: // Assassin's Payday Banner: Whenever an Assassin kills an enemy, gain 4 Shards
      addR({
        Trigger: 'OnCharacterKilled',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 4) && ctx.target?.team === 2) {
            sim.gainShards(4, { source: ctx.source, target: ctx.target });
          }
        },
      });
      return list;
    case 571: // Duelist's Outbreak Banner: Whenever a Duelist auto attacks, deal 20 bonus damage per debuff type on target
      addR({
        Trigger: 'OnAutoAttack',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 5) && ctx.target) {
            const types = countDebuffTypes(ctx.target);
            if (types > 0) {
              sim.dealDamage(ctx.source, ctx.target, 20 * types, { origin: 'effect', damageType: 'magic', canCrit: false });
            }
          }
        },
      });
      return list;
    case 581: // Mystic's Payday Banner: Every 5 times a Mystic casts, gain 1 Shard
      addR({
        Trigger: 'OnAbilityCast',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 6)) {
            sim._mysticCasts581 = (sim._mysticCasts581 || 0) + 1;
            if (sim._mysticCasts581 % 5 === 0) sim.gainShards(1, { source: ctx.source });
          }
        },
      });
      return list;
    case 582: // Mystic's Prosperity Banner: Whenever a Mystic casts, gain Magic equal to 50% Mana Regen
    case 585: // Mystic's Barrier Banner: Whenever a Mystic casts, Shield lowest-health Hero equal to 500% Mana Regen
    case 586: // Mystic's Outbreak Banner: Whenever a Mystic casts, gain 2 Magic per debuff type on all enemies
    case 589: // Mystic's Protection Banner: Whenever a Mystic casts, Shield nearest Hero equal to total debuff stacks on all enemies
      addR({
        Trigger: 'OnAbilityCast',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (!u || u.team !== 1 || !unitHasClass(u, 6)) return;
          if (id === 582) {
            addStatBonus(u, 'Magic', getUnitStat(u, 'ManaRegen') * 0.5, false, 'combat', sim.data);
          } else if (id === 585) {
            const ally = sim.findTargetByType(u, 'LowestHealthAlly') || u;
            sim.applyShield(u, ally, getUnitStat(u, 'ManaRegen') * 5.0, 10.0);
          } else if (id === 586) {
            let types = 0;
            for (const e of sim.getAliveUnits(2)) types += countDebuffTypes(e);
            if (types > 0) addStatBonus(u, 'Magic', types * 2, false, 'combat', sim.data);
          } else if (id === 589) {
            let stacks = 0;
            for (const e of sim.getAliveUnits(2)) stacks += countTotalDebuffStacks(e);
            const ally = sim.findTargetByType(u, 'NearestAlly') || u;
            if (stacks > 0) sim.applyShield(u, ally, stacks, 10.0);
          }
        },
      });
      return list;
    case 595: // Mage's Elemental Banner: Whenever a Mage casts, enemies in range take 6 dmg/Frost and 3 dmg/Burn
    case 596: // Mage's Inferno Banner: Whenever a Mage casts, inflict Burn equal to 150% of Mana spent
    case 597: // Mage's Frostbite Banner: Whenever a Mage casts, inflict Frost equal to 66% of Mana spent
      addR({
        Trigger: 'OnAbilityCast',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (!u || u.team !== 1 || !unitHasClass(u, 7)) return;
          const manaSpent = u.maxMana || 100;
          const tgt = ctx.target?.team === 2 ? ctx.target : sim.findTargetByType(u, 'NearestEnemy');
          if (id === 595) {
            const rng = getUnitStat(u, 'AttackRange');
            for (const e of sim.getAliveUnits(2)) {
              if (hexDistance(u, e) <= rng) {
                const dmg = (e.statuses?.Frost || 0) * 6 + (e.statuses?.Burn || 0) * 3;
                if (dmg > 0) sim.dealDamage(u, e, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
              }
            }
          } else if (id === 596 && tgt) {
            sim.applyStatus(u, tgt, 'Burn', Math.round(manaSpent * 1.5));
          } else if (id === 597 && tgt) {
            sim.applyStatus(u, tgt, 'Frost', Math.round(manaSpent * 0.66));
          }
        },
      });
      return list;
    case 604: // Mage's Serenity Banner: After Stall (15 and 30), Mages gain 100 Mana
      for (const stDur of [15, 30]) {
        addR({
          Trigger: 'Constant',
          Keyword: 'Stall',
          StallDuration: stDur,
          customRun: (sim) => {
            for (const h of sim.getAliveUnits(1)) {
              if (unitHasClass(h, 7)) sim.giveMana(h, 100);
            }
          },
        });
      }
      return list;
    case 708: // Shield Fluctuator: Heroes gain 20 Crit and 5 Mana Regen while Shielded
      addR({
        Trigger: 'PerFrameEvaluation',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if ((h.shield || 0) > 0) {
              addStatBonus(h, 'Crit', 20, false, 'temp', sim.data);
              addStatBonus(h, 'ManaRegen', 5, false, 'temp', sim.data);
            }
          }
        },
      });
      return list;
    case 715: // Deceleration Resonator: On Stall trigger, Heroes heal 250
      addR({
        Trigger: 'OnStallStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) sim.healUnit(h, h, 250);
        },
      });
      return list;
    case 717: // Shard Fluctuator: On Shards generated, deal 500 damage to all enemies
    case 718: // Shard Resonator: On Shards generated, Heroes gain 400 Shields
    case 4027: // Shard Power Extractor: On Shards generated, deal 10% Max HP damage (Min 2500) to all enemies
      addR({
        Trigger: 'OnShardsGenerated',
        customRun: (sim) => {
          if (id === 717) {
            for (const e of sim.getAliveUnits(2)) {
              sim.dealDamage(null, e, 500, { origin: 'effect', damageType: 'magic', canCrit: false });
            }
          } else if (id === 718) {
            for (const h of sim.getAliveUnits(1)) sim.applyShield(h, h, 400, 10.0);
          } else if (id === 4027) {
            for (const e of sim.getAliveUnits(2)) {
              const dmg = Math.max(2500, Math.round(e.maxHp * 0.1));
              sim.dealDamage(null, e, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
            }
          }
        },
      });
      return list;
    case 720: // Starter Kit: Instant Shards (7)
    case 6003: // Shard Pouch (12)
    case 6010: // All In (45)
      addR({
        Trigger: 'OnAcquire',
        customRun: (sim) => sim.gainShards(id === 720 ? 7 : id === 6003 ? 12 : 45),
      });
      return list;
    case 723: // Starter Kit: Temporary Shard Boost (2 extra Shards per surviving Hero)
    case 724: // Starter Kit: Sustained Shard Boost (1 extra Shard per surviving Hero)
    case 1010: // Shard Lattice: On combat victory, gain 3 Shards
    case 2027: // Shard Extractor: On combat victory, gain 6 Shards
    case 6009: // Survivor Charm: Gain 1 extra Shard per surviving Hero at end of combat
      addR({
        Trigger: 'OnCombatVictory',
        customRun: (sim) => {
          if (id === 1010) sim.gainShards(3);
          else if (id === 2027) sim.gainShards(6);
          else {
            const mult = id === 723 ? 2 : 1;
            sim.gainShards(sim.getAliveUnits(1).length * mult);
          }
        },
      });
      return list;
    case 1013: // Precision Lattice: Each Hero's first attack against each enemy gains 250 Crit
      addR({
        Trigger: 'OnDamageDealingContext',
        AttachmentType: 'SourceIsHero',
        condition: {
          type: 'CompoundCondition',
          conditions: [{ type: 'IsFirstAttackAgainstTriggerTargetCondition' }, { type: 'IsDamageSourceAttackDamageCondition' }],
        },
        TargetType: 'TriggerSource',
        actions: [{ type: 'ModifyStatAction', StatType: 'Crit', Value: 250 }],
      });
      return list;
    case 1016: // Frontline Defender: Front row Heroes gain 100 Max HP and 15 Defense
    case 1017: // Backline Aggressor: Back row Heroes gain 10 Attack Speed and 15 Crit
    case 2052: // Frontline Embiggener: Front row Heroes gain 400 Max HP
    case 2053: // Frontline Barricader: Front row Heroes gain 60 Defense
    case 2054: // Backline Sharpener: Back row Heroes gain 25 Crit and MoveSpeed
    case 2055: // Backline Quickener: Back row Heroes gain 40 Attack Speed and MoveSpeed
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            const isFront = h.cellY >= 2;
            const isBack = h.cellY <= 1;
            if (id === 1016 && isFront) {
              addStatBonus(h, 'MaxHealth', 100, false, 'combat', sim.data);
              addStatBonus(h, 'Defense', 15, false, 'combat', sim.data);
            } else if (id === 1017 && isBack) {
              addStatBonus(h, 'AttackSpeed', 10, false, 'combat', sim.data);
              addStatBonus(h, 'Crit', 15, false, 'combat', sim.data);
            } else if (id === 2052 && isFront) {
              addStatBonus(h, 'MaxHealth', 400, false, 'combat', sim.data);
            } else if (id === 2053 && isFront) {
              addStatBonus(h, 'Defense', 60, false, 'combat', sim.data);
            } else if (id === 2054 && isBack) {
              addStatBonus(h, 'Crit', 25, false, 'combat', sim.data);
              addStatBonus(h, 'MoveSpeed', 25, true, 'combat', sim.data);
            } else if (id === 2055 && isBack) {
              addStatBonus(h, 'AttackSpeed', 40, false, 'combat', sim.data);
              addStatBonus(h, 'MoveSpeed', 25, true, 'combat', sim.data);
            }
          }
        },
      });
      return list;
    case 2001: // Warrior's Emblem: If Warrior in combat, Hero auto attacks gain 50 Crit
    case 2013: // Mage's Emblem: If Mage in combat, Hero active abilities gain 100 Crit
    case 4036: // Martial Energy Crystal: Auto attacks by Assassins, Duelists, and Warriors gain 100 Crit
      addR({
        Trigger: 'OnDamageDealingContext',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (!u || u.team !== 1) return;
          if (id === 2001 && ctx.origin === 'attack' && sim.getAliveUnits(1).some((h) => unitHasClass(h, 1))) {
            ctx.bonusCrit = (ctx.bonusCrit || 0) + 50;
          } else if (id === 2013 && ctx.origin === 'ability' && sim.getAliveUnits(1).some((h) => unitHasClass(h, 7))) {
            ctx.bonusCrit = (ctx.bonusCrit || 0) + 100;
          } else if (id === 4036 && ctx.origin === 'attack' && (unitHasClass(u, 1) || unitHasClass(u, 4) || unitHasClass(u, 5))) {
            ctx.bonusCrit = (ctx.bonusCrit || 0) + 100;
          }
        },
      });
      return list;
    case 2002: // Tank's Memento: Start of combat: 25 Poison on all enemies per Tank
    case 2004: // Vanguard's Memento: Start of combat: 45 Burn on all enemies per Vanguard
    case 2006: // Assassin's Memento: Start of combat: 5 Shards per Assassin
    case 2010: // Mystic's Memento: Start of combat: 15% Max HP Shield per Mystic
    case 2012: // Mage's Memento: Start of combat: 12 Frost on all enemies per Mage
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const cid = id === 2002 ? 2 : id === 2004 ? 3 : id === 2006 ? 4 : id === 2010 ? 6 : 7;
          const cnt = sim.getAliveUnits(1).filter((h) => unitHasClass(h, cid)).length;
          if (cnt <= 0) return;
          if (id === 2002) {
            for (const e of sim.getAliveUnits(2)) sim.applyStatus(null, e, 'Poison', 25 * cnt);
          } else if (id === 2004) {
            for (const e of sim.getAliveUnits(2)) sim.applyStatus(null, e, 'Burn', 45 * cnt);
          } else if (id === 2006) {
            sim.gainShards(5 * cnt);
          } else if (id === 2010) {
            for (const h of sim.getAliveUnits(1)) sim.applyShield(h, h, h.maxHp * 0.15 * cnt, 15.0);
          } else if (id === 2012) {
            for (const e of sim.getAliveUnits(2)) sim.applyStatus(null, e, 'Frost', 12 * cnt);
          }
        },
      });
      return list;
    case 2003: // Tank's Emblem: Each second if Tank in combat, Heroes gain 1 Defense
    case 2005: // Vanguard's Emblem: Every 5s if Vanguard in combat, Heroes gain 150 Shields
      addR({
        Trigger: 'OnInterval',
        EffectInterval: id === 2003 ? 1.0 : 5.0,
        customRun: (sim) => {
          const cid = id === 2003 ? 2 : 3;
          if (!sim.getAliveUnits(1).some((h) => unitHasClass(h, cid))) return;
          for (const h of sim.getAliveUnits(1)) {
            if (id === 2003) addStatBonus(h, 'Defense', 1, false, 'combat', sim.data);
            else sim.applyShield(h, h, 150, 10.0);
          }
        },
      });
      return list;
    case 2009: // Duelist's Emblem: If Duelist in combat, Heroes deal 30 bonus damage with each auto attack
      addR({
        Trigger: 'OnAutoAttack',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && ctx.target && sim.getAliveUnits(1).some((h) => unitHasClass(h, 5))) {
            sim.dealDamage(ctx.source, ctx.target, 30, { origin: 'effect', damageType: 'physical', canCrit: false });
          }
        },
      });
      return list;
    case 2011: // Mystic's Emblem: If Mystic in combat, Heroes gain 4 Mana Regen and 10 HP/S
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          if (!sim.getAliveUnits(1).some((h) => unitHasClass(h, 6))) return;
          for (const h of sim.getAliveUnits(1)) {
            addStatBonus(h, 'ManaRegen', 4, false, 'combat', sim.data);
            addStatBonus(h, 'HPPerSecond', 10, false, 'combat', sim.data);
          }
        },
      });
      return list;
    case 2014: // Arcane Amplifier: Mages and Mystics gain 50 Magic and 4 Mana Regen
    case 2015: // Martial Amplifier: Assassins, Duelists, and Warriors gain 15 Crit, 20 AS, 25 Attack
    case 2016: // Defensive Amplifier: Tanks and Vanguards gain 45 Defense and 300 Max HP
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if (id === 2014 && (unitHasClass(h, 6) || unitHasClass(h, 7))) {
              addStatBonus(h, 'Magic', 50, false, 'combat', sim.data);
              addStatBonus(h, 'ManaRegen', 4, false, 'combat', sim.data);
            } else if (id === 2015 && (unitHasClass(h, 1) || unitHasClass(h, 4) || unitHasClass(h, 5))) {
              addStatBonus(h, 'Crit', 15, false, 'combat', sim.data);
              addStatBonus(h, 'AttackSpeed', 20, false, 'combat', sim.data);
              addStatBonus(h, 'Attack', 25, false, 'combat', sim.data);
            } else if (id === 2016 && (unitHasClass(h, 2) || unitHasClass(h, 3))) {
              addStatBonus(h, 'Defense', 45, false, 'combat', sim.data);
              addStatBonus(h, 'MaxHealth', 300, false, 'combat', sim.data);
            }
          }
        },
      });
      return list;
    case 2018: // Deceleration Nexus: Every 2 Stall triggers, gain 1 Shard
    case 2021: // Acceleration Nexus: Every 2 Rush triggers, gain 1 Shard
    case 3018: // Trigger Bounty Activator: Every other Stall/Rush trigger, gain 1 Shard
    case 3019: // Trigger Synchrony Activator: Every 3 Stall/Rush triggers, Stun all enemies for 2s
      if (id === 2018 || id === 3018 || id === 3019) {
        addR({
          Trigger: 'OnStallStart',
          TriggerIncrement: id === 3019 ? 3 : 2,
          customRun: (sim) => {
            if (id === 3019) {
              for (const e of sim.getAliveUnits(2)) sim.applyStatus(null, e, 'Stun', 1, 2.0);
            } else {
              sim.gainShards(1);
            }
          },
        });
      }
      if (id === 2021 || id === 3018 || id === 3019) {
        addR({
          Trigger: 'OnRushStart',
          TriggerIncrement: id === 3019 ? 3 : 2,
          customRun: (sim) => {
            if (id === 3019) {
              for (const e of sim.getAliveUnits(2)) sim.applyStatus(null, e, 'Stun', 1, 2.0);
            } else {
              sim.gainShards(1);
            }
          },
        });
      }
      return list;
    case 2019: // Deceleration Reactor: On Stall trigger, give Heroes 10% Max HP Shield and 8 Mana
      addR({
        Trigger: 'OnStallStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            sim.applyShield(h, h, h.maxHp * 0.1, 10.0);
            sim.giveMana(h, 8);
          }
        },
      });
      return list;
    case 2024: // Precision Nexus: On Crit, Hero heals 30 and gains 3 Mana
    case 3031: // Critical Absorption Prism: On Crit, Hero steals 40 Max HP from target
      addR({
        Trigger: 'OnGlobalCrit',
        customRun: (sim, ctx) => {
          if (ctx.source?.team !== 1) return;
          if (id === 2024) {
            sim.healUnit(ctx.source, ctx.source, 30);
            sim.giveMana(ctx.source, 3);
          } else if (id === 3031 && ctx.target?.team === 2) {
            addStatBonus(ctx.target, 'MaxHealth', -40, false, 'combat', sim.data);
            addStatBonus(ctx.source, 'MaxHealth', 40, false, 'combat', sim.data);
          }
        },
      });
      return list;
    case 2028: // Shard Constructor: After Stall (30), gain 9 Shards
      addR({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 30,
        customRun: (sim) => sim.gainShards(9),
      });
      return list;
    case 2030: // Poison Amplifier: Whenever a Hero inflicts Poison, inflict 33% more
    case 2033: // Frost Amplifier: Whenever a Hero inflicts Frost, inflict 33% more
    case 2036: // Burn Amplifier: Whenever a Hero inflicts Burn, inflict 33% more
    case 3045: // Glacial Guard Prism: Whenever a Hero inflicts Frost, gain 6 Shields per Frost inflicted
      addR({
        Trigger: 'OnStatusStacksApplied',
        customRun: (sim, ctx) => {
          if (ctx._fromAmp || !ctx.target) return;
          const st = id === 2030 ? 'Poison' : id === 2036 ? 'Burn' : 'Frost';
          if (ctx.status !== st) return;
          if (id === 3045) {
            if (ctx.source?.team === 1) sim.applyShield(ctx.source, ctx.source, (ctx.amount || 0) * 6, 10.0);
            return;
          }
          if (ctx.target.team === 2) {
            const extra = Math.max(1, Math.round((ctx.amount || 0) * 0.33));
            sim.applyStatus(ctx.source, ctx.target, st, extra, null, { _fromAmp: true });
          }
        },
      });
      return list;
    case 2031: // Poison Catalyst: After Stall (15), whenever enemy with Poison is auto attacked, take dmg equal to Poison
      addR({
        Trigger: 'OnAttackDamageReceived',
        Keyword: 'Stall',
        StallDuration: 15,
        customRun: (sim, ctx) => {
          const p = ctx.target?.statuses?.Poison || 0;
          if (ctx.target?.team === 2 && p > 0) {
            sim.dealDamage(ctx.source, ctx.target, p, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        },
      });
      return list;
    case 2034: // Frost Catalyst: After Stall (15, 30, and 45), enemies take 5x Frost damage
    case 3021: // Deceleration Apotheosis: After Stall (25, 50, and 75), Heroes gain +15% basic stats
    case 3022: // Deceleration Corruptor: After Stall (15, 30, and 45), double Poison on all enemies
    case 3023: // Deceleration Aegis: After Stall (15, 30, and 45), Heroes gain 700 lasting Shields
    case 3024: // Deceleration Filigree: After Stall (30 and 60), gain 12 Shards
      {
        const times = id === 3021 ? [25, 50, 75] : id === 3024 ? [30, 60] : [15, 30, 45];
        for (const t of times) {
          addR({
            Trigger: 'Constant',
            Keyword: 'Stall',
            StallDuration: t,
            customRun: (sim) => {
              if (id === 2034) {
                for (const e of sim.getAliveUnits(2)) {
                  const f = e.statuses?.Frost || 0;
                  if (f > 0) sim.dealDamage(null, e, f * 5, { origin: 'effect', damageType: 'magic', canCrit: false });
                }
              } else if (id === 3021) {
                for (const h of sim.getAliveUnits(1)) {
                  for (const st of BASIC_STATS) addStatBonus(h, st, 15, true, 'combat', sim.data);
                }
              } else if (id === 3022) {
                for (const e of sim.getAliveUnits(2)) {
                  const p = e.statuses?.Poison || 0;
                  if (p > 0) sim.applyStatus(null, e, 'Poison', p, null, { _fromAmp: true });
                }
              } else if (id === 3023) {
                for (const h of sim.getAliveUnits(1)) sim.applyShield(h, h, 700, 999.0);
              } else if (id === 3024) {
                sim.gainShards(12);
              }
            },
          });
        }
      }
      return list;
    case 2037: // Burn Catalyst: For Rush (15), enemies receive 50% more Burn damage
      addR({
        Trigger: 'OnStatusDamageReceived',
        Keyword: 'Rush',
        RushDuration: 15,
        customRun: (sim, ctx) => {
          if (ctx.status === 'Burn' && ctx.target?.team === 2 && (ctx.amount || 0) > 0 && !ctx._fromBurnCat) {
            sim.dealDamage(null, ctx.target, ctx.amount * 0.5, {
              origin: 'effect',
              damageType: 'magic',
              canCrit: false,
              _inTrigger: true,
              _fromBurnCat: true,
            });
          }
        },
      });
      return list;
    case 2039: // Plague Harvester: After Stall (15), Heroes gain 1 Defense & 1 Magic per 25 Debuffs on all enemies
      addR({
        Trigger: 'PerFrameEvaluation',
        Keyword: 'Stall',
        StallDuration: 15,
        customRun: (sim) => {
          let stacks = 0;
          for (const e of sim.getAliveUnits(2)) stacks += countTotalDebuffStacks(e);
          const bonus = Math.floor(stacks / 25);
          if (bonus > 0) {
            for (const h of sim.getAliveUnits(1)) {
              addStatBonus(h, 'Defense', bonus, false, 'temp', sim.data);
              addStatBonus(h, 'Magic', bonus, false, 'temp', sim.data);
            }
          }
        },
      });
      return list;
    case 2040: // Plague Amplifier: For Rush (12), if enemy would gain Debuff they gain 1 more
    case 3030: // Plague Accelerator: For Rush (12), if enemy would gain Debuff they gain 2 more
      addR({
        Trigger: 'OnStatusStacksApplied',
        Keyword: 'Rush',
        RushDuration: 12,
        customRun: (sim, ctx) => {
          if (ctx._fromAmp || !ctx.target || ctx.target.team !== 2) return;
          if (DEBUFF_STATUSES.includes(ctx.status)) {
            sim.applyStatus(ctx.source, ctx.target, ctx.status, id === 3030 ? 2 : 1, null, { _fromAmp: true });
          }
        },
      });
      return list;
    case 2042: // Shield Repriser: Whenever enemy damages Hero's Shields, deal 100% back to source
    case 4018: // Shield Fragmentation Engine: Whenever enemy damages Hero's Shields, deal 350% back to source
      addR({
        Trigger: 'OnShieldRemovedFromDamage',
        customRun: (sim, ctx) => {
          if (ctx.target?.team === 1 && ctx.source?.team === 2 && (ctx.shieldAbsorbed || 0) > 0) {
            const mult = id === 4018 ? 3.5 : 1.0;
            sim.dealDamage(ctx.target, ctx.source, ctx.shieldAbsorbed * mult, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        },
      });
      return list;
    case 2043: // Shield Bastion: After Stall (15), Heroes gain a lasting 33% Max HP Shield
      addR({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 15,
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) sim.applyShield(h, h, h.maxHp * 0.33, 999.0);
        },
      });
      return list;
    case 2045: // Combative Codex: +9 (+6/win) Attack
    case 2046: // Enchanted Codex: +9 (+6/win) Magic
    case 2047: // Vampiric Codex: +3 (+2/win) OmniVamp
    case 2048: // Vital Codex: +75 (+50/win) MaxHealth
    case 2049: // Plated Codex: +15 (+10/win) Defense
    case 2050: // Precise Codex: +6 (+4/win) Crit
    case 2051: // Swift Codex: +8 (+5/win) AttackSpeed
    case 6017: // Legacy Charm: +1% (+1%/2 wins) basic stats
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          const CFG = {
            2045: { stat: 'Attack', base: 9, perStack: 6 },
            2046: { stat: 'Magic', base: 9, perStack: 6 },
            2047: { stat: 'OmniVamp', base: 3, perStack: 2 },
            2048: { stat: 'MaxHealth', base: 75, perStack: 50 },
            2049: { stat: 'Defense', base: 15, perStack: 10 },
            2050: { stat: 'Crit', base: 6, perStack: 4 },
            2051: { stat: 'AttackSpeed', base: 8, perStack: 5 },
          };
          for (const h of sim.getAliveUnits(1)) {
            if (id === 6017) {
              const pct = 1 + Math.floor((Number(customStacks) || 0) / 2);
              for (const st of BASIC_STATS) addStatBonus(h, st, pct, true, 'const', sim.data);
            } else {
              const c = CFG[id];
              const val = c.base + (Number(customStacks) || 0) * c.perStack;
              addStatBonus(h, c.stat, val, false, 'const', sim.data);
            }
          }
        },
      });
      return list;
    case 2057: // Protective Differentiator: After Stall (15 and 30), give Heroes lasting 1% Max HP Shield per shop reroll
      for (const stDur of [15, 30]) {
        addR({
          Trigger: 'Constant',
          Keyword: 'Stall',
          StallDuration: stDur,
          customRun: (sim) => {
            const r = Math.max(1, sim.rerollsThisGame || 0);
            for (const h of sim.getAliveUnits(1)) {
              sim.applyShield(h, h, h.maxHp * 0.01 * r, 999.0);
            }
          },
        });
      }
      return list;
    case 3000: // Warrior's Exaltation Prism: Whenever a Warrior kills, +50% Attack, heal 100% Max HP, +100 Mana
      addR({
        Trigger: 'OnCharacterKilled',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 1) && ctx.target?.team === 2) {
            addStatBonus(u, 'Attack', 50, true, 'combat', sim.data);
            sim.healUnit(u, u, u.maxHp);
            sim.giveMana(u, 100);
          }
        },
      });
      return list;
    case 3001: // Warrior's Sundering Filigree: For Rush (8), whenever a Warrior Crits an enemy reduce Defense by 15
      addR({
        Trigger: 'OnGlobalCrit',
        Keyword: 'Rush',
        RushDuration: 8,
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 1) && ctx.target?.team === 2) {
            addStatBonus(ctx.target, 'Defense', -15, false, 'combat', sim.data);
          }
        },
      });
      return list;
    case 3002: // Tank's Intercession Prism: Tanks gain 50 Defense per enemy targeting them; Every 10s highest HP Tank Taunts all
      addR({
        Trigger: 'PerFrameEvaluation',
        customRun: (sim) => {
          const enemies = sim.getAliveUnits(2);
          for (const h of sim.getAliveUnits(1)) {
            if (!unitHasClass(h, 2)) continue;
            const cnt = enemies.filter((e) => e.targetUid === h.uid).length;
            if (cnt > 0) addStatBonus(h, 'Defense', cnt * 50, false, 'temp', sim.data);
          }
        },
      });
      addR({
        Trigger: 'OnInterval',
        EffectInterval: 10.0,
        customRun: (sim) => {
          const tanks = sim.getAliveUnits(1).filter((h) => unitHasClass(h, 2));
          if (!tanks.length) return;
          tanks.sort((a, b) => b.hp - a.hp);
          sim.tauntAllEnemies(tanks[0]);
        },
      });
      return list;
    case 3003: // Tank's Invigoration Filigree: After Stall (20), Tanks gain 1 HP/S per 8 Defense
      addR({
        Trigger: 'PerFrameEvaluation',
        Keyword: 'Stall',
        StallDuration: 20,
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if (unitHasClass(h, 2)) {
              const bonus = Math.floor(getUnitStat(h, 'Defense') / 8);
              if (bonus > 0) addStatBonus(h, 'HPPerSecond', bonus, false, 'temp', sim.data);
            }
          }
        },
      });
      return list;
    case 3004: // Vanguard's Frenzy Prism: First time below 50% Max HP, Vanguards gain +33% AS, Attack, Defense
      addR({
        Trigger: 'OnDamageReceived',
        customRun: (sim, ctx) => {
          const u = ctx.target;
          if (u?.team === 1 && unitHasClass(u, 3) && !u._frenzy3004 && u.hp <= u.maxHp * 0.5) {
            u._frenzy3004 = true;
            addStatBonus(u, 'AttackSpeed', 33, true, 'combat', sim.data);
            addStatBonus(u, 'Attack', 33, true, 'combat', sim.data);
            addStatBonus(u, 'Defense', 33, true, 'combat', sim.data);
          }
        },
      });
      return list;
    case 3006: // Assassin's Elevation Prism: Assassin kill -> perm +7 Crit, gain 1 Shard per 100 Crit (Max 10)
      addR({
        Trigger: 'OnCharacterKilled',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 4) && ctx.target?.team === 2) {
            addStatBonus(u, 'Crit', 7, false, 'perm', sim.data);
            const sh = Math.min(10, Math.floor(getUnitStat(u, 'Crit') / 100));
            if (sh > 0) sim.gainShards(sh, { source: u });
          }
        },
      });
      return list;
    case 3008: // Duelist's Rhythm Prism: Duelist auto attack randomly inflicts 2 Poison, 4 Frost, or 6 Burn
      addR({
        Trigger: 'OnAutoAttack',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 5) && ctx.target) {
            const roll = sim.prng ? sim.prng.int(0, 2) : 0;
            if (roll === 0) sim.applyStatus(ctx.source, ctx.target, 'Poison', 2);
            else if (roll === 1) sim.applyStatus(ctx.source, ctx.target, 'Frost', 4);
            else sim.applyStatus(ctx.source, ctx.target, 'Burn', 6);
          }
        },
      });
      return list;
    case 3009: // Duelist's Profusion Filigree: After Stall (10), Duelist auto attacks also hit nearest enemy to target for 33% dmg
      addR({
        Trigger: 'OnAutoAttack',
        Keyword: 'Stall',
        StallDuration: 10,
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 5) && ctx.target) {
            const near = sim.findTargetByType(ctx.target, 'NearestAlly');
            if (near && near.uid !== ctx.target.uid) {
              const dmg = sim.getAutoAttackDamage(ctx.source) * 0.33;
              sim.dealDamage(ctx.source, near, dmg, { origin: 'attack', damageType: 'physical', canCrit: true });
            }
          }
        },
      });
      return list;
    case 3011: // Mystic's Inundation Prism: Whenever Mystic Shields a Hero, damage nearest enemy for 100% of Shield
    case 4005: // Mystic's Abundance Engine: Heroes gain 8 Mana Regen; Mystic Shield -> 33% extra lasting Shield
      if (id === 4005) {
        addR({
          Trigger: 'Constant',
          customRun: (sim) => {
            for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'ManaRegen', 8, false, 'const', sim.data);
          },
        });
      }
      addR({
        Trigger: 'OnShieldApplied',
        customRun: (sim, ctx) => {
          if (ctx._fromAmp || ctx.source?.team !== 1 || !unitHasClass(ctx.source, 6) || !ctx.target || (ctx.amount || 0) <= 0) return;
          if (id === 3011) {
            const e = sim.findTargetByType(ctx.target, 'NearestEnemy');
            if (e) sim.dealDamage(ctx.source, e, ctx.amount, { origin: 'effect', damageType: 'magic', canCrit: false });
          } else if (id === 4005 && ctx.target.team === 1) {
            sim.applyShield(ctx.source, ctx.target, ctx.amount * 0.33, 999.0, { _fromAmp: true });
          }
        },
      });
      return list;
    case 3012: // Mystic's Prosperity Filigree: Mystic cast after Stall (15) -> nearest Hero gains Magic & Attack = 66% Mana Regen
      addR({
        Trigger: 'OnAbilityCast',
        Keyword: 'Stall',
        StallDuration: 15,
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 6)) {
            const ally = sim.findTargetByType(u, 'NearestAlly') || u;
            const val = getUnitStat(u, 'ManaRegen') * 0.66;
            addStatBonus(ally, 'Magic', val, false, 'combat', sim.data);
            addStatBonus(ally, 'Attack', val, false, 'combat', sim.data);
          }
        },
      });
      return list;
    case 3013: // Mage's Transmutation Prism: Mage auto attack deals bonus damage equal to 100% Magic
      addR({
        Trigger: 'OnAutoAttack',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 7) && ctx.target) {
            sim.dealDamage(ctx.source, ctx.target, getUnitStat(ctx.source, 'Magic'), {
              origin: 'effect',
              damageType: 'magic',
              canCrit: false,
            });
          }
        },
      });
      return list;
    case 3014: // Mage's Administration Filigree: Mage cast deals 400% Magic damage to lowest-health enemy
      addR({
        Trigger: 'OnAbilityCast',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 7)) {
            const e = sim.findTargetByType(u, 'LowestHealthEnemy');
            if (e) sim.dealDamage(u, e, getUnitStat(u, 'Magic') * 4.0, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        },
      });
      return list;
    case 3015: // Perfect Divergence Prism: No Heroes share a Class -> +25% basic stats
    case 3016: // Perfect Unity Prism: All Heroes share a Class -> +20% basic stats
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const heroes = sim.getAliveUnits(1);
          if (!heroes.length) return;
          if (id === 3015) {
            const seen = new Set();
            let shared = false;
            for (const h of heroes) {
              for (const c of h.classIds || []) {
                if (seen.has(c)) shared = true;
                seen.add(c);
              }
            }
            if (!shared) {
              for (const h of heroes) {
                for (const st of BASIC_STATS) addStatBonus(h, st, 25, true, 'combat', sim.data);
              }
            }
          } else {
            const common = (heroes[0].classIds || []).some((c) => heroes.every((h) => unitHasClass(h, c)));
            if (common) {
              for (const h of heroes) {
                for (const st of BASIC_STATS) addStatBonus(h, st, 20, true, 'combat', sim.data);
              }
            }
          }
        },
      });
      return list;
    case 3017: // Trigger Safeguard Activator: On Stall or Rush trigger, 10% Max HP Shield and 2 Mana Regen
      addR({
        Trigger: 'OnRushOrStallTriggered',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            sim.applyShield(h, h, h.maxHp * 0.1, 999.0);
            addStatBonus(h, 'ManaRegen', 2, false, 'combat', sim.data);
          }
        },
      });
      return list;
    case 3026: // Acceleration Immunizer: For Rush (2), Heroes are immune to damage
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const dur = 2 + (sim.bonusRushDuration || 0);
          for (const h of sim.getAliveUnits(1)) sim.applyStatus(h, h, 'DamageImmunity', 1, dur);
        },
      });
      return list;
    case 3029: // Acceleration Filigree: On kill for Rush (20), gain 12 Shards
      addR({
        Trigger: 'OnCharacterKilled',
        Keyword: 'Rush',
        RushDuration: 20,
        customRun: (sim, ctx) => {
          if (ctx.target?.team === 2) sim.gainShards(12);
        },
      });
      return list;
    case 3033: // Venom Precision Prism: Whenever an enemy takes Poison damage, Heroes gain 2 Crit
    case 3042: // Blight Resonance Prism: Whenever enemy takes Poison or Burn damage, heal adjacent Heroes for 50%
      addR({
        Trigger: 'OnStatusDamageReceived',
        customRun: (sim, ctx) => {
          if (ctx.target?.team !== 2 || (ctx.amount || 0) <= 0) return;
          if (id === 3033 && ctx.status === 'Poison') {
            for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'Crit', 2, false, 'combat', sim.data);
          } else if (id === 3042 && (ctx.status === 'Poison' || ctx.status === 'Burn')) {
            for (const h of sim.getAliveUnits(1)) {
              if (hexDistance(ctx.target, h) <= 1) sim.healUnit(h, h, ctx.amount * 0.5);
            }
          }
        },
      });
      return list;
    case 3034: // Shield Converter: Whenever Hero gains Shields from any source but itself, damage nearest enemy for 50%
      addR({
        Trigger: 'OnShieldApplied',
        customRun: (sim, ctx) => {
          if (ctx.target?.team === 1 && (!ctx.source || ctx.source.uid !== ctx.target.uid) && (ctx.amount || 0) > 0) {
            const e = sim.findTargetByType(ctx.target, 'NearestEnemy');
            if (e) sim.dealDamage(ctx.target, e, ctx.amount * 0.5, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        },
      });
      return list;
    case 3036: // Shield Investment Filigree: Start of combat and Stall (20), apply 250 (+50/stack) lasting Shields to Heroes
      for (const trig of ['OnCombatStart', 'Constant']) {
        addR({
          Trigger: trig,
          Keyword: trig === 'Constant' ? 'Stall' : 'None',
          StallDuration: trig === 'Constant' ? 20 : 0,
          customRun: (sim) => {
            sim._shieldInvestCount = (sim._shieldInvestCount || 0) + 1;
            const sh = 200 + sim._shieldInvestCount * 50;
            for (const h of sim.getAliveUnits(1)) sim.applyShield(h, h, sh, 999.0);
          },
        });
      }
      return list;
    case 3037: // Shard Maximizer: End of combat, gain 1 Shard per 5 Shards in bank (Max 20)
      addR({
        Trigger: 'OnCombatVictory',
        customRun: (sim) => {
          const bonus = Math.min(20, Math.floor((sim.shardsGeneratedThisGame || 0) / 5));
          if (bonus > 0) sim.shardsEarnedInBattle += bonus;
        },
      });
      return list;
    case 3039: // Shard Precision Prism: Heroes gain Crit equal to Shards in bank (Max 1000)
      addR({
        Trigger: 'PerFrameEvaluation',
        customRun: (sim) => {
          const c = Math.min(1000, Math.max(0, sim.shardsGeneratedThisGame || 0));
          if (c > 0) {
            for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'Crit', c, false, 'temp', sim.data);
          }
        },
      });
      return list;
    case 3049: // Plague Velocitizer: Every 4s, Heroes gain 1 AS and 2 Attack per debuff type on all enemies
      addR({
        Trigger: 'OnInterval',
        EffectInterval: 4.0,
        customRun: (sim) => {
          let types = 0;
          for (const e of sim.getAliveUnits(2)) types += countDebuffTypes(e);
          if (types > 0) {
            for (const h of sim.getAliveUnits(1)) {
              addStatBonus(h, 'AttackSpeed', types, false, 'combat', sim.data);
              addStatBonus(h, 'Attack', types * 2, false, 'combat', sim.data);
            }
          }
        },
      });
      return list;
    case 3051: // Arcane Backup Prism: +20 Magic/rank of Mages in reserves, +2 ManaRegen/rank of Mystics in reserves
    case 3052: // Martial Backup Prism: +10 Crit/rank Assassins, +15 AS/rank Duelists, +20 Attack/rank Warriors in reserves
    case 3053: // Defensive Backup Prism: +30 Defense/rank Tanks, +200 MaxHP/rank Vanguards in reserves
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          const bench = sim.benchUnits || [];
          for (const h of sim.getAliveUnits(1)) {
            for (const b of bench) {
              const r = b.rank || 1;
              if (id === 3051) {
                if (unitHasClass(b, 7)) addStatBonus(h, 'Magic', 20 * r, false, 'const', sim.data);
                if (unitHasClass(b, 6)) addStatBonus(h, 'ManaRegen', 2 * r, false, 'const', sim.data);
              } else if (id === 3052) {
                if (unitHasClass(b, 4)) addStatBonus(h, 'Crit', 10 * r, false, 'const', sim.data);
                if (unitHasClass(b, 5)) addStatBonus(h, 'AttackSpeed', 15 * r, false, 'const', sim.data);
                if (unitHasClass(b, 1)) addStatBonus(h, 'Attack', 20 * r, false, 'const', sim.data);
              } else if (id === 3053) {
                if (unitHasClass(b, 2)) addStatBonus(h, 'Defense', 30 * r, false, 'const', sim.data);
                if (unitHasClass(b, 3)) addStatBonus(h, 'MaxHealth', 200 * r, false, 'const', sim.data);
              }
            }
          }
        },
      });
      return list;
    case 3054: // Momentous Differentiator: +2 Attack Speed per shop reroll
    case 3055: // Stalwart Differentiator: +3 Defense per shop reroll
      addR({
        Trigger: 'PerFrameEvaluation',
        customRun: (sim) => {
          const r = sim.rerollsThisGame || 0;
          if (r <= 0) return;
          for (const h of sim.getAliveUnits(1)) {
            if (id === 3054) addStatBonus(h, 'AttackSpeed', r * 2, false, 'temp', sim.data);
            else addStatBonus(h, 'Defense', r * 3, false, 'temp', sim.data);
          }
        },
      });
      return list;
    case 4000: // Warrior's Bloodshield Engine: +50 Attack; Warrior damage dealt -> 10% lasting Shield
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'Attack', 50, false, 'const', sim.data);
        },
      });
      addR({
        Trigger: 'OnDamageDealt',
        customRun: (sim, ctx) => {
          if (ctx.source?.team === 1 && unitHasClass(ctx.source, 1) && (ctx.amount || 0) > 0) {
            sim.applyShield(ctx.source, ctx.source, ctx.amount * 0.1, 999.0);
          }
        },
      });
      return list;
    case 4001: // Tank's Absolution Engine: +60 Defense; Every 8 times a Tank is auto attacked, Stun attacker 1.5s
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'Defense', 60, false, 'const', sim.data);
        },
      });
      addR({
        Trigger: 'OnAttackDamageReceived',
        customRun: (sim, ctx) => {
          const u = ctx.target;
          if (u?.team === 1 && unitHasClass(u, 2) && ctx.source?.team === 2) {
            u._tankHits4001 = (u._tankHits4001 || 0) + 1;
            if (u._tankHits4001 % 8 === 0) sim.applyStatus(u, ctx.source, 'Stun', 1, 1.5);
          }
        },
      });
      return list;
    case 4002: // Vanguard's Titanic Engine: +400 Max HP; Vanguard attack/hit -> +10 Max HP, every 200 -> +25 Attack
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'MaxHealth', 400, false, 'const', sim.data);
        },
      });
      for (const trig of ['OnAutoAttack', 'OnAttackDamageReceived']) {
        addR({
          Trigger: trig,
          customRun: (sim, ctx) => {
            const u = trig === 'OnAutoAttack' ? ctx.source : ctx.target;
            if (u?.team === 1 && unitHasClass(u, 3)) {
              addStatBonus(u, 'MaxHealth', 10, false, 'combat', sim.data);
              u._titanicHp4002 = (u._titanicHp4002 || 0) + 10;
              if (u._titanicHp4002 % 200 === 0) {
                addStatBonus(u, 'Attack', 25, false, 'combat', sim.data);
              }
            }
          },
        });
      }
      return list;
    case 4003: // Assassin's Ambush Engine: +30 Crit; Stealthed Assassin attack -> 75% Crit Poison; Back 2 rows Stealth 5s
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'Crit', 30, false, 'const', sim.data);
        },
      });
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if (unitHasClass(h, 4) && h.cellY <= 1) {
              sim.applyStatus(h, h, 'Stealth', 1, 5.0);
              const threat = sim.findTargetByType(h, 'MostThreateningEnemy');
              if (threat) h.targetUid = threat.uid;
            }
          }
        },
      });
      addR({
        Trigger: 'OnAutoAttack',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 4) && (u.statuses?.Stealth || 0) > 0 && ctx.target) {
            sim.applyStatus(u, ctx.target, 'Poison', Math.max(1, Math.round(getUnitStat(u, 'Crit') * 0.75)));
          }
        },
      });
      return list;
    case 4004: // Duelist's Momentum Engine: +40 AS; Duelist auto attack deals 5 bonus dmg per auto attack this combat
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'AttackSpeed', 40, false, 'const', sim.data);
        },
      });
      addR({
        Trigger: 'OnAutoAttack',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 5) && ctx.target) {
            u._duelistAtks4004 = (u._duelistAtks4004 || 0) + 1;
            sim.dealDamage(u, ctx.target, u._duelistAtks4004 * 5, { origin: 'effect', damageType: 'physical', canCrit: false });
          }
        },
      });
      return list;
    case 4006: // Mage's Cataclysm Engine: +50 Magic; Mage cast inflicts Burn & Frost in range = 15% Magic
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) addStatBonus(h, 'Magic', 50, false, 'const', sim.data);
        },
      });
      addR({
        Trigger: 'OnAbilityCast',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && unitHasClass(u, 7)) {
            const stacks = Math.max(1, Math.round(getUnitStat(u, 'Magic') * 0.15));
            const rng = getUnitStat(u, 'AttackRange');
            for (const e of sim.getAliveUnits(2)) {
              if (hexDistance(u, e) <= rng) {
                sim.applyStatus(u, e, 'Burn', stacks);
                sim.applyStatus(u, e, 'Frost', stacks);
              }
            }
          }
        },
      });
      return list;
    case 4017: // Critical Singularity
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if (getUnitStat(h, 'Crit') < 150) {
              addStatBonus(h, 'Crit', 150 - getUnitStat(h, 'Crit'), false, 'combat', sim.data);
            } else {
              for (const st of ['AttackSpeed', 'Attack', 'Magic']) {
                if (getUnitStat(h, st) < 150) {
                  addStatBonus(h, st, 150 - getUnitStat(h, st), false, 'combat', sim.data);
                }
              }
            }
          }
        },
      });
      return list;
    case 4019: // Venom Amplification Engine
      addR({
        Trigger: 'OnStatusDamageReceived',
        customRun: (sim, ctx) => {
          if (ctx.status === 'Poison' && ctx.target?.team === 2 && (ctx.amount || 0) >= 50) {
            sim.dealDamage(null, ctx.target, ctx.target.maxHp * 0.04, { origin: 'effect', damageType: 'true', canCrit: false });
          }
        },
      });
      return list;
    case 4020: // Glacial Decay Engine: Frost deals damage when it ticks
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          sim.frostDealsDamage = true;
        },
      });
      return list;
    case 4021: // Burning Spiral Engine: Enemy with 100+ Burn dies -> deal 66% Max HP dmg to enemies in 2 hexes
      addR({
        Trigger: 'OnCharacterKilled',
        customRun: (sim, ctx) => {
          const dead = ctx.target;
          if (dead?.team === 2 && (dead.statuses?.Burn || 0) >= 100) {
            const dmg = dead.maxHp * 0.66;
            for (const e of sim.getAliveUnits(2)) {
              if (hexDistance(dead, e) <= 2) {
                sim.dealDamage(null, e, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
              }
            }
          }
        },
      });
      return list;
    case 4022: // Plague Transmission Engine: Start of combat and every 10s, inflict 10 Poison, 20 Frost, 30 Burn
      for (const trig of ['OnCombatStart', 'OnInterval']) {
        addR({
          Trigger: trig,
          EffectInterval: trig === 'OnInterval' ? 10.0 : 0,
          customRun: (sim) => {
            for (const e of sim.getAliveUnits(2)) {
              sim.applyStatus(null, e, 'Poison', 10);
              sim.applyStatus(null, e, 'Frost', 20);
              sim.applyStatus(null, e, 'Burn', 30);
            }
          },
        });
      }
      return list;
    case 4023: // Deceleration Legacy Crystal: After Stall (45), +1% basic stats per 2 Stall triggers this game
    case 4025: // Acceleration Legacy Crystal: For Rush (8), +1% basic stats per 2 Rush triggers this game
      addR({
        Trigger: 'PerFrameEvaluation',
        Keyword: id === 4023 ? 'Stall' : 'Rush',
        StallDuration: id === 4023 ? 45 : 0,
        RushDuration: id === 4025 ? 8 : 0,
        customRun: (sim) => {
          const cnt = id === 4023 ? sim.stallTriggersThisGame || 0 : sim.rushTriggersThisGame || 0;
          const pct = Math.max(1, Math.floor(cnt / 2));
          for (const h of sim.getAliveUnits(1)) {
            for (const st of BASIC_STATS) addStatBonus(h, st, pct, true, 'temp', sim.data);
          }
        },
      });
      return list;
    case 4024: // The Riftbreaker: After Stall(90), break the rift
      addR({
        Trigger: 'Constant',
        Keyword: 'Stall',
        StallDuration: 90.0,
        customRun: (sim) => {
          sim.riftbreakerActive = true;
        },
      });
      return list;
    case 4028: // Rift Storm Invoker: Storm starts 30s sooner, Heroes take 100% reduced Storm damage
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          sim.storm.timeUntilStart = Math.max(1, sim.storm.timeUntilStart - 30);
          sim.heroStormDamageReduction = 1.0;
        },
      });
      return list;
    case 4029: // Temporal Alignment Crystal
      addR({
        Trigger: 'OnStallStart',
        customRun: (sim) => {
          const dmg = 8 * Math.max(1, sim.rushTriggersThisGame || 1);
          for (const e of sim.getAliveUnits(2)) {
            sim.dealDamage(null, e, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        },
      });
      addR({
        Trigger: 'OnRushStart',
        customRun: (sim) => {
          const sh = 8 * Math.max(1, sim.stallTriggersThisGame || 1);
          for (const h of sim.getAliveUnits(1)) sim.applyShield(h, h, sh, 999.0);
        },
      });
      return list;
    case 4035: // Defensive Energy Crystal: Start of combat Tanks & Vanguards 100% MaxHP Shield; Stall (20 and 40) 1000% Defense Shield
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const h of sim.getAliveUnits(1)) {
            if (unitHasClass(h, 2) || unitHasClass(h, 3)) sim.applyShield(h, h, h.maxHp, 15.0);
          }
        },
      });
      for (const stDur of [20, 40]) {
        addR({
          Trigger: 'Constant',
          Keyword: 'Stall',
          StallDuration: stDur,
          customRun: (sim) => {
            for (const h of sim.getAliveUnits(1)) {
              if (unitHasClass(h, 2) || unitHasClass(h, 3)) {
                sim.applyShield(h, h, getUnitStat(h, 'Defense') * 10, 15.0);
              }
            }
          },
        });
      }
      return list;
    case 4037: // Arcane Energy Crystal: Mage/Mystic cast deals 100% Magic dmg to all enemies and 1000% ManaRegen Shield to all Heroes
      addR({
        Trigger: 'OnAbilityCast',
        customRun: (sim, ctx) => {
          const u = ctx.source;
          if (u?.team === 1 && (unitHasClass(u, 6) || unitHasClass(u, 7))) {
            const dmg = getUnitStat(u, 'Magic');
            const sh = getUnitStat(u, 'ManaRegen') * 10;
            for (const e of sim.getAliveUnits(2)) {
              if (dmg > 0) sim.dealDamage(u, e, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
            }
            for (const h of sim.getAliveUnits(1)) {
              if (sh > 0) sim.applyShield(u, h, sh, 10.0);
            }
          }
        },
      });
      return list;
    case 3040: // Poison Migrator
    case 3043: // Frost Migrator
    case 3046: // Burn Migrator
      addR({
        Trigger: 'OnCharacterKilled',
        customRun: (sim, ctx) => {
          const dead = ctx.target;
          if (!dead || dead.team !== 2) return;
          const st = id === 3040 ? 'Poison' : id === 3043 ? 'Frost' : 'Burn';
          const stacks = dead.statuses?.[st] || 0;
          if (stacks > 0) {
            const nearest = sim.findTargetByType(dead, 'NearestAlly');
            if (nearest) sim.applyStatus(null, nearest, st, stacks);
          }
        },
      });
      return list;
    case 3048: // Thermal Inverter
      addR({
        Trigger: 'OnStatusStacksApplied',
        customRun: (sim, ctx) => {
          if (ctx._fromInverter || !ctx.target || ctx.target.team !== 2) return;
          const half = Math.floor((ctx.amount || 0) * 0.5);
          if (half <= 0) return;
          if (ctx.status === 'Burn') sim.applyStatus(ctx.source, ctx.target, 'Frost', half, null, { _fromInverter: true });
          else if (ctx.status === 'Frost') sim.applyStatus(ctx.source, ctx.target, 'Burn', half, null, { _fromInverter: true });
        },
      });
      return list;
    case 5005: // Enemy Relic Immunity: For Rush (18), enemies are immune to damage
    case 5016: // Enemy Relic Immunity: For Rush (13), enemies are immune to damage
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const dur = id === 5005 ? 18 : 13;
          for (const e of sim.getAliveUnits(2)) sim.applyStatus(e, e, 'DamageImmunity', 1, dur);
        },
      });
      return list;
    case 5103: // Burning: 3% Max HP Burn on Heroes
    case 5108: // Flaming: 5% Max HP Burn on Heroes
    case 5118: // The Fairy Ring: 1% Max HP Poison on Heroes
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const pct = id === 5103 ? 0.03 : id === 5108 ? 0.05 : 0.01;
          const st = id === 5118 ? 'Poison' : 'Burn';
          for (const h of sim.getAliveUnits(1)) {
            sim.applyStatus(null, h, st, Math.max(1, Math.round(h.maxHp * pct)));
          }
        },
      });
      return list;
    case 5503:
    case 5504:
    case 5505: // Endurance FightMode: Survive for 30/40/50s; enemies immune to damage
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const dur = id === 5503 ? 30 : id === 5504 ? 40 : 50;
          sim.survivalDuration = dur;
          for (const e of sim.getAliveUnits(2)) {
            sim.applyStatus(e, e, 'DamageImmunity', 1, 999.0);
          }
        },
      });
      return list;
    case 900: // The Red Rift: Enemies have +5% basic stats
      addR({
        Trigger: 'Constant',
        customRun: (sim) => {
          const mult = Math.max(1, Number(customStacks) || 1);
          for (const e of sim.getAliveUnits(2)) {
            for (const st of BASIC_STATS) {
              addStatBonus(e, st, 5 * mult, true, 'const', sim.data);
            }
          }
        },
      });
      return list;
    case 7000: // ActBoss Demon's Fury
      addR({
        Trigger: 'OnDamageReceived',
        customRun: (sim, ctx) => {
          const u = ctx.target;
          if (u && u.team === 2 && !u._boss7000 && u.hp <= u.maxHp * 0.5) {
            u._boss7000 = true;
            addStatBonus(u, 'AttackSpeed', 20, false, 'combat', sim.data);
            sim.applyShield(u, u, u.maxHp * 0.1, 10.0);
          }
        },
      });
      return list;
    case 7001: // ActBoss Hydra's Healing
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          for (const e of sim.getAliveUnits(2)) {
            addStatBonus(e, 'HPPerSecond', Math.floor(e.maxHp / 150), false, 'combat', sim.data);
          }
        },
      });
      return list;
    case 7002: // ActBoss Fire Dragon's Flame
    case 7003: // ActBoss Frost Dragon's Chill
    case 7004: // ActBoss Poison Dragon's Venom
      addR({
        Trigger: 'OnCombatStart',
        customRun: (sim) => {
          const st = id === 7002 ? 'Burn' : id === 7003 ? 'Frost' : 'Poison';
          const defaultStacks = id === 7002 ? 4 : id === 7003 ? 3 : 2;
          const stacks = Number(customStacks) > 0 ? Number(customStacks) : defaultStacks;
          for (const h of sim.getAliveUnits(1)) sim.applyStatus(null, h, st, stacks);
        },
      });
      return list;
  }

  return parseDescriptionEffects(relic.description, origin, null, id);
}

/**
 * General-purpose parser turning localized ability/relic descriptions into executable effect objects.
 */
export function parseDescriptionEffects(description, origin = 'Relic', ownerUid = null, entryId = 0) {
  if (!description || typeof description !== 'string') return [];
  const effects = [];
  const paragraphs = description.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  for (const para of paragraphs) {
    const lower = para.toLowerCase();
    // Skip post-battle expiration reward clauses on SingleBattleBoost relics (e.g. Relic 5128 Strange Yellow Fruit)
    if (lower.includes('when this expires')) continue;

    // Detect Rush / Stall / Interval / Trigger
    let trigger = 'OnCombatStart';
    let keyword = 'None';
    let rushDuration = 0;
    let stallDuration = 0;
    let interval = 0;

    const rushMatch = para.match(/\[Rush\s*\((\d+)\)[:\],]?\]<rush>/i);
    if (rushMatch) {
      keyword = 'Rush';
      rushDuration = parseFloat(rushMatch[1]) || 10;
      trigger = 'Constant';
    }

    let stallDurations = [0];
    const stallMatch = para.match(/\[Stall\s*\(([\d,\s]+and\s+\d+|\d+)\)[:\],]?\]<(?:stall|bold)>/i);
    if (stallMatch) {
      const nums = stallMatch[1].match(/\d+/g)?.map(Number) || [15];
      stallDurations = nums.length > 0 ? nums : [15];
      stallDuration = stallDurations[0] || 15;
      keyword = 'Stall';
      trigger = 'Constant';
    }

    const everySecMatch = para.match(/\[Every\s+(\d+)\s+seconds[,]?\]<bold>/i);
    if (everySecMatch) {
      trigger = 'OnInterval';
      interval = parseFloat(everySecMatch[1]) || 5;
    } else if (/\[Each\s+second[,]?\]<bold>/i.test(para)) {
      trigger = 'OnInterval';
      interval = 1.0;
    } else if (/whenever.*auto\s+attacks/i.test(lower) || /on\s+\[auto\s+attack/i.test(lower)) {
      trigger = 'OnAutoAttack';
    } else if (/whenever.*is\s+\[?auto\s+attacked/i.test(lower)) {
      trigger = 'OnAttackDamageReceived';
    } else if (/whenever.*\[casts\]/i.test(lower) || /on\s+\[cast/i.test(lower)) {
      trigger = 'OnAbilityCast';
    } else if (/whenever.*\[crits\]/i.test(lower) || /on\s+\[crit/i.test(lower)) {
      trigger = 'OnGlobalCrit';
    } else if (/whenever.*kills/i.test(lower) || /on\s+\[kill/i.test(lower)) {
      trigger = 'OnCharacterKilled';
    } else if (/on\s+\[stall\]<stall>\s*\[?trigger/i.test(lower) || /\[on\]<bold>\s*\[stall\]<stall>\s*\[trigger/i.test(lower)) {
      trigger = 'OnStallStart';
    } else if (/on\s+\[rush\]<rush>\s*\[?trigger/i.test(lower)) {
      trigger = 'OnRushStart';
    }

    // Detect class filter: e.g. `[Warriors]<warrior>`
    let filterClassId = 0;
    for (const [tag, cid] of Object.entries(CLASS_TAG_TO_ID)) {
      if (lower.includes(`<${tag}>`)) {
        filterClassId = cid;
        break;
      }
    }

    // 1. Rush duration modifier: `[Rush]<rush> abilities last N seconds longer`
    const rushExtend = para.match(/\[Rush\]<rush>\s+abilities\s+last\s+\[?(\d+)/i);
    if (rushExtend) {
      const dur = parseFloat(rushExtend[1]) || 2;
      effects.push({
        _origin: origin,
        _ownerUid: ownerUid,
        _entryId: entryId,
        Trigger: 'Constant',
        customRun: (sim) => {
          const mult = lower.includes('for each') && filterClassId
            ? sim.getAliveUnits(1).filter((u) => unitHasClass(u, filterClassId)).length
            : 1;
          sim.bonusRushDuration += dur * mult;
        },
      });
      continue;
    }

    // 2. Stall duration reduction: `[Stall]<stall> abilities trigger N seconds (faster|earlier)`
    const stallReduce = para.match(/\[Stall\]<stall>\s+abilities\s+trigger\s+\[?(\d+)/i);
    if (stallReduce) {
      const dur = parseFloat(stallReduce[1]) || 4;
      effects.push({
        _origin: origin,
        _ownerUid: ownerUid,
        _entryId: entryId,
        Trigger: 'Constant',
        customRun: (sim) => {
          const mult = lower.includes('for each') && filterClassId
            ? sim.getAliveUnits(1).filter((u) => unitHasClass(u, filterClassId)).length
            : 1;
          sim.stallReduction += dur * mult;
        },
      });
      continue;
    }

    // 3. Basic stats percent modifier: `(Heroes|Enemies) (gain|have|lose) [+-]?(\d+)% (increased|decreased|reduced)? ?basic stats`
    const basicStatMatch = para.match(/\[([+-]?\d+)%[^\]]*basic\s+stats\]<basicstat>|(\d+)%\s+(increased|decreased|reduced)\s+(?:basic\s+)?stats/i);
    if (basicStatMatch) {
      let pct = parseFloat(basicStatMatch[1] || basicStatMatch[2]) || 10;
      if (lower.includes('lose') || lower.includes('decreased') || lower.includes('reduced')) {
        pct = -Math.abs(pct);
      }
      const targetTeam = lower.startsWith('enemies') || origin === 'EnemyRelic' ? 2 : 1;
      const layer = keyword === 'Rush' ? 'temp' : 'combat';
      for (const sd of stallDurations) {
        effects.push({
          _origin: origin,
          _ownerUid: ownerUid,
          _entryId: entryId,
          Trigger: trigger,
          Keyword: keyword,
          RushDuration: rushDuration,
          StallDuration: sd,
          EffectInterval: interval,
          customRun: (sim) => {
            for (const u of sim.getAliveUnits(targetTeam)) {
              if (filterClassId && !unitHasClass(u, filterClassId)) continue;
              for (const st of BASIC_STATS) addStatBonus(u, st, pct, true, layer, sim.data);
            }
          },
        });
      }
      continue;
    }

    // 4. Stat gains: `[+25 Attack]<attack>`, `[+50% Attack]<attack>`, `[30 Defense]<defense>`
    const statMatches = [...para.matchAll(/\[([+-]?\d+(?:\.\d+)?)(%)?\s+([^\]]+)\]<(attack|defense|magic|maxhp|attackspeed|crit|manaregen|omnivamp|damageamp|hp\/s|hps|attackrange|startingmana)>/gi)];
    // 5. Status applications: `inflict/apply [N Poison]<poison>`, `[N Burn]<burn>`, `[N Frost]<frost>`, `[Stunned for N seconds]<stun>`, `[Stealth for N seconds]<stealth>`
    const statusMatches = [...para.matchAll(/\[(\d+)\s+(Poison|Burn|Frost|Bleed)\]<(poison|burn|frost|bleed)>/gi)];
    const stunMatch = para.match(/\[Stun(?:ned)?\s+for\s+(\d+(?:\.\d+)?)\s+seconds\]<stun>|\[Stun\]<stun>[^\d]*(\d+(?:\.\d+)?)\s+seconds/i);
    const stealthMatch = para.match(/\[Stealth\]<stealth>\s+for\s+(\d+(?:\.\d+)?)\s+seconds|\[Stealth\s+for\s+(\d+(?:\.\d+)?)\s+seconds\]<stealth>/i);
    // 6. Shield / Heal matches: `[400]<shield> ... [Shields]<shield>`, `[150 Shields]<shield>`, `[Shield]<shield> ... equal to [N% of their Stat]<tag>`
    const flatShieldMatch = para.match(/\[(\d+)\s*(?:Shields?)?\]<shield>/i);
    const pctShieldMatch = para.match(/\[Shields?\]<shield>\s+equal\s+to\s+\[(\d+)%\s+of\s+(?:their|its)\s+([^\]]+)\]<(\w+)>/i);
    const pctHealMatch = para.match(/\[heal\]<heal>\s+equal\s+to\s+\[(\d+)%\s+of\s+(?:their|its)\s+([^\]]+)\]<(\w+)>|\[heal\s+(\d+)%\s+(?:of\s+their\s+)?Max\s+HP\]<maxhp>/i);
    const pctBonusDmgMatch = para.match(/deal\s+(?:bonus\s+)?damage[^\[]*\[(\d+)%\s+of\s+their\s+([^\]]+)\]<(\w+)>/i);
    const startSelfDmgMatch = para.match(/take\s+damage\s+equal\s+to\s+\[(\d+(?:\.\d+)?)%\s+of\s+their\s+Max\s+HP\]<maxhp>/i);

    if (
      statMatches.length === 0 &&
      statusMatches.length === 0 &&
      !stunMatch &&
      !stealthMatch &&
      !flatShieldMatch &&
      !pctShieldMatch &&
      !pctHealMatch &&
      !pctBonusDmgMatch &&
      !startSelfDmgMatch
    ) {
      continue;
    }

    for (const sd of stallDurations) {
      effects.push({
        _origin: origin,
        _ownerUid: ownerUid,
        _entryId: entryId,
        Trigger: trigger,
        Keyword: keyword,
        RushDuration: rushDuration,
        StallDuration: sd,
        EffectInterval: interval,
        customRun: (sim, ctx = {}) => {
          // Check trigger source class if this is an event trigger (e.g. "Whenever a Warrior Crits")
          if (
            ['OnAutoAttack', 'OnAbilityCast', 'OnGlobalCrit', 'OnCharacterKilled'].includes(trigger) &&
            filterClassId &&
            ctx.source &&
            !unitHasClass(ctx.source, filterClassId)
          ) {
            return;
          }
          if (trigger === 'OnAttackDamageReceived' && filterClassId && ctx.target && !unitHasClass(ctx.target, filterClassId)) {
            return;
          }

          // Determine recipient units for buffs/heals/shields
          let recipients = [];
          if (ownerUid) {
            const own = sim.getUnit(ownerUid);
            if (own && own.hp > 0) recipients = [own];
          } else if (['OnAutoAttack', 'OnAbilityCast', 'OnGlobalCrit', 'OnCharacterKilled'].includes(trigger) && ctx.source) {
            recipients = [ctx.source];
          } else if (trigger === 'OnAttackDamageReceived' && ctx.target) {
            recipients = [ctx.target];
          } else {
            const team = lower.startsWith('enemies') || origin === 'EnemyRelic' ? 2 : 1;
            recipients = sim.getAliveUnits(team).filter((u) => !filterClassId || unitHasClass(u, filterClassId));
          }

          const layer = keyword === 'Rush' ? 'temp' : lower.includes('permanently') ? 'perm' : 'combat';
          const sign = lower.includes('heroes lose') || lower.includes('reduce') ? -1 : 1;

          for (const m of statMatches) {
            const val = (parseFloat(m[1]) || 0) * sign;
            const isPct = m[2] === '%';
            const tag = m[4].toLowerCase();
            const statName = STAT_TAG_TO_NAME[tag];
            if (statName && val !== 0) {
              for (const u of recipients) addStatBonus(u, statName, val, isPct, layer, sim.data);
            }
          }

          // Determine enemy targets for debuffs/damage
          let enemyTargets = [];
          if (trigger === 'OnAttackDamageReceived' && ctx.source) {
            enemyTargets = [ctx.source];
          } else if (ctx.target && ctx.target.team === 2) {
            enemyTargets = [ctx.target];
          } else {
            enemyTargets = sim.getAliveUnits(origin === 'EnemyRelic' ? 1 : 2);
          }

          for (const sm of statusMatches) {
            const amt = parseInt(sm[1], 10) || 1;
            const stName = sm[2][0].toUpperCase() + sm[2].slice(1).toLowerCase();
            for (const tgt of enemyTargets) sim.applyStatus(ctx.source || null, tgt, stName, amt);
          }

          if (stunMatch) {
            const dur = parseFloat(stunMatch[1] || stunMatch[2]) || 1.5;
            const stTargets = lower.includes('heroes are [stunned') ? sim.getAliveUnits(1) : enemyTargets;
            for (const tgt of stTargets) sim.applyStatus(ctx.source || null, tgt, 'Stun', 1, dur);
          }

          if (stealthMatch) {
            const dur = parseFloat(stealthMatch[1] || stealthMatch[2]) || 3.0;
            for (const u of recipients) sim.applyStatus(u, u, 'Stealth', 1, dur);
          }

          if (flatShieldMatch) {
            const sh = parseFloat(flatShieldMatch[1]) || 100;
            for (const u of recipients) sim.applyShield(u, u, sh, 10.0);
          }

          if (pctShieldMatch) {
            const pct = (parseFloat(pctShieldMatch[1]) || 25) / 100;
            const stName = STAT_TAG_TO_NAME[pctShieldMatch[3].toLowerCase()] || 'MaxHealth';
            for (const u of recipients) {
              sim.applyShield(u, u, getUnitStat(u, stName) * pct, 10.0);
            }
          }

          if (pctHealMatch) {
            const pct = (parseFloat(pctHealMatch[1] || pctHealMatch[4]) || 25) / 100;
            const stName = pctHealMatch[3] ? (STAT_TAG_TO_NAME[pctHealMatch[3].toLowerCase()] || 'MaxHealth') : 'MaxHealth';
            for (const u of recipients) {
              sim.healUnit(u, u, getUnitStat(u, stName) * pct);
            }
          }

          if (pctBonusDmgMatch) {
            const pct = (parseFloat(pctBonusDmgMatch[1]) || 50) / 100;
            const stName = STAT_TAG_TO_NAME[pctBonusDmgMatch[3].toLowerCase()] || 'Attack';
            const src = ctx.source || recipients[0];
            if (src) {
              const dmg = getUnitStat(src, stName) * pct;
              for (const tgt of enemyTargets.slice(0, 1)) {
                sim.dealDamage(src, tgt, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
              }
            }
          }

          if (startSelfDmgMatch) {
            const pct = (parseFloat(startSelfDmgMatch[1]) || 10) / 100;
            for (const h of sim.getAliveUnits(1)) {
              sim.dealDamage(null, h, h.maxHp * pct, { origin: 'effect', damageType: 'true', canCrit: false });
            }
          }
        },
      });
    }
  }

  return effects;
}

const GLOBAL_OR_NON_TARGETED_TRIGGERS = new Set([
  'Constant',
  'PerFrameEvaluation',
  'OnCombatStart',
  'OnCombatVictory',
  'OnInterval',
  'OnRushStart',
  'OnStallStart',
  'OnRushOrStallTriggered',
  'OnShardsGenerated',
  'OnShopReroll',
  'OnAcquire',
]);

/**
 * Evaluates a `ModularEffect` condition + attachment against the trigger context.
 */
export function checkEffectAttachmentAndCondition(sim, effectData, ctx = {}) {
  const eff = effectData;
  const owner = eff._ownerUid ? sim.getUnit(eff._ownerUid) : null;
  const att = eff.AttachmentType || 'Global';
  const attClass = Number(eff.AttachmentClassId) || 0;
  const isGlobalTrigger = GLOBAL_OR_NON_TARGETED_TRIGGERS.has(eff.Trigger);

  if (att === 'OwnerIsSource') {
    if (!owner) return false;
    if (!isGlobalTrigger && ctx.source?.uid !== owner.uid) return false;
  } else if (att === 'OwnerIsTarget') {
    if (!owner) return false;
    if (!isGlobalTrigger && ctx.target?.uid !== owner.uid) return false;
  } else if (att === 'OwnerIsAllyToSource') {
    if (!owner || !ctx.source || ctx.source.team !== owner.team || ctx.source.uid === owner.uid) return false;
  } else if (att === 'OwnerIsEnemyToSource') {
    if (!owner || !ctx.source || ctx.source.team === owner.team) return false;
  } else if (att === 'SourceIsHero') {
    if (!isGlobalTrigger && ctx.source?.team !== 1) return false;
  } else if (att === 'SourceIsMonster') {
    if (eff.Trigger === 'OnStatusDamageReceived') {
      if (ctx.source?.team !== 2 && ctx.target?.team !== 2) return false;
    } else if (!isGlobalTrigger && ctx.source?.team !== 2) {
      return false;
    }
  } else if (att === 'TargetIsHero') {
    if (!isGlobalTrigger && ctx.target?.team !== 1) return false;
  } else if (att === 'TargetIsMonster') {
    if (!isGlobalTrigger && ctx.target?.team !== 2) return false;
  } else if (att === 'SourceIsHeroWithClass') {
    if (isGlobalTrigger) {
      const checkU = ctx.source || owner || ctx.effectTarget;
      if (checkU && !unitHasClass(checkU, attClass)) return false;
    } else if (ctx.source?.team !== 1 || !unitHasClass(ctx.source, attClass)) {
      return false;
    }
  } else if (att === 'TargetIsHeroWithClass') {
    if (isGlobalTrigger) {
      const checkU = ctx.target || owner || ctx.effectTarget;
      if (checkU && !unitHasClass(checkU, attClass)) return false;
    } else if (ctx.target?.team !== 1 || !unitHasClass(ctx.target, attClass)) {
      return false;
    }
  }

  return evaluateCondition(sim, eff.condition, owner, ctx, eff);
}

export function evaluateCondition(sim, cond, owner, ctx = {}, eff = null) {
  if (!cond) return true;
  const type = cond.type || cond.$type || 'NoCondition';
  if (type === 'NoCondition' || type === 'NoQuestCondition') return true;
  const isPreCheck = !!ctx._preCheck;

  switch (type) {
    case 'CompoundCondition':
      return (cond.conditions || []).every((c) => evaluateCondition(sim, c, owner, ctx, eff));
    case 'TargetHasClassCondition': {
      const checkUnit = ctx.effectTarget || owner || ctx.target || ctx.source;
      if (isPreCheck && !checkUnit) return true;
      return unitHasClass(checkUnit, cond.ClassId);
    }
    case 'DoesTriggerTargetHaveStatusCondition':
      return (ctx.target?.statuses?.[cond.Status] || 0) > 0;
    case 'DoesEffectTargetHaveStatusCondition':
    case 'DoesTargetHaveStatusCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner && !ctx.target) return true;
      const tgt = ctx.effectTarget || owner || ctx.target;
      const st = cond.Status || cond.status;
      if (st === 'Shield') return (tgt?.shield || 0) > 0 || (tgt?.statuses?.Shield || 0) > 0;
      return (tgt?.statuses?.[st] || 0) > 0;
    }
    case 'DoesTargetNotHaveStatusCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner && !ctx.target) return true;
      const tgt = ctx.effectTarget || owner || ctx.target;
      const st = cond.Status || cond.status;
      if (st === 'Shield') return (tgt?.shield || 0) <= 0 && (tgt?.statuses?.Shield || 0) <= 0;
      return (tgt?.statuses?.[st] || 0) <= 0;
    }
    case 'DoesTriggerTargetNotHaveActiveShieldCondition': {
      const tgt = ctx.target || ctx.effectTarget;
      return (tgt?.shield || 0) <= 0;
    }
    case 'DoesSourceHaveStatusCondition': {
      const src = ctx.source || owner;
      const st = cond.Status || cond.status;
      if (st === 'Shield') return (src?.shield || 0) > 0 || (src?.statuses?.Shield || 0) > 0;
      return (src?.statuses?.[st] || 0) > 0;
    }
    case 'IsTriggerOfStatusCondition':
    case 'TriggerIsOfStatusCondition':
      return (ctx.status || '').toLowerCase() === String(cond.Status || cond.status || '').toLowerCase();
    case 'TriggerIsDebuffCondition':
    case 'IsTriggerDebuffCondition':
      return DEBUFF_STATUSES.includes(ctx.status);
    case 'TriggerValueIsNotNegativeCondition':
      return (ctx.value ?? ctx.amount ?? 1) >= 0;
    case 'IsTriggerValueOfSizeCondition': {
      const val = Number(ctx.value ?? ctx.amount ?? 0);
      return val >= Number(cond.threshold ?? cond.Threshold ?? 1);
    }
    case 'TriggerTargetIsHeroCondition':
      return ctx.target?.team === 1;
    case 'IsOwnerTriggerTargetCondition':
      return !!(owner && ctx.target && ctx.target.uid === owner.uid);
    case 'IsTriggerTargetNotSourceCondition': {
      const src = ctx.source || owner;
      return !!(src && ctx.target && ctx.target.uid !== src.uid);
    }
    case 'HolderIsIriniCondition':
      return Number(owner?.defId) === 1 || /irini/i.test(owner?.name || '');
    case 'HasEnoughShardsCondition': {
      const req = Number(cond.requiredAmount ?? cond.Amount ?? 100);
      const bank = sim.shardsInBank != null ? sim.shardsInBank : sim.shardsGeneratedThisGame || 0;
      return bank >= req;
    }
    case 'IsOwnerOrAdjacentToOwnerCondition': {
      if (isPreCheck && !ctx.effectTarget) return true;
      const tgt = ctx.effectTarget || ctx.target;
      return !!(owner && tgt && hexDistance(owner, tgt) <= 1);
    }
    case 'IsOwnerEffectTargetOrAdjacentToEffectTargetCondition': {
      if (isPreCheck && !ctx.effectTarget) return true;
      const tgt = ctx.effectTarget;
      const trigTgt = ctx.target || owner;
      return !!(tgt && trigTgt && hexDistance(tgt, trigTgt) <= 1);
    }
    case 'IsOwnerOrOnlyAllyInFrontOfOwnerCondition': {
      if (!owner) return false;
      const alliesInFront = sim
        .getAliveUnits(owner.team)
        .filter((a) => a.uid !== owner.uid && a.cellY > owner.cellY && a.cellX === owner.cellX);
      const fallbackFront =
        alliesInFront.length === 1
          ? alliesInFront
          : sim.getAliveUnits(owner.team).filter((a) => a.uid !== owner.uid && a.cellY > owner.cellY);
      if (fallbackFront.length !== 1) return false;
      if (isPreCheck && !ctx.effectTarget) return true;
      const tgt = ctx.effectTarget || owner;
      return tgt.uid === owner.uid || tgt.uid === fallbackFront[0].uid;
    }
    case 'IsAdjacentToOwnerCondition': {
      if (isPreCheck && !ctx.effectTarget) return true;
      const tgt = ctx.effectTarget || ctx.target;
      return !!(owner && tgt && tgt.uid !== owner.uid && hexDistance(owner, tgt) === 1);
    }
    case 'IsInRangeOfOwnerCondition': {
      if (isPreCheck && !ctx.effectTarget && !ctx.target) return true;
      const tgt = ctx.effectTarget || ctx.target;
      if (!owner || !tgt) return false;
      const rng = Number(cond.Range ?? cond.range ?? getUnitStat(owner, 'AttackRange') ?? 1);
      return hexDistance(owner, tgt) <= rng;
    }
    case 'IsTargetInEffectTargetRangeCondition': {
      if (isPreCheck && !ctx.effectTarget) return true;
      const u = ctx.effectTarget || owner;
      const t = ctx.target;
      if (!u || !t) return false;
      return hexDistance(u, t) <= getUnitStat(u, 'AttackRange');
    }
    case 'IsNearestEnemyToSourceCondition': {
      const src = ctx.source || owner;
      const t = ctx.target || ctx.effectTarget;
      if (!src || !t) return false;
      const nearest = sim.findTargetByType(src, 'NearestEnemy');
      return !!(nearest && nearest.uid === t.uid);
    }
    case 'IsNearestAllyToTriggerTargetCondition': {
      if (isPreCheck && !ctx.effectTarget) return true;
      const ref = ctx.target || owner;
      const cand = ctx.effectTarget;
      if (!ref || !cand) return false;
      const nearest = sim.findTargetByType(ref, 'NearestAlly') || ref;
      return nearest.uid === cand.uid;
    }
    case 'IsFirstAttackAgainstTriggerTargetCondition': {
      const src = ctx.source || owner;
      const t = ctx.target;
      if (!src || !t) return false;
      const setKey = eff?._relicId ? `_attackedTargets_${eff._relicId}` : '_attackedTargets';
      if (!src[setKey]) src[setKey] = new Set();
      if (src[setKey].has(t.uid)) return false;
      if (!isPreCheck) src[setKey].add(t.uid);
      return true;
    }
    case 'AreBothEffectAndTriggerTargetNotOwnerCondition': {
      if (!owner) return true;
      if (isPreCheck && !ctx.effectTarget) return ctx.target?.uid !== owner.uid;
      return ctx.effectTarget?.uid !== owner.uid && ctx.target?.uid !== owner.uid;
    }
    case 'IsEffectTargetInFrontRowCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner) return true;
      const u = ctx.effectTarget || owner;
      return !!(u && u.cellY >= 2);
    }
    case 'IsEffectTargetInFrontTwoRowsCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner) return true;
      const u = ctx.effectTarget || owner;
      return !!(u && u.cellY >= 2);
    }
    case 'IsEffectTargetInBackRowCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner) return true;
      const u = ctx.effectTarget || owner;
      return !!(u && u.cellY <= 1);
    }
    case 'IsEffectTargetOnlyAllyInBackTwoRowsCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner) return true;
      const u = ctx.effectTarget || owner;
      if (!u || u.cellY > 1) return false;
      const backAllies = sim.getAliveUnits(u.team).filter((a) => a.uid !== u.uid && a.cellY <= 1);
      return backAllies.length === 0;
    }
    case 'IsEffectTargetOnlyAllyInXHexRangeCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner) return true;
      const u = ctx.effectTarget || owner;
      if (!u) return false;
      const rng = Number(cond.Range ?? cond.HexRange ?? 1);
      const alliesNear = sim.getAliveUnits(u.team).filter((a) => a.uid !== u.uid && hexDistance(u, a) <= rng);
      return alliesNear.length === 0;
    }
    case 'IsOwnerAdjacentToExactlyOneAllyCondition': {
      const u = owner || ctx.effectTarget;
      if (!u) return false;
      const adj = sim.getAliveUnits(u.team).filter((a) => a.uid !== u.uid && hexDistance(u, a) === 1);
      return adj.length === 1;
    }
    case 'IsOwnerBelowPercentHPCondition': {
      const u = owner || ctx.effectTarget;
      if (!u) return false;
      const pct = Number(cond.Percent ?? cond.percent ?? 0.5);
      const normPct = pct > 1 ? pct / 100 : pct;
      return u.hp / Math.max(1, u.maxHp) <= normPct;
    }
    case 'SacrificialDaggerCondition': {
      const u = owner || ctx.effectTarget;
      if (!u || u._sacrificialScytheTriggered) return false;
      if (u.hp < u.maxHp) return false;
      if (!isPreCheck) u._sacrificialScytheTriggered = true;
      return true;
    }
    case 'IsEffectTargetAloneInRowCondition':
    case 'LoneWolfCondition': {
      if (isPreCheck && !ctx.effectTarget && !owner) return true;
      const u = ctx.effectTarget || owner;
      if (!u) return false;
      const alliesInRow = sim.getAliveUnits(u.team).filter((a) => a.uid !== u.uid && a.cellY === u.cellY);
      return alliesInRow.length === 0;
    }
    case 'IsInsideEffectAoeCondition': {
      const u = ctx.effectTarget || ctx.target;
      if (!u || !ctx.aoeCenter) return true;
      return isUnitInsideAoe(u, ctx.aoeCenter, ctx.aoeEntry);
    }
    case 'IsTriggerTargetTargetingOwnerCondition': {
      const u = ctx.effectTarget || ctx.target;
      return !!(owner && u && u.targetUid === owner.uid);
    }
    case 'IsDamageSourceAttackDamageCondition':
      return ctx.origin === 'attack';
    case 'IsDamageSourceAbilityDamageCondition':
      return ctx.origin === 'ability';
    case 'IsEffectSourceEnemyCondition':
      return (ctx.source || owner)?.team === 2;
    case 'LoganThreshold3CheckCondition':
      return (owner?._loganDamageDealt || 0) >= 600;
    case 'TriggerTargetFirstTimeReachingBurnCountCondition': {
      const t = ctx.target;
      if (!t || t._reachedBurnThreshold || (t.statuses?.Burn || 0) < (cond.threshold || 100)) return false;
      if (!isPreCheck) t._reachedBurnThreshold = true;
      return true;
    }
    case 'TriggerTargetFirstTimeReachingFrostCountCondition': {
      const t = ctx.target;
      if (!t || t._reachedFrostThreshold || (t.statuses?.Frost || 0) < (cond.threshold || 50)) return false;
      if (!isPreCheck) t._reachedFrostThreshold = true;
      return true;
    }
    case 'TriggerTargetFirstTimeReachingPoisonCountCondition': {
      const t = ctx.target;
      if (!t || t._reachedPoisonThreshold || (t.statuses?.Poison || 0) < (cond.threshold || 50)) return false;
      if (!isPreCheck) t._reachedPoisonThreshold = true;
      return true;
    }
    case 'SingleEnemyHasCrossedDebuffCountCondition': {
      const pReq = Number(cond.poisonThreshold ?? 25);
      const fReq = Number(cond.frostThreshold ?? 50);
      const bReq = Number(cond.burnThreshold ?? 75);
      return sim
        .getAliveUnits(2)
        .some(
          (e) =>
            (e.statuses?.Poison || 0) >= pReq &&
            (e.statuses?.Frost || 0) >= fReq &&
            (e.statuses?.Burn || 0) >= bReq
        );
    }
    case 'HasHeroesOfSameClassInPlayCondition':
    case 'HasHeroesOfSameClassInPlayOrReservesCondition': {
      const req = Number(cond.requiredCount ?? 3);
      const pool =
        type === 'HasHeroesOfSameClassInPlayOrReservesCondition'
          ? [...sim.units.filter((u) => u.team === 1), ...(sim.benchUnits || [])]
          : sim.units.filter((u) => u.team === 1);
      for (let cid = 1; cid <= 7; cid++) {
        if (pool.filter((u) => unitHasClass(u, cid)).length >= req) return true;
      }
      return false;
    }
    case 'HasXOrMoreHeroesOfUniqueClassInPlayCondition': {
      const req = Number(cond.minHeroCount ?? cond.requiredCount ?? 3);
      const pool = sim.units.filter((u) => u.team === 1);
      if (pool.length < req) return false;
      const seen = new Set();
      for (const u of pool) {
        for (const c of u.classIds || []) {
          if (seen.has(c)) return false;
          seen.add(c);
        }
      }
      return true;
    }
    case 'HasXOrMoreHeroesOfUniqueClassInPlayOrReservesCondition': {
      const req = Number(cond.requiredCount ?? cond.minHeroCount ?? 7);
      const pool = [...sim.units.filter((u) => u.team === 1), ...(sim.benchUnits || [])];
      const classes = new Set();
      for (const u of pool) {
        for (const c of u.classIds || []) classes.add(c);
      }
      return classes.size >= req;
    }
    case 'HasXCombinedClassesInPlayCondition': {
      const req = Number(cond.requiredCombinedClassCount ?? 4);
      const classes = new Set();
      for (const u of sim.units.filter((h) => h.team === 1)) {
        for (const c of u.classIds || []) classes.add(c);
      }
      return classes.size >= req;
    }
    case 'HasXHeroesInReservesCondition': {
      const req = Number(cond.numHeroes ?? 2);
      return (sim.benchUnits || []).length >= req;
    }
    case 'HasHeroesOfXRanksCondition': {
      const req = Number(cond.numUniqueRanks ?? 3);
      const ranks = new Set(sim.units.filter((h) => h.team === 1).map((h) => h.rank || 1));
      return ranks.size >= req;
    }
    case 'HasOneSurvivingHeroCondition':
      return sim.getAliveUnits(1).length === 1;
    case 'VindictiveShieldsHasNotTriggeredCondition':
      return !owner?._vindictiveTriggered;
    default:
      return true;
  }
}

/**
 * Resolves the target units for a `ModularEffect` based on its `TargetType`.
 * Note: In game_data.json, `AllHeroes` means Team 1 (player heroes) and `AllEnemies` means Team 2 (stage enemies).
 */
export function resolveEffectTargets(sim, eff, owner, ctx = {}) {
  const tt = eff.TargetType || 'Owner';
  switch (tt) {
    case 'Owner':
      return owner && owner.hp > 0 ? [owner] : [];
    case 'AllHeroes': {
      const units = sim.getAliveUnits(1);
      if (ctx.aoeCenter && ctx.aoeEntry) {
        return units.filter((u) => isUnitInsideAoe(u, ctx.aoeCenter, ctx.aoeEntry));
      }
      return units;
    }
    case 'AllEnemies': {
      const units = sim.getAliveUnits(2);
      if (ctx.aoeCenter && ctx.aoeEntry) {
        return units.filter((u) => isUnitInsideAoe(u, ctx.aoeCenter, ctx.aoeEntry));
      }
      return units;
    }
    case 'HeroesWithClass': {
      const cid = Number(eff.ClassId) || 0;
      return sim.getAliveUnits(1).filter((u) => unitHasClass(u, cid));
    }
    case 'HeroesOfGuild': {
      const gid = Number(eff.GuildId) || 0;
      return sim.getAliveUnits(1).filter((u) => Number(u.guildId) === gid);
    }
    case 'TriggerTarget':
      return ctx.target && ctx.target.hp > 0 ? [ctx.target] : (owner && owner.hp > 0 ? [owner] : []);
    case 'TriggerSource':
      return ctx.source && ctx.source.hp > 0 ? [ctx.source] : (owner && owner.hp > 0 ? [owner] : []);
    case 'Player':
      return owner ? [owner] : sim.getAliveUnits(1).slice(0, 1);
    default:
      return owner && owner.hp > 0 ? [owner] : [];
  }
}

/**
 * Executes a serialized `ModularEffect` (its `actions` array) on all matching targets.
 */
export function executeModularEffect(sim, eff, ctx = {}, layerOverride = null) {
  if (!eff) return;
  if (typeof eff.customRun === 'function') {
    eff.customRun(sim, ctx);
    return;
  }

  const owner = eff._ownerUid ? sim.getUnit(eff._ownerUid) : (ctx.source || null);
  const targets = resolveEffectTargets(sim, eff, owner, ctx);
  const actions = eff.actions || [];
  if (actions.length === 0) return;

  const statLayer =
    layerOverride ||
    (eff.Keyword === 'Rush' || eff.Trigger === 'PerFrameEvaluation'
      ? 'temp'
      : eff.Trigger === 'Constant' && eff.Keyword !== 'Stall'
        ? 'const'
        : 'combat');

  for (const tgt of targets) {
    const targetCtx = { ...ctx, effectTarget: tgt, _preCheck: false };
    if (!checkEffectAttachmentAndCondition(sim, eff, targetCtx)) continue;

    for (const act of actions) {
      executeEffectAction(sim, act, owner, tgt, targetCtx, statLayer, eff);
    }
  }
}

export function executeEffectAction(sim, act, owner, target, ctx = {}, statLayer = 'combat', eff = null) {
  if (!act) return;
  const type = act.type || act.$type;
  const src = owner || ctx.source || target;

  switch (type) {
    case 'ModifyStatAction':
      if (ctx._isDamageDealingContext && act.StatType === 'Crit') {
        ctx.bonusCrit = (ctx.bonusCrit || 0) + (Number(act.Value) || 0);
      } else {
        addStatBonus(target, act.StatType, Number(act.Value) || 0, false, statLayer, sim.data);
      }
      break;
    case 'ModifyStatPercentAction':
      addStatBonus(target, act.StatType, (Number(act.Percent) || 0) * 100, true, statLayer, sim.data);
      break;
    case 'ModifyPermanentStatAction':
      addStatBonus(target, act.StatType, Number(act.Value) || 0, false, 'perm', sim.data);
      break;
    case 'ModifyAllBasicStatsPercentAction': {
      const pct = (Number(act.Percent) || 0) * 100;
      for (const s of BASIC_STATS) addStatBonus(target, s, pct, true, statLayer, sim.data);
      break;
    }
    case 'ModifyPrimaryClassStatsPercentAction': {
      const pct = (Number(act.Percent) || 0) * 100;
      for (const cid of target.classIds || []) {
        const cls = sim.data?.classes?.[cid];
        if (cls?.primaryStat) addStatBonus(target, cls.primaryStat, pct, true, statLayer, sim.data);
      }
      break;
    }
    case 'ModifyStatPerRankAction':
    case 'ModifyOwnerStatPerRankAction': {
      const unit = type === 'ModifyOwnerStatPerRankAction' ? (owner || target) : target;
      const r = Math.max(1, unit?.rank || 1);
      const val = (Number(act.Value) || 0) + (Number(act.PerRank) || 0) * (r - 1);
      addStatBonus(unit, act.StatType, val, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFlatPerOwnerRankAction': {
      const r = Math.max(1, (owner || target)?.rank || 1);
      const val = (Number(act.AmountPerRank) || 0) * r;
      addStatBonus(target, act.StatType, val, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromOwnerRankAction': {
      const r = Math.max(1, (owner || target)?.rank || 1);
      const val = (Number(act.base) || 0) + (Number(act.amountPerRank) || 0) * (r - 1);
      addStatBonus(target, act.stat || act.StatType, val, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromStatAction': {
      const srcVal = getUnitStat(target, act.StatTypeSource);
      let bonus = srcVal * (Number(act.Percent) || 0);
      if (act.Max > 0) bonus = Math.min(bonus, Number(act.Max));
      addStatBonus(target, act.StatTypeTarget, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyTargetStatFromOwnerStatIncrementAction': {
      const srcVal = getUnitStat(owner || target, act.SourceStat);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(srcVal / inc) * (Number(act.TargetValue) || 1);
      addStatBonus(target, act.TargetStat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyTargetFlatStatFromTargetStatIncrementAction':
    case 'ModifyTargetStatFromTargetStatIncrementAction': {
      const srcVal = getUnitStat(target, act.StatTypeSource || act.SourceStat);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(srcVal / inc) * (Number(act.Value ?? act.TargetValue) || 1);
      addStatBonus(target, act.StatTypeTarget || act.TargetStat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyTargetStatFromTargetStatPercentAction': {
      const srcVal = getUnitStat(target, act.SourceStat);
      const bonus = srcVal * (Number(act.Percent) || 0);
      addStatBonus(target, act.TargetStat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyTargetStatFromOwnerStatPercentAction': {
      const srcVal = getUnitStat(owner || target, act.SourceStat || act.StatTypeSource);
      const bonus = srcVal * (Number(act.Percent) || 0);
      addStatBonus(target, act.TargetStat || act.StatTypeTarget, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyTargetStatFromTriggerValueIncrementAction': {
      const val = Number(ctx.value ?? ctx.amount ?? 0);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(val / inc) * (Number(act.TargetValue ?? act.Value ?? 1) || 1);
      addStatBonus(target, act.TargetStat || act.StatType, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyTargetStatFromTargetShieldIncrementAction': {
      const sh = target?.shield || 0;
      const inc = Math.max(1, Number(act.Increment) || 10);
      const bonus = Math.floor(sh / inc) * (Number(act.TargetValue ?? act.Value ?? 1) || 1);
      addStatBonus(target, act.TargetStat || act.StatType, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatByTriggerValuePercentAction': {
      const val = Number(ctx.value ?? ctx.amount ?? 0);
      const bonus = val * (Number(act.Percent ?? act.percent) || 0);
      addStatBonus(target, act.StatType || act.stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromNumClassActiveAction': {
      const cid = Number(act.ClassId) || 0;
      const cnt = sim.getAliveUnits(1).filter((u) => unitHasClass(u, cid)).length;
      addStatBonus(target, act.StatType || act.Stat, cnt * (Number(act.Amount ?? act.Value) || 1), false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromDistanceToTargetAction': {
      const u = owner || target;
      const t = sim.getUnit(u?.targetUid) || ctx.target;
      if (u && t) {
        const dist = hexDistance(u, t);
        addStatBonus(target, act.StatType || act.Stat, dist * (Number(act.AmountPerHex ?? act.Amount ?? 1) || 1), false, statLayer, sim.data);
      }
      break;
    }
    case 'ModifyStatFromDebuffStacksOnAllEnemiesAction': {
      let stacks = 0;
      for (const e of sim.getAliveUnits(2)) stacks += countTotalDebuffStacks(e);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(stacks / inc) * (Number(act.Amount ?? act.Value ?? 1) || 1);
      addStatBonus(target, act.StatType || act.Stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatPerDebuffsOnTriggerTargetAction': {
      const debuffTarget = ctx.target || target;
      const stacks = countTotalDebuffStacks(debuffTarget);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(stacks / inc) * (Number(act.Amount ?? act.Value ?? 1) || 1);
      addStatBonus(target, act.StatType || act.Stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatByAmountForIncrementInRangeOfOwnerAction': {
      const u = owner || target;
      const rng = Number(act.Range ?? getUnitStat(u, 'AttackRange') ?? 1);
      const cnt = sim.getAliveUnits(2).filter((e) => hexDistance(u, e) <= rng).length;
      addStatBonus(target, act.StatType || act.Stat, cnt * (Number(act.Amount ?? act.Value ?? 1) || 1), false, statLayer, sim.data);
      break;
    }
    case 'ModifyRandomBasicStatAction': {
      const st = BASIC_STATS[Math.floor((sim.rng ? sim.rng() : Math.random()) * BASIC_STATS.length)] || 'Attack';
      addStatBonus(target, st, Number(act.Amount ?? act.Value ?? 5) || 5, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromTargetsLowestResistanceAction': {
      addStatBonus(target, act.StatType || 'DamageAmp', Number(act.Amount ?? 10) || 10, false, statLayer, sim.data);
      break;
    }
    case 'ApplyStatReductionToTargetAction': {
      const amt = Number(act.Amount ?? act.Value ?? 5) || 5;
      addStatBonus(target, act.StatType || 'Defense', -Math.abs(amt), false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromTotalShieldWithMaxAction': {
      const sh = target?.shield || 0;
      const inc = Math.max(1, Number(act.Increment) || 10);
      let bonus = Math.floor(sh / inc) * (Number(act.Value) || 1);
      if (act.Max > 0) bonus = Math.min(bonus, Number(act.Max));
      addStatBonus(target, act.StatType, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatPercentageFromNumEnemiesTargetingAction': {
      const enemiesTargeting = sim.getAliveUnits(target.team === 1 ? 2 : 1).filter((e) => e.targetUid === target.uid).length;
      const pct = enemiesTargeting * (Number(act.Percent) || 0) * 100;
      addStatBonus(target, act.StatType, pct, true, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromDebuffTypesOfAllEnemiesAction': {
      let totalTypes = 0;
      for (const e of sim.getAliveUnits(2)) totalTypes += countDebuffTypes(e);
      addStatBonus(target, act.StatType, totalTypes * (Number(act.amountPerDebuff) || 1), false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatPerTargetDebuffsAction': {
      const debuffTarget = ctx.target || target;
      const cnt = countDebuffTypes(debuffTarget);
      addStatBonus(target, act.StatType, cnt * (Number(act.Amount) || 1), false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromSpecificDebuffInRangeOfOwnerAction': {
      const u = owner || target;
      const rng = getUnitStat(u, 'AttackRange');
      let stacks = 0;
      for (const e of sim.getAliveUnits(2)) {
        if (hexDistance(u, e) <= rng) stacks += e.statuses?.[act.Status] || 0;
      }
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(stacks / inc) * (Number(act.Amount) || 1);
      addStatBonus(target, act.Stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromOwnerMissingHealthAction': {
      const u = owner || target;
      const missingPct = Math.max(0, (u.maxHp - u.hp) / Math.max(1, u.maxHp)) * 100;
      const bonus = missingPct * (Number(act.Percent) || 1);
      addStatBonus(target, act.StatTypeTarget, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromOwnerTargetMissingHealthAction': {
      const u = owner || target;
      const t = sim.getUnit(u?.targetUid) || ctx.target;
      if (t) {
        const missingPct = Math.max(0, (t.maxHp - t.hp) / Math.max(1, t.maxHp)) * 100;
        let bonus = 0;
        if (act.AmountPerPercentMissing !== undefined) {
          bonus = Math.floor(missingPct) * (Number(act.AmountPerPercentMissing) || 1);
        } else {
          const inc = Math.max(1, Number(act.MissingHealthPercentIncrement) || 10);
          bonus = Math.floor(missingPct / inc) * (Number(act.Amount) || 1);
        }
        addStatBonus(target, act.StatTypeTarget || act.StatType || 'Crit', bonus, false, statLayer, sim.data);
      }
      break;
    }
    case 'ModifyStatByTriggerValuePerIncrementAction': {
      const val = Number(ctx.value ?? ctx.amount ?? 0);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const bonus = Math.floor(val / inc) * (Number(act.Amount ?? 1) || 1);
      addStatBonus(target, act.StatType, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ModifyStatFromShardsAction':
    case 'ApplyStatsFromShardsGeneratedThisGameAction': {
      const inc = Math.max(1, Number(act.increment || act.ThreholdAmount || 5));
      const amt = Number(act.amount || act.GainAmount || 1);
      const bonus = Math.floor(sim.shardsGeneratedThisGame / inc) * amt;
      addStatBonus(target, act.stat || act.StatType, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ApplyStatsFromRushTriggersThisGameAction': {
      const inc = Math.max(1, Number(act.increment) || 1);
      const amt = Number(act.amount) || 1;
      const bonus = Math.floor(sim.rushTriggersThisGame / inc) * amt;
      addStatBonus(target, act.stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ApplyStatsFromStallTriggersThisGameAction': {
      const inc = Math.max(1, Number(act.increment) || 1);
      const amt = Number(act.amount) || 1;
      const bonus = Math.floor(sim.stallTriggersThisGame / inc) * amt;
      addStatBonus(target, act.stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'ApplyStatsFromRerollsThisGameAction': {
      const inc = Math.max(1, Number(act.increment) || 1);
      const amt = Number(act.amount) || 1;
      const bonus = Math.floor(sim.rerollsThisGame / inc) * amt;
      addStatBonus(target, act.stat, bonus, false, statLayer, sim.data);
      break;
    }
    case 'SetStatsToHigherOfTheTwoAction': {
      const s1 = act.Stat1 || 'Attack';
      const s2 = act.Stat2 || 'Magic';
      const v1 = getUnitStat(target, s1);
      const v2 = getUnitStat(target, s2);
      if (v1 > v2) addStatBonus(target, s2, v1 - v2, false, statLayer, sim.data);
      else if (v2 > v1) addStatBonus(target, s1, v2 - v1, false, statLayer, sim.data);
      break;
    }
    case 'AddHeroClassAction': {
      const cid = Number(act.ClassId);
      if (cid && target && Array.isArray(target.classIds) && !target.classIds.includes(cid)) {
        target.classIds.push(cid);
      }
      break;
    }
    case 'AddHeroClassOrModifyStatPercentAction': {
      const cid = Number(act.ClassId);
      if (cid && target && Array.isArray(target.classIds)) {
        if (!target.classIds.includes(cid)) {
          target.classIds.push(cid);
        } else if (!eff?._addedClass && act.StatType) {
          addStatBonus(target, act.StatType, (Number(act.Percent) || 0) * 100, true, statLayer, sim.data);
        }
      }
      break;
    }
    case 'ApplyStatusAction':
      sim.applyStatus(src, target, act.Status, Number(act.Amount) || 1);
      break;
    case 'ApplyStatusWithDurationAction':
      sim.applyStatus(src, target, act.Status, Number(act.Amount) || 1, Number(act.Duration) || 2.0);
      break;
    case 'ApplyStatusFromOwnerStatAction': {
      const u = owner || src;
      const statVal = getUnitStat(u, act.StatType);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const mult = Number(act.Multiplier) || 1;
      const stacks = Math.round((Number(act.Base) || 0) + Math.floor(statVal / inc) * mult);
      if (stacks > 0) sim.applyStatus(u, target, act.Status, stacks);
      break;
    }
    case 'ApplyStatusFromOwnerStatPercentAction': {
      const u = owner || src;
      const statVal = getUnitStat(u, act.statType || act.StatType);
      const stacks = Math.round((Number(act.base) || 0) + statVal * (Number(act.percent) || 0));
      if (stacks > 0) sim.applyStatus(u, target, act.status || act.Status, stacks);
      break;
    }
    case 'ApplyStatusFromOwnerStatWithMaxAction': {
      const u = owner || src;
      const statVal = getUnitStat(u, act.StatType);
      const inc = Math.max(1, Number(act.Increment) || 1);
      let stacks = (Number(act.Base) || 0) + Math.floor(statVal / inc);
      if (act.Max > 0) stacks = Math.min(stacks, Number(act.Max));
      if (stacks > 0) sim.applyStatus(u, target, act.Status, stacks);
      break;
    }
    case 'ApplyStatusFlatFromStatWithBaseAction': {
      const u = owner || src;
      const statVal = getUnitStat(u, act.Stat || act.StatType);
      const inc = Math.max(1, Number(act.Increment) || 1);
      const stacks = (Number(act.Base) || 0) + Math.floor(statVal / inc);
      if (stacks > 0) sim.applyStatus(u, target, act.Status, stacks);
      break;
    }
    case 'ApplyStatusFromTriggerStatusAction':
      if (ctx._fromAmp) break;
      if (ctx.status) sim.applyStatus(src, target, ctx.status, Number(act.Amount) || 1, 2.0, { _fromAmp: true });
      break;
    case 'ApplyStatusFromTriggerStatusAmountPercentAction': {
      if (ctx._fromAmp) break;
      const st = act.Status || ctx.status;
      const amt = Math.round((ctx.amount || 0) * (Number(act.Percent) || 0));
      if (st && amt > 0) sim.applyStatus(src, target, st, amt, 2.0, { _fromAmp: true });
      break;
    }
    case 'ApplyStatusToNearestAllyOfTriggerTargetAction': {
      const ref = ctx.target || target;
      const ally = sim.findTargetByType(ref, 'NearestAlly');
      if (ally) sim.applyStatus(src, ally, act.Status, Number(act.Amount) || 1);
      break;
    }
    case 'CleansePercentDebuffsAction': {
      const pct = Number(act.percent) || 0.5;
      for (const st of ['Burn', 'Frost', 'Poison', 'Bleed']) {
        if ((target.statuses?.[st] || 0) > 0) {
          target.statuses[st] = Math.max(0, Math.floor(target.statuses[st] * (1 - pct)));
        }
      }
      break;
    }
    case 'IncreaseDebuffCountByOwnerStatPercentAction': {
      const u = owner || src;
      const pct = (getUnitStat(u, act.Stat) * (Number(act.Percent) || 0)) / 100;
      if (pct > 0) {
        for (const st of ['Burn', 'Frost', 'Poison', 'Bleed']) {
          const cur = target.statuses?.[st] || 0;
          if (cur > 0) sim.applyStatus(u, target, st, Math.ceil(cur * pct));
        }
      }
      break;
    }
    case 'RemoveFrostStackToStunAction': {
      const req = Number(act.StacksToRemove) || 40;
      if ((target.statuses?.Frost || 0) >= req) {
        target.statuses.Frost -= req;
        sim.applyStatus(src, target, 'Stun', 1, Number(act.StunDuration) || 2.0);
      }
      break;
    }
    case 'ApplyShieldAction':
      sim.applyShield(src, target, Number(act.Amount) || 0, Number(act.Duration) || 10.0);
      break;
    case 'ApplyShieldWithScalingAction': {
      const sh = evaluateScalings(owner || src, act.Scalings, act.BaseShield || 0);
      sim.applyShield(src, target, sh, Number(act.Duration) || 10.0);
      break;
    }
    case 'ApplyShieldFromStatAction':
    case 'ApplyShieldFromSourceStatAction': {
      const ref = type === 'ApplyShieldFromSourceStatAction' ? (owner || src) : target;
      const sh = getUnitStat(ref, act.StatType) * (Number(act.Percent) || 0);
      sim.applyShield(src, target, sh, Number(act.Duration) || 10.0);
      break;
    }
    case 'ApplyShieldFromStatWithBaseAction': {
      const ref = owner || target;
      const sh = (Number(act.Base) || 0) + getUnitStat(ref, act.StatType) * (Number(act.Percent) || 0);
      sim.applyShield(src, target, sh, Number(act.Duration) || 10.0);
      break;
    }
    case 'ApplyShieldPerOwnerRankAction': {
      const r = Math.max(1, (owner || target)?.rank || 1);
      const sh = (Number(act.baseAmount) || 0) + (Number(act.amountPerRank) || 0) * (r - 1);
      sim.applyShield(src, target, sh, Number(act.duration) || 10.0);
      break;
    }
    case 'ApplyShieldFromDamageDealtAction': {
      const dmg = Number(ctx.amount || ctx.value || 0);
      if (dmg > 0) sim.applyShield(src, target, dmg * (Number(act.Percent) || 0.5), Number(act.Duration) || 10.0);
      break;
    }
    case 'ShieldFromTotalEnemyDebuffsAction': {
      let stacks = 0;
      for (const e of sim.getAliveUnits(2)) stacks += countTotalDebuffStacks(e);
      const inc = Math.max(1, Number(act.StackIncrement) || 1);
      const sh = Math.floor(stacks / inc) * (Number(act.IncrementAmount) || 1);
      if (sh > 0) sim.applyShield(src, target, sh, Number(act.Duration) || 10.0);
      break;
    }
    case 'IncreaseShieldFromTriggerAction': {
      if (ctx._fromAmp) break;
      const amt = Number(ctx.amount || 0) * (Number(act.Percent) || 0.25);
      if (amt > 0) sim.applyShield(src, target, amt, Number(act.Duration) || 10.0, { _fromAmp: true });
      break;
    }
    case 'DealDamageAction':
      sim.dealDamage(src, target, Number(act.Amount) || 0, { origin: 'effect', damageType: 'magic', canCrit: false });
      break;
    case 'DealDamageWithScalingAction': {
      const dmg = evaluateScalings(owner || src, act.Scalings, act.BaseDamage || 0);
      sim.dealDamage(src, target, dmg, { origin: 'ability', damageType: 'magic', canCrit: false });
      break;
    }
    case 'DealCritableDamageWithScalingAction': {
      const dmg = evaluateScalings(owner || src, act.Scalings, act.BaseDamage || 0);
      sim.dealDamage(src, target, dmg, { origin: 'ability', damageType: 'magic', canCrit: true });
      break;
    }
    case 'DealDamageFromOwnerStatAction':
    case 'DealDamageFromSourceStatAction': {
      const ref = type === 'DealDamageFromOwnerStatAction' ? (owner || src) : (ctx.source || owner || src);
      const dmg = getUnitStat(ref, act.StatType) * (Number(act.PercentDamage) || 0);
      sim.dealDamage(ref, target, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
      break;
    }
    case 'DealDamageFromOwnerStatToAdjacentEnemiesAction': {
      const u = owner || src;
      const dmg = getUnitStat(u, act.StatType) * (Number(act.PercentDamage) || 0);
      for (const e of sim.getAliveUnits(u.team === 1 ? 2 : 1)) {
        if (hexDistance(u, e) <= 1) {
          sim.dealDamage(u, e, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
        }
      }
      break;
    }
    case 'DealDamageFromStatusStackCountAction': {
      const stacks = target.statuses?.[act.Status] || 0;
      const dmg = stacks * (Number(act.Amount) || 1);
      if (dmg > 0) sim.dealDamage(src, target, dmg, { origin: 'effect', damageType: 'magic', canCrit: false });
      break;
    }
    case 'DealDamagePercentFromTriggerValueAction':
    case 'ReflectDamageFromShieldRemovedAction': {
      const pct = Number(act.percent ?? act.PercentReflect ?? 0.5);
      const val = Number(ctx.shieldAbsorbed ?? ctx.amount ?? ctx.value ?? 0);
      if (val > 0) sim.dealDamage(src, target, val * pct, { origin: 'effect', damageType: 'magic', canCrit: false });
      break;
    }
    case 'KaiDealDamageAction': {
      const u = owner || src;
      const shDmg = (u?.shield || 0) * (Number(act.percentShieldDamage) || 1.0);
      if (shDmg > 0) sim.dealDamage(u, target, shDmg, { origin: 'ability', damageType: 'physical', canCrit: true });
      break;
    }
    case 'ZuriApplyStunAndPoisonAction': {
      const u = owner || src;
      sim.applyStatus(u, target, 'Stun', 1, Number(act.baseStunDuration) || 4.0);
      const p = Math.max(2, (u?._stoneSkinCount || 1) * (Number(act.poisonPerStack) || 2));
      sim.applyStatus(u, target, 'Poison', p);
      break;
    }
    case 'SalActiveEffectAction':
      if (target) {
        target._salPermafrost = {
          frost: (Number(act.frostPerRank) || 1) * (target.rank || 1),
          baseDmg: Number(act.baseBonusDamage) || 10,
          magicPct: Number(act.magicBonusPercent) || 0.5,
        };
      }
      break;
    case 'ExecuteAutoAttackPercentAction': {
      const u = owner || src;
      const dmg = sim.getAutoAttackDamage(u) * (Number(act.PercentDamage) || 0.5);
      sim.dealDamage(u, target, dmg, { origin: 'attack', damageType: 'physical', canCrit: true });
      break;
    }
    case 'ExecuteEnemyBelowMaxHPPercentThresholdAction': {
      const thresh = Number(act.Threshold) || 0.15;
      if (target && target.team === 2 && target.hp > 0 && target.hp / Math.max(1, target.maxHp) <= thresh) {
        sim.dealDamage(src, target, target.hp + 9999, { origin: 'effect', damageType: 'true', ignoresShield: true });
      }
      break;
    }
    case 'HealAction':
      sim.healUnit(src, target, Number(act.Amount) || 0);
      break;
    case 'HealPercentAction':
      sim.healUnit(src, target, target.maxHp * (Number(act.Percent) || 0));
      break;
    case 'HealFromStatAction':
      sim.healUnit(src, target, getUnitStat(owner || target, act.StatType) * (Number(act.Percent) || 0));
      break;
    case 'HealPercentFromTriggerValueAction': {
      const val = Number(ctx.amount || ctx.value || 0);
      if (val > 0) sim.healUnit(src, target, val * (Number(act.percent) || 0.5));
      break;
    }
    case 'HealWithScalingAction': {
      const heal = evaluateScalings(owner || src, act.Scalings, act.Base || 0);
      sim.healUnit(src, target, heal);
      break;
    }
    case 'GiveManaAction':
      sim.giveMana(target, Number(act.Amount) || 0);
      break;
    case 'StealManaFromTriggerTargetAction': {
      const amt = Number(act.ManaToSteal) || 1;
      const victim = ctx.target || target;
      const beneficiary = owner || src;
      if (victim && beneficiary) {
        const stolen = Math.min(victim.mana || 0, amt);
        victim.mana = Math.max(0, (victim.mana || 0) - stolen);
        sim.giveMana(beneficiary, amt);
      }
      break;
    }
    case 'GainShardsAction':
      if (ctx._fromShardBonus) break;
      sim.gainShards(Number(act.Amount) || 1, {
        source: owner || src,
        target: target || owner || src,
        _fromShardBonus: eff?.Trigger === 'OnShardsGenerated',
      });
      break;
    case 'TauntAllEnemiesAction':
      if (target) sim.tauntAllEnemies(target);
      break;
    case 'IncreasePlayerRushDurationAction':
    case 'IncreaseRushDurationAction':
      sim.bonusRushDuration += Number(act.Duration) || 1;
      break;
    case 'ReducePlayerStallDurationAction':
    case 'ReduceStallDurationAction':
      sim.stallReduction += Number(act.Duration) || 2;
      break;
    case 'CriticalAscendancyAction':
      sim.applyStatus(src, target, 'Stun', 1, Number(act.stunDuration) || 2.5);
      if (ctx._isDamageDealingContext) {
        ctx.bonusCrit = (ctx.bonusCrit || 0) + (Number(act.critBuff) || 1500);
      } else {
        addStatBonus(target, 'Crit', Number(act.critBuff) || 1500, false, 'combat', sim.data);
      }
      break;
    case 'TriggerVindictiveShieldsAction':
      if (owner && !owner._vindictiveTriggered) {
        owner._vindictiveTriggered = true;
        sim.applyShield(owner, owner, owner.maxHp * 0.5, 10.0);
      }
      break;
    case 'GrantAdditionalAutoAttackAction':
      if (owner && target && target.hp > 0) {
        const dmg = sim.getAutoAttackDamage(owner);
        sim.dealDamage(owner, target, dmg, { origin: 'attack', damageType: 'physical', canCrit: true });
      }
      break;
    case 'TriggerTargetNextAttackCritAction':
      if (target) addStatBonus(target, 'Crit', 100, false, 'combat', sim.data);
      break;
    case 'SpreadStatusToAdjacentEnemiesAction': {
      const ref = ctx.target || target;
      if (ref) {
        const st = act.Status || ctx.status || 'Poison';
        const stacks = ref.statuses?.[st] || Number(act.Amount) || 1;
        if (stacks > 0) {
          for (const e of sim.getAliveUnits(ref.team)) {
            if (e.uid !== ref.uid && hexDistance(ref, e) <= 1) {
              sim.applyStatus(src, e, st, stacks);
            }
          }
        }
      }
      break;
    }
    case 'IncreaseDebuffStackToEnemiesInRangeAction': {
      const u = owner || src;
      const rng = Number(act.Range ?? getUnitStat(u, 'AttackRange') ?? 2);
      const amt = Number(act.Amount ?? 1) || 1;
      for (const e of sim.getAliveUnits(2)) {
        if (hexDistance(u, e) <= rng) {
          for (const st of DEBUFF_STATUSES) {
            if ((e.statuses?.[st] || 0) > 0) sim.applyStatus(u, e, st, amt);
          }
        }
      }
      break;
    }
    case 'RemoveAllFrostAddFrostInExplosionAction': {
      const ref = ctx.target || target;
      if (ref && (ref.statuses?.Frost || 0) > 0) {
        const stacks = ref.statuses.Frost;
        ref.statuses.Frost = 0;
        for (const e of sim.getAliveUnits(ref.team)) {
          if (hexDistance(ref, e) <= 2) {
            sim.applyStatus(src, e, 'Frost', stacks);
            sim.dealDamage(src, e, stacks * 2, { origin: 'effect', damageType: 'magic', canCrit: false });
          }
        }
      }
      break;
    }
    case 'ConvertDamageToStatusPercentAction': {
      const dmg = Number(ctx.amount || ctx.value || 0);
      const st = act.Status || 'Burn';
      const stacks = Math.max(1, Math.round(dmg * (Number(act.Percent) || 0.05)));
      if (dmg > 0 && target) sim.applyStatus(src, target, st, stacks);
      break;
    }
    case 'StatCrystalStartOfCombatAction': {
      if (act.stat1) addStatBonus(target, act.stat1, Number(act.amount1) || 0, false, 'combat', sim.data);
      if (act.stat2) addStatBonus(target, act.stat2, Number(act.amount2) || 0, false, 'combat', sim.data);
      break;
    }
    case 'PowerCrystalAction':
    case 'LargePowerCrystalAction': {
      const mult = type === 'LargePowerCrystalAction' ? 3 : 1;
      const statInc = {
        Attack: 12 * mult,
        Magic: 12 * mult,
        Defense: 12 * mult,
        MaxHealth: 100 * mult,
        AttackSpeed: 10 * mult,
        Crit: 8 * mult,
        ManaRegen: 2 * mult,
      };
      for (const cid of target?.classIds || []) {
        const cls = sim.data?.classes?.[cid];
        const ps = cls?.primaryStat;
        if (ps && statInc[ps]) {
          addStatBonus(target, ps, statInc[ps], false, 'perm', sim.data);
        }
      }
      break;
    }
    case 'ApplyItemStatsFromLegacyStacksAction': {
      const stacks = Number(eff?._customStacks ?? target?._itemCustomStacks?.[eff?._itemId] ?? 0);
      const amt = stacks * (Number(act.amountPerStack) || 1);
      if (amt !== 0 && act.stat) {
        addStatBonus(target, act.stat, amt, false, statLayer, sim.data);
      }
      break;
    }
    case 'MysticsOrbAction': {
      if (eff) {
        eff._orbCasts = (eff._orbCasts || 0) + 1;
        if (eff._orbCasts % 4 === 0 && target) {
          addStatBonus(target, 'ManaRegen', 1, false, 'perm', sim.data);
        }
      }
      const subEffects = act.Effects || act.effects || (act.Effect ? [act.Effect] : []);
      const aoeEntry = act.AoeId ? sim.data?.aoe?.[act.AoeId] : null;
      const aoeCenter = target || owner;
      for (const se of subEffects) {
        executeModularEffect(sim, { ...se, _ownerUid: (owner || src)?.uid }, { ...ctx, aoeCenter, aoeEntry }, statLayer);
      }
      break;
    }
    case 'LoneWolfAction': {
      for (const s of BASIC_STATS) {
        addStatBonus(target, s, 33, true, statLayer, sim.data);
      }
      break;
    }
    case 'ReserveAscendancyAction': {
      const bench = sim.benchUnits || [];
      for (const b of bench) {
        addStatBonus(b, 'Attack', 8, false, 'perm', sim.data);
        addStatBonus(b, 'Magic', 8, false, 'perm', sim.data);
        addStatBonus(b, 'Defense', 10, false, 'perm', sim.data);
        addStatBonus(b, 'MaxHealth', 75, false, 'perm', sim.data);
        addStatBonus(b, 'AttackSpeed', 6, false, 'perm', sim.data);
        addStatBonus(b, 'Crit', 5, false, 'perm', sim.data);
        addStatBonus(b, 'ManaRegen', 1, false, 'perm', sim.data);
      }
      break;
    }
    case 'IncrementTeamSizeAction':
      sim.bonusTeamSize = (sim.bonusTeamSize || 0) + (Number(act.Amount) || 1);
      break;
    case 'CreateItemFromPoolAction':
      sim.itemsCreatedInBattle = (sim.itemsCreatedInBattle || 0) + 1;
      break;
    case 'RiftAnchorValidateAndIncrementGlobalDataAction':
    case 'IncrementItemCustomData1ByValueAction':
      if (eff) {
        eff._customStacks = (eff._customStacks || 0) + (Number(act.Value ?? ctx.value ?? ctx.amount ?? 1) || 1);
      }
      break;
    case 'PowerCrystalSetupAction':
    case 'StatCrystalDestroyAction':
    case 'ExecuteFeedbackAction':
    case 'ModifySizeAction':
      break;
    case 'AreaOfEffectAction':
    case 'EffectAbilityAction':
    case 'TargetLockedAbilityAction': {
      const subEffects = act.Effects || act.effects || (act.Effect ? [act.Effect] : []);
      const aoeEntry = act.AoeId ? sim.data?.aoe?.[act.AoeId] : null;
      const aoeCenter = target || owner;
      for (const se of subEffects) {
        executeModularEffect(sim, { ...se, _ownerUid: (owner || src)?.uid }, { ...ctx, aoeCenter, aoeEntry }, statLayer);
      }
      break;
    }
    default:
      break;
  }
}
