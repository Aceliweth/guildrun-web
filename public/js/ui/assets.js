// Sprite path helpers + canvas image cache.
import { getGameData } from '../data.js';

const S = '/assets/sprites';
export const SPR = {
  // Core backgrounds & logos
  keyArt: `${S}/backgrounds/RiftReborn_KeyArt.png`,
  titleBg: `${S}/backgrounds/RiftReborn_KeyArt.png`,
  loading: `${S}/backgrounds/LoadingScreen_Background.png`,
  settingsBg: `${S}/backgrounds/SettingsBackground.png`,
  logo: `${S}/ui/Guildrun_Logo_Long.png`,
  titleLogo: `${S}/ui/Guildrun_Logo_Long.png`,
  titleLogoRift: `${S}/ui/RiftReborn_Logo.png`,
  comicPage: `${S}/comics/IntroductionComic_v5.png`,

  // Buttons & UI chrome
  buttonLine: `${S}/ui/Button_01_TopLayer.png`,
  buttonFill: `${S}/ui/Button_01_BottomLayer.png`,
  buttonDeco: `${S}/ui/Button_01_Decos.png`,
  buttonIconFrame: `${S}/ui/Button_Small.png`,
  buttonIconFill: `${S}/ui/Button_Small.png`,
  btnBottom: `${S}/ui/Button_01_BottomLayer.png`,
  btnTop: `${S}/ui/Button_01_TopLayer.png`,
  btnDecos: `${S}/ui/Button_01_Decos.png`,
  btnDisabled: `${S}/ui/Button_01_Disabled.png`,
  btnSecondary: `${S}/ui/SecondaryButton.png`,
  btnTertiary: `${S}/ui/TertiaryButton_A.png`,
  topVignette: `${S}/ui/Top_Vignette.png`,
  guildSignup: `${S}/ui/2_GuildSignup.png`,
  battleWon: `${S}/ui/BattleWon_Deco.png`,
  battleWonDeco: `${S}/ui/BattleWon_Deco.png`,
  defeat: `${S}/ui/3_Defeat.png`,

  // Board & tokens
  tileOpen: `${S}/ui/Tile_Open.png`,
  tileFilled: `${S}/ui/Tile_Filled.png`,
  enemyRound: `${S}/enemies/Enemy_round.png`,
  boss: `${S}/enemies/Boss.png`,
  actBoss: `${S}/enemies/ActBoss.png`,
  bossTokenAvail: `${S}/enemies/BossToken_Small_Available.png`,
  bossTokenEmpty: `${S}/enemies/BossToken_Small_Empty.png`,

  // Map & events
  eventPlaceholder: `${S}/map_events/EventImage_Placeholder.png`,
  campfire: `${S}/map_events/CampFire.png`,
  campFire: `${S}/map_events/CampFire.png`,
  campfireImage: `${S}/map_events/EventImage_FirstCampfire.png`,
  eventIcon: `${S}/map_events/Event.png`,
  fightIcon: `${S}/map_events/FightEvent_472.png`,
  fightRoom: `${S}/map_events/FightRoom.png`,
  gateIcon: `${S}/map_events/GateIcon.png`,
  artifactIcon: `${S}/map_events/ArtifactRewardEventIcon.png`,
  endIcon: `${S}/map_events/EndEventIcon.png`,
  cyclone: `${S}/map_events/Cyclone.png`,
  dots: `${S}/map_events/Dots.png`,
  eventArc: `${S}/map_events/EventBackground_Arc01.png`,
  chunkMiddle: `${S}/map_events/ChunkMap_Middle.png`,
  chunkSides: `${S}/map_events/ChunkMap_Sides.png`,
  chunkTimer: `${S}/map_events/ChunkMap_Timer_Background.png`,

  // Currencies, stabilizer & HUD icons
  shard: `${S}/traits_stats/Shard_2.png`,
  shardSmall: `${S}/traits_stats/Shard_S.png`,
  stabilizerNormal: `${S}/traits_stats/Stabilizer_Normal.png`,
  stabilizerBroken: `${S}/traits_stats/Stabilizer_Broken.png`,
  dmgIcon: `${S}/ui/Damage.png`,
  shieldIcon: `${S}/traits_stats/Shield.png`,
  healIcon: `${S}/traits_stats/Heal.png`,
  heroIcon: `${S}/ui/HeroIcon.png`,
  invIcon: `${S}/ui/InventoryIcon.png`,
  trackerIcon: `${S}/ui/TrackerIcon.png`,
  lock: `${S}/ui/Icon_Lock.png`,
  freeze: `${S}/ui/FreezeIcon.png`,
  freezeIcon: `${S}/ui/FreezeIcon.png`,
  reroll: `${S}/ui/RerollIcon.png`,
  rerollIcon: `${S}/ui/RerollIcon.png`,
  sell: `${S}/ui/SellIcon.png`,
  sellIcon: `${S}/ui/SellIcon.png`,
  sellBtn: `${S}/ui/SellButton.png`,
  sellIconFrame: `${S}/ui/SellButton_IconFrame.png`,
  saleBox: `${S}/ui/SaleBox.png`,
  settings: `${S}/ui/SettingsIcon.png`,
  resetIcon: `${S}/ui/icon_reset.png`,
  star: `${S}/ui/Icon_Star.png`,
  crown: `${S}/ui/Crown.png`,
  speedBg: `${S}/backgrounds/BattleSpeed_Background.png`,
  speedAuto: `${S}/ui/AutoSpeed.png`,
  speed1x: `${S}/ui/BattleSpeed_Icon_1x.png`,
  speed2x: `${S}/ui/BattleSpeed_Icon_2x.png`,
  speed3x: `${S}/ui/BattleSpeed_Icon_3x.png`,
  tabBg: `${S}/backgrounds/TabBackground.png`,
  tabBgActive: `${S}/backgrounds/TabBackground_Active.png`,
  invBg: `${S}/backgrounds/Inventory_Background.png`,
  trackerBg: `${S}/backgrounds/DamageTrackerBackground.png`,
  trackerFrame: `${S}/backgrounds/DamageTrackerBackground_Frame.png`,
  trackerSimple: `${S}/backgrounds/DamageTrackerBackground_Simple.png`,
  goldPlateDouble: `${S}/backgrounds/GoldPlateBackground_Double.png`,
  shopDeco: `${S}/backgrounds/Shop_WindowBackground_Deco.png`,
  textbox: `${S}/ui/Textbox.png`,
  tooltipFill: `${S}/ui/Tooltip_Fill.png`,
  tooltipOuter: `${S}/ui/Tooltip_OuterFrame.png`,

  // Hero card banners, frames & slots
  bannerEmpty: `${S}/ui/Banner_Empty.png`,
  bannerSteel: `${S}/ui/HeroCard_Banner_Frames_Steel.png`,
  bannerSteelBack: `${S}/ui/HeroCard_Banner_Frames_Steel_Back.png`,
  bannerLine: `${S}/ui/HeroCard_Banner_Frame_Line.png`,
  bannerPopupBg: `${S}/ui/HeroBanner_PopupBG.png`,
  sidePopupBg: `${S}/ui/HeroBanner_Side_PopupBG.png`,
  abilityFrame: `${S}/skills/AbilityFrame.png`,
  abilityFrameEmpty: `${S}/skills/AbilityFrame_Empty.png`,
  itemSlotSmall: `${S}/ui/UI_ItemFrame.png`,
  uiItemFrame: `${S}/ui/UI_ItemFrame.png`,
  itemFrameEmpty: `${S}/ui/ItemFrame_Empty.png`,
  itemFrameSmallEmpty: `${S}/ui/ItemFrame_Empty_Small.png`,
  portraitEmpty: `${S}/ui/PortraitFrame_Empty.png`,
  relicGeneric: `${S}/relics/Relic.png`,
  shopBg: `${S}/backgrounds/Shop_WindowBackground_Deco.png`,
};

export const RANK_LETTERS = ['C', 'B', 'A', 'S'];
/** APPROX: rank is assumed 1-based (1=C … 4=S, HeroesSingleton.MaxHeroRank=4); 0 is treated as C. */
export function rankLetter(rank) {
  if (typeof rank === 'string' && /^[CBAS]$/i.test(rank)) return rank.toUpperCase();
  const r = Number(rank) || 1;
  return RANK_LETTERS[Math.max(0, Math.min(3, r - 1))];
}
export const rankFrame = (rank) => `${S}/ui/PortraitFrame_Default_${rankLetter(rank)}.png`;
export const rankFrameSmall = (rank) => `${S}/ui/PortraitFrame_Small_${rankLetter(rank)}.png`;
export const miniCardFrame = (rank) => `${S}/ui/MiniCard_Frame_${rankLetter(rank)}.png`;
export const rankBadge = (rank) => `${S}/ui/Rank_${rankLetter(rank)}.png`;

/** Swap the _C/_B/_A/_S rank suffix inside a portrait path when present. */
export function rankedPath(path, rank) {
  if (!path) return path;
  const L = rankLetter(rank);
  return path.replace(/_([CBAS])(?=(_Med)?\.png$)/, `_${L}`);
}

const RARITY_LETTER = { common: 'C', rare: 'B', epic: 'A', legendary: 'S', unique: 'Z', enemy: 'Z', quest: 'B' };
const RARITY_NUM = ['C', 'B', 'A', 'S', 'Z'];
export const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary', 'Unique'];
/** APPROX: numeric rarity assumed 0=Common,1=Rare,2=Epic,3=Legendary,4=Unique. */
export function rarityLetter(r) {
  if (r == null) return 'C';
  if (typeof r === 'number') return RARITY_NUM[Math.max(0, Math.min(4, r))];
  const k = String(r).toLowerCase();
  for (const [name, L] of Object.entries(RARITY_LETTER)) if (k.includes(name)) return L;
  return 'C';
}
export function rarityName(r) {
  if (typeof r === 'number') return RARITY_NAMES[Math.max(0, Math.min(4, r))];
  if (!r) return 'Common';
  const s = String(r);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const itemFrame = (r, small) => `${S}/ui/ItemFrame_${rarityLetter(r)}${small ? '_Small' : ''}.png`;
export const relicFrame = (r) => `${S}/ui/RelicFrame_${rarityLetter(r)}.png`;

function enLoc(v) {
  const d = getGameData();
  if (v && typeof v === 'object') return v.en || v.fr || '';
  if (typeof v === 'string' && d?.loc?.[v]) return d.loc[v].en || d.loc[v].fr || v;
  return v || '';
}

function byRankLookup(collection, rank) {
  if (!collection) return null;
  const L = rankLetter(rank);
  const idx = Math.max(0, RANK_LETTERS.indexOf(L));
  if (Array.isArray(collection)) return collection[idx] || collection[0] || null;
  if (typeof collection === 'object') return collection[L] || collection[idx] || collection.C || null;
  return null;
}

export function heroDef(heroId) { return getGameData()?.heroes?.[heroId] || null; }
export function enemyDef(enemyId) { return getGameData()?.enemies?.[enemyId] || null; }

export function heroPortrait(heroId, kind = 'round', rank = 1) {
  const def = heroDef(heroId);
  const L = rankLetter(rank);
  const visualName = (def?.visual || enLoc(def?.name)).replace(/\s+/g, '');
  if (kind === 'breakout') {
    return byRankLookup(def?.breakoutByRank, rank)
      || rankedPath(def?.halfBody, rank)
      || (visualName ? `${S}/portraits/${visualName}_FrameBreak_${L}.png` : heroPortrait(heroId, 'card', rank));
  }
  if (kind === 'full') {
    return byRankLookup(def?.fullBodyByRank, rank)
      || rankedPath(def?.fullBody, rank)
      || (visualName ? `${S}/portraits/FullBody_${visualName}_${L}.png` : null);
  }
  if (kind === 'round') {
    return def?.portraitRound
      || (visualName ? `${S}/portraits/${visualName}_round.png` : null)
      || def?.portrait
      || SPR.heroIcon;
  }
  if (kind === 'square') {
    return def?.portraitSquare
      || byRankLookup(def?.croppedByRank, rank)
      || rankedPath(def?.portrait, rank)
      || (visualName ? `${S}/portraits/${visualName}_Cropped_${L}.png` : null)
      || def?.portraitRound
      || SPR.heroIcon;
  }
  // card (cropped / halfBody)
  return byRankLookup(def?.croppedByRank, rank)
    || byRankLookup(def?.halfBodyByRank, rank)
    || rankedPath(def?.portrait, rank)
    || (visualName ? `${S}/portraits/${visualName}_Cropped_${L}.png` : def?.portraitRound || SPR.heroIcon);
}

export function enemyIcon(enemyId) {
  const def = enemyDef(enemyId);
  return def?.icon || def?.portraitRound || def?.portrait || SPR.enemyRound;
}

const CLASS_ICON_MAP = {
  Warrior: 'Warrior',
  Guerrier: 'Warrior',
  Fighter: 'Warrior',
  Vanguard: 'Vanguard',
  'Avant-garde': 'Vanguard',
  Avantgarde: 'Vanguard',
  Bruiser: 'Vanguard',
  Mystic: 'Mystic',
  Mystique: 'Mystic',
  Caster: 'Mystic',
  Assassin: 'Assassin',
  Tank: 'Tank',
  Duelist: 'Duelist',
  Duelliste: 'Duelist',
  Mage: 'Mage',
};

const CLASS_BANNER_MAP = {
  Warrior: 'Fighter',
  Guerrier: 'Fighter',
  Vanguard: 'Bruiser',
  'Avant-garde': 'Bruiser',
  Avantgarde: 'Bruiser',
  Mystic: 'Caster',
  Mystique: 'Caster',
  Fighter: 'Fighter',
  Bruiser: 'Bruiser',
  Caster: 'Caster',
  Assassin: 'Assassin',
  Tank: 'Tank',
  Duelist: 'Duelist',
  Duelliste: 'Duelist',
  Mage: 'Mage',
};

function resolveClassDef(classIdOrName) {
  const classes = getGameData()?.classes;
  if (!classes || classIdOrName == null) return null;
  if (classes[classIdOrName]) return classes[classIdOrName];
  const q = String(classIdOrName).trim().toLowerCase();
  for (const c of Object.values(classes)) {
    if (
      String(c.id).toLowerCase() === q ||
      String(c.name?.en || '').toLowerCase() === q ||
      String(c.name?.fr || '').toLowerCase() === q
    ) {
      return c;
    }
  }
  return null;
}

export function classIcon(classId, noFrame = false) {
  const c = resolveClassDef(classId);
  if (c?.icon && !noFrame) return c.icon;
  const rawName = (c ? enLoc(c.name) : String(classId || '')).replace(/\s+/g, '');
  const spriteName = CLASS_ICON_MAP[rawName] || rawName;
  if (!spriteName) return `${S}/traits_stats/ClassIcon.png`;
  return `${S}/traits_stats/${spriteName}${noFrame ? '_NoFrame' : ''}.png`;
}

export function classBanner(classId) {
  const c = resolveClassDef(classId);
  const rawName = (c ? enLoc(c.name) : String(classId || '')).replace(/\s+/g, '');
  const bannerName = CLASS_BANNER_MAP[rawName] || rawName;
  return bannerName ? `${S}/ui/Banner_${bannerName}.png` : SPR.bannerEmpty;
}

export function guildBanner(guildId) {
  const g = getGameData()?.guilds?.[guildId];
  if (g?.icon) return g.icon;
  const name = enLoc(g?.name).replace(/\s+/g, '');
  return name ? `${S}/ui/GuildBanner_${name}.png` : null;
}

export function itemIcon(itemId) {
  const it = getGameData()?.items?.[itemId];
  return it?.icon || `${S}/items/Item_${String(itemId).replace(/\D/g, '')}.png`;
}
export function relicIcon(relicId) {
  const r = getGameData()?.relics?.[relicId];
  return r?.icon || `${S}/relics/Relic_${String(relicId).replace(/\D/g, '')}.png`;
}
export function abilityIcon(abilityId, passive) {
  const d = getGameData();
  const a = passive
    ? (d?.passiveAbilities?.[abilityId] || d?.activeAbilities?.[abilityId])
    : (d?.activeAbilities?.[abilityId] || d?.passiveAbilities?.[abilityId]);
  return a?.icon || SPR.abilityFrameEmpty;
}

const STAT_ICON = {
  MaxHealth: 'HP', Defense: 'Defense', Attack: 'Attack', Magic: 'Magic', AttackSpeed: 'AttackSpeed', Crit: 'Crit',
  ManaRegen: 'ManaRegen', AttackRange: 'AttackRange', MaxMana: 'Mana', StartingMana: 'Mana', OmniVamp: 'Omnivamp',
  DamageAmp: 'DamageAmp', HPPerSecond: 'HPRegen', BaseAttackDamage: 'BaseAttack', MoveSpeed: 'Movement',
  BaseTrueDamage: 'BaseTrueDamage', BonusTrueDamage: 'BonusTrueDamage', BaseAttackSpeed: 'AttackSpeed',
};
export const statIcon = (stat) => `${S}/traits_stats/${STAT_ICON[stat] || stat}.png`;

const STATUS_ICON = {
  burn: 'traits_stats/Burn', poison: 'traits_stats/Poison', frost: 'traits_stats/Frost', stun: 'traits_stats/Healthbar_StatusIcon_Stun',
  stealth: 'traits_stats/Healthbar_StatusIcon_Stealth', shield: 'traits_stats/Healthbar_StatusIcon_Shield',
  immunity: 'traits_stats/Healthbar_StatusIcon_Immunity', bleed: 'traits_stats/StatusEffectIcon_Bleed', taunt: 'traits_stats/CrowdControl',
  debuff: 'traits_stats/Debuff', heal: 'traits_stats/Heal', rush: 'traits_stats/Rush', stall: 'traits_stats/Stall',
};
export function statusIcon(name) {
  const k = String(name).toLowerCase();
  for (const [key, p] of Object.entries(STATUS_ICON)) if (k.includes(key)) return `${S}/${p}.png`;
  return `${S}/traits_stats/Debuff.png`;
}

const KEYWORD_TAG_ICONS = {
  burn: `${S}/traits_stats/Burn.png`,
  frost: `${S}/traits_stats/Frost.png`,
  poison: `${S}/traits_stats/Poison.png`,
  bleed: `${S}/traits_stats/StatusEffectIcon_Bleed.png`,
  stun: `${S}/traits_stats/Healthbar_StatusIcon_Stun.png`,
  shield: `${S}/traits_stats/Shield.png`,
  shields: `${S}/traits_stats/Shield.png`,
  heal: `${S}/traits_stats/Heal.png`,
  stall: `${S}/traits_stats/Stall.png`,
  rush: `${S}/traits_stats/Rush.png`,
  crit: `${S}/traits_stats/Crit.png`,
  omnivamp: `${S}/traits_stats/Omnivamp.png`,
  shards: `${S}/traits_stats/Economy.png`,
  shard: `${S}/traits_stats/Economy.png`,
  economy: `${S}/traits_stats/Economy.png`,
};

/** Keyword / status icon badges for the top-right stack on a HeroCard. */
export function heroKeywords(heroId) {
  const d = getGameData();
  const def = d?.heroes?.[heroId];
  if (!def) return [];

  // Use explicit hero tags from game_data.json when present
  if (Array.isArray(def.tags)) {
    const out = [];
    for (const rawTag of def.tags) {
      const k = String(rawTag || '').trim().toLowerCase();
      if (!k) continue;
      const ic = KEYWORD_TAG_ICONS[k];
      if (ic && !out.includes(ic)) out.push(ic);
      if (out.length >= 3) break;
    }
    return out;
  }

  // Fallback: inspect active + passive ability descriptions
  const act = d?.activeAbilities?.[def.activeAbilityId];
  const pas = d?.passiveAbilities?.[def.passiveAbilityId];
  const desc = `${enLoc(act?.description)} ${enLoc(pas?.description)}`.toLowerCase();
  const kwOrder = [
    ['burn', KEYWORD_TAG_ICONS.burn],
    ['frost', KEYWORD_TAG_ICONS.frost],
    ['poison', KEYWORD_TAG_ICONS.poison],
    ['bleed', KEYWORD_TAG_ICONS.bleed],
    ['stun', KEYWORD_TAG_ICONS.stun],
    ['shield', KEYWORD_TAG_ICONS.shield],
    ['heal', KEYWORD_TAG_ICONS.heal],
    ['stall', KEYWORD_TAG_ICONS.stall],
    ['rush', KEYWORD_TAG_ICONS.rush],
    ['crit', KEYWORD_TAG_ICONS.crit],
    ['omnivamp', KEYWORD_TAG_ICONS.omnivamp],
    ['shard', KEYWORD_TAG_ICONS.shards],
  ];
  const out = [];
  for (const [k, ic] of kwOrder) {
    if (desc.includes(k)) out.push(ic);
    if (out.length >= 2) break;
  }
  return out;
}

/** Full-bleed 1920x1080 composite stage background URL matching Unity stage scenes. */
export function stageComposite(stage, act = 1) {
  const env = String(stage?.environment || stage?.visual || '').toLowerCase();
  const type = String(stage?.stageType || '').toLowerCase();
  if (type.includes('boss') && !type.includes('mini')) {
    return `${S}/backgrounds/RuinsForest_Boss_Composite.png`;
  }
  if (env.includes('purple') || env.includes('cave')) {
    return `${S}/backgrounds/PurpleCave_Composite.png`;
  }
  if (env.includes('blue') || env.includes('cavern') || act === 2) {
    return `${S}/backgrounds/BlueCavern_Composite.png`;
  }
  if (env.includes('desert') || act >= 3) {
    return `${S}/backgrounds/RedDesert_Composite.png`;
  }
  const tod = ['Morning', 'Dusk', 'Evening'][Math.max(0, Math.min(2, ((stage?.floor || 1) - 1) % 3))];
  return `${S}/backgrounds/RuinsForest_${tod}_Composite.png`;
}

/** Multi-layer stage parallax map for RuinsForest / Cavern / Desert / Boss stages. */
export function stageLayerMap(stage, act = 1) {
  const env = String(stage?.environment || '').toLowerCase();
  const type = String(stage?.stageType || '').toLowerCase();
  const comp = stageComposite(stage, act);
  if (type.includes('boss')) {
    return {
      composite: comp,
      sky: `${S}/enemies/RuinsForest_Sky_Boss.png`,
      bg3: `${S}/enemies/RuinsForest_BossStage_Background_3.png`,
      bg2: `${S}/enemies/RuinsForest_BossStage_Background_2.png`,
      bg1: `${S}/enemies/RuinsForest_BossStage_Background_1.png`,
      ground: comp,
      bush: `${S}/backgrounds/RuinsForest_Foreground_Bush.png`,
    };
  }
  const tod = ['Morning', 'Dusk', 'Evening'][Math.max(0, Math.min(2, ((stage?.floor || 1) - 1) % 3))];
  return {
    composite: comp,
    sky: `${S}/backgrounds/RuinsForest_Sky_${tod}.png`,
    bg3: comp,
    bg2: `${S}/backgrounds/RuinsForest_Background_02_${tod}.png`,
    bg1: `${S}/backgrounds/RuinsForest_Background_01_${tod}.png`,
    ground: comp,
    bush: `${S}/backgrounds/RuinsForest_Foreground_Bush.png`,
  };
}

/** Stage background layers (sky, back, front) for the battle renderer. */
export function stageLayers(stage, act = 1) {
  const c = stageLayerMap(stage, act);
  return {
    composite: c.composite,
    sky: c.sky,
    back: c.composite,
    mid: c.bg2,
    far: c.bg3,
    ground: c.ground,
    front: c.bush,
  };
}

// ---- Canvas image cache ----
const cache = new Map();
export function getImage(url) {
  if (!url) return null;
  let e = cache.get(url);
  if (!e) {
    const im = new Image();
    e = { im, ok: false, failed: false };
    im.onload = () => { e.ok = true; };
    im.onerror = () => { e.failed = true; };
    im.src = url;
    cache.set(url, e);
  }
  return e.ok ? e.im : null;
}
export function preload(urls) {
  return Promise.all(urls.filter(Boolean).map((u) => new Promise((res) => {
    getImage(u);
    const e = cache.get(u);
    if (e.ok || e.failed) return res();
    e.im.addEventListener('load', res, { once: true });
    e.im.addEventListener('error', res, { once: true });
    setTimeout(res, 4000);
  })));
}
