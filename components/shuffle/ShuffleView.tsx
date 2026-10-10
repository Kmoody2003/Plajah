/**
 * Shuffle — Omegle-style random 1:1 video, built on Rooms' real-time engine (rtcCore 'mesh').
 * Opened anywhere with `window.dispatchEvent(new CustomEvent('plajah:open-shuffle'))`.
 *
 * Safety (see services/shuffle/shuffleCore.ts): 18+ gate with a locked DOB, house rules agreed up
 * front, the stranger's video is BLURRED until both of you tap Reveal, one-tap Report (ends the call,
 * blocks the person on Plajah, files to Trust & Safety, never matched again), Next any time.
 * Plajah does not record Shuffle calls.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Shuffle as ShuffleIcon, SkipForward, Flag, Eye, EyeOff, Mic, MicOff, Video, VideoOff, Send, Loader2, ShieldCheck, Hash } from 'lucide-react';
import { auth } from '../../services/firebase';
import { useRtcSession } from '../../hooks/useRtcSession';
import { shuffleApi } from '../../services/shuffle/shuffleClient';
import { normalizeInterests, REPORT_REASONS, type Eligibility, type MatchInfo, type ShuffleReportReason } from '../../services/shuffle/shuffleCore';
import { blockUser } from '../../services/socialSafetyService';
import { CallControlBar, ReactionBar, ReactionFloats, useReactions } from '../call/CallControls';

type Phase = 'checking' | 'gate' | 'lobby' | 'searching' | 'connecting' | 'live' | 'ended' | 'blocked';

const REPORT_LABEL: Record<ShuffleReportReason, string> = {
  nudity_sexual: 'Nudity or sexual content',
  minor: 'Looks under 18',
  harassment_hate: 'Harassment or hate',
  violence_threat: 'Violence or threats',
  spam_scam: 'Spam or scam',
  other: 'Something else',
};
const CONNECT_TIMEOUT_MS = 15_000;
const POLL_MS = 1500;

// Hoisted: defined inside the view it would remount every render (inputs lose focus, videos reset).
function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
  <div className="fixed inset-0 z-[9998] bg-black text-white flex flex-col" role="dialog" aria-label="Shuffle">
    <div className="flex items-center justify-between px-4 h-14 shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center gap-2"><ShuffleIcon size={18} className="text-small-orange" /><span className="text-sm font-black tracking-tight">Shuffle</span><span className="text-[9px] font-black uppercase tracking-widest text-white/40 border border-white/15 rounded-full px-1.5 py-0.5">18+</span></div>
      <button onClick={onClose} aria-label="Close Shuffle" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><X size={16} /></button>
    </div>
    {children}
  </div>
  );
}

export default function ShuffleView({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [notice, setNotice] = useState('');
  const [dob, setDob] = useState('');
  const [agree, setAgree] = useState(false);
  const [interestText, setInterestText] = useState('');
  const [interests, setInterests] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pj_shuffle_interests') || '[]'); } catch { return []; } });
  const [interestsOnly, setInterestsOnly] = useState(false);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [iRevealed, setIRevealed] = useState(false);
  const [peerRevealed, setPeerRevealed] = useState(false);
  const [chat, setChat] = useState<Array<{ me: boolean; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const selfRef = useRef<HTMLVideoElement>(null);
  const searchingRef = useRef(false);
  const matchRef = useRef<MatchInfo | null>(null);
  matchRef.current = match;
  const sawPeerRef = useRef(false);

  // ── eligibility ──
  useEffect(() => {
    if (!auth.currentUser) { setElig({ ok: false, code: 'SIGN_IN', message: 'Sign in to use Shuffle.' }); setPhase('blocked'); return; }
    shuffleApi.eligibility().then(e => {
      setElig(e);
      setPhase(e.ok ? 'lobby' : e.needsDob ? 'gate' : 'blocked');
    }).catch(err => { setElig({ ok: false, code: 'ERROR', message: err?.message || 'Shuffle is unavailable right now.' }); setPhase('blocked'); });
  }, []);

  const submitGate = async () => {
    if (!dob || !agree) return;
    setBusy(true);
    try {
      const e = await shuffleApi.attest(dob);
      setElig(e);
      setPhase(e.ok ? 'lobby' : 'blocked');
    } catch (err: any) { setNotice(err?.message || 'Could not save that.'); }
    finally { setBusy(false); }
  };

  // ── media session for the current match only ──
  const addFloatRef = useRef<(emoji: string) => void>(() => {});
  const allowed = useMemo(() => (match ? [match.peerUid] : []), [match]);
  const onData = useCallback((_peer: string, msg: { type: string; payload?: any }) => {
    if (msg.type === 'shuffle:reveal') setPeerRevealed(!!msg.payload?.on);
    else if (msg.type === 'reaction' && typeof msg.payload?.emoji === 'string') addFloatRef.current(msg.payload.emoji);
    else if (msg.type === 'shuffle:chat' && typeof msg.payload?.text === 'string') setChat(c => [...c, { me: false, text: String(msg.payload.text).slice(0, 500) }].slice(-60));
  }, []);
  const rtc = useRtcSession(match ? {
    sessionId: match.sessionId,
    topology: 'mesh',
    role: 'participant',
    media: { audio: true, video: { facingMode: 'user' } },   // echo cancellation ON — it's a 2-way call
    displayName: auth.currentUser?.displayName || 'Someone',
  } : null, { autoJoin: true, onData, allowedPeerIds: allowed });

  // Same reactions + controls as Plajah meetings (components/call/CallControls).
  const { floats, addFloat, react } = useReactions(rtc);
  addFloatRef.current = addFloat;
  const peer = rtc.remotePeers.find(p => p.peerId === match?.peerUid) || null;
  useEffect(() => { if (selfRef.current) selfRef.current.srcObject = rtc.localStream; }, [rtc.localStream, phase]);
  useEffect(() => {
    if (remoteRef.current && peer?.stream && remoteRef.current.srcObject !== peer.stream) remoteRef.current.srcObject = peer.stream;
    if (peer && match) { sawPeerRef.current = true; setPhase(p => (p === 'connecting' ? 'live' : p)); }
  }, [peer, match]);

  // The stranger left (their peer vanished after connecting) → end screen, then auto-next.
  useEffect(() => {
    if (phase === 'live' && match && sawPeerRef.current && !peer) {
      const t = setTimeout(() => { if (matchRef.current === match) finish('left', 'They left the chat.'); }, 2500);
      return () => clearTimeout(t);
    }
  }, [phase, peer, match]); // eslint-disable-line react-hooks/exhaustive-deps
  // Never connected (NAT / they closed the tab) → move on.
  useEffect(() => {
    if (phase !== 'connecting' || !match) return;
    const t = setTimeout(() => { if (matchRef.current === match && !sawPeerRef.current) finish('left', "Couldn't connect — finding someone else."); }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, match]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── matchmaking ──
  const adopt = (m: MatchInfo) => {
    searchingRef.current = false;
    sawPeerRef.current = false;
    setIRevealed(false); setPeerRevealed(false); setChat([]); setReportOpen(false); setNotice('');
    setMatch(m);
    setPhase('connecting');
  };
  const search = async () => {
    setNotice('');
    const tags = normalizeInterests(interests);
    try { localStorage.setItem('pj_shuffle_interests', JSON.stringify(tags)); } catch { /* */ }
    searchingRef.current = true;
    setPhase('searching');
    try {
      const r = await shuffleApi.join({ interests: tags, interestsOnly });
      if (r.status === 'matched') return adopt(r.match);
      if (r.status === 'ineligible') { searchingRef.current = false; setElig(r.eligibility); setPhase('blocked'); return; }
      if (r.status === 'slow_down') { searchingRef.current = false; setNotice(r.message); setPhase('lobby'); return; }
      let n = 0;
      while (searchingRef.current) {
        await new Promise(res => setTimeout(res, POLL_MS));
        if (!searchingRef.current) break;
        const p = await shuffleApi.poll(++n % 3 === 0);     // scan for a partner every ~4.5 s
        if (p.status === 'matched') return adopt(p.match);
        if (p.status === 'idle') { const again = await shuffleApi.join({ interests: tags, interestsOnly }); if (again.status === 'matched') return adopt(again.match); }
      }
    } catch (e: any) {
      searchingRef.current = false;
      setNotice(e?.message || 'Shuffle is unavailable right now.');
      setPhase('lobby');
    }
  };
  const stopSearching = () => { searchingRef.current = false; shuffleApi.leave(); setPhase('lobby'); };

  /** End the current match. `next` = straight into the next search. */
  const finish = async (reason: 'next' | 'left' | 'report', msg = '', report?: ShuffleReportReason) => {
    const m = matchRef.current;
    setMatch(null);
    rtc.leave();
    if (m) await shuffleApi.end(m.matchId, reason, report ? { reportReason: report } : undefined);
    if (reason === 'report') {
      if (m) blockUser(m.peerUid).catch(() => {});
      setNotice('Thanks — they were reported to Trust & Safety, blocked, and you will never be matched again.');
      setPhase('ended');
      return;
    }
    if (msg) setNotice(msg);
    if (reason === 'next' || reason === 'left') search();
  };

  useEffect(() => () => { searchingRef.current = false; shuffleApi.leave(); const m = matchRef.current; if (m) shuffleApi.end(m.matchId, 'left'); }, []);

  /** Leave Shuffle's call back to the lobby (Next goes straight to someone new instead). */
  const leaveCall = () => {
    const m = matchRef.current;
    setMatch(null); rtc.leave();
    if (m) shuffleApi.end(m.matchId, 'left');
    setPhase('lobby');
  };
  const toggleReveal = () => { const on = !iRevealed; setIRevealed(on); rtc.sendData('shuffle:reveal', { on }); };
  const sendChat = () => {
    const text = chatInput.trim().slice(0, 500);
    if (!text) return;
    rtc.sendData('shuffle:chat', { text });
    setChat(c => [...c, { me: true, text }].slice(-60));
    setChatInput('');
  };
  const addInterest = () => {
    const next = normalizeInterests([...interests, ...interestText.split(',')]);
    setInterests(next); setInterestText('');
  };
  const bothRevealed = iRevealed && peerRevealed;

  // ── render ──
  if (phase === 'checking') return <Shell onClose={onClose}><div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-white/50" /></div></Shell>;

  if (phase === 'blocked') return (
    <Shell onClose={onClose}>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
        <ShieldCheck size={32} className="text-white/40" />
        <p className="text-base font-black">{elig?.code === 'UNDER_18' ? 'Shuffle is for adults' : 'Shuffle isn’t available'}</p>
        <p className="text-sm text-white/60 max-w-sm">{elig?.message || notice}</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 rounded-full bg-white text-black text-xs font-black uppercase">Back</button>
      </div>
    </Shell>
  );

  if (phase === 'gate') return (
    <Shell onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-md mx-auto w-full">
        <h2 className="text-xl font-black mb-1">Meet someone new</h2>
        <p className="text-sm text-white/60 mb-5">Random one-on-one video with another adult on Plajah. Skip anyone, any time.</p>
        <label className="block text-[10px] font-black uppercase tracking-widest text-white/50 mb-1" htmlFor="shuffle-dob">Your date of birth</label>
        <input id="shuffle-dob" type="date" value={dob} onChange={e => setDob(e.target.value)} className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm mb-1" />
        <p className="text-[10px] text-white/40 mb-5">You can only set this once. Shuffle is 18+.</p>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-4 space-y-2 text-[12px] text-white/75">
          <p className="font-black text-white text-[11px] uppercase tracking-widest">House rules</p>
          <p>• No nudity or sexual content. No one under 18 — ever.</p>
          <p>• No harassment, hate, threats, or scams.</p>
          <p>• Video starts blurred. You both choose when to reveal.</p>
          <p>• Report ends the call, blocks them, and goes to a human reviewer. Plajah doesn’t record Shuffle calls.</p>
          <p>• Breaking the rules pauses Shuffle on your account — you’ll always be told why and can appeal.</p>
        </div>
        <label className="flex items-start gap-2 text-[12px] text-white/80 mb-5">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5" />
          I’m 18 or older and I agree to the house rules.
        </label>
        {notice && <p className="text-[12px] text-amber-300 mb-3">{notice}</p>}
        <button disabled={!dob || !agree || busy} onClick={submitGate}
          className="w-full py-3 rounded-full bg-white text-black text-xs font-black uppercase disabled:opacity-40">{busy ? 'Saving…' : 'Continue'}</button>
      </div>
    </Shell>
  );

  if (phase === 'lobby' || phase === 'ended') return (
    <Shell onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-md mx-auto w-full">
        {phase === 'ended' && notice && <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-[12px] p-3 mb-4">{notice}</div>}
        {phase === 'lobby' && notice && <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[12px] p-3 mb-4">{notice}</div>}
        <h2 className="text-xl font-black mb-1">Who do you want to meet?</h2>
        <p className="text-sm text-white/60 mb-4">Add up to 5 interests — we match people who share them first.</p>
        <div className="flex gap-2 mb-2">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/15 rounded-xl px-3">
            <Hash size={14} className="text-white/40" />
            <input value={interestText} onChange={e => setInterestText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addInterest(); }}
              placeholder="music, anime, basketball…" aria-label="Add interests" className="flex-1 bg-transparent py-2.5 text-sm outline-none" />
          </div>
          <button onClick={addInterest} className="px-4 rounded-xl bg-white/10 text-xs font-black uppercase">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
          {interests.map(t => (
            <button key={t} onClick={() => setInterests(interests.filter(x => x !== t))} className="px-2.5 py-1 rounded-full bg-small-orange/20 text-small-orange text-[11px] font-bold">#{t} ×</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-white/70 mb-6">
          <input type="checkbox" checked={interestsOnly} onChange={e => setInterestsOnly(e.target.checked)} disabled={!interests.length} />
          Only match me with people who share an interest
        </label>
        <button onClick={search} className="w-full py-3.5 rounded-full bg-small-orange text-black text-sm font-black uppercase flex items-center justify-center gap-2">
          <ShuffleIcon size={16} /> {phase === 'ended' ? 'Meet someone else' : 'Start'}
        </button>
        <p className="text-[10px] text-white/35 text-center mt-3">Video starts blurred until you both tap Reveal.</p>
      </div>
    </Shell>
  );

  if (phase === 'searching') return (
    <Shell onClose={onClose}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <Loader2 className="animate-spin text-small-orange" size={32} />
        <p className="text-base font-black">Finding someone…</p>
        {interests.length > 0 && <p className="text-[12px] text-white/50">Looking for {interests.map(t => `#${t}`).join(' ')}</p>}
        {notice && <p className="text-[12px] text-white/50">{notice}</p>}
        <button onClick={stopSearching} className="mt-2 px-5 py-2 rounded-full bg-white/10 text-xs font-black uppercase">Stop</button>
      </div>
    </Shell>
  );

  // connecting / live
  return (
    <Shell onClose={onClose}>
      <div className="relative flex-1 bg-zinc-950 overflow-hidden">
        <video ref={remoteRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-300"
          style={{ filter: bothRevealed ? 'none' : 'blur(28px) brightness(0.8)' }} />
        {phase === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-white/70" /><p className="text-sm text-white/70">Connecting…</p></div>
        )}
        {phase === 'live' && !bothRevealed && (
          <div className="absolute inset-x-0 top-6 flex justify-center pointer-events-none">
            <span className="px-3 py-1.5 rounded-full bg-black/60 text-[11px] font-bold">
              {iRevealed ? 'Waiting for them to reveal…' : peerRevealed ? 'They’re ready — tap Reveal to see each other' : 'Say hi — tap Reveal when you’re ready'}
            </span>
          </div>
        )}
        {match?.shared?.length ? (
          <div className="absolute left-3 top-3 flex gap-1">{match.shared.map(t => <span key={t} className="px-2 py-0.5 rounded-full bg-black/60 text-[10px] font-bold text-small-orange">#{t}</span>)}</div>
        ) : null}
        {/* Self view — what they see (blurred on their side until you both reveal) */}
        <div className="absolute right-3 top-3 w-24 h-36 rounded-xl overflow-hidden border border-white/20 bg-black">
          <video ref={selfRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)', filter: bothRevealed ? 'none' : 'blur(6px)' }} />
          {!rtc.videoEnabled && <div className="absolute inset-0 flex items-center justify-center bg-black/80"><VideoOff size={16} /></div>}
        </div>
        {/* Chat */}
        <div className="absolute left-3 right-3 bottom-24 max-h-[30%] overflow-y-auto flex flex-col gap-1">
          {chat.map((m, i) => (
            <div key={i} className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-[13px] ${m.me ? 'self-end bg-small-orange text-black' : 'self-start bg-black/70 text-white'}`}>{m.text}</div>
          ))}
        </div>
        <ReactionFloats floats={floats} />
        {reportOpen && (
          <div className="absolute inset-x-3 bottom-24 rounded-2xl bg-zinc-950/95 border border-white/10 p-3 space-y-1">
            <p className="text-[11px] font-black uppercase tracking-widest mb-1">Report — what happened?</p>
            {REPORT_REASONS.map(r => (
              <button key={r} onClick={() => finish('report', '', r)} className="w-full text-left px-3 py-2 rounded-xl text-[13px] hover:bg-white/10">{REPORT_LABEL[r]}</button>
            ))}
            <button onClick={() => setReportOpen(false)} className="w-full text-center px-3 py-2 rounded-xl text-[12px] text-white/50">Cancel</button>
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 pt-2 space-y-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}>
        <div className="flex gap-2">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} disabled={phase !== 'live'}
            placeholder="Message" aria-label="Message" className="flex-1 bg-white/10 rounded-full px-4 py-2.5 text-sm outline-none disabled:opacity-40" />
          <button onClick={sendChat} aria-label="Send" disabled={phase !== 'live'} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-40"><Send size={15} /></button>
        </div>
        <ReactionBar onReact={react} disabled={phase !== 'live'} />
        {/* Shared call bar (mic/camera + device pickers, end). Screen share and desktop audio stay off
            with strangers; Reveal / Report / Next are Shuffle's own actions. */}
        <CallControlBar compact rtc={rtc} onEnd={leaveCall} endLabel="Leave Shuffle call" screenShare={false} desktopAudio={false}
          extra={<>
            <button onClick={toggleReveal} disabled={phase !== 'live'} aria-label={iRevealed ? 'Blur me again' : 'Reveal'}
              className={`h-12 px-4 rounded-full flex items-center gap-1.5 text-[11px] font-black uppercase disabled:opacity-40 ${iRevealed ? 'bg-white text-black' : 'bg-white/10'}`}>
              {iRevealed ? <EyeOff size={15} /> : <Eye size={15} />} {iRevealed ? 'Blur' : 'Reveal'}
            </button>
            <button onClick={() => setReportOpen(o => !o)} aria-label="Report" className="w-12 h-12 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center"><Flag size={16} /></button>
            <button onClick={() => finish('next')} className="h-12 px-5 rounded-full bg-small-orange text-black flex items-center gap-1.5 text-[11px] font-black uppercase"><SkipForward size={15} /> Next</button>
          </>} />
      </div>
    </Shell>
  );
}
