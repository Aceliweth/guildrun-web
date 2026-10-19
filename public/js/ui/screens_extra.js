// Compendium / Codex viewer modal and Sandbox Battle Builder screen.
import { t, txt, statName, getLang, getGameData } from '../data.js';
import { audio } from '../audio.js';
import { h, img, modal } from './dom.js';
import {
  SPR, heroPortrait, rankLetter, rankBadge, classIcon, guildBanner, itemIcon, relicIcon,
  abilityIcon, statIcon, enemyIcon, rarityName, rarityLetter,
} from './assets.js';
import { boardInfo, boardDims, hexCenter, mirrorEnemies } from './hex.js';
import { richText, fmtNum } from './richtext.js';
import { itemSlot, relicSlot, enemyToken } from './components.js';
import { attachTooltip, heroTooltip, itemTooltip, relicTooltip, enemyTooltip } from './tooltip.js';
import { renderBattle, renderEndRun } from './screens_battle.js';

export { renderEndRun };

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

// ---------------- Compendium / Codex Modal ----------------
export function openCompendiumModal() {
  const d = getGameData() || {};
  let tab = 'heroes';
  let search = '';
  let rarityFilter = 'All';
  const heroList = Object.values(d.heroes || {});
  let selectedHeroId = heroList[0]?.id ?? 1;
  let previewRank = 1;

  const container = h('div', { class: 'compendium-root' });

  function renderTabs() {
    const tabs = [
      ['heroes', `${t('ui.heroes')} (${heroList.length})`],
      ['items', `${t('ui.items')} (${Object.keys(d.items || {}).length})`],
      ['relics', `${t('ui.relics')} (${Object.keys(d.relics || {}).length})`],
      ['classes', `${t('ui.synergies')} & ${t('ui.guilds')}`],
      ['enemies', `${t('ui.enemies')} (${Object.keys(d.enemies || {}).length})`],
    ];
    return h('div', { class: 'comp-tabs' },
      tabs.map(([k, label]) => h('button', {
        class: `btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`,
        onclick: () => { audio.playSfx('ui.click'); tab = k; rarityFilter = 'All'; rebuild(); },
      }, label)),
      tab !== 'classes' ? h('input', {
        class: 'input-text comp-search',
        type: 'search',
        placeholder: t('ui.search'),
        value: search,
        oninput: (e) => { search = e.target.value; rebuildContent(); },
      }) : null);
  }

  const contentHost = h('div', { class: 'comp-content' });

  function rebuildContent() {
    contentHost.innerHTML = '';
    const q = search.trim().toLowerCase();

    if (tab === 'heroes') {
      const filtered = heroList.filter((hh) => !q || nameOf(hh).toLowerCase().includes(q));
      const sel = d.heroes?.[selectedHeroId] || filtered[0] || heroList[0];
      const specs = (sel?.specializationIds || []).map((id) => d.specializations?.[id]).filter(Boolean);
      const actAb = sel?.activeAbilityId ? d.activeAbilities?.[sel.activeAbilityId] : null;
      const pasAb = sel?.passiveAbilityId ? d.passiveAbilities?.[sel.passiveAbilityId] : null;
      const guild = sel ? d.guilds?.[sel.guildId] : null;

      contentHost.appendChild(h('div', { class: 'comp-heroes-layout' },
        h('div', { class: 'comp-hero-list' }, filtered.map((hh) => h('button', {
          class: `comp-hero-btn ${hh.id === sel?.id ? 'active' : ''}`,
          onclick: () => { selectedHeroId = hh.id; audio.playSfx('ui.click'); rebuildContent(); },
        },
          img(heroPortrait(hh.id, 'round'), { class: 'pill-avatar' }),
          h('span', null, nameOf(hh))))),
        sel ? h('div', { class: 'comp-hero-detail panel' },
          h('div', { class: 'comp-hero-art-col' },
            img(heroPortrait(sel.id, 'full', previewRank) || heroPortrait(sel.id, 'card', previewRank), { class: 'comp-fullbody' }),
            h('div', { class: 'comp-rank-switcher' },
              [1, 2, 3, 4].map((r) => h('button', {
                class: `btn btn-xs ${previewRank === r ? 'btn-primary' : 'btn-secondary'}`,
                onclick: () => { previewRank = r; rebuildContent(); },
              }, `${t('ui.rank')} ${rankLetter(r)}`)))),
          h('div', { class: 'comp-hero-info-col' },
            h('div', { class: 'comp-hero-head' },
              h('h2', null, nameOf(sel)),
              sel.lore?.alias ? h('span', { class: 'draft-alias' }, `« ${txt(sel.lore.aliasKey || sel.lore.alias)} »`) : null,
              guild ? h('span', { class: 'chip-tag' }, nameOf(guild)) : null,
              (sel.classIds || []).map((cid) => h('span', { class: 'chip-tag' },
                img(classIcon(cid), { class: 'chip-icon' }), nameOf(d.classes?.[cid])))),
            sel.lore?.subtitle ? h('blockquote', { class: 'comp-quote' }, `“${txt(sel.lore.subtitleKey || sel.lore.subtitle)}”`) : null,
            sel.lore?.currentGuild ? h('p', { class: 'comp-lore' }, txt(sel.lore.currentGuildKey || sel.lore.currentGuild)) : null,
            h('div', { class: 'insp-stats' },
              Object.entries(sel.stats || {}).map(([k, v]) => h('div', { class: 'insp-stat', title: statName(k) },
                img(statIcon(k), { class: 'tt-stat-icon' }),
                h('span', null, `${statName(k)}: ${fmtNum(v)}`)))),
            h('div', { class: 'comp-abilities' },
              actAb ? h('div', { class: 'insp-ab' },
                img(abilityIcon(actAb.id, false), { class: 'insp-ab-icon' }),
                h('div', null, h('strong', null, nameOf(actAb)), h('div', { html: richText(descOf(actAb), { values: valuesOf(actAb) }) }))) : null,
              pasAb ? h('div', { class: 'insp-ab' },
                img(abilityIcon(pasAb.id, true), { class: 'insp-ab-icon' }),
                h('div', null, h('strong', null, nameOf(pasAb)), h('div', { html: richText(descOf(pasAb), { values: valuesOf(pasAb) }) }))) : null),
            specs.length ? h('div', { class: 'comp-specs' },
              h('div', { class: 'panel-title' }, t('ui.specializations')),
              h('div', { class: 'comp-spec-grid' }, specs.map((sp) => {
                const spAb = sp.activeAbilityId ? d.activeAbilities?.[sp.activeAbilityId] : null;
                return h('div', { class: 'comp-spec-card panel' },
                  sp.classId ? h('span', { class: 'chip-tag' }, img(classIcon(sp.classId), { class: 'chip-icon' }), nameOf(d.classes?.[sp.classId])) : null,
                  h('strong', null, nameOf(sp)),
                  h('div', { class: 'tt-desc', html: richText(descOf(sp), { values: valuesOf(sp) }) }),
                  spAb ? h('div', { class: 'comp-spec-ab' },
                    img(abilityIcon(spAb.id, false), { class: 'chip-icon' }),
                    h('b', null, nameOf(spAb)), ': ',
                    h('span', { html: richText(descOf(spAb), { values: valuesOf(spAb) }) })) : null);
              }))) : null)) : null));
      return;
    }

    if (tab === 'items') {
      const rars = ['All', 'Common', 'Rare', 'Epic', 'Unique'];
      const items = Object.values(d.items || {}).filter((it) =>
        (rarityFilter === 'All' || it.rarity === rarityFilter) &&
        (!q || nameOf(it).toLowerCase().includes(q) || descOf(it).toLowerCase().includes(q)));
      contentHost.append(
        h('div', { class: 'comp-filter-bar' }, rars.map((r) => h('button', {
          class: `btn btn-xs ${rarityFilter === r ? 'btn-primary' : 'btn-secondary'}`,
          onclick: () => { rarityFilter = r; rebuildContent(); },
        }, r === 'All' ? L('Tous', 'All') : rarityName(r)))),
        h('div', { class: 'comp-card-grid' }, items.map((it) => {
          const card = h('div', { class: `comp-entry-card panel rar-${rarityLetter(it.rarity)}` },
            itemSlot(null, { uid: it.id, itemId: it.id }),
            h('div', { class: 'comp-entry-body' },
              h('strong', null, nameOf(it)),
              h('div', { class: 'muted' }, `${rarityName(it.rarity)}${it.price != null ? ` · ${it.price} ${L('Éclats', 'Shards')}` : ''}`),
              (it.statMods || []).map((m) => h('div', { class: 'shop-item-stat' },
                img(statIcon(m.stat), { class: 'tt-stat-icon' }),
                `+${fmtNum(m.value)}${m.percent ? '%' : ''} ${statName(m.stat)}`)),
              descOf(it) ? h('div', { class: 'tt-desc', html: richText(descOf(it), { values: valuesOf(it) }) }) : null));
          attachTooltip(card, () => itemTooltip(it.id));
          return card;
        })),
      );
      return;
    }

    if (tab === 'relics') {
      const rars = ['All', 'Common', 'Rare', 'Epic', 'Legendary', 'Unique'];
      const relics = Object.values(d.relics || {}).filter((r) =>
        (rarityFilter === 'All' || String(r.rarity).includes(rarityFilter)) &&
        (!q || nameOf(r).toLowerCase().includes(q) || descOf(r).toLowerCase().includes(q)));
      contentHost.append(
        h('div', { class: 'comp-filter-bar' }, rars.map((r) => h('button', {
          class: `btn btn-xs ${rarityFilter === r ? 'btn-primary' : 'btn-secondary'}`,
          onclick: () => { rarityFilter = r; rebuildContent(); },
        }, r === 'All' ? L('Tous', 'All') : rarityName(r)))),
        h('div', { class: 'comp-card-grid' }, relics.map((r) => {
          const card = h('div', { class: `comp-entry-card panel rar-${rarityLetter(r.rarity)}` },
            relicSlot(r.id),
            h('div', { class: 'comp-entry-body' },
              h('strong', null, nameOf(r)),
              h('div', { class: 'muted' }, `${rarityName(r.rarity)}${r.price != null ? ` · ${r.price} ${L('Éclats', 'Shards')}` : ''}`),
              h('div', { class: 'tt-desc', html: richText(descOf(r), { values: valuesOf(r) }) })));
          attachTooltip(card, () => relicTooltip(r.id));
          return card;
        })),
      );
      return;
    }

    if (tab === 'classes') {
      contentHost.append(
        h('h3', { class: 'panel-title' }, t('ui.synergies')),
        h('div', { class: 'comp-card-grid' }, Object.values(d.classes || {}).map((c) =>
          h('div', { class: 'comp-entry-card panel' },
            img(classIcon(c.id), { class: 'tt-icon' }),
            h('div', { class: 'comp-entry-body' },
              h('strong', null, nameOf(c)),
              h('div', { class: 'tt-desc', html: richText(descOf(c), { values: valuesOf(c) }) }))))),
        h('h3', { class: 'panel-title', style: { marginTop: '16px' } }, t('ui.guilds')),
        h('div', { class: 'comp-card-grid' }, Object.values(d.guilds || {}).map((g) =>
          h('div', { class: 'comp-entry-card panel' },
            img(guildBanner(g.id), { class: 'tt-icon' }),
            h('div', { class: 'comp-entry-body' },
              h('strong', null, nameOf(g)))))),
      );
      return;
    }

    if (tab === 'enemies') {
      const enemies = Object.values(d.enemies || {}).filter((e) => !q || nameOf(e).toLowerCase().includes(q)).slice(0, 120);
      contentHost.appendChild(h('div', { class: 'comp-card-grid' }, enemies.map((e) => {
        const atkType = e.attackType === 'Ranged' ? L('Distance', 'Ranged') : L('Mêlée', 'Melee');
        const card = h('div', { class: 'comp-entry-card panel' },
          img(enemyIcon(e.id), { class: 'tt-icon' }, SPR.enemyRound),
          h('div', { class: 'comp-entry-body' },
            h('strong', null, `${nameOf(e)} (#${e.id})`),
            h('div', { class: 'muted' }, `${atkType} · ${L('PV', 'HP')} ${e.stats?.MaxHealth ?? '?'}`)));
        attachTooltip(card, () => enemyTooltip(e.id));
        return card;
      })));
    }
  }

  function rebuild() {
    container.innerHTML = '';
    container.append(renderTabs(), contentHost);
    rebuildContent();
  }

  rebuild();
  return modal({
    title: `📖 ${t('ui.compendium')}`,
    body: container,
    cls: 'modal-compendium',
    actions: [{ label: t('ui.close'), primary: true }],
  });
}

// ---------------- Sandbox Battle Builder ----------------
export function renderSandbox(ctx) {
  const d = getGameData() || {};
  const { W, H, playerRows } = boardInfo(d);
  const prSet = new Set(playerRows);
  const hexSize = 36;
  const dims = boardDims(W, H, hexSize);

  const heroDefs = Object.values(d.heroes || {});
  const stageDefs = Object.values(d.stages || {}).slice(0, 80);

  let selectedHeroId = heroDefs[0]?.id ?? 1;
  let selectedRank = 2;
  let selectedStageId = stageDefs[0]?.id ?? 101;
  let placedHeroes = [
    { uid: 'sb_h1', heroId: heroDefs[0]?.id ?? 1, rank: 2, x: 2, y: 2, items: [], specializationId: heroDefs[0]?.specializationIds?.[0] },
    { uid: 'sb_h2', heroId: heroDefs[1]?.id ?? 2, rank: 2, x: 4, y: 2, items: [], specializationId: heroDefs[1]?.specializationIds?.[0] },
  ];
  let uidSeq = 3;

  const host = h('div', { class: 'screen screen-sandbox' });

  function getStageEnemies() {
    const st = d.stages?.[selectedStageId];
    return mirrorEnemies(st?.enemies || [], H, playerRows);
  }

  function rebuild() {
    host.innerHTML = '';
    const stage = d.stages?.[selectedStageId];
    const enemies = getStageEnemies();

    const heroAt = new Map(placedHeroes.map((p) => [`${p.x},${p.y}`, p]));
    const enemyAt = new Map();
    enemies.forEach((e, i) => {
      const ex = e.x != null ? e.x : (i % W);
      const ey = e.y != null ? e.y : (H - 1 - Math.floor(i / W));
      enemyAt.set(`${ex},${ey}`, { ...e, x: ex, y: ey });
    });

    const boardEl = h('div', {
      class: 'hex-board',
      style: { width: `${Math.ceil(dims.width)}px`, height: `${Math.ceil(dims.height)}px` },
    });

    for (let row = 0; row < H; row++) {
      const isPlayer = prSet.has(row);
      for (let col = 0; col < W; col++) {
        const center = hexCenter(col, row, hexSize, H);
        const key = `${col},${row}`;
        const occH = heroAt.get(key);
        const occE = !occH ? enemyAt.get(key) : null;

        const cell = h('div', {
          class: `hex-cell ${isPlayer ? 'player-cell' : 'enemy-cell'} ${occH ? 'occupied' : ''}`,
          style: {
            left: `${Math.round(center.x - hexSize * 0.866)}px`,
            top: `${Math.round(center.y - hexSize)}px`,
            width: `${Math.round(hexSize * 1.732)}px`,
            height: `${Math.round(hexSize * 2)}px`,
          },
          onclick: () => {
            if (!isPlayer) return;
            if (occH) {
              placedHeroes = placedHeroes.filter((x) => x.uid !== occH.uid);
            } else {
              const def = d.heroes?.[selectedHeroId];
              placedHeroes.push({
                uid: `sb_h${uidSeq++}`,
                heroId: selectedHeroId,
                rank: selectedRank,
                x: col,
                y: row,
                items: [],
                specializationId: def?.specializationIds?.[0] ?? null,
              });
            }
            audio.playSfx('ui.hero_drop');
            rebuild();
          },
        });

        if (occH) {
          const tok = h('div', { class: `hero-token rank-${rankLetter(occH.rank)}` },
            h('div', { class: 'token-portrait' }, img(heroPortrait(occH.heroId, 'round'))),
            h('div', { class: 'token-rank' }, rankLetter(occH.rank)));
          attachTooltip(tok, () => heroTooltip(occH.heroId, occH));
          cell.appendChild(tok);
        } else if (occE) {
          cell.appendChild(enemyToken(occE.enemyId));
        }
        boardEl.appendChild(cell);
      }
    }

    const topBar = h('div', { class: 'hud' },
      h('div', { class: 'hud-left' },
        h('img', { class: 'hud-logo', src: SPR.logo, alt: 'Guildrun', onclick: () => ctx.goMenu() }),
        h('span', { class: 'hud-chip' }, `⚡ ${t('ui.sandbox')}`)),
      h('div', { class: 'hud-mid' },
        h('label', { class: 'sandbox-field' },
          h('span', null, `${t('ui.presetStage')}:`),
          h('select', {
            class: 'input-select',
            onchange: (e) => { selectedStageId = +e.target.value; rebuild(); },
          }, stageDefs.map((st) => h('option', { value: String(st.id), selected: st.id === selectedStageId },
            `${L('Étape', 'Stage')} #${st.id} (${L('Acte', 'Act')} ${st.act}, ${L('Étage', 'Floor')} ${st.floor}, ${st.stageType})`)))),
        h('label', { class: 'sandbox-field' },
          h('span', null, `${t('ui.rank')}:`),
          h('select', {
            class: 'input-select',
            onchange: (e) => { selectedRank = +e.target.value; rebuild(); },
          }, [1, 2, 3, 4].map((r) => h('option', { value: String(r), selected: r === selectedRank }, rankLetter(r)))))),
      h('div', { class: 'hud-right' },
        h('button', {
          class: 'btn btn-secondary btn-sm',
          onclick: () => { placedHeroes = []; rebuild(); },
        }, t('ui.clearBoard')),
        h('button', {
          class: 'btn btn-primary btn-sm',
          disabled: !placedHeroes.length,
          onclick: () => launchSandboxBattle(stage, [...enemyAt.values()]),
        }, `⚔ ${t('ui.fight')}`),
        h('button', { class: 'btn-icon', onclick: () => ctx.goMenu() }, '⌂')));

    const palette = h('aside', { class: 'sandbox-palette panel' },
      h('div', { class: 'panel-title' }, t('ui.heroes')),
      h('div', { class: 'comp-hero-list' }, heroDefs.map((hh) => h('button', {
        class: `comp-hero-btn ${hh.id === selectedHeroId ? 'active' : ''}`,
        onclick: () => { selectedHeroId = hh.id; audio.playSfx('ui.click'); rebuild(); },
      },
        img(heroPortrait(hh.id, 'round'), { class: 'pill-avatar' }),
        h('span', null, nameOf(hh))))));

    host.append(
      topBar,
      h('div', { class: 'placement-main' },
        palette,
        h('section', { class: 'placement-center' },
          h('div', { class: 'board-stage-wrap' }, boardEl),
          h('div', { class: 'panel muted', style: { padding: '8px 14px', textAlign: 'center' } },
            t('ui.dragHint')))));
  }

  function launchSandboxBattle(stage, enemies) {
    audio.playSfx('ui.fight');
    const battle = ctx.buildBattle({
      data: d,
      heroes: placedHeroes.map((p) => ({
        uid: p.uid,
        heroId: p.heroId,
        rank: p.rank,
        items: p.items || [],
        x: p.x,
        y: p.y,
        specializationId: p.specializationId,
        rankModifierIds: [],
      })),
      enemies: enemies.map((e, i) => ({
        uid: `sb_e${i}`,
        enemyId: e.enemyId,
        x: e.x,
        y: e.y,
        floor: stage?.floor || 1,
      })),
      relics: [],
      seed: (Date.now() & 0x7fffffff),
    });

    const vm = {
      act: stage?.act || 1,
      floor: stage?.floor || 1,
      stage,
      shards: 0,
      relics: [],
      heroes: placedHeroes.map((p) => ({ ...p, onBoard: true })),
    };

    const battleScreen = renderBattle(ctx, vm, battle, () => {
      battleScreen._cleanup?.();
      rebuild();
    });
    host.innerHTML = '';
    host.appendChild(battleScreen);
  }

  rebuild();
  return host;
}
