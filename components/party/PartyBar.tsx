// PartyBar — the ONE shared party chrome for watch-along, read-along and listening parties.
//
// Banner (who's in control + live status) · viewer avatars · chat drawer · emoji reactions overlay ·
// in-app invites · host controls (public listing, open remote, co-hosts, pass the remote) · end/leave.
// Also renders the "Starting in 3…" countdown and gentle toasts (partyToast) — never modals.
//
// Surfaces own the media sync; this component only reads/writes party state through useParty.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, MessageCircle, Send, X, Smile, UserPlus, Crown, Link as LinkIcon, Settings, Play, Radio, Check, Loader2,
} from 'lucide-react';
import type { UseParty } from '../../hooks/useParty';
import {
  PARTY_EMOJIS, PartyChatMessage, PartyReaction, InviteCandidate, listenPartyChat, listenPartyReactions,
  sendPartyChat, sendPartyReaction, fetchInviteCandidates, sendPartyInvites, partyShareUrl, tsToMs, PARTY_CHAT_MAX,
} from '../../services/partyService';
import { auth } from '../../services/backendService';
import { useSocialSafety } from '../../hooks/useSocialSafety';
import { partyToast } from './partyToast';
import PartyToastHost from './PartyToastHost';

export interface PartyBarProps {
  partyId: string;
  party: UseParty;
  /** "watching" | "reading" | "listening" — used in the viewer count. */
  verb: string;
  /** "watch party" | "read-along" | "listening party". */
  noun: string;
  title?: string;
  /** Called after leaving (host: after ending). Surface clears its activePartyId. */
  onLeave: () => void;
  /** Host: start playback for everyone with a 3-2-1 countdown (shown until the first play). */
  onStartTogether?: () => void;
  /** Extra follower control (e.g. BookReader's "Read on my own"). */
  followerExtra?: React.ReactNode;
  className?: string;
}

const glass: React.CSSProperties = {
  background: 'rgba(10,10,14,0.72)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: 'var(--pj-elev-3, 0 10px 28px rgba(0,0,0,0.45))',
};
const pill = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors';

function Avatar({ name, photo, size = 22 }: { name?: string; photo?: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return photo ? (
    <img src={photo} alt={name || ''} width={size} height={size} className="rounded-full object-cover ring-2 ring-black/60" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full ring-2 ring-black/60 flex items-center justify-center text-[10px] font-black text-white"
      style={{ width: size, height: size, background: 'var(--pj-grad-brand)' }}>{initial}</span>
  );
}

const PartyBar: React.FC<PartyBarProps> = ({ partyId, party, verb, noun, title, onLeave, onStartTogether, followerExtra, className }) => {
  const p = party.party;
  const me = auth.currentUser?.uid || null;
  const safety = useSocialSafety();
  const [panel, setPanel] = useState<null | 'chat' | 'invite' | 'host' | 'emoji'>(null);

  // Transition toasts: reconnecting / back / new host / ended.
  const prevRef = useRef<{ status: string; hostId: string; ended: boolean } | null>(null);
  useEffect(() => {
    if (!p) return;
    const cur = { status: party.hostStatus, hostId: p.hostId, ended: party.ended };
    const prev = prevRef.current;
    prevRef.current = cur;
    if (!prev) return;
    if (!prev.ended && cur.ended && !party.isHost) partyToast(`${p.hostName || 'The host'} ended the ${noun}`, 'info');
    if (cur.ended) return;
    if (prev.hostId !== cur.hostId) partyToast(cur.hostId === me ? 'You have the remote now' : `${p.hostName || 'Someone'} has the remote now`, 'good');
    else if (prev.status === 'live' && cur.status !== 'live') partyToast('Host reconnecting… pausing for everyone', 'warn');
    else if (prev.status !== 'live' && cur.status === 'live') partyToast(`${p.hostName || 'Host'} is back — resyncing`, 'good');
  }, [p?.hostId, party.hostStatus, party.ended]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── chat ──
  const [chat, setChat] = useState<PartyChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const seenChatRef = useRef<number>(0);
  useEffect(() => {
    if (!me) return;
    return listenPartyChat(partyId, msgs => setChat(msgs));
  }, [partyId, me]);
  const visibleChat = useMemo(() => {
    const since = p?.createdAt || 0;
    return chat.filter(m => !safety.isHidden(m.uid) && (!tsToMs(m.at) || tsToMs(m.at) >= since - 60_000));
  }, [chat, safety, p?.createdAt]);
  useEffect(() => {
    if (panel === 'chat') { seenChatRef.current = visibleChat.length; setUnread(0); chatEndRef.current?.scrollIntoView({ block: 'end' }); }
    else setUnread(Math.max(0, visibleChat.length - seenChatRef.current));
  }, [visibleChat.length, panel]);
  const sendChat = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    sendPartyChat(partyId, t).catch(() => partyToast('Message not sent', 'warn'));
  };

  // ── reactions overlay ──
  const [floaters, setFloaters] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const seenReactRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    seenReactRef.current = null;
    return listenPartyReactions(partyId, (rs: PartyReaction[]) => {
      if (!seenReactRef.current) { seenReactRef.current = new Set(rs.map(r => r.id)); return; } // history: don't replay
      const fresh = rs.filter(r => !seenReactRef.current!.has(r.id) && !safety.isHidden(r.uid));
      rs.forEach(r => seenReactRef.current!.add(r.id));
      if (!fresh.length) return;
      const add = fresh.map(r => ({ id: r.id, emoji: r.emoji, x: 10 + Math.random() * 70 }));
      setFloaters(f => [...f.slice(-24), ...add]);
      add.forEach(a => setTimeout(() => setFloaters(f => f.filter(x => x.id !== a.id)), 2600));
    });
  }, [partyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const react = (emoji: string) => {
    if (!me) { partyToast('Sign in to react', 'info'); return; }
    sendPartyReaction(partyId, emoji).catch(() => {});
  };

  // ── invites ──
  const [cands, setCands] = useState<InviteCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (panel !== 'invite' || cands) return;
    fetchInviteCandidates().then(setCands).catch(() => setCands([]));
  }, [panel, cands]);
  const sendInvites = async () => {
    if (!p || !picked.size) return;
    setSending(true);
    const n = await sendPartyInvites(p, Array.from(picked)).catch(() => 0);
    setSending(false);
    setPicked(new Set());
    setPanel(null);
    partyToast(n ? `Invited ${n} ${n === 1 ? 'person' : 'people'}` : 'Invites could not be sent', n ? 'good' : 'warn');
  };
  const copyLink = () => {
    const u = partyShareUrl(partyId);
    if (navigator.share) navigator.share({ title: `Join my ${noun}${title ? ` · ${title}` : ''} on Plajah`, url: u }).catch(() => {});
    else navigator.clipboard?.writeText(u).then(() => partyToast('Link copied', 'good')).catch(() => {});
  };

  const leave = () => {
    if (party.isHost && !party.ended) party.end();
    onLeave();
  };

  // ── status copy ──
  const hostName = p?.hostName || 'the host';
  let status: React.ReactNode;
  let dot = 'var(--pj-success)';
  if (party.ended) { status = `${noun} ended — you're on your own now`; dot = 'rgba(255,255,255,0.4)'; }
  else if (party.isHost) status = <>Hosting {noun}</>;
  else if (party.hostStatus === 'gone') { status = `${hostName} dropped — waiting for the remote`; dot = 'var(--pj-danger)'; }
  else if (party.hostStatus === 'reconnecting') { status = `${hostName} reconnecting…`; dot = 'var(--pj-warning)'; }
  else status = <>Following {hostName}</>;

  const people = party.people.filter(x => x.uid);
  const shown = people.slice(0, 5);
  const extraCount = Math.max(0, party.viewerCount - shown.length);
  const showStart = party.isHost && !party.ended && onStartTogether && !p?.playback?.started && !party.countdown;

  return (
    <>
      {/* Countdown: "Starting in 3…" */}
      <AnimatePresence>
        {party.countdown > 0 && !party.ended && (
          <motion.div key="cd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-[11px] font-black uppercase tracking-[0.4em] text-white/70 mb-2">Starting together in</div>
              <motion.div key={party.countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
                className="text-[120px] leading-none font-black text-white drop-shadow-[0_8px_40px_rgba(212,0,85,0.6)]">
                {party.countdown}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reactions overlay */}
      <div className="fixed inset-0 pointer-events-none z-[70] overflow-hidden" aria-hidden>
        <AnimatePresence>
          {floaters.map(f => (
            <motion.span key={f.id} initial={{ y: 0, opacity: 0, scale: 0.6 }} animate={{ y: -320, opacity: [0, 1, 1, 0], scale: 1.2 }}
              exit={{ opacity: 0 }} transition={{ duration: 2.5, ease: 'easeOut' }}
              className="absolute bottom-24 text-4xl select-none" style={{ right: `${4 + f.x / 5}%` }}>
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <PartyToastHost />

      {/* The bar */}
      <div className={`relative flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl text-white ${className || ''}`} style={glass}>
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          {!party.ended && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: dot }} />}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: dot }} />
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[16rem]" aria-live="polite">{status}</span>

        {/* Viewers */}
        <span className="inline-flex items-center gap-1.5 ml-1">
          <span className="flex -space-x-2">
            {shown.map(x => <Avatar key={x.uid} name={x.name} photo={x.photo} />)}
          </span>
          <span className="text-[10px] font-bold text-white/70 inline-flex items-center gap-1">
            {!shown.length && <Users size={11} />}
            {extraCount > 0 ? `+${extraCount} ` : ''}{party.viewerCount} {verb}
          </span>
        </span>

        <span className="flex-1" />

        {party.canClaim && !party.ended && (
          <button onClick={() => party.claim().then(ok => partyToast(ok ? 'You have the remote' : 'Someone else took the remote', ok ? 'good' : 'info'))}
            className={`${pill} text-black`} style={{ background: 'var(--pj-orange)' }}>
            <Crown size={12} /> Take the remote
          </button>
        )}
        {showStart && (
          <button onClick={onStartTogether} className={`${pill} text-white`} style={{ background: 'var(--pj-grad-brand)' }}>
            <Play size={12} /> Start together
          </button>
        )}
        {party.isFollower && followerExtra}

        <button onClick={() => setPanel(panel === 'emoji' ? null : 'emoji')} className={`${pill} bg-white/10 hover:bg-white/20`} aria-label="React">
          <Smile size={12} />
        </button>
        {me && (
          <button onClick={() => setPanel(panel === 'chat' ? null : 'chat')} className={`${pill} bg-white/10 hover:bg-white/20 relative`} aria-label="Party chat">
            <MessageCircle size={12} /> Chat
            {unread > 0 && panel !== 'chat' && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] leading-4 text-center text-white" style={{ background: 'var(--pj-magenta)' }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
        )}
        {me && !party.ended && (
          <button onClick={() => setPanel(panel === 'invite' ? null : 'invite')} className={`${pill} bg-white/10 hover:bg-white/20`}>
            <UserPlus size={12} /> Invite
          </button>
        )}
        {party.isHost && !party.ended && (
          <button onClick={() => setPanel(panel === 'host' ? null : 'host')} className={`${pill} bg-white/10 hover:bg-white/20`} aria-label="Party settings">
            <Settings size={12} />
          </button>
        )}
        <button onClick={leave} className={`${pill} bg-white/10 hover:bg-white/20 text-white/80`}>
          {party.isHost && !party.ended ? 'End' : 'Leave'}
        </button>

        {/* Panels */}
        <AnimatePresence>
          {panel === 'emoji' && (
            <motion.div key="emoji" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-2 top-full mt-2 z-[75] flex gap-1 p-2 rounded-2xl" style={glass}>
              {PARTY_EMOJIS.map(e => (
                <button key={e} onClick={() => react(e)} className="w-9 h-9 rounded-xl hover:bg-white/10 text-xl active:scale-90 transition-transform">{e}</button>
              ))}
            </motion.div>
          )}

          {panel === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-2 top-full mt-2 z-[75] w-80 max-w-[calc(100vw-32px)] rounded-2xl flex flex-col overflow-hidden" style={glass}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Party chat</span>
                <button onClick={() => setPanel(null)} aria-label="Close chat" className="text-white/60 hover:text-white"><X size={14} /></button>
              </div>
              <div className="max-h-72 overflow-y-auto px-3 py-2 space-y-2">
                {!visibleChat.length && <p className="text-xs text-white/50 py-6 text-center">Say hi — everyone in the party sees this.</p>}
                {visibleChat.map(m => (
                  <div key={m.id} className="flex items-start gap-2">
                    <Avatar name={m.name} photo={m.photo} size={20} />
                    <div className="min-w-0">
                      <span className="text-[10px] font-black text-white/60 mr-1">{m.name}{m.uid === p?.hostId ? ' · host' : ''}</span>
                      <span className="text-xs text-white break-words">{m.text}</span>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="flex items-center gap-2 p-2 border-t border-white/10" onSubmit={e => { e.preventDefault(); sendChat(); }}>
                <input value={draft} onChange={e => setDraft(e.target.value.slice(0, PARTY_CHAT_MAX))} placeholder="Message the party"
                  className="flex-1 bg-white/10 rounded-full px-3 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:ring-2 ring-white/20" />
                <button type="submit" disabled={!draft.trim()} className="p-2 rounded-full disabled:opacity-40" style={{ background: 'var(--pj-magenta)' }} aria-label="Send">
                  <Send size={12} />
                </button>
              </form>
            </motion.div>
          )}

          {panel === 'invite' && (
            <motion.div key="invite" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-2 top-full mt-2 z-[75] w-80 max-w-[calc(100vw-32px)] rounded-2xl flex flex-col overflow-hidden" style={glass}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Invite friends</span>
                <button onClick={copyLink} className="text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white inline-flex items-center gap-1"><LinkIcon size={11} /> Link</button>
              </div>
              <div className="max-h-72 overflow-y-auto p-2">
                {!cands && <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-white/60" /></div>}
                {cands && !cands.length && <p className="text-xs text-white/50 py-6 text-center">No followers yet — share the link instead.</p>}
                {cands?.filter(c => !safety.isHidden(c.uid)).map(c => {
                  const on = picked.has(c.uid);
                  return (
                    <button key={c.uid} onClick={() => setPicked(s => { const n = new Set(s); if (on) n.delete(c.uid); else n.add(c.uid); return n; })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left ${on ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                      <Avatar name={c.name} photo={c.photo} size={24} />
                      <span className="flex-1 text-xs text-white truncate">{c.name}</span>
                      {on && <Check size={14} style={{ color: 'var(--pj-success)' }} />}
                    </button>
                  );
                })}
              </div>
              <div className="p-2 border-t border-white/10">
                <button disabled={!picked.size || sending} onClick={sendInvites}
                  className="w-full py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ background: 'var(--pj-grad-brand)' }}>
                  {sending ? 'Sending…' : picked.size ? `Invite ${picked.size}` : 'Pick people to invite'}
                </button>
              </div>
            </motion.div>
          )}

          {panel === 'host' && p && (
            <motion.div key="host" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-2 top-full mt-2 z-[75] w-80 max-w-[calc(100vw-32px)] rounded-2xl overflow-hidden" style={glass}>
              <div className="p-3 space-y-3">
                <label className="flex items-center justify-between gap-3 text-xs text-white">
                  <span className="inline-flex items-center gap-1.5"><Radio size={12} /> List in “Watch with others now”</span>
                  <input type="checkbox" checked={p.visibility === 'public'} onChange={e => party.setVisibility(e.target.checked ? 'public' : 'link').catch(() => {})} />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-white">
                  <span>If I drop, anyone here can take the remote</span>
                  <input type="checkbox" checked={!!p.openRemote} onChange={e => party.setOpenRemote(e.target.checked).catch(() => {})} />
                </label>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Here now</div>
                  {!people.filter(x => x.uid !== me).length && <p className="text-xs text-white/50">Nobody else yet — invite someone.</p>}
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {people.filter(x => x.uid !== me).map(x => {
                      const co = (p.coHostIds || []).includes(x.uid);
                      return (
                        <div key={x.uid} className="flex items-center gap-2">
                          <Avatar name={x.name} photo={x.photo} size={22} />
                          <span className="flex-1 text-xs text-white truncate">{x.name || 'Guest'}</span>
                          <button onClick={() => party.setCoHost(x.uid, !co).catch(() => {})}
                            className={`${pill} ${co ? 'text-black' : 'bg-white/10 hover:bg-white/20'}`} style={co ? { background: 'var(--pj-cyan)' } : undefined}>
                            {co ? 'Co-host' : 'Make co-host'}
                          </button>
                          <button onClick={() => { party.passRemote({ uid: x.uid, name: x.name, photo: x.photo }).catch(() => {}); setPanel(null); }}
                            className={`${pill} bg-white/10 hover:bg-white/20`} title="Pass the remote">
                            <Crown size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default PartyBar;
