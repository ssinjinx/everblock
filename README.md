# Everblock

![Everblock v5: the monsters of the Sunscorched Expanse and the Tomb of Ankhet-Ra](screenshots/v5-hero.png)

**[▶ Play in your browser](https://ssinjinx.github.io/everblock/)**

A blocky voxel world (Minecraft-style) that plays like **EverQuest Classic (1999)**. You roll a character (race, class, stat points), bind at Everblock Keep, hunt rats and gnolls outside the walls, then work your way through the Sunken Crypt, the Frostfang Highlands and the Sunscorched Expanse, all the way down to the Pharaoh's tomb. It also plays on phones, with touch controls. There are con colors, auto attack, spell gems and a spellbook, med/sit regen, corpse runs, named mobs and camps. You can also break and place blocks anywhere.

Everything is generated in code: terrain, textures, models, spell icons, sound and music. There are no external assets. The whole game is one self-contained `index.html` (Three.js r149 inlined) that works offline from `file://`. Progress saves to localStorage.

## New in v5c: installable app + iPhone fix
- **Install it like an app**: on iPhone/iPad tap **Share > Add to Home Screen** (the start screen shows this hint on iOS, and you can dismiss it). On Android/Chrome use **Install app**. It launches full screen with its own voxel "E" icon, keeps the controls clear of the notch and home bar, and **works offline**: a service worker caches the game and picks up new versions automatically when you're online.
- **Phone Mode is now always on for touch devices**. On some iPhones, a stored "off" left by an earlier build kept Phone Mode off, so you got the desktop "Click to resume" overlay with no joystick. Old stored values are now discarded. Touch devices never show the pointer-lock overlay or grab the pointer. The touch controls start on both paths (new character and Enter World).
- You can switch Phone Mode **in game** from the Help window (**?**) or with `/phone on|off`. `/phone status` shows on screen what touch signals the device reports.

![iPhone portrait](screenshots/v5c-iphone-portrait.png)

## New in v5: the desert, factions, smarter mobs, and Phone Mode
- **Phone Mode (touch controls)**: there is a **📱 Phone Mode** button on the start screen and the character-creation screen. It is suggested automatically on touch devices, and your choice is remembered (localStorage). You can also switch it with `/phone on|off`.
  - Layout: works in portrait and landscape on small screens, with a compact HUD, a collapsible chat log (💬), smaller full-width windows and larger touch targets. There is no pointer lock, and the browser's page scroll, pinch-zoom and double-tap zoom are blocked inside the game.
  - **Left thumb**: a virtual joystick for analog movement. **Right side of the screen**: drag to turn the camera, tap a monster or NPC to target it (tap your current NPC or corpse target again to talk or loot), and pinch to zoom the camera.
  - Buttons: Jump, Auto-attack, Talk/Loot (E), Sit, Consider, Next target, Hail. The top bar has Chat, Inventory, Spellbook, Map, Pet window, 1st/3rd person, Say/commands and Help. Hotbar slots, spell gems and pet commands are all tappable.
  - iPhone/iOS (Safari, Brave, Chrome on iOS) and iPadOS are detected reliably. Detection checks touch points, touch events, coarse pointer / no-hover media queries and the user agent, and the first tap also counts. The title scales to the screen width, and the Phone Mode toggle sits at the top of the start screen whether or not you have a saved character. Tested in WebKit at 390x844 and 430x932 (`tools/test_iphone.js`).
  - Graphics default to **low** on phones, with a 1x pixel ratio. The merchant (with a new tap-to-sell list), quest, merc settings, spellbook (with Gem/Hotbar buttons instead of drag and drop) and pet windows all work by touch.
- **The Sunscorched Expanse (levels 15-25)** lies north through the Frostfang pass.
  - It has dunes, mesas, cactus, an oasis and the walled **Sunward Outpost**: bind point, merchant, a Sandreaver fence, guards and three quests.
  - Out in the desert you'll find sand scorpion flats, a Sandreaver bandit hideout, the sand-giant colossi and a dust-djinn ruin.
  - The **Great Pyramid** has a torch-lit hall that leads down into the **Tomb of Ankhet-Ra**: embalming chamber, treasury, prison, pit and the Grand Vizier's room, with the Pharaoh's sanctum at the end.
  - New blocks: sandstone, carved hieroglyph stone, gold, cactus, palm, dune sand and braziers (lit at night and in the dungeon). The zone has its own music: a hijaz-scale desert theme and a darker tomb drone.
- **12 new detailed monsters**: sand scorpions and **Szyrix the Venomqueen**, Sandreaver bandits and mystics plus **Rahzik the Sand Viper**, wrapped mummies, tomb priests, **Grand Vizier Sethek**, sand giants and **Gorukh the Dune Titan**, dust djinn, and the boss **Pharaoh Ankhet-Ra the Eternal**.
- **Level cap 25**: every class gets new spells and abilities up to level 25, for example Taunt and Ward Undead (double damage against undead), with new tiers of heals, nukes, DoTs, buffs, mez and slows. Necromancers get level 18 and 23 pets. There is desert loot (scimitars, khopeshes, sunforged and pharaoh gear) and level 15-25 merchant stock.
- **EQ faction standing**: Guards of Everblock, Hollis Rangers, Sunward Caravan, Darkpaw Gnolls, Frostfang Orcs and Sandreaver Bandits.
  - Kills and quests move your standing, and you get EQ messages ("Your faction standing with ... got worse.").
  - Consider shows the attitude (*glares at you threateningly*, *regards you indifferently*, ...). Faction mobs only attack on sight while you're KOS.
  - Merchants charge more or less depending on your standing and refuse to trade when you're Dubious or worse. `/faction` lists your standings.
- **Pet commands**: a pet bar and `/pet attack|backoff|follow|guard|sit|window` (window also opens with **P**). Guard holds a spot, sit stays put, back off drops the fight. The pet's mode is saved.
- **Smarter mobs**:
  - Casters heal hurt allies (or themselves) and buff them with wards and haste.
  - Low-con mobs flee at low health, run to the nearest idle friend, shout for help and bring it back. Undead and named mobs never flee.
  - Rare named mobs pop on placeholder spawns, and only one of each is ever up.
- Saves from v1-v4 load unchanged. Factions start at their defaults.

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
- **Three zones**: the Everblock Wilds (levels 1-10: town, gnoll camp, graveyard, Sunken Crypt), the Frostfang Highlands (levels 8-15: orc warcamp, yetis, frost giants, Vorgath's Frozen Keep) and the Sunscorched Expanse (levels 15-25: Sunward Outpost, bandit hideout, the Great Pyramid and the Tomb of Ankhet-Ra), connected by zone lines
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
| Pet commands | Pet bar, P (pet window), `/pet attack\|backoff\|follow\|guard\|sit` |
| Chat & commands | Enter or `/`: /who /loc /corpse /quests /faction /pet /dismiss /zone /save /music /lights /gfx /phone [on\|off\|status] /book /help |

**Phone Mode (touch)**: left joystick = move; drag on the right = look; tap = target (tap again to talk/loot); pinch = zoom; on-screen buttons for jump, attack, E, sit, consider, next target and hail; top bar for chat, bags, spellbook, map, pet, camera and help; tap hotbar slots and spell gems to use them.

## Screenshots
| | |
|---|---|
| ![Phone Mode on iPhone 13 (portrait)](screenshots/v5-phone-iphone13-combat.png) | ![Phone Mode on Pixel 5 (landscape)](screenshots/v5-phone-pixel5-combat.png) |
| ![iPhone landscape, phone mode](screenshots/v5c-iphone-landscape.png) | ![iPhone portrait, phone mode](screenshots/v5c-iphone-portrait.png) |
| ![iPhone start screen with a saved character](screenshots/v5b-iphone-start.png) | ![iPhone in game](screenshots/v5b-iphone-ingame.png) |
| ![phone spellbook](screenshots/v5-phone-iphone13-spellbook.png) | ![phone merchant with sell list](screenshots/v5-phone-pixel5-merchant.png) |
| ![Sunward Outpost](screenshots/v5-desert-outpost.png) | ![the Great Pyramid](screenshots/v5-pyramid.png) |
| ![Tomb of Ankhet-Ra](screenshots/v5-tomb.png) | ![Pharaoh Ankhet-Ra](screenshots/v5-boss.png) |
| ![desert monsters](screenshots/v5-monsters.png) | ![pet commands](screenshots/v5-pet-commands.png) |
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
sh pwa/stage.sh      # copies manifest.webmanifest, icons/ and the build-stamped sw.js next to ../index.html
```
For development, open `source/index.html` directly. `source/tools/` contains Playwright scripts for headless Chromium (`npm install`, then `node test.js`, `node test_v2.js`, `node test_v3.js`, `node test_v4.js`, `node test_v5.js`, `node test_phone.js` for the iPhone 13 / Pixel 5 touch emulation test, `node test_iphone.js` for the WebKit iPhone test (needs `npx playwright install webkit`), or `URL=http://localhost:8000/ node test_pwa.js` for the PWA (serve the repo root over http first); they expect Chrome at `/usr/bin/google-chrome`).
