// OnboardingFollowStep — "Find your people": (1) pick a few interests, (2) follow >= 5 suggested
// people (preselected, individually toggleable). Fully skippable — nothing here is a wall.
// Seeds real `follows` docs via followUser (private accounts get a follow request instead).
//
// Mounted by components/Onboarding.tsx as its last page when a viewer profile is supplied.

import React, { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { UserProfile } from '../../types';
import { followUser, updateUserProfile } from '../../services/backendService';
import { clearDiscoveryCache } from '../../services/discoveryService';
import { useSuggestions } from './useDiscovery';
import { PersonAvatar } from './PersonActions';

const INTERESTS = [
  'Music', 'Film', 'Books', 'Gaming', 'Sports', 'Art', 'Science', 'Tech', 'Faith', 'Cooking',
  'Fitness', 'Travel', 'Comedy', 'Fashion', 'Photography', 'Learning', 'Business', 'Nature',
];
export const MIN_FOLLOWS = 5;
const MAX_SEED = 12;

export interface OnboardingFollowStepProps {
  viewer: UserProfile;
  /** Called after following (count) or when the user skips (0). */
  onDone?: (followed: number) => void;
  className?: string;
}

const OnboardingFollowStep: React.FC<OnboardingFollowStepProps> = ({ viewer, onDone, className = '' }) => {
  const [picked, setPicked] = useState<string[]>(viewer.publicInterests ?? []);
  const [stage, setStage] = useState<'interests' | 'people'>('interests');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [followed, setFollowed] = useState<number | null>(null);

  // Rank with the interests picked here (local overlay only until they choose to save).
  const overlay = useMemo<UserProfile>(() => ({ ...viewer, publicInterests: picked }), [viewer, picked]);
  const { suggestions, loading } = useSuggestions(stage === 'people' ? overlay : null, { mode: 'new-user', limit: 15 });

  const sel = selected ?? new Set(suggestions.slice(0, MIN_FOLLOWS).map(s => s.uid));
  const toggle = (uid: string) => setSelected(prev => {
    const next = new Set(prev ?? sel);
    if (next.has(uid)) next.delete(uid); else if (next.size < MAX_SEED) next.add(uid);
    return next;
  });

  const goPeople = async () => {
    setStage('people');
    // Interests are what other people match on, so saving them is the point; only write if changed.
    const prev = viewer.publicInterests ?? [];
    if (picked.length && picked.join('|') !== prev.join('|')) {
      try { await updateUserProfile(viewer.uid, { publicInterests: picked } as Partial<UserProfile>); clearDiscoveryCache(viewer.uid); } catch { /* non-fatal */ }
    }
  };

  const followSelected = async () => {
    setBusy(true);
    let n = 0;
    for (const uid of sel) {
      // Onboarding seeds a small, user-chosen batch (<= MAX_SEED), so skip the per-click cooldown.
      const r = await followUser(uid, { bypassRateLimit: true });
      if (r === 'followed' || r === 'already' || r === 'requested') n++;
    }
    setBusy(false);
    setFollowed(n);
    onDone?.(n);
  };

  return (
    <div className={`w-full max-w-2xl mx-auto ${className}`}>
      <div className="text-center mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 mb-3">Optional · 20 seconds</p>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white leading-[0.95]">
          Find your <span className="bg-gradient-to-r from-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">people</span>
        </h1>
        <p className="text-sm text-white/55 mt-3">
          {stage === 'interests' ? 'Pick a few things you like — we\'ll suggest people who like them too.' : `Follow at least ${MIN_FOLLOWS} to fill your feed. You can change this any time.`}
        </p>
      </div>

      {stage === 'interests' ? (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {INTERESTS.map(i => {
              const on = picked.some(p => p.toLowerCase() === i.toLowerCase());
              return (
                <button key={i} onClick={() => setPicked(p => on ? p.filter(x => x.toLowerCase() !== i.toLowerCase()) : [...p, i])}
                  className={`rounded-full px-4 py-2 text-[12px] font-bold border transition-all ${on ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] border-transparent text-white' : 'border-white/15 text-white/70 hover:bg-white/5'}`}>
                  {i}
                </button>
              );
            })}
          </div>
          <div className="flex justify-center gap-3 mt-7">
            <button onClick={() => onDone?.(0)} className="text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white px-4 py-3">Skip</button>
            <button onClick={goPeople} className="rounded-full bg-white text-black px-6 py-3 text-[11px] font-black uppercase tracking-widest">
              {picked.length ? 'Show me people' : 'Show me people anyway'}
            </button>
          </div>
        </>
      ) : followed !== null ? (
        <div className="text-center py-8">
          <Sparkles className="mx-auto text-[#FF8C00] mb-3" />
          <p className="text-lg font-black text-white">{followed > 0 ? `You're following ${followed} ${followed === 1 ? 'person' : 'people'}.` : 'All set.'}</p>
          <p className="text-sm text-white/50 mt-1">Say hi to anyone from their profile or the Find people page.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {loading && suggestions.length === 0 && Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[64px] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse" />)}
            {!loading && suggestions.length === 0 && <p className="text-center text-sm text-white/45 py-6">No suggestions yet — you'll find people on the Find people page.</p>}
            {suggestions.map(s => {
              const on = sel.has(s.uid);
              return (
                <button key={s.uid} onClick={() => toggle(s.uid)}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${on ? 'border-[#FF8C00]/60 bg-[#FF8C00]/[0.07]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <PersonAvatar profile={s.profile} size={44} />
                  <span className="min-w-0 mr-auto">
                    <span className="block text-[14px] font-black text-white truncate">{s.profile.displayName}</span>
                    <span className="block text-[12px] text-white/55 truncate">{s.reason}</span>
                  </span>
                  <span className={`w-6 h-6 rounded-full border flex items-center justify-center ${on ? 'bg-[#FF8C00] border-[#FF8C00] text-black' : 'border-white/25 text-transparent'}`}><Check size={14} /></span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-center items-center gap-3 mt-6">
            <button onClick={() => onDone?.(0)} className="text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white px-4 py-3">Skip</button>
            <button disabled={busy || sel.size === 0} onClick={followSelected}
              className="rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white px-6 py-3 text-[11px] font-black uppercase tracking-widest disabled:opacity-40">
              {busy ? 'Following…' : `Follow ${sel.size}${sel.size < MIN_FOLLOWS ? ` (pick ${MIN_FOLLOWS}+ for a fuller feed)` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default OnboardingFollowStep;
export { OnboardingFollowStep };
