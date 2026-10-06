// Everblock v6 - online play: connects to an Everblock server (server/ in the repo), shows other players, and turns
// the local game into a client of the shared world. The server runs the monsters (same AI code), spawns, loot,
// experience, groups, chat and block edits; this client still simulates your own character, mercs and pets and
// sends what they do (movement, damage, heals, taunts) as intents the server checks. Solo play never touches this.
(function () {
  const EB = window.EB;
  const U = EB.util, D = EB.data;
  const { ITEMS, SPELLS, RACES, CLASSES, MOBS } = D;
  const { Mob, Entity, makeNameplate, setNameplate, animateModel } = EB.ent;
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'everblock_net_v1';
  const ST = ['idle', 'chase', 'flee', 'return', 'dead'];
  const CC = ['mezUntil', 'stunUntil', 'snaredUntil', 'slowedUntil', 'rootedUntil'];
  const CC_BIT = { mezUntil: 4, stunUntil: 8, snaredUntil: 16, slowedUntil: 32, rootedUntil: 64 };
  const ls = { get() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }, set(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(ls.get(), o))); } catch (e) { /* ignore */ } } };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

  // ---------------------------------------------------------------- remote entities
  class RemotePlayer extends Entity {
    constructor(info) {
      super('pc', info.name);
      this.pid = info.pid; this.race = info.race; this.cls = info.cls; this.level = info.level; this.title = info.title || '';
      const rs = RACES[this.race].scale; this.hw = rs > 1.2 ? 0.38 : 0.3; this.h = Math.min(2.4, 1.85 * rs); this.eyeH = this.h * 0.92;
      this._hp = 1; this.mhp = 1; this.alive = true; this.dead = false; this.flags = 0; this.atkSeq = 0; this.tgt = null; this.mercEnts = []; this.given = [];
      this.equip = info.equip || {};
      this.model = EB.models.buildModel(EB.models.playerOpts({ race: this.race, cls: this.cls, equip: this.equip }));
      this.plate = makeNameplate(this.name, '#9fd8ff', this.sub(info));
    }
    sub(info) { return info.title ? info.title : `<Level ${info.level} ${CLASSES[info.cls].name}>`; }
    get maxHp() { return this.mhp; }
    get hp() { return this._hp; }
    set hp(v) { const d = Math.round(v - this._hp); if (d > 0 && net.game && this.alive) net.send({ t: 'heal', to: this.pid, amt: d, from: net.game.player.name }); this._hp = Math.max(0, v); }
    get buffs() { const self = this; const now = net.game ? net.game.time : 0; this.given = this.given.filter((b) => b.until > now); const a = this.given.map((b) => ({ id: b.id, name: b.name, left: b.until - now, buff: {} }));
      a.push = function (b) { if (b && SPELLS[b.id]) { net.send({ t: 'buff', to: self.pid, id: b.id, from: net.game.player.name }); self.given = self.given.filter((x) => x.id !== b.id); self.given.push({ id: b.id, name: b.name, until: now + Math.min(b.left || 60, 600) }); } return a.length; };
      return a; }
    set buffs(v) { /* buffs land on the other player's own client */ }
    get grouped() { return !!(net.group && net.group.members.some((m) => m.pid === this.pid)); }
  }
  class RemoteMerc extends Entity {
    constructor(owner, info, i) {
      super('rmerc', info.name || 'a mercenary');
      this.owner = owner; this.idx = i; this.role = info.role; this.petLvl = info.petLvl; this.hw = 0.3; this.atkSeq = 0; this.flags = 0;
      this.model = EB.models.buildModel(info.role === 'pet' ? EB.models.petOpts(info.petLvl || 3) : EB.models.mercOpts(info.role, info.equip || {}));
      this.h = Math.max(1.4, this.model.height * 0.95);
      this.plate = makeNameplate(this.name, '#9fd8ff', `<${owner.name}'s ${info.role === 'pet' ? 'pet' : 'mercenary'}>`);
      this.hp = 1; this.maxHp = 1; this.dead = false;
    }
    get alive() { return !this.dead; }
  }
  class RemoteCorpse extends Entity {
    constructor(c) {
      super('rcorpse', c.name + "'s corpse");
      this.pos.set(c.x, c.y, c.z); this.hw = 0.4; this.h = 0.6;
      this.model = EB.models.buildModel(EB.models.playerOpts({ race: c.race, cls: c.cls, equip: c.equip || {} }));
      EB.models.setDead(this.model, true); this.model.st.deadT = 1;
      animateModel(this.model, 0, false, 0, false, { dt: 0, always: true });
      this.plate = makeNameplate(this.name, '#c8b080', null);
      this.syncModel();
    }
    get alive() { return false; }
  }

  // hate list that reports changes made by this client's taunts to the server
  class NetHate extends Map {
    constructor(mob) { super(); this.mob = mob; }
    set(k, v) { if (this.mob && net.game) { const s = net.srcKey(k); if (s) net.send({ t: 'hate', id: this.mob.id, s, a: Math.round(v - (this.get(k) || 0)), tgt: 1 }); } return super.set(k, v); }
    raw(k, v) { return super.set(k, v); }
  }

  // ---------------------------------------------------------------- the client
  const net = {
    active: false, ws: null, pid: 0, game: null, save: null, seed: 1999, queue: [], ready: false, group: null, remotes: new Map(), corpses: [], edits: {},
    awaitingZone: null, xpOK: false, lootAllOn: false, pendingTake: false, mvT: 0, lookT: 0, lookSig: '', lastAtk: 0, atkSeq: 0, build: true,

    // ---------- connection
    wsURL(base) {
      let u = String(base || '').trim();
      if (!u) u = location.origin;
      if (!/^[a-z]+:\/\//i.test(u)) u = (location.protocol === 'http:' && !/\.(com|net|org|io|gg|app|dev)\b/.test(u) ? 'http://' : 'https://') + u;
      u = u.replace(/^http/i, 'ws').replace(/\/+$/, '');
      return /\/ws$/.test(u) ? u : u + '/ws';
    },
    httpURL(base) { return this.wsURL(base).replace(/^ws/i, 'http').replace(/\/ws$/, ''); },
    connect(base, onOpen) {
      if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) { /* ignore */ } }
      let url; try { url = this.wsURL(base); new URL(url); } catch (e) { this.ui.err('That server address does not look right.'); return; }
      if (location.protocol === 'https:' && /^ws:/i.test(url)) { this.ui.err('This page is on https, so the server must use https too (wss://). Open the game from the server\'s own address instead.'); return; }
      this.ui.status('Connecting to ' + url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') + '...');
      const ws = new WebSocket(url); this.ws = ws; this.base = base;
      ws.onopen = () => { this.ui.status(''); onOpen && onOpen(); };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMessage(m); };
      ws.onerror = () => {};
      ws.onclose = (ev) => this.onClose(ev);
    },
    send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
    onClose(ev) {
      const wasPlaying = this.active && this.game;
      this.ws = null;
      if (wasPlaying) {
        this.game.save && (this.game.player.alive || true);
        const why = this.kickReason || (ev && ev.reason) || 'The connection to the server was lost.';
        const o = $('netDown'); if (o) { o.querySelector('.why').textContent = why; o.classList.remove('hidden'); }
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (!this.kickReason) this.ui.err('Could not reach the server (' + (ev && ev.code) + '). Check the address and that the server is running.');
    },
    reconnect() { // reload into the same character (the title screen logs back in with the saved token)
      try { sessionStorage.setItem('everblock_autoplay', JSON.stringify({ server: this.base || '', charId: this.charId })); } catch (e) { /* ignore */ }
      location.reload();
    },

    // ---------- messages
    onMessage(m) {
      switch (m.t) {
        case 'info': this.serverInfo = m; this.ui.info(m); return;
        case 'auth': return this.ui.onAuth(m);
        case 'chars': return this.ui.onChars(m);
        case 'created': return this.ui.onCreated(m);
        case 'err': return this.ui.err(m.err);
        case 'loggedout': return this.ui.onLoggedOut();
        case 'kicked': this.kickReason = 'Disconnected: ' + m.reason; return;
        case 'welcome': return this.onWelcome(m);
        case 'pong': this.rtt = Date.now() - m.c; return;
      }
      if (!this.ready) { this.queue.push(m); return; }
      this.handle(m);
    },
    zoneScoped: { s: 1, zonestate: 1, gone: 1, die: 1, pinfo: 1, pgone: 1, corpses: 1, ma: 1, fx: 1, lootwin: 1, took: 1, log: 1 },
    handle(m) {
      const g = this.game; if (!g || !g.player) return;
      if (this.awaitingZone && this.zoneScoped[m.t]) return; // stale traffic from the zone we just left
      const h = this['h_' + m.t]; if (h) { try { h.call(this, m, g); } catch (e) { console.error('[net]', m.t, e); } }
    },
    onWelcome(m) {
      this.pid = m.pid; this.seed = m.seed; this.edits = m.edits || {}; this.charId = m.char.id; this.admin = m.admin; this.build = m.build !== false;
      this.save = m.save; this.serverName = m.server; this.dayT = m.dayT;
      ls.set({ lastChar: m.char.id });
      this.active = true; this.ready = false; this.queue = [];
      this.ui.enter(m.newChar);
    },
    attach(g) { this.game = g; },
    started() {
      const g = this.game; this.ready = true;
      if (this.dayT != null) g.dayT = this.dayT;
      g.log(`You are playing online on ${this.serverName}. /say talks to people nearby, /shout hollers to the zone, /ooc chats with everyone, /tell <name> to one player. Target a player and type /invite to group. /who lists who is online.`, 'help');
      const q = this.queue; this.queue = [];
      for (const m of q) this.handle(m);
      this.sendLook(true); this.sendMove(true);
      this.pingT = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 15000);
    },

    // ---------- keys between the server and local entities
    srcKey(e) { const g = this.game; if (!g || !e) return null; if (e === g.player) return 'p'; const i = g.mercs.indexOf(e); return i >= 0 ? 'm' + i : null; },
    keyEnt(k) {
      const g = this.game; if (!k || !g) return null;
      const c = k[0], rest = k.slice(1);
      if (c === 'p') { const pid = +rest; return pid === this.pid ? g.player : this.remotes.get(pid) || null; }
      if (c === 'm') { const [pid, i] = rest.split(':').map(Number); if (pid === this.pid) return g.mercs[i] || null; const r = this.remotes.get(pid); return r ? r.mercEnts[i] || null : null; }
      if (c === 'n') return g.npcs[+rest] || null;
      if (c === 'x') return this.mobById(+rest);
      return null;
    },
    mobById(id) { for (const m of this.game.mobs) if (m.id === id) return m; return null; },

    // ---------- monsters (mirrors of the server's)
    spawnMob(f) {
      const g = this.game; if (this.mobById(f.id)) return;
      if (!MOBS[f.type]) return;
      const m = new Mob(f.type, null, f.x, f.y, f.z, [f.lvl, f.lvl]);
      m.id = f.id; m.net = true; m.level = f.lvl; m.maxHp = f.mhp; m.hp = f.hp; m.maxHit = f.mx; m.yaw = f.yaw;
      m.tpos = new THREE.Vector3(f.x, f.y, f.z); m.tyaw = f.yaw; m.netFlags = 0; m.atkSeq = -1;
      m.hate = new NetHate(m);
      m.addHate = function (ent, amt) { if (!this.alive || !ent) return; const s = net.srcKey(ent); if (s) net.send({ t: 'hate', id: this.id, s, a: Math.round(amt) }); NetHate.prototype.raw.call(this.hate, ent, (this.hate.get(ent) || 0) + amt); };
      m.aggroOn = function (t) { if (!this.alive) return; const s = net.srcKey(t); if (s) net.send({ t: 'hate', id: this.id, s, a: 1 }); };
      for (const k of CC) {
        let v = 0, setAt = 0;
        Object.defineProperty(m, k, { configurable: true, get() { return v; },
          set(x) { v = x; if (net.applying) return; setAt = performance.now(); net.send({ t: 'cc', id: m.id, f: k, d: Math.max(0, x - g.time) }); } });
        Object.defineProperty(m, '_' + k + 'At', { get() { return setAt; } });
      }
      if (f.st === 4) this.markDead(m, true);
      m.refreshPlate(g); m.addTo(g.scene); m.syncModel();
      g.mobs.push(m);
    },
    applyMob(t) {
      const g = this.game, m = this.mobById(t[0]); if (!m) return;
      m.tpos.set(t[1], t[2], t[3]); m.tyaw = t[4];
      if (m.hp !== t[5]) { if (t[5] < m.hp) EB.models.flinch(m.model); m.hp = t[5]; if (m === g.target) g.updateTargetWin(); }
      const st = ST[t[6]] || 'idle';
      if (st === 'dead' && m.alive) this.markDead(m);
      else if (st !== 'dead') m.state = st;
      m.target = t[7] ? this.keyEnt(t[7]) : null;
      m.netFlags = t[8];
      this.applying = true;
      for (const k of CC) { const on = !!(t[8] & CC_BIT[k]); if (on) { if (m[k] < g.time + 0.4) m[k] = g.time + 0.6; } else if (m[k] > g.time && performance.now() - m['_' + k + 'At'] > 700) m[k] = 0; }
      this.applying = false;
      m.casting = t[8] & 2 ? m.casting || { t: 1, net: true } : null;
      if (m.atkSeq !== t[9]) { if (m.atkSeq >= 0) m.attackT = 0.01; m.atkSeq = t[9]; }
      if (t[10]) { const h = m.hate; Map.prototype.clear.call(h); for (const [k, v] of t[10]) { const e = this.keyEnt(k); if (e) h.raw(e, v); } }
      else if (m.state !== 'chase') Map.prototype.clear.call(m.hate);
    },
    markDead(m, quiet) {
      const g = this.game;
      m.state = 'dead'; m.target = null; m.casting = null; Map.prototype.clear.call(m.hate);
      EB.models.setDead(m.model, true); if (quiet) m.model.st.deadT = 1;
      m.loot = { coins: 0, items: [] };
      m.refreshPlate(g);
      if (g.target === m) { g.player.autoAttack = false; g.updateTargetWin(); }
      if (g.player.casting && g.player.casting.target === m) g.interruptCast('Your target has died.');
    },
    updateMob(m, dt) {
      const g = this.game;
      if (!m.tpos) { m.update(dt, g); return; }
      const d = m.pos.distanceTo(m.tpos);
      if (d > 8) m.pos.copy(m.tpos); else m.pos.lerp(m.tpos, 1 - Math.exp(-dt * 12));
      m.yaw = angLerp(m.yaw, m.tyaw, 1 - Math.exp(-dt * 12));
      const moving = !!(m.netFlags & 1) && m.alive;
      const speed = m.def.speed * (m.netFlags & 16 ? 0.5 : 1);
      if (moving) m.walkPhase += dt * speed * 2.2;
      if (m.attackT > 0) { m.attackT += dt * 3; if (m.attackT >= 1) m.attackT = 0; }
      if (!m.alive) { if (m.model.st.deadT < 1) animateModel(m.model, m.walkPhase, false, 0, false, { dt, always: true }); }
      else {
        const mez = g.time < (m.mezUntil || 0) || g.time < (m.stunUntil || 0);
        animateModel(m.model, m.walkPhase, moving && !mez, mez || m.casting ? 0 : m.attackT, false, { dt, cast: !!m.casting && !mez, speed });
        m.model.group.rotation.z = g.time < (m.mezUntil || 0) ? Math.sin(g.time * 2) * 0.06 : 0;
      }
      m.syncModel();
    },
    updateNpc(n, dt) {
      if (!n.tpos) { if (n.npcKind !== 'guard') n.update(dt, this.game); else { n.syncModel(); animateModel(n.model, n.walkPhase, false, n.attackT, false, { dt }); } return; }
      const d = n.pos.distanceTo(n.tpos);
      if (d > 8) n.pos.copy(n.tpos); else n.pos.lerp(n.tpos, 1 - Math.exp(-dt * 10));
      n.yaw = angLerp(n.yaw, n.tyaw, 1 - Math.exp(-dt * 10));
      if (n.nmov) n.walkPhase += dt * 10;
      if (n.attackT > 0) { n.attackT += dt * 3; if (n.attackT >= 1) n.attackT = 0; }
      animateModel(n.model, n.walkPhase, !!n.nmov, n.attackT, false, { dt });
      n.syncModel();
    },

    // ---------- message handlers
    h_zonestate(m, g) {
      for (const mob of g.mobs.slice()) g.removeEntity(mob);
      for (const f of m.sp) this.spawnMob(f);
    },
    h_s(m, g) {
      if (m.sp) for (const f of m.sp) this.spawnMob(f);
      if (m.m) for (const t of m.m) this.applyMob(t);
      if (m.p) for (const t of m.p) this.applyPlayer(t);
      if (m.n) for (const t of m.n) { const n = g.npcs[t[0]]; if (!n) continue; if (!n.tpos) n.tpos = new THREE.Vector3(); n.tpos.set(t[1], t[2], t[3]); n.tyaw = t[4]; n.nmov = t[5]; if (t[6] && !(n.attackT > 0)) n.attackT = 0.01; }
    },
    h_gone(m, g) { const mob = this.mobById(m.id); if (mob) g.removeEntity(mob); },
    h_die(m, g) {
      const mob = this.mobById(m.id); if (!mob) return;
      const mine = m.byKey === 'p' + this.pid;
      if (mine) g.log(`You have defeated ${mob.name}! It had it coming.`, 'melee');
      else if (g.player.pos.distanceTo(mob.pos) < 40) g.log(`${U.cap(mob.name)} has been taken out by ${m.by || 'something'}!`, 'other');
      mob.hp = 0; this.markDead(mob);
    },
    h_xp(m, g) {
      const pl = g.player, mob = m.id ? this.mobById(m.id) : null;
      if (m.kill && mob) { g.questKillHook && g.questKillHook(mob); for (const [f, d] of g.factionHitsFor(mob)) g.adjustFaction(f, d); }
      if (m.n > 0) { this.xpOK = true; try { g.gainXP(m.n, m.party); } finally { this.xpOK = false; } }
      else if (m.kill) g.log('That kill taught you absolutely nothing.', 'other');
      if (pl.level !== m.lvl || Math.abs(pl.xp - m.xp) > 1) { pl.level = m.lvl; pl.xp = m.xp; }
    },
    h_ma(m, g) {
      const mob = this.mobById(m.id); if (!mob || !mob.alive) return;
      if (m.w == null) { if (m.k === 's' && mob.def.caster) g.mobSpell(mob, g.player, mob.def.caster); else g.mobAttackPlayer(mob); }
      else { const mc = g.mercs[m.w]; if (!mc || mc.dead) return; if (m.k === 's' && mob.def.caster) g.mobSpell(mob, mc, mob.def.caster); else g.mercTakeHit(mob, mc, null); }
    },
    h_fx(m, g) {
      const a = this.mobById(m.a); if (!a) return;
      if (m.k === 'heal') EB.fx.heal(a);
      else if (m.k === 'buff') EB.fx.buff(a, m.c);
      else if (m.k === 'bolt') { const to = this.keyEnt(m.b); if (!to || to === g.player || g.mercs.includes(to)) return; EB.fx.bolt(g.castHand(a), to, m.c ? 0x9ee8ff : 0xff8040, { size: 0.6, speed: 24 }); }
    },
    h_log(m, g) { g.log(m.m, m.c || 'other'); },
    h_chat(m, g) {
      const f = m.from, t = m.m;
      const line = f == null && m.c !== 'announce' ? t : { say: m.self ? `You say: "${t}"` : `${f} says: "${t}"`, shout: m.self ? `You holler: "${t}"` : `${f} hollers: "${t}"`, ooc: `[OOC] ${m.self ? 'You' : f}: ${t}`,
        auction: `[Market] ${m.self ? 'You hawk' : f + ' hawks'}: "${t}"`, group: `[Party] ${m.self ? 'You' : f}: ${t}`, tell: `${f} whispers to you: "${t}"`, told: `You whisper to ${f}: "${t}"`, announce: `[Server] ${t}` }[m.c];
      g.log(line || t, { say: 'say', shout: 'shout', ooc: 'ooc', auction: 'ooc', group: 'group', tell: 'tell', told: 'tell', announce: 'announce', who: 'sys', help: 'help' }[m.c] || 'sys');
      if (m.c === 'announce') EB.ui.center('Server', t, 5);
    },
    h_invite(m) { this.toast(`${esc(m.from)} wants you in their party.`, [['Join', () => this.chat('/join')], ['Decline', () => this.chat('/decline')]]); },
    h_group(m, g) {
      this.group = m.id ? m : null;
      for (const r of this.remotes.values()) this.refreshRemotePlate(r);
      g.renderGroup();
    },
    h_pinfo(m, g) {
      if (m.pid === this.pid) return; // our own info (we know ourselves)
      let r = this.remotes.get(m.pid);
      const sigOf = (x) => JSON.stringify([x.equip, x.race, x.cls]);
      if (r && sigOf(r.info) !== sigOf(m)) { this.removeRemote(r); r = null; }
      if (!r) {
        r = new RemotePlayer(m); r.info = m; r.tpos = new THREE.Vector3(); r.placed = false;
        this.remotes.set(m.pid, r);
        r.addTo(g.scene); r.model.group.visible = false; if (r.plate) r.plate.visible = false;
      }
      r.info = m; r.level = m.level; r.title = m.title; r.name = m.name;
      const msig = JSON.stringify(m.mercs || []);
      if (msig !== r.msig) { for (const e of r.mercEnts) e.removeFrom(g.scene); r.mercEnts = (m.mercs || []).map((x, i) => { const e = new RemoteMerc(r, x, i); e.addTo(g.scene); e.model.group.visible = false; e.plate.visible = false; e.tpos = new THREE.Vector3(); return e; }); r.msig = msig; }
      this.refreshRemotePlate(r);
      if (g.target === r) g.updateTargetWin();
    },
    refreshRemotePlate(r) { if (r.plate) setNameplate(r.plate, r.name, r.grouped ? '#70ff70' : '#9fd8ff', r.sub(r.info)); },
    applyPlayer(t) {
      const g = this.game, r = t[0] !== this.pid && this.remotes.get(t[0]); if (!r) return;
      r.tpos.set(t[1], t[2], t[3]); r.tyaw = t[4];
      if (!r.placed) { r.pos.copy(r.tpos); r.yaw = t[4]; r.placed = true; r.model.group.visible = true; }
      r.flags = t[5];
      if (r.atkSeq !== t[6]) { if (r.seenAtk) r.attackT = 0.01; r.atkSeq = t[6]; r.seenAtk = true; }
      r._hp = t[7]; r.mhp = t[8];
      const dead = !!(t[5] & 8);
      if (dead !== r.dead) { r.dead = dead; r.alive = !dead; EB.models.setDead(r.model, dead); if (dead && g.target === r) g.setTarget(null); }
      (t[9] || []).forEach((a, i) => {
        const e = r.mercEnts[i]; if (!e) return;
        e.tpos.set(a[0], a[1], a[2]); e.tyaw = a[3]; e.flags = a[4];
        if (!e.placed) { e.pos.copy(e.tpos); e.placed = true; }
        if (e.atkSeq !== a[5]) { if (e.seenAtk) e.attackT = 0.01; e.atkSeq = a[5]; e.seenAtk = true; }
        e.hp = a[6]; e.maxHp = a[7]; e.dead = !!(a[4] & 8);
        e.model.group.visible = !e.dead;
      });
      if (g.target === r) g.updateTargetWin();
    },
    h_pgone(m, g) { const r = this.remotes.get(m.pid); if (r) this.removeRemote(r); },
    removeRemote(r) {
      const g = this.game; r.removeFrom(g.scene); for (const e of r.mercEnts) e.removeFrom(g.scene);
      this.remotes.delete(r.pid); if (g.target === r) g.setTarget(null);
    },
    h_corpses(m, g) {
      for (const c of this.corpses) c.removeFrom(g.scene);
      this.corpses = m.list.filter((c) => c.owner !== this.pid).map((c) => { const e = new RemoteCorpse(c); e.addTo(g.scene); return e; });
    },
    h_healed(m, g) {
      const pl = g.player; if (!pl.alive) return;
      const before = pl.hp; pl.hp = Math.min(pl.maxHp, pl.hp + m.amt);
      g.log(`${m.from}'s healing magic washes over you. (+${Math.round(pl.hp - before)} HP)`, 'spell'); EB.fx.heal(pl);
    },
    h_buffed(m, g) {
      const pl = g.player, sp = SPELLS[m.id]; if (!sp || !pl.alive) return;
      pl.buffs = pl.buffs.filter((b) => b.id !== m.id);
      pl.buffs.push({ id: m.id, name: sp.name, left: sp.dur, buff: sp.buff });
      g.log(`${m.from} casts ${sp.name} on you.`, 'spell'); EB.fx.buff(pl, EB.fx.SCHOOL[sp.school] || 0xfff0a0);
    },
    h_lootwin(m, g) {
      const c = this.mobById(m.id);
      if (m.err) { g.log(m.err, 'sys'); return; }
      if (!c || m.gone) { g.log('That corpse has already been looted.', 'sys'); return; }
      const pl = g.player;
      g.lootCorpse = c; c.loot = { coins: 0, items: m.items.slice() };
      if (m.coins > 0) { pl.coins += m.coins; g.log(`You pocket ${U.coinStr(m.coins)} from ${c.corpseName()}.`, 'loot'); EB.audio.loot(); }
      if (!c.loot.items.length) { g.log(`You find nothing else on ${c.corpseName()}.`, 'sys'); g.lootCorpse = null; this.send({ t: 'lootdone', id: c.id }); return; }
      $('lootTitle').firstChild.textContent = `Loot: ${c.corpseName()} `;
      g.openWin('lootWin');
    },
    h_took(m, g) {
      this.pendingTake = false;
      const c = this.mobById(m.id);
      if (m.item) {
        g.addItem(m.item.id, m.item.count);
        const I = ITEMS[m.item.id];
        g.log(`You yoink ${I.rare ? 'the' : /^[aeiou]/i.test(I.name) ? 'an' : 'a'} ${I.name} from ${c ? c.corpseName() : 'a corpse'}!`, I.rare ? 'ding' : 'loot');
        EB.audio.loot();
      }
      if (!c || g.lootCorpse !== c) return;
      const k = c.loot.items.findIndex((x, j) => j === m.i && (!m.item || x.id === m.item.id));
      if (k >= 0) c.loot.items.splice(k, 1);
      EB.ui.hideTip();
      if (!c.loot.items.length) { this.lootAllOn = false; g.closeWin('lootWin'); }
      else { g.renderLoot(); if (this.lootAllOn) this.takeLoot(c, 0); }
      if (g.windows.has('invWin')) g.renderInv();
    },
    h_blk(m, g) {
      const e = this.edits[m.zone] || (this.edits[m.zone] = {});
      e[m.x + m.z * EB.WORLD.W + m.y * EB.WORLD.W * EB.WORLD.D] = m.b;
      if (g.world && g.world.zoneId === m.zone && g.world.get(m.x, m.y, m.z) !== m.b) g.world.setBlock(m.x, m.y, m.z, m.b);
    },
    h_zoned(m, g) {
      this.awaitingZone = null;
      if (!m.ok) {
        if (m.zone !== g.world.zoneId) { g._zoneVia = 'forced'; g.loadZone(m.zone, null); }
        g.player.pos.set(m.x, m.y, m.z); g.player.vel.set(0, 0, 0);
        g.log('The server moved you back.', 'sys');
      }
      this.sendMove(true);
    },
    h_pos(m, g) { g.player.pos.set(m.x, m.y, m.z); g.player.vel.set(0, 0, 0); },
    h_time(m, g) { g.dayT = m.dayT; },

    // ---------- outgoing
    zoneLoaded(zoneId, via) {
      if (via === 'init' || via === 'forced') return;
      this.awaitingZone = zoneId;
      this.send({ t: 'zone', to: zoneId, via: via === 'line' ? 'line' : 'bind' });
    },
    editsFor(zoneId) { return this.edits[zoneId] || {}; },
    clearZone() {
      const g = this.game; if (!g || !g.scene) return;
      for (const r of [...this.remotes.values()]) this.removeRemote(r);
      for (const c of this.corpses) c.removeFrom(g.scene); this.corpses = [];
    },
    damage(m, dmg, src) {
      const s = this.srcKey(src); if (!s) return;
      dmg = Math.max(0, Math.round(dmg));
      this.send({ t: 'dmg', id: m.id, d: dmg, s });
      if (dmg > 0) { m.hp = Math.max(1, m.hp - dmg); EB.models.flinch(m.model); } // predicted; the server's value follows
    },
    requestLoot(c) { this.send({ t: 'loot', id: c.id }); },
    takeLoot(c, i) {
      const it = c.loot.items[i]; if (!it || this.pendingTake) return false;
      const pl = this.game.player, I = ITEMS[it.id];
      if (!(I.stack && pl.inv.some((s) => s && s.id === it.id)) && pl.inv.indexOf(null) < 0) { this.game.log('Your inventory is full!', 'sys'); this.lootAllOn = false; return false; }
      this.pendingTake = true; this.send({ t: 'take', id: c.id, i, item: it.id });
      return true;
    },
    lootAllFrom(c) { this.lootAllOn = true; this.takeLoot(c, 0); },
    block(x, y, z, b) { if (!this.build) { this.game.log('Building is disabled on this server.', 'sys'); return false; } this.send({ t: 'blk', x, y, z, b }); return true; },
    sendSave(data, now) { this.send({ t: 'save', data, now: !!now }); },
    chat(v) { this.send({ t: 'chat', v, tgt: this.game && this.game.target && this.game.target.kind === 'pc' ? this.game.target.name : undefined }); },
    serverCmds: new Set(['say', 's', 'shout', 'sh', 'ooc', 'auction', 'auc', 'g', 'gsay', 'group', 'tell', 't', 'msg', 'r', 'reply', 'who', 'invite', 'inv', 'join', 'accept', 'follow', 'decline', 'disband', 'leave', 'leavegroup', 'remove', 'gkick', 'motd', 'announce', 'broadcast', 'kick', 'ban', 'unban', 'setmotd', 'gm', 'admin', 'tp', 'goto', 'summon']),
    command(v) {
      if (v[0] !== '/') { this.chat(v); return true; }
      const cmd = v.slice(1).toLowerCase().split(/\s+/)[0];
      if (cmd === 'help') { this.game.log('Online: /say /shout /ooc /auction /tell <name> /r /g (group chat) /who [name] /invite [name] /join /decline /disband /remove <name> /motd /logout' + (this.admin ? ' | Admin: /announce /kick /ban /unban /setmotd /tp /goto /summon' : ''), 'help'); return false; }
      if (cmd === 'logout' || cmd === 'camp') { this.game.save(true); this.game.log('Returning to character select...', 'sys'); setTimeout(() => this.reconnectToSelect(), 400); return true; }
      if (this.serverCmds.has(cmd)) { this.chat(v); return true; }
      return false;
    },
    reconnectToSelect() { try { sessionStorage.setItem('everblock_autoplay', JSON.stringify({ server: this.base || '', select: true })); } catch (e) { /* ignore */ } location.reload(); },
    sendMove(force) {
      const g = this.game, pl = g.player; if (!pl || this.awaitingZone) return;
      const casting = !!(pl.casting && !pl.casting.skill);
      const moving = Math.hypot(pl.vel.x, pl.vel.z) > 0.2 && pl.alive;
      if (g.pAttackAnim > 0 && !this.lastAtk) this.atkSeq = (this.atkSeq + 1) & 255;
      this.lastAtk = g.pAttackAnim > 0 ? 1 : 0;
      const f = (moving ? 1 : 0) | (pl.sitting ? 2 : 0) | (casting ? 4 : 0) | (pl.alive ? 0 : 8);
      const r = (v) => Math.round(v * 100) / 100;
      const msg = { t: 'mv', x: r(pl.pos.x), y: r(pl.pos.y), z: r(pl.pos.z), yaw: r(pl.yaw), f, a: this.atkSeq, hp: Math.round(pl.hp), mhp: pl.maxHp, mn: Math.round(pl.mana), mmn: pl.maxMana,
        m: g.mercs.map((c) => [r(c.pos.x), r(c.pos.y), r(c.pos.z), r(c.yaw), (Math.hypot(c.vel.x, c.vel.z) > 0.2 ? 1 : 0) | (c.sitting ? 2 : 0) | (c.casting ? 4 : 0) | (c.dead ? 8 : 0), c._atkSeq || 0, Math.round(c.hp), c.maxHp]) };
      for (const c of g.mercs) { if (c.attackT > 0 && !c._atkOn) c._atkSeq = ((c._atkSeq || 0) + 1) & 255; c._atkOn = c.attackT > 0; }
      const sig = JSON.stringify(msg);
      if (!force && sig === this.lastMv && performance.now() - this.lastMvT < 1000) return;
      this.lastMv = sig; this.lastMvT = performance.now();
      this.send(msg);
    },
    sendLook(force) {
      const g = this.game, pl = g.player;
      const look = { t: 'look', equip: pl.equip, title: pl.title, level: pl.level, mercs: g.mercs.map((m) => ({ role: m.role, petLvl: m.petLvl, name: m.name })) };
      const sig = JSON.stringify(look);
      if (!force && sig === this.lookSig) return;
      this.lookSig = sig; this.send(look);
    },
    update(dt) {
      const g = this.game, pl = g.player;
      this.mvT -= dt; if (this.mvT <= 0) { this.mvT = 0.1; this.sendMove(); }
      this.lookT -= dt; if (this.lookT <= 0) { this.lookT = 1; this.sendLook(); }
      const camP = g.camera.position;
      const fit = (e) => { if (!e.plate) return 99; const dc = e.plate.position.distanceTo(camP), k = U.clamp(dc / 11, 0.42, 1); e.plate.scale.set(4.4 * k, 0.82 * k, 1); return dc; };
      for (const r of this.remotes.values()) {
        if (!r.placed) continue;
        const d = r.pos.distanceTo(r.tpos);
        if (d > 10) r.pos.copy(r.tpos); else r.pos.lerp(r.tpos, 1 - Math.exp(-dt * 12));
        r.yaw = angLerp(r.yaw, r.tyaw, 1 - Math.exp(-dt * 14));
        const moving = !!(r.flags & 1) && !r.dead, sitting = !!(r.flags & 2), casting = !!(r.flags & 4);
        if (moving) r.walkPhase += dt * 11;
        if (r.attackT > 0) { r.attackT += dt * 3.5; if (r.attackT >= 1) r.attackT = 0; }
        animateModel(r.model, r.walkPhase, moving, casting ? 0 : r.attackT, sitting, { dt, cast: casting, always: true });
        r.syncModel();
        if (casting) g.castGlow(r, 0xfff080, dt);
        r.plate.visible = fit(r) > 2.2 && r.pos.distanceTo(pl.pos) < 60;
        for (const e of r.mercEnts) {
          if (!e.placed || e.dead) { e.plate.visible = false; continue; }
          const de = e.pos.distanceTo(e.tpos);
          if (de > 10) e.pos.copy(e.tpos); else e.pos.lerp(e.tpos, 1 - Math.exp(-dt * 12));
          e.yaw = angLerp(e.yaw, e.tyaw, 1 - Math.exp(-dt * 14));
          const mv = !!(e.flags & 1);
          if (mv) e.walkPhase += dt * 11;
          if (e.attackT > 0) { e.attackT += dt * 3; if (e.attackT >= 1) e.attackT = 0; }
          animateModel(e.model, e.walkPhase, mv, e.flags & 4 ? 0 : e.attackT, !!(e.flags & 2), { dt, cast: !!(e.flags & 4) });
          e.syncModel(); e.plate.visible = fit(e) > 2.2 && e.pos.distanceTo(pl.pos) < 40;
        }
      }
      for (const c of this.corpses) c.plate.visible = fit(c) > 2.2 && c.pos.distanceTo(pl.pos) < 30;
    },
    pickables() { const a = []; for (const r of this.remotes.values()) if (r.placed && !r.dead) a.push(r); return a; },
    groupEnts() { if (!this.group) return []; const a = []; for (const r of this.remotes.values()) if (r.placed && r.grouped && !r.dead && this.game && r.pos.distanceTo(this.game.player.pos) < 80) a.push(r); return a; },
    hasGroup() { return !!this.group; },
    renderGroupRows(gw) {
      if (!this.group) return;
      const g = this.game;
      for (const mem of this.group.members) {
        if (mem.pid === this.pid) continue;
        const r = this.remotes.get(mem.pid);
        const row = document.createElement('div'); row.className = 'gmem gpc';
        row.innerHTML = `<div class="gname">${mem.pid === this.group.leader ? '<span class="gl" title="Group leader">★</span> ' : ''}${esc(mem.name)} <span class="gpet">${mem.level} ${CLASSES[mem.cls] ? CLASSES[mem.cls].name : ''}</span></div>` +
          (r ? '<div class="bar hp"><div class="fill"></div><span></span></div>' : `<div class="gstance">${esc((EB.WORLD.ZONES[mem.zone] || {}).name || 'elsewhere')}</div>`);
        row.onclick = () => { if (r && r.placed && !r.dead) g.setTarget(r); };
        row.dataset.pid = mem.pid; gw.appendChild(row);
      }
      if (this.group.members.length > 1) { const l = document.createElement('div'); l.className = 'gsep'; gw.appendChild(l); }
      this.updateGroupBars();
    },
    updateGroupBars() {
      const g = this.game; if (!this.group) return;
      for (const row of document.querySelectorAll('#groupWin .gpc')) {
        const r = this.remotes.get(+row.dataset.pid), bar = row.querySelector('.bar'); if (!r || !bar) continue;
        const f = r.dead ? 0 : U.clamp(r.hp / r.maxHp, 0, 1);
        bar.firstChild.style.width = f * 100 + '%'; bar.lastChild.textContent = r.dead ? 'DEAD' : `${Math.ceil(r.hp)} / ${r.maxHp}`;
        row.classList.toggle('tgt', g.target === r);
      }
    },
    toast(html, buttons) {
      let t = $('netToast'); if (!t) { t = document.createElement('div'); t.id = 'netToast'; document.body.appendChild(t); }
      t.innerHTML = `<div>${html}</div><div class="btnRow"></div>`;
      const row = t.querySelector('.btnRow');
      for (const [label, fn] of buttons || []) { const b = document.createElement('button'); b.className = 'small'; b.textContent = label; b.onclick = (e) => { e.stopPropagation(); t.classList.add('hidden'); fn(); }; row.appendChild(b); }
      t.classList.remove('hidden');
      clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.add('hidden'), 30000);
    },
  };

  // ---------------------------------------------------------------- title screen: Play Online
  net.ui = {
    onPlay: null,
    status(s) { const e = $('olStatus'); if (e) e.textContent = s; },
    err(s) { const e = $('olErr'); if (e) e.textContent = s || ''; const c = $('nameErr'); if (c && net.creating) c.textContent = s || ''; },
    info(m) {
      const e = $('olServerInfo'); if (e) e.innerHTML = `<b>${esc(m.name)}</b> &middot; v${esc(m.version)} &middot; ${m.online} online${m.motd ? '<br><i>' + esc(m.motd) + '</i>' : ''}`;
      $('olBtnRegister').classList.toggle('hidden', m.register === false);
    },
    show(which) {
      for (const id of ['menuMain', 'menuCreate', 'menuOnline']) $(id).classList.toggle('hidden', id !== which);
      if (which === 'menuOnline') { $('olLogin').classList.toggle('hidden', !!net.authed); $('olChars').classList.toggle('hidden', !net.authed); }
    },
    open() {
      const st = ls.get();
      const served = /^https?:$/.test(location.protocol) && !/github\.io$/i.test(location.hostname);
      $('olServer').value = st.server != null && st.server !== '' ? st.server : served ? location.origin : '';
      $('olUser').value = st.user || '';
      this.err(''); this.show('menuOnline');
      this.ensureConnected(() => { if (st.token && !net.authed) net.send({ t: 'resume', token: st.token }); });
    },
    ensureConnected(then) {
      const base = $('olServer').value.trim();
      if (!base && !/^https?:$/.test(location.protocol)) { this.err('Enter your server address (for example https://play.example.com).'); return; }
      if (net.ws && net.ws.readyState === 1 && net.base === base) { then && then(); return; }
      if (net.ws && net.ws.readyState === 0 && net.base === base) { const w = net.ws; w.addEventListener('open', () => then && then()); return; }
      net.authed = false;
      net.connect(base, then);
    },
    login(register) {
      const user = $('olUser').value.trim(), pass = $('olPass').value;
      if (!user || !pass) { this.err('Enter a username and password.'); return; }
      this.err(''); this.status(register ? 'Creating account...' : 'Logging in...');
      ls.set({ server: $('olServer').value.trim(), user });
      this.ensureConnected(() => net.send({ t: register ? 'register' : 'login', user, pass }));
    },
    onAuth(m) {
      this.status('');
      if (!m.ok) { this.err(m.err); if (m.expired) ls.set({ token: null }); this.show('menuOnline'); return; }
      net.authed = true; net.user = m.user; net.admin = m.admin;
      ls.set({ token: m.token, user: m.user, server: $('olServer').value.trim() });
      $('olPass').value = '';
      this.show('menuOnline');
    },
    onChars(m) {
      net.chars = m.chars;
      const list = $('olCharList'); list.innerHTML = '';
      $('olWho').innerHTML = `Logged in as <b>${esc(net.user || '')}</b>${net.admin ? ' <span class="gm">GM</span>' : ''}`;
      if (!m.chars.length) list.innerHTML = '<div class="sub">No characters yet. Create one to enter the world.</div>';
      for (const c of m.chars) {
        const row = document.createElement('div'); row.className = 'olChar';
        row.innerHTML = `<div class="n"><b>${esc(c.name)}</b>${c.title ? ', ' + esc(c.title) : ''}<br><span>Level ${c.level} ${RACES[c.race].name} ${CLASSES[c.cls].name} &middot; ${esc(c.zone)}</span></div>`;
        const play = document.createElement('button'); play.className = 'big olPlay'; play.textContent = 'Play';
        play.onclick = () => { EB.audio.unlock(); this.status('Entering the world...'); net.send({ t: 'play', id: c.id }); };
        const del = document.createElement('button'); del.className = 'small'; del.textContent = 'Delete';
        del.onclick = () => { if (confirm(`Delete ${c.name} forever?`)) net.send({ t: 'delete', id: c.id }); };
        row.appendChild(play); row.appendChild(del); list.appendChild(row);
      }
      const auto = net.autoplay; net.autoplay = null;
      if (auto && auto.charId && m.chars.some((c) => c.id === auto.charId)) net.send({ t: 'play', id: auto.charId });
      this.show(net.creating ? 'menuCreate' : 'menuOnline');
    },
    onCreated() { net.creating = false; if (EB.models) EB.models.stopPreview(); this.show('menuOnline'); },
    onLoggedOut() { net.authed = false; ls.set({ token: null }); this.show('menuOnline'); },
    startCreate() {
      net.creating = true; this.err('');
      $('btnNew').click(); // reuses the solo character creator (race/class/stats/preview)
    },
    enter(newChar) {
      $('title').classList.add('hidden');
      if (EB.models) EB.models.stopPreview();
      this.onPlay(newChar);
    },
  };
  net.bindTitle = function (onPlay) {
    net.ui.onPlay = onPlay;
    $('btnOnline').onclick = () => { EB.audio.unlock(); net.ui.open(); };
    $('olBtnBack').onclick = () => net.ui.show('menuMain');
    $('olBtnLogin').onclick = () => net.ui.login(false);
    $('olBtnRegister').onclick = () => net.ui.login(true);
    $('olBtnNew').onclick = () => net.ui.startCreate();
    $('olBtnLogout').onclick = () => { net.send({ t: 'logout', full: true }); };
    $('olServer').addEventListener('change', () => { net.authed = false; ls.set({ server: $('olServer').value.trim(), token: null }); net.ui.ensureConnected(); });
    for (const id of ['olUser', 'olPass', 'olServer']) $(id).addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') net.ui.login(false); });
    const dn = $('netDown'); if (dn) dn.querySelector('button').onclick = () => net.reconnect();
    // served by an Everblock server? say so on the start screen
    if (/^https?:$/.test(location.protocol) && !/github\.io$/i.test(location.hostname)) {
      // only ask for api/info when this page came from an Everblock server (it marks its pages), so plain static hosts see no 404
      if (navigator.onLine !== false) fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }).then((r) => (r.ok && r.headers.get('x-everblock-server') ? fetch('api/info', { cache: 'no-store' }) : null)).then((r) => (r && r.ok ? r.json() : null)).then((i) => {
        if (!i || !i.name) return;
        const h = $('onlineHint'); h.innerHTML = `🌐 <b>${esc(i.name)}</b> is online &mdash; ${i.online} player${i.online === 1 ? '' : 's'} in the world`; h.classList.remove('hidden');
        $('btnOnline').classList.add('glow');
      }).catch(() => {});
    }
    let auto = null; try { auto = JSON.parse(sessionStorage.getItem('everblock_autoplay')); sessionStorage.removeItem('everblock_autoplay'); } catch (e) { /* ignore */ }
    if (auto) { net.autoplay = auto; ls.set({ server: auto.server }); net.ui.open(); }
  };
  EB.net = net;
})();
