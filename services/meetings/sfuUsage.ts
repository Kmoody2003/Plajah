/**
 * Meeting usage ledger maths: participant-minutes → estimated SFU bandwidth → estimated bill, and
 * the self-host break-even. Numbers are estimates for planning (docs/MEETINGS_SFU.md); the LiveKit
 * Cloud invoice is the truth. Tunable through server env without a code change.
 */

export interface UsageRecord {
  room: string;
  roomSid: string;
  identity: string;
  ownerKind: 'org' | 'user';
  ownerId: string;
  kind: string;
  joinedAt: number;
  leftAt: number;
  seconds: number;
  minutes: number;
  month: string;
  ownerKey?: string;
}

export const SFU_COST_DEFAULTS = {
  /** Downstream bandwidth per participant-hour with the paged grid (speaker HD, others low layers). */
  gbPerParticipantHour: 0.85,
  /** LiveKit Cloud bandwidth price ($0.05–0.10/GB depending on plan and volume). */
  usdPerGb: 0.08,
  /** All-in monthly cost of running our own LiveKit cluster (VMs + egress + upkeep time). */
  selfHostMonthlyUsd: 900,
};

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export function costModel(env: Record<string, string | undefined> = {}) {
  return {
    gbPerParticipantHour: num(env.SFU_GB_PER_PARTICIPANT_HOUR, SFU_COST_DEFAULTS.gbPerParticipantHour),
    usdPerGb: num(env.SFU_USD_PER_GB, SFU_COST_DEFAULTS.usdPerGb),
    selfHostMonthlyUsd: num(env.SFU_SELFHOST_MONTHLY_USD, SFU_COST_DEFAULTS.selfHostMonthlyUsd),
  };
}

export function usageSummary(month: string, rows: UsageRecord[], env: Record<string, string | undefined> = {}) {
  const m = costModel(env);
  const byOwner = new Map<string, { ownerKind: string; ownerId: string; participantMinutes: number; sessions: number; rooms: Set<string> }>();
  let minutes = 0;
  for (const r of rows) {
    if (!r || r.month !== month) continue;
    const key = `${r.ownerKind}:${r.ownerId}`;
    const o = byOwner.get(key) || { ownerKind: r.ownerKind, ownerId: r.ownerId, participantMinutes: 0, sessions: 0, rooms: new Set<string>() };
    o.participantMinutes += Number(r.minutes) || 0;
    o.sessions += 1;
    o.rooms.add(r.room);
    byOwner.set(key, o);
    minutes += Number(r.minutes) || 0;
  }
  const hours = minutes / 60;
  const gb = hours * m.gbPerParticipantHour;
  const cloudUsd = gb * m.usdPerGb;
  const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
  return {
    month,
    participantMinutes: round(minutes),
    participantHours: round(hours),
    estimatedGb: round(gb),
    estimatedCloudUsd: round(cloudUsd),
    model: m,
    // Self-host once the cloud bill clearly beats running it ourselves (≥1.5× for headroom/ops risk).
    selfHostBreakEvenParticipantHours: round(m.selfHostMonthlyUsd / (m.gbPerParticipantHour * m.usdPerGb), 0),
    shouldConsiderSelfHost: cloudUsd >= 1.5 * m.selfHostMonthlyUsd,
    owners: [...byOwner.values()]
      .map(o => ({ ownerKind: o.ownerKind, ownerId: o.ownerId, participantMinutes: round(o.participantMinutes), sessions: o.sessions, rooms: o.rooms.size,
        estimatedCloudUsd: round((o.participantMinutes / 60) * m.gbPerParticipantHour * m.usdPerGb) }))
      .sort((a, b) => b.participantMinutes - a.participantMinutes),
  };
}
