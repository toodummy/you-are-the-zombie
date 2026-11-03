/* ZAudio: WebAudio sound effects and a light procedural beat. Silent-safe: never throws,
   does nothing until unlock() is called from a user gesture, and works (silently) in Node. */
(function (root) {
  'use strict';

  function create() {
    let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
    let muted = false, failed = false;
    let nextBeat = 0, beatStep = 0, playing = false, lastSpeed = 0;
    let lastBiteAt = -1, biteCount = 0;

    function now() { return ac ? ac.currentTime : 0; }

    function unlock() {
      if (failed) return;
      try {
        if (!ac) {
          const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
          if (!AC) { failed = true; return; }
          ac = new AC();
          master = ac.createGain(); master.gain.value = muted ? 0 : 0.55;
          const comp = ac.createDynamicsCompressor();
          comp.threshold.value = -16; comp.ratio.value = 4;
          master.connect(comp); comp.connect(ac.destination);
          sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
          musicBus = ac.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
          const len = Math.floor(ac.sampleRate * 0.6);
          noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended' && ac.resume) ac.resume();
      } catch (e) { failed = true; ac = null; }
    }

    /* --- voices --- */
    function tone(type, f0, f1, dur, vol, when, bus) {
      if (!ac) return;
      try {
        const t = (when || now()), o = ac.createOscillator(), a = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(Math.max(20, f0), t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        a.gain.setValueAtTime(0.0001, t);
        a.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(a); a.connect(bus || sfxBus);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (e) { /* optional */ }
    }
    function noise(dur, vol, filterType, f0, f1, when, bus, q) {
      if (!ac || !noiseBuf) return;
      try {
        const t = (when || now()), src = ac.createBufferSource(), fl = ac.createBiquadFilter(), a = ac.createGain();
        src.buffer = noiseBuf;
        fl.type = filterType; fl.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
        fl.Q.value = q || 1;
        a.gain.setValueAtTime(0.0001, t);
        a.gain.exponentialRampToValueAtTime(vol, t + 0.005);
        a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(fl); fl.connect(a); a.connect(bus || sfxBus);
        src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
      } catch (e) { /* optional */ }
    }

    const SFX = {
      bite(pitch) {
        const p = pitch || 1;
        noise(0.09, 0.5, 'bandpass', 1800 * p, 600 * p, 0, null, 2);
        tone('square', 190 * p, 70, 0.1, 0.18);
        noise(0.05, 0.3, 'highpass', 3000, 2000, now() + 0.04, null, 1);
      },
      join() { tone('triangle', 520, 880, 0.08, 0.06); },
      jump() { noise(0.22, 0.22, 'bandpass', 500, 2400, 0, null, 3); tone('sine', 220, 440, 0.15, 0.06); },
      land() { tone('sine', 120, 45, 0.14, 0.32); noise(0.06, 0.12, 'lowpass', 600, 200); },
      lost() { noise(0.18, 0.45, 'lowpass', 1400, 200, 0, null, 1); tone('sawtooth', 300, 80, 0.2, 0.12); },
      smash() {
        tone('sine', 110, 30, 0.5, 0.6);
        noise(0.45, 0.55, 'lowpass', 2500, 120, 0, null, 0.8);
        noise(0.12, 0.25, 'highpass', 4000, 1500, now() + 0.02);
      },
      brain() { tone('triangle', 1320, 1320, 0.09, 0.14); tone('triangle', 1760, 1760, 0.16, 0.12, now() + 0.07); },
      scream() {
        tone('sawtooth', 700, 180, 0.7, 0.2); tone('sawtooth', 740, 200, 0.7, 0.14);
        noise(0.6, 0.3, 'bandpass', 1200, 400, 0, null, 2);
      },
      mutation() {
        const t = now();
        [392, 494, 587, 784].forEach((f, i) => { tone('square', f, f, 0.16, 0.12, t + i * 0.08); tone('triangle', f * 2, f * 2, 0.12, 0.05, t + i * 0.08); });
      },
      mutationEnd() { tone('triangle', 600, 300, 0.25, 0.1); },
      gameOver() {
        const t = now();
        [330, 262, 196, 131].forEach((f, i) => tone('sawtooth', f, f * 0.97, 0.3, 0.16, t + i * 0.16));
        noise(0.8, 0.25, 'lowpass', 800, 80, t);
      },
      mission() { const t = now(); [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.14, 0.12, t + i * 0.07)); },
      biome() { tone('sine', 196, 392, 0.6, 0.12); },
      speedUp() { tone('square', 440, 660, 0.12, 0.05); },
      ui() { tone('triangle', 660, 880, 0.06, 0.08); }
    };

    function onEvents(events, game) {
      if (!ac || muted || !events || !events.length) return;
      try {
        let bites = 0, lost = 0;
        for (let i = 0; i < events.length; i++) {
          const e = events[i]; if (!e) continue;
          switch (e.type) {
            case 'bite': bites++; break;
            case 'lost': lost++; break;
            case 'jump': SFX.jump(); break;
            case 'land': SFX.land(); break;
            case 'smash': SFX.smash(); break;
            case 'brain': SFX.brain(); break;
            case 'scream': SFX.scream(); break;
            case 'mutation': SFX.mutation(); break;
            case 'mutationEnd': SFX.mutationEnd(); break;
            case 'gameOver': SFX.gameOver(); playing = false; break;
            case 'mission': SFX.mission(); break;
            case 'biome': SFX.biome(); break;
            case 'speedUp': SFX.speedUp(); break;
            default: break;
          }
        }
        if (bites) {
          const t = now();
          biteCount = t - lastBiteAt < 1.5 ? Math.min(biteCount + 1, 12) : 0;
          lastBiteAt = t;
          SFX.bite(1 + biteCount * 0.04);
        }
        if (lost) SFX.lost();
      } catch (e) { /* optional */ }
    }

    /* --- procedural beat: 16 steps, tempo follows game.speed --- */
    const BASS = [55, 0, 0, 55, 0, 0, 65.4, 0, 49, 0, 0, 49, 0, 0, 73.4, 61.7];
    function scheduleStep(step, t, intensity, mut) {
      if (step % 4 === 0) { tone('sine', 150, 42, 0.18, 0.5, t, musicBus); }
      if (step % 8 === 4) noise(0.12, 0.22, 'bandpass', 1800, 900, t, musicBus, 0.7);
      if (step % 2 === 1) noise(0.03, 0.08 + 0.06 * intensity, 'highpass', 7000, 7000, t, musicBus);
      const b = BASS[step];
      if (b) tone('sawtooth', b * 2, b * 2, 0.16, 0.09, t, musicBus);
      if (mut && step % 4 === 2) tone('square', 440 + (step % 8) * 40, 440, 0.07, 0.04, t, musicBus);
    }
    function update(game) {
      if (!ac || failed) return;
      try {
        const run = !!(game && game.status === 'running') && !muted;
        if (!run) { playing = false; return; }
        const c = game.config || {}, s0 = c.startSpeed || 300, s1 = c.maxSpeed || 800;
        const intensity = Math.max(0, Math.min(1, ((game.speed || s0) - s0) / Math.max(1, s1 - s0)));
        const bpm = 104 + intensity * 56;
        const stepDur = 60 / bpm / 4;
        const t = now();
        if (!playing || nextBeat < t - 0.2) { playing = true; nextBeat = t + 0.05; beatStep = 0; }
        lastSpeed = game.speed || 0;
        const mut = !!(game.mutation && game.mutation.type);
        while (nextBeat < t + 0.12) {
          scheduleStep(beatStep, nextBeat, intensity, mut);
          nextBeat += stepDur; beatStep = (beatStep + 1) % 16;
        }
      } catch (e) { /* optional */ }
    }

    function setMuted(b) {
      muted = !!b;
      try { if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.55, ac.currentTime, 0.02); } catch (e) { /* optional */ }
      if (muted) playing = false;
    }
    function play(name) { try { if (ac && !muted && SFX[name]) SFX[name](); } catch (e) { /* optional */ } }

    return {
      unlock, onEvents, update, setMuted, play,
      get muted() { return muted; },
      get ready() { return !!ac; }
    };
  }

  const ZAudio = { create };
  root.ZAudio = ZAudio;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZAudio;
})(typeof globalThis !== 'undefined' ? globalThis : this);
