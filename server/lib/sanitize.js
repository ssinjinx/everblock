// Server-side validation of what clients send: new characters and save blobs. The client simulates its own
// character (inventory, spells, buffs), so the server keeps the authoritative fields (name, race, class, stats,
// level, XP, zone, position) and sanity-checks the rest.
'use strict';
const { EB } = require('./shared');
const D = EB.data;
const { RACES, CLASSES, ITEMS, SPELLS, EQUIP_SLOTS, MERCS, FACTIONS, QUESTS } = D;

const NAME_RE = /^[A-Za-z]{3,15}$/;
const RESERVED = /^(admin|gm|guide|server|system|everblock|nobody|guard|fippy)/i;

function validateNewChar(c) {
  if (!c || typeof c !== 'object') return 'Bad request.';
  let name = String(c.name || '').trim();
  if (!NAME_RE.test(name)) return 'Names must be 3-15 letters, no spaces or numbers.';
  if (RESERVED.test(name)) return 'That name is reserved.';
  name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const R = RACES[c.race], C = CLASSES[c.cls];
  if (!R || !C) return 'Unknown race or class.';
  if (!R.classes.includes(c.cls)) return `${R.name}s cannot become ${C.name}s.`;
  if (!Array.isArray(c.stats) || c.stats.length !== R.stats.length) return 'Bad stats.';
  const base = R.stats.map((v, i) => v + C.bonus[i]);
  let extra = 0;
  for (let i = 0; i < base.length; i++) { const v = c.stats[i] | 0; if (v < base[i] || v > base[i] + 20) return 'Bad stats.'; extra += v - base[i]; }
  if (extra > 20) return 'Too many bonus points.';
  return { name, race: c.race, cls: c.cls, stats: c.stats.map((v) => v | 0) };
}

const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
function item(it) {
  if (!it || typeof it !== 'object' || !ITEMS[it.id]) return null;
  const I = ITEMS[it.id];
  return { id: it.id, count: I.stack ? Math.max(1, Math.min(1000, it.count | 0 || 1)) : 1 };
}
function equipMap(e) {
  const out = {};
  if (!e || typeof e !== 'object') return out;
  for (const sl of Object.keys(e)) {
    if (!EQUIP_SLOTS.includes(sl)) continue;
    const it = e[sl]; if (!it || !ITEMS[it.id] || ITEMS[it.id].slot !== sl) continue;
    out[sl] = { id: it.id };
  }
  return out;
}
function bag(inv, n) { const out = new Array(n).fill(null); if (Array.isArray(inv)) for (let i = 0; i < Math.min(n, inv.length); i++) out[i] = item(inv[i]); return out; }

// rec: the stored character row (authoritative level/xp/stats), data: the client's save blob
function sanitizeSave(rec, data, ctx) {
  if (!data || typeof data !== 'object' || !data.char || typeof data.char !== 'object') return null;
  const c = data.char, out = {};
  const L = rec.level;
  out.name = rec.name; out.race = rec.race; out.cls = rec.cls; out.level = L; out.xp = rec.xp; out.stats = rec.stats.slice();
  out.coins = Math.floor(num(c.coins, 0, 1e8, 0));
  out.inv = bag(c.inv, 24);
  out.equip = equipMap(c.equip);
  const learnable = (s) => SPELLS[s] && SPELLS[s].classes[rec.cls] && SPELLS[s].classes[rec.cls] <= L;
  out.spells = Array.isArray(c.spells) ? [...new Set(c.spells.filter(learnable))] : undefined;
  const pad = (a) => { a = (Array.isArray(a) ? a : []).slice(0, 8).map((x) => (x && out.spells && out.spells.includes(x) ? x : null)); while (a.length < 8) a.push(null); return a; };
  if (out.spells) { out.gems = pad(c.gems); out.hotbar = pad(c.hotbar); }
  out.title = typeof c.title === 'string' ? c.title.slice(0, 40) : '';
  out.faction = {};
  for (const f in FACTIONS) out.faction[f] = Math.round(num(c.faction && c.faction[f], -2000, 2000, FACTIONS[f].start));
  out.petMode = ['follow', 'guard', 'sit'].includes(c.petMode) ? c.petMode : 'follow';
  out.buffs = Array.isArray(c.buffs) ? c.buffs.filter((b) => b && SPELLS[b.id] && SPELLS[b.id].buff).slice(0, 12).map((b) => ({ id: b.id, name: SPELLS[b.id].name, left: num(b.left, 0, 3600, 0), buff: SPELLS[b.id].buff })) : [];
  out.bind = ctx.bind; out.played = num(c.played, 0, 1e9, 0);
  out.pos = ctx.pos; out.yaw = num(c.yaw, -1e3, 1e3, Math.PI);
  out.hp = Math.round(num(c.hp, 0, 1e6, 1)); out.mana = Math.round(num(c.mana, 0, 1e6, 0));
  const res = { v: 3, seed: ctx.seed, zone: ctx.zone, char: out, zoneEdits: {} };
  res.corpses = (Array.isArray(data.corpses) ? data.corpses : []).slice(0, 10).filter((k) => k && EB.WORLD.ZONES[k.zone || 'everblock']).map((k) => ({
    zone: k.zone || 'everblock', x: num(k.x, 0, 256, 128), y: num(k.y, 0, 64, 30), z: num(k.z, 0, 256, 128), coins: Math.floor(num(k.coins, 0, 1e8, 0)), items: bag(k.items, 24).filter(Boolean), equip: equipMap(k.equip) }));
  res.mercs = (Array.isArray(data.mercs) ? data.mercs : []).slice(0, 3).filter((m) => m && (MERCS[m.role] || m.role === 'pet')).map((m) => ({
    role: m.role, hp: num(m.hp, 0, 1e6, 1), mana: num(m.mana, 0, 1e6, 0), buffs: [], stance: ['passive', 'balanced', 'aggressive'].includes(m.stance) ? m.stance : 'balanced',
    healAt: num(m.healAt, 0.2, 0.95, 0.62), equip: equipMap(m.equip), dead: !!m.dead, petLvl: m.role === 'pet' ? Math.min(L + 2, Math.max(1, m.petLvl | 0 || 3)) : undefined,
    petMode: m.role === 'pet' && ['follow', 'guard', 'sit'].includes(m.petMode) ? m.petMode : undefined }));
  res.quests = {};
  if (data.quests && typeof data.quests === 'object') for (const q in data.quests) if (QUESTS[q] && (data.quests[q] === 'active' || data.quests[q] === 'done')) res.quests[q] = data.quests[q];
  res.questSteps = {};
  if (data.questSteps && typeof data.questSteps === 'object') for (const q in data.questSteps) if (QUESTS[q] && QUESTS[q].chain) res.questSteps[q] = Math.max(0, Math.min(QUESTS[q].steps.length - 1, data.questSteps[q] | 0));
  res.dayT = num(data.dayT, 0, 1, 0.3);
  return res;
}
module.exports = { validateNewChar, sanitizeSave };
