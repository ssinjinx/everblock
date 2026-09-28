// Everblock - voxel pathfinding: A* over standable cells with step-up / drop handling, plus a steering helper
(function () {
  const EB = window.EB;
  const { BLOCKS } = EB.data;
  const MAX_DROP = 3;

  function solid(w, x, y, z) { return w.isSolid(x, y, z); }
  function clearAt(w, x, y, z, clear) { for (let k = 0; k < clear; k++) if (solid(w, x, y + k, z)) return false; return true; }
  function standable(w, x, y, z, clear) { return solid(w, x, y - 1, z) && clearAt(w, x, y, z, clear); }
  // Standing y reachable from (fromY) when moving into column x,z. Returns null if blocked.
  function standY(w, x, fromY, z, clear, fx, fz) {
    // step up one block if head room above the origin cell allows it
    if (standable(w, x, fromY + 1, z, clear) && (fx === undefined || clearAt(w, fx, fromY + clear, fz, 1))) return fromY + 1;
    if (!clearAt(w, x, fromY, z, clear)) return null;
    for (let y = fromY; y >= fromY - MAX_DROP; y--) {
      if (y < 1) return null;
      if (solid(w, x, y - 1, z)) return clearAt(w, x, y, z, clear) ? y : null;
    }
    return null;
  }
  function groundCell(w, p, clear) {
    const x = Math.floor(p.x), z = Math.floor(p.z);
    let y = Math.floor(p.y + 0.02);
    if (standable(w, x, y, z, clear)) return { x, y, z };
    for (const dy of [1, -1, -2, -3, -4, 2]) if (standable(w, x, y + dy, z, clear)) return { x, y: y + dy, z };
    return { x, y, z };
  }

  // Binary min-heap keyed on f
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
      return top;
    }
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // A* from start cell to goal cell. Returns array of cells (excluding start) or null.
  // If the goal is unreachable within the node budget, returns a path to the closest explored cell.
  function findPath(w, s, g, opt) {
    opt = opt || {};
    const clear = opt.clear || 2, maxNodes = opt.maxNodes || 3500;
    const W = EB.WORLD.W, Dd = EB.WORLD.D;
    const key = (x, y, z) => (y * Dd + z) * W + x;
    const h = (x, y, z) => { const dx = Math.abs(x - g.x), dz = Math.abs(z - g.z); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) + Math.abs(y - g.y) * 0.5; };
    const open = new Heap(), gs = new Map(), came = new Map(), closed = new Set(), pos = new Map();
    const sk = key(s.x, s.y, s.z);
    gs.set(sk, 0); pos.set(sk, s);
    open.push({ f: h(s.x, s.y, s.z), k: sk });
    let best = sk, bestH = h(s.x, s.y, s.z), expanded = 0, goalK = null;
    while (open.size && expanded < maxNodes) {
      const cur = open.pop();
      if (closed.has(cur.k)) continue;
      closed.add(cur.k); expanded++;
      const c = pos.get(cur.k);
      const ch = h(c.x, c.y, c.z);
      if (ch < bestH) { bestH = ch; best = cur.k; }
      if (c.x === g.x && c.z === g.z && Math.abs(c.y - g.y) <= 1) { goalK = cur.k; break; }
      const cg = gs.get(cur.k);
      for (const [dx, dz] of DIRS) {
        const nx = c.x + dx, nz = c.z + dz;
        if (dx && dz) { // no corner cutting
          if (!clearAt(w, c.x + dx, c.y, c.z, clear) || !clearAt(w, c.x, c.y, c.z + dz, clear)) continue;
        }
        const ny = standY(w, nx, c.y, nz, clear, c.x, c.z);
        if (ny === null) continue;
        if (dx && dz && ny !== c.y) continue; // keep diagonal moves flat
        const nk = key(nx, ny, nz);
        if (closed.has(nk)) continue;
        let cost = dx && dz ? 1.414 : 1;
        if (ny > c.y) cost += 0.6; else if (ny < c.y) cost += 0.25 * (c.y - ny);
        if (BLOCKS[w.get(nx, ny, nz)].water) cost += 1.5;
        const ng = cg + cost;
        if (ng < (gs.has(nk) ? gs.get(nk) : Infinity)) {
          gs.set(nk, ng); came.set(nk, cur.k); pos.set(nk, { x: nx, y: ny, z: nz });
          open.push({ f: ng + h(nx, ny, nz), k: nk });
        }
      }
    }
    const endK = goalK !== null ? goalK : best;
    if (endK === sk) return goalK !== null ? [] : null;
    const out = [];
    let k = endK;
    while (k !== sk && k !== undefined) { out.push(pos.get(k)); k = came.get(k); }
    out.reverse();
    out.reached = goalK !== null;
    out.expanded = expanded;
    return out;
  }

  // Can we walk in a straight line from p to (gx,gy,gz)? Samples the voxel columns along the segment.
  function walkLine(w, p, gx, gy, gz, clear) {
    let cx = Math.floor(p.x), cz = Math.floor(p.z);
    let cy = groundCell(w, p, clear).y;
    const dx = gx - p.x, dz = gz - p.z, dist = Math.hypot(dx, dz);
    const n = Math.ceil(dist / 0.35);
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = Math.floor(p.x + dx * t), z = Math.floor(p.z + dz * t);
      if (x === cx && z === cz) continue;
      if (x !== cx && z !== cz) { if (!clearAt(w, x, cy, cz, clear) || !clearAt(w, cx, cy, z, clear)) return false; }
      const ny = standY(w, x, cy, z, clear, cx, cz);
      if (ny === null) return false;
      cx = x; cz = z; cy = ny;
    }
    return Math.abs(cy - Math.floor(gy + 0.02)) <= 1;
  }

  // Steering helper used by mobs, guards and mercenaries
  class Nav {
    constructor() { this.path = null; this.pi = 0; this.goal = null; this.repath = 0; this.forceT = 0; this.progT = 0; this.lastD = Infinity; }
    reset() { this.path = null; this.goal = null; }
    // Returns a unit direction {x,z} toward the goal, or null if within `stop` of it.
    steer(ent, gx, gy, gz, game, stop, dt) {
      const dx = gx - ent.pos.x, dz = gz - ent.pos.z, dist = Math.hypot(dx, dz);
      if (dist < stop && Math.abs(gy - ent.pos.y) < 2.5) { this.path = null; this.progT = 0; return null; }
      const w = game.world, clear = Math.max(2, Math.ceil(ent.h - 0.1));
      this.repath -= dt; this.forceT -= dt;
      // progress watchdog: if distance hasn't dropped for a while, force A*
      if (dist < this.lastD - 0.25) { this.lastD = dist; this.progT = 0; } else { this.progT += dt; }
      if (this.progT > 1.2) { this.forceT = 4; this.progT = 0; this.lastD = dist; this.repath = 0; }
      if (this.forceT <= 0 && dist < 48 && walkLine(w, ent.pos, gx, gy, gz, clear)) {
        this.path = null; this.mode = 'direct';
        return { x: dx / dist, z: dz / dist };
      }
      const gcx = Math.floor(gx), gcz = Math.floor(gz);
      const moved = !this.goal || Math.abs(this.goal.x - gcx) + Math.abs(this.goal.z - gcz) > 2;
      if ((!this.path || this.repath <= 0 || moved || this.pi >= this.path.length) && game.pathBudget > 0) {
        game.pathBudget--; game.pathCount = (game.pathCount || 0) + 1;
        this.repath = 1.2 + Math.random() * 0.6;
        const s = groundCell(w, ent.pos, clear), g = groundCell(w, { x: gx, y: gy, z: gz }, clear);
        this.path = findPath(w, s, g, { clear, maxNodes: ent.navBudget || 3500 });
        this.pi = 0; this.goal = { x: gcx, z: gcz };
      }
      this.mode = 'astar';
      if (this.path && this.pi < this.path.length) {
        let wp = this.path[this.pi];
        let wx = wp.x + 0.5 - ent.pos.x, wz = wp.z + 0.5 - ent.pos.z, wd = Math.hypot(wx, wz);
        while (wd < 0.4 && this.pi < this.path.length - 1) { this.pi++; wp = this.path[this.pi]; wx = wp.x + 0.5 - ent.pos.x; wz = wp.z + 0.5 - ent.pos.z; wd = Math.hypot(wx, wz); }
        if (wd < 0.4) { this.pi++; return { x: dx / (dist || 1), z: dz / (dist || 1) }; }
        return { x: wx / wd, z: wz / wd, up: wp.y > ent.pos.y + 0.5 };
      }
      return { x: dx / (dist || 1), z: dz / (dist || 1) };
    }
  }

  EB.path = { findPath, walkLine, standable, standY, groundCell, Nav };
})();
