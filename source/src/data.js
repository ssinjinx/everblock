// Everblock - game data: blocks, races, classes, items, spells, mobs
(function () {
  const EB = window.EB;

  // ---------- Blocks ----------
  // tiles: [top, side, bottom] indices into the procedural atlas
  const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, COBBLE: 8,
    PLANKS: 9, BRICK: 10, MOSSY: 11, LANTERN: 12, BEDROCK: 13, ROOF: 14, GRAVEL: 15, CRYPT: 16, WOOL: 17, SNOW: 18, ICE: 19, PINE: 20, BLACKSTONE: 21, BANNER: 22,
    SANDSTONE: 23, CARVED: 24, GOLD: 25, CACTUS: 26, PALM: 27, DUNE: 28, BRAZIER: 29 };
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
  // v5: The Sunscorched Expanse
  def(B.SANDSTONE, 'Sandstone', [25, 26, 25]);
  def(B.CARVED, 'Carved Sandstone', [25, 27, 25]);
  def(B.GOLD, 'Gilded Stone', [28, 28, 28]);
  def(B.CACTUS, 'Cactus', [29, 30, 29]);
  def(B.PALM, 'Palm Fronds', [31, 31, 31]);
  def(B.DUNE, 'Dune Sand', [32, 32, 32]);
  def(B.BRAZIER, 'Spirit Brazier', [33, 33, 33], { emissive: true });
  const BUILDABLE = [B.COBBLE, B.PLANKS, B.BRICK, B.STONE, B.DIRT, B.LOG, B.LEAVES, B.LANTERN, B.ICE];

  // ---------- Races ----------
  // stats: STR STA AGI DEX WIS INT CHA
  const RACES = {
    human:    { name: 'Human',     stats: [75, 75, 75, 75, 75, 75, 75], scale: 1.0,  skin: 0xe0b08a, hair: 0x5a3a1a, classes: ['warrior', 'cleric', 'paladin', 'ranger', 'rogue', 'necromancer', 'wizard', 'enchanter'], desc: 'Versatile and adaptable, humans may pursue almost any calling.' },
    barbarian:{ name: 'Barbarian', stats: [103, 95, 82, 70, 70, 60, 55], scale: 1.12, skin: 0xf0c8a0, hair: 0xd8b060, classes: ['warrior', 'rogue', 'shaman'], desc: 'Hardy northern folk. Strong and tough, but slow of wit. Their shamans commune with the spirits of the frozen north.' },
    woodelf:  { name: 'Wood Elf',  stats: [65, 65, 95, 80, 80, 75, 75], scale: 0.92, skin: 0xe8c49a, hair: 0x6a8a3a, classes: ['warrior', 'ranger', 'rogue'], desc: 'Agile forest dwellers from the treetop city of Kelethin. Natural rangers.' },
    darkelf:  { name: 'Dark Elf',  stats: [60, 65, 90, 75, 83, 99, 60], scale: 0.95, skin: 0x5a5a8a, hair: 0xeeeeee, classes: ['warrior', 'cleric', 'rogue', 'necromancer', 'wizard', 'enchanter'], desc: 'Cunning children of the underfoot. Sharp minds and ultravision.' },
    dwarf:    { name: 'Dwarf',     stats: [90, 90, 70, 90, 83, 60, 45], scale: 0.78, skin: 0xd8a080, hair: 0x8a3a1a, classes: ['warrior', 'cleric', 'paladin', 'rogue'], desc: 'Stout, stubborn mountain folk with a strong faith.' },
    gnome:    { name: 'Gnome',     stats: [60, 70, 85, 85, 67, 98, 60], scale: 0.68, skin: 0xe8b890, hair: 0xa0a0a0, classes: ['warrior', 'cleric', 'rogue', 'necromancer', 'wizard', 'enchanter'], desc: 'Tiny tinkerers with brilliant minds and a knack for the arcane.' },
    ogre:     { name: 'Ogre',      stats: [130, 122, 70, 70, 67, 60, 37], scale: 1.35, skin: 0x8a9a6a, hair: 0x2a2a1a, classes: ['warrior', 'shaman'], desc: 'Massive and immensely strong. Not known for their intellect.' },
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
    ranger:  { name: 'Ranger', bonus: [5, 0, 5, 5, 5, 0, 0], hpPer: 18, manaStat: 4, manaMult: 0.6, dmgMult: 1.08, color: 0x3a7a3a,
      startItems: ['rusty_short_sword', 'cloth_shirt'], desc: 'Woodland hybrid. Archery at range, snares and damage-over-time, and a little healing.' },
    paladin: { name: 'Paladin', bonus: [5, 5, 0, 0, 5, 0, 5], hpPer: 20, manaStat: 4, manaMult: 0.6, dmgMult: 1.08, color: 0xd8c070,
      startItems: ['rusty_short_sword', 'cloth_shirt'], desc: 'Holy knight. Heavy melee, Lay on Hands, stuns and minor healing.' },
    shaman:  { name: 'Shaman', bonus: [5, 5, 0, 0, 10, 0, 0], hpPer: 15, manaStat: 4, dmgMult: 0.95, color: 0x4a8a8a,
      startItems: ['rusty_mace', 'cloth_shirt'], desc: 'Spirit caller. Slows foes, heals, buffs, and rots enemies with disease.' },
    necromancer: { name: 'Necromancer', bonus: [0, 0, 0, 5, 0, 10, 0], hpPer: 10, manaStat: 5, dmgMult: 0.8, color: 0x3a1a4a,
      startItems: ['worn_staff', 'cloth_robe'], desc: 'Master of death. Raises undead pets, drains life and melts foes with DoTs.' },
    enchanter: { name: 'Enchanter', bonus: [0, 0, 0, 0, 0, 10, 5], hpPer: 10, manaStat: 5, dmgMult: 0.75, color: 0xa040c0,
      startItems: ['worn_staff', 'cloth_robe'], desc: 'Crowd controller. Mesmerizes enemies, stuns, and grants Clarity to the group.' },
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
    // v3 quest rewards & quest items
    warden_signet:     { name: 'Signet of the Everblock Warden', slot: 'ring', ac: 5, stats: { STR: 5, STA: 5, AGI: 5, DEX: 5, WIS: 5, INT: 5, CHA: 5 }, hp: 50, mana: 50, value: 10000, icon: '💍', rare: true },
    gunnar_boots:      { name: "Gunnar's Trapper Boots", slot: 'feet', ac: 6, stats: { AGI: 3, STA: 3 }, hp: 20, value: 1500, icon: '🥾' },
    blessed_bone_amulet:{ name: 'Blessed Bone Amulet', slot: 'neck', stats: { WIS: 2, INT: 2 }, hp: 10, mana: 10, value: 250, icon: '📿' },
    kerra_letter:      { name: "Kerra's Sealed Letter", value: 0, quest: true, icon: '✉' },
    hollis_map:        { name: "Hollis's Warcamp Map", value: 0, quest: true, icon: '🗺' },
    warden_shard:      { name: "Shard of the Warden's Signet", value: 0, quest: true, icon: '💠' },
    // ---- v5: The Sunscorched Expanse (levels 15-25) ----
    sand_scimitar:     { name: 'Sandreaver Scimitar', slot: 'primary', dmg: 17, delay: 2.5, verb: 'slash', stats: { STR: 4, DEX: 4 }, value: 2400, icon: '⚔' },
    steel_scimitar:    { name: 'Tempered Steel Scimitar', slot: 'primary', dmg: 14, delay: 2.5, verb: 'slash', stats: { STR: 2 }, value: 1800, icon: '⚔' },
    venom_stinger:     { name: 'Venomous Stinger', slot: 'primary', dmg: 14, delay: 1.9, verb: 'pierce', stats: { DEX: 5, AGI: 3 }, value: 2600, icon: '🗡' },
    dune_staff:        { name: 'Staff of Shifting Dunes', slot: 'primary', dmg: 11, delay: 3.0, verb: 'crush', stats: { INT: 6, WIS: 6 }, mana: 40, value: 2200, icon: '🦯' },
    dune_maul:         { name: 'Maul of the Dune Titan', slot: 'primary', dmg: 27, delay: 3.6, verb: 'crush', stats: { STR: 8, STA: 6 }, hp: 50, value: 9000, icon: '🔨', rare: true },
    sunforged_khopesh: { name: 'Sunforged Khopesh', slot: 'primary', dmg: 25, delay: 2.6, verb: 'slash', stats: { STR: 8, DEX: 6, AGI: 4 }, hp: 60, value: 16000, icon: '⚔', rare: true },
    pharaoh_crook:     { name: 'Crook of Ankhet-Ra', slot: 'primary', dmg: 18, delay: 3.2, verb: 'crush', stats: { INT: 10, WIS: 10, STA: 4 }, hp: 40, mana: 120, value: 16000, icon: '🦯', rare: true },
    scorpion_shield:   { name: 'Scorpion Chitin Shield', slot: 'secondary', ac: 12, stats: { STA: 3 }, value: 2000, icon: '🛡' },
    bandit_leathers:   { name: 'Sandreaver Leathers', slot: 'chest', ac: 15, stats: { AGI: 4, DEX: 3 }, value: 2400, icon: '🦺' },
    dune_robe:         { name: 'Robe of the Dunes', slot: 'chest', ac: 8, stats: { INT: 6, WIS: 6 }, mana: 60, value: 2600, icon: '👘' },
    linen_wraps:       { name: 'Burial Linen Wraps', slot: 'hands', ac: 7, stats: { STA: 3, WIS: 3 }, value: 1500, icon: '🧤' },
    mummy_mask:        { name: 'Gilded Funerary Mask', slot: 'head', ac: 11, stats: { INT: 5, WIS: 5, STA: 3 }, mana: 30, value: 5000, icon: '🎭', rare: true },
    vizier_sash:       { name: "Vizier's Silken Sash", slot: 'back', ac: 8, stats: { INT: 5, WIS: 5 }, mana: 45, value: 4200, icon: '🧣' },
    desert_cloak:      { name: 'Sunward Desert Cloak', slot: 'back', ac: 7, stats: { STA: 3, AGI: 3 }, hp: 20, value: 1600, icon: '🧥' },
    scarab_boots:      { name: 'Scarab-Shell Boots', slot: 'feet', ac: 10, stats: { AGI: 5, STA: 2 }, value: 3800, icon: '🥾' },
    sunward_bracer:    { name: 'Bracer of the Sunward Guard', slot: 'hands', ac: 9, stats: { STR: 3, STA: 3 }, hp: 25, value: 2500, icon: '🧤' },
    djinn_ring:        { name: 'Ring of the Bound Djinn', slot: 'ring', stats: { INT: 6, WIS: 6, AGI: 3 }, mana: 50, value: 6000, icon: '💍', rare: true },
    ankh_amulet:       { name: 'Ankh of Eternity', slot: 'neck', ac: 6, stats: { STA: 8, WIS: 6, INT: 6 }, hp: 80, mana: 60, value: 15000, icon: '☥', rare: true },
    sunward_signet:    { name: 'Signet of the Sunward Caravan', slot: 'ring', ac: 6, stats: { STR: 6, STA: 6, AGI: 6, DEX: 6, WIS: 6, INT: 6, CHA: 8 }, hp: 70, mana: 70, value: 18000, icon: '💍', rare: true },
    greymane_mantle:   { name: "Greymane's Mantle", slot: 'back', ac: 5, stats: { AGI: 3, STA: 2 }, value: 600, icon: '🧥', rare: true },
    whitefang_collar:  { name: "Whitefang's Collar", slot: 'neck', ac: 4, stats: { AGI: 4, STA: 4 }, hp: 20, value: 2500, icon: '📿', rare: true },
    rahzik_veil:       { name: "Rahzik's Viper Veil", slot: 'head', ac: 9, stats: { DEX: 5, AGI: 5 }, value: 5500, icon: '🎭', rare: true },
    scorpion_tail:     { name: 'Sand Scorpion Tail', value: 40, stack: true, icon: '🦂' },
    bandit_insignia:   { name: 'Sandreaver Insignia', value: 35, stack: true, icon: '🔻' },
    linen_scrap:       { name: 'Scrap of Burial Linen', value: 50, stack: true, icon: '🧻' },
    djinn_essence:     { name: 'Swirling Djinn Essence', value: 120, stack: true, icon: '🌪' },
    giant_tooth:       { name: 'Sand Giant Molar', value: 90, stack: true, icon: '🦷' },
    golden_scarab:     { name: 'Golden Scarab', value: 200, stack: true, icon: '🪲' },
    pharaoh_heart:     { name: 'Heart of Ankhet-Ra', value: 0, quest: true, icon: '❤' },
    superior_potion:   { name: 'Greater Healing Potion', value: 450, stack: true, use: { heal: 400 }, icon: '🧪' },
    waterskin:         { name: 'Waterskin of Oasis Water', value: 12, stack: true, use: { heal: 40 }, icon: '💧' },
    healing_potion:    { name: 'Minor Healing Potion', value: 30, stack: true, use: { heal: 45 }, icon: '🧪' },
    greater_potion:    { name: 'Healing Potion', value: 120, stack: true, use: { heal: 150 }, icon: '🧪' },
    bread:             { name: 'Loaf of Bread', value: 3, stack: true, use: { heal: 10 }, icon: '🍞' },
  };
  const EQUIP_SLOTS = ['head', 'neck', 'back', 'chest', 'hands', 'legs', 'feet', 'ring', 'primary', 'secondary'];

  // ---------- Spells / abilities ----------
  // kind: heal | nuke | buff | gate | root | skill
  const SPELLS = {
    bind_wound:   { name: 'Bind Wound', classes: { warrior: 1, cleric: 1, wizard: 1, rogue: 1, ranger: 1, paladin: 1, shaman: 1, necromancer: 1, enchanter: 1 }, ic: 'bandage', mana: 0, cast: 4, recast: 25, kind: 'heal', amt: [5, 8], perLvl: 2, skill: true, desc: 'Bandage your wounds. Slow but free.' },
    kick:         { name: 'Kick', classes: { warrior: 1, ranger: 1 }, ic: 'boot', mana: 0, cast: 0, recast: 6, kind: 'skill', dmg: [2, 5], perLvl: 1, verb: 'kick', desc: 'A quick kick. Instant.' },
    battle_fury:  { name: 'Battle Fury', classes: { warrior: 5 }, ic: 'fury', mana: 0, cast: 0, recast: 90, kind: 'buff', buff: { dmgPct: 25 }, dur: 30, self: true, skill: true, desc: '+25% melee damage for 30s.' },
    backstab:     { name: 'Backstab', classes: { rogue: 1 }, ic: 'dagger', mana: 0, cast: 0, recast: 8, kind: 'skill', backstab: true, verb: 'backstab', desc: 'Must be behind target. Massive piercing damage.' },
    evade:        { name: 'Evade', classes: { rogue: 3 }, ic: 'evade', mana: 0, cast: 0, recast: 30, kind: 'buff', buff: { dodge: 40 }, dur: 8, self: true, skill: true, desc: '+40% dodge for 8s.' },
    minor_healing:{ name: 'Minor Healing', classes: { cleric: 1, shaman: 1, paladin: 3 }, mana: 10, cast: 1.5, recast: 2, kind: 'heal', amt: [12, 18], perLvl: 1, desc: 'Heals a small amount. Target a group member to heal them.', friendly: true },
    strike:       { name: 'Strike', classes: { cleric: 1 }, mana: 12, cast: 1.5, recast: 4, kind: 'nuke', dmg: [6, 10], perLvl: 1, school: 'magic', desc: 'A divine strike against your foe.' },
    courage:      { name: 'Courage', classes: { cleric: 1, paladin: 1 }, mana: 15, cast: 2, recast: 3, kind: 'buff', buff: { ac: 4, hp: 10 }, dur: 900, friendly: true, desc: '+4 AC, +10 HP.' },
    light_healing:{ name: 'Light Healing', classes: { cleric: 4, shaman: 9, paladin: 9, ranger: 9 }, mana: 25, cast: 2, recast: 2, kind: 'heal', amt: [30, 45], perLvl: 2, desc: 'Heals a moderate amount.', friendly: true },
    holy_armor:   { name: 'Holy Armor', classes: { cleric: 6, paladin: 8 }, mana: 30, cast: 2.5, recast: 3, kind: 'buff', buff: { ac: 10 }, dur: 1200, friendly: true, desc: '+10 AC.' },
    furor:        { name: 'Furor', classes: { cleric: 8 }, mana: 35, cast: 2, recast: 6, kind: 'nuke', dmg: [28, 38], perLvl: 2, school: 'magic', desc: 'Holy wrath.' },
    word_of_health:{ name: 'Word of Health', classes: { cleric: 7 }, mana: 50, cast: 3, recast: 8, kind: 'groupheal', amt: [35, 50], perLvl: 2, desc: 'Heals you and your whole group.' },
    healing:      { name: 'Healing', classes: { cleric: 9 }, mana: 55, cast: 2.5, recast: 2, kind: 'heal', amt: [75, 95], perLvl: 3, desc: 'Heals a large amount.', friendly: true },
    blast_of_cold:{ name: 'Blast of Cold', classes: { wizard: 1 }, mana: 8, cast: 1.5, recast: 3, kind: 'nuke', dmg: [8, 12], perLvl: 1.5, school: 'cold', desc: 'A blast of frigid air.' },
    minor_shielding:{ name: 'Minor Shielding', classes: { wizard: 1, enchanter: 1, necromancer: 2 }, mana: 10, cast: 2, recast: 3, kind: 'buff', buff: { ac: 3, hp: 8 }, dur: 900, self: true, desc: '+3 AC, +8 HP.' },
    shock_of_fire:{ name: 'Shock of Fire', classes: { wizard: 4 }, mana: 20, cast: 2, recast: 5, kind: 'nuke', dmg: [20, 28], perLvl: 2, school: 'fire', desc: 'Scorches your foe.' },
    root:         { name: 'Root', classes: { wizard: 5 }, mana: 18, cast: 1.5, recast: 10, kind: 'root', dur: 18, desc: 'Roots the target in place.' },
    gate:         { name: 'Gate', classes: { wizard: 4, cleric: 5, necromancer: 4, enchanter: 5, shaman: 6 }, mana: 30, cast: 5, recast: 60, kind: 'gate', desc: 'Teleports you to your bind point.' },
    // ---- v3 classes ----
    archery:      { name: 'Archery', classes: { ranger: 1 }, mana: 0, cast: 0, recast: 4, kind: 'skill', archery: true, range: 32, dmg: [5, 9], perLvl: 1.6, verb: 'shoot', ic: 'arrow', desc: 'Fire an arrow at your target from range (LOS required).' },
    flame_lick:   { name: 'Flame Lick', classes: { ranger: 1 }, mana: 10, cast: 1.5, recast: 6, kind: 'dot', tick: [3, 4], perLvl: 0.6, dur: 18, school: 'fire', desc: 'Burns the target over 18 seconds.' },
    snare:        { name: 'Snare', classes: { ranger: 3, necromancer: 7 }, mana: 12, cast: 1.5, recast: 6, kind: 'snare', dur: 36, desc: 'Slows the target\'s movement by half.' },
    salve:        { name: 'Salve', classes: { ranger: 5 }, mana: 14, cast: 1.5, recast: 3, kind: 'heal', amt: [22, 32], perLvl: 1.5, friendly: true, ic: 'leaf', desc: 'A soothing woodland heal.' },
    skin_like_wood:{ name: 'Skin like Wood', classes: { ranger: 7, shaman: 7 }, mana: 22, cast: 2.5, recast: 3, kind: 'buff', buff: { ac: 8, hp: 18 }, dur: 1200, friendly: true, ic: 'bark', desc: '+8 AC, +18 HP.' },
    lay_hands:    { name: 'Lay on Hands', classes: { paladin: 1 }, mana: 0, cast: 0, recast: 300, kind: 'heal', amt: [60, 80], perLvl: 8, skill: true, friendly: true, ic: 'hand', desc: 'A massive instant heal on you or a group member. Long recast.' },
    bash:         { name: 'Bash', classes: { paladin: 1 }, mana: 0, cast: 0, recast: 7, kind: 'skill', dmg: [3, 6], perLvl: 1, verb: 'bash', ic: 'shieldbash', desc: 'Slam your target. Instant.' },
    yaulp:        { name: 'Yaulp', classes: { paladin: 4 }, mana: 12, cast: 0, recast: 45, kind: 'buff', buff: { dmgPct: 15 }, dur: 60, self: true, ic: 'fury', desc: '+15% melee damage for 60s. Instant.' },
    stun:         { name: 'Stun', classes: { paladin: 6, enchanter: 3 }, mana: 20, cast: 1, recast: 12, kind: 'stun', dur: 3.5, dmg: [4, 8], desc: 'Stuns the target for a few seconds, interrupting spells.' },
    sicken:       { name: 'Sicken', classes: { shaman: 1 }, mana: 10, cast: 1.5, recast: 6, kind: 'dot', tick: [2, 4], perLvl: 0.5, dur: 21, school: 'disease', desc: 'Disease eats at the target over 21 seconds.' },
    inner_fire:   { name: 'Inner Fire', classes: { shaman: 1 }, mana: 12, cast: 2, recast: 3, kind: 'buff', buff: { ac: 5, hp: 10 }, dur: 900, friendly: true, ic: 'shield', desc: '+5 AC, +10 HP.' },
    frost_rift:   { name: 'Frost Rift', classes: { shaman: 4 }, mana: 20, cast: 2, recast: 5, kind: 'nuke', dmg: [16, 22], perLvl: 1.5, school: 'cold', desc: 'Freezing spirit energy.' },
    spirit_of_wolf:{ name: 'Spirit of Wolf', classes: { shaman: 6, ranger: 8 }, mana: 25, cast: 3, recast: 3, kind: 'buff', buff: { speed: 0.35 }, dur: 900, friendly: true, ic: 'paw', desc: '+35% run speed.' },
    drowsy:       { name: 'Drowsy', classes: { shaman: 8 }, mana: 22, cast: 2, recast: 8, kind: 'slow', dur: 40, desc: 'Slows the target\'s attacks by 40%.' },
    lifetap:      { name: 'Lifetap', classes: { necromancer: 1 }, mana: 10, cast: 1.5, recast: 3, kind: 'nuke', lifetap: true, dmg: [6, 9], perLvl: 1, school: 'life', ic: 'heart', desc: 'Drains life from the target to heal yourself.' },
    disease_cloud:{ name: 'Disease Cloud', classes: { necromancer: 1 }, mana: 8, cast: 1.5, recast: 6, kind: 'dot', tick: [2, 3], perLvl: 0.5, dur: 18, school: 'disease', desc: 'A choking cloud of disease.' },
    cavorting_bones:{ name: 'Cavorting Bones', classes: { necromancer: 1 }, mana: 20, cast: 5, recast: 10, kind: 'pet', petLvl: 3, desc: 'Raise a skeletal servant (level 3) to fight for you.' },
    heat_blood:   { name: 'Heat Blood', classes: { necromancer: 4 }, mana: 20, cast: 2, recast: 6, kind: 'dot', tick: [5, 7], perLvl: 0.8, dur: 24, school: 'fire', desc: 'Boils the target\'s blood over 24 seconds.' },
    bone_walk:    { name: 'Bone Walk', classes: { necromancer: 6 }, mana: 45, cast: 6, recast: 10, kind: 'pet', petLvl: 8, desc: 'Raise a skeletal warrior (level 8).' },
    convoke_shadow:{ name: 'Convoke Shadow', classes: { necromancer: 10 }, mana: 80, cast: 7, recast: 10, kind: 'pet', petLvl: 13, desc: 'Raise a shadow knight (level 13).' },
    mesmerize:    { name: 'Mesmerize', classes: { enchanter: 1 }, mana: 15, cast: 2, recast: 4, kind: 'mez', dur: 24, maxLvl: 16, ic: 'eye', desc: 'Puts the target into a trance (up to level 16). Any damage wakes it.' },
    chaos_flux:   { name: 'Chaos Flux', classes: { enchanter: 2 }, mana: 14, cast: 1.5, recast: 4, kind: 'nuke', dmg: [10, 16], perLvl: 1.2, school: 'magic', desc: 'Raw chaotic energy.' },
    breeze:       { name: 'Breeze', classes: { enchanter: 4 }, mana: 25, cast: 3, recast: 3, kind: 'buff', buff: { manaRegen: 2 }, dur: 1200, friendly: true, ic: 'drop', desc: '+2 mana per tick.' },
    clarity:      { name: 'Clarity', classes: { enchanter: 8 }, mana: 45, cast: 4, recast: 3, kind: 'buff', buff: { manaRegen: 5 }, dur: 1500, friendly: true, ic: 'drop', desc: '+5 mana per tick.' },
    shock_of_lightning:{ name: 'Shock of Lightning', classes: { wizard: 8 }, mana: 38, cast: 2.5, recast: 6, kind: 'nuke', dmg: [40, 55], perLvl: 2.5, school: 'magic', desc: 'Calls down lightning.' },
    // ---- v5: levels 11-25 for every class ----
    taunt:        { name: 'Taunt', classes: { warrior: 11, paladin: 14 }, ic: 'fury', mana: 0, cast: 0, recast: 8, kind: 'skill', taunt: true, dmg: [1, 3], verb: 'taunt', desc: 'Forces your target to attack you (top of its hate list).' },
    slam:         { name: 'Slam', classes: { warrior: 14 }, ic: 'shieldbash', mana: 0, cast: 0, recast: 10, kind: 'skill', dmg: [20, 34], perLvl: 1.5, verb: 'slam', desc: 'A crushing shoulder slam. Instant.' },
    defensive:    { name: 'Defensive Stance', classes: { warrior: 18 }, ic: 'shield', mana: 0, cast: 0, recast: 120, kind: 'buff', buff: { ac: 60 }, dur: 20, self: true, skill: true, desc: '+60 AC for 20s.' },
    rampage:      { name: 'Rampage', classes: { warrior: 22 }, ic: 'sword', mana: 0, cast: 0, recast: 20, kind: 'skill', dmg: [48, 72], perLvl: 2.5, verb: 'rampage', desc: 'A furious flurry of blows. Instant.' },
    greater_healing:{ name: 'Greater Healing', classes: { cleric: 13, shaman: 19, paladin: 21 }, mana: 90, cast: 3, recast: 2, kind: 'heal', amt: [150, 190], perLvl: 4, friendly: true, desc: 'Heals a great amount.' },
    symbol_of_transal:{ name: 'Symbol of Transal', classes: { cleric: 15 }, mana: 70, cast: 3, recast: 3, kind: 'buff', buff: { hp: 80 }, dur: 1500, friendly: true, ic: 'cross3', desc: '+80 HP.' },
    wrath:        { name: 'Wrath', classes: { cleric: 17 }, mana: 70, cast: 2.5, recast: 7, kind: 'nuke', dmg: [90, 120], perLvl: 3, school: 'magic', desc: 'Righteous divine wrath.' },
    superior_healing:{ name: 'Superior Healing', classes: { cleric: 20 }, mana: 140, cast: 3.5, recast: 2, kind: 'heal', amt: [270, 330], perLvl: 5, friendly: true, desc: 'Heals a massive amount.' },
    word_of_vigor:{ name: 'Word of Vigor', classes: { cleric: 22 }, mana: 160, cast: 4, recast: 10, kind: 'groupheal', amt: [130, 170], perLvl: 4, desc: 'Heals your whole group a large amount.' },
    armor_of_faith:{ name: 'Armor of Faith', classes: { cleric: 24, paladin: 25 }, mana: 120, cast: 4, recast: 3, kind: 'buff', buff: { ac: 25, hp: 60 }, dur: 1800, friendly: true, desc: '+25 AC, +60 HP.' },
    lightning_bolt:{ name: 'Lightning Bolt', classes: { wizard: 12 }, mana: 60, cast: 2.5, recast: 6, kind: 'nuke', dmg: [70, 92], perLvl: 3, school: 'magic', desc: 'A crackling bolt of lightning.' },
    shielding:    { name: 'Shielding', classes: { wizard: 14, enchanter: 14, necromancer: 15 }, mana: 45, cast: 3, recast: 3, kind: 'buff', buff: { ac: 10, hp: 45 }, dur: 1500, self: true, desc: '+10 AC, +45 HP.' },
    fire_bolt:    { name: 'Fire Bolt', classes: { wizard: 16 }, mana: 80, cast: 3, recast: 7, kind: 'nuke', dmg: [100, 125], perLvl: 3.5, school: 'fire', desc: 'Hurls a bolt of fire.' },
    ice_comet:    { name: 'Ice Comet', classes: { wizard: 20 }, mana: 120, cast: 3.5, recast: 8, kind: 'nuke', dmg: [155, 195], perLvl: 4, school: 'cold', desc: 'Drops a comet of ice on your foe.' },
    sunstrike:    { name: 'Sunstrike', classes: { wizard: 24 }, mana: 170, cast: 4, recast: 10, kind: 'nuke', dmg: [230, 280], perLvl: 5, school: 'fire', desc: 'Calls down the fury of the sun.' },
    kidney_shot:  { name: 'Kidney Shot', classes: { rogue: 12 }, ic: 'star', mana: 0, cast: 0, recast: 20, kind: 'stun', dur: 2.5, dmg: [10, 20], skill: true, desc: 'A crippling blow that stuns the target. Instant.' },
    poison_blade: { name: 'Envenom Blades', classes: { rogue: 16 }, ic: 'dagger', mana: 0, cast: 0, recast: 90, kind: 'buff', buff: { dmgPct: 22 }, dur: 60, self: true, skill: true, desc: '+22% melee damage for 60s.' },
    eviscerate:   { name: 'Eviscerate', classes: { rogue: 19 }, ic: 'dagger', mana: 0, cast: 0, recast: 12, kind: 'skill', dmg: [55, 85], perLvl: 2.5, verb: 'eviscerate', desc: 'A savage finishing strike. Instant.' },
    assassinate:  { name: 'Assassinate', classes: { rogue: 23 }, ic: 'dagger', mana: 0, cast: 0, recast: 30, kind: 'skill', dmg: [110, 160], perLvl: 4, verb: 'assassinate', desc: 'A lethal strike to a vital spot. Instant.' },
    barbed_arrow: { name: 'Barbed Arrow', classes: { ranger: 12 }, mana: 0, cast: 0, recast: 8, kind: 'skill', archery: true, range: 34, dmg: [24, 36], perLvl: 2, verb: 'shoot', ic: 'arrow', desc: 'A barbed arrow for heavy ranged damage (LOS required).' },
    firefist:     { name: 'Firefist', classes: { ranger: 14 }, mana: 30, cast: 2, recast: 3, kind: 'buff', buff: { dmgPct: 12 }, dur: 600, self: true, ic: 'fury', desc: '+12% melee damage.' },
    ensnare:      { name: 'Ensnare', classes: { ranger: 16 }, mana: 30, cast: 1.5, recast: 6, kind: 'snare', dur: 60, desc: 'A long-lasting snare.' },
    greater_salve:{ name: 'Greater Salve', classes: { ranger: 18 }, mana: 45, cast: 2, recast: 3, kind: 'heal', amt: [90, 120], perLvl: 3, friendly: true, ic: 'leaf', desc: 'A potent woodland heal.' },
    call_of_fire: { name: 'Call of Fire', classes: { ranger: 21 }, mana: 60, cast: 2, recast: 8, kind: 'dot', tick: [20, 26], perLvl: 1.2, dur: 24, school: 'fire', desc: 'Engulfs the target in flame over 24 seconds.' },
    eagle_eye:    { name: 'Eagle Eye Shot', classes: { ranger: 24 }, mana: 0, cast: 0, recast: 14, kind: 'skill', archery: true, range: 40, dmg: [60, 88], perLvl: 3, verb: 'shoot', ic: 'arrow', desc: 'A perfectly aimed long shot.' },
    holy_might:   { name: 'Holy Might', classes: { paladin: 12 }, mana: 40, cast: 1, recast: 12, kind: 'stun', dur: 3, dmg: [30, 45], desc: 'Smites and stuns the target.' },
    ward_undead:  { name: 'Ward Undead', classes: { paladin: 16, cleric: 12 }, mana: 50, cast: 2.5, recast: 6, kind: 'nuke', dmg: [55, 75], perLvl: 2.5, school: 'magic', undead: 2, desc: 'Holy fire. Double damage against the undead.' },
    celestial_healing:{ name: 'Celestial Healing', classes: { paladin: 18 }, mana: 70, cast: 2.5, recast: 3, kind: 'heal', amt: [110, 140], perLvl: 3, friendly: true, desc: 'A strong paladin heal.' },
    divine_aura:  { name: 'Divine Aura', classes: { paladin: 20 }, ic: 'shield', mana: 50, cast: 0, recast: 180, kind: 'buff', buff: { ac: 120 }, dur: 12, self: true, desc: 'Near-invulnerable holy shell (+120 AC) for 12s. Instant.' },
    winters_roar: { name: "Winter's Roar", classes: { shaman: 12 }, mana: 55, cast: 2.5, recast: 6, kind: 'nuke', dmg: [62, 82], perLvl: 2.5, school: 'cold', desc: 'A howling blast of spirit frost.' },
    quickness:    { name: 'Quickness', classes: { shaman: 14, enchanter: 16 }, mana: 45, cast: 3, recast: 3, kind: 'buff', buff: { dmgPct: 15 }, dur: 900, friendly: true, ic: 'paw', desc: '+15% melee damage (attack speed).' },
    envenomed_breath:{ name: 'Envenomed Breath', classes: { shaman: 16, necromancer: 13 }, mana: 45, cast: 2, recast: 6, kind: 'dot', tick: [14, 18], perLvl: 0.9, dur: 24, school: 'disease', desc: 'Venom eats at the target over 24 seconds.' },
    tagars_insects:{ name: "Tagar's Insects", classes: { shaman: 18 }, mana: 50, cast: 2.5, recast: 8, kind: 'slow', dur: 70, desc: 'A swarm slows the target\'s attacks for 70s.' },
    spirit_of_ox: { name: 'Spirit of the Ox', classes: { shaman: 20 }, mana: 70, cast: 3, recast: 3, kind: 'buff', buff: { hp: 70, ac: 6 }, dur: 1500, friendly: true, ic: 'bark', desc: '+70 HP, +6 AC.' },
    vampiric_embrace:{ name: 'Vampiric Embrace', classes: { necromancer: 12 }, mana: 50, cast: 2.5, recast: 4, kind: 'nuke', lifetap: true, dmg: [45, 60], perLvl: 2, school: 'life', ic: 'heart', desc: 'Drains a large amount of life.' },
    boil_blood:   { name: 'Boil Blood', classes: { necromancer: 16 }, mana: 60, cast: 2.5, recast: 6, kind: 'dot', tick: [18, 23], perLvl: 1, dur: 30, school: 'fire', desc: 'Boils the target\'s blood over 30 seconds.' },
    invoke_death: { name: 'Invoke Death', classes: { necromancer: 17 }, mana: 130, cast: 8, recast: 10, kind: 'pet', petLvl: 18, desc: 'Raise a bone knight (level 18).' },
    servant_of_bones:{ name: 'Servant of Bones', classes: { necromancer: 22 }, mana: 180, cast: 9, recast: 10, kind: 'pet', petLvl: 23, desc: 'Raise a sand-wrapped revenant (level 23).' },
    drain_soul:   { name: 'Drain Soul', classes: { necromancer: 24 }, mana: 140, cast: 3, recast: 8, kind: 'nuke', lifetap: true, dmg: [125, 155], perLvl: 3, school: 'life', ic: 'heart', desc: 'Rips the soul from your foe to heal yourself.' },
    enthrall:     { name: 'Enthrall', classes: { enchanter: 12 }, mana: 40, cast: 2, recast: 4, kind: 'mez', dur: 30, maxLvl: 23, ic: 'eye', desc: 'Mesmerizes the target (up to level 23).' },
    color_shift:  { name: 'Color Shift', classes: { enchanter: 15 }, mana: 45, cast: 1.5, recast: 12, kind: 'stun', dur: 4.5, dmg: [15, 25], desc: 'A dazzling flash that stuns the target.' },
    chaotic_feedback:{ name: 'Chaotic Feedback', classes: { enchanter: 18 }, mana: 70, cast: 2.5, recast: 6, kind: 'nuke', dmg: [75, 95], perLvl: 3, school: 'magic', desc: 'Mind-shattering feedback.' },
    clarity_ii:   { name: 'Clarity II', classes: { enchanter: 20 }, mana: 90, cast: 4, recast: 3, kind: 'buff', buff: { manaRegen: 9 }, dur: 1800, friendly: true, ic: 'drop', desc: '+9 mana per tick.' },
    scourge:      { name: 'Scourge', classes: { shaman: 23 }, mana: 80, cast: 2.5, recast: 6, kind: 'dot', tick: [28, 34], perLvl: 1.2, dur: 30, school: 'disease', desc: 'A virulent plague rots the target over 30 seconds.' },
    dazzle:       { name: 'Dazzle', classes: { enchanter: 24 }, mana: 70, cast: 2, recast: 5, kind: 'mez', dur: 40, maxLvl: 27, ic: 'eye', desc: 'A powerful mesmerize (up to level 27).' },
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
      loot: [['warden_shard', 1.0], ['tusk_necklace', 0.6], ['fang_warblade', 0.5], ['orc_chain', 0.4]] },
    vorgath: { name: 'Vorgath the Frostbound', lvl: [15, 15], model: 'biped', color: 0x5a8ac8, scale: 2.3, weapon: true, glow: 0x80ffff, aggro: 16, aggressive: true, faction: 'giant', social: true, verb: 'crush', delay: 3.2, speed: 3.4, named: true, hpMult: 3.0, dmgMult: 1.3,
      caster: { name: 'Glacial Breath', dmg: [30, 50], cast: 3, cd: 16, range: 22 }, loot: [['frost_greatsword', 0.5], ['frozen_heart', 0.5], ['giant_helm', 0.5]] },
    // ---- v5: rare named placeholders (a PH spawn is sometimes replaced by these) ----
    greymane: { name: 'Greymane the Elder', lvl: [7, 7], model: 'quad', lookAs: 'wolf', color: 0x5a5a62, scale: 0.95, aggro: 16, aggressive: true, faction: 'wolf', social: true, verb: 'bite', delay: 1.9, speed: 4.6, named: true, hpMult: 1.6, dmgMult: 1.15,
      loot: [['greymane_mantle', 0.7], ['wolf_pelt', 1.0]] },
    whitefang: { name: 'Whitefang', lvl: [12, 12], model: 'quad', lookAs: 'frost_wolf', color: 0xf4f8ff, scale: 1.05, aggro: 17, aggressive: true, faction: 'frostwolf', social: true, verb: 'bite', delay: 1.9, speed: 4.8, named: true, hpMult: 1.7, dmgMult: 1.2, glow: 0x80e0ff,
      loot: [['whitefang_collar', 0.7], ['snow_boots', 0.3], ['frost_wolf_pelt', 1.0]] },
    // ---- The Sunscorched Expanse (zone 3, levels 15-25) ----
    sand_scorpion: { name: 'a sand scorpion', lvl: [15, 17], model: 'quad', color: 0xc8963c, scale: 1.35, aggro: 12, aggressive: true, faction: 'scorpion', social: false, verb: 'sting', delay: 2.2, speed: 3.9,
      loot: [['scorpion_tail', 0.7], ['venom_stinger', 0.04], ['scorpion_shield', 0.04]] },
    szyrix: { name: 'Szyrix the Venomqueen', lvl: [20, 20], model: 'quad', color: 0x7a2a1a, scale: 2.0, aggro: 16, aggressive: true, faction: 'scorpion', social: false, verb: 'sting', delay: 2.0, speed: 4.0, named: true, hpMult: 1.9, dmgMult: 1.2, glow: 0x90ff40,
      loot: [['venom_stinger', 0.6], ['scorpion_shield', 0.5], ['scarab_boots', 0.35], ['scorpion_tail', 1.0]] },
    bandit: { name: 'a Sandreaver bandit', lvl: [16, 18], model: 'biped', color: 0xb89a6a, scale: 1.0, weapon: true, aggro: 13, aggressive: true, faction: 'bandit', social: true, verb: 'slash', delay: 2.3, speed: 4.0, flee: true,
      loot: [['bandit_insignia', 0.7], ['bandit_leathers', 0.05], ['sand_scimitar', 0.04], ['waterskin', 0.2]] },
    bandit_mystic: { name: 'a Sandreaver mystic', lvl: [17, 19], model: 'biped', color: 0x6a3a7a, scale: 1.0, glow: 0xffb040, aggro: 13, aggressive: true, faction: 'bandit', social: true, verb: 'hit', delay: 2.6, speed: 3.6, flee: true,
      caster: { name: 'Scorching Sands', dmg: [38, 58], cast: 2.5, cd: 12, range: 24 },
      heals: { name: 'Desert Mending', amt: [90, 130], cast: 2, cd: 8, range: 22 }, buffs: { name: 'Sandskin', ward: 0.25, dur: 45, cast: 2, cd: 18, range: 18, color: 0xffc060 },
      loot: [['bandit_insignia', 0.7], ['dune_robe', 0.05], ['dune_staff', 0.04]] },
    rahzik: { name: 'Rahzik the Sand Viper', lvl: [21, 21], model: 'biped', color: 0x2e2238, scale: 1.1, weapon: true, glow: 0xff4040, aggro: 16, aggressive: true, faction: 'bandit', social: true, verb: 'slash', delay: 2.0, speed: 4.2, named: true, hpMult: 2.0, dmgMult: 1.25,
      loot: [['rahzik_veil', 0.6], ['sand_scimitar', 0.6], ['bandit_leathers', 0.4], ['bandit_insignia', 1.0]] },
    mummy: { name: 'a wrapped mummy', lvl: [19, 21], model: 'biped', color: 0xd8ccaa, scale: 1.05, aggro: 12, aggressive: true, faction: 'undead', social: true, verb: 'hit', delay: 2.6, speed: 2.9, hpMult: 1.2,
      factionHits: [['sunward', 2]], loot: [['linen_scrap', 0.7], ['linen_wraps', 0.06], ['golden_scarab', 0.15]] },
    tomb_priest: { name: 'a tomb priest', lvl: [20, 22], model: 'biped', color: 0x2e5a66, scale: 1.0, glow: 0x60ffd0, aggro: 13, aggressive: true, faction: 'undead', social: true, verb: 'hit', delay: 2.7, speed: 3.2,
      caster: { name: 'Curse of Ages', dmg: [48, 72], cast: 2.8, cd: 13, range: 24 },
      heals: { name: 'Embalming Rite', amt: [130, 180], cast: 2.2, cd: 9, range: 22 }, buffs: { name: 'Unholy Zeal', haste: 0.3, dur: 45, cast: 2, cd: 20, range: 18, color: 0x60ffd0 },
      factionHits: [['sunward', 3]], loot: [['linen_scrap', 0.6], ['vizier_sash', 0.04], ['golden_scarab', 0.25]] },
    sethek: { name: 'Grand Vizier Sethek', lvl: [23, 23], model: 'biped', color: 0x1e3a4a, scale: 1.2, glow: 0x60ffd0, aggro: 15, aggressive: true, faction: 'undead', social: true, verb: 'hit', delay: 2.4, speed: 3.4, named: true, hpMult: 2.2, dmgMult: 1.2,
      caster: { name: 'Withering Hex', dmg: [60, 90], cast: 2.6, cd: 11, range: 26 },
      heals: { name: 'Rite of Preservation', amt: [220, 300], cast: 2.5, cd: 12, range: 24 }, buffs: { name: 'Unholy Zeal', haste: 0.3, dur: 45, cast: 2, cd: 20, range: 20, color: 0x60ffd0 },
      factionHits: [['sunward', 15]], loot: [['vizier_sash', 0.6], ['mummy_mask', 0.5], ['golden_scarab', 1.0]] },
    sand_giant: { name: 'a sand giant', lvl: [21, 23], model: 'biped', color: 0xb8875a, scale: 2.1, aggro: 14, aggressive: true, faction: 'sandgiant', social: true, verb: 'crush', delay: 3.0, speed: 3.5, hpMult: 1.4,
      loot: [['giant_tooth', 0.8], ['superior_potion', 0.15], ['scarab_boots', 0.03]] },
    gorukh: { name: 'Gorukh the Dune Titan', lvl: [24, 24], model: 'biped', color: 0x9a6a42, scale: 2.5, aggro: 16, aggressive: true, faction: 'sandgiant', social: true, verb: 'crush', delay: 3.2, speed: 3.5, named: true, hpMult: 2.6, dmgMult: 1.3, glow: 0xffa040,
      loot: [['dune_maul', 0.6], ['giant_tooth', 1.0], ['superior_potion', 1.0]] },
    dust_djinn: { name: 'a dust djinn', lvl: [20, 22], model: 'biped', color: 0x5e98c4, scale: 1.15, glow: 0x80e0ff, aggro: 14, aggressive: true, faction: 'djinn', social: true, verb: 'hit', delay: 2.2, speed: 4.3,
      caster: { name: 'Sandstorm', dmg: [44, 68], cast: 2.2, cd: 10, range: 26 }, loot: [['djinn_essence', 0.6], ['djinn_ring', 0.03]] },
    ankhetra: { name: 'Pharaoh Ankhet-Ra the Eternal', lvl: [25, 25], model: 'biped', color: 0xd8c898, scale: 1.75, weapon: true, glow: 0xffd040, aggro: 18, aggressive: true, faction: 'undead', social: true, verb: 'crush', delay: 2.6, speed: 3.5, named: true, hpMult: 3.6, dmgMult: 1.35,
      caster: { name: 'Sunfire Curse', dmg: [70, 110], cast: 3, cd: 14, range: 26 }, heals: { name: 'Eternal Renewal', amt: [500, 700], cast: 3, cd: 30, range: 0, self: true },
      factionHits: [['sunward', 40]], loot: [['pharaoh_heart', 1.0], ['sunforged_khopesh', 0.5], ['pharaoh_crook', 0.5], ['ankh_amulet', 0.5], ['golden_scarab', 1.0]] },
  };
  // v5: EQ-style faction standing. Kills adjust standing; standing drives con messages, aggression and merchant prices.
  const FACTIONS = {
    guards:  { name: 'Guards of Everblock', start: 100 },
    hollis:  { name: 'Hollis Rangers', start: 100 },
    sunward: { name: 'Sunward Caravan', start: 0 },
    gnoll:   { name: 'Darkpaw Gnolls', start: -800 },
    orc:     { name: 'Frostfang Orcs', start: -800 },
    bandit:  { name: 'Sandreaver Bandits', start: -800 },
  };
  // faction hits applied when a mob of the given (social) faction dies; per-mob factionHits add to these
  const KILL_FACTION = {
    gnoll: [['gnoll', -12], ['guards', 8]],
    orc: [['orc', -12], ['hollis', 8], ['guards', 3]],
    giant: [['hollis', 4]],
    undead: [['guards', 1]],
    bandit: [['bandit', -14], ['sunward', 10]],
  };
  // EQ standing tiers (min value -> label, con verb)
  const STANDINGS = [
    [1100, 'Ally', 'regards you as an ally'], [750, 'Warmly', 'looks upon you warmly'], [500, 'Kindly', 'kindly considers you'],
    [100, 'Amiable', 'judges you amiably'], [-99, 'Indifferent', 'regards you indifferently'], [-500, 'Apprehensive', 'looks your way apprehensively'],
    [-750, 'Dubious', 'glowers at you dubiously'], [-1100, 'Threateningly', 'glares at you threateningly'], [-1e9, 'Scowls', 'scowls at you, ready to attack'],
  ];
  function standingOf(v) { for (const s of STANDINGS) if (v >= s[0]) return { label: s[1], con: s[2], min: s[0] }; return { label: 'Scowls', con: STANDINGS[8][2] }; }
  // merchant price multiplier by standing (null = refuses to trade)
  function factionPriceMult(v) { return v >= 1100 ? 0.88 : v >= 750 ? 0.92 : v >= 500 ? 0.95 : v >= 100 ? 0.98 : v >= -99 ? 1 : v >= -500 ? 1.12 : v >= -750 ? 1.3 : null; }

  // Mercenaries (hired at the Mercenary Liaison in Everblock Keep)
  const MERCS = {
    healer: { name: 'Sister Maelin', cls: 'cleric', color: 0xeaeaff, skin: 0xe8c0a0, hair: 0xc89040, desc: 'A devoted cleric. Heals the group and buffs Courage.' },
    tank:   { name: 'Borin Stoutshield', cls: 'warrior', color: 0x8a8a9a, skin: 0xd8a080, hair: 0x8a3a1a, scale: 0.85, desc: 'A dwarven warrior. Taunts foes off you and holds aggro.' },
  };
  // Necromancer pets (summoned by spell; share the merc group logic)
  const PETS = {
    3: { name: 'Gabober', desc: 'A cavorting skeleton.', color: 0xe8e2c8 },
    8: { name: 'Jobekab', desc: 'A skeletal warrior.', color: 0xd0c8b0 },
    13: { name: 'Xabanek', desc: 'A shadow knight.', color: 0x3a3a4a },
    18: { name: 'Kobaron', desc: 'A bone knight.', color: 0xd8d0b8 },
    23: { name: 'Sabekhet', desc: 'A sand-wrapped revenant.', color: 0xc8b890 },
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

  // New v3 single-step quests
  Object.assign(QUESTS, {
    restless_dead: { name: 'Bones of the Restless', giver: 'Guard Mossen', item: 'bone_chips', count: 6, coins: 150, reward: 'blessed_bone_amulet', rewardCount: 1, xp: 350,
      offer: 'The skeletons in the Forsaken Graveyard to the south keep clawing their way back up. Bring me 6 Bone Chips and the temple will bless an amulet for you.',
      done: 'Six more that will not rise again. Soulbinder Kerra blessed this amulet. Wear it well.' },
    yeti_hunt: { name: 'Yeti Hunt', giver: 'Trapper Gunnar', item: 'yeti_fang', count: 3, coins: 2000, reward: 'gunnar_boots', rewardCount: 1, xp: 5000,
      offer: "The mountain yetis east of here have been raiding my traplines. Bring me 3 Yeti Fangs and I'll give you my spare trapper boots. Best boots in the Highlands.",
      done: 'Hah! Three fangs. Those boots are yours. Keep your toes warm, friend.' },
  });
  // Multi-step quest chain spanning both zones
  QUESTS.warden_legacy = { name: "The Warden's Legacy", chain: true, coins: 5000, reward: 'warden_signet', rewardCount: 1, xp: 14000, title: 'Warden of Everblock',
    steps: [
      { giver: 'Soulbinder Kerra', items: [['ghoul_ichor', 2]], give: 'kerra_letter', zone: 'Everblock',
        offer: 'Long ago the Wardens of Everblock held the Frostfang orcs beyond the North Pass. The last Warden fell, and his signet was lost. The dead of the Sunken Crypt stir with the same dark power. Bring me 2 vials of Crypt Ghoul Ichor and I will know the truth of it.',
        done: 'Just as I feared: the ichor reeks of Frostfang sorcery. Take this sealed letter north through the pass to Scout Hollis. She served the last Warden.',
        hint: 'Bring 2 Crypt Ghoul Ichor to Soulbinder Kerra (Everblock temple)' },
      { giver: 'Scout Hollis', items: [['kerra_letter', 1]], zone: 'Frostfang',
        offer: 'You have something for me? Kerra has not written in years...',
        done: "Kerra's seal... So the old stories are true. Warlord Grimtusk wears a shard of the Warden's Signet on his belt. Before I send you into that warcamp, prove you can survive the Highlands.",
        hint: "Deliver Kerra's Sealed Letter to Scout Hollis (Frostfang Highlands outpost)" },
      { giver: 'Scout Hollis', items: [['frost_wolf_pelt', 4]], give: 'hollis_map', zone: 'Frostfang',
        offer: 'Bring me 4 Frost Wolf Pelts. If you can hunt frost wolves, you might survive the orcs.',
        done: 'Good pelts. Here, my map of the warcamp. Grimtusk keeps to the war banner in the center. Kill him, take the shard, and bring it and my map to Guildmaster Aldric in Everblock. He will know how to restore it.',
        hint: 'Bring 4 Frost Wolf Pelts to Scout Hollis' },
      { giver: 'Guildmaster Aldric', items: [['warden_shard', 1], ['hollis_map', 1]], zone: 'Everblock',
        offer: 'Hollis sent you? Then you seek the Warden\'s Signet. Bring me the shard from Warlord Grimtusk and her map.',
        done: 'The shard... and it still hums with the Warden\'s oath. I have reforged the signet. Wear it, Warden of Everblock. The Keep is in your debt.',
        hint: "Slay Warlord Grimtusk (Frostfang Warcamp) and bring the Signet Shard and Hollis's Map to Guildmaster Aldric (Everblock)" },
    ] };

  // v5: Sunward Outpost quests (The Sunscorched Expanse)
  Object.assign(QUESTS, {
    scorpion_tails: { name: 'Stingers in the Sand', giver: 'Caravan Master Idris', item: 'scorpion_tail', count: 4, coins: 4000, reward: 'desert_cloak', rewardCount: 1, xp: 12000, faction: [['sunward', 60]],
      offer: 'The sand scorpions of the flats have been stinging my camels half to death. Bring me 4 Sand Scorpion Tails and I will give you a proper desert cloak.',
      done: 'Four tails! My camels thank you, friend. Wear this cloak, the sun is merciless out there.' },
    bandit_insignias: { name: 'The Sandreaver Threat', giver: 'Captain Asha', item: 'bandit_insignia', count: 4, coins: 5000, reward: 'sunward_bracer', rewardCount: 1, xp: 15000, faction: [['sunward', 80], ['bandit', -60]],
      offer: 'The Sandreaver bandits in the eastern hideout raid every caravan that leaves this outpost. Bring me 4 of their insignias and you will wear the bracer of the Sunward Guard.',
      done: 'Four fewer cutthroats. You fight like one of us. Wear this bracer with pride.' },
    eternal_pharaoh: { name: 'The Eternal Pharaoh', giver: 'Loremaster Kheti', item: 'pharaoh_heart', count: 1, coins: 20000, reward: 'sunward_signet', rewardCount: 1, xp: 60000, title: 'Tombbreaker', faction: [['sunward', 200]],
      offer: 'Beneath the Great Pyramid to the north lies the Tomb of Ankhet-Ra. The Pharaoh refuses to stay dead; his priests keep him bound to this world. Descend, destroy him, and bring me his heart so that I may burn it.',
      done: 'The heart of Ankhet-Ra... at last, it can be burned. The whole caravan is in your debt, Tombbreaker. Take this signet.' },
  });

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
  const MAX_LEVEL = 25;
  // merchant inventories (stock key on the NPC)
  const STOCKS = {
    general: ['healing_potion', 'greater_potion', 'bread', 'cloth_cap', 'cloth_pants', 'rawhide_gloves', 'leather_boots', 'leather_tunic', 'wooden_shield', 'bronze_long_sword', 'fine_steel_dagger', 'oak_staff'],
    desert: ['superior_potion', 'greater_potion', 'waterskin', 'bread', 'steel_scimitar', 'dune_staff', 'desert_cloak', 'scorpion_shield'],
    fence: ['superior_potion', 'waterskin', 'sand_scimitar', 'venom_stinger', 'bandit_leathers', 'dune_robe'],
  };

  // ---------- formulas (shared by the browser game and the multiplayer server) ----------
  EB.calc = {
    maxHp(cls, L, STA) { return 20 + L * CLASSES[cls].hpPer + Math.floor(STA * L / 12); },
    maxMana(cls, L, stats) { const C = CLASSES[cls], ms = C.manaStat; if (ms == null) return 0; return Math.floor((15 + L * 5 + Math.floor(stats[ms] * L / 6)) * (C.manaMult || 1)); },
    xpForKill(mobL) { return mobL * mobL * 9 + mobL * 6 + 5; },
    fizzle(L, stat) { return EB.util.clamp(20 - L * 1.5 - (stat - 75) / 8, 2, 25); },
  };

  EB.data = { PETS, MERCS, mercCost, QUESTS, B, BLOCKS, BUILDABLE, RACES, STAT_NAMES, CLASSES, ITEMS, EQUIP_SLOTS, SPELLS, MOBS, conColor, CON_HEX, CON_XP, CON_MSG, xpToNext, MAX_LEVEL,
    FACTIONS, KILL_FACTION, STANDINGS, standingOf, factionPriceMult, STOCKS };
})();
