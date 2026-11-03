/* You Are the Zombie v2 - pure game logic (no DOM, no Math.random, no Date). Deterministic from the seed. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- tunables
  const CONFIG = {
    viewWidth: 1280,
    viewHeight: 720,
    // speed
    startSpeed: 300,
    speedRamp: 2.5,           // px/s per second
    maxSpeed: 620,
    runnerSpeedMul: 1.35,
    // jump physics
    gravity: 2600,
    jumpVelocity: 860,
    jumpHoldMax: 0.2,
    jumpHoldGravityScale: 0.45,
    jumpBuffer: 0.12,         // a press slightly before landing still jumps
    // horde
    leaderScreenX: 380,
    followerSpacing: 22,
    zombieRadius: 12,
    startHorde: 3,
    maxHorde: 60,
    // mutations / scream / combo
    mutationTime: 7,
    screamPerBite: 0.07,
    screamStun: 2,
    screamInvuln: 1.2,
    screamPullRange: 450,
    screamPullSpeed: 380,
    comboWindow: 1.5,
    magnetRange: 140,
    magnetSpeed: 700,
    spitInterval: 0.35,
    crawlerDigInterval: 0.6,
    acidSpeed: 650,
    acidLife: 0.9,
    // pickups
    brainRange: 46,
    // world
    biomeLength: 4200,
    humanHeight: 80,
    riotHeight: 120,
    barricadeJumpMax: 110,    // barricades taller than this cannot be jumped
    carMaxKills: 5,           // a car that ate this many zombies is wrecked and passable
    holeFill: 20,             // a hole that swallowed this many zombies is filled
    riotHold: 3,              // shield breaks after stopping this many zombies
    barricadeChip: 2,         // each zombie lost on a barricade lowers its need by this
    // enemies
    bulletDodgeHeight: 70,
    bulletY: 42,
    bulletSpeed: 720,
    soldierFireInterval: 1.0,
    cureInterval: 1.8,
    cureKills: 2,
    cureRadius: 50,
    cureHeight: 90,
    scientistBrains: 3,
    fleeDist: 320,
    fleeSpeedFrac: 0.42,
    // generation
    specialChance: 0.35,
    safeTime: 6,
    fairGap: 0.55
  };

  const BIOMES = [{ name: 'Suburbs' }, { name: 'Downtown' }, { name: 'Quarantine' }];
  const JOB_MUTATION = { jogger: 'runner', bouncer: 'brute', chef: 'spitter', plumber: 'crawler' };
  const JOBS = ['jogger', 'bouncer', 'chef', 'plumber'];
  const HUMAN_KINDS = { civ: 1, jogger: 1, bouncer: 1, chef: 1, plumber: 1, soldier: 1, riot: 1, scientist: 1 };
  const FLEE_KINDS = { civ: 1, jogger: 1, bouncer: 1, chef: 1, plumber: 1 };
  const OBSTACLE_DEFAULTS = {
    car: { w: 200, h: 80, need: 0 },
    hole: { w: 140, h: 0, need: 0 },
    barricade: { w: 40, h: 100, need: 3 }
  };
  const PROJECTILE_KINDS = { bullet: 1, acid: 1, cure: 1 };
  const HOLE = -1;
  const MAX_SUB = 0.05;
  const MAX_DT = 1;

  function costFn(base) {
    return function (level) {
      level = Math.max(0, Math.floor(+level || 0));
      return Math.round(base * (1 + level) * (1 + level * 0.5));
    };
  }
  const UPGRADES = [
    { id: 'startHorde', name: 'Bigger Pack', desc: '+1 starting zombie', max: 5, cost: costFn(30) },
    { id: 'mutation', name: 'Long Mutation', desc: '+1 s mutation time', max: 4, cost: costFn(40) },
    { id: 'scream', name: 'Big Lungs', desc: '+15% scream charge per bite', max: 4, cost: costFn(30) },
    { id: 'magnet', name: 'Brain Magnet', desc: '+40 px brain pickup range', max: 3, cost: costFn(25) },
    { id: 'luck', name: 'Lucky Find', desc: 'Special humans 15% more often', max: 3, cost: costFn(45) }
  ];

  // mode 'run': best single-run value counts; 'total': accumulates across runs.
  const MISSION_POOL = [
    { id: 'bite40', text: 'Bite 40 people in one run', goal: 40, stat: 'bites', mode: 'run', reward: 15 },
    { id: 'smash3', text: 'Smash 3 barricades', goal: 3, stat: 'barricades', mode: 'total', reward: 15 },
    { id: 'downtown', text: 'Reach Downtown', goal: 2, stat: 'biomesReached', mode: 'run', reward: 10 },
    { id: 'brute2', text: 'Be a Brute 2 times', goal: 2, stat: 'mutations.brute', mode: 'total', reward: 15 },
    { id: 'horde30', text: 'Have a horde of 30', goal: 30, stat: 'maxHorde', mode: 'run', reward: 25 },
    { id: 'brains25', text: 'Collect 25 brains', goal: 25, stat: 'brainsCollected', mode: 'total', reward: 15 },
    { id: 'scream2', text: 'Scream 2 times', goal: 2, stat: 'screams', mode: 'total', reward: 10 },
    { id: 'cars10', text: 'Jump over 10 cars', goal: 10, stat: 'carsJumped', mode: 'total', reward: 20 },
    { id: 'quarantine', text: 'Reach Quarantine', goal: 3, stat: 'biomesReached', mode: 'run', reward: 20 },
    { id: 'runner3', text: 'Be a Runner 3 times', goal: 3, stat: 'mutations.runner', mode: 'total', reward: 15 },
    { id: 'smash10', text: 'Smash 10 things', goal: 10, stat: 'smashes', mode: 'total', reward: 20 },
    { id: 'spitter2', text: 'Be a Spitter 2 times', goal: 2, stat: 'mutations.spitter', mode: 'total', reward: 15 },
    { id: 'bite100', text: 'Bite 100 people in one run', goal: 100, stat: 'bites', mode: 'run', reward: 40 },
    { id: 'crawler2', text: 'Be a Crawler 2 times', goal: 2, stat: 'mutations.crawler', mode: 'total', reward: 15 },
    { id: 'dist3k', text: 'Run 3 km in one run', goal: 30000, stat: 'distance', mode: 'run', reward: 25 },
    { id: 'brains100', text: 'Collect 100 brains', goal: 100, stat: 'brainsCollected', mode: 'total', reward: 30 },
    { id: 'horde50', text: 'Have a horde of 50', goal: 50, stat: 'maxHorde', mode: 'run', reward: 50 },
    { id: 'loop', text: 'Survive a full city loop', goal: 4, stat: 'biomesReached', mode: 'run', reward: 40 }
  ];
  const MISSION_BY_ID = {};
  MISSION_POOL.forEach(function (m) { MISSION_BY_ID[m.id] = m; });

  // ---------------------------------------------------------------- helpers
  function rng(seed) {
    let a = (Math.floor(+seed || 0)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function num(v, def) { v = +v; return isFinite(v) ? v : def; }
  function int0(v) { v = Math.floor(+v); return isFinite(v) && v > 0 ? v : 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function emit(game, ev) { game.events.push(ev); }
  function statValue(stats, path) {
    if (!stats) return 0;
    const parts = String(path).split('.');
    let v = stats;
    for (let i = 0; i < parts.length; i++) { v = v == null ? undefined : v[parts[i]]; }
    v = +v;
    return isFinite(v) ? v : 0;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function airTimes(c) {
    const g = Math.max(1, c.gravity), v = Math.max(1, c.jumpVelocity);
    const tap = 2 * v / g;
    const g2 = g * clamp(c.jumpHoldGravityScale, 0.01, 1);
    let t1 = Math.max(0, c.jumpHoldMax);
    if (v - g2 * t1 < 0) t1 = v / g2;
    const v1 = v - g2 * t1;
    const y1 = v * t1 - 0.5 * g2 * t1 * t1;
    const ymax = y1 + v1 * v1 / (2 * g);
    const hold = t1 + v1 / g + Math.sqrt(2 * ymax / g);
    return { tap: tap, hold: hold, tapPeak: v * v / (2 * g), holdPeak: ymax, t1: t1, g2: g2 };
  }
  function jumpY(c, air, t, held) {
    const g = c.gravity, v = c.jumpVelocity;
    if (!held) return Math.max(0, v * t - 0.5 * g * t * t);
    if (t <= air.t1) return v * t - 0.5 * air.g2 * t * t;
    const v1 = v - air.g2 * air.t1, y1 = v * air.t1 - 0.5 * air.g2 * air.t1 * air.t1, u = t - air.t1;
    return Math.max(0, y1 + v1 * u - 0.5 * g * u * u);
  }

  // ---------------------------------------------------------------- saves
  function nextMissionId(save, activeIds) {
    const n = MISSION_POOL.length;
    for (let k = 0; k < n; k++) {
      const id = MISSION_POOL[save.missionIndex % n].id;
      save.missionIndex++;
      if (activeIds.indexOf(id) < 0) return id;
    }
    return MISSION_POOL[0].id;
  }
  function defaultSave() {
    return {
      brains: 0, best: 0,
      upgrades: { startHorde: 0, mutation: 0, scream: 0, magnet: 0, luck: 0 },
      missions: [{ id: MISSION_POOL[0].id, progress: 0 }, { id: MISSION_POOL[1].id, progress: 0 }, { id: MISSION_POOL[2].id, progress: 0 }],
      missionIndex: 3, runs: 0, totalBites: 0
    };
  }
  function normalizeSave(obj) {
    const s = defaultSave();
    try {
      if (!obj || typeof obj !== 'object') return s;
      s.brains = int0(obj.brains);
      s.best = int0(obj.best);
      s.runs = int0(obj.runs);
      s.totalBites = int0(obj.totalBites);
      const up = obj.upgrades && typeof obj.upgrades === 'object' ? obj.upgrades : {};
      UPGRADES.forEach(function (u) { s.upgrades[u.id] = Math.min(u.max, int0(up[u.id])); });
      const mi = Math.floor(+obj.missionIndex);
      s.missionIndex = isFinite(mi) && mi >= 0 ? mi : 3;
      if (!Array.isArray(obj.missions)) return s; // no mission data: keep the default first three
      const ms = [];
      const ids = [];
      {
        for (let i = 0; i < obj.missions.length && ms.length < 3; i++) {
          const m = obj.missions[i];
          if (!m || typeof m !== 'object') continue;
          const id = typeof m.id === 'string' ? m.id : '';
          if (!MISSION_BY_ID[id] || ids.indexOf(id) >= 0) continue;
          ids.push(id);
          ms.push({ id: id, progress: Math.min(int0(m.progress), MISSION_BY_ID[id].goal) });
        }
      }
      while (ms.length < 3) {
        const id = nextMissionId(s, ids);
        ids.push(id);
        ms.push({ id: id, progress: 0 });
      }
      s.missions = ms;
    } catch (e) {
      return defaultSave();
    }
    return s;
  }
  function buyUpgrade(save, id) {
    const s = normalizeSave(save);
    const u = UPGRADES.filter(function (x) { return x.id === id; })[0];
    if (!u) return { ok: false, save: s, reason: 'unknown' };
    const lvl = s.upgrades[id];
    if (lvl >= u.max) return { ok: false, save: s, reason: 'max' };
    const cost = u.cost(lvl);
    if (s.brains < cost) return { ok: false, save: s, reason: 'brains' };
    s.brains -= cost;
    s.upgrades[id] = lvl + 1;
    return { ok: true, save: s };
  }
  function finishRun(save, game) {
    const s = normalizeSave(save);
    const g = game || {};
    const stats = g.stats || {};
    let earned = int0(g.brains);
    const done = [];
    const activeIds = s.missions.map(function (m) { return m.id; });
    for (let i = 0; i < s.missions.length; i++) {
      const m = s.missions[i];
      const def = MISSION_BY_ID[m.id];
      const v = statValue(stats, def.stat);
      const p = def.mode === 'total' ? m.progress + v : Math.max(m.progress, v);
      if (p >= def.goal) {
        earned += def.reward;
        done.push(def.text);
        const nid = nextMissionId(s, activeIds);
        activeIds[i] = nid;
        s.missions[i] = { id: nid, progress: 0 };
      } else {
        m.progress = Math.floor(p);
      }
    }
    const score = int0(g.score);
    const newBest = score > s.best;
    s.brains += earned;
    if (newBest) s.best = score;
    s.runs += 1;
    s.totalBites += int0(stats.bites);
    return { save: s, earned: { brains: earned, missionsDone: done, newBest: newBest } };
  }

  // ---------------------------------------------------------------- game creation
  function makeConfig(opts, save) {
    const c = {};
    Object.keys(CONFIG).forEach(function (k) { c[k] = CONFIG[k]; });
    const o = opts && opts.config && typeof opts.config === 'object' ? opts.config : null;
    if (o) Object.keys(o).forEach(function (k) { const v = +o[k]; if (isFinite(v)) c[k] = v; });
    const u = save.upgrades;
    c.startHorde += u.startHorde;
    c.mutationTime += u.mutation;
    c.screamPerBite *= 1 + 0.15 * u.scream;
    c.brainRange += 40 * u.magnet;
    c.specialChance *= 1 + 0.15 * u.luck;
    // safety clamps so junk overrides cannot produce NaN loops
    c.gravity = Math.max(1, c.gravity);
    c.maxHorde = Math.max(1, Math.floor(c.maxHorde));
    c.viewWidth = Math.max(100, c.viewWidth);
    c.biomeLength = Math.max(100, c.biomeLength);
    return c;
  }

  function createGame(opts) {
    opts = opts || {};
    const save = normalizeSave(opts.save);
    const seed = Math.floor(num(opts.seed, 0));
    const c = makeConfig(opts, save);
    const game = {
      status: 'running',
      seed: seed,
      empty: !!opts.empty,
      time: 0, dist: 0,
      speed: c.startSpeed,
      cameraX: 0,
      biome: 0, loop: 0,
      horde: [], humans: [], obstacles: [], projectiles: [], pickups: [],
      mutation: { type: null, t: 0, dur: 0 },
      scream: { charge: 0, active: 0 },
      score: 0, combo: 0, comboT: 0, multiplier: 1, brains: 0,
      stats: {
        bites: 0, smashes: 0, brainsCollected: 0, maxHorde: 0, carsJumped: 0, screams: 0,
        mutations: { runner: 0, brute: 0, spitter: 0, crawler: 0 },
        biomesReached: 1, distance: 0, barricades: 0, lost: 0
      },
      missions: save.missions.map(function (m) {
        const def = MISSION_BY_ID[m.id];
        return { id: m.id, text: def.text, goal: def.goal, progress: Math.min(m.progress, def.goal), done: false, reward: def.reward, _base: m.progress };
      }),
      events: [],
      config: c,
      rng: rng(seed),
      invuln: 0,
      _nextId: 1, _baseSpeed: c.startSpeed, _speedMark: c.startSpeed, _biomeIdx: 0,
      _jumpBuf: 0, _waves: [], _waveSeq: 0, _pullT: 0, _spitT: 0, _digT: 0,
      _deadCount: 0, _joins: [], _bitePts: 0, _bonusPts: 0,
      gen: null
    };
    const n = clamp(Math.round(c.startHorde), 1, c.maxHorde);
    const headX = c.leaderScreenX;
    for (let i = 0; i < n; i++) {
      const z = makeZombie(game, headX, 0);
      z.x = i === 0 ? headX : headX - slotOffset(c, i, z);
      if (i === 0) { z.leader = true; z.lane = 1; }
      game.horde.push(z);
    }
    game.stats.maxHorde = n;
    if (!game.empty) {
      const air = airTimes(c);
      const st = Math.max(0, c.safeTime);
      const safeDist = (c.startSpeed * st + 0.5 * Math.max(0, c.speedRamp) * st * st) * Math.max(1, c.runnerSpeedMul);
      game.gen = {
        nextX: headX + c.startSpeed * 0.75,
        safeX: headX + safeDist + 40,
        jumpFree: 0,
        lastSpecialX: -1e9,
        recent: [0, 0],
        chunkHumans: 0,
        chunks: 0,
        airTap: air.tap, airHold: air.hold
      };
      generate(game);
    }
    return game;
  }

  function newId(game) { return game._nextId++; }

  function makeZombie(game, x, y) {
    const id = newId(game);
    return {
      id: id, x: x, y: y || 0, vy: 0, lane: id % 3, state: 'run', leader: false, born: game.time, hurt: 0,
      jumpAtX: null, fromJob: null,
      _airT: 0, _wave: 0, _pending: 0, _buffered: 0, _dead: false
    };
  }

  function slotOffset(c, i, z) {
    if (i === 0) return 0;
    const row = 1 + Math.floor((i - 1) / 3);
    return row * c.followerSpacing + (((z.id * 7) % 9) - 4);
  }

  function spawn(game, kind, props) {
    props = props || {};
    const c = game.config;
    let obj;
    if (HUMAN_KINDS[kind]) {
      const id = newId(game);
      obj = {
        id: id, kind: kind, x: 0, y: 0, lane: id % 3, state: 'idle', t: 0,
        cd: kind === 'soldier' ? 0.6 : kind === 'scientist' ? 0.8 : 0,
        shield: kind === 'riot', job: JOB_MUTATION[kind] ? kind : null,
        _stunT: 0, _noBite: 0, _vx: 0, _holds: 0, _disarmed: false, _dead: false
      };
      Object.assign(obj, props);
      obj.id = id;
      game.humans.push(obj);
    } else if (OBSTACLE_DEFAULTS[kind]) {
      const id = newId(game);
      const d = OBSTACLE_DEFAULTS[kind];
      obj = { id: id, kind: kind, x: 0, w: d.w, h: d.h, need: d.need, broken: false, _kills: 0, _hit: false, _counted: false };
      Object.assign(obj, props);
      obj.id = id;
      game.obstacles.push(obj);
    } else if (kind === 'brain') {
      const id = newId(game);
      obj = { id: id, kind: 'brain', x: 0, y: 40, taken: false };
      Object.assign(obj, props);
      obj.id = id;
      game.pickups.push(obj);
    } else if (PROJECTILE_KINDS[kind]) {
      const id = newId(game);
      obj = { id: id, kind: kind, x: 0, y: c.bulletY, vx: 0, vy: 0, r: 5, _life: 3, _hits: 0, _dead: false };
      if (kind === 'bullet') obj.vx = -c.bulletSpeed;
      if (kind === 'acid') { obj.vx = c.acidSpeed + game.speed; obj.r = 10; obj.y = 40; obj._life = c.acidLife; }
      if (kind === 'cure') { obj.vx = -70; obj.r = c.cureRadius; obj.y = 35; obj._life = 2.2; }
      Object.assign(obj, props);
      obj.id = id;
      game.projectiles.push(obj);
    } else if (kind === 'zombie') {
      obj = makeZombie(game, num(props.x, game.cameraX + c.leaderScreenX - 10), 0);
      const id = obj.id;
      Object.assign(obj, props);
      obj.id = id;
      if (game.mutation.type === 'crawler') obj.state = 'under';
      insertZombie(game, obj);
    } else {
      return null;
    }
    return obj;
  }

  function insertZombie(game, z) {
    const c = game.config;
    const headX = game.cameraX + c.leaderScreenX;
    const h = game.horde;
    if (h.length === 0) {
      z.x = headX; z.leader = true; z.jumpAtX = null; z._pending = 0;
      h.push(z);
      return;
    }
    if (z.x > headX - 4) z.x = headX - 4;
    z.leader = false;
    let i = 1;
    while (i < h.length && h[i].x >= z.x) i++;
    h.splice(i, 0, z);
    // queue any pending jump waves ahead of it
    let last = 0;
    z.jumpAtX = null; z._pending = 0;
    for (let k = 0; k < game._waves.length; k++) {
      const w = game._waves[k];
      if (w.x <= z.x) last = w.id;
      else { z.jumpAtX = w.x; z._pending = w.id; break; }
    }
    if (!z._pending) z._pending = 0;
    void last;
  }

  // ---------------------------------------------------------------- step
  function step(game, input, dt) {
    if (!game) return game;
    game.events = [];
    if (game.status !== 'running') return game;
    input = input || {};
    dt = +dt;
    if (!(dt > 0) || !isFinite(dt)) return game;
    if (dt > MAX_DT) dt = MAX_DT;
    const n = Math.max(1, Math.ceil(dt / MAX_SUB - 1e-9));
    const h = dt / n;
    for (let i = 0; i < n && game.status === 'running'; i++) substep(game, input, h, i === 0);
    return game;
  }

  function substep(game, input, h, first) {
    const c = game.config;
    game.time += h;
    // speed
    const base = Math.max(10, Math.min(c.maxSpeed, c.startSpeed + c.speedRamp * game.time));
    game._baseSpeed = base;
    while (base >= game._speedMark + 40) {
      game._speedMark += 40;
      emit(game, { type: 'speedUp', speed: Math.round(base) });
    }
    game.speed = base * (game.mutation.type === 'runner' ? c.runnerSpeedMul : 1);
    game.cameraX += game.speed * h;
    game.dist = game.cameraX;
    const headX = game.cameraX + c.leaderScreenX;

    // biome
    const bIdx = Math.floor(game.dist / c.biomeLength);
    if (bIdx !== game._biomeIdx) {
      game._biomeIdx = bIdx;
      game.biome = bIdx % 3;
      game.loop = Math.floor(bIdx / 3);
      game.stats.biomesReached++;
      emit(game, { type: 'biome', biome: game.biome, name: BIOMES[game.biome].name });
    }

    if (!game.empty && game.gen) generate(game);

    // timers
    if (game.scream.active > 0) game.scream.active = Math.max(0, game.scream.active - h);
    if (game.invuln > 0) game.invuln = Math.max(0, game.invuln - h);
    if (game._pullT > 0) game._pullT = Math.max(0, game._pullT - h);
    if (game.comboT > 0) {
      game.comboT -= h;
      if (game.comboT <= 0) { game.comboT = 0; game.combo = 0; game.multiplier = 1; }
    }

    // input
    if (first) {
      if (input.scream) doScream(game);
      if (input.jumpPressed) game._jumpBuf = Math.max(c.jumpBuffer, h * 1.01);
    }
    if (game._jumpBuf > 0) {
      const L = game.horde[0];
      if (L && L.state === 'run' && game.mutation.type !== 'crawler') {
        leaderJump(game, L);
        game._jumpBuf = 0;
      } else {
        game._jumpBuf = Math.max(0, game._jumpBuf - h);
      }
    }

    updateHorde(game, input, h, headX);
    collideObstacles(game, headX);
    updateHumans(game, h, headX);
    updateProjectiles(game, h, headX);
    updatePickups(game);
    compactHorde(game, headX);

    // mutation
    const m = game.mutation;
    if (m.type) {
      m.t -= h;
      if (m.type === 'spitter' && game.horde.length) {
        game._spitT -= h;
        if (game._spitT <= 0) {
          game._spitT = c.spitInterval;
          const L = game.horde[0];
          spawn(game, 'acid', { x: L.x + 20, y: L.y + 40, vx: c.acidSpeed + game.speed });
        }
      }
      // Crawlers dig up buried brains (they cannot bite while under)
      if (m.type === 'crawler' && !game.empty && game.horde.length) {
        game._digT -= h;
        if (game._digT <= 0) {
          game._digT = c.crawlerDigInterval;
          spawn(game, 'brain', { x: headX + 60 + game.speed * 0.15, y: 12 });
        }
      }
      if (m.t <= 0) endMutation(game);
    }

    // hurt flash
    for (let i = 0; i < game.horde.length; i++) {
      const z = game.horde[i];
      if (z.hurt > 0) z.hurt = Math.max(0, z.hurt - h);
    }

    cleanup(game);

    // stats, score, missions
    const st = game.stats;
    if (game.horde.length > st.maxHorde) st.maxHorde = game.horde.length;
    st.distance = Math.floor(game.dist);
    game.score = Math.floor(game.dist / 10) + game._bitePts + st.smashes * 50 + st.brainsCollected * 5 + game._bonusPts;
    updateMissions(game);

    if (game.horde.length === 0) {
      game.status = 'over';
      emit(game, { type: 'gameOver', score: game.score, dist: Math.floor(game.dist) });
    }
  }

  function updateMissions(game) {
    for (let i = 0; i < game.missions.length; i++) {
      const m = game.missions[i];
      if (m.done) continue;
      const def = MISSION_BY_ID[m.id];
      if (!def) continue;
      const v = statValue(game.stats, def.stat);
      const p = def.mode === 'total' ? m._base + v : Math.max(m._base, v);
      m.progress = Math.min(def.goal, Math.floor(p));
      if (p >= def.goal) {
        m.done = true;
        emit(game, { type: 'mission', text: def.text, reward: def.reward });
      }
    }
  }

  // ---------------------------------------------------------------- horde
  function findWave(game, id) {
    const ws = game._waves;
    for (let i = 0; i < ws.length; i++) if (ws[i].id === id) return ws[i];
    return null;
  }
  function nextWave(game, id) {
    const ws = game._waves;
    for (let i = 0; i < ws.length; i++) if (ws[i].id > id) return ws[i];
    return null;
  }

  function leaderJump(game, L) {
    const c = game.config;
    const w = { id: ++game._waveSeq, x: L.x, hold: 0, holding: true };
    game._waves.push(w);
    zJump(L, w.id, c);
    for (let i = 1; i < game.horde.length; i++) {
      const z = game.horde[i];
      if (z.jumpAtX === null && z.x < w.x) { z.jumpAtX = w.x; z._pending = w.id; }
    }
    emit(game, { type: 'jump', x: L.x });
  }
  function zJump(z, waveId, c) {
    z.state = 'air';
    z.vy = c.jumpVelocity;
    z._airT = 0;
    z._wave = waveId;
    z._buffered = 0;
  }

  // returns support height under x for something currently at height y; HOLE if over an open hole
  function support(game, x, y, out) {
    const c = game.config, zr = c.zombieRadius;
    const obs = game.obstacles;
    let s = 0, hole = null;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.broken) continue;
      if (o.kind === 'car') {
        if (x + zr > o.x && x - zr < o.x + o.w && y >= o.h - 2 && o.h > s) s = o.h;
      } else if (o.kind === 'hole') {
        if (x > o.x + zr * 0.5 && x < o.x + o.w - zr * 0.5) hole = o;
      }
    }
    if (s > 0) return s;
    if (hole) { if (out) out.hole = hole; return HOLE; }
    return 0;
  }
  const supOut = { hole: null };

  function canSurface(game, z) {
    const c = game.config, zr = c.zombieRadius;
    const obs = game.obstacles;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.broken) continue;
      // stay under while a jump hazard is closer than a comfortable reaction distance
      const pad = o.kind === 'barricade' && o.h > c.barricadeJumpMax ? 20 : 20 + game.speed * 0.4;
      if (z.x + zr + pad > o.x && z.x - zr - 10 < o.x + o.w) return false;
    }
    const hs = game.humans;
    const rpad = 40 + game.speed * 0.4;
    for (let i = 0; i < hs.length; i++) {
      const hm = hs[i];
      if (hm.kind === 'riot' && hm.shield && !hm._dead && hm.x - z.x < rpad && z.x - hm.x < zr + 20) return false;
    }
    return true;
  }

  function fallInHole(game, z, hole) {
    if (lose(game, z, 'hole')) {
      hole._kills++;
      if (hole._kills >= Math.max(1, Math.round(game.config.holeFill * hole.w / 150 * (1 + 1.0 * (game.time / 60 + game.loop))))) hole.broken = true;
      return true;
    }
    return false;
  }

  function landZ(game, z, s, isLeader) {
    z.y = s; z.vy = 0; z.state = 'run'; z._airT = 0;
    if (isLeader) emit(game, { type: 'land', x: z.x });
    if (z._buffered && !isLeader) {
      const id = z._buffered;
      zJump(z, id, game.config);
    }
  }

  function updateHorde(game, input, h, headX) {
    const c = game.config;
    const horde = game.horde;
    const speed = game.speed;
    const crawl = game.mutation.type === 'crawler';
    for (let i = 0; i < horde.length; i++) {
      const z = horde[i];
      if (z._dead) continue;
      // horizontal
      if (i === 0) {
        z.x = headX;
      } else {
        const target = headX - slotOffset(c, i, z);
        let vx = speed + clamp((target - z.x) * 4, -0.45 * speed, 0.6 * speed + 40);
        if (!(vx > 0)) vx = speed * 0.5;
        z.x += vx * h;
        if (z.x > headX - 4) z.x = headX - 4;
        if (z.x < game.cameraX - 600) z.x = game.cameraX - 600;
        // jump wave trigger
        if (z.jumpAtX !== null && z.x >= z.jumpAtX) {
          const wid = z._pending;
          if (z.state === 'run' && !crawl) zJump(z, wid, c);
          else if (z.state === 'air') z._buffered = wid;
          const nw = nextWave(game, wid);
          if (nw) { z._pending = nw.id; z.jumpAtX = nw.x; } else { z._pending = 0; z.jumpAtX = null; }
        }
      }
      // vertical
      const prevY = z.y;
      if (z.state === 'under') {
        z.y = 0; z.vy = 0;
        // after the Crawler ends, each zombie pops up as soon as it is not under a hazard
        if (!crawl && (i === 0 || horde[i - 1].state !== 'under') && canSurface(game, z)) z.state = 'run';
      } else if (z.state === 'air') {
        let g = c.gravity;
        if (z.vy > 0 && z._wave) {
          const w = findWave(game, z._wave);
          if (w) {
            if (i === 0 && w.holding) {
              if (input.jumpHeld && z._airT < c.jumpHoldMax) w.hold = Math.min(c.jumpHoldMax, z._airT + h);
              else w.holding = false;
            }
            if (z._airT < w.hold) g *= c.jumpHoldGravityScale;
          }
        }
        z.vy -= g * h;
        z.y += z.vy * h;
        z._airT += h;
        if (z.vy <= 0) {
          supOut.hole = null;
          const s = support(game, z.x, prevY, supOut);
          if (s === HOLE) {
            if (z.y <= 0) {
              if (game.invuln > 0) landZ(game, z, 0, i === 0);
              else fallInHole(game, z, supOut.hole);
            }
          } else if (z.y <= s) {
            landZ(game, z, s, i === 0);
          }
        }
      } else {
        supOut.hole = null;
        const s = support(game, z.x, z.y, supOut);
        if (s === HOLE) {
          if (game.invuln <= 0) fallInHole(game, z, supOut.hole);
        } else if (s < z.y - 0.5) {
          z.state = 'air'; z.vy = 0; z._airT = 1; z._wave = 0;
        } else {
          z.y = s;
        }
      }
      if (!isFinite(z.y)) { z.y = 0; z.vy = 0; z.state = crawl ? 'under' : 'run'; }
    }
    // the leader stops controlling the hold once it lands or releases
    const ws = game._waves;
    if (ws.length) {
      const L = horde[0];
      for (let k = 0; k < ws.length; k++) {
        if (ws[k].holding && (!L || L._wave !== ws[k].id || L.state !== 'air')) ws[k].holding = false;
      }
      if (ws.length > 8 || ws[0].x < game.cameraX - 500) {
        game._waves = ws.filter(function (w) { return w.holding || w.x >= game.cameraX - 500; });
        if (game._waves.length > 8) game._waves = game._waves.slice(-8);
      }
    }
  }

  function aliveCount(game) { return game.horde.length - game._deadCount; }

  function lose(game, z, cause) {
    if (z._dead) return false;
    if (game.invuln > 0) { z.hurt = 0.2; return false; }
    z._dead = true;
    game._deadCount++;
    game.stats.lost++;
    game.combo = 0; game.comboT = 0; game.multiplier = 1;
    emit(game, { type: 'lost', x: z.x, y: z.y, cause: cause });
    return true;
  }

  function smash(game, x, kind) {
    game.stats.smashes++;
    if (kind === 'barricade') game.stats.barricades++;
    emit(game, { type: 'smash', x: x, kind: kind });
  }

  function collideObstacles(game, headX) {
    const c = game.config, zr = c.zombieRadius;
    const obs = game.obstacles, horde = game.horde;
    const brute = game.mutation.type === 'brute';
    for (let k = 0; k < obs.length; k++) {
      const o = obs[k];
      if (o.kind === 'car' && !o._counted && headX > o.x + o.w) {
        o._counted = true;
        if (!o._hit && !o.broken) game.stats.carsJumped++;
      }
      if (o.broken || o.kind === 'hole') continue;
      if (o.x > headX + zr + 2) continue;
      if (o.x + o.w < game.cameraX - 700) continue;
      for (let i = 0; i < horde.length; i++) {
        const z = horde[i];
        if (z._dead || z.state === 'under') continue;
        if (!(z.x + zr > o.x && z.x - zr < o.x + o.w)) continue;
        if (o.kind === 'car') {
          if (z.y < o.h - 2) {
            if (brute) { o.broken = true; smash(game, o.x + o.w / 2, 'car'); break; }
            if (lose(game, z, 'car')) {
              o._hit = true;
              o._kills++;
              if (o._kills >= Math.round(c.carMaxKills * (1 + 1.0 * (game.time / 60 + game.loop)))) { o.broken = true; break; }
            }
          }
        } else if (o.kind === 'barricade') {
          const tall = o.h > c.barricadeJumpMax;
          if (tall || z.y < o.h) {
            if (brute || aliveCount(game) >= o.need) {
              o.broken = true;
              smash(game, o.x + o.w / 2, 'barricade');
              break;
            }
            if (lose(game, z, 'barricade')) {
              o.need = Math.max(1, o.need - c.barricadeChip);
            }
          }
        }
      }
    }
  }

  function compactHorde(game, headX) {
    const c = game.config;
    if (game._deadCount > 0) {
      game.horde = game.horde.filter(function (z) { return !z._dead; });
      game._deadCount = 0;
    }
    const joins = game._joins;
    if (joins.length) {
      for (let i = 0; i < joins.length; i++) {
        if (game.horde.length >= c.maxHorde) break;
        const j = joins[i];
        const z = makeZombie(game, j.x, 0);
        z.fromJob = j.fromJob;
        if (game.mutation.type === 'crawler') z.state = 'under';
        insertZombie(game, z);
        emit(game, { type: 'join', id: z.id, x: j.x });
      }
      game._joins = [];
    }
    const L = game.horde[0];
    if (L && !L.leader) {
      L.leader = true;
      L.x = headX;
      L.jumpAtX = null;
      L._pending = 0;
      L.hurt = 0.3;
    }
  }

  // ---------------------------------------------------------------- humans
  function bite(game, hm) {
    const c = game.config;
    if (hm._dead) return;
    hm._dead = true;
    const st = game.stats;
    st.bites++;
    game.combo = game.comboT > 0 ? game.combo + 1 : 1;
    game.comboT = c.comboWindow;
    game.multiplier = Math.min(5, 1 + Math.floor(game.combo / 5));
    game._bitePts += 10 * game.multiplier;
    game.scream.charge = Math.min(1, game.scream.charge + c.screamPerBite);
    const job = JOB_MUTATION[hm.kind] ? hm.kind : null;
    if (hm.kind === 'scientist') { game.brains += c.scientistBrains; game._bonusPts += 15; }
    if (aliveCount(game) + game._joins.length < c.maxHorde) {
      game._joins.push({ x: hm.x, fromJob: hm.kind === 'civ' ? null : hm.kind });
    }
    emit(game, { type: 'bite', x: hm.x, y: hm.y, kind: hm.kind, job: job, combo: game.combo, multiplier: game.multiplier });
    if (job) startMutation(game, JOB_MUTATION[job]);
  }

  function startMutation(game, type) {
    const c = game.config, m = game.mutation;
    if (m.type) endMutation(game);
    m.type = type;
    m.t = m.dur = Math.max(0.1, c.mutationTime);
    game.stats.mutations[type]++;
    // The contract's `{ type }` field collides with the event type, so the mutation name is in `mutation` (and `name`).
    emit(game, { type: 'mutation', mutation: type, name: type });
    if (type === 'crawler') {
      for (let i = 0; i < game.horde.length; i++) {
        const z = game.horde[i];
        z.state = 'under'; z.y = 0; z.vy = 0; z.jumpAtX = null; z._pending = 0; z._buffered = 0;
      }
      game._waves = [];
      game._jumpBuf = 0;
    }
    if (type === 'spitter') game._spitT = 0;
    if (type === 'crawler') game._digT = 0.3;
  }
  function endMutation(game) {
    const m = game.mutation;
    const type = m.type;
    if (!type) return;
    m.type = null; m.t = 0;
    if (type === 'crawler') {
      for (let i = 0; i < game.horde.length; i++) {
        const z = game.horde[i];
        if (z.state === 'under' && (i === 0 || game.horde[i - 1].state !== 'under') && canSurface(game, z)) { z.state = 'run'; z.y = 0; z.vy = 0; }
      }
    }
    emit(game, { type: 'mutationEnd', mutation: type, name: type });
  }

  function doScream(game) {
    const c = game.config;
    if (game.scream.charge < 1 - 1e-9 || !game.horde.length) return;
    game.scream.charge = 0;
    game.scream.active = c.screamStun;
    game.invuln = c.screamInvuln;
    game._pullT = c.screamStun;
    game.stats.screams++;
    const headX = game.cameraX + c.leaderScreenX;
    emit(game, { type: 'scream', x: headX });
    const left = game.cameraX - 40, right = game.cameraX + c.viewWidth + 40;
    for (let i = 0; i < game.humans.length; i++) {
      const hm = game.humans[i];
      if (hm._dead || hm.x < left || hm.x > right) continue;
      hm.state = 'stunned';
      hm._stunT = c.screamStun;
      if (hm.kind === 'riot' && hm.shield) { hm.shield = false; smash(game, hm.x, 'riot'); }
      if (hm.kind === 'soldier') hm._disarmed = true;
    }
    for (let i = 0; i < game.projectiles.length; i++) {
      const p = game.projectiles[i];
      if ((p.kind === 'bullet' || p.kind === 'cure') && p.x > left && p.x < right) p._dead = true;
    }
  }

  function updateHumans(game, h, headX) {
    const c = game.config, zr = c.zombieRadius;
    const hs = game.humans, horde = game.horde;
    const base = game._baseSpeed;
    const mt = game.mutation.type;
    const runner = mt === 'runner', brute = mt === 'brute';
    const viewR = game.cameraX + c.viewWidth;
    for (let k = 0; k < hs.length; k++) {
      const hm = hs[k];
      if (hm._dead) continue;
      hm.t += h;
      if (hm._noBite > 0) hm._noBite -= h;
      // AI
      if (hm.state === 'stunned') {
        hm._stunT -= h;
        if (hm._stunT <= 0) { hm._stunT = 0; hm.state = 'idle'; }
      } else {
        if (hm._vx) {
          hm.x += hm._vx * h;
        } else if (FLEE_KINDS[hm.kind]) {
          if (hm.state === 'idle' && hm.x - headX < c.fleeDist && hm.x > headX - 30) hm.state = 'flee';
          if (hm.state === 'flee') hm.x += base * (hm.kind === 'jogger' ? 0.55 : c.fleeSpeedFrac) * h;
          else hm.x += Math.sin(hm.t * 1.7 + hm.id) * 14 * h;
        }
        if (hm.kind === 'soldier' && !hm._disarmed) {
          if (hm.x < viewR - 20 && hm.x > headX + 40) {
            hm.cd -= h;
            if (hm.cd <= 0) {
              hm.cd = c.soldierFireInterval * (0.85 + 0.3 * game.rng()) / (1 + 0.6 * (game.time / 60 + game.loop));
              spawn(game, 'bullet', { x: hm.x - 18, y: c.bulletY, vx: -c.bulletSpeed, r: 5, _life: 4 });
            }
          }
        } else if (hm.kind === 'scientist') {
          if (hm.x < viewR - 20 && hm.x > headX + 60 && hm.x < headX + 760) {
            hm.cd -= h;
            if (hm.cd <= 0) {
              hm.cd = c.cureInterval;
              spawn(game, 'cure', { x: hm.x - 45, y: 35, vx: -70, r: c.cureRadius, _life: 2.2 });
            }
          }
        }
      }
      // pulls
      const shielded = hm.kind === 'riot' && hm.shield;
      if (!shielded && hm._noBite <= 0) {
        if (runner && hm.x > headX - 300 && hm.x - headX < c.magnetRange) {
          if (hm.x > headX) hm.x = Math.max(headX, hm.x - c.magnetSpeed * h);
        }
        if (game._pullT > 0 && hm.x > headX && hm.x < headX + c.screamPullRange) {
          hm.x = Math.max(headX, hm.x - c.screamPullSpeed * h);
        }
      }
      // contacts
      if (hm._noBite > 0 || mt === 'crawler') continue;
      const hh = hm.kind === 'riot' ? c.riotHeight : c.humanHeight;
      const reach = zr + 12;
      for (let i = 0; i < horde.length; i++) {
        const z = horde[i];
        if (z._dead || z.state === 'under') continue;
        const dx = z.x - hm.x;
        if (dx > reach) continue;
        if (dx < -reach) continue;
        if (z.y >= hh) continue;
        // touch
        if (hm.kind === 'riot' && hm.shield && hm.state !== 'stunned' && game.invuln <= 0) {
          if (brute) { hm._dead = true; smash(game, hm.x, 'riot'); break; }
          if (lose(game, z, 'riot')) {
            hm._holds++;
            if (hm._holds >= c.riotHold) hm.shield = false;
          }
          break;
        }
        if (brute && (hm.kind === 'soldier' || hm.kind === 'riot')) {
          hm._dead = true; smash(game, hm.x, hm.kind); break;
        }
        bite(game, hm);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- projectiles & pickups
  function updateProjectiles(game, h, headX) {
    const c = game.config, zr = c.zombieRadius;
    const ps = game.projectiles, horde = game.horde;
    const back = game.speed * h;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p._dead) continue;
      const prevX = p.x;
      p.x += p.vx * h;
      p.y += p.vy * h;
      p._life -= h;
      if (!isFinite(p.x) || !isFinite(p.y)) { p._dead = true; continue; }
      if (p.kind === 'bullet') {
        if (p.x < game.cameraX - 150) { p._dead = true; continue; }
        const lo = Math.min(p.x, prevX) - p.r, hi = Math.max(p.x, prevX) + p.r;
        for (let i = 0; i < horde.length; i++) {
          const z = horde[i];
          if (z._dead || z.state === 'under') continue;
          if (z.x + zr < lo || z.x - zr - back > hi) continue;
          if (z.y > c.bulletDodgeHeight) continue;
          p._dead = true;
          lose(game, z, 'bullet');
          break;
        }
      } else if (p.kind === 'acid') {
        const lo = Math.min(p.x, prevX) - p.r - 14, hi = Math.max(p.x, prevX) + p.r + 14;
        const hs = game.humans;
        for (let i = 0; i < hs.length; i++) {
          const hm = hs[i];
          if (hm._dead || hm.x < lo || hm.x > hi || hm._noBite > 0) continue;
          p._dead = true;
          if (hm.kind === 'soldier') { hm._dead = true; smash(game, hm.x, 'soldier'); }
          else if (hm.kind === 'riot' && hm.shield) { hm.shield = false; smash(game, hm.x, 'riot'); }
          else bite(game, hm);
          break;
        }
      } else if (p.kind === 'cure') {
        for (let i = 0; i < horde.length; i++) {
          const z = horde[i];
          if (z._dead || z.state === 'under') continue;
          if (Math.abs(z.x - p.x) > p.r || z.y > c.cureHeight) continue;
          if (lose(game, z, 'cure')) {
            spawn(game, 'civ', { x: z.x, state: 'flee', _vx: -170, _noBite: 1.6, lane: z.lane });
            p._hits++;
            if (p._hits >= c.cureKills + Math.floor((game.time / 60 + game.loop) / 2.5)) { p._dead = true; break; }
          }
        }
      }
      if (p._life <= 0) p._dead = true;
    }
    void headX;
  }

  function updatePickups(game) {
    const c = game.config;
    const r = c.brainRange, r2 = r * r;
    const ps = game.pickups, horde = game.horde;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p.taken) continue;
      for (let i = 0; i < horde.length; i++) {
        const z = horde[i];
        if (z._dead) continue;
        const dx = z.x - p.x;
        if (dx > r || dx < -r) continue;
        // crawlers snatch brains from below at any height (keeps the crawler window eventful)
        const dy = z.state === 'under' ? 0 : z.y + 30 - p.y;
        if (dx * dx + dy * dy <= r2) {
          p.taken = true;
          game.brains++;
          game.stats.brainsCollected++;
          emit(game, { type: 'brain', x: p.x, y: p.y });
          break;
        }
      }
    }
  }

  function cleanup(game) {
    const c = game.config;
    const behind = game.cameraX - c.viewWidth;
    const ahead = game.cameraX + c.viewWidth * 3;
    let hs = game.humans, keep = true;
    for (let i = 0; i < hs.length; i++) if (hs[i]._dead || hs[i].x < behind) { keep = false; break; }
    if (!keep) game.humans = hs.filter(function (o) { return !o._dead && o.x >= behind; });
    const os = game.obstacles;
    for (let i = 0; i < os.length; i++) if (os[i].x + os[i].w < behind) { game.obstacles = os.filter(function (o) { return o.x + o.w >= behind; }); break; }
    const ps = game.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p._dead || p.x < behind || p.x > ahead) { game.projectiles = ps.filter(function (o) { return !o._dead && o.x >= behind && o.x <= ahead; }); break; }
    }
    const pk = game.pickups;
    for (let i = 0; i < pk.length; i++) if (pk[i].taken || pk[i].x < behind) { game.pickups = pk.filter(function (o) { return !o.taken && o.x >= behind; }); break; }
  }

  // ---------------------------------------------------------------- generation
  function generate(game) {
    const c = game.config, g = game.gen;
    const limit = game.cameraX + c.viewWidth * 2.6;
    let guard = 0;
    while (g.nextX < limit && guard++ < 30) genChunk(game);
  }

  function ri(game, a, b) { return a + Math.floor(game.rng() * (b - a + 1)); }
  function rf(game, a, b) { return a + game.rng() * (b - a); }

  function genChunk(game) {
    const c = game.config, g = game.gen;
    const headX = game.cameraX + c.leaderScreenX;
    const x0 = g.nextX;
    const bs = Math.max(50, game._baseSpeed);
    const tArr = game.time + Math.max(0, x0 - headX) / bs;
    const sp = Math.max(60, Math.min(c.maxSpeed, c.startSpeed + c.speedRamp * tArr));
    const segIdx = Math.floor(Math.max(0, x0 - c.leaderScreenX) / c.biomeLength);
    const biome = segIdx % 3, loop = Math.floor(segIdx / 3);
    const d = tArr / 60 + loop;
    const ctx = { x0: x0, sp: sp, d: d, biome: biome, loop: loop };
    g.chunkHumans = 0;
    let end;
    if (x0 < g.safeX) {
      ctx.intro = true;
      end = tplCrowd(game, ctx, g.chunks > 0);
      if (end > g.safeX && g.jumpFree < g.safeX) g.jumpFree = g.safeX;
    } else {
      if (g.jumpFree < g.safeX) g.jumpFree = g.safeX;
      const w = [
        ['crowd', Math.max(0.3, 1.4 - 0.3 * d)],
        ['car', 2],
        ['hole', 1.4 + 0.25 * d],
        ['barricade', 1.1 + 0.25 * d],
        ['soldier', d >= 0.4 ? (0.8 + 1.0 * d) * (biome === 2 ? 1.8 : 1) : 0],
        ['riot', d >= 0.7 ? 0.5 + 0.3 * d : 0],
        ['scientist', (biome === 2 || loop >= 1) && d >= 0.5 ? (biome === 2 ? 1.5 : 0.6) * (1 + 0.15 * d) : 0],
        ['mixed', d >= 1 ? 0.3 + 0.3 * d : 0]
      ];
      let tot = 0;
      for (let i = 0; i < w.length; i++) { if (w[i][0] === g.last && w[i][0] !== 'crowd') w[i][1] *= 0.4; tot += w[i][1]; }
      let r = game.rng() * tot, pick = 'crowd';
      for (let i = 0; i < w.length; i++) { r -= w[i][1]; if (r <= 0) { pick = w[i][0]; break; } }
      // tutorial order: first a barricade you can smash, then a car to jump
      g.hazards = (g.hazards || 0) + 1;
      if (g.hazards === 1) { pick = 'barricade'; ctx.easy = true; }
      else if (g.hazards === 2) pick = 'car';
      else if (g.hazards === 3) pick = 'crowd';
      g.last = pick;
      end = TEMPLATES[pick](game, ctx);
    }
    g.recent = [g.chunkHumans, g.recent[0]];
    g.chunks++;
    if (!(end > x0)) end = x0 + sp;
    g.nextX = end;
  }

  function addHuman(game, kind, x, extra) {
    const o = { x: x, lane: ri(game, 0, 2), t: game.rng() * 6 };
    if (extra) Object.assign(o, extra);
    game.gen.chunkHumans++;
    return spawn(game, kind, o);
  }

  function placeCrowd(game, ctx, x, n, allowSpecial) {
    const c = game.config, g = game.gen;
    let px = x;
    for (let k = 0; k < n; k++) {
      addHuman(game, 'civ', px);
      px += rf(game, 16, 34);
    }
    if (allowSpecial && x - g.lastSpecialX > ctx.sp * Math.max(3, c.mutationTime) * 1.8 && game.rng() < c.specialChance) {
      g.lastSpecialX = x;
      px += 30;
      addHuman(game, JOBS[ri(game, 0, JOBS.length - 1)], px);
      px += 20;
    }
    return px;
  }

  function crowdChance(ctx) { return clamp(0.4 - 0.07 * ctx.d, 0.05, 0.4); }
  function smallCrowd(game, ctx) { return ri(game, 3, 4); }
  function crowdSize(game, ctx) { return ri(game, 3, 6 + Math.min(2, Math.floor(ctx.d))); }

  function markJump(game, ctx, start, end) {
    const c = game.config, g = game.gen;
    // worst case: a full held jump taken at the hazard edge, possibly at Runner speed
    const sp = ctx.sp * Math.max(1, c.runnerSpeedMul);
    const land = Math.max(start + g.airHold * sp, end + 0.3 * sp);
    g.jumpFree = Math.max(g.jumpFree, land + c.fairGap * sp * 1.1 + 2 * c.zombieRadius);
  }

  function brainArc(game, ctx, sx, held) {
    const c = game.config, g = game.gen;
    const air = airTimes(c);
    const T = held ? g.airHold : g.airTap;
    for (let k = 1; k <= 5; k++) {
      const t = T * k / 6;
      spawn(game, 'brain', { x: sx + ctx.sp * t, y: jumpY(c, air, t, held) + 30 });
    }
  }
  function brainLine(game, x, n) {
    for (let k = 0; k < n; k++) spawn(game, 'brain', { x: x + k * 42, y: 30 });
    return x + n * 42;
  }

  function tplCrowd(game, ctx, allowSpecial) {
    const sp = ctx.sp;
    const n = ctx.intro ? ri(game, 4, 6) : crowdSize(game, ctx);
    let x = placeCrowd(game, ctx, ctx.x0 + sp * rf(game, ctx.intro ? 0.6 : 0.3, ctx.intro ? 0.9 : 0.55), n, allowSpecial !== false);
    if (game.rng() < 0.5) x = brainLine(game, x + 60, 3);
    return x + sp * rf(game, 0.4, 0.65);
  }

  function tplCar(game, ctx, noCrowd) {
    const g = game.gen, sp = ctx.sp;
    const start = Math.max(ctx.x0 + sp * 0.5, g.jumpFree);
    const w = rf(game, 180, 230);
    spawn(game, 'car', { x: start, w: w, h: 80 });
    brainArc(game, ctx, start - sp * 0.25, false);
    markJump(game, ctx, start, start + w);
    let end = start + w + sp * 0.3;
    if (!noCrowd && game.rng() < crowdChance(ctx)) end = placeCrowd(game, ctx, start + w + sp * rf(game, 0.4, 0.6), smallCrowd(game, ctx), true);
    return end + sp * 0.3;
  }

  function tplHole(game, ctx, noCrowd) {
    const g = game.gen, sp = ctx.sp;
    const start = Math.max(ctx.x0 + sp * 0.5, g.jumpFree);
    const maxW = Math.max(90, Math.min(200, sp * 0.48));
    const w = rf(game, 90, maxW);
    spawn(game, 'hole', { x: start, w: w });
    brainArc(game, ctx, start + w / 2 - sp * g.airHold / 2, true);
    markJump(game, ctx, start, start + w);
    let end = start + w + sp * 0.3;
    if (!noCrowd && game.rng() < crowdChance(ctx)) end = placeCrowd(game, ctx, start + w + sp * rf(game, 0.45, 0.65), smallCrowd(game, ctx), true);
    return end + sp * 0.3;
  }

  function tplBarricade(game, ctx) {
    const c = game.config, g = game.gen, sp = ctx.sp, d = ctx.d;
    const cEnd = placeCrowd(game, ctx, ctx.x0 + sp * rf(game, 0.2, 0.35), smallCrowd(game, ctx) + 1, true);
    const bx = Math.max(cEnd + sp * rf(game, 0.6, 0.9), g.jumpFree);
    const prior = g.recent[0] + g.recent[1];
    // fairness: cap by the difficulty *now* (never above what it will be when the horde arrives)
    const maxNeed = Math.floor(4 + 3 * Math.min(d, game.time / 60 + game.loop));
    let tall = !ctx.easy && d >= 0.25 && prior >= 6 && game.rng() < 0.4 + 0.1 * d;
    if (tall) {
      const lo = Math.min(maxNeed, Math.max(3, Math.floor(2 + 1.5 * d)));
      const need = ri(game, lo, maxNeed);
      spawn(game, 'barricade', { x: bx, w: 44, h: 170, need: need });
      g.jumpFree = Math.max(g.jumpFree, bx + 44 + sp * 0.7);
    } else {
      const need = ctx.easy ? 3 : ri(game, 2, Math.floor(5 + 3 * d));
      spawn(game, 'barricade', { x: bx, w: 40, h: 100, need: need });
      markJump(game, ctx, bx, bx + 40);
    }
    void c;
    return bx + 44 + sp * 0.45;
  }

  function tplSoldier(game, ctx) {
    const sp = ctx.sp, d = ctx.d;
    const cEnd = placeCrowd(game, ctx, ctx.x0 + sp * rf(game, 0.2, 0.35), smallCrowd(game, ctx), true);
    let x = cEnd + sp * rf(game, 0.8, 1.1);
    const n = Math.min(6, 1 + Math.floor(d / 0.7));
    for (let k = 0; k < n; k++) { addHuman(game, 'soldier', x); x += 55; }
    return x + sp * 0.4;
  }

  function tplRiot(game, ctx, noCrowd) {
    const g = game.gen, sp = ctx.sp, d = ctx.d;
    const start = Math.max(ctx.x0 + sp * 0.5, g.jumpFree);
    const n = Math.min(4, 2 + (d > 1.2 ? 1 : 0) + (d > 2.5 ? 1 : 0));
    for (let k = 0; k < n; k++) addHuman(game, 'riot', start + k * 30);
    const end = start + (n - 1) * 30;
    brainArc(game, ctx, (start + end) / 2 - sp * g.airHold / 2, true);
    markJump(game, ctx, start - 15, end + 15);
    let x = end + sp * 0.3;
    if (!noCrowd && game.rng() < crowdChance(ctx)) x = placeCrowd(game, ctx, end + sp * rf(game, 0.5, 0.7), smallCrowd(game, ctx), true);
    return x + sp * 0.3;
  }

  function tplScientist(game, ctx) {
    const sp = ctx.sp;
    const cEnd = placeCrowd(game, ctx, ctx.x0 + sp * rf(game, 0.2, 0.35), smallCrowd(game, ctx), true);
    const sx = cEnd + sp * rf(game, 0.8, 1.0);
    addHuman(game, 'scientist', sx);
    let x = sx + 40;
    if (game.rng() < 0.6) x = placeCrowd(game, ctx, sx + sp * 0.4, ri(game, 2, 4), false);
    return x + sp * 0.4;
  }

  function tplMixed(game, ctx) {
    const a = game.rng();
    let x;
    if (a < 0.4) x = tplHole(game, ctx, true);
    else if (a < 0.7) x = tplRiot(game, ctx, true);
    else x = tplCar(game, ctx, true);
    const ctx2 = { x0: x, sp: ctx.sp, d: ctx.d, biome: ctx.biome, loop: ctx.loop };
    return game.rng() < 0.5 ? tplCar(game, ctx2, false) : tplHole(game, ctx2, false);
  }

  const TEMPLATES = {
    crowd: tplCrowd, car: tplCar, hole: tplHole, barricade: tplBarricade, soldier: tplSoldier,
    riot: tplRiot, scientist: tplScientist, mixed: tplMixed
  };

  // ---------------------------------------------------------------- export
  const ZSim = {
    CONFIG: CONFIG,
    BIOMES: BIOMES,
    UPGRADES: UPGRADES,
    MISSION_POOL: MISSION_POOL,
    JOB_MUTATION: JOB_MUTATION,
    defaultSave: defaultSave,
    normalizeSave: normalizeSave,
    buyUpgrade: buyUpgrade,
    createGame: createGame,
    step: step,
    finishRun: finishRun,
    rng: rng,
    spawn: spawn,
    airTimes: airTimes
  };
  root.ZSim = ZSim;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZSim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
