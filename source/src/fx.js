// Everblock v4 - pooled additive particle system (one THREE.Points draw call for every spell effect).
(function () {
  const EB = window.EB;
  const SCHOOL = { cold: 0x80d0ff, fire: 0xff7020, magic: 0xfff080, disease: 0x90d040, life: 0xff4070, heal: 0x9effa0, holy: 0xfff4b0, poison: 0x80e040, mind: 0xd080ff, shadow: 0xb060ff };
  const FX = {
    cap: 2400, n: 0, high: true, pts: null, bolts: [], emitters: [], tmp: new THREE.Vector3(), col: new THREE.Color(), counts: { spawned: 0 },
    init(scene) {
      const N = this.cap;
      this.pos = new Float32Array(N * 3); this.colA = new Float32Array(N * 3); this.size = new Float32Array(N); this.alpha = new Float32Array(N);
      this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N); this.grav = new Float32Array(N); this.drag = new Float32Array(N); this.s0 = new Float32Array(N); this.grow = new Float32Array(N);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.colA, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      this.uScale = { value: 400 };
      const m = new THREE.ShaderMaterial({
        uniforms: { uScale: this.uScale },
        vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;\n' +
          'void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 1.0, 128.0); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec3 vC; varying float vA;\n' +
          'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float core = exp(-r * r * 4.0); float a = (core * 0.85 + 0.15 * (1.0 - r)) * vA * 0.8; gl_FragColor = vec4(vC * (0.75 + core * 0.45), a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 10;
      scene.add(this.pts); this.scene = scene;
    },
    setHigh(h) { this.high = !!h; },
    emit(x, y, z, vx, vy, vz, life, size, color, grav, drag, grow) {
      if (!this.pts) return;
      const lim = this.high ? this.cap : this.cap / 3;
      if (this.n >= lim) return;
      const i = this.n++, i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.col.setHex(color); this.colA[i3] = this.col.r; this.colA[i3 + 1] = this.col.g; this.colA[i3 + 2] = this.col.b;
      this.life[i] = this.max[i] = life; this.s0[i] = size; this.size[i] = size; this.alpha[i] = 1; this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.grow[i] = grow || 0;
      this.counts.spawned++;
    },
    k(n) { return this.high ? n : Math.max(1, Math.ceil(n / 3)); },
    burst(p, color, n, speed, size, life, up) {
      n = this.k(n);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.8, s = speed * (0.4 + Math.random() * 0.6);
        this.emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (up || 0), Math.sin(a) * Math.cos(e) * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color, -2, 2.5);
      }
    },
    center(e, f) { return this.tmp.set(e.pos.x, e.pos.y + (e.h || 1.8) * (f == null ? 0.6 : f), e.pos.z); },
    // heal: rising green-gold sparkles swirling round the target
    heal(e, color) { this.emitters.push({ e, t: 0, dur: 1.1, kind: 'heal', color: color || SCHOOL.heal, acc: 0 }); },
    buff(e, color) { this.emitters.push({ e, t: 0, dur: 1.2, kind: 'swirl', color: color || 0xfff0a0, acc: 0 }); },
    stars(e, dur) { this.emitters.push({ e, t: 0, dur: dur || 1.5, kind: 'stars', color: 0xfff080, acc: 0 }); },
    column(e, color) { this.emitters.push({ e, t: 0, dur: 1.6, kind: 'column', color: color || 0xffe070, acc: 0 }); this.burst(this.center(e, 0.1), color || 0xffe070, 40, 4, 0.35, 0.9, 1); },
    summon(e) { this.burst(this.center(e, 0.2), 0xb060ff, 50, 3.5, 0.4, 1.0, 1.5); this.emitters.push({ e, t: 0, dur: 1.0, kind: 'column', color: 0x9040ff, acc: 0 }); },
    // DoT cloud: slow drifting puffs on the target (called each frame by the game; rate-limited here)
    cloud(e, color, dt) {
      e._cloudAcc = (e._cloudAcc || 0) + dt * (this.high ? 10 : 3);
      while (e._cloudAcc > 1) {
        e._cloudAcc -= 1;
        const r = (e.hw || 0.4) * 1.4, a = Math.random() * Math.PI * 2, c = this.center(e, 0.3 + Math.random() * 0.5);
        this.emit(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, 1.5, 0.5 + Math.random() * 0.3, color, 0, 0.6, 0.9);
      }
    },
    // cast glow: particles gathering at a hand position
    hand(p, color, dt) {
      const n = this.high ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.18;
        this.emit(p.x + Math.cos(a) * r, p.y + (Math.random() - 0.5) * r, p.z + Math.sin(a) * r, -Math.cos(a) * 0.6, 0.35, -Math.sin(a) * 0.6, 0.35, 0.1, color, 0, 1);
      }
      this.emit(p.x, p.y, p.z, 0, 0.1, 0, 0.1, 0.22, color, 0, 0);
    },
    // projectile bolt from a point to an entity: glowing head + trail + impact burst
    bolt(from, to, color, opt) {
      opt = opt || {};
      this.bolts.push({ p: from.clone(), to, color, speed: opt.speed || 26, t: 0, max: 1.5, size: opt.size || 0.5, onHit: opt.onHit, cloud: opt.cloud });
    },
    spell(src, from, t, school, kind) {
      const color = SCHOOL[school] || 0xffffff;
      if (kind === 'heal') { this.heal(t); return; }
      if (kind === 'buff') { this.buff(t, color); return; }
      if (kind === 'mez') { this.bolt(from, t, 0xd080ff, { size: 0.4, speed: 18, onHit: () => this.stars(t, 2.5) }); return; }
      if (kind === 'stun') { this.bolt(from, t, 0xfff080, { size: 0.45, speed: 30, onHit: () => this.stars(t, 1.6) }); return; }
      this.bolt(from, t, color, { size: kind === 'dot' ? 0.4 : 0.6, speed: kind === 'dot' ? 18 : 28 });
    },
    update(dt, camera, renderer) {
      if (!this.pts) return;
      if (renderer) this.uScale.value = renderer.domElement.height * 0.5 / Math.tan((camera.fov * Math.PI) / 360);
      // emitters
      this.emitters = this.emitters.filter((em) => {
        em.t += dt;
        const e = em.e; if (!e) return false;
        const h = e.h || 1.8, bx = e.pos.x, by = e.pos.y, bz = e.pos.z, r = Math.max(0.5, (e.hw || 0.3) * 2);
        em.acc += dt * (this.high ? (em.kind === 'heal' ? 45 : 60) : 16);
        while (em.acc > 1) {
          em.acc -= 1;
          if (em.kind === 'heal') {
            const a = Math.random() * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.5);
            this.emit(bx + Math.cos(a) * rr, by + Math.random() * h * 0.8, bz + Math.sin(a) * rr, -Math.sin(a) * 0.8, 1.2 + Math.random(), Math.cos(a) * 0.8, 0.9, 0.1 + Math.random() * 0.1, Math.random() < 0.25 ? 0xffffff : em.color, 0, 0.5);
          } else if (em.kind === 'swirl') {
            const a = em.t * 9 + Math.random() * 0.4, y = by + (em.t / em.dur) * h;
            for (const s of [0, Math.PI]) this.emit(bx + Math.cos(a + s) * r, y, bz + Math.sin(a + s) * r, 0, 0.4, 0, 0.6, 0.22, em.color, 0, 1);
          } else if (em.kind === 'stars') {
            const a = em.t * 5 + Math.random() * 6.28, rr = r * 0.6;
            this.emit(bx + Math.cos(a) * rr, by + h + 0.15, bz + Math.sin(a) * rr, -Math.sin(a) * 1.4, 0.1, Math.cos(a) * 1.4, 0.35, 0.2, em.color, 0, 0);
          } else if (em.kind === 'column') {
            const a = Math.random() * Math.PI * 2, rr = r * 0.8 * Math.random();
            this.emit(bx + Math.cos(a) * rr, by + 0.1, bz + Math.sin(a) * rr, 0, 3 + Math.random() * 3, 0, 0.8, 0.26, em.color, 0, 0.3);
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
          this.burst(tp, b.color, 26, 4.5, b.size * 0.4, 0.55);
          this.emit(tp.x, tp.y, tp.z, 0, 0, 0, 0.22, b.size * 1.6, b.color, 0, 0, 2);
          if (b.onHit) b.onHit();
          return false;
        }
        d.multiplyScalar(step / L); b.p.add(d);
        this.emit(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0.06, b.size * 0.9, 0xffffff, 0, 0);
        this.emit(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0.09, b.size * 1.3, b.color, 0, 0);
        const tr = this.high ? 4 : 1;
        for (let i = 0; i < tr; i++) this.emit(b.p.x - d.x * i / tr, b.p.y - d.y * i / tr, b.p.z - d.z * i / tr, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.2, b.size * 0.45, b.color, 0, 1.5);
        return true;
      });
      // integrate particles (swap-remove dead)
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.kill(i); continue; }
        const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vel[i3 + 1] += this.grav[i] * dt;
        this.vel[i3] *= dr; this.vel[i3 + 1] *= dr; this.vel[i3 + 2] *= dr;
        this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        const f = this.life[i] / this.max[i];
        this.alpha[i] = Math.min(1, f * 2.2) * (f > 0.9 ? (1 - f) * 10 : 1);
        this.size[i] = this.s0[i] * (1 + this.grow[i] * (1 - f));
        i++;
      }
      const g = this.pts.geometry;
      g.setDrawRange(0, this.n);
      for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
    },
    kill(i) {
      const j = --this.n;
      if (i !== j) {
        const i3 = i * 3, j3 = j * 3;
        for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[j3 + k]; this.vel[i3 + k] = this.vel[j3 + k]; this.colA[i3 + k] = this.colA[j3 + k]; }
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.s0[i] = this.s0[j]; this.grow[i] = this.grow[j];
      }
    },
    clear() { this.n = 0; this.bolts = []; this.emitters = []; },
    SCHOOL,
  };
  EB.fx = FX;
})();
