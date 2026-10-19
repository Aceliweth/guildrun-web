// Rich hover tooltips AND Real-Time Right-Click Character Stat Inspector for heroes / enemies / items / relics.
import { getGameData, txt, t, statName, getLang } from '../data.js';
import { audio } from '../audio.js';
import { createBattle } from '../sim/index.js';
import { richText, fmtNum } from './richtext.js';
import { h, img } from './dom.js';
import {
  SPR, heroPortrait, classIcon, itemIcon, relicIcon, abilityIcon, rankLetter, rarityLetter, rarityName,
  statIcon, statusIcon, enemyIcon, rankBadge,
} from './assets.js';

let tipEl = null;
let current = null;

function ensure() {
  if (!tipEl) {
    tipEl = h('div', { id: 'tooltip', class: 'tooltip', role: 'tooltip', style: { pointerEvents: 'none' } });
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function position(e) {
  if (!tipEl) return;
  const pad = 16;
  const r = tipEl.getBoundingClientRect();
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
  tipEl.style.left = `${Math.max(8, x)}px`;
  tipEl.style.top = `${y}px`;
}

export function showTooltip(content, e) {
  const el = ensure();
  el.innerHTML = '';
  if (typeof content === 'string') el.innerHTML = content; else if (content) el.appendChild(content);
  el.classList.add('show');
  if (e) position(e);
}
export function hideTooltip() { if (tipEl) tipEl.classList.remove('show'); current = null; }

/** Attach a lazily-built tooltip to an element. */
export function attachTooltip(el, build) {
  const onEnter = (e) => {
    if (current === el && tipEl?.classList.contains('show')) return;
    current = el;
    let c;
    try { c = build(); } catch (err) { console.error(err); c = String(err); }
    if (c) showTooltip(c, e);
  };
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseover', onEnter);
  el.addEventListener('mousemove', (e) => { if (current === el) position(e); });
  el.addEventListener('mouseleave', () => { if (current === el) hideTooltip(); });
  el.addEventListener('mousedown', hideTooltip);
  el.addEventListener('click', hideTooltip);
  el.addEventListener('dragstart', hideTooltip);
  return el;
}

const D = () => getGameData() || {};
const valuesOf = (o) => o && (o.values ?? o.descriptionVars ?? o.descriptionValues ?? o.params ?? o.parameters ?? o.textVars ?? o.textValues);
const nameOf = (o) => {
  if (!o) return '';
  if (o.nameKey) {
    const byKey = txt(o.nameKey);
    if (byKey && byKey !== o.nameKey) return byKey;
  }
  if (o.titleKey) {
    const byKey = txt(o.titleKey);
    if (byKey && byKey !== o.titleKey) return byKey;
  }
  return txt(o.name ?? o.title ?? '');
};
const descOf = (o) => {
  if (!o) return '';
  const vals = valuesOf(o);
  if (o.descriptionKey) {
    const byKey = txt(o.descriptionKey, vals);
    if (byKey && byKey !== o.descriptionKey) return byKey;
  }
  if (!o.descriptionKey && o.description && o.quest?.rewardDescriptionKey) {
    const byQuestRew = txt(o.quest.rewardDescriptionKey, o.quest.rewardDescriptionVars ?? vals);
    if (byQuestRew && byQuestRew !== o.quest.rewardDescriptionKey) return byQuestRew;
  }
  if (o.description) return txt(o.description, vals);
  if (o.stat && o.value != null) {
    return `${o.value >= 0 ? '+' : ''}${fmtNum(o.value)} ${statName(o.stat)}`;
  }
  return '';
};

function localizeAttackType(at) {
  if (!at) return '';
  if (getLang() === 'fr') {
    if (at === 'Melee') return 'Mêlée';
    if (at === 'Ranged') return 'Distance';
  }
  return txt(at);
}

function header(icon, title, sub, cls = '') {
  return h('div', { class: `tt-head ${cls}` },
    icon ? img(icon, { class: 'tt-icon' }) : null,
    h('div', { class: 'tt-titles' }, h('div', { class: 'tt-title' }, title), sub ? h('div', { class: 'tt-sub' }, sub) : null));
}

function findAbilityOwnerStats(id, passive, extra = {}) {
  if (extra.stats) return extra.stats;
  if (extra.heroId != null) return computeHeroEffectiveStats(extra.heroId, extra);
  const d = D();
  const numId = Number(id);
  for (const hDef of Object.values(d.heroes || {})) {
    if (!passive && Number(hDef.activeAbilityId) === numId) {
      return computeHeroEffectiveStats(hDef.id, extra);
    }
    if (passive && Number(hDef.passiveAbilityId) === numId) {
      return computeHeroEffectiveStats(hDef.id, extra);
    }
  }
  for (const sp of Object.values(d.specializations || {})) {
    if ((!passive && Number(sp.activeAbilityId) === numId) || (passive && Number(sp.passiveAbilityId) === numId)) {
      if (sp.heroId != null) {
        return computeHeroEffectiveStats(sp.heroId, { rank: extra.rank ?? 2, specializationId: sp.id, ...extra });
      }
    }
  }
  for (const e of Object.values(d.enemies || {})) {
    if ((!passive && Number(e.activeAbilityId) === numId) || (passive && Number(e.passiveAbilityId) === numId)) {
      return e.stats || null;
    }
  }
  return null;
}

function abilityBlock(id, passive, extra = {}) {
  const a = passive ? D().passiveAbilities?.[id] : D().activeAbilities?.[id];
  if (!a) return null;
  const badgeText = extra.badge ? `${extra.badge} · ` : '';
  const stats = findAbilityOwnerStats(id, passive, extra);
  const rank = extra.rank ?? 1;
  return h('div', { class: 'tt-ability' },
    img(abilityIcon(id, passive), { class: 'tt-ab-icon' }),
    h('div', null,
      h('div', { class: 'tt-ab-name' }, nameOf(a) || `#${id}`, h('span', { class: 'tt-ab-kind' }, ` · ${badgeText}${t(passive ? 'UI.Tooltip.PassiveAbility' : 'UI.Tooltip.ActiveAbility')}`)),
      h('div', { class: 'tt-desc', html: richText(descOf(a), { values: valuesOf(a), ...extra, stats, rank }) })));
}

function statGrid(stats, keys, baseStats = null) {
  if (!stats) return null;
  const ks = keys || ['MaxHealth', 'Attack', 'Magic', 'Defense', 'AttackSpeed', 'Crit', 'MaxMana', 'ManaRegen', 'AttackRange'];
  return h('div', { class: 'tt-stats' }, ks.filter((k) => stats[k] != null).map((k) => {
    const val = Number(stats[k] || 0);
    const bVal = baseStats && baseStats[k] != null ? Number(baseStats[k]) : null;
    const diff = bVal != null ? Math.round((val - bVal) * 10) / 10 : 0;
    const color = diff > 0.05 ? '#4ade80' : diff < -0.05 ? '#f87171' : null;
    return h('div', { class: 'tt-stat', title: statName(k) },
      img(statIcon(k), { class: 'tt-stat-icon' }),
      h('span', { style: color ? { color, fontWeight: '800' } : null }, fmtNum(val)));
  }));
}

const STAT_FLAT_KEY = {
  Attack: 'AttackFlatIncreasePerRank',
  Magic: 'MagicFlatIncreasePerRank',
  Defense: 'DefenseFlatIncreasePerRank',
  AttackSpeed: 'AttackSpeedFlatIncreasePerRank',
  Crit: 'CritChanceIncreasePerRank',
  ManaRegen: 'ManaRegenIncreasePerRank',
};
const STAT_PCT_KEY = {
  Attack: 'AttackPercentageIncreasePerRank',
  Magic: 'MagicPercentageIncreasePerRank',
  Defense: 'DefensePercentageIncreasePerRank',
  AttackSpeed: 'AttackSpeedPercentageIncreasePerRank',
};

/** Fallback static stat calculator when simulation is unavailable. */
function computeStaticHeroStats(heroId, opts = {}) {
  const d = D();
  const def = d.heroes?.[heroId];
  if (!def) return {};
  const base = { ...(def.stats || {}) };
  const rank = Math.max(1, Math.min(4, Number(opts.rank ?? 1)));
  const r = rank - 1;
  const hs = d.singletons?.HeroesSingleton || {};
  const spec = opts.specializationId != null ? d.specializations?.[opts.specializationId] : null;

  const classIds = [...(def.classIds || []).map(Number)];
  if (spec?.classId != null && !classIds.includes(Number(spec.classId))) {
    classIds.push(Number(spec.classId));
  }

  const flat = {};
  const pct = {};
  if (r > 0) {
    pct.MaxHealth = (pct.MaxHealth || 0) + (hs.HealthPercentageIncreasePerRank ?? 0.125) * 100 * r;
    for (const cid of classIds) {
      const cls = d.classes?.[cid];
      if (!cls) continue;
      const pStat = cls.primaryStat;
      if (pStat) {
        if (STAT_FLAT_KEY[pStat]) flat[pStat] = (flat[pStat] || 0) + (hs[`Primary${STAT_FLAT_KEY[pStat]}`] || 0) * r;
        if (STAT_PCT_KEY[pStat]) pct[pStat] = (pct[pStat] || 0) + (hs[`Primary${STAT_PCT_KEY[pStat]}`] || 0) * 100 * r;
      }
      for (const sStat of cls.secondaryStats || []) {
        if (STAT_FLAT_KEY[sStat]) flat[sStat] = (flat[sStat] || 0) + (hs[`Secondary${STAT_FLAT_KEY[sStat]}`] || 0) * r;
        if (STAT_PCT_KEY[sStat]) pct[sStat] = (pct[sStat] || 0) + (hs[`Secondary${STAT_PCT_KEY[sStat]}`] || 0) * 100 * r;
      }
    }
  }

  const bonusStats = opts.bonusStats || opts.raw?.bonusStats || {};
  for (const [k, v] of Object.entries(bonusStats)) {
    const key = k === 'MaxHP' ? 'MaxHealth' : k;
    const n = Number(v);
    if (Number.isFinite(n)) flat[key] = (flat[key] || 0) + n;
  }

  for (const itRef of opts.items || []) {
    const iid = typeof itRef === 'object' ? (itRef.itemId ?? itRef.id) : itRef;
    const itDef = d.items?.[iid];
    if (!itDef) continue;
    for (const sm of itDef.statMods || []) {
      const key = sm.stat === 'MaxHP' ? 'MaxHealth' : sm.stat;
      const val = Number(sm.value) || 0;
      if (sm.percent) pct[key] = (pct[key] || 0) + val;
      else flat[key] = (flat[key] || 0) + val;
    }
  }

  for (const mid of opts.rankModifierIds || []) {
    const rmDef = d.rankModifiers?.[mid];
    if (!rmDef) continue;
    for (const eff of rmDef.effects || []) {
      if (eff.Trigger && eff.Trigger !== 'Constant') continue;
      for (const act of eff.actions || []) {
        const tAct = act.type || act.$type;
        if (tAct === 'ModifyStatAction' && act.StatType) {
          const key = act.StatType === 'MaxHP' ? 'MaxHealth' : act.StatType;
          flat[key] = (flat[key] || 0) + (Number(act.Value) || 0);
        } else if (tAct === 'ModifyStatPercentAction' && act.StatType) {
          const key = act.StatType === 'MaxHP' ? 'MaxHealth' : act.StatType;
          pct[key] = (pct[key] || 0) + (Number(act.Percent) || 0) * 100;
        }
      }
    }
  }

  const out = { ...base };
  const allKeys = new Set([...Object.keys(base), ...Object.keys(flat), ...Object.keys(pct)]);
  for (const k of allKeys) {
    const b = Number(base[k] || 0);
    const f = Number(flat[k] || 0);
    const p = Number(pct[k] || 0);
    let total = (b + f) * (1 + p / 100);
    if (k === 'MaxHealth' || k === 'MaxMana' || k === 'AttackRange') total = Math.round(total);
    else total = Math.round(total * 10) / 10;
    out[k] = total;
  }

  const hasActiveAbility = (def.startWithActiveAbility !== false && def.activeAbilityId != null) || (spec?.activeAbilityId != null);
  if (!hasActiveAbility) {
    out.MaxMana = 0;
    out.StartingMana = 0;
  }
  return out;
}

// ---------------- Live Simulation Stat Snapshot Engine ----------------
let _snapCache = { key: '', ts: 0, battle: null };

function getActiveApp() {
  return (typeof window !== 'undefined' && window.__GUILDRUN_APP__) || null;
}

/**
 * Evaluates a unit's real-time stats including all Passives, Relics, Items, Quests,
 * Rank Modifiers, Backup Effects from Reserve, and (if in combat) live Combat Buffs & Statuses.
 */
export function computeLiveUnitSnapshot(target, opts = {}) {
  const d = D();
  if (!d || !d.heroes) return null;

  const gApp = getActiveApp();
  const activeBattle = opts.battle || gApp?.app?.activeBattle || null;
  const vm = opts.vm || gApp?.ctx?.vm || null;
  const previewMode = opts.previewMode || 'rush'; // 'rush' (0.1s) | 'base' (12.0s) | 'stall' (16.0s)

  const isObj = target && typeof target === 'object';
  const isEnemy = Boolean(
    opts.isEnemy ||
    (isObj && (target.team === 2 || target.isHero === false || target.enemyId != null)) ||
    (!isObj && opts.kind === 'enemy')
  );
  const uid = isObj ? (target.uid ?? opts.uid ?? null) : (opts.uid ?? null);
  const defId = Number(
    isObj
      ? (target.heroId ?? target.enemyId ?? target.defId ?? target.id)
      : target
  );

  // 1. If a live combat is currently running, read directly from `activeBattle`!
  if (activeBattle && activeBattle.state?.units) {
    const allUnits = [
      ...(activeBattle.state.units || []),
      ...(activeBattle.sim?.benchUnits || []),
    ];
    let liveUnit = null;
    if (uid != null) {
      liveUnit = allUnits.find((u) => String(u.uid) === String(uid));
    }
    if (!liveUnit && Number.isFinite(defId)) {
      const wantTeam = isEnemy ? 2 : 1;
      liveUnit = allUnits.find((u) => u.team === wantTeam && Number(u.defId) === defId);
    }
    if (liveUnit) {
      return {
        unit: liveUnit,
        sim: activeBattle.sim,
        battleState: activeBattle.state,
        isLiveCombat: true,
        isBenched: Boolean(liveUnit.isBenched),
      };
    }
  }

  // 2. Out-of-combat: build or reuse a fast `createBattle` snapshot with current run state!
  if (typeof createBattle !== 'function') return null;

  try {
    const vmHeroes = vm?.heroes || [];
    const vmEnemies = vm?.enemies || [];
    const vmRelics = vm?.relics || [];
    const endlessFloorIndex = Number.isFinite(Number(vm?.endlessFloorIndex)) && Number(vm?.endlessFloorIndex) >= 0 ? Number(vm.endlessFloorIndex) : null;
    const floor = endlessFloorIndex != null ? endlessFloorIndex : 0;
    const difficulty = Number(vm?.difficulty ?? 0);
    const shards = Number(vm?.shards ?? 15);
    const rawEnemyRelics = Array.isArray(vm?.raw?.nextBattleEnemyRelics) ? vm.raw.nextBattleEnemyRelics.slice() : [];
    if (vm?.raw?.redRift && !rawEnemyRelics.includes(900)) {
      rawEnemyRelics.push(900);
    }
    if (vm?.raw?.actBossRelicId != null) {
      const bRelicId = Number(vm.raw.actBossRelicId);
      const bStacks = Number(vm.raw.act2ActBossStacks) || 0;
      if (bStacks > 0 && (bRelicId === 7002 || bRelicId === 7003 || bRelicId === 7004)) {
        rawEnemyRelics.push({ relicId: bRelicId, customStacks: bStacks });
      } else if (!rawEnemyRelics.includes(bRelicId)) {
        rawEnemyRelics.push(bRelicId);
      }
    }

    // Check if the target hero is in vm.heroes; if not (e.g. Shop / Draft / Compendium hero), inject a preview hero
    let matchedRunHero = null;
    if (!isEnemy) {
      if (uid != null) {
        matchedRunHero = vmHeroes.find((hh) => String(hh.uid) === String(uid));
      }
      if (!matchedRunHero && Number.isFinite(defId)) {
        matchedRunHero = vmHeroes.find((hh) => Number(hh.heroId) === defId);
      }
    }

    const targetIsBenched = Boolean(matchedRunHero && !matchedRunHero.onBoard);
    const forceBoardForPreview = Boolean(!isEnemy && (!matchedRunHero || targetIsBenched));
    const synthUid = matchedRunHero?.uid || uid || `preview_${isEnemy ? 'enemy' : 'hero'}_${defId}`;

    const heroInputs = vmHeroes.map((hh) => {
      const isTarget = matchedRunHero && String(hh.uid) === String(matchedRunHero.uid);
      // If inspecting a benched hero, simulate them on the board so their own Constant/PerFrame passives also show!
      const onB = isTarget && forceBoardForPreview ? true : Boolean(hh.onBoard);
      return {
        ...hh,
        uid: hh.uid,
        heroId: hh.heroId,
        rank: hh.rank || 1,
        onBoard: onB,
        benched: !onB,
        x: hh.x != null && hh.x >= 0 ? hh.x : 3,
        y: hh.y != null && hh.y >= 0 ? hh.y : 1,
        items: hh.items || [],
        itemObjects: hh.items || [],
        specializationId: hh.specializationId ?? null,
        rankModifierIds: hh.rankModifierIds || [],
        bonusStats: hh.bonusStats || hh.raw?.bonusStats || {},
      };
    });

    if (!isEnemy && !matchedRunHero && Number.isFinite(defId)) {
      const src = isObj ? target : opts;
      heroInputs.push({
        uid: synthUid,
        heroId: defId,
        rank: src?.rank ?? opts.rank ?? 1,
        onBoard: true,
        benched: false,
        x: src?.x ?? 3,
        y: src?.y ?? 1,
        items: src?.items ?? opts.items ?? [],
        itemObjects: src?.items ?? opts.items ?? [],
        specializationId: src?.specializationId ?? opts.specializationId ?? null,
        rankModifierIds: src?.rankModifierIds ?? opts.rankModifierIds ?? [],
        bonusStats: src?.bonusStats ?? opts.bonusStats ?? {},
      });
    }

    const enemyInputs = vmEnemies.length > 0
      ? vmEnemies.map((ee, idx) => ({
          ...ee,
          uid: ee.uid || `enemy_${ee.enemyId}_${idx}`,
          enemyId: ee.enemyId,
          floor,
          endlessFloorIndex,
        }))
      : (isEnemy && Number.isFinite(defId)
          ? [{ uid: synthUid, enemyId: defId, floor, endlessFloorIndex }]
          : [{ uid: 'dummy_enemy_1001', enemyId: 1001, x: 3, y: 6, floor }]);

    if (isEnemy && Number.isFinite(defId) && !enemyInputs.some((e) => Number(e.enemyId) === defId)) {
      enemyInputs.push({ uid: synthUid, enemyId: defId, floor, endlessFloorIndex });
    }

    const sigObj = {
      p: previewMode,
      f: floor,
      d: difficulty,
      ef: endlessFloorIndex,
      er: rawEnemyRelics,
      s: shards,
      tUid: String(synthUid),
      tDef: defId,
      fb: forceBoardForPreview,
      h: heroInputs.map((x) => [
        x.uid, x.heroId, x.rank, x.onBoard ? 1 : 0, x.x, x.y,
        x.specializationId,
        (x.rankModifierIds || []).join(','),
        (x.items || []).map((i) => `${i?.uid ?? i}:${i?.itemId ?? i}:${i?.progress ?? 0}:${i?.completed ? 1 : 0}`).join(','),
        JSON.stringify(x.bonusStats || {}),
      ]),
      r: vmRelics.map((r) => `${r?.uid ?? r}:${r?.relicId ?? r}:${r?.progress ?? 0}:${r?.completed ? 1 : 0}:${r?.customStacks ?? 0}`),
      e: enemyInputs.map((e) => `${e.uid}:${e.enemyId}:${e.x}:${e.y}`),
    };
    const cacheKey = JSON.stringify(sigObj);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    let battleSnap = null;
    if (_snapCache.key === cacheKey && now - _snapCache.ts < 120 && _snapCache.battle) {
      battleSnap = _snapCache.battle;
    } else {
      battleSnap = createBattle({
        data: d,
        heroes: heroInputs,
        enemies: enemyInputs,
        relics: vmRelics,
        relicObjects: vmRelics,
        enemyRelics: rawEnemyRelics,
        seed: 777,
        floor,
        endlessFloorIndex,
        difficulty,
        shardsInBank: shards,
        shardsGenerated: Math.max(15, shards),
      });
      const previewTime = previewMode === 'stall' ? 16.0 : previewMode === 'base' ? 12.0 : 0.1;
      battleSnap.sim?.evaluateFramePassives?.(previewTime);
      _snapCache = { key: cacheKey, ts: now, battle: battleSnap };
    }

    const allUnits = [
      ...(battleSnap.state?.units || []),
      ...(battleSnap.sim?.benchUnits || []),
    ];
    let unit = allUnits.find((u) => String(u.uid) === String(synthUid));
    if (!unit && Number.isFinite(defId)) {
      const wantTeam = isEnemy ? 2 : 1;
      unit = allUnits.find((u) => u.team === wantTeam && Number(u.defId) === defId);
    }
    if (unit) {
      return {
        unit,
        sim: battleSnap.sim,
        battleState: battleSnap.state,
        isLiveCombat: false,
        isBenched: targetIsBenched,
        previewMode,
      };
    }
  } catch (err) {
    console.warn('[tooltip] computeLiveUnitSnapshot fallback:', err);
  }
  return null;
}

/** Computes a hero's effective stats (including Passives, Relics, Items, Rank Modifiers, Backup Effects, and Live Combat Buffs). */
export function computeHeroEffectiveStats(heroId, opts = {}) {
  const snap = computeLiveUnitSnapshot(
    opts && typeof opts === 'object' && (opts.uid != null || opts.heroId != null)
      ? opts
      : { heroId, ...opts },
    opts
  );
  if (snap?.unit?.stats) {
    const st = { ...snap.unit.stats };
    st.MaxHealth = snap.unit.maxHp ?? st.MaxHealth;
    st.MaxMana = snap.unit.maxMana ?? st.MaxMana;
    st.AttacksPerSecond = snap.unit.attacksPerSecond ?? 0.5;
    st.AutoAttackDamage = snap.sim?.getAutoAttackDamage ? Math.round(snap.sim.getAutoAttackDamage(snap.unit)) : Math.round((st.BaseAttackDamage || 25) * (1 + (st.Attack || 0) / 100));
    return st;
  }
  return computeStaticHeroStats(heroId, opts);
}

export function heroTooltip(heroId, opts = {}) {
  const def = D().heroes?.[heroId];
  const isFr = getLang() === 'fr';
  const rankWord = isFr ? 'Rang' : 'Rank';
  const slotsWord = isFr ? 'Emplacements' : 'Slots';
  if (!def) return h('div', null, `${isFr ? 'Héros' : 'Hero'} ${heroId}`);
  const rank = opts.rank ?? 1;
  const spec = opts.specializationId != null ? D().specializations?.[opts.specializationId] : null;
  const classIds = [...(def.classIds || []).map(Number)];
  if (spec?.classId != null && !classIds.includes(Number(spec.classId))) {
    classIds.push(Number(spec.classId));
  }
  const classes = classIds.map((cid) => D().classes?.[cid]).filter(Boolean);
  const guild = D().guilds?.[def.guildId];
  const effStats = computeHeroEffectiveStats(heroId, opts);
  const baseStats = def.stats || {};

  // Rank C innate ability + passive ability:
  const innateBlocks = [];
  if (def.activeAbilityId != null && def.startWithActiveAbility !== false) {
    innateBlocks.push(abilityBlock(def.activeAbilityId, false, { badge: `${rankWord} C`, stats: effStats, rank }));
  }
  if (def.passiveAbilityId != null) {
    innateBlocks.push(abilityBlock(def.passiveAbilityId, true, { badge: `${rankWord} C`, stats: effStats, rank }));
  }

  // Rank B specialization ability:
  let specAbilityBlock = null;
  if (spec) {
    if (spec.activeAbilityId != null) {
      specAbilityBlock = abilityBlock(spec.activeAbilityId, false, { badge: `${rankWord} B · ${nameOf(spec)}`, stats: effStats, rank });
    } else if (spec.passiveAbilityId != null) {
      specAbilityBlock = abilityBlock(spec.passiveAbilityId, true, { badge: `${rankWord} B · ${nameOf(spec)}`, stats: effStats, rank });
    } else {
      specAbilityBlock = h('div', { class: 'tt-spec' }, h('b', null, `${rankWord} B · ${nameOf(spec)}`), h('div', { class: 'tt-desc', html: richText(descOf(spec), { values: valuesOf(spec), stats: effStats, rank }) }));
    }
  }

  const rightClickHint = h('div', {
    style: {
      marginTop: '6px',
      paddingTop: '5px',
      borderTop: '1px solid rgba(148, 163, 184, 0.2)',
      fontSize: '10.5px',
      color: '#38bdf8',
      fontWeight: '700',
      letterSpacing: '0.03em',
    },
  }, isFr ? '🖱️ Clic droit : Inspecteur de stats en temps réel' : '🖱️ Right-click: Real-time Stat Inspector');

  const box = h('div', { class: `tt tt-hero rank-${rankLetter(rank)}` },
    header(heroPortrait(heroId, 'round'), nameOf(def), [
      h('img', { class: 'tt-rank', src: rankBadge(rank), alt: '' }),
      ...classes.map((c) => h('span', { class: 'tt-class' }, img(classIcon(c.id), { class: 'tt-class-icon' }), nameOf(c))),
      guild ? h('span', { class: 'tt-guild' }, ` · ${nameOf(guild)}`) : null,
    ]),
    statGrid(effStats, null, baseStats),
    h('div', { class: 'tt-meta' }, `${localizeAttackType(def.attackType)}${def.price != null ? ` · ${t('ui.price')}: ${def.price}` : ''} · ${slotsWord}: ${opts.maxItemSlots || rank}`),
    ...innateBlocks,
    specAbilityBlock,
    (opts.rankModifierIds || []).length ? h('div', { class: 'tt-mods' }, opts.rankModifierIds.map((mid, idx) => {
      const m = D().rankModifiers?.[mid];
      const rLabel = idx === 0 ? `${rankWord} A` : `${rankWord} S`;
      return m ? h('div', { class: 'tt-ability' },
        m.icon ? img(m.icon, { class: 'tt-ab-icon' }) : null,
        h('div', null,
          h('div', { class: 'tt-ab-name' }, nameOf(m), h('span', { class: 'tt-ab-kind' }, ` · ${rLabel}`)),
          h('div', { class: 'tt-desc', html: richText(descOf(m), { values: valuesOf(m), stats: effStats, rank }) }))) : null;
    })) : null,
    (opts.items || []).length ? h('div', { class: 'tt-items' }, opts.items.map((it) => img(itemIcon(it.itemId ?? it), { class: 'tt-item-icon' }))) : null,
    rightClickHint);
  return box;
}

function formatItemRarityLabel(rarity) {
  const rn = rarityName(rarity);
  const baseMap = {
    Common: 'Common',
    Rare: 'Rare',
    Epic: 'Epic',
    Legendary: 'Legendary',
    Unique: 'Unique',
    UniqueRare: 'Unique',
  };
  const mapped = baseMap[rn] || rn;
  const loc = t(`UI.Tooltip.Item${mapped}`);
  if (loc && !loc.startsWith('UI.Tooltip.')) return loc;
  if (getLang() === 'fr') {
    const frMap = {
      Common: 'Objet Commun',
      Rare: 'Objet Rare',
      Epic: 'Objet Épique',
      Legendary: 'Objet Légendaire',
      Unique: 'Objet Unique',
    };
    return frMap[mapped] || `Objet ${mapped}`;
  }
  return `${mapped} Item`;
}

function formatRelicRarityLabel(rarity) {
  const rn = rarityName(rarity);
  const baseMap = {
    Common: 'Common',
    Rare: 'Rare',
    Epic: 'Epic',
    Legendary: 'Legendary',
    Unique: 'Unique',
    CommonQuest: 'Common',
    RareQuest: 'Rare',
    EpicQuest: 'Epic',
    LegendaryQuest: 'Legendary',
  };
  if (baseMap[rn]) {
    const loc = t(`UI.Tooltip.Relic${baseMap[rn]}`);
    if (loc && !loc.startsWith('UI.Tooltip.')) return loc;
  }
  const isFr = getLang() === 'fr';
  if (rn === 'SingleBattleBoost') return isFr ? 'Relique de Défi' : 'Challenge Relic';
  if (rn === 'ActBoss') return isFr ? 'Relique de Boss' : 'Boss Relic';
  if (rn === 'TeamSize') return isFr ? "Relique de Taille d'Équipe" : 'Guild Relic';
  const loc = t(`UI.Tooltip.Relic${rn}`);
  if (loc && !loc.startsWith('UI.Tooltip.')) return loc;
  if (isFr) {
    const frMap = {
      Common: 'Relique Commune',
      Rare: 'Relique Rare',
      Epic: 'Relique Épique',
      Legendary: 'Relique Légendaire',
      Unique: 'Relique Unique',
    };
    return frMap[baseMap[rn] || rn] || 'Relique';
  }
  return 'Relic';
}

function renderQuestBlock(q, obj, opts, baseDesc = '') {
  if (!q) return null;
  const qDesc = txt(q.descriptionKey) !== q.descriptionKey && q.descriptionKey ? txt(q.descriptionKey) : txt(q.description);
  const qRew = txt(q.rewardDescriptionKey) !== q.rewardDescriptionKey && q.rewardDescriptionKey ? txt(q.rewardDescriptionKey) : txt(q.rewardDescription);
  if (!qDesc && !qRew) return null;

  const isFr = getLang() === 'fr';
  const req = opts.required ?? obj?.required ?? obj?.raw?.required ?? q.effect?.requiredProgress ?? q.requiredProgress ?? 1;
  const prog = opts.progress ?? obj?.progress ?? obj?.raw?.progress ?? 0;
  const done = !!(opts.completed ?? obj?.completed ?? obj?.raw?.completed ?? (req > 0 && prog >= req));
  const badgeHtml = done
    ? `<span style="color:#4ade80;font-weight:700">${isFr ? '✓ QUÊTE TERMINÉE' : '✓ QUEST COMPLETED'}</span>`
    : `<span style="color:#fbbf24;font-weight:700">${isFr ? 'QUÊTE' : 'QUEST'} (${fmtNum(prog)} / ${fmtNum(req)})</span>`;

  return h('div', {
    class: `tt-quest ${done ? 'is-completed' : 'in-progress'}`,
    style: {
      marginTop: '6px',
      padding: '6px 8px',
      borderRadius: '4px',
      background: done ? 'rgba(74, 222, 128, 0.10)' : 'rgba(251, 191, 36, 0.08)',
      border: done ? '1px solid rgba(74, 222, 128, 0.35)' : '1px solid rgba(251, 191, 36, 0.28)',
    },
  },
  h('div', { class: 'tt-quest-status', style: { fontSize: '11px', marginBottom: '3px' }, html: badgeHtml }),
  qDesc && qDesc !== baseDesc ? h('div', {
    class: 'tt-desc tt-quest-cond',
    html: `<b>${isFr ? 'Quête :' : 'Quest:'}</b> ${richText(qDesc, { values: q.descriptionVars, vars: opts.vars, tracking: prog })}`,
  }) : null,
  qRew ? h('div', {
    class: 'tt-desc tt-quest-reward',
    style: done ? { color: '#4ade80', fontWeight: '600' } : null,
    html: `<b>${isFr ? 'Récompense :' : 'Reward:'}</b> ${richText(qRew, { values: q.rewardDescriptionVars, vars: opts.vars, tracking: prog })}`,
  }) : null);
}

export function itemTooltip(itemOrId, opts = {}) {
  const obj = (itemOrId && typeof itemOrId === 'object') ? itemOrId : null;
  const itemId = obj ? (obj.itemId ?? obj.defId ?? obj.id) : itemOrId;
  const it = D().items?.[itemId];
  if (!it) return h('div', null, `${getLang() === 'fr' ? 'Objet' : 'Item'} ${itemId}`);
  const d = descOf(it);
  const prog = opts.progress ?? obj?.progress ?? obj?.raw?.progress ?? 0;
  const tracking = opts.tracking ?? prog;
  return h('div', { class: `tt tt-item rar-${rarityLetter(it.rarity)}` },
    header(itemIcon(itemId), nameOf(it), formatItemRarityLabel(it.rarity)),
    (it.statMods || []).length ? h('div', { class: 'tt-mods-list' }, it.statMods.map((m) =>
      h('div', { class: 'tt-statmod' }, img(statIcon(m.stat), { class: 'tt-stat-icon' }),
        `+${fmtNum(m.value)}${m.percent ? '%' : ''} ${statName(m.stat)}`))) : null,
    d ? h('div', { class: 'tt-desc', html: richText(d, { values: valuesOf(it), vars: opts.vars, tracking }) }) : null,
    renderQuestBlock(it.quest, obj, opts, d),
    it.price != null && it.price > 0 ? h('div', { class: 'tt-price' }, img('/assets/sprites/traits_stats/Shard_2.png', { class: 'tt-stat-icon' }), String(it.price)) : null);
}

export function relicTooltip(relicOrId, opts = {}) {
  const obj = (relicOrId && typeof relicOrId === 'object') ? relicOrId : null;
  const relicId = obj ? (obj.relicId ?? obj.defId ?? obj.id) : relicOrId;
  const r = D().relics?.[relicId];
  if (!r) return h('div', null, `${getLang() === 'fr' ? 'Relique' : 'Relic'} ${relicId}`);
  const d = descOf(r);
  const prog = opts.progress ?? obj?.progress ?? obj?.raw?.progress ?? 0;
  const tracking = opts.tracking ?? obj?.customStacks ?? prog;
  return h('div', { class: `tt tt-relic rar-${rarityLetter(r.rarity)}` },
    header(relicIcon(relicId), nameOf(r), formatRelicRarityLabel(r.rarity)),
    d ? h('div', { class: 'tt-desc', html: richText(d, { values: valuesOf(r), vars: opts.vars, tracking }) }) : null,
    renderQuestBlock(r.quest, obj, opts, d),
    r.price != null && r.price > 0 ? h('div', { class: 'tt-price' }, img('/assets/sprites/traits_stats/Shard_2.png', { class: 'tt-stat-icon' }), String(r.price)) : null);
}

export function abilityTooltip(id, passive, heroOpts = {}) {
  return h('div', { class: 'tt' }, abilityBlock(id, passive, heroOpts) || h('div', null, `${getLang() === 'fr' ? 'Compétence' : 'Ability'} ${id}`));
}

export function classTooltip(classId, count) {
  const c = D().classes?.[classId];
  if (!c) return null;
  return h('div', { class: 'tt tt-class-tip' },
    header(classIcon(classId), nameOf(c), count != null ? `×${count}` : null),
    h('div', { class: 'tt-desc', html: richText(descOf(c), { values: valuesOf(c) }) }));
}

export function enemyTooltip(enemyOrId, opts = {}) {
  const isObj = enemyOrId && typeof enemyOrId === 'object';
  const enemyId = isObj ? (enemyOrId.enemyId ?? enemyOrId.defId ?? enemyOrId.id) : enemyOrId;
  const e = D().enemies?.[enemyId];
  const isFr = getLang() === 'fr';
  if (!e) return h('div', null, `${isFr ? 'Ennemi' : 'Enemy'} ${enemyId}`);
  const snap = computeLiveUnitSnapshot(isObj ? enemyOrId : { enemyId, isEnemy: true }, { ...opts, isEnemy: true });
  const liveStats = snap?.unit?.stats ? { ...snap.unit.stats, MaxHealth: snap.unit.maxHp ?? snap.unit.stats.MaxHealth } : e.stats;
  return h('div', { class: 'tt tt-enemy' },
    header(enemyIcon(enemyId), nameOf(e), localizeAttackType(e.attackType)),
    statGrid(liveStats, null, e.stats),
    abilityBlock(e.activeAbilityId, false, { stats: liveStats, rank: 1 }),
    abilityBlock(e.passiveAbilityId, true, { stats: liveStats, rank: 1 }),
    h('div', {
      style: {
        marginTop: '6px',
        paddingTop: '5px',
        borderTop: '1px solid rgba(148, 163, 184, 0.2)',
        fontSize: '10.5px',
        color: '#38bdf8',
        fontWeight: '700',
      },
    }, isFr ? '🖱️ Clic droit : Inspecteur de stats en temps réel' : '🖱️ Right-click: Real-time Stat Inspector'));
}

export function rankModTooltip(mid, heroOpts = {}) {
  const m = D().rankModifiers?.[mid];
  if (!m) return null;
  const stats = heroOpts.stats || (heroOpts.heroId != null ? computeHeroEffectiveStats(heroOpts.heroId, heroOpts) : null);
  const rank = heroOpts.rank ?? 1;
  return h('div', { class: 'tt' }, header(m.icon, nameOf(m), t('UI.Tooltip.RankModifier')),
    h('div', { class: 'tt-desc', html: richText(descOf(m), { values: valuesOf(m), stats, rank }) }));
}

export function stabilizerTooltip(vm) {
  const perFight = D().singletons?.PlayerSingleton?.AccumulatedShardsPerFightWon ?? 10;
  const cur = vm?.accumulatedShards ?? 0;
  const active = vm?.lives == null || vm.lives > 1 || (vm?.raw?.isStabilizerActive !== false && cur > 0);
  const descKey = active ? 'UI.BattleInfo.ShardStabilizer.Description.Active' : 'UI.BattleInfo.ShardStabilizer.Description.Inactive';
  return h('div', { class: 'tt' },
    header('/assets/sprites/traits_stats/Shard_2.png', t('UI.BattleInfo.ShardStabilizer.Title'), active ? t('ui.stabilizerActive') : t('ui.stabilizerBroken')),
    h('div', { class: 'tt-desc', html: richText(t(descKey), { values: [perFight, cur] }) }));
}

// ============================================================================
// REAL-TIME RIGHT-CLICK CHARACTER STAT INSPECTOR (#gr-live-unit-inspector)
// ============================================================================
let _inspectorState = {
  open: false,
  target: null,
  opts: {},
  previewMode: 'rush', // 'rush' | 'base' | 'stall'
  panelEl: null,
  rafId: 0,
  lastRenderSig: '',
  prevStatValues: {},
  statPulseUntil: {},
  dragOffset: null,
  customPos: null,
};

function ensureInspectorStyles() {
  if (typeof document === 'undefined' || document.getElementById('gr-live-inspector-css')) return;
  const st = document.createElement('style');
  st.id = 'gr-live-inspector-css';
  st.textContent = `
    .gr-live-inspector {
      position: fixed;
      top: 78px;
      left: 88px;
      width: 420px;
      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 140px);
      z-index: 9500;
      background: linear-gradient(180deg, rgba(13, 19, 26, 0.98) 0%, rgba(9, 13, 18, 0.98) 100%);
      border: 1.5px solid rgba(212, 175, 55, 0.78);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.92), 0 0 0 1px rgba(56, 189, 248, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #e2e8f0;
      font-family: 'Rajdhani', 'Chakra Petch', 'Segoe UI', sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
      backdrop-filter: blur(10px);
    }
    .gr-live-inspector.is-enemy {
      border-color: rgba(239, 68, 68, 0.78);
    }
    .gr-insp-header {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 12px;
      background: linear-gradient(90deg, rgba(26, 38, 52, 0.95) 0%, rgba(15, 23, 34, 0.95) 100%);
      border-bottom: 1px solid rgba(212, 175, 55, 0.35);
      cursor: grab;
      position: relative;
    }
    .gr-insp-header:active { cursor: grabbing; }
    .gr-insp-avatar-wrap {
      position: relative;
      width: 50px;
      height: 50px;
      flex-shrink: 0;
    }
    .gr-insp-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 2px solid #d4af37;
      object-fit: cover;
      background: #090d12;
    }
    .gr-live-inspector.is-enemy .gr-insp-avatar {
      border-color: #ef4444;
    }
    .gr-insp-rank-badge {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 22px;
      height: 22px;
      object-fit: contain;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.9));
    }
    .gr-insp-title-col {
      flex: 1;
      min-width: 0;
    }
    .gr-insp-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .gr-insp-name {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #f8fafc;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gr-insp-live-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: rgba(34, 197, 94, 0.16);
      border: 1px solid rgba(74, 222, 128, 0.55);
      color: #4ade80;
    }
    .gr-insp-live-pill.in-combat {
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.65);
      color: #38bdf8;
    }
    .gr-insp-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 6px currentColor;
      animation: gr-insp-pulse 1.2s ease-in-out infinite;
    }
    @keyframes gr-insp-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.82); }
    }
    .gr-insp-sub-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 3px;
      font-size: 11.5px;
      color: #94a3b8;
    }
    .gr-insp-class-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #e2e8f0;
      font-size: 11px;
      font-weight: 700;
    }
    .gr-insp-class-chip img {
      width: 13px;
      height: 13px;
      object-fit: contain;
    }
    .gr-insp-close-btn {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.8);
      color: #cbd5e1;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.14s ease;
    }
    .gr-insp-close-btn:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: #ef4444;
      color: #fff;
    }
    .gr-insp-body {
      padding: 10px 12px 12px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 9px;
      max-height: calc(100vh - 210px);
    }
    .gr-insp-mode-bar {
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(15, 23, 34, 0.85);
      padding: 4px;
      border-radius: 4px;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .gr-insp-mode-btn {
      flex: 1;
      padding: 4px 6px;
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s ease;
    }
    .gr-insp-mode-btn:hover {
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.05);
    }
    .gr-insp-mode-btn.active {
      color: #f8fafc;
      background: rgba(29, 111, 122, 0.45);
      border-color: rgba(45, 212, 191, 0.6);
      box-shadow: 0 0 8px rgba(45, 212, 191, 0.2);
    }
    .gr-insp-vitals {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .gr-insp-bar-row {
      position: relative;
      height: 20px;
      background: rgba(10, 14, 20, 0.95);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 3px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px;
      font-size: 11.5px;
      font-weight: 800;
      color: #fff;
      text-shadow: 0 1px 3px #000, 0 0 2px #000;
    }
    .gr-insp-bar-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 0;
      transition: width 0.08s linear;
    }
    .gr-insp-bar-fill.hp-ally { background: linear-gradient(90deg, #16a34a 0%, #22c55e 100%); }
    .gr-insp-bar-fill.hp-enemy { background: linear-gradient(90deg, #b91c1c 0%, #ef4444 100%); }
    .gr-insp-bar-fill.mana { background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%); }
    .gr-insp-bar-shield {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      background: rgba(56, 189, 248, 0.55);
      border-left: 1.5px solid #e0f2fe;
      z-index: 1;
      transition: width 0.08s linear;
    }
    .gr-insp-bar-label, .gr-insp-bar-val {
      position: relative;
      z-index: 2;
    }
    .gr-insp-status-strip {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .gr-insp-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.4);
      color: #f8fafc;
    }
    .gr-insp-status-pill img {
      width: 14px;
      height: 14px;
      object-fit: contain;
    }
    .gr-insp-status-pill.is-rush {
      background: rgba(245, 158, 11, 0.18);
      border-color: rgba(251, 191, 36, 0.65);
      color: #fbbf24;
    }
    .gr-insp-status-pill.is-stall {
      background: rgba(168, 85, 247, 0.18);
      border-color: rgba(192, 132, 252, 0.65);
      color: #c084fc;
    }
    .gr-insp-stats-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .gr-insp-stat-card {
      background: rgba(15, 22, 31, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 4px;
      padding: 5px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: border-color 0.2s ease, background 0.2s ease;
    }
    .gr-insp-stat-card.is-buffed {
      border-color: rgba(74, 222, 128, 0.42);
      background: rgba(20, 36, 28, 0.65);
    }
    .gr-insp-stat-card.is-debuffed {
      border-color: rgba(248, 113, 113, 0.42);
      background: rgba(40, 20, 24, 0.65);
    }
    .gr-insp-stat-card.pulse-up {
      border-color: #4ade80;
      box-shadow: 0 0 12px rgba(74, 222, 128, 0.45);
    }
    .gr-insp-stat-card.pulse-down {
      border-color: #f87171;
      box-shadow: 0 0 12px rgba(248, 113, 113, 0.45);
    }
    .gr-insp-stat-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    }
    .gr-insp-stat-lbl {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gr-insp-stat-lbl img {
      width: 14px;
      height: 14px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .gr-insp-stat-val-wrap {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
    }
    .gr-insp-stat-val {
      font-size: 14px;
      font-weight: 800;
      color: #f8fafc;
    }
    .gr-insp-stat-Card-delta {
      font-size: 10.5px;
      font-weight: 800;
    }
    .gr-insp-stat-sub {
      font-size: 10.2px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    }
    .gr-insp-sec-title {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      padding-bottom: 3px;
      margin-top: 2px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gr-insp-combat-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
      background: rgba(12, 18, 26, 0.9);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 11px;
    }
    .gr-insp-metric-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .gr-insp-metric-val {
      font-size: 13px;
      font-weight: 800;
      color: #f8fafc;
    }
    .gr-insp-metric-lbl {
      font-size: 9.5px;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .gr-insp-abilities {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .gr-insp-abilities .tt-ability {
      margin: 0;
      background: rgba(15, 22, 31, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 4px;
      padding: 6px 8px;
    }
    .gr-insp-items-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .gr-insp-item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(15, 22, 31, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 4px;
      padding: 5px 8px;
      font-size: 11.5px;
    }
    .gr-insp-item-row img {
      width: 28px;
      height: 28px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .gr-insp-actions-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gr-insp-action-btn {
      flex: 1;
      padding: 5px 10px;
      border-radius: 4px;
      border: 1px solid rgba(148, 163, 184, 0.4);
      background: rgba(24, 34, 48, 0.9);
      color: #e2e8f0;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.14s ease;
    }
    .gr-insp-action-btn:hover {
      border-color: #d4af37;
      background: rgba(38, 52, 72, 0.95);
      color: #fff;
    }
  `;
  document.head.appendChild(st);
}

export function getInspectedUnitUid() {
  if (!_inspectorState.open || !_inspectorState.target) return null;
  const tObj = _inspectorState.target;
  if (typeof tObj === 'object') return tObj.uid ?? null;
  return _inspectorState.opts?.uid ?? null;
}

export function closeUnitInspector() {
  _inspectorState.open = false;
  _inspectorState.target = null;
  _inspectorState.lastRenderSig = '';
  if (_inspectorState.rafId) {
    cancelAnimationFrame(_inspectorState.rafId);
    _inspectorState.rafId = 0;
  }
  if (_inspectorState.panelEl) {
    _inspectorState.panelEl.remove();
    _inspectorState.panelEl = null;
  }
}

export function openUnitInspector(target, opts = {}) {
  ensureInspectorStyles();
  hideTooltip();

  const isObj = target && typeof target === 'object';
  const incomingUid = isObj ? (target.uid ?? opts.uid ?? null) : (opts.uid ?? null);
  const incomingDefId = Number(isObj ? (target.heroId ?? target.enemyId ?? target.defId ?? target.id) : target);

  // Toggle off if right-clicking the exact same unit while already open (unless forceRefresh)
  if (_inspectorState.open && !opts.forceOpen) {
    const curT = _inspectorState.target;
    const curUid = curT && typeof curT === 'object' ? (curT.uid ?? _inspectorState.opts?.uid) : _inspectorState.opts?.uid;
    const curDefId = Number(curT && typeof curT === 'object' ? (curT.heroId ?? curT.enemyId ?? curT.defId ?? curT.id) : curT);
    if ((incomingUid != null && String(incomingUid) === String(curUid)) || (incomingUid == null && curUid == null && incomingDefId === curDefId)) {
      closeUnitInspector();
      return;
    }
  }

  _inspectorState.open = true;
  _inspectorState.target = target;
  _inspectorState.opts = { ...opts };
  _inspectorState.lastRenderSig = '';
  _inspectorState.prevStatValues = {};
  _inspectorState.statPulseUntil = {};

  if (!_inspectorState.panelEl) {
    const panel = h('aside', {
      id: 'gr-live-unit-inspector',
      class: 'gr-live-inspector',
      oncontextmenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      onclick: (e) => {
        e.stopPropagation();
      },
    });
    document.body.appendChild(panel);
    _inspectorState.panelEl = panel;

    if (_inspectorState.customPos) {
      panel.style.left = `${_inspectorState.customPos.x}px`;
      panel.style.top = `${_inspectorState.customPos.y}px`;
    } else {
      panel.style.left = '88px';
      panel.style.top = '74px';
    }
  }

  audio?.playSfx?.('ui.click');
  renderInspectorNow();
  startInspectorLoop();
}

function startInspectorLoop() {
  if (_inspectorState.rafId) cancelAnimationFrame(_inspectorState.rafId);
  let lastTick = 0;
  const step = (ts) => {
    if (!_inspectorState.open || !_inspectorState.panelEl?.isConnected) {
      _inspectorState.open = false;
      return;
    }
    if (ts - lastTick >= 65) {
      lastTick = ts;
      renderInspectorNow();
    }
    _inspectorState.rafId = requestAnimationFrame(step);
  };
  _inspectorState.rafId = requestAnimationFrame(step);
}

function renderInspectorNow() {
  const panel = _inspectorState.panelEl;
  if (!panel || !_inspectorState.open) return;

  const d = D();
  const isFr = getLang() === 'fr';
  const rankWord = isFr ? 'Rang' : 'Rank';
  const gApp = getActiveApp();
  const vm = gApp?.ctx?.vm || _inspectorState.opts?.vm || null;
  const ctx = gApp?.ctx || _inspectorState.opts?.ctx || null;

  const tRaw = _inspectorState.target;
  const isObj = tRaw && typeof tRaw === 'object';
  let uid = isObj ? (tRaw.uid ?? _inspectorState.opts?.uid ?? null) : (_inspectorState.opts?.uid ?? null);
  let defId = Number(isObj ? (tRaw.heroId ?? tRaw.enemyId ?? tRaw.defId ?? tRaw.id) : tRaw);
  const isEnemy = Boolean(
    _inspectorState.opts?.isEnemy ||
    (isObj && (tRaw.team === 2 || tRaw.isHero === false || tRaw.enemyId != null))
  );

  // Resolve latest hero object from vm.heroes if inspecting a player hero
  let runHero = null;
  if (!isEnemy && vm?.heroes) {
    if (uid != null) runHero = vm.heroes.find((hh) => String(hh.uid) === String(uid));
    if (!runHero && Number.isFinite(defId)) runHero = vm.heroes.find((hh) => Number(hh.heroId) === defId);
    if (runHero) {
      uid = runHero.uid;
      defId = Number(runHero.heroId);
    }
  }

  const snap = computeLiveUnitSnapshot(
    runHero || tRaw,
    { ..._inspectorState.opts, uid, isEnemy, previewMode: _inspectorState.previewMode, vm }
  );

  const unit = snap?.unit || null;
  const sim = snap?.sim || null;
  const inCombat = Boolean(snap?.isLiveCombat);
  const def = isEnemy ? d.enemies?.[defId] : d.heroes?.[defId];
  if (!def && !unit) return;

  panel.classList.toggle('is-enemy', isEnemy);

  const rank = unit?.rank ?? runHero?.rank ?? (isObj ? tRaw.rank : null) ?? _inspectorState.opts?.rank ?? 1;
  const specId = unit?.specializationId ?? runHero?.specializationId ?? (isObj ? tRaw.specializationId : null) ?? _inspectorState.opts?.specializationId ?? null;
  const rankModIds = unit?.rankModifierIds ?? runHero?.rankModifierIds ?? (isObj ? tRaw.rankModifierIds : null) ?? _inspectorState.opts?.rankModifierIds ?? [];
  const equippedItems = runHero?.items ?? (isObj && Array.isArray(tRaw.items) ? tRaw.items : null) ?? _inspectorState.opts?.items ?? unit?.items ?? [];

  const baseStats = def?.stats || {};
  const liveStats = unit?.stats
    ? { ...unit.stats, MaxHealth: unit.maxHp ?? unit.stats.MaxHealth, MaxMana: unit.maxMana ?? unit.stats.MaxMana }
    : (isEnemy ? { ...baseStats } : computeStaticHeroStats(defId, { rank, specializationId: specId, rankModifierIds: rankModIds, items: equippedItems }));

  const hp = Math.max(0, Math.ceil(unit ? unit.hp : (liveStats.MaxHealth || 500)));
  const maxHp = Math.max(1, Math.ceil(unit ? unit.maxHp : (liveStats.MaxHealth || 500)));
  const shield = Math.max(0, Math.ceil(unit?.shield || 0));
  const mana = Math.max(0, Math.floor(unit ? unit.mana : (liveStats.StartingMana || 0)));
  const maxMana = Math.max(0, Math.ceil(unit ? unit.maxMana : (liveStats.MaxMana ?? 100)));

  const baseAd = Number(liveStats.BaseAttackDamage ?? baseStats.BaseAttackDamage ?? 25);
  const atkVal = Number(liveStats.Attack || 0);
  const autoAtkDmg = sim?.getAutoAttackDamage && unit
    ? Math.round(sim.getAutoAttackDamage(unit))
    : Math.round(baseAd * Math.max(0.1, 1 + atkVal / 100));

  const aps = unit?.attacksPerSecond
    ? Number(unit.attacksPerSecond)
    : Math.max(0.2, Math.min(5.0, (Number(liveStats.BaseAttackSpeed ?? baseStats.BaseAttackSpeed ?? 0.5)) * Math.max(0.1, 1 + Number(liveStats.AttackSpeed || 0) / 100)));

  const defVal = Number(liveStats.Defense || 0);
  const defMult = defVal >= 0 ? 100 / (100 + defVal) : 2 - 100 / (100 - defVal);
  const mitigationPct = Math.round((1 - defMult) * 100);

  const critVal = Number(liveStats.Crit || 0);
  const critMult = 1.5 + Math.max(0, critVal - 100) * 0.01;

  const rushActive = unit && sim?.isRushActive ? Boolean(sim.isRushActive(unit, 10)) : (_inspectorState.previewMode === 'rush');
  const stallActive = unit && sim?.isStallReached ? Boolean(sim.isStallReached(unit, 15)) : (_inspectorState.previewMode === 'stall');
  const statuses = unit?.statuses || {};
  const cStats = unit?.combatStats || {};

  // Build signature to avoid unnecessary DOM rebuilds when nothing changed
  const sig = JSON.stringify({
    lang: getLang(),
    uid, defId, isEnemy, rank, specId, inCombat,
    pm: _inspectorState.previewMode,
    onB: runHero?.onBoard,
    hp, maxHp, shield, mana, maxMana,
    st: Object.entries(liveStats).map(([k, v]) => `${k}:${Math.round(Number(v) * 10)}`),
    aps: Math.round(aps * 100),
    autoAtkDmg,
    rushActive, stallActive,
    statuses,
    cStats,
    items: equippedItems.map((it) => `${it?.uid ?? it}:${it?.itemId ?? it}:${it?.progress ?? 0}:${it?.completed ? 1 : 0}`),
  });
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const hasActivePulse = Object.values(_inspectorState.statPulseUntil).some((until) => until > now);
  if (sig === _inspectorState.lastRenderSig && !hasActivePulse) return;
  _inspectorState.lastRenderSig = sig;

  // Track stat changes for real-time green/red pulse highlight
  const statDefinitions = [
    {
      key: 'MaxHealth',
      label: isFr ? 'Santé Max' : 'Max Health',
      val: maxHp,
      base: Number(baseStats.MaxHealth || 500),
      sub: (liveStats.HPPerSecond || 0) > 0
        ? `+${fmtNum(liveStats.HPPerSecond)} ${isFr ? 'PV/s' : 'HP/s'}`
        : `${isFr ? 'Base' : 'Base'}: ${fmtNum(baseStats.MaxHealth || 500)}`,
    },
    {
      key: 'Attack',
      label: isFr ? 'Attaque' : 'Attack',
      val: Math.round(atkVal * 10) / 10,
      base: Number(baseStats.Attack || 0),
      sub: `⚔️ ${autoAtkDmg} ${isFr ? 'dég./coup' : 'dmg/hit'}`,
    },
    {
      key: 'Magic',
      label: isFr ? 'Magie' : 'Magic',
      val: Math.round(Number(liveStats.Magic || 0) * 10) / 10,
      base: Number(baseStats.Magic || 0),
      sub: `✨ +${fmtNum(liveStats.Magic || 0)}% ${isFr ? 'sorts' : 'spells'}`,
    },
    {
      key: 'Defense',
      label: isFr ? 'Défense' : 'Defense',
      val: Math.round(defVal * 10) / 10,
      base: Number(baseStats.Defense || 0),
      sub: `🛡️ ${mitigationPct >= 0 ? '-' : '+'}${Math.abs(mitigationPct)}% ${isFr ? 'dégâts reçus' : 'dmg taken'}`,
    },
    {
      key: 'AttackSpeed',
      label: isFr ? "Vit. d'Attaque" : 'Attack Speed',
      val: Math.round(Number(liveStats.AttackSpeed || 0) * 10) / 10,
      suffix: '%',
      base: Number(baseStats.AttackSpeed || 0),
      sub: `⚡ ${aps.toFixed(2)} ${isFr ? 'att./s' : 'atk/s'}`,
    },
    {
      key: 'Crit',
      label: isFr ? 'Critique' : 'Crit Chance',
      val: Math.round(critVal * 10) / 10,
      suffix: '%',
      base: Number(baseStats.Crit || 0),
      sub: `💥 ×${critMult.toFixed(2)} ${isFr ? 'dég. crit.' : 'crit dmg'}`,
    },
    {
      key: 'ManaRegen',
      label: isFr ? 'Régén. Mana' : 'Mana Regen',
      val: Math.round(Number(liveStats.ManaRegen || 0) * 10) / 10,
      base: Number(baseStats.ManaRegen || 0),
      sub: `💧 +${fmtNum((liveStats.ManaRegen || 0) / 2)}/s`,
    },
    {
      key: 'AttackRange',
      label: isFr ? 'Portée & Vit.' : 'Range & Spd',
      val: Math.round(Number(liveStats.AttackRange || 1)),
      suffix: ' hex',
      base: Number(baseStats.AttackRange || 1),
      sub: `👟 ${fmtNum(liveStats.MoveSpeed || baseStats.MoveSpeed || 1.5)} ${isFr ? 'vit.' : 'spd'}`,
    },
  ];

  // Optional secondary stats if active (> 0)
  if (Number(liveStats.OmniVamp || 0) !== 0) {
    statDefinitions.push({
      key: 'OmniVamp',
      label: isFr ? 'Omnivampirisme' : 'OmniVamp',
      val: Math.round(Number(liveStats.OmniVamp) * 10) / 10,
      suffix: '%',
      base: Number(baseStats.OmniVamp || 0),
      sub: isFr ? 'Vol de vie global' : 'All-damage leech',
    });
  }
  if (Number(liveStats.DamageAmp || 0) !== 0) {
    statDefinitions.push({
      key: 'DamageAmp',
      label: isFr ? 'Amp. Dégâts' : 'Damage Amp',
      val: Math.round(Number(liveStats.DamageAmp) * 10) / 10,
      suffix: '%',
      base: Number(baseStats.DamageAmp || 0),
      sub: isFr ? 'Multiplicateur global' : 'Global damage mult',
    });
  }
  if (Number(liveStats.BonusTrueDamage || 0) > 0) {
    statDefinitions.push({
      key: 'BonusTrueDamage',
      label: isFr ? 'Dégâts Bruts' : 'True Damage',
      val: Math.round(Number(liveStats.BonusTrueDamage) * 10) / 10,
      base: 0,
      sub: isFr ? 'Ignore la défense' : 'Ignores defense',
    });
  }

  for (const sd of statDefinitions) {
    const prev = _inspectorState.prevStatValues[sd.key];
    if (prev != null && Math.abs(sd.val - prev) > 0.05) {
      _inspectorState.statPulseUntil[sd.key] = {
        until: now + 650,
        dir: sd.val > prev ? 'up' : 'down',
      };
    }
    _inspectorState.prevStatValues[sd.key] = sd.val;
  }

  // Header classes & guild
  const spec = specId != null ? d.specializations?.[specId] : null;
  const classIds = [...(unit?.classIds || def?.classIds || []).map(Number)];
  if (spec?.classId != null && !classIds.includes(Number(spec.classId))) {
    classIds.push(Number(spec.classId));
  }
  const classes = classIds.map((cid) => d.classes?.[cid]).filter(Boolean);
  const guild = !isEnemy && def?.guildId ? d.guilds?.[def.guildId] : null;

  const avatarUrl = isEnemy ? enemyIcon(defId) : heroPortrait(defId, 'round', rank);
  const unitName = nameOf(def) || unit?.name || `#${defId}`;

  const headerEl = h('div', {
    class: 'gr-insp-header',
    onmousedown: (e) => {
      if (e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const onMove = (me) => {
        const nx = Math.max(8, Math.min(window.innerWidth - rect.width - 8, me.clientX - offX));
        const ny = Math.max(8, Math.min(window.innerHeight - 80, me.clientY - offY));
        panel.style.left = `${nx}px`;
        panel.style.top = `${ny}px`;
        _inspectorState.customPos = { x: nx, y: ny };
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
  },
    h('div', { class: 'gr-insp-avatar-wrap' },
      img(avatarUrl, { class: 'gr-insp-avatar' }, isEnemy ? SPR.enemyRound : SPR.heroIcon),
      !isEnemy ? img(rankBadge(rank), { class: 'gr-insp-rank-badge' }) : null),
    h('div', { class: 'gr-insp-title-col' },
      h('div', { class: 'gr-insp-name-row' },
        h('span', { class: 'gr-insp-name' }, unitName),
        h('span', { class: `gr-insp-live-pill gr-insp-live-badge ${inCombat ? 'in-combat' : ''}` },
          h('span', { class: 'gr-insp-live-dot' }),
          inCombat
            ? (isFr ? 'COMBAT LIVE' : 'LIVE COMBAT')
            : (isFr ? 'TEMPS RÉEL' : 'REAL-TIME'))),
      h('div', { class: 'gr-insp-sub-row' },
        ...classes.map((c) => h('span', { class: 'gr-insp-class-chip' }, img(classIcon(c.id)), nameOf(c))),
        guild ? h('span', null, `· ${nameOf(guild)}`) : null,
        h('span', null, `· ${localizeAttackType(unit?.attackType || def?.attackType)}`))),
    h('button', {
      class: 'gr-insp-close-btn',
      title: isFr ? 'Fermer (Échap)' : 'Close (Esc)',
      onclick: (e) => {
        e.stopPropagation();
        closeUnitInspector();
      },
    }, '✕'));

  // Out-of-combat Preview Mode Switcher (Rush 0s / Standard 12s / Stall 15s+)
  let modeBarEl = null;
  if (!inCombat) {
    const modes = [
      { id: 'rush', label: isFr ? '⚡ Début / Rush (0s)' : '⚡ Start / Rush (0s)' },
      { id: 'base', label: isFr ? '⚔️ Standard (12s)' : '⚔️ Standard (12s)' },
      { id: 'stall', label: isFr ? '⏳ Stall (15s+)' : '⏳ Stall (15s+)' },
    ];
    modeBarEl = h('div', { class: 'gr-insp-mode-bar' },
      modes.map((m) => h('button', {
        class: `gr-insp-mode-btn ${_inspectorState.previewMode === m.id ? 'active' : ''}`,
        dataset: { mode: m.id },
        onclick: (e) => {
          e.stopPropagation();
          _inspectorState.previewMode = m.id;
          _inspectorState.lastRenderSig = '';
          renderInspectorNow();
        },
      }, m.label)));
  }

  // Quick Bench / Deploy action button when inspecting an owned hero during Placement or Shop
  let quickActionsEl = null;
  if (!inCombat && runHero && ctx && ['placement', 'shop'].includes(vm?.phase)) {
    const onBoardHeroes = (vm?.heroes || []).filter((u) => u.onBoard);
    const maxTeam = Number(vm?.maxTeamSize ?? vm?.maxOnBoard ?? vm?.maxHeroesOnBoard ?? 3);
    if (runHero.onBoard && onBoardHeroes.length > 1) {
      quickActionsEl = h('div', { class: 'gr-insp-actions-row' },
        h('button', {
          class: 'gr-insp-action-btn',
          onclick: (e) => {
            e.stopPropagation();
            ctx.call('benchHero', runHero.uid);
          },
        }, isFr ? '🏕️ Envoyer en Réserve (activer Passif Soutien)' : '🏕️ Move to Reserve (activate Backup Passive)'));
    } else if (!runHero.onBoard && onBoardHeroes.length < maxTeam) {
      quickActionsEl = h('div', { class: 'gr-insp-actions-row' },
        h('button', {
          class: 'gr-insp-action-btn',
          onclick: (e) => {
            e.stopPropagation();
            ctx.call('placeHero', runHero.uid, 2, 1);
          },
        }, isFr ? '⚔️ Déployer sur le terrain' : '⚔️ Deploy to Board'));
    }
  }

  // Vital Bars (HP + Shield, Mana)
  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
  const shieldPct = shield > 0 ? Math.max(4, Math.min(100, (shield / Math.max(1, maxHp)) * 100)) : 0;
  const manaPct = maxMana > 0 ? Math.max(0, Math.min(100, (mana / maxMana) * 100)) : 0;

  const vitalsEl = h('div', { class: 'gr-insp-vitals' },
    h('div', { class: 'gr-insp-bar-row' },
      h('div', { class: `gr-insp-bar-fill ${isEnemy ? 'hp-enemy' : 'hp-ally'}`, style: { width: `${hpPct}%` } }),
      shield > 0 ? h('div', { class: 'gr-insp-bar-shield', style: { width: `${shieldPct}%` } }) : null,
      h('span', { class: 'gr-insp-bar-label' }, isFr ? 'PV' : 'HP'),
      h('span', { class: 'gr-insp-bar-val', dataset: { bar: 'hp-txt' } },
        `${hp} / ${maxHp}${shield > 0 ? ` (+${shield} 🛡️)` : ''}`)),
    maxMana > 0 ? h('div', { class: 'gr-insp-bar-row', style: { height: '16px', fontSize: '10.5px' } },
      h('div', { class: 'gr-insp-bar-fill mana', style: { width: `${manaPct}%` } }),
      h('span', { class: 'gr-insp-bar-label' }, 'MANA'),
      h('span', { class: 'gr-insp-bar-val', dataset: { bar: 'mana-txt' } }, `${mana} / ${maxMana}`)) : null);

  // Active Statuses & Rush/Stall Badges
  const statusPills = [];
  if (rushActive) {
    statusPills.push(h('span', { class: 'gr-insp-status-pill is-rush' }, isFr ? '⚡ Rush Actif' : '⚡ Rush Active'));
  }
  if (stallActive) {
    statusPills.push(h('span', { class: 'gr-insp-status-pill is-stall' }, isFr ? '⏳ Stall Actif' : '⏳ Stall Active'));
  }
  if (runHero && !runHero.onBoard && !inCombat) {
    statusPills.push(h('span', { class: 'gr-insp-status-pill' }, isFr ? '🏕️ En Réserve (Aperçu Terrain)' : '🏕️ In Reserve (Board Preview)'));
  }
  const statusKeys = ['Burn', 'Frost', 'Poison', 'Bleed', 'Stun', 'Stealth', 'DamageImmunity', 'AntiHeal'];
  for (const sk of statusKeys) {
    const val = Number(statuses[sk] || 0);
    if (val > 0) {
      const sIcon = statusIcon(sk);
      const dispVal = sk === 'Stun' ? `${val.toFixed(1)}s` : `×${Math.round(val)}`;
      statusPills.push(h('span', { class: 'gr-insp-status-pill' },
        sIcon ? img(sIcon) : null,
        `${sk} ${dispVal}`));
    }
  }

  // Real-time Stat Cards Grid
  const statCardsEl = h('div', { class: 'gr-insp-stats-grid' },
    statDefinitions.map((sd) => {
      const delta = Math.round((sd.val - sd.base) * 10) / 10;
      const isBuff = delta > 0.05;
      const isDebuff = delta < -0.05;
      const pulseInfo = _inspectorState.statPulseUntil[sd.key];
      const pulseCls = pulseInfo && pulseInfo.until > now ? `pulse-${pulseInfo.dir}` : '';
      return h('div', {
        class: `gr-insp-stat-card ${isBuff ? 'is-buffed' : isDebuff ? 'is-debuffed' : ''} ${pulseCls}`.trim(),
        dataset: { stat: sd.key },
      },
        h('div', { class: 'gr-insp-stat-top' },
          h('span', { class: 'gr-insp-stat-lbl' },
            img(statIcon(sd.key)),
            sd.label),
          h('span', { class: 'gr-insp-stat-val-wrap' },
            h('span', {
              class: 'gr-insp-stat-val',
              style: isBuff ? { color: '#4ade80' } : isDebuff ? { color: '#f87171' } : null,
            }, `${fmtNum(sd.val)}${sd.suffix || ''}`),
            Math.abs(delta) > 0.05 ? h('span', {
              class: 'gr-insp-stat-Card-delta',
              style: { color: delta > 0 ? '#4ade80' : '#f87171' },
            }, `(${delta > 0 ? '+' : ''}${fmtNum(delta)}${sd.suffix === '%' ? '%' : ''})`) : null)),
        h('div', { class: 'gr-insp-stat-sub' },
          h('span', null, sd.sub)));
    }));

  // Live Combat Performance Metrics (when in combat)
  let combatMetricsEl = null;
  if (inCombat) {
    combatMetricsEl = h('div', { class: 'gr-insp-combat-metrics' },
      h('div', { class: 'gr-insp-metric-cell' },
        h('span', { class: 'gr-insp-metric-val', style: { color: '#fbbf24' } }, String(Math.round(cStats.damageDealt || 0))),
        h('span', { class: 'gr-insp-metric-lbl' }, isFr ? 'Dégâts' : 'Dealt')),
      h('div', { class: 'gr-insp-metric-cell' },
        h('span', { class: 'gr-insp-metric-val', style: { color: '#38bdf8' } }, String(Math.round(cStats.damageMitigated || 0))),
        h('span', { class: 'gr-insp-metric-lbl' }, isFr ? 'Bloqués' : 'Mitigated')),
      h('div', { class: 'gr-insp-metric-cell' },
        h('span', { class: 'gr-insp-metric-val', style: { color: '#4ade80' } }, String(Math.round(cStats.healingDone || 0))),
        h('span', { class: 'gr-insp-metric-lbl' }, isFr ? 'Soins' : 'Healed')));
  }

  // Abilities, Passives, Specializations & Rank Modifiers (with real-time calculated numbers!)
  const abilityBlocks = [];
  if (isEnemy) {
    if (def?.activeAbilityId != null) {
      abilityBlocks.push(abilityBlock(def.activeAbilityId, false, { stats: liveStats, rank: 1 }));
    }
    if (def?.passiveAbilityId != null) {
      abilityBlocks.push(abilityBlock(def.passiveAbilityId, true, { stats: liveStats, rank: 1 }));
    }
  } else {
    const actId = spec?.activeAbilityId ?? (def?.startWithActiveAbility !== false ? def?.activeAbilityId : null);
    if (actId != null) {
      const badge = spec?.activeAbilityId != null ? `${rankWord} B · ${nameOf(spec)}` : `${rankWord} C`;
      abilityBlocks.push(abilityBlock(actId, false, { badge, stats: liveStats, rank }));
    }
    if (def?.passiveAbilityId != null) {
      abilityBlocks.push(abilityBlock(def.passiveAbilityId, true, { badge: `${rankWord} C`, stats: liveStats, rank }));
    }
    if (spec && spec.passiveAbilityId != null) {
      abilityBlocks.push(abilityBlock(spec.passiveAbilityId, true, { badge: `${rankWord} B · ${nameOf(spec)}`, stats: liveStats, rank }));
    } else if (spec && spec.activeAbilityId == null) {
      abilityBlocks.push(h('div', { class: 'tt-ability' },
        h('div', null,
          h('div', { class: 'tt-ab-name' }, nameOf(spec), h('span', { class: 'tt-ab-kind' }, ` · ${rankWord} B`)),
          h('div', { class: 'tt-desc', html: richText(descOf(spec), { values: valuesOf(spec), stats: liveStats, rank }) }))));
    }
    for (let i = 0; i < rankModIds.length; i++) {
      const mid = rankModIds[i];
      const m = d.rankModifiers?.[mid];
      if (!m) continue;
      const rLabel = i === 0 ? `${rankWord} A` : `${rankWord} S`;
      abilityBlocks.push(h('div', { class: 'tt-ability' },
        m.icon ? img(m.icon, { class: 'tt-ab-icon' }) : null,
        h('div', null,
          h('div', { class: 'tt-ab-name' }, nameOf(m), h('span', { class: 'tt-ab-kind' }, ` · ${rLabel}`)),
          h('div', { class: 'tt-desc', html: richText(descOf(m), { values: valuesOf(m), stats: liveStats, rank }) }))));
    }
  }

  // Equipped Items section
  let itemsSectionEl = null;
  if (!isEnemy && equippedItems.length > 0) {
    itemsSectionEl = h('div', { class: 'gr-insp-items-list' },
      h('div', { class: 'gr-insp-sec-title' },
        h('span', null, isFr ? 'OBJETS ÉQUIPÉS' : 'EQUIPPED ITEMS'),
        h('span', null, `${equippedItems.length} / ${unit?.maxItemSlots || runHero?.maxItemSlots || rank}`)),
      equippedItems.map((itRef) => {
        const itObj = typeof itRef === 'object' ? itRef : { itemId: itRef };
        const iid = itObj.itemId ?? itObj.id;
        const itDef = d.items?.[iid];
        if (!itDef) return null;
        const statText = (itDef.statMods || []).map((m) => `+${fmtNum(m.value)}${m.percent ? '%' : ''} ${statName(m.stat)}`).join(' · ');
        const q = itDef.quest;
        const req = q?.effect?.requiredProgress ?? q?.requiredProgress ?? 1;
        const prog = itObj.progress ?? 0;
        const done = !!(itObj.completed || (req > 0 && prog >= req));
        return h('div', { class: 'gr-insp-item-row' },
          img(itemIcon(iid)),
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('div', { style: { fontWeight: '800', color: '#f8fafc', display: 'flex', justifyContent: 'space-between' } },
              h('span', null, nameOf(itDef)),
              q ? h('span', { style: { fontSize: '10px', color: done ? '#4ade80' : '#fbbf24' } },
                done ? (isFr ? '✓ Quête' : '✓ Quest') : `${prog}/${req}`) : null),
            statText ? h('div', { style: { color: '#4ade80', fontSize: '10.5px', fontWeight: '700' } }, statText) : null,
            descOf(itDef) ? h('div', { class: 'tt-desc', style: { fontSize: '10.5px' }, html: richText(descOf(itDef), { values: valuesOf(itDef), tracking: prog }) }) : null));
      }));
  }

  const bodyEl = h('div', { class: 'gr-insp-body' },
    modeBarEl,
    quickActionsEl,
    vitalsEl,
    statusPills.length ? h('div', { class: 'gr-insp-status-strip' }, statusPills) : null,
    combatMetricsEl,
    h('div', { class: 'gr-insp-sec-title' },
      h('span', null, isFr ? 'STATISTIQUES EN TEMPS RÉEL (AVEC PASSIFS)' : 'REAL-TIME STATS (WITH PASSIVES)'),
      h('span', { style: { color: '#4ade80', fontSize: '10px' } }, isFr ? '● Actif' : '● Live')),
    statCardsEl,
    abilityBlocks.length ? h('div', { class: 'gr-insp-abilities' },
      h('div', { class: 'gr-insp-sec-title' }, isFr ? 'COMPÉTENCES & PASSIFS (VALEURS DYNAMIQUES)' : 'ABILITIES & PASSIVES (DYNAMIC VALUES)'),
      ...abilityBlocks) : null,
    itemsSectionEl);

  const prevBody = panel.querySelector('.gr-insp-body');
  const prevScroll = prevBody ? prevBody.scrollTop : 0;
  panel.replaceChildren(headerEl, bodyEl);
  if (prevScroll > 0) {
    bodyEl.scrollTop = prevScroll;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _inspectorState.open) {
      closeUnitInspector();
    }
  });
}
