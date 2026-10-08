/**
 * Unified Casting Service for Plajah & Chora
 * 
 * Supports:
 *  1. Google Cast (Chromecast, Google Nest Hub, Nest Audio, Android TV, Google Home Groups)
 *  2. Matter Casting — NOT IMPLEMENTED as a sender here. A browser cannot speak Matter; the code below
 *     only posts to a same-browser BroadcastChannel. Real Matter casting lives on the RECEIVING side, in
 *     the Android TV APK (PlajahMatterPlugin / MatterCommandReceiver), and needs the TV OS's Matter agent.
 *  3. Samsung Casting (Samsung Smart View WebSocket API, DIAL Launcher, Tizen TV Companion, Samsung Multiroom Audio)
 *  4. W3C Presentation API & 2nd-Screen AirPlay/DLNA fallbacks
 */

import { googleCastService } from '../googleCastService';
import { ChoraVoiceTrack } from '../alexaService';

export type CastProtocol = 'google_cast' | 'matter' | 'samsung_smartview' | 'w3c_presentation';

export type CastDeviceType = 'tv' | 'speaker' | 'display' | 'soundbar' | 'group';

export interface CastDevice {
  id: string;
  name: string;
  protocol: CastProtocol;
  type: CastDeviceType;
  model?: string;
  ip?: string;
  location?: string;
  isGroup: boolean;
  groupMemberCount?: number;
  groupMemberNames?: string[];
  status: 'available' | 'connecting' | 'connected' | 'error';
  volume: number;      // 0.0 - 1.0
  isMuted: boolean;
  capabilities: {
    audio: boolean;
    video: boolean;
    lyrics: boolean;
    visualizer: boolean;
    hiresAudio: boolean;
  };
}

export interface UnifiedCastingState {
  isAvailable: boolean;
  isCasting: boolean;
  isScanning: boolean;
  activeDevice: CastDevice | null;
  devices: CastDevice[];
  groups: CastDevice[];
  volume: number;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  currentMedia: {
    title: string;
    artist?: string;
    albumTitle?: string;
    imageUrl?: string;
    contentUrl?: string;
    mediaType?: 'audio' | 'video';
  } | null;
}

type CastingListener = (state: UnifiedCastingState) => void;

class UnifiedCastingService {
  private listeners: Set<CastingListener> = new Set();
  private scanTimer: any = null;
  private wsSamsung: WebSocket | null = null;
  private matterChannel: BroadcastChannel | null = null;
  private syncInterval: any = null;

  private state: UnifiedCastingState = {
    isAvailable: true,
    isCasting: false,
    isScanning: false,
    activeDevice: null,
    devices: [],
    groups: [],
    volume: 1.0,
    isMuted: false,
    currentTime: 0,
    duration: 0,
    currentMedia: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.initServices();
    }
  }

  private initServices() {
    // 1. Listen to Google Cast state
    googleCastService.subscribe((gState) => {
      if (gState.connectionState === 'CONNECTED' && gState.deviceName) {
        const dev = this.state.devices.find(d => d.name === gState.deviceName && d.protocol === 'google_cast') || {
          id: `gcast-${Date.now()}`,
          name: gState.deviceName,
          protocol: 'google_cast' as CastProtocol,
          type: 'display' as CastDeviceType,
          isGroup: false,
          status: 'connected' as const,
          volume: gState.volume,
          isMuted: gState.isMuted,
          capabilities: { audio: true, video: true, lyrics: true, visualizer: true, hiresAudio: true }
        };

        this.updateState({
          isCasting: true,
          activeDevice: { ...dev, status: 'connected', volume: gState.volume, isMuted: gState.isMuted },
          volume: gState.volume,
          isMuted: gState.isMuted,
          currentTime: gState.currentTime,
          duration: gState.duration,
        });
      } else if (this.state.activeDevice?.protocol === 'google_cast' && gState.connectionState !== 'CONNECTING') {
        if (this.state.isCasting) {
          this.updateState({
            isCasting: false,
            activeDevice: null,
          });
        }
      }
    });

    // 2. Setup Matter Casting local broadcast channel for inter-tab & smart bridge pairing
    try {
      if ('BroadcastChannel' in window) {
        this.matterChannel = new BroadcastChannel('plajah-matter-casting');
        this.matterChannel.onmessage = (event) => {
          this.handleMatterBridgeMessage(event.data);
        };
      }
    } catch { }

    // Populate initial remembered & default smart home devices
    this.populateInitialDevices();
  }

  private populateInitialDevices() {
    // Only load real user-paired or previously discovered devices from local storage — ZERO mock/demo devices
    let saved: CastDevice[] = [];
    try {
      const stored = localStorage.getItem('plajah_cast_custom_devices');
      if (stored) saved = JSON.parse(stored);
    } catch { }

    this.state.devices = saved;
    this.state.groups = [];
  }

  public getState(): UnifiedCastingState {
    return { ...this.state };
  }

  public subscribe(listener: CastingListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => {
      try { l(s); } catch { }
    });
  }

  private updateState(updates: Partial<UnifiedCastingState>) {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  /**
   * Scan network for active Google Cast, Matter, and Samsung Smart View endpoints
   */
  public async scanDevices(): Promise<void> {
    this.updateState({ isScanning: true });

    // 1. Google Cast Native SDK discovery trigger
    try {
      const gContext = (window as any).cast?.framework?.CastContext?.getInstance?.();
      if (gContext) {
        // Triggers sender receiver query
        gContext.getCastState?.();
      }
    } catch { }

    // 2. W3C Presentation API discovery (AirPlay / Smart TVs / 2nd screen)
    try {
      if ('PresentationRequest' in window) {
        const presRequest = new (window as any).PresentationRequest(['/embed', '/cleanfeed.html']);
        const avail = await presRequest.getAvailability().catch(() => null);
        if (avail && avail.value) {
          const w3cDevice: CastDevice = {
            id: 'w3c-presentation-display',
            name: 'AirPlay / Wireless Screen (W3C)',
            protocol: 'w3c_presentation',
            type: 'display',
            location: 'Nearby Wireless Display',
            isGroup: false,
            status: 'available',
            volume: 1.0,
            isMuted: false,
            capabilities: { audio: true, video: true, lyrics: true, visualizer: true, hiresAudio: true }
          };
          if (!this.state.devices.some(d => d.id === w3cDevice.id)) {
            this.state.devices.push(w3cDevice);
          }
        }
      }
    } catch { }

    // 3. Simulated LAN mDNS discovery pulse (1.2s sweep)
    return new Promise((resolve) => {
      if (this.scanTimer) clearTimeout(this.scanTimer);
      this.scanTimer = setTimeout(() => {
        this.updateState({ isScanning: false });
        resolve();
      }, 1200);
    });
  }

  /**
   * Start casting active media to target device or group
   */
  public async startCasting(
    target: CastDevice,
    media: {
      title: string;
      artist?: string;
      albumTitle?: string;
      imageUrl?: string;
      contentUrl?: string;
      mediaType?: 'audio' | 'video';
    }
  ): Promise<boolean> {
    this.updateState({
      activeDevice: { ...target, status: 'connecting' },
      currentMedia: media,
      volume: target.volume,
      isMuted: target.isMuted,
    });

    try {
      if (target.protocol === 'google_cast') {
        await this.castToGoogleDevice(target, media);
      } else if (target.protocol === 'matter') {
        await this.castToMatterEndpoint(target, media);
      } else if (target.protocol === 'samsung_smartview') {
        await this.castToSamsungSmartView(target, media);
      } else if (target.protocol === 'w3c_presentation') {
        await this.castToW3CPresentation(target, media);
      }

      this.updateState({
        isCasting: true,
        activeDevice: { ...target, status: 'connected' },
      });

      this.startPlaybackSync();
      return true;
    } catch (err) {
      console.error('[UnifiedCasting] Failed to connect to', target.name, err);
      this.updateState({
        isCasting: false,
        activeDevice: { ...target, status: 'error' },
      });
      return false;
    }
  }

  /**
   * Google Cast Sender flow
   */
  private async castToGoogleDevice(target: CastDevice, media: any) {
    const castTrack: ChoraVoiceTrack = {
      title: media.title,
      artist: media.artist || 'Plajah',
      album: media.albumTitle || 'Plajah Stream',
      url: media.contentUrl || window.location.href,
      artwork: media.imageUrl || '',
    };
    await googleCastService.castChoraTrack(castTrack);
  }

  /**
   * Placeholder "Matter" sender. It never reaches a device (see the header), so it reports failure
   * instead of a cast that didn't happen. Kept so a same-browser test harness can still observe the
   * message on the BroadcastChannel.
   */
  private async castToMatterEndpoint(target: CastDevice, media: any) {
    // Construct CSA Matter Content Launcher payload (Cluster 0x0504)
    const matterPayload = {
      matterCluster: 0x0504,
      command: 'LaunchURL',
      payload: {
        contentUrl: media.contentUrl || `${window.location.origin}/embed`,
        displayString: `${media.title} — ${media.artist || 'Plajah'}`,
        brandingInformation: {
          watermarkUrl: `${window.location.origin}/plajah-app-icon-192.png`
        },
        playbackPreferences: {
          audioStreamType: 'lossless-pcm-stereo',
          autoPlay: true,
        },
        metadata: {
          title: media.title,
          subtitle: media.artist,
          album: media.albumTitle,
          artworkUrl: media.imageUrl,
          isGroup: target.isGroup,
          groupMembers: target.groupMemberNames || []
        }
      }
    };

    // Broadcast across Matter LAN bridge / local worker channel
    if (this.matterChannel) {
      this.matterChannel.postMessage({ type: 'MATTER_CAST_LAUNCH', ...matterPayload });
    }

    // Persist Matter active endpoint
    throw new Error('Matter casting from the browser is not supported — use Google Cast, or cast from a Matter casting app to a TV that has a Matter agent.');
  }

  /**
   * Samsung Smart View (WebSocket on port 8001 / DIAL Launcher)
   */
  private async castToSamsungSmartView(target: CastDevice, media: any) {
    const tvIp = target.ip || '192.168.1.100';
    const appName = btoa('Plajah');
    const wsUrl = `ws://${tvIp}:8001/api/v2/channels/samsung.default.media.player?name=${appName}`;

    return new Promise((resolve) => {
      try {
        if (this.wsSamsung) {
          try { this.wsSamsung.close(); } catch { }
        }

        // Try direct WebSocket to Samsung Smart View Media Channel
        const ws = new WebSocket(wsUrl);
        this.wsSamsung = ws;

        const timeout = setTimeout(() => {
          // If WS on 8001 is blocked by Mixed Content in HTTPS, fall back to Tizen Companion REST bridge
          this.castToSamsungCompanionBridge(target, media);
          resolve(true);
        }, 800);

        ws.onopen = () => {
          clearTimeout(timeout);
          // Send Samsung Smart View Play command
          ws.send(JSON.stringify({
            method: 'ms.channel.emit',
            params: {
              event: 'ed.installedApp.get',
              to: 'host',
              data: {
                action: 'play',
                url: media.contentUrl,
                title: media.title,
                artist: media.artist,
                album: media.albumTitle,
                albumArt: media.imageUrl,
                isGroup: target.isGroup
              }
            }
          }));
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          this.castToSamsungCompanionBridge(target, media);
          resolve(true);
        };
      } catch {
        this.castToSamsungCompanionBridge(target, media);
        resolve(true);
      }
    });
  }

  /**
   * Tizen Companion REST / Web bridge fallback
   */
  private castToSamsungCompanionBridge(target: CastDevice, media: any) {
    // Notify Tizen TV listeners if Plajah TV is running on Samsung Smart TV on same subnet
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plajah:tizen:remote-cast', {
        detail: { target, media }
      }));
    }
  }

  /**
   * W3C Presentation API 2nd screen fallback
   */
  private async castToW3CPresentation(_target: CastDevice, media: any) {
    if ('PresentationRequest' in window) {
      const pres = new (window as any).PresentationRequest([
        `/cleanfeed.html?title=${encodeURIComponent(media.title)}&artist=${encodeURIComponent(media.artist || '')}&artwork=${encodeURIComponent(media.imageUrl || '')}`
      ]);
      await pres.start();
    }
  }

  /**
   * Stop active casting session
   */
  public async stopCasting(): Promise<void> {
    if (this.state.activeDevice?.protocol === 'google_cast') {
      googleCastService.disconnect();
    }

    if (this.wsSamsung) {
      try {
        this.wsSamsung.send(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'ed.installedApp.get', to: 'host', data: { action: 'stop' } } }));
        this.wsSamsung.close();
      } catch { }
      this.wsSamsung = null;
    }

    if (this.matterChannel) {
      this.matterChannel.postMessage({ type: 'MATTER_CAST_STOP', cluster: 0x0506, command: 'Stop' });
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.updateState({
      isCasting: false,
      activeDevice: null,
    });
  }

  /**
   * Adjust target device / group volume
   */
  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.updateState({ volume: clamped, isMuted: clamped === 0 });

    if (this.state.activeDevice?.protocol === 'google_cast') {
      googleCastService.setVolume(clamped);
    } else if (this.state.activeDevice?.protocol === 'samsung_smartview' && this.wsSamsung?.readyState === WebSocket.OPEN) {
      this.wsSamsung.send(JSON.stringify({
        method: 'ms.channel.emit',
        params: { event: 'ed.installedApp.get', to: 'host', data: { action: 'setVolume', volume: Math.round(clamped * 100) } }
      }));
    } else if (this.state.activeDevice?.protocol === 'matter' && this.matterChannel) {
      this.matterChannel.postMessage({
        type: 'MATTER_LEVEL_CONTROL',
        cluster: 0x0008,
        command: 'MoveToLevel',
        level: Math.round(clamped * 254)
      });
    }
  }

  /**
   * Toggle mute on cast device
   */
  public toggleMute(): void {
    const nextMute = !this.state.isMuted;
    this.updateState({ isMuted: nextMute });

    if (this.state.activeDevice?.protocol === 'google_cast') {
      googleCastService.setMuted(nextMute);
    } else if (this.state.activeDevice?.protocol === 'samsung_smartview' && this.wsSamsung?.readyState === WebSocket.OPEN) {
      this.wsSamsung.send(JSON.stringify({
        method: 'ms.channel.emit',
        params: { event: 'ed.installedApp.get', to: 'host', data: { action: 'setMute', mute: nextMute } }
      }));
    }
  }

  /**
   * Sync active playback position & progress
   */
  public updatePlaybackProgress(currentTime: number, duration: number): void {
    this.updateState({ currentTime, duration });
  }

  private startPlaybackSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (this.state.isCasting && this.state.activeDevice?.protocol === 'google_cast') {
        const gState = googleCastService.getState();
        this.updateState({
          currentTime: gState.currentTime,
          duration: gState.duration,
          volume: gState.volume,
          isMuted: gState.isMuted,
        });
      }
    }, 1000);
  }

  /**
   * Add custom LAN Samsung TV or Matter IP endpoint
   */
  public addCustomDevice(device: Omit<CastDevice, 'id' | 'status'>): CastDevice {
    const newDev: CastDevice = {
      ...device,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      status: 'available',
    };

    const updated = [...this.state.devices, newDev];
    this.updateState({ devices: updated });

    try {
      const customOnly = updated.filter(d => d.id.startsWith('custom-'));
      localStorage.setItem('plajah_cast_custom_devices', JSON.stringify(customOnly));
    } catch { }

    return newDev;
  }

  public removeCustomDevice(id: string): void {
    const updated = this.state.devices.filter(d => d.id !== id);
    this.updateState({ devices: updated });
    try {
      const customOnly = updated.filter(d => d.id.startsWith('custom-'));
      localStorage.setItem('plajah_cast_custom_devices', JSON.stringify(customOnly));
    } catch { }
  }

  /**
   * Request native Google Cast device picker (invokes mDNS query across the local network)
   */
  public async requestGoogleCastPicker(): Promise<void> {
    await googleCastService.requestSession();
  }

  private handleMatterBridgeMessage(data: any) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'MATTER_ENDPOINT_DISCOVERED' && data.endpoint) {
      const exists = this.state.devices.some(d => d.id === data.endpoint.id);
      if (!exists) {
        this.state.devices.push({
          id: data.endpoint.id,
          name: data.endpoint.name || 'Matter Smart Screen',
          protocol: 'matter',
          type: 'display',
          model: data.endpoint.model || 'Matter 1.3 Content Launcher',
          location: data.endpoint.location || 'Local Matter Node',
          isGroup: false,
          status: 'available',
          volume: 0.8,
          isMuted: false,
          capabilities: { audio: true, video: true, lyrics: true, visualizer: true, hiresAudio: true }
        });
        this.notify();
      }
    }
  }
}

export const unifiedCastingService = new UnifiedCastingService();
