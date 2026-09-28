// Everblock - procedurally drawn spell/ability icons (canvas, cached as data URLs)
(function () {
  const EB = window.EB;
  const { SPELLS } = EB.data;
  const cache = {};
  const SCHOOL = { fire: ['#ff9040', '#8a1a00'], cold: ['#a8e0ff', '#1a4a8a'], magic: ['#fff0a0', '#8a6a10'], disease: ['#b8e070', '#2a4a10'], life: ['#ff7090', '#5a0a2a'] };
  function palette(sp) {
    if (sp.school && SCHOOL[sp.school]) return SCHOOL[sp.school];
    switch (sp.kind) {
      case 'heal': case 'groupheal': return ['#f0fff0', '#2a7a3a'];
      case 'buff': return ['#e0c8ff', '#4a2a8a'];
      case 'gate': return ['#c0a0ff', '#2a1a5a'];
      case 'root': case 'snare': return ['#b0e090', '#3a5a1a'];
      case 'slow': return ['#90d0d0', '#1a4a5a'];
      case 'mez': case 'stun': return ['#ffb0ff', '#6a1a7a'];
      case 'pet': return ['#e8e2c8', '#3a3a3a'];
      default: return ['#e0c090', '#5a3a1a'];
    }
  }
  function glyphFor(id, sp) {
    if (sp.ic) return sp.ic;
    const map = { heal: 'cross', groupheal: 'cross3', buff: 'shield', gate: 'portal', root: 'roots', snare: 'roots', slow: 'swirl', mez: 'eye', stun: 'star', pet: 'skull', dot: 'skullsmall' };
    if (sp.kind === 'nuke') return { fire: 'flame', cold: 'snow', magic: 'bolt', life: 'heart' }[sp.school] || 'bolt';
    if (sp.kind === 'dot') return sp.school === 'fire' ? 'flame' : 'skullsmall';
    return map[sp.kind] || 'sword';
  }
  const G = {
    sword(c) { c.save(); c.translate(20, 20); c.rotate(-Math.PI / 4); c.fillRect(-2, -14, 4, 20); c.fillRect(-7, 5, 14, 3); c.fillRect(-1.5, 8, 3, 6); c.restore(); },
    dagger(c) { c.save(); c.translate(20, 20); c.rotate(Math.PI / 5); c.beginPath(); c.moveTo(0, -14); c.lineTo(3, 2); c.lineTo(-3, 2); c.fill(); c.fillRect(-6, 2, 12, 3); c.fillRect(-1.5, 5, 3, 8); c.restore(); },
    boot(c) { c.beginPath(); c.moveTo(12, 8); c.lineTo(21, 8); c.lineTo(21, 22); c.lineTo(31, 26); c.lineTo(31, 32); c.lineTo(12, 32); c.closePath(); c.fill(); },
    bandage(c) { c.save(); c.translate(20, 20); c.rotate(-0.6); c.fillRect(-13, -5, 26, 10); c.restore(); c.globalCompositeOperation = 'destination-out'; c.fillRect(18, 18, 4, 4); c.globalCompositeOperation = 'source-over'; },
    cross(c) { c.fillRect(16, 7, 8, 26); c.fillRect(7, 16, 26, 8); },
    cross3(c) { c.fillRect(17, 5, 6, 16); c.fillRect(12, 10, 16, 6); c.fillRect(7, 20, 5, 13); c.fillRect(3, 24, 13, 5); c.fillRect(28, 20, 5, 13); c.fillRect(24, 24, 13, 5); },
    shield(c) { c.beginPath(); c.moveTo(20, 6); c.lineTo(32, 10); c.quadraticCurveTo(32, 26, 20, 34); c.quadraticCurveTo(8, 26, 8, 10); c.closePath(); c.fill(); },
    fury(c) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 7 : 15; c.lineTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r); } c.closePath(); c.fill(); },
    evade(c) { c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(8 + i * 3, 10 + i * 8); c.lineTo(32 - i * 3, 10 + i * 8); c.stroke(); } },
    flame(c) { c.beginPath(); c.moveTo(20, 5); c.quadraticCurveTo(33, 18, 28, 29); c.quadraticCurveTo(24, 35, 20, 35); c.quadraticCurveTo(10, 34, 11, 24); c.quadraticCurveTo(13, 16, 18, 14); c.quadraticCurveTo(17, 22, 22, 24); c.quadraticCurveTo(24, 14, 20, 5); c.fill(); },
    snow(c) { c.lineWidth = 3; for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; c.beginPath(); c.moveTo(20 - Math.cos(a) * 14, 20 - Math.sin(a) * 14); c.lineTo(20 + Math.cos(a) * 14, 20 + Math.sin(a) * 14); c.stroke(); } c.beginPath(); c.arc(20, 20, 3, 0, 7); c.fill(); },
    bolt(c) { c.beginPath(); c.moveTo(23, 4); c.lineTo(11, 22); c.lineTo(19, 22); c.lineTo(15, 36); c.lineTo(29, 16); c.lineTo(21, 16); c.closePath(); c.fill(); },
    heart(c) { c.beginPath(); c.moveTo(20, 33); c.bezierCurveTo(4, 22, 6, 8, 14, 8); c.bezierCurveTo(18, 8, 20, 12, 20, 14); c.bezierCurveTo(20, 12, 22, 8, 26, 8); c.bezierCurveTo(34, 8, 36, 22, 20, 33); c.fill(); },
    portal(c) { c.lineWidth = 3; for (let r = 5; r <= 14; r += 4.5) { c.beginPath(); c.arc(20, 20, r, 0, 7); c.stroke(); } },
    roots(c) { c.lineWidth = 3; c.beginPath(); c.moveTo(20, 6); c.lineTo(20, 22); c.moveTo(20, 22); c.quadraticCurveTo(12, 26, 8, 34); c.moveTo(20, 22); c.quadraticCurveTo(28, 26, 32, 34); c.moveTo(20, 22); c.lineTo(20, 34); c.stroke(); },
    swirl(c) { c.lineWidth = 3; c.beginPath(); for (let t = 0; t < 14; t += 0.2) c.lineTo(20 + Math.cos(t) * t, 20 + Math.sin(t) * t); c.stroke(); },
    eye(c) { c.beginPath(); c.moveTo(5, 20); c.quadraticCurveTo(20, 6, 35, 20); c.quadraticCurveTo(20, 34, 5, 20); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(20, 20, 5, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; c.beginPath(); c.arc(20, 20, 2.5, 0, 7); c.fill(); },
    star(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 6 : 15; c.lineTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r); } c.closePath(); c.fill(); },
    skull(c) { c.beginPath(); c.arc(20, 17, 11, 0, 7); c.fill(); c.fillRect(13, 24, 14, 9); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(15.5, 17, 3.2, 0, 7); c.arc(24.5, 17, 3.2, 0, 7); c.fill(); c.fillRect(17, 28, 2, 5); c.fillRect(21, 28, 2, 5); c.globalCompositeOperation = 'source-over'; },
    skullsmall(c) { c.beginPath(); c.arc(20, 16, 8, 0, 7); c.fill(); c.fillRect(15, 21, 10, 6); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(17, 16, 2.3, 0, 7); c.arc(23, 16, 2.3, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(9 + i * 7, 33, 2, 0, 7); c.fill(); } },
    arrow(c) { c.lineWidth = 3; c.beginPath(); c.moveTo(7, 33); c.lineTo(31, 9); c.stroke(); c.beginPath(); c.moveTo(34, 6); c.lineTo(24, 9); c.lineTo(31, 16); c.closePath(); c.fill(); c.fillRect(6, 29, 6, 3); c.fillRect(9, 32, 3, 6); },
    hand(c) { c.fillRect(12, 18, 16, 15); for (let i = 0; i < 4; i++) c.fillRect(12 + i * 4.2, 6 + (i === 0 || i === 3 ? 4 : 0), 3.4, 14); c.save(); c.translate(11, 22); c.rotate(-0.7); c.fillRect(-2, -8, 4, 10); c.restore(); },
    shieldbash(c) { c.beginPath(); c.arc(20, 20, 13, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(20, 20, 9, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; c.beginPath(); c.arc(20, 20, 4, 0, 7); c.fill(); },
    leaf(c) { c.beginPath(); c.moveTo(8, 32); c.quadraticCurveTo(8, 8, 32, 8); c.quadraticCurveTo(32, 32, 8, 32); c.fill(); },
    bark(c) { for (let i = 0; i < 4; i++) c.fillRect(8 + i * 7, 6 + (i % 2) * 3, 5, 28 - (i % 2) * 5); },
    paw(c) { c.beginPath(); c.arc(20, 26, 7, 0, 7); c.fill(); for (const [x, y] of [[10, 16], [16, 10], [24, 10], [30, 16]]) { c.beginPath(); c.arc(x, y, 3.4, 0, 7); c.fill(); } },
    drop(c) { c.beginPath(); c.moveTo(20, 5); c.quadraticCurveTo(32, 20, 30, 26); c.arc(20, 25, 10, 0, Math.PI); c.quadraticCurveTo(8, 20, 20, 5); c.fill(); },
  };
  function draw(id, size) {
    const sp = SPELLS[id];
    const cv = document.createElement('canvas'); cv.width = cv.height = size || 40;
    const c = cv.getContext('2d'); c.scale(cv.width / 40, cv.height / 40);
    const [hi, lo] = palette(sp);
    const grd = c.createRadialGradient(14, 12, 2, 20, 20, 28); grd.addColorStop(0, hi); grd.addColorStop(1, lo);
    c.fillStyle = grd; c.fillRect(0, 0, 40, 40);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.strokeRect(1, 1, 38, 38);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(2, 2, 36, 3);
    const g = G[glyphFor(id, sp)] || G.sword;
    // glyph with dark outline for readability
    c.save(); c.translate(1.2, 1.2); c.fillStyle = 'rgba(0,0,0,0.55)'; c.strokeStyle = 'rgba(0,0,0,0.55)'; g(c); c.restore();
    c.fillStyle = '#fffaf0'; c.strokeStyle = '#fffaf0'; g(c);
    return cv.toDataURL();
  }
  EB.icons = {
    url(id) { if (!SPELLS[id]) return ''; return cache[id] || (cache[id] = draw(id)); },
    img(id, cls) { return `<img class="${cls || 'sic'}" src="${EB.icons.url(id)}" alt="" draggable="false">`; },
  };
})();
