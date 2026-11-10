// The game overlay: a challenge or a match opened from anywhere that isn't a feed card — a notification
// (`game-challenge:<id>`, `game-match:<id>`), a profile's Challenge button, or a chat. It mounts itself into <body>
// on first use (ensureGameOverlay) and listens for OPEN_GAME_EVENT, so no screen has to host it.

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Swords, Check, X, Loader2 } from 'lucide-react';
import { gameRules } from '../../../services/gamerNet/registry';
import { effectiveStatus, type ChallengeDoc, type ChallengeSource } from '../../../services/gamerNet/social';
import { failed } from '../../../services/gamerNet/client';
import { gamerSocial, postChallenge, OPEN_GAME_EVENT, type OverlayTarget } from '../../../services/gamerNet/socialClient';
import { auth } from '../../../services/firebase';
import { MatchPanel, Avatar, GX_CSS } from './GameParts';

let mounted = false;
let pending: OverlayTarget | null = null;

/** Show a challenge or match. Safe on first use: a host that mounts after this call still picks it up. */
export function showGameOverlay(target: OverlayTarget): void {
  pending = target;
  ensureGameOverlay();
  window.dispatchEvent(new CustomEvent(OPEN_GAME_EVENT, { detail: target }));
}

export function ensureGameOverlay(): void {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const el = document.createElement('div');
  el.id = 'plajah-game-overlay';
  document.body.appendChild(el);
  createRoot(el).render(<GameOverlayHost />);
}

function GameOverlayHost() {
  const [target, setTarget] = useState<OverlayTarget | null>(() => pending);
  useEffect(() => {
    if (pending) setTarget(pending);
    const on = (e: Event) => setTarget((e as CustomEvent<OverlayTarget>).detail ?? null);
    window.addEventListener(OPEN_GAME_EVENT, on);
    return () => window.removeEventListener(OPEN_GAME_EVENT, on);
  }, []);
  if (!target) return null;
  return (
    <div className="gx-sheet-back" onClick={() => setTarget(null)}>
      <style>{GX_CSS}</style>
      <div className="gx-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Game">
        <Body key={JSON.stringify(target)} target={target} close={() => setTarget(null)} />
      </div>
    </div>
  );
}

function Header({ title, close }: { title: string; close: () => void }) {
  return <div className="gx-sheet-h"><b><Swords size={15} style={{ display: 'inline', verticalAlign: '-2px' }} /> {title}</b><button className="gx-x" onClick={close} aria-label="Close"><X size={16} /></button></div>;
}

function Body({ target, close }: { target: OverlayTarget; close: () => void }) {
  const [matchId, setMatchId] = useState<string | null>('matchId' in target ? target.matchId : null);
  const [challenge, setChallenge] = useState<ChallengeDoc | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>('challengeId' in target ? target.challengeId : null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [alsoPost, setAlsoPost] = useState(true);
  const me = auth.currentUser?.uid ?? null;
  const game = 'ttt';

  // follow a challenge until it turns into a match
  useEffect(() => {
    if (!challengeId || matchId) return;
    let alive = true;
    const poll = async () => {
      const r = await gamerSocial.getChallenge(challengeId);
      if (!alive) return;
      if (failed(r)) { setErr(r.error); return; }
      setChallenge(r.challenge);
      if (r.challenge.status === 'accepted' && r.challenge.matchId) setMatchId(r.challenge.matchId);
    };
    void poll();
    const h = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(h); };
  }, [challengeId, matchId]);

  if (!me) return <><Header title="Plajah Games" close={close} /><p className="gx-note">Sign in to play.</p></>;

  if (matchId) return <><Header title={gameRules(challenge?.game ?? game)?.title ?? 'Match'} close={close} /><MatchPanel matchId={matchId} onNext={setMatchId} /></>;

  // a new challenge from a profile / chat
  if ('challengeTo' in target && !challengeId) {
    const { uid, name, source } = target.challengeTo as { uid: string; name: string; source: ChallengeSource };
    const send = async () => {
      setBusy(true); setErr('');
      const r = await gamerSocial.challenge(game, uid, source);
      setBusy(false);
      if (failed(r)) { setErr(r.error); return; }
      setChallenge(r.challenge); setChallengeId(r.challenge.id);
      if (alsoPost) void postChallenge(game, r.challenge.id, uid, name);
    };
    return (
      <>
        <Header title="Send a challenge" close={close} />
        <div className="gx-note">
          <Avatar name={name} size={48} />
          <span>Challenge <b>{name}</b> to <b>{gameRules(game)?.title}</b>? They get a notification and accept right there.</span>
          <label className="gx-small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={alsoPost} onChange={e => setAlsoPost(e.target.checked)} /> Also post it to my timeline</label>
          <button className="gx-btn pk" disabled={busy} onClick={send}>{busy ? <Loader2 size={14} className="gx-spin" /> : <><Swords size={14} /> Send challenge</>}</button>
          {err && <p className="gx-err">{err}</p>}
        </div>
      </>
    );
  }

  if (!challenge) return <><Header title="Challenge" close={close} />{err ? <p className="gx-err">{err}</p> : <div className="gx-center"><Loader2 className="gx-spin" size={20} /></div>}</>;

  const status = effectiveStatus(challenge, Date.now());
  const forMe = challenge.to === me;
  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    setBusy(true); setErr('');
    const r = await gamerSocial.respond(challenge.id, action);
    setBusy(false);
    if (failed(r)) { setErr(r.error); return; }
    setChallenge(r.challenge);
    if (r.matchId) setMatchId(r.matchId);
    if (action !== 'accept') setTimeout(close, 900);
  };
  return (
    <>
      <Header title={gameRules(challenge.game)?.title ?? 'Challenge'} close={close} />
      <div className="gx-note">
        <Avatar name={forMe ? challenge.fromName : challenge.toName} photo={forMe ? challenge.fromPhoto : undefined} size={48} />
        {forMe ? <span><b>{challenge.fromName}</b> challenged you.</span> : <span>Waiting for <b>{challenge.toName}</b> to accept…</span>}
        {status === 'pending' ? (
          forMe ? (
            <div className="gx-row">
              <button className="gx-btn" disabled={busy} onClick={() => respond('accept')}><Check size={14} /> Accept &amp; play</button>
              <button className="gx-btn ghost" disabled={busy} onClick={() => respond('decline')}><X size={14} /> Decline</button>
            </div>
          ) : (
            <div className="gx-row"><Loader2 className="gx-spin" size={16} /><button className="gx-btn ghost" disabled={busy} onClick={() => respond('cancel')}>Cancel</button></div>
          )
        ) : <span className="gx-small">This challenge was {status}.</span>}
        {err && <p className="gx-err">{err}</p>}
      </div>
    </>
  );
}
