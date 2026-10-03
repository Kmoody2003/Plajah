/**
 * Native Google Cast Sender Service for Plajah & Chora
 *
 * Implements the Google Cast Web Sender SDK (v1/cast_sender.js).
 * Streams Chora music, DJ mixes, albums, and Plajah TV channels directly
 * to Google Nest Hub, Nest Audio, Chromecast, Android TV, and Cast-enabled devices.
 */

import { ChoraVoiceTrack } from './alexaService.js';

export const CAST_APP_ID = 'CC1AD845'; // Google Default Media Receiver

export type CastConnectionState =
  | 'NO_DEVICES_AVAILABLE'
  | 'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED';

export interface CastPlayerState {
  isAvailable: boolean;
  connectionState: CastConnectionState;
  deviceName: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  currentMedia: {
    title: string;
    artist?: string;
    albumTitle?: string;
    imageUrl?: string;
    contentUrl?: string;
  } | null;
}

type CastStateListener = (state: CastPlayerState) => void;

class GoogleCastService {
  private isSdkLoaded = false;
  private castContext: any = null;
  private currentSession: any = null;
  private remotePlayer: any = null;
  private remotePlayerController: any = null;
  private listeners: Set<CastStateListener> = new Set();

  private state: CastPlayerState = {
    isAvailable: false,
    connectionState: 'NO_DEVICES_AVAILABLE',
    deviceName: null,
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    isMuted: false,
    currentMedia: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.initSdk();
    }
  }

  private initSdk() {
    // Check if SDK already loaded
    if ((window as any).cast?.framework) {
      this.onSdkReady();
      return;
    }

    // Register Google Cast SDK callback
    (window as any).__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable && (window as any).cast?.framework) {
        this.onSdkReady();
      } else {
        this.updateState({ isAvailable: false, connectionState: 'NO_DEVICES_AVAILABLE' });
      }
    };

    // Inject SDK script if not already present
    if (!document.getElementById('google-cast-sender-sdk')) {
      const script = document.createElement('script');
      script.id = 'google-cast-sender-sdk';
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      script.async = true;
      document.head.appendChild(script);
    }
  }

  private onSdkReady() {
    try {
      const cast = (window as any).cast;
      const chrome = (window as any).chrome;

      this.castContext = cast.framework.CastContext.getInstance();
      this.castContext.setOptions({
        receiverApplicationId: CAST_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });

      this.remotePlayer = new cast.framework.RemotePlayer();
      this.remotePlayerController = new cast.framework.RemotePlayerController(this.remotePlayer);

      this.isSdkLoaded = true;
      this.bindEvents();
      this.syncState();
    } catch (e) {
      console.warn('[GoogleCastService] Failed to initialize CastContext:', e);
    }
  }

  private bindEvents() {
    const cast = (window as any).cast;
    if (!this.castContext || !this.remotePlayerController) return;

    this.castContext.addEventListener(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      (event: any) => {
        const stateMap: Record<string, CastConnectionState> = {
          [cast.framework.CastState.NO_DEVICES_AVAILABLE]: 'NO_DEVICES_AVAILABLE',
          [cast.framework.CastState.NOT_CONNECTED]: 'NOT_CONNECTED',
          [cast.framework.CastState.CONNECTING]: 'CONNECTING',
          [cast.framework.CastState.CONNECTED]: 'CONNECTED',
        };
        const connectionState = stateMap[event.castState] || 'NOT_CONNECTED';
        this.updateState({
          isAvailable: event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE,
          connectionState,
        });
      }
    );

    this.castContext.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event: any) => {
        this.currentSession = this.castContext.getCurrentSession();
        const deviceName = this.currentSession?.getCastDevice()?.friendlyName || null;
        this.updateState({ deviceName });
      }
    );

    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      () => this.syncState()
    );

    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
      () => this.syncState()
    );

    this.remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
      () => {
        this.updateState({
          currentTime: this.remotePlayer?.currentTime || 0,
          duration: this.remotePlayer?.duration || 0,
        });
      }
    );
  }

  private syncState() {
    if (!this.remotePlayer) return;
    const session = this.castContext?.getCurrentSession();
    this.updateState({
      isAvailable: this.isSdkLoaded,
      connectionState: this.remotePlayer.isConnected ? 'CONNECTED' : 'NOT_CONNECTED',
      deviceName: session?.getCastDevice()?.friendlyName || null,
      isPlaying: this.remotePlayer.isConnected && !this.remotePlayer.isPaused,
      isPaused: this.remotePlayer.isPaused,
      currentTime: this.remotePlayer.currentTime || 0,
      duration: this.remotePlayer.duration || 0,
      volume: this.remotePlayer.volumeLevel || 1.0,
      isMuted: this.remotePlayer.isMuted || false,
    });
  }

  private updateState(partial: Partial<CastPlayerState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }

  public subscribe(listener: CastStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public getState(): CastPlayerState {
    return this.state;
  }

  /**
   * Prompts the native browser Google Cast device picker
   */
  public async requestSession(): Promise<boolean> {
    if (!this.castContext) {
      this.initSdk();
      return false;
    }
    try {
      await this.castContext.requestSession();
      return true;
    } catch (e) {
      console.warn('[GoogleCastService] User cancelled or error in requestSession:', e);
      return false;
    }
  }

  /**
   * Disconnects the active Google Cast session
   */
  public disconnect(): void {
    if (this.castContext) {
      this.castContext.endCurrentSession(true);
    }
  }

  /**
   * Cast a Chora track to the active Cast receiver
   */
  public async castChoraTrack(track: ChoraVoiceTrack): Promise<boolean> {
    const session = this.castContext?.getCurrentSession();
    if (!session) {
      const connected = await this.requestSession();
      if (!connected) return false;
    }

    const currentSession = this.castContext.getCurrentSession();
    if (!currentSession) return false;

    const chrome = (window as any).chrome;
    const mediaInfo = new chrome.cast.media.MediaInfo(track.url, 'audio/mp3');
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = track.title;
    mediaInfo.metadata.artist = track.artist;
    if (track.albumTitle) {
      mediaInfo.metadata.albumName = track.albumTitle;
    }
    if (track.cover) {
      mediaInfo.metadata.images = [new chrome.cast.Image(track.cover)];
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = true;

    try {
      await currentSession.loadMedia(request);
      this.updateState({
        currentMedia: {
          title: track.title,
          artist: track.artist,
          albumTitle: track.albumTitle,
          imageUrl: track.cover,
          contentUrl: track.url,
        },
      });
      return true;
    } catch (e) {
      console.error('[GoogleCastService] Failed to loadMedia on Cast device:', e);
      return false;
    }
  }

  /**
   * Playback controls
   */
  public play(): void {
    if (this.remotePlayerController && this.remotePlayer?.isPaused) {
      this.remotePlayerController.playOrPause();
    }
  }

  public pause(): void {
    if (this.remotePlayerController && !this.remotePlayer?.isPaused) {
      this.remotePlayerController.playOrPause();
    }
  }

  public togglePlayPause(): void {
    if (this.remotePlayerController) {
      this.remotePlayerController.playOrPause();
    }
  }

  public seek(seconds: number): void {
    if (this.remotePlayer && this.remotePlayerController) {
      this.remotePlayer.currentTime = seconds;
      this.remotePlayerController.seek();
    }
  }

  public setVolume(volume: number): void {
    if (this.remotePlayer && this.remotePlayerController) {
      this.remotePlayer.volumeLevel = Math.max(0, Math.min(1, volume));
      this.remotePlayerController.setVolumeLevel();
    }
  }

  public setMuted(muted: boolean): void {
    if (this.remotePlayer && this.remotePlayerController) {
      if (this.remotePlayer.isMuted !== muted) {
        this.remotePlayerController.muteOrUnmute();
      }
    }
  }
}

export const googleCastService = new GoogleCastService();
