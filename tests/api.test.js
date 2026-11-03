'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSim, DT, NO_INPUT, mulberry32, emptyGame, play } = require('./bots.js');

const CONFIG_KEYS = ['startSpeed', 'speedRamp', 'maxSpeed', 'gravity', 'jumpVelocity', 'jumpHoldMax',
  'jumpHoldGravityScale', 'leaderScreenX', 'followerSpacing', 'maxHorde', 'mutationTime', 'screamPerBite',
  'biomeLength', 'bulletDodgeHeight', 'viewWidth', 'startHorde'];
const UPGRADE_MAX = { startHorde: 5, mutation: 4, scream: 4, magnet: 3, luck: 3 };

test('CONFIG has every tunable listed in DESIGN.md, all finite numbers', () => {
  const { CONFIG } = getSim();
  assert.ok(CONFIG && typeof CONFIG === 'object', 'ZSim.CONFIG must be an object');
  for (const k of CONFIG_KEYS) {
    assert.equal(typeof CONFIG[k], 'number', `CONFIG.${k} must be a number (got ${typeof CONFIG[k]})`);
    assert.ok(Number.isFinite(CONFIG[k]), `CONFIG.${k} must be finite`);
  }
  assert.equal(CONFIG.viewWidth, 1280, 'CONFIG.viewWidth is 1280 per DESIGN');
  assert.equal(CONFIG.maxHorde, 60, 'max horde size is 60 per DESIGN');
  assert.equal(CONFIG.mutationTime, 7, 'default mutation time is 7 s per DESIGN');
  assert.ok(Math.abs(CONFIG.screamPerBite - 0.07) < 1e-9, 'screamPerBite is 0.07 per DESIGN');
  assert.ok(CONFIG.maxSpeed > CONFIG.startSpeed, 'maxSpeed must exceed startSpeed so the run speeds up');
  assert.ok(CONFIG.startHorde >= 1, 'the run must start with at least one zombie');
});

test('BIOMES are Suburbs, Downtown, Quarantine', () => {
  const { BIOMES } = getSim();
  assert.deepEqual(BIOMES.map((b) => b.name), ['Suburbs', 'Downtown', 'Quarantine']);
});

test('UPGRADES have id/name/desc/max/cost(level) with the documented ids and maxima', () => {
  const { UPGRADES } = getSim();
  assert.ok(Array.isArray(UPGRADES), 'UPGRADES must be an array');
  assert.deepEqual(UPGRADES.map((u) => u.id).sort(), Object.keys(UPGRADE_MAX).sort(), 'upgrade ids');
  for (const u of UPGRADES) {
    assert.equal(typeof u.name, 'string', `${u.id}.name`);
    assert.equal(typeof u.desc, 'string', `${u.id}.desc`);
    assert.equal(u.max, UPGRADE_MAX[u.id], `${u.id}.max should be ${UPGRADE_MAX[u.id]}`);
    assert.equal(typeof u.cost, 'function', `${u.id}.cost must be a function of level`);
    let prev = 0;
    for (let lv = 0; lv < u.max; lv++) {
      const c = u.cost(lv);
      assert.ok(Number.isFinite(c) && c > 0, `${u.id}.cost(${lv}) must be a positive number, got ${c}`);
      assert.ok(c >= prev, `${u.id} cost must grow per level (cost(${lv})=${c} < ${prev})`);
      prev = c;
    }
  }
});

test('MISSION_POOL entries have id/text/goal/stat and stat names a game.stats counter', () => {
  const Z = getSim();
  const pool = Z.MISSION_POOL;
  assert.ok(Array.isArray(pool) && pool.length >= 6, `MISSION_POOL needs a real pool (>= 6 missions), has ${pool && pool.length}`);
  const g = Z.createGame({ seed: 1 });
  const ids = new Set();
  for (const m of pool) {
    assert.equal(typeof m.id, 'string', 'mission id must be a string');
    assert.ok(!ids.has(m.id), `duplicate mission id ${m.id}`);
    ids.add(m.id);
    assert.equal(typeof m.text, 'string', `${m.id}.text`);
    assert.ok(Number.isFinite(m.goal) && m.goal > 0, `${m.id}.goal must be a positive number`);
    assert.equal(typeof m.stat, 'string', `${m.id}.stat`);
    const v = m.stat.split('.').reduce((o, k) => (o == null ? undefined : o[k]), g.stats);
    assert.equal(typeof v, 'number', `${m.id}.stat '${m.stat}' must name a numeric counter in game.stats`);
  }
});

test('createGame returns all documented fields', () => {
  const Z = getSim();
  const g = Z.createGame({ seed: 123 });
  assert.equal(g.status, 'running');
  for (const k of ['time', 'dist', 'speed', 'cameraX', 'biome', 'loop', 'score', 'combo', 'comboT', 'multiplier', 'brains']) {
    assert.equal(typeof g[k], 'number', `game.${k} must be a number`);
  }
  assert.equal(g.time, 0, 'a new game starts at time 0');
  assert.equal(g.biome, 0, 'a new game starts in Suburbs (biome 0)');
  assert.equal(g.loop, 0);
  assert.equal(g.brains, 0, 'no brains collected at the start');
  assert.ok(g.config && typeof g.config === 'object', 'game.config must hold the effective config');
  for (const k of CONFIG_KEYS) assert.equal(typeof g.config[k], 'number', `game.config.${k}`);
  assert.equal(g.speed, g.config.startSpeed, 'speed starts at startSpeed');
  for (const k of ['horde', 'humans', 'obstacles', 'projectiles', 'pickups', 'events', 'missions']) {
    assert.ok(Array.isArray(g[k]), `game.${k} must be an array`);
  }
  assert.equal(g.horde.length, Z.CONFIG.startHorde, 'default save => horde of CONFIG.startHorde zombies');
  g.horde.forEach((z, i) => {
    for (const k of ['id', 'x', 'y', 'vy', 'lane', 'born', 'hurt']) assert.ok(k in z, `horde[${i}].${k} missing`);
    assert.ok(['run', 'air', 'under'].includes(z.state), `horde[${i}].state '${z.state}'`);
    assert.equal(z.leader, i === 0, `only horde[0] is the leader (horde[${i}].leader=${z.leader})`);
    assert.ok('jumpAtX' in z && 'fromJob' in z, `horde[${i}] needs jumpAtX and fromJob`);
    assert.ok(z.lane >= 0 && z.lane <= 2, 'lane in 0..2');
  });
  assert.ok(Math.abs(g.horde[0].x - (g.cameraX + g.config.leaderScreenX)) < 1e-6, 'leader is at cameraX + leaderScreenX');
  assert.deepEqual(Object.keys(g.mutation).filter((k) => ['type', 't', 'dur'].includes(k)).sort(), ['dur', 't', 'type'], 'mutation {type,t,dur}');
  assert.equal(g.mutation.type, null, 'no mutation at start');
  assert.equal(typeof g.scream.charge, 'number');
  assert.equal(typeof g.scream.active, 'number');
  assert.equal(g.scream.charge, 0, 'scream meter starts empty');
  for (const k of ['bites', 'smashes', 'brainsCollected', 'maxHorde', 'carsJumped', 'screams', 'biomesReached', 'distance']) {
    assert.equal(typeof g.stats[k], 'number', `game.stats.${k}`);
  }
  for (const k of ['runner', 'brute', 'spitter', 'crawler']) assert.equal(typeof g.stats.mutations[k], 'number', `stats.mutations.${k}`);
  assert.equal(g.missions.length, 3, '3 active missions');
  for (const m of g.missions) {
    for (const k of ['id', 'text', 'goal', 'progress', 'done']) assert.ok(k in m, `mission.${k} missing`);
  }
});

test('leader stays at cameraX + leaderScreenX while running; speed ramps in a normal game', () => {
  const Z = getSim();
  const g = Z.createGame({ seed: 5 });
  for (let i = 0; i < 300 && g.status === 'running'; i++) {
    Z.step(g, NO_INPUT, DT);
    if (g.horde.length) assert.ok(Math.abs(g.horde[0].x - (g.cameraX + g.config.leaderScreenX)) < 1e-6, `leader drifted from cameraX + leaderScreenX at step ${i}`);
  }
  assert.ok(g.speed > g.config.startSpeed, 'speed should rise by speedRamp per second');
  assert.ok(g.dist > 0 && g.time > 0, 'time and distance advance');
});

test('step returns the same game object', () => {
  const Z = getSim();
  const g = Z.createGame({ seed: 1 });
  assert.equal(Z.step(g, NO_INPUT, DT), g);
});

test('events are cleared at the start of every step', () => {
  const Z = getSim();
  const g = Z.createGame({ seed: 1 });
  Z.step(g, NO_INPUT, DT);
  g.events.push({ type: '__sentinel' });
  Z.step(g, NO_INPUT, DT);
  assert.ok(!g.events.some((e) => e.type === '__sentinel'), 'old events must not survive into the next step');
});

test('empty:true spawns nothing and config override keeps speed constant', () => {
  const g = emptyGame();
  play(g, 20, NO_INPUT);
  assert.equal(g.humans.length + g.obstacles.length + g.pickups.length, 0, 'empty test world must never generate humans, hazards or pickups');
  assert.equal(g.speed, g.config.startSpeed, 'speedRamp:0 must keep speed at startSpeed');
  assert.equal(g.status, 'running', 'nothing can kill the horde in an empty world');
});

test("status 'over' freezes the game", () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 1 });
  Z.spawn(g, 'hole', { x: g.horde[0].x + 120, w: 600 });
  play(g, 10, NO_INPUT, (gg) => gg.status === 'over');
  assert.equal(g.status, 'over', 'a single zombie running into a 600 px hole must end the game');
  const snap = JSON.stringify({ t: g.time, d: g.dist, c: g.cameraX, s: g.score, h: g.horde.length });
  for (let i = 0; i < 60; i++) Z.step(g, { jumpPressed: true, jumpHeld: true, scream: true }, DT);
  assert.equal(JSON.stringify({ t: g.time, d: g.dist, c: g.cameraX, s: g.score, h: g.horde.length }), snap, 'nothing may change after game over');
});

function scriptedRun(seed, steps) {
  const Z = getSim();
  const g = Z.createGame({ seed });
  const r = mulberry32(4242);
  let hold = 0;
  const seen = [];
  const ids = new Set();
  for (let i = 0; i < steps && g.status === 'running'; i++) {
    const p = r() < 0.02;
    if (p) hold = 12;
    const inp = { jumpPressed: p, jumpHeld: hold-- > 0, scream: r() < 0.01 };
    Z.step(g, inp, DT);
    for (const o of g.obstacles.concat(g.humans)) {
      if (!ids.has(o.id)) { ids.add(o.id); seen.push(o.kind + '@' + Math.round(o.x)); }
    }
  }
  return { g, seen };
}

test('determinism: same seed + same inputs => identical result after 3000 steps; different seeds differ', () => {
  const a = scriptedRun(77, 3000);
  const b = scriptedRun(77, 3000);
  assert.equal(a.g.score, b.g.score, 'score must be identical for identical seed and inputs');
  assert.equal(a.g.dist, b.g.dist, 'distance must be identical');
  assert.equal(a.g.horde.length, b.g.horde.length, 'horde size must be identical');
  assert.equal(a.g.time, b.g.time);
  assert.deepEqual(a.seen, b.seen, 'the generated world must be identical');
  const c = scriptedRun(78, 3000);
  assert.notDeepEqual(c.seen, a.seen, 'seeds 77 and 78 generated the same world');
});
