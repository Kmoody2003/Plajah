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

/** engine / tyre / gravel / brake loops cut from reference-video soundtracks: off until real engine source material exists */
const USE_VIDEO_SAMPLES = false;

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

  // Real sample-based engine, surface & one-shot buffers decoded from motion-study videos
  private sampleBuffers = new Map<string, AudioBuffer>();
  private engSampleSrc: AudioBufferSourceNode | null = null;
  private engSampleGain: GainNode | null = null;
  private engSampleKey = '';
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
    // Video-soundtrack samples are OFF: they carry tyre squeal and road noise inside the engine loop and do not follow what the car is doing. The synthesised engine, tyre,
    // gravel and brake layers drive everything until proper engine source material (see docs/apex-elohim/engine-audio-brief.md) is in.
    if (USE_VIDEO_SAMPLES) void this.loadRealSamples(ctx, master);
  }

  private sliceLoopBuffer(ctx: AudioContext, src: AudioBuffer, startSec: number, durSec: number, loopFadeSec = 0.14): AudioBuffer {
    const sr = src.sampleRate;
    const s0 = Math.min(src.length - 1, Math.max(0, Math.floor(startSec * sr)));
    const len = Math.max(Math.floor(sr * 0.25), Math.min(src.length - s0, Math.floor(durSec * sr)));
    const out = ctx.createBuffer(1, len, sr);
    const dst = out.getChannelData(0);
    const ch0 = src.getChannelData(0);
    for (let i = 0; i < len; i++) dst[i] = ch0[s0 + i];
    // Seamless loop crossfade at ends
    const fadeN = Math.min(Math.floor(len * 0.25), Math.floor(loopFadeSec * sr));
    for (let i = 0; i < fadeN; i++) {
      const t = i / fadeN;
      const tail = dst[len - fadeN + i];
      dst[i] = dst[i] * t + tail * (1 - t);
      dst[len - fadeN + i] = dst[len - fadeN + i] * (1 - t) + dst[i] * t;
    }
    return out;
  }

  private async loadRealSamples(ctx: AudioContext, master: GainNode): Promise<void> {
    const specs: { key: string; url: string; start: number; dur: number; loop?: boolean }[] = [
      { key: 'v8_muscle', url: '/racer-refs/Muscle_car_suspension_study_9ac957de.mp4', start: 0.9, dur: 3.4, loop: true },
      { key: 'backfire', url: '/racer-refs/Muscle_car_suspension_study_9ac957de.mp4', start: 7.0, dur: 1.0, loop: false },
      { key: 'supercar_track', url: '/racer-refs/Vehicle_suspension_movement_study_06ea8744.mp4', start: 0.6, dur: 4.0, loop: true },
      { key: 'curb_thud', url: '/racer-refs/Car_suspension_movement_study_video_cf917772.mp4', start: 1.1, dur: 1.1, loop: false },
      { key: 'tcr_touring', url: '/racer-refs/Car_suspension_movement_study_video_cf917772.mp4', start: 5.2, dur: 2.8, loop: true },
      { key: 'rally_gravel', url: '/racer-refs/Rally_hatchback_sliding_on_gravel_2e3c5558.mp4', start: 1.0, dur: 4.0, loop: true },
      { key: 'buggy_offroad', url: '/racer-refs/Buggy_tackling_sandy_humps_ed650de7.mp4', start: 1.0, dur: 3.8, loop: true },
      { key: 'ev_motor', url: '/racer-refs/Electric_sedan_negotiating_S-ben…_1e3a2a46.mp4', start: 1.2, dur: 4.2, loop: true },
      { key: 'tire_screech', url: '/racer-refs/Tire_smoke_swirling_horizontally_08e27b64.mp4', start: 0.6, dur: 3.2, loop: true },
      { key: 'brake_hiss', url: '/racer-refs/Brake_rotor_heating_thermal_glow_4caa196f.mp4', start: 1.0, dur: 3.0, loop: true },
    ];

    const decodedCache = new Map<string, AudioBuffer>();
    for (const s of specs) {
      try {
        let full = decodedCache.get(s.url);
        if (!full) {
          const resp = await fetch(encodeURI(s.url));
          if (!resp.ok) continue;
          const ab = await resp.arrayBuffer();
          full = await ctx.decodeAudioData(ab);
          decodedCache.set(s.url, full);
        }
        const sliced = this.sliceLoopBuffer(ctx, full, s.start, s.dur, s.loop ? 0.14 : 0.02);
        this.sampleBuffers.set(s.key, sliced);
      } catch {
        // Offline or unsupported codec — synthetic fallback remains active
      }
    }

    const bindLoop = (key: string, gainRef: (g: GainNode) => void) => {
      const buf = this.sampleBuffers.get(key);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(master);
      src.start();
      gainRef(g);
    };

    bindLoop('tire_screech', (g) => { this.tireSampleGain = g; });
    bindLoop('rally_gravel', (g) => { this.gravelSampleGain = g; });
    bindLoop('brake_hiss', (g) => { this.brakeSampleGain = g; });
  }

  private ensureEngineSample(key: string): boolean {
    if (!this.ctx || !this.master) return false;
    const buf = this.sampleBuffers.get(key);
    if (!buf) return false;
    if (this.engSampleKey === key && this.engSampleSrc && this.engSampleGain) return true;
    try { this.engSampleSrc?.stop(); } catch {}
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    // the engine loops are cut from video soundtracks, which carry tyre squeal and road noise in the 1 to 4 kHz band: keep the engine's body and cut that band so no squeal is
    // ever heard in the engine; real tyre squeal comes only from the physics-driven layer below
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.6;
    const notch = this.ctx.createBiquadFilter();
    notch.type = 'notch'; notch.frequency.value = 1450; notch.Q.value = 2.5;
    src.connect(lp); lp.connect(notch); notch.connect(g);
    g.connect(this.master);
    src.start();
    this.engSampleSrc = src;
    this.engSampleGain = g;
    this.engSampleKey = key;
    return true;
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
    const engSampleKey = isEv
      ? 'ev_motor'
      : spec.vehicleClass === 'buggy' || spec.vehicleClass === 'truck' || spec.suspension.travelM >= 0.25
      ? 'buggy_offroad'
      : spec.engine.aspiration === 'Supercharged' || spec.vehicleClass === 'muscle'
      ? 'v8_muscle'
      : spec.vehicleClass === 'rally'
      ? 'tcr_touring'
      : 'supercar_track';
    const hasRealEng = this.ensureEngineSample(engSampleKey);
    const synthScale = hasRealEng ? 0.16 : 1.0;

    if (hasRealEng && this.engSampleSrc && this.engSampleGain) {
      this.engSampleSrc.playbackRate.setTargetAtTime(0.65 + rpmFrac * 0.95, now, 0.04);
      this.engSampleGain.gain.setTargetAtTime((0.20 + throttle * 0.26 + rpmFrac * 0.14) * shiftDip, now, 0.04);
    }

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
