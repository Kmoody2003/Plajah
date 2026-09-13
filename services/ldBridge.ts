/**
 * ldBridge.ts — The bridge between the LD show engine and all output adapters.
 *
 * Three output channels:
 *   1. Smart Lights — Hue, Nanoleaf, Govee, Razer via smartLightingService
 *   2. Screen-as-Fixture — BroadcastChannel to any logged-in Plajah tab
 *   3. GlobalLighting — the Pixels volumetric beam overlay
 *
 * The bridge runs a rAF loop at ~15fps (smart lights can't handle faster),
 * reading the show engine's cue evaluation or party mode state and pushing
 * it to all adapters simultaneously.
 */

import { useReducer, useEffect } from 'react';
import { smartLightingService } from './smartLightingService';
import {
  evaluateShow,
  partyModeState,
  hslToHex,
  extractPaletteFromImage,
  type LightShow,
  type FixtureState,
  type LDColor,
} from './lightShowEngine';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LDBridgeState {
  /** Whether the bridge loop is running. */
  running: boolean;
  /** Current output state for each fixture, keyed by fixture ID. */
  fixtureStates: Map<string, FixtureState>;
  /** Number of connected smart lights. */
  connectedLightCount: number;
  /** Number of screen fixtures synced. */
  screenFixtureCount: number;
  /** Current palette (from album art or scene). */
  activePalette: LDColor[];
  /** Whether auto-palette extraction from album art is active. */
  autoPalette: boolean;
  /** Last audio analysis snapshot. */
  lastAudio: AudioSnapshot;
}

export interface AudioSnapshot {
  bass: number;
  mid: number;
  treble: number;
  level: number;
  /** Simple beat detection flag. */
  isBeat: boolean;
  /** Estimated BPM from inter-beat intervals. */
  estimatedBPM: number;
}

// ── Screen-as-Fixture BroadcastChannel ──────────────────────────────────────

const SCREEN_CHANNEL_NAME = 'plajah-ld-screen-sync';

export interface ScreenSyncMessage {
  type: 'LD_SCREEN_SYNC';
  /** CSS background value to apply. */
  background: string;
  /** Intensity 0-1 for opacity. */
  intensity: number;
  /** Optional strobe rate. */
  strobe?: number;
  /** Timestamp for frame synchronization. */
  timestamp: number;
}

// ── Beat Detector ───────────────────────────────────────────────────────────

class SimpleBeatDetector {
  private history: number[] = [];
  private beatTimes: number[] = [];
  private threshold = 1.4;
  private lastBeat = 0;
  private cooldown = 200; // ms between beats

  detect(bass: number, now: number): boolean {
    this.history.push(bass);
    if (this.history.length > 43) this.history.shift(); // ~43 frames @ 15fps ≈ 3 seconds

    const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    const isBeat = bass > avg * this.threshold && (now - this.lastBeat) > this.cooldown;

    if (isBeat) {
      this.lastBeat = now;
      this.beatTimes.push(now);
      if (this.beatTimes.length > 16) this.beatTimes.shift();
    }

    return isBeat;
  }

  get bpm(): number {
    if (this.beatTimes.length < 4) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < this.beatTimes.length; i++) {
      intervals.push(this.beatTimes[i] - this.beatTimes[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval < 200) return 0;
    return Math.round(60000 / avgInterval);
  }
}

// ── Audio Analyzer ──────────────────────────────────────────────────────────

function analyzeAudio(analyser: AnalyserNode, data: Uint8Array): AudioSnapshot {
  analyser.getByteFrequencyData(data);

  let bass = 0, mid = 0, treble = 0;
  const len = data.length;

  for (let i = 0; i < 8 && i < len; i++) bass += data[i];
  bass = (bass / 8) / 255;

  for (let i = 8; i < 80 && i < len; i++) mid += data[i];
  mid = (mid / 72) / 255;

  const trebleEnd = Math.min(200, len);
  const trebleCount = Math.max(1, trebleEnd - 80);
  for (let i = 80; i < trebleEnd; i++) treble += data[i];
  treble = (treble / trebleCount) / 255;

  const level = Math.min(1, bass * 0.5 + mid * 0.35 + treble * 0.15);

  return { bass, mid, treble, level, isBeat: false, estimatedBPM: 0 };
}

// ── HSL → RGB ───────────────────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// ── The Bridge ──────────────────────────────────────────────────────────────

class LDBridge {
  private rafId?: number;
  private analyser: AnalyserNode | null = null;
  private dataArray?: Uint8Array;
  private beatDetector = new SimpleBeatDetector();
  private broadcastChannel: BroadcastChannel | null = null;
  private lastPush = 0;
  private pushInterval = 67; // ~15fps
  private listeners = new Set<() => void>();
  private _startTimeSec = 0;
  private _showRef: LightShow | null = null;

  state: LDBridgeState = {
    running: false,
    fixtureStates: new Map(),
    connectedLightCount: 0,
    screenFixtureCount: 0,
    activePalette: [],
    autoPalette: true,
    lastAudio: { bass: 0, mid: 0, treble: 0, level: 0, isBeat: false, estimatedBPM: 0 },
  };

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify() { this.listeners.forEach(fn => fn()); }

  /** Start the bridge loop. Call when LD view mounts. */
  start(analyser: AnalyserNode | null, show: LightShow) {
    this.analyser = analyser;
    this._showRef = show;
    if (analyser) this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    this._startTimeSec = performance.now() / 1000;

    try { this.broadcastChannel = new BroadcastChannel(SCREEN_CHANNEL_NAME); } catch { /* not supported */ }

    this.state.running = true;
    this.state.connectedLightCount = smartLightingService.lights.length;
    this.runLoop();
    this.notify();
  }

  /** Stop the bridge loop. Call when LD view unmounts. */
  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = undefined;
    this.state.running = false;
    this._showRef = null;
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
    this.notify();
  }

  /** Update the show reference (e.g., when scene changes, intensity changes). */
  updateShow(show: LightShow) { this._showRef = show; }

  updateAnalyser(analyser: AnalyserNode | null) {
    this.analyser = analyser;
    if (analyser) this.dataArray = new Uint8Array(analyser.frequencyBinCount);
  }

  // ── Core Loop ─────────────────────────────────────────────────────────────

  private runLoop() {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);

      const now = Date.now();
      if (now - this.lastPush < this.pushInterval) return;
      this.lastPush = now;

      const show = this._showRef;
      if (!show) return;

      // 1. Analyze audio
      let audio = this.state.lastAudio;
      if (this.analyser && this.dataArray) {
        audio = analyzeAudio(this.analyser, this.dataArray);
        audio.isBeat = this.beatDetector.detect(audio.bass, now);
        audio.estimatedBPM = this.beatDetector.bpm;
        this.state.lastAudio = audio;
      }

      // 2. Evaluate show state
      let states: Map<string, FixtureState>;
      const timeSec = performance.now() / 1000 - this._startTimeSec;

      if (show.partyMode) {
        const palette = this.state.activePalette.length > 0
          ? this.state.activePalette
          : show.scenes[0]?.palette || [{ h: 280, s: 85, l: 45 }];

        const globalState = partyModeState(audio, palette, timeSec, show.masterIntensity);
        states = new Map();
        states.set('*', globalState);

        for (const fixture of show.fixtures) {
          states.set(fixture.id, { ...globalState, fixtureId: fixture.id });
        }
      } else {
        states = evaluateShow(show, timeSec * show.masterSpeed);
      }

      this.state.fixtureStates = states;

      // 3. Push to smart lights
      const globalState = states.get('*');
      if (globalState && smartLightingService.lights.length > 0) {
        const rgb = hslToRgb(globalState.color.h, globalState.color.s, globalState.color.l);
        const brightness = globalState.intensity;

        for (const light of smartLightingService.lights.filter(l => l.on)) {
          smartLightingService.setLightColor(light.id, rgb, brightness).catch(() => {});
        }
      }

      // 4. Push to screen-as-fixture via BroadcastChannel
      if (this.broadcastChannel && globalState) {
        const msg: ScreenSyncMessage = {
          type: 'LD_SCREEN_SYNC',
          background: `radial-gradient(circle at 50% 40%, ${hslToHex(globalState.color)}${Math.round(globalState.intensity * 255).toString(16).padStart(2, '0')} 0%, #000 100%)`,
          intensity: globalState.intensity,
          strobe: globalState.strobe,
          timestamp: now,
        };
        this.broadcastChannel.postMessage(msg);
      }

      // 5. Update connected counts
      this.state.connectedLightCount = smartLightingService.lights.length;
      this.notify();
    };

    this.rafId = requestAnimationFrame(loop);
  }

  // ── Palette Extraction ────────────────────────────────────────────────────

  /** Extract palette from album art URL. */
  async extractPaletteFromAlbumArt(imageUrl: string): Promise<LDColor[]> {
    return new Promise<LDColor[]>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const palette = extractPaletteFromImage(imageData, 5);
        this.state.activePalette = palette;
        this.notify();
        resolve(palette);
      };
      img.onerror = () => resolve([]);
      img.src = imageUrl;
    });
  }

  /** Manually set the active palette. */
  setPalette(palette: LDColor[]) {
    this.state.activePalette = palette;
    this.notify();
  }

  /** Get the current global output color as CSS. */
  getCurrentColorCSS(): string {
    const globalState = this.state.fixtureStates.get('*');
    if (!globalState) return 'hsl(280, 85%, 45%)';
    return `hsl(${globalState.color.h}, ${globalState.color.s}%, ${globalState.color.l}%)`;
  }

  /** Get the current global output color as RGB tuple. */
  getCurrentColorRGB(): [number, number, number] {
    const globalState = this.state.fixtureStates.get('*');
    if (!globalState) return [128, 0, 200];
    return hslToRgb(globalState.color.h, globalState.color.s, globalState.color.l);
  }
}

export const ldBridge = new LDBridge();

/** React hook to subscribe to LD bridge state. */
export function useLDBridge() {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => ldBridge.subscribe(tick), []);
  return ldBridge;
}

// ── Screen-as-Fixture Receiver ──────────────────────────────────────────────

/**
 * Use in any Plajah tab that should act as a screen fixture.
 * Listens on BroadcastChannel and applies LD output as a fullscreen wash.
 */
export function createScreenFixtureReceiver(
  onSync: (msg: ScreenSyncMessage) => void,
): () => void {
  try {
    const channel = new BroadcastChannel(SCREEN_CHANNEL_NAME);
    channel.onmessage = (e) => {
      if (e.data?.type === 'LD_SCREEN_SYNC') onSync(e.data as ScreenSyncMessage);
    };
    return () => channel.close();
  } catch {
    return () => {};
  }
}
