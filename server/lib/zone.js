// One running zone: the shared voxel world, NPC guards and every monster, simulated with the game's own Mob/NPC AI.
// Players and their mercs/pets appear to the AI as lightweight proxies whose positions come from their clients.
'use strict';
const { EB, THREE } = require('./shared');
const D = EB.data, U = EB.util;
const { Mob, NPC } = EB.ent;
const { B, BLOCKS, MOBS, conColor, CON_XP } = D;

const ST = { idle: 0, chase: 1, flee: 2, return: 3, dead: 4 };
const CC_FIELDS = ['mezUntil', 'stunUntil', 'snaredUntil', 'slowedUntil', 'rootedUntil'];
const r2 = (v) => Math.round(v * 100) / 100;

class ZoneSim {
  constructor(srv, zoneId) {
    this.srv = srv; this.id = zoneId;
    const t0 = Date.now();
    this.world = new EB.World(srv.seed, null, zoneId);
    this.world.generate();
    this.edits = srv.store.getZoneEdits(zoneId);
    this.world.applyEdits(this.edits);
    this.name = this.world.zoneName;
    this.time = 0; this.mobs = []; this.mercs = []; this.pathBudget = 6;
    this.npcs = this.world.npcs.map((d, i) => { const n = new NPC(d); n.idx = i; n.key = 'n' + i; return n; });
    this.slots = [];
    for (const def of this.world.spawns) for (let i = 0; i < def.count; i++) this.slots.push({ def, mob: null, respawnAt: 0 });
    this.sessions = new Set();
    this.spawnT = 0; this.editsDirty = false;
    this.nobody = { kind: 'player', pos: new THREE.Vector3(-1e5, -1e5, -1e5), alive: false, level: 1, faction: {}, hw: 0.3, h: 1.8, name: 'nobody' };
    this.player = this.nobody;
    this.updateSpawns(true);
    console.log(`[zone] ${this.name} (${zoneId}) ready in ${Date.now() - t0} ms: ${this.mobs.length} mobs, ${this.npcs.length} NPCs`);
  }

  // ---------------------------------------------------------------- AI hooks (see entities.js)
  proxies() { const a = []; for (const s of this.sessions) if (s.proxy) a.push(s.proxy); return a; }
  aggroCands(mob) {
    const out = [];
    for (const s of this.sessions) {
      const p = s.proxy; if (!p || !p.alive || p.godMode || p.zoning) continue;
      if (Math.abs(p.pos.x - mob.pos.x) > 40 || Math.abs(p.pos.z - mob.pos.z) > 40) continue;
      out.push(p); for (const m of p.mercs) if (!m.dead) out.push(m);
    }
    return out;
  }
  ownerOf(e) { return e.kind === 'merc' ? e.owner : e; }
  conFor(mob, t) { const o = this.ownerOf(t); return conColor(o.level || 1, mob.level); }
  factionKOSFor(mob, t) { const f = mob.def.faction; if (!D.FACTIONS[f]) return true; const o = this.ownerOf(t); const v = o.faction && typeof o.faction[f] === 'number' ? o.faction[f] : D.FACTIONS[f].start; return v < -750; }
  factionKOS(mob) { return this.factionKOSFor(mob, this.player); }
  validHate(e) {
    if (!e) return false;
    if (e.kind === 'player') return e.alive && e.zone === this && !e.gone;
    if (e.kind === 'merc') return !e.dead && e.owner.alive && e.owner.zone === this && !e.owner.gone && e.owner.mercs.includes(e);
    return e.kind === 'npc';
  }
  nearestPlayer(pos) {
    let best = null, bd = Infinity;
    for (const s of this.sessions) { const p = s.proxy; if (!p) continue; const d = p.pos.distanceToSquared(pos) + (p.alive ? 0 : 1e6); if (d < bd) { bd = d; best = p; } }
    return best || this.nobody;
  }
  lineOfSight(a, b) {
    const ay = a.pos.y + (a.eyeH || a.h * 0.8), by = b.pos.y + (b.eyeH || b.h * 0.8);
    const dx = b.pos.x - a.pos.x, dy = by - ay, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return true;
    return !this.world.raycast(a.pos.x, ay, a.pos.z, dx / d, dy / d, dz / d, d, (bb) => BLOCKS[bb].opaque);
  }
  isMezzed(m) { return this.time < (m.mezUntil || 0); }
  log(m, c) { // AI chatter ("begins to cast", "shouts for help") goes to players near the speaking entity
    const at = this._logPos; if (!at) return;
    for (const s of this.sessions) if (s.proxy && s.proxy.pos.distanceTo(at) < 50) s.send({ t: 'log', m, c });
  }
  removeEntity(e) {
    if (e.kind !== 'mob') return;
    const i = this.mobs.indexOf(e); if (i >= 0) this.mobs.splice(i, 1);
    this.broadcast({ t: 'gone', id: e.id });
    for (const s of this.sessions) s.known.delete(e.id);
  }

  // ---------------------------------------------------------------- combat (mob side)
  mobAttack(m, t) { this.sendHit(m, t, 'm'); }
  mobSpell(m, t, sp) { this.sendHit(m, t, 's'); this.broadcast({ t: 'fx', k: 'bolt', a: m.id, b: t.key, c: /frost|glacial/i.test(sp.name) ? 1 : 0 }); }
  sendHit(m, t, k) {
    if (t.kind === 'player') t.session.send({ t: 'ma', id: m.id, k });
    else if (t.kind === 'merc') t.owner.session.send({ t: 'ma', id: m.id, k, w: t.idx });
  }
  mobSupport(m, tg, s, type) {
    if (type === 'heal') {
      const amt = Array.isArray(s.amt) ? U.randInt(s.amt[0], s.amt[1]) : (s.amt || 0);
      const before = tg.hp; tg.hp = Math.min(tg.maxHp, tg.hp + amt + Math.floor(tg.maxHp * 0.04));
      const got = Math.round(tg.hp - before);
      this._logPos = m.pos; this.log(tg === m ? `${U.cap(m.name)} glows with renewed vigor. (${s.name}, +${got})` : `${U.cap(tg.name)} is healed by ${m.name}'s ${s.name}. (+${got})`, 'other');
      this.broadcast({ t: 'fx', k: 'heal', a: tg.id });
    } else {
      if (s.ward) { tg.wardUntil = this.time + s.dur; tg.ward = s.ward; }
      if (s.haste) { tg.hasteUntil = this.time + s.dur; tg.haste = s.haste; }
      this._logPos = m.pos; this.log(`${U.cap(tg.name)} ${s.ward ? 'is surrounded by a shimmering ward' : 'moves with unnatural speed'}. (${s.name})`, 'other');
      this.broadcast({ t: 'fx', k: 'buff', a: tg.id, c: s.color || 0xffd070 });
    }
    for (const [e] of tg.hate) if (e !== m) m.addHate(e, 1);
  }
  // credit key: a player's group (or the player alone); their mercs count for them
  creditKey(src) { if (!src) return null; const o = src.kind === 'merc' ? src.owner : src.kind === 'player' ? src : null; if (!o) return null; return o.session.group ? 'g' + o.session.group.id : 'p' + o.pid; }
  damageMob(m, dmg, src) {
    if (!m.alive) return;
    if (dmg > 0 && this.time < (m.wardUntil || 0)) dmg = Math.max(1, Math.round(dmg * (1 - (m.ward || 0))));
    m.hp -= dmg;
    if (dmg > 0 && this.time < (m.mezUntil || 0)) { m.mezUntil = 0; this._logPos = m.pos; this.log(`${U.cap(m.name)} has been awakened by ${src.name}.`, 'spell'); }
    const ck = this.creditKey(src);
    if (ck) { m.dmgBy = m.dmgBy || new Map(); m.dmgBy.set(ck, (m.dmgBy.get(ck) || 0) + dmg); m.grpDamage += dmg; }
    if (m.state !== 'chase' && m.state !== 'flee') m.aggroOn(src, this);
    m.addHate(src, dmg + 1);
    if (m.hp <= 0) this.killMob(m, src);
  }
  killMob(m, src) {
    let topK = null, topV = 0;
    if (m.dmgBy) for (const [k, v] of m.dmgBy) if (v > topV) { topV = v; topK = k; }
    const credited = topK && topV >= m.maxHp * 0.5 ? topK : null;
    this.broadcast({ t: 'die', id: m.id, by: src ? src.name : '', byKey: src ? src.key : '' });
    m.die(this, src);
    m.lootRights = credited; m.lootOpenAt = this.time + 120;
    if (credited) this.srv.awardKill(this, m, credited, src);
  }

  // ---------------------------------------------------------------- spawns
  updateSpawns(initial) {
    for (const s of this.slots) {
      if (s.mob && s.mob.alive) continue;
      if (this.time < s.respawnAt) continue;
      const def = s.def;
      let type = def.type;
      if (def.alt && Math.random() < def.altChance && !this.mobs.some((m) => m.alive && m.type === def.alt)) type = def.alt;
      let x = def.x + (Math.random() * 2 - 1) * def.radius * 0.6, z = def.z + (Math.random() * 2 - 1) * def.radius * 0.6;
      let y = def.y != null ? this.world.floorBelow(x, def.y + 1, z) : this.world.surfaceY(x, z);
      if (def.y == null && this.world.isWater(x, y, z)) { x = def.x; z = def.z; y = this.world.surfaceY(x, z); }
      if (!initial && this.proxies().some((p) => p.alive && Math.hypot(x - p.pos.x, z - p.pos.z) < 6)) continue;
      const m = new Mob(type, s, x, y, z, def.lvl);
      m.key = 'x' + m.id; m.atkSeq = 0;
      this.mobs.push(m); s.mob = m;
      if (m.def.named && !initial) { this._logPos = m.pos; this.log(`${m.name} shouts, 'You will all fall before me!'`, 'shout'); }
    }
  }

  // ---------------------------------------------------------------- tick
  step(dt) {
    this.time += dt;
    this.pathBudget = 5; // A* searches per zone per tick (20 Hz); the rest wait a tick
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1; this.updateSpawns(false); }
    if (!this.sessions.size) { for (const m of this.mobs.slice()) if (!m.alive || m.state !== 'idle') this.stepMob(m, dt); return; }
    const ps = this.proxies();
    for (const m of this.mobs.slice()) {
      if (m.alive && m.state === 'idle' && !ps.some((p) => Math.abs(p.pos.x - m.pos.x) < 140 && Math.abs(p.pos.z - m.pos.z) < 140)) continue;
      this.stepMob(m, dt);
    }
    for (const n of this.npcs) { this.player = this.nearestPlayer(n.pos); this._logPos = n.pos; n.update(dt, this); }
    this.player = this.nobody;
  }
  stepMob(m, dt) {
    this.player = this.nearestPlayer(m.pos); this._logPos = m.pos;
    const before = m.attackT;
    m.update(dt, this);
    if (m.attackT > 0 && before === 0) m.atkSeq = (m.atkSeq + 1) & 255;
  }

  // ---------------------------------------------------------------- replication
  mobFull(m) {
    return { id: m.id, type: m.type, lvl: m.level, hp: Math.max(0, Math.round(m.hp)), mhp: m.maxHp, mx: m.maxHit, x: r2(m.pos.x), y: r2(m.pos.y), z: r2(m.pos.z), yaw: r2(m.yaw), st: ST[m.state] };
  }
  mobTuple(m) {
    const t = this.time;
    const fl = (m.vel.x || m.vel.z ? 1 : 0) | (m.casting ? 2 : 0) | (t < (m.mezUntil || 0) ? 4 : 0) | (t < (m.stunUntil || 0) ? 8 : 0) | (t < (m.snaredUntil || 0) ? 16 : 0) | (t < (m.slowedUntil || 0) ? 32 : 0) | (t < (m.rootedUntil || 0) ? 64 : 0);
    const tup = [m.id, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), Math.max(0, Math.round(m.hp)), ST[m.state], m.target && m.target.key ? m.target.key : 0, fl, m.atkSeq];
    if (m.state === 'chase' && m.hate.size) {
      const h = []; for (const [e, v] of m.hate) if (e.key) h.push([e.key, Math.round(v)]);
      h.sort((a, b) => b[1] - a[1]); tup.push(h.slice(0, 8));
    }
    return tup;
  }
  snapCache() { // tuples + signatures are built once per tick and shared by every player's delta
    if (this._snapT === this.time && this._snap) return this._snap;
    const mobs = this.mobs.map((m) => { const tup = this.mobTuple(m); return { m, id: m.id, tup, sig: JSON.stringify(tup) }; });
    const players = [];
    for (const o of this.sessions) {
      if (!o.proxy || !o.proxy.ready) continue;
      const p = o.proxy;
      const tup = [p.pid, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), p.flags, p.atkSeq, Math.round(p.hp), p.mhp, p.mercs.map((c) => [r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r2(c.yaw), c.flags, c.atkSeq, Math.round(c.hp), c.mhp])];
      players.push({ s: o, pid: p.pid, tup, sig: JSON.stringify(tup) });
    }
    const npcs = [];
    for (const n of this.npcs) {
      if (n.npcKind !== 'guard') continue;
      const tup = [n.idx, r2(n.pos.x), r2(n.pos.y), r2(n.pos.z), r2(n.yaw), n.vel.x || n.vel.z ? 1 : 0, n.attackT > 0 ? 1 : 0];
      npcs.push({ idx: n.idx, tup, sig: JSON.stringify(tup) });
    }
    this._snapT = this.time; this._snap = { mobs, players, npcs };
    return this._snap;
  }
  snapshotFor(s) {
    const me = s.proxy; if (!me) return null;
    const c = this.snapCache();
    const spawn = [], mv = [], pl = [], np = [];
    for (const e of c.mobs) {
      const k = s.known.get(e.id);
      if (k === undefined) spawn.push(this.mobFull(e.m));
      if (k !== e.sig) { s.known.set(e.id, e.sig); mv.push(e.tup); }
    }
    for (const e of c.players) {
      if (e.s === s) continue;
      if (s.knownP.get(e.pid) !== e.sig) { s.knownP.set(e.pid, e.sig); pl.push(e.tup); }
    }
    for (const e of c.npcs) if (s.knownN.get(e.idx) !== e.sig) { s.knownN.set(e.idx, e.sig); np.push(e.tup); }
    if (!spawn.length && !mv.length && !pl.length && !np.length) return null;
    const o = { t: 's', T: r2(this.time) };
    if (spawn.length) o.sp = spawn; if (mv.length) o.m = mv; if (pl.length) o.p = pl; if (np.length) o.n = np;
    return o;
  }
  broadcast(msg, except) { const str = JSON.stringify(msg); for (const s of this.sessions) if (s !== except) s.sendRaw(str); }

  // ---------------------------------------------------------------- blocks
  setBlock(x, y, z, b) {
    if (!this.world.setBlock(x, y, z, b)) return false;
    const i = this.world.idx(x, y, z);
    this.edits[i] = b; this.editsDirty = true;
    return true;
  }
  flushEdits() { if (this.editsDirty) { this.editsDirty = false; this.srv.store.setZoneEdits(this.id, this.edits); } }
  mobById(id) { for (const m of this.mobs) if (m.id === id) return m; return null; }
}
ZoneSim.CC_FIELDS = CC_FIELDS;
module.exports = { ZoneSim, ST };
