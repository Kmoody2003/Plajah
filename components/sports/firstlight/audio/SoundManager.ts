/**
 * High-fidelity Procedural Sound Manager using Web Audio API.
 * Zero external asset dependencies - instant response and zero network lag.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private crowdNode: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;
  private drumTimer: number | null = null;

  private init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      this.crowdGain.gain.setValueAtTime(muted ? 0 : 0.16, this.ctx.currentTime);
    }
    if (muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public startCrowdAmbience() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    if (this.crowdNode) return;

    // Rich dual-layer pink/brown stadium murmur
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
      left[i] = lastOutL * 1.5;
      right[i] = lastOutR * 1.5;
    }

    const crowdSrc = this.ctx.createBufferSource();
    crowdSrc.buffer = noiseBuffer;
    crowdSrc.loop = true;

    // Dual bandpass filter simulating indoor dome / stadium bowl acoustics
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, this.ctx.currentTime);
    filter.Q.setValueAtTime(0.7, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, this.ctx.currentTime);

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

    const duration = intensity === 'TOUCHDOWN' ? 5.5 : intensity === 'HYPE' ? 3.5 : 2.5;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
    const left = noiseBuffer.getChannelData(0);
    const right = noiseBuffer.getChannelData(1);

    let lastL = 0;
    let lastR = 0;
    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;
      lastL = (lastL + 0.035 * whiteL) / 1.035;
      lastR = (lastR + 0.035 * whiteR) / 1.035;
      left[i] = lastL;
      right[i] = lastR;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(intensity === 'GROAN' ? 240 : 550, this.ctx.currentTime);
    if (intensity === 'TOUCHDOWN' || intensity === 'HYPE') {
      filter.frequency.exponentialRampToValueAtTime(1250, this.ctx.currentTime + 1.2);
    }

    const gain = this.ctx.createGain();
    const peakVol = intensity === 'TOUCHDOWN' ? 0.45 : intensity === 'HYPE' ? 0.32 : 0.22;
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peakVol, this.ctx.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }

  // Stadium Foghorn / Siren on Touchdowns
  public playStadiumHorn() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Dual power blast (Low brassy foghorn)
    [130.81, 164.81].forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.1);
      gain.gain.setValueAtTime(0.28, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now);
      osc.stop(now + 1.8);
    });
  }

  // Stadium Organ 3-Chord Fanfare ("Da-da-da-DAAA!")
  public playOrganFanfare() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [
      { f: 523.25, start: 0.0, dur: 0.18 }, // C5
      { f: 659.25, start: 0.22, dur: 0.18 }, // E5
      { f: 783.99, start: 0.44, dur: 0.25 }, // G5
      { f: 1046.5, start: 0.72, dur: 0.65 }, // C6
    ];

    const now = this.ctx.currentTime;
    notes.forEach((n) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
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

  // Stadium Bass Drum / Rhythm Cadence ("BOOM-BOOM... DE-FENSE!")
  public playDefenseDrumCadence() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const beatTimes = [0.0, 0.35, 0.7, 1.15, 1.45];
    const now = this.ctx.currentTime;

    beatTimes.forEach((t) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, now + t);
      osc.frequency.exponentialRampToValueAtTime(35, now + t + 0.2);

      gain.gain.setValueAtTime(0.28, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + t);
      osc.stop(now + t + 0.22);
    });
  }

  // TV Broadcaster / Stadium Public Address Announcer Voice
  public announce(message: string) {
    if (this.isMuted) return;
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1.08;
      utterance.pitch = 0.95;
      utterance.volume = 0.9;
      // Prefer energetic English voices
      const voices = window.speechSynthesis.getVoices();
      const sportsVoice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Guy') || v.name.includes('Natural'))
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (sportsVoice) {
        utterance.voice = sportsVoice;
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      // Graceful fallback if browser speech policy prevents
    }
  }

  public playJukeCut() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Turf cut chirp/squeak
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
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
    // Low concussion boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

    gain.gain.setValueAtTime(0.4, now);
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
    gain.gain.linearRampToValueAtTime(0.22, now + 0.04);
    gain.gain.setValueAtTime(0.22, now + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);

    lfo.stop(now + 0.65);
    osc1.stop(now + 0.65);
    osc2.stop(now + 0.65);
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
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.16);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.16);

    gain.gain.setValueAtTime(0.35, now);
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
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.4);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450 * speedMultiplier, now);
    filter.frequency.exponentialRampToValueAtTime(1300 * speedMultiplier, now + 0.2);
    filter.Q.setValueAtTime(2.2, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

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

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playTackle() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.24);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playUIClick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }
}

export const soundManager = new SoundManager();
