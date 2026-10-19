// Unity rich-text → safe HTML.
// Handles `[text]<tag>` (game custom markup), <b>/<i>/<u>/<color=..>/<size=..>, `\n`,
// `{0}` numeric placeholders (filled from opts.values), `{name}` placeholders (opts.vars),
// `{0:choose(A|B|C):x|y|z}` gender/choice selectors and statcalc expressions `{0}+{1}_Attack`.
import { statName, getLang } from '../data.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fmtNum(v) {
  if (typeof v !== 'number' || !isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  return String(+(a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)));
}

const STAT_SHORT_EN = {
  Attack: 'ATK', Magic: 'MAG', AttackSpeed: 'AS', Crit: 'CRIT', Defense: 'DEF', MaxHealth: 'HP', MaxHP: 'HP',
  ManaRegen: 'MREG', Rank: 'RANK', OmniVamp: 'VAMP', Omnivamp: 'VAMP', HPPerSecond: 'HP/s', Shard: 'SHARD', Shards: 'SHARD',
};

const STAT_SHORT_FR = {
  Attack: 'ATQ', Magic: 'MAG', AttackSpeed: 'VIT.ATQ', Crit: 'CRIT', Defense: 'DÉF', MaxHealth: 'PV', MaxHP: 'PV',
  ManaRegen: 'RÉG.MANA', Rank: 'RANG', OmniVamp: 'VAMP', Omnivamp: 'VAMP', HPPerSecond: 'PV/s', Shard: 'ÉCLAT', Shards: 'ÉCLAT',
};

function getVal(values, idx) {
  if (!values) return undefined;
  const v = Array.isArray(values) ? values[idx] : values[idx] ?? values[String(idx)];
  return v;
}

const STAT_LOOKUP_ALIAS = {
  Attack: 'Attack',
  AD: 'Attack',
  Magic: 'Magic',
  AP: 'Magic',
  AttackSpeed: 'AttackSpeed',
  AS: 'AttackSpeed',
  Crit: 'Crit',
  Defense: 'Defense',
  MaxHealth: 'MaxHealth',
  MaxHP: 'MaxHealth',
  Health: 'MaxHealth',
  HP: 'MaxHealth',
  ManaRegen: 'ManaRegen',
  OmniVamp: 'OmniVamp',
  Omnivamp: 'OmniVamp',
  DamageAmp: 'DamageAmp',
  HPPerSecond: 'HPPerSecond',
  AttackRange: 'AttackRange',
};

function readStatValue(stats, statKey) {
  if (!stats || !statKey) return null;
  const canonical = STAT_LOOKUP_ALIAS[statKey] || statKey;
  if (stats[canonical] != null && Number.isFinite(Number(stats[canonical]))) return Number(stats[canonical]);
  if (stats[statKey] != null && Number.isFinite(Number(stats[statKey]))) return Number(stats[statKey]);
  return 0;
}

/** Render a statcalc expression like "{0}+{1}_AttackSpeed+{2}_Attack" or "250+300_Attack+300_Magic" or "0+1/15_Magic". */
function renderStatCalc(expr, opts = {}) {
  // First substitute any {0}, {1} placeholders if present
  const expanded = String(expr).replace(/\{(\d+)\}/g, (m, idx) => {
    const v = getVal(opts.values, +idx);
    if (v == null) return '?';
    return typeof v === 'object' ? String(v.value ?? v.v ?? 0) : String(v);
  });

  const stats = opts.stats || null;
  const rank = Math.max(1, Math.min(4, Number(opts.rank) || 1));
  const rankIdx = rank - 1;

  const rawTerms = expanded.split('+').map((s) => s.trim()).filter(Boolean);
  const hasLeadingZero = rawTerms.length > 1 && (rawTerms[0] === '0' || rawTerms[0] === '0.0');
  const terms = hasLeadingZero ? rawTerms.slice(1) : rawTerms;

  let canCompute = true;
  let total = 0;
  let hasScalingTerm = false;
  const parts = [];

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const usIdx = term.indexOf('_');
    if (usIdx < 0) {
      const n = Number(term);
      if (Number.isFinite(n) && term !== '') {
        total += n;
        parts.push(`<span class="rt-base">${esc(fmtNum(n))}</span>`);
      } else {
        canCompute = false;
        parts.push(`<span class="rt-base">${esc(term)}</span>`);
      }
      continue;
    }

    hasScalingTerm = true;
    const coeffRaw = term.slice(0, usIdx).trim();
    const restRaw = term.slice(usIdx + 1).trim();
    const statMatch = /^([A-Za-z]+)(.*)$/.exec(restRaw);
    const statKey = statMatch ? statMatch[1] : restRaw;
    const trailing = statMatch ? statMatch[2] : '';
    const shortMap = getLang() === 'fr' ? STAT_SHORT_FR : STAT_SHORT_EN;
    const short = shortMap[statKey] || esc(statName(statKey));
    const statLower = esc(statKey.toLowerCase());

    // Evaluate numerical contribution if stats (or Rank) are available
    if (statKey === 'Rank') {
      const rn = parseFloat(coeffRaw);
      if (Number.isFinite(rn)) {
        // When preceded by a non-zero base (e.g. "2+2_Rank" or "3+2_Rank"), Rank C = base + 0, Rank B = base + rn, etc.
        // When standalone or preceded by "0+" (e.g. "0+2_Rank" or "2_Rank"), Rank C = rn * 1, Rank B = rn * 2, etc.
        const mult = !hasLeadingZero && i > 0 ? rankIdx : rank;
        total += rn * mult;
      } else {
        canCompute = false;
      }
    } else if (stats) {
      const sv = readStatValue(stats, statKey) ?? 0;
      if (coeffRaw.includes('/')) {
        const [num, den] = coeffRaw.split('/').map(Number);
        if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
          total += Math.floor((sv * num) / den);
        } else {
          canCompute = false;
        }
      } else if (coeffRaw.includes('|')) {
        const rNums = coeffRaw.split('|').map((x) => parseFloat(x.trim()));
        const activePct = rNums[Math.min(rankIdx, rNums.length - 1)];
        if (Number.isFinite(activePct)) {
          total += sv * (activePct / 100);
        } else {
          canCompute = false;
        }
      } else {
        const rawNum = parseFloat(coeffRaw);
        if (Number.isFinite(rawNum)) {
          total += sv * (rawNum / 100);
        } else {
          canCompute = false;
        }
      }
    } else {
      canCompute = false;
    }

    let coeffDisplay = coeffRaw;
    if (coeffRaw.includes('/')) {
      coeffDisplay = `${esc(coeffRaw)} `;
    } else if (statKey === 'Rank') {
      coeffDisplay = `${esc(coeffRaw)}×`;
    } else if (coeffRaw.includes('|')) {
      const rParts = coeffRaw.split('|').map((x, idx) => {
        const clean = esc(x.trim());
        return idx === Math.min(rankIdx, 3) ? `<b>${clean}</b>` : clean;
      });
      coeffDisplay = `${rParts.join('/')}% `;
    } else if (coeffRaw.endsWith('%')) {
      coeffDisplay = `${esc(coeffRaw)} `;
    } else {
      const n = Number(coeffRaw);
      coeffDisplay = Number.isFinite(n) ? `${esc(fmtNum(n))}% ` : `${esc(coeffRaw)}×`;
    }

    parts.push(
      `<span class="rt-scale rt-s-${statLower}" title="${esc(statName(statKey))}">${coeffDisplay}${short}</span>${trailing ? esc(trailing) : ''}`,
    );
  }

  const formulaHtml = parts.join('<span class="rt-plus"> + </span>');
  if (canCompute && hasScalingTerm) {
    const rounded = Math.abs(total) >= 10 ? Math.round(total) : Math.round(total * 10) / 10;
    return `<strong class="rt-calc-total">${esc(fmtNum(rounded))}</strong> <span class="rt-calc-formula">(${formulaHtml})</span>`;
  }
  return formulaHtml;
}

const DEFAULT_VARS_EN = {
  amount: 15,
  shards: 15,
  shardbonus: 15,
  stat: 'Attack',
  statbonus: 15,
  statlosspercent: 15,
  statreduction: 15,
  maxhpbonus: 250,
  burnpercent: 20,
  poisonpercent: 20,
  defensepenalty: 20,
  damagepercent: 20,
  reliccount: 3,
  itemcount: 3,
  combatcount: 2,
  stuncombatcount: 2,
  time: 10,
  stuntime: 3,
  stunduration: 3,
  timelimit: 25,
  survivetime: 20,
  goodchance: 50,
  badchance: 50,
  rank: 'B',
  class: 'Warrior',
  hero: 'Hero',
  bossname: 'Rift Boss',
  name: 'Relic',
  relic: 'Relic',
  relicname: 'Relic',
  item: 'Item',
  itemWithDesc: 'Item',
  duration: 10,
  floor: 1,
  'shard-icon': '',
  'shard-amount': 15,
  'shard-bonus-string': '',
  description: 'Challenge',
  reward: 'Relic',
};

const DEFAULT_VARS_FR = {
  ...DEFAULT_VARS_EN,
  stat: 'Attaque',
  class: 'Guerrier',
  hero: 'Héros',
  bossname: 'Boss de la Faille',
  name: 'Relique',
  relic: 'Relique',
  relicname: 'Relique',
  item: 'Objet',
  itemWithDesc: 'Objet',
  description: 'Défi',
  reward: 'Relique',
};

function lookupVar(k, opts) {
  if (opts?.vars) {
    const direct = opts.vars[k] ?? k.split('.').reduce((o, p) => (o == null ? o : o[p]), opts.vars);
    if (direct != null) return direct;
  }
  const defs = getLang() === 'fr' ? DEFAULT_VARS_FR : DEFAULT_VARS_EN;
  return defs[k] ?? defs[k.toLowerCase()];
}

function resolveChoose(str, opts) {
  // {0:choose(Feminine|Masculine|Neutral):a|b|c} and {0:plural:one|many}
  return str
    .replace(/\{(\w+):choose\(([^)]*)\):([^}]*)\}/g, (m, k, keys, outs) => {
      const ks = keys.split('|');
      const os = outs.split('|');
      const want = (opts.vars && opts.vars[k]) ?? opts.gender;
      let i = want != null ? ks.findIndex((x) => x.toLowerCase() === String(want).toLowerCase()) : -1;
      if (i < 0 && typeof want === 'number') i = want;
      return os[Math.max(0, Math.min(os.length - 1, i < 0 ? 0 : i))] || '';
    })
    .replace(/\{(\d+):plural:((?:[^{}]|\{\})*)\}/g, (m, idx, body) => {
      const n = Number(getVal(opts.values, +idx) ?? (opts.vars && opts.vars[idx]) ?? 1);
      const parts = body.split('|');
      const chosen = (n === 1 ? parts[0] : (parts[1] ?? parts[0])) || '';
      return chosen.replace(/\{\}/g, String(Number.isFinite(n) ? n : 1));
    });
}

function expandNamedVars(str, opts) {
  return str.replace(/\{([A-Za-z_][\w.-]*)\}/g, (m, k) => {
    const v = lookupVar(k, opts);
    if (v == null) return '';
    return typeof v === 'number' ? fmtNum(v) : String(v);
  });
}

function fillPlaceholders(htmlStr, opts) {
  return htmlStr.replace(/\{(\d+)\}/g, (m, n) => {
    const v = getVal(opts.values, +n);
    return v == null ? '<span class="rt-base">0</span>' : `<span class="rt-base">${esc(fmtNum(v))}</span>`;
  }).replace(/\{([A-Za-z_][\w.-]*)\}/g, (m, k) => {
    const v = lookupVar(k, opts);
    return v == null ? '' : esc(typeof v === 'number' ? fmtNum(v) : v);
  });
}

/**
 * @param {string} src raw localized string
 * @param {{values?:any[]|object, vars?:object, gender?:string}} [opts]
 * @returns {string} HTML
 */
export function richText(src, opts = {}) {
  if (src == null) return '';
  let s = String(src);
  s = resolveChoose(s, opts);
  s = expandNamedVars(s, opts);
  s = s.replace(/\\\\n|\\n|\r?\n|<br\s*\/?>/gi, '\u0003'); // newline marker
  const slots = [];
  s = s.replace(/\[([^\[\]]*)\]<([a-zA-Z_0-9/_-]+)>/g, (m, inner, tag) => {
    const tl = tag.toLowerCase();
    let content;
    if (tl.startsWith('statcalc')) {
      content = renderStatCalc(inner, opts);
    } else if (tl.includes('datatracking')) {
      const rawInner = inner.replace(/\{(\d+)\}/g, (_, n) => {
        const v = getVal(opts.values, +n);
        return v == null ? '' : String(v);
      }).trim();
      const dm = rawInner.match(/^\d+d(-?\d+(?:\.\d+)?)$/i);
      const defVal = dm ? Number(dm[1]) : (rawInner !== '' && !Number.isNaN(Number(rawInner)) ? Number(rawInner) : 0);
      const trk = opts.tracking != null && Number.isFinite(Number(opts.tracking)) ? Number(opts.tracking) : 0;
      const finalVal = trk > 0 ? (dm && trk < defVal ? defVal + trk : trk) : defVal;
      content = `<span class="rt-base">${esc(fmtNum(finalVal))}</span>`;
    } else if (tl === 'customdatarelicname') {
      const key = inner.replace(/\{(\d+)\}/g, (_, n) => String(getVal(opts.values, +n) ?? '')).trim();
      const customName = (opts.vars && (opts.vars[key] || opts.vars[inner] || opts.vars.relicName || opts.vars.name)) || (getLang() === 'fr' ? 'Relique choisie' : 'Chosen Relic');
      content = esc(String(customName));
    } else if (tl === 'customdataitemname') {
      const key = inner.replace(/\{(\d+)\}/g, (_, n) => String(getVal(opts.values, +n) ?? '')).trim();
      const customName = (opts.vars && (opts.vars[key] || opts.vars[inner] || opts.vars.itemName || opts.vars.name)) || (getLang() === 'fr' ? 'Objet choisi' : 'Chosen Item');
      content = esc(String(customName));
    } else {
      content = fillPlaceholders(esc(inner), opts);
    }
    const kind = (tl.startsWith('statcalc_') ? tl.slice(9) : tl).replace(/\//g, '');
    slots.push(`<span class="rt rt-${esc(kind)}${tl.startsWith('statcalc') ? ' rt-calc' : ''}">${content}</span>`);
    return `\u0001${slots.length - 1}\u0002`;
  });
  let h = esc(s);
  // Standard Unity tags
  h = h.replace(/&lt;(\/?)(b|i|u)&gt;/gi, '<$1$2>')
    .replace(/&lt;color=(?:&quot;)?(#[0-9a-fA-F]{3,8}|[a-z]+|\{\d+\})(?:&quot;)?&gt;/gi, (m, col) => {
      const c = col.startsWith('{') ? '#fbbf24' : col;
      return `<span style="color:${c}">`;
    })
    .replace(/&lt;\/color&gt;/gi, '</span>')
    .replace(/&lt;\/?(size|sprite|font|material|mark|line-height|voffset|style|link|nobr|sup|sub|align|indent)(?:(?!&gt;).)*&gt;/gi, '');
  h = fillPlaceholders(h, opts);
  h = h.replace(/\u0001(\d+)\u0002/g, (m, i) => slots[+i]);
  h = h.replace(/\u0003/g, '<br>');
  return h;
}

/** Plain text (no tags) version, for titles. */
export function plainText(src, opts = {}) {
  const d = document.createElement('div');
  d.innerHTML = richText(src, opts);
  return d.textContent || '';
}
