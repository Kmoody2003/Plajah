// newsroomStore — persistence and navigation for the Student Newsroom.
//
// Stories live in localStorage per reporter (guests and offline classrooms keep their work) and
// every save is mirrored to the creative cloud with version history (services/creativeCloud), the
// platform default for anything made in a Plajah tool. The cloud module is loaded lazily so the
// desk also runs in the dev lab without Firebase.
//
// Sign-off in this build happens on the reporter's device (the teacher or guardian signs in or
// signs at the desk). Cross-device class review through Academia assignments is a follow-up.

import { useCallback, useEffect, useState } from 'react';
import type { DepthLevel } from '../dossier/dossierTypes';
import type { StudentStory } from './studentDesk';

const key = (uid: string) => `plajah_newsroom_${uid || 'guest'}_v1`;
const BAND_KEY = 'plajah_newsroom_band_v1';
const MASTHEAD_KEY = (uid: string) => `plajah_newsroom_masthead_${uid || 'guest'}_v1`;
export const NEWSROOM_EVENT = 'plajah:newsroom:changed';

export function loadStories(uid: string): StudentStory[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) || '[]'); } catch { return []; }
}

function writeAll(uid: string, stories: StudentStory[]) {
  try { localStorage.setItem(key(uid), JSON.stringify(stories)); } catch { /* quota: keep in memory */ }
  window.dispatchEvent(new CustomEvent(NEWSROOM_EVENT, { detail: { uid } }));
}

export function saveStory(uid: string, story: StudentStory) {
  const all = loadStories(uid);
  const i = all.findIndex(s => s.id === story.id);
  if (i >= 0) all[i] = story; else all.unshift(story);
  writeAll(uid, all);
  if (uid && uid !== 'guest') {
    import('../creativeCloud/cloudStore')
      .then(m => m.scheduleCreativeSync({ kind: 'newsroom', localId: story.id, title: story.headline || 'Untitled story', json: JSON.stringify(story) }))
      .catch(() => { /* offline or no Firebase (dev lab) — the local save stands */ });
  }
}

export function deleteStory(uid: string, id: string) {
  writeAll(uid, loadStories(uid).filter(s => s.id !== id));
}

export function useStories(uid: string) {
  const [stories, setStories] = useState<StudentStory[]>(() => loadStories(uid));
  useEffect(() => {
    setStories(loadStories(uid));
    const on = () => setStories(loadStories(uid));
    window.addEventListener(NEWSROOM_EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(NEWSROOM_EVENT, on); window.removeEventListener('storage', on); };
  }, [uid]);
  const save = useCallback((s: StudentStory) => saveStory(uid, s), [uid]);
  const remove = useCallback((id: string) => deleteStory(uid, id), [uid]);
  return { stories, save, remove };
}

export function getBand(): DepthLevel {
  try { return (localStorage.getItem(BAND_KEY) as DepthLevel) || 'middle'; } catch { return 'middle'; }
}
export function setBand(b: DepthLevel) { try { localStorage.setItem(BAND_KEY, b); } catch { /* */ } }

export interface Masthead { name: string; audience: string; edition: number }
export function loadMasthead(uid: string): Masthead {
  try { return { name: 'The Daily Notice', audience: 'our class and families', edition: 1, ...JSON.parse(localStorage.getItem(MASTHEAD_KEY(uid)) || '{}') }; }
  catch { return { name: 'The Daily Notice', audience: 'our class and families', edition: 1 }; }
}
export function saveMasthead(uid: string, m: Masthead) { try { localStorage.setItem(MASTHEAD_KEY(uid), JSON.stringify(m)); } catch { /* */ } }

// ── Navigation ────────────────────────────────────────────────────────────────
// Lessons, the Writers Desk and Lorea open the newsroom on a given tab or kit. The request is
// parked here and the School of Journalism view takes it on mount (or live, if already open).

export type JournalismTab = 'LADDER' | 'STRANDS' | 'NEWSROOM' | 'PRESS' | 'PUBLICATION' | 'TOOLS';
export interface JournalismOpen { tab?: JournalismTab; kitId?: string; lessonId?: string; storyId?: string; assignmentId?: string }
export const JOURNALISM_OPEN_EVENT = 'plajah:journalism:open';
let pending: JournalismOpen | null = null;

export function openJournalismSchool(req: JournalismOpen = {}) {
  pending = req;
  window.dispatchEvent(new CustomEvent(JOURNALISM_OPEN_EVENT, { detail: req }));
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'JOURNALISM_SCHOOL' } }));
}

export function takePendingJournalismOpen(): JournalismOpen | null {
  const p = pending; pending = null; return p;
}
