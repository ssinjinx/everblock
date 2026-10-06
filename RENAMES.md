# Everblock v6b: the Great Renaming

Everblock started as a voxel homage to EverQuest Classic (1999). The game is its own thing, so in v6b every name and phrase that was copied word for word (or very nearly) from EverQuest was swapped for an affectionate parody. The parodies wink at the original, stay PG-13, and the tooltips and descriptions still say exactly what each spell does.

**Saves are unaffected.** Only display text changed. Items, spells, quests, hotbars, gems, pets and factions are stored by internal id, and none of those ids changed, so solo (localStorage) and server (SQLite) characters load exactly as before. No migration was needed. Slash commands are also unchanged (`/say`, `/shout`, `/ooc`, `/auction`, `/tell`, `/g`, `/who`, `/pet ...`).

## Spells & abilities
| Old | New | id (unchanged) |
|---|---|---|
| Bind Wound | **Slap a Bandage On** | `bind_wound` |
| Kick | **Shin Kick** | `kick` |
| Backstab | **Rude Backpoke** | `backstab` |
| Evade | **Nope Dodge** | `evade` |
| Minor Healing | **Mild Band-Aid** | `minor_healing` |
| Strike | **Smite-Lite** | `strike` |
| Courage | **Pep Talk** | `courage` |
| Light Healing | **Lightly Seasoned Healing** | `light_healing` |
| Holy Armor | **Holy Bubble Wrap** | `holy_armor` |
| Furor | **Divine Tantrum** | `furor` |
| Word of Health | **Group Hug of Health** | `word_of_health` |
| Healing | **Healing (Extra Strength)** | `healing` |
| Blast of Cold | **Brisk Draft** | `blast_of_cold` |
| Minor Shielding | **Shielding (Travel Size)** | `minor_shielding` |
| Shock of Fire | **Spicy Zap** | `shock_of_fire` |
| Root | **Sticky Floor** | `root` |
| Gate | **Panic Button** | `gate` |
| Archery | **Pew Pew** | `archery` |
| Flame Lick | **Toasty Tickle** | `flame_lick` |
| Snare | **Molasses Feet** | `snare` |
| Salve | **Forest Ointment** | `salve` |
| Skin like Wood | **Skin like Plywood** | `skin_like_wood` |
| Lay on Hands | **Aggressive High-Five** | `lay_hands` |
| Bash | **Shield Bonk** | `bash` |
| Yaulp | **Battle Yodel** | `yaulp` |
| Stun | **Seeing Stars** | `stun` |
| Sicken | **Mild Case of the Ick** | `sicken` |
| Inner Fire | **Inner Heartburn** | `inner_fire` |
| Frost Rift | **Brain Freeze Rift** | `frost_rift` |
| Spirit of Wolf | **Zoomies of the Wolf** | `spirit_of_wolf` |
| Drowsy | **Nap Time** | `drowsy` |
| Lifetap | **Life Siphon Straw** | `lifetap` |
| Disease Cloud | **Questionable Fog** | `disease_cloud` |
| Cavorting Bones | **Skeleton Disco** | `cavorting_bones` |
| Heat Blood | **Hot Blooded** | `heat_blood` |
| Bone Walk | **Skeleton Crew** | `bone_walk` |
| Convoke Shadow | **Summon Edgelord** | `convoke_shadow` |
| Mesmerize | **Mesmer-eyes** | `mesmerize` |
| Chaos Flux | **Chaos Fluff** | `chaos_flux` |
| Breeze | **Mana Spritz** | `breeze` |
| Clarity | **Big Brain Juice** | `clarity` |
| Shock of Lightning | **Zappity Zap** | `shock_of_lightning` |
| Taunt | **Yo Mama Taunt** | `taunt` |
| Slam | **Shoulder Check** | `slam` |
| Defensive Stance | **Turtle Mode** | `defensive` |
| Rampage | **Flailing Frenzy** | `rampage` |
| Greater Healing | **Big Band-Aid** | `greater_healing` |
| Symbol of Transal | **Symbol of Transfat** | `symbol_of_transal` |
| Wrath | **Holy Hissy Fit** | `wrath` |
| Superior Healing | **Premium Healing (Ad-Free)** | `superior_healing` |
| Word of Vigor | **Group Hug of Vigor** | `word_of_vigor` |
| Armor of Faith | **Armor of Blind Optimism** | `armor_of_faith` |
| Lightning Bolt | **Lightning Yeet** | `lightning_bolt` |
| Shielding | **Shielding (Family Size)** | `shielding` |
| Fire Bolt | **Hot Take** | `fire_bolt` |
| Ice Comet | **Ice Cube Delivery** | `ice_comet` |
| Sunstrike | **Sunburn Supreme** | `sunstrike` |
| Kidney Shot | **Kidney Tickle** | `kidney_shot` |
| Envenom Blades | **Spicy Dagger Sauce** | `poison_blade` |
| Eviscerate | **Rude Finisher** | `eviscerate` |
| Assassinate | **Surprise Retirement** | `assassinate` |
| Barbed Arrow | **Pointy Pew** | `barbed_arrow` |
| Firefist | **Flaming Knuckles** | `firefist` |
| Ensnare | **Extra Molasses Feet** | `ensnare` |
| Greater Salve | **Extra-Strength Ointment** | `greater_salve` |
| Call of Fire | **Call of the Campfire** | `call_of_fire` |
| Eagle Eye Shot | **Birdie Shot** | `eagle_eye` |
| Holy Might | **Holy Smackdown** | `holy_might` |
| Ward Undead | **Undead Repellent** | `ward_undead` |
| Celestial Healing | **Heavenly Spa Day** | `celestial_healing` |
| Divine Aura | **Holy Hamster Ball** | `divine_aura` |
| Winter's Roar | **Winter's Grumble** | `winters_roar` |
| Quickness | **Espresso Shot** | `quickness` |
| Envenomed Breath | **Morning Breath** | `envenomed_breath` |
| Tagar's Insects | **Bugs in Your Business** | `tagars_insects` |
| Spirit of the Ox | **Big Ox Energy** | `spirit_of_ox` |
| Vampiric Embrace | **Vampiric Side-Hug** | `vampiric_embrace` |
| Boil Blood | **Rolling Boil** | `boil_blood` |
| Invoke Death | **Summon Bone Butler** | `invoke_death` |
| Servant of Bones | **Mummy Intern** | `servant_of_bones` |
| Drain Soul | **Soul Smoothie** | `drain_soul` |
| Enthrall | **Hypno-Stare** | `enthrall` |
| Color Shift | **RGB Flashbang** | `color_shift` |
| Chaotic Feedback | **Mic Feedback** | `chaotic_feedback` |
| Clarity II | **Big Brain Juice II** | `clarity_ii` |
| Scourge | **Plague Rat Energy** | `scourge` |
| Dazzle | **Razzle Dazzle** | `dazzle` |
| Battle Fury | **Battle Fury** | `battle_fury` |

*Battle Fury* is unchanged: it was never an EverQuest name.

## Items
| Old | New | id (unchanged) |
|---|---|---|
| Rusty Dagger | **Tetanus Dagger** | `rusty_dagger` |
| Rusty Short Sword | **Short Sword of Mild Tetanus** | `rusty_short_sword` |
| Rusty Mace | **Rust-Crusted Bonk Stick** | `rusty_mace` |
| Worn Great Staff | **Pre-Owned Walking Stick** | `worn_staff` |
| Bronze Long Sword | **Bronze-ish Longsword** | `bronze_long_sword` |
| Fine Steel Dagger | **Reasonably Okay Steel Dagger** | `fine_steel_dagger` |
| Cloth Cap | **Floppy Cloth Hat** | `cloth_cap` |
| Cloth Shirt | **Itchy Burlap Shirt** | `cloth_shirt` |
| Cloth Pants | **Drafty Cloth Trousers** | `cloth_pants` |
| Fippy's Spiked Collar | **Flippy's Spiked Fashion Collar** | `fippy_collar` |
| Rat Whiskers | **Rat Mustache Hairs** | `rat_whiskers` |
| Snake Scales | **Snake Sequins** | `snake_scales` |
| Fire Beetle Eye | **Spicy Beetle Eyeball** | `beetle_eye` |
| Bone Chips | **Skeleton Crumbs** | `bone_chips` |
| Gnoll Fang | **Gnoll Dentures** | `gnoll_fang` |
| Gray Wolf Pelt | **Slightly Used Wolf Pelt** | `wolf_pelt` |
| Loaf of Bread | **Suspiciously Crusty Bread** | `bread` |

## Monsters
| Old | New | id (unchanged) |
|---|---|---|
| a large rat | **a suspiciously large rat** | `rat` |
| a grass snake | **a lawn noodle** | `snake` |
| a fire beetle | **a spicy beetle** | `beetle` |
| a decaying skeleton | **a crumbly skeleton** | `skeleton` |
| a gnoll pup | **a gnoll intern** | `gnoll_pup` |
| Fippy Darkpaw | **Flippy Darkpaws, Gate Enthusiast** | `fippy` |
| a gray wolf | **a brooding gray wolf** | `wolf` |

## NPC titles
| Old | New |
|---|---|
| Guildmaster Aldric, *&lt;Guildmaster&gt;* | **Guild Coach Aldric, *&lt;Guild Coach&gt;*** |
| Soulbinder Kerra, *&lt;Soulbinder&gt;* | **Soul-Notary Kerra, *&lt;Soul Notary&gt;*** |
| Mercenary Liaison Brenna, *&lt;Mercenary Liaison&gt;* | **Sellsword Recruiter Brenna, *&lt;Sellsword Recruiter&gt;*** |
| Guildmaster / Mercenary Liaison window titles | **Guild Coach / Sellsword Recruiter** |

## Necromancer pets
| Old | New |
|---|---|
| Gabober (level 3) | **Rattles McGee** |
| Jobekab | **Sir Clanksalot** |
| Xabanek | **Shadow Steve** |
| Kobaron | **Bonaparte** |
| Sabekhet | **Mummy Dearest** |

## Places, factions & lore
| Old | New |
|---|---|
| Darkpaw Gnolls (faction) | **Darkpaws Gnoll Homeowners Assn.** |
| Darkpaw Gnoll Camp | **Darkpaws Gnoll Camp** |
| Kelethin (wood elf description) | **Kelp-Thin, which is mostly ladders** |
| ultravision (dark elf description) | **night vision so good it is frankly rude** |
| Frost Shock (mob spell) | **Brain Freeze** |

## Faction standings (label / consider text)
| Old | New |
|---|---|
| Ally / regards you as an ally | **BFF / considers you its BFF** |
| Warmly / looks upon you warmly | **Hugger / would totally hug you** |
| Kindly / kindly considers you | **Fond / thinks you are pretty neat** |
| Amiable / judges you amiably | **Cordial / nods at you politely** |
| Indifferent / regards you indifferently | **Meh / could not care less about you** |
| Apprehensive / looks your way apprehensively | **Wary / eyes you like a suspicious cat** |
| Dubious / glowers at you dubiously | **Side-Eye / gives you serious side-eye** |
| Threateningly / glares at you threateningly | **Hostile / cracks its knuckles at you** |
| Scowls / scowls at you, ready to attack | **Kill on Sight / is sharpening something with your name on it** |

Merchants still refuse to trade at Hostile or worse, and faction mobs still attack on sight at Hostile or worse. Only the words changed.

## Consider (con) messages
| Old | New |
|---|---|
| grey: looks like a waste of your time | **is not worth the calories** |
| green: looks like a reasonably safe opponent | **looks like a light snack** |
| light blue: looks like a reasonably safe opponent | **looks like a light snack with a little crunch** |
| blue: looks like you would have the upper hand | **looks like you would win, probably** |
| white: looks like an even fight | **looks like a coin flip with teeth** |
| yellow: looks quite dangerous | **looks like a bad decision** |
| red: looks like it would wipe the floor with you! | **looks like it would use you as a mop!** |

## Chat & combat messages
| Old | New |
|---|---|
| LOADING, PLEASE WAIT... | **LOADING, PLEASE GO MAKE A SANDWICH...** |
| You have gained a level! Welcome to level X! (log + center banner) | **DING! You are now level X. Your mom would be proud.** (log + center banner) |
| You have entered X. | **You wander into X.** |
| MOTD: ... | **Town Crier: ...** |
| You have gained experience! / You gain party experience!! | **You feel a little smarter. (XP) / You and your party feel smarter. (shared XP)** |
| You gain no experience from that kill. | **That kill taught you absolutely nothing.** |
| You have lost experience. | **You feel a little less experienced, like waking up from a nap that went too long.** |
| You have slain X! / X has been slain by Y! | **You have defeated X! It had it coming. / X has been taken out by Y!** |
| You have been slain by X! / death screen "You have been slain!" | **You have been flattened by X! Walk it off. / "You have been flattened!"** |
| You hit X for N points of damage. / N points of non-melee damage | **You hit X for N damage. / Your spell hits X for N damage.** |
| You are struck by X! You have taken N points of non-melee damage. | **X smacks you for N spell damage!** |
| You try to hit X, but miss! / X tries to hit YOU, but misses! / but YOU dodge! | **...but whiff! / ...but swings at air! / ...but you dodge like a pro!** |
| X begins to cast a spell. &lt;Y&gt; | **X starts chanting: &lt;Y&gt;** |
| You begin casting X. | **You start waving your hands around: X.** |
| Your spell fizzles! | **Your spell fizzles like a wet firecracker!** |
| You are already casting a spell! | **One spell at a time, show-off!** |
| Insufficient Mana to cast this spell! | **Not enough mana. Try sitting down and thinking about your choices.** |
| You must first select a target for this spell! | **That spell needs a target. Pointing at the sky does not count.** |
| You cannot see your target. | **Your target is out of sight. Walls are rude like that.** |
| X resisted your Y! | **X shrugs off your Y!** |
| Your X spell has worn off. | **Your X wore off. Sad trombone.** |
| X has taken N damage from your Y. | **X is still suffering from your Y (N damage).** |
| X has been mesmerized. / X has been awakened by Y. | **X is mesmer-eyed and staring into space. / X snaps out of it, thanks to Y.** |
| X's feet adhere to the ground. | **X is stuck in place like gum on a boot.** |
| You feel a pull to your bind point. | **You mash the Panic Button. Whoosh, back to your bind point!** |
| Beginning to memorize X... / You have finished memorizing X. / Your memorization was interrupted. | **Cramming X into your brain... / ...Pop quiz passed! / Your study session was interrupted. Now where were you?** |
| Binding your soul... / You feel yourself bind to the area. | **Soul notarized! ... Sign here, and here. / Your soul is now officially registered at this address.** |
| --You have looted a X from Y.-- / You receive N from Y. | **You yoink a X from Y! / You pocket N from Y.** |
| Auto attack is on. / off. | **Auto-swing engaged. Flail away! / Auto-swing off. Catch your breath.** |
| Your faction standing with X got better / worse / could not possibly get any better. | **Your reputation with X improved. They might even learn your name. / ...worsened. Someone is writing your name in a little book. / ...is maxed out.** |
| You feel you could learn something new at your guild. | **Your Guild Coach has new tricks to teach you.** |
| Your Location is x, y, z | **You are standing at x, y, z (give or take a block)** |
| That is not a valid command. Try /help. | **Huh? That is not a command. Try /help.** |
| Players on Everblock: / [5 Warrior] Name (Human) ZONE: X / There are N players in Everblock. | **Adventurers loitering in Everblock: / Lv5 Warrior Name (Human) - hanging around X / N adventurers are loitering in Everblock.** |
| X says, 'msg' / X shouts, 'msg' | **X says: "msg" / X hollers: "msg" (players) and X shouts: "msg" (NPCs)** |
| X says out of character, 'msg' / X auctions, 'msg' | **[OOC] X: msg / [Market] X hawks: "msg"** |
| X tells the group, 'msg' / You tell your party, 'msg' | **[Party] X: msg** |
| X tells you, 'msg' / You told X, 'msg' | **X whispers to you: "msg" / You whisper to X: "msg"** |
| X is not online at this time. | **X is not online right now. Probably eating dinner.** |
| X invites you to join a group. / X has joined the group. / Your group has been disbanded. | **X wants you in their party. / X has joined the party. / Your party has disbanded. Everyone go home.** |
| You have been summoned by X. | **X yanks you across the zone. Hello!** |
| Pet: Attacking X, Master. / Following you, Master. / Backing off, Master. / Guarding with my life... oh splendid one. / Changing position, Master. | **On it, boss! Going after X. / Right behind you, boss. Like, RIGHT behind you. / Fine, fine. Backing off. / Guarding this exact spot. Nobody touches it. / Taking a load off, boss.** |
| Guard: Time to die X! | **Your respawn timer starts now, X!** |
| Named mob: You dare trespass here? Die! | **Wipe your feet! This is MY lair!** |
| Merc taunt: X taunts Y to ignore others and attack him! | **X taunts Y with a truly hurtful joke. It forgets everyone else!** |
| Your target is too far away, get closer! / Your target is out of range, get closer! | **Your target is too far away. Your arms are not that long! / Your target is out of range. Scoot closer!** |
| You cannot see your target. (melee facing) | **You need to face your target. It is rude to swing behind your back.** |
| Your spell is interrupted. | **Ouch! Your spell is interrupted.** |
| You have finished scribing X into your spellbook. | **You copy X into your spellbook in your neatest handwriting.** |
| You have not scribed that spell. | **You have not learned that spell yet.** |
| You feel brave. / You feel armored. / A holy aura surrounds you. / You prepare to evade attacks. | **You feel pepped up! / A travel-size shield pops up around you. / You are wrapped in holy bubble wrap. / You prepare to nope out of the next few attacks.** |
| You must first select a target to consider. | **Consider what, exactly? Pick a target first.** |
| Guildmaster / Soulbinder - press E (target window) | **Guild Coach / Soul Notary - press E** |
| Threatening / Indifferent (target-window fallback when a mob has no faction) | **Hostile / Meh** |
| Center banner: Welcome to level X! | **You are now level X. Your mom would be proud.** |

## Left unchanged on purpose
- **Generic fantasy and MMO vocabulary**, which EverQuest didn't invent and every game in the genre shares:
  - race and class names (Human, Wood Elf, Ogre, Warrior, Cleric, Necromancer, Enchanter...);
  - gnoll, skeleton warrior, ghoul, yeti;
  - consider, con colors, hail, sit, bind point, corpse / *X's corpse*, auto-attack, taunt, mez, DoT, KOS, mercenary, spellbook and spell gems, zone line, healing potions.
- **Everblock's own names**: Grimbone, Grimtusk, Vorgath, the Frostfang Highlands, the Sunscorched Expanse, Ankhet-Ra, the Sandreavers, the Sunward Caravan and the quest names were original already.
- **Slash commands** keep their classic spelling so muscle memory and macros keep working. Only the text they print changed.
- **The README** still says the game "plays like EverQuest Classic (1999)". That is credit to the inspiration, not a borrowed name.
- **Code comments and internal ids** (`fippy`, `lay_hands`, `spirit_of_wolf`, ...) are invisible to players and stay as they are, for save compatibility.
