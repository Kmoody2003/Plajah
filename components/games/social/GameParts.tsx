// Shared pieces for games in the Social timeline: the compact neon board, an online match panel (play, resign,
// rematch, go live, post the result, share to Bluesky), the Bluesky share sheet and the live studio wrapper.
// Everything stays in-app: Bluesky goes out through Plajah's own crosspost, live goes through the phone streamer.

import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radio, RotateCcw, Flag, Send, Loader2, Check, X, Eye } from 'lucide-react';
import * as T from '../../../services/gamerNet/games/ticTacToe';
import { auth } from '../../../services/firebase';
import { matchShareText, liveTitle } from '../../../services/gamerNet/social';
import { gamerSocial, postResult } from '../../../services/gamerNet/socialClient';
import { planBlueskyVersion, BSKY_LIMIT } from '../../../services/fediverse/blueskyVersion';
import type { MatchView } from '../../../services/gamerNet/client';
import { useOnlineMatch, matchStatus } from './useOnlineMatch';
import { makeMatchOverlay, type OverlaySnapshot } from './matchOverlayDraw';

const MobileLiveStreamer = lazy(() => import('../../MobileLiveStreamer'));

// ───────────────────────────────────────────── board
function Mark({ m }: { m: string }) {
  if (m === 'X') return <svg viewBox="0 0 100 100" className="gx-mark gx-x" aria-hidden><path d="M26 26 L74 74" /><path d="M74 26 L26 74" /></svg>;
  if (m === 'O') return <svg viewBox="0 0 100 100" className="gx-mark gx-o" aria-hidden><circle cx="50" cy="50" r="25" /></svg>;
  return null;
}

export const winLine = (b: string) => { const o = T.outcome(b); return o?.kind === 'win' ? o.line : undefined; };

export function MiniBoard({ board, disabled, onPlay, hint }: { board: string; disabled?: boolean; onPlay?: (i: number) => void; hint?: boolean }) {
  const line = winLine(board);
  return (
    <div className={`gx-board${hint ? ' gx-hint' : ''}`} role="grid" aria-label="Tic tac toe board">
      {[...board].map((c, i) => (
        <button key={i} role="gridcell" className={`gx-cell${line?.includes(i) ? ' gx-won' : ''}`}
          disabled={disabled || c !== '-' || !onPlay} onClick={() => onPlay?.(i)}
          aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}${c === '-' ? ', empty' : `, ${c}`}`}>
          <Mark m={c} />
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, photo, size = 26 }: { name: string; photo?: string; size?: number }) {
  return photo
    ? <img src={photo} alt="" className="gx-av" style={{ width: size, height: size }} />
    : <span className="gx-av gx-av-txt" style={{ width: size, height: size }}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

// ───────────────────────────────────────────── online match panel
export function MatchPanel({ matchId, onLeave, onNext }: { matchId: string; onLeave?: () => void; onNext?: (id: string) => void }) {
  const om = useOnlineMatch(matchId, onNext);
  const { view, you, myTurn, clock } = om;
  const m = view?.match;
  const [live, setLive] = useState(false);
  const [share, setShare] = useState(false);
  const [posted, setPosted] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [watch, setWatch] = useState<string | null>(null);
  const done = m?.status === 'done';
  const player = you >= 0;
  const votedRematch = !!m && player && !!m.rematchVotes?.includes(m.cards[you]?.uid ?? '');

  // Someone in this match is streaming it: spectators can open the stream.
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    void gamerSocial.live(matchId).then(r => { if (alive && r.ok && r.streamId) setWatch(r.streamId); });
    return () => { alive = false; };
  }, [matchId, m?.status]);

  const postIt = async () => {
    if (!m || !player) return;
    setPosted('busy');
    const id = await postResult(m.game, m.id, matchShareText(m, you));
    setPosted(id ? 'done' : 'error');
  };

  return (
    <div className="gx-match">
      <div className="gx-vs">
        <Seat card={m?.cards[0]} mark="X" turn={!!m && m.status === 'active' && T.turnOf(m.state) === 'X'} me={you === 0} rated={!!m?.rated} />
        <div className="gx-clock" aria-live="polite">{m?.status === 'active' ? `${clock}s` : m?.rated ? 'RATED' : 'FRIENDLY'}</div>
        <Seat card={m?.cards[1]} mark="O" turn={!!m && m.status === 'active' && T.turnOf(m.state) === 'O'} me={you === 1} rated={!!m?.rated} right />
      </div>
      <div className="gx-status" aria-live="polite">{matchStatus(view, myTurn)}</div>
      <MiniBoard board={m?.state ?? T.EMPTY} disabled={!myTurn} onPlay={player ? om.play : undefined} />
      <div className="gx-row">
        {player && !done && m?.status === 'active' && <button className="gx-btn live" onClick={() => setLive(true)}><Radio size={14} /> Go live</button>}
        {player && !done && <button className="gx-btn ghost" onClick={() => { if (window.confirm(m?.status === 'waiting' ? 'Cancel this match?' : 'Resign this match?')) void om.resign(); }}><Flag size={14} /> {m?.status === 'waiting' ? 'Cancel' : 'Resign'}</button>}
        {player && done && m?.endReason !== 'abandoned' && <button className="gx-btn" disabled={votedRematch} onClick={() => void om.rematch()}><RotateCcw size={14} /> {votedRematch ? 'Waiting…' : 'Rematch'}</button>}
        {player && done && m?.endReason !== 'abandoned' && <button className="gx-btn ghost" disabled={posted === 'busy' || posted === 'done'} onClick={postIt}>{posted === 'done' ? <><Check size={14} /> Posted</> : posted === 'busy' ? <Loader2 size={14} className="gx-spin" /> : <><Send size={14} /> Post result</>}</button>}
        {player && done && m?.endReason !== 'abandoned' && <button className="gx-btn bsky" onClick={() => setShare(true)}>🦋 Share to Bluesky</button>}
        {watch && !player && <button className="gx-btn live" onClick={() => setLive(true)}><Eye size={14} /> Watch live</button>}
        {onLeave && <button className="gx-btn ghost" onClick={onLeave}>{done ? 'Close' : 'Back'}</button>}
      </div>
      {posted === 'error' && <p className="gx-err">Could not post — try again.</p>}
      {om.error && <p className="gx-err" role="alert">{om.error}</p>}
      {live && player && m && <LiveMatchStudio view={view!} matchId={matchId} onClose={() => setLive(false)} />}
      {live && !player && watch && <Suspense fallback={null}><MobileLiveStreamer mode="viewer" streamId={watch} title={m ? liveTitle(m, 0) : undefined} onClose={() => setLive(false)} /></Suspense>}
      {share && m && player && <BlueskyShareSheet view={view!} onClose={() => setShare(false)} />}
    </div>
  );
}

function Seat({ card, mark, turn, me, rated, right }: { card?: { name: string; photo?: string; rating: number }; mark: 'X' | 'O'; turn: boolean; me: boolean; rated: boolean; right?: boolean }) {
  return (
    <div className={`gx-seat ${mark === 'X' ? 'cy' : 'pk'}${turn ? ' turn' : ''}${right ? ' right' : ''}`}>
      <small>{me ? `You · ${mark}` : mark}</small>
      <b>{card?.name ?? 'Waiting…'}</b>
      {rated && card && <em>{card.rating}</em>}
    </div>
  );
}

// ───────────────────────────────────────────── go live
/** Opens Plajah's phone streamer with the match title, burns the live board into the program, and lets the
 *  streamer keep playing from a floating board over their camera. */
export function LiveMatchStudio({ view, matchId, onClose }: { view: MatchView; matchId: string; onClose: () => void }) {
  const om = useOnlineMatch(matchId);
  const v = om.view ?? view;
  const snap = useRef<OverlaySnapshot | null>(null);
  const m = v.match;
  snap.current = { state: m.state, names: [m.cards[0]?.name ?? 'X', m.cards[1]?.name ?? 'O'], status: matchStatus(v, om.myTurn), clock: m.status === 'active' ? om.clock : undefined, line: winLine(m.state) };
  const drawer = useMemo(() => makeMatchOverlay(() => snap.current), []);
  // The streamer sits at z-200; step the game overlay aside while it's open so the camera screen is on top.
  useEffect(() => { document.body.classList.add('gx-live-open'); return () => document.body.classList.remove('gx-live-open'); }, []);
  const title = liveTitle(m, Math.max(0, v.you));
  return (
    <Suspense fallback={null}>
      <MobileLiveStreamer
        mode="streamer" initialTitle={title} programOverlay={drawer} onClose={onClose}
        onLive={id => { void gamerSocial.setLive(matchId, id); }}
        liveOverlay={() => (
          <div className="gx-live-float"><style>{GX_CSS}</style>
            <div className="gx-status">{matchStatus(v, om.myTurn)}{m.status === 'active' ? ` · ${om.clock}s` : ''}</div>
            <MiniBoard board={m.state} disabled={!om.myTurn} onPlay={om.play} />
          </div>
        )}
      />
    </Suspense>
  );
}

// ───────────────────────────────────────────── share to Bluesky
interface BskyAccount { id: string; protocol: string; handle: string; displayName?: string; avatarUrl?: string }

/** Posts the result to the Plajah timeline (a result card anyone can open), then crossposts it to the player's
 *  Bluesky account through Plajah's own crosspost (the server plans the Bluesky version from the stored post). */
export function BlueskyShareSheet({ view, onClose }: { view: MatchView; onClose: () => void }) {
  const m = view.match;
  const [text, setText] = useState(() => matchShareText(m, view.you));
  const [accounts, setAccounts] = useState<BskyAccount[] | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const plan = useMemo(() => planBlueskyVersion({ text, isPublic: true }, { postUrl: 'https://plajah.com/share?type=feed&id=xxxxxxxxxxxxxxxxxxxx' }), [text]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/fediverse/accounts', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const json = await res.json().catch(() => ({}));
        if (alive) setAccounts(((json?.accounts ?? []) as BskyAccount[]).filter(a => a.protocol === 'bluesky'));
      } catch { if (alive) setAccounts([]); }
    })();
    return () => { alive = false; };
  }, []);

  const bsky = accounts?.[0];
  const share = async () => {
    if (!bsky) return;
    setState('busy'); setMsg('');
    const postId = await postResult(m.game, m.id, text);
    if (!postId) { setState('error'); setMsg('Could not post to your Plajah timeline.'); return; }
    try {
      const { crosspostNative } = await import('../../../services/fediverse/crosspostClient');
      const out = await crosspostNative(postId, { accountIds: [bsky.id] });
      const r = out.results.find(x => x.accountId === bsky.id);
      if (out.blocked || !r?.ok) { setState('error'); setMsg(out.blocked || r?.error || 'Bluesky did not accept the post.'); return; }
      setState('done');
    } catch (e: any) { setState('error'); setMsg(e?.message || 'Could not share to Bluesky.'); }
  };

  return createPortal(
    <div className="gx-sheet-back" onClick={onClose}>
      <style>{GX_CSS}</style>
      <div className="gx-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Share to Bluesky">
        <div className="gx-sheet-h"><b>🦋 Share to Bluesky</b><button className="gx-x" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        {accounts === null ? <div className="gx-center"><Loader2 className="gx-spin" size={20} /></div>
          : !bsky ? (
            <div className="gx-note">
              Connect your Bluesky account to share matches there.
              <button className="gx-btn" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'SETTINGS' } })); }}>Connect in Settings</button>
            </div>
          ) : state === 'done' ? (
            <div className="gx-note"><Check size={18} /> Posted to your timeline and to {bsky.handle}.</div>
          ) : (
            <>
              <p className="gx-small">Posts as <b>{bsky.handle}</b>, with a link back to the playable card on Plajah.</p>
              <textarea className="gx-text" value={text} onChange={e => setText(e.target.value)} rows={7} />
              <div className="gx-row between">
                <span className={`gx-small ${plan.graphemes > BSKY_LIMIT ? 'gx-bad' : ''}`}>{plan.graphemes}/{BSKY_LIMIT}{plan.truncated ? ' · will be shortened' : ''}</span>
                <button className="gx-btn bsky" disabled={state === 'busy' || !text.trim()} onClick={share}>{state === 'busy' ? <Loader2 size={14} className="gx-spin" /> : 'Share'}</button>
              </div>
              {msg && <p className="gx-err">{msg}</p>}
            </>
          )}
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────────────────────── styles (scoped gx-)
export const GX_CSS = `
.gx-card{position:relative;margin-top:12px;border-radius:22px;padding:14px;color:#e8fbff;overflow:hidden;
  background:radial-gradient(120% 80% at 50% -20%,rgba(0,218,243,.16),transparent 60%),radial-gradient(90% 70% at 50% 130%,rgba(255,0,153,.14),transparent 60%),#070814;
  border:1px solid rgba(0,240,255,.22);box-shadow:0 0 30px rgba(0,240,255,.06) inset}
.gx-card::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.3;background-image:linear-gradient(rgba(0,218,243,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(0,218,243,.07) 1px,transparent 1px);background-size:24px 24px}
.gx-card>*{position:relative}
.gx-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.gx-logo{font-weight:900;letter-spacing:.08em;font-size:13px;line-height:1.1}
.gx-logo .c{color:#00f0ff;text-shadow:0 0 12px rgba(0,240,255,.6)}.gx-logo .p{color:#ff2bd6;text-shadow:0 0 12px rgba(255,43,214,.6)}
.gx-tag{font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);white-space:nowrap}
.gx-tag.live{background:#ff2d55;border-color:#ff2d55;color:#fff}
.gx-board{--s:min(100%,300px);width:var(--s);aspect-ratio:1;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;border-radius:16px;background:rgba(0,240,255,.06);border:1px solid rgba(0,240,255,.28)}
.gx-cell{border-radius:11px;background:rgba(5,8,20,.88);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;padding:0;color:inherit;min-height:0;transition:background .15s,border-color .15s}
.gx-cell:not(:disabled){cursor:pointer}
@media (hover:hover){.gx-cell:not(:disabled):hover{border-color:rgba(0,240,255,.5)}}
.gx-cell:not(:disabled):active{background:rgba(0,240,255,.14)}
.gx-cell:focus-visible{outline:2px solid #ffd166;outline-offset:2px}
.gx-hint .gx-cell:not(:disabled){animation:gx-breathe 2.4s ease-in-out infinite}
@keyframes gx-breathe{50%{border-color:rgba(0,240,255,.35)}}
.gx-cell.gx-won{border-color:#ffd166;background:rgba(255,209,102,.14)}
.gx-mark{width:70%;height:70%;fill:none;stroke-width:11;stroke-linecap:round}
.gx-x{stroke:#00f0ff;filter:drop-shadow(0 0 5px rgba(0,240,255,.9))}.gx-o{stroke:#ff2bd6;filter:drop-shadow(0 0 5px rgba(255,43,214,.9))}
.gx-status{text-align:center;font-weight:900;font-size:14px;letter-spacing:.03em;margin:8px 0;min-height:1.3em}
.gx-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}
.gx-row.between{justify-content:space-between;align-items:center}
.gx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 14px;border-radius:12px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#031016;background:#00f0ff;border:1px solid #00f0ff;cursor:pointer}
.gx-btn:disabled{opacity:.45;cursor:default}
.gx-btn.ghost{color:inherit;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14)}
.gx-btn.live{background:#ff2d55;border-color:#ff2d55;color:#fff}
.gx-btn.bsky{background:#1185fe;border-color:#1185fe;color:#fff}
.gx-btn.pk{background:#ff2bd6;border-color:#ff2bd6;color:#16020f}
.gx-lobby{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:12px}
.gx-dot{width:8px;height:8px;border-radius:50%;background:#3dff9a;box-shadow:0 0 8px #3dff9a;flex:none}
.gx-people{display:flex;margin-left:auto}
.gx-people button{margin-left:-6px;border-radius:50%;padding:0;border:2px solid #070814;background:none;cursor:pointer;position:relative}
.gx-people button.seek::after{content:"";position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:#ffd166;border:2px solid #070814}
.gx-av{display:inline-grid;place-items:center;border-radius:50%;object-fit:cover;background:#1b2140;font-size:11px;font-weight:900;color:#9fefff}
.gx-small{font-size:11px;opacity:.65}
.gx-bad{color:#ff7b9c;opacity:1}
.gx-err{color:#ff7b9c;font-size:12px;text-align:center;margin:6px 0 0}
.gx-note{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;font-size:13px;line-height:1.5;padding:10px}
.gx-center{display:grid;place-items:center;padding:20px}
.gx-spin{animation:gx-spin 1s linear infinite}@keyframes gx-spin{to{transform:rotate(360deg)}}
.gx-seek{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px;border-radius:16px;border:1px dashed rgba(0,240,255,.35);text-align:center;margin-top:10px}
.gx-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center}
.gx-seat{display:flex;flex-direction:column;min-width:0;padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.gx-seat.right{text-align:right}.gx-seat small{font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
.gx-seat b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gx-seat em{font-style:normal;font-size:10px;opacity:.6}
.gx-seat.cy{border-color:rgba(0,240,255,.3)}.gx-seat.cy b{color:#00f0ff}.gx-seat.pk{border-color:rgba(255,43,214,.3)}.gx-seat.pk b{color:#ff2bd6}
.gx-seat.turn.cy{box-shadow:0 0 14px rgba(0,240,255,.45)}.gx-seat.turn.pk{box-shadow:0 0 14px rgba(255,43,214,.45)}
.gx-clock{font-size:11px;font-weight:900;letter-spacing:.1em;padding:5px 7px;border-radius:9px;background:rgba(255,209,102,.1);color:#ffd166;min-width:48px;text-align:center}
.gx-sheet-back{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding:16px}
@media (min-width:640px){.gx-sheet-back{align-items:center}}
.gx-sheet{width:100%;max-width:440px;max-height:90dvh;overflow:auto;border-radius:22px;padding:16px;color:#e8fbff;background:#0a0c18;border:1px solid rgba(255,255,255,.12)}
.gx-sheet-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.gx-x{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:inherit;cursor:pointer}
.gx-text{width:100%;border-radius:14px;padding:10px 12px;font-size:13px;line-height:1.45;color:inherit;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);resize:vertical;font-family:inherit}
body.gx-live-open #plajah-game-overlay{display:none}
.gx-live-float{position:fixed;left:12px;top:max(72px,env(safe-area-inset-top));z-index:5;width:min(46vw,220px);padding:8px;border-radius:16px;background:rgba(5,6,13,.78);border:1px solid rgba(0,240,255,.35);color:#e8fbff;backdrop-filter:blur(6px)}
.gx-live-float .gx-status{font-size:11px;margin:0 0 6px}
@media (prefers-reduced-motion:reduce){.gx-hint .gx-cell{animation:none}.gx-spin{animation:none}}
`;
