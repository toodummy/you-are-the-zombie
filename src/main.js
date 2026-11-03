/* main: boot, input, fixed-step loop, screens, save/load. Defines no global. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const Z = window.ZSim, R = window.ZRender, A = window.ZAudio;
  const SAVE_KEY = 'zombie-save-v2', MUTE_KEY = 'zombie-v2-muted', STEP = 1 / 60;
  const HIT_STOP = 0.06, DYING_REAL = 1.0, DYING_RATE = 0.3; // 1 s of real time at 0.3x = 0.3 s of slow-mo
  const $ = id => document.getElementById(id);

  const canvas = $('game'), stage = $('stage'), fit = $('fit');
  if (!canvas || !stage) return;
  const live = $('live');

  const silentAudio = { unlock() {}, onEvents() {}, update() {}, setMuted() {}, play() {}, muted: false };
  let renderer = null, audio = silentAudio;
  try { renderer = R.create(canvas); } catch (e) { console.error('renderer failed', e); }
  try { if (A) audio = A.create(); } catch (e) { audio = silentAudio; }
  if (!Z || !renderer) {
    const tag = document.querySelector('#scrTitle .tag');
    if (tag) tag.textContent = 'The game failed to load. Please reload the page.';
    return;
  }

  /* ---------- storage ---------- */
  function storeGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage is optional */ } }
  function loadSave() {
    let raw = null;
    try { const s = storeGet(SAVE_KEY); raw = s ? JSON.parse(s) : null; } catch (e) { raw = null; }
    try { return Z.normalizeSave(raw); } catch (e) { try { return Z.defaultSave(); } catch (e2) { return null; } }
  }
  function persist() { try { storeSet(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* optional */ } }

  let save = loadSave();
  let mode = 'title';            // title | shop | play | pause | dying | over
  let shopReturn = 'title';
  let game = null, runCounter = 0, lastEarned = null;
  let acc = 0, last = 0, hitStop = 0, dyingT = 0, overShownAt = 0;
  let jumpLatch = false, screamLatch = false, lastReady = null;
  const heldKeys = new Set(), heldPointers = new Set();
  const input = { jumpPressed: false, jumpHeld: false, scream: false };
  let muted = storeGet(MUTE_KEY) === '1';
  audio.setMuted(muted);

  const reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  renderer.setReducedMotion(!!(reducedMQ && reducedMQ.matches));
  if (reducedMQ && reducedMQ.addEventListener) reducedMQ.addEventListener('change', () => renderer.setReducedMotion(reducedMQ.matches));

  /* ---------- layout: fit the 16:9 stage into the free space ---------- */
  function fitStage() {
    const r = fit.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const w = Math.floor(Math.min(r.width, r.height * 16 / 9));
      stage.style.width = w + 'px';
      stage.style.height = Math.floor(w * 9 / 16) + 'px';
    }
    renderer.resize();
  }
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', fitStage);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);
  fitStage();
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderer.clearCache(); fitStage(); }); } catch (e) { /* optional */ }

  /* ---------- screens ---------- */
  const screens = { title: $('scrTitle'), shop: $('scrShop'), pause: $('scrPause'), over: $('scrOver') };
  function setMode(m) {
    mode = m;
    stage.dataset.mode = m;
    document.body.classList.toggle('playing', m === 'play');
    for (const k in screens) if (screens[k]) screens[k].hidden = k !== m;
    const focusId = { title: 'btnPlay', shop: 'btnShopBack', pause: 'btnResume', over: 'btnAgain' }[m];
    if (focusId) {
      const el = $(focusId);
      if (m === 'shop') { const b = screens.shop.querySelector('.buy:not(:disabled)'); (b || el).focus({ preventScroll: true }); }
      else if (el) el.focus({ preventScroll: true });
    } else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function say(t) { if (live) live.textContent = t; }

  function missionDef(id) {
    const pool = Z.MISSION_POOL || [];
    for (let i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }
  function refreshTitle() {
    $('tBest').textContent = String(Math.floor((save && save.best) || 0));
    $('tBrains').textContent = String(Math.floor((save && save.brains) || 0));
    const ol = $('tMissions'); ol.textContent = '';
    const ms = (save && save.missions) || [];
    for (let i = 0; i < ms.length; i++) {
      const def = missionDef(ms[i].id); if (!def) continue;
      const li = document.createElement('li');
      const goal = def.goal || 1, prog = Math.min(goal, Math.floor(ms[i].progress || 0));
      li.textContent = def.text + '  (' + prog + '/' + goal + ')';
      const bar = document.createElement('span'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = Math.round(prog / goal * 100) + '%';
      bar.appendChild(fill); li.appendChild(bar); ol.appendChild(li);
    }
  }
  function showTitle() { refreshTitle(); setMode('title'); }

  /* shop */
  const shopRows = {};
  function buildShop() {
    const ul = $('shopList'); ul.textContent = '';
    const ups = Z.UPGRADES || [];
    for (let i = 0; i < ups.length; i++) {
      const u = ups[i];
      const li = document.createElement('li');
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = u.name;
      const desc = document.createElement('span'); desc.className = 'desc'; desc.textContent = u.desc;
      info.appendChild(name); info.appendChild(desc);
      const pips = document.createElement('span'); pips.className = 'pips'; pips.setAttribute('aria-hidden', 'true');
      for (let p = 0; p < u.max; p++) pips.appendChild(document.createElement('i'));
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'buy';
      btn.addEventListener('click', () => buy(u.id));
      li.appendChild(info); li.appendChild(pips); li.appendChild(btn);
      ul.appendChild(li);
      shopRows[u.id] = { u, pips, btn };
    }
  }
  function refreshShop() {
    $('shopBrains').textContent = String(Math.floor(save.brains || 0));
    for (const id in shopRows) {
      const row = shopRows[id], u = row.u, level = (save.upgrades && save.upgrades[id]) || 0, maxed = level >= u.max;
      let cost = 0; try { cost = maxed ? 0 : u.cost(level); } catch (e) { cost = 0; }
      const pips = row.pips.children;
      for (let p = 0; p < pips.length; p++) pips[p].className = p < level ? 'on' : '';
      row.btn.textContent = maxed ? 'Maxed' : 'Buy · ' + cost;
      row.btn.disabled = maxed || (save.brains || 0) < cost;
      row.btn.setAttribute('aria-label', u.name + ', level ' + level + ' of ' + u.max + (maxed ? ', maxed' : ', costs ' + cost + ' brains'));
    }
  }
  function buy(id) {
    let r = null;
    try { r = Z.buyUpgrade(save, id); } catch (e) { r = null; }
    if (r && r.ok) {
      save = r.save; persist(); audio.play('brain'); refreshShop(); say('Bought ' + shopRows[id].u.name);
      if (shopRows[id].btn.disabled) $('btnShopBack').focus({ preventScroll: true });
    } else {
      audio.play('ui'); say(r && r.reason === 'max' ? 'Already maxed' : 'Not enough brains');
    }
  }
  function openShop(from) {
    shopReturn = from;
    if (!Object.keys(shopRows).length) buildShop();
    refreshShop(); setMode('shop');
  }
  function closeShop() { if (shopReturn === 'over') showOverScreen(); else showTitle(); }

  /* ---------- runs ---------- */
  function startRun() {
    runCounter++;
    const seed = ((Math.floor(performance.now() * 1000) ^ Math.imul(runCounter, 2654435761)) >>> 0) || 1;
    try { game = Z.createGame({ seed, save }); } catch (e) { console.error(e); return; }
    renderer.reset(); renderer.setBest((save && save.best) || 0);
    acc = 0; hitStop = 0; jumpLatch = false; screamLatch = false; heldKeys.clear(); heldPointers.clear();
    audio.play('ui');
    setMode('play');
    say('Run started');
  }
  function pause() {
    if (mode !== 'play') return;
    releaseAll();
    $('btnMute').textContent = muted ? 'Sound: off' : 'Sound: on';
    setMode('pause'); say('Paused');
  }
  function resume() { if (mode === 'pause') { last = 0; acc = 0; setMode('play'); } }
  function beginDying() {
    mode = 'dying'; stage.dataset.mode = 'dying'; document.body.classList.remove('playing');
    dyingT = 0; releaseAll();
    try {
      const r = Z.finishRun(save, game);
      save = r.save; lastEarned = r.earned || null; persist();
    } catch (e) { console.error(e); lastEarned = null; }
  }
  function showOverScreen() {
    const score = Math.floor((game && game.score) || 0);
    $('oScore').textContent = String(score);
    $('oBest').textContent = String(Math.floor((save && save.best) || 0));
    $('oNew').hidden = !(lastEarned && lastEarned.newBest);
    $('oBrains').textContent = '+' + ((lastEarned && lastEarned.brains) || 0);
    const done = (lastEarned && lastEarned.missionsDone) || [];
    const ul = $('oDone'); ul.textContent = '';
    for (let i = 0; i < done.length; i++) { const li = document.createElement('li'); li.textContent = '✓ ' + done[i]; ul.appendChild(li); }
    $('oDoneWrap').hidden = done.length === 0;
    setMode('over'); overShownAt = performance.now();
    say('Game over. Score ' + score + (lastEarned && lastEarned.newBest ? ', new best!' : '') + '. Press Space or Enter to run again.');
  }

  function stepOnce() {
    input.jumpPressed = jumpLatch;
    input.jumpHeld = heldKeys.size > 0 || heldPointers.size > 0;
    input.scream = screamLatch;
    jumpLatch = false; screamLatch = false;
    try { Z.step(game, input, STEP); } catch (e) { console.error(e); }
    const ev = game.events;
    if (ev && ev.length) {
      try { renderer.onEvents(ev); } catch (e) { console.error(e); }
      audio.onEvents(ev, game);
      for (let i = 0; i < ev.length; i++) if (ev[i] && ev[i].type === 'smash') hitStop = HIT_STOP;
    }
    if (game.status === 'over') beginDying();
  }

  function frame(ts) {
    window.requestAnimationFrame(frame);
    let real = last ? (ts - last) / 1000 : 0;
    last = ts;
    if (!(real > 0)) real = 0;
    if (real > 0.25) real = 0.25;
    let renderDt = real;
    if (mode === 'play' && game) {
      if (hitStop > 0) hitStop -= real;
      else {
        acc += real;
        let steps = 0;
        while (acc >= STEP && steps < 8) {
          stepOnce(); acc -= STEP; steps++;
          if (mode !== 'play' || hitStop > 0) break;
        }
        if (steps >= 8) acc = 0;
      }
    } else if (mode === 'dying') {
      dyingT += real; renderDt = real * DYING_RATE;
      if (dyingT >= DYING_REAL) showOverScreen();
    }
    audio.update(mode === 'play' ? game : null);
    const attract = !game || mode === 'title' || (mode === 'shop' && shopReturn === 'title');
    const alpha = mode === 'play' && hitStop <= 0 ? Math.min(1, acc / STEP) : 0;
    try { renderer.draw(attract ? null : game, alpha, renderDt); } catch (e) { console.error(e); }
    if (mode === 'play' && game) {
      const ready = !!(game.scream && game.scream.charge >= 1);
      if (ready !== lastReady) {
        lastReady = ready;
        $('screamBtn').classList.toggle('ready', ready);
        $('padScream').classList.toggle('ready', ready);
      }
    }
  }

  /* ---------- input ---------- */
  function releaseAll() { heldKeys.clear(); heldPointers.clear(); jumpLatch = false; screamLatch = false; }
  function toggleMute() {
    muted = !muted; audio.setMuted(muted); storeSet(MUTE_KEY, muted ? '1' : '0');
    $('btnMute').textContent = muted ? 'Sound: off' : 'Sound: on';
    say(muted ? 'Sound off' : 'Sound on');
  }
  function keyName(e) { const k = e.key || ''; return k.length === 1 ? k.toLowerCase() : k; }
  const JUMP_KEYS = { ' ': 1, w: 1, ArrowUp: 1, j: 1, Spacebar: 1 };
  const SCREAM_KEYS = { k: 1, s: 1, Shift: 1 };

  window.addEventListener('keydown', e => {
    audio.unlock();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyName(e);
    if (k === 'm') { toggleMute(); return; }
    if (mode === 'play') {
      if (JUMP_KEYS[k]) { e.preventDefault(); if (!e.repeat && !heldKeys.has(k)) jumpLatch = true; heldKeys.add(k); return; }
      if (SCREAM_KEYS[k]) { e.preventDefault(); if (!e.repeat) screamLatch = true; return; }
      if (k === 'p' || k === 'Escape') { e.preventDefault(); pause(); }
      return;
    }
    if (mode === 'dying') { if (JUMP_KEYS[k] || k === 'Enter') e.preventDefault(); return; }
    if (mode === 'pause') { if (k === 'p' || k === 'Escape') { e.preventDefault(); resume(); } return; }
    if (mode === 'shop') { if (k === 'Escape') { e.preventDefault(); closeShop(); } return; }
    if (mode === 'over' || mode === 'title') {
      if ((k === ' ' || k === 'Enter') && !e.repeat) {
        const ae = document.activeElement;
        const primary = mode === 'over' ? $('btnAgain') : $('btnPlay');
        if (ae && ae.tagName === 'BUTTON' && ae !== primary) return; // let the focused button act
        e.preventDefault();
        if (mode === 'over' && performance.now() - overShownAt < 150) return;
        startRun();
      }
    }
  });
  window.addEventListener('keyup', e => { heldKeys.delete(keyName(e)); if (e.key === ' ') heldKeys.delete(' '); });

  canvas.addEventListener('pointerdown', e => {
    audio.unlock();
    if (mode !== 'play') return;
    const r = canvas.getBoundingClientRect();
    if (e.clientX - r.left <= r.width * 0.7) {
      e.preventDefault();
      jumpLatch = true; heldPointers.add(e.pointerId);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
    }
  });
  const endPointer = e => { heldPointers.delete(e.pointerId); };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointerdown', () => audio.unlock(), true);

  function screamButton(btn) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); audio.unlock(); if (mode === 'play') screamLatch = true; });
    btn.addEventListener('click', e => { if (e.detail === 0 && mode === 'play') screamLatch = true; });
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }
  screamButton($('screamBtn'));
  screamButton($('padScream'));
  const padJump = $('padJump');
  padJump.addEventListener('pointerdown', e => {
    e.preventDefault(); audio.unlock();
    if (mode !== 'play') return;
    jumpLatch = true; heldPointers.add(e.pointerId);
    try { padJump.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
  });
  padJump.addEventListener('click', e => { if (e.detail === 0 && mode === 'play') jumpLatch = true; });
  padJump.addEventListener('contextmenu', e => e.preventDefault());

  $('pauseBtn').addEventListener('click', () => pause());
  /* ---------- phones: fullscreen + landscape when a run starts ---------- */
  const coarseMQ = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  function lockLandscape() {
    try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* optional */ }
  }
  function goFullscreen() {
    if (!coarseMQ || !coarseMQ.matches) return;
    const de = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) { lockLandscape(); return; }
      const req = de.requestFullscreen || de.webkitRequestFullscreen;
      if (!req) return;
      const p = req.call(de, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => { lockLandscape(); fitStage(); }, () => {});
      else lockLandscape();
    } catch (e) { /* not allowed here (e.g. iPhone Safari): play in the page */ }
  }
  document.addEventListener('fullscreenchange', fitStage);
  document.addEventListener('webkitfullscreenchange', fitStage);

  $('btnPlay').addEventListener('click', () => { audio.unlock(); goFullscreen(); startRun(); });
  $('btnShopT').addEventListener('click', () => { audio.unlock(); openShop('title'); });
  $('btnShopBack').addEventListener('click', closeShop);
  $('btnResume').addEventListener('click', resume);
  $('btnMute').addEventListener('click', toggleMute);
  $('btnQuit').addEventListener('click', () => { game = null; showTitle(); });
  $('btnAgain').addEventListener('click', () => { audio.unlock(); goFullscreen(); startRun(); });
  $('btnShopO').addEventListener('click', () => openShop('over'));
  $('btnMenu').addEventListener('click', showTitle);

  window.addEventListener('blur', () => { releaseAll(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); pause(); } last = 0; });

  /* ---------- boot ---------- */
  showTitle();
  window.requestAnimationFrame(frame);
})();
