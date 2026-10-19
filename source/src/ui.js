// Everblock - formulas, character creation and HUD/window rendering
(function () {
  const EB = window.EB;
  const U = EB.util;
  const { RACES, CLASSES, STAT_NAMES, ITEMS, SPELLS, EQUIP_SLOTS, B, BLOCKS, CON_HEX } = EB.data;
  const $ = (id) => document.getElementById(id);

  // ---------- formulas ----------
  const calc = EB.calc; // v6: formulas moved to data.js so the server shares them

  // ---------- Character creation ----------
  const create = { race: 'human', cls: 'warrior', cls2: '', alloc: [0, 0, 0, 0, 0, 0, 0], pool: 20 };
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
      b.onclick = () => { create.cls = k; if (create.cls2 === k) create.cls2 = ''; create.alloc.fill(0); renderCreate(); };
      cl.appendChild(b);
    }
    // v9: second class (any class; the primary class decides race rules, starting gear and stat bonus)
    const cl2 = $('classList2');
    if (cl2) {
      cl2.innerHTML = '';
      for (const k of ['', ...Object.keys(CLASSES)]) {
        if (k === create.cls) continue;
        const b = document.createElement('button'); b.textContent = k ? CLASSES[k].name : 'None yet'; b.dataset.cls2 = k;
        if (k === create.cls2) b.className = 'sel';
        b.onclick = () => { create.cls2 = k; renderCreate(); };
        cl2.appendChild(b);
      }
    }
    const classes = create.cls2 ? [create.cls, create.cls2] : [create.cls];
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
    const hp = EB.multi.maxHp(classes, 1, st[1]), mana = EB.multi.maxMana(classes, 1, st);
    $('derived').innerHTML = `<b>${EB.multi.label(classes)}</b> &nbsp; Level 1 HP: <b>${hp}</b> &nbsp; Mana: <b>${mana || '—'}</b>${classes.length > 1 ? ' &nbsp; <span style="color:#d0a060">XP -10%</span>' : ''}`;
    const sp = Object.keys(SPELLS).filter((s) => EB.multi.spellLvl(s, classes) === 1).map((s) => SPELLS[s].name).join(', ');
    const eq = {}; for (const id of CLASSES[create.cls].startItems || []) { const it = EB.data.ITEMS[id]; if (it && it.slot) eq[it.slot] = { id }; }
    if (EB.models) EB.models.preview($('charPreview'), { race: create.race, cls: create.cls, equip: eq });
    $('descBox').innerHTML = `<b>${RACES[create.race].name}</b>: ${RACES[create.race].desc}<br><br><b>${CLASSES[create.cls].name}</b>: ${CLASSES[create.cls].desc}${create.cls2 ? `<br><br><b>${CLASSES[create.cls2].name}</b>: ${CLASSES[create.cls2].desc}` : ''}<br><br><i>Starting abilities:</i> ${sp}`;
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
      $('continueInfo').innerHTML = `<b style="color:#f3c85a;font-size:20px">${c.name}</b><br>Level ${c.level} ${RACES[c.race].name} ${EB.multi.label(EB.multi.classesOf(c))}`;
    }
    $('btnContinue').onclick = () => { EB.audio.unlock(); if (EB.models) EB.models.stopPreview(); onPlay(null); };
    $('btnDelete').onclick = () => { if (confirm('Delete this character forever?')) { localStorage.removeItem(EB.SAVE_KEY); location.reload(); } };
    $('btnNew').onclick = () => { $('menuMain').classList.add('hidden'); $('menuOnline').classList.add('hidden'); $('menuCreate').classList.remove('hidden'); $('menuCreate').classList.toggle('online', !!(EB.net && EB.net.creating)); renderCreate(); $('nameInput').focus(); };
    $('btnBack').onclick = () => { if (EB.models) EB.models.stopPreview(); $('menuCreate').classList.add('hidden'); if (EB.net && EB.net.creating) { EB.net.creating = false; EB.net.ui.show('menuOnline'); return; } $('menuMain').classList.remove('hidden'); };
    $('btnCreate').onclick = () => {
      let n = $('nameInput').value.trim();
      const err = validName(n);
      if (err) { $('nameErr').textContent = err; return; }
      n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
      if (EB.net && EB.net.creating) { $('nameErr').textContent = ''; EB.net.send({ t: 'create', char: { name: n, race: create.race, cls: create.cls, classes: create.cls2 ? [create.cls, create.cls2] : [create.cls], stats: baseStats() } }); return; } // v6: online characters live on the server
      if (save && save.char && !confirm(`This will replace your existing character ${save.char.name}. Continue?`)) return;
      EB.audio.unlock();
      const seedStr = $('seedInput').value.trim() || '1999';
      const seed = /^\d+$/.test(seedStr) ? parseInt(seedStr, 10) : U.hashStr(seedStr);
      if (EB.models) EB.models.stopPreview();
      onPlay({ name: n, race: create.race, cls: create.cls, classes: create.cls2 ? [create.cls, create.cls2] : [create.cls], stats: baseStats(), seed });
    };
    $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnCreate').click(); e.stopPropagation(); });
    if (EB.net) EB.net.bindTitle(onPlay); // v6: Play Online
  }

  // ---------- HUD ----------
  const MAX_LOG = 250;
  const ui = {
    log(msg, type, html) {
      const el = $('chatLog');
      const d = document.createElement('div');
      d.className = 'm ' + (type || 'sys');
      if (html) d.innerHTML = msg; else d.textContent = msg;
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
    qcls(item) { return item ? ' q-' + EB.gear.quality(item) : ''; },
    // v8: tooltips show quality, affix, procs, click effects, focus effects and set bonuses; accepts an instance or an id
    itemTip(inst) {
      const G = EB.gear, it = G.def(inst); if (!it) return '';
      const id = typeof inst === 'string' ? inst : inst.id, q = G.QUALITY[it.q] || G.QUALITY.common;
      let h = `<div class="tn" style="color:${q.color}">${it.name}</div>`;
      h += `<div style="color:${q.color}">${q.label}${it.slot ? '' : ' item'}${it.rare ? ' &nbsp;MAGIC ITEM &nbsp;LORE ITEM' : ''}</div>`;
      if (it.slot) h += `<div>Slot: ${it.slot.toUpperCase()}</div>`;
      if (it.dmg) h += `<div>Skill: ${it.verb === 'pierce' ? 'Piercing' : it.verb === 'crush' ? '1H Blunt' : '1H Slashing'} &nbsp; DMG: ${it.dmg} &nbsp; Delay: ${Math.round(it.delay * 10)}</div>`;
      if (it.ac) h += `<div>AC: ${it.ac}</div>`;
      const st = [];
      if (it.stats) for (const k in it.stats) st.push(`${k}: +${it.stats[k]}`);
      if (it.hp) st.push(`HP: +${it.hp}`);
      if (it.mana) st.push(`MANA: +${it.mana}`);
      if (st.length) h += `<div style="color:#90e070">${st.join(' &nbsp; ')}</div>`;
      if (it.affixed) h += `<div style="color:#5ee05e;font-style:italic">Suffix: ${G.AFFIXES[it.sfx].name}</div>`;
      if (it.proc) { const P = G.PROCS[it.proc]; h += `<div style="color:#ffb060">Combat Effect: ${P.name} - ${P.desc} (${Math.round(G.procChance(it.proc, it.delay) * 100)}% per hit)</div>`; }
      if (it.click) { const C = G.CLICKS[it.click]; h += `<div style="color:#8fd0ff">Click Effect: ${C.name} - ${C.desc} (recast ${C.cd >= 60 ? Math.round(C.cd / 60) + 'm' : C.cd + 's'}${it.slot ? ', must be worn' : ''})</div>`; }
      if (it.focus) for (const k in it.focus) h += `<div style="color:#8fd0ff">Focus: ${G.FOCUS_LABEL[k]} +${it.focus[k]}%</div>`;
      if (it.use) h += `<div style="color:#8fd0ff">Use: Heals ${it.use.heal} HP</div>`;
      if (it.set) {
        const S = G.SETS[it.set], eq = (EB.game && EB.game.player && EB.game.player.equip) || {}, worn = new Set(Object.values(eq).filter(Boolean).map((e) => e.id));
        const n = S.items.filter((x) => worn.has(x)).length;
        h += `<div class="setb"><div style="color:#ffd870">${S.name} (${n}/${S.items.length})</div>`;
        h += S.items.map((x) => `<div style="color:${worn.has(x) ? '#e8e0cc' : '#7a7468'};padding-left:8px">${EB.data.ITEMS[x].name}</div>`).join('');
        for (const k in S.bonus) h += `<div style="color:${n >= +k ? '#5ee05e' : '#7a7468'}">(${k}) Set: ${G.bonusText(S.bonus[k])}</div>`;
        h += '</div>';
      }
      h += `<div style="color:#b0a080">Value: ${U.coinShort(it.value)}</div>`;
      return h;
    },
    slotHTML(item, label) {
      if (!item) return `<div class="sl">${label || ''}</div>`;
      const it = EB.gear.def(item);
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
