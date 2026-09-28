// Everblock - entities: blocky models, nameplates, mobs, NPCs, corpses
(function () {
  const EB = window.EB;
  const U = EB.util;
  const { MOBS, conColor, CON_HEX, ITEMS } = EB.data;
  const Nav = EB.path.Nav;

  const matCache = {};
  function mat(color, emissive) {
    const k = color + ':' + (emissive || 0);
    if (!matCache[k]) matCache[k] = new THREE.MeshLambertMaterial({ color, emissive: emissive || 0 });
    return matCache[k];
  }
  const boxGeoCache = {};
  function box(w, h, d, color, emissive) {
    const k = w + ',' + h + ',' + d;
    if (!boxGeoCache[k]) boxGeoCache[k] = new THREE.BoxGeometry(w, h, d);
    return new THREE.Mesh(boxGeoCache[k], mat(color, emissive));
  }
  function shade(color, f) {
    const c = new THREE.Color(color); c.multiplyScalar(f); return c.getHex();
  }
  function limb(w, h, d, color, px, py, pz) {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, pz);
    const m = box(w, h, d, color); m.position.y = -h / 2; pivot.add(m);
    return pivot;
  }

  // Build a blocky model. Model faces +Z. Returns {group, parts, height, width}
  function buildModel(o) {
    const g = new THREE.Group();
    const inner = new THREE.Group(); g.add(inner);
    const parts = {};
    const s = o.scale || 1;
    let height = 1.95 * s, width = 0.6 * s;
    if (o.model === 'biped') {
      const t = o.thin ? 0.6 : 1;
      const body = o.color, skin = o.skin != null ? o.skin : o.color, legs = o.legColor != null ? o.legColor : shade(o.color, 0.7);
      parts.legL = limb(0.24 * t, 0.75, 0.24 * t, legs, -0.13, 0.75, 0); inner.add(parts.legL);
      parts.legR = limb(0.24 * t, 0.75, 0.24 * t, legs, 0.13, 0.75, 0); inner.add(parts.legR);
      parts.body = box(0.52 * (o.thin ? 0.7 : 1), 0.75, 0.3 * t, body); parts.body.position.y = 1.12; inner.add(parts.body);
      parts.armL = limb(0.18 * t, 0.7, 0.18 * t, skin, -0.36 * (o.thin ? 0.8 : 1), 1.48, 0); inner.add(parts.armL);
      parts.armR = limb(0.18 * t, 0.7, 0.18 * t, skin, 0.36 * (o.thin ? 0.8 : 1), 1.48, 0); inner.add(parts.armR);
      parts.head = new THREE.Group(); parts.head.position.y = 1.5; inner.add(parts.head);
      const head = box(0.44, 0.44, 0.44, skin, o.glow ? shade(o.glow, 0.15) : 0); head.position.y = 0.22; parts.head.add(head);
      if (o.hair != null) { const hair = box(0.46, 0.12, 0.46, o.hair); hair.position.y = 0.44; parts.head.add(hair); const back = box(0.46, 0.3, 0.1, o.hair); back.position.set(0, 0.28, -0.2); parts.head.add(back); }
      if (o.snout) { const sn = box(0.22, 0.18, 0.22, shade(skin, 0.8)); sn.position.set(0, 0.14, 0.3); parts.head.add(sn); const e1 = box(0.1, 0.16, 0.06, skin); e1.position.set(-0.16, 0.5, 0); parts.head.add(e1); const e2 = e1.clone(); e2.position.x = 0.16; parts.head.add(e2); }
      const eyeC = o.glow || (o.thin ? 0x220000 : 0x111111);
      const eye1 = box(0.08, 0.06, 0.02, eyeC, o.glow || 0); eye1.position.set(-0.1, 0.26, 0.225); parts.head.add(eye1);
      const eye2 = eye1.clone(); eye2.position.x = 0.1; parts.head.add(eye2);
      if (o.weapon) { const w = box(0.06, 0.08, 0.9, 0xb0b0c0); w.position.set(0, -0.62, 0.38); parts.armR.add(w); parts.weapon = w; }
      if (o.helm) { const h = box(0.5, 0.2, 0.5, o.helm); h.position.y = 0.42; parts.head.add(h); }
      if (o.shield) { const sh = box(0.08, 0.5, 0.4, o.shield); sh.position.set(-0.1, -0.4, 0.05); parts.armL.add(sh); }
    } else if (o.model === 'quad') {
      const c = o.color, dk = shade(c, 0.75);
      parts.body = box(0.55, 0.45, 1.0, c); parts.body.position.set(0, 0.62, 0); inner.add(parts.body);
      parts.head = new THREE.Group(); parts.head.position.set(0, 0.75, 0.55); inner.add(parts.head);
      const hd = box(0.38, 0.36, 0.4, c); hd.position.set(0, 0.02, 0.15); parts.head.add(hd);
      const sn = box(0.2, 0.16, 0.2, dk); sn.position.set(0, -0.05, 0.42); parts.head.add(sn);
      const e1 = box(0.06, 0.06, 0.02, 0xff2020, 0x550000); e1.position.set(-0.11, 0.08, 0.36); parts.head.add(e1);
      const e2 = e1.clone(); e2.position.x = 0.11; parts.head.add(e2);
      const ear1 = box(0.1, 0.14, 0.05, dk); ear1.position.set(-0.13, 0.24, 0.08); parts.head.add(ear1);
      const ear2 = ear1.clone(); ear2.position.x = 0.13; parts.head.add(ear2);
      parts.legL = limb(0.14, 0.42, 0.14, dk, -0.2, 0.42, 0.35); inner.add(parts.legL);
      parts.legR = limb(0.14, 0.42, 0.14, dk, 0.2, 0.42, 0.35); inner.add(parts.legR);
      parts.legL2 = limb(0.14, 0.42, 0.14, dk, -0.2, 0.42, -0.35); inner.add(parts.legL2);
      parts.legR2 = limb(0.14, 0.42, 0.14, dk, 0.2, 0.42, -0.35); inner.add(parts.legR2);
      const tail = box(0.07, 0.07, 0.6, dk); tail.position.set(0, 0.65, -0.78); tail.rotation.x = 0.3; inner.add(tail);
      height = 1.0 * s; width = 0.8 * s;
    } else if (o.model === 'snake') {
      parts.segs = [];
      for (let i = 0; i < 6; i++) {
        const sg = box(0.26, 0.2, 0.34, i % 2 ? o.color : shade(o.color, 0.8)); sg.position.set(0, 0.1, 0.6 - i * 0.3); inner.add(sg); parts.segs.push(sg);
      }
      const hd = box(0.32, 0.22, 0.34, shade(o.color, 1.1)); hd.position.set(0, 0.16, 0.9); inner.add(hd);
      const e1 = box(0.05, 0.05, 0.02, 0xffee00, 0x444400); e1.position.set(-0.1, 0.22, 1.07); inner.add(e1);
      const e2 = e1.clone(); e2.position.x = 0.1; inner.add(e2);
      height = 0.4 * s; width = 0.7 * s;
    }
    inner.scale.setScalar(s);
    return { group: g, inner, parts, height, width, model: o.model };
  }

  function animateModel(M, walkPhase, moving, attackT, sitting) {
    const p = M.parts;
    const sw = moving ? Math.sin(walkPhase) * 0.7 : 0;
    if (M.model === 'biped') {
      p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
      p.armL.rotation.x = -sw * 0.8;
      p.armR.rotation.x = attackT > 0 ? -2.2 * Math.sin(attackT * Math.PI) : sw * 0.8;
      if (sitting) { p.legL.rotation.x = p.legR.rotation.x = -1.5; M.inner.position.y = -0.6 * M.inner.scale.y; }
      else M.inner.position.y = 0;
    } else if (M.model === 'quad') {
      p.legL.rotation.x = sw; p.legR2.rotation.x = sw; p.legR.rotation.x = -sw; p.legL2.rotation.x = -sw;
      p.head.rotation.x = attackT > 0 ? 0.5 * Math.sin(attackT * Math.PI) : 0;
    } else if (M.model === 'snake') {
      p.segs.forEach((sg, i) => { sg.position.x = Math.sin(walkPhase * 0.8 + i * 0.9) * (moving ? 0.12 : 0.04); });
    }
  }

  function makeNameplate(text, color, sub) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv);
    const sm = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(sm);
    sp.scale.set(4.4, 0.82, 1);
    sp.renderOrder = 5;
    sp.userData.cv = cv; sp.userData.tex = tex;
    setNameplate(sp, text, color, sub);
    return sp;
  }
  function setNameplate(sp, text, color, sub) {
    const key = text + color + (sub || '');
    if (sp.userData.key === key) return;
    sp.userData.key = key;
    const cv = sp.userData.cv, ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const y = sub ? 34 : 48;
    ctx.strokeText(text, 256, y); ctx.fillStyle = color; ctx.fillText(text, 256, y);
    if (sub) { ctx.font = 'italic 24px Georgia, serif'; ctx.strokeText(sub, 256, 74); ctx.fillStyle = '#d8c89a'; ctx.fillText(sub, 256, 74); }
    sp.userData.tex.needsUpdate = true;
  }

  // ---------- physics ----------
  function collides(world, x, y, z, hw, h) {
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw), z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - 0.001);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (world.isSolid(xx, yy, zz)) return true;
    return false;
  }
  // moves e (pos, vel, hw, h) by vel*dt with collisions. returns {blocked, stepped}
  function physicsMove(world, e, dt, canStep) {
    const hw = e.hw, h = e.h, p = e.pos;
    let blocked = false, stepped = false;
    const inWater = world.isWater(p.x, p.y + 0.4, p.z);
    e.inWater = inWater;
    if (inWater) { e.vel.y = Math.max(e.vel.y - 8 * dt, -3); }
    else e.vel.y = Math.max(e.vel.y - 26 * dt, -40);
    const wm = inWater ? 0.6 : 1;
    // X
    let nx = p.x + e.vel.x * dt * wm;
    if (!collides(world, nx, p.y, p.z, hw, h)) p.x = nx;
    else if (canStep && (e.onGround || inWater) && !collides(world, nx, p.y + 1.01, p.z, hw, h) && !collides(world, p.x, p.y + 1.01, p.z, hw, h)) { p.y += 1.01; p.x = nx; stepped = true; }
    else blocked = true;
    // Z
    let nz = p.z + e.vel.z * dt * wm;
    if (!collides(world, p.x, p.y, nz, hw, h)) p.z = nz;
    else if (canStep && (e.onGround || inWater) && !collides(world, p.x, p.y + 1.01, nz, hw, h) && !collides(world, p.x, p.y + 1.01, p.z, hw, h)) { p.y += 1.01; p.z = nz; stepped = true; }
    else blocked = true;
    // Y
    let ny = p.y + e.vel.y * dt;
    e.onGround = false;
    if (!collides(world, p.x, ny, p.z, hw, h)) p.y = ny;
    else {
      if (e.vel.y < 0) { p.y = Math.floor(ny) + 1; if (collides(world, p.x, p.y, p.z, hw, h)) p.y = Math.ceil(p.y); e.onGround = true; }
      else p.y = Math.floor(ny + h) - h - 0.001;
      e.vel.y = 0;
    }
    if (p.y < -10) p.y = world.surfaceY(p.x, p.z) + 1;
    return { blocked, stepped };
  }

  let nextId = 1;
  class Entity {
    constructor(kind, name) { this.id = nextId++; this.kind = kind; this.name = name; this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.walkPhase = 0; this.attackT = 0; this.onGround = false; }
    dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z) + Math.max(0, Math.abs(this.pos.y - o.pos.y) - 1.5); }
    faceTo(x, z) { this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z); }
    syncModel() {
      this.model.group.position.copy(this.pos);
      this.model.group.rotation.y = this.yaw;
      if (this.plate) this.plate.position.set(this.pos.x, this.pos.y + this.h + 0.45, this.pos.z);
    }
    addTo(scene) { scene.add(this.model.group); if (this.plate) scene.add(this.plate); }
    removeFrom(scene) { scene.remove(this.model.group); if (this.plate) { scene.remove(this.plate); this.plate.material.map.dispose(); this.plate.material.dispose(); } }
  }

  // ---------- Mob ----------
  class Mob extends Entity {
    constructor(type, spawn, x, y, z, lvlOverride) {
      const def = MOBS[type];
      super('mob', def.name);
      this.type = type; this.def = def; this.spawn = spawn;
      const lr = lvlOverride || def.lvl;
      this.level = U.randInt(lr[0], lr[1]);
      this.maxHp = Math.floor((10 + this.level * this.level * 2 + this.level * 8) * (def.hpMult || 1));
      this.hp = this.maxHp;
      this.maxHit = Math.max(2, Math.floor((2 + this.level * 1.8) * (def.dmgMult || 1)));
      this.pos.set(x, y, z); this.home = new THREE.Vector3(x, y, z);
      this.model = buildModel(def);
      this.hw = Math.min(0.45, this.model.width / 2); this.h = Math.max(0.5, this.model.height * 0.95);
      this.state = 'idle'; this.target = null; this.swing = 1; this.wanderT = Math.random() * 5; this.wander = null;
      this.aggroCheck = Math.random() * 0.5; this.rootedUntil = 0; this.grpDamage = 0;
      this.hate = new Map(); this.hateT = 0; this.nav = new Nav(); this.casting = null; this.nextCast = 3 + Math.random() * 4;
      this.plate = makeNameplate(def.name, '#ffffff');
      this.yaw = Math.random() * Math.PI * 2;
    }
    get alive() { return this.state !== 'dead'; }
    refreshPlate(game) {
      if (!this.alive) { setNameplate(this.plate, this.corpseName(), '#b0a080'); return; }
      const c = conColor(game.player.level, this.level);
      setNameplate(this.plate, this.name, CON_HEX[c], this.def.named ? '(named)' : null);
    }
    corpseName() { return this.name + "'s corpse"; }
    con(game) { return conColor(game.player.level, this.level); }
    addHate(ent, amt) { if (!ent || !this.alive) return; this.hate.set(ent, (this.hate.get(ent) || 0) + amt); }
    topHate(game) {
      let best = null, bv = -1;
      for (const [e, v] of this.hate) {
        const valid = e === game.player ? game.player.alive : e.kind === 'merc' ? !e.dead && game.mercs.includes(e) : e.kind === 'npc';
        if (!valid) { this.hate.delete(e); continue; }
        if (v > bv) { bv = v; best = e; }
      }
      return best;
    }
    aggroOn(t, game, noSocial) {
      if (!this.alive) return;
      this.addHate(t, 1);
      if (this.state !== 'chase' && this.state !== 'flee') { this.state = 'chase'; this.target = t; this.swing = Math.min(this.swing, 0.8); this.nav.reset(); }
      if (!noSocial && this.def.social) {
        for (const m of game.mobs) {
          if (m !== this && m.alive && m.def.faction === this.def.faction && m.state !== 'chase' && m.state !== 'flee' && m.pos.distanceTo(this.pos) < 13) m.aggroOn(t, game, true);
        }
      }
    }
    die(game, killer) {
      this.state = 'dead'; this.target = null; this.vel.set(0, 0, 0); this.hate.clear(); this.casting = null;
      this.decay = this.def.named ? 420 : 240;
      this.model.inner.rotation.z = Math.PI / 2; this.model.inner.position.y = 0.2 * this.model.inner.scale.y;
      this.model.inner.traverse((o) => { if (o.isMesh) { o.material = mat(shade(o.material.color.getHex(), 0.55)); } });
      const L = this.level;
      this.loot = { coins: Math.random() < 0.8 ? U.randInt(0, L * 9 + 3) * (this.def.named ? 6 : 1) : 0, items: [] };
      for (const [id, ch] of this.def.loot || []) if (Math.random() < ch) this.loot.items.push({ id, count: 1 });
      this.refreshPlate(game);
      if (this.spawn) this.spawn.respawnAt = game.time + this.spawn.def.respawn * (0.85 + Math.random() * 0.3);
    }
    goHome() { this.state = 'return'; this.target = null; this.hate.clear(); this.casting = null; this.nav.reset(); }
    update(dt, game) {
      const world = game.world, pl = game.player;
      if (!this.alive) {
        this.decay -= dt;
        if (this.decay <= 0) game.removeEntity(this);
        return;
      }
      let dir = null, speed = this.def.speed;
      // crowd control: mesmerize / stun freeze the mob completely
      if (game.time < (this.mezUntil || 0) || game.time < (this.stunUntil || 0)) {
        this.casting = null; this.vel.x = this.vel.z = 0;
        physicsMove(world, this, dt, true);
        animateModel(this.model, this.walkPhase, false, 0, false);
        this.model.group.rotation.z = game.time < (this.mezUntil || 0) ? Math.sin(game.time * 2) * 0.06 : 0;
        this.syncModel();
        return;
      }
      this.model.group.rotation.z = 0;
      if (game.time < (this.snaredUntil || 0)) speed *= 0.5;
      if (this.state === 'idle' && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt);
      this.aggroCheck -= dt;
      if (this.aggroCheck <= 0) {
        this.aggroCheck = 0.5;
        if (this.state === 'idle' && this.def.aggressive && pl.alive && !pl.godMode) {
          const cands = [pl, ...game.mercs.filter((m) => !m.dead)];
          for (const t of cands) {
            const d = this.pos.distanceTo(t.pos);
            const c = this.con(game);
            const ignores = (c === 'grey' || c === 'green') && this.def.faction !== 'undead';
            if (d < this.def.aggro && !ignores && game.lineOfSight(this, t)) {
              this.aggroOn(t, game);
              if (this.def.named) game.log(`${U.cap(this.name)} says, 'You dare trespass here? Die!'`, 'say');
              break;
            }
          }
        }
      }
      if (this.state === 'chase') {
        this.hateT -= dt;
        if (this.hateT <= 0 || !this.target) { this.hateT = 0.5; this.target = this.topHate(game); }
        const t = this.target;
        if (!t || (t === pl && !pl.alive) || this.pos.distanceTo(this.home) > 120) this.goHome();
        else {
          if (this.def.flee && this.hp < this.maxHp * 0.18 && t.kind !== 'npc') { this.state = 'flee'; game.log(`${U.cap(this.name)} turns to flee!`, 'other'); }
          const d = this.dist(t);
          const reach = 1.35 + this.hw + (t.hw || 0.3) + (this.def.scale > 1.2 ? 0.3 + this.def.scale * 0.3 : 0);
          // spell casting mobs
          const cs = this.def.caster;
          if (this.casting) {
            this.casting.t -= dt; this.faceTo(t.pos.x, t.pos.z);
            if (this.casting.t <= 0) { const sp = this.casting.sp; this.casting = null; if (d < sp.range + 6) game.mobSpell(this, t, sp); }
          } else if (cs && this.nextCast <= game.time && d < cs.range && d > 2 && game.lineOfSight(this, t)) {
            this.casting = { sp: cs, t: cs.cast }; this.nextCast = game.time + cs.cd * (0.8 + Math.random() * 0.4);
            if (pl.pos.distanceTo(this.pos) < 45) game.log(`${U.cap(this.name)} begins to cast a spell. <${cs.name}>`, 'spell');
          }
          if (!this.casting) {
            if (d > reach * 0.85) dir = this.nav.steer(this, t.pos.x, t.pos.y, t.pos.z, game, reach * 0.8, dt);
            if (!dir) this.faceTo(t.pos.x, t.pos.z);
            this.swing -= dt;
            if (d <= reach + 0.4 && this.swing <= 0) {
              this.swing = this.def.delay * (0.9 + Math.random() * 0.2) * (game.time < (this.slowedUntil || 0) ? 1.65 : 1);
              this.attackT = 0.01;
              game.mobAttack(this, t);
            }
          }
        }
      } else if (this.state === 'flee') {
        const t = this.target || pl;
        const ang = Math.atan2(this.pos.x - t.pos.x, this.pos.z - t.pos.z);
        dir = { x: Math.sin(ang), z: Math.cos(ang) }; speed *= 0.65;
        if (this.pos.distanceTo(t.pos) > 45 || !pl.alive) this.goHome();
        if (this.hp > this.maxHp * 0.4) this.state = 'chase';
      } else if (this.state === 'return') {
        dir = this.nav.steer(this, this.home.x, this.home.y, this.home.z, game, 1.2, dt);
        speed *= 1.2;
        this.retT = (this.retT || 0) + dt;
        if (!dir || this.retT > 25) {
          if (this.retT > 25 && this.home.distanceTo(pl.pos) > 30) this.pos.copy(this.home);
          this.state = 'idle'; this.hp = this.maxHp; this.retT = 0; this.grpDamage = 0;
        }
      } else { // idle wander
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 4 + Math.random() * 8;
          const r = (this.spawn ? this.spawn.def.radius : 4);
          this.wander = Math.random() < 0.6 ? { x: this.home.x + (Math.random() * 2 - 1) * r, z: this.home.z + (Math.random() * 2 - 1) * r } : null;
          this.wanderStuck = 0;
        }
        if (this.wander) {
          const d = Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z);
          if (d < 0.6) this.wander = null;
          else { this.faceTo(this.wander.x, this.wander.z); dir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; speed *= 0.35; }
        }
      }
      if (game.time < this.rootedUntil) dir = null;
      if (dir) { this.yaw = Math.atan2(dir.x, dir.z); this.vel.x = dir.x * speed; this.vel.z = dir.z * speed; }
      else { this.vel.x = 0; this.vel.z = 0; }
      const moving = !!dir;
      const r = physicsMove(world, this, dt, true);
      if (moving && (r.blocked || dir.up) && this.onGround) this.vel.y = 7.5;
      if (r.blocked && moving && this.state === 'idle') { this.wanderStuck = (this.wanderStuck || 0) + dt; if (this.wanderStuck > 1) this.wander = null; }
      if (this.inWater && moving) this.vel.y = Math.max(this.vel.y, 1.5);
      if (moving) this.walkPhase += dt * speed * 2.2;
      if (this.attackT > 0) { this.attackT += dt * 3; if (this.attackT >= 1) this.attackT = 0; }
      animateModel(this.model, this.walkPhase, moving, this.casting ? 0.5 : this.attackT, false);
      this.syncModel();
    }
  }

  // ---------- NPC ----------
  class NPC extends Entity {
    constructor(d) {
      super('npc', d.name);
      this.npcKind = d.kind; this.level = d.kind === 'guard' ? 35 : 30;
      this.pos.set(d.x, d.y, d.z); this.home = this.pos.clone();
      const opts = { model: 'biped', color: d.color, skin: 0xe0b08a, hair: d.kind === 'guard' ? null : 0x3a2a1a, scale: d.kind === 'guard' ? 1.1 : 1.0 };
      if (d.kind === 'guard') { opts.helm = 0x9aa0b0; opts.weapon = true; opts.shield = 0x3a5aa0; opts.legColor = 0x6a6a7a; }
      this.model = buildModel(opts);
      this.hw = 0.3; this.h = this.model.height;
      this.maxHp = 3000; this.hp = 3000;
      const sub = d.sub || { merchant: '<Merchant>', trainer: '<Guildmaster>', binder: '<Soulbinder>', guard: '<Everblock Guard>', liaison: '<Mercenary Liaison>' }[d.kind];
      this.plate = makeNameplate(d.name, '#7fb0ff', sub);
      this.target = null; this.swing = 0; this.yaw = Math.PI; this.nav = new Nav();
    }
    get alive() { return true; }
    update(dt, game) {
      const pl = game.player;
      let dir = null, speed = 5;
      if (this.npcKind === 'guard') {
        if (this.target && (!this.target.alive || this.target.pos.distanceTo(this.home) > 34)) { this.target = null; }
        if (!this.target) {
          for (const m of game.mobs) {
            if (!m.alive) continue;
            const d = m.pos.distanceTo(this.pos);
            if (d < 15 && (m.state === 'chase' || m.state === 'flee') && m.pos.distanceTo(this.home) < 30) {
              this.target = m;
              if (game.player.pos.distanceTo(this.pos) < 40) game.log(`${this.name} shouts, 'Time to die ${m.name}!'`, 'shout');
              break;
            }
          }
        }
        if (this.target) {
          const t = this.target, d = this.dist(t);
          if (d > 1.9) dir = this.nav.steer(this, t.pos.x, t.pos.y, t.pos.z, game, 1.8, dt);
          if (!dir) this.faceTo(t.pos.x, t.pos.z);
          this.swing -= dt;
          if (d < 2.8 && this.swing <= 0) {
            this.swing = 2.0; this.attackT = 0.01;
            const dmg = U.randInt(12, 30);
            if (t.state !== 'chase' && t.state !== 'flee') t.aggroOn(this, game, true);
            if (pl.pos.distanceTo(this.pos) < 30) game.log(`${this.name} slashes ${t.name} for ${dmg} points of damage.`, 'other');
            game.damageMob(t, dmg, this);
          }
        } else {
          dir = this.nav.steer(this, this.home.x, this.home.y, this.home.z, game, 0.5, dt); speed = 3;
          if (!dir && pl.pos.distanceTo(this.pos) < 6) this.faceTo(pl.pos.x, pl.pos.z);
        }
      } else if (pl.pos.distanceTo(this.pos) < 8) this.faceTo(pl.pos.x, pl.pos.z);
      if (dir) { this.yaw = Math.atan2(dir.x, dir.z); this.vel.x = dir.x * speed; this.vel.z = dir.z * speed; } else { this.vel.x = this.vel.z = 0; }
      const r = physicsMove(game.world, this, dt, true);
      if (dir && r.blocked && this.onGround) this.vel.y = 7.5;
      if (dir) this.walkPhase += dt * 10;
      if (this.attackT > 0) { this.attackT += dt * 3; if (this.attackT >= 1) this.attackT = 0; }
      animateModel(this.model, this.walkPhase, !!dir, this.attackT, false);
      this.syncModel();
    }
  }

  // ---------- Player corpse ----------
  class PlayerCorpse extends Entity {
    constructor(owner, data) {
      super('pcorpse', owner.name + "'s corpse");
      this.pos.set(data.x, data.y, data.z);
      this.zone = data.zone || 'everblock';
      this.loot = { coins: data.coins || 0, items: data.items || [], equip: data.equip || {} };
      this.model = buildModel(owner.modelOpts());
      this.model.inner.rotation.z = Math.PI / 2; this.model.inner.position.y = 0.25;
      this.hw = 0.4; this.h = 0.6;
      this.plate = makeNameplate(this.name, '#ffcc66', '(your corpse)');
      this.syncModel();
    }
    get alive() { return false; }
    update() { this.syncModel(); }
    toSave() { return { zone: this.zone, x: this.pos.x, y: this.pos.y, z: this.pos.z, coins: this.loot.coins, items: this.loot.items, equip: this.loot.equip }; }
  }

  EB.ent = { mat, buildModel, animateModel, makeNameplate, setNameplate, physicsMove, collides, Mob, NPC, PlayerCorpse, Entity };
})();
