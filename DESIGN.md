# You Are the Zombie — rebuild spec (v2)

The first version was rejected by the player as "awful, I don't want to play at all".
Root causes we are fixing:
- Walking slowly while holding Right and mashing Bite. No skill, no timing, no tension.
- The horde did everything by itself; the player made no decisions.
- Tiny characters, long empty stretches, weak feedback when something happens.
- No reason to play a second time (no score chase, no unlocks, no goals).

## The new game in one line
An auto-running horde runner (think Zombie Tsunami meets the concept art): the horde
sprints right on its own, you time **jumps** and a charged **Scream**, you plough through
people to grow the horde, and you mutate the whole horde by biting special people.
A run lasts 1 to 4 minutes. Restart is one key press. Brains earned in a run buy upgrades.

## Feel targets (these are requirements)
- Something happens at least every 2 seconds (a bite, a hazard, a pickup).
- Every bite is loud: pop of particles, number, sound, the new zombie bursts out of the victim.
- A jump makes the whole horde jump as a **wave**: each follower jumps when it reaches the x
  where the leader jumped. That wave is the signature visual.
- Hazards are readable 1.2 s ahead at current speed and always fair (never impossible).
- Losing zombies hurts and shows (they fly off with a sound); growing feels great.
- Speed and density ramp so a decent player's run ends between 60 s and 240 s.
- Instant restart (Space/Enter on the game-over screen), no menus in the way.

## Rules
- The horde runs right automatically. Speed starts at `CONFIG.startSpeed` and rises by
  `CONFIG.speedRamp` per second up to `CONFIG.maxSpeed`. During the Runner mutation speed x1.35.
- The player controls the horde with **Jump** (press = jump; holding up to `CONFIG.jumpHoldMax`
  seconds makes it higher) and **Scream** (only when the scream meter is full).
- The horde: `game.horde[0]` is the leader, always at `cameraX + CONFIG.leaderScreenX`.
  Followers trail behind in a loose 3-lane blob, spacing `CONFIG.followerSpacing` px.
  If the leader dies, the next zombie becomes leader (no game over until the horde is empty).
  Max horde size `CONFIG.maxHorde` (60). Bites beyond the max give score and scream charge only.
- **Game over** when the horde reaches 0.
- **Humans** stand, wander, or flee on the road. Any zombie touching a human bites them
  (human becomes a zombie that joins the horde at that spot). Fleeing humans run right
  slower than the horde, so you catch them.
  - Special humans carry a **job** and a glowing icon. Biting one triggers that **mutation**
    on the whole horde for `CONFIG.mutationTime` seconds (default 7):
    - `jogger` -> **Runner**: speed x1.35, bite magnet (humans within 140 px are pulled in).
    - `bouncer` -> **Brute**: horde grows big, smashes every obstacle and soldier it touches, no losses from cars or barricades.
    - `chef` -> **Spitter**: every 0.35 s the horde spits acid ahead; acid kills soldiers and riot shields, and bites humans at range (they still join the horde).
    - `plumber` -> **Crawler**: horde goes underground: immune to bullets, holes and cure, cannot bite while under (humans are skipped), pops up when it ends.
- **Hazards** (obstacles and enemies):
  - `car` (w ~200, h ~80): zombies that run into its side are lost (one zombie per touch, the
    zombie is removed). Zombies that land on its roof run across it fine.
  - `hole` (manhole / crater, w 90 to 200): zombies on the ground over it fall in and are lost.
  - `barricade` with `need` N (shown on it): if the horde size >= need when the leader reaches
    it, it smashes (big feedback, score). Otherwise each zombie that touches it is lost until
    the horde is too small, or jump over it if it is low (`h` <= 110). Tall ones (h 170) cannot be jumped.
  - `soldier` (human kind): stands ahead and shoots bullets at the horde every ~1 s when on screen.
    Each bullet that hits removes one zombie. Biting the soldier stops it (soldier joins the horde).
    Bullets fly at chest height, so jumping zombies above `CONFIG.bulletDodgeHeight` dodge them.
  - `riot` (human kind): shield wall. Touching it from the front loses one zombie per touch unless
    Brute, Spitter acid, or Scream stunned it. Jumping over it is allowed (h 120).
  - `scientist` (human kind, appears from biome 2): sprays a cure cloud ahead; zombies in the
    cloud turn back into humans who run away (lost zombies). Biting the scientist gives +3 brains.
- **Pickups**: `brain` items float in arcs (often over cars and holes) to reward jumps. Each
  is +1 brain (currency) and +5 score.
- **Scream meter**: each bite adds `CONFIG.screamPerBite` (0.07). When full (1), Scream stuns
  everything on screen for 2 s, knocks riot shields away, makes soldiers drop guns, pulls nearby
  humans toward the horde, and gives 1.2 s invulnerability. Meter resets to 0.
- **Score**: distance/10 + bites x 10 x combo multiplier + smashes x 50 + brains x 5.
  **Combo**: bites within 1.5 s of each other increase `combo` (multiplier = 1 + floor(combo/5),
  max x5). Losing a zombie resets combo to 0.
- **Biomes** cycle by distance every `CONFIG.biomeLength` px: 0 Suburbs (dusk, orange),
  1 Downtown (night, purple, green moon), 2 Quarantine (dawn, pale teal, soldiers + scientists),
  then back to 0 with higher difficulty. A biome change emits a `biome` event.
- **Missions**: 3 active at a time from a pool (examples: "Bite 40 people in one run",
  "Smash 3 barricades", "Reach Downtown", "Be a Brute 2 times", "Have a horde of 30",
  "Collect 25 brains", "Scream 2 times", "Jump over 10 cars"). Completing one gives brains
  and replaces it with the next. Progress persists in the save.
- **Upgrades** (bought with brains between runs, persisted): `startHorde` (+1 starting zombie
  per level, max 5), `mutation` (+1 s mutation time per level, max 4), `scream` (+15 % scream
  charge per bite per level, max 4), `magnet` (brain pickup range +40 px per level, max 3),
  `luck` (special humans appear 15 % more often per level, max 3). Cost grows per level.

## Code layout (single page, no libraries, built to one HTML file)
```
zombie-game/
  DESIGN.md            this file (the contract — do not change the API without telling the lead)
  src/sim.js           pure game logic. No DOM, no canvas, no Math.random, no Date. Deterministic.
  src/render.js        draws a game state on a CanvasRenderingContext2D. Never mutates game logic state.
  src/audio.js         WebAudio sound effects + small procedural music loop. Silent-safe.
  src/main.js          boot, input, fixed-step loop, screens (title, shop, pause, game over), save/load.
  src/index.html       page template: <title>, <style>, markup, and the marker /*@SCRIPTS@*/ inside one <script> tag.
  build.js             node build.js -> dist/you-are-the-zombie.html (inlines the 4 scripts in order sim, render, audio, main).
  tests/*.test.js      node --test tests/   (node:test + node:assert only, no npm packages)
  tests/bots.js        scripted players used by tests
  reference/old-game.html   the rejected v1: reuse its sprite drawing code (heroSprite etc.), nothing else.
```
Each src file is a classic script that defines one global and also supports Node:
```js
(function (root) {
  const ZSim = { /* ... */ };
  root.ZSim = ZSim;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZSim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
Globals: `ZSim` (sim.js), `ZRender` (render.js), `ZAudio` (audio.js). main.js defines none.

## The sim API (exact)
```
ZSim.CONFIG                      object of all tunables (numbers). Tests read these. Must include at least:
  startSpeed, speedRamp, maxSpeed, gravity, jumpVelocity, jumpHoldMax, jumpHoldGravityScale,
  leaderScreenX, followerSpacing, maxHorde, mutationTime, screamPerBite, biomeLength,
  bulletDodgeHeight, viewWidth (1280), startHorde (base, before upgrades)
ZSim.BIOMES                      [{ name: 'Suburbs' }, { name: 'Downtown' }, { name: 'Quarantine' }]
ZSim.UPGRADES                    [{ id, name, desc, max, cost(level) }]   ids: startHorde, mutation, scream, magnet, luck
ZSim.MISSION_POOL                [{ id, text, goal, stat }]   stat names the counter it reads (see game.stats)
ZSim.defaultSave()               -> { brains: 0, best: 0, upgrades: { startHorde:0, mutation:0, scream:0, magnet:0, luck:0 },
                                     missions: [ {id, progress} x3 ], missionIndex: 3, runs: 0, totalBites: 0 }
ZSim.normalizeSave(anything)     -> a valid save (fills missing fields; never throws on junk input)
ZSim.buyUpgrade(save, id)        -> { ok: boolean, save, reason?: 'max'|'brains'|'unknown' }   (pure: returns a new save)
ZSim.createGame({ seed, save })  -> game    (seed: integer; save optional, defaults applied)
ZSim.step(game, input, dt)       -> game    mutates and returns game. dt in seconds (main uses fixed 1/60).
                                     input = { jumpPressed: bool (edge this step), jumpHeld: bool, scream: bool (edge) }
                                     Does nothing once game.status === 'over'.
ZSim.finishRun(save, game)       -> { save, earned: { brains, missionsDone: [text...] , newBest: bool } }  (pure)
ZSim.rng(seed)                   -> function () returning [0,1)  (mulberry32). The game keeps its own in game.rng.
ZSim.createGame({ seed, save, empty: true })   test mode: no world generation at all (no humans, hazards or
                                     pickups ever spawn); speed still ramps unless CONFIG is overridden per game
                                     via the `config` option: createGame({ seed, empty: true, config: { speedRamp: 0 } }).
ZSim.spawn(game, kind, props)    -> the created object, inserted into the right array with all documented fields
                                     defaulted and a fresh id. kind is a human kind ('civ','jogger','bouncer','chef',
                                     'plumber','soldier','riot','scientist'), an obstacle kind ('car','hole','barricade')
                                     or 'brain'. props override defaults (x is required). Tests build scenarios with it.
```
`game.config` holds the effective config for that game (CONFIG merged with the `config` option and upgrades);
the sim must read tunables from `game.config`, never directly from `CONFIG`, so tests can override them.
`game` fields (renderer and tests read these; only sim writes them):
```
status: 'running' | 'over'
time, dist, speed, cameraX, biome (0..2), loop (how many full biome cycles done)
horde:   [{ id, x, y, vy, lane (0..2), state: 'run'|'air'|'under', leader: bool, born (time), hurt (seconds left of flash),
            jumpAtX (x where it will jump, or null), fromJob (string|null) }]
humans:  [{ id, kind: 'civ'|'jogger'|'bouncer'|'chef'|'plumber'|'soldier'|'riot'|'scientist', x, y, lane,
            state: 'idle'|'flee'|'stunned', t (anim phase), cd, shield (riot only, bool) }]
obstacles: [{ id, kind: 'car'|'hole'|'barricade', x, w, h, need (barricade), broken: bool }]
projectiles: [{ id, kind: 'bullet'|'acid'|'cure', x, y, vx, vy, r }]
pickups: [{ id, kind: 'brain', x, y, taken: bool }]
mutation: { type: null|'runner'|'brute'|'spitter'|'crawler', t (seconds left), dur }
scream:   { charge (0..1), active (seconds left of stun/invuln) }
score, combo, comboT, multiplier, brains (this run)
stats: { bites, smashes, brainsCollected, maxHorde, carsJumped, screams, mutations: {runner,brute,spitter,crawler}, biomesReached, distance }
missions: [{ id, text, goal, progress, done }]   (copied from save at createGame, progress counted live)
events: [ ... ]   cleared at the start of every step, then filled during it
```
World coordinates: x grows right, y is height above the road (0 = on the road, up is positive).
The renderer maps y=0 to screen y 560 and screen x = worldX - cameraX. Lanes are depth rows
(lane 0 back, 2 front) drawn about 18 px apart on screen; collisions ignore lane.

Events (exact `type` names, extra fields as listed):
```
bite        { x, y, kind, job (string|null), combo, multiplier }
join        { id, x }                       a new zombie joined
lost        { x, y, cause: 'car'|'hole'|'barricade'|'bullet'|'riot'|'cure' }
jump        { x }                           leader jumped
land        { x }
smash       { x, kind: 'barricade'|'car'|'soldier'|'riot' }
mutation    { type }                        start
mutationEnd { type }
scream      { x }
brain       { x, y }
biome       { biome, name }
mission     { text, reward }
speedUp     { speed }                       every +40 px/s
gameOver    { score, dist }
```

## Generation and fairness (sim)
- World is generated ahead in **chunks** chosen from templates (calm stretch with a crowd,
  car + brains arc, hole, barricade, soldier post, riot line, mixed). Generate at least
  1.5 screens ahead of the camera; delete things 1 screen behind.
- Difficulty value `d = time / 60 + loop` picks templates and densities.
- Fairness rule: between two hazards that need a jump there is at least
  `speed * 0.55 s` of free road after landing. Never place a tall barricade whose `need`
  exceeds what a player could plausibly have (need <= 4 + 3*d, and at least 6 humans
  generated in the 2 chunks before it). The first 6 seconds of a run contain no hazards.
- Special job humans: base chance per crowd 0.35 (+luck upgrade), never two mutations overlap.

## Renderer and main (presentation)
- Canvas 1280x720 logical, scaled to fit, crisp on high-DPI.
- Reuse the v1 sprite code style (thick #17121F outlines, concept palette). Zombies are bigger
  than v1 (leader scale ~0.42, followers ~0.3). Humans show the job icon/label above the head.
- Juice: screen shake on loss/smash, 60 ms hit-stop on smash, squash and stretch on land,
  particle bursts, floating score numbers, speed lines that scale with speed, parallax 3 layers,
  combo counter that pulses, mutation tint + timer ring, scream shockwave, slow-mo 0.3 s on game over.
- HUD: big horde count with zombie head icon (top-left), score + best (top-centre),
  combo multiplier, scream meter (fills, glows when ready), mutation timer, biome name banner,
  mission toast when one completes.
- Screens: Title (Play, Upgrades, mission list, best score, brains), Upgrades shop,
  Pause, Game over (score, best, brains earned, missions done, big "Run again", "Upgrades").
- Controls: Space / W / Up / J / click or tap left 70 % of the stage = jump (hold for higher);
  K / S / Shift / tap the scream button = scream; P or Esc pause; M mute; Enter or Space restart
  on game over.
- Save in localStorage key `zombie-save-v2`, every access in try/catch.
- Audio: bite crunch, jump whoosh, land thud, loss splat, smash boom, brain ding, scream,
  mutation fanfare, a light procedural beat that speeds up with game speed. Starts after first input.
- Respect prefers-reduced-motion (no shake/flash).
