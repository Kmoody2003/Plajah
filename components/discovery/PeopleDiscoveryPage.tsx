// PeopleDiscoveryPage — full "Find people" screen.
// Tabs: New this week · In your clubs · Like you · Live now · Creators by type · Near me
// (only when YOU opted in to region matching; matches also need the other person to have opted in),
// plus real prefix search over name / handle.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Settings2, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { CREATOR_TYPES, searchPeople, type DiscoveryProfile, type DiscoveryTab, type Suggestion } from '../../services/discoveryService';
import { welcomeNewMembers } from '../../services/sayHiService';
import { dismissSuggestion } from '../../services/discoveryService';
import { useDiscoveryTabs, useSentHellos } from './useDiscovery';
import { FollowButton, PersonAvatar, SayHiButton, WhyThis } from './PersonActions';
import NewMemberWelcomeBadge from './NewMemberWelcomeBadge';
import DiscoverySettings from './DiscoverySettings';

export interface PeopleDiscoveryPageProps {
  viewer: UserProfile | null | undefined;
  onOpenProfile: (uid: string) => void;
  /** Back / close. Omit to hide the back button (e.g. when mounted as a tab). */
  onBack?: () => void;
  /** Optional: open the DM room after a mutual hello. */
  onOpenChat?: (roomId: string, otherUid: string) => void;
  initialTab?: DiscoveryTab;
}

const TAB_LABEL: Record<DiscoveryTab, string> = {
  new: 'New this week', clubs: 'In your clubs', 'like-you': 'Like you', live: 'Live now', creators: 'Creators', near: 'Near me',
};

const EMPTY_COPY: Record<DiscoveryTab, string> = {
  new: 'No new members this week — check back soon.',
  clubs: 'Join a club to meet its members.',
  'like-you': 'Add a few public interests to your profile to find people like you.',
  live: 'Nobody you could follow is live right now.',
  creators: 'No creators of this type yet.',
  near: "No matches yet. People appear here when you AND they have both turned on 'Use my region'.",
};

const PersonRow: React.FC<{
  profile: DiscoveryProfile; reason?: string; suggestion?: Suggestion; isFollowing: boolean; saidHi: boolean;
  onOpen: () => void; onOpenChat?: PeopleDiscoveryPageProps['onOpenChat']; onDismiss?: () => void; isNew?: boolean;
}> = ({ profile, reason, suggestion, isFollowing, saidHi, onOpen, onOpenChat, onDismiss, isNew }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
    <button onClick={onOpen} className="flex items-center gap-3 min-w-0 mr-auto text-left">
      <PersonAvatar profile={profile} size={48} />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[14px] font-black text-white">
          <span className="truncate">{profile.displayName}</span>
          {isNew && <NewMemberWelcomeBadge profile={profile} />}
        </span>
        {reason && <span className="block text-[12px] text-white/55 truncate">{reason}</span>}
      </span>
    </button>
    {suggestion && <WhyThis suggestion={suggestion} />}
    <div className="flex items-center gap-1.5 shrink-0">
      <FollowButton uid={profile.uid} isFollowing={isFollowing} compact />
      <SayHiButton profile={profile} alreadySent={saidHi} compact onOpenChat={onOpenChat} />
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss" className="text-white/30 hover:text-white/80 ml-1"><X size={14} /></button>}
    </div>
  </div>
);

const PeopleDiscoveryPage: React.FC<PeopleDiscoveryPageProps> = ({ viewer, onOpenProfile, onBack, onOpenChat, initialTab = 'new' }) => {
  const { data, loading, following, hidden, list } = useDiscoveryTabs(viewer);
  const sent = useSentHellos(viewer?.uid);
  const [tab, setTab] = useState<DiscoveryTab>(initialTab);
  const [creatorType, setCreatorType] = useState<string>('artist');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<DiscoveryProfile[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState<Set<string>>(() => new Set());
  const [welcomeMsg, setWelcomeMsg] = useState<string | null>(null);
  const [localViewer, setLocalViewer] = useState<UserProfile | null | undefined>(viewer);
  useEffect(() => setLocalViewer(viewer), [viewer]);

  const nearEnabled = !!(localViewer?.discoverByRegion && localViewer?.discoveryRegion?.trim());
  const tabs = (Object.keys(TAB_LABEL) as DiscoveryTab[]).filter(t => t !== 'near' || nearEnabled);

  // debounce search
  useEffect(() => {
    const t = term.trim();
    if (!viewer || t.length < 2) { setResults(null); return; }
    let alive = true;
    const h = setTimeout(() => { searchPeople(viewer, t, hidden).then(r => { if (alive) setResults(r); }).catch(() => { if (alive) setResults([]); }); }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [term, viewer, hidden]);

  const items = useMemo(() => list(tab, tab === 'creators' ? creatorType : undefined).filter(s => !dismissedLocal.has(s.uid)),
    [list, tab, creatorType, dismissedLocal]);

  if (!viewer) return null;
  const ambassador = !!viewer.isWelcomeAmbassador;

  return (
    <div className="min-h-full w-full max-w-3xl mx-auto px-4 py-4 pb-24 text-white">
      <div className="flex items-center gap-2 mb-4">
        {onBack && <button onClick={onBack} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-white/10"><ArrowLeft size={18} /></button>}
        <h2 className="text-2xl font-black uppercase tracking-tighter mr-auto">Find people</h2>
        <button onClick={() => setShowSettings(v => !v)} aria-label="Discovery settings" className={`p-2 rounded-full hover:bg-white/10 ${showSettings ? 'bg-white/10' : ''}`}><Settings2 size={18} /></button>
      </div>

      {showSettings && localViewer && (
        <div className="mb-4"><DiscoverySettings viewer={localViewer} onSaved={(patch) => setLocalViewer(v => (v ? { ...v, ...patch } : v))} /></div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={term} onChange={e => setTerm(e.target.value)} placeholder="Search by name or @handle"
          className="w-full rounded-full bg-white/[0.06] border border-white/10 pl-10 pr-9 py-2.5 text-sm placeholder:text-white/35 focus:outline-none focus:border-white/30"
        />
        {term && <button onClick={() => setTerm('')} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={14} /></button>}
      </div>

      {results !== null ? (
        <div className="flex flex-col gap-2">
          {results.length === 0 && <p className="text-sm text-white/45 py-8 text-center">No one found for “{term.trim()}”.</p>}
          {results.map(p => (
            <PersonRow key={p.uid} profile={p} isFollowing={following.ids.has(p.uid)} saidHi={sent.has(p.uid)} onOpen={() => onOpenProfile(p.uid)} onOpenChat={onOpenChat} />
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-3">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-colors ${tab === t ? 'bg-white text-black border-white' : 'border-white/15 text-white/60 hover:text-white'}`}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {tab === 'creators' && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3">
              {CREATOR_TYPES.map(c => (
                <button key={c} onClick={() => setCreatorType(c)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest border ${creatorType === c ? 'border-[#FF8C00] text-[#FFB347]' : 'border-white/10 text-white/50'}`}>{c}s</button>
              ))}
            </div>
          )}

          {tab === 'new' && ambassador && items.length > 0 && (
            <div className="mb-3 rounded-2xl border border-[#FF8C00]/30 bg-[#FF8C00]/5 p-3 flex items-center gap-3">
              <p className="text-[12px] text-white/75 mr-auto">You're on the Welcome Committee. Greet the newest members?</p>
              <button
                onClick={async () => {
                  const r = await welcomeNewMembers(items.filter(i => !sent.has(i.uid)).map(i => i.uid), 5);
                  setWelcomeMsg(r.sent ? `Said hi to ${r.sent} new member${r.sent > 1 ? 's' : ''}.` : 'Nobody new to greet right now.');
                }}
                className="shrink-0 rounded-full bg-[#FF8C00] text-black px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest"
              >Welcome them</button>
            </div>
          )}
          {welcomeMsg && <p className="text-[12px] text-[#FFB347] mb-3">{welcomeMsg}</p>}

          <div className="flex flex-col gap-2">
            {loading && !data && Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[72px] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse" />)}
            {!loading && items.length === 0 && <p className="text-sm text-white/45 py-10 text-center">{EMPTY_COPY[tab]}</p>}
            {items.map(s => (
              <PersonRow
                key={s.uid} profile={s.profile} reason={s.reason} suggestion={s} isNew={s.isNew}
                isFollowing={following.ids.has(s.uid)} saidHi={sent.has(s.uid)}
                onOpen={() => onOpenProfile(s.uid)} onOpenChat={onOpenChat}
                onDismiss={() => { dismissSuggestion(viewer.uid, s.uid); setDismissedLocal(prev => new Set(prev).add(s.uid)); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PeopleDiscoveryPage;
export { PeopleDiscoveryPage };
