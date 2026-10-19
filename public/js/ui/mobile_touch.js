// Guildrun: Rift Reborn — iPhone 18 Pro Fullscreen Adaptive Landscape & 120Hz Multi-Touch Engine
// - Zero black bars: dynamically matches the exact aspect ratio of the phone screen at a mobile-native 560px height
// - Auto-Landscape in Portrait: if iOS Orientation Lock is ON (vh > vw), automatically rotates #app 90deg to fill 100% of the screen!
// - Bridges HTML5 Drag-and-Drop (dragstart/dragenter/dragover/dragleave/drop/dragend) to iOS WebKit Touch Events
// - Provides Tap-to-Inspect on [?] buttons + 450ms Long-Press tooltips

import { hideTooltip } from './tooltip.js';
import { audio } from '../audio.js';

const MOBILE_BASE_HEIGHT = 560;
const DRAG_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 450;

let safeProbeEl = null;

/** Detect whether the current device supports touch or is running in iOS standalone/mobile mode. */
export function isTouchOrMobileDevice() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const urlForced = new URLSearchParams(window.location.search).has('ios') || new URLSearchParams(window.location.search).has('mobile');
  const smallScreen = Math.min(window.innerWidth || 1920, window.innerHeight || 1080) <= 600;
  return isIOS || isAndroid || urlForced || (hasTouch && smallScreen);
}

function ensureSafeAreaProbe() {
  if (!safeProbeEl && typeof document !== 'undefined') {
    safeProbeEl = document.getElementById('gr-safe-area-probe');
    if (!safeProbeEl) {
      safeProbeEl = document.createElement('div');
      safeProbeEl.id = 'gr-safe-area-probe';
      document.body.appendChild(safeProbeEl);
    }
  }
  return safeProbeEl;
}

function readSafeAreaInsets() {
  const probe = ensureSafeAreaProbe();
  if (!probe || typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const cs = window.getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

/**
 * Recomputes the 100% edge-to-edge mobile fullscreen viewport for #app.
 * - Uses a 560px logical height and exact screen aspect ratio so there are ZERO black bars and UI elements are 2x larger.
 * - If the browser is in Portrait (e.g. iOS Portrait Lock is enabled), automatically rotates #app 90deg into Fullscreen Landscape!
 */
export function updateMobileViewport() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const appEl = document.getElementById('app');
  if (!appEl) return;

  const vv = window.visualViewport;
  const vw = Math.round(vv ? vv.width : window.innerWidth);
  const vh = Math.round(vv ? vv.height : window.innerHeight);
  const isMobile = isTouchOrMobileDevice() || vw < 1100 || vh < 650;

  document.body.classList.toggle('gr-touch-device', isMobile);

  if (!isMobile) {
    document.body.classList.remove('gr-mobile-scaled', 'gr-portrait-rotated');
    appEl.style.width = '';
    appEl.style.height = '';
    appEl.style.position = '';
    appEl.style.left = '';
    appEl.style.top = '';
    appEl.style.transformOrigin = '';
    appEl.style.transform = '';
    document.documentElement.style.setProperty('--gr-ui-scale', '1');
    return;
  }

  document.body.classList.add('gr-mobile-scaled');
  const insets = readSafeAreaInsets();
  const isPortrait = vh > vw;
  document.body.classList.toggle('gr-portrait-rotated', isPortrait);

  // Effective landscape dimensions of the phone screen
  const landW = isPortrait ? vh : vw;
  const landH = isPortrait ? vw : vh;

  // Logical mobile canvas matches the exact screen aspect ratio at 560px height (zero black bars!)
  const aspect = Math.max(1.33, Math.min(2.6, landW / Math.max(1, landH)));
  const baseH = MOBILE_BASE_HEIGHT;
  const baseW = Math.round(baseH * aspect);
  const scale = landH / baseH;

  // Convert safe-area insets into logical canvas pixels so Dynamic Island never overlaps edge buttons
  let padLeft = 0;
  let padRight = 0;
  let padTop = 0;
  let padBottom = 0;
  if (isPortrait) {
    // When rotated 90deg clockwise: physical top (Dynamic Island) becomes landscape left!
    padLeft = Math.round((insets.top || 0) / scale);
    padRight = Math.round((insets.bottom || 0) / scale);
    padTop = Math.round((insets.right || 0) / scale);
    padBottom = Math.round((insets.left || 0) / scale);
  } else {
    padLeft = Math.round((insets.left || 0) / scale);
    padRight = Math.round((insets.right || 0) / scale);
    padTop = Math.round((insets.top || 0) / scale);
    padBottom = Math.round((insets.bottom || 0) / scale);
  }

  document.documentElement.style.setProperty('--gr-ui-scale', scale.toFixed(5));
  document.documentElement.style.setProperty('--gr-logical-w', `${baseW}px`);
  document.documentElement.style.setProperty('--gr-logical-h', `${baseH}px`);
  document.documentElement.style.setProperty('--gr-vw', `${vw}px`);
  document.documentElement.style.setProperty('--gr-vh', `${vh}px`);
  document.documentElement.style.setProperty('--gr-pad-left', `${Math.max(10, padLeft)}px`);
  document.documentElement.style.setProperty('--gr-pad-right', `${Math.max(10, padRight)}px`);
  document.documentElement.style.setProperty('--gr-pad-top', `${Math.max(4, padTop)}px`);
  document.documentElement.style.setProperty('--gr-pad-bottom', `${Math.max(4, padBottom)}px`);

  appEl.style.width = `${baseW}px`;
  appEl.style.height = `${baseH}px`;
  appEl.style.position = 'fixed';
  appEl.style.left = '0px';
  appEl.style.top = '0px';
  appEl.style.transformOrigin = '0 0';

  if (isPortrait) {
    // Rotate 90deg clockwise around (0,0) and translate right by vw so it fills the entire vw x vh portrait screen!
    appEl.style.transform = `translate3d(${vw}px, 0px, 0) rotate(90deg) scale(${scale.toFixed(5)})`;
  } else {
    appEl.style.transform = `translate3d(0px, 0px, 0) scale(${scale.toFixed(5)})`;
  }

  // Trigger a resize event on next frame if canvas resolution needs updating
  if (appEl._lastBaseW !== baseW || appEl._lastBaseH !== baseH) {
    appEl._lastBaseW = baseW;
    appEl._lastBaseH = baseH;
  }
}

// ============================================================================
// Synthetic HTML5 DragEvent + DataTransfer Bridge for iOS Safari / WebKit
// ============================================================================
function createSyntheticDataTransfer() {
  const store = new Map();
  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [],
    items: [],
    types: [],
    setData(format, data) {
      const key = String(format || 'text/plain').toLowerCase();
      store.set(key, String(data));
      this.types = Array.from(store.keys());
    },
    getData(format) {
      const key = String(format || 'text/plain').toLowerCase();
      return store.get(key) ?? store.get('text/plain') ?? '';
    },
    clearData(format) {
      if (format) store.delete(String(format).toLowerCase());
      else store.clear();
      this.types = Array.from(store.keys());
    },
    setDragImage() {},
  };
}

function dispatchSyntheticDragEvent(target, type, clientX, clientY, dataTransfer) {
  if (!target) return false;
  let ev;
  try {
    ev = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
    });
  } catch {
    ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
    });
  }
  try {
    if (!ev.dataTransfer || typeof ev.dataTransfer.setData !== 'function') {
      Object.defineProperty(ev, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
        configurable: true,
      });
    }
  } catch {
    // Fallback
  }
  return target.dispatchEvent(ev);
}

function createGhostClone(sourceEl, clientX, clientY) {
  const rect = sourceEl.getBoundingClientRect();
  const w = Math.max(44, Math.min(180, rect.width || 60));
  const h = Math.max(44, Math.min(180, rect.height || 60));
  const ghost = sourceEl.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('gr-touch-drag-ghost');
  ghost.style.width = `${Math.round(w)}px`;
  ghost.style.height = `${Math.round(h)}px`;
  const isRotated = document.body.classList.contains('gr-portrait-rotated');
  ghost.style.transform = `translate3d(${Math.round(clientX - w / 2)}px, ${Math.round(clientY - h / 2)}px, 0) ${isRotated ? 'rotate(90deg)' : ''} scale(1.08)`;
  document.body.appendChild(ghost);
  return { el: ghost, width: w, height: h };
}

function moveGhostClone(ghostObj, clientX, clientY) {
  if (!ghostObj || !ghostObj.el) return;
  const x = Math.round(clientX - ghostObj.width / 2);
  const y = Math.round(clientY - ghostObj.height / 2);
  const isRotated = document.body.classList.contains('gr-portrait-rotated');
  ghostObj.el.style.transform = `translate3d(${x}px, ${y}px, 0) ${isRotated ? 'rotate(90deg)' : ''} scale(1.08)`;
}

function findElementUnderFinger(clientX, clientY, ignoreSourceEl, ghostEl) {
  if (typeof document.elementsFromPoint === 'function') {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      if (!el) continue;
      if (ghostEl && (el === ghostEl || ghostEl.contains(el))) continue;
      if (el.id === 'tooltip' || el.closest?.('#tooltip')) continue;
      return el;
    }
  }
  if (ghostEl) ghostEl.style.display = 'none';
  const el = document.elementFromPoint(clientX, clientY);
  if (ghostEl) ghostEl.style.display = '';
  return el;
}

function dispatchSyntheticHoverTooltip(target, clientX, clientY) {
  if (!target) return;
  const enterEv = new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  const moveEv = new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  target.dispatchEvent(enterEv);
  target.dispatchEvent(moveEv);
}

let touchBridgeInitialized = false;

export function initMobileTouchEngine() {
  if (touchBridgeInitialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  touchBridgeInitialized = true;

  ensureSafeAreaProbe();
  updateMobileViewport();

  window.addEventListener('resize', updateMobileViewport, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(updateMobileViewport, 60);
    setTimeout(updateMobileViewport, 250);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateMobileViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', updateMobileViewport, { passive: true });
  }

  let activeGesture = null;

  function clearLongPressTimer() {
    if (activeGesture && activeGesture.longPressTimer) {
      clearTimeout(activeGesture.longPressTimer);
      activeGesture.longPressTimer = null;
    }
  }

  function cleanupDragState() {
    clearLongPressTimer();
    if (!activeGesture) return;
    if (activeGesture.ghost && activeGesture.ghost.el) {
      activeGesture.ghost.el.remove();
    }
    if (activeGesture.lastHoverTarget) {
      dispatchSyntheticDragEvent(
        activeGesture.lastHoverTarget,
        'dragleave',
        activeGesture.lastX,
        activeGesture.lastY,
        activeGesture.dataTransfer,
      );
    }
    document.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
    activeGesture = null;
  }

  document.addEventListener('touchstart', (e) => {
    try {
      audio?.unlock?.();
    } catch {
      // ignore
    }

    if (!e.touches || e.touches.length !== 1) {
      cleanupDragState();
      return;
    }

    const t = e.touches[0];
    const startX = t.clientX;
    const startY = t.clientY;
    const rawTarget = e.target instanceof Element ? e.target : null;
    if (!rawTarget) return;

    const helpBtn = rawTarget.closest('.gr-hero-card-help');
    if (helpBtn) {
      e.preventDefault();
      e.stopPropagation();
      const cardEl = helpBtn.closest('.gr-hero-card') || helpBtn;
      dispatchSyntheticHoverTooltip(cardEl, startX, startY);
      return;
    }

    const tooltipEl = document.getElementById('tooltip');
    if (tooltipEl && tooltipEl.style.display !== 'none' && !rawTarget.closest('#tooltip')) {
      hideTooltip();
    }

    const draggableEl = rawTarget.closest('[draggable="true"]');
    const inspectableEl = rawTarget.closest(
      '.gr-hero-card, .item-slot, .relic-slot, .gr-unit-on-board, .gr-board-unit, .gr-party-slot, .gr-reserve-slot, .gr-diamond-slot, .gr-initial-relic-box, .gr-shop-item-row, .gr-shop-relic-row, .gr-syn-chip, .gr-top-stabilizer, .gr-chunk-stabilizer'
    );

    activeGesture = {
      touchId: t.identifier,
      startX,
      startY,
      lastX: startX,
      lastY: startY,
      rawTarget,
      draggableEl,
      inspectableEl,
      dragging: false,
      longPressTriggered: false,
      longPressTimer: null,
      ghost: null,
      dataTransfer: null,
      lastHoverTarget: null,
    };

    if (inspectableEl) {
      activeGesture.longPressTimer = setTimeout(() => {
        if (!activeGesture || activeGesture.dragging) return;
        activeGesture.longPressTriggered = true;
        dispatchSyntheticHoverTooltip(inspectableEl, activeGesture.lastX, activeGesture.lastY);
      }, LONG_PRESS_MS);
    }
  }, { passive: false, capture: true });

  document.addEventListener('touchmove', (e) => {
    if (!activeGesture) return;
    const t = Array.from(e.touches || []).find((touch) => touch.identifier === activeGesture.touchId);
    if (!t) return;

    const cx = t.clientX;
    const cy = t.clientY;
    activeGesture.lastX = cx;
    activeGesture.lastY = cy;

    const dist = Math.hypot(cx - activeGesture.startX, cy - activeGesture.startY);
    if (dist > DRAG_THRESHOLD_PX) {
      clearLongPressTimer();
    }

    if (!activeGesture.dragging && activeGesture.draggableEl && dist > DRAG_THRESHOLD_PX) {
      activeGesture.dragging = true;
      hideTooltip();
      activeGesture.dataTransfer = createSyntheticDataTransfer();
      dispatchSyntheticDragEvent(
        activeGesture.draggableEl,
        'dragstart',
        activeGesture.startX,
        activeGesture.startY,
        activeGesture.dataTransfer,
      );
      activeGesture.ghost = createGhostClone(activeGesture.draggableEl, cx, cy);
    }

    if (activeGesture.dragging) {
      if (e.cancelable) e.preventDefault();
      moveGhostClone(activeGesture.ghost, cx, cy);

      const underEl = findElementUnderFinger(
        cx,
        cy,
        activeGesture.draggableEl,
        activeGesture.ghost ? activeGesture.ghost.el : null,
      );

      if (underEl !== activeGesture.lastHoverTarget) {
        if (activeGesture.lastHoverTarget) {
          dispatchSyntheticDragEvent(
            activeGesture.lastHoverTarget,
            'dragleave',
            cx,
            cy,
            activeGesture.dataTransfer,
          );
        }
        if (underEl) {
          dispatchSyntheticDragEvent(
            underEl,
            'dragenter',
            cx,
            cy,
            activeGesture.dataTransfer,
          );
        }
        activeGesture.lastHoverTarget = underEl;
      }

      if (underEl) {
        dispatchSyntheticDragEvent(
          underEl,
          'dragover',
          cx,
          cy,
          activeGesture.dataTransfer,
        );
      }
    }
  }, { passive: false, capture: true });

  document.addEventListener('touchend', (e) => {
    if (!activeGesture) return;
    const t = Array.from(e.changedTouches || []).find((touch) => touch.identifier === activeGesture.touchId);
    const endX = t ? t.clientX : activeGesture.lastX;
    const endY = t ? t.clientY : activeGesture.lastY;

    clearLongPressTimer();

    if (activeGesture.dragging && activeGesture.draggableEl) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const dropEl = findElementUnderFinger(
        endX,
        endY,
        activeGesture.draggableEl,
        activeGesture.ghost ? activeGesture.ghost.el : null,
      );

      if (dropEl) {
        dispatchSyntheticDragEvent(dropEl, 'drop', endX, endY, activeGesture.dataTransfer);
      }
      dispatchSyntheticDragEvent(activeGesture.draggableEl, 'dragend', endX, endY, activeGesture.dataTransfer);
      cleanupDragState();
      return;
    }

    if (activeGesture.longPressTriggered) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      cleanupDragState();
      return;
    }

    cleanupDragState();
  }, { passive: false, capture: true });

  document.addEventListener('touchcancel', () => {
    cleanupDragState();
  }, { passive: true, capture: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileTouchEngine, { once: true });
  } else {
    initMobileTouchEngine();
  }
}
