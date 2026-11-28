import type { PersonaSheet } from '../../../services/onair/types';
import { HOSTS } from '../../../services/onair/hosts';
import type { CarSpec } from './manufacturers';
import type { CarState } from './physics';
import { ChoraRadioManager, type RadioPreset } from './choraRadio';
import { InCarEngineSynth } from './inCarEngineAudio';

export type StationInfo = RadioPreset;
export type SirenMode = 'wail' | 'yelp' | 'phaser';

export interface NearbyVehicleAudioSample {
  distanceM: number;
  approachMps: number;
  rpm: number;
  pitchBaseHz: number;
  isEv?: boolean;
  isPoliceSiren?: boolean;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private inCarEngine: InCarEngineSynth | null = null;
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
  // Player & AI Police Siren + Air Horn synthesizer
  private sirenOscA: OscillatorNode | null = null;
  private sirenOscB: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private aiSirenOsc: OscillatorNode | null = null;
  private aiSirenGain: GainNode | null = null;
  private sirenOn = false;
  private sirenMode: SirenMode = 'wail';
  private sirenPhase = 0;
  private aiSirenPhase = 0;
  // Nearby AI rival / traffic Doppler engine bed (closest vehicle within 75 m)
  private rivalOscA: OscillatorNode | null = null;
  private rivalOscB: OscillatorNode | null = null;
  private rivalFilter: BiquadFilterNode | null = null;
  private rivalGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastThumpAt = 0;
  private lastBackfireAt = 0;
  private lastCrashAt = 0;
  private lastScrapeAt = 0;
  private lastUpdateAt = 0;
  private sampleBuffers = new Map<string, AudioBuffer>();
  private tireSampleGain: GainNode | null = null;
  private gravelSampleGain: GainNode | null = null;
  private brakeSampleGain: GainNode | null = null;

  private muted = false;
  private musicOn = true;
  private level = 1.0;
  private engineLevel = 0.75;
  private sfxLevel = 0.85;
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
    master.gain.value = (this.muted || this.paused) ? 0 : this.level;
    master.connect(ctx.destination);
    this.master = master;

    // Dedicated independent Engine bus (0.00 = completely silent .. 1.50) & SFX/Tyres/World bus (0.00 .. 1.50)
    const engineBus = ctx.createGain();
    engineBus.gain.value = this.engineLevel;
    engineBus.connect(master);
    this.engineBus = engineBus;

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = this.sfxLevel;
    sfxBus.connect(master);
    this.sfxBus = sfxBus;

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
    engGain.connect(engineBus);
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
    forcedGain.connect(engineBus);
    forcedOsc.start();
    this.forcedOsc = forcedOsc;
    this.forcedGain = forcedGain;

    // Shared white noise buffer for tire squeal, gravel scrub, brake hiss, engine air-bite & backfire pops
    const bufLen = ctx.sampleRate * 1.5;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noiseBuf;

    // Authentic RPM-locked in-car multi-cylinder engine synthesizer (routes through engineBus so slider dials smoothly to 0%)
    this.inCarEngine = new InCarEngineSynth(ctx, engineBus, noiseBuf);

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
    screechGain.connect(sfxBus);
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
    gravelGain.connect(sfxBus);
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
    brakeGain.connect(sfxBus);
    brakeSrc.start();
    this.brakeGain = brakeGain;

    // Music bus
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.38;
    musicGain.connect(master);
    this.musicGain = musicGain;

    // Authentic Police Grille-Speaker Emergency Siren Bus (WAIL / YELP / PHASER, cleanly toggleable ON/OFF)
    const sirenShaper = ctx.createWaveShaper();
    const sCurve = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      const x = (i * 2) / 127 - 1;
      sCurve[i] = Math.tanh(x * 1.9);
    }
    sirenShaper.curve = sCurve;
    const sirenBand = ctx.createBiquadFilter();
    sirenBand.type = 'bandpass';
    sirenBand.frequency.value = 1180;
    sirenBand.Q.value = 1.15;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenOscA = ctx.createOscillator();
    sirenOscA.type = 'sawtooth';
    sirenOscA.frequency.value = 720;
    const sirenOscB = ctx.createOscillator();
    sirenOscB.type = 'triangle';
    sirenOscB.frequency.value = 1440;
    const sirenMixB = ctx.createGain();
    sirenMixB.gain.value = 0.38;
    sirenOscA.connect(sirenShaper);
    sirenOscB.connect(sirenMixB).connect(sirenShaper);
    sirenShaper.connect(sirenBand).connect(sirenGain).connect(sfxBus);
    sirenOscA.start();
    sirenOscB.start();
    this.sirenOscA = sirenOscA;
    this.sirenOscB = sirenOscB;
    this.sirenGain = sirenGain;

    // Distant AI Police Cruiser Doppler Siren Bus (for pursuing AI cops in Robber/Cop mode)
    const aiSirenBand = ctx.createBiquadFilter();
    aiSirenBand.type = 'bandpass';
    aiSirenBand.frequency.value = 1050;
    aiSirenBand.Q.value = 1.4;
    const aiSirenGain = ctx.createGain();
    aiSirenGain.gain.value = 0;
    const aiSirenOsc = ctx.createOscillator();
    aiSirenOsc.type = 'sawtooth';
    aiSirenOsc.frequency.value = 760;
    aiSirenOsc.connect(aiSirenBand).connect(aiSirenGain).connect(sfxBus);
    aiSirenOsc.start();
    this.aiSirenOsc = aiSirenOsc;
    this.aiSirenGain = aiSirenGain;

    // Nearby AI Racer / Pursuit / Heavy Traffic Doppler Engine Bed
    const rivalOscA = ctx.createOscillator();
    rivalOscA.type = 'sawtooth';
    rivalOscA.frequency.value = 90;
    const rivalOscB = ctx.createOscillator();
    rivalOscB.type = 'triangle';
    rivalOscB.frequency.value = 180;
    const rivalFilter = ctx.createBiquadFilter();
    rivalFilter.type = 'lowpass';
    rivalFilter.frequency.value = 620;
    rivalFilter.Q.value = 1.8;
    const rivalGain = ctx.createGain();
    rivalGain.gain.value = 0;
    rivalOscA.connect(rivalFilter);
    rivalOscB.connect(rivalFilter);
    rivalFilter.connect(rivalGain).connect(engineBus);
    rivalOscA.start();
    rivalOscB.start();
    this.rivalOscA = rivalOscA;
    this.rivalOscB = rivalOscB;
    this.rivalFilter = rivalFilter;
    this.rivalGain = rivalGain;

    this.nextStepTime = ctx.currentTime + 0.05;
  }

  get isSirenOn(): boolean { return this.sirenOn; }
  get currentSirenMode(): SirenMode { return this.sirenMode; }

  setSirenEnabled(on: boolean): boolean {
    this.sirenOn = on;
    if (!on && this.sirenGain && this.ctx) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.045);
    }
    return this.sirenOn;
  }

  toggleSiren(): boolean {
    this.ensureStarted();
    return this.setSirenEnabled(!this.sirenOn);
  }

  cycleSirenMode(): SirenMode {
    const order: SirenMode[] = ['wail', 'yelp', 'phaser'];
    this.sirenMode = order[(order.indexOf(this.sirenMode) + 1) % order.length];
    return this.sirenMode;
  }

  /** Dual-tone low brass police cruiser air horn burst ("HONK!") */
  triggerAirHorn(durationSec = 0.42): void {
    this.ensureStarted();
    const out = this.sfxBus ?? this.master;
    if (!this.ctx || !out || this.muted || this.paused) return;
    const now = this.ctx.currentTime;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.025);
    g.gain.setValueAtTime(0.22, now + Math.max(0.08, durationSec - 0.06));
    g.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    bp.connect(g).connect(out);
    for (const hz of [392, 493.88]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(hz, now);
      o.connect(bp);
      o.start(now);
      o.stop(now + durationSec + 0.03);
    }
  }

  /** Update nearby closest rival / pursuit cruiser engine & distant Doppler siren */
  updateNearbyVehicles(closest: NearbyVehicleAudioSample | null, closestAiCop: { distanceM: number; approachMps: number } | null, dt = 0.016): void {
    if (!this.ctx || !this.rivalGain || !this.rivalOscA || !this.rivalOscB || !this.rivalFilter) return;
    const now = this.ctx.currentTime;
    if (closest && closest.distanceM < 78) {
      const att = Math.max(0, 1 - closest.distanceM / 78);
      const doppler = Math.max(0.76, Math.min(1.28, 340 / Math.max(240, 340 - closest.approachMps)));
      const hz = Math.max(38, (closest.pitchBaseHz + (closest.rpm / 60) * (closest.isEv ? 4.2 : 1.35)) * doppler);
      this.rivalOscA.frequency.setTargetAtTime(hz, now, 0.035);
      this.rivalOscB.frequency.setTargetAtTime(hz * (closest.isEv ? 1.5 : 2.02), now, 0.035);
      this.rivalFilter.frequency.setTargetAtTime(closest.isEv ? 2200 : 320 + att * 1150, now, 0.04);
      this.rivalGain.gain.setTargetAtTime(att * att * (closest.isEv ? 0.07 : 0.13), now, 0.05);
    } else {
      this.rivalGain.gain.setTargetAtTime(0, now, 0.08);
    }

    if (this.aiSirenOsc && this.aiSirenGain) {
      if (closestAiCop && closestAiCop.distanceM < 135) {
        this.aiSirenPhase = (this.aiSirenPhase + dt * 0.28) % 1;
        const sweep = 0.5 - 0.5 * Math.cos(this.aiSirenPhase * Math.PI * 2);
        const doppler = Math.max(0.78, Math.min(1.25, 340 / Math.max(240, 340 - closestAiCop.approachMps)));
        const att = Math.max(0, 1 - closestAiCop.distanceM / 135);
        this.aiSirenOsc.frequency.setTargetAtTime((650 + sweep * 820) * doppler, now, 0.03);
        this.aiSirenGain.gain.setTargetAtTime(att * att * 0.11, now, 0.06);
      } else {
        this.aiSirenGain.gain.setTargetAtTime(0, now, 0.08);
      }
    }
  }

  /** hosts that bring their own music (the region game) turn the built-in groove off */
  setMusic(on: boolean) { this.musicOn = on; }
  /** Independent engine bus volume (0.00 = completely silent/near-zero .. 1.50) */
  setEngineLevel(v: number) {
    this.engineLevel = Math.max(0, Math.min(1.5, v));
    if (this.engineBus && this.ctx) {
      this.engineBus.gain.setTargetAtTime(this.engineLevel, this.ctx.currentTime, 0.035);
    }
  }
  /** Independent SFX / tyre / brake / collision / siren bus volume (0.00 .. 1.50) */
  setSfxLevel(v: number) {
    this.sfxLevel = Math.max(0, Math.min(1.5, v));
    if (this.sfxBus && this.ctx) {
      this.sfxBus.gain.setTargetAtTime(this.sfxLevel, this.ctx.currentTime, 0.035);
    }
  }
  /** Legacy combined setter: scales both engine and SFX buses cleanly. */
  setLevel(v: number) {
    this.setEngineLevel(v);
    this.setSfxLevel(v);
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
    const dt = this.lastUpdateAt > 0 ? Math.min(0.05, Math.max(0.001, now - this.lastUpdateAt)) : 0.016;
    this.lastUpdateAt = now;
    const rpmFrac = (state.rpm - spec.engine.idleRpm) / Math.max(1, spec.engine.redlineRpm - spec.engine.idleRpm);
    const isEv = spec.engine.aspiration === 'Electric';
    const baseHz = spec.engine.pitchBaseHz + rpmFrac * spec.engine.pitchBaseHz * 2.55;

    this.engOsc1.frequency.setTargetAtTime(baseHz, now, 0.025);
    this.engOsc2.frequency.setTargetAtTime(baseHz * 2.01, now, 0.025);
    this.engSub?.frequency.setTargetAtTime(baseHz * 0.5, now, 0.025);

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

    // Primary in-car RPM-locked physical-modeling + real video-clip hybrid engine (all 81 cars + multi-harmonic EVs!)
    if (this.inCarEngine && isEv) {
      this.inCarEngine.updateEv(state, spec, throttle);
      this.engGain.gain.setTargetAtTime(0.0001, now, 0.03);
      this.forcedGain?.gain.setTargetAtTime(0, now, 0.03);
    } else if (this.inCarEngine && bankId && !isEv) {
      this.inCarEngine.update(state, spec, throttle, bankId, dt);
      // Mute legacy raw sawtooth fallback & legacy forcedOsc (handled inside InCarEngineSynth)
      this.engGain.gain.setTargetAtTime(0.0001, now, 0.03);
      this.forcedGain?.gain.setTargetAtTime(0, now, 0.03);
    } else {
      this.inCarEngine?.setMuted(true);
      this.engFilter.frequency.setTargetAtTime(220 + rpmFrac * 1850 + throttle * 480, now, 0.035);
      this.engGain.gain.setTargetAtTime(0.0001, now, 0.035);
      this.forcedGain?.gain.setTargetAtTime(0, now, 0.04);
    }

    // Active Player Police Siren Oscillator Sweep (WAIL / YELP / PHASER)
    if (this.sirenOscA && this.sirenOscB && this.sirenGain) {
      if (this.sirenOn && !this.paused && !this.muted) {
        const rate = this.sirenMode === 'wail' ? 0.24 : this.sirenMode === 'yelp' ? 2.85 : 8.2;
        this.sirenPhase = (this.sirenPhase + dt * rate) % 1;
        const sweep = this.sirenMode === 'phaser'
          ? (this.sirenPhase < 0.5 ? this.sirenPhase * 2 : (1 - this.sirenPhase) * 2)
          : (0.5 - 0.5 * Math.cos(this.sirenPhase * Math.PI * 2));
        const loHz = this.sirenMode === 'wail' ? 630 : this.sirenMode === 'yelp' ? 670 : 710;
        const hiHz = this.sirenMode === 'wail' ? 1480 : this.sirenMode === 'yelp' ? 1560 : 1620;
        const hz = loHz + (hiHz - loHz) * sweep;
        this.sirenOscA.frequency.setTargetAtTime(hz, now, 0.015);
        this.sirenOscB.frequency.setTargetAtTime(hz * 2.0, now, 0.015);
        this.sirenGain.gain.setTargetAtTime(0.145, now, 0.035);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, now, 0.045);
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
    const out = this.sfxBus ?? this.master;
    if (!this.ctx || !out) return;
    const realBuf = this.sampleBuffers.get('backfire');
    if (realBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = realBuf;
      const g = this.ctx.createGain();
      g.gain.value = 0.42;
      src.connect(g);
      g.connect(out);
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
    g.connect(out);
    src.start(t);
    src.stop(t + 0.09);
  }

  /**
   * Realistic multi-layer collision & crash audio for car-to-car impacts, concrete wall/barrier slams, and metallic barrier scrapes.
   * Rate-limited so continuous scraping creates crisp grinding bursts without saturating the master bus.
   */
  playCollision(kind: 'car' | 'wall' | 'scrape', intensity = 0.6): void {
    const out = this.sfxBus ?? this.master;
    if (!this.ctx || !out || this.muted || this.paused) return;
    const now = this.ctx.currentTime;
    const power = Math.max(0.12, Math.min(1.0, intensity));
    if (kind === 'scrape') {
      if (now - this.lastScrapeAt < 0.12) return;
      this.lastScrapeAt = now;
      if (!this.noiseBuffer) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1950 + power * 1100, now);
      bp.Q.value = 3.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.18 * power, now + 0.014);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      src.connect(bp); bp.connect(g); g.connect(out);
      src.start(now, Math.random() * 0.4, 0.15);
      return;
    }

    if (now - this.lastCrashAt < 0.095) return;
    this.lastCrashAt = now;
    const ctx = this.ctx;

    // 1. Heavy low-end chassis impact thump
    const sub = ctx.createOscillator();
    sub.type = kind === 'wall' ? 'triangle' : 'sine';
    sub.frequency.setValueAtTime((kind === 'wall' ? 128 : 112) + power * 42, now);
    sub.frequency.exponentialRampToValueAtTime(kind === 'wall' ? 26 : 34, now + 0.18 + power * 0.08);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.42 * power, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.22 + power * 0.10);
    sub.connect(subG); subG.connect(out);
    sub.start(now); sub.stop(now + 0.34);

    // 2. Broadband crunch (concrete slam / sheet-metal crumple)
    if (this.noiseBuffer) {
      const n1 = ctx.createBufferSource();
      n1.buffer = this.noiseBuffer;
      const f1 = ctx.createBiquadFilter();
      f1.type = kind === 'wall' ? 'lowpass' : 'bandpass';
      f1.frequency.setValueAtTime(kind === 'wall' ? 680 + power * 520 : 1150 + power * 850, now);
      f1.frequency.exponentialRampToValueAtTime(kind === 'wall' ? 210 : 380, now + 0.24);
      if (f1.type === 'bandpass') f1.Q.value = 1.1;
      const g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.46 * power, now);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.20 + power * 0.14);
      n1.connect(f1); f1.connect(g1); g1.connect(out);
      n1.start(now, Math.random() * 0.4, 0.38);
    }

    // 3. Metallic fender / guardrail ring partials
    const partials = kind === 'car' ? [340, 625, 1180] : [260, 510];
    for (let i = 0; i < partials.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'square';
      const f0 = partials[i] * (0.94 + Math.random() * 0.12);
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.72, now + 0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f0; bp.Q.value = 4.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime((kind === 'car' ? 0.12 : 0.08) * power / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14 + power * 0.08);
      osc.connect(bp); bp.connect(g); g.connect(out);
      osc.start(now); osc.stop(now + 0.26);
    }
  }

  private triggerSuspensionThump(t: number, intensity: number) {
    const out = this.sfxBus ?? this.master;
    if (!this.ctx || !out) return;
    const realBuf = this.sampleBuffers.get('curb_thud');
    if (realBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = realBuf;
      const g = this.ctx.createGain();
      g.gain.value = 0.36 * Math.min(1, intensity);
      src.connect(g);
      g.connect(out);
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
    g.connect(out);
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
