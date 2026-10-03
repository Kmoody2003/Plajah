// Web Audio synthesizer for Live Premiere countdowns and transitions.
// Zero network dependencies, instant response, customizable themes.

class PremiereAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /** Play countdown second tick. Higher pitch for last 3 seconds. */
  public playTick(secondsRemaining: number, theme: string = 'cinematic') {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const isUrgent = secondsRemaining <= 3 && secondsRemaining > 0;
      const isFinal = secondsRemaining === 0;

      if (isFinal) {
        this.playLaunchImpact();
        return;
      }

      if (theme === 'classic') {
        // SMPTE film leader 1kHz reference sync tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isUrgent ? 1200 : 1000, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(isUrgent ? 0.35 : 0.25, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (theme === 'cyber') {
        // High-tech sci-fi ping with pulse modulation
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(isUrgent ? 1760 : 880, now);
        osc.frequency.exponentialRampToValueAtTime(isUrgent ? 880 : 440, now + 0.07);

        sub.type = 'sine';
        sub.frequency.setValueAtTime(isUrgent ? 220 : 110, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

        osc.connect(gain);
        sub.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        sub.start(now);
        osc.stop(now + 0.1);
        sub.stop(now + 0.1);
      } else if (theme === 'gold') {
        // Soft golden acoustic bell harmonic
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        const baseFreq = isUrgent ? 659.25 : 523.25; // E5 or C5
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(baseFreq, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseFreq * 2.5, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.36);
        osc2.stop(now + 0.36);
      } else {
        // Default 'cinematic': sub-bass thud + crisp click
        const subOsc = ctx.createOscillator();
        const clickOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        const clickGain = ctx.createGain();

        // Sub thud
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(isUrgent ? 160 : 120, now);
        subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        subGain.gain.setValueAtTime(0.3, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        // Click transient
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(isUrgent ? 1200 : 800, now);
        clickGain.gain.setValueAtTime(0.2, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        subOsc.connect(subGain);
        clickOsc.connect(clickGain);
        subGain.connect(ctx.destination);
        clickGain.connect(ctx.destination);

        subOsc.start(now);
        clickOsc.start(now);
        subOsc.stop(now + 0.14);
        clickOsc.stop(now + 0.06);
      }
    } catch {
      // Audio playback fails gracefully if browser blocked auto-play
    }
  }

  /** Climax impact when the premiere countdown reaches 0:00 and goes LIVE! */
  public playLaunchImpact() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Deep sub boom
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(30, now + 0.8);
      subGain.gain.setValueAtTime(0.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      // Shimmer sweep
      const sweep = ctx.createOscillator();
      const sweepGain = ctx.createGain();
      sweep.type = 'triangle';
      sweep.frequency.setValueAtTime(300, now);
      sweep.frequency.exponentialRampToValueAtTime(1800, now + 0.3);
      sweepGain.gain.setValueAtTime(0.2, now);
      sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      sub.connect(subGain);
      sweep.connect(sweepGain);
      subGain.connect(ctx.destination);
      sweepGain.connect(ctx.destination);

      sub.start(now);
      sweep.start(now);
      sub.stop(now + 0.95);
      sweep.stop(now + 0.5);
    } catch {
      // Ignored
    }
  }
}

export const premiereAudio = new PremiereAudioSynthesizer();
