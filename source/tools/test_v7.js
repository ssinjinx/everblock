// Everblock v7 headless test: level cap 40, spells 26-40, the Soggybottom Mire + Cinderpeak Caldera,
// town portals to the Bizarre Bazaar (trainers, vendors, bank, safe zone).
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
  const clean = (hud) => ev((hud) => { if (hud) document.getElementById('hud').style.visibility = 'hidden'; for (const id of ['clickToPlay', 'centerMsg']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } }, hud);
  const unclean = () => ev(() => { document.getElementById('hud').style.visibility = ''; for (const id of ['clickToPlay', 'centerMsg']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; } });
  const shot = async (name, hud) => { await clean(hud); await page.screenshot({ path: SHOTS + name }); if (hud) await unclean(); console.log('   shot', name); };
  const logText = () => ev(() => document.getElementById('chatLog').innerText);
  const clearLog = () => ev(() => { document.getElementById('chatLog').innerHTML = ''; });


  const moods = [];
  const enterWorld = async () => { await inGame(); await page.waitForTimeout(1000); await ev(() => { const g = EB.game; g.player.maxHp = g.player.hp = 9e5; g.spawnT = 1e9; const sm = EB.audio.setMood; EB.audio.setMood = (m) => { (window._moods = window._moods || []).push(m); return sm(m); }; }); };
  step('create a wizard');
  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Human")');
  await page.click('#classList button:has-text("Wizard")');
  await page.fill('#nameInput', 'Portalina');
  await page.click('#btnCreate');
  await enterWorld();

  step('level cap 40 + spells');
  const data = await ev(() => {
    const D = EB.data, per = {};
    for (const c of Object.keys(D.CLASSES)) { const l = Object.values(D.SPELLS).map((s) => s.classes[c]).filter((v) => v); per[c] = { max: Math.max(...l), hi: l.filter((v) => v >= 26).length }; }
    const mobs = ['bog_croc', 'gnashjaw', 'froglodyte', 'frog_priest', 'ribbitus', 'swamp_wisp', 'bog_troll', 'drowned_zealot', 'soggs', 'glubb', 'cinder_hound', 'scorchmaw', 'ember_sprite', 'salamander', 'obsidian_golem', 'magma_giant', 'ash_zealot', 'ash_pyro', 'kindleton', 'brasskull', 'pyrrhax'];
    let built = 0; for (const m of mobs) { try { const o = EB.models.buildModel({ type: m }); if (o) { built++; EB.models.dispose && EB.models.dispose(o); } } catch (e) { console.error(e); } }
    return { cap: D.MAX_LEVEL, per, mobs: mobs.every((m) => D.MOBS[m]), built, n: mobs.length, pets: !!(D.PETS[28] && D.PETS[33] && D.PETS[38]), curve: [25, 30, 39].map((l) => D.xpToNext(l)), boss: [D.MOBS.glubb.lvl[0], D.MOBS.pyrrhax.lvl[0]] };
  });
  check('MAX_LEVEL is 40', data.cap === 40, data.cap);
  check('XP curve keeps climbing past 25', data.curve[0] < data.curve[1] && data.curve[1] < data.curve[2], data.curve);
  check('every class gets at least 4 new abilities in 26-40 reaching 37+', Object.values(data.per).every((p) => p.hi >= 4 && p.max >= 37), data.per);
  check('21 new Mire/Caldera monsters defined and modelled; necro pets at 28/33/38', data.mobs && data.built === data.n && data.pets, data);
  check('bosses: Glubb ~32 and Pyrrhax 40', data.boss[0] >= 30 && data.boss[1] === 40, data.boss);
  const lv = await ev(() => { const g = EB.game, p = g.player; p.xp = 0; for (let i = 0; i < 60; i++) g.gainXP(5e8); return { lvl: p.level, xp: p.xp }; });
  check('XP gain stops at level 40', lv.lvl === 40, lv);

  const zoneVia = async (to, fn) => { await ev(fn); await page.waitForFunction((to) => EB.game.world.zoneId === to && !EB.game.zoning, to, { timeout: 30000 }); };
  const info = () => ev(() => { const g = EB.game; return { id: g.world.zoneId, name: g.world.zoneName, lines: g.world.zoneLines.map((z) => z.to), portals: g.world.zoneLines.filter((z) => z.portal).map((z) => z.to), npcs: g.npcs.map((n) => n.name), types: [...new Set(g.mobs.map((m) => m.type))], pos: [g.player.pos.x, g.player.pos.y, g.player.pos.z].map((v) => +v.toFixed(1)), lanterns: g.world.lanterns ? g.world.lanterns.size : 0, mood: (window._moods || []).slice(-1)[0] }; });
  const cam = async (file, p, l, hud) => { await ev(([p, l]) => { EB.game.camOverride = { pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l) }; }, [p, l]); await waitGame(1.2); await shot(file, hud); await ev(() => { EB.game.camOverride = null; }); };

  step('desert -> Mire and Caldera');
  await zoneVia('desert', () => EB.game.loadZone('desert', null));
  const d = await info();
  check('desert has zone lines west to the Mire and east to the Caldera', d.lines.includes('swamp') && d.lines.includes('caldera'), d.lines);
  await zoneVia('swamp', () => { const g = EB.game; g.changeZone(g.world.zoneLines.find((z) => z.to === 'swamp')); });
  await waitGame(1);
  const sw = await info();
  check('arrive in The Soggybottom Mire', sw.name === 'The Soggybottom Mire' && sw.lines.includes('desert') && sw.portals.includes('bazaar'), sw);
  check('Mirewatch Landing NPCs (quest givers present)', ['Warden Marisol', 'Hedge-Witch Grizelda'].every((n) => sw.npcs.includes(n)), sw.npcs);
  check('Mire monsters incl. Glubb spawn', ['bog_croc', 'froglodyte', 'bog_troll', 'glubb'].every((t) => sw.types.includes(t)), sw.types);
  check('Mire music mood', sw.mood === 'swamp' || sw.mood === 'bog', sw.mood);
  const g1 = await ev(() => { const g = EB.game, m = g.mobs.find((m) => m.type === 'glubb'); return m && [m.pos.x, m.pos.y, m.pos.z]; });
  await ev(() => { EB.game.dayT = 0.4; });
  const sy = await ev(() => { const w = EB.game.world, p = EB.game.player; return w.surfaceY(p.pos.x, p.pos.z); });
  await cam('v7-swamp.png', [sw.pos[0] - 18, sy + 12, sw.pos[2] + 10], [sw.pos[0] - 40, sy, sw.pos[2]], true);
  if (g1) { await ev((g1) => { const g = EB.game; g.player.pos.set(g1[0] + 4, g1[1], g1[2] + 4); g.world.updateChunks(g1[0], g1[2], 3, 999); g.setLights && g.setLights(true); }, g1); await waitGame(1); const dz = await info(); check('Sunken Temple of Glubb dungeon name + swamp-temple mood', /Glubb/.test(await ev(() => EB.game.lastZone || '')) || dz.mood === 'bog', { lz: await ev(() => EB.game.lastZone), mood: dz.mood }); await cam('v7-boss-glubb.png', [g1[0] + 5, g1[1] + 3, g1[2] + 5], [g1[0], g1[1] + 1.5, g1[2]], true); }

  await zoneVia('desert', () => { const g = EB.game; g.changeZone(g.world.zoneLines.find((z) => z.to === 'desert')); });
  await zoneVia('caldera', () => { const g = EB.game; g.changeZone(g.world.zoneLines.find((z) => z.to === 'caldera')); });
  await waitGame(1);
  const cd = await info();
  check('arrive in The Cinderpeak Caldera', cd.name === 'The Cinderpeak Caldera' && cd.lines.includes('desert') && cd.portals.includes('bazaar'), cd);
  check('Ashguard Camp quest givers', ['Captain Emberly', 'Sage Cindral'].every((n) => cd.npcs.includes(n)), cd.npcs);
  check('Caldera monsters incl. Pyrrhax spawn', ['cinder_hound', 'salamander', 'obsidian_golem', 'magma_giant', 'pyrrhax'].every((t) => cd.types.includes(t)), cd.types);
  check('Caldera music mood', cd.mood === 'volcano' || cd.mood === 'forge', cd.mood);
  const cy = await ev(() => { const w = EB.game.world, p = EB.game.player; return w.surfaceY(p.pos.x, p.pos.z); });
  await cam('v7-caldera.png', [cd.pos[0] + 30, cy + 22, cd.pos[2] + 14], [172, cy + 4, 128], true);
  const p1 = await ev(() => { const g = EB.game, m = g.mobs.find((m) => m.type === 'pyrrhax'); return m && [m.pos.x, m.pos.y, m.pos.z]; });
  if (p1) { await ev((p1) => { const g = EB.game; g.player.pos.set(p1[0] + 5, p1[1], p1[2] + 5); g.world.updateChunks(p1[0], p1[2], 3, 999); }, p1); await waitGame(1); await cam('v7-boss-pyrrhax.png', [p1[0] + 6, p1[1] + 4, p1[2] + 6], [p1[0], p1[1] + 2, p1[2]], true); }
  const qs = await ev(() => ['frog_legs', 'bloated_idol', 'cult_pins', 'unquenched'].every((q) => EB.data.QUESTS[q]));
  check('two quests per new zone defined', qs);

  step('portals: every town -> Bazaar and back');
  const towns = ['everblock', 'frostfang', 'desert', 'swamp', 'caldera'];
  for (const [i, town] of towns.entries()) {
    await ev((town) => EB.game.loadZone(town, null), town);
    const P = await ev(() => { const z = EB.game.world.zoneLines.find((z) => z.portal && z.to === 'bazaar'); return z && { x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2, y: z.y }; });
    check(`${town} has a glowing portal to the Bazaar`, !!P, P);
    if (!P) continue;
    if (i % 2 === 0) { await ev((P) => { const p = EB.game.player; p.pos.set(P.x, P.y, P.z); }, P); }
    else { await ev((P) => { const p = EB.game.player; p.pos.set(P.x, P.y, P.z + 2); }, P); await ev(() => EB.game.interact()); }
    await page.waitForFunction(() => EB.game.world.zoneId === 'bazaar' && !EB.game.zoning, null, { timeout: 30000 });
    const bz = await info();
    check(`${town} portal (${i % 2 ? 'press E' : 'walk in'}) -> The Bizarre Bazaar`, bz.name === 'The Bizarre Bazaar', bz.pos);
    if (i === 0) await shot('v7-portal.png');
    await waitGame(0.6);
    const back = await ev((town) => { const z = EB.game.world.zoneLines.find((z) => z.portal && z.to === town); return z && { x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2, y: z.y }; }, town);
    await ev((P) => { EB.game.player.pos.set(P.x, P.y, P.z); }, back);
    await page.waitForFunction((t) => EB.game.world.zoneId === t && !EB.game.zoning, town, { timeout: 30000 });
    await waitGame(0.8);
    check(`Bazaar return portal -> ${town} (and does not bounce back)`, (await ev(() => EB.game.world.zoneId)) === town);
  }

  step('Bazaar services');
  await ev(() => EB.game.loadZone('bazaar', null)); await waitGame(1);
  const bzi = await info();
  check('Bazaar: no monsters, safe zone, bazaar music', bzi.types.length === 0 && bzi.mood === 'bazaar', bzi);
  check('Bazaar NPCs: 9 trainers, 4 vendors, banker, soulbinder, merc agent', ['Coach Brawnhilda', 'Brother Fixwell', 'Magus Kablooey', 'Shady Pete', 'Robin Hoodie', 'Sir Polishington', 'Grandmother Howl', 'Mortimer Gloom', 'Madame Swirl', 'Blade Barker Bo', 'Clanky Sue', 'Snackmonger Pim', 'Honest Abe', 'Vaultkeeper Coinsworth', 'Soul-Notary Bartleby', 'Sellsword Agent Rook'].every((n) => bzi.npcs.includes(n)), bzi.npcs);
  check('Bazaar has return portals to all five towns', towns.every((t) => bzi.portals.includes(t)), bzi.portals);
  const talk = (name) => ev((name) => { const g = EB.game, n = g.npcs.find((n) => n.name === name); g.player.pos.set(n.pos.x, n.pos.y, n.pos.z + 1.6); g.setTarget(n); g.interact(); return [...g.windows]; }, name);
  await clearLog();
  const wrong = await talk('Coach Brawnhilda'); await page.waitForTimeout(700);
  check('wrong-class trainer refuses to train a wizard', !wrong.includes('trainerWin') /* v9: may offer the multiclass pick instead */ && (await logText()).includes('Coach Brawnhilda'), wrong);
  const tr = await talk('Magus Kablooey');
  const tres = await ev(() => { const g = EB.game, p = g.player; p.coins = 1e8; const id = Object.keys(EB.data.SPELLS).find((s) => EB.data.SPELLS[s].classes.wizard === 38); const had = p.spells.includes(id); g.train(id); return { had, has: p.spells.includes(id), title: document.getElementById('trainerWin').innerText.includes('Kablooey') }; });
  check('wizard trainer opens and teaches a level-38 spell', tr.includes('trainerWin') && !tres.had && tres.has, { tr, tres });
  await ev(() => EB.game.closeAll ? EB.game.closeAll() : null);
  const ms = await talk('Blade Barker Bo');
  const trade = await ev(() => { const g = EB.game, p = g.player; const c0 = p.coins; g.buyItem('expert_blade' in EB.data.ITEMS ? 'expert_blade' : Object.keys(EB.data.ITEMS).find((k) => /expert_/.test(k))); const c1 = p.coins; const i = p.inv.findIndex((s) => s && /expert_|journeyman_/.test(s.id)); g.sellItem(i); return { bought: c1 < c0, sold: p.coins > c1 && !p.inv.some((s) => s && /expert_/.test(s.id)) }; });
  check('Bazaar weapon vendor: buy then sell', ms.includes('merchantWin') && trade.bought && trade.sold, trade);
  const ab = await talk('Honest Abe'); check('general buyer opens', ab.includes('merchantWin'));
  const bk = await talk('Vaultkeeper Coinsworth');
  const bank = await ev(() => { const g = EB.game, p = g.player; g.addItem('grand_potion', 3); const i = p.inv.findIndex((s) => s && s.id === 'grand_potion'); const ok = g.bankDeposit(i); p.coins = 5000; g.bankCoin(true); return { ok, inBank: p.bank.some((s) => s && s.id === 'grand_potion' && s.count >= 3), bc: p.bankCoins, coins: p.coins, title: document.getElementById('bankWin').innerText.includes('Coinsworth') }; });
  check('banker opens the vault; deposit item + coin', bk.includes('bankWin') && bank.ok && bank.inBank && bank.bc === 5000 && bank.coins === 0 && bank.title, bank);
  await ev(() => { EB.game.dayT = 0.75; });
  await cam('v7-bazaar.png', [128, 34, 140], [128, 24, 108], true);
  const blocked = await ev(() => { const g = EB.game; return g.noBuildHere(); });
  check('digging/building is blocked in the Bazaar', blocked === true);

  step('vault persists across reload');
  await ev(() => { EB.game.save(true); });
  await page.reload();
  await page.click('#btnContinue');
  await enterWorld();
  const pb = await ev(() => { const g = EB.game, p = g.player; return { zone: g.world.zoneId, bank: p.bank.filter((s) => s).map((s) => s.id), bc: p.bankCoins, len: p.bank.length }; });
  check('solo vault persisted (48 slots, item + coin)', pb.len === 48 && pb.bank.includes('grand_potion') && pb.bc === 5000, pb);
  const wd = await ev(() => { const g = EB.game, p = g.player; const i = p.bank.findIndex((s) => s && s.id === 'grand_potion'); g.bankWithdraw(i); g.bankCoin(false); return { inv: p.inv.some((s) => s && s.id === 'grand_potion'), coins: p.coins }; });
  check('withdraw item + coin', wd.inv && wd.coins === 5000, wd);

  await page.waitForTimeout(500);
  check('no JS errors', errors.length === 0, errors.slice(0, 5));
  await browser.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
