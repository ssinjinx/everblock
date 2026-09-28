// Everblock - game data: blocks, races, classes, items, spells, mobs
(function () {
  const EB = window.EB;

  // ---------- Blocks ----------
  // tiles: [top, side, bottom] indices into the procedural atlas
  const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, COBBLE: 8,
    PLANKS: 9, BRICK: 10, MOSSY: 11, LANTERN: 12, BEDROCK: 13, ROOF: 14, GRAVEL: 15, CRYPT: 16, WOOL: 17, SNOW: 18, ICE: 19, PINE: 20, BLACKSTONE: 21, BANNER: 22 };
  const BLOCKS = [];
  function def(id, name, tiles, opts) { BLOCKS[id] = Object.assign({ id, name, tiles, solid: true, opaque: true, water: false, emissive: false }, opts || {}); }
  def(B.AIR, 'Air', [0, 0, 0], { solid: false, opaque: false });
  def(B.GRASS, 'Grass', [0, 1, 2]);
  def(B.DIRT, 'Dirt', [2, 2, 2]);
  def(B.STONE, 'Stone', [3, 3, 3]);
  def(B.SAND, 'Sand', [4, 4, 4]);
  def(B.WATER, 'Water', [5, 5, 5], { solid: false, opaque: false, water: true });
  def(B.LOG, 'Log', [7, 6, 7]);
  def(B.LEAVES, 'Leaves', [8, 8, 8]);
  def(B.COBBLE, 'Cobblestone', [9, 9, 9]);
  def(B.PLANKS, 'Planks', [10, 10, 10]);
  def(B.BRICK, 'Brick', [11, 11, 11]);
  def(B.MOSSY, 'Mossy Stone', [12, 12, 12]);
  def(B.LANTERN, 'Lantern', [13, 13, 13], { emissive: true });
  def(B.BEDROCK, 'Bedrock', [14, 14, 14]);
  def(B.ROOF, 'Roof Tiles', [15, 15, 15]);
  def(B.GRAVEL, 'Gravel', [16, 16, 16]);
  def(B.CRYPT, 'Crypt Stone', [17, 17, 17]);
  def(B.WOOL, 'Tent Hide', [18, 18, 18]);
  def(B.SNOW, 'Snow', [19, 20, 2]);
  def(B.ICE, 'Ice', [21, 21, 21]);
  def(B.PINE, 'Pine Needles', [22, 22, 22]);
  def(B.BLACKSTONE, 'Blackstone', [23, 23, 23]);
  def(B.BANNER, 'Warbanner', [24, 24, 24]);
  const BUILDABLE = [B.COBBLE, B.PLANKS, B.BRICK, B.STONE, B.DIRT, B.LOG, B.LEAVES, B.LANTERN, B.ICE];

  // ---------- Races ----------
  // stats: STR STA AGI DEX WIS INT CHA
  const RACES = {
    human:    { name: 'Human',     stats: [75, 75, 75, 75, 75, 75, 75], scale: 1.0,  skin: 0xe0b08a, hair: 0x5a3a1a, classes: ['warrior', 'cleric', 'wizard', 'rogue'], desc: 'Versatile and adaptable, humans may pursue any calling.' },
    barbarian:{ name: 'Barbarian', stats: [103, 95, 82, 70, 70, 60, 55], scale: 1.12, skin: 0xf0c8a0, hair: 0xd8b060, classes: ['warrior', 'rogue'], desc: 'Hardy northern folk. Strong and tough, but slow of wit.' },
    darkelf:  { name: 'Dark Elf',  stats: [60, 65, 90, 75, 83, 99, 60], scale: 0.95, skin: 0x5a5a8a, hair: 0xeeeeee, classes: ['warrior', 'cleric', 'wizard', 'rogue'], desc: 'Cunning children of the underfoot. Sharp minds and ultravision.' },
    dwarf:    { name: 'Dwarf',     stats: [90, 90, 70, 90, 83, 60, 45], scale: 0.78, skin: 0xd8a080, hair: 0x8a3a1a, classes: ['warrior', 'cleric', 'rogue'], desc: 'Stout, stubborn mountain folk with a strong faith.' },
    ogre:     { name: 'Ogre',      stats: [130, 122, 70, 70, 67, 60, 37], scale: 1.35, skin: 0x8a9a6a, hair: 0x2a2a1a, classes: ['warrior'], desc: 'Massive and immensely strong. Not known for their intellect.' },
  };
  const STAT_NAMES = ['STR', 'STA', 'AGI', 'DEX', 'WIS', 'INT', 'CHA'];

  // ---------- Classes ----------
  const CLASSES = {
    warrior: { name: 'Warrior', bonus: [10, 10, 5, 0, 0, 0, 0], hpPer: 22, manaStat: null, dmgMult: 1.15, color: 0xa04040,
      startItems: ['rusty_short_sword', 'cloth_shirt'], desc: 'Masters of melee. Most hit points, no spells.' },
    cleric:  { name: 'Cleric', bonus: [5, 5, 0, 0, 10, 0, 0], hpPer: 15, manaStat: 4, dmgMult: 0.95, color: 0xe0e0ff,
      startItems: ['rusty_mace', 'cloth_shirt'], desc: 'Divine healers who can also wield blunt weapons.' },
    wizard:  { name: 'Wizard', bonus: [0, 5, 0, 0, 0, 10, 0], hpPer: 11, manaStat: 5, dmgMult: 0.8, color: 0x4060d0,
      startItems: ['worn_staff', 'cloth_robe'], desc: 'Arcane nukers. Frail, but deal devastating spell damage.' },
    rogue:   { name: 'Rogue', bonus: [0, 0, 5, 10, 0, 0, 0], hpPer: 17, manaStat: null, dmgMult: 1.05, color: 0x404040,
      startItems: ['rusty_dagger', 'cloth_shirt'], desc: 'Sneaky melee. Backstab from behind for massive damage.' },
  };

  // ---------- Items ----------
  // slot: head neck back chest hands legs feet ring primary secondary | null (misc)
  const ITEMS = {
    rusty_dagger:      { name: 'Rusty Dagger', slot: 'primary', dmg: 4, delay: 2.0, verb: 'pierce', value: 6, icon: '🗡' },
    rusty_short_sword: { name: 'Rusty Short Sword', slot: 'primary', dmg: 6, delay: 2.5, verb: 'slash', value: 8, icon: '⚔' },
    rusty_mace:        { name: 'Rusty Mace', slot: 'primary', dmg: 6, delay: 2.7, verb: 'crush', value: 8, icon: '🔨' },
    worn_staff:        { name: 'Worn Great Staff', slot: 'primary', dmg: 5, delay: 3.0, verb: 'crush', value: 5, icon: '🦯' },
    bronze_long_sword: { name: 'Bronze Long Sword', slot: 'primary', dmg: 9, delay: 2.8, verb: 'slash', stats: { STR: 2 }, value: 350, icon: '⚔' },
    fine_steel_dagger: { name: 'Fine Steel Dagger', slot: 'primary', dmg: 7, delay: 1.9, verb: 'pierce', stats: { DEX: 2 }, value: 300, icon: '🗡' },
    oak_staff:         { name: 'Polished Oak Staff', slot: 'primary', dmg: 7, delay: 3.0, verb: 'crush', stats: { INT: 3, WIS: 3 }, mana: 10, value: 320, icon: '🦯' },
    gnollish_club:     { name: 'Gnollish Club', slot: 'primary', dmg: 8, delay: 2.9, verb: 'crush', stats: { STR: 1 }, value: 40, icon: '🔨' },
    bone_knife:        { name: 'Bone Knife', slot: 'primary', dmg: 6, delay: 2.1, verb: 'pierce', value: 20, icon: '🗡' },
    grimbone_blade:    { name: "Grimbone's Soulblade", slot: 'primary', dmg: 14, delay: 2.6, verb: 'slash', stats: { STR: 5, STA: 5 }, hp: 20, value: 5000, icon: '⚔', rare: true },
    bone_shield:       { name: 'Skeletal Bone Shield', slot: 'secondary', ac: 6, value: 60, icon: '🛡' },
    wooden_shield:     { name: 'Round Wooden Shield', slot: 'secondary', ac: 3, value: 120, icon: '🛡' },
    cloth_cap:         { name: 'Cloth Cap', slot: 'head', ac: 1, value: 4, icon: '🎩' },
    cloth_shirt:       { name: 'Cloth Shirt', slot: 'chest', ac: 2, value: 5, icon: '👕' },
    cloth_robe:        { name: 'Apprentice Robe', slot: 'chest', ac: 1, stats: { INT: 1 }, mana: 5, value: 6, icon: '👘' },
    cloth_pants:       { name: 'Cloth Pants', slot: 'legs', ac: 1, value: 4, icon: '👖' },
    rawhide_gloves:    { name: 'Rawhide Gloves', slot: 'hands', ac: 1, stats: { DEX: 1 }, value: 12, icon: '🧤' },
    leather_boots:     { name: 'Leather Boots', slot: 'feet', ac: 2, value: 15, icon: '🥾' },
    leather_tunic:     { name: 'Leather Tunic', slot: 'chest', ac: 5, value: 150, icon: '🦺' },
    wolf_cloak:        { name: 'Wolfhide Cloak', slot: 'back', ac: 3, stats: { AGI: 2 }, value: 80, icon: '🧥' },
    snakeskin_bracer:  { name: 'Snakeskin Gloves', slot: 'hands', ac: 2, stats: { AGI: 1, DEX: 1 }, value: 45, icon: '🧤' },
    fippy_collar:      { name: "Fippy's Spiked Collar", slot: 'neck', ac: 2, stats: { STA: 3, CHA: 2 }, hp: 10, value: 400, icon: '📿', rare: true },
    crypt_ring:        { name: 'Ring of the Crypt', slot: 'ring', stats: { INT: 3, WIS: 3 }, mana: 20, value: 900, icon: '💍', rare: true },
    bone_helm:         { name: 'Bone-Crested Helm', slot: 'head', ac: 5, stats: { STA: 2 }, value: 250, icon: '⛑' },
    undying_amulet:    { name: 'Amulet of the Undying', slot: 'neck', ac: 3, stats: { STR: 3, STA: 3, WIS: 3, INT: 3 }, hp: 25, mana: 25, value: 3000, icon: '📿', rare: true },
    ghoul_leggings:    { name: 'Ghoulhide Leggings', slot: 'legs', ac: 5, stats: { STA: 2 }, value: 300, icon: '👖' },
    copper_ring:       { name: 'Tarnished Copper Ring', slot: 'ring', stats: { STR: 1, STA: 1 }, value: 60, icon: '💍' },
    // misc / vendor trash
    rat_whiskers:      { name: 'Rat Whiskers', value: 2, stack: true, icon: '〰' },
    snake_scales:      { name: 'Snake Scales', value: 5, stack: true, icon: '🐍' },
    beetle_eye:        { name: 'Fire Beetle Eye', value: 7, stack: true, icon: '👁' },
    bone_chips:        { name: 'Bone Chips', value: 4, stack: true, icon: '🦴' },
    gnoll_fang:        { name: 'Gnoll Fang', value: 12, stack: true, icon: '🦷' },
    wolf_pelt:         { name: 'Gray Wolf Pelt', value: 18, stack: true, icon: '🐺' },
    ghoul_ichor:       { name: 'Vial of Ghoul Ichor', value: 35, stack: true, icon: '🧪' },
    orc_scalp:         { name: 'Frostfang Orc Scalp', value: 22, stack: true, icon: '🪶' },
    frost_wolf_pelt:   { name: 'Frost Wolf Pelt', value: 30, stack: true, icon: '🐺' },
    yeti_fang:         { name: 'Yeti Fang', value: 45, stack: true, icon: '🦷' },
    giant_toe:         { name: 'Frost Giant Toe', value: 70, stack: true, icon: '🦶' },
    fang_warblade:     { name: 'Frostfang Warblade', slot: 'primary', dmg: 13, delay: 2.6, verb: 'slash', stats: { STR: 3 }, value: 900, icon: '⚔' },
    orc_chain:         { name: 'Frostfang Chainmail', slot: 'chest', ac: 12, stats: { STA: 2 }, value: 800, icon: '🦺' },
    shaman_totem:      { name: "Shaman's Frost Totem", slot: 'secondary', stats: { INT: 4, WIS: 4 }, mana: 30, value: 1200, icon: '🪬' },
    yeti_cloak:        { name: 'Yeti Fur Cloak', slot: 'back', ac: 6, stats: { STA: 4 }, value: 700, icon: '🧥' },
    snow_boots:        { name: 'Snowstrider Boots', slot: 'feet', ac: 6, stats: { AGI: 4 }, value: 900, icon: '🥾' },
    giant_helm:        { name: 'Frost Giant Skullcap', slot: 'head', ac: 9, stats: { STA: 3 }, value: 1500, icon: '⛑' },
    icicle_dagger:     { name: 'Icicle Stiletto', slot: 'primary', dmg: 10, delay: 1.9, verb: 'pierce', stats: { DEX: 4, AGI: 2 }, value: 1100, icon: '🗡' },
    tusk_necklace:     { name: "Grimtusk's Tusk Necklace", slot: 'neck', ac: 4, stats: { STR: 5, STA: 5 }, hp: 30, value: 4000, icon: '📿', rare: true },
    frost_greatsword:  { name: 'Frostbound Greatsword', slot: 'primary', dmg: 21, delay: 3.4, verb: 'slash', stats: { STR: 6, STA: 6 }, hp: 40, value: 9000, icon: '⚔', rare: true },
    frozen_heart:      { name: 'Heart of Vorgath', slot: 'ring', stats: { STR: 4, STA: 4, INT: 5, WIS: 5 }, hp: 40, mana: 40, value: 8000, icon: '💎', rare: true },
    militia_bracer:    { name: 'Everblock Militia Bracer', slot: 'hands', ac: 4, stats: { STR: 2, STA: 2 }, value: 200, icon: '🧤' },
    hollis_cloak:      { name: "Hollis's Ranger Cloak", slot: 'back', ac: 7, stats: { AGI: 3, DEX: 3 }, hp: 15, value: 1200, icon: '🧥' },
    healing_potion:    { name: 'Minor Healing Potion', value: 30, stack: true, use: { heal: 45 }, icon: '🧪' },
    greater_potion:    { name: 'Healing Potion', value: 120, stack: true, use: { heal: 150 }, icon: '🧪' },
    bread:             { name: 'Loaf of Bread', value: 3, stack: true, use: { heal: 10 }, icon: '🍞' },
  };
  const EQUIP_SLOTS = ['head', 'neck', 'back', 'chest', 'hands', 'legs', 'feet', 'ring', 'primary', 'secondary'];

  // ---------- Spells / abilities ----------
  // kind: heal | nuke | buff | gate | root | skill
  const SPELLS = {
    bind_wound:   { name: 'Bind Wound', classes: { warrior: 1, cleric: 1, wizard: 1, rogue: 1 }, mana: 0, cast: 4, recast: 25, kind: 'heal', amt: [5, 8], perLvl: 2, skill: true, desc: 'Bandage your wounds. Slow but free.' },
    kick:         { name: 'Kick', classes: { warrior: 1 }, mana: 0, cast: 0, recast: 6, kind: 'skill', dmg: [2, 5], perLvl: 1, verb: 'kick', desc: 'A quick kick. Instant.' },
    battle_fury:  { name: 'Battle Fury', classes: { warrior: 5 }, mana: 0, cast: 0, recast: 90, kind: 'buff', buff: { dmgPct: 25 }, dur: 30, self: true, skill: true, desc: '+25% melee damage for 30s.' },
    backstab:     { name: 'Backstab', classes: { rogue: 1 }, mana: 0, cast: 0, recast: 8, kind: 'skill', backstab: true, verb: 'backstab', desc: 'Must be behind target. Massive piercing damage.' },
    evade:        { name: 'Evade', classes: { rogue: 3 }, mana: 0, cast: 0, recast: 30, kind: 'buff', buff: { dodge: 40 }, dur: 8, self: true, skill: true, desc: '+40% dodge for 8s.' },
    minor_healing:{ name: 'Minor Healing', classes: { cleric: 1 }, mana: 10, cast: 1.5, recast: 2, kind: 'heal', amt: [12, 18], perLvl: 1, desc: 'Heals a small amount. Target a group member to heal them.', friendly: true },
    strike:       { name: 'Strike', classes: { cleric: 1 }, mana: 12, cast: 1.5, recast: 4, kind: 'nuke', dmg: [6, 10], perLvl: 1, school: 'magic', desc: 'A divine strike against your foe.' },
    courage:      { name: 'Courage', classes: { cleric: 1 }, mana: 15, cast: 2, recast: 3, kind: 'buff', buff: { ac: 4, hp: 10 }, dur: 900, friendly: true, desc: '+4 AC, +10 HP.' },
    light_healing:{ name: 'Light Healing', classes: { cleric: 4 }, mana: 25, cast: 2, recast: 2, kind: 'heal', amt: [30, 45], perLvl: 2, desc: 'Heals a moderate amount.', friendly: true },
    holy_armor:   { name: 'Holy Armor', classes: { cleric: 6 }, mana: 30, cast: 2.5, recast: 3, kind: 'buff', buff: { ac: 10 }, dur: 1200, friendly: true, desc: '+10 AC.' },
    furor:        { name: 'Furor', classes: { cleric: 8 }, mana: 35, cast: 2, recast: 6, kind: 'nuke', dmg: [28, 38], perLvl: 2, school: 'magic', desc: 'Holy wrath.' },
    word_of_health:{ name: 'Word of Health', classes: { cleric: 7 }, mana: 50, cast: 3, recast: 8, kind: 'groupheal', amt: [35, 50], perLvl: 2, desc: 'Heals you and your whole group.' },
    healing:      { name: 'Healing', classes: { cleric: 9 }, mana: 55, cast: 2.5, recast: 2, kind: 'heal', amt: [75, 95], perLvl: 3, desc: 'Heals a large amount.', friendly: true },
    blast_of_cold:{ name: 'Blast of Cold', classes: { wizard: 1 }, mana: 8, cast: 1.5, recast: 3, kind: 'nuke', dmg: [8, 12], perLvl: 1.5, school: 'cold', desc: 'A blast of frigid air.' },
    minor_shielding:{ name: 'Minor Shielding', classes: { wizard: 1 }, mana: 10, cast: 2, recast: 3, kind: 'buff', buff: { ac: 3, hp: 8 }, dur: 900, self: true, desc: '+3 AC, +8 HP.' },
    shock_of_fire:{ name: 'Shock of Fire', classes: { wizard: 4 }, mana: 20, cast: 2, recast: 5, kind: 'nuke', dmg: [20, 28], perLvl: 2, school: 'fire', desc: 'Scorches your foe.' },
    root:         { name: 'Root', classes: { wizard: 5 }, mana: 18, cast: 1.5, recast: 10, kind: 'root', dur: 18, desc: 'Roots the target in place.' },
    gate:         { name: 'Gate', classes: { wizard: 4, cleric: 5 }, mana: 30, cast: 5, recast: 60, kind: 'gate', desc: 'Teleports you to your bind point.' },
    shock_of_lightning:{ name: 'Shock of Lightning', classes: { wizard: 8 }, mana: 38, cast: 2.5, recast: 6, kind: 'nuke', dmg: [40, 55], perLvl: 2.5, school: 'magic', desc: 'Calls down lightning.' },
  };

  // ---------- Mobs ----------
  // model: quad | biped | snake
  const MOBS = {
    rat:      { name: 'a large rat', lvl: [1, 2], model: 'quad', color: 0x6e5238, scale: 0.45, aggro: 9, aggressive: true, faction: 'vermin', social: false, verb: 'bite', delay: 2.0, speed: 3.4, flee: true,
      loot: [['rat_whiskers', 0.6]] },
    snake:    { name: 'a grass snake', lvl: [1, 2], model: 'snake', color: 0x4f8a3a, scale: 0.5, aggro: 0, aggressive: false, faction: 'vermin', verb: 'bite', delay: 2.2, speed: 2.8, flee: true,
      loot: [['snake_scales', 0.6], ['snakeskin_bracer', 0.05]] },
    beetle:   { name: 'a fire beetle', lvl: [2, 4], model: 'quad', color: 0xb8401a, scale: 0.55, aggro: 7, aggressive: true, faction: 'beetle', verb: 'bite', delay: 2.2, speed: 3.0, flee: true,
      loot: [['beetle_eye', 0.6], ['copper_ring', 0.04]] },
    skeleton: { name: 'a decaying skeleton', lvl: [1, 3], model: 'biped', color: 0xe8e2c8, scale: 0.9, thin: true, aggro: 12, aggressive: true, faction: 'undead', social: true, verb: 'hit', delay: 2.4, speed: 3.0,
      loot: [['bone_chips', 0.7], ['cloth_cap', 0.08], ['cloth_pants', 0.08], ['bone_knife', 0.05]] },
    gnoll_pup:{ name: 'a gnoll pup', lvl: [2, 4], model: 'biped', color: 0x8a6a3a, scale: 0.8, snout: true, aggro: 12, aggressive: true, faction: 'gnoll', social: true, verb: 'hit', delay: 2.3, speed: 3.6, flee: true,
      loot: [['gnoll_fang', 0.5], ['rawhide_gloves', 0.08], ['leather_boots', 0.06]] },
    gnoll:    { name: 'a gnoll', lvl: [4, 6], model: 'biped', color: 0x7a5a2a, scale: 1.05, snout: true, aggro: 14, aggressive: true, faction: 'gnoll', social: true, verb: 'hit', delay: 2.4, speed: 3.8, flee: true,
      loot: [['gnoll_fang', 0.7], ['gnollish_club', 0.1], ['wooden_shield', 0.05]] },
    fippy:    { name: 'Fippy Darkpaw', lvl: [5, 5], model: 'biped', color: 0x5a3a1a, scale: 1.0, snout: true, aggro: 18, aggressive: true, faction: 'gnoll', social: true, verb: 'hit', delay: 2.2, speed: 4.0, named: true,
      loot: [['fippy_collar', 1.0], ['gnoll_fang', 1.0]] },
    wolf:     { name: 'a gray wolf', lvl: [3, 5], model: 'quad', color: 0x8a8a8a, scale: 0.75, aggro: 14, aggressive: true, faction: 'wolf', social: true, verb: 'bite', delay: 2.0, speed: 4.4, flee: true,
      loot: [['wolf_pelt', 0.6], ['wolf_cloak', 0.06]] },
    skel_warrior:{ name: 'a skeleton warrior', lvl: [6, 8], model: 'biped', color: 0xd8d2b8, scale: 1.05, thin: true, weapon: true, aggro: 12, aggressive: true, faction: 'undead', social: true, verb: 'slash', delay: 2.4, speed: 3.4,
      loot: [['bone_chips', 0.8], ['bone_shield', 0.1], ['bone_helm', 0.06]] },
    ghoul:    { name: 'a crypt ghoul', lvl: [7, 9], model: 'biped', color: 0x6a8a6a, scale: 1.05, aggro: 13, aggressive: true, faction: 'undead', social: true, verb: 'claw', delay: 2.3, speed: 3.4,
      loot: [['ghoul_ichor', 0.6], ['ghoul_leggings', 0.07], ['crypt_ring', 0.03]] },
    grimbone: { name: 'Lord Grimbone the Undying', lvl: [11, 11], model: 'biped', color: 0x3a3a4a, scale: 1.6, weapon: true, glow: 0x55ff99, aggro: 16, aggressive: true, faction: 'undead', social: true, verb: 'slash', delay: 2.8, speed: 3.6, named: true, hpMult: 2.2, dmgMult: 1.3,
      loot: [['grimbone_blade', 0.5], ['undying_amulet', 0.5], ['crypt_ring', 0.3]] },
    // ---- The Frostfang Highlands (zone 2) ----
    frost_wolf: { name: 'a frost wolf', lvl: [8, 10], model: 'quad', color: 0xe8eef4, scale: 0.85, aggro: 15, aggressive: true, faction: 'frostwolf', social: true, verb: 'bite', delay: 2.0, speed: 4.6, flee: true,
      loot: [['frost_wolf_pelt', 0.7], ['snow_boots', 0.04]] },
    orc_grunt: { name: 'a Frostfang orc grunt', lvl: [8, 10], model: 'biped', color: 0x4f6a44, scale: 1.1, snout: true, weapon: true, aggro: 14, aggressive: true, faction: 'orc', social: true, verb: 'slash', delay: 2.4, speed: 3.8, flee: true,
      loot: [['orc_scalp', 0.75], ['orc_chain', 0.05], ['fang_warblade', 0.04]] },
    orc_shaman: { name: 'a Frostfang orc shaman', lvl: [9, 11], model: 'biped', color: 0x6a5a8a, scale: 1.0, snout: true, glow: 0x80c0ff, aggro: 14, aggressive: true, faction: 'orc', social: true, verb: 'hit', delay: 2.6, speed: 3.4,
      caster: { name: 'Frost Shock', dmg: [14, 26], cast: 2.5, cd: 11, range: 26 }, loot: [['orc_scalp', 0.75], ['shaman_totem', 0.06]] },
    yeti: { name: 'a mountain yeti', lvl: [10, 12], model: 'biped', color: 0xf2f2f6, scale: 1.4, aggro: 12, aggressive: true, faction: 'yeti', social: false, verb: 'claw', delay: 2.6, speed: 3.6,
      loot: [['yeti_fang', 0.7], ['yeti_cloak', 0.07], ['icicle_dagger', 0.04]] },
    frost_giant: { name: 'a frost giant', lvl: [13, 15], model: 'biped', color: 0x8fb4d8, scale: 2.0, aggro: 14, aggressive: true, faction: 'giant', social: true, verb: 'crush', delay: 3.0, speed: 3.4, hpMult: 1.4,
      loot: [['giant_toe', 0.8], ['giant_helm', 0.08], ['greater_potion', 0.2]] },
    grimtusk: { name: 'Warlord Grimtusk', lvl: [13, 13], model: 'biped', color: 0x2f4a2a, scale: 1.4, snout: true, weapon: true, glow: 0xff5020, aggro: 16, aggressive: true, faction: 'orc', social: true, verb: 'slash', delay: 2.4, speed: 3.8, named: true, hpMult: 2.0, dmgMult: 1.2,
      loot: [['tusk_necklace', 0.6], ['fang_warblade', 0.5], ['orc_chain', 0.4]] },
    vorgath: { name: 'Vorgath the Frostbound', lvl: [15, 15], model: 'biped', color: 0x5a8ac8, scale: 2.3, weapon: true, glow: 0x80ffff, aggro: 16, aggressive: true, faction: 'giant', social: true, verb: 'crush', delay: 3.2, speed: 3.4, named: true, hpMult: 3.0, dmgMult: 1.3,
      caster: { name: 'Glacial Breath', dmg: [30, 50], cast: 3, cd: 16, range: 22 }, loot: [['frost_greatsword', 0.5], ['frozen_heart', 0.5], ['giant_helm', 0.5]] },
  };

  // Mercenaries (hired at the Mercenary Liaison in Everblock Keep)
  const MERCS = {
    healer: { name: 'Sister Maelin', cls: 'cleric', color: 0xeaeaff, skin: 0xe8c0a0, hair: 0xc89040, desc: 'A devoted cleric. Heals the group and buffs Courage.' },
    tank:   { name: 'Borin Stoutshield', cls: 'warrior', color: 0x8a8a9a, skin: 0xd8a080, hair: 0x8a3a1a, scale: 0.85, desc: 'A dwarven warrior. Taunts foes off you and holds aggro.' },
  };
  function mercCost(role, L) { return (role === 'healer' ? 25 : 20) + L * L * 10; }

  // Simple hand-in quests
  const QUESTS = {
    rat_problem: { name: 'A Rat Problem', giver: 'Merchant Tiloria', item: 'rat_whiskers', count: 5, coins: 60, reward: 'healing_potion', rewardCount: 2, xp: 80,
      offer: "Those filthy rats keep getting into my stores! Bring me 5 Rat Whiskers as proof you've thinned them out and I'll make it worth your while.",
      done: 'Ha! That will teach them. Here, take these potions and a little coin for your trouble.' },
    gnoll_menace: { name: 'The Gnoll Menace', giver: 'Guard Halric', item: 'gnoll_fang', count: 4, coins: 300, reward: 'militia_bracer', rewardCount: 1, xp: 450,
      offer: "The Darkpaw gnolls in the camp to the west grow bolder by the day. Bring me 4 Gnoll Fangs and the Keep will reward you with a militia bracer.",
      done: 'Well fought, citizen! Wear this bracer with pride. The Keep thanks you.' },
    orc_scalps: { name: 'Scalps for the Outpost', giver: 'Scout Hollis', item: 'orc_scalp', count: 3, coins: 1500, reward: 'hollis_cloak', rewardCount: 1, xp: 3500,
      offer: "The Frostfang orcs raid my outpost every night. Bring me 3 of their scalps and my old ranger cloak is yours.",
      done: "That'll give them pause. Take my cloak; it has kept me warm through many a Frostfang winter." },
  };

  // Con colors: grey green lightblue blue white yellow red
  function conColor(plLvl, mobLvl) {
    const d = mobLvl - plLvl;
    if (d >= 3) return 'red';
    if (d >= 1) return 'yellow';
    if (d === 0) return 'white';
    const greyAt = plLvl <= 7 ? -5 : plLvl <= 12 ? -6 : -8;
    if (d <= greyAt) return 'grey';
    const greenAt = plLvl <= 7 ? -3 : -4;
    if (d <= greenAt) return 'green';
    if (d <= -2 && plLvl >= 8) return 'lightblue';
    return 'blue';
  }
  const CON_HEX = { grey: '#9a9a9a', green: '#36d436', lightblue: '#6fe0ff', blue: '#4f7bff', white: '#ffffff', yellow: '#ffe23a', red: '#ff3a3a' };
  const CON_XP = { grey: 0, green: 0.5, lightblue: 0.75, blue: 0.9, white: 1, yellow: 1.15, red: 1.3 };
  const CON_MSG = {
    grey: 'looks like a waste of your time', green: 'looks like a reasonably safe opponent', lightblue: 'looks like a reasonably safe opponent',
    blue: 'looks like you would have the upper hand', white: 'looks like an even fight', yellow: 'looks quite dangerous', red: 'looks like it would wipe the floor with you!',
  };

  function xpToNext(L) { return Math.floor(80 * L * L + 20 * L); }
  const MAX_LEVEL = 20;

  EB.data = { MERCS, mercCost, QUESTS, B, BLOCKS, BUILDABLE, RACES, STAT_NAMES, CLASSES, ITEMS, EQUIP_SLOTS, SPELLS, MOBS, conColor, CON_HEX, CON_XP, CON_MSG, xpToNext, MAX_LEVEL };
})();
