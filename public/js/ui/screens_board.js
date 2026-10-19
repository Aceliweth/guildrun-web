// Initial Selection draft (CHOOSE HERO), Stage Intro, Stone-Circle Hex Placement Board, and Rank-Up modal.
import { t, txt, statName, getLang, getGameData } from '../data.js';
import { audio } from '../audio.js';
import { h, img, modal } from './dom.js';
import * as assets from './assets.js';
import {
  SPR, heroPortrait, rankLetter, rankBadge, classIcon, itemIcon, relicIcon,
  abilityIcon, statIcon, stageLayers,
} from './assets.js';
import { boardInfo, boardDims, hexCenter, mirrorEnemies } from './hex.js';
import { richText, fmtNum } from './richtext.js';
import {
  hud, heroToken, enemyToken, heroCard, itemSlot, relicSlot, makeDraggable, makeDropTarget,
  equipItemOnHero, unequipItemFromHero,
} from './components.js';
import {
  attachTooltip, heroTooltip, itemTooltip, relicTooltip, abilityTooltip, classTooltip, enemyTooltip,
  rankModTooltip, hideTooltip, computeHeroEffectiveStats, computeLiveUnitSnapshot, openUnitInspector,
} from './tooltip.js';
import { createModel3DRenderer, yawToward } from './model3d_renderer.js';

const isFr = () => getLang() === 'fr';
const L = (fr, en) => (getLang() === 'fr' ? fr : en);

let selectedHeroUid = null;
let selectedItemUid = null;

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

/** Resolve full-screen composite stage background matching Unity stage scenes. */
export function resolveStageComposite(stage, act = 1) {
  if (typeof assets.stageComposite === 'function') {
    const res = assets.stageComposite(stage, act);
    if (res) return res;
  }
  const env = String(stage?.environment || '').toLowerCase();
  const type = String(stage?.stageType || '').toLowerCase();
  if (type.includes('boss') && !type.includes('mini')) {
    return './assets/sprites/backgrounds/RuinsForest_Boss_Composite.png';
  }
  if (env.includes('purple')) return './assets/sprites/backgrounds/PurpleCave_Composite.png';
  if (env.includes('blue') || env.includes('cavern')) return './assets/sprites/backgrounds/BlueCavern_Composite.png';
  if (env.includes('desert') || act >= 3) return './assets/sprites/backgrounds/RedDesert_Composite.png';
  const tod = ['Morning', 'Evening', 'Dusk'][Math.max(0, Math.min(2, ((stage?.floor || 1) - 1) % 3))];
  return `./assets/sprites/backgrounds/RuinsForest_${tod}_Composite.png`;
}

/** Generate cel-shaded SVG monster sprite data URL per enemy visual type (Turtle, Mushroom, Spider, etc.). */
const MONSTER_SVG_CACHE = new Map();
export function getMonsterCutoutUrl(enemyId) {
  const d = getGameData();
  const def = d?.enemies?.[enemyId] || {};
  const vis = String(def.visual || def.name || 'Turtle');
  if (MONSTER_SVG_CACHE.has(vis)) return MONSTER_SVG_CACHE.get(vis);

  const vLow = vis.toLowerCase();
  let bodySvg = '';

  if (vLow.includes('turtle')) {
    // Screenshot 4 exact match: mossy dark-green stone-plated shell + crimson-red clawed front legs & head
    bodySvg = `
      <g stroke="#080b0f" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
        <!-- Back legs -->
        <path d="M26 74 L14 86 L24 91 L35 80 Z" fill="#8b1d2c"/>
        <path d="M94 74 L106 86 L96 91 L85 80 Z" fill="#701522"/>
        <!-- Front crimson armored legs with claws -->
        <path d="M24 72 C16 78 14 92 18 98 L34 98 C36 90 36 80 34 74 Z" fill="#b91c32"/>
        <path d="M20 84 L32 88 M18 98 L15 103 M24 98 L23 104 M30 98 L31 103" stroke="#ef4444" stroke-width="2.2"/>
        <path d="M96 72 C104 78 106 92 102 98 L86 98 C84 90 84 80 86 74 Z" fill="#9f182b"/>
        <path d="M100 84 L88 88 M102 98 L105 103 M96 98 L97 104 M90 98 L89 103" stroke="#ef4444" stroke-width="2.2"/>
        <!-- Domed mossy dark-green shell -->
        <path d="M18 76 C14 42 34 24 60 24 C86 24 106 42 102 76 C90 84 30 84 18 76 Z" fill="#2d4c2b"/>
        <!-- Shell plates & moss highlights -->
        <path d="M34 38 L52 30 L72 30 L88 40 L82 60 L40 60 Z" fill="#3a6136" stroke="#182a17" stroke-width="2.5"/>
        <path d="M40 60 L22 72 M82 60 L98 72 M52 30 L46 18 M72 30 L76 18" stroke="#182a17" stroke-width="2.5"/>
        <path d="M25 68 C42 75 78 75 95 68" stroke="#a33244" stroke-width="4" fill="none"/>
        <!-- Crimson armored head protruding forward -->
        <path d="M44 68 C42 82 48 96 60 98 C72 96 78 82 76 68 C68 62 52 62 44 68 Z" fill="#b91c32"/>
        <path d="M48 74 L60 82 L72 74" fill="none" stroke="#ff4d6d" stroke-width="2.5"/>
        <!-- Glowing eyes -->
        <circle cx="51" cy="82" r="3" fill="#ffea79" stroke="#000" stroke-width="1.5"/>
        <circle cx="69" cy="82" r="3" fill="#ffea79" stroke="#000" stroke-width="1.5"/>
      </g>`;
  } else if (vLow.includes('mushroom')) {
    const capColor = vLow.includes('ice') ? '#38bdf8' : vLow.includes('fire') ? '#f97316' : vLow.includes('tank') ? '#a855f7' : '#e11d48';
    const spotColor = vLow.includes('ice') ? '#e0f2fe' : '#fef08a';
    bodySvg = `
      <g stroke="#080b0f" stroke-width="3.5" stroke-linejoin="round">
        <!-- Stalk body -->
        <path d="M42 58 C38 76 36 92 42 98 L78 98 C84 92 82 76 78 58 Z" fill="#e7dec8"/>
        <!-- Mushroom cap -->
        <path d="M16 62 C12 30 36 16 60 16 C84 16 108 30 104 62 C88 70 32 70 16 62 Z" fill="${capColor}"/>
        <circle cx="40" cy="38" r="8" fill="${spotColor}"/>
        <circle cx="76" cy="34" r="6" fill="${spotColor}"/>
        <circle cx="62" cy="48" r="7" fill="${spotColor}"/>
        <!-- Fierce eyes -->
        <circle cx="50" cy="74" r="3.5" fill="#111"/>
        <circle cx="70" cy="74" r="3.5" fill="#111"/>
      </g>`;
  } else if (vLow.includes('spider')) {
    bodySvg = `
      <g stroke="#080b0f" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
        <path d="M38 64 L12 52 L6 74 M36 72 L10 72 L6 92 M38 78 L18 90 L14 104" fill="none" stroke="#4c1d95" stroke-width="5"/>
        <path d="M82 64 L108 52 L114 74 M84 72 L110 72 L114 92 M82 78 L102 90 L106 104" fill="none" stroke="#4c1d95" stroke-width="5"/>
        <ellipse cx="60" cy="54" rx="26" ry="22" fill="#3b0764"/>
        <circle cx="60" cy="76" r="16" fill="#581c87"/>
        <circle cx="53" cy="80" r="3.5" fill="#ef4444"/>
        <circle cx="67" cy="80" r="3.5" fill="#ef4444"/>
      </g>`;
  } else if (vLow.includes('slime')) {
    bodySvg = `
      <g stroke="#080b0f" stroke-width="3.5" stroke-linejoin="round">
        <path d="M20 88 C16 52 34 30 60 30 C86 30 104 52 100 88 C90 98 30 98 20 88 Z" fill="#22c55e" fill-opacity="0.9"/>
        <ellipse cx="60" cy="66" rx="18" ry="14" fill="#86efac" opacity="0.5"/>
        <circle cx="48" cy="64" r="4" fill="#0f172a"/>
        <circle cx="72" cy="64" r="4" fill="#0f172a"/>
      </g>`;
  } else if (vLow.includes('demon') || vLow.includes('dragon') || vLow.includes('hydra')) {
    bodySvg = `
      <g stroke="#080b0f" stroke-width="3.5" stroke-linejoin="round">
        <path d="M22 44 L8 16 L38 32 Z" fill="#991b1b"/>
        <path d="M98 44 L112 16 L82 32 Z" fill="#991b1b"/>
        <path d="M28 96 C22 62 34 28 60 28 C86 28 98 62 92 96 Z" fill="#dc2626"/>
        <path d="M42 54 L60 66 L78 54" fill="none" stroke="#fef08a" stroke-width="3"/>
        <circle cx="48" cy="52" r="4" fill="#fef08a"/>
        <circle cx="72" cy="52" r="4" fill="#fef08a"/>
      </g>`;
  } else {
    bodySvg = `
      <g stroke="#080b0f" stroke-width="3.5" stroke-linejoin="round">
        <path d="M24 88 C20 50 38 28 60 28 C82 28 100 50 96 88 C84 96 36 96 24 88 Z" fill="#3f6212"/>
        <path d="M38 44 L60 32 L82 44 L76 74 L44 74 Z" fill="#65a30d"/>
        <circle cx="48" cy="68" r="4" fill="#ef4444"/>
        <circle cx="72" cy="68" r="4" fill="#ef4444"/>
      </g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 110">${bodySvg}</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  MONSTER_SVG_CACHE.set(vis, url);
  return url;
}

/** Ensure fallback CSS for all 4 in-run screens is injected once. */
export function ensureInRunStyles() {
  if (typeof document === 'undefined' || document.getElementById('gr-inrun-screens-css')) return;
  const st = document.createElement('style');
  st.id = 'gr-inrun-screens-css';
  st.textContent = `
    /* ======== SCREEN 3: CHOOSE HERO ======== */
    .gr-choose-hero-screen {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      background-color: #0b1114;
      background-size: cover;
      background-position: center;
    }
    .gr-choose-hero-bg {
      position: absolute;
      inset: -16px;
      background-size: cover;
      background-position: center;
      filter: blur(5px) brightness(0.86);
      z-index: 0;
      pointer-events: none;
    }
    .gr-choose-trees {
      position: absolute;
      top: 0;
      bottom: 0;
      height: 100%;
      width: auto;
      max-width: 34vw;
      object-fit: cover;
      z-index: 2;
      pointer-events: none;
    }
    .gr-choose-trees-left { left: 0; object-position: left center; }
    .gr-choose-trees-right { right: 0; object-position: right center; }

    .gr-choose-hero-title {
      position: relative;
      z-index: 5;
      margin: 48px 0 22px 0;
      font-size: 23px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #b8c7d0;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
    }
    .gr-initial-choice-row {
      position: relative;
      z-index: 5;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 44px;
      margin-top: 4px;
    }
    .gr-initial-choice-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      width: 350px;
      cursor: pointer;
    }
    .gr-initial-card-holder {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: transform 0.16s ease, filter 0.16s ease;
    }
    .gr-initial-choice-col:hover .gr-initial-card-holder {
      transform: translateY(-5px);
      filter: brightness(1.08);
    }
    .gr-initial-relic-box {
      position: relative;
      width: 350px;
      min-height: 82px;
      padding: 10px 14px 10px 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(14, 20, 24, 0.96);
      border: 1px solid rgba(135, 160, 175, 0.42);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
      cursor: pointer;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .gr-initial-choice-col:hover .gr-initial-relic-box {
      border-color: #d4af37;
    }
    .gr-initial-relic-slot-wrap {
      width: 62px;
      height: 62px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .gr-initial-relic-slot-wrap .relic-slot {
      width: 62px;
      height: 62px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-initial-relic-slot-wrap .relic-slot .slot-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .gr-initial-relic-slot-wrap .relic-slot .slot-icon {
      width: 48px;
      height: 48px;
      object-fit: contain;
      position: relative;
      z-index: 1;
    }
    .gr-initial-relic-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }
    .gr-initial-relic-name {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: #e6eef4;
      text-transform: uppercase;
    }
    .gr-initial-relic-desc {
      font-size: 12.5px;
      line-height: 1.35;
      color: #c2d0da;
    }

    /* Bottom-left Difficulty + Bonus Tokens */
    .gr-core-bottom-left {
      position: absolute;
      left: 14px;
      bottom: 12px;
      z-index: 15;
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: auto;
    }
    .gr-core-difficulty-text {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #e2e8f0;
      text-transform: uppercase;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
    }
    .gr-core-tokens-box {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      background-color: rgba(16, 24, 30, 0.9);
      border: 1px solid rgba(135, 160, 175, 0.42);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    }
    .gr-core-token-icon {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }

    /* Bottom-center Reroll button */
    .gr-initial-reroll-btn {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 15;
      height: 38px;
      padding: 0 14px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background-color: rgba(20, 30, 36, 0.94);
      border: 1px solid rgba(145, 170, 185, 0.5);
      color: #e2e8f0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.05em;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.65);
    }
    .gr-initial-reroll-btn:hover:not(:disabled) {
      filter: brightness(1.15);
      border-color: #d4af37;
    }
    .gr-initial-reroll-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .gr-reroll-cost-part, .gr-reroll-label-part {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .gr-reroll-divider {
      width: 1px;
      height: 22px;
      background: rgba(145, 170, 185, 0.35);
    }

    /* ======== SCREEN 4: PLACEMENT & STONE CIRCLE BATTLEFIELD ======== */
    .gr-placement-screen {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-size: cover;
      background-position: center;
      user-select: none;
    }
    .gr-battlefield-stone-circle {
      position: absolute;
      left: 48.5%;
      top: 56%;
      width: 640px;
      height: 340px;
      transform: translate(-50%, -50%);
      z-index: 4;
      pointer-events: auto;
    }
    .gr-hex-cell {
      position: absolute;
      transform: translate(-50%, -50%);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-hex-cell-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease;
    }
    .gr-hex-cell.player-cell .gr-hex-cell-svg {
      opacity: 0;
    }
    .gr-hex-cell.player-cell:hover .gr-hex-cell-svg,
    .gr-hex-cell.player-cell.drop-hover .gr-hex-cell-svg,
    body.dragging-hero .gr-hex-cell.player-cell .gr-hex-cell-svg,
    body.dragging-item .gr-hex-cell.player-cell.occupied .gr-hex-cell-svg {
      opacity: 0.68;
    }
    .gr-board-unit {
      position: absolute;
      transform: translate(-50%, -68%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: auto;
      cursor: grab;
      z-index: 6;
    }
    .gr-board-unit.drop-hover .gr-unit-bars-box {
      outline: 2px solid #facc15;
      box-shadow: 0 0 12px rgba(250, 204, 21, 0.7);
    }
    .gr-board-unit.enemy-unit {
      cursor: pointer;
    }
    .gr-unit-ground-shadow {
      position: absolute;
      bottom: 4px;
      left: 50%;
      transform: translateX(-50%);
      width: 74px;
      height: 22px;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 75%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }
    .gr-unit-cutout-wrap {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      height: 96px;
      width: 110px;
      pointer-events: none;
    }
    .gr-unit-cutout-img {
      max-height: 96px;
      max-width: 112px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter:
        drop-shadow(1.8px 0 0 #080b0f)
        drop-shadow(-1.8px 0 0 #080b0f)
        drop-shadow(0 1.8px 0 #080b0f)
        drop-shadow(0 -1.8px 0 #080b0f)
        drop-shadow(0 5px 7px rgba(0,0,0,0.55));
    }
    .gr-board-unit.enemy-unit .gr-unit-cutout-img {
      max-height: 76px;
      max-width: 88px;
    }
    .gr-board-unit.has-3d-model .gr-unit-cutout-img {
      opacity: 0;
    }
    .gr-placement-3d-canvas {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 5;
    }
    .gr-unit-overhead {
      position: relative;
      z-index: 3;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      margin-bottom: 4px;
      pointer-events: none;
    }
    .gr-unit-overhead-items {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      margin-bottom: 2px;
      pointer-events: auto;
    }
    .gr-unit-overhead-item-slot {
      width: 28px;
      height: 28px;
      background: rgba(12, 16, 22, 0.92);
      border: 1.5px solid rgba(160, 175, 190, 0.55);
      box-shadow: 0 2px 5px rgba(0,0,0,0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      pointer-events: auto;
    }
    .gr-unit-overhead-item-slot.has-item {
      cursor: pointer;
      border-color: rgba(212, 175, 55, 0.85);
    }
    .gr-unit-overhead-item-slot.has-item:hover {
      border-color: #facc15;
      filter: brightness(1.15);
    }
    .gr-unit-overhead-item-slot::after {
      content: '';
      width: 7px;
      height: 7px;
      border: 1px solid rgba(160, 175, 190, 0.35);
      display: block;
    }
    .gr-unit-overhead-item-slot.has-item::after {
      display: none;
    }
    .gr-unit-overhead-item-slot img {
      width: 22px;
      height: 22px;
      object-fit: contain;
    }
    .gr-unit-bars-box {
      width: 112px;
      background: #070a0e;
      border: 1.5px solid #070a0e;
      box-shadow: 0 2px 6px rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
    }
    .gr-unit-hp-bar {
      position: relative;
      width: 100%;
      height: 12px;
      background: #1a212b;
      overflow: hidden;
    }
    .gr-unit-hp-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background: #22c55e;
    }
    .gr-unit-hp-fill.enemy {
      background: #dc2626;
    }
    .gr-unit-hp-ticks {
      position: absolute;
      inset: 0;
      background-image: repeating-linear-gradient(
        90deg,
        transparent,
        transparent calc(var(--tick-pct, 20%) - 1px),
        rgba(0, 0, 0, 0.65) calc(var(--tick-pct, 20%) - 1px),
        rgba(0, 0, 0, 0.65) var(--tick-pct, 20%)
      );
      pointer-events: none;
    }
    .gr-unit-hp-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10.5px;
      font-weight: 800;
      color: #ffffff;
      text-shadow:
        1px 0 0 #000,
        -1px 0 0 #000,
        0 1px 0 #000,
        0 -1px 0 #000,
        0 1px 2px #000;
      line-height: 1;
      letter-spacing: 0.02em;
    }
    .gr-unit-mana-bar {
      width: 100%;
      height: 3px;
      background: #161f2c;
      border-top: 1px solid #070a0e;
      position: relative;
    }
    .gr-unit-mana-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background: #3b82f6;
    }

    /* FIGHT button on Placement screen (Screenshot 4) */
    .gr-fight-btn-placement, .gr-btn-primary {
      position: relative;
      width: 240px;
      height: 60px;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #f1f5f9;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.85);
      transition: transform 0.1s ease, filter 0.15s ease;
    }
    .gr-fight-btn-placement {
      position: absolute;
      right: 250px;
      bottom: 182px;
      z-index: 12;
    }
    .gr-fight-btn-placement:hover, .gr-btn-primary:hover:not(:disabled) {
      filter: brightness(1.12);
    }
    .gr-fight-btn-placement:active, .gr-btn-primary:active:not(:disabled) {
      transform: translateY(1px);
    }
    .gr-btn-primary-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }
    .gr-btn-primary-label {
      position: relative;
      z-index: 3;
      pointer-events: none;
    }

    /* ======== LIVE BATTLE CANVAS & TRACKER ======== */
    .gr-battle-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      display: block;
    }
    .gr-fallback-tracker-panel {
      position: absolute;
      right: 12px;
      top: 84px;
      width: 196px;
      z-index: 14;
      background: rgba(12, 17, 23, 0.92);
      border: 1px solid rgba(140, 165, 180, 0.42);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.7);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: auto;
    }
    .gr-tracker-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .gr-tracker-timer {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
      background: rgba(6, 9, 13, 0.85);
      border: 1px solid rgba(140, 165, 180, 0.35);
      padding: 3px 8px;
      letter-spacing: 0.05em;
    }
    .gr-tracker-speeds {
      display: flex;
      gap: 3px;
    }
    .gr-speed-btn {
      background: rgba(18, 25, 34, 0.92);
      border: 1px solid rgba(140, 165, 180, 0.38);
      color: #94a3b8;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 7px;
      cursor: pointer;
    }
    .gr-speed-btn.active {
      color: #f8fafc;
      border-color: #d97706;
      background: rgba(180, 83, 9, 0.35);
    }
    .gr-tracker-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
    }
    .gr-tracker-tab {
      background: rgba(16, 22, 30, 0.9);
      border: 1px solid rgba(140, 165, 180, 0.3);
      color: #94a3b8;
      font-size: 9.5px;
      font-weight: 700;
      padding: 3px 2px;
      cursor: pointer;
      text-transform: uppercase;
    }
    .gr-tracker-tab.active {
      color: #f8fafc;
      border-color: #d97706;
      background: rgba(180, 83, 9, 0.32);
    }
    .gr-tracker-rows {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 2px;
    }
    .gr-tracker-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gr-tracker-row.is-dead {
      opacity: 0.55;
    }
    .gr-tracker-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1px solid #94a3b8;
      object-fit: cover;
      flex-shrink: 0;
    }
    .gr-tracker-bar-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .gr-tracker-bar-val {
      font-size: 10.5px;
      font-weight: 700;
      color: #f1f5f9;
      text-align: right;
      line-height: 1;
    }
    .gr-tracker-bar-track {
      height: 7px;
      background: rgba(6, 9, 14, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.14);
      display: flex;
      overflow: hidden;
    }
    .gr-tracker-bar-seg {
      height: 100%;
    }
    .gr-tracker-bar-seg.is-ability { background: #c084fc; }
    .gr-tracker-bar-seg.is-attack { background: #facc15; }

    /* ======== SCREEN 5: POST-BATTLE RESULT OVERLAY (BATTLE WON) ======== */
    .gr-battle-result-overlay {
      position: absolute;
      inset: 0;
      z-index: 16;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding-bottom: 42px;
      pointer-events: auto;
    }
    .gr-result-big-title {
      margin: 0 0 12px 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #e2e8f0;
      text-shadow: 0 3px 10px rgba(0, 0, 0, 0.95);
    }
    .gr-result-big-title.is-loss {
      color: #f87171;
    }
    .gr-result-columns {
      display: flex;
      align-items: stretch;
      justify-content: center;
      gap: 16px;
      width: min(1160px, 76vw);
      height: min(510px, 64vh);
    }
    .gr-result-stats-panel,
    .gr-result-rewards-panel {
      position: relative;
      background-color: rgba(15, 20, 24, 0.96);
      border: 1.5px solid rgba(185, 165, 120, 0.65);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 14px 36px rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      padding: 14px 18px;
      overflow: hidden;
    }
    .gr-result-stats-panel {
      flex: 1 1 70%;
      min-width: 0;
    }
    .gr-result-rewards-panel {
      flex: 0 0 300px;
      justify-content: space-between;
    }
    .gr-result-watermark {
      position: absolute;
      left: 50%;
      bottom: 58px;
      transform: translateX(-50%);
      width: 82%;
      max-height: 180px;
      object-fit: contain;
      opacity: 0.14;
      pointer-events: none;
      z-index: 0;
    }
    .gr-result-panel-header {
      text-align: center;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
      position: relative;
      z-index: 2;
    }
    .gr-result-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 10px 0;
      position: relative;
      z-index: 2;
    }
    .gr-result-tab {
      height: 30px;
      background: rgba(10, 14, 20, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .gr-result-tab.is-active {
      color: #f8fafc;
      border-color: #d97706;
      background: linear-gradient(180deg, rgba(180, 83, 9, 0.32), rgba(120, 53, 15, 0.45));
      box-shadow: inset 0 0 8px rgba(245, 158, 11, 0.35);
    }
    .gr-result-left-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
      overflow-y: auto;
      position: relative;
      z-index: 2;
    }
    .gr-result-vs-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: rgba(8, 12, 17, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .gr-result-vs-team {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .gr-result-vs-unit {
      position: relative;
      width: 38px;
      height: 38px;
    }
    .gr-result-vs-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .gr-result-vs-frame {
      position: absolute;
      inset: -2px;
      width: calc(100% + 4px);
      height: calc(100% + 4px);
      object-fit: contain;
      pointer-events: none;
    }
    .gr-result-vs-rank {
      position: absolute;
      right: -3px;
      bottom: -3px;
      width: 15px;
      height: 15px;
      object-fit: contain;
      pointer-events: none;
    }
    .gr-result-vs-label {
      font-size: 13px;
      font-weight: 700;
      color: #94a3b8;
      margin: 0 6px;
    }
    .gr-result-duration-box {
      text-align: right;
    }
    .gr-result-duration-lbl {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #94a3b8;
    }
    .gr-result-duration-val {
      font-size: 17px;
      font-weight: 800;
      color: #f8fafc;
    }
    .gr-result-hero-rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .gr-result-hero-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      background: rgba(9, 13, 19, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.22);
    }
    .gr-result-hero-portrait {
      position: relative;
      width: 52px;
      height: 52px;
      flex-shrink: 0;
    }
    .gr-result-hero-img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .gr-result-hero-frame {
      position: absolute;
      inset: -2px;
      width: calc(100% + 4px);
      height: calc(100% + 4px);
      object-fit: contain;
      pointer-events: none;
    }
    .gr-result-hero-rank {
      position: absolute;
      right: -3px;
      bottom: -3px;
      width: 18px;
      height: 18px;
      object-fit: contain;
      pointer-events: none;
    }
    .gr-result-bars-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }
    .gr-result-stat-line {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .gr-result-bar-track {
      flex: 1;
      height: 11px;
      background: rgba(5, 8, 12, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.14);
      display: flex;
      overflow: hidden;
    }
    .gr-result-bar-seg {
      height: 100%;
    }
    .gr-result-bar-seg.seg-ability { background: #c084fc; }
    .gr-result-bar-seg.seg-attack { background: #facc15; }
    .gr-result-bar-seg.seg-mitigated { background: #4ade80; }
    .gr-result-bar-seg.seg-taken { background: #94a3b8; }
    .gr-result-bar-seg.seg-healed { background: #22c55e; }
    .gr-result-bar-num {
      width: 42px;
      text-align: right;
      font-size: 12px;
      font-weight: 800;
      color: #f8fafc;
    }
    .gr-result-statuses-col {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 84px;
      justify-content: flex-end;
    }
    .gr-result-status-chip {
      position: relative;
      width: 30px;
      height: 30px;
      background: rgba(12, 16, 22, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-result-status-icon {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }
    .gr-result-status-cnt {
      position: absolute;
      right: 1px;
      bottom: 0;
      font-size: 10px;
      font-weight: 800;
      color: #ffffff;
      text-shadow: 0 1px 2px #000, 1px 0 0 #000;
    }
    .gr-result-rewards-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding-top: 12px;
      position: relative;
      z-index: 2;
    }
    .gr-result-reward-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .gr-result-reward-row,
    .gr-result-total-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 700;
      color: #cbd5e1;
    }
    .gr-result-reward-val {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #f8fafc;
      font-weight: 800;
    }
    .gr-shard-inline {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    .gr-result-divider {
      height: 1px;
      background: rgba(180, 150, 95, 0.45);
      margin: 12px 0;
    }
    .gr-result-total-lbl {
      color: #f1f5f9;
      letter-spacing: 0.04em;
    }
    .gr-result-proceed-wrap {
      display: flex;
      justify-content: center;
      padding-top: 10px;
      position: relative;
      z-index: 2;
    }
    .gr-result-proceed-btn {
      width: 220px;
      height: 52px;
    }

    /* ======== SCREEN 6: SHOP OVERLAY WINDOW ======== */
    .gr-shop-overlay-wrap {
      position: absolute;
      inset: 0;
      z-index: 15;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-bottom: 44px;
      pointer-events: none;
    }
    .gr-shop-window {
      position: relative;
      width: min(1240px, 80vw);
      height: min(600px, 73vh);
      background-color: rgba(15, 20, 24, 0.96);
      border: 1.5px solid rgba(185, 165, 120, 0.7);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 16px 42px rgba(0, 0, 0, 0.88);
      padding: 14px 22px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto;
      overflow: hidden;
    }
    .gr-shop-deco-watermark {
      position: absolute;
      right: 20px;
      bottom: 10px;
      width: 48%;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
    }
    .gr-shop-topbar {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
    }
    .gr-shop-top-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .gr-shop-btn {
      height: 40px;
      padding: 0 14px;
      background-color: rgba(18, 25, 34, 0.95);
      background-image: url('./assets/sprites/ui/SecondaryButton.png');
      background-size: 100% 100%;
      border: 1px solid rgba(155, 175, 190, 0.45);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .gr-shop-btn:hover:not(:disabled) {
      filter: brightness(1.14);
      border-color: #d4af37;
    }
    .gr-shop-btn.is-active {
      border-color: #38bdf8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
    }
    .gr-shop-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .gr-shop-btn-icon {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    .gr-shop-btn-cost {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #ffffff;
      font-weight: 800;
    }
    .gr-shop-sell-zone {
      position: relative;
      height: 42px;
      padding: 0 18px 0 10px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(24, 18, 22, 0.92);
      border: 1px solid rgba(180, 140, 95, 0.55);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .gr-shop-sell-zone.drop-hover {
      border-color: #facc15;
      box-shadow: 0 0 14px rgba(250, 204, 21, 0.55);
    }
    .gr-sell-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
      opacity: 0.85;
    }
    .gr-sell-hex-wrap {
      position: relative;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
    .gr-sell-hex-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .gr-sell-hex-icon {
      position: relative;
      z-index: 1;
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    .gr-sell-label {
      position: relative;
      z-index: 2;
    }
    .gr-shop-proceed-btn {
      width: 210px;
      height: 46px;
    }
    .gr-shop-body {
      position: relative;
      z-index: 2;
      flex: 1;
      display: flex;
      gap: 20px;
      min-height: 0;
    }
    .gr-shop-left-col {
      width: 335px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
    }
    .gr-shop-sec {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .gr-shop-sec-title {
      text-align: center;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .gr-shop-offers-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .gr-shop-offer-row {
      display: flex;
      align-items: stretch;
      gap: 8px;
      cursor: pointer;
      transition: filter 0.14s ease, transform 0.14s ease;
    }
    .gr-shop-offer-row:hover:not(.is-sold) {
      filter: brightness(1.1);
    }
    .gr-shop-offer-row.is-sold {
      opacity: 0.42;
      cursor: default;
    }
    .gr-shop-offer-left {
      width: 62px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }
    .gr-shop-icon-box {
      position: relative;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-shop-slot-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .gr-shop-slot-icon {
      position: relative;
      z-index: 1;
      width: 42px;
      height: 42px;
      object-fit: contain;
    }
    .gr-shop-offer-price {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12.5px;
      font-weight: 800;
      color: #f8fafc;
    }
    .gr-shop-offer-textbox {
      flex: 1;
      min-height: 76px;
      padding: 7px 10px;
      background: rgba(11, 17, 20, 0.95);
      border: 1px solid rgba(145, 165, 180, 0.38);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 4px;
    }
    .gr-shop-item-stats {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .gr-shop-stat-line {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11.5px;
      color: #cbd5e1;
    }
    .gr-shop-stat-ic {
      width: 14px;
      height: 14px;
      object-fit: contain;
    }
    .gr-shop-stat-val {
      font-weight: 800;
      color: #f8fafc;
    }
    .gr-shop-item-heroes {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }
    .gr-shop-mini-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .gr-shop-mini-avatar {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid #94a3b8;
      object-fit: cover;
    }
    .gr-shop-mini-dots {
      display: flex;
      gap: 2px;
    }
    .gr-shop-mini-dot {
      width: 5px;
      height: 5px;
      border: 1px solid rgba(148, 163, 184, 0.6);
      background: rgba(15, 23, 42, 0.9);
    }
    .gr-shop-mini-dot.is-filled {
      background: #facc15;
      border-color: #fef08a;
    }
    .gr-shop-relic-desc {
      font-size: 11.5px;
      line-height: 1.32;
      color: #cbd5e1;
    }
    .gr-shop-heroes-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .gr-shop-heroes-row {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-around;
      gap: 12px;
    }
    .gr-shop-hero-col {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-shop-sale-badge {
      position: absolute;
      top: 32px;
      right: 8px;
      width: 54px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 8;
      pointer-events: none;
    }
    .gr-shop-sale-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }
    .gr-shop-sale-txt {
      position: relative;
      z-index: 1;
      font-size: 10.5px;
      font-weight: 900;
      letter-spacing: 0.06em;
      color: #ffffff;
    }
    .gr-shop-merge-pill {
      position: absolute;
      top: 58px;
      right: 8px;
      background: rgba(217, 119, 6, 0.92);
      border: 1px solid #fde047;
      color: #fff;
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 6px;
      z-index: 8;
      pointer-events: none;
    }

    /* ======== CROSSROADS 3-GATES & EVENT / CAMPFIRE WINDOWS ======== */
    .gr-crossroads-stage {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: none;
    }
    .gr-crossroads-heading {
      position: absolute;
      top: 96px;
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #e2e8f0;
      text-shadow: 0 3px 10px rgba(0, 0, 0, 0.95);
    }
    .gr-crossroads-gate {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 170px;
      height: 190px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      transition: filter 0.16s ease;
    }
    .gr-crossroads-gate.is-hover {
      filter: brightness(1.18);
    }
    .gr-gate-header {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      transition: transform 0.16s ease;
    }
    .gr-crossroads-gate.is-hover .gr-gate-header {
      transform: translateY(-5px);
    }
    .gr-gate-icon {
      width: 52px;
      height: 52px;
      object-fit: contain;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,0.85));
    }
    .gr-gate-title {
      max-width: 220px;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #f8fafc;
      text-align: center;
      text-transform: uppercase;
      text-shadow: 0 2px 6px #000, 0 0 2px #000;
    }
    .gr-gate-arch-glow {
      position: absolute;
      inset: 0;
      border-radius: 50% 50% 14px 14px / 42% 42% 14px 14px;
      background: radial-gradient(ellipse at 50% 60%, rgba(56, 189, 248, 0.42) 0%, rgba(56, 189, 248, 0.16) 45%, rgba(56, 189, 248, 0) 72%);
      pointer-events: none;
      animation: gr-gate-pulse 2.6s ease-in-out infinite;
    }
    .gr-crossroads-gate.is-hover .gr-gate-arch-glow {
      background: radial-gradient(ellipse at 50% 60%, rgba(125, 211, 252, 0.6) 0%, rgba(56, 189, 248, 0.24) 45%, rgba(56, 189, 248, 0) 74%);
    }
    @keyframes gr-gate-pulse {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }
    .gr-gate-anchored-box {
      position: absolute;
      transform: translateX(-50%);
      width: 260px !important;
      cursor: pointer;
      pointer-events: auto;
      transition: border-color 0.16s ease, filter 0.16s ease;
    }
    .gr-gate-anchored-box.is-hover {
      border-color: rgba(250, 204, 21, 0.9) !important;
      filter: brightness(1.1);
    }
    .gr-gate-tooltip-box {
      width: 100%;
      padding: 12px 14px;
      background: rgba(12, 17, 22, 0.96);
      border: 1px solid rgba(180, 150, 95, 0.65);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
    }
    .gr-gate-type-chip {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #facc15;
    }
    .gr-gate-desc {
      font-size: 12px;
      line-height: 1.35;
      color: #cbd5e1;
    }
    .gr-gate-choose-hint {
      font-size: 11px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 0.06em;
      margin-top: 2px;
    }
    .gr-event-window {
      width: min(1120px, 76vw);
      height: min(540px, 68vh);
      background: rgba(14, 19, 24, 0.96);
      border: 1.5px solid rgba(180, 150, 95, 0.7);
      box-shadow: 0 16px 42px rgba(0, 0, 0, 0.85);
      padding: 20px 24px;
      display: flex;
      gap: 24px;
      pointer-events: auto;
      overflow: hidden;
    }
    .gr-event-art-col {
      width: 360px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-event-art-frame {
      width: 100%;
      height: 100%;
      border: 1.5px solid rgba(180, 150, 95, 0.55);
      background: #090d12;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gr-event-artwork {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gr-event-text-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      overflow-y: auto;
    }
    .gr-event-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #f8fafc;
      text-transform: uppercase;
    }
    .gr-event-story {
      font-size: 13.5px;
      line-height: 1.48;
      color: #cbd5e1;
      padding: 10px 12px;
      background: rgba(8, 12, 18, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .gr-event-hero-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .gr-event-hero-lbl {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 0.06em;
    }
    .gr-event-hero-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .gr-event-hero-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(15, 22, 30, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .gr-event-hero-pill.is-active {
      border-color: #d97706;
      color: #ffffff;
      background: rgba(180, 83, 9, 0.35);
    }
    .gr-event-pill-avatar {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      object-fit: cover;
    }
    .gr-event-choices {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: auto;
    }
    .gr-event-choice-btn {
      width: 100%;
      text-align: left;
      padding: 10px 14px;
      background-color: rgba(18, 25, 34, 0.95);
      background-image: url('./assets/sprites/ui/SecondaryButton.png');
      background-size: 100% 100%;
      border: 1px solid rgba(155, 175, 190, 0.45);
      color: #f1f5f9;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .gr-event-choice-btn:hover:not(:disabled) {
      border-color: #d4af37;
      filter: brightness(1.1);
    }
    .gr-event-choice-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .gr-event-choice-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gr-event-choice-title {
      font-size: 13.5px;
      letter-spacing: 0.04em;
      color: #fef08a;
    }
    .gr-event-choice-desc {
      font-size: 12px;
      color: #cbd5e1;
    }
    .gr-campfire-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gr-campfire-actions-badge {
      font-size: 12px;
      font-weight: 700;
      color: #facc15;
      background: rgba(10, 14, 20, 0.85);
      border: 1px solid rgba(250, 204, 21, 0.4);
      padding: 4px 10px;
    }

    /* ======== SYNERGY / CLASS COUNTERS BAR ======== */
    .gr-hud-synergy-panel {
      padding: 6px 10px;
      margin-bottom: 4px;
      background: rgba(12, 18, 22, 0.92);
      border: 1px solid rgba(180, 150, 95, 0.48);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.65);
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 150px;
      pointer-events: auto;
    }
    .gr-synergy-title {
      font-size: 11px !important;
      margin-bottom: 2px !important;
      padding-bottom: 2px !important;
      color: #cbd5e1;
      letter-spacing: 0.08em;
    }
    .gr-synergy-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .gr-syn-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 7px;
      background: rgba(18, 26, 34, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.35);
      font-size: 11.5px;
      cursor: pointer;
    }
    .gr-syn-chip:hover {
      border-color: #facc15;
    }
    .gr-syn-chip .syn-icon {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
    .gr-syn-chip .syn-name {
      font-weight: 600;
      color: #e2e8f0;
    }
    .gr-syn-chip .syn-count {
      font-weight: 800;
      color: #facc15;
    }
    .gr-shop-synergy-strip {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .gr-shop-sell-zone {
      cursor: pointer;
      transition: border-color 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
    }
    .gr-shop-sell-zone:hover,
    .gr-shop-sell-zone.is-sell-mode {
      border-color: #facc15;
      box-shadow: 0 0 12px rgba(250, 204, 21, 0.45);
      filter: brightness(1.1);
    }
    .gr-shop-mini-hero {
      cursor: pointer;
      padding: 2px 3px;
      border-radius: 4px;
      transition: transform 0.12s ease, background 0.12s ease;
    }
    .gr-shop-mini-hero:hover {
      transform: scale(1.12);
      background: rgba(250, 204, 21, 0.18);
    }

    /* ======== RANK-UP & RELIC/ITEM PICKER MODALS ======== */
    .modal.modal-rankup {
      max-width: 960px;
      width: min(960px, 94vw);
    }
    .rankup-modal-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .rankup-hero-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: rgba(10, 15, 22, 0.88);
      border: 1px solid rgba(197, 164, 90, 0.42);
    }
    .rankup-hero-banner h3 {
      margin: 0 0 2px 0;
      font-size: 18px;
      color: #f8fafc;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .rankup-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 14px;
      align-items: stretch;
    }
    .rankup-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      background: rgba(14, 20, 28, 0.96);
      border: 1.5px solid rgba(197, 164, 90, 0.48);
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .rankup-card:hover {
      transform: translateY(-3px);
      border-color: #facc15;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.78), 0 0 14px rgba(250, 204, 21, 0.25);
    }
    .rankup-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }
    .rankup-class {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      background: rgba(43, 179, 163, 0.22);
      border: 1px solid rgba(76, 212, 196, 0.6);
      color: #5eead4;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .rankup-tags {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .rankup-tag {
      padding: 2px 7px;
      background: rgba(30, 41, 59, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.4);
      font-size: 11px;
      font-weight: 700;
      color: #e2e8f0;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .rankup-title {
      margin: 2px 0;
      font-size: 17px;
      font-weight: 700;
      color: #fef08a;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .rankup-ab {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: rgba(8, 12, 18, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.28);
    }
    .rankup-ab-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .rankup-spec-bonus {
      padding: 6px 8px;
      background: rgba(43, 179, 163, 0.12);
      border-left: 3px solid #2bb3a3;
      font-size: 12.5px;
      color: #e2e8f0;
      line-height: 1.38;
    }
  `;
  document.head.appendChild(st);
}

/** Build the authentic teal/gold Guildrun PrimaryButton (used for FIGHT and PROCEED). */
export function buildPrimaryButton(label, onClick, cls = 'gr-btn-primary') {
  return h('button', {
    type: 'button',
    class: `gr-btn-primary ${cls}`.trim(),
    onclick: onClick,
  },
    img('./assets/sprites/ui/Button_01_BottomLayer.png', { class: 'gr-btn-bg', alt: '' }),
    img('./assets/sprites/ui/Button_01_Hover.png', { class: 'gr-btn-hover', alt: '' }),
    img('./assets/sprites/ui/Button_01_Decos.png', { class: 'gr-btn-deco gr-btn-deco-left', alt: '' }),
    img('./assets/sprites/ui/Button_01_Decos.png', { class: 'gr-btn-deco gr-btn-deco-right', alt: '' }),
    img('./assets/sprites/ui/Button_01_TopLayer.png', { class: 'gr-btn-frame', alt: '' }),
    h('span', { class: 'gr-btn-label' }, label));
}

function formatDifficultyLabel(diff) {
  if (typeof diff === 'string' && diff.trim()) return diff.toUpperCase();
  const labels = ['SSS', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  const n = Number(diff);
  if (!Number.isFinite(n) || n <= 0) return 'SSS';
  return labels[Math.max(0, Math.min(labels.length - 1, n))] || 'SSS';
}

// ---------------- Screen 3: Initial Selection (CHOOSE HERO) ----------------
export function renderInitialSelection(ctx, vm) {
  ensureInRunStyles();
  const d = getGameData();
  let choices = vm.initialChoices || [];
  if (!choices.length) {
    const pool = d?.pools?.heroPools?.[1]?.entries || Object.keys(d?.heroes || {}).slice(0, 3);
    choices = pool.slice(0, 3).map((e, i) => ({
      slot: i,
      heroId: typeof e === 'object' ? (e.id ?? e.heroId) : e,
      relicId: [101, 2001, 102][i],
      rank: 1,
    }));
  }

  const fallbackRelics = Object.keys(d?.relics || {}).map(Number);

  function selectOffer(idx, choiceObj) {
    audio.playSfx('ui.hero_select');
    const hid = choiceObj?.heroId ?? choiceObj?.id;
    if (hid != null) {
      audio.playSfx(`vo.${hid}.buy`);
    }
    ctx.call('chooseInitial', idx, choiceObj);
    // Immediately advance past Intro to Placement so clicking a Hero+Relic pair enters Placement 1:1
    ctx.proceedFromIntro?.();
  }

  const cols = choices.slice(0, 3).map((c, idx) => {
    const isObj = c && typeof c === 'object';
    const heroId = isObj ? (c.heroId ?? c.id ?? 1) : Number(c);
    const relicId = (isObj && c.relicId != null)
      ? c.relicId
      : (fallbackRelics[idx] ?? 101);
    const rank = isObj ? (c.rank ?? 1) : 1;
    const rDef = d?.relics?.[relicId];

    const cardEl = heroCard(heroId, {
      rank,
      onClick: () => selectOffer(idx, c),
    });

    const relicBox = h('div', {
      class: 'gr-initial-relic-box',
      onclick: (e) => {
        e.stopPropagation();
        selectOffer(idx, c);
      },
    },
      h('div', { class: 'gr-initial-relic-slot-wrap' },
        relicSlot(relicId)),
      h('div', { class: 'gr-initial-relic-text' },
        h('div', { class: 'gr-initial-relic-name' }, (nameOf(rDef) || L(`Relique #${relicId}`, `Relic #${relicId}`)).toUpperCase()),
        h('div', {
          class: 'gr-initial-relic-desc',
          html: richText(descOf(rDef), { values: valuesOf(rDef), vars: rDef?.descriptionVars }),
        })));
    attachTooltip(relicBox, () => relicTooltip(relicId));

    return h('div', {
      class: 'gr-initial-choice-col',
      onclick: () => selectOffer(idx, c),
    },
      h('div', { class: 'gr-initial-card-holder' }, cardEl),
      relicBox);
  });

  const rerollsUsed = Number(vm.raw?.initialSelectRerolls || 0);
  const maxTokens = 4;
  const tokensLeft = Math.max(0, maxTokens - rerollsUsed);

  const bottomLeft = h('div', { class: 'gr-core-bottom-left' },
    h('div', { class: 'gr-core-difficulty-text' }, `${L('DIFFICULTÉ', 'DIFFICULTY')}: ${formatDifficultyLabel(vm.difficulty)}`),
    h('div', { class: 'gr-core-tokens-box' },
      Array.from({ length: maxTokens }, (_, i) =>
        img(
          i < tokensLeft
            ? './assets/sprites/enemies/BossToken_Small_Available.png'
            : './assets/sprites/enemies/BossToken_Small_Empty.png',
          { class: 'gr-core-token-icon' },
        ))));

  const rerollBtn = h('button', {
    class: 'gr-initial-reroll-btn',
    disabled: tokensLeft <= 0,
    onclick: (e) => {
      e.stopPropagation();
      if (tokensLeft <= 0) return;
      audio.playSfx('ui.reroll');
      if (ctx.hasMethod('rerollInitial')) {
        ctx.call('rerollInitial');
      } else if (vm.raw) {
        vm.raw.initialSelectRerolls = (vm.raw.initialSelectRerolls || 0) + 1;
        const heroIds = Object.keys(d?.heroes || {}).map(Number);
        vm.raw.initialChoices = Array.from({ length: 3 }, (_, i) => ({
          slot: i,
          heroId: heroIds[(vm.raw.initialSelectRerolls * 3 + i) % Math.max(1, heroIds.length)],
          relicId: fallbackRelics[(vm.raw.initialSelectRerolls * 3 + i) % Math.max(1, fallbackRelics.length)],
          rank: 1,
        }));
        ctx.rerender();
      }
    },
  },
    h('span', { class: 'gr-reroll-cost-part' },
      img('./assets/sprites/enemies/BossToken_Small_Available.png', { class: 'gr-core-token-icon' }),
      h('span', null, '1')),
    h('span', { class: 'gr-reroll-divider' }),
    h('span', { class: 'gr-reroll-label-part' },
      img('./assets/sprites/ui/icon_reset.png', { style: { width: '15px', height: '15px', objectFit: 'contain' } }),
      h('span', null, L('RELANCER', 'REROLL'))));

  const bgUrl = './assets/sprites/backgrounds/RuinsForest_Morning_Composite.png';

  return h('div', {
    class: 'screen screen-draft gr-choose-hero-screen',
    style: { backgroundImage: `url('${bgUrl}')` },
  },
    h('div', { class: 'gr-choose-hero-bg', style: { backgroundImage: `url('${bgUrl}')` } }),
    img('./assets/sprites/ui/Trees_Morning_Left.png', { class: 'gr-choose-trees gr-choose-trees-left' }),
    img('./assets/sprites/ui/Trees_Morning_Right.png', { class: 'gr-choose-trees gr-choose-trees-right' }),
    h('h1', { class: 'gr-choose-hero-title' }, L('CHOISISSEZ UN HÉROS', 'CHOOSE HERO')),
    h('div', { class: 'gr-initial-choice-row' }, cols),
    bottomLeft,
    rerollBtn);
}

// ---------------- Stage Intro (seamlessly enters Placement) ----------------
export function renderIntro(ctx, vm) {
  queueMicrotask(() => {
    if (vm.phase === 'intro') ctx.proceedFromIntro?.();
  });
  return renderPlacement(ctx, vm);
}

// ---------------- Screen 4: Stone-Circle Hex Placement Board ----------------
export function buildUnitOverheadHud(hp, maxHp, mana, maxMana, isEnemy = false, items = null, maxItemSlots = 1, ctx = null, hero = null) {
  const tickPct = Math.max(6, Math.min(50, (100 / Math.max(100, maxHp)) * 100));
  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
  const manaPct = maxMana > 0 ? Math.max(0, Math.min(100, ((mana || 0) / maxMana) * 100)) : 0;

  let itemRow = null;
  if (!isEnemy) {
    const slotCount = Math.max(1, Math.min(6, Number(hero?.maxItemSlots || maxItemSlots || hero?.rank || 1)));
    const eqItems = Array.isArray(items) ? items : [];
    itemRow = h('div', { class: 'gr-unit-overhead-items' },
      Array.from({ length: slotCount }, (_, i) => {
        const it = eqItems[i];
        const itId = it && (typeof it === 'object' ? (it.itemId ?? it.id) : it);
        const itUid = it && (typeof it === 'object' ? (it.uid ?? it.itemId ?? it.id) : it);
        const slotEl = h('div', {
          class: `gr-unit-overhead-item-slot gr-unit-item-slot ${itId ? 'has-item' : ''}`,
          title: itId
            ? L('Cliquez pour retirer ou glissez pour déplacer', 'Click to unequip or drag to move')
            : L('Emplacement d\'objet vide', 'Empty Item Slot'),
        },
          itId ? img(itemIcon(itId)) : null);

        if (itId) {
          attachTooltip(slotEl, () => itemTooltip(itId));
          if (ctx && hero) {
            makeDraggable(slotEl, { kind: 'item', uid: itUid, itemId: itId, fromHero: hero.uid });
            slotEl.addEventListener('dragstart', (ev) => {
              ev.stopPropagation();
              hideTooltip();
            });
            slotEl.addEventListener('click', (ev) => {
              ev.stopPropagation();
              hideTooltip();
              audio.playSfx('ui.click');
              unequipItemFromHero(ctx, itUid, hero.uid);
            });
            slotEl.addEventListener('contextmenu', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              hideTooltip();
              audio.playSfx('ui.click');
              unequipItemFromHero(ctx, itUid, hero.uid);
            });
          }
        }
        return slotEl;
      }));
  }

  return h('div', { class: 'gr-unit-overhead' },
    itemRow,
    h('div', { class: 'gr-unit-bars-box' },
      h('div', { class: 'gr-unit-hp-bar' },
        h('div', {
          class: `gr-unit-hp-fill ${isEnemy ? 'enemy' : 'ally'}`,
          style: { width: `${hpPct}%` },
        }),
        h('div', {
          class: 'gr-unit-hp-ticks',
          style: `--tick-pct: ${tickPct.toFixed(2)}%`,
        }),
        h('div', { class: 'gr-unit-hp-text' }, String(Math.ceil(hp)))),
      h('div', { class: 'gr-unit-mana-bar' },
        h('div', {
          class: 'gr-unit-mana-fill',
          style: { width: `${manaPct}%` },
        }))));
}

export function renderPlacement(ctx, vm) {
  ensureInRunStyles();
  const d = getGameData();
  const { W, H, playerRows } = boardInfo(d);
  const prSet = new Set(playerRows);

  // Hex geometry mapped onto the elliptical stone-circle clearing
  const hexSize = 42;
  const rawDims = boardDims(W, H, hexSize);
  const scaleY = 0.66;
  const boardW = Math.round(rawDims.width);
  const boardH = Math.round(rawDims.height * scaleY);

  const onBoardHeroes = vm.heroes.filter((hh) => hh.onBoard);
  const benchHeroes = vm.heroes.filter((hh) => !hh.onBoard);

  // Auto-deploy first hero onto the stone circle if player owns heroes and none are placed yet
  if (onBoardHeroes.length === 0 && benchHeroes.length > 0) {
    queueMicrotask(() => {
      ctx.call('placeHero', benchHeroes[0].uid, 2, 1);
    });
  }

  if (ctx.selectedHeroUid && vm.heroes.some((hh) => String(hh.uid) === String(ctx.selectedHeroUid))) {
    selectedHeroUid = ctx.selectedHeroUid;
  } else if (!selectedHeroUid || !vm.heroes.some((hh) => String(hh.uid) === String(selectedHeroUid))) {
    selectedHeroUid = (onBoardHeroes[0] || benchHeroes[0])?.uid ?? null;
  }
  ctx.selectedHeroUid = selectedHeroUid;

  const heroAt = new Map();
  for (const hh of onBoardHeroes) {
    if (hh.x != null && hh.y != null) heroAt.set(`${hh.x},${hh.y}`, hh);
  }

  const mirroredEnemies = mirrorEnemies(vm.enemies || [], H, playerRows);
  const enemyAt = new Map();
  mirroredEnemies.forEach((e, i) => {
    const ex = e.x != null ? e.x : (3 + (i % 3) - 1);
    const ey = e.y != null ? e.y : (H - 3 - Math.floor(i / 3));
    enemyAt.set(`${ex},${ey}`, { ...e, x: ex, y: ey });
  });

  const stoneCircleEl = h('div', {
    class: 'gr-battlefield-stone-circle hex-board',
    style: { width: `${boardW}px`, height: `${boardH}px` },
  });

  const unitEls = [];
  const units3dMeta = [];

  for (let row = 0; row < H; row++) {
    const isPlayerRow = prSet.has(row);
    for (let col = 0; col < W; col++) {
      const center = hexCenter(col, row, hexSize, H);
      const cx = Math.round(center.x);
      const cy = Math.round(center.y * scaleY);
      const cellW = Math.round(hexSize * 1.732);
      const cellH = Math.round(hexSize * 2 * scaleY);
      const key = `${col},${row}`;
      const occHero = heroAt.get(key);
      const occEnemy = !occHero ? enemyAt.get(key) : null;

      const cell = h('div', {
        class: `hex-cell gr-hex-cell ${isPlayerRow ? 'player-cell' : 'enemy-cell'} ${occHero ? 'occupied' : ''}`,
        dataset: { col: String(col), row: String(row) },
        style: {
          left: `${cx}px`,
          top: `${cy}px`,
          width: `${cellW}px`,
          height: `${cellH}px`,
        },
        onclick: (e) => {
          e.stopPropagation();
          if (occHero) {
            if (selectedItemUid != null) {
              audio.playSfx('ui.equip');
              equipItemOnHero(ctx, selectedItemUid, occHero.uid);
              selectedItemUid = null;
              return;
            }
            selectedHeroUid = occHero.uid;
            ctx.selectedHeroUid = occHero.uid;
            audio.playSfx('ui.hero_pick');
            ctx.rerender();
          } else if (isPlayerRow && selectedHeroUid != null) {
            audio.playSfx('ui.hero_drop');
            ctx.call('placeHero', selectedHeroUid, col, row);
          }
        },
        ondblclick: (e) => {
          if (occHero && onBoardHeroes.length > 1) {
            e.preventDefault();
            e.stopPropagation();
            audio.playSfx('ui.hero_drop');
            ctx.call('benchHero', occHero.uid);
          }
        },
        oncontextmenu: (e) => {
          if (occHero) {
            e.preventDefault();
            e.stopPropagation();
            openUnitInspector(occHero, { event: e, vm, ctx });
          } else if (occEnemy) {
            e.preventDefault();
            e.stopPropagation();
            openUnitInspector(occEnemy, { event: e, isEnemy: true, vm, ctx });
          }
        },
      });

      const hexSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      hexSvg.setAttribute('viewBox', '0 0 100 100');
      hexSvg.setAttribute('class', 'gr-hex-cell-svg');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '50,3 96,26 96,74 50,97 4,74 4,26');
      poly.setAttribute('fill', isPlayerRow ? 'rgba(255,255,255,0.06)' : 'none');
      poly.setAttribute('stroke', isPlayerRow ? 'rgba(255,255,255,0.45)' : 'rgba(255,90,90,0.2)');
      poly.setAttribute('stroke-width', '2.5');
      hexSvg.appendChild(poly);
      cell.appendChild(hexSvg);

      if (isPlayerRow || occHero) {
        makeDropTarget(
          cell,
          (p) => p.kind === 'hero' || (p.kind === 'item' && !!occHero),
          (p) => {
            if (p.kind === 'hero') {
              audio.playSfx('ui.hero_drop');
              ctx.call('placeHero', p.uid, col, row);
            } else if (p.kind === 'item' && occHero) {
              audio.playSfx('ui.equip');
              equipItemOnHero(ctx, p.uid ?? p.itemId, occHero.uid, p.fromHero);
            }
          },
        );
      }

      stoneCircleEl.appendChild(cell);

      // Standing cutout unit on this hex
      if (occHero) {
        const rank = occHero.rank || 1;
        const effStats = computeHeroEffectiveStats(occHero.heroId, occHero);
        const maxHp = Math.round(effStats.MaxHealth || 600);
        const startMana = effStats.StartingMana || 0;
        const maxMana = effStats.MaxMana ?? 100;
        const maxSlots = occHero.maxItemSlots || rank || 1;

        const unitNode = h('div', {
          class: `gr-board-unit gr-unit-on-board hero-unit ${String(occHero.uid) === String(selectedHeroUid) ? 'is-selected' : ''}`,
          dataset: { uid: String(occHero.uid) },
          style: { left: `${cx}px`, top: `${cy}px`, zIndex: String(10 + Math.round(cy)) },
          onclick: (e) => {
            e.stopPropagation();
            if (selectedItemUid != null) {
              audio.playSfx('ui.equip');
              equipItemOnHero(ctx, selectedItemUid, occHero.uid);
              selectedItemUid = null;
              return;
            }
            selectedHeroUid = occHero.uid;
            ctx.selectedHeroUid = occHero.uid;
            audio.playSfx('ui.hero_pick');
            ctx.rerender();
          },
          ondblclick: (e) => {
            if (onBoardHeroes.length > 1) {
              e.preventDefault();
              e.stopPropagation();
              audio.playSfx('ui.hero_drop');
              ctx.call('benchHero', occHero.uid);
            }
          },
          oncontextmenu: (e) => {
            e.preventDefault();
            e.stopPropagation();
            openUnitInspector(occHero, { event: e, vm, ctx });
          },
        },
          buildUnitOverheadHud(maxHp, maxHp, startMana, maxMana, false, occHero.items, maxSlots, ctx, occHero),
          h('div', { class: 'gr-unit-cutout-wrap' },
            img(
              heroPortrait(occHero.heroId, 'full', rank) || heroPortrait(occHero.heroId, 'card', rank),
              { class: 'gr-unit-cutout-img' },
              heroPortrait(occHero.heroId, 'round'),
            )),
          h('div', { class: 'gr-unit-ground-shadow' }));

        attachTooltip(unitNode, () => heroTooltip(occHero.heroId, occHero));
        makeDraggable(unitNode, { kind: 'hero', uid: occHero.uid });
        makeDropTarget(
          unitNode,
          (p) => p.kind === 'item' || p.kind === 'hero',
          (p) => {
            if (p.kind === 'item') {
              audio.playSfx('ui.equip');
              equipItemOnHero(ctx, p.uid ?? p.itemId, occHero.uid, p.fromHero);
            } else if (p.kind === 'hero') {
              audio.playSfx('ui.hero_drop');
              ctx.call('placeHero', p.uid, col, row);
            }
          },
        );
        unitEls.push(unitNode);
        units3dMeta.push({ node: unitNode, req: { heroId: occHero.heroId, team: 'hero', rank } });
      } else if (occEnemy) {
        const eDef = d?.enemies?.[occEnemy.enemyId] || {};
        const eSnap = computeLiveUnitSnapshot(occEnemy, { isEnemy: true, vm, ctx });
        let rawMaxHp = eSnap?.unit?.maxHp ?? eDef.stats?.MaxHealth ?? 200;
        if (!eSnap?.unit) {
          const endlessN = Number(vm.endlessFloorIndex ?? -1);
          if (endlessN > 0 && eDef.scalingId != null && d?.enemyScaling?.[eDef.scalingId]) {
            const sc = d.enemyScaling[eDef.scalingId];
            const exp = endlessN * (0.43092 + 0.07815 * endlessN);
            const hpMod = (sc.statMods || []).find(m => m.stat === 'MaxHealth');
            if (hpMod) {
              if (hpMod.type === 'Exponential') {
                const b = Number(hpMod.base) > 0 ? Number(hpMod.base) : 1;
                rawMaxHp = rawMaxHp * Math.pow(b, exp) + (Number(hpMod.flatIncrease) || 0) * endlessN;
              } else if (hpMod.type === 'Linear') {
                rawMaxHp = rawMaxHp + (Number(hpMod.flatIncrease) || 0) * exp;
              }
            }
          }
        }
        const maxHp = Math.round(rawMaxHp);
        const startMana = eSnap?.unit?.stats?.StartingMana ?? eDef.stats?.StartingMana ?? 0;
        const maxMana = eSnap?.unit?.maxMana ?? eDef.stats?.MaxMana ?? 100;

        const unitNode = h('div', {
          class: 'gr-board-unit enemy-unit',
          style: { left: `${cx}px`, top: `${cy}px`, zIndex: String(10 + Math.round(cy)), cursor: 'pointer' },
          onclick: (e) => {
            e.stopPropagation();
            openUnitInspector(occEnemy, { event: e, isEnemy: true, vm, ctx });
          },
          oncontextmenu: (e) => {
            e.preventDefault();
            e.stopPropagation();
            openUnitInspector(occEnemy, { event: e, isEnemy: true, vm, ctx });
          },
        },
          buildUnitOverheadHud(maxHp, maxHp, startMana, maxMana, true),
          h('div', { class: 'gr-unit-cutout-wrap' },
            img(getMonsterCutoutUrl(occEnemy.enemyId), { class: 'gr-unit-cutout-img' })),
          h('div', { class: 'gr-unit-ground-shadow' }));

        attachTooltip(unitNode, () => enemyTooltip(occEnemy));
        unitEls.push(unitNode);
        units3dMeta.push({
          node: unitNode,
          req: { enemyId: occEnemy.enemyId, name: eDef?.name, team: 'enemy', isBoss: /boss/i.test(String(vm.stage?.stageType || '')) && !/mini/i.test(String(vm.stage?.stageType || '')) },
        });
      }
    }
  }

  for (const uEl of unitEls) {
    stoneCircleEl.appendChild(uEl);
  }

  attachPlacement3D(stoneCircleEl, boardW, boardH, units3dMeta);

  const coopReadyInfo = ctx.coop?.getRoundReadyUI?.(vm) || null;
  const fightBtnLabel = coopReadyInfo?.active ? coopReadyInfo.label : L('COMBAT', 'FIGHT');
  const fightBtnExtraCls = coopReadyInfo?.active
    ? `${coopReadyInfo.myReady ? 'is-waiting-coop' : ''} ${coopReadyInfo.partnerReady && !coopReadyInfo.myReady ? 'is-ally-ready-coop' : ''}`.trim()
    : '';

  const fightBtn = buildPrimaryButton(
    fightBtnLabel,
    () => {
      if (onBoardHeroes.length === 0 && benchHeroes.length > 0) {
        const free = findFirstFreeTile(W, playerRows, heroAt);
        if (free) ctx.call('placeHero', benchHeroes[0].uid, free.row != null ? free.col : free.col, free.row);
      }
      audio.playSfx('ui.fight');
      ctx.startBattleFlow();
    },
    `gr-fight-btn-placement btn-fight ${fightBtnExtraCls}`.trim(),
  );

  const bgComposite = resolveStageComposite(vm.stage, vm.act);
  const screen = h('div', {
    class: 'screen screen-placement gr-placement-screen',
    style: { backgroundImage: `url('${bgComposite}')` },
  },
    hud(ctx, vm),
    stoneCircleEl,
    fightBtn);

  queueMicrotask(() => {
    maybeShowRelicPickerModal(ctx, vm);
    maybeShowRankUpModal(ctx, vm);
  });
  return screen;
}

let placement3D = null; // { canvas, renderer, loopToken }

function attachPlacement3D(stoneCircleEl, boardW, boardH, metas) {
  if (!placement3D) {
    const canvas = document.createElement('canvas');
    canvas.className = 'gr-placement-3d-canvas';
    const renderer = createModel3DRenderer(canvas);
    if (!renderer) return;
    placement3D = { canvas, renderer, loopToken: 0 };
  }
  const { canvas, renderer } = placement3D;
  const padX = 160;
  const padY = 200;
  const cw = boardW + padX * 2;
  const chh = boardH + padY * 2;
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== chh) canvas.height = chh;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${chh}px`;
  stoneCircleEl.appendChild(canvas);

  metas.forEach((m, i) => {
    m.phase = (i * 0.37) % 1.7;
    m.shadow = m.node.querySelector('.gr-unit-ground-shadow');
    renderer.preloadUnit(m.req);
  });

  const token = ++placement3D.loopToken;
  let everConnected = false;
  const t0 = performance.now();

  const frame = (now) => {
    if (placement3D.loopToken !== token) return;
    if (!stoneCircleEl.isConnected) {
      if (everConnected || now - t0 > 3000) return;
      requestAnimationFrame(frame);
      return;
    }
    everConnected = true;
    const cRect = canvas.getBoundingClientRect();
    const ratio = (canvas.clientWidth || cRect.width) > 0 ? canvas.width / (canvas.clientWidth || cRect.width) : 1;
    const time = (now - t0) / 1000;
    const units = [];
    for (const m of metas) {
      if (!m.node.isConnected) continue;
      const localX = parseFloat(m.node.style.left);
      const localY = parseFloat(m.node.style.top);
      let footX, footY;
      if (Number.isFinite(localX) && Number.isFinite(localY)) {
        footX = localX + padX;
        footY = localY + padY + 6;
      } else {
        const ref = (m.shadow || m.node).getBoundingClientRect();
        footX = (ref.left + ref.width / 2 - cRect.left) * ratio;
        footY = (ref.top + ref.height / 2 - cRect.top) * ratio;
      }
      const isHero = m.req.team === 'hero';
      const uReq = {
        ...m.req,
        footX,
        footY,
        targetHeightPx: m.req.isBoss ? 140 : (isHero ? 104 : 86),
        yaw: isHero ? 0 : Math.PI,
        _meta: m.req,
        animState: 'idle',
        animTime: time + m.phase,
        alpha: 1,
        outlineWidth: 2.2,
      };
      units.push(uReq);
      const ready = renderer.isUnitModelReady(uReq);
      if (ready !== m.node.classList.contains('has-3d-model')) {
        m.node.classList.toggle('has-3d-model', ready);
      }
      if (ready) {
        if (!m.overhead) m.overhead = m.node.querySelector('.gr-unit-overhead');
        const hCss = renderer.getUnitHeightPx(uReq) / ratio;
        const lift = Math.max(0, Math.round(hCss + 8 - 100));
        if (m.overhead && m.lift !== lift) {
          m.lift = lift;
          m.overhead.style.translate = `0 -${lift}px`;
        }
      }
    }
    // Face nearest opponent (heroes look up at the enemies, enemies look down at the heroes).
    for (const u of units) {
      let best = null;
      let bestD = Infinity;
      for (const o of units) {
        if (o.team === u.team) continue;
        const dd = Math.hypot(o.footX - u.footX, o.footY - u.footY);
        if (dd < bestD) { bestD = dd; best = o; }
      }
      const m = metas.find((mm) => mm.req === u._meta);
      const want = best ? yawToward(best.footX - u.footX, best.footY - u.footY) : (u.team === 'hero' ? 0 : Math.PI);
      if (m) {
        if (m.yaw == null) m.yaw = want;
        let diff = ((want - m.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        m.yaw += diff * 0.2;
        u.yaw = m.yaw;
      } else {
        u.yaw = want;
      }
    }
    renderer.renderUnits(units);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function findFirstFreeTile(W, playerRows, heroAt) {
  const rows = [...playerRows].sort((a, b) => b - a);
  for (const r of rows) {
    for (let c = 0; c < W; c++) {
      if (!heroAt.has(`${c},${r}`)) return { col: c, row: r };
    }
  }
  return null;
}

// ---------------- Relic / Item / Rank-Up Modals ----------------
let rankUpOpenFor = null;
let relicPickerOpenFor = null;

export function maybeShowRelicPickerModal(ctx, vm) {
  const d = getGameData();
  const pr = vm.pendingRelicChoices;
  if (pr && Array.isArray(pr.choices) && pr.choices.length > 0) {
    const sig = `relic:${JSON.stringify(pr.choices)}`;
    if (relicPickerOpenFor === sig || document.querySelector('.modal-relic-picker')) return true;
    relicPickerOpenFor = sig;
    audio.playSfx('ui.click');

    const cards = pr.choices.map((rId, idx) => {
      const rDef = d?.relics?.[rId];
      const rName = nameOf(rDef) || L(`Relique #${rId}`, `Relic #${rId}`);
      const rDesc = descOf(rDef) || '';
      const rar = assets.rarityName ? assets.rarityName(rDef?.rarity) : (rDef?.rarity || 'Rare');
      const q = rDef?.quest;
      const qDesc = q ? (txt(q.descriptionKey) !== q.descriptionKey && q.descriptionKey ? txt(q.descriptionKey) : txt(q.description)) : '';
      const qRew = q ? (txt(q.rewardDescriptionKey) !== q.rewardDescriptionKey && q.rewardDescriptionKey ? txt(q.rewardDescriptionKey) : txt(q.rewardDescription)) : '';

      const card = h('div', {
        class: 'rankup-card panel relic-picker-card',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '18px 16px',
          gap: '10px',
          cursor: 'pointer',
          minWidth: '240px',
        },
        onclick: () => {
          audio.playSfx('ui.buy');
          relicPickerOpenFor = null;
          m.close();
          ctx.call('pickRelic', rId);
        },
      },
        h('div', { style: { transform: 'scale(1.18)', margin: '6px 0' } },
          relicSlot(rId, { tooltip: false })
        ),
        h('span', {
          class: `rankup-tag tag-${String(rDef?.rarity || 'rare').toLowerCase()}`,
          style: { fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fbbf24' },
        }, L(`Relique ${rar}`, `${rar} Relic`)),
        h('h3', { class: 'rankup-title', style: { margin: '2px 0', fontSize: '17px', color: '#f8fafc' } }, rName),
        rDesc ? h('div', {
          class: 'rankup-desc',
          style: { lineHeight: '1.45', fontSize: '13.5px', color: '#cbd5e1' },
          html: richText(rDesc, { values: valuesOf(rDef) }),
        }) : null,
        qDesc && qDesc !== rDesc ? h('div', {
          class: 'rankup-desc',
          style: { fontSize: '12.5px', color: '#94a3b8' },
          html: `<b>${L('QUÊTE :', 'QUEST:')}</b> ${richText(qDesc, { values: q.descriptionVars })}`,
        }) : null,
        qRew ? h('div', {
          class: 'rankup-desc',
          style: { fontSize: '12.5px', color: '#fde68a' },
          html: `<b>${L('RÉCOMPENSE :', 'REWARD:')}</b> ${richText(qRew, { values: q.rewardDescriptionVars })}`,
        }) : null,
        h('button', { class: 'btn btn-primary btn-sm', style: { marginTop: 'auto', width: '100%' } }, `${L('CHOISIR', 'CHOOSE')} ${idx + 1}`)
      );
      attachTooltip(card, () => relicTooltip(rId));
      return card;
    });

    const body = h('div', { class: 'rankup-modal-body' },
      pr.subtitle ? h('div', {
        class: 'muted',
        style: { textAlign: 'center', marginBottom: '12px', fontSize: '14px', color: '#cbd5e1' },
        html: richText(txt(pr.subtitle)),
      }) : null,
      h('div', { class: 'rankup-grid' }, cards),
      pr.canSkip ? h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '14px' } },
        h('button', {
          class: 'btn btn-sm',
          onclick: () => {
            audio.playSfx('ui.click');
            relicPickerOpenFor = null;
            m.close();
            ctx.call('skipRelicReward');
          },
        }, L('PASSER', 'SKIP'))
      ) : null
    );

    const relicModalTitle = (!pr.title || pr.title === 'CHOOSE A RELIC')
      ? L('CHOISISSEZ UNE RELIQUE', 'CHOOSE A RELIC')
      : txt(pr.title);

    const m = modal({
      title: `◆ ${relicModalTitle}`,
      body,
      cls: 'modal-rankup modal-relic-picker',
      dismissable: !!pr.canSkip,
    });
    return true;
  }

  const pi = vm.pendingItemChoices;
  if (pi && Array.isArray(pi.choices) && pi.choices.length > 0) {
    const sig = `item:${JSON.stringify(pi.choices)}`;
    if (relicPickerOpenFor === sig || document.querySelector('.modal-relic-picker')) return true;
    relicPickerOpenFor = sig;
    audio.playSfx('ui.click');

    const cards = pi.choices.map((itId, idx) => {
      const itDef = d?.items?.[itId];
      const itName = nameOf(itDef) || L(`Objet #${itId}`, `Item #${itId}`);
      const itDesc = descOf(itDef) || '';
      const rar = assets.rarityName ? assets.rarityName(itDef?.rarity) : (itDef?.rarity || 'Common');

      const card = h('div', {
        class: 'rankup-card panel relic-picker-card',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '18px 16px',
          gap: '10px',
          cursor: 'pointer',
          minWidth: '240px',
        },
        onclick: () => {
          audio.playSfx('ui.buy');
          relicPickerOpenFor = null;
          m.close();
          ctx.call('pickItem', itId);
        },
      },
        h('div', { style: { transform: 'scale(1.18)', margin: '6px 0' } },
          itemSlot(itId, { tooltip: false })
        ),
        h('span', {
          class: `rankup-tag tag-${String(itDef?.rarity || 'common').toLowerCase()}`,
          style: { fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#38bdf8' },
        }, L(`Objet ${rar}`, `${rar} Item`)),
        h('h3', { class: 'rankup-title', style: { margin: '2px 0', fontSize: '17px', color: '#f8fafc' } }, itName),
        (itDef?.statMods || []).length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', color: '#4ade80' } },
          itDef.statMods.map((sm) => h('div', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' } },
            img(statIcon(sm.stat), { class: 'chip-icon', style: { width: '16px', height: '16px' } }),
            `+${fmtNum(sm.value)}${sm.percent || sm.isPercent ? '%' : ''} ${statName(sm.stat)}`
          ))
        ) : null,
        itDesc ? h('div', {
          class: 'rankup-desc',
          style: { lineHeight: '1.45', fontSize: '13.5px', color: '#cbd5e1' },
          html: richText(itDesc, { values: valuesOf(itDef) }),
        }) : null,
        h('button', { class: 'btn btn-primary btn-sm', style: { marginTop: 'auto', width: '100%' } }, `${L('CHOISIR', 'CHOOSE')} ${idx + 1}`)
      );
      attachTooltip(card, () => itemTooltip(itId));
      return card;
    });

    const body = h('div', { class: 'rankup-modal-body' },
      pi.subtitle ? h('div', {
        class: 'muted',
        style: { textAlign: 'center', marginBottom: '12px', fontSize: '14px', color: '#cbd5e1' },
        html: richText(txt(pi.subtitle)),
      }) : null,
      h('div', { class: 'rankup-grid' }, cards),
      pi.canSkip ? h('div', { style: { display: 'flex', justifyContent: 'center', marginTop: '14px' } },
        h('button', {
          class: 'btn btn-sm',
          onclick: () => {
            audio.playSfx('ui.click');
            relicPickerOpenFor = null;
            m.close();
            ctx.call('skipItemReward');
          },
        }, L('PASSER', 'SKIP'))
      ) : null
    );

    const itemModalTitle = (!pi.title || pi.title === 'CHOOSE AN ITEM')
      ? L('CHOISISSEZ UN OBJET', 'CHOOSE AN ITEM')
      : txt(pi.title);

    const m = modal({
      title: `◆ ${itemModalTitle}`,
      body,
      cls: 'modal-rankup modal-relic-picker',
      dismissable: !!pi.canSkip,
    });
    return true;
  }

  relicPickerOpenFor = null;
  return false;
}

export function maybeShowRankUpModal(ctx, vm) {
  if (maybeShowRelicPickerModal(ctx, vm)) return;
  const ru = vm.rankUp;
  if (!ru && vm.phase !== 'rankup') { rankUpOpenFor = null; return; }
  const choices = Array.isArray(ru) ? ru : (ru?.choices || ru?.options || ru?.specializationIds || ru?.rankModifierIds || []);
  if (!choices.length) return;
  const sig = JSON.stringify({ heroUid: ru?.heroUid ?? ru?.uid, rank: ru?.rank, choices });
  if (rankUpOpenFor === sig || document.querySelector('.modal-rankup')) return;
  rankUpOpenFor = sig;

  const d = getGameData();
  const heroUid = ru?.heroUid ?? ru?.uid;
  const hero = vm.heroes.find((x) => String(x.uid) === String(heroUid)) || vm.heroes[0];
  const heroDef = hero ? d?.heroes?.[hero.heroId] : null;
  const targetRank = ru?.rank || hero?.rank || 2;
  const targetLetter = rankLetter(targetRank);

  audio.playSfx('ui.rankup');

  const cards = choices.map((c, idx) => {
    const id = typeof c === 'object' ? (c.id ?? c.specializationId ?? c.rankModifierId ?? c.statModId) : c;
    const spec = d?.specializations?.[id];
    const rmod = !spec ? d?.rankModifiers?.[id] : null;
    const smod = !spec && !rmod ? d?.statMods?.[id] : null;
    const entry = spec || rmod || smod || (typeof c === 'object' ? c : { name: L(`Amélioration #${id}`, `Upgrade #${id}`) });
    const cls = spec?.classId ? d?.classes?.[spec.classId] : null;

    // Resolve the actual Active or Passive ability granted by a Rank B HeroSpecialization
    const activeAb = spec?.activeAbilityId != null ? d?.activeAbilities?.[spec.activeAbilityId] : null;
    const passiveAb = spec?.passiveAbilityId != null ? d?.passiveAbilities?.[spec.passiveAbilityId] : null;
    const specAb = activeAb || passiveAb;
    const specAbIsPassive = !activeAb && !!passiveAb;
    const specAbIcon = specAb ? abilityIcon(specAb.id, specAbIsPassive) : null;
    const rmodIcon = rmod?.icon || null;

    const tags = specAb?.tags || rmod?.tags || [];
    const heroStats = hero
      ? computeHeroEffectiveStats(hero.heroId, {
          ...hero,
          rank: targetRank,
          specializationId: spec ? id : hero.specializationId,
          rankModifierIds: rmod ? [...(hero.rankModifierIds || []), id] : hero.rankModifierIds,
        })
      : null;

    const specBonusDesc = spec ? descOf(spec) : '';
    const specBonusHtml = specBonusDesc
      ? richText(specBonusDesc, { values: valuesOf(spec), stats: heroStats, rank: targetRank })
      : '';
    const entryDescHtml = specAb
      ? richText(descOf(specAb), { values: valuesOf(specAb), stats: heroStats, rank: targetRank })
      : richText(descOf(entry), { values: valuesOf(entry), stats: heroStats, rank: targetRank });

    const manaCost = activeAb?.manaCost;
    const cooldown = activeAb?.cooldown;
    const abTypeLabel = specAbIsPassive
      ? L('Compétence Passive', 'Passive Ability')
      : L('Compétence Active', 'Active Ability');

    const card = h('div', {
      class: 'rankup-card panel',
      onclick: () => {
        audio.playSfx('ui.hero_select');
        if (hero?.heroId != null) audio.playSfx(`vo.${hero.heroId}.rankup`);
        rankUpOpenFor = null;
        m.close();
        ctx.call('rankUpChoice', idx, c);
      },
    },
      h('div', { class: 'rankup-card-top' },
        cls ? h('div', { class: 'rankup-class' },
          img(classIcon(cls.id), { class: 'chip-icon' }),
          `+ ${nameOf(cls)}`,
        ) : null,
        specAb ? h('span', {
          class: `rankup-tag ${specAbIsPassive ? 'tag-passive' : 'tag-active'}`,
          style: {
            fontSize: '10px',
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: specAbIsPassive ? '#a78bfa' : '#38bdf8',
          },
        }, abTypeLabel) : null,
        tags.length ? h('div', { class: 'rankup-tags' }, tags.map((tg) => h('span', { class: `rankup-tag tag-${String(tg).toLowerCase()}` }, tg))) : null),
      h('h3', { class: 'rankup-title' }, nameOf(entry) || `Option ${idx + 1}`),
      specBonusHtml ? h('div', {
        class: 'rankup-spec-bonus',
        style: {
          fontSize: '12.5px',
          color: '#fde68a',
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.25)',
          borderRadius: '6px',
          padding: '6px 8px',
          lineHeight: '1.35',
        },
        html: specBonusHtml,
      }) : null,
      specAb ? h('div', { class: 'rankup-ab' },
        specAbIcon ? img(specAbIcon, { class: 'chip-icon', style: { width: '38px', height: '38px', borderRadius: '6px' } }) : null,
        h('div', { class: 'rankup-ab-meta', style: { flex: '1' } },
          h('strong', { style: { display: 'block', fontSize: '14px', color: '#f8fafc' } }, nameOf(specAb)),
          h('div', { class: 'muted', style: { fontSize: '11px', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' } },
            h('span', null, abTypeLabel),
            manaCost != null && manaCost > 0 ? h('span', { style: { color: '#60a5fa' } }, `Mana: ${manaCost}`) : null,
            cooldown != null && cooldown > 0 ? h('span', { style: { color: '#94a3b8' } }, `${L('Recharge', 'CD')}: ${cooldown}s`) : null,
          ))) : null,
      rmod ? h('div', { class: 'rankup-ab' },
        rmodIcon ? img(rmodIcon, { class: 'chip-icon', style: { width: '38px', height: '38px', borderRadius: '6px' } }) : null,
        h('div', { class: 'rankup-ab-meta' },
          h('strong', { style: { display: 'block', fontSize: '14px', color: '#f8fafc' } }, nameOf(rmod) || L(`Amélioration Rang ${targetLetter}`, `Rank ${targetLetter} Upgrade`)),
          h('div', { class: 'muted', style: { fontSize: '11px' } }, `${L('Modificateur de Rang', 'Rank Modifier')} (${targetLetter})`))) : null,
      h('div', { class: 'rankup-desc', style: { marginTop: '6px', lineHeight: '1.45', fontSize: '13.5px' }, html: entryDescHtml }),
      h('button', { class: 'btn btn-primary btn-sm', style: { marginTop: 'auto', width: '100%' } }, L('CHOISIR', 'CHOOSE')));

    if (specAb) {
      attachTooltip(card, () => abilityTooltip(specAb.id, specAbIsPassive, hero));
    } else if (rmod) {
      attachTooltip(card, () => rankModTooltip(rmod.id, hero));
    }
    return card;
  });

  const slotCount = hero?.maxItemSlots || targetRank;
  const body = h('div', { class: 'rankup-modal-body' },
    heroDef ? h('div', { class: 'rankup-hero-banner' },
      img(heroPortrait(hero.heroId, 'round', targetRank), { class: 'insp-avatar' }),
      h('div', null,
        h('h3', null, nameOf(heroDef)),
        h('div', { class: 'muted' }, `${L('Rang', 'Rank')} ${targetLetter} · ${slotCount} ${L('Emplacements d\'objets', 'Item Slots')}`))) : null,
    h('div', { class: 'rankup-grid' }, cards));

  const subTitle = targetRank === 2
    ? L('Choisissez une Spécialisation (Rang B)', 'Choose a Specialization (Rank B)')
    : L('Choisissez une Amélioration de Rang', 'Choose a Rank Upgrade');

  const m = modal({
    title: `★ ${L('PROMOTION DE RANG', 'RANK UP')} (${targetLetter}) — ${subTitle}`,
    body,
    cls: 'modal-rankup',
    dismissable: false,
  });
}
