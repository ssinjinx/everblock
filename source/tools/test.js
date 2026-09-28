// Headless end-to-end test for Everblock: char creation, movement, targeting, combat, loot, screenshots
const { chromium } = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const hidePrompt = (page) => page.evaluate(() => { const e = document.getElementById('clickToPlay'); if (e) e.style.visibility = 'hidden'; });
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const step = (s) => console.log('==', s);
  await page.goto('file://' + require('path').resolve(__dirname, '../../index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  step('title');
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Dark Elf")');
  await page.click('#classList button:has-text("Wizard")');
  await page.click('#statTable button[data-s="5"][data-d="1"]');
  await page.click('#statTable button[data-s="5"][data-d="1"]');
  await page.click('#statTable button[data-s="1"][data-d="1"]');
  await page.fill('#nameInput', 'Jeramey');
  await hidePrompt(page); await page.screenshot({ path: SHOTS + '1-character-creation.png' });
  // switch to a warrior for the melee test but keep wizard screenshot
  await page.click('#raceList button:has-text("Human")');
  await page.click('#classList button:has-text("Warrior")');
  await page.click('#btnCreate');
  await page.waitForFunction(() => window.EB.game && window.EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  step('move');
  const p0 = await page.evaluate(() => EB.game.player.pos.toArray());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  await page.keyboard.press('Space'); await page.waitForTimeout(600);
  const p1 = await page.evaluate(() => EB.game.player.pos.toArray());
  console.log('moved from', p0.map((v) => v.toFixed(1)).join(','), 'to', p1.map((v) => v.toFixed(1)).join(','));
  // Town screenshot: face the guild hall & fountain from a nice angle
  await page.evaluate(() => { const g = EB.game, p = g.player; p.pos.set(128.5, 25, 143.5); p.yaw = Math.PI * 1.08; p.pitch = -0.12; g.camDist = 6; g.dayT = 0.40; });
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(2500);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + '2-town.png' });
  step('combat');
  const tgt = await page.evaluate(() => {
    const g = EB.game, p = g.player, w = g.world;
    const rats = g.mobs.filter((m) => m.alive && m.type === 'gnoll').sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
    const r = rats[0];
    r.level = 4; r.maxHp = r.hp = 10 + 32 + 32; r.maxHit = 9; r.refreshPlate(g);
    const rx = 176.5, rz = 131.5;
    r.pos.set(rx, w.surfaceY(rx, rz), rz); r.home.copy(r.pos);
    p.pos.set(rx - 2.4, w.surfaceY(rx - 2.4, rz), rz);
    p.yaw = Math.atan2(r.pos.x - p.pos.x, r.pos.z - p.pos.z) + 0.25; p.pitch = -0.18; g.camDist = 5.5; g.dayT = 0.36;
    return { name: r.name, level: r.level, id: r.id };
  });
  console.log('nearest rat', JSON.stringify(tgt));
  await page.waitForTimeout(800);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const tsel = await page.evaluate(() => EB.game.target && { name: EB.game.target.name, id: EB.game.target.id });
  console.log('targeted', JSON.stringify(tsel));
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyQ');
  let killed = false, shot = false;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => { const g = EB.game, t = g.target, p = g.player;
      if (t && t.alive) { p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z) + 0.25; if (p.pos.distanceTo(t.pos) > 2.4) { p.pos.x += (t.pos.x - p.pos.x) * 0.4; p.pos.z += (t.pos.z - p.pos.z) * 0.4; p.pos.y = g.world.surfaceY(p.pos.x, p.pos.z); } }
      if (p.hp < p.maxHp * 0.3) p.hp = p.maxHp; // test harness safety net
      if (t && t.alive && !p.autoAttack) g.toggleAuto(true);
      const r = { alive: !!(t && t.alive), hp: t ? t.hp : 0, max: t ? t.maxHp : 1, php: p.hp }; if (!g._hooked) { g._hooked = true; g._orig = g.update; g.update = function (dt) { g._orig.call(g, dt); const tt = g.target; if (tt && tt.alive && tt.hp < tt.maxHp * 0.7) { g.update = function () {}; window.__frozen = true; } }; } r.frozen = !!window.__frozen; return r; });
    if (!shot && st.frozen) { await hidePrompt(page); await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + '3-combat.png' }); shot = true; await page.evaluate(() => { EB.game.update = EB.game._orig; window.__frozen = false; }); }
    if (!st.alive) { killed = true; break; }
  }
  if (!shot) { await hidePrompt(page); await page.screenshot({ path: SHOTS + '3-combat.png' }); }
  console.log('killed:', killed);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  const lootOpen = await page.evaluate(() => !document.getElementById('lootWin').classList.contains('hidden'));
  if (lootOpen) { await page.click('#btnLootAll'); }
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/inventory.png' });
  await page.keyboard.press('KeyI');
  const logText = await page.evaluate(() => document.getElementById('chatLog').innerText);
  console.log('--- chat log ---\n' + logText.split('\n').slice(-30).join('\n'));
  const state = await page.evaluate(() => { const p = EB.game.player; return { level: p.level, xp: p.xp, coins: p.coins, inv: p.inv.filter(Boolean).map((i) => i.id + 'x' + i.count) }; });
  console.log('state', JSON.stringify(state));
  step('spells/sit/death');
  await page.evaluate(() => { const g = EB.game; g.gainXP(5000); });
  await page.keyboard.press('KeyX'); await page.waitForTimeout(300); await page.keyboard.press('KeyX');
  // death + corpse run
  await page.evaluate(() => { const g = EB.game; g.playerDie({ name: 'a large rat' }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/death.png' });
  await page.waitForFunction(() => EB.game.player.alive, null, { timeout: 30000 });
  const afterDeath = await page.evaluate(() => { const g = EB.game; return { corpses: g.pcorpses.length, equip: Object.keys(g.player.equip).length, pos: g.player.pos.toArray() }; });
  console.log('after death', JSON.stringify(afterDeath));
  await page.evaluate(() => { const g = EB.game, c = g.pcorpses[0]; g.player.pos.set(c.pos.x + 1, c.pos.y, c.pos.z); g.setTarget(c); });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const recovered = await page.evaluate(() => { const g = EB.game; return { corpses: g.pcorpses.length, equip: Object.keys(g.player.equip).length }; });
  console.log('recovered', JSON.stringify(recovered));
  step('dungeon/night');
  await page.evaluate(() => { const g = EB.game, w = g.world, r = w.dungeonRooms[4]; const p = g.player;
    p.pos.set(r.x - 4, w.dungeonFloor, r.z); p.yaw = Math.PI / 2; p.pitch = -0.1; g.camDist = 4; g.dayT = 0.95; p.godMode = true; p.hp = p.maxHp; });
  await page.waitForTimeout(3000);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1500);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + '4-dungeon.png' });
  // night outdoors at graveyard
  await page.evaluate(() => { const g = EB.game, w = g.world, L = EB.WORLD.LAYOUT; const p = g.player;
    p.pos.set(L.graveyard.x + 0.5, w.surfaceY(L.graveyard.x, L.graveyard.z - 5), L.graveyard.z - 4.5); p.yaw = 0.15; p.pitch = -0.12; g.camDist = 5; g.dayT = 0.9; g.setTarget(null); });
  await page.waitForTimeout(3000);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + '5-night-graveyard.png' });
  // save / reload
  await page.evaluate(() => EB.game.save());
  await page.reload();
  const cont = await page.evaluate(() => document.getElementById('continueInfo').innerText);
  console.log('continue screen:', cont.replace(/\n/g, ' | '));
  await page.click('#btnContinue');
  await page.waitForFunction(() => window.EB.game && window.EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const loaded = await page.evaluate(() => ({ lvl: EB.game.player.level, errs: EB.game.errors || 0 }));
  console.log('loaded', JSON.stringify(loaded));
  step('wizard casting');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Dark Elf")');
  await page.click('#classList button:has-text("Wizard")');
  await page.fill('#nameInput', 'Xalthor');
  await page.click('#btnCreate');
  await page.waitForFunction(() => window.EB.game && window.EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = EB.game, p = g.player, w = g.world;
    const m = g.mobs.filter((m) => m.alive && m.type === 'rat')[0];
    const rx = 162.5, rz = 124.5;
    m.pos.set(rx, w.surfaceY(rx, rz), rz); m.home.copy(m.pos);
    p.pos.set(rx - 9, w.surfaceY(rx - 9, rz), rz); p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z) + 0.2; p.pitch = -0.1; g.camDist = 5.5; g.dayT = 0.7;
    g.setTarget(m);
  });
  await page.keyboard.press('Digit2'); // minor shielding (self buff)
  await page.waitForTimeout(2600);
  await page.keyboard.press('Digit1'); // blast of cold
  await page.waitForTimeout(900);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + '6-wizard-casting.png' });
  await page.waitForTimeout(1500);
  const wlog = await page.evaluate(() => document.getElementById('chatLog').innerText.split('\n').slice(-8).join('\n'));
  console.log(wlog);
  const wst = await page.evaluate(() => { const p = EB.game.player; return { mana: p.mana, maxMana: p.maxMana, buffs: p.buffs.map((b) => b.name) }; });
  console.log('wizard', JSON.stringify(wst));
  console.log('--- JS errors (' + errors.length + ') ---\n' + errors.join('\n'));
  await browser.close();
})();
