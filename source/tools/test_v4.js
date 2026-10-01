// Everblock v4 headless test: detailed rigged character/monster models, visible gear, animations, particles,
// graphics quality toggle, character-creation preview, save compatibility, and close-up screenshots.
const { chromium } = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const URL = process.env.URL || 'file://' + require('path').resolve(__dirname, '../../index.html');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const RACES = ['Human', 'Barbarian', 'Wood Elf', 'Dark Elf', 'Dwarf', 'Gnome', 'Ogre'];
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

  // ---------------------------------------------------------------- creation preview per race
  step('character creation 3D preview');
  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.waitForTimeout(600);
  check('preview canvas present and rendering', await ev(() => { const c = document.getElementById('charPreview'); return !!c && c.width > 100 && EB.models.TPL.size > 0; }));
  const classFor = { Human: 'Paladin', Barbarian: 'Shaman', 'Wood Elf': 'Ranger', 'Dark Elf': 'Necromancer', Dwarf: 'Warrior', Gnome: 'Wizard', Ogre: 'Warrior' };
  for (const r of RACES) {
    await page.click(`#raceList button:has-text("${r}")`);
    await page.click(`#classList button:has-text("${classFor[r]}")`);
    await page.waitForTimeout(500);
    await ev(() => EB.models.previewPose(0.45, 4000));
    await page.waitForTimeout(500);
    const key = r.toLowerCase().replace(/\s+/g, '');
    await page.locator('#menuCreate .createGrid').screenshot({ path: SHOTS + `v4-creation-${key}.png` });
  }
  const dims = await ev(() => { const o = {}; for (const r of Object.keys(EB.data.RACES)) { const s = EB.models.playerOpts({ race: r, cls: 'warrior', equip: {} }); o[r] = { leg: s.P.legLen, torsoW: s.P.torsoW, head: s.P.headS, ears: s.P.ears, beard: s.P.beard || null, hair: s.P.hairStyle, scale: s.scale }; } return o; });
  check('race proportions differ (dwarf short legs/big head, ogre broad, elves slim)', dims.dwarf.leg < dims.human.leg && dims.dwarf.head > dims.human.head && dims.ogre.torsoW > dims.barbarian.torsoW && dims.barbarian.torsoW > dims.woodelf.torsoW && dims.gnome.head > dims.dwarf.head, dims);
  check('race features: pointy elf ears, dwarf long beard, barbarian braids, ogre tusks', dims.woodelf.ears === 'pointy' && dims.darkelf.ears === 'pointy' && dims.dwarf.beard === 'long' && dims.barbarian.hair === 'braids' && (await ev(() => EB.models.playerOpts({ race: 'ogre', cls: 'warrior' }).P.tusks)), dims);

  // ---------------------------------------------------------------- in game: player gear
  step('player model with visible gear');
  await page.click('#raceList button:has-text("Barbarian")');
  await page.click('#classList button:has-text("Warrior")');
  await page.fill('#nameInput', 'Thorgrim');
  await page.click('#btnCreate');
  await inGame();
  await page.waitForTimeout(1500);
  check('preview stopped after create', await ev(() => !EB.models.previewing()));
  const base = await ev(() => { const M = EB.game.pmodel; return { rig: M.rig, boxes: M.boxes, wk: M.weaponKind, hasW: !!M.parts.weapon, bones: ['hips', 'torso', 'head', 'uarmL', 'farmL', 'handR', 'thighL', 'shinR'].every((b) => !!M.parts[b]) }; });
  check('player is a hierarchical rig with a starting sword', base.rig === 'human' && base.bones && base.hasW && base.wk === 'sword' && base.boxes > 60, base);
  await ev(() => { const g = EB.game, p = g.player; Object.assign(p.equip, { primary: { id: 'fang_warblade' }, secondary: { id: 'bone_shield' }, head: { id: 'bone_helm' }, chest: { id: 'orc_chain' }, back: { id: 'wolf_cloak' }, hands: { id: 'rawhide_gloves' }, feet: { id: 'leather_boots' }, legs: { id: 'ghoul_leggings' } }); g.renderInv && g.renderInv(); });
  await waitGame(0.6);
  const geared = await ev(() => { const M = EB.game.pmodel; return { wk: M.weaponKind, shield: !!M.parts.shield, helm: !!M.parts.helm, cloak: !!M.parts.cloak, tier: M.P.tier, pauldron: !!M.P.pauldron, boots: M.P.boots, gloves: M.P.gloves, inScene: !!M.group.parent }; });
  check('equipping rebuilds the model: longsword, bone shield, helm, cloak, chain tier', geared.wk === 'longsword' && geared.shield && geared.helm && geared.cloak && geared.tier === 'chain' && geared.pauldron && geared.inScene, geared);
  const kinds = await ev(() => ['rusty_dagger', 'rusty_mace', 'worn_staff', 'gnollish_club', 'frost_greatsword', 'bronze_long_sword', 'icicle_dagger'].map((id) => EB.models.weaponKind(id)));
  check('weapon models per type', kinds.join(',') === 'dagger,mace,staff,club,greatsword,longsword,dagger', kinds);

  // photo spot: flat meadow east of town
  await ev(() => {
    const g = EB.game, p = g.player, w = g.world, x = 170.5, z = 131.5;
    for (const m of g.mobs.slice()) if (Math.hypot(m.pos.x - 180, m.pos.z - 131) < 45) g.removeEntity(m);
    g.spawnT = 1e9; g.dayT = 0.36; p.pos.set(x, w.surfaceY(x, z), z); p.yaw = 0; p.pitch = 0; g.camDist = 4; g.setTarget(null);
  });
  await waitGame(0.4);
  await ev(() => { const g = EB.game, p = g.player, y = p.pos.y; g.camOverride = { pos: new THREE.Vector3(p.pos.x + 1.9, y + 1.9, p.pos.z + 2.9), look: new THREE.Vector3(p.pos.x, y + 1.25, p.pos.z) }; });
  await waitGame(0.5);
  await shot('v4-player-gear.png');
  await ev(() => { const g = EB.game, p = g.player, y = p.pos.y; g.camOverride = { pos: new THREE.Vector3(p.pos.x - 1.6, y + 2.2, p.pos.z - 3.2), look: new THREE.Vector3(p.pos.x, y + 1.3, p.pos.z) }; });
  await waitGame(0.3);
  await shot('v4-player-gear-back.png');

  // ---------------------------------------------------------------- animations
  step('animations');
  const anim = await ev(() => {
    const M = EB.models, spec = M.playerOpts({ race: 'human', cls: 'warrior', equip: { primary: { id: 'rusty_short_sword' } } }), m = M.buildModel(spec), P = m.parts;
    const snap = () => ({ tl: P.thighL.rotation.x, ur: P.uarmR.rotation.x, ul: P.uarmL.rotation.x, hy: P.hips.position.y, t: P.torso.rotation.x, iz: m.inner.rotation.z });
    const o = {};
    M.animateModel(m, 0, false, 0, false, { dt: 0.016, always: true }); o.idle = snap();
    for (let i = 0; i < 20; i++) M.animateModel(m, 1.5, true, 0, false, { dt: 0.05, always: true }); o.walkA = snap();
    for (let i = 0; i < 3; i++) M.animateModel(m, 1.5 + Math.PI, true, 0, false, { dt: 0.05, always: true }); o.walkB = snap();
    M.animateModel(m, 0, false, 0.2, false, { dt: 0.016, always: true }); o.atkWind = snap();
    M.animateModel(m, 0, false, 0.7, false, { dt: 0.016, always: true }); o.atkStrike = snap();
    M.animateModel(m, 0, false, 0, false, { dt: 0.016, cast: true, always: true }); o.cast = snap();
    M.animateModel(m, 0, false, 0, true, { dt: 0.016, always: true }); o.sit = snap();
    M.flinch(m); M.animateModel(m, 0, false, 0, false, { dt: 0.016, always: true }); o.flinch = snap(); o.flinchSt = m.st.flinch;
    M.setDead(m, true); for (let i = 0; i < 40; i++) M.animateModel(m, 0, false, 0, false, { dt: 0.05, always: true }); o.dead = snap();
    // mob-specific
    const mk = (t) => M.buildModel(M.mobOpts(t, EB.data.MOBS[t]));
    const rat = mk('rat'), snake = mk('snake'), skel = mk('skeleton'), beetle = mk('beetle');
    M.animateModel(rat, 0.5, true, 0, false, { dt: 0.05, always: true }); const r1 = rat.parts.legFL.rotation.x; M.animateModel(rat, 1.4, true, 0, false, { dt: 0.05, always: true }); const r2 = rat.parts.legFL.rotation.x;
    M.animateModel(snake, 0, true, 0, false, { dt: 0.05, always: true }); const s1 = snake.parts.seg3.rotation.y; M.animateModel(snake, 2, true, 0, false, { dt: 0.05, always: true }); const s2 = snake.parts.seg3.rotation.y;
    M.animateModel(snake, 0, false, 0.5, false, { dt: 0.05, always: true }); const strike = snake.parts.jaw.rotation.x;
    const sk = []; for (let i = 0; i < 12; i++) { M.animateModel(skel, i * 0.13, true, 0, false, { dt: 0.05, always: true }); sk.push(+skel.parts.thighL.rotation.x.toFixed(2)); }
    M.animateModel(beetle, 1, true, 0, false, { dt: 0.05, always: true });
    o.rat = [r1, r2]; o.snake = [s1, s2, strike]; o.skelSteps = new Set(sk).size; o.skelN = sk.length;
    o.ratStyle = rat.style; o.beetleRig = beetle.rig; o.kinds = ['rusty_dagger', 'rusty_mace', 'worn_staff', 'frost_greatsword'].map((id) => { const mm = M.buildModel(M.playerOpts({ race: 'human', cls: 'warrior', equip: { primary: { id } } })); return M.attackKindFor(mm); });
    return o;
  });
  check('walk cycle swings legs both ways', anim.walkA.tl * anim.walkB.tl < 0 && Math.abs(anim.walkA.tl) > 0.3, [anim.walkA.tl, anim.walkB.tl]);
  check('attack swing raises then strikes with the weapon arm', anim.atkWind.ur < -1.0 && anim.atkStrike.ur > anim.atkWind.ur, [anim.atkWind.ur, anim.atkStrike.ur]);
  check('cast pose raises both arms', anim.cast.ul < -1 && anim.cast.ur < -1, anim.cast);
  check('sit lowers the hips', anim.sit.hy < anim.idle.hy - 0.3, [anim.idle.hy, anim.sit.hy]);
  check('hit flinch leans back', anim.flinchSt > 0.9 && anim.flinch.t < anim.idle.t - 0.1, anim.flinch);
  check('death collapse rotates the body onto its side', Math.abs(anim.dead.iz - Math.PI / 2) < 0.05, anim.dead.iz);
  check('attack style per weapon type', anim.kinds.join(',') === 'pierce,crush,staff,slash2h', anim.kinds);
  check('rat scurry / snake slither + strike / skeleton jerky gait / beetle rig', anim.rat[0] !== anim.rat[1] && anim.snake[0] !== anim.snake[1] && anim.snake[2] > 0.3 && anim.skelSteps <= 7 && anim.ratStyle === 'rat' && anim.beetleRig === 'insect', anim);

  // ---------------------------------------------------------------- every mob type
  step('monster models');
  const mobs = await ev(() => {
    const M = EB.models, out = {};
    for (const t of Object.keys(EB.data.MOBS)) { const m = M.buildModel(M.mobOpts(t, EB.data.MOBS[t])); let meshes = 0; m.group.traverse((o) => { if (o.isMesh) meshes++; }); out[t] = { rig: m.rig, boxes: m.boxes, meshes, h: +m.height.toFixed(2), gear: !!m.parts.weapon }; }
    const a = M.buildModel(M.mobOpts('gnoll', EB.data.MOBS.gnoll)), b = M.buildModel(M.mobOpts('gnoll', EB.data.MOBS.gnoll));
    const sharedGeo = a.parts.head.children[0].geometry === b.parts.head.children[0].geometry && a.parts.head.children[0].material === b.parts.head.children[0].material;
    return { out, sharedGeo, legacyH: EB.data.MOBS.frost_giant.scale * 1.95 };
  });
  const types = Object.keys(mobs.out);
  check('all 18+ mob types build detailed rigs', types.length >= 18 && types.every((t) => mobs.out[t].boxes >= 25), Object.fromEntries(types.map((t) => [t, mobs.out[t].boxes])));
  check('humanoid mobs are highly detailed (>=60 boxes) with few draw calls (<=40 meshes)', types.filter((t) => mobs.out[t].rig === 'human').every((t) => mobs.out[t].boxes >= 60 && mobs.out[t].meshes <= 40), Object.fromEntries(types.map((t) => [t, mobs.out[t].meshes])));
  check('armed mobs carry weapon models', ['skel_warrior', 'gnoll', 'orc_grunt', 'orc_shaman', 'grimtusk', 'vorgath', 'grimbone', 'frost_giant'].every((t) => mobs.out[t].gear));
  check('collision heights unchanged (biped 1.95*scale)', Math.abs(mobs.out.frost_giant.h - mobs.legacyH) < 0.01 && Math.abs(mobs.out.rat.h - 0.45) < 0.01, [mobs.out.frost_giant.h, mobs.out.rat.h]);
  check('instances share cached geometry + materials', mobs.sharedGeo);
  const other = await ev(() => { const g = EB.game, M = EB.models; const n = g.npcs.map((x) => ({ n: x.name, k: x.npcKind, boxes: x.model.boxes })); const pet = M.buildModel(M.petOpts(13)), tank = M.buildModel(M.mercOpts('tank', {})), heal = M.buildModel(M.mercOpts('healer', {})); return { n, pet: [pet.boxes, !!pet.parts.helm], tank: [tank.weaponKind, !!tank.parts.shield, !!tank.parts.helm], heal: heal.weaponKind }; });
  check('NPCs, mercs and necro pets use the new rigs with gear', other.n.length > 5 && other.n.every((x) => x.boxes >= 60) && other.tank[0] === 'axe' && other.tank[1] && other.tank[2] && other.heal === 'mace' && other.pet[1], other);

  // gallery: lineup of every monster type, idle + some attacking
  step('monster gallery');
  await ev(() => {
    const g = EB.game, w = g.world, M = EB.models, p = g.player;
    g.camOverride = null; g.showcase = []; window.__gal = [];
    // photo stage: a flat stone display plinth so the uneven voxel terrain doesn't hide the small monsters
    let top = 0; for (let x = 168; x < 214; x++) for (let z = 74; z < 88; z++) top = Math.max(top, w.surfaceY(x + 0.5, z + 0.5));
    const stage = new THREE.Group(), smat = new THREE.MeshLambertMaterial({ color: 0x4a4640, map: EB.models.GRAIN }), tmat = new THREE.MeshLambertMaterial({ color: 0x3a2e24, map: EB.models.GRAIN });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(46, 3, 12), smat); slab.position.set(191, top - 1.5 + 0.02, 80.5); stage.add(slab);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(46.4, 0.25, 12.4), tmat); trim.position.set(191, top - 0.1, 80.5); stage.add(trim);
    g.scene.add(stage); window.__stage = stage; window.__top = top + 0.02;
    const order = ['rat', 'snake', 'beetle', 'wolf', 'frost_wolf', 'skeleton', 'skel_warrior', 'ghoul', 'grimbone', 'gnoll_pup', 'gnoll', 'fippy', 'orc_grunt', 'orc_shaman', 'grimtusk', 'yeti', 'frost_giant', 'vorgath'];
    let x = 171;
    for (const t of order) {
      const d = EB.data.MOBS[t], m = M.buildModel(M.mobOpts(t, d)), wd = Math.max(1.3, m.width * (m.rig === 'human' ? 2.2 : 1.6));
      x += wd / 2; const z = 80.5; m.group.position.set(x, window.__top, z); m.group.rotation.y = 0.15; x += wd / 2 + 0.2;
      g.scene.add(m.group); g.showcase.push({ M: m, attack: false }); window.__gal.push({ t, x, m });
    }
    p.pos.set(150, w.surfaceY(150, 150), 150);
  });
  const gal = await ev(() => window.__gal.map((o) => [o.t, +o.m.group.position.x.toFixed(1)]));
  const midX = (gal[0][1] + gal[gal.length - 1][1]) / 2, span = gal[gal.length - 1][1] - gal[0][1];
  await ev(([mx, span]) => { const g = EB.game, y = window.__top; g.camOverride = { pos: new THREE.Vector3(mx, y + 7, 80.5 + span * 0.5), look: new THREE.Vector3(mx, y + 0.6, 80.5) }; }, [midX, span]);
  await waitGame(0.6);
  await shot('v4-monster-gallery.png', true);
  // close-ups per family
  const fam = [['v4-monsters-vermin.png', ['rat', 'snake', 'beetle', 'wolf', 'frost_wolf']], ['v4-monsters-undead.png', ['skeleton', 'skel_warrior', 'ghoul', 'grimbone']], ['v4-monsters-gnolls-orcs.png', ['gnoll_pup', 'gnoll', 'fippy', 'orc_grunt', 'orc_shaman', 'grimtusk']], ['v4-monsters-giants.png', ['yeti', 'frost_giant', 'vorgath']]];
  for (const [file, ts] of fam) {
    await ev((ts) => {
      const g = EB.game, sel = window.__gal.filter((o) => ts.includes(o.t)), xs = sel.map((o) => o.m.group.position.x), a = Math.min(...xs), b = Math.max(...xs), mx = (a + b) / 2;
      const hmax = Math.max(...sel.map((o) => o.m.height)), y = Math.max(...sel.map((o) => o.m.group.position.y));
      for (const sc of g.showcase) sc.attack = false;
      g.showcase.forEach((sc, i) => { if (ts.includes(window.__gal[i].t) && i % 2 === 1) sc.attack = true; });
      const dist = Math.max(2.4, (b - a) * 0.62 + hmax * 0.8);
      g.camOverride = { pos: new THREE.Vector3(mx + 0.4, y + hmax * 0.62 + 0.35, 80.5 + dist), look: new THREE.Vector3(mx, y + hmax * 0.36, 80.5) };
    }, ts);
    await waitGame(0.9);
    await shot(file, true);
  }
  await ev(() => { const g = EB.game; for (const o of window.__gal) { EB.models.dispose(o.m); } g.showcase = []; g.camOverride = null; });

  // race lineup in the world (all races in class gear)
  await ev(() => {
    const g = EB.game, w = g.world, M = EB.models; g.showcase = []; window.__races = [];
    const looks = [['human', 'paladin', { primary: 'bronze_long_sword', secondary: 'wooden_shield', chest: 'orc_chain', head: 'cloth_cap' }], ['barbarian', 'shaman', { primary: 'rusty_mace', chest: 'leather_tunic', back: 'yeti_cloak', feet: 'snow_boots' }], ['woodelf', 'ranger', { primary: 'rusty_short_sword', chest: 'leather_tunic', back: 'hollis_cloak', feet: 'leather_boots' }],
      ['darkelf', 'necromancer', { primary: 'worn_staff', chest: 'cloth_robe' }], ['dwarf', 'warrior', { primary: 'gnollish_club', secondary: 'bone_shield', chest: 'orc_chain', head: 'bone_helm', feet: 'leather_boots' }], ['gnome', 'wizard', { primary: 'oak_staff', chest: 'cloth_robe' }], ['ogre', 'warrior', { primary: 'frost_greatsword', chest: 'leather_tunic', head: 'giant_helm', hands: 'rawhide_gloves' }]];
    let x = 176;
    looks.forEach(([race, cls, eq], i) => {
      const equip = {}; for (const k in eq) equip[k] = { id: eq[k] };
      const m = M.buildModel(M.playerOpts({ race, cls, equip })), z = 80.5;
      m.group.position.set(x, window.__top, z); m.group.rotation.y = 0.2 - i * 0.05; x += 1.35 + (race === 'ogre' ? 0.4 : 0);
      g.scene.add(m.group); g.showcase.push({ M: m, cast: cls === 'necromancer' || cls === 'wizard', castColor: cls === 'wizard' ? 0x80b0ff : 0xb060ff }); window.__races.push(m);
    });
    const mx = 176 + (x - 176 - 1.35) / 2, y = Math.max(...window.__races.map((m) => m.group.position.y));
    g.camOverride = { pos: new THREE.Vector3(mx, y + 1.9, 80.5 + 5.4), look: new THREE.Vector3(mx, y + 1.05, 80.5) };
  });
  await waitGame(0.8);
  await shot('v4-races-lineup.png', true);
  await ev(() => { const g = EB.game; for (const m of window.__races) EB.models.dispose(m); g.scene.remove(window.__stage); g.showcase = []; g.camOverride = null; });

  // ---------------------------------------------------------------- particles & combat
  step('spell particles in combat');
  const fx0 = await ev(() => EB.fx.counts.spawned);
  await ev(() => {
    const g = EB.game, p = g.player, w = g.world, x = 170.5, z = 131.5;
    p.pos.set(x, w.surfaceY(x, z), z); g.spawnT = 1e9;
    g.addMerc('healer', null, true); g.addMerc('tank', null, true);
    const mk = (t, dx, dz) => { const m = new EB.ent.Mob(t, null, x + dx, w.surfaceY(x + dx, z + dz), z + dz); g.mobs.push(m); m.addTo ? m.addTo(g.scene) : g.scene.add(m.model.group); m.home.copy(m.pos); return m; };
    window.__g1 = mk('gnoll', 1.5, 4.2); window.__g2 = mk('skel_warrior', -1.6, 4.6); window.__g3 = mk('ghoul', 3.4, 6.5);
    for (const m of [window.__g1, window.__g2, window.__g3]) { m.level = 3; m.maxHp = m.hp = 5000; m.aggroOn(p, g); }
    window.__g1.dots = [{ id: 'disease_cloud', name: 'Disease Cloud', src: p, dmg: 1, left: 60, next: 3, school: 'disease' }];
    window.__g3.dots = [{ id: 'heat_blood', name: 'Heat Blood', src: p, dmg: 1, left: 60, next: 3, school: 'fire' }];
    p.maxHpBonus = 0; p.yaw = 0; g.setTarget(window.__g2); g.dayT = 0.7;
  });
  await waitGame(2.5);
  await ev(() => { const g = EB.game, p = g.player; p.hp = p.maxHp; for (const m of g.mercs) m.hp = m.maxHp; });
  const fxState = await ev(() => { const g = EB.game; g.spellFx(window.__g2, 'fire', 'nuke'); g.spellFx(window.__g1, 'cold', 'nuke'); EB.fx.heal(g.mercs.find((m) => m.role === 'tank') || g.player); EB.fx.heal(g.player); return { n: EB.fx.n, bolts: EB.fx.bolts.length }; });
  await waitGame(0.12);
  await ev(() => {
    const g = EB.game, p = g.player, y = p.pos.y, t = window.__g2;
    p.spells.push('minor_healing'); p.casting = { id: 'minor_healing', t: 0, total: 60, target: p, skill: false, startPos: p.pos.clone() };
    p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    g.camOverride = { pos: new THREE.Vector3(p.pos.x + 6.8, y + 3.4, p.pos.z - 0.6), look: new THREE.Vector3(p.pos.x + 0.2, y + 1.0, p.pos.z + 2.4) };
  });
  await waitGame(0.5);
  await ev(() => { const g = EB.game, p = g.player, h = g.castHand(p); EB.fx.bolt(h, window.__g2, 0xff7020, { speed: 5, size: 0.55 }); EB.fx.bolt(h.clone().add(new THREE.Vector3(0, 0.3, 0)), window.__g1, 0x80d0ff, { speed: 7, size: 0.5 }); g.spellFx(window.__g3, 'magic', 'stun'); EB.fx.heal(g.mercs.find((m) => m.role === 'tank') || p); });
  await waitGame(0.3);
  await shot('v4-combat-spells.png');
  const fx1 = await ev(() => ({ spawned: EB.fx.counts.spawned, n: EB.fx.n, ring: EB.game.ring.visible }));
  check('spell particles spawn (bolts, bursts, heal sparkles, DoT clouds)', fxState.bolts >= 2 && fx1.spawned - fx0 > 200 && fx1.n > 50, { fxState, fx1 });
  check('target selection ring shown', fx1.ring);
  // mob & merc flinch hooks
  const fl = await ev(() => { const g = EB.game; g.damageMob(window.__g2, 1, g.player); const a = window.__g2.model.st.flinch; g.damagePlayer(1, window.__g2); return [a, g.pmodel.st.flinch]; });
  check('hit flinch triggers on mobs and player', fl[0] > 0.5 && fl[1] > 0.5, fl);
  // cast pose + glow on the player (third person)
  await ev(() => { const g = EB.game, p = g.player; g.camOverride = null; g.camDist = 5; p.spells.push('minor_healing'); p.casting = { id: 'minor_healing', t: 0, total: 30, target: p, skill: false, startPos: p.pos.clone() }; });
  await waitGame(0.4);
  const castPose = await ev(() => { const P = EB.game.pmodel.parts; return { ul: P.uarmL.rotation.x, ur: P.uarmR.rotation.x, n: EB.fx.n }; });
  check('player cast pose with hand-glow particles', castPose.ul < -0.7 && castPose.ur < -0.7 && castPose.n > 0, castPose);
  await ev(() => { EB.game.player.casting = null; EB.game.camOverride = null; });
  // death collapse of a real mob
  await ev(() => { const g = EB.game; window.__g1.hp = 1; g.damageMob(window.__g1, 50, g.player); });
  await waitGame(1.0);
  const dead = await ev(() => ({ alive: window.__g1.alive, rz: window.__g1.model.inner.rotation.z, dark: window.__g1.model.parts.torso.children[0].material === EB.models.MAT.dark }));
  check('mob death collapse animation + darkened corpse', !dead.alive && Math.abs(dead.rz - Math.PI / 2) < 0.05 && dead.dark, dead);

  // ---------------------------------------------------------------- gfx toggle + perf
  step('graphics quality toggle & performance');
  await ev(() => EB.game.command('/gfx low'));
  const low = await ev(() => ({ map: !!EB.models.MAT.body.map, shadow: EB.game.pmodel.shadow.visible, rim: EB.models.RIM.value, pref: localStorage.getItem('everblock_gfx'), pr: EB.game.renderer.getPixelRatio() }));
  check('/gfx low: flat models, no blob shadows, no rim, stored', !low.map && !low.shadow && low.rim === 0 && low.pref === 'low' && low.pr === 1, low);
  await ev(() => { document.getElementById('helpBtn').click(); });
  await page.click('#gfxBtns button[data-gfx="high"]');
  const high = await ev(() => ({ map: !!EB.models.MAT.body.map, shadow: EB.game.pmodel.shadow.visible, rim: EB.models.RIM.value, pref: localStorage.getItem('everblock_gfx'), on: document.querySelector('#gfxBtns button.on').dataset.gfx }));
  check('help-window High button restores quality', high.map && high.shadow && high.rim > 0 && high.pref === 'high' && high.on === 'high', high);
  await ev(() => EB.game.toggleWin('helpWin'));
  const fps = await ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  const info = await ev(() => EB.game.renderer.info.render);
  check('frame rate sane in software renderer with models + particles', fps > 4, { fps: +fps.toFixed(1), calls: info.calls, tris: info.triangles });

  // ---------------------------------------------------------------- saves
  step('save compatibility');
  await ev(() => { const g = EB.game; for (const m of g.mobs.slice()) if (m === window.__g2 || m === window.__g3) g.removeEntity(m); g.save(); });
  const saved = await ev(() => { const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY)); return { v: s.v, eq: Object.keys(s.char.equip).length, mercs: (s.mercs || []).length }; });
  await page.reload();
  await page.click('#btnContinue');
  await inGame();
  await page.waitForTimeout(1500);
  const re = await ev(() => { const g = EB.game, M = g.pmodel; return { wk: M.weaponKind, helm: !!M.parts.helm, cloak: !!M.parts.cloak, mercs: g.mercs.map((m) => [m.role, m.model.rig, m.model.weaponKind]), gfx: g.gfxPref }; });
  check('v4 save round-trip keeps gear visible on the model and mercs rebuilt', re.wk === 'longsword' && re.helm && re.cloak && re.mercs.length === 2 && re.mercs.every((m) => m[1] === 'human'), { saved, re });
  // a v3-era save (same format, no v4 fields) with a pet + corpse loads
  const v3 = await ev(() => {
    EB.game.save = () => {};
    const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY)); s.v = 3; s.char.race = 'dwarf'; s.char.cls = 'necromancer';
    s.char.equip = { primary: { id: 'worn_staff' }, chest: { id: 'cloth_robe' } }; s.mercs = [{ role: 'pet', petLvl: 8, hp: 50, buffs: [], equip: {} }];
    localStorage.setItem(EB.SAVE_KEY, JSON.stringify(s)); return true;
  });
  await page.reload();
  await page.click('#btnContinue');
  await inGame();
  await page.waitForTimeout(1500);
  const v3r = await ev(() => { const g = EB.game; return { race: g.player.race, wk: g.pmodel.weaponKind, robe: !!g.pmodel.P.robe, pet: g.mercs.map((m) => [m.isPet, m.petLvl, m.model.weaponKind, !!m.model.parts.shield]) }; });
  check('v3 save (dwarf necro + level 8 pet) loads with new models', v3 && v3r.race === 'dwarf' && v3r.wk === 'staff' && v3r.robe && v3r.pet.length === 1 && v3r.pet[0][2] === 'sword' && v3r.pet[0][3], v3r);
  await ev(() => { const g = EB.game, p = g.player, w = g.world, pet = g.mercs[0], x = 170.5, z = 131.5; p.pos.set(x, w.surfaceY(x, z), z); p.yaw = 0.9; g.camDist = 4.2; g.dayT = 0.4; if (pet) { pet.pos.set(x + 1.4, w.surfaceY(x + 1.4, z + 1), z + 1); } });
  await waitGame(0.8);
  await ev(() => { const g = EB.game, p = g.player, y = p.pos.y; g.camOverride = { pos: new THREE.Vector3(p.pos.x + 2.6, y + 1.8, p.pos.z + 3.4), look: new THREE.Vector3(p.pos.x + 0.6, y + 0.9, p.pos.z + 0.5) }; });
  await waitGame(0.4);
  await shot('v4-dwarf-necro-pet.png');
  await ev(() => { EB.game.camOverride = null; });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log('JS errors:', errors.length ? errors : 0);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
