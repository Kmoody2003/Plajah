import type { PersonaSheet } from '../../../services/onair/types';
import { HOSTS } from '../../../services/onair/hosts';
import type { CarSpec } from './manufacturers';
import type { CarState } from './physics';
import { ChoraRadioManager, type RadioPreset } from './choraRadio';
import { getEngineBank, type EngineBankMeta } from './engineAudio';

export type StationInfo = RadioPreset;

interface EngineBankBuffers {
  idle: AudioBuffer;
  mid: AudioBuffer;
  high: AudioBuffer;
  decel: AudioBuffer;
}

interface ActiveEngineRig {
  bankId: string;
  meta: EngineBankMeta;
  filter: BiquadFilterNode;
  bus: GainNode;
  idleSrc: AudioBufferSourceNode;
  midSrc: AudioBufferSourceNode;
  highSrc: AudioBufferSourceNode;
  idleGain: GainNode;
  midGain: GainNode;
  highGain: GainNode;
  decelBuf: AudioBuffer;
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

  // Real 24-bank multi-layer engine-stand sample cache (idle / mid / high RPM crossfade + decel overrun)
  private bankCache = new Map<string, EngineBankBuffers>();
  private bankLoading = new Set<string>();
  private activeBank: ActiveEngineRig | null = null;
  private lastDecelAt = 0;
  private lastThrottle = 0;
  private sampleBuffers = new Map<string, AudioBuffer>();
  private tireSampleGain: GainNode | null = null;
  private gravelSampleGain: GainNode | null = null;
  private brakeSampleGain: GainNode | null = null;

  private muted = false;
  private musicOn = true;
  private level = 0.42;
  private paused = false;
  private started = false;
  private stationIdx = 0;
  private nextStepTime = 0;
  private stepCount = 0;
  private radio = new ChoraRadioManager();

  constructor() {
    this.refreshStations();
  }

  private refreshStations() {
    this.radio.rebuildPresets();
  }

  get currentStation(): StationInfo {
    return this.radio.current;
  }

  get allStations(): readonly StationInfo[] {
    return this.radio.presets;
  }

  selectStationById(id: string): StationInfo {
    const p = this.radio.selectById(id);
    this.stationIdx = Math.max(0, this.radio.presets.indexOf(p));
    return p;
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

  private async fetchEngineBank(bankId: string): Promise<void> {
    if (!this.ctx || this.bankCache.has(bankId) || this.bankLoading.has(bankId)) return;
    const meta = getEngineBank(bankId);
    if (!meta) return;
    this.bankLoading.add(bankId);
    try {
      const ctx = this.ctx;
      const loadOne = async (name: string): Promise<AudioBuffer> => {
        const res = await fetch(`${meta.basePath}/${name}.mp3`);
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${bankId}/${name}.mp3`);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      };
      const [idle, mid, high, decel] = await Promise.all([
        loadOne('idle'),
        loadOne('mid'),
        loadOne('high'),
        loadOne('decel'),
      ]);
      this.bankCache.set(bankId, { idle, mid, high, decel });
    } catch {
      // Offline or unsupported codec — synthetic fallback remains active
    } finally {
      this.bankLoading.delete(bankId);
    }
  }

  private ensureEngineBank(bankId: string | undefined): ActiveEngineRig | null {
    if (!bankId || !this.ctx || !this.master) return null;
    if (this.activeBank && this.activeBank.bankId === bankId) return this.activeBank;
    const bufs = this.bankCache.get(bankId);
    if (!bufs) {
      void this.fetchEngineBank(bankId);
      return null;
    }
    const meta = getEngineBank(bankId);
    if (!meta) return null;

    if (this.activeBank) {
      try {
        this.activeBank.idleSrc.stop();
        this.activeBank.midSrc.stop();
        this.activeBank.highSrc.stop();
        this.activeBank.bus.disconnect();
      } catch { /* ignore */ }
      this.activeBank = null;
    }

    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.85;
    const bus = ctx.createGain();
    bus.gain.value = 0.001;
    filter.connect(bus);
    bus.connect(this.master);

    const mkLayer = (buf: AudioBuffer): [AudioBufferSourceNode, GainNode] => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(filter);
      src.start();
      return [src, g];
    };

    const [idleSrc, idleGain] = mkLayer(bufs.idle);
    const [midSrc, midGain] = mkLayer(bufs.mid);
    const [highSrc, highGain] = mkLayer(bufs.high);

    this.activeBank = {
      bankId,
      meta,
      filter,
      bus,
      idleSrc,
      midSrc,
      highSrc,
      idleGain,
      midGain,
      highGain,
      decelBuf: bufs.decel,
    };
    return this.activeBank;
  }

  private triggerDecelOverrun(rig: ActiveEngineRig, now: number, intensity: number): void {
    if (!this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = rig.decelBuf;
    src.playbackRate.value = 0.92 + Math.random() * 0.14;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(Math.min(0.45, intensity), now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + Math.min(1.25, rig.decelBuf.duration));
    src.connect(g);
    g.connect(rig.filter);
    src.start(now);
    src.stop(now + Math.min(1.3, rig.decelBuf.duration));
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
    const p = this.radio.cycle(dir);
    this.stationIdx = Math.max(0, this.radio.presets.indexOf(p));
    this.radio.setPausedOrMuted(this.muted || this.paused || !this.musicOn);
    return p;
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
    const upgLvl = spec.engine.soundUpgradeLevel ?? 0;
    const bankId = isEv
      ? undefined
      : (spec.engine.soundBank
        ?? (spec.vehicleClass === 'truck'
          ? 'pickup_v8'
          : spec.engine.aspiration === 'Supercharged'
          ? 'sc_v8_blower'
          : spec.vehicleClass === 'muscle'
          ? 'muscle_v8'
          : spec.vehicleClass === 'rally'
          ? 'turbo_i5'
          : spec.vehicleClass === 'track'
          ? 'hypercar_tt_v8'
          : 'sports_car_gt'));
    const rig = this.ensureEngineBank(bankId);
    const hasRealEng = !!rig;
    const synthScale = hasRealEng ? 0.08 : 1.0;

    if (rig) {
      const r = Math.min(1, Math.max(0, rpmFrac));
      // Smooth 3-band RPM crossfade (idle 0..0.42 -> mid 0.18..0.82 -> high 0.54..1.0)
      const wIdle = Math.max(0, 1 - r / 0.42);
      const wHigh = Math.max(0, (r - 0.52) / 0.48);
      const wMid = Math.max(0, 1 - wIdle - wHigh);
      // Calibrated playback pitch ratios (keeps natural engine timbre without chipmunk distortion)
      rig.idleSrc.playbackRate.setTargetAtTime(0.84 + r * 0.48, now, 0.035);
      rig.midSrc.playbackRate.setTargetAtTime(0.78 + r * 0.56, now, 0.035);
      rig.highSrc.playbackRate.setTargetAtTime(0.76 + r * 0.54, now, 0.035);
      rig.idleGain.gain.setTargetAtTime(wIdle * (0.85 + throttle * 0.25), now, 0.04);
      rig.midGain.gain.setTargetAtTime(wMid * (0.72 + throttle * 0.42), now, 0.04);
      rig.highGain.gain.setTargetAtTime(wHigh * (0.76 + throttle * 0.48), now, 0.04);

      // Quiet everyday stock cars stay refined/muted; sport/race cars & upgraded builds open up bright & punchy
      const aggNorm = Math.min(1, (rig.meta.aggression + upgLvl * 0.65) / 4);
      const maxCutoff = 1600 + aggNorm * 4800;
      const minCutoff = 480 + aggNorm * 580;
      rig.filter.frequency.setTargetAtTime((minCutoff + (maxCutoff - minCutoff) * (0.25 + 0.55 * throttle + 0.35 * r)) * shiftDip, now, 0.04);
      const volBase = rig.meta.gain * (0.34 + aggNorm * 0.22) * (0.55 + throttle * 0.36 + r * 0.24) * shiftDip;
      rig.bus.gain.setTargetAtTime(volBase, now, 0.04);

      // Real deceleration overrun / exhaust burble on throttle lift at mid-high RPM
      const liftOff = this.lastThrottle > 0.42 && throttle < 0.14 && r > 0.36;
      if (liftOff && now - this.lastDecelAt > 0.55 && (rig.meta.aggression >= 1 || upgLvl >= 1)) {
        this.lastDecelAt = now;
        this.triggerDecelOverrun(rig, now, 0.16 + aggNorm * 0.26);
      }
    }
    this.lastThrottle = throttle;

    this.engFilter.frequency.setTargetAtTime(
      (220 + rpmFrac * 1850 + throttle * 480) * shiftDip,
      now,
      0.035
    );
    this.engGain.gain.setTargetAtTime(
      (isEv ? 0.015 : (0.08 + throttle * 0.11 + rpmFrac * 0.06) * shiftDip) * synthScale,
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
    // squeal only when the tyres are really past their grip: a slide of more than about 2.6 m/s sideways (slip 0.35), a burnout, or the handbrake. Ordinary driving, even
    // fast, has a little sideways slip all the time and must stay silent. Faded out at walking speed.
    const slipExcess = Math.max(0, (maxSlip - 0.35) / 0.65);
    const speedGate = Math.min(1, Math.max(0, (state.speedMps - 4) / 8));
    const targetScreech = state.surface === 'asphalt' && !state.isAirborne ? (state.isDrifting ? 0.12 : slipExcess * slipExcess * 0.11) * speedGate : 0;
    this.screechGain.gain.setTargetAtTime(targetScreech, now, 0.045);
    this.tireSampleGain?.gain.setTargetAtTime(0, now, 0.05);       // the video-derived squeal loop stays off: it is not tied to the physics

    const offroadFactor = state.surface !== 'asphalt' && !state.isAirborne ? Math.min(1, state.speedMps / 16) * (0.25 + maxSlip * 0.75) : 0;
    if (this.gravelGain) {
      this.gravelGain.gain.setTargetAtTime(this.gravelSampleGain ? offroadFactor * 0.025 : offroadFactor * 0.11, now, 0.05);
    }
    this.gravelSampleGain?.gain.setTargetAtTime(offroadFactor * 0.34, now, 0.05);

    // Brake rotor thermal pad hiss
    const maxHeat = Math.max(state.brakeTemp[0], state.brakeTemp[1], state.brakeTemp[2], state.brakeTemp[3]);
    const targetBrakeHiss = state.isBraking && state.speedMps > 5 && maxHeat > 0.28 ? (maxHeat - 0.25) * 0.07 : 0;
    if (this.brakeGain) {
      this.brakeGain.gain.setTargetAtTime(this.brakeSampleGain ? targetBrakeHiss * 0.2 : targetBrakeHiss, now, 0.04);
    }
    this.brakeSampleGain?.gain.setTargetAtTime(targetBrakeHiss * 3.0, now, 0.04);

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
    if (!this.ctx || !this.master) return;
    const realBuf = this.sampleBuffers.get('backfire');
    if (realBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = realBuf;
      const g = this.ctx.createGain();
      g.gain.value = 0.42;
      src.connect(g);
      g.connect(this.master);
      src.start(t);
      return;
    }
    if (!this.noiseBuffer) return;
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
    const realBuf = this.sampleBuffers.get('curb_thud');
    if (realBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = realBuf;
      const g = this.ctx.createGain();
      g.gain.value = 0.36 * Math.min(1, intensity);
      src.connect(g);
      g.connect(this.master);
      src.start(t);
      return;
    }
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
