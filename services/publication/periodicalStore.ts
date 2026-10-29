// periodicalStore — Firestore persistence and distribution for periodicals and their issues.
//
//   publications/{id}             the periodical (journalist Publication + masthead fields)
//   periodicalIssues/{id}         issues; the published digital edition's Tela bundle rides on the doc
//   publicationFollows/{uid_pub}  readers following a periodical (Lorea's Periodicals shelf)
// Queries are single-field and provable by the rules (staffUids array-contains, adviserUid ==,
// status == 'published'); results are filtered and sorted client-side ([[plajah-firestore-gotchas]]).
// Rules: only the adviser's account writes adviserApproval, and a student issue cannot be marked
// published without it.

import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, opsDb, auth } from '../firebase';
import { listOwned, saveItem } from '../journalist/newsroomStore';
import type { TelaDoc } from '../../types';
import type { IssueStory, Periodical, PeriodicalIssue } from './types';

const ISSUES = 'periodicalIssues';
/** Firestore documents cap at 1 MiB; leave room for the issue's own fields. */
export const MAX_ISSUE_BUNDLE_BYTES = 850_000;

const me = () => auth.currentUser?.uid || '';
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export async function listMyPeriodicals(): Promise<Periodical[]> {
  const uid = me(); if (!uid) return [];
  const [owned, advised] = await Promise.all([
    listOwned<Periodical>('publications', uid).catch(() => []),
    getDocs(query(collection(db, 'publications'), where('adviserUid', '==', uid))).then(s => s.docs.map(d => ({ ...(d.data() as Periodical), id: d.id }))).catch(() => []),
  ]);
  const all = new Map([...owned, ...advised].map(p => [p.id, p]));
  return [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const savePeriodical = (p: Periodical) => saveItem('publications', clean({ ...p, updatedAt: Date.now() }));

export async function getPeriodical(id: string): Promise<Periodical | null> {
  const s = await getDoc(doc(db, 'publications', id)).catch(() => null);
  return s?.exists() ? ({ ...(s.data() as Periodical), id: s.id }) : null;
}

export async function listIssuesForStaff(): Promise<PeriodicalIssue[]> {
  const uid = me(); if (!uid) return [];
  const [staff, advised] = await Promise.all([
    getDocs(query(collection(opsDb, ISSUES), where('staffUids', 'array-contains', uid), limit(200))).catch(() => null),
    getDocs(query(collection(opsDb, ISSUES), where('adviserUid', '==', uid), limit(200))).catch(() => null),
  ]);
  const all = new Map<string, PeriodicalIssue>();
  for (const snap of [staff, advised]) snap?.docs.forEach(d => all.set(d.id, { ...(d.data() as PeriodicalIssue), id: d.id }));
  return [...all.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveIssue(issue: PeriodicalIssue): Promise<void> {
  const { ...data } = issue as PeriodicalIssue & { bundleJson?: string };
  delete (data as any).bundleJson;
  await setDoc(doc(opsDb, ISSUES, issue.id), clean({ ...data, updatedAt: Date.now() }), { merge: true });
}

export const deleteIssue = (id: string) => deleteDoc(doc(opsDb, ISSUES, id));

/** A reporter files an approved story into an issue (staff may update the issue). */
export async function fileStoryToIssue(issue: PeriodicalIssue, story: IssueStory): Promise<void> {
  const stories = [...issue.stories.filter(s => s.id !== story.id), story];
  await updateDoc(doc(opsDb, ISSUES, issue.id), clean({ stories, updatedAt: Date.now() }));
}

/** The adviser's own account approves (or withdraws approval of) a student issue. */
export async function setAdviserApproval(issueId: string, approve: boolean, note?: string): Promise<boolean> {
  const u = auth.currentUser; if (!u) return false;
  try {
    await updateDoc(doc(opsDb, ISSUES, issueId), { adviserApproval: approve ? clean({ uid: u.uid, name: u.displayName || 'Adviser', at: Date.now(), ...(note ? { note } : {}) }) : null, updatedAt: Date.now() });
    return true;
  } catch { return false; }
}

/**
 * Publish the digital edition: freeze the Tela doc as a version and store its bundle on the issue.
 * Lorea's Periodicals shelf and the issue reader read published issues directly.
 */
export async function publishIssueEdition(issue: PeriodicalIssue, telaDoc: TelaDoc, flatPdfUrl?: string): Promise<{ ok: boolean; error?: string }> {
  const { publishTelaVersion } = await import('../telaStore');
  const { ok, version } = await publishTelaVersion({ ...telaDoc, updatedAt: Date.now() }, `Vol. ${issue.volume} No. ${issue.number}`);
  if (!ok) return { ok: false, error: 'Could not freeze the issue on this device.' };
  const bundleJson = JSON.stringify(version.bundle);
  if (bundleJson.length > MAX_ISSUE_BUNDLE_BYTES) return { ok: false, error: 'This issue is too large to publish in one piece (pasted images?). Use uploaded image links, or split the issue.' };
  try {
    await updateDoc(doc(opsDb, ISSUES, issue.id), clean({
      status: 'published', bundleJson, updatedAt: Date.now(),
      published: { versionId: version.versionId, at: Date.now(), pageCount: telaDoc.frames.length, ...(flatPdfUrl ? { flatPdfUrl } : {}) },
    }));
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || '';
    return { ok: false, error: /permission/i.test(msg) && issue.tier === 'student' ? 'The adviser has to approve this issue from their account first.' : `Publishing failed: ${msg}` };
  }
}

export async function loadPublishedIssue(id: string): Promise<{ issue: PeriodicalIssue; doc: TelaDoc | null } | null> {
  const s = await getDoc(doc(opsDb, ISSUES, id)).catch(() => null);
  if (!s?.exists()) return null;
  const data = s.data() as PeriodicalIssue & { bundleJson?: string };
  let telaDoc: TelaDoc | null = null;
  try { telaDoc = data.bundleJson ? JSON.parse(data.bundleJson) : null; } catch { telaDoc = null; }
  delete data.bundleJson;
  return { issue: { ...data, id: s.id }, doc: telaDoc };
}

/** Newest published issues for the shelf (single-field query; sorted here). */
export async function listPublishedIssues(max = 40): Promise<PeriodicalIssue[]> {
  const snap = await getDocs(query(collection(opsDb, ISSUES), where('status', '==', 'published'), limit(200))).catch(() => null);
  return (snap?.docs || [])
    .map(d => { const v = d.data() as PeriodicalIssue & { bundleJson?: string }; delete v.bundleJson; return { ...v, id: d.id }; })
    .filter(i => i.isPublic)
    .sort((a, b) => (b.published?.at || 0) - (a.published?.at || 0))
    .slice(0, max);
}

// ── Follows ──────────────────────────────────────────────────────────────────
const followId = (uid: string, pubId: string) => `${uid}_${pubId}`;
export async function isFollowing(pubId: string): Promise<boolean> {
  const uid = me(); if (!uid) return false;
  const s = await getDoc(doc(db, 'publicationFollows', followId(uid, pubId))).catch(() => null);
  return !!s?.exists();
}
export async function setFollowing(pubId: string, on: boolean): Promise<boolean> {
  const uid = me(); if (!uid) return false;
  const ref = doc(db, 'publicationFollows', followId(uid, pubId));
  try { if (on) await setDoc(ref, { uid, publicationId: pubId, at: Date.now() }); else await deleteDoc(ref); return true; } catch { return false; }
}
export async function followedPublicationIds(): Promise<string[]> {
  const uid = me(); if (!uid) return [];
  const snap = await getDocs(query(collection(db, 'publicationFollows'), where('uid', '==', uid))).catch(() => null);
  return (snap?.docs || []).map(d => (d.data() as { publicationId: string }).publicationId);
}
