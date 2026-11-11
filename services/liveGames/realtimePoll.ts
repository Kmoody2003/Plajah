// Polling stand-in for realtime.ts (same exports) — used by the live games lab, where the router runs on an
// in-memory store and there is no Firestore to listen to. Reads GET /api/live-game/:id/poll every ~400 ms.

import { liveGame, failed } from './client';
import type { LiveGameDoc, StrokeBatch } from './core';
import type { FeedItem, LiveSnapshot } from './realtime';
export type { FeedItem, LiveSnapshot } from './realtime';

export function subscribeLiveGame(gid: string, onChange: (s: LiveSnapshot) => void): () => void {
  let alive = true, round = -1, after = 0, feedAfter = 0;
  let strokes: StrokeBatch[] = [], feed: FeedItem[] = [], game: LiveGameDoc | null = null;
  const loop = async () => {
    while (alive) {
      const r = await liveGame.poll(gid, round < 0 ? 0 : round, after, feedAfter);
      if (!alive) return;
      if (!failed(r)) {
        game = r.game;
        // Strokes in this reply belong to the round we asked for; on a new round, start over next poll.
        if (r.game.round !== round) { round = r.game.round; after = 0; strokes = []; }
        else if (r.strokes.length) { strokes = [...strokes, ...r.strokes]; after = strokes[strokes.length - 1].seq; }
        if (r.feed.length) { feed = [...feed, ...r.feed].slice(-40); feedAfter = feed[feed.length - 1].at; }
        onChange({ game, strokes, feed });
      } else if (r.httpStatus === 404) { onChange({ game: null, strokes: [], feed: [], missing: true }); }
      await new Promise(res => setTimeout(res, 400));
    }
  };
  void loop();
  return () => { alive = false; };
}
