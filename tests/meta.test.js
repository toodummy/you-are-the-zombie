'use strict';
// Save, upgrades, missions, finishRun.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSim, NO_INPUT, play } = require('./bots.js');

const IDS = ['startHorde', 'mutation', 'scream', 'magnet', 'luck'];
const clone = (x) => JSON.parse(JSON.stringify(x));

function assertValidSave(s, label) {
  const Z = getSim();
  const pool = new Set(Z.MISSION_POOL.map((m) => m.id));
  assert.ok(s && typeof s === 'object', `${label}: save must be an object`);
  for (const k of ['brains', 'best', 'runs', 'totalBites', 'missionIndex']) {
    assert.ok(typeof s[k] === 'number' && Number.isFinite(s[k]) && s[k] >= 0, `${label}: save.${k} must be a finite number >= 0 (got ${JSON.stringify(s[k])})`);
  }
  assert.ok(s.upgrades && typeof s.upgrades === 'object', `${label}: save.upgrades object`);
  assert.deepEqual(Object.keys(s.upgrades).sort(), [...IDS].sort(), `${label}: upgrades must hold exactly the 5 known ids`);
  for (const u of Z.UPGRADES) {
    const lv = s.upgrades[u.id];
    assert.ok(Number.isInteger(lv) && lv >= 0 && lv <= u.max, `${label}: upgrades.${u.id}=${JSON.stringify(lv)} must be an integer 0..${u.max}`);
  }
  assert.ok(Array.isArray(s.missions) && s.missions.length === 3, `${label}: 3 missions`);
  for (const m of s.missions) {
    assert.ok(m && pool.has(m.id), `${label}: mission id ${JSON.stringify(m && m.id)} must be in MISSION_POOL`);
    assert.ok(typeof m.progress === 'number' && Number.isFinite(m.progress) && m.progress >= 0, `${label}: mission progress must be a number >= 0`);
  }
  JSON.stringify(s); // must be serialisable
}

test('defaultSave has the documented shape', () => {
  const Z = getSim();
  const s = Z.defaultSave();
  assert.equal(s.brains, 0);
  assert.equal(s.best, 0);
  assert.equal(s.runs, 0);
  assert.equal(s.totalBites, 0);
  assert.equal(s.missionIndex, 3);
  assert.deepEqual(s.upgrades, { startHorde: 0, mutation: 0, scream: 0, magnet: 0, luck: 0 });
  assert.equal(s.missions.length, 3);
  for (const m of s.missions) assert.equal(m.progress, 0);
  assert.equal(new Set(s.missions.map((m) => m.id)).size, 3, 'three different missions');
  assertValidSave(s, 'defaultSave');
  assert.notEqual(Z.defaultSave(), s, 'defaultSave returns a fresh object each call');
});

test('normalizeSave never throws on junk and always returns a valid save', () => {
  const Z = getSim();
  const junk = [null, undefined, 42, 'hello', '{"brains":5}', [], [1, 2], true, NaN,
    { brains: -5 }, { brains: 'lots' }, { brains: Infinity, best: NaN }, { best: -1, runs: 'x' },
    { upgrades: null }, { upgrades: { bogus: 3, startHorde: 99, luck: -2, scream: 1.5, magnet: 'x' } },
    { missions: 'x' }, { missions: [null, 5, { id: 'nope', progress: -3 }] }, { missions: [{}, {}, {}, {}, {}] },
    { missionIndex: -4, totalBites: null }, Object.create(null)];
  for (const j of junk) {
    let s;
    const label = 'normalizeSave(' + (j === undefined ? 'undefined' : JSON.stringify(j)) + ')';
    assert.doesNotThrow(() => { s = Z.normalizeSave(j); }, `${label} threw`);
    assertValidSave(s, label);
  }
  const good = Z.defaultSave();
  good.brains = 17; good.upgrades.luck = 2; good.best = 999;
  const n = Z.normalizeSave(clone(good));
  assert.equal(n.brains, 17, 'valid fields are kept');
  assert.equal(n.upgrades.luck, 2);
  assert.equal(n.best, 999);
});

function richSave(brains) {
  const s = getSim().defaultSave();
  s.brains = brains;
  return s;
}

test('buyUpgrade succeeds: brains deducted, level +1, input not mutated', () => {
  const Z = getSim();
  for (const u of Z.UPGRADES) {
    const s = richSave(100000);
    const before = clone(s);
    const r = Z.buyUpgrade(s, u.id);
    assert.equal(r.ok, true, `buying ${u.id} with 100000 brains should succeed (reason ${r.reason})`);
    assert.deepEqual(s, before, 'buyUpgrade must be pure (input save changed)');
    assert.equal(r.save.upgrades[u.id], 1, `${u.id} level 0 -> 1`);
    const spent = 100000 - r.save.brains;
    assert.ok(spent > 0 && (spent === u.cost(0) || spent === u.cost(1)), `${u.id}: spent ${spent}, expected cost(0)=${u.cost(0)}`);
    const r2 = Z.buyUpgrade(r.save, u.id);
    assert.equal(r2.ok, true);
    assert.equal(r2.save.upgrades[u.id], 2 > u.max ? u.max : 2);
    assert.ok(r.save.brains - r2.save.brains >= spent, 'the second level costs at least as much as the first');
  }
});

test("buyUpgrade fails with 'max', 'brains', 'unknown'", () => {
  const Z = getSim();
  for (const u of Z.UPGRADES) {
    const s = richSave(100000);
    s.upgrades[u.id] = u.max;
    const before = clone(s);
    const r = Z.buyUpgrade(s, u.id);
    assert.equal(r.ok, false, `${u.id} at max level must not be buyable`);
    assert.equal(r.reason, 'max');
    assert.equal(r.save.brains, 100000, 'failed purchase costs nothing');
    assert.deepEqual(s, before, 'input not mutated');
    const poor = richSave(0);
    const r2 = Z.buyUpgrade(poor, u.id);
    assert.equal(r2.ok, false, `${u.id} with 0 brains must fail`);
    assert.equal(r2.reason, 'brains');
    assert.equal(r2.save.upgrades[u.id], 0);
  }
  const r3 = Z.buyUpgrade(richSave(100000), 'laserEyes');
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'unknown');
  assert.equal(r3.save.brains, 100000);
});

function finishedGame(save, civs, seed) {
  const Z = getSim();
  const g = Z.createGame({ seed: seed || 3, save, empty: true, config: { speedRamp: 0 } });
  for (let i = 0; i < civs; i++) Z.spawn(g, 'civ', { x: g.horde[0].x + 100 + i * 45 });
  for (let i = 0; i < 3; i++) Z.spawn(g, 'brain', { x: g.horde[0].x + 120 + i * 60, y: 20 });
  play(g, 60, NO_INPUT, (gg) => gg.time > 4 && gg.humans.length === 0);
  // keep putting wide holes in front of the horde until it is gone
  for (let k = 0; k < 80 && g.status !== 'over'; k++) {
    Z.spawn(g, 'hole', { x: g.horde[0].x + 60, w: 600 });
    play(g, 1.5, NO_INPUT, (gg) => gg.status === 'over');
  }
  assert.equal(g.status, 'over', 'scenario: running into holes with no jumps must end the run');
  return g;
}

test('finishRun adds brains, sets best, counts runs, newBest flag, is pure', () => {
  const Z = getSim();
  const save = Z.defaultSave();
  save.brains = 10;
  const before = clone(save);
  const g = finishedGame(save, 5);
  assert.equal(g.brains, 3, 'scenario collected 3 brains');
  const r = Z.finishRun(save, g);
  assert.deepEqual(save, before, 'finishRun must not mutate the input save');
  assert.ok(r.earned && typeof r.earned.brains === 'number', 'earned.brains');
  assert.ok(r.earned.brains >= g.brains, `earned brains (${r.earned.brains}) include the ${g.brains} collected`);
  assert.equal(r.save.brains, 10 + r.earned.brains, 'save.brains += earned.brains');
  assert.equal(r.save.best, g.score, 'first run sets best to the score');
  assert.equal(r.earned.newBest, true, 'beating best 0 is a new best');
  assert.equal(r.save.runs, 1, 'runs incremented');
  assert.ok(Array.isArray(r.earned.missionsDone));
  assert.ok(r.save.totalBites >= 5, 'totalBites accumulates');
  // a worse run is not a new best
  const save2 = clone(r.save);
  save2.best = g.score + 100000;
  const r2 = Z.finishRun(save2, finishedGame(save2, 0, 4));
  assert.equal(r2.earned.newBest, false, 'a lower score is not a new best');
  assert.equal(r2.save.best, g.score + 100000, 'best never decreases');
  assert.equal(r2.save.runs, 2);
});

test('finishRun completes missions with rewards and replaces them', (t) => {
  const Z = getSim();
  const bitesMission = Z.MISSION_POOL.find((m) => m.stat === 'bites' && m.goal <= 55);
  if (!bitesMission) { t.skip("MISSION_POOL has no mission with stat 'bites' (goal <= 55) to drive in a scenario"); return; }
  const base = Z.defaultSave();
  const others = Z.MISSION_POOL.filter((m) => m.id !== bitesMission.id).slice(0, 2);
  const save = Z.normalizeSave(Object.assign(base, { missions: [{ id: bitesMission.id, progress: 0 }].concat(others.map((m) => ({ id: m.id, progress: 0 }))) }));
  assert.equal(save.missions[0].id, bitesMission.id, 'normalizeSave keeps a valid mission list');
  const g = finishedGame(save, bitesMission.goal + 2);
  assert.ok(g.stats.bites >= bitesMission.goal, `scenario bit ${g.stats.bites} people, goal ${bitesMission.goal}`);
  const r = Z.finishRun(save, g);
  assert.ok(r.earned.missionsDone.includes(bitesMission.text), `'${bitesMission.text}' should be reported done, got ${JSON.stringify(r.earned.missionsDone)}`);
  assert.ok(r.earned.brains > g.brains, 'a completed mission rewards extra brains');
  assert.ok(!r.save.missions.some((m) => m.id === bitesMission.id), 'the completed mission is replaced by the next one');
  assert.equal(r.save.missions.length, 3);
  assert.ok(r.save.missionIndex > save.missionIndex, 'missionIndex advances');
});

test('createGame applies upgrades (startHorde, mutation)', () => {
  const Z = getSim();
  const s = Z.defaultSave();
  s.upgrades.startHorde = 2;
  s.upgrades.mutation = 2;
  const g = Z.createGame({ seed: 1, save: s, empty: true, config: { speedRamp: 0 } });
  assert.equal(g.horde.length, Z.CONFIG.startHorde + 2, 'startHorde level 2 => 2 extra starting zombies');
  Z.spawn(g, 'jogger', { x: g.horde[0].x + 120 });
  play(g, 3, NO_INPUT, (gg) => gg.mutation.type !== null);
  assert.equal(g.mutation.type, 'runner');
  assert.ok(Math.abs(g.mutation.dur - (Z.CONFIG.mutationTime + 2)) < 0.01, `mutation level 2 => ${Z.CONFIG.mutationTime + 2}s mutations, got dur ${g.mutation.dur}`);
});
