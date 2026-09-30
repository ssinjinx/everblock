# Everblock

![Everblock v4: every playable race in class gear, built from detailed rigged voxel models](screenshots/v4-races-lineup.png)

**[▶ Play in your browser](https://ssinjinx.github.io/everblock/)**

A blocky voxel world (Minecraft-style) that plays like **EverQuest Classic (1999)**. You roll a character (race, class, stat points), bind at Everblock Keep, hunt rats and gnolls outside the walls, then work your way through the Sunken Crypt and on to the Frostfang Highlands. There are con colors, auto attack, spell gems and a spellbook, med/sit regen, corpse runs, named mobs and camps. You can also break and place blocks anywhere.

Everything is generated in code: terrain, textures, models, spell icons, sound and music. There are no external assets. The whole game is one self-contained `index.html` (Three.js r149 inlined) that works offline from `file://`. Progress saves to localStorage.

## New in v4: character & monster graphics
- **Detailed voxel models, rigged**: the player, mercenaries, NPCs and all 18 monster types are rebuilt from 50-90 small shaded boxes each (previously about 12) on hierarchical rigs: hips, torso, head, upper and lower arms, hands, thighs, shins, plus tails, jaws and snouts. Each race has its own proportions and features. Dwarves are short and stocky with big heads, long beards and big noses. Ogres are huge and hunched, with tusks, a heavy brow and a topknot. Elves are slim with pointy ears and long hair (Dark Elves have red eyes). Gnomes have oversized heads and tufts of hair. Barbarians are broad, with braids, a beard and warpaint. Faces have eyes with pupils and catch-lights, brows, a nose and a mouth.
- **Monsters look like themselves**: rats with whiskers and pink tails, slithering striped snakes, six-legged fire beetles with glowing glands, bushy-tailed wolves (frost wolves have glowing eyes), skeletons with ribs and vertebrae, hyena-headed gnolls, hunched ghouls with claws and exposed ribs, tusked orcs with warpaint and spiked pauldrons, feathered orc shamans with totems, yetis, bearded frost giants, and the bosses (Grimbone's crown and soulblade, Grimtusk's horned helm and greatsword, Vorgath's ice greatsword). Necro pets progress from a plain skeleton to a sword-and-board skeleton to a horned shadow knight.
- **Visible gear**: separate weapon models for sword, longsword, greatsword, dagger, mace, club, axe, staff, totem, bow and spear, with rusty, bronze, steel, bone, ice and glowing metals. Shields (wood, bone, crest) and helms (cap, bone, giant, horned, crested) are modeled too. Cloaks sway as you run. Chest armor shows its tier: cloth, leather, chain with pauldrons, plate with knee pads, or a robe. Gloves, boots, bracers, necklaces and collars are also visible. The model rebuilds as soon as you or your mercs change gear. Rangers carry a bow on their back and draw it for Archery.
- **Animations**:
  - Everyone: idle breathing and looking around, a walk/run cycle with knees and elbows, a sit pose, a cast pose with glowing hand particles, hit flinches, and a death collapse.
  - Attacks depend on the weapon: slash (alternating fore- and back-hand), two-handed cleave, overhead crush, staff thrust, dagger stab, bow draw, kick, shield bash, claw and punch.
  - Monsters move in their own way: rats scurry and sniff, snakes slither in a travelling wave and strike, skeletons walk with a jerky stepped gait, ghouls shamble arms-first, beetles walk on alternating tripods, and wolves trot, pant and wag.
- **Materials & effects**:
  - Models get baked face shading and height-based ambient occlusion, a subtle pixel-grain texture and a rim light that strengthens at night. Characters have soft blob shadows.
  - Targets get a pulsing dashed selection ring tinted by con color.
  - A pooled particle system (a single draw call) adds nuke bolts that fly from the caster's hand, impact bursts, heal sparkles, buff swirls, DoT clouds, mez/stun stars, a level-up column, pet summon bursts, and mob spells like Frost Shock.
- **3D character preview** on the creation screen. It rotates, you can drag it, and it shows the chosen race and class in starting gear.
- **Performance & quality toggle**: all boxes on a bone merge into one mesh, and geometry and materials are cached and shared by every instance of a look. Distant models skip posing, and models past the fog aren't drawn. Use `/gfx low|high` or the buttons in the help window (**?**): Low gives flat models with no blob shadows or rim light, fewer particles and a 1x pixel ratio. The frame rate matches v3.
- **Saves**: all v1/v2/v3 saves load unchanged. Models are built from race, class and equipped items; nothing new is stored except the graphics preference.

## New in v3
- **Five new classes**: **Ranger** (archery at range, Flame Lick DoT, Snare, Salve, Spirit of Wolf), **Paladin** (Lay on Hands, Bash, Stun, Yaulp, heals), **Shaman** (Sicken DoT, Drowsy slow, Inner Fire, Spirit of Wolf), **Necromancer** (Lifetap, Disease Cloud, Snare, and a **skeletal pet** that grows from Cavorting Bones to Bone Walk to Convoke Shadow), and **Enchanter** (Mesmerize, which breaks on damage, Stun, Chaos Flux, Breeze/Clarity mana regen). EQ-style race restrictions apply: Ogres can't be Rangers, Wood Elves can't be Paladins, and so on.
- **Spellbook & spell gems**: press **K** to open the spellbook. Memorize spells into **8 spell gems** (left edge of the screen). You sit while you memorize and it takes a few seconds; moving or getting hit interrupts it. You can only cast spells you have memorized.
- **Spell icons & a configurable hotbar**: every spell and ability gets a procedurally drawn icon. Drag spells from the book onto the hotbar or gems, or click a spell and then click a slot. Right-click a slot to clear it or a gem to forget the spell.
- **Mercenary upgrades**: click **⚙** in the group window to set a **stance** (passive / balanced / aggressive) and the healer's **heal threshold**, and to **give them gear** (armor and weapons raise their HP, AC and damage, and you can take it back). Fallen mercs stay in the group and can be **revived for a fee** instead of re-hired. Gear, stance and death state are saved.
- **The Warden's Legacy**: a four-part quest chain across both zones (Soulbinder Kerra → Scout Hollis in Frostfang → Warlord Grimtusk's shard → Guildmaster Aldric). The reward is the **Signet of the Everblock Warden** and the title *Warden of Everblock*.
- **New quests**: *Bones of the Restless* (Guard Mossen) and *Yeti Hunt* (Trapper Gunnar at the Frostfang outpost).
- **Synthesized music** that changes mood for town, the wilds, Frostfang and the crypt (**Shift+M**), plus **warm point lights** from nearby lanterns and a player torch at night or underground. These switch on automatically when the frame rate allows; use `/lights` to force them on or off.
- v1/v2 saves load unchanged: old characters get their spells auto-memorized into gems.

## Features
- **Races & classes**: Human, Barbarian, Wood Elf, Dark Elf, Dwarf, Gnome, Ogre / Warrior, Cleric, Wizard, Rogue, Ranger, Paladin, Shaman, Necromancer, Enchanter. Each has EQ-style stats, skills, and spell lines trained at the guildmaster.
- **EQ combat**: con colors, auto attack, casting and fizzles, DoTs, snares, slows, mez and stuns, hate lists and social aggro, fleeing mobs, experience loss and corpse runs
- **Mob pathfinding**: A* on the voxel grid with step-up and drop handling, so mobs chase you around walls and through dungeon doorways
- **Group**: Cleric and Warrior mercenaries from the Mercenary Liaison and a necromancer pet, with EQ-style group XP split (pets don't take a share)
- **Two zones**: the Everblock Wilds (levels 1-10: town, gnoll camp, graveyard, Sunken Crypt) and the Frostfang Highlands (levels 8-15: orc warcamp, yetis, frost giants, Vorgath's Frozen Keep), connected by a zone line
- **Named mobs & loot**: Fippy Darkpaw, Grimbone, Warlord Grimtusk, Vorgath the Frostbound, and more
- **Quests**, a **minimap**, a day/night cycle, and **building** (break and place blocks)

## Controls

| Action | Key |
|---|---|
| Move / jump / look | WASD / Space / Mouse (click to lock pointer) |
| 1st / 3rd person, zoom | V, mouse wheel |
| Target / next target / clear | Left click / Tab / Esc |
| Target self / group members & pet | F1 / F2-F5 |
| Auto attack | Q |
| Hotbar abilities & spells | 1-8 (drag from spellbook; right-click to clear) |
| Spellbook (memorize into gems) | K (click or drag a spell to a gem; double-click to memorize) |
| Cast from a spell gem / forget it | Left click / right click on the gem |
| Consider / sit (regen) | C / X |
| Loot, talk to merchant, trainer, binder, merc liaison | E |
| Hail (quest givers open a dialog) | H |
| Merc stance, heal threshold, gear | ⚙ in the group window |
| Inventory | I |
| Build mode (break / place / pick block) | B (left click / right click / 1-9) |
| Minimap / help / sound / music | N / ? or F10 / M / Shift+M |
| Chat & commands | Enter or `/`: /who /loc /corpse /quests /dismiss /zone /save /music /lights /gfx /book /help |

## Screenshots
| | |
|---|---|
| ![player with gear, third person](screenshots/v4-player-gear.png) | ![monster lineup](screenshots/v4-monster-gallery.png) |
| ![gnolls and orcs close-up](screenshots/v4-monsters-gnolls-orcs.png) | ![giants and yeti](screenshots/v4-monsters-giants.png) |
| ![undead close-up](screenshots/v4-monsters-undead.png) | ![vermin and wolves](screenshots/v4-monsters-vermin.png) |
| ![combat with spell particles](screenshots/v4-combat-spells.png) | ![dwarf necromancer and skeletal pet](screenshots/v4-dwarf-necro-pet.png) |
| ![creation preview: dwarf](screenshots/v4-creation-dwarf.png) | ![creation preview: ogre](screenshots/v4-creation-ogre.png) |
| ![creation preview: dark elf](screenshots/v4-creation-darkelf.png) | ![creation preview: gnome](screenshots/v4-creation-gnome.png) |
| ![necromancer pet (v3)](screenshots/v3-necro-pet.png) | ![player cloak from behind](screenshots/v4-player-gear-back.png) |
| ![spellbook and spell gems](screenshots/v3-spellbook-gems.png) | ![merc settings: stance and gear](screenshots/v3-merc-settings.png) |
| ![The Warden's Legacy reward](screenshots/v3-quest-reward.png) | ![lantern lights at night](screenshots/v3-lantern-night.png) |
| ![v3 character creation](screenshots/v3-class-creation.png) | ![warcamp fight](screenshots/v2-warcamp-fight.png) |
| ![merc group](screenshots/v2-merc-group.png) | ![frostfang](screenshots/v2-frostfang.png) |
| ![pathing through a crypt doorway](screenshots/v2-pathing-doorway.png) | ![frozen keep](screenshots/v2-frozen-keep.png) |
| ![town](screenshots/2-town.png) | ![crypt](screenshots/4-dungeon.png) |

## Tech
- Three.js r149 (UMD, vendored), plain JavaScript, no bundler
- Chunked voxel meshing with a procedural texture atlas, DDA block raycasting, AABB voxel physics
- A* pathfinding with a binary heap and per-frame search budget, plus soft entity separation
- Canvas-drawn spell icons; a fixed pool of point lights reassigned to the nearest lanterns, so shaders never recompile
- WebAudio-synthesized sound effects and a generative music loop

### Building from source
```
cd source
python3 build.py     # inlines src/*.js, src/style.css and vendor/three.min.js into ../index.html (and source/dist/everblock.html)
```
For development, open `source/index.html` directly. `source/tools/` contains Playwright scripts for headless Chromium (`npm install`, then `node test.js`, `node test_v2.js`, `node test_v3.js` or `node test_v4.js`; they expect Chrome at `/usr/bin/google-chrome`).
