'use strict';
// "Is it fun" metrics over 20 seeds per bot. Prints a table for the lead.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSim, idleBot, randomBot, goodBot, runBot } = require('./bots.js');

const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const frac = (a, f) => a.filter(f).length / a.length;
const pct = (x) => (x * 100).toFixed(0) + '%';

let cache = null;
function runs() {
  if (cache) return cache;
  getSim();
  cache = {
    idle: SEEDS.map((s) => runBot(s, idleBot, { maxSeconds: 120 })),
    random: SEEDS.map((s) => runBot(s, randomBot(s), { maxSeconds: 400 })),
    good: SEEDS.map((s) => runBot(s, goodBot, { maxSeconds: 400 })),
  };
  const lines = ['', 'BALANCE (20 seeds each)',
    'bot     | median s | mean s | min-max s   | peak horde med | bites med | mutations med | smashes med | brains med | score med | gap>3s',
    '--------+----------+--------+-------------+----------------+-----------+---------------+-------------+------------+-----------+-------'];
  for (const [name, rs] of Object.entries(cache)) {
    const secs = rs.map((r) => r.seconds);
    lines.push([name.padEnd(7), median(secs).toFixed(1).padStart(8), mean(secs).toFixed(1).padStart(6),
      (Math.min(...secs).toFixed(0) + '-' + Math.max(...secs).toFixed(0)).padStart(11),
      String(median(rs.map((r) => r.peakHorde))).padStart(14), String(median(rs.map((r) => r.bites))).padStart(9),
      String(median(rs.map((r) => r.mutations))).padStart(13), String(median(rs.map((r) => r.smashes))).padStart(11),
      String(median(rs.map((r) => r.brains))).padStart(10), median(rs.map((r) => r.score)).toFixed(0).padStart(9),
      pct(frac(rs, (r) => r.longestGap > 3)).padStart(6)].join(' | '));
  }
  lines.push('goodBot per seed: ' + cache.good.map((r) => `${r.seed}:${r.seconds.toFixed(0)}s/h${r.peakHorde}/gap${r.longestGap.toFixed(1)}`).join(' '));
  console.log(lines.join('\n'));
  return cache;
}

test('idleBot dies within 15-60 s', () => {
  const bad = runs().idle.filter((r) => !(r.over && r.seconds >= 15 && r.seconds <= 60));
  assert.equal(bad.length, 0, 'a player who never presses anything should survive 15-60 s; outliers: ' +
    bad.map((r) => `seed ${r.seed}: ${r.over ? r.seconds.toFixed(1) + 's' : 'still alive at ' + r.seconds.toFixed(0) + 's'}`).join(', '));
});

test('randomBot dies on average sooner than goodBot', () => {
  const r = mean(runs().random.map((x) => x.seconds));
  const g = mean(runs().good.map((x) => x.seconds));
  assert.ok(r < g, `skill must matter: random mashing survived ${r.toFixed(1)} s on average vs good play ${g.toFixed(1)} s`);
});

test('goodBot median run is 60-240 s', () => {
  const m = median(runs().good.map((x) => x.seconds));
  assert.ok(m >= 60 && m <= 240, `a decent player's run should last 60-240 s, median is ${m.toFixed(1)} s`);
});

test('goodBot reaches a peak horde >= 15 in at least 70 % of runs', () => {
  const f = frac(runs().good, (r) => r.peakHorde >= 15);
  assert.ok(f >= 0.7, `growing the horde should feel great: only ${pct(f)} of runs reached 15 zombies (peaks: ${runs().good.map((r) => r.peakHorde)})`);
});

test('at least one mutation in at least 70 % of goodBot runs', () => {
  const f = frac(runs().good, (r) => r.mutations >= 1);
  assert.ok(f >= 0.7, `mutations should be common: only ${pct(f)} of runs had one (counts: ${runs().good.map((r) => r.mutations)})`);
});

test('longest gap between interesting events <= 3 s in at least 90 % of goodBot runs', () => {
  const f = frac(runs().good, (r) => r.longestGap <= 3);
  assert.ok(f >= 0.9, `something should happen every 2 s; only ${pct(f)} of runs kept gaps <= 3 s (gap s @ start time: ${runs().good.map((r) => r.longestGap.toFixed(1) + '@' + r.longestGapAt.toFixed(0)).join(', ')})`);
});

test('score grows over time', () => {
  for (const r of runs().good) {
    const s = r.scoreBySecond;
    for (let i = 1; i < s.length; i++) {
      assert.ok(s[i] >= s[i - 1], `seed ${r.seed}: score fell from ${s[i - 1]} to ${s[i]} at second ${i}`);
    }
    if (s.length > 11) assert.ok(s[s.length - 1] > s[10], `seed ${r.seed}: score did not grow after the first 10 s`);
  }
});

test('speed reaches >= 80 % of maxSpeed in runs longer than 120 s', () => {
  const Z = getSim();
  const long = runs().good.filter((r) => r.seconds > 120);
  for (const r of long) {
    assert.ok(r.peakSpeed >= 0.8 * Z.CONFIG.maxSpeed, `seed ${r.seed}: a ${r.seconds.toFixed(0)} s run peaked at ${r.peakSpeed.toFixed(0)} px/s, below 80 % of maxSpeed ${Z.CONFIG.maxSpeed}`);
  }
});
