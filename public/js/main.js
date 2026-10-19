// Guildrun Web — Application controller & router (UI agent).
// Integrates data.js, audio.js, run/index.js (createRun), sim/index.js (createBattle), and UI screens.
import { loadGameData, getGameData, onLangChange, t } from './data.js';
import { audio } from './audio.js';
import { clear, h, toast, errorPanel } from './ui/dom.js';
import { normalizeState } from './ui/state.js';
import { hideTooltip } from './ui/tooltip.js';
import { mirrorEnemies, boardInfo } from './ui/hex.js';
import { renderMainMenu, renderComic, openSettingsModal, renderDifficultySelect } from './ui/screens_menu.js';
import { renderInitialSelection, renderIntro, renderPlacement, maybeShowRankUpModal, maybeShowRelicPickerModal } from './ui/screens_board.js';
import { renderBattle, renderResult, renderEndRun } from './ui/screens_battle.js';
import { renderShop, renderCrossroads, renderEvent, renderCampfire } from './ui/screens_nodes.js';
import { openCompendiumModal, renderSandbox } from './ui/screens_extra.js';
import { createCoopController } from './ui/coop.js';

const SAVE_KEY = 'guildrun.save.v1';

const app = {
  root: null,
  data: null,
  modules: { sim: null, run: null },
  run: null,
  screenOverride: null, // 'menu' | 'comic' | 'sandbox' | 'battle'
  activeBattle: null,
  lastBattleMeta: null,
  battleSpeed: 1,
  difficulty: 0,
  currentCleanup: null,
};

async function loadLogicModules() {
  if (!app.modules.sim) {
    try {
      const m = await import('./sim/index.js');
      if (typeof m.createBattle === 'function') app.modules.sim = m;
    } catch (e) {
      console.warn('[main] sim/index.js not ready, using fallback sim adapter:', e?.message || e);
    }
  }
  if (!app.modules.run) {
    try {
      const m = await import('./run/index.js');
      if (typeof m.createRun === 'function') app.modules.run = m;
    } catch (e) {
      console.warn('[main] run/index.js not ready, using fallback run adapter:', e?.message || e);
    }
  }
}

// ---------------- Fallback Battle & Run Adapters (used only if sim/run module missing) ----------------
function createFallbackBattle({ data, heroes = [], enemies = [] }) {
  const { H, playerRows } = boardInfo(data);
  const mirE = mirrorEnemies(enemies, H, playerRows);
  const units = [
    ...heroes.map((hh, i) => {
      const def = data?.heroes?.[hh.heroId] || {};
      const st = def.stats || {};
      const rankMult = 1 + ((hh.rank || 1) - 1) * 0.25;
      const maxHp = Math.round((st.MaxHealth || 700) * rankMult);
      return {
        uid: hh.uid ?? `p${i}`,
        team: 1,
        defId: hh.heroId,
        x: hh.x ?? (i % 7),
        y: hh.y ?? 1,
        hp: maxHp,
        maxHp,
        mana: st.StartingMana || 0,
        maxMana: st.MaxMana || 100,
        atk: Math.round(((st.BaseAttackDamage || 35) + (st.Attack || 0)) * rankMult),
        range: st.AttackRange || 1,
        speed: st.MoveSpeed || 1.5,
        shield: 0,
        statuses: {},
        state: 'idle',
        cd: 0,
      };
    }),
    ...mirE.map((ee, i) => {
      const def = data?.enemies?.[ee.enemyId] || {};
      const st = def.stats || {};
      const maxHp = Math.round(st.MaxHealth || 550);
      return {
        uid: ee.uid ?? `e${i}`,
        team: 2,
        defId: ee.enemyId,
        x: ee.x ?? (i % 7),
        y: ee.y ?? 5,
        hp: maxHp,
        maxHp,
        mana: st.StartingMana || 0,
        maxMana: st.MaxMana || 100,
        atk: Math.round((st.BaseAttackDamage || 28) + (st.Attack || 0)),
        range: st.AttackRange || 1,
        speed: st.MoveSpeed || 1.4,
        shield: 0,
        statuses: {},
        state: 'idle',
        cd: 0,
      };
    }),
  ];

  const state = { time: 0, units, projectiles: [], events: [] };
  const DT = 0.032;

  function alive(team) { return units.filter((u) => u.team === team && u.hp > 0); }
  function isOver() { return alive(1).length === 0 || alive(2).length === 0 || state.time >= 60; }

  function tick() {
    state.events = [];
    state.time += DT;
    for (const u of units) {
      if (u.hp <= 0) continue;
      const foes = alive(u.team === 1 ? 2 : 1);
      if (!foes.length) break;
      let best = foes[0];
      let bestD = Math.hypot(best.x - u.x, best.y - u.y);
      for (const f of foes) {
        const d = Math.hypot(f.x - u.x, f.y - u.y);
        if (d < bestD) { best = f; bestD = d; }
      }
      if (bestD > (u.range || 1) + 0.35) {
        const dx = (best.x - u.x) / bestD;
        const dy = (best.y - u.y) / bestD;
        u.x += dx * u.speed * DT;
        u.y += dy * u.speed * DT;
      } else {
        u.cd -= DT;
        if (u.cd <= 0) {
          u.cd = 0.85;
          u.mana = Math.min(u.maxMana, u.mana + 15);
          let dmg = u.atk;
          let cast = false;
          if (u.mana >= u.maxMana && u.maxMana > 0) {
            u.mana = 0;
            dmg = Math.round(dmg * 1.9);
            cast = true;
            const def = u.team === 1 ? data?.heroes?.[u.defId] : data?.enemies?.[u.defId];
            state.events.push({ type: 'cast', sourceUid: u.uid, targetUid: best.uid, abilityId: def?.activeAbilityId });
          }
          best.hp = Math.max(0, best.hp - dmg);
          state.events.push({ type: 'attack', sourceUid: u.uid, targetUid: best.uid });
          state.events.push({ type: 'damage', sourceUid: u.uid, targetUid: best.uid, amount: dmg, crit: cast });
          if (best.hp <= 0) state.events.push({ type: 'death', targetUid: best.uid, sourceUid: u.uid });
        }
      }
    }
  }

  function result() {
    const p1 = alive(1);
    const p2 = alive(2);
    const winner = p1.length > 0 && p2.length === 0 ? 'players' : p2.length > 0 && p1.length === 0 ? 'enemies' : 'draw';
    return { winner, survivors: p1.map((u) => u.uid), stats: {} };
  }

  return { state, tick, isOver, result };
}

function createFallbackRun({ data, difficulty = 0 }) {
  const heroIds = Object.keys(data?.heroes || {}).map(Number);
  const itemIds = Object.keys(data?.items || {}).map(Number);
  const relicIds = Object.keys(data?.relics || {}).filter((k) => data.relics[k].price != null).map(Number);
  const stageList = Object.values(data?.stages || {}).filter((s) => s.enemies?.length);
  const eventList = Object.values(data?.events || {}).filter((e) => e.choices?.length);

  const st = {
    phase: 'InitialSelection',
    act: 1,
    floor: 1,
    difficulty,
    shards: data?.singletons?.PlayerSingleton?.StartingShards ?? 15,
    accumulatedShards: data?.singletons?.PlayerSingleton?.StartingAccumulatedShards ?? 10,
    lives: 2,
    maxHeroesOnBoard: data?.singletons?.HeroesSingleton?.StartingMaxHeroesOnBoard ?? 3,
    teamSizeCost: data?.shopPrices?.teamSize?.base ?? 25,
    heroes: [],
    inventory: [],
    relics: [],
    initialChoices: heroIds.slice(0, 3),
    initialSelectRerolls: 0,
    stage: stageList[0] || null,
    enemies: stageList[0]?.enemies || [],
    shop: null,
    crossroads: [],
    event: null,
    campfire: null,
    pendingRankUp: null,
    pendingRelicChoices: null,
    pendingItemChoices: null,
    lastResult: null,
    rewards: [],
  };
  let seq = 1;

  function rollShop() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    st.shop = {
      heroes: Array.from({ length: 3 }, (_, i) => {
        const id = pick(heroIds);
        return { slot: i, heroId: id, rank: 1, price: data?.shopPrices?.heroRank?.['1'] ?? 15, sold: false, frozen: false };
      }),
      items: Array.from({ length: 4 }, (_, i) => {
        const id = pick(itemIds);
        return { slot: i, itemId: id, price: data?.items?.[id]?.price ?? 5, sold: false };
      }),
      relics: [{ slot: 0, relicId: pick(relicIds), price: 15, sold: false }],
      rerollCost: data?.shopPrices?.reroll?.base ?? 1,
      frozen: false,
    };
  }

  function advanceStage() {
    const idx = Math.min(stageList.length - 1, st.floor - 1);
    st.stage = stageList[idx] || stageList[0];
    st.enemies = st.stage?.enemies || [];
  }

  return {
    getState: () => st,
    chooseInitial(i) {
      const c = st.initialChoices[i] ?? heroIds[0];
      const hid = typeof c === 'object' ? (c.heroId ?? c.id) : c;
      st.heroes.push({ uid: `h${seq++}`, heroId: hid, rank: 1, x: 3, y: 1, onBoard: true, items: [], specializationId: null, rankModifierIds: [] });
      if (typeof c === 'object' && c.relicId != null) st.relics.push({ uid: `r${seq++}`, relicId: c.relicId });
      st.phase = 'Placement';
      advanceStage();
    },
    rerollInitial() {
      st.initialSelectRerolls = (st.initialSelectRerolls || 0) + 1;
      const offset = (st.initialSelectRerolls * 3) % Math.max(1, heroIds.length);
      st.initialChoices = [0, 1, 2].map((i) => heroIds[(offset + i) % Math.max(1, heroIds.length)]);
    },
    placeHero(uid, x, y) {
      const h = st.heroes.find((u) => String(u.uid) === String(uid));
      if (!h) return;
      const other = st.heroes.find((u) => u.onBoard && u.x === x && u.y === y && u.uid !== h.uid);
      if (other) {
        if (h.onBoard) { other.x = h.x; other.y = h.y; }
        else { other.onBoard = false; other.x = null; other.y = null; }
      }
      const onBoardCount = st.heroes.filter((u) => u.onBoard && u.uid !== h.uid).length;
      if (onBoardCount >= st.maxHeroesOnBoard && !other) return;
      h.x = x; h.y = y; h.onBoard = true;
    },
    benchHero(uid) {
      const h = st.heroes.find((u) => String(u.uid) === String(uid));
      if (h) { h.onBoard = false; h.x = null; h.y = null; }
    },
    equipItem(itemUid, heroUid) {
      const idx = st.inventory.findIndex((it) => String(it.uid) === String(itemUid));
      const h = st.heroes.find((u) => String(u.uid) === String(heroUid));
      if (idx >= 0 && h && h.items.length < 6) {
        h.items.push(st.inventory.splice(idx, 1)[0]);
      }
    },
    unequipItem(itemUid, heroUid) {
      const h = heroUid != null
        ? st.heroes.find((u) => String(u.uid) === String(heroUid))
        : st.heroes.find((u) => (u.items || []).some((it) => String(it.uid) === String(itemUid)));
      if (!h) return;
      const idx = h.items.findIndex((it) => String(it.uid) === String(itemUid));
      if (idx >= 0) st.inventory.push(h.items.splice(idx, 1)[0]);
    },
    startBattle() {
      st.phase = 'Resolution';
      return {
        data,
        heroes: st.heroes.filter((u) => u.onBoard),
        enemies: st.enemies,
        relics: st.relics.map((r) => r.relicId ?? r),
        seed: Date.now() & 0x7fffffff,
      };
    },
    finishBattle(result) {
      const win = result?.winner === 'players';
      const gold = win ? 20 : 10;
      st.shards += gold;
      st.rewards = [{ type: win ? 'Victory' : 'Defeat', amount: gold }];
      if (!win) st.lives = Math.max(0, st.lives - 1);
      st.lastResult = result;
      st.phase = st.lives <= 0 ? 'Complete' : 'Result';
    },
    openShop() { rollShop(); st.phase = 'Shop'; },
    buyHero(slot) {
      const s = st.shop?.heroes?.[slot];
      if (!s || s.sold || st.shards < s.price) return;
      st.shards -= s.price;
      s.sold = true;
      const existing = st.heroes.find((u) => Number(u.heroId) === Number(s.heroId));
      if (existing) {
        existing.rank = Math.min(4, (existing.rank || 1) + 1);
        const def = data?.heroes?.[existing.heroId];
        if (!existing.specializationId && def?.specializationIds?.length) {
          st.pendingRankUp = { heroUid: existing.uid, choices: def.specializationIds };
        }
      } else {
        const onB = st.heroes.filter((u) => u.onBoard).length < st.maxHeroesOnBoard;
        st.heroes.push({ uid: `h${seq++}`, heroId: s.heroId, rank: s.rank || 1, x: onB ? 0 : null, y: onB ? 0 : null, onBoard: onB, items: [] });
      }
    },
    buyItem(slot) {
      const s = st.shop?.items?.[slot];
      if (!s || s.sold || st.shards < s.price) return;
      st.shards -= s.price;
      s.sold = true;
      st.inventory.push({ uid: `i${seq++}`, itemId: s.itemId });
    },
    buyRelic(slot) {
      const s = st.shop?.relics?.[slot];
      if (!s || s.sold || st.shards < s.price) return;
      st.shards -= s.price;
      s.sold = true;
      st.relics.push({ uid: `r${seq++}`, relicId: s.relicId });
    },
    reroll() {
      if (!st.shop || st.shards < st.shop.rerollCost) return;
      st.shards -= st.shop.rerollCost;
      const nextCost = st.shop.rerollCost + 1;
      rollShop();
      st.shop.rerollCost = nextCost;
    },
    freeze() { if (st.shop) st.shop.frozen = !st.shop.frozen; },
    sellHero(uid) {
      if (st.heroes.length <= 1) return;
      const idx = st.heroes.findIndex((u) => String(u.uid) === String(uid));
      if (idx >= 0) { st.heroes.splice(idx, 1); st.shards += 8; }
    },
    sellItem(uid) {
      const idx = st.inventory.findIndex((it) => String(it.uid) === String(uid));
      if (idx >= 0) { st.inventory.splice(idx, 1); st.shards += 3; return; }
      for (const h of st.heroes) {
        const eqIdx = (h.items || []).findIndex((it) => String(it.uid) === String(uid));
        if (eqIdx >= 0) { h.items.splice(eqIdx, 1); st.shards += 3; return; }
      }
    },
    buyTeamSize() {
      if (st.shards < st.teamSizeCost) return;
      st.shards -= st.teamSizeCost;
      st.maxHeroesOnBoard += 1;
      st.teamSizeCost += 50;
    },
    rankUpChoice(i) {
      if (!st.pendingRankUp) return;
      const h = st.heroes.find((u) => String(u.uid) === String(st.pendingRankUp.heroUid));
      const choice = st.pendingRankUp.choices?.[i];
      if (h && choice != null) h.specializationId = typeof choice === 'object' ? choice.id : choice;
      st.pendingRankUp = null;
    },
    pickRelic(relicIdOrIdx = 0) {
      if (!st.pendingRelicChoices) return;
      const choices = st.pendingRelicChoices.choices || [];
      const rid = choices.includes(Number(relicIdOrIdx)) ? Number(relicIdOrIdx) : (choices[relicIdOrIdx] ?? choices[0]);
      if (rid != null) st.relics.push({ uid: `r${seq++}`, relicId: rid });
      st.pendingRelicChoices = null;
    },
    skipRelicReward() { st.pendingRelicChoices = null; },
    pickItem(itemIdOrIdx = 0) {
      if (!st.pendingItemChoices) return;
      const choices = st.pendingItemChoices.choices || [];
      const iid = choices.includes(Number(itemIdOrIdx)) ? Number(itemIdOrIdx) : (choices[itemIdOrIdx] ?? choices[0]);
      if (iid != null) st.inventory.push({ uid: `i${seq++}`, itemId: iid });
      st.pendingItemChoices = null;
    },
    skipItemReward() { st.pendingItemChoices = null; },
    leaveShop() {
      st.crossroads = [
        { type: 'Combat', title: 'Next Rift Encounter', description: 'Advance to the next floor combat.' },
        { type: 'Event', eventId: eventList[st.floor % Math.max(1, eventList.length)]?.id ?? 600 },
        { type: 'Campfire', title: t('ui.campfire'), description: 'Rest or train a Hero at the campfire.' },
      ];
      st.phase = 'Crossroads';
    },
    chooseCrossroads(i) {
      const c = st.crossroads[i] || st.crossroads[0];
      st.floor += 1;
      if (c?.type === 'Campfire') { st.campfire = { remainingActions: 1 }; st.phase = 'Campfire'; }
      else if (c?.type === 'Event' && c.eventId) { st.event = data?.events?.[c.eventId] || { id: c.eventId }; st.phase = 'Event'; }
      else { advanceStage(); st.phase = 'Placement'; }
    },
    chooseEventOption() { advanceStage(); st.phase = 'Placement'; },
    campfireAction(action, heroUid) {
      if (action === 'train' && heroUid) {
        const h = st.heroes.find((u) => String(u.uid) === String(heroUid));
        if (h) h.rank = Math.min(4, (h.rank || 1) + 1);
      }
      advanceStage();
      st.phase = 'Placement';
    },
    enterEndless() {
      st.floor += 1;
      advanceStage();
      st.phase = 'Placement';
    },
    completeRun() { st.phase = 'Complete'; },
  };
}

// ---------------- Context & Method Dispatch ----------------
const METHOD_ALIASES = {
  chooseInitial: ['chooseInitial', 'selectInitial', 'pickInitial'],
  rerollInitial: ['rerollInitial'],
  placeHero: ['placeHero', 'moveHero', 'deployHero'],
  benchHero: ['benchHero', 'unplaceHero', 'moveToBench'],
  equipItem: ['equipItem', 'giveItem'],
  unequipItem: ['unequipItem', 'removeItem'],
  buyHero: ['buyHero', 'purchaseHero'],
  buyItem: ['buyItem', 'purchaseItem'],
  buyRelic: ['buyRelic', 'purchaseRelic'],
  reroll: ['reroll', 'rerollShop'],
  freeze: ['freeze', 'toggleFreeze', 'freezeShop'],
  sellHero: ['sellHero'],
  sellItem: ['sellItem'],
  buyTeamSize: ['buyTeamSize', 'upgradeTeamSize'],
  chooseCrossroads: ['chooseCrossroads', 'selectCrossroads', 'pickCrossroads'],
  chooseEventOption: ['chooseEventOption', 'selectEventChoice', 'chooseEvent'],
  campfireAction: ['campfireAction'],
  rankUpChoice: ['rankUpChoice', 'chooseRankUp', 'selectSpecialization'],
  chooseSpecialization: ['chooseSpecialization', 'rankUpChoice'],
  pickRelic: ['pickRelic', 'chooseRelic'],
  skipRelicReward: ['skipRelicReward'],
  pickItem: ['pickItem', 'chooseItem'],
  skipItemReward: ['skipItemReward'],
  enterEndless: ['enterEndless'],
  completeRun: ['completeRun'],
};

function findRunMethod(run, name) {
  if (!run) return null;
  const list = METHOD_ALIASES[name] || [name];
  for (const m of list) if (typeof run[m] === 'function') return run[m].bind(run);
  return null;
}

function saveRunIfPossible() {
  if (!app.run) return;
  try {
    if (typeof app.run.save === 'function') { app.run.save(); }
    const st = app.run.getState?.();
    if (st) localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now() }));
  } catch { /* ignore */ }
}

const ctx = {
  coop: null,
  get modules() { return app.modules; },
  get run() { return app.run; },
  get data() { return app.data; },
  get vm() { return app.run ? normalizeState(app.run.getState?.() || {}, app.data) : null; },
  get activeBattle() { return app.activeBattle; },
  set activeBattle(v) { app.activeBattle = v; },
  get difficulty() { return app.difficulty; },
  set difficulty(v) { app.difficulty = v; },
  get battleSpeed() { return app.battleSpeed; },
  set battleSpeed(v) { app.battleSpeed = v; },
  get speed() { return app.battleSpeed; },
  set speed(v) { app.battleSpeed = v; },
  setSpeed(v) { app.battleSpeed = Number(v) || 1; },
  syncState() { saveRunIfPossible(); },
  render() { render(); },
  openCoop(code) { this.coop?.openLobbyModal?.(code); },

  hasMethod(name) { return !!findRunMethod(app.run, name); },

  call(name, ...args) {
    const fn = findRunMethod(app.run, name);
    if (!fn) {
      console.warn(`[UI] Run method "${name}" not found`);
      return undefined;
    }
    try {
      const res = fn(...args);
      saveRunIfPossible();
      render();
      return res;
    } catch (err) {
      console.error(`[UI] Error in run.${name}:`, err);
      toast(String(err?.message || err), 'error');
      render();
      return undefined;
    }
  },

  callCampfire(actionId, index, heroUid, rawOpt) {
    if (!app.run) return;
    try {
      if (typeof app.run.campfireAction === 'function') {
        try {
          app.run.campfireAction(actionId, heroUid);
        } catch {
          app.run.campfireAction({ action: actionId, type: actionId, index, heroUid, option: rawOpt });
        }
      } else if (typeof app.run.chooseEventOption === 'function') {
        app.run.chooseEventOption(index, heroUid);
      }
      saveRunIfPossible();
      render();
    } catch (err) {
      console.error('[UI] callCampfire error:', err);
      toast(String(err?.message || err), 'error');
    }
  },

  buildBattle(battleArgs) {
    const payload = { ...battleArgs, data: app.data };
    if (app.modules.sim?.createBattle) {
      return app.modules.sim.createBattle(payload);
    }
    return createFallbackBattle(payload);
  },

  async startNewRun({ difficulty = 0, redRift = false, seed } = {}) {
    await loadLogicModules();
    const actualSeed = seed ?? ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    if (app.modules.run?.createRun) {
      app.run = app.modules.run.createRun({ data: app.data, seed: actualSeed, difficulty, redRift: !!redRift });
    } else {
      app.run = createFallbackRun({ data: app.data, seed: actualSeed, difficulty, redRift: !!redRift });
    }
    app.screenOverride = null;
    app.activeBattle = null;
    app.lastBattleMeta = null;
    saveRunIfPossible();
    render();
  },

  hasSavedRun() {
    if (app.run) {
      const vm = normalizeState(app.run.getState?.(), app.data);
      if (vm.phase !== 'complete') return true;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /guildrun.*(run|save)/i.test(k)) return true;
      }
    } catch { /* ignore */ }
    return false;
  },

  async continueRun() {
    await loadLogicModules();
    if (!app.run && app.modules.run?.createRun) {
      try {
        if (typeof app.modules.run.loadRun === 'function') {
          app.run = app.modules.run.loadRun({ data: app.data });
        } else {
          const r = app.modules.run.createRun({ data: app.data, seed: Date.now() & 0x7fffffff, difficulty: app.difficulty });
          if (typeof r.load === 'function') r.load();
          app.run = r;
        }
      } catch (e) { console.warn(e); }
    }
    if (!app.run) return this.startNewRun({ difficulty: app.difficulty });
    app.screenOverride = null;
    render();
  },

  abandonRun() {
    app.run = null;
    app.activeBattle = null;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /guildrun.*(run|save)/i.test(k)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    app.screenOverride = 'menu';
    render();
  },

  proceedFromIntro() {
    if (!app.run) return;
    for (const m of ['startPlacement', 'finishIntro', 'proceedFromIntro', 'proceed', 'next']) {
      if (typeof app.run[m] === 'function') { app.run[m](); saveRunIfPossible(); render(); return; }
    }
    render();
  },

  startBattleFlow(opts = {}) {
    if (!app.run) return;
    if (this.coop?.state?.active && !opts?.fromCoopSync && typeof this.coop.requestRoundStart === 'function') {
      const handledByCoop = this.coop.requestRoundStart();
      if (handledByCoop) return;
    }
    let battleArgs = null;
    if (typeof app.run.startBattle === 'function') {
      battleArgs = app.run.startBattle();
    }
    const vm = normalizeState(app.run.getState?.(), app.data);
    if (!battleArgs || typeof battleArgs !== 'object') {
      battleArgs = {
        data: app.data,
        heroes: vm.heroes.map((hh) => ({ ...hh, onBoard: !!hh.onBoard, benched: !hh.onBoard })),
        enemies: vm.enemies,
        relics: vm.relics.map((r) => r.relicId),
        seed: Date.now() & 0x7fffffff,
      };
    }
    if (!battleArgs.data) battleArgs.data = app.data;
    app.activeBattle = this.buildBattle(battleArgs);
    try { ctx.coop?.onBattleStart?.(app.activeBattle); } catch (e) { console.warn('[coop] onBattleStart:', e); }
    app.screenOverride = 'battle';
    saveRunIfPossible();
    render();
  },

  proceedFromResult() {
    if (!app.run) return;
    for (const m of ['proceedFromResult', 'openShop', 'proceedToNextFloor', 'continueAfterResult', 'proceed', 'next']) {
      if (typeof app.run[m] === 'function') {
        app.run[m]();
        saveRunIfPossible();
        render();
        return;
      }
    }
    render();
  },

  leaveShop() {
    if (!app.run) return;
    for (const m of ['leaveShop', 'closeShop', 'openCrossroads', 'proceedFromShop', 'proceedToNextFloor', 'proceed', 'next']) {
      if (typeof app.run[m] === 'function') {
        app.run[m]();
        saveRunIfPossible();
        render();
        return;
      }
    }
    render();
  },

  enterEndless() {
    return this.call('enterEndless');
  },

  goMenu() {
    app.screenOverride = 'menu';
    render();
  },

  goScreen(name) {
    app.screenOverride = name;
    render();
  },

  openSettings() { openSettingsModal(this); },
  openCompendium() { openCompendiumModal(this); },
  rerender() { render(); },
};

// ---------------- Main Render Switch ----------------
function updateMusicForPhase(phase, vm) {
  if (phase === 'menu' || phase === 'comic') audio.playMusic('music.menu');
  else if (phase === 'shop') audio.playMusic('music.shop');
  else if (phase === 'resolution' || phase === 'battle') {
    const isBoss = ['Boss', 'MiniBoss', 'Elite'].includes(vm?.stage?.stageType);
    audio.playMusic(isBoss ? 'music.boss' : 'music.combat');
  } else if (phase === 'result') {
    const w = String(vm?.lastResult?.winner || '').toLowerCase();
    audio.playSfx(w === 'players' || w === 'victory' ? 'music.win' : 'music.lose');
  } else {
    audio.playMusic('music.calm');
  }
}

function render() {
  if (!app.root) return;
  hideTooltip();
  if (app.currentCleanup) {
    try { app.currentCleanup(); } catch { /* ignore */ }
    app.currentCleanup = null;
  }
  const liveInsp = app.root.querySelector('#gr-live-unit-inspector');
  const coopBanner = app.root.querySelector('.gr-coop-banner');
  clear(app.root);
  if (liveInsp) app.root.appendChild(liveInsp);
  if (coopBanner) app.root.appendChild(coopBanner);

  if (app.screenOverride === 'comic') {
    updateMusicForPhase('comic');
    app.root.appendChild(renderComic(ctx));
    return;
  }
  if (app.screenOverride === 'difficulty') {
    updateMusicForPhase('menu');
    app.root.appendChild(renderDifficultySelect(ctx));
    return;
  }
  if (app.screenOverride === 'sandbox') {
    updateMusicForPhase('placement');
    app.root.appendChild(renderSandbox(ctx));
    return;
  }
  if (app.screenOverride === 'menu' || !app.run) {
    document.querySelectorAll('.modal-rankup, .modal-relic-picker').forEach((m) => m.closest('.modal-backdrop')?.remove());
    updateMusicForPhase('menu');
    app.root.appendChild(renderMainMenu(ctx));
    return;
  }

  const rawState = app.run.getState?.() || {};
  const vm = normalizeState(rawState, app.data);
  app.vm = vm;

  if (app.screenOverride === 'battle' || vm.phase === 'resolution') {
    if (!app.activeBattle) {
      const battleArgs = (typeof app.run.startBattle === 'function' ? app.run.startBattle() : null) || {
        data: app.data,
        heroes: vm.heroes.map((hh) => ({ ...hh, onBoard: !!hh.onBoard, benched: !hh.onBoard })),
        enemies: vm.enemies,
        relics: vm.relics.map((r) => r.relicId),
        seed: Date.now() & 0x7fffffff,
      };
      if (!battleArgs.data) battleArgs.data = app.data;
      app.activeBattle = ctx.buildBattle(battleArgs);
      try { ctx.coop?.onBattleStart?.(app.activeBattle); } catch (e) { console.warn('[coop] onBattleStart:', e); }
    }
    updateMusicForPhase('resolution', vm);
    const el = renderBattle(ctx, vm, app.activeBattle, (result, meta) => {
      app.lastBattleMeta = { result, ...meta };
      try { ctx.coop?.onBattleEnd?.(result); } catch (e) { console.warn('[coop] onBattleEnd:', e); }
      app.activeBattle = null;
      app.screenOverride = null;
      try { app.run.finishBattle?.(result); } catch (e) { console.error(e); }
      saveRunIfPossible();
      render();
    });
    app.currentCleanup = el._cleanup;
    app.root.appendChild(el);
    try {
      ctx.coop?.syncLocalStateToRoom?.({ status: 'fighting', floor: vm.floor || 1 });
      ctx.coop?.refreshHudWidget?.();
    } catch (e) { console.warn('[coop]', e); }
    return;
  }

  updateMusicForPhase(vm.phase, vm);

  let screenEl;
  switch (vm.phase) {
    case 'initial':
      screenEl = renderInitialSelection(ctx, vm);
      break;
    case 'intro':
      screenEl = renderIntro(ctx, vm);
      break;
    case 'placement':
    case 'rankup':
      screenEl = renderPlacement(ctx, vm);
      break;
    case 'result':
      screenEl = renderResult(ctx, vm, app.lastBattleMeta);
      break;
    case 'shop':
      screenEl = renderShop(ctx, vm);
      break;
    case 'crossroads':
      screenEl = renderCrossroads(ctx, vm);
      break;
    case 'event':
      screenEl = renderEvent(ctx, vm);
      break;
    case 'campfire':
      screenEl = renderCampfire(ctx, vm);
      break;
    case 'outro':
    case 'complete':
      screenEl = renderEndRun(ctx, vm);
      break;
    default:
      screenEl = renderPlacement(ctx, vm);
      break;
  }
  if (['result', 'shop', 'event', 'campfire', 'outro', 'complete'].includes(vm.phase)) {
    const tp = screenEl?.querySelector?.('.gr-core-right-tracker .gr-tracker-panel');
    if (tp) tp.style.display = 'none';
  }
  app.currentCleanup = screenEl?._cleanup || null;
  app.root.appendChild(screenEl);
  try {
    ctx.coop?.syncLocalStateToRoom?.();
    ctx.coop?.refreshHudWidget?.();
  } catch (e) { console.warn('[coop]', e); }
  if (['placement', 'rankup', 'result', 'shop', 'crossroads', 'event', 'campfire'].includes(vm.phase)) {
    queueMicrotask(() => {
      maybeShowRelicPickerModal(ctx, vm);
      maybeShowRankUpModal(ctx, vm);
    });
  }
}

// ---------------- Bootstrap ----------------
async function boot() {
  app.root = document.getElementById('app') || document.body;
  clear(app.root);
  app.root.appendChild(h('div', { class: 'loading-screen' }, h('div', { class: 'loading-spinner' }, t('ui.loading'))));

  audio.init();
  onLangChange(() => {
    app.run?.refreshLocale?.();
    render();
  });

  try {
    const [data] = await Promise.all([
      loadGameData('./data/game_data.json'),
      loadLogicModules(),
    ]);
    for (const r of Object.values(data?.relics || {})) {
      if (r && !r.icon) r.icon = './assets/sprites/relics/Relic.png';
    }
    for (const hh of Object.values(data?.heroes || {})) {
      if (hh?.stats && Object.prototype.hasOwnProperty.call(hh.stats, 'ManaLockTime')) {
        Object.defineProperty(hh.stats, 'ManaLockTime', {
          value: hh.stats.ManaLockTime,
          enumerable: false,
          writable: true,
          configurable: true,
        });
      }
    }
    app.data = data;
    ctx.coop = createCoopController(ctx);
    if (typeof window !== 'undefined') {
      window.__GUILDRUN_APP__ = { app, ctx };
    }
    render();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const coopCode = params.get('coop');
      if (coopCode && ctx.coop) {
        setTimeout(() => {
          ctx.coop.openLobbyModal(coopCode.trim().toUpperCase());
        }, 250);
      }
    }
  } catch (err) {
    console.error('[boot]', err);
    clear(app.root);
    app.root.appendChild(errorPanel(t('ui.dataMissing'), String(err?.message || err), err?.stack));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', boot);
}
