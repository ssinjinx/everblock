// Everblock v4 - detailed voxel character & monster models.
// Every model is a hierarchical rig of bones; all the small boxes attached to one bone are merged into a single
// BufferGeometry with baked vertex colours (face shading + height-based ambient occlusion) and a shared pixel-grain
// texture, so a detailed character costs about as many draw calls as the old 12-box ones. Geometries are cached per
// look ("template") and shared between every instance of the same mob type.
(function () {
  const EB = window.EB;
  const { ITEMS, RACES, CLASSES } = EB.data;

  // ---------------------------------------------------------------- shared resources
  const RIM = { value: 0.32 };
  function grainTexture() {
    const S = 32, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
    let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0;
      let v = 222 + Math.floor(rnd() * 34);
      if (((x >> 2) + (y >> 2)) % 2 === 0) v -= 6; // faint 4px "voxel" cells
      v = Math.min(255, v);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const GRAIN = grainTexture();
  function rimPatch(m) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.rimStr = RIM;
      sh.fragmentShader = 'uniform float rimStr;\n' + sh.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n' +
        '  float rimF = pow(1.0 - saturate(dot(normal, geometry.viewDir)), 3.0);\n' +
        '  outgoingLight += (vec3(0.55, 0.62, 0.8) * 0.55 + diffuseColor.rgb * 0.45) * rimF * rimStr;');
    };
    m.customProgramCacheKey = () => 'eb-rim';
    return m;
  }
  const MAT = {
    body: rimPatch(new THREE.MeshLambertMaterial({ vertexColors: true, map: GRAIN })),
    dark: rimPatch(new THREE.MeshLambertMaterial({ vertexColors: true, map: GRAIN, color: 0x707070 })),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const shadowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const SHADOW_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const SHADOW_MAT = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  const Q = { high: true };
  const liveShadows = new Set();
  function setQuality(high) {
    Q.high = !!high;
    for (const m of [MAT.body, MAT.dark]) { m.map = high ? GRAIN : null; m.needsUpdate = true; }
    RIM.value = high ? (RIM.base != null ? RIM.base : 0.32) : 0;
    for (const s of liveShadows) s.visible = Q.high;
  }
  function setRim(v) { RIM.base = v; if (Q.high) RIM.value = v; }

  // ---------------------------------------------------------------- colour helpers
  const tmpC = new THREE.Color();
  function shade(c, f) { tmpC.setHex(c); tmpC.r = Math.min(1, tmpC.r * f); tmpC.g = Math.min(1, tmpC.g * f); tmpC.b = Math.min(1, tmpC.b * f); return tmpC.getHex(); }
  function mix(a, b, t) { const A = new THREE.Color(a), B = new THREE.Color(b); return A.lerp(B, t).getHex(); }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- rig builder
  class Rig {
    constructor(key, height) { this.key = key; this.bones = []; this.map = {}; this.H = height || 1.95; this.r = rng(hashStr(key)); }
    bone(name, parent, x, y, z, rot) { const b = { name, parent, pos: [x, y, z], rot: rot || null, boxes: [], glows: [] }; this.bones.push(b); this.map[name] = b; return name; }
    box(bone, x, y, z, w, h, d, color, o) {
      const b = this.map[bone]; if (!b) throw new Error('no bone ' + bone);
      const e = { x, y, z, w: Math.max(0.005, w), h: Math.max(0.005, h), d: Math.max(0.005, d), color, r: o && o.r, noAO: o && o.noAO };
      (o && o.glow ? b.glows : b.boxes).push(e);
    }
  }
  // face tables: normal, corners (signs of hx,hy,hz), texture right/up axes, baked face shade
  const FACES = [
    { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], u: [0, 0, -1], v: [0, 1, 0], s: 0.86 },
    { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], u: [0, 0, 1], v: [0, 1, 0], s: 0.86 },
    { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], u: [1, 0, 0], v: [0, 0, -1], s: 1.0 },
    { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], u: [1, 0, 0], v: [0, 0, 1], s: 0.6 },
    { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], u: [1, 0, 0], v: [0, 1, 0], s: 0.95 },
    { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], u: [-1, 0, 0], v: [0, 1, 0], s: 0.8 },
  ];
  const UVS = 0.62; // ~20 texels per metre on the 32px grain texture
  const eul = new THREE.Euler(), rq = new THREE.Quaternion(), v3 = new THREE.Vector3(), n3 = new THREE.Vector3();
  function mergeBoxes(boxes, origin, H, glow, r) {
    if (!boxes.length) return null;
    const n = boxes.length, pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), col = new Float32Array(n * 72), uv = new Float32Array(n * 48), idx = new Uint32Array(n * 36);
    let vi = 0, ii = 0;
    const c = new THREE.Color();
    for (const b of boxes) {
      const hx = b.w / 2, hy = b.h / 2, hz = b.d / 2;
      if (b.r) { eul.set(b.r[0] || 0, b.r[1] || 0, b.r[2] || 0); rq.setFromEuler(eul); }
      c.setHex(b.color); c.convertSRGBToLinear(); // author in sRGB hex, light in linear space (richer, less washed-out colours)
      const jit = glow ? 1 : 0.95 + r() * 0.08, ou = r() * 4, ov = r() * 4;
      for (const f of FACES) {
        n3.set(f.n[0], f.n[1], f.n[2]); if (b.r) n3.applyQuaternion(rq);
        for (let k = 0; k < 4; k++) {
          const cc = f.c[k];
          v3.set(cc[0] * hx, cc[1] * hy, cc[2] * hz);
          const lu = v3.x * f.u[0] + v3.y * f.u[1] + v3.z * f.u[2], lv = v3.x * f.v[0] + v3.y * f.v[1] + v3.z * f.v[2];
          if (b.r) v3.applyQuaternion(rq);
          const x = b.x + v3.x, y = b.y + v3.y, z = b.z + v3.z;
          pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
          nor[vi * 3] = n3.x; nor[vi * 3 + 1] = n3.y; nor[vi * 3 + 2] = n3.z;
          let f2 = 1;
          if (!glow) {
            const my = Math.max(0, Math.min(1, (origin[1] + y) / H));
            f2 = f.s * (b.noAO ? 1 : 0.64 + 0.36 * Math.pow(my, 0.55)) * jit;
            if (cc[1] < 0 && b.h > 0.08 && f.n[1] === 0) f2 *= 0.86; // darker lower edge of each box
          }
          col[vi * 3] = Math.min(1, c.r * f2); col[vi * 3 + 1] = Math.min(1, c.g * f2); col[vi * 3 + 2] = Math.min(1, c.b * f2);
          uv[vi * 2] = ou + (lu + (b.x * f.u[0] + b.y * f.u[1] + b.z * f.u[2])) * UVS;
          uv[vi * 2 + 1] = ov + (lv + (b.x * f.v[0] + b.y * f.v[1] + b.z * f.v[2])) * UVS;
          vi++;
        }
        const s = vi - 4;
        idx[ii++] = s; idx[ii++] = s + 1; idx[ii++] = s + 2; idx[ii++] = s; idx[ii++] = s + 2; idx[ii++] = s + 3;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  function finish(rig, extra) {
    const org = {};
    for (const b of rig.bones) { const p = b.parent ? org[b.parent] : [0, 0, 0]; org[b.name] = [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]; }
    const bones = rig.bones.map((b) => ({ name: b.name, parent: b.parent, pos: b.pos, rot: b.rot, geo: mergeBoxes(b.boxes, org[b.name], rig.H, false, rig.r), glowGeo: mergeBoxes(b.glows, org[b.name], rig.H, true, rig.r) }));
    return Object.assign({ bones, boxes: rig.bones.reduce((a, b) => a + b.boxes.length + b.glows.length, 0) }, extra || {});
  }
  const TPL = new Map();
  function template(key, fn) { let t = TPL.get(key); if (!t) { t = fn(key); TPL.set(key, t); } return t; }
  function instantiate(tpl, parentGroup, parts) {
    for (const b of tpl.bones) {
      const g = new THREE.Group(); g.position.fromArray(b.pos); if (b.rot) g.rotation.set(b.rot[0], b.rot[1], b.rot[2]);
      g.userData.rest = b.pos.slice(); g.userData.restRot = b.rot ? b.rot.slice() : [0, 0, 0];
      ((b.parent && parts[b.parent]) || parentGroup).add(g); parts[b.name] = g;
      if (b.geo) g.add(new THREE.Mesh(b.geo, MAT.body));
      if (b.glowGeo) g.add(new THREE.Mesh(b.glowGeo, MAT.glow));
    }
  }

  // ---------------------------------------------------------------- humanoid rig
  const HUMAN = { legLen: 0.8, torsoLen: 0.62, neck: 0.05, headS: 0.42, shoulderW: 0.33, torsoW: 0.5, torsoD: 0.28, hipW: 0.125, legW: 0.2, armW: 0.16, armLen: 0.7, hunch: 0 };
  const TIERS = {
    cloth: (c) => ({ shirt: c, low: shade(c, 0.85), sleeve: c, trim: shade(c, 1.35) }),
    leather: () => ({ shirt: 0x7a5232, low: 0x6a4428, sleeve: 0x6a4428, trim: 0xa07a4a }),
    chain: () => ({ shirt: 0x9aa0a8, low: 0x868c94, sleeve: 0x8a9098, trim: 0x5a6068 }),
    plate: () => ({ shirt: 0xc0c6d0, low: 0xa8aeb8, sleeve: 0xa8aeb8, trim: 0xd8b050 }),
    bone: () => ({ shirt: 0xd8d0b0, low: 0xb8b090, sleeve: 0xc8c0a0, trim: 0x8a8060 }),
    fur: () => ({ shirt: 0x8a6a4a, low: 0x7a5a3a, sleeve: 0x8a6a4a, trim: 0xd8c8a8 }),
  };
  function humanoid(P) {
    const key = 'H|' + JSON.stringify(P);
    return template(key, () => {
      const R = new Rig(key, P.legLen + P.torsoLen + P.neck + P.headS);
      const L = P.legLen, T = P.torsoLen, HS = P.headS, TW = P.torsoW, TD = P.torsoD, SW = P.shoulderW, AW = P.armW, LW = P.legW;
      const UA = P.armLen * 0.47, FA = P.armLen * 0.43;
      R.bone('hips', null, 0, L, 0);
      R.bone('torso', 'hips', 0, 0, 0);
      R.bone('head', 'torso', 0, T + P.neck, 0);
      for (const s of [-1, 1]) {
        const S = s < 0 ? 'L' : 'R';
        R.bone('uarm' + S, 'torso', s * SW, T - 0.07, 0);
        R.bone('farm' + S, 'uarm' + S, 0, -UA, 0);
        R.bone('hand' + S, 'farm' + S, 0, -FA - 0.05, 0.02);
        R.bone('thigh' + S, 'hips', s * P.hipW, 0, 0);
        R.bone('shin' + S, 'thigh' + S, 0, -L * 0.5, 0);
      }
      if (P.tail) R.bone('tail', 'hips', 0, -0.02, -TD * 0.5);
      if (P.skeleton) skeletonBody(R, P, L, T, TW, TD, SW, AW, LW, UA, FA);
      else fleshBody(R, P, L, T, TW, TD, SW, AW, LW, UA, FA);
      headBuild(R, P);
      if (P.tail) { R.box('tail', 0, -0.05, -0.12, 0.09, 0.09, 0.26, P.fur || P.pants, { r: [0.6, 0, 0] }); R.box('tail', 0, -0.2, -0.26, 0.08, 0.08, 0.2, shade(P.fur || P.pants, 0.8), { r: [0.9, 0, 0] }); }
      return finish(R, { rig: 'human', dims: { L, T, HS, TW, TD, SW, AW, UA, FA, neck: P.neck } });
    });
  }
  function fleshBody(R, P, L, T, TW, TD, SW, AW, LW, UA, FA) {
    const skin = P.skin, sh = P.shirt, low = P.shirtLow, pants = P.pants;
    R.box('hips', 0, -0.07, 0, TW * 0.9, 0.2, TD * 0.95, pants);
    R.box('torso', 0, T * 0.2, 0, TW * 0.86, T * 0.4, TD * 0.92, low);
    R.box('torso', 0, T * 0.68, 0, TW, T * 0.6, TD, sh);
    if (P.bareChest) { // pecs / abs shading
      for (const s of [-1, 1]) R.box('torso', s * TW * 0.2, T * 0.75, TD * 0.5, TW * 0.34, T * 0.2, 0.02, shade(skin, 1.05));
      for (let i = 0; i < 3; i++) R.box('torso', 0, T * (0.25 + i * 0.12), TD * 0.47, TW * 0.3, T * 0.08, 0.02, shade(skin, 0.92));
    }
    R.box('torso', 0, T * 0.03, 0, TW * 0.92, 0.075, TD * 0.99, P.belt);
    R.box('torso', 0, T * 0.03, TD * 0.5, 0.085, 0.07, 0.025, P.buckle || 0xd8b050);
    R.box('torso', TW * 0.34, -0.03, TD * 0.3, 0.1, 0.11, 0.07, shade(P.belt, 1.25)); // belt pouch
    R.box('torso', TW * 0.34, 0.01, TD * 0.345, 0.07, 0.03, 0.02, shade(P.belt, 0.8));
    if (!P.bareChest) R.box('torso', 0, T * 0.4, 0, TW * 0.9, 0.03, TD * 1.005, shade(low, 0.88)); // tunic hem crease
    R.box('hips', 0, -0.17, TD * 0.47, TW * 0.22, 0.12, 0.02, shade(pants, 0.85)); // fly / codpiece seam
    R.box('torso', 0, T + P.neck * 0.5, 0, P.headS * 0.42, P.neck + 0.05, P.headS * 0.42, P.fur && P.furNeck ? P.fur : skin);
    if (!P.bareChest && !P.fur) R.box('torso', 0, T * 0.93, TD * 0.5, TW * 0.3, T * 0.1, 0.02, skin); // neckline
    const pd = P.pauldron;
    for (const s of [-1, 1]) {
      if (pd) {
        R.box('torso', s * (SW + 0.02), T - 0.03, 0, AW * 1.6, 0.14, AW * 1.55, pd);
        R.box('torso', s * (SW + 0.02), T + 0.05, 0, AW * 1.3, 0.05, AW * 1.3, shade(pd, 1.15));
        if (P.spikes) R.box('torso', s * (SW + 0.04), T + 0.14, 0, 0.05, 0.14, 0.05, 0xd8d0c0);
      } else R.box('torso', s * SW, T - 0.05, 0, AW * 1.15, 0.13, AW * 1.1, P.sleeve);
    }
    const tier = P.tier, tr = P.trim;
    if (tier === 'plate') {
      R.box('torso', 0, T * 0.68, TD * 0.52, TW * 0.78, T * 0.5, 0.04, shade(sh, 1.12));
      R.box('torso', 0, T * 0.68, TD * 0.55, 0.05, T * 0.46, 0.02, shade(sh, 1.25));
      for (const s of [-1, 1]) R.box('torso', s * TW * 0.33, T * 0.88, TD * 0.55, 0.035, 0.035, 0.02, tr);
      for (let i = 0; i < 2; i++) R.box('torso', 0, T * (0.12 + i * 0.13), TD * 0.47, TW * 0.82, 0.05, 0.03, shade(low, 1.15));
    } else if (tier === 'chain') {
      for (let i = 0; i < 4; i++) R.box('torso', 0, T * (0.3 + i * 0.16), 0, TW * 1.01, 0.025, TD * 1.01, shade(sh, 0.8));
    } else if (tier === 'leather') {
      R.box('torso', 0, T * 0.66, TD * 0.51, 0.04, T * 0.55, 0.02, tr);
      for (let i = 0; i < 3; i++) R.box('torso', 0, T * (0.48 + i * 0.13), TD * 0.52, 0.12, 0.02, 0.02, shade(tr, 0.8));
      R.box('torso', 0, T * 0.66, 0, TW * 1.02, 0.05, TD * 1.02, shade(sh, 0.8));
    } else if (tier === 'bone') {
      for (let i = 0; i < 3; i++) R.box('torso', 0, T * (0.5 + i * 0.12), TD * 0.51, TW * (0.7 - i * 0.1), 0.04, 0.03, 0xeae4cc);
    } else if (tier === 'robe' || tier === 'cloth') {
      R.box('torso', 0, T * 0.55, TD * 0.51, 0.07, T * 0.75, 0.02, tr);
      R.box('torso', 0, T * 0.96, 0, TW * 0.8, 0.04, TD * 1.02, tr);
    }
    if (P.tabard) {
      R.box('torso', 0, T * 0.5, TD * 0.54, TW * 0.5, T * 0.85, 0.02, P.tabard);
      R.box('hips', 0, -0.2, TD * 0.52, TW * 0.46, 0.3, 0.02, P.tabard);
      R.box('torso', 0, T * 0.62, TD * 0.56, 0.12, 0.12, 0.015, P.emblem || 0xe8c860);
    }
    if (P.apron) { R.box('torso', 0, T * 0.35, TD * 0.52, TW * 0.7, T * 0.6, 0.02, P.apron); R.box('hips', 0, -0.18, TD * 0.5, TW * 0.7, 0.32, 0.02, P.apron); }
    if (P.necklace) for (let i = -2; i <= 2; i++) R.box('torso', i * 0.055, T * 0.9 - (2 - Math.abs(i)) * 0.03, TD * 0.52, 0.04, 0.05, 0.03, P.necklace);
    if (P.collar) { R.box('torso', 0, T + 0.02, 0, P.headS * 0.62, 0.07, P.headS * 0.62, P.collar); for (const s of [-1, 1]) R.box('torso', s * 0.14, T + 0.03, 0.1, 0.035, 0.035, 0.08, 0xd0d0d8); }
    if (P.fur) { // shaggy fur tufts
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; R.box('torso', Math.sin(a) * TW * 0.5, T * 0.1, Math.cos(a) * TD * 0.5, 0.1, 0.12, 0.1, shade(P.fur, 0.9)); }
      for (const s of [-1, 1]) R.box('torso', s * SW, T + 0.02, 0, AW * 1.5, 0.1, AW * 1.5, shade(P.fur, 1.05));
    }
    if (P.mantle) { R.box('torso', 0, T - 0.02, -0.02, TW * 1.3, 0.16, TD * 1.25, P.mantle); R.box('torso', 0, T - 0.12, TD * 0.45, TW * 0.9, 0.08, 0.08, shade(P.mantle, 0.9)); }
    if (P.ribsShow) for (let i = 0; i < 3; i++) R.box('torso', 0, T * (0.5 + i * 0.1), TD * 0.47, TW * 0.6, 0.02, 0.03, shade(skin, 0.7));
    if (P.spots) { const r = R.r; for (let i = 0; i < 9; i++) { const s = r() < 0.5 ? -1 : 1; R.box('torso', s * TW * 0.5, T * (0.2 + r() * 0.7), (r() - 0.5) * TD * 0.8, 0.02, 0.07, 0.08, P.spots); R.box('torso', (r() - 0.5) * TW * 0.8, T * (0.2 + r() * 0.7), -TD * 0.5, 0.08, 0.07, 0.02, P.spots); } }
    for (const s of [-1, 1]) {
      const S = s < 0 ? 'L' : 'R';
      R.box('uarm' + S, 0, -UA / 2 + 0.02, 0, AW, UA + 0.04, AW, P.sleeve);
      R.box('farm' + S, 0, -FA / 2, 0, AW * 0.92, FA, AW * 0.92, P.longSleeve ? P.sleeve : skin);
      if (P.cuff) R.box('farm' + S, 0, -FA * 0.15, 0, AW * 1.02, 0.05, AW * 1.02, P.cuff);
      if (P.gloves) { R.box('farm' + S, 0, -FA * 0.78, 0, AW, FA * 0.44, AW, P.gloves); R.box('farm' + S, 0, -FA * 0.56, 0, AW * 1.12, 0.05, AW * 1.12, shade(P.gloves, 1.2)); }
      if (P.bracer) R.box('farm' + S, 0, -FA * 0.7, 0, AW * 1.08, FA * 0.3, AW * 1.08, P.bracer);
      const hc = P.gloves || skin;
      R.box('farm' + S, 0, -FA - 0.05, 0.01, AW * 0.86, 0.12, AW * 0.72, hc);
      R.box('farm' + S, -s * AW * 0.42, -FA - 0.03, 0.04, 0.04, 0.07, 0.04, hc);
      for (let k = 0; k < 2; k++) R.box('farm' + S, s * AW * (0.08 + k * 0.22) - s * 0.03, -FA - 0.12, 0.05, AW * 0.2, 0.05, AW * 0.34, shade(hc, 0.92)); // fingers
      if (P.claws) for (let k = -1; k <= 1; k++) R.box('farm' + S, k * AW * 0.26, -FA - 0.15, 0.05, 0.025, 0.1, 0.025, P.claws, { r: [0.4, 0, 0] });
      R.box('thigh' + S, 0, -L * 0.25 + 0.02, 0, LW, L * 0.5 + 0.04, LW, pants);
      R.box('shin' + S, 0, -L * 0.25, 0, LW * 0.92, L * 0.5, LW * 0.92, pants);
      if (P.kneePad) R.box('shin' + S, 0, -0.03, LW * 0.45, LW * 0.8, 0.1, 0.06, P.kneePad);
      if (P.boots) {
        R.box('shin' + S, 0, -L * 0.36, 0, LW * 1.02, L * 0.28, LW * 1.02, P.boots);
        R.box('shin' + S, 0, -L * 0.22, 0, LW * 1.1, 0.05, LW * 1.1, shade(P.boots, P.bootCuff ? 1.5 : 1.2));
      }
      R.box('shin' + S, 0, -L * 0.5 + 0.005, 0.05 + (P.bigFeet ? 0.03 : 0), LW * (P.bigFeet ? 1.24 : 1.06), 0.03, LW * (P.bigFeet ? 1.95 : 1.55), shade(P.boots || P.feet || skin, 0.6)); // sole
      R.box('shin' + S, 0, -0.02, LW * 0.44, LW * 0.7, 0.07, 0.04, shade(pants, 0.82)); // knee crease
      R.box('shin' + S, 0, -L * 0.5 + 0.05, 0.05 + (P.bigFeet ? 0.03 : 0), LW * (P.bigFeet ? 1.2 : 1.02), 0.1, LW * (P.bigFeet ? 1.9 : 1.5), P.boots || P.feet || skin);
      if (P.robe) { // robe panels hang from the thighs so they move with the stride
        R.box('thigh' + S, 0, -L * 0.42, LW * 0.5 + 0.015, LW * 1.25, L * 0.84, 0.03, P.shirtLow);
        R.box('thigh' + S, 0, -L * 0.42, -LW * 0.5 - 0.015, LW * 1.25, L * 0.84, 0.03, shade(P.shirtLow, 0.9));
        R.box('thigh' + S, s * (LW * 0.5 + 0.015), -L * 0.42, 0, 0.03, L * 0.84, LW * 1.1, shade(P.shirtLow, 0.95));
        R.box('thigh' + S, 0, -L * 0.83, LW * 0.5 + 0.03, LW * 1.25, 0.05, 0.02, P.trim);
      }
      if (P.rags) { const r = R.r; for (let k = 0; k < 3; k++) R.box('thigh' + S, (k - 1) * LW * 0.33, -L * (0.5 + r() * 0.2), LW * 0.5, LW * 0.3, L * (0.1 + r() * 0.15), 0.02, P.pants); }
    }
    if (P.loincloth) { R.box('hips', 0, -0.25, TD * 0.5, TW * 0.5, 0.32, 0.03, P.loincloth); R.box('hips', 0, -0.25, -TD * 0.5, TW * 0.5, 0.3, 0.03, shade(P.loincloth, 0.9)); }
  }
  function skeletonBody(R, P, L, T, TW, TD, SW, AW, LW, UA, FA) {
    const b = P.skin, dk = shade(b, 0.75), j = shade(b, 1.08);
    R.box('hips', 0, -0.05, 0, TW * 0.7, 0.12, TD * 0.6, b);
    R.box('hips', 0, -0.12, 0.02, TW * 0.3, 0.08, TD * 0.3, dk);
    R.box('torso', 0, T * 0.5, -TD * 0.2, 0.07, T, 0.07, dk);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const y = T * (0.42 + i * 0.14), w = TW * (0.38 - Math.abs(i - 1.5) * 0.03);
      R.box('torso', s * (w / 2 + 0.03), y, 0, w, 0.045, TD * 0.8, b);
    }
    R.box('torso', 0, T * 0.66, TD * 0.36, 0.06, T * 0.45, 0.04, b);
    for (let i = 0; i < 4; i++) R.box('torso', 0, T * (0.08 + i * 0.09), -TD * 0.18, 0.1, 0.05, 0.09, i % 2 ? dk : j); // lumbar vertebrae
    for (const s of [-1, 1]) { R.box('torso', s * SW * 0.5, T - 0.06, TD * 0.2, SW * 0.9, 0.035, 0.04, j, { r: [0, 0, s * 0.18] }); R.box('hips', s * TW * 0.26, -0.02, 0, 0.1, 0.14, TD * 0.5, j); }
    R.box('torso', 0, T - 0.02, 0, SW * 2 + 0.06, 0.05, 0.07, b);
    R.box('torso', 0, T + P.neck * 0.5, -0.02, 0.06, P.neck + 0.05, 0.06, dk);
    if (P.cloak) { R.box('torso', 0, T * 0.35, -TD * 0.5 - 0.03, TW * 1.1, T * 0.9, 0.03, P.cloak); R.box('torso', 0, T - 0.02, 0, TW * 1.25, 0.08, TD * 1.1, shade(P.cloak, 1.2)); }
    if (P.pauldron) for (const s of [-1, 1]) R.box('torso', s * (SW + 0.02), T - 0.02, 0, 0.2, 0.12, 0.2, P.pauldron);
    if (P.rags) R.box('hips', 0, -0.2, 0.01, TW * 0.75, 0.24, TD * 0.75, P.rags);
    const aw = Math.max(0.06, AW * 0.45), lw = Math.max(0.07, LW * 0.45);
    for (const s of [-1, 1]) {
      const S = s < 0 ? 'L' : 'R';
      R.box('uarm' + S, 0, -UA / 2, 0, aw, UA, aw, b); R.box('uarm' + S, 0, 0, 0, aw * 1.6, aw * 1.4, aw * 1.6, j);
      R.box('farm' + S, 0, 0, 0, aw * 1.4, aw * 1.4, aw * 1.4, j);
      R.box('farm' + S, -0.018, -FA / 2, 0, aw * 0.6, FA, aw * 0.6, b); R.box('farm' + S, 0.018, -FA / 2, 0, aw * 0.6, FA, aw * 0.6, dk);
      R.box('farm' + S, 0, -FA - 0.02, 0.01, aw * 1.5, 0.06, aw * 1.2, b);
      for (let k = -1; k <= 1; k++) R.box('farm' + S, k * 0.025, -FA - 0.09, 0.02, 0.018, 0.09, 0.018, b);
      R.box('thigh' + S, 0, -L * 0.25, 0, lw, L * 0.5, lw, b); R.box('thigh' + S, 0, 0, 0, lw * 1.6, lw * 1.4, lw * 1.6, j);
      R.box('shin' + S, 0, 0, 0, lw * 1.5, lw * 1.3, lw * 1.5, j);
      R.box('shin' + S, 0, -L * 0.25, 0, lw * 0.8, L * 0.5, lw * 0.8, b);
      R.box('shin' + S, 0, -L * 0.5 + 0.03, 0.06, lw * 1.4, 0.06, lw * 2.6, b);
      R.box('shin' + S, 0, -0.01, lw * 0.6, lw * 1.1, lw * 1.1, 0.04, j); // kneecap
      for (let k = -1; k <= 1; k++) R.box('shin' + S, k * lw * 0.45, -L * 0.5 + 0.02, lw * 1.35, lw * 0.3, 0.035, lw * 0.5, dk); // toes
    }
  }

  function headBuild(R, P) {
    const S = P.headS, skin = P.skin, hz = S * 0.5, f = hz + 0.005, hair = P.hair;
    if (P.skull) {
      const b = skin, dk = 0x1a1410;
      R.box('head', 0, S * 0.55, 0, S * 0.92, S * 0.78, S * 0.92, b);
      R.box('head', 0, S * 0.12, S * 0.06, S * 0.7, S * 0.22, S * 0.78, shade(b, 0.92));
      for (const s of [-1, 1]) {
        R.box('head', s * S * 0.2, S * 0.5, S * 0.47, S * 0.24, S * 0.22, 0.02, dk);
        if (P.eyeGlow) R.box('head', s * S * 0.2, S * 0.5, S * 0.475, S * 0.1, S * 0.1, 0.03, P.eyeGlow, { glow: true });
      }
      R.box('head', 0, S * 0.33, S * 0.465, S * 0.1, S * 0.1, 0.02, dk);
      for (let i = -2; i <= 2; i++) R.box('head', i * S * 0.12, S * 0.08, S * 0.45, S * 0.07, S * 0.09, 0.02, 0xf4f0e0);
      R.box('head', 0, S * 0.02, S * 0.1, S * 0.64, 0.03, S * 0.7, dk);
      if (P.crown) { R.box('head', 0, S * 0.98, 0, S * 0.98, S * 0.14, S * 0.98, P.crown); for (const s of [-1, 0, 1]) R.box('head', s * S * 0.32, S * 1.12, S * 0.3, 0.06, 0.1, 0.06, P.crown); R.box('head', 0, S * 1.0, S * 0.5, 0.07, 0.07, 0.02, 0xd02030, { glow: true }); }
      if (P.horns) for (const s of [-1, 1]) { R.box('head', s * S * 0.55, S * 0.8, 0, 0.08, 0.08, 0.2, P.horns, { r: [0, 0, s * 0.5] }); R.box('head', s * S * 0.68, S * 0.98, -0.04, 0.06, 0.18, 0.06, P.horns, { r: [0, 0, -s * 0.3] }); }
      return;
    }
    if (P.dog) { // gnoll: hyena head with long snout
      const fur = skin, dk = shade(fur, 0.7);
      R.box('head', 0, S * 0.5, -S * 0.02, S * 0.86, S * 0.78, S * 0.86, fur);
      R.box('head', 0, S * 0.36, S * 0.56, S * 0.44, S * 0.34, S * 0.46, shade(fur, 1.05));
      R.box('head', 0, S * 0.2, S * 0.5, S * 0.4, S * 0.1, S * 0.4, dk);
      R.box('head', 0, S * 0.5, S * 0.8, S * 0.2, S * 0.12, 0.05, 0x1a1210);
      for (const s of [-1, 1]) {
        R.box('head', s * S * 0.22, S * 0.66, S * 0.44, S * 0.14, S * 0.1, 0.03, 0xe8c040);
        R.box('head', s * S * 0.24, S * 0.66, S * 0.455, S * 0.06, S * 0.08, 0.02, 0x100808);
        R.box('head', s * S * 0.3, S * 1.0, -S * 0.1, S * 0.18, S * 0.32, S * 0.1, dk, { r: [0, 0, s * -0.25] });
        R.box('head', s * S * 0.3, S * 0.98, -S * 0.06, S * 0.1, S * 0.2, 0.02, 0xc08070, { r: [0, 0, s * -0.25] });
        R.box('head', s * S * 0.12, S * 0.14, S * 0.72, 0.03, 0.06, 0.03, 0xf0ead8);
      }
      for (let i = 0; i < 4; i++) R.box('head', 0, S * (0.95 - i * 0.2), -S * 0.45 - 0.02, S * 0.12, S * 0.2, 0.08, P.mane || dk); // mane
      if (P.spots) for (let i = 0; i < 5; i++) R.box('head', (i - 2) * S * 0.18, S * 0.8 - (i % 2) * 0.08, S * 0.1, S * 0.08, S * 0.08, S * 0.88, P.spots);
      return;
    }
    if (P.yetiFace) {
      const fur = skin, face = P.face || 0x8aa0b0;
      R.box('head', 0, S * 0.5, 0, S, S * 0.95, S, fur);
      R.box('head', 0, S * 0.42, S * 0.49, S * 0.66, S * 0.58, 0.03, face);
      for (const s of [-1, 1]) { R.box('head', s * S * 0.16, S * 0.56, S * 0.51, S * 0.12, S * 0.1, 0.02, 0x101828); R.box('head', s * S * 0.18, S * 0.66, S * 0.52, S * 0.22, S * 0.06, 0.03, shade(fur, 0.85)); R.box('head', s * S * 0.2, S * 0.12, S * 0.53, 0.04, 0.08, 0.03, 0xf8f8f0); }
      R.box('head', 0, S * 0.22, S * 0.515, S * 0.36, S * 0.08, 0.02, 0x301018);
      R.box('head', 0, S * 1.0, 0, S * 0.8, S * 0.12, S * 0.8, shade(fur, 1.05));
      for (let i = 0; i < 6; i++) R.box('head', (i - 2.5) * S * 0.17, S * 0.98, S * 0.36, S * 0.12, S * 0.14, S * 0.12, shade(fur, 0.95));
      return;
    }
    // --- regular face
    R.box('head', 0, S * 0.5, 0, S, S, S, skin);
    if (P.jaw) R.box('head', 0, S * 0.12, S * 0.06, S * 1.04, S * 0.3, S * 0.96, shade(skin, 0.97));
    const ew = S * (P.eyeW || 0.2), ey = S * (P.eyeY || 0.5), ex = S * (P.eyeX || 0.21);
    for (const s of [-1, 1]) {
      R.box('head', s * ex, ey, f, ew, S * 0.12, 0.012, P.eyeWhite != null ? P.eyeWhite : 0xf4f0ea, { noAO: true });
      R.box('head', s * (ex - ew * 0.2), ey - S * 0.01, f + 0.006, ew * 0.5, S * 0.1, 0.012, P.eyes || 0x3a2a1a, { noAO: true, glow: !!P.eyeGlow });
      R.box('head', s * (ex - ew * 0.3), ey + S * 0.02, f + 0.011, ew * 0.16, S * 0.035, 0.006, 0xffffff, { noAO: true, glow: true }); // catch-light
      R.box('head', s * ex, ey + S * 0.13, f + 0.003, ew * 1.25, S * (P.heavyBrow ? 0.09 : 0.05), P.heavyBrow ? 0.06 : 0.02, P.brow != null ? P.brow : shade(hair || skin, 0.8), { r: [0, 0, s * (P.angryBrow ? 0.3 : 0.08)] });
      if (P.blush) R.box('head', s * S * 0.3, S * 0.3, f, S * 0.14, S * 0.07, 0.01, P.blush, { noAO: true });
      if (P.tusks) R.box('head', s * S * 0.2, S * 0.2, f + 0.02, 0.05, S * 0.22, 0.05, 0xf0e8d0);
      if (P.warpaint) R.box('head', s * ex, S * 0.36, f + 0.001, S * 0.06, S * 0.2, 0.01, P.warpaint, { noAO: true });
    }
    const nw = S * (P.bigNose ? 0.2 : 0.12), nh = S * (P.bigNose ? 0.22 : 0.15);
    R.box('head', 0, S * 0.37, f + (P.bigNose ? 0.035 : 0.02), nw, nh, P.bigNose ? 0.07 : 0.045, shade(skin, P.bigNose ? 1.02 : 0.95));
    if (P.snoutNose) R.box('head', 0, S * 0.36, f + 0.06, S * 0.3, S * 0.16, 0.08, shade(skin, 0.9));
    R.box('head', 0, S * 0.2, f, S * (P.wideMouth ? 0.44 : 0.3), S * 0.05, 0.012, P.mouth || 0x6a2a24, { noAO: true });
    if (P.ears) {
      for (const s of [-1, 1]) {
        if (P.ears === 'pointy') R.box('head', s * (S * 0.5 + 0.04), S * 0.6, -S * 0.05, 0.05, S * 0.18, S * 0.12, skin, { r: [0.35, 0, s * -0.9] });
        else if (P.ears === 'big') R.box('head', s * (S * 0.5 + 0.05), S * 0.52, 0, 0.07, S * 0.3, S * 0.22, shade(skin, 0.95));
        else if (P.ears === 'gnome') R.box('head', s * (S * 0.5 + 0.04), S * 0.56, -S * 0.02, 0.05, S * 0.22, S * 0.16, skin, { r: [0.2, 0, s * -0.5] });
        else R.box('head', s * (S * 0.5 + 0.02), S * 0.47, 0, 0.04, S * 0.18, S * 0.12, shade(skin, 0.95));
      }
    }
    // hair
    const hs = P.hairStyle || 'short';
    if (hair != null && hs !== 'bald' && !P.hood) {
      R.box('head', 0, S * 1.03, -S * 0.02, S * 1.06, S * 0.12, S * 1.06, hair);
      R.box('head', 0, S * 0.7, -S * 0.52, S * 1.06, S * 0.62, 0.08, hair);
      for (const s of [-1, 1]) R.box('head', s * S * 0.52, S * 0.78, -S * 0.12, 0.05, S * 0.44, S * 0.8, hair);
      R.box('head', -S * 0.22, S * 0.9, S * 0.5, S * 0.52, S * 0.14, 0.05, hair); // fringe
      R.box('head', S * 0.28, S * 0.94, S * 0.5, S * 0.4, S * 0.07, 0.05, shade(hair, 0.9));
      if (hs === 'long') { R.box('head', 0, S * 0.15, -S * 0.54, S * 1.0, S * 0.8, 0.09, hair); for (const s of [-1, 1]) R.box('head', s * S * 0.53, S * 0.25, -S * 0.1, 0.06, S * 0.5, S * 0.6, shade(hair, 0.95)); }
      if (hs === 'braids') for (const s of [-1, 1]) for (let i = 0; i < 4; i++) R.box('head', s * S * 0.44, S * (0.35 - i * 0.2), -S * 0.25, S * 0.15, S * 0.18, S * 0.15, i % 2 ? shade(hair, 0.85) : hair);
      if (hs === 'topknot') { R.box('head', 0, S * 1.18, -S * 0.1, S * 0.24, S * 0.22, S * 0.24, hair); R.box('head', 0, S * 1.07, -S * 0.1, S * 0.28, 0.04, S * 0.28, 0xa04030); }
      if (hs === 'bun') R.box('head', 0, S * 0.85, -S * 0.66, S * 0.34, S * 0.34, S * 0.24, hair);
      if (hs === 'wild') { const r = R.r; for (let i = 0; i < 8; i++) R.box('head', (r() - 0.5) * S, S * (1.02 + r() * 0.15), (r() - 0.5) * S, S * 0.2, S * 0.2, S * 0.2, shade(hair, 0.85 + r() * 0.3)); }
      if (hs === 'tufts') for (const s of [-1, 1]) R.box('head', s * S * 0.56, S * 0.72, -S * 0.1, S * 0.18, S * 0.3, S * 0.4, hair);
      if (hs === 'mohawk') for (let i = 0; i < 5; i++) R.box('head', 0, S * 1.14, S * (0.35 - i * 0.2), S * 0.12, S * 0.22, S * 0.18, hair);
    }
    if (P.beard) {
      const bc = P.beardColor || hair || 0x5a3a20, bl = P.beard === 'long' ? 1 : 0.45, jz = P.jaw ? S * 0.06 : 0; // sit in front of a heavy jaw
      R.box('head', 0, S * 0.12, S * 0.46 + jz, S * 0.9 + jz, S * 0.3, S * 0.14, bc);
      for (const s of [-1, 1]) R.box('head', s * S * 0.46, S * 0.3, S * 0.22, S * 0.1, S * 0.45, S * 0.5, bc);
      R.box('head', 0, S * 0.26, f + 0.012 + jz, S * 0.46, S * 0.08, 0.03, shade(bc, 1.1)); // moustache
      R.box('head', 0, -S * 0.12 * bl - 0.02, S * 0.42 + jz, S * 0.7, S * 0.42 * bl, S * 0.14, bc);
      if (P.beard === 'long') { R.box('head', 0, -S * 0.52, S * 0.4 + jz, S * 0.44, S * 0.32, S * 0.12, shade(bc, 0.92)); R.box('head', 0, -S * 0.33, S * 0.48 + jz, S * 0.14, 0.04, 0.04, P.beadColor || 0xd8b050); }
    }
    if (P.hood) {
      const hc = P.hood;
      R.box('head', 0, S * 1.04, -S * 0.04, S * 1.14, S * 0.14, S * 1.14, hc);
      R.box('head', 0, S * 0.55, -S * 0.56, S * 1.14, S * 1.0, 0.08, hc);
      for (const s of [-1, 1]) R.box('head', s * S * 0.56, S * 0.55, -S * 0.02, 0.07, S * 1.0, S * 1.1, shade(hc, 0.9));
      R.box('head', 0, S * 1.12, -S * 0.4, S * 0.4, S * 0.18, S * 0.4, shade(hc, 0.9));
    }
    if (P.fezHat) { R.box('head', 0, S * 1.12, 0, S * 0.6, S * 0.26, S * 0.6, P.fezHat); R.box('head', S * 0.2, S * 1.12, S * 0.25, 0.04, S * 0.3, 0.04, 0xe8c040); }
    if (P.furHat) { R.box('head', 0, S * 1.08, 0, S * 1.12, S * 0.26, S * 1.12, P.furHat); R.box('head', 0, S * 1.26, 0, S * 0.8, S * 0.12, S * 0.8, shade(P.furHat, 0.9)); }
    if (P.feathers) for (let i = 0; i < 3; i++) R.box('head', (i - 1) * S * 0.2, S * 1.25, -S * 0.35, 0.05, S * 0.45, 0.03, P.feathers[i % P.feathers.length], { r: [-0.3, 0, (i - 1) * 0.3] });
    if (P.headband) R.box('head', 0, S * 0.84, 0, S * 1.05, S * 0.08, S * 1.05, P.headband);
    if (P.crown) for (let i = 0; i < 5; i++) R.box('head', (i - 2) * S * 0.24, S * 1.14, S * 0.45, 0.06, 0.12, 0.04, P.crown);
  }

  // ---------------------------------------------------------------- beasts
  function quad(P) {
    const key = 'Q|' + JSON.stringify(P);
    return template(key, () => {
      const R = new Rig(key, 1.0), c = P.color, dk = shade(c, 0.72), belly = P.belly || shade(c, 1.15);
      const BL = P.bodyLen || 1.0, BW = P.bodyW || 0.5, BH = P.bodyH || 0.44, LL = P.legLen || 0.46, by = LL + BH * 0.35;
      R.bone('body', null, 0, by, 0);
      R.bone('chest', 'body', 0, 0, BL * 0.25);
      R.bone('head', 'chest', 0, BH * 0.3, BL * 0.3);
      R.bone('jaw', 'head', 0, -0.07, 0.12);
      const legs = [['legFL', -1, 1], ['legFR', 1, 1], ['legBL', -1, -1], ['legBR', 1, -1]];
      for (const [n, sx, sz] of legs) {
        R.bone(n, sz > 0 ? 'chest' : 'body', sx * BW * 0.34, -BH * 0.2, sz > 0 ? BL * 0.12 : -BL * 0.36);
        R.bone(n + '2', n, 0, -LL * 0.5, 0);
      }
      R.bone('tail', 'body', 0, BH * 0.15, -BL * 0.5);
      R.bone('tail2', 'tail', 0, 0, -(P.tailLen || 0.4));
      // torso: back half + chest, belly, back ridge
      R.box('body', 0, 0, -BL * 0.2, BW * 0.92, BH * 0.92, BL * 0.62, c);
      R.box('body', 0, -BH * 0.42, -BL * 0.2, BW * 0.72, 0.06, BL * 0.5, belly);
      R.box('chest', 0, 0.02, 0.02, BW, BH * 1.02, BL * 0.45, c);
      R.box('chest', 0, -BH * 0.4, 0.05, BW * 0.7, 0.08, BL * 0.35, belly);
      if (P.ruff) { R.box('chest', 0, BH * 0.1, 0.05, BW * 1.18, BH * 1.12, BL * 0.3, P.ruff); R.box('chest', 0, -BH * 0.35, 0.18, BW * 0.7, 0.2, 0.2, P.ruff); }
      if (P.ridge) for (let i = 0; i < 5; i++) R.box(i < 2 ? 'chest' : 'body', 0, BH * 0.52, (i < 2 ? 0.1 - i * 0.18 : -BL * 0.05 - (i - 2) * BL * 0.16), 0.08, 0.06, 0.12, P.ridge);
      if (P.stripes) for (let i = 0; i < 4; i++) R.box('body', 0, BH * 0.1, -BL * 0.05 - i * BL * 0.13, BW * 0.95, BH * 0.4, 0.04, P.stripes);
      if (P.ribs) for (let i = 0; i < 3; i++) R.box('body', 0, -BH * 0.1, -BL * 0.1 - i * 0.1, BW * 0.95, 0.03, 0.03, shade(c, 0.8));
      // head
      const HS = P.headS || 0.34, sl = P.snoutLen || 0.26;
      R.box('head', 0, 0.02, 0.04, HS * 1.05, HS, HS * 0.95, c);
      R.box('head', 0, -0.02, HS * 0.45 + sl * 0.5, HS * 0.58, HS * 0.46, sl, shade(c, 1.05));
      R.box('head', 0, 0.06, HS * 0.45 + sl * 0.95, HS * 0.26, HS * 0.18, 0.05, P.nose || 0x1a1414);
      R.box('head', 0, HS * 0.25, HS * 0.45 + sl * 0.3, HS * 0.5, 0.04, sl * 0.6, dk);
      for (const s of [-1, 1]) {
        R.box('head', s * HS * 0.28, HS * 0.2, HS * 0.49, HS * 0.2, HS * 0.14, 0.03, P.eye || 0xe8c040, { glow: !!P.eyeGlow });
        R.box('head', s * HS * 0.3, HS * 0.2, HS * 0.505, HS * 0.08, HS * 0.12, 0.02, 0x0a0806);
        if (P.ears === 'round') { R.box('head', s * HS * 0.42, HS * 0.58, -0.02, HS * 0.36, HS * 0.36, 0.04, shade(c, 0.9)); R.box('head', s * HS * 0.42, HS * 0.58, 0.005, HS * 0.22, HS * 0.22, 0.02, 0xd09090); }
        else { R.box('head', s * HS * 0.3, HS * 0.62, -HS * 0.1, HS * 0.22, HS * 0.4, HS * 0.14, dk, { r: [0, 0, s * -0.2] }); R.box('head', s * HS * 0.3, HS * 0.6, -HS * 0.02, HS * 0.12, HS * 0.26, 0.02, 0xc8a0a0, { r: [0, 0, s * -0.2] }); }
        if (P.whiskers) for (let k = 0; k < 2; k++) R.box('head', s * (HS * 0.4), -0.01 + k * 0.03, HS * 0.45 + sl * 0.8, HS * 0.6, 0.008, 0.008, 0xe8e0d0, { r: [0, s * 0.3, 0] });
        if (P.fangs) R.box('head', s * HS * 0.16, -HS * 0.25, HS * 0.45 + sl * 0.85, 0.025, 0.06, 0.025, 0xf4f0e0);
      }
      R.box('jaw', 0, -0.03, HS * 0.25 + sl * 0.35, HS * 0.5, HS * 0.16, sl * 0.9, dk);
      R.box('jaw', 0, 0.01, HS * 0.25 + sl * 0.35, HS * 0.4, 0.02, sl * 0.8, 0x802830);
      if (P.teeth) R.box('head', 0, -HS * 0.23, HS * 0.45 + sl * 0.95, HS * 0.2, 0.06, 0.03, 0xf8f4e8);
      // legs
      const LW = P.legW || 0.13;
      for (const [n, sx, sz] of legs) {
        const lc = sz > 0 ? c : shade(c, 0.95);
        R.box(n, 0, -LL * 0.2, 0, LW * (sz < 0 ? 1.35 : 1.15), LL * 0.62, LW * (sz < 0 ? 1.5 : 1.2), lc);
        R.box(n + '2', 0, -LL * 0.24, 0, LW * 0.8, LL * 0.5, LW * 0.8, dk);
        R.box(n + '2', 0, -LL * 0.5 + 0.03, 0.03, LW * 1.02, 0.06, LW * 1.4, P.paw || shade(c, 0.6));
        if (P.claws) for (const k of [-1, 1]) R.box(n + '2', k * LW * 0.28, -LL * 0.5 + 0.02, LW * 0.8, 0.02, 0.03, 0.05, 0xe8e0d0);
      }
      const TL = P.tailLen || 0.4, TW = P.tailW || 0.08;
      R.box('tail', 0, 0, -TL * 0.5, TW, TW, TL, P.tailColor || c);
      R.box('tail2', 0, 0, -TL * 0.45, TW * (P.bushy ? 1.4 : 0.7), TW * (P.bushy ? 1.4 : 0.7), TL * 0.9, P.tailColor || (P.bushy ? shade(c, 1.1) : dk));
      if (P.bushy) R.box('tail2', 0, 0, -TL * 0.9, TW * 1.1, TW * 1.1, TL * 0.3, P.tailTip || 0xf0f0f0);
      return finish(R, { rig: 'quad', dims: { BL, BW, BH, LL, HS } });
    });
  }
  function insect(P) {
    const key = 'I|' + JSON.stringify(P);
    return template(key, () => {
      const R = new Rig(key, 0.8), c = P.color, dk = shade(c, 0.55), sh = P.shell || shade(c, 1.15);
      R.bone('body', null, 0, 0.36, -0.05);
      R.bone('head', 'body', 0, 0.02, 0.42);
      R.bone('mandL', 'head', -0.09, -0.05, 0.2); R.bone('mandR', 'head', 0.09, -0.05, 0.2);
      R.box('body', 0, 0.02, -0.12, 0.62, 0.36, 0.7, sh);
      R.box('body', 0, 0.2, -0.12, 0.5, 0.08, 0.62, shade(sh, 1.12));
      R.box('body', 0, 0.22, -0.12, 0.03, 0.05, 0.66, 0x1a0a06); // wing-case seam
      for (let i = 0; i < 3; i++) R.box('body', 0, -0.16, 0.12 - i * 0.2, 0.5, 0.05, 0.14, dk);
      R.box('body', 0, 0, 0.26, 0.46, 0.3, 0.2, c);
      for (const s of [-1, 1]) { R.box('body', s * 0.18, 0.18, -0.1, 0.14, 0.03, 0.2, shade(sh, 1.3)); R.box('body', s * 0.2, 0.1, -0.42, 0.1, 0.08, 0.08, P.gland || 0xffa030, { glow: true }); }
      R.box('head', 0, 0, 0.08, 0.34, 0.24, 0.24, dk);
      for (const s of [-1, 1]) {
        R.box('head', s * 0.14, 0.06, 0.16, 0.08, 0.08, 0.08, P.eye || 0xff4020, { glow: true });
        R.box('head', s * 0.07, 0.12, 0.2, 0.02, 0.02, 0.26, dk, { r: [-0.6, s * 0.4, 0] });
        R.box(s < 0 ? 'mandL' : 'mandR', 0, 0, 0.06, 0.05, 0.05, 0.14, 0x2a1a10, { r: [0, -s * 0.5, 0] });
      }
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        const n = 'leg' + i + (s < 0 ? 'L' : 'R');
        R.bone(n, 'body', s * 0.28, -0.08, 0.2 - i * 0.24, [0, 0, s * -0.9]);
        R.bone(n + '2', n, s * 0.22, 0, 0, [0, 0, s * 1.6]);
        R.box(n, s * 0.11, 0, 0, 0.24, 0.06, 0.06, dk);
        R.box(n + '2', s * 0.12, 0, 0, 0.26, 0.045, 0.045, dk);
      }
      return finish(R, { rig: 'insect' });
    });
  }
  function snake(P) {
    const key = 'S|' + JSON.stringify(P);
    return template(key, () => {
      const R = new Rig(key, 0.4), c = P.color, belly = P.belly || mix(c, 0xe8e0a0, 0.5), band = P.band || shade(c, 0.65), N = 9, seg = 0.16;
      let prev = null;
      for (let i = 0; i < N; i++) {
        const n = 'seg' + i, w = 0.22 * (1 - Math.pow(i / N, 1.6) * 0.7) + 0.02;
        R.bone(n, prev, 0, i === 0 ? 0.11 : 0, i === 0 ? 0.35 : -seg);
        R.box(n, 0, 0, -seg / 2, w, w * 0.78, seg + 0.02, i % 3 === 1 ? band : c);
        R.box(n, 0, -w * 0.36, -seg / 2, w * 0.8, 0.02, seg, belly);
        if (i % 2 === 0) R.box(n, 0, w * 0.4, -seg / 2, w * 0.45, 0.02, seg * 0.5, P.pattern || shade(c, 1.2));
        prev = n;
      }
      R.bone('neck', null, 0, 0.11, 0.35);
      R.bone('head', 'neck', 0, 0.02, 0.1);
      R.bone('jaw', 'head', 0, -0.05, 0.02);
      R.box('neck', 0, 0, 0.04, 0.2, 0.16, 0.16, c);
      R.box('head', 0, 0.02, 0.1, 0.26, 0.12, 0.24, shade(c, 1.08));
      R.box('head', 0, 0.04, 0.24, 0.18, 0.08, 0.1, shade(c, 1.12));
      for (const s of [-1, 1]) { R.box('head', s * 0.1, 0.07, 0.15, 0.06, 0.05, 0.06, 0xffe020, { glow: true }); R.box('head', s * 0.12, 0.07, 0.155, 0.02, 0.045, 0.05, 0x101008); R.box('head', s * 0.05, 0.06, 0.29, 0.02, 0.02, 0.01, 0x101008); }
      R.box('jaw', 0, -0.01, 0.12, 0.22, 0.04, 0.22, belly);
      R.box('jaw', 0, -0.015, 0.3, 0.02, 0.01, 0.14, 0xd02040); // tongue
      return finish(R, { rig: 'snake', N });
    });
  }

  // ---------------------------------------------------------------- gear
  const METAL = { rusty: 0x8a6a50, bronze: 0xc08a4a, steel: 0xc8ccd4, bone: 0xe0d8c0, ice: 0xa8e0ff, soul: 0x50e090, dark: 0x505060 };
  function gearTpl(kind, o) {
    const key = 'G|' + kind + '|' + JSON.stringify(o);
    return template(key, () => {
      const R = new Rig(key, 2); R.bone('g', null, 0, 0, 0);
      const m = o.metal || METAL.steel, grip = o.grip || 0x4a2e1a, gold = 0xd8b050, glow = o.glow;
      const blade = (len, w, th) => {
        R.box('g', 0, 0.12 + len / 2, 0, w, len, th, m);
        R.box('g', 0, 0.12 + len / 2, th * 0.5 + 0.004, w * 0.25, len * 0.92, 0.008, shade(m, 1.25)); // fuller highlight
        R.box('g', 0, 0.12 + len + 0.03, 0, w * 0.6, 0.06, th, m);
        R.box('g', 0, 0.12 + len + 0.07, 0, w * 0.25, 0.04, th, m);
        if (glow) R.box('g', 0, 0.12 + len / 2, 0, w * 0.3, len * 0.8, th * 1.3, glow, { glow: true });
      };
      switch (kind) {
        case 'dagger': R.box('g', 0, 0, 0, 0.05, 0.14, 0.05, grip); R.box('g', 0, 0.08, 0, 0.14, 0.03, 0.05, o.guard || gold); blade(0.26, 0.06, 0.02); break;
        case 'sword': R.box('g', 0, -0.02, 0, 0.05, 0.2, 0.05, grip); R.box('g', 0, -0.13, 0, 0.07, 0.05, 0.07, gold); R.box('g', 0, 0.09, 0, 0.26, 0.04, 0.06, o.guard || gold); blade(0.62, 0.075, 0.025); break;
        case 'longsword': R.box('g', 0, -0.04, 0, 0.05, 0.26, 0.05, grip); R.box('g', 0, -0.18, 0, 0.08, 0.06, 0.08, gold); R.box('g', 0, 0.1, 0, 0.32, 0.05, 0.07, o.guard || gold); blade(0.82, 0.09, 0.028); break;
        case 'greatsword': R.box('g', 0, -0.1, 0, 0.06, 0.4, 0.06, grip); R.box('g', 0, -0.32, 0, 0.1, 0.08, 0.1, o.guard || gold); R.box('g', 0, 0.12, 0, 0.44, 0.07, 0.09, o.guard || gold); blade(1.15, 0.13, 0.035); break;
        case 'mace':
          R.box('g', 0, 0.2, 0, 0.05, 0.62, 0.05, grip); R.box('g', 0, 0.56, 0, 0.17, 0.17, 0.17, m);
          for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) R.box('g', x * 0.1, 0.56, z * 0.1, x ? 0.05 : 0.1, 0.12, z ? 0.05 : 0.1, shade(m, 0.85));
          R.box('g', 0, 0.67, 0, 0.05, 0.06, 0.05, shade(m, 1.1)); break;
        case 'club': R.box('g', 0, 0.2, 0, 0.07, 0.5, 0.07, o.wood || 0x6a4a2a); R.box('g', 0, 0.52, 0, 0.14, 0.26, 0.14, o.wood || 0x7a5632); R.box('g', 0.06, 0.58, 0.02, 0.03, 0.05, 0.03, 0xd8d0c0); R.box('g', -0.05, 0.5, -0.05, 0.03, 0.05, 0.03, 0xd8d0c0); break;
        case 'axe': R.box('g', 0, 0.25, 0, 0.05, 0.75, 0.05, grip); R.box('g', 0, 0.54, 0.13, 0.03, 0.24, 0.2, m); R.box('g', 0, 0.54, 0.25, 0.035, 0.3, 0.05, shade(m, 1.2)); R.box('g', 0, 0.54, -0.05, 0.05, 0.1, 0.08, shade(m, 0.8)); break;
        case 'staff':
          R.box('g', 0, 0.35, 0, 0.055, 1.7, 0.055, o.wood || 0x7a5a36);
          for (let i = 0; i < 3; i++) R.box('g', 0, -0.2 + i * 0.5, 0, 0.07, 0.04, 0.07, shade(o.wood || 0x7a5a36, 0.75));
          R.box('g', 0, 1.22, 0, 0.12, 0.08, 0.12, o.wood || 0x7a5a36); R.box('g', 0, 1.3, 0, 0.1, 0.1, 0.1, o.orb || 0x80b0ff, { glow: true });
          for (const s of [-1, 1]) R.box('g', s * 0.07, 1.32, 0, 0.03, 0.14, 0.03, o.wood || 0x7a5a36); break;
        case 'totem':
          R.box('g', 0, 0.28, 0, 0.05, 0.9, 0.05, 0x6a4a2a); R.box('g', 0, 0.78, 0, 0.14, 0.18, 0.14, 0xe0d8c0);
          R.box('g', 0, 0.78, 0.075, 0.1, 0.03, 0.01, 0x202020); R.box('g', 0, 0.8, 0.08, 0.06, 0.04, 0.01, o.orb || 0x80c0ff, { glow: true });
          for (const s of [-1, 1]) R.box('g', s * 0.1, 0.62, 0, 0.02, 0.16, 0.04, [0xc04030, 0x3080c0][(s + 1) / 2]); break;
        case 'bow':
          R.box('g', 0, 0, 0, 0.05, 0.16, 0.06, grip);
          for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) R.box('g', 0, s * (0.08 + i * 0.12), -0.02 - i * i * 0.012, 0.035, 0.14, 0.04, o.wood || 0x8a6a3a);
          R.box('g', 0, 0, -0.24, 0.006, 1.1, 0.006, 0xe8e0d0); break;
        case 'spear': R.box('g', 0, 0.35, 0, 0.045, 1.6, 0.045, 0x6a4a2a); R.box('g', 0, 1.24, 0, 0.07, 0.22, 0.02, m); R.box('g', 0, 1.1, 0, 0.08, 0.04, 0.05, 0xa04030); break;
        case 'shield_wood':
          R.box('g', 0, 0, 0, 0.05, 0.56, 0.5, 0x8a5a32); for (let i = -1; i <= 1; i++) R.box('g', -0.028, 0, i * 0.16, 0.01, 0.54, 0.02, 0x5a3a20);
          R.box('g', -0.03, 0, 0, 0.02, 0.58, 0.04, 0x707070); R.box('g', -0.03, 0, 0, 0.02, 0.04, 0.52, 0x707070); R.box('g', -0.045, 0, 0, 0.03, 0.1, 0.1, 0xa0a0a8); break;
        case 'shield_bone':
          R.box('g', 0, 0, 0, 0.05, 0.6, 0.48, 0xd8d0b0); R.box('g', -0.03, 0.05, 0, 0.02, 0.2, 0.2, 0xeae4cc);
          for (const s of [-1, 1]) R.box('g', -0.03, 0.08, s * 0.05, 0.02, 0.05, 0.05, 0x201810); R.box('g', -0.03, -0.18, 0, 0.02, 0.06, 0.36, 0xb8b090); break;
        case 'shield_crest':
          R.box('g', 0, 0.02, 0, 0.05, 0.6, 0.48, o.color || 0x3050a0); R.box('g', 0, -0.32, 0, 0.05, 0.1, 0.3, o.color || 0x3050a0);
          R.box('g', -0.03, 0.02, 0, 0.015, 0.62, 0.06, gold); R.box('g', -0.03, 0.1, 0, 0.015, 0.06, 0.4, gold); R.box('g', -0.035, 0.1, 0, 0.02, 0.12, 0.12, o.emblem || 0xe8e0d0); break;
        case 'cloak': {
          const w = o.w, L = o.len, c = o.color;
          R.box('g', 0, -L / 2, -0.02, w, L, 0.035, c); R.box('g', 0, -L + 0.03, -0.022, w * 1.02, 0.06, 0.04, shade(c, 0.75));
          R.box('g', 0, -0.03, 0.02, w * 1.08, 0.08, 0.1, o.collar || shade(c, 1.2));
          if (o.fur) for (let i = 0; i < 5; i++) R.box('g', (i - 2) * w * 0.22, -0.02, 0.03, w * 0.2, 0.12, 0.14, o.fur);
          break; }
        default: { // helms: o.S = head size
          const S = o.S, c = o.color || m;
          if (kind === 'helm_cap') { R.box('g', 0, S * 0.9, 0, S * 1.08, S * 0.28, S * 1.08, c); R.box('g', 0, S * 1.08, -S * 0.1, S * 0.8, S * 0.12, S * 0.8, shade(c, 1.1)); R.box('g', 0, S * 0.76, 0, S * 1.12, S * 0.06, S * 1.12, shade(c, 0.8)); }
          else if (kind === 'helm_bone') { R.box('g', 0, S * 0.88, 0, S * 1.1, S * 0.34, S * 1.1, 0xd8d0b0); for (let i = 0; i < 4; i++) R.box('g', 0, S * (1.1 + (i === 1 || i === 2 ? 0.1 : 0.04)), S * (0.36 - i * 0.24), 0.05, S * 0.26, S * 0.2, 0xeae4cc); for (const s of [-1, 1]) R.box('g', s * S * 0.5, S * 0.6, S * 0.2, 0.05, S * 0.34, S * 0.2, 0xc8c0a0); }
          else if (kind === 'helm_giant') { R.box('g', 0, S * 0.88, 0, S * 1.12, S * 0.36, S * 1.12, 0xe0e4e8); R.box('g', 0, S * 0.72, S * 0.5, S * 0.9, S * 0.06, 0.06, 0x303840); for (const s of [-1, 1]) R.box('g', s * S * 0.62, S * 1.0, 0, S * 0.16, S * 0.16, S * 0.3, 0xc8ccd0, { r: [0, 0, s * 0.6] }); }
          else if (kind === 'helm_horned') { R.box('g', 0, S * 0.86, 0, S * 1.1, S * 0.34, S * 1.1, c); R.box('g', 0, S * 0.6, S * 0.52, S * 0.1, S * 0.4, 0.04, c); for (const s of [-1, 1]) { R.box('g', s * S * 0.62, S * 1.0, 0, S * 0.26, S * 0.12, S * 0.12, 0xe8e0d0); R.box('g', s * S * 0.78, S * 1.18, 0, S * 0.1, S * 0.3, S * 0.1, 0xe8e0d0, { r: [0, 0, -s * 0.3] }); } }
          else if (kind === 'helm_crest') { R.box('g', 0, S * 0.86, 0, S * 1.1, S * 0.36, S * 1.1, c); for (let i = 0; i < 4; i++) R.box('g', 0, S * 1.12, S * (0.3 - i * 0.22), 0.06, S * 0.2, S * 0.2, o.plume || 0xc03030); for (const s of [-1, 1]) R.box('g', s * S * 0.54, S * 0.5, S * 0.1, 0.05, S * 0.5, S * 0.5, c); }
          else { R.box('g', 0, S * 0.86, 0, S * 1.1, S * 0.36, S * 1.1, c); R.box('g', 0, S * 0.58, S * 0.53, S * 0.08, S * 0.34, 0.04, c); for (const s of [-1, 1]) R.box('g', s * S * 0.54, S * 0.52, 0, 0.05, S * 0.42, S * 1.0, shade(c, 0.9)); R.box('g', 0, S * 1.06, 0, 0.06, S * 0.08, S * 1.12, shade(c, 1.2)); }
        }
      }
      return finish(R, { rig: 'gear' });
    });
  }
  function gearMesh(kind, o) { const g = new THREE.Group(), parts = {}; instantiate(gearTpl(kind, o), g, parts); g.userData.kind = kind; return g; }

  function weaponKind(id) {
    if (!id) return null;
    const it = ITEMS[id]; if (!it) return 'sword';
    if (/greatsword/.test(id)) return 'greatsword';
    if (/long_sword|warblade|soulblade|grimbone_blade/.test(id)) return 'longsword';
    if (/staff/.test(id)) return 'staff';
    if (/club/.test(id)) return 'club';
    if (/axe/.test(id)) return 'axe';
    if (/bow/.test(id)) return 'bow';
    if (/spear/.test(id)) return 'spear';
    if (it.verb === 'pierce') return 'dagger';
    if (it.verb === 'crush') return 'mace';
    return 'sword';
  }
  function metalOf(id) {
    if (!id) return METAL.steel;
    if (/rusty/.test(id)) return METAL.rusty; if (/bronze/.test(id)) return METAL.bronze; if (/bone/.test(id)) return METAL.bone;
    if (/icicle|frost/.test(id)) return METAL.ice; if (/grimbone/.test(id)) return METAL.dark; return METAL.steel;
  }
  function weaponGlow(id) { return /frost_greatsword|icicle/.test(id || '') ? 0x9ef0ff : /grimbone/.test(id || '') ? 0x55ff99 : null; }
  function chestTier(id, clsColor) {
    if (!id) return { tier: 'cloth', color: clsColor };
    if (/robe/.test(id)) return { tier: 'robe', color: clsColor };
    if (/chain/.test(id)) return { tier: 'chain' };
    if (/plate|breastplate/.test(id)) return { tier: 'plate' };
    if (/leather|tunic|hide/.test(id)) return { tier: 'leather' };
    if (/bone/.test(id)) return { tier: 'bone' };
    return { tier: 'cloth', color: clsColor };
  }
  function helmKind(id) { if (!id) return null; if (/bone/.test(id)) return 'helm_bone'; if (/giant/.test(id)) return 'helm_giant'; if (/cloth|cap/.test(id)) return 'helm_cap'; return 'helm_metal'; }
  const CLOAK = { wolf_cloak: [0x7a7a7a, 0x9a9a9a], yeti_cloak: [0xe8eef4, 0xffffff], hollis_cloak: [0x3a6a3a, 0x8a6a3a] };
  const PANTS = { cloth_pants: 0x6a5a4a, ghoul_leggings: 0x5a7a5a };
  const BOOT = { leather_boots: 0x5a3a22, snow_boots: 0xd8e0e8, gunnar_boots: 0x6a4a2a };
  const GLOVE = { rawhide_gloves: 0x9a7a52, snakeskin_bracer: 0x5a8a3a, militia_bracer: 0x8a6a4a };

  // ---------------------------------------------------------------- looks (player races, classes, mercs, NPCs, mobs)
  const RACE_LOOK = {
    human: { ears: 'round', hairStyle: 'short', eyes: 0x4a3a22 },
    barbarian: { torsoW: 0.6, torsoD: 0.32, shoulderW: 0.38, armW: 0.18, legW: 0.22, hipW: 0.14, hairStyle: 'braids', beard: 'short', ears: 'round', eyes: 0x3a6aa0, warpaint: 0x3050a0, jaw: true },
    woodelf: { torsoW: 0.44, torsoD: 0.25, shoulderW: 0.29, armW: 0.14, legW: 0.18, legLen: 0.86, headS: 0.4, hipW: 0.11, ears: 'pointy', hairStyle: 'long', eyes: 0x3a8a3a, eyeW: 0.22 },
    darkelf: { torsoW: 0.44, torsoD: 0.25, shoulderW: 0.29, armW: 0.14, legW: 0.18, legLen: 0.86, headS: 0.4, hipW: 0.11, ears: 'pointy', hairStyle: 'long', eyes: 0xff3030, eyeWhite: 0xd8d0e8, brow: 0xe8e8f0, angryBrow: true, mouth: 0x3a2a4a },
    dwarf: { legLen: 0.6, torsoLen: 0.66, torsoW: 0.62, torsoD: 0.36, shoulderW: 0.37, armW: 0.18, armLen: 0.62, legW: 0.23, hipW: 0.15, headS: 0.5, beard: 'long', bigNose: true, ears: 'round', hairStyle: 'short', eyes: 0x3a2a1a, heavyBrow: true },
    gnome: { legLen: 0.58, torsoLen: 0.52, torsoW: 0.46, torsoD: 0.28, shoulderW: 0.29, armW: 0.14, armLen: 0.56, legW: 0.18, headS: 0.56, ears: 'gnome', hairStyle: 'tufts', bigNose: true, blush: 0xe89080, eyes: 0x3a5aa0, eyeW: 0.22, bigFeet: true },
    ogre: { legLen: 0.72, torsoLen: 0.74, torsoW: 0.72, torsoD: 0.44, shoulderW: 0.46, armW: 0.23, armLen: 0.84, legW: 0.27, hipW: 0.17, headS: 0.44, hunch: 0.22, jaw: true, tusks: true, heavyBrow: true, ears: 'big', hairStyle: 'topknot', wideMouth: true, eyes: 0x2a1a0a, eyeW: 0.16, snoutNose: true, mouth: 0x3a1a14 },
  };
  function outfit(P, tier, color) {
    const T = tier === 'robe' ? TIERS.cloth(color) : (TIERS[tier] || TIERS.cloth)(color);
    P.tier = tier; P.shirt = T.shirt; P.shirtLow = T.low; P.sleeve = T.sleeve; P.trim = T.trim;
    if (tier === 'robe') { P.robe = true; P.longSleeve = true; P.cuff = T.trim; }
    if (tier === 'chain' || tier === 'plate') P.pauldron = tier === 'plate' ? shade(T.shirt, 1.05) : 0x8a9098;
    if (tier === 'plate') { P.gloves = P.gloves || 0xa8aeb8; P.boots = P.boots || 0x9aa0aa; P.kneePad = 0xc0c6d0; }
    return P;
  }
  function playerOpts(o) {
    const race = RACES[o.race] ? o.race : 'human', r = RACES[race], cls = CLASSES[o.cls] ? o.cls : 'warrior', cc = CLASSES[cls].color, eq = o.equip || {};
    const id = (sl) => (eq[sl] && eq[sl].id) || null;
    const P = Object.assign({}, HUMAN, RACE_LOOK[race], { skin: r.skin, hair: r.hair, belt: 0x3a2616, pants: PANTS[id('legs')] || 0x4a3a2a, feet: 0x3a2a1a });
    if (race === 'barbarian' || race === 'dwarf') P.beardColor = r.hair;
    const ct = chestTier(id('chest'), cls === 'rogue' ? 0x505058 : cc);
    outfit(P, ct.tier, ct.color || cc);
    if (id('feet')) { P.boots = BOOT[id('feet')] || 0x5a3a22; P.bootCuff = id('feet') === 'snow_boots'; }
    if (id('hands')) { if (id('hands') === 'militia_bracer') P.bracer = GLOVE.militia_bracer; else P.gloves = GLOVE[id('hands')] || 0x8a6a4a; }
    if (id('neck')) P.necklace = /tusk/.test(id('neck')) ? 0xf0e8d0 : /bone/.test(id('neck')) ? 0xe0d8c0 : 0xd8b050;
    if (id('neck') === 'fippy_collar') { P.necklace = null; P.collar = 0x3a2a1a; }
    if (cls === 'shaman') P.mantle = 0x8a6a4a;
    if (cls === 'paladin' && ct.tier !== 'robe') { P.tabard = 0xe8e4d8; P.emblem = 0xd8b050; }
    if (cls === 'necromancer') { P.trim = 0x6a2a8a; P.shirtLow = shade(P.shirtLow, 0.8); }
    if (cls === 'enchanter') P.trim = 0xe0a0ff;
    if (cls === 'wizard') P.trim = 0xd8c060;
    if (race === 'ogre' || race === 'barbarian') { P.fur = ct.tier === 'cloth' ? null : null; }
    const gear = {};
    const pw = id('primary');
    if (pw) { const k = weaponKind(pw); gear.weapon = { kind: k, o: { metal: metalOf(pw), glow: weaponGlow(pw), orb: cls === 'necromancer' ? 0x9040ff : cls === 'enchanter' ? 0xe080ff : undefined } }; }
    const sw = id('secondary');
    if (sw) {
      if (/shield/.test(sw)) gear.shield = { kind: /bone/.test(sw) ? 'shield_bone' : /wood/.test(sw) ? 'shield_wood' : 'shield_crest', o: {} };
      else if (/totem/.test(sw)) gear.offhand = { kind: 'totem', o: {} };
      else if (ITEMS[sw] && ITEMS[sw].dmg) gear.offhand = { kind: weaponKind(sw), o: { metal: metalOf(sw) } };
    }
    const hk = helmKind(id('head')); if (hk) gear.helm = { kind: hk, o: { S: P.headS, color: hk === 'helm_cap' ? shade(cc, 0.9) : undefined } };
    const bk = id('back'); if (bk) { const c = CLOAK[bk] || [0x6a4a3a, 0x8a6a4a]; gear.cloak = { color: c[0], fur: bk === 'yeti_cloak' || bk === 'wolf_cloak' ? c[1] : null, collar: c[1] }; }
    if (cls === 'ranger') gear.backBow = true;
    return { rig: 'human', P, gear, scale: r.scale * 0.97, race, cls };
  }
  function mercOpts(role, equip) {
    const eq = equip || {}, id = (sl) => (eq[sl] && eq[sl].id) || null;
    let o;
    if (role === 'tank') {
      o = playerOpts({ race: 'dwarf', cls: 'warrior', equip: eq });
      Object.assign(o.P, { hair: 0x8a3a1a, beardColor: 0x8a3a1a, skin: 0xd8a080, beadColor: 0xd8b050 });
      if (!id('chest')) outfit(o.P, 'chain');
      if (!id('primary')) o.gear.weapon = { kind: 'axe', o: { metal: METAL.steel } };
      if (!id('head')) o.gear.helm = { kind: 'helm_horned', o: { S: o.P.headS, color: 0x9aa0a8 } };
      if (!id('secondary')) o.gear.shield = { kind: 'shield_crest', o: { color: 0x8a2a2a } };
      o.scale = 0.85;
    } else {
      o = playerOpts({ race: 'human', cls: 'cleric', equip: eq });
      Object.assign(o.P, { hair: 0xd8a848, hairStyle: 'bun', skin: 0xe8c0a0, eyes: 0x3a6aa0, brow: 0xb08830 });
      if (!id('chest')) { outfit(o.P, 'robe', 0xeaeaff); o.P.trim = 0xd8b050; o.P.tabard = null; }
      if (!id('primary')) o.gear.weapon = { kind: 'mace', o: { metal: METAL.steel } };
      o.P.necklace = 0xd8b050;
      o.scale = 0.97;
    }
    return o;
  }
  function petOpts(lvl) {
    const P = Object.assign({}, HUMAN, { skeleton: true, skull: true, skin: 0xe8e2c8, torsoW: 0.44, armW: 0.14, eyeGlow: 0x60ff90 }), gear = {};
    if (lvl >= 8) { gear.weapon = { kind: 'sword', o: { metal: METAL.rusty } }; gear.shield = { kind: 'shield_bone', o: {} }; P.rags = 0x4a3a2a; }
    if (lvl >= 13) {
      Object.assign(P, { skin: 0x5a5a6a, eyeGlow: 0xb060ff, cloak: 0x2a1a3a, pauldron: 0x3a3a4a, rags: null });
      gear.weapon = { kind: 'longsword', o: { metal: METAL.dark, glow: 0xb060ff } }; gear.shield = null;
      gear.helm = { kind: 'helm_horned', o: { S: P.headS, color: 0x3a3a4a } };
    }
    return { rig: 'human', P, gear, scale: lvl >= 13 ? 1.1 : 0.95 };
  }
  function npcOpts(d) {
    const r = rng(hashStr(d.name || 'npc'));
    const skins = [0xe0b08a, 0xf0c8a0, 0xd8a080, 0xc89070, 0xe8c49a, 0xa87050], hairs = [0x3a2a1a, 0x5a3a1a, 0xd8b060, 0x8a3a1a, 0x2a2a2a, 0xa0a0a0, 0xe8e0d0];
    const P = Object.assign({}, HUMAN, { skin: skins[(r() * skins.length) | 0], hair: hairs[(r() * hairs.length) | 0], belt: 0x3a2616, pants: 0x4a3a2a, feet: 0x3a2a1a, boots: 0x4a3222, ears: 'round' });
    P.hairStyle = ['short', 'long', 'bun', 'short', 'wild'][(r() * 5) | 0];
    if (r() < 0.35) { P.beard = r() < 0.5 ? 'short' : 'long'; }
    const col = d.color != null ? d.color : 0x7a6a5a, gear = {};
    let scale = 1.0;
    switch (d.kind) {
      case 'guard':
        outfit(P, 'plate'); P.tabard = 0x3a5aa0; P.emblem = 0xe8d070; P.pants = 0x6a6a7a; P.hairStyle = 'short'; P.beard = r() < 0.5 ? 'short' : null;
        gear.weapon = { kind: 'spear', o: { metal: METAL.steel } }; gear.shield = { kind: 'shield_crest', o: { color: 0x3a5aa0 } };
        gear.helm = { kind: 'helm_crest', o: { S: P.headS, color: 0xb0b8c4, plume: 0x3a5aa0 } }; scale = 1.1; break;
      case 'merchant': outfit(P, 'cloth', col); P.apron = 0xd8c8a0; P.fezHat = r() < 0.4 ? 0xa03030 : null; P.torsoW = 0.56; break;
      case 'trainer': outfit(P, 'robe', col); P.trim = 0xd8b050; P.hair = 0xd8d8d8; P.beard = 'long'; P.beardColor = 0xe0e0e0; gear.weapon = { kind: 'staff', o: {} }; break;
      case 'binder': outfit(P, 'robe', col); P.hood = shade(col, 0.8); P.trim = 0x80c0ff; P.necklace = 0x80c0ff; break;
      case 'liaison': outfit(P, 'leather'); P.mantle = shade(col, 0.9); P.gloves = 0x5a3a22; gear.weapon = { kind: 'sword', o: {} }; break;
      default: outfit(P, r() < 0.5 ? 'cloth' : 'leather', col); if (r() < 0.4) P.headband = shade(col, 0.8);
    }
    return { rig: 'human', P, gear, scale };
  }
  // per mob type looks (colour from MOBS def); rig & dims
  function mobLook(type, def) {
    const c = def.color, H = (x) => Object.assign({}, HUMAN, x);
    switch (type) {
      case 'rat': return { rig: 'quad', P: { color: c, belly: 0xb09070, bodyLen: 1.1, bodyW: 0.52, bodyH: 0.46, legLen: 0.34, headS: 0.36, snoutLen: 0.34, ears: 'round', whiskers: true, teeth: true, tailLen: 0.55, tailW: 0.07, tailColor: 0xd09a8a, paw: 0xd09a8a, nose: 0xe08080, eye: 0xff3030, eyeGlow: false, ribs: false }, style: 'rat' };
      case 'wolf': return { rig: 'quad', P: { color: c, belly: 0xc8c8c0, bodyLen: 1.15, bodyW: 0.46, bodyH: 0.46, legLen: 0.56, headS: 0.36, snoutLen: 0.3, fangs: true, bushy: true, tailLen: 0.36, tailW: 0.11, tailTip: 0xe0e0e0, ruff: shade(c, 1.12), ridge: shade(c, 0.75), claws: true, eye: 0xe8b030 }, style: 'wolf' };
      case 'frost_wolf': return { rig: 'quad', P: { color: c, belly: 0xffffff, bodyLen: 1.15, bodyW: 0.48, bodyH: 0.48, legLen: 0.58, headS: 0.37, snoutLen: 0.3, fangs: true, bushy: true, tailLen: 0.38, tailW: 0.12, tailTip: 0xffffff, ruff: 0xffffff, ridge: 0xa8c8e0, claws: true, eye: 0x60d0ff, eyeGlow: true }, style: 'wolf' };
      case 'beetle': return { rig: 'insect', P: { color: c, shell: 0xc84a1a, gland: 0xffb030, eye: 0xff5020 }, style: 'insect' };
      case 'snake': return { rig: 'snake', P: { color: c, band: 0x2f5a22, pattern: 0x8ac060 }, style: 'snake' };
      case 'skeleton': return { rig: 'human', P: H({ skeleton: true, skull: true, skin: c, torsoW: 0.44, armW: 0.14, rags: 0x5a4a3a }), style: 'skeleton' };
      case 'skel_warrior': return { rig: 'human', P: H({ skeleton: true, skull: true, skin: c, torsoW: 0.46, armW: 0.15, pauldron: 0x6a6050, eyeGlow: 0xff4020 }), gear: { weapon: { kind: 'sword', o: { metal: METAL.rusty } }, shield: { kind: 'shield_bone', o: {} }, helm: { kind: 'helm_cap', o: { S: 0.42, color: 0x6a6a70 } } }, style: 'skeleton' };
      case 'grimbone': return { rig: 'human', P: H({ skeleton: true, skull: true, skin: 0xb8b4a0, torsoW: 0.5, armW: 0.16, cloak: 0x2a1a3a, pauldron: 0x2a2a3a, crown: 0xd8b050, eyeGlow: 0x55ff99 }), gear: { weapon: { kind: 'longsword', o: { metal: METAL.dark, glow: 0x55ff99 } } }, style: 'skeleton', glow: 0x55ff99 };
      case 'gnoll_pup': case 'gnoll': case 'fippy': {
        const P = H({ dog: true, skin: c, spots: shade(c, 0.6), mane: shade(c, 0.55), tail: true, fur: null, claws: 0x2a2018, torsoW: 0.48, hunch: 0.12, legLen: 0.76, pants: shade(c, 0.8), feet: shade(c, 0.6), bareChest: true, shirt: shade(c, 1.05), shirtLow: shade(c, 0.95), sleeve: c, belt: 0x4a3018, loincloth: 0x6a4a2a });
        const gear = {};
        if (type === 'gnoll') { gear.weapon = { kind: 'club', o: {} }; }
        if (type === 'fippy') { P.collar = 0x2a1a0a; gear.weapon = { kind: 'club', o: { wood: 0x5a3a1a } }; P.headband = 0xa02020; }
        if (type === 'gnoll_pup') { P.headS = 0.46; }
        return { rig: 'human', P, gear, style: 'beast' };
      }
      case 'ghoul': return { rig: 'human', P: H({ skin: c, hair: 0x2a3a2a, hairStyle: 'wild', ears: 'pointy', eyes: 0xe8f060, eyeGlow: true, eyeWhite: 0x1a1a10, mouth: 0x1a0a0a, wideMouth: true, torsoW: 0.44, armLen: 0.82, hunch: 0.25, claws: 0xd8d0b0, bareChest: true, ribsShow: true, shirt: c, shirtLow: shade(c, 0.9), sleeve: c, pants: 0x3a3a2a, belt: 0x2a2a1a, rags: true, spots: 0x4a6a3a }), style: 'ghoul' };
      case 'orc_grunt': case 'orc_shaman': case 'grimtusk': {
        const shaman = type === 'orc_shaman', boss = type === 'grimtusk';
        const skin = shaman ? 0x5a7a4a : boss ? 0x3f5a38 : 0x5a7a48;
        const P = H({ skin, hair: 0x1a1a14, hairStyle: shaman ? 'long' : 'mohawk', ears: 'pointy', tusks: true, jaw: true, heavyBrow: true, angryBrow: true, snoutNose: true, eyes: shaman ? 0x80c0ff : 0xe0c020, eyeGlow: shaman, torsoW: 0.56, shoulderW: 0.36, armW: 0.18, hunch: 0.1, pants: 0x4a3a2a, boots: 0x3a2a1a, belt: 0x2a1a10 });
        const gear = {};
        if (shaman) { outfit(P, 'robe', c); P.fur = null; P.mantle = 0xd8d0c0; P.feathers = [0x3080c0, 0xe8e0d0, 0xc04030]; P.necklace = 0xe0d8c0; gear.weapon = { kind: 'totem', o: { orb: 0x80c0ff } }; }
        else { outfit(P, 'leather'); P.bareChest = !boss; if (!boss) { P.shirt = skin; P.shirtLow = 0x5a4028; P.sleeve = skin; P.tier = 'bone'; } P.pauldron = boss ? 0x4a4a52 : 0x8a6a4a; P.spikes = true; P.warpaint = 0xc03020; gear.weapon = { kind: boss ? 'greatsword' : 'axe', o: { metal: boss ? METAL.dark : METAL.rusty, glow: boss ? 0xff5020 : null } }; }
        if (boss) { outfit(P, 'chain'); P.pauldron = 0x3a3a42; P.spikes = true; P.necklace = 0xf0e8d0; P.mantle = 0x5a3a2a; gear.helm = { kind: 'helm_horned', o: { S: 0.42, color: 0x3a3a42 } }; }
        return { rig: 'human', P, gear, style: boss ? 'brute' : 'humanoid', glow: boss ? 0xff5020 : shaman ? 0x80c0ff : null };
      }
      case 'yeti': return { rig: 'human', P: H({ yetiFace: true, skin: c, face: 0x8aa4b8, fur: shade(c, 0.95), furNeck: true, torsoW: 0.66, torsoD: 0.44, shoulderW: 0.44, armW: 0.22, armLen: 0.86, legW: 0.26, legLen: 0.66, headS: 0.46, hunch: 0.25, bareChest: true, shirt: c, shirtLow: shade(c, 0.94), sleeve: c, longSleeve: true, pants: shade(c, 0.92), belt: shade(c, 0.9), buckle: shade(c, 0.9), feet: 0x8aa4b8, bigFeet: true, claws: 0x2a3a4a, gloves: shade(c, 0.98) }), style: 'brute' };
      case 'frost_giant': case 'vorgath': {
        const boss = type === 'vorgath';
        const P = H({ skin: c, hair: boss ? 0xe8f4ff : 0xd8e8f8, hairStyle: 'wild', beard: 'long', beardColor: boss ? 0xf0faff : 0xd8e8f8, ears: 'big', heavyBrow: true, jaw: true, bigNose: true, eyes: boss ? 0x80ffff : 0x2a4a7a, eyeGlow: boss, torsoW: 0.62, torsoD: 0.38, shoulderW: 0.4, armW: 0.2, legW: 0.24, pants: 0x5a4a3a, boots: 0x6a5a4a, bootCuff: true, belt: 0x3a2a1a, buckle: 0xa8e0ff });
        outfit(P, 'fur'); P.fur = 0xe8eef4;
        const gear = boss ? { weapon: { kind: 'greatsword', o: { metal: METAL.ice, glow: 0x80ffff } }, helm: { kind: 'helm_giant', o: { S: 0.42 } } } : { weapon: { kind: 'club', o: { wood: 0x5a4a3a } } };
        if (boss) { P.crown = null; P.mantle = 0xa8c8e8; P.pauldron = 0xa8e0ff; P.spikes = true; P.necklace = 0xa8e0ff; }
        return { rig: 'human', P, gear, style: 'brute', glow: boss ? 0x80ffff : null };
      }
      default: return null;
    }
  }
  // legacy option format ({model:'biped', color, skin, hair, snout, thin, weapon, helm, shield, glow}) -> spec
  function legacy(o) {
    if (o.model === 'quad') return { rig: 'quad', P: { color: o.color, headS: 0.36, bushy: false, tailLen: 0.4 }, scale: o.scale || 1 };
    if (o.model === 'snake') return { rig: 'snake', P: { color: o.color }, scale: o.scale || 1 };
    const P = Object.assign({}, HUMAN, { skin: o.skin != null ? o.skin : o.color, hair: o.hair, ears: 'round', pants: o.legColor != null ? o.legColor : shade(o.color, 0.7), belt: 0x3a2616, feet: 0x3a2a1a });
    if (o.thin) Object.assign(P, { skeleton: true, skull: true, skin: o.color });
    if (o.snout) Object.assign(P, { dog: true, tail: true });
    outfit(P, 'cloth', o.color);
    const gear = {};
    if (o.weapon) gear.weapon = { kind: 'sword', o: {} };
    if (o.shield) gear.shield = { kind: 'shield_crest', o: { color: o.shield } };
    if (o.helm) gear.helm = { kind: 'helm_metal', o: { S: P.headS, color: o.helm } };
    return { rig: 'human', P, gear, scale: o.scale || 1, glow: o.glow };
  }
  function mobOpts(type, def) {
    const L = mobLook(type, def) || legacy(def);
    L.scale = def.scale || 1; L.type = type;
    if (def.glow && !L.glow) L.glow = def.glow;
    return L;
  }

  // ---------------------------------------------------------------- build
  function sigOf(spec) { return JSON.stringify([spec.rig, spec.P, spec.gear, spec.scale]); }
  function buildModel(spec) {
    spec = spec || {};
    if (!spec.rig) spec = spec.type && EB.data.MOBS[spec.type] ? mobOpts(spec.type, spec) : legacy(spec);
    const s = spec.scale || 1, rig = spec.rig;
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const parts = {};
    let tpl, height = 1.95 * s, width = 0.6 * s, model = 'biped';
    if (rig === 'quad') { tpl = quad(spec.P); height = 1.0 * s; width = 0.8 * s; model = 'quad'; }
    else if (rig === 'insect') { tpl = insect(spec.P); height = 1.0 * s; width = 0.8 * s; model = 'quad'; }
    else if (rig === 'snake') { tpl = snake(spec.P); height = 0.4 * s; width = 0.7 * s; model = 'snake'; }
    else tpl = humanoid(spec.P);
    instantiate(tpl, inner, parts);
    inner.scale.setScalar(s);
    const M = { group: g, inner, parts, height, width, model, rig: tpl.rig, style: spec.style || (spec.P && spec.P.skeleton ? 'skeleton' : 'humanoid'), P: spec.P, dims: tpl.dims || {}, boxes: tpl.boxes,
      weaponKind: null, st: { t: Math.random() * 10, flinch: 0, deadT: 0, dead: false, lastAtk: 0, swingN: 0, mv: 0, seed: Math.random() * 6 }, sig: sigOf(spec), spec };
    if (tpl.rig === 'human') {
      const hn = spec.P.hunch || 0; parts.torso.rotation.x = hn; parts.torso.userData.restRot[0] = hn; parts.head.rotation.x = -hn * 0.8; parts.head.userData.restRot[0] = -hn * 0.8;
      attachGear(M, spec.gear || {});
      // legacy aliases so old code paths keep working
      parts.body = parts.torso; parts.armL = parts.uarmL; parts.armR = parts.uarmR; parts.legL = parts.thighL; parts.legR = parts.thighR;
    }
    const sh = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    const sw = rig === 'snake' ? 0.9 * s : rig === 'human' ? Math.max(0.9, (spec.P.torsoW || 0.5) * 2.1) * s : 1.1 * s;
    sh.scale.set(sw, 1, rig === 'human' ? sw * 0.85 : sw * 1.35); sh.position.y = 0.04; sh.renderOrder = 1; sh.visible = Q.high;
    g.add(sh); M.shadow = sh; liveShadows.add(sh);
    return M;
  }
  function attachGear(M, gear) {
    const p = M.parts, d = M.dims;
    if (gear.weapon) {
      const w = gearMesh(gear.weapon.kind, gear.weapon.o || {}), k = gear.weapon.kind;
      if (k === 'bow') { w.position.set(0, 0, 0.02); p.handL.add(w); }
      else {
        if (k === 'staff' || k === 'spear' || k === 'totem') w.rotation.x = 0.12; else w.rotation.x = 1.72;
        w.position.set(0, 0.02, 0.02); p.handR.add(w);
      }
      p.weapon = w; M.weaponKind = k;
    }
    if (gear.offhand) { const w = gearMesh(gear.offhand.kind, gear.offhand.o || {}); w.rotation.x = gear.offhand.kind === 'totem' ? 0.12 : 1.72; w.position.set(0, 0.02, 0.02); p.handL.add(w); p.offhand = w; }
    if (gear.shield) { const sh = gearMesh(gear.shield.kind, gear.shield.o || {}); sh.position.set(-d.AW * 0.5 - 0.035, -d.FA * 0.55, 0.03); p.farmL.add(sh); p.shield = sh; }
    if (gear.helm) { const h = gearMesh(gear.helm.kind, Object.assign({}, gear.helm.o, { S: d.HS })); p.head.add(h); p.helm = h; }
    if (gear.cloak) {
      const c = gearMesh('cloak', { w: d.TW * 1.08, len: d.T + d.L * 0.62, color: gear.cloak.color, fur: gear.cloak.fur, collar: gear.cloak.collar });
      c.position.set(0, d.T - 0.02, -d.TD / 2 - 0.02); c.userData.rest = c.position.toArray(); c.userData.restRot = [0, 0, 0]; p.torso.add(c); p.cloak = c;
    }
    if (gear.backBow) {
      const b = gearMesh('bow', {}); b.position.set(0.02, d.T * 0.55, -d.TD / 2 - 0.08); b.rotation.set(0, Math.PI, 0.55); p.torso.add(b); p.backBow = b;
      const hb = gearMesh('bow', {}); hb.position.set(0, 0, 0.02); hb.visible = false; p.handL.add(hb); p.handBow = hb;
    }
  }
  function setDead(M, dead) {
    M.st.dead = !!dead;
    if (!dead) { M.st.deadT = 0; M.inner.rotation.set(0, 0, 0); M.inner.position.set(0, 0, 0); }
    M.inner.traverse((o) => { if (o.isMesh && o.material !== MAT.glow) o.material = dead ? MAT.dark : MAT.body; });
  }
  function flinch(M) { if (M && M.st && !M.st.dead) M.st.flinch = 1; }
  function dispose(M) { if (M && M.shadow) liveShadows.delete(M.shadow); if (M && M.group && M.group.parent) M.group.parent.remove(M.group); }

  // ---------------------------------------------------------------- animation
  const camPos = new THREE.Vector3(1e9, 0, 0);
  const tmpW = new THREE.Vector3();
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  function R(b, x, y, z) { if (!b) return; const r = b.userData.restRot; b.rotation.set(r[0] + (x || 0), r[1] + (y || 0), r[2] + (z || 0)); }
  function Pz(b, dx, dy, dz) { if (!b) return; const r = b.userData.rest; b.position.set(r[0] + (dx || 0), r[1] + (dy || 0), r[2] + (dz || 0)); }
  function attackKindFor(M) {
    const w = M.weaponKind;
    if (w === 'greatsword' || w === 'axe') return 'slash2h';
    if (w === 'mace' || w === 'club') return 'crush';
    if (w === 'staff' || w === 'spear' || w === 'totem') return 'staff';
    if (w === 'dagger') return 'pierce';
    if (w === 'bow') return 'bow';
    if (w) return 'slash';
    return M.P && M.P.claws ? 'claw' : 'punch';
  }
  function animateModel(M, walkPhase, moving, attackT, sitting, ex) {
    if (!M || !M.st) return;
    ex = ex || {};
    const st = M.st, dt = Math.min(0.1, ex.dt != null ? ex.dt : 1 / 60);
    st.t += dt;
    st.flinch = Math.max(0, st.flinch - dt * 3.5);
    if (st.dead) st.deadT = Math.min(1, st.deadT + dt * 1.7);
    if (!ex.always && !st.dead) {
      M.group.getWorldPosition(tmpW);
      const d2 = tmpW.distanceToSquared(camPos), far = d2 > 115 * 115; // beyond the fog: don't draw at all
      if (M.inner.visible === far) { M.inner.visible = !far; if (M.shadow) M.shadow.visible = !far && Q.high; }
      if (d2 > 75 * 75) return; // distant: skip posing (LOD)
    }
    st.mv += ((moving ? 1 : 0) - st.mv) * Math.min(1, dt * 10); if (Math.abs((moving ? 1 : 0) - st.mv) < 0.02) st.mv = moving ? 1 : 0;
    if (attackT > 0 && st.lastAtk <= 0) st.swingN++;
    st.lastAtk = attackT;
    const cast = !!ex.cast;
    const a = { ph: walkPhase || 0, mv: st.mv, atk: attackT > 0 && !cast ? clamp01(attackT) : -1, kind: ex.kind || attackKindFor(M), cast, sit: !!sitting, speed: ex.speed || 1 };
    if (M.rig === 'human') poseHuman(M, a, st);
    else if (M.rig === 'quad') poseQuad(M, a, st);
    else if (M.rig === 'insect') poseInsect(M, a, st);
    else if (M.rig === 'snake') poseSnake(M, a, st);
    // death collapse / flinch shake on the inner group
    const inn = M.inner;
    if (st.dead) {
      const e = ease(st.deadT);
      const flip = M.rig === 'insect' || M.rig === 'snake';
      inn.rotation.set(0, 0, (flip ? Math.PI : Math.PI / 2) * e);
      inn.position.set(0, (flip ? 0.25 : 0.12) * e * inn.scale.y, 0);
    } else {
      inn.rotation.set(0, 0, 0);
      const f = st.flinch;
      inn.position.set(f > 0 ? Math.sin(st.t * 60) * 0.03 * f : 0, sitting && M.rig !== 'human' ? -0.3 * inn.scale.y : 0, -0.06 * f * inn.scale.z);
    }
  }
  function poseHuman(M, a, st) {
    const p = M.parts, d = M.dims, t = st.t, mv = a.mv, style = M.style;
    const L = d.L || 0.8;
    let ph = a.ph, sw = Math.sin(ph) * 0.72 * mv;
    if (style === 'skeleton') sw = (Math.round(Math.sin(ph) * 3) / 3) * 0.7 * mv; // jerky, stepped gait
    const br = Math.sin(t * 1.9 + st.seed);
    const knee = (x) => Math.max(0, x) * 1.0 * mv;
    const brute = style === 'brute' ? 1 : 0;
    // legs
    R(p.thighL, -sw, 0, brute * -0.08); R(p.thighR, sw, 0, brute * 0.08);
    R(p.shinL, knee(-Math.cos(ph)) + 0.05 * mv, 0, 0); R(p.shinR, knee(Math.cos(ph)) + 0.05 * mv, 0, 0);
    // hips bob + torso twist + breathing
    Pz(p.hips, 0, Math.abs(Math.cos(ph)) * 0.05 * mv - 0.02 * mv + br * 0.006 * (1 - mv), 0);
    R(p.torso, br * 0.02 * (1 - mv) + 0.08 * mv, Math.sin(ph) * 0.1 * mv, style === 'skeleton' ? Math.sin(ph * 2) * 0.05 * mv : 0);
    R(p.head, -br * 0.015 - 0.05 * mv, Math.sin(t * 0.37 + st.seed) * 0.35 * (1 - mv) * (style === 'skeleton' ? 0.5 : 1), style === 'skeleton' ? Math.sin(t * 1.3) * 0.08 : 0);
    // arms
    const out = 0.07 + brute * 0.2 + br * 0.015;
    let uL = [sw * 0.85, 0, -out], uR = [-sw * 0.85, 0, out], fL = [-0.2 - 0.35 * mv, 0, 0], fR = [-0.2 - 0.35 * mv, 0, 0];
    if (M.weaponKind && M.weaponKind !== 'bow' && !a.cast) { uR[0] = -0.15 - sw * 0.35; fR[0] = -0.55; } // carry weapon forward
    if (p.shield) { uL[0] = -0.25 + sw * 0.3; fL[0] = -0.9; uL[2] = -0.12; }
    if (style === 'ghoul') { uL = [-1.25 + Math.sin(t * 2) * 0.1, 0, -0.1]; uR = [-1.2 + Math.sin(t * 2 + 1) * 0.1, 0, 0.1]; fL[0] = fR[0] = -0.25; }
    if (style === 'beast') { uL[0] -= 0.25; uR[0] -= 0.25; fL[0] -= 0.4; fR[0] -= 0.4; }
    if (a.sit) {
      Pz(p.hips, 0, -L * 0.56, 0); R(p.thighL, -1.45, 0, -0.12); R(p.thighR, -1.45, 0, 0.12); R(p.shinL, 1.25); R(p.shinR, 1.25);
      uL = [-0.55, 0, -0.1]; uR = [-0.55, 0, 0.1]; fL[0] = fR[0] = -0.7;
      R(p.torso, 0.08 + br * 0.02, 0, 0);
    }
    if (a.cast) {
      const w = Math.sin(t * 7) * 0.07;
      uL = [-1.25 + w, 0, -0.3]; uR = [-1.25 - w, 0, 0.3]; fL[0] = -0.6; fR[0] = -0.6;
      R(p.torso, -0.08, 0, 0); R(p.head, -0.12, 0, 0);
    }
    // attacks
    if (a.atk >= 0) {
      const q = a.atk, w = ease(q / 0.32), s = ease((q - 0.32) / 0.5), alt = st.swingN % 2 === 1;
      const phase = q < 0.32 ? w : 1 - s * 0.9;
      switch (a.kind) {
        case 'slash': {
          const m = alt ? -1 : 1;
          if (q < 0.32) { uR = [-2.3 * w, 0, 0.6 * w * m + 0.1]; fR[0] = -0.7 * w; }
          else { uR = [-2.3 + 1.9 * s, 0, (0.6 - 1.3 * s) * m + 0.1]; fR[0] = -0.7 + 0.5 * s; }
          R(p.torso, 0.05, (q < 0.32 ? 0.35 * w : 0.35 - 0.8 * s) * m, 0); break; }
        case 'slash2h': {
          const rx = q < 0.32 ? -2.6 * w : -2.6 + 2.2 * s, rz = q < 0.32 ? 0.4 * w : 0.4 - 0.9 * s;
          uR = [rx, 0, rz]; uL = [rx, 0, -rz * 0.2 + 0.55]; fR[0] = -0.5; fL[0] = -0.9;
          R(p.torso, q < 0.32 ? -0.1 * w : 0.2 * s, q < 0.32 ? 0.5 * w : 0.5 - 1.1 * s, 0); break; }
        case 'crush':
          if (q < 0.32) { uR = [-2.9 * w, 0, 0.15]; fR[0] = -0.9 * w; } else { uR = [-2.9 + 2.5 * s, 0, 0.15 - 0.2 * s]; fR[0] = -0.9 + 0.6 * s; }
          R(p.torso, q < 0.32 ? -0.12 * w : 0.25 * s, 0, 0); break;
        case 'staff': {
          const th = q < 0.35 ? w : 1 - s;
          uR = [-0.6 - 0.9 * th, 0, 0.1]; fR[0] = -1.2 + 1.0 * th; uL = [-0.8 - 0.7 * th, 0, 0.35]; fL[0] = -1.0 + 0.6 * th;
          R(p.torso, 0.1 * th, -0.25 * th, 0); break; }
        case 'pierce': {
          const useL = alt && p.offhand, u = q < 0.3 ? -0.2 + 0.6 * w : 0.4 - 2.0 * ease((q - 0.3) / 0.25) + 0.8 * ease((q - 0.6) / 0.4), f = q < 0.3 ? -1.4 * w : -1.4 + 1.3 * ease((q - 0.3) / 0.25);
          if (useL) { uL = [u, 0, -0.1]; fL[0] = f; } else { uR = [u, 0, 0.1]; fR[0] = f; }
          R(p.torso, 0.1, (useL ? -0.3 : 0.3) * Math.sin(q * Math.PI), 0); break; }
        case 'bow': {
          const dr = q < 0.6 ? ease(q / 0.6) : 1 - ease((q - 0.6) / 0.4);
          uL = [-1.55, 0, -0.35]; fL[0] = 0; uR = [-1.5, 0, 0.35 * dr]; fR[0] = -2.0 * dr - 0.3;
          R(p.torso, 0, 0.55, 0); R(p.head, 0, -0.5, 0); break; }
        case 'kick': {
          const k = Math.sin(q * Math.PI);
          R(p.thighR, -1.6 * k); R(p.shinR, 1.1 * (1 - k) * (q < 0.5 ? 1 : 0.3)); R(p.torso, -0.25 * k, 0, 0); uL = [0.4 * k, 0, -0.4]; uR = [0.4 * k, 0, 0.4]; break; }
        case 'bash': { const k = Math.sin(q * Math.PI); uL = [-1.5 * k, 0, -0.1]; fL[0] = -0.6 + 0.5 * k; R(p.torso, 0.15 * k, -0.4 * k, 0); break; }
        case 'claw': {
          const m = alt ? -1 : 1, rx = q < 0.3 ? -2.6 * w : -2.6 + 2.4 * s, rz = (q < 0.3 ? 0.5 * w : 0.5 - 1.1 * s);
          if (m > 0) { uR = [rx, 0, rz]; fR[0] = -0.4; } else { uL = [rx, 0, -rz]; fL[0] = -0.4; }
          R(p.torso, 0.2 * phase, 0.3 * m * (q < 0.3 ? w : 1 - 2 * s), 0); break; }
        default: { // punch
          const k = Math.sin(q * Math.PI), m = alt ? -1 : 1;
          if (m > 0) { uR = [-1.5 * k, 0, 0.1]; fR[0] = -1.4 * (1 - k); } else { uL = [-1.5 * k, 0, -0.1]; fL[0] = -1.4 * (1 - k); }
          R(p.torso, 0.1 * k, 0.3 * k * m, 0);
        }
      }
    }
    if (p.handBow) { const b = a.kind === 'bow' && a.atk >= 0; p.handBow.visible = b; if (p.backBow) p.backBow.visible = !b; }
    // flinch: snap back
    const f = st.flinch;
    if (f > 0) { p.torso.rotation.x -= 0.3 * f; p.head.rotation.x -= 0.35 * f; uL[0] += 0.4 * f; uR[0] += 0.4 * f; uL[2] -= 0.3 * f; uR[2] += 0.3 * f; }
    // death: limp limbs
    if (st.dead) { const e = ease(st.deadT); uL = [-0.3 * e, 0, -1.2 * e]; uR = [-0.2 * e, 0, 1.0 * e]; fL[0] = fR[0] = -0.3 * e; R(p.thighL, -0.3 * e); R(p.thighR, 0.2 * e); R(p.shinL, 0.5 * e); R(p.shinR, 0.2 * e); R(p.head, 0.3 * e, 0.4 * e, 0); R(p.torso, 0, 0, 0); Pz(p.hips, 0, 0, 0); }
    R(p.uarmL, uL[0], uL[1], uL[2]); R(p.uarmR, uR[0], uR[1], uR[2]); R(p.farmL, fL[0]); R(p.farmR, fR[0]);
    if (p.cloak) { R(p.cloak, 0.08 + 0.35 * mv + Math.sin(t * 2.3) * 0.03 + (a.sit ? 0.3 : 0), 0, 0); }
    if (p.tail) R(p.tail, 0.2 * mv, Math.sin(t * (4 + 6 * mv)) * 0.35, 0);
  }
  function poseQuad(M, a, st) {
    const p = M.parts, t = st.t, mv = a.mv, rat = M.style === 'rat';
    const ph = a.ph * (rat ? 1.7 : 1.15), amp = (rat ? 0.55 : 0.6) * mv;
    const A = Math.sin(ph) * amp, B = -A;
    R(p.legFL, A); R(p.legBR, A); R(p.legFR, B); R(p.legBL, B);
    R(p.legFL2, Math.max(0, Math.cos(ph)) * 0.7 * mv); R(p.legBR2, -Math.max(0, Math.cos(ph)) * 0.5 * mv);
    R(p.legFR2, Math.max(0, -Math.cos(ph)) * 0.7 * mv); R(p.legBL2, -Math.max(0, -Math.cos(ph)) * 0.5 * mv);
    const br = Math.sin(t * 2.2 + st.seed);
    Pz(p.body, 0, Math.abs(Math.sin(ph)) * (rat ? 0.05 : 0.06) * mv + br * 0.008, 0);
    R(p.body, (rat ? Math.sin(ph * 2) * 0.06 : Math.sin(ph * 2) * 0.03) * mv, 0, 0);
    R(p.chest, br * 0.02, 0, 0);
    // head: rat sniffs, wolves look around; jaw pants
    let hx = 0, hy = Math.sin(t * 0.5 + st.seed) * 0.3 * (1 - mv), jx = 0;
    if (rat) { hx = (1 - mv) * (Math.sin(t * 13) * 0.05 + 0.1); } else { jx = 0.12 + Math.sin(t * 8) * 0.05; hx = -0.05 * mv; }
    if (a.atk >= 0) { const k = Math.sin(a.atk * Math.PI); hx += 0.45 * k * (a.atk < 0.4 ? -0.5 : 1); jx = 0.6 * Math.sin(Math.min(1, a.atk * 1.4) * Math.PI); Pz(p.chest, 0, 0, 0.15 * k); } else Pz(p.chest, 0, 0, 0);
    R(p.head, hx, hy, 0); R(p.jaw, jx);
    const wag = Math.sin(t * (rat ? 5 : 7 + 5 * mv)) * (rat ? 0.25 : 0.45);
    R(p.tail, rat ? 0.25 : -0.35 + mv * 0.2, wag, 0); R(p.tail2, rat ? 0.15 : 0.35, wag * 0.6, 0);
    if (st.flinch > 0) { p.head.rotation.x -= 0.3 * st.flinch; p.body.rotation.z += Math.sin(t * 50) * 0.08 * st.flinch; }
    if (st.dead) { const e = ease(st.deadT); for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) R(p[n], 0, 0, 0.2 * e * (n.endsWith('L') ? -1 : 1)); R(p.head, 0.3 * e); R(p.jaw, 0.4 * e); R(p.tail, 0.5 * e); }
  }
  function poseInsect(M, a, st) {
    const p = M.parts, t = st.t, mv = a.mv, ph = a.ph * 1.6;
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const n = 'leg' + i + (s < 0 ? 'L' : 'R'), off = ((i + (s < 0 ? 0 : 1)) % 2) * Math.PI;
      R(p[n], 0, Math.sin(ph + off) * 0.45 * mv, Math.max(0, Math.cos(ph + off)) * 0.35 * mv * -s);
      R(p[n + '2'], 0, 0, Math.sin(t * 3 + i) * 0.03);
    }
    Pz(p.body, 0, Math.abs(Math.sin(ph)) * 0.025 * mv + Math.sin(t * 2) * 0.006, 0);
    let m = 0.15 + Math.sin(t * 5) * 0.15, hx = 0;
    if (a.atk >= 0) { const k = Math.sin(a.atk * Math.PI); m = 0.7 * (a.atk < 0.5 ? a.atk * 2 : (1 - a.atk) * 2) - 0.2 * k; hx = 0.25 * k; Pz(p.body, 0, 0, 0.12 * k); }
    R(p.head, hx, Math.sin(t * 0.8) * 0.15 * (1 - mv), 0); R(p.mandL, 0, -m, 0); R(p.mandR, 0, m, 0);
    if (st.flinch > 0) p.body.rotation.z = Math.sin(t * 50) * 0.1 * st.flinch; else p.body.rotation.z = 0;
    if (st.dead) { const e = ease(st.deadT); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const n = 'leg' + i + (s < 0 ? 'L' : 'R'); R(p[n], 0, 0, -s * 0.8 * e + Math.sin(t * 20) * 0.1 * (1 - e)); R(p[n + '2'], 0, 0, s * 0.6 * e); } }
  }
  function poseSnake(M, a, st) {
    const p = M.parts, t = st.t, mv = a.mv, N = 9;
    const spd = 0.9 + mv * 1.4, amp = 0.14 + 0.28 * mv;
    for (let i = 0; i < N; i++) R(p['seg' + i], 0, Math.sin(a.ph * 0.9 * spd + t * (1 - mv) * 1.2 - i * 0.9) * amp * (i === 0 ? 0.5 : 1), 0);
    let nx = -0.55 + Math.sin(t * 1.5) * 0.06, nz = 0, jx = 0, hy = Math.sin(t * 0.7) * 0.25;
    if (mv > 0.5) nx = -0.2;
    if (a.atk >= 0) { const k = Math.sin(a.atk * Math.PI); if (a.atk < 0.35) nx = -0.55 - 0.4 * ease(a.atk / 0.35); else nx = -0.95 + 1.2 * k; nz = 0.25 * k; jx = 0.8 * k; }
    else if (Math.sin(t * 2.1 + st.seed) > 0.93) jx = 0.18; // tongue flick
    R(p.neck, nx, Math.sin(a.ph * 0.9 * spd) * amp * 0.6, 0); Pz(p.neck, 0, 0, nz);
    R(p.head, -nx * 0.85, hy * (1 - mv), 0); R(p.jaw, jx);
    if (st.flinch > 0) p.neck.rotation.x -= 0.4 * st.flinch;
    if (st.dead) { const e = ease(st.deadT); R(p.neck, nx * (1 - e)); for (let i = 0; i < N; i++) R(p['seg' + i], 0, 0.25 * e * Math.sin(i), 0); }
  }
  function handPos(M, side, out) { const h = M.parts['hand' + side] || M.parts.head || M.inner; return h.getWorldPosition(out || new THREE.Vector3()); }

  // ---------------------------------------------------------------- character-creation preview
  let PV = null;
  function preview(canvas, opts) {
    if (!canvas) return;
    try {
      if (!PV || PV.canvas !== canvas) {
        stopPreview(true);
        const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        if ('outputEncoding' in r) r.outputEncoding = THREE.sRGBEncoding;
        const sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x5a4a3a, 0.75));
        const dl = new THREE.DirectionalLight(0xfff0dd, 0.85); dl.position.set(2, 4, 3); sc.add(dl);
        const fl = new THREE.DirectionalLight(0x9ab0ff, 0.3); fl.position.set(-3, 2, -2); sc.add(fl);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.12, 24), new THREE.MeshLambertMaterial({ color: 0x5a6a3a }));
        base.position.y = -0.06; sc.add(base);
        const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
        PV = { canvas, r, sc, cam, M: null, sig: '', yaw: 0.5, raf: 0, last: performance.now(), drag: null };
        canvas.addEventListener('pointerdown', (e) => { if (PV) PV.drag = e.clientX; });
        window.addEventListener('pointerup', () => { if (PV) PV.drag = null; });
        canvas.addEventListener('pointermove', (e) => { if (PV && PV.drag != null) { PV.yaw += (e.clientX - PV.drag) * 0.01; PV.drag = e.clientX; } });
      }
      const spec = playerOpts(opts), sig = sigOf(spec);
      if (sig !== PV.sig) {
        if (PV.M) { dispose(PV.M); }
        PV.M = buildModel(spec); PV.sig = sig; PV.sc.add(PV.M.group);
        const h = 1.95 * spec.scale;
        PV.cam.position.set(0, h * 0.68, h * 1.85 + 0.55); PV.cam.lookAt(0, h * 0.52, 0);
      }
      if (!PV.raf) {
        const loop = () => {
          if (!PV) return;
          PV.raf = requestAnimationFrame(loop);
          const now = performance.now(), dt = Math.min(0.05, (now - PV.last) / 1000); PV.last = now;
          const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
          if (canvas.width !== Math.round(w * PV.r.getPixelRatio()) || canvas.height !== Math.round(h * PV.r.getPixelRatio())) { PV.r.setSize(w, h, false); PV.cam.aspect = w / h; PV.cam.updateProjectionMatrix(); }
          if (PV.drag == null && !(PV.hold > now)) PV.yaw += dt * 0.5;
          PV.M.group.rotation.y = PV.yaw;
          const cyc = (now / 1000) % 9; // idle, then a short attack flourish every 9s
          const atk = cyc > 6 && cyc < 6.7 ? 1 - (cyc - 6) / 0.7 : 0;
          animateModel(PV.M, 0, false, atk, false, { dt, always: true });
          PV.r.render(PV.sc, PV.cam);
        };
        PV.raf = requestAnimationFrame(loop);
      }
    } catch (e) { console.warn('preview failed', e); }
  }
  function stopPreview(keepNothing) {
    if (!PV) return;
    cancelAnimationFrame(PV.raf);
    if (PV.M) dispose(PV.M);
    try { PV.r.dispose(); if (PV.r.forceContextLoss) PV.r.forceContextLoss(); } catch (e) { /* ignore */ }
    PV = null;
  }

  function previewPose(yaw, holdMs) { if (PV) { PV.yaw = yaw; PV.hold = performance.now() + (holdMs || 3000); } }
  EB.models = { MAT, RIM, GRAIN, TPL, buildModel, animateModel, setDead, flinch, dispose, setQuality, setRim, quality: Q, camPos, handPos, preview, stopPreview, previewPose, previewing: () => !!PV,
    playerOpts, mercOpts, petOpts, npcOpts, mobOpts, weaponKind, attackKindFor, sigOf, RACE_LOOK, legacy };
})();
