// services/audio/avbService.ts — Audio Video Bridging (AVB / Milan / IEEE 1722 / AVDECC)
//
// Not implemented yet: discovery (AVDECC) and audio (AVTP) need raw Layer-2 access and gPTP, which
// the desktop app doesn't have. This service reports only what it observes — the PC's wired
// adapters from the native app, no entities, no clock — and never fills in example hardware.
// Consoles record into Chora over USB/ASIO meanwhile (Chora → Inputs).

import { listAvbInterfaces, listAvbEntities, stopAvbStream, getAvbClockStatus } from '../mediaEngine/bridge';

export interface AvbInterface {
  id: string;
  name: string;
  description: string;
  macAddress: string;
  supportsPtp: boolean;       // IEEE 802.1AS gPTP support
  supportsAvtp: boolean;      // IEEE 1722 AVTP transport
  linkSpeedGbps: number;
  driverName: string;
  ptpStatus: string;
}

export interface AvbEntity {
  entityId: string;           // EUI-64 unique hardware identifier
  name: string;
  modelName: string;
  manufacturer: string;
  talkerStreams: number;
  listenerStreams: number;
  supportedSampleRates: number[];
  milanCompliant: boolean;
  ipAddress: string;
  status: string;
}

export interface AvbStreamRoute {
  id: string;
  name: string;
  direction: 'TALKER' | 'LISTENER';
  channels: number;           // 2, 8, 16, 24, 32, 64
  sampleRate: number;         // 48000, 96000
  bitDepth: 24 | 32;
  entityId?: string;
  active: boolean;
  latencyMs: number;
  channelNames: string[];
}

export interface AvbPtpClock {
  grandmasterId: string;
  ptpDomain: string;
  lockState: 'LOCKED' | 'CALIBRATING' | 'FREERUN' | 'UNAVAILABLE';
  offsetNs: number;
  jitterNs: number;
  milanLocked: boolean;
}

export interface AvbState {
  /** False until AVB audio actually works — the UI says so instead of showing routes. */
  available: boolean;
  enabled: boolean;
  connected: boolean;
  interfaces: AvbInterface[];
  entities: AvbEntity[];
  streams: AvbStreamRoute[];
  clock: AvbPtpClock;
  selectedInterfaceId: string | null;
  lastScannedAt: number;
}

export const AVB_UNAVAILABLE = "AVB isn't available yet — record your console over USB (Chora → Inputs).";

const NO_CLOCK: AvbPtpClock = { grandmasterId: '', ptpDomain: '', lockState: 'UNAVAILABLE', offsetNs: 0, jitterNs: 0, milanLocked: false };

class AvbAudioService {
  private static instance: AvbAudioService | null = null;
  private state: AvbState = {
    available: false,
    enabled: false,
    connected: false,
    interfaces: [],
    entities: [],
    streams: [],
    clock: NO_CLOCK,
    selectedInterfaceId: null,
    lastScannedAt: 0,
  };

  private listeners = new Set<(state: AvbState) => void>();
  private constructor() {
    this.init();
  }

  public static getInstance(): AvbAudioService {
    if (!AvbAudioService.instance) {
      AvbAudioService.instance = new AvbAudioService();
    }
    return AvbAudioService.instance;
  }

  public subscribe(fn: (state: AvbState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => { this.listeners.delete(fn); };
  }

  public getState(): AvbState {
    return { ...this.state };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach(fn => {
      try { fn(s); } catch (e) { console.error('[AVB] Listener error:', e); }
    });
  }

  public async init(): Promise<void> {
    await this.scanNetwork();
  }

  public async scanNetwork(): Promise<void> {
    try {
      const [ifaces, entities, clock] = await Promise.all([listAvbInterfaces(), listAvbEntities(), getAvbClockStatus()]);
      this.state.interfaces = ifaces;
      this.state.entities = entities;
      this.state.clock = clock && clock.lockState ? clock : NO_CLOCK;
      this.state.connected = entities.length > 0;
      this.state.lastScannedAt = Date.now();
      this.notify();
    } catch (e) {
      console.warn('[AVB] Scan notice:', e);
    }
  }

  /** AVB audio isn't implemented: refuses rather than adding a route that carries nothing. */
  public async addTalkerStream(_name: string, _channels = 16, _sampleRate = 48000): Promise<AvbStreamRoute> {
    throw new Error(AVB_UNAVAILABLE);
  }

  public async connectListenerStream(_entityId: string, _name: string, _channels = 16, _sampleRate = 48000): Promise<AvbStreamRoute> {
    throw new Error(AVB_UNAVAILABLE);
  }

  public async toggleStream(streamId: string): Promise<void> {
    const stream = this.state.streams.find(s => s.id === streamId);
    if (!stream) return;
    stream.active = !stream.active;
    if (!stream.active) {
      await stopAvbStream(streamId);
    }
    this.notify();
  }

  public async removeStream(streamId: string): Promise<void> {
    await stopAvbStream(streamId);
    this.state.streams = this.state.streams.filter(s => s.id !== streamId);
    this.notify();
  }
}

export const avbService = AvbAudioService.getInstance();
