// One hook for every Sketch Rush screen: live snapshot (realtime transport), my player row, the drawer's secret,
// a server-clock offset for countdowns, and the heartbeat that keeps rounds moving.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveGameDoc, PlayerDoc, StrokeBatch } from '../../services/liveGames/core';
import { liveGame, failed, myUid, ensurePlayable, type GuessVerdict } from '../../services/liveGames/client';
import { subscribeLiveGame, type FeedItem } from '../../services/liveGames/realtime';

export interface GuessResult { verdict: GuessVerdict | 'error'; points?: number; text: string; at: number; error?: string }

export function useLiveGame(gid: string | null) {
  const [game, setGame] = useState<LiveGameDoc | null>(null);
  const [strokes, setStrokes] = useState<StrokeBatch[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [me, setMe] = useState<PlayerDoc | null>(null);
  const [secret, setSecret] = useState<{ word?: string; choices?: string[] }>({});
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [last, setLast] = useState<GuessResult | null>(null);
  const uid = myUid();

  useEffect(() => {
    if (!gid) return;
    setMissing(false);
    return subscribeLiveGame(gid, s => { if (s.missing) { setMissing(true); return; } setGame(s.game); setStrokes(s.strokes); setFeed(s.feed); });
  }, [gid]);

  // My row + the clock offset; refreshed when the round changes (scores move at round end).
  const refresh = useCallback(async () => {
    if (!gid) return;
    const r = await liveGame.get(gid);
    if (failed(r)) return;
    setOffset(r.serverNow - Date.now());
    setMe(r.me ?? null);
    setSecret(r.secret ?? {});
    if (!game) setGame(r.game);
  }, [gid, game]);
  const phaseKey = game ? `${game.round}:${game.status}:${game.drawerUid}` : '';
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gid, phaseKey, uid]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, []);

  // Heartbeat: the host every 3 s; anyone once a phase is overdue, so a round never sticks on a throttled host tab.
  const isHost = !!game && uid === game.hostUid;
  const lastTick = useRef(0);
  useEffect(() => {
    if (!gid || !game || game.status === 'ended') return;
    const serverNow = now + offset;
    const overdue = game.status !== 'lobby' && serverNow > game.phaseEndsAt + 1500;
    const due = isHost ? now - lastTick.current > 3000 : overdue && now - lastTick.current > 2500;
    if (!due) return;
    lastTick.current = now;
    void liveGame.tick(gid).then(r => { if (!failed(r)) setOffset(r.serverNow - Date.now()); });
  }, [gid, game, now, offset, isHost]);

  const guess = useCallback(async (text: string) => {
    if (!gid || !text.trim()) return;
    if (!(await ensurePlayable())) { setLast({ verdict: 'error', text, at: Date.now(), error: 'Could not sign you in' }); return; }
    const r = await liveGame.guess(gid, text.trim());
    if (failed(r)) { setLast({ verdict: 'error', text, at: Date.now(), error: r.error }); return; }
    setLast({ verdict: r.verdict, points: r.points, text, at: Date.now() });
    if (r.verdict === 'correct') void refresh();
  }, [gid, refresh]);

  const join = useCallback(async (name?: string) => {
    if (!gid || !(await ensurePlayable())) return false;
    const r = await liveGame.join(gid, name);
    if (!failed(r)) setMe(r.me);
    return !failed(r);
  }, [gid]);

  const serverNow = now + offset;
  const secondsLeft = game && game.status !== 'lobby' && game.status !== 'ended' ? Math.max(0, Math.ceil((game.phaseEndsAt - serverNow) / 1000)) : 0;
  const isDrawer = !!game && !!uid && uid === game.drawerUid;
  const solved = !!game && !!me && me.solvedRound === game.round && game.round > 0;
  return { game, strokes, feed, missing, me, secret, setSecret, uid, isHost, isDrawer, solved, secondsLeft, serverNow, guess, join, last, refresh };
}
