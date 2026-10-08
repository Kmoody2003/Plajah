// MeetNewPeopleRow — horizontal "people to meet" carousel for the top of the feed.
//
//   mode 'new-user'    -> big, welcoming first-run variant (shown while you follow < 5 people / just joined)
//   mode 'new-members' -> compact "New here" row (people who recently joined)
//   mode 'existing'    -> compact "People you may like" row (graph / interest based)
//   omitted            -> auto: 'new-user' for newcomers, else 'new-members'
//
// Hides itself when there is nothing to show. Cards: avatar, name, reason line, optimistic Follow,
// Say hi, dismiss (X, remembered 30 days), "Why this?" tooltip.

import React, { useEffect, useRef } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { useFollowing } from '../../hooks/useFollowing';
import { pickMode, type DiscoveryMode, type Suggestion } from '../../services/discoveryScoring';
import { fetchWelcomeAmbassadors } from '../../services/discoveryService';
import { greetNewAccountOnce } from '../../services/sayHiService';
import { useSentHellos, useSuggestions } from './useDiscovery';
import { FollowButton, PersonAvatar, SayHiButton, WhyThis } from './PersonActions';
import NewMemberWelcomeBadge from './NewMemberWelcomeBadge';

export interface MeetNewPeopleRowProps {
  viewer: UserProfile | null | undefined;
  mode?: DiscoveryMode;
  onOpenProfile: (uid: string) => void;
  onSeeAll: () => void;
  /** Optional: open the DM room after a mutual hello (roomId from createChatRoom). */
  onOpenChat?: (roomId: string, otherUid: string) => void;
  className?: string;
}

const SkeletonCard: React.FC<{ big: boolean }> = ({ big }) => (
  <div className={`shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse ${big ? 'w-[200px] h-[236px]' : 'w-[164px] h-[188px]'}`} />
);

const MeetNewPeopleRow: React.FC<MeetNewPeopleRowProps> = ({ viewer, mode, onOpenProfile, onSeeAll, onOpenChat, className = '' }) => {
  const following = useFollowing(viewer?.uid);
  const sent = useSentHellos(viewer?.uid);
  const effectiveMode: DiscoveryMode = mode ?? (viewer && !following.loading
    ? (pickMode(viewer, following.ids.size, Date.now()) === 'new-user' ? 'new-user' : 'new-members')
    : 'new-user');
  const { suggestions, loading, dismiss } = useSuggestions(viewer, { mode: effectiveMode, limit: effectiveMode === 'new-user' ? 10 : 12 });
  const big = effectiveMode === 'new-user';

  // Welcome committee: a brand-new account gets one friendly greeting on its first suggestion view.
  const greeted = useRef(false);
  useEffect(() => {
    if (!viewer || !big || loading || greeted.current || suggestions.length === 0) return;
    greeted.current = true;
    const inList = suggestions.filter(s => s.profile.isWelcomeAmbassador).map(s => ({ uid: s.uid, displayName: s.profile.displayName }));
    (inList.length ? Promise.resolve(inList) : fetchWelcomeAmbassadors(2))
      .then(amb => greetNewAccountOnce(viewer.uid, viewer.createdAt ?? viewer.joinedAt, amb))
      .catch(() => {});
  }, [viewer, big, loading, suggestions]);

  if (!viewer) return null;
  if (!loading && suggestions.length === 0) return null;

  const title = big ? 'Welcome! Meet some people' : effectiveMode === 'new-members' ? 'New here' : 'People you may like';
  const sub = big ? 'Follow a few people to fill your feed — or just say hi. Everyone was new once.' : undefined;

  return (
    <section className={`relative ${className}`} aria-label={title}>
      <div className={`flex items-end gap-3 px-4 ${big ? 'mb-3' : 'mb-2'}`}>
        <div className="min-w-0 mr-auto">
          <h3 className={`${big ? 'text-xl' : 'text-[11px]'} font-black uppercase tracking-tight text-white flex items-center gap-2`}>
            {big && <Sparkles size={18} className="text-[#FF8C00]" />}
            {title}
          </h3>
          {sub && <p className="text-[12px] text-white/55 mt-0.5">{sub}</p>}
        </div>
        <button onClick={onSeeAll} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white shrink-0">
          See all <ArrowRight size={12} />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-2 snap-x">
        {loading && suggestions.length === 0
          ? Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} big={big} />)
          : suggestions.map(s => (
            <PersonCard
              key={s.uid} s={s} big={big}
              isFollowing={following.ids.has(s.uid)}
              saidHi={sent.has(s.uid)}
              onOpen={() => onOpenProfile(s.uid)}
              onDismiss={() => dismiss(s.uid)}
              onOpenChat={onOpenChat}
            />
          ))}
      </div>
    </section>
  );
};

const PersonCard: React.FC<{
  s: Suggestion; big: boolean; isFollowing: boolean; saidHi: boolean; onOpen: () => void; onDismiss: () => void;
  onOpenChat?: (roomId: string, otherUid: string) => void;
}> = ({ s, big, isFollowing, saidHi, onOpen, onDismiss, onOpenChat }) => (
  <div
    className={`relative shrink-0 snap-start rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors flex flex-col items-center text-center ${big ? 'w-[200px] p-4' : 'w-[164px] p-3'}`}
  >
    <button onClick={onDismiss} aria-label={`Dismiss ${s.profile.displayName}`} className="absolute top-2 right-2 text-white/30 hover:text-white/80 transition-colors"><X size={14} /></button>
    <div className="absolute top-2 left-2"><WhyThis suggestion={s} /></div>
    <button onClick={onOpen} className="flex flex-col items-center min-w-0 w-full mt-1">
      <PersonAvatar profile={s.profile} size={big ? 72 : 52} />
      <span className={`mt-2 font-black text-white truncate max-w-full ${big ? 'text-[15px]' : 'text-[13px]'}`}>{s.profile.displayName}</span>
      <span className="text-[11px] text-white/55 leading-snug line-clamp-2 min-h-[2.2em]">{s.reason}</span>
    </button>
    {s.isNew && <NewMemberWelcomeBadge profile={s.profile} className="mt-1" />}
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
      <FollowButton uid={s.uid} isFollowing={isFollowing} compact={!big} />
      <SayHiButton profile={s.profile} alreadySent={saidHi} compact onOpenChat={onOpenChat} />
    </div>
  </div>
);

export default MeetNewPeopleRow;
export { MeetNewPeopleRow };
