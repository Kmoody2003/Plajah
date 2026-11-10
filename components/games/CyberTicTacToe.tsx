// Cyber Tic Tac Toe — Plajah first-party game. Phone-first: one full-screen surface, a board sized to the
// smaller of width/height, big tap targets, safe-area padding. Three ways to play:
//   • vs CPU (easy / medium / hard)
//   • same device — pass-and-play, or face-to-face with the phone flat between two people
//   • online — quick match (rated, unified matchmaking) or a 6-character invite code (friendly)
// Online moves are refereed by /api/gamer (routes/gamerNet.ts); results land on both players' gamer ledgers.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Cpu, Users, Globe, RotateCcw, Flag, Copy, Check, Smartphone, Loader2, Trophy } from 'lucide-react';
import * as T from '../../services/gamerNet/games/ticTacToe';
import { gamer, isSignedIn, failed, type MatchView } from '../../services/gamerNet/client';

type Screen = 'menu' | 'cpu' | 'local' | 'lobby' | 'online';
interface Props { onExit: () => void; onOpenLeaderboard?: () => void }

const GAME = 'ttt';
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

// ───────────────────────────────────────────── board
function Mark({ m }: { m: string }) {
  if (m === 'X') return (
    <svg viewBox="0 0 100 100" className="ctt-mark ctt-x" aria-hidden><path d="M24 24 L76 76" /><path d="M76 24 L24 76" /></svg>
  );
  if (m === 'O') return (
    <svg viewBox="0 0 100 100" className="ctt-mark ctt-o" aria-hidden><circle cx="50" cy="50" r="27" /></svg>
  );
  return null;
}

function Board({ board, line, disabled, onPlay }: { board: string; line?: readonly number[]; disabled: boolean; onPlay: (i: number) => void }) {
  return (
    <div className="ctt-board" role="grid" aria-label="Tic tac toe board">
      {[...board].map((c, i) => {
        const won = line?.includes(i);
        return (
          <button
            key={i}
            role="gridcell"
            className={`ctt-cell${won ? ' ctt-won' : ''}`}
            disabled={disabled || c !== '-'}
            onClick={() => onPlay(i)}
            aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}${c === '-' ? ', empty' : `, ${c}`}`}
          >
            <Mark m={c} />
          </button>
        );
      })}
    </div>
  );
}

function Tally({ x, o, d, xLabel, oLabel }: { x: number; o: number; d: number; xLabel: string; oLabel: string }) {
  return (
    <div className="ctt-tally">
      <div className="ctt-tally-cell ctt-cyan"><span>{xLabel}</span><b>{x}</b></div>
      <div className="ctt-tally-cell"><span>Draws</span><b>{d}</b></div>
      <div className="ctt-tally-cell ctt-pink"><span>{oLabel}</span><b>{o}</b></div>
    </div>
  );
}

// ───────────────────────────────────────────── main
export default function CyberTicTacToe({ onExit, onOpenLeaderboard }: Props) {
  const [screen, setScreen] = useState<Screen>('menu');
  const [level, setLevel] = useState<T.CpuLevel>('medium');
  const [faceToFace, setFaceToFace] = useState(false);

  // offline (cpu / same device)
  const [board, setBoard] = useState<string>(T.EMPTY);
  const [round, setRound] = useState(0);
  const [tally, setTally] = useState({ X: 0, O: 0, draw: 0 });
  const humanMark: T.Mark = round % 2 === 0 ? 'X' : 'O'; // vs CPU: alternate who opens each round
  const cpuMark: T.Mark = humanMark === 'X' ? 'O' : 'X';
  const result = useMemo(() => T.outcome(board), [board]);
  const recorded = useRef(false);

  const newRound = useCallback((resetTally = false) => {
    setBoard(T.EMPTY); recorded.current = false; setRound(r => r + 1);
    if (resetTally) { setTally({ X: 0, O: 0, draw: 0 }); setRound(0); }
  }, []);

  const startOffline = (s: 'cpu' | 'local') => { setScreen(s); setBoard(T.EMPTY); setRound(0); setTally({ X: 0, O: 0, draw: 0 }); recorded.current = false; };

  const playOffline = (i: number) => {
    if (result) return;
    const mark = T.turnOf(board);
    if (screen === 'cpu' && mark !== humanMark) return;
    const next = T.play(board, i, mark); if (!next) return;
    buzz(); setBoard(next);
  };

  // CPU reply
  useEffect(() => {
    if (screen !== 'cpu' || result || T.turnOf(board) !== cpuMark) return;
    const t = setTimeout(() => setBoard(b => (T.outcome(b) || T.turnOf(b) !== cpuMark ? b : T.play(b, T.cpuMove(b, cpuMark, level), cpuMark) ?? b)), 380);
    return () => clearTimeout(t);
  }, [screen, board, result, cpuMark, level]);

  // end of an offline round: tally + history
  useEffect(() => {
    if (!result || recorded.current || (screen !== 'cpu' && screen !== 'local')) return;
    recorded.current = true;
    setTally(t => (result.kind === 'draw' ? { ...t, draw: t.draw + 1 } : { ...t, [result.mark]: t[result.mark] + 1 }));
    buzz(result.kind === 'draw' ? 20 : 40);
    if (isSignedIn()) {
      const r = screen === 'cpu' ? (result.kind === 'draw' ? 'draw' : result.mark === humanMark ? 'win' : 'loss') : undefined;
      void gamer.local(GAME, r, screen === 'cpu' ? 'cpu' : 'local', screen === 'cpu' ? level : undefined);
    }
  }, [result, screen, humanMark, level]);

  // ───────────── online
  const [matchId, setMatchId] = useState<string | null>(null);
  const [mv, setMv] = useState<MatchView | null>(null);
  const [searching, setSearching] = useState(false);
  const [waitedMs, setWaitedMs] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [netError, setNetError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(0);
  const skew = useRef(0);

  const applyView = useCallback((v: MatchView) => { skew.current = v.serverNow - Date.now(); setMv(v); }, []);

  // queue polling
  useEffect(() => {
    if (!searching) return;
    let alive = true;
    const tick = async () => {
      const r = await gamer.pollQueue(GAME);
      if (!alive) return;
      if (failed(r)) { setNetError(r.error); return; }
      if (r.status === 'matched' && r.matchId) { setSearching(false); setMatchId(r.matchId); setScreen('online'); }
      else if (r.waitedMs !== undefined) setWaitedMs(r.waitedMs);
    };
    const h = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(h); };
  }, [searching]);

  // leave the queue if the player closes the game mid-search
  const searchingRef = useRef(false);
  searchingRef.current = searching;
  useEffect(() => () => { if (searchingRef.current) void gamer.leaveQueue(GAME); }, []);

  // match polling
  const m = mv?.match;
  const you = mv?.you ?? -1;
  const myTurn = !!m && m.status === 'active' && T.turnOf(m.state) === (you === 0 ? 'X' : 'O');
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    const tick = async () => {
      const r = await gamer.match(matchId);
      if (!alive) return;
      if (failed(r)) { if (r.httpStatus !== 0) setNetError(r.error); return; }
      { setNetError(''); applyView(r); if (r.match.nextMatchId) { setMatchId(r.match.nextMatchId); setMv(null); } }
    };
    void tick();
    const done = m?.status === 'done';
    const waitingRematch = done && (m?.rematchVotes?.length ?? 0) > 0 && !m?.nextMatchId;
    if (done && !waitingRematch) return () => { alive = false; };
    const h = setInterval(tick, myTurn ? 3000 : 1200);
    return () => { alive = false; clearInterval(h); };
  }, [matchId, myTurn, m?.status, m?.rematchVotes?.length, m?.nextMatchId, applyView]);

  // move clock
  useEffect(() => {
    if (!m || m.status !== 'active') { setClock(0); return; }
    const upd = () => setClock(Math.max(0, Math.ceil((m.moveDeadline - (Date.now() + skew.current)) / 1000)));
    upd(); const h = setInterval(upd, 250); return () => clearInterval(h);
  }, [m?.moveDeadline, m?.status]);

  const quickMatch = async () => {
    setNetError(''); setBusy(true);
    const r = await gamer.queue(GAME);
    setBusy(false);
    if (failed(r)) { setNetError(r.error); return; }
    if (r.status === 'matched' && r.matchId) { setMatchId(r.matchId); setScreen('online'); } else { setWaitedMs(0); setSearching(true); }
  };
  const cancelSearch = async () => {
    setSearching(false);
    const r = await gamer.leaveQueue(GAME);
    if (!failed(r) && r.status === 'matched' && r.matchId) { setMatchId(r.matchId); setScreen('online'); }
  };
  const createInvite = async () => {
    setNetError(''); setBusy(true);
    const r = await gamer.invite(GAME);
    setBusy(false);
    if (failed(r)) { setNetError(r.error); return; }
    setInviteCode(r.code); setMatchId(r.matchId); setScreen('online');
  };
  const joinInvite = async () => {
    setNetError(''); setBusy(true);
    const r = await gamer.join(joinCode);
    setBusy(false);
    if (failed(r)) { setNetError(r.error); return; }
    setInviteCode(''); setMatchId(r.matchId); setScreen('online');
  };
  const playOnline = async (i: number) => {
    if (!m || !matchId || !myTurn || m.state[i] !== '-') return;
    const mark = you === 0 ? 'X' : 'O';
    const optimistic = T.play(m.state, i, mark); if (!optimistic) return;
    buzz();
    setMv(v => (v ? { ...v, match: { ...v.match, state: optimistic } } : v));
    const r = await gamer.move(matchId, i, m.v);
    if (!failed(r)) { applyView(r); return; }
    setNetError(r.error);
    const again = await gamer.match(matchId); if (!failed(again)) applyView(again);
  };
  const leaveOnline = async () => {
    if (matchId && m && (m.status === 'active' || m.status === 'waiting')) await gamer.resign(matchId);
    setMatchId(null); setMv(null); setInviteCode(''); setScreen('lobby');
  };

  const back = () => {
    if (screen === 'online') { void leaveOnline(); return; }
    if (searching) void cancelSearch();
    if (screen === 'menu') onExit(); else setScreen('menu');
  };

  // ───────────── render helpers
  const offlineStatus = (): string => {
    if (result?.kind === 'draw') return 'Draw — grid locked';
    if (result?.kind === 'win') return screen === 'cpu' ? (result.mark === humanMark ? 'You win!' : 'CPU wins') : `${result.mark} wins!`;
    const t = T.turnOf(board);
    return screen === 'cpu' ? (t === humanMark ? `Your move (${humanMark})` : 'CPU thinking…') : `${t} to move`;
  };

  const onlineStatus = (): string => {
    if (!m) return 'Connecting…';
    if (m.status === 'waiting') return 'Waiting for your friend to join';
    if (m.status === 'active') return myTurn ? 'Your move' : `${m.cards[you === 0 ? 1 : 0]?.name ?? 'Opponent'} is thinking`;
    if (m.endReason === 'abandoned') return 'Match closed';
    const r = m.winnerSeat === null || m.winnerSeat === undefined ? 'Draw' : m.winnerSeat === you ? 'You win!' : 'You lose';
    const why = m.endReason === 'timeout' ? ' · out of time' : m.endReason === 'resign' ? ' · resigned' : '';
    return r + why;
  };

  const winLine = (b: string) => { const o = T.outcome(b); return o?.kind === 'win' ? o.line : undefined; };

  // ───────────── screens
  let body: React.ReactNode;
  if (screen === 'menu') {
    body = (
      <div className="ctt-menu">
        <div className="ctt-logo"><span className="ctt-cyan-t">CYBER</span><span className="ctt-pink-t">TIC·TAC·TOE</span></div>
        <p className="ctt-sub">Three in a row on the neon grid.</p>
        <button className="ctt-option" onClick={() => startOffline('cpu')}><Cpu size={22} /><span><b>Play the CPU</b><small>Easy, medium or unbeatable</small></span></button>
        <div className="ctt-levels" role="radiogroup" aria-label="CPU difficulty">
          {(['easy', 'medium', 'hard'] as const).map(l => (
            <button key={l} role="radio" aria-checked={level === l} className={`ctt-chip${level === l ? ' on' : ''}`} onClick={() => setLevel(l)}>{l}</button>
          ))}
        </div>
        <button className="ctt-option" onClick={() => startOffline('local')}><Users size={22} /><span><b>Two players, one device</b><small>Pass-and-play or face-to-face</small></span></button>
        <label className="ctt-toggle"><input type="checkbox" checked={faceToFace} onChange={e => setFaceToFace(e.target.checked)} /><Smartphone size={16} /> Face-to-face (lay the phone flat between you)</label>
        <button className="ctt-option" onClick={() => { setNetError(''); setScreen('lobby'); }}><Globe size={22} /><span><b>Play online</b><small>Quick match or invite a friend</small></span></button>
        {onOpenLeaderboard && <button className="ctt-link" onClick={onOpenLeaderboard}><Trophy size={14} /> Leaderboard &amp; gamer score</button>}
      </div>
    );
  } else if (screen === 'lobby') {
    const signedIn = isSignedIn();
    body = (
      <div className="ctt-menu">
        <div className="ctt-h">Online</div>
        {!signedIn && <p className="ctt-note">Sign in to play online. Wins, ratings and achievements go on your Plajah gamer ledger.</p>}
        {searching ? (
          <div className="ctt-search">
            <Loader2 className="ctt-spin" size={28} />
            <b>Finding an opponent…</b>
            <small>{Math.floor(waitedMs / 1000)}s · matching by skill, widening as you wait</small>
            <button className="ctt-btn ghost" onClick={cancelSearch}>Cancel</button>
          </div>
        ) : (
          <>
            <button className="ctt-option" disabled={!signedIn || busy} onClick={quickMatch}><Globe size={22} /><span><b>Quick match</b><small>Rated · counts toward your gamer score</small></span></button>
            <button className="ctt-option" disabled={!signedIn || busy} onClick={createInvite}><Users size={22} /><span><b>Invite a friend</b><small>Get a code to share · friendly match</small></span></button>
            <div className="ctt-join">
              <input
                value={joinCode} maxLength={6} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                placeholder="Friend's code" aria-label="Friend's code"
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter' && joinCode.length === 6) void joinInvite(); }}
              />
              <button className="ctt-btn" disabled={!signedIn || busy || joinCode.length !== 6} onClick={joinInvite}>Join</button>
            </div>
          </>
        )}
        {netError && <p className="ctt-err" role="alert">{netError}</p>}
      </div>
    );
  } else if (screen === 'online') {
    const opp = m?.cards[you === 0 ? 1 : 0];
    const meCard = m?.cards[you];
    const done = m?.status === 'done';
    const votedRematch = !!m?.rematchVotes?.includes(meCard?.uid ?? '');
    body = (
      <div className="ctt-play">
        <div className="ctt-vs">
          <div className={`ctt-player ${you === 0 ? 'ctt-cyan' : 'ctt-pink'}${myTurn ? ' turn' : ''}`}><small>You · {you === 0 ? 'X' : 'O'}</small><b>{meCard?.name ?? '…'}</b>{m?.rated && <em>{meCard?.rating}</em>}</div>
          <div className="ctt-clock" aria-live="polite">{m?.status === 'active' ? `${clock}s` : m?.rated ? 'RATED' : 'FRIENDLY'}</div>
          <div className={`ctt-player right ${you === 0 ? 'ctt-pink' : 'ctt-cyan'}${m?.status === 'active' && !myTurn ? ' turn' : ''}`}><small>{you === 0 ? 'O' : 'X'}</small><b>{opp?.name ?? 'Waiting…'}</b>{m?.rated && opp && <em>{opp.rating}</em>}</div>
        </div>
        {m?.status === 'waiting' && inviteCode && (
          <div className="ctt-invite">
            <small>Share this code</small>
            <b>{inviteCode}</b>
            <button className="ctt-btn ghost" onClick={() => { void navigator.clipboard?.writeText(inviteCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
        )}
        <div className="ctt-status" aria-live="polite">{onlineStatus()}</div>
        <Board board={m?.state ?? T.EMPTY} line={m ? winLine(m.state) : undefined} disabled={!myTurn} onPlay={playOnline} />
        <div className="ctt-actions">
          {done ? (
            m?.endReason !== 'abandoned' && <button className="ctt-btn" disabled={votedRematch} onClick={async () => { if (!matchId) return; const r = await gamer.rematch(matchId); if (!failed(r)) applyView(r); }}>
              <RotateCcw size={16} /> {votedRematch ? 'Waiting for opponent…' : 'Rematch'}
            </button>
          ) : (
            <button className="ctt-btn ghost" onClick={() => { if (window.confirm(m?.status === 'waiting' ? 'Cancel this invite?' : 'Resign this match?')) void leaveOnline(); }}>
              <Flag size={16} /> {m?.status === 'waiting' ? 'Cancel' : 'Resign'}
            </button>
          )}
          {done && <button className="ctt-btn ghost" onClick={() => { setMatchId(null); setMv(null); setScreen('lobby'); }}>New opponent</button>}
        </div>
        {netError && <p className="ctt-err" role="alert">{netError}</p>}
      </div>
    );
  } else {
    // cpu / same device
    const flip = screen === 'local' && faceToFace;
    body = (
      <div className={`ctt-play${flip ? ' ctt-f2f' : ''}`}>
        {flip && <div className="ctt-flipped"><div className="ctt-status">{result ? offlineStatus() : T.turnOf(board) === 'O' ? 'Your move (O)' : 'X to move'}</div></div>}
        <Tally x={tally.X} o={tally.O} d={tally.draw} xLabel={screen === 'cpu' ? (humanMark === 'X' ? 'You · X' : 'CPU · X') : 'X'} oLabel={screen === 'cpu' ? (humanMark === 'O' ? 'You · O' : 'CPU · O') : 'O'} />
        {!flip && <div className="ctt-status" aria-live="polite">{offlineStatus()}</div>}
        <Board board={board} line={winLine(board)} disabled={!!result || (screen === 'cpu' && T.turnOf(board) !== humanMark)} onPlay={playOffline} />
        {flip && <div className="ctt-status">{result ? offlineStatus() : T.turnOf(board) === 'X' ? 'Your move (X)' : 'O to move'}</div>}
        <div className="ctt-actions">
          <button className="ctt-btn" onClick={() => newRound()}><RotateCcw size={16} /> {result ? 'Next round' : 'Restart'}</button>
          <button className="ctt-btn ghost" onClick={() => newRound(true)}>Reset score</button>
        </div>
        {screen === 'cpu' && <div className="ctt-levels small">{(['easy', 'medium', 'hard'] as const).map(l => <button key={l} className={`ctt-chip${level === l ? ' on' : ''}`} onClick={() => setLevel(l)}>{l}</button>)}</div>}
      </div>
    );
  }

  return (
    <div className="ctt-root">
      <style>{CSS}</style>
      <header className="ctt-top">
        <button className="ctt-icon" onClick={back} aria-label="Back"><ChevronLeft size={22} /></button>
        <span className="ctt-title">{screen === 'cpu' ? `vs CPU · ${level}` : screen === 'local' ? 'Same device' : screen === 'lobby' || screen === 'online' ? 'Online' : 'Plajah Originals'}</span>
        <span className="ctt-icon-spacer" />
      </header>
      <main className="ctt-main">{body}</main>
    </div>
  );
}

const CSS = `
.ctt-root{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;height:100dvh;color:#e8fbff;
  background:radial-gradient(120% 80% at 50% -10%,rgba(0,218,243,.18),transparent 60%),radial-gradient(90% 70% at 50% 120%,rgba(255,0,153,.16),transparent 60%),#05060d;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  font-family:inherit;-webkit-tap-highlight-color:transparent;overscroll-behavior:contain;touch-action:manipulation}
.ctt-root::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;
  background-image:linear-gradient(rgba(0,218,243,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(0,218,243,.07) 1px,transparent 1px);background-size:32px 32px}
.ctt-top{position:relative;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;flex:none}
.ctt-icon{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:inherit}
.ctt-icon-spacer{width:44px}
.ctt-title{font-size:12px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;opacity:.7}
.ctt-main{position:relative;flex:1;min-height:0;overflow-y:auto;display:flex;justify-content:center;padding:4px 16px 16px}
.ctt-menu{width:100%;max-width:440px;display:flex;flex-direction:column;gap:12px;padding-top:2vh}
.ctt-logo{display:flex;flex-direction:column;align-items:center;line-height:1;font-weight:900;letter-spacing:.06em;margin:8px 0 2px}
.ctt-logo span:first-child{font-size:clamp(40px,13vw,64px)}
.ctt-logo span:last-child{font-size:clamp(18px,5.4vw,26px);letter-spacing:.18em}
.ctt-cyan-t{color:#00f0ff;text-shadow:0 0 18px rgba(0,240,255,.7)}
.ctt-pink-t{color:#ff2bd6;text-shadow:0 0 18px rgba(255,43,214,.7)}
.ctt-sub{text-align:center;font-size:13px;opacity:.6;margin:0 0 8px}
.ctt-h{font-size:22px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.ctt-option{display:flex;align-items:center;gap:14px;width:100%;min-height:68px;padding:14px 16px;border-radius:18px;text-align:left;color:inherit;
  background:linear-gradient(135deg,rgba(0,240,255,.10),rgba(255,43,214,.08));border:1px solid rgba(0,240,255,.28);transition:transform .12s,border-color .2s}
.ctt-option:active{transform:scale(.98)}
.ctt-option:disabled{opacity:.4}
.ctt-option span{display:flex;flex-direction:column;gap:2px}
.ctt-option b{font-size:16px}
.ctt-option small{font-size:12px;opacity:.6}
.ctt-option svg{color:#00f0ff;flex:none}
.ctt-levels{display:flex;gap:8px;justify-content:center}
.ctt-levels.small{margin-top:4px}
.ctt-chip{min-width:84px;min-height:40px;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}
.ctt-chip.on{background:#00f0ff;color:#031016;border-color:#00f0ff;box-shadow:0 0 16px rgba(0,240,255,.5)}
.ctt-toggle{display:flex;align-items:center;gap:8px;font-size:13px;opacity:.8;padding:4px 6px;min-height:40px}
.ctt-toggle input{width:20px;height:20px;accent-color:#ff2bd6}
.ctt-link{display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:700;color:#ffd166;padding:10px;min-height:44px}
.ctt-note{font-size:13px;line-height:1.5;opacity:.75;background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.25);padding:12px;border-radius:14px;margin:0}
.ctt-err{color:#ff7b9c;font-size:13px;text-align:center;margin:6px 0 0}
.ctt-search{display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 12px;border-radius:18px;border:1px dashed rgba(0,240,255,.35);text-align:center}
.ctt-search small{opacity:.6;font-size:12px}
.ctt-spin{animation:ctt-spin 1s linear infinite;color:#00f0ff}
@keyframes ctt-spin{to{transform:rotate(360deg)}}
.ctt-join{display:flex;gap:8px}
.ctt-join input{flex:1;min-width:0;min-height:52px;border-radius:14px;padding:0 14px;font-size:20px;font-weight:900;letter-spacing:.3em;text-align:center;color:inherit;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);text-transform:uppercase}
.ctt-join input::placeholder{letter-spacing:.05em;font-size:14px;font-weight:600;opacity:.5}
.ctt-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 18px;border-radius:14px;font-size:13px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#031016;background:#00f0ff;border:1px solid #00f0ff;box-shadow:0 0 18px rgba(0,240,255,.35)}
.ctt-btn:disabled{opacity:.45;box-shadow:none}
.ctt-btn.ghost{color:inherit;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.15);box-shadow:none}
.ctt-play{width:100%;max-width:520px;display:flex;flex-direction:column;align-items:center;gap:12px}
.ctt-status{font-size:clamp(16px,4.6vw,20px);font-weight:900;letter-spacing:.04em;text-align:center;min-height:1.4em}
.ctt-board{--size:min(calc(100vw - 32px),calc(100dvh - 300px),480px);width:var(--size);height:var(--size);min-width:240px;min-height:240px;display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(6px,1.8vw,10px);
  padding:clamp(6px,1.8vw,10px);border-radius:22px;background:rgba(0,240,255,.06);border:1px solid rgba(0,240,255,.3);box-shadow:0 0 40px rgba(0,240,255,.12) inset,0 0 30px rgba(255,43,214,.10)}
.ctt-cell{position:relative;border-radius:14px;background:rgba(5,8,20,.85);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;color:inherit;padding:0;transition:background .15s,border-color .15s}
.ctt-cell:not(:disabled):active{background:rgba(0,240,255,.12)}
@media (hover:hover){.ctt-cell:not(:disabled):hover{border-color:rgba(0,240,255,.45)}}
.ctt-cell:focus-visible{outline:2px solid #ffd166;outline-offset:2px}
.ctt-cell.ctt-won{border-color:#ffd166;background:rgba(255,209,102,.12);animation:ctt-pulse 1s ease-in-out infinite alternate}
@keyframes ctt-pulse{to{box-shadow:0 0 24px rgba(255,209,102,.55)}}
.ctt-mark{width:72%;height:72%;fill:none;stroke-width:11;stroke-linecap:round}
.ctt-x{stroke:#00f0ff;filter:drop-shadow(0 0 6px rgba(0,240,255,.9))}
.ctt-o{stroke:#ff2bd6;filter:drop-shadow(0 0 6px rgba(255,43,214,.9))}
.ctt-x path{stroke-dasharray:80;stroke-dashoffset:80;animation:ctt-draw .22s ease-out forwards}
.ctt-x path+path{animation-delay:.12s}
.ctt-o circle{stroke-dasharray:180;stroke-dashoffset:180;animation:ctt-draw .32s ease-out forwards}
@keyframes ctt-draw{to{stroke-dashoffset:0}}
.ctt-tally{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.ctt-tally-cell{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.ctt-tally-cell span{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.6;white-space:nowrap}
.ctt-tally-cell b{font-size:22px}
.ctt-cyan{border-color:rgba(0,240,255,.35)!important}.ctt-cyan b{color:#00f0ff}
.ctt-pink{border-color:rgba(255,43,214,.35)!important}.ctt-pink b{color:#ff2bd6}
.ctt-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.ctt-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;width:100%}
.ctt-player{display:flex;flex-direction:column;min-width:0;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:box-shadow .2s}
.ctt-player.right{text-align:right}
.ctt-player small{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
.ctt-player b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ctt-player em{font-style:normal;font-size:11px;opacity:.6}
.ctt-player.turn.ctt-cyan{box-shadow:0 0 18px rgba(0,240,255,.45)}
.ctt-player.turn.ctt-pink{box-shadow:0 0 18px rgba(255,43,214,.45)}
.ctt-clock{font-size:12px;font-weight:900;letter-spacing:.1em;padding:6px 8px;border-radius:10px;background:rgba(255,209,102,.1);color:#ffd166;text-align:center;min-width:56px}
.ctt-invite{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;border:1px dashed rgba(255,209,102,.5);background:rgba(255,209,102,.06)}
.ctt-invite small{font-size:11px;opacity:.7}
.ctt-invite b{font-size:24px;letter-spacing:.25em;color:#ffd166}
.ctt-f2f .ctt-board{--size:min(calc(100vw - 32px),calc(100dvh - 330px),480px)}
.ctt-flipped{transform:rotate(180deg)}
@media (prefers-reduced-motion:reduce){.ctt-x path,.ctt-o circle{animation:none;stroke-dashoffset:0}.ctt-cell.ctt-won{animation:none}.ctt-spin{animation:none}}
@media (min-width:900px){.ctt-main{align-items:flex-start;padding-top:3vh}}
`;
