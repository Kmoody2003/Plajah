// State for Brain Rush / Crowd Says / Impostor Night screens: the live public doc + feed (same realtime transport
// as Sketch Rush), my answer / role / word from the referee, a server-clock offset, and the round heartbeat.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerDoc } from '../../services/liveGames/core';
import type { PartyGameDoc } from '../../services/liveGames/party';
import { liveParty, failed, myUid, ensurePlayable, type PartyMine } from '../../services/liveGames/client';
import { subscribeLiveGame, type FeedItem } from '../../services/liveGames/realtime';

export function usePartyGame(gid: string | null) {
  const [game, setGame] = useState<PartyGameDoc | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [me, setMe] = useState<PlayerDoc | null>(null);
  const [mine, setMine] = useState<PartyMine>({});
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'bad'; at: number } | null>(null);
  const uid = myUid();

  useEffect(() => {
    if (!gid) return;
    return subscribeLiveGame(gid, s => { if (s.missing) { setMissing(true); return; } setGame(s.game as unknown as PartyGameDoc); setFeed(s.feed); });
  }, [gid]);

  const refresh = useCallback(async () => {
    if (!gid) return;
    const r = await liveParty.get(gid); if (failed(r)) return;
    setOffset(r.serverNow - Date.now()); setMe(r.me ?? null); setMine(r.mine ?? {});
    setGame(g => g ?? r.game);
  }, [gid]);
  const phaseKey = game ? `${game.round}:${game.status}` : '';
  useEffect(() => { void refresh(); }, [refresh, phaseKey, uid]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, []);

  const isHost = !!game && uid === game.hostUid;
  const lastTick = useRef(0);
  useEffect(() => {
    if (!gid || !game || game.status === 'ended') return;
    const overdue = game.status !== 'lobby' && now + offset > game.phaseEndsAt + 1200;
    const due = isHost ? now - lastTick.current > 3000 || (overdue && now - lastTick.current > 1200) : overdue && now - lastTick.current > 2500;
    if (!due) return;
    lastTick.current = now;
    void liveParty.tick(gid).then(r => { if (!failed(r)) { setOffset(r.serverNow - Date.now()); if (r.game) setGame(r.game); } });
  }, [gid, game, now, offset, isHost]);

  const say = (text: string, tone: 'ok' | 'bad' = 'ok') => setNote({ text, tone, at: Date.now() });
  const answer = useCallback(async (a: { choice?: number; text?: string }) => {
    if (!gid) return;
    if (!(await ensurePlayable())) { say('Could not sign you in', 'bad'); return; }
    const r = await liveParty.answer(gid, a);
    if (failed(r)) { say(r.error, 'bad'); return; }
    if (r.result === 'closed') say('Too late — next round soon', 'bad');
    else { say(r.result === 'already' ? 'You already answered' : 'Locked in!'); setMine(m => ({ ...m, ...a })); }
  }, [gid]);
  const vote = useCallback(async (target: string) => {
    if (!gid) return;
    if (!(await ensurePlayable())) return;
    const r = await liveParty.vote(gid, target);
    if (failed(r)) { say(r.error, 'bad'); return; }
    if (r.result === 'closed') say('Voting closed', 'bad'); else { say('Vote cast!'); setMine(m => ({ ...m, target })); }
  }, [gid]);
  const join = useCallback(async (name?: string) => {
    if (!gid || !(await ensurePlayable())) return;
    const r = await liveParty.join(gid, name); if (!failed(r)) setMe(r.me);
  }, [gid]);

  const secondsLeft = game && (game.status === 'answer' || game.status === 'vote' || game.status === 'reveal') ? Math.max(0, Math.ceil((game.phaseEndsAt - (now + offset)) / 1000)) : 0;
  const visibleNote = note && Date.now() - note.at < 3500 ? note : null;
  return { game, feed, missing, me, mine, uid, isHost, secondsLeft, answer, vote, join, note: visibleNote, refresh };
}
