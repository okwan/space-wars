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
  mine(): void { this.tone(160, 0.12, 'square', 0.1, 1.5); }
  /** Low energy: two short falling beeps, the sound backup for the red HUD bar. */
  warn(): void { this.tone(520, 0.07, 'square', 0.07, 0.8); this.tone(390, 0.09, 'square', 0.07, 0.8, 0.1); }
  win(): void { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, 0, i * 0.12)); }
}
