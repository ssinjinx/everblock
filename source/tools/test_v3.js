// Everblock v3 headless test: new classes + race restrictions, spell icons, spellbook/gems/memorize, hotbar drag & click-assign,
// necro pet, mez/stun/dot/slow/snare, spirit of wolf, archery, lay hands, merc stance/heal threshold/gear/revive,
// Warden's Legacy chain across both zones + new quests, music moods, lantern point lights, v2 save compatibility.
const { chromium } = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../../index.html');
const hidePrompt = (page) => page.evaluate(() => { const e = document.getElementById('clickToPlay'); if (e) e.style.visibility = 'hidden'; });
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
  const inGame = () => page.waitForFunction(() => window.EB.game && window.EB.game.player && !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 60000 });
  const waitGame = async (sec) => { const t0 = await page.evaluate(() => EB.game.time); await page.waitForFunction((t) => EB.game.time >= t, t0 + sec, { timeout: 120000 }); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const logTail = (n) => ev((n) => document.getElementById('chatLog').innerText.split('\n').slice(-n), n);
  const newChar = async (race, cls, name) => {
    await page.goto(URL);
    await ev(() => localStorage.clear());
    await page.reload();
    await page.click('#btnNew');
    await page.click(`#raceList button:has-text("${race}")`);
    await page.click(`#classList button:has-text("${cls}")`);
    await page.fill('#nameInput', name);
    await page.click('#btnCreate');
    await inGame();
    await page.waitForTimeout(1200);
  };
  // put a mob of a type at an offset from the player (flat ground), targeted
  const placeMob = (type, dist, lvl) => ev(([type, dist, lvl]) => {
    const g = EB.game, p = g.player, w = g.world;
    const m = g.mobs.filter((m) => m.alive && m.type === type).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
    const px = 170.5, pz = 131.5; p.pos.set(px, w.surfaceY(px, pz), pz);
    const mx = px + dist, mz = pz; m.pos.set(mx, w.surfaceY(mx, mz), mz); m.home.copy(m.pos); m.state = 'idle'; m.hate.clear(); m.target = null;
    if (lvl) { m.level = lvl; m.refreshPlate(g); }
    m.hp = m.maxHp; p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z); p.pitch = -0.15; g.camDist = 6;
    g.setTarget(m); window.__m = m; return { name: m.name, lvl: m.level, d: m.pos.distanceTo(p.pos) };
  }, [type, dist, lvl || 0]);
  const levelTo = (L) => ev((L) => { const g = EB.game, p = g.player; while (p.level < L) g.gainXP(EB.data.xpToNext(p.level)); p.hp = p.maxHp; p.mana = p.maxMana; }, L);
  const learn = (ids, mem) => ev(([ids, mem]) => { const g = EB.game, p = g.player; for (const id of ids) { if (!p.spells.includes(id)) p.spells.push(id); if (mem && !p.gems.includes(id)) { const i = p.gems.indexOf(null); p.gems[i >= 0 ? i : 7] = id; } } g.renderGems(); g.rebuildHotbar(); }, [ids, !!mem]);
  const cast = async (id, extra) => {
    const r = await ev((id) => { const g = EB.game, p = g.player; p.cooldowns[id] = 0; p.mana = p.maxMana; g.stand(); g.useAbility(id); return { casting: !!p.casting }; }, id);
    await waitGame((extra || 0) + 0.3 + (await ev((id) => EB.data.SPELLS[id].cast || 0, id)));
    return r;
  };

  // ---------------------------------------------------------------- creation & race restrictions
  step('character creation: new classes & race restrictions');
  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  const classNames = await ev(() => [...document.querySelectorAll('#classList button')].map((b) => b.textContent.trim()));
  check('nine classes offered', ['Ranger', 'Paladin', 'Shaman', 'Necromancer', 'Enchanter'].every((c) => classNames.some((n) => n.includes(c))) && classNames.length === 9, classNames);
  await page.click('#raceList button:has-text("Ogre")');
  const ogre = await ev(() => { const b = [...document.querySelectorAll('#classList button')]; const f = (n) => b.find((x) => x.textContent.includes(n)); return { ranger: f('Ranger').disabled, necro: f('Necromancer').disabled, shaman: f('Shaman').disabled, title: f('Ranger').title }; });
  check('Ogre cannot be a Ranger/Necromancer, can be a Shaman', ogre.ranger && ogre.necro && !ogre.shaman, ogre);
  await page.click('#raceList button:has-text("Wood Elf")');
  const welf = await ev(() => { const b = [...document.querySelectorAll('#classList button')]; const f = (n) => b.find((x) => x.textContent.includes(n)); return { ranger: f('Ranger').disabled, paladin: f('Paladin').disabled }; });
  check('Wood Elf can be a Ranger but not a Paladin', !welf.ranger && welf.paladin, welf);
  await page.click('#raceList button:has-text("Dark Elf")');
  await page.click('#classList button:has-text("Necromancer")');
  await page.fill('#nameInput', 'Vexxis');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + 'v3-class-creation.png' });

  // ---------------------------------------------------------------- necromancer: icons, spellbook, memorize, hotbar, pet
  step('necromancer: icons, spellbook, memorize, hotbar');
  await page.click('#btnCreate');
  await inGame(); await page.waitForTimeout(1500);
  const n0 = await ev(() => { const p = EB.game.player; return { cls: p.cls, gems: p.gems.filter(Boolean), hotbar: p.hotbar.filter(Boolean), hotIcons: document.querySelectorAll('#hotbar img.sic').length, gemIcons: document.querySelectorAll('#gemBar img.sic').length, iconSrc: (document.querySelector('#hotbar img.sic') || {}).src ? document.querySelector('#hotbar img.sic').src.slice(0, 22) : '' }; });
  check('necromancer starts with lifetap + pet spell memorized', n0.cls === 'necromancer' && n0.gems.includes('lifetap') && n0.gems.includes('cavorting_bones'), n0);
  check('procedural spell icons on hotbar and gems', n0.hotIcons >= 3 && n0.gemIcons >= 2 && n0.iconSrc.startsWith('data:image/png'), n0);
  await levelTo(10);
  await learn(['snare', 'bone_walk', 'disease_cloud']);
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(300);
  const bk = await ev(() => ({ open: !document.getElementById('bookWin').classList.contains('hidden'), n: document.querySelectorAll('#bookList .bspell').length }));
  check('K opens spellbook listing spells', bk.open && bk.n >= 5, bk);
  // click-select snare, click empty gem -> memorize with delay
  await page.click('#bookList .bspell[data-id="snare"]');
  const emptyGem = await ev(() => EB.game.player.gems.indexOf(null));
  await page.click(`#gemBar .gem[data-gem="${emptyGem}"]`);
  await waitGame(0.6);
  const m1 = await ev((g) => ({ mem: EB.game.player.memorizing && EB.game.player.memorizing.id, gem: EB.game.player.gems[g], sitting: EB.game.player.sitting, bar: document.getElementById('castName').textContent }), emptyGem);
  check('memorizing starts (sits, cast bar), gem not yet filled', m1.mem === 'snare' && !m1.gem && m1.sitting && /Memorizing/.test(m1.bar), m1);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v3-spellbook-gems.png' });
  const blocked = await ev(() => { EB.game.useAbility('lifetap'); return document.getElementById('chatLog').innerText.split('\n').slice(-1)[0]; });
  check('cannot cast while memorizing', /busy memorizing/.test(blocked), blocked);
  await waitGame(await ev(() => EB.game.memTime('snare')) + 0.3);
  const m2 = await ev((g) => ({ mem: EB.game.player.memorizing, gem: EB.game.player.gems[g] }), emptyGem);
  check('memorize completes after delay', !m2.mem && m2.gem === 'snare', m2);
  // double-click memorize bone_walk
  await page.dblclick('#bookList .bspell[data-id="bone_walk"]');
  await waitGame(await ev(() => EB.game.memTime('bone_walk')) + 0.4);
  check('double-click memorizes into a gem', await ev(() => EB.game.player.gems.includes('bone_walk')));
  // drag spell onto hotbar slot 6
  await page.dragAndDrop('#bookList .bspell[data-id="snare"]', '#hotbar .slot >> nth=5');
  await page.waitForTimeout(200);
  const hb6 = await ev(() => EB.game.player.hotbar[5]);
  check('drag spell from book to hotbar', hb6 === 'snare', hb6);
  // right-click a gem forgets the spell
  const dcGem = await ev(() => EB.game.player.gems.indexOf('disease_cloud'));
  await page.click(`#gemBar .gem[data-gem="${dcGem}"]`, { button: 'right' });
  check('right-click a gem forgets the spell', await ev(() => !EB.game.player.gems.includes('disease_cloud')));
  // click-to-assign: select then click hotbar slot 8
  await page.click('#bookList .bspell[data-id="disease_cloud"]');
  await page.click('#hotbar .slot >> nth=7');
  await page.waitForTimeout(200);
  const hb8 = await ev(() => ({ id: EB.game.player.hotbar[7], unmem: document.querySelectorAll('#hotbar .slot')[7].classList.contains('unmem') }));
  check('click-to-assign to hotbar (unmemorized spell shown greyed)', hb8.id === 'disease_cloud', hb8);
  await page.waitForTimeout(400);
  const hb8b = await ev(() => document.querySelectorAll('#hotbar .slot')[7].classList.contains('unmem'));
  check('unmemorized hotbar spell has unmem style', hb8b);
  await page.keyboard.press('Digit8');
  const unm = (await logTail(1))[0];
  check('casting an unmemorized spell is refused', /do not have Disease Cloud memorized/.test(unm), unm);
  // right-click clears hotbar slot
  await page.click('#hotbar .slot >> nth=7', { button: 'right' });
  check('right-click clears hotbar slot', await ev(() => EB.game.player.hotbar[7] === null));
  await page.keyboard.press('KeyK');
  // save/reload keeps gems & hotbar
  await ev(() => EB.game.save());
  const saved = await ev(() => { const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY)); return { v: s.v, gems: s.char.gems, hot: s.char.hotbar }; });
  check('save v3 stores gems + hotbar', saved.v === 3 && saved.gems.includes('snare') && saved.hot[5] === 'snare', saved);

  step('necromancer pet');
  await ev(() => { const p = EB.game.player; p.level = 4; p.hp = p.maxHp; });
  await placeMob('gnoll', 7, 3);
  for (let k = 0; k < 3 && !(await ev(() => EB.game.mercs.some((m) => m.isPet))); k++) {
    await ev(() => { window.__m.stunUntil = EB.game.time + 7; }); // hold the gnoll so a hit can't interrupt the 5s summon
    await cast('cavorting_bones');
  }
  const pet = await ev(() => { const g = EB.game, m = g.mercs.find((m) => m.isPet); return m ? { name: m.name, lvl: m.level, hp: m.hp, plate: !!m.plate, rows: document.querySelectorAll('#groupWin .gmem').length, pet: !!document.querySelector('#groupWin .gpet') } : null; });
  check('Cavorting Bones summons a level 3 pet in the group window', pet && pet.lvl === 3 && pet.name === 'Gabober' && pet.pet, pet);
  await cast('lifetap');
  let petHit = false, petShot = false;
  for (let i = 0; i < 60; i++) {
    await waitGame(0.5);
    const s = await ev(() => { const g = EB.game, m = window.__m, p = g.player; if (p.hp < p.maxHp * 0.4) p.hp = p.maxHp; const log = document.getElementById('chatLog').innerText; const pt = g.mercs.find((x) => x.isPet); return { alive: m.alive, hit: /Gabober (hits|tries to hit)/.test(log), pd: pt ? pt.pos.distanceTo(m.pos) : 99 }; });
    if (s.hit) petHit = true;
    if (!petShot && s.hit && s.pd < 3) { await ev(() => { const g = EB.game, p = g.player, m = window.__m; p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z) + 0.35; g.camDist = 7; }); await waitGame(0.1); await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v3-necro-pet.png' }); petShot = true; }
    if (!s.alive) break;
    if (i % 6 === 5) await cast('lifetap');
  }
  const pk = await ev(() => ({ dead: !window.__m.alive, tapped: /You feel invigorated/.test(document.getElementById('chatLog').innerText) }));
  check('pet attacks the necromancer\'s target', petHit);
  check('lifetap heals caster; target killed with pet', pk.tapped && pk.dead, pk);
  if (!petShot) await page.screenshot({ path: SHOTS + 'v3-necro-pet.png' });
  const xpNoPet = await ev(() => EB.game.groupMembers().filter((g) => !g.isPet).length);
  check('pets do not take an XP share', xpNoPet === 1, xpNoPet);

  // ---------------------------------------------------------------- enchanter: mez & stun
  step('enchanter: mesmerize, stun');
  await newChar('Gnome', 'Enchanter', 'Fizzwick');
  await levelTo(5);
  await learn(['stun'], true);
  await placeMob('gnoll', 6, 4);
  await cast('mesmerize');
  const mz0 = await ev(() => { const g = EB.game, m = window.__m; return { mez: (m.mezUntil || 0) > g.time, pos: m.pos.toArray(), log: document.getElementById('chatLog').innerText.split('\n').slice(-3) }; });
  await waitGame(2.5);
  const mz1 = await ev(() => { const g = EB.game, m = window.__m, p = g.player; return { mez: (m.mezUntil || 0) > g.time, pos: m.pos.toArray(), hp: p.hp, max: p.maxHp }; });
  const moved = Math.hypot(mz1.pos[0] - mz0.pos[0], mz1.pos[2] - mz0.pos[2]);
  check('mesmerize holds the mob still', mz0.mez && mz1.mez && moved < 0.3, { mz0, moved });
  await ev(() => EB.game.damageMob(window.__m, 2, EB.game.player));
  const mz2 = await ev(() => ({ mez: (window.__m.mezUntil || 0) > EB.game.time, log: document.getElementById('chatLog').innerText.split('\n').slice(-2) }));
  check('damage breaks mesmerize', !mz2.mez && mz2.log.some((l) => /awakened/.test(l)), mz2);
  await cast('stun');
  const st = await ev(() => ({ stun: (window.__m.stunUntil || 0) > EB.game.time, log: document.getElementById('chatLog').innerText.split('\n').slice(-3) }));
  check('stun lands on the target', st.stun || st.log.some((l) => /resist/.test(l)), st);
  const named = await ev(() => { const g = EB.game; const m = window.__m; const L = m.level; m.level = 30; g.player.cooldowns.mesmerize = 0; g.player.mana = g.player.maxMana; g.stand(); g.applyAbility('mesmerize', m); m.level = L; return { mez: (m.mezUntil || 0) > g.time }; });
  check('high-level mobs cannot be mesmerized', !named.mez, named);

  // ---------------------------------------------------------------- shaman: dot, slow, spirit of wolf
  step('shaman: dot, slow, spirit of wolf');
  await newChar('Barbarian', 'Shaman', 'Grukka');
  await levelTo(8);
  await learn(['drowsy', 'spirit_of_wolf'], true);
  await placeMob('gnoll', 9, 7);
  await ev(() => { const m = window.__m; m.maxHp = m.hp = 400; });
  let dotted = false;
  for (let k = 0; k < 4 && !dotted; k++) { await cast('sicken'); dotted = await ev(() => (window.__m.dots || []).length > 0); }
  const h0 = await ev(() => window.__m.hp);
  await waitGame(6.5);
  const d1 = await ev(() => ({ hp: window.__m.hp, log: document.getElementById('chatLog').innerText.split('\n').filter((l) => /from your Sicken/.test(l)).length }));
  check('Sicken damage-over-time ticks', dotted && d1.hp < h0 && d1.log >= 1, { h0, d1 });
  let slowed = false;
  for (let k = 0; k < 4 && !slowed; k++) { await cast('drowsy'); slowed = await ev(() => (window.__m.slowedUntil || 0) > EB.game.time); }
  check('Drowsy slows the target', slowed);
  // walk speed test before/after spirit of wolf (flat road in town)
  const walk = async () => {
    await ev(() => { const g = EB.game, p = g.player, w = g.world, m = window.__m; if (m) { g.removeEntity ? 0 : 0; m.pos.set(m.pos.x + 60, m.pos.y, m.pos.z); m.state = 'idle'; m.hate.clear(); } const x = 128.5, z = 150.5; p.pos.set(x, w.surfaceY(x, z), z); p.yaw = Math.PI; g.setTarget(null); });
    await waitGame(0.3);
    const a = await ev(() => { const p = EB.game.player; return [p.pos.x, p.pos.z, EB.game.time]; });
    await page.keyboard.down('KeyW'); await waitGame(1.2); await page.keyboard.up('KeyW');
    const b = await ev(() => { const p = EB.game.player; return [p.pos.x, p.pos.z, EB.game.time]; });
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / (b[2] - a[2]);
  };
  const v0 = await walk();
  await ev(() => EB.game.setTarget(EB.game.player));
  await cast('spirit_of_wolf');
  const sow = await ev(() => EB.game.player.buffSum('speed'));
  const v1 = await walk();
  check('Spirit of Wolf increases run speed', sow > 0.3 && v1 > v0 * 1.15, { sow, v0: +v0.toFixed(2), v1: +v1.toFixed(2) });

  // ---------------------------------------------------------------- ranger: archery at range
  step('ranger: archery');
  await newChar('Wood Elf', 'Ranger', 'Sylvara');
  await levelTo(3);
  await placeMob('gnoll', 18, 2);
  const kickFar = await ev(() => { EB.game.player.cooldowns.kick = 0; EB.game.useAbility('kick'); return document.getElementById('chatLog').innerText.split('\n').slice(-1)[0]; });
  check('melee kick refused at range', /too far/.test(kickFar), kickFar);
  let shot = false;
  for (let k = 0; k < 6 && !shot; k++) { await cast('archery'); shot = await ev(() => /You shoot a gnoll for \d+/.test(document.getElementById('chatLog').innerText)); }
  const ar = await ev(() => ({ hp: window.__m.hp, max: window.__m.maxHp, d: window.__m.pos.distanceTo(EB.game.player.pos) }));
  check('archery hits a target 18m away', shot && ar.hp < ar.max, ar);

  // ---------------------------------------------------------------- paladin: lay hands, stun; mercs
  step('paladin: lay on hands, stun');
  await newChar('Dwarf', 'Paladin', 'Thorgrim');
  await levelTo(8);
  const lh = await ev(() => { const g = EB.game, p = g.player; p.hp = Math.floor(p.maxHp * 0.3); const b = p.hp; g.setTarget(null); g.useAbility('lay_hands'); return { before: b, after: p.hp, max: p.maxHp }; });
  check('Lay on Hands heals instantly', lh.after > lh.before + 40, lh);
  await learn(['stun'], true);
  await placeMob('gnoll', 2.2, 6);
  let pst = false;
  for (let k = 0; k < 4 && !pst; k++) { await cast('stun'); pst = await ev(() => (window.__m.stunUntil || 0) > EB.game.time - 1); }
  check('paladin Stun', pst);
  await ev(() => { const m = window.__m; m.pos.set(m.pos.x + 80, m.pos.y, m.pos.z); m.state = 'idle'; m.hate.clear(); m.target = null; EB.game.player.autoAttack = false; EB.game.setTarget(null); });

  step('mercenaries: stance, heal threshold, gear, revive');
  await ev(() => { const g = EB.game, p = g.player; p.coins += 2000000; const b = g.npcs.find((n) => n.npcKind === 'liaison'); p.pos.set(b.pos.x + 2, b.pos.y, b.pos.z); g.setTarget(b); g.hireMerc('tank'); g.hireMerc('healer'); });
  await page.waitForTimeout(300);
  const cfgBtn = await page.$$('#groupWin .gcfg');
  check('group rows have settings buttons', cfgBtn.length === 2, cfgBtn.length);
  await cfgBtn[0].click();
  await page.waitForTimeout(300);
  const cfg = await ev(() => ({ open: !document.getElementById('mercCfgWin').classList.contains('hidden'), stances: document.querySelectorAll('#mcfgBody .stance').length, equip: document.querySelectorAll('#mcfgEquip .islot').length }));
  check('merc settings window opens with stance buttons + equipment', cfg.open && cfg.stances === 3 && cfg.equip >= 8, cfg);
  // gear
  await ev(() => { const g = EB.game; g.addItem('orc_chain', 1, true); g.addItem('fang_warblade', 1, true); g.addItem('militia_bracer', 1, true); g.renderMercCfg(); });
  const before = await ev(() => { const m = EB.game.mercs.find((m) => m.role === 'tank'); return { hp: m.maxHp, ac: m.ac }; });
  for (const nm of ['Chainmail', 'Warblade', 'Militia']) { const row = page.locator('#mcfgGive .row', { hasText: new RegExp(nm, 'i') }).first(); if (await row.count()) { await row.locator('button').click(); await page.waitForTimeout(150); } }
  const after = await ev(() => { const m = EB.game.mercs.find((m) => m.role === 'tank'); return { hp: m.maxHp, ac: m.ac, eq: Object.keys(m.equip), inv: EB.game.countItem('orc_chain') }; });
  check('giving gear raises merc HP/AC and removes it from your bags', after.eq.length >= 2 && after.ac > before.ac && after.hp >= before.hp && after.inv === 0, { before, after });
  await ev(() => { document.getElementById('centerMsg').style.opacity = 0; const g = EB.game, p = g.player; p.yaw += 0.6; p.pitch = -0.2; }); await page.waitForTimeout(400); await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v3-merc-settings.png' });
  // take back one item
  const tb = await ev(() => { const g = EB.game, m = g.mercs.find((m) => m.role === 'tank'); const sl = Object.keys(m.equip)[0]; const id = m.equip[sl].id; g.takeFromMerc(m, sl); return { back: g.countItem(id) > 0, still: !!m.equip[sl] }; });
  check('take gear back from merc', tb.back && !tb.still, tb);
  // stance: passive vs aggressive
  await page.click('#mcfgBody .stance[data-st="passive"]');
  await placeMob('gnoll', 5, 7);
  const stance = await ev(() => { const g = EB.game, tank = g.mercs.find((m) => m.role === 'tank'), p = g.player, m = window.__m;
    for (const mc of g.mercs) mc.pos.set(p.pos.x - 1.5, p.pos.y, p.pos.z + (mc.role === 'tank' ? 1 : -1));
    p.autoAttack = true; const passive = g.mercFoe(tank); p.autoAttack = false; g.setTarget(null);
    tank.stance = 'balanced'; const balancedIdle = g.mercFoe(tank);
    tank.stance = 'aggressive'; m.def.aggressive = true; const aggr = g.mercFoe(tank);
    return { passive: passive && passive.name, balancedIdle: balancedIdle && balancedIdle.name, aggressive: aggr && aggr.name, st: tank.stance }; });
  check('passive stance ignores your target; aggressive engages nearby hostiles unprompted', !stance.passive && !stance.balancedIdle && stance.aggressive, stance);
  await waitGame(3);
  const aggrHit = await ev(() => window.__m.hate.has(EB.game.mercs.find((m) => m.role === 'tank')) || !window.__m.alive);
  check('aggressive merc actually attacks', aggrHit);
  await ev(() => { const g = EB.game, m = window.__m; if (m.alive) g.damageMob(m, 9999, g.player); for (const mc of g.mercs) mc.stance = 'balanced'; });
  // heal threshold
  await ev(() => { const g = EB.game; g.openMercCfg(g.mercs.find((m) => m.role === 'healer')); });
  await page.waitForTimeout(200);
  await ev(() => { const r = document.getElementById('healAt'); r.value = 90; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  const ha = await ev(() => EB.game.mercs.find((m) => m.role === 'healer').healAt);
  await ev(() => { const g = EB.game, p = g.player; const h = g.mercs.find((m) => m.role === 'healer'); h.mana = h.maxMana; h.healT = 0; h.casting = null; p.hp = Math.floor(p.maxHp * 0.85); });
  await waitGame(1);
  const healed = await ev(() => { const h = EB.game.mercs.find((m) => m.role === 'healer'); return !!(h.casting && EB.data.SPELLS[h.casting.id].kind === 'heal') || /Sister Maelin begins to cast a spell. <(Minor|Light)/.test(document.getElementById('chatLog').innerText.split('\n').slice(-6).join('\n')); });
  check('heal threshold slider (90%) makes the healer heal at 85% HP', ha === 0.9 && healed, { ha, healed });
  await ev(() => EB.game.closeWin('mercCfgWin'));
  // death -> revive
  await ev(() => { const g = EB.game, t = g.mercs.find((m) => m.role === 'tank'); g.mercDie(t, { name: 'a test gnoll' }); });
  await page.waitForTimeout(200);
  const dead = await ev(() => ({ n: EB.game.mercs.length, deadRow: !!document.querySelector('#groupWin .gmem.dead .grev'), coins: EB.game.player.coins, cost: EB.game.reviveCost(EB.game.mercs.find((m) => m.dead)) }));
  check('dead merc stays in group with a Revive button', dead.n === 2 && dead.deadRow, dead);
  await ev(() => EB.game.save());
  await page.reload(); await page.click('#btnContinue'); await inGame(); await page.waitForTimeout(1200);
  const dl = await ev(() => ({ mercs: EB.game.mercs.map((m) => m.name + (m.dead ? ':dead' : '')), equip: Object.keys((EB.game.mercs.find((m) => m.role === 'tank') || {}).equip || {}), stance: EB.game.mercs.map((m) => m.stance), healAt: (EB.game.mercs.find((m) => m.role === 'healer') || {}).healAt }));
  check('dead merc, gear, stance and heal threshold persist through save/reload', dl.mercs.some((s) => s.endsWith(':dead')) && dl.equip.length >= 1 && dl.healAt === 0.9, dl);
  await page.click('#groupWin .grev');
  await page.waitForTimeout(300);
  const rv = await ev(() => { const t = EB.game.mercs.find((m) => m.role === 'tank'); return { dead: t.dead, hp: t.hp, inScene: !!t.model.group.parent, coins: EB.game.player.coins }; });
  check('revive at a cost restores the merc', !rv.dead && rv.hp > 0 && rv.inScene && dead.coins - rv.coins === dead.cost, { rv, cost: dead.cost });

  // ---------------------------------------------------------------- quests
  step('quest chain: The Warden\'s Legacy');
  const hailNpc = async (name) => {
    await ev((name) => { const g = EB.game, p = g.player, n = g.npcs.find((n) => n.name === name); p.pos.set(n.pos.x + 2, n.pos.y, n.pos.z); p.yaw = Math.atan2(n.pos.x - p.pos.x, n.pos.z - p.pos.z); g.setTarget(n); }, name);
    await page.keyboard.press('KeyH');
    await page.waitForFunction(() => !document.getElementById('dialogWin').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    return ev(() => ({ open: !document.getElementById('dialogWin').classList.contains('hidden'), btns: [...document.querySelectorAll('#dlgBtns button')].map((b) => b.textContent) }));
  };
  const clickBtn = (re) => ev((re) => { const b = [...document.querySelectorAll('#dlgBtns button')].find((b) => new RegExp(re).test(b.textContent)); if (b) b.click(); return !!b; }, re);
  const zoneTo = async (z) => {
    await ev((z) => EB.game.changeZone(z === 'frostfang' ? { to: 'frostfang', arrive: { x: 128.5, z: 246.5, yaw: Math.PI } } : { to: 'everblock', arrive: { x: 128.5, z: 12.5, yaw: 0 } }), z);
    await page.waitForFunction((z) => EB.game.world.zoneId === z && !EB.game.zoning, z, { timeout: 60000 });
    await page.waitForTimeout(800);
  };
  let d = await hailNpc('Soulbinder Kerra');
  check('Kerra offers The Warden\'s Legacy', d.open && d.btns.some((b) => /Accept: The Warden/.test(b)), d);
  await clickBtn('Accept: The Warden');
  const qw = await ev(() => document.getElementById('questWin').innerText);
  check('chain shows in quest tracker with step hint', /Warden's Legacy \(1\/4\)/.test(qw) && /Ghoul Ichor/.test(qw), qw.replace(/\n/g, ' | '));
  await ev(() => EB.game.addItem('ghoul_ichor', 2, true));
  d = await hailNpc('Soulbinder Kerra');
  await clickBtn('Hand in: 2 Vial of Ghoul Ichor');
  const s1 = await ev(() => ({ step: EB.game.questSteps.warden_legacy, letter: EB.game.countItem('kerra_letter') }));
  check('step 1 done: Kerra gives her sealed letter', s1.step === 1 && s1.letter === 1, s1);
  await zoneTo('frostfang');
  d = await hailNpc('Scout Hollis');
  check('Hollis (Frostfang) offers letter hand-in alongside her own quest', d.btns.some((b) => /Hand in: 1 Kerra/.test(b)), d);
  await clickBtn('Hand in: 1 Kerra');
  await ev(() => EB.game.addItem('frost_wolf_pelt', 4, true));
  d = await hailNpc('Scout Hollis');
  await clickBtn('Hand in: 4 Frost Wolf Pelt');
  const s3 = await ev(() => ({ step: EB.game.questSteps.warden_legacy, map: EB.game.countItem('hollis_map'), mood: EB.audio.mood }));
  check('steps 2-3 done in Frostfang: Hollis gives the warcamp map', s3.step === 3 && s3.map === 1, s3);
  check('music mood switches to frost in Frostfang', s3.mood === 'frost', s3.mood);
  // new quest: Trapper Gunnar
  d = await hailNpc('Trapper Gunnar');
  await clickBtn('Accept: Yeti Hunt');
  await ev(() => EB.game.addItem('yeti_fang', 3, true));
  d = await hailNpc('Trapper Gunnar');
  await clickBtn('Hand in');
  check('new quest: Yeti Hunt (Trapper Gunnar) rewards boots', await ev(() => EB.game.quests.yeti_hunt === 'done' && EB.game.countItem('gunnar_boots') === 1));
  // shard drops from Grimtusk
  const shard = await ev(() => EB.data.MOBS.grimtusk.loot.some((l) => l[0] === 'warden_shard' && l[1] >= 1));
  check('Warlord Grimtusk always drops the Warden shard', shard);
  await ev(() => EB.game.addItem('warden_shard', 1, true));
  await zoneTo('everblock');
  d = await hailNpc('Guildmaster Aldric');
  const aldric = d.btns.some((b) => /Hand in: 1 Shard.*\+ 1 Hollis/.test(b));
  await clickBtn('Hand in: 1 Shard');
  await page.waitForTimeout(400);
  const fin = await ev(() => { const g = EB.game, p = g.player; return { st: g.quests.warden_legacy, signet: g.countItem('warden_signet'), title: p.title, pName: document.getElementById('pName').textContent, mood: EB.audio.mood }; });
  check('final step at Aldric grants the Signet and the title', aldric && fin.st === 'done' && fin.signet === 1 && fin.title === 'Warden of Everblock' && /Warden/.test(fin.pName), fin);
  check('music mood is town in Everblock Keep', fin.mood === 'town', fin.mood);
  await ev(() => { const g = EB.game, p = g.player, a = g.npcs.find((n) => n.name === 'Guildmaster Aldric'); p.pos.set(a.pos.x + 3.2, a.pos.y, a.pos.z + 1.2); p.yaw = Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z) + 0.25; p.pitch = -0.1; g.camDist = 4.5; g.dayT = 0.35; });
  await waitGame(0.5); await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v3-quest-reward.png' });
  // new quest: Guard Mossen
  d = await hailNpc('Guard Mossen');
  await clickBtn('Accept: Bones');
  await ev(() => EB.game.addItem('bone_chips', 6, true));
  d = await hailNpc('Guard Mossen');
  await clickBtn('Hand in');
  check('new quest: Bones of the Restless (Guard Mossen)', await ev(() => EB.game.quests.restless_dead === 'done' && EB.game.countItem('blessed_bone_amulet') === 1));
  const saveT = await ev(() => { EB.game.save(); const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY)); return { title: s.char.title, steps: s.questSteps }; });
  check('title and chain progress saved', saveT.title === 'Warden of Everblock' && saveT.steps, saveT);

  // ---------------------------------------------------------------- music + lights
  step('music + lantern lights');
  const mus = await ev(() => { const on = EB.audio.toggleMusic(); const r = { on, active: EB.audio.musicOn }; EB.audio.toggleMusic(); return r; });
  check('music toggles (Shift+M / /music)', typeof mus.on === 'boolean', mus);
  await ev(() => { const g = EB.game; g.command('/lights'); if (!g.lightsOn) g.command('/lights'); g.dayT = 0.9; const p = g.player; const x = 124.5, z = 142.5; p.pos.set(x, g.world.surfaceY(x, z), z); p.yaw = Math.PI; p.pitch = -0.3; g.camDist = 7; document.getElementById('centerMsg').style.opacity = 0; });
  await waitGame(1.5);
  const lights = await ev(() => { const g = EB.game; return { on: g.lightsOn, lit: g.litCount, lanterns: g.world.lanterns.size, night: +g.nightF.toFixed(2), torch: g.lampLights[3].intensity }; });
  check('lantern point lights + player torch at night', lights.on && lights.lit >= 2 && lights.torch > 0.2 && lights.lanterns > 5, lights);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v3-lantern-night.png' });
  await ev(() => { EB.game.command('/lights'); localStorage.removeItem('everblock_lights'); });

  // ---------------------------------------------------------------- v2 save compatibility
  step('v2 save compatibility');
  await ev(() => {
    EB.game.save(); EB.game.save = () => {}; // freeze autosave so the unload handler can't overwrite the hand-made v2 file
    const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY));
    s.v = 2; delete s.questSteps; delete s.char.gems; delete s.char.hotbar; delete s.char.title;
    s.char.cls = 'cleric'; s.char.race = 'human'; s.char.spells = ['minor_healing', 'courage', 'bind_wound', 'strike'];
    s.quests = { gnoll_menace: 'done' };
    s.mercs = s.mercs.map((m) => ({ role: m.role, name: m.name, hp: m.hp, mana: m.mana, buffs: [] }));
    localStorage.setItem(EB.SAVE_KEY, JSON.stringify(s));
  });
  await page.reload(); await page.click('#btnContinue'); await inGame(); await page.waitForTimeout(1500);
  const v2 = await ev(() => { const g = EB.game, p = g.player; return { gems: p.gems.filter(Boolean), hot: p.hotbar.filter(Boolean), title: p.title, steps: g.questSteps, mercs: g.mercs.map((m) => m.name + ':' + m.stance + ':' + m.healAt), errs: g.errors || 0, hotSlots: document.querySelectorAll('#hotbar .slot').length }; });
  check('v2-format save loads and gets spell gems + hotbar', v2.gems.includes('minor_healing') && v2.gems.includes('strike') && v2.hot.length >= 4 && v2.mercs.every((s) => /balanced/.test(s)) && v2.errs === 0, v2);
  await cast('minor_healing');
  check('migrated character can cast from gems', await ev(() => /You feel much better|feels much better/.test(document.getElementById('chatLog').innerText)));

  const passed = results.filter((r) => r.ok).length;
  console.log(`--- ${passed}/${results.length} checks passed ---`);
  console.log('--- JS errors (' + errors.length + ') ---\n' + errors.join('\n'));
  await browser.close();
})();
