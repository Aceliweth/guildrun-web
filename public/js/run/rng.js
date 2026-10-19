// Deterministic RNG utilities for the run meta-loop.
// - mulberry32: small fast 32-bit PRNG (state is a single uint32 => trivially serializable)
// - calculateCurrentSeed: RunSessionService.CalculateCurrentSeed (VA 0x1804AC520) from re_data/scopes_data.json
//     seed = ((((rInit*31 + rShop)*31 + flow)*31 + floor)*31) + (runSeed + 0x1D02628F)   (mod 2^32)

export const SEED_PRIME_OFFSET = 0x1D02628F; // 486695567

export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return makeRng(next);
}

function makeRng(next) {
  const rng = {
    next,
    float: next,
    /** integer in [min, max] inclusive (like Unity Random.Range for ints with inclusive upper here) */
    rangeInclusive(min, max) {
      min = Math.floor(min); max = Math.floor(max);
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    /** integer in [0, n) */
    int(n) { return n <= 0 ? 0 : Math.floor(next() * n); },
    chance(p) { return next() < p; },
    pick(arr) { return arr && arr.length ? arr[Math.floor(next() * arr.length)] : undefined; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /** entries: [{ id, weight }] → id or undefined. Non-positive weights are ignored. */
    weighted(entries) {
      let total = 0;
      for (const e of entries) if (e.weight > 0) total += e.weight;
      if (total <= 0) return undefined;
      let r = next() * total;
      for (const e of entries) {
        if (e.weight <= 0) continue;
        r -= e.weight;
        if (r < 0) return e.id;
      }
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].weight > 0) return entries[i].id;
      return undefined;
    },
    /** pick up to n distinct ids from weighted entries (without replacement) */
    weightedDistinct(entries, n) {
      const pool = entries.filter(e => e.weight > 0).map(e => ({ ...e }));
      const out = [];
      while (out.length < n && pool.length) {
        const id = rng.weighted(pool);
        if (id === undefined) break;
        out.push(id);
        const idx = pool.findIndex(e => e.id === id);
        pool.splice(idx, 1);
      }
      return out;
    },
  };
  return rng;
}

/** RunSessionService.CalculateCurrentSeed — polynomial hash (×31) + prime offset, 32-bit wrap. */
export function calculateCurrentSeed({ initialSelectRerolls = 0, shopRefreshCount = 0, flow = 0, currentFloor = 0, endlessFloorIndex = -1, runSeed = 0 }) {
  const floor = endlessFloorIndex >= 0 ? endlessFloorIndex : currentFloor;
  let h = initialSelectRerolls | 0;
  h = (Math.imul(h, 31) + (shopRefreshCount | 0)) | 0;
  h = (Math.imul(h, 31) + (flow | 0)) | 0;
  h = (Math.imul(h, 31) + (floor | 0)) | 0;
  h = Math.imul(h, 31) | 0;
  return (h + ((runSeed + SEED_PRIME_OFFSET) | 0)) >>> 0;
}

export function hashString(str) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Derive a fresh RNG from a base seed + tag + counter (all deterministic). */
export function deriveRng(baseSeed, tag, counter) {
  let s = (baseSeed ^ hashString(String(tag))) >>> 0;
  s = (s + Math.imul(counter | 0, 0x9E3779B9)) >>> 0;
  return mulberry32(s);
}

export function randomSeed() {
  return (Math.floor(Math.random() * 0xFFFFFFFF) ^ (Date.now() & 0xFFFFFFFF)) >>> 0;
}
