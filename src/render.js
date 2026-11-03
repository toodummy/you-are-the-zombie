/* ZRender: draws a ZSim game state on a 1280x720 logical canvas.
   Never mutates game logic state. Particles, popups, shake and banners live here. */
(function (root) {
  'use strict';

  const W = 1280, H = 720, GROUND = 560, LANE_GAP = 18, STEP = 1 / 60, TAU = Math.PI * 2;
  const INK = '#17121F', BONE = '#F4EFD8', ACID = '#C6F135', CORAL = '#FF5A3C', TEAL = '#5CC8C2';
  const LILAC = '#B9A3F0', GOLD = '#FFC15C', PINK = '#FF8FB8', SKIN = '#A5C46A';
  const MUT = {
    runner: { name: 'RUNNER', sub: 'Faster, and people get pulled in', color: '#FF8A4C', tint: 'rgba(255,138,76,0.10)' },
    brute: { name: 'BRUTE', sub: 'Smash everything in the way', color: CORAL, tint: 'rgba(120,20,30,0.16)' },
    spitter: { name: 'SPITTER', sub: 'Acid melts soldiers and shields', color: ACID, tint: 'rgba(198,241,53,0.10)' },
    crawler: { name: 'CRAWLER', sub: 'Underground: bullets and holes miss you', color: GOLD, tint: 'rgba(90,58,42,0.18)' }
  };
  const JOB_MUT = { jogger: 'runner', bouncer: 'brute', chef: 'spitter', plumber: 'crawler' };

  /* ---------- tiny helpers ---------- */
  let g = null; // context the sprite helpers draw on (main canvas or a bake canvas)
  const FD = {}, FB = {};
  function fd(n) { return FD[n] || (FD[n] = n + 'px "Bowlby One", Impact, "Arial Black", sans-serif'); }
  function fb(n) { return FB[n] || (FB[n] = '700 ' + n + 'px "Space Grotesk", "Trebuchet MS", Arial, sans-serif'); }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hash(i) {
    let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const pathCache = new Map();
  function P(d) {
    let p = pathCache.get(d);
    if (p === undefined) { p = typeof Path2D !== 'undefined' ? new Path2D(d) : null; pathCache.set(d, p); }
    return p;
  }
  function F(d, fill) { const p = P(d); if (!p) return; g.fillStyle = fill; g.fill(p); g.lineWidth = 6; g.strokeStyle = INK; g.stroke(p); }
  function N(d, fill) { const p = P(d); if (!p) return; g.fillStyle = fill; g.fill(p); }
  function S(d) { const p = P(d); if (!p) return; g.lineWidth = 4; g.strokeStyle = INK; g.stroke(p); }
  function O(x, y, r, fill, line) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill();
    if (line) { g.lineWidth = 6; g.strokeStyle = INK; g.stroke(); }
  }
  function E(x, y, rx, ry, fill) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = fill; g.fill();
    g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  }
  function L2(x1, y1, x2, y2, c, w) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokeStyle = INK; g.lineWidth = w + 11; g.stroke();
    g.strokeStyle = c; g.lineWidth = w; g.stroke();
  }
  function L3(x1, y1, x2, y2, x3, y3, c, w) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3);
    g.strokeStyle = INK; g.lineWidth = w + 11; g.stroke();
    g.strokeStyle = c; g.lineWidth = w; g.stroke();
  }
  function T(x, y) { g.save(); g.translate(x, y); }
  function box(x, y, w, h, fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); g.lineWidth = 6; g.strokeStyle = INK; g.strokeRect(x, y, w, h); }
  function outlined(text, x, y, fill, lw) {
    g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = INK; g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  }

  /* ---------- sprites (concept-art units: ~300 wide, feet at y 420) ---------- */
  function heroSprite(t, moving, atk, skin, gown, leader) {
    const s = Math.sin(t), c = Math.cos(t), sw = moving ? 26 : 0;
    const up1 = moving ? Math.max(0, c) * 16 : 0, up2 = moving ? Math.max(0, -c) * 16 : 0;
    L2(128, 335, 122 + s * sw, 406 - up1, skin, 22);
    L2(178, 335, 186 - s * sw, 406 - up2, skin, 22);
    T(s * sw, -up1); F('M102 422 Q104 398 124 398 Q142 400 142 422 Z', skin); g.restore();
    T(-s * sw, -up2); F('M168 422 Q170 398 188 398 Q212 402 212 422 Z', skin); g.restore();
    L3(98, 222, 68 - s * 8, 262, 64 - s * 14, 322, skin, 22);
    T(-s * 14, 0); F('M46 318 Q64 304 84 318 L80 346 L72 336 L66 352 L58 336 L50 346 Z', skin); g.restore();
    F('M100 196 Q150 176 200 196 L226 336 L204 350 L186 334 L166 356 L146 336 L122 354 L100 336 L78 348 Z', gown);
    N('M168 188 Q190 190 197 196 L223 336 L204 346 L186 331 L178 340 Q196 260 168 188 Z', 'rgba(23,18,31,.22)');
    if (leader) { g.fillStyle = INK; g.font = fd(60); g.textAlign = 'center'; g.fillText('0', 150, 298); }
    const r = atk ? 34 : s * 6;
    L3(198, 222, 250 + r * 0.5, 226, 288 + r, 206, skin, 22);
    if (leader) { T(r * 0.6, 0); F('M246 204 L266 200 L272 232 L252 236 Z', CORAL); g.restore(); }
    T(r, 0); F('M276 190 L312 178 L304 194 L326 194 L306 208 L320 222 L282 222 Z', skin); g.restore();
    const bob = moving ? Math.abs(s) * -6 : 0;
    T(0, bob);
    F('M72 112 Q66 30 150 26 Q238 28 234 116 Q232 176 192 186 L112 186 Q76 176 72 112 Z', skin);
    N('M196 38 Q236 60 231 116 Q229 174 192 183 L160 183 Q220 140 196 38 Z', 'rgba(23,18,31,.22)');
    S('M130 28 Q120 8 104 10 M152 26 Q152 4 168 2 M174 30 Q188 14 204 20');
    S('M84 78 L126 60 M92 66 L98 82 M104 60 L110 76 M116 54 L122 70');
    if (atk) {
      F('M92 86 L150 112 L92 124 Z', CORAL); F('M214 86 L160 112 L214 124 Z', CORAL);
      F('M92 140 H216 V206 H92 Z', '#3A1226');
      N('M92 140 L108 166 L124 140 L140 166 L156 140 L172 166 L188 140 L204 166 L216 140 Z', BONE);
      N('M92 206 L108 182 L124 206 L140 182 L156 206 L172 182 L188 206 L204 182 L216 206 Z', BONE);
    } else {
      O(122, 108, 32, BONE, true); O(130, 112, 9, INK);
      O(192, 112, 18, BONE, true); O(190, 116, 5, INK);
      F('M104 156 Q150 146 206 154 Q204 206 156 214 Q112 210 104 156 Z', '#3A1226');
      N('M128 198 Q150 180 176 198 Q152 212 128 198 Z', CORAL);
      N('M118 154 L128 172 L138 152 Z M160 151 L170 167 L180 152 Z', BONE);
    }
    g.restore();
  }
  function runnerSprite(t, atk) {
    const s = Math.sin(t) * 30, skin = '#B7B98A';
    L3(130, 270, 70 - s, 320, 40 - s, 296 - s * 0.4, skin, 13);
    L3(140, 170, 80, 214 + s * 0.4, 60, 180 + s * 0.4, skin, 13);
    L3(146, 276, 194 + s * 0.6, 330, 172 + s, 396, skin, 13);
    T(s, 0); F('M150 392 L196 392 L208 414 L150 414 Z', CORAL); g.restore();
    F('M120 150 L198 130 L172 280 L116 280 Z', CORAL);
    F('M114 262 L172 262 L178 300 L146 304 L138 286 L122 304 L100 296 Z', '#2F6FB0');
    L3(184, 160, 244, 206 - s * 0.3, 288 + (atk ? 24 : 0), 182 - s * 0.3, skin, 13);
    E(226, 100, 50, 54, skin);
    F('M178 84 L274 74 L276 96 L178 106 Z', BONE);
    O(244, 120, 12, BONE, true); O(248, 122, 4, INK);
    F('M210 136 L270 132 L262 162 L222 164 Z', '#3A1226');
  }
  function bruteSprite(t, atk) {
    const s = Math.sin(t) * 12, skin = '#9FB26C', k = atk ? -60 : 0;
    T(s, 0); F('M96 320 L150 320 L146 400 L88 400 Z', '#2B2540'); F('M78 400 H150 V420 H72 Z', INK); g.restore();
    T(-s, 0); F('M160 320 L214 320 L222 400 L164 400 Z', '#2B2540'); F('M160 400 H232 L238 420 H160 Z', INK); g.restore();
    F('M40 160 Q150 96 260 160 L232 334 L80 334 Z', '#2B2540');
    g.fillStyle = BONE; g.font = fd(24); g.textAlign = 'center'; g.fillText('SECURITY', 150, 248);
    L3(60, 180, 12, 244, 32, 322 + k + s, skin, 60); L3(240, 180, 288, 244, 268 + (k ? 30 : 0), 322 + k - s, skin, 60);
    O(32, 344 + k + s, 40, skin, true); O(268 + (k ? 30 : 0), 344 + k - s, 40, skin, true);
    F('M116 72 Q150 46 184 72 L190 136 L110 136 Z', skin);
    O(134, 92, 6, INK); O(166, 92, 6, INK);
    S('M122 80 L142 86 M178 80 L158 86');
    F('M126 134 L134 112 L144 134 Z', BONE); F('M156 134 L166 112 L174 134 Z', BONE);
  }
  function spitterSprite(t, atk) {
    const s = Math.sin(t) * 18, skin = '#B5B079', p = atk ? 8 : 0;
    L2(130, 320, 122 + s, 400, skin, 13); L2(170, 320, 180 - s, 400, skin, 13);
    T(s, 0); F('M98 396 H136 V414 H94 Z', INK); g.restore();
    T(-s, 0); F('M166 396 H206 L210 414 H166 Z', INK); g.restore();
    F('M100 196 L200 196 L212 334 L90 334 Z', BONE);
    O(136, 252, 6, INK); O(136, 292, 6, INK);
    L3(104, 212, 72, 262, 86, 306, skin, 13);
    O(172, 178, 64 + p, ACID, true); O(192, 160, 16, '#EEFFA6'); O(150, 200, 9, '#EEFFA6');
    E(150, 90, 58, 48, skin);
    F('M100 58 Q82 22 120 20 Q132 -10 170 8 Q214 6 202 58 Z', BONE);
    O(126, 88, 15, BONE, true); O(130, 90, 5, INK);
    F('M170 80 L216 66 L216 122 L166 110 Z', '#3A1226');
  }
  function crawlerSprite(t) {
    const s = Math.sin(t) * 22, skin = '#A9B884';
    L3(92, 290, 50, 340 - s * 0.4, 84 + s, 390, skin, 13);
    L3(124, 292, 100, 350 + s * 0.4, 134 - s, 392, skin, 13);
    F('M60 300 Q60 220 150 214 Q230 214 236 300 Z', '#2F6FB0');
    S('M100 216 L104 300 M178 218 L176 300');
    L3(196, 276, 216, 334 - s * 0.4, 196 - s, 396, skin, 13);
    L3(226, 268, 280, 324 + s * 0.4, 256 + s, 398, skin, 13);
    E(250, 236, 52, 46, skin);
    F('M202 214 Q250 160 298 212 L322 220 L298 228 L206 228 Z', CORAL);
    O(232, 238, 9, BONE, true); O(270, 238, 9, BONE, true);
    F('M216 256 L288 254 L278 276 L226 278 Z', '#3A1226');
  }
  const JOBS = {
    civ: { shirt: GOLD, legs: '#3E6FA8', label: '' },
    jogger: { shirt: CORAL, legs: '#2F6FB0', label: 'JOGGER' },
    bouncer: { shirt: '#2B2540', legs: '#2B2540', label: 'BOUNCER' },
    chef: { shirt: BONE, legs: '#55606E', label: 'CHEF' },
    plumber: { shirt: '#2F6FB0', legs: '#2F6FB0', label: 'PLUMBER' }
  };
  const SHIRTS = [GOLD, '#E07A9A', '#7FB0D8', '#C8925A'];
  function civSprite(job, tone, hair, shirtAlt, t, moving, stunned) {
    const j = JOBS[job] || JOBS.civ, s = moving ? Math.sin(t) * 28 : 0, skin = tone;
    const shirt = job === 'civ' ? shirtAlt : j.shirt;
    L3(136, 280, 120 - s, 340, 104 - s, 400, j.legs, 22);
    L3(166, 280, 186 + s, 340, 200 + s, 400, j.legs, 22);
    F('M110 150 L190 150 L186 292 L114 292 Z', shirt);
    if (job === 'plumber') F('M124 150 H176 V200 H124 Z', '#2F6FB0');
    const up = moving || stunned ? 0 : 60;
    L3(116, 166, 60, 112 + up, 50, 54 + up * 1.9, skin, 22);
    L3(186, 166, 240, 104 + up, 256, 48 + up * 2, skin, 22);
    E(150, 98, 48, 52, skin);
    F('M100 92 Q96 36 150 38 Q204 36 200 92 Q176 66 150 72 Q124 66 100 92 Z', hair);
    if (job === 'jogger') F('M100 66 L200 66 L200 84 L100 84 Z', BONE);
    if (job === 'chef') F('M100 58 Q82 22 120 20 Q132 -10 170 8 Q214 6 202 58 Z', BONE);
    if (job === 'plumber') F('M100 62 Q150 10 200 62 L232 68 L200 76 L104 76 Z', CORAL);
    if (job === 'bouncer') { g.fillStyle = BONE; g.font = fd(20); g.textAlign = 'center'; g.fillText('STAFF', 150, 226); }
    O(130, 102, 13, BONE, true); O(130, 102, 3, INK);
    O(170, 102, 13, BONE, true); O(170, 102, 3, INK);
    E(150, 130, 13, moving ? 16 : 10, '#3A1226');
  }
  function copSprite(t, moving, shield, stunned) {
    const s = moving ? Math.sin(t) * 14 : 0;
    T(s, 0); F('M100 320 H148 V400 H96 Z', '#2B3A55'); F('M90 398 H150 V418 H86 Z', INK); g.restore();
    T(-s, 0); F('M156 320 H204 L208 400 H156 Z', '#2B3A55'); F('M154 398 H212 L216 418 H154 Z', INK); g.restore();
    F('M92 170 L208 170 L214 326 L86 326 Z', '#2B3A55');
    F('M254 112 L280 18 L294 22 L268 116 Z', INK);
    L3(202, 190, 248, 170, 260, 104, '#2B3A55', 22);
    O(150, 106, 56, '#1E2A40', true);
    F('M100 94 H200 V136 Q150 152 100 136 Z', '#8FD0E0');
    O(130, 114, 5, INK); O(170, 114, 5, INK);
    if (shield) {
      T(0, stunned ? 70 : 0);
      g.globalAlpha *= 0.92; F('M16 170 H176 V404 Q96 430 16 404 Z', '#BFE3EE'); g.globalAlpha /= 0.92;
      N('M36 190 H76 L36 280 Z', BONE);
      g.fillStyle = INK; g.font = fd(40); g.textAlign = 'center'; g.fillText('RIOT', 96, 304);
      g.restore();
    }
  }
  function soldierSprite(flash, stunned) {
    F('M100 310 H148 L146 400 H98 Z', '#5F6B3A'); F('M156 310 H204 L208 400 H158 Z', '#5F6B3A');
    F('M90 396 H150 V418 H86 Z', INK); F('M154 396 H214 L218 418 H154 Z', INK);
    F('M94 170 L206 170 L210 320 L90 320 Z', '#5F6B3A'); F('M106 178 H194 V290 H106 Z', '#3E4728');
    if (stunned) {
      L3(104, 192, 70, 130, 60, 70, '#5F6B3A', 22); L3(196, 192, 230, 130, 240, 70, '#5F6B3A', 22);
    } else {
      L3(104, 192, 124, 232, 172, 226, '#5F6B3A', 22);
      F('M52 212 H262 V228 H192 L184 262 H160 L166 228 H52 Z', INK);
      if (flash) F('M264 220 L294 204 L286 218 L302 224 L286 230 L292 246 Z', GOLD);
    }
    O(150, 110, 50, '#3E4728', true);
    F('M92 96 Q92 36 150 36 Q208 36 208 96 L226 104 H74 Z', '#5F6B3A');
    O(126, 122, 15, CORAL, true); O(174, 122, 15, CORAL, true); O(150, 152, 17, '#8A8F72', true);
  }
  function sciSprite(t, moving) {
    const s = moving ? Math.sin(t) * 10 : 0;
    g.beginPath();
    if (g.roundRect) g.roundRect(34, 170, 66, 150, 28); else g.rect(34, 170, 66, 150);
    g.fillStyle = TEAL; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    T(s, 0); F('M122 392 H176 V416 H118 Z', INK); g.restore();
    T(-s, 0); F('M182 392 H234 L238 416 H182 Z', INK); g.restore();
    F('M100 160 Q150 140 200 160 L226 330 L226 396 H180 L168 330 L168 396 H122 L88 330 Z', '#F2C53C');
    F('M112 214 H124 V202 H138 V214 H150 V228 H138 V240 H124 V228 H112 Z', TEAL);
    F('M178 222 L270 200 L274 214 L182 236 Z', INK);
    L3(196, 180, 214, 222, 196, 230, '#F2C53C', 22);
    E(150, 100, 66, 68, '#F2C53C'); E(158, 100, 44, 38, '#BFE3EE');
    g.beginPath(); g.ellipse(158, 108, 28, 26, 0, 0, TAU); g.fillStyle = '#8A5A3C'; g.fill();
    O(146, 104, 4, INK); O(172, 104, 4, INK);
  }
  const BRAIN_D = 'M10 30 Q4 12 22 9 Q28 0 40 5 Q56 2 57 20 Q66 33 54 44 Q50 57 33 53 Q18 59 12 47 Q1 41 10 30 Z';
  const BRAIN_FOLDS = 'M31 7 Q25 20 32 30 Q39 41 31 53 M18 19 Q25 26 18 35 M45 15 Q38 23 47 32 M21 44 Q27 40 25 33';
  const HEAD_D = 'M72 112 Q66 30 150 26 Q238 28 234 116 Q232 176 192 186 L112 186 Q76 176 72 112 Z';
  function zombieHead(x, y, s) {
    T(x, y); g.scale(s, s); g.translate(-150, -110);
    F(HEAD_D, SKIN);
    O(122, 108, 32, BONE, true); O(130, 112, 9, INK);
    O(192, 112, 18, BONE, true); O(190, 116, 5, INK);
    F('M104 156 Q150 146 206 154 Q204 206 156 214 Q112 210 104 156 Z', '#3A1226');
    N('M118 154 L128 172 L138 152 Z M160 151 L170 167 L180 152 Z', BONE);
    g.restore();
  }
  function brainShape(x, y, s) {
    T(x, y); g.scale(s, s); g.translate(-31, -30);
    const p = P(BRAIN_D);
    if (p) { g.fillStyle = PINK; g.fill(p); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(p); }
    const f = P(BRAIN_FOLDS); if (f) { g.lineWidth = 3; g.strokeStyle = '#B04A78'; g.stroke(f); }
    g.restore();
  }

  /* ---------- baked zombie sets: each a sprite at a fixed scale, 8 run frames ---------- */
  const FRAMES = 8;
  const BOX_X = -60, BOX_Y = -60, BOX_W = 440, BOX_H = 510, ANCHOR_X = 150, ANCHOR_Y = 420;
  const FOLLOW_SKINS = ['#A5C46A', '#B7B98A', '#A9B884'], FOLLOW_GOWNS = ['#9CC3C6', '#C7B9D8', '#B8C3A0'];
  const SETS = [
    { s: 0.3, draw: t => heroSprite(t, true, false, FOLLOW_SKINS[0], FOLLOW_GOWNS[0], false) },  // 0..2 followers
    { s: 0.3, draw: t => heroSprite(t, true, false, FOLLOW_SKINS[1], FOLLOW_GOWNS[1], false) },
    { s: 0.3, draw: t => heroSprite(t, true, false, FOLLOW_SKINS[2], FOLLOW_GOWNS[2], false) },
    { s: 0.42, draw: t => heroSprite(t, true, false, SKIN, '#9CC3C6', true) },                   // 3 leader
    { s: 0.42, draw: t => heroSprite(t, true, true, SKIN, '#9CC3C6', true) },                    // 4 leader biting
    { s: 0.5, draw: t => heroSprite(t, true, false, SKIN, '#9CC3C6', true), tint: 'rgba(60,10,30,0.32)' }, // 5 leader brute
    { s: 0.3, draw: t => runnerSprite(t, false) },                                                // 6 runner
    { s: 0.4, draw: t => heroSprite(t, true, true, '#8FA85A', '#5A4A6E', false), tint: 'rgba(50,8,24,0.30)' }, // 7 brute: bigger, darker, jaws open
    { s: 0.3, draw: t => spitterSprite(t, false) },                                               // 8 spitter
    { s: 0.3, draw: t => crawlerSprite(t) },                                                      // 9 crawler
    { s: 0.36, draw: t => bruteSprite(t, false), tint: 'rgba(40,8,30,0.22)' }                     // 10 brute bouncer (1 in 4)
  ];
  const SET_LEADER = 3, SET_LEADER_ATK = 4, SET_LEADER_BRUTE = 5, SET_RUNNER = 6, SET_BRUTE = 7, SET_SPIT = 8, SET_CRAWL = 9;

  function makeCanvas(w, h) {
    try {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
      if (typeof document !== 'undefined' && document.createElement) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
      }
    } catch (e) { /* baking is optional */ }
    return null;
  }

  /* ---------- renderer ---------- */
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let k = 1;              // backing pixels per logical pixel
    let q = 1;              // bake quality
    let canBake = true;
    let bakes = [];         // bakes[set][frame] -> canvas | null
    let glowImg = null, shadowImg = null;
    let reduced = false, best = 0;
    const self = {};

    function resetBakes() {
      bakes = SETS.map(() => new Array(FRAMES).fill(undefined));
      glowImg = undefined; shadowImg = undefined;
    }
    resetBakes();

    function bake(set, frame) {
      const row = bakes[set];
      let c = row[frame];
      if (c !== undefined) return c;
      c = null;
      if (canBake) {
        const def = SETS[set], sc = def.s * q;
        const cw = Math.ceil(BOX_W * sc), ch = Math.ceil(BOX_H * sc);
        const cv = makeCanvas(cw, ch);
        const bctx = cv && cv.getContext ? cv.getContext('2d') : null;
        if (bctx) {
          const old = g; g = bctx;
          try {
            bctx.setTransform(sc, 0, 0, sc, -BOX_X * sc, -BOX_Y * sc);
            def.draw((frame / FRAMES) * TAU);
            if (def.tint) {
              bctx.setTransform(1, 0, 0, 1, 0, 0);
              bctx.globalCompositeOperation = 'source-atop';
              bctx.fillStyle = def.tint; bctx.fillRect(0, 0, cw, ch);
              bctx.globalCompositeOperation = 'source-over';
            }
            c = cv;
          } catch (e) { c = null; canBake = false; }
          g = old;
        } else canBake = false;
      }
      row[frame] = c;
      return c;
    }
    function bakeRadial(r, inner, outer) {
      const c = canBake ? makeCanvas(r * 2, r * 2) : null;
      const b = c && c.getContext ? c.getContext('2d') : null;
      if (!b) return null;
      const gr = b.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      b.fillStyle = gr; b.fillRect(0, 0, r * 2, r * 2);
      return c;
    }

    /* Draw a zombie set frame with feet at (x, feet). sx/sy stretch, rot radians, clipTop: only show above feet */
    function drawSet(set, frame, x, feet, sx, sy, rot) {
      const def = SETS[set], img = bake(set, frame);
      if (img) {
        const s = def.s;
        const dw = BOX_W * s * sx, dh = BOX_H * s * sy;
        const ax = (ANCHOR_X - BOX_X) * s * sx, ay = (ANCHOR_Y - BOX_Y) * s * sy;
        if (rot) {
          g.save(); g.translate(x, feet); g.rotate(rot);
          g.drawImage(img, -ax, -ay, dw, dh); g.restore();
        } else g.drawImage(img, x - ax, feet - ay, dw, dh);
      } else {
        g.save(); g.translate(x, feet); if (rot) g.rotate(rot);
        g.scale(def.s * sx, def.s * sy); g.translate(-ANCHOR_X, -ANCHOR_Y);
        def.draw((frame / FRAMES) * TAU);
        g.restore();
      }
    }
    function drawShadow(x, y, rx) {
      if (shadowImg === undefined) shadowImg = bakeRadial(32, 'rgba(23,18,31,0.42)', 'rgba(23,18,31,0)');
      if (shadowImg) g.drawImage(shadowImg, x - rx, y - rx * 0.28, rx * 2, rx * 0.56);
      else { g.fillStyle = 'rgba(23,18,31,.3)'; g.beginPath(); g.ellipse(x, y, rx, rx * 0.25, 0, 0, TAU); g.fill(); }
    }
    function drawGlow(x, y, r, alpha) {
      if (glowImg === undefined) glowImg = bakeRadial(48, 'rgba(198,241,53,0.75)', 'rgba(198,241,53,0)');
      const a = g.globalAlpha; g.globalAlpha = a * alpha;
      if (glowImg) g.drawImage(glowImg, x - r, y - r, r * 2, r * 2);
      else { g.fillStyle = 'rgba(198,241,53,.25)'; g.beginPath(); g.arc(x, y, r * 0.7, 0, TAU); g.fill(); }
      g.globalAlpha = a;
    }

    /* ---------- effect pools (no allocation per frame) ---------- */
    const PN = 640;
    const pX = new Float32Array(PN), pY = new Float32Array(PN), pVX = new Float32Array(PN), pVY = new Float32Array(PN);
    const pL = new Float32Array(PN), pM = new Float32Array(PN), pS = new Float32Array(PN), pR = new Float32Array(PN);
    const pVR = new Float32Array(PN), pG = new Float32Array(PN), pC = new Uint8Array(PN), pK = new Uint8Array(PN);
    const PCOL = [ACID, '#7FBF3A', CORAL, GOLD, BONE, TEAL, LILAC, PINK, '#8A8F72', '#5A3A2A', '#B5805A', INK, '#9FB26C', '#C8C2A8', '#7A1E2E'];
    const C_ACID = 0, C_GREEN = 1, C_CORAL = 2, C_GOLD = 3, C_BONE = 4, C_TEAL = 5, C_LILAC = 6, C_PINK = 7, C_STONE = 8, C_DIRT = 9, C_WOOD = 10, C_INK = 11, C_SKIN = 12, C_PALE = 13, C_BLOOD = 14;
    let pCur = 0;
    function emit(x, y, vx, vy, life, size, col, kind, grav) {
      const i = pCur; pCur = (pCur + 1) % PN;
      pX[i] = x; pY[i] = y; pVX[i] = vx; pVY[i] = vy; pL[i] = life; pM[i] = life; pS[i] = size;
      pR[i] = Math.random() * TAU; pVR[i] = (Math.random() - 0.5) * 14; pG[i] = grav; pC[i] = col; pK[i] = kind;
    }
    // kind 0 square, 1 spinning debris, 2 dust puff (grows, no gravity)
    function burst(x, y, n, col, spd, up, size, kind, grav) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = spd * (0.35 + Math.random() * 0.65);
        emit(x, y, Math.cos(a) * v, Math.sin(a) * v * 0.7 - up * Math.random(), 0.35 + Math.random() * 0.45,
          size * (0.6 + Math.random() * 0.8), col, kind, grav);
      }
    }
    function dust(x, y, n) {
      for (let i = 0; i < n; i++) emit(x + (Math.random() - 0.5) * 40, y - Math.random() * 6, (Math.random() - 0.6) * 120, -20 - Math.random() * 50, 0.35 + Math.random() * 0.3, 8 + Math.random() * 8, C_PALE, 2, 0);
    }

    const FN = 48, floats = [];
    for (let i = 0; i < FN; i++) floats.push({ text: '', x: 0, y: 0, vy: 0, life: 0, max: 1, color: BONE, size: 22 });
    let fCur = 0;
    function floatText(text, x, y, color, size, life) {
      const f = floats[fCur]; fCur = (fCur + 1) % FN;
      f.text = text; f.x = x; f.y = y; f.vy = -70; f.life = life || 0.9; f.max = f.life; f.color = color; f.size = size || 24;
    }
    const RN = 10, rings = [];
    for (let i = 0; i < RN; i++) rings.push({ x: 0, y: 0, r: 0, vr: 0, life: 0, max: 1, color: LILAC, w: 8 });
    let rCur = 0;
    function ring(x, y, r, vr, life, color, w) {
      const o = rings[rCur]; rCur = (rCur + 1) % RN;
      o.x = x; o.y = y; o.r = r; o.vr = vr; o.life = life; o.max = life; o.color = color; o.w = w;
    }
    const YN = 40, flyers = [];
    for (let i = 0; i < YN; i++) flyers.push({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, life: 0, set: 0, scale: 1, fall: false });
    let yCur = 0;
    function flyer(x, y, fall, set) {
      const o = flyers[yCur]; yCur = (yCur + 1) % YN;
      o.x = x; o.y = y; o.set = set; o.life = fall ? 0.7 : 1.3; o.fall = fall; o.scale = 1; o.rot = 0;
      if (fall) { o.vx = 30; o.vy = 60; o.vr = (Math.random() - 0.5) * 4; }
      else { o.vx = -160 - Math.random() * 220; o.vy = -520 - Math.random() * 260; o.vr = -(6 + Math.random() * 8); }
    }
    const toasts = [];
    for (let i = 0; i < 4; i++) toasts.push({ text: '', reward: 0, life: 0 });
    const bigBanner = { title: '', sub: '', color: BONE, life: 0, max: 1 };
    const biomeBanner = { title: '', sub: '', color: BONE, life: 0, max: 1 };

    // speed lines
    const SLN = 30, slX = new Float32Array(SLN), slY = new Float32Array(SLN), slL = new Float32Array(SLN);
    for (let i = 0; i < SLN; i++) { slX[i] = Math.random() * W; slY[i] = 60 + Math.random() * 600; slL[i] = 60 + Math.random() * 160; }

    // stars for downtown
    const STN = 70, stX = new Float32Array(STN), stY = new Float32Array(STN), stS = new Float32Array(STN);
    for (let i = 0; i < STN; i++) { stX[i] = hash(i * 3 + 1) * W; stY[i] = hash(i * 3 + 2) * 380; stS[i] = 1 + hash(i * 3 + 3) * 2.5; }

    // per-zombie / per-human visual memory
    const zMem = new Map(), hMem = new Map();
    let frameNo = 0;

    // state
    let trauma = 0, flash = 0, flashColor = BONE, hordePulse = 0, hordeHurt = 0, comboPulse = 0, lastMult = 1;
    let lastHorde = -1, lastGame = null, lastTime = -1, lastCam = 0, camVel = 0, leaderX = 0, leaderChomp = 0;
    let curBiome = 0, prevBiome = 0, biomeFade = 1, overT = 0, attractT = 0, time = 0, screamGlow = 0;
    let shakeX = 0, shakeY = 0;

    /* ---------- gradients (cached per biome) ---------- */
    function lin(y0, y1, stops) {
      const gr = ctx.createLinearGradient(0, y0, 0, y1);
      for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
      return gr;
    }
    const BIOME = [
      { sky: lin(0, 520, [0, '#4A1E44', 0.45, '#C2513F', 0.8, '#FF8A4C', 1, '#FFC15C']),
        far: '#B8483E', mid: '#7E2F48', near: '#4A1A3A', walk: '#6A3A54', road: '#2A1238', road2: '#22102E', dash: '#F4EFD8', car: CORAL, lit: '#FFD36B' },
      { sky: lin(0, 520, [0, '#0C0718', 0.6, '#1B1230', 1, '#3A2453']),
        far: '#2E2050', mid: '#231840', near: '#160F2A', walk: '#4A3D63', road: '#211B30', road2: '#1A1526', dash: '#C6F135', car: TEAL, lit: GOLD },
      { sky: lin(0, 520, [0, '#7FB5B5', 0.6, '#BFD8D8', 1, '#EEF0D6']),
        far: '#9FBFC4', mid: '#6E8591', near: '#3E5560', walk: '#7E939C', road: '#2A3A44', road2: '#23313A', dash: '#E8E2CC', car: '#5F6B3A', lit: '#FFE9A8' }
    ];
    const vignette = (() => { const gr = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 820); gr.addColorStop(0, 'rgba(10,6,18,0)'); gr.addColorStop(1, 'rgba(10,6,18,0.55)'); return gr; })();
    const moonGlow = (() => { const gr = ctx.createRadialGradient(980, 160, 90, 980, 160, 260); gr.addColorStop(0, 'rgba(198,241,53,0.35)'); gr.addColorStop(1, 'rgba(198,241,53,0)'); return gr; })();
    const sunGlow = (() => { const gr = ctx.createRadialGradient(900, 360, 100, 900, 360, 360); gr.addColorStop(0, 'rgba(255,211,107,0.5)'); gr.addColorStop(1, 'rgba(255,211,107,0)'); return gr; })();

    /* ---------- backgrounds ---------- */
    function house(x, y, s, wall, lit, on) {
      g.fillStyle = wall; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70 * s, y - 60 * s); g.lineTo(x + 140 * s, y);
      g.lineTo(x + 140 * s, y + 80 * s); g.lineTo(x, y + 80 * s); g.closePath(); g.fill();
      g.fillRect(x + 98 * s, y - 50 * s, 16 * s, 34 * s);
      g.fillStyle = on ? lit : 'rgba(23,18,31,.5)'; g.fillRect(x + 20 * s, y + 16 * s, 26 * s, 26 * s);
      g.fillStyle = lit; g.fillRect(x + 92 * s, y + 16 * s, 26 * s, 26 * s);
      g.fillStyle = 'rgba(23,18,31,.55)'; g.fillRect(x + 58 * s, y + 38 * s, 24 * s, 42 * s);
    }
    function bgSuburbs(cam, t) {
      const c = BIOME[0];
      g.fillStyle = c.sky; g.fillRect(0, 0, W, 530);
      g.fillStyle = sunGlow; g.fillRect(500, 0, 780, 530);
      O(900, 360, 140, '#FFD36B', false);
      g.fillStyle = 'rgba(255,90,60,.35)'; g.fillRect(760, 330, 280, 8); g.fillRect(770, 360, 260, 10); g.fillRect(790, 394, 220, 12);
      // far hills
      let off = cam * 0.06;
      g.fillStyle = c.far; g.beginPath(); g.moveTo(0, 530);
      for (let x = 0; x <= W + 40; x += 40) { const u = x + off; g.lineTo(x, 430 - 36 * Math.sin(u * 0.004) - 22 * Math.sin(u * 0.011 + 1)); }
      g.lineTo(W, 530); g.closePath(); g.fill();
      // mid: houses and round trees
      off = cam * 0.22; const tile = 320;
      for (let i = Math.floor(off / tile) - 1; i < off / tile + W / tile + 1; i++) {
        const x = i * tile - off, r = hash(i);
        house(x + 30 + r * 60, 410 - r * 20, 1 + r * 0.25, c.mid, c.lit, r > 0.35);
        g.fillStyle = '#5E2440'; g.beginPath(); g.arc(x + 250, 440, 38 + r * 16, 0, TAU); g.arc(x + 280, 418, 30, 0, TAU); g.fill();
        g.fillRect(x + 258, 440, 10, 70);
      }
      // near: fence + lamp posts
      off = cam * 0.55;
      g.fillStyle = c.near;
      g.fillRect(0, 486, W, 6); g.fillRect(0, 466, W, 5);
      const ft = 28;
      for (let x = -(off % ft) - ft; x < W; x += ft) g.fillRect(x, 456, 12, 50);
      const lt = 460;
      for (let i = Math.floor(off / lt) - 1; i < off / lt + W / lt + 1; i++) {
        const x = i * lt - off + 100;
        g.fillStyle = c.near; g.fillRect(x, 330, 10, 180); g.fillRect(x - 4, 324, 46, 10);
        g.fillStyle = '#FFD36B'; g.fillRect(x + 30, 334, 14, 8);
        if (hash(i + 77) > 0.5) { g.fillStyle = c.near; g.fillRect(x + 160, 470, 30, 22); g.fillRect(x + 172, 490, 6, 20); g.fillStyle = CORAL; g.fillRect(x + 186, 462, 4, 14); }
      }
    }
    function bgDowntown(cam, t) {
      const c = BIOME[1];
      g.fillStyle = c.sky; g.fillRect(0, 0, W, 530);
      g.fillStyle = BONE;
      for (let i = 0; i < STN; i++) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
        g.globalAlpha = tw; g.fillRect(stX[i], stY[i], stS[i], stS[i]);
      }
      g.globalAlpha = 1;
      g.fillStyle = moonGlow; g.fillRect(700, 0, 560, 440);
      O(980, 160, 105, ACID, false);
      g.fillStyle = '#A8D42A'; g.beginPath();
      g.moveTo(960, 120); g.arc(940, 120, 20, 0, TAU); g.moveTo(1048, 196); g.arc(1020, 196, 28, 0, TAU);
      g.moveTo(1022, 110); g.arc(1010, 110, 12, 0, TAU); g.moveTo(960, 200); g.arc(950, 200, 10, 0, TAU); g.fill();
      // far skyline
      let off = cam * 0.06, tile = 90;
      g.fillStyle = c.far;
      for (let i = Math.floor(off / tile) - 1; i < off / tile + W / tile + 1; i++) {
        const x = i * tile - off, hh = 140 + hash(i) * 200;
        g.fillRect(x, 520 - hh, tile - 8, hh);
        if (hash(i + 5) > 0.7) g.fillRect(x + 30, 520 - hh - 40, 4, 40);
      }
      // mid buildings with windows
      off = cam * 0.2; tile = 210;
      for (let i = Math.floor(off / tile) - 1; i < off / tile + W / tile + 1; i++) {
        const x = i * tile - off, r = hash(i + 100), hh = 150 + r * 130, bw = 160 + r * 30, top = 515 - hh;
        g.fillStyle = c.mid; g.fillRect(x, top, bw, hh);
        for (let row = 0; row < 7; row++) {
          const wy = top + 18 + row * 34; if (wy > 490) break;
          for (let col = 0; col < 4; col++) {
            const hv = hash(i * 31 + row * 7 + col);
            if (hv < 0.45) continue;
            g.fillStyle = hv > 0.9 ? CORAL : hv > 0.6 ? c.lit : '#6B5A2E';
            g.fillRect(x + 16 + col * 36, wy, 18, 20);
          }
        }
      }
      // near: lamps with light cones and burning barrels
      off = cam * 0.55; tile = 400;
      for (let i = Math.floor(off / tile) - 1; i < off / tile + W / tile + 1; i++) {
        const x = i * tile - off + 60;
        g.fillStyle = 'rgba(255,193,92,0.10)'; g.beginPath(); g.moveTo(x + 36, 300); g.lineTo(x - 30, 528); g.lineTo(x + 110, 528); g.closePath(); g.fill();
        g.fillStyle = c.near; g.fillRect(x, 290, 10, 230); g.fillRect(x, 286, 46, 10);
        g.fillStyle = GOLD; g.fillRect(x + 28, 296, 16, 8);
        if (hash(i + 9) > 0.45) {
          const bx = x + 220, fl = Math.sin(t * 17 + i) * 6;
          g.fillStyle = c.near; g.fillRect(bx, 478, 40, 46);
          g.fillStyle = CORAL; g.beginPath(); g.moveTo(bx + 2, 480); g.quadraticCurveTo(bx + 20 + fl, 430, bx + 38, 480); g.fill();
          g.fillStyle = GOLD; g.beginPath(); g.moveTo(bx + 10, 480); g.quadraticCurveTo(bx + 20 - fl, 452, bx + 30, 480); g.fill();
        }
      }
    }
    function bgQuarantine(cam, t) {
      const c = BIOME[2];
      g.fillStyle = c.sky; g.fillRect(0, 0, W, 530);
      O(300, 240, 70, '#F8F4DC', false);
      // mountains
      let off = cam * 0.02;
      g.fillStyle = '#B3CFCF'; g.beginPath(); g.moveTo(0, 520);
      for (let x = 0; x <= W + 60; x += 60) { const u = x + off; g.lineTo(x, 380 - 70 * Math.abs(Math.sin(u * 0.0035)) - 20 * Math.sin(u * 0.013)); }
      g.lineTo(W, 520); g.closePath(); g.fill();
      // lab dome (recurring)
      off = cam * 0.05; const dt = 1700;
      for (let i = Math.floor(off / dt) - 1; i < off / dt + W / dt + 1; i++) {
        const x = i * dt - off + 900;
        if (x < -300 || x > W + 300) continue;
        g.fillStyle = '#4E9C98'; g.fillRect(x - 210, 440, 420, 80);
        g.beginPath(); g.arc(x, 450, 180, Math.PI, 0); g.fillStyle = TEAL; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 4; g.beginPath();
        g.moveTo(x, 270); g.lineTo(x, 450); g.moveTo(x - 90, 294); g.quadraticCurveTo(x - 60, 380, x - 70, 450);
        g.moveTo(x + 90, 294); g.quadraticCurveTo(x + 60, 380, x + 70, 450); g.moveTo(x - 172, 400); g.quadraticCurveTo(x, 370, x + 172, 400); g.stroke();
        g.fillStyle = INK; g.fillRect(x - 4, 200, 8, 72);
        O(x, 196, 9, Math.sin(t * 5) > 0 ? CORAL : '#6A2A2A', false);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - 70, 330, 40, Math.PI * 1.1, Math.PI * 1.5); g.lineTo(x - 70, 330); g.fill();
      }
      // mid: wall with hazard stripes and towers
      off = cam * 0.25;
      g.fillStyle = c.mid; g.fillRect(0, 410, W, 110);
      g.fillStyle = GOLD; g.fillRect(0, 410, W, 16);
      g.fillStyle = INK;
      const st = 40;
      for (let x = -(off % st) - st; x < W + st; x += st) { g.beginPath(); g.moveTo(x, 426); g.lineTo(x + 16, 410); g.lineTo(x + 32, 410); g.lineTo(x + 16, 426); g.fill(); }
      g.fillStyle = 'rgba(23,18,31,.25)';
      for (let x = -(off % 120); x < W; x += 120) g.fillRect(x, 426, 4, 94);
      const tt = 760;
      for (let i = Math.floor(off / tt) - 1; i < off / tt + W / tt + 1; i++) {
        const x = i * tt - off + 200;
        g.fillStyle = c.near; g.fillRect(x, 300, 12, 120); g.fillRect(x + 60, 300, 12, 120); g.fillRect(x - 14, 270, 100, 40);
        g.fillStyle = 'rgba(255,240,180,.18)'; g.beginPath(); g.moveTo(x + 36, 290);
        const sw = Math.sin(t * 0.8 + i) * 160; g.lineTo(x + 36 + sw - 60, 0); g.lineTo(x + 36 + sw + 60, 0); g.closePath(); g.fill();
      }
      // near: chain-link fence and signs
      off = cam * 0.55;
      g.fillStyle = c.near;
      for (let x = -(off % 130) - 130; x < W; x += 130) g.fillRect(x, 440, 8, 86);
      g.fillRect(0, 446, W, 3); g.fillRect(0, 476, W, 3); g.fillRect(0, 506, W, 3);
      const sgt = 980;
      for (let i = Math.floor(off / sgt) - 1; i < off / sgt + W / sgt + 1; i++) {
        const x = i * sgt - off + 420;
        box(x, 452, 150, 40, GOLD);
        g.fillStyle = INK; g.font = fd(18); g.textAlign = 'center'; g.fillText('QUARANTINE', x + 75, 480);
      }
    }
    const BGS = [bgSuburbs, bgDowntown, bgQuarantine];
    function road(b, cam) {
      const c = BIOME[b];
      g.fillStyle = c.walk; g.fillRect(0, 512, W, 22);
      g.fillStyle = 'rgba(23,18,31,.35)';
      for (let x = -(cam % 80); x < W; x += 80) g.fillRect(x, 512, 3, 22);
      g.fillStyle = INK; g.fillRect(0, 532, W, 5);
      g.fillStyle = c.road; g.fillRect(0, 537, W, H - 537);
      g.fillStyle = c.road2; g.fillRect(0, 600, W, H - 600);
      g.fillStyle = c.dash;
      const dt = 150;
      for (let x = -(cam % dt) - dt; x < W; x += dt) g.fillRect(x, 642, 74, 7);
      g.fillStyle = 'rgba(23,18,31,.4)';
      const ct = 530;
      for (let x = -(cam % ct) - ct; x < W; x += ct) { g.fillRect(x + 40, 690, 60, 4); g.fillRect(x + 300, 612, 30, 3); }
    }

    /* ---------- world objects ---------- */
    function drawCar(o, sx, b) {
      const h = o.h || 80, w = o.w || 200, sy = (h + 24) / 98, ty = GROUND + 24 - 110 * sy;
      g.save(); g.translate(sx, ty); g.scale(w / 240, o.broken ? sy * 0.7 : sy);
      if (o.broken) g.translate(0, 110 * 0.43);
      F('M0 110 V66 Q4 54 22 54 L54 12 H150 L186 54 H226 Q240 56 240 76 V110 Z', o.broken ? '#4A4050' : BIOME[b].car);
      F('M68 22 H106 V54 H42 Z', o.broken ? '#2A2438' : '#BFE3EE');
      F('M116 22 H146 L170 54 H116 Z', o.broken ? '#2A2438' : '#BFE3EE');
      N('M10 80 H230 V88 H10 Z', 'rgba(23,18,31,.25)');
      O(50, 112, 24, INK, true); O(190, 112, 24, INK, true);
      O(50, 112, 9, '#8A8F72', false); O(190, 112, 9, '#8A8F72', false);
      if (!o.broken) { O(232, 80, 7, GOLD, false); }
      g.restore();
      if (o.broken && !reduced) {
        g.fillStyle = 'rgba(60,50,70,.35)';
        const tt = time * 1.6;
        for (let i = 0; i < 3; i++) { const p = (tt + i / 3) % 1; g.beginPath(); g.arc(sx + w * 0.5 + p * 20, GROUND - h * 0.4 - p * 120, 10 + p * 24, 0, TAU); g.fill(); }
      }
    }
    function cone(x, y) {
      g.fillStyle = CORAL; g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x, y - 30); g.lineTo(x + 10, y); g.closePath(); g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = BONE; g.fillRect(x - 6, y - 16, 12, 5);
    }
    function drawHole(o, sx) {
      const w = o.w || 120, cx = sx + w / 2;
      g.fillStyle = 'rgba(23,18,31,.5)'; g.beginPath(); g.ellipse(cx, GROUND + 4, w / 2 + 12, 40, 0, 0, TAU); g.fill();
      g.fillStyle = '#07050B'; g.beginPath(); g.ellipse(cx, GROUND + 4, w / 2, 32, 0, 0, TAU); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#4A3F58'; g.stroke();
      g.fillStyle = '#1E1628'; g.beginPath(); g.ellipse(cx, GROUND - 6, w / 2 - 6, 18, 0, Math.PI, TAU); g.fill();
      cone(sx - 16, GROUND - 22); cone(sx + w + 16, GROUND - 22);
    }
    function drawBarricade(o, sx, hordeN) {
      const w = o.w || 70, h = o.h || 110, bottom = GROUND + 30, top = GROUND - h;
      if (o.broken) {
        g.fillStyle = '#6E7058';
        for (let i = 0; i < 6; i++) { const r = hash(o.id * 13 + i); g.fillRect(sx - 20 + r * (w + 40), bottom - 14 - r * 10, 18 + r * 14, 12 + r * 8); }
        return;
      }
      const rows = Math.max(2, Math.round((bottom - top) / 34)), rh = (bottom - top) / rows;
      g.lineWidth = 5; g.strokeStyle = INK;
      for (let r = 0; r < rows; r++) {
        const y = bottom - (r + 1) * rh, offx = r % 2 ? 18 : 0;
        for (let x = -offx; x < w; x += 36) {
          const x0 = Math.max(0, x), x1 = Math.min(w, x + 36);
          if (x1 - x0 < 6) continue;
          g.fillStyle = (r + Math.floor(x / 36)) % 2 ? '#8A8F72' : '#7E8368';
          g.fillRect(sx + x0, y, x1 - x0, rh); g.strokeRect(sx + x0, y, x1 - x0, rh);
        }
      }
      // hazard band
      g.fillStyle = GOLD; g.fillRect(sx - 4, top - 2, w + 8, 12); g.fillStyle = INK;
      for (let x = 0; x < w + 8; x += 18) g.fillRect(sx - 4 + x, top - 2, 8, 12);
      // need sign
      const need = o.need || 0, ok = hordeN >= need, col = ok ? ACID : CORAL;
      const cx = sx + w / 2, sy = top - 62, pulse = ok ? 1 : 1 + 0.06 * Math.sin(time * 10);
      g.save(); g.translate(cx, sy); g.scale(pulse, pulse);
      box(-52, -32, 104, 64, col);
      g.fillStyle = INK; g.textAlign = 'center';
      g.font = fd(46); g.fillText(String(need), 8, 20);
      zombieHead(-34, 0, 0.12);
      g.restore();
      g.fillStyle = INK; g.fillRect(cx - 4, sy + 32, 8, top - sy - 32);
      g.textAlign = 'center'; g.font = fb(15);
      if (ok) outlined('SMASH IT', cx, sy - 42, ACID, 5);
      else if (h <= 110) outlined('JUMP!', cx, sy - 42, BONE, 5);
      else outlined('NEED ' + need, cx, sy - 42, CORAL, 5);
    }
    function drawHuman(h, sx, feet, sp) {
      const kind = h.kind, stunned = h.state === 'stunned', moving = h.state === 'flee';
      const t = time * (moving ? 13 : 4) + h.id * 1.7;
      let s = 0.3, face = 1;
      if (kind === 'riot' || kind === 'soldier') s = 0.34; else if (kind === 'scientist') s = 0.33;
      if (kind === 'soldier' || kind === 'scientist') face = -1;
      else if (kind !== 'riot' && !moving) face = -1;
      drawShadow(sx, GROUND + (feet - GROUND) + h.y, 46 * s / 0.3);
      const mem = hMem.get(h.id);
      g.save(); g.translate(sx, feet); g.scale(face * s, s); g.translate(-150, -420);
      if (kind === 'riot') copSprite(t, moving, h.shield !== false, stunned);
      else if (kind === 'soldier') soldierSprite(mem && mem.flash > 0, stunned);
      else if (kind === 'scientist') sciSprite(t, moving || h.cd < 0.4);
      else {
        const tone = TONES[h.id % 4], hair = HAIR[(h.id * 7 + 1) % 4], shirt = SHIRTS[(h.id * 5 + 2) % 4];
        civSprite(kind, tone, hair, shirt, t, moving, stunned);
      }
      g.restore();
      if (kind === 'soldier' && mem && mem.flash > 0 && !stunned) {
        const mx = sx - 150 * s, my = feet - 200 * s;
        g.fillStyle = 'rgba(255,230,140,.85)'; g.beginPath(); g.arc(mx, my, 14 + Math.random() * 6, 0, TAU); g.fill();
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(mx, my, 6, 0, TAU); g.fill();
      }
      if (stunned) {
        g.fillStyle = GOLD;
        for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; g.fillRect(sx + Math.cos(a) * 24 - 4, feet - 150 + Math.sin(a) * 6 - 4, 8, 8); }
      }
      const mut = JOB_MUT[kind];
      if (mut || kind === 'scientist') {
        const col = mut ? MUT[mut].color : PINK, label = mut ? JOBS[kind].label : 'SCIENTIST';
        const by = feet - 160 + Math.sin(time * 4 + h.id) * 4;
        g.globalAlpha = 0.35 + 0.15 * Math.sin(time * 6 + h.id);
        g.fillStyle = col; g.beginPath(); g.arc(sx, by - 30, 30, 0, TAU); g.fill();
        g.globalAlpha = 1;
        O(sx, by - 30, 18, col, true);
        jobIcon(kind, sx, by - 30);
        g.font = fb(15); g.textAlign = 'center';
        const tw = g.measureText(label).width + 14;
        g.fillStyle = INK; g.fillRect(sx - tw / 2, by - 4, tw, 22);
        g.fillStyle = col; g.fillText(label, sx, by + 12);
      }
    }
    function jobIcon(kind, x, y) {
      g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = 3;
      if (kind === 'jogger') { g.beginPath(); g.moveTo(x + 3, y - 12); g.lineTo(x - 7, y + 2); g.lineTo(x, y + 2); g.lineTo(x - 3, y + 12); g.lineTo(x + 8, y - 3); g.lineTo(x + 1, y - 3); g.closePath(); g.fill(); }
      else if (kind === 'bouncer') { g.fillRect(x - 9, y - 7, 18, 14); g.fillRect(x - 9, y - 11, 4, 6); g.fillRect(x - 3, y - 12, 4, 6); g.fillRect(x + 3, y - 11, 4, 6); }
      else if (kind === 'chef') { g.beginPath(); g.arc(x - 5, y - 4, 6, 0, TAU); g.arc(x + 5, y - 4, 6, 0, TAU); g.arc(x, y - 8, 6, 0, TAU); g.fill(); g.fillRect(x - 7, y, 14, 9); }
      else if (kind === 'plumber') { g.lineWidth = 5; g.beginPath(); g.moveTo(x - 9, y + 9); g.lineTo(x + 5, y - 5); g.stroke(); g.beginPath(); g.arc(x + 6, y - 6, 6, 0, TAU); g.lineWidth = 3; g.stroke(); }
      else { g.fillStyle = INK; g.fillRect(x - 2, y - 10, 4, 20); g.fillRect(x - 10, y - 2, 20, 4); }
    }
    const TONES = ['#D9A374', '#8A5A3C', '#E8C29F', '#B5805A'];
    const HAIR = ['#4A2C1C', '#17121F', '#9A6A2E', '#7A3A2A'];

    function drawProjectile(p, sx) {
      const sy = GROUND - (p.y || 0);
      if (p.kind === 'bullet') {
        const tail = clamp(-(p.vx || -600) * 0.03, 10, 40);
        g.lineCap = 'round';
        g.strokeStyle = GOLD; g.lineWidth = 6; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + tail, sy); g.stroke();
        g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + tail * 0.6, sy); g.stroke();
      } else if (p.kind === 'acid') {
        const r = p.r || 10;
        g.fillStyle = 'rgba(198,241,53,.45)'; g.beginPath(); g.moveTo(sx - r, sy + 3); g.arc(sx - r * 1.6, sy + 3, r * 0.6, 0, TAU); g.moveTo(sx - r * 2.4, sy + 6); g.arc(sx - r * 2.8, sy + 6, r * 0.4, 0, TAU); g.fill();
        O(sx, sy, r, ACID, true);
        g.fillStyle = '#EEFFA6'; g.beginPath(); g.arc(sx + r * 0.3, sy - r * 0.3, r * 0.3, 0, TAU); g.fill();
      } else {
        const r = p.r || 40;
        g.globalAlpha = 0.55;
        g.fillStyle = TEAL;
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = time * 2 + i * 1.3 + p.id;
          g.moveTo(sx + Math.cos(i * 1.26) * r * 0.5 + r * 0.45, sy + Math.sin(a) * 6);
          g.arc(sx + Math.cos(i * 1.26) * r * 0.5, sy + Math.sin(i * 1.26) * r * 0.3 + Math.sin(a) * 6, r * 0.45, 0, TAU);
        }
        g.fill();
        g.globalAlpha = 0.85; g.fillStyle = '#DFFBF8';
        for (let i = 0; i < 4; i++) g.fillRect(sx + Math.cos(time * 3 + i * 2) * r * 0.6, sy + Math.sin(time * 4 + i) * r * 0.3, 5, 5);
        g.globalAlpha = 1;
      }
    }

    /* ---------- the horde ---------- */
    function zSet(z, isLeader, mutType) {
      if (isLeader) {
        if (mutType === 'brute') return SET_LEADER_BRUTE;
        return leaderChomp > 0 ? SET_LEADER_ATK : SET_LEADER;
      }
      if (mutType === 'runner') return SET_RUNNER;
      if (mutType === 'brute') return z.id % 4 === 0 ? 10 : SET_BRUTE;
      if (mutType === 'spitter') return SET_SPIT;
      if (mutType === 'crawler') return SET_CRAWL;
      return z.id % 3;
    }
    function drawZombie(z, isLeader, sx, gameTime, speed, mutType) {
      let mem = zMem.get(z.id);
      if (!mem) { mem = { state: z.state, squash: 0, seen: 0 }; zMem.set(z.id, mem); }
      if (mem.state === 'air' && z.state !== 'air') mem.squash = 1;
      mem.state = z.state; mem.seen = frameNo;
      const laneOff = (clamp(Math.round(z.lane), 0, 2) - 1) * LANE_GAP;
      const groundY = GROUND + laneOff, feet = groundY - (z.y || 0);
      const set = zSet(z, isLeader, mutType);
      const phase = gameTime * (9 + speed / 45) + z.id * 1.3;
      let frame = ((Math.floor((phase / TAU) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
      let sx2 = 1, sy2 = 1;
      if (z.state === 'air') {
        frame = 2;
        const v = clamp(Math.abs(z.vy || 0) / 900, 0, 1);
        sx2 = 1 - 0.1 * v; sy2 = 1 + 0.14 * v;
      } else if (mem.squash > 0) {
        sx2 = 1 + 0.28 * mem.squash; sy2 = 1 - 0.24 * mem.squash;
      }
      const age = gameTime - (z.born || -9);
      if (age >= 0 && age < 0.3) { const p = 1 - age / 0.3, pop = 1 + 0.7 * p * p; sx2 *= pop; sy2 *= pop; }

      if (z.state === 'under') {
        // mostly underground: mound + top of the head, dirt spray
        g.fillStyle = '#4A2F22'; g.beginPath(); g.ellipse(sx, groundY + 2, 34, 11, 0, Math.PI, TAU); g.fill();
        g.save(); g.beginPath(); g.rect(sx - 80, groundY - 140, 160, 140); g.clip();
        drawSet(isLeader ? SET_LEADER : z.id % 3, frame, sx, groundY + (isLeader ? 140 : 100), 1, 1, 0);
        g.restore();
        g.fillStyle = '#6B4A34'; g.beginPath(); g.ellipse(sx, groundY + 1, 30, 7, 0, 0, TAU); g.fill();
        if (!reduced && Math.random() < 0.25) emit(sx - 20, groundY - 4, -60 - Math.random() * 140, -120 - Math.random() * 160, 0.4, 5 + Math.random() * 4, C_DIRT, 0, 900);
        return;
      }
      drawShadow(sx, groundY + 2, (isLeader ? 54 : 40) * (1 - clamp((z.y || 0) / 400, 0, 0.6)));
      if (mutType === 'spitter') drawGlow(sx, feet - 60, isLeader ? 90 : 66, 0.8 + 0.2 * Math.sin(gameTime * 8 + z.id));
      if (mutType === 'runner' && !reduced) {
        const a = g.globalAlpha;
        g.globalAlpha = a * 0.28; drawSet(set, frame, sx - 22, feet, sx2, sy2, 0);
        g.globalAlpha = a * 0.12; drawSet(set, frame, sx - 46, feet, sx2, sy2, 0);
        g.globalAlpha = a;
      }
      const hurt = (z.hurt || 0) > 0 && Math.floor(time * 24) % 2 === 0;
      if (hurt) g.globalAlpha = 0.45;
      drawSet(set, frame, sx, feet, sx2, sy2, 0);
      if (hurt) g.globalAlpha = 1;
      if (isLeader && mutType === 'brute' && !reduced) {
        g.strokeStyle = 'rgba(255,90,60,.6)'; g.lineWidth = 4; g.beginPath(); g.arc(sx, feet - 110, 120 + Math.sin(time * 12) * 6, 0, TAU); g.stroke();
      }
    }

    /* ---------- HUD ---------- */
    function hud(game) {
      const n = game.horde ? game.horde.length : 0;
      // horde panel
      const pulse = 1 + 0.25 * hordePulse;
      box(24, 20, 262, 100, INK);
      zombieHead(76, 70, 0.34);
      g.save(); g.translate(204, 72); g.scale(pulse, pulse);
      g.font = fd(64); g.textAlign = 'center';
      outlined(String(n), 0, 22, hordeHurt > 0 ? CORAL : hordePulse > 0 ? ACID : BONE, 8);
      g.restore();
      g.font = fb(14); g.textAlign = 'left'; g.fillStyle = ACID; g.fillText('HORDE', 130, 40);
      // scream meter
      const sc = game.scream || { charge: 0, active: 0 }, charge = clamp(sc.charge || 0, 0, 1), ready = charge >= 1;
      box(24, 130, 262, 34, INK);
      if (ready && !reduced) { g.fillStyle = 'rgba(185,163,240,' + (0.35 + 0.35 * Math.sin(time * 9)).toFixed(2) + ')'; g.fillRect(18, 124, 274, 46); box(24, 130, 262, 34, INK); }
      g.fillStyle = ready ? LILAC : '#6E5FA0'; g.fillRect(28, 134, 254 * charge, 26);
      if ((sc.active || 0) > 0) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(28, 134, 254, 26); }
      g.font = fb(15); g.textAlign = 'left'; g.fillStyle = ready ? INK : BONE;
      g.fillText(ready ? 'SCREAM READY!  [K]' : 'SCREAM', 38, 153);
      // mutation ring
      const m = game.mutation;
      if (m && m.type && MUT[m.type]) {
        const info = MUT[m.type], f = clamp((m.t || 0) / (m.dur || 7), 0, 1), cx = 340, cy = 70;
        O(cx, cy, 42, INK, false);
        g.lineCap = 'butt';
        g.strokeStyle = '#3A3050'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, 34, 0, TAU); g.stroke();
        g.strokeStyle = info.color; g.beginPath(); g.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
        g.font = fd(26); g.textAlign = 'center'; g.fillStyle = BONE; g.fillText(String(Math.ceil(m.t || 0)), cx, cy + 10);
        g.font = fb(14); outlined(info.name, cx, cy + 62, info.color, 5);
      }
      // score & best
      const score = Math.floor(game.score || 0);
      g.textAlign = 'center'; g.font = fd(50);
      outlined(String(score), W / 2, 66, BONE, 10);
      g.font = fb(16);
      const beat = best > 0 && score > best;
      outlined(beat ? 'NEW BEST!' : 'BEST ' + best, W / 2, 94, beat ? ACID : '#D8CFEA', 5);
      // combo
      const mult = game.multiplier || 1;
      if (mult > 1 || (game.combo || 0) >= 2) {
        const cp = 1 + 0.35 * comboPulse + (reduced ? 0 : 0.04 * Math.sin(time * 14));
        g.save(); g.translate(W / 2, 140); g.scale(cp, cp);
        g.font = fd(40); outlined('x' + mult, 0, 14, mult >= 4 ? CORAL : mult >= 2 ? GOLD : BONE, 8);
        g.restore();
        g.font = fb(14); outlined('COMBO ' + (game.combo || 0), W / 2, 178, BONE, 4);
        const ct = clamp((game.comboT || 0) / 1.5, 0, 1);
        g.fillStyle = INK; g.fillRect(W / 2 - 50, 184, 100, 8); g.fillStyle = GOLD; g.fillRect(W / 2 - 48, 186, 96 * ct, 4);
      }
      // distance, brains, biome (right; leave room for the DOM pause button)
      g.textAlign = 'right';
      g.font = fd(34); outlined(Math.floor((game.dist || 0) / 10) + ' m', 1176, 56, BONE, 8);
      brainShape(1060, 88, 0.42);
      g.font = fd(26); outlined(String(game.brains || 0), 1176, 98, PINK, 6);
      const bn = BIOME_NAMES[game.biome] || '';
      g.font = fb(14); outlined(bn.toUpperCase() + ((game.loop || 0) > 0 ? '  LOOP ' + (game.loop + 1) : ''), 1176, 124, '#D8CFEA', 4);
      // toasts
      let ty = 150;
      for (let i = 0; i < toasts.length; i++) {
        const tt = toasts[i]; if (tt.life <= 0) continue;
        const slide = clamp((3.2 - tt.life) * 6, 0, 1) * clamp(tt.life * 3, 0, 1);
        const x = W - 24 - 380 * slide;
        box(x, ty, 360, 62, INK);
        g.fillStyle = ACID; g.fillRect(x, ty, 8, 62);
        g.textAlign = 'left'; g.font = fb(13); g.fillStyle = ACID; g.fillText('MISSION COMPLETE  +' + tt.reward + ' BRAINS', x + 20, ty + 24);
        g.font = fb(16); g.fillStyle = BONE; g.fillText(tt.text, x + 20, ty + 47, 330);
        ty += 72;
      }
    }
    const BIOME_NAMES = ['Suburbs', 'Downtown', 'Quarantine'];
    function banners() {
      if (biomeBanner.life > 0) {
        const p = biomeBanner.life / biomeBanner.max, a = clamp(Math.min(p * 4, (1 - p) * 8), 0, 1);
        g.globalAlpha = a; g.textAlign = 'center';
        g.font = fd(70); outlined(biomeBanner.title, W / 2, 290, biomeBanner.color, 14);
        g.font = fb(22); outlined(biomeBanner.sub, W / 2, 326, BONE, 7);
        g.globalAlpha = 1;
      }
      if (bigBanner.life > 0) {
        const p = bigBanner.life / bigBanner.max, a = clamp(p * 4, 0, 1), inS = reduced ? 1 : 1 + 0.6 * Math.pow(clamp((p - 0.8) / 0.2, 0, 1), 2);
        g.globalAlpha = a; g.textAlign = 'center';
        g.save(); g.translate(W / 2, 400); g.scale(inS, inS);
        g.font = fd(92); outlined(bigBanner.title, 0, 0, bigBanner.color, 16);
        g.restore();
        g.font = fb(24); outlined(bigBanner.sub, W / 2, 440, BONE, 7);
        g.globalAlpha = 1;
      }
    }

    /* ---------- effects update + draw ---------- */
    function updateFx(dt) {
      for (let i = 0; i < PN; i++) {
        if (pL[i] <= 0) continue;
        pL[i] -= dt; pVY[i] += pG[i] * dt; pX[i] += pVX[i] * dt; pY[i] += pVY[i] * dt; pR[i] += pVR[i] * dt;
        if (pK[i] === 2) { pS[i] += 30 * dt; pVX[i] *= 0.96; }
      }
      for (let i = 0; i < FN; i++) { const f = floats[i]; if (f.life > 0) { f.life -= dt; f.y += f.vy * dt; f.vy *= 0.96; } }
      for (let i = 0; i < RN; i++) { const r = rings[i]; if (r.life > 0) { r.life -= dt; r.r += r.vr * dt; } }
      for (let i = 0; i < YN; i++) {
        const o = flyers[i]; if (o.life <= 0) continue;
        o.life -= dt; o.vy += (o.fall ? 900 : 1500) * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
        if (o.fall) o.scale = Math.max(0.05, o.scale - dt * 1.4);
      }
      for (let i = 0; i < toasts.length; i++) if (toasts[i].life > 0) toasts[i].life -= dt;
      if (bigBanner.life > 0) bigBanner.life -= dt;
      if (biomeBanner.life > 0) biomeBanner.life -= dt;
      trauma = Math.max(0, trauma - dt * 1.6);
      flash = Math.max(0, flash - dt * 3);
      hordePulse = Math.max(0, hordePulse - dt * 4);
      hordeHurt = Math.max(0, hordeHurt - dt * 3);
      comboPulse = Math.max(0, comboPulse - dt * 5);
      leaderChomp = Math.max(0, leaderChomp - dt);
      screamGlow = Math.max(0, screamGlow - dt);
      zMem.forEach(m => { if (m.squash > 0) m.squash = Math.max(0, m.squash - dt * 6); });
      hMem.forEach(m => { if (m.flash > 0) m.flash -= dt; });
    }
    function drawWorldFx(cam) {
      for (let i = 0; i < YN; i++) {
        const o = flyers[i]; if (o.life <= 0) continue;
        const a = g.globalAlpha; g.globalAlpha = clamp(o.life * 2, 0, 1);
        drawSet(o.set, 3, o.x - cam, o.y, o.scale, o.scale, o.rot);
        g.globalAlpha = a;
      }
      for (let i = 0; i < PN; i++) {
        if (pL[i] <= 0) continue;
        const x = pX[i] - cam; if (x < -40 || x > W + 40) continue;
        const a = clamp(pL[i] / pM[i] * 1.6, 0, 1), s = pS[i];
        g.globalAlpha = pK[i] === 2 ? a * 0.5 : a;
        g.fillStyle = PCOL[pC[i]];
        if (pK[i] === 1) { g.save(); g.translate(x, pY[i]); g.rotate(pR[i]); g.fillRect(-s / 2, -s / 2, s, s * 0.7); g.restore(); }
        else g.fillRect(x - s / 2, pY[i] - s / 2, s, s);
      }
      g.globalAlpha = 1;
      for (let i = 0; i < RN; i++) {
        const r = rings[i]; if (r.life <= 0) continue;
        g.globalAlpha = clamp(r.life / r.max, 0, 1);
        g.strokeStyle = r.color; g.lineWidth = r.w; g.beginPath(); g.arc(r.x - cam, r.y, Math.max(1, r.r), 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      g.textAlign = 'center';
      for (let i = 0; i < FN; i++) {
        const f = floats[i]; if (f.life <= 0) continue;
        const p = f.life / f.max, grow = p > 0.85 ? 1 + (p - 0.85) * 3 : 1;
        g.globalAlpha = clamp(p * 2.5, 0, 1);
        g.font = fd(Math.round(f.size * grow));
        outlined(f.text, f.x - cam, f.y, f.color, Math.max(4, f.size / 4));
      }
      g.globalAlpha = 1;
    }
    function speedLines(game, dt) {
      const c = game.config || {}, s0 = c.startSpeed || 300, s1 = c.maxSpeed || 800;
      const f = clamp(((game.speed || 0) - s0) / Math.max(1, s1 - s0), 0, 1) * 0.8 + (game.mutation && game.mutation.type === 'runner' ? 0.3 : 0);
      const n = Math.floor(SLN * (0.25 + 0.75 * f));
      if (reduced) return;
      g.fillStyle = 'rgba(244,239,216,' + (0.06 + 0.16 * f).toFixed(3) + ')';
      for (let i = 0; i < SLN; i++) {
        slX[i] -= (game.speed || 300) * (1.6 + (i % 3) * 0.4) * dt;
        if (slX[i] + slL[i] < 0) { slX[i] = W + Math.random() * 300; slY[i] = 40 + Math.random() * 640; slL[i] = 60 + Math.random() * 180; }
        if (i < n) g.fillRect(slX[i], slY[i], slL[i] * (0.6 + f), 2 + (i % 2));
      }
    }

    /* ---------- public ---------- */
    self.resize = function () {
      let cssW = W, dpr = 1;
      try {
        dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        if (r && r.width > 0) cssW = r.width;
      } catch (e) { /* keep defaults */ }
      const bw = Math.max(320, Math.min(2560, Math.round(cssW * Math.min(dpr, 2))));
      const bh = Math.round(bw * H / W);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      k = bw / W;
      const nq = clamp(Math.round(k * 4) / 4, 0.5, 2);
      if (nq !== q) { q = nq; resetBakes(); }
    };
    self.clearCache = function () { resetBakes(); };
    self.setBest = function (n) { best = Math.max(0, Math.floor(n || 0)); };
    self.setReducedMotion = function (b) { reduced = !!b; };
    self.reset = function () {
      for (let i = 0; i < PN; i++) pL[i] = 0;
      for (let i = 0; i < FN; i++) floats[i].life = 0;
      for (let i = 0; i < RN; i++) rings[i].life = 0;
      for (let i = 0; i < YN; i++) flyers[i].life = 0;
      for (let i = 0; i < toasts.length; i++) toasts[i].life = 0;
      bigBanner.life = 0; biomeBanner.life = 0;
      trauma = 0; flash = 0; overT = 0; lastHorde = -1; lastGame = null; zMem.clear(); hMem.clear();
    };
    self.onEvents = function (events) {
      if (!events || !events.length) return;
      for (let i = 0; i < events.length; i++) {
        const e = events[i]; if (!e) continue;
        const x = e.x || 0, y = GROUND - (e.y || 0);
        switch (e.type) {
          case 'bite': {
            const special = !!(e.job && JOB_MUT[e.job]);
            burst(x, y - 50, special ? 26 : 16, C_ACID, 380, 220, 9, 0, 900);
            burst(x, y - 50, 6, C_BLOOD, 260, 160, 7, 0, 1100);
            floatText('+1', x, y - 120, ACID, 34);
            const m = e.multiplier || 1;
            floatText('+' + 10 * m, x + 30, y - 80, m > 1 ? GOLD : BONE, 20, 0.7);
            if (special) ring(x, y - 60, 20, 500, 0.4, MUT[JOB_MUT[e.job]].color, 8);
            if (e.kind === 'scientist') floatText('+3 BRAINS', x, y - 160, PINK, 24, 1.1);
            if (m !== lastMult) { comboPulse = 1; lastMult = m; }
            if ((e.combo || 0) % 5 === 0 && e.combo) comboPulse = 1;
            if (Math.abs(x - leaderX) < 140) leaderChomp = 0.22;
            break;
          }
          case 'join': ring(x, GROUND - 50, 10, 260, 0.3, ACID, 5); hordePulse = 1; break;
          case 'lost': {
            const cause = e.cause;
            if (cause === 'cure') { burst(x, y - 50, 18, C_TEAL, 280, 160, 9, 2, 0); floatText('CURED', x, y - 120, TEAL, 22); }
            else if (cause === 'hole') { flyer(x, GROUND + 6, true, (e.id || i) % 3); burst(x, GROUND, 8, C_DIRT, 200, 100, 6, 0, 900); }
            else { flyer(x, y, false, (Math.random() * 3) | 0); burst(x, y - 40, 12, C_BLOOD, 320, 200, 8, 0, 1100); burst(x, y - 40, 6, C_GREEN, 260, 160, 7, 0, 1000); }
            if (!reduced) trauma = Math.min(1, trauma + 0.28);
            hordeHurt = 0.5;
            if (lastMult > 1) lastMult = 1;
            break;
          }
          case 'jump': dust(x, GROUND, 6); break;
          case 'land': dust(x, GROUND, 8); break;
          case 'smash': {
            const col = e.kind === 'car' ? C_CORAL : e.kind === 'soldier' || e.kind === 'riot' ? C_TEAL : C_STONE;
            burst(x, GROUND - 70, 34, col, 620, 420, 16, 1, 1300);
            burst(x, GROUND - 70, 16, C_GOLD, 520, 320, 8, 0, 1000);
            burst(x, GROUND - 10, 10, C_PALE, 200, 60, 20, 2, 0);
            ring(x, GROUND - 70, 30, 700, 0.35, GOLD, 10);
            floatText('SMASH! +50', x, GROUND - 200, GOLD, 40, 1.1);
            if (!reduced) { trauma = Math.min(1, trauma + 0.6); flash = Math.max(flash, 0.35); flashColor = BONE; }
            break;
          }
          case 'mutation': {
            const info = MUT[e.type]; if (!info) break;
            bigBanner.title = info.name + '!'; bigBanner.sub = info.sub; bigBanner.color = info.color; bigBanner.life = bigBanner.max = 1.8;
            ring(leaderX, GROUND - 80, 40, 1200, 0.6, info.color, 14);
            if (!reduced) { flash = Math.max(flash, 0.4); flashColor = info.color; trauma = Math.min(1, trauma + 0.25); }
            break;
          }
          case 'mutationEnd': { const info = MUT[e.type]; if (info) floatText(info.name + ' OVER', leaderX, GROUND - 200, BONE, 22, 1); break; }
          case 'scream': {
            ring(x, GROUND - 70, 30, 1700, 0.7, LILAC, 16);
            ring(x, GROUND - 70, 10, 1100, 0.6, BONE, 6);
            screamGlow = 0.5;
            if (!reduced) { flash = Math.max(flash, 0.45); flashColor = LILAC; trauma = Math.min(1, trauma + 0.45); }
            break;
          }
          case 'brain': burst(x, y, 12, C_PINK, 260, 120, 7, 0, 500); floatText('+1', x, y - 40, PINK, 26, 0.7); break;
          case 'biome': {
            biomeBanner.title = String(e.name || BIOME_NAMES[e.biome] || '').toUpperCase();
            biomeBanner.sub = ['Dusk in the quiet streets', 'Night falls under the green moon', 'Dawn at the quarantine zone'][e.biome] || '';
            biomeBanner.color = [GOLD, ACID, TEAL][e.biome] || BONE; biomeBanner.life = biomeBanner.max = 2.4;
            break;
          }
          case 'mission': {
            let slot = toasts[0];
            for (let j = 0; j < toasts.length; j++) if (toasts[j].life <= 0) { slot = toasts[j]; break; }
            slot.text = String(e.text || 'Mission'); slot.reward = e.reward || 0; slot.life = 3.2;
            break;
          }
          case 'speedUp': floatText('FASTER!', leaderX + 120, GROUND - 260, CORAL, 26, 1); break;
          case 'gameOver': if (!reduced) { flash = Math.max(flash, 0.6); flashColor = CORAL; trauma = 1; } break;
          default: break;
        }
      }
    };

    function drawAttract(dt) {
      attractT += dt;
      const cam = attractT * 280, gt = attractT;
      BGS[1](cam, gt); road(1, cam);
      for (let lane = 0; lane < 3; lane++) {
        for (let i = 13; i >= 0; i--) {
          if (i % 3 !== lane && i !== 0) continue;
          if (i === 0 && lane !== 1) continue;
          const x = 860 - i * 52 - (lane - 1) * 10;
          const wave = ((gt * 0.6 - (860 - x) / 900) % 2.2 + 2.2) % 2.2;
          const y = wave < 0.62 ? Math.sin(wave / 0.62 * Math.PI) * 120 : 0;
          const ph = gt * 15 + i * 1.3, fr = ((Math.floor(ph / TAU * FRAMES) % FRAMES) + FRAMES) % FRAMES;
          const gy = GROUND + (lane - 1) * LANE_GAP;
          drawShadow(x, gy + 2, i === 0 ? 54 : 40);
          drawSet(i === 0 ? SET_LEADER : i % 3, y > 0 ? 2 : fr, x, gy - y, 1, 1, 0);
        }
      }
      speedLines({ speed: 520, config: { startSpeed: 300, maxSpeed: 800 } }, dt);
      g.fillStyle = vignette; g.fillRect(0, 0, W, H);
    }

    self.draw = function (game, alpha, realDt) {
      g = ctx;
      frameNo++;
      const dt = clamp(realDt || 0, 0, 0.1);
      time += dt;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      updateFx(dt);
      if (!game) { drawAttract(dt); return; }

      // new game / tracking
      if (game !== lastGame || (game.time || 0) < lastTime) {
        lastGame = game; lastTime = -1; camVel = 0; overT = 0; curBiome = prevBiome = game.biome || 0; biomeFade = 1;
        lastHorde = game.horde ? game.horde.length : 0; zMem.clear(); hMem.clear(); lastMult = game.multiplier || 1;
        biomeBanner.title = String(BIOME_NAMES[curBiome] || '').toUpperCase(); biomeBanner.sub = 'Run. Bite. Grow the horde.';
        biomeBanner.color = [GOLD, ACID, TEAL][curBiome] || BONE; biomeBanner.life = biomeBanner.max = 2.2;
      }
      const gt = game.time || 0;
      if (gt !== lastTime) {
        if (lastTime >= 0) { const steps = Math.max(1, Math.round((gt - lastTime) / STEP)); camVel = (game.cameraX - lastCam) / steps; }
        lastTime = gt; lastCam = game.cameraX || 0;
      }
      const running = game.status === 'running';
      const off = running ? camVel * clamp(alpha || 0, 0, 1) : 0;
      const cam = (game.cameraX || 0) + off;
      if (!running) overT += dt;
      if ((game.biome || 0) !== curBiome) { prevBiome = curBiome; curBiome = game.biome || 0; biomeFade = 0; }
      biomeFade = Math.min(1, biomeFade + dt / 1.6);
      const hordeN = game.horde ? game.horde.length : 0;
      if (lastHorde >= 0 && hordeN > lastHorde) hordePulse = 1;
      lastHorde = hordeN;
      const mutType = game.mutation && game.mutation.type ? game.mutation.type : null;
      const speed = game.speed || 0;

      // shake
      if (trauma > 0 && !reduced) {
        const s = trauma * trauma * 22;
        shakeX = Math.sin(time * 71) * s; shakeY = Math.cos(time * 53) * s * 0.7;
      } else { shakeX = 0; shakeY = 0; }

      ctx.save();
      ctx.translate(shakeX, shakeY);
      // background (crossfade on biome change)
      if (biomeFade < 1) {
        BGS[prevBiome](cam, time);
        ctx.globalAlpha = biomeFade; BGS[curBiome](cam, time); ctx.globalAlpha = 1;
      } else BGS[curBiome](cam, time);
      road(curBiome, cam);
      speedLines(game, running ? dt : 0);

      // obstacles
      const obs = game.obstacles || [];
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i], sx = o.x - cam;
        if (sx > W + 80 || sx + (o.w || 100) < -80) continue;
        if (o.kind === 'hole') drawHole(o, sx);
      }
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i], sx = o.x - cam;
        if (sx > W + 80 || sx + (o.w || 100) < -80) continue;
        if (o.kind === 'car') drawCar(o, sx, curBiome);
        else if (o.kind === 'barricade') drawBarricade(o, sx, hordeN);
      }
      // pickups
      const pk = game.pickups || [];
      for (let i = 0; i < pk.length; i++) {
        const p = pk[i]; if (p.taken) continue;
        const sx = p.x - cam; if (sx < -40 || sx > W + 40) continue;
        const sy = GROUND - (p.y || 0) - 30 + Math.sin(time * 4 + p.id) * 6;
        drawGlowPink(sx, sy);
        brainShape(sx, sy, 0.55);
      }

      // humans memory (muzzle flash detection)
      const hs = game.humans || [];
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i]; if (h.kind !== 'soldier') continue;
        let m = hMem.get(h.id);
        if (!m) { m = { cd: h.cd || 0, flash: 0 }; hMem.set(h.id, m); }
        if ((h.cd || 0) > m.cd + 0.05) m.flash = 0.09;
        m.cd = h.cd || 0;
      }
      // humans + horde, back lane to front lane
      const horde = game.horde || [];
      leaderX = horde.length ? horde[0].x + off : leaderX;
      for (let lane = 0; lane < 3; lane++) {
        for (let i = 0; i < hs.length; i++) {
          const h = hs[i];
          if (clamp(Math.round(h.lane || 0), 0, 2) !== lane) continue;
          const sx = h.x - cam; if (sx < -120 || sx > W + 120) continue;
          drawHuman(h, sx, GROUND + (lane - 1) * LANE_GAP - (h.y || 0));
        }
        for (let i = horde.length - 1; i >= 0; i--) {
          const z = horde[i];
          if (clamp(Math.round(z.lane || 0), 0, 2) !== lane) continue;
          const sx = z.x + off - cam; if (sx < -120 || sx > W + 120) continue;
          drawZombie(z, i === 0 || z.leader === true, sx, gt, speed, mutType);
        }
      }
      // projectiles
      const pr = game.projectiles || [];
      for (let i = 0; i < pr.length; i++) {
        const p = pr[i], sx = p.x - cam;
        if (sx < -80 || sx > W + 80) continue;
        drawProjectile(p, sx);
      }
      drawWorldFx(cam);
      ctx.restore();

      // screen-space overlays
      if (mutType && MUT[mutType]) { ctx.fillStyle = MUT[mutType].tint; ctx.fillRect(0, 0, W, H); }
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
      if (flash > 0 && !reduced) { ctx.globalAlpha = clamp(flash, 0, 0.6) * 0.6; ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (!running) { ctx.globalAlpha = clamp(overT * 1.4, 0, 0.55); ctx.fillStyle = '#0A0612'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
      if (running || overT < 0.4) { hud(game); banners(); }

      // prune per-zombie memory
      if (zMem.size > 160) zMem.forEach((m, id) => { if (frameNo - m.seen > 30) zMem.delete(id); });
      if (hMem.size > 60) { const alive = new Set(); for (let i = 0; i < hs.length; i++) alive.add(hs[i].id); hMem.forEach((m, id) => { if (!alive.has(id)) hMem.delete(id); }); }
    };
    let pinkGlow;
    function drawGlowPink(x, y) {
      if (pinkGlow === undefined) pinkGlow = bakeRadial(40, 'rgba(255,143,184,0.6)', 'rgba(255,143,184,0)');
      if (pinkGlow) g.drawImage(pinkGlow, x - 34, y - 34, 68, 68);
      else { g.fillStyle = 'rgba(255,143,184,.3)'; g.beginPath(); g.arc(x, y, 26, 0, TAU); g.fill(); }
    }

    self.resize();
    return self;
  }

  const ZRender = { create, W, H, GROUND };
  root.ZRender = ZRender;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZRender;
})(typeof globalThis !== 'undefined' ? globalThis : this);
