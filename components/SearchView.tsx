import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Video, Album } from '../types';
import PageHeader from './PageHeader';
import { searchUsers, searchLiveChannels, followUser, unfollowUser, isFollowing, fetchUserContent, fetchUserVideos, fetchAllVideos, fetchAllPublicAlbums } from '../services/backendService';
import { Search, UserPlus, UserMinus, ArrowLeft, User, Tv, Play, Music, Film, LayoutGrid } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import WorldBadge from './WorldBadge';

interface SearchViewProps {
  onBack: () => void;
  onVisitUser: (uid: string) => void;
  currentUser: FirebaseUser | null;
  initialQuery?: string;
  initialFilter?: SearchTab;
}

type SearchTab = 'ALL' | 'PEOPLE' | 'VIDEOS' | 'MUSIC';

const LatestCreation: React.FC<{ uid: string }> = ({ uid }) => {
  const [latestItem, setLatestItem] = useState<{ title: string, cover?: string, type: string } | null>(null);

  useEffect(() => {
    let active = true;
    const fetchLatest = async () => {
      try {
        const [albums, videos] = await Promise.all([
          fetchUserContent(uid).catch(() => []),
          fetchUserVideos(uid).catch(() => [])
        ]);
        if (!active) return;
        
        const content = [...albums, ...videos].sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        if (content.length > 0) {
          const item = content[0];
          setLatestItem({
            title: item.title || 'Untitled',
            cover: item.coverUrl || (item as any).thumbnailUrl,
            type: 'coverUrl' in item ? 'Project / Album' : 'Video'
          });
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchLatest();
    return () => { active = false; };
  }, [uid]);

  if (!latestItem) return (
    <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
      <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">No Creations Yet</p>
    </div>
  );

  return (
    <div className="mt-4 p-2 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-black/50 shrink-0">
        {latestItem.cover ? (
          <img src={latestItem.cover} alt={latestItem.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><LayoutGrid size={16} className="text-white/20" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black uppercase text-small-orange tracking-widest">{latestItem.type}</p>
        <p className="text-xs font-bold text-white truncate">{latestItem.title}</p>
      </div>
    </div>
  );
};

const SearchView: React.FC<SearchViewProps> = ({ onBack, onVisitUser, currentUser, initialQuery, initialFilter }) => {
  const [searchTerm, setSearchTerm] = useState(initialQuery || '');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialFilter || 'ALL');

  // Load content catalogs once on mount
  useEffect(() => {
    fetchAllVideos().then(setAllVideos).catch(() => {});
    fetchAllPublicAlbums().then(setAllAlbums).catch(() => {});
  }, []);

  const performSearch = async (queryOverride?: string) => {
    setIsLoading(true);
    const query = queryOverride || searchTerm;
    const [userResults, liveResults] = await Promise.all([
      searchUsers(query),
      searchLiveChannels(query)
    ]);
    const merged = [...liveResults];
    userResults.forEach(u => {
      if (!merged.find(m => m.uid === u.uid)) merged.push(u);
    });
    setUsers(merged.filter(u => u.uid !== currentUser?.uid));
    if (currentUser) {
      const map: Record<string, boolean> = {};
      for (const user of merged) map[user.uid] = await isFollowing(user.uid);
      setFollowingMap(map);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    performSearch(initialQuery);
  }, [initialQuery]);

  const q = searchTerm.toLowerCase().trim();
  const videoResults = useMemo(() =>
    q.length < 2 ? [] : allVideos.filter(v =>
      v.title?.toLowerCase().includes(q) ||
      (v.artist || '').toLowerCase().includes(q) ||
      (v.genre || '').toLowerCase().includes(q) ||
      (v.tags || []).some(t => t.toLowerCase().includes(q))
    ), [allVideos, q]);

  const musicResults = useMemo(() =>
    q.length < 2 ? [] : allAlbums.filter(a =>
      a.type === 'MUSIC' &&
      (a.title?.toLowerCase().includes(q) ||
       (a.artist || '').toLowerCase().includes(q) ||
       (a.genre || '').toLowerCase().includes(q))
    ), [allAlbums, q]);

  const handleFollow = async (uid: string) => {
    if (!currentUser) return;
    if (followingMap[uid]) {
      await unfollowUser(uid);
      setFollowingMap({ ...followingMap, [uid]: false });
    } else {
      await followUser(uid);
      setFollowingMap({ ...followingMap, [uid]: true });
    }
  };

  const peopleResults = activeTab === 'ALL' || activeTab === 'PEOPLE' ? users : [];

  return (
    <div className="p-6 lg:p-12 max-w-7xl mx-auto w-full">
      <header className="mb-12 flex items-center gap-6">
        <button onClick={onBack} className="p-3 bg-white/5 rounded-full text-primary hover:bg-white/10 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <PageHeader textClassName="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Plajah Find</PageHeader>
          <p className="text-small-orange text-sm uppercase tracking-[0.2em]">Discover Accounts & Creators</p>
        </div>
      </header>

      <div className="relative mb-8">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-primary/30" size={20} />
        <input 
          type="text" 
          placeholder="Search for an artist, user, organization..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && performSearch()}
          className="w-full bg-white/5 border border-theme rounded-[2rem] py-6 pl-16 pr-8 text-lg font-medium focus:outline-none focus:ring-4 focus:ring-white/5 transition-all placeholder:text-primary/20"
        />
      </div>
      
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-4 hide-scrollbar">
        {([
          { id: 'ALL', label: 'All Results' },
          { id: 'PEOPLE', label: 'People' },
          { id: 'VIDEOS', label: 'Videos' },
          { id: 'MUSIC', label: 'Music' },
        ] as { id: SearchTab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-8 py-4 rounded-full font-black text-xs uppercase tracking-[0.2em] whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-small-orange text-black cursor-default shadow-lg shadow-small-orange/20'
                : 'bg-white/5 text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* People */}
      {(activeTab === 'ALL' || activeTab === 'PEOPLE') && peopleResults.length > 0 && (
        <>
          {activeTab === 'ALL' && <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2"><User size={12} className="text-small-orange" /> People</h3>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {peopleResults.map((user) => (
              <div key={user.uid} className="flex flex-col p-6 bg-white/[0.02] border border-theme rounded-[2.5rem] hover:bg-white/[0.04] transition-all group relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-32 opacity-20 group-hover:opacity-30 transition-opacity bg-gradient-to-b from-small-orange/40 to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-start gap-5 cursor-pointer mb-4" onClick={() => onVisitUser(user.uid)}>
                    <div className="w-16 h-16 rounded-full bg-white/10 overflow-hidden flex items-center justify-center ring-2 ring-white/10 shrink-0">
                      {user.photoURL ? <img src={user.photoURL || null} alt={user.displayName} className="w-full h-full object-cover" /> : <User size={24} className="text-white/20" />}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h3 className="font-display font-black text-xl uppercase tracking-tight truncate hover:text-small-orange transition-colors">{user.displayName}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="text-small-orange text-[9px] font-black uppercase tracking-[0.3em] bg-small-orange/10 px-2 py-0.5 rounded-sm">
                          {user.accountType === 'FAN' || !user.accountType ? 'USER' : user.accountType}
                        </span>
                        {user.liveStreamConfig?.isActive && (
                          <div className="px-2 py-0.5 bg-red-600/20 text-red-500 text-[8px] font-black uppercase tracking-widest rounded-sm border border-red-500/20 flex items-center gap-1">
                            <Tv size={8} /> Live
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {currentUser && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFollow(user.uid); }}
                      className={`w-full flex items-center justify-center gap-3 px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${followingMap[user.uid] ? 'bg-white/5 text-white/50 border border-theme hover:bg-white/10' : 'bg-small-orange text-black hover:bg-white'}`}
                    >
                      {followingMap[user.uid] ? <><UserMinus size={14} /> Unfollow</> : <><UserPlus size={14} /> Follow</>}
                    </button>
                  )}
                  <LatestCreation uid={user.uid} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Videos */}
      {(activeTab === 'ALL' || activeTab === 'VIDEOS') && videoResults.length > 0 && (
        <>
          {activeTab === 'ALL' && <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2"><Film size={12} className="text-small-orange" /> Videos</h3>}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mb-10">
            {videoResults.slice(0, activeTab === 'ALL' ? 8 : 999).map(v => (
              <div key={v.id} className="group cursor-pointer" onClick={() => {/* handled by VideoPlayer */}}>
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5 mb-2">
                  <img loading="lazy" src={v.thumbnailUrl || `https://picsum.photos/seed/${v.id}/640/360`} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                    <Play fill="white" size={22} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {v.genre && <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md text-[7px] font-black uppercase tracking-widest rounded-lg">{v.genre}</span>}
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white line-clamp-2 group-hover:text-small-orange transition-colors">{v.title}</h4>
                <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-0.5">{v.artist || 'Creator'}</p>
                {(v as any).worldId && (
                  <div className="mt-1.5">
                    <WorldBadge worldId={(v as any).worldId} contentTitle={v.title} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Music / Albums */}
      {(activeTab === 'ALL' || activeTab === 'MUSIC') && musicResults.length > 0 && (
        <>
          {activeTab === 'ALL' && <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2"><Music size={12} className="text-small-orange" /> Music</h3>}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-5 mb-10">
            {musicResults.slice(0, activeTab === 'ALL' ? 12 : 999).map(a => (
              <div key={a.id} className="group cursor-pointer">
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5 mb-2">
                  <img loading="lazy" src={a.coverImage || `https://picsum.photos/seed/${a.id}/400/400`} alt={a.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                    <Play fill="white" size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <h4 className="text-[9px] font-black uppercase tracking-widest text-white line-clamp-2 group-hover:text-small-orange transition-colors">{a.title}</h4>
                <p className="text-[8px] font-bold text-small-orange/70 uppercase tracking-widest mt-0.5">{a.artist}</p>
                {a.worldId && (
                  <div className="mt-1.5">
                    <WorldBadge worldId={a.worldId} contentTitle={a.title} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {q.length >= 2 && peopleResults.length === 0 && videoResults.length === 0 && musicResults.length === 0 && !isLoading && (
        <div className="col-span-full py-20 text-center opacity-20 uppercase font-black tracking-[0.4em] text-xs">
          No results for &ldquo;{searchTerm}&rdquo;
        </div>
      )}
    </div>
  );
};

export default SearchView;

