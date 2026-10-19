// Everblock v9 headless test: multiclass (2 at creation, 3rd at 10), multiple pets, Overachievement Points (AA).
const { chromium } = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../../index.html');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const step = (s) => console.log('==', s);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const inGame = () => page.waitForFunction(() => window.EB.game && window.EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
  const waitGame = async (sec) => { const t0 = await ev(() => EB.game.time); await page.waitForFunction((t) => EB.game.time >= t, t0 + sec, { timeout: 120000 }); };
  const hide = (on) => ev((on) => { for (const id of ['clickToPlay', 'centerMsg']) { const e = document.getElementById(id); if (e) e.style.visibility = on ? 'hidden' : ''; } }, on);
  const shot = async (name) => { await hide(true); await page.screenshot({ path: SHOTS + name }); await hide(false); console.log('   shot', name); };
  const logText = () => ev(() => document.getElementById('chatLog').innerText);
  const clearLog = () => ev(() => { document.getElementById('chatLog').innerHTML = ''; });

  await page.goto(URL);
  await ev(() => localStorage.clear());
  step('create a Cleric/Necromancer');
  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Human")');
  await page.click('#classList button:has-text("Cleric")');
  await page.click('#classList2 button:has-text("Necromancer")');
  await page.fill('#nameInput', 'Multimuffin');
  await page.waitForTimeout(300);
  await shot('v9-class-pick.png');
  await page.click('#btnCreate');
  await inGame(); await page.waitForTimeout(800);
  const c1 = await ev(() => { const p = EB.game.player; return { cls: p.classes, label: p.classLabel, xpm: EB.multi.xpMult(p.classes), spells: p.spells.length } });
  check('created with two classes and a combined label', c1.cls.join() === 'cleric,necromancer' && /\//.test(c1.label), c1);
  check('dual class XP penalty is 10%', Math.abs(c1.xpm - 0.9) < 1e-9, c1.xpm);
  check('starts with level-1 spells from both classes', c1.spells >= 2, c1.spells);

  step('reach level 10 -> third class prompt');
  await ev(() => { const g = EB.game; g.spawnT = 1e9; while (g.player.level < 10) g.gainXP(1e5); });
  await page.waitForFunction(() => EB.game.windows.has('classWin'), null, { timeout: 15000 }).catch(() => {});
  const open = await ev(() => EB.game.windows.has('classWin') && document.querySelectorAll('#classBody [data-cls]').length);
  check('class pick window opens at level 10 with choices', open > 0, open);
  await shot('v9-third-class.png');
  await page.click('#classBody [data-cls="shaman"]');
  const c2 = await ev(() => { const p = EB.game.player; return { cls: p.classes, label: p.classLabel, open: EB.game.classSlotOpen() } });
  check('third class added (Cleric/Necro/Shaman), no 4th slot', c2.cls.length === 3 && c2.cls[2] === 'shaman' && !c2.open, c2);

  step('multiple pets');
  await ev(() => { const g = EB.game; while (g.player.level < 30) g.gainXP(1e7); g.player.hp = g.player.maxHp; });
  const pt = await ev(() => {
    const g = EB.game; g.summonPet(20, 'skel'); g.summonPet(18, 'wolf'); const n2 = g.pets().length; g.summonPet(30, 'wolf'); const n3 = g.pets().length;
    const types = g.pets().map((p) => p.petType); g.petCommand('follow'); g.cyclePetSel(); const sel = !!g.petSel; g.petCommand('guard', g.petSel);
    return { n2, n3, types, sel, modes: g.pets().map((p) => p.petMode) };
  });
  check('two pet types out at once; resummoning a type replaces it', pt.n2 === 2 && pt.n3 === 2 && pt.types.includes('skel') && pt.types.includes('wolf'), pt);
  check('pet selection + per-pet command', pt.sel && pt.modes.includes('guard') && pt.modes.includes('follow'), pt.modes);
  await ev(() => { EB.game.petSel = null; EB.game.openWin('petWin'); });
  await waitGame(1.5);
  const pw = await ev(() => document.querySelectorAll('#petBody button[data-psel]').length);
  check('pet window lists every pet', pw === 2, pw);
  await shot('v9-multi-pets.png');
  await ev(() => EB.game.closeWin('petWin'));

  step('Overachievement Points');
  const aa = await ev(() => {
    const g = EB.game, p = g.player; p.aaEarned = 40; p.hotbar[7] = null; const hp0 = p.maxHp;
    const ok = [g.buyAA('gym'), g.buyAA('second_wind'), g.buyAA('syn_zoo'), g.buyAA('petgym')];
    const hb = p.hotbar.includes('aa:second_wind'); p.hp = 10; g.useAAActive('second_wind'); const healed = p.hp > 10; const cd = !!p.cooldowns['aa:second_wind'];
    const syn = g.buyAA('syn_medicine'); // needs cleric+necro: we have it
    const fakeSyn = g.buyAA('syn_glass');
    return { ok, hb, healed, cd, syn, fakeSyn, spent: p.aaSpent, free: p.aaFree, sav: JSON.parse(localStorage.getItem(EB.SAVE_KEY)).char.aa };
  });
  check('buy passives, actives and synergies', aa.ok.every(Boolean) && aa.syn, aa);
  check('active goes on hotbar, heals and goes on cooldown', aa.hb && aa.healed && aa.cd, aa);
  check('OP saved locally', aa.sav && aa.sav.gym === 1 && aa.sav.second_wind === 1, aa.sav);
  const sl = await ev(() => { const g = EB.game, p = g.player; g.setAAPct(50); const x0 = p.aaXp, e0 = p.aaEarned, l0 = p.xp; g.gainXP(1000); return { d: p.aaXp - x0 + (p.aaEarned - e0) * 1e9 } });
  check('XP slider sends XP into OP', sl.d > 0, sl);
  await ev(() => { EB.game.aaTab = 'synergy'; EB.game.openWin('aaWin'); });
  await page.waitForTimeout(400);
  const nodes = await ev(() => document.querySelectorAll('#aaBody [data-tab]').length);
  check('OP window shows tree tabs', nodes >= 4, nodes);
  await ev(() => { EB.game.aaTab = 'general'; EB.game.renderAA(); });
  await shot('v9-aa-tree.png');
  const rs = await ev(() => { const g = EB.game, p = g.player; p.coins = 1e9; const ok = g.respecAA(); return { ok, spent: p.aaSpent, hb: p.hotbar.includes('aa:second_wind') } });
  check('respec refunds everything and clears active from hotbar', rs.ok && rs.spent === 0 && !rs.hb, rs);
  await ev(() => EB.game.closeWin('aaWin'));

  step('old v7 save migrates');
  await ev(() => {
    EB.game.save = () => {}; const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY));
    delete s.char.classes; delete s.char.aa; delete s.char.aaXp; delete s.char.aaEarned; delete s.char.aaPct; s.char.cls = 'warrior'; s.char.level = 12;
    s.mercs = []; localStorage.setItem(EB.SAVE_KEY, JSON.stringify(s));
  });
  await page.reload();
  await page.click('#btnContinue');
  await inGame(); await page.waitForTimeout(600);
  const ol = await ev(() => { const p = EB.game.player; return { cls: p.classes, open: EB.game.classSlotOpen(), free: p.aaFree, hp: p.maxHp } });
  check('old save loads as one class, can add more, no OP', ol.cls.join() === 'warrior' && ol.open && ol.free === 0 && ol.hp > 0, ol);

  check('no page errors', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  const f = results.filter((r) => !r.ok); console.log(`\n${results.length - f.length}/${results.length} passed`); process.exit(f.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
