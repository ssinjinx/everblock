// Everblock v5b: iPhone start-screen / create / enter-world flow in WebKit (Safari/Brave iOS engine) with
// iPhone 13 and iPhone 14 Pro Max descriptors: title fits, Phone Mode toggle visible with and without a save,
// robust touch detection, "Tap to play", thumb-sized buttons, merchant window clear of the top button bar.
const pw = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../../index.html');
const ENGINE = process.env.ENGINE || 'webkit';
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
(async () => {
  const browser = ENGINE === 'webkit' ? await pw.webkit.launch({ headless: true })
    : await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  console.log('engine', ENGINE, browser.version());
  const errors = [];
  // each phone at its full screen size (390x844, 430x932) and at the descriptor's in-browser viewport (toolbars visible)
  const DEVS = [['iPhone 13', 'iphone13', 'screen'], ['iPhone 14 Pro Max', 'iphone14promax', 'screen'], ['iPhone 13', 'iphone13-vp', 'viewport'], ['iPhone 14 Pro Max', 'iphone14promax-vp', 'viewport']];
  for (const [dn0, key, mode] of DEVS) {
    const base = pw.devices[dn0], dev = mode === 'screen' ? { ...base, viewport: { ...base.screen } } : base, dn = `${dn0} ${dev.viewport.width}x${dev.viewport.height}`;
    const ctx = await browser.newContext({ ...dev, hasTouch: true, isMobile: ENGINE === 'webkit' ? undefined : true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${dn}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU|swiftshader|AudioContext/i.test(m.text())) errors.push(`[${dn}] console.error: ${m.text()}`); });
    page.on('dialog', (d) => d.accept());
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const step = (s) => console.log(`== [${dn}] ${s}`);
    const layout = () => ev(() => {
      const vw = innerWidth, vh = innerHeight, r = (id) => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const logo = document.querySelector('#title .logo'), lr = logo.getBoundingClientRect();
      return { vw, vh, docW: document.documentElement.scrollWidth, titleW: document.getElementById('title').scrollWidth, logo: { l: Math.round(lr.left), r: Math.round(lr.right), sw: logo.scrollWidth, cw: logo.clientWidth, fs: getComputedStyle(logo).fontSize },
        phone: EB.phone.on, btnPhone: r('btnPhone'), btnContinue: r('btnContinue'), btnNew: r('btnNew'), btnDelete: r('btnDelete'), suggest: r('phoneSuggest'), fine: document.getElementById('fineText').innerText, body: document.body.className };
    });
    const tap = (sel) => page.locator(sel).tap();

    step('fresh start screen');
    await page.goto(URL); await ev(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
    let L = await layout();
    check(`[${dn}] touch device detected: Phone Mode auto-enabled + prompt shown`, L.phone && !!L.suggest, { phone: L.phone, suggest: !!L.suggest, touch: await ev(() => EB.phone.touchCapable()) });
    check(`[${dn}] EVERBLOCK title fits the screen (no clipping / horizontal overflow)`, L.logo.l >= 0 && L.logo.r <= L.vw && L.logo.sw <= L.logo.cw + 1 && L.docW <= L.vw && L.titleW <= L.vw, L.logo);
    check(`[${dn}] footer says "Tap to play"`, /^Tap to play/.test(L.fine) && !/Click/.test(L.fine), L.fine);
    check(`[${dn}] Phone Mode toggle visible on screen and thumb-sized`, L.btnPhone && L.btnPhone.b <= L.vh && L.btnPhone.h >= 44 && L.btnNew.h >= 44, [L.btnPhone, L.btnNew]);
    if (key === 'iphone13') await page.screenshot({ path: SHOTS + 'v5b-iphone-start-new.png' });

    step('create flow');
    await tap('#btnPhoneKeep');
    await tap('#btnNew'); await page.waitForTimeout(400);
    const cr = await ev(() => { const vw = innerWidth, over = [...document.querySelectorAll('#menuCreate *')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > vw + 1).map((e) => e.id || e.className || e.tagName).slice(0, 5); const bs = [...document.querySelectorAll('#menuCreate button')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)); return { docW: document.documentElement.scrollWidth, titleW: document.getElementById('title').scrollWidth, vw, over, minBtn: Math.min(...bs), phone2: !!document.getElementById('btnPhone2').offsetParent }; });
    check(`[${dn}] create screen: nothing overflows, buttons >= 40px, phone toggle present`, cr.docW <= cr.vw && cr.titleW <= cr.vw && !cr.over.length && cr.minBtn >= 40 && cr.phone2, cr);
    await page.locator('#nameInput').fill('Tapper');
    await tap('#btnCreate');
    await page.waitForFunction(() => window.EB.game && EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    const g1 = await ev(() => ({ phone: EB.phone.on, ui: getComputedStyle(document.getElementById('phoneUI')).display, joy: !!document.getElementById('joyBase').offsetParent, ctp: document.getElementById('clickToPlay').classList.contains('hidden') || getComputedStyle(document.getElementById('clickToPlay')).display === 'none' }));
    check(`[${dn}] new character enters the world in phone mode with touch controls`, g1.phone && g1.ui !== 'none' && g1.joy && g1.ctp, g1);

    step('merchant window clear of the top button bar');
    const mw = async () => ev(() => { const g = EB.game, n = g.npcs.find((x) => x.npcKind === 'merchant'); g.player.pos.set(n.pos.x + 1.5, n.pos.y, n.pos.z); g.setTarget(n); g.interact();
      const w = document.getElementById('merchantWin').getBoundingClientRect(), hit = [...document.querySelectorAll('#phoneTop button')].filter((b) => b.offsetParent).filter((b) => { const r = b.getBoundingClientRect(); return !(r.right <= w.left || r.left >= w.right || r.bottom <= w.top || r.top >= w.bottom); }).map((b) => b.dataset.act);
      const r = { open: g.windows.has('merchantWin'), overlap: hit, win: [w.left, w.top, w.right, w.bottom].map(Math.round), inView: w.left >= 0 && w.right <= innerWidth + 1 && w.top >= 0 && w.bottom <= innerHeight + 1 }; return r; });
    const m1 = await mw();
    check(`[${dn}] portrait: merchant window does not cover the top/utility buttons`, m1.open && !m1.overlap.length && m1.inView, m1);
    await ev(() => EB.game.closeAll());
    await page.setViewportSize({ width: dev.viewport.height, height: dev.viewport.width }); await page.waitForTimeout(600);
    const m2 = await mw();
    check(`[${dn}] landscape: merchant window does not cover the top/utility buttons`, m2.open && !m2.overlap.length && m2.inView, m2);
    await ev(() => EB.game.closeAll());
    await page.setViewportSize(dev.viewport); await page.waitForTimeout(400);
    await ev(() => EB.game.save());

    step('start screen with a saved character');
    await page.reload(); await page.waitForTimeout(600);
    L = await layout();
    check(`[${dn}] with a save: Enter World, Phone Mode toggle (ON) and Create all visible on screen`, L.btnContinue && L.btnPhone && L.btnNew && L.btnPhone.b <= L.vh && L.btnContinue.b <= L.vh && L.btnNew.b <= L.vh && L.phone && L.btnContinue.h >= 44, L);
    check(`[${dn}] with a save: title fits, no overflow`, L.logo.l >= 0 && L.logo.r <= L.vw && L.docW <= L.vw, L.logo);
    if (key === 'iphone13') await page.screenshot({ path: SHOTS + 'v5b-iphone-start.png' });
    await tap('#btnContinue');
    await page.waitForFunction(() => window.EB.game && EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    const g2 = await ev(() => ({ phone: EB.phone.on, ui: getComputedStyle(document.getElementById('phoneUI')).display, name: EB.game.player.name, gfx: EB.game.gfx || localStorage.getItem('everblock_gfx') }));
    check(`[${dn}] Enter World leads into phone mode controls`, g2.phone && g2.ui !== 'none' && g2.name === 'Tapper', g2);
    // joystick drag moves the player (touch)
    const p0 = await ev(() => [EB.game.player.pos.x, EB.game.player.pos.z]);
    const jb = await page.locator('#joyBase').boundingBox();
    const cdp = ENGINE === 'webkit' ? null : await ctx.newCDPSession(page);
    if (cdp) {
      const cx = jb.x + jb.width / 2, cy = jb.y + jb.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 10, id: 1 }] });
      await page.waitForTimeout(1200);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      // WebKit has no CDP touch: synthesize TouchEvents on the joystick zone
      await ev(([cx, cy]) => { const z = document.getElementById('joyZone'); const mk = (type, y) => { const t = { identifier: 1, target: z, clientX: cx, clientY: y, pageX: cx, pageY: y }; const e = new Event(type, { bubbles: true, cancelable: true }); const list = type === 'touchend' ? [] : [t]; Object.defineProperty(e, 'touches', { value: list }); Object.defineProperty(e, 'targetTouches', { value: list }); Object.defineProperty(e, 'changedTouches', { value: [t] }); z.dispatchEvent(e); };
        mk('touchstart', cy); for (let i = 1; i <= 5; i++) mk('touchmove', cy - i * 10); window.__endJoy = () => mk('touchend', cy - 50); }, [jb.x + jb.width / 2, jb.y + jb.height / 2]);
      await page.waitForTimeout(1200);
      await ev(() => window.__endJoy());
    }
    const p1 = await ev(() => [EB.game.player.pos.x, EB.game.player.pos.z]);
    check(`[${dn}] joystick moves the player`, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.8, { p0, p1 });
    if (key === 'iphone13') {
      await ev(() => { const g = EB.game, p = g.player, w = g.world; p.pos.set(128.5, w.surfaceY(128.5, 140.5), 140.5); p.yaw = 0; p.pitch = -0.12; g.camDist = 5; g.dayT = 0.35; });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: SHOTS + 'v5b-iphone-ingame.png' });
    }
    await ctx.close();
  }

  // ---------------- the real-device failure: touch iPhone, stale stored 'off' from an earlier build, saved character, Enter World
  {
    const dn = 'iPhone 13 (stale off + save)', dev = { ...pw.devices['iPhone 13'], viewport: { ...pw.devices['iPhone 13'].screen } };
    console.log(`== [${dn}] reproduce the reported case`);
    const ctx = await browser.newContext({ ...dev, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${dn}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU|swiftshader|AudioContext/i.test(m.text())) errors.push(`[${dn}] console.error: ${m.text()}`); });
    page.on('dialog', (d) => d.accept());
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const inGame = () => page.waitForFunction(() => window.EB.game && EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 90000 });
    await page.goto(URL); await ev(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300);
    if (/^https?:/.test(URL)) {
      const ih = await ev(() => !document.getElementById('installHint').classList.contains('hidden'));
      check(`[${dn}] iOS (not installed): "Add to Home Screen" install hint shown`, ih);
      await page.locator('#installHint .x').tap();
      check(`[${dn}] install hint is dismissible`, await ev(() => document.getElementById('installHint').classList.contains('hidden') && localStorage.getItem('everblock_install_hint_off') === '1'));
    } else check(`[${dn}] install hint hidden on file:// (no PWA there)`, await ev(() => document.getElementById('installHint').classList.contains('hidden')));
    // make a genuine saved character, then plant the stale values an older build left behind
    await page.locator('#btnNew').tap(); await page.locator('#nameInput').fill('Stale'); await page.locator('#btnCreate').tap(); await inGame(); await page.waitForTimeout(800);
    await ev(() => { EB.game.save(); localStorage.removeItem('everblock_phone_v2'); localStorage.setItem('everblock_phone', '0'); localStorage.setItem('everblock_phone_prompted', '1'); });
    await page.reload(); await page.waitForTimeout(500);
    const s0 = await ev(() => ({ on: EB.phone.on, body: document.body.className, src: EB.phone.source, old: localStorage.getItem('everblock_phone'), btn: document.getElementById('btnPhone').innerText, cont: !!document.getElementById('btnContinue').offsetParent }));
    check(`[${dn}] stale 'off' from an older build is discarded: Phone Mode ON on the start screen`, s0.on && /phone/.test(s0.body) && s0.old === null && /ON/.test(s0.btn) && s0.cont, s0);
    await ev(() => { window.__locks = 0; const orig = HTMLCanvasElement.prototype.requestPointerLock; HTMLCanvasElement.prototype.requestPointerLock = function () { window.__locks++; return orig && orig.call(this); }; });
    await page.locator('#btnContinue').tap(); await inGame(); await page.waitForTimeout(1200);
    // tap the 3D view a few times (where a desktop click would grab the pointer)
    for (const [x, y] of [[300, 300], [200, 420]]) await page.touchscreen.tap(x, y);
    await page.waitForTimeout(300);
    const g = await ev(() => ({ on: EB.phone.on, bound: !!EB.phone.bound, ui: getComputedStyle(document.getElementById('phoneUI')).display, joy: !!document.getElementById('joyBase').offsetParent, btns: document.querySelectorAll('#phoneBtns .pb').length, ctp: getComputedStyle(document.getElementById('clickToPlay')).display === 'none' || document.getElementById('clickToPlay').classList.contains('hidden'), locks: window.__locks, plock: !!document.pointerLockElement }));
    check(`[${dn}] Enter World with a saved character: joystick + action buttons, no "Click to resume", no pointer lock`, g.on && g.bound && g.ui !== 'none' && g.joy && g.btns === 7 && g.ctp && g.locks === 0 && !g.plock, g);
    // in-game toggle in Help
    await page.locator('#phoneTop [data-act="help"]').tap(); await page.waitForTimeout(300);
    const hb = await ev(() => { const b = document.getElementById('btnPhone3'); const r = b.getBoundingClientRect(); return { vis: !!b.offsetParent && r.top >= 0 && r.bottom <= innerHeight, txt: b.innerText, h: Math.round(r.height) }; });
    check(`[${dn}] Help window has a visible Phone Mode toggle`, hb.vis && /ON/.test(hb.txt), hb);
    await page.locator('#btnPhone3').tap(); await page.waitForTimeout(200);
    const off = await ev(() => ({ on: EB.phone.on, body: document.body.className, ls: localStorage.getItem('everblock_phone_v2'), txt: document.getElementById('btnPhone3').innerText }));
    await ev(() => EB.game.closeAll()); await page.waitForTimeout(200);
    const offCtp = await ev(() => getComputedStyle(document.getElementById('clickToPlay')).display === 'none' || document.getElementById('clickToPlay').classList.contains('hidden'));
    check(`[${dn}] toggling OFF in game works and still never shows the pointer-lock overlay on a touch device`, !off.on && !/phone/.test(off.body) && off.ls === '0' && /OFF/.test(off.txt) && offCtp, { off, offCtp });
    await ev(() => EB.game.command('/phone on')); await page.waitForTimeout(300);
    const on2 = await ev(() => ({ on: EB.phone.on, ui: getComputedStyle(document.getElementById('phoneUI')).display, ls: localStorage.getItem('everblock_phone_v2') }));
    check(`[${dn}] /phone on re-enables the touch controls`, on2.on && on2.ui !== 'none' && on2.ls === '1', on2);
    await ev(() => EB.game.command('/phone status')); await page.waitForTimeout(200);
    const dbg = await ev(() => { const d = document.getElementById('phoneDbg'); return d && !d.classList.contains('hidden') ? d.innerText : ''; });
    check(`[${dn}] /phone status shows the detection signals on screen`, /maxTouchPoints/.test(dbg) && /ontouchstart/.test(dbg) && /pointerCoarse/.test(dbg) && /mobileUA/.test(dbg) && /standalone/.test(dbg), dbg.slice(0, 160));
    await ev(() => document.getElementById('phoneDbg').classList.add('hidden'));
    // screenshots of the in-game phone UI, portrait and landscape
    await ev(() => { const g = EB.game, p = g.player, w = g.world; for (const m of g.mobs.slice()) if (Math.hypot(m.pos.x - 150, m.pos.z - 125) < 20) g.removeEntity(m); p.pos.set(128.5, w.surfaceY(128.5, 140.5), 140.5); p.yaw = 0; p.pitch = -0.12; g.camDist = 5; g.dayT = 0.35; g.spawnT = 1e9;
      const M = new EB.ent.Mob('wolf', null, 128.5, w.surfaceY(128.5, 146.5), 146.5, [2, 2]); M.def = Object.assign({}, M.def, { aggro: 0 }); g.mobs.push(M); M.addTo(g.scene); g.setTarget(M); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + 'v5c-iphone-portrait.png' });
    await page.setViewportSize({ width: dev.viewport.height, height: dev.viewport.width }); await page.waitForTimeout(1500);
    const land = await ev(() => ({ on: EB.phone.on, ui: getComputedStyle(document.getElementById('phoneUI')).display, joy: !!document.getElementById('joyBase').offsetParent, w: innerWidth, h: innerHeight }));
    check(`[${dn}] landscape: phone controls still active`, land.on && land.ui !== 'none' && land.joy && land.w > land.h, land);
    await page.screenshot({ path: SHOTS + 'v5c-iphone-landscape.png' });
    await ctx.close();
  }

  // ---------------- detection edge cases
  console.log('== detection edge cases');
  const edge = async (opts, prep) => { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('edge pageerror: ' + e.message)); await page.goto(URL); await page.evaluate(prep || (() => localStorage.clear())); await page.reload(); await page.waitForTimeout(400); const r = await page.evaluate(() => ({ on: EB.phone.on, sug: !document.getElementById('phoneSuggest').classList.contains('hidden'), fine: document.getElementById('fineText').innerText })); return { ctx, page, r }; };
  const ip = pw.devices['iPhone 13'];
  let e1 = await edge({ ...ip, hasTouch: true }, () => { localStorage.clear(); localStorage.setItem('everblock_phone', '0'); });
  check('old stored "off" on a touch device: prompt shown once (phone on)', e1.r.on && e1.r.sug, e1.r);
  await e1.page.locator('#btnPhoneNo').tap(); await e1.page.reload(); await e1.page.waitForTimeout(400);
  const e1b = await e1.page.evaluate(() => ({ on: EB.phone.on, sug: !document.getElementById('phoneSuggest').classList.contains('hidden') }));
  check('after choosing keyboard & mouse, the choice is respected on reload (no second prompt)', !e1b.on && !e1b.sug, e1b);
  await e1.ctx.close();
  const e2 = await edge({ viewport: { width: 1024, height: 768 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', hasTouch: true });
  check('iPadOS-as-Mac (touch points) is detected as touch', e2.r.on && e2.r.sug, e2.r); await e2.ctx.close();
  const e3 = await edge({ viewport: { width: 1280, height: 800 }, hasTouch: false });
  check('desktop (no touch) stays in keyboard & mouse mode with "Click to play"', !e3.r.on && !e3.r.sug && /^Click to play/.test(e3.r.fine), e3.r);
  // first input = touchstart on a device that hid its touch support
  await e3.page.evaluate(() => { const t = document.getElementById('title'); t.dispatchEvent(typeof TouchEvent !== 'undefined' ? new TouchEvent('touchstart', { bubbles: true, cancelable: true }) : new Event('touchstart', { bubbles: true })); });
  await e3.page.waitForTimeout(200);
  const e3b = await e3.page.evaluate(() => ({ on: EB.phone.on, sug: !document.getElementById('phoneSuggest').classList.contains('hidden'), fine: document.getElementById('fineText').innerText }));
  check('first input being a touchstart turns Phone Mode on (with the prompt)', e3b.on && e3b.sug && /^Tap/.test(e3b.fine), e3b);
  await e3.ctx.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log('JS errors:', errors.length ? errors : 0);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
