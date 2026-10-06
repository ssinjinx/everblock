// Everblock multiplayer server core: accounts, characters, sessions, zones, groups, chat and the message protocol.
'use strict';
const crypto = require('crypto');
const { EB, THREE } = require('./shared');
const { ZoneSim } = require('./zone');
const { validateNewChar, sanitizeSave } = require('./sanitize');
const D = EB.data, U = EB.util;
const { B, BLOCKS, SPELLS, ITEMS, QUESTS, RACES, CLASSES, MERCS, conColor, CON_XP } = D;
const VERSION = '6.0.0';
const ZONE_IDS = Object.keys(EB.WORLD.ZONES);

// ---------------------------------------------------------------- passwords (scrypt)
function hashPass(pass) {
  return new Promise((res, rej) => { const salt = crypto.randomBytes(16); crypto.scrypt(pass, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(`scrypt$16384$${salt.toString('base64')}$${k.toString('base64')}`)); });
}
function checkPass(pass, stored) {
  return new Promise((res) => {
    const [kind, N, salt, hash] = String(stored).split('$');
    if (kind !== 'scrypt') return res(false);
    crypto.scrypt(pass, Buffer.from(salt, 'base64'), 64, { N: +N, r: 8, p: 1 }, (e, k) => { if (e) return res(false); const h = Buffer.from(hash, 'base64'); res(h.length === k.length && crypto.timingSafeEqual(h, k)); });
  });
}

// simple token bucket
class Bucket { constructor(cap, rate) { this.cap = cap; this.rate = rate; this.v = cap; this.t = Date.now(); } take(n = 1) { const now = Date.now(); this.v = Math.min(this.cap, this.v + ((now - this.t) / 1000) * this.rate); this.t = now; if (this.v < n) return false; this.v -= n; return true; } }
const ipBuckets = new Map();
function ipLimit(ip, kind, cap, perSec) { const k = ip + '|' + kind; let b = ipBuckets.get(k); if (!b) { b = new Bucket(cap, perSec); ipBuckets.set(k, b); } return b.take(); }

class Session {
  constructor(srv, ws, ip) {
    this.srv = srv; this.ws = ws; this.ip = ip; this.stage = 'auth';
    this.bucket = new Bucket(120, 60); this.chatBucket = new Bucket(8, 0.8); this.dmgBucket = null;
    this.known = new Map(); this.knownP = new Map(); this.knownN = new Map();
    this.account = null; this.rec = null; this.proxy = null; this.zone = null; this.group = null; this.invite = null; this.lastTell = null;
    this.strikes = 0; this.lastSaveAt = 0; this.pendingSave = null;
  }
  sendRaw(str) { if (this.ws.readyState === 1 && this.ws.bufferedAmount < 4e6) this.ws.send(str); }
  send(o) { this.sendRaw(JSON.stringify(o)); }
  sys(m, c) { this.send({ t: 'chat', c: c || 'sys', m }); }
  get name() { return this.rec ? this.rec.name : this.account ? this.account.username : '?'; }
}

class EverblockServer {
  constructor(opts) {
    this.opts = opts; this.store = opts.store; this.seed = opts.seed >>> 0;
    this.name = opts.name || 'Everblock'; this.motd = opts.motd || '';
    this.admins = new Set((opts.admins || []).map((s) => s.toLowerCase()));
    this.zones = new Map(); this.sessions = new Set(); this.byPid = new Map(); this.groups = new Map();
    this.nextPid = 1; this.nextGid = 1; this.dayT = 0.3; this.tickN = 0;
    this.started = Date.now();
    this.timer = setInterval(() => this.tick(0.05), 50);
    this.slowTimer = setInterval(() => this.slowTick(), 10000);
  }
  zone(id) { if (!EB.WORLD.ZONES[id]) id = 'everblock'; let z = this.zones.get(id); if (!z) { z = new ZoneSim(this, id); this.zones.set(id, z); } return z; }
  online() { return [...this.sessions].filter((s) => s.stage === 'play' && s.proxy); }
  info() { return { name: this.name, version: VERSION, online: this.online().length, motd: this.motd, register: this.opts.allowRegister !== false }; }

  // ---------------------------------------------------------------- connection lifecycle
  connect(ws, ip) {
    const perIp = [...this.sessions].filter((s) => s.ip === ip).length;
    if (perIp >= (this.opts.maxPerIp || 8)) { ws.close(1008, 'Too many connections from your address'); return; }
    if (this.sessions.size >= (this.opts.maxPlayers || 200)) { ws.close(1013, 'Server full'); return; }
    const s = new Session(this, ws, ip);
    this.sessions.add(s);
    ws.on('message', (data, isBinary) => {
      if (isBinary || data.length > 65536) return;
      if (!s.bucket.take()) { s.strikes++; if (s.strikes > 400) ws.close(1008, 'Flooding'); return; }
      let msg; try { msg = JSON.parse(data.toString()); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;
      try { this.handle(s, msg); } catch (e) { console.error('[msg]', msg.t, e); }
    });
    ws.on('close', () => this.disconnect(s));
    ws.on('error', () => {});
    s.send({ t: 'info', ...this.info() });
  }
  disconnect(s) {
    if (!this.sessions.has(s)) return;
    this.sessions.delete(s);
    this.leaveWorld(s, 'disconnect');
  }
  leaveWorld(s, why) {
    if (s.stage !== 'play') return;
    this.flushSave(s, true);
    this.leaveGroup(s, true);
    if (s.zone) this.removeFromZone(s);
    if (s.proxy) { s.proxy.gone = true; this.byPid.delete(s.proxy.pid); }
    s.proxy = null; s.rec = null; s.stage = 'select';
    console.log(`[play] ${s.account ? s.account.username : '?'} left the world (${why})`);
  }
  kick(s, reason) { s.send({ t: 'kicked', reason }); setTimeout(() => { try { s.ws.close(4000, reason); } catch (e) { /* ignore */ } }, 50); }

  // ---------------------------------------------------------------- routing
  handle(s, m) {
    if (m.t === 'ping') return s.send({ t: 'pong', c: m.c });
    if (s.stage === 'auth') {
      if (m.t === 'register') return this.register(s, m);
      if (m.t === 'login') return this.login(s, m);
      if (m.t === 'resume') return this.resume(s, m);
      return;
    }
    if (m.t === 'logout') { if (s.stage === 'play') this.leaveWorld(s, 'logout'); if (m.full) { if (s.token) this.store.deleteSession(s.token); s.account = null; s.stage = 'auth'; return s.send({ t: 'loggedout' }); } return this.sendChars(s); }
    if (s.stage === 'select') {
      if (m.t === 'create') return this.createChar(s, m);
      if (m.t === 'delete') return this.deleteChar(s, m);
      if (m.t === 'play') return this.play(s, m);
      if (m.t === 'chars') return this.sendChars(s);
      return;
    }
    if (s.stage !== 'play' || !s.proxy) return;
    const h = this['on_' + m.t];
    if (h) h.call(this, s, m);
  }

  // ---------------------------------------------------------------- accounts
  async register(s, m) {
    if (this.opts.allowRegister === false) return s.send({ t: 'auth', ok: false, err: 'Registration is closed on this server.' });
    const user = String(m.user || '').trim(), pass = String(m.pass || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(user)) return s.send({ t: 'auth', ok: false, err: 'Usernames are 3-16 letters, numbers or _.' });
    if (pass.length < 6 || pass.length > 128) return s.send({ t: 'auth', ok: false, err: 'Passwords must be at least 6 characters.' });
    if (!ipLimit(s.ip, 'reg', 5, 5 / 3600)) return s.send({ t: 'auth', ok: false, err: 'Too many new accounts from your address. Try again later.' });
    if (this.store.getAccountByName(user)) return s.send({ t: 'auth', ok: false, err: 'That username is taken.' });
    const hash = await hashPass(pass);
    if (this.store.getAccountByName(user)) return s.send({ t: 'auth', ok: false, err: 'That username is taken.' });
    const first = this.store.listAccounts().length === 0; // the very first account is the owner's (unless ADMINS names someone)
    const acc = this.store.createAccount(user, hash, (first && !this.admins.size) || this.admins.has(user.toLowerCase()));
    console.log(`[auth] new account ${user}${acc.admin ? ' (admin)' : ''}`);
    this.authed(s, acc);
  }
  async login(s, m) {
    if (!ipLimit(s.ip, 'login', 10, 10 / 60)) return s.send({ t: 'auth', ok: false, err: 'Too many login attempts. Wait a minute and try again.' });
    const acc = this.store.getAccountByName(String(m.user || '').trim());
    const ok = acc && (await checkPass(String(m.pass || ''), acc.pass));
    if (!ok) return s.send({ t: 'auth', ok: false, err: 'Wrong username or password.' });
    this.authed(s, acc);
  }
  resume(s, m) {
    const ses = this.store.getSession(String(m.token || ''));
    const acc = ses && this.store.getAccount(ses.account_id);
    if (!acc || Date.now() - ses.last > 30 * 864e5) return s.send({ t: 'auth', ok: false, err: 'Your session has expired. Please log in again.', expired: true });
    this.store.touchSession(ses.token);
    this.authed(s, acc, ses.token);
  }
  authed(s, acc, token) {
    if (acc.banned) return s.send({ t: 'auth', ok: false, err: 'This account is banned.' });
    if (!token) { token = crypto.randomBytes(24).toString('base64url'); this.store.createSession(token, acc.id); }
    if (this.admins.has(acc.username.toLowerCase()) && !acc.admin) acc.admin = 1;
    acc.last_login = Date.now(); this.store.updateAccount(acc);
    s.account = acc; s.token = token; s.stage = 'select';
    s.send({ t: 'auth', ok: true, user: acc.username, token, admin: !!acc.admin });
    this.sendChars(s);
  }
  isAdmin(s) { return !!(s.account && (s.account.admin || this.admins.has(s.account.username.toLowerCase()))); }
  sendChars(s) {
    const chars = this.store.listCharacters(s.account.id).map((c) => ({ id: c.id, name: c.name, race: c.race, cls: c.cls, level: c.level,
      zone: c.data && c.data.zone ? EB.WORLD.ZONES[c.data.zone].name : 'Everblock Keep', title: c.data && c.data.char ? c.data.char.title : '', equip: c.data && c.data.char ? c.data.char.equip : null }));
    s.send({ t: 'chars', chars, seed: this.seed });
  }
  createChar(s, m) {
    const v = validateNewChar(m.char);
    if (typeof v === 'string') return s.send({ t: 'err', where: 'create', err: v });
    if (this.store.getCharacterByName(v.name)) return s.send({ t: 'err', where: 'create', err: 'That name is already taken on this server.' });
    if (this.store.listCharacters(s.account.id).length >= 8) return s.send({ t: 'err', where: 'create', err: 'You already have 8 characters. Delete one first.' });
    const w = this.zone('everblock').world;
    const c = this.store.createCharacter(s.account.id, Object.assign(v, { srv: { bind: { zone: 'everblock', x: w.bind.x, y: w.bind.y, z: w.bind.z }, qx: {} } }));
    console.log(`[char] ${s.account.username} created ${c.name} (${c.race} ${c.cls})`);
    s.send({ t: 'created', id: c.id });
    this.sendChars(s);
  }
  deleteChar(s, m) {
    const c = this.store.getCharacter(m.id | 0);
    if (!c || c.account_id !== s.account.id) return;
    if ([...this.byPid.values()].some((o) => o.rec && o.rec.id === c.id)) return s.send({ t: 'err', where: 'delete', err: 'That character is in the world right now.' });
    this.store.deleteCharacter(c.id); this.sendChars(s);
  }

  // ---------------------------------------------------------------- entering the world
  play(s, m) {
    const rec = this.store.getCharacter(m.id | 0);
    if (!rec || rec.account_id !== s.account.id) return s.send({ t: 'err', where: 'play', err: 'No such character.' });
    for (const o of this.byPid.values()) if (o.rec && o.rec.id === rec.id) { o.sys('You have logged in from another location.'); this.leaveWorld(o, 'replaced'); this.kick(o, 'Logged in from another location'); }
    rec.srv = rec.srv || {}; rec.srv.qx = rec.srv.qx || {};
    const data = rec.data;
    let zoneId = data && EB.WORLD.ZONES[data.zone] ? data.zone : 'everblock';
    const z = this.zone(zoneId);
    if (!rec.srv.bind) rec.srv.bind = { zone: 'everblock', x: this.zone('everblock').world.bind.x, y: this.zone('everblock').world.bind.y, z: this.zone('everblock').world.bind.z };
    const pid = this.nextPid++;
    const ch = data && data.char;
    const pos = ch && Array.isArray(ch.pos) ? new THREE.Vector3(ch.pos[0], ch.pos[1], ch.pos[2]) : new THREE.Vector3(z.world.bind.x, z.world.bind.y, z.world.bind.z);
    const rs = RACES[rec.race].scale, h = Math.min(2.4, 1.85 * rs);
    const p = { kind: 'player', pid, key: 'p' + pid, session: s, name: rec.name, race: rec.race, cls: rec.cls, level: rec.level, title: ch ? ch.title || '' : '',
      pos, yaw: ch ? ch.yaw || 0 : Math.PI, hw: rs > 1.2 ? 0.38 : 0.3, h, eyeH: h * 0.92, alive: !(ch && ch.hp <= 0), faction: ch ? ch.faction || {} : {},
      flags: 0, atkSeq: 0, hp: 1, mhp: 1, mana: 0, mmana: 0, mercs: [], equip: ch ? ch.equip || {} : {}, look: { mercs: [] }, lastMv: Date.now(), ready: false, zone: null };
    s.rec = rec; s.proxy = p; s.stage = 'play';
    s.dmgBucket = new Bucket((60 + rec.level * 30) * 6, 60 + rec.level * 30);
    this.byPid.set(pid, s);
    const save = data ? Object.assign({}, data, { seed: this.seed, zone: zoneId }) : null;
    if (save) { save.char = Object.assign({}, save.char, { level: rec.level, xp: rec.xp, name: rec.name, race: rec.race, cls: rec.cls, stats: rec.stats, bind: rec.srv.bind }); save.zoneEdits = {}; }
    const edits = {}; for (const id of ZONE_IDS) edits[id] = this.zones.has(id) ? this.zones.get(id).edits : this.store.getZoneEdits(id);
    s.send({ t: 'welcome', pid, server: this.name, motd: this.motd, admin: this.isAdmin(s), seed: this.seed, zone: zoneId, dayT: this.dayT, edits,
      char: { id: rec.id, name: rec.name, race: rec.race, cls: rec.cls, level: rec.level, xp: rec.xp }, save,
      newChar: save ? null : { name: rec.name, race: rec.race, cls: rec.cls, stats: rec.stats, seed: this.seed }, build: !!this.opts.allowBuild });
    this.addToZone(s, z);
    console.log(`[play] ${s.account.username} entered as ${rec.name} (${z.name})`);
    const n = this.online().length;
    s.sys(`Welcome to ${this.name}! There ${n === 1 ? 'is 1 player' : `are ${n} players`} online. Type /who to see them, /ooc to chat with everyone and /invite to group.`, 'sys');
    if (this.motd) s.send({ t: 'chat', c: 'announce', m: 'Town Crier: ' + this.motd });
    for (const o of this.online()) if (o !== s) o.send({ t: 'chat', c: 'sys', m: `${rec.name} has wandered into Everblock.` });
  }
  addToZone(s, z) {
    s.zone = z; s.proxy.zone = z; z.sessions.add(s);
    s.known.clear(); s.knownP.clear(); s.knownN.clear();
    s.send({ t: 'zonestate', zone: z.id, T: z.time, sp: z.mobs.map((m) => { s.known.set(m.id, ''); return z.mobFull(m); }) });
    for (const o of z.sessions) if (o !== s && o.proxy) { s.send(this.pinfo(o)); o.send(this.pinfo(s)); }
    this.sendCorpses(z);
    this.sendGroup(s.group);
  }
  removeFromZone(s) {
    const z = s.zone; if (!z) return;
    z.sessions.delete(s); s.zone = null; if (s.proxy) s.proxy.zone = null;
    // monsters forget about someone who left
    for (const mob of z.mobs) if (mob.alive && s.proxy) { mob.hate.delete(s.proxy); for (const mc of s.proxy.mercs) mob.hate.delete(mc); if (mob.target === s.proxy || (mob.target && mob.target.owner === s.proxy)) mob.target = null; }
    if (s.proxy) z.broadcast({ t: 'pgone', pid: s.proxy.pid });
    this.sendCorpses(z);
  }
  pinfo(s) {
    const p = s.proxy;
    return { t: 'pinfo', pid: p.pid, name: p.name, race: p.race, cls: p.cls, level: p.level, title: p.title, equip: p.equip, mercs: p.look.mercs || [], gid: s.group ? s.group.id : 0, admin: this.isAdmin(s) };
  }
  sendCorpses(z) {
    const list = [];
    for (const o of this.online()) {
      const c = o.rec && o.rec.data && o.rec.data.corpses; if (!c) continue;
      for (const k of c) if (k.zone === z.id) list.push({ owner: o.proxy.pid, name: o.rec.name, race: o.rec.race, cls: o.rec.cls, equip: k.equip, x: k.x, y: k.y, z: k.z });
    }
    z.broadcast({ t: 'corpses', list });
  }

  // ---------------------------------------------------------------- in-world messages
  on_mv(s, m) {
    const p = s.proxy, now = Date.now();
    const x = +m.x, y = +m.y, z = +m.z;
    if (![x, y, z].every(isFinite) || p.zoning) return;
    const el = Math.min(2, (now - p.lastMv) / 1000); p.lastMv = now;
    const dh = Math.hypot(x - p.pos.x, z - p.pos.z), up = y - p.pos.y;
    const okMove = p.ready ? dh <= 12 * el + 2.5 && up <= 12 * el + 2.5 : Math.hypot(dh, up) < 8; // after login/zoning the first position must match the server's
    const b = s.rec.srv.bind, nearBind = b && b.zone === s.zone.id && Math.hypot(x - b.x, z - b.z) < 4;
    if (okMove || nearBind || x < 0 || z < 0) {
      if (x >= 0 && z >= 0 && x <= 256 && z <= 256 && y > -20 && y < 80) p.pos.set(x, y, z);
    } else {
      s.strikes += 5;
      s.send({ t: 'pos', x: p.pos.x, y: p.pos.y, z: p.pos.z });
      if (s.strikes > 600) return this.kick(s, 'Movement validation failed');
    }
    if (s.strikes > 0) s.strikes -= 0.5;
    p.ready = true;
    p.yaw = +m.yaw || 0; p.flags = m.f | 0; p.atkSeq = m.a | 0;
    p.hp = Math.max(0, +m.hp || 0); p.mhp = Math.max(1, +m.mhp || 1); p.mana = +m.mn || 0; p.mmana = +m.mmn || 0;
    const wasAlive = p.alive; p.alive = !(p.flags & 8);
    if (wasAlive && !p.alive) this.playerDied(s);
    p.sitting = !!(p.flags & 2);
    const ms = Array.isArray(m.m) ? m.m.slice(0, 3) : [];
    while (p.mercs.length > ms.length) { const gone = p.mercs.pop(); for (const mob of s.zone.mobs) mob.hate.delete(gone); }
    ms.forEach((a, i) => {
      let c = p.mercs[i];
      if (!c) { c = { kind: 'merc', key: 'm' + p.pid + ':' + i, owner: p, idx: i, pos: new THREE.Vector3(), yaw: 0, dead: false, hw: 0.3, h: 1.6, eyeH: 1.45, level: p.level, name: 'a mercenary', flags: 0, atkSeq: 0, hp: 1, mhp: 1, get alive() { return !this.dead; } }; p.mercs.push(c); }
      const L = p.look.mercs && p.look.mercs[i];
      if (L) { c.name = L.name || c.name; c.level = L.role === 'pet' ? L.petLvl || 3 : p.level; }
      const mx = +a[0], my = +a[1], mz = +a[2];
      if ([mx, my, mz].every(isFinite) && Math.hypot(mx - p.pos.x, mz - p.pos.z) < 130) c.pos.set(mx, my, mz);
      c.yaw = +a[3] || 0; c.flags = a[4] | 0; c.atkSeq = a[5] | 0; c.hp = +a[6] || 0; c.mhp = Math.max(1, +a[7] || 1);
      c.dead = !!(c.flags & 8);
    });
  }
  playerDied(s) {
    const p = s.proxy, rec = s.rec;
    const loss = Math.floor(D.xpToNext(rec.level) * 0.08);
    if (rec.xp > 0 && loss > 0) rec.xp = Math.max(0, rec.xp - loss);
    for (const m of s.zone.mobs) if (m.alive && (m.state === 'chase' || m.state === 'flee') && (m.hate.has(p) || p.mercs.some((mc) => m.hate.has(mc)))) m.goHome();
    this.store.saveCharacter(rec);
  }
  on_died(s) { if (s.proxy.alive) { s.proxy.alive = false; s.proxy.flags |= 8; this.playerDied(s); } }
  on_look(s, m) {
    const p = s.proxy;
    const eq = {}; if (m.equip && typeof m.equip === 'object') for (const sl of D.EQUIP_SLOTS) if (m.equip[sl] && ITEMS[m.equip[sl].id] && ITEMS[m.equip[sl].id].slot === sl) eq[sl] = { id: m.equip[sl].id };
    p.equip = eq;
    p.title = typeof m.title === 'string' ? m.title.slice(0, 40) : '';
    p.look.mercs = (Array.isArray(m.mercs) ? m.mercs.slice(0, 3) : []).map((x) => ({ role: MERCS[x && x.role] || (x && x.role === 'pet') ? x.role : 'tank', petLvl: Math.max(1, Math.min(30, (x && x.petLvl) | 0 || 3)), name: String((x && x.name) || '').slice(0, 30), equip: {} }));
    s.zone.broadcast(this.pinfo(s));
  }
  on_save(s, m) {
    s.pendingSave = m.data;
    const nb = m.data && m.data.char && m.data.char.bind, ob = s.rec.srv.bind;
    const bindMoved = nb && ob && (nb.zone !== ob.zone || Math.abs(nb.x - ob.x) > 1 || Math.abs(nb.z - ob.z) > 1);
    if (bindMoved || m.now || Date.now() - s.lastSaveAt > 2000) this.flushSave(s);
  }
  flushSave(s, final) {
    const rec = s.rec, p = s.proxy; if (!rec || !p) return;
    let data = s.pendingSave; s.pendingSave = null;
    if (data) {
      // bind points must be next to a soulbinder
      const nb = data.char && data.char.bind;
      if (nb && EB.WORLD.ZONES[nb.zone] && (nb.zone !== rec.srv.bind.zone || Math.hypot(nb.x - rec.srv.bind.x, nb.z - rec.srv.bind.z) > 1)) {
        const w = this.zone(nb.zone).world;
        if (w.npcs.some((n) => n.kind === 'binder' && Math.hypot(n.x - nb.x, n.z - nb.z) < 9)) rec.srv.bind = { zone: nb.zone, x: +nb.x, y: +nb.y, z: +nb.z };
      }
      const oldCorpses = JSON.stringify(rec.data && rec.data.corpses);
      const clean = sanitizeSave(rec, data, { seed: this.seed, zone: s.zone ? s.zone.id : 'everblock', pos: [p.pos.x, p.pos.y, p.pos.z], bind: rec.srv.bind });
      if (!clean) return;
      if (!p.alive) clean.char.hp = 0;
      rec.data = clean;
      if (JSON.stringify(clean.corpses) !== oldCorpses && s.zone && !final) for (const z of this.zones.values()) this.sendCorpses(z);
    } else if (rec.data) {
      rec.data.char.pos = [p.pos.x, p.pos.y, p.pos.z]; rec.data.zone = s.zone ? s.zone.id : rec.data.zone; rec.data.char.level = rec.level; rec.data.char.xp = rec.xp;
    }
    s.lastSaveAt = Date.now();
    this.store.saveCharacter(rec);
  }
  on_zone(s, m) {
    const p = s.proxy, from = s.zone, to = String(m.to || '');
    if (!EB.WORLD.ZONES[to]) return;
    let arrive = null;
    if (m.via === 'bind') {
      const b = s.rec.srv.bind; if (b && b.zone === to) arrive = { x: b.x, y: b.y, z: b.z, yaw: p.yaw };
    } else if (to !== from.id) {
      const zl = from.world.zoneLines.find((l) => l.to === to && p.pos.x >= l.x0 - 4 && p.pos.x <= l.x1 + 4 && p.pos.z >= l.z0 - 4 && p.pos.z <= l.z1 + 4);
      if (zl) { const tw = this.zone(to).world; arrive = { x: zl.arrive.x, y: tw.surfaceY(zl.arrive.x, zl.arrive.z), z: zl.arrive.z, yaw: zl.arrive.yaw }; }
    }
    if (!arrive) { s.send({ t: 'zoned', ok: false, zone: from.id, x: p.pos.x, y: p.pos.y, z: p.pos.z }); return; }
    const tz = this.zone(to); // (generates the zone on first use)
    if (to !== from.id) this.removeFromZone(s);
    p.pos.set(arrive.x, arrive.y, arrive.z); p.lastMv = Date.now(); p.ready = false;
    s.send({ t: 'zoned', ok: true, zone: to, x: arrive.x, y: arrive.y, z: arrive.z }); // first, so the client can drop stale messages from the old zone
    if (to !== from.id) this.addToZone(s, tz);
  }
  srcOf(s, k) { const p = s.proxy; if (k === 'p' || k == null) return p; const i = +String(k).replace(/^m/, ''); return p.mercs[i] && !p.mercs[i].dead ? p.mercs[i] : null; }
  on_dmg(s, m) {
    const z = s.zone, mob = z.mobById(m.id | 0); if (!mob || !mob.alive) return;
    const src = this.srcOf(s, m.s); if (!src) return;
    let d = Math.round(+m.d || 0); if (!(d >= 0)) return;
    const L = s.rec.level, cap = 60 + L * 32;
    if (d > cap || src.pos.distanceTo(mob.pos) > 48) { s.strikes += 10; return; }
    if (d > 0 && !s.dmgBucket.take(d)) { s.strikes += 2; return; }
    z.damageMob(mob, d, src);
  }
  on_hate(s, m) {
    const z = s.zone, mob = z.mobById(m.id | 0); if (!mob || !mob.alive) return;
    const src = this.srcOf(s, m.s); if (!src || src.pos.distanceTo(mob.pos) > 60) return;
    const a = Math.max(-1000, Math.min(4000, +m.a || 0));
    if (mob.state !== 'chase' && mob.state !== 'flee') mob.aggroOn(src, z);
    mob.addHate(src, a);
    if (m.tgt) { mob.target = src; mob.hateT = 1.5; }
  }
  on_cc(s, m) {
    const z = s.zone, mob = z.mobById(m.id | 0); if (!mob || !mob.alive) return;
    if (!ZoneSim.CC_FIELDS.includes(m.f) || s.proxy.pos.distanceTo(mob.pos) > 48) return;
    if ((m.f === 'mezUntil' || m.f === 'stunUntil') && mob.def.named) return;
    const dur = Math.max(0, Math.min(60, +m.d || 0));
    mob[m.f] = dur > 0 ? z.time + dur : 0;
    if (dur > 0 && (m.f === 'mezUntil' || m.f === 'stunUntil')) mob.casting = null;
  }
  on_loot(s, m) {
    const z = s.zone, mob = z.mobById(m.id | 0);
    if (!mob || mob.alive || !mob.loot) return s.send({ t: 'lootwin', id: m.id | 0, gone: true });
    if (mob.pos.distanceTo(s.proxy.pos) > 9) return s.send({ t: 'lootwin', id: mob.id, err: 'Too far away. Your arms are not that long.' });
    const ck = z.creditKey(s.proxy);
    if (mob.lootRights && mob.lootRights !== ck && z.time < mob.lootOpenAt) return s.send({ t: 'lootwin', id: mob.id, err: 'Hands off! That corpse belongs to someone else for now.' });
    if (mob.looter && mob.looter !== s && mob.looter.zone === z && z.time < (mob.lootLock || 0)) return s.send({ t: 'lootwin', id: mob.id, err: 'Someone else is already rummaging through that corpse.' });
    mob.looter = s; mob.lootLock = z.time + 30;
    const coins = mob.loot.coins; mob.loot.coins = 0;
    s.send({ t: 'lootwin', id: mob.id, coins, items: mob.loot.items });
  }
  on_take(s, m) {
    const z = s.zone, mob = z.mobById(m.id | 0);
    if (!mob || mob.alive || !mob.loot || mob.looter !== s) return;
    const i = m.i | 0, it = mob.loot.items[i];
    if (!it || it.id !== m.item) return s.send({ t: 'took', id: mob.id, i, item: null });
    mob.loot.items.splice(i, 1);
    s.send({ t: 'took', id: mob.id, i, item: it });
  }
  on_lootdone(s, m) {
    const z = s.zone, mob = z.mobById(m.id | 0);
    if (!mob || mob.alive || !mob.loot) return;
    if (mob.looter === s) mob.looter = null;
    if (!mob.loot.items.length && !mob.loot.coins) z.removeEntity(mob);
  }
  on_blk(s, m) {
    if (!this.opts.allowBuild) return s.sys('Building is disabled on this server.');
    const z = s.zone, w = z.world, x = m.x | 0, y = m.y | 0, zz = m.z | 0, b = m.b | 0;
    if (!w.inBounds(x, y, zz) || !ipLimit('s' + s.proxy.pid, 'blk', 12, 6)) return;
    if (b !== B.AIR && !D.BUILDABLE.includes(b)) return;
    const cur = w.get(x, y, zz); if (cur === B.BEDROCK) return;
    const p = s.proxy; if (Math.hypot(x + 0.5 - p.pos.x, y + 0.5 - (p.pos.y + 1.5), zz + 0.5 - p.pos.z) > 9) return;
    if (Object.keys(z.edits).length > 40000 && !(w.idx(x, y, zz) in z.edits)) return s.sys('This zone has reached its building limit.');
    if (z.setBlock(x, y, zz, b)) for (const o of this.online()) o.send({ t: 'blk', zone: z.id, x, y, z: zz, b, by: o === s ? 1 : 0 });
  }
  friendlyTarget(s, pid, range) {
    const o = this.byPid.get(pid | 0); if (!o || !o.proxy || o.zone !== s.zone) return null;
    if (o.proxy.pos.distanceTo(s.proxy.pos) > range) return null;
    return o;
  }
  on_heal(s, m) {
    const o = this.friendlyTarget(s, m.to, 60); if (!o || !o.proxy.alive) return;
    const amt = Math.round(+m.amt || 0), L = Math.max(s.rec.level, 1);
    if (!(amt > 0) || amt > 80 + L * 50 || !ipLimit('s' + s.proxy.pid, 'heal', 10, 4)) return;
    o.send({ t: 'healed', from: String(m.from || s.rec.name).slice(0, 40), amt, sp: typeof m.sp === 'string' ? m.sp.slice(0, 40) : '' });
  }
  on_buff(s, m) {
    const o = this.friendlyTarget(s, m.to, 60); if (!o || !o.proxy.alive) return;
    const sp = SPELLS[m.id]; if (!sp || !sp.buff || !sp.friendly) return;
    if (!ipLimit('s' + s.proxy.pid, 'buff', 6, 1)) return;
    o.send({ t: 'buffed', from: String(m.from || s.rec.name).slice(0, 40), id: m.id });
  }
  on_qxp(s, m) {
    const q = QUESTS[m.q]; if (!q) return;
    const rec = s.rec, step = m.step == null ? 'final' : m.step | 0;
    const key = m.q + ':' + step; if (rec.srv.qx[key]) return;
    let n;
    if (step === 'final') n = Math.floor(q.xp * (1 + rec.level / 10));
    else { if (!q.chain || step < 0 || step >= q.steps.length - 1) return; n = Math.floor(400 * (step + 1) * (1 + rec.level / 10)); }
    rec.srv.qx[key] = 1;
    this.grantXP(s, n, false, 'quest');
  }
  grantXP(s, n, party, why, extra) {
    const rec = s.rec;
    if (rec.level >= D.MAX_LEVEL) { s.send(Object.assign({ t: 'xp', n: 0, party, why, lvl: rec.level, xp: rec.xp }, extra || {})); return; }
    rec.xp += n;
    let ding = false;
    while (rec.level < D.MAX_LEVEL && rec.xp >= D.xpToNext(rec.level)) { rec.xp -= D.xpToNext(rec.level); rec.level++; ding = true; }
    if (rec.level >= D.MAX_LEVEL) rec.xp = Math.min(rec.xp, D.xpToNext(rec.level));
    if (ding) { s.proxy.level = rec.level; s.dmgBucket = new Bucket((60 + rec.level * 30) * 6, 60 + rec.level * 30); this.store.saveCharacter(rec); s.zone.broadcast(this.pinfo(s)); this.sendGroup(s.group); }
    s.send(Object.assign({ t: 'xp', n, party, why, lvl: rec.level, xp: rec.xp }, extra || {}));
  }
  awardKill(z, mob, credit, src) {
    let members;
    if (credit[0] === 'g') { const g = this.groups.get(+credit.slice(1)); members = g ? g.members.filter((o) => o.zone === z && o.proxy && o.proxy.alive && o.proxy.pos.distanceTo(mob.pos) < 150) : []; }
    else { const o = this.byPid.get(+credit.slice(1)); members = o && o.zone === z && o.proxy && o.proxy.alive ? [o] : []; }
    if (!members.length) return;
    const units = []; // players plus their (non-pet) mercs, EQ-style split
    for (const o of members) { units.push(o.proxy.level); o.proxy.mercs.forEach((c, i) => { const L = o.proxy.look.mercs[i]; if (!c.dead && (!L || L.role !== 'pet')) units.push(o.proxy.level); }); }
    const maxL = Math.max(...members.map((o) => o.proxy.level));
    const c = conColor(maxL, mob.level);
    const base = Math.floor(EB.calc.xpForKill(mob.level) * CON_XP[c] * (mob.def.named ? 2 : 1));
    const n = units.length, total = n > 1 ? base * (1 + 0.15 * (n - 1)) : base, sumL = units.reduce((a, b) => a + b, 0);
    for (const o of members) {
      const xp = n > 1 ? Math.floor(total * o.proxy.level / sumL) : base;
      const slain = src && (src === o.proxy || src.owner === o.proxy);
      if (xp > 0) this.grantXP(o, xp, n > 1, 'kill', { id: mob.id, kill: 1, slain });
      else o.send({ t: 'xp', n: 0, kill: 1, id: mob.id, slain, lvl: o.rec.level, xp: o.rec.xp });
    }
  }

  // ---------------------------------------------------------------- groups
  sendGroup(g) {
    if (!g) return;
    const info = { t: 'group', id: g.id, leader: g.leader.proxy ? g.leader.proxy.pid : 0, members: g.members.filter((o) => o.proxy).map((o) => ({ pid: o.proxy.pid, name: o.rec.name, level: o.rec.level, cls: o.rec.cls, race: o.rec.race, zone: o.zone ? o.zone.id : '' })) };
    for (const o of g.members) o.send(info);
  }
  leaveGroup(s, silent) {
    const g = s.group; if (!g) return;
    g.members = g.members.filter((o) => o !== s); s.group = null;
    s.send({ t: 'group', id: 0, members: [] });
    for (const o of g.members) o.sys(`${s.rec ? s.rec.name : 'Someone'} has left the group.`);
    if (g.members.length <= 1) { for (const o of g.members) { o.group = null; o.send({ t: 'group', id: 0, members: [] }); o.sys('Your party has disbanded. Everyone go home.'); if (o.zone) o.zone.broadcast(this.pinfo(o)); } this.groups.delete(g.id); }
    else { if (g.leader === s) { g.leader = g.members[0]; g.leader.sys('You are now the leader of your group.'); } this.sendGroup(g); }
    if (s.zone && s.proxy) s.zone.broadcast(this.pinfo(s));
  }
  findOnline(name) { name = String(name || '').toLowerCase(); return this.online().find((o) => o.rec.name.toLowerCase() === name) || null; }

  // ---------------------------------------------------------------- chat & commands
  on_chat(s, m) {
    let v = String(m.v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 240);
    if (!v) return;
    if (!s.chatBucket.take()) return s.sys('You are sending messages too quickly. Slow down.');
    const me = s.rec.name;
    if (v[0] !== '/') v = '/say ' + v;
    const sp = v.indexOf(' '), cmd = (sp < 0 ? v.slice(1) : v.slice(1, sp)).toLowerCase(), rest = sp < 0 ? '' : v.slice(sp + 1).trim();
    const near = (r) => [...s.zone.sessions].filter((o) => o.proxy && o.proxy.pos.distanceTo(s.proxy.pos) < r);
    const say = (to, c, text) => { for (const o of to) o.send({ t: 'chat', c, from: me, m: text, self: o === s }); };
    switch (cmd) {
      case 'say': case 's': if (rest) say(near(60), 'say', rest); break;
      case 'shout': case 'sh': if (rest) say(s.zone.sessions, 'shout', rest); break;
      case 'ooc': if (rest) say(this.online(), 'ooc', rest); break;
      case 'auction': case 'auc': if (rest) say(this.online(), 'auction', rest); break;
      case 'g': case 'gsay': case 'group': if (!s.group) return s.sys('You are not in a group.'); if (rest) say(s.group.members, 'group', rest); break;
      case 'tell': case 't': case 'msg': case 'r': case 'reply': {
        let to, text;
        if (cmd === 'r' || cmd === 'reply') { to = s.lastTell; text = rest; } else { const i = rest.indexOf(' '); to = i < 0 ? rest : rest.slice(0, i); text = i < 0 ? '' : rest.slice(i + 1).trim(); }
        const o = this.findOnline(to);
        if (!o) return s.sys(to ? `${to} is not online right now. Probably eating dinner.` : 'Tell whom?');
        if (!text) return s.sys('Usage: /tell <name> <message>');
        o.lastTell = me; o.send({ t: 'chat', c: 'tell', from: me, m: text });
        s.send({ t: 'chat', c: 'told', from: o.rec.name, m: text });
        break;
      }
      case 'who': {
        const all = rest.toLowerCase() === 'all' || !rest ? this.online() : this.online().filter((o) => o.rec.name.toLowerCase().includes(rest.toLowerCase()));
        s.sys('Adventurers loitering in Everblock:', 'who');
        for (const o of all) s.sys(`Lv${o.rec.level} ${CLASSES[o.rec.cls].name} ${o.rec.name}${o.proxy.title ? ', ' + o.proxy.title : ''} (${RACES[o.rec.race].name}) - hanging around ${o.zone ? o.zone.name : '?'}${o.group && o.group === s.group ? ' <group>' : ''}${this.isAdmin(o) ? ' *GM*' : ''}`, 'who');
        s.sys(`${all.length === 1 ? '1 adventurer is' : `${all.length} adventurers are`} loitering in Everblock.`, 'who');
        break;
      }
      case 'invite': case 'inv': {
        const o = this.findOnline(rest || m.tgt);
        if (!o) return s.sys(rest || m.tgt ? `${rest || m.tgt} is not online.` : 'Target a player or type /invite <name>.');
        if (o === s) return s.sys('You cannot invite yourself.');
        if (s.group && s.group.leader !== s) return s.sys('Only the group leader can invite.');
        if (o.group) return s.sys(`${o.rec.name} is already in a group.`);
        if (s.group && s.group.members.length >= 6) return s.sys('Your group is full.');
        o.invite = { from: s, t: Date.now() };
        o.send({ t: 'invite', from: me });
        o.sys(`${me} wants you in their party. Type /join to accept or /decline.`, 'group');
        s.sys(`You invite ${o.rec.name} to your party.`, 'group');
        break;
      }
      case 'join': case 'accept': case 'follow': {
        const inv = s.invite; s.invite = null;
        if (!inv || Date.now() - inv.t > 120000 || !inv.from.proxy) return s.sys('You have not been invited to a group.');
        if (s.group) this.leaveGroup(s);
        const L = inv.from;
        let g = L.group;
        if (!g) { g = { id: this.nextGid++, leader: L, members: [L] }; this.groups.set(g.id, g); L.group = g; }
        if (g.members.length >= 6) return s.sys('That group is full.');
        g.members.push(s); s.group = g;
        for (const o of g.members) o.sys(o === s ? `You have joined ${L.rec.name}'s group.` : `${me} has joined the party.`, 'group');
        this.sendGroup(g);
        for (const o of g.members) if (o.zone) o.zone.broadcast(this.pinfo(o));
        break;
      }
      case 'decline': { const inv = s.invite; s.invite = null; if (inv && inv.from.proxy) inv.from.sys(`${me} declines your invitation.`, 'group'); s.sys('You decline the invitation.'); break; }
      case 'disband': case 'leave': case 'leavegroup': if (!s.group) return s.sys('You are not in a group.'); this.leaveGroup(s); s.sys('You have left the group.', 'group'); break;
      case 'remove': case 'gkick': {
        if (!s.group || s.group.leader !== s) return s.sys('Only the group leader can remove members.');
        const o = this.findOnline(rest || m.tgt); if (!o || o.group !== s.group || o === s) return s.sys('That player is not in your group.');
        this.leaveGroup(o); o.sys('You have been removed from the group.', 'group'); break;
      }
      case 'motd': s.sys(this.motd ? 'Town Crier: ' + this.motd : 'The Town Crier has nothing to say today.'); break;
      case 'announce': case 'broadcast':
        if (!this.isAdmin(s)) return s.sys('You do not have permission to do that.');
        for (const o of this.online()) o.send({ t: 'chat', c: 'announce', m: rest }); console.log(`[admin] ${me} announced: ${rest}`); break;
      case 'kick': {
        if (!this.isAdmin(s)) return s.sys('You do not have permission to do that.');
        const o = this.findOnline(rest || m.tgt); if (!o) return s.sys('No such player online.');
        console.log(`[admin] ${me} kicked ${o.rec.name}`); s.sys(`You kick ${o.rec.name} from the server.`); this.kick(o, `Kicked by ${me}`); break;
      }
      case 'ban': case 'unban': {
        if (!this.isAdmin(s)) return s.sys('You do not have permission to do that.');
        const c = this.store.getCharacterByName(rest), acc = c ? this.store.getAccount(c.account_id) : this.store.getAccountByName(rest);
        if (!acc) return s.sys('No such character or account.');
        acc.banned = cmd === 'ban' ? 1 : 0; this.store.updateAccount(acc);
        if (cmd === 'ban') { this.store.deleteSessionsFor(acc.id); for (const o of this.online()) if (o.account.id === acc.id) this.kick(o, 'Banned'); }
        console.log(`[admin] ${me} ${cmd}ned ${acc.username}`); s.sys(`Account ${acc.username} ${cmd}ned.`); break;
      }
      case 'tp': case 'goto': case 'summon': {
        if (!this.isAdmin(s)) return s.sys('You do not have permission to do that.');
        const w = s.zone.world; let who = s, x, z, y;
        if (cmd === 'tp') { const a = rest.split(/[\s,]+/).map(Number); if (!(a.length >= 2 && a.every(isFinite))) return s.sys('Usage: /tp <x> <z>'); x = U.clamp(a[0], 1, 255); z = U.clamp(a[1], 1, 255); y = w.surfaceY(x, z); }
        else {
          const o = this.findOnline(rest || m.tgt); if (!o || o === s) return s.sys('No such player online.');
          if (o.zone !== s.zone) return s.sys(`${o.rec.name} is in ${o.zone.name}.`);
          const from = cmd === 'goto' ? o : s; who = cmd === 'goto' ? s : o; x = from.proxy.pos.x + 1; z = from.proxy.pos.z + 1; y = from.proxy.pos.y + 0.5;
        }
        who.proxy.pos.set(x, y, z); who.proxy.lastMv = Date.now(); who.proxy.ready = false;
        who.send({ t: 'pos', x, y, z }); if (who !== s) who.sys(`${me} yanks you across the zone. Hello!`);
        console.log(`[admin] ${me} ${cmd} ${who.rec.name} -> ${x.toFixed(1)}, ${z.toFixed(1)}`); break;
      }
      case 'setmotd': if (!this.isAdmin(s)) return s.sys('You do not have permission to do that.'); this.motd = rest; s.sys('MOTD updated (until restart; set MOTD in .env to keep it).'); break;
      case 'gm': case 'admin':
        if (!this.isAdmin(s)) return s.sys('You do not have permission to do that.');
        s.sys('Admin commands: /announce <text>, /kick <name>, /ban <name>, /unban <name>, /setmotd <text>, /tp <x> <z>, /goto <name>, /summon <name>, /who all', 'help'); break;
      default: s.sys('Huh? That is not a command. Try /help.');
    }
  }

  // ---------------------------------------------------------------- ticking
  tick(dt) {
    this.tickN++;
    this.dayT = (this.dayT + dt / 720) % 1;
    const t0 = Date.now();
    for (const z of this.zones.values()) { try { z.step(dt); } catch (e) { console.error('[zone]', z.id, e); } }
    const tt = Date.now() - t0; if (tt > 250 && Date.now() - (this.slowWarn || 0) > 30000) { this.slowWarn = Date.now(); console.warn(`[perf] slow tick: ${tt} ms`); }
    if (this.tickN % 2 === 0) {
      for (const z of this.zones.values()) for (const s of z.sessions) { const snap = z.snapshotFor(s); if (snap) s.send(snap); }
    }
    if (this.tickN % 200 === 0) for (const s of this.online()) s.send({ t: 'time', dayT: this.dayT });
  }
  slowTick() {
    for (const z of this.zones.values()) z.flushEdits();
    for (const s of this.online()) if (s.pendingSave || Date.now() - s.lastSaveAt > 60000) this.flushSave(s);
    if (Math.random() < 0.01) this.store.pruneSessions(30 * 864e5);
    for (const [k, b] of ipBuckets) if (b.v >= b.cap && Date.now() - b.t > 600000) ipBuckets.delete(k);
  }
  shutdown() {
    clearInterval(this.timer); clearInterval(this.slowTimer);
    for (const s of this.online()) { s.sys('The server is shutting down. Your character has been saved.'); this.flushSave(s, true); }
    for (const z of this.zones.values()) z.flushEdits();
    this.store.close();
  }
}
module.exports = { EverblockServer, VERSION, hashPass, checkPass };
