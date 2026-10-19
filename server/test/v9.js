// Everblock v9 server test (no network): multiclass creation, server-authoritative classes + Overachievement Points,
// XP penalty/slider in grantXP, multiple pets in saves.   Run: node test/v9.js
'use strict';
const { EB } = require('../lib/shared');
const { sanitizeSave, validateNewChar } = require('../lib/sanitize');
const { EverblockServer } = require('../lib/server');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const M = EB.multi, D = EB.data, ctx = { seed: 1, zone: 'everblock', bind: null, pos: [0, 0, 0] };
check('server loads multi.js (Overachievement Points)', M && Object.keys(M.NODES).length >= 40, Object.keys(M.NODES).length);
const base = { name: 'Dualdude', race: 'human', cls: 'cleric', stats: [75, 75, 75, 75, 75, 75, 75] };
const sv = (x) => { for (let i = 0; i < 7; i++) x.stats[i] = D.RACES[x.race].stats[i] + D.CLASSES[x.cls].bonus[i]; return x; };
const v1 = validateNewChar(sv(Object.assign({}, base, { stats: [], classes: ['cleric', 'necromancer'] })));
check('creation accepts two classes', v1 && v1.classes && v1.classes.join() === 'cleric,necromancer', v1.classes || v1);
const v2 = validateNewChar(sv(Object.assign({}, base, { stats: [], classes: ['cleric', 'necromancer', 'wizard', 'bogus'] })));
check('creation caps to two valid classes', v2.classes.join() === 'cleric,necromancer', v2.classes);
const rec = { name: 'Dualdude', race: 'human', cls: 'cleric', level: 12, xp: 0, stats: v1.stats, srv: { classes: ['cleric', 'necromancer'], aa: { xp: 0, earned: 6, pct: 50 } } };
const out = sanitizeSave(rec, { v: 3, char: { classes: ['cleric', 'necromancer', 'wizard', 'warrior'], aa: { gym: 2, syn_medicine: 1 }, aaEarned: 999,
  spells: ['minor_heal', 'lifetap'], hotbar: ['aa:second_wind', 'aa:gym'] }, mercs: [1, 2, 3, 4, 5, 6, 7].map(() => ({ role: 'pet', petLvl: 8, petType: 'wolf' })) }, ctx).char;
check('client cannot add classes or inflate OP earned', out.classes.join() === 'cleric,necromancer' && out.aaEarned === 6, { c: out.classes, e: out.aaEarned });
check('OP spend within budget kept (incl. cleric+necro synergy)', out.aa.gym === 2 && out.aa.syn_medicine === 1, out.aa);
const over = sanitizeSave(rec, { v: 3, char: { aa: { gym: 5, syn_medicine: 1 } } }, ctx).char;
check('overspent OP is wiped', Object.keys(over.aa).length === 0, over.aa);
check('aa: hotbar only for owned actives', out.hotbar[0] === null && out.hotbar[1] === null, out.hotbar);
const full = sanitizeSave(rec, { v: 3, char: {}, mercs: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ role: 'pet', petLvl: 8, petType: i % 2 ? 'wolf' : 'nope' })) }, ctx);
check('multiple pets kept with petType (cap 5 companions)', full.mercs.length === 5 && full.mercs[0].petType === 'wolf' && full.mercs[1].petType === 'skel', full.mercs.map((m) => m.petType));
const old = sanitizeSave({ name: 'Old', race: 'human', cls: 'warrior', level: 5, xp: 0, stats: v1.stats, srv: {} }, { v: 3, char: { spells: ['kick'], hotbar: ['kick'] } }, ctx).char;
check('old save migrates to one class, no OP', old.classes.join() === 'warrior' && old.aaEarned === 0 && Object.keys(old.aa).length === 0, old.classes);
// grantXP
const srv = Object.create(EverblockServer.prototype); srv.store = { saveCharacter() {} };
const sent = []; const s = { rec: { level: 12, xp: 0, cls: 'cleric', srv: { classes: ['cleric', 'necromancer'], aa: { xp: 0, earned: 0, pct: 50 } } }, send: (m) => sent.push(m) };
srv.grantXP(s, 1000, false, 'kill');
check('grantXP applies 10% dual-class penalty and 50% OP slider', sent[0].n === 450 && s.rec.xp === 450 && s.rec.srv.aa.xp === 450 && sent[0].aaX === 450, sent[0]);
s.rec.level = D.MAX_LEVEL; sent.length = 0; srv.grantXP(s, M.aaNeed(D.MAX_LEVEL) * 3, false, 'kill');
check('at max level all XP becomes OP', sent[0].aaE >= 2 && s.rec.xp === 450, sent[0]);
srv.on_addclass({ rec: s.rec, sys() {} }, { cls: 'wizard' });
check('third class allowed at 10+ via addclass', s.rec.srv.classes.join() === 'cleric,necromancer,wizard', s.rec.srv.classes);
srv.on_addclass({ rec: s.rec, sys() {} }, { cls: 'warrior' });
check('fourth class refused', s.rec.srv.classes.length === 3);
const low = { rec: { level: 5, cls: 'warrior', srv: { classes: ['warrior', 'rogue'] } }, sys() {} }; srv.on_addclass(low, { cls: 'wizard' });
check('third class refused before level 10', low.rec.srv.classes.length === 2);
const f = results.filter((r) => !r.ok); console.log(`\n${results.length - f.length}/${results.length} passed`); process.exit(f.length ? 1 : 0);
