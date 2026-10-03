/**
 * Tizen Samsung Smart TV Service
 * Bridges Chora audio playback with Samsung Tizen OS APIs and Bixby.
 */

import { ChoraVoiceTrack } from './alexaService.js';

export class TizenService {
  public static isTizen(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window as any).__isTizenTV ||
      !!(window as any).tizen ||
      navigator.userAgent.indexOf('Tizen') !== -1;
  }

  /**
   * Updates currently playing track in Samsung TV Quick Settings / Media bar
   */
  public static updateMedia(track: ChoraVoiceTrack): void {
    if (typeof window !== 'undefined' && (window as any).__tizenUpdateMediaMetadata) {
      (window as any).__tizenUpdateMediaMetadata(track);
    }
  }

  /**
   * Prevents TV screen from entering standby during music playback
   */
  public static keepScreenAwake(enable: boolean): void {
    if (typeof window !== 'undefined' && (window as any).__tizenKeepScreenAwake) {
      (window as any).__tizenKeepScreenAwake(enable);
    }
  }

  /**
   * Listen to TV Remote keys & Bixby Voice events
   */
  public static onRemoteCommand(
    callbacks: {
      onPlayPause?: () => void;
      onPlay?: () => void;
      onPause?: () => void;
      onStop?: () => void;
      onNext?: () => void;
      onPrev?: () => void;
      onVoicePlay?: (query: string) => void;
    }
  ): () => void {
    if (typeof window === 'undefined') return () => {};

    const handlePlayPause = () => callbacks.onPlayPause?.();
    const handlePlay = () => callbacks.onPlay?.();
    const handlePause = () => callbacks.onPause?.();
    const handleStop = () => callbacks.onStop?.();
    const handleNext = () => callbacks.onNext?.();
    const handlePrev = () => callbacks.onPrev?.();
    const handleVoicePlay = (e: any) => callbacks.onVoicePlay?.(e.detail?.query || '');

    window.addEventListener('chora:remote:playpause', handlePlayPause);
    window.addEventListener('chora:remote:play', handlePlay);
    window.addEventListener('chora:remote:pause', handlePause);
    window.addEventListener('chora:remote:stop', handleStop);
    window.addEventListener('chora:remote:next', handleNext);
    window.addEventListener('chora:remote:prev', handlePrev);
    window.addEventListener('chora:voice:play', handleVoicePlay);

    return () => {
      window.removeEventListener('chora:remote:playpause', handlePlayPause);
      window.removeEventListener('chora:remote:play', handlePlay);
      window.removeEventListener('chora:remote:pause', handlePause);
      window.removeEventListener('chora:remote:stop', handleStop);
      window.removeEventListener('chora:remote:next', handleNext);
      window.removeEventListener('chora:remote:prev', handlePrev);
      window.removeEventListener('chora:voice:play', handleVoicePlay);
    };
  }
}
