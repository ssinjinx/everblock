// Everblock - tiny synthesized sound effects (WebAudio, no assets)
(function () {
  const EB = window.EB;
  let ctx = null, master = null, enabled = true;
  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination);
    } catch (e) { enabled = false; }
    return ctx;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!enabled || !ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.5, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, filt) {
    if (!enabled || !ensure()) return;
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }
  // ---------- synthesized music loop ----------
  // Each mood: tempo, root (Hz), scale degrees (semitones), chord progression (scale indexes), lead pattern
  const MOODS = {
    town:  { bpm: 84, root: 196.0, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], lead: [4, 2, 0, 2, 4, 4, 4, -1, 2, 2, 2, -1, 4, 6, 6, -1], wave: 'triangle' },
    wild:  { bpm: 76, root: 174.6, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 6, 3, 4], lead: [0, -1, 2, 4, -1, 3, 2, -1, 0, -1, 4, 6, -1, 4, 2, -1], wave: 'triangle' },
    frost: { bpm: 64, root: 146.8, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], lead: [4, -1, -1, 3, 2, -1, 0, -1, 4, -1, 7, -1, 6, -1, 4, -1], wave: 'sine' },
    crypt: { bpm: 56, root: 110.0, scale: [0, 1, 3, 5, 6, 8, 10], prog: [0, 1, 0, 5], lead: [0, -1, -1, -1, 1, -1, -1, -1, 4, -1, 3, -1, 1, -1, -1, -1], wave: 'sine' },
  };
  let musicOn = true, mood = null, musicGain = null, nextT = 0, step = 0, timer = null;
  const hz = (m, deg, oct) => { const n = m.scale.length, o = Math.floor(deg / n); const d = ((deg % n) + n) % n; return m.root * Math.pow(2, (m.scale[d] + 12 * (o + (oct || 0))) / 12); };
  function note(f, t0, dur, type, vol, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.08, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function schedule() {
    if (!ctx || !mood || !musicOn || !enabled || ctx.state !== 'running') return;
    const m = MOODS[mood], beat = 60 / m.bpm / 2; // eighth notes
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.6) {
      const bar = Math.floor(step / 16) % m.prog.length, pos = step % 16, ch = m.prog[bar];
      if (pos === 0) { // pad chord: root, third, fifth
        for (const d of [0, 2, 4]) note(hz(m, ch + d, -1), nextT, beat * 16, 'sine', 0.05, musicGain);
        note(hz(m, ch, -2), nextT, beat * 8, 'triangle', 0.07, musicGain);
      }
      if (pos === 8) note(hz(m, ch, -2), nextT, beat * 8, 'triangle', 0.06, musicGain);
      const l = m.lead[pos];
      if (l >= 0 && (bar % 2 === 0 || pos % 4 === 0)) note(hz(m, ch + l, 0), nextT, beat * 1.8, m.wave, 0.035, musicGain);
      if (mood !== 'crypt' && pos % 4 === 2) note(hz(m, ch + 4, 1), nextT, beat * 0.6, 'sine', 0.012, musicGain);
      nextT += beat; step++;
    }
  }
  function setMood(md) {
    if (md === mood) return;
    mood = md; step = 0;
    if (!ensure()) return;
    if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0.9; musicGain.connect(master); }
    if (!timer) timer = setInterval(schedule, 200);
  }

  EB.audio = {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggle() { enabled = !enabled; return enabled; },
    setMood,
    get mood() { return mood; },
    toggleMusic() { musicOn = !musicOn; if (musicGain) musicGain.gain.value = musicOn ? 0.9 : 0; return musicOn; },
    get musicOn() { return musicOn; },
    get musicActive() { return !!(ctx && timer && musicOn && enabled && ctx.state === 'running'); },
    swing() { noise(0.12, 0.25, 2500); },
    hit() { noise(0.1, 0.5, 700); tone(110, 0.12, 'square', 0.15, 60); },
    hurt() { tone(220, 0.18, 'sawtooth', 0.2, 110); },
    miss() { noise(0.08, 0.12, 4000); },
    cast() { tone(300, 0.6, 'sine', 0.15, 900); },
    spell() { tone(900, 0.3, 'triangle', 0.25, 400); noise(0.25, 0.2, 3000); },
    heal() { tone(520, 0.25, 'sine', 0.2); tone(780, 0.35, 'sine', 0.2, null, 0.12); },
    fizzle() { tone(200, 0.3, 'sawtooth', 0.15, 80); },
    ding() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.25, null, i * 0.12)); },
    death() { tone(300, 1.2, 'sawtooth', 0.25, 50); },
    loot() { tone(1200, 0.08, 'square', 0.1); tone(1600, 0.1, 'square', 0.1, null, 0.08); },
    block() { noise(0.1, 0.35, 900); },
    click() { tone(800, 0.04, 'square', 0.08); },
  };
})();
