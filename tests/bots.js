// Scripted players + shared helpers for the test suite.
// Bots are functions (game) -> { jumpPressed, jumpHeld, scream } and read only
// documented game fields (DESIGN.md "The sim API").
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SIM_PATH = path.join(ROOT, 'src', 'sim.js');
const DT = 1 / 60;
const NO_INPUT = Object.freeze({ jumpPressed: false, jumpHeld: false, scream: false });

let cachedSim = null;
/** Load ZSim from src/sim.js, or throw a readable error if it is missing/broken. */
function getSim() {
  if (cachedSim) return cachedSim;
  if (!fs.existsSync(SIM_PATH)) {
    throw new Error('missing src/sim.js - the sim has not been written yet (expected at ' + SIM_PATH + ')');
  }
  let mod;
  try {
    mod = require(SIM_PATH);
  } catch (e) {
    throw new Error('src/sim.js failed to load: ' + (e && e.stack || e));
  }
  const Z = mod && typeof mod.createGame === 'function' ? mod : globalThis.ZSim;
  if (!Z || typeof Z.createGame !== 'function' || typeof Z.step !== 'function') {
    throw new Error('src/sim.js loaded but did not provide ZSim with createGame/step (module.exports or globalThis.ZSim)');
  }
  cachedSim = Z;
  return Z;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function input(jumpPressed, jumpHeld, scream) {
  return { jumpPressed: !!jumpPressed, jumpHeld: !!jumpHeld, scream: !!scream };
}

/**
 * Simulate one leader jump with CONFIG physics.
 * hold = seconds the jump button stays held (gravity scaled by jumpHoldGravityScale meanwhile).
 * Returns { air (s), dist (px at given speed), apex (px) }.
 */
function flight(cfg, speed, hold) {
  const g = Math.abs(cfg.gravity);
  const scale = typeof cfg.jumpHoldGravityScale === 'number' ? cfg.jumpHoldGravityScale : 1;
  let vy = Math.abs(cfg.jumpVelocity);
  let y = 0, t = 0, apex = 0;
  const h = 1 / 240;
  for (let i = 0; i < 240 * 30; i++) {
    const held = t < hold && vy > 0;
    vy -= (held ? g * scale : g) * h;
    y += vy * h;
    t += h;
    if (y > apex) apex = y;
    if (y <= 0) break;
  }
  return { air: t, dist: speed * t, apex };
}

/** Times [up, down] during a jump (hold seconds) when the jumper is above height H; null if never. */
function aboveWindow(cfg, hold, H) {
  const g = Math.abs(cfg.gravity);
  const scale = typeof cfg.jumpHoldGravityScale === 'number' ? cfg.jumpHoldGravityScale : 1;
  let vy = Math.abs(cfg.jumpVelocity), y = 0, t = 0, up = null, down = null;
  const h = 1 / 240;
  for (let i = 0; i < 240 * 30; i++) {
    const held = t < hold && vy > 0;
    vy -= (held ? g * scale : g) * h;
    y += vy * h;
    t += h;
    if (y > H && up === null) up = t;
    if (up !== null && y <= H) { down = t; break; }
    if (y <= 0) break;
  }
  return up === null ? null : { up, down: down === null ? t : down };
}

// ---------------------------------------------------------------- bots

/** Never presses anything. */
function idleBot() { return NO_INPUT; }

/** Jumps at random about once per second, holds 0..0.3 s; screams at random when full. */
function randomBot(seed) {
  const r = mulberry32((seed | 0) ^ 0x9e3779b9);
  let hold = 0;
  return function (game) {
    let pressed = false;
    if (hold > 0) hold -= DT;
    else if (r() < DT) { pressed = true; hold = r() * 0.3; }
    const scream = !!(game.scream && game.scream.charge >= 1 && r() < 0.02);
    return input(pressed, pressed || hold > 0, scream);
  };
}

const goodState = new WeakMap();
const radius = (cfg) => (typeof cfg.zombieRadius === 'number' ? cfg.zombieRadius : 12);

/**
 * Hazards the leader must jump over right now: { kind, x0, x1, h (height to clear), landOk }.
 * Obstacles span [x, x + w]; a riot shield spans x +- 24.
 */
function jumpThreats(game) {
  const n = game.horde.length;
  const cfg = game.config;
  const mut = game.mutation && game.mutation.type;
  const out = [];
  for (const o of game.obstacles || []) {
    if (o.broken) continue;
    if (o.kind === 'car') {
      if (mut !== 'brute') out.push({ kind: 'car', x0: o.x, x1: o.x + o.w, h: o.h, landOk: true });
    } else if (o.kind === 'hole') {
      if (mut !== 'crawler') out.push({ kind: 'hole', x0: o.x, x1: o.x + o.w, h: 0 });
    } else if (o.kind === 'barricade') {
      if (mut !== 'brute' && o.need > n && o.h <= 110) out.push({ kind: 'barricade', x0: o.x, x1: o.x + o.w, h: o.h });
    }
  }
  for (const h of game.humans || []) {
    if (h.kind === 'riot' && h.state !== 'stunned' && h.shield !== false && mut !== 'brute' && mut !== 'crawler') {
      out.push({ kind: 'riot', x0: h.x - 24, x1: h.x + 24, h: cfg.riotHeight || 120 });
    }
  }
  return out.sort((a, b) => a.x0 - b.x0);
}

/** Distance ahead of the leader (to t.x0) at which to press jump, and how long to hold. */
function planJump(cfg, speed, t) {
  const zr = radius(cfg);
  const holdMax = cfg.jumpHoldMax || 0.25;
  const w = t.x1 - t.x0;
  if (t.h <= 0) { // hole: be off the ground from x0 to x1
    let hold = holdMax;
    for (const hh of [0, holdMax * 0.5, holdMax]) if (flight(cfg, speed, hh).dist >= w + zr + 40) { hold = hh; break; }
    const d = flight(cfg, speed, hold).dist;
    return { hold, lead: Math.max(4, (d - w - zr) / 2) };
  }
  const win = aboveWindow(cfg, holdMax, t.h + 4);
  if (!win) return { hold: holdMax, lead: zr + 10 };
  const dMin = speed * win.up + zr; // front must not reach x0 before we are above h
  if (t.landOk) return { hold: holdMax, lead: dMin + speed * DT * 1.5 };
  const dMax = speed * win.down - zr - w; // back must be past x1 before dropping below h
  return { hold: holdMax, lead: dMax >= dMin ? (dMin + dMax) / 2 : dMin };
}

/**
 * Competent player: looks ahead of the leader (about speed * 0.3 px), jumps over cars, holes,
 * barricades it cannot smash and riot shields, timing the press from CONFIG physics and holding
 * longer for wide/tall ones; screams when the meter is full and a soldier/riot is on screen.
 */
function goodBot(game) {
  let st = goodState.get(game);
  if (!st) { st = { holdLeft: 0 }; goodState.set(game, st); }
  const L = game.horde && game.horde[0];
  if (!L) return NO_INPUT;
  const cfg = game.config;
  const speed = Math.max(1, game.speed);
  let jumpPressed = false, jumpHeld = false, scream = false;

  if (st.holdLeft > 0) { jumpHeld = true; st.holdLeft -= DT; }

  if (game.scream && game.scream.charge >= 1) {
    const left = game.cameraX, right = game.cameraX + (cfg.viewWidth || 1280);
    for (const h of game.humans) {
      if ((h.kind === 'soldier' || h.kind === 'riot') && h.state !== 'stunned' && h.x > left && h.x < right) { scream = true; break; }
    }
  }

  if (L.state === 'run' && st.holdLeft <= 0) {
    const zr = radius(cfg);
    for (const t of jumpThreats(game)) {
      if (t.x1 + zr < L.x) continue;
      const plan = planJump(cfg, speed, t);
      if (t.x0 - L.x <= plan.lead) {
        jumpPressed = true; jumpHeld = true; st.holdLeft = plan.hold - DT;
      }
      break; // only the nearest threat matters
    }
  }
  return { jumpPressed, jumpHeld, scream };
}

// ---------------------------------------------------------------- runner

const INTERESTING = new Set(['bite', 'jump', 'lost', 'smash', 'brain', 'mutation']);

function hasNaN(game) {
  for (const z of game.horde) if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) return true;
  return !Number.isFinite(game.score) || !Number.isFinite(game.dist) || !Number.isFinite(game.speed) || !Number.isFinite(game.cameraX);
}

/**
 * Run one game with a bot at dt = 1/60 until game over or maxSeconds.
 * opts: { maxSeconds=300, save, config, onStep(game) }
 */
function runBot(seed, bot, opts) {
  opts = opts || {};
  const Z = getSim();
  const maxSeconds = opts.maxSeconds || 300;
  const createOpts = { seed };
  if (opts.save) createOpts.save = opts.save;
  if (opts.config) createOpts.config = opts.config;
  const game = Z.createGame(createOpts);
  const m = {
    seed, seconds: 0, finalHorde: game.horde.length, peakHorde: game.horde.length,
    bites: 0, smashes: 0, mutations: 0, brains: 0, score: 0, dist: 0,
    events: {}, longestGap: 0, longestGapAt: 0, nan: false, peakSpeed: game.speed, scoreBySecond: [0], over: false,
  };
  let lastInteresting = 0;
  const steps = Math.ceil(maxSeconds / DT);
  for (let i = 0; i < steps && game.status !== 'over'; i++) {
    const inp = bot(game) || NO_INPUT;
    Z.step(game, inp, DT);
    for (const e of game.events) {
      m.events[e.type] = (m.events[e.type] || 0) + 1;
      if (INTERESTING.has(e.type)) {
        if (game.time - lastInteresting > m.longestGap) { m.longestGap = game.time - lastInteresting; m.longestGapAt = lastInteresting; }
        lastInteresting = game.time;
      }
    }
    if (game.horde.length > m.peakHorde) m.peakHorde = game.horde.length;
    if (game.speed > m.peakSpeed) m.peakSpeed = game.speed;
    if (!m.nan && hasNaN(game)) m.nan = { time: game.time, step: i };
    const sec = Math.floor(game.time + 1e-9);
    if (sec >= m.scoreBySecond.length) m.scoreBySecond.push(game.score);
    if (opts.onStep) opts.onStep(game);
  }
  if (game.time - lastInteresting > m.longestGap) { m.longestGap = game.time - lastInteresting; m.longestGapAt = lastInteresting; }
  m.seconds = game.time;
  m.over = game.status === 'over';
  m.finalHorde = game.horde.length;
  const s = game.stats || {};
  m.bites = s.bites || 0;
  m.smashes = s.smashes || 0;
  m.mutations = s.mutations ? Object.values(s.mutations).reduce((a, b) => a + (b || 0), 0) : 0;
  m.brains = game.brains;
  m.score = game.score;
  m.dist = game.dist;
  if (s.maxHorde > m.peakHorde) m.peakHorde = s.maxHorde;
  m.game = game;
  return m;
}

// ---------------------------------------------------------------- scenario helpers

/** Empty test world (no generation), speed constant unless overridden. */
function emptyGame(config, extra) {
  const Z = getSim();
  return Z.createGame(Object.assign({ seed: 7, empty: true, config: Object.assign({ speedRamp: 0 }, config || {}) }, extra || {}));
}

/**
 * Step `seconds` of game time. inputFn(game, i) or a constant input.
 * until(game, events) stops early. Returns all events (copied, with .t = game.time).
 */
function play(game, seconds, inputFn, until, perStep) {
  const Z = getSim();
  const evs = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const inp = typeof inputFn === 'function' ? inputFn(game, i) : (inputFn || NO_INPUT);
    Z.step(game, inp, DT);
    for (const e of game.events) evs.push(Object.assign({}, e, { t: game.time }));
    if (perStep) perStep(game, i);
    if (until && until(game, evs)) break;
  }
  return evs;
}

const ofType = (evs, type) => evs.filter((e) => e.type === type);

module.exports = {
  ROOT, SIM_PATH, DT, NO_INPUT, getSim, mulberry32, input, flight,
  aboveWindow, planJump, idleBot, randomBot, goodBot, jumpThreats, runBot, emptyGame, play, ofType, INTERESTING,
};
