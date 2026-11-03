'use strict';
// The only tests that look at wall-clock time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSim, DT, NO_INPUT, emptyGame, goodBot, runBot } = require('./bots.js');

test('ZSim.step with a 60-zombie horde averages well under a frame budget', () => {
  const Z = getSim();
  const g = emptyGame({ startHorde: 60 });
  assert.equal(g.horde.length, 60, 'scenario needs a 60-zombie horde');
  // give it some world to chew on
  for (let i = 0; i < 20; i++) Z.spawn(g, 'civ', { x: g.horde[0].x + 300 + i * 120 });
  for (let i = 0; i < 300; i++) Z.step(g, NO_INPUT, DT); // warm-up
  const N = 5000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) Z.step(g, i % 90 === 0 ? { jumpPressed: true, jumpHeld: true, scream: false } : NO_INPUT, DT);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`perf: ZSim.step avg ${ms.toFixed(4)} ms with horde ${g.horde.length} (target < 0.3 ms, hard limit 1 ms)`);
  if (ms >= 0.3) console.log('perf: WARNING step is above the 0.3 ms target');
  assert.ok(ms < 1, `ZSim.step averaged ${ms.toFixed(3)} ms; must stay under 1 ms (target 0.3 ms)`);
});

test('no array grows without bound over 10 simulated minutes of goodBot play', () => {
  const LIMIT = 200;
  const peaks = { humans: 0, obstacles: 0, projectiles: 0, pickups: 0, horde: 0 };
  let total = 0, seed = 900;
  while (total < 600) {
    const m = runBot(seed++, goodBot, {
      maxSeconds: 600 - total,
      config: { startHorde: 60 },
      onStep(g) {
        for (const k in peaks) {
          const n = g[k].length;
          if (n > peaks[k]) peaks[k] = n;
          assert.ok(n < LIMIT, `game.${k} has ${n} entries at t=${g.time.toFixed(1)} s (seed ${seed - 1}); old objects are not being deleted`);
        }
      },
    });
    total += Math.max(m.seconds, 1);
  }
  console.log('perf: peak array sizes over 600 s: ' + JSON.stringify(peaks));
});
