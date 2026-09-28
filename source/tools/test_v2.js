// Everblock v2 headless test: mercs/group, A* pathing through doorways, separation, zone line, quests, minimap, save/zone persistence
const { chromium } = require('playwright-core');
const SHOTS = process.env.SHOTS || require('path').resolve(__dirname, '../../screenshots') + '/';
const hidePrompt = (page) => page.evaluate(() => { const e = document.getElementById('clickToPlay'); if (e) e.style.visibility = 'hidden'; });
const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' ' + JSON.stringify(info) : '')); };
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
  await page.goto('file://' + require('path').resolve(__dirname, '../../index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Human")');
  await page.click('#classList button:has-text("Warrior")');
  await page.fill('#nameInput', 'Jeramey');
  await page.click('#btnCreate');
  await inGame();
  await page.waitForTimeout(2000);

  step('minimap');
  const mm = await page.evaluate(() => { const c = document.getElementById('minimap'); const d = c.getContext('2d').getImageData(80, 80, 10, 10).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return { visible: !c.classList.contains('hidden') && c.offsetWidth > 100, sum: s }; });
  check('minimap drawn', mm.visible && mm.sum > 0, mm);
  await page.keyboard.press('KeyN');
  const mmHidden = await page.evaluate(() => document.getElementById('minimap').classList.contains('hidden'));
  await page.keyboard.press('KeyN');
  check('N toggles minimap', mmHidden);

  step('hire mercs');
  await page.evaluate(() => { const g = EB.game, p = g.player; g.gainXP(0); p.coins += 500000;
    const b = g.npcs.find((n) => n.npcKind === 'liaison'); p.pos.set(b.pos.x + 2, b.pos.y, b.pos.z); g.setTarget(b); });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  const mwOpen = await page.evaluate(() => !document.getElementById('mercWin').classList.contains('hidden'));
  check('liaison opens merc window', mwOpen);
  await page.click('#mercList button >> nth=0');
  await page.waitForTimeout(200);
  await page.click('#mercList button >> nth=1');
  await page.keyboard.press('Escape');
  const grp = await page.evaluate(() => ({ mercs: EB.game.mercs.map((m) => m.name + ' L' + m.level), rows: document.querySelectorAll('#groupWin .gmem').length }));
  check('two mercs hired + group window', grp.mercs.length === 2 && grp.rows === 2, grp);

  step('group fight');
  // level up to 6 so mercs have heals; fight a pack of gnolls
  const setup = await page.evaluate(() => {
    const g = EB.game, p = g.player, w = g.world, L = EB.WORLD.LAYOUT;
    while (p.level < 6) g.gainXP(EB.data.xpToNext(p.level));
    p.hp = p.maxHp;
    const gn = g.mobs.filter((m) => m.alive && m.type === 'gnoll').sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
    const t = gn[0];
    t.level = 7; t.maxHp = t.hp = 300; t.refreshPlate(g);
    const tx = 178.5, tz = 131.5; t.pos.set(tx, w.surfaceY(tx, tz), tz); t.home.copy(t.pos); t.state = 'idle';
    const px = tx - 3.2, pz = tz + 0.8;
    p.pos.set(px, w.surfaceY(px, pz), pz); p.hp = Math.floor(p.maxHp * 0.55);
    for (const [i, m] of g.mercs.entries()) { const mx = px - 2.5, mz = pz + (i ? -2 : 2.2); m.pos.set(mx, w.surfaceY(mx, mz), mz); m.hp = m.maxHp; m.mana = m.maxMana; }
    p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - 0.5; p.pitch = -0.28; g.camDist = 8; g.dayT = 0.35;
    g.setTarget(t); g.toggleAuto(true);
    return { lvl: p.level, mercLvls: g.mercs.map((m) => m.level), target: t.name };
  });
  console.log('setup', JSON.stringify(setup));
  let shot = false, fightInfo = null, sawHeal = false, sawTank = false;
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const g = EB.game, t = g.target, p = g.player;
      if (t && t.kind === 'mob' && t.alive) { p.yaw = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - 0.5; if (p.pos.distanceTo(t.pos) > 2.6) { p.pos.x += (t.pos.x - p.pos.x) * 0.3; p.pos.z += (t.pos.z - p.pos.z) * 0.3; p.pos.y = g.world.surfaceY(p.pos.x, p.pos.z); } if (!p.autoAttack) g.toggleAuto(true); }
      if (p.hp < p.maxHp * 0.25) p.hp = p.maxHp * 0.5;
      const log = document.getElementById('chatLog').innerText;
      const healer = g.mercs.find((m) => m.role === 'healer'), tank = g.mercs.find((m) => m.role === 'tank');
      return { alive: !!(t && t.alive), thp: t ? t.hp : 0, php: p.hp, pmax: p.maxHp, healCast: !!(healer && healer.casting) || /Sister Maelin begins casting|Maelin.*heal/i.test(log), tankHit: t && t.hate && tank ? (t.hate.get(tank) || 0) : 0, frozen: !!window.__frozen, mercNear: g.mercs.every((m) => m.pos.distanceTo(p.pos) < 8) };
    });
    if (st.healCast) sawHeal = true;
    if (st.tankHit > 0) sawTank = true;
    if (!shot && ((sawHeal && i > 3) || i > 14) && st.alive && st.mercNear) {
      await page.evaluate(() => { const g = EB.game; g._orig = g.update; g.update = function () {}; window.__frozen = true; });
      await hidePrompt(page); await page.waitForTimeout(250);
      await page.screenshot({ path: SHOTS + 'v2-merc-group.png' }); shot = true;
      await page.evaluate(() => { const g = EB.game; g.update = g._orig; window.__frozen = false; });
    }
    if (!st.alive) break;
    fightInfo = st;
  }
  const after = await page.evaluate(() => { const g = EB.game; const log = document.getElementById('chatLog').innerText; return { killed: !(g.target && g.target.alive), party: /party experience/.test(log), heals: (log.match(/Sister Maelin begins casting/g) || []).length, taunts: /Borin Stoutshield taunts|taunt/i.test(log), mercs: g.mercs.map((m) => `${m.name} ${Math.ceil(m.hp)}/${m.maxHp}`), log: log.split('\n').slice(-14).join('\n') }; });
  console.log(after.log);
  check('group killed target', after.killed, { mercs: after.mercs });
  check('tank engaged (hate on tank)', sawTank);
  check('party experience split', after.party);
  // make the player hurt, confirm cleric heals
  await page.evaluate(() => { const g = EB.game, p = g.player; g.setTarget(null); p.autoAttack = false; p.hp = Math.floor(p.maxHp * 0.4); });
  await page.waitForTimeout(6000);
  const healed = await page.evaluate(() => { const p = EB.game.player; return { hp: p.hp, max: p.maxHp, log: document.getElementById('chatLog').innerText.split('\n').filter((l) => /Maelin/.test(l)).slice(-3) }; });
  check('cleric merc heals player', healed.hp > healed.max * 0.5 || sawHeal, healed);
  // player heal targeting merc (F2) is class dependent; verify F2 targets merc
  await page.keyboard.press('F2');
  const f2 = await page.evaluate(() => EB.game.target && EB.game.target.kind);
  check('F2 targets merc', f2 === 'merc');
  await page.keyboard.press('Escape');

  step('separation');
  const sep = await page.evaluate(async () => { const g = EB.game, p = g.player, w = g.world;
    const ms = g.mobs.filter((m) => m.alive && m.type === 'rat').slice(0, 3);
    const x = 160.5, z = 172.5, y = w.surfaceY(x, z);
    for (const m of ms) { m.pos.set(x, y, z); m.home.set(x, y, z); m.state = 'idle'; }
    p.pos.set(x + 0.1, y, z + 0.1);
    await new Promise((r) => setTimeout(r, 1500));
    let minD = 99; const all = [...ms.filter((m) => m.alive), p]; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) minD = Math.min(minD, Math.hypot(all[i].pos.x - all[j].pos.x, all[i].pos.z - all[j].pos.z));
    return { minD: +minD.toFixed(2), n: all.length }; });
  check('separation pushes stacked entities apart', sep.minD > 0.4, sep);

  step('A* pathing through doorways');
  // dismiss mercs temporarily from the fight area: park them in town
  const pathSetup = await page.evaluate(() => {
    const g = EB.game, p = g.player, w = g.world, R = w.dungeonRooms, fy = w.dungeonFloor;
    // clear crypt mobs, keep one skeleton in room (1,0)
    for (const m of g.mobs) if (m.alive && m.pos.y < fy + 3 && Math.abs(m.pos.x - R[4].x) < 25 && Math.abs(m.pos.z - R[4].z) < 25) { m.alive = false; m.state = 'dead'; m.model.group.visible = false; m.plate.visible = false; m.slot && (m.slot.respawnAt = 1e9); if (m.spawn) m.spawn.respawnAt = 1e9; }
    g.mobs = g.mobs.filter((m) => m.alive);
    for (const s of g.slots) if (Math.abs(s.def.x - R[4].x) < 25 && Math.abs(s.def.z - R[4].z) < 25) s.respawnAt = 1e9;
    const src = R[1], dst = R[4];
    const m = new EB.ent.Mob('skel_warrior', { def: { x: src.x, z: src.z, radius: 1 } }, src.x, fy, src.z, 5);
    m.refreshPlate(g); m.addTo(g.scene); m.syncModel(); g.mobs.push(m);
    m.maxHit = 1;
    p.pos.set(dst.x - 3.5, fy, dst.z); p.yaw = Math.PI / 2; p.pitch = -0.15; g.camDist = 4.5; g.dayT = 0.5; p.hp = p.maxHp;
    for (const mc of g.mercs) { mc.pos.set(dst.x + 4.5, fy, dst.z + 2); }
    window.__savedMercs = g.mercs.splice(0); for (const mc of window.__savedMercs) mc.model.group.visible = mc.plate.visible = false;
    window.__pm = m; m.aggroOn(p, g, true);
    const path = EB.path.findPath(w, { x: Math.floor(src.x), y: fy, z: Math.floor(src.z) }, { x: Math.floor(dst.x), y: fy, z: Math.floor(dst.z) }, { clear: 2 });
    return { src: [src.x, src.z], dst: [dst.x, dst.z], pathLen: path ? path.length : -1, reached: path && path.reached };
  });
  console.log('path setup', JSON.stringify(pathSetup));
  check('A* finds route room(1,0)->room(1,1) through doors', pathSetup.pathLen > 14 && pathSetup.reached !== false, pathSetup);
  let pathShot = false, arrived = false, maxDoorX = null; const trace = [];
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const g = EB.game, m = window.__pm, p = g.player, w = g.world, R = w.dungeonRooms; p.hp = p.maxHp;
      return { x: +m.pos.x.toFixed(1), z: +m.pos.z.toFixed(1), d: +m.pos.distanceTo(p.pos).toFixed(2), state: m.state, alive: m.alive, doorXs: [R[4].rx - 1, R[4].rx + 11], doorZ: R[4].z }; });
    trace.push([st.x, st.z]);
    // mob approaching / passing the west doorway of room (1,1)
    if (!pathShot && st.doorXs.some((dx) => Math.abs(st.x - dx) < 1.6) && Math.abs(st.z - st.doorZ) < 2.5) {
      await page.evaluate(() => { const g = EB.game, p = g.player, m = window.__pm; p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z) + 0.15; g._orig = g.update; g.update = function () {}; });
      await page.evaluate(() => { const g = EB.game; g._orig.call(g, 0.016); g.update = function () {}; });
      await hidePrompt(page); await page.waitForTimeout(250);
      await page.screenshot({ path: SHOTS + 'v2-pathing-doorway.png' }); pathShot = true;
      await page.evaluate(() => { const g = EB.game; g.update = g._orig; });
    }
    if (st.d < 3.2) { arrived = true; break; }
  }
  console.log('trace', trace.map((t) => t.join(',')).join(' '));
  check('skeleton pathed through doorways to player', arrived, { steps: trace.length, last: trace[trace.length - 1] });
  check('doorway screenshot taken', pathShot);
  if (!pathShot) { await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v2-pathing-doorway.png' }); }
  const pc = await page.evaluate(() => EB.game.pathCount || 0);
  console.log('A* searches so far:', pc);
  await page.evaluate(() => { const g = EB.game, m = window.__pm, p = g.player; g.removeEntity(m); for (const mc of window.__savedMercs) { g.mercs.push(mc); mc.model.group.visible = true; mc.pos.set(p.pos.x + 1, p.pos.y, p.pos.z + 1); } g.renderGroup(); });

  step('quest: gnoll menace');
  await page.evaluate(() => { const g = EB.game, p = g.player, h = g.npcs.find((n) => n.name === 'Guard Halric'); p.pos.set(h.pos.x + 2, h.pos.y, h.pos.z); g.setTarget(h); });
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(600);
  const dlg1 = await page.evaluate(() => ({ open: !document.getElementById('dialogWin').classList.contains('hidden'), text: document.getElementById('dlgText').innerText.slice(0, 80) }));
  check('hail quest giver opens dialog', dlg1.open, dlg1);
  await page.click('#dlgBtns button:has-text("Accept")');
  await page.evaluate(() => { EB.game.addItem('gnoll_fang', 4, true); });
  await page.waitForTimeout(1500);
  const qtrack = await page.evaluate(() => document.getElementById('questWin').innerText);
  check('quest tracker shows progress', /4\/4/.test(qtrack), qtrack.replace(/\n/g, ' | '));
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(600);
  await page.click('#dlgBtns button:has-text("Hand in")');
  const qdone = await page.evaluate(() => { const g = EB.game; return { st: g.quests.gnoll_menace, bracer: g.countItem('militia_bracer'), fangs: g.countItem('gnoll_fang') }; });
  check('quest turned in, reward received', qdone.st === 'done' && qdone.bracer === 1 && qdone.fangs === 0, qdone);

  step('zone line -> Frostfang');
  await page.evaluate(() => { const g = EB.game, p = g.player, w = g.world; while (p.level < 12) g.gainXP(EB.data.xpToNext(p.level));
    p.pos.set(128.5, w.surfaceY(128.5, 7.5), 7.5); p.yaw = Math.PI; p.pitch = 0; g.dayT = 0.4;
    for (const m of g.mercs) { m.pos.set(127.5, w.surfaceY(127.5, 9.5), 9.5); m.hp = m.maxHp; } });
  await page.waitForTimeout(600);
  await page.keyboard.down('KeyW');
  let fadeShot = false;
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(150); const on = await page.evaluate(() => document.getElementById('zoneFade').classList.contains('on')); if (on && !fadeShot) { await page.screenshot({ path: '/tmp/v2-zonefade.png' }); fadeShot = true; break; } }
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => EB.game.world.zoneId === 'frostfang' && !EB.game.zoning, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const zinfo = await page.evaluate(() => { const g = EB.game; return { zone: g.world.zoneId, name: g.world.zoneName, pos: g.player.pos.toArray().map((v) => +v.toFixed(1)), mobs: g.mobs.length, mercs: g.mercs.map((m) => +m.pos.distanceTo(g.player.pos).toFixed(1)), entered: /You have entered The Frostfang/.test(document.getElementById('chatLog').innerText), types: [...new Set(g.mobs.map((m) => m.type))], lv: [Math.min(...g.mobs.map((m) => m.level)), Math.max(...g.mobs.map((m) => m.level))] }; });
  check('walked through zone line into Frostfang', zinfo.zone === 'frostfang' && zinfo.entered && fadeShot, zinfo);
  check('mercs followed across zone', zinfo.mercs.length === 2 && zinfo.mercs.every((d) => d < 6));
  // scenic shot at the outpost looking north toward the warcamp / keep
  await page.evaluate(() => { const g = EB.game, p = g.player, w = g.world, F = EB.WORLD.FF; const x = 128.5, z = 212.5; p.pos.set(x, w.surfaceY(x, z), z); p.yaw = Math.PI; p.pitch = -0.08; g.camDist = 6.5; g.dayT = 0.33;
    for (const [i, m] of g.mercs.entries()) { const mx = x + (i ? 1.5 : -1.5), mz = z - 1.5; m.pos.set(mx, w.surfaceY(mx, mz), mz); } });
  await page.waitForTimeout(3500);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v2-frostfang.png' });
  // fight at the orc warcamp with the group
  await page.evaluate(() => { const g = EB.game, p = g.player, w = g.world;
    const o = g.mobs.filter((m) => m.alive && m.type === 'orc_grunt').sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
    const x = 100.5, z = 143.5, ox = 97.5, oz = 139.5;
    o.pos.set(ox, w.surfaceY(ox, oz), oz); o.home.copy(o.pos); o.state = 'idle';
    p.pos.set(x, w.surfaceY(x, z), z); p.yaw = Math.atan2(ox - x, oz - z) + 0.45; p.pitch = -0.18; g.camDist = 8; g.dayT = 0.3; p.hp = p.maxHp;
    for (const [i, m] of g.mercs.entries()) { const mx = x + (i ? 1.8 : -1.2), mz = z + (i ? 0.5 : 2); m.pos.set(mx, w.surfaceY(mx, mz), mz); m.hp = m.maxHp; m.mana = m.maxMana; }
    g.setTarget(o); g.toggleAuto(true); window.__orc = o; });
  let orcShot = false;
  for (let i = 0; i < 110; i++) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const g = EB.game, p = g.player, o = window.__orc; if (o.alive && g.target !== o) g.setTarget(o); if (o.alive && !p.autoAttack) g.toggleAuto(true); if (p.hp < p.maxHp * 0.3) p.hp = p.maxHp * 0.6;
      if (o.alive) { p.yaw = Math.atan2(o.pos.x - p.pos.x, o.pos.z - p.pos.z) + 0.45; if (p.pos.distanceTo(o.pos) > 2.6) { p.pos.x += (o.pos.x - p.pos.x) * 0.3; p.pos.z += (o.pos.z - p.pos.z) * 0.3; p.pos.y = g.world.surfaceY(p.pos.x, p.pos.z); } }
      return { alive: o.alive, fighting: o.state === 'chase' && o.hp < o.maxHp }; });
    if (!orcShot && st.fighting && i > 6) { await page.evaluate(() => { const g = EB.game; g._orig = g.update; g.update = function () {}; }); await hidePrompt(page); await page.waitForTimeout(250); await page.screenshot({ path: SHOTS + 'v2-warcamp-fight.png' }); orcShot = true; await page.evaluate(() => { const g = EB.game; g.update = g._orig; }); }
    if (!st.alive) break;
  }
  const orcDone = await page.evaluate(() => { const o = window.__orc, g = EB.game; return { dead: !o.alive, hp: o.hp, max: o.maxHp, lvl: o.level, st: o.state, d: +o.pos.distanceTo(g.player.pos).toFixed(1), log: document.getElementById('chatLog').innerText.split('\n').slice(-6) }; });
  check('group killed an orc in Frostfang', orcDone.dead, orcDone);
  // the keep
  await page.evaluate(() => { const g = EB.game, p = g.player, w = g.world, F = EB.WORLD.FF; const x = F.keep.x + 0.5, z = F.keep.z + 30.5; p.pos.set(x, w.surfaceY(x, z), z); p.yaw = Math.PI; p.pitch = 0.02; g.camDist = 6.5; g.dayT = 0.42; g.setTarget(null); p.autoAttack = false;
    for (const [i, m] of g.mercs.entries()) { const mx = x + (i ? 1.5 : -1.5), mz = z + 1.5; m.pos.set(mx, w.surfaceY(mx, mz), mz); } });
  await page.waitForTimeout(3500);
  await hidePrompt(page); await page.screenshot({ path: SHOTS + 'v2-frozen-keep.png' });
  const named = await page.evaluate(() => EB.game.mobs.filter((m) => m.def.named).map((m) => m.name + ' L' + m.level));
  check('Frostfang nameds spawned', named.length >= 2, named);

  step('save/reload in Frostfang');
  await page.evaluate(() => EB.game.save());
  await page.reload();
  await page.click('#btnContinue');
  await inGame();
  await page.waitForTimeout(1500);
  const rl = await page.evaluate(() => { const g = EB.game; return { zone: g.world.zoneId, mercs: g.mercs.length, quest: g.quests.gnoll_menace, lvl: g.player.level }; });
  check('zone, mercs, quests persisted', rl.zone === 'frostfang' && rl.mercs === 2 && rl.quest === 'done', rl);

  step('death in Frostfang, corpse in other zone');
  await page.evaluate(() => { const g = EB.game; g.playerDie({ name: 'a frost giant' }); });
  await page.waitForFunction(() => EB.game.player.alive && !EB.game.zoning, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const dz = await page.evaluate(() => { const g = EB.game; return { zone: g.world.zoneId, here: g.pcorpses.length, other: g.otherCorpses.map((c) => c.zone), arrow: document.getElementById('corpseArrow').innerText }; });
  check('respawn at Everblock bind with corpse left in Frostfang', dz.zone === 'everblock' && dz.here === 0 && dz.other[0] === 'frostfang' && /Frostfang/.test(dz.arrow), dz);
  await page.evaluate(() => EB.game.save());
  await page.reload();
  await page.click('#btnContinue');
  await inGame();
  await page.waitForTimeout(1000);
  const dz2 = await page.evaluate(() => ({ zone: EB.game.world.zoneId, other: EB.game.otherCorpses.length }));
  check('other-zone corpse persisted', dz2.zone === 'everblock' && dz2.other === 1, dz2);
  await page.evaluate(() => EB.game.changeZone({ to: 'frostfang', arrive: { x: 128.5, z: 246.5, yaw: Math.PI } }));
  await page.waitForFunction(() => EB.game.world.zoneId === 'frostfang' && !EB.game.zoning, null, { timeout: 20000 });
  const back = await page.evaluate(() => ({ here: EB.game.pcorpses.length, other: EB.game.otherCorpses.length }));
  check('corpse appears when returning to Frostfang', back.here === 1 && back.other === 0, back);

  const fails = results.filter((r) => !r.ok);
  console.log(`--- ${results.length - fails.length}/${results.length} checks passed ---`);
  console.log('--- JS errors (' + errors.length + ') ---\n' + errors.join('\n'));
  await browser.close();
})();
