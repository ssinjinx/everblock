// Everblock v9: multiclassing, multiple pets and Overachievement Points (OP), a parody of alternate advancement.
// Shared by the browser game and the multiplayer server (loaded after gear.js). A character keeps its original
// `cls` (primary class) so old saves and code paths still work; `classes` lists all of them, primary first.
(function () {
  const EB = (typeof window !== 'undefined' ? window : globalThis).EB;
  const D = EB.data, CLASSES = D.CLASSES, SPELLS = D.SPELLS;
  const SHORT = { warrior: 'Warrior', cleric: 'Cleric', wizard: 'Wizard', rogue: 'Rogue', ranger: 'Ranger', paladin: 'Paladin', shaman: 'Shaman', necromancer: 'Necro', enchanter: 'Enchanter' };
  const THIRD_AT = 10, MAX_CLASSES = 3;

  function classesOf(c) {
    const out = [];
    if (c && CLASSES[c.cls]) out.push(c.cls);
    if (c && Array.isArray(c.classes)) for (const k of c.classes) if (CLASSES[k] && !out.includes(k) && out.length < MAX_CLASSES) out.push(k);
    return out.length ? out : ['warrior'];
  }
  function maxClasses(level) { return level >= THIRD_AT ? 3 : 2; }
  // valid class list for a character of this level (primary must match; no duplicates; 2 max before level 10)
  function validClasses(primary, list, level) {
    const out = [primary];
    for (const k of Array.isArray(list) ? list : []) if (CLASSES[k] && !out.includes(k) && out.length < maxClasses(level)) out.push(k);
    return out;
  }
  function label(classes) { return classes.map((k) => (classes.length > 1 ? SHORT[k] : CLASSES[k].name)).join('/'); }
  function spellLvl(id, classes) { const s = SPELLS[id]; if (!s) return 0; let L = 0; for (const k of classes) { const v = s.classes[k]; if (v && (!L || v < L)) L = v; } return L; }
  const penalty = (classes) => 1 - 0.06 * (classes.length - 1); // HP/mana: best class pool, trimmed for each extra class
  function hpClass(classes) { return classes.reduce((a, b) => (CLASSES[b].hpPer > CLASSES[a].hpPer ? b : a)); }
  function manaClass(classes) { let best = null; for (const k of classes) { const C = CLASSES[k]; if (C.manaStat == null) continue; if (!best || (C.manaMult || 1) > (CLASSES[best].manaMult || 1)) best = k; } return best; }
  function maxHp(classes, L, STA) { return Math.floor(EB.calc.maxHp(hpClass(classes), L, STA) * penalty(classes)); }
  function maxMana(classes, L, stats) { const k = manaClass(classes); return k ? Math.floor(EB.calc.maxMana(k, L, stats) * penalty(classes)) : 0; }
  function dmgMult(classes) { return Math.max(...classes.map((k) => CLASSES[k].dmgMult)); }
  function xpMult(classes) { return 1 - 0.1 * (classes.length - 1); } // XP penalty: -10% per extra class
  const AC_PER = { warrior: 3, paladin: 3, rogue: 2, ranger: 2, shaman: 1.5 };
  function acPer(classes) { return Math.max(...classes.map((k) => AC_PER[k] || 1)); }

  // ---------- multiple pets: each pet class keeps its own pet ----------
  const PET_TYPES = {
    skel: { cls: 'necromancer', table: D.PETS, verb: 'from the grave' },
    wolf: { cls: 'shaman', verb: 'from the spirit realm', table: {
      8: { name: 'Spirit Doggo', desc: 'A see-through wolf. Very good boy. Technically deceased.', color: 0xa0c0ff, model: 'wolf' },
      18: { name: 'Good Spirit Boy', desc: 'A frosty spirit wolf who fetches souls.', color: 0xd0e8ff, model: 'frost_wolf' },
      30: { name: 'Ancestral Goodest Boy', desc: 'A blazing hound of the ancestors. Has never once been a bad dog.', color: 0xff9040, model: 'cinder_hound' } } },
    friend: { cls: 'enchanter', verb: 'from your imagination', table: {
      12: { name: 'Imaginary Friend', desc: 'Nobody else can see it. It still hits things.', color: 0xc0a0ff, model: 'swamp_wisp' },
      24: { name: 'Very Real Imaginary Friend', desc: 'An imaginary friend that has started paying rent.', color: 0xe0d0ff, model: 'ember_sprite' },
      34: { name: 'Figment Supreme', desc: 'A towering figment. Your therapist is concerned.', color: 0x80e0ff, model: 'dust_djinn' } } },
  };
  const MAX_PETS = 3;
  Object.assign(SPELLS, {
    spirit_doggo:  { name: 'Summon Spirit Doggo', classes: { shaman: 8 }, ic: 'pet', mana: 50, cast: 6, recast: 10, kind: 'pet', petLvl: 8, petType: 'wolf', desc: 'Call a spirit wolf to fight at your side (shaman pet). Multiclass characters can keep it alongside other pets.' },
    spirit_boy:    { name: 'Summon Good Spirit Boy', classes: { shaman: 18 }, ic: 'pet', mana: 140, cast: 8, recast: 10, kind: 'pet', petLvl: 18, petType: 'wolf', desc: 'Call a frosty spirit wolf (shaman pet).' },
    goodest_boy:   { name: 'Summon Ancestral Goodest Boy', classes: { shaman: 30 }, ic: 'pet', mana: 240, cast: 9, recast: 10, kind: 'pet', petLvl: 30, petType: 'wolf', desc: 'Call a blazing ancestral hound (shaman pet).' },
    imaginary_friend: { name: 'Imaginary Friend', classes: { enchanter: 12 }, ic: 'pet', mana: 70, cast: 7, recast: 10, kind: 'pet', petLvl: 12, petType: 'friend', desc: 'Conjure an imaginary friend that is real enough to punch things (enchanter pet).' },
    real_friend:   { name: 'Very Real Imaginary Friend', classes: { enchanter: 24 }, ic: 'pet', mana: 190, cast: 8, recast: 10, kind: 'pet', petLvl: 24, petType: 'friend', desc: 'A sturdier figment (enchanter pet).' },
    figment_supreme: { name: 'Figment Supreme', classes: { enchanter: 34 }, ic: 'pet', mana: 270, cast: 9, recast: 10, kind: 'pet', petLvl: 34, petType: 'friend', desc: 'A towering figment (enchanter pet).' },
  });
  for (const id in SPELLS) if (SPELLS[id].kind === 'pet' && !SPELLS[id].petType) SPELLS[id].petType = 'skel';
  function petDef(type, lvl) { const T = PET_TYPES[type] || PET_TYPES.skel; return T.table[lvl] || T.table[Object.keys(T.table)[0]]; }

  // ---------- Overachievement Points (OP) ----------
  const ARCH = { melee: ['warrior', 'rogue', 'ranger', 'paladin'], caster: ['wizard', 'necromancer', 'enchanter'], priest: ['cleric', 'shaman', 'paladin'], pets: ['necromancer', 'shaman', 'enchanter'] };
  const ARCH_NAME = { melee: 'Pointy End', caster: 'Big Brain', priest: 'Bedside Manner', pets: 'Pet Parent' };
  const has = (cls) => (C) => C.includes(cls);
  const any = (list) => (C) => C.some((k) => list.includes(k));
  const both = (a, b) => (C) => C.includes(a) && C.includes(b);
  const N = []; // nodes
  const node = (o) => N.push(Object.assign({ max: 1, cost: 1, lvl: 10 }, o));
  // General (everyone)
  node({ id: 'gym', tree: 'general', name: 'Gym Membership', max: 5, desc: '+2 STR and +2 STA per rank.', eff: (r) => ({ stats: { STR: 2 * r, STA: 2 * r } }) });
  node({ id: 'bookclub', tree: 'general', name: 'Book Club', max: 5, desc: '+2 INT and +2 WIS per rank.', eff: (r) => ({ stats: { INT: 2 * r, WIS: 2 * r } }) });
  node({ id: 'yoga', tree: 'general', name: 'Hot Yoga', max: 5, desc: '+2 AGI and +2 DEX per rank.', eff: (r) => ({ stats: { AGI: 2 * r, DEX: 2 * r } }) });
  node({ id: 'nap', tree: 'general', name: 'Power Napper', max: 3, desc: '+2 HP regenerated per tick per rank.', eff: (r) => ({ regen: 2 * r }) });
  node({ id: 'snacks', tree: 'general', name: 'Mental Snacks', max: 3, desc: '+1 mana regenerated per tick per rank.', eff: (r) => ({ manaRegen: r }) });
  node({ id: 'feet', tree: 'general', name: 'Fleet Feet (Imitation)', max: 3, desc: '+4% run speed per rank.', eff: (r) => ({ runPct: 4 * r }) });
  node({ id: 'socks', tree: 'general', name: 'Lucky Socks', max: 5, cost: 2, lvl: 15, desc: '+2% chance per rank for melee hits to crit for double damage.', eff: (r) => ({ crit: 2 * r }) });
  node({ id: 'spice', tree: 'general', name: 'Spell Spice', max: 5, cost: 2, lvl: 15, desc: '+2% chance per rank for damage spells to crit for double damage.', eff: (r) => ({ scrit: 2 * r }) });
  node({ id: 'toughness', tree: 'general', name: 'Built Different', max: 5, cost: 2, lvl: 20, desc: '+2% max HP per rank.', eff: (r) => ({ hpPct: 2 * r }) });
  node({ id: 'second_wind', tree: 'general', name: 'Second Wind', lvl: 12, cost: 3, desc: 'Active: instantly heal 30% of your max HP. Recast 10m.', active: { kind: 'heal', pct: 30, cd: 600 } });
  // Archetype trees (unlocked if any of your classes fits)
  node({ id: 'pointy', tree: 'arch:melee', name: 'Pointy End Training', max: 3, cost: 2, req: any(ARCH.melee), desc: '+4% melee damage per rank.', eff: (r) => ({ meleePct: 4 * r }) });
  node({ id: 'sturdy', tree: 'arch:melee', name: 'Shoulder Pads of Confidence', max: 3, cost: 2, req: any(ARCH.melee), desc: '+6 AC per rank.', eff: (r) => ({ ac: 6 * r }) });
  node({ id: 'frenzy', tree: 'arch:melee', name: 'Blender Mode', lvl: 20, cost: 4, req: any(ARCH.melee), desc: 'Active: +30% melee damage and 25% attack haste for 30s. Recast 5m.', active: { kind: 'buff', cd: 300, dur: 30, buff: { dmgPct: 30, hastePct: 25 }, color: 0xff6040 } });
  node({ id: 'bigbrain', tree: 'arch:caster', name: 'Big Brain Energy', max: 3, cost: 2, req: any(ARCH.caster), desc: '+4% spell damage per rank.', eff: (r) => ({ spellDmg: 4 * r }) });
  node({ id: 'coupons', tree: 'arch:caster', name: 'Mana Coupons', max: 3, cost: 2, req: any(ARCH.caster), desc: '-3% mana cost per rank.', eff: (r) => ({ manaSave: 3 * r }) });
  node({ id: 'brainburp', tree: 'arch:caster', name: 'Brain Burp', lvl: 15, cost: 3, req: any(ARCH.caster), desc: 'Active: restore 30% of your max mana. Recast 10m.', active: { kind: 'mana', pct: 30, cd: 600 } });
  node({ id: 'bedside', tree: 'arch:priest', name: 'Bedside Manner', max: 3, cost: 2, req: any(ARCH.priest), desc: '+5% healing per rank.', eff: (r) => ({ healPct: 5 * r }) });
  node({ id: 'quickprayer', tree: 'arch:priest', name: 'Speed Praying', max: 3, cost: 2, req: any(ARCH.priest), desc: '+4% spell haste per rank.', eff: (r) => ({ castSpeed: 4 * r }) });
  node({ id: 'doover', tree: 'arch:priest', name: 'Divine Do-Over', lvl: 20, cost: 4, req: any(ARCH.priest), desc: 'Active: heal yourself and your group for 40% of max HP. Recast 10m.', active: { kind: 'groupheal', pct: 40, cd: 600 } });
  node({ id: 'petgym', tree: 'arch:pets', name: 'Pet Gym Membership', max: 3, cost: 2, req: any(ARCH.pets), desc: '+10% pet max HP per rank.', eff: (r) => ({ petHpPct: 10 * r }) });
  node({ id: 'petrage', tree: 'arch:pets', name: 'Zoomies Training', max: 3, cost: 2, req: any(ARCH.pets), desc: '+10% pet damage per rank.', eff: (r) => ({ petDmgPct: 10 * r }) });
  node({ id: 'pettreat', tree: 'arch:pets', name: 'Emergency Treat', lvl: 15, cost: 3, req: any(ARCH.pets), desc: 'Active: fully heal all of your pets. Recast 5m.', active: { kind: 'petheal', cd: 300 } });
  // Class trees
  const CT = {
    warrior: [['thickskull', 'Thick Skull', '+5 AC and +2% HP per rank.', (r) => ({ ac: 5 * r, hpPct: 2 * r })], ['rampage', 'Rampage of Mild Annoyance', 'Active: +40% melee damage for 20s. Recast 5m.', { kind: 'buff', cd: 300, dur: 20, buff: { dmgPct: 40 }, color: 0xff4020 }]],
    cleric: [['faithheal', 'Faith Healer', '+5% healing per rank.', (r) => ({ healPct: 5 * r })], ['bandaid', 'Celestial Band-Aid', 'Active: heal 50% of your max HP. Recast 5m.', { kind: 'heal', pct: 50, cd: 300 }]],
    wizard: [['pyro', 'Pyromaniac', '+5% spell damage per rank.', (r) => ({ spellDmg: 5 * r })], ['harvest', 'Mana Harvest Moon', 'Active: restore 40% mana. Recast 10m.', { kind: 'mana', pct: 40, cd: 600 }]],
    rogue: [['sneaky', 'Sneaky Pete', '+3% melee crit chance per rank.', (r) => ({ crit: 3 * r })], ['vanish', 'Tactical Disappearance', 'Active: every monster fighting you forgets you exist. Recast 5m.', { kind: 'fade', cd: 300 }]],
    ranger: [['trailmix', 'Trail Mix', '+5% run speed and +2 DEX per rank.', (r) => ({ runPct: 5 * r, stats: { DEX: 2 * r } })], ['calledshot', 'Called Shot (Missed Call)', 'Active: a huge shot at your target (60 + 8 per level damage). Recast 2m.', { kind: 'nuke', cd: 120, base: 60, per: 8, school: 'magic' }]],
    paladin: [['bulk', 'Righteous Bulk', '+3% max HP per rank.', (r) => ({ hpPct: 3 * r })], ['gentlehands', 'Lay On Hands (Gently)', 'Active: fully heal yourself. Recast 20m.', { kind: 'heal', pct: 100, cd: 1200 }]],
    shaman: [['spiritsnack', 'Spirit Snacks', '+1 mana regen per tick and +3% healing per rank.', (r) => ({ manaRegen: r, healPct: 3 * r })], ['pep', 'Ancestral Pep Rally', 'Active: you and your group gain 20% attack haste for 60s. Recast 5m.', { kind: 'groupbuff', cd: 300, dur: 60, buff: { hastePct: 20 }, color: 0x90ff90 }]],
    necromancer: [['boneup', 'Bone Up', '+8% pet HP and +4% spell damage per rank.', (r) => ({ petHpPct: 8 * r, spellDmg: 4 * r })], ['lifeloan', 'Predatory Life Loan', 'Active: drain your target (40 + 6 per level) and heal yourself for it. Recast 2m.', { kind: 'tap', cd: 120, base: 40, per: 6, school: 'life' }]],
    enchanter: [['mindmana', 'Mind Over Mana', '-4% mana cost per rank.', (r) => ({ manaSave: 4 * r })], ['glamour', 'Glamour Shot', 'Active: +20 AC, +10% max HP and +30 CHA for 2m. Recast 5m.', { kind: 'buff', cd: 300, dur: 120, buff: { ac: 20, hpPct: 10, cha: 30 }, color: 0xe080ff }]],
  };
  for (const k in CT) {
    const [p, a] = CT[k];
    node({ id: p[0], tree: 'cls:' + k, name: p[1], max: 3, cost: 2, req: has(k), desc: p[2], eff: p[3] });
    node({ id: a[0], tree: 'cls:' + k, name: a[1], lvl: 15, cost: 3, req: has(k), desc: a[2], active: a[3] });
  }
  // Synergy nodes: only for specific class combinations
  node({ id: 'syn_medicine', tree: 'synergy', name: 'Ethically Questionable Medicine', cost: 3, req: both('cleric', 'necromancer'), desc: 'Cleric + Necro: +10% healing and +10% spell damage.', eff: () => ({ healPct: 10, spellDmg: 10 }) });
  node({ id: 'syn_spellsword', tree: 'synergy', name: 'Spellsword Side Hustle', cost: 3, req: (C) => C.includes('wizard') && C.some((k) => ARCH.melee.includes(k)), desc: 'Wizard + any melee class: +8% melee damage and +8% spell damage.', eff: () => ({ meleePct: 8, spellDmg: 8 }) });
  node({ id: 'syn_zoo', tree: 'synergy', name: 'Petting Zoo License', cost: 3, req: (C) => C.filter((k) => ARCH.pets.includes(k)).length >= 2, desc: 'Two or more pet classes: +20% pet HP and +20% pet damage.', eff: () => ({ petHpPct: 20, petDmgPct: 20 }) });
  node({ id: 'syn_con', tree: 'synergy', name: 'Con Artist', cost: 3, req: both('rogue', 'enchanter'), desc: 'Rogue + Enchanter: +5% melee crit and +20 CHA.', eff: () => ({ crit: 5, stats: { CHA: 20 } }) });
  node({ id: 'syn_holy', tree: 'synergy', name: 'Double-Holy Combo', cost: 3, req: (C) => C.includes('paladin') && (C.includes('cleric') || C.includes('shaman')), desc: 'Paladin + Cleric or Shaman: +15% healing and +10 AC.', eff: () => ({ healPct: 15, ac: 10 }) });
  node({ id: 'syn_tank', tree: 'synergy', name: 'Unkillable Accountant', cost: 3, req: both('warrior', 'necromancer'), desc: 'Warrior + Necro: melee hits heal you for 5% of damage dealt and +5% HP.', eff: () => ({ leech: 5, hpPct: 5 }) });
  node({ id: 'syn_nature', tree: 'synergy', name: 'Touch Grass', cost: 3, req: (C) => C.includes('ranger') && (C.includes('shaman') || C.includes('cleric')), desc: 'Ranger + Shaman or Cleric: +10% run speed and +3 HP regen.', eff: () => ({ runPct: 10, regen: 3 }) });
  node({ id: 'syn_glass', tree: 'synergy', name: 'Glass Cannon Insurance', cost: 3, req: (C) => C.filter((k) => ARCH.caster.includes(k)).length >= 2, desc: 'Two or more caster classes: +6% spell crit and -5% mana cost.', eff: () => ({ scrit: 6, manaSave: 5 }) });
  const NODES = {}; for (const n of N) NODES[n.id] = n;

  function aaNeed(L) { return Math.max(500, Math.floor(D.xpToNext(Math.max(10, L)) * 0.2)); }
  function nodeOpen(n, classes, level) { return level >= n.lvl && (!n.req || n.req(classes)); }
  function spent(aa) { let t = 0; for (const id in aa || {}) if (NODES[id]) t += NODES[id].cost * aa[id]; return t; }
  // clamp a spend map to what this character may own; returns a clean copy (drops everything if over budget)
  function cleanAA(aa, classes, level, earned) {
    const out = {};
    if (aa && typeof aa === 'object') for (const id in aa) { const n = NODES[id], r = Math.floor(+aa[id] || 0); if (n && r > 0 && nodeOpen(n, classes, level)) out[id] = Math.min(n.max, r); }
    return spent(out) <= (earned | 0) ? out : {};
  }
  const tcache = new Map();
  function aaTotals(aa, classes) {
    const key = JSON.stringify([aa, classes]); let T = tcache.get(key); if (T) return T;
    T = { stats: {}, ac: 0, hpPct: 0, meleePct: 0, spellDmg: 0, healPct: 0, manaSave: 0, castSpeed: 0, crit: 0, scrit: 0, regen: 0, manaRegen: 0, runPct: 0, petHpPct: 0, petDmgPct: 0, leech: 0, actives: [] };
    for (const id in aa || {}) {
      const n = NODES[id]; if (!n || !aa[id]) continue;
      if (n.active) { T.actives.push(id); continue; }
      const e = n.eff(aa[id]);
      for (const k in e) { if (k === 'stats') { for (const s in e.stats) T.stats[s] = (T.stats[s] || 0) + e.stats[s]; } else T[k] = (T[k] || 0) + e[k]; }
    }
    if (tcache.size > 300) tcache.clear(); tcache.set(key, T); return T;
  }
  const TREE_NAME = (t) => t === 'general' ? 'General' : t === 'synergy' ? 'Synergy' : t.startsWith('arch:') ? ARCH_NAME[t.slice(5)] + ' (Archetype)' : CLASSES[t.slice(4)].name;
  function respecCost(L) { return 50 * L * L; }

  EB.multi = { SHORT, THIRD_AT, MAX_CLASSES, MAX_PETS, PET_TYPES, ARCH, NODES, NODE_LIST: N, classesOf, maxClasses, validClasses, label, spellLvl, maxHp, maxMana, manaClass, dmgMult, xpMult, acPer,
    petDef, aaNeed, nodeOpen, spent, cleanAA, aaTotals, TREE_NAME, respecCost };
})();
