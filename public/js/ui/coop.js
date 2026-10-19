// ============================================================================
// GUILDRUN: DOUBLE RIFT — 2-Player Co-Op Mode (Impeccable Unity UI Edition)
// - Parallel Battles + Mid-Combat Portal Reinforcements
// - Individual Shards & Shop + Live Trading (Shards, Items, Heroes)
// - Shared Squad Relics
// - Real-Time WebSocket (/ws/coop) + HTTP Polling Fallback (/api/coop/*) + AI Partner
// ============================================================================

import { h, img, toast } from './dom.js';
import {
  SPR,
  heroPortrait,
  itemIcon,
  relicIcon,
  relicFrame,
  rankFrame,
  rankBadge,
} from './assets.js';
import { getGameData, txt, getLang, onLangChange } from '../data.js';
import { audio } from '../audio.js';
import { makeDropTarget } from './components.js';

const L = (fr, en) => (getLang() === 'en' ? en : fr);

const UI = './assets/sprites/ui';
const BG = './assets/sprites/backgrounds';
const MAP = './assets/sprites/map_events';

const STORAGE_PLAYER_ID = 'guildrun_coop_pid_v1';
const STORAGE_PLAYER_NAME = 'guildrun_coop_name_v1';

function getOrCreatePlayerId() {
  try {
    let id = localStorage.getItem(STORAGE_PLAYER_ID);
    if (!id) {
      id = 'p_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(STORAGE_PLAYER_ID, id);
    }
    return id;
  } catch {
    return 'p_' + Math.random().toString(36).slice(2, 10);
  }
}

function getSavedPlayerName() {
  try {
    return localStorage.getItem(STORAGE_PLAYER_NAME) || L('Aventurier', 'Adventurer');
  } catch {
    return L('Aventurier', 'Adventurer');
  }
}

function savePlayerName(name) {
  try {
    localStorage.setItem(STORAGE_PLAYER_NAME, name);
  } catch {}
}

function ensureCoopStyles() {
  if (typeof document === 'undefined' || document.getElementById('gr-coop-styles')) return;
  const st = document.createElement('style');
  st.id = 'gr-coop-styles';
  st.textContent = `
    /* ---------------- Authentic Guildrun Window Backdrop & Frame ---------------- */
    .gr-coop-backdrop {
      position: fixed;
      inset: 0;
      z-index: 250;
      background: rgba(4, 9, 12, 0.80);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      user-select: none;
      font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
      color: #eef5f2;
    }

    .gr-coop-window {
      position: relative;
      width: 980px;
      max-width: 95vw;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, rgba(16, 22, 26, 0.98) 0%, rgba(11, 16, 19, 0.98) 100%);
      border: 1.5px solid rgba(197, 160, 89, 0.72);
      box-shadow:
        0 26px 72px rgba(0, 0, 0, 0.90),
        inset 0 0 0 1px rgba(235, 245, 240, 0.08);
      overflow: hidden;
    }

    .gr-coop-window::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, #d4af37 22%, #f3e3ad 50%, #d4af37 78%, transparent 100%);
      pointer-events: none;
      z-index: 3;
    }

    /* ---------------- Top Bar (Matches Shop & New Run Header) ---------------- */
    .gr-coop-topbar {
      position: relative;
      height: 68px;
      min-height: 68px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: linear-gradient(180deg, rgba(19, 32, 36, 0.96) 0%, rgba(12, 19, 22, 0.96) 100%);
      border-bottom: 1px solid rgba(180, 195, 190, 0.28);
      z-index: 2;
    }

    .gr-coop-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      padding: 8px 12px 8px 4px;
      color: #e4dec8;
      font-size: 14.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.14s ease, transform 0.1s ease;
    }

    .gr-coop-back-btn:hover {
      color: #ffffff;
    }

    .gr-coop-back-btn:active {
      transform: translateX(-1px);
    }

    .gr-coop-back-tri {
      width: 11px;
      height: 11px;
      object-fit: contain;
      transform: rotate(90deg);
      filter: sepia(0.35) brightness(1.08);
    }

    .gr-coop-title-group {
      flex: 1;
      min-width: 0;
      text-align: center;
      pointer-events: none;
    }

    .gr-coop-title {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #eef5f2;
      text-transform: uppercase;
      margin: 0;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.75);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gr-coop-subtitle {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: #c5a059;
      text-transform: uppercase;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gr-coop-topbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    /* ---------------- Layered Guildrun Buttons ---------------- */
    .gr-coop-btn-primary,
    .gr-coop-btn-secondary {
      position: relative;
      border: none;
      background: transparent;
      padding: 0 18px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      overflow: hidden;
      transition: filter 0.14s ease, transform 0.08s ease, opacity 0.14s ease;
      outline: none;
      color: #eef5f2;
      font-family: inherit;
    }

    .gr-coop-btn-primary {
      width: 260px;
      height: 52px;
    }

    .gr-coop-btn-secondary {
      height: 40px;
      min-width: 136px;
    }

    .gr-coop-btn-primary:hover:not(:disabled),
    .gr-coop-btn-secondary:hover:not(:disabled) {
      filter: brightness(1.14);
    }

    .gr-coop-btn-primary:active:not(:disabled),
    .gr-coop-btn-secondary:active:not(:disabled) {
      transform: translateY(1px);
    }

    .gr-coop-btn-primary:disabled,
    .gr-coop-btn-secondary:disabled {
      opacity: 0.45;
      cursor: default;
      filter: grayscale(0.5);
    }

    .gr-coop-btn-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }

    .gr-coop-btn-deco-l,
    .gr-coop-btn-deco-r {
      position: absolute;
      top: 50%;
      width: 18px;
      height: 36px;
      object-fit: contain;
      pointer-events: none;
      z-index: 2;
    }

    .gr-coop-btn-deco-l {
      left: 7px;
      transform: translateY(-50%);
    }

    .gr-coop-btn-deco-r {
      right: 7px;
      transform: translateY(-50%) scaleX(-1);
    }

    .gr-coop-btn-content {
      position: relative;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #eef5f2;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
      white-space: nowrap;
    }

    .gr-coop-btn-content img {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }

    /* ---------------- Window Body & Panels ---------------- */
    .gr-coop-body {
      padding: 20px 24px 22px 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }

    .gr-coop-panel {
      position: relative;
      background: rgba(15, 21, 24, 0.96);
      border: 1px solid rgba(175, 190, 185, 0.36);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .gr-coop-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(175, 190, 185, 0.22);
      padding-bottom: 8px;
    }

    .gr-coop-panel-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.07em;
      color: #dbe8e4;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .gr-coop-panel-title img {
      width: 18px;
      height: 18px;
      object-fit: contain;
    }

    .gr-coop-textbox {
      background: rgba(10, 15, 18, 0.95);
      border: 1px solid rgba(175, 190, 185, 0.34);
      padding: 10px 14px;
    }

    .gr-coop-input {
      background: rgba(8, 13, 16, 0.95);
      border: 1px solid rgba(175, 190, 185, 0.48);
      color: #eef5f2;
      padding: 6px 12px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.03em;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .gr-coop-input:focus {
      border-color: #c5a059;
    }

    .gr-coop-code-input {
      width: 156px;
      height: 44px;
      text-align: center;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #e8d399;
      border: 1.5px solid rgba(197, 160, 89, 0.68);
      background: rgba(7, 11, 14, 0.96);
    }

    /* ---------------- Contract Rules Rows (Matches Difficulty Modifiers) ---------------- */
    .gr-coop-rule-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: rgba(18, 25, 29, 0.92);
      border: 1px solid rgba(175, 190, 185, 0.28);
      font-size: 12.5px;
      color: #dce7e3;
    }

    .gr-coop-rule-icon {
      width: 28px;
      height: 28px;
      object-fit: contain;
      flex-shrink: 0;
    }

    /* ---------------- Player Slot Cards ---------------- */
    .gr-coop-slot-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 16px;
      background: rgba(11, 17, 20, 0.95);
      border: 1px solid rgba(175, 190, 185, 0.36);
      min-height: 78px;
    }

    .gr-coop-slot-card.is-ready {
      border-color: rgba(74, 222, 128, 0.55);
      box-shadow: inset 0 0 18px rgba(74, 222, 128, 0.06);
    }

    .gr-coop-medallion {
      position: relative;
      width: 52px;
      height: 52px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .gr-coop-medallion-art {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      background: #0a1014;
    }

    .gr-coop-medallion-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }

    .gr-coop-medallion-rank {
      position: absolute;
      right: -4px;
      bottom: -2px;
      width: 20px;
      height: 20px;
      object-fit: contain;
      pointer-events: none;
    }

    /* ---------------- Tabs Bar (Matches Leaderboard / Battle Stats Tabs) ---------------- */
    .gr-coop-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .gr-coop-tab {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 36px;
      padding: 0 14px;
      background: rgba(14, 22, 26, 0.85);
      border: 1px solid rgba(175, 190, 185, 0.32);
      color: rgba(220, 232, 228, 0.72);
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.14s ease;
    }

    .gr-coop-tab img {
      width: 15px;
      height: 15px;
      object-fit: contain;
      opacity: 0.8;
    }

    .gr-coop-tab.is-active {
      background: rgba(29, 111, 122, 0.38);
      border-color: #c5a059;
      color: #ffffff;
    }

    .gr-coop-tab.is-active img {
      opacity: 1;
    }

    /* ---------------- Trade Offer Rows (Matches Shop Item Rows in 6_shop.png) ---------------- */
    .gr-coop-trade-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .gr-coop-offer-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .gr-coop-item-box {
      position: relative;
      width: 56px;
      height: 56px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(9, 13, 16, 0.95);
    }

    .gr-coop-item-box-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }

    .gr-coop-item-box-icon {
      width: 40px;
      height: 40px;
      object-fit: contain;
      position: relative;
      z-index: 1;
    }

    .gr-coop-offer-card {
      flex: 1;
      min-width: 0;
      min-height: 56px;
      background: rgba(11, 17, 20, 0.95);
      border: 1px solid rgba(175, 190, 185, 0.35);
      padding: 7px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    /* ---------------- In-Run CoreGameUI Co-Op Partner HUD Widget ---------------- */
    .gr-coop-hud {
      position: absolute;
      top: 68px;
      left: 10px;
      z-index: 120;
      pointer-events: auto;
      width: 226px;
      background: rgba(14, 19, 21, 0.95);
      border: 1px solid rgba(197, 164, 90, 0.42);
      border-top: 2px solid #c5a059;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.72);
      padding: 8px 10px 9px 10px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: #eef5f2;
      user-select: none;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }

    .gr-coop-hud.drop-hover {
      border-color: #e8d399;
      box-shadow: 0 0 20px rgba(212, 175, 55, 0.55);
      transform: scale(1.02);
    }

    .gr-coop-hud-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      border-bottom: 1px solid rgba(175, 190, 185, 0.20);
      padding-bottom: 5px;
    }

    .gr-coop-hud-ally {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .gr-coop-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 6px #4ade80;
      flex-shrink: 0;
    }

    .gr-coop-hud-name {
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #eef5f2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gr-coop-hud-shards {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      color: #e8d399;
      flex-shrink: 0;
    }

    .gr-coop-hud-shards img {
      width: 14px;
      height: 14px;
      object-fit: contain;
    }

    .gr-coop-hud-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: rgba(210, 225, 220, 0.78);
    }

    .gr-coop-hud-phase {
      color: #4ade80;
      font-weight: 700;
    }

    .gr-coop-hud-phase.is-battle {
      color: #f59e0b;
    }

    .gr-coop-hud-squad {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-height: 36px;
      padding: 2px 0;
    }

    .gr-coop-hud-Portraits {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .gr-coop-mini-unit {
      position: relative;
      width: 34px;
      height: 34px;
    }

    .gr-coop-mini-unit-art {
      width: 28px;
      height: 28px;
      margin: 3px;
      border-radius: 50%;
      object-fit: cover;
      background: #090e12;
    }

    .gr-coop-mini-unit-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }

    .gr-coop-mini-unit-hp {
      position: absolute;
      left: 3px;
      right: 3px;
      bottom: -2px;
      height: 3px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(0, 0, 0, 0.9);
    }

    .gr-coop-mini-unit-hp > span {
      display: block;
      height: 100%;
      background: #22c55e;
    }

    .gr-coop-hud-relic-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(197, 160, 89, 0.42);
      font-size: 10px;
      font-weight: 700;
      color: #e8d399;
      letter-spacing: 0.03em;
    }

    .gr-coop-hud-relic-pill img {
      width: 13px;
      height: 13px;
      object-fit: contain;
    }

    .gr-coop-actions-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .gr-coop-mini-btn {
      position: relative;
      height: 28px;
      border: none;
      background: transparent;
      padding: 0 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      overflow: hidden;
      transition: filter 0.12s ease, transform 0.08s ease;
    }

    .gr-coop-mini-btn:hover {
      filter: brightness(1.15);
    }

    .gr-coop-mini-btn:active {
      transform: translateY(1px);
    }

    .gr-coop-mini-btn-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }

    .gr-coop-mini-btn-label {
      position: relative;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #eef5f2;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    }

    .gr-coop-mini-btn-label img {
      width: 12px;
      height: 12px;
      object-fit: contain;
    }

    /* ---------------- Top-Center Rift Reinforcement Banner ---------------- */
    .gr-coop-banner {
      position: fixed;
      top: 76px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 240;
      padding: 9px 24px;
      background: rgba(12, 18, 21, 0.96);
      border: 1.5px solid #c5a059;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
      color: #eef5f2;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      pointer-events: none;
      animation: grCoopBannerIn 0.25s ease-out;
    }

    .gr-coop-banner img {
      width: 20px;
      height: 20px;
      object-fit: contain;
    }

    @keyframes grCoopBannerIn {
      from { opacity: 0; transform: translate(-50%, -12px); }
      to   { opacity: 1; transform: translate(-50%, 0); }
    }
  `;
  document.head.appendChild(st);
}

function buildCoopPrimaryBtn(label, onClick, opts = {}) {
  const disabled = Boolean(opts.disabled);
  return h(
    'button',
    {
      type: 'button',
      class: `gr-coop-btn-primary ${opts.cls || ''}`.trim(),
      disabled,
      style: opts.style || null,
      onclick: onClick,
    },
    img(disabled ? SPR.btnDisabled : SPR.btnBottom, { class: 'gr-coop-btn-layer', alt: '' }),
    img(SPR.btnDecos, { class: 'gr-coop-btn-deco-l', alt: '' }),
    img(SPR.btnDecos, { class: 'gr-coop-btn-deco-r', alt: '' }),
    img(SPR.btnTop, { class: 'gr-coop-btn-layer', alt: '' }),
    h(
      'span',
      { class: 'gr-coop-btn-content' },
      opts.icon ? img(opts.icon, { alt: '' }) : null,
      h('span', null, label)
    )
  );
}

function buildCoopSecondaryBtn(label, onClick, opts = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: `gr-coop-btn-secondary ${opts.cls || ''}`.trim(),
      disabled: Boolean(opts.disabled),
      style: opts.style || null,
      onclick: onClick,
    },
    img(SPR.btnSecondary, { class: 'gr-coop-btn-layer', alt: '' }),
    h(
      'span',
      { class: 'gr-coop-btn-content' },
      opts.icon ? img(opts.icon, { alt: '' }) : null,
      h('span', null, label),
      opts.rightIcon ? img(opts.rightIcon, { alt: '' }) : null
    )
  );
}

function buildHudMiniBtn(label, iconPath, onClick, extraCls = '') {
  return h(
    'button',
    {
      type: 'button',
      class: `gr-coop-mini-btn ${extraCls}`.trim(),
      onclick: onClick,
    },
    img(SPR.btnSecondary, { class: 'gr-coop-mini-btn-bg', alt: '' }),
    h(
      'span',
      { class: 'gr-coop-mini-btn-label' },
      iconPath ? img(iconPath, { alt: '' }) : null,
      h('span', null, label)
    )
  );
}

export function showCoopBanner(text, durationMs = 3400, iconSrc = `${MAP}/FightRoom.png`) {
  ensureCoopStyles();
  const old = document.querySelector('.gr-coop-banner');
  if (old) old.remove();
  const el = h(
    'div',
    { class: 'gr-coop-banner' },
    img(iconSrc, { alt: '' }),
    h('span', null, text)
  );
  document.body.appendChild(el);
  setTimeout(() => {
    try { el.remove(); } catch {}
  }, durationMs);
}

export function createCoopController(ctx) {
  ensureCoopStyles();

  const state = {
    active: false,
    code: null,
    playerId: getOrCreatePlayerId(),
    playerName: getSavedPlayerName(),
    isHost: false,
    room: null,
    partner: null,
    ws: null,
    pollTimer: null,
    botTimer: null,
    pendingReinforcements: null,
    sentReinforcementsThisFloor: -1,
    spawnedReinforcementsThisFloor: -1,
    knownMyRelics: new Set(),
    sharedRelics: [],
    lobbyRefreshFn: null,
    lobbyModalClose: null,
    inRunWindowRefreshFn: null,
    serverless: false,
    bc: null,
    peer: null,
    p2pConn: null,
  };

  let peerJsPromise = null;
  function loadPeerJs() {
    if (typeof window !== 'undefined' && window.Peer) return Promise.resolve(window.Peer);
    if (peerJsPromise) return peerJsPromise;
    peerJsPromise = new Promise((resolve) => {
      try {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
        s.async = true;
        s.onload = () => resolve(window.Peer || null);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      } catch {
        resolve(null);
      }
    });
    return peerJsPromise;
  }

  function broadcastP2P(msg) {
    try {
      if (state.bc) state.bc.postMessage(msg);
    } catch {}
    try {
      if (state.p2pConn && state.p2pConn.open) state.p2pConn.send(msg);
    } catch {}
  }

  function applyServerlessAction(full, fromRemote = false) {
    if (!state.room) return null;
    const room = state.room;
    room.players = room.players || {};
    room.sharedRelics = room.sharedRelics || [];
    const pid = full.playerId || state.playerId;
    const sender = room.players[pid];

    switch (full.type) {
      case 'JOIN_REQUEST': {
        if (!room.players[full.playerId]) {
          room.players[full.playerId] = {
            id: full.playerId,
            name: full.playerName || L('Coéquipier', 'Teammate'),
            slot: Object.keys(room.players).length + 1,
            isHost: false,
            isBot: false,
            ready: true,
            floor: 1,
            act: 1,
            shards: 15,
            lives: 1,
            phase: 'Lobby',
            board: [],
            relics: [],
          };
        }
        applyRoomSnapshot(room);
        broadcastP2P({ type: 'ROOM_SYNC', room });
        break;
      }
      case 'ADD_BOT': {
        const botId = 'bot_aria';
        room.players[botId] = {
          id: botId,
          name: full.botName || L('Aria (Bot Allié)', 'Aria (AI Ally)'),
          slot: 2,
          isHost: false,
          isBot: true,
          ready: true,
          floor: 1,
          act: 1,
          shards: 15,
          lives: 1,
          phase: 'Placement',
          board: [],
          relics: [],
        };
        applyRoomSnapshot(room);
        if (!fromRemote) broadcastP2P({ type: 'ROOM_SYNC', room });
        break;
      }
      case 'START_COOP_RUN': {
        room.status = 'running';
        room.difficulty = full.difficulty ?? room.difficulty ?? 6;
        room.seed = full.seed || room.seed || (Date.now() & 0x7fffffff);
        applyRoomSnapshot(room);
        if (!fromRemote) broadcastP2P({ type: 'COOP_RUN_STARTED', room });
        break;
      }
      case 'STATE_UPDATE': {
        if (sender) {
          sender.phase = full.phase ?? sender.phase;
          sender.floor = full.floor ?? sender.floor;
          sender.act = full.act ?? sender.act;
          sender.shards = full.shards ?? sender.shards;
          sender.lives = full.lives ?? sender.lives;
          sender.board = full.board ?? sender.board;
          sender.relics = full.relics ?? sender.relics;
          sender.battleState = full.battleState ?? sender.battleState;
        }
        applyRoomSnapshot(room);
        if (!fromRemote) broadcastP2P({ type: 'PARTNER_STATE', room });
        break;
      }
      case 'RELIC_ACQUIRED': {
        const rid = Number(full.relicId);
        if (Number.isFinite(rid) && rid > 0) {
          const exists = room.sharedRelics.some((r) => r.relicId === rid && r.fromPlayerId === pid);
          if (!exists) {
            const entry = {
              relicId: rid,
              fromPlayerId: pid,
              fromName: sender?.name || state.playerName,
              completed: !!full.completed,
              progress: Number(full.progress || 0),
            };
            room.sharedRelics.push(entry);
            const ev = { type: 'SHARED_RELIC_ADDED', entry, sharedRelics: room.sharedRelics };
            handleIncomingEvent(ev);
            if (!fromRemote) broadcastP2P(ev);
          }
        }
        break;
      }
      case 'REINFORCEMENT_SEND': {
        const ev = {
          type: 'REINFORCEMENT_ARRIVED',
          fromId: pid,
          fromName: sender?.name || state.playerName,
          floor: full.floor || 1,
          survivors: full.survivors || [],
        };
        if (fromRemote) handleIncomingEvent(ev);
        else broadcastP2P(ev);
        break;
      }
      case 'TRADE_SEND': {
        const ev = {
          type: 'TRADE_RECEIVED',
          fromId: pid,
          fromName: sender?.name || state.playerName,
          gift: full.gift,
        };
        if (fromRemote) handleIncomingEvent(ev);
        else broadcastP2P(ev);
        break;
      }
      case 'CROSSROADS_VOTE': {
        room.crossroadsVotes = room.crossroadsVotes || {};
        room.crossroadsVotes[pid] = full.gateIndex;
        const ev = {
          type: 'CROSSROADS_VOTES',
          fromId: pid,
          fromName: sender?.name || state.playerName,
          gateIndex: full.gateIndex,
          votes: room.crossroadsVotes,
        };
        handleIncomingEvent(ev);
        if (!fromRemote) broadcastP2P(ev);
        break;
      }
    }
    try {
      localStorage.setItem('guildrun_coop_room_' + room.code, JSON.stringify(room));
    } catch {}
    return { ok: true, room };
  }

  onLangChange(() => {
    refreshHudWidget();
    if (state.lobbyRefreshFn) state.lobbyRefreshFn();
    if (state.inRunWindowRefreshFn) state.inRunWindowRefreshFn();
  });

  function getPartnerFromRoom(room) {
    if (!room || !room.players) return null;
    const list = Object.values(room.players);
    return list.find((p) => p.id !== state.playerId) || null;
  }

  function sendAction(payload) {
    if (!state.code) return Promise.resolve(null);
    const full = {
      ...payload,
      code: state.code,
      playerId: state.playerId,
    };
    if (state.serverless) {
      if (!state.isHost && state.p2pConn && state.p2pConn.open) {
        broadcastP2P({ type: 'P2P_ACTION', action: full });
      }
      const res = applyServerlessAction(full, false);
      return Promise.resolve(res);
    }
    if (state.ws && state.ws.readyState === 1) {
      try {
        state.ws.send(JSON.stringify(full));
      } catch {}
    }
    return fetch('/api/coop/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((res) => {
        if (res?.ok && res.room) applyRoomSnapshot(res.room);
        return res;
      })
      .catch(() => {
        state.serverless = true;
        return applyServerlessAction(full, false);
      });
  }

  function applyPartnerSharedRelicsToRun() {
    if (!ctx.run || typeof ctx.run.coopSyncPartnerRelics !== 'function') return;
    const partnerRelics = state.sharedRelics.filter((r) => r.fromPlayerId !== state.playerId);
    ctx.run.coopSyncPartnerRelics(partnerRelics);
  }

  function checkAndBroadcastNewLocalRelics(vm) {
    if (!state.active || !state.code || !vm) return;
    const myRelics = vm.relics || [];
    for (const r of myRelics) {
      const rid = Number(r.relicId ?? r.id ?? r);
      if (!Number.isFinite(rid) || rid <= 0) continue;
      if (!state.knownMyRelics.has(rid)) {
        state.knownMyRelics.add(rid);
        sendAction({
          type: 'RELIC_ACQUIRED',
          relicId: rid,
          completed: !!r.completed,
          progress: Number(r.progress || 0),
        });
      }
    }
  }

  function syncLocalStateToRoom(extraBattle = null) {
    if (!state.active || !state.code || !ctx.vm) return;
    const vm = ctx.vm;
    checkAndBroadcastNewLocalRelics(vm);
    const boardHeroes = (vm.board || []).map((u) => ({
      uid: u.uid,
      heroId: u.heroId,
      rank: u.rank || 1,
      hpRatio: 1.0,
      items: (u.items || []).map((it) => Number(it.itemId ?? it.id ?? it)).filter(Number.isFinite),
      specializationId: u.specializationId || null,
      rankModifierIds: u.rankModifierIds || [],
    }));
    sendAction({
      type: 'STATE_UPDATE',
      phase: vm.phase,
      floor: vm.floor || 1,
      act: vm.act || 1,
      shards: vm.shards || 0,
      lives: vm.lives ?? 1,
      board: boardHeroes,
      relics: (vm.relics || []).map((r) => Number(r.relicId ?? r.id ?? r)).filter(Number.isFinite),
      battleState: extraBattle || { status: vm.phase === 'resolution' ? 'fighting' : 'idle', floor: vm.floor || 1 },
    });
    if (state.partner?.isBot) {
      simulateBotPartnerSync();
    }
    refreshHudWidget();
  }

  function handleIncomingEvent(ev) {
    if (!ev || !ev.type) return;
    switch (ev.type) {
      case 'ROOM_SYNC':
      case 'PLAYER_JOINED':
      case 'PARTNER_STATE':
      case 'COOP_RUN_STARTED': {
        if (ev.room) applyRoomSnapshot(ev.room);
        break;
      }
      case 'SHARED_RELIC_ADDED': {
        if (Array.isArray(ev.sharedRelics)) {
          state.sharedRelics = ev.sharedRelics;
          applyPartnerSharedRelicsToRun();
        }
        if (ev.entry && ev.entry.fromPlayerId !== state.playerId) {
          const d = getGameData();
          const rDef = d?.relics?.[ev.entry.relicId];
          const rName = rDef ? txt(rDef.name) : `${L('Relique', 'Relic')} #${ev.entry.relicId}`;
          showCoopBanner(
            L(`RELIQUE D'ESCOUADE (${ev.entry.fromName}) : ${rName}`, `SQUAD RELIC (${ev.entry.fromName}): ${rName}`),
            3200,
            relicIcon(ev.entry.relicId),
          );
          audio.playSfx('relic');
        }
        refreshHudWidget();
        break;
      }
      case 'REINFORCEMENT_ARRIVED': {
        const survivors = ev.survivors || [];
        const fromName = ev.fromName || state.partner?.name || L('Allié', 'Ally');
        if (!survivors.length) break;
        if (ctx.activeBattle && !ctx.activeBattle.isOver() && typeof ctx.activeBattle.spawnReinforcements === 'function') {
          const curFloor = ctx.vm?.floor ?? 1;
          if (state.spawnedReinforcementsThisFloor !== curFloor) {
            state.spawnedReinforcementsThisFloor = curFloor;
            ctx.activeBattle.spawnReinforcements(survivors, fromName);
            audio.playSfx('rankUp');
            showCoopBanner(
              L(
                `RENFORTS ALLIÉS — ${survivors.length} HÉROS DE ${fromName.toUpperCase()} REJOIGNENT LE COMBAT`,
                `ALLY REINFORCEMENTS — ${survivors.length} HEROES FROM ${fromName.toUpperCase()} JOIN THE BATTLE`,
              ),
              3600,
              `${MAP}/FightRoom.png`,
            );
          }
        } else {
          state.pendingReinforcements = {
            floor: ev.floor || (ctx.vm?.floor ?? 1),
            fromName,
            survivors,
          };
          toast(
            L(
              `${fromName} a gagné son combat — ses ${survivors.length} survivants arriveront en renfort`,
              `${fromName} won their battle — their ${survivors.length} survivors will arrive as reinforcements`,
            ),
            'info',
          );
        }
        break;
      }
      case 'TRADE_RECEIVED': {
        const gift = ev.gift;
        const fromName = ev.fromName || state.partner?.name || L('Allié', 'Ally');
        if (!gift || !ctx.run) break;
        ctx.run.coopReceiveGift(gift);
        ctx.syncState();
        audio.playSfx('buy');
        const d = getGameData();
        if (gift.kind === 'shards') {
          showCoopBanner(
            L(
              `${fromName.toUpperCase()} T'A ENVOYÉ +${gift.amount} SHARDS`,
              `${fromName.toUpperCase()} SENT YOU +${gift.amount} SHARDS`,
            ),
            2800,
            SPR.shardSmall,
          );
        } else if (gift.kind === 'item') {
          const itDef = d?.items?.[gift.itemId];
          const itName = itDef ? txt(itDef.name) : `${L('Objet', 'Item')} #${gift.itemId}`;
          showCoopBanner(
            L(`${fromName.toUpperCase()} T'A ENVOYÉ : ${itName}`, `${fromName.toUpperCase()} SENT YOU: ${itName}`),
            3200,
            itemIcon(gift.itemId),
          );
        } else if (gift.kind === 'hero') {
          const hDef = d?.heroes?.[gift.heroId];
          const hName = hDef ? txt(hDef.name) : `${L('Héros', 'Hero')} #${gift.heroId}`;
          showCoopBanner(
            L(`${fromName.toUpperCase()} T'A TRANSFÉRÉ : ${hName}`, `${fromName.toUpperCase()} TRANSFERRED TO YOU: ${hName}`),
            3200,
            heroPortrait(gift.heroId, 'round', gift.rank || 1),
          );
        }
        ctx.render();
        break;
      }
      case 'CROSSROADS_VOTES': {
        if (state.room) state.room.crossroadsVotes = ev.votes || {};
        if (ev.fromId !== state.playerId) {
          toast(
            L(
              `${ev.fromName || 'Ton allié'} a choisi la Porte #${Number(ev.gateIndex) + 1}`,
              `${ev.fromName || 'Your ally'} chose Gate #${Number(ev.gateIndex) + 1}`,
            ),
            'info',
          );
        }
        refreshHudWidget();
        break;
      }
      case 'PARTNER_PING': {
        toast(`${ev.fromName}: ${ev.text}`, 'info');
        audio.playSfx('ui.click');
        break;
      }
    }
  }

  function applyRoomSnapshot(room) {
    if (!room) return;
    const wasRunning = state.room?.status === 'running';
    state.room = room;
    state.code = room.code;
    state.partner = getPartnerFromRoom(room);
    if (Array.isArray(room.sharedRelics)) {
      state.sharedRelics = room.sharedRelics;
      applyPartnerSharedRelicsToRun();
    }
    if (state.partner?.isBot && state.active) {
      simulateBotPartnerSync();
    }
    if (Array.isArray(room.inbox) && room.inbox.length > 0) {
      for (const ev of room.inbox) {
        handleIncomingEvent(ev);
      }
    }
    if (!wasRunning && room.status === 'running' && !state.active) {
      if (state.lobbyModalClose) {
        const c = state.lobbyModalClose;
        state.lobbyModalClose = null;
        if (typeof c === 'function') c();
        else if (typeof c?.close === 'function') c.close();
      }
      startSynchronizedCoopRun(room.difficulty, room.seed);
    }
    if (state.lobbyRefreshFn) state.lobbyRefreshFn();
    refreshHudWidget();
  }

  function handleP2PPacket(pkt) {
    if (!pkt || !pkt.type) return;
    if (pkt.type === 'P2P_ACTION' && pkt.action) {
      applyServerlessAction(pkt.action, true);
      return;
    }
    if (pkt.type === 'JOIN_REQUEST') {
      applyServerlessAction(pkt, true);
      return;
    }
    handleIncomingEvent(pkt);
  }

  function setupServerlessRealtime(code, isHost) {
    try {
      if (state.bc) state.bc.close();
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('guildrun_coop_' + code);
        state.bc = bc;
        bc.onmessage = (e) => handleP2PPacket(e.data);
      }
    } catch {}

    loadPeerJs().then((PeerCls) => {
      if (!PeerCls || state.code !== code) return;
      try {
        if (state.peer) {
          try { state.peer.destroy(); } catch {}
          state.peer = null;
        }
        const hostPeerId = `guildrun-coop-v1-${code.toUpperCase()}`;
        if (isHost) {
          const peer = new PeerCls(hostPeerId);
          state.peer = peer;
          peer.on('connection', (conn) => {
            state.p2pConn = conn;
            conn.on('data', (data) => handleP2PPacket(data));
            conn.on('open', () => {
              if (state.room) conn.send({ type: 'ROOM_SYNC', room: state.room });
            });
          });
        } else {
          const peer = new PeerCls();
          state.peer = peer;
          peer.on('open', () => {
            const conn = peer.connect(hostPeerId, { reliable: true });
            state.p2pConn = conn;
            conn.on('open', () => {
              conn.send({
                type: 'JOIN_REQUEST',
                code,
                playerId: state.playerId,
                playerName: state.playerName,
              });
            });
            conn.on('data', (data) => handleP2PPacket(data));
          });
        }
      } catch {}
    });
  }

  function createServerlessRoom(difficulty = 6) {
    state.serverless = true;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const room = {
      code,
      status: 'lobby',
      difficulty: Number(difficulty ?? 6),
      seed: Date.now() & 0x7fffffff,
      sharedRelics: [],
      crossroadsVotes: {},
      players: {
        [state.playerId]: {
          id: state.playerId,
          name: state.playerName,
          slot: 1,
          isHost: true,
          isBot: false,
          ready: true,
          floor: 1,
          act: 1,
          shards: 15,
          lives: 1,
          phase: 'Lobby',
          board: [],
          relics: [],
        },
      },
    };
    try {
      localStorage.setItem('guildrun_coop_room_' + code, JSON.stringify(room));
    } catch {}
    return { ok: true, room };
  }

  function joinServerlessRoom(cleanCode) {
    state.serverless = true;
    let room = null;
    try {
      const saved = localStorage.getItem('guildrun_coop_room_' + cleanCode);
      if (saved) room = JSON.parse(saved);
    } catch {}
    if (!room) {
      room = {
        code: cleanCode,
        status: 'lobby',
        difficulty: 6,
        seed: Date.now() & 0x7fffffff,
        sharedRelics: [],
        crossroadsVotes: {},
        players: {
          host_placeholder: {
            id: 'host_placeholder',
            name: L('Hôte du Salon', 'Room Host'),
            slot: 1,
            isHost: true,
            isBot: false,
            ready: true,
            floor: 1,
            act: 1,
            shards: 15,
            lives: 1,
            phase: 'Lobby',
            board: [],
            relics: [],
          },
        },
      };
    }
    room.players[state.playerId] = {
      id: state.playerId,
      name: state.playerName,
      slot: 2,
      isHost: false,
      isBot: false,
      ready: true,
      floor: 1,
      act: 1,
      shards: 15,
      lives: 1,
      phase: 'Lobby',
      board: [],
      relics: [],
    };
    return { ok: true, room };
  }

  function connectRealtime(code) {
    if (state.ws) {
      try { state.ws.close(); } catch {}
      state.ws = null;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }

    setupServerlessRealtime(code, state.isHost);

    if (state.serverless) {
      setTimeout(() => {
        if (!state.isHost) {
          broadcastP2P({
            type: 'JOIN_REQUEST',
            code,
            playerId: state.playerId,
            playerName: state.playerName,
          });
        }
      }, 200);
      return;
    }

    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${location.host}/ws/coop?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(state.playerId)}`;
      const ws = new WebSocket(wsUrl);
      state.ws = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleIncomingEvent(msg);
        } catch {}
      };
      ws.onclose = () => {
        if (state.ws === ws) state.ws = null;
      };
    } catch {}

    state.pollTimer = setInterval(() => {
      if (!state.code || state.serverless) return;
      fetch(`/api/coop/poll?code=${encodeURIComponent(state.code)}&playerId=${encodeURIComponent(state.playerId)}`)
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then((res) => {
          if (res?.ok && res.room) applyRoomSnapshot(res.room);
        })
        .catch(() => {});
    }, 1500);
  }

  async function startSynchronizedCoopRun(difficulty = 6, baseSeed = Date.now()) {
    if (state.active) return;
    state.active = true;
    const mySlot = state.room?.players?.[state.playerId]?.slot || (state.isHost ? 1 : 2);
    const mySeed = (Number(baseSeed) ^ (mySlot === 1 ? 0x13579bdf : 0x2468ace0)) >>> 0;
    await ctx.startNewRun({ difficulty: Number(difficulty ?? 6), seed: mySeed, skipIntroComic: true });
    showCoopBanner(
      L(
        `CONTRAT CO-OP LANCÉ AVEC ${(state.partner?.name || 'TON ALLIÉ').toUpperCase()}`,
        `CO-OP CONTRACT STARTED WITH ${(state.partner?.name || 'YOUR ALLY').toUpperCase()}`,
      ),
      3400,
      `${MAP}/FightRoom.png`,
    );
    syncLocalStateToRoom();
    refreshHudWidget();
  }

  // ============================================================================
  // AI PARTNER BOT SIMULATION (when playing Co-Op with Aria Bot Allié)
  // ============================================================================
  function simulateBotPartnerSync() {
    if (!state.active || !state.partner?.isBot || !ctx.vm) return;
    const vm = ctx.vm;
    const d = getGameData();
    const allHeroIds = Object.keys(d?.heroes || {}).map(Number).filter((id) => id >= 1 && id <= 27);
    const botFloor = vm.floor || 1;
    const botSeed = (botFloor * 2654435761) >>> 0;

    const botHeroes = [
      {
        uid: 'bot_h1',
        heroId: allHeroIds[botSeed % allHeroIds.length] || 2,
        rank: botFloor >= 6 ? 2 : 1,
        hpRatio: 0.85,
        items: [101],
      },
      {
        uid: 'bot_h2',
        heroId: allHeroIds[(botSeed + 7) % allHeroIds.length] || 5,
        rank: botFloor >= 4 ? 2 : 1,
        hpRatio: 0.78,
        items: botFloor >= 3 ? [102] : [],
      },
    ];
    if (botFloor >= 5) {
      botHeroes.push({
        uid: 'bot_h3',
        heroId: allHeroIds[(botSeed + 13) % allHeroIds.length] || 7,
        rank: 1,
        hpRatio: 0.72,
        items: [],
      });
    }

    state.partner.floor = botFloor;
    state.partner.act = vm.act || 1;
    state.partner.phase = vm.phase;
    state.partner.shards = 12 + (botFloor * 3) % 25;
    state.partner.board = botHeroes;

    if (state.sharedRelics.filter((r) => r.fromPlayerId === state.partner.id).length === 0) {
      const botRelicId = 1001;
      state.sharedRelics.push({
        relicId: botRelicId,
        fromPlayerId: state.partner.id,
        fromName: state.partner.name,
        completed: false,
        progress: 0,
      });
      applyPartnerSharedRelicsToRun();
    }
  }

  function onBattleStart(battle) {
    if (!state.active || !battle) return;
    const curFloor = ctx.vm?.floor ?? 1;
    syncLocalStateToRoom({ status: 'fighting', floor: curFloor });

    if (state.pendingReinforcements && state.spawnedReinforcementsThisFloor !== curFloor) {
      const pr = state.pendingReinforcements;
      state.pendingReinforcements = null;
      state.spawnedReinforcementsThisFloor = curFloor;
      setTimeout(() => {
        if (ctx.activeBattle === battle && !battle.isOver()) {
          battle.spawnReinforcements(pr.survivors, pr.fromName);
          audio.playSfx('rankUp');
          showCoopBanner(
            L(
              `RENFORTS ALLIÉS — ${pr.survivors.length} HÉROS DE ${pr.fromName.toUpperCase()} ARRIVENT`,
              `ALLY REINFORCEMENTS — ${pr.survivors.length} HEROES FROM ${pr.fromName.toUpperCase()} ARRIVING`,
            ),
            3400,
            `${MAP}/FightRoom.png`,
          );
        }
      }, 2200);
    }

    if (state.partner?.isBot) {
      if (state.botTimer) clearTimeout(state.botTimer);
      state.partner.phase = 'Battle';
      refreshHudWidget();
      state.botTimer = setTimeout(() => {
        if (ctx.activeBattle === battle && !battle.isOver() && state.spawnedReinforcementsThisFloor !== curFloor) {
          state.spawnedReinforcementsThisFloor = curFloor;
          state.partner.phase = 'Victory';
          const botSurvivors = (state.partner.board || []).slice(0, 2);
          battle.spawnReinforcements(botSurvivors, state.partner.name);
          audio.playSfx('rankUp');
          showCoopBanner(
            L(
              `RENFORTS ALLIÉS — ${state.partner.name.toUpperCase()} REJOINT TON COMBAT`,
              `ALLY REINFORCEMENTS — ${state.partner.name.toUpperCase()} JOINS YOUR BATTLE`,
            ),
            3400,
            `${MAP}/FightRoom.png`,
          );
          refreshHudWidget();
        }
      }, 4500);
    }
  }

  function onBattleEnd(result) {
    if (!state.active) return;
    if (state.botTimer) {
      clearTimeout(state.botTimer);
      state.botTimer = null;
    }
    const curFloor = ctx.vm?.floor ?? 1;
    const won = result?.winner === 'players';
    syncLocalStateToRoom({ status: won ? 'won' : 'lost', floor: curFloor });

    if (won && state.sentReinforcementsThisFloor !== curFloor) {
      state.sentReinforcementsThisFloor = curFloor;
      const survivors = (result?.allSurvivors || []).filter((u) => !u.isReinforcement);
      if (survivors.length > 0) {
        sendAction({
          type: 'REINFORCEMENT_SEND',
          floor: curFloor,
          survivors,
        });
        if (state.partner?.phase === 'Battle' || state.partner?.isBot) {
          showCoopBanner(
            L(
              `TES ${survivors.length} SURVIVANTS PARTENT EN RENFORT CHEZ ${(state.partner?.name || 'TON ALLIÉ').toUpperCase()}`,
              `YOUR ${survivors.length} SURVIVORS REINFORCE ${(state.partner?.name || 'YOUR ALLY').toUpperCase()}`,
            ),
            3400,
            `${MAP}/FightRoom.png`,
          );
        }
      }
    }
  }

  // ============================================================================
  // UNIFIED CO-OP TRADE & SQUAD INSPECTOR WINDOW (Matches 6_shop.png 1:1)
  // ============================================================================
  function openCoopInRunWindow(initialTab = 'trade') {
    ensureCoopStyles();
    const existing = document.querySelector('.gr-coop-backdrop');
    if (existing) existing.remove();

    if (state.partner?.isBot && state.active) {
      simulateBotPartnerSync();
    }

    let activeTab = initialTab; // 'trade' | 'squad'
    const d = getGameData();
    const partnerName = state.partner?.name || L('Ton Allié', 'Your Ally');

    const backdrop = h('div', { class: 'gr-coop-backdrop' });
    const closeWindow = () => {
      state.inRunWindowRefreshFn = null;
      backdrop.remove();
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeWindow();
    });

    const bodyEl = h('div', { class: 'gr-coop-body' });

    const tradeTabBtn = h(
      'button',
      {
        type: 'button',
        class: `gr-coop-tab ${activeTab === 'trade' ? 'is-active' : ''}`,
        onclick: () => {
          audio.playSfx('ui.click');
          activeTab = 'trade';
          tradeTabBtn.classList.add('is-active');
          squadTabBtn.classList.remove('is-active');
          renderWindowBody();
        },
      },
      img(SPR.shardSmall, { alt: '' }),
      h('span', null, L("PORTAIL D'ÉCHANGE", 'TRADE PORTAL'))
    );

    const squadTabBtn = h(
      'button',
      {
        type: 'button',
        class: `gr-coop-tab ${activeTab === 'squad' ? 'is-active' : ''}`,
        onclick: () => {
          audio.playSfx('ui.click');
          activeTab = 'squad';
          squadTabBtn.classList.add('is-active');
          tradeTabBtn.classList.remove('is-active');
          renderWindowBody();
        },
      },
      img(`${UI}/VisibilityOn.png`, { alt: '' }),
      h('span', null, L('ESCOUADE ALLIÉE', 'ALLY SQUAD'))
    );

    function renderWindowBody() {
      bodyEl.innerHTML = '';
      const curVm = ctx.vm || { shards: 0, inventory: [], heroes: [] };

      if (activeTab === 'trade') {
        // 1. Shard Transfer Panel
        const shardPanel = h(
          'div',
          { class: 'gr-coop-panel' },
          h(
            'div',
            { class: 'gr-coop-panel-header' },
            h(
              'div',
              { class: 'gr-coop-panel-title' },
              img(SPR.shardSmall, { alt: '' }),
              h('span', null, L(`TRANSFERT DE SHARDS VERS ${partnerName.toUpperCase()}`, `SHARD TRANSFER TO ${partnerName.toUpperCase()}`))
            ),
            h(
              'div',
              { style: 'display: flex; align-items: center; gap: 16px; font-size: 12.5px; font-weight: 700;' },
              h(
                'span',
                { style: 'display: inline-flex; align-items: center; gap: 5px; color: #eef5f2;' },
                L('TES SHARDS :', 'YOUR SHARDS:'),
                img(SPR.shardSmall, { style: 'width: 15px; height: 15px;' }),
                h('span', { style: 'color: #e8d399;' }, String(curVm.shards ?? 0))
              ),
              h(
                'span',
                { style: 'display: inline-flex; align-items: center; gap: 5px; color: #94a3b8;' },
                `${partnerName.toUpperCase()} :`,
                img(SPR.shardSmall, { style: 'width: 15px; height: 15px;' }),
                h('span', { style: 'color: #e8d399;' }, String(state.partner?.shards ?? 15))
              )
            )
          ),
          h(
            'div',
            { style: 'display: flex; align-items: center; justify-content: space-between; gap: 14px;' },
            h(
              'div',
              { style: 'font-size: 12.5px; color: #cbd5e1;' },
              L(
                "Envoie des Shards instantanément à ton coéquipier pour l'aider à acheter un Héros ou une Relique dans sa boutique.",
                'Send Shards instantly to your teammate to help them buy a Hero or Relic in their shop.',
              )
            ),
            h(
              'div',
              { style: 'display: flex; gap: 10px; flex-shrink: 0;' },
              ...[5, 10].map((amt) =>
                buildCoopSecondaryBtn(L(`ENVOYER ${amt}`, `SEND ${amt}`), () => {
                  if (!ctx.run || (ctx.vm?.shards ?? 0) < amt) return;
                  ctx.run.coopAddShards(-amt);
                  if (state.partner?.isBot) {
                    state.partner.shards = (state.partner.shards || 15) + amt;
                  }
                  ctx.syncState();
                  sendAction({
                    type: 'TRADE_SEND',
                    gift: { kind: 'shards', amount: amt },
                  });
                  audio.playSfx('buy');
                  toast(L(`+${amt} Shards envoyés à ${partnerName}`, `+${amt} Shards sent to ${partnerName}`), 'info');
                  syncLocalStateToRoom();
                  renderWindowBody();
                  ctx.render();
                }, {
                  disabled: (curVm.shards ?? 0) < amt,
                  rightIcon: SPR.shardSmall,
                })
              )
            )
          )
        );

        // 2. Equipment Transfer Panel (styled like 6_shop.png ITEMS section)
        const allItems = [
          ...(curVm.inventory || []).map((it) => ({ ...it, sourceLabel: L('RÉSERVE', 'STASH') })),
          ...(curVm.heroes || []).flatMap((hh) =>
            (hh.items || []).map((it) => ({ ...it, sourceLabel: (txt(d?.heroes?.[hh.heroId]?.name) || L('HÉROS', 'HERO')).toUpperCase() }))
          ),
        ];

        const itemGrid = h('div', { class: 'gr-coop-trade-grid' });
        if (allItems.length === 0) {
          itemGrid.appendChild(
            h(
              'div',
              { class: 'gr-coop-textbox', style: 'grid-column: 1 / -1; color: #94a3b8; font-size: 12.5px; text-align: center; padding: 16px;' },
              L('Aucun objet dans ta réserve ou équipé sur tes héros pour le moment.', 'No items in your stash or equipped on your heroes right now.')
            )
          );
        } else {
          for (const it of allItems) {
            const itemId = Number(it.itemId ?? it.id ?? it);
            const itDef = d?.items?.[itemId];
            const itName = (itDef ? txt(itDef.name) : `${L('Objet', 'Item')} #${itemId}`).toUpperCase();
            itemGrid.appendChild(
              h(
                'div',
                { class: 'gr-coop-offer-row' },
                h(
                  'div',
                  { class: 'gr-coop-item-box' },
                  img(SPR.uiItemFrame, { class: 'gr-coop-item-box-frame', alt: '' }),
                  img(itemIcon(itemId), { class: 'gr-coop-item-box-icon', alt: itName })
                ),
                h(
                  'div',
                  { class: 'gr-coop-offer-card' },
                  h(
                    'div',
                    { style: 'min-width: 0;' },
                    h('div', { style: 'font-size: 12.5px; font-weight: 700; color: #eef5f2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' }, itName),
                    h('div', { style: 'font-size: 10.5px; color: #c5a059; letter-spacing: 0.04em; margin-top: 2px;' }, L(`SOURCE : ${it.sourceLabel}`, `SOURCE: ${it.sourceLabel}`))
                  ),
                  buildCoopSecondaryBtn(L('ENVOYER', 'SEND'), () => {
                    const res = ctx.run?.coopSendItem(it.uid ?? itemId);
                    if (!res?.ok) return;
                    ctx.syncState();
                    sendAction({
                      type: 'TRADE_SEND',
                      gift: { kind: 'item', itemId: res.itemId },
                    });
                    audio.playSfx('equip');
                    toast(L(`${itName} envoyé à ${partnerName}`, `${itName} sent to ${partnerName}`), 'info');
                    syncLocalStateToRoom();
                    renderWindowBody();
                    ctx.render();
                  }, { style: 'min-width: 108px; height: 34px;' })
                )
              )
            );
          }
        }

        const itemPanel = h(
          'div',
          { class: 'gr-coop-panel' },
          h(
            'div',
            { class: 'gr-coop-panel-header' },
            h(
              'div',
              { class: 'gr-coop-panel-title' },
              img(SPR.invIcon, { alt: '' }),
              h('span', null, L('ENVOYER UN ÉQUIPEMENT À TON ALLIÉ', 'SEND EQUIPMENT TO YOUR ALLY'))
            ),
            h('span', { style: 'font-size: 11px; color: #94a3b8;' }, L('Astuce : glisse aussi un objet directement sur le panneau Co-Op en haut à gauche', 'Tip: you can also drag an item directly onto the top-left Co-Op panel'))
          ),
          itemGrid
        );

        // 3. Hero Transfer Panel
        const heroGrid = h('div', { class: 'gr-coop-trade-grid' });
        const canSendHero = (curVm.heroes || []).length > 1;
        for (const hh of curVm.heroes || []) {
          const hDef = d?.heroes?.[hh.heroId];
          const hName = (hDef ? txt(hDef.name) : `${L('Héros', 'Hero')} #${hh.heroId}`).toUpperCase();
          const rLetter = ['C', 'B', 'A', 'S'][(hh.rank || 1) - 1] || 'C';
          heroGrid.appendChild(
            h(
              'div',
              { class: 'gr-coop-offer-row' },
              h(
                'div',
                { class: 'gr-coop-medallion' },
                img(heroPortrait(hh.heroId, 'round', hh.rank), { class: 'gr-coop-medallion-art', alt: hName }),
                img(rankFrame(hh.rank || 1), { class: 'gr-coop-medallion-frame', alt: '' }),
                img(rankBadge(hh.rank || 1), { class: 'gr-coop-medallion-rank', alt: rLetter })
              ),
              h(
                'div',
                { class: 'gr-coop-offer-card' },
                h(
                  'div',
                  { style: 'min-width: 0;' },
                  h('div', { style: 'font-size: 13px; font-weight: 700; color: #eef5f2;' }, `${hName} · ${L('RANG', 'RANK')} ${rLetter}`),
                  h(
                    'div',
                    { style: 'font-size: 10.5px; color: #94a3b8; margin-top: 2px;' },
                    canSendHero
                      ? L('Fusionne et Rank-Up si ton allié le possède déjà', 'Merges and Ranks Up if your ally already owns them')
                      : L('Dernier héros actif (garde au moins 1 héros)', 'Last active hero (keep at least 1 hero)')
                  )
                ),
                buildCoopSecondaryBtn(L('TRANSFÉRER', 'TRANSFER'), () => {
                  const res = ctx.run?.coopSendHero(hh.uid);
                  if (!res?.ok) {
                    toast(L('Tu dois garder au moins 1 héros dans ton escouade', 'You must keep at least 1 hero in your squad'), 'warn');
                    return;
                  }
                  ctx.syncState();
                  sendAction({
                    type: 'TRADE_SEND',
                    gift: { kind: 'hero', heroId: res.hero.heroId, rank: res.hero.rank },
                  });
                  audio.playSfx('rankUp');
                  toast(L(`${hName} transféré à ${partnerName}`, `${hName} transferred to ${partnerName}`), 'info');
                  syncLocalStateToRoom();
                  renderWindowBody();
                  ctx.render();
                }, { disabled: !canSendHero, style: 'min-width: 116px; height: 34px;' })
              )
            )
          );
        }

        const heroPanel = h(
          'div',
          { class: 'gr-coop-panel' },
          h(
            'div',
            { class: 'gr-coop-panel-header' },
            h(
              'div',
              { class: 'gr-coop-panel-title' },
              img(`${MAP}/FightRoom.png`, { alt: '' }),
              h('span', null, L('TRANSFÉRER UN HÉROS EN RENFORT PERMANENT', 'TRANSFER A HERO AS PERMANENT REINFORCEMENT'))
            )
          ),
          heroGrid
        );

        bodyEl.append(shardPanel, itemPanel, heroPanel);
        return;
      }

      // ---------------- TAB 2: PARTNER SQUAD & SHARED RELICS ----------------
      const p = state.partner;
      const boardHeroes = p?.board || [];
      const squadCards = h('div', { class: 'gr-coop-trade-grid' });

      if (boardHeroes.length === 0) {
        squadCards.appendChild(
          h(
            'div',
            { class: 'gr-coop-textbox', style: 'grid-column: 1 / -1; color: #94a3b8; font-size: 12.5px; text-align: center; padding: 18px;' },
            L('Ton allié est en train de composer son escouade initiale.', 'Your ally is assembling their starting squad.')
          )
        );
      } else {
        for (const u of boardHeroes) {
          const hDef = d?.heroes?.[u.heroId];
          const hName = (hDef ? txt(hDef.name) : `${L('Héros', 'Hero')} #${u.heroId}`).toUpperCase();
          const rLetter = ['C', 'B', 'A', 'S'][(u.rank || 1) - 1] || 'C';
          squadCards.appendChild(
            h(
              'div',
              { class: 'gr-coop-offer-row' },
              h(
                'div',
                { class: 'gr-coop-medallion' },
                img(heroPortrait(u.heroId, 'round', u.rank), { class: 'gr-coop-medallion-art', alt: hName }),
                img(rankFrame(u.rank || 1), { class: 'gr-coop-medallion-frame', alt: '' }),
                img(rankBadge(u.rank || 1), { class: 'gr-coop-medallion-rank', alt: rLetter })
              ),
              h(
                'div',
                { class: 'gr-coop-offer-card' },
                h(
                  'div',
                  null,
                  h('div', { style: 'font-size: 13px; font-weight: 700; color: #eef5f2;' }, hName),
                  h('div', { style: 'font-size: 10.5px; color: #4ade80; margin-top: 2px;' }, L(`RANG ${rLetter} · PRÊT POUR LE RENFORT`, `RANK ${rLetter} · READY TO REINFORCE`))
                ),
                h(
                  'div',
                  { style: 'display: flex; gap: 4px;' },
                  ...(u.items || []).map((iid) =>
                    h(
                      'div',
                      { class: 'gr-coop-item-box', style: 'width: 32px; height: 32px;' },
                      img(SPR.itemSlotSmall, { class: 'gr-coop-item-box-frame', alt: '' }),
                      img(itemIcon(iid), { style: 'width: 24px; height: 24px; object-fit: contain; z-index: 1;' })
                    )
                  )
                )
              )
            )
          );
        }
      }

      const partnerSquadPanel = h(
        'div',
        { class: 'gr-coop-panel' },
        h(
          'div',
          { class: 'gr-coop-panel-header' },
          h(
            'div',
            { class: 'gr-coop-panel-title' },
            img(`${UI}/VisibilityOn.png`, { alt: '' }),
            h('span', null, L(`ESCOUADE DE ${partnerName.toUpperCase()} — ÉTAGE ${p?.floor || 1}`, `${partnerName.toUpperCase()}'S SQUAD — FLOOR ${p?.floor || 1}`))
          ),
          h(
            'div',
            { style: 'display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #e8d399;' },
            img(SPR.shardSmall, { style: 'width: 15px; height: 15px;' }),
            h('span', null, `${p?.shards ?? 15} SHARDS`)
          )
        ),
        squadCards
      );

      // Shared Squad Relics Panel
      const relicRows = h('div', { class: 'gr-coop-trade-grid' });
      if (state.sharedRelics.length === 0) {
        relicRows.appendChild(
          h(
            'div',
            { class: 'gr-coop-textbox', style: 'grid-column: 1 / -1; color: #94a3b8; font-size: 12.5px; text-align: center; padding: 16px;' },
            L("Aucune relique d'escouade active pour le moment.", 'No active squad relics yet.')
          )
        );
      } else {
        for (const sr of state.sharedRelics) {
          const rDef = d?.relics?.[sr.relicId];
          const rName = (rDef ? txt(rDef.name) : `${L('Relique', 'Relic')} #${sr.relicId}`).toUpperCase();
          relicRows.appendChild(
            h(
              'div',
              { class: 'gr-coop-offer-row' },
              h(
                'div',
                { class: 'gr-coop-item-box' },
                img(relicFrame(rDef?.rarity || 2), { class: 'gr-coop-item-box-frame', alt: '' }),
                img(relicIcon(sr.relicId), { class: 'gr-coop-item-box-icon', alt: rName })
              ),
              h(
                'div',
                { class: 'gr-coop-offer-card' },
                h(
                  'div',
                  { style: 'min-width: 0;' },
                  h('div', { style: 'font-size: 12.5px; font-weight: 700; color: #e8d399;' }, rName),
                  h('div', { style: 'font-size: 10.5px; color: #94a3b8; margin-top: 2px;' }, L(`OBTENUE PAR : ${(sr.fromName || 'ESCOUADE').toUpperCase()}`, `OBTAINED BY: ${(sr.fromName || 'SQUAD').toUpperCase()}`))
                )
              )
            )
          );
        }
      }

      const sharedRelicsPanel = h(
        'div',
        { class: 'gr-coop-panel' },
        h(
          'div',
          { class: 'gr-coop-panel-header' },
          h(
            'div',
            { class: 'gr-coop-panel-title' },
            img(SPR.relicGeneric, { alt: '' }),
            h('span', null, L(`RELIQUES D'ESCOUADE PARTAGÉES (${state.sharedRelics.length})`, `SHARED SQUAD RELICS (${state.sharedRelics.length})`))
          )
        ),
        relicRows
      );

      bodyEl.append(partnerSquadPanel, sharedRelicsPanel);
    }

    state.inRunWindowRefreshFn = renderWindowBody;
    renderWindowBody();

    const winEl = h(
      'div',
      { class: 'gr-coop-window' },
      h(
        'div',
        { class: 'gr-coop-topbar' },
        h(
          'button',
          {
            type: 'button',
            class: 'gr-coop-back-btn',
            onclick: () => {
              audio.playSfx('ui.click');
              closeWindow();
            },
          },
          img(`${UI}/Triangle_NoStroke.png`, { class: 'gr-coop-back-tri', alt: '' }),
          h('span', null, L('FERMER', 'CLOSE'))
        ),
        h(
          'div',
          { class: 'gr-coop-title-group' },
          h('h2', { class: 'gr-coop-title' }, L(`CONTRAT CO-OP · ${partnerName.toUpperCase()}`, `CO-OP CONTRACT · ${partnerName.toUpperCase()}`)),
          h('div', { class: 'gr-coop-subtitle' }, L(`SALON #${state.code || 'RIFT'} · PARTAGE DE RESSOURCES & ESCOUADE`, `ROOM #${state.code || 'RIFT'} · RESOURCE & SQUAD SHARING`))
        ),
        h('div', { class: 'gr-coop-tabs' }, tradeTabBtn, squadTabBtn)
      ),
      bodyEl
    );

    backdrop.appendChild(winEl);
    document.body.appendChild(backdrop);
  }

  function openTradeModal() {
    openCoopInRunWindow('trade');
  }

  function openPartnerBoardModal() {
    openCoopInRunWindow('squad');
  }

  // ============================================================================
  // PERSISTENT IN-RUN CO-OP HUD WIDGET (Top-Left CoreGameUI Mirror of DamageTracker)
  // ============================================================================
  function refreshHudWidget() {
    const existing = document.getElementById('gr-coop-hud-widget');
    if (!state.active || !ctx.run) {
      if (existing) existing.remove();
      return;
    }

    const app = document.getElementById('app') || document.body;
    const p = state.partner;
    const partnerName = p ? p.name : L('En attente...', 'Waiting...');
    const partnerFloor = p?.floor || ctx.vm?.floor || 1;
    const rawPhase = String(p?.phase || 'Placement');
    const isBattle = /battle|resolution|fighting/i.test(rawPhase);
    const phaseLabel = isBattle
      ? L('EN COMBAT', 'IN BATTLE')
      : /shop/i.test(rawPhase)
        ? L('BOUTIQUE', 'SHOP')
        : L('PRÉPARATION', 'PREPARATION');
    const partnerShards = p?.shards ?? 15;
    const partnerBoard = p?.board || [];

    const portraitsRow = h('div', { class: 'gr-coop-hud-Portraits' });
    if (partnerBoard.length === 0) {
      portraitsRow.appendChild(
        h('span', { style: 'font-size: 10.5px; color: #94a3b8;' }, L('Déploiement...', 'Deploying...'))
      );
    } else {
      for (const u of partnerBoard.slice(0, 4)) {
        const hpPct = Math.round(Math.max(15, Math.min(100, (u.hpRatio ?? 1) * 100)));
        portraitsRow.appendChild(
          h(
            'div',
            { class: 'gr-coop-mini-unit' },
            img(heroPortrait(u.heroId, 'round', u.rank || 1), { class: 'gr-coop-mini-unit-art', alt: '' }),
            img(rankFrame(u.rank || 1), { class: 'gr-coop-mini-unit-frame', alt: '' }),
            h('div', { class: 'gr-coop-mini-unit-hp' }, h('span', { style: `width: ${hpPct}%;` }))
          )
        );
      }
    }

    const widget = h(
      'aside',
      { id: 'gr-coop-hud-widget', class: 'gr-coop-hud' },
      h(
        'div',
        { class: 'gr-coop-hud-top' },
        h(
          'div',
          { class: 'gr-coop-hud-ally' },
          h('span', { class: 'gr-coop-status-dot' }),
          h('span', { class: 'gr-coop-hud-name' }, partnerName)
        ),
        h(
          'div',
          { class: 'gr-coop-hud-shards' },
          img(SPR.shardSmall, { alt: '' }),
          h('span', null, String(partnerShards))
        )
      ),
      h(
        'div',
        { class: 'gr-coop-hud-meta' },
        h('span', null, L(`ÉTAGE ${partnerFloor} · #${state.code || 'COOP'}`, `FLOOR ${partnerFloor} · #${state.code || 'COOP'}`)),
        h('span', { class: `gr-coop-hud-phase ${isBattle ? 'is-battle' : ''}` }, phaseLabel)
      ),
      h(
        'div',
        { class: 'gr-coop-hud-squad' },
        portraitsRow,
        h(
          'div',
          { class: 'gr-coop-hud-relic-pill', title: L("Reliques d'escouade partagées", 'Shared squad relics') },
          img(SPR.relicGeneric, { alt: '' }),
          h('span', null, `+${state.sharedRelics.length}`)
        )
      ),
      h(
        'div',
        { class: 'gr-coop-actions-row' },
        buildHudMiniBtn(L('ÉCHANGER', 'TRADE'), SPR.shardSmall, () => {
          audio.playSfx('ui.click');
          openTradeModal();
        }, 'gr-coop-btn-trade'),
        buildHudMiniBtn(L('ESCOUADE', 'SQUAD'), `${UI}/VisibilityOn.png`, () => {
          audio.playSfx('ui.click');
          openPartnerBoardModal();
        }, 'gr-coop-btn-peek')
      )
    );

    // Drag & Drop an Item or Hero directly onto the Co-Op HUD widget to send it to partner
    makeDropTarget(
      widget,
      (dragPayload) => dragPayload && (dragPayload.kind === 'item' || dragPayload.kind === 'hero'),
      (dragPayload) => {
        if (!ctx.run) return;
        const d = getGameData();
        if (dragPayload.kind === 'item') {
          const res = ctx.run.coopSendItem(dragPayload.uid ?? dragPayload.itemId);
          if (res?.ok) {
            ctx.syncState();
            sendAction({ type: 'TRADE_SEND', gift: { kind: 'item', itemId: res.itemId } });
            const itName = txt(d?.items?.[res.itemId]?.name) || `${L('Objet', 'Item')} #${res.itemId}`;
            toast(L(`${itName} envoyé à ${partnerName}`, `${itName} sent to ${partnerName}`), 'info');
            audio.playSfx('equip');
            syncLocalStateToRoom();
            ctx.render();
          }
        } else if (dragPayload.kind === 'hero') {
          const res = ctx.run.coopSendHero(dragPayload.uid);
          if (res?.ok) {
            ctx.syncState();
            sendAction({ type: 'TRADE_SEND', gift: { kind: 'hero', heroId: res.hero.heroId, rank: res.hero.rank } });
            const hName = txt(d?.heroes?.[res.hero.heroId]?.name) || L('Héros', 'Hero');
            toast(L(`${hName} transféré à ${partnerName}`, `${hName} transferred to ${partnerName}`), 'info');
            audio.playSfx('rankUp');
            syncLocalStateToRoom();
            ctx.render();
          } else {
            toast(L('Garde au moins 1 héros dans ton escouade', 'Keep at least 1 hero in your squad'), 'warn');
          }
        }
      }
    );

    if (existing) existing.replaceWith(widget);
    else app.appendChild(widget);
  }

  // ============================================================================
  // CO-OP LOBBY WINDOW (Authentic Guildrun Window — Create / Join / QR / AI Partner)
  // ============================================================================
  function openLobbyModal(initialJoinCode = null) {
    ensureCoopStyles();
    const existing = document.querySelector('.gr-coop-backdrop');
    if (existing) existing.remove();

    let joinCodeInput = initialJoinCode || '';
    const selectedDiff = 6;

    const backdrop = h('div', { class: 'gr-coop-backdrop' });
    const closeLobby = () => {
      state.lobbyRefreshFn = null;
      state.lobbyModalClose = null;
      backdrop.remove();
    };
    state.lobbyModalClose = { close: closeLobby };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeLobby();
    });

    const bodyEl = h('div', { class: 'gr-coop-body' });

    const nameInput = h('input', {
      type: 'text',
      class: 'gr-coop-input',
      value: state.playerName,
      placeholder: L('Pseudo...', 'Nickname...'),
      style: 'width: 170px;',
      onchange: (e) => {
        state.playerName = e.target.value.trim() || L('Aventurier', 'Adventurer');
        savePlayerName(state.playerName);
      },
    });

    function renderLobbyBody() {
      bodyEl.innerHTML = '';

      const rulesRows = h(
        'div',
        { style: 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;' },
        h(
          'div',
          { class: 'gr-coop-rule-row' },
          img(`${MAP}/FightRoom.png`, { class: 'gr-coop-rule-icon', alt: '' }),
          h(
            'div',
            null,
            h('div', { style: 'font-weight: 700; color: #eef5f2; font-size: 11.5px; text-transform: uppercase;' }, L('RENFORTS DE FAILLE', 'RIFT REINFORCEMENTS')),
            h('div', { style: 'font-size: 11px; color: #94a3b8;' }, L('Tes survivants rejoignent le combat de ton allié en direct.', "Your survivors join your ally's battle live."))
          )
        ),
        h(
          'div',
          { class: 'gr-coop-rule-row' },
          img(SPR.shardSmall, { class: 'gr-coop-rule-icon', alt: '' }),
          h(
            'div',
            null,
            h('div', { style: 'font-weight: 700; color: #eef5f2; font-size: 11.5px; text-transform: uppercase;' }, L("PORTAIL D'ÉCHANGE", 'TRADE PORTAL')),
            h('div', { style: 'font-size: 11px; color: #94a3b8;' }, L('Échangez des Shards, des Objets et des Héros à tout moment.', 'Trade Shards, Items, and Heroes at any time.'))
          )
        ),
        h(
          'div',
          { class: 'gr-coop-rule-row' },
          img(SPR.relicGeneric, { class: 'gr-coop-rule-icon', alt: '' }),
          h(
            'div',
            null,
            h('div', { style: 'font-weight: 700; color: #eef5f2; font-size: 11.5px; text-transform: uppercase;' }, L("RELIQUES D'ESCOUADE", 'SQUAD RELICS')),
            h('div', { style: 'font-size: 11px; color: #94a3b8;' }, L('Chaque relique obtenue renforce les deux joueurs.', 'Every relic acquired empowers both players.'))
          )
        )
      );
      bodyEl.appendChild(rulesRows);

      if (!state.room) {
        const codeField = h('input', {
          type: 'text',
          maxlength: 4,
          class: 'gr-coop-input gr-coop-code-input',
          value: joinCodeInput,
          placeholder: 'RIFT',
          oninput: (e) => {
            joinCodeInput = e.target.value.toUpperCase();
          },
        });

        const columns = h(
          'div',
          { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px;' },
          // Left: Host Contract
          h(
            'div',
            { class: 'gr-coop-panel', style: 'justify-content: space-between; min-height: 210px;' },
            h(
              'div',
              { style: 'display: flex; flex-direction: column; gap: 10px;' },
              h(
                'div',
                { class: 'gr-coop-panel-header' },
                h(
                  'div',
                  { class: 'gr-coop-panel-title' },
                  img(`${UI}/Globe.png`, { alt: '' }),
                  h('span', null, L('1. HÉBERGER UN SALON (HÔTE)', '1. HOST A ROOM (HOST)'))
                )
              ),
              h(
                'div',
                { style: 'font-size: 12.5px; color: #cbd5e1; line-height: 1.45;' },
                L(
                  "Ouvre un contrat Co-Op avec un code à 4 lettres et un QR Code d'invitation directe. Jouable entre PC et iPhone ou entre deux téléphones (Wi-Fi / 4G / 5G).",
                  'Open a Co-Op contract with a 4-letter code and a direct invite QR code. Playable across PC and iPhone or between two phones (Wi-Fi / 4G / 5G).',
                )
              )
            ),
            h(
              'div',
              { style: 'display: flex; justify-content: center; padding-top: 8px;' },
              buildCoopPrimaryBtn(L('CRÉER UN SALON CO-OP', 'CREATE CO-OP ROOM'), async () => {
                audio.playSfx('ui.click');
                let res = await fetch('/api/coop/create', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    playerId: state.playerId,
                    playerName: state.playerName,
                    difficulty: selectedDiff,
                  }),
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);
                if (!res || !res.ok || !res.room) {
                  res = createServerlessRoom(selectedDiff);
                }
                if (res?.ok && res.room) {
                  state.isHost = true;
                  state.code = res.room.code;
                  applyRoomSnapshot(res.room);
                  connectRealtime(res.room.code);
                } else {
                  toast(L('Erreur lors de la création du salon', 'Error creating room'), 'error');
                }
              }, { cls: 'gr-coop-create-btn' })
            )
          ),
          // Right: Join Contract
          h(
            'div',
            { class: 'gr-coop-panel', style: 'justify-content: space-between; min-height: 210px;' },
            h(
              'div',
              { style: 'display: flex; flex-direction: column; gap: 10px;' },
              h(
                'div',
                { class: 'gr-coop-panel-header' },
                h(
                  'div',
                  { class: 'gr-coop-panel-title' },
                  img(`${UI}/contacts_product_64dp_FFFFFF_FILL0_wght400_GRAD0_opsz48.png`, { alt: '' }),
                  h('span', null, L('2. REJOINDRE UN SALON', '2. JOIN A ROOM'))
                )
              ),
              h(
                'div',
                { style: 'font-size: 12.5px; color: #cbd5e1;' },
                L("Saisis le code à 4 caractères affiché sur l'écran de ton partenaire :", "Enter the 4-character code shown on your partner's screen:")
              ),
              h('div', { style: 'display: flex; justify-content: center; padding: 4px 0;' }, codeField)
            ),
            h(
              'div',
              { style: 'display: flex; justify-content: center; padding-top: 8px;' },
              buildCoopSecondaryBtn(L('REJOINDRE LE SALON', 'JOIN ROOM'), async () => {
                const cleanCode = (codeField.value || joinCodeInput || '').trim().toUpperCase();
                if (cleanCode.length < 4) {
                  toast(L('Entre un code à 4 caractères', 'Enter a 4-character code'), 'warn');
                  return;
                }
                audio.playSfx('ui.click');
                let res = await fetch('/api/coop/join', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    code: cleanCode,
                    playerId: state.playerId,
                    playerName: state.playerName,
                  }),
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null);
                if (!res || !res.ok || !res.room) {
                  res = joinServerlessRoom(cleanCode);
                }
                if (res?.ok && res.room) {
                  state.isHost = false;
                  state.code = res.room.code;
                  applyRoomSnapshot(res.room);
                  connectRealtime(res.room.code);
                } else {
                  toast(res?.error || L('Salon introuvable', 'Room not found'), 'error');
                }
              }, { style: 'width: 240px; height: 46px;' })
            )
          )
        );

        bodyEl.appendChild(columns);
        return;
      }

      // ---------------- ACTIVE LOBBY ROOM VIEW ----------------
      const room = state.room;
      const playersList = Object.values(room.players || {});
      const basePath = location.pathname.replace(/\/index\.html$/i, '').replace(/\/$/, '');
      const inviteUrl = `${location.origin}${basePath}/?ios=1&coop=${encodeURIComponent(room.code)}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(inviteUrl)}`;

      const lobbyMainGrid = h(
        'div',
        { style: 'display: grid; grid-template-columns: 340px 1fr; gap: 16px;' },
        // Left Column: QR & Room Code Plaque
        h(
          'div',
          { class: 'gr-coop-panel', style: 'align-items: center; text-align: center; justify-content: space-between;' },
          h(
            'div',
            { class: 'gr-coop-panel-header', style: 'width: 100%;' },
            h(
              'div',
              { class: 'gr-coop-panel-title' },
              img(`${UI}/Globe.png`, { alt: '' }),
              h('span', null, L('INVITATION DIRECTE', 'DIRECT INVITE'))
            )
          ),
          h(
            'div',
            { style: 'padding: 6px; background: #ffffff; border: 2px solid #c5a059; box-shadow: 0 6px 20px rgba(0,0,0,0.6);' },
            img(qrSrc, { style: 'width: 124px; height: 124px; display: block;', alt: 'QR Invite' })
          ),
          h(
            'div',
            { style: 'width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px;' },
            h('div', { style: 'font-size: 10.5px; color: #94a3b8; font-weight: 700; letter-spacing: 0.1em;' }, L('CODE DU SALON', 'ROOM CODE')),
            h(
              'div',
              {
                class: 'gr-coop-textbox',
                style: 'font-size: 26px; font-weight: 800; letter-spacing: 0.24em; color: #e8d399; padding: 6px 22px; border-color: rgba(197, 160, 89, 0.65);',
              },
              room.code
            ),
            buildCoopSecondaryBtn(L("COPIER LE LIEN D'INVITATION", 'COPY INVITE LINK'), () => {
              navigator.clipboard?.writeText(inviteUrl);
              toast(L("Lien d'invitation Co-Op copié", 'Co-Op invite link copied'), 'info');
            }, { style: 'width: 100%; height: 36px;' })
          )
        ),
        // Right Column: Squad Slots (Slot 1 & Slot 2) + Start Bar
        h(
          'div',
          { class: 'gr-coop-panel', style: 'justify-content: space-between;' },
          h(
            'div',
            { style: 'display: flex; flex-direction: column; gap: 12px;' },
            h(
              'div',
              { class: 'gr-coop-panel-header' },
              h(
                'div',
                { class: 'gr-coop-panel-title' },
                img(`${UI}/contacts_product_64dp_FFFFFF_FILL0_wght400_GRAD0_opsz48.png`, { alt: '' }),
                h('span', null, L(`ESCOUADE DU CONTRAT (${playersList.length}/2 JOUEURS)`, `CONTRACT SQUAD (${playersList.length}/2 PLAYERS)`))
              ),
              h(
                'div',
                { style: 'display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: #e8d399;' },
                img(`${UI}/Rank_SSS.png`, { style: 'width: 24px; height: 18px; object-fit: contain;' }),
                h('span', null, L('DIFFICULTÉ : SSS', 'DIFFICULTY: SSS'))
              )
            ),
            ...[0, 1].map((idx) => {
              const p = playersList[idx];
              const portraitHeroId = idx === 0 ? 1 : 2;
              if (p) {
                return h(
                  'div',
                  { class: 'gr-coop-slot-card is-ready' },
                  h(
                    'div',
                    { style: 'display: flex; align-items: center; gap: 14px;' },
                    h(
                      'div',
                      { class: 'gr-coop-medallion' },
                      img(heroPortrait(portraitHeroId, 'round', 1), { class: 'gr-coop-medallion-art', alt: '' }),
                      img(rankFrame(1), { class: 'gr-coop-medallion-frame', alt: '' }),
                      img(rankBadge(idx === 0 ? 3 : 2), { class: 'gr-coop-medallion-rank', alt: '' })
                    ),
                    h(
                      'div',
                      null,
                      h(
                        'div',
                        { style: 'font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; color: #c5a059; text-transform: uppercase;' },
                        L(
                          `EMPLACEMENT 0${idx + 1} · ${p.isHost ? 'HÔTE DU CONTRAT' : p.isBot ? 'PARTENAIRE IA' : 'COÉQUIPIER'}`,
                          `SLOT 0${idx + 1} · ${p.isHost ? 'CONTRACT HOST' : p.isBot ? 'AI PARTNER' : 'TEAMMATE'}`,
                        )
                      ),
                      h('div', { style: 'font-size: 16px; font-weight: 700; color: #eef5f2; margin-top: 2px;' }, p.name)
                    )
                  ),
                  h(
                    'div',
                    {
                      style: 'padding: 4px 12px; border: 1px solid rgba(74, 222, 128, 0.55); background: rgba(22, 101, 52, 0.25); color: #4ade80; font-size: 11px; font-weight: 800; letter-spacing: 0.08em;',
                    },
                    L('PRÊT', 'READY')
                  )
                );
              }
              return h(
                'div',
                { class: 'gr-coop-slot-card' },
                h(
                  'div',
                  { style: 'display: flex; align-items: center; gap: 14px;' },
                  h(
                    'div',
                    { class: 'gr-coop-medallion', style: 'opacity: 0.45;' },
                    img(SPR.portraitEmpty, { class: 'gr-coop-medallion-frame', alt: '' })
                  ),
                  h(
                    'div',
                    null,
                    h('div', { style: 'font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; color: #94a3b8;' }, L('EMPLACEMENT 02 · PARTENAIRE', 'SLOT 02 · PARTNER')),
                    h('div', { style: 'font-size: 13px; color: #64748b; margin-top: 2px;' }, L("En attente d'un joueur ou d'un allié IA...", 'Waiting for a player or AI ally...'))
                  )
                ),
                buildCoopSecondaryBtn(L('+ BOT ALLIÉ IA (ARIA)', '+ AI ALLY BOT (ARIA)'), () => {
                  audio.playSfx('ui.click');
                  sendAction({ type: 'ADD_BOT', botName: L('Aria (Bot Allié)', 'Aria (AI Ally)') });
                }, { icon: `${MAP}/FightRoom.png`, style: 'height: 38px;' })
              );
            })
          ),
          // Bottom Action Row inside Squad Panel
          h(
            'div',
            { style: 'display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid rgba(175, 190, 185, 0.22);' },
            buildCoopSecondaryBtn(L('QUITTER LE SALON', 'LEAVE ROOM'), () => {
              audio.playSfx('ui.click');
              state.room = null;
              state.code = null;
              renderLobbyBody();
            }),
            buildCoopPrimaryBtn(
              playersList.length >= 2
                ? L('LANCER LA PARTIE CO-OP (2/2)', 'START CO-OP RUN (2/2)')
                : L("EN ATTENTE D'UN ALLIÉ (1/2)", 'WAITING FOR ALLY (1/2)'),
              () => {
                if (playersList.length < 2) return;
                audio.playSfx('battleStart');
                sendAction({
                  type: 'START_COOP_RUN',
                  difficulty: room.difficulty ?? 6,
                  seed: room.seed || (Date.now() & 0x7fffffff),
                });
                closeLobby();
                startSynchronizedCoopRun(room.difficulty ?? 6, room.seed);
              },
              {
                disabled: playersList.length < 2,
                icon: `${MAP}/FightRoom.png`,
                style: 'width: 300px; height: 52px;',
              }
            )
          )
        )
      );

      bodyEl.appendChild(lobbyMainGrid);
    }

    state.lobbyRefreshFn = renderLobbyBody;
    renderLobbyBody();

    const winEl = h(
      'div',
      { class: 'gr-coop-window' },
      h(
        'div',
        { class: 'gr-coop-topbar' },
        h(
          'button',
          {
            type: 'button',
            class: 'gr-coop-back-btn',
            onclick: () => {
              audio.playSfx('ui.click');
              closeLobby();
            },
          },
          img(`${UI}/Triangle_NoStroke.png`, { class: 'gr-coop-back-tri', alt: '' }),
          h('span', null, L('RETOUR', 'BACK'))
        ),
        h(
          'div',
          { class: 'gr-coop-title-group' },
          h('h2', { class: 'gr-coop-title' }, L('MODE CO-OP 2 JOUEURS — DOUBLE RIFT', '2-PLAYER CO-OP MODE — DOUBLE RIFT')),
          h('div', { class: 'gr-coop-subtitle' }, L("CONTRAT DE FAILLE SYNCHRONISÉ · RENFORTS & PARTAGE D'ESCOUADE", 'SYNCHRONIZED RIFT CONTRACT · REINFORCEMENTS & SQUAD SHARING'))
        ),
        h(
          'div',
          { class: 'gr-coop-topbar-right' },
          h('span', { style: 'font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: #94a3b8; text-transform: uppercase;' }, L('PSEUDO :', 'NAME:')),
          nameInput
        )
      ),
      bodyEl
    );

    backdrop.appendChild(winEl);
    document.body.appendChild(backdrop);

    if (initialJoinCode && initialJoinCode.length === 4 && !state.room) {
      fetch('/api/coop/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: initialJoinCode.toUpperCase(),
          playerId: state.playerId,
          playerName: state.playerName,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((res) => {
          const finalRes = res?.ok && res.room ? res : joinServerlessRoom(initialJoinCode.toUpperCase());
          if (finalRes?.ok && finalRes.room) {
            state.isHost = false;
            state.code = finalRes.room.code;
            applyRoomSnapshot(finalRes.room);
            connectRealtime(finalRes.room.code);
          }
        });
    }
  }

  return {
    state,
    openLobbyModal,
    openTradeModal,
    openPartnerBoardModal,
    refreshHudWidget,
    syncLocalStateToRoom,
    onBattleStart,
    onBattleEnd,
    voteCrossroads(gateIndex) {
      if (!state.active) return;
      sendAction({ type: 'CROSSROADS_VOTE', gateIndex });
    },
  };
}
