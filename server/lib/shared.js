// Loads the browser game's own logic modules (data, world generation, pathfinding, mob AI) into Node so the
// server simulates exactly the same world and monsters as the client. Rendering is stubbed out: THREE comes from
// the npm package (math + scene graph only) and canvases are no-op fakes.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = process.env.EB_SRC || [path.join(__dirname, '..', '..', 'source', 'src'), path.join(__dirname, '..', 'game-src')].find((p) => fs.existsSync(path.join(p, 'data.js')));
if (!SRC) throw new Error('Cannot find the game sources (source/src). Set EB_SRC.');

function fakeCtx(w, h) {
  const img = (W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(Math.max(1, (W | 0) * (H | 0) * 4)) });
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createImageData') return (W, H) => img(W, H);
      if (k === 'getImageData') return (x, y, W, H) => img(W, H);
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function fakeCanvas() { const c = { width: 1, height: 1, style: {}, getContext() { return c._ctx || (c._ctx = fakeCtx(c.width, c.height)); }, addEventListener() {} }; return c; }

const THREE = require('three');
const sandbox = {
  THREE, console, Math, Date, JSON, Map, Set, WeakMap, Array, Object, Number, String, Boolean, Symbol, Error, Promise, Proxy, Reflect,
  Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, Uint8ClampedArray, ArrayBuffer, DataView,
  parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout, setInterval, clearInterval, performance: { now: () => Date.now() },
  document: { createElement: () => fakeCanvas(), getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] },
  addEventListener() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: { userAgent: 'node' }, location: { protocol: 'node:' },
  devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// Each file runs inside a function whose parameters are the sandbox globals: a bare global lookup inside a vm
// context goes through a slow interceptor (Math.floor in the pathfinder's inner loop was most of the CPU).
const GLOBALS = Object.keys(sandbox).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
for (const f of ['util.js', 'data.js', 'models.js', 'world.js', 'path.js', 'entities.js']) {
  const code = `(function (${GLOBALS.join(', ')}) {\n${fs.readFileSync(path.join(SRC, f), 'utf8')}\n}).apply(globalThis, [${GLOBALS.map((k) => 'globalThis.' + k).join(', ')}]);`;
  vm.runInContext(code, sandbox, { filename: f, lineOffset: -1 });
}
const EB = sandbox.EB;
EB.HEADLESS = true;

// Models: the server only needs each look's width/height (for collision); build each template once and cache it.
const realBuild = EB.models.buildModel;
const dims = new Map();
EB.models.buildModel = (spec) => {
  const sig = EB.models.sigOf(spec);
  let d = dims.get(sig);
  if (!d) { const M = realBuild(spec); d = { width: M.width, height: M.height }; dims.set(sig, d); }
  return { group: new THREE.Group(), parts: {}, st: { deadT: 1, dead: false }, width: d.width, height: d.height, sig };
};
EB.models.animateModel = () => {};
EB.models.setDead = (M, dead) => { if (M && M.st) M.st.dead = dead; };
EB.models.flinch = () => {};
EB.models.dispose = () => {};
// nameplates are invisible on the server
EB.ent.makeNameplate = () => null;

module.exports = { EB, THREE, SRC };
