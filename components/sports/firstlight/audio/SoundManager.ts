/**
 * High-fidelity Procedural Sound Manager using Web Audio API.
 * Supports both authentic SOL Broadcast audio & explosive Arcade Fever Jam FX.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private crowdNode: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  private init() {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public ensureStarted() {
    this.init();
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.startCrowdAmbience();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.crowdGain && this.ctx) {
      this.crowdGain.gain.setValueAtTime(muted ? 0 : 0.14, this.ctx.currentTime);
    }
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public startCrowdAmbience() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || this.crowdNode) return;

    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const left = noiseBuffer.getChannelData(0);
    const right = noiseBuffer.getChannelData(1);

    let lastOutL = 0.0;
    let lastOutR = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;
      lastOutL = (lastOutL + 0.025 * whiteL) / 1.025;
      lastOutR = (lastOutR + 0.025 * whiteR) / 1.025;
      left[i] = lastOutL * 1.4;
      right[i] = lastOutR * 1.4;
    }

    const crowdSrc = this.ctx.createBufferSource();
    crowdSrc.buffer = noiseBuffer;
    crowdSrc.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, this.ctx.currentTime);
    filter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, this.ctx.currentTime);

    crowdSrc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    crowdSrc.start(0);
    this.crowdNode = crowdSrc;
    this.crowdGain = gain;
  }

  public playCrowdRoar(intensity: 'CHEER' | 'TOUCHDOWN' | 'GROAN' | 'HYPE' = 'CHEER') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const duration = intensity === 'TOUCHDOWN' ? 5.0 : intensity === 'HYPE' ? 3.2 : 2.3;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const left = noiseBuffer.getChannelData(0);
    const right = noiseBuffer.getChannelData(1);

    let lastL = 0;
    let lastR = 0;
    for (let i = 0; i < bufferSize; i++) {
      lastL = (lastL + 0.035 * (Math.random() * 2 - 1)) / 1.035;
      lastR = (lastR + 0.035 * (Math.random() * 2 - 1)) / 1.035;
      left[i] = lastL;
      right[i] = lastR;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(intensity === 'GROAN' ? 240 : 560, this.ctx.currentTime);
    if (intensity === 'TOUCHDOWN' || intensity === 'HYPE') {
      filter.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 1.1);
    }

    const gain = this.ctx.createGain();
    const peakVol = intensity === 'TOUCHDOWN' ? 0.42 : intensity === 'HYPE' ? 0.3 : 0.2;
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peakVol, this.ctx.currentTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  public playStadiumHorn() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [130.81, 164.81, 196.0].forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(840, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.08);
      gain.gain.setValueAtTime(0.22, now + 1.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.75);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now);
      osc.stop(now + 1.75);
    });
  }

  public playOrganFanfare() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [
      { f: 523.25, start: 0.0, dur: 0.16 },
      { f: 659.25, start: 0.18, dur: 0.16 },
      { f: 783.99, start: 0.36, dur: 0.22 },
      { f: 1046.5, start: 0.62, dur: 0.58 },
    ];
    const now = this.ctx.currentTime;
    notes.forEach((n) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.start);
      gain.gain.setValueAtTime(0.01, now + n.start);
      gain.gain.linearRampToValueAtTime(0.18, now + n.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur);
    });
  }

  /** NBA Jam / NFL Fever "ON FIRE!" Arcade Ignition Synth Surge */
  public playFireIgnition() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [220, 330, 440, 660];
    freqs.forEach((f, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now + idx * 0.05);
      osc.frequency.exponentialRampToValueAtTime(f * 2.0, now + idx * 0.05 + 0.4);

      gain.gain.setValueAtTime(0.01, now + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.05 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.55);
    });
  }

  public playBigHit(isArcade: boolean = false) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isArcade ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(isArcade ? 180 : 135, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + (isArcade ? 0.36 : 0.25));

    gain.gain.setValueAtTime(isArcade ? 0.52 : 0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isArcade ? 0.38 : 0.27));
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isArcade ? 0.38 : 0.27));
  }

  public playKickThump() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playDoink() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [520, 785].forEach((f) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    });
  }

  public playDefenseDrumCadence() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const beatTimes = [0.0, 0.34, 0.68, 1.12, 1.42];
    const now = this.ctx.currentTime;
    beatTimes.forEach((t) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(92, now + t);
      osc.frequency.exponentialRampToValueAtTime(34, now + t + 0.2);
      gain.gain.setValueAtTime(0.26, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.22);
    });
  }

  public announce(message: string, energetic: boolean = false) {
    if (this.isMuted) return;
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = energetic ? 1.18 : 1.08;
      utterance.pitch = energetic ? 1.08 : 0.96;
      utterance.volume = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const sportsVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Guy') || v.name.includes('Natural'))
        ) || voices.find((v) => v.lang.startsWith('en'));
      if (sportsVoice) utterance.voice = sportsVoice;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore browser autoplay policies
    }
  }

  public playJukeCut() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playFireworksExplosion() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.45);
    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playWhistle() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.frequency.setValueAtTime(2850, now);
    osc2.frequency.setValueAtTime(3080, now);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(28, now);
    lfoGain.gain.setValueAtTime(120, now);
    lfo.connect(osc1.frequency);
    lfo.connect(osc2.frequency);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gain.gain.setValueAtTime(0.2, now + 0.42);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);
    lfo.start(now);
    osc1.start(now);
    osc2.start(now);
    lfo.stop(now + 0.62);
    osc1.stop(now + 0.62);
    osc2.stop(now + 0.62);
  }

  public playSnapHut() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(82, now + 0.16);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.16);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playThrowWhoosh(speedMultiplier: number = 1.0) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.38);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450 * speedMultiplier, now);
    filter.frequency.exponentialRampToValueAtTime(1320 * speedMultiplier, now + 0.2);
    filter.Q.setValueAtTime(2.2, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  public playCatch() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playTackle() {
    this.playBigHit(false);
  }

  public playUIClick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.05);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

export const soundManager = new SoundManager();
