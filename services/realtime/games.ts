// Realtime game registry, shared by the API (routes/gamerRealtime.ts: queue, tickets, settle) and the
// realtime server (services/realtime/server.ts: tick rate, seats, referee). Turn-based games live in
// services/gamerNet/registry.ts; nothing here is refereed move by move.

import { RaceReferee, type Referee } from './referee';

export interface RealtimeGameDef {
  id: string;
  title: string;
  /** Server tick (state broadcast) rate, clamped 5–60 Hz. */
  tickHz: number;
  minPlayers: number;
  maxPlayers: number;
  /** Lobby → GO countdown once everyone is ready. */
  countdownMs: number;
  /** A dropped player may reconnect within this window before they forfeit (DNF). */
  reconnectGraceMs: number;
  /** Optional interest radius (metres): only states within it are sent to a player. 0 = everyone sees everyone. */
  interestRadius: number;
  /** Largest JSON state a client may send per update. */
  maxStateBytes: number;
  /** Server-authoritative result hook for this game. */
  referee(): Referee;
}

export const APEX_RACE = 'apex-race';

const apexRace: RealtimeGameDef = {
  id: APEX_RACE,
  title: 'Plajah Motorsport Apex · Ironport Grand Circuit',
  tickHz: 20,
  minPlayers: 2,
  maxPlayers: 8,
  countdownMs: 4000,
  reconnectGraceMs: 20_000,
  interestRadius: 0,
  maxStateBytes: 600,
  // Ironport Grand Circuit is ~3 km; 3 laps. No lap faster than 20 s (0.05 laps/s), no car faster than 140 m/s.
  referee: () => new RaceReferee({ laps: 3, maxProgressPerSec: 0.05, maxSpeedMps: 140, finishGraceMs: 45_000, maxRaceMs: 20 * 60_000 }),
};

export const REALTIME_GAMES: Readonly<Record<string, RealtimeGameDef>> = { [apexRace.id]: apexRace };
export const realtimeGame = (id: unknown): RealtimeGameDef | null =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(REALTIME_GAMES, id) ? REALTIME_GAMES[id] : null;
