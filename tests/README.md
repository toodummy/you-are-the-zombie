# Tests

Run from the project folder (Node 18+, no npm packages):

```
node build.js                  # -> dist/you-are-the-zombie.html
node --test tests/             # whole suite
node --test tests/rules.test.js   # one file
```

| file | what it checks |
|---|---|
| api.test.js | CONFIG tunables, BIOMES/UPGRADES/MISSION_POOL shapes, createGame fields, events cleared per step, game over freezes, determinism |
| rules.test.js | scenario tests in empty worlds (`createGame({seed, empty:true, config:{speedRamp:0}})` + `ZSim.spawn`): bites, mutations, cars, jump wave, holes, barricades, soldiers, riot, scream, brains, combo, game over, maxHorde, Crawler |
| fairness.test.js | 30 long goodBot runs: no hazards in the first 6 s, free road after landing between jump hazards, tall-barricade `need` cap, no NaN |
| balance.test.js | "is it fun" metrics over 20 seeds per bot; prints a metrics table |
| meta.test.js | save normalisation, upgrades, finishRun, missions, upgrades applied by createGame |
| perf.test.js | step cost with a 60-zombie horde (logs ms; fails only above 1 ms), arrays stay bounded |
| bundle.test.js | runs build.js, checks the HTML, boots it in node:vm with a DOM/canvas stub and drives frames + keys |

`tests/bots.js` holds the scripted players (`idleBot`, `randomBot(seed)`, `goodBot`), `runBot(seed, bot, {maxSeconds})`
and scenario helpers. Bots only read documented game fields. Obstacles are assumed to span `[x, x + w]`
(x = left edge); riot shields are treated as ~44 px wide around `x`.

`tests/index.js` exists only because Node 22+ treats `node --test tests/` as one entry point
(the directory resolves to `index.js`, which loads every `*.test.js`). `node --test` with no
arguments also finds all the tests.

Interpretations of DESIGN.md: the `mutation`/`mutationEnd` event carries the mutation name in
`mutation` (or `name`), because `type` is already the event name. Fairness spacing uses base
speed (the Runner x1.35 is ignored). The tall-barricade cap uses `d` at the moment the horde
reaches the barricade.

If `src/sim.js` is missing, every sim test fails with "missing src/sim.js".
