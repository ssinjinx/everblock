// Everblock v8 server test (no network): the shared game code loads the gear pass, mob drops roll suffix affixes,
// and save sanitizing keeps valid affixes + clicky hotbar entries while stripping bogus ones.   Run: node test/v8.js
'use strict';
const { EB } = require('../lib/shared');
const { sanitizeSave } = require('../lib/sanitize');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const D = EB.data, G = EB.gear;
check('server loads gear.js (159 items, procs, sets)', G && Object.keys(D.ITEMS).length === 159 && D.ITEMS.everflame.proc === 'everburn');
let aff = 0, n = 0;
for (let i = 0; i < 400; i++) { const m = new EB.ent.Mob('pyrrhax', null, 100, 30, 100, [40, 40]); m.refreshPlate = () => {}; m.die({ time: 0 }, null); for (const it of m.loot.items) { if (D.ITEMS[it.id].slot) { n++; if (it.sfx) aff++; } } }
check('server-side mob drops roll affixes', n > 0 && aff > 0 && aff < n, { n, aff });
const rec = { name: 'Testy', race: 'human', cls: 'warrior', level: 30, xp: 0, stats: [80, 80, 80, 80, 80, 80, 80] };
const data = { v: 3, char: { coins: 5, inv: [{ id: 'everflame', count: 1, sfx: 'bear' }, { id: 'bread', count: 2, sfx: 'bear' }, { id: 'rusty_dagger', count: 1, sfx: 'hacked' }, null],
  equip: { primary: { id: 'zap_rod', sfx: 'owl' }, hands: { id: 'haste_gloves' } }, bank: [{ id: 'molten_plate', count: 1, sfx: 'whale' }],
  spells: ['bind_wound', 'kick'], gems: [], hotbar: ['kick', 'click:haste_gloves', 'click:bread', 'fireball'] } };
const out = sanitizeSave(rec, data, { seed: 1, zone: 'everblock', bind: null, pos: [0, 0, 0] });
const c = out.char;
check('valid affixes kept in bags, equipment and bank', c.inv[0].sfx === 'bear' && c.equip.primary.sfx === 'owl' && c.bank[0].sfx === 'whale', { inv: c.inv.slice(0, 3), eq: c.equip, bank: c.bank[0] });
check('affix stripped from non-equipment and unknown affix keys', !c.inv[1].sfx && !c.inv[2].sfx, c.inv.slice(1, 3));
check('clicky hotbar entries kept only for real click items', c.hotbar[0] === 'kick' && c.hotbar[1] === 'click:haste_gloves' && c.hotbar[2] === null && c.hotbar[3] === null, c.hotbar);
const old = sanitizeSave(rec, { v: 3, char: { inv: [{ id: 'grimbone_blade', count: 1 }], equip: { primary: { id: 'grimbone_blade' } }, spells: ['kick'], hotbar: ['kick'] } }, { seed: 1, zone: 'everblock', bind: null, pos: [0, 0, 0] });
check('old (v7) save passes through unchanged', old.char.inv[0].id === 'grimbone_blade' && !('sfx' in old.char.inv[0]) && old.char.equip.primary.id === 'grimbone_blade');
const f = results.filter((r) => !r.ok); console.log(`\n${results.length - f.length}/${results.length} passed`); process.exit(f.length ? 1 : 0);
