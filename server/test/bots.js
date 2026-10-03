// Everblock server protocol test with raw WebSocket bots (no browser): starts a throwaway server and checks
// accounts, characters, seeing each other, chat, grouping, a shared kill with split XP, loot, zone change,
// anti-cheat rejections and disconnect/reconnect persistence.   Run: npm test
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const { EB } = require('../lib/shared');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-bots-'));
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.waiters = []; }
  open() { return new Promise((res, rej) => { this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); this.ws.on('open', res); this.ws.on('error', rej); this.ws.on('close', (c, r) => { if (process.env.DBG) console.log('closed', this.name, c, String(r)); }); this.ws.on('message', (d) => { const m = JSON.parse(d); this.msgs.push(m); this.onMsg(m); }); }); }
  onMsg(m) {
    if (m.t === 'welcome') { this.pid = m.pid; this.welcome = m; }
    if (m.t === 'zonestate') { this.zone = m.zone; this.mobs = new Map(m.sp.map((f) => [f.id, f])); }
    if (m.t === 's') { for (const f of m.sp || []) this.mobs.set(f.id, f); for (const t of m.m || []) { const f = this.mobs.get(t[0]); if (f) { f.x = t[1]; f.y = t[2]; f.z = t[3]; f.hp = t[5]; f.st = t[6]; } } }
    if (m.t === 'gone') this.mobs.delete(m.id);
    if (m.t === 'pos') { this.pos = [m.x, m.y, m.z]; }
    if (m.t === 'zoned' && m.ok) this.pos = [m.x, m.y, m.z];
    for (const w of this.waiters.slice()) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 8000, label) {
    const hit = this.msgs.find((m) => pred(m) && !m._used); if (hit) { hit._used = true; return Promise.resolve(hit); }
    return new Promise((res, rej) => { const w = { pred, res: (m) => { m._used = true; clearTimeout(w.t); res(m); } }; w.t = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); rej(new Error(`${this.name}: timeout waiting for ${label || pred}`)); }, ms); this.waiters.push(w); });
  }
  mv(x, y, z) { this.pos = [x, y, z]; this.send({ t: 'mv', x, y, z, yaw: 0, f: 0, a: 0, hp: 100, mhp: 100, mn: 0, mmn: 0, m: [] }); }
  async walkTo(x, z, w) { // 9 m/s, under the server's speed limit
    for (;;) {
      const [px, , pz] = this.pos, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
      if (d < 0.5) break;
      const s = Math.min(0.9, d), nx = px + (dx / d) * s, nz = pz + (dz / d) * s;
      this.mv(nx, Math.min(w.surfaceY(nx, nz), this.pos[1] + 1), nz); await sleep(100); // no wall-climbing: the server limits vertical speed
    }
  }
}
const statsFor = (race, cls) => EB.data.RACES[race].stats.map((v, i) => v + EB.data.CLASSES[cls].bonus[i]);

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, ADMINS: '', HOST: '127.0.0.1', MOTD: 'Test realm' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d)); if (process.env.DBG) { srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d)); srv.stderr.on('data', (d) => process.stdout.write('[srv!] ' + d)); }
  for (let i = 0; i < 100 && !/listening/.test(log); i++) await sleep(100);
  await sleep(1500);
  const W = {}; for (const z of ['everblock', 'frostfang']) { W[z] = new EB.World(1999, null, z); W[z].generate(); }
  try {
    const a = new Bot('alice'), b = new Bot('bob');
    await a.open(); await b.open();
    check('server sends info on connect', (await a.wait((m) => m.t === 'info')).name === 'Everblock');
    a.send({ t: 'register', user: 'alice', pass: 'secret1' });
    const aa = await a.wait((m) => m.t === 'auth');
    check('register: first account is admin', aa.ok && aa.admin && aa.token, aa);
    b.send({ t: 'register', user: 'alice', pass: 'xxxxxx1' });
    check('duplicate username rejected', !(await b.wait((m) => m.t === 'auth')).ok);
    b.send({ t: 'register', user: 'bob', pass: 'secret2' });
    check('second account registered (not admin)', (await b.wait((m) => m.t === 'auth')).admin === false);
    b.send({ t: 'create', char: { name: 'Bobby', race: 'ogre', cls: 'wizard', stats: statsFor('ogre', 'warrior') } });
    check('race/class restriction enforced', /cannot/.test((await b.wait((m) => m.t === 'err')).err));
    b.send({ t: 'create', char: { name: 'Bobby', race: 'human', cls: 'cleric', stats: statsFor('human', 'cleric').map((v) => v + 10) } });
    check('stat point cheating rejected', /bonus|stats/i.test((await b.wait((m) => m.t === 'err')).err));
    a.send({ t: 'create', char: { name: 'alicia', race: 'human', cls: 'warrior', stats: statsFor('human', 'warrior') } });
    await a.wait((m) => m.t === 'created');
    const ac = await a.wait((m) => m.t === 'chars' && m.chars.length === 1);
    check('character created with capitalised name', ac.chars[0].name === 'Alicia', ac.chars[0]);
    b.send({ t: 'create', char: { name: 'Alicia', race: 'human', cls: 'cleric', stats: statsFor('human', 'cleric') } });
    check('character names are unique server-wide', /taken/.test((await b.wait((m) => m.t === 'err')).err));
    b.send({ t: 'create', char: { name: 'Bobby', race: 'human', cls: 'cleric', stats: statsFor('human', 'cleric') } });
    const bc = await b.wait((m) => m.t === 'chars' && m.chars.length === 1);

    a.send({ t: 'play', id: ac.chars[0].id }); b.send({ t: 'play', id: bc.chars[0].id });
    const wa = await a.wait((m) => m.t === 'welcome'), wb = await b.wait((m) => m.t === 'welcome');
    check('welcome: new character + server seed + edits for every zone', wa.newChar && wa.seed === 1999 && wa.edits.everblock && wa.edits.desert, { newChar: !!wa.newChar });
    await a.wait((m) => m.t === 'zonestate'); await b.wait((m) => m.t === 'zonestate');
    check('zone state lists the server\'s monsters', a.mobs.size > 20, a.mobs.size);
    const bind = W.everblock.bind;
    a.mv(bind.x, bind.y, bind.z); b.mv(bind.x + 1.5, bind.y, bind.z + 1);
    const pa = await a.wait((m) => m.t === 'pinfo' && m.name === 'Bobby');
    check('alice is told about bob (name, race, class)', pa.race === 'human' && pa.cls === 'cleric');
    const snap = await a.wait((m) => m.t === 's' && m.p && m.p.some((t) => t[0] === wb.pid));
    const bt = snap.p.find((t) => t[0] === wb.pid);
    check('alice sees bob\'s position in snapshots', Math.abs(bt[1] - (bind.x + 1.5)) < 0.1, bt.slice(0, 4));

    a.send({ t: 'chat', v: 'hello there' });
    const say = await b.wait((m) => m.t === 'chat' && m.c === 'say');
    check('/say reaches nearby players', say.from === 'Alicia' && say.m === 'hello there');
    b.send({ t: 'chat', v: '/ooc anyone want to group?' });
    check('/ooc is server-wide', (await a.wait((m) => m.t === 'chat' && m.c === 'ooc')).from === 'Bobby');
    b.send({ t: 'chat', v: '/tell alicia psst' });
    check('/tell is private', (await a.wait((m) => m.t === 'chat' && m.c === 'tell')).m === 'psst');
    a.send({ t: 'chat', v: '/who' });
    await a.wait((m) => m.t === 'chat' && /There are 2 players/.test(m.m));
    check('/who lists both players', true);

    a.send({ t: 'chat', v: '/invite Bobby' });
    await b.wait((m) => m.t === 'invite' && m.from === 'Alicia');
    b.send({ t: 'chat', v: '/join' });
    const ga = await a.wait((m) => m.t === 'group' && m.members.length === 2);
    check('grouping: invite + join forms a group of 2', ga.members.map((x) => x.name).sort().join() === 'Alicia,Bobby', ga);
    b.send({ t: 'chat', v: '/g ready' });
    check('/g group chat', (await a.wait((m) => m.t === 'chat' && m.c === 'group' && m.from === 'Bobby')).m === 'ready');

    // anti-cheat: teleport and absurd damage
    a.send({ t: 'mv', x: bind.x + 80, y: bind.y, z: bind.z + 80, yaw: 0, f: 0, a: 0, hp: 1, mhp: 1, m: [] });
    check('teleport hack is corrected by the server', !!(await a.wait((m) => m.t === 'pos')));
    a.pos = [bind.x, bind.y, bind.z];

    // find a level-1/2 rat or snake and kill it together
    const target = [...a.mobs.values()].filter((f) => /^(rat|snake)$/.test(f.type) && f.st !== 4).sort((p, q) => Math.hypot(p.x - bind.x, p.z - bind.z) - Math.hypot(q.x - bind.x, q.z - bind.z))[0];
    check('found a low-level monster to hunt', !!target, target && { type: target.type, lvl: target.lvl, hp: target.hp });
    await Promise.all([a.walkTo(target.x, target.z, W.everblock), b.walkTo(target.x + 1, target.z, W.everblock)]);
    const live = a.mobs.get(target.id);
    await a.walkTo(live.x, live.z, W.everblock); await b.walkTo(live.x + 0.5, live.z, W.everblock);
    const hp0 = a.mobs.get(target.id).hp;
    a.send({ t: 'dmg', id: target.id, d: 99999, s: 'p' });
    await sleep(400);
    check('absurd damage is ignored', a.mobs.get(target.id) && a.mobs.get(target.id).hp === hp0, a.mobs.get(target.id) && a.mobs.get(target.id).hp);
    let n = 0;
    while (a.mobs.get(target.id) && a.mobs.get(target.id).st !== 4 && n < 40) {
      const f = a.mobs.get(target.id); if (Math.hypot(f.x - a.pos[0], f.z - a.pos[2]) > 3) { await Promise.all([a.walkTo(f.x, f.z, W.everblock), b.walkTo(f.x + 0.4, f.z, W.everblock)]); }
      (n % 2 ? b : a).send({ t: 'dmg', id: target.id, d: 4, s: 'p' }); n++; await sleep(250);
    }
    const die = await b.wait((m) => m.t === 'die' && m.id === target.id);
    check('the monster dies on the server and both clients are told', !!die, die);
    const xa = await a.wait((m) => m.t === 'xp' && m.kill), xb = await b.wait((m) => m.t === 'xp' && m.kill);
    check('shared XP: both group members get party experience', xa.n > 0 && xb.n > 0 && xa.party && xb.party, { a: xa.n, b: xb.n });
    a.send({ t: 'loot', id: target.id });
    const lw = await a.wait((m) => m.t === 'lootwin');
    check('the killer\'s group can loot the corpse', !lw.err && Array.isArray(lw.items), lw);
    if (lw.items && lw.items.length) { a.send({ t: 'take', id: target.id, i: 0, item: lw.items[0].id }); const tk = await a.wait((m) => m.t === 'took'); check('taking a loot item works', tk.item && tk.item.id === lw.items[0].id, tk); }
    b.send({ t: 'take', id: target.id, i: 0, item: 'rusty_short_sword' });
    await sleep(300);
    check('cannot take items from a corpse you are not looting', !b.msgs.some((m) => m.t === 'took' && m.item));
    a.send({ t: 'lootdone', id: target.id });

    // block edit replicated
    const bx = Math.floor(a.pos[0]) + 2, bz = Math.floor(a.pos[2]), by = W.everblock.surfaceY(bx, bz);
    a.send({ t: 'blk', x: bx, y: by, z: bz, b: EB.data.BUILDABLE[0] });
    const be = await b.wait((m) => m.t === 'blk');
    check('block edits are shared with other players', be.x === bx && be.z === bz && be.b === EB.data.BUILDABLE[0]);

    // save + zone change
    a.send({ t: 'save', now: true, data: { char: { coins: 777, inv: [{ id: 'bread', count: 5 }], equip: { primary: { id: 'rusty_short_sword' } }, hp: 50, mana: 0, spells: [], faction: {} }, quests: { rat_problem: 'active' } } });
    await sleep(300);
    const zl = W.everblock.zoneLines.find((l) => l.to === 'frostfang');
    await a.walkTo((zl.x0 + zl.x1) / 2, zl.at, W.everblock);
    a.send({ t: 'zone', to: 'desert', via: 'line' });
    check('zoning to a zone with no line here is refused', (await a.wait((m) => m.t === 'zoned')).ok === false);
    a.send({ t: 'zone', to: 'frostfang', via: 'line' });
    const zd = await a.wait((m) => m.t === 'zoned');
    const zs = await a.wait((m) => m.t === 'zonestate');
    check('zone line: alice moves to the Frostfang Highlands', zd.ok && zs.zone === 'frostfang' && zs.sp.length > 5, { ok: zd.ok, zone: zs.zone });
    check('bob is told alice left his zone', !!(await b.wait((m) => m.t === 'pgone' && m.pid === wa.pid)));
    a.mv(zd.x, zd.y, zd.z);
    await sleep(300);

    // disconnect + reconnect
    const xpBefore = xa.xp, lvlBefore = xa.lvl;
    a.ws.close(); await sleep(600);
    check('bob sees alice leave the group on disconnect', b.msgs.some((m) => m.t === 'group' && m.id === 0));
    const a2 = new Bot('alice2'); await a2.open();
    a2.send({ t: 'resume', token: aa.token });
    check('session token resumes the login', (await a2.wait((m) => m.t === 'auth')).ok);
    const cl = await a2.wait((m) => m.t === 'chars');
    a2.send({ t: 'play', id: cl.chars[0].id });
    const w2 = await a2.wait((m) => m.t === 'welcome');
    const sv = w2.save;
    check('reconnect: zone, coins, items and level/XP persisted', sv && sv.zone === 'frostfang' && sv.char.coins === 777 && sv.char.inv[0].id === 'bread' && sv.char.equip.primary.id === 'rusty_short_sword' && sv.char.xp === xpBefore && sv.char.level === lvlBefore && sv.quests.rat_problem === 'active',
      sv && { zone: sv.zone, coins: sv.char.coins, xp: sv.char.xp, lvl: sv.char.level, xpBefore, lvlBefore, inv: sv.char.inv, eq: sv.char.equip, q: sv.quests });
    check('reconnect: position restored at the zone-in point', sv && Math.hypot(sv.char.pos[0] - zd.x, sv.char.pos[2] - zd.z) < 1.5, sv && sv.char.pos);

    // admin
    a2.send({ t: 'chat', v: '/announce Server restart in 5 minutes' });
    check('admin /announce reaches everyone', (await b.wait((m) => m.t === 'chat' && m.c === 'announce' && /restart/.test(m.m))).m);
    b.send({ t: 'chat', v: '/kick Alicia' });
    check('non-admins cannot /kick', /permission/.test((await b.wait((m) => m.t === 'chat' && /permission/.test(m.m))).m));
    a2.send({ t: 'chat', v: '/kick Bobby' });
    check('admin /kick disconnects the player', (await b.wait((m) => m.t === 'kicked')).reason);
    a2.ws.close();
  } catch (e) { console.error(e); check('no exceptions', false, e.message); }
  await sleep(300);
  srv.kill('SIGTERM'); await sleep(500);
  const errs = log.split('\n').filter((l) => /Error|\[msg\]|\[zone\].*Error/.test(l));
  check('server log has no errors', !errs.length, errs.slice(0, 5));
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} passed`);
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(fail.length ? 1 : 0);
})();
