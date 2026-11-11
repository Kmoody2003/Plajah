// Live party games — realtime transport. Viewers listen to the public docs in plajah-ops directly (rules allow
// read on liveGames / liveGameStrokes / liveGameFeed), so a stroke the drawer sends reaches every viewer in a few
// hundred ms with no server fan-out. The lab swaps this module for realtimePoll.ts (same exports).

import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { opsDb } from '../firebase';
import { onSnapshot } from '../safeSnapshot';
import type { LiveGameDoc, StrokeBatch } from './core';

export interface FeedItem { kind: 'guess' | 'solved' | 'system'; name: string; text: string; at: number; uid?: string; points?: number; round?: number }
export interface LiveSnapshot { game: LiveGameDoc | null; strokes: StrokeBatch[]; feed: FeedItem[]; missing?: boolean }

export function subscribeLiveGame(gid: string, onChange: (s: LiveSnapshot) => void): () => void {
  let game: LiveGameDoc | null = null, strokes: StrokeBatch[] = [], feed: FeedItem[] = [];
  let round = -1, unStrokes: (() => void) | null = null;
  const emit = () => onChange({ game, strokes, feed });

  const watchRound = (r: number) => {
    if (r === round) return;
    round = r; unStrokes?.(); strokes = [];
    unStrokes = onSnapshot(query(collection(opsDb, 'liveGameStrokes'), where('gid', '==', gid), where('round', '==', r)), (snap: any) => {
      strokes = snap.docs.map((d: any) => d.data() as StrokeBatch).sort((a: StrokeBatch, b: StrokeBatch) => a.seq - b.seq);
      emit();
    });
  };

  const unGame = onSnapshot(doc(opsDb, 'liveGames', gid), (snap: any) => {
    if (!snap.exists()) { onChange({ game: null, strokes: [], feed: [], missing: true }); return; }
    game = snap.data() as LiveGameDoc;
    watchRound(game.round);
    emit();
  });
  const unFeed = onSnapshot(query(collection(opsDb, 'liveGameFeed'), where('gid', '==', gid), orderBy('at', 'desc'), limit(40)), (snap: any) => {
    feed = snap.docs.map((d: any) => d.data() as FeedItem).reverse();
    emit();
  });
  return () => { unGame(); unFeed(); unStrokes?.(); };
}
