// Everblock - main game: player, input, combat, spells, loot, UI glue, save/load
(function () {
  const EB = window.EB;
  const U = EB.util, ui = EB.ui, calc = EB.calc, $ = EB.$;
  const D = EB.data;
  const { B, BLOCKS, RACES, CLASSES, ITEMS, SPELLS, EQUIP_SLOTS, STAT_NAMES, conColor, CON_HEX, CON_XP, CON_MSG, MERCS, QUESTS, mercCost } = D;
  const { Mob, NPC, PlayerCorpse, buildModel, animateModel, physicsMove, collides } = EB.ent;

  const SAVE_KEY = 'everblock_save_v1';
  EB.SAVE_KEY = SAVE_KEY;
  EB.loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } };

  const TICK = 6; // EQ server tick in seconds
  const DAY_LEN = 720; // seconds per full day
  const FISTS = { name: 'Fists', dmg: 2, delay: 2.2, verb: 'punch' };
  const VERB3 = { slash: 'slashes', pierce: 'pierces', crush: 'crushes', punch: 'punches', hit: 'hits', bite: 'bites', claw: 'claws', kick: 'kicks', backstab: 'backstabs' };
  const BUFF_MSG = { courage: 'You feel brave.', minor_shielding: 'You feel armored.', holy_armor: 'A holy aura surrounds you.', battle_fury: 'You are filled with a battle fury!', evade: 'You prepare to evade attacks.' };
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
      this.spells = c.spells || Object.keys(SPELLS).filter((s) => SPELLS[s].classes[c.cls] === 1);
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
    get ac() { return this.itemSum('ac') + this.buffSum('ac') + Math.floor(this.stats().AGI / 8) + this.level * (this.cls === 'warrior' ? 3 : this.cls === 'rogue' ? 2 : 1); }
    weapon() { return this.equip.primary ? ITEMS[this.equip.primary.id] : Object.assign({}, FISTS, { dmg: FISTS.dmg + Math.floor(this.level / 3) }); }
    castStat() { const ms = CLASSES[this.cls].manaStat; return ms != null ? this.statArr()[ms] : 75; }
    modelOpts() {
      const r = RACES[this.race];
      return { model: 'biped', color: CLASSES[this.cls].color, skin: r.skin, hair: r.hair, scale: r.scale * 0.97, legColor: 0x4a3a2a, weapon: true };
    }
    forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    toSave() {
      return { name: this.name, race: this.race, cls: this.cls, level: this.level, xp: this.xp, stats: this.base, coins: this.coins, inv: this.inv, equip: this.equip,
        spells: this.spells, buffs: this.buffs, bind: this.bind, played: this.played, pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw, hp: this.hp, mana: this.mana };
    }
  }

  // ---------------- Game ----------------
  class Game {
    constructor() {
      this.time = 0; this.keys = {}; this.windows = new Set(); this.target = null;
      this.mobs = []; this.npcs = []; this.pcorpses = []; this.slots = [];
      this.camDist = 5.5; this.buildMode = false; this.buildSel = 0; this.lastZone = ''; this.hudT = 0; this.tickT = TICK; this.spawnT = 0;
      this.msgThrottle = {}; this.dayT = 0.3; this.saveT = 30; this.deathT = 0;
      this.mercs = []; this.otherCorpses = []; this.zoneEdits = {}; this.quests = {}; this.zoneMeshes = []; this.pathBudget = 6; this.showMap = true;
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
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.scene.add(this.ring);
      this.raycaster = new THREE.Raycaster();
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
      const save = newChar ? null : EB.loadSave();
      this.seed = newChar ? newChar.seed : save.seed;
      this.initThree();
      let zone = 'everblock', pl;
      if (save) {
        zone = save.zone || 'everblock';
        this.zoneEdits = save.zoneEdits || { everblock: save.edits || {} };
        this.otherCorpses = (save.corpses || []).map((c) => Object.assign({ zone: 'everblock' }, c));
        this.quests = save.quests || {};
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
      this.loadZone(zone, null);
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
      this.renderGroup();
      $('loading').classList.add('hidden');
      $('hud').classList.remove('hidden');
      this.updateClickPrompt();
      ui.log('Welcome to Everblock!', 'ding');
      ui.log(`MOTD: Greetings, ${pl.name}. Mercenaries can now be hired from Liaison Brenna by the fountain. Beyond the northern pass lie the Frostfang Highlands. Press ? for help.`, 'help');
      if (newChar) ui.log(`Guildmaster Aldric says, 'Welcome, young ${RACES[pl.race].name.toLowerCase()}. Hunt the rats and snakes outside the walls to start. Return to me as you grow in power.'`, 'say');
      else ui.log(`Your character has been loaded. You are in ${this.world.zoneName}.`, 'sys');
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
      if (this.zoneEdits[zoneId]) world.applyEdits(this.zoneEdits[zoneId]);
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
    }
    changeZone(zl) {
      if (this.zoning) return;
      this.zoning = true;
      const pl = this.player;
      pl.autoAttack = false; pl.casting = null; $('castBar').classList.add('hidden');
      const fade = $('zoneFade');
      fade.querySelector('div').textContent = 'LOADING, PLEASE WAIT...';
      fade.classList.add('on');
      setTimeout(() => {
        try {
          this.loadZone(zl.to, zl.arrive);
          this.log(`You have entered ${this.world.zoneName}.`, 'ding');
          ui.center(this.world.zoneName, 'Zone', 2.5);
          this.save();
        } catch (e) { console.error(e); }
        setTimeout(() => { fade.classList.remove('on'); this.zoning = false; }, 250);
      }, 450);
    }
    toBind() {
      const pl = this.player, b = pl.bind;
      if (b.zone && b.zone !== this.world.zoneId) { this.loadZone(b.zone, null); this.log(`You have entered ${this.world.zoneName}.`, 'sys'); }
      pl.pos.set(b.x, b.y, b.z); pl.vel.set(0, 0, 0);
      for (const m of this.mercs) { m.pos.set(pl.pos.x + 1.2, pl.pos.y + 0.3, pl.pos.z + 1.2); m.nav.reset(); }
    }

    // ---------- save ----------
    save(manual) {
      if (!this.player || !this.world) return;
      const zoneEdits = Object.assign({}, this.zoneEdits, { [this.world.zoneId]: this.world.edits });
      let n = 0; for (const k in zoneEdits) n += Object.keys(zoneEdits[k]).length;
      const data = { v: 2, seed: this.seed, zone: this.world.zoneId, char: this.player.toSave(), zoneEdits: n < 20000 ? zoneEdits : {},
        corpses: this.pcorpses.map((c) => c.toSave()).concat(this.otherCorpses), mercs: this.mercs.filter((m) => !m.dead).map((m) => m.toSave()), quests: this.quests, dayT: this.dayT };
      if (!this.player.alive) data.char.hp = 0;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); if (manual) ui.log('Your character has been saved.', 'sys'); }
      catch (e) { ui.log('Save failed: ' + e.message, 'death'); }
    }

    log(m, t) { ui.log(m, t); }
    throttled(key, sec, m, t) { if ((this.msgThrottle[key] || 0) > this.time) return; this.msgThrottle[key] = this.time + sec; ui.log(m, t); }

    // ---------- spawns ----------
    updateSpawns(initial) {
      for (const s of this.slots) {
        if (s.mob && s.mob.alive) continue;
        if (this.time < s.respawnAt) continue;
        const def = s.def;
        let type = def.type;
        if (def.alt && Math.random() < def.altChance) type = def.alt;
        let x = def.x + (Math.random() * 2 - 1) * def.radius * 0.6, z = def.z + (Math.random() * 2 - 1) * def.radius * 0.6;
        let y = def.y != null ? this.world.floorBelow(x, def.y + 1, z) : this.world.surfaceY(x, z);
        if (def.y == null && this.world.isWater(x, y, z)) { x = def.x; z = def.z; y = this.world.surfaceY(x, z); }
        if (!initial && this.player.alive && Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 6) continue;
        const m = new Mob(type, s, x, y, z, def.lvl);
        m.refreshPlate(this);
        m.addTo(this.scene); m.syncModel();
        this.mobs.push(m);
        s.mob = m;
        if (m.def.named && !initial && this.player.pos.distanceTo(m.pos) < 90) this.log(`${m.name} shouts, 'You will all fall before me!'`, 'shout');
      }
    }
    removeEntity(e) {
      e.removeFrom(this.scene);
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
      $('btnLootAll').onclick = () => this.lootAll();
      $('chatInput').addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const v = e.target.value.trim(); e.target.value = ''; e.target.classList.add('hidden'); e.target.blur(); if (v) this.command(v); this.updateClickPrompt(); }
        if (e.key === 'Escape') { e.target.value = ''; e.target.classList.add('hidden'); e.target.blur(); }
      });
      window.addEventListener('beforeunload', () => this.save());
    }
    locked() { return document.pointerLockElement === this.renderer.domElement; }
    requestLock() { try { const p = this.renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    updateClickPrompt() { $('clickToPlay').classList.toggle('hidden', this.locked() || this.windows.size > 0 || !this.player.alive); }
    onKey(e, down) {
      if ($('hud').classList.contains('hidden')) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const k = e.code;
      if (k === 'Tab' || k === 'F1' || k === 'F2' || k === 'F3' || k === 'F10' || k === 'Space') e.preventDefault();
      this.keys[k] = down;
      if (!down || e.repeat) return;
      EB.audio.unlock();
      const pl = this.player;
      if (k === 'Escape') { if (this.windows.size) this.closeAll(); else this.setTarget(null); return; }
      if ((k === 'Slash' && e.shiftKey) || k === 'F10') { this.toggleWin('helpWin'); return; }
      if (k === 'F1') { e.preventDefault(); this.setTarget(null); this.log('You target yourself.', 'sys'); return; }
      if (k === 'F2' || k === 'F3') { e.preventDefault(); const m = this.mercs[k === 'F2' ? 0 : 1]; if (m) this.setTarget(m); return; }
      if (k === 'KeyN') { this.showMap = !this.showMap; $('minimap').classList.toggle('hidden', !this.showMap); return; }
      if (k === 'Enter' || k === 'Slash') { const ci = $('chatInput'); ci.classList.remove('hidden'); if (k === 'Slash') ci.value = '/'; setTimeout(() => ci.focus(), 0); if (this.locked()) document.exitPointerLock(); e.preventDefault(); return; }
      if (k === 'KeyI') { this.toggleWin('invWin'); return; }
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
      if (e.button === 0) this.requestLock();
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
    consider() {
      const t = this.target;
      if (!t) { this.log('You must first select a target to consider.', 'sys'); return; }
      if (t.kind === 'npc') { this.log(`${t.name} regards you as an ally -- looks like it would wipe the floor with you!`, 'sys'); return; }
      if (t.kind !== 'mob' || !t.alive) { this.log('That is a corpse.', 'sys'); return; }
      const c = t.con(this);
      const attitude = t.def.aggressive ? 'glares at you threateningly' : 'regards you indifferently';
      this.log(`${U.cap(t.name)} ${attitude} -- ${CON_MSG[c]}`, 'sys');
      const last = $('chatLog').lastChild; if (last) last.style.color = CON_HEX[c];
    }
    hail() {
      const t = this.target, pl = this.player;
      if (!t) { this.log("You say, 'Hail'", 'say'); return; }
      this.log(`You say, 'Hail, ${t.name}'`, 'say');
      if (t.kind === 'merc') { setTimeout(() => this.log(`${t.name} says, '${t.role === 'healer' ? 'I will keep you standing, ' + pl.name + '.' : 'Point me at something to hit!'}'`, 'say'), 400); return; }
      if (t.kind !== 'npc' || t.pos.distanceTo(pl.pos) > 20) return;
      if (this.questFor(t)) { setTimeout(() => this.openDialog(t), 300); return; }
      const lines = {
        liaison: `Looking for a sword arm or a healer, ${pl.name}? My mercenaries will follow you anywhere, for a price. (Press E to hire)`,
        merchant: `Welcome, ${pl.name}! Browse my wares? I buy anything you dig out of those critters, too. (Press E to trade)`,
        trainer: pl.level < 5 ? `Ah, ${pl.name}. Rats, snakes and fire beetles roam outside our walls. Hunt them, and return to me when you have grown. (Press E to train)` : `You have grown strong, ${pl.name}. The Darkpaw gnolls to the west and the Forsaken Graveyard to the south will test you. The Sunken Crypt to the northeast... only the bravest return. (Press E to train)`,
        binder: t.name === 'Scout Hollis' ? `Careful out here, ${pl.name}. The orcs of the Frostfang Warcamp to the northwest raid us nightly, and the giants of Vorgath's keep to the north are worse. Press E and I'll bind your soul to this camp.` : `Greetings, ${pl.name}. Should you fall, your spirit will return to where it is bound. Press E and I shall bind your soul here.`,
        guard: ['Move along, citizen.', `Hail, ${pl.name}. Keep your eyes open, the Darkpaw gnolls have been seen near the west gate. Some say Fippy Darkpaw himself leads them.`, "I don't have time to chat. Gnolls, you know.", 'The undead of the Sunken Crypt grow restless at night.'][Math.floor(Math.random() * 4)],
      };
      setTimeout(() => this.log(`${t.name} says, '${lines[t.npcKind]}'`, 'say'), 400);
    }
    updateTargetWin() {
      const t = this.target;
      if (!t) { $('targetWin').classList.add('hidden'); this.ring.visible = false; return; }
      $('targetWin').classList.remove('hidden');
      let color = '#ffffff', name = t.name, info = '';
      if (t.kind === 'mob') {
        if (t.alive) { color = CON_HEX[t.con(this)]; info = `Level ${t.level}${t.def.named ? ' - Named' : ''} - ${t.state === 'chase' ? 'Hostile' : t.state === 'flee' ? 'Fleeing' : t.def.aggressive ? 'Threatening' : 'Indifferent'}`; }
        else { name = t.corpseName(); color = '#b0a080'; info = 'Press E to loot'; }
      } else if (t.kind === 'npc') { color = '#7fb0ff'; info = { merchant: 'Merchant - press E to trade', trainer: 'Guildmaster - press E to train', binder: 'Soulbinder - press E to bind', guard: 'Everblock Guard' }[t.npcKind]; }
      else if (t.kind === 'pcorpse') { color = '#ffcc66'; info = 'Your corpse - press E to loot'; }
      else if (t.kind === 'merc') { color = '#70ff70'; info = `Group member - Level ${t.level} ${t.role === 'healer' ? 'Cleric' : 'Warrior'} Mercenary`; }
      $('tName').textContent = name; $('tName').style.color = color;
      const hp = (t.kind === 'mob' && t.alive) || t.kind === 'merc' ? t.hp / t.maxHp : t.kind === 'npc' ? 1 : 0;
      ui.bar('tHp', 'tHpT', hp * 100, 100, Math.max(0, Math.ceil(hp * 100)) + '%');
      $('tInfo').textContent = info;
      this.ring.material.color.set(color);
    }

    // ---------- combat ----------
    toggleAuto(force) {
      const pl = this.player;
      const on = force != null ? force : !pl.autoAttack;
      if (on && (!this.target || this.target.kind !== 'mob' || !this.target.alive)) { this.log('You must first select a target for this command!', 'sys'); pl.autoAttack = false; return; }
      pl.autoAttack = on;
      if (on) { this.stand(); pl.swing = Math.max(pl.swing, 0.3); }
      this.log(on ? 'Auto attack is on.' : 'Auto attack is off.', 'sys');
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
      if (d > this.meleeReach(t)) { this.throttled('far', 3, 'Your target is too far away, get closer!', 'sys'); return; }
      if (!this.facing(t)) { this.throttled('face', 3, 'You cannot see your target.', 'sys'); return; }
      const w = pl.weapon(), st = pl.stats();
      pl.swing = w.delay * (1 - Math.min(0.25, (st.DEX - 60) / 800 + pl.level / 200));
      this.pAttackAnim = 0.01;
      EB.audio.swing();
      const hitChance = U.clamp(0.72 + (pl.level - t.level) * 0.05 + (st.DEX - 75) / 400, 0.3, 0.95);
      if (Math.random() > hitChance) { this.log(`You try to ${w.verb} ${t.name}, but miss!`, 'miss'); if (t.state !== 'chase' && t.state !== 'flee') t.aggroOn(pl, this); return; }
      const dmg = this.meleeDamage(w, st);
      this.log(`You ${w.verb} ${t.name} for ${dmg} point${dmg === 1 ? '' : 's'} of damage.`, 'melee');
      EB.audio.hit();
      this.damageMob(t, dmg, pl);
      if (t.alive && (pl.cls === 'warrior' || pl.cls === 'rogue') && pl.level >= 5 && Math.random() < 0.15 + pl.level * 0.01) {
        const d2 = this.meleeDamage(w, st);
        this.log(`You ${w.verb} ${t.name} for ${d2} points of damage.`, 'melee');
        this.damageMob(t, d2, pl);
      }
    }
    meleeDamage(w, st) {
      const pl = this.player;
      const strB = Math.floor(Math.max(0, st.STR - 60) / 12);
      const max = Math.max(2, Math.floor((w.dmg * 2 + strB) * CLASSES[pl.cls].dmgMult * (1 + pl.level / 12) * (1 + pl.buffSum('dmgPct') / 100)));
      return U.randInt(Math.max(1, Math.floor(max / 4)), max);
    }
    damageMob(m, dmg, src) {
      if (!m.alive) return;
      m.hp -= dmg;
      if (src === this.player || (src && src.kind === 'merc')) m.grpDamage += dmg;
      if (m.state !== 'chase' && m.state !== 'flee') m.aggroOn(src, this);
      m.addHate(src, dmg + 1);
      if (m.hp <= 0) this.killMob(m, src);
      if (m === this.target) this.updateTargetWin();
    }
    killMob(m, src) {
      const pl = this.player;
      const byPlayer = m.grpDamage >= m.maxHp * 0.5;
      if (src === pl) this.log(`You have slain ${m.name}!`, 'melee');
      else if (pl.pos.distanceTo(m.pos) < 40) this.log(`${U.cap(m.name)} has been slain by ${src.name}!`, 'other');
      m.die(this, src);
      if (byPlayer && pl.alive) {
        const c = conColor(pl.level, m.level);
        let xp = Math.floor(calc.xpForKill(m.level) * CON_XP[c] * (m.def.named ? 2 : 1));
        const grp = this.groupMembers();
        if (grp.length > 1 && xp > 0) { // EQ-style split: group bonus, then shares weighted by level
          const total = xp * (1 + 0.15 * (grp.length - 1)), sumL = grp.reduce((a, g) => a + g.level, 0);
          xp = Math.floor(total * pl.level / sumL);
          this.gainXP(xp, true);
        } else if (xp > 0) this.gainXP(xp); else this.log('You gain no experience from that kill.', 'other');
        this.questKillHook && this.questKillHook(m);
      }
      if (this.target === m) { pl.autoAttack = false; this.updateTargetWin(); }
      if (pl.casting && pl.casting.target === m) this.interruptCast('Your target has died.');
    }
    gainXP(n, party) {
      const pl = this.player;
      if (pl.level >= D.MAX_LEVEL) return;
      pl.xp += n;
      this.log(party ? 'You gain party experience!!' : 'You have gained experience!', 'xp');
      let dinged = false;
      while (pl.level < D.MAX_LEVEL && pl.xp >= D.xpToNext(pl.level)) {
        pl.xp -= D.xpToNext(pl.level);
        const hpPct = pl.hp / pl.maxHp;
        pl.level++;
        pl.hp = Math.max(pl.hp, Math.ceil(pl.maxHp * hpPct));
        this.log(`You have gained a level! Welcome to level ${pl.level}!`, 'ding');
        dinged = true;
      }
      if (dinged) {
        ui.center('DING!', `Welcome to level ${pl.level}!`, 3);
        EB.audio.ding();
        const avail = Object.keys(SPELLS).filter((s) => { const L = SPELLS[s].classes[pl.cls]; return L && L <= pl.level && !pl.spells.includes(s); });
        if (avail.length) this.log(`You feel you could learn something new at your guild. (${avail.map((s) => SPELLS[s].name).join(', ')})`, 'help');
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
        this.log(`${U.cap(m.name)} ${VERB3[m.def.verb] || m.def.verb + 's'} ${t.name} for ${dmg} points of damage.`, 'other');
      }
      t.hp -= dmg;
      if (t.hp <= 0) this.mercDie(t, m);
    }
    mobSpell(m, t, sp) {
      if (Math.random() < 0.1) { if (t === this.player) this.log(`You resist the ${sp.name} spell!`, 'spell'); return; }
      const dmg = U.randInt(sp.dmg[0], sp.dmg[1]);
      if (t === this.player) {
        if (!this.player.alive) return;
        this.log(`You are struck by ${sp.name}! You have taken ${dmg} points of non-melee damage.`, 'hitme');
        EB.audio.hurt();
        this.damagePlayer(dmg, m);
        if (this.player.casting && !this.player.casting.skill && Math.random() < 0.35) this.interruptCast('Your spell is interrupted.');
      } else if (t.kind === 'merc') { this.log(`${t.name} is struck by ${sp.name} for ${dmg} points of damage.`, 'other'); this.mercTakeHit(m, t, dmg); }
    }
    mobAttackPlayer(m) {
      const pl = this.player;
      if (!pl.alive) return;
      const st = pl.stats();
      const hitChance = U.clamp(0.62 + (m.level - pl.level) * 0.05 - pl.ac / 500, 0.2, 0.95);
      const dodge = U.clamp((st.AGI - 60) / 600 + pl.buffSum('dodge') / 100 + (pl.cls === 'rogue' ? 0.05 : 0), 0, 0.6);
      const verb = m.def.verb;
      if (Math.random() > hitChance) { this.log(`${U.cap(m.name)} tries to ${verb} YOU, but misses!`, 'miss'); return; }
      if (Math.random() < dodge) { this.log(`${U.cap(m.name)} tries to ${verb} YOU, but YOU dodge!`, 'miss'); return; }
      let dmg = U.randInt(1, m.maxHit);
      dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.5, pl.ac / (pl.ac + 150)))));
      if (pl.sitting) { dmg = Math.ceil(dmg * 1.5); this.stand(); }
      this.log(`${U.cap(m.name)} ${VERB3[verb] || verb + 's'} YOU for ${dmg} point${dmg === 1 ? '' : 's'} of damage.`, 'hitme');
      EB.audio.hurt();
      this.damagePlayer(dmg, m);
      if (pl.casting && !pl.casting.skill && Math.random() < 0.2) this.interruptCast('Your spell is interrupted.');
    }
    damagePlayer(dmg, src) {
      const pl = this.player;
      pl.hp -= dmg;
      if (pl.hp <= 0) this.playerDie(src);
    }
    playerDie(src) {
      const pl = this.player;
      pl.hp = 0; pl.alive = false; pl.autoAttack = false; pl.casting = null; pl.sitting = false;
      $('castBar').classList.add('hidden');
      this.log(`You have been slain by ${src ? src.name : 'something'}!`, 'death');
      EB.audio.death();
      const loss = Math.floor(D.xpToNext(pl.level) * 0.08);
      if (pl.xp > 0 && loss > 0) { pl.xp = Math.max(0, pl.xp - loss); this.log('You have lost experience.', 'death'); }
      const items = pl.inv.filter(Boolean);
      if (items.length || Object.keys(pl.equip).length || pl.coins) {
        const pc = new PlayerCorpse(pl, { zone: this.world.zoneId, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, coins: pl.coins, items, equip: Object.assign({}, pl.equip) });
        pc.addTo(this.scene); this.pcorpses.push(pc);
        pl.inv = new Array(24).fill(null); pl.equip = {}; pl.coins = 0;
      }
      for (const m of this.mobs) if (m.alive && (m.state === 'chase' || m.state === 'flee') && (m.hate.has(pl) || this.mercs.some((mc) => m.hate.has(mc)))) m.goHome();
      for (const mc of this.mercs) { mc.casting = null; mc.hp = mc.maxHp; }
      this.closeAll();
      if (this.locked()) document.exitPointerLock();
      $('deathScreen').classList.remove('hidden');
      this.deathT = 5;
      this.updateClickPrompt();
      pl.buffs = [];
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
      if (pl.casting) this.interruptCast('Your spell is interrupted.');
      pl.sitting = true; pl.autoAttack = false;
      this.log('You sit down.', 'sys');
    }
    stand() { if (this.player.sitting) { this.player.sitting = false; this.log('You stand up.', 'sys'); } }

    // ---------- abilities & spells ----------
    hotbarList() {
      const c = this.player.cls;
      const key = (id) => SPELLS[id].classes[c] + (id === 'bind_wound' ? 0.5 : 0);
      return this.player.spells.slice().sort((a, b) => key(a) - key(b)).slice(0, 8);
    }
    hotkey(i) {
      if (this.buildMode) { if (i < D.BUILDABLE.length) { this.buildSel = i; this.rebuildHotbar(); } return; }
      const list = this.hotbarList();
      if (list[i]) this.useAbility(list[i]);
    }
    useAbility(id) {
      const pl = this.player, sp = SPELLS[id];
      if (!pl.alive) return;
      if (pl.casting) { this.log('You are already casting a spell!', 'sys'); return; }
      const cd = (pl.cooldowns[id] || 0) - this.time;
      if (cd > 0) { this.log(`You can use ${sp.name} again in ${Math.ceil(cd)} seconds.`, 'sys'); return; }
      if (sp.mana > pl.mana) { this.log('Insufficient Mana to cast this spell!', 'sys'); return; }
      const t = this.target;
      const needsTarget = sp.kind === 'nuke' || sp.kind === 'root' || sp.kind === 'skill';
      if (needsTarget) {
        if (!t || t.kind !== 'mob' || !t.alive) { this.log('You must first select a target for this spell!', 'sys'); return; }
        const range = sp.kind === 'skill' ? this.meleeReach(t) : 32;
        if (pl.pos.distanceTo(t.pos) > range) { this.log(sp.kind === 'skill' ? 'Your target is too far away, get closer!' : 'Your target is out of range, get closer!', 'sys'); return; }
        if (sp.kind !== 'skill' && !this.lineOfSight(pl, t)) { this.log('You cannot see your target.', 'sys'); return; }
      }
      let ft = needsTarget ? t : null;
      if (sp.friendly) { ft = t && t.kind === 'merc' && !t.dead && t.pos.distanceTo(pl.pos) < 32 ? t : pl; }
      this.stand();
      if (sp.cast > 0) {
        pl.casting = { id, t: 0, total: sp.cast, target: ft, skill: !!sp.skill, startPos: pl.pos.clone() };
        if (!sp.skill) { this.log(`You begin casting ${sp.name}.`, 'spell'); EB.audio.cast(); }
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
      if (moving || Math.hypot(pl.pos.x - c.startPos.x, pl.pos.z - c.startPos.z) > 0.25) { this.interruptCast(c.skill ? 'You stop what you are doing.' : 'Your spell is interrupted.'); return; }
      c.t += dt;
      $('castFill').style.width = Math.min(100, (c.t / c.total) * 100) + '%';
      if (c.t >= c.total) {
        pl.casting = null; $('castBar').classList.add('hidden');
        const sp = SPELLS[c.id];
        if (!sp.skill) {
          const fz = calc.fizzle(pl.level, pl.castStat());
          if (Math.random() * 100 < fz) {
            this.log('Your spell fizzles!', 'spell'); EB.audio.fizzle();
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
          const tg = t && t.kind === 'merc' ? t : pl;
          const before = tg.hp; tg.hp = Math.min(tg.maxHp, tg.hp + amt);
          const got = Math.round(tg.hp - before);
          if (tg !== pl) this.log(`${tg.name} feels much better. (+${got} HP)`, 'spell');
          else this.log(sp.skill ? `You bandage your wounds. (+${got} HP)` : `You feel much better. (+${got} HP)`, 'spell');
          this.healAggro(pl, got);
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
          }
          EB.audio.heal();
          break;
        }
        case 'nuke': {
          if (Math.random() < 0.05 + Math.max(0, t.level - L) * 0.04) { this.log(`${U.cap(t.name)} resisted your ${sp.name}!`, 'spell'); this.damageMob(t, 0, pl); break; }
          const dmg = U.randInt(sp.dmg[0], sp.dmg[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
          const flavor = { cold: 'is blasted by frost', fire: 'is engulfed in flame', magic: 'is struck by divine power' }[sp.school] || 'is struck';
          this.log(`${U.cap(t.name)} ${flavor}.`, 'spell');
          this.log(`You hit ${t.name} for ${dmg} points of non-melee damage.`, 'nonmelee');
          EB.audio.spell();
          this.spellFx(t, sp.school);
          this.damageMob(t, dmg, pl);
          break;
        }
        case 'buff': {
          const tg = sp.friendly && t && t.kind === 'merc' ? t : pl;
          tg.buffs = tg.buffs.filter((b) => b.id !== id);
          tg.buffs.push({ id, name: sp.name, left: sp.dur, buff: sp.buff });
          if (tg === pl) this.log(BUFF_MSG[id] || `You feel the effects of ${sp.name}.`, 'spell');
          else this.log(`${tg.name} is bolstered by your ${sp.name}.`, 'spell');
          EB.audio.heal();
          break;
        }
        case 'gate': {
          this.log('You feel a pull to your bind point.', 'spell');
          for (const m of this.mobs) if (m.alive && m.hate.has(pl)) m.goHome();
          this.toBind();
          pl.autoAttack = false; EB.audio.spell();
          break;
        }
        case 'root': {
          t.rootedUntil = this.time + sp.dur;
          this.log(`${U.cap(t.name)}'s feet adhere to the ground.`, 'spell');
          this.damageMob(t, 0, pl); EB.audio.spell();
          break;
        }
        case 'skill': {
          if (sp.backstab) {
            const w = pl.weapon();
            if (w.verb !== 'pierce') { this.log('You need a piercing weapon to backstab!', 'sys'); pl.cooldowns[id] = this.time + 1; return; }
            const mf = new THREE.Vector3(Math.sin(t.yaw), 0, Math.cos(t.yaw));
            const toP = new THREE.Vector3(pl.pos.x - t.pos.x, 0, pl.pos.z - t.pos.z).normalize();
            if (mf.dot(toP) > -0.25) { this.log('You must be behind your target to backstab!', 'sys'); pl.cooldowns[id] = this.time + 1; return; }
            const dmg = Math.floor((w.dmg * (2 + L / 3)) + U.randInt(1, 6 + L * 2));
            this.log(`You backstab ${t.name} for ${dmg} points of damage.`, 'melee');
            EB.audio.hit(); this.pAttackAnim = 0.01;
            this.damageMob(t, dmg, pl);
          } else {
            if (Math.random() < 0.15) { this.log(`You try to ${sp.verb} ${t.name}, but miss!`, 'miss'); this.damageMob(t, 0, pl); break; }
            const dmg = U.randInt(sp.dmg[0], sp.dmg[1]) + Math.floor((sp.perLvl || 0) * (L - 1));
            this.log(`You ${sp.verb} ${t.name} for ${dmg} points of damage.`, 'melee');
            EB.audio.hit(); this.pAttackAnim = 0.01;
            this.damageMob(t, dmg, pl);
          }
          break;
        }
      }
      if (pl.hp > pl.maxHp) pl.hp = pl.maxHp;
    }
    spellFx(t, school) {
      const color = { cold: 0x80d0ff, fire: 0xff7020, magic: 0xfff080 }[school] || 0xffffff;
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      g.position.set(t.pos.x, t.pos.y + t.h * 0.6, t.pos.z);
      this.scene.add(g);
      this.fx = this.fx || []; this.fx.push({ m: g, life: 0.5 });
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
      if (t.npcKind === 'merchant') { this.merchant = t; this.log(`${t.name} says, 'Take a look, ${pl.name}. Everything is priced to sell!${this.questFor(t) && this.quests[this.questFor(t)] !== 'done' ? ' And hail me if you want some work.' : ''}'`, 'say'); this.openWin('merchantWin'); }
      else if (t.npcKind === 'trainer') this.openWin('trainerWin');
      else if (t.npcKind === 'liaison') this.openWin('mercWin');
      else if (t.npcKind === 'guard' && this.questFor(t)) this.openDialog(t);
      else if (t.npcKind === 'binder') {
        pl.bind = { zone: this.world.zoneId, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z };
        this.log(`${t.name} says, 'Binding your soul. You will return here when you die.'`, 'say');
        this.log('You feel yourself bind to the area.', 'spell'); EB.audio.heal(); this.save();
      } else if (t.npcKind === 'guard') this.hail();
    }
    openLoot(c) {
      const pl = this.player;
      this.lootCorpse = c;
      if (c.loot.coins > 0) { pl.coins += c.loot.coins; this.log(`You receive ${U.coinStr(c.loot.coins)} from ${c.corpseName()}.`, 'loot'); c.loot.coins = 0; EB.audio.loot(); }
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
      if (!this.addItem(it.id, it.count)) return false;
      const I = ITEMS[it.id];
      this.log(`--You have looted ${I.rare ? 'the' : /^[aeiou]/i.test(I.name) ? 'an' : 'a'} ${I.name} from ${c.corpseName()}.--`, I.rare ? 'ding' : 'loot');
      EB.audio.loot();
      c.loot.items.splice(i, 1);
      ui.hideTip();
      if (!c.loot.items.length) this.closeWin('lootWin'); else this.renderLoot();
      if (this.windows.has('invWin')) this.renderInv();
      return true;
    }
    lootAll() { const c = this.lootCorpse; if (!c) return; while (this.lootCorpse && c.loot.items.length) { if (!this.takeLoot(0)) break; } }
    onLootClosed() {
      const c = this.lootCorpse; this.lootCorpse = null;
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
      if (it.stack) { const ex = pl.inv.find((s) => s && s.id === id); if (ex) { ex.count += count; return true; } }
      const i = pl.inv.indexOf(null);
      if (i < 0) { if (!silent) this.log('Your inventory is full!', 'sys'); return false; }
      pl.inv[i] = { id, count };
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
    buyPrice(id) { return Math.max(1, Math.round(ITEMS[id].value * (1.25 - this.chaMod()))); }
    sellPrice(id) { return Math.max(1, Math.floor(ITEMS[id].value * (0.5 + this.chaMod() / 2))); }
    renderMerchant() {
      const m = this.merchant; if (!m) return;
      $('merchTitle').firstChild.textContent = `${m.name} `;
      const list = $('merchList'); list.innerHTML = `<div class="sub">Your coin: ${U.coinStr(this.player.coins)}</div>`;
      for (const id of MERCHANT_STOCK) {
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span>${ITEMS[id].icon}</span><span class="n">${ITEMS[id].name}</span><span>${U.coinShort(this.buyPrice(id))}</span>`;
        const b = document.createElement('button'); b.textContent = 'Buy'; b.className = 'small';
        b.disabled = this.player.coins < this.buyPrice(id);
        b.onclick = () => this.buyItem(id);
        row.appendChild(b); ui.tooltipFor(row, () => ui.itemTip(id));
        list.appendChild(row);
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
      list.innerHTML = `<div class="sub">Guildmaster Aldric teaches ${CLASSES[pl.cls].name}s. Your coin: ${U.coinStr(pl.coins)}</div>`;
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
      this.log(sp.mana ? `You have finished scribing ${sp.name}.` : `You have learned ${sp.name}!`, 'spell');
      if (this.hotbarList().indexOf(id) < 0) this.log('Your hotbar is full; only the first 8 abilities are shown.', 'sys');
      EB.audio.ding(); this.rebuildHotbar(); this.renderTrainer(); this.save();
    }

    // ---------- group / mercenaries ----------
    groupMembers() { return [this.player, ...this.mercs.filter((m) => !m.dead)].filter((g) => g.alive); }
    groupFoe() {
      const pl = this.player, t = this.target;
      if (t && t.kind === 'mob' && t.alive && (pl.autoAttack || t.state === 'chase' || pl.casting) && t.pos.distanceTo(pl.pos) < 40) return t;
      let best = null, bd = 35;
      for (const m of this.mobs) {
        if (!m.alive || m.state !== 'chase' || !m.target) continue;
        if (m.target !== pl && m.target.kind !== 'merc') continue;
        const d = m.pos.distanceTo(pl.pos);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    }
    healAggro(src, amt) {
      if (amt <= 0) return;
      const grp = this.groupMembers();
      for (const m of this.mobs) if (m.alive && m.state === 'chase' && grp.some((g) => m.hate.has(g))) m.addHate(src, amt * 0.5);
    }
    addMerc(role, saved, silent) {
      const m = new EB.Merc(role, this, saved);
      const pl = this.player;
      m.pos.set(pl.pos.x + (this.mercs.length ? -1.3 : 1.3), pl.pos.y + 0.2, pl.pos.z + 1.2);
      m.addTo(this.scene); m.syncModel();
      this.mercs.push(m);
      if (!silent) {
        this.log(`${m.name} has joined your group.`, 'loot');
        setTimeout(() => this.log(`${m.name} says, '${role === 'healer' ? `Lead on, ${pl.name}. I'll keep you breathing.` : `Aye, ${pl.name}! Show me who needs a beating.`}'`, 'say'), 500);
      }
      this.renderGroup();
      return m;
    }
    hireMerc(role) {
      const pl = this.player, c = mercCost(role, pl.level);
      if (this.mercs.some((m) => m.role === role)) { this.log('That mercenary is already in your group.', 'sys'); return; }
      if (pl.coins < c) { this.log("You can't afford that mercenary.", 'sys'); return; }
      pl.coins -= c;
      this.log(`You pay ${U.coinStr(c)} to Liaison Brenna.`, 'loot');
      this.addMerc(role);
      this.renderMercWin(); this.save();
    }
    removeMercModel(m) {
      m.removeFrom(this.scene);
      this.mercs.splice(this.mercs.indexOf(m), 1);
      for (const mob of this.mobs) mob.hate.delete(m);
      if (this.target === m) this.setTarget(null);
      this.renderGroup();
    }
    dismissMerc(m) { this.log(`${m.name} has left the group.`, 'sys'); this.removeMercModel(m); this.save(); }
    mercDie(m, killer) {
      m.dead = true; m.hp = 0;
      this.log(`${m.name} has been slain by ${killer ? killer.name : 'something'}!`, 'death');
      this.log(`${m.name} has left the group. (Mercenaries can be re-hired from Liaison Brenna in Everblock Keep.)`, 'sys');
      this.removeMercModel(m); this.save();
    }
    renderMercWin() {
      const pl = this.player, list = $('mercList');
      list.innerHTML = `<div class="sub">Mercenaries match your level and follow you between zones. Your coin: ${U.coinStr(pl.coins)}</div>`;
      for (const role of Object.keys(MERCS)) {
        const M = MERCS[role], c = mercCost(role, pl.level), hired = this.mercs.some((m) => m.role === role);
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span class="n"><b>${M.name}</b> - Level ${pl.level} ${CLASSES[M.cls].name}<br><span style="color:#b0a080">${M.desc}</span></span><span>${U.coinShort(c)}</span>`;
        const b = document.createElement('button'); b.className = 'small';
        b.textContent = hired ? 'In group' : 'Hire'; b.disabled = hired || pl.coins < c;
        b.onclick = () => this.hireMerc(role);
        row.appendChild(b); list.appendChild(row);
      }
    }
    renderGroup() {
      const gw = $('groupWin');
      if (!this.mercs.length) { gw.classList.add('hidden'); return; }
      gw.classList.remove('hidden');
      gw.innerHTML = '<div class="wtitle" style="margin-bottom:2px">Group</div>';
      this.mercs.forEach((m, i) => {
        const row = document.createElement('div'); row.className = 'gmem';
        row.innerHTML = `<div class="gname"><span class="fk">F${i + 2}</span> ${m.name} <span class="gx" title="Dismiss">✕</span></div><div class="bar hp"><div class="fill"></div><span></span></div>` + (m.role === 'healer' ? '<div class="bar mana"><div class="fill"></div><span></span></div>' : '');
        row.onclick = (e) => { if (e.target.classList.contains('gx')) this.dismissMerc(m); else this.setTarget(m); };
        gw.appendChild(row);
        m.gRow = row;
      });
    }
    updateGroupBars() {
      for (const m of this.mercs) {
        if (!m.gRow) continue;
        const bars = m.gRow.querySelectorAll('.bar');
        const hp = U.clamp(m.hp / m.maxHp, 0, 1);
        bars[0].firstChild.style.width = hp * 100 + '%'; bars[0].lastChild.textContent = `${Math.ceil(m.hp)} / ${m.maxHp}`;
        if (bars[1]) { bars[1].firstChild.style.width = U.clamp(m.mana / m.maxMana, 0, 1) * 100 + '%'; bars[1].lastChild.textContent = `${Math.floor(m.mana)} / ${m.maxMana}`; }
        m.gRow.classList.toggle('tgt', this.target === m);
        m.gRow.querySelector('.gname').style.color = m.casting ? '#c89aff' : '';
      }
    }

    // ---------- quests ----------
    questFor(npc) { for (const id in QUESTS) if (QUESTS[id].giver === npc.name) return id; return null; }
    countItem(id) { let n = 0; for (const s of this.player.inv) if (s && s.id === id) n += s.count; return n; }
    removeItems(id, n) {
      const inv = this.player.inv;
      for (let i = 0; i < inv.length && n > 0; i++) { const s = inv[i]; if (!s || s.id !== id) continue; const k = Math.min(n, s.count); s.count -= k; n -= k; if (s.count <= 0) inv[i] = null; }
    }
    openDialog(npc) {
      const id = this.questFor(npc); if (!id) return;
      const q = QUESTS[id], st = this.quests[id], have = this.countItem(q.item);
      $('dlgTitle').firstChild.textContent = `${npc.name} `;
      const btns = $('dlgBtns'); btns.innerHTML = '';
      const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; btns.appendChild(b); };
      let text;
      if (!st) { text = q.offer; btn('Accept', () => { this.quests[id] = 'active'; this.log(`You have accepted the quest: ${q.name}.`, 'ding'); this.closeWin('dialogWin'); this.renderQuests(); this.save(); }); }
      else if (st === 'active' && have >= q.count) { text = `Ah, you have the ${ITEMS[q.item].name}s? (${have}/${q.count})`; btn(`Hand in ${q.count} ${ITEMS[q.item].name}`, () => this.turnIn(id, npc)); }
      else if (st === 'active') text = `${q.offer}<br><br><i>Progress: ${ITEMS[q.item].name} ${have}/${q.count}</i>`;
      else text = 'Thank you again for your help, friend.';
      btn('Close', () => this.closeWin('dialogWin'));
      $('dlgText').innerHTML = `<b>${q.name}</b><br>${text}`;
      this.log(`${npc.name} says, '${(st ? (st === 'done' ? 'Thank you again for your help, friend.' : have >= q.count ? 'You have what I asked for?' : 'Still working on it?') : q.offer)}'`, 'say');
      this.openWin('dialogWin');
    }
    turnIn(id, npc) {
      const q = QUESTS[id], pl = this.player;
      if (this.countItem(q.item) < q.count) return;
      this.removeItems(q.item, q.count);
      this.quests[id] = 'done';
      this.log(`${npc.name} says, '${q.done}'`, 'say');
      pl.coins += q.coins; this.log(`You receive ${U.coinStr(q.coins)}.`, 'loot');
      if (q.reward) { this.addItem(q.reward, q.rewardCount || 1, true); this.log(`You receive ${q.rewardCount > 1 ? q.rewardCount + 'x ' : 'a '}${ITEMS[q.reward].name}.`, 'loot'); }
      this.log(`You have completed the quest: ${q.name}!`, 'ding');
      this.gainXP(Math.floor(q.xp * (1 + pl.level / 10)));
      EB.audio.ding(); this.closeWin('dialogWin'); this.renderQuests(); this.save();
    }
    renderQuests() {
      const qw = $('questWin'), act = Object.keys(this.quests).filter((id) => this.quests[id] === 'active');
      if (!act.length) { qw.classList.add('hidden'); return; }
      qw.classList.remove('hidden');
      qw.innerHTML = '<div class="wtitle" style="margin-bottom:2px">Quests</div>' + act.map((id) => { const q = QUESTS[id], n = Math.min(this.countItem(q.item), q.count); return `<div class="${n >= q.count ? 'qdone' : ''}">${q.name}<br><span>${ITEMS[q.item].name}: ${n}/${q.count}${n >= q.count ? ` - return to ${q.giver}` : ''}</span></div>`; }).join('');
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
      const list = this.mobs.filter((m) => m.alive && m.state !== 'idle' || (m.alive && m.pos.distanceTo(pl.pos) < 30));
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
      this.world.setBlock(x, y, z, D.BUILDABLE[this.buildSel]); EB.audio.block();
    }

    // ---------- commands ----------
    command(v) {
      const pl = this.player;
      if (v[0] !== '/') { this.log(`You say, '${v}'`, 'say'); return; }
      const cmd = v.slice(1).toLowerCase().split(/\s+/)[0];
      switch (cmd) {
        case 'save': this.save(true); break;
        case 'loc': this.log(`Your Location is ${pl.pos.x.toFixed(1)}, ${pl.pos.y.toFixed(1)}, ${pl.pos.z.toFixed(1)}`, 'sys'); break;
        case 'who': this.log('Players on Everblock:', 'sys'); this.mercs.forEach((m) => this.log(`[${m.level} ${m.role === 'healer' ? 'Cleric' : 'Warrior'}] ${m.name} (Mercenary) - in your group`, 'sys')); this.log(`[${pl.level} ${CLASSES[pl.cls].name}] ${pl.name} (${RACES[pl.race].name}) ZONE: ${this.lastZone}`, 'sys'); this.log('There is 1 player in Everblock.', 'sys'); break;
        case 'played': this.log(`You have played ${Math.floor(pl.played / 3600)}h ${Math.floor(pl.played / 60) % 60}m.`, 'sys'); break;
        case 'time': { const h = Math.floor(this.dayT * 24); this.log(`It is ${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'} in Everblock.`, 'sys'); break; }
        case 'corpse': this.otherCorpses.forEach((c) => this.log(`You have a corpse in ${EB.WORLD.ZONES[c.zone || 'everblock'].name}.`, 'sys')); if (!this.pcorpses.length && !this.otherCorpses.length) this.log('You have no corpses.', 'sys'); else this.pcorpses.forEach((c) => this.log(`Your corpse lies at ${c.pos.x.toFixed(0)}, ${c.pos.y.toFixed(0)}, ${c.pos.z.toFixed(0)} (${c.pos.distanceTo(pl.pos).toFixed(0)} away).`, 'sys')); break;
        case 'sit': this.sit(); break;
        case 'stand': this.stand(); break;
        case 'quests': { const q = Object.keys(this.quests); if (!q.length) this.log('You have no quests. Hail townsfolk to find work.', 'sys'); else q.forEach((id) => this.log(`${QUESTS[id].name}: ${this.quests[id] === 'done' ? 'Completed' : `${ITEMS[QUESTS[id].item].name} ${Math.min(this.countItem(QUESTS[id].item), QUESTS[id].count)}/${QUESTS[id].count} (return to ${QUESTS[id].giver})`}`, 'sys')); break; }
        case 'dismiss': { const m = this.mercs[this.mercs.length - 1]; if (m) this.dismissMerc(m); else this.log('You have no mercenaries.', 'sys'); break; }
        case 'zone': this.log(`You are in ${this.world.zoneName}.`, 'sys'); break;
        case 'help': this.log('Commands: /save /loc /who /played /time /corpse /quests /dismiss /zone /sit /stand. Press ? for key bindings.', 'help'); break;
        default: this.log('That is not a valid command. Try /help.', 'sys');
      }
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
        const sp = SPELLS[id];
        const el = document.createElement('div'); el.className = 'slot' + (sp.mana ? ' spell' : '');
        el.innerHTML = `<span class="k">${i + 1}</span><span class="ic">${sp.mana ? '✦' : '⚔'}</span>${sp.name}<div class="cd"></div>`;
        el.onclick = () => this.useAbility(id);
        ui.tooltipFor(el, () => `<div class="tn">${sp.name}</div>${sp.desc}<br>${sp.mana ? `Mana: ${sp.mana} &nbsp; ` : ''}Cast: ${sp.cast ? sp.cast + 's' : 'Instant'} &nbsp; Recast: ${sp.recast}s`);
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
      $('pName').textContent = pl.name;
      $('pLvl').textContent = `${pl.level} ${RACES[pl.race].name} ${CLASSES[pl.cls].name}`;
      ui.bar('pHp', 'pHpT', Math.max(0, pl.hp), pl.maxHp, `HP ${Math.max(0, Math.ceil(pl.hp))} / ${pl.maxHp}`);
      if (pl.maxMana) ui.bar('pMana', 'pManaT', pl.mana, pl.maxMana, `Mana ${Math.floor(pl.mana)} / ${pl.maxMana}`); else $('pManaBar').classList.add('hidden');
      const need = D.xpToNext(pl.level);
      ui.bar('pXp', 'pXpT', pl.xp, need, `XP ${Math.floor((pl.xp / need) * 100)}%`);
      $('autoInd').classList.toggle('on', pl.autoAttack);
      $('sitInd').classList.toggle('on', pl.sitting);
      $('buildInd').classList.toggle('on', this.buildMode);
      const at = $('atkSlot'); if (at) at.classList.toggle('active', pl.autoAttack);
      for (const h of this.hotbarEls || []) {
        const sp = SPELLS[h.id], left = (pl.cooldowns[h.id] || 0) - this.time;
        h.cd.style.height = left > 0 ? Math.min(100, (left / sp.recast) * 100) + '%' : '0%';
        h.el.classList.toggle('nomana', sp.mana > pl.mana);
        h.el.classList.toggle('active', !!(pl.casting && pl.casting.id === h.id));
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

    // ---------- main loop ----------
    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      let dt = (now - this.last) / 1000; this.last = now;
      if (!(dt > 0)) dt = 0.016;
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
        if (fx || fz) { moving = true; this.stand(); }
        const f = pl.forward(), r = new THREE.Vector3(-Math.cos(pl.yaw), 0, Math.sin(pl.yaw));
        let mx = f.x * fz + r.x * fx, mz = f.z * fz + r.z * fx;
        const l = Math.hypot(mx, mz);
        const speed = fz < 0 && !fx ? 3.2 : 5.6;
        if (l > 0) { mx = (mx / l) * speed; mz = (mz / l) * speed; }
        pl.vel.x = mx; pl.vel.z = mz;
        if (this.keys.Space && !typing) {
          if (pl.inWater) pl.vel.y = 3.2;
          else if (pl.onGround) { pl.vel.y = 8.2; moving = true; this.stand(); }
        }
        if (pl.sitting) { pl.vel.x = pl.vel.z = 0; }
        const oy = pl.pos.y;
        const res = physicsMove(world, pl, dt, true);
        if (res.stepped) this.eyeOffset = (this.eyeOffset || 0) - (pl.pos.y - oy);
        this.updateCasting(dt, !!(fx || fz));
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
            if (m.maxMana) m.mana = Math.min(m.maxMana, m.mana + (3 + Math.floor(m.level / 2)) * (ooc ? 2 : 1));
          }
          if (pl.maxMana) {
            const ms = pl.castStat();
            let mR = 1 + Math.floor(pl.level / 5);
            if (pl.sitting) mR = 4 + Math.floor(pl.level / 2) + Math.floor(ms / 40);
            pl.mana = Math.min(pl.maxMana, pl.mana + mR);
          }
        }
      }
      // buffs
      for (const b of pl.buffs) b.left -= dt;
      for (const m of this.mercs) { for (const b of m.buffs) b.left -= dt; if (m.buffs.some((b) => b.left <= 0)) { m.buffs = m.buffs.filter((b) => b.left > 0); m.hp = Math.min(m.hp, m.maxHp); } }
      const expired = pl.buffs.filter((b) => b.left <= 0);
      if (expired.length) { for (const b of expired) this.log(`Your ${b.name} spell has worn off.`, 'spell'); pl.buffs = pl.buffs.filter((b) => b.left > 0); pl.hp = Math.min(pl.hp, pl.maxHp); }
      // spawns & entities
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 1; this.updateSpawns(false); }
      for (const m of this.mobs.slice()) {
        if (!m.alive || m.state !== 'idle' || m.pos.distanceTo(pl.pos) < 140) m.update(dt, this);
      }
      for (const n of this.npcs) n.update(dt, this);
      for (const m of this.mercs.slice()) m.update(dt, this);
      this.separate();
      for (const c of this.pcorpses) c.update(dt, this);
      if (this.fx) this.fx = this.fx.filter((f) => { f.life -= dt; f.m.scale.multiplyScalar(1 + dt * 3); f.m.material.opacity = Math.max(0, f.life * 1.6); if (f.life <= 0) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); return false; } return true; });
      this.updatePlayerModel(dt, moving);
      this.updateCamera();
      this.updateSky(dt);
      const camP = this.camera.position;
      const fit = (e) => { const dc = e.plate.position.distanceTo(camP), k = U.clamp(dc / 11, 0.42, 1); e.plate.scale.set(4.4 * k, 0.82 * k, 1); return dc; };
      for (const e of this.mobs) { const dc = fit(e); e.plate.visible = dc > 2.2 && e.pos.distanceTo(pl.pos) < (e === this.target ? 80 : 38); }
      for (const e of this.npcs) { const dc = fit(e); e.plate.visible = dc > 2.2 && e.pos.distanceTo(pl.pos) < 30; }
      for (const e of this.mercs) e.plate.visible = fit(e) > 2.2;
      for (const zm of this.zoneMeshes) zm.material.opacity = 0.2 + 0.12 * Math.sin(this.time * 3);
      if (this.target) { const t = this.target; this.ring.visible = true; this.ring.position.set(t.pos.x, t.pos.y + 0.06, t.pos.z); this.ring.scale.setScalar(Math.max(0.8, t.hw * 2.2)); this.ring.rotation.z += dt; }
      this.world.updateChunks(this.camera.position.x, this.camera.position.z, 7, 2);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.1;
        this.updateHUD();
        this.updateGroupBars();
        this.drawMinimap();
        if ((this.questT = (this.questT || 0) + 1) % 10 === 0) this.renderQuests();
        const z = this.world.zoneAt(pl.pos.x, pl.pos.y, pl.pos.z);
        if (z !== this.lastZone) { if (this.lastZone) { this.log(`You have entered ${z}.`, 'sys'); ui.center(z, null, 2.2); } this.lastZone = z; }
      }
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = 30; this.save(); }
      const eye = this.camera.position;
      const under = this.world.isWater(eye.x, eye.y, eye.z);
      if (under !== this.under) { this.under = under; let el = document.getElementById('underwater'); if (!el) { el = document.createElement('div'); el.id = 'underwater'; document.body.appendChild(el); } el.style.display = under ? 'block' : 'none'; }
    }
    updatePlayerModel(dt, moving) {
      const pl = this.player, M = this.pmodel;
      M.group.visible = this.camDist > 0 && pl.alive;
      M.group.position.copy(pl.pos);
      M.group.rotation.y = pl.yaw;
      if (moving && pl.onGround) this.pWalk = (this.pWalk || 0) + dt * 11;
      if (this.pAttackAnim > 0) { this.pAttackAnim += dt * 3.5; if (this.pAttackAnim >= 1) this.pAttackAnim = 0; }
      M.parts.weapon.visible = !!pl.equip.primary;
      animateModel(M, this.pWalk || 0, moving && pl.onGround, this.pAttackAnim || 0, pl.sitting);
    }
    updateCamera() {
      const pl = this.player, cam = this.camera;
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
      const day = U.smoothstep(-0.12, 0.25, elev);
      const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * 0.8;
      const sunDir = new THREE.Vector3(Math.cos(ang), elev, 0.35).normalize();
      const cam = this.camera.position;
      this.sunMesh.position.copy(cam).addScaledVector(sunDir, 400);
      this.moonMesh.position.copy(cam).addScaledVector(sunDir, -400);
      this.sun.position.copy(cam).addScaledVector(sunDir, 100); this.sun.target.position.copy(cam);
      this.moonLight.position.copy(cam).addScaledVector(sunDir, -100); this.moonLight.target.position.copy(cam);
      this.sun.intensity = 0.85 * day;
      this.moonLight.intensity = 0.22 * (1 - day);
      const inDungeon = this.lastZone === 'The Sunken Crypt';
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
