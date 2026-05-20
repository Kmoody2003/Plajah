import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Tv,
  Radio,
  LayoutGrid,
  Gamepad2,
  Image as ImageIcon,
  Library,
  Camera,
  Edit3,
  Notebook,
  User as UserIcon, 
  Music, 
  Video as VideoIcon, 
  BookOpen, 
  Users, 
  UserPlus, 
  UserMinus,
  ArrowLeft,
  ExternalLink,
  Heart,
  ShoppingBag,
  HeartHandshake,
  Sparkles,
  Sparkles as SparklesIcon,
  Settings,
  MessageSquare,
  Plus,
  X,
  TrendingUp,
  Play,
  Check,
  Mail,
  Shield,
  Box,
  Pen,
  MoreHorizontal,
  Share,
  AppWindow,
  Zap,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { 
  UserProfile, 
  Album, 
  AppView,
  MerchItem,
  Game,
  WebApp,
  IPWorld,
  ProfileThemePreset
} from '../types';
import { 
  fetchUserProfile,
  fetchUserContent, 
  fetchFollowedArtists, 
  followUser, 
  unfollowUser, 
  isFollowing,
  fetchFriends,
  fetchArtistMerch,
  addUserGame,
  fetchUserApps,
  fetchUserWorlds,
  saveWebApp,
  updateUserProfile,
  updateAccountType,
  subscribeToMailingList,
  unsubscribeFromMailingList,
  isSubscribedToMailingList,
  listenToUserArticles,
  createDemoArticle,
  claimPioneerReward,
  auth,
  fetchSystemSettingsConfig,
  seedDemoWorlds,
  fetchUserThemePresets,
  fetchThemePresetsByIds
} from '../services/backendService';
import { motion, AnimatePresence } from 'motion/react';
import { Article, SystemSettingsConfig } from '../types';
import MerchStore from './MerchStore';
import StoreView from './StoreView';
import DonationModal from './DonationModal';
import MerchManager from './MerchManager';
import PhotoGallery from './PhotoGallery';
import ThreeDImage from './ThreeDImage';
import PhotoManager from './PhotoManager';
import MyLibraryView from './MyLibraryView';
import ArtistMembersArea from './ArtistMembersArea';
import ProfileFeed from './ProfileFeed';
import InterestsNotebook from './InterestsNotebook';
import VideoTab from './VideoTab';
import WorldManagerView from './WorldManagerView';
import WorldsView from './WorldsView';
import ShareButton from './ShareButton';
import PayItForwardButton from './PayItForwardButton';
import { uploadFile } from '../services/backendService';

interface UserProfileViewProps {
  uid: string;
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onSelectGame: (game: Game) => void;
  onVisitUser: (uid: string) => void;
  onMessage?: (uid: string) => void;
  onSelectArticle?: (article: Article) => void;
  onSelectApp?: (app: WebApp) => void;
  initialTab?: 'FEED' | 'CONTENT' | 'FOLLOWING' | 'FRIENDS' | 'MERCH' | 'PHOTOS' | 'LIVE_TV' | 'GAMES' | 'APPS' | 'MANAGE' | 'LIVE_CHAT' | 'LIBRARY' | 'MEMBERS';
}

const UserProfileSlideshow: React.FC<{ items: { id: string; url: string; type: 'PHOTO' | 'VIDEO' }[], themeColor: string }> = ({ items, themeColor }) => {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handlePlay = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'VIDEO' && target !== videoRef.current) {
        setIsPaused(true);
      }
    };
    const handlePause = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'VIDEO' && target !== videoRef.current) {
        // Only unpause if there are no other videos playing?
        // Let's just do a simple check
        const anyPlaying = Array.from(document.querySelectorAll('video')).some(v => !v.paused && v !== videoRef.current);
        if (!anyPlaying) {
          setIsPaused(false);
        }
      }
    };

    document.addEventListener('play', handlePlay, true);
    document.addEventListener('pause', handlePause, true);

    return () => {
      document.removeEventListener('play', handlePlay, true);
      document.removeEventListener('pause', handlePause, true);
    };
  }, []);

  useEffect(() => {
    if (isPaused && videoRef.current) {
      videoRef.current.pause();
    } else if (!isPaused && videoRef.current) {
      videoRef.current.play().catch(console.error);
    }
  }, [isPaused, index]);

  useEffect(() => {
    if (!items.length || isPaused) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [items.length, isPaused]);

  if (!items.length) return null;

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 0.4, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full"
        >
          {items[index].type === 'VIDEO' ? (
            <video ref={videoRef} src={items[index].url} className="w-full h-full object-cover" autoPlay loop muted playsInline />
          ) : (
            <img src={items[index].url} className="w-full h-full object-cover" />
          )}
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/80 mix-blend-multiply" />
      <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundColor: themeColor }} />
    </div>
  );
};

const UserProfileView: React.FC<UserProfileViewProps> = ({ 
  uid, 
  onBack, 
  onSelectAlbum,
  onSelectGame,
  onVisitUser,
  onMessage,
  onSelectArticle,
  onSelectApp,
  initialTab
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [content, setContent] = useState<Album[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [followedArtists, setFollowedArtists] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [merch, setMerch] = useState<MerchItem[]>([]);
  const [userApps, setUserApps] = useState<WebApp[]>([]);
  const [worlds, setWorlds] = useState<IPWorld[]>([]); // Added
  const [themes, setThemes] = useState<ProfileThemePreset[]>([]); // Added
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'FEED' | 'CONTENT' | 'ARTICLES' | 'FOLLOWING' | 'FRIENDS' | 'MERCH' | 'PHOTOS' | 'LIVE_TV' | 'GAMES' | 'APPS' | 'MANAGE' | 'LIVE_CHAT' | 'LIBRARY' | 'MEMBERS' | 'INTERESTS' | 'VIDEOS' | 'WORLDS' | 'ARTIST_DETAIL' | 'PODCASTS' | 'THEMES'>(initialTab || 'FEED');
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isAddGameModalOpen, setIsAddGameModalOpen] = useState(false);
  const [isAddAppModalOpen, setIsAddAppModalOpen] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig | null>(null);
  
  // New App Stats
  const [newAppTitle, setNewAppTitle] = useState('');
  const [newAppUrl, setNewAppUrl] = useState('');
  const [newAppThumb, setNewAppThumb] = useState('');
  const [newAppDesc, setNewAppDesc] = useState('');
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);
  const [newGameTitle, setNewGameTitle] = useState('');
  const [newGameUrl, setNewGameUrl] = useState('');
  const [newGameThumb, setNewGameThumb] = useState('');
  const [newGameDesc, setNewGameDesc] = useState('');
  const [isSubmittingGame, setIsSubmittingGame] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isXMenuOpen, setIsXMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      let unsubArticles: any;
      try {
        const [p, c, f, fr, m, apps, isF, isS, settings] = await Promise.all([
          fetchUserProfile(uid).catch(() => null),
          fetchUserContent(uid).catch(() => []),
          fetchFollowedArtists(uid).catch(() => []),
          fetchFriends(uid).catch(() => []),
          fetchArtistMerch(uid).catch(() => []),
          fetchUserApps(uid).catch(() => []),
          isFollowing(uid).catch(() => false),
          isSubscribedToMailingList(uid).catch(() => false),
          fetchSystemSettingsConfig().catch(() => null),
        ]);
        setProfile(p as any);
        setContent(c as any);
        setFollowedArtists(f as any);
        setFriends(fr as any);
        setMerch(m as any);
        setUserApps(apps as any);
        fetchUserWorlds(uid).then(w => setWorlds(w)).catch(() => setWorlds([]));
        fetchUserThemePresets(uid).then(t => {
           let allThemes = [...t];
           if (p && p.savedThemePresets && p.savedThemePresets.length > 0) {
              fetchThemePresetsByIds(p.savedThemePresets).then(saved => {
                 setThemes([...allThemes, ...saved.filter(st => !allThemes.some(a => a.id === st.id))]);
              }).catch(() => setThemes(allThemes));
           } else {
              setThemes(allThemes);
           }
        }).catch(() => setThemes([]));
        setFollowing(isF as boolean);
        setIsSubscribed(isS as boolean);
        setSystemSettings(settings as any);

        // Set default tab if provided by profile and no initialTab override
        if (p && p.defaultProfileTab && !initialTab) {
          setActiveTab(p.defaultProfileTab as any);
        }
        
        // Load articles
        unsubArticles = listenToUserArticles(uid, (userArticles) => {
          setArticles(userArticles);
          // If no articles and it's own profile, create demo
          if (userArticles.length === 0 && uid === auth.currentUser?.uid) {
            createDemoArticle().catch(console.error);
          }
        });

        // Seed demo worlds if this is the artist's own profile
        if (uid === auth.currentUser?.uid && p && p.accountType === 'ARTIST') {
          seedDemoWorlds().catch(console.error);
        }

        // If no content, default to following tab (Listener view)
        if (c && c.length === 0 && f && f.length > 0) {
          setActiveTab('FOLLOWING');
        } else if (c && c.length === 0 && f && f.length === 0 && fr && fr.length > 0) {
          setActiveTab('FRIENDS');
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
      } finally {
        setLoading(false);
      }
      return () => {
        if (unsubArticles) unsubArticles();
      }
    };
    const cleanup = loadData();
    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, [uid, initialTab]);

  const handleFollowToggle = async () => {
    if (!auth.currentUser) return;
    if (following) {
      await unfollowUser(uid);
      setFollowing(false);
      setProfile(prev => prev ? { ...prev, followerCount: prev.followerCount - 1 } : null);
    } else {
      await followUser(uid);
      setFollowing(true);
      setProfile(prev => prev ? { ...prev, followerCount: prev.followerCount + 1 } : null);
    }
  };

  const handleMailingListToggle = async () => {
    if (!auth.currentUser) return;
    if (isSubscribed) {
      await unsubscribeFromMailingList(uid);
      setIsSubscribed(false);
    } else {
      await subscribeToMailingList(uid);
      setIsSubscribed(true);
    }
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameTitle || !newGameUrl) return;
    
    setIsSubmittingGame(true);
    try {
      const newGame = await addUserGame({
        title: newGameTitle,
        url: newGameUrl,
        thumbnailUrl: newGameThumb || `https://picsum.photos/seed/${Date.now()}/800/450`,
        description: newGameDesc
      });
      
      if (newGame) {
        setProfile(prev => prev ? {
          ...prev,
          games: [...(prev.games || []), newGame]
        } : null);
        setIsAddGameModalOpen(false);
        setNewGameTitle('');
        setNewGameUrl('');
        setNewGameThumb('');
        setNewGameDesc('');
      }
    } catch (error) {
      console.error("Error adding game:", error);
    } finally {
      setIsSubmittingGame(false);
    }
  };

  const handleAddApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppTitle || !newAppUrl || !auth.currentUser) return;
    
    setIsSubmittingApp(true);
    try {
      const appId = await saveWebApp({
        ownerId: auth.currentUser.uid,
        developerName: auth.currentUser.displayName || 'Anonymous',
        title: newAppTitle,
        url: newAppUrl,
        thumbnailUrl: newAppThumb || `https://picsum.photos/seed/${Date.now()}/800/450`,
        description: newAppDesc,
        category: 'Utility',
        size: '0 MB',
        rating: 0,
        reviewCount: 0,
        installCount: 0,
        isGlobalArchive: true,
        state: 'PUBLISHED',
        timestamp: Date.now()
      });
      
      if (appId) {
        const newApp: WebApp = {
          id: appId,
          ownerId: auth.currentUser?.uid || 'anonymous',
          developerName: auth.currentUser?.displayName || 'Anonymous',
          title: newAppTitle,
          url: newAppUrl,
          thumbnailUrl: newAppThumb || `https://picsum.photos/seed/${Date.now()}/800/450`,
          description: newAppDesc,
          category: 'Utility',
          size: '0 MB',
          rating: 0,
          reviewCount: 0,
          installCount: 0,
          isGlobalArchive: true,
          state: 'PUBLISHED',
          timestamp: Date.now(),
          screenshots: [],
          version: '1.0.0'
        };
        setUserApps(prev => [newApp, ...prev]);
        setIsAddAppModalOpen(false);
        setNewAppTitle('');
        setNewAppUrl('');
        setNewAppThumb('');
        setNewAppDesc('');
      }
    } catch (error) {
      console.error("Error adding app:", error);
    } finally {
      setIsSubmittingApp(false);
    }
  };

  const handleProfileUpdate = async (type: 'photo' | 'cover', file: File) => {
    if (!auth.currentUser) return;
    setIsUpdatingProfile(true);
    try {
      const url = await uploadFile(`users/${uid}/${type}_${Date.now()}`, file);
      const updates = type === 'photo' ? { customPhotoURL: url, photoURL: url } : { coverArt: url };
      await updateUserProfile(uid, updates);
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const [isLivePlayerExpanded, setIsLivePlayerExpanded] = useState(false);
  const [isLivePlaying, setIsLivePlaying] = useState(false);

  useEffect(() => {
    if (!isLivePlayerExpanded) {
      setIsLivePlaying(false);
    }
  }, [isLivePlayerExpanded]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-white/40 bg-theme h-screen">
        <p>User not found.</p>
        <button onClick={onBack} className="mt-4 text-small-orange uppercase font-black text-xs tracking-widest">Go Back</button>
      </div>
    );
  }

  const isOwnProfile = auth.currentUser?.uid === uid;

  const handleClaimPioneerReward = async () => {
    if (!auth.currentUser) return;
    await claimPioneerReward(auth.currentUser.uid);
    // Refresh profile locally
    setProfile(prev => prev ? { 
      ...prev, 
      pioneerRewardClaimed: true, 
      storageLimit: 0,
      tier: 'PIONEER'
    } : null);
  };
  const isCreator = profile.accountType !== 'FAN';

  return (
    <div className="min-h-screen bg-transparent text-white pb-32 relative selection:bg-small-orange selection:text-black">
      {/* Background Slideshow */}
      {profile.backgroundSlideshow?.enabled && profile.backgroundSlideshow.items.length > 0 && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <UserProfileSlideshow items={profile.backgroundSlideshow.items} themeColor={profile.brandColor || '#FF8C00'} />
        </div>
      )}

      <div className="relative z-10 w-full">
        {/* Mobile Sticky Header */}
        {isMobile && (
          <div className="fixed top-0 left-0 right-0 z-[150] bg-white/20 backdrop-blur-3xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0">
                 <img src={profile?.customPhotoURL || profile?.photoURL || `https://picsum.photos/seed/${uid}/100/100`} loading="lazy" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-[10px] font-black uppercase tracking-widest truncate">{profile?.displayName || 'Artist Profile'}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="p-2 text-white/40 hover:text-white"><ArrowLeft size={18} /></button>
              <button onClick={() => setShowMoreActions(!showMoreActions)} className="p-2 text-white/40 hover:text-white"><MoreHorizontal size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <div className={`relative ${isMobile ? 'h-24' : 'h-40 lg:h-56'} w-full overflow-hidden group/header z-10`}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent z-10" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-theme to-transparent z-10" />
        <ThreeDImage 
          src={profile.coverArt || profile.photoURL || `https://picsum.photos/seed/${profile.uid}/1920/1080`} 
          alt="Banner" 
          className="w-full h-full object-cover transition-transform duration-1000 group-hover/header:scale-105"
        />
        
        {isOwnProfile && (
          <label className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 opacity-0 group-hover/header:opacity-100 transition-all cursor-pointer backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-white text-black rounded-3xl shadow-2xl">
                <Camera size={isMobile ? 20 : 24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Update Banner</span>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*" 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProfileUpdate('cover', file);
              }}
            />
          </label>
        )}
        
        <button 
          onClick={onBack}
          className={`absolute ${isMobile ? 'top-3 left-3' : 'top-6 left-6'} z-30 p-2 lg:p-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full hover:bg-white/20 transition-all`}
        >
          <ArrowLeft size={isMobile ? 18 : 20} />
        </button>
      </div>

      {/* Profile Info */}
      <div className={`max-w-7xl mx-auto px-4 lg:px-16 ${isMobile ? '-mt-12' : '-mt-16 lg:-mt-24'} relative z-30`}>
        {isOwnProfile && isCreator && (
          <div className={`mb-8 p-6 bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl ${isMobile ? 'mt-4' : 'mt-12 lg:mt-0'}`}>
            <div className={isMobile ? 'text-center' : ''}>
              <h3 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black uppercase tracking-tighter mb-1`}>Share Your Creations</h3>
              <p className="text-white/80 text-xs lg:text-sm font-medium">Upload new albums, videos, or articles to your profile.</p>
            </div>
            <button 
              onClick={() => {
                const event = new CustomEvent('NAVIGATE', { detail: { target: 'CREATOR' } });
                window.dispatchEvent(event);
              }}
              className="w-full md:w-auto px-8 py-4 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] lg:text-xs hover:scale-105 transition-transform flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Plus size={16} />
              Upload Content
            </button>
          </div>
        )}

        <div className={`flex flex-col ${isMobile ? 'items-center text-center' : 'lg:flex-row lg:items-end'} gap-6 lg:gap-10`}>
          <div className="relative group/avatar">
            <div className="absolute -inset-2 bg-gradient-to-r from-small-orange to-[#FF8C00] rounded-[3rem] blur opacity-25 group-hover/avatar:opacity-50 transition duration-1000" />
            <div className={`relative ${isMobile ? 'w-32 h-32' : 'w-40 h-40 lg:w-56 lg:h-56'} rounded-[2.5rem] lg:rounded-[3rem] overflow-hidden border-4 lg:border-8 border-theme bg-white/5`}>
              <ThreeDImage 
                src={profile.customPhotoURL || profile.photoURL || null} 
                alt={profile.displayName} 
                className="w-full h-full object-cover"
              />
              {profile.liveStreamConfig?.isActive && (
                <div className="absolute top-3 right-3 lg:top-4 lg:right-4 z-20">
                  <div className="w-3 h-3 lg:w-4 lg:h-4 bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.8)] border-2 border-white" />
                </div>
              )}
              {isOwnProfile && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-all cursor-pointer backdrop-blur-md">
                  <div className="flex flex-col items-center gap-2">
                    <Camera size={isMobile ? 20 : 24} />
                    <span className="text-[7px] lg:text-[8px] font-black uppercase tracking-widest">Update Photo</span>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleProfileUpdate('photo', file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
          
          <div className="flex-1 w-full">
            <div className={`flex flex-col ${isMobile ? 'items-center' : 'lg:items-start'} gap-2 mb-4`}>
              <div className={`flex items-center gap-3 ${isMobile ? 'flex-col' : ''}`}>
                <h1 className={`${isMobile ? 'text-4xl' : 'text-5xl sm:text-7xl md:text-9xl lg:text-[12rem]'} font-black uppercase tracking-tighter break-words max-w-full text-white leading-[0.8] italic select-none`}>
                  {profile.displayName}
                </h1>
                
                <div className="flex items-center gap-2">
                  {profile.tier === 'PIONEER' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.3)] border border-yellow-400/30" title="Early Adopter - Pioneer Status">
                      <Sparkles size={14} className="text-white" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white">Pioneer</span>
                    </div>
                  )}

                  {isOwnProfile && profile.isPioneer && !profile.pioneerRewardClaimed && (
                    <button 
                      onClick={handleClaimPioneerReward}
                      className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full text-white text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                    >
                      Claim Pioneer Reward
                    </button>
                  )}
                </div>
                  
                {profile.liveStreamConfig?.isActive && (
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-full flex items-center gap-2">
                      <div className="w-1 h-1 bg-white rounded-full" />
                      On Air
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setIsLivePlayerExpanded(!isLivePlayerExpanded);
                            if (!isLivePlayerExpanded) setIsLivePlaying(true);
                          }}
                          className={`px-4 py-2 rounded-full transition-all border flex items-center gap-2 ${isLivePlayerExpanded ? 'bg-white text-black border-white' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}
                        >
                          <Tv size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                            {isLivePlayerExpanded ? 'Close' : 'Watch Live'}
                          </span>
                        </button>

                      {profile.radioSettings?.enabled && (
                        <button 
                          onClick={() => {
                            const event = new CustomEvent('NAVIGATE', { 
                              detail: { target: 'RADIO', artistId: profile.uid } 
                            });
                            window.dispatchEvent(event);
                          }}
                          className="px-4 py-2 bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 text-[#00DAF3] rounded-full transition-all border border-[#00DAF3]/30 flex items-center gap-2"
                        >
                          <Radio size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Artist Radio</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!profile.liveStreamConfig?.isActive && profile.radioSettings?.enabled && (
                   <button 
                    onClick={() => {
                      const event = new CustomEvent('NAVIGATE', { 
                        detail: { target: 'RADIO', artistId: profile.uid } 
                      });
                      window.dispatchEvent(event);
                    }}
                    className="px-6 py-3 bg-[#00DAF3] text-black rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-3 shadow-[0_0_20px_rgba(0,218,243,0.3)]"
                  >
                    <Radio size={18} />
                    <span className="text-[12px] font-black uppercase tracking-widest">Artist Radio</span>
                  </button>
                )}
              </div>
              <p className={`text-white/60 max-w-2xl font-medium leading-relaxed ${isMobile ? 'text-xs mt-2' : 'text-sm mt-2'}`}>
                {profile.bio || "No bio yet. This artist is letting their work speak for itself."}
              </p>
            </div>
            
            <div className={`flex flex-col ${isMobile ? 'items-center' : 'lg:flex-row lg:items-end'} gap-6`}>
              <div className="flex items-center gap-8">
                <div className="text-center lg:text-left">
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black text-white`}>{profile.followerCount}</p>
                  <p className="text-[9px] lg:text-[10px] font-bold text-white/40 uppercase tracking-widest">Followers</p>
                </div>
                <div className="text-center lg:text-left">
                  <p className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black text-white`}>{profile.followingCount}</p>
                  <p className="text-[9px] lg:text-[10px] font-bold text-white/40 uppercase tracking-widest">Following</p>
                </div>
              </div>

              <div className={`flex items-center gap-3 ${isMobile ? 'w-full justify-center' : ''}`}>
                {isMobile ? (
                  <>
                    <button 
                      onClick={handleFollowToggle}
                      className={`flex-1 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                        following 
                          ? 'bg-white/10 text-white' 
                          : 'bg-small-orange text-black'
                      }`}
                    >
                      {following ? <UserMinus size={14} /> : <UserPlus size={14} />}
                      {following ? 'Unfollow' : 'Follow'}
                    </button>
                    {onMessage && uid !== auth.currentUser?.uid && (
                      <button 
                        onClick={() => onMessage(uid)}
                        className="p-3 bg-white/5 border border-white/10 rounded-full text-white"
                      >
                        <MessageSquare size={18} />
                      </button>
                    )}
                    <div className="relative">
                      <button 
                        onClick={() => setShowMoreActions(!showMoreActions)}
                        className="p-3 bg-white/5 border border-white/10 rounded-full text-white"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      <AnimatePresence>
                        {showMoreActions && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute bottom-full right-0 mb-4 w-48 bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50"
                          >
                            <button 
                              onClick={() => { handleMailingListToggle(); setShowMoreActions(false); }}
                              className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-3 border-b border-white/5"
                            >
                              <Mail size={14} /> {isSubscribed ? 'Unsubscribe' : 'Mailing List'}
                            </button>
                            <button 
                              onClick={() => { setIsDonationModalOpen(true); setShowMoreActions(false); }}
                              className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-3 border-b border-white/5"
                            >
                              <HeartHandshake size={14} /> Gifts & tips
                            </button>
                            <button 
                              onClick={() => { /* Share logic */ setShowMoreActions(false); }}
                              className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-3"
                            >
                              <Share size={14} /> Share Profile
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                ) : (
                  <>
                    <PayItForwardButton variant="FULL" />
                    <ShareButton 
                      title={`${profile.displayName}'s Profile`}
                      text={`Check out ${profile.displayName} on Plajah!`}
                      url={`${window.location.origin}/profile/${profile.uid}`}
                      className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/60 hover:text-white"
                    />

                      {(profile.xUrl || profile.xHandle) && (
                      <div className="relative">
                        <button 
                          className="p-4 rounded-full transition-all flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
                          title="X Social Signal - Coming Soon"
                        >
                          <X size={18} />
                          <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">Soon</span>
                        </button>
                      </div>
                    )}
                    {!isOwnProfile && auth.currentUser && (
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={handleFollowToggle}
                          className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 ${
                            following 
                              ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-500' 
                              : 'bg-small-orange text-black hover:scale-105 active:scale-95'
                          }`}
                        >
                          {following ? <UserMinus size={14} /> : <UserPlus size={14} />}
                          {following ? 'Unfollow' : 'Follow'}
                        </button>

                        <button 
                          onClick={handleMailingListToggle}
                          className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2 ${
                            isSubscribed 
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                          }`}
                        >
                          <Mail size={14} />
                          {isSubscribed ? 'Subscribed' : 'Join Mailing List'}
                        </button>
                        
                        <button 
                          onClick={() => setIsDonationModalOpen(true)}
                          className="px-8 py-3 bg-white/5 border border-white/10 rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                        >
                          <HeartHandshake size={14} className="text-small-orange" />
                          Gifts & tips
                        </button>
                        {onMessage && uid !== auth.currentUser?.uid && (
                          <button 
                            onClick={() => onMessage(uid)}
                            className="px-8 py-3 bg-small-orange text-white font-black text-xs uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all flex items-center gap-2"
                          >
                            <MessageSquare size={14} />
                            Message
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {isOwnProfile && (profile.role === 'admin' || profile.role === 'staff') && (
                  <button 
                    onClick={() => {
                      const event = new CustomEvent('NAVIGATE', { detail: { target: 'ADMIN_DASHBOARD' } });
                      window.dispatchEvent(event);
                    }}
                    className={`px-6 lg:px-8 py-3 bg-red-600 text-white font-black text-[10px] lg:text-xs uppercase tracking-widest rounded-full hover:bg-red-700 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.3)] ${isMobile ? 'w-full justify-center' : ''}`}
                  >
                    <Shield size={14} />
                    Admin Panel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pinned Items Row */}
        {profile.pinnedItems && profile.pinnedItems.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/80 flex items-center gap-3">
                <Sparkles size={14} className="text-small-orange" /> Pinned Items
              </h3>
              <div className="h-px flex-1 bg-white/5 mx-6" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {profile.pinnedItems.map((pin, idx) => {
                 let displayItem: any = null;
                 if (pin.type === 'POST') displayItem = { title: 'Pinned Post', type: 'POST', cover: `https://picsum.photos/seed/${pin.id}/400/300` };
                 if (pin.type === 'VIDEO') displayItem = { title: 'Pinned Video', type: 'VIDEO', cover: `https://picsum.photos/seed/${pin.id}/400/300` };
                 if (pin.type === 'AUDIO') displayItem = { title: 'Pinned Audio', type: 'AUDIO', cover: `https://picsum.photos/seed/${pin.id}/400/300` };
                 
                 return (
                   <div key={pin.id} className="group relative aspect-video rounded-2xl overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                     <img 
                       src={displayItem?.cover}
                       alt={displayItem?.title}
                       className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                       referrerPolicy="no-referrer"
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                     <div className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white/80 shrink-0">
                        <Zap size={10} className="text-small-orange fill-small-orange" />
                     </div>
                     <div className="absolute inset-x-0 bottom-0 p-4">
                       <div className="flex items-center gap-2 mb-1">
                         <span className="px-1.5 py-0.5 bg-small-orange/20 text-small-orange text-[7px] font-black uppercase tracking-widest rounded-sm backdrop-blur-md border border-small-orange/20">
                           {displayItem?.type}
                         </span>
                       </div>
                       <h4 className="text-[10px] font-black uppercase tracking-tight text-white truncate group-hover:text-small-orange transition-colors">
                         {displayItem?.title}
                       </h4>
                     </div>
                   </div>
                 );
               })}
            </div>
          </div>
        )}

        {/* Latest Releases Highlight Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-3">
              <Sparkles size={14} className="text-small-orange" /> Latest Releases
            </h3>
            <div className="h-px flex-1 bg-white/5 mx-6" />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ...content.map(c => ({ ...c, releaseType: 'ALBUM' })),
              ...articles.map(a => ({ ...a, releaseType: 'ARTICLE', title: a.title, coverImage: a.coverImage, createdAt: a.timestamp })),
              ...merch.map(m => ({ ...m, releaseType: 'MERCH', title: m.title, coverImage: m.imageUrl, createdAt: m.timestamp })),
              ...userApps.map(a => ({ ...a, releaseType: 'APP', title: a.title, coverImage: a.thumbnailUrl, createdAt: a.timestamp })),
              ...(profile.games || []).map(g => ({ ...g, releaseType: 'GAME', title: g.title, coverImage: g.thumbnailUrl, createdAt: g.timestamp })),
              ...(profile.videos || []).map(v => ({ ...v, releaseType: 'VIDEO', title: v.title, coverImage: v.thumbnailUrl || v.coverImageUrl, createdAt: v.timestamp }))
            ]
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 6)
            .map((release, idx) => (
              <motion.div
                key={`${release.id}-${idx}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  if (release.releaseType === 'ALBUM') onSelectAlbum(release as any);
                  else if (release.releaseType === 'ARTICLE') onSelectArticle?.(release as any);
                  else if (release.releaseType === 'MERCH') setActiveTab('MERCH');
                  else if (release.releaseType === 'GAME') onSelectGame(release as any);
                  else if (release.releaseType === 'APP') {
                    if (onSelectApp) onSelectApp(release as any);
                    else setActiveTab('APPS');
                  }
                  else if (release.releaseType === 'VIDEO') onSelectAlbum(release as any);
                }}
                className="group relative aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-white/20 transition-all"
              >
                <img 
                  src={release.coverImage || `https://picsum.photos/seed/${release.id}/400/500`} 
                  alt={release.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-small-orange/20 text-small-orange text-[7px] font-black uppercase tracking-widest rounded-sm backdrop-blur-md border border-small-orange/20">
                      {release.releaseType}
                    </span>
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-tight text-white truncate group-hover:text-small-orange transition-colors">
                    {release.title}
                  </h4>
                </div>
              </motion.div>
            ))}
            
            {/* If no releases, show placeholders */}
            {[...Array(Math.max(0, 6 - [
              ...content, ...articles, ...merch, ...(profile.games || []), ...(profile.videos || [])
            ].length))].map((_, i) => (
              <div key={`empty-${i}`} className="aspect-[4/5] rounded-2xl border border-dashed border-white/5 flex items-center justify-center">
                <Sparkles size={16} className="text-white/5" />
              </div>
            ))}
          </div>
        </div>

        {/* Tabs Container (Sticky & Overflow Scroll) */}
        <div className={`mt-12 lg:mt-16 sticky ${isMobile ? 'top-14' : 'top-0'} bg-theme z-40 border-b border-white/10 -mx-4 px-4 lg:mx-0 lg:px-0`}>
          <div className="flex items-center gap-6 lg:gap-8 overflow-x-auto scrollbar-hide py-2 translate-y-[1px]">
          {[
            { id: 'FEED', label: 'Feed' },
            { id: 'CONTENT', label: 'Creations' },
            { id: 'PODCASTS', label: 'Podcasts' },
            { id: 'WORLDS', label: 'Worlds' },
            { id: 'ARTICLES', label: 'Articles' },
            { id: 'PHOTOS', label: 'Photos' },
            { id: 'VIDEOS', label: 'Videos' },
            { id: 'THEMES', label: 'Themes' },
            { id: 'APPS', label: 'Apps' },
            ...(profile?.accountType !== 'FAN' ? [
              { id: 'LIVE_TV', label: 'Live TV' },
              { id: 'GAMES', label: 'Games' },
              { id: 'LIVE_CHAT', label: 'Live Chat' },
              { id: 'MERCH', label: 'Store' },
              { id: 'ARTIST_DETAIL', label: 'Special' }
            ] : []),
            { id: 'FOLLOWING', label: 'Following' },
            { id: 'FRIENDS', label: 'Friends' },
            { id: 'INTERESTS', label: 'Interests' },
            ...(isOwnProfile ? [{ id: 'LIBRARY', label: 'Library' }] : []),
            ...(isOwnProfile && profile?.accountType !== 'FAN' ? [{ id: 'MANAGE', label: 'Management' }] : []),
            ...(profile?.accountType !== 'FAN' ? [{ id: 'MEMBERS', label: 'Sanctuary' }] : [])
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                // Scroll into view on mobile
                const el = document.getElementById(`tab-${tab.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }}
              id={`tab-${tab.id}`}
              className={`pb-4 text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all border-b-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id ? 'text-small-orange border-small-orange' : 'text-white/20 border-transparent hover:text-white/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-12">
          <AnimatePresence mode="wait">
            {activeTab === 'FEED' ? (
              <motion.div 
                key="feed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ProfileFeed 
                  uid={uid} 
                  profileName={profile.displayName} 
                  onVisitUser={onVisitUser} 
                  xHandle={profile.xHandle}
                  xEmbedHtml={profile.xEmbedHtml}
                  mastodonHandle={profile.mastodonHandle}
                  mastodonInstance={profile.mastodonInstance}
                  blueskyHandle={profile.blueskyHandle}
                  threadsHandle={profile.threadsHandle}
                  onUpdateXHandle={async (handle) => {
                    if (!auth.currentUser || auth.currentUser.uid !== uid) return;
                    try {
                      await updateUserProfile(uid, { xHandle: handle });
                      setProfile(prev => prev ? { ...prev, xHandle: handle } : null);
                    } catch (error) {
                      console.error("Error updating X handle:", error);
                    }
                  }}
                />
              </motion.div>
            ) : activeTab === 'INTERESTS' ? (
              <motion.div 
                key="interests"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <InterestsNotebook profile={profile} isOwner={isOwnProfile} onUpdate={setProfile} />
              </motion.div>
            ) : activeTab === 'PODCASTS' ? (
              <motion.div 
                key="podcasts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {isOwnProfile && (
                  <div className="flex justify-end">
                    <button 
                      onClick={() => {
                        const event = new CustomEvent('NAVIGATE', { 
                          detail: { 
                            target: 'CREATOR', 
                            params: { editingAlbum: { type: 'MUSIC', subType: 'PODCAST', artist: profile.displayName } } 
                          } 
                        });
                        window.dispatchEvent(event);
                      }}
                      className="flex items-center gap-2 px-6 py-3 bg-small-orange text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 transition-all shadow-lg"
                    >
                      <Plus size={14} />
                      Add Podcast
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {content.filter(a => a.subType === 'PODCAST').map(album => (
                    <div key={album.id} onClick={() => onSelectAlbum(album)} className="p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] group hover:bg-white/[0.06] transition-all cursor-pointer">
                      <div className="aspect-square rounded-2xl overflow-hidden mb-6 relative">
                        <img src={album.coverImage || null} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" alt={album.title} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play size={48} fill="white" className="text-white" />
                        </div>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest truncate mb-1">{album.title}</h4>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4">By {album.artist}</p>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">{album.genre}</span>
                        <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">{album.tracks?.length || 0} Episodes</span>
                      </div>
                    </div>
                  ))}
                  {content.filter(a => a.subType === 'PODCAST').length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                      <Radio size={48} className="text-white/5 mx-auto mb-4" />
                      <p className="text-white/20 uppercase font-black tracking-[0.5em]">No podcasts published yet.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : activeTab === 'VIDEOS' ? (
              <motion.div 
                key="videos"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <VideoTab 
                  profile={profile} 
                  isOwner={isOwnProfile} 
                  onSelectVideo={onSelectAlbum}
                />
              </motion.div>
            ) : activeTab === 'THEMES' ? (
              <motion.div key="themes" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 space-y-6">
                    {themes.map(theme => (
                       <div key={theme.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group cursor-pointer hover:border-white/30 transition-all">
                          <div className="aspect-video relative bg-black/50 overflow-hidden">
                             {theme.coverImage ? (
                                <img src={theme.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                             ) : theme.assets && theme.assets.length > 0 ? (
                                theme.assets[0].type === 'PHOTO' ? <img src={theme.assets[0].url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" /> : <video src={theme.assets[0].url} className="w-full h-full object-cover" muted loop autoPlay />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-white/10">
                                 <ImageIcon size={48} />
                               </div>
                             )}
                             <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black to-transparent">
                               <span className="text-[10px] font-black uppercase tracking-widest text-small-orange bg-black/50 px-2 py-1 rounded inline-block">{theme.mode}</span>
                               {profile?.savedThemePresets?.includes(theme.id) && theme.creatorId !== profile.uid && (
                                  <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-white/50 bg-black/50 px-2 py-1 rounded inline-block">Collected</span>
                               )}
                             </div>
                          </div>
                          <div className="p-6">
                             <h3 className="font-bold text-lg mb-1 truncate">{theme.title}</h3>
                             <p className="text-xs opacity-50 line-clamp-2">{theme.description}</p>
                             <div className="mt-4 flex items-center justify-between">
                               <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{theme.assets?.length || 0} Assets</span>
                               {isOwnProfile && profile?.activeThemePresetId === theme.id ? (
                                  <button
                                     className="px-3 py-1 bg-green-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                     Active
                                  </button>
                               ) : isOwnProfile && (
                                  <button
                                     onClick={async (e) => {
                                         e.stopPropagation();
                                         const videoAsset = theme.assets?.find(a => a.type === 'VIDEO');
                                         const photoAsset = theme.assets?.find(a => a.type === 'PHOTO');
                                         const vUrl = videoAsset ? videoAsset.url : null;
                                         const fUrl = photoAsset ? photoAsset.url : (theme.coverImage || null);
                                         
                                         try {
                                             await updateUserProfile(profile!.uid, {
                                                 videoBackgroundUrl: vUrl || null,
                                                 frostedBackground: fUrl || null,
                                                 videoBackgroundBlur: true,
                                                 videoBackgroundFrosted: true,
                                                 activeThemePresetId: theme.id
                                             });
                                             // Update the profile object locally to trigger UI update
                                             setProfile(prev => prev ? {
                                                ...prev,
                                                videoBackgroundUrl: vUrl || null,
                                                frostedBackground: fUrl || null,
                                                videoBackgroundBlur: true,
                                                videoBackgroundFrosted: true,
                                                activeThemePresetId: theme.id
                                             } : prev);
                                         } catch (e) {
                                             console.error('Failed to activate theme', e);
                                             alert('Failed to activate theme.');
                                         }
                                     }}
                                     className="px-3 py-1 bg-white/10 hover:bg-white text-white hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                     Activate
                                  </button>
                               )}

                               {!isOwnProfile && auth.currentUser && (
                                  <button
                                     onClick={async (e) => {
                                         e.stopPropagation();
                                         try {
                                            const myProfile = await fetchUserProfile(auth.currentUser!.uid);
                                            if (myProfile) {
                                               const currentSaved = myProfile.savedThemePresets || [];
                                               if (!currentSaved.includes(theme.id)) {
                                                  await updateUserProfile(auth.currentUser!.uid, { savedThemePresets: [...currentSaved, theme.id] });
                                                  alert('Added to your personal theme library!');
                                               } else {
                                                  alert('Theme is already in your library.');
                                               }
                                            }
                                         } catch(err) {
                                            console.error('Failed to save theme', err);
                                         }
                                     }}
                                     className="px-3 py-1 bg-white/10 hover:bg-white text-white hover:text-black rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                     Collect
                                  </button>
                               )}
                             </div>
                          </div>
                       </div>
                    ))}
                    {themes.length === 0 && (
                      <div className="col-span-full py-40 text-center opacity-20">
                        <Sparkles size={64} className="mx-auto mb-6" />
                        <p className="text-xl font-black uppercase tracking-[0.5em]">No themes available.</p>
                      </div>
                    )}
                 </div>
              </motion.div>
            ) : activeTab === 'APPS' ? (
              <motion.div 
                key="apps"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {isOwnProfile && (
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setIsAddAppModalOpen(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-small-orange text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 transition-all"
                    >
                      <Plus size={14} />
                      Submit New App
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {userApps.map(app => (
                    <div key={app.id} className="p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] group hover:bg-white/[0.06] transition-all">
                      <div className="aspect-video rounded-2xl overflow-hidden mb-4 relative">
                        <img src={app.thumbnailUrl || null} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" alt={app.title} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <AppWindow size={32} className="text-white" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                         <h4 className="text-sm font-black uppercase tracking-widest truncate flex-1">{app.title}</h4>
                      </div>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4 line-clamp-2">{app.description}</p>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                             if (onSelectApp) onSelectApp(app);
                             else {
                               // Fallback: Navigate to global Apps view with this app selected?
                               // For now just alert or something
                               const event = new CustomEvent('NAVIGATE', { detail: { target: 'APPS', params: { appId: app.id } } });
                               window.dispatchEvent(event);
                             }
                          }}
                          className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 text-center"
                        >
                          Open App
                        </button>
                      </div>
                    </div>
                  ))}
                  {userApps.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                      <AppWindow size={48} className="text-white/5 mx-auto mb-4" />
                      <p className="text-white/20 uppercase font-black tracking-[0.5em]">No web apps published yet.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : activeTab === 'LIBRARY' && isOwnProfile ? (
              <motion.div 
                key="library"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MyLibraryView profile={profile} onUpdate={setProfile} />
              </motion.div>
            ) : activeTab === 'WORLDS' ? (
              <motion.div 
                key="worlds"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <WorldsView 
                  onNavigate={(view) => {
                    const event = new CustomEvent('NAVIGATE', { detail: { target: view } });
                    window.dispatchEvent(event);
                  }} 
                  userProfile={profile} 
                  artistUid={uid}
                />
              </motion.div>
            ) : activeTab === 'MEMBERS' ? (
              <motion.div 
                key="members"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ArtistMembersArea artistId={profile.uid} artist={profile} onBack={() => setActiveTab('FEED')} />
              </motion.div>
            ) : activeTab === 'CONTENT' ? (
              <motion.div 
                key="content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-16"
              >
                {content.length > 0 ? (
                  <>
                    {/* Top Content (Music/Video/Book/Game) */}
                    <section>
                      <h3 className="text-xl font-black uppercase tracking-widest mb-8 flex items-center gap-3">
                        <TrendingUp className="text-small-orange" size={20} /> Top 5 Creations
                      </h3>
                      <div className="space-y-4">
                        {[...content].sort((a, b) => (b.tracks?.length || 0) - (a.tracks?.length || 0)).slice(0, 5).map((album, idx) => (
                          <div 
                            key={album.id}
                            onClick={() => onSelectAlbum(album)}
                            className="flex items-center justify-between p-6 bg-white/[0.03] border border-white/5 rounded-[2rem] hover:bg-white/[0.06] transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-6">
                              <span className="text-2xl font-black text-white/10 group-hover:text-small-orange transition-colors">0{idx + 1}</span>
                              <div className="w-16 h-16 rounded-2xl overflow-hidden">
                                <img src={album.coverImage || null} className="w-full h-full object-cover" alt={album.title} />
                              </div>
                              <div>
                                <h4 className="text-sm font-black uppercase tracking-widest mb-1">{album.title}</h4>
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{album.genre} • {album.type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-8">
                              <div className="text-right">
                                <p className="text-xs font-black text-white">{album.tracks?.length || 0}</p>
                                <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Items</p>
                              </div>
                              <div className="p-4 bg-white/5 rounded-full text-white/20 group-hover:text-white transition-colors">
                                <Play size={16} fill="currentColor" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* All Content Grid */}
                    <section>
                      <h3 className="text-xl font-black uppercase tracking-widest mb-8 flex items-center gap-3">
                        <LayoutGrid className="text-small-orange" size={20} /> Full Catalog
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {content.map((album) => (
                          <div 
                            key={album.id}
                            onClick={() => onSelectAlbum(album)}
                            className="group cursor-pointer"
                          >
                            <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-4 bg-white/5 transition-all group-hover:scale-[1.02] group-hover:shadow-2xl">
                              <img 
                                src={album.coverImage || null} 
                                alt={album.title} 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black scale-0 group-hover:scale-100 transition-transform duration-500">
                                  {album.type === 'VIDEO' ? <VideoIcon size={20} /> : album.type === 'BOOK' ? <BookOpen size={20} /> : <Music size={20} />}
                                </div>
                              </div>
                            </div>
                            <h3 className="text-sm font-black uppercase tracking-widest mb-1 truncate">{album.title}</h3>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{album.type}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <p className="text-white/20 uppercase font-black tracking-[0.5em]">No creations yet.</p>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'MANAGE' && isOwnProfile ? (
              <motion.div 
                key="manage"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  {/* Radio Settings */}
                  <div className="bg-white/5 p-8 lg:p-12 rounded-[3rem] border border-white/10">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-4 bg-small-orange/20 rounded-2xl">
                        <Radio size={24} className="text-small-orange" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tightest">Radio Station</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Broadcast Settings</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 ml-4">Station Identity</label>
                        <input 
                          type="text"
                          value={profile.radioSettings?.stationName || ''}
                          onChange={(e) => setProfile({ ...profile, radioSettings: { 
                            ...{
                              enabled: false,
                              stingers: [],
                              ads: [],
                              stingerFrequency: 3,
                              ...(profile.radioSettings || {})
                            },
                            stationName: e.target.value 
                          } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold focus:ring-2 ring-small-orange transition-all outline-none"
                          placeholder="e.g. Neon Horizon Radio"
                        />
                      </div>

                      <div className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/5">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest">Broadcast Active</p>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Enable your personal radio station</p>
                        </div>
                        <button 
                          onClick={() => {
                            const newEnabled = !profile.radioSettings?.enabled;
                            setProfile({ ...profile, radioSettings: { 
                              stingers: [],
                              ads: [],
                              stingerFrequency: 3,
                              ...(profile.radioSettings || {}), 
                              enabled: newEnabled 
                            } });
                          }}
                          className={`w-14 h-8 rounded-full p-1 transition-all ${profile.radioSettings?.enabled ? 'bg-small-orange' : 'bg-white/10'}`}
                        >
                          <div className={`w-6 h-6 rounded-full bg-white transition-all ${profile.radioSettings?.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 ml-4">Sync Collaborators (On-Platform Creators)</label>
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                           {followedArtists.map(artist => (
                             <button 
                              key={artist.uid}
                              onClick={() => {
                                const current = profile.radioSettings?.otherCreators || [];
                                const next = current.includes(artist.uid) ? current.filter(id => id !== artist.uid) : [...current, artist.uid];
                                setProfile({ ...profile, radioSettings: { 
                                    enabled: profile.radioSettings?.enabled ?? false,
                                    stingers: profile.radioSettings?.stingers ?? [],
                                    ads: profile.radioSettings?.ads ?? [],
                                    stingerFrequency: profile.radioSettings?.stingerFrequency ?? 3,
                                    ...(profile.radioSettings || {}), 
                                    otherCreators: next 
                                  } });
                              }}
                              className={`p-4 rounded-xl flex items-center justify-between transition-all ${profile.radioSettings?.otherCreators?.includes(artist.uid) ? 'bg-small-orange/20 border-small-orange/40 border' : 'bg-white/5 border border-transparent'}`}
                             >
                                <div className="flex items-center gap-3">
                                  <img src={artist.photoURL || null} className="w-8 h-8 rounded-lg object-cover" />
                                  <span className="text-[10px] font-black uppercase tracking-tight">{artist.displayName}</span>
                                </div>
                                {profile.radioSettings?.otherCreators?.includes(artist.uid) ? <Check size={14} className="text-small-orange" /> : <Plus size={14} className="text-white/20" />}
                             </button>
                           ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Background Slideshow Settings */}
                  <div className="bg-white/5 p-8 lg:p-12 rounded-[3rem] border border-white/10">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                        <div className="p-4 bg-blue-500/20 rounded-2xl">
                          <ImageIcon size={24} className="text-blue-500" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tightest">Profile Background Slideshow</h3>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Crossfade Photos & Videos (No Audio)</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const newEnabled = !(profile.backgroundSlideshow?.enabled);
                          setProfile({ ...profile, backgroundSlideshow: { 
                            items: profile.backgroundSlideshow?.items || [],
                            ...(profile.backgroundSlideshow || {}),
                            enabled: newEnabled 
                          } });
                        }}
                        className={`w-14 h-8 rounded-full p-1 transition-all ${profile.backgroundSlideshow?.enabled ? 'bg-blue-500' : 'bg-white/10'}`}
                      >
                        <div className={`w-6 h-6 rounded-full bg-white transition-all ${profile.backgroundSlideshow?.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="space-y-6">
                      <p className="text-xs text-white/40 mb-4">Paste image or video URLs to add up to 20 items to your background slideshow. Reorder by dragging (not implemented yet, just add in order).</p>
                      
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          id="new-slideshow-url"
                          placeholder="https://... (.jpg, .mp4)"
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-white/30"
                        />
                        <button 
                          onClick={() => {
                            const input = document.getElementById('new-slideshow-url') as HTMLInputElement;
                            const url = input.value;
                            if (url && (profile.backgroundSlideshow?.items?.length || 0) < 20) {
                              const isVideo = url.match(/\.(mp4|webm|ogg)$/i);
                              const newItem: any = { id: Date.now().toString(), url, type: isVideo ? 'VIDEO' : 'PHOTO' };
                              setProfile({ 
                                ...profile, 
                                backgroundSlideshow: { 
                                  enabled: profile.backgroundSlideshow?.enabled || false,
                                  items: [...(profile.backgroundSlideshow?.items || []), newItem]
                                } 
                              });
                              input.value = '';
                            }
                          }}
                          className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                        >
                          Add
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        {profile.backgroundSlideshow?.items?.map((item, index) => (
                          <div key={item.id} className="relative aspect-video bg-black/50 rounded-xl overflow-hidden group border border-white/10">
                            {item.type === 'VIDEO' ? (
                              <video src={item.url} className="w-full h-full object-cover opacity-50" muted playsInline />
                            ) : (
                              <img src={item.url} className="w-full h-full object-cover opacity-50" />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 gap-2">
                              {index > 0 && (
                                <button 
                                  onClick={() => {
                                    const newItems = [...profile.backgroundSlideshow!.items];
                                    const temp = newItems[index - 1];
                                    newItems[index - 1] = newItems[index];
                                    newItems[index] = temp;
                                    setProfile({
                                      ...profile,
                                      backgroundSlideshow: {
                                        ...profile.backgroundSlideshow!,
                                        items: newItems
                                      }
                                    });
                                  }}
                                  className="p-1 bg-white/20 rounded-full text-white hover:bg-white/40"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  setProfile({
                                    ...profile,
                                    backgroundSlideshow: {
                                      enabled: profile.backgroundSlideshow?.enabled || false,
                                      items: profile.backgroundSlideshow!.items.filter(i => i.id !== item.id)
                                    }
                                  });
                                }}
                                className="p-2 bg-red-500/80 rounded-full text-white hover:bg-red-500"
                              >
                                <Trash2 size={16} />
                              </button>
                              {index < (profile.backgroundSlideshow?.items.length || 0) - 1 && (
                                <button 
                                  onClick={() => {
                                    const newItems = [...profile.backgroundSlideshow!.items];
                                    const temp = newItems[index + 1];
                                    newItems[index + 1] = newItems[index];
                                    newItems[index] = temp;
                                    setProfile({
                                      ...profile,
                                      backgroundSlideshow: {
                                        ...profile.backgroundSlideshow!,
                                        items: newItems
                                      }
                                    });
                                  }}
                                  className="p-1 bg-white/20 rounded-full text-white hover:bg-white/40"
                                >
                                  <ChevronRight size={16} />
                                </button>
                              )}
                            </div>
                            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[8px] font-black uppercase text-white">{index + 1}</div>
                            <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[8px] font-black uppercase text-white">{item.type}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Pinned Items Settings */}
                  <div className="bg-white/5 p-8 lg:p-12 rounded-[3rem] border border-white/10 lg:col-span-2">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-4 bg-small-orange/20 rounded-2xl">
                        <Zap size={24} className="text-small-orange" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tightest">Pinned Items</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Showcase your best content at the top</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex gap-2">
                        <select id="pin-type" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none">
                          <option value="POST">Post</option>
                          <option value="VIDEO">Video</option>
                          <option value="AUDIO">Audio</option>
                        </select>
                        <input 
                          type="text"
                          id="pin-ref-id"
                          placeholder="Content ID or URL..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-white/30"
                        />
                        <button 
                          onClick={() => {
                            const typeInput = document.getElementById('pin-type') as HTMLSelectElement;
                            const refInput = document.getElementById('pin-ref-id') as HTMLInputElement;
                            if (refInput.value) {
                              const newPin: any = { id: Date.now().toString(), type: typeInput.value, refId: refInput.value };
                              setProfile({ 
                                ...profile, 
                                pinnedItems: [...(profile.pinnedItems || []), newPin]
                              });
                              refInput.value = '';
                            }
                          }}
                          className="bg-small-orange text-black hover:bg-small-orange/80 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                        >
                          Pin Item
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        {profile.pinnedItems?.map((pin) => (
                          <div key={pin.id} className="relative aspect-video bg-black/50 rounded-xl overflow-hidden group border border-white/10 flex items-center justify-center">
                            <span className="text-[10px] font-black uppercase text-white/60">{pin.type}: {pin.refId.substring(0, 8)}...</span>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/80">
                              <button 
                                onClick={() => {
                                  setProfile({
                                    ...profile,
                                    pinnedItems: profile.pinnedItems!.filter(i => i.id !== pin.id)
                                  });
                                }}
                                className="p-2 bg-red-500/80 rounded-full text-white"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Dual Video Stream Settings */}
                  <div className="bg-white/5 p-8 lg:p-12 rounded-[3rem] border border-white/10">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="p-4 bg-[#00DAF3]/20 rounded-2xl">
                        <VideoIcon size={24} className="text-[#00DAF3]" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tightest">Dual Stream Ops</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">FAST Channel & Live Feed</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                       <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 ml-4">Live Broadcast Source</label>
                        <input 
                          type="url"
                          value={profile.liveStreamConfig?.streamUrl || ''}
                          onChange={(e) => setProfile({ ...profile, liveStreamConfig: { 
                            title: '',
                            isActive: false,
                            source: 'Custom',
                            ...(profile.liveStreamConfig || {}), 
                            streamUrl: e.target.value 
                          } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold focus:ring-2 ring-[#00DAF3] transition-all outline-none"
                          placeholder="Twitch/M3U8/YouTube Live URL"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 ml-4">FAST Channel Archive (24/7 Mix)</label>
                        <input 
                          type="url"
                          value={profile.liveStreamConfig?.fastChannelUrl || ''}
                          onChange={(e) => setProfile({ ...profile, liveStreamConfig: { 
                            title: '',
                            isActive: false,
                            source: 'Custom',
                            streamUrl: '',
                            ...(profile.liveStreamConfig || {}), 
                            fastChannelUrl: e.target.value 
                          } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold focus:ring-2 ring-purple-500 transition-all outline-none"
                          placeholder="Curated Loop URL"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => setProfile({ ...profile, liveStreamConfig: { 
                            title: profile.liveStreamConfig?.title ?? '',
                            source: profile.liveStreamConfig?.source ?? 'Custom',
                            streamUrl: profile.liveStreamConfig?.streamUrl ?? '',
                            ...(profile.liveStreamConfig || { title: '', isActive: false, source: 'Custom', streamUrl: '' }), 
                            isActive: !profile.liveStreamConfig?.isActive 
                          } })}
                          className={`p-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all border ${profile.liveStreamConfig?.isActive ? 'bg-red-600 border-red-600 text-white shadow-xl' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                        >
                          <div className={`w-3 h-3 rounded-full ${profile.liveStreamConfig?.isActive ? 'bg-white animate-pulse' : 'bg-white/20'}`} />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">{profile.liveStreamConfig?.isActive ? 'LIVE SIGNAL ON' : 'SIGNAL OFF'}</span>
                        </button>

                        <button 
                          onClick={() => {
                            const current = profile.liveStreamConfig?.activeStreamType || 'FAST';
                            const next = current === 'FAST' ? 'LIVE' : 'FAST';
                            setProfile({ ...profile, liveStreamConfig: { 
                              title: '',
                              isActive: false,
                              source: 'Custom',
                              streamUrl: '',
                              ...(profile.liveStreamConfig || {}), 
                              activeStreamType: next 
                            } });
                          }}
                          className="p-6 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-white/10 transition-all group"
                        >
                          <LayoutGrid size={24} className="text-[#00DAF3] group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Switch Stream Mode</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exclusive Content Manager */}
                <div className="bg-white/5 p-8 lg:p-12 rounded-[3rem] border border-white/10">
                   <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                        <div className="p-4 bg-purple-500/20 rounded-2xl">
                          <Sparkles size={24} className="text-purple-500" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tightest">Exclusive Access Tier</h3>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Interviews, Tracks, and Special Content</p>
                        </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {content.map(item => (
                        <button 
                          key={item.id}
                          onClick={() => {
                            const current = profile.radioSettings?.exclusiveContentIds || [];
                            const next = current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id];
                            setProfile({ ...profile, radioSettings: { 
                              enabled: false,
                              stingers: [],
                              ads: [],
                              stingerFrequency: 3,
                              ...(profile.radioSettings || {}), 
                              exclusiveContentIds: next 
                            } });
                          }}
                          className={`p-4 rounded-3xl border transition-all text-left flex flex-col gap-4 group ${profile.radioSettings?.exclusiveContentIds?.includes(item.id) ? 'bg-purple-500/10 border-purple-500/40' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                        >
                           <div className="relative aspect-square rounded-2xl overflow-hidden grayscale group-hover:grayscale-0 transition-all">
                              <img src={item.coverImage || null} className="w-full h-full object-cover" />
                              {profile.radioSettings?.exclusiveContentIds?.includes(item.id) && (
                                <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                                   <div className="px-3 py-1 bg-purple-500 rounded-full text-[8px] font-black text-white uppercase tracking-widest">EXCLUSIVE</div>
                                </div>
                              )}
                           </div>
                           <p className="text-[10px] font-black uppercase tracking-widest truncate">{item.title}</p>
                        </button>
                      ))}
                   </div>
                </div>

                <div className="flex justify-end pt-8">
                  <button 
                    onClick={async () => {
                      setIsUpdatingProfile(true);
                      try {
                        await updateUserProfile(uid, {
                          radioSettings: profile.radioSettings,
                          liveStreamConfig: profile.liveStreamConfig
                        });
                        alert('Station settings uplinked successfully!');
                      } catch (err) {
                        console.error(err);
                        alert('Operation failed');
                      } finally {
                        setIsUpdatingProfile(false);
                      }
                    }}
                    disabled={isUpdatingProfile}
                    className="px-12 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl disabled:opacity-50"
                  >
                    {isUpdatingProfile ? 'COMMITTING CHANGES...' : 'SAVE ALL STATION SETTINGS'}
                  </button>
                </div>
              </motion.div>
            ) : activeTab === 'ARTICLES' ? (
              <motion.div 
                key="articles"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                    <BookOpen className="text-small-orange" size={20} /> Published Articles
                  </h3>
                  {isOwnProfile && (
                    <button 
                      onClick={() => {
                        const event = new CustomEvent('NAVIGATE', { detail: { target: 'ARTICLE_EDITOR' } });
                        window.dispatchEvent(event);
                      }}
                      className="px-6 py-2 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                    >
                      New Article
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {articles.map((article) => (
                    <div 
                      key={article.id}
                      onClick={() => onSelectArticle?.(article)}
                      className="group bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/5 hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <div className="aspect-video relative overflow-hidden">
                        <img src={article.coverImage || null} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute top-6 left-6 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest text-white">
                          {article.category || 'Article'}
                        </div>
                      </div>
                      <div className="p-8">
                        <h4 className="text-xl font-black uppercase tracking-tighter mb-3 group-hover:text-small-orange transition-colors line-clamp-2">{article.title}</h4>
                        <p className="text-xs text-white/40 line-clamp-2 mb-6 font-medium leading-relaxed">{article.subtitle}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-white/20">
                            <span className="flex items-center gap-1"><Heart size={10} /> {article.likesCount}</span>
                            <span className="flex items-center gap-1"><MessageSquare size={10} /> {article.commentsCount}</span>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/20">{article.readTime || 5} min read</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {articles.length === 0 && (
                  <div className="py-20 text-center">
                    <p className="text-white/20 uppercase font-black tracking-[0.5em]">No articles published yet.</p>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'PHOTOS' ? (
              <motion.div 
                key="photos"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {isOwnProfile ? (
                  <PhotoManager profile={profile} onUpdate={setProfile} />
                ) : (
                  <PhotoGallery uid={uid} isOwner={isOwnProfile} />
                )}
              </motion.div>
            ) : activeTab === 'LIVE_TV' ? (
              <motion.div 
                key="tv"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="p-8 lg:p-12 bg-white/[0.02] border border-white/5 rounded-[3rem]">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-small-orange/20 rounded-2xl">
                        <Tv className="text-small-orange" size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tightest">Artist TV</h3>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Curated FAST Channel & Live Broadcasts</p>
                      </div>
                    </div>

                    <div className="flex p-1.5 bg-white/5 rounded-2xl border border-white/5">
                      <button 
                        onClick={() => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { title: '', isActive: false, source: 'Custom', streamUrl: '' }), activeStreamType: 'FAST' } })}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${profile.liveStreamConfig?.activeStreamType === 'FAST' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}
                      >
                        FAST Channel
                      </button>
                      <button 
                        onClick={() => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { title: '', isActive: false, source: 'Custom', streamUrl: '' }), activeStreamType: 'LIVE' } })}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${profile.liveStreamConfig?.activeStreamType === 'LIVE' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}
                      >
                        Live Feed
                      </button>
                      {(profile.liveStreamConfig?.fastChannelUrl && profile.liveStreamConfig?.streamUrl) && (
                        <button 
                          onClick={() => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { title: '', isActive: false, source: 'Custom', streamUrl: '' }), activeStreamType: 'DUAL' as any } })}
                          className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${profile.liveStreamConfig?.activeStreamType === ('DUAL' as any) ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}
                        >
                          Dual Mode
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={`grid gap-8 ${profile.liveStreamConfig?.activeStreamType === ('DUAL' as any) ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                    {(profile.liveStreamConfig?.activeStreamType === 'FAST' || profile.liveStreamConfig?.activeStreamType === ('DUAL' as any)) && (
                      <div className="space-y-4">
                        <div className="relative aspect-video bg-black rounded-[2.5rem] overflow-hidden border border-white/10 shadow-3xl">
                          {profile.liveStreamConfig?.fastChannelUrl ? (
                            <iframe 
                              src={profile.liveStreamConfig.fastChannelUrl || undefined}
                              className="w-full h-full border-none"
                              allow="autoplay; encrypted-media; fullscreen"
                              title="FAST Channel"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-theme to-black p-12 text-center">
                              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                                <Tv size={40} className="text-white/20" />
                              </div>
                              <h4 className="text-xl font-black uppercase tracking-tightest mb-2">FAST Channel Offline</h4>
                            </div>
                          )}
                        </div>
                        <div className="px-6 py-2 bg-white/5 rounded-full inline-block">
                           <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">24/7 FAST CHANNEL</span>
                        </div>
                      </div>
                    )}

                    {(profile.liveStreamConfig?.activeStreamType === 'LIVE' || profile.liveStreamConfig?.activeStreamType === ('DUAL' as any)) && (
                      <div className="space-y-4">
                        <div className="relative aspect-video bg-black rounded-[2.5rem] overflow-hidden border border-white/10 shadow-3xl">
                          {profile.liveStreamConfig?.isActive && profile.liveStreamConfig?.streamUrl ? (
                            <iframe 
                              src={profile.liveStreamConfig.streamUrl || undefined}
                              className="w-full h-full border-none"
                              allow="autoplay; encrypted-media; fullscreen"
                              title="Live Feed"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-theme to-black p-12 text-center">
                              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                                <Radio size={40} className="text-white/20" />
                              </div>
                              <h4 className="text-xl font-black uppercase tracking-tightest mb-2">Live Feed Offline</h4>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="px-6 py-2 bg-red-600/10 border border-red-600/20 rounded-full inline-flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${profile.liveStreamConfig?.isActive ? 'bg-red-600 animate-pulse' : 'bg-white/20'}`} />
                             <span className="text-[8px] font-black uppercase tracking-[0.3em] text-red-600">LIVE FEED</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 flex items-center justify-between p-6 bg-white/5 rounded-[2rem] border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-small-orange/20 flex items-center justify-center">
                        <Sparkles size={20} className="text-small-orange" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-widest">{profile.liveStreamConfig?.title || 'Artist Broadcast'}</h4>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                          {profile.liveStreamConfig?.activeStreamType === 'LIVE' ? 'Live Stream' : 'FAST Channel'}
                        </p>
                      </div>
                    </div>
                    {profile.liveStreamConfig?.isActive && profile.liveStreamConfig?.activeStreamType === 'LIVE' && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-600/10 border border-red-600/20 rounded-full">
                        <div className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-red-600">On Air</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'GAMES' ? (
              <motion.div 
                key="games"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {isOwnProfile && (
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setIsAddGameModalOpen(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-small-orange text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 transition-all"
                    >
                      <Plus size={14} />
                      Add Game Link
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {profile.games?.map(game => (
                    <div key={game.id} className="p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] group hover:bg-white/[0.06] transition-all">
                      <div className="aspect-video rounded-2xl overflow-hidden mb-4 relative">
                        <img src={game.thumbnailUrl || null} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" alt={game.title} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Gamepad2 size={32} className="text-white" />
                        </div>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest mb-2">{game.title}</h4>
                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4 line-clamp-2">{game.description}</p>
                      <button 
                        onClick={() => onSelectGame(game)}
                        className="block w-full py-3 bg-white/5 border border-white/10 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 text-center"
                      >
                        Play Now
                      </button>
                    </div>
                  ))}
                  {(!profile.games || profile.games.length === 0) && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                      <Gamepad2 size={48} className="text-white/5 mx-auto mb-4" />
                      <p className="text-white/20 uppercase font-black tracking-[0.5em]">No games hosted yet.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : activeTab === 'LIVE_CHAT' ? (
              <motion.div 
                key="live_chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`bg-white/[0.02] border border-white/5 rounded-[2.5rem] lg:rounded-[3rem] overflow-hidden ${isMobile ? 'h-[500px]' : 'h-[600px]'} flex flex-col`}
              >
                <div className={`p-6 lg:p-8 border-b border-white/5 flex items-center justify-between`}>
                  <div>
                    <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-black uppercase tracking-tightest`}>Live Fan Chat</h3>
                    <p className="text-[9px] lg:text-[10px] font-bold text-small-orange uppercase tracking-widest">Public conversation with {profile.displayName}</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-green-500/10 rounded-full">
                    <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-green-500 rounded-full" />
                    <span className="text-[8px] lg:text-[10px] font-black text-green-500 uppercase tracking-widest">Live</span>
                  </div>
                </div>
                <div className="flex-1 p-6 lg:p-8 flex flex-col items-center justify-center text-center">
                  <div className={`w-20 h-20 lg:w-24 lg:h-24 bg-white/5 rounded-[1.5rem] lg:rounded-[2rem] flex items-center justify-center mb-6`}>
                    <MessageSquare size={isMobile ? 28 : 32} className="text-white/20" />
                  </div>
                  <h4 className={`${isMobile ? 'text-base' : 'text-lg'} font-black uppercase tracking-widest mb-2`}>Join the Conversation</h4>
                  <p className="text-[10px] lg:text-xs font-bold text-white/30 uppercase tracking-widest max-w-xs leading-loose">
                    This is a public chat for fans of {profile.displayName}. Be respectful and have fun!
                  </p>
                  <button 
                    onClick={() => onMessage?.(uid)}
                    className="mt-8 px-8 lg:px-10 py-3 lg:py-4 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-small-orange/80 transition-all"
                  >
                    Enter Public Chat
                  </button>
                </div>
              </motion.div>
            ) : activeTab === 'MERCH' ? (
              <motion.div 
                key="merch"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <StoreView 
                  artistId={uid} 
                  artistName={profile.displayName} 
                  merch={merch} 
                  albums={content}
                  settings={profile.storeSettings}
                  onSelectContent={(item) => {
                    if ('type' in item && item.type === 'BOOK' && onSelectAlbum) {
                      onSelectAlbum(item as Album);
                    } else if (onSelectAlbum) {
                      onSelectAlbum(item as Album);
                    }
                  }}
                />
              </motion.div>
            ) : activeTab === 'ARTIST_DETAIL' ? (
              <motion.div 
                key="artist_detail"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                  {/* Hero Image / Cover */}
                  <div className="relative h-64 md:h-96 rounded-[3rem] overflow-hidden">
                    <img src={profile.coverArt || profile.photoURL || null} className="w-full h-full object-cover" alt="Hero banner" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                    <div className="absolute bottom-8 left-8">
                       <h2 className="text-5xl font-black uppercase tracking-widest">{profile.displayName}</h2>
                    </div>
                  </div>

                  {/* Stats & Facts */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {['Followers', 'Creations', 'Years Active'].map(stat => (
                      <div key={stat} className="bg-white/5 p-6 rounded-2xl border border-white/5 text-center">
                        <div className="text-3xl font-black text-small-orange mb-2">99</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">{stat}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chronological Map */}
                  <div className="bg-white/5 p-8 rounded-3xl border border-white/5">
                      <h3 className="text-xl font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-4">Chronological Release Map</h3>
                      <div className="space-y-4">
                          {profile.videos?.slice(0, 3).map((v, i) => (
                              <div key={v.id} className="flex items-center gap-4 bg-black/20 p-4 rounded-xl">
                                  <span className="font-black text-white/20 text-xl">0{i+1}</span>
                                  <div className="w-16 h-16 bg-white/10 rounded-lg" />
                                  <div>
                                    <h4 className="font-black uppercase tracking-widest">{v.title}</h4>
                                    <p className="text-xs font-bold text-white/40">2024</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* Top Songs */}
                  <div className="bg-white/5 p-8 rounded-3xl border border-white/5">
                      <h3 className="text-xl font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-4">Top Ranked Songs</h3>
                      <div className="space-y-2">
                        {['Song 1', 'Song 2', 'Song 3'].map((song, i) => (
                           <div key={song} className="flex justify-between items-center bg-black/20 p-4 rounded-xl">
                               <span className="font-black">{i+1}. {song}</span>
                               <span className="text-xs text-white/50 font-bold uppercase tracking-widest">Highly Rated</span>
                           </div>
                        ))}
                      </div>
                  </div>
              </motion.div>
            ) : activeTab === 'FOLLOWING' ? (
              <motion.div 
                key="following"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {followedArtists.length > 0 ? (
                  followedArtists.map((artist) => (
                    <div 
                      key={artist.uid}
                      onClick={() => onVisitUser(artist.uid)}
                      className="group relative p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] hover:bg-white/[0.06] transition-all cursor-pointer overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink size={14} className="text-small-orange" />
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="relative">
                          <div className="absolute -inset-1 bg-gradient-to-r from-small-orange to-transparent rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity" />
                          <img 
                            src={artist.photoURL || `https://picsum.photos/seed/${artist.uid}/200/200`} 
                            alt={artist.displayName} 
                            className="w-16 h-16 rounded-2xl object-cover relative border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-widest mb-1 group-hover:text-small-orange transition-colors">{artist.displayName}</h4>
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{artist.followerCount || 0} Followers</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <p className="text-white/20 uppercase font-black tracking-[0.5em]">Not following anyone yet.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="friends"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {friends.length > 0 ? (
                  friends.map((friend) => (
                    <div 
                      key={friend.uid}
                      onClick={() => onVisitUser(friend.uid)}
                      className="group relative p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] hover:bg-white/[0.06] transition-all cursor-pointer overflow-hidden"
                    >
                      <div className="absolute top-4 right-4">
                        <div className="flex items-center gap-1 bg-small-orange/10 px-2 py-1 rounded-full border border-small-orange/20">
                          <Heart size={8} className="text-small-orange fill-small-orange" />
                          <span className="text-[7px] font-black uppercase tracking-widest text-small-orange">Mutual</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="relative">
                          <div className="absolute -inset-1 bg-gradient-to-r from-small-orange to-transparent rounded-2xl blur opacity-0 group-hover:opacity-30 transition-opacity" />
                          <img 
                            src={friend.photoURL || `https://picsum.photos/seed/${friend.uid}/200/200`} 
                            alt={friend.displayName} 
                            className="w-16 h-16 rounded-2xl object-cover relative border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-widest mb-1 group-hover:text-small-orange transition-colors">{friend.displayName}</h4>
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Friend Since 2024</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <p className="text-white/20 uppercase font-black tracking-[0.5em]">No mutual friends yet.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      <DonationModal 
        isOpen={isDonationModalOpen}
        onClose={() => setIsDonationModalOpen(false)}
        toId={profile.uid}
        toName={profile.displayName}
      />

      {/* Add Game Modal */}
      <AnimatePresence>
        {isAddAppModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-theme-card border border-white/10 rounded-[2.5rem] lg:rounded-[3rem] p-6 lg:p-12 shadow-3xl overflow-y-auto max-h-[90vh] relative scrollbar-hide"
            >
              <button 
                onClick={() => setIsAddAppModalOpen(false)}
                className="absolute top-6 right-6 lg:top-8 lg:right-8 p-2 text-white/20 hover:text-white transition-all"
              >
                <X size={isMobile ? 20 : 24} />
              </button>

              <div className="mb-8 lg:mb-10">
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-small-orange/10 rounded-xl lg:rounded-2xl flex items-center justify-center mb-4 lg:mb-6 border border-small-orange/20">
                  <AppWindow size={isMobile ? 20 : 24} className="text-small-orange" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tightest mb-2">Submit New App</h2>
                <p className="text-[9px] lg:text-[10px] font-bold text-white/30 uppercase tracking-widest">Add your web app to the global archive.</p>
              </div>

              <form onSubmit={handleAddApp} className="space-y-4 lg:space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">App Title</label>
                  <input 
                    type="text"
                    required
                    value={newAppTitle}
                    onChange={(e) => setNewAppTitle(e.target.value)}
                    placeholder="e.g. Creative Suite"
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">App URL</label>
                  <input 
                    type="url"
                    required
                    value={newAppUrl}
                    onChange={(e) => setNewAppUrl(e.target.value)}
                    placeholder="https://example.com/app"
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Thumbnail URL (Optional)</label>
                  <input 
                    type="url"
                    value={newAppThumb}
                    onChange={(e) => setNewAppThumb(e.target.value)}
                    placeholder="https://example.com/thumb.jpg"
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Description</label>
                  <textarea 
                    value={newAppDesc}
                    onChange={(e) => setNewAppDesc(e.target.value)}
                    placeholder="Tell us about your app..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold h-24 lg:h-32 resize-none text-sm"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSubmittingApp}
                  className="w-full py-4 lg:py-5 bg-white text-black font-black uppercase tracking-widest text-[10px] lg:text-xs rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmittingApp ? 'Submitting...' : 'Submit to Archive'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Game Modal */}
      <AnimatePresence>
        {isAddGameModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-theme-card border border-white/10 rounded-[2.5rem] lg:rounded-[3rem] p-6 lg:p-12 shadow-3xl overflow-y-auto max-h-[90vh] relative scrollbar-hide"
            >
              <button 
                onClick={() => setIsAddGameModalOpen(false)}
                className="absolute top-6 right-6 lg:top-8 lg:right-8 p-2 text-white/20 hover:text-white transition-all"
              >
                <X size={isMobile ? 20 : 24} />
              </button>

              <div className="mb-8 lg:mb-10">
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-small-orange/10 rounded-xl lg:rounded-2xl flex items-center justify-center mb-4 lg:mb-6 border border-small-orange/20">
                  <Gamepad2 size={isMobile ? 20 : 24} className="text-small-orange" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-black uppercase tracking-tightest mb-2">Add Game Link</h2>
                <p className="text-[9px] lg:text-[10px] font-bold text-white/30 uppercase tracking-widest">Share your web-based games with your audience</p>
              </div>

              <form onSubmit={handleAddGame} className="space-y-4 lg:space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Game Title</label>
                  <input 
                    type="text"
                    required
                    value={newGameTitle}
                    onChange={(e) => setNewGameTitle(e.target.value)}
                    placeholder="e.g. Neon Runner"
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Game URL</label>
                  <input 
                    type="url"
                    required
                    value={newGameUrl}
                    onChange={(e) => setNewGameUrl(e.target.value)}
                    placeholder="https://itch.io/your-game"
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Thumbnail URL (Optional)</label>
                  <input 
                    type="url"
                    value={newGameThumb}
                    onChange={(e) => setNewGameThumb(e.target.value)}
                    placeholder="https://example.com/thumb.jpg"
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Description</label>
                  <textarea 
                    value={newGameDesc}
                    onChange={(e) => setNewGameDesc(e.target.value)}
                    placeholder="Tell us about your game..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl px-5 py-3 lg:px-6 lg:py-4 text-white focus:border-small-orange outline-none transition-all font-bold h-24 lg:h-32 resize-none text-sm"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isSubmittingGame}
                  className="w-full py-4 lg:py-5 bg-white text-black font-black uppercase tracking-widest text-[10px] lg:text-xs rounded-full hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmittingGame ? 'Adding...' : 'Add Game to Profile'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserProfileView;
