// Normalizes whatever `run.getState()` returns into a stable view-model for the UI.
// The CONTRACT does not fix the state shape, so every field is read with tolerant fallbacks.

const first = (...vals) => { for (const v of vals) if (v !== undefined && v !== null) return v; return undefined; };
const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

const PHASES = [
  ['initial', ['initialselection', 'initial', 'selection', 'draft', 'start']],
  ['rankup', ['rankup', 'rank_up']],
  ['placement', ['placement', 'prepare', 'preparation', 'deploy']],
  ['intro', ['intro']],
  ['resolution', ['resolution', 'battle', 'combat', 'fight']],
  ['result', ['result', 'reward']],
  ['shop', ['shop', 'store', 'market']],
  ['crossroads', ['crossroad', 'map', 'path', 'route']],
  ['event', ['event']],
  ['campfire', ['campfire', 'camp', 'rest']],
  ['outro', ['outro']],
  ['complete', ['complete', 'gameover', 'game_over', 'end', 'victory', 'defeat', 'finished', 'over']],
];

export function canonicalPhase(raw) {
  const p = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '');
  if (!p) return 'unknown';
  for (const [name, keys] of PHASES) if (keys.some((k) => p === k || p.includes(k))) return name;
  return 'unknown';
}

function normItemObj(v, fallbackUid, data, invMatch = null) {
  const raw = (v && typeof v === 'object') ? v : (invMatch?.raw || {});
  const itemId = first(raw.itemId, raw.defId, raw.id, invMatch?.itemId, v);
  const uid = first(raw.uid, raw.itemUid, raw.instanceId, invMatch?.uid, fallbackUid, itemId);
  const qReq = data?.items?.[itemId]?.quest?.effect?.requiredProgress ?? data?.items?.[itemId]?.quest?.requiredProgress;
  const required = first(raw.required, raw.requiredProgress, invMatch?.required, qReq);
  const progress = first(raw.progress, raw.questProgress, invMatch?.progress, 0);
  const completed = Boolean(first(raw.completed, raw.questCompleted, invMatch?.completed, required != null && required > 0 ? progress >= required : false));
  return { uid, itemId, progress, required, completed, raw: (v && typeof v === 'object') ? v : invMatch?.raw };
}

function normItemRef(v, invByUid, data) {
  if (v == null) return null;
  if (typeof v === 'object') {
    const uid = first(v.uid, v.itemUid, v.instanceId);
    const invMatch = uid != null && invByUid ? invByUid.get(uid) : null;
    return normItemObj(v, null, data, invMatch);
  }
  if (invByUid && invByUid.has(v)) return invByUid.get(v);
  return normItemObj(null, v, data, { uid: v, itemId: v });
}

function normHero(hRaw, idx, invByUid, data, boardPos) {
  if (hRaw == null) return null;
  if (typeof hRaw !== 'object') hRaw = { heroId: hRaw };
  const uid = first(hRaw.uid, hRaw.heroUid, hRaw.instanceId, hRaw.id, `h${idx}`);
  const heroId = first(hRaw.heroId, hRaw.defId, hRaw.def?.id, hRaw.id);
  const pos = boardPos?.get(uid);
  const x = first(pos?.x, hRaw.x, hRaw.pos?.x, hRaw.position?.x);
  const y = first(pos?.y, hRaw.y, hRaw.pos?.y, hRaw.position?.y);
  const explicit = first(hRaw.onBoard, hRaw.placed, hRaw.isOnBoard, hRaw.inBench != null ? !hRaw.inBench : undefined, hRaw.benched != null ? !hRaw.benched : undefined);
  const onBoard = explicit != null ? !!explicit && x != null && y != null : (x != null && y != null && x >= 0 && y >= 0);
  const rank = first(hRaw.rank, hRaw.level, 1);
  return {
    uid, heroId, rank,
    maxItemSlots: first(hRaw.maxItemSlots, rank, 1),
    items: arr(first(hRaw.items, hRaw.itemUids, hRaw.equipment, [])).map((v) => normItemRef(v, invByUid, data)).filter(Boolean),
    x: onBoard ? x : null, y: onBoard ? y : null, onBoard,
    pos: onBoard && x != null && y != null ? { x, y } : null,
    specializationId: first(hRaw.specializationId, hRaw.specId),
    rankModifierIds: arr(first(hRaw.rankModifierIds, hRaw.rankModifiers, [])),
    bonusStats: first(hRaw.bonusStats, hRaw.extraStats, hRaw.permanentStats, null),
    hp: first(hRaw.hp, hRaw.health), status: first(hRaw.status, hRaw.damageState),
    raw: hRaw,
  };
}

function normShopEntry(e, slot, kind, data) {
  if (e == null) return { slot, empty: true, sold: true };
  if (typeof e !== 'object') e = { [kind + 'Id']: e };
  const id = first(e[kind + 'Id'], e.defId, e.id, e.heroId, e.itemId, e.relicId);
  const defs = kind === 'hero' ? data?.heroes : kind === 'item' ? data?.items : data?.relics;
  return {
    slot: first(e.slot, slot), id, [kind + 'Id']: id, rank: first(e.rank, 1),
    price: first(e.price, e.cost, defs?.[id]?.price, 0),
    frozen: !!first(e.frozen, e.locked, false),
    sold: !!first(e.sold, e.bought, e.purchased, false),
    onSale: !!first(e.onSale, e.sale, e.discounted, (e.discount || 0) > 0, false),
    discount: e.discount, raw: e,
  };
}

export function normalizeState(raw, data) {
  const s = raw || {};
  const inv = arr(first(s.inventory, s.items, s.itemInventory, s.bag, [])).map((v, i) => {
    if (v && typeof v === 'object') return normItemObj(v, `i${i}`, data);
    return normItemObj(null, v, data, { uid: v, itemId: v });
  });
  const invByUid = new Map(inv.map((it) => [it.uid, it]));

  let boardPos = null;
  const boardArr = arr(first(s.board?.units, s.boardUnits, Array.isArray(s.board) ? s.board : null, []));
  if (boardArr.length) {
    boardPos = new Map();
    for (const b of boardArr) if (b && typeof b === 'object') boardPos.set(first(b.uid, b.heroUid), { x: b.x, y: b.y });
  }
  let heroesRaw = arr(first(s.heroes, s.roster, s.team, s.party, []));
  const benchRaw = arr(first(s.bench, []));
  if (benchRaw.length && typeof benchRaw[0] === 'object') {
    const known = new Set(heroesRaw.map((x) => x?.uid));
    heroesRaw = heroesRaw.concat(benchRaw.filter((b) => b && !known.has(b.uid)).map((b) => ({ ...b, onBoard: false })));
  }
  const heroes = heroesRaw.map((hr, i) => normHero(hr, i, invByUid, data, boardPos)).filter(Boolean);
  // items that are equipped should not be shown in inventory
  const equipped = new Set(heroes.flatMap((hh) => hh.items.map((it) => it.uid)));
  const inventory = inv.filter((it) => !equipped.has(it.uid) && !(it.raw && (it.raw.heroUid || it.raw.equippedTo)));

  const shopRaw = first(s.shop, s.store, null);
  const shop = shopRaw ? {
    heroes: arr(first(shopRaw.heroes, shopRaw.heroSlots, [])).map((e, i) => normShopEntry(e, i, 'hero', data)),
    items: arr(first(shopRaw.items, shopRaw.itemSlots, [])).map((e, i) => normShopEntry(e, i, 'item', data)),
    relics: arr(first(shopRaw.relics, shopRaw.relicSlots, [])).map((e, i) => normShopEntry(e, i, 'relic', data)),
    rerollCost: first(shopRaw.rerollCost, shopRaw.rerollPrice, s.rerollCost, 1),
    frozen: !!first(shopRaw.frozen, false),
    raw: shopRaw,
  } : null;

  const rawPhase = first(s.phase, s.flowState, s.battleFlowState, s.state, s.screen, s.step, s.node?.type);
  let phase = canonicalPhase(rawPhase);
  const rankUp = first(s.pendingRankUp, s.rankUp, s.rankUpChoice, s.pendingRankUpChoice, s.rankUpChoices ? { choices: s.rankUpChoices } : null);
  const stageId = first(s.stageId, s.currentStageId, s.stage?.id, s.battle?.stageId, s.encounter?.stageId);
  const stage = (stageId != null && data?.stages?.[stageId]) || (s.stage && typeof s.stage === 'object' ? s.stage : null);
  const enemies = arr(first(s.enemies, s.enemyPreview, s.encounter?.enemies, stage?.enemies, [])).map((e) => (typeof e === 'object' ? { enemyId: first(e.enemyId, e.defId, e.id), x: e.x, y: e.y, floor: e.floor } : { enemyId: e }));
  const maxOnBoard = first(s.maxHeroesOnBoard, s.teamSize, s.maxOnBoard, s.boardSize, data?.singletons?.HeroesSingleton?.StartingMaxHeroesOnBoard, 3);

  return {
    raw: s, rawPhase, phase,
    act: first(s.act, s.actIndex != null ? s.actIndex + 1 : undefined, s.progress?.act, 1),
    floor: first(s.floor, s.floorIndex != null ? s.floorIndex + 1 : undefined, s.progress?.floor, s.fightIndex, 1),
    endlessFloorIndex: first(s.endlessFloorIndex, -1),
    endlessScore: first(s.endlessScore, 0),
    stageId, stage, difficulty: first(s.difficulty, s.difficultyId),
    shards: first(s.shards, s.gold, s.currency, s.player?.shards, 0),
    accumulatedShards: first(s.accumulatedShards, s.player?.accumulatedShards),
    lives: first(s.lives, s.health, s.guildHealth, s.player?.lives, s.hp),
    maxLives: first(s.maxLives, s.maxHealth, s.player?.maxLives),
    heroes, inventory,
    relics: arr(first(s.relics, [])).map((r, i) => {
      if (r && typeof r === 'object') {
        const relicId = first(r.relicId, r.defId, r.id);
        const qReq = data?.relics?.[relicId]?.quest?.effect?.requiredProgress ?? data?.relics?.[relicId]?.quest?.requiredProgress;
        const required = first(r.required, r.requiredProgress, qReq);
        const progress = first(r.progress, r.questProgress, 0);
        const completed = Boolean(first(r.completed, r.questCompleted, required != null && required > 0 ? progress >= required : false));
        const customStacks = first(r.customStacks, r.stacks, 0);
        return { uid: first(r.uid, `r${i}`), relicId, progress, required, completed, customStacks, raw: r };
      }
      const qReq = data?.relics?.[r]?.quest?.effect?.requiredProgress ?? data?.relics?.[r]?.quest?.requiredProgress;
      return { uid: `r${i}`, relicId: r, progress: 0, required: qReq, completed: false, customStacks: 0 };
    }),
    shop,
    maxOnBoard,
    maxHeroesOnBoard: maxOnBoard,
    boardCols: first(s.board?.width, data?.board?.width, 7),
    playerRows: first(s.board?.playerRows?.length, data?.board?.playerRows?.length, 4),
    teamSizeCost: first(s.teamSizeCost, s.teamSizePrice, s.shop?.teamSizeCost),
    initialChoices: arr(first(s.initialChoices, s.initialSelection?.choices, s.initialSelection, phase === 'initial' ? s.choices : null, [])),
    crossroads: arr(first(s.crossroadsChoices, s.crossroads?.choices, Array.isArray(s.crossroads) ? s.crossroads : null, phase === 'crossroads' ? s.choices : null, [])),
    event: first(s.event, s.currentEvent, null),
    campfire: first(s.campfire, s.currentCampfire, null),
    rankUp,
    pendingRelicChoices: first(s.pendingRelicChoices, s.relicChoice, null),
    pendingItemChoices: first(s.pendingItemChoices, s.itemChoice, null),
    enemies,
    lastResult: first(s.lastResult, s.lastBattleResult, s.result, null),
    rewards: arr(first(s.rewards, s.lastRewards, s.lastResult?.rewards, [])),
    won: first(s.won, s.victory, s.runWon, s.outcome === 'victory' ? true : s.outcome === 'defeat' ? false : undefined),
    log: arr(first(s.log, s.messages, [])),
  };
}
