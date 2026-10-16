// Everblock v8 "gear pass": item quality tiers, weapon procs, click effects, focus effects, armor sets and random
// suffix affixes. Shared by the browser game and the multiplayer server (loaded right after data.js).
// Item instances stay { id, count } and may carry an optional sfx (affix key); old saves simply have none.
(function () {
  const EB = (typeof window !== 'undefined' ? window : globalThis).EB;
  const D = EB.data, ITEMS = D.ITEMS, MOBS = D.MOBS;

  // ---------- quality tiers ----------
  const QUALITY = {
    common:    { n: 0, label: 'Common', color: '#e8e0cc' },
    uncommon:  { n: 1, label: 'Uncommon', color: '#5ee05e' },
    rare:      { n: 2, label: 'Rare', color: '#4fa3ff' },
    epic:      { n: 3, label: 'Epic', color: '#c070ff' },
    legendary: { n: 4, label: 'Legendary', color: '#ff9a1f' },
  };
  const QORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const QHEX = { common: 0xe8e0cc, uncommon: 0x5ee05e, rare: 0x4fa3ff, epic: 0xc070ff, legendary: 0xff9a1f };

  // ---------- new items (ids are new, so old saves are untouched) ----------
  Object.assign(ITEMS, {
    zap_rod:         { name: 'Totally Safe Lightning Rod', slot: 'primary', dmg: 30, delay: 3.0, verb: 'crush', stats: { STR: 6, DEX: 8, INT: 8 }, hp: 80, value: 26000, icon: '⚡', rare: true },
    borrowed_dagger: { name: 'Dagger of Borrowed Time', slot: 'primary', dmg: 22, delay: 2.0, verb: 'pierce', stats: { DEX: 8, AGI: 6 }, hp: 60, value: 18000, icon: '🗡', rare: true },
    everflame:       { name: 'Everflame, Blade of Mild Inconvenience', slot: 'primary', dmg: 40, delay: 2.8, verb: 'slash', stats: { STR: 15, DEX: 12, STA: 10 }, hp: 180, value: 90000, icon: '⚔', rare: true },
    haste_gloves:    { name: 'Gloves of Unreasonable Haste', slot: 'hands', ac: 10, stats: { DEX: 8, AGI: 8 }, value: 15000, icon: '🧤', rare: true },
    ashen_handwraps: { name: 'Ashen Cult Handwraps', slot: 'hands', ac: 8, stats: { INT: 8, WIS: 8 }, mana: 60, value: 16000, icon: '🧤' },
    mana_rock:       { name: 'Rock of Questionable Mana', slot: 'secondary', stats: { INT: 6, WIS: 6 }, mana: 80, value: 14000, icon: '🪨', rare: true },
    frost_mitts:     { name: 'Frostfang Raider Mitts', slot: 'hands', ac: 6, stats: { STR: 3, STA: 3 }, value: 1100, icon: '🧤' },
    pocket_hearth:   { name: 'Pocket Hearthrock (Slightly Used)', value: 2500, icon: '🪨' },
  });
  const addLoot = (mob, id, ch) => { if (MOBS[mob]) (MOBS[mob].loot = MOBS[mob].loot || []).push([id, ch]); };
  addLoot('brasskull', 'zap_rod', 0.3); addLoot('magma_giant', 'zap_rod', 0.02); addLoot('obsidian_golem', 'zap_rod', 0.02);
  addLoot('soggs', 'borrowed_dagger', 0.35); addLoot('drowned_zealot', 'borrowed_dagger', 0.02);
  addLoot('pyrrhax', 'everflame', 0.3);
  addLoot('scorchmaw', 'haste_gloves', 0.35); addLoot('cinder_hound', 'haste_gloves', 0.015);
  addLoot('ash_pyro', 'ashen_handwraps', 0.05); addLoot('ash_zealot', 'ashen_handwraps', 0.04); addLoot('kindleton', 'ashen_handwraps', 0.4);
  addLoot('frog_priest', 'mana_rock', 0.03); addLoot('swamp_wisp', 'mana_rock', 0.03); addLoot('ribbitus', 'mana_rock', 0.3);
  addLoot('orc_grunt', 'frost_mitts', 0.04); addLoot('grimtusk', 'frost_mitts', 0.4);
  if (D.STOCKS.bz_supplies && !D.STOCKS.bz_supplies.includes('pocket_hearth')) D.STOCKS.bz_supplies.push('pocket_hearth');

  // ---------- weapon procs ----------
  // kind: nuke (direct damage), dot (damage over time), tap (damage + heal you), frost (damage + slow), chain (lightning jumps to nearby foes)
  const PROCS = {
    soul_siphon:  { name: 'Soul Siphon', kind: 'tap', school: 'life', dmg: [18, 30], ppm: 4, color: 0x55ff99, desc: 'drains 18-30 HP from the target and gives it to you' },
    frostbite:    { name: 'Frostbite', kind: 'frost', school: 'cold', dmg: [20, 34], ppm: 4, slow: 8, color: 0x9ef0ff, desc: 'deals 20-34 cold damage and slows the target for 8s' },
    chilly:       { name: 'Chilly Reception', kind: 'frost', school: 'cold', dmg: [10, 18], ppm: 4, slow: 6, color: 0x9ef0ff, desc: 'deals 10-18 cold damage and slows the target for 6s' },
    venom_drip:   { name: 'Venom Drip', kind: 'dot', school: 'poison', dmg: [6, 10], dur: 18, ppm: 5, color: 0x90ff40, desc: 'poisons the target for 6-10 damage every 3s (18s)' },
    solar_flare:  { name: 'Solar Flare', kind: 'dot', school: 'fire', dmg: [14, 20], dur: 18, ppm: 4, color: 0xffc040, desc: 'sets the target ablaze for 14-20 damage every 3s (18s)' },
    sandblast:    { name: 'Sandblast', kind: 'nuke', school: 'magic', dmg: [45, 70], ppm: 3, color: 0xe8d090, desc: 'blasts the target for 45-70 damage' },
    bog_rot:      { name: 'Bog Rot', kind: 'dot', school: 'disease', dmg: [20, 28], dur: 18, ppm: 4, color: 0x90d040, desc: 'rots the target for 20-28 damage every 3s (18s)' },
    hammer_time:  { name: 'Hammer Time', kind: 'nuke', school: 'fire', dmg: [80, 120], ppm: 3, color: 0xff8030, desc: 'can\'t touch this: 80-120 fire damage' },
    unquenched:   { name: 'Unquenchable Flame', kind: 'dot', school: 'fire', dmg: [30, 42], dur: 18, ppm: 4, color: 0xff6020, desc: 'burns the target for 30-42 damage every 3s (18s)' },
    chain_zap:    { name: 'Chain Zap (Probably Grounded)', kind: 'chain', school: 'magic', dmg: [60, 90], ppm: 4, jumps: 2, color: 0x80c0ff, desc: 'zaps the target for 60-90 damage and arcs to 2 nearby foes that are already fighting you' },
    borrowed:     { name: 'Borrowed Vitality', kind: 'tap', school: 'life', dmg: [45, 65], ppm: 5, color: 0xff4070, desc: 'drains 45-65 HP from the target and gives it to you' },
    everburn:     { name: 'Everburn', kind: 'nuke', school: 'fire', dmg: [140, 200], ppm: 4, dot: [25, 35], dur: 12, color: 0xff7a1a, desc: 'scorches the target for 140-200 damage, then 25-35 every 3s (12s)' },
  };
  // ---------- click effects (usable from inventory or hotbar; cooldowns per item) ----------
  const CLICKS = {
    warden_recall:  { name: "Warden's Recall", kind: 'port', cd: 600, desc: 'Teleports you to your bind point.' },
    hearth:         { name: 'Hearth, Sweet Hearth', kind: 'port', cd: 900, desc: 'Teleports you to your bind point. Smells faintly of somebody else\'s pocket.' },
    tusk_warcry:    { name: 'Warcry of the Tusk', kind: 'buff', cd: 300, dur: 60, buff: { dmgPct: 15, ac: 10 }, color: 0xff8040, desc: '+15% melee damage and +10 AC for 60s.' },
    zoomies:        { name: 'The Zoomies', kind: 'buff', cd: 300, dur: 60, buff: { hastePct: 25 }, color: 0xfff070, desc: '25% attack haste for 60s.' },
    unreasonable:   { name: 'Unreasonable Haste', kind: 'buff', cd: 180, dur: 45, buff: { hastePct: 30 }, color: 0xfff070, desc: '30% attack haste for 45s.' },
    eternal_bandaid:{ name: 'Eternal Band-Aid', kind: 'heal', cd: 120, amt: 300, desc: 'Heals you for 300 HP.' },
    stretch_break:  { name: 'Stretch Break', kind: 'heal', cd: 180, amt: 200, desc: 'Heals you for 200 HP.' },
    good_boy:       { name: 'Who\'s a Good Boy', kind: 'buff', cd: 600, dur: 300, buff: { ac: 6, hp: 20 }, color: 0xd8b050, desc: '+6 AC and +20 HP for 5 minutes. Yes you are.' },
    fervor:         { name: 'Flamebreaker Fervor', kind: 'buff', cd: 300, dur: 45, buff: { dmgPct: 20, hastePct: 20 }, color: 0xff6020, desc: '+20% melee damage and 20% attack haste for 45s.' },
    mana_burp:      { name: 'Questionable Mana Burp', kind: 'mana', cd: 240, amt: 200, desc: 'Restores 200 mana. Do not ask where it came from.' },
  };
  const FOCUS_LABEL = { spellDmg: 'Spell Damage', healPct: 'Healing', manaSave: 'Mana Cost Reduction', castSpeed: 'Spell Haste' };
  const SETS = {
    frostfang: { name: "Frostfang Raider's Kit", items: ['orc_chain', 'snow_boots', 'giant_helm', 'yeti_cloak', 'frost_mitts'],
      bonus: { 2: { ac: 5, hp: 25 }, 4: { stats: { STR: 5, STA: 5 }, dmgPct: 5 } } },
    bazaar: { name: 'Bargain-Bin Battlegear', items: ['bazaar_helm', 'bazaar_breastplate', 'bazaar_gauntlets', 'bazaar_greaves', 'bazaar_boots', 'bazaar_cloak', 'bazaar_shield'],
      bonus: { 2: { ac: 8, hp: 40 }, 4: { stats: { STR: 6, STA: 6, AGI: 6 }, dmgPct: 5 } } },
    soggy: { name: 'Soggy Bottom Ensemble', items: ['gatorhide_boots', 'troll_vest', 'drowned_wraps', 'mire_waders', 'ribbitus_crown'],
      bonus: { 2: { hp: 60, ac: 6 }, 4: { ac: 15, hp: 80, stats: { STA: 8 }, hastePct: 5 } } },
    ashen: { name: 'Regalia of the Ashen Hype', items: ['cultist_robe', 'kindleton_mantle', 'caldera_crown', 'ashen_handwraps', 'emberstep_boots'],
      bonus: { 2: { mana: 80, focus: { manaSave: 10 } }, 4: { stats: { INT: 8, WIS: 8 }, focus: { spellDmg: 15, castSpeed: 10 } } } },
  };
  // ---------- assignments to existing items ----------
  const ASSIGN = {
    grimbone_blade: { proc: 'soul_siphon', q: 'epic' }, frost_greatsword: { proc: 'frostbite', q: 'epic' }, icicle_dagger: { proc: 'chilly' }, fang_warblade: { proc: 'chilly' },
    venom_stinger: { proc: 'venom_drip' }, sunforged_khopesh: { proc: 'solar_flare', q: 'epic' }, dune_maul: { proc: 'sandblast' }, mire_greatsword: { proc: 'bog_rot' },
    brasskull_hammer: { proc: 'hammer_time' }, unquenched_blade: { proc: 'unquenched', q: 'legendary' }, zap_rod: { proc: 'chain_zap', q: 'epic' },
    borrowed_dagger: { proc: 'borrowed', q: 'epic' }, everflame: { proc: 'everburn', q: 'legendary' },
    warden_signet: { click: 'warden_recall' }, sunward_signet: { click: 'warden_recall' }, pocket_hearth: { click: 'hearth', q: 'uncommon' },
    tusk_necklace: { click: 'tusk_warcry' }, whitefang_collar: { click: 'zoomies' }, haste_gloves: { click: 'unreasonable', q: 'epic' },
    ankh_amulet: { click: 'eternal_bandaid', focus: { healPct: 20 } }, bloated_girdle: { click: 'stretch_break' }, fippy_collar: { click: 'good_boy' },
    caldera_signet: { click: 'fervor', q: 'legendary' }, mana_rock: { click: 'mana_burp', focus: { manaSave: 5 } },
    crypt_ring: { focus: { manaSave: 5 } }, undying_amulet: { focus: { healPct: 10 } }, pharaoh_crook: { focus: { spellDmg: 15 } }, frozen_heart: { focus: { castSpeed: 10 } },
    djinn_ring: { focus: { manaSave: 10 } }, mummy_mask: { focus: { spellDmg: 10 } }, soggs_censer: { focus: { healPct: 25 } },
    glubb_scepter: { focus: { spellDmg: 25, castSpeed: 15 }, q: 'legendary' }, kindleton_mantle: { focus: { manaSave: 15 } }, caldera_crown: { focus: { spellDmg: 20, manaSave: 10 }, q: 'legendary' },
    molten_plate: { q: 'legendary' }, oak_staff: { focus: { castSpeed: 5 } }, shaman_totem: { focus: { healPct: 10 } },
  };
  for (const id in ASSIGN) if (ITEMS[id]) Object.assign(ITEMS[id], ASSIGN[id]);
  for (const s in SETS) for (const id of SETS[s].items) if (ITEMS[id]) ITEMS[id].set = s;
  for (const id in ITEMS) {
    const it = ITEMS[id];
    if (!it.q) it.q = !it.slot ? 'common' : it.rare ? (it.value >= 30000 ? 'epic' : 'rare') : it.value >= 1000 || it.set ? 'uncommon' : 'common';
  }

  // ---------- suffix affixes (rolled on drops, stored as inst.sfx) ----------
  const AFFIXES = {
    bear:   { name: 'of the Bear Who Skipped Leg Day', stats: { STR: 1, STA: 1 } },
    owl:    { name: 'of the Owl (Who?)', stats: { INT: 1, WIS: 1 } },
    monkey: { name: 'of Monkey Business', stats: { AGI: 1, DEX: 1 } },
    falcon: { name: 'of the Falcon Punch', stats: { STR: 1, DEX: 1 } },
    fox:    { name: 'of the Smooth-Talking Fox', stats: { CHA: 2, AGI: 1 } },
    whale:  { name: 'of the Whale', hp: 6 },
    squid:  { name: 'of the Squid Ink', mana: 6 },
    turtle: { name: 'of the Turtle in a Hurry', ac: 1, stats: { AGI: 1 } },
    tank:   { name: 'of the Overconfident Tank', hp: 4, stats: { STA: 1 } },
    sage:   { name: 'of the Sage Who Read the Manual', mana: 4, stats: { WIS: 1 } },
  };
  const AFFIX_KEYS = Object.keys(AFFIXES);
  const TIER_MULT = [1, 2, 4, 6, 9];
  function tierOf(it) { const v = it.value || 0; return v < 100 ? 0 : v < 1000 ? 1 : v < 5000 ? 2 : v < 20000 ? 3 : 4; }
  function canAffix(it) { return !!(it && it.slot && !it.quest); }
  function rollDrop(id, count) {
    const it = ITEMS[id], o = { id, count: count || 1 };
    if (canAffix(it) && Math.random() < (it.rare ? 0.35 : 0.25)) o.sfx = AFFIX_KEYS[Math.floor(Math.random() * AFFIX_KEYS.length)];
    return o;
  }
  const cache = new Map();
  // effective definition of an item instance (base item + affix); accepts an instance or a bare id
  function def(inst) {
    if (!inst) return null;
    const id = typeof inst === 'string' ? inst : inst.id, sfx = typeof inst === 'string' ? null : inst.sfx, base = ITEMS[id];
    if (!base) return null;
    if (!sfx || !AFFIXES[sfx] || !canAffix(base)) return base;
    const key = id + '|' + sfx; let d = cache.get(key);
    if (d) return d;
    const A = AFFIXES[sfx], m = TIER_MULT[tierOf(base)];
    d = Object.assign({}, base, { name: base.name + ' ' + A.name, baseName: base.name, sfx, stats: Object.assign({}, base.stats || {}) });
    if (A.stats) for (const k in A.stats) d.stats[k] = (d.stats[k] || 0) + A.stats[k] * m;
    if (A.hp) d.hp = (d.hp || 0) + A.hp * m;
    if (A.mana) d.mana = (d.mana || 0) + A.mana * m;
    if (A.ac) d.ac = (d.ac || 0) + A.ac * m;
    d.value = Math.round((base.value || 0) * 1.25);
    if (QUALITY[d.q].n < 1) d.q = 'uncommon';
    d.affixed = true;
    cache.set(key, d); return d;
  }
  function quality(inst) { const d = def(inst); return (d && d.q) || 'common'; }
  function qcolor(inst) { return QUALITY[quality(inst)].color; }
  function copy(inst, count) { if (!inst) return null; const o = { id: inst.id, count: count != null ? count : inst.count || 1 }; if (inst.sfx && AFFIXES[inst.sfx]) o.sfx = inst.sfx; return o; }
  function equipCopy(inst) { const o = { id: inst.id }; if (inst.sfx && AFFIXES[inst.sfx]) o.sfx = inst.sfx; return o; }

  // totals for a worn equipment map: stats, hp/mana/ac, focus (best of each kind, no stacking), set bonuses, procs, clickies
  const totCache = new Map();
  function totals(equip) {
    let key = '';
    for (const sl in equip) { const e = equip[sl]; if (e) key += sl + ':' + e.id + (e.sfx ? '+' + e.sfx : '') + ';'; }
    let T = totCache.get(key);
    if (T) return T;
    T = { stats: {}, hp: 0, mana: 0, ac: 0, dmgPct: 0, hastePct: 0, focus: {}, sets: [], procs: [], clicks: [], legendaryArmor: false };
    const setN = {};
    const addF = (f) => { for (const k in f) T.focus[k] = Math.max(T.focus[k] || 0, f[k]); };
    for (const sl in equip) {
      const it = def(equip[sl]); if (!it) continue;
      if (it.stats) for (const k in it.stats) T.stats[k] = (T.stats[k] || 0) + it.stats[k];
      T.hp += it.hp || 0; T.mana += it.mana || 0; T.ac += it.ac || 0;
      if (it.focus) addF(it.focus);
      if (it.set) setN[it.set] = (setN[it.set] || 0) + 1;
      if (it.proc && sl === 'primary') T.procs.push(it.proc);
      if (it.click) T.clicks.push(equip[sl].id);
      if (it.q === 'legendary' && sl !== 'primary' && sl !== 'secondary') T.legendaryArmor = true;
    }
    for (const s in setN) {
      const S = SETS[s], n = setN[s], act = [];
      for (const need of Object.keys(S.bonus).map(Number).sort((a, b) => a - b)) {
        if (n < need) continue;
        const B = S.bonus[need]; act.push(need);
        if (B.stats) for (const k in B.stats) T.stats[k] = (T.stats[k] || 0) + B.stats[k];
        T.hp += B.hp || 0; T.mana += B.mana || 0; T.ac += B.ac || 0; T.dmgPct += B.dmgPct || 0; T.hastePct += B.hastePct || 0;
        if (B.focus) addF(B.focus);
      }
      T.sets.push({ id: s, n, active: act });
    }
    if (totCache.size > 500) totCache.clear();
    totCache.set(key, T); return T;
  }
  function procChance(p, delay) { return Math.min(0.5, (PROCS[p].ppm * (delay || 3)) / 60); }
  function glowHex(id) {
    const it = ITEMS[id]; if (!it) return null;
    if (it.proc) return PROCS[it.proc].color;
    if (it.q === 'legendary' || it.q === 'epic') return QHEX[it.q];
    return null;
  }
  function bonusText(B) {
    const p = [];
    if (B.stats) for (const k in B.stats) p.push(`${k} +${B.stats[k]}`);
    if (B.ac) p.push(`AC +${B.ac}`); if (B.hp) p.push(`HP +${B.hp}`); if (B.mana) p.push(`Mana +${B.mana}`);
    if (B.dmgPct) p.push(`Melee damage +${B.dmgPct}%`); if (B.hastePct) p.push(`Attack haste +${B.hastePct}%`);
    if (B.focus) for (const k in B.focus) p.push(`${FOCUS_LABEL[k]} +${B.focus[k]}%`);
    return p.join(', ');
  }
  EB.gear = { QUALITY, QORDER, QHEX, PROCS, CLICKS, SETS, AFFIXES, FOCUS_LABEL, def, quality, qcolor, rollDrop, copy, equipCopy, totals, procChance, glowHex, bonusText, canAffix };
})();
