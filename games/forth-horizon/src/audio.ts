import { onAirNow, nextOnAir } from '../../../services/onair/station';
import { HOSTS } from '../../../services/onair/hosts';
import type { PersonaSheet } from '../../../services/onair/types';
import type { CarSpec } from './manufacturers';
import type { CarState } from './physics';

export interface StationInfo {
  id: string;
  name: string;
  hostName: string;
  tagline: string;
  accent: string;
  bpm: number;
  kind: 'plajah-fm' | 'chora-techno' | 'chora-synth';
  persona: PersonaSheet | null;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engOsc1: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engSub: OscillatorNode | null = null;
  private forcedOsc: OscillatorNode | null = null;
  private forcedGain: GainNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private gravelGain: GainNode | null = null;
  private brakeGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastThumpAt = 0;
  private lastBackfireAt = 0;

  private muted = false;
  private musicOn = true;
  private level = 0.42;
  private paused = false;
  private started = false;
  private stationIdx = 0;
  private nextStepTime = 0;
  private stepCount = 0;
  private stations: StationInfo[] = [];

  constructor() {
    this.refreshStations();
  }

  private refreshStations() {
    const liveHost = onAirNow() ?? HOSTS[0];
    const upcoming = nextOnAir();
    const showName = liveHost.show?.name ?? 'Overnight Auto-Mix';
    const accent = liveHost.look.palette[0] ?? '#ff6b2b';
    const nextHint = upcoming ? ` · Next: ${upcoming.host.stageName} in ${upcoming.inHours}h` : '';

    this.stations = [
      {
        id: 'plajah-fm',
        name: `Plajah FM · ${showName}`,
        hostName: `${liveHost.stageName} (Virtual DJ)`,
        tagline: `${liveHost.backstory.tagline}${nextHint}`,
        accent,
        bpm: 120,
        kind: 'plajah-fm',
        persona: liveHost,
      },
      {
        id: 'chora-techno',
        name: 'Chora · Ironport Underground',
        hostName: 'Chora Direct · Detroit Techno (128 BPM)',
        tagline: 'Procedural 909 kick, acid bassline & warehouse hats.',
        accent: '#2ec4b6',
        bpm: 128,
        kind: 'chora-techno',
        persona: null,
      },
      {
        id: 'chora-synth',
        name: 'Chora · Great Lakes Horizon',
        hostName: 'Chora Direct · Sunset Synthwave (112 BPM)',
        tagline: 'Warm analog arps & coastal cruise chords.',
        accent: '#ffd166',
        bpm: 112,
        kind: 'chora-synth',
        persona: null,
      },
    ];
  }

  get currentStation(): StationInfo {
    return this.stations[this.stationIdx];
  }

  get isMuted(): boolean {
    return this.muted;
  }

  ensureStarted() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    this.started = true;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.level;
    master.connect(ctx.destination);
    this.master = master;

    // Engine multi-harmonic exhaust + sub-octave rumble + waveshaper saturation
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 340;
    engFilter.Q.value = 2.6;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 255 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;

    const engGain = ctx.createGain();
    engGain.gain.value = 0.14;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 55;

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 110;

    const oscSub = ctx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.value = 27.5;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.65;

    osc1.connect(shaper);
    osc2.connect(shaper);
    oscSub.connect(subGain);
    subGain.connect(shaper);
    shaper.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(master);
    osc1.start();
    osc2.start();
    oscSub.start();

    this.engOsc1 = osc1;
    this.engOsc2 = osc2;
    this.engSub = oscSub;
    this.engFilter = engFilter;
    this.engGain = engGain;

    // Forced-induction (Supercharger / Twin-Turbo / EV inverter whine)
    const forcedOsc = ctx.createOscillator();
    forcedOsc.type = 'sine';
    forcedOsc.frequency.value = 900;
    const forcedGain = ctx.createGain();
    forcedGain.gain.value = 0;
    forcedOsc.connect(forcedGain);
    forcedGain.connect(master);
    forcedOsc.start();
    this.forcedOsc = forcedOsc;
    this.forcedGain = forcedGain;

    // Shared white noise buffer for tire squeal, gravel scrub, brake hiss & backfire pops
    const bufLen = ctx.sampleRate * 1.5;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noiseBuf;

    // Asphalt tire screech
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 1450;
    screechFilter.Q.value = 5.5;

    const screechGain = ctx.createGain();
    screechGain.gain.value = 0;

    noiseSrc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(master);
    noiseSrc.start();
    this.screechGain = screechGain;

    // Off-road gravel / sand scrub
    const gravelSrc = ctx.createBufferSource();
    gravelSrc.buffer = noiseBuf;
    gravelSrc.loop = true;
    const gravelFilter = ctx.createBiquadFilter();
    gravelFilter.type = 'lowpass';
    gravelFilter.frequency.value = 420;
    const gravelGain = ctx.createGain();
    gravelGain.gain.value = 0;
    gravelSrc.connect(gravelFilter);
    gravelFilter.connect(gravelGain);
    gravelGain.connect(master);
    gravelSrc.start();
    this.gravelGain = gravelGain;

    // Brake rotor thermal pad hiss
    const brakeSrc = ctx.createBufferSource();
    brakeSrc.buffer = noiseBuf;
    brakeSrc.loop = true;
    const brakeFilter = ctx.createBiquadFilter();
    brakeFilter.type = 'bandpass';
    brakeFilter.frequency.value = 3100;
    brakeFilter.Q.value = 3.2;
    const brakeGain = ctx.createGain();
    brakeGain.gain.value = 0;
    brakeSrc.connect(brakeFilter);
    brakeFilter.connect(brakeGain);
    brakeGain.connect(master);
    brakeSrc.start();
    this.brakeGain = brakeGain;

    // Music bus
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.38;
    musicGain.connect(master);
    this.musicGain = musicGain;

    this.nextStepTime = ctx.currentTime + 0.05;
  }

  /** hosts that bring their own music (the region game) turn the built-in groove off */
  setMusic(on: boolean) { this.musicOn = on; }
  /** overall engine / tyre / brake level (0..1.5) */
  setLevel(v: number) {
    this.level = v;
    if (this.master && this.ctx && !this.muted && !this.paused) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  /** silence or restore everything (menus, replays) without losing the mute setting */
  setPaused(p: boolean) {
    this.paused = p;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(p || this.muted ? 0 : this.level, this.ctx.currentTime, 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.level, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }

  cycleStation(dir: 1 | -1): StationInfo {
    this.stationIdx = (this.stationIdx + dir + this.stations.length) % this.stations.length;
    return this.currentStation;
  }

  getHostCallout(event: 'start' | 'lap' | 'speed'): string {
    const p = this.currentStation.persona ?? HOSTS[0];
    const phrases = p.personality.catchphrases;
    if (event === 'start') {
      return `${p.stageName}: "${phrases[0] ?? 'Let’s roll out, Ironport!'}"`;
    }
    if (event === 'speed') {
      return `${p.stageName}: "150 MPH on the Great Lakes stretch — ${phrases[1] ?? 'keep it pinned!'}"`;
    }
    return `${p.stageName}: "Clean lap! ${phrases[2] ?? 'Stay locked in with Plajah FM.'}"`;
  }

  update(state: CarState, spec: CarSpec, throttle: number) {
    if (!this.ctx || !this.engOsc1 || !this.engOsc2 || !this.engFilter || !this.engGain || !this.screechGain) return;

    const now = this.ctx.currentTime;
    const rpmFrac = (state.rpm - spec.engine.idleRpm) / Math.max(1, spec.engine.redlineRpm - spec.engine.idleRpm);
    const isEv = spec.engine.aspiration === 'Electric';
    const baseHz = spec.engine.pitchBaseHz + rpmFrac * spec.engine.pitchBaseHz * 2.55;

    this.engOsc1.frequency.setTargetAtTime(baseHz, now, 0.025);
    this.engOsc2.frequency.setTargetAtTime(baseHz * 2.01, now, 0.025);
    this.engSub?.frequency.setTargetAtTime(baseHz * 0.5, now, 0.025);

    const shiftDip = state.shiftTimer > 0 ? 0.45 : 1.0;
    this.engFilter.frequency.setTargetAtTime(
      (220 + rpmFrac * 1850 + throttle * 480) * shiftDip,
      now,
      0.035
    );
    this.engGain.gain.setTargetAtTime(
      isEv ? 0.015 : (0.08 + throttle * 0.11 + rpmFrac * 0.06) * shiftDip,
      now,
      0.035
    );

    // Supercharger / Twin-Turbo / EV inverter whine
    if (this.forcedOsc && this.forcedGain) {
      if (isEv) {
        const speedFrac = Math.min(1, state.speedMps / spec.topSpeedMps);
        this.forcedOsc.frequency.setTargetAtTime(280 + speedFrac * 2100, now, 0.03);
        this.forcedGain.gain.setTargetAtTime(0.02 + (throttle * 0.045 + (state.isBraking ? 0.03 : 0)) * (0.2 + speedFrac), now, 0.04);
      } else if (spec.engine.aspiration === 'Supercharged') {
        this.forcedOsc.frequency.setTargetAtTime(680 + rpmFrac * 2850, now, 0.03);
        this.forcedGain.gain.setTargetAtTime((0.008 + state.turboBoost * 0.032) * (0.3 + rpmFrac), now, 0.04);
      } else if (spec.engine.aspiration === 'Twin-Turbo') {
        this.forcedOsc.frequency.setTargetAtTime(1600 + state.turboBoost * 2800, now, 0.03);
        this.forcedGain.gain.setTargetAtTime(state.turboBoost * 0.028, now, 0.04);
      } else {
        this.forcedGain.gain.setTargetAtTime(0, now, 0.04);
      }
    }

    // Tire squeal (asphalt) & gravel/sand scrub (off-road)
    const maxSlip = Math.max(state.wheelSlip[0], state.wheelSlip[1], state.wheelSlip[2], state.wheelSlip[3]);
    const targetScreech = state.surface === 'asphalt' ? (state.isDrifting ? 0.12 : maxSlip * 0.08) : 0;
    this.screechGain.gain.setTargetAtTime(targetScreech, now, 0.045);

    if (this.gravelGain) {
      const offroadFactor = state.surface !== 'asphalt' && !state.isAirborne ? Math.min(1, state.speedMps / 16) * (0.25 + maxSlip * 0.75) : 0;
      this.gravelGain.gain.setTargetAtTime(offroadFactor * 0.11, now, 0.05);
    }

    // Brake rotor thermal pad hiss
    if (this.brakeGain) {
      const maxHeat = Math.max(state.brakeTemp[0], state.brakeTemp[1], state.brakeTemp[2], state.brakeTemp[3]);
      const targetBrakeHiss = state.isBraking && state.speedMps > 5 && maxHeat > 0.28 ? (maxHeat - 0.25) * 0.07 : 0;
      this.brakeGain.gain.setTargetAtTime(targetBrakeHiss, now, 0.04);
    }

    // One-shot physical events: exhaust backfire pop & suspension thump
    if (state.backfireEvent && now - this.lastBackfireAt > 0.18) {
      this.lastBackfireAt = now;
      this.triggerBackfire(now);
    }
    if (state.suspensionImpact > 0.18 && now - this.lastThumpAt > 0.12) {
      this.lastThumpAt = now;
      this.triggerSuspensionThump(now, state.suspensionImpact);
    }

    // Step-sequenced Chora groove
    if (this.musicGain && !this.muted && this.musicOn) {
      const st = this.currentStation;
      const stepDur = 60 / st.bpm / 4; // 16th note
      while (this.nextStepTime < now + 0.12) {
        this.scheduleMusicStep(this.nextStepTime, this.stepCount, st.kind);
        this.nextStepTime += stepDur;
        this.stepCount = (this.stepCount + 1) % 32;
      }
    }
  }

  private triggerBackfire(t: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(360, t);
    filt.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.09);
  }

  private triggerSuspensionThump(t: number, intensity: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + intensity * 30, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16 * Math.min(1, intensity), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  private scheduleMusicStep(t: number, step: number, kind: StationInfo['kind']) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;

    // 4-on-the-floor kick
    if (step % 4 === 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'chora-techno' ? 128 : 108, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.11);
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.19);
    }

    // Off-beat hat
    if (step % 4 === 2) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(6200, t);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.05);
    }

    // Bass / Arp pattern
    const bassNotes =
      kind === 'chora-techno'
        ? [55, 55, 65.41, 55, 73.42, 55, 82.41, 65.41]
        : kind === 'chora-synth'
        ? [65.41, 82.41, 98.0, 130.81, 58.27, 73.42, 87.31, 116.54]
        : [73.42, 98.0, 110.0, 146.83, 65.41, 87.31, 98.0, 130.81];

    if (step % 2 === 0) {
      const note = bassNotes[(step / 2) % bassNotes.length];
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = kind === 'chora-synth' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(note * (kind === 'chora-synth' ? 2 : 1), t);
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(kind === 'chora-techno' ? 480 : 920, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(filt);
      filt.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.17);
    }
  }
}
