// Deterministic PRNG (Mulberry32) seeded by number or string.

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    const s = (seed | 0) >>> 0;
    return s === 0 ? 0x6d2b79f5 : s;
  }
  if (typeof seed === 'string' && seed.length > 0) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h === 0 ? 0x6d2b79f5 : h;
  }
  return 0x6d2b79f5;
}

export function createPrng(seed) {
  let state = normalizeSeed(seed);

  function nextUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  function nextFloat() {
    return nextUint32() / 4294967296;
  }

  function range(min, max) {
    if (max <= min) return min;
    return min + nextFloat() * (max - min);
  }

  function intRange(min, maxInclusive) {
    const lo = Math.ceil(min);
    const hi = Math.floor(maxInclusive);
    if (hi <= lo) return lo;
    return lo + Math.floor(nextFloat() * (hi - lo + 1));
  }

  function chance(percent) {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    return nextFloat() * 100 < percent;
  }

  function pick(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr[Math.floor(nextFloat() * arr.length)];
  }

  return {
    nextUint32,
    nextFloat,
    range,
    intRange,
    chance,
    pick,
    getState: () => state,
  };
}
