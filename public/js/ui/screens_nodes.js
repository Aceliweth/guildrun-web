// Shop & SuperShop (Screenshot 6 1:1), Crossroads 3-Gates scene, Narrative Event, and Campfire screens.
import { t, txt, statName, getLang, getGameData } from '../data.js';
import { audio } from '../audio.js';
import { h, img } from './dom.js';
import {
  SPR, heroPortrait, itemIcon, relicIcon, classIcon, rankBadge, rankLetter, rarityLetter, statIcon, relicFrame,
} from './assets.js';
import { richText, fmtNum } from './richtext.js';
import {
  hud, heroCard, itemSlot, relicSlot, makeDropTarget,
  equipItemOnHero, unequipItemFromHero, computeBoardClassCounts,
} from './components.js';
import { attachTooltip, itemTooltip, relicTooltip, heroTooltip, classTooltip, hideTooltip } from './tooltip.js';
import {
  maybeShowRankUpModal, maybeShowRelicPickerModal, resolveStageComposite, ensureInRunStyles, buildPrimaryButton,
} from './screens_board.js';

const isFr = () => getLang() === 'fr';
const L = (fr, en) => (getLang() === 'fr' ? fr : en);

function nameOf(o) {
  if (!o) return '';
  return (o.nameKey && txt(o.nameKey) !== o.nameKey) ? txt(o.nameKey) : txt(o.name);
}
function descOf(o) {
  if (!o) return '';
  return (o.descriptionKey && txt(o.descriptionKey) !== o.descriptionKey) ? txt(o.descriptionKey) : txt(o.description);
}
function valuesOf(o) {
  return o && (o.values ?? o.descriptionVars ?? o.descriptionValues ?? o.params ?? o.parameters ?? o.textVars ?? o.textValues);
}

const SHARD_ICON = './assets/sprites/traits_stats/Shard_S.png';

// ---------------- Shop & SuperShop (Screenshot 6 1:1) ----------------
export function renderShop(ctx, vm) {
  ensureInRunStyles();
  hideTooltip();
  const d = getGameData();
  const shop = vm.shop || { heroes: [], items: [], relics: [], rerollCost: 1, frozen: false };
  const ownedHeroIds = new Set((vm.heroes || []).map((hh) => Number(hh.heroId)));
  const bgUrl = resolveStageComposite(vm.stage, vm.act);
  const rerollCost = shop.rerollCost ?? 1;

  // 1. Top Bar: REROLL SHOP | FREEZE SHOP | DROP HERE TO SELL | PROCEED
  const rerollBtn = h('button', {
    class: 'gr-shop-btn',
    disabled: (vm.shards ?? 0) < rerollCost,
    onclick: () => {
      audio.playSfx('ui.reroll');
      ctx.call('reroll');
    },
  },
    img('./assets/sprites/ui/RerollIcon.png', { class: 'gr-shop-btn-icon' }, SPR.reroll),
    h('span', { class: 'gr-shop-btn-lbl' }, L('RELANCER', 'REROLL SHOP')),
    h('span', { class: 'gr-shop-btn-cost' },
      img(SHARD_ICON, { class: 'gr-shard-inline' }, SPR.shard),
      String(rerollCost)
    )
  );

  const freezeBtn = h('button', {
    class: `gr-shop-btn ${shop.frozen ? 'is-active' : ''}`,
    onclick: () => {
      audio.playSfx(shop.frozen ? 'ui.unfreeze' : 'ui.freeze');
      ctx.call('freeze');
    },
  },
    img('./assets/sprites/ui/FreezeIcon.png', { class: 'gr-shop-btn-icon' }, SPR.freeze),
    h('span', { class: 'gr-shop-btn-lbl' }, shop.frozen ? L('DÉGELER', 'UNFREEZE SHOP') : L('GELER', 'FREEZE SHOP'))
  );

  const sellZone = h('div', {
    class: `gr-shop-sell-zone ${ctx.shopSellMode ? 'is-sell-mode' : ''}`,
    title: L(
      'Glissez un Héros ou Objet ici pour le vendre contre des Éclats, ou cliquez pour activer le Mode Vente',
      'Drag a Hero or Item here to sell it for Shards, or click to toggle Sell Mode',
    ),
    onclick: (e) => {
      e.stopPropagation();
      ctx.shopSellMode = !ctx.shopSellMode;
      audio.playSfx('ui.click');
      ctx.rerender();
    },
  },
    img('./assets/sprites/ui/SellButton_BottomLayer.png', { class: 'gr-sell-bg' }),
    img('./assets/sprites/ui/SellButton_TopLayer.png', { class: 'gr-sell-bg' }),
    h('div', { class: 'gr-sell-hex-wrap' },
      img('./assets/sprites/ui/SellButton_IconFrame.png', { class: 'gr-sell-hex-frame' }),
      img('./assets/sprites/ui/SellIcon.png', { class: 'gr-sell-hex-icon' }, SPR.sell)
    ),
    h('span', { class: 'gr-sell-label' }, ctx.shopSellMode ? L('MODE VENTE : CLIQUEZ HÉROS/OBJET', 'SELL MODE: CLICK HERO/ITEM') : L('DÉPOSEZ ICI POUR VENDRE', 'DROP HERE TO SELL'))
  );

  makeDropTarget(sellZone, (p) => p.kind === 'hero' || p.kind === 'item', (p) => {
    audio.playSfx('ui.sell');
    ctx.shopSellMode = false;
    if (p.kind === 'hero') {
      ctx.call('sellHero', p.uid);
    } else if (p.kind === 'item') {
      const sellUid = p.uid ?? p.itemId;
      if (p.fromHero != null) {
        unequipItemFromHero(ctx, sellUid, p.fromHero);
      }
      ctx.call('sellItem', sellUid);
    }
  });

  const proceedBtn = buildPrimaryButton(
    L('CONTINUER', 'PROCEED'),
    () => {
      ctx.shopSellMode = false;
      audio.playSfx('ui.click');
      ctx.leaveShop();
    },
    'gr-btn-primary gr-shop-proceed-btn'
  );

  const topBar = h('div', { class: 'gr-shop-topbar' },
    h('div', { class: 'gr-shop-top-left' },
      rerollBtn,
      freezeBtn,
      sellZone
    ),
    proceedBtn
  );

  // 2. Left Column: ITEMS (2 rows) & RELICS (1 row)
  const itemSlots = (shop.items || []).slice(0, 2);
  while (itemSlots.length < 2) itemSlots.push({ empty: true });

  const itemRows = itemSlots.map((slot, i) => {
    if (slot.empty || !slot.id) {
      return h('div', { class: 'gr-shop-offer-row is-item is-sold' },
        h('div', { class: 'gr-shop-offer-left' },
          h('div', { class: 'gr-shop-icon-box' },
            img('./assets/sprites/ui/UI_ItemFrame.png', { class: 'gr-shop-slot-frame' })
          ),
          h('div', { class: 'gr-shop-offer-price muted' }, L('VENDU', 'SOLD'))
        ),
        h('div', { class: 'gr-shop-offer-textbox' },
          h('span', { class: 'muted' }, L('VENDU', 'SOLD'))
        )
      );
    }

    const def = d?.items?.[slot.id] || {};
    const price = slot.price ?? 6;
    const canAfford = (vm.shards ?? 0) >= price && !slot.sold;

    const buyThisItem = () => {
      if (!slot.sold && canAfford) {
        audio.playSfx('ui.buy');
        ctx.call('buyItem', slot.slot ?? i);
      }
    };

    const mods = Array.isArray(def.statMods) ? def.statMods : [];
    const itemDesc = descOf(def);
    const statLines = [
      ...mods.slice(0, 2).map((m) =>
        h('div', { class: 'gr-shop-stat-line' },
          img(statIcon(m.stat), { class: 'gr-shop-stat-ic' }),
          h('span', { class: 'gr-shop-stat-val' }, `+${fmtNum(m.value)}${m.percent ? '%' : ''}`),
          h('span', { class: 'gr-shop-stat-name' }, statName(m.stat))
        )
      ),
      itemDesc
        ? h('div', {
            class: 'gr-shop-stat-desc',
            html: richText(itemDesc, { values: valuesOf(def) }),
          })
        : (!mods.length
            ? h('div', {
                class: 'gr-shop-stat-desc',
                html: richText(nameOf(def), { values: valuesOf(def) }),
              })
            : null),
    ].filter(Boolean);

    // Mini party hero round portraits along the bottom of the item textbox (Screenshot 6)
    const partyMiniRow = h('div', { class: 'gr-shop-item-heroes' },
      (vm.heroes || []).slice(0, 6).map((hh) => {
        const eqCount = Array.isArray(hh.items) ? hh.items.length : 0;
        const maxSlots = Math.max(1, Math.min(6, Number(hh.maxItemSlots || hh.rank || 1)));
        const hasFreeSlot = eqCount < maxSlots;
        const heroDef = d?.heroes?.[hh.heroId];
        const heroLbl = nameOf(heroDef) || L('Héros', 'Hero');
        const dots = [];
        for (let s = 0; s < maxSlots; s++) {
          dots.push(h('span', { class: `gr-shop-mini-dot ${s < eqCount ? 'is-filled' : ''}` }));
        }
        const miniEl = h('div', {
          class: `gr-shop-mini-hero ${!hasFreeSlot ? 'is-full' : ''}`,
          title: !slot.sold && canAfford
            ? (hasFreeSlot
                ? L(`Cliquez pour acheter et équiper sur ${heroLbl} (${eqCount}/${maxSlots})`, `Click to buy & equip on ${heroLbl} (${eqCount}/${maxSlots} slots)`)
                : L(`Emplacements d'objets pleins pour ${heroLbl} (${eqCount}/${maxSlots})`, `${heroLbl}'s item slots are full (${eqCount}/${maxSlots})`))
            : `${heroLbl} (${eqCount}/${maxSlots})`,
          onclick: (e) => {
            e.stopPropagation();
            if (slot.sold || !canAfford) return;
            audio.playSfx('ui.buy');
            const prevInvUids = new Set(
              (vm.inventory || []).map((it) => String(typeof it === 'object' ? (it.uid ?? it.itemId) : it))
            );
            const nextState = ctx.call('buyItem', slot.slot ?? i, { heroUid: hh.uid });
            if (hasFreeSlot) {
              const invList = nextState?.inventory || [];
              const newlyBought = invList.find((it) => {
                const u = String(typeof it === 'object' ? (it.uid ?? it.itemId) : it);
                return !prevInvUids.has(u) && Number(typeof it === 'object' ? (it.itemId ?? it.id) : it) === Number(slot.id);
              }) || invList[invList.length - 1];
              if (newlyBought) {
                const boughtUid = typeof newlyBought === 'object' ? (newlyBought.uid ?? newlyBought.itemId ?? newlyBought.id) : newlyBought;
                audio.playSfx('ui.equip');
                equipItemOnHero(ctx, boughtUid, hh.uid);
              }
            }
          },
        },
          img(heroPortrait(hh.heroId, 'round', hh.rank), { class: 'gr-shop-mini-avatar' }),
          h('div', { class: 'gr-shop-mini-dots' }, dots)
        );
        attachTooltip(miniEl, () => heroTooltip(hh.heroId, hh));
        return miniEl;
      })
    );

    const rowEl = h('div', {
      class: `gr-shop-offer-row is-item ${slot.sold ? 'is-sold' : ''} ${!canAfford && !slot.sold ? 'cant-afford' : ''}`,
      onclick: buyThisItem,
    },
      h('div', { class: 'gr-shop-offer-left' },
        h('div', { class: 'gr-shop-icon-box' },
          img('./assets/sprites/ui/UI_ItemFrame.png', { class: 'gr-shop-slot-frame' }),
          img(itemIcon(slot.id), { class: 'gr-shop-slot-icon' })
        ),
        h('div', { class: 'gr-shop-offer-price' },
          slot.sold
            ? L('VENDU', 'SOLD')
            : [
                img(SHARD_ICON, { class: 'gr-shard-inline' }, SPR.shard),
                String(price),
              ]
        )
      ),
      h('div', { class: 'gr-shop-offer-textbox' },
        h('div', { class: 'gr-shop-item-stats' }, statLines),
        partyMiniRow
      )
    );

    attachTooltip(rowEl, () => itemTooltip(slot.id));
    return rowEl;
  });

  // RELICS (1 row in standard shop, up to 2 in super shop)
  const relicSlots = (shop.relics || []).length ? shop.relics.slice(0, 2) : [{ empty: true }];
  const relicRows = relicSlots.map((slot, i) => {
    if (slot.empty || !slot.id) {
      return h('div', { class: 'gr-shop-offer-row is-relic is-sold' },
        h('div', { class: 'gr-shop-offer-left' },
          h('div', { class: 'gr-shop-icon-box' },
            img('./assets/sprites/ui/RelicFrame_C.png', { class: 'gr-shop-slot-frame' })
          ),
          h('div', { class: 'gr-shop-offer-price muted' }, L('VENDU', 'SOLD'))
        ),
        h('div', { class: 'gr-shop-offer-textbox' },
          h('span', { class: 'muted' }, L('VENDU', 'SOLD'))
        )
      );
    }

    const def = d?.relics?.[slot.id] || {};
    const price = slot.price ?? 9;
    const canAfford = (vm.shards ?? 0) >= price && !slot.sold;

    const buyThisRelic = () => {
      if (!slot.sold && canAfford) {
        audio.playSfx('ui.buy_relic');
        ctx.call('buyRelic', slot.slot ?? i);
      }
    };

    const rowEl = h('div', {
      class: `gr-shop-offer-row is-relic ${slot.sold ? 'is-sold' : ''} ${!canAfford && !slot.sold ? 'cant-afford' : ''}`,
      onclick: buyThisRelic,
    },
      h('div', { class: 'gr-shop-offer-left' },
        h('div', { class: 'gr-shop-icon-box' },
          img(relicFrame(def?.rarity), { class: 'gr-shop-slot-frame' }),
          img(relicIcon(slot.id), { class: 'gr-shop-slot-icon' }, SPR.relicGeneric)
        ),
        h('div', { class: 'gr-shop-offer-price' },
          slot.sold
            ? L('VENDU', 'SOLD')
            : [
                img(SHARD_ICON, { class: 'gr-shard-inline' }, SPR.shard),
                String(price),
              ]
        )
      ),
      h('div', { class: 'gr-shop-offer-textbox is-relic-box' },
        h('div', {
          class: 'gr-shop-relic-desc',
          html: richText(descOf(def) || nameOf(def), { values: valuesOf(def) }),
        })
      )
    );

    attachTooltip(rowEl, () => relicTooltip(slot.id));
    return rowEl;
  });

  // 3. Right Area: HEROES (3 tall pentagonal hero cards with top-right Shard price + SALE badge)
  const heroOfferSlots = (shop.heroes || []).slice(0, 3);
  const heroCards = heroOfferSlots.map((slot, i) => {
    if (slot.empty || !slot.id) {
      return h('div', { class: 'gr-shop-hero-col is-empty' },
        h('div', { class: 'hero-card sold empty-slot' },
          h('div', { class: 'card-sold' }, L('VENDU', 'SOLD'))
        )
      );
    }

    const price = slot.price ?? 3;
    const canAfford = (vm.shards ?? 0) >= price && !slot.sold;
    const isDuplicate = ownedHeroIds.has(Number(slot.id));
    const isOnSale = !!(slot.onSale || slot.sale || slot.discounted || price <= 2);

    const buyThisHero = () => {
      if (!slot.sold && canAfford) {
        audio.playSfx('ui.buy');
        if (slot.id != null) audio.playSfx(`vo.${slot.id}.buy`);
        ctx.call('buyHero', slot.slot ?? i);
      }
    };

    const saleBadge = isOnSale && !slot.sold
      ? h('div', { class: 'gr-shop-sale-badge' },
          img('./assets/sprites/ui/SaleBox.png', { class: 'gr-shop-sale-bg' }),
          h('span', { class: 'gr-shop-sale-txt' }, L('PROMO', 'SALE'))
        )
      : null;

    const dupBadge = isDuplicate && !slot.sold
      ? h('div', { class: 'gr-shop-merge-pill' }, L('⬆ PROMOTION', '⬆ RANK UP'))
      : null;

    const cardEl = heroCard(slot.id, {
      rank: slot.rank,
      price,
      sold: slot.sold,
      frozen: slot.frozen || shop.frozen,
      cls: `gr-shop-hero-card ${!canAfford && !slot.sold ? 'cant-afford' : ''}`,
      footer: h('div', { class: 'gr-shop-card-overlays' }, saleBadge, dupBadge),
      onClick: buyThisHero,
    });

    return h('div', { class: 'gr-shop-hero-col' }, cardEl);
  });

  // Compact active class counters bar in the Shop header
  const classCounts = computeBoardClassCounts(vm);
  const activeSynergyChips = Object.values(d?.classes || {})
    .map((cls) => ({ cls, count: classCounts.get(String(cls.id)) || classCounts[cls.id] || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(({ cls, count }) => {
      const tiers = (cls.tiers || []).map((ti) => ti.requiredCount ?? ti.count);
      const activeTier = tiers.filter((n) => count >= n).pop() || 0;
      const chip = h('div', {
        class: `synergy-row ${activeTier ? 'active' : ''}`,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 7px',
          borderRadius: '6px',
          background: activeTier ? 'rgba(251, 191, 36, 0.16)' : 'rgba(15, 23, 42, 0.75)',
          border: activeTier ? '1px solid rgba(251, 191, 36, 0.55)' : '1px solid rgba(148, 163, 184, 0.25)',
          fontSize: '11px',
          color: activeTier ? '#fde68a' : '#cbd5e1',
          cursor: 'help',
        },
      },
        img(classIcon(cls.id), { style: { width: '15px', height: '15px', objectFit: 'contain' } }),
        h('span', { style: { fontWeight: '700' } }, nameOf(cls)),
        h('span', { style: { opacity: '0.85' } }, `${count}/${tiers[0] || 2}`));
      attachTooltip(chip, () => classTooltip(cls.id, count));
      return chip;
    });

  const shopWindow = h('div', { class: 'gr-shop-window' },
    img('./assets/sprites/backgrounds/Shop_WindowBackground_Deco.png', { class: 'gr-shop-deco-watermark', alt: '' }),
    topBar,
    h('div', { class: 'gr-shop-body' },
      h('div', { class: 'gr-shop-left-col' },
        h('div', { class: 'gr-shop-sec' },
          h('div', { class: 'gr-shop-sec-title' }, L('OBJETS', 'ITEMS')),
          h('div', { class: 'gr-shop-offers-stack' }, itemRows)
        ),
        h('div', { class: 'gr-shop-sec' },
          h('div', { class: 'gr-shop-sec-title' }, L('RELIQUES', 'RELICS')),
          h('div', { class: 'gr-shop-offers-stack' }, relicRows)
        )
      ),
      h('div', { class: 'gr-shop-heroes-area' },
        h('div', {
          class: 'gr-shop-sec-title',
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' },
        },
          h('span', null, L('HÉROS', 'HEROES')),
          activeSynergyChips.length
            ? h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' } }, activeSynergyChips)
            : null
        ),
        h('div', { class: 'gr-shop-heroes-row' }, heroCards)
      )
    )
  );

  const screen = h('div', {
    class: 'screen screen-shop gr-placement-screen',
    style: { backgroundImage: `url('${bgUrl}')` },
  },
    hud(ctx, vm),
    h('div', { class: 'gr-shop-overlay-wrap' }, shopWindow)
  );

  queueMicrotask(() => {
    maybeShowRelicPickerModal(ctx, vm);
    maybeShowRankUpModal(ctx, vm);
  });
  return screen;
}

// ---------------- Crossroads (Unity CrossroadsScene 3 Gates) ----------------
function localizeGateType(type) {
  const tLow = String(type || '').toLowerCase();
  if (tLow.includes('camp')) return L('FEU DE CAMP', 'CAMPFIRE');
  if (tLow.includes('stagemodifier') || tLow.includes('challenge')) return L('DÉFI', 'CHALLENGE');
  if (tLow.includes('event')) return L('ÉVÉNEMENT', 'EVENT');
  if (tLow.includes('fight') || tLow.includes('combat') || tLow.includes('stage')) return L('COMBAT', 'COMBAT');
  return String(type || '').toUpperCase();
}

function localizeGateTitle(rawTitle, evDef, crDef, type) {
  if (evDef) {
    const evName = nameOf(evDef);
    if (evName) return evName;
  }
  if (crDef) {
    const crName = nameOf(crDef);
    if (crName) return crName;
  }
  const s = String(rawTitle || '').trim();
  const up = s.toUpperCase();
  if (up === 'COMBAT' || up === 'STAGE') return L('Combat', 'Combat');
  if (up === 'CAMPFIRE') return L('Feu de Camp', 'Campfire');
  if (up === 'MYSTERY EVENT' || up === 'RIFT EVENT') return L('Événement de la Faille', 'Rift Event');
  if (up === 'RELIC VAULT') return L('Sanctuaire de Relique', 'Relic Vault');
  if (up === 'ITEM CACHE') return L('Cachette d\'Objets', 'Item Cache');
  if (up === 'STAGE CHALLENGE') return L('Défi de Combat', 'Stage Challenge');
  return txt(s) || localizeGateType(type);
}

function localizeGateSubtitle(sub) {
  const s = String(sub || '').trim();
  if (!s) return '';
  if (s === 'Standard Encounter') return L('Combat Standard', 'Standard Encounter');
  if (s === 'Rest & Train') return L('Repos & Entraînement', 'Rest & Train');
  return txt(s);
}

export function renderCrossroads(ctx, vm) {
  ensureInRunStyles();
  const d = getGameData();
  let choices = vm.crossroads || [];
  if (!choices.length && vm.raw?.choices) choices = vm.raw.choices;
  if (!choices.length) {
    choices = [
      { stageType: 'Combat', title: L('COMBAT', 'COMBAT'), description: L('Affrontez des monstres pour gagner des Éclats.', 'Fight monsters to earn Shards.') },
      { stageType: 'Event', title: L('ÉVÉNEMENT MYSTÈRE', 'MYSTERY EVENT'), description: L('Découvrez un phénomène étrange dans la forêt.', 'Encounter a strange occurrence in the forest.') },
      { stageType: 'Campfire', title: L('FEU DE CAMP', 'CAMPFIRE'), description: L('Reposez, entraînez ou spécialisez vos Héros.', 'Rest, train, or specialize one of your Heroes.') },
    ];
  }

  // Arch openings measured on the 1920x1080 RuinsForest composite (percent of width / height):
  // cx/cy = centre of the arch opening (portal), base = ground line below the arch (tooltip top).
  const gateAnchors = [
    { cx: 33.2, cy: 31.5, base: 43.0 },
    { cx: 53.1, cy: 29.0, base: 41.0 },
    { cx: 72.2, cy: 38.5, base: 53.5 },
  ];

  const gates = choices.slice(0, 3).flatMap((c, idx) => {
    const isObj = c && typeof c === 'object';
    const crDef = isObj && c.crossroadsId
      ? d?.crossroads?.[c.crossroadsId]
      : !isObj && d?.crossroads?.[c]
      ? d.crossroads[c]
      : null;
    const evId = isObj
      ? (c.eventId ?? crDef?.paths?.[0]?.eventId ?? (d?.events?.[c.id] ? c.id : null))
      : (d?.events?.[c] ? c : crDef?.paths?.[0]?.eventId);
    const evDef = evId != null ? d?.events?.[evId] : null;
    const type = String(
      isObj
        ? (c.stageType || c.pathType || c.type || (evDef ? 'Event' : 'Combat'))
        : (evDef ? 'Event' : 'Path')
    );

    const title = localizeGateTitle(isObj ? (c.title || c.name) : '', evDef, crDef, type);

    const evCrDesc = evDef?.crossroadsDescriptionKey && txt(evDef.crossroadsDescriptionKey) !== evDef.crossroadsDescriptionKey
      ? txt(evDef.crossroadsDescriptionKey)
      : txt(evDef?.crossroadsDescription || evDef?.text || '');

    const desc = (evDef && evCrDesc)
      ? evCrDesc
      : (isObj && (c.crossroadsDescription || c.description || c.text)
          ? txt(c.crossroadsDescription || c.description || c.text)
          : '')
        || evCrDesc
        || L(`Continuer vers ${title}.`, `Proceed to ${title}.`);

    const tLow = type.toLowerCase();
    const iconUrl = (isObj && c.icon)
      || evDef?.icon
      || (tLow.includes('camp')
        ? SPR.campfire
        : tLow.includes('stagemodifier') || tLow.includes('challenge')
        ? SPR.artifactIcon
        : tLow.includes('fight') || tLow.includes('combat') || tLow.includes('stage')
        ? SPR.fightIcon
        : tLow.includes('artifact') || tLow.includes('relic')
        ? SPR.artifactIcon
        : SPR.eventIcon);

    const a = gateAnchors[idx] || gateAnchors[gateAnchors.length - 1];
    const choose = () => {
      audio.playSfx('ui.click');
      ctx.call('chooseCrossroads', idx, c);
    };
    const setHover = (on) => {
      portal.classList.toggle('is-hover', on);
      box.classList.toggle('is-hover', on);
    };

    const portal = h('div', {
      class: 'gr-crossroads-gate gr-gate-portal',
      style: { left: `${a.cx}%`, top: `${a.cy}%` },
      onclick: choose,
      onmouseenter: () => setHover(true),
      onmouseleave: () => setHover(false),
    },
      h('div', { class: 'gr-gate-arch-glow' }),
      h('div', { class: 'gr-gate-header' },
        img(iconUrl, { class: 'gr-gate-icon' }, SPR.gateIcon),
        h('div', { class: 'gr-gate-title' }, title)));

    const richDescHtml = richText(desc, {
      values: isObj ? c.enemyRelicValues : undefined,
      vars: (isObj && c.crossroadsVars) || { amount: 15, stat: statName('Attack'), statbonus: 15, reliccount: 3, itemcount: 3 },
    });

    const typeChipText = localizeGateType(type);
    const subText = isObj && c.subtitle ? localizeGateSubtitle(c.subtitle) : '';

    const box = h('div', {
      class: 'gr-gate-tooltip-box gr-gate-anchored-box',
      style: { left: `${a.cx}%`, top: `${a.base}%` },
      onclick: choose,
      onmouseenter: () => setHover(true),
      onmouseleave: () => setHover(false),
    },
      h('div', { class: 'gr-gate-type-chip' },
        subText ? `${typeChipText} · ${subText}` : typeChipText
      ),
      h('div', { class: 'gr-gate-desc', html: richDescHtml }),
      h('div', { class: 'gr-gate-choose-hint' }, L('CLIQUER POUR ENTRER ▶', 'CLICK TO ENTER ▶')));

    if (isObj && c.enemyRelicId) {
      attachTooltip(portal, () => relicTooltip(c.enemyRelicId));
      attachTooltip(box, () => relicTooltip(c.enemyRelicId));
    }

    return [portal, box];
  });

  // The 3 arches are part of the forest composite itself; pick the time of day like the fight rooms.
  const bgUrl = resolveStageComposite({ ...(vm.stage || {}), stageType: 'Normal' }, vm.act);

  const screen = h('div', {
    class: 'screen screen-crossroads gr-placement-screen gr-crossroads-screen',
    style: { backgroundImage: `url('${bgUrl}')` },
  },
    hud(ctx, vm),
    h('div', { class: 'gr-crossroads-stage' },
      h('h1', { class: 'gr-crossroads-heading' }, L('CHOISISSEZ VOTRE CHEMIN', 'CHOOSE YOUR PATH')),
      gates
    )
  );
  queueMicrotask(() => {
    maybeShowRelicPickerModal(ctx, vm);
    maybeShowRankUpModal(ctx, vm);
  });
  return screen;
}

// ---------------- Narrative Events (Unity EventCanvas) ----------------
let selectedEventHeroUid = null;

export function renderEvent(ctx, vm) {
  ensureInRunStyles();
  hideTooltip();
  const d = getGameData();
  const rawEv = vm.event || {};
  const evId = typeof rawEv === 'object' ? (rawEv.eventId ?? rawEv.id) : rawEv;
  const evDef = evId != null ? d?.events?.[evId] : null;

  const title = nameOf(evDef)
    || (typeof rawEv === 'object' && (rawEv.title || rawEv.name) ? txt(rawEv.title || rawEv.name) : '')
    || t('ui.event');

  const evDefText = evDef?.textKey && txt(evDef.textKey) !== evDef.textKey
    ? txt(evDef.textKey)
    : txt(evDef?.text);
  const text = evDefText
    || (typeof rawEv === 'object' && (rawEv.text || rawEv.description) ? txt(rawEv.text || rawEv.description) : '')
    || '';

  const art = (typeof rawEv === 'object' && rawEv.image) || evDef?.image || SPR.eventPlaceholder;
  const choices = (typeof rawEv === 'object' && Array.isArray(rawEv.choices) && rawEv.choices.length)
    ? rawEv.choices
    : (evDef?.choices || []);

  if ((!selectedEventHeroUid || !vm.heroes.some((hh) => String(hh.uid) === String(selectedEventHeroUid))) && vm.heroes.length) {
    selectedEventHeroUid = vm.heroes[0].uid;
  }

  const choiceEls = choices.length
    ? choices.map((ch, idx) => {
        const chVars = ch.textVars || { rank: 'B', statbonus: 20, amount: 15, reliccount: 3, itemcount: 3 };
        const rawChTitle = (ch.titleKey && txt(ch.titleKey) !== ch.titleKey
          ? txt(ch.titleKey)
          : txt(ch.title || ch.label)) || `Option ${idx + 1}`;
        const rawChText = (ch.textKey && txt(ch.textKey) !== ch.textKey
          ? txt(ch.textKey)
          : txt(ch.text || ch.description)) || '';
        const disabled = !!ch.disabled || ch.available === false;

        let previewSlotEl = null;
        if (Array.isArray(ch.relicChoiceIds) && ch.relicChoiceIds.length > 0) {
          previewSlotEl = h('div', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '14px', flexShrink: '0' },
          },
            ch.relicChoiceIds.slice(0, 3).map((rId) =>
              h('div', {
                style: { transform: 'scale(0.9)', cursor: 'pointer' },
                title: L('Cliquez pour choisir cette Relique', 'Click to select this Relic'),
              }, relicSlot(rId, {
                tooltip: true,
                onClick: (e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  audio.playSfx('ui.buy_relic');
                  ctx.call('chooseEventOption', idx, {
                    heroUid: selectedEventHeroUid,
                    choice: ch,
                    pickedRelicId: rId,
                  });
                },
              }))
            )
          );
        } else if (ch.previewRelicId != null) {
          previewSlotEl = h('div', { style: { marginLeft: '14px', flexShrink: '0', transform: 'scale(0.92)' } },
            relicSlot(ch.previewRelicId, { tooltip: false })
          );
        } else if (Array.isArray(ch.itemChoiceIds) && ch.itemChoiceIds.length > 0) {
          previewSlotEl = h('div', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '14px', flexShrink: '0' },
          },
            ch.itemChoiceIds.slice(0, 3).map((itId) =>
              h('div', {
                style: { transform: 'scale(0.9)', cursor: 'pointer' },
                title: L('Cliquez pour choisir cet Objet', 'Click to select this Item'),
              }, itemSlot(itId, {
                tooltip: true,
                onClick: (e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  audio.playSfx('ui.buy');
                  ctx.call('chooseEventOption', idx, {
                    heroUid: selectedEventHeroUid,
                    choice: ch,
                    pickedItemId: itId,
                  });
                },
              }))
            )
          );
        } else if (ch.previewItemId != null) {
          previewSlotEl = h('div', { style: { marginLeft: '14px', flexShrink: '0', transform: 'scale(0.92)' } },
            itemSlot(ch.previewItemId, { tooltip: false })
          );
        }

        const btn = h('button', {
          class: 'gr-event-choice-btn',
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left',
            gap: '12px',
          },
          disabled,
          onclick: () => {
            audio.playSfx('ui.click');
            ctx.call('chooseEventOption', idx, { heroUid: selectedEventHeroUid, choice: ch });
          },
        },
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('div', { class: 'gr-event-choice-head' },
              h('strong', {
                class: 'gr-event-choice-title',
                html: richText(rawChTitle, { values: ch.values, vars: chVars }),
              }),
              ch.cost
                ? h('span', { class: 'gr-shop-btn-cost' },
                    img(SHARD_ICON, { class: 'gr-shard-inline' }, SPR.shard),
                    String(ch.cost)
                  )
                : null
            ),
            rawChText
              ? h('div', {
                  class: 'gr-event-choice-desc',
                  html: richText(rawChText, { values: ch.values, vars: chVars }),
                })
              : null
          ),
          previewSlotEl
        );

        if (ch.previewRelicId != null && !(Array.isArray(ch.relicChoiceIds) && ch.relicChoiceIds.length > 1)) {
          attachTooltip(btn, () => relicTooltip(ch.previewRelicId));
        } else if (ch.previewItemId != null && !(Array.isArray(ch.itemChoiceIds) && ch.itemChoiceIds.length > 1)) {
          attachTooltip(btn, () => itemTooltip(ch.previewItemId));
        }
        return btn;
      })
    : [
        buildPrimaryButton(L('CONTINUER', 'CONTINUE'), () => {
          audio.playSfx('ui.click');
          ctx.call('chooseEventOption', 0);
        }),
      ];

  const heroTargetBar = vm.heroes.length
    ? h('div', { class: 'gr-event-hero-bar' },
        h('span', { class: 'gr-event-hero-lbl' }, L('HÉROS CIBLÉ :', 'TARGET HERO:')),
        h('div', { class: 'gr-event-hero-pills' },
          vm.heroes.map((hh) => {
            const def = d?.heroes?.[hh.heroId];
            const active = String(hh.uid) === String(selectedEventHeroUid);
            return h('button', {
              class: `gr-event-hero-pill ${active ? 'is-active' : ''}`,
              onclick: () => {
                selectedEventHeroUid = hh.uid;
                audio.playSfx('ui.click');
                ctx.rerender();
              },
            },
              img(heroPortrait(hh.heroId, 'round', hh.rank), { class: 'gr-event-pill-avatar' }),
              h('span', null, `${nameOf(def)} (${rankLetter(hh.rank)})`)
            );
          })
        )
      )
    : null;

  const bgUrl = resolveStageComposite(vm.stage, vm.act);
  const evVars = (typeof rawEv === 'object' && rawEv.textVars) || { amount: 15, stat: statName('Attack'), statbonus: 15, reliccount: 3, itemcount: 3 };
  const screen = h('div', {
    class: 'screen screen-event gr-placement-screen',
    style: { backgroundImage: `url('${bgUrl}')` },
  },
    hud(ctx, vm),
    h('div', { class: 'gr-shop-overlay-wrap' },
      h('div', { class: 'gr-event-window' },
        h('div', { class: 'gr-event-art-col' },
          h('div', { class: 'gr-event-art-frame' },
             img(art, { class: 'gr-event-artwork' }, SPR.eventPlaceholder)
          )
        ),
        h('div', { class: 'gr-event-text-col' },
          h('h1', { class: 'gr-event-title' }, title),
          text ? h('div', { class: 'gr-event-story', html: richText(text, { vars: evVars }) }) : null,
          heroTargetBar,
          h('div', { class: 'gr-event-choices' }, choiceEls)
        )
      )
    )
  );

  queueMicrotask(() => {
    maybeShowRelicPickerModal(ctx, vm);
    maybeShowRankUpModal(ctx, vm);
  });
  return screen;
}

// ---------------- Campfire (Unity EventCanvas) ----------------
let selectedCampHeroUid = null;

export function renderCampfire(ctx, vm) {
  ensureInRunStyles();
  const d = getGameData();
  const camp = vm.campfire || {};
  if (vm.event && !vm.campfire) return renderEvent(ctx, vm);

  if ((!selectedCampHeroUid || !vm.heroes.some((hh) => String(hh.uid) === String(selectedCampHeroUid))) && vm.heroes.length) {
    selectedCampHeroUid = vm.heroes[0].uid;
  }

  const actionsLeft = camp.remainingActions ?? camp.actionsLeft ?? 1;
  const rawOptions = Array.isArray(camp.choices || camp.options || camp.actions)
    ? (camp.choices || camp.options || camp.actions)
    : null;

  const defaultActions = [
    { id: 'train', index: 0, title: L('S\'ENTRAÎNER', 'TRAIN'), desc: L('Promouvoir un Héros au rang supérieur (C → B → A).', 'Rank up a Hero (C → B → A).') },
    { id: 'study', index: 1, title: L('ÉTUDIER', 'STUDY'), desc: L('Choisir ou changer la spécialisation d\'un Héros.', 'Choose or retrain a Hero specialization.') },
    { id: 'recharge', index: 2, title: L('RECHARGER', 'RECHARGE'), desc: L('Restaurer votre Stabilisateur d\'urgence (Éclats).', 'Restore your Emergency Rewind (Shard Stabilizer).') },
    { id: 'rest', index: 3, title: L('SE REPOSER', 'REST'), desc: L('+20% aux statistiques de base de vos Héros au prochain combat.', '+20% basic stats for your Heroes in the next combat.') },
    { id: 'skip', index: 4, title: L('CONTINUER', 'PROCEED'), desc: L('Quitter le feu de camp et poursuivre l\'expédition.', 'Leave the campfire and continue your run.') },
  ];

  const list = rawOptions
    ? rawOptions.map((o, i) => {
        if (typeof o !== 'object') {
          return { id: String(o), index: i, title: String(o), desc: '' };
        }
        const id = o.id || o.type || o.action || `opt_${i}`;
        let title = txt(o.title || o.name || o.label || o.type || `Action ${i + 1}`);
        let desc = txt(o.description || o.text || '');
        if (id === 'skip') {
          title = L('Quitter le Feu de Camp', 'Leave Campfire');
          desc = L('Poursuivre l\'expédition.', 'Continue the run.');
        }
        return {
          id,
          index: i,
          title,
          desc,
          disabled: !!o.disabled,
          raw: o,
        };
      })
    : defaultActions;

  const heroBar = vm.heroes.length
    ? h('div', { class: 'gr-event-hero-bar' },
        h('span', { class: 'gr-event-hero-lbl' }, L('CHOISISSEZ UN HÉROS :', 'SELECT HERO:')),
        h('div', { class: 'gr-event-hero-pills' },
          vm.heroes.map((hh) => {
            const def = d?.heroes?.[hh.heroId];
            const active = String(hh.uid) === String(selectedCampHeroUid);
            return h('button', {
              class: `gr-event-hero-pill ${active ? 'is-active' : ''}`,
              onclick: () => {
                selectedCampHeroUid = hh.uid;
                audio.playSfx('ui.click');
                ctx.rerender();
              },
            },
              img(heroPortrait(hh.heroId, 'round', hh.rank), { class: 'gr-event-pill-avatar' }),
              h('span', null, `${nameOf(def)} (${rankLetter(hh.rank)})`)
            );
          })
        )
      )
    : null;

  const bgUrl = resolveStageComposite(vm.stage, vm.act);
  const screen = h('div', {
    class: 'screen screen-campfire gr-placement-screen',
    style: { backgroundImage: `url('${bgUrl}')` },
  },
    hud(ctx, vm),
    h('div', { class: 'gr-shop-overlay-wrap' },
      h('div', { class: 'gr-event-window' },
        h('div', { class: 'gr-event-art-col' },
          h('div', { class: 'gr-event-art-frame' },
            img(SPR.campfireImage, { class: 'gr-event-artwork' }, SPR.campfire)
          )
        ),
        h('div', { class: 'gr-event-text-col' },
          h('div', { class: 'gr-campfire-head' },
            h('h1', { class: 'gr-event-title' }, L('FEU DE CAMP', 'CAMPFIRE')),
            h('span', { class: 'gr-campfire-actions-badge' }, `${L('ACTIONS RESTANTES', 'ACTIONS LEFT')}: ${actionsLeft}`)
          ),
          heroBar,
          h('div', { class: 'gr-event-choices' },
            list.map((act) =>
              h('button', {
                class: 'gr-event-choice-btn',
                disabled: act.disabled,
                onclick: () => {
                  audio.playSfx('ui.click');
                  ctx.callCampfire(act.id, act.index, selectedCampHeroUid, act.raw);
                },
              },
                h('strong', { class: 'gr-event-choice-title' }, act.title),
                act.desc ? h('div', { class: 'gr-event-choice-desc', html: richText(act.desc) }) : null
              )
            )
          )
        )
      )
    )
  );

  queueMicrotask(() => {
    maybeShowRelicPickerModal(ctx, vm);
    maybeShowRankUpModal(ctx, vm);
  });
  return screen;
}
