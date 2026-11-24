// components/liveGames/ParlorStage3D.tsx
//
// Live 3D Broadcast Studio / Candlelit Fable Tavern stage backdrop for Plajah Party & Parlor games
// (Brain Rush, Crowd Says, Impostor Night, Sketch Rush). Powered by `PlaykitLiveStage` (WebGPU/TSL
// with automatic WebGL2 fallback). Automatically respects `prefers-reduced-motion`.

import React, { useEffect, useRef } from 'react';
import { PlaykitLiveStage } from '../../playkit/render/threeBridge';
import type { PartyKind, PartyStatus } from '../../services/liveGames/party';

interface ParlorStage3DProps {
  kind: PartyKind;
  status: PartyStatus;
  secondsLeft: number;
}

export function ParlorStage3D({ kind, status, secondsLeft }: ParlorStage3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<PlaykitLiveStage | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const el = hostRef.current;
    if (!el) return;

    const stage = new PlaykitLiveStage(el);
    stageRef.current = stage;
    const venue = kind === 'impostor' ? 'tavern' : 'broadcast';
    void stage.init(venue === 'tavern' ? 'parlor-fable-tavern-3d' : 'parlor-broadcast-studio-3d').then(() => {
      stage.loadParlorVenue(venue, 0.25);
    });

    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, [kind]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const tension =
      status === 'reveal' ? 0.95 :
      status === 'vote' ? 0.75 :
      status === 'answer' && secondsLeft > 0 && secondsLeft <= 5 ? 0.9 :
      status === 'answer' ? 0.5 : 0.2;
    stage.setParlorTension(tension);
  }, [status, secondsLeft]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 opacity-65"
    />
  );
}
