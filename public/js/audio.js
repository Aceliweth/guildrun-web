// audio.js — Guildrun web audio layer (AUDIO agent).
// export const audio = { init(), playMusic(name), playSfx(name), setVolume(v) }
// - Reads /assets/audio/manifest.json (logical name -> [variant files]); picks a random variant.
// - WebAudio when available (decoded buffer cache, music crossfade); HTMLAudio fallback.
// - Unlocks on first user gesture (autoplay policy); queued music starts once unlocked.
// - Every call is a silent no-op if the manifest / files / audio APIs are missing.

const BASE = './assets/audio/';
const FADE = 1.2;            // music crossfade seconds
const MAX_VOICES = 24;       // concurrent sfx cap
const SFX_THROTTLE_MS = 45;  // same sfx name can't retrigger faster than this

const hasWindow = typeof window !== 'undefined';
const AC = hasWindow ? (window.AudioContext || window.webkitAudioContext) : null;

const st = {
  initPromise: null,
  logical: {},             // name -> [relative file]
  ctx: null, master: null, musicBus: null, sfxBus: null,
  buffers: new Map(),      // url -> Promise<AudioBuffer|null>
  unlocked: false,
  volume: 0.8, musicVolume: 0.6, sfxVolume: 1.0, muted: false,
  music: null,             // { name, node, gain, el }
  pendingMusic: null,
  voices: 0,
  lastPlay: new Map(),
};

function load(key, def) {
  try { const v = localStorage.getItem('guildrun.audio.' + key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
function save(key, v) { try { localStorage.setItem('guildrun.audio.' + key, JSON.stringify(v)); } catch { /* ignore */ } }

function resolve(name) {
  if (!name) return null;
  let list = st.logical[name];
  if (!list || !list.length) {
    // allow fallbacks: 'hero.x.attack' / 'enemy.x.attack' -> 'sfx.attack', 'vo.x.death' -> none, raw file path
    if (/\.(ogg|wav|mp3)$/i.test(name)) return BASE + name;
    const m = /^(?:hero|enemy)\.([^.]+)\.(attack|hit|skill|skill_hit|roar)$/.exec(name);
    if (m) {
      const heroAlt = st.logical[`hero.${m[1]}.${m[2]}`];
      if (heroAlt && heroAlt.length) list = heroAlt;
      else list = st.logical[m[2] === 'skill' || m[2] === 'skill_hit' || m[2] === 'roar' ? 'sfx.cast' : 'sfx.' + m[2]];
    }
    if (!list || !list.length) return null;
  }
  return BASE + list[(Math.random() * list.length) | 0];
}

function applyGains() {
  if (!st.ctx) return;
  const t = st.ctx.currentTime;
  st.master.gain.setTargetAtTime(st.muted ? 0 : st.volume, t, 0.05);
  st.musicBus.gain.setTargetAtTime(st.musicVolume, t, 0.05);
  st.sfxBus.gain.setTargetAtTime(st.sfxVolume, t, 0.05);
}

function setupContext() {
  if (!AC || st.ctx) return;
  try {
    st.ctx = new AC();
    st.master = st.ctx.createGain();
    st.musicBus = st.ctx.createGain();
    st.sfxBus = st.ctx.createGain();
    st.musicBus.connect(st.master);
    st.sfxBus.connect(st.master);
    st.master.connect(st.ctx.destination);
    applyGains();
  } catch { st.ctx = null; }
}

function unlock() {
  if (st.unlocked) return;
  st.unlocked = true;
  setupContext();
  if (st.ctx && st.ctx.state === 'suspended') st.ctx.resume().catch(() => {});
  if (st.pendingMusic) { const n = st.pendingMusic; st.pendingMusic = null; audio.playMusic(n); }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock, true);
}

function getBuffer(url) {
  if (!st.ctx) return Promise.resolve(null);
  let p = st.buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then(ab => new Promise((res, rej) => {
        const ret = st.ctx.decodeAudioData(ab, res, rej);
        if (ret && ret.then) ret.then(res, rej);
      }))
      .catch(() => null);
    st.buffers.set(url, p);
  }
  return p;
}

function fadeOutCurrentMusic() {
  const cur = st.music;
  st.music = null;
  if (!cur) return;
  if (cur.gain && st.ctx) {
    const t = st.ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + FADE);
    try { cur.node && cur.node.stop(t + FADE + 0.05); } catch { /* ignore */ }
  } else if (cur.el) {
    const el = cur.el, start = el.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
      el.volume = start * (1 - k);
      if (k < 1) requestAnimationFrame(step); else { el.pause(); el.src = ''; }
    };
    step();
  }
}

function htmlVol(kind) {
  return st.muted ? 0 : Math.max(0, Math.min(1, st.volume * (kind === 'music' ? st.musicVolume : st.sfxVolume)));
}

export const audio = {
  /** Load manifest + install unlock listeners. Safe to call multiple times. */
  init() {
    if (st.initPromise) return st.initPromise;
    st.volume = load('volume', st.volume);
    st.musicVolume = load('music', st.musicVolume);
    st.sfxVolume = load('sfx', st.sfxVolume);
    st.muted = load('muted', st.muted);
    if (hasWindow) {
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, true);
    }
    st.initPromise = (typeof fetch === 'function'
      ? fetch(BASE + 'manifest.json').then(r => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null))
      .then(m => { st.logical = (m && m.logical) || {}; return !!m; });
    return st.initPromise;
  },

  /** Crossfade to a looping music track (logical name, e.g. 'music.combat'). null/'' stops music. */
  playMusic(name) {
    try {
      if (!st.initPromise) this.init();
      if (!name) { st.pendingMusic = null; fadeOutCurrentMusic(); return; }
      if (st.music && st.music.name === name) return;
      if (!st.unlocked) { st.pendingMusic = name; return; }
      st.initPromise.then(() => {
        if (st.music && st.music.name === name) return;
        const url = resolve(name);
        if (!url) { fadeOutCurrentMusic(); return; }
        const token = {};
        st.musicToken = token;
        if (st.ctx) {
          getBuffer(url).then(buf => {
            if (!buf || st.musicToken !== token) return;
            fadeOutCurrentMusic();
            const node = st.ctx.createBufferSource();
            const gain = st.ctx.createGain();
            node.buffer = buf; node.loop = true;
            node.connect(gain); gain.connect(st.musicBus);
            const t = st.ctx.currentTime;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(1, t + FADE);
            node.start(t);
            st.music = { name, node, gain };
          });
        } else if (typeof Audio !== 'undefined') {
          fadeOutCurrentMusic();
          const el = new Audio(url);
          el.loop = true; el.volume = 0;
          el.play().catch(() => {});
          const target = htmlVol('music'), t0 = performance.now();
          const step = () => {
            const k = Math.min(1, (performance.now() - t0) / (FADE * 1000));
            el.volume = target * k;
            if (k < 1 && st.music && st.music.el === el) requestAnimationFrame(step);
          };
          st.music = { name, el };
          step();
        }
      });
    } catch { /* no-op */ }
  },

  /** Fire-and-forget one-shot (logical name, e.g. 'ui.click', 'hero.fiona.attack'). opts: {volume, rate} */
  playSfx(name, opts = {}) {
    try {
      if (!st.initPromise) this.init();
      if (!st.unlocked || st.muted) return;
      const now = performance.now();
      if (now - (st.lastPlay.get(name) || 0) < SFX_THROTTLE_MS) return;
      st.lastPlay.set(name, now);
      if (st.voices >= MAX_VOICES) return;
      st.initPromise.then(() => {
        const url = resolve(name);
        if (!url) return;
        const vol = opts.volume == null ? 1 : opts.volume;
        if (st.ctx) {
          getBuffer(url).then(buf => {
            if (!buf || st.voices >= MAX_VOICES) return;
            const node = st.ctx.createBufferSource();
            const gain = st.ctx.createGain();
            node.buffer = buf;
            node.playbackRate.value = opts.rate || (0.96 + Math.random() * 0.08);
            gain.gain.value = vol;
            node.connect(gain); gain.connect(st.sfxBus);
            st.voices++;
            node.onended = () => { st.voices--; };
            node.start();
          });
        } else if (typeof Audio !== 'undefined') {
          const el = new Audio(url);
          el.volume = htmlVol('sfx') * vol;
          st.voices++;
          el.onended = el.onerror = () => { st.voices--; };
          el.play().catch(() => { st.voices--; });
        }
      });
    } catch { /* no-op */ }
  },

  /** Master volume 0..1 (persisted). */
  setVolume(v) {
    st.volume = Math.max(0, Math.min(1, +v || 0));
    save('volume', st.volume);
    applyGains();
    if (st.music && st.music.el) st.music.el.volume = htmlVol('music');
  },
  setMusicVolume(v) { st.musicVolume = Math.max(0, Math.min(1, +v || 0)); save('music', st.musicVolume); applyGains(); if (st.music && st.music.el) st.music.el.volume = htmlVol('music'); },
  setSfxVolume(v) { st.sfxVolume = Math.max(0, Math.min(1, +v || 0)); save('sfx', st.sfxVolume); applyGains(); },
  setMuted(m) { st.muted = !!m; save('muted', st.muted); applyGains(); if (st.music && st.music.el) st.music.el.volume = htmlVol('music'); },
  getVolume() { return { volume: st.volume, music: st.musicVolume, sfx: st.sfxVolume, muted: st.muted }; },
  /** Warm the buffer cache for a list of logical names (all variants). */
  preload(names) {
    if (!st.initPromise) this.init();
    return st.initPromise.then(() => {
      if (!st.ctx) return;
      for (const n of names || []) for (const f of st.logical[n] || []) getBuffer(BASE + f);
    });
  },
  has(name) { return !!(st.logical[name] && st.logical[name].length); },
  stopMusic() { this.playMusic(null); },
};

export default audio;
