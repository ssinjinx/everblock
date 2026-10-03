// Rough load test: N bot players (default 60) log in, a third walk to the Frostfang Highlands, all wander and
// fight monsters for DURATION seconds while the server's CPU and memory are sampled.
//   N=60 DURATION=60 node test/load.js
'use strict';
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const WebSocket = require('ws');
const { EB } = require('../lib/shared');
const N = +process.env.N || 60, DURATION = +process.env.DURATION || 60;
const PORT = 18800 + Math.floor(Math.random() * 100);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-load-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = {}; for (const z of ['everblock', 'frostfang']) { W[z] = new EB.World(1999, null, z); W[z].generate(); }
class Bot {
  constructor(i) { this.i = i; this.mobs = new Map(); this.zone = 'everblock'; this.pos = null; this.msgs = 0; this.bytes = 0; }
  open() { return new Promise((res, rej) => { this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { 'x-forwarded-for': `10.0.${this.i >> 8}.${this.i & 255}` } }); this.ws.on('open', res); this.ws.on('error', rej); this.ws.on('message', (d) => { this.msgs++; this.bytes += d.length; this.on(JSON.parse(d)); }); }); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  on(m) {
    if (m.t === 'auth' && m.ok) this.send({ t: 'create', char: { name: 'Bot' + String.fromCharCode(97 + (this.i % 26)) + String.fromCharCode(97 + Math.floor(this.i / 26)) + 'x', race: 'human', cls: 'warrior', stats: EB.data.RACES.human.stats.map((v, k) => v + EB.data.CLASSES.warrior.bonus[k]) } });
    if (m.t === 'chars' && m.chars.length && !this.playing) { this.playing = true; this.send({ t: 'play', id: m.chars[0].id }); }
    if (m.t === 'err') console.log('bot', this.i, m.err);
    if (m.t === 'welcome') { const p = m.save && m.save.char && m.save.char.pos; const bd = W.everblock.bind; this.pos = p ? [p[0], p[1], p[2]] : [bd.x, bd.y, bd.z]; this.zone = (m.save && m.save.zone) || 'everblock'; }
    if (m.t === 'zonestate') { this.zone = m.zone; this.mobs = new Map(m.sp.map((f) => [f.id, f])); }
    if (m.t === 's') { for (const f of m.sp || []) this.mobs.set(f.id, f); for (const t of m.m || []) { const f = this.mobs.get(t[0]); if (f) { f.x = t[1]; f.z = t[3]; f.hp = t[5]; f.st = t[6]; } } }
    if (m.t === 'gone') this.mobs.delete(m.id);
    if (m.t === 'pos' || (m.t === 'zoned' && m.ok)) this.pos = [m.x, m.y, m.z];
  }
  step(dt) {
    if (!this.pos) return;
    const w = W[this.zone]; let [x, y, z] = this.pos;
    if (!this.goal || Math.hypot(this.goal[0] - x, this.goal[1] - z) < 1) {
      if (this.i % 3 === 0 && this.zone === 'everblock') this.goal = [128.5, 0.5];
      else { const f = [...this.mobs.values()].filter((q) => q.st !== 4 && q.lvl <= 6 && Math.hypot(q.x - x, q.z - z) < 50)[this.i % 5]; this.goal = f ? [f.x, f.z, f.id] : [U(30, 220), U(30, 220)]; }
    }
    const dx = this.goal[0] - x, dz = this.goal[1] - z, d = Math.hypot(dx, dz), s = Math.min(d, 8 * dt);
    x += (dx / d) * s || 0; z += (dz / d) * s || 0; y = Math.min(w.surfaceY(x, z), y + 1);
    this.pos = [x, y, z];
    this.send({ t: 'mv', x, y, z, yaw: 0, f: 0, a: 0, hp: 200, mhp: 200, mn: 0, mmn: 0, m: [] });
    if (this.zone === 'everblock' && z < 2 && this.i % 3 === 0 && !this.zoning) { this.zoning = true; this.send({ t: 'zone', to: 'frostfang', via: 'line' }); this.goal = null; }
    if (this.goal && this.goal[2] && d < 3 && Math.random() < 0.3) this.send({ t: 'dmg', id: this.goal[2], d: 6, s: 'p' });
    if (Math.random() < 0.002) this.send({ t: 'chat', v: 'hello from bot ' + this.i });
  }
}
const U = (a, b) => a + Math.random() * (b - a);
(async () => {
  const srv = spawn(process.execPath, [...(process.env.PROF ? ['--cpu-prof', '--cpu-prof-dir=' + process.env.PROF] : []), path.join(__dirname, '..', 'index.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, TRUST_PROXY: '1', MAX_PLAYERS: String(N + 10) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100 && !/listening/.test(log); i++) await sleep(100);
  await sleep(1500);
  const bots = [];
  for (let i = 0; i < N; i++) { const b = new Bot(i); await b.open(); b.send({ t: 'register', user: 'loadbot' + i, pass: 'password' + i }); bots.push(b); await sleep(60); }
  await sleep(4000);
  console.log(`${bots.filter((b) => b.pos).length}/${N} bots in the world`);
  const tick = () => { const st = fs.readFileSync(`/proc/${srv.pid}/stat`, 'utf8').split(') ')[1].split(' '); return +st[11] + +st[12]; };
  const rss = () => +(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${srv.pid}/status`, 'utf8'))[1]) / 1024;
  const CLK = 100; let c0 = tick(), t0 = Date.now(), samples = [];
  const loop = setInterval(() => { for (const b of bots) b.step(0.1); }, 100);
  for (let s = 0; s < DURATION; s += 5) {
    await sleep(5000);
    const c1 = tick(), t1 = Date.now(); const cpu = ((c1 - c0) / CLK) / ((t1 - t0) / 1000) * 100; c0 = c1; t0 = t1;
    const zones = {}; for (const b of bots) zones[b.zone] = (zones[b.zone] || 0) + 1;
    samples.push({ cpu, rss: rss() });
    console.log(`t=${s + 5}s cpu=${cpu.toFixed(1)}% of one core  rss=${rss().toFixed(0)} MB  zones=${JSON.stringify(zones)}`);
  }
  clearInterval(loop);
  const avg = (k) => samples.reduce((a, x) => a + x[k], 0) / samples.length;
  const kb = bots.reduce((a, b) => a + b.bytes, 0) / bots.length / DURATION / 1024;
  console.log(`\nSUMMARY ${N} players: avg cpu ${avg('cpu').toFixed(1)}% of one core, peak rss ${Math.max(...samples.map((x) => x.rss)).toFixed(0)} MB, ~${kb.toFixed(1)} KB/s downstream per player`);
  console.log('server warnings:', log.split('\n').filter((l) => /perf|Error/.test(l)).slice(0, 5));
  for (const b of bots) b.ws.close();
  srv.kill('SIGTERM'); await sleep(500); process.exit(0);
})();
