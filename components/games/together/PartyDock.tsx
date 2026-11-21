// The party dock: a floating pill (bottom-left) that follows you from game to game. Start a party or join by
// code, see who's in it (and who's talking), leader controls, team channels, party chat, party/team voice,
// Play (leader starts a friendly match with a member), party search (everyone queues for the same game), and
// party voice on a live stream for the members who agree. Mounts itself into <body> on first use.
//
// Voice, the party search and the stream mix live in the host, so collapsing the dock never drops them.
// Polls /party/me only while you're in a party: 4 s open, 12 s collapsed, 3 s while a stream mix is live (so a
// member who takes back consent is off the stream within seconds). Invites arrive as notifications
// (`game-party:<id>` → openPartyLink → this dock with an Accept card).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Users, Copy, Check, Crown, UserMinus, LogOut, Play, Loader2, ChevronDown, Search, Radio } from 'lucide-react';
import { GAMES } from '../../../services/gamerNet/registry';
import { party as api, failed, myUid, OPEN_PARTY_EVENT, type PartyTarget, type PartyView, type PartyPeek } from '../../../services/gamerNet/togetherClient';
import { gamer, failed as gFailed } from '../../../services/gamerNet/client';
import { setPartyStreamTrack, type PartyStreamMixer } from '../../../services/gamerNet/partyStreamBus';
import { MatchChat } from './MatchChat';
import { VoiceButton } from './VoiceButton';
import { useGameVoice, type GameVoice } from './useGameVoice';
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
const TEAM = ['A', 'B'] as const;
type Room = 'party' | 0 | 1;
type Search = { game: string; state: 'searching' | 'matched' | 'stopped' | 'error'; msg?: string } | null;

function Av({ name, photo }: { name: string; photo?: string }) {
  return photo ? <img className="gx-av" src={photo} alt="" width={26} height={26} style={{ width: 26, height: 26 }} />
    : <span className="gx-av" style={{ width: 26, height: 26 }}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

/** Follow the leader's party search: queue for the game, poll, and open the match. */
function usePartySearch(p: PartyView | null): { search: Search; stopMine: () => void } {
  const [search, setSearch] = useState<Search>(null);
  const handled = useRef<string | null>(null);
  const token = useRef(0);
  const q = p?.queue ?? null;

  const stopMine = useCallback(() => {
    token.current++;
    setSearch(s => { if (s?.state === 'searching') void gamer.leaveQueue(s.game); return s ? { ...s, state: 'stopped' } : s; });
  }, []);

  useEffect(() => {
    if (!q) { if (handled.current) { token.current++; setSearch(s => { if (s?.state === 'searching') void gamer.leaveQueue(s.game); return null; }); handled.current = null; } return; }
    if (handled.current === q.id || Date.now() - q.at > 10 * 60_000) return;
    handled.current = q.id;
    const mine = ++token.current;
    setSearch({ game: q.game, state: 'searching' });
    void (async () => {
      const first = await gamer.queue(q.game);
      if (gFailed(first)) { setSearch({ game: q.game, state: 'error', msg: first.error }); return; }
      let matchId = first.status === 'matched' ? first.matchId : undefined;
      while (!matchId && token.current === mine) {
        await new Promise(r => setTimeout(r, 2000));
        if (token.current !== mine) return;
        const r = await gamer.pollQueue(q.game);
        if (!gFailed(r) && r.status === 'matched') matchId = r.matchId;
        if (!gFailed(r) && r.status === 'idle') { setSearch({ game: q.game, state: 'stopped' }); return; }
      }
      if (matchId && token.current === mine) { setSearch({ game: q.game, state: 'matched' }); opener({ id: matchId, game: q.game }); }
    })();
  }, [q?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { token.current++; }, []);
  return { search, stopMine };
}

/** When I'm the party's streamer, mix the voices of the members who agreed and offer that track to the streamer. */
function usePartyStreamMix(p: PartyView | null, voice: GameVoice): number {
  const me = myUid();
  const mixer = useRef<PartyStreamMixer | null>(null);
  const [count, setCount] = useState(0);
  const active = !!p && p.streaming?.uid === me && voice.status === 'on';
  const ok = (p?.streamOk ?? []).join(',');

  useEffect(() => {
    if (!active) { mixer.current?.dispose(); mixer.current = null; setPartyStreamTrack(null); setCount(0); return; }
    let alive = true;
    void (async () => {
      if (!mixer.current) { const { PartyStreamMixer } = await import('../../../services/gamerNet/partyStreamBus'); if (!alive) return; mixer.current = new PartyStreamMixer(); }
      const agreed = new Set(ok ? ok.split(',') : []);
      const voices = new Map([...voice.streams].filter(([uid]) => agreed.has(uid)));
      mixer.current.setVoices(voices);
      setCount(mixer.current.count);
      setPartyStreamTrack(mixer.current.track);
    })();
    return () => { alive = false; };
  }, [active, ok, voice.streams]);

  useEffect(() => () => { mixer.current?.dispose(); mixer.current = null; setPartyStreamTrack(null); }, []);
  return count;
}

function PartyDockHost() {
  const [open, setOpen] = useState(() => pending?.open ?? false);
  const [invite, setInvite] = useState<string | null>(() => (pending?.target && 'invite' in pending.target ? pending.target.invite ?? null : null));
  const [p, setP] = useState<PartyView | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [room, setRoom] = useState<Room>('party');
  const openRef = useRef(open); openRef.current = open;
  const opened = useRef<string | null>(null);
  const me = myUid();

  const apply = useCallback((r: { party: PartyView | null; voice: { available: boolean } }) => {
    setP(r.party); setVoiceOn(r.voice.available); setLoaded(true);
    const m = r.party?.match; const uid = myUid();
    // Jump into a match the leader just started for me (once per match, only if it's fresh).
    if (m && uid && m.seats.includes(uid) && opened.current !== m.id && Date.now() - m.at < 10 * 60_000) {
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

  // Voice: party room, or my team's room. Leaving a team drops me back to party voice.
  const myTeam = p && me && p.teams && p.teams[me] !== undefined ? p.teams[me] : null;
  useEffect(() => { if (room !== 'party' && myTeam !== room) setRoom('party'); }, [myTeam, room]);
  const myName = p?.members.find(m => m.uid === me)?.name;
  const voice = useGameVoice(p ? (room === 'party' ? `party_${p.id}` : `team_${p.id}_${room}`) : null, myName);
  const { search, stopMine } = usePartySearch(p);
  const mixed = usePartyStreamMix(p, voice);

  // Poll only while in a party (faster while a stream mix is live, so consent changes land quickly).
  const inParty = !!p;
  const streamingLive = !!p?.streaming;
  useEffect(() => {
    if (!inParty) return;
    let alive = true; let t: ReturnType<typeof setTimeout>;
    const every = () => (streamingLive ? 3000 : openRef.current ? 4000 : 12000);
    const loop = async () => { if (!alive) return; if (document.visibilityState !== 'hidden' || streamingLive) await refresh(); if (alive) t = setTimeout(loop, every()); };
    t = setTimeout(loop, every());
    return () => { alive = false; clearTimeout(t); };
  }, [inParty, streamingLive, refresh]);

  // Left the party: voice goes too.
  useEffect(() => { if (!p) voice.leave(); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded || !me) return null;
  if (!open && !p && !invite) return null;

  return (
    <div className="gt-dock">
      <style>{GT_CSS}</style>
      {!open
        ? <button className="gt-pill" onClick={() => setOpen(true)} aria-label="Open party">
            <Users size={15} /> Party · {p?.members.length ?? 0}
            {voice.status === 'on' && <span className="gt-livedot" title="Voice on" />}
            {search?.state === 'searching' && <Search size={13} aria-label="Searching" />}
          </button>
        : <PartyPanel p={p} voiceOn={voiceOn} invite={invite} clearInvite={() => setInvite(null)} apply={apply} close={() => setOpen(false)}
            voice={voice} room={room} setRoom={setRoom} myTeam={myTeam} search={search} stopMine={stopMine} mixed={mixed} />}
    </div>
  );
}

function PartyPanel({ p, voiceOn, invite, clearInvite, apply, close, voice, room, setRoom, myTeam, search, stopMine, mixed }: {
  p: PartyView | null; voiceOn: boolean; invite: string | null; clearInvite: () => void;
  apply: (r: { party: PartyView | null; voice: { available: boolean } }) => void; close: () => void;
  voice: GameVoice; room: Room; setRoom: (r: Room) => void; myTeam: 0 | 1 | null; search: Search; stopMine: () => void; mixed: number;
}) {
  const me = myUid()!;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [peek, setPeek] = useState<PartyPeek | null>(null);
  const [playWith, setPlayWith] = useState('');
  const leader = p?.leader === me;
  const meMember = p?.members.find(m => m.uid === me);
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

  const teamOf = (uid: string): 0 | 1 | null => (p?.teams && p.teams[uid] !== undefined ? p.teams[uid] : null);
  const nextTeam = (t: 0 | 1 | null): 0 | 1 | null => (t === null ? 0 : t === 0 ? 1 : null);
  const streamer = p?.streaming ? p.members.find(m => m.uid === p.streaming!.uid) : null;
  const iAgreed = !!p?.streamOk?.includes(me);

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
            {p.members.map(m => {
              const t = teamOf(m.uid);
              const canMove = m.uid === me || leader;
              return (
                <div key={m.uid} className={`gt-mem${voice.speakers.includes(m.uid) ? ' speaking' : ''}`}>
                  <Av name={m.name} photo={m.photo} />
                  <span className="gt-name">{m.uid === me ? `${m.name} (you)` : m.name}</span>
                  {m.uid === p.leader && <small title="Leader"><Crown size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> lead</small>}
                  {m.isChild && <small>quick chat</small>}
                  {p.streaming?.uid === m.uid && <small className="gt-onair">on air</small>}
                  <button className={`gt-team ${t === null ? 'none' : `t${t}`}`} disabled={!canMove}
                    title={canMove ? 'Team: none → A → B' : t === null ? 'No team' : `Team ${TEAM[t]}`}
                    aria-label={`${m.name}: ${t === null ? 'no team' : `Team ${TEAM[t]}`}${canMove ? ' — change' : ''}`}
                    onClick={() => void run(() => api.setTeam(nextTeam(t), m.uid === me ? undefined : m.uid))}>
                    {t === null ? '–' : TEAM[t]}
                  </button>
                  {leader && m.uid !== me && <>
                    <button title={`Make ${m.name} leader`} aria-label={`Make ${m.name} leader`} onClick={() => void run(() => api.promote(m.uid))}><Crown size={13} /></button>
                    <button title={`Remove ${m.name}`} aria-label={`Remove ${m.name}`} onClick={() => { if (window.confirm(`Remove ${m.name} from the party?`)) void run(() => api.kick(m.uid)); }}><UserMinus size={13} /></button>
                  </>}
                </div>
              );
            })}
          </div>

          <div className="gt-row" style={{ marginTop: 0 }}>
            {voiceOn ? <>
              {myTeam !== null && (
                <select value={String(room)} onChange={e => setRoom(e.target.value === 'party' ? 'party' : (Number(e.target.value) as 0 | 1))} aria-label="Voice room" style={{ flex: '0 0 auto', maxWidth: 130 }}>
                  <option value="party">Party voice</option>
                  <option value={String(myTeam)}>Team {TEAM[myTeam]} voice</option>
                </select>
              )}
              <VoiceButton voice={voice} label={room === 'party' ? 'Party voice' : `Team ${TEAM[room]} voice`} />
            </> : <span className="gt-vnote">Voice is off right now</span>}
          </div>

          {/* party voice on a live stream — only the members who agree are heard */}
          {voiceOn && meMember && !meMember.isChild && (
            p.streaming?.uid === me ? (
              <div className="gt-stream">
                <Radio size={14} /> <span>Party voice is offered to your stream · <b>{mixed}</b> of {Math.max(0, p.members.length - 1)} agreed{voice.status !== 'on' ? ' (join voice first)' : ''}</span>
                <button className="gx-btn ghost" disabled={busy} onClick={() => void run(() => api.stream(false))}>Stop</button>
                <small>It plays under your mic when you’re live (Go Live → Sound). Only people who tap “OK” are heard.</small>
              </div>
            ) : streamer ? (
              <div className="gt-stream">
                <Radio size={14} /> <span><b>{streamer.name}</b> is putting party voice on their stream. {iAgreed ? 'You can be heard on it.' : 'You are not on it.'}</span>
                <button className={`gx-btn${iAgreed ? ' ghost' : ''}`} disabled={busy} onClick={() => void run(() => api.streamConsent(!iAgreed))}>{iAgreed ? 'Take me off' : 'OK, include me'}</button>
              </div>
            ) : (
              <div className="gt-row"><button className="gx-btn ghost" disabled={busy} onClick={() => void run(() => api.stream(true))}><Radio size={14} /> Put party voice on my stream</button></div>
            )
          )}

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
          {leader && GAMES[p.game] && (
            <div className="gt-row">
              {p.queue
                ? <button className="gx-btn ghost" disabled={busy} onClick={() => void run(() => api.stopQueue())}>Stop party search</button>
                : <button className="gx-btn ghost" disabled={busy} onClick={() => void run(() => api.queue(p.game))}><Search size={14} /> Find matches for everyone</button>}
            </div>
          )}
          {search && (
            <div className="gt-row gx-small">
              {search.state === 'searching' && <><Loader2 size={13} className="gx-spin" /> Looking for a {gameTitle(search.game)} opponent… <button className="gx-btn ghost" style={{ minHeight: 28 }} onClick={stopMine}>Stop my search</button></>}
              {search.state === 'matched' && <>Matched — your {gameTitle(search.game)} game is open.</>}
              {search.state === 'stopped' && <>You left the party search.</>}
              {search.state === 'error' && <span className="gx-bad">{search.msg}</span>}
            </div>
          )}
          {p.match && p.match.seats.includes(me) && (
            <div className="gt-row"><button className="gx-btn ghost" onClick={() => opener({ id: p.match!.id, game: p.match!.game })}>Open {gameTitle(p.match.game)} match</button></div>
          )}

          <MatchChat scope={`party_${p.id}`} title="Party chat" />
          {myTeam !== null && <MatchChat scope={`team_${p.id}_${myTeam}`} title={`Team ${TEAM[myTeam]} chat`} startOpen={false} />}

          <div className="gt-row" style={{ justifyContent: 'flex-end' }}>
            <button className="gx-btn ghost" disabled={busy} onClick={() => { if (window.confirm('Leave the party?')) { voice.leave(); void run(() => api.leave()); } }}><LogOut size={14} /> Leave</button>
          </div>
        </>
      )}
      {err && <p className="gx-err" role="alert">{err}</p>}
    </div>
  );
}
