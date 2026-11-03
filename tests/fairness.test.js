'use strict';
// World-generation fairness: watch what the sim generates during long goodBot runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSim, goodBot, runBot, flight } = require('./bots.js');

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const HAZARDS = new Set(['car', 'hole', 'barricade', 'soldier', 'riot', 'scientist']);
const RIOT_HALF = 22;

function numbersOk(obj) {
  for (const k in obj) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isNaN(v)) return k;
  }
  return null;
}

let cache = null;
function worlds() {
  if (cache) return cache;
  const Z = getSim();
  cache = SEEDS.map((seed) => {
    const seen = new Map();
    const nanHits = [];
    const m = runBot(seed, goodBot, {
      maxSeconds: 300,
      onStep(g) {
        for (const k of ['horde', 'humans', 'obstacles', 'projectiles', 'pickups']) {
          for (const o of g[k]) {
            const bad = numbersOk(o);
            if (bad && nanHits.length < 5) nanHits.push(`${k} ${o.kind || 'zombie'}#${o.id}.${bad} at t=${g.time.toFixed(2)}`);
          }
        }
        for (const k of ['time', 'dist', 'speed', 'cameraX', 'score']) {
          if (!Number.isFinite(g[k]) && nanHits.length < 5) nanHits.push(`game.${k}=${g[k]} at t=${g.time.toFixed(2)}`);
        }
        // generator-level speed: the Runner x1.35 is a temporary bonus, not what the world is built for
        const base = g.mutation.type === 'runner' ? g.speed / 1.35 : g.speed;
        const L = g.horde[0];
        for (const o of g.obstacles.concat(g.humans)) {
          if (!HAZARDS.has(o.kind)) continue;
          const rec = seen.get(o.id);
          if (!rec) {
            seen.set(o.id, { kind: o.kind, x: o.x, w: o.w || 0, h: o.h || 0, need: o.need,
              time: g.time, loop: g.loop, speed: base,
              // until the leader gets there, estimate the arrival time
              arriveT: L ? g.time + Math.max(0, o.x - L.x) / Math.max(1, base) : g.time, arriveLoop: g.loop, arrived: false });
          } else if (!rec.arrived && L && L.x >= rec.x) {
            rec.arrived = true; rec.arriveT = g.time; rec.arriveLoop = g.loop;
          }
        }
      },
    });
    const fresh = Z.createGame({ seed });
    const leaderX0 = fresh.horde[0].x;
    return { seed, hazards: [...seen.values()].sort((a, b) => a.x - b.x), nanHits, leaderX0, cfg: fresh.config, m };
  });
  return cache;
}

test('no hazards inside the first 6 seconds of travel (30 seeds)', () => {
  const problems = [];
  for (const w of worlds()) {
    const c = w.cfg;
    let speed = c.startSpeed, travel = 0;
    for (let t = 0; t < 6; t += 1 / 60) { travel += speed / 60; speed = Math.min(c.maxSpeed, speed + c.speedRamp / 60); }
    const limit = w.leaderX0 + travel;
    for (const h of w.hazards) {
      if (h.x < limit) problems.push(`seed ${w.seed}: ${h.kind} at x=${h.x.toFixed(0)} (first 6 s end at x=${limit.toFixed(0)})`);
    }
  }
  assert.equal(problems.length, 0, 'the first 6 s must be hazard-free:\n' + problems.slice(0, 10).join('\n'));
});

function jumpSpan(h) {
  if (h.kind === 'riot') return { x0: h.x - RIOT_HALF, x1: h.x + RIOT_HALF };
  return { x0: h.x, x1: h.x + h.w };
}

test('consecutive jump hazards leave >= speed*0.55 s of free road after landing (30 seeds)', () => {
  const problems = [];
  let pairs = 0;
  for (const w of worlds()) {
    const c = w.cfg;
    const jumps = w.hazards.filter((h) => h.kind === 'car' || h.kind === 'hole' || h.kind === 'riot' || (h.kind === 'barricade' && h.h <= 110))
      .map((h) => Object.assign({}, h, jumpSpan(h))).sort((a, b) => a.x0 - b.x0);
    let i = 0;
    while (i < jumps.length) {
      // group = hazards a single maximum jump clears together (e.g. a riot line)
      const A = jumps[i];
      const maxDist = flight(c, A.speed, c.jumpHoldMax).dist;
      const tapDist = flight(c, A.speed, 0).dist;
      let x1 = A.x1, j = i + 1;
      while (j < jumps.length && jumps[j].x1 - A.x0 <= maxDist * 0.85 && jumps[j].x0 - x1 < A.speed * 0.55) { x1 = Math.max(x1, jumps[j].x1); j++; }
      const groupW = x1 - A.x0;
      if (groupW > maxDist && A.kind !== 'car') {
        problems.push(`seed ${w.seed}: ${A.kind} group at x=${A.x0.toFixed(0)} is ${groupW.toFixed(0)}px wide but a full jump covers only ${maxDist.toFixed(0)}px`);
      }
      const landing = A.x0 + Math.max(groupW, tapDist);
      if (j < jumps.length) {
        const B = jumps[j];
        pairs++;
        const free = B.x0 - landing;
        const need = A.speed * 0.55;
        if (free < need - 1) problems.push(`seed ${w.seed}: ${A.kind}@${A.x0.toFixed(0)} lands at ${landing.toFixed(0)}, next ${B.kind}@${B.x0.toFixed(0)}: ${free.toFixed(0)}px free < ${need.toFixed(0)}px (speed ${A.speed.toFixed(0)} * 0.55)`);
      }
      i = j;
    }
  }
  assert.ok(pairs > 30, `expected plenty of jump-hazard pairs across 30 runs, saw ${pairs}`);
  assert.equal(problems.length, 0, `${problems.length} unfair hazard spacings:\n` + problems.slice(0, 12).join('\n'));
});

test('tall barricades never need more than 4 + 3*d (30 seeds)', () => {
  const problems = [];
  let tall = 0;
  for (const w of worlds()) {
    for (const h of w.hazards) {
      if (h.kind !== 'barricade' || h.h <= 110) continue;
      tall++;
      // d = time / 60 + loop, at the moment the horde reaches the barricade
      const d = h.arriveT / 60 + h.arriveLoop;
      if (!(h.need <= 4 + 3 * d + 1e-9)) problems.push(`seed ${w.seed}: tall barricade need ${h.need} > 4 + 3*${d.toFixed(2)} = ${(4 + 3 * d).toFixed(2)} at x=${h.x.toFixed(0)} (reached at t=${h.arriveT.toFixed(1)}s${h.arrived ? '' : ', estimated'})`);
    }
  }
  if (tall === 0) console.log('note: no tall barricades were generated in 30 goodBot runs');
  assert.equal(problems.length, 0, problems.slice(0, 10).join('\n'));
});

test('no NaN anywhere in the world (30 seeds)', () => {
  const problems = [];
  for (const w of worlds()) {
    if (w.nanHits.length) problems.push(`seed ${w.seed}: ${w.nanHits.join('; ')}`);
    if (w.m.nan) problems.push(`seed ${w.seed}: NaN horde position at t=${w.m.nan.time}`);
  }
  assert.equal(problems.length, 0, problems.join('\n'));
});
