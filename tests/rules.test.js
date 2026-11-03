'use strict';
// Scenario tests: empty worlds built with ZSim.spawn, speed constant (speedRamp 0).
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSim, DT, NO_INPUT, emptyGame, play, ofType, flight, planJump } = require('./bots.js');

const JUMP_HOLD = (game, i) => ({ jumpPressed: i === 0, jumpHeld: true, scream: false });
const lead = (g) => g.horde[0];
const causes = (evs) => ofType(evs, 'lost').map((e) => e.cause);
const fmtLost = (evs) => JSON.stringify(causes(evs));
// DESIGN lists `mutation { type }`, but `type` is already the event name ('mutation'),
// so the mutation name has to live in another field: accept `mutation` or `name`.
const mutType = (e) => (e.mutation !== undefined ? e.mutation : e.name);

test('a civilian ahead gets bitten: horde +1 with bite and join events', () => {
  const Z = getSim();
  const g = emptyGame();
  const n0 = g.horde.length;
  Z.spawn(g, 'civ', { x: lead(g).x + 200 });
  const evs = play(g, 4, NO_INPUT);
  const bites = ofType(evs, 'bite');
  assert.equal(bites.length, 1, `running into one civilian should give exactly 1 bite event, got ${bites.length}`);
  assert.equal(bites[0].kind, 'civ');
  assert.equal(bites[0].job, null, 'a civ has no job');
  assert.equal(ofType(evs, 'join').length, 1, 'the bitten civ joins the horde (join event)');
  assert.equal(g.horde.length, n0 + 1, 'horde grows by exactly 1');
  assert.equal(g.humans.length, 0, 'the bitten human is gone from humans');
  assert.equal(g.stats.bites, 1, 'stats.bites counts the bite');
});

const JOBS = { jogger: 'runner', bouncer: 'brute', chef: 'spitter', plumber: 'crawler' };
for (const [job, type] of Object.entries(JOBS)) {
  test(`biting a ${job} triggers the ${type} mutation for mutationTime seconds`, () => {
    const Z = getSim();
    const g = emptyGame();
    Z.spawn(g, job, { x: lead(g).x + 150 });
    const evs = play(g, 4, NO_INPUT, (_, e) => e.some((x) => x.type === 'mutation'));
    const bite = ofType(evs, 'bite')[0];
    assert.ok(bite, `the ${job} should be bitten`);
    assert.equal(bite.job, job, `bite event job should be '${job}'`);
    const mut = ofType(evs, 'mutation')[0];
    assert.ok(mut, `biting a ${job} must emit a mutation event`);
    assert.equal(mutType(mut), type, 'mutation event names the mutation');
    assert.equal(g.mutation.type, type, `game.mutation.type should be '${type}'`);
    const T = g.config.mutationTime;
    assert.ok(Math.abs(g.mutation.t - T) < 0.1, `mutation should last mutationTime=${T}s, t=${g.mutation.t}`);
    assert.equal(g.stats.mutations[type], 1, `stats.mutations.${type} counts it`);
    const start = g.time;
    const after = play(g, T + 1, NO_INPUT, (_, e) => e.some((x) => x.type === 'mutationEnd'));
    const end = ofType(after, 'mutationEnd')[0];
    assert.ok(end, `${type} must end with a mutationEnd event within ${T + 1}s`);
    assert.equal(mutType(end), type, 'mutationEnd event names the mutation');
    const lasted = end.t - start;
    assert.ok(lasted > T - 0.15 && lasted < T + 0.15, `${type} lasted ${lasted.toFixed(2)}s, expected ~${T}s`);
    assert.equal(g.mutation.type, null, 'mutation.type back to null after it ends');
  });
}

test('a car ahead without jumping costs zombies (lost cause car)', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8 });
  Z.spawn(g, 'car', { x: lead(g).x + 300, w: 200, h: 80 });
  const evs = play(g, 5, NO_INPUT);
  const lost = ofType(evs, 'lost');
  assert.ok(lost.length >= 1, 'running into a car side must lose zombies');
  assert.ok(lost.every((e) => e.cause === 'car'), `all losses should be cause 'car', got ${fmtLost(evs)}`);
  assert.equal(g.horde.length, 8 - lost.length, 'each lost event removes exactly one zombie');
});

/** Press jump once, `leadPx` before the leader reaches x0, holding for `hold` seconds. */
function timedJumpInput(x0, leadPx, hold) {
  let pressed = false, heldFor = 0;
  return (game) => {
    if (!pressed && x0 - lead(game).x <= leadPx) { pressed = true; heldFor = 0; return { jumpPressed: true, jumpHeld: true, scream: false }; }
    if (pressed && heldFor < hold) { heldFor += DT; return { jumpPressed: false, jumpHeld: true, scream: false }; }
    return NO_INPUT;
  };
}

test('the same car with a well-timed jump loses nobody', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8 });
  const car = Z.spawn(g, 'car', { x: lead(g).x + 400, w: 200, h: 80 });
  const f = flight(g.config, g.speed, g.config.jumpHoldMax);
  assert.ok(f.apex > 80, `a held jump (apex ${f.apex.toFixed(0)}px) must clear an 80px car`);
  // press so the leader is above the roof when it reaches the car side, then run across the roof
  const plan = planJump(g.config, g.speed, { kind: 'car', x0: car.x, x1: car.x + car.w, h: car.h, landOk: true });
  const evs = play(g, 8, timedJumpInput(car.x, plan.lead, plan.hold),
    (gg) => gg.horde.every((z) => z.x > car.x + car.w + 60));
  assert.equal(ofType(evs, 'lost').length, 0, `a jump pressed ${plan.lead.toFixed(0)}px before the car lost zombies: ${fmtLost(evs)}`);
  assert.equal(g.horde.length, 8);
  assert.ok(ofType(evs, 'jump').length >= 1, 'the leader jumped');
});

test('jump wave: leader leaves the ground at once, each follower jumps at the recorded jumpAtX', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8 });
  Z.step(g, { jumpPressed: true, jumpHeld: false, scream: false }, DT);
  const jumpEv = g.events.find((e) => e.type === 'jump');
  assert.ok(jumpEv, 'jumpPressed must emit a jump event on the same step');
  assert.ok(lead(g).y > 0 && lead(g).state === 'air', `leader must be airborne right after jumpPressed (y=${lead(g).y}, state=${lead(g).state})`);
  const followers = g.horde.slice(1);
  assert.ok(followers.length === 7);
  const jumpAt = new Map();
  for (const z of followers) {
    assert.equal(typeof z.jumpAtX, 'number', `follower ${z.id} must get jumpAtX after the leader jumps`);
    assert.ok(z.x < z.jumpAtX, `follower ${z.id} starts behind its jump point`);
    jumpAt.set(z.id, z.jumpAtX);
  }
  const leftAt = new Map();
  let groundedWhileLeaderAir = false;
  const maxStep = g.speed * DT * 1.5 + 2;
  play(g, 3, NO_INPUT, null, (gg) => {
    for (const z of gg.horde) {
      if (!jumpAt.has(z.id) || leftAt.has(z.id)) continue;
      if (z.y > 0) leftAt.set(z.id, z.x);
      else {
        assert.ok(z.x <= jumpAt.get(z.id) + maxStep, `follower ${z.id} passed its jumpAtX ${jumpAt.get(z.id).toFixed(1)} (now x=${z.x.toFixed(1)}) without leaving the ground`);
        if (gg.horde[0].y > 0) groundedWhileLeaderAir = true;
      }
    }
  });
  assert.ok(groundedWhileLeaderAir, 'some follower should still be on the ground while the leader is in the air (the wave)');
  for (const z of followers) {
    assert.ok(leftAt.has(z.id), `follower ${z.id} never jumped`);
    const x = leftAt.get(z.id), j = jumpAt.get(z.id);
    assert.ok(x >= j - 1, `follower ${z.id} jumped early at x=${x.toFixed(1)}, before jumpAtX=${j.toFixed(1)}`);
  }
});

test('holding jump gives a higher apex than tapping', () => {
  function apex(holdSteps) {
    const g = emptyGame({ startHorde: 1 });
    let top = 0;
    play(g, 2.5, (gg, i) => ({ jumpPressed: i === 0, jumpHeld: i < holdSteps, scream: false }), null, (gg) => { top = Math.max(top, gg.horde[0].y); });
    return top;
  }
  const g = emptyGame();
  const tap = apex(1);
  const held = apex(Math.round(g.config.jumpHoldMax / DT) + 2);
  assert.ok(tap > 0, 'a tap must still jump');
  assert.ok(held > tap * 1.1, `holding jump for jumpHoldMax should jump clearly higher (tap ${tap.toFixed(0)}px, held ${held.toFixed(0)}px)`);
});

test('a hole loses grounded zombies (cause hole)', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 6 });
  Z.spawn(g, 'hole', { x: lead(g).x + 200, w: 150 });
  const evs = play(g, 5, NO_INPUT);
  const lost = ofType(evs, 'lost');
  assert.ok(lost.length >= 1, 'running over a hole on the ground must lose zombies');
  assert.ok(lost.every((e) => e.cause === 'hole'), `losses should be cause 'hole', got ${fmtLost(evs)}`);
});

test('a barricade with need <= horde size is smashed without losses', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8 });
  const b = Z.spawn(g, 'barricade', { x: lead(g).x + 250, need: 5, h: 170 });
  const evs = play(g, 5, NO_INPUT);
  const smash = ofType(evs, 'smash');
  assert.equal(smash.length, 1, 'horde of 8 vs need 5 must smash the barricade once');
  assert.equal(smash[0].kind, 'barricade');
  assert.equal(ofType(evs, 'lost').length, 0, `smashing must cost nothing, lost: ${fmtLost(evs)}`);
  assert.ok(b.broken === true || !g.obstacles.includes(b), 'barricade is broken (or removed)');
  assert.equal(g.stats.smashes, 1);
});

test('a barricade with need > horde size costs zombies (cause barricade)', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 5 });
  Z.spawn(g, 'barricade', { x: lead(g).x + 250, need: 20, h: 170 });
  const evs = play(g, 5, NO_INPUT);
  assert.equal(ofType(evs, 'smash').length, 0, 'horde of 5 cannot smash need 20');
  const lost = ofType(evs, 'lost');
  assert.ok(lost.length >= 1, 'touching an unsmashable barricade must lose zombies');
  assert.ok(lost.every((e) => e.cause === 'barricade'), `causes: ${fmtLost(evs)}`);
});

function soldierGame(startHorde, extra) {
  const Z = getSim();
  const g = emptyGame(Object.assign({ startHorde, startSpeed: getSim().CONFIG.startSpeed * 0.5 }, extra || {}));
  const s = Z.spawn(g, 'soldier', { x: g.cameraX + g.config.viewWidth - 60 });
  return { g, s };
}

test('soldier bullets remove zombies (cause bullet); biting the soldier stops the shooting', () => {
  const { g, s } = soldierGame(8);
  const bulletIds = new Set();
  let biteT = null, newAfterBite = [];
  const evs = play(g, 12, NO_INPUT, (gg, e) => biteT !== null && gg.time > biteT + 2, (gg) => {
    if (biteT === null) {
      const b = gg.events.find((e) => e.type === 'bite' && e.kind === 'soldier');
      if (b) biteT = gg.time;
    }
    for (const p of gg.projectiles) {
      if (p.kind !== 'bullet' || bulletIds.has(p.id)) continue;
      bulletIds.add(p.id);
      if (biteT !== null && gg.time > biteT + 0.05) newAfterBite.push(p.id);
    }
  });
  assert.ok(bulletIds.size >= 1, 'an on-screen soldier must shoot (bullet projectiles)');
  const lost = ofType(evs, 'lost');
  assert.ok(lost.some((e) => e.cause === 'bullet'), `bullets must hit grounded zombies, losses: ${fmtLost(evs)}`);
  assert.ok(biteT !== null, `the horde should reach and bite the soldier (soldier at x=${s.x}), horde=${g.horde.length}`);
  assert.equal(newAfterBite.length, 0, 'a bitten soldier must stop shooting (new bullets appeared after the bite)');
});

test('a zombie higher than bulletDodgeHeight is not hit by bullets', () => {
  // very low gravity keeps the lone leader high in the air for the whole window
  const { g } = soldierGame(1, { gravity: 1 });
  const dodge = g.config.bulletDodgeHeight;
  let bullets = 0;
  const seen = new Set();
  const evs = play(g, 5, JUMP_HOLD, null, (gg) => {
    for (const p of gg.projectiles) if (p.kind === 'bullet' && !seen.has(p.id)) { seen.add(p.id); bullets++; }
  });
  assert.ok(bullets >= 1, 'the soldier should have fired at least once');
  assert.ok(g.horde.length === 1 && g.horde[0].y > dodge, `leader should still be above bulletDodgeHeight (y=${g.horde[0] && g.horde[0].y})`);
  assert.equal(ofType(evs, 'lost').length, 0, `a zombie above bulletDodgeHeight (${dodge}) was hit: ${fmtLost(evs)}`);
});

test('a riot shield from the front costs zombies', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8 });
  Z.spawn(g, 'riot', { x: lead(g).x + 300 });
  const evs = play(g, 5, NO_INPUT);
  assert.ok(ofType(evs, 'lost').some((e) => e.cause === 'riot'), `running into a riot shield must lose zombies, got ${fmtLost(evs)}`);
});

test('a riot shield after a Scream costs nothing', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8, screamPerBite: 1 });
  Z.spawn(g, 'civ', { x: lead(g).x + 60 });
  Z.spawn(g, 'riot', { x: lead(g).x + 60 + g.speed * 1.0 });
  let screamed = false;
  const evs = play(g, 5, (gg) => {
    if (!screamed && gg.scream.charge >= 1) { screamed = true; return { jumpPressed: false, jumpHeld: false, scream: true }; }
    return NO_INPUT;
  });
  assert.ok(ofType(evs, 'scream').length === 1, 'with screamPerBite 1 one bite fills the meter and Scream fires');
  assert.equal(ofType(evs, 'lost').filter((e) => e.cause === 'riot').length, 0, `a stunned riot must not cost zombies, got ${fmtLost(evs)}`);
});

test('a riot shield against a Brute horde costs nothing', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8 });
  Z.spawn(g, 'bouncer', { x: lead(g).x + 60 });
  Z.spawn(g, 'riot', { x: lead(g).x + 60 + g.speed * 1.5 });
  const evs = play(g, 5, NO_INPUT);
  assert.ok(ofType(evs, 'mutation').some((e) => mutType(e) === 'brute'), 'bouncer bite should make a Brute');
  assert.equal(ofType(evs, 'lost').filter((e) => e.cause === 'riot').length, 0, `Brute must not lose zombies to riot shields, got ${fmtLost(evs)}`);
});

test('Scream needs a full meter', () => {
  const g = emptyGame();
  const evs = play(g, 0.5, { jumpPressed: false, jumpHeld: false, scream: true });
  assert.equal(ofType(evs, 'scream').length, 0, 'scream with charge < 1 must do nothing');
  assert.equal(g.scream.charge, 0);
});

test('Scream with a full meter stuns humans on screen and resets the meter', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 4, screamPerBite: 1 });
  Z.spawn(g, 'civ', { x: lead(g).x + 60 });
  const far = Z.spawn(g, 'civ', { x: g.cameraX + g.config.viewWidth - 80 });
  play(g, 3, NO_INPUT, (gg) => gg.scream.charge >= 1);
  assert.ok(g.scream.charge >= 1, 'one bite with screamPerBite 1 fills the meter');
  const Z2 = getSim();
  Z2.step(g, { jumpPressed: false, jumpHeld: false, scream: true }, DT);
  const ev = g.events.find((e) => e.type === 'scream');
  assert.ok(ev, 'scream event when the meter is full');
  assert.ok(g.scream.charge < 0.01, `meter resets to 0 after screaming (charge=${g.scream.charge})`);
  assert.ok(g.scream.active > 0, 'scream.active counts down the stun/invulnerability');
  assert.equal(far.state, 'stunned', 'an on-screen human is stunned by the Scream');
  assert.equal(g.stats.screams, 1);
});

test('brain pickups add to game.brains with a brain event', () => {
  const Z = getSim();
  const g = emptyGame();
  Z.spawn(g, 'brain', { x: lead(g).x + 150, y: 20 });
  const evs = play(g, 3, NO_INPUT);
  assert.equal(ofType(evs, 'brain').length, 1, 'running through a low brain collects it');
  assert.equal(g.brains, 1, 'game.brains +1');
  assert.equal(g.stats.brainsCollected, 1);
});

test('combo grows with quick bites and resets on a loss', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 6 });
  for (let i = 0; i < 9; i++) Z.spawn(g, 'civ', { x: lead(g).x + 100 + i * 30 });
  const evs = play(g, 4, NO_INPUT, (gg) => gg.humans.length === 0 && gg.stats.bites >= 9);
  const bites = ofType(evs, 'bite');
  assert.equal(bites.length, 9, 'all 9 civilians bitten');
  for (let i = 1; i < bites.length; i++) {
    assert.ok(bites[i].combo >= bites[i - 1].combo, `combo must not drop between quick bites (${bites.map((b) => b.combo)})`);
  }
  assert.ok(bites[8].combo > bites[0].combo, `combo must grow over 9 quick bites (${bites.map((b) => b.combo)})`);
  assert.ok(g.combo >= 5, `9 quick bites => combo >= 5 (got ${g.combo})`);
  assert.ok(bites[8].multiplier >= 2 && g.multiplier >= 2, `multiplier = 1 + floor(combo/5) should be >= 2 (got ${bites[8].multiplier})`);
  Z.spawn(g, 'hole', { x: lead(g).x + 80, w: 120 });
  play(g, 3, NO_INPUT, (gg) => gg.events.some((e) => e.type === 'lost'));
  assert.ok(g.events.some((e) => e.type === 'lost'), 'the hole should cost a zombie');
  assert.equal(g.combo, 0, 'losing a zombie resets combo to 0');
});

test('game over when the horde hits 0, with a gameOver event', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 3 });
  Z.spawn(g, 'hole', { x: lead(g).x + 100, w: 700 });
  const evs = play(g, 8, NO_INPUT, (gg) => gg.status === 'over');
  assert.equal(g.status, 'over', 'a 700 px hole with no jump must kill the whole horde');
  assert.equal(g.horde.length, 0);
  const go = ofType(evs, 'gameOver');
  assert.equal(go.length, 1, 'exactly one gameOver event');
  assert.equal(typeof go[0].score, 'number');
  assert.equal(typeof go[0].dist, 'number');
});

test('maxHorde is never exceeded; bites beyond it still count', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 8, maxHorde: 10 });
  for (let i = 0; i < 6; i++) Z.spawn(g, 'civ', { x: lead(g).x + 120 + i * 50 });
  const scoreBefore = g.score;
  const evs = play(g, 4, NO_INPUT, null, (gg) => {
    assert.ok(gg.horde.length <= 10, `horde ${gg.horde.length} exceeded maxHorde 10`);
  });
  assert.equal(ofType(evs, 'bite').length, 6, 'all 6 humans are still bitten');
  assert.equal(g.horde.length, 10);
  assert.ok(g.score > scoreBefore);
});

test('Crawler makes the horde immune to bullets and holes', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 6, startSpeed: getSim().CONFIG.startSpeed * 0.6 });
  Z.spawn(g, 'plumber', { x: lead(g).x + 60 });
  play(g, 2, NO_INPUT, (gg) => gg.mutation.type === 'crawler');
  assert.equal(g.mutation.type, 'crawler', 'plumber bite => crawler');
  Z.spawn(g, 'hole', { x: lead(g).x + 120, w: 180 });
  Z.spawn(g, 'soldier', { x: g.cameraX + g.config.viewWidth - 40 });
  const n = g.horde.length;
  let underSeen = false;
  const window = Math.min(5, g.mutation.t - 0.5);
  const evs = play(g, window, NO_INPUT, null, (gg) => { if (gg.horde.some((z) => z.state === 'under')) underSeen = true; });
  assert.ok(underSeen, "crawler zombies use state 'under'");
  const bad = ofType(evs, 'lost').filter((e) => e.cause === 'bullet' || e.cause === 'hole');
  assert.equal(bad.length, 0, `crawler horde lost zombies to ${JSON.stringify(bad.map((e) => e.cause))}`);
  assert.equal(g.horde.length, n, 'no crawler lost during the window');
});
