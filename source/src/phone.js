// Everblock v5 - Phone Mode: touch controls (virtual joystick, drag-to-look, tap-to-target, pinch zoom,
// action buttons) and a compact responsive layout. Toggled on the start screen; remembered in localStorage.
(function () {
  const EB = window.EB, $ = EB.$;
  const KEY = 'everblock_phone';
  const touchCapable = () => ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const phone = EB.phone = { on: false, move: { x: 0, y: 0 }, suggested: false, touchCapable };

  function updateToggles() {
    for (const id of ['btnPhone', 'btnPhone2']) { const b = $(id); if (b) { b.classList.toggle('on', phone.on); b.innerHTML = `📱 Phone Mode: <b>${phone.on ? 'ON' : 'OFF'}</b>`; } }
    const s = $('phoneSuggest'); if (s && !phone.suggested) s.classList.add('hidden');
  }
  phone.set = (on, persist) => {
    phone.on = !!on;
    document.body.classList.toggle('phone', phone.on);
    if (persist !== false) localStorage.setItem(KEY, phone.on ? '1' : '0');
    phone.move.x = phone.move.y = 0;
    updateToggles();
    const g = EB.game;
    if (g && g.player && g.renderer) {
      if (phone.on) {
        if (g.locked()) document.exitPointerLock();
        if (!localStorage.getItem('everblock_gfx')) g.applyGfx('low', true);
        g.renderer.setPixelRatio(1); g.renderer.setSize(window.innerWidth, window.innerHeight);
        phone.setChat(false);
      } else phone.setChat(true);
      g.updateClickPrompt();
    }
  };
  phone.setChat = (open) => { document.body.classList.toggle('chatOpen', !!open); const b = document.querySelector('#phoneTop [data-act="chat"]'); if (b) b.classList.toggle('on', !!open); };

  // prevent page scroll / pinch-zoom / double-tap zoom while playing in phone mode (panels still scroll)
  const scrollable = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.id === 'title' || e.classList.contains('panelwin') || e.id === 'chatLog' || e.id === 'tooltip') return true; } return false; };
  document.addEventListener('touchmove', (e) => { if (phone.on && (e.touches.length > 1 || !scrollable(e.target))) e.preventDefault(); }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => { if (phone.on) e.preventDefault(); }, { passive: false });

  document.addEventListener('touchstart', () => { if (EB.ui && EB.ui.hideTip) EB.ui.hideTip(); }, { passive: true });

  // ---------------- in-game touch controls ----------------
  function bindGame(g) {
    const cv = g.renderer.domElement;
    const pts = new Map(); let pinch = null;
    const ndcPick = (x, y) => {
      const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      g.raycaster.setFromCamera(ndc, g.camera);
      return g.pickEntity(g.raycaster.ray.origin, g.raycaster.ray.direction);
    };
    phone.tapAt = (x, y) => { // tap-to-target; tapping your current NPC / corpse target interacts with it
      const pl = g.player; if (!pl || !pl.alive) return null;
      const hit = ndcPick(x, y);
      if (hit) {
        if (hit === g.target && (hit.kind === 'npc' || hit.kind === 'pcorpse' || (hit.kind === 'mob' && !hit.alive)) && hit.pos.distanceTo(pl.pos) < 5) g.interact();
        else g.setTarget(hit);
      }
      return hit;
    };
    const pinchDist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; };
    cv.addEventListener('touchstart', (e) => {
      if (!phone.on) return;
      e.preventDefault(); EB.audio.unlock();
      for (const t of e.changedTouches) pts.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now(), moved: false });
      if (pts.size >= 2) { pinch = { d: pinchDist(), cam: g.camDist }; for (const p of pts.values()) p.moved = true; }
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
      if (!phone.on) return;
      e.preventDefault();
      const pl = g.player;
      for (const t of e.changedTouches) {
        const p = pts.get(t.identifier); if (!p) continue;
        const dx = t.clientX - p.x, dy = t.clientY - p.y;
        p.x = t.clientX; p.y = t.clientY;
        if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) p.moved = true;
        if (!pinch && pl) { pl.yaw -= dx * 0.0062; pl.pitch = Math.max(-1.5, Math.min(1.5, pl.pitch - dy * 0.005)); }
      }
      if (pinch && pts.size >= 2) { let d = pinch.cam * (pinch.d / pinchDist()); d = Math.max(0, Math.min(14, d)); g.camDist = d < 1.2 ? 0 : d; }
    }, { passive: false });
    const end = (e) => {
      if (!phone.on) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = pts.get(t.identifier); pts.delete(t.identifier);
        if (p && !p.moved && !pinch && performance.now() - p.t0 < 400) phone.tapAt(t.clientX, t.clientY);
      }
      if (pts.size < 2) pinch = null;
    };
    cv.addEventListener('touchend', end, { passive: false });
    cv.addEventListener('touchcancel', end, { passive: false });

    // joystick
    const zone = $('joyZone'), base = $('joyBase'), knob = $('joyKnob');
    let jid = null, cx = 0, cy = 0;
    const R = () => base.offsetWidth * 0.5 || 55;
    const setKnob = (x, y) => {
      const r = R(); let dx = x - cx, dy = y - cy; const m = Math.hypot(dx, dy);
      if (m > r) { dx *= r / m; dy *= r / m; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      phone.move.x = dx / r; phone.move.y = -dy / r;
    };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); EB.audio.unlock();
      const t = e.changedTouches[0]; jid = t.identifier;
      const b = base.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2;
      zone.classList.add('active'); setKnob(t.clientX, t.clientY);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === jid) setKnob(t.clientX, t.clientY); }, { passive: false });
    const jend = (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === jid) { jid = null; phone.move.x = phone.move.y = 0; knob.style.transform = ''; zone.classList.remove('active'); } };
    zone.addEventListener('touchend', jend, { passive: false }); zone.addEventListener('touchcancel', jend, { passive: false });

    // action buttons
    const acts = {
      attack: () => g.toggleAuto(), interact: () => g.interact(), sit: () => g.toggleSit(), consider: () => g.consider(), tab: () => g.tabTarget(false), hail: () => g.hail(),
      inv: () => g.toggleWin('invWin'), book: () => g.toggleWin('bookWin'), pet: () => g.toggleWin('petWin'), help: () => g.toggleWin('helpWin'),
      map: () => { g.showMap = !g.showMap; $('minimap').classList.toggle('hidden', !g.showMap); },
      chat: () => phone.setChat(!document.body.classList.contains('chatOpen')),
      cam: () => { g.camDist = g.camDist > 0 ? 0 : 5.5; },
      say: () => { const ci = $('chatInput'); phone.setChat(true); ci.classList.remove('hidden'); setTimeout(() => ci.focus(), 0); },
    };
    document.querySelectorAll('#phoneUI [data-act]').forEach((b) => {
      const a = b.dataset.act;
      if (a === 'jump') {
        const down = (e) => { e.preventDefault(); e.stopPropagation(); g.keys.Space = true; phone.jumpQ = true; b.classList.add('on'); };
        const up = (e) => { e.preventDefault(); g.keys.Space = false; b.classList.remove('on'); };
        b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
        b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up);
        return;
      }
      b.addEventListener('click', (e) => { e.stopPropagation(); EB.audio.unlock(); if (acts[a] && g.player) acts[a](); });
    });
    const upd = () => { // live button states
      if (!phone.on || !g.player) return;
      const set = (a, on) => { const el = document.querySelector(`#phoneUI [data-act="${a}"]`); if (el) el.classList.toggle('on', !!on); };
      set('attack', g.player.autoAttack); set('sit', g.player.sitting); set('map', g.showMap); set('inv', g.windows.has('invWin')); set('book', g.windows.has('bookWin')); set('pet', g.windows.has('petWin'));
      const pb = document.querySelector('#phoneUI [data-act="pet"]'); if (pb) pb.classList.toggle('hidden', !g.pet());
    };
    setInterval(upd, 250);
    if (phone.on) phone.set(true, false);
  }
  phone.bindGame = bindGame;

  window.addEventListener('DOMContentLoaded', () => {
    const st = localStorage.getItem(KEY);
    let on = st === '1';
    if (st == null && touchCapable()) { on = true; phone.suggested = true; }
    phone.set(on, false);
    if (phone.suggested) { const s = $('phoneSuggest'); if (s) s.classList.remove('hidden'); }
    for (const id of ['btnPhone', 'btnPhone2']) { const b = $(id); if (b) b.onclick = () => { phone.suggested = false; phone.set(!phone.on); }; }
    const keep = $('btnPhoneKeep'), no = $('btnPhoneNo');
    if (keep) keep.onclick = () => { phone.suggested = false; phone.set(true); };
    if (no) no.onclick = () => { phone.suggested = false; phone.set(false); };
    // hook into the game once the player enters the world
    const iv = setInterval(() => { const g = EB.game; if (g && g.player && g.renderer && g.pickEntity && document.getElementById('hud') && !$('hud').classList.contains('hidden')) { clearInterval(iv); bindGame(g); } }, 200);
  });
})();
