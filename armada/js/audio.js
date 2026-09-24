/* Armada — synthesised sound with Web Audio. Nothing is loaded from files. */
(function (AR) {
  "use strict";

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let ufoVoice = null;
  let muted = false;

  function init() {
    if (ctx) return ctx.state === "suspended" ? ctx.resume() : null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    // gentle compression keeps stacked explosions from clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function env(gain, t, a, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  function noise(t, dur, { freq = 1200, q = 0.7, type = "lowpass", peak = 0.5, sweepTo = null, attack = 0.005 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const gn = ctx.createGain();
    env(gn, t, attack, peak, dur);
    src.connect(f).connect(gn).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + attack + 0.05);
  }

  function tone(t, dur, { type = "sine", from = 440, to = null, peak = 0.3, attack = 0.004 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gn = ctx.createGain();
    env(gn, t, attack, peak, dur);
    o.connect(gn).connect(master);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  // The four descending bass notes of the march.
  const MARCH = [98, 87.3, 77.8, 73.4];

  const sounds = {
    march(e) {
      const t = ctx.currentTime, f = MARCH[e.note];
      tone(t, 0.16, { type: "triangle", from: f * 1.6, to: f, peak: 0.55 });
      tone(t, 0.12, { type: "square", from: f, to: f * 0.9, peak: 0.08 });
    },
    fire() {
      const t = ctx.currentTime;
      tone(t, 0.18, { type: "sawtooth", from: 1900, to: 240, peak: 0.07 });
      tone(t, 0.12, { type: "sine", from: 1400, to: 300, peak: 0.12 });
      noise(t, 0.08, { freq: 4000, type: "highpass", peak: 0.06 });
    },
    kill() {
      const t = ctx.currentTime;
      noise(t, 0.35, { freq: 2600, sweepTo: 300, peak: 0.45 });
      tone(t, 0.25, { type: "sine", from: 160, to: 45, peak: 0.35 });
    },
    impact(e) {
      const t = ctx.currentTime;
      if (e.on === "top") return;
      noise(t, 0.14, { freq: e.on === "bunker" ? 1800 : 3000, sweepTo: 400, peak: 0.18 });
    },
    alienFire() {
      const t = ctx.currentTime;
      tone(t, 0.14, { type: "square", from: 420, to: 180, peak: 0.025 });
    },
    playerDeath() {
      const t = ctx.currentTime;
      noise(t, 1.4, { freq: 3000, sweepTo: 80, peak: 0.8, q: 1.2 });
      tone(t, 1.0, { type: "sawtooth", from: 120, to: 30, peak: 0.25 });
      noise(t + 0.15, 0.9, { freq: 900, sweepTo: 60, peak: 0.4 });
    },
    ufo() {
      stopUfo();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 520;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = 140;
      lfo.connect(depth).connect(o.frequency);
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.09, t + 0.3);
      o.connect(gn).connect(master);
      o.start(t);
      lfo.start(t);
      ufoVoice = { o, lfo, gn };
    },
    ufoGone: () => stopUfo(),
    ufoKill() {
      stopUfo();
      const t = ctx.currentTime;
      noise(t, 1.0, { freq: 2500, sweepTo: 120, peak: 0.7 });
      tone(t, 0.7, { type: "sine", from: 900, to: 60, peak: 0.25 });
    },
    extraLife() {
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.09, 0.25, { type: "triangle", from: f, peak: 0.15 }));
    },
    waveCleared() {
      stopUfo();
      const t = ctx.currentTime;
      [392, 523, 659].forEach((f, i) => tone(t + i * 0.12, 0.4, { type: "triangle", from: f, peak: 0.12 }));
    },
    gameOver: () => stopUfo(),
  };

  function stopUfo() {
    if (!ufoVoice) return;
    const { o, lfo, gn } = ufoVoice;
    const t = ctx.currentTime;
    gn.gain.cancelScheduledValues(t);
    gn.gain.setValueAtTime(gn.gain.value, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.stop(t + 0.2);
    lfo.stop(t + 0.2);
    ufoVoice = null;
  }

  AR.audio = {
    init,
    play(e) {
      if (!ctx || !sounds[e.type]) return;
      sounds[e.type](e);
    },
    stopAll: () => ctx && stopUfo(),
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
})(window.AR);
