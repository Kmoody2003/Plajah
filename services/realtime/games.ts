// Realtime game registry, shared by the API (routes/gamerRealtime.ts: queue, tickets, settle) and the
// realtime server (services/realtime/server.ts: tick rate, seats, referee). Turn-based games live in
// services/gamerNet/registry.ts; nothing here is refereed move by move.

import { OpenWorldReferee, RaceReferee, type Referee } from './referee';

export type RoomMeta = Record<string, string | number | boolean>;

/** Keep up to 8 short flat metadata keys (e.g. circuitId, region) so rooms and tickets stay tiny. */
export function cleanMeta(raw: unknown): RoomMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: RoomMeta = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= 8 || k.length === 0 || k.length > 24 || !/^[A-Za-z0-9_.-]+$/.test(k)) continue;
    if (typeof v === 'string') {
      const sv = v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 64);
      if (sv) { out[k] = sv; n++; }
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = Math.round(v * 1000) / 1000; n++;
    } else if (typeof v === 'boolean') {
      out[k] = v; n++;
    }
  }
  return n > 0 ? out : undefined;
}

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
  /** Drop-in/drop-out persistent shard: players may join after the room is running and seats free on leave. */
  dropIn?: boolean;
  /** Server-authoritative result hook for this game. */
  referee(meta?: RoomMeta): Referee;
}

export const APEX_RACE = 'apex-race';
export const APEX_WORLD = 'apex-world';

/** Per-circuit plausibility caps (laps/s) so longer Ironport tracks aren't checked against the 4.2 km street circuit. */
const APEX_CIRCUIT_PACE: Readonly<Record<string, { laps: number; maxProgressPerSec: number }>> = {
  ironport_grand_circuit: { laps: 3, maxProgressPerSec: 0.05 },
  ironworks_industrial_circuit: { laps: 3, maxProgressPerSec: 0.045 },
  harbor_district_circuit: { laps: 3, maxProgressPerSec: 0.045 },
  civic_riverfront_circuit: { laps: 3, maxProgressPerSec: 0.045 },
  great_lakes_cliff_raceway: { laps: 3, maxProgressPerSec: 0.03 },
  escarpment_circuit: { laps: 3, maxProgressPerSec: 0.03 },
  pinewood_rally_stage: { laps: 3, maxProgressPerSec: 0.03 },
  superior_range_circuit: { laps: 2, maxProgressPerSec: 0.02 },
};

const apexRace: RealtimeGameDef = {
  id: APEX_RACE,
  title: 'Plajah Motorsport Apex · Circuit Race',
  tickHz: 20,
  minPlayers: 2,
  maxPlayers: 12,
  countdownMs: 4000,
  reconnectGraceMs: 20_000,
  interestRadius: 0,
  maxStateBytes: 600,
  // Default Ironport Grand Circuit (~4.2 km, 3 laps). Longer circuits use tighter laps/s caps via room meta.
  referee: (meta) => {
    const cid = typeof meta?.circuitId === 'string' ? meta.circuitId : 'ironport_grand_circuit';
    const pace = APEX_CIRCUIT_PACE[cid] ?? APEX_CIRCUIT_PACE.ironport_grand_circuit;
    return new RaceReferee({ laps: pace.laps, maxProgressPerSec: pace.maxProgressPerSec, maxSpeedMps: 140, finishGraceMs: 45_000, maxRaceMs: 20 * 60_000 });
  },
};

// Forza Horizon-style persistent open-world shard: up to 32 simultaneous drivers on the 150 km² Ironport map,
// with 950 m spatial interest-radius filtering so bandwidth stays tiny regardless of total region population!
const apexWorld: RealtimeGameDef = {
  id: APEX_WORLD,
  title: 'Plajah Motorsport Apex · Ironport Open World',
  tickHz: 15,
  minPlayers: 1,
  maxPlayers: 32,
  countdownMs: 0,
  reconnectGraceMs: 30_000,
  interestRadius: 950,
  maxStateBytes: 512,
  dropIn: true,
  referee: () => new OpenWorldReferee(),
};

export const REALTIME_GAMES: Readonly<Record<string, RealtimeGameDef>> = {
  [apexRace.id]: apexRace,
  [apexWorld.id]: apexWorld,
};
// Backwards-compatible alias while production plajah-api (master) still issues pre-rename 'fh-race' tickets.
// Preserves id: 'fh-race' so posted RoomResult.game matches the stored match doc on older API revisions.
const LEGACY_ALIASES: Readonly<Record<string, RealtimeGameDef>> = {
  'fh-race': { ...apexRace, id: 'fh-race' },
};
export const realtimeGame = (id: unknown): RealtimeGameDef | null => {
  if (typeof id !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(REALTIME_GAMES, id)) return REALTIME_GAMES[id];
  if (Object.prototype.hasOwnProperty.call(LEGACY_ALIASES, id)) return LEGACY_ALIASES[id];
  return null;
};
