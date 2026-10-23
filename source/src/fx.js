// Everblock v10 - spell effects: pooled additive particles (one THREE.Points draw call, 4 particle looks + colour-over-life),
// pooled ground decals (cast circles, impact rings, shockwaves, puddles), a couple of reusable flash lights, floating combat
// numbers, light camera shake, big crowd-control markers, per-school recipes and signature effects.
(function () {
  const EB = window.EB;
  const SCHOOL = { cold: 0x80d0ff, fire: 0xff7020, magic: 0xfff080, disease: 0x90d040, life: 0xff4070, heal: 0x9effa0, holy: 0xfff4b0, poison: 0x80e040, mind: 0xd080ff, shadow: 0xb060ff };
  // shapes: 0 soft orb, 1 four-point spark, 2 ice/crystal shard, 3 bubble ring
  // grav: + rises (embers, bubbles), - falls (shards). c -> c2 is the colour over a particle's life.
  const RECIPE = {
    fire:    { c: 0xffe080, c2: 0xff2a00, core: 0, spark: 1, grav: 2.2, drag: 1.4, trail: 'ember', ring: 0xff6020, light: 0xff7020, puddle: 0xff4a10, snd: 'fire' },
    cold:    { c: 0xffffff, c2: 0x3890ff, core: 2, spark: 2, grav: -7, drag: 0.8, trail: 'shard', ring: 0x9ee8ff, light: 0x80c8ff, puddle: 0x70c0ff, snd: 'cold' },
    magic:   { c: 0xffffff, c2: 0xffc020, core: 1, spark: 1, grav: 0, drag: 2.2, trail: 'spark', ring: 0xfff080, light: 0xfff080, puddle: 0xffe060, snd: 'magic' },
    disease: { c: 0xd8ff70, c2: 0x305010, core: 3, spark: 0, grav: 0.9, drag: 1.8, trail: 'bubble', ring: 0x90d040, light: 0x90d040, puddle: 0x70b020, snd: 'disease' },
    poison:  { c: 0xc0ff80, c2: 0x206010, core: 3, spark: 0, grav: 0.9, drag: 1.8, trail: 'bubble', ring: 0x80e040, light: 0x80e040, puddle: 0x60c020, snd: 'disease' },
    life:    { c: 0xffa0b0, c2: 0x900020, core: 0, spark: 1, grav: 0, drag: 1.6, trail: 'helix', ring: 0xff4070, light: 0xff3060, puddle: 0xc01040, snd: 'life' },
    heal:    { c: 0xffffff, c2: 0x50ff80, core: 1, spark: 1, grav: 1.2, drag: 1, trail: 'spark', ring: 0x9effa0, light: 0x9effa0, puddle: 0x60ff90, snd: 'heal' },
    holy:    { c: 0xffffff, c2: 0xffb030, core: 1, spark: 1, grav: 0.8, drag: 1, trail: 'spark', ring: 0xfff4b0, light: 0xfff0a0, puddle: 0xffe080, snd: 'holy' },
    mind:    { c: 0xffd0ff, c2: 0x7030ff, core: 1, spark: 3, grav: 0, drag: 1.6, trail: 'helix', ring: 0xd080ff, light: 0xc070ff, puddle: 0xa050ff, snd: 'mind' },
    shadow:  { c: 0xd0a0ff, c2: 0x2a0050, core: 0, spark: 0, grav: -0.5, drag: 1.2, trail: 'helix', ring: 0xb060ff, light: 0x9040ff, puddle: 0x6020c0, snd: 'shadow' },
  };
  const BYCOLOR = {}; for (const k in SCHOOL) BYCOLOR[SCHOOL[k]] = k; BYCOLOR[0x9ee8ff] = 'cold'; BYCOLOR[0xff8040] = 'fire';
  const rec = (s) => RECIPE[s] || RECIPE.magic;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const DECAL_VS = 'varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const DECAL_FS = 'uniform vec3 uC; uniform float uA; uniform float uK; uniform float uIn; uniform float uT; varying vec2 vU;\n' +
    'void main(){ float r = length(vU); if (r > 1.0) discard; float ang = atan(vU.y, vU.x); float a = 0.0;\n' +
    ' if (uK < 0.5) { a = smoothstep(uIn - 0.12, uIn, r) * (1.0 - smoothstep(0.92, 1.0, r)); }\n' + // ring
    ' else if (uK < 1.5) { float o = smoothstep(0.86,0.9,r)*(1.0-smoothstep(0.96,1.0,r)); float i2 = smoothstep(0.6,0.63,r)*(1.0-smoothstep(0.67,0.7,r));\n' + // rune circle
    '   float sp = step(0.82, abs(sin(ang * 6.0))) * step(0.68, r) * step(r, 0.86); float tri = (1.0 - smoothstep(0.0, 0.05, abs(r * cos(mod(ang + uT, 2.094) - 1.047) - 0.55))) * step(r, 0.62);\n' +
    '   a = o + i2 * 0.8 + sp * 0.7 + tri * 0.6 + (1.0 - r) * 0.12; }\n' +
    ' else if (uK < 2.5) { float edge = 0.78 + 0.1 * sin(ang * 5.0 + uT) + 0.06 * sin(ang * 11.0 - uT * 1.7); a = (1.0 - smoothstep(edge - 0.25, edge, r)) * (0.55 + 0.25 * sin(r * 14.0 - uT * 3.0)); }\n' + // puddle
    ' else { a = smoothstep(uIn - 0.35, uIn, r) * (1.0 - smoothstep(0.9, 1.0, r)) * (0.6 + 0.4 * r); }\n' + // shockwave
    ' gl_FragColor = vec4(uC * (0.8 + a * 0.5), a * uA); }';
  const FX = {
    cap: 2600, n: 0, high: true, pts: null, bolts: [], emitters: [], decals: [], lights: [], nums: [], tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(), col: new THREE.Color(), col2: new THREE.Color(),
    counts: { spawned: 0, decals: 0, lights: 0, nums: 0, shakes: 0, sounds: 0, sig: {} }, now: 0, shakeA: 0, shakeV: new THREE.Vector3(), RECIPE,
    init(scene) {
      const N = this.cap;
      this.pos = new Float32Array(N * 3); this.colA = new Float32Array(N * 3); this.c0 = new Float32Array(N * 3); this.c1 = new Float32Array(N * 3); this.size = new Float32Array(N); this.alpha = new Float32Array(N); this.shape = new Float32Array(N);
      this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N); this.grav = new Float32Array(N); this.drag = new Float32Array(N); this.s0 = new Float32Array(N); this.grow = new Float32Array(N);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.colA, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      this.uScale = { value: 400 };
      const m = new THREE.ShaderMaterial({
        uniforms: { uScale: this.uScale },
        vertexShader: 'attribute float size; attribute float alpha; attribute float shape; attribute vec3 color; varying vec3 vC; varying float vA; varying float vS; uniform float uScale;\n' +
          'void main(){ vC = color; vA = alpha; vS = shape; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 1.0, 160.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec3 vC; varying float vA; varying float vS;\n' +
          'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a; float core;\n' +
          ' if (vS < 0.5) { core = exp(-r * r * 4.0); a = core * 0.85 + 0.15 * (1.0 - r); }\n' +
          ' else if (vS < 1.5) { vec2 q = abs(d) * 2.0; core = exp(-r * r * 9.0); a = max(core, max(exp(-q.x * 14.0) * (1.0 - q.y), exp(-q.y * 14.0) * (1.0 - q.x))); }\n' +
          ' else if (vS < 2.5) { vec2 q = abs(d) * 2.0; float k = q.x * 2.2 + q.y * 0.9; core = 1.0 - smoothstep(0.0, 0.5, k); a = (1.0 - smoothstep(0.85, 1.0, k)) * (0.55 + core * 0.6); }\n' +
          ' else { core = 0.0; a = smoothstep(0.55, 0.75, r) * (1.0 - smoothstep(0.85, 1.0, r)) + exp(-length(d - vec2(-0.12, 0.12)) * 40.0); }\n' +
          ' gl_FragColor = vec4(vC * (0.75 + core * 0.5), a * vA * 0.85); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 10;
      scene.add(this.pts); this.scene = scene;
      // ground decals: a small pool of flat quads with a procedural shader, hidden when idle (one draw call each only while visible)
      const pg = new THREE.PlaneGeometry(2, 2); pg.rotateX(-Math.PI / 2);
      for (let i = 0; i < 20; i++) {
        const u = { uC: { value: new THREE.Color() }, uA: { value: 0 }, uK: { value: 0 }, uIn: { value: 0.7 }, uT: { value: 0 } };
        const mesh = new THREE.Mesh(pg, new THREE.ShaderMaterial({ uniforms: u, vertexShader: DECAL_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        mesh.visible = false; mesh.renderOrder = 9; mesh.frustumCulled = false; scene.add(mesh);
        this.decals.push({ mesh, u, live: false });
      }
      if (this.high) this.addLights();
      // floating combat numbers / CC tags: pooled DOM nodes
      const box = document.createElement('div'); box.id = 'fxNums'; document.body.appendChild(box); this.numBox = box;
    },
    addLights() {
      if (this.lights.length || !this.scene) return;
      for (let i = 0; i < 2; i++) { const L = new THREE.PointLight(0xffffff, 0, 9, 2); this.scene.add(L); this.lights.push({ L, t: 0, dur: 0, I: 0 }); }
    },
    setHigh(h) { this.high = !!h; if (this.high) this.addLights(); for (const l of this.lights) if (!this.high) l.L.intensity = 0; },
    // emit(x,y,z, vx,vy,vz, life, size, color, grav, drag, grow, shape, color2)
    emit(x, y, z, vx, vy, vz, life, size, color, grav, drag, grow, shape, color2) {
      if (!this.pts) return;
      const lim = this.high ? this.cap : 700;
      if (this.n >= lim) return;
      const i = this.n++, i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.col.setHex(color); this.c0[i3] = this.colA[i3] = this.col.r; this.c0[i3 + 1] = this.colA[i3 + 1] = this.col.g; this.c0[i3 + 2] = this.colA[i3 + 2] = this.col.b;
      if (color2 != null) this.col.setHex(color2);
      this.c1[i3] = this.col.r; this.c1[i3 + 1] = this.col.g; this.c1[i3 + 2] = this.col.b;
      if (!this.high) size *= 1.35; // low/phone: fewer but chunkier particles so effects stay bold
      this.life[i] = this.max[i] = life; this.s0[i] = size; this.size[i] = size; this.alpha[i] = 1; this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.grow[i] = grow || 0; this.shape[i] = shape || 0;
      this.counts.spawned++;
    },
    k(n) { return this.high ? n : Math.max(1, Math.ceil(n / 2.6)); },
    burst(p, color, n, speed, size, life, up, shape, color2, grav) {
      n = this.k(n);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.8, s = speed * (0.4 + Math.random() * 0.6);
        this.emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (up || 0), Math.sin(a) * Math.cos(e) * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color, grav == null ? -2 : grav, 2.5, 0, shape || 0, color2);
      }
    },
    // a recipe-driven burst: main look + a second spark/shard look
    sburst(p, school, n, speed, size, life) {
      const R = rec(school);
      this.burst(p, R.c, n, speed, size, life, 0.5, R.core, R.c2, R.grav);
      this.burst(p, 0xffffff, Math.ceil(n * 0.6), speed * 1.5, size * 0.55, life * 0.8, 0.3, R.spark, R.c2, R.grav - 1);
    },
    center(e, f) { return this.tmp.set(e.pos.x, e.pos.y + (e.h || 1.8) * (f == null ? 0.6 : f), e.pos.z); },
    // ---------- decals ----------
    decal(x, y, z, o) {
      let d = this.decals.find((q) => !q.live);
      if (!d) { d = this.decals.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b)); }
      const lim = this.high ? 20 : 8; if (this.decals.filter((q) => q.live).length >= lim && !d.live) return null;
      Object.assign(d, { live: true, t: 0, x, y, z, dur: o.dur || 0.6, r0: o.r0 || 0.3, r1: o.r1 == null ? o.r0 || 1 : o.r1, kind: o.kind || 0, follow: o.follow || null, spin: o.spin || 0, a: o.a == null ? 1 : o.a, tag: null, fadeOut: false, keep: o.keep || 0, ttl: o.keep ? o.keep : 0, inner: o.inner == null ? 0.7 : o.inner, fadeIn: o.fadeIn || 0 });
      d.u.uC.value.setHex(o.color || 0xffffff); d.u.uK.value = d.kind; d.u.uIn.value = d.inner; d.mesh.visible = true; d.mesh.rotation.y = Math.random() * 6.28;
      this.counts.decals++;
      return d;
    },
    ground(e) { return e.pos.y + 0.04; },
    ring(e, color, r1, dur) { return this.decal(e.pos.x, this.ground(e), e.pos.z, { kind: 0, color, r0: 0.3, r1: r1 || 1.6, dur: dur || 0.5, inner: 0.78 }); },
    shockwave(e, color, r1) { return this.decal(e.pos.x, this.ground(e), e.pos.z, { kind: 3, color, r0: 0.4, r1: r1 || 4, dur: 0.7, inner: 0.85 }); },
    // keep-alive decals tied to an entity (cast circle under a caster, DoT puddle under a target); refreshed every frame by the game
    held(e, slot, o) {
      if (!e || !e.pos) return; let d = e[slot];
      if (!d || !d.live || d.follow !== e || d.tag !== slot) { d = this.decal(e.pos.x, this.ground(e), e.pos.z, Object.assign({ follow: e, dur: 1e9, keep: 0.25 }, o)); if (!d) return; d.tag = slot; e[slot] = d; }
      d.ttl = d.keep; if (o.r1 != null) d.r0 = d.r1 = o.r1; if (o.a != null) d.a = o.a;
      return d;
    },
    castCircle(e, color, prog) { this.held(e, '_castDecal', { kind: 1, color, r0: 0.8, r1: 0.7 + 0.5 * Math.min(1, prog), spin: 1.4, a: 0.55 + 0.45 * Math.min(1, prog) }); },
    puddle(e, color) { const r = Math.max(0.7, (e.hw || 0.4) * 2.6); this.held(e, '_puddle', { kind: 2, color, r0: r, r1: r, a: 0.55, keep: 0.6 }); },
    // ---------- lights / shake / numbers ----------
    light(p, color, I, dur) {
      if (!this.high || !this.lights.length) return;
      const l = this.lights.find((q) => q.dur === 0) || this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
      l.L.position.copy(p); l.L.color.setHex(color); l.t = 0; l.dur = dur || 0.3; l.I = I || 2.2; l.L.intensity = l.I; this.counts.lights++;
    },
    shake(a) { this.shakeA = Math.max(this.shakeA, a); this.counts.shakes++; },
    shakeOffset(dt) {
      if (this.shakeA <= 0.001) { this.shakeA = 0; return null; }
      const a = this.shakeA; this.shakeA = Math.max(0, a - dt * a * 7 - dt * 0.05);
      return this.shakeV.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    },
    number(e, text, color, big, cls) {
      if (!this.numBox) return;
      const lim = this.high ? 24 : 9;
      let n = this.nums.find((q) => !q.live);
      if (!n) { if (this.nums.length < lim) { const el = document.createElement('div'); el.className = 'fxNum'; this.numBox.appendChild(el); n = { el }; this.nums.push(n); } else n = this.nums.reduce((a, b) => (a.t > b.t ? a : b)); }
      n.live = true; n.t = 0; n.dur = big ? 1.3 : 1.0; n.e = e; n.dx = rnd(-0.35, 0.35); n.y0 = (e.h || 1.8) * 1.05;
      n.el.textContent = text; n.el.className = 'fxNum' + (big ? ' big' : '') + (cls ? ' ' + cls : ''); n.el.style.color = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color; n.el.style.display = 'block';
      this.counts.nums++;
    },
    // big readable crowd-control marker: a floating tag plus a halo of large stars, refreshed each frame while it lasts
    ccMark(e, kind, dt) {
      const cls = kind === 'mez' ? 'mez' : 'stun';
      if (!e._cc || !e._cc.live || e._cc.e !== e) { const el = document.createElement('div'); el.className = 'fxCC ' + cls; this.numBox && this.numBox.appendChild(el); e._cc = { el, e, live: true }; this.nums.push(Object.assign(e._cc, { cc: true, t: 0, dur: 1e9 })); }
      const c = e._cc; c.ttl = 0.2; c.el.className = 'fxCC ' + cls; c.el.textContent = kind === 'mez' ? 'zZz' : '@#%!';
      e._ccAcc = (e._ccAcc || 0) + dt * (this.high ? 14 : 6);
      const h = e.h || 1.8, col = kind === 'mez' ? 0xd080ff : 0xfff060, col2 = kind === 'mez' ? 0x6030ff : 0xff9020;
      while (e._ccAcc > 1) {
        e._ccAcc -= 1;
        const a = this.now * (kind === 'mez' ? 2.5 : 6) + Math.random() * 0.25, r = Math.max(0.45, (e.hw || 0.4) * 1.3);
        for (const s of [0, 2.094, 4.188]) this.emit(e.pos.x + Math.cos(a + s) * r, e.pos.y + h + 0.3 + (kind === 'mez' ? Math.sin(this.now * 3 + s) * 0.12 : 0), e.pos.z + Math.sin(a + s) * r, 0, 0.05, 0, 0.18, 0.34, col, 0, 0, 0, 1, col2);
      }
    },
    // ---------- emitters ----------
    heal(e, color, amt) { e._healMark = this.now; this.emitters.push({ e, t: 0, dur: 1.2, kind: 'heal', color: color || SCHOOL.heal, acc: 0 }); this.ring(e, color || SCHOOL.heal, 1.3, 0.7); this.light(this.center(e, 0.5), color || SCHOOL.heal, 1.6, 0.5); this.sound('heal', 'impact'); },
    buff(e, color) { this.emitters.push({ e, t: 0, dur: 1.3, kind: 'swirl', color: color || 0xfff0a0, acc: 0 }); this.decal(e.pos.x, this.ground(e), e.pos.z, { kind: 1, color: color || 0xfff0a0, r0: 0.4, r1: 1.2, dur: 1.2, spin: 2, follow: e }); this.sound('holy', 'impact'); },
    stars(e, dur) { this.emitters.push({ e, t: 0, dur: dur || 1.5, kind: 'stars', color: 0xfff080, acc: 0 }); },
    column(e, color) { this.emitters.push({ e, t: 0, dur: 1.6, kind: 'column', color: color || 0xffe070, acc: 0 }); this.burst(this.center(e, 0.1), color || 0xffe070, 40, 4, 0.35, 0.9, 1, 1); this.ring(e, color || 0xffe070, 2, 0.8); },
    summon(e) { this.summonType(e, 'skel'); },
    // v10: each pet type gets its own entrance
    summonType(e, type) {
      this.counts.sig['pet-' + type] = (this.counts.sig['pet-' + type] || 0) + 1;
      const g = this.ground(e);
      if (type === 'wolf') { // spirit wolf: icy wisps spiral down, a frost ring, a howl
        this.emitters.push({ e, t: 0, dur: 1.4, kind: 'spiralDown', color: 0xc0f0ff, c2: 0x4080ff, acc: 0 });
        this.decal(e.pos.x, g, e.pos.z, { kind: 1, color: 0x9ee8ff, r0: 0.4, r1: 1.6, dur: 1.4, spin: -2 });
        this.shockwave(e, 0x80c8ff, 3); this.light(this.center(e, 0.4), 0x80c8ff, 2.4, 0.6); this.sound('wolf', 'impact');
      } else if (type === 'friend') { // imaginary friend: pink-gold confetti pop, sparkle stars and a ring
        this.burst(this.center(e, 0.6), 0xffa0e0, 60, 5, 0.3, 1.0, 1.5, 1, 0xffe060, -3);
        this.burst(this.center(e, 0.6), 0xffffff, 30, 3, 0.22, 1.2, 1, 1, 0xff80ff, -1);
        this.emitters.push({ e, t: 0, dur: 1.2, kind: 'swirl', color: 0xffb0f0, acc: 0 });
        this.ring(e, 0xff90e0, 2.2, 0.7); this.light(this.center(e, 0.5), 0xff90e0, 2.2, 0.5); this.sound('friend', 'impact');
      } else { // skeleton: a dark puddle opens, bone shards claw up out of it, sickly green flare
        this.decal(e.pos.x, g, e.pos.z, { kind: 2, color: 0x7030c0, r0: 0.5, r1: 1.5, dur: 2.2 });
        this.emitters.push({ e, t: 0, dur: 1.0, kind: 'bones', color: 0xf0ead0, acc: 0 });
        this.burst(this.center(e, 0.15), 0x90ff60, 30, 2.5, 0.35, 1.0, 2, 0, 0x205010, 1);
        this.shockwave(e, 0x8040ff, 2.6); this.light(this.center(e, 0.3), 0x9040ff, 2.4, 0.6); this.sound('shadow', 'impact');
      }
    },
    // DoT cloud: recipe-shaped puffs + a lingering puddle underneath
    cloud(e, color, dt, school) {
      const R = RECIPE[school] || null;
      e._cloudAcc = (e._cloudAcc || 0) + dt * (this.high ? 12 : 4);
      while (e._cloudAcc > 1) {
        e._cloudAcc -= 1;
        const r = (e.hw || 0.4) * 1.4, a = Math.random() * Math.PI * 2, c = this.center(e, 0.2 + Math.random() * 0.6);
        if (school === 'fire') this.emit(c.x + Math.cos(a) * r * 0.7, c.y, c.z + Math.sin(a) * r * 0.7, (Math.random() - 0.5) * 0.3, 1 + Math.random(), (Math.random() - 0.5) * 0.3, 0.8, 0.35 + Math.random() * 0.2, 0xffe080, 1.5, 0.8, -0.5, 0, 0xff2000);
        else this.emit(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, 1.5, 0.45 + Math.random() * 0.3, color, 0, 0.6, 0.9, Math.random() < 0.35 ? 3 : 0, R ? R.c2 : color);
      }
      this.puddle(e, R ? R.puddle : color);
    },
    // cast wind-up: a growing school orb in each hand with sparks converging into it
    hand(p, color, dt, prog) {
      prog = prog == null ? 0.5 : Math.min(1, prog);
      const n = this.high ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.25 + 0.35 * prog, e = rnd(-0.6, 0.6);
        this.emit(p.x + Math.cos(a) * r, p.y + e * r, p.z + Math.sin(a) * r, -Math.cos(a) * r * 3, -e * r * 3, -Math.sin(a) * r * 3, 0.3, 0.09, 0xffffff, 0, 0, 0, 1, color);
      }
      this.emit(p.x, p.y, p.z, 0, 0, 0, 0.06, 0.14 + 0.4 * prog, color, 0, 0);
      this.emit(p.x, p.y, p.z, 0, 0, 0, 0.05, 0.08 + 0.16 * prog, 0xffffff, 0, 0);
    },
    release(p, school) {
      const R = rec(school);
      this.burst(p, R.c, 18, 3, 0.3, 0.4, 0.5, R.spark, R.c2, 0);
      this.emit(p.x, p.y, p.z, 0, 0, 0, 0.18, 1.0, R.c, 0, 0, 1.5);
      this.light(p, R.light, 1.8, 0.25); this.sound(school, 'release');
    },
    // target flash: a body-sized bloom in the school colour (models share materials, so the flash is an additive overlay)
    flash(e, color, big) {
      const c = this.center(e, 0.55), h = e.h || 1.8;
      this.emit(c.x, c.y, c.z, 0, 0, 0, big ? 0.3 : 0.2, h * (big ? 1.6 : 1.15), color, 0, 0, 0.5);
      this.emit(c.x, c.y, c.z, 0, 0, 0, 0.12, h * 0.6, 0xffffff, 0, 0, 0.3);
      if (EB.models && e.model) EB.models.flinch(e.model);
    },
    // projectile bolt from a point to an entity: school-shaped head + trail + impact
    bolt(from, to, color, opt) {
      opt = opt || {};
      const school = opt.school || BYCOLOR[color] || null;
      const b = { p: from.clone(), to, color, school, R: school ? rec(school) : null, speed: opt.speed || 26, t: 0, max: 1.5, size: opt.size || 0.5, onHit: opt.onHit, kind: opt.kind || 'nuke', crit: !!opt.crit, big: !!opt.big, nums: null, done: false };
      this.bolts.push(b);
      return b;
    },
    impact(e, school, o) {
      o = o || {};
      const R = rec(school), tp = e.pos ? this.center(e, 0.6).clone() : e, big = o.crit || o.big;
      const n = big ? 46 : 30;
      this.sburst(tp, school, n, big ? 6 : 4.5, (o.size || 0.5) * 0.5, 0.65);
      if (school === 'fire') { this.burst(tp, 0xffd060, this.k(16), 2, 0.45, 0.9, 2.5, 0, 0xff2000, 2.5); }
      if (school === 'cold') { for (let i = 0; i < this.k(14); i++) { const a = Math.random() * 6.28; this.emit(tp.x, tp.y + 0.2, tp.z, Math.cos(a) * rnd(2, 5), rnd(2, 5), Math.sin(a) * rnd(2, 5), 0.9, rnd(0.25, 0.4), 0xffffff, -14, 0.5, 0, 2, 0x60b0ff); } }
      if (school === 'life' || school === 'shadow') { for (let i = 0; i < this.k(14); i++) { const a = Math.random() * 6.28; this.emit(tp.x + Math.cos(a) * 0.6, tp.y + rnd(-0.4, 0.5), tp.z + Math.sin(a) * 0.6, -Math.cos(a) * 1.5, 0.3, -Math.sin(a) * 1.5, 0.6, 0.3, R.c, 0, 1, 0, 0, R.c2); } }
      if (e.pos) {
        this.flash(e, R.c2 === 0x900020 ? R.ring : R.ring, big);
        if (o.kind === 'dot') this.decal(e.pos.x, this.ground(e), e.pos.z, { kind: 2, color: R.puddle, r0: 0.4, r1: 1.3, dur: 1.4 });
        else this.ring(e, R.ring, big ? 2.6 : 1.7, big ? 0.6 : 0.45);
        if (big) this.shockwave(e, R.ring, 4.5);
      }
      this.light(tp, R.light, big ? 3.2 : 2.2, big ? 0.4 : 0.28);
      if (o.crit) this.shake(0.16);
      this.sound(school, 'impact');
    },
    spell(src, from, t, school, kind, o) {
      o = o || {};
      const color = SCHOOL[school] || 0xffffff;
      if (kind === 'heal') { this.heal(t); return; }
      if (kind === 'buff') { this.buff(t, color); return; }
      if (kind === 'mez') { return this.bolt(from, t, 0xd080ff, { school: 'mind', kind: 'mez', size: 0.45, speed: 18, onHit: () => { this.decal(t.pos.x, this.ground(t), t.pos.z, { kind: 1, color: 0xc070ff, r0: 1.6, r1: 0.6, dur: 0.9, spin: 3 }); this.stars(t, 2.5); } }); }
      if (kind === 'stun') { return this.bolt(from, t, 0xfff080, { school: 'magic', kind: 'stun', size: 0.5, speed: 30, big: true, onHit: () => this.stars(t, 1.6) }); }
      return this.bolt(from, t, color, { school, kind, size: (kind === 'dot' ? 0.45 : 0.65) * (o.big ? 1.6 : 1), speed: kind === 'dot' ? 18 : 28, crit: o.crit, big: o.big, onHit: o.onHit });
    },
    // v10 signature effects for OP actives, weapon procs and clickies
    signature(kind, e, color, src) {
      this.counts.sig[kind] = (this.counts.sig[kind] || 0) + 1;
      color = color || 0xffe070;
      const c = this.center(e, 0.5).clone();
      switch (kind) {
        case 'op': // generic OP-active activation on the user: golden rune circle, rising helix, shockwave
          this.decal(e.pos.x, this.ground(e), e.pos.z, { kind: 1, color, r0: 0.5, r1: 2.0, dur: 1.4, spin: 2.5, follow: e });
          this.emitters.push({ e, t: 0, dur: 1.2, kind: 'helix', color, c2: 0xffffff, acc: 0 });
          this.shockwave(e, color, 5); this.light(c, color, 3, 0.6); this.shake(0.07); this.sound('holy', 'release');
          break;
        case 'fade':
          this.burst(c, 0x9090a0, 50, 2.5, 0.7, 1.4, 0.6, 0, 0x202030, 0.3); this.ring(e, 0xa0a0c0, 2.6, 0.8); this.sound('shadow', 'impact');
          break;
        case 'chain': // proc: jagged lightning arc from e to src (an entity)
          if (src) { const a = c, b = this.center(src, 0.6).clone(), seg = this.high ? 14 : 7;
            for (let i = 0; i <= seg; i++) { const f = i / seg, j = i && i < seg ? 0.35 : 0; this.emit(a.x + (b.x - a.x) * f + rnd(-j, j), a.y + (b.y - a.y) * f + rnd(-j, j), a.z + (b.z - a.z) * f + rnd(-j, j), 0, 0, 0, 0.3, 0.28, 0xffffff, 0, 0, 0, 1, color); }
            this.light(b, color, 2.5, 0.2); this.sound('magic', 'impact'); }
          break;
        case 'tapflow': // proc/spell lifetap: red wisps fly from the target back to the caster
          if (src) { const b = this.center(src, 0.6); for (let i = 0; i < this.k(18); i++) { const p = c.clone().add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4))); const v = b.clone().sub(p).multiplyScalar(1.6); this.emit(p.x, p.y, p.z, v.x, v.y + rnd(-0.5, 0.5), v.z, 0.6, 0.28, 0xff6080, 0, 0, 0, 0, 0x800020); } }
          break;
        case 'frostnova':
          for (let i = 0; i < this.k(24); i++) { const a = i / 24 * 6.28; this.emit(e.pos.x + Math.cos(a) * 0.4, e.pos.y + 0.3, e.pos.z + Math.sin(a) * 0.4, Math.cos(a) * 5, 1.5, Math.sin(a) * 5, 0.7, 0.35, 0xffffff, -6, 1.5, 0, 2, 0x60b0ff); }
          this.shockwave(e, 0x9ee8ff, 3.5);
          break;
        case 'pillar': // fire/disease proc: a short pillar of school fire at the target
          this.emitters.push({ e, t: 0, dur: 0.8, kind: 'column', color, acc: 0, fast: true }); this.ring(e, color, 2, 0.6);
          break;
        case 'click': // clicky items: a crisp rune flash + sparkle burst in the item's colour
          this.decal(e.pos.x, this.ground(e), e.pos.z, { kind: 1, color, r0: 1.4, r1: 0.6, dur: 0.9, spin: -3, follow: e });
          this.burst(c, color, 36, 4, 0.3, 0.7, 1.2, 1, 0xffffff, -1); this.light(c, color, 2.2, 0.4); this.sound('magic', 'release');
          break;
      }
    },
    sound(school, phase) {
      if (!EB.audio || !EB.audio.sfx) return;
      const k = school + phase; this._snd = this._snd || {};
      if (this._snd[k] && this.now - this._snd[k] < 0.07) return;
      this._snd[k] = this.now; this.counts.sounds++;
      EB.audio.sfx(school, phase);
    },
    update(dt, camera, renderer) {
      if (!this.pts) return;
      this.now += dt;
      if (renderer) this.uScale.value = renderer.domElement.height * 0.5 / Math.tan((camera.fov * Math.PI) / 360);
      // emitters
      this.emitters = this.emitters.filter((em) => {
        em.t += dt;
        const e = em.e; if (!e) return false;
        const h = e.h || 1.8, bx = e.pos.x, by = e.pos.y, bz = e.pos.z, r = Math.max(0.5, (e.hw || 0.3) * 2);
        em.acc += dt * (this.high ? (em.kind === 'heal' ? 50 : 60) : 22);
        while (em.acc > 1) {
          em.acc -= 1;
          if (em.kind === 'heal') { // rising spiral of sparkles + soft motes
            const a = em.t * 7 + Math.random() * 0.6 + (Math.random() < 0.5 ? Math.PI : 0), rr = r * (0.7 + Math.random() * 0.3);
            this.emit(bx + Math.cos(a) * rr, by + (em.t / em.dur) * h * 0.9 + Math.random() * 0.3, bz + Math.sin(a) * rr, -Math.sin(a) * 0.8, 1.2 + Math.random(), Math.cos(a) * 0.8, 0.9, 0.12 + Math.random() * 0.12, 0xffffff, 0, 0.5, 0, Math.random() < 0.6 ? 1 : 0, em.color);
          } else if (em.kind === 'swirl' || em.kind === 'helix') {
            const a = em.t * 9 + Math.random() * 0.4, y = by + (em.t / em.dur) * h * (em.kind === 'helix' ? 1.4 : 1);
            for (const s of [0, Math.PI]) this.emit(bx + Math.cos(a + s) * r, y, bz + Math.sin(a + s) * r, 0, 0.4, 0, 0.7, 0.24, em.color, 0, 1, 0, s ? 1 : 0, em.c2 || 0xffffff);
          } else if (em.kind === 'spiralDown') {
            const a = em.t * 10 + Math.random() * 0.3, y = by + h * 1.8 * (1 - em.t / em.dur), rr = r * (1.4 - em.t / em.dur);
            for (const s of [0, 2.094, 4.188]) this.emit(bx + Math.cos(a + s) * rr, y, bz + Math.sin(a + s) * rr, 0, -0.5, 0, 0.6, 0.3, em.color, 0, 1, 0, s ? 0 : 1, em.c2);
          } else if (em.kind === 'bones') {
            const a = Math.random() * 6.28, rr = r * Math.random();
            this.emit(bx + Math.cos(a) * rr, by + 0.05, bz + Math.sin(a) * rr, Math.cos(a) * 0.4, 3 + Math.random() * 2, Math.sin(a) * 0.4, 0.7, 0.26, em.color, -5, 0.5, 0, 2, 0x80ff60);
          } else if (em.kind === 'stars') {
            const a = em.t * 5 + Math.random() * 6.28, rr = r * 0.6;
            this.emit(bx + Math.cos(a) * rr, by + h + 0.15, bz + Math.sin(a) * rr, -Math.sin(a) * 1.4, 0.1, Math.cos(a) * 1.4, 0.35, 0.26, em.color, 0, 0, 0, 1);
          } else if (em.kind === 'column') {
            const a = Math.random() * Math.PI * 2, rr = r * 0.8 * Math.random();
            this.emit(bx + Math.cos(a) * rr, by + 0.1, bz + Math.sin(a) * rr, 0, 3 + Math.random() * 3, 0, 0.8, 0.28, em.color, 0, 0.3, 0, Math.random() < 0.3 ? 1 : 0, 0xffffff);
          }
        }
        return em.t < em.dur && (e.alive !== false || em.kind === 'column');
      });
      // bolts
      this.bolts = this.bolts.filter((b) => {
        b.t += dt;
        const tp = b.to.pos ? this.center(b.to, 0.6).clone() : b.to;
        const d = tp.clone().sub(b.p), L = d.length(), step = b.speed * dt;
        if (L <= step || b.t > b.max) {
          if (b.school) this.impact(b.to.pos ? b.to : tp, b.school, { kind: b.kind, crit: b.crit, big: b.big, size: b.size });
          else { this.burst(tp, b.color, 26, 4.5, b.size * 0.4, 0.55); this.emit(tp.x, tp.y, tp.z, 0, 0, 0, 0.22, b.size * 1.6, b.color, 0, 0, 2); }
          b.done = true;
          if (b.nums && b.to.pos) for (const nm of b.nums) this.number(b.to, nm[0], nm[1], nm[2]);
          if (b.onHit) b.onHit();
          return false;
        }
        d.multiplyScalar(step / L); b.p.add(d);
        const R = b.R, c1 = R ? R.c : b.color, c2 = R ? R.c2 : b.color;
        this.emit(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0.06, b.size * 0.9, 0xffffff, 0, 0);
        this.emit(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0.09, b.size * 1.5, b.color, 0, 0);
        const tr = this.high ? 4 : 2, mode = R ? R.trail : 'spark';
        for (let i = 0; i < tr; i++) {
          const x = b.p.x - d.x * i / tr, y = b.p.y - d.y * i / tr, z = b.p.z - d.z * i / tr;
          if (mode === 'ember') this.emit(x, y, z, rnd(-0.4, 0.4), rnd(0.5, 1.5), rnd(-0.4, 0.4), rnd(0.3, 0.55), b.size * rnd(0.4, 0.7), c1, R.grav, 1.2, -0.6, i % 2 ? 1 : 0, c2);
          else if (mode === 'shard') this.emit(x, y, z, rnd(-0.6, 0.6), rnd(-0.2, 0.6), rnd(-0.6, 0.6), rnd(0.35, 0.6), b.size * rnd(0.35, 0.55), 0xffffff, -6, 0.6, 0, 2, c2);
          else if (mode === 'bubble') this.emit(x, y, z, rnd(-0.3, 0.3), rnd(0.2, 0.6), rnd(-0.3, 0.3), rnd(0.4, 0.7), b.size * rnd(0.35, 0.6), c1, 0.6, 1, 0.4, 3, c2);
          else if (mode === 'helix') { const a = b.t * 28 + i, ox = Math.cos(a) * 0.22, oy = Math.sin(a) * 0.22; this.emit(x + ox, y + oy, z - ox, 0, 0, 0, 0.35, b.size * 0.45, c1, 0, 1, 0, 1, c2); this.emit(x - ox, y - oy, z + ox, 0, 0, 0, 0.35, b.size * 0.4, c2, 0, 1, 0, 0, c2); }
          else this.emit(x, y, z, rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3), 0.25 + Math.random() * 0.2, b.size * 0.45, c1, 0, 1.5, 0, 1, c2);
        }
        return true;
      });
      // integrate particles (swap-remove dead), colour over life
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.kill(i); continue; }
        const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vel[i3 + 1] += this.grav[i] * dt;
        this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
        this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        const f = this.life[i] / this.max[i], u = 1 - f;
        this.colA[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * u; this.colA[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * u; this.colA[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * u;
        this.alpha[i] = Math.min(1, f * 2.2) * (f > 0.9 ? (1 - f) * 10 : 1);
        this.size[i] = this.s0[i] * Math.max(0.05, 1 + this.grow[i] * u);
        i++;
      }
      const g = this.pts.geometry;
      g.setDrawRange(0, this.n);
      for (const k of ['position', 'color', 'size', 'alpha', 'shape']) g.attributes[k].needsUpdate = true;
      // decals
      for (const d of this.decals) {
        if (!d.live) continue;
        d.t += dt;
        if (d.keep) { d.ttl -= dt; if (d.ttl <= 0) { d.keep = 0; d.dur = d.t + 0.3; d.fadeOut = true; } }
        if (d.t >= d.dur || (d.follow && d.follow.alive === false && !d.fadeOut)) { d.live = false; d.mesh.visible = false; continue; }
        if (d.follow) { d.x = d.follow.pos.x; d.z = d.follow.pos.z; d.y = this.ground(d.follow); }
        const f = d.keep ? 0 : Math.min(1, d.t / d.dur), e = 1 - Math.pow(1 - f, 3);
        const s = d.fadeOut ? d.r1 : d.r0 + (d.r1 - d.r0) * e;
        d.mesh.position.set(d.x, d.y, d.z); d.mesh.scale.set(s, 1, s); d.mesh.rotation.y += d.spin * dt;
        d.u.uT.value = d.t; d.u.uA.value = d.a * (d.fadeOut ? Math.max(0, (d.dur - d.t) / 0.3) : d.keep ? Math.min(1, d.t * 5) : (d.kind === 2 ? Math.min(1, (1 - f) * 2.5) : 1 - f * f));
      }
      // lights
      for (const l of this.lights) { if (l.dur <= 0) continue; l.t += dt; const f = Math.min(1, l.t / l.dur); l.L.intensity = this.high ? l.I * (1 - f) * (1 - f) : 0; if (f >= 1) { l.dur = 0; l.L.intensity = 0; } }
      // floating numbers + CC tags (projected DOM)
      if (camera && this.nums.length) {
        const W = window.innerWidth, H = window.innerHeight, v = this.tmp2;
        for (const n of this.nums) {
          if (!n.live) continue;
          n.t += dt;
          if (n.cc) { n.ttl -= dt; if (n.ttl <= 0 || n.e.alive === false) { n.live = false; n.el.remove(); continue; } }
          else if (n.t >= n.dur || !n.e.pos) { n.live = false; n.el.style.display = 'none'; continue; }
          const e = n.e, f = n.cc ? 0 : n.t / n.dur;
          v.set(e.pos.x + (n.cc ? 0 : n.dx), e.pos.y + (n.cc ? (e.h || 1.8) + 0.85 + Math.sin(this.now * 3) * 0.06 : n.y0 + f * 1.1), e.pos.z).project(camera);
          if (v.z > 1 || v.z < -1) { n.el.style.display = 'none'; continue; }
          n.el.style.display = 'block';
          const pop = n.cc ? 1 : (f < 0.12 ? 0.6 + f / 0.12 * 0.7 : 1.3 - Math.min(0.3, (f - 0.12) * 1.5));
          n.el.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px,${((1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
          n.el.style.opacity = n.cc ? 1 : Math.min(1, (1 - f) * 3).toFixed(2);
        }
      }
    },
    kill(i) {
      const j = --this.n;
      if (i !== j) {
        const i3 = i * 3, j3 = j * 3;
        for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[j3 + k]; this.vel[i3 + k] = this.vel[j3 + k]; this.colA[i3 + k] = this.colA[j3 + k]; this.c0[i3 + k] = this.c0[j3 + k]; this.c1[i3 + k] = this.c1[j3 + k]; }
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.s0[i] = this.s0[j]; this.grow[i] = this.grow[j]; this.shape[i] = this.shape[j];
      }
    },
    clear() { this.n = 0; this.bolts = []; this.emitters = []; for (const d of this.decals) { d.live = false; d.mesh.visible = false; } for (const n of this.nums) { n.live = false; if (n.cc) n.el.remove(); else n.el.style.display = 'none'; } this.nums = this.nums.filter((n) => !n.cc); },
    SCHOOL,
  };
  EB.fx = FX;
})();
