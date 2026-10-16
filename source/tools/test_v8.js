// Everblock v8 headless test: gear pass - quality tiers, procs, click effects, focus effects, set bonuses,
// suffix affixes (incl. old-save compatibility), weapon glow / trails and legendary aura.
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

  step('create a warrior');
  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Barbarian")');
  await page.click('#classList button:has-text("Warrior")');
  await page.fill('#nameInput', 'Gearhilda');
  await page.click('#btnCreate');
  await inGame(); await page.waitForTimeout(800);
  await ev(() => { const g = EB.game; g.spawnT = 1e9; for (let i = 0; i < 40; i++) g.gainXP(5e8); g.player.hp = g.player.maxHp; });

  step('data');
  const d = await ev(() => {
    const D = EB.data, G = EB.gear, ids = Object.keys(D.ITEMS);
    const by = (f) => ids.filter((i) => D.ITEMS[i][f]).length;
    return { n: ids.length, allQ: ids.every((i) => G.QUALITY[D.ITEMS[i].q]), q: G.QORDER.map((q) => ids.filter((i) => D.ITEMS[i].q === q).length), procs: by('proc'), clicks: by('click'), focus: by('focus'), sets: Object.keys(G.SETS).length,
      old: ['rusty_dagger', 'grimbone_blade', 'caldera_signet', 'pyrrhax_heart', 'bazaar_helm'].every((i) => D.ITEMS[i]), newLoot: !!D.MOBS.pyrrhax.loot.find((l) => l[0] === 'everflame') };
  });
  check('159 items (151 + 8 new), all with a quality tier, old ids intact', d.n === 159 && d.allQ && d.old, d);
  check('all five quality tiers in use', d.q.every((n) => n > 0), d.q);
  check('procs / clickies / focus / 4 sets assigned', d.procs >= 10 && d.clicks >= 8 && d.focus >= 10 && d.sets === 4, d);
  check('new items wired into boss loot tables', d.newLoot);

  step('affix rolls + effective stats');
  const af = await ev(() => {
    const G = EB.gear; let n = 0, k = 0; for (let i = 0; i < 2000; i++) { const o = G.rollDrop('bronze_long_sword'); if (o.sfx) n++; if (G.rollDrop('bone_chips').sfx) k++; }
    const inst = { id: 'bronze_long_sword', sfx: 'bear' }, dd = G.def(inst);
    return { rate: n / 2000, junk: k, name: dd.name, str: dd.stats.STR, base: EB.data.ITEMS.bronze_long_sword.stats.STR, q: G.quality(inst), plainQ: G.quality('bronze_long_sword'), oldSafe: G.def({ id: 'bronze_long_sword' }) === EB.data.ITEMS.bronze_long_sword, bogus: G.def({ id: 'bronze_long_sword', sfx: 'nope' }) === EB.data.ITEMS.bronze_long_sword };
  });
  check('~25% of equipment drops roll a suffix; non-equipment never does', af.rate > 0.18 && af.rate < 0.33 && af.junk === 0, af);
  check("affixed item gets name suffix, bonus stats and quality bump", /of the Bear/.test(af.name) && af.str > af.base && af.q === 'uncommon' && af.plainQ === 'common', af);
  check('items without sfx (old saves) or with an unknown sfx resolve to the plain item', af.oldSafe && af.bogus, af);

  step('loot an affixed drop');
  await clearLog();
  const lt = await ev(() => {
    const g = EB.game, p = g.player, m = new EB.ent.Mob('rat', null, p.pos.x + 2, p.pos.y, p.pos.z, [1, 1]); g.mobs.push(m); m.addTo(g.scene);
    m.grpDamage = m.maxHp; m.hp = 0; g.killMob(m, p);
    m.loot.items = [{ id: 'everflame', count: 1, sfx: 'falcon' }]; g.openLoot(m);
    const html = document.getElementById('lootGrid').innerHTML;
    g.takeLoot(0); const it = p.inv.find((x) => x && x.id === 'everflame');
    return { html: /q-legendary/.test(html), inv: it, log: document.getElementById('chatLog').innerHTML.slice(-600) };
  });
  check('loot window shows quality border; looted item keeps its suffix', lt.html && lt.inv && lt.inv.sfx === 'falcon', lt.inv);
  check('loot message colored by quality with full affixed name', /ff9a1f/.test(lt.log) && /Everflame.*Falcon Punch/.test(lt.log), lt.log.slice(-200));

  step('equip + stats + save round trip');
  const eq = await ev(() => {
    const g = EB.game, p = g.player, before = p.stats().STR;
    g.useBagItem(p.inv.findIndex((x) => x && x.id === 'everflame'));
    for (const id of ['bazaar_helm', 'bazaar_breastplate', 'bazaar_gauntlets', 'bazaar_greaves', 'molten_plate']) g.addItem(id, 1, true);
    for (const id of ['bazaar_helm', 'bazaar_gauntlets', 'bazaar_greaves', 'bazaar_breastplate']) g.useBagItem(p.inv.findIndex((x) => x && x.id === id));
    const T = p.gear();
    return { eq: p.equip.primary, str: p.stats().STR - before, set: T.sets.find((s) => s.id === 'bazaar'), dmgPct: T.dmgPct };
  });
  check('equipped weapon keeps sfx; affix + item STR applied', eq.eq.sfx === 'falcon' && eq.str >= 15 + 9, eq);
  check('Bargain-Bin Battlegear 4/7: both bonuses active', eq.set && eq.set.n === 4 && eq.set.active.join() === '2,4' && eq.dmgPct === 5, eq);
  await ev(() => EB.game.save());
  const sv = await ev(() => { const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY)); return { prim: s.char.equip.primary, inv: s.char.inv.filter(Boolean).map((x) => x.id) }; });
  check('save stores sfx with the item instance', sv.prim.sfx === 'falcon', sv);

  step('old v7 save loads');
  const old = await ev(() => {
    EB.game.save = () => {}; window.onbeforeunload = null;
    const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY));
    s.char.equip = { primary: { id: 'grimbone_blade' }, chest: { id: 'bazaar_breastplate' }, head: { id: 'bazaar_helm' }, hands: { id: 'bazaar_gauntlets' }, legs: { id: 'bazaar_greaves' }, feet: { id: 'bazaar_boots' }, back: { id: 'bazaar_cloak' } };
    s.char.inv = s.char.inv.map((x) => (x ? { id: x.id, count: x.count } : null)); s.char.inv[s.char.inv.indexOf(null)] = { id: 'everflame', count: 1, sfx: 'falcon' };
    s.char.hotbar = s.char.hotbar.slice(0, 8);
    localStorage.setItem(EB.SAVE_KEY, JSON.stringify(s)); return true;
  });
  await page.reload();
  await page.click('#btnContinue');
  await inGame(); await page.waitForTimeout(600);
  const ol = await ev(() => { const p = EB.game.player; return { w: p.weapon().name, proc: p.weapon().proc, hp: p.maxHp, inv: p.inv.filter(Boolean).length, stats: p.stats().STR }; });
  check('v7-style save (no sfx fields) loads; old rare weapon now has its proc', ol.w === "Grimbone's Soulblade" && ol.proc === 'soul_siphon' && ol.hp > 0, ol);

  step('procs');
  await ev(() => { const g = EB.game, p = g.player; g.spawnT = 1e9; p.maxHp; p.hp = 9e5; const it = p.inv.findIndex((x) => x && x.id === 'everflame'); g.useBagItem(it); g.useBagItem(p.inv.findIndex((x) => x && x.id === 'molten_plate')); });
  await clearLog();
  const pr = await ev(() => {
    const g = EB.game, p = g.player, w = g.world;
    const x = p.pos.x, z = p.pos.z + 2.2;
    const mk = (t) => { const m = new EB.ent.Mob(t, null, x, w.surfaceY(x, z), z, [30, 30]); g.mobs.push(m); m.addTo(g.scene); m.home.copy(m.pos); m.maxHp = m.hp = 1e6; return m; };
    const m = mk('magma_giant'); window.__m = m;
    p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
    g.target = m; const r = Math.random; Math.random = () => 0.01; const hp0 = m.hp, hit = g.tryProc(m, p.weapon()); Math.random = r;
    return { hit, dmg: hp0 - m.hp, dots: (m.dots || []).map((d) => d.name), last: g.lastProc };
  });
  check('Everflame proc fires: direct damage + burn DoT', pr.hit && pr.dmg >= 140 && pr.dots.includes('Everburn'), pr);
  const chain = await ev(() => {
    const g = EB.game, p = g.player, w = g.world, out = {};
    const mk = (dx) => { const x = p.pos.x + dx, z = p.pos.z + 3; const m = new EB.ent.Mob('salamander', null, x, w.surfaceY(x, z), z, [30, 30]); g.mobs.push(m); m.addTo(g.scene); m.maxHp = m.hp = 1e5; m.addHate(p, 5); return m; };
    const a = mk(-1.5), b = mk(1.5), c = mk(4);
    const r = Math.random; Math.random = () => 0.01;
    g.tryProc(a, Object.assign({}, EB.data.ITEMS.zap_rod)); out.chain = [a, b, c].map((m) => 1e5 - m.hp);
    g.tryProc(a, Object.assign({}, EB.data.ITEMS.frost_greatsword)); out.slowed = a.slowedUntil > g.time;
    const h0 = p.hp = 100; g.tryProc(a, Object.assign({}, EB.data.ITEMS.borrowed_dagger)); out.tap = p.hp - h0;
    Math.random = r;
    out.rate = EB.gear.procChance('everburn', 2.8);
    for (const m of [a, b, c]) { m.hp = 0; m.alive = false; g.removeEntity(m); }
    p.hp = 9e5; return out;
  });
  check('lightning proc chains to nearby foes fighting you', chain.chain.filter((v) => v > 0).length >= 2, chain.chain);
  check('frost proc slows; lifetap proc heals', chain.slowed && chain.tap > 0, chain);
  check('proc chance scales with weapon delay (PPM)', chain.rate > 0.1 && chain.rate < 0.3, chain.rate);
  const melee = await ev(async () => {
    const g = EB.game, p = g.player, m = window.__m; let procs = 0; const r = Math.random;
    for (let i = 0; i < 200; i++) { p.swing = 0; p.autoAttack = true; g.target = m; const lp = g.lastProc; g.playerMelee(0.01); if (g.lastProc !== lp) procs++; g.lastProc = null; }
    p.autoAttack = false; return procs;
  });
  check('procs trigger from real melee swings', melee > 5 && melee < 120, melee);

  step('screens: glowing weapon + legendary aura + proc');
  await ev(() => { const g = EB.game; g.dayT = 0.85; });
  const camAt = async (file, off, look, fn, wait) => {
    await ev(([off, look]) => { const g = EB.game, p = g.player; g.camOverride = { pos: new THREE.Vector3(p.pos.x + off[0], p.pos.y + off[1], p.pos.z + off[2]), look: new THREE.Vector3(p.pos.x + look[0], p.pos.y + look[1], p.pos.z + look[2]) }; }, [off, look]);
    if (fn) await ev(fn);
    await waitGame(wait || 0.6); await shot(file);
  };
  await ev(() => { const g = EB.game; g.target = window.__m; g.player.autoAttack = true; window.__keepSwing = setInterval(() => { g.pAttackAnim = g.pAttackAnim || 0.01; }, 120); });
  await camAt('v8-glowing-weapon.png', [2.6, 1.8, -1.2], [0, 1.2, 0.6]);
  await ev(() => { clearInterval(window.__keepSwing); EB.game.player.autoAttack = false; });
  await waitGame(1);
  await ev(() => { const g = EB.game, p = g.player; window.__m.model.group.visible = false; window.__m.pos.y -= 50; g.target = null; p.equip.back && (window.__back = p.equip.back); delete p.equip.back; });
  await camAt('v8-legendary-aura.png', [0.4, 1.7, 3.2], [0, 1.0, 0], () => { EB.game.player.yaw = 0; });
  await ev(() => { const g = EB.game, p = g.player; window.__m.model.group.visible = true; window.__m.pos.y += 50; g.target = window.__m; if (window.__back) p.equip.back = window.__back; });
  const aura = await ev(() => EB.game.player.gear().legendaryArmor);
  check('legendary armor (Molten Heartplate) flags the aura', aura);
  const pc = await ev(() => { const g = EB.game, p0 = g.player, mm = window.__m; mm.model.group.visible = true; mm.pos.set(p0.pos.x, g.world.surfaceY(p0.pos.x, p0.pos.z + 2.6), p0.pos.z + 2.6); mm.alive = true; g.player.yaw = Math.atan2(window.__m.pos.x - g.player.pos.x, window.__m.pos.z - g.player.pos.z); const r = Math.random; Math.random = () => 0.01; g.tryProc(window.__m, g.player.weapon()); Math.random = r; return EB.fx.n; });
  await camAt('v8-proc.png', [4.2, 2.6, 0.2], [0, 1.6, 2.0], () => { const g = EB.game, r = Math.random; Math.random = () => 0.01; g.tryProc(window.__m, g.player.weapon()); Math.random = r; }, 0.18);
  check('proc spawns particles', pc > 20, pc);
  await ev(() => { EB.game.camOverride = null; });

  step('tooltip with quality + set bonus');
  const tip = await ev(() => {
    const g = EB.game; g.openWin('invWin'); g.renderInv();
    const sl = [...document.querySelectorAll('#equipGrid .islot')].find((e) => /Squeaky Greaves/.test(e.textContent));
    sl.dispatchEvent(new MouseEvent('mouseenter', { clientX: 300, clientY: 140, bubbles: true }));
    const t = document.getElementById('tooltip'); return { html: t.innerHTML, vis: !t.classList.contains('hidden'), cls: sl.className, legend: !!document.querySelector('#equipGrid .islot.q-legendary') };
  });
  check('tooltip: quality label + set list + active set bonuses', tip.vis && /Uncommon/.test(tip.html) && /Bargain-Bin Battlegear \(5\/7\)/.test(tip.html) && /\(4\) Set:/.test(tip.html), tip.html.slice(0, 200));
  check('inventory borders colored by quality', /q-uncommon/.test(tip.cls) && tip.legend, tip.cls);
  await shot('v8-tooltip.png');
  const wtip = await ev(() => EB.ui.itemTip(EB.game.player.equip.primary));
  check('weapon tooltip shows legendary, suffix and combat effect', /Legendary/.test(wtip) && /Suffix/.test(wtip) && /Combat Effect: Everburn/.test(wtip));
  await ev(() => { EB.game.closeWin('invWin'); document.getElementById('tooltip').classList.add('hidden'); });

  step('click effects + focus');
  await clearLog();
  const ck = await ev(() => {
    const g = EB.game, p = g.player, out = {};
    g.addItem('haste_gloves', 1, true); g.useBagItem(p.inv.findIndex((x) => x && x.id === 'haste_gloves'));
    out.onBar = p.hotbar.includes('click:haste_gloves');
    const slot = p.hotbar.indexOf('click:haste_gloves'); g.hotkey(slot);
    out.buff = p.buffs.some((b) => b.id === 'click:haste_gloves');
    const w = p.weapon(), st = p.stats(); p.swing = 0; p.autoAttack = true; g.target = window.__m; g.playerMelee(0.001); out.swing = p.swing; p.autoAttack = false;
    out.cd = g.useClick('haste_gloves') === false;
    g.addItem('pocket_hearth', 1, true); p.bind = { zone: g.world.zoneId, x: p.pos.x + 30, y: p.pos.y, z: p.pos.z };
    const x0 = p.pos.x; g.useBagItem(p.inv.findIndex((x) => x && x.id === 'pocket_hearth')); out.port = Math.round(p.pos.x - x0);
    p.hp = 10; g.addItem('ankh_amulet', 1, true); g.useBagItem(p.inv.findIndex((x) => x && x.id === 'ankh_amulet'));
    const hb = [...document.querySelectorAll('#hotbar .slot.clicky')]; out.btns = hb.length;
    hb.find((e) => /Band-Aid/.test(e.textContent)).click(); out.heal = p.hp;
    g.openWin('invWin'); g.renderInv(); out.zap = document.querySelectorAll('#equipGrid .clickBtn').length; g.closeWin('invWin');
    return out;
  });
  check('equipping a clicky adds it to the hotbar', ck.onBar && ck.btns >= 2, ck);
  check('haste clicky: buff applied and swing delay shortened', ck.buff && ck.swing < 2.8 * 0.75, ck);
  check('clicky cooldown enforced', ck.cd, ck);
  check('bag clicky (Pocket Hearthrock) ports to bind', ck.port === 30, ck);
  check('heal clicky from hotbar button heals; inventory shows activate buttons', ck.heal >= 300 && ck.zap >= 2, ck);
  const fc = await ev(() => {
    const g = EB.game, p = g.player, sp = { mana: 100, cast: 3 };
    const before = g.manaCost(sp);
    g.addItem('kindleton_mantle', 1, true); g.useBagItem(p.inv.findIndex((x) => x && x.id === 'kindleton_mantle'));
    const ms = p.focus('manaSave'), after = g.manaCost(sp);
    return { before, after, ms };
  });
  check('focus: mana cost reduction applies', fc.before === 100 && fc.after === 85 && fc.ms === 15, fc);

  step('phone mode: hotbar clicky tap');
  const ph = await ev(() => { const g = EB.game, p = g.player; p.cooldowns = {}; const el = [...document.querySelectorAll('#hotbar .slot.clicky')][0]; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return Object.keys(p.cooldowns).filter((k) => /^click:/.test(k)).length; });
  check('hotbar clicky works from a tap/click', ph >= 1, ph);

  check('no JS errors', errors.length === 0, errors.slice(0, 5));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
