// Everblock - main game: player, input, combat, spells, loot, UI glue, save/load
(function () {
  const EB = window.EB;
  const U = EB.util, ui = EB.ui, calc = EB.calc, $ = EB.$;
  const D = EB.data;
  const { B, BLOCKS, RACES, CLASSES, ITEMS, SPELLS, EQUIP_SLOTS, STAT_NAMES, conColor, CON_HEX, CON_XP, CON_MSG, MERCS, QUESTS, mercCost } = D;
  const { Mob, NPC, PlayerCorpse, buildModel, animateModel, physicsMove, collides } = EB.ent;
  const isSpell = (id) => !!SPELLS[id] && !SPELLS[id].skill && SPELLS[id].kind !== 'skill';

  const SAVE_KEY = 'everblock_save_v1';
  EB.SAVE_KEY = SAVE_KEY;
  EB.loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } };

  const TICK = 6; // EQ server tick in seconds
  const DAY_LEN = 720; // seconds per full day
  const FISTS = { name: 'Fists', dmg: 2, delay: 2.2, verb: 'punch' };
  const VERB3 = { slash: 'slashes', pierce: 'pierces', crush: 'crushes', punch: 'punches', hit: 'hits', bite: 'bites', claw: 'claws', kick: 'kicks', backstab: 'backstabs' };
  const BUFF_MSG = { courage: 'You feel pepped up!', minor_shielding: 'A travel-size shield pops up around you.', holy_armor: 'You are wrapped in holy bubble wrap.', battle_fury: 'You are filled with a battle fury!', evade: 'You prepare to nope out of the next few attacks.' };
  const MERCHANT_STOCK = ['healing_potion', 'greater_potion', 'bread', 'cloth_cap', 'cloth_pants', 'rawhide_gloves', 'leather_boots', 'leather_tunic', 'wooden_shield', 'bronze_long_sword', 'fine_steel_dagger', 'oak_staff'];

  // ---------------- Player ----------------
  class Player {
    constructor(c) {
      this.kind = 'player';
      this.name = c.name; this.race = c.race; this.cls = c.cls;
      this.level = c.level || 1; this.xp = c.xp || 0;
      this.base = c.stats.slice();
      this.coins = c.coins != null ? c.coins : 150;
      this.inv = c.inv || new Array(24).fill(null);
      this.equip = c.equip || {};
      this.spells = (c.spells || Object.keys(SPELLS).filter((s) => SPELLS[s].classes[c.cls] === 1)).filter((s) => SPELLS[s]);
      // v3: spell gems + configurable hotbar (migrates v1/v2 saves)
      const key = (id) => (SPELLS[id].classes[c.cls] || 99) + (id === 'bind_wound' ? 0.5 : 0);
      const known = this.spells.slice().sort((a, b) => key(a) - key(b));
      const pad = (a) => { a = (a || []).slice(0, 8).map((x) => (x && SPELLS[x] && this.spells.includes(x) ? x : null)); while (a.length < 8) a.push(null); return a; };
      this.gems = pad(c.gems || known.filter(isSpell));
      this.hotbar = pad(c.hotbar || known);
      this.title = c.title || '';
      // v5: EQ-style faction standings (older saves start at the defaults)
      this.faction = Object.assign({}, c.faction || {});
      for (const f in D.FACTIONS) if (typeof this.faction[f] !== 'number') this.faction[f] = D.FACTIONS[f].start;
      this.petMode = c.petMode || 'follow';
      this.memorizing = null;
      this.buffs = (c.buffs || []).filter((b) => b.left > 0);
      this.bind = c.bind || null;
      this.played = c.played || 0;
      this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
      if (c.pos) this.pos.set(c.pos[0], c.pos[1], c.pos[2]);
      this.yaw = c.yaw != null ? c.yaw : Math.PI; this.pitch = -0.12;
      const rs = RACES[this.race].scale;
      this.hw = rs > 1.2 ? 0.38 : 0.3; this.h = Math.min(2.4, 1.85 * rs);
      this.eyeH = this.h * 0.92;
      this.alive = true; this.sitting = false; this.autoAttack = false; this.swing = 0; this.casting = null;
      this.cooldowns = {}; this.onGround = false;
      this.hp = c.hp != null ? c.hp : this.maxHp; this.mana = c.mana != null ? c.mana : this.maxMana;
    }
    stats() {
      const s = {};
      STAT_NAMES.forEach((n, i) => (s[n] = this.base[i]));
      for (const sl in this.equip) { const it = ITEMS[this.equip[sl].id]; if (it && it.stats) for (const k in it.stats) s[k] += it.stats[k]; }
      return s;
    }
    statArr() { const s = this.stats(); return STAT_NAMES.map((n) => s[n]); }
    itemSum(field) { let t = 0; for (const sl in this.equip) { const it = ITEMS[this.equip[sl].id]; if (it && it[field]) t += it[field]; } return t; }
    buffSum(field) { let t = 0; for (const b of this.buffs) if (b.buff[field]) t += b.buff[field]; return t; }
    get maxHp() { return calc.maxHp(this.cls, this.level, this.stats().STA) + this.itemSum('hp') + this.buffSum('hp'); }
    get maxMana() { const m = calc.maxMana(this.cls, this.level, this.statArr()); return m ? m + this.itemSum('mana') : 0; }
    get ac() { return this.itemSum('ac') + this.buffSum('ac') + Math.floor(this.stats().AGI / 8) + this.level * ({ warrior: 3, paladin: 3, rogue: 2, ranger: 2, shaman: 1.5 }[this.cls] || 1); }
    weapon() { return this.equip.primary ? ITEMS[this.equip.primary.id] : Object.assign({}, FISTS, { dmg: FISTS.dmg + Math.floor(this.level / 3) }); }
    castStat() { const ms = CLASSES[this.cls].manaStat; return ms != null ? this.statArr()[ms] : 75; }
    modelOpts() {
      return EB.models.playerOpts({ race: this.race, cls: this.cls, equip: this.equip });
    }
    forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    toSave() {
      return { name: this.name, race: this.race, cls: this.cls, level: this.level, xp: this.xp, stats: this.base, coins: this.coins, inv: this.inv, equip: this.equip,
        spells: this.spells, gems: this.gems, hotbar: this.hotbar, title: this.title, faction: this.faction, petMode: this.petMode, buffs: this.buffs, bind: this.bind, played: this.played, pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw, hp: this.hp, mana: this.mana };
    }
  }

  // ---------------- Game ----------------
  class Game {
    constructor() {
      this.time = 0; this.keys = {}; this.windows = new Set(); this.target = null;
      this.mobs = []; this.npcs = []; this.pcorpses = []; this.slots = [];
      this.camDist = 5.5; this.buildMode = false; this.buildSel = 0; this.lastZone = ''; this.hudT = 0; this.tickT = TICK; this.spawnT = 0;
      this.msgThrottle = {}; this.dayT = 0.3; this.saveT = 30; this.deathT = 0;
      this.mercs = []; this.otherCorpses = []; this.zoneEdits = {}; this.quests = {}; this.zoneMeshes = []; this.pathBudget = 6; this.showMap = true; this.questSteps = {}; this.lightT = 0;
      this.net = EB.net && EB.net.active ? EB.net : null; // v6: online play (server-run world, see net.js)
      if (this.net) this.net.attach(this);
    }
    initThree() {
      const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      r.setSize(window.innerWidth, window.innerHeight);
      if ('outputColorSpace' in r) r.outputColorSpace = THREE.SRGBColorSpace; else r.outputEncoding = THREE.sRGBEncoding;
      $('game').appendChild(r.domElement);
      this.renderer = r;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 700);
      this.scene.fog = new THREE.Fog(0x87b5e8, 30, 105);
      this.hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4030, 0.6); this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xfff4d8, 0.8); this.scene.add(this.sun); this.scene.add(this.sun.target);
      this.moonLight = new THREE.DirectionalLight(0x6070b0, 0.0); this.scene.add(this.moonLight); this.scene.add(this.moonLight.target);
      this.sunMesh = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: 0xfff0a0, fog: false }));
      this.moonMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial({ color: 0xd8e0ff, fog: false }));
      this.scene.add(this.sunMesh); this.scene.add(this.moonMesh);
      const sg = new THREE.BufferGeometry(), sp = [];
      const rng = U.mulberry32(42);
      for (let i = 0; i < 900; i++) { const t = rng() * Math.PI * 2, u = rng() * 0.95 + 0.05, r2 = Math.sqrt(1 - u * u); sp.push(Math.cos(t) * r2 * 450, u * 450, Math.sin(t) * r2 * 450); }
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
      this.scene.add(this.stars);
      // v4: textured, pulsing selection ring (dashed outer band + soft inner glow) tinted by con colour
      const rc = document.createElement('canvas'); rc.width = rc.height = 128;
      { const c = rc.getContext('2d'); const gr = c.createRadialGradient(64, 64, 30, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.72, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.88, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; c.fillRect(0, 0, 128, 128); c.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 12; i++) { c.save(); c.translate(64, 64); c.rotate((i / 12) * Math.PI * 2); c.fillRect(-3, 44, 6, 22); c.restore(); } }
      const rtex = new THREE.CanvasTexture(rc);
      this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: rtex, color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 2; this.scene.add(this.ring);
      EB.fx.init(this.scene);
      this.gfxPref = localStorage.getItem('everblock_gfx') || (EB.phone && EB.phone.on ? 'low' : 'high'); // v5: phones default to low
      if (EB.phone && EB.phone.on) r.setPixelRatio(1);
      this.applyGfx(this.gfxPref, true);
      this.raycaster = new THREE.Raycaster();
      // v3: a fixed pool of point lights reassigned to the nearest lanterns (+1 player torch) so shaders never recompile
      this.lampLights = [];
      for (let i = 0; i < 4; i++) { const L = new THREE.PointLight(i === 3 ? 0xffb060 : 0xffc070, 0, i === 3 ? 11 : 13, 1.6); this.lampLights.push(L); }
      this.lightsPref = localStorage.getItem('everblock_lights'); // '1' forced on, '0' forced off, null = auto
      this.setLights(this.lightsPref === '1'); // auto mode starts off and switches on only if the frame rate can afford it
      this.perf = { t: 0, n: 0 };
      window.addEventListener('resize', () => { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); r.setSize(window.innerWidth, window.innerHeight); });
    }

    // ---------- startup ----------
    start(newChar) {
      $('title').classList.add('hidden');
      $('loading').classList.remove('hidden');
      $('loadingSub').textContent = 'Generating the world of Everblock...';
      setTimeout(() => {
        try { this._start(newChar); } catch (e) { console.error(e); $('loadingSub').textContent = 'Error: ' + e.message; }
      }, 60);
    }
    _start(newChar) {
      const save = newChar ? null : this.net ? this.net.save : EB.loadSave();
      this.seed = newChar ? newChar.seed : save.seed;
      this.initThree();
      let zone = 'everblock', pl;
      if (save) {
        zone = save.zone || 'everblock';
        this.zoneEdits = save.zoneEdits || { everblock: save.edits || {} };
        this.otherCorpses = (save.corpses || []).map((c) => Object.assign({ zone: 'everblock' }, c));
        this.quests = save.quests || {};
        this.questSteps = save.questSteps || {};
        this.dayT = save.dayT || 0.3;
      }
      if (newChar) {
        pl = new Player(Object.assign({}, newChar));
        this.player = pl;
        for (const id of CLASSES[pl.cls].startItems) pl.equip[ITEMS[id].slot] = { id };
        this.addItem('bread', 3, true); this.addItem('healing_potion', 1, true);
        pl.hp = pl.maxHp; pl.mana = pl.maxMana;
      } else {
        pl = new Player(save.char);
        this.player = pl;
      }
      this.pmodel = buildModel(pl.modelOpts());
      this.scene.add(this.pmodel.group);
      this._zoneVia = 'init'; this.loadZone(zone, null);
      if (newChar || !pl.bind) { pl.bind = Object.assign({ zone: 'everblock' }, this.world.bind); }
      if (!pl.bind.zone) pl.bind.zone = 'everblock';
      if (newChar) pl.pos.set(this.world.bind.x, this.world.bind.y, this.world.bind.z);
      else if (save.char.hp <= 0) {
        if (pl.bind.zone !== zone) this.loadZone(pl.bind.zone, null);
        pl.pos.set(pl.bind.x, pl.bind.y, pl.bind.z); pl.hp = Math.ceil(pl.maxHp * 0.5);
      }
      pl.hp = Math.min(pl.hp, pl.maxHp); pl.mana = Math.min(pl.mana, pl.maxMana);
      if (save && save.mercs) for (const md of save.mercs) this.addMerc(md.role, md, true);
      this.world.updateChunks(pl.pos.x, pl.pos.z, 3, 999);
      this.bindInput();
      this.buildCompass();
      this.rebuildHotbar();
      this.renderGems();
      this.renderGroup();
      this.renderQuests();
      $('loading').classList.add('hidden');
      $('hud').classList.remove('hidden');
      if (EB.phone && EB.phone.bindGame) EB.phone.bindGame(this); // v5c: phone controls on every entry path (new character + Enter World)
      this.updateClickPrompt();
      ui.log('Welcome to Everblock!', 'ding');
      ui.log(`Town Crier: Greetings, ${pl.name}. New in v6: multiplayer! Choose Play Online on the start screen to join an Everblock server (anyone can host one; see SERVER.md) and hunt, chat and group with other players. From v5: the Sunscorched Expanse (levels 15-25, north through the Frostfang pass) with the Great Pyramid and the Tomb of Ankhet-Ra, level cap 25 with new spells for every class, pet commands (P or /pet), faction standing (/faction), smarter monsters that heal, flee and bring friends, rare named spawns, and Phone Mode with touch controls. Press ? for help.`, 'help');
      if (false) ui.log(`Town Crier: Greetings, ${pl.name}. New in v4: detailed, fully animated character and monster models with visible gear and spell effects (/gfx low|high to change quality). From v3: five new classes, the spellbook (K), merc stances and gear, and The Warden's Legacy quest (hail Soul-Notary Kerra). Press ? for help.`, 'help');
      if (newChar) ui.log(`Guild Coach Aldric says: "Welcome, young ${RACES[pl.race].name.toLowerCase()}. Go bully the rats and snakes outside the walls. Come back when you have grown, and stretch first."`, 'say');
      else ui.log(`Your character has been loaded. You are in ${this.world.zoneName}.`, 'sys');
      if (this.net) this.net.started();
      this.last = performance.now();
      this.save();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- zones ----------
    loadZone(zoneId, arrive) {
      const pl = this.player;
      if (this.world) {
        this.zoneEdits[this.world.zoneId] = this.world.edits;
        for (const m of this.mobs) m.removeFrom(this.scene);
        for (const n of this.npcs) n.removeFrom(this.scene);
        for (const c of this.pcorpses) { this.otherCorpses.push(c.toSave()); c.removeFrom(this.scene); }
        for (const zm of this.zoneMeshes) { this.scene.remove(zm); zm.geometry.dispose(); zm.material.dispose(); }
        this.world.dispose();
      }
      if (this.target) this.setTarget(null);
      this.mobs = []; this.npcs = []; this.pcorpses = []; this.slots = []; this.zoneMeshes = [];
      this.target = null; this.lootCorpse = null; this.merchant = null; this.lastZone = '';
      if (this.windows) this.closeAll();
      const world = (this.world = new EB.World(this.seed, this.scene, zoneId));
      world.generate();
      if (this.net) { world.applyEdits(this.net.editsFor(zoneId)); this.net.clearZone(); } // v6: the server's shared block edits
      else if (this.zoneEdits[zoneId]) world.applyEdits(this.zoneEdits[zoneId]);
      for (const d of world.npcs) { const n = new NPC(d); n.addTo(this.scene); this.npcs.push(n); }
      for (const def of world.spawns) for (let i = 0; i < def.count; i++) this.slots.push({ def, mob: null, respawnAt: 0 });
      const keep = [];
      for (const c of this.otherCorpses) {
        if ((c.zone || 'everblock') === zoneId) { const pc = new PlayerCorpse(pl, c); pc.addTo(this.scene); this.pcorpses.push(pc); }
        else keep.push(c);
      }
      this.otherCorpses = keep;
      for (const zl of world.zoneLines) {
        const wdt = zl.x1 - zl.x0, cx = (zl.x0 + zl.x1) / 2, gy = world.surfaceY(cx, zl.at);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(wdt, 7), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }));
        m.position.set(cx, gy + 3.5, zl.at); m.renderOrder = 3;
        this.scene.add(m); this.zoneMeshes.push(m);
      }
      if (arrive) { pl.pos.set(arrive.x, world.surfaceY(arrive.x, arrive.z), arrive.z); pl.yaw = arrive.yaw; pl.vel.set(0, 0, 0); }
      for (const m of this.mercs) { m.pos.set(pl.pos.x + 1.2, pl.pos.y + 0.3, pl.pos.z + 1.2); m.nav.reset(); m.casting = null; }
      this.updateSpawns(true);
      world.updateChunks(pl.pos.x, pl.pos.z, 3, 999);
      if (this.net) this.net.zoneLoaded(zoneId, this._zoneVia || 'bind');
      this._zoneVia = null;
    }
    changeZone(zl) {
      if (this.zoning) return;
      this.zoning = true;
      const pl = this.player;
      pl.autoAttack = false; pl.casting = null; $('castBar').classList.add('hidden');
      const fade = $('zoneFade');
      fade.querySelector('div').textContent = 'LOADING, PLEASE GO MAKE A SANDWICH...';
      fade.classList.add('on');
      setTimeout(() => {
        try {
          this._zoneVia = 'line'; this.loadZone(zl.to, zl.arrive);
          this.log(`You wander into ${this.world.zoneName}.`, 'ding');
          ui.center(this.world.zoneName, 'Zone', 2.5);
          this.save();
        } catch (e) { console.error(e); }
        setTimeout(() => { fade.classList.remove('on'); this.zoning = false; }, 250);
      }, 450);
    }
    toBind() {
      const pl = this.player, b = pl.bind;
      if (b.zone && b.zone !== this.world.zoneId) { this._zoneVia = 'bind'; this.loadZone(b.zone, null); this.log(`You wander into ${this.world.zoneName}.`, 'sys'); }
      pl.pos.set(b.x, b.y, b.z); pl.vel.set(0, 0, 0);
      for (const m of this.mercs) { m.pos.set(pl.pos.x + 1.2, pl.pos.y + 0.3, pl.pos.z + 1.2); m.nav.reset(); }
    }

    // ---------- save ----------
    save(manual) {
      if (!this.player || !this.world) return;
      const zoneEdits = Object.assign({}, this.zoneEdits, { [this.world.zoneId]: this.world.edits });
      let n = 0; for (const k in zoneEdits) n += Object.keys(zoneEdits[k]).length;
      const data = { v: 3, seed: this.seed, zone: this.world.zoneId, char: this.player.toSave(), zoneEdits: n < 20000 ? zoneEdits : {},
        corpses: this.pcorpses.map((c) => c.toSave()).concat(this.otherCorpses), mercs: this.mercs.map((m) => m.toSave()), quests: this.quests, questSteps: this.questSteps, dayT: this.dayT };
      if (!this.player.alive) data.char.hp = 0;
      if (this.net) { data.zoneEdits = {}; this.net.sendSave(data, manual); if (manual) ui.log('Your character has been saved to the server.', 'sys'); return; }
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); if (manual) ui.log('Your character has been saved.', 'sys'); }
      catch (e) { ui.log('Save failed: ' + e.message, 'death'); }
    }

    log(m, t) { ui.log(m, t); }
    throttled(key, sec, m, t) { if ((this.msgThrottle[key] || 0) > this.time) return; this.msgThrottle[key] = this.time + sec; ui.log(m, t); }

    // ---------- spawns ----------
    updateSpawns(initial) {
      if (this.net) return; // v6: the server spawns monsters
      for (const s of this.slots) {
        if (s.mob && s.mob.alive) continue;
        if (this.time < s.respawnAt) continue;
        const def = s.def;
        let type = def.type;
        // placeholder spawns: a rare named may pop instead of the PH, but only one of each named is ever up
        if (def.alt && Math.random() < def.altChance && !this.mobs.some((m) => m.alive && m.type === def.alt)) type = def.alt;
        let x = def.x + (Math.random() * 2 - 1) * def.radius * 0.6, z = def.z + (Math.random() * 2 - 1) * def.radius * 0.6;
        let y = def.y != null ? this.world.floorBelow(x, def.y + 1, z) : this.world.surfaceY(x, z);
        if (def.y == null && this.world.isWater(x, y, z)) { x = def.x; z = def.z; y = this.world.surfaceY(x, z); }
        if (!initial && this.player.alive && Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 6) continue;
        const m = new Mob(type, s, x, y, z, def.lvl);
        m.refreshPlate(this);
        m.addTo(this.scene); m.syncModel();
        this.mobs.push(m);
        s.mob = m;
        if (m.def.named && !initial && this.player.pos.distanceTo(m.pos) < 90) this.log(`${m.name} shouts: "You will all fall before me!"`, 'shout');
      }
    }
    removeEntity(e) {
      e.removeFrom(this.scene); if (e.model) EB.models.dispose(e.model);
      if (e.kind === 'mob') { const i = this.mobs.indexOf(e); if (i >= 0) this.mobs.splice(i, 1); }
      if (e.kind === 'pcorpse') { const i = this.pcorpses.indexOf(e); if (i >= 0) this.pcorpses.splice(i, 1); }
      if (this.target === e) this.setTarget(null);
      if (this.lootCorpse === e) { this.lootCorpse = null; this.closeWin('lootWin'); }
    }

    // ---------- input ----------
    bindInput() {
      const cv = this.renderer.domElement;
      document.addEventListener('keydown', (e) => this.onKey(e, true));
      document.addEventListener('keyup', (e) => this.onKey(e, false));
      cv.addEventListener('mousedown', (e) => this.onMouseDown(e));
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== cv) return;
        this.player.yaw -= e.movementX * 0.0025;
        this.player.pitch = U.clamp(this.player.pitch - e.movementY * 0.0025, -1.5, 1.5);
      });
      cv.addEventListener('wheel', (e) => {
        this.camDist = U.clamp(this.camDist + Math.sign(e.deltaY) * 0.8, 0, 14);
        if (this.camDist < 1.2) this.camDist = 0;
      }, { passive: true });
      document.addEventListener('pointerlockchange', () => this.updateClickPrompt());
      document.querySelectorAll('[data-close]').forEach((el) => (el.onclick = () => this.closeWin(el.dataset.close)));
      $('helpBtn').onclick = () => this.toggleWin('helpWin');
      document.querySelectorAll('#gfxBtns button').forEach((b) => { b.onclick = () => this.applyGfx(b.dataset.gfx); });
      this.applyGfx(this.gfxPref, true);
      $('btnLootAll').onclick = () => this.lootAll();
      $('chatInput').addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const v = e.target.value.trim(); e.target.value = ''; e.target.classList.add('hidden'); e.target.blur(); if (v) this.command(v); this.updateClickPrompt(); }
        if (e.key === 'Escape') { e.target.value = ''; e.target.classList.add('hidden'); e.target.blur(); }
      });
      window.addEventListener('beforeunload', () => this.save());
    }
    locked() { return document.pointerLockElement === this.renderer.domElement; }
    requestLock() { if (EB.phone && EB.phone.noLock && EB.phone.noLock()) return; try { const p = this.renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    updateClickPrompt() { $('clickToPlay').classList.toggle('hidden', this.locked() || this.windows.size > 0 || !this.player.alive || !!(EB.phone && (EB.phone.on || (EB.phone.noLock && EB.phone.noLock())))); }
    onKey(e, down) {
      if ($('hud').classList.contains('hidden')) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const k = e.code;
      if (k === 'Tab' || /^F([1-5]|10)$/.test(k) || k === 'Space') e.preventDefault();
      this.keys[k] = down;
      if (!down || e.repeat) return;
      EB.audio.unlock();
      const pl = this.player;
      if (k === 'Escape') { if (this.windows.size) this.closeAll(); else this.setTarget(null); return; }
      if ((k === 'Slash' && e.shiftKey) || k === 'F10') { this.toggleWin('helpWin'); return; }
      if (k === 'F1') { e.preventDefault(); this.setTarget(null); this.log('You target yourself.', 'sys'); return; }
      if (/^F[2-5]$/.test(k)) { e.preventDefault(); const m = this.mercs[+k.slice(1) - 2]; if (m && !m.dead) this.setTarget(m); return; }
      if (k === 'KeyK') { this.toggleWin('bookWin'); return; }
      if (k === 'KeyN') { this.showMap = !this.showMap; $('minimap').classList.toggle('hidden', !this.showMap); return; }
      if (k === 'Enter' || k === 'Slash') { const ci = $('chatInput'); ci.classList.remove('hidden'); if (k === 'Slash') ci.value = '/'; setTimeout(() => ci.focus(), 0); if (this.locked()) document.exitPointerLock(); e.preventDefault(); return; }
      if (k === 'KeyI') { this.toggleWin('invWin'); return; }
      if (k === 'KeyP') { this.toggleWin('petWin'); return; }
      if (k === 'KeyM' && e.shiftKey) { this.log(EB.audio.toggleMusic() ? 'Music on.' : 'Music off.', 'sys'); return; }
      if (k === 'KeyM') { this.log(EB.audio.toggle() ? 'Sound on.' : 'Sound off.', 'sys'); return; }
      if (!pl.alive) return;
      if (k === 'Tab') this.tabTarget(e.shiftKey);
      else if (k === 'KeyQ') this.toggleAuto();
      else if (k === 'KeyC') this.consider();
      else if (k === 'KeyX') this.toggleSit();
      else if (k === 'KeyE') this.interact();
      else if (k === 'KeyH') this.hail();
      else if (k === 'KeyV') this.camDist = this.camDist > 0 ? 0 : 5.5;
      else if (k === 'KeyB') { this.buildMode = !this.buildMode; this.log(this.buildMode ? 'Build mode ON: left click breaks, right click places, 1-9 selects a block.' : 'Build mode OFF.', 'help'); this.rebuildHotbar(); }
      else if (/^Digit[1-9]$/.test(k)) this.hotkey(+k.slice(5) - 1);
    }
    onMouseDown(e) {
      EB.audio.unlock();
      const pl = this.player;
      if (!pl || !pl.alive) return;
      if (this.locked()) {
        if (this.buildMode) { if (e.button === 0) this.breakBlock(); else if (e.button === 2) this.placeBlock(); return; }
        if (e.button === 0) { const hit = this.pickEntity(this.camera.position, this.camDir()); if (hit) this.setTarget(hit); }
        return;
      }
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.pickEntity(this.raycaster.ray.origin, this.raycaster.ray.direction);
      if (hit && e.button === 0) { this.setTarget(hit); return; }
      if (e.button === 0 && !(EB.phone && (EB.phone.on || (EB.phone.noLock && EB.phone.noLock())))) this.requestLock();
    }
    camDir() { const p = this.player; return new THREE.Vector3(Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(p.yaw) * Math.cos(p.pitch)); }
    eyePos() { return new THREE.Vector3(this.player.pos.x, this.player.pos.y + this.player.eyeH, this.player.pos.z); }
    pickEntity(origin, dir) {
      const blockHit = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 80);
      let best = null, bestT = blockHit ? blockHit.t + 0.3 : 80;
      const test = (e) => {
        const hw = Math.max(0.4, e.hw * 1.3);
        const mn = [e.pos.x - hw, e.pos.y, e.pos.z - hw], mx = [e.pos.x + hw, e.pos.y + Math.max(0.7, e.h), e.pos.z + hw];
        const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
        let t0 = 0, t1 = bestT;
        for (let i = 0; i < 3; i++) {
          if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return; continue; }
          let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
          if (a > b) { const t = a; a = b; b = t; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
          if (t0 > t1) return;
        }
        if (t0 < bestT) { bestT = t0; best = e; }
      };
      for (const m of this.mobs) test(m);
      for (const n of this.npcs) test(n);
      for (const c of this.pcorpses) test(c);
      for (const m of this.mercs) test(m);
      if (this.net) for (const e of this.net.pickables()) test(e); // v6: other players
      return best;
    }

    // ---------- windows ----------
    openWin(id) {
      this.windows.add(id); $(id).classList.remove('hidden');
      if (this.locked()) document.exitPointerLock();
      this.renderWin(id); this.updateClickPrompt();
    }
    closeWin(id) {
      const was = this.windows.has(id);
      this.windows.delete(id); $(id).classList.add('hidden'); ui.hideTip();
      if (id === 'lootWin' && was) this.onLootClosed();
      if (id === 'merchantWin') this.merchant = null;
      this.updateClickPrompt();
    }
    toggleWin(id) { if (this.windows.has(id)) this.closeWin(id); else this.openWin(id); }
    closeAll() { for (const id of Array.from(this.windows)) this.closeWin(id); }
    renderWin(id) {
      if (id === 'invWin') this.renderInv();
      else if (id === 'lootWin') this.renderLoot();
      else if (id === 'merchantWin') this.renderMerchant();
      else if (id === 'trainerWin') this.renderTrainer();
      else if (id === 'mercWin') this.renderMercWin();
      else if (id === 'bookWin') this.renderBook();
      else if (id === 'mercCfgWin') this.renderMercCfg();
      else if (id === 'petWin') this.renderPetWin();
    }

    // ---------- targeting ----------
    setTarget(e) {
      this.target = e;
      if (e && e.kind === 'mob' && e.alive) EB.audio.click();
      this.updateTargetWin();
    }
    tabTarget(rev) {
      const pl = this.player;
      const list = this.mobs.filter((m) => m.alive && m.pos.distanceTo(pl.pos) < 45).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos));
      if (!list.length) { this.log('There are no targets nearby.', 'sys'); return; }
      let i = list.indexOf(this.target);
      i = i < 0 ? 0 : (i + (rev ? -1 : 1) + list.length) % list.length;
      this.setTarget(list[i]);
    }
    // ---------- v5 factions ----------
    npcFaction(n) { return n.faction || { everblock: 'guards', frostfang: 'hollis', desert: 'sunward' }[this.world.zoneId] || 'guards'; }
    entFaction(e) { if (!e) return null; if (e.kind === 'npc') return this.npcFaction(e); if (e.kind === 'mob' && D.FACTIONS[e.def.faction]) return e.def.faction; return null; }
    standing(f) { const v = this.player.faction[f]; return v == null ? 0 : v; }
    // tracked-faction mobs only attack on sight when you are Hostile (KOS) or worse
    factionKOS(m) { const f = m.def.faction; if (!D.FACTIONS[f]) return true; return this.standing(f) < -750; }
    adjustFaction(f, delta, silent) {
      const pl = this.player; if (!D.FACTIONS[f] || !delta) return;
      const old = this.standing(f), nv = U.clamp(old + delta, -2000, 2000), name = D.FACTIONS[f].name;
      pl.faction[f] = nv;
      if (silent) return;
      if (nv === old) this.log(`Your reputation with ${name} is maxed out. They are as ${delta > 0 ? 'impressed' : 'unimpressed'} as they will ever be.`, 'faction');
      else this.log(delta > 0 ? `Your reputation with ${name} improved. They might even learn your name.` : `Your reputation with ${name} worsened. Someone is writing your name in a little book.`, 'faction');
      const a = D.standingOf(old).label, b = D.standingOf(nv).label;
      if (a !== b) this.log(`${name} now ${D.standingOf(nv).con}. (${b})`, 'faction');
    }
    factionHitsFor(m) { return (D.KILL_FACTION[m.def.faction] || []).concat(m.def.factionHits || []); }
    priceMult(npc) { return D.factionPriceMult(this.standing(this.npcFaction(npc))); }
    consider() {
      const t = this.target;
      if (!t) { this.log('Consider what, exactly? Pick a target first.', 'sys'); return; }
      if (t.kind === 'npc') {
        const st = D.standingOf(this.standing(this.npcFaction(t)));
        this.log(`${t.name} ${st.con} -- looks like it would use you as a mop!`, 'sys');
        return;
      }
      if (t.kind === 'merc' || t.kind === 'pc') { this.log(`${t.name} considers you a buddy.`, 'sys'); return; }
      if (t.kind !== 'mob' || !t.alive) { this.log('That is a corpse.', 'sys'); return; }
      const c = t.con(this), f = this.entFaction(t);
      const attitude = f ? D.standingOf(this.standing(f)).con : t.def.aggressive ? 'cracks its knuckles at you' : 'could not care less about you';
      this.log(`${U.cap(t.name)} ${attitude} -- ${CON_MSG[c]}`, 'sys');
      const last = $('chatLog').lastChild; if (last) last.style.color = CON_HEX[c];
    }
    hail() {
      const t = this.target, pl = this.player;
      if (this.net) this.net.chat(t ? `Hail, ${t.name}` : 'Hail'); // v6: everyone nearby hears it
      if (!t) { if (!this.net) this.log('You say: "Hail!"', 'say'); return; }
      if (!this.net) this.log(`You say: "Hail, ${t.name}!"`, 'say');
      if (t.kind === 'merc') { setTimeout(() => this.log(`${t.name} says: "${t.isPet ? 'Yes, boss?' : t.role === 'healer' ? 'I will keep you standing, ' + pl.name + '.' : 'Point me at something to hit!'}"`, 'say'), 400); return; }
      if (t.kind !== 'npc' || t.pos.distanceTo(pl.pos) > 20) return;
      if (this.questFor(t)) { setTimeout(() => this.openDialog(t), 300); return; }
      const lines = {
        quest: `Well met, ${pl.name}.`,
        liaison: `Looking for a sword arm or a healer, ${pl.name}? My mercenaries will follow you anywhere, for a price. (Press E to hire)`,
        merchant: `Welcome, ${pl.name}! Browse my wares? I buy anything you dig out of those critters, too. (Press E to trade)`,
        trainer: pl.level < 5 ? `Ah, ${pl.name}. Rats, snakes and spicy beetles roam outside our walls. Go get some reps in, and return to me when you have grown. (Press E to train)` : `You have grown strong, ${pl.name}. The Darkpaws gnolls to the west and the Forsaken Graveyard to the south will test you. The Sunken Crypt to the northeast... only the bravest return. (Press E to train)`,
        binder: t.name === 'Scout Hollis' ? `Careful out here, ${pl.name}. The orcs of the Frostfang Warcamp to the northwest raid us nightly, and the giants of Vorgath's keep to the north are worse. Press E and I'll bind your soul to this camp.` : `Greetings, ${pl.name}. Should you fall, your spirit will return to where it is bound. Press E and I shall bind your soul here.`,
        guard: ['Move along, citizen.', `Hail, ${pl.name}. Keep your eyes open, the Darkpaws gnolls have been seen near the west gate. Some say Flippy Darkpaws himself leads them.`, "I don't have time to chat. Gnolls, you know.", 'The undead of the Sunken Crypt grow restless at night.'][Math.floor(Math.random() * 4)],
      };
      const special = {
        'Sunpriestess Nefa': `The sun watches over all who walk the Expanse, ${pl.name}. Press E and I shall bind your soul to this outpost.`,
        'Trader Hamid': `Water, blades and potions, ${pl.name}! Friends of the Sunward Caravan pay less. (Press E to trade)`,
        'Fence Jabari': `Psst. The Sandreavers pay well for what they need... if they trust you. (Press E to trade)`,
        'Sunward Guard Tamit': `The Sandreavers hide in the rocks to the east. Their mystics mend their wounds - kill those first.`,
        'Sunward Guard Omari': `The Great Pyramid lies to the north. The dead there do not rest, and Pharaoh Ankhet-Ra still sits upon his throne.`,
      };
      if (this.world.zoneId === 'desert' && t.npcKind === 'guard' && !special[t.name]) special[t.name] = 'Keep your waterskin full and your blade sharp.';
      setTimeout(() => this.log(`${t.name} says: "${special[t.name] || lines[t.npcKind]}"`, 'say'), 400);
    }
    updateTargetWin() {
      const t = this.target;
      if (!t) { $('targetWin').classList.add('hidden'); this.ring.visible = false; return; }
      $('targetWin').classList.remove('hidden');
      let color = '#ffffff', name = t.name, info = '';
      if (t.kind === 'mob') {
        if (t.alive) { const f = this.entFaction(t); color = CON_HEX[t.con(this)]; info = `Level ${t.level}${t.def.named ? ' - Named' : ''} - ${t.state === 'chase' ? 'Hostile' : t.state === 'flee' ? 'Fleeing' : f ? D.standingOf(this.standing(f)).label : t.def.aggressive ? 'Hostile' : 'Meh'}`; }
        else { name = t.corpseName(); color = '#b0a080'; info = 'Press E to loot'; }
      } else if (t.kind === 'npc') { color = '#7fb0ff'; info = ({ merchant: 'Merchant - press E to trade', trainer: 'Guild Coach - press E to train', binder: 'Soul Notary - press E to bind', guard: 'Guard', quest: 'Quest giver - press E' }[t.npcKind] || '') + ' - ' + D.standingOf(this.standing(this.npcFaction(t))).label; }
      else if (t.kind === 'pcorpse') { color = '#ffcc66'; info = 'Your corpse - press E to loot'; }
      else if (t.kind === 'merc') { color = '#70ff70'; info = `Group member - Level ${t.level} ${t.role === 'healer' ? 'Cleric' : 'Warrior'} Mercenary`; }
      else if (t.kind === 'pc') { color = t.grouped ? '#70ff70' : '#9fd8ff'; info = `${t.grouped ? 'Group member - ' : 'Player - '}Level ${t.level} ${RACES[t.race].name} ${CLASSES[t.cls].name}`; }
      $('tName').textContent = name; $('tName').style.color = color;
      const hp = (t.kind === 'mob' && t.alive) || t.kind === 'merc' || t.kind === 'pc' ? t.hp / t.maxHp : t.kind === 'npc' ? 1 : 0;
      ui.bar('tHp', 'tHpT', hp * 100, 100, Math.max(0, Math.ceil(hp * 100)) + '%');
      $('tInfo').textContent = info;
      this.ring.material.color.set(color);
    }

    // ---------- combat ----------
    toggleAuto(force) {
      const pl = this.player;
      const on = force != null ? force : !pl.autoAttack;
      if (on && (!this.target || this.target.kind !== 'mob' || !this.target.alive)) { this.log('You need a target for that. Swinging at the air is not a strategy.', 'sys'); pl.autoAttack = false; return; }
      pl.autoAttack = on;
      if (on) { this.stand(); pl.swing = Math.max(pl.swing, 0.3); }
      this.log(on ? 'Auto-swing engaged. Flail away!' : 'Auto-swing off. Catch your breath.', 'sys');
    }
    facing(t) {
      const pl = this.player, f = pl.forward();
      const dx = t.pos.x - pl.pos.x, dz = t.pos.z - pl.pos.z, l = Math.hypot(dx, dz) || 1;
      return (f.x * dx + f.z * dz) / l > -0.2;
    }
    meleeReach(t) { return 2.3 + (t.hw || 0.3) + (RACES[this.player.race].scale > 1.2 ? 0.4 : 0) + (t.def && t.def.scale > 1.2 ? 0.6 : 0); }
    playerMelee(dt) {
      const pl = this.player, t = this.target;
      pl.swing -= dt;
      if (!pl.autoAttack) return;
      if (!t || t.kind !== 'mob' || !t.alive) { pl.autoAttack = false; return; }
      if (pl.swing > 0) return;
      const d = pl.pos.distanceTo(t.pos);
      if (d > this.meleeReach(t)) { this.throttled('far', 3, 'Your target is too far away. Your arms are not that long!', 'sys'); return; }
      if (!this.facing(t)) { this.throttled('face', 3, 'You need to face your target. It is rude to swing behind your back.', 'sys'); return; }
      const w = pl.weapon(), st = pl.stats();
      pl.swing = w.delay * (1 - Math.min(0.25, (st.DEX - 60) / 800 + pl.level / 200));
      this.pAttackAnim = 0.01; this.pAttackKind = null;
      EB.audio.swing();
      const hitChance = U.clamp(0.72 + (pl.level - t.level) * 0.05 + (st.DEX - 75) / 400, 0.3, 0.95);
      if (Math.random() > hitChance) { this.log(`You try to ${w.verb} ${t.name}, but whiff!`, 'miss'); if (t.state !== 'chase' && t.state !== 'flee') t.aggroOn(pl, this); return; }
      const dmg = this.meleeDamage(w, st);
      this.log(`You ${w.verb} ${t.name} for ${dmg} damage.`, 'melee');
      EB.audio.hit();
      this.damageMob(t, dmg, pl);
      if (t.alive && (pl.cls === 'warrior' || pl.cls === 'rogue') && pl.level >= 5 && Math.random() < 0.15 + pl.level * 0.01) {
        const d2 = this.meleeDamage(w, st);
        this.log(`You ${w.verb} ${t.name} for ${d2} damage.`, 'melee');
        this.damageMob(t, d2, pl);
      }
    }
    meleeDamage(w, st) {
      const pl = this.player;
      const strB = Math.floor(Math.max(0, st.STR - 60) / 12);
      const max = Math.max(2, Math.floor((w.dmg * 2 + strB) * CLASSES[pl.cls].dmgMult * (1 + pl.level / 12) * (1 + pl.buffSum('dmgPct') / 100)));
      return U.randInt(Math.max(1, Math.floor(max / 4)), max);
    }
    // v5: mob casters heal and buff their allies
    mobSupport(m, tg, s, type) {
      const near = this.player.pos.distanceTo(m.pos) < 50;
      if (type === 'heal') {
        const before = tg.hp; const amt = Array.isArray(s.amt) ? U.randInt(s.amt[0], s.amt[1]) : (s.amt || 0); tg.hp = Math.min(tg.maxHp, tg.hp + amt + Math.floor(tg.maxHp * 0.04)); const got = Math.round(tg.hp - before);
        EB.fx.heal(tg);
        if (near) this.log(tg === m ? `${U.cap(m.name)} glows with renewed vigor. (${s.name}, +${got})` : `${U.cap(tg.name)} is healed by ${m.name}'s ${s.name}. (+${got})`, 'other');
        if (tg === this.target) this.updateTargetWin();
      } else {
        if (s.ward) { tg.wardUntil = this.time + s.dur; tg.ward = s.ward; }
        if (s.haste) { tg.hasteUntil = this.time + s.dur; tg.haste = s.haste; }
        EB.fx.buff(tg, s.color || 0xffd070);
        if (near) this.log(`${U.cap(tg.name)} ${s.ward ? 'is surrounded by a shimmering ward' : 'moves with unnatural speed'}. (${s.name})`, 'other');
      }
      // heals/buffs on a fighting mob add hate to the healer from whoever the target is fighting
      for (const [e, v] of tg.hate) if (e !== m) m.addHate(e, 1);
    }
    damageMob(m, dmg, src) {
      if (!m.alive) return;
      if (this.net && m.net) { this.net.damage(m, dmg, src); if (m === this.target) this.updateTargetWin(); return; } // v6: the server applies damage, hate and kills
      if (dmg > 0 && this.time < (m.wardUntil || 0)) dmg = Math.max(1, Math.round(dmg * (1 - (m.ward || 0))));
      m.hp -= dmg; if (dmg > 0) EB.models.flinch(m.model);
      if (dmg > 0 && this.time < (m.mezUntil || 0)) { m.mezUntil = 0; this.log(`${U.cap(m.name)} snaps out of it, thanks to ${src === this.player ? 'you' : src.name}.`, 'spell'); }
      if (src === this.player || (src && src.kind === 'merc')) m.grpDamage += dmg;
      if (m.state !== 'chase' && m.state !== 'flee') m.aggroOn(src, this);
      m.addHate(src, dmg + 1);
      if (m.hp <= 0) this.killMob(m, src);
      if (m === this.target) this.updateTargetWin();
    }
    killMob(m, src) {
      const pl = this.player;
      const byPlayer = m.grpDamage >= m.maxHp * 0.5;
      if (src === pl) this.log(`You have defeated ${m.name}! It had it coming.`, 'melee');
      else if (pl.pos.distanceTo(m.pos) < 40) this.log(`${U.cap(m.name)} has been taken out by ${src.name}!`, 'other');
      m.die(this, src);
      if (byPlayer && pl.alive) {
        const c = conColor(pl.level, m.level);
        let xp = Math.floor(calc.xpForKill(m.level) * CON_XP[c] * (m.def.named ? 2 : 1));
        const grp = this.groupMembers().filter((g) => !g.isPet);
        if (grp.length > 1 && xp > 0) { // EQ-style split: group bonus, then shares weighted by level
          const total = xp * (1 + 0.15 * (grp.length - 1)), sumL = grp.reduce((a, g) => a + g.level, 0);
          xp = Math.floor(total * pl.level / sumL);
          this.gainXP(xp, true);
        } else if (xp > 0) this.gainXP(xp); else this.log('That kill taught you absolutely nothing.', 'other');
        this.questKillHook && this.questKillHook(m);
        for (const [f, d] of this.factionHitsFor(m)) this.adjustFaction(f, d);
      }
      if (this.target === m) { pl.autoAttack = false; this.updateTargetWin(); }
      if (pl.casting && pl.casting.target === m) this.interruptCast('Your target has died.');
    }
    questXP(n, id, step) { if (this.net) this.net.send({ t: 'qxp', q: id, step }); else this.gainXP(n); } // v6: the server grants quest XP once
    gainXP(n, party) {
      const pl = this.player;
      if (this.net && !this.net.xpOK) return; // v6: experience comes from the server
      if (pl.level >= D.MAX_LEVEL) return;
      pl.xp += n;
      this.log(party ? 'You and your party feel smarter. (shared XP)' : 'You feel a little smarter. (XP)', 'xp');
      let dinged = false;
      while (pl.level < D.MAX_LEVEL && pl.xp >= D.xpToNext(pl.level)) {
        pl.xp -= D.xpToNext(pl.level);
        const hpPct = pl.hp / pl.maxHp;
        pl.level++;
        pl.hp = Math.max(pl.hp, Math.ceil(pl.maxHp * hpPct));
        this.log(`DING! You are now level ${pl.level}. Your mom would be proud.`, 'ding');
        dinged = true;
      }
      if (dinged) {
        ui.center('DING!', `You are now level ${pl.level}. Your mom would be proud.`, 3);
        EB.fx.column(pl, 0xffe070);
        EB.audio.ding();
        const avail = Object.keys(SPELLS).filter((s) => { const L = SPELLS[s].classes[pl.cls]; return L && L <= pl.level && !pl.spells.includes(s); });
        if (avail.length) this.log(`Your Guild Coach has new tricks to teach you. (${avail.map((s) => SPELLS[s].name).join(', ')})`, 'help');
        for (const m of this.mobs) m.refreshPlate(this);
        this.updateTargetWin();
        this.save();
      }
    }
    mobAttack(m, t) {
      if (t === this.player) this.mobAttackPlayer(m);
      else if (t.kind === 'merc') this.mercTakeHit(m, t, null);
    }
    mercTakeHit(m, t, spellDmg) {
      if (t.dead) return;
      let dmg;
      if (spellDmg != null) dmg = spellDmg;
      else {
        const hitChance = U.clamp(0.62 + (m.level - t.level) * 0.05 - t.ac / 500, 0.2, 0.95);
        if (Math.random() > hitChance) { this.log(`${U.cap(m.name)} tries to ${m.def.verb} ${t.name}, but misses!`, 'other'); return; }
        dmg = Math.max(1, Math.round(U.randInt(1, m.maxHit) * (1 - Math.min(0.5, t.ac / (t.ac + 150)))));
        this.log(`${U.cap(m.name)} ${VERB3[m.def.verb] || m.def.verb + 's'} ${t.name} for ${dmg} damage.`, 'other');
      }
      t.hp -= dmg; EB.models.flinch(t.model);
      if (t.hp <= 0) this.mercDie(t, m);
    }
    mobSpell(m, t, sp) {
      if (Math.random() < 0.1) { if (t === this.player) this.log(`You shrug off ${sp.name}!`, 'spell'); return; }
      const dmg = U.randInt(sp.dmg[0], sp.dmg[1]);
      EB.fx.bolt(this.castHand(m), t, /frost|glacial/i.test(sp.name) ? 0x9ee8ff : 0xff8040, { size: 0.6, speed: 24 });
      if (t === this.player) {
        if (!this.player.alive) return;
        this.log(`${sp.name} smacks you for ${dmg} spell damage!`, 'hitme');
        EB.audio.hurt();
        this.damagePlayer(dmg, m);
        if (this.player.casting && !this.player.casting.skill && Math.random() < 0.35) this.interruptCast('Ouch! Your spell is interrupted.');
      } else if (t.kind === 'merc') { this.log(`${t.name} is struck by ${sp.name} for ${dmg} damage.`, 'other'); this.mercTakeHit(m, t, dmg); }
    }
    mobAttackPlayer(m) {
      const pl = this.player;
      if (!pl.alive) return;
      const st = pl.stats();
      const hitChance = U.clamp(0.62 + (m.level - pl.level) * 0.05 - pl.ac / 500, 0.2, 0.95);
      const dodge = U.clamp((st.AGI - 60) / 600 + pl.buffSum('dodge') / 100 + (pl.cls === 'rogue' ? 0.05 : 0), 0, 0.6);
      const verb = m.def.verb;
      if (Math.random() > hitChance) { this.log(`${U.cap(m.name)} tries to ${verb} you, but swings at air!`, 'miss'); return; }
      if (Math.random() < dodge) { this.log(`${U.cap(m.name)} tries to ${verb} you, but you dodge like a pro!`, 'miss'); return; }
      let dmg = U.randInt(1, m.maxHit);
      dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.5, pl.ac / (pl.ac + 150)))));
      if (pl.sitting) { dmg = Math.ceil(dmg * 1.5); this.stand(); }
      this.log(`${U.cap(m.name)} ${VERB3[verb] || verb + 's'} you for ${dmg} damage.`, 'hitme');
      EB.audio.hurt();
      this.damagePlayer(dmg, m);
      if (pl.casting && !pl.casting.skill && Math.random() < 0.2) this.interruptCast('Ouch! Your spell is interrupted.');
    }
    damagePlayer(dmg, src) {
      const pl = this.player;
      pl.hp -= dmg; if (dmg > 0 && this.pmodel) EB.models.flinch(this.pmodel);
      if (pl.hp <= 0) this.playerDie(src);
    }
    playerDie(src) {
      const pl = this.player;
      pl.hp = 0; pl.alive = false; pl.autoAttack = false; pl.casting = null; pl.sitting = false; pl.memorizing = null;
      $('castBar').classList.add('hidden');
      this.log(`You have been flattened by ${src ? src.name : 'something'}! Walk it off.`, 'death');
      EB.audio.death();
      const loss = Math.floor(D.xpToNext(pl.level) * 0.08);
      if (pl.xp > 0 && loss > 0) { pl.xp = Math.max(0, pl.xp - loss); this.log('You feel a little less experienced, like waking up from a nap that went too long.', 'death'); }
      const items = pl.inv.filter(Boolean);
      if (items.length || Object.keys(pl.equip).length || pl.coins) {
        const pc = new PlayerCorpse(pl, { zone: this.world.zoneId, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, coins: pl.coins, items, equip: Object.assign({}, pl.equip) });
        pc.addTo(this.scene); this.pcorpses.push(pc);
        pl.inv = new Array(24).fill(null); pl.equip = {}; pl.coins = 0;
      }
      for (const m of this.mobs) if (m.alive && (m.state === 'chase' || m.state === 'flee') && (m.hate.has(pl) || this.mercs.some((mc) => m.hate.has(mc)))) m.goHome();
      for (const mc of this.mercs) { mc.casting = null; if (!mc.dead) mc.hp = mc.maxHp; }
      this.closeAll();
      if (this.locked()) document.exitPointerLock();
      $('deathScreen').classList.remove('hidden');
      this.deathT = 5;
      this.updateClickPrompt();
      pl.buffs = [];
      if (this.net) this.net.send({ t: 'died' });
      this.save();
    }
    respawn() {
      const pl = this.player;
      pl.alive = true;
      this.toBind();
      pl.hp = Math.ceil(pl.maxHp * 0.5); pl.mana = Math.ceil(pl.maxMana * 0.3);
      $('deathScreen').classList.add('hidden');
      this.log('You return to your bind point. Your corpse lies where you fell: go and recover your belongings!', 'help');
      this.setTarget(null);
      this.rebuildHotbar();
      this.updateClickPrompt();
      this.save();
    }

    // ---------- sit / stand ----------
    toggleSit() { if (this.player.sitting) this.stand(); else this.sit(); }
    sit() {
      const pl = this.player;
      if (pl.casting) this.interruptCast('Ouch! Your spell is interrupted.');
      pl.sitting = true; pl.autoAttack = false;
      this.log('You sit down.', 'sys');
    }
    stand() { if (this.player.sitting) { this.player.sitting = false; this.log('You stand up.', 'sys'); if (this.player.memorizing) this.interruptMemorize(); } }

    // ---------- abilities & spells ----------
    hotbarList() { return this.player.hotbar; }
    hotkey(i) {
      if (this.buildMode) { if (i < D.BUILDABLE.length) { this.buildSel = i; this.rebuildHotbar(); } return; }
      const list = this.hotbarList();
      if (this.bookSel) { const s = this.bookSel; this.bookSel = null; if (i < 8) this.assignHotbar(i, s); if (this.windows.has('bookWin')) this.renderBook(); return; }
      if (list[i]) this.useAbility(list[i]);
    }
    useAbility(id) {
      const pl = this.player, sp = SPELLS[id];
      if (!pl.alive) return;
      if (pl.casting) { this.log('One spell at a time, show-off!', 'sys'); return; }
      if (pl.memorizing) { this.log('You are busy memorizing a spell.', 'sys'); return; }
      if (isSpell(id) && !pl.gems.includes(id)) { this.log(`You do not have ${sp.name} memorized. Open your spellbook (K) and memorize it into a spell gem.`, 'sys'); return; }
      const cd = (pl.cooldowns[id] || 0) - this.time;
      if (cd > 0) { this.log(`You can use ${sp.name} again in ${Math.ceil(cd)} seconds.`, 'sys'); return; }
      if (sp.mana > pl.mana) { this.log('Not enough mana. Try sitting down and thinking about your choices.', 'sys'); return; }
      const t = this.target;
      const needsTarget = ['nuke', 'root', 'skill', 'dot', 'snare', 'slow', 'mez', 'stun'].includes(sp.kind);
      if (needsTarget) {
        if (!t || t.kind !== 'mob' || !t.alive) { this.log('That spell needs a target. Pointing at the sky does not count.', 'sys'); return; }
        const melee = sp.kind === 'skill' && !sp.range;
        const range = melee ? this.meleeReach(t) : sp.range || 32;
        if (pl.pos.distanceTo(t.pos) > range) { this.log(melee ? 'Your target is too far away. Your arms are not that long!' : 'Your target is out of range. Scoot closer!', 'sys'); return; }
        if (!melee && !this.lineOfSight(pl, t)) { this.log('Your target is out of sight. Walls are rude like that.', 'sys'); return; }
      }
      let ft = needsTarget ? t : null;
      if (sp.friendly) { ft = t && (t.kind === 'merc' || t.kind === 'pc') && !t.dead && t.alive && t.pos.distanceTo(pl.pos) < 32 ? t : pl; }
      if (sp.kind === 'pet' && this.mercs.filter((m) => !m.isPet).length >= 2 && !this.mercs.some((m) => m.isPet)) { /* group of 4 max: player + 2 mercs + pet is fine */ }
      this.stand();
      if (sp.cast > 0) {
        pl.casting = { id, t: 0, total: sp.cast, target: ft, skill: !!sp.skill, startPos: pl.pos.clone() };
        if (!sp.skill) { this.log(`You start waving your hands around: ${sp.name}.`, 'spell'); EB.audio.cast(); }
        else this.log(`You begin to ${sp.name.toLowerCase()}.`, 'sys');
        $('castBar').classList.remove('hidden'); $('castName').textContent = sp.name; $('castFill').style.width = '0%';
      } else this.applyAbility(id, ft);
    }
    interruptCast(msg) {
      const pl = this.player;
      if (!pl.casting) return;
      pl.casting = null; $('castBar').classList.add('hidden');
      this.log(msg, 'spell');
    }
    updateCasting(dt, moving) {
      const pl = this.player, c = pl.casting;
      if (!c) return;
      if (moving || Math.hypot(pl.pos.x - c.startPos.x, pl.pos.z - c.startPos.z) > 0.25) { this.interruptCast(c.skill ? 'You stop what you are doing.' : 'Ouch! Your spell is interrupted.'); return; }
      c.t += dt;
      $('castFill').style.width = Math.min(100, (c.t / c.total) * 100) + '%';
      if (c.t >= c.total) {
        pl.casting = null; $('castBar').classList.add('hidden');
        const sp = SPELLS[c.id];
        if (!sp.skill) {
          const fz = calc.fizzle(pl.level, pl.castStat());
          if (Math.random() * 100 < fz) {
            this.log('Your spell fizzles like a wet firecracker!', 'spell'); EB.audio.fizzle();
            pl.mana -= Math.ceil(sp.mana / 2); pl.cooldowns[c.id] = this.time + 1;
            return;
          }
        }
        if (c.target && !c.target.alive) { this.log('Your target has died.', 'spell'); return; }
        this.applyAbility(c.id, c.target);
      }
    }
    applyAbility(id, t) {
      const pl = this.player, sp = SPELLS[id];
      pl.mana -= sp.mana;
      pl.cooldowns[id] = this.time + sp.recast;
      const L = pl.level;
      switch (sp.kind) {
        case 'heal': {
          const amt = U.randInt(sp.amt[0], sp.amt[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
          const tg = t && (t.kind === 'merc' || t.kind === 'pc') ? t : pl;
          const before = tg.hp; tg.hp = Math.min(tg.maxHp, tg.hp + amt);
          const got = Math.round(tg.hp - before);
          if (tg !== pl) this.log(`${tg.name} feels much better. (+${got} HP)`, 'spell');
          else this.log(id === 'bind_wound' ? `You bandage your wounds. (+${got} HP)` : sp.skill ? `Divine power washes over you. (+${got} HP)` : `You feel much better. (+${got} HP)`, 'spell');
          this.healAggro(pl, got);
          EB.fx.heal(tg);
          EB.audio.heal();
          break;
        }
        case 'groupheal': {
          for (const g of this.groupMembers()) {
            if (g.pos.distanceTo(pl.pos) > 40) continue;
            const amt = U.randInt(sp.amt[0], sp.amt[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
            const before = g.hp; g.hp = Math.min(g.maxHp, g.hp + amt);
            this.log(g === pl ? `You feel much better. (+${Math.round(g.hp - before)} HP)` : `${g.name} feels much better. (+${Math.round(g.hp - before)} HP)`, 'spell');
            this.healAggro(pl, g.hp - before);
            EB.fx.heal(g);
          }
          EB.audio.heal();
          break;
        }
        case 'nuke': {
          if (Math.random() < 0.05 + Math.max(0, t.level - L) * 0.04) { this.log(`${U.cap(t.name)} shrugs off your ${sp.name}!`, 'spell'); this.damageMob(t, 0, pl); break; }
          let dmg = U.randInt(sp.dmg[0], sp.dmg[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
          if (sp.undead && t.def.faction === 'undead') { dmg = Math.floor(dmg * sp.undead); this.log(`${U.cap(t.name)} is seared by holy fire!`, 'spell'); }
          const flavor = { cold: 'is blasted by frost', fire: 'is engulfed in flame', magic: 'is struck by divine power', life: 'staggers as its life is drained' }[sp.school] || 'is struck';
          this.log(`${U.cap(t.name)} ${flavor}.`, 'spell');
          this.log(`Your spell hits ${t.name} for ${dmg} damage.`, 'nonmelee');
          EB.audio.spell();
          this.spellFx(t, sp.school);
          this.damageMob(t, dmg, pl);
          if (sp.lifetap) { const before = pl.hp; pl.hp = Math.min(pl.maxHp, pl.hp + dmg); this.log(`You feel invigorated. (+${Math.round(pl.hp - before)} HP)`, 'spell'); }
          break;
        }
        case 'dot': {
          if (Math.random() < 0.05 + Math.max(0, t.level - L) * 0.04) { this.log(`${U.cap(t.name)} shrugs off your ${sp.name}!`, 'spell'); this.damageMob(t, 0, pl); break; }
          const per = U.randInt(sp.tick[0], sp.tick[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
          t.dots = (t.dots || []).filter((d) => d.id !== id);
          t.dots.push({ id, name: sp.name, src: pl, dmg: per, left: sp.dur, next: 3, school: sp.school });
          this.log(`${U.cap(t.name)} ${sp.school === 'fire' ? 'is covered in flames' : 'begins to sicken'}. (${sp.name})`, 'spell');
          this.spellFx(t, sp.school, 'dot'); EB.audio.spell();
          this.damageMob(t, 0, pl); t.addHate(pl, per * 2);
          break;
        }
        case 'snare': case 'slow': {
          if (Math.random() < 0.08 + Math.max(0, t.level - L) * 0.05) { this.log(`${U.cap(t.name)} shrugs off your ${sp.name}!`, 'spell'); this.damageMob(t, 0, pl); break; }
          if (sp.kind === 'snare') { t.snaredUntil = this.time + sp.dur; this.log(`${U.cap(t.name)} is ensnared.`, 'spell'); }
          else { t.slowedUntil = this.time + sp.dur; this.log(`${U.cap(t.name)} yawns. (slowed)`, 'spell'); }
          this.spellFx(t, 'magic'); EB.audio.spell();
          this.damageMob(t, 0, pl); t.addHate(pl, 10);
          break;
        }
        case 'mez': {
          if (t.def.named || t.level > sp.maxLvl) { this.log(`Your target is too powerful to be mesmer-eyed. It just stares back. Awkward.`, 'spell'); pl.cooldowns[id] = this.time + 1; break; }
          if (Math.random() < 0.05 + Math.max(0, t.level - L) * 0.04) { this.log(`${U.cap(t.name)} shrugs off your ${sp.name}!`, 'spell'); this.damageMob(t, 0, pl); break; }
          if (t.state !== 'chase' && t.state !== 'flee') t.aggroOn(pl, this, true);
          t.addHate(pl, 20); t.casting = null;
          t.mezUntil = this.time + sp.dur;
          this.log(`${U.cap(t.name)} is mesmer-eyed and staring into space.`, 'spell');
          this.spellFx(t, 'mind', 'mez'); EB.audio.spell();
          if (this.target === t && pl.autoAttack) { pl.autoAttack = false; this.log('Auto-swing off (your target is busy staring into space).', 'sys'); }
          break;
        }
        case 'stun': {
          const dmg = U.randInt(sp.dmg[0], sp.dmg[1]);
          this.log(`Your spell hits ${t.name} for ${dmg} damage.`, 'nonmelee');
          this.damageMob(t, dmg, pl);
          if (t.alive && !t.def.named) { t.stunUntil = this.time + sp.dur; t.casting = null; this.log(`${U.cap(t.name)} is stunned.`, 'spell'); }
          else if (t.alive) this.log(`${U.cap(t.name)} is unaffected by the stun.`, 'spell');
          this.spellFx(t, 'magic', 'stun'); EB.audio.hit();
          break;
        }
        case 'pet': {
          { const pet = this.summonPet(sp.petLvl); if (pet) EB.fx.summon(pet); } EB.audio.spell();
          break;
        }
        case 'buff': {
          const tg = sp.friendly && t && (t.kind === 'merc' || t.kind === 'pc') ? t : pl;
          tg.buffs = tg.buffs.filter((b) => b.id !== id);
          tg.buffs.push({ id, name: sp.name, left: sp.dur, buff: sp.buff });
          if (tg === pl) this.log(BUFF_MSG[id] || `You feel the effects of ${sp.name}.`, 'spell');
          else this.log(`${tg.name} is bolstered by your ${sp.name}.`, 'spell');
          EB.fx.buff(tg, EB.fx.SCHOOL[sp.school] || 0xfff0a0);
          EB.audio.heal();
          break;
        }
        case 'gate': {
          this.log('You mash the Panic Button. Whoosh, back to your bind point!', 'spell');
          for (const m of this.mobs) if (m.alive && m.hate.has(pl)) m.goHome();
          this.toBind();
          pl.autoAttack = false; EB.audio.spell();
          break;
        }
        case 'root': {
          t.rootedUntil = this.time + sp.dur;
          this.log(`${U.cap(t.name)} is stuck in place like gum on a boot.`, 'spell');
          this.damageMob(t, 0, pl); EB.audio.spell();
          break;
        }
        case 'skill': {
          if (sp.taunt) {
            if (t.state !== 'chase' && t.state !== 'flee') t.aggroOn(pl, this);
            let top = 0; for (const [, v] of t.hate) top = Math.max(top, v);
            t.hate.set(pl, top + 50 + L * 5); t.target = pl; t.hateT = 1.5;
            this.log(`You say something unforgivable about ${t.name}'s mother. It is now very focused on you! (taunt)`, 'melee'); this.pAttackAnim = 0.01; this.pAttackKind = 'bash';
            if (t.def.named && Math.random() < 0.25) this.log(`${U.cap(t.name)} is not impressed by your taunt.`, 'sys');
            break;
          }
          if (sp.backstab) {
            const w = pl.weapon();
            if (w.verb !== 'pierce') { this.log('You need something pointy to backpoke with!', 'sys'); pl.cooldowns[id] = this.time + 1; return; }
            const mf = new THREE.Vector3(Math.sin(t.yaw), 0, Math.cos(t.yaw));
            const toP = new THREE.Vector3(pl.pos.x - t.pos.x, 0, pl.pos.z - t.pos.z).normalize();
            if (mf.dot(toP) > -0.25) { this.log('Get behind your target first. Backpokes only work from the back.', 'sys'); pl.cooldowns[id] = this.time + 1; return; }
            const dmg = Math.floor((w.dmg * (2 + L / 3)) + U.randInt(1, 6 + L * 2));
            this.log(`You rudely backpoke ${t.name} for ${dmg} damage.`, 'melee');
            EB.audio.hit(); this.pAttackAnim = 0.01; this.pAttackKind = 'pierce';
            this.damageMob(t, dmg, pl);
          } else {
            if (Math.random() < (sp.archery ? 0.2 : 0.15)) { this.log(`You try to ${sp.verb} ${t.name}, but whiff!`, 'miss'); this.damageMob(t, 0, pl); break; }
            if (sp.archery) this.arrowFx(t);
            const dmg = U.randInt(sp.dmg[0], sp.dmg[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
            this.log(`You ${sp.verb} ${t.name} for ${dmg} damage.`, 'melee');
            EB.audio.hit(); this.pAttackAnim = 0.01; this.pAttackKind = sp.archery ? 'bow' : sp.verb === 'kick' ? 'kick' : sp.verb === 'bash' ? (this.pmodel.parts.shield ? 'bash' : 'crush') : null;
            this.damageMob(t, dmg, pl);
          }
          break;
        }
      }
      if (pl.hp > pl.maxHp) pl.hp = pl.maxHp;
    }
    arrowFx(t) {
      const pl = this.player, a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), new THREE.MeshBasicMaterial({ color: 0xd8c090, transparent: true, depthWrite: false }));
      a.position.set(pl.pos.x, pl.pos.y + pl.h * 0.75, pl.pos.z); a.lookAt(t.pos.x, t.pos.y + t.h * 0.6, t.pos.z);
      this.scene.add(a); this.fx = this.fx || [];
      this.fx.push({ m: a, life: 0.35, from: a.position.clone(), to: new THREE.Vector3(t.pos.x, t.pos.y + t.h * 0.6, t.pos.z), arrow: true });
    }
    // v4: particle spell effects (bolt from the caster's hand, impact burst, mez/stun stars, DoT clouds are per-frame)
    spellFx(t, school, kind, src) {
      src = src || this.player;
      const from = this.castHand(src);
      EB.fx.spell(src, from, t, school, kind || 'nuke');
    }
    castHand(e) {
      const M = e === this.player ? this.pmodel : e.model;
      if (M && M.parts && M.parts.handR && (e !== this.player || this.camDist > 0)) { M.group.updateMatrixWorld(true); return EB.models.handPos(M, 'R'); }
      return new THREE.Vector3(e.pos.x, e.pos.y + (e.h || 1.8) * 0.75, e.pos.z);
    }
    applyGfx(mode, silent) {
      const high = mode !== 'low';
      this.gfxPref = high ? 'high' : 'low';
      if (!silent) localStorage.setItem('everblock_gfx', this.gfxPref); // only explicit choices are remembered (phones default to low)
      EB.models.setQuality(high); EB.fx.setHigh(high);
      if (this.renderer) { this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1); this.renderer.setSize(window.innerWidth, window.innerHeight); }
      if (!silent) this.log(`Graphics quality: ${high ? 'HIGH (textured models, rim light, shadows, full particles)' : 'LOW (flat models, no blob shadows, fewer particles, 1x pixel ratio)'}.`, 'sys');
      const b = document.getElementById('gfxBtns'); if (b) for (const el of b.querySelectorAll('button')) el.classList.toggle('on', el.dataset.gfx === this.gfxPref);
    }
    lineOfSight(a, b) {
      const ay = a.pos.y + (a.eyeH || a.h * 0.8), by = b.pos.y + (b.eyeH || b.h * 0.8);
      const dx = b.pos.x - a.pos.x, dy = by - ay, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.5) return true;
      const hit = this.world.raycast(a.pos.x, ay, a.pos.z, dx / d, dy / d, dz / d, d, (bb) => BLOCKS[bb].opaque);
      return !hit;
    }

    // ---------- interaction / loot ----------
    interact() {
      const pl = this.player;
      let t = this.target;
      const near = (e) => e && e.pos.distanceTo(pl.pos) < 5;
      if (!(t && near(t) && (t.kind === 'npc' || t.kind === 'pcorpse' || (t.kind === 'mob' && !t.alive)))) {
        t = null; let bd = 5;
        for (const e of [...this.pcorpses, ...this.mobs.filter((m) => !m.alive), ...this.npcs.filter((n) => n.npcKind !== 'guard')]) {
          const d = e.pos.distanceTo(pl.pos);
          if (d < bd) { bd = d; t = e; }
        }
        if (!t) {
          if (this.target && (this.target.kind === 'npc' || !this.target.alive)) this.log('You are too far away to interact with that.', 'sys');
          else this.log('There is nothing here to interact with.', 'sys');
          return;
        }
        this.setTarget(t);
      }
      if (t.kind === 'pcorpse') return this.lootOwnCorpse(t);
      if (t.kind === 'mob') return this.openLoot(t);
      if (t.npcKind === 'merchant' && this.priceMult(t) == null) {
        const st = D.standingOf(this.standing(this.npcFaction(t)));
        this.log(`${t.name} ${st.con}. ${t.name} says: "I will not trade with the likes of you, ${pl.name}! Begone!"`, 'say');
        this.log(`(Your standing with ${D.FACTIONS[this.npcFaction(t)].name} is too low: ${st.label}.)`, 'faction');
        return;
      }
      if (t.npcKind === 'merchant') { this.merchant = t; this.log(`${t.name} says: "Take a look, ${pl.name}. Everything is priced to sell!${this.questFor(t) && this.quests[this.questFor(t)] !== 'done' ? ' And hail me if you want some work.' : ''}"`, 'say'); this.openWin('merchantWin'); }
      else if (t.npcKind === 'trainer') this.openWin('trainerWin');
      else if (t.npcKind === 'liaison') this.openWin('mercWin');
      else if ((t.npcKind === 'guard' || t.npcKind === 'quest') && this.questFor(t)) this.openDialog(t);
      else if (t.npcKind === 'quest') this.hail();
      else if (t.npcKind === 'binder') {
        pl.bind = { zone: this.world.zoneId, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z };
        this.log(`${t.name} says: "Soul notarized! When you die, you will pop back up right here. Sign here, and here."`, 'say');
        this.log('Your soul is now officially registered at this address.', 'spell'); EB.audio.heal(); this.save();
      } else if (t.npcKind === 'guard') this.hail();
    }
    openLoot(c) {
      const pl = this.player;
      if (this.net && c.net) { this.net.requestLoot(c); return; } // v6: the server holds the loot
      this.lootCorpse = c;
      if (c.loot.coins > 0) { pl.coins += c.loot.coins; this.log(`You pocket ${U.coinStr(c.loot.coins)} from ${c.corpseName()}.`, 'loot'); c.loot.coins = 0; EB.audio.loot(); }
      if (!c.loot.items.length) { this.log(`You find nothing else on ${c.corpseName()}.`, 'sys'); this.lootCorpse = null; this.removeEntity(c); return; }
      $('lootTitle').firstChild.textContent = `Loot: ${c.corpseName()} `;
      this.openWin('lootWin');
    }
    renderLoot() {
      const c = this.lootCorpse, g = $('lootGrid'); g.innerHTML = '';
      if (!c) return;
      c.loot.items.forEach((it, i) => {
        const el = document.createElement('div'); el.className = 'islot' + (ITEMS[it.id].rare ? ' rare' : '');
        el.innerHTML = ui.slotHTML(it);
        el.onclick = () => this.takeLoot(i);
        ui.tooltipFor(el, () => ui.itemTip(it.id));
        g.appendChild(el);
      });
      if (!c.loot.items.length) g.innerHTML = '<div class="sub">Empty.</div>';
    }
    takeLoot(i) {
      const c = this.lootCorpse; if (!c) return false;
      const it = c.loot.items[i];
      if (this.net && c.net) return this.net.takeLoot(c, i);
      if (!this.addItem(it.id, it.count)) return false;
      const I = ITEMS[it.id];
      this.log(`You yoink ${I.rare ? 'the' : /^[aeiou]/i.test(I.name) ? 'an' : 'a'} ${I.name} from ${c.corpseName()}!`, I.rare ? 'ding' : 'loot');
      EB.audio.loot();
      c.loot.items.splice(i, 1);
      ui.hideTip();
      if (!c.loot.items.length) this.closeWin('lootWin'); else this.renderLoot();
      if (this.windows.has('invWin')) this.renderInv();
      return true;
    }
    lootAll() { const c = this.lootCorpse; if (!c) return; if (this.net && c.net) { this.net.lootAllFrom(c); return; } while (this.lootCorpse && c.loot.items.length) { if (!this.takeLoot(0)) break; } }
    onLootClosed() {
      const c = this.lootCorpse; this.lootCorpse = null;
      if (this.net && c && c.net) this.net.send({ t: 'lootdone', id: c.id });
      if (c && c.kind === 'mob' && !c.loot.items.length && !c.loot.coins) this.removeEntity(c);
    }
    lootOwnCorpse(c) {
      const pl = this.player;
      for (const sl in c.loot.equip) { if (!pl.equip[sl]) pl.equip[sl] = c.loot.equip[sl]; else this.addItem(c.loot.equip[sl].id, 1, true); }
      for (const it of c.loot.items) this.addItem(it.id, it.count, true);
      pl.coins += c.loot.coins;
      this.log(`You have recovered your belongings from ${c.name}.`, 'loot');
      if (c.loot.coins) this.log(`You receive ${U.coinStr(c.loot.coins)} from your corpse.`, 'loot');
      EB.audio.loot();
      this.removeEntity(c);
      this.save();
    }

    // ---------- inventory ----------
    addItem(id, count, silent) {
      const pl = this.player, it = ITEMS[id];
      count = count || 1;
      if (it.stack) { const ex = pl.inv.find((s) => s && s.id === id); if (ex) { ex.count += count; this.questDirty = true; return true; } }
      const i = pl.inv.indexOf(null);
      if (i < 0) { if (!silent) this.log('Your inventory is full!', 'sys'); return false; }
      pl.inv[i] = { id, count };
      this.questDirty = true;
      return true;
    }
    renderInv() {
      const pl = this.player;
      const eg = $('equipGrid'); eg.innerHTML = '';
      for (const sl of EQUIP_SLOTS) {
        const el = document.createElement('div'); const item = pl.equip[sl];
        el.className = 'islot' + (item && ITEMS[item.id].rare ? ' rare' : '');
        el.innerHTML = ui.slotHTML(item, sl);
        if (item) { el.onclick = () => this.unequip(sl); ui.tooltipFor(el, () => ui.itemTip(item.id)); }
        eg.appendChild(el);
      }
      const bg = $('bagGrid'); bg.innerHTML = '';
      pl.inv.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'islot' + (item && ITEMS[item.id].rare ? ' rare' : '');
        el.innerHTML = ui.slotHTML(item);
        if (item) {
          el.onclick = () => this.useBagItem(i);
          el.oncontextmenu = (e) => { e.preventDefault(); this.sellItem(i); };
          ui.tooltipFor(el, () => ui.itemTip(item.id) + (this.merchant ? `<div style="color:#f0d070">Right-click to sell for ${U.coinShort(this.sellPrice(item.id) * item.count)}</div>` : ''));
        }
        bg.appendChild(el);
      });
      const st = pl.stats(), w = pl.weapon();
      $('statsBox').innerHTML = `<b>${pl.name}</b><br>Level ${pl.level} ${RACES[pl.race].name} ${CLASSES[pl.cls].name}<br>` +
        `HP: ${Math.ceil(pl.hp)} / ${pl.maxHp}<br>` + (pl.maxMana ? `Mana: ${Math.floor(pl.mana)} / ${pl.maxMana}<br>` : '') +
        `AC: ${pl.ac} &nbsp; ${w.name} (${w.dmg}/${Math.round(w.delay * 10)})<br>` +
        STAT_NAMES.map((n) => `${n}: <b>${st[n]}</b>`).join(' &nbsp; ') +
        `<br>XP: ${Math.floor((pl.xp / D.xpToNext(pl.level)) * 100)}% &nbsp; Played: ${Math.floor(pl.played / 60)}m`;
      $('coinBox').innerHTML = `Coin: ${U.coinStr(pl.coins)}`;
    }
    useBagItem(i) {
      const pl = this.player, item = pl.inv[i]; if (!item) return;
      const it = ITEMS[item.id];
      if (it.slot) {
        const old = pl.equip[it.slot];
        pl.equip[it.slot] = { id: item.id };
        pl.inv[i] = old ? { id: old.id, count: 1 } : null;
        this.log(`You equip the ${it.name}.`, 'sys');
      } else if (it.use) {
        if (it.use.heal) { pl.hp = Math.min(pl.maxHp, pl.hp + it.use.heal); this.log(`You use the ${it.name}. You feel better.`, 'spell'); EB.audio.heal(); }
        item.count--; if (item.count <= 0) pl.inv[i] = null;
      } else { this.log(`${it.name} cannot be used. Perhaps a merchant would buy it.`, 'sys'); return; }
      pl.hp = Math.min(pl.hp, pl.maxHp); pl.mana = Math.min(pl.mana, pl.maxMana);
      ui.hideTip(); this.renderInv();
    }
    unequip(sl) {
      const pl = this.player, item = pl.equip[sl]; if (!item) return;
      if (!this.addItem(item.id, 1)) return;
      delete pl.equip[sl];
      this.log(`You remove the ${ITEMS[item.id].name}.`, 'sys');
      pl.hp = Math.min(pl.hp, pl.maxHp); pl.mana = Math.min(pl.mana, pl.maxMana);
      ui.hideTip(); this.renderInv();
    }
    chaMod() { return (this.player.stats().CHA - 75) / 600; }
    fMult() { return (this.merchant && this.priceMult(this.merchant)) || 1; }
    buyPrice(id) { return Math.max(1, Math.round(ITEMS[id].value * (1.25 - this.chaMod()) * this.fMult())); }
    sellPrice(id) { return Math.max(1, Math.floor(ITEMS[id].value * (0.5 + this.chaMod() / 2) / this.fMult())); }
    renderMerchant() {
      const m = this.merchant; if (!m) return;
      $('merchTitle').firstChild.textContent = `${m.name} `;
      const f = this.npcFaction(m), st = D.standingOf(this.standing(f)), pm = this.fMult();
      const list = $('merchList'); list.innerHTML = `<div class="sub">Your coin: ${U.coinStr(this.player.coins)}</div><div class="sub fstand">${D.FACTIONS[f].name}: <b>${st.label}</b>${pm !== 1 ? ` (prices ${pm < 1 ? '-' : '+'}${Math.round(Math.abs(pm - 1) * 100)}%)` : ''}</div>`;
      for (const id of (D.STOCKS[m.stock] || MERCHANT_STOCK)) {
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span>${ITEMS[id].icon}</span><span class="n">${ITEMS[id].name}</span><span>${U.coinShort(this.buyPrice(id))}</span>`;
        const b = document.createElement('button'); b.textContent = 'Buy'; b.className = 'small';
        b.disabled = this.player.coins < this.buyPrice(id);
        b.onclick = () => this.buyItem(id);
        row.appendChild(b); ui.tooltipFor(row, () => ui.itemTip(id));
        list.appendChild(row);
      }
      // v5: sell list (touch friendly alternative to right-clicking bag items)
      const inv = this.player.inv.map((it, i) => [it, i]).filter(([it]) => it);
      if (inv.length) {
        const h = document.createElement('h4'); h.textContent = 'Sell your items'; h.className = 'sellHdr'; list.appendChild(h);
        for (const [it, i] of inv) {
          const I = ITEMS[it.id], row = document.createElement('div'); row.className = 'row sellRow';
          row.innerHTML = `<span>${I.icon || '•'}</span><span class="n">${I.name}${it.count > 1 ? ' x' + it.count : ''}</span><span>${U.coinShort(this.sellPrice(it.id) * it.count)}</span>`;
          const b = document.createElement('button'); b.textContent = 'Sell'; b.className = 'small'; b.onclick = () => this.sellItem(i);
          row.appendChild(b); list.appendChild(row);
        }
      }
    }
    buyItem(id) {
      const p = this.buyPrice(id);
      if (this.player.coins < p) { this.log("You can't afford that.", 'sys'); return; }
      if (!this.addItem(id, 1)) return;
      this.player.coins -= p;
      this.log(`You give ${U.coinStr(p)} to ${this.merchant.name}. You receive a ${ITEMS[id].name}.`, 'loot');
      EB.audio.loot(); this.renderMerchant(); if (this.windows.has('invWin')) this.renderInv();
    }
    sellItem(i) {
      if (!this.merchant) { this.log('You need to be trading with a merchant to sell items. (Open a merchant with E)', 'sys'); return; }
      const pl = this.player, item = pl.inv[i]; if (!item) return;
      const p = this.sellPrice(item.id) * item.count;
      pl.coins += p; pl.inv[i] = null;
      this.log(`You sold ${item.count > 1 ? item.count + ' ' : 'a '}${ITEMS[item.id].name} to ${this.merchant.name} for ${U.coinStr(p)}.`, 'loot');
      EB.audio.loot(); ui.hideTip(); this.renderInv(); this.renderMerchant();
    }
    trainCost(L) { return L <= 1 ? 0 : L * L * 12; }
    renderTrainer() {
      const pl = this.player, list = $('trainList');
      list.innerHTML = `<div class="sub">Guild Coach Aldric teaches ${CLASSES[pl.cls].name}s. Your coin: ${U.coinStr(pl.coins)}</div>`;
      const ids = Object.keys(SPELLS).filter((s) => SPELLS[s].classes[pl.cls]).sort((a, b) => SPELLS[a].classes[pl.cls] - SPELLS[b].classes[pl.cls]);
      for (const id of ids) {
        const sp = SPELLS[id], L = sp.classes[pl.cls];
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span style="width:50px">Lvl ${L}</span><span class="n"><b>${sp.name}</b> - ${sp.desc}${sp.mana ? ` (${sp.mana} mana)` : ''}</span>`;
        const b = document.createElement('button'); b.className = 'small';
        if (pl.spells.includes(id)) { b.textContent = 'Known'; b.disabled = true; }
        else { b.textContent = `Train ${U.coinShort(this.trainCost(L))}`; b.disabled = L > pl.level || pl.coins < this.trainCost(L); b.onclick = () => this.train(id); }
        row.appendChild(b); list.appendChild(row);
      }
    }
    train(id) {
      const pl = this.player, sp = SPELLS[id], c = this.trainCost(sp.classes[pl.cls]);
      if (pl.coins < c) return;
      pl.coins -= c; pl.spells.push(id);
      this.log(isSpell(id) ? `You copy ${sp.name} into your spellbook in your neatest handwriting.` : `You have learned ${sp.name}!`, 'spell');
      if (isSpell(id)) { const g = pl.gems.indexOf(null); if (g >= 0) { pl.gems[g] = id; this.log(`${sp.name} has been memorized into spell gem ${g + 1}.`, 'spell'); } else this.log('Your spell gems are full. Open your spellbook (K) to memorize it.', 'help'); }
      const hs = pl.hotbar.indexOf(null);
      if (hs >= 0) pl.hotbar[hs] = id; else this.log('Your hotbar is full. Use the spellbook (K) to rearrange it.', 'sys');
      EB.audio.ding(); this.rebuildHotbar(); this.renderGems(); this.renderTrainer(); this.save();
    }

    // ---------- group / mercenaries / pets ----------
    groupMembers() { return [this.player, ...this.mercs.filter((m) => !m.dead), ...(this.net ? this.net.groupEnts() : [])].filter((g) => g.alive); }
    groupFoe() {
      const pl = this.player, t = this.target;
      if (t && t.kind === 'mob' && t.alive && (pl.autoAttack || t.state === 'chase' || pl.casting) && t.pos.distanceTo(pl.pos) < 40 && !this.isMezzed(t)) return t;
      let best = null, bd = 35;
      for (const m of this.mobs) {
        if (!m.alive || m.state !== 'chase' || !m.target || this.isMezzed(m)) continue;
        if (m.target !== pl && m.target.kind !== 'merc' && !(m.target.kind === 'pc' && m.target.grouped)) continue;
        const d = m.pos.distanceTo(pl.pos);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    }
    isMezzed(m) { return this.time < (m.mezUntil || 0); }
    // stance-aware target selection for a merc / pet
    mercFoe(merc) {
      if (merc.stance === 'passive') return null;
      const foe = this.groupFoe();
      if (foe || merc.stance !== 'aggressive') return foe;
      const pl = this.player; let best = null, bd = 16;
      for (const m of this.mobs) {
        if (!m.alive || !m.def.aggressive || this.isMezzed(m)) continue;
        const c = m.con(this); if (c === 'grey' || c === 'green') continue;
        const d = m.pos.distanceTo(pl.pos);
        if (d < bd && Math.abs(m.pos.y - pl.pos.y) < 6) { bd = d; best = m; }
      }
      return best;
    }
    groupInCombat() {
      const grp = this.groupMembers();
      return this.mobs.some((m) => m.alive && (m.state === 'chase' || m.state === 'flee') && grp.some((g) => m.hate.has(g)));
    }
    healAggro(src, amt) {
      if (amt <= 0) return;
      const grp = this.groupMembers();
      for (const m of this.mobs) if (m.alive && m.state === 'chase' && grp.some((g) => m.hate.has(g))) m.addHate(src, amt * 0.5);
    }
    addMerc(role, saved, silent) {
      const m = new EB.Merc(role, this, saved);
      const pl = this.player;
      m.pos.set(pl.pos.x + (this.mercs.length % 2 ? -1.3 : 1.3), pl.pos.y + 0.2, pl.pos.z + 1.2);
      if (!m.dead) { m.addTo(this.scene); m.syncModel(); }
      this.mercs.push(m);
      if (!silent) {
        this.log(`${m.name} has joined your group.`, 'loot');
        if (!m.isPet) setTimeout(() => this.log(`${m.name} says: "${role === 'healer' ? `Lead on, ${pl.name}. I'll keep you breathing.` : `Aye, ${pl.name}! Show me who needs a beating.`}"`, 'say'), 500);
      }
      this.renderGroup();
      return m;
    }
    summonPet(petLvl) {
      const old = this.mercs.find((m) => m.isPet);
      if (old) { this.log(`${old.name} crumbles to dust.`, 'spell'); this.removeMercModel(old); }
      const pet = this.addMerc('pet', { petLvl }, true);
      this.log(`You summon ${pet.name}, a level ${petLvl} servant, from the grave.`, 'spell');
      this.log(`${pet.name} says: "Reporting for duty, boss. Bones and all."`, 'say');
      return pet;
    }
    hireMerc(role) {
      const pl = this.player, c = mercCost(role, pl.level), ex = this.mercs.find((m) => m.role === role);
      if (ex) { this.log(ex.dead ? `${ex.name} is dead. Revive them instead.` : 'That mercenary is already in your group.', 'sys'); return; }
      if (pl.coins < c) { this.log("You can't afford that mercenary.", 'sys'); return; }
      pl.coins -= c;
      this.log(`You pay ${U.coinStr(c)} to Recruiter Brenna.`, 'loot');
      this.addMerc(role);
      this.renderMercWin(); this.save();
    }
    reviveCost(m) { return Math.floor(mercCost(m.role, this.player.level) * 0.6); }
    reviveMerc(m) {
      const pl = this.player, c = this.reviveCost(m);
      if (!m.dead) return;
      if (this.groupInCombat()) { this.log('You cannot revive a mercenary while you are in combat.', 'sys'); return; }
      if (pl.coins < c) { this.log(`You need ${U.coinStr(c)} to revive ${m.name}.`, 'sys'); return; }
      pl.coins -= c;
      m.dead = false; m.hp = Math.ceil(m.maxHp * 0.5); m.mana = Math.ceil(m.maxMana * 0.3); m.casting = null; m.buffs = []; m.nav.reset();
      m.pos.set(pl.pos.x + 1.2, pl.pos.y + 0.2, pl.pos.z + 1.2);
      this.scene.add(m.model.group); this.scene.add(m.plate); m.syncModel();
      this.log(`You pay ${U.coinStr(c)}. ${m.name} has been revived!`, 'loot');
      this.log(`${m.name} says: "Thank you, ${pl.name}. I won't fall so easily again."`, 'say');
      EB.audio.heal(); this.renderGroup(); if (this.windows.has('mercWin')) this.renderMercWin(); this.save();
    }
    removeMercModel(m) {
      m.removeFrom(this.scene);
      const i = this.mercs.indexOf(m); if (i >= 0) this.mercs.splice(i, 1);
      for (const mob of this.mobs) mob.hate.delete(m);
      if (this.target === m) this.setTarget(null);
      if (this.cfgMerc === m) this.closeWin('mercCfgWin');
      this.renderGroup();
    }
    dismissMerc(m) {
      if (!m.isPet) for (const sl in m.equip) { if (!this.addItem(m.equip[sl].id, 1, true)) this.log(`${ITEMS[m.equip[sl].id].name} was lost (inventory full).`, 'sys'); }
      this.log(m.isPet ? `${m.name} crumbles to dust.` : `${m.name} has left the group.${Object.keys(m.equip).length ? ' They return the gear you gave them.' : ''}`, 'sys');
      this.removeMercModel(m); this.save();
    }
    mercDie(m, killer) {
      m.hp = 0; m.casting = null;
      this.log(`${m.name} has been taken out by ${killer ? killer.name : 'something'}!`, 'death');
      for (const mob of this.mobs) mob.hate.delete(m);
      if (m.isPet) { m.dead = true; this.removeMercModel(m); this.save(); return; }
      m.dead = true;
      this.scene.remove(m.model.group); this.scene.remove(m.plate);
      if (this.target === m) this.setTarget(null);
      this.log(`You can revive ${m.name} for ${U.coinStr(this.reviveCost(m))} from the group window once combat ends.`, 'help');
      this.renderGroup(); this.save();
    }
    renderMercWin() {
      const pl = this.player, list = $('mercList');
      list.innerHTML = `<div class="sub">Mercenaries match your level and follow you between zones. Click ⚙ in the group window to set their stance and give them gear. Your coin: ${U.coinStr(pl.coins)}</div>`;
      for (const role of Object.keys(MERCS)) {
        const M = MERCS[role], c = mercCost(role, pl.level), ex = this.mercs.find((m) => m.role === role);
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span class="n"><b>${M.name}</b> - Level ${pl.level} ${CLASSES[M.cls].name}<br><span style="color:#b0a080">${M.desc}</span></span><span>${U.coinShort(ex && ex.dead ? this.reviveCost(ex) : c)}</span>`;
        const b = document.createElement('button'); b.className = 'small';
        if (ex && ex.dead) { b.textContent = 'Revive'; b.disabled = pl.coins < this.reviveCost(ex); b.onclick = () => this.reviveMerc(ex); }
        else { b.textContent = ex ? 'In group' : 'Hire'; b.disabled = !!ex || pl.coins < c; b.onclick = () => this.hireMerc(role); }
        row.appendChild(b); list.appendChild(row);
      }
    }
    renderGroup() {
      this.renderPetBar();
      const gw = $('groupWin');
      if (!this.mercs.length && !(this.net && this.net.hasGroup())) { gw.classList.add('hidden'); return; }
      gw.classList.remove('hidden');
      gw.innerHTML = '<div class="wtitle" style="margin-bottom:2px">Group</div>';
      if (this.net) this.net.renderGroupRows(gw); // v6: other players in your group
      this.mercs.forEach((m, i) => {
        const row = document.createElement('div'); row.className = 'gmem' + (m.dead ? ' dead' : '');
        const head = `<div class="gname"><span class="fk">F${i + 2}</span> ${m.name}${m.isPet ? ' <span class="gpet">pet</span>' : ''} <span class="gcfg" title="Settings / give gear">⚙</span><span class="gx" title="Dismiss">✕</span></div>`;
        if (m.dead) row.innerHTML = head + `<div class="gdead">DEAD <button class="small grev">Revive ${U.coinShort(this.reviveCost(m))}</button></div>`;
        else row.innerHTML = head + `<div class="bar hp"><div class="fill"></div><span></span></div>` + (m.role === 'healer' ? '<div class="bar mana"><div class="fill"></div><span></span></div>' : '') + `<div class="gstance">${m.stance}${m.role === 'healer' ? ` · heal &lt;${Math.round(m.healAt * 100)}%` : ''}</div>`;
        row.onclick = (e) => {
          const c = e.target.classList;
          if (c.contains('gx')) this.dismissMerc(m);
          else if (c.contains('gcfg')) this.openMercCfg(m);
          else if (c.contains('grev')) this.reviveMerc(m);
          else if (!m.dead) this.setTarget(m);
        };
        gw.appendChild(row);
        m.gRow = row;
      });
    }
    updateGroupBars() {
      if (this.net) this.net.updateGroupBars();
      for (const m of this.mercs) {
        if (!m.gRow || m.dead) continue;
        const bars = m.gRow.querySelectorAll('.bar'); if (!bars.length) continue;
        const hp = U.clamp(m.hp / m.maxHp, 0, 1);
        bars[0].firstChild.style.width = hp * 100 + '%'; bars[0].lastChild.textContent = `${Math.ceil(m.hp)} / ${m.maxHp}`;
        if (bars[1]) { bars[1].firstChild.style.width = U.clamp(m.mana / m.maxMana, 0, 1) * 100 + '%'; bars[1].lastChild.textContent = `${Math.floor(m.mana)} / ${m.maxMana}`; }
        m.gRow.classList.toggle('tgt', this.target === m);
        m.gRow.querySelector('.gname').style.color = m.casting ? '#c89aff' : '';
      }
    }
    // ---- merc settings & trade ----
    openMercCfg(m) { this.cfgMerc = m; this.openWin('mercCfgWin'); }
    renderMercCfg() {
      const m = this.cfgMerc, pl = this.player; if (!m) return;
      $('mcfgTitle').firstChild.textContent = `${m.name} `;
      const box = $('mcfgBody');
      let h = `<div class="sub">Level ${m.level} ${m.isPet ? 'pet' : CLASSES[m.cls].name} &nbsp; HP ${Math.ceil(m.hp)}/${m.maxHp}${m.maxMana ? ` &nbsp; Mana ${Math.floor(m.mana)}/${m.maxMana}` : ''} &nbsp; AC ${m.ac}${m.dead ? ' &nbsp; <b style="color:#ff6050">DEAD</b>' : ''}</div>`;
      h += '<h4>Stance</h4><div class="stanceRow">' + EB.Merc.STANCES.map((s) => `<button class="small stance${m.stance === s ? ' sel' : ''}" data-st="${s}">${U.cap(s)}</button>`).join('') + '</div>';
      h += '<div class="sub">Passive: follow only' + (m.role === 'healer' ? ' (still heals)' : '') + '. Balanced: assist when you engage or the group is attacked. Aggressive: also attack nearby hostile creatures on sight.</div>';
      if (m.role === 'healer') h += `<h4>Heal threshold: <span id="healAtV">${Math.round(m.healAt * 100)}%</span></h4><input type="range" id="healAt" min="20" max="95" step="5" value="${Math.round(m.healAt * 100)}" style="width:100%">`;
      if (!m.isPet) {
        h += '<h4>Equipment (click to take back)</h4><div id="mcfgEquip" class="mequip"></div>';
        h += '<h4>Give from your bags</h4><div id="mcfgGive" class="mgive"></div>';
      }
      box.innerHTML = h;
      box.querySelectorAll('.stance').forEach((b) => (b.onclick = () => { m.stance = b.dataset.st; this.log(`${m.name} is now ${m.stance}.`, 'sys'); m.nav.reset(); this.renderMercCfg(); this.renderGroup(); this.save(); }));
      const r = $('healAt');
      if (r) { r.oninput = () => { m.healAt = +r.value / 100; $('healAtV').textContent = r.value + '%'; }; r.onchange = () => { this.renderGroup(); this.save(); }; }
      if (m.isPet) return;
      const eq = $('mcfgEquip');
      for (const sl of EQUIP_SLOTS) {
        const it = m.equip[sl], el = document.createElement('div');
        el.className = 'islot' + (it && ITEMS[it.id].rare ? ' rare' : '');
        el.innerHTML = ui.slotHTML(it, sl);
        if (it) { el.onclick = () => this.takeFromMerc(m, sl); ui.tooltipFor(el, () => ui.itemTip(it.id)); }
        eq.appendChild(el);
      }
      const gv = $('mcfgGive'); let any = false;
      pl.inv.forEach((item, i) => {
        if (!item || !ITEMS[item.id].slot) return; any = true;
        const el = document.createElement('div'); el.className = 'row';
        const I = ITEMS[item.id];
        el.innerHTML = `<span>${I.icon}</span><span class="n">${I.name} <span style="color:#b0a080">(${I.slot})</span></span>`;
        const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Give'; b.disabled = m.dead;
        b.onclick = () => this.giveToMerc(m, i);
        el.appendChild(b); ui.tooltipFor(el, () => ui.itemTip(item.id)); gv.appendChild(el);
      });
      if (!any) gv.innerHTML = '<div class="sub">You have no equippable items in your bags.</div>';
    }
    giveToMerc(m, i) {
      const pl = this.player, item = pl.inv[i]; if (!item || m.dead) return;
      const I = ITEMS[item.id]; if (!I.slot) return;
      const hpPct = m.hp / m.maxHp, old = m.equip[I.slot];
      m.equip[I.slot] = { id: item.id };
      item.count--; if (item.count <= 0) pl.inv[i] = null;
      if (old) this.addItem(old.id, 1, true);
      m.hp = Math.ceil(m.maxHp * hpPct); m.mana = Math.min(m.mana, m.maxMana);
      this.log(`You give ${I.name} to ${m.name}.${old ? ` ${m.name} hands back the ${ITEMS[old.id].name}.` : ''}`, 'loot');
      this.log(`${m.name} says: "My thanks, ${pl.name}. This will serve me well."`, 'say');
      EB.audio.loot(); ui.hideTip(); this.renderMercCfg(); if (this.windows.has('invWin')) this.renderInv(); this.save();
    }
    takeFromMerc(m, sl) {
      const it = m.equip[sl]; if (!it) return;
      if (!this.addItem(it.id, 1)) return;
      const hpPct = m.hp / m.maxHp;
      delete m.equip[sl];
      m.hp = Math.min(m.maxHp, Math.ceil(m.maxHp * hpPct)); m.mana = Math.min(m.mana, m.maxMana);
      this.log(`${m.name} hands you the ${ITEMS[it.id].name}.`, 'loot');
      ui.hideTip(); this.renderMercCfg(); this.save();
    }

    // ---------- quests (single hand-ins and multi-step chains) ----------
    questStep(id) { return this.questSteps[id] || 0; }
    questGiver(id) { const q = QUESTS[id]; if (!q.chain) return q.giver; const st = this.quests[id]; return q.steps[st === 'done' ? q.steps.length - 1 : this.questStep(id)].giver; }
    questNeeds(id) { const q = QUESTS[id]; return q.chain ? q.steps[this.questStep(id)].items : [[q.item, q.count]]; }
    questHasAll(id) { return this.questNeeds(id).every(([it, n]) => this.countItem(it) >= n); }
    questsFor(npc) { return Object.keys(QUESTS).filter((id) => this.questGiver(id) === npc.name && !(QUESTS[id].chain && this.quests[id] === 'done')); }
    questFor(npc) {
      const ids = this.questsFor(npc);
      return ids.find((id) => this.quests[id] === 'active' && this.questHasAll(id)) || ids.find((id) => this.quests[id] === 'active') || ids.find((id) => !this.quests[id]) || ids[0] || null;
    }
    countItem(id) { let n = 0; for (const s of this.player.inv) if (s && s.id === id) n += s.count; return n; }
    removeItems(id, n) {
      const inv = this.player.inv;
      for (let i = 0; i < inv.length && n > 0; i++) { const s = inv[i]; if (!s || s.id !== id) continue; const k = Math.min(n, s.count); s.count -= k; n -= k; if (s.count <= 0) inv[i] = null; }
    }
    needStr(id) { return this.questNeeds(id).map(([it, n]) => `${ITEMS[it].name} ${Math.min(this.countItem(it), n)}/${n}`).join(', '); }
    openDialog(npc) {
      const ids = this.questsFor(npc); if (!ids.length) return;
      $('dlgTitle').firstChild.textContent = `${npc.name} `;
      const btns = $('dlgBtns'); btns.innerHTML = '';
      const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; btns.appendChild(b); };
      let html = '', said = '';
      for (const id of ids) {
        const q = QUESTS[id], st = this.quests[id], step = q.chain ? q.steps[this.questStep(id)] : q;
        const title = q.chain ? `${q.name} <span class="qstep">(part ${this.questStep(id) + 1} of ${q.steps.length})</span>` : q.name;
        let text;
        if (!st) { text = step.offer; said = said || step.offer; btn(`Accept: ${q.name}`, () => this.acceptQuest(id)); }
        else if (st === 'active' && this.questHasAll(id)) {
          text = `${step.offer}<br><br><i>You have everything: ${this.needStr(id)}</i>`; said = said || 'You have what I asked for?';
          btn(`Hand in: ${this.questNeeds(id).map(([it, n]) => `${n} ${ITEMS[it].name}`).join(' + ')}`, () => this.turnIn(id, npc));
        } else if (st === 'active') { text = `${step.offer}<br><br><i>Progress: ${this.needStr(id)}</i>`; said = said || 'Still working on it?'; }
        else { text = 'Thank you again for your help, friend.'; said = said || text; }
        html += `<div class="qblock"><b>${title}</b><br>${text}</div>`;
      }
      btn('Close', () => this.closeWin('dialogWin'));
      $('dlgText').innerHTML = html;
      this.log(`${npc.name} says: "${said}"`, 'say');
      this.openWin('dialogWin');
    }
    acceptQuest(id) {
      const q = QUESTS[id];
      this.quests[id] = 'active'; if (q.chain) this.questSteps[id] = 0;
      this.log(`You have accepted the quest: ${q.name}.`, 'ding');
      this.closeWin('dialogWin'); this.renderQuests(); this.save();
    }
    turnIn(id, npc) {
      const q = QUESTS[id], pl = this.player;
      if (!this.questHasAll(id)) return;
      for (const [it, n] of this.questNeeds(id)) this.removeItems(it, n);
      if (q.chain) {
        const si = this.questStep(id), step = q.steps[si];
        this.log(`${npc.name} says: "${step.done}"`, 'say');
        if (si < q.steps.length - 1) {
          if (step.give) { this.addItem(step.give, 1, true); this.log(`You receive ${ITEMS[step.give].name}.`, 'loot'); }
          this.questSteps[id] = si + 1;
          this.questXP(Math.floor(400 * (si + 1) * (1 + pl.level / 10)), id, si);
          this.log(`Quest updated: ${q.name}. Next: ${q.steps[si + 1].hint}.`, 'ding');
          EB.audio.ding(); this.closeWin('dialogWin'); this.renderQuests(); this.save();
          return;
        }
      } else this.log(`${npc.name} says: "${q.done}"`, 'say');
      this.quests[id] = 'done';
      pl.coins += q.coins; this.log(`You receive ${U.coinStr(q.coins)}.`, 'loot');
      if (q.reward) { this.addItem(q.reward, q.rewardCount || 1, true); this.log(`You receive ${q.rewardCount > 1 ? q.rewardCount + 'x ' : 'a '}${ITEMS[q.reward].name}.`, ITEMS[q.reward].rare ? 'ding' : 'loot'); }
      if (q.title) { pl.title = q.title; this.log(`You have earned the title: ${q.title}!`, 'ding'); ui.center(q.title, `${pl.name}, ${q.title}`, 4); }
      for (const [f, d] of q.faction || []) this.adjustFaction(f, d);
      this.log(`You have completed the quest: ${q.name}!`, 'ding');
      this.questXP(Math.floor(q.xp * (1 + pl.level / 10)), id, null);
      EB.audio.ding(); this.closeWin('dialogWin'); this.renderQuests(); this.save();
    }
    renderQuests() {
      const qw = $('questWin'), act = Object.keys(this.quests).filter((id) => this.quests[id] === 'active' && QUESTS[id]);
      if (!act.length) { qw.classList.add('hidden'); return; }
      qw.classList.remove('hidden');
      qw.innerHTML = '<div class="wtitle" style="margin-bottom:2px">Quests</div>' + act.map((id) => {
        const q = QUESTS[id], all = this.questHasAll(id);
        if (q.chain) { const s = q.steps[this.questStep(id)]; return `<div class="${all ? 'qdone' : ''}">${q.name} (${this.questStep(id) + 1}/${q.steps.length})<br><span>${s.hint}<br>${this.needStr(id)}${all ? ` - return to ${s.giver}` : ''}</span></div>`; }
        return `<div class="${all ? 'qdone' : ''}">${q.name}<br><span>${this.needStr(id)}${all ? ` - return to ${q.giver}` : ''}</span></div>`;
      }).join('');
    }

    // ---------- spell gems, spellbook, hotbar ----------
    isSpell(id) { return isSpell(id); }
    renderGems() {
      const gb = $('gemBar'), pl = this.player; gb.innerHTML = '';
      if (!pl.spells.some(isSpell)) { gb.classList.add('hidden'); this.gemEls = []; return; }
      gb.classList.remove('hidden');
      this.gemEls = [];
      for (let i = 0; i < 8; i++) {
        const id = pl.gems[i], el = document.createElement('div');
        el.className = 'gem' + (id ? '' : ' empty');
        el.dataset.gem = i;
        el.innerHTML = (id ? EB.icons.img(id) : '') + '<div class="cd"></div><div class="mem"></div>';
        el.title = id ? SPELLS[id].name : 'Empty spell gem';
        el.onclick = () => this.clickGem(i);
        el.oncontextmenu = (e) => { e.preventDefault(); if (pl.gems[i]) { this.log(`You forget ${SPELLS[pl.gems[i]].name}.`, 'spell'); pl.gems[i] = null; this.renderGems(); this.rebuildHotbar(); this.save(); } };
        if (id) { el.draggable = true; el.ondragstart = (e) => e.dataTransfer.setData('text/plain', id); ui.tooltipFor(el, () => this.spellTip(id) + '<div style="color:#b0a080">Click to cast · right-click to forget</div>'); }
        this.dropTarget(el, (sid) => this.memorize(sid, i));
        gb.appendChild(el);
        this.gemEls.push({ el, id, cd: el.querySelector('.cd'), mem: el.querySelector('.mem') });
      }
      const bk = document.createElement('div'); bk.className = 'gem book'; bk.title = 'Spellbook (K)'; bk.textContent = '📖';
      bk.onclick = () => this.toggleWin('bookWin'); gb.appendChild(bk);
    }
    clickGem(i) {
      const pl = this.player;
      if (this.bookSel) { const s = this.bookSel; this.bookSel = null; this.memorize(s, i); return; }
      if (pl.gems[i]) this.useAbility(pl.gems[i]);
      else this.toggleWin('bookWin');
    }
    dropTarget(el, fn) {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (id && SPELLS[id]) fn(id); });
    }
    spellTip(id) {
      const sp = SPELLS[id], L = sp.classes[this.player.cls];
      return `<div class="tn">${sp.name}</div>${sp.desc}<br>${L ? `Level ${L} &nbsp; ` : ''}${sp.mana ? `Mana: ${sp.mana} &nbsp; ` : ''}Cast: ${sp.cast ? sp.cast + 's' : 'Instant'} &nbsp; Recast: ${sp.recast}s`;
    }
    memTime(id) { return Math.min(6, 2 + (SPELLS[id].classes[this.player.cls] || 1) * 0.25); }
    memorize(id, gem, instant) {
      const pl = this.player;
      if (!isSpell(id)) { this.log('Only spells can be memorized. Place abilities on your hotbar instead.', 'sys'); return; }
      if (!pl.spells.includes(id)) { this.log('You have not learned that spell yet.', 'sys'); return; }
      if (pl.casting) { this.log('You cannot memorize while casting.', 'sys'); return; }
      if (!pl.alive) return;
      for (let i = 0; i < 8; i++) if (pl.gems[i] === id) pl.gems[i] = null;
      if (instant) { pl.gems[gem] = id; this.renderGems(); this.rebuildHotbar(); return; }
      pl.gems[gem] = null;
      this.sit();
      pl.memorizing = { id, gem, t: 0, total: this.memTime(id) };
      this.log(`Cramming ${SPELLS[id].name} into your brain...`, 'spell');
      $('castBar').classList.remove('hidden'); $('castName').textContent = `Memorizing ${SPELLS[id].name}`; $('castFill').style.width = '0%';
      this.renderGems(); this.rebuildHotbar();
      if (this.windows.has('bookWin')) this.renderBook();
    }
    updateMemorize(dt, moving) {
      const pl = this.player, m = pl.memorizing; if (!m) return;
      if (moving || !pl.sitting) { this.interruptMemorize(); return; }
      m.t += dt;
      $('castFill').style.width = Math.min(100, (m.t / m.total) * 100) + '%';
      if (m.t >= m.total) {
        pl.memorizing = null; pl.gems[m.gem] = m.id; $('castBar').classList.add('hidden');
        this.log(`You have finished memorizing ${SPELLS[m.id].name}. Pop quiz passed!`, 'spell'); EB.audio.click();
        this.renderGems(); this.rebuildHotbar(); if (this.windows.has('bookWin')) this.renderBook(); this.save();
      }
    }
    interruptMemorize() {
      const pl = this.player; if (!pl.memorizing) return;
      pl.memorizing = null; $('castBar').classList.add('hidden');
      this.log('Your study session was interrupted. Now where were you?', 'spell'); this.renderGems();
    }
    assignHotbar(slot, id) {
      const pl = this.player;
      if (id && !pl.spells.includes(id)) return;
      for (let i = 0; i < 8; i++) if (pl.hotbar[i] === id) pl.hotbar[i] = null;
      pl.hotbar[slot] = id;
      if (id) this.log(`${SPELLS[id].name} placed on hotbar slot ${slot + 1}.${isSpell(id) && !pl.gems.includes(id) ? ' (Memorize it in a spell gem to cast it.)' : ''}`, 'sys');
      this.rebuildHotbar(); this.save();
    }
    renderBook() {
      const pl = this.player, box = $('bookList'); box.innerHTML = '';
      const sortL = (a, b) => (SPELLS[a].classes[pl.cls] || 0) - (SPELLS[b].classes[pl.cls] || 0);
      const known = pl.spells.filter((id) => SPELLS[id]).sort(sortL);
      const sect = (title, ids) => {
        if (!ids.length) return;
        const h = document.createElement('h4'); h.textContent = title; box.appendChild(h);
        const grid = document.createElement('div'); grid.className = 'bookGrid';
        for (const id of ids) {
          const sp = SPELLS[id], el = document.createElement('div');
          const gi = pl.gems.indexOf(id);
          el.className = 'bspell' + (this.bookSel === id ? ' sel' : '') + (gi >= 0 ? ' memd' : '');
          el.innerHTML = `${EB.icons.img(id)}<div><b>${sp.name}</b><br><span>L${sp.classes[pl.cls] || '?'}${sp.mana ? ` · ${sp.mana} mana` : ''}${gi >= 0 ? ` · gem ${gi + 1}` : ''}</span></div>`;
          el.draggable = true; el.dataset.id = id;
          el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', id); this.bookSel = null; };
          el.onclick = () => { this.bookSel = this.bookSel === id ? null : id; this.renderBook(); if (this.bookSel) this.log(`Selected ${sp.name}: click a ${isSpell(id) ? 'spell gem or ' : ''}hotbar slot to place it.`, 'help'); };
          el.ondblclick = () => { if (!isSpell(id)) return; let g = pl.gems.indexOf(null); if (g < 0) g = 7; this.bookSel = null; this.memorize(id, g); };
          ui.tooltipFor(el, () => this.spellTip(id));
          grid.appendChild(el);
        }
        box.appendChild(grid);
      };
      sect('Spells (drag or click, then click a gem to memorize; double-click to memorize)', known.filter(isSpell));
      sect('Abilities (drag or click, then click a hotbar slot)', known.filter((id) => !isSpell(id)));
      // v5: explicit buttons for the selected spell (touch friendly: no drag / double-click / right-click needed)
      // always present with a constant height, so selecting a spell never shifts the list (keeps double-click working)
      {
        const id = this.bookSel && SPELLS[this.bookSel] ? this.bookSel : null, act = document.createElement('div'); act.className = 'bookActions';
        const gemOk = id && isSpell(id), dis = (ok) => (ok ? '' : ' disabled');
        let h = `<div class="bdesc">${id ? this.spellTip(id) : '<span class="hint">Tap or click a spell or ability to select it, then choose a gem or hotbar slot below.</span>'}</div>`;
        h += `<div class="brow"><span>Memorize in gem:</span>${[0, 1, 2, 3, 4, 5, 6, 7].map((g) => `<button class="small" data-gem="${g}"${dis(gemOk)}>${g + 1}</button>`).join('')}</div>`;
        h += `<div class="brow"><span>Put on hotbar:</span>${[0, 1, 2, 3, 4, 5, 6, 7].map((s) => `<button class="small" data-hot="${s}"${dis(id)}>${s + 1}</button>`).join('')}</div>`;
        act.innerHTML = h;
        act.querySelectorAll('[data-gem]').forEach((b) => { b.onclick = () => { this.bookSel = null; this.memorize(id, +b.dataset.gem); this.renderBook(); }; });
        act.querySelectorAll('[data-hot]').forEach((b) => { b.onclick = () => { this.bookSel = null; this.assignHotbar(+b.dataset.hot, id); this.renderBook(); }; });
        box.insertBefore(act, box.firstChild);
      }
      $('bookHint').textContent = pl.memorizing ? `Memorizing ${SPELLS[pl.memorizing.id].name}...` : this.bookSel ? `Selected: ${SPELLS[this.bookSel].name}` : `Gems: ${pl.gems.filter(Boolean).length}/8 memorized. Memorizing takes a few seconds and makes you sit.`;
    }

    // ---------- minimap ----------
    drawMinimap() {
      if (!this.showMap) return;
      const cv = $('minimap'), ctx = cv.getContext('2d'), pl = this.player, S = cv.width, sc = 1.35;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
      ctx.save(); ctx.translate(S / 2, S / 2); ctx.scale(sc, sc); ctx.translate(-pl.pos.x, -pl.pos.z);
      ctx.drawImage(this.world.mapCanvas, 0, 0);
      const R = S / 2 / sc + 2;
      const dot = (e, c, r) => { if (Math.abs(e.pos.x - pl.pos.x) > R || Math.abs(e.pos.z - pl.pos.z) > R) return; ctx.fillStyle = c; ctx.fillRect(e.pos.x - r, e.pos.z - r, r * 2, r * 2); };
      for (const m of this.mobs) dot(m, m.alive ? CON_HEX[m.con(this)] : '#6a5a40', m === this.target ? 2.2 : 1.4);
      for (const n of this.npcs) dot(n, '#5a9aff', 1.4);
      for (const c of this.pcorpses) dot(c, '#ffcc33', 2);
      for (const m of this.mercs) dot(m, '#50ff50', 1.8);
      ctx.strokeStyle = '#9fe0ff'; ctx.lineWidth = 2;
      for (const zl of this.world.zoneLines) { ctx.beginPath(); ctx.moveTo(zl.x0, zl.at); ctx.lineTo(zl.x1, zl.at); ctx.stroke(); }
      ctx.restore();
      const f = pl.forward();
      ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(Math.atan2(-f.x, f.z) + Math.PI);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ff6050'; ctx.font = 'bold 11px Verdana'; ctx.fillText('N', S / 2 - 4, 11);
    }

    // ---------- separation (mobs / mercs / player don't overlap) ----------
    separate() {
      const pl = this.player, w = this.world;
      const list = this.net ? [] : this.mobs.filter((m) => m.alive && m.state !== 'idle' || (m.alive && m.pos.distanceTo(pl.pos) < 30)); // v6: server-run monsters keep their server positions
      for (const m of this.mercs) if (!m.dead) list.push(m);
      if (pl.alive) list.push(pl);
      const shift = (e, sx, sz) => { if (!collides(w, e.pos.x + sx, e.pos.y, e.pos.z + sz, e.hw, e.h) || collides(w, e.pos.x, e.pos.y, e.pos.z, e.hw, e.h)) { e.pos.x += sx; e.pos.z += sz; } };
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const minD = a.hw + b.hw + 0.2, d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-3) { const ang = Math.random() * 6.283; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
        const push = Math.min(0.08, (minD - Math.min(d, minD)) * 0.5), nx = dx / d, nz = dz / d;
        if (a === pl) shift(b, nx * push * 2, nz * push * 2);
        else if (b === pl) shift(a, -nx * push * 2, -nz * push * 2);
        else { shift(a, -nx * push, -nz * push); shift(b, nx * push, nz * push); }
      }
    }

    // ---------- building ----------
    breakBlock() {
      const e = this.eyePos(), d = this.camDir();
      const h = this.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, 6);
      if (!h) return;
      if (h.b === B.BEDROCK) { this.log('That is far too sturdy to break.', 'sys'); return; }
      if (this.net && !this.net.block(h.x, h.y, h.z, B.AIR)) return;
      this.world.setBlock(h.x, h.y, h.z, B.AIR); EB.audio.block();
    }
    placeBlock() {
      const e = this.eyePos(), d = this.camDir();
      const h = this.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, 6);
      if (!h) return;
      const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
      if (!this.world.inBounds(x, y, z)) return;
      const cur = this.world.get(x, y, z); if (cur !== B.AIR && cur !== B.WATER) return;
      const pl = this.player;
      const overlaps = (ent) => x + 1 > ent.pos.x - ent.hw && x < ent.pos.x + ent.hw && z + 1 > ent.pos.z - ent.hw && z < ent.pos.z + ent.hw && y + 1 > ent.pos.y && y < ent.pos.y + ent.h;
      if (overlaps(pl) || this.mobs.some((m) => m.alive && overlaps(m))) return;
      if (this.net && !this.net.block(x, y, z, D.BUILDABLE[this.buildSel])) return;
      this.world.setBlock(x, y, z, D.BUILDABLE[this.buildSel]); EB.audio.block();
    }

    // ---------- commands ----------
    command(v) {
      const pl = this.player;
      if (this.net && this.net.command(v)) return; // v6: chat, /who, groups and admin commands go to the server
      if (v[0] !== '/') { this.log(`You say: "${v}"`, 'say'); return; }
      const cmd = v.slice(1).toLowerCase().split(/\s+/)[0];
      switch (cmd) {
        case 'save': this.save(true); break;
        case 'loc': this.log(`You are standing at ${pl.pos.x.toFixed(1)}, ${pl.pos.y.toFixed(1)}, ${pl.pos.z.toFixed(1)} (give or take a block)`, 'sys'); break;
        case 'who': this.log('Adventurers loitering in Everblock:', 'sys'); this.mercs.forEach((m) => this.log(`Lv${m.level} ${m.isPet ? 'Pet' : m.role === 'healer' ? 'Cleric' : 'Warrior'} ${m.name} (${m.isPet ? 'Pet' : 'Mercenary'})${m.dead ? ' - DEAD' : ''} - in your group`, 'sys')); this.log(`Lv${pl.level} ${CLASSES[pl.cls].name} ${pl.name}${pl.title ? `, ${pl.title}` : ''} (${RACES[pl.race].name}) - hanging around ${this.lastZone}`, 'sys'); this.log('1 adventurer is loitering in Everblock.', 'sys'); break;
        case 'played': this.log(`You have played ${Math.floor(pl.played / 3600)}h ${Math.floor(pl.played / 60) % 60}m.`, 'sys'); break;
        case 'time': { const h = Math.floor(this.dayT * 24); this.log(`It is ${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'} in Everblock.`, 'sys'); break; }
        case 'corpse': this.otherCorpses.forEach((c) => this.log(`You have a corpse in ${EB.WORLD.ZONES[c.zone || 'everblock'].name}.`, 'sys')); if (!this.pcorpses.length && !this.otherCorpses.length) this.log('You have no corpses.', 'sys'); else this.pcorpses.forEach((c) => this.log(`Your corpse lies at ${c.pos.x.toFixed(0)}, ${c.pos.y.toFixed(0)}, ${c.pos.z.toFixed(0)} (${c.pos.distanceTo(pl.pos).toFixed(0)} away).`, 'sys')); break;
        case 'sit': this.sit(); break;
        case 'stand': this.stand(); break;
        case 'quests': { const q = Object.keys(this.quests).filter((id) => QUESTS[id]); if (!q.length) this.log('You have no quests. Hail townsfolk to find work.', 'sys'); else q.forEach((id) => this.log(`${QUESTS[id].name}: ${this.quests[id] === 'done' ? 'Completed' : `${this.needStr(id)} (return to ${this.questGiver(id)})`}`, 'sys')); break; }
        case 'gfx': { const a = (v.split(/\s+/)[1] || '').toLowerCase(); this.applyGfx(a === 'low' || a === 'high' ? a : this.gfxPref === 'high' ? 'low' : 'high'); break; }
        case 'lights': { const on = !this.lightsOn; this.lightsPref = on ? '1' : '0'; localStorage.setItem('everblock_lights', this.lightsPref); this.setLights(on, on ? 'Dynamic lantern lights ON.' : 'Dynamic lantern lights OFF.'); break; }
        case 'music': this.log(EB.audio.toggleMusic() ? 'Music on.' : 'Music off.', 'sys'); break;
        case 'book': case 'spellbook': this.openWin('bookWin'); break;
        case 'dismiss': { const m = this.mercs[this.mercs.length - 1]; if (m) this.dismissMerc(m); else this.log('You have no mercenaries.', 'sys'); break; }
        case 'zone': this.log(`You are in ${this.world.zoneName}.`, 'sys'); break;
        case 'faction': case 'factions': {
          this.log('Your faction standings:', 'sys');
          for (const f in D.FACTIONS) { const v = this.standing(f), st = D.standingOf(v); this.log(`  ${D.FACTIONS[f].name}: ${st.label} (${v})`, 'faction'); }
          break;
        }
        case 'pet': { const a = (v.split(/\s+/)[1] || '').toLowerCase().replace(/[^a-z]/g, ''); if (a === 'window' || a === '') this.toggleWin('petWin'); else this.petCommand(a === 'back' || a === 'backoff' ? 'backoff' : a); break; }
        case 'phone': {
          const a = (v.split(/\s+/)[1] || '').toLowerCase();
          if (a === 'status' || a === 'debug' || a === 'info') { const s = EB.phone.status(); this.log(`Phone Mode ${s['Phone Mode']} (${s['decided by']}); touch=${s['touch capable']} maxTouchPoints=${s.maxTouchPoints} ontouchstart=${s.ontouchstart} coarse=${s.pointerCoarse} hoverNone=${s.hoverNone} mobileUA=${s.mobileUA} iOS=${s.iOS} standalone=${s['standalone (home screen)']}`, 'sys'); break; }
          EB.phone.source = 'command'; EB.phone.set(a === 'off' ? false : a === 'on' ? true : !EB.phone.on); this.log(`Phone mode ${EB.phone.on ? 'ON' : 'OFF'}. (/phone status shows touch detection details)`, 'sys'); break;
        }
        case 'help': this.log('Commands: /save /loc /who /played /time /corpse /quests /faction /pet attack|backoff|follow|guard|sit|window /dismiss /zone /sit /stand /music /book /lights /gfx /phone. Press ? for key bindings.', 'help'); break;
        default: this.log('Huh? That is not a command. Try /help.', 'sys');
      }
    }

    // ---------- v5 pet commands ----------
    pet() { return this.mercs.find((m) => m.isPet && !m.dead) || null; }
    petCommand(cmd) {
      const pet = this.pet(), t = this.target;
      if (!pet) { this.log('You do not have a pet.', 'sys'); return; }
      const say = (s) => this.log(`${pet.name} says: "${s}"`, 'say');
      switch (cmd) {
        case 'attack':
          if (!t || t.kind !== 'mob' || !t.alive) { this.log('You must first target something for your pet to attack.', 'sys'); return; }
          if (t.pos.distanceTo(pet.pos) > 60) { this.log(`${t.name} is too far away for your pet.`, 'sys'); return; }
          pet.petTarget = t; pet.backoffUntil = 0; if (pet.petMode === 'sit') pet.petMode = 'follow';
          say(`On it, boss! Going after ${t.name}.`); break;
        case 'backoff':
          pet.petTarget = null; pet.backoffUntil = this.time + 6;
          for (const m of this.mobs) if (m.target === pet && m.hate.has(this.player)) m.target = this.player;
          say('Fine, fine. Backing off.'); break;
        case 'follow': pet.petMode = 'follow'; pet.guardPos = null; say('Right behind you, boss. Like, RIGHT behind you.'); break;
        case 'guard': pet.petMode = 'guard'; pet.guardPos = pet.pos.clone(); pet.petTarget = null; say('Guarding this exact spot. Nobody touches it.'); break;
        case 'sit': pet.petMode = pet.petMode === 'sit' ? 'follow' : 'sit'; pet.petTarget = null; say(pet.petMode === 'sit' ? 'Taking a load off, boss. (sitting)' : 'Back on my feet, boss. (standing)'); break;
        default: this.log('Pet commands: /pet attack, backoff, follow, guard, sit, window.', 'sys'); return;
      }
      this.player.petMode = pet.petMode;
      this.renderPetBar(); if (this.windows.has('petWin')) this.renderPetWin();
    }
    renderPetBar() {
      const bar = $('petBar'); if (!bar) return;
      const pet = this.pet();
      bar.classList.toggle('hidden', !pet);
      if (!pet) return;
      if (!bar.dataset.built) {
        bar.dataset.built = '1';
        bar.innerHTML = '<span class="plabel">Pet</span>' + [['attack', '⚔', 'Attack'], ['backoff', '✋', 'Back off'], ['follow', '👣', 'Follow'], ['guard', '🛡', 'Guard'], ['sit', '💤', 'Sit']].map(([c, ic, n]) => `<button class="petBtn" data-pc="${c}" title="Pet: ${n}"><span>${ic}</span><small>${n}</small></button>`).join('');
        bar.querySelectorAll('.petBtn').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); this.petCommand(b.dataset.pc); }; });
      }
      bar.querySelectorAll('.petBtn').forEach((b) => b.classList.toggle('on', b.dataset.pc === pet.petMode || (b.dataset.pc === 'attack' && !!pet.petTarget)));
    }
    renderPetWin() {
      const body = $('petBody'), pet = this.pet(); if (!body) return;
      if (!pet) { body.innerHTML = '<div class="sub">You have no pet. Necromancers summon one with a pet spell.</div>'; return; }
      const foe = pet.petTarget && pet.petTarget.alive ? pet.petTarget.name : 'none';
      body.innerHTML = `<div><b>${pet.name}</b> - level ${pet.level} ${D.PETS[pet.petLvl] ? D.PETS[pet.petLvl].desc : ''}</div>
        <div class="bar hp"><div class="fill" style="width:${Math.round((pet.hp / pet.maxHp) * 100)}%"></div><span>${Math.ceil(pet.hp)} / ${pet.maxHp}</span></div>
        <div class="sub">Mode: <b>${pet.petMode}</b> &nbsp; Attacking: <b>${foe}</b></div>
        <div class="btnRow petCmds">${['attack', 'backoff', 'follow', 'guard', 'sit'].map((c) => `<button data-pc="${c}" class="${pet.petMode === c ? 'on' : ''}">${{ attack: 'Attack', backoff: 'Back Off', follow: 'Follow', guard: 'Guard Here', sit: pet.petMode === 'sit' ? 'Stand' : 'Sit' }[c]}</button>`).join('')}</div>
        <div class="sub">Also: /pet attack | backoff | follow | guard | sit</div>`;
      body.querySelectorAll('button[data-pc]').forEach((b) => { b.onclick = () => this.petCommand(b.dataset.pc); });
    }

    // ---------- HUD ----------
    buildCompass() {
      const s = $('compassStrip'); let h = '';
      const lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360; h += `<span style="position:absolute;left:${(d + 360) * 2 - 8}px;width:16px;text-align:center;color:${lab[n] === 'N' ? '#ff6050' : '#e8dcc0'}">${lab[n] || '·'}</span>`; }
      s.innerHTML = h;
    }
    rebuildHotbar() {
      const hb = $('hotbar'); hb.innerHTML = '';
      this.hotbarEls = [];
      if (this.buildMode) {
        D.BUILDABLE.forEach((b, i) => {
          const el = document.createElement('div'); el.className = 'slot' + (i === this.buildSel ? ' active' : '');
          el.innerHTML = `<span class="k">${i + 1}</span>`;
          el.appendChild(ui.blockSwatch(this, b));
          el.appendChild(document.createTextNode(BLOCKS[b].name));
          el.onclick = () => this.hotkey(i);
          hb.appendChild(el);
        });
        return;
      }
      this.hotbarList().forEach((id, i) => {
        const el = document.createElement('div');
        this.dropTarget(el, (sid) => this.assignHotbar(i, sid));
        if (!id) {
          el.className = 'slot empty'; el.innerHTML = `<span class="k">${i + 1}</span>`;
          el.onclick = () => this.hotkey(i);
          hb.appendChild(el); return;
        }
        const sp = SPELLS[id];
        el.className = 'slot' + (isSpell(id) ? ' spell' : '');
        el.innerHTML = `<span class="k">${i + 1}</span>${EB.icons.img(id, 'sic hic')}<span class="hn">${sp.name}</span><div class="cd"></div>`;
        el.onclick = () => this.hotkey(i);
        el.oncontextmenu = (e) => { e.preventDefault(); this.assignHotbar(i, null); };
        el.draggable = true; el.ondragstart = (e) => e.dataTransfer.setData('text/plain', id);
        ui.tooltipFor(el, () => this.spellTip(id) + (isSpell(id) && !this.player.gems.includes(id) ? '<div style="color:#ff9070">Not memorized</div>' : '') + '<div style="color:#b0a080">Right-click to clear</div>');
        hb.appendChild(el);
        this.hotbarEls.push({ el, id, cd: el.querySelector('.cd') });
      });
      const at = document.createElement('div'); at.className = 'slot'; at.id = 'atkSlot';
      at.innerHTML = '<span class="k">Q</span><span class="ic">⚔</span>Attack';
      at.onclick = () => this.toggleAuto();
      hb.appendChild(at);
    }
    updateHUD() {
      const pl = this.player;
      $('pName').textContent = pl.title ? `${pl.name}, ${pl.title}` : pl.name;
      $('pLvl').textContent = `${pl.level} ${RACES[pl.race].name} ${CLASSES[pl.cls].name}`;
      ui.bar('pHp', 'pHpT', Math.max(0, pl.hp), pl.maxHp, `HP ${Math.max(0, Math.ceil(pl.hp))} / ${pl.maxHp}`);
      if (pl.maxMana) ui.bar('pMana', 'pManaT', pl.mana, pl.maxMana, `Mana ${Math.floor(pl.mana)} / ${pl.maxMana}`); else $('pManaBar').classList.add('hidden');
      const need = D.xpToNext(pl.level);
      ui.bar('pXp', 'pXpT', pl.xp, need, `XP ${Math.floor((pl.xp / need) * 100)}%`);
      $('autoInd').classList.toggle('on', pl.autoAttack);
      $('sitInd').classList.toggle('on', pl.sitting);
      $('buildInd').classList.toggle('on', this.buildMode);
      this.renderPetBar();
      this.petWinT = (this.petWinT || 0) + 1; if (this.windows.has('petWin') && this.petWinT % 5 === 0) this.renderPetWin();
      const at = $('atkSlot'); if (at) at.classList.toggle('active', pl.autoAttack);
      for (const h of this.hotbarEls || []) {
        const sp = SPELLS[h.id], left = (pl.cooldowns[h.id] || 0) - this.time;
        h.cd.style.height = left > 0 ? Math.min(100, (left / sp.recast) * 100) + '%' : '0%';
        h.el.classList.toggle('nomana', sp.mana > pl.mana);
        h.el.classList.toggle('unmem', isSpell(h.id) && !pl.gems.includes(h.id));
        h.el.classList.toggle('active', !!(pl.casting && pl.casting.id === h.id));
      }
      for (const g of this.gemEls || []) {
        if (!g.id) { g.mem.style.height = pl.memorizing && pl.memorizing.gem === +g.el.dataset.gem ? Math.min(100, (pl.memorizing.t / pl.memorizing.total) * 100) + '%' : '0%'; continue; }
        const sp = SPELLS[g.id], left = (pl.cooldowns[g.id] || 0) - this.time;
        g.cd.style.height = left > 0 ? Math.min(100, (left / sp.recast) * 100) + '%' : '0%';
        g.el.classList.toggle('nomana', sp.mana > pl.mana);
        g.el.classList.toggle('active', !!(pl.casting && pl.casting.id === g.id));
      }
      const bw = $('buffWin');
      if (pl.buffs.length) {
        bw.classList.remove('hidden');
        bw.innerHTML = '<div class="wtitle" style="margin-bottom:2px">Effects</div>' + pl.buffs.map((b) => `<div>${b.name} <span style="float:right;color:#b0a080">${b.left > 60 ? Math.ceil(b.left / 60) + 'm' : Math.ceil(b.left) + 's'}</span></div>`).join('');
      } else bw.classList.add('hidden');
      if (this.target) this.updateTargetWin();
      const f = pl.forward();
      const heading = ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
      $('compassStrip').style.left = 130 - (heading + 360) * 2 + 'px';
      const ca = $('corpseArrow');
      if (this.pcorpses.length && pl.alive) {
        let best = null, bd = 1e9; for (const c of this.pcorpses) { const d = c.pos.distanceTo(pl.pos); if (d < bd) { bd = d; best = c; } }
        const ang = Math.atan2(best.pos.x - pl.pos.x, best.pos.z - pl.pos.z) - pl.yaw;
        ca.classList.remove('hidden');
        ca.innerHTML = `<div style="font-size:26px;transform:rotate(${-ang}rad)">⬆</div>Your corpse: ${Math.round(bd)}m`;
      } else if (this.otherCorpses.length && pl.alive) { ca.classList.remove('hidden'); ca.innerHTML = `Your corpse lies in ${EB.WORLD.ZONES[this.otherCorpses[0].zone || 'everblock'].name}`; }
      else ca.classList.add('hidden');
      $('zoneName').textContent = this.lastZone;
    }

    tickDots(dt) {
      for (const m of this.mobs) {
        if (!m.alive || !m.dots || !m.dots.length) continue;
        for (const d of m.dots.slice()) {
          d.next -= dt;
          if (d.next > 0) continue;
          d.next += 3; d.left -= 3;
          if (d.src === this.player && this.player.pos.distanceTo(m.pos) < 60) this.log(`${U.cap(m.name)} is still suffering from your ${d.name} (${d.dmg} damage).`, 'nonmelee');
          this.damageMob(m, d.dmg, d.src);
          if (!m.alive) break;
          if (d.left <= 0) m.dots.splice(m.dots.indexOf(d), 1);
        }
      }
    }
    updateLights() {
      const pl = this.player, w = this.world, lights = this.lampLights; if (!lights || !w.lanterns || !this.lightsOn) { this.litCount = 0; return; }
      const night = this.nightF != null ? this.nightF : 0.5;
      const underground = this.lastZone === 'The Sunken Crypt' || this.lastZone === 'Tomb of Ankhet-Ra' || this.lastZone === 'The Great Pyramid' || pl.pos.y < w.surfaceY(pl.pos.x, pl.pos.z) - 3;
      const near = [];
      for (const p of w.lanterns.values()) {
        const dx = p.x + 0.5 - pl.pos.x, dz = p.z + 0.5 - pl.pos.z, dy = p.y - pl.pos.y;
        const d2 = dx * dx + dz * dz + dy * dy * 2;
        if (d2 < 22 * 22) near.push([d2, p]);
      }
      near.sort((a, b) => a[0] - b[0]);
      const lampI = underground ? 1.6 : 0.3 + night * 1.9;
      for (let i = 0; i < 3; i++) {
        const L = lights[i], n = near[i];
        if (n) { L.position.set(n[1].x + 0.5, n[1].y + 0.5, n[1].z + 0.5); L.intensity = lampI * (0.92 + Math.sin(this.time * 7 + i) * 0.08); }
        else L.intensity = 0;
      }
      const torch = lights[3], torchOn = underground || night > 0.55;
      torch.intensity = torchOn ? (underground ? 1.3 : 1.15 * night) * (0.9 + Math.sin(this.time * 11) * 0.06) : 0;
      torch.position.set(pl.pos.x + Math.sin(pl.yaw) * 0.6, pl.pos.y + pl.h * 0.9, pl.pos.z + Math.cos(pl.yaw) * 0.6);
      this.litCount = lights.filter((l) => l.intensity > 0.05).length;
    }

    // ---------- main loop ----------
    setLights(on, msg) {
      this.lightsOn = on;
      for (const L of this.lampLights) { if (on && !L.parent) this.scene.add(L); else if (!on && L.parent) this.scene.remove(L); }
      if (msg) this.log(msg, 'sys');
    }
    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      let dt = (now - this.last) / 1000; this.last = now;
      if (!(dt > 0)) dt = 0.016;
      // auto quality: software renderers can't afford per-pixel point lights; turn them off unless the player forced them on
      if (this.player && this.lightsPref == null && !this.perf.gaveUp) {
        const P = this.perf; P.t += Math.min(dt, 1); P.n++;
        if (P.t > 2.5) {
          const fps = P.n / P.t; P.t = 0; P.n = 0;
          if (!this.lightsOn && fps >= 50) this.setLights(true);
          else if (this.lightsOn && fps < 30) { this.setLights(false); this.perf.gaveUp = true; this.log('Dynamic lantern lights were turned off to keep the frame rate up (type /lights to force them on).', 'sys'); }
        }
      }
      dt = Math.min(dt, 0.05);
      this.step(dt);
      this.renderer.render(this.scene, this.camera);
    }
    step(dt) {
      try { this.update(dt); } catch (e) { console.error(e); this.errors = (this.errors || 0) + 1; }
    }
    update(dt) {
      const pl = this.player, world = this.world;
      this.time += dt; pl.played += dt;
      this.pathBudget = 6;
      let moving = false;
      if (pl.alive) {
        const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
        let fx = 0, fz = 0;
        if (!typing) {
          if (this.keys.KeyW || this.keys.ArrowUp) fz += 1;
          if (this.keys.KeyS || this.keys.ArrowDown) fz -= 1;
          if (this.keys.KeyA) fx -= 1;
          if (this.keys.KeyD) fx += 1;
          if (this.keys.ArrowLeft) pl.yaw += 2.2 * dt;
          if (this.keys.ArrowRight) pl.yaw -= 2.2 * dt;
        }
        let analog = 1;
        if (EB.phone && EB.phone.on && !typing) { // v5: virtual joystick (analog)
          const j = EB.phone.move, m = Math.hypot(j.x, j.y);
          if (m > 0.18) { fx += j.x; fz += j.y; analog = Math.min(1, 0.35 + m * 0.75); }
        }
        if (fx || fz) { moving = true; this.stand(); }
        const f = pl.forward(), r = new THREE.Vector3(-Math.cos(pl.yaw), 0, Math.sin(pl.yaw));
        let mx = f.x * fz + r.x * fx, mz = f.z * fz + r.z * fx;
        const l = Math.hypot(mx, mz);
        const speed = (fz < 0 && Math.abs(fx) < 0.3 ? 3.2 : 5.6) * (1 + pl.buffSum('speed')) * analog;
        if (l > 0) { mx = (mx / l) * speed; mz = (mz / l) * speed; }
        pl.vel.x = mx; pl.vel.z = mz;
        const jumpQ = EB.phone && EB.phone.jumpQ; if (jumpQ) EB.phone.jumpQ = false; // v5: a quick tap on the touch jump button still jumps
        if ((this.keys.Space || jumpQ) && !typing) {
          if (pl.inWater) pl.vel.y = 3.2;
          else if (pl.onGround) { pl.vel.y = 8.2; moving = true; this.stand(); }
        }
        if (pl.sitting) { pl.vel.x = pl.vel.z = 0; }
        const oy = pl.pos.y;
        const res = physicsMove(world, pl, dt, true);
        if (res.stepped) this.eyeOffset = (this.eyeOffset || 0) - (pl.pos.y - oy);
        this.updateCasting(dt, !!(fx || fz));
        this.updateMemorize(dt, !!(fx || fz));
        this.playerMelee(dt);
        if (!this.zoning) for (const zl of world.zoneLines) if (pl.pos.x >= zl.x0 && pl.pos.x <= zl.x1 && pl.pos.z >= zl.z0 && pl.pos.z <= zl.z1) { this.changeZone(zl); break; }
      } else {
        this.deathT -= dt;
        $('deathSub').textContent = `Returning to your bind point in ${Math.max(0, Math.ceil(this.deathT))}...`;
        if (this.deathT <= 0) this.respawn();
      }
      this.eyeOffset = (this.eyeOffset || 0) * Math.pow(0.0005, dt);
      // regen tick
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = TICK;
        if (pl.alive) {
          const st = pl.stats();
          const inCombat = this.mobs.some((m) => m.target === pl && m.alive);
          let hpR = 1 + Math.floor(pl.level / 4);
          if (pl.sitting) hpR = 3 + pl.level + Math.floor(st.STA / 30);
          if (!inCombat) hpR += 1;
          pl.hp = Math.min(pl.maxHp, pl.hp + hpR);
          for (const m of this.mercs) {
            const ooc = !this.mobs.some((mb) => mb.alive && mb.target === m);
            m.hp = Math.min(m.maxHp, m.hp + (2 + Math.floor(m.level / 2)) * (ooc ? 3 : 1));
            if (m.dead) continue;
            if (m.maxMana) m.mana = Math.min(m.maxMana, m.mana + (3 + Math.floor(m.level / 2)) * (ooc ? 2 : 1) + m.buffSum('manaRegen'));
          }
          if (pl.maxMana) {
            const ms = pl.castStat();
            let mR = 1 + Math.floor(pl.level / 5);
            if (pl.sitting) mR = 4 + Math.floor(pl.level / 2) + Math.floor(ms / 40);
            pl.mana = Math.min(pl.maxMana, pl.mana + mR + pl.buffSum('manaRegen'));
          }
        }
      }
      // buffs
      for (const b of pl.buffs) b.left -= dt;
      for (const m of this.mercs) { for (const b of m.buffs) b.left -= dt; if (m.buffs.some((b) => b.left <= 0)) { m.buffs = m.buffs.filter((b) => b.left > 0); m.hp = Math.min(m.hp, m.maxHp); } }
      const expired = pl.buffs.filter((b) => b.left <= 0);
      if (expired.length) { for (const b of expired) this.log(`Your ${b.name} wore off. Sad trombone.`, 'spell'); pl.buffs = pl.buffs.filter((b) => b.left > 0); pl.hp = Math.min(pl.hp, pl.maxHp); }
      // spawns & entities
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 1; this.updateSpawns(false); }
      if (this.net) { this.net.update(dt); for (const m of this.mobs.slice()) this.net.updateMob(m, dt); for (const n of this.npcs) this.net.updateNpc(n, dt); }
      else {
        for (const m of this.mobs.slice()) {
          if (!m.alive || m.state !== 'idle' || m.pos.distanceTo(pl.pos) < 140) m.update(dt, this);
        }
        for (const n of this.npcs) n.update(dt, this);
      }
      for (const m of this.mercs.slice()) m.update(dt, this);
      this.tickDots(dt);
      this.separate();
      for (const c of this.pcorpses) c.update(dt, this);
      this.updateFx(dt);
      if (this.fx) this.fx = this.fx.filter((f) => { f.life -= dt; if (f.arrow) f.m.position.lerpVectors(f.to, f.from, Math.max(0, f.life / 0.35)); else f.m.scale.multiplyScalar(1 + dt * 3); f.m.material.opacity = Math.max(0, f.life * 1.6); if (f.life <= 0) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); return false; } return true; });
      this.updatePlayerModel(dt, moving);
      this.updateCamera();
      this.updateSky(dt);
      const camP = this.camera.position;
      const fit = (e) => { const dc = e.plate.position.distanceTo(camP), k = U.clamp(dc / 11, 0.42, 1); e.plate.scale.set(4.4 * k, 0.82 * k, 1); return dc; };
      for (const e of this.mobs) { const dc = fit(e); e.plate.visible = dc > 2.2 && e.pos.distanceTo(pl.pos) < (e === this.target ? 80 : 38); }
      for (const e of this.npcs) { const dc = fit(e); e.plate.visible = dc > 2.2 && e.pos.distanceTo(pl.pos) < 30; }
      for (const e of this.mercs) e.plate.visible = fit(e) > 2.2;
      for (const zm of this.zoneMeshes) zm.material.opacity = 0.2 + 0.12 * Math.sin(this.time * 3);
      if (this.target) { const t = this.target; this.ring.visible = true; this.ring.position.set(t.pos.x, t.pos.y + 0.06, t.pos.z); const pu = 1 + Math.sin(this.time * 5) * 0.06; this.ring.scale.setScalar(Math.max(0.8, t.hw * 2.2) * pu * (t.model && t.model.width ? Math.max(0.6, t.model.width / 0.6) * 0.5 + 0.5 : 1)); this.ring.rotation.z += dt * 0.8; this.ring.material.opacity = 0.75 + Math.sin(this.time * 5) * 0.2; }
      this.world.updateChunks(this.camera.position.x, this.camera.position.z, 7, 2);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.1;
        this.updateHUD();
        this.updateGroupBars();
        this.drawMinimap();
        if (this.questDirty || (this.questT = (this.questT || 0) + 1) % 10 === 0) { this.questDirty = false; this.renderQuests(); }
        this.updateLights();
        EB.audio.setMood(this.world.zoneId === 'frostfang' ? 'frost' : this.world.zoneId === 'desert' ? (this.lastZone === 'Tomb of Ankhet-Ra' ? 'tomb' : 'desert') : this.lastZone === 'The Sunken Crypt' ? 'crypt' : this.lastZone === 'Everblock Keep' ? 'town' : 'wild');
        const z = this.world.zoneAt(pl.pos.x, pl.pos.y, pl.pos.z);
        if (z !== this.lastZone) { if (this.lastZone) { this.log(`You wander into ${z}.`, 'sys'); ui.center(z, null, 2.2); } this.lastZone = z; }
      }
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = 30; this.save(); }
      const eye = this.camera.position;
      const under = this.world.isWater(eye.x, eye.y, eye.z);
      if (under !== this.under) { this.under = under; let el = document.getElementById('underwater'); if (!el) { el = document.createElement('div'); el.id = 'underwater'; document.body.appendChild(el); } el.style.display = under ? 'block' : 'none'; }
    }
    // v4: per-frame particle upkeep - DoT clouds, casting hand glows, crowd-control stars
    updateFx(dt) {
      const pl = this.player;
      EB.models.camPos.copy(this.camera.position);
      const DOT = { fire: 0xff7020, disease: 0x90d040, poison: 0x80e040, magic: 0xd080ff, life: 0xff4070, cold: 0x80d0ff };
      for (const m of this.mobs) {
        if (!m.alive || m.pos.distanceToSquared(pl.pos) > 3600) continue;
        if (m.dots && m.dots.length) EB.fx.cloud(m, DOT[m.dots[0].school] || 0x90d040, dt);
        if (m.casting) this.castGlow(m, m.def.glow || 0x80c0ff, dt);
        if (this.time < (m.mezUntil || 0) || this.time < (m.stunUntil || 0)) { m._starT = (m._starT || 0) - dt; if (m._starT <= 0) { m._starT = 1.2; EB.fx.stars(m, 1.25); } }
      }
      for (const m of this.mercs) if (!m.dead && m.casting) this.castGlow(m, m.isPet ? 0xb060ff : 0xfff4b0, dt);
      if (pl.alive && pl.casting && !pl.casting.skill && this.camDist > 0) { const sp = SPELLS[pl.casting.id]; this.castGlow(pl, EB.fx.SCHOOL[sp && sp.school] || (sp && sp.kind === 'heal' ? 0x9effa0 : 0xfff080), dt); }
      // showcase models (photo mode / gallery): {M, walk, attack, cast} animated in place
      if (this.showcase) for (const sc of this.showcase) { sc.ph = (sc.ph || 0) + dt * (sc.walk ? 8 : 0); if (sc.attack) { sc.at = (sc.at || 0) + dt * 1.3; if (sc.at > 1.6) sc.at = 0.01; } EB.models.animateModel(sc.M, sc.ph, !!sc.walk, sc.at > 0 && sc.at < 1 ? sc.at : 0, !!sc.sit, { dt, cast: !!sc.cast, always: true }); if (sc.cast) { sc.model = sc.M; this.castGlow(sc, sc.castColor || 0x80c0ff, dt); } }
      EB.fx.update(dt, this.camera, this.renderer);
    }
    castGlow(e, color, dt) {
      e._glowT = (e._glowT || 0) + dt;
      if (e._glowT < 1 / 30) return;
      e._glowT = 0;
      const M = e === this.player ? this.pmodel : e.model;
      if (!M || !M.parts || !M.parts.handR) return;
      EB.fx.hand(EB.models.handPos(M, 'R'), color, dt);
      EB.fx.hand(EB.models.handPos(M, 'L'), color, dt);
    }
    updatePlayerModel(dt, moving) {
      const pl = this.player, M = this.pmodel;
      M.group.visible = this.camDist > 0 && pl.alive;
      M.group.position.copy(pl.pos);
      M.group.rotation.y = pl.yaw;
      if (moving && pl.onGround) this.pWalk = (this.pWalk || 0) + dt * 11;
      if (this.pAttackAnim > 0) { this.pAttackAnim += dt * 3.5; if (this.pAttackAnim >= 1) this.pAttackAnim = 0; }
      // v4: rebuild the rig whenever visible gear changes
      this.gearChk = (this.gearChk || 0) - dt;
      if (this.gearChk <= 0) {
        this.gearChk = 0.25;
        const spec = pl.modelOpts();
        if (EB.models.sigOf(spec) !== M.sig) { EB.models.dispose(M); this.pmodel = EB.models.buildModel(spec); this.scene.add(this.pmodel.group); return this.updatePlayerModel(0, moving); }
      }
      const casting = !!(pl.casting && !pl.casting.skill && SPELLS[pl.casting.id] && SPELLS[pl.casting.id].cast > 0);
      animateModel(M, this.pWalk || 0, moving && pl.onGround, casting ? 0 : this.pAttackAnim || 0, pl.sitting, { dt, cast: casting, kind: this.pAttackAnim > 0 ? this.pAttackKind || undefined : undefined, always: true });
    }
    updateCamera() {
      const pl = this.player, cam = this.camera;
      if (this.camOverride) { cam.position.copy(this.camOverride.pos); cam.lookAt(this.camOverride.look); return; } // screenshot/photo mode hook
      const sitDrop = pl.sitting ? pl.h * 0.35 : 0;
      const eye = new THREE.Vector3(pl.pos.x, pl.pos.y + pl.eyeH - sitDrop + (this.eyeOffset || 0), pl.pos.z);
      const dir = this.camDir();
      if (this.camDist > 0) {
        const back = dir.clone().multiplyScalar(-1);
        back.y += 0.35; back.normalize(); // over-the-shoulder: sit a little above the head
        const camRay = (b) => BLOCKS[b].opaque && b !== B.LEAVES;
        const hit = this.world.raycast(eye.x, eye.y, eye.z, back.x, back.y, back.z, this.camDist, camRay);
        const d = hit ? Math.max(0.3, hit.t - 0.3) : this.camDist;
        cam.position.copy(eye).addScaledVector(back, d);
      } else cam.position.copy(eye);
      cam.lookAt(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z);
    }
    updateSky(dt) {
      this.dayT = (this.dayT + dt / DAY_LEN) % 1;
      const ang = (this.dayT - 0.25) * Math.PI * 2;
      const elev = Math.sin(ang);
      const day = U.smoothstep(-0.12, 0.25, elev); this.nightF = 1 - day; EB.models.setRim(0.26 + 0.2 * this.nightF);
      const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * 0.8;
      const sunDir = new THREE.Vector3(Math.cos(ang), elev, 0.35).normalize();
      const cam = this.camera.position;
      this.sunMesh.position.copy(cam).addScaledVector(sunDir, 400);
      this.moonMesh.position.copy(cam).addScaledVector(sunDir, -400);
      this.sun.position.copy(cam).addScaledVector(sunDir, 100); this.sun.target.position.copy(cam);
      this.moonLight.position.copy(cam).addScaledVector(sunDir, -100); this.moonLight.target.position.copy(cam);
      this.sun.intensity = 0.85 * day;
      this.moonLight.intensity = 0.22 * (1 - day);
      const inDungeon = this.lastZone === 'The Sunken Crypt' || this.lastZone === 'Tomb of Ankhet-Ra' || this.lastZone === 'The Great Pyramid';
      this.hemi.intensity = inDungeon ? 0.4 : 0.13 + 0.62 * day;
      const sky = new THREE.Color(this.world.sky.night).lerp(new THREE.Color(this.world.sky.day), day).lerp(new THREE.Color(0xf08a50), dusk * 0.6);
      if (inDungeon) { sky.set(0x07070c); this.scene.fog.near = 6; this.scene.fog.far = 42; }
      else { this.scene.fog.near = 30; this.scene.fog.far = 60 + 45 * Math.max(day, 0.35); }
      this.scene.fog.color.copy(sky);
      this.renderer.setClearColor(sky);
      this.stars.position.copy(cam);
      this.stars.material.opacity = inDungeon ? 0 : 1 - day;
      const isDay = elev > 0;
      if (this.wasDay !== undefined && isDay !== this.wasDay) this.log(isDay ? 'The sun rises over Everblock.' : 'The sun sets. Creatures of the night begin to stir...', 'other');
      this.wasDay = isDay;
    }
  }

  EB.Game = Game;
  window.addEventListener('DOMContentLoaded', () => {
    EB.initTitle((newChar) => {
      const g = new Game();
      EB.game = g;
      g.start(newChar);
    });
  });
})();
