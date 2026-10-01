// Everblock v5c PWA test (needs http(s)): manifest + icons served, apple meta tags, service worker registers,
// controls the page and serves the game offline. Usage: URL=http://localhost:8765/ node test_pwa.js
const pw = require('playwright-core');
const URL = process.env.URL || 'http://localhost:8765/';
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
(async () => {
  const browser = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  const base = URL.replace(/[^/]*$/, '');
  const get = async (u) => { const r = await ctx.request.get(base + u + (u.includes('?') ? '&' : '?') + 'nc=' + Date.now()); return { status: r.status(), type: r.headers()['content-type'] || '', len: (await r.body()).length, body: r }; };
  const man = await get('manifest.webmanifest');
  let mj = null; try { mj = JSON.parse(await man.body.text()); } catch (e) {}
  check('manifest.webmanifest served (200) and valid JSON', man.status === 200 && mj, { status: man.status, type: man.type });
  check('manifest: name/short_name Everblock, fullscreen/standalone display, any orientation, theme colours', mj && mj.name === 'Everblock' && mj.short_name === 'Everblock' && /fullscreen|standalone/.test(mj.display) && /any|landscape/.test(mj.orientation) && mj.theme_color && mj.background_color, mj && { display: mj.display, orientation: mj.orientation });
  const icons = (mj ? mj.icons.map((i) => i.src) : []).concat(['icons/apple-touch-icon.png']);
  const ist = {}; for (const i of icons) { const r = await get(i); ist[i] = [r.status, r.type, r.len]; }
  check('all icons return 200 PNGs (192, 512, maskable, apple-touch-icon 180)', Object.values(ist).every(([s, t, l]) => s === 200 && /png/.test(t) && l > 500) && mj.icons.some((i) => i.purpose === 'maskable') && ['192x192', '512x512'].every((sz) => mj.icons.some((i) => i.sizes === sz)), ist);
  const sw = await get('sw.js');
  const swText = await sw.body.text();
  check('sw.js served with a build-stamped cache version', sw.status === 200 && /javascript/.test(sw.type) && /everblock-[0-9a-f]{12}/.test(swText), { status: sw.status, type: sw.type });

  await page.goto(URL);
  const head = await page.evaluate(() => ({ manifest: !!document.querySelector('link[rel=manifest]'), apple: document.querySelector('link[rel=apple-touch-icon]') && document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'),
    capable: document.querySelector('meta[name=apple-mobile-web-app-capable]') && document.querySelector('meta[name=apple-mobile-web-app-capable]').content, bar: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]') && document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]').content,
    vp: document.querySelector('meta[name=viewport]').content, theme: document.querySelector('meta[name=theme-color]') && document.querySelector('meta[name=theme-color]').content }));
  check('head: manifest link, apple-touch-icon, apple-mobile-web-app-capable + status bar style, viewport-fit=cover, theme-color', head.manifest && head.apple && head.capable === 'yes' && head.bar && /viewport-fit=cover/.test(head.vp) && head.theme, head);
  const ctrl = await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller ? true : (navigator.serviceWorker.ready.then(() => {}), false), null, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ctrl) { await page.reload(); await page.waitForTimeout(1500); }
  const swState = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { reg: !!r, active: !!(r && r.active), controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() }; });
  check('service worker registered, active and controlling the page; game cached', swState.reg && swState.active && swState.controlled && swState.caches.some((k) => /^everblock-/.test(k)), swState);
  // offline: reload with the network cut and start a game
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(800);
  const off = await page.evaluate(() => ({ title: document.title, eb: !!(window.EB && EB.phone && EB.data), btn: !!document.getElementById('btnNew') }));
  check('offline reload serves the game from the cache', off.title === 'Everblock' && off.btn && off.eb, off);
  await page.evaluate(() => localStorage.clear());
  await page.click('#btnNew'); await page.fill('#nameInput', 'Offline'); await page.click('#btnCreate');
  const played = await page.waitForFunction(() => window.EB.game && EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 }).then(() => true).catch(() => false);
  check('a new character can be created and played offline', played);
  await ctx.setOffline(false);
  // the single-file build still works from file:// without manifest / sw (no errors)
  const fpage = await browser.newPage(); const ferr = [];
  fpage.on('pageerror', (e) => ferr.push(e.message)); fpage.on('console', (m) => { if (m.type() === 'error') ferr.push(m.text()); });
  await fpage.goto('file://' + require('path').resolve(__dirname, '../../index.html')); await fpage.waitForTimeout(800);
  const f = await fpage.evaluate(() => ({ manifest: !!document.querySelector('link[rel=manifest]'), sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), hint: !document.getElementById('installHint').classList.contains('hidden') }));
  check('file:// single-file build: no manifest/sw injected, no install hint, no errors', !f.manifest && !f.sw && !f.hint && !ferr.length, { f, ferr });
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log('JS errors:', errors.length ? errors : 0);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
