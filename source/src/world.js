// Everblock - voxel world: atlas, generation, chunk meshing, raycasting
(function () {
  const EB = window.EB;
  const { B, BLOCKS } = EB.data;
  const U = EB.util;

  const W = 256, D = 256, H = 64, CS = 16, SEA = 20;
  const NCX = W / CS, NCZ = D / CS;

  const ZONES = {
    everblock: { name: 'Everblock', area: 'The Everblock Wilds', sky: { day: 0x87b5e8, night: 0x0a0f24 } },
    frostfang: { name: 'The Frostfang Highlands', area: 'The Frostfang Highlands', sky: { day: 0xb8cce0, night: 0x0c1428 } },
    desert: { name: 'The Sunscorched Expanse', area: 'The Sunscorched Expanse', sky: { day: 0xf2cf98, night: 0x160e24 } },
  };
  // v5: zone 3 layout
  const DS = { outpost: { x: 128, z: 222 }, oasis: { x: 62, z: 190, r: 14 }, hideout: { x: 196, z: 164 }, flats1: { x: 80, z: 132 }, flats2: { x: 188, z: 106 }, colossi: { x: 56, z: 62 }, djinn: { x: 206, z: 44 }, pyramid: { x: 128, z: 70 } };
  const DUNGEON_ZONES = new Set(['The Sunken Crypt', 'Tomb of Ankhet-Ra']);
  const FF = { outpost: { x: 128, z: 236 }, warcamp: { x: 78, z: 118 }, keep: { x: 158, z: 52 }, lake: { x: 200, z: 196, r: 26 }, yetis: { x: 196, z: 112 } };
  const LAYOUT = {
    town: { x: 128, z: 128, half: 22, g: 24 },
    dungeon: { x: 200, z: 58, g: 26 },
    graveyard: { x: 128, z: 198, g: 24 },
    gnollCamp: { x: 50, z: 120 },
    lake: { x: 66, z: 200, r: 24 },
    forest: { x: 120, z: 46, r: 46 },
  };

  // ---------------- Texture atlas ----------------
  function makeAtlas() {
    const TS = 16, N = 16;
    const cv = document.createElement('canvas');
    cv.width = TS * N; cv.height = TS * N;
    const ctx = cv.getContext('2d');
    const rnd = U.mulberry32(1234);
    function px(t, x, y, r, g, b) {
      const tx = (t % N) * TS, ty = Math.floor(t / N) * TS;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(tx + x, ty + y, 1, 1);
    }
    function noiseTile(t, base, vary, fn) {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const n = (rnd() - 0.5) * vary;
        let c = [base[0] + n, base[1] + n, base[2] + n];
        if (fn) c = fn(x, y, c, n) || c;
        px(t, x, y, c[0], c[1], c[2]);
      }
    }
    // 0 grass top
    noiseTile(0, [92, 160, 60], 40, (x, y, c) => (rnd() < 0.08 ? [c[0] + 20, c[1] + 30, c[2]] : c));
    // 1 grass side
    noiseTile(1, [134, 96, 62], 30, (x, y, c) => (y < 3 + (rnd() < 0.5 ? 1 : 0) ? [92 + rnd() * 20, 160 + rnd() * 20, 60] : c));
    // 2 dirt
    noiseTile(2, [134, 96, 62], 34, (x, y, c) => (rnd() < 0.06 ? [c[0] - 30, c[1] - 25, c[2] - 20] : c));
    // 3 stone
    noiseTile(3, [128, 128, 128], 28, (x, y, c) => (rnd() < 0.07 ? [c[0] - 30, c[1] - 30, c[2] - 30] : c));
    // 4 sand
    noiseTile(4, [222, 208, 150], 20);
    // 5 water
    noiseTile(5, [48, 96, 200], 20, (x, y, c) => ((x + y * 2) % 7 === 0 ? [c[0] + 30, c[1] + 40, c[2] + 30] : c));
    // 6 log side
    noiseTile(6, [102, 76, 44], 20, (x, y, c) => (x % 4 === 0 ? [c[0] - 25, c[1] - 20, c[2] - 12] : c));
    // 7 log top
    noiseTile(7, [170, 136, 86], 16, (x, y, c) => { const d = Math.hypot(x - 7.5, y - 7.5); return (Math.floor(d) % 3 === 0 || d > 7) ? [110, 80, 46] : c; });
    // 8 leaves
    noiseTile(8, [52, 120, 40], 50, (x, y, c) => (rnd() < 0.15 ? [30, 70, 22] : c));
    // 9 cobble
    noiseTile(9, [118, 118, 118], 30, (x, y, c) => { const cx = (x + (Math.floor(y / 5) % 2) * 3) % 6, cy = y % 5; return (cx === 0 || cy === 0) ? [70, 70, 70] : c; });
    // 10 planks
    noiseTile(10, [176, 138, 84], 18, (x, y, c) => (y % 4 === 0 ? [120, 90, 52] : (x === ((y >> 2) * 5) % 16 ? [130, 100, 60] : c)));
    // 11 brick
    noiseTile(11, [160, 72, 56], 20, (x, y, c) => { const off = (Math.floor(y / 4) % 2) * 4; return (y % 4 === 0 || (x + off) % 8 === 0) ? [190, 180, 170] : c; });
    // 12 mossy stone brick
    noiseTile(12, [104, 110, 100], 26, (x, y, c) => { const off = (Math.floor(y / 8) % 2) * 8; if (y % 8 === 0 || (x + off) % 16 === 0) return [60, 64, 58]; return rnd() < 0.25 ? [70, 120, 50] : c; });
    // 13 lantern (emissive)
    noiseTile(13, [255, 200, 90], 30, (x, y, c) => ((x < 2 || x > 13 || y < 2 || y > 13) ? [60, 45, 30] : (x === 7 || y === 7 ? [90, 70, 40] : c)));
    // 14 bedrock
    noiseTile(14, [50, 50, 50], 40);
    // 15 roof tiles
    noiseTile(15, [150, 50, 40], 22, (x, y, c) => ((y % 4 === 3) || ((x + (Math.floor(y / 4) % 2) * 2) % 4 === 0 && y % 4 === 0) ? [100, 30, 24] : c));
    // 16 gravel
    noiseTile(16, [136, 128, 120], 50);
    // 17 crypt stone
    noiseTile(17, [70, 70, 84], 20, (x, y, c) => ((x % 8 === 0 || y % 8 === 0) ? [44, 44, 54] : c));
    // 18 tent hide
    noiseTile(18, [160, 130, 90], 26, (x, y, c) => (x % 5 === 0 ? [120, 95, 60] : c));
    // 19 snow top
    noiseTile(19, [240, 244, 250], 10);
    // 20 snow side
    noiseTile(20, [134, 96, 62], 30, (x, y, c) => (y < 4 ? [240, 244, 250] : c));
    // 21 ice
    noiseTile(21, [170, 210, 240], 16, (x, y, c) => ((x + y) % 9 === 0 || (x - y + 16) % 13 === 0 ? [230, 245, 255] : c));
    // 22 pine needles
    noiseTile(22, [34, 78, 48], 40, (x, y, c) => (rnd() < 0.12 ? [18, 44, 28] : rnd() < 0.05 ? [220, 230, 240] : c));
    // 23 blackstone
    noiseTile(23, [44, 46, 58], 18, (x, y, c) => { const off = (Math.floor(y / 5) % 2) * 5; return (y % 5 === 0 || (x + off) % 10 === 0) ? [24, 26, 34] : (rnd() < 0.05 ? [90, 140, 180] : c); });
    // 24 warbanner (red hide with a white tusk sigil)
    noiseTile(24, [150, 30, 26], 20, (x, y, c) => ((Math.abs(x - 7.5) < 1.5 && y > 3 && y < 12) || (y === 4 && x > 4 && x < 11) ? [230, 220, 200] : c));
    // ---- v5 desert tiles ----
    // 25 sandstone top
    noiseTile(25, [216, 188, 132], 16, (x, y, c) => (rnd() < 0.05 ? [c[0] - 22, c[1] - 22, c[2] - 18] : c));
    // 26 sandstone side (layered strata)
    noiseTile(26, [208, 176, 122], 14, (x, y, c) => (y % 5 === 0 ? [c[0] - 26, c[1] - 26, c[2] - 22] : y % 5 === 1 ? [c[0] + 10, c[1] + 8, c[2] + 6] : c));
    // 27 carved sandstone (hieroglyph frieze)
    noiseTile(27, [206, 174, 118], 12, (x, y, c) => {
      if (y === 1 || y === 14) return [150, 110, 64];
      if (y === 0 || y === 15) return [230, 200, 150];
      const gx = x % 8, gy = y - 3;
      if (gy < 0 || gy > 9) return c;
      const glyph = Math.floor(x / 8);
      const on = glyph === 0 ? ((gx === 3 || gx === 4) && gy > 2) || (gy === 3 && gx > 1 && gx < 6) || ((gx - 3.5) ** 2 + (gy - 1.2) ** 2 < 2.6 && (gx - 3.5) ** 2 + (gy - 1.2) ** 2 > 0.6) // ankh
        : (gy === 4 && gx > 0 && gx < 7) || ((gx === 2 || gx === 5) && gy > 1 && gy < 7) || (gy === 1 && (gx === 1 || gx === 6)) || (gy === 8 && gx > 1 && gx < 6); // eye / bird
      return on ? [96, 62, 34] : c;
    });
    // 28 gilded stone
    noiseTile(28, [228, 184, 64], 26, (x, y, c) => ((x + y) % 6 === 0 ? [255, 236, 150] : (x % 8 === 0 || y % 8 === 0) ? [168, 124, 30] : c));
    // 29 cactus top, 30 cactus side
    noiseTile(29, [72, 136, 58], 20, (x, y, c) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 6.5 ? [48, 100, 40] : d < 2.5 ? [110, 170, 80] : c; });
    noiseTile(30, [70, 132, 56], 18, (x, y, c) => (x % 4 === 0 ? [46, 96, 38] : (x % 4 === 2 && y % 4 === 1) ? [230, 226, 190] : c));
    // 31 palm fronds
    noiseTile(31, [70, 146, 50], 36, (x, y, c) => ((x + y) % 4 === 0 ? [40, 96, 30] : (x - y + 16) % 7 === 0 ? [120, 180, 70] : c));
    // 32 dune sand (warm, rippled)
    noiseTile(32, [226, 178, 112], 16, (x, y, c) => ((y + Math.round(Math.sin(x * 0.7) * 1.5)) % 5 === 0 ? [c[0] + 18, c[1] + 16, c[2] + 12] : c));
    // 33 spirit brazier (emissive teal flame in a bronze bowl)
    noiseTile(33, [120, 250, 220], 40, (x, y, c) => ((x < 2 || x > 13 || y > 12) ? [110, 80, 40] : y < 3 ? [60, 140, 130] : (Math.abs(x - 7.5) < 2 && y > 5) ? [230, 255, 250] : c));
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
    return { tex, canvas: cv, N };
  }

  // face table (from three.js fundamentals voxel article)
  const FACES = [
    { dir: [-1, 0, 0], shade: 0.78, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
    { dir: [1, 0, 0], shade: 0.78, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
    { dir: [0, -1, 0], shade: 0.5, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
    { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
    { dir: [0, 0, -1], shade: 0.66, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
    { dir: [0, 0, 1], shade: 0.88, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
  ];

  class World {
    constructor(seed, scene, zoneId) {
      this.zoneId = zoneId || 'everblock';
      const ZI = ZONES[this.zoneId];
      this.zoneName = ZI.name; this.defaultArea = ZI.area; this.sky = ZI.sky;
      this.zoneLines = [];
      this.seed = ((seed >>> 0) + (this.zoneId === 'everblock' ? 0 : this.zoneId === 'desert' ? 31337 : 7777)) >>> 0;
      this.scene = scene;
      this.data = new Uint8Array(W * D * H);
      this.height = new Int16Array(W * D);
      this.edits = {};
      this.chunks = new Array(NCX * NCZ).fill(null);
      this.dirty = new Set();
      this.spawns = [];
      this.npcs = [];
      this.zones = [];
      const atlas = makeAtlas();
      this.atlas = atlas;
      this.matOpaque = new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true });
      this.matWater = new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
      this.matGlow = new THREE.MeshBasicMaterial({ map: atlas.tex });
    }
    idx(x, y, z) { return x + z * W + y * W * D; }
    inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D; }
    get(x, y, z) {
      if (y < 0) return B.BEDROCK;
      if (x < 0 || z < 0 || x >= W || z >= D || y >= H) return B.AIR;
      return this.data[x + z * W + y * W * D];
    }
    rawSet(x, y, z, b) { if (this.inBounds(x, y, z)) this.data[x + z * W + y * W * D] = b; }
    isSolid(x, y, z) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (x < 0 || z < 0 || x >= W || z >= D) return true; // world border
      if (y < 0) return true;
      if (y >= H) return false;
      return BLOCKS[this.data[x + z * W + y * W * D]].solid;
    }
    isWater(x, y, z) { return this.get(Math.floor(x), Math.floor(y), Math.floor(z)) === B.WATER; }
    surfaceY(x, z) { // y of first air above top solid
      x = U.clamp(Math.floor(x), 0, W - 1); z = U.clamp(Math.floor(z), 0, D - 1);
      for (let y = H - 1; y >= 0; y--) { const b = this.data[x + z * W + y * W * D]; if (BLOCKS[b].solid) return y + 1; }
      return 1;
    }
    floorBelow(x, y, z) { // first air above a solid, searching downward from y
      x = Math.floor(x); z = Math.floor(z);
      for (let yy = Math.min(H - 1, Math.floor(y)); yy > 0; yy--) {
        if (BLOCKS[this.get(x, yy - 1, z)].solid && !BLOCKS[this.get(x, yy, z)].solid && !BLOCKS[this.get(x, yy + 1, z)].solid) return yy;
      }
      return this.surfaceY(x, z);
    }
    computeHeightColumn(x, z) {
      let h = -1;
      for (let y = H - 1; y >= 0; y--) { if (BLOCKS[this.data[x + z * W + y * W * D]].opaque) { h = y; break; } }
      this.height[x + z * W] = h;
    }
    zoneAt(x, y, z) {
      for (const zn of this.zones) {
        if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1 && (zn.yMax === undefined || y <= zn.yMax)) return zn.name;
      }
      return this.defaultArea;
    }

    // ---------------- Generation ----------------
    terrainHeight(x, z) {
      const s = this.seed, L = LAYOUT;
      let h = 17 + U.fbm(x / 70, z / 70, s, 4) * 22 + (U.fbm(x / 18, z / 18, s + 77, 2) - 0.5) * 5;
      let e = Math.min(x, z, W - 1 - x, D - 1 - z);
      if (Math.abs(x - 128) < 9 && z < 50) e += 22 * U.smoothstep(9, 4, Math.abs(x - 128));
      if (e < 22) h += Math.pow(22 - e, 1.35) * 1.1;
      // lake basin
      const dl = Math.hypot(x - L.lake.x, z - L.lake.z);
      if (dl < L.lake.r) h = Math.min(h, U.lerp(14, Math.max(h, 21), U.smoothstep(L.lake.r * 0.45, L.lake.r, dl)));
      // flatten areas
      const flat = (cx, cz, r0, r1, target, cheb) => {
        const d = cheb ? Math.max(Math.abs(x - cx), Math.abs(z - cz)) : Math.hypot(x - cx, z - cz);
        if (d < r1) h = U.lerp(target, h, U.smoothstep(r0, r1, d));
      };
      flat(L.town.x, L.town.z, 27, 42, L.town.g, true);
      flat(L.dungeon.x, L.dungeon.z, 24, 36, L.dungeon.g, true);
      flat(L.graveyard.x, L.graveyard.z, 11, 22, L.graveyard.g, true);
      flat(L.gnollCamp.x, L.gnollCamp.z, 12, 24, 24, false);
      return Math.max(2, Math.min(H - 8, Math.round(h)));
    }
    generate() {
      if (this.zoneId === 'frostfang') { this.genFrostfang(); this.finish(); return; }
      if (this.zoneId === 'desert') { this.genDesert(); this.finish(); return; }
      const s = this.seed;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const h = this.terrainHeight(x, z);
        for (let y = 0; y <= h; y++) {
          let b;
          if (y === 0) b = B.BEDROCK;
          else if (y < h - 3) b = B.STONE;
          else if (y < h) b = B.DIRT;
          else b = h <= SEA + 1 ? B.SAND : h > 44 ? B.SNOW : B.GRASS;
          this.rawSet(x, y, z, b);
        }
        if (h < 2 + 0) this.rawSet(x, 1, z, B.STONE);
        for (let y = h + 1; y <= SEA; y++) this.rawSet(x, y, z, B.WATER);
        if (h > 34 && h <= 44 && U.hash2(x, z, s + 5) < 0.5) this.rawSet(x, h, z, B.STONE);
      }
      this.buildRoads();
      this.buildTrees();
      this.buildTown();
      this.buildGraveyard();
      this.buildGnollCamp();
      this.buildDungeon();
      this.buildSpawns();
      this.buildNorthPass();
      this.finish();
    }
    finish() {
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) this.computeHeightColumn(x, z);
      // lantern positions for dynamic point lights
      this.lanterns = new Map();
      for (let i = 0; i < this.data.length; i++) if (this.data[i] === B.LANTERN || this.data[i] === B.BRAZIER) this.lanterns.set(i, this.idxPos(i));
      this.buildMapColors();
      this.renderMap();
    }
    // ---------- minimap ----------
    buildMapColors() {
      const cv = this.atlas.canvas, N = this.atlas.N;
      const all = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, CW = cv.width;
      this.blockColor = BLOCKS.map((bd) => {
        if (!bd) return [0, 0, 0];
        const t = bd.tiles[0], ox = (t % N) * 16, oy = Math.floor(t / N) * 16;
        let r = 0, g = 0, b = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const i = ((oy + y) * CW + ox + x) * 4; r += all[i]; g += all[i + 1]; b += all[i + 2]; }
        return [r / 256, g / 256, b / 256];
      });
    }
    renderMap() {
      if (!this.mapCanvas) { this.mapCanvas = document.createElement('canvas'); this.mapCanvas.width = W; this.mapCanvas.height = D; }
      const ctx = this.mapCanvas.getContext('2d'), img = ctx.createImageData(W, D);
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) this.mapPixel(img.data, x, z);
      ctx.putImageData(img, 0, 0);
    }
    mapPixel(data, x, z) {
      let y = H - 1; while (y > 0 && this.data[x + z * W + y * W * D] === B.AIR) y--;
      const c = this.blockColor[this.data[x + z * W + y * W * D]];
      const sh = 0.65 + (y - 16) / 60;
      const i = (x + z * W) * 4;
      data[i] = Math.min(255, c[0] * sh); data[i + 1] = Math.min(255, c[1] * sh); data[i + 2] = Math.min(255, c[2] * sh); data[i + 3] = 255;
    }
    updateMapAt(x, z) {
      if (!this.mapCanvas) return;
      const ctx = this.mapCanvas.getContext('2d'), img = ctx.createImageData(1, 1);
      const save = img.data; const tmp = new Uint8ClampedArray(W * D * 0 + 4);
      let y = H - 1; while (y > 0 && this.data[x + z * W + y * W * D] === B.AIR) y--;
      const c = this.blockColor[this.data[x + z * W + y * W * D]], sh = 0.65 + (y - 16) / 60;
      save[0] = c[0] * sh; save[1] = c[1] * sh; save[2] = c[2] * sh; save[3] = 255; void tmp;
      ctx.putImageData(img, x, z);
    }
    dispose() {
      for (const ch of this.chunks) if (ch) for (const m of ch.meshes) { this.scene.remove(m); m.geometry.dispose(); }
      this.chunks.fill(null);
      this.atlas.tex.dispose(); this.matOpaque.dispose(); this.matWater.dispose(); this.matGlow.dispose();
      this.data = null;
    }
    // ---------- Everblock north pass -> Frostfang ----------
    buildNorthPass() {
      const s = this.seed;
      for (let z = 0; z < 44; z++) for (let x = 118; x <= 138; x++) {
        const edge = Math.abs(x - 128);
        if (edge > 7) continue;
        const target = 26 + Math.floor(z / 12);
        const top = this.topY(x, z);
        if (edge <= 4) {
          for (let y = target + 1; y < H; y++) this.rawSet(x, y, z, B.AIR);
          for (let y = 1; y <= target; y++) if (this.get(x, y, z) === B.AIR || this.get(x, y, z) === B.WATER) this.rawSet(x, y, z, B.STONE);
          this.rawSet(x, target, z, edge <= 1 ? B.GRAVEL : B.GRASS);
        } else if (top > target + 6) {
          // cliff walls of the pass
          for (let y = target + 1; y <= Math.min(top, target + 12); y++) if (U.hash2(x * 3 + y, z, s) < 0.9) this.rawSet(x, y, z, B.STONE);
        }
      }
      this.road(128, 104, 128, 44, 1);
      for (const z of [4, 14, 28]) { const y = this.topY(123, z) + 1; this.lanternPost(123, y, z); this.lanternPost(133, this.topY(133, z) + 1, z); }
      this.zoneLines.push({ x0: 123, x1: 134, z0: 0, z1: 2.2, to: 'frostfang', arrive: { x: 128.5, z: 246.5, yaw: Math.PI }, label: 'The Frostfang Highlands', axis: 'z', at: 0.6 });
      this.zones.push({ name: 'Frostfang Pass', x0: 120, x1: 136, z0: 0, z1: 30 });
    }
    // ---------- Zone 2: The Frostfang Highlands ----------
    ffHeight(x, z) {
      const s = this.seed;
      let h = 24 + U.fbm(x / 60, z / 60, s, 4) * 24 + (U.fbm(x / 16, z / 16, s + 5, 2) - 0.5) * 6;
      let e = Math.min(x, z, W - 1 - x, D - 1 - z);
      if (Math.abs(x - 128) < 9 && z > 200) e = Math.max(e, 22 * U.smoothstep(9, 4, Math.abs(x - 128)) + e);
      if (Math.abs(x - 128) < 9 && z < 56) e = Math.max(e, 22 * U.smoothstep(9, 4, Math.abs(x - 128)) + e); // v5: north pass to the desert
      if (e < 22) h += Math.pow(22 - e, 1.35) * 1.2;
      const dl = Math.hypot(x - FF.lake.x, z - FF.lake.z);
      if (dl < FF.lake.r) h = Math.min(h, U.lerp(17, Math.max(h, 23), U.smoothstep(FF.lake.r * 0.5, FF.lake.r, dl)));
      const flat = (cx, cz, r0, r1, target) => { const d = Math.hypot(x - cx, z - cz); if (d < r1) h = U.lerp(target, h, U.smoothstep(r0, r1, d)); };
      flat(FF.outpost.x, FF.outpost.z, 9, 18, 27);
      flat(FF.warcamp.x, FF.warcamp.z, 20, 30, 28);
      flat(FF.keep.x, FF.keep.z, 22, 32, 30);
      if (Math.abs(x - 128) < 6 && z > 212) h = U.lerp(h, 27, U.smoothstep(6, 3, Math.abs(x - 128)));
      if (Math.abs(x - 128) < 6 && z < 46) h = U.lerp(h, 30, U.smoothstep(6, 3, Math.abs(x - 128)));
      return Math.max(3, Math.min(H - 6, Math.round(h)));
    }
    // v5: Frostfang north pass -> The Sunscorched Expanse
    buildFrostPass() {
      const s = this.seed;
      for (let z = 0; z < 46; z++) for (let x = 118; x <= 138; x++) {
        const edge = Math.abs(x - 128);
        if (edge > 7) continue;
        const target = 30, top = this.topY(x, z);
        if (edge <= 4) {
          for (let y = target + 1; y < H; y++) this.rawSet(x, y, z, B.AIR);
          for (let y = 1; y <= target; y++) { const b = this.get(x, y, z); if (b === B.AIR || b === B.WATER || b === B.ICE) this.rawSet(x, y, z, B.STONE); }
          this.rawSet(x, target, z, edge <= 1 ? B.GRAVEL : B.SNOW);
        } else if (top > target + 5) {
          for (let y = target + 1; y <= Math.min(top, target + 12); y++) if (U.hash2(x * 3 + y, z, s) < 0.9) this.rawSet(x, y, z, B.STONE);
        } else if (top < target) {
          for (let y = top + 1; y <= target + 2; y++) this.rawSet(x, y, z, B.STONE);
        }
      }
      for (const z of [4, 16, 30]) { this.lanternPost(123, this.topY(123, z) + 1, z); this.lanternPost(133, this.topY(133, z) + 1, z); }
      this.zoneLines.push({ x0: 123, x1: 134, z0: 0, z1: 2.2, to: 'desert', arrive: { x: 128.5, z: 246.5, yaw: Math.PI }, label: 'The Sunscorched Expanse', axis: 'z', at: 0.6 });
      this.zones.push({ name: 'Frostfang North Pass', x0: 120, x1: 136, z0: 0, z1: 30 });
    }
    genFrostfang() {
      const s = this.seed, SEA2 = 22;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const h = this.ffHeight(x, z);
        for (let y = 0; y <= h; y++) {
          let b = y === 0 ? B.BEDROCK : y < h - 3 ? B.STONE : y < h ? B.DIRT : B.SNOW;
          if (y === h && h > 44 && U.hash2(x, z, s + 9) < 0.35) b = B.STONE;
          this.rawSet(x, y, z, b);
        }
        for (let y = h + 1; y <= SEA2; y++) this.rawSet(x, y, z, y === SEA2 ? B.ICE : B.WATER);
      }
      // pines
      for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
        if (this.ffProtected(x, z)) continue;
        const y = this.topY(x, z);
        if (this.get(x, y, z) !== B.SNOW) continue;
        const dens = U.fbm(x / 40, z / 40, s + 44, 2) > 0.55 ? 0.05 : 0.01;
        if (U.hash2(x, z, s + 99) < dens) this.pine(x, y + 1, z, U.hash2(x, z, s + 3));
      }
      this.ffRoad(128, 250, FF.outpost.x, FF.outpost.z);
      this.ffRoad(FF.outpost.x, FF.outpost.z - 6, FF.warcamp.x + 18, FF.warcamp.z + 10);
      this.ffRoad(FF.outpost.x, FF.outpost.z - 6, FF.keep.x, FF.keep.z + 24);
      this.ffRoad(128, 4, 128, 44); this.ffRoad(128, 44, FF.keep.x - 18, FF.keep.z + 24);
      this.buildOutpost(); this.buildWarcamp(); this.buildFrozenKeep(); this.buildFrostPass();
      this.zoneLines.push({ x0: 123, x1: 134, z0: D - 2.2, z1: D, to: 'everblock', arrive: { x: 128.5, z: 6.5, yaw: 0 }, label: 'Everblock', axis: 'z', at: D - 0.6 });
      this.zones.push({ name: 'Frostfang Pass', x0: 120, x1: 136, z0: 226, z1: 255 });
      // spawns
      const sp = (type, x, z, count, radius, respawn, opt) => this.spawns.push(Object.assign({ type, x, z, count, radius, respawn }, opt || {}));
      sp('frost_wolf', 170, 170, 3, 10, 90); sp('frost_wolf', 70, 200, 3, 10, 90); sp('frost_wolf', 110, 170, 2, 8, 90, { alt: 'whitefang', altChance: 0.15 });
      sp('orc_grunt', FF.warcamp.x, FF.warcamp.z, 4, 10, 100); sp('orc_grunt', FF.warcamp.x + 10, FF.warcamp.z - 8, 2, 4, 100);
      sp('orc_shaman', FF.warcamp.x - 6, FF.warcamp.z + 5, 2, 4, 110);
      sp('grimtusk', FF.warcamp.x, FF.warcamp.z - 3, 1, 1, 420);
      sp('yeti', FF.yetis.x, FF.yetis.z, 3, 14, 120); sp('yeti', 60, 60, 2, 12, 120);
      sp('frost_giant', FF.keep.x, FF.keep.z + 6, 2, 5, 150); sp('frost_giant', FF.keep.x - 8, FF.keep.z + 2, 1, 2, 150);
      sp('vorgath', FF.keep.x, FF.keep.z - 8, 1, 1, 600, { y: this.keepFloor });
    }
    ffProtected(x, z) {
      if (Math.hypot(x - FF.outpost.x, z - FF.outpost.z) < 14) return true;
      if (Math.hypot(x - FF.warcamp.x, z - FF.warcamp.z) < 22) return true;
      if (Math.max(Math.abs(x - FF.keep.x), Math.abs(z - FF.keep.z)) < 22) return true;
      if (Math.abs(x - 128) < 6 && z > 200) return true;
      if (Math.abs(x - 128) < 9 && z < 50) return true;
      return false;
    }
    ffRoad(x0, z0, x1, z1) {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
      for (let i = 0; i <= n; i++) {
        const t = i / n, cx = Math.round(x0 + (x1 - x0) * t), cz = Math.round(z0 + (z1 - z0) * t);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const x = cx + dx, z = cz + dz; if (!this.inBounds(x, 1, z)) continue;
          const y = this.topY(x, z); if (this.get(x, y, z) === B.SNOW) this.rawSet(x, y, z, B.GRAVEL);
        }
      }
    }
    pine(x, y, z, r) {
      const th = 5 + Math.floor(r * 4);
      for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.LOG);
      for (let l = 0; l < th - 1; l++) {
        const yy = y + 2 + l, rad = Math.max(0, Math.floor((th - 1 - l) / 2));
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + 0.5) continue;
          if (this.get(x + dx, yy, z + dz) === B.AIR) this.rawSet(x + dx, yy, z + dz, B.PINE);
        }
      }
      this.rawSet(x, y + th, z, B.PINE); this.rawSet(x, y + th + 1, z, B.PINE);
    }
    buildOutpost() {
      const O = FF.outpost, g = this.topY(O.x, O.z);
      this.fill(O.x - 6, g + 1, O.z - 6, O.x + 6, H - 1, O.z + 6, B.AIR);
      this.fill(O.x - 6, g, O.z - 6, O.x + 6, g, O.z + 6, B.PLANKS);
      // lean-to shelter
      this.fill(O.x + 2, g + 1, O.z - 5, O.x + 2, g + 3, O.z - 5, B.LOG); this.fill(O.x + 6, g + 1, O.z - 5, O.x + 6, g + 3, O.z - 5, B.LOG);
      this.fill(O.x + 2, g + 4, O.z - 6, O.x + 6, g + 4, O.z - 2, B.WOOL);
      this.rawSet(O.x, g + 1, O.z, B.COBBLE); this.rawSet(O.x, g + 2, O.z, B.LANTERN);
      for (const [x, z] of [[O.x - 6, O.z - 6], [O.x + 6, O.z - 6], [O.x - 6, O.z + 6], [O.x + 6, O.z + 6]]) this.lanternPost(x, g + 1, z);
      this.npcs.push({ kind: 'binder', name: 'Scout Hollis', x: O.x - 2.5, y: g + 1, z: O.z - 2.5, color: 0x3a6a3a, sub: '<Ranger Outpost>' });
      this.npcs.push({ kind: 'quest', name: 'Trapper Gunnar', x: O.x + 4.5, y: g + 1, z: O.z - 3.5, color: 0x7a5a3a, sub: '<Trapper>' });
      this.bind = { x: O.x + 0.5, y: g + 1, z: O.z + 3.5 };
      this.zones.push({ name: 'Hollis Outpost', x0: O.x - 7, x1: O.x + 7, z0: O.z - 7, z1: O.z + 7 });
    }
    buildWarcamp() {
      const C = FF.warcamp, g = this.topY(C.x, C.z);
      this.fill(C.x - 19, g + 1, C.z - 19, C.x + 19, H - 1, C.z + 19, B.AIR);
      for (let z = C.z - 19; z <= C.z + 19; z++) for (let x = C.x - 19; x <= C.x + 19; x++) if (Math.hypot(x - C.x, z - C.z) < 19) { this.fill(x, g - 2, z, x, g - 1, z, B.DIRT); this.rawSet(x, g, z, (x + z) % 5 ? B.SNOW : B.GRAVEL); }
      for (let a = 0; a < 90; a++) {
        const ang = (a / 90) * Math.PI * 2;
        if ((ang > 0.5 && ang < 0.8) || (ang > 3.6 && ang < 3.9)) continue; // two gates
        const x = Math.round(C.x + Math.cos(ang) * 17), z = Math.round(C.z + Math.sin(ang) * 17);
        for (let y = g + 1; y <= g + 4; y++) this.rawSet(x, y, z, B.LOG);
        if (a % 3 === 0) this.rawSet(x, g + 5, z, B.LOG);
      }
      const tent = (tx, tz) => {
        const ty = g + 1;
        for (let l = 0; l < 3; l++) for (let dz = -2; dz <= 2; dz++) { this.rawSet(tx - 2 + l, ty + l, tz + dz, B.WOOL); this.rawSet(tx + 2 - l, ty + l, tz + dz, B.WOOL); }
        for (let dz = -2; dz <= 2; dz++) this.rawSet(tx, ty + 3, tz + dz, B.LOG);
      };
      tent(C.x - 10, C.z - 6); tent(C.x + 9, C.z - 7); tent(C.x - 8, C.z + 9); tent(C.x + 8, C.z + 8);
      // war banner tower
      this.fill(C.x - 1, g + 1, C.z - 12, C.x + 1, g + 6, C.z - 12, B.LOG);
      this.fill(C.x - 1, g + 4, C.z - 11, C.x + 1, g + 6, C.z - 11, B.BANNER);
      for (const [x, z] of [[C.x + 4, C.z + 2], [C.x - 4, C.z - 1], [C.x + 1, C.z + 11]]) { this.rawSet(x, g + 1, z, B.COBBLE); this.rawSet(x, g + 2, z, B.LANTERN); }
      this.zones.push({ name: 'Frostfang Warcamp', x0: C.x - 18, x1: C.x + 18, z0: C.z - 18, z1: C.z + 18 });
    }
    buildFrozenKeep() {
      const K = FF.keep, g = this.topY(K.x, K.z);
      const hf = 16;
      this.fill(K.x - hf - 2, g + 1, K.z - hf - 2, K.x + hf + 2, H - 1, K.z + hf + 2, B.AIR);
      this.fill(K.x - hf, g, K.z - hf, K.x + hf, g, K.z + hf, B.ICE);
      // outer wall with a 3-wide, 5-tall gate in the south
      for (let i = -hf; i <= hf; i++) for (const [x, z] of [[K.x + i, K.z - hf], [K.x + i, K.z + hf], [K.x - hf, K.z + i], [K.x + hf, K.z + i]]) {
        this.fill(x, g - 1, z, x, g + 8, z, (i + 40) % 6 === 0 ? B.ICE : B.BLACKSTONE);
        if ((i & 1) === 0) this.rawSet(x, g + 9, z, B.BLACKSTONE);
      }
      this.fill(K.x - 1, g + 1, K.z + hf, K.x + 1, g + 5, K.z + hf, B.AIR);
      this.rawSet(K.x - 2, g + 6, K.z + hf + 1, B.LANTERN); this.rawSet(K.x + 2, g + 6, K.z + hf + 1, B.LANTERN);
      // inner hall (roofed) with its own doorway, Vorgath waits inside
      const hx0 = K.x - 9, hx1 = K.x + 9, hz0 = K.z - 14, hz1 = K.z - 1;
      for (let y = g + 1; y <= g + 7; y++) for (let z = hz0; z <= hz1; z++) for (let x = hx0; x <= hx1; x++) {
        if (x === hx0 || x === hx1 || z === hz0 || z === hz1) this.rawSet(x, y, z, B.BLACKSTONE);
      }
      this.fill(hx0, g + 8, hz0, hx1, g + 8, hz1, B.ICE);
      this.fill(K.x - 1, g + 1, hz1, K.x + 1, g + 5, hz1, B.AIR);
      for (const [x, z] of [[hx0 + 3, hz0 + 3], [hx1 - 3, hz0 + 3], [hx0 + 3, hz1 - 3], [hx1 - 3, hz1 - 3]]) { this.fill(x, g + 1, z, x, g + 7, z, B.ICE); }
      this.rawSet(hx0 + 1, g + 4, K.z - 7, B.LANTERN); this.rawSet(hx1 - 1, g + 4, K.z - 7, B.LANTERN);
      this.rawSet(K.x, g + 4, hz0 + 1, B.LANTERN);
      this.keepFloor = g + 1;
      this.zones.push({ name: "Vorgath's Frozen Keep", x0: K.x - hf, x1: K.x + hf, z0: K.z - hf, z1: K.z + hf });
    }
    // ---------- Zone 3: The Sunscorched Expanse (v5) ----------
    dsHeight(x, z) {
      const s = this.seed;
      let h = 25 + U.fbm(x / 90, z / 90, s, 3) * 9;
      const w = U.fbm(x / 40, z / 40, s + 11, 2) * 6;
      const dune = Math.pow(Math.abs(Math.sin((x * 0.6 + z) * 0.07 + w)), 1.6) * 4.5;
      h += dune;
      let e = Math.min(x, z, W - 1 - x, D - 1 - z);
      if (Math.abs(x - 128) < 9 && z > 200) e = Math.max(e, 22 * U.smoothstep(9, 4, Math.abs(x - 128)) + e);
      if (e < 20) h += Math.pow(20 - e, 1.3) * 1.3;
      const dl = Math.hypot(x - DS.oasis.x, z - DS.oasis.z);
      if (dl < DS.oasis.r) h = Math.min(h, U.lerp(18, Math.max(h, 24), U.smoothstep(DS.oasis.r * 0.45, DS.oasis.r, dl)));
      const flat = (c, r0, r1, target, cheb) => { const d = cheb ? Math.max(Math.abs(x - c.x), Math.abs(z - c.z)) : Math.hypot(x - c.x, z - c.z); if (d < r1) h = U.lerp(target, h, U.smoothstep(r0, r1, d)); };
      flat(DS.outpost, 14, 24, 27, true); flat(DS.hideout, 13, 22, 27); flat(DS.pyramid, 27, 38, 27, true);
      flat(DS.colossi, 14, 24, 27); flat(DS.djinn, 11, 19, 28); flat(DS.flats1, 10, 20, 26); flat(DS.flats2, 10, 20, 26);
      if (Math.abs(x - 128) < 6 && z > 206) h = U.lerp(h, 27, U.smoothstep(6, 3, Math.abs(x - 128)));
      this._dune = dune;
      return Math.max(3, Math.min(H - 6, Math.round(h)));
    }
    dsProtected(x, z) {
      for (const k of ['outpost', 'hideout', 'colossi', 'djinn']) if (Math.hypot(x - DS[k].x, z - DS[k].z) < 20) return true;
      if (Math.max(Math.abs(x - DS.pyramid.x), Math.abs(z - DS.pyramid.z)) < 30) return true;
      if (Math.abs(x - 128) < 6 && z > 200) return true;
      return false;
    }
    dsRoad(x0, z0, x1, z1) {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
      for (let i = 0; i <= n; i++) {
        const t = i / n, cx = Math.round(x0 + (x1 - x0) * t), cz = Math.round(z0 + (z1 - z0) * t);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const x = cx + dx, z = cz + dz; if (!this.inBounds(x, 1, z)) continue;
          const y = this.topY(x, z), b = this.get(x, y, z);
          if (b === B.SAND || b === B.DUNE) this.rawSet(x, y, z, (dx === 0 && dz === 0) || U.hash2(x, z, 5) < 0.6 ? B.SANDSTONE : B.GRAVEL);
        }
      }
    }
    palm(x, y, z, r) {
      const th = 5 + Math.floor(r * 3);
      for (let i = 0; i < th; i++) this.rawSet(x + (i > th - 3 && r > 0.5 ? 1 : 0), y + i, z, B.LOG);
      const tx = x + (r > 0.5 ? 1 : 0), ty = y + th;
      this.rawSet(tx, ty, z, B.PALM);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 3; k++) this.rawSet(tx + dx * k, ty - (k === 3 ? 1 : 0), z + dz * k, B.PALM);
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { this.rawSet(tx + dx, ty, z + dz, B.PALM); this.rawSet(tx + dx * 2, ty - 1, z + dz * 2, B.PALM); }
    }
    cactus(x, y, z, r) {
      const th = 2 + Math.floor(r * 3);
      for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.CACTUS);
      if (th >= 3 && r > 0.4) { const dx = r > 0.7 ? 1 : 0, dz = dx ? 0 : 1; this.rawSet(x + dx, y + 1, z + dz, B.CACTUS); this.rawSet(x + dx, y + 2, z + dz, B.CACTUS); }
    }
    genDesert() {
      const s = this.seed;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const h = this.dsHeight(x, z), dune = this._dune;
        const e = Math.min(x, z, W - 1 - x, D - 1 - z);
        const dl = Math.hypot(x - DS.oasis.x, z - DS.oasis.z);
        for (let y = 0; y <= h; y++) {
          let b = y === 0 ? B.BEDROCK : y < h - 5 ? B.STONE : y < h - 1 ? B.SANDSTONE : B.SAND;
          if (y === h) b = (e < 16 && h > 36) ? B.SANDSTONE : dune > 3.2 && dl > DS.oasis.r + 6 ? B.DUNE : B.SAND;
          if (y === h && dl < DS.oasis.r + 5 && dl > DS.oasis.r * 0.7 && h > 20) b = B.GRASS;
          if (y === h - 1 && e < 16 && h > 34) b = B.SANDSTONE;
          this.rawSet(x, y, z, b);
        }
        for (let y = h + 1; y <= 21; y++) this.rawSet(x, y, z, B.WATER);
      }
      // oasis palms, cacti and scattered ruin pillars
      for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
        if (this.dsProtected(x, z)) continue;
        const y = this.topY(x, z), b = this.get(x, y, z), r = U.hash2(x, z, s + 3);
        const dl = Math.hypot(x - DS.oasis.x, z - DS.oasis.z);
        if (b === B.GRASS && U.hash2(x, z, s + 99) < 0.07) this.palm(x, y + 1, z, r);
        else if ((b === B.SAND || b === B.DUNE) && U.hash2(x, z, s + 98) < 0.004 && dl > DS.oasis.r + 8) this.cactus(x, y + 1, z, r);
        else if (b === B.SAND && U.hash2(x, z, s + 97) < 0.0012) { const hh = 1 + Math.floor(r * 4); for (let i = 1; i <= hh; i++) this.rawSet(x, y + i, z, i === hh && r > 0.7 ? B.GOLD : B.CARVED); }
      }
      const P = DS.pyramid;
      this.dsRoad(128, 252, DS.outpost.x, DS.outpost.z + 8);
      this.dsRoad(DS.outpost.x, DS.outpost.z - 10, P.x, P.z + 34);
      this.dsRoad(DS.outpost.x + 12, DS.outpost.z - 4, DS.hideout.x - 12, DS.hideout.z + 6);
      this.dsRoad(DS.outpost.x - 12, DS.outpost.z - 2, DS.oasis.x + 16, DS.oasis.z + 4);
      this.buildSunwardOutpost(); this.buildHideout(); this.buildColossi(); this.buildDjinnRest(); this.buildPyramid();
      this.zoneLines.push({ x0: 123, x1: 134, z0: D - 2.2, z1: D, to: 'frostfang', arrive: { x: 128.5, z: 6.5, yaw: 0 }, label: 'The Frostfang Highlands', axis: 'z', at: D - 0.6 });
      this.zones.push({ name: 'Frostfang Road', x0: 120, x1: 136, z0: 236, z1: 255 });
      this.zones.push({ name: 'Oasis of Sahra', x0: DS.oasis.x - 20, x1: DS.oasis.x + 20, z0: DS.oasis.z - 20, z1: DS.oasis.z + 20 });
      this.zones.push({ name: 'The Scorpion Flats', x0: DS.flats1.x - 18, x1: DS.flats1.x + 18, z0: DS.flats1.z - 18, z1: DS.flats1.z + 18 });
      this.zones.push({ name: 'The Scorpion Flats', x0: DS.flats2.x - 18, x1: DS.flats2.x + 18, z0: DS.flats2.z - 18, z1: DS.flats2.z + 18 });
      // spawns
      const sp = (type, x, z, count, radius, respawn, opt) => this.spawns.push(Object.assign({ type, x, z, count, radius, respawn }, opt || {}));
      sp('sand_scorpion', DS.flats1.x, DS.flats1.z, 4, 12, 100, { alt: 'szyrix', altChance: 0.18 }); sp('sand_scorpion', DS.flats2.x, DS.flats2.z, 3, 12, 100);
      sp('sand_scorpion', 160, 190, 2, 10, 100); sp('sand_scorpion', 96, 176, 2, 10, 100);
      sp('bandit', DS.hideout.x, DS.hideout.z, 4, 9, 110, { alt: 'rahzik', altChance: 0.2 }); sp('bandit', DS.hideout.x + 8, DS.hideout.z - 8, 1, 3, 110);
      sp('bandit_mystic', DS.hideout.x - 5, DS.hideout.z - 3, 2, 4, 120);
      sp('sand_giant', DS.colossi.x, DS.colossi.z, 3, 12, 150, { alt: 'gorukh', altChance: 0.18 });
      sp('dust_djinn', DS.djinn.x, DS.djinn.z, 3, 9, 130);
      sp('dust_djinn', 110, 128, 1, 6, 130); sp('sand_giant', 190, 214, 1, 8, 150);
      const fy = this.tombFloor, R = this.tombRooms;
      sp('mummy', R.entry.x, R.entry.z, 2, 3, 150, { y: fy });
      sp('mummy', R.embalm.x, R.embalm.z, 2, 3, 150, { y: fy }); sp('tomb_priest', R.embalm.x + 2, R.embalm.z - 2, 1, 1, 160, { y: fy });
      sp('mummy', R.treasury.x, R.treasury.z, 2, 3, 150, { y: fy }); sp('tomb_priest', R.treasury.x - 2, R.treasury.z - 2, 1, 1, 160, { y: fy });
      sp('dust_djinn', R.prison.x, R.prison.z, 2, 3, 150, { y: fy });
      sp('sand_scorpion', R.pit.x, R.pit.z, 3, 3, 150, { y: fy, lvl: [18, 20] });
      sp('sethek', R.vizier.x, R.vizier.z - 2, 1, 1, 480, { y: fy }); sp('tomb_priest', R.vizier.x - 3, R.vizier.z + 1, 2, 1, 160, { y: fy });
      sp('ankhetra', R.sanctum.x, R.sanctum.z, 1, 1, 900, { y: fy + 1 }); sp('mummy', R.sanctum.x - 6, R.sanctum.z + 2, 1, 1, 160, { y: fy, lvl: [22, 23] }); sp('mummy', R.sanctum.x + 6, R.sanctum.z + 2, 1, 1, 160, { y: fy, lvl: [22, 23] });
    }
    sandPost(x, y, z) { this.rawSet(x, y, z, B.SANDSTONE); this.rawSet(x, y + 1, z, B.CARVED); this.rawSet(x, y + 2, z, B.LANTERN); }
    buildSunwardOutpost() {
      const O = DS.outpost, g = 27, hx = 17, hz = 13;
      this.fill(O.x - hx - 2, g + 1, O.z - hz - 2, O.x + hx + 2, H - 1, O.z + hz + 2, B.AIR);
      this.fill(O.x - hx - 2, g - 3, O.z - hz - 2, O.x + hx + 2, g - 1, O.z + hz + 2, B.SANDSTONE);
      for (let z = O.z - hz; z <= O.z + hz; z++) for (let x = O.x - hx; x <= O.x + hx; x++) this.rawSet(x, g, z, (x + z) % 7 === 0 ? B.CARVED : B.SANDSTONE);
      // low crenellated walls with north + south gates
      for (let i = -hx; i <= hx; i++) for (const z of [O.z - hz, O.z + hz]) { if (Math.abs(i) <= 2) continue; this.fill(O.x + i, g + 1, z, O.x + i, g + 3, z, B.SANDSTONE); if ((i & 1) === 0) this.rawSet(O.x + i, g + 4, z, B.CARVED); }
      for (let i = -hz; i <= hz; i++) for (const x of [O.x - hx, O.x + hx]) { if (Math.abs(i) <= 1) continue; this.fill(x, g + 1, O.z + i, x, g + 3, O.z + i, B.SANDSTONE); if ((i & 1) === 0) this.rawSet(x, g + 4, O.z + i, B.CARVED); }
      for (const [x, z] of [[O.x - 3, O.z - hz - 1], [O.x + 3, O.z - hz - 1], [O.x - 3, O.z + hz + 1], [O.x + 3, O.z + hz + 1]]) this.sandPost(x, g + 1, z);
      const shop = this.building(O.x - 15, O.z - 11, O.x - 7, O.z - 4, 4, B.SANDSTONE, B.CARVED, 's', g);
      const temple = this.building(O.x + 7, O.z - 11, O.x + 15, O.z - 3, 5, B.CARVED, B.GOLD, 's', g);
      // fountain well + palms
      this.fill(O.x - 2, g + 1, O.z - 2, O.x + 2, g + 1, O.z + 2, B.CARVED); this.fill(O.x - 1, g + 1, O.z - 1, O.x + 1, g + 1, O.z + 1, B.WATER);
      this.rawSet(O.x, g, O.z, B.SANDSTONE);
      for (const [x, z] of [[O.x - 13, O.z + 9], [O.x + 13, O.z + 9], [O.x - 5, O.z + 10], [O.x + 5, O.z + 10]]) this.palm(x, g + 1, z, U.hash2(x, z, 7));
      // fence's awning
      this.fill(O.x + 9, g + 1, O.z + 3, O.x + 9, g + 3, O.z + 3, B.LOG); this.fill(O.x + 14, g + 1, O.z + 3, O.x + 14, g + 3, O.z + 3, B.LOG);
      this.fill(O.x + 9, g + 4, O.z + 2, O.x + 14, g + 4, O.z + 6, B.WOOL);
      for (const [x, z] of [[O.x - 7, O.z + 2], [O.x + 7, O.z + 2], [O.x - 7, O.z - 1], [O.x + 7, O.z - 1]]) this.sandPost(x, g + 1, z);
      const y = g + 1, T = { color: 0xd8c8a0 };
      this.npcs.push({ kind: 'binder', name: 'Sunpriestess Nefa', x: temple.x, y, z: temple.z, color: 0xe8d8a0, sub: '<Soul Notary>', turban: 0xe8e0c8 });
      this.npcs.push({ kind: 'merchant', name: 'Trader Hamid', x: shop.x, y, z: shop.z, color: 0x2a6a8a, stock: 'desert', faction: 'sunward', turban: 0xe0e0e0 });
      this.npcs.push({ kind: 'merchant', name: 'Fence Jabari', x: O.x + 11.5, y, z: O.z + 4.5, color: 0x4a3a5a, stock: 'fence', faction: 'bandit', sub: '<Sandreaver Fence>', turban: 0x2a2a3a, veil: 0x2a2a3a });
      this.npcs.push({ kind: 'quest', name: 'Caravan Master Idris', x: O.x - 4.5, y, z: O.z + 4.5, color: 0x9a5a2a, sub: '<Caravan Master>', turban: 0xc04030 });
      this.npcs.push({ kind: 'guard', name: 'Captain Asha', x: O.x + 3.5, y, z: O.z - hz + 2.5, color: 0xc89a30, sub: '<Sunward Guard>', tabard: 0xc89a30, turban: 0xf0e8d8 });
      this.npcs.push({ kind: 'quest', name: 'Loremaster Kheti', x: O.x - 10.5, y, z: O.z + 1.5, color: 0x3a4a8a, sub: '<Loremaster>', turban: 0x3a4a8a });
      this.npcs.push({ kind: 'guard', name: 'Sunward Guard Tamit', x: O.x - 3.5, y, z: O.z + hz - 1.5, color: 0xc89a30, sub: '<Sunward Guard>', tabard: 0xc89a30, turban: 0xf0e8d8 });
      this.npcs.push({ kind: 'guard', name: 'Sunward Guard Omari', x: O.x - 3.5, y, z: O.z - hz + 2.5, color: 0xc89a30, sub: '<Sunward Guard>', tabard: 0xc89a30, turban: 0xf0e8d8 });
      void T;
      this.bind = { x: O.x + 0.5, y: g + 1, z: O.z + 5.5 };
      this.zones.push({ name: 'Sunward Outpost', x0: O.x - hx, x1: O.x + hx, z0: O.z - hz, z1: O.z + hz });
    }
    buildHideout() {
      const C = DS.hideout, g = this.topY(C.x, C.z);
      this.fill(C.x - 15, g + 1, C.z - 15, C.x + 15, H - 1, C.z + 15, B.AIR);
      for (let a = 0; a < 70; a++) {
        const ang = (a / 70) * Math.PI * 2; if (ang > 2.2 && ang < 2.7) continue;
        const x = Math.round(C.x + Math.cos(ang) * 14), z = Math.round(C.z + Math.sin(ang) * 14), top = this.topY(x, z);
        const hh = 1 + Math.floor(U.hash2(x, z, 3) * 3); for (let y = top + 1; y <= top + hh; y++) this.rawSet(x, y, z, U.hash2(x, y, 4) < 0.3 ? B.CARVED : B.SANDSTONE);
      }
      const tent = (tx, tz, c) => { const ty = this.topY(tx, tz) + 1; for (let l = 0; l < 3; l++) for (let dz = -2; dz <= 2; dz++) { this.rawSet(tx - 2 + l, ty + l, tz + dz, c); this.rawSet(tx + 2 - l, ty + l, tz + dz, c); } for (let dz = -2; dz <= 2; dz++) this.rawSet(tx, ty + 3, tz + dz, B.LOG); };
      tent(C.x - 8, C.z - 6, B.WOOL); tent(C.x + 7, C.z - 7, B.BANNER); tent(C.x - 7, C.z + 7, B.WOOL); tent(C.x + 8, C.z + 6, B.WOOL);
      this.rawSet(C.x, g + 1, C.z, B.COBBLE); this.rawSet(C.x, g + 2, C.z, B.LANTERN);
      this.zones.push({ name: 'Sandreaver Hideout', x0: C.x - 15, x1: C.x + 15, z0: C.z - 15, z1: C.z + 15 });
    }
    buildColossi() {
      const C = DS.colossi, g = this.topY(C.x, C.z);
      const statue = (sx, sz, h, broken) => {
        for (const dx of [-2, 2]) this.fill(sx + dx - 1, g + 1, sz - 1, sx + dx, g + 6, sz, B.SANDSTONE);
        if (!broken) { this.fill(sx - 3, g + 7, sz - 1, sx + 3, g + 7 + h, sz + 1, B.SANDSTONE); this.fill(sx - 1, g + 8 + h, sz - 1, sx + 1, g + 10 + h, sz + 1, B.CARVED); this.rawSet(sx, g + 11 + h, sz, B.GOLD); }
        else { this.fill(sx - 3, g + 7, sz - 1, sx + 1, g + 8, sz + 1, B.SANDSTONE); this.fill(sx + 4, g + 1, sz + 2, sx + 7, g + 3, sz + 4, B.CARVED); }
      };
      statue(C.x - 7, C.z - 4, 5, false); statue(C.x + 8, C.z + 3, 0, true);
      for (let i = 0; i < 8; i++) { const a = i * 0.8, x = Math.round(C.x + Math.cos(a) * 12), z = Math.round(C.z + Math.sin(a) * 12), t = this.topY(x, z); const hh = 2 + (i % 3) * 2; this.fill(x, t + 1, z, x, t + hh, z, B.CARVED); }
      this.zones.push({ name: 'The Shattered Colossi', x0: C.x - 18, x1: C.x + 18, z0: C.z - 18, z1: C.z + 18 });
    }
    buildDjinnRest() {
      const C = DS.djinn, g = this.topY(C.x, C.z);
      this.fill(C.x - 5, g, C.z - 5, C.x + 5, g, C.z + 5, B.CARVED);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, x = Math.round(C.x + Math.cos(a) * 8), z = Math.round(C.z + Math.sin(a) * 8), t = this.topY(x, z); this.fill(x, t + 1, z, x, t + 6, z, B.CARVED); this.rawSet(x, t + 7, z, B.GOLD); }
      this.rawSet(C.x, g + 1, C.z, B.BRAZIER);
      this.zones.push({ name: "Djinn's Rest", x0: C.x - 12, x1: C.x + 12, z0: C.z - 12, z1: C.z + 12 });
    }
    // The Great Pyramid with an entrance hall; stairs descend into the multi-room Tomb of Ankhet-Ra
    buildPyramid() {
      const P = DS.pyramid, g = 27, HB = 20;
      this.fill(P.x - HB - 6, g + 1, P.z - HB - 6, P.x + HB + 6, H - 1, P.z + HB + 6, B.AIR);
      for (let z = P.z - HB - 6; z <= P.z + HB + 6; z++) for (let x = P.x - HB - 6; x <= P.x + HB + 6; x++) { this.fill(x, g - 2, z, x, g - 1, z, B.SANDSTONE); this.rawSet(x, g, z, B.SAND); }
      for (let L = 0; L <= HB; L++) {
        const hf = HB - L, y = g + 1 + L;
        for (let z = P.z - hf; z <= P.z + hf; z++) for (let x = P.x - hf; x <= P.x + hf; x++) {
          const edge = Math.max(Math.abs(x - P.x), Math.abs(z - P.z)) === hf;
          this.rawSet(x, y, z, L >= HB - 1 ? B.GOLD : edge && L % 4 === 3 ? B.CARVED : B.SANDSTONE);
        }
      }
      // entrance corridor from the south face
      const ez = P.z + HB;
      this.fill(P.x - 1, g + 1, P.z + 8, P.x + 1, g + 4, ez + 1, B.AIR);
      this.fill(P.x - 1, g, P.z + 8, P.x + 1, g, ez + 1, B.CARVED);
      for (const dx of [-2, 2]) this.fill(P.x + dx, g + 1, ez - 3, P.x + dx, g + 4, ez, B.CARVED);
      this.fill(P.x - 2, g + 5, ez - 3, P.x + 2, g + 5, ez, B.GOLD);
      this.rawSet(P.x - 3, g + 3, ez + 1, B.BRAZIER); this.rawSet(P.x + 3, g + 3, ez + 1, B.BRAZIER);
      // entrance hall
      const hx0 = P.x - 5, hx1 = P.x + 5, hz0 = P.z + 4, hz1 = P.z + 12;
      this.fill(hx0 - 1, g, hz0 - 1, hx1 + 1, g + 6, hz1 + 1, B.CARVED);
      this.fill(hx0, g + 1, hz0, hx1, g + 5, hz1, B.AIR);
      this.fill(P.x - 1, g + 1, hz1 + 1, P.x + 1, g + 4, hz1 + 1, B.AIR);
      for (const [x, z] of [[hx0, hz0], [hx1, hz0], [hx0, hz1], [hx1, hz1]]) this.fill(x, g + 1, z, x, g + 5, z, B.SANDSTONE);
      for (const [x, z] of [[hx0 + 1, hz0], [hx1 - 1, hz0], [hx0, hz1 - 3], [hx1, hz1 - 3]]) this.rawSet(x, g + 3, z, B.BRAZIER);
      // lower complex: 3x3 grid, north row merged into the Pharaoh's sanctum
      const x0 = P.x - 17, z0 = P.z - 37, fy = g - 9;
      const z1 = z0 + 33, x1 = x0 + 34;
      this.fill(x0, fy, z0, x1, g - 1, z1, B.SANDSTONE);
      for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) if (this.get(x, g, z) === B.AIR) this.rawSet(x, g, z, B.SAND);
      for (let y = fy; y <= g - 1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const edge = x === x0 || x === x1 || z === z0 || z === z1; if (edge && U.hash2(x * 5 + y, z, 17) < 0.5) this.rawSet(x, y, z, B.CARVED); }
      const room = (i, j) => ({ rx: x0 + 1 + i * 11, rz: z0 + 1 + j * 11, x: x0 + 1 + i * 11 + 5, z: z0 + 1 + j * 11 + 5 });
      // sanctum (north row)
      this.fill(x0 + 1, fy + 1, z0 + 1, x1 - 1, fy + 7, z0 + 10, B.AIR);
      for (let x = x0 + 3; x <= x1 - 3; x += 5) for (const z of [z0 + 2, z0 + 9]) { this.fill(x, fy + 1, z, x, fy + 7, z, B.CARVED); this.rawSet(x, fy + 4, z + (z === z0 + 2 ? 1 : -1), B.BRAZIER); }
      const sx = P.x, sz = z0 + 5;
      this.fill(sx - 3, fy + 1, sz - 3, sx + 3, fy + 1, sz + 2, B.GOLD);
      this.fill(sx - 1, fy + 2, sz - 3, sx + 1, fy + 3, sz - 3, B.GOLD); // throne
      this.fill(sx - 5, fy + 1, sz - 4, sx - 5, fy + 1, sz - 3, B.CARVED); this.fill(sx + 5, fy + 1, sz - 4, sx + 5, fy + 1, sz - 3, B.CARVED); // sarcophagi
      for (let j = 1; j <= 2; j++) for (let i = 0; i < 3; i++) {
        const r = room(i, j);
        this.fill(r.rx, fy + 1, r.rz, r.rx + 9, fy + 5, r.rz + 9, B.AIR);
        this.rawSet(r.rx + 4, fy + 3, r.rz - 1 + (j === 1 ? 0 : 0), B.BRAZIER);
        this.rawSet(r.rx - 1, fy + 3, r.rz + 4, B.BRAZIER);
        for (const [px, pz] of [[r.rx + 1, r.rz + 1], [r.rx + 8, r.rz + 1], [r.rx + 1, r.rz + 8], [r.rx + 8, r.rz + 8]]) if (U.hash2(px, pz, 9) < 0.55) this.fill(px, fy + 1, pz, px, fy + 5, pz, B.CARVED);
      }
      const door = (xa, za, xb, zb) => this.fill(xa, fy + 1, za, xb, fy + 3, zb, B.AIR);
      const r = (i, j) => room(i, j);
      door(x0 + 11, r(0, 2).rz + 3, x0 + 11, r(0, 2).rz + 5); door(x0 + 22, r(0, 2).rz + 3, x0 + 22, r(0, 2).rz + 5);
      door(r(0, 2).rx + 3, z0 + 22, r(0, 2).rx + 5, z0 + 22); door(r(2, 2).rx + 3, z0 + 22, r(2, 2).rx + 5, z0 + 22);
      door(x0 + 11, r(0, 1).rz + 3, x0 + 11, r(0, 1).rz + 5); door(x0 + 22, r(0, 1).rz + 3, x0 + 22, r(0, 1).rz + 5);
      door(P.x - 1, z0 + 11, P.x + 1, z0 + 11);
      // treasury gold piles, embalming slabs
      const tr = r(2, 2); for (let k = 0; k < 6; k++) this.rawSet(tr.rx + 2 + (k % 3) * 2, fy + 1, tr.rz + 6 + Math.floor(k / 3), B.GOLD);
      const em = r(0, 2); for (const dz of [2, 6]) this.fill(em.rx + 3, fy + 1, em.rz + dz, em.rx + 6, fy + 1, em.rz + dz, B.CARVED);
      // stairs from the hall (north wall) down to the entry room (1,2)
      for (let k = 1; k <= 9; k++) {
        const z = hz0 - k, fl = g - k;
        this.fill(P.x - 1, fl + 1, z, P.x + 1, fl + 5, z, B.AIR);
        this.fill(P.x - 1, fl - 1, z, P.x + 1, fl, z, B.CARVED);
        for (const dx of [-2, 2]) this.fill(P.x + dx, fl - 1, z, P.x + dx, fl + 5, z, B.SANDSTONE);
      }
      this.tombFloor = fy + 1; this.tombY = fy + 1;
      this.tombRooms = { sanctum: { x: sx + 0.5, z: sz + 0.5 }, entry: r(1, 2), embalm: r(0, 2), treasury: r(2, 2), prison: r(0, 1), pit: r(2, 1), vizier: r(1, 1) };
      for (const k of ['entry', 'embalm', 'treasury', 'prison', 'pit', 'vizier']) { this.tombRooms[k].x += 0.5; this.tombRooms[k].z += 0.5; }
      this.tombEntrance = { x: P.x + 0.5, z: ez + 3.5 };
      this.zones.push({ name: 'Tomb of Ankhet-Ra', x0, x1, z0, z1: hz0 - 1, yMax: g - 1 });
      this.zones.push({ name: 'The Great Pyramid', x0: P.x - HB, x1: P.x + HB, z0: P.z - HB, z1: P.z + HB });
    }
    topY(x, z) { for (let y = H - 1; y > 0; y--) if (this.get(x, y, z) !== B.AIR) return y; return 0; }
    road(x0, z0, x1, z1, w) {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
      for (let i = 0; i <= n; i++) {
        const t = i / n, cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
        for (let dx = -w; dx <= w; dx++) for (let dz = -w; dz <= w; dz++) {
          const x = Math.round(cx + dx), z = Math.round(cz + dz);
          if (!this.inBounds(x, 1, z)) continue;
          const y = this.topY(x, z);
          const b = this.get(x, y, z);
          if (b === B.GRASS || b === B.DIRT || b === B.SAND || b === B.SNOW) this.rawSet(x, y, z, B.GRAVEL);
        }
      }
    }
    buildRoads() {
      const L = LAYOUT, T = L.town;
      this.road(T.x - T.half - 2, T.z, L.gnollCamp.x + 10, L.gnollCamp.z, 1);
      this.road(T.x, T.z + T.half + 2, L.graveyard.x, L.graveyard.z - 10, 1);
      this.road(T.x + T.half + 2, T.z, T.x + 50, T.z, 1);
      this.road(T.x, T.z - T.half - 2, T.x + 20, T.z - 50, 1);
      this.road(T.x + 20, T.z - 50, L.dungeon.x - 28, L.dungeon.z, 1);
    }
    protectedArea(x, z) {
      const L = LAYOUT;
      if (Math.max(Math.abs(x - L.town.x), Math.abs(z - L.town.z)) < 30) return true;
      if (Math.max(Math.abs(x - L.dungeon.x), Math.abs(z - L.dungeon.z)) < 27) return true;
      if (Math.max(Math.abs(x - L.graveyard.x), Math.abs(z - L.graveyard.z)) < 12) return true;
      if (Math.hypot(x - L.gnollCamp.x, z - L.gnollCamp.z) < 13) return true;
      if (Math.abs(x - 128) < 7 && z < 46) return true;
      return false;
    }
    tree(x, y, z, r) {
      const th = 4 + Math.floor(r * 3);
      for (let i = 0; i < th; i++) this.rawSet(x, y + i, z, B.LOG);
      const top = y + th;
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy >= 0 ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy >= 0 || U.hash2(x + dx, z + dz + dy, this.seed) < 0.5)) continue;
          if (this.get(x + dx, top + dy, z + dz) === B.AIR) this.rawSet(x + dx, top + dy, z + dz, B.LEAVES);
        }
      }
      this.rawSet(x, top + 1, z, B.LEAVES);
    }
    buildTrees() {
      const L = LAYOUT, s = this.seed;
      for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
        if (this.protectedArea(x, z)) continue;
        const y = this.topY(x, z);
        if (this.get(x, y, z) !== B.GRASS) continue;
        const inForest = Math.hypot(x - L.forest.x, z - L.forest.z) < L.forest.r;
        const dens = inForest ? 0.05 : 0.008;
        const r = U.hash2(x, z, s + 99);
        if (r < dens) this.tree(x, y + 1, z, U.hash2(x, z, s + 3));
      }
    }
    fill(x0, y0, z0, x1, y1, z1, b) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.rawSet(x, y, z, b);
    }
    lanternPost(x, y, z) { this.rawSet(x, y, z, B.LOG); this.rawSet(x, y + 1, z, B.LOG); this.rawSet(x, y + 2, z, B.LANTERN); }
    building(x0, z0, x1, z1, h, wall, roof, door, g) {
      const y0 = g + 1;
      this.fill(x0, g, z0, x1, g, z1, B.PLANKS);
      this.fill(x0, y0, z0, x1, y0 + h + 6, z1, B.AIR);
      for (let y = y0; y < y0 + h; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1;
        if (!edgeX && !edgeZ) continue;
        let b = wall;
        if (edgeX && edgeZ) b = B.LOG;
        else if (y === y0 + 1 && ((edgeX ? z - z0 : x - x0) % 3 === 2)) b = B.AIR; // windows
        this.rawSet(x, y, z, b);
      }
      const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
      let dx = mx, dz = mz;
      if (door === 'n') dz = z0; else if (door === 's') dz = z1; else if (door === 'w') dx = x0; else dx = x1;
      this.rawSet(dx, y0, dz, B.AIR); this.rawSet(dx, y0 + 1, dz, B.AIR);
      // pyramid roof
      let ax0 = x0 - 1, az0 = z0 - 1, ax1 = x1 + 1, az1 = z1 + 1, y = y0 + h;
      while (ax0 <= ax1 && az0 <= az1) {
        for (let z = az0; z <= az1; z++) for (let x = ax0; x <= ax1; x++) {
          if (x === ax0 || x === ax1 || z === az0 || z === az1 || ax1 - ax0 < 2 || az1 - az0 < 2) this.rawSet(x, y, z, roof);
        }
        ax0++; az0++; ax1--; az1--; y++;
      }
      this.fill(x0 + 1, y0 + h, z0 + 1, x1 - 1, y0 + h, z1 - 1, B.PLANKS);
      this.rawSet(x0 + 1, y0, z0 + 1, B.LANTERN);
      const out = { x: dx + 0.5, z: dz + 0.5 };
      if (door === 'n') out.z -= 2; else if (door === 's') out.z += 2; else if (door === 'w') out.x -= 2; else out.x += 2;
      return out;
    }
    buildTown() {
      const T = LAYOUT.town, g = T.g, hf = T.half, cx = T.x, cz = T.z;
      // clear & floor
      this.fill(cx - hf - 3, g + 1, cz - hf - 3, cx + hf + 3, H - 1, cz + hf + 3, B.AIR);
      this.fill(cx - hf - 3, g - 3, cz - hf - 3, cx + hf + 3, g - 1, cz + hf + 3, B.DIRT);
      this.fill(cx - hf - 3, g, cz - hf - 3, cx + hf + 3, g, cz + hf + 3, B.GRASS);
      // roads
      this.fill(cx - 1, g, cz - hf - 3, cx + 1, g, cz + hf + 3, B.COBBLE);
      this.fill(cx - hf - 3, g, cz - 1, cx + hf + 3, g, cz + 1, B.COBBLE);
      // walls
      for (let i = -hf; i <= hf; i++) {
        for (const [x, z] of [[cx + i, cz - hf], [cx + i, cz + hf], [cx - hf, cz + i], [cx + hf, cz + i]]) {
          this.fill(x, g - 2, z, x, g + 6, z, B.COBBLE);
          if ((i & 1) === 0) this.rawSet(x, g + 7, z, B.COBBLE);
        }
      }
      // gates
      for (const [x0, z0, x1, z1] of [[cx - 1, cz - hf, cx + 1, cz - hf], [cx - 1, cz + hf, cx + 1, cz + hf], [cx - hf, cz - 1, cx - hf, cz + 1], [cx + hf, cz - 1, cx + hf, cz + 1]]) {
        this.fill(x0, g + 1, z0, x1, g + 4, z1, B.AIR);
        this.fill(x0, g, z0, x1, g, z1, B.COBBLE);
      }
      for (const [x, z] of [[cx - 2, cz - hf - 1], [cx + 2, cz - hf - 1], [cx - 2, cz + hf + 1], [cx + 2, cz + hf + 1], [cx - hf - 1, cz - 2], [cx - hf - 1, cz + 2], [cx + hf + 1, cz - 2], [cx + hf + 1, cz + 2]]) this.rawSet(x, g + 4, z, B.LANTERN);
      // towers
      for (const [tx, tz] of [[cx - hf, cz - hf], [cx + hf, cz - hf], [cx - hf, cz + hf], [cx + hf, cz + hf]]) {
        this.fill(tx - 2, g - 2, tz - 2, tx + 2, g + 9, tz + 2, B.COBBLE);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && ((dx + dz) & 1) === 0) this.rawSet(tx + dx, g + 10, tz + dz, B.COBBLE);
        this.rawSet(tx, g + 10, tz, B.LANTERN);
      }
      // fountain
      this.fill(cx - 3, g + 1, cz - 3, cx + 3, g + 1, cz + 3, B.COBBLE);
      this.fill(cx - 2, g + 1, cz - 2, cx + 2, g + 1, cz + 2, B.WATER);
      this.fill(cx - 2, g, cz - 2, cx + 2, g, cz + 2, B.COBBLE);
      this.fill(cx, g + 1, cz, cx, g + 3, cz, B.COBBLE);
      this.rawSet(cx, g + 4, cz, B.LANTERN);
      // buildings
      const shop = this.building(cx - 18, cz - 18, cx - 8, cz - 9, 4, B.PLANKS, B.ROOF, 's', g);
      const guild = this.building(cx + 7, cz - 19, cx + 19, cz - 8, 5, B.BRICK, B.ROOF, 's', g);
      const temple = this.building(cx - 18, cz + 8, cx - 7, cz + 19, 6, B.COBBLE, B.CRYPT, 'n', g);
      this.building(cx + 8, cz + 9, cx + 14, cz + 15, 3, B.PLANKS, B.ROOF, 'n', g);
      this.building(cx + 15, cz + 9, cx + 20, cz + 18, 3, B.PLANKS, B.ROOF, 'w', g);
      for (const [x, z] of [[cx - 5, cz - 5], [cx + 5, cz - 5], [cx - 5, cz + 5], [cx + 5, cz + 5], [cx - 12, cz - 3], [cx + 12, cz + 3], [cx + 3, cz - 14], [cx - 3, cz + 14]]) this.lanternPost(x, g + 1, z);
      const y = g + 1;
      this.npcs.push({ kind: 'merchant', name: 'Merchant Tiloria', x: shop.x, y, z: shop.z, color: 0x7a4a9a });
      this.npcs.push({ kind: 'trainer', name: 'Guild Coach Aldric', x: guild.x, y, z: guild.z, color: 0x9a2a2a });
      this.npcs.push({ kind: 'liaison', name: 'Sellsword Recruiter Brenna', x: cx - 8.5, y, z: cz + 3.5, color: 0x2a7a4a });
      this.npcs.push({ kind: 'binder', name: 'Soul-Notary Kerra', x: temple.x, y, z: temple.z, color: 0xdadaf0 });
      const gd = [[cx - 2.5, cz - hf + 2.5], [cx + 3.5, cz - hf + 2.5], [cx - 2.5, cz + hf - 1.5], [cx + 3.5, cz + hf - 1.5],
        [cx - hf + 2.5, cz - 2.5], [cx - hf + 2.5, cz + 3.5], [cx + hf - 1.5, cz - 2.5], [cx + hf - 1.5, cz + 3.5]];
      const gnames = ['Guard Brightblade', 'Guard Halric', 'Guard Mossen', 'Guard Tannis', 'Guard Rolf', 'Guard Pellar', 'Guard Ostin', 'Guard Veyla'];
      gd.forEach(([x, z], i) => this.npcs.push({ kind: 'guard', name: gnames[i], x, y, z, color: 0x3a5aa0 }));
      this.bind = { x: cx + 0.5, y: g + 1, z: cz + 5.5 };
      this.zones.push({ name: 'Everblock Keep', x0: cx - hf, x1: cx + hf, z0: cz - hf, z1: cz + hf });
    }
    buildGraveyard() {
      const G = LAYOUT.graveyard, g = G.g;
      this.fill(G.x - 9, g + 1, G.z - 9, G.x + 9, H - 1, G.z + 9, B.AIR);
      this.fill(G.x - 9, g, G.z - 9, G.x + 9, g, G.z + 9, B.DIRT);
      for (let i = -8; i <= 8; i++) {
        for (const [x, z] of [[G.x + i, G.z - 8], [G.x + i, G.z + 8], [G.x - 8, G.z + i], [G.x + 8, G.z + i]]) {
          if (Math.abs(i) <= 1 && z === G.z - 8) continue;
          this.rawSet(x, g + 1, z, B.COBBLE);
        }
      }
      for (let gx = -6; gx <= 6; gx += 3) for (let gz = -5; gz <= 6; gz += 3) {
        if (Math.abs(gx) <= 1 && gz < -2) continue;
        if (U.hash2(gx, gz, this.seed + 8) < 0.8) { this.rawSet(G.x + gx, g + 1, G.z + gz, B.STONE); this.rawSet(G.x + gx, g + 2, G.z + gz, B.STONE); }
      }
      this.fill(G.x - 1, g + 1, G.z + 5, G.x + 1, g + 4, G.z + 7, B.MOSSY);
      this.rawSet(G.x, g + 5, G.z + 6, B.LANTERN);
      this.zones.push({ name: 'The Forsaken Graveyard', x0: G.x - 9, x1: G.x + 9, z0: G.z - 9, z1: G.z + 9 });
    }
    buildGnollCamp() {
      const C = LAYOUT.gnollCamp;
      const g = this.topY(C.x, C.z);
      this.fill(C.x - 2, g, C.z - 2, C.x + 2, g, C.z + 2, B.GRAVEL);
      this.rawSet(C.x, g, C.z, B.COBBLE); this.rawSet(C.x, g + 1, C.z, B.LANTERN);
      const tent = (tx, tz) => {
        const ty = this.topY(tx, tz) + 1;
        for (let l = 0; l < 3; l++) for (let dz = -2; dz <= 2; dz++) {
          this.rawSet(tx - 2 + l, ty + l, tz + dz, B.WOOL); this.rawSet(tx + 2 - l, ty + l, tz + dz, B.WOOL);
        }
        for (let dz = -2; dz <= 2; dz++) this.rawSet(tx, ty + 3, tz + dz, B.LOG);
      };
      tent(C.x - 7, C.z - 5); tent(C.x + 6, C.z - 6); tent(C.x - 6, C.z + 7);
      for (let a = 0; a < 40; a++) {
        if (a > 14 && a < 20) continue;
        const ang = (a / 40) * Math.PI * 2, x = Math.round(C.x + Math.cos(ang) * 11), z = Math.round(C.z + Math.sin(ang) * 11);
        const y = this.topY(x, z) + 1;
        this.rawSet(x, y, z, B.LOG); this.rawSet(x, y + 1, z, B.LOG);
      }
      this.zones.push({ name: 'Darkpaws Gnoll Camp', x0: C.x - 12, x1: C.x + 12, z0: C.z - 12, z1: C.z + 12 });
    }
    buildDungeon() {
      const Dg = LAYOUT.dungeon, g = Dg.g;
      const x0 = Dg.x - 18, x1 = Dg.x + 18, z0 = Dg.z - 18, z1 = Dg.z + 18;
      const fy = g - 5, cy = g + 1; // floor y, ceiling y
      this.fill(x0 - 4, g + 1, z0 - 4, x1 + 4, H - 1, z1 + 4, B.AIR);
      this.fill(x0, fy, z0, x1, cy + 1, z1, B.CRYPT);
      // mossy outer shell
      for (let y = fy; y <= cy + 2; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (y === cy + 2) { if (edge && ((x + z) & 1) === 0) this.rawSet(x, y, z, B.MOSSY); continue; }
        if (edge || y === cy + 1) if (U.hash2(x * 7 + y, z, this.seed + 21) < 0.6) this.rawSet(x, y, z, B.MOSSY);
      }
      // rooms 3x3
      const rooms = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const rx = x0 + 1 + i * 12, rz = z0 + 1 + j * 12;
        this.fill(rx, fy + 1, rz, rx + 10, cy - 1, rz + 10, B.AIR);
        rooms.push({ i, j, x: rx + 5.5, z: rz + 5.5, rx, rz });
        // pillars and lanterns
        for (const [px, pz] of [[rx + 2, rz + 2], [rx + 8, rz + 2], [rx + 2, rz + 8], [rx + 8, rz + 8]]) {
          if (U.hash2(px, pz, this.seed) < 0.6) this.fill(px, fy + 1, pz, px, cy - 1, pz, B.MOSSY);
        }
        this.rawSet(rx + 5, fy + 3, rz - 1, B.LANTERN);
        this.rawSet(rx + 5, fy + 3, rz + 11, B.LANTERN);
      }
      // doors between rooms
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const rx = x0 + 1 + i * 12, rz = z0 + 1 + j * 12;
        if (i < 2) this.fill(rx + 11, fy + 1, rz + 4, rx + 11, fy + 3, rz + 6, B.AIR);
        if (j < 2 && !(i === 1 && j === 0)) this.fill(rx + 4, fy + 1, rz + 11, rx + 6, fy + 3, rz + 11, B.AIR);
      }
      // boss dais in room (2,0)
      const boss = rooms[2];
      this.fill(boss.rx + 3, fy + 1, boss.rz + 3, boss.rx + 7, fy + 1, boss.rz + 7, B.MOSSY);
      this.rawSet(boss.rx + 3, fy + 2, boss.rz + 3, B.LANTERN); this.rawSet(boss.rx + 7, fy + 2, boss.rz + 7, B.LANTERN);
      this.rawSet(boss.rx + 3, fy + 2, boss.rz + 7, B.LANTERN); this.rawSet(boss.rx + 7, fy + 2, boss.rz + 3, B.LANTERN);
      // entrance: west wall of room (0,1), stairs descending eastward
      const ez = z0 + 1 + 12 + 4;
      this.fill(x0, fy + 1, ez, x0, fy + 3, ez + 2, B.AIR);
      for (let k = 1; k <= 7; k++) {
        const x = x0 - k, floor = Math.min(g, fy + k);
        this.fill(x, floor + 1, ez, x, g + 6, ez + 2, B.AIR);
        this.fill(x, fy, ez, x, floor, ez + 2, B.CRYPT);
        this.fill(x, fy, ez - 1, x, g + 1, ez - 1, B.MOSSY);
        this.fill(x, fy, ez + 3, x, g + 1, ez + 3, B.MOSSY);
      }
      this.rawSet(x0 - 1, g + 2, ez - 1, B.LANTERN); this.rawSet(x0 - 1, g + 2, ez + 3, B.LANTERN);
      this.rawSet(x0 - 7, g + 2, ez - 1, B.LANTERN); this.rawSet(x0 - 7, g + 2, ez + 3, B.LANTERN);
      this.dungeonRooms = rooms; this.dungeonFloor = fy + 1;
      this.dungeonEntrance = { x: x0 - 8.5, z: ez + 1.5 };
      this.zones.push({ name: 'The Sunken Crypt', x0, x1, z0, z1, yMax: cy });
    }
    buildSpawns() {
      const T = LAYOUT.town, L = LAYOUT;
      const sp = (type, x, z, count, radius, respawn, opt) => this.spawns.push(Object.assign({ type, x, z, count, radius, respawn }, opt || {}));
      sp('rat', T.x + 36, T.z - 26, 2, 7, 45); sp('rat', T.x + 32, T.z + 30, 2, 7, 45);
      sp('rat', T.x - 32, T.z + 30, 2, 7, 45); sp('rat', T.x - 30, T.z - 34, 2, 7, 45);
      sp('rat', T.x + 8, T.z + 36, 1, 6, 45); sp('rat', T.x + 36, T.z + 5, 1, 5, 45);
      sp('snake', T.x + 46, T.z + 14, 2, 8, 50); sp('snake', T.x - 40, T.z + 50, 2, 8, 50);
      sp('beetle', L.lake.x + 14, L.lake.z - 20, 3, 8, 60); sp('beetle', T.x + 48, T.z + 52, 2, 8, 60);
      sp('skeleton', L.graveyard.x, L.graveyard.z, 4, 6, 60);
      sp('gnoll_pup', L.gnollCamp.x, L.gnollCamp.z, 4, 8, 70);
      sp('gnoll', L.gnollCamp.x - 5, L.gnollCamp.z - 2, 2, 4, 90);
      sp('gnoll_pup', T.x - 40, T.z + 8, 1, 3, 90, { alt: 'fippy', altChance: 0.35 });
      sp('wolf', L.forest.x, L.forest.z, 3, 14, 70, { alt: 'greymane', altChance: 0.12 }); sp('wolf', L.forest.x - 36, L.forest.z + 10, 2, 10, 70);
      const fy = this.dungeonFloor;
      for (const r of this.dungeonRooms) {
        if (r.i === 0 && r.j === 1) { sp('skeleton', r.x, r.z, 2, 3, 90, { y: fy, lvl: [3, 4] }); continue; }
        if (r.i === 2 && r.j === 0) { sp('grimbone', r.x, r.z, 1, 1, 300, { y: fy + 1 }); sp('skel_warrior', r.x - 3, r.z + 3, 1, 1, 120, { y: fy }); continue; }
        const t = (r.i + r.j) % 2 === 0 ? 'ghoul' : 'skel_warrior';
        sp(t, r.x, r.z, 2, 3, 120, { y: fy });
      }
    }

    // ---------------- Meshing ----------------
    buildChunk(cx, cz) {
      const ci = cx + cz * NCX;
      const old = this.chunks[ci];
      if (old) { for (const m of old.meshes) { this.scene.remove(m); m.geometry.dispose(); } }
      const groups = [{ p: [], n: [], u: [], c: [], i: [] }, { p: [], n: [], u: [], c: [], i: [] }, { p: [], n: [], u: [], c: [], i: [] }];
      const N = this.atlas.N, eps = 0.001;
      const x0 = cx * CS, z0 = cz * CS;
      const data = this.data, heights = this.height;
      for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
        const b = data[x + z * W + y * W * D];
        if (b === 0) continue;
        const bd = BLOCKS[b];
        const gi = bd.water ? 1 : bd.emissive ? 2 : 0;
        const G = groups[gi];
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.dir[0], ny = y + F.dir[1], nz = z + F.dir[2];
          const nb = this.get(nx, ny, nz);
          if (bd.water) { if (nb !== B.AIR) continue; }
          else if (BLOCKS[nb].opaque) continue;
          else if (nb === b) continue;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) { if (f !== 3) continue; }
          let light = 1;
          if (!bd.emissive && nx >= 0 && nz >= 0 && nx < W && nz < D && ny < H) {
            if (ny <= heights[nx + nz * W]) light = 0.38;
          }
          const sh = F.shade * light;
          const tile = f === 3 ? bd.tiles[0] : f === 2 ? bd.tiles[2] : bd.tiles[1];
          const tu = (tile % N) / N, tv = 1 - (Math.floor(tile / N) + 1) / N;
          const ndx = G.p.length / 3;
          const yo = bd.water && f === 3 && this.get(x, y + 1, z) !== B.WATER ? -0.12 : 0;
          for (const c of F.corners) {
            G.p.push(x + c[0], y + c[1] + (c[1] ? yo : 0), z + c[2]);
            G.n.push(F.dir[0], F.dir[1], F.dir[2]);
            G.u.push(tu + (c[3] ? 1 / N - eps : eps), tv + (c[4] ? 1 / N - eps : eps));
            G.c.push(sh, sh, sh);
          }
          G.i.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
        }
      }
      const meshes = [];
      const mats = [this.matOpaque, this.matWater, this.matGlow];
      groups.forEach((G, gi) => {
        if (!G.p.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(G.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(G.n, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.u, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(G.c, 3));
        geo.setIndex(G.i);
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mats[gi]);
        if (gi === 1) m.renderOrder = 2;
        m.userData.chunk = true;
        this.scene.add(m);
        meshes.push(m);
      });
      this.chunks[ci] = { meshes, cx, cz };
    }
    markDirtyAt(x, z) {
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const lx = x - cx * CS, lz = z - cz * CS;
        if ((dx === -1 && lx !== 0) || (dx === 1 && lx !== CS - 1) || (dz === -1 && lz !== 0) || (dz === 1 && lz !== CS - 1)) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx >= 0 && nz >= 0 && nx < NCX && nz < NCZ) this.dirty.add(nx + nz * NCX);
      }
    }
    idxPos(i) { const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / (W * D)); return { x, y, z }; }
    setBlock(x, y, z, b, record = true) {
      if (!this.inBounds(x, y, z)) return false;
      this.data[this.idx(x, y, z)] = b;
      if (this.lanterns) { const i = this.idx(x, y, z); if (b === B.LANTERN || b === B.BRAZIER) this.lanterns.set(i, { x, y, z }); else this.lanterns.delete(i); }
      if (record) this.edits[this.idx(x, y, z)] = b;
      const oldH = this.height[x + z * W];
      this.computeHeightColumn(x, z);
      if (oldH !== this.height[x + z * W]) { // light changes can affect neighbours' faces
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (this.inBounds(x + dx, 0, z + dz)) this.markDirtyAt(x + dx, z + dz);
      }
      this.markDirtyAt(x, z);
      this.updateMapAt(x, z);
      return true;
    }
    applyEdits(edits) {
      for (const k in edits) {
        const i = +k, b = edits[k];
        const y = Math.floor(i / (W * D)), r = i - y * W * D, z = Math.floor(r / W), x = r - z * W;
        this.data[i] = b; this.edits[i] = b;
        this.computeHeightColumn(x, z);
      }
    }
    // Build any missing/dirty chunks near the camera; budget per frame
    updateChunks(px, pz, radius, budget) {
      if (!this.data) return;
      const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
      let built = 0;
      for (const ci of Array.from(this.dirty)) {
        if (this.chunks[ci]) { this.buildChunk(ci % NCX, Math.floor(ci / NCX)); built++; }
        this.dirty.delete(ci);
        if (built >= budget * 2) break;
      }
      const cand = [];
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= NCX || cz >= NCZ) continue;
        if (dx * dx + dz * dz > radius * radius + 1) continue;
        if (!this.chunks[cx + cz * NCX]) cand.push([dx * dx + dz * dz, cx, cz]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (const c of cand) { if (built >= budget) break; this.buildChunk(c[1], c[2]); built++; }
      // visibility culling by distance
      for (const ch of this.chunks) {
        if (!ch) continue;
        const d = Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz));
        const vis = d <= radius + 1;
        for (const m of ch.meshes) m.visible = vis;
      }
      return cand.length;
    }

    // Voxel DDA raycast
    raycast(ox, oy, oz, dx, dy, dz, maxDist, pred) {
      pred = pred || ((b) => BLOCKS[b].solid);
      let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
      const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
      const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
      let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
      let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
      let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
      let t = 0, nx = 0, ny = 0, nz = 0;
      while (t <= maxDist) {
        const b = this.get(x, y, z);
        if (b !== B.AIR && pred(b)) return { x, y, z, b, t, nx, ny, nz };
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      }
      return null;
    }
  }

  EB.World = World;
  EB.WORLD = { W, D, H, CS, SEA, LAYOUT, FF, ZONES, DS, DUNGEON_ZONES };
})();
