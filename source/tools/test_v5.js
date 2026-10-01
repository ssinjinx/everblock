// Everblock v5 headless test: the Sunscorched Expanse (desert zone, pyramid + tomb), EQ faction standing,
// pet commands, smarter mob AI (heal/buff allies, flee + bring friends, rare named), level cap 25 and new spells.
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

  step('create a paladin');
  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Human")');
  await page.click('#classList button:has-text("Paladin")');
  await page.fill('#nameInput', 'Sunblade');
  await page.click('#btnCreate');
  await inGame();
  await page.waitForTimeout(1200);
  await ev(() => { const g = EB.game; g.save = () => {}; g.player.level = 20; g.player.maxHp = g.player.hp = 5000; });

  // ---------------------------------------------------------------- data: cap + spells
  step('level cap 25 and new spells');
  const data = await ev(() => {
    const D = EB.data, per = {};
    for (const c of Object.keys(D.CLASSES)) { const l = Object.values(D.SPELLS).map((s) => s.classes[c]).filter((v) => v); per[c] = { max: Math.max(...l), hi: l.filter((v) => v >= 16).length }; }
    const newMobs = ['sand_scorpion', 'szyrix', 'bandit', 'bandit_mystic', 'rahzik', 'mummy', 'tomb_priest', 'sethek', 'sand_giant', 'gorukh', 'dust_djinn', 'ankhetra'];
    return { cap: D.MAX_LEVEL, per, mobs: newMobs.every((m) => D.MOBS[m]), pets: !!(D.PETS[18] && D.PETS[23]), xp25: D.xpToNext(24) > D.xpToNext(20) };
  });
  check('MAX_LEVEL is 25', data.cap === 25);
  check('every class gets new abilities in the 16-25 range (and some reach 21+)', Object.values(data.per).every((p) => p.hi >= 2 && p.max >= 21), data.per);
  check('12 new desert/tomb monsters and level 18/23 necro pets defined', data.mobs && data.pets);
  const lv = await ev(() => { const g = EB.game, p = g.player; p.xp = 0; for (let i = 0; i < 30; i++) g.gainXP(5e7); return { lvl: p.level, xp: p.xp }; });
  check('XP gain stops at level 25', lv.lvl === 25, lv);
  await ev(() => { const p = EB.game.player; p.level = 22; p.maxHp = p.hp = 5000; p.xp = 0; });

  // ---------------------------------------------------------------- zone
  step('zone lines + desert zone');
  const ff = await ev(() => { const g = EB.game; g.loadZone('frostfang', { x: 128.5, z: 20.5, yaw: Math.PI }); return g.world.zoneLines.map((z) => z.to); });
  check('Frostfang Highlands has a zone line north to the desert', ff.includes('desert'), ff);
  await ev(() => { const g = EB.game; g.changeZone(g.world.zoneLines.find((z) => z.to === 'desert')); });
  await page.waitForFunction(() => EB.game.world.zoneId === 'desert' && !EB.game.zoning, null, { timeout: 30000 });
  const dz = await ev(() => { const g = EB.game; return { name: g.world.zoneName, lines: g.world.zoneLines.map((z) => z.to), npcs: g.npcs.map((n) => n.name), types: [...new Set(g.mobs.map((m) => m.type))], pos: [g.player.pos.x, g.player.pos.z].map((v) => +v.toFixed(1)), lanterns: g.world.lanterns ? g.world.lanterns.size : 0 }; });
  check('zoning from Frostfang arrives in The Sunscorched Expanse', dz.name === 'The Sunscorched Expanse' && dz.lines.includes('frostfang'), dz);
  check('Sunward Outpost NPCs present (merchant, fence, binder, quest givers)', ['Trader Hamid', 'Fence Jabari', 'Sunpriestess Nefa', 'Caravan Master Idris', 'Captain Asha', 'Loremaster Kheti'].every((n) => dz.npcs.includes(n)), dz.npcs);
  check('desert + tomb monsters spawn', ['sand_scorpion', 'bandit', 'mummy', 'tomb_priest', 'sand_giant', 'dust_djinn', 'ankhetra', 'sethek'].every((t) => dz.types.includes(t)), dz.types);
  check('dungeon has braziers/lanterns for lighting', dz.lanterns > 10, dz.lanterns);

  // ---------------------------------------------------------------- screenshots of the zone
  const cam = async (file, p, l, hud, spot) => {
    await ev(([p, l, spot]) => { const g = EB.game, pl = g.player; if (spot) { pl.pos.set(spot[0], spot[1], spot[2]); g.world.updateChunks(spot[0], spot[2], 3, 999); } g.camOverride = { pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l) }; }, [p, l, spot]);
    await waitGame(1.2);
    await shot(file, hud);
    await ev(() => { EB.game.camOverride = null; });
  };
  await ev(() => { EB.game.dayT = 0.38; EB.game.spawnT = 1e9; });
  const sy = await ev(() => { const w = EB.game.world; return { o: w.surfaceY(128.5, 236), p: w.surfaceY(128.5, 112) }; });
  await cam('v5-desert-outpost.png', [128.5, sy.o + 15, 241], [128, sy.o, 220], true, [128.5, sy.o, 236]);
  await cam('v5-pyramid.png', [150, sy.p + 16, 128], [128, sy.p + 10, 70], true, [128.5, sy.p, 112]);

  step('tomb darkness + music');
  await ev(() => { const g = EB.game, p = g.player, w = g.world; g.perf && (g.perf.gaveUp = true); g.setLights(true); const y = w.floorBelow(128.5, 21, 61.5); p.pos.set(128.5, y, 61.5); p.yaw = Math.PI; w.updateChunks(128.5, 61.5, 3, 999); });
  await waitGame(1.5);
  const tomb = await ev(() => ({ zone: EB.game.lastZone, mood: EB.audio.mood, y: +EB.game.player.pos.y.toFixed(1), lit: EB.game.litCount }));
  check('the tomb is a dark dungeon with its own music mood and brazier lights', tomb.zone === 'Tomb of Ankhet-Ra' && tomb.mood === 'tomb' && tomb.lit > 0, tomb);
  await ev(() => { const g = EB.game, p = g.player; g.camDist = 5; p.pitch = -0.15; });
  await waitGame(0.6);
  await shot('v5-tomb.png');
  // boss
  const boss = await ev(() => { const g = EB.game, b = g.mobs.find((m) => m.type === 'ankhetra'); return b ? { x: b.pos.x, y: b.pos.y, z: b.pos.z, boxes: b.model.boxes, h: b.model.height } : null; });
  check('Pharaoh Ankhet-Ra waits in the sanctum', boss && Math.abs(boss.z - 38.5) < 6 && boss.boxes >= 100, boss);
  if (boss) {
    await ev((b) => { const g = EB.game, p = g.player, bm = g.mobs.find((m) => m.type === 'ankhetra'); p.pos.set(b.x, b.y, b.z + 9); g.camDist = 0;
      for (const m of g.mobs.slice()) if (m !== bm && Math.hypot(m.pos.x - b.x, m.pos.z - b.z) < 20) g.removeEntity(m);
      bm.def = Object.assign({}, bm.def, { aggro: 0 }); bm.hate.clear(); bm.state = 'idle'; bm.target = null; bm.casting = null; bm.pos.set(b.x, b.y, b.z); bm.yaw = 0; }, boss);
    await cam('v5-boss.png', [boss.x, boss.y + 2.2, boss.z + 3.8], [boss.x, boss.y + boss.h * 0.5, boss.z], true);
    await ev(() => { EB.game.camDist = 5; });
  }

  // ---------------------------------------------------------------- factions + merchants
  step('faction standing and merchants');
  await ev(() => { const g = EB.game, p = g.player, w = g.world; for (const m of g.mobs) if (m.alive && m.pos.distanceTo(new THREE.Vector3(128, 28, 225)) < 30) g.removeEntity(m); p.pos.set(128.5, w.surfaceY(128.5, 227.5), 227.5); g.setTarget(null); g.closeAll(); });
  const st0 = await ev(() => ({ bandit: EB.game.standing('bandit'), sunward: EB.game.standing('sunward'), guards: EB.game.standing('guards') }));
  check('starting standings: Sandreaver Bandits KOS, Sunward Caravan indifferent', st0.bandit === -800 && st0.sunward === 0 && st0.guards === 100, st0);
  await clearLog();
  const fence = await ev(() => { const g = EB.game, n = g.npcs.find((x) => x.name === 'Fence Jabari'); g.player.pos.set(n.pos.x + 1.5, n.pos.y, n.pos.z); g.setTarget(n); g.interact(); return { merch: !!g.merchant, open: g.windows.has('merchWin') }; });
  const fenceLog = await logText();
  check('the bandit fence refuses to trade with a KOS player', !fence.merch && !fence.open && /will not trade/.test(fenceLog) && /Sandreaver Bandits/.test(fenceLog), fence);
  const ham = await ev(() => { const g = EB.game, n = g.npcs.find((x) => x.name === 'Trader Hamid'); g.player.pos.set(n.pos.x + 1.5, n.pos.y, n.pos.z); g.setTarget(n); g.interact();
    const r = { open: g.windows.has('merchantWin'), m0: g.fMult(), p0: g.buyPrice('superior_potion'), rows: document.querySelectorAll('#merchList .row:not(.sellRow)').length, fline: !!document.querySelector('#merchList .fstand') };
    g.player.faction.sunward = 800; g.renderMerchant(); r.m1 = g.fMult(); r.p1 = g.buyPrice('superior_potion'); r.sellHdr = !!document.querySelector('#merchList .sellHdr'); return r; });
  check('Trader Hamid trades with his own desert stock and shows your standing', ham.open && ham.rows === 8 && ham.fline && ham.m0 === 1, ham);
  check('better faction = cheaper prices (Warmly: 8% off)', ham.m1 === 0.92 && ham.p1 < ham.p0 && ham.sellHdr, ham);
  await ev(() => { const g = EB.game; g.closeAll(); g.player.faction.sunward = 0; });

  step('kill faction hits');
  await clearLog();
  const kill = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob; const m = new M('bandit', null, p.pos.x + 3, p.pos.y, p.pos.z, [17, 17]); g.mobs.push(m); m.addTo(g.scene); m.grpDamage = m.maxHp; m.hp = 0; g.killMob(m, p); return { bandit: g.standing('bandit'), sunward: g.standing('sunward') }; });
  const killLog = await logText();
  check('killing a bandit: Sandreavers worse, Sunward Caravan better', kill.bandit === -814 && kill.sunward === 10 && /Sandreaver Bandits got worse/.test(killLog) && /Sunward Caravan got better/.test(killLog), kill);
  const kos = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob; const m = new M('bandit', null, p.pos.x + 3, p.pos.y, p.pos.z, [17, 17]); g.mobs.push(m); m.addTo(g.scene); const a = g.factionKOS(m); p.faction.bandit = 0; const b = g.factionKOS(m); p.faction.bandit = -814; g.removeEntity(m); return [a, b]; });
  check('bandits only attack on sight while you are KOS to them', kos[0] === true && kos[1] === false, kos);
  const clamp = await ev(() => { const g = EB.game; g.adjustFaction('sunward', 99999, true); const a = g.standing('sunward'); g.player.faction.sunward = 10; return a; });
  check('standing clamps at +2000', clamp === 2000);

  step('consider');
  await clearLog();
  await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob, w = g.world; p.pos.set(128.5, w.surfaceY(128.5, 182.5), 182.5); w.updateChunks(128.5, 182.5, 3, 999); for (const m of g.mobs.slice()) if (Math.hypot(m.pos.x - 128, m.pos.z - 182) < 30) g.removeEntity(m);
    const m = new M('bandit', null, p.pos.x, w.surfaceY(p.pos.x, p.pos.z - 4.5), p.pos.z - 4.5, [18, 18]); m.def = Object.assign({}, m.def, { aggro: 0 }); g.mobs.push(m); m.addTo(g.scene); window.__b = m; g.setTarget(m); g.consider(); const n = g.npcs.find((x) => x.name === 'Captain Asha'); g.setTarget(n); g.consider(); g.setTarget(m); });
  const con = await logText();
  check('consider shows EQ faction attitude (KOS bandit glares threateningly, Sunward indifferent)', /glares at you threateningly/.test(con) && /Captain Asha regards you indifferently/.test(con), con.slice(-300));
  await ev(() => { const g = EB.game, p = g.player, b = window.__b; p.yaw = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z); b.yaw = p.yaw + Math.PI; g.camOverride = { pos: new THREE.Vector3(p.pos.x + 1.6, p.pos.y + 2.6, p.pos.z + 3.2), look: new THREE.Vector3(b.pos.x, b.pos.y + 1.1, b.pos.z) }; });
  await waitGame(0.6);
  await shot('v5-faction-con.png');
  await ev(() => { EB.game.camOverride = null; });
  await ev(() => { EB.game.removeEntity(window.__b); });

  step('quest faction reward');
  const q = await ev(() => { const g = EB.game, n = g.npcs.find((x) => x.name === 'Caravan Master Idris'); const b = g.standing('sunward'); g.quests.scorpion_tails = 'active'; g.addItem('scorpion_tail', 4, true); g.turnIn('scorpion_tails', n); return { d: g.standing('sunward') - b, done: g.quests.scorpion_tails, cloak: g.countItem('desert_cloak') }; });
  check('Stingers in the Sand turn-in gives +60 Sunward Caravan faction and a desert cloak', q.d === 60 && q.done === 'done' && q.cloak === 1, q);
  const fcmd = await (async () => { await clearLog(); await ev(() => EB.game.command('/faction')); return logText(); })();
  check('/faction lists standings', /Sunward Caravan/.test(fcmd) && /Sandreaver Bandits/.test(fcmd), fcmd.slice(0, 200));

  // ---------------------------------------------------------------- pet commands
  step('pet commands');
  await ev(() => { const g = EB.game, p = g.player, w = g.world; let best = null;
    for (let x = 90; x <= 170 && !best; x += 8) for (let z = 150; z <= 205 && !best; z += 8) { let lo = 1e9, hi = -1e9; for (let dx = -12; dx <= 20; dx += 2) for (let dz = -8; dz <= 8; dz += 2) { const y = w.surfaceY(x + dx, z + dz); lo = Math.min(lo, y); hi = Math.max(hi, y); } if (hi - lo <= 1.01 && !w.isWater(x, w.surfaceY(x, z), z)) best = [x + 0.5, z + 0.5]; }
    best = best || [128.5, 180.5]; window.__spot = best;
    for (const m of g.mobs.slice()) if (Math.hypot(m.pos.x - best[0], m.pos.z - best[1]) < 40) g.removeEntity(m);
    p.pos.set(best[0], w.surfaceY(best[0], best[1]), best[1]); w.updateChunks(best[0], best[1], 3, 999); });
  console.log('   pet spot', await ev(() => window.__spot));
  const pet0 = await ev(() => { const g = EB.game, p = g.player, pet = g.summonPet(18); pet.pos.set(p.pos.x + 2, p.pos.y, p.pos.z + 1); g.renderPetBar(); return { lvl: pet.petLvl, bar: !document.getElementById('petBar').classList.contains('hidden'), btns: document.querySelectorAll('#petBar .petBtn').length, mode: pet.petMode }; });
  check('pet bar appears with 5 command buttons', pet0.bar && pet0.btns === 5 && pet0.mode === 'follow', pet0);
  await page.click('#petBar .petBtn[data-pc="guard"]');
  const g1 = await ev(() => { const pet = EB.game.pet(); return { mode: pet.petMode, guard: !!pet.guardPos, on: document.querySelector('#petBar .petBtn[data-pc="guard"]').classList.contains('on') }; });
  check('Guard button: pet guards its spot', g1.mode === 'guard' && g1.guard && g1.on, g1);
  await ev(() => { const g = EB.game; g.player.pos.x += 14; });
  await waitGame(2);
  const g2 = await ev(() => { const g = EB.game, pet = g.pet(); return +pet.pos.distanceTo(pet.guardPos).toFixed(2); });
  check('guarding pet stays put when you walk away', g2 < 2, g2);
  await ev(() => EB.game.command('/pet sit'));
  const s1 = await ev(() => EB.game.pet().petMode);
  await ev(() => EB.game.command('/pet follow'));
  await waitGame(3);
  const f1 = await ev(() => { const g = EB.game, pet = g.pet(); return { mode: pet.petMode, d: +pet.pos.distanceTo(g.player.pos).toFixed(1) }; });
  check('/pet sit and /pet follow (pet comes back)', s1 === 'sit' && f1.mode === 'follow' && f1.d < 6, [s1, f1]);
  const atk = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob; const m = new M('sand_scorpion', null, p.pos.x + 6, p.pos.y, p.pos.z + 3, [15, 15]); m.def = Object.assign({}, m.def, { aggro: 0 }); g.mobs.push(m); m.addTo(g.scene); window.__s = m; g.setTarget(m); g.petCommand('attack'); return EB.game.pet().petTarget === m; });
  await page.waitForFunction(() => window.__s.hp < window.__s.maxHp, null, { timeout: 15000 }).catch(() => {});
  const atk2 = await ev(() => { const m = window.__s; return { hurt: m.hp < m.maxHp, pt: EB.game.pet().petTarget === m }; });
  check('/pet attack sends the pet at your target', atk && atk2.hurt, atk2);
  await ev(() => { const g = EB.game, p = g.player, pet = g.pet(), s = window.__s; g.camOverride = { pos: new THREE.Vector3(p.pos.x - 2, p.pos.y + 4, p.pos.z - 5), look: new THREE.Vector3((pet.pos.x + s.pos.x) / 2, p.pos.y + 0.8, (pet.pos.z + s.pos.z) / 2) }; });
  await waitGame(0.4);
  await shot('v5-pet-commands.png');
  await ev(() => { EB.game.camOverride = null; });
  await ev(() => EB.game.command('/pet backoff'));
  const bo = await ev(() => { const pet = EB.game.pet(); return { t: pet.petTarget, until: pet.backoffUntil > EB.game.time }; });
  check('/pet backoff stops the attack', bo.t === null && bo.until, bo);
  await ev(() => { const g = EB.game; g.removeEntity(window.__s); g.command('/pet window'); });
  const pw = await ev(() => ({ open: EB.game.windows.has('petWin'), txt: document.getElementById('petBody').innerText.length }));
  check('/pet window opens the pet window', pw.open && pw.txt > 10, pw);
  await ev(() => { EB.game.closeAll(); });

  // ---------------------------------------------------------------- mob AI
  step('mob support AI: heal + buff');
  const heal = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob, x = p.pos.x + 20, z = p.pos.z;
    const b = new M('bandit', null, x, p.pos.y, z, [17, 17]), my = new M('bandit_mystic', null, x + 2, p.pos.y, z, [18, 18]);
    for (const m of [b, my]) { g.mobs.push(m); m.addTo(g.scene); }
    b.aggroOn(p, g); my.aggroOn(p, g); b.hp = Math.floor(b.maxHp * 0.3); my.casting = null;
    const ok = my.trySupport(g); window.__h = { b, my }; return { ok, type: my.casting && my.casting.type, tgt: my.casting && my.casting.target === b, hp0: b.hp }; });
  await waitGame(3);
  const heal2 = await ev(() => { const { b } = window.__h; return { hp: b.hp, max: b.maxHp, num: Number.isFinite(b.hp) }; });
  check('a Sandreaver mystic casts a heal on a hurt bandit', heal.ok && heal.type === 'heal' && heal.tgt, heal);
  check('heal lands (hp rises, stays numeric)', heal2.num && heal2.hp > heal.hp0, heal2);
  const buff = await ev(() => { const g = EB.game, { b, my } = window.__h; b.hp = b.maxHp; my.nextHeal = 1e9; my.nextBuff = 0; my.casting = null; my.hp = my.maxHp; for (const m of [b, my]) { m.wardUntil = m.hasteUntil = 0; if (m.state !== 'chase') m.aggroOn(g.player, g); m.hate.set(g.player, 100); } b.pos.copy(my.pos); b.pos.x += 2; const ok = my.trySupport(g); return { ok, type: my.casting && my.casting.type }; });
  await waitGame(3);
  const buff2 = await ev(() => { const g = EB.game, { b, my } = window.__h; return [b, my].some((m) => (m.wardUntil || 0) > g.time || (m.hasteUntil || 0) > g.time); });
  check('support casters buff allies in combat (ward/haste)', buff.ok && buff.type === 'buff' && buff2, buff);
  await ev(() => { const g = EB.game; for (const m of Object.values(window.__h)) g.removeEntity(m); });

  step('flee + bring friends');
  const flee = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob; p.level = 25; const x = p.pos.x, z = p.pos.z + 10;
    const a = new M('bandit', null, x, p.pos.y, z, [16, 16]), h = new M('bandit', null, x, p.pos.y, z + 16, [16, 16]);
    for (const m of [a, h]) { g.mobs.push(m); m.addTo(g.scene); }
    h.def = Object.assign({}, h.def, { aggro: 0 }); a.aggroOn(p, g); a.hp = Math.floor(a.maxHp * 0.12); window.__f = { a, h }; return { con: a.con(g), can: a.canFlee(g) }; });
  await page.waitForFunction(() => window.__f.a.state === 'flee' || window.__f.a.recruited, null, { timeout: 20000 }).catch(() => {});
  const fl1 = await ev(() => { const { a, h } = window.__f; return { state: a.state, helper: a.helper === h || !!a.recruited }; });
  await page.waitForFunction(() => window.__f.a.recruited, null, { timeout: 30000 }).catch(() => {});
  const fl2 = await ev(() => { const { a, h } = window.__f; return { rec: !!a.recruited, hstate: h.state, htarget: h.target === EB.game.player }; });
  check('low-con mobs flee at low health toward a friend', flee.can && fl1.state === 'flee' && fl1.helper, [flee, fl1]);
  check('the fleeing mob brings its friend back into the fight', fl2.rec && fl2.hstate === 'chase', fl2);
  const nf = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob; const m = new M('mummy', null, p.pos.x, p.pos.y, p.pos.z + 40, [16, 16]), n = new M('rahzik', null, p.pos.x, p.pos.y, p.pos.z + 40, [16, 16]); const r = [m.canFlee(g), n.canFlee(g)]; for (const e of Object.values(window.__f)) g.removeEntity(e); p.level = 22; return r; });
  check('undead and named mobs never flee', nf[0] === false && nf[1] === false, nf);

  step('rare named spawns');
  const named = await ev(() => { const g = EB.game; const slots = g.slots.filter((s) => s.def.alt === 'szyrix'); let maxUp = 0;
    for (const s of slots) s.def.altChance = 1;
    for (let i = 0; i < 4; i++) { for (const s of slots) { if (s.mob) { g.removeEntity(s.mob); s.mob = null; } s.respawnAt = 0; } g.updateSpawns(true); maxUp = Math.max(maxUp, g.mobs.filter((m) => m.alive && m.type === 'szyrix').length); }
    for (const s of slots) s.def.altChance = 0.18;
    return { slots: slots.length, maxUp, alts: g.slots.filter((s) => s.def.alt).map((s) => s.def.alt) };
  });
  check('rare named placeholders: at most one Szyrix up at a time', named.slots >= 3 && named.maxUp === 1 && ['szyrix', 'rahzik', 'gorukh'].every((a) => named.alts.includes(a)), named);

  step('ward undead + taunt');
  await clearLog();
  const wu = await ev(() => { const g = EB.game, p = g.player, M = EB.ent.Mob; const u = new M('mummy', null, p.pos.x + 2, p.pos.y, p.pos.z, [20, 20]), l = new M('bandit', null, p.pos.x - 2, p.pos.y, p.pos.z, [20, 20]);
    for (const m of [u, l]) { g.mobs.push(m); m.addTo(g.scene); m.def = Object.assign({}, m.def, { aggro: 0 }); }
    const r = []; for (let i = 0; i < 40; i++) { u.hp = u.maxHp; g.applyAbility('ward_undead', u); r.push(u.maxHp - u.hp); }
    const r2 = []; for (let i = 0; i < 40; i++) { l.hp = l.maxHp; g.applyAbility('ward_undead', l); r2.push(l.maxHp - l.hp); }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length; window.__wu = { u, l }; return { und: avg(r), liv: avg(r2) }; });
  const wuLog = await logText();
  check('Ward Undead: double damage and holy fire vs undead', wu.und > wu.liv * 1.5 && /seared by holy fire/.test(wuLog), wu);
  const ta = await ev(() => { const g = EB.game, p = g.player, pet = g.pet(), { l } = window.__wu; l.hp = l.maxHp; l.aggroOn(pet, g); l.hate.set(pet, 5000); l.target = pet; g.applyAbility('taunt', l); const r = { tgt: l.target === p, top: l.hate.get(p) > 5000 }; for (const m of Object.values(window.__wu)) g.removeEntity(m); return r; });
  check('Taunt pulls the mob off your pet onto you', ta.tgt && ta.top, ta);

  // ---------------------------------------------------------------- models + showcase
  step('monster models + showcase');
  const models = await ev(() => { const D = EB.data, M = EB.models, o = {}; for (const t of ['sand_scorpion', 'szyrix', 'bandit', 'bandit_mystic', 'rahzik', 'mummy', 'tomb_priest', 'sethek', 'sand_giant', 'gorukh', 'dust_djinn', 'ankhetra']) { const m = M.buildModel(M.mobOpts(t, D.MOBS[t])); let meshes = 0; m.group.traverse((x) => { if (x.isMesh) meshes++; }); o[t] = [m.rig, m.boxes, meshes]; M.dispose(m); } return o; });
  check('new monsters use detailed rigs (humanoids >= 60 boxes, <= 40 meshes; scorpions >= 50)', Object.entries(models).every(([t, [rig, b, me]]) => rig === 'human' ? b >= 60 && me <= 40 : b >= 50), models);
  await ev(() => {
    const g = EB.game, w = g.world, M = EB.models, D = EB.data; g.showcase = []; window.__gal = [];
    const z0 = 200.5; let top = 0; for (let x = 100; x < 156; x++) for (let z = 196; z < 206; z++) top = Math.max(top, w.surfaceY(x + 0.5, z + 0.5));
    for (const m of g.mobs.slice()) if (Math.hypot(m.pos.x - 128, m.pos.z - 200) < 40) g.removeEntity(m);
    const stage = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 12), new THREE.MeshLambertMaterial({ color: 0xd8b878, map: M.GRAIN })); stage.position.set(128, top - 1.5 + 0.02, z0); g.scene.add(stage); window.__stage = stage; window.__top = top + 0.02;
    let x = 101; for (const t of ['sand_scorpion', 'szyrix', 'bandit', 'bandit_mystic', 'rahzik', 'mummy', 'tomb_priest', 'sethek', 'dust_djinn', 'ankhetra', 'sand_giant', 'gorukh']) {
      const m = M.buildModel(M.mobOpts(t, D.MOBS[t])), wd = Math.max(1.4, m.width * (m.rig === 'human' ? 2.1 : 1.5)); x += wd / 2; m.group.position.set(x, window.__top, z0); m.group.rotation.y = 0.15; x += wd / 2 + 0.25;
      g.scene.add(m.group); g.showcase.push({ M: m, attack: window.__gal.length % 3 === 1 }); window.__gal.push({ t, m });
    }
    const xs = window.__gal.map((o) => o.m.group.position.x), a = Math.min(...xs), b = Math.max(...xs), mx = (a + b) / 2;
    g.player.pos.set(128.5, w.surfaceY(128.5, 236), 236); g.dayT = 0.36;
    g.camOverride = { pos: new THREE.Vector3(mx, window.__top + 7, z0 + (b - a) * 0.55), look: new THREE.Vector3(mx, window.__top + 1.4, z0) };
  });
  await waitGame(1);
  await shot('v5-monsters.png', true);
  // hero: boss-ish trio close-up at golden hour
  await ev(() => { const g = EB.game, sel = window.__gal.filter((o) => ['sethek', 'dust_djinn', 'ankhetra', 'sand_giant'].includes(o.t)), xs = sel.map((o) => o.m.group.position.x), a = Math.min(...xs), b = Math.max(...xs), mx = (a + b) / 2;
    for (const [i, sc] of g.showcase.entries()) sc.attack = ['ankhetra', 'dust_djinn'].includes(window.__gal[i].t); g.dayT = 0.3;
    g.camOverride = { pos: new THREE.Vector3(mx + 0.5, window.__top + 3.4, 200.5 + (b - a) * 1.05 + 2.5), look: new THREE.Vector3(mx, window.__top + 2, 200.5) }; });
  await waitGame(1);
  await shot('v5-hero.png', true);
  await ev(() => { const g = EB.game; for (const o of window.__gal) EB.models.dispose(o.m); g.showcase = []; g.camOverride = null; g.scene.remove(window.__stage); });

  step('save/load keeps factions + pet mode');
  const sv = await ev(() => { const g = EB.game; g.player.faction.sunward = 321; g.petCommand('guard'); delete g.save; g.save(); const d = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /save/i.test(k) && k !== 'everblock_phone'))); return { f: d.char.faction && d.char.faction.sunward, pm: d.char.petMode, zone: d.zone }; });
  await page.reload();
  await page.click('#btnContinue');
  await inGame();
  await page.waitForTimeout(1500);
  const ld = await ev(() => { const g = EB.game; return { zone: g.world.zoneId, f: g.standing('sunward'), pet: g.pet() && g.pet().petMode, lvl: g.player.level }; });
  check('faction standing, zone and pet mode survive save/load', sv.f === 321 && ld.zone === 'desert' && ld.f === 321 && ld.pet === 'guard', [sv, ld]);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log('JS errors:', errors.length ? errors : 0);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
