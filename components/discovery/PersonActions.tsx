// Small shared pieces for discovery cards: avatar, optimistic Follow, Say hi, "Why this?" tooltip.

import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, HandHeart, Info, MessageCircle, UserPlus } from 'lucide-react';
import { followUser } from '../../services/backendService';
import { sendHello, openDmForMutualHello, FAILURE_COPY } from '../../services/sayHiService';
import type { DiscoveryProfile, Suggestion } from '../../services/discoveryScoring';

export const PersonAvatar: React.FC<{ profile: Pick<DiscoveryProfile, 'displayName' | 'photoURL'>; size?: number; className?: string }> = ({ profile, size = 56, className = '' }) => {
  const [broken, setBroken] = useState(false);
  const initial = (profile.displayName || '?').trim().charAt(0).toUpperCase();
  return (
    <div className={`rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center text-white/70 font-black ${className}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {profile.photoURL && !broken
        ? <img src={profile.photoURL} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setBroken(true)} />
        : initial}
    </div>
  );
};

type FollowState = 'idle' | 'busy' | 'requested';

/** Optimistic Follow. `isFollowing` should come from useFollowing(...).ids so it stays live. */
export const FollowButton: React.FC<{
  uid: string; isFollowing: boolean; compact?: boolean; onFollowed?: () => void;
}> = ({ uid, isFollowing, compact, onFollowed }) => {
  const [state, setState] = useState<FollowState>('idle');
  const [note, setNote] = useState<string | null>(null);
  const optimistic = state === 'busy';
  const base = `inline-flex items-center justify-center gap-1.5 rounded-full font-black uppercase tracking-widest transition-all active:scale-95 ${compact ? 'px-3 py-1.5 text-[9px]' : 'px-4 py-2 text-[10px]'}`;

  if (isFollowing || optimistic) {
    return <span className={`${base} border border-white/15 bg-white/5 text-white/70`}><Check size={12} /> Following</span>;
  }
  if (state === 'requested') {
    return <span className={`${base} border border-white/15 bg-white/5 text-white/60`}>Requested</span>;
  }
  return (
    <span className="inline-flex flex-col items-center">
    <button
      onClick={async (e) => {
        e.stopPropagation();
        setNote(null);
        setState('busy');
        const res = await followUser(uid);
        if (res === 'requested') setState('requested');
        else if (res === 'followed' || res === 'already') { setState('idle'); onFollowed?.(); }
        else { setState('idle'); if (res === 'rate') setNote('Slow down a little'); }   // none/blocked/rate: roll the optimistic state back
      }}
      className={`${base} bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white shadow-[0_6px_18px_-8px_rgba(212,0,85,0.7)] hover:brightness-110`}
    >
      <UserPlus size={12} /> Follow
    </button>
    {note && <span className="mt-1 text-[9px] text-white/45">{note}</span>}
    </span>
  );
};

/** "Say hi" — one-way greeting. Hidden when the person opted out of hellos. */
export const SayHiButton: React.FC<{
  profile: DiscoveryProfile; alreadySent: boolean; compact?: boolean;
  onResult?: (mutual: boolean) => void;
  /** Called with the DM room id when a MUTUAL hello unlocks "Chat". Falls back to nothing if omitted. */
  onOpenChat?: (roomId: string, otherUid: string) => void;
}> = ({ profile, alreadySent, compact, onResult, onOpenChat }) => {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [mutual, setMutual] = useState(false);
  if (profile.sayHiOptOut) return null;
  const base = `inline-flex items-center justify-center gap-1.5 rounded-full font-black uppercase tracking-widest transition-all active:scale-95 border ${compact ? 'px-3 py-1.5 text-[9px]' : 'px-4 py-2 text-[10px]'}`;
  if (mutual && onOpenChat) {
    return (
      <button
        onClick={async (e) => { e.stopPropagation(); const room = await openDmForMutualHello(profile.uid); if (room) onOpenChat(room, profile.uid); }}
        className={`${base} border-[#FF8C00]/50 bg-[#FF8C00]/10 text-[#FFB347] hover:bg-[#FF8C00]/20`}
      ><MessageCircle size={12} /> Chat</button>
    );
  }
  if (alreadySent || done) return <span className={`${base} border-white/10 text-white/45`}><HandHeart size={12} /> Said hi</span>;
  return (
    <span className="inline-flex flex-col items-center">
      <button
        disabled={busy}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          const r = await sendHello(profile.uid);
          setBusy(false);
          if (r.ok) { setDone(true); setMsg(null); setMutual(r.mutual); onResult?.(r.mutual); }
          else if (r.reason === 'already') setDone(true);
          else setMsg(FAILURE_COPY[r.reason]);
        }}
        className={`${base} border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50`}
      >
        <HandHeart size={12} /> Say hi
      </button>
      {msg && <span className="mt-1 text-[9px] text-white/45 max-w-[9rem] text-center leading-tight">{msg}</span>}
    </span>
  );
};

/** "Why this?" — explains the suggestion using only public signals. Portal'd so carousels can't clip it. */
export const WhyThis: React.FC<{ suggestion: Suggestion }> = ({ suggestion }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.min(Math.max(8, r.left + r.width / 2 - 130), window.innerWidth - 268), y: r.bottom + 6 });
  };
  const reasons = suggestion.reasons.filter(r => !/followers$/.test(r) || suggestion.reasons.length === 1).slice(0, 4);
  return (
    <>
      <button ref={btn} onClick={open} aria-label="Why this suggestion?" className="text-white/35 hover:text-white/80 transition-colors">
        <Info size={13} />
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[400]" onClick={() => setPos(null)} />
          <div role="tooltip" className="fixed z-[401] w-64 rounded-xl border border-white/15 bg-[#12081a]/95 backdrop-blur p-3 shadow-2xl" style={{ left: pos.x, top: pos.y }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-1.5">Why you're seeing this</p>
            <ul className="text-[12px] text-white/80 space-y-0.5 list-disc pl-4">
              {reasons.map(r => <li key={r}>{r}</li>)}
            </ul>
            <p className="text-[10px] text-white/40 mt-2 leading-snug">Based only on things this person shares publicly. You can hide suggestions or change this in Discovery settings.</p>
          </div>
        </>,
        document.body,
      )}
    </>
  );
};
