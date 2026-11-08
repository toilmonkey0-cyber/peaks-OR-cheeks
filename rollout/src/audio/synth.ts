import type { Tier } from "@/data/schema";
import { chargeFreq, lockFreq } from "./schedule";

/**
 * Zero-asset sound: everything synthesized on the audio clock. The AudioContext
 * is created lazily inside a user gesture (iOS unlock); all fire-and-forget
 * voices are scheduled relative to ctx.currentTime.
 */
class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private riser: { osc: OscillatorNode; lp: BiquadFilterNode; gain: GainNode } | null = null;
  private enabled = true;
  private crowdWanted = false;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture at least once. Safe to call repeatedly. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = globalThis.AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(comp).connect(this.ctx.destination);
    if (this.crowdWanted) this.crowdStart();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
    }
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private blip(freq: number, durS: number, type: OscillatorType, gain: number, at = 0): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.t + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + durS + 0.02);
  }

  private noise(durS: number, gain: number, filterHz: number, at = 0): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.t + at;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * durS));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterHz;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  /** Stream tick — thin mechanical click. */
  tick(): void {
    this.noise(0.018, 0.14, 2600);
    this.blip(1900, 0.012, "square", 0.02);
  }

  /** Staggered locks climb the ladder; final lock adds a body thump. */
  lock(step: number, final = false): void {
    this.blip(lockFreq(step), 0.16, "sine", 0.35);
    this.blip(lockFreq(step) * 2, 0.08, "triangle", 0.12);
    if (final) this.noise(0.09, 0.22, 300);
  }

  rollupNote(i: number): void {
    // A minor pentatonic run upward as OVR counts up
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
    this.blip(scale[Math.min(scale.length - 1, i)], 0.1, "triangle", 0.14);
  }

  chargeStart(): void {
    if (!this.ctx || !this.master || !this.enabled || this.chargeOsc) return;
    this.chargeOsc = this.ctx.createOscillator();
    this.chargeGain = this.ctx.createGain();
    this.chargeOsc.type = "sawtooth";
    this.chargeOsc.frequency.value = chargeFreq(0);
    this.chargeGain.gain.value = 0.0001;
    this.chargeGain.gain.setTargetAtTime(0.07, this.t, 0.08);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    this.chargeOsc.connect(lp).connect(this.chargeGain).connect(this.master);
    this.chargeOsc.start();
  }

  chargeUpdate(elapsedMs: number): void {
    if (this.chargeOsc && this.ctx) {
      this.chargeOsc.frequency.setTargetAtTime(chargeFreq(elapsedMs), this.t, 0.03);
    }
  }

  chargeStop(): void {
    if (this.chargeOsc && this.ctx && this.chargeGain) {
      const t0 = this.t;
      this.chargeGain.gain.setTargetAtTime(0.0001, t0, 0.03);
      this.chargeOsc.stop(t0 + 0.3);
    }
    this.chargeOsc = null;
    this.chargeGain = null;
  }

  /** Riser that gets violently cut — the near-miss. */
  nearMiss(): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.t;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.5);
    g.gain.setValueAtTime(0.12, t0);
    g.gain.setValueAtTime(0.12, t0 + 0.5);
    g.gain.linearRampToValueAtTime(0, t0 + 0.52); // hard cutoff
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.55);
  }

  stinger(tier: Tier, xfactor: boolean): void {
    switch (tier) {
      case "common":
        this.blip(330, 0.14, "sine", 0.2);
        break;
      case "rare":
        this.blip(392, 0.16, "triangle", 0.22);
        this.blip(494, 0.2, "triangle", 0.18, 0.09);
        break;
      case "elite":
        [329.6, 415.3, 493.9].forEach((f, i) => this.blip(f, 0.35, "sawtooth", 0.1, i * 0.05));
        this.noise(0.25, 0.1, 1200);
        break;
      case "legend":
        [164.8, 207.7, 246.9, 329.6].forEach((f, i) => this.blip(f, 0.8, "sawtooth", 0.11, i * 0.04));
        this.blip(55, 0.9, "sine", 0.3);           // sub drop body
        this.noise(0.5, 0.16, 800);                // crash-ish wash
        break;
    }
    if (xfactor) {
      [1318.5, 1568, 2093].forEach((f, i) => this.blip(f, 0.3, "sine", 0.08, 0.25 + i * 0.07));
    }
  }

  /** Briefly duck the crowd under the judgment beat. */
  duckCrowd(ms: number): void {
    if (!this.ctx || !this.crowdGain) return;
    const t0 = this.t;
    this.crowdGain.gain.setTargetAtTime(0.004, t0, 0.05);
    this.crowdGain.gain.setTargetAtTime(0.05, t0 + ms / 1000, 0.3);
  }

  // ── FORMATION voices ──────────────────────────────────────────────────────
  /** The breathing riser under a FORMATION charge. */
  formationRiserStart(): void {
    if (!this.ctx || !this.master || !this.enabled || this.riser) return;
    const osc = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 90;
    lp.type = "lowpass";
    lp.frequency.value = 400;
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.045, this.t, 0.08);
    osc.connect(lp).connect(gain).connect(this.master);
    osc.start();
    this.riser = { osc, lp, gain };
  }

  /** level 0..1 climbs pitch + brightness; breath -1..1 swells the gain with each inhale. */
  formationRiserUpdate(level: number, breath: number): void {
    if (!this.riser || !this.ctx) return;
    const t = this.t;
    this.riser.osc.frequency.setTargetAtTime(90 * Math.pow(4, level), t, 0.05);
    this.riser.lp.frequency.setTargetAtTime(400 + level * 2600, t, 0.05);
    this.riser.gain.gain.setTargetAtTime(0.03 + 0.035 * level * (0.55 + 0.45 * Math.max(0, breath)), t, 0.03);
  }

  formationRiserStop(): void {
    if (!this.riser || !this.ctx) { this.riser = null; return; }
    const { osc, gain } = this.riser;
    const t = this.t;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.015);
    osc.stop(t + 0.12);
    this.riser = null;
  }

  /** CONFIRMED wave: each slot pops a step higher. */
  waveTick(i: number): void {
    this.blip(480 + i * 42, 0.09, "triangle", 0.07);
  }

  /** The call stands. */
  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.34, "triangle", 0.09, i * 0.09));
    this.blip(1568, 0.5, "triangle", 0.06, 0.36);
    this.noise(0.3, 0.02, 5000);
  }

  /** The wrong call: one dull thunk, nothing else. */
  thunk(): void {
    this.blip(105, 0.08, "square", 0.05);
    this.blip(70, 0.1, "sine", 0.09, 0.03);
  }

  /** The card leaving the stage. */
  whoosh(): void {
    this.noise(0.32, 0.05, 1400);
    this.blip(300, 0.36, "sawtooth", 0.03);
  }

  /** The card landing in its slot. */
  landThud(): void {
    this.blip(90, 0.16, "sine", 0.28);
    this.blip(55, 0.2, "sine", 0.2, 0.02);
  }

  /** Static on the charge past halfway. */
  crackle(): void {
    this.noise(0.025 + Math.random() * 0.03, 0.03, 2500);
  }

  /** Top-of-breath release. */
  perfect(): void {
    this.blip(1320, 0.18, "triangle", 0.08);
    this.blip(1760, 0.2, "triangle", 0.08, 0.06);
    this.blip(2640, 0.35, "triangle", 0.07, 0.12);
  }

  /** Scan release thump — layered under the tick engine. */
  kick(): void {
    this.blip(72, 0.16, "sine", 0.22);
    this.noise(0.05, 0.12, 1800);
  }

  /** The Void: reality tearing, then the house deals. */
  voidGlitch(): void {
    this.blip(880, 0.12, "sawtooth", 0.12);
    this.blip(233, 0.18, "square", 0.1, 0.04);
    this.blip(1244, 0.09, "sawtooth", 0.1, 0.12);
    this.noise(0.4, 0.14, 3000);
  }
  voidDeal(): void {
    this.blip(65.4, 1.4, "sine", 0.26);
    [164.8, 196, 233.1, 311.1].forEach((f, i) => this.blip(f, 1.3, "sine", 0.08, i * 0.06));
    this.noise(0.8, 0.06, 500);
  }

  /** Duel open: gold blip, then brown. */
  duelStart(): void {
    this.blip(659.3, 0.18, "triangle", 0.16);
    this.blip(392, 0.26, "triangle", 0.16, 0.14);
  }

  /** Pass-the-phone tick. */
  turnTick(): void {
    this.blip(523.3, 0.09, "sine", 0.1);
    this.blip(392, 0.12, "sine", 0.09, 0.09);
  }

  /** NO MIDS activation: low swell, gold-brown mood. */
  modeSwell(): void {
    this.blip(98, 0.9, "sawtooth", 0.08);
    this.blip(147, 0.9, "sawtooth", 0.07, 0.05);
    this.blip(196, 1.1, "sine", 0.09, 0.1);
    this.noise(0.6, 0.08, 600);
  }

  /** Descending detuned saw note with end-of-phrase bend — one trombone blat. */
  private tromboneNote(freq: number, at: number, durS: number, gain: number, bend = false): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.t + at;
    for (const det of [-4, 4]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = det;
      osc.frequency.setValueAtTime(freq * 1.06, t0);
      osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.06);
      if (bend) {
        osc.frequency.setValueAtTime(freq, t0 + durS * 0.55);
        osc.frequency.linearRampToValueAtTime(freq * 0.82, t0 + durS);
      }
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.05);
      g.gain.setValueAtTime(gain, t0 + durS * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      osc.connect(lp).connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + durS + 0.05);
    }
  }

  /** The verdict fanfares. */
  celebrate(kind: "peak" | "cheeks" | "atomic"): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    if (kind === "peak") {
      [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) =>
        this.blip(f, 1.1, "sawtooth", 0.09, i * 0.035));
      this.blip(65.4, 1.2, "sine", 0.3);
      this.noise(0.7, 0.14, 900);
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
        this.blip(f, 0.35, "sine", 0.07, 0.28 + i * 0.06));
    } else if (kind === "cheeks") {
      // wah — wah — waaah
      this.tromboneNote(196, 0.0, 0.22, 0.14);          // G3
      this.tromboneNote(164.8, 0.26, 0.22, 0.14);       // E3
      this.tromboneNote(130.8, 0.52, 0.75, 0.16, true); // C3, long bend
    } else {
      // atomic: four-step funeral descent
      this.tromboneNote(196, 0.0, 0.2, 0.14);
      this.tromboneNote(174.6, 0.24, 0.2, 0.14);
      this.tromboneNote(146.8, 0.48, 0.2, 0.14);
      this.tromboneNote(110, 0.72, 1.1, 0.17, true);
      this.blip(49, 1.2, "sine", 0.28);
    }
  }

  setCrowd(on: boolean): void {
    this.crowdWanted = on;
    if (on && this.ctx) this.crowdStart();
    else this.crowdStop();
  }

  private crowdStart(): void {
    if (!this.ctx || !this.master || this.crowdSource) return;
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish noise
      data[i] = last * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.0001;
    this.crowdGain.gain.setTargetAtTime(0.05, this.t, 0.8);
    src.connect(f).connect(this.crowdGain).connect(this.master);
    src.start();
    this.crowdSource = src;
  }

  private crowdStop(): void {
    if (this.crowdSource && this.ctx && this.crowdGain) {
      this.crowdGain.gain.setTargetAtTime(0.0001, this.t, 0.3);
      const src = this.crowdSource;
      setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 1200);
    }
    this.crowdSource = null;
    this.crowdGain = null;
  }
}

export const synth = new Synth();
