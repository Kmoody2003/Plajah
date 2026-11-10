// A Plajah game, playable right in the Social timeline. Rendered by PostCard for any post with a `gameEmbed`
// (services/gamerNet/social.ts). Nothing navigates away:
//   • tap the board → play the CPU inline
//   • "Find a match" → paired with someone else who has a game card on screen right now (the timeline lobby)
//   • tap a face in "on the timeline now" or "Challenge <author>" → a challenge they accept from a notification
//   • challenge posts addressed to you → Accept / Decline on the card
//   • result posts → the real final board from the server; live posts → the live board + Watch
//   • once a match is on: Go live (phone streamer, board burned into the stream) and Share to Bluesky

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Globe, Swords, Loader2, Check, X, Users } from 'lucide-react';
import * as T from '../../../services/gamerNet/games/ticTacToe';
import { gameRules } from '../../../services/gamerNet/registry';
import { sanitizeGameEmbed, LOBBY_HEARTBEAT_MS, effectiveStatus, type GameEmbed, type ChallengeDoc } from '../../../services/gamerNet/social';
import { gamer, isSignedIn, failed, type MatchView } from '../../../services/gamerNet/client';
import { gamerSocial, type LobbyState } from '../../../services/gamerNet/socialClient';
import { auth } from '../../../services/firebase';
import { MiniBoard, MatchPanel, Avatar, GX_CSS } from './GameParts';

interface Props { embed: unknown; postId: string; authorId: string; authorName: string }

type Mode = 'idle' | 'cpu' | 'seeking' | 'match';

export default function GameEmbedCard({ embed: raw, postId, authorId, authorName }: Props) {
  const embed = React.useMemo(() => sanitizeGameEmbed(raw), [raw]);
  if (!embed) return null;
  return <Card embed={embed} postId={postId} authorId={authorId} authorName={authorName} />;
}

function Card({ embed, postId, authorId, authorName }: { embed: GameEmbed; postId: string; authorId: string; authorName: string }) {
  const me = auth.currentUser?.uid ?? null;
  const signedIn = isSignedIn();
  const title = gameRules(embed.game)?.title ?? 'Game';
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>(embed.kind === 'result' || embed.kind === 'live' ? 'match' : 'idle');
  const [matchId, setMatchId] = useState<string | null>(embed.kind === 'result' || embed.kind === 'live' ? embed.matchId ?? null : null);
  const [lobby, setLobby] = useState<LobbyState>({ count: 0, people: [] });
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [seekSince, setSeekSince] = useState(0);
  const [tick, setTick] = useState(0);

  // only talk to the lobby while the card is actually on screen
  useEffect(() => {
    const el = rootRef.current; if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio > 0.25), { threshold: [0, 0.25, 0.6] });
    io.observe(el); return () => io.disconnect();
  }, []);

  // ───────── timeline lobby: presence heartbeat while visible; fast polling while seeking (even scrolled away)
  const seeking = mode === 'seeking';
  useEffect(() => {
    if (embed.kind === 'result' || embed.kind === 'live') return;
    if (!visible && !seeking) return;
    let alive = true;
    const beat = async () => {
      const r = signedIn ? await gamerSocial.heartbeat(embed.game, seeking) : await gamerSocial.lobby(embed.game);
      if (!alive || failed(r)) return;
      setLobby(r);
      if (r.status === 'matched' && r.matchId) { setMatchId(r.matchId); setMode('match'); setNote(''); }
    };
    void beat();
    const h = setInterval(beat, seeking ? 2000 : LOBBY_HEARTBEAT_MS);
    return () => { alive = false; clearInterval(h); };
  }, [visible, seeking, embed.game, embed.kind, signedIn]);

  // leave the lobby when the card goes away (a waiting seeker stays in until they cancel)
  const modeRef = useRef(mode); modeRef.current = mode;
  useEffect(() => () => { if (signedIn && modeRef.current !== 'seeking') void gamerSocial.leave(embed.game); }, [embed.game, signedIn]);

  useEffect(() => { if (!seeking) return; const h = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(h); }, [seeking]);

  const findMatch = async () => {
    setErr(''); setNote('');
    if (!signedIn) { setErr('Sign in to play people on the timeline.'); return; }
    setSeekSince(Date.now()); setMode('seeking');
  };
  const cancelSeek = async () => { setMode('idle'); await gamerSocial.heartbeat(embed.game, false); };
  /** Nobody else is seeking on the timeline: widen to the whole network's quick match. */
  const widen = async () => {
    await gamerSocial.heartbeat(embed.game, false);
    const r = await gamer.queue(embed.game);
    if (failed(r)) { setErr(r.error); setMode('idle'); return; }
    if (r.status === 'matched' && r.matchId) { setMatchId(r.matchId); setMode('match'); return; }
    setNote('Searching the whole network…');
    const until = Date.now() + 45_000;
    while (Date.now() < until && modeRef.current === 'seeking') {
      await new Promise(res => setTimeout(res, 1500));
      const p = await gamer.pollQueue(embed.game);
      if (!failed(p) && p.status === 'matched' && p.matchId) { setMatchId(p.matchId); setMode('match'); setNote(''); return; }
    }
    if (modeRef.current === 'seeking') { await gamer.leaveQueue(embed.game); setMode('idle'); setNote('No one free right now — challenge someone instead.'); }
  };

  const challenge = async (to: string, name: string) => {
    setErr(''); setNote('');
    if (!signedIn) { setErr('Sign in to challenge people.'); return; }
    const r = await gamerSocial.challenge(embed.game, to, 'post', postId);
    if (failed(r)) { setErr(r.error); return; }
    setOutgoing(r.challenge);
    setNote(`Challenge sent to ${name}. You'll jump in as soon as they accept.`);
  };

  // ───────── challenges tied to this card: the one I sent from here, or the one this post is about
  const [outgoing, setOutgoing] = useState<ChallengeDoc | null>(null);
  const [postChallenge, setPostChallenge] = useState<ChallengeDoc | null>(null);
  const challengeId = embed.kind === 'challenge' ? embed.challengeId : outgoing?.id;
  const involved = embed.kind === 'challenge' ? !!me && (me === authorId || me === embed.toUid) : !!outgoing;
  useEffect(() => {
    if (!challengeId || !involved || mode === 'match') return;
    let alive = true;
    const poll = async () => {
      const r = await gamerSocial.getChallenge(challengeId);
      if (!alive || failed(r)) return;
      if (embed.kind === 'challenge') setPostChallenge(r.challenge); else setOutgoing(r.challenge);
      if (r.challenge.status === 'accepted' && r.challenge.matchId) { setMatchId(r.challenge.matchId); setMode('match'); setNote(''); }
      if (r.challenge.status === 'declined' && embed.kind !== 'challenge') setNote(`${r.challenge.toName} passed this time.`);
    };
    void poll();
    const h = setInterval(poll, visible ? 3000 : 8000);
    return () => { alive = false; clearInterval(h); };
  }, [challengeId, involved, mode, visible, embed.kind]);

  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    if (!challengeId) return;
    setErr('');
    const r = await gamerSocial.respond(challengeId, action);
    if (failed(r)) { setErr(r.error); return; }
    if (embed.kind === 'challenge') setPostChallenge(r.challenge); else setOutgoing(r.challenge);
    if (r.matchId) { setMatchId(r.matchId); setMode('match'); }
    if (action === 'cancel') setNote('Challenge cancelled.');
  };

  // ───────── inline CPU
  const [board, setBoard] = useState(T.EMPTY);
  const [cpuRound, setCpuRound] = useState(0);
  const human: T.Mark = cpuRound % 2 === 0 ? 'X' : 'O';
  const cpu: T.Mark = human === 'X' ? 'O' : 'X';
  const result = T.outcome(board);
  const recorded = useRef(false);
  const playCpu = useCallback((i: number) => {
    if (T.outcome(board) || T.turnOf(board) !== human) return;
    const next = T.play(board, i, human); if (!next) return;
    setMode('cpu'); setBoard(next);
  }, [board, human]);
  useEffect(() => {
    if (mode !== 'cpu' || result || T.turnOf(board) !== cpu) return;
    const t = setTimeout(() => setBoard(b => (T.outcome(b) || T.turnOf(b) !== cpu ? b : T.play(b, T.cpuMove(b, cpu, 'medium'), cpu) ?? b)), 360);
    return () => clearTimeout(t);
  }, [mode, board, result, cpu]);
  useEffect(() => {
    if (mode !== 'cpu' || !result || recorded.current) return;
    recorded.current = true;
    if (signedIn) void gamer.local(embed.game, result.kind === 'draw' ? 'draw' : result.mark === human ? 'win' : 'loss', 'cpu', 'medium');
  }, [mode, result, human, signedIn, embed.game]);
  const newCpuRound = () => { setBoard(T.EMPTY); recorded.current = false; setCpuRound(r => r + 1); };

  const cpuStatus = result?.kind === 'draw' ? 'Draw — grid locked' : result?.kind === 'win' ? (result.mark === human ? 'You beat the CPU!' : 'CPU wins this one') : mode === 'cpu' ? (T.turnOf(board) === human ? `Your move (${human})` : 'CPU thinking…') : 'Tap any square to play';

  // ───────── render
  const pc = embed.kind === 'challenge' ? postChallenge : null;
  const pcStatus = pc ? effectiveStatus(pc, Date.now()) : null;
  const forMe = embed.kind === 'challenge' && me === embed.toUid;
  const iSent = embed.kind === 'challenge' && me === authorId;
  const outPending = outgoing && effectiveStatus(outgoing, Date.now()) === 'pending';

  let body: React.ReactNode;
  if (mode === 'match' && matchId) {
    body = <MatchPanel matchId={matchId} onNext={id => setMatchId(id)} onLeave={embed.kind === 'result' || embed.kind === 'live' ? undefined : () => { setMatchId(null); setMode('idle'); }} />;
  } else if (mode === 'seeking') {
    const waited = Math.floor((Date.now() - seekSince) / 1000) + tick * 0;
    body = (
      <div className="gx-seek">
        <Loader2 className="gx-spin" size={22} />
        <b>Finding someone on the timeline…</b>
        <span className="gx-small">{waited}s · {lobby.people.filter(p => p.seeking).length} others looking · {lobby.count} here now</span>
        {note && <span className="gx-small">{note}</span>}
        <div className="gx-row">
          {waited >= 12 && !note && <button className="gx-btn ghost" onClick={widen}><Globe size={14} /> Widen to everyone</button>}
          <button className="gx-btn ghost" onClick={cancelSeek}>Cancel</button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {embed.kind === 'challenge' && (
          <div className="gx-lobby" style={{ marginTop: 0, marginBottom: 10 }}>
            <Swords size={14} />
            <span>
              {forMe ? <><b>{authorName}</b> challenged you</> : iSent ? <>You challenged <b>{embed.toName ?? 'them'}</b></> : <><b>{authorName}</b> challenged <b>{embed.toName ?? 'someone'}</b></>}
              {pcStatus && pcStatus !== 'pending' ? ` · ${pcStatus}` : ''}
            </span>
          </div>
        )}
        {forMe && pcStatus === 'pending' && (
          <div className="gx-row" style={{ marginTop: 0, marginBottom: 10 }}>
            <button className="gx-btn" onClick={() => respond('accept')}><Check size={14} /> Accept &amp; play</button>
            <button className="gx-btn ghost" onClick={() => respond('decline')}><X size={14} /> Decline</button>
          </div>
        )}
        {iSent && pcStatus === 'pending' && (
          <div className="gx-row" style={{ marginTop: 0, marginBottom: 10 }}>
            <span className="gx-small">Waiting for {embed.toName ?? 'them'} — you'll jump in when they accept.</span>
            <button className="gx-btn ghost" onClick={() => respond('cancel')}>Cancel</button>
          </div>
        )}
        <div className="gx-status" aria-live="polite">{cpuStatus}</div>
        <MiniBoard board={board} hint={mode === 'idle'} disabled={!!result || (mode === 'cpu' && T.turnOf(board) !== human)} onPlay={playCpu} />
        <div className="gx-row">
          {mode === 'cpu' && <button className="gx-btn ghost" onClick={newCpuRound}><Cpu size={14} /> {result ? 'Next round' : 'Restart'}</button>}
          <button className="gx-btn" onClick={findMatch}><Users size={14} /> Find a match</button>
          {me !== authorId && !forMe && <button className="gx-btn pk" disabled={!!outPending} onClick={() => challenge(authorId, authorName)}><Swords size={14} /> Challenge {authorName.split(' ')[0]}</button>}
          {outPending && <button className="gx-btn ghost" onClick={() => respond('cancel')}>Cancel challenge</button>}
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} className="gx-card" onClick={e => e.stopPropagation()} data-game-embed={embed.kind}>
      <style>{GX_CSS}</style>
      <div className="gx-head">
        <div className="gx-logo"><span className="c">{title.split(' ')[0].toUpperCase()}</span> <span className="p">{title.split(' ').slice(1).join(' ').toUpperCase()}</span></div>
        <span className={`gx-tag${embed.kind === 'live' ? ' live' : ''}`}>{embed.kind === 'live' ? '● Live' : embed.kind === 'result' ? 'Result' : embed.kind === 'challenge' ? 'Challenge' : 'Play here'}</span>
      </div>
      {body}
      {embed.kind !== 'result' && embed.kind !== 'live' && mode !== 'match' && (
        <div className="gx-lobby">
          <span className="gx-dot" />
          <span>{lobby.count ? <><b>{lobby.count}</b> on the timeline now{lobby.people.some(p => p.seeking) ? ' · some want a game' : ''}</> : 'Be the first on the timeline'}</span>
          <div className="gx-people">
            {lobby.people.slice(0, 6).map(p => (
              <button key={p.uid} className={p.seeking ? 'seek' : ''} title={`Challenge ${p.name}${p.seeking ? ' (looking for a game)' : ''}`} onClick={() => challenge(p.uid, p.name)}>
                <Avatar name={p.name} photo={p.photo} size={26} />
              </button>
            ))}
          </div>
        </div>
      )}
      {note && mode !== 'seeking' && <p className="gx-small" style={{ textAlign: 'center', marginTop: 8 }}>{note}</p>}
      {err && <p className="gx-err" role="alert">{err}</p>}
    </div>
  );
}

export type { MatchView };
