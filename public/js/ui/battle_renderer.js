// Canvas 2D battle renderer: composite stage background, foreshortened stone-circle hex board,
// full-body hero & monster cutouts with cel-shaded outlines, overhead item slot + segmented HP/mana bars,
// projectiles, floating damage numbers, and detailed combat stat tracking for Tracker & Result screens.
import { getGameData, txt } from '../data.js';
import { getImage, preload, heroPortrait, enemyIcon, itemIcon, statusIcon, stageLayers, SPR } from './assets.js';
import { hexCenter, hexPath, boardDims, boardInfo } from './hex.js';
import { resolveStageComposite, getMonsterCutoutUrl } from './screens_board.js';
import { createModel3DRenderer, yawToward } from './model3d_renderer.js';
import { getInspectedUnitUid } from './tooltip.js';
import { audio } from '../audio.js';

const VFX_BASE = '/assets/sprites/vfx/';
const VFX_TEX = {
  slash3: `${VFX_BASE}Slash3.png`,
  slash1: `${VFX_BASE}Slash1.png`,
  ringSlash: `${VFX_BASE}CommonRingSlash.png`,       // 2x2 flipbook
  commonSlash: `${VFX_BASE}CommonSlash.png`,         // 2x2 flipbook
  ringWhirl: `${VFX_BASE}VFX_Tex_Ring_08.png`,
  ringWave: `${VFX_BASE}VFX_Tex_Ring_06.png`,
  ringSpiked: `${VFX_BASE}VFX_Tex_Ring_03_b.png`,
  arcaneRing: `${VFX_BASE}ArcaneRing.png`,
  ringSpiky: `${VFX_BASE}RingSpiky.png`,
  ringVortex: `${VFX_BASE}RingVortex.png`,
  ringShockwave: `${VFX_BASE}RingShockwave.png`,
  firePentacle: `${VFX_BASE}T_VFX_Fire_Pentacle.png`,
  icePentacle: `${VFX_BASE}T_VFX_IceMagic_Pentacle.png`,
  decalFairy: `${VFX_BASE}Arrows_Rain_Tex_Decal_Fairy_2.png`,
  decalShock: `${VFX_BASE}Arrows_Rain_Tex_Decal_Shock.png`,
  decalFirePillar: `${VFX_BASE}Elemental_Pilar_Decal_Indicator_Fire.png`,
  frozenGround: `${VFX_BASE}Tex_FrozeGround_HighRes_mod.png`,
  crater: `${VFX_BASE}Crater14_b.png`,
  craterBig: `${VFX_BASE}Crater28_b.png`,
  crack4: `${VFX_BASE}VFX_Tex_Crack_04.png`,
  crack5: `${VFX_BASE}VFX_Tex_Crack_05.png`,
  lightning3x3: `${VFX_BASE}HandPaintedLightning2.png`, // 3x3 flipbook
  thunder3x1: `${VFX_BASE}Thunder_6_3x1.png`,           // 3x1 flipbook
  shardLightning: `${VFX_BASE}ShardLightning.png`,     // 4x4 flipbook
  lightningHit2x2: `${VFX_BASE}LightningHitCenter2.png`, // 2x2 flipbook
  fire4x2: `${VFX_BASE}FireFlipbook.png`,               // 4x2 flipbook
  fireBurst: `${VFX_BASE}VFX_Tex_Fire_01.png`,
  ice6x6: `${VFX_BASE}IceFlame_6x6.png`,               // 6x6 flipbook
  snowflake: `${VFX_BASE}VFX_Tex_Snowflake_01.png`,
  leaf2x2: `${VFX_BASE}LeafAtlas_Nature.png`,          // 2x2 flipbook
  vines: `${VFX_BASE}VFX_Tex_Vines_00.png`,
  fangs: `${VFX_BASE}FangsBite.png`,
  blood4x4: `${VFX_BASE}CommonBloodSplash.png`,        // 4x4 flipbook
  bloodCone: `${VFX_BASE}BloodCone4.png`,
  arrow0: `${VFX_BASE}VFX_Tex_Arrow_00.png`,
  arrow1: `${VFX_BASE}VFX_Tex_Arrow_01.png`,
  arrow2: `${VFX_BASE}VFX_Tex_Arrow_02.png`,
  bow: `${VFX_BASE}VFX_Tex_Bow_01.png`,
  burstCone: `${VFX_BASE}BurstCone2.png`,
  beam: `${VFX_BASE}Beam01_03.png`,
  beamUp: `${VFX_BASE}Beam_Upwards.png`,
  impact3x3: `${VFX_BASE}T_Impact02_3x3.png`,          // 3x3 flipbook
  animeImpact: `${VFX_BASE}AnimeImpact.png`,
  starFlare: `${VFX_BASE}StarImpactFlare.png`,
  starburst: `${VFX_BASE}StarburstImpact.png`,
  darkFlare: `${VFX_BASE}T_VFX_DarkMagic_Flare.png`,
  electricFlare: `${VFX_BASE}T_VFX_ElectricMagic_Flare_02.png`,
  soundFlare: `${VFX_BASE}T_VFX_SoundMagic_Flare.png`,
  voidRing: `${VFX_BASE}T_VFX_VoidMagic_Ring.png`,
  bubble: `${VFX_BASE}Bubble.png`,
  shieldHex: `${VFX_BASE}Tex_YellowShieldPattern.png`,
  expansiveWave: `${VFX_BASE}ExpansiveWave.png`,
  sparkle: `${VFX_BASE}Tex_6PointSparkle.png`,
};

const DT = 0.032; // CONTRACT: fixed sim dt
// Fraction of the (possibly compressed) attack clip at which the weapon strikes; the sim's
// 'attack' event (damage / projectile launch) is aligned on this frame.
const ATTACK_HIT_FRAC = 0.42;
// Spell clips longer than this are played slightly faster so the caster resumes fighting.
const SKILL_MAX_PLAY_SEC = 1.6;
const TEAM_COLORS = { 1: '#22c55e', 2: '#dc2626' };
const DMG_COLORS = {
  physical: '#ffffff',
  attack: '#fde047',
  magic: '#c084fc',
  magical: '#c084fc',
  ability: '#c084fc',
  true: '#fef08a',
  burn: '#fb923c',
  poison: '#4ade80',
  frost: '#38bdf8',
  bleed: '#f43f5e',
};

const pickNum = (...v) => {
  for (const x of v) if (typeof x === 'number' && isFinite(x)) return x;
  return 0;
};
const uidOf = (e, ...keys) => {
  for (const k of keys) if (e[k] != null) return e[k];
  return null;
};

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function drawCover(ctx, im, W, H, alpha = 1) {
  if (!im) return;
  const s = Math.max(W / im.width, H / im.height);
  const w = im.width * s;
  const hh = im.height * s;
  ctx.globalAlpha = alpha;
  ctx.drawImage(im, (W - w) / 2, (H - hh) / 2, w, hh);
  ctx.globalAlpha = 1;
}

export function createBattleRenderer(canvas, { battle, stage, act = 1, heroes = [], onEnd, onTickStats }) {
  const data = getGameData() || {};
  const ctx = canvas.getContext('2d');
  const glCanvas = document.createElement('canvas');
  const model3d = createModel3DRenderer(glCanvas);
  const { W: BW, H: BH, playerRows } = boardInfo(data);
  const compositeUrl = resolveStageComposite(stage, act);
  const layers = stageLayers(stage, act);

  const fx = { texts: [], rings: [], particles: [], lines: [], vfx: [], coins: [], flashes: new Map(), shake: 0 };
  const disp = new Map(); // uid -> {x, y, prevGridX, prevGridY, lungeX, lungeY, alpha, deadAt, yaw, animState, animTime, attackTimer, skillTimer, moveTimer}
  const trails = new Map();

  function unitReqBase(u) {
    if (u.team === 1) return { heroId: u.defId, team: 'hero' };
    return { enemyId: u.defId, name: data.enemies?.[u.defId]?.name || u.name, team: 'enemy' };
  }

  function unitAudioKey(u) {
    if (!u) return 'sfx';
    if (u.team === 1) return `hero.${u.defId}`;
    const eDef = data.enemies?.[u.defId];
    const rawVis = String(eDef?.visual || u.visual || '').toLowerCase().replace(/\s+/g, '');
    if (rawVis) return `enemy.${rawVis}`;
    return 'enemy.crab';
  }

  // Detailed per-unit combat metrics
  const dmgBySource = new Map();
  const abilityDmgBySource = new Map();
  const attackDmgBySource = new Map();
  const mitigatedBySource = new Map();
  const takenBySource = new Map();
  const healedBySource = new Map();
  const statusesBySource = new Map(); // uid -> Map<statusName, count>

  // Map hero uid -> equipped itemIds for overhead item box rendering
  const heroItemsByUid = new Map();
  for (const hh of heroes || []) {
    if (hh && hh.uid != null && Array.isArray(hh.items) && hh.items.length) {
      heroItemsByUid.set(hh.uid, hh.items);
      heroItemsByUid.set(String(hh.uid), hh.items);
    }
  }

  let speed = 1;
  let running = false;
  let ended = false;
  let endTimer = 0;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let geo = null;
  let ticks = 0;

  // Preload stage composite, fallback layers, 2D sprites, real Unity VFX textures, 3D models, and FMOD SFX/VO
  const initialUrls = [
    compositeUrl,
    layers.sky,
    layers.back,
    layers.front,
    SPR.tileOpen,
    SPR.shard,
    ...Object.values(VFX_TEX),
  ];
  const audioPreloadKeys = ['sfx.attack', 'sfx.hit', 'sfx.crit', 'sfx.cast', 'sfx.heal', 'sfx.shield', 'sfx.death', 'ui.shard_select'];
  for (const u of battle.state?.units || []) {
    const ak = unitAudioKey(u);
    audioPreloadKeys.push(`${ak}.attack`, `${ak}.hit`, `${ak}.skill`, `${ak}.skill_hit`);
    if (u.team === 1) {
      audioPreloadKeys.push(`vo.${u.defId}.attack`, `vo.${u.defId}.special`, `vo.${u.defId}.death`);
      initialUrls.push(heroPortrait(u.defId, 'full', u.rank));
      initialUrls.push(heroPortrait(u.defId, 'card', u.rank));
      initialUrls.push(heroPortrait(u.defId, 'round', u.rank));
      const eq = u.items || heroItemsByUid.get(u.uid) || heroItemsByUid.get(String(u.uid));
      if (Array.isArray(eq) && eq[0]) {
        initialUrls.push(itemIcon(eq[0].itemId ?? eq[0].id ?? eq[0]));
      }
      model3d?.preloadUnit({ heroId: u.defId, team: 'hero' });
    } else {
      audioPreloadKeys.push(`${ak}.roar`);
      initialUrls.push(getMonsterCutoutUrl(u.defId));
      initialUrls.push(enemyIcon(u.defId));
      const eDef = data.enemies?.[u.defId];
      model3d?.preloadUnit({ enemyId: u.defId, name: eDef?.name, team: 'enemy' });
    }
  }
  preload(initialUrls);
  audio?.preload?.(audioPreloadKeys);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const cssW = canvas.clientWidth || r.width || 960;
    const cssH = canvas.clientHeight || r.height || 540;
    canvas.width = Math.max(320, Math.round(cssW * dpr));
    canvas.height = Math.max(240, Math.round(cssH * dpr));
    glCanvas.width = canvas.width;
    glCanvas.height = canvas.height;
    const cw = canvas.width;
    const ch = canvas.height;
    // Match the foreshortened stone-circle perspective from Screenshot 4
    const scaleY = 0.66;
    const boardAreaW = cw * 0.50;
    const boardAreaH = ch * 0.44;
    const size = Math.min(
      boardAreaW / (Math.sqrt(3) * (BW + 0.5)),
      boardAreaH / ((1.5 * (BH - 1) + 2) * scaleY)
    );
    const dims = boardDims(BW, BH, size);
    const centerX = cw * 0.485;
    const centerY = ch * 0.565;
    const ox = centerX - dims.width / 2;
    const oy = centerY - (dims.height * scaleY) / 2;
    geo = { size, scaleY, ox, oy, cw, ch, dpr };
  }

  function toPx(x, y) {
    const p = hexCenter(x, y, geo.size, BH);
    return { x: geo.ox + p.x, y: geo.oy + p.y * geo.scaleY };
  }

  function unitCutoutImg(u) {
    if (u.team === 1) {
      return (
        getImage(heroPortrait(u.defId, 'full', u.rank)) ||
        getImage(heroPortrait(u.defId, 'card', u.rank)) ||
        getImage(heroPortrait(u.defId, 'round', u.rank))
      );
    }
    return (
      getImage(getMonsterCutoutUrl(u.defId)) ||
      getImage(enemyIcon(u.defId)) ||
      getImage(SPR.enemyRound)
    );
  }

  function unitMap() {
    const m = new Map();
    for (const u of battle.state?.units || []) m.set(u.uid, u);
    return m;
  }

  function addMapNum(map, key, val) {
    if (key == null || !val) return;
    map.set(key, (map.get(key) || 0) + val);
  }

  function addStatusCount(srcUid, statusName, stacks = 1) {
    if (srcUid == null || !statusName) return;
    const norm = String(statusName).toLowerCase();
    let sub = statusesBySource.get(srcUid);
    if (!sub) {
      sub = new Map();
      statusesBySource.set(srcUid, sub);
    }
    sub.set(norm, (sub.get(norm) || 0) + Math.max(1, Number(stacks) || 1));
  }

  function addText(x, y, text, color, big = false) {
    fx.texts.push({
      x: x + (Math.random() - 0.5) * geo.size * 0.45,
      y,
      text,
      color,
      big,
      t: 0,
      life: big ? 1.05 : 0.85,
    });
  }

  // ---------- Ultimate / ability VFX ----------
  const VFX_COLORS = {
    magic: '#c084fc', magical: '#c084fc', ability: '#c084fc', physical: '#fbbf24', attack: '#fbbf24',
    true: '#fef08a', burn: '#fb923c', frost: '#38bdf8', poison: '#4ade80', bleed: '#f43f5e',
    heal: '#4ade80', shield: '#93c5fd', stun: '#fde047', stealth: '#a5b4fc',
  };
  const SPELL_PALETTE = {
    irini_spear: '#38bdf8',
    hoyoung_snipe: '#f43f5e',
    reyna_volley: '#4ade80',
    reyna_combo: '#4ade80',
    ayaka_shuriken: '#a855f7',
    selkhera_curse: '#9333ea',
    selkhera_petrify: '#9333ea',
    seraphael_barrage: '#fde047',
    nyxa_combo: '#f43f5e',
    nyxa_flurry: '#f43f5e',
    floeria_sanctuary: '#4ade80',
    floeria_bloom: '#4ade80',
    niklas_forge: '#fb923c',
    niklas_slam: '#fb923c',
    fiona_bulwark: '#fde047',
    fiona_shield: '#fde047',
    rook_fissure: '#d97706',
    skorn_taunt: '#ef4444',
    logan_leap: '#dc2626',
    funke_cocktail: '#f97316',
    funke_molotov: '#f97316',
    molotov_fire: '#f97316',
    tilly_spin: '#ec4899',
    gustav_blizzard: '#38bdf8',
    ratna_starfall: '#c084fc',
    starfall_bolt: '#c084fc',
    cenk_Fortress: '#60a5fa',
    cenk_roar: '#60a5fa',
    javryn_ricochet: '#facc15',
    javryn_volley: '#facc15',
    javryn_dagger: '#facc15',
    ming_mantra: '#f97316',
    pimenta_spray: '#ef4444',
    sal_permafrost: '#7dd3fc',
    dragomir_bite: '#e11d48',
    dragomir_devour: '#e11d48',
    joey_slam: '#fbbf24',
    josephina_salvation: '#fef08a',
    zuri_toxin: '#4ade80',
    hricu_orb: '#c084fc',
    hricu_chaos: '#c084fc',
    crab_shell: '#38bdf8',
    slime_splash: '#4ade80',
    slime_cleanse: '#4ade80',
    spider_bite: '#a855f7',
    spider_web: '#e2e8f0',
    web_shot: '#e2e8f0',
    mushroom_guard: '#a3e635',
    healer_bloom: '#4ade80',
    mushroom_arrow: '#84cc16',
    archer_snipe: '#84cc16',
    mushroom_fire: '#f97316',
    fire_storm: '#f97316',
    mushroom_ice: '#38bdf8',
    frost_storm: '#38bdf8',
    tank_bash: '#f59e0b',
    plant_whip: '#22c55e',
    vine_hook: '#22c55e',
    vine_root: '#22c55e',
    snake_spit: '#4ade80',
    snake_venom: '#4ade80',
    lizard_bounce: '#facc15',
    turtle_shell: '#60a5fa',
    golem_slam: '#d97706',
    hydra_multi: '#a855f7',
    hydra_bite: '#a855f7',
    dragon_fire: '#f97316',
    dragon_frost: '#38bdf8',
    dragon_poison: '#4ade80',
    demon_apocalypse: '#ef4444',
    demon_anger: '#ef4444',
    mimic_chomp: '#fbbf24',
  };
  const LEAP_SKILLS = new Set([
    'logan_leap', 'lizard_bounce', 'joey_slam', 'rook_fissure', 'golem_slam',
    'niklas_slam', 'tank_bash', 'mimic_chomp',
  ]);
  const SPIN_SKILLS = new Set(['tilly_spin']);
  const castWindow = new Map(); // uid -> remaining seconds during which hits count as ultimate impacts

  function posOf(uid) {
    const d = disp.get(uid);
    if (d) return { x: d.x, y: d.y };
    const u = (battle.state?.units || []).find((o) => o.uid === uid);
    return u ? toPx(u.x, u.y) : null;
  }

  function addVfx(v) {
    fx.vfx.push({ t: 0, ...v });
  }

  function impactBurst(x, y, color, scale = 1) {
    addVfx({ kind: 'burst', x, y, color, life: 0.55, scale });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random()) * geo.size * 2.4 * scale;
      fx.particles.push({
        x, y: y - geo.size * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - geo.size * 0.6,
        t: 0, life: 0.5 + Math.random() * 0.25, color,
      });
    }
  }

  function startSkillAnim(u, tgt, ev = {}) {
    const d = disp.get(u.uid);
    if (!d) return;
    const clipDur = model3d?.getAnimDuration?.(d.req, 'skill', 1.2) || 1.2;
    const totalDur = Number(ev.totalDuration) > 0.1
      ? Number(ev.totalDuration)
      : Math.min(2.6, Math.max(0.85, clipDur));
    // Play the full 3D skill clip across the exact simulation totalDuration so windup + strike + recovery match 1:1
    d.skillRate = clipDur > 0.05 ? clipDur / totalDur : 1;
    d.skillTimer = totalDur;
    d.skillTotalDur = totalDur;
    d.skillWindup = Number(ev.windup) || totalDur * 0.45;
    d.skillVfxKind = ev.vfxKind || '';
    d.skillTime = 0;
    d.animState = 'skill';
    d.animTime = 0;
    if (LEAP_SKILLS.has(d.skillVfxKind)) {
      d.jumpDur = Math.max(0.35, d.skillWindup * 1.05);
      d.jumpTimer = d.jumpDur;
      d.jumpHeight = geo.size * (d.skillVfxKind === 'logan_leap' || d.skillVfxKind === 'lizard_bounce' ? 1.15 : 0.65);
    }
    if (SPIN_SKILLS.has(d.skillVfxKind)) {
      d.spinTimer = totalDur * 0.85;
    }
    if (tgt && tgt.uid !== u.uid) {
      const a = posOf(u.uid);
      const b = posOf(tgt.uid);
      if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 1) {
        d.targetYaw = yawToward(b.x - a.x, b.y - a.y, geo.scaleY || 0.66);
      }
    }
  }

  function spawnSpellCastVfx(u, tgt, ev) {
    if (!u || !geo) return;
    const vfxKind = ev.vfxKind || '';
    const color = SPELL_PALETTE[vfxKind] || (u.team === 1 ? '#fde047' : '#f87171');
    const p = posOf(u.uid) || toPx(u.x, u.y);
    const tpos = (tgt && posOf(tgt.uid)) || (ev.targetX != null && ev.targetY != null ? toPx(ev.targetX, ev.targetY) : p);

    fx.rings.push({ x: p.x, y: p.y, t: 0, life: 0.55, color });
    fx.shake = Math.max(fx.shake, 3.2);

    if (vfxKind === 'irini_spear') {
      addVfx({ kind: 'thunderbolt', x: tpos.x, y: tpos.y, color: '#38bdf8', life: 0.65 });
      if (tgt && tgt.uid !== u.uid) {
        addVfx({ kind: 'beam', ax: p.x, ay: p.y, bx: tpos.x, by: tpos.y, color: '#7dd3fc', life: 0.35 });
      }
    } else if (vfxKind === 'hoyoung_snipe' || vfxKind === 'archer_snipe') {
      addVfx({ kind: 'railgun', ax: p.x, ay: p.y, bx: tpos.x, by: tpos.y, color, life: 0.45 });
      impactBurst(tpos.x, tpos.y, color, 1.45);
      fx.shake = Math.max(fx.shake, 5.0);
    } else if (vfxKind === 'reyna_volley' || vfxKind === 'reyna_combo' || vfxKind === 'mushroom_arrow' || vfxKind === 'javryn_volley') {
      const baseAng = Math.atan2(tpos.y - p.y, tpos.x - p.x);
      addVfx({ kind: 'cone_waves', x: p.x, y: p.y, ang: baseAng, spread: 0.65, color, life: 0.5 });
    } else if (vfxKind === 'ayaka_shuriken') {
      addVfx({ kind: 'shuriken_burst', x: p.x, y: p.y, color: '#c084fc', life: 0.55 });
    } else if (vfxKind === 'selkhera_curse' || vfxKind === 'selkhera_petrify' || vfxKind === 'demon_apocalypse' || vfxKind === 'demon_anger') {
      addVfx({ kind: 'dark_pillar', x: tpos.x, y: tpos.y, color, life: 0.85, scale: vfxKind.startsWith('demon_') ? 1.8 : 1.25 });
    } else if (vfxKind === 'seraphael_barrage') {
      const ang = Math.atan2(tpos.y - p.y, tpos.x - p.x);
      addVfx({ kind: 'harmonic_beam', ax: p.x, ay: p.y, bx: p.x + Math.cos(ang) * geo.size * 5.2, by: p.y + Math.sin(ang) * geo.size * 5.2, color: '#fde047', life: 0.85 });
    } else if (vfxKind === 'nyxa_combo' || vfxKind === 'nyxa_flurry' || vfxKind === 'spider_bite' || vfxKind === 'spider_web') {
      addVfx({ kind: 'cross_slash', x: tpos.x, y: tpos.y, color, life: 0.5 });
    } else if (vfxKind === 'floeria_sanctuary' || vfxKind === 'floeria_bloom' || vfxKind === 'healer_bloom' || vfxKind === 'slime_cleanse' || vfxKind === 'slime_splash') {
      addVfx({ kind: 'nova_ring', x: p.x, y: p.y, color: '#4ade80', life: 0.9, scale: 2.2 });
    } else if (vfxKind === 'niklas_forge' || vfxKind === 'niklas_slam' || vfxKind === 'tank_bash') {
      addVfx({ kind: 'anvil_strike', x: tpos.x, y: tpos.y, color: '#fb923c', life: 0.7 });
    } else if (vfxKind === 'fiona_bulwark' || vfxKind === 'fiona_shield' || vfxKind === 'crab_shell' || vfxKind === 'turtle_shell' || vfxKind === 'cenk_Fortress' || vfxKind === 'cenk_roar' || vfxKind === 'mushroom_guard') {
      addVfx({ kind: 'shield_dome', x: p.x, y: p.y, color, life: 0.85, scale: 1.5 });
    } else if (vfxKind === 'rook_fissure' || vfxKind === 'golem_slam') {
      const ang = Math.atan2(tpos.y - p.y, tpos.x - p.x);
      addVfx({ kind: 'seismic_spikes', x: p.x, y: p.y, ang, color: '#f59e0b', life: 0.8 });
      fx.shake = Math.max(fx.shake, 5.5);
    } else if (vfxKind === 'skorn_taunt') {
      addVfx({ kind: 'nova_ring', x: p.x, y: p.y, color: '#ef4444', life: 0.75, scale: 2.5 });
    } else if (vfxKind === 'logan_leap' || vfxKind === 'joey_slam' || vfxKind === 'lizard_bounce') {
      addVfx({ kind: 'sky_cleave', x: tpos.x, y: tpos.y, color, life: 0.7 });
      impactBurst(tpos.x, tpos.y, color, 1.65);
      fx.shake = Math.max(fx.shake, 6.0);
    } else if (vfxKind === 'tilly_spin') {
      addVfx({ kind: 'whirlwind', uid: u.uid, x: p.x, y: p.y, color: '#f472b6', life: 0.85 });
    } else if (vfxKind === 'gustav_blizzard' || vfxKind === 'sal_permafrost' || vfxKind === 'mushroom_ice' || vfxKind === 'frost_storm' || vfxKind === 'dragon_frost') {
      addVfx({ kind: 'ice_spikes', x: tpos.x, y: tpos.y, color: '#38bdf8', life: 0.8 });
    } else if (vfxKind === 'ratna_starfall' || vfxKind === 'hricu_orb' || vfxKind === 'hricu_chaos') {
      // Spawn falling meteors onto enemy positions
      const enemies = (battle.state?.units || []).filter((o) => o.team !== u.team && o.hp > 0);
      const targets = enemies.length ? enemies.slice(0, 4) : [{ x: u.x, y: u.y }];
      targets.forEach((en, idx) => {
        const ep = posOf(en.uid) || toPx(en.x, en.y);
        addVfx({ kind: 'meteor_fall', x: ep.x, y: ep.y, delay: idx * 0.1, color: '#c084fc', life: 0.65 });
      });
    } else if (vfxKind === 'ming_mantra' || vfxKind === 'funke_cocktail' || vfxKind === 'funke_molotov' || vfxKind === 'pimenta_spray' || vfxKind === 'dragon_fire' || vfxKind === 'mushroom_fire' || vfxKind === 'fire_storm') {
      addVfx({ kind: 'fire_pillar', x: tpos.x, y: tpos.y, color: '#f97316', life: 0.75 });
    } else if (vfxKind === 'dragomir_bite' || vfxKind === 'dragomir_devour' || vfxKind === 'hydra_bite' || vfxKind === 'hydra_multi' || vfxKind === 'mimic_chomp') {
      addVfx({ kind: 'fangs_bite', x: tpos.x, y: tpos.y, ax: p.x, ay: p.y, color, life: 0.65 });
    } else if (vfxKind === 'vine_hook' || vfxKind === 'vine_root' || vfxKind === 'plant_whip' || vfxKind === 'snake_venom' || vfxKind === 'snake_spit' || vfxKind === 'dragon_poison' || vfxKind === 'zuri_toxin') {
      addVfx({ kind: 'beam', ax: p.x, ay: p.y, bx: tpos.x, by: tpos.y, color: '#22c55e', life: 0.45 });
      impactBurst(tpos.x, tpos.y, '#4ade80', 1.25);
    } else if (vfxKind === 'josephina_salvation') {
      const allies = (battle.state?.units || []).filter((o) => o.team === u.team && o.hp > 0);
      allies.forEach((al) => {
        const ap = posOf(al.uid) || toPx(al.x, al.y);
        addVfx({ kind: 'holy_pillar', x: ap.x, y: ap.y, color: '#fef08a', life: 0.85 });
      });
    } else {
      addVfx({ kind: 'burst', x: p.x, y: p.y, color, life: 0.5, scale: 1.35 });
      if (tgt && tgt.uid !== u.uid && tgt.team !== u.team) {
        addVfx({ kind: 'beam', ax: p.x, ay: p.y, bx: tpos.x, by: tpos.y, color, life: 0.32 });
      }
    }
  }

  function processEvents(events, silent = false) {
    if (!events?.length) return;
    const units = unitMap();
    for (const e of events) {
      const type = String(e.type || '').toLowerCase();
      const tgtUid = uidOf(e, 'targetUid', 'target', 'uid', 'unitUid');
      const srcUid = uidOf(e, 'sourceUid', 'source', 'attackerUid', 'casterUid');
      const tgt = units.get(tgtUid);
      const src = units.get(srcUid);
      const amount = pickNum(e.amount, e.value, e.damage, e.heal, e.shield);
      const mitigated = pickNum(e.mitigated, e.blocked, e.absorbed, e.reduced);
      const tp = tgt ? toPx(tgt.x, tgt.y) : null;

      if (type === 'damage') {
        const dt = String(e.damageType || e.kind || e.element || e.sourceType || 'physical').toLowerCase();
        const isBasicAttack = dt === 'attack' || dt === 'physical' || e.isAttack === true || (e.abilityId == null && dt !== 'magic' && dt !== 'burn' && dt !== 'poison' && dt !== 'frost');
        if (srcUid != null) {
          addMapNum(dmgBySource, srcUid, amount);
          if (isBasicAttack) addMapNum(attackDmgBySource, srcUid, amount);
          else addMapNum(abilityDmgBySource, srcUid, amount);
        }
        if (tgtUid != null) {
          addMapNum(takenBySource, tgtUid, amount);
          if (mitigated > 0) addMapNum(mitigatedBySource, tgtUid, mitigated);
          else if (tgt?.stats?.Defense > 0) {
            const estMit = amount * (tgt.stats.Defense / (tgt.stats.Defense + 100));
            addMapNum(mitigatedBySource, tgtUid, estMit);
          }
        }
        if (!silent && tp && geo) {
          const crit = !!(e.crit || e.isCrit);
          const isStatusOrStorm = e.origin === 'status' || e.origin === 'storm' || dt === 'burn' || dt === 'poison' || dt === 'frost' || dt === 'bleed';
          const isUlt = e.origin === 'ability' || (srcUid != null && castWindow.has(srcUid) && !isStatusOrStorm);
          const vfxKind = castWindow.get(srcUid)?.vfxKind || '';
          const ultColor = SPELL_PALETTE[vfxKind] || VFX_COLORS[dt] || '#c084fc';
          addText(
            tp.x,
            tp.y - geo.size * 0.75,
            `${Math.round(amount)}${crit ? '!' : ''}`,
            crit ? '#fde047' : isUlt ? ultColor : DMG_COLORS[dt] || '#ffffff',
            crit || isUlt
          );
          if (tgt) fx.flashes.set(tgt.uid, isUlt ? 0.22 : 0.14);
          if (crit) fx.shake = Math.max(fx.shake, 3.5);

          // Play authentic FMOD Hit / Skill Hit SFX
          if (!isStatusOrStorm) {
            const actor = src || tgt;
            if (isUlt) {
              audio?.playSfx?.(`${unitAudioKey(actor)}.skill_hit`, { volume: 0.88 });
            } else if (isBasicAttack) {
              audio?.playSfx?.(`${unitAudioKey(actor)}.hit`, { volume: 0.78 });
              if (crit) audio?.playSfx?.('sfx.crit', { volume: 0.72 });
            }
          }

          const tpos = (tgt && posOf(tgt.uid)) || tp;
          if (isUlt && tgt) {
            impactBurst(tpos.x, tpos.y, ultColor, 1.05);
            const spos = srcUid != null ? posOf(srcUid) : null;
            if (spos && Math.hypot(spos.x - tpos.x, spos.y - tpos.y) <= geo.size * 1.45) {
              addVfx({ kind: 'slash', x: tpos.x, y: tpos.y, color: ultColor, life: 0.34, ang: Math.atan2(tpos.y - spos.y, tpos.x - spos.x) });
            }
            fx.shake = Math.max(fx.shake, 2.5);
          } else if (isBasicAttack && !isStatusOrStorm) {
            addVfx({
              kind: 'hit_spark',
              x: tpos.x,
              y: tpos.y,
              color: crit ? '#fde047' : (src?.team === 1 ? '#fef08a' : '#f87171'),
              crit,
              life: crit ? 0.38 : 0.26,
              rot: Math.random() * Math.PI * 2,
            });
          }
        }
      } else if (type === 'heal') {
        const healerUid = srcUid ?? tgtUid;
        if (healerUid != null && amount > 0) addMapNum(healedBySource, healerUid, amount);
        if (!silent && tp && amount > 0 && geo) {
          addText(tp.x, tp.y - geo.size * 0.75, `+${Math.round(amount)}`, '#4ade80');
          if (tgtUid != null && (e.origin === 'ability' || castWindow.has(srcUid) || amount >= 25)) {
            addVfx({ kind: 'heal', uid: tgtUid, color: VFX_COLORS.heal, life: 0.9, seed: Math.random() * 10 });
            audio?.playSfx?.('sfx.heal', { volume: 0.65 });
          }
        }
      } else if (type === 'shield') {
        const casterUid = srcUid ?? tgtUid;
        if (casterUid != null && amount > 0) addMapNum(healedBySource, casterUid, amount);
        if (tgtUid != null && amount > 0) addMapNum(mitigatedBySource, tgtUid, amount * 0.5);
        if (!silent && tp && amount > 0 && geo) {
          addText(tp.x, tp.y - geo.size * 0.75, `+${Math.round(amount)}`, '#e2e8f0');
          if (tgtUid != null) {
            addVfx({ kind: 'bubble', uid: tgtUid, color: VFX_COLORS.shield, life: 1.0 });
            if (amount >= 15) audio?.playSfx?.('sfx.shield', { volume: 0.68 });
          }
        }
      } else if (type === 'dash') {
        const u = units.get(e.uid) || src || tgt;
        if (!silent && u && geo) {
          const fromPx = e.fromX != null ? toPx(e.fromX, e.fromY) : posOf(u.uid);
          const toP = e.toX != null ? toPx(e.toX, e.toY) : toPx(u.x, u.y);
          const color = SPELL_PALETTE[e.vfxKind] || (u.team === 1 ? '#38bdf8' : '#f87171');
          if (fromPx && toP) {
            addVfx({ kind: 'afterimage', ax: fromPx.x, ay: fromPx.y, bx: toP.x, by: toP.y, color, life: 0.42 });
          }
          const d = disp.get(u.uid);
          if (d) {
            d.prevGridX = u.x;
            d.prevGridY = u.y;
            if (fromPx && toP && Math.hypot(toP.x - fromPx.x, toP.y - fromPx.y) > 2) {
              d.targetYaw = yawToward(toP.x - fromPx.x, toP.y - fromPx.y, geo.scaleY || 0.66);
            }
            if (LEAP_SKILLS.has(e.vfxKind) || e.reason === 'leap') {
              d.jumpDur = 0.36;
              d.jumpTimer = 0.36;
              d.jumpHeight = geo.size * 1.1;
            }
          }
        }
      } else if (type === 'aoe') {
        if (!silent && geo && e.x != null && e.y != null) {
          const ap = toPx(e.x, e.y);
          const color = SPELL_PALETTE[e.vfxKind] || VFX_COLORS[e.kind] || '#38bdf8';
          fx.rings.push({ x: ap.x, y: ap.y, t: 0, life: 0.65, color });
        }
      } else if (type === 'caststart') {
        // Ultimate begins: skill animation + spell-specific charge aura + authentic FMOD VO & skill SFX.
        const u = src || tgt;
        if (!silent && u && geo) {
          const p = posOf(u.uid) || toPx(u.x, u.y);
          const ab = data.activeAbilities?.[e.abilityId];
          const color = SPELL_PALETTE[e.vfxKind] || (u.team === 1 ? '#fde047' : '#f87171');
          if (ab) addText(p.x, p.y - geo.size * 1.6, txt(ab.name), '#fef08a', true);
          const windup = Math.max(0.28, Number(e.windup) || 0.6);
          addVfx({ kind: 'charge', uid: u.uid, color, life: windup + 0.12 });
          if (e.vfxKind === 'hoyoung_snipe' && tgt) {
            addVfx({ kind: 'sniper_aim', srcUid: u.uid, tgtUid: tgt.uid, color: '#f43f5e', life: windup });
          }
          const ak = unitAudioKey(u);
          audio?.playSfx?.(`${ak}.skill`, { volume: 0.92 });
          if (u.team === 1) {
            audio?.playSfx?.(`vo.${u.defId}.special`, { volume: 0.98 });
          } else {
            audio?.playSfx?.(`${ak}.roar`, { volume: 0.85 });
          }
          startSkillAnim(u, tgt, e);
        }
      } else if (type === 'cast') {
        // Ultimate resolves (impact frame).
        const u = src || tgt;
        if (!silent && u && geo) {
          const p = posOf(u.uid) || toPx(u.x, u.y);
          castWindow.set(u.uid, { t: 1.35, vfxKind: e.vfxKind || '' });
          const d = disp.get(u.uid);
          const ak = unitAudioKey(u);
          // Fallback when the ultimate was not announced by castStart
          if (d && !(d.skillTimer > 0)) {
            const ab = data.activeAbilities?.[e.abilityId];
            if (ab) addText(p.x, p.y - geo.size * 1.6, txt(ab.name), '#fef08a', true);
            audio?.playSfx?.(`${ak}.skill`, { volume: 0.92 });
            if (u.team === 1) audio?.playSfx?.(`vo.${u.defId}.special`, { volume: 0.98 });
            startSkillAnim(u, tgt, e);
          } else {
            audio?.playSfx?.(`${ak}.skill_hit`, { volume: 0.88 });
          }
          spawnSpellCastVfx(u, tgt, e);
        }
      } else if (type === 'death') {
        const u = tgt || src;
        if (!silent && u && geo) {
          if (u.team === 1) {
            audio?.playSfx?.(`vo.${u.defId}.death`, { volume: 0.95 });
          }
          audio?.playSfx?.('sfx.death', { volume: 0.78 });
          const p = toPx(u.x, u.y);
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (0.5 + Math.random()) * geo.size * 2.0;
            fx.particles.push({
              x: p.x,
              y: p.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              t: 0,
              life: 0.65,
              color: TEAM_COLORS[u.team] || '#fff',
            });
          }
          fx.shake = Math.max(fx.shake, 2.5);
          const d = disp.get(u.uid);
          if (d) {
            d.deadAt = performance.now();
            d.animState = 'death';
            d.animTime = 0;
          }
        }
      } else if (type === 'attack') {
        if (!silent && src && tgt && geo) {
          const ak = unitAudioKey(src);
          audio?.playSfx?.(`${ak}.attack`, { volume: 0.82 });
          if (src.team === 1 && Math.random() < 0.26) {
            audio?.playSfx?.(`vo.${src.defId}.attack`, { volume: 0.76 });
          }
          const a = toPx(src.x, src.y);
          const b = toPx(tgt.x, tgt.y);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ang = Math.atan2(dy, dx);
          const d = disp.get(src.uid);
          if (d) {
            d.lungeX = (dx / len) * geo.size * (e.isRanged ? 0.06 : 0.22);
            d.lungeY = (dy / len) * geo.size * (e.isRanged ? 0.06 : 0.22);
            d.lastHitTime = battle.state?.time ?? 0;
            d.targetYaw = yawToward(dx, dy, geo.scaleY || 0.66);
          }
          if (!e.isRanged) {
            addVfx({
              kind: 'melee_slash',
              x: b.x - (dx / len) * geo.size * 0.10,
              y: b.y,
              ang,
              color: src.team === 1 ? '#fde047' : '#f87171',
              variant: (src.defId || 0) % 3,
              life: 0.38,
            });
          } else {
            addVfx({
              kind: 'ranged_muzzle',
              x: a.x + (dx / len) * geo.size * 0.32,
              y: a.y,
              ang,
              color: src.team === 1 ? '#7dd3fc' : '#f87171',
              isBow: src.defId === 3 || src.defId === 20 || String(data.enemies?.[src.defId]?.visual || '').toLowerCase().includes('archer'),
              life: 0.28,
            });
          }
          fx.lines.push({
            ax: a.x,
            ay: a.y - geo.size * 0.25,
            bx: b.x,
            by: b.y - geo.size * 0.25,
            t: 0,
            life: 0.14,
            color: src.team === 1 ? 'rgba(253,224,71,0.75)' : 'rgba(248,113,113,0.75)',
          });
        }
      } else if (type === 'status') {
        const stName = String(e.status || e.name || e.statusType || '');
        if (srcUid != null && stName) {
          addStatusCount(srcUid, stName, e.stacks ?? e.amount ?? 1);
        }
        if (!silent && stName && tgtUid != null && geo) {
          const key = stName.toLowerCase();
          const color = VFX_COLORS[key];
          if (color && !fx.vfx.some((v) => v.kind === 'puff' && v.uid === tgtUid && v.t < 0.3)) {
            addVfx({ kind: 'puff', uid: tgtUid, statusKey: key, color, life: 0.6 });
            if (castWindow.has(srcUid)) {
              const p = posOf(tgtUid);
              if (p) addText(p.x, p.y - geo.size * 1.05, stName.toUpperCase(), color, false);
            }
          }
        }
      } else if (type === 'shards') {
        const shAmt = Math.max(1, Math.round(e.amount || 1));
        if (!silent && geo) {
          audio?.playSfx?.('ui.shard_select', { volume: 0.85 });
          const sp =
            e.x != null && e.y != null
              ? toPx(e.x, e.y)
              : tp || posOf(srcUid) || { x: geo.cw * 0.5, y: geo.ch * 0.55 };
          addText(sp.x, sp.y - geo.size * 1.2, `+${shAmt} SHARDS`, '#fbbf24', true);
          fx.rings.push({ x: sp.x, y: sp.y, t: 0, life: 0.55, color: '#fbbf24' });
          const coinCount = Math.min(12, Math.max(3, shAmt * 2));
          const hudX = geo.cw * 0.355;
          const hudY = geo.ch * 0.038;
          for (let c = 0; c < coinCount; c++) {
            const ang = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.2;
            const spd = (1.6 + Math.random() * 1.8) * geo.size;
            const landOffX = (Math.random() - 0.5) * geo.size * 1.3;
            const landOffY = (Math.random() - 0.5) * geo.size * 0.7;
            fx.coins.push({
              x: sp.x,
              y: sp.y - geo.size * 0.4,
              startX: sp.x,
              startY: sp.y - geo.size * 0.4,
              vx: Math.cos(ang) * spd,
              vy: -Math.abs(Math.sin(ang)) * spd - geo.size * (1.5 + Math.random() * 1.2),
              groundY: sp.y + landOffY,
              landX: sp.x + landOffX,
              hudX,
              hudY,
              t: -c * 0.035,
              dropLife: 0.62,
              flyLife: 0.52,
              spin: Math.random() * Math.PI * 2,
              spinSpeed: 8 + Math.random() * 6,
              bounced: false,
            });
          }
          // Update the live HUD Shard counter in the top bar
          const shardHudSpan = document.querySelector('.gr-top-shards span, .gr-chunk-wing.left span');
          if (shardHudSpan) {
            const curVal = parseInt(shardHudSpan.textContent, 10);
            if (Number.isFinite(curVal)) {
              shardHudSpan.textContent = String(curVal + shAmt);
            }
          }
        }
      } else if (type === 'reinforcementSpawn') {
        if (!silent && geo) {
          audio?.playSfx?.('sfx.cast', { volume: 0.9 });
          const sp = e.x != null && e.y != null ? toPx(e.x, e.y) : { x: geo.cw * 0.5, y: geo.ch * 0.6 };
          addText(sp.x, sp.y - geo.size * 1.4, `⚡ RENFORT (${e.partnerName || 'ALLIÉ'})`, '#fde047', true);
          addVfx({ kind: 'holy_pillar', x: sp.x, y: sp.y, color: '#38bdf8', scale: 1.35, life: 0.9 });
          addVfx({ kind: 'nova_ring', x: sp.x, y: sp.y, color: '#facc15', scale: 1.6, life: 0.75 });
          fx.shake = Math.max(fx.shake, 3.5);
        }
      }
    }
  }

  function buildDetailedStats() {
    // Also harvest any unit-level status applications or combatStats if present on battle.state.units
    for (const u of battle.state?.units || []) {
      const uid = u.uid;
      if (uid == null) continue;
      const cs = u.combatStats || {};
      const dealt = cs.damageDealt ?? u.damageDealt ?? 0;
      const taken = cs.damageTaken ?? u.damageTaken ?? 0;
      const mit = cs.damageMitigated ?? 0;
      const heal = cs.healingDone ?? u.healingDone ?? 0;
      if (dealt > (dmgBySource.get(uid) || 0)) dmgBySource.set(uid, dealt);
      if (taken > (takenBySource.get(uid) || 0)) takenBySource.set(uid, taken);
      if (mit > (mitigatedBySource.get(uid) || 0)) mitigatedBySource.set(uid, mit);
      if (heal > (healedBySource.get(uid) || 0)) healedBySource.set(uid, heal);
    }
    return {
      damageBySource: dmgBySource,
      abilityDamageBySource: abilityDmgBySource,
      attackDamageBySource: attackDmgBySource,
      mitigatedBySource,
      takenBySource,
      healedBySource,
      statusesBySource,
      ticks,
    };
  }

  let steppedInFrame = false;
  function step(realDt) {
    steppedInFrame = false;
    if (!ended) {
      acc += realDt * speed;
      let n = 0;
      while (acc >= DT && n < 400) {
        if (battle.isOver()) break;
        battle.tick();
        ticks++;
        steppedInFrame = true;
        processEvents(battle.state?.events);
        acc -= DT;
        n++;
      }
      if (battle.isOver()) {
        ended = true;
        endTimer = fx.coins.length > 0 ? 1.25 : 0.9;
      }
    } else if (endTimer > 0) {
      endTimer -= realDt;
      if (endTimer <= 0) finish();
    }
  }

  function finish() {
    stop();
    let result;
    try {
      result = battle.result();
    } catch (err) {
      result = { winner: 'draw', error: String(err) };
    }
    onEnd?.(result, buildDetailedStats());
  }

  function drawForeshortenedHex(cx, cy, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const px = cx + s * Math.cos(a);
      const py = cy + s * Math.sin(a) * geo.scaleY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawBoard() {
    const prs = new Set(playerRows);
    for (let r = 0; r < BH; r++) {
      for (let c = 0; c < BW; c++) {
        const p = toPx(c, r);
        const s = geo.size * 0.94;
        drawForeshortenedHex(p.x, p.y, s);
        ctx.strokeStyle = prs.has(r) ? 'rgba(210, 230, 245, 0.10)' : 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1.2 * geo.dpr;
        ctx.stroke();
      }
    }
  }

  function drawOverheadHud(u, cx, topY) {
    const dpr = geo.dpr;
    const bw = Math.round(68 * dpr);
    const bh = Math.round(11 * dpr);
    const manaH = Math.round(3 * dpr);
    const bx = Math.round(cx - bw / 2);
    const by = Math.round(topY);

    // 1. Small square item slots (1..4 by rank / maxItemSlots) directly above HP bar for player heroes
    if (u.team === 1) {
      const eq = u.items || heroItemsByUid.get(u.uid) || heroItemsByUid.get(String(u.uid)) || [];
      const slotCount = Math.max(1, Math.min(4, Math.max(Number(u.maxItemSlots) || Number(u.rank) || 1, Array.isArray(eq) ? eq.length : 1)));
      const boxSz = Math.round(16 * dpr);
      const gap = Math.round(2 * dpr);
      const totalW = slotCount * boxSz + (slotCount - 1) * gap;
      const startX = Math.round(cx - totalW / 2);
      const iby = by - boxSz - Math.round(2 * dpr);
      for (let sIdx = 0; sIdx < slotCount; sIdx++) {
        const ibx = startX + sIdx * (boxSz + gap);
        ctx.fillStyle = 'rgba(10, 13, 18, 0.92)';
        ctx.fillRect(ibx, iby, boxSz, boxSz);
        ctx.strokeStyle = '#685338';
        ctx.lineWidth = Math.max(1, 1.2 * dpr);
        ctx.strokeRect(ibx + 0.5, iby + 0.5, boxSz - 1, iby ? boxSz - 1 : boxSz - 1);
        const itEntry = Array.isArray(eq) ? eq[sIdx] : null;
        if (itEntry != null) {
          const itId = typeof itEntry === 'object' ? (itEntry.itemId ?? itEntry.id) : itEntry;
          const itIm = getImage(itemIcon(itId));
          if (itIm) {
            ctx.drawImage(itIm, ibx + 1, iby + 1, boxSz - 2, boxSz - 2);
          }
        }
      }
    }

    // 2. Segmented HP bar with 100-HP ticks and centered integer HP number
    const maxHp = Math.max(1, u.maxHp || 1);
    const curHp = Math.max(0, u.hp || 0);
    const shield = Math.max(0, u.shield || 0);
    const totalCap = Math.max(maxHp, curHp + shield);

    // Outer dark housing
    ctx.fillStyle = 'rgba(10, 13, 18, 0.94)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + manaH + 3);
    ctx.strokeStyle = u.isReinforcement ? '#c5a059' : '#07090d';
    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + manaH + 3);

    // HP fill
    const hpW = Math.round((bw * curHp) / totalCap);
    if (hpW > 0) {
      ctx.fillStyle = u.isReinforcement ? '#0d9488' : u.team === 1 ? '#22c55e' : '#dc2626';
      ctx.fillRect(bx, by, hpW, bh);
      // Glossy top bevel
      ctx.fillStyle = u.isReinforcement ? '#2dd4bf' : u.team === 1 ? '#4ade80' : '#ef4444';
      ctx.fillRect(bx, by, hpW, Math.max(2, Math.round(bh * 0.35)));
    }
    if (u.isReinforcement) {
      const boxSz = Math.round(16 * dpr);
      const tagY = by - boxSz - Math.round(6 * dpr);
      const allyTag = String(u.partnerName || 'ALLIÉ').toUpperCase();
      ctx.font = `700 ${Math.round(8 * dpr)}px "Trebuchet MS", "Segoe UI", sans-serif`;
      const tw = Math.ceil(ctx.measureText(allyTag).width) + Math.round(10 * dpr);
      const th = Math.round(12 * dpr);
      const tx = Math.round(cx - tw / 2);
      const ty = tagY - th;
      ctx.fillStyle = 'rgba(11, 18, 22, 0.94)';
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = 'rgba(197, 160, 89, 0.85)';
      ctx.lineWidth = Math.max(1, 1 * dpr);
      ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8d399';
      ctx.fillText(allyTag, cx, ty + th / 2 + 0.5 * dpr);
    }

    // Shield fill
    if (shield > 0) {
      const shW = Math.round((bw * shield) / totalCap);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(bx + hpW, by, shW, bh);
    }

    // 100-HP vertical segment tick dividers
    const segments = Math.max(1, Math.min(20, Math.floor(maxHp / 100)));
    if (segments > 1) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
      for (let s = 1; s < segments; s++) {
        const tx = Math.round(bx + (bw * s) / segments);
        ctx.fillRect(tx, by, Math.max(1, Math.round(1 * dpr)), bh);
      }
    }

    // Centered bold white HP readout inside the HP bar ("360", "200", "250")
    const hpText = String(Math.ceil(curHp));
    ctx.font = `800 ${Math.round(9.5 * dpr)}px "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, 2.4 * dpr);
    ctx.strokeStyle = '#000000';
    ctx.strokeText(hpText, cx, by + bh / 2 + 0.5 * dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hpText, cx, by + bh / 2 + 0.5 * dpr);

    // 3. Thin blue Mana bar underneath
    const maxMana = Math.max(1, u.maxMana || 100);
    const curMana = Math.max(0, u.mana || 0);
    const manaW = u.maxMana > 0 ? Math.round(bw * Math.min(1, curMana / maxMana)) : 0;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
    ctx.fillRect(bx, by + bh + 1, bw, manaH);
    if (manaW > 0) {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(bx, by + bh + 1, manaW, manaH);
    }

    // 4. Active status icons with stack count badges next to / below the bar
    if (u.statuses) {
      const keys = Object.keys(u.statuses)
        .filter((k) => {
          const v = u.statuses[k];
          return v && (typeof v !== 'object' || (v.stacks ?? v.duration ?? v.remaining ?? 1) > 0);
        })
        .slice(0, 5);
      if (keys.length) {
        const is = Math.round(13 * dpr);
        keys.forEach((k, i) => {
          const v = u.statuses[k];
          const stacks = Math.round(typeof v === 'object' ? (v.stacks ?? v.duration ?? v.remaining ?? 1) : Number(v) || 0);
          const sim = getImage(statusIcon(k));
          const sx = Math.round(cx - (keys.length * (is + 2)) / 2 + i * (is + 2));
          const sy = by + bh + manaH + Math.round(3 * dpr);
          if (sim) {
            ctx.drawImage(sim, sx, sy, is, is);
          } else {
            ctx.fillStyle = VFX_COLORS[String(k).toLowerCase()] || '#facc15';
            ctx.beginPath();
            ctx.arc(sx + is / 2, sy + is / 2, is * 0.42, 0, Math.PI * 2);
            ctx.fill();
          }
          const isStackable = /^(burn|frost|poison|bleed)$/i.test(k);
          if (stacks > 1 || (isStackable && stacks >= 1)) {
            const stTxt = String(stacks);
            ctx.font = `800 ${Math.round(8.5 * dpr)}px "Segoe UI", Tahoma, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = Math.max(1.8, 2 * dpr);
            ctx.strokeStyle = '#000000';
            ctx.strokeText(stTxt, sx + is + 1, sy + is + 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(stTxt, sx + is + 1, sy + is + 1);
          }
        });
      }
    }
  }

  function updateAndCollectUnit(u, now, dt, allUnits, units3d, hudQueue) {
    const target = toPx(u.x, u.y);
    let d = disp.get(u.uid);
    // Heroes start facing up the board (toward enemies), enemies face the camera.
    const defaultYaw = u.team === 1 ? 0.0 : Math.PI;
    if (!d) {
      d = {
        x: target.x,
        y: target.y,
        prevGridX: u.x,
        prevGridY: u.y,
        lungeX: 0,
        lungeY: 0,
        alpha: 1,
        deadAt: 0,
        yaw: defaultYaw,
        targetYaw: defaultYaw,
        animState: 'idle',
        animTime: 0,
        idleTime: (Number(u.uid) * 0.37) % 1.2,
        moveTime: 0,
        skillTime: 0,
        skillRate: 1,
        skillTimer: 0,
        lastHitTime: null,
        moveTimer: 0,
        req: unitReqBase(u),
      };
      disp.set(u.uid, d);
    }

    const stepDist = Math.hypot(u.x - d.prevGridX, u.y - d.prevGridY);
    if (stepDist > 0.01) {
      const oldPx = toPx(d.prevGridX, d.prevGridY);
      const mdx = target.x - oldPx.x;
      const mdy = target.y - oldPx.y;
      if (Math.hypot(mdx, mdy) > 1) {
        d.targetYaw = yawToward(mdx, mdy, geo.scaleY || 0.66);
      }
      d.moveTimer = 0.32;
      d.prevGridX = u.x;
      d.prevGridY = u.y;
    }

    const screenLag = Math.hypot(target.x - d.x, target.y - d.y);
    if (screenLag > geo.size * 0.12) {
      d.moveTimer = Math.max(d.moveTimer, 0.12);
    }

    d.x += (target.x - d.x) * 0.26;
    d.y += (target.y - d.y) * 0.26;
    d.lungeX *= 0.80;
    d.lungeY *= 0.80;

    const animDt = dt * Math.max(0.5, Math.min(3.5, speed));
    d.skillTimer = Math.max(0, (d.skillTimer || 0) - animDt);
    d.moveTimer = Math.max(0, (d.moveTimer || 0) - animDt);
    d.jumpTimer = Math.max(0, (d.jumpTimer || 0) - animDt);
    d.spinTimer = Math.max(0, (d.spinTimer || 0) - animDt);

    let jumpOffsetY = 0;
    if (d.jumpTimer > 0 && d.jumpDur > 0) {
      const jp = 1 - d.jumpTimer / d.jumpDur;
      jumpOffsetY = -Math.sin(jp * Math.PI) * (d.jumpHeight || geo.size * 0.8);
    }

    const dead = u.hp <= 0 || u.state === 'dead' || u.state === 'Dead';
    if (dead) {
      if (!d.deadAt) {
        d.deadAt = now;
        d.animState = 'death';
        d.animTime = 0;
      }
      const elapsedDead = (now - d.deadAt) / 1000;
      const deathDur = model3d?.getAnimDuration?.(d.req, 'death', 0.8) || 0.8;
      d.alpha = Math.max(0, 1 - Math.max(0, elapsedDead - deathDur - 0.35) / 0.65);
      if (d.alpha <= 0) return;
      d.animState = 'death';
      d.animTime += animDt;
    } else {
      const inSkill = d.skillTimer > 0 || u.state === 'ActiveAbility';
      const isMoving = !inSkill && (d.moveTimer > 0 || (u.state === 'MoveToTarget' && screenLag > 1));

      // Face the unit's current sim target (fallback: nearest opposing unit) unless walking.
      let faceUnit = u.targetUid != null ? allUnits.find((o) => o.uid === u.targetUid && o.hp > 0) : null;
      if (!faceUnit) {
        let bestD = Infinity;
        for (const other of allUnits) {
          if (other.team !== u.team && other.hp > 0) {
            const od = Math.hypot(other.x - u.x, other.y - u.y);
            if (od < bestD) {
              bestD = od;
              faceUnit = other;
            }
          }
        }
      }
      if (faceUnit && !isMoving) {
        const fd = disp.get(faceUnit.uid);
        const ep = fd ? { x: fd.x, y: fd.y } : toPx(faceUnit.x, faceUnit.y);
        const dx = ep.x - d.x;
        const dy = ep.y - d.y;
        if (Math.hypot(dx, dy) > 2) d.targetYaw = yawToward(dx, dy, geo.scaleY || 0.66);
      }

      const stunned = (u.statuses?.Stun || 0) > 0 || u.state === 'Hurt';
      const simNow = battle.state?.time ?? 0;
      let attackPhase = null;
      const aps = Number(u.attacksPerSecond) || 0;
      if (aps > 0 && !stunned && !inSkill) {
        const D = model3d?.getAnimDuration?.(d.req, 'attack', 0.8) || 0.8;
        const I = 1 / aps;
        const P = Math.min(D, I * 0.95); // compressed playback when attacking faster than the clip
        const hit = ATTACK_HIT_FRAC * P;
        const sinceHit = d.lastHitTime != null ? simNow - d.lastHitTime : Infinity;
        if (sinceHit >= 0 && hit + sinceHit <= P) {
          attackPhase = (hit + sinceHit) * (D / P); // follow-through after the strike
        } else if (u.state === 'Attack') {
          const tau = (1 - Math.max(0, Math.min(1, Number(u.attackTimer) || 0))) * I; // time to next strike
          if (tau <= hit) attackPhase = (hit - tau) * (D / P); // wind-up
        }
      }

      if (inSkill) {
        d.animState = 'skill';
        d.skillTime += animDt * (d.skillRate || 1);
        d.animTime = d.skillTime;
      } else if (attackPhase != null) {
        d.animState = 'attack';
        d.animTime = attackPhase;
      } else if (stunned) {
        d.animState = 'idle';
        d.idleTime += animDt * 0.2;
        d.animTime = d.idleTime;
      } else if (isMoving) {
        d.animState = 'move';
        d.moveTime += animDt;
        d.animTime = d.moveTime;
      } else {
        d.animState = 'idle';
        d.idleTime += animDt;
        d.animTime = d.idleTime;
      }
    }

    if (d.spinTimer > 0) {
      d.yaw = (d.yaw + animDt * Math.PI * 5.5) % (Math.PI * 2);
    } else {
      d.yaw = lerpAngle(d.yaw, d.targetYaw, Math.min(1, animDt * 12));
    }
    const ux = d.x + d.lungeX;
    const uy = d.y + d.lungeY + jumpOffsetY;

    const stealth = u.statuses && Object.keys(u.statuses).some((k) => /stealth/i.test(k) && u.statuses[k]);
    const effAlpha = d.alpha * (stealth ? 0.55 : 1.0);

    // 1. Draw Ground Shadow Ellipse on the stone circle (stays on the ground even while jumping)
    ctx.save();
    ctx.globalAlpha = effAlpha * (jumpOffsetY < 0 ? 0.72 : 1.0);
    const shadowScale = jumpOffsetY < 0 ? Math.max(0.55, 1 + jumpOffsetY / (geo.size * 2.5)) : 1;
    const shadowRx = geo.size * (u.team === 1 ? 0.54 : 0.66) * shadowScale;
    const shadowRy = shadowRx * 0.34;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.beginPath();
    ctx.ellipse(ux, d.y + d.lungeY + geo.size * 0.10, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();
    const inspectedUid = getInspectedUnitUid();
    if (inspectedUid != null && String(u.uid) === String(inspectedUid)) {
      ctx.strokeStyle = u.team === 1 ? '#38bdf8' : '#f87171';
      ctx.lineWidth = Math.max(2.5, 3 * geo.dpr);
      ctx.beginPath();
      ctx.ellipse(ux, d.y + d.lungeY + geo.size * 0.10, shadowRx * 1.25, shadowRy * 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Determine status tint for 3D shader
    let statusTint = null;
    if (u.statuses) {
      if (u.statuses.Frost || u.statuses.frost) statusTint = [0.35, 0.78, 1.0, 0.26];
      else if (u.statuses.Burn || u.statuses.burn) statusTint = [1.0, 0.45, 0.15, 0.24];
      else if (u.statuses.Poison || u.statuses.poison) statusTint = [0.35, 0.95, 0.45, 0.22];
    }

    const eDef = u.team !== 1 ? data.enemies?.[u.defId] : null;
    const uReq = {
      heroId: u.team === 1 ? u.defId : null,
      enemyId: u.team !== 1 ? u.defId : null,
      name: eDef?.name || u.name,
      team: u.team === 1 ? 'hero' : 'enemy',
      footX: ux,
      footY: uy + geo.size * 0.12,
      targetHeightPx: geo.size * (u.team === 1 ? 1.88 : 1.65),
      yaw: d.yaw,
      animState: d.animState,
      animTime: d.animTime,
      flash: (fx.flashes.get(u.uid) || 0) * 5.0,
      statusTint,
      alpha: effAlpha,
      outlineWidth: 2.2 * geo.dpr,
    };
    units3d.push(uReq);

    // Fallback 2D sprite if 3D model is still streaming on first frame
    if (!model3d || !model3d.isUnitModelReady(uReq)) {
      const im = unitCutoutImg(u);
      const spriteH = geo.size * (u.team === 1 ? 1.82 : 1.52);
      const drawW = spriteH * (u.team === 1 ? 0.85 : 1.08);
      const drawH = spriteH;
      const sx = ux - drawW / 2;
      const sy = uy - drawH + geo.size * 0.22;
      if (im) {
        ctx.save();
        ctx.globalAlpha = effAlpha;
        ctx.drawImage(im, sx, sy, drawW, drawH);
        ctx.restore();
      }
    }

    if (!dead) {
      let hudTopY = uy - geo.size * (u.team === 1 ? 1.72 : 1.48) - Math.round(6 * geo.dpr);
      const h3d = model3d?.getUnitHeightPx?.(uReq) || 0;
      if (h3d > 0) hudTopY = Math.min(hudTopY, uReq.footY - h3d - Math.round(16 * geo.dpr));
      hudQueue.push({ u, ux, hudTopY, effAlpha });
    }
  }

  function hexA(hex, a) {
    const n = parseInt(String(hex || '#ffffff').slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  function drawVfxSprite(url, cx, cy, w, h, rot = 0, alpha = 1, scaleY = 1) {
    const im = getImage(url);
    if (!im || alpha <= 0.01) return false;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(cx, cy);
    if (scaleY !== 1) ctx.scale(1, scaleY);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  function drawFlipbook(url, cols, rows, progress, cx, cy, w, h, rot = 0, alpha = 1, scaleY = 1) {
    const im = getImage(url);
    if (!im || !im.width || alpha <= 0.01) return false;
    const total = cols * rows;
    const idx = Math.max(0, Math.min(total - 1, Math.floor(Math.max(0, Math.min(0.999, progress)) * total)));
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const fw = im.width / cols;
    const fh = im.height / rows;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(cx, cy);
    if (scaleY !== 1) ctx.scale(1, scaleY);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(im, col * fw, row * fh, fw, fh, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  function drawAoeZones(dt) {
    const aoes = battle.state?.aoes;
    if (!aoes?.length || !geo) return;
    const s = geo.size;
    const TAU = Math.PI * 2;
    const tNow = performance.now() * 0.001;
    ctx.save();
    for (const z of aoes) {
      if (z.x == null || z.y == null) continue;
      const p = toPx(z.x, z.y);
      const rad = Math.max(0.85, Number(z.radius) || 1.5) * s * 0.92;
      const vk = String(z.vfxKind || z.kind || z.aoeAssetRef || z.aoeEntry || '').toLowerCase();
      let col = SPELL_PALETTE[z.vfxKind] || '#38bdf8';
      let decalUrl = VFX_TEX.arcaneRing;
      if (vk.includes('heal') || vk.includes('floeria') || vk.includes('bloom') || vk.includes('slime')) {
        col = '#4ade80';
        decalUrl = VFX_TEX.decalFairy;
      } else if (vk.includes('burn') || vk.includes('fire') || vk.includes('pimenta') || vk.includes('funke') || vk.includes('ming') || vk.includes('molotov') || vk.includes('demon')) {
        col = '#f97316';
        decalUrl = VFX_TEX.firePentacle;
      } else if (vk.includes('frost') || vk.includes('ice') || vk.includes('gustav') || vk.includes('sal')) {
        col = '#38bdf8';
        decalUrl = VFX_TEX.icePentacle;
      } else if (vk.includes('poison') || vk.includes('snake') || vk.includes('zuri')) {
        col = '#84cc16';
        decalUrl = VFX_TEX.ringWave;
      } else if (vk.includes('seraphael') || vk.includes('reyna') || vk.includes('irini')) {
        col = '#fde047';
        decalUrl = VFX_TEX.decalShock;
      } else if (vk.includes('rook') || vk.includes('golem') || vk.includes('slam')) {
        col = '#d97706';
        decalUrl = VFX_TEX.crater;
      }

      const rem = z.remainingDuration ?? z.remaining ?? 1;
      const fade = Math.min(1, Math.max(0.15, rem / 0.5));
      const pulse = 0.88 + 0.12 * Math.sin(tNow * 5 + (z.id || 0));

      // Ground glowing ellipse
      const g = ctx.createRadialGradient(p.x, p.y, rad * 0.1, p.x, p.y, rad);
      g.addColorStop(0, hexA(col, 0.34 * fade * pulse));
      g.addColorStop(0.7, hexA(col, 0.20 * fade));
      g.addColorStop(1, hexA(col, 0.0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rad, rad * geo.scaleY, 0, 0, TAU);
      ctx.fill();

      // Authentic Unity Ground Decal / Pentacle texture
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (decalUrl === VFX_TEX.icePentacle) {
        drawVfxSprite(VFX_TEX.frozenGround, p.x, p.y, rad * 2.05, rad * 2.05, 0, 0.42 * fade, geo.scaleY);
      } else if (decalUrl === VFX_TEX.firePentacle) {
        drawVfxSprite(VFX_TEX.decalFirePillar, p.x, p.y, rad * 1.95, rad * 1.95, -tNow * 0.4, 0.45 * fade, geo.scaleY);
      }
      drawVfxSprite(decalUrl, p.x, p.y, rad * 1.95 * pulse, rad * 1.95 * pulse, tNow * 0.65, 0.72 * fade, geo.scaleY);
      ctx.restore();

      // Rotating arcane/elemental perimeter ring
      ctx.strokeStyle = hexA(col, 0.65 * fade);
      ctx.lineWidth = 2.2 * geo.dpr;
      ctx.setLineDash([8 * geo.dpr, 6 * geo.dpr]);
      ctx.lineDashOffset = -tNow * 28 * geo.dpr;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rad * 0.92, rad * 0.92 * geo.scaleY, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ambient zone particles (snowflakes for blizzard, petals for sanctuary, embers for fire, bubbles for poison)
      if (Math.random() < 0.35) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * rad * 0.85;
        fx.particles.push({
          x: p.x + Math.cos(a) * rr,
          y: p.y + Math.sin(a) * rr * geo.scaleY,
          vx: (Math.random() - 0.5) * s * 0.4,
          vy: -s * (0.45 + Math.random() * 0.55),
          t: 0,
          life: 0.55,
          color: col,
        });
      }
    }
    ctx.restore();
  }

  function drawProjectiles() {
    const list = battle.state?.projectiles || [];
    const seen = new Set();
    const s = geo.size;
    const tNow = performance.now() * 0.001;
    list.forEach((p, i) => {
      if (p.x == null || p.y == null) return;
      const id = p.uid ?? p.id ?? i;
      seen.add(id);
      const px = toPx(p.x, p.y);
      const py = px.y - s * 0.38;
      const pt = { x: px.x, y: py };
      let tr = trails.get(id);
      if (!tr) {
        tr = [];
        trails.set(id, tr);
      }
      tr.push(pt);
      if (tr.length > 8) tr.shift();

      const vk = p.vfxKind || '';
      const col =
        SPELL_PALETTE[vk] ||
        (p.team === 2
          ? '#f87171'
          : String(p.kind || p.type || '').toLowerCase().includes('magic')
          ? '#c084fc'
          : '#fde047');

      // Trail
      for (let k = 0; k < tr.length; k++) {
        ctx.globalAlpha = ((k + 1) / tr.length) * (p.isAbility ? 0.78 : 0.55);
        ctx.fillStyle = col;
        ctx.beginPath();
        const r = s * (p.isAbility ? 0.11 : 0.075) * ((k + 1) / tr.length) + 1;
        ctx.arc(tr[k].x, tr[k].y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const prevPt = tr.length >= 2 ? tr[tr.length - 2] : { x: pt.x + 1, y: pt.y };
      const ang = Math.atan2(pt.y - prevPt.y, pt.x - prevPt.x);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (vk === 'ayaka_shuriken') {
        drawVfxSprite(VFX_TEX.ringWhirl, pt.x, pt.y, s * 0.85, s * 0.85, tNow * 20 + i, 0.9);
        drawVfxSprite(VFX_TEX.starFlare, pt.x, pt.y, s * 0.72, s * 0.72, -tNow * 14 + i, 0.95);
      } else if (vk === 'irini_spear') {
        drawFlipbook(VFX_TEX.thunder3x1, 3, 1, (tNow * 12 + i * 0.3) % 1, pt.x, pt.y, s * 1.35, s * 0.65, ang, 0.95);
        drawVfxSprite(VFX_TEX.electricFlare, pt.x, pt.y, s * 0.75, s * 0.75, tNow * 10, 0.9);
      } else if (vk === 'reyna_volley' || vk === 'reyna_combo' || vk === 'mushroom_arrow' || vk === 'archer_snipe') {
        const arrowTex = vk.includes('mushroom') ? VFX_TEX.arrow2 : VFX_TEX.arrow1;
        if (!drawVfxSprite(arrowTex, pt.x, pt.y, s * 1.15, s * 0.38, ang, 0.96)) {
          ctx.translate(pt.x, pt.y);
          ctx.rotate(ang);
          ctx.strokeStyle = col;
          ctx.lineWidth = 2.6 * geo.dpr;
          ctx.beginPath();
          ctx.moveTo(-s * 0.35, 0);
          ctx.lineTo(s * 0.35, 0);
          ctx.stroke();
        }
      } else if (vk === 'javryn_ricochet' || vk === 'javryn_dagger' || vk === 'javryn_volley') {
        drawVfxSprite(VFX_TEX.ringWhirl, pt.x, pt.y, s * 0.78, s * 0.78, tNow * 18, 0.92);
        drawVfxSprite(VFX_TEX.slash3, pt.x, pt.y, s * 0.68, s * 0.68, tNow * 18 + 1.2, 0.88);
      } else if (vk === 'hoyoung_snipe') {
        drawVfxSprite(VFX_TEX.beam, pt.x, pt.y, s * 1.35, s * 0.42, ang, 0.95);
        drawVfxSprite(VFX_TEX.starFlare, pt.x, pt.y, s * 0.65, s * 0.65, 0, 0.9);
      } else {
        const rad = s * (p.isAbility ? 0.32 : 0.24);
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rad);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
        ctx.fill();
        drawVfxSprite(p.isAbility ? VFX_TEX.starFlare : VFX_TEX.arrow0, pt.x, pt.y, s * (p.isAbility ? 0.75 : 0.68), s * (p.isAbility ? 0.75 : 0.26), ang, 0.85);
      }
      ctx.restore();
    });
    for (const k of trails.keys()) if (!seen.has(k)) trails.delete(k);
  }

  function drawVfx(dt) {
    for (const [k, v] of castWindow) {
      const rem = (typeof v === 'object' ? v.t : v) - dt;
      if (rem <= 0) castWindow.delete(k);
      else if (typeof v === 'object') v.t = rem;
      else castWindow.set(k, rem);
    }
    const s = geo.size;
    const TAU = Math.PI * 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const v of fx.vfx) {
      v.t += dt;
      if (v.delay && v.t < v.delay) continue;
      const effT = v.delay ? v.t - v.delay : v.t;
      const k = Math.min(1, effT / v.life);
      const fade = 1 - Math.max(0, k - 0.75) / 0.25;

      if (v.kind === 'melee_slash') {
        // Real Unity weapon crescent slash + 2x2 slash flipbook scaled to unit height
        const cy = v.y - s * 0.62;
        const sz = s * (2.35 + 0.55 * k);
        const g = ctx.createRadialGradient(v.x, cy, 0, v.x, cy, sz * 0.45);
        g.addColorStop(0, hexA(v.color, 0.52 * (1 - k)));
        g.addColorStop(1, hexA(v.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(v.x, cy, sz * 0.45, 0, TAU);
        ctx.fill();
        drawVfxSprite(VFX_TEX.slash3, v.x, cy, sz, sz, v.ang, 0.98 * (1 - k * 0.55));
        if (v.variant === 1) {
          drawFlipbook(VFX_TEX.commonSlash, 2, 2, k, v.x, cy, sz * 1.12, sz * 1.12, v.ang, 0.92 * (1 - k * 0.45));
        } else {
          drawFlipbook(VFX_TEX.ringSlash, 2, 2, k, v.x, cy, sz * 1.12, sz * 1.12, v.ang, 0.92 * (1 - k * 0.45));
        }
      } else if (v.kind === 'ranged_muzzle') {
        const cy = v.y - s * 0.58;
        if (v.isBow) {
          drawVfxSprite(VFX_TEX.bow, v.x, cy, s * 1.55, s * 1.55, v.ang, 0.94 * (1 - k));
        }
        drawVfxSprite(VFX_TEX.starFlare, v.x, cy, s * (1.25 + 0.45 * k), s * (1.25 + 0.45 * k), v.ang, 0.95 * (1 - k));
      } else if (v.kind === 'hit_spark') {
        const cy = v.y - s * 0.62;
        const sz = s * (v.crit ? 2.65 : 1.85);
        drawFlipbook(VFX_TEX.impact3x3, 3, 3, k, v.x, cy, sz, sz, v.rot || 0, 0.96 * (1 - k * 0.35));
        drawVfxSprite(VFX_TEX.starFlare, v.x, cy, sz * 0.88, sz * 0.88, (v.rot || 0) + k * 2, 0.92 * (1 - k));
        if (v.crit) {
          drawVfxSprite(VFX_TEX.animeImpact, v.x, cy, sz * 1.3, sz * 1.3, v.rot || 0, 0.92 * (1 - k));
        }
      } else if (v.kind === 'charge') {
        const p = posOf(v.uid);
        if (!p) continue;
        const grow = Math.min(1, effT / (v.life * 0.8));
        const r = s * (1.15 - 0.3 * grow);
        drawVfxSprite(VFX_TEX.arcaneRing, p.x, p.y, r * 3.1, r * 3.1, effT * 4, 0.92 * fade, geo.scaleY);
        drawVfxSprite(VFX_TEX.beamUp, p.x, p.y - s * 1.4, s * 1.75, s * 3.2, 0, 0.78 * grow * fade);
        ctx.globalAlpha = 0.9 * fade;
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 2.5 * geo.dpr;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * geo.scaleY, 0, 0, TAU);
        ctx.stroke();
        if (Math.random() < 0.6) {
          fx.particles.push({
            x: p.x + (Math.random() - 0.5) * s * 1.2, y: p.y,
            vx: 0, vy: -s * (1.6 + Math.random() * 1.8), t: 0, life: 0.55, color: v.color,
          });
        }
      } else if (v.kind === 'sniper_aim') {
        const sp = posOf(v.srcUid);
        const tp = posOf(v.tgtUid);
        if (!sp || !tp) continue;
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 1.8 * geo.dpr;
        ctx.setLineDash([6 * geo.dpr, 4 * geo.dpr]);
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - s * 0.65);
        ctx.lineTo(tp.x, tp.y - s * 0.6);
        ctx.stroke();
        ctx.setLineDash([]);
        const cr = s * (0.75 - 0.25 * k);
        drawVfxSprite(VFX_TEX.arcaneRing, tp.x, tp.y - s * 0.6, cr * 2.8, cr * 2.8, effT * 6, 0.92 * fade);
      } else if (v.kind === 'afterimage') {
        const ang = Math.atan2(v.by - v.ay, v.bx - v.ax);
        const dist = Math.hypot(v.bx - v.ax, v.by - v.ay);
        const mx = (v.ax + v.bx) * 0.5;
        const my = (v.ay + v.by) * 0.5 - s * 0.5;
        drawVfxSprite(VFX_TEX.beam, mx, my, Math.max(s * 1.4, dist * 1.25), s * 0.95, ang, 0.82 * (1 - k));
      } else if (v.kind === 'thunderbolt') {
        // Sky lightning bolt striking target using HandPaintedLightning2 3x3 flipbook + LightningHitCenter2 2x2
        const cy = v.y - s * 2.35;
        drawFlipbook(VFX_TEX.lightning3x3, 3, 3, k, v.x, cy, s * 3.1, s * 5.6, 0, 0.98 * (1 - k * 0.3));
        drawFlipbook(VFX_TEX.lightningHit2x2, 2, 2, k, v.x, v.y - s * 0.35, s * 2.8, s * 2.8, 0, 0.96 * (1 - k * 0.35));
        drawVfxSprite(VFX_TEX.electricFlare, v.x, v.y - s * 0.45, s * 2.4, s * 2.4, effT * 8, 0.92 * (1 - k));
      } else if (v.kind === 'railgun') {
        const ay = v.ay - s * 0.65;
        const by = v.by - s * 0.6;
        const mx = (v.ax + v.bx) * 0.5;
        const my = (ay + by) * 0.5;
        const dist = Math.hypot(v.bx - v.ax, by - ay);
        const ang = Math.atan2(by - ay, v.bx - v.ax);
        drawVfxSprite(VFX_TEX.beam, mx, my, dist + s * 1.1, s * 1.35 * (1 - k * 0.45), ang, 0.98 * (1 - k * 0.35));
        drawVfxSprite(VFX_TEX.starburst, v.bx, by, s * 2.2, s * 2.2, effT * 6, 0.96 * (1 - k));
      } else if (v.kind === 'cone_waves') {
        const dist = s * (1.2 + k * 1.5);
        const cx = v.x + Math.cos(v.ang) * dist;
        const cy = v.y - s * 0.45 + Math.sin(v.ang) * dist;
        drawVfxSprite(VFX_TEX.burstCone, cx, cy, s * 3.4, s * 2.9, v.ang, 0.94 * (1 - k));
        for (let w = -1; w <= 1; w++) {
          const a = v.ang + w * v.spread * 0.55;
          const ar = s * (0.7 + k * 2.6);
          drawVfxSprite(VFX_TEX.arrow1, v.x + Math.cos(a) * ar, v.y - s * 0.45 + Math.sin(a) * ar, s * 1.55, s * 0.52, a, 0.95 * (1 - k));
        }
      } else if (v.kind === 'shuriken_burst') {
        drawVfxSprite(VFX_TEX.ringWhirl, v.x, v.y - s * 0.45, s * (1.8 + k * 3.1), s * (1.8 + k * 3.1), effT * 14, 0.94 * (1 - k));
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6 + k * 4;
          const rr = s * (0.35 + k * 2.0);
          drawVfxSprite(
            VFX_TEX.starFlare,
            v.x + Math.cos(a) * rr,
            v.y - s * 0.5 + Math.sin(a) * rr * geo.scaleY,
            s * 0.95,
            s * 0.95,
            effT * 18 + i,
            0.95 * (1 - k)
          );
        }
      } else if (v.kind === 'dark_pillar' || v.kind === 'fire_pillar' || v.kind === 'holy_pillar') {
        const sc = v.scale || 1;
        const pw = s * 1.95 * sc * (1 - k * 0.25);
        const ph = s * 4.2 * sc;
        const g = ctx.createLinearGradient(v.x, v.y, v.x, v.y - ph);
        g.addColorStop(0, hexA('#ffffff', 0.85 * (1 - k)));
        g.addColorStop(0.35, hexA(v.color, 0.75 * (1 - k)));
        g.addColorStop(1, hexA(v.color, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(v.x - (pw * 0.42) / 2, v.y - ph, pw * 0.42, ph);
        drawVfxSprite(VFX_TEX.beamUp, v.x, v.y - ph * 0.5, pw * 1.35, ph, 0, 0.95 * (1 - k * 0.35));
        if (v.kind === 'fire_pillar') {
          drawFlipbook(VFX_TEX.fire4x2, 4, 2, k, v.x, v.y - s * 1.25 * sc, s * 2.85 * sc, s * 3.2 * sc, 0, 0.96 * (1 - k * 0.3));
          drawVfxSprite(VFX_TEX.firePentacle, v.x, v.y, s * 2.8 * sc, s * 2.8 * sc, effT * 2.5, 0.92 * (1 - k), geo.scaleY);
        } else if (v.kind === 'dark_pillar') {
          drawVfxSprite(VFX_TEX.voidRing, v.x, v.y, s * 2.85 * sc, s * 2.85 * sc, -effT * 3, 0.94 * (1 - k), geo.scaleY);
          drawVfxSprite(VFX_TEX.darkFlare, v.x, v.y - s * 0.9 * sc, s * 2.6 * sc, s * 2.6 * sc, effT * 4, 0.94 * (1 - k));
        } else {
          drawVfxSprite(VFX_TEX.arcaneRing, v.x, v.y, s * 2.75 * sc, s * 2.75 * sc, effT * 3, 0.94 * (1 - k), geo.scaleY);
          drawVfxSprite(VFX_TEX.starburst, v.x, v.y - s * 0.9 * sc, s * 2.5 * sc, s * 2.5 * sc, effT * 2, 0.94 * (1 - k));
        }
      } else if (v.kind === 'harmonic_beam') {
        const ay = v.ay - s * 0.55;
        const by = v.by - s * 0.55;
        const mx = (v.ax + v.bx) * 0.5;
        const my = (ay + by) * 0.5;
        const dist = Math.hypot(v.bx - v.ax, by - ay);
        const ang = Math.atan2(by - ay, v.bx - v.ax);
        drawVfxSprite(VFX_TEX.beam, mx, my, dist + s * 0.8, s * 1.85 * (1 - k * 0.45), ang, 0.96 * (1 - k * 0.3));
        drawVfxSprite(VFX_TEX.soundFlare, v.ax, ay, s * 2.1, s * 2.1, effT * 6, 0.94 * (1 - k));
      } else if (v.kind === 'cross_slash') {
        const cy = v.y - s * 0.6;
        const sz = s * (2.45 + 0.55 * k);
        drawVfxSprite(VFX_TEX.slash3, v.x, cy, sz, sz, -0.65, 0.96 * (1 - k * 0.45));
        drawVfxSprite(VFX_TEX.slash3, v.x, cy, sz, sz, 0.65 + Math.PI, 0.96 * (1 - k * 0.45));
        drawFlipbook(VFX_TEX.commonSlash, 2, 2, k, v.x, cy, sz * 1.15, sz * 1.15, 0.65, 0.92 * (1 - k));
      } else if (v.kind === 'nova_ring' || v.kind === 'shield_dome') {
        const sc = v.scale || 1.5;
        const r = s * (0.65 + k * sc * 1.25);
        drawVfxSprite(VFX_TEX.expansiveWave, v.x, v.y, r * 2.5, r * 2.5, effT * 2.5, 0.92 * (1 - k), geo.scaleY);
        drawVfxSprite(VFX_TEX.ringWave, v.x, v.y, r * 2.2, r * 2.2, -effT * 2, 0.88 * (1 - k), geo.scaleY);
        if (v.kind === 'shield_dome') {
          drawVfxSprite(VFX_TEX.bubble, v.x, v.y - s * 0.62, r * 1.85, r * 1.85, 0, 0.86 * (1 - k));
          drawVfxSprite(VFX_TEX.shieldHex, v.x, v.y - s * 0.62, r * 1.75, r * 1.75, effT, 0.65 * (1 - k));
        }
      } else if (v.kind === 'anvil_strike' || v.kind === 'sky_cleave') {
        const cy = v.y - s * 0.3;
        const r = s * (1.15 + k * 1.95);
        drawVfxSprite(VFX_TEX.craterBig, v.x, v.y, r * 2.4, r * 2.4, 0, 0.92 * (1 - k * 0.45), geo.scaleY);
        drawVfxSprite(VFX_TEX.crack4, v.x, v.y, r * 2.6, r * 2.6, 0.4, 0.9 * (1 - k), geo.scaleY);
        drawVfxSprite(VFX_TEX.ringSpiked, v.x, v.y, r * 2.3, r * 2.3, effT * 3, 0.94 * (1 - k), geo.scaleY);
        drawVfxSprite(VFX_TEX.animeImpact, v.x, cy - s * 0.35, s * 2.5, s * 2.5, 0, 0.95 * (1 - k));
      } else if (v.kind === 'seismic_spikes' || v.kind === 'ice_spikes') {
        const isIce = v.kind === 'ice_spikes';
        if (isIce) {
          drawVfxSprite(VFX_TEX.icePentacle, v.x, v.y, s * 3.1, s * 3.1, effT * 2, 0.92 * (1 - k), geo.scaleY);
        } else {
          drawVfxSprite(VFX_TEX.crack5, v.x, v.y, s * 3.2, s * 3.2, v.ang || 0, 0.92 * (1 - k), geo.scaleY);
        }
        const count = 5;
        for (let i = 0; i < count; i++) {
          const dist = s * (0.45 + i * 0.55) * Math.min(1, k * 1.8);
          const ang = v.ang != null ? v.ang : (i * TAU) / count;
          const sx = v.x + Math.cos(ang) * dist;
          const sy = v.y + Math.sin(ang) * dist * geo.scaleY;
          if (isIce) {
            drawFlipbook(VFX_TEX.ice6x6, 6, 6, k, sx, sy - s * 0.5, s * 1.75, s * 1.75, 0, 0.94 * (1 - k * 0.35));
            drawVfxSprite(VFX_TEX.snowflake, sx, sy - s * 0.6, s * 0.95, s * 0.95, effT * 4 + i, 0.92 * (1 - k));
          } else {
            drawVfxSprite(VFX_TEX.crater, sx, sy, s * 1.55, s * 1.55, i, 0.9 * (1 - k), geo.scaleY);
            drawFlipbook(VFX_TEX.impact3x3, 3, 3, k, sx, sy - s * 0.4, s * 1.55, s * 1.55, i, 0.92 * (1 - k));
          }
        }
      } else if (v.kind === 'whirlwind') {
        const p = v.uid != null ? posOf(v.uid) : { x: v.x, y: v.y };
        if (!p) continue;
        const cy = p.y - s * 0.52;
        drawVfxSprite(VFX_TEX.ringWhirl, p.x, cy, s * 3.3, s * 3.3, effT * 16, 0.95 * (1 - k * 0.35), geo.scaleY * 1.15);
        drawVfxSprite(VFX_TEX.slash3, p.x, cy, s * 2.95, s * 2.95, -effT * 18, 0.92 * (1 - k * 0.35), geo.scaleY * 1.15);
      } else if (v.kind === 'meteor_fall') {
        const mx = v.x + (1 - k) * s * 1.2;
        const my = v.y - (1 - k) * s * 3.6;
        drawVfxSprite(VFX_TEX.fireBurst, mx, my, s * 1.85, s * 1.85, effT * 10, 0.98);
        drawVfxSprite(VFX_TEX.starFlare, mx, my, s * 1.55, s * 1.55, -effT * 8, 0.96);
        if (k > 0.72) {
          const ik = (k - 0.72) / 0.28;
          drawVfxSprite(VFX_TEX.craterBig, v.x, v.y, s * 2.75, s * 2.75, 0, 0.94 * (1 - ik * 0.45), geo.scaleY);
          drawFlipbook(VFX_TEX.impact3x3, 3, 3, ik, v.x, v.y - s * 0.4, s * 2.45, s * 2.45, 0, 0.96);
        }
      } else if (v.kind === 'fangs_bite') {
        const cy = v.y - s * 0.65;
        const crunch = k < 0.4 ? 0.65 + (k / 0.4) * 0.5 : 1.15 - ((k - 0.4) / 0.6) * 0.25;
        drawFlipbook(VFX_TEX.blood4x4, 4, 4, k, v.x, cy, s * 2.65, s * 2.65, 0, 0.95 * (1 - k * 0.3));
        drawVfxSprite(VFX_TEX.fangs, v.x, cy, s * 2.25 * crunch, s * 2.25 * crunch, 0, 0.98 * (1 - k * 0.35));
        if (v.ax != null && v.ay != null) {
          const ang = Math.atan2(v.ay - v.y, v.ax - v.x);
          drawVfxSprite(VFX_TEX.bloodCone, v.x, cy, s * 2.1, s * 2.1, ang, 0.85 * (1 - k));
        }
      } else if (v.kind === 'burst') {
        const sc = v.scale || 1;
        const r = s * (0.55 + 1.65 * k) * sc;
        const cy = v.y - s * 0.5;
        const g = ctx.createRadialGradient(v.x, cy, 0, v.x, cy, r);
        g.addColorStop(0, hexA('#ffffff', 0.85 * (1 - k)));
        g.addColorStop(0.35, hexA(v.color, 0.6 * (1 - k)));
        g.addColorStop(1, hexA(v.color, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(v.x, cy, r, 0, TAU);
        ctx.fill();
        drawFlipbook(VFX_TEX.impact3x3, 3, 3, k, v.x, cy, r * 2.25, r * 2.25, 0, 0.95 * (1 - k * 0.3));
        drawVfxSprite(VFX_TEX.ringShockwave, v.x, v.y, r * 2.45, r * 2.45, effT * 3, 0.9 * (1 - k), geo.scaleY);
      } else if (v.kind === 'beam') {
        const ay = v.ay - s * 0.55;
        const by = v.by - s * 0.5;
        const mx = (v.ax + v.bx) * 0.5;
        const my = (ay + by) * 0.5;
        const dist = Math.hypot(v.bx - v.ax, by - ay);
        const ang = Math.atan2(by - ay, v.bx - v.ax);
        drawVfxSprite(VFX_TEX.beam, mx, my, dist + s * 0.6, s * 1.15 * (1 - k * 0.45), ang, 0.94 * (1 - k * 0.3));
      } else if (v.kind === 'slash') {
        const cy = v.y - s * 0.58;
        const sz = s * (2.35 + 0.55 * k);
        drawVfxSprite(VFX_TEX.slash3, v.x, cy, sz, sz, v.ang || 0, 0.98 * (1 - k * 0.4));
        drawFlipbook(VFX_TEX.ringSlash, 2, 2, k, v.x, cy, sz * 1.18, sz * 1.18, v.ang || 0, 0.94 * (1 - k * 0.35));
      } else if (v.kind === 'bubble') {
        const p = posOf(v.uid);
        if (!p) continue;
        const pop = k < 0.15 ? 0.7 + (k / 0.15) * 0.3 : 1;
        const r = s * 2.35 * pop;
        const cy = p.y - s * 0.68;
        drawVfxSprite(VFX_TEX.bubble, p.x, cy, r, r * 1.05, 0, 0.86 * fade);
        drawVfxSprite(VFX_TEX.shieldHex, p.x, cy, r * 0.94, r * 0.98, effT * 0.8, 0.58 * fade);
      } else if (v.kind === 'heal') {
        const p = posOf(v.uid);
        if (!p) continue;
        drawVfxSprite(VFX_TEX.decalFairy, p.x, p.y, s * 2.35, s * 2.35, effT * 2, 0.82 * (1 - k), geo.scaleY);
        ctx.fillStyle = v.color;
        for (let i = 0; i < 5; i++) {
          const ph = (v.seed + i * 1.7) % 1;
          const x = p.x + Math.sin(v.seed * 3 + i * 2.1) * s * 0.55;
          const y = p.y - s * (0.2 + 1.4 * ((k + ph * 0.5) % 1));
          drawFlipbook(VFX_TEX.leaf2x2, 2, 2, (k + ph) % 1, x, y, s * 0.62, s * 0.62, effT * 3 + i, 0.9 * (1 - k));
          drawVfxSprite(VFX_TEX.sparkle, x, y, s * 0.52, s * 0.52, -effT * 4, 0.9 * (1 - k));
        }
      } else if (v.kind === 'puff') {
        const p = posOf(v.uid);
        if (!p) continue;
        const cy = p.y - s * 0.62;
        const sk = v.statusKey || '';
        if (sk.includes('burn')) {
          drawFlipbook(VFX_TEX.fire4x2, 4, 2, k, p.x, cy, s * 1.85, s * 1.95, 0, 0.92 * (1 - k * 0.35));
        } else if (sk.includes('frost')) {
          drawFlipbook(VFX_TEX.ice6x6, 6, 6, k, p.x, cy, s * 1.85, s * 1.85, 0, 0.9 * (1 - k * 0.35));
          drawVfxSprite(VFX_TEX.snowflake, p.x, cy, s * 1.05, s * 1.05, effT * 4, 0.9 * (1 - k));
        } else if (sk.includes('bleed')) {
          drawFlipbook(VFX_TEX.blood4x4, 4, 4, k, p.x, cy, s * 1.85, s * 1.85, 0, 0.92 * (1 - k * 0.35));
        } else if (sk.includes('stun')) {
          drawFlipbook(VFX_TEX.shardLightning, 4, 4, k, p.x, cy - s * 0.35, s * 1.65, s * 1.65, effT * 5, 0.94 * (1 - k * 0.25));
        } else if (sk.includes('poison')) {
          drawFlipbook(VFX_TEX.leaf2x2, 2, 2, k, p.x, cy, s * 1.45, s * 1.45, effT * 4, 0.9 * (1 - k));
        } else {
          drawVfxSprite(VFX_TEX.ringShockwave, p.x, cy, s * (0.9 + 1.25 * k), s * (0.9 + 1.25 * k), effT * 4, 0.88 * (1 - k));
        }
      }
    }
    ctx.restore();
    fx.vfx = fx.vfx.filter((v) => (v.delay ? v.t - v.delay : v.t) < v.life);
  }

  function drawFx(dt) {
    drawVfx(dt);
    for (const l of fx.lines) {
      l.t += dt;
      ctx.globalAlpha = Math.max(0, 1 - l.t / l.life);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 2.2 * geo.dpr;
      ctx.beginPath();
      ctx.moveTo(l.ax, l.ay);
      ctx.lineTo(l.ax + (l.bx - l.ax) * 0.85, l.ay + (l.by - l.ay) * 0.85);
      ctx.stroke();
    }
    fx.lines = fx.lines.filter((l) => l.t < l.life);

    for (const r of fx.rings) {
      r.t += dt;
      const k = r.t / r.life;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3.5 * geo.dpr * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, geo.size * (0.5 + k * 1.2), geo.size * (0.5 + k * 1.2) * geo.scaleY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    fx.rings = fx.rings.filter((r) => r.t < r.life);

    for (const p of fx.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4 * geo.dpr, 4 * geo.dpr);
    }
    fx.particles = fx.particles.filter((p) => p.t < p.life);

    // Animated golden Shard coins (fountain pop + bounce on hex floor + fly to HUD Shard counter)
    if (fx.coins.length > 0) {
      const shardImg = getImage(SPR.shard);
      const coinR = Math.max(8, geo.size * 0.24);
      const gravity = geo.size * 9.5;
      for (const c of fx.coins) {
        c.t += dt;
        if (c.t < 0) continue;
        c.spin += c.spinSpeed * dt;
        if (c.t < c.dropLife) {
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.vy += gravity * dt;
          if (c.y >= c.groundY && c.vy > 0) {
            c.y = c.groundY;
            c.vy = -c.vy * 0.45;
            c.vx *= 0.65;
            if (!c.bounced) {
              c.bounced = true;
              c.landX = c.x;
              fx.particles.push({
                x: c.x,
                y: c.y,
                vx: (Math.random() - 0.5) * geo.size * 0.8,
                vy: -Math.random() * geo.size * 0.9,
                t: 0,
                life: 0.35,
                color: '#fef08a',
              });
            }
          }
        } else {
          const fk = Math.min(1, (c.t - c.dropLife) / Math.max(0.1, c.flyLife));
          const ease = fk * fk * (3 - 2 * fk);
          const arcLift = Math.sin(fk * Math.PI) * geo.size * 1.4;
          c.x = c.landX + (c.hudX - c.landX) * ease;
          c.y = c.groundY + (c.hudY - c.groundY) * ease - arcLift;
        }

        const totalLife = c.dropLife + c.flyLife;
        const alpha = c.t > totalLife - 0.12 ? Math.max(0, (totalLife - c.t) / 0.12) : 1;
        const scaleX = 0.55 + 0.45 * Math.abs(Math.cos(c.spin));
        ctx.save();
        ctx.globalAlpha = alpha;
        // Ground shadow while on board
        if (c.t < c.dropLife) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
          ctx.beginPath();
          ctx.ellipse(c.x, c.groundY + coinR * 0.25, coinR * 0.75, coinR * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Golden glow halo
        const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, coinR * 1.45);
        glow.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
        glow.addColorStop(0.55, 'rgba(251, 191, 36, 0.45)');
        glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(c.x, c.y, coinR * 1.45, 0, Math.PI * 2);
        ctx.fill();

        // Coin body / Shard sprite
        ctx.translate(c.x, c.y);
        ctx.scale(scaleX, 1);
        if (shardImg) {
          ctx.drawImage(shardImg, -coinR, -coinR, coinR * 2, coinR * 2);
        } else {
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2 * geo.dpr;
          ctx.beginPath();
          ctx.arc(0, 0, coinR * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      fx.coins = fx.coins.filter((c) => c.t < c.dropLife + c.flyLife);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of fx.texts) {
      tx.t += dt;
      const k = tx.t / tx.life;
      const fs = (tx.big ? 0.48 : 0.34) * geo.size * (k < 0.15 ? 0.75 + k * 1.8 : 1);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.5) * 2);
      ctx.font = `900 ${Math.round(fs)}px "Segoe UI", Tahoma, sans-serif`;
      ctx.lineWidth = Math.max(2, fs * 0.18);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      const y = tx.y - k * geo.size * 0.75;
      ctx.strokeText(tx.text, tx.x, y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, y);
    }
    fx.texts = fx.texts.filter((tx) => tx.t < tx.life);
    ctx.globalAlpha = 1;

    for (const [k, v] of fx.flashes) {
      const nv = v - dt;
      if (nv <= 0) fx.flashes.delete(k);
      else fx.flashes.set(k, nv);
    }
  }

  function render(dt) {
    const now = performance.now();
    const { cw, ch } = geo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1114';
    ctx.fillRect(0, 0, cw, ch);

    if (fx.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * fx.shake * geo.dpr,
        (Math.random() - 0.5) * fx.shake * geo.dpr
      );
      fx.shake = Math.max(0, fx.shake - dt * 18);
    }

    // Draw full composite stage scene (RuinsForest_Morning_Composite.png etc.)
    const compImg = getImage(compositeUrl);
    if (compImg) {
      drawCover(ctx, compImg, cw, ch);
    } else {
      drawCover(ctx, getImage(layers.sky), cw, ch);
      drawCover(ctx, getImage(layers.back), cw, ch);
    }

    drawBoard();
    drawAoeZones(dt);

    // Sort units back-to-front by screen Y (lower row number = higher y on screen = drawn later)
    const allUnits = battle.state?.units || [];
    const units = [...allUnits].sort((a, b) => {
      const pa = toPx(a.x, a.y);
      const pb = toPx(b.x, b.y);
      return pa.y - pb.y;
    });
    const units3d = [];
    const hudQueue = [];
    for (const u of units) {
      updateAndCollectUnit(u, now, dt, allUnits, units3d, hudQueue);
    }

    // Render all 3D models via WebGL2 and composite onto the main canvas
    if (model3d && units3d.length > 0) {
      if (glCanvas.width !== cw || glCanvas.height !== ch) {
        glCanvas.width = cw;
        glCanvas.height = ch;
      }
      model3d.renderUnits(units3d);
      ctx.drawImage(glCanvas, 0, 0, cw, ch);
    }

    // Draw overhead HP/mana/item bars on top of the 3D models
    for (const item of hudQueue) {
      ctx.save();
      ctx.globalAlpha = item.effAlpha;
      drawOverheadHud(item.u, item.ux, item.hudTopY);
      ctx.restore();
    }

    drawProjectiles();
    drawFx(dt);
  }

  let statAcc = 0;
  function frame(ts) {
    if (!running) return;
    const realDt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    try {
      step(realDt);
      if (running) render(realDt);
    } catch (err) {
      console.error('[battle renderer]', err);
      stop();
      onEnd?.(
        { winner: 'draw', error: String((err && err.stack) || err) },
        { ...buildDetailedStats(), error: err }
      );
      return;
    }
    statAcc += realDt;
    if (steppedInFrame || statAcc > 0.1) {
      statAcc = 0;
      onTickStats?.(dmgBySource, battle.state, buildDetailedStats());
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    running = true;
    last = 0;
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }

  function skip() {
    if (ended) {
      finish();
      return;
    }
    let n = 0;
    try {
      while (!battle.isOver() && n < 200000) {
        battle.tick();
        processEvents(battle.state?.events, true);
        n++;
        ticks++;
      }
    } catch (err) {
      console.error(err);
    }
    ended = true;
    finish();
  }

  function getUnitAtPoint(clientX, clientY) {
    if (!geo || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = ((clientX - rect.left) / rect.width) * canvas.width;
    const py = ((clientY - rect.top) / rect.height) * canvas.height;
    let bestUnit = null;
    let bestDist = Infinity;
    const maxR = geo.size * 1.35;
    for (const u of battle.state?.units || []) {
      if (u.hp <= 0) continue;
      const p = posOf(u.uid);
      if (!p) continue;
      const cx = p.x;
      const cy = p.y - geo.size * 0.55;
      const d = Math.hypot(px - cx, (py - cy) * 0.85);
      if (d <= maxR && d < bestDist) {
        bestDist = d;
        bestUnit = u;
      }
    }
    return bestUnit;
  }

  return {
    start,
    stop,
    skip,
    setSpeed(s) {
      speed = s;
    },
    getSpeed: () => speed,
    damageBySource: dmgBySource,
    getDetailedStats: buildDetailedStats,
    getUnitAtPoint,
  };
}

