// vespersService — the service files itself.
//
// When the stream stops, Kairos has already produced a structured, timecoded
// document: every passage taught, in order, with the moment it was taught. That
// is the recap. Transcription and ARIA prose are ENHANCEMENTS layered on top —
// if the AI is unavailable, or nobody recorded audio, a member still gets a real
// briefing. Building it the other way round would mean no recap on the Sunday
// the transcription service is down.
//
// PRIVACY. The shared recap holds only what happened in public: passages,
// timecodes, the summary. What a person highlighted or wrote is theirs — it is
// intersected in on their own device by personalize(), never written to the
// shared doc and never visible to the org. See the gap list: "who highlighted
// what" is a sensitive fact about someone's spiritual life.

import { db, auth } from './backendService';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { formatRef, parseRefId, refId, type ScriptureRef } from './scriptureRef';
import { markersFor, type ScriptureSession } from './kairosService';
import { generateArticleDraft, transcribeAudioUrl } from './ministryRepurpose';
import {
  migrateLegacyReceipts, serviceNotesForSession, verseKeyOf, type ServiceNote,
} from './serviceNotes';
import type { RepurposeOutput } from '../types';

export const VESPERS_COL = 'serviceRecaps';

export interface RecapPassage {
  refId: string;
  label: string;
  /** Seconds into the service — deep-links the replay. */
  programTC: number;
  /** How long it stayed on screen, when a following cue tells us. */
  dwellSec?: number;
}

export interface ServiceRecap {
  id: string;
  sessionId: string;
  orgId: string;
  title: string;
  /** Epoch ms of the service start. */
  startedAt: number;
  durationSec: number;
  passages: RecapPassage[];
  /** ARIA's short summary. Absent until (and unless) prose generation runs. */
  summary?: string;
  /** Full article draft, for the church's archive and socials. */
  article?: RepurposeOutput | null;
  /** Video the timecodes refer to. */
  replayUrl?: string;
  /** DRAFT until a human has looked at the AI prose. */
  status: 'READY' | 'DRAFT' | 'PUBLISHED';
  createdAt: number;
}

export const recapIdFor = (sessionId: string) => `recap_${sessionId}`;

const stripUndefined = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ── The part that never needs AI ─────────────────────────────────────────────

/**
 * Turn a finished session into a recap. Pure — no network, no model. This is
 * what guarantees every service produces something a member can use.
 */
export function buildRecap(
  session: ScriptureSession,
  opts: { replayUrl?: string; endedAt?: number } = {},
): ServiceRecap {
  const markers = markersFor(session);
  const endedAt = opts.endedAt ?? session.endedAt ?? Date.now();

  const passages: RecapPassage[] = markers.map((m, i) => {
    const next = markers[i + 1];
    return stripUndefined({
      refId: m.refId,
      label: m.label,
      programTC: m.programTC,
      dwellSec: next ? Math.max(0, Math.round(next.programTC - m.programTC)) : undefined,
    }) as RecapPassage;
  });

  const lastTC = markers.length ? markers[markers.length - 1].programTC : 0;
  const wallDuration = Math.max(0, Math.round((endedAt - session.startedAt) / 1000));

  return stripUndefined({
    id: recapIdFor(session.id),
    sessionId: session.id,
    orgId: session.orgId,
    title: session.title || 'Service',
    startedAt: session.startedAt,
    // Wall-clock duration is authoritative when sane; otherwise fall back to the
    // last cue so a recap built from an imported session still has a timeline.
    durationSec: wallDuration > lastTC ? wallDuration : lastTC,
    passages,
    replayUrl: opts.replayUrl,
    status: 'READY',
    createdAt: Date.now(),
  }) as ServiceRecap;
}

/** Passages as parsed refs, for rendering chips and opening Lectio. */
export function recapRefs(recap: ServiceRecap | null): ScriptureRef[] {
  if (!recap) return [];
  return recap.passages.map(p => parseRefId(p.refId)).filter((r): r is ScriptureRef => !!r);
}

// ── Personalisation, on the member's own device ──────────────────────────────

export interface PersonalPassage extends RecapPassage {
  highlighted: boolean;
  /** Something the member actually typed. */
  note?: string;
}

export interface PersonalRecap {
  recap: ServiceRecap;
  passages: PersonalPassage[];
  highlightCount: number;
  noteCount: number;
  /**
   * What the platform recorded for this service — every passage that was put in
   * front of the member, with its moment. Kept in its own list so the UI can
   * render it as a distinct section: notes generated for that day, next to but
   * never mixed with the notes the member wrote.
   */
  serviceNotes: ServiceNote[];
}

const HL_KEY = 'plajah_lectio_highlights_v1';
const NOTES_KEY = 'plajah_bible_notes_v1';

const readMap = (k: string): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
};

/**
 * Fold the member's own highlights and notes into the shared recap, and gather
 * the service's generated notes alongside them. Runs locally: nothing about
 * what a person marked or wrote leaves their device here.
 */
export function personalize(recap: ServiceRecap): PersonalRecap {
  migrateLegacyReceipts();

  const notes = readMap(NOTES_KEY);
  const highlights = readMap(HL_KEY);

  const passages: PersonalPassage[] = recap.passages.map(p => {
    const ref = parseRefId(p.refId);
    const key = ref ? verseKeyOf(ref) : '';
    return {
      ...p,
      highlighted: !!(key && highlights[key]),
      note: key ? notes[key] || undefined : undefined,
    };
  });

  const serviceNotes = serviceNotesForSession(recap.sessionId);

  return {
    recap,
    passages,
    highlightCount: passages.filter(p => p.highlighted).length,
    noteCount: passages.filter(p => p.note).length,
    serviceNotes,
  };
}

// ── Prose, when it's available ───────────────────────────────────────────────

/**
 * Layer ARIA's summary and article onto an existing recap. Safe to call late,
 * or never. Returns the recap unchanged when transcription or the model fails,
 * so a partial result is still a usable briefing.
 */
export async function enrichRecap(
  recap: ServiceRecap,
  input: { orgName: string; audioUrl?: string; transcript?: string },
): Promise<ServiceRecap> {
  let transcript = input.transcript ?? '';
  if (!transcript && input.audioUrl) {
    transcript = (await transcribeAudioUrl(input.audioUrl, recap.title, input.orgName)).text;
  }
  if (!transcript || transcript.length < 40) return recap;

  const article = await generateArticleDraft({
    orgName: input.orgName,
    transcript,
    sourceTitle: recap.title,
    faithContext: true,
  });
  if (!article) return recap;

  return {
    ...recap,
    article,
    summary: article.dek || article.sections?.[0]?.body?.slice(0, 320),
    // AI prose has not been read by a human yet — say so rather than publishing.
    status: 'DRAFT',
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function saveRecap(recap: ServiceRecap): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to save a recap');
  await setDoc(doc(db, VESPERS_COL, recap.id), stripUndefined({
    ...recap,
    hostId: user.uid,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

export async function publishRecap(recapId: string): Promise<void> {
  try {
    await updateDoc(doc(db, VESPERS_COL, recapId), { status: 'PUBLISHED', updatedAt: serverTimestamp() });
  } catch { /* */ }
}

export async function fetchRecap(recapId: string): Promise<ServiceRecap | null> {
  try {
    const snap = await getDoc(doc(db, VESPERS_COL, recapId));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as ServiceRecap : null;
  } catch { return null; }
}

export function listenToRecap(recapId: string, cb: (r: ServiceRecap | null) => void): () => void {
  return onSnapshot(
    doc(db, VESPERS_COL, recapId),
    snap => cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as ServiceRecap : null),
    () => cb(null),
  );
}

/**
 * End-to-end, called when the operator ends a service: build from the cue log,
 * save immediately so the recap exists, then enrich in the background. The two
 * writes are deliberate — a member who opens the app in the next thirty seconds
 * should already find their passages.
 */
export async function closeOutService(
  session: ScriptureSession,
  opts: { orgName: string; replayUrl?: string; audioUrl?: string },
): Promise<ServiceRecap> {
  const base = buildRecap(session, { replayUrl: opts.replayUrl });
  try { await saveRecap(base); } catch { /* offline — the local object still works */ }

  const enriched = await enrichRecap(base, { orgName: opts.orgName, audioUrl: opts.audioUrl });
  if (enriched !== base) { try { await saveRecap(enriched); } catch { /* */ } }
  return enriched;
}

export const formatTC = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Deep link back to the exact moment a passage was taught. */
export function replayUrlAt(recap: ServiceRecap, programTC: number): string | null {
  if (!recap.replayUrl) return null;
  const sep = recap.replayUrl.includes('?') ? '&' : '?';
  return `${recap.replayUrl}${sep}t=${Math.floor(programTC)}`;
}

export { refId, formatRef };
