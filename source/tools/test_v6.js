// Everblock v6 multiplayer browser test: starts a throwaway Everblock server and plays it with three real
// browsers (two desktop, one phone with touch) - Play Online, register, create a character, enter the world,
// see each other, chat, group via the invite toast, kill a monster together (shared XP), loot, zone change,
// lose the connection and reconnect (persistence), and Phone Mode online.   Run: node tools/test_v6.js
const { chromium, devices } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '../..');
const SHOTS = process.env.SHOTS || ROOT + '/screenshots/';
const PORT = 19000 + Math.floor(Math.random() * 800);
const EXT = process.env.SERVER_URL; // test an already running server instead (needs ADMINS=ann and SERVER_NAME=Test Realm)
const URL = EXT || `http://127.0.0.1:${PORT}/`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-v6-'));
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s) => console.log('==', s);

(async () => {
  const srv = EXT ? { kill() {}, stdout: { on() {} }, stderr: { on() {} } } : spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, ADMINS: 'ann', SERVER_NAME: 'Test Realm', MOTD: 'Welcome to the v6 test realm!' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 150 && !EXT && !/listening/.test(log); i++) await sleep(100);
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const mkPage = async (label, opts) => {
    const ctx = await browser.newContext(opts || { viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
    page.on('dialog', (x) => x.accept());
    page.label = label; page.ctx = ctx;
    return page;
  };
  const hidePrompt = (page) => page.evaluate(() => { const e = document.getElementById('clickToPlay'); if (e) e.style.visibility = 'hidden'; });
  const shot = async (page, name) => { await hidePrompt(page); await page.screenshot({ path: SHOTS + name }); console.log('   shot', name); };
  const inWorld = (page) => page.waitForFunction(() => window.EB && EB.game && EB.game.player && EB.net.ready && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 90000 });
  const say = async (page, text) => { // through the real chat box
    await page.evaluate(() => { const i = document.getElementById('chatInput'); i.classList.remove('hidden'); i.focus(); });
    await page.fill('#chatInput', text); await page.press('#chatInput', 'Enter'); await page.waitForTimeout(150);
  };
  const chatHas = (page, re) => page.evaluate((s) => new RegExp(s).test(document.getElementById('chatLog').textContent), re.source);
  const waitChat = async (page, re, ms = 8000) => { for (let t = 0; t < ms; t += 200) { if (await chatHas(page, re)) return true; await sleep(200); } return false; };
  const walkTo = async (page, x, z) => { // step like a walking player (the server rejects teleports)
    for (let i = 0; i < 200; i++) {
      const d = await page.evaluate(([x, z]) => { const g = EB.game, p = g.player, dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz); if (d < 0.3) return d; const s = Math.min(0.7, d); p.pos.x += (dx / d) * s; p.pos.z += (dz / d) * s; p.pos.y = g.world.surfaceY(p.pos.x, p.pos.z); return d; }, [x, z]);
      if (d < 0.3) break; await sleep(100);
    }
  };
  const join = async (page, user, race, cls, name, touch) => {
    const tap = (sel) => (touch ? page.locator(sel).first().tap() : page.locator(sel).first().click());
    await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
    await tap('#btnOnline');
    await page.waitForFunction(() => /Test Realm/.test(document.getElementById('olServerInfo').textContent), null, { timeout: 10000 }).catch(async (e) => { console.log('debug', await page.evaluate(() => ({ st: document.getElementById('olStatus').textContent, err: document.getElementById('olErr').textContent, srv: document.getElementById('olServer').value, menu: !document.getElementById('menuOnline').classList.contains('hidden'), ws: EB.net.ws && EB.net.ws.readyState }))); throw e; });
    await page.fill('#olUser', user); await page.fill('#olPass', 'hunter22-' + user);
    await tap('#olBtnRegister');
    await page.waitForFunction(() => !document.getElementById('olChars').classList.contains('hidden'), null, { timeout: 10000 }).catch(async (e) => { console.log('debug', await page.evaluate(() => ({ st: document.getElementById('olStatus').textContent, err: document.getElementById('olErr').textContent, menu: !document.getElementById('menuOnline').classList.contains('hidden'), login: !document.getElementById('olLogin').classList.contains('hidden'), ws: EB.net.ws && EB.net.ws.readyState, authed: EB.net.authed }))); throw e; });
    await tap('#olBtnNew');
    await page.waitForTimeout(300);
    await tap(`#raceList button:has-text("${race}")`); await tap(`#classList button:has-text("${cls}")`);
    await page.fill('#nameInput', name);
    await tap('#btnCreate');
    await page.waitForFunction(() => document.querySelector('#olCharList .olPlay'), null, { timeout: 10000 });
    await tap('#olCharList .olPlay');
    await inWorld(page); await page.waitForTimeout(1500);
  };

  try {
    step('server is up and serves the game');
    const info = await (await fetch(URL + 'api/info')).json();
    check('server answers /api/info', info.name === 'Test Realm', info);
    const html = await (await fetch(URL)).text();
    check('server serves the built game page', html === fs.readFileSync(ROOT + '/index.html', 'utf8'));

    const A = await mkPage('Ann'), B = await mkPage('Bo');
    step('start screen + Play Online panel');
    await A.goto(URL); await A.evaluate(() => localStorage.clear()); await A.reload(); await A.waitForTimeout(1000);
    const hint = await A.evaluate(() => ({ hint: document.getElementById('onlineHint').textContent, vis: !document.getElementById('onlineHint').classList.contains('hidden'), solo: !!document.getElementById('btnNew') }));
    check('start screen offers Play Online (server detected) next to Play Solo', hint.vis && /Test Realm/.test(hint.hint) && hint.solo, hint);
    await A.click('#btnOnline');
    await A.waitForFunction(() => /Test Realm/.test(document.getElementById('olServerInfo').textContent), null, { timeout: 10000 });
    check('server address defaults to the page origin', (await A.inputValue('#olServer')) === URL.replace(/\/$/, ''), await A.inputValue('#olServer'));
    await A.fill('#olUser', 'ann'); await A.fill('#olPass', 'hunter22-ann');
    await shot(A, 'v6-online-login.png');

    step('register, create and enter (two desktop players)');
    await join(A, 'ann', 'Human', 'Warrior', 'Annika');
    await join(B, 'bob', 'Human', 'Cleric', 'Borin');
    const st = await A.evaluate(() => ({ online: EB.net.active, zone: EB.game.world.zoneId, mobs: EB.game.mobs.length, admin: EB.net.admin }));
    check('Annika is in the world online, with the server\'s monsters', st.online && st.zone === 'everblock' && st.mobs > 20, st);
    await A.waitForFunction(() => [...EB.net.remotes.values()].some((r) => r.name === 'Borin' && r.placed), null, { timeout: 10000 });
    await B.waitForFunction(() => [...EB.net.remotes.values()].some((r) => r.name === 'Annika' && r.placed), null, { timeout: 10000 });
    check('both players see each other', true);

    step('walk and watch the other player move');
    const bp0 = await A.evaluate(() => [...EB.net.remotes.values()][0].pos.toArray());
    await B.evaluate(() => { EB.game.player.yaw = Math.PI; });
    await B.keyboard.down('KeyW'); await B.waitForTimeout(1200); await B.keyboard.up('KeyW'); await B.waitForTimeout(800);
    const bp1 = await A.evaluate(() => [...EB.net.remotes.values()][0].pos.toArray());
    check('Borin\'s movement is seen by Annika', Math.hypot(bp1[0] - bp0[0], bp1[2] - bp0[2]) > 1, { bp0, bp1 });

    step('chat');
    await say(A, 'Hail, Borin! Want to hunt?');
    check('/say (plain chat) reaches the nearby player', await waitChat(B, /Annika says, 'Hail, Borin! Want to hunt\?'/));
    await say(B, '/ooc Sure, lead the way.');
    check('/ooc reaches everyone', await waitChat(A, /Borin.*Sure, lead the way/));
    await say(B, '/tell annika meet me by the fountain');
    check('/tell is delivered', await waitChat(A, /Borin tells you, 'meet me by the fountain'/));
    await say(A, '/who');
    check('/who lists both players', await waitChat(A, /Borin/) && (await waitChat(A, /2 players/i)));

    step('pose for the "two players" screenshot');
    await Promise.all([walkTo(B, 129.5, 141), walkTo(A, 128.5, 145.5)]);
    await B.evaluate(() => { EB.game.player.yaw = Math.PI; });
    await A.evaluate(() => { const g = EB.game, p = g.player; p.yaw = Math.PI * 1.04; p.pitch = -0.1; g.camDist = 5; g.dayT = 0.38; g.net.sendMove(true); });
    await A.waitForTimeout(2500);
    const near = await A.evaluate(() => { const r = [...EB.net.remotes.values()][0]; return r.pos.distanceTo(EB.game.player.pos); });
    check('the other player stands where he walked to', near < 8, near);
    await shot(A, 'v6-two-players.png');

    step('group: target + /invite, accept from the toast');
    await A.evaluate(() => { const g = EB.game; g.setTarget([...EB.net.remotes.values()][0]); });
    const tw = await A.evaluate(() => document.getElementById('targetWin') && document.getElementById('targetWin').textContent);
    check('players can be targeted (target window shows the name)', /Borin/.test(tw || ''), tw);
    await say(A, '/invite');
    await B.waitForFunction(() => { const t = document.getElementById('netToast'); return t && !t.classList.contains('hidden') && /Annika/.test(t.textContent); }, null, { timeout: 8000 });
    await B.click('#netToast button:has-text("Join")');
    await A.waitForFunction(() => EB.net.group && EB.net.group.members.length === 2, null, { timeout: 8000 });
    await B.waitForTimeout(300);
    const grp = await B.evaluate(() => ({ n: EB.game.groupMembers().length, rows: document.getElementById('groupWin') ? document.getElementById('groupWin').textContent : '' }));
    check('grouped: both see a group of two (group window lists Annika)', grp.n >= 2 && /Annika/.test(grp.rows), grp);
    await say(B, '/g ready when you are');
    check('/g group chat', await waitChat(A, /ready when you are/));

    step('hunt together');
    const rat = await A.evaluate(() => { const g = EB.game, p = g.player; const r = g.mobs.filter((m) => m.alive && (m.type === 'rat' || m.type === 'snake') && m.level <= 2).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0]; return r && { id: r.id, x: r.pos.x, z: r.pos.z, name: r.name, lvl: r.level }; });
    check('a low-level monster is nearby', !!rat, rat);
    await say(A, `/tp ${(rat.x - 1.5).toFixed(1)} ${rat.z.toFixed(1)}`);
    await A.waitForTimeout(600);
    await say(A, '/summon Borin');
    await B.waitForTimeout(800);
    const xp0 = { a: await A.evaluate(() => EB.game.player.xp), b: await B.evaluate(() => EB.game.player.xp) };
    const fight = (page) => page.evaluate((id) => { const g = EB.game, p = g.player, t = g.mobs.find((m) => m.id === id);
      if (!t || !t.alive) return { alive: false };
      if (g.target !== t) g.setTarget(t);
      const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
      if (d > 2.2) { const s = Math.min(1.0, d - 1.8); p.pos.x += ((t.pos.x - p.pos.x) / d) * s; p.pos.z += ((t.pos.z - p.pos.z) / d) * s; p.pos.y = g.world.surfaceY(p.pos.x, p.pos.z); }
      p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z); p.pitch = -0.15;
      if (p.hp < p.maxHp * 0.4) p.hp = p.maxHp; // harness safety net
      if (!p.autoAttack) g.toggleAuto(true);
      return { alive: true, hp: t.hp, max: t.maxHp }; }, rat.id);
    let shotTaken = false, dead = false;
    for (let i = 0; i < 160 && !dead; i++) {
      const [sa] = await Promise.all([fight(A), fight(B)]);
      if (!sa.alive) dead = true;
      if (!shotTaken && sa.alive && (i >= 7 || sa.hp < sa.max * 0.5)) { await A.evaluate(() => { EB.game.camDist = 6; EB.game.player.yaw += 0.5; }); await A.waitForTimeout(250); await shot(A, 'v6-group-fight.png'); shotTaken = true; }
      await sleep(250);
    }
    if (!shotTaken) await shot(A, 'v6-group-fight.png');
    check('the monster dies (server-side kill, seen by both)', dead && !(await B.evaluate((id) => { const m = EB.game.mobs.find((x) => x.id === id); return m && m.alive; }, rat.id)));
    await A.waitForTimeout(1200);
    const xp1 = { a: await A.evaluate(() => EB.game.player.xp), b: await B.evaluate(() => EB.game.player.xp) };
    check('shared XP: both group members gained experience', xp1.a > xp0.a && xp1.b > xp0.b, { xp0, xp1 });
    check('group XP message shown', await waitChat(B, /party experience|experience/i));

    step('loot the corpse');
    const coins0 = await A.evaluate(() => EB.game.player.coins);
    await A.evaluate((id) => { const g = EB.game; const c = g.corpses ? g.corpses.find((k) => k.id === id || (k.mob && k.mob.id === id)) : null; const m = g.mobs.find((x) => x.id === id); g.setTarget(c || m || null); }, rat.id);
    await A.keyboard.press('KeyE');
    await A.waitForFunction(() => !document.getElementById('lootWin').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
    const lootOpen = await A.evaluate(() => !document.getElementById('lootWin').classList.contains('hidden'));
    if (lootOpen) { await A.click('#btnLootAll'); await A.waitForTimeout(1200); }
    const coins1 = await A.evaluate(() => EB.game.player.coins), items = await A.evaluate(() => EB.game.player.inv.filter(Boolean).length);
    check('the server corpse is looted (coins, plus the loot window when it holds items)', (lootOpen || await waitChat(A, /You find nothing else/)) && (coins1 > coins0 || lootOpen), { lootOpen, coins0, coins1, items });
    check('a second loot of the same corpse is refused', await (async () => { await A.evaluate((id) => EB.net.send({ t: 'loot', id }), rat.id); return waitChat(A, /already been looted|cannot loot|not yours|nothing/i, 3000); })());
    await A.keyboard.press('Escape');

    step('disconnect + reconnect (persistence)');
    await B.evaluate(() => EB.game.save());
    await B.waitForTimeout(500);
    const before = await B.evaluate(() => ({ xp: EB.game.player.xp, lvl: EB.game.player.level, coins: EB.game.player.coins }));
    await B.evaluate(() => EB.net.ws.close());
    await B.waitForFunction(() => !document.getElementById('netDown').classList.contains('hidden'), null, { timeout: 8000 });
    check('lost connection shows the reconnect overlay', true);
    await A.waitForFunction(() => !EB.net.group, null, { timeout: 8000 }).catch(() => {});
    check('the group drops the disconnected player', await A.evaluate(() => !EB.net.group));
    await B.click('#netDown button');
    await inWorld(B); await B.waitForTimeout(1500);
    const after = await B.evaluate(() => ({ xp: EB.game.player.xp, lvl: EB.game.player.level, coins: EB.game.player.coins, online: EB.net.active }));
    check('reconnect re-enters the same character with XP/level/coins kept', after.online && after.xp === before.xp && after.lvl === before.lvl && after.coins === before.coins, { before, after });

    step('phone mode online (touch device)');
    const C = await mkPage('Cara (phone)', { ...devices['iPhone 13'], deviceScaleFactor: 2 });
    await join(C, 'cara', 'Human', 'Warrior', 'Cara', true);
    const ph = await C.evaluate(() => ({ phone: EB.phone.on, body: document.body.classList.contains('phone'), online: EB.net.active, remotes: [...EB.net.remotes.values()].map((r) => r.name) }));
    check('phone mode is on and playing online, seeing the other players', ph.phone && ph.body && ph.online && ph.remotes.includes('Annika') && ph.remotes.includes('Borin'), ph);
    await say(A, '/summon Cara'); await C.waitForTimeout(1500);
    await C.evaluate(() => { const g = EB.game, p = g.player, r = [...EB.net.remotes.values()].find((x) => x.name === 'Annika'); if (r) { p.yaw = Math.atan2(r.pos.x - p.pos.x, r.pos.z - p.pos.z) + 0.4; } p.pitch = -0.1; g.camDist = 6; });
    await C.waitForTimeout(1500);
    await shot(C, 'v6-phone-online.png');
    const box = await C.evaluate(() => { const j = document.getElementById('joyBase') || document.querySelector('.joy, #joystick'); if (!j) return null; const r = j.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    if (box) {
      const p0 = await C.evaluate(() => EB.game.player.pos.toArray());
      const cdp = await C.ctx.newCDPSession(C);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i, radiusX: 4, radiusY: 4, force: 1 })) });
      await touch('touchStart', [box]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[box[0], box[1] - i * 8]]); await C.waitForTimeout(16); } await C.waitForTimeout(1200); await touch('touchEnd', []);
      await C.waitForTimeout(800);
      const p1 = await C.evaluate(() => EB.game.player.pos.toArray());
      const seen = await A.evaluate(() => { const r = [...EB.net.remotes.values()].find((x) => x.name === 'Cara'); return r && r.pos.toArray(); });
      check('joystick moves the phone player and the others see it', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1 && seen && Math.hypot(seen[0] - p1[0], seen[2] - p1[2]) < 3, { p0, p1, seen });
    }

    step('zone change through the zone line');
    await say(A, '/tp 128.5 8');
    await A.waitForTimeout(800);
    for (let i = 0; i < 40; i++) {
      const z = await A.evaluate(() => { const g = EB.game, p = g.player; if (g.world.zoneId !== 'everblock') return g.world.zoneId; p.yaw = 0; p.pos.z -= 0.8; p.pos.x = 128.5; p.pos.y = g.world.surfaceY(p.pos.x, p.pos.z); return g.world.zoneId; });
      if (z !== 'everblock') break; await sleep(120);
    }
    await A.waitForFunction(() => EB.game.world.zoneId === 'frostfang' && !EB.net.awaitingZone, null, { timeout: 30000 }).catch(() => {});
    const zs = await A.evaluate(() => ({ zone: EB.game.world.zoneId, waiting: EB.net.awaitingZone, mobs: EB.game.mobs.length, remotes: EB.net.remotes.size }));
    check('Annika zones into the Frostfang Highlands (server-confirmed) and leaves the others behind', zs.zone === 'frostfang' && !zs.waiting && zs.mobs > 5 && zs.remotes === 0, zs);
    await B.waitForTimeout(800);
    check('Borin no longer sees Annika', await B.evaluate(() => ![...EB.net.remotes.values()].some((r) => r.name === 'Annika')));

    step('solo still works offline from the same page');
    const S = await mkPage('Solo');
    await S.goto(URL); await S.evaluate(() => localStorage.clear()); await S.reload(); await S.waitForTimeout(500);
    await S.click('#btnNew'); await S.click('#raceList button:has-text("Gnome")'); await S.click('#classList button:has-text("Wizard")'); await S.fill('#nameInput', 'Solofar'); await S.click('#btnCreate');
    await S.waitForFunction(() => EB.game && EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
    check('Play Solo is unchanged (no network)', await S.evaluate(() => !EB.net.active && !EB.net.ws && EB.game.mobs.length > 20));
  } catch (e) {
    console.error(e); check('no exceptions', false, String(e.message || e).slice(0, 300));
  }
  check('server log has no errors', !/Error|\[msg\]/.test(log), log.split('\n').filter((l) => /Error|\[msg\]/.test(l)).slice(0, 5));
  console.log(`--- JS errors (${errors.length}) ---`); for (const e of errors.slice(0, 20)) console.log(e);
  check('0 JS errors in all browsers', errors.length === 0);
  await browser.close(); srv.kill('SIGTERM');
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
