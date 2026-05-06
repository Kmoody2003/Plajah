import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { searchUsers, searchLiveChannels, followUser, unfollowUser, isFollowing, fetchUserContent, fetchUserVideos } from '../services/backendService';
import { Search, UserPlus, UserMinus, ArrowLeft, User, Tv, MapPin, Briefcase, Music, LayoutGrid } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';

interface SearchViewProps {
  onBack: () => void;
  onVisitUser: (uid: string) => void;
  currentUser: FirebaseUser | null;
  initialQuery?: string;
}

type SearchTab = 'ALL' | 'ARTIST' | 'USER' | 'ORGANIZATION' | 'BRAND';

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

const SearchView: React.FC<SearchViewProps> = ({ onBack, onVisitUser, currentUser, initialQuery }) => {
  const [searchTerm, setSearchTerm] = useState(initialQuery || '');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('ALL');

  const performSearch = async (queryOverride?: string) => {
    setIsLoading(true);
    const query = queryOverride || searchTerm;
    const [userResults, liveResults] = await Promise.all([
      searchUsers(query),
      searchLiveChannels(query)
    ]);
    
    // Merge results, prioritizing live channels and removing duplicates
    const merged = [...liveResults];
    userResults.forEach(u => {
      if (!merged.find(m => m.uid === u.uid)) {
        merged.push(u);
      }
    });

    setUsers(merged.filter(u => u.uid !== currentUser?.uid));
    
    if (currentUser) {
      const map: Record<string, boolean> = {};
      for (const user of merged) {
        map[user.uid] = await isFollowing(user.uid);
      }
      setFollowingMap(map);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    performSearch(initialQuery);
  }, [initialQuery]);

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
  
  const getFilteredUsers = () => {
    if (activeTab === 'ALL') return users;
    return users.filter(u => {
      if (activeTab === 'ARTIST') return u.accountType === 'ARTIST';
      if (activeTab === 'USER') return u.accountType === 'FAN' || !u.accountType;
      if (activeTab === 'ORGANIZATION') return u.accountType === 'ORGANIZATION' || u.accountType === 'PARTNER';
      if (activeTab === 'BRAND') return u.accountType === 'BRAND';
      return false;
    });
  };
  
  const filteredUsers = getFilteredUsers();

  return (
    <div className="p-6 lg:p-12 max-w-7xl mx-auto w-full">
      <header className="mb-12 flex items-center gap-6">
        <button onClick={onBack} className="p-3 bg-white/5 rounded-full text-primary hover:bg-white/10 transition-all">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Find</h1>
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
      
      {/* Search Tabs */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-4 hide-scrollbar">
        {(['ALL', 'ARTIST', 'USER', 'ORGANIZATION', 'BRAND'] as SearchTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-4 rounded-full font-black text-xs uppercase tracking-[0.2em] whitespace-nowrap transition-all ${
              activeTab === tab 
                ? 'bg-small-orange text-black cursor-default shadow-lg shadow-small-orange/20' 
                : 'bg-white/5 text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            {tab === 'USER' ? 'Users' : tab === 'ORGANIZATION' ? 'Organizations' : tab === 'BRAND' ? 'Brands' : tab === 'ARTIST' ? 'Artists' : 'All Results'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div key={user.uid} className="flex flex-col p-6 bg-white/[0.02] border border-theme rounded-[2.5rem] hover:bg-white/[0.04] transition-all group relative overflow-hidden">
             {/* Background glow based on account type */}
             <div className="absolute top-0 inset-x-0 h-32 opacity-20 group-hover:opacity-30 transition-opacity bg-gradient-to-b from-small-orange/40 to-transparent pointer-events-none" />
             
             <div className="relative z-10">
              <div 
                className="flex items-start gap-5 cursor-pointer mb-4"
                onClick={() => onVisitUser(user.uid)}
              >
                <div className="w-16 h-16 rounded-full bg-white/10 overflow-hidden flex items-center justify-center ring-2 ring-white/10 shrink-0">
                  {user.photoURL ? <img src={user.photoURL || null} alt={user.displayName} className="w-full h-full object-cover" /> : <User size={24} className="text-white/20" />}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-display font-black text-xl uppercase tracking-tight truncate hover:text-small-orange transition-colors">{user.displayName}</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
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
                  className={`w-full flex items-center justify-center gap-3 px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${followingMap[user.uid] ? 'bg-white/5 text-primary border border-theme hover:bg-white/10 text-white/50' : 'bg-small-orange text-black hover:bg-white'}`}
                >
                  {followingMap[user.uid] ? <><UserMinus size={14} /> Unfollow</> : <><UserPlus size={14} /> Follow</>}
                </button>
              )}
              
              <LatestCreation uid={user.uid} />
            </div>
          </div>
        ))}
        {filteredUsers.length === 0 && !isLoading && (
          <div className="col-span-full py-20 text-center opacity-20 uppercase font-black tracking-[0.4em] text-xs">No {activeTab.toLowerCase()} accounts found</div>
        )}
      </div>
    </div>
  );
};

export default SearchView;

