// Everblock - formulas, character creation and HUD/window rendering
(function () {
  const EB = window.EB;
  const U = EB.util;
  const { RACES, CLASSES, STAT_NAMES, ITEMS, SPELLS, EQUIP_SLOTS, B, BLOCKS, CON_HEX } = EB.data;
  const $ = (id) => document.getElementById(id);

  // ---------- formulas ----------
  const calc = {
    maxHp(cls, L, STA) { return 20 + L * CLASSES[cls].hpPer + Math.floor(STA * L / 12); },
    maxMana(cls, L, stats) { const ms = CLASSES[cls].manaStat; if (ms == null) return 0; return 15 + L * 5 + Math.floor(stats[ms] * L / 6); },
    xpForKill(mobL) { return mobL * mobL * 9 + mobL * 6 + 5; },
    fizzle(L, stat) { return U.clamp(20 - L * 1.5 - (stat - 75) / 8, 2, 25); },
  };
  EB.calc = calc;

  // ---------- Character creation ----------
  const create = { race: 'human', cls: 'warrior', alloc: [0, 0, 0, 0, 0, 0, 0], pool: 20 };
  function baseStats() {
    const r = RACES[create.race].stats, c = CLASSES[create.cls].bonus;
    return r.map((v, i) => v + c[i] + create.alloc[i]);
  }
  function renderCreate() {
    const rl = $('raceList'); rl.innerHTML = '';
    for (const k in RACES) {
      const b = document.createElement('button'); b.textContent = RACES[k].name; if (k === create.race) b.className = 'sel';
      b.onclick = () => { create.race = k; if (!RACES[k].classes.includes(create.cls)) create.cls = RACES[k].classes[0]; create.alloc.fill(0); renderCreate(); };
      rl.appendChild(b);
    }
    const cl = $('classList'); cl.innerHTML = '';
    for (const k in CLASSES) {
      const b = document.createElement('button'); b.textContent = CLASSES[k].name;
      if (k === create.cls) b.className = 'sel';
      if (!RACES[create.race].classes.includes(k)) { b.disabled = true; b.title = `${RACES[create.race].name}s cannot become ${CLASSES[k].name}s`; }
      b.onclick = () => { create.cls = k; create.alloc.fill(0); renderCreate(); };
      cl.appendChild(b);
    }
    const st = baseStats();
    const used = create.alloc.reduce((a, b) => a + b, 0);
    let html = '<table>';
    STAT_NAMES.forEach((n, i) => {
      html += `<tr><td>${n}</td><td class="v">${st[i]}</td><td><button data-s="${i}" data-d="-1">-</button> <button data-s="${i}" data-d="1">+</button></td><td style="color:#90c070;font-size:12px">${create.alloc[i] ? '+' + create.alloc[i] : ''}</td></tr>`;
    });
    html += '</table>';
    $('statTable').innerHTML = html;
    $('statTable').querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.s, d = +b.dataset.d;
        const u = create.alloc.reduce((a, c) => a + c, 0);
        if (d > 0 && u >= create.pool) return;
        if (d < 0 && create.alloc[i] <= 0) return;
        create.alloc[i] += d; renderCreate();
      };
    });
    $('bonusLeft').textContent = `Bonus points remaining: ${create.pool - used}`;
    const hp = calc.maxHp(create.cls, 1, st[1]), mana = calc.maxMana(create.cls, 1, st);
    $('derived').innerHTML = `Level 1 HP: <b>${hp}</b> &nbsp; Mana: <b>${mana || '—'}</b>`;
    const sp = Object.keys(SPELLS).filter((s) => SPELLS[s].classes[create.cls] === 1).map((s) => SPELLS[s].name).join(', ');
    $('descBox').innerHTML = `<b>${RACES[create.race].name}</b>: ${RACES[create.race].desc}<br><br><b>${CLASSES[create.cls].name}</b>: ${CLASSES[create.cls].desc}<br><br><i>Starting abilities:</i> ${sp}`;
  }
  function validName(n) {
    if (!/^[A-Za-z]{3,15}$/.test(n)) return 'Names must be 3-15 letters, no spaces or numbers.';
    return '';
  }
  function initTitle(onPlay) {
    const save = EB.loadSave();
    if (save && save.char) {
      $('continueBox').classList.remove('hidden');
      const c = save.char;
      $('continueInfo').innerHTML = `<b style="color:#f3c85a;font-size:20px">${c.name}</b><br>Level ${c.level} ${RACES[c.race].name} ${CLASSES[c.cls].name}`;
    }
    $('btnContinue').onclick = () => { EB.audio.unlock(); onPlay(null); };
    $('btnDelete').onclick = () => { if (confirm('Delete this character forever?')) { localStorage.removeItem(EB.SAVE_KEY); location.reload(); } };
    $('btnNew').onclick = () => { $('menuMain').classList.add('hidden'); $('menuCreate').classList.remove('hidden'); renderCreate(); $('nameInput').focus(); };
    $('btnBack').onclick = () => { $('menuCreate').classList.add('hidden'); $('menuMain').classList.remove('hidden'); };
    $('btnCreate').onclick = () => {
      let n = $('nameInput').value.trim();
      const err = validName(n);
      if (err) { $('nameErr').textContent = err; return; }
      n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
      if (save && save.char && !confirm(`This will replace your existing character ${save.char.name}. Continue?`)) return;
      EB.audio.unlock();
      const seedStr = $('seedInput').value.trim() || '1999';
      const seed = /^\d+$/.test(seedStr) ? parseInt(seedStr, 10) : U.hashStr(seedStr);
      onPlay({ name: n, race: create.race, cls: create.cls, stats: baseStats(), seed });
    };
    $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnCreate').click(); e.stopPropagation(); });
  }

  // ---------- HUD ----------
  const MAX_LOG = 250;
  const ui = {
    log(msg, type) {
      const el = $('chatLog');
      const d = document.createElement('div');
      d.className = 'm ' + (type || 'sys');
      d.textContent = msg;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
      el.appendChild(d);
      while (el.childNodes.length > MAX_LOG) el.removeChild(el.firstChild);
      if (atBottom) el.scrollTop = el.scrollHeight;
    },
    center(msg, sub, dur) {
      const el = $('centerMsg');
      el.innerHTML = msg + (sub ? `<small>${sub}</small>` : '');
      el.style.opacity = 1;
      clearTimeout(ui._ct);
      ui._ct = setTimeout(() => (el.style.opacity = 0), (dur || 2.5) * 1000);
    },
    bar(fillId, textId, cur, max, text) {
      const pct = max > 0 ? U.clamp(cur / max, 0, 1) * 100 : 0;
      $(fillId).style.width = pct.toFixed(1) + '%';
      if (textId) $(textId).textContent = text != null ? text : `${Math.ceil(cur)} / ${max}`;
    },
    tooltipFor(el, fn) {
      el.addEventListener('mouseenter', (e) => { const t = $('tooltip'); t.innerHTML = fn(); t.classList.remove('hidden'); ui.moveTip(e); });
      el.addEventListener('mousemove', ui.moveTip);
      el.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
    },
    moveTip(e) { const t = $('tooltip'); t.style.left = Math.min(window.innerWidth - 270, e.clientX + 14) + 'px'; t.style.top = Math.min(window.innerHeight - 160, e.clientY + 14) + 'px'; },
    hideTip() { $('tooltip').classList.add('hidden'); },
    itemTip(id) {
      const it = ITEMS[id]; if (!it) return '';
      let h = `<div class="tn ${it.rare ? 'rare' : ''}">${it.name}</div>`;
      if (it.rare) h += '<div style="color:#ffb040">MAGIC ITEM &nbsp;LORE ITEM</div>';
      if (it.slot) h += `<div>Slot: ${it.slot.toUpperCase()}</div>`;
      if (it.dmg) h += `<div>Skill: ${it.verb === 'pierce' ? 'Piercing' : it.verb === 'crush' ? '1H Blunt' : '1H Slashing'} &nbsp; DMG: ${it.dmg} &nbsp; Delay: ${Math.round(it.delay * 10)}</div>`;
      if (it.ac) h += `<div>AC: ${it.ac}</div>`;
      const st = [];
      if (it.stats) for (const k in it.stats) st.push(`${k}: +${it.stats[k]}`);
      if (it.hp) st.push(`HP: +${it.hp}`);
      if (it.mana) st.push(`MANA: +${it.mana}`);
      if (st.length) h += `<div style="color:#90e070">${st.join(' &nbsp; ')}</div>`;
      if (it.use) h += `<div style="color:#8fd0ff">Use: Heals ${it.use.heal} HP</div>`;
      h += `<div style="color:#b0a080">Value: ${U.coinShort(it.value)}</div>`;
      return h;
    },
    slotHTML(item, label) {
      if (!item) return `<div class="sl">${label || ''}</div>`;
      const it = ITEMS[item.id];
      return `${label ? `<div class="sl">${label}</div>` : ''}<div class="ic">${it.icon || '◆'}</div><div class="nm">${it.name}</div>${item.count > 1 ? `<div class="ct">${item.count}</div>` : ''}`;
    },
    blockSwatch(game, b) {
      const bd = BLOCKS[b], N = game.world.atlas.N, t = bd.tiles[1];
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.className = 'blk';
      cv.getContext('2d').drawImage(game.world.atlas.canvas, (t % N) * 16, Math.floor(t / N) * 16, 16, 16, 0, 0, 16, 16);
      return cv;
    },
  };

  EB.ui = ui;
  EB.initTitle = initTitle;
  EB.$ = $;
})();
