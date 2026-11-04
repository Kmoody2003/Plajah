// Per-track rights clearance: three questions the uploader answers, and what those answers allow.
// Pure, so the Creator, the Mastering Desk and every radio path read the same rules.
//
// A status here is the uploader's own statement. `proof` is what they typed, not something Plajah
// has checked, and one person's answer cannot license a co-writer's or publisher's share.

export interface TrackRights {
  writing?: 'sole' | 'cowriters';
  source?: 'original' | 'cover' | 'sample';
  deal?: 'none' | 'publisher';
  /** Who signed or licensed it, and when. Typed by the uploader; unverified. */
  proof?: string;
}

export type ClearanceStatus =
  | 'unanswered'     // uploaded before these questions existed, or not filled in yet
  | 'cleared'        // sole writer, original, no exclusive deal
  | 'declared'       // needed someone else's sign-off or a licence, and the uploader recorded it
  | 'needs_signoff'  // co-writers or a publisher: can sell, held from radio, FAST and ads
  | 'needs_license'; // cover or sample: cannot publish, held from radio, FAST and ads

export const hasProof = (r?: TrackRights) => (r?.proof?.trim().length ?? 0) >= 3;

export function clearanceOf(rights?: TrackRights): ClearanceStatus {
  if (!rights?.writing || !rights.source || !rights.deal) return 'unanswered';
  const needsLicense = rights.source !== 'original';
  const needsSignoff = rights.writing === 'cowriters' || rights.deal === 'publisher';
  if (!needsLicense && !needsSignoff) return 'cleared';
  if (hasProof(rights)) return 'declared';
  return needsLicense ? 'needs_license' : 'needs_signoff';
}

type TrackLike = { trackMeta?: { rights?: TrackRights }; kind?: string; mediaKind?: string };

export const trackClearance = (t: TrackLike) => clearanceOf(t.trackMeta?.rights);

/** Songs get the questions. Podcasts, speech, field recordings and video tracks do not. */
export const isSongTrack = (t: TrackLike) => (!t.kind || t.kind === 'MUSIC') && t.mediaKind !== 'VIDEO';

/** Radio, FAST and the ad rotation. Unanswered stays on air so older catalog doesn't vanish overnight;
 *  new songs can't reach this state because publishing requires answers. */
export function canAirTrack(t: TrackLike): boolean {
  const s = trackClearance(t);
  return s === 'unanswered' || s === 'cleared' || s === 'declared';
}

/** The songs stopping a publish. Pass only the tracks this publish is responsible for. */
export function publishBlockers<T extends TrackLike>(tracks: T[]): T[] {
  return tracks.filter((t) => {
    if (!isSongTrack(t)) return false;
    const s = trackClearance(t);
    return s === 'unanswered' || s === 'needs_license';
  });
}

export const CLEARANCE_COPY: Record<ClearanceStatus, { label: string; detail: string; tone: 'ok' | 'warn' | 'stop' | 'idle' }> = {
  unanswered: { label: 'Not answered', detail: 'Answer all three to publish this song.', tone: 'idle' },
  cleared: { label: 'Cleared', detail: 'Can be sold and played on radio, FAST channels and with ads.', tone: 'ok' },
  declared: { label: 'Recorded by you', detail: 'Can be sold and played on radio, FAST channels and with ads. You are confirming the sign-off or licence below; Plajah has not checked it.', tone: 'ok' },
  needs_signoff: { label: 'Waiting on sign-off', detail: 'You can publish and sell it. It stays off radio, FAST channels and ads until you record who signed.', tone: 'warn' },
  needs_license: { label: 'Needs a licence', detail: 'A cover or sample can’t be published until you record the licence. You can still save a draft.', tone: 'stop' },
};
