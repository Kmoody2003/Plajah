/**
 * React Hook: useMatterCasting
 * Enables Matter Casting discovery, connection, and playback control in UI components.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  matterCastingService,
  MatterCastingPlayer,
  MatterPlaybackState,
} from '../services/matterCastingService.js';
import { ChoraVoiceTrack } from '../services/alexaService.js';

export function useMatterCasting() {
  const [players, setPlayers] = useState<MatterCastingPlayer[]>([]);
  const [connectedPlayer, setConnectedPlayer] = useState<MatterCastingPlayer | null>(
    matterCastingService.getConnectedPlayer()
  );
  const [playbackState, setPlaybackState] = useState<MatterPlaybackState>(
    matterCastingService.getPlaybackState()
  );
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    return matterCastingService.subscribe((updatedPlayers, connected) => {
      setPlayers(updatedPlayers);
      setConnectedPlayer(connected);
      setPlaybackState(matterCastingService.getPlaybackState());
    });
  }, []);

  const startDiscovery = useCallback(async () => {
    setIsScanning(true);
    try {
      const found = await matterCastingService.startDiscovery();
      setPlayers(found);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const connect = useCallback(async (player: MatterCastingPlayer) => {
    return matterCastingService.connect(player);
  }, []);

  const disconnect = useCallback(() => {
    matterCastingService.disconnect();
  }, []);

  const castTrack = useCallback(async (track: ChoraVoiceTrack) => {
    return matterCastingService.castChoraTrack(track);
  }, []);

  const play = useCallback(async () => {
    await matterCastingService.play();
    setPlaybackState(matterCastingService.getPlaybackState());
  }, []);

  const pause = useCallback(async () => {
    await matterCastingService.pause();
    setPlaybackState(matterCastingService.getPlaybackState());
  }, []);

  const stop = useCallback(async () => {
    await matterCastingService.stop();
    setPlaybackState(matterCastingService.getPlaybackState());
  }, []);

  const next = useCallback(async () => {
    await matterCastingService.next();
  }, []);

  const previous = useCallback(async () => {
    await matterCastingService.previous();
  }, []);

  const seek = useCallback(async (seconds: number) => {
    await matterCastingService.seek(seconds);
    setPlaybackState(matterCastingService.getPlaybackState());
  }, []);

  return {
    players,
    connectedPlayer,
    isConnected: !!connectedPlayer,
    isScanning,
    playbackState,
    startDiscovery,
    connect,
    disconnect,
    castTrack,
    play,
    pause,
    stop,
    next,
    previous,
    seek,
  };
}
