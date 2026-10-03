/**
 * React Hook: useUnifiedCasting
 * 
 * Provides unified casting state and control methods across
 * Google Cast, Matter Casting, and Samsung Smart View.
 */

import { useState, useEffect, useCallback } from 'react';
import { unifiedCastingService, UnifiedCastingState, CastDevice } from '../services/casting/unifiedCastingService';

export function useUnifiedCasting() {
  const [state, setState] = useState<UnifiedCastingState>(unifiedCastingService.getState());

  useEffect(() => {
    return unifiedCastingService.subscribe((updated) => {
      setState(updated);
    });
  }, []);

  const scanDevices = useCallback(async () => {
    return unifiedCastingService.scanDevices();
  }, []);

  const startCasting = useCallback(async (
    target: CastDevice,
    media: {
      title: string;
      artist?: string;
      albumTitle?: string;
      imageUrl?: string;
      contentUrl?: string;
      mediaType?: 'audio' | 'video';
    }
  ) => {
    return unifiedCastingService.startCasting(target, media);
  }, []);

  const stopCasting = useCallback(async () => {
    return unifiedCastingService.stopCasting();
  }, []);

  const setVolume = useCallback((volume: number) => {
    unifiedCastingService.setVolume(volume);
  }, []);

  const toggleMute = useCallback(() => {
    unifiedCastingService.toggleMute();
  }, []);

  const addCustomDevice = useCallback((device: Omit<CastDevice, 'id' | 'status'>) => {
    return unifiedCastingService.addCustomDevice(device);
  }, []);

  const removeCustomDevice = useCallback((id: string) => {
    unifiedCastingService.removeCustomDevice(id);
  }, []);

  const requestGoogleCastPicker = useCallback(async () => {
    return unifiedCastingService.requestGoogleCastPicker();
  }, []);

  return {
    isAvailable: state.isAvailable,
    isCasting: state.isCasting,
    isScanning: state.isScanning,
    activeDevice: state.activeDevice,
    devices: state.devices,
    groups: state.groups,
    volume: state.volume,
    isMuted: state.isMuted,
    currentTime: state.currentTime,
    duration: state.duration,
    currentMedia: state.currentMedia,
    scanDevices,
    startCasting,
    stopCasting,
    setVolume,
    toggleMute,
    addCustomDevice,
    removeCustomDevice,
    requestGoogleCastPicker,
  };
}
