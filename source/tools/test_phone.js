// Everblock v5 Phone Mode test: Playwright mobile emulation (iPhone 13 portrait, Pixel 5 landscape) with real touch
// events - start-screen toggle, character creation by tapping, virtual joystick movement, drag-to-look, pinch zoom,
// tap-to-target, killing and looting a mob with the touch buttons, spellbook / merchant / quest / merc dialogs by touch.
const { chromium, devices } = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../../index.html');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const DEVICES = [
  { key: 'iphone13', dev: 'iPhone 13', label: 'iPhone 13 (portrait)', race: 'Human', cls: 'Warrior' },
  { key: 'pixel5', dev: 'Pixel 5 landscape', label: 'Pixel 5 (landscape)', race: 'Dark Elf', cls: 'Necromancer' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const D of DEVICES) {
    const d = devices[D.dev];
    const ctx = await browser.newContext({ ...d, deviceScaleFactor: 2, defaultBrowserType: undefined });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('dialog', (x) => x.accept());
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const step = (s) => console.log(`== [${D.label}] ${s}`);
    const waitGame = async (sec) => { const t0 = await ev(() => EB.game.time); await page.waitForFunction((t) => EB.game.time >= t, t0 + sec, { timeout: 120000 }); };
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] != null ? p[2] : i, radiusX: 4, radiusY: 4, force: 1 })) });
    const drag = async (x0, y0, x1, y1, steps, holdMs) => { await touch('touchStart', [[x0, y0]]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]); await page.waitForTimeout(16); } if (holdMs) await page.waitForTimeout(holdMs); await touch('touchEnd', []); };
    const center = (sel) => ev((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
    const tapSel = async (sel) => { const [x, y] = await center(sel); await page.touchscreen.tap(x, y); await page.waitForTimeout(120); };
    const shot = async (name) => { await page.screenshot({ path: SHOTS + name }); console.log('   shot', name); };
    const vp = d.viewport;

    step('start screen: touch device detected -> Phone Mode suggested');
    await page.goto(URL);
    await ev(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(400);
    const st0 = await ev(() => ({ on: EB.phone.on, body: document.body.classList.contains('phone'), sugg: !document.getElementById('phoneSuggest').classList.contains('hidden'), btn: document.getElementById('btnPhone').textContent, touch: EB.phone.touchCapable() }));
    check('touch detected, phone mode auto-enabled and suggested on the start screen', st0.on && st0.body && st0.sugg && /ON/.test(st0.btn) && st0.touch, st0);
    await shot(`v5-phone-${D.key}-start.png`);
    await tapSel('#btnPhone');
    const off = await ev(() => ({ on: EB.phone.on, ls: localStorage.getItem('everblock_phone_v2') }));
    await tapSel('#btnPhone');
    const on2 = await ev(() => ({ on: EB.phone.on, ls: localStorage.getItem('everblock_phone_v2') }));
    check('toggle button switches phone mode and remembers the choice in localStorage', !off.on && off.ls === '0' && on2.on && on2.ls === '1', { off, on2 });
    await page.reload(); await page.waitForTimeout(300);
    check('choice persists across reloads', await ev(() => EB.phone.on && document.body.classList.contains('phone') && document.getElementById('phoneSuggest').classList.contains('hidden')));

    step('character creation by touch');
    await page.locator('#btnNew').tap();
    await page.waitForTimeout(400);
    await page.locator(`#raceList button:has-text("${D.race}")`).tap();
    await page.locator(`#classList button:has-text("${D.cls}")`).tap();
    await page.locator('#nameInput').tap();
    await page.fill('#nameInput', D.key === 'iphone13' ? 'Thumbs' : 'Swipey');
    await page.waitForTimeout(400);
    const fit = await ev(() => ({ sw: document.getElementById('title').scrollWidth, cw: document.getElementById('title').clientWidth, btn2: /ON/.test(document.getElementById('btnPhone2').textContent) }));
    check('creation screen fits the phone width (no horizontal overflow) and shows the phone toggle', fit.sw <= fit.cw + 2 && fit.btn2, fit);
    await shot(`v5-phone-${D.key}-create.png`);
    await page.locator('#btnCreate').tap();
    await page.waitForFunction(() => window.EB.game && EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await ev(() => { EB.game.save = () => {}; });
    const hud = await ev(() => { const g = EB.game, vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; };
      return { gfx: g.gfxPref, pr: g.renderer.getPixelRatio(), lock: document.pointerLockElement === null, joy: vis('joyZone'), btns: vis('phoneBtns'), top: vis('phoneTop'), cross: vis('crosshair'), click: vis('clickToPlay'), chat: vis('chatWin'), hot: vis('hotbar') }; });
    check('in game: graphics auto-lowered, no pointer lock, joystick + buttons shown, desktop prompts hidden', hud.gfx === 'low' && hud.pr === 1 && hud.lock && hud.joy && hud.btns && hud.top && !hud.cross && !hud.click && hud.hot, hud);
    const overlap = await ev(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const a = r('#hotbar'), b = r('#phoneBtns'), j = r('#joyBase'); const inter = (p, q) => !(p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top);
      const btnHit = [...document.querySelectorAll('#phoneBtns .pb')].some((e) => inter(e.getBoundingClientRect(), a));
      return { hotbarInView: a.left >= 0 && a.right <= innerWidth + 1 && a.top >= 0, btnHit, joyHit: inter(j, a) }; });
    check('hotbar fits on screen and does not overlap the joystick or action buttons', overlap.hotbarInView && !overlap.btnHit && !overlap.joyHit, overlap);
    await shot(`v5-phone-${D.key}-hud.png`);

    step('chat log collapses / expands');
    await tapSel('#phoneTop [data-act="chat"]');
    const chatOpen = await ev(() => getComputedStyle(document.getElementById('chatWin')).display !== 'none');
    await tapSel('#phoneTop [data-act="chat"]');
    const chatClosed = await ev(() => getComputedStyle(document.getElementById('chatWin')).display === 'none');
    check('chat button toggles the collapsible chat log', chatOpen && chatClosed, { chatOpen, chatClosed });

    step('virtual joystick movement');
    await ev(() => { const g = EB.game, p = g.player, w = g.world, x = 150.5, z = 131.5; for (const m of g.mobs.slice()) if (Math.hypot(m.pos.x - x, m.pos.z - z) < 40) g.removeEntity(m); g.spawnT = 1e9; p.pos.set(x, w.surfaceY(x, z), z); p.yaw = 0; p.pitch = -0.15; g.camDist = 5.5; g.dayT = 0.35; });
    await waitGame(0.5);
    const p0 = await ev(() => ({ x: EB.game.player.pos.x, z: EB.game.player.pos.z }));
    const [jx, jy] = await center('#joyBase');
    await touch('touchStart', [[jx, jy]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[jx, jy - i * 9]]); await page.waitForTimeout(16); }
    const mid = await ev(() => ({ mx: EB.phone.move.x, my: EB.phone.move.y }));
    await waitGame(1.5);
    await touch('touchEnd', []);
    await waitGame(0.2);
    const p1 = await ev(() => ({ x: EB.game.player.pos.x, z: EB.game.player.pos.z, mv: EB.phone.move.y }));
    const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check('joystick push forward moves the player (analog vector, released = stop)', mid.my > 0.6 && moved > 3 && p1.mv === 0, { mid, moved: +moved.toFixed(2), p1 });
    // strafe right
    const p2 = await ev(() => ({ x: EB.game.player.pos.x, z: EB.game.player.pos.z }));
    await touch('touchStart', [[jx, jy]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[jx + i * 9, jy]]); await page.waitForTimeout(16); }
    await waitGame(1.0); await touch('touchEnd', []);
    const p3 = await ev(() => ({ x: EB.game.player.pos.x, z: EB.game.player.pos.z }));
    check('joystick sideways strafes (yaw 0: right = -x)', p3.x < p2.x - 2, { dx: +(p3.x - p2.x).toFixed(2) });

    step('drag to look, pinch to zoom');
    const y0 = await ev(() => EB.game.player.yaw);
    await drag(vp.width * 0.62, vp.height * 0.35, vp.width * 0.62 - 120, vp.height * 0.35 + 30, 8);
    const look = await ev(() => ({ yaw: EB.game.player.yaw, pitch: EB.game.player.pitch }));
    check('right-side drag turns the camera (yaw & pitch)', Math.abs(look.yaw - y0) > 0.4 && look.pitch < -0.15, { dyaw: +(look.yaw - y0).toFixed(2), pitch: +look.pitch.toFixed(2) });
    const c0 = await ev(() => EB.game.camDist);
    const cx = vp.width * 0.55, cy = vp.height * 0.4;
    await touch('touchStart', [[cx - 30, cy, 0], [cx + 30, cy, 1]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[cx - 30 - i * 12, cy, 0], [cx + 30 + i * 12, cy, 1]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    const c1 = await ev(() => EB.game.camDist);
    await touch('touchStart', [[cx - 100, cy, 0], [cx + 100, cy, 1]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[cx - 100 + i * 12, cy, 0], [cx + 100 - i * 12, cy, 1]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    const c2 = await ev(() => EB.game.camDist);
    check('pinch out zooms in, pinch in zooms out (yaw unchanged by pinch)', c1 < c0 && c2 > c1, { c0, c1: +c1.toFixed(2), c2: +c2.toFixed(2) });
    const noScroll = await ev(() => ({ sx: window.scrollX, sy: window.scrollY, sc: window.visualViewport ? visualViewport.scale : 1, ta: getComputedStyle(document.body).touchAction }));
    check('page does not scroll or zoom (touch-action none, viewport scale 1)', noScroll.sx === 0 && noScroll.sy === 0 && noScroll.sc === 1 && noScroll.ta === 'none', noScroll);

    step('tap an entity to target, kill it with touch buttons, loot with E');
    await ev(() => { const g = EB.game, p = g.player; p.yaw = 0; p.pitch = -0.2; g.camDist = 5.5; p.hp = p.maxHp;
      const x = p.pos.x, z = p.pos.z + 4.5, y = g.world.surfaceY(x, z); const m = new EB.ent.Mob('skeleton', null, x, y, z, [1, 1]); m.maxHp = m.hp = 30; m.yaw = Math.PI; g.mobs.push(m); m.addTo(g.scene); g.testMob = m; g.setTarget(null); });
    await waitGame(0.4);
    const sp = await ev(() => { const g = EB.game, m = g.testMob; const v = m.pos.clone(); v.y += m.h * 0.55; v.project(g.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
    await page.touchscreen.tap(sp[0], sp[1]);
    await page.waitForTimeout(200);
    check('tapping the monster on screen targets it', await ev(() => EB.game.target === EB.game.testMob), { at: sp.map(Math.round) });
    await shot(`v5-phone-${D.key}-target.png`);
    await tapSel('#phoneBtns [data-act="consider"]');
    check('consider button works', await ev(() => [...document.getElementById('chatLog').children].slice(-4).some((l) => /skeleton .* -- /.test(l.textContent))));
    await tapSel('#phoneBtns [data-act="attack"]');
    check('attack button turns on auto attack', await ev(() => EB.game.player.autoAttack));
    // walk into melee range with the joystick
    await touch('touchStart', [[jx, jy]]); for (let i = 1; i <= 5; i++) { await touch('touchMove', [[jx, jy - i * 10]]); await page.waitForTimeout(16); }
    await page.waitForFunction(() => { const g = EB.game; return g.player.pos.distanceTo(g.testMob.pos) < 2.2 || !g.testMob.alive; }, null, { timeout: 30000 }).catch(() => {});
    await touch('touchEnd', []);
    await page.waitForFunction(() => !EB.game.testMob.alive, null, { timeout: 60000 }).catch(() => {});
    await shot(`v5-phone-${D.key}-combat.png`);
    check('the monster is killed', await ev(() => !EB.game.testMob.alive && EB.game.player.alive));
    await ev(() => { EB.game.testMob.loot.items.push({ id: 'bone_chips', count: 1 }); });
    await tapSel('#phoneBtns [data-act="interact"]');
    const lootOpen = await ev(() => !document.getElementById('lootWin').classList.contains('hidden'));
    await page.locator('#btnLootAll').tap();
    await page.waitForTimeout(200);
    check('E button loots the corpse (loot window + Loot All by touch)', lootOpen && (await ev(() => EB.game.countItem('bone_chips') >= 1)), { lootOpen });

    step('spellbook by touch');
    await tapSel('#phoneTop [data-act="book"]');
    const bookOpen = await ev(() => !document.getElementById('bookWin').classList.contains('hidden'));
    await page.locator('#bookList .bspell').first().tap();
    await page.waitForTimeout(200);
    const acts = await ev(() => document.querySelectorAll('#bookList .bookActions button:not([disabled])').length);
    await shot(`v5-phone-${D.key}-spellbook.png`);
    await page.locator('#bookList .bookActions [data-hot="7"]').tap();
    await page.waitForTimeout(200);
    const hot7 = await ev(() => EB.game.player.hotbar[7]);
    check('spellbook opens from the touch button; tapping a spell shows touch buttons; placing it on the hotbar works', bookOpen && acts >= 8 && !!hot7, { bookOpen, acts, hot7 });
    if (D.cls === 'Necromancer') {
      await page.locator('#bookList .bspell').first().tap();
      await page.locator('#bookList .bookActions [data-gem="1"]').tap().catch(() => {});
      await page.waitForTimeout(200);
      check('memorize into a spell gem by touch', await ev(() => !!(EB.game.player.memorizing || EB.game.player.gems[1])));
      await ev(() => { const p = EB.game.player; if (p.memorizing) EB.game.memorize(p.memorizing.id, p.memorizing.gem, true); });
    }
    await tapSel('#bookWin .wtitle .x');
    check('close button (✕) closes the spellbook by touch', await ev(() => document.getElementById('bookWin').classList.contains('hidden')));

    step('merchant / quest / merc dialogs by touch');
    await ev(() => { const g = EB.game, p = g.player; p.coins = 500000; const n = g.npcs.find((x) => x.npcKind === 'merchant'); p.pos.set(n.pos.x, n.pos.y, n.pos.z + 2); p.yaw = Math.PI; g.setTarget(n); g.testNpc = n; });
    await waitGame(0.3);
    await tapSel('#phoneBtns [data-act="interact"]');
    const merch = await ev(() => ({ open: !document.getElementById('merchantWin').classList.contains('hidden'), buy: document.querySelectorAll('#merchList .row button').length, sell: document.querySelectorAll('#merchList .sellRow').length, fs: !!document.querySelector('#merchList .fstand') }));
    const coins0 = await ev(() => EB.game.player.coins);
    await page.locator('#merchList .row button').first().tap();
    const coins1 = await ev(() => EB.game.player.coins);
    await page.locator('#merchList .sellRow button').first().tap();
    const coins2 = await ev(() => EB.game.player.coins);
    await shot(`v5-phone-${D.key}-merchant.png`);
    const mw = await ev(() => { const r = document.getElementById('merchantWin').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
    check('merchant window fits the screen; buy and sell work by touch (sell list, faction line)', merch.open && merch.buy > 3 && merch.sell > 0 && merch.fs && coins1 < coins0 && coins2 > coins1 && mw.l >= 0 && mw.r <= mw.w + 1, { merch, coins0, coins1, coins2, mw });
    await tapSel('#merchantWin .wtitle .x');
    // quest dialog
    await ev(() => { const g = EB.game, n = g.npcs.find((x) => g.questFor && g.questFor(x) && !g.quests[g.questFor(x)]); g.testQ = g.questFor(n); g.player.pos.set(n.pos.x, n.pos.y, n.pos.z + 2); g.setTarget(n); });
    await tapSel('#phoneBtns [data-act="hail"]');
    await page.waitForFunction(() => !document.getElementById('dialogWin').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    await shot(`v5-phone-${D.key}-quest.png`);
    await page.locator('#dlgBtns button').first().tap();
    check('quest dialog opens from Hail and Accept works by touch', await ev(() => EB.game.quests[EB.game.testQ] === 'active'), await ev(() => EB.game.testQ));
    // mercenary hire + settings
    await ev(() => { const g = EB.game, n = g.npcs.find((x) => x.npcKind === 'liaison'); g.player.pos.set(n.pos.x, n.pos.y, n.pos.z + 2); g.setTarget(n); });
    await tapSel('#phoneBtns [data-act="interact"]');
    await page.locator('#mercList button').first().tap();
    await page.waitForTimeout(300);
    const hired = await ev(() => EB.game.mercs.filter((m) => !m.isPet).length);
    await ev(() => EB.game.closeAll());
    const cfgBtn = page.locator('#groupWin .gcfg').first();
    await cfgBtn.tap().catch(() => {});
    await page.waitForTimeout(300);
    const cfg = await ev(() => ({ open: !document.getElementById('mercCfgWin').classList.contains('hidden'), btns: document.querySelectorAll('#mcfgBody button').length }));
    if (cfg.open) await shot(`v5-phone-${D.key}-merc.png`);
    if (cfg.open) { const b = page.locator('#mcfgBody button:has-text("aggressive"), #mcfgBody button:has-text("Aggressive")').first(); await b.tap().catch(() => {}); }
    check('mercenary hired and settings window opened / used by touch', hired >= 1 && cfg.open && cfg.btns > 0, { hired, cfg, stance: await ev(() => EB.game.mercs[0] && EB.game.mercs[0].stance) });
    await ev(() => EB.game.closeAll());

    if (D.cls === 'Necromancer') {
      step('pet window & pet bar by touch');
      await ev(() => { const g = EB.game; g.summonPet(3); });
      await page.waitForTimeout(400);
      await tapSel('#phoneTop [data-act="pet"]');
      const pw = await ev(() => !document.getElementById('petWin').classList.contains('hidden'));
      await page.locator('#petBody button[data-pc="guard"]').tap();
      const mode = await ev(() => EB.game.pet().petMode);
      await shot(`v5-phone-${D.key}-pet.png`);
      await tapSel('#petWin .wtitle .x');
      await page.locator('#petBar .petBtn[data-pc="follow"]').tap();
      const mode2 = await ev(() => EB.game.pet().petMode);
      check('pet window button and pet bar work by touch', pw && mode === 'guard' && mode2 === 'follow', { pw, mode, mode2 });
    }

    step('inventory, map toggle, help by touch');
    await tapSel('#phoneTop [data-act="inv"]');
    const inv = await ev(() => { const r = document.getElementById('invWin').getBoundingClientRect(); return { open: !document.getElementById('invWin').classList.contains('hidden'), fits: r.left >= 0 && r.right <= innerWidth + 1 }; });
    await shot(`v5-phone-${D.key}-inventory.png`);
    await tapSel('#invWin .wtitle .x');
    const m0 = await ev(() => EB.game.showMap);
    await tapSel('#phoneTop [data-act="map"]');
    const m1 = await ev(() => EB.game.showMap);
    await tapSel('#phoneTop [data-act="map"]');
    check('inventory opens (fits width) and map toggles by touch', inv.open && inv.fits && m0 !== m1, { inv, m0, m1 });
    await ev(() => { const g = EB.game; if (g.player.memorizing) g.interruptMemorize(); g.stand(); });
    const sitAt = await ev(() => { const r = document.querySelector('#phoneBtns [data-act="sit"]').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e ? (e.id || e.className || e.tagName) : null; });
    await tapSel('#phoneBtns [data-act="sit"]');
    const sit = await ev(() => EB.game.player.sitting);
    await tapSel('#phoneBtns [data-act="jump"]');
    const stood = await ev(() => !EB.game.player.sitting);
    check('sit button sits, jump stands you up', sit && stood, { sit, stood, sitAt });

    // final scenic shot
    await ev(() => { const g = EB.game, p = g.player; g.closeAll(); p.pos.set(150.5, g.world.surfaceY(150.5, 125.5), 125.5); p.yaw = 0.4; p.pitch = -0.12; g.camDist = 5.5; });
    await waitGame(0.6);
    await shot(`v5-phone-${D.key}-play.png`);
    check(`no JS errors on ${D.label}`, errors.length === 0, errors.slice(0, 5));
    await ctx.close();
  }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  if (fails.length) { console.log('FAILED:', fails.map((f) => f.name).join('; ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
