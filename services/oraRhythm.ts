import {
  auth, fetchCreatorEvents, fetchMyTickets, fetchUserClubs, fetchClubEvents, fetchUserAlbums,
} from './backendService';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Rhythm. Your week, already filled in.
//
// This is deliberately NOT a calendar replacement. Google owns that, and a
// worse copy would be a worse product. What Plajah can do instead is arrive
// with the week already populated from commitments it genuinely knows about:
// shows you are hosting, tickets you hold, club events you belong to, and
// releases you have scheduled.
//
// THE RULE, same as everywhere in Ora: nothing invented. Every entry has a real
// timestamp on a real record. Anything without a readable date is dropped rather
// than guessed at, and an unreadable source marks the week `partial` instead of
// quietly rendering as a free week — telling someone their Friday is clear when
// it is not is the one failure this surface must never have.
//
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §4b
// ─────────────────────────────────────────────────────────────────────────

export type RhythmKind = 'HOSTING' | 'TICKET' | 'CLUB' | 'RELEASE';

export interface RhythmEntry {
  id: string;
  kind: RhythmKind;
  label: string;
  title: string;
  subtitle?: string;
  /** Epoch ms. Entries without a usable one never reach this list. */
  at: number;
  ref?: string;
}

export interface RhythmResult {
  entries: RhythmEntry[];
  partial: boolean;
}

const KIND_LABEL: Record<RhythmKind, string> = {
  HOSTING: 'You are hosting',
  TICKET: 'You have a ticket',
  CLUB: 'Club',
  RELEASE: 'Release',
};

/** Epoch ms from the several shapes the platform stores dates in, or null. */
function when(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  // Firestore Timestamp, when a raw doc slips through untouched.
  if (v && typeof v === 'object') {
    const s = (v as { seconds?: number }).seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return null;
}

/** The next `days` of real commitments, soonest first. */
export async function assembleRhythm(days = 14): Promise<RhythmResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { entries: [], partial: true };

  const now = Date.now();
  const until = now + days * 24 * 60 * 60 * 1000;
  const entries: RhythmEntry[] = [];
  let partial = false;

  const push = (e: RhythmEntry | null) => {
    if (!e) return;
    if (e.at < now - 12 * 60 * 60 * 1000 || e.at > until) return; // outside the window
    entries.push(e);
  };

  // Shows you are hosting.
  try {
    const events = await fetchCreatorEvents(uid);
    for (const ev of events as any[]) {
      const at = when(ev?.startDate ?? ev?.doorsOpenDate);
      if (at === null) continue;
      push({
        id: `host_${ev.id}`, kind: 'HOSTING', label: KIND_LABEL.HOSTING,
        title: ev.title || 'Untitled event',
        subtitle: ev.venueName || ev.city || undefined,
        at, ref: '/?view=events',
      });
    }
  } catch { partial = true; }

  // Tickets you hold.
  try {
    const tickets = await fetchMyTickets();
    for (const t of tickets as any[]) {
      const at = when(t?.eventStartDate ?? t?.startDate ?? t?.event?.startDate);
      if (at === null) continue;
      push({
        id: `ticket_${t.id}`, kind: 'TICKET', label: KIND_LABEL.TICKET,
        title: t.eventTitle || t.event?.title || 'Event',
        subtitle: t.tierName || undefined,
        at, ref: '/?view=events',
      });
    }
  } catch { partial = true; }

  // Club events, for the clubs you are actually in.
  try {
    const clubs = await fetchUserClubs(uid);
    const perClub = await Promise.all(
      clubs.slice(0, 12).map(async (c) => {
        try { return { club: c, events: await fetchClubEvents(c.id) }; }
        catch { partial = true; return null; }
      }),
    );
    for (const entry of perClub) {
      if (!entry) continue;
      for (const ev of entry.events) {
        const at = when(ev?.scheduledAt);
        if (at === null || ev.isActive === false) continue;
        push({
          id: `club_${ev.id}`, kind: 'CLUB', label: entry.club.name || KIND_LABEL.CLUB,
          title: ev.title || 'Club event',
          subtitle: ev.linkedContentTitle || undefined,
          at, ref: '/?view=clubs',
        });
      }
    }
  } catch { partial = true; }

  // Releases you have scheduled — the deadline that is easiest to forget.
  try {
    const albums = await fetchUserAlbums(uid);
    for (const a of albums as any[]) {
      const at = when(a?.releaseDate);
      if (at === null) continue;
      push({
        id: `release_${a.id}`, kind: 'RELEASE', label: KIND_LABEL.RELEASE,
        title: a.title || 'Untitled release',
        subtitle: Array.isArray(a.tracks) ? `${a.tracks.length} tracks` : undefined,
        at, ref: '/?view=music',
      });
    }
  } catch { partial = true; }

  entries.sort((a, b) => a.at - b.at);
  return { entries, partial };
}

/** Group into day buckets for rendering. Keys are local YYYY-MM-DD. */
export function byDay(entries: RhythmEntry[]): Array<{ day: string; at: number; entries: RhythmEntry[] }> {
  const buckets = new Map<string, RhythmEntry[]>();
  for (const e of entries) {
    const d = new Date(e.at);
    const p = (n: number) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    buckets.set(key, [...(buckets.get(key) || []), e]);
  }
  return Array.from(buckets.entries())
    .map(([day, list]) => ({ day, at: list[0].at, entries: list }))
    .sort((a, b) => a.at - b.at);
}
