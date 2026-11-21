// The party dock: a floating pill (bottom-left) that follows you from game to game. Start a party or join by
// code, see who's in it (and who's talking), leader controls, party chat, party voice, and Play — the leader
// starts a friendly match with a member and both docks open it. Mounts itself into <body> on first use.
//
// Polls /party/me only while you're in a party (every 4 s open, 12 s collapsed). Invites arrive as
// notifications (`game-party:<id>` → openPartyLink → this dock with an Accept card).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Users, Copy, Check, Crown, UserMinus, LogOut, Play, Loader2, ChevronDown } from 'lucide-react';
import { GAMES } from '../../../services/gamerNet/registry';
import { party as api, failed, myUid, OPEN_PARTY_EVENT, type PartyTarget, type PartyView, type PartyPeek } from '../../../services/gamerNet/togetherClient';
import { MatchChat } from './MatchChat';
import { VoiceButton } from './VoiceButton';
import { useGameVoice } from './useGameVoice';
import { GT_CSS } from './togetherCss';

// ── opening a party match: the app opens the game overlay; labs can swap this ──
type MatchOpener = (m: { id: string; game: string }) => void;
let opener: MatchOpener = m => {
  if (m.game !== 'ttt') return;   // other games open from their own screens
  void import('../../../services/gamerNet/socialClient').then(s => s.openGameOverlay({ matchId: m.id }));
};
export function setPartyMatchOpener(fn: MatchOpener): void { opener = fn; }

let mounted = false;
let pending: { open: boolean; target?: PartyTarget } | null = null;

/** Open the dock (expanded). With `{ invite }` it shows the invite to accept. */
export function showPartyDock(target?: PartyTarget): void {
  pending = { open: true, target };
  ensurePartyDock();
  window.dispatchEvent(new CustomEvent(OPEN_PARTY_EVENT, { detail: pending }));
}

/** Mount the dock collapsed; it only shows itself if you're already in a party. */
export function ensurePartyDock(): void {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const el = document.createElement('div');
  el.id = 'plajah-party-dock';
  document.body.appendChild(el);
  createRoot(el).render(<PartyDockHost />);
}

const gameTitle = (id: string) => GAMES[id]?.title ?? (id || 'No game picked');

function Av({ name, photo }: { name: string; photo?: string }) {
  return photo ? <img className="gx-av" src={photo} alt="" width={26} height={26} style={{ width: 26, height: 26 }} />
    : <span className="gx-av" style={{ width: 26, height: 26 }}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

function PartyDockHost() {
  const [open, setOpen] = useState(() => pending?.open ?? false);
  const [invite, setInvite] = useState<string | null>(() => (pending?.target && 'invite' in pending.target ? pending.target.invite ?? null : null));
  const [p, setP] = useState<PartyView | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const openRef = useRef(open); openRef.current = open;
  const opened = useRef<string | null>(null);

  const apply = useCallback((r: { party: PartyView | null; voice: { available: boolean } }) => {
    setP(r.party); setVoiceOn(r.voice.available); setLoaded(true);
    const m = r.party?.match; const me = myUid();
    // Jump into a match the leader just started for me (once per match, only if it's fresh).
    if (m && me && m.seats.includes(me) && opened.current !== m.id && Date.now() - m.at < 10 * 60_000) {
      const seen = sessionStorage.getItem('plajah.party.lastMatch');
      opened.current = m.id;
      if (seen !== m.id) { sessionStorage.setItem('plajah.party.lastMatch', m.id); opener({ id: m.id, game: m.game }); }
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!myUid()) { setLoaded(true); return; }
    const r = await api.me(); if (!failed(r)) apply(r); else setLoaded(true);
  }, [apply]);

  useEffect(() => {
    void refresh();
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ open: boolean; target?: PartyTarget }>).detail;
      setOpen(true);
      if (d?.target && 'invite' in d.target && d.target.invite) setInvite(d.target.invite);
      void refresh();
    };
    window.addEventListener(OPEN_PARTY_EVENT, on);
    return () => window.removeEventListener(OPEN_PARTY_EVENT, on);
  }, [refresh]);

  // Poll only while in a party.
  const inParty = !!p;
  useEffect(() => {
    if (!inParty) return;
    let alive = true; let t: ReturnType<typeof setTimeout>;
    const loop = async () => { if (!alive) return; if (document.visibilityState !== 'hidden') await refresh(); if (alive) t = setTimeout(loop, openRef.current ? 4000 : 12000); };
    t = setTimeout(loop, openRef.current ? 4000 : 12000);
    return () => { alive = false; clearTimeout(t); };
  }, [inParty, refresh]);

  if (!loaded || !myUid()) return null;
  if (!open && !p && !invite) return null;

  return (
    <div className="gt-dock">
      <style>{GT_CSS}</style>
      {!open
        ? <button className="gt-pill" onClick={() => setOpen(true)} aria-label="Open party"><Users size={15} /> Party · {p?.members.length ?? 0}</button>
        : <PartyPanel p={p} voiceOn={voiceOn} invite={invite} clearInvite={() => setInvite(null)} apply={apply} close={() => setOpen(false)} />}
    </div>
  );
}

function PartyPanel({ p, voiceOn, invite, clearInvite, apply, close }: {
  p: PartyView | null; voiceOn: boolean; invite: string | null; clearInvite: () => void;
  apply: (r: { party: PartyView | null; voice: { available: boolean } }) => void; close: () => void;
}) {
  const me = myUid()!;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [peek, setPeek] = useState<PartyPeek | null>(null);
  const [playWith, setPlayWith] = useState('');
  const myName = p?.members.find(m => m.uid === me)?.name;
  const voice = useGameVoice(p ? `party_${p.id}` : null, myName);
  const leader = p?.leader === me;
  const onlineGames = Object.values(GAMES);

  useEffect(() => {
    if (!invite || p?.id === invite) { setPeek(null); return; }
    let alive = true;
    void api.peek(invite).then(r => { if (!alive) return; if (failed(r)) { setErr(r.error); clearInvite(); } else setPeek(r); });
    return () => { alive = false; };
  }, [invite, p?.id, clearInvite]);

  const run = async <T extends { party: PartyView | null; voice: { available: boolean } }>(f: () => Promise<({ ok: true } & T) | { ok: false; error: string }>) => {
    setBusy(true); setErr('');
    const r = await f(); setBusy(false);
    if (r.ok === false) { setErr(r.error); return null; }
    apply(r as T); return r as T;
  };

  const copy = async () => {
    if (!p) return;
    try { await navigator.clipboard.writeText(p.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setErr(`Code: ${p.code}`); }
  };

  return (
    <div className="gt-panel" role="dialog" aria-label="Party">
      <div className="gt-ph">
        <Users size={16} /><b>Party</b>{p && <span className="gx-small">{p.members.length}/8</span>}
        <button className="gt-x" onClick={close} aria-label="Collapse party"><ChevronDown size={18} /></button>
      </div>

      {peek && invite && (
        <div className="gt-invite">
          <div style={{ marginBottom: 6 }}><b>{peek.party.members.find(m => m.uid === peek.party.leader)?.name ?? 'Someone'}</b>’s party invited you
            {peek.party.game ? <> · {gameTitle(peek.party.game)}</> : null}</div>
          <div className="gt-row" style={{ marginTop: 0 }}>{peek.party.members.slice(0, 6).map(m => <Av key={m.uid} name={m.name} photo={m.photo} />)}</div>
          <div className="gt-row">
            <button className="gx-btn" disabled={busy} onClick={async () => { if (await run(() => api.acceptInvite(invite))) clearInvite(); }}>{p ? 'Switch to this party' : 'Join party'}</button>
            <button className="gx-btn ghost" onClick={clearInvite}>Not now</button>
          </div>
        </div>
      )}

      {!p ? (
        <>
          <p className="gx-small" style={{ margin: '0 0 8px' }}>Play with friends from game to game — one chat, one voice room, and the leader starts the matches.</p>
          <button className="gx-btn" style={{ width: '100%' }} disabled={busy} onClick={() => void run(() => api.create())}>{busy ? <Loader2 size={14} className="gx-spin" /> : <Users size={14} />} Start a party</button>
          <form className="gt-row" onSubmit={e => { e.preventDefault(); void run(() => api.joinCode(code)); }}>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="Party code" aria-label="Party code" style={{ textTransform: 'uppercase', letterSpacing: '.2em' }} />
            <button className="gx-btn ghost" disabled={busy || code.trim().length !== 6}>Join</button>
          </form>
        </>
      ) : (
        <>
          <div className="gt-code">Code <strong>{p.code}</strong>
            <button className="gx-btn ghost" style={{ minHeight: 30 }} onClick={() => void copy()} aria-label="Copy party code">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
          </div>

          <div className="gt-members">
            {p.members.map(m => (
              <div key={m.uid} className={`gt-mem${voice.speakers.includes(m.uid) ? ' speaking' : ''}`}>
                <Av name={m.name} photo={m.photo} />
                <span className="gt-name">{m.uid === me ? `${m.name} (you)` : m.name}</span>
                {m.uid === p.leader && <small title="Leader"><Crown size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> lead</small>}
                {m.isChild && <small>quick chat</small>}
                {leader && m.uid !== me && <>
                  <button title={`Make ${m.name} leader`} aria-label={`Make ${m.name} leader`} onClick={() => void run(() => api.promote(m.uid))}><Crown size={13} /></button>
                  <button title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`} onClick={() => { if (window.confirm(`Remove ${m.name} from the party?`)) void run(() => api.kick(m.uid)); }}><UserMinus size={13} /></button>
                </>}
              </div>
            ))}
          </div>

          <div className="gt-row" style={{ marginTop: 0 }}>
            {voiceOn ? <VoiceButton voice={voice} label="Party voice" /> : <span className="gt-vnote">Voice is off right now</span>}
          </div>

          <div className="gt-sec">Game</div>
          {leader ? (
            <div className="gt-row">
              <select value={p.game} onChange={e => void run(() => api.setGame(e.target.value))} aria-label="Party game">
                <option value="">Pick a game…</option>
                {onlineGames.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
          ) : <div className="gx-small" style={{ marginTop: 6 }}>{gameTitle(p.game)} — the leader starts matches</div>}

          {leader && GAMES[p.game] && p.members.length > 1 && (
            <div className="gt-row">
              <select value={playWith} onChange={e => setPlayWith(e.target.value)} aria-label="Play against">
                <option value="">Play against…</option>
                {p.members.filter(m => m.uid !== me).map(m => <option key={m.uid} value={m.uid}>{m.name}</option>)}
              </select>
              <button className="gx-btn" disabled={busy || !playWith} onClick={async () => {
                const r = await run(() => api.play(p.game, playWith));
                if (r && 'matchId' in r) opener({ id: (r as any).matchId, game: p.game });
              }}><Play size={14} /> Play</button>
            </div>
          )}
          {p.match && p.match.seats.includes(me) && (
            <div className="gt-row"><button className="gx-btn ghost" onClick={() => opener({ id: p.match!.id, game: p.match!.game })}>Open {gameTitle(p.match.game)} match</button></div>
          )}

          <MatchChat scope={`party_${p.id}`} title="Party chat" />

          <div className="gt-row" style={{ justifyContent: 'flex-end' }}>
            <button className="gx-btn ghost" disabled={busy} onClick={() => { if (window.confirm('Leave the party?')) { voice.leave(); void run(() => api.leave()); } }}><LogOut size={14} /> Leave</button>
          </div>
        </>
      )}
      {err && <p className="gx-err" role="alert">{err}</p>}
    </div>
  );
}
