'use strict';
/* Lumen Drift — sound effects, synthesized live with WebAudio.
   No audio files are shipped; every effect is an oscillator or a
   short burst of filtered noise, mixed through one master gain. */

const AudioSys = {
  ctx: null,
  master: null,
  muted: false,

  /* Create the context on first use (browsers require a user gesture). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  },

  /* One oscillator note with a pitch slide and an exponential decay. */
  tone(o) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + (o.dur || 0.12));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.12));
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + (o.dur || 0.12) + 0.05);
  },

  /* A burst of white noise through a low-pass filter. */
  noise(o) {
    if (!this.ctx || this.muted) return;
    const dur = o.dur || 0.25;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(o.cutoff || 1800, t0);
    if (o.cutoffTo) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.cutoffTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
  },

  shoot() {
    this.tone({ freq: 880, slideTo: 320, dur: 0.07, type: 'square', vol: 0.08 });
  },
  enemyShoot() {
    this.tone({ freq: 240, slideTo: 140, dur: 0.12, type: 'sawtooth', vol: 0.07 });
  },
  boom(big) {
    this.noise({ dur: big ? 0.55 : 0.3, vol: big ? 0.5 : 0.3, cutoff: 2400, cutoffTo: 120 });
    this.tone({ freq: big ? 160 : 220, slideTo: 40, dur: big ? 0.5 : 0.28, type: 'sine', vol: 0.4 });
  },
  hit() {
    this.noise({ dur: 0.18, vol: 0.35, cutoff: 900, cutoffTo: 150 });
    this.tone({ freq: 130, slideTo: 55, dur: 0.22, type: 'sawtooth', vol: 0.25 });
  },
  dash() {
    this.noise({ dur: 0.22, vol: 0.2, cutoff: 3200, cutoffTo: 500 });
  },
  power() {
    this.tone({ freq: 520, dur: 0.09, type: 'sine', vol: 0.2 });
    this.tone({ freq: 660, dur: 0.09, type: 'sine', vol: 0.2, delay: 0.08 });
    this.tone({ freq: 880, dur: 0.16, type: 'sine', vol: 0.22, delay: 0.16 });
  },
  waveStart() {
    this.tone({ freq: 440, dur: 0.1, type: 'triangle', vol: 0.18 });
    this.tone({ freq: 587, dur: 0.14, type: 'triangle', vol: 0.18, delay: 0.1 });
  },
  gameOver() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.34, type: 'triangle', vol: 0.22, delay: i * 0.22 }));
  },
  click() {
    this.tone({ freq: 1200, dur: 0.04, type: 'sine', vol: 0.12 });
  }
};
