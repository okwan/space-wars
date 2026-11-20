// PROTOTYPE - NOT FOR PRODUCTION
// Small synthesized sounds for the HUD's feedback: hit ticks, the kill fanfare, coins landing.
// Web Audio only, no files. Starts on the first key or click (browsers require a gesture); M mutes.

export class Sfx {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  muted = false;

  /** Starts or resumes audio; call from a key or pointer gesture. */
  start(): void {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.out = this.ac.createGain(); this.out.gain.value = this.muted ? 0 : 0.5;
      const comp = this.ac.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ac.destination);
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
  }
  toggle(): void { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.5; }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0): void {
    if (!this.ac || !this.out || this.muted) return;
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }

  shoot(): void { this.tone(1300, 0.05, 'square', 0.025, 0.5); }
  bomb(): void { this.tone(260, 0.16, 'sawtooth', 0.06, 0.45); }
  mine(): void { this.tone(420, 0.1, 'triangle', 0.08, 1.5); }
  /** Your shot landed: a short bright tick, a little higher when the target is nearly dead. */
  hitConfirm(low: boolean): void { this.tone(low ? 2100 : 1700, 0.045, 'square', 0.05); this.tone(3400, 0.03, 'sine', 0.03, 0, 0.01); }
  /** You took a hit: a dull thud. */
  hurt(): void { this.tone(150, 0.12, 'triangle', 0.14, 0.6); }
  /** You downed someone: a punchy low boom under a rising major arpeggio. Higher on a streak. */
  kill(streak: number): void {
    const up = Math.pow(2, Math.min(4, streak - 1) * 2 / 12); // a whole tone higher per streak step
    this.tone(90, 0.35, 'sine', 0.35, 0.5);
    this.tone(180, 0.18, 'triangle', 0.15, 0.5);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f * up, 0.16 + i * 0.04, 'square', 0.07, 0, 0.05 + i * 0.055);
      this.tone(f * up * 2, 0.12, 'sine', 0.04, 0, 0.05 + i * 0.055);
    });
  }
  /** One coin landing in the score: pitch climbs as the coins pour in. */
  coin(i: number): void { const f = 1500 * Math.pow(2, Math.min(i, 14) / 24); this.tone(f, 0.07, 'sine', 0.08); this.tone(f * 1.5, 0.05, 'sine', 0.03, 0, 0.02); }
  salvage(): void { this.tone(600, 0.2, 'triangle', 0.1, 2.2); this.tone(900, 0.2, 'sine', 0.06, 2, 0.08); }
  /** You were downed. */
  downed(): void { this.tone(440, 0.5, 'triangle', 0.12, 0.4); this.tone(110, 0.6, 'sine', 0.2, 0.5); }
}
