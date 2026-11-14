// announcementService — newsletters, flyers, posts, polls and surveys from teachers and admins.
//
// One record shape for every org (church, school, nonprofit, business) and every audience:
//   orgAnnouncements/{id}                  ops DB. audience 'class' (one programId), 'members'
//                                          (audienceUids denormalised at post time) or 'public'.
//   announcementResponses/{annId}__{uid}   one response per person: poll choices and/or survey answers.
// A flyer carries its Tela document inline (the same snapshot pattern chat uses) so every reader
// gets the living, interactive page without a copy landing in their own Tela library.
// Signed-out and offline use (the labs) falls back to this device's storage.
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { opsDb, auth } from '../firebase';
import type { TelaDoc } from '../../types';

export type AnnouncementAudience = 'class' | 'members' | 'public';

export interface AnnouncementPoll {
  question: string;
  options: string[];
  multi?: boolean;
  /** Show the tally to everyone once they've voted (otherwise only the author sees it). */
  showResults?: boolean;
  closesAt?: number;
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  type: 'short' | 'long' | 'choice' | 'scale';
  options?: string[];
  required?: boolean;
}

export interface Announcement {
  id: string;
  orgId: string;
  orgName?: string;
  programId?: string;
  programName?: string;
  audience: AnnouncementAudience;
  audienceUids?: string[];
  authorUid: string;
  authorName: string;
  authorRole?: string;
  kind: 'POST' | 'FLYER';
  title?: string;
  text: string;
  /** FLYER: the preset it started from and the full Tela page (JSON). */
  presetId?: string;
  flyerJson?: string;
  ctaUrl?: string;
  poll?: AnnouncementPoll;
  survey?: { title?: string; questions: SurveyQuestion[]; anonymous?: boolean };
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AnnouncementResponse {
  id: string;
  annId: string;
  orgId: string;
  uid: string;
  name?: string;
  choices?: number[];
  answers?: Record<string, string | number>;
  at: number;
}

const COL = 'orgAnnouncements';
const RESP = 'announcementResponses';
const LOCAL = 'plajah:announcements:v1';
const LOCAL_RESP = 'plajah:announcementResponses:v1';
export const ANNOUNCEMENTS_CHANGED = 'plajah:announcementsChanged';
/** Inline flyer pages must stay well under Firestore's 1 MB document limit. */
export const FLYER_MAX_BYTES = 600_000;

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const readLocal = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const writeLocal = (k: string, v: unknown[]) => { try { localStorage.setItem(k, JSON.stringify(v.slice(-300))); } catch { /* quota */ } };
const changed = () => { try { window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED)); } catch { /* ssr */ } };
const cloud = () => !!auth.currentUser;

export const newAnnouncementId = () => `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function flyerFromAnnouncement(a: Pick<Announcement, 'flyerJson'>): TelaDoc | null {
  if (!a.flyerJson) return null;
  try { const d = JSON.parse(a.flyerJson) as TelaDoc; return d?.frames?.length && d.devices ? d : null; } catch { return null; }
}

export function encodeFlyer(doc: TelaDoc): string {
  const json = JSON.stringify(doc);
  if (new TextEncoder().encode(json).length > FLYER_MAX_BYTES) throw new Error('This flyer is too large to post. Use linked photos instead of embedded ones.');
  return json;
}

export async function postAnnouncement(a: Announcement): Promise<{ synced: boolean }> {
  const rec = strip(a);
  const local = readLocal<Announcement>(LOCAL).filter(x => x.id !== a.id);
  writeLocal(LOCAL, [...local, rec]);
  let synced = false;
  if (cloud()) { try { await setDoc(doc(opsDb, COL, a.id), rec); synced = true; } catch { /* rules (not a teacher here) or offline */ } }
  changed();
  return { synced };
}

export async function deleteAnnouncement(id: string): Promise<void> {
  writeLocal(LOCAL, readLocal<Announcement>(LOCAL).filter(x => x.id !== id));
  if (cloud()) { try { await deleteDoc(doc(opsDb, COL, id)); } catch { /* */ } }
  changed();
}

export async function setAnnouncementPinned(a: Announcement, pinned: boolean): Promise<void> {
  writeLocal(LOCAL, readLocal<Announcement>(LOCAL).map(x => (x.id === a.id ? { ...x, pinned } : x)));
  if (cloud()) { try { await updateDoc(doc(opsDb, COL, a.id), { pinned, updatedAt: Date.now() }); } catch { /* */ } }
  changed();
}

/** Announcements for a class, newest first (pinned on top). */
export async function listClassAnnouncements(orgId: string, programId: string): Promise<Announcement[]> {
  const local = readLocal<Announcement>(LOCAL).filter(a => a.orgId === orgId && a.programId === programId);
  let remote: Announcement[] = [];
  if (cloud()) { try { remote = (await getDocs(query(collection(opsDb, COL), where('programId', '==', programId), where('audience', '==', 'class')))).docs.map(d => d.data() as Announcement); } catch { /* */ } }
  return order(merge(local, remote));
}

/**
 * Org-wide announcements this viewer can see: public ones, plus member ones addressed to them.
 * Staff pass `asStaff` to see every member announcement in the org.
 */
export async function listOrgAnnouncements(orgId: string, opts: { uid?: string; asStaff?: boolean } = {}): Promise<Announcement[]> {
  const local = readLocal<Announcement>(LOCAL).filter(a => a.orgId === orgId && !a.programId
    && (a.audience === 'public' || opts.asStaff || a.authorUid === opts.uid || (!!opts.uid && !!a.audienceUids?.includes(opts.uid))));
  let remote: Announcement[] = [];
  if (cloud()) {
    const base = collection(opsDb, COL);
    const qs = [query(base, where('orgId', '==', orgId), where('audience', '==', 'public'))];
    if (opts.asStaff) qs.push(query(base, where('orgId', '==', orgId), where('audience', '==', 'members')));
    else if (opts.uid) qs.push(query(base, where('orgId', '==', orgId), where('audience', '==', 'members'), where('audienceUids', 'array-contains', opts.uid)));
    for (const q of qs) { try { remote.push(...(await getDocs(q)).docs.map(d => d.data() as Announcement)); } catch { /* */ } }
    remote = remote.filter(a => !a.programId);
  }
  return order(merge(local, remote));
}

function merge(local: Announcement[], remote: Announcement[]): Announcement[] {
  const m = new Map<string, Announcement>();
  for (const a of local) m.set(a.id, a);
  for (const a of remote) m.set(a.id, a);
  return [...m.values()];
}
const order = (xs: Announcement[]) => xs.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt);

// ── responses ─────────────────────────────────────────────────────────────────
export const responseId = (annId: string, uid: string) => `${annId}__${uid}`;

export async function respond(a: Announcement, r: { uid: string; name?: string; choices?: number[]; answers?: Record<string, string | number> }): Promise<void> {
  const rec: AnnouncementResponse = strip({ id: responseId(a.id, r.uid), annId: a.id, orgId: a.orgId, uid: r.uid, name: a.survey?.anonymous ? undefined : r.name, choices: r.choices, answers: r.answers, at: Date.now() });
  writeLocal(LOCAL_RESP, [...readLocal<AnnouncementResponse>(LOCAL_RESP).filter(x => x.id !== rec.id), rec]);
  if (cloud()) { try { await setDoc(doc(opsDb, RESP, rec.id), rec); } catch { /* */ } }
  changed();
}

/** All responses (the author / staff view, or a poll whose results are public). */
export async function listResponses(annId: string): Promise<AnnouncementResponse[]> {
  const local = readLocal<AnnouncementResponse>(LOCAL_RESP).filter(r => r.annId === annId);
  if (!cloud()) return local;
  const m = new Map(local.map(r => [r.id, r]));
  try {
    for (const d of (await getDocs(query(collection(opsDb, RESP), where('annId', '==', annId)))).docs) m.set(d.id, d.data() as AnnouncementResponse);
  } catch {
    // Not allowed to see everyone's answers (a survey, or hidden poll results): still fetch this person's own.
    try { const s = await getDoc(doc(opsDb, RESP, responseId(annId, auth.currentUser!.uid))); if (s.exists()) m.set(s.id, s.data() as AnnouncementResponse); } catch { /* */ }
  }
  return [...m.values()];
}

export function myResponse(annId: string, uid: string, all: AnnouncementResponse[]): AnnouncementResponse | undefined {
  return all.find(r => r.id === responseId(annId, uid));
}

export function tally(poll: AnnouncementPoll, rs: AnnouncementResponse[]): { counts: number[]; voters: number } {
  const counts = poll.options.map(() => 0); let voters = 0;
  for (const r of rs) if (r.choices?.length) { voters++; for (const c of r.choices) if (c >= 0 && c < counts.length) counts[c]++; }
  return { counts, voters };
}

/** Survey answers as CSV rows for the author (question prompts as headers). */
export function surveyCsv(a: Announcement, rs: AnnouncementResponse[]): string {
  const qs = a.survey?.questions || [];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = [...(a.survey?.anonymous ? [] : ['Name']), 'Answered', ...qs.map(q => q.prompt)].map(esc).join(',');
  const rows = rs.filter(r => r.answers).map(r => [...(a.survey?.anonymous ? [] : [r.name || '']), new Date(r.at).toLocaleString(), ...qs.map(q => r.answers?.[q.id] ?? '')].map(esc).join(','));
  return [head, ...rows].join('\n');
}
