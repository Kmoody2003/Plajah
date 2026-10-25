// sermonPrep — a pastor's working sermon, kept on the phone and mirrored to the
// creative cloud so the same draft opens on the laptop at the office.
//
// Local first (works in a parking lot with no signal), cloud second. Every save
// is mirrored with version history, like every other Plajah creative tool.

import { useCallback, useEffect, useState } from 'react';

export interface PinnedVerse { refId: string; label: string; text: string; note: string }
export interface OutlineSection { id: string; heading: string; body: string }
export interface StudyCard { id: string; kind: string; text: string; at: number }

export interface SermonPrepDoc {
  id: string;
  title: string;
  series: string;
  /** ISO date the sermon is preached. */
  date: string;
  /** Free text passage, e.g. "Romans 8:18-30". Parsed for the reader link. */
  passage: string;
  bigIdea: string;
  pinned: PinnedVerse[];
  study: StudyCard[];
  outline: OutlineSection[];
  illustrations: { id: string; text: string }[];
  applications: { id: string; text: string }[];
  manuscript: string;
  targetMinutes: number;
  createdAt: number;
  updatedAt: number;
}

export const SERMON_PREP_CLOUD_KIND = 'sermon-prep';
export const SERMON_PREP_EVENT = 'plajah:sermonprep:changed';
const key = (uid: string) => `plajah_sermonprep_${uid || 'guest'}_v1`;

export const uid8 = () => Math.random().toString(36).slice(2, 10);

export function newSermon(): SermonPrepDoc {
  const next = new Date(); next.setDate(next.getDate() + ((7 - next.getDay()) % 7 || 7));
  const now = Date.now();
  return {
    id: `sp_${now}_${uid8()}`, title: '', series: '', date: next.toISOString().slice(0, 10), passage: '', bigIdea: '',
    pinned: [], study: [],
    outline: [{ id: uid8(), heading: 'Opening', body: '' }, { id: uid8(), heading: '', body: '' }, { id: uid8(), heading: 'Closing', body: '' }],
    illustrations: [], applications: [], manuscript: '', targetMinutes: 30, createdAt: now, updatedAt: now,
  };
}

export function loadSermons(uid: string): SermonPrepDoc[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) || '[]'); } catch { return []; }
}

function writeAll(uid: string, all: SermonPrepDoc[]) {
  try { localStorage.setItem(key(uid), JSON.stringify(all)); } catch { /* quota: stays in memory */ }
  window.dispatchEvent(new CustomEvent(SERMON_PREP_EVENT, { detail: { uid } }));
}

export function saveSermon(uid: string, doc: SermonPrepDoc) {
  const next = { ...doc, updatedAt: Date.now() };
  const all = loadSermons(uid);
  const i = all.findIndex(s => s.id === next.id);
  if (i >= 0) all[i] = next; else all.unshift(next);
  writeAll(uid, all);
  if (uid && uid !== 'guest') {
    import('./creativeCloud/cloudStore')
      .then(m => m.scheduleCreativeSync({ kind: SERMON_PREP_CLOUD_KIND, localId: next.id, title: next.title || 'Untitled sermon', json: JSON.stringify(next) }))
      .catch(() => { /* offline or no Firebase: the local save stands */ });
  }
}

export function deleteSermon(uid: string, id: string) {
  writeAll(uid, loadSermons(uid).filter(s => s.id !== id));
}

/** Pull this pastor's cloud drafts that are newer than (or missing from) this device. */
export async function pullCloudSermons(uid: string): Promise<number> {
  if (!uid || uid === 'guest') return 0;
  try {
    const cs = await import('./creativeCloud/cloudStore');
    const heads = await cs.listCloudProjects(SERMON_PREP_CLOUD_KIND);
    const local = loadSermons(uid);
    let pulled = 0;
    for (const h of heads) {
      const mine = local.find(s => s.id === h.localId);
      if (mine && !cs.isCloudNewer(h, mine.updatedAt)) continue;
      const got = await cs.loadCloudProject(SERMON_PREP_CLOUD_KIND, h.localId);
      if (!got) continue;
      const doc = JSON.parse(got.json) as SermonPrepDoc;
      const i = local.findIndex(s => s.id === doc.id);
      if (i >= 0) local[i] = doc; else local.unshift(doc);
      pulled++;
    }
    if (pulled) writeAll(uid, local);
    return pulled;
  } catch { return 0; }
}

export function useSermons(uid: string) {
  const [sermons, setSermons] = useState<SermonPrepDoc[]>(() => loadSermons(uid));
  useEffect(() => {
    setSermons(loadSermons(uid));
    const on = () => setSermons(loadSermons(uid));
    window.addEventListener(SERMON_PREP_EVENT, on);
    window.addEventListener('storage', on);
    void pullCloudSermons(uid);
    return () => { window.removeEventListener(SERMON_PREP_EVENT, on); window.removeEventListener('storage', on); };
  }, [uid]);
  const save = useCallback((d: SermonPrepDoc) => saveSermon(uid, d), [uid]);
  const remove = useCallback((id: string) => deleteSermon(uid, id), [uid]);
  return { sermons, save, remove };
}

/** ~130 spoken words a minute is where most preachers land. */
export const WORDS_PER_MIN = 130;
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Manuscript text assembled from the outline, for a first pass. */
export function manuscriptFromOutline(d: SermonPrepDoc): string {
  const parts: string[] = [];
  if (d.bigIdea.trim()) parts.push(`BIG IDEA\n${d.bigIdea.trim()}`);
  d.outline.filter(s => s.heading.trim() || s.body.trim()).forEach((s, i) => {
    parts.push(`${i + 1}. ${s.heading.trim() || 'Point'}\n${s.body.trim()}`);
  });
  if (d.applications.length) parts.push(`APPLICATION\n${d.applications.map(a => `- ${a.text}`).join('\n')}`);
  return parts.join('\n\n');
}
