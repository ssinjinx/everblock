// Everblock - utilities: seeded RNG, value noise, helpers
(function () {
  const EB = (window.EB = window.EB || {});

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hash2(x, z, seed) {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
    const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
    const u = smooth(xf), v = smooth(zf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, seed, oct) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += valueNoise(x * f, z * f, seed + i * 1013) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function coinStr(copper) {
    copper = Math.max(0, Math.floor(copper));
    const p = Math.floor(copper / 1000), g = Math.floor((copper % 1000) / 100),
      s = Math.floor((copper % 100) / 10), c = copper % 10;
    const parts = [];
    if (p) parts.push(p + ' platinum');
    if (g) parts.push(g + ' gold');
    if (s) parts.push(s + ' silver');
    if (c || !parts.length) parts.push(c + ' copper');
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  function coinShort(copper) {
    copper = Math.max(0, Math.floor(copper));
    const p = Math.floor(copper / 1000), g = Math.floor((copper % 1000) / 100),
      s = Math.floor((copper % 100) / 10), c = copper % 10;
    return `${p}p ${g}g ${s}s ${c}c`;
  }

  EB.util = { mulberry32, hashStr, hash2, valueNoise, fbm, clamp, lerp, smoothstep, randInt, cap, coinStr, coinShort };
})();
