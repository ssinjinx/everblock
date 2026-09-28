const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../../index.html'));
  await page.click('#btnNew');
  await page.fill('#nameInput', 'Jeramey');
  await page.click('#btnCreate');
  await page.waitForFunction(() => window.EB.game && window.EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => { const g = EB.game; return { pos: g.player.pos.toArray(), mobs: g.mobs.length, chunks: g.world.chunks.filter(Boolean).length, errs: g.errors || 0 }; });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: '/tmp/t1.png' });
  console.log(errors.join('\n'));
  await browser.close();
})();
