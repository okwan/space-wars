// Sound: small synthesized cues on Web Audio, started on the first gesture, mute on M.

import { audioContext } from './hook';

/** The game's sound board. */
export class Sound {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  muted = false;
  constructor(public volume: number) {}

  /** Starts (or resumes) audio; call on a key or pointer gesture. */
  start(): void {
    if (!this.ac) {
      this.ac = audioContext();
      this.out = this.ac.createGain(); this.out.gain.value = this.muted ? 0 : this.volume;
      this.out.connect(this.ac.destination);
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
  }
  setMuted(m: boolean): void { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : this.volume; }

  private hum: { g: GainNode; f: BiquadFilterNode } | null = null;
  private bed: { g: GainNode } | null = null;
  /** A loop of white noise, made once: the body of the engine sound. */
  private noise(): AudioBufferSourceNode {
    const ac = this.ac!, buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
    let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; return src;
  }
  /** Your engine: filtered noise that swells with thrust and brightens on afterburner. */
  private was = '';
  engine(on: boolean, burn: boolean): void {
    if (!this.ac || !this.out) return;
    const key = `${on}${burn}`; if (key === this.was) return; this.was = key;
    if (!this.hum) {
      const src = this.noise(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0;
      src.connect(f).connect(g).connect(this.out); src.start();
      this.hum = { g, f };
    }
    const t = this.ac.currentTime;
    this.hum.g.gain.setTargetAtTime(on ? (burn ? 0.09 : 0.05) : 0, t, 0.06);
    this.hum.f.frequency.setTargetAtTime(burn ? 1400 : 420, t, 0.1);
  }
  /** The zone's bed: a low two-note drone breathing through a slow filter, under play only. */
  private bedOn = false;
  ambient(on: boolean): void {
    if (!this.ac || !this.out || (this.bed && on === this.bedOn)) return;
    this.bedOn = on;
    if (!this.bed) {
      const g = this.ac.createGain(), f = this.ac.createBiquadFilter(), lfo = this.ac.createOscillator(), depth = this.ac.createGain();
      g.gain.value = 0; f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 4;
      lfo.frequency.value = 0.07; depth.gain.value = 220; lfo.connect(depth).connect(f.frequency); lfo.start();
      for (const [freq, type] of [[55, 'sawtooth'], [82.4, 'triangle'], [110.6, 'sine']] as const) {
        const o = this.ac.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = (freq % 7) - 3; o.connect(f); o.start();
      }
      f.connect(g).connect(this.out);
      this.bed = { g };
    }
    this.bed.g.gain.setTargetAtTime(on ? 0.05 : 0, this.ac.currentTime, 0.8);
  }

  /** One tone with an optional pitch slide, on the audio clock. */
  tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, slide = 0, delay = 0): void {
    if (!this.ac || !this.out || this.muted) return;
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur);
  }
  shoot(): void { this.tone(880, 0.06, 'square', 0.05, 0.6); }
  heavy(): void { this.tone(300, 0.14, 'sawtooth', 0.08, 0.5); }
  hit(): void { this.tone(200, 0.08, 'triangle', 0.12, 0.7); }
  boom(): void { this.tone(120, 0.45, 'sawtooth', 0.2, 0.3); this.tone(70, 0.6, 'triangle', 0.2, 0.5); }
  kill(): void { this.tone(660, 0.1, 'square', 0.12); this.tone(990, 0.16, 'square', 0.12, 0, 0.07); }
  capture(): void { this.tone(523, 0.12, 'triangle', 0.18); this.tone(784, 0.25, 'triangle', 0.18, 0, 0.11); }
  lost(): void { this.tone(330, 0.35, 'triangle', 0.15, 0.6); }
  /** Salvage picked up: a bright rising chirp, unlike any combat sound. */
  pickup(): void { this.tone(740, 0.07, 'sine', 0.14, 1.4); this.tone(1180, 0.12, 'sine', 0.12, 0, 0.06); }
  mine(): void { this.tone(160, 0.12, 'square', 0.1, 1.5); }
  /** Low energy: two short falling beeps, the sound backup for the red HUD bar. */
  warn(): void { this.tone(520, 0.07, 'square', 0.07, 0.8); this.tone(390, 0.09, 'square', 0.07, 0.8, 0.1); }
  win(): void { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, 0, i * 0.12)); }
}
