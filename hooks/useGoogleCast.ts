/**
 * React Hook: useGoogleCast
 * Provides Google Cast sender capabilities directly to UI components.
 */

import { useState, useEffect, useCallback } from 'react';
import { googleCastService, CastPlayerState } from '../services/googleCastService.js';
import { ChoraVoiceTrack } from '../services/alexaService.js';

export function useGoogleCast() {
  const [castState, setCastState] = useState<CastPlayerState>(googleCastService.getState());

  useEffect(() => {
    return googleCastService.subscribe((updatedState) => {
      setCastState(updatedState);
    });
  }, []);

  const connect = useCallback(async () => {
    return googleCastService.requestSession();
  }, []);

  const disconnect = useCallback(() => {
    googleCastService.disconnect();
  }, []);

  const castTrack = useCallback(async (track: ChoraVoiceTrack) => {
    return googleCastService.castChoraTrack(track);
  }, []);

  const play = useCallback(() => {
    googleCastService.play();
  }, []);

  const pause = useCallback(() => {
    googleCastService.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    googleCastService.togglePlayPause();
  }, []);

  const seek = useCallback((seconds: number) => {
    googleCastService.seek(seconds);
  }, []);

  const setVolume = useCallback((volume: number) => {
    googleCastService.setVolume(volume);
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    googleCastService.setMuted(muted);
  }, []);

  return {
    isAvailable: castState.isAvailable,
    isConnected: castState.connectionState === 'CONNECTED',
    isConnecting: castState.connectionState === 'CONNECTING',
    connectionState: castState.connectionState,
    deviceName: castState.deviceName,
    isPlaying: castState.isPlaying,
    isPaused: castState.isPaused,
    currentTime: castState.currentTime,
    duration: castState.duration,
    volume: castState.volume,
    isMuted: castState.isMuted,
    currentMedia: castState.currentMedia,
    connect,
    disconnect,
    castTrack,
    play,
    pause,
    togglePlayPause,
    seek,
    setVolume,
    setMuted,
  };
}
