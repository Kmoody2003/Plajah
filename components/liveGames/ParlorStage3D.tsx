// components/liveGames/ParlorStage3D.tsx
//
// Live 3D WebGPU/TSL (with automatic WebGL2 fallback) stage backdrop for ALL Plajah Parlor & Board games:
//   - 'broadcast' : Brain Rush, Crowd Says (TV game-show broadcast arena)
//   - 'tavern'    : Impostor Night (candlelit fable parlor)
//   - 'atelier'   : Sketch Rush (illuminated neon gallery studio)
//   - 'lounge'    : Chess, Checkers, Dominoes, Spades, Euchre, Bid Whist (velvet & brass parlor hall)
//   - 'cyber'     : Cyber Tic Tac Toe (holographic synthwave grid chamber)
// Automatically respects `prefers-reduced-motion` and fails silently if WebGL/WebGPU is unavailable.

import React, { useEffect, useRef } from 'react';
import { PlaykitLiveStage, type ParlorVenueKind } from '../../playkit/render/threeBridge';
import type { PartyKind, PartyStatus } from '../../services/liveGames/party';

interface ParlorStage3DProps {
  /** Explicit 3D venue theme. Takes precedence over `kind`. */
  venue?: ParlorVenueKind;
  /** Legacy/party game kind shortcut. */
  kind?: PartyKind | 'sketch' | 'table' | 'cyber';
  /** Optional party status to auto-map stage lighting tension. */
  status?: PartyStatus | 'choosing' | 'drawing' | 'active' | 'waiting' | 'done';
  /** Optional countdown seconds left (ramps tension at <= 5s). */
  secondsLeft?: number;
  /** Direct tension override in [0..1] when not driven by `status`. */
  tension?: number;
  /** Custom wrapper classes (defaults to absolute inset-0 backdrop). */
  className?: string;
}

const PRESET_FOR: Record<ParlorVenueKind, 'parlor-broadcast-studio-3d' | 'parlor-fable-tavern-3d' | 'parlor-atelier-3d' | 'parlor-grand-lounge-3d' | 'parlor-cyber-arena-3d'> = {
  broadcast: 'parlor-broadcast-studio-3d',
  tavern: 'parlor-fable-tavern-3d',
  atelier: 'parlor-atelier-3d',
  lounge: 'parlor-grand-lounge-3d',
  cyber: 'parlor-cyber-arena-3d',
};

function resolveVenue(venue?: ParlorVenueKind, kind?: ParlorStage3DProps['kind']): ParlorVenueKind {
  if (venue) return venue;
  if (kind === 'impostor') return 'tavern';
  if (kind === 'sketch') return 'atelier';
  if (kind === 'table') return 'lounge';
  if (kind === 'cyber') return 'cyber';
  return 'broadcast';
}

export function ParlorStage3D({ venue, kind, status, secondsLeft = 0, tension, className }: ParlorStage3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<PlaykitLiveStage | null>(null);
  const resolved = resolveVenue(venue, kind);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const el = hostRef.current;
    if (!el) return;

    let alive = true;
    const stage = new PlaykitLiveStage(el);
    stageRef.current = stage;
    void stage.init(PRESET_FOR[resolved]).then(() => {
      if (!alive) return;
      stage.loadParlorVenue(resolved, typeof tension === 'number' ? tension : 0.25);
    }).catch(() => {
      // Headless / no-WebGL environments cleanly keep the CSS backdrop.
    });

    return () => {
      alive = false;
      stage.dispose();
      stageRef.current = null;
    };
  }, [resolved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (typeof tension === 'number') {
      stage.setParlorTension(tension);
      return;
    }
    const computed =
      status === 'reveal' || status === 'done' ? 0.92 :
      status === 'vote' ? 0.78 :
      (status === 'answer' || status === 'drawing' || status === 'active') && secondsLeft > 0 && secondsLeft <= 5 ? 0.9 :
      status === 'answer' || status === 'drawing' || status === 'active' ? 0.5 : 0.22;
    stage.setParlorTension(computed);
  }, [status, secondsLeft, tension]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className ?? 'pointer-events-none absolute inset-0 z-0 opacity-65'}
    />
  );
}
