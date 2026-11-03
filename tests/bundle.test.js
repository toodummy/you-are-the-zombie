'use strict';
// Builds the single-file bundle, checks its shape, then boots it in node:vm
// with a minimal DOM/canvas stub and drives frames + keyboard input.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'you-are-the-zombie.html');
const SRC_FILES = ['sim.js', 'render.js', 'audio.js', 'main.js'];

let built = null;
function build() {
  if (built) return built;
  const missing = ['index.html', ...SRC_FILES].filter((f) => !fs.existsSync(path.join(ROOT, 'src', f)));
  if (missing.length) throw new Error('missing ' + missing.map((f) => 'src/' + f).join(', ') + ' - cannot build the bundle yet');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    throw new Error('node build.js failed: ' + (e.stderr ? e.stderr.toString() : e.message));
  }
  built = fs.readFileSync(OUT, 'utf8');
  return built;
}

function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ attrs: m[1], code: m[2] });
  return out;
}

test('bundle: build.js writes dist/you-are-the-zombie.html with the right shape', () => {
  const html = build();
  assert.match(html, /<title>[^<]+<\/title>/i, 'needs a non-empty <title>');
  assert.doesNotMatch(html, /<!doctype/i, 'no <!doctype> (the host adds the skeleton)');
  assert.doesNotMatch(html, /<\/?html[\s>]/i, 'no <html> tag');
  assert.doesNotMatch(html, /<\/?head[\s>]/i, 'no <head> tag');
  assert.doesNotMatch(html, /<\/?body[\s>]/i, 'no <body> tag');
  assert.doesNotMatch(html, /<script[^>]*\bsrc\s*=/i, 'no external <script src=>');
  assert.ok(!html.includes('/*@SCRIPTS@*/'), 'the marker must be replaced');
  for (const f of SRC_FILES) assert.ok(html.includes('// --- ' + f + ' ---'), `bundle must contain ${f}`);
  const scripts = inlineScripts(html).map((s) => s.code).join('\n');
  for (const word of ['alert', 'confirm', 'prompt']) {
    assert.ok(!new RegExp('(^|[^.\\w])' + word + '\\s*\\(').test(scripts) && !new RegExp('window\\.' + word + '\\s*\\(').test(scripts), `bundle must not call ${word}(...)`);
  }
  // each source made it through intact (modulo </script escaping)
  for (const f of SRC_FILES) {
    const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/<\/(script)/gi, '<\\/$1');
    assert.ok(scripts.includes(src), `${f} must be inlined unchanged`);
  }
});

test('build.js escapes </script> inside sources', () => {
  const { escapeScript } = require('../build.js');
  assert.equal(escapeScript('var s = "</script>";'), 'var s = "<\\/script>";');
  assert.equal(escapeScript("x('</SCRIPT >')"), "x('<\\/SCRIPT >')");
});

// ------------------------------------------------------------------ DOM stub

function makeEnv() {
  const listeners = new Map(); // target -> {type: [fn]}
  const consoleErrors = [];
  const drawCalls = { n: 0, byName: {} };
  let now = 0;
  const rafQueue = [];
  const timers = [];
  let timerId = 1;

  function addL(target, type, fn) {
    if (typeof fn !== 'function' && !(fn && fn.handleEvent)) return;
    if (!listeners.has(target)) listeners.set(target, {});
    const m = listeners.get(target);
    (m[type] = m[type] || []).push(fn);
  }
  function removeL(target, type, fn) {
    const m = listeners.get(target);
    if (m && m[type]) m[type] = m[type].filter((f) => f !== fn);
  }
  function fire(target, ev) {
    const m = listeners.get(target);
    if (!m || !m[ev.type]) return;
    for (const fn of m[ev.type].slice()) {
      if (ev._stopped) break;
      ev.currentTarget = target;
      if (typeof fn === 'function') fn.call(target, ev); else fn.handleEvent(ev);
    }
    const prop = target['on' + ev.type];
    if (typeof prop === 'function' && !ev._stopped) prop.call(target, ev);
  }

  function makeCtx(canvas) {
    const store = { canvas, globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000',
      textAlign: 'start', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: 'transparent',
      lineCap: 'butt', lineJoin: 'miter', imageSmoothingEnabled: true, filter: 'none', lineDashOffset: 0, miterLimit: 10 };
    const gradient = { addColorStop() {} };
    const special = {
      measureText: (t) => ({ width: String(t).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      createLinearGradient: () => gradient, createRadialGradient: () => gradient, createConicGradient: () => gradient,
      createPattern: () => ({ setTransform() {} }),
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, (w || 1) * (h || 1) * 4)) }),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), getLineDash: () => [], isPointInPath: () => false,
    };
    return new Proxy(store, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k === 'symbol') return undefined;
        return (...args) => {
          drawCalls.n++;
          drawCalls.byName[k] = (drawCalls.byName[k] || 0) + 1;
          return special[k] ? special[k](...args) : undefined;
        };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
  }

  const elements = new Map();
  function makeEl(tag, id) {
    const el = {
      tagName: String(tag || 'div').toUpperCase(), nodeName: String(tag || 'div').toUpperCase(), id: id || '',
      style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
      dataset: {}, children: [], childNodes: [], parentNode: null, parentElement: null, attributes: {},
      textContent: '', innerHTML: '', innerText: '', value: '', className: '', hidden: false, disabled: false, checked: false,
      width: 300, height: 150, clientWidth: 1280, clientHeight: 720, offsetWidth: 1280, offsetHeight: 720, tabIndex: 0,
      classList: null,
      addEventListener(type, fn) { addL(el, type, fn); },
      removeEventListener(type, fn) { removeL(el, type, fn); },
      dispatchEvent(ev) { fire(el, ev); return true; },
      appendChild(c) { el.children.push(c); el.childNodes.push(c); if (c && typeof c === 'object') { c.parentNode = el; c.parentElement = el; } return c; },
      append(...cs) { cs.forEach((c) => (typeof c === 'object' ? el.appendChild(c) : null)); },
      prepend(...cs) { cs.forEach((c) => (typeof c === 'object' ? el.appendChild(c) : null)); },
      insertBefore(c) { return el.appendChild(c); },
      removeChild(c) { el.children = el.children.filter((x) => x !== c); el.childNodes = el.children.slice(); return c; },
      replaceChildren(...cs) { el.children = []; el.childNodes = []; el.append(...cs); },
      remove() { if (el.parentNode) el.parentNode.removeChild(el); },
      setAttribute(k, v) { el.attributes[k] = String(v); if (k === 'id') el.id = String(v); },
      getAttribute(k) { return k in el.attributes ? el.attributes[k] : null; },
      removeAttribute(k) { delete el.attributes[k]; },
      hasAttribute(k) { return k in el.attributes; },
      toggleAttribute(k, f) { if (f === undefined ? !(k in el.attributes) : f) el.attributes[k] = ''; else delete el.attributes[k]; },
      querySelector() { return makeEl('div'); },
      querySelectorAll() { return []; },
      getElementsByTagName() { return []; },
      getElementsByClassName() { return []; },
      closest() { return null; }, matches() { return false; }, contains() { return false; },
      getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, right: 1280, bottom: 720, width: 1280, height: 720 }; },
      focus() {}, blur() {}, click() { fire(el, mkEvent('click', {})); }, scrollIntoView() {},
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
      requestFullscreen() { return Promise.resolve(); }, animate() { return { finished: Promise.resolve(), cancel() {} }; },
      getContext() { if (!el._ctx) el._ctx = makeCtx(el); return el._ctx; },
      toDataURL() { return 'data:,'; },
    };
    const cls = new Set();
    el.classList = {
      add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
      contains: (c) => cls.has(c), replace: (a, b) => { if (cls.has(a)) { cls.delete(a); cls.add(b); return true; } return false; },
      get length() { return cls.size; }, item: (i) => [...cls][i] || null, forEach: (f) => [...cls].forEach(f),
      [Symbol.iterator]: () => cls[Symbol.iterator](),
    };
    return el;
  }

  function byId(id) {
    if (!elements.has(id)) {
      // every stub element supports getContext; ids that look like the stage are tagged CANVAS
      const tag = /canvas|stage|game/i.test(id) ? 'canvas' : 'div';
      elements.set(id, makeEl(tag, id));
    }
    return elements.get(id);
  }

  const mainCanvas = makeEl('canvas', 'canvas');
  const body = makeEl('body');
  const documentElement = makeEl('html');
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] || null,
    get length() { return store.size; },
  };

  const document = {
    body, documentElement, head: makeEl('head'), readyState: 'complete', hidden: false, visibilityState: 'visible',
    title: '', activeElement: body, fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
    getElementById: byId,
    querySelector(sel) {
      if (typeof sel === 'string') {
        if (/^#[\w-]+$/.test(sel)) return byId(sel.slice(1));
        if (/^canvas\b/i.test(sel)) return mainCanvas;
        if (sel === 'body') return body;
      }
      return makeEl('div');
    },
    querySelectorAll(sel) { return typeof sel === 'string' && /^canvas$/i.test(sel) ? [mainCanvas] : []; },
    getElementsByTagName(t) { return /canvas/i.test(t) ? [mainCanvas] : []; },
    getElementsByClassName() { return []; },
    createElement: (t) => makeEl(t),
    createElementNS: (_, t) => makeEl(t),
    createTextNode: (t) => ({ textContent: t, nodeType: 3 }),
    createDocumentFragment: () => makeEl('fragment'),
    addEventListener(type, fn) { addL(document, type, fn); },
    removeEventListener(type, fn) { removeL(document, type, fn); },
    dispatchEvent(ev) { fire(document, ev); return true; },
    hasFocus: () => true,
  };

  function mkEvent(type, props) {
    const ev = Object.assign({
      type, target: body, bubbles: true, cancelable: true, defaultPrevented: false, repeat: false, isTrusted: true,
      timeStamp: now, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, button: 0, buttons: 1,
      clientX: 200, clientY: 300, pageX: 200, pageY: 300, offsetX: 200, offsetY: 300, pointerId: 1, pointerType: 'mouse',
      touches: [], changedTouches: [],
      preventDefault() { ev.defaultPrevented = true; }, stopPropagation() { ev._stopped = true; },
      stopImmediatePropagation() { ev._stopped = true; },
      composedPath() { return [body, document, win]; },
    }, props);
    return ev;
  }

  const con = {
    log() {}, info() {}, debug() {}, warn() {}, trace() {}, group() {}, groupEnd() {}, table() {}, time() {}, timeEnd() {},
    error: (...a) => { consoleErrors.push(a.map((x) => (x && x.stack) || String(x)).join(' ')); },
    assert: (c, ...a) => { if (!c) consoleErrors.push('console.assert: ' + a.join(' ')); },
  };

  const win = {
    document, console: con, localStorage, sessionStorage: localStorage, devicePixelRatio: 2,
    innerWidth: 1280, innerHeight: 720, outerWidth: 1280, outerHeight: 720, screen: { width: 1280, height: 720 },
    navigator: { userAgent: 'node-test', maxTouchPoints: 0, language: 'en', vibrate: () => false, getGamepads: () => [] },
    location: { href: 'https://example.test/', search: '', hash: '', reload() {} },
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms, ...a) => { const id = timerId++; timers.push({ id, at: now + (ms || 0), fn, a }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms, ...a) => { const id = timerId++; timers.push({ id, at: now + (ms || 0), fn, a, every: Math.max(1, ms || 0) }); return id; },
    clearInterval: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener(type, fn) { addL(win, type, fn); },
    removeEventListener(type, fn) { removeL(win, type, fn); },
    dispatchEvent(ev) { fire(win, ev); return true; },
    focus() {}, blur() {},
    alert() { throw new Error('alert() called'); }, confirm() { throw new Error('confirm() called'); }, prompt() { throw new Error('prompt() called'); },
    Image: function Image() { return makeEl('img'); },
    queueMicrotask, Promise, URL, TextEncoder, TextDecoder,
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;

  function dispatchKey(type, key, code, keyCode) {
    const ev = mkEvent(type, { key, code, keyCode, which: keyCode, target: body });
    fire(body, ev); if (!ev._stopped) fire(document, ev); if (!ev._stopped) fire(win, ev);
  }
  function dispatchPointer(type) {
    const target = mainCanvas;
    const ev = mkEvent(type, { target });
    for (const t of [target, ...elements.values()].filter((x, i, a) => a.indexOf(x) === i && x.tagName === 'CANVAS')) fire(t, ev);
    if (!ev._stopped) fire(document, ev); if (!ev._stopped) fire(win, ev);
  }

  function frame() {
    now += 1000 / 60;
    for (const t of timers.slice().sort((a, b) => a.at - b.at)) {
      if (t.at > now || !timers.includes(t)) continue;
      if (t.every) t.at += t.every; else timers.splice(timers.indexOf(t), 1);
      t.fn(...t.a);
    }
    const q = rafQueue.splice(0);
    for (const fn of q) fn(now);
  }

  return { win, document, store, consoleErrors, drawCalls, rafQueue, frame, dispatchKey, dispatchPointer, elements };
}

test('bundle boots in a stub browser, runs 600 frames with keyboard input, and saves after a game over', () => {
  const html = build();
  const env = makeEnv();
  const ctx = vm.createContext(env.win);
  const scripts = inlineScripts(html).filter((s) => {
    const t = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(s.attrs);
    return !t || /javascript/i.test(t[1]);
  });
  assert.ok(scripts.length >= 1, 'bundle has inline scripts');
  for (const s of scripts) {
    try { vm.runInContext(s.code, ctx, { filename: 'you-are-the-zombie.html' }); } catch (e) {
      assert.fail('bundle script threw while loading: ' + (e && e.stack || e));
    }
  }
  for (const g of ['ZSim', 'ZRender', 'ZAudio']) assert.ok(vm.runInContext('typeof ' + g, ctx) === 'object' || vm.runInContext('typeof ' + g, ctx) === 'function', `global ${g} defined by the bundle`);
  // DOMContentLoaded / load for code that waits for it
  const loadEv = (type) => ({ type, target: env.document, preventDefault() {}, stopPropagation() {} });
  try {
    env.document.dispatchEvent(loadEv('DOMContentLoaded'));
    env.win.dispatchEvent(loadEv('load'));
  } catch (e) { assert.fail('load handlers threw: ' + (e && e.stack || e)); }

  let frames = 0;
  const run = (n, label) => {
    for (let i = 0; i < n; i++, frames++) {
      try { env.frame(); } catch (e) { assert.fail(`exception in frame during ${label}: ${e && e.stack || e}`); }
    }
  };
  const key = (type, k, code, kc, label) => {
    try { env.dispatchKey(type, k, code, kc); } catch (e) { assert.fail(`exception handling ${type} ${code} (${label}): ${e && e.stack || e}`); }
  };
  const tap = (k, code, kc, label) => { key('keydown', k, code, kc, label); run(3, label); key('keyup', k, code, kc, label); };

  run(30, 'title screen');
  assert.ok(env.rafQueue.length > 0 || env.drawCalls.n > 0, 'main.js must schedule requestAnimationFrame');
  tap(' ', 'Space', 32, 'start');
  run(60, 'first second of play');
  const callsAfterStart = env.drawCalls.n;
  for (let i = 0; i < 8; i++) { tap(' ', 'Space', 32, 'jump'); run(40, 'jumping'); }
  tap('k', 'KeyK', 75, 'scream');
  run(20, 'after scream');
  tap('p', 'KeyP', 80, 'pause');
  run(30, 'paused');
  tap('p', 'KeyP', 80, 'resume');
  // hold jump for a while (variable height)
  key('keydown', ' ', 'Space', 32, 'hold jump'); run(15, 'holding jump'); key('keyup', ' ', 'Space', 32, 'release jump');
  if (frames < 600) run(600 - frames, 'play');
  assert.ok(env.drawCalls.n > 0, 'the canvas context received no draw calls in 600 frames');
  assert.ok(env.drawCalls.n > callsAfterStart, 'the game kept drawing after the run started');
  assert.equal(env.consoleErrors.length, 0, 'console.error was called:\n' + env.consoleErrors.slice(0, 5).join('\n'));

  // let the horde die with no input (idle runs end in 15-60 s); up to 150 s simulated
  const ran = () => {
    const raw = env.store.get('zombie-save-v2');
    if (!raw) return false;
    try { const s = JSON.parse(raw); return s && s.runs >= 1; } catch (_) { return false; }
  };
  const before = frames;
  for (let i = 0; i < 150 * 60 && !ran(); i++) run(1, 'idle until game over');
  console.log(`bundle: ${env.drawCalls.n} canvas calls; game over saved after ${((frames - before) / 60).toFixed(1)} s of idle frames; ` +
    `top calls ${JSON.stringify(Object.entries(env.drawCalls.byName).sort((a, b) => b[1] - a[1]).slice(0, 5))}`);
  assert.ok(env.store.has('zombie-save-v2'), "localStorage must get a 'zombie-save-v2' entry");
  let save;
  assert.doesNotThrow(() => { save = JSON.parse(env.store.get('zombie-save-v2')); }, 'the save must be valid JSON');
  assert.ok(save.runs >= 1, `after a game over the save must count the run (runs=${save.runs}); the game did not reach game over within 150 s of idle play or did not save`);
  // restart works
  tap(' ', 'Space', 32, 'restart');
  run(120, 'second run');
  assert.equal(env.consoleErrors.length, 0, 'console.error was called:\n' + env.consoleErrors.slice(0, 5).join('\n'));
});
