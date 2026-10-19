// Reusable UI building blocks: CoreGameUI HUD, HeroCard, buttons, tokens, item & relic slots, synergy panel, drag & drop.
import { t, txt, getLang, getGameData } from '../data.js';
import { h, img } from './dom.js';
import {
  SPR, heroPortrait, rankLetter, rankFrame, rankFrameSmall, itemIcon, itemFrame,
  relicIcon, relicFrame, classIcon, classBanner, enemyIcon,
  rankBadge, abilityIcon, heroKeywords,
} from './assets.js';
import {
  attachTooltip, heroTooltip, itemTooltip, relicTooltip, classTooltip,
  enemyTooltip, stabilizerTooltip, abilityTooltip, rankModTooltip, hideTooltip,
  openUnitInspector,
} from './tooltip.js';

const isFr = () => getLang() === 'fr';
const L = (fr, en) => (getLang() === 'fr' ? fr : en);

function nameOf(obj) {
  if (!obj) return '';
  if (obj.nameKey) {
    const v = txt(obj.nameKey);
    if (v && v !== obj.nameKey) return v;
  }
  return txt(obj.name);
}

// ---------------- Drag & drop ----------------
let dragPayload = null;
export const getDrag = () => dragPayload;

export function makeDraggable(el, payload) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    dragPayload = payload;
    hideTooltip();
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
    } catch { /* ignore */ }
    document.body.classList.add(`dragging-${payload.kind}`);
    el.classList.add('is-dragging');
  });
  el.addEventListener('dragend', () => {
    dragPayload = null;
    document.body.classList.remove('dragging-hero', 'dragging-item');
    el.classList.remove('is-dragging');
  });
  return el;
}

/** accept(payload) → bool; onDrop(payload) */
export function makeDropTarget(el, accept, onDrop) {
  el.addEventListener('dragover', (e) => {
    if (dragPayload && accept(dragPayload)) {
      e.preventDefault();
      el.classList.add('drop-hover');
    }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-hover'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('drop-hover');
    let p = dragPayload;
    if (!p) {
      try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { p = null; }
    }
    if (p && accept(p)) {
      e.preventDefault();
      e.stopPropagation();
      onDrop(p);
    }
    dragPayload = null;
  });
  return el;
}

// ---------------- Ornate Unity Buttons ----------------
export function primaryButton(label, onClick, opts = {}) {
  return h('button', {
    class: `gr-btn-primary ${opts.cls || ''}`.trim(),
    disabled: Boolean(opts.disabled),
    title: opts.title || null,
    onclick: onClick,
  },
  img(SPR.btnBottom, { class: 'gr-btn-bg' }),
  img(SPR.btnTop, { class: 'gr-btn-frame' }),
  img(SPR.btnDecos, { class: 'gr-btn-deco gr-btn-deco-left' }),
  img(SPR.btnDecos, { class: 'gr-btn-deco gr-btn-deco-right' }),
  h('span', { class: 'gr-btn-label' }, label, opts.extra || null));
}

export function secondaryButton(label, onClick, opts = {}) {
  return h('button', {
    class: `gr-btn-secondary ${opts.cls || ''}`.trim(),
    disabled: Boolean(opts.disabled),
    title: opts.title || null,
    onclick: onClick,
  },
  img(SPR.btnSecondary, { class: 'gr-btn-bg' }),
  h('span', { class: 'gr-btn-label' }, label, opts.extra || null));
}

export function tertiaryButton(label, onClick, opts = {}) {
  return h('button', {
    class: `gr-btn-tertiary ${opts.cls || ''}`.trim(),
    disabled: Boolean(opts.disabled),
    title: opts.title || null,
    onclick: onClick,
  },
  img(SPR.btnTertiary, { class: 'gr-btn-bg' }),
  h('span', { class: 'gr-btn-label' }, label, opts.extra || null));
}

// ---------------- 4-Diamond Ability Cluster ----------------
function buildDiamondCluster(heroId, opts = {}) {
  const d = getGameData();
  const def = d?.heroes?.[heroId];
  const spec = opts.specializationId != null ? d?.specializations?.[opts.specializationId] : null;

  // Diamond 0 (top, Rank C): Innate ability
  const innateIsActive = def?.startWithActiveAbility !== false && def?.activeAbilityId != null;
  const topAbId = innateIsActive ? def?.activeAbilityId : def?.passiveAbilityId;
  const topIsPassive = !innateIsActive && def?.passiveAbilityId != null;

  // Diamond 1 (left, Rank B): Specialization ability
  const specAbId = spec?.activeAbilityId ?? spec?.passiveAbilityId ?? null;
  const specIsPassive = spec?.activeAbilityId == null && spec?.passiveAbilityId != null;

  // Diamond 2 (right, Rank A) & Diamond 3 (bottom, Rank S): RankModifiers
  const mods = Array.isArray(opts.rankModifierIds) ? opts.rankModifierIds.filter(Boolean) : [];
  const positions = ['top', 'left', 'right', 'bottom'];

  return positions.map((pos, idx) => {
    let abIconUrl = null;
    let tooltipFn = null;
    const heroOpts = { heroId, ...opts };
    if (idx === 0 && topAbId != null) {
      abIconUrl = abilityIcon(topAbId, topIsPassive);
      tooltipFn = () => abilityTooltip(topAbId, topIsPassive, heroOpts);
    } else if (idx === 1 && specAbId != null) {
      abIconUrl = abilityIcon(specAbId, specIsPassive);
      tooltipFn = () => abilityTooltip(specAbId, specIsPassive, heroOpts);
    } else if (idx >= 2) {
      const modId = mods[idx - 2];
      const modDef = modId != null ? d?.rankModifiers?.[modId] : null;
      if (modDef) {
        abIconUrl = modDef.icon || SPR.abilityFrame;
        tooltipFn = () => rankModTooltip(modId, heroOpts);
      }
    }
    const slot = h('div', {
      class: `gr-diamond-slot ${pos} ${abIconUrl ? 'filled' : 'locked'}`,
      onclick: (e) => e.stopPropagation(),
    }, abIconUrl ? img(abIconUrl) : null);
    if (tooltipFn) attachTooltip(slot, tooltipFn);
    return slot;
  });
}

// ---------------- Pentagonal HeroCard (Screenshot 3 & Screenshot 6) ----------------
export function heroCard(heroId, opts = {}) {
  const d = getGameData();
  const def = d?.heroes?.[heroId];
  const rank = opts.rank ?? 1;
  const rLet = rankLetter(rank);

  let classes = (def?.classIds || []).filter((c) => d?.classes?.[c]);
  const spec = opts.specializationId != null ? d?.specializations?.[opts.specializationId] : null;
  if (spec?.classId != null && d?.classes?.[spec.classId] && !classes.includes(spec.classId)) {
    classes = classes.concat([spec.classId]);
  }
  const primaryClass = classes[0];
  const kwIcons = heroKeywords(heroId);

  const helpBtn = h('div', {
    class: 'gr-hero-card-help',
    onclick: (e) => {
      e.stopPropagation();
      openUnitInspector({ heroId, ...opts, rank, specializationId: opts.specializationId }, { event: e, forceOpen: true });
    },
  }, h('span', null, '?'));
  attachTooltip(helpBtn, () => heroTooltip(heroId, { ...opts, rank, specializationId: opts.specializationId }));

  const el = h('div', {
    class: `gr-hero-card rank-${rLet} ${opts.sold ? 'sold is-sold' : ''} ${opts.frozen ? 'frozen' : ''} ${opts.cls || ''}`.trim(),
    dataset: { heroId: String(heroId) },
    oncontextmenu: (e) => {
      e.preventDefault();
      e.stopPropagation();
      openUnitInspector({ heroId, ...opts, rank, specializationId: opts.specializationId }, { event: e });
    },
  },
  // Optional Shop Price & Sale Tag above top of card
  opts.onSale ? h('div', { class: 'gr-hero-card-sale' }, L('PROMO', 'SALE')) : null,
  opts.price != null ? h('div', { class: 'gr-hero-card-price' },
    img(SPR.shardSmall),
    h('span', null, String(opts.price)),
  ) : null,

  // Pentagonal inner body
  h('div', { class: 'gr-hero-card-pentagon' },
    img(primaryClass != null ? classBanner(primaryClass) : SPR.bannerEmpty, {
      class: 'gr-hero-card-banner',
      style: { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', opacity: '0.85', zIndex: '1' },
    }),
    img(heroPortrait(heroId, 'breakout', rank), {
      class: 'gr-hero-card-art',
    }, heroPortrait(heroId, 'card', rank)),
    h('div', { class: 'gr-hero-card-plate' },
      h('div', { class: 'gr-hero-card-name' }, (nameOf(def) || `#${heroId}`).toUpperCase()),
      img(rankBadge(rank), { class: 'gr-hero-card-rank', alt: rLet }),
      h('div', { class: 'gr-hero-card-diamonds' }, buildDiamondCluster(heroId, opts)),
    ),
  ),

  // Steel border frame overlay
  h('div', { class: 'gr-hero-card-steel' }),

  // Top-right "?" diamond tooltip button
  helpBtn,

  // Left vertical ribbon: status / keyword icons
  kwIcons.length ? h('div', { class: 'gr-hero-card-ribbon-left' }, kwIcons.map((kUrl) => img(kUrl))) : null,

  // Right vertical ribbon: class icons
  classes.length ? h('div', { class: 'gr-hero-card-ribbon-right' }, classes.map((cid) => {
    const ic = img(classIcon(cid, true));
    attachTooltip(ic, () => classTooltip(cid));
    return ic;
  })) : null,

  opts.frozen ? h('div', { class: 'card-frozen' }, img(SPR.freeze)) : null,
  opts.sold ? h('div', { class: 'card-sold' }, L('VENDU', 'SOLD')) : null,
  opts.footer || null);

  if (opts.onClick && !opts.sold) {
    el.addEventListener('click', () => {
      hideTooltip();
      opts.onClick();
    });
  }
  return el;
}

// ---------------- Equipment & Placement Helpers ----------------
export function unequipItemFromHero(ctx, itemUid, heroUid) {
  if (!ctx || itemUid == null) return;
  const st = ctx.call('unequipItem', itemUid, heroUid);
  const hero = heroUid != null ? st?.heroes?.find((h) => String(h.uid) === String(heroUid)) : null;
  const stillHasIt = hero?.items?.some((it) => String(it?.uid ?? it) === String(itemUid));
  if (stillHasIt && heroUid != null) {
    ctx.call('unequipItem', heroUid, itemUid);
  }
}

export function equipItemOnHero(ctx, itemUid, heroUid, fromHeroUid = null) {
  if (!ctx || itemUid == null || heroUid == null) return;
  if (fromHeroUid != null && String(fromHeroUid) !== String(heroUid)) {
    unequipItemFromHero(ctx, itemUid, fromHeroUid);
  }
  const st = ctx.call('equipItem', itemUid, heroUid);
  const hero = st?.heroes?.find((h) => String(h.uid) === String(heroUid));
  const hasIt = hero?.items?.some(
    (it) => String(it?.uid ?? it) === String(itemUid) || Number(it?.itemId ?? it?.id ?? it) === Number(itemUid),
  );
  if (!hasIt) {
    ctx.call('equipItem', heroUid, itemUid);
  }
}

export function findBestHeroForItem(ctx, vm) {
  const heroes = vm?.heroes || [];
  if (!heroes.length) return null;
  const hasOpenSlot = (u) => (u.items?.length || 0) < Math.max(1, Number(u.maxItemSlots || u.rank || 1));
  const selUid = ctx?.selectedHeroUid;
  if (selUid != null) {
    const selHero = heroes.find((u) => String(u.uid) === String(selUid));
    if (selHero && hasOpenSlot(selHero)) return selHero;
  }
  const boardOpen = heroes.find((u) => u.onBoard && hasOpenSlot(u));
  if (boardOpen) return boardOpen;
  const anyOpen = heroes.find((u) => hasOpenSlot(u));
  if (anyOpen) return anyOpen;
  if (selUid != null) {
    const selHero = heroes.find((u) => String(u.uid) === String(selUid));
    if (selHero) return selHero;
  }
  return heroes.find((u) => u.onBoard) || heroes[0];
}

// ---------------- Heroes & Enemies Tokens ----------------
export function heroToken(ctx, hero, opts = {}) {
  const rLet = rankLetter(hero.rank);
  const el = h('div', { class: `hero-token rank-${rLet} ${opts.cls || ''}`.trim(), dataset: { uid: String(hero.uid) } },
    h('div', { class: 'token-portrait' }, img(heroPortrait(hero.heroId, 'round', hero.rank), {}, SPR.heroIcon)),
    h('div', { class: 'token-rank' }, rLet),
    hero.items?.length ? h('div', { class: 'token-items' }, hero.items.slice(0, 6).map((it) => {
      const ic = img(itemIcon(it.itemId), { class: 'token-item' });
      attachTooltip(ic, () => itemTooltip(it));
      return ic;
    })) : null);
  attachTooltip(el.querySelector('.token-portrait'), () => heroTooltip(hero.heroId, hero));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openUnitInspector(hero, { event: e, ctx });
  });
  if (opts.draggable !== false && ctx) makeDraggable(el, { kind: 'hero', uid: hero.uid });
  if (ctx) makeDropTarget(el, (p) => p.kind === 'item', (p) => equipItemOnHero(ctx, p.uid ?? p.itemId, hero.uid, p.fromHero));
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

export function enemyToken(enemyId) {
  const el = h('div', { class: 'hero-token enemy-token' },
    h('div', { class: 'token-portrait' }, img(enemyIcon(enemyId), {}, SPR.enemyRound)));
  attachTooltip(el, () => enemyTooltip(enemyId));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openUnitInspector(enemyId, { event: e, isEnemy: true });
  });
  return el;
}

// ---------------- Items & Relics ----------------
export function itemSlot(arg1, arg2, arg3) {
  let ctx = null;
  let item = null;
  let opts = {};
  const isItemLike = (v) =>
    typeof v === 'number' ||
    typeof v === 'string' ||
    (v && typeof v === 'object' && ('itemId' in v || ('id' in v && !('run' in v) && !('rerender' in v) && !('call' in v))));
  if (isItemLike(arg1) && arg3 === undefined) {
    item = arg1;
    opts = (arg2 && typeof arg2 === 'object') ? arg2 : {};
  } else {
    ctx = arg1;
    item = arg2;
    opts = (arg3 && typeof arg3 === 'object') ? arg3 : {};
  }
  const d = getGameData();
  const itemObj = (item && typeof item === 'object') ? item : (item != null ? { itemId: item } : null);
  const itemId = itemObj?.itemId ?? itemObj?.id;
  const def = itemId != null ? d?.items?.[itemId] : null;
  const emptyFrame = opts.small ? SPR.uiItemFrame : SPR.itemFrameEmpty;
  const el = h('div', {
    class: `item-slot ${itemId != null ? 'filled' : 'empty'} ${opts.cls || ''}`.trim(),
    title: opts.title || null,
  },
    img(itemId != null ? itemFrame(def?.rarity, opts.small) : emptyFrame, { class: 'slot-frame', style: { width: '100%', height: '100%', position: 'absolute', inset: '0', objectFit: 'contain' } }),
    itemId != null ? img(itemIcon(itemId), { class: 'slot-icon', style: { width: '76%', height: '76%', position: 'relative', zIndex: '1', objectFit: 'contain' } }) : null,
    opts.price != null ? h('div', { class: 'slot-price' }, img(SPR.shardSmall, { class: 'chip-icon' }), String(opts.price)) : null);
  if (itemId != null) {
    if (opts.tooltip !== false) {
      attachTooltip(el, () => itemTooltip(itemObj, opts));
    }
    if (opts.draggable && ctx) {
      makeDraggable(el, { kind: 'item', uid: itemObj.uid ?? itemId, itemId, fromHero: opts.fromHero ?? null });
    }
  }
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  if (opts.onContextMenu) el.addEventListener('contextmenu', opts.onContextMenu);
  return el;
}

export function relicSlot(relicOrId, opts = {}) {
  const relicObj = (relicOrId && typeof relicOrId === 'object') ? relicOrId : { relicId: relicOrId };
  const relicId = relicObj.relicId ?? relicObj.defId ?? relicObj.id ?? relicOrId;
  const def = getGameData()?.relics?.[relicId];
  const el = h('div', { class: `relic-slot ${opts.small ? 'small' : ''} ${opts.cls || ''}`.trim() },
    !opts.small ? img(relicFrame(def?.rarity), { class: 'slot-frame' }) : null,
    img(relicIcon(relicId), { class: 'slot-icon' }, SPR.relicGeneric),
    opts.price != null ? h('div', { class: 'slot-price' }, img(SPR.shardSmall, { class: 'chip-icon' }), String(opts.price)) : null);
  if (opts.tooltip !== false) {
    attachTooltip(el, () => relicTooltip(relicObj, opts));
  }
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

// ---------------- Synergies & Inventory Panels ----------------
export function computeBoardClassCounts(vm) {
  const d = getGameData();
  const counts = new Map();
  const activeHeroes = (vm?.heroes || []).filter((x) => x.onBoard);
  const sourceHeroes = activeHeroes.length ? activeHeroes : (vm?.heroes || []);
  for (const hero of sourceHeroes) {
    const def = d?.heroes?.[hero.heroId];
    const clsSet = new Set((def?.classIds || []).map(Number));
    const spec = hero.specializationId != null ? d?.specializations?.[hero.specializationId] : null;
    if (spec?.classId != null) clsSet.add(Number(spec.classId));
    for (const it of hero.items || []) {
      const iid = Number(typeof it === 'object' ? (it.itemId ?? it.id) : it);
      if (iid >= 801 && iid <= 807) clsSet.add(iid - 800);
      if (iid >= 701 && iid <= 707) clsSet.add(iid - 700);
    }
    for (const c of clsSet) {
      if (c > 0 && d?.classes?.[c]) {
        counts.set(String(c), (counts.get(String(c)) || 0) + 1);
      }
    }
  }
  return counts;
}

export function synergyPanel(vm, opts = {}) {
  const d = getGameData();
  const counts = computeBoardClassCounts(vm);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return h('div', { class: `synergy-panel gr-synergy-bar panel ${opts.cls || ''}`.trim() },
    h('div', { class: 'panel-title gr-synergy-title' }, t('ui.synergies') || L('SYNERGIES', 'CLASSES')),
    h('div', { class: 'gr-synergy-list' },
      rows.length ? rows.map(([cid, n]) => {
        const c = d?.classes?.[cid];
        const row = h('div', { class: `syn-row gr-syn-chip syn-${Math.min(n, 4)}` },
          img(classIcon(cid), { class: 'syn-icon' }),
          h('span', { class: 'syn-name' }, nameOf(c) || `#${cid}`),
          h('span', { class: 'syn-count' }, `×${n}`));
        attachTooltip(row, () => classTooltip(cid, n));
        return row;
      }) : h('div', { class: 'muted gr-syn-empty' }, '—')));
}

export function inventoryPanel(ctx, vm) {
  return h('div', { class: 'inventory panel' },
    h('div', { class: 'panel-title' }, t('ui.inventory')),
    h('div', { class: 'inv-grid' }, (vm.inventory || []).length
      ? vm.inventory.map((it) => itemSlot(ctx, it, {
          draggable: true,
          small: true,
          onClick: (e) => {
            e.stopPropagation();
            hideTooltip();
            const target = findBestHeroForItem(ctx, vm);
            if (target) equipItemOnHero(ctx, it.uid ?? it.itemId, target.uid);
          },
        }))
      : h('div', { class: 'muted' }, t('ui.empty'))));
}

// ---------------- Persistent In-Run HUD (CoreGameUI — Screenshot 4, 5, 6) ----------------
export function findFreePlayerCell(vm) {
  const occupied = new Set(
    (vm?.heroes || [])
      .filter((u) => u.onBoard && (u.x != null || u.pos?.x != null) && (u.y != null || u.pos?.y != null))
      .map((u) => `${u.x ?? u.pos.x},${u.y ?? u.pos.y}`),
  );
  const cols = vm?.boardCols || 7;
  const rows = vm?.playerRows || 4;
  const rowOrder = [1, 2, 0, 3].filter((r) => r < rows);
  const colOrder = [2, 3, 1, 4, 5, 0, 6].filter((c) => c < cols);
  for (const y of rowOrder) {
    for (const x of colOrder) {
      if (!occupied.has(`${x},${y}`)) return { x, y };
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!occupied.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: 2, y: 1 };
}

function buildPartySlot(ctx, vm, hero, isReserve = false) {
  const items = hero?.items || [];
  const slotCount = hero ? Math.max(1, Math.min(6, Number(hero.maxItemSlots || hero.rank || 1))) : 1;
  const itemBoxes = Array.from({ length: slotCount }, (_, i) => {
    const it = items[i];
    const itemObj = (it && typeof it === 'object') ? it : (it != null ? { uid: it, itemId: it } : null);
    const itId = itemObj?.itemId ?? itemObj?.id;
    const box = h('div', {
      class: `gr-mini-item gr-unit-item-slot ${itId != null ? 'filled has-item' : 'empty'}`,
      style: itId != null ? { cursor: 'pointer' } : null,
      title: itId != null ? L('Cliquez pour retirer (ou glissez pour déplacer/vendre)', 'Click to unequip (or drag to move/sell)') : null,
      onclick: itId != null && ctx && hero ? (e) => {
        e.stopPropagation();
        hideTooltip();
        if (ctx.shopSellMode && vm.phase === 'shop') {
          ctx.shopSellMode = false;
          unequipItemFromHero(ctx, itemObj.uid ?? i, hero.uid);
          ctx.call('sellItem', itemObj.uid ?? itId);
          return;
        }
        unequipItemFromHero(ctx, itemObj.uid ?? i, hero.uid);
      } : null,
    },
      itId != null ? img(itemIcon(itId), { style: { width: '20px', height: '20px', objectFit: 'contain' } }) : null);
    if (itId != null) {
      attachTooltip(box, () => itemTooltip(itemObj));
      if (ctx && hero) {
        makeDraggable(box, { kind: 'item', uid: itemObj.uid ?? itId, itemId: itId, fromHero: hero.uid });
        box.addEventListener('dragstart', (e) => e.stopPropagation());
      }
    }
    return box;
  });

  const portraitCircle = h('div', { class: `gr-party-portrait ${hero ? 'filled' : 'empty'}` },
    hero
      ? img(heroPortrait(hero.heroId, 'round', hero.rank), { class: 'portrait' }, SPR.heroIcon)
      : h('span', { style: { fontSize: '18px', opacity: '0.5' } }, '+'));

  if (hero) {
    attachTooltip(portraitCircle, () => heroTooltip(hero.heroId, hero));
    if (ctx) makeDraggable(portraitCircle, { kind: 'hero', uid: hero.uid, fromReserve: isReserve });
  }

  const boardHeroes = (vm?.heroes || []).filter((u) => u.onBoard);
  const maxTeam = Number(vm?.maxTeamSize ?? vm?.maxOnBoard ?? vm?.maxHeroesOnBoard ?? 3);

  const slotEl = h('div', {
    class: `gr-party-slot ${isReserve ? 'reserve gr-reserve-slot' : 'party'} ${hero ? 'filled' : 'empty'} ${hero && String(ctx?.selectedHeroUid) === String(hero.uid) ? 'is-selected' : ''}`.trim(),
    dataset: hero ? { uid: String(hero.uid) } : {},
    onclick: (e) => {
      if (!ctx || !hero) return;
      e.stopPropagation();
      hideTooltip();
      if (ctx.shopSellMode && vm.phase === 'shop') {
        if ((vm.heroes || []).length > 1) {
          ctx.shopSellMode = false;
          ctx.call('sellHero', hero.uid);
        }
        return;
      }
      if (isReserve) {
        if (boardHeroes.length < maxTeam) {
          const cell = findFreePlayerCell(vm);
          ctx.call('placeHero', hero.uid, cell.x, cell.y);
        } else {
          ctx.selectedHeroUid = hero.uid;
          ctx.rerender?.();
        }
      } else {
        ctx.selectedHeroUid = hero.uid;
      }
    },
    ondblclick: (e) => {
      if (!ctx || !hero) return;
      e.stopPropagation();
      hideTooltip();
      if (!isReserve && boardHeroes.length > 1) {
        ctx.call('benchHero', hero.uid);
      } else if (isReserve && boardHeroes.length < maxTeam) {
        const cell = findFreePlayerCell(vm);
        ctx.call('placeHero', hero.uid, cell.x, cell.y);
      }
    },
    oncontextmenu: (e) => {
      if (!hero) return;
      e.preventDefault();
      e.stopPropagation();
      hideTooltip();
      openUnitInspector(hero, { event: e, vm, ctx });
    },
  },
  (!isReserve || (hero && items.length > 0)) ? h('div', { class: 'gr-party-slot-items' }, itemBoxes) : null,
  portraitCircle,
  !isReserve ? h('div', { class: 'gr-party-slot-diamonds' },
    hero
      ? buildDiamondCluster(hero.heroId, { specializationId: hero.specializationId, rankModifierIds: hero.rankModifierIds })
      : ['top', 'left', 'right', 'bottom'].map((pos) => h('div', { class: `gr-diamond-slot ${pos} locked` }))) : null);

  if (hero && ctx) {
    makeDraggable(slotEl, { kind: 'hero', uid: hero.uid, fromReserve: isReserve });
  }

  if (ctx) {
    makeDropTarget(
      slotEl,
      (p) => (p.kind === 'item' && Boolean(hero)) || p.kind === 'hero',
      (p) => {
        if (p.kind === 'item' && hero) {
          equipItemOnHero(ctx, p.uid ?? p.itemId, hero.uid, p.fromHero);
        } else if (p.kind === 'hero') {
          if (isReserve) {
            const draggedHero = (vm.heroes || []).find((u) => String(u.uid) === String(p.uid));
            if (hero && String(hero.uid) !== String(p.uid) && draggedHero?.onBoard && draggedHero.x != null && draggedHero.y != null) {
              ctx.call('placeHero', hero.uid, draggedHero.x, draggedHero.y);
            } else {
              ctx.call('benchHero', p.uid);
            }
          } else if (hero && hero.onBoard && hero.x != null && hero.y != null && String(hero.uid) !== String(p.uid)) {
            ctx.call('placeHero', p.uid, hero.x, hero.y);
          } else {
            const cell = findFreePlayerCell(vm);
            ctx.call('placeHero', p.uid, cell.x, cell.y);
          }
        }
      },
    );
  }
  return slotEl;
}

/** Live-update the right-edge DamageTracker bars during/after combat. */
export function updateDamageTracker(root, rows = [], fallbackHeroes = []) {
  if (!root) return;
  const body = root.querySelector('[data-dmg-rows]');
  if (!body) return;

  const entries = (rows && rows.length)
    ? rows
    : fallbackHeroes.map((u) => ({ heroId: u.heroId, rank: u.rank, damage: u.damageDealt ?? 0 }));

  const maxDmg = Math.max(1, ...entries.map((r) => Number(r.damage || r.dmg || 0)));
  body.replaceChildren(...entries.slice(0, 6).map((r) => {
    const val = Math.round(Number(r.damage || r.dmg || 0));
    const pct = val > 0 ? Math.max(6, Math.min(100, Math.round((val / maxDmg) * 100))) : 0;
    return h('div', { class: 'gr-tracker-row' },
      h('div', { class: 'gr-tracker-avatar' },
        img(heroPortrait(r.heroId, 'round', r.rank), {}, SPR.heroIcon)),
      h('div', { class: 'gr-tracker-info' },
        h('div', { class: 'gr-tracker-val' }, String(val)),
        h('div', { class: 'gr-tracker-bar' },
          h('div', { class: 'gr-tracker-bar-fill', style: { width: `${pct}%` } }))));
  }));
}

export function hud(ctx, vm, optsOrExtra = {}) {
  const isNodeExtra = optsOrExtra && (optsOrExtra instanceof Node || Array.isArray(optsOrExtra));
  const opts = isNodeExtra ? { extra: optsOrExtra } : (optsOrExtra || {});

  // 1. Top-Left Relics Row (diamond frames for owned relics)
  const relics = vm.relics || [];
  const relicGroup = h('div', { class: 'gr-core-relics' },
    relics.map((r) => {
      const rid = r.relicId ?? r;
      const dSlot = h('div', { class: 'gr-relic-diamond' }, img(relicIcon(rid), {}, SPR.relicGeneric));
      attachTooltip(dSlot, () => relicTooltip(r));
      return dSlot;
    }));

  // 2. Top-Center Trapezoid Chunk Map Bar + Hanging Timer
  const floorNum = Math.max(1, Number(vm.floor) || 1);
  const chunkStep = (floorNum - 1) % 6;
  const chunkNodeIcons = [
    SPR.fightRoom,
    SPR.campFire,
    SPR.eventIcon,
    SPR.gateIcon,
    SPR.fightIcon,
    SPR.boss,
  ];
  const chunkNodes = chunkNodeIcons.map((iconUrl, idx) => (
    h('div', { class: `gr-top-node gr-chunk-node ${idx === chunkStep ? 'active current' : ''}`.trim() },
      img(iconUrl))
  ));

  const stabVal = vm.accumulatedShards != null ? vm.accumulatedShards : 10;
  const shardChip = h('div', { class: 'gr-top-shards', title: t('ui.shards') },
    img(SPR.shardSmall),
    h('span', null, String(vm.shards ?? 15)));
  const stabChip = h('div', { class: 'gr-top-stabilizer' },
    h('span', null, String(stabVal)),
    img(SPR.stabilizerNormal));
  attachTooltip(stabChip, () => stabilizerTooltip(vm));

  const topBar = h('div', { class: 'gr-core-top-bar' },
    shardChip,
    h('div', { class: 'gr-top-nodes gr-chunk-nodes' }, chunkNodes),
    stabChip);

  const isEndlessFloor = floorNum > 12 || (vm.endlessFloorIndex != null && vm.endlessFloorIndex >= 0);
  const floorLabelText = isEndlessFloor
    ? L(`INFINI · ÉTAGE ${floorNum}`, `ENDLESS · FLOOR ${floorNum}`)
    : L(`ÉTAGE ${floorNum}`, `FLOOR ${floorNum}`);
  const timerTab = h('div', { class: 'gr-chunk-timer' },
    h('span', {
      class: 'gr-floor-badge',
      style: {
        marginRight: '8px',
        paddingRight: '8px',
        borderRight: '1px solid rgba(255,255,255,0.2)',
        color: isEndlessFloor ? '#fbbf24' : '#cbd5e1',
        fontWeight: '800',
        fontSize: '11px',
        letterSpacing: '0.06em',
      },
    }, floorLabelText),
    img(SPR.cyclone, { style: { width: '15px', height: '15px', verticalAlign: '-2px', marginRight: '5px', objectFit: 'contain' } }),
    h('span', { class: 'gr-timer-val' }, opts.timerText || '00:00'));

  // 3. Top-Right Battle Speed Controls
  const currentSpeed = Number(ctx?.speed || ctx?.battleSpeed) || 1;
  const speedControls = h('div', { class: 'gr-core-speed' },
    h('div', { class: 'gr-speed-buttons' },
      h('button', { class: 'gr-speed-btn', title: 'Auto' }, 'AUTO'),
      ...[
        { spd: 1, label: '▶' },
        { spd: 2, label: '▶▶' },
        { spd: 3, label: '▶▶▶' },
      ].map(({ spd, label }) => h('button', {
        class: `gr-speed-btn ${currentSpeed === spd ? 'active' : ''}`.trim(),
        dataset: { speed: String(spd) },
        onclick: (e) => {
          ctx?.setSpeed?.(spd);
          const parent = e.currentTarget.parentElement;
          if (parent) {
            parent.querySelectorAll('.gr-speed-btn[data-speed]').forEach((b) => {
              b.classList.toggle('active', b.dataset.speed === String(spd));
            });
          }
        },
      }, label)),
      h('button', {
        class: 'gr-speed-btn',
        title: L('Paramètres', 'Settings'),
        onclick: () => ctx?.openSettings?.(),
      }, '❚❚')),
    h('div', { class: 'gr-speed-label' }, L('VITESSE DE COMBAT', 'BATTLE SPEED')));

  // 4. Left-Edge Vertical Inventory Strip (chest toggle + 7 square item slots)
  const invItems = vm.inventory || [];
  const invSlots = [];
  for (let i = 0; i < Math.max(7, invItems.length); i++) {
    const it = invItems[i];
    const equipOrSellFromInv = (e) => {
      if (!ctx || !it) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      hideTooltip();
      if (ctx.shopSellMode && vm.phase === 'shop') {
        ctx.shopSellMode = false;
        ctx.call('sellItem', it.uid ?? it.itemId);
        return;
      }
      const target = findBestHeroForItem(ctx, vm);
      if (target) {
        equipItemOnHero(ctx, it.uid ?? it.itemId, target.uid);
      }
    };
    invSlots.push(itemSlot(ctx, it, {
      draggable: Boolean(it),
      small: true,
      cls: 'gr-inv-slot',
      title: it ? L('Cliquez pour équiper sur un Héros (ou glissez sur un Héros)', 'Click to equip on Hero (or drag onto a Hero)') : null,
      onClick: it ? equipOrSellFromInv : null,
      onContextMenu: it ? equipOrSellFromInv : null,
    }));
  }
  const invStrip = h('div', { class: 'gr-inv-strip' }, invSlots);
  const leftInv = h('div', { class: 'gr-core-left-inv' },
    h('button', {
      class: 'gr-inv-toggle',
      title: t('ui.inventory') || L('Inventaire', 'Inventory'),
      onclick: () => { invStrip.style.display = invStrip.style.display === 'none' ? 'flex' : 'none'; },
    }, img(SPR.invIcon)),
    invStrip);
  if (ctx) {
    makeDropTarget(
      leftInv,
      (p) => p.kind === 'item' && p.fromHero != null,
      (p) => unequipItemFromHero(ctx, p.uid ?? p.itemId, p.fromHero),
    );
  }

  // 5. Right-Edge Damage Tracker Panel (chart toggle + 3 tabs + DAMAGE DEALT rows)
  const dmgRowsContainer = h('div', { class: 'gr-tracker-rows', dataset: { dmgRows: '1' } });
  const trackerTitle = h('div', { class: 'gr-tracker-title' }, L('DÉGÂTS INFLIGÉS', 'DAMAGE DEALT'));
  const trackerPanel = h('div', { class: 'gr-tracker-panel' },
    h('div', { class: 'gr-tracker-tabs' },
      h('button', {
        class: 'gr-tracker-tab active',
        dataset: { tab: 'dealt' },
        onclick: (e) => {
          trackerTitle.textContent = L('DÉGÂTS INFLIGÉS', 'DAMAGE DEALT');
          e.currentTarget.parentElement.querySelectorAll('.gr-tracker-tab').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
        },
      }, img(SPR.dmgIcon, { style: { width: '16px', height: '16px', objectFit: 'contain' } })),
      h('button', {
        class: 'gr-tracker-tab',
        dataset: { tab: 'taken' },
        onclick: (e) => {
          trackerTitle.textContent = L('DÉGÂTS BLOQUÉS', 'DAMAGE MITIGATED');
          e.currentTarget.parentElement.querySelectorAll('.gr-tracker-tab').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
        },
      }, img(SPR.shieldIcon, { style: { width: '16px', height: '16px', objectFit: 'contain' } })),
      h('button', {
        class: 'gr-tracker-tab',
        dataset: { tab: 'healed' },
        onclick: (e) => {
          trackerTitle.textContent = L('SOINS PRODIGUÉS', 'HEALING DONE');
          e.currentTarget.parentElement.querySelectorAll('.gr-tracker-tab').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
        },
      }, img(SPR.healIcon, { style: { width: '16px', height: '16px', objectFit: 'contain' } }))),
    trackerTitle,
    dmgRowsContainer);

  const rightTracker = h('div', { class: 'gr-core-right-tracker' },
    h('button', {
      class: 'gr-tracker-toggle',
      title: L('Compteur de dégâts', 'Damage Tracker'),
      onclick: () => { trackerPanel.style.display = trackerPanel.style.display === 'none' ? 'flex' : 'none'; },
    }, img(SPR.trackerIcon)),
    trackerPanel);

  // 6. Bottom-Center Party & Reserve Bar (PARTY + 3 slots | 3 reserve slots + RESERVE)
  const partyHeroes = (vm.heroes || []).filter((u) => u.onBoard);
  const reserveHeroes = (vm.heroes || []).filter((u) => !u.onBoard);
  const partyCount = Math.max(3, Number(vm.maxTeamSize ?? vm.maxOnBoard ?? vm.maxHeroesOnBoard) || 3);
  const partySlots = Array.from({ length: partyCount }, (_, i) => buildPartySlot(ctx, vm, partyHeroes[i] || null, false));
  const reserveSlots = [0, 1, 2].map((i) => buildPartySlot(ctx, vm, reserveHeroes[i] || null, true));

  const partySlotsEl = h('div', { class: 'gr-party-slots' }, partySlots);
  const reserveSlotsEl = h('div', { class: 'gr-reserve-slots' }, reserveSlots);
  const reserveLabelEl = h('div', { class: 'gr-reserve-label' }, L('RÉSERVE', 'RESERVE'));

  if (ctx) {
    makeDropTarget(
      reserveSlotsEl,
      (p) => p.kind === 'hero',
      (p) => ctx.call('benchHero', p.uid),
    );
    makeDropTarget(
      reserveLabelEl,
      (p) => p.kind === 'hero',
      (p) => ctx.call('benchHero', p.uid),
    );
    makeDropTarget(
      partySlotsEl,
      (p) => p.kind === 'hero',
      (p) => {
        const cell = findFreePlayerCell(vm);
        ctx.call('placeHero', p.uid, cell.x, cell.y);
      },
    );
  }

  const bottomParty = h('div', { class: 'gr-core-bottom-party' },
    h('div', { class: 'gr-party-label' }, L('ÉQUIPE', 'PARTY')),
    partySlotsEl,
    h('div', { class: 'gr-party-divider' }),
    reserveSlotsEl,
    reserveLabelEl);

  // 7. Bottom-Left Synergy / Class Counters + Difficulty & Bonus Tokens
  const diffNames = ['BASE', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  const diffLabel = diffNames[Number(vm.difficulty)] || 'SSS';
  const bottomLeft = h('div', { class: 'gr-core-bottom-left' },
    synergyPanel(vm, { cls: 'gr-hud-synergy-panel' }),
    h('div', { class: 'gr-core-diff-label' }, `${L('DIFFICULTÉ', 'DIFFICULTY')}: ${diffLabel}`),
    h('div', { class: 'gr-bonus-tokens-box' },
      [0, 1, 2, 3].map(() => img(SPR.bossTokenAvail, { class: 'gr-bonus-token-icon' }))));

  // 8. Bottom-Right Feedback + Compendium + Settings
  const bottomRight = h('div', { class: 'gr-core-bottom-right' },
    h('div', { class: 'gr-feedback-box' }, L('Avis (Entrée)', 'Feedback (Enter)')),
    h('button', {
      class: 'gr-util-btn',
      title: t('ui.compendium') || L('Codex', 'Compendium'),
      onclick: () => ctx?.openCompendium?.(),
    }, img(SPR.heroIcon)),
    h('button', {
      class: 'gr-util-btn',
      title: t('ui.settings') || L('Paramètres', 'Settings'),
      onclick: () => ctx?.openSettings?.(),
    }, img(SPR.settings)));

  const root = h('div', { class: 'gr-core-ui' },
    relicGroup,
    topBar,
    timerTab,
    speedControls,
    leftInv,
    rightTracker,
    bottomParty,
    bottomLeft,
    bottomRight);

  updateDamageTracker(root, opts.damageRows || [], partyHeroes);
  return root;
}

export const coreGameFrame = hud;
