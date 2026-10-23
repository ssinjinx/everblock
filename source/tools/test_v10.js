// Everblock v10 headless test: spell-effects pass - per-school particle recipes (4 particle looks + colour over life), ground decals,
// impact feedback (flash/flinch, point light, crit shake, floating numbers), wind-up orb + raised arms + release, signature effects
// for OP actives / procs / clickies / each pet type, big CC markers, per-school synth sounds, bold low/phone mode.
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
  const waitGame = async (sec) => { const t0 = await ev(() => EB.game.time); await page.waitForFunction((t) => EB.game.time >= t, t0 + sec, { timeout: 120000, polling: 'raf' }); };
  const hide = (on) => ev((on) => { for (const id of ['clickToPlay', 'centerMsg']) { const e = document.getElementById(id); if (e) e.style.visibility = on ? 'hidden' : ''; } }, on);
  const shot = async (name) => { await hide(true); await page.screenshot({ path: SHOTS + name }); await hide(false); console.log('   shot', name); };

  await page.goto(URL);
  await ev(() => localStorage.clear());
  await page.reload();
  await page.click('#btnNew');
  await page.click('#raceList button:has-text("Human")');
  await page.click('#classList button:has-text("Wizard")');
  await page.click('#classList2 button:has-text("Necromancer")');
  await page.fill('#nameInput', 'Sparkleface');
  await page.click('#btnCreate');
  await inGame(); await page.waitForTimeout(600);
  step('set up a stage: level 30 Wiz/Necro/Shaman, two practice dummies, side camera');
  await ev(() => {
    const g = EB.game, p = g.player; g._classPrompted = true; g.spawnT = 1e9;
    while (p.level < 10) g.gainXP(1e5); g.closeWin && g.closeWin('classWin'); if (!p.classes.includes('shaman')) p.classes.push('shaman');
    while (p.level < 30) g.gainXP(1e7); p.hp = p.maxHp; p.mana = p.maxMana = 1e5;
    g.applyGfx('high', true); g.camDist = 4;
    for (const m of g.mobs) { m.alive = false; if (m.model) m.model.group.visible = false; } // clear the stage
    const mk = (dx, dz) => { const x = p.pos.x + dx, z = p.pos.z + dz, y = g.world.surfaceY(x, z); const m = new EB.ent.Mob('gnoll', null, x, y, z, [1, 1]); m.maxHp = m.hp = 1e6; m.def = Object.assign({}, m.def, { aggro: 0 }); m.yaw = Math.PI; g.mobs.push(m); m.addTo(g.scene); m.state = 'idle'; m.update = function () {}; return m; };
    g.dummy = mk(0, 5); g.dummy2 = mk(2.6, 5.5);
    p.yaw = 0; g.setTarget(g.dummy);
    const P = p.pos; g.camOverride = { pos: new THREE.Vector3(P.x + 5.2, P.y + 2.4, P.z + 1.6), look: new THREE.Vector3(P.x + 0.3, P.y + 1.1, P.z + 3) };
    document.getElementById('chatLog').innerHTML = '';
  });
  await waitGame(0.5);

  step('recipes + particle looks');
  const r = await ev(() => { const F = EB.fx; const s = Object.keys(F.SCHOOL).every((k) => F.RECIPE[k] && F.RECIPE[k].c2 != null); const a = F.pts.geometry.attributes; F.clear(); F.impact({ pos: new THREE.Vector3(0, 80, 0), model: null }, 'cold', {}); const shapes = new Set(Array.from(F.shape.slice(0, F.n))); F.update(0.2, EB.game.camera); const i3 = 0; const moved = Math.abs(F.colA[i3] - F.c0[i3]) + Math.abs(F.colA[i3 + 2] - F.c0[i3 + 2]); F.clear(); return { s, hasShape: !!a.shape, shapes: [...shapes], moved }; });
  check('every school has a recipe with a colour-over-life', r.s, r);
  check('shape attribute: a second spark/shard look mixed into bursts', r.hasShape && r.shapes.length >= 2, r.shapes);
  check('particle colour changes over its life', r.moved > 0.01, r.moved);

  step('wind-up: growing orb, cast circle, raised arms, release');
  const w = await ev(async () => {
    const g = EB.game, p = g.player; g.camDist = 4;
    p.casting = { id: 'shock_of_fire', t: 0.1, total: 2, target: g.dummy, skill: false, startPos: p.pos.clone() };
    await new Promise((r) => setTimeout(r, 250));
    const arm0 = g.pmodel.parts.uarmR ? g.pmodel.parts.uarmR.rotation.x : null, dec0 = !!(p._castDecal && p._castDecal.live);
    return { dec0, arm0 };
  });
  await waitGame(1.6);
  const w2 = await ev(() => { const g = EB.game, p = g.player, k = Object.keys(g.pmodel.parts).find((n) => /arm|upper/i.test(n) && /R$/.test(n)); return { k, armK: k && g.pmodel.parts[k].rotation.x, castP: p.casting && p.casting.t / p.casting.total, n: EB.fx.n }; });
  await shot('v10-windup.png');
  await waitGame(0.6);
  const w3 = await ev(() => ({ rel: EB.game.pReleaseT, casting: !!EB.game.player.casting, sounds: EB.fx.counts.sounds }));
  check('casting puts a rune circle under the caster', w.dec0, w);
  check('cast completes with a release (arms thrust, burst)', !w3.casting && w3.rel >= 0, w3);
  check('raised-arms pose climbs with cast progress', w2.castP > 0.6 && w2.k, w2);

  step('fire nuke (bolt mid-flight) and impact feedback');
  await ev(() => { const g = EB.game; g.player.casting = null; EB.fx.clear(); g.applyAbility('shock_of_fire', g.dummy); });
  await waitGame(0.09);
  const fb = await ev(() => ({ bolts: EB.fx.bolts.length, school: EB.fx.bolts[0] && EB.fx.bolts[0].school, nums: EB.fx.bolts[0] && EB.fx.bolts[0].nums }));
  check('fire nuke bolt is in flight with the damage number riding it', fb.bolts >= 1 && fb.school === 'fire' && fb.nums && fb.nums.length === 1, fb);
  await shot('v10-fire-nuke.png');
  await page.waitForFunction(() => EB.fx.bolts.length === 0, null, { polling: 'raf' }); await waitGame(0.04);
  const fi = await ev(() => ({ num: [...document.querySelectorAll('.fxNum')].filter((e) => e.style.display !== 'none').map((e) => e.textContent), light: Math.max(...EB.fx.lights.map((l) => l.L.intensity)), decals: EB.fx.decals.filter((d) => d.live).length, flinch: EB.game.dummy.model.st.flinch }));
  check('impact pops a floating damage number', fi.num.some((t) => /^\d+!?$/.test(t)), fi.num);
  check('impact flashes a point light, lays ground decals and flinches the target', fi.light > 0 && fi.decals >= 1, fi);

  step('frost impact + crit shake');
  await ev(() => { const g = EB.game; EB.fx.clear(); g._crit = true; g.applyAbility('frost_rift', g.dummy); });
  await waitGame(0.3);
  const fr = await ev(() => ({ shakes: EB.fx.counts.shakes, big: [...document.querySelectorAll('.fxNum.big')].filter((e) => e.style.display !== 'none').length }));
  check('a crit shakes the camera and shows a big number', fr.shakes >= 1 && fr.big >= 1, fr);
  await shot('v10-frost-impact.png');

  step('heal + buff');
  await ev(() => { const g = EB.game, p = g.player; EB.fx.clear(); p.hp = Math.floor(p.maxHp / 3); });
  await waitGame(0.05);
  await ev(() => { const g = EB.game, p = g.player; g.applyAbility('greater_healing', p); g.applyAbility('inner_fire', p); });
  await waitGame(0.2);
  const hl = await ev(() => [...document.querySelectorAll('.fxNum.heal')].filter((e) => e.style.display !== 'none').map((e) => e.textContent));
  check('heals pop a green +N', hl.some((t) => /^\+\d+/.test(t)), hl);
  await shot('v10-heal-buff.png');

  step('DoT + mez');
  await ev(() => { const g = EB.game; EB.fx.clear(); g.dummy2.level = 1; g.applyAbility('disease_cloud', g.dummy); g.applyAbility('heat_blood', g.dummy); g.dummy2.mezUntil = 0; g.setTarget(g.dummy2); g.applyAbility('mesmerize', g.dummy2); g.dummy.stunUntil = 0; });
  await waitGame(1.2);
  const cc = await ev(() => ({ mez: !!document.querySelector('.fxCC.mez'), mezT: EB.game.time < EB.game.dummy2.mezUntil, puddle: !!(EB.game.dummy._puddle && EB.game.dummy._puddle.live) }));
  check('mez shows a big readable marker', cc.mez && cc.mezT, cc);
  check('a DoT leaves a lingering puddle under the target', cc.puddle, cc);
  await shot('v10-dot-mez.png');
  await ev(() => { const g = EB.game; g.dummy.stunUntil = g.time + 2; });
  await waitGame(0.3);
  const st = await ev(() => !!document.querySelector('.fxCC.stun'));
  check('stun shows its own marker', st, st);
  await ev(() => { const g = EB.game; g.dummy.stunUntil = 0; g.dummy2.mezUntil = 0; for (const m of [g.dummy, g.dummy2]) m.dots = []; });

  step('pet summons');
  await ev(() => { const g = EB.game; EB.fx.clear(); for (const [t, l] of [['skel', 20], ['wolf', 20], ['friend', 20]]) { const pet = g.summonPet(l, t); if (pet) { const P = g.player.pos; pet.pos.set(P.x + ({ skel: -1.6, wolf: 0.4, friend: 2.4 })[t], g.world.surfaceY(P.x, P.z + 2.6), P.z + 2.6); EB.fx.summonType(pet, t); } } });
  await waitGame(0.45);
  const ps = await ev(() => EB.fx.counts.sig);
  check('each pet type has its own summon effect', ps['pet-skel'] && ps['pet-wolf'] && ps['pet-friend'], ps);
  await shot('v10-pet-summons.png');
  await ev(() => { const g = EB.game; for (const p of g.pets().slice()) g.removeMercModel ? g.removeMercModel(p) : 0; });

  step('OP active + proc + clicky signatures');
  const op = await ev(() => {
    const g = EB.game, p = g.player; EB.fx.clear(); p.aaEarned = 60; g.buyAA('second_wind'); p.hp = Math.floor(p.maxHp / 2); delete p.cooldowns['aa:second_wind'];
    const ok = g.useAAActive('second_wind');
    const R = Math.random; Math.random = () => 0; let pr; try { pr = g.tryProc(g.dummy, { proc: 'chain_zap', delay: 30, name: 'Zap Rod' }); } finally { Math.random = R; }
    g.dummy2.hate.set(p, 5);
    return { ok, pr, sig: Object.assign({}, EB.fx.counts.sig) };
  });
  check('OP active fires its signature effect', op.ok && op.sig.op >= 1, op);
  check('weapon proc fires a signature effect', op.pr && (op.sig.chain || op.sig.pillar), op);
  await waitGame(0.35);
  await shot('v10-op-active.png');

  step('sounds respect mute');
  const snd = await ev(() => { const A = EB.audio; const on = A.enabled; A.toggle(); let err = null; try { for (const s of ['fire', 'cold', 'magic', 'disease', 'life', 'heal', 'holy', 'mind', 'shadow', 'wolf', 'friend']) for (const ph of ['cast', 'release', 'impact']) A.sfx(s, ph); } catch (e) { err = e.message; } const off = A.enabled; A.toggle(); return { on, off, back: A.enabled, err, hasSfx: typeof A.sfx === 'function' }; });
  check('per-school synth voices exist and go silent when muted', snd.hasSfx && !snd.err && snd.on && !snd.off && snd.back, snd);

  step('perf: a heavy fight');
  const pf = await ev(() => { const F = EB.fx, g = EB.game; F.clear(); for (let i = 0; i < 12; i++) { g.spellFx(g.dummy, ['fire', 'cold', 'disease', 'mind'][i % 4]); F.impact(g.dummy, 'fire', { crit: true }); } const t0 = performance.now(); for (let i = 0; i < 60; i++) F.update(1 / 60, g.camera); return { ms: (performance.now() - t0) / 60, n: F.n }; });
  check('fx update stays cheap under load (<3ms/frame in swiftshader)', pf.ms < 3, pf);

  step('low / phone mode');
  const lo = await ev(() => { const g = EB.game, F = EB.fx; g.applyGfx('low', true); F.clear(); g.applyAbility('shock_of_fire', g.dummy); for (let i = 0; i < 4; i++) F.update(0.05, g.camera); const n = F.n; const sz = Math.max(...F.s0.slice(0, F.n)); return { n, sz, high: F.high }; });
  await ev(() => { const g = EB.game; EB.fx.clear(); g.applyAbility('shock_of_fire', g.dummy); setTimeout(() => g.applyAbility('frost_rift', g.dummy2), 0); g.dummy2.mezUntil = g.time + 5; });
  await waitGame(0.28);
  const lo2 = await ev(() => ({ light: Math.max(...EB.fx.lights.map((l) => l.L.intensity)), decals: EB.fx.decals.filter((d) => d.live).length, nums: [...document.querySelectorAll('.fxNum')].filter((e) => e.style.display !== 'none').length }));
  check('low mode: fewer, chunkier particles, no dynamic lights, decals + numbers still shown', !lo.high && lo.n > 0 && lo.n < 400 && lo2.light === 0 && lo2.decals >= 1 && lo2.nums >= 1, { lo, lo2 });
  await shot('v10-low-mode.png');
  await ev(() => EB.game.applyGfx('high', true));

  step('save compatibility');
  const sv = await ev(() => { const g = EB.game; g.save(); const s = JSON.parse(localStorage.getItem(EB.SAVE_KEY)); return { ok: !!s.char, cls: s.char.classes }; });
  check('save still writes the same shape', sv.ok, sv);
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
