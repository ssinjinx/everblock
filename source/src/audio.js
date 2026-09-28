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
  EB.audio = {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggle() { enabled = !enabled; return enabled; },
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
