// multiSiteService — the cross-location program-feed registry (Part 3, Phase 5).
//
// A campus that goes live publishes its program output on an rtc broadcast session
// and registers it here. A master-control location lists the church's LIVE feeds
// and pulls one as a switcher source (subscribe to the session → the remote stream
// → TVStudioEngine.addStreamSource). This module is just the registry; the media
// travels over rtcCore's broadcast topology.

import { db, auth } from './firebase';
import { doc, collection, setDoc, updateDoc, onSnapshot, query, where } from 'firebase/firestore';
import type { ProgramFeed } from '../types';

const COL = 'program_feeds';

/** A campus registers its live program output. sessionId is the rtc broadcast id. */
export async function registerProgramFeed(input: { churchId: string; campusId: string; campusName: string; sessionId: string }): Promise<string | null> {
  if (!auth.currentUser) return null;
  const ref = doc(collection(db, COL));
  const feed: ProgramFeed = {
    id: ref.id,
    churchId: input.churchId,
    campusId: input.campusId,
    campusName: input.campusName,
    sessionId: input.sessionId,
    status: 'LIVE',
    startedAt: Date.now(),
  };
  await setDoc(ref, feed);
  return ref.id;
}

export async function endProgramFeed(feedId: string): Promise<void> {
  try { await updateDoc(doc(db, COL, feedId), { status: 'ENDED' }); } catch { /* */ }
}

/** Live subscribe to a church's program feeds (for the master-control source list). */
export function listenToProgramFeeds(churchId: string, cb: (feeds: ProgramFeed[]) => void): () => void {
  const q = query(collection(db, COL), where('churchId', '==', churchId), where('status', '==', 'LIVE'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgramFeed)).sort((a, b) => b.startedAt - a.startedAt));
  }, () => cb([]));
}

/** The rtc session id a campus should broadcast its program on (stable per campus). */
export function campusProgramSessionId(churchId: string, campusId: string): string {
  return `campusprog_${churchId}_${campusId}`;
}
