// Everblock v7 server test: town portals to the shared Bizarre Bazaar (validated zoning, no monsters, no building),
// players seeing each other in the Bazaar, portals back out, and bank (vault) persistence across reconnects.   Run: npm test
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const { EB } = require('../lib/shared');

const PORT = 19000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-v7-'));
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Bot {
  constructor(name) { this.name = name; this.msgs = []; this.waiters = []; this.mobs = new Map(); }
  open() { return new Promise((res, rej) => { this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); this.ws.on('open', res); this.ws.on('error', rej); this.ws.on('message', (d) => { const m = JSON.parse(d); this.msgs.push(m); this.onMsg(m); }); }); }
  onMsg(m) {
    if (m.t === 'welcome') this.pid = m.pid;
    if (m.t === 'zonestate') { this.zone = m.zone; this.mobs = new Map(m.sp.map((f) => [f.id, f])); }
    if (m.t === 'pos') this.pos = [m.x, m.y, m.z];
    if (m.t === 'zoned' && m.ok) this.pos = [m.x, m.y, m.z];
    for (const w of this.waiters.slice()) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 8000, label) {
    const hit = this.msgs.find((m) => pred(m) && !m._used); if (hit) { hit._used = true; return Promise.resolve(hit); }
    return new Promise((res, rej) => { const w = { pred, res: (m) => { m._used = true; clearTimeout(w.t); res(m); } }; w.t = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); rej(new Error(`${this.name}: timeout waiting for ${label || pred}`)); }, ms); this.waiters.push(w); });
  }
  mv(x, y, z) { this.pos = [x, y, z]; this.send({ t: 'mv', x, y, z, yaw: 0, f: 0, a: 0, hp: 100, mhp: 100, mn: 0, mmn: 0, m: [] }); }
  async walkTo(x, z, w) {
    for (;;) {
      const [px, , pz] = this.pos, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
      if (d < 0.4) break;
      const s = Math.min(0.9, d), nx = px + (dx / d) * s, nz = pz + (dz / d) * s;
      this.mv(nx, Math.min(w.surfaceY(nx, nz), this.pos[1] + 1), nz); await sleep(100);
    }
  }
  async path(pts, w) { for (const [x, z] of pts) await this.walkTo(x, z, w); }
}
const statsFor = (race, cls) => EB.data.RACES[race].stats.map((v, i) => v + EB.data.CLASSES[cls].bonus[i]);

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, ADMINS: '', HOST: '127.0.0.1' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100 && !/listening/.test(log); i++) await sleep(100);
  await sleep(1200);
  const W = {}; for (const z of ['everblock', 'bazaar', 'frostfang']) { W[z] = new EB.World(1999, null, z); W[z].generate(); }
  try {
    const mk = async (name, user, cls) => {
      const b = new Bot(name); await b.open();
      b.send({ t: 'register', user, pass: 'secret1' }); await b.wait((m) => m.t === 'auth' && m.ok);
      b.send({ t: 'create', char: { name, race: 'human', cls, stats: statsFor('human', cls) } });
      const cl = await b.wait((m) => m.t === 'chars' && m.chars.length === 1);
      b.send({ t: 'play', id: cl.chars[0].id }); b.welcome = await b.wait((m) => m.t === 'welcome'); await b.wait((m) => m.t === 'zonestate');
      const bd = W.everblock.bind; b.mv(bd.x, bd.y, bd.z); b.token = null; b.charId = cl.chars[0].id;
      return b;
    };
    const a = await mk('Portia', 'portia', 'warrior'), b = await mk('Bazzy', 'bazzy', 'cleric');
    const P = W.everblock.zoneLines.find((l) => l.portal && l.to === 'bazaar');
    check('Everblock Keep has a portal to the Bizarre Bazaar', !!P, P && { x0: P.x0, x1: P.x1, at: P.at });
    a.send({ t: 'zone', to: 'bazaar', via: 'line' });
    check('zoning to the Bazaar from far away is refused', (await a.wait((m) => m.t === 'zoned')).ok === false);
    const route = [[128.5, 136.2], [144.5, 136.2], [144.5, P.at + 0.6]];
    await Promise.all([a.path(route, W.everblock), b.path(route.map(([x, z]) => [x - 0.6, z]), W.everblock)]);
    a.send({ t: 'zone', to: 'bazaar', via: 'line' }); b.send({ t: 'zone', to: 'bazaar', via: 'line' });
    const za = await a.wait((m) => m.t === 'zoned'), zb = await b.wait((m) => m.t === 'zoned');
    const sa = await a.wait((m) => m.t === 'zonestate' && m.zone === 'bazaar');
    check('portal: both players arrive in the Bazaar at the Everblock return portal', za.ok && zb.ok && Math.hypot(za.x - P.arrive.x, za.z - P.arrive.z) < 0.6, { za, arrive: P.arrive });
    check('the Bazaar is a safe zone: the server spawns no monsters there', sa.sp.length === 0, sa.sp.length);
    a.mv(za.x, za.y, za.z); b.mv(za.x + 1.2, za.y, za.z + 0.8);
    const pi = await a.wait((m) => m.t === 'pinfo' && m.name === 'Bazzy', 8000, 'pinfo Bazzy');
    check('players see each other in the shared Bazaar', !!pi);
    const snap = await a.wait((m) => m.t === 's' && m.p && m.p.some((t) => t[0] === b.pid), 8000, 'snapshot');
    check('Bazaar snapshots carry the other player\'s position', !!snap);
    a.send({ t: 'chat', v: 'nice market' });
    check('/say works in the Bazaar', (await b.wait((m) => m.t === 'chat' && m.c === 'say')).m === 'nice market');
    const bx = Math.floor(za.x) + 2, bz = Math.floor(za.z) + 2;
    a.send({ t: 'blk', x: bx, y: W.bazaar.surfaceY(bx, bz), z: bz, b: EB.data.BUILDABLE[0] });
    check('building is refused in the Bazaar', /forbids/.test((await a.wait((m) => m.t === 'chat' && /forbids/.test(m.m))).m));
    const npcs = W.bazaar.npcs;
    check('Bazaar has a trainer for every class, vendors, a banker, a binder and a merc agent',
      Object.keys(EB.data.CLASSES).every((c) => npcs.some((n) => n.kind === 'trainer' && n.cls === c)) && npcs.filter((n) => n.kind === 'merchant').length >= 4 && npcs.some((n) => n.kind === 'banker') && npcs.some((n) => n.kind === 'binder') && npcs.some((n) => n.kind === 'liaison'));

    // vault persistence
    a.send({ t: 'save', now: true, data: { char: { coins: 123, inv: [], bank: [{ id: 'grand_potion', count: 7 }, null, { id: 'expert_blade' }, { id: 'not_an_item' }], bankCoins: 4567, equip: {}, hp: 50, mana: 0, spells: [], faction: {} } } });
    await sleep(400);
    // a portal back out: the Frostfang return portal
    const F = W.bazaar.zoneLines.find((l) => l.portal && l.to === 'frostfang');
    await a.path([[za.x, za.z + 1], [(F.x0 + F.x1) / 2, za.z + 1], [(F.x0 + F.x1) / 2, F.at + 0.7]], W.bazaar);
    a.send({ t: 'zone', to: 'frostfang', via: 'line' });
    const zf = await a.wait((m) => m.t === 'zoned');
    check('Bazaar return portal: arrive at Hollis Outpost in the Frostfang Highlands', zf.ok && zf.zone === 'frostfang' && Math.hypot(zf.x - F.arrive.x, zf.z - F.arrive.z) < 0.6, zf);
    check('the outpost has its own portal back to the Bazaar', W.frostfang.zoneLines.some((l) => l.portal && l.to === 'bazaar'));
    a.mv(zf.x, zf.y, zf.z); await sleep(300);
    a.ws.close(); await sleep(600);
    const a2 = new Bot('portia2'); await a2.open();
    a2.send({ t: 'login', user: 'portia', pass: 'secret1' }); await a2.wait((m) => m.t === 'auth' && m.ok);
    const cl = await a2.wait((m) => m.t === 'chars'); a2.send({ t: 'play', id: cl.chars[0].id });
    const sv = (await a2.wait((m) => m.t === 'welcome')).save;
    const bank = sv && sv.char.bank;
    check('vault persists on the server across reconnects (items + coin, junk dropped)', bank && bank.length === 48 && bank[0].id === 'grand_potion' && bank[0].count === 7 && bank[2].id === 'expert_blade' && bank[3] === null && sv.char.bankCoins === 4567,
      bank && { b0: bank[0], b2: bank[2], b3: bank[3], coins: sv.char.bankCoins });
    a2.ws.close(); b.ws.close();
  } catch (e) { console.error(e); check('no exceptions', false, e.message); }
  await sleep(300);
  srv.kill('SIGTERM'); await sleep(500);
  const errs = log.split('\n').filter((l) => /Error|\[msg\]/.test(l));
  check('server log has no errors', !errs.length, errs.slice(0, 5));
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} passed`);
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(fail.length ? 1 : 0);
})();
