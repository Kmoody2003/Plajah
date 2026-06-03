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
  Trash2,
  Shuffle,
  Bookmark
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
  fetchThemePresetsByIds,
  subscribeToPodcast,
  unsubscribeFromPodcast,
  fetchAlbumsByIds,
  fetchFastChannelVideos,
  fetchAllUsers
} from '../services/backendService';
import { motion, AnimatePresence } from 'motion/react';
import FastChannelPlayer from './FastChannelPlayer';
import FastChannelManager from './FastChannelManager';
import { Article, SystemSettingsConfig } from '../types';
import MerchStore from './MerchStore';
import StoreView from './StoreView';
import DonationModal from './DonationModal';
import MerchManager from './MerchManager';
import PhotoGallery from './PhotoGallery';
import ThreeDImage from './ThreeDImage';
import SafeAvatarViewer from './SafeAvatarViewer';
import PhotoManager from './PhotoManager';
import MyLibraryView from './MyLibraryView';
import ArtistMembersArea from './ArtistMembersArea';
import SanctuaryView from './SanctuaryView';
import ProfileFeed from './ProfileFeed';
import InterestsNotebook from './InterestsNotebook';
import VideoTab from './VideoTab';
import ScrollableTabRow from './ScrollableTabRow';
import WorldManagerView from './WorldManagerView';
import WorldBadge from './WorldBadge';
import WorldsView from './WorldsView';
import ShareButton from './ShareButton';
import PayItForwardButton from './PayItForwardButton';
import HideNSeekManager from './HideNSeekManager';
import { uploadFile, fetchUpcomingAlbums } from '../services/backendService';
import SignInPrompt from './SignInPrompt';
import UserAnalyticsDashboard from './UserAnalyticsDashboard';
import PlajahPlusButton from './PlajahPlusButton';
import PlajahPlusLanding from './PlajahPlusLanding';
import ProfileSmartCard from './ProfileSmartCard';

interface UserProfileViewProps {
  uid: string;
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onSelectGame: (game: Game) => void;
  onVisitUser: (uid: string) => void;
  onMessage?: (uid: string) => void;
  onSelectArticle?: (article: Article) => void;
  onSelectApp?: (app: WebApp) => void;
  onNavigate?: (view: AppView) => void;
  onOpenCreator?: (type?: string) => void;
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
            <img loading="lazy" decoding="async" src={items[index].url} className="w-full h-full object-cover" />
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
  onNavigate,
  onOpenCreator,
  initialTab
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [content, setContent] = useState<Album[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [followedArtists, setFollowedArtists] = useState<UserProfile[]>([]);
  const [profileUpcomingAlbums, setProfileUpcomingAlbums] = useState<Album[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [merch, setMerch] = useState<MerchItem[]>([]);
  const [userApps, setUserApps] = useState<WebApp[]>([]);
  const [worlds, setWorlds] = useState<IPWorld[]>([]); // Added
  const [themes, setThemes] = useState<ProfileThemePreset[]>([]); // Added
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'FEED' | 'CONTENT' | 'ARTICLES' | 'FOLLOWING' | 'FRIENDS' | 'MERCH' | 'PHOTOS' | 'LIVE_TV' | 'GAMES' | 'APPS' | 'MANAGE' | 'LIVE_CHAT' | 'LIBRARY' | 'MEMBERS' | 'INTERESTS' | 'VIDEOS' | 'WORLDS' | 'ARTIST_DETAIL' | 'PODCASTS' | 'THEMES' | 'MY_HABITS' | 'MY_STATS'>(initialTab || 'FEED');
  const [feedInitialType, setFeedInitialType] = useState<'PERSONAL' | 'GLOBAL' | 'X_FEED' | 'MASTODON' | 'BLUESKY' | 'THREADS'>(
    () => auth.currentUser?.uid === uid ? 'GLOBAL' : 'PERSONAL'
  );
  const [feedKey, setFeedKey] = useState(0);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [showPlajahPlusLanding, setShowPlajahPlusLanding] = useState(false);
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
  const detectMobile = () =>
    window.matchMedia('(pointer: coarse)').matches ||
    /Mobi|Android|iPhone|iPad|iPod|IEMobile/i.test(navigator.userAgent) ||
    window.innerWidth < 1024;
  const [isMobile, setIsMobile] = useState(detectMobile);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [podcastSubTab, setPodcastSubTab] = useState<'PUBLISHED' | 'SUBSCRIBED'>('PUBLISHED');
  const [subscribedPodcasts, setSubscribedPodcasts] = useState<Album[]>([]);
  const [podcastSubscribedIds, setPodcastSubscribedIds] = useState<Set<string>>(new Set());
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`plajah-tab-order-${uid}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const dragTabRef = useRef<number | null>(null);
  const [isXMenuOpen, setIsXMenuOpen] = useState(false);
  const [hnsAlbum, setHnsAlbum] = useState<Album | null>(null);
  const [signInAction, setSignInAction] = useState<string | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const handleResize = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(detectMobile()), 150); };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(t); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubArticles: (() => void) | undefined;

    const loadData = async () => {
      setLoading(true);

      // ── Phase 1: critical data — profile + content. Clears the spinner fast. ──
      const [p, c, isF, isS, settings] = await Promise.all([
        fetchUserProfile(uid).catch(() => null),
        fetchUserContent(uid).catch(() => []),
        isFollowing(uid).catch(() => false),
        isSubscribedToMailingList(uid).catch(() => false),
        fetchSystemSettingsConfig().catch(() => null),
      ]);

      if (cancelled) return;

      setProfile(p as any);
      setContent(c as any);
      setFollowing(isF as boolean);
      setIsSubscribed(isS as boolean);
      setSystemSettings(settings as any);

      if (p && p.defaultProfileTab && !initialTab) {
        setActiveTab(p.defaultProfileTab as any);
      }

      // Articles listener — non-blocking
      unsubArticles = listenToUserArticles(uid, (userArticles) => {
        if (cancelled) return;
        setArticles(userArticles);
        if (userArticles.length === 0 && uid === auth.currentUser?.uid) {
          createDemoArticle().catch(console.error);
        }
      });

      setLoading(false);  // ← spinner clears here, profile renders

      if (uid === auth.currentUser?.uid && p && p.accountType === 'ARTIST') {
        seedDemoWorlds().catch(console.error);
      }

      // ── Phase 2: secondary data — loaded after the profile is already visible ──
      const [f, fr, m, apps, upcoming] = await Promise.all([
        fetchFollowedArtists(uid).catch(() => []),
        fetchFriends(uid).catch(() => []),
        fetchArtistMerch(uid).catch(() => []),
        fetchUserApps(uid).catch(() => []),
        fetchUpcomingAlbums().catch(() => []),
      ]);

      if (cancelled) return;

      setFollowedArtists(f as any);
      setFriends(fr as any);
      setMerch(m as any);
      setUserApps(apps as any);
      setProfileUpcomingAlbums(upcoming);

      // Default tab based on secondary data
      if ((c as any[]).length === 0 && (f as any[]).length > 0) {
        setActiveTab('FOLLOWING');
      } else if ((c as any[]).length === 0 && (f as any[]).length === 0 && (fr as any[]).length > 0) {
        setActiveTab('FRIENDS');
      }

      // Non-critical: worlds, themes, podcasts
      fetchUserWorlds(uid).then(w => { if (!cancelled) setWorlds(w); }).catch(() => {});
      fetchUserThemePresets(uid).then(t => {
        if (cancelled) return;
        if (p && p.savedThemePresets && p.savedThemePresets.length > 0) {
          fetchThemePresetsByIds(p.savedThemePresets).then(saved => {
            if (!cancelled) setThemes([...t, ...saved.filter(st => !t.some(a => a.id === st.id))]);
          }).catch(() => { if (!cancelled) setThemes(t); });
        } else {
          setThemes(t);
        }
      }).catch(() => {});

      const subIds = (p as any)?.subscribedPodcastIds || [];
      if (subIds.length > 0) {
        fetchAlbumsByIds(subIds).then(pods => { if (!cancelled) setSubscribedPodcasts(pods); }).catch(() => {});
      }
      if (auth.currentUser?.uid) {
        fetchUserProfile(auth.currentUser.uid).then(cu => {
          if (!cancelled && cu) setPodcastSubscribedIds(new Set((cu as any).subscribedPodcastIds || []));
        }).catch(() => {});
      }
    };

    loadData().catch(err => {
      console.error('Error loading user profile:', err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (unsubArticles) unsubArticles();
    };
  }, [uid, initialTab]);

  useEffect(() => {
    const own = auth.currentUser?.uid === uid;
    setFeedInitialType(own ? 'GLOBAL' : 'PERSONAL');
    setFeedKey(k => k + 1);
    setActiveTab(initialTab || 'FEED');
  }, [uid]);

  const handleFollowToggle = async () => {
    if (!auth.currentUser) { setSignInAction('follow this creator'); return; }
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
    if (!auth.currentUser) { setSignInAction('subscribe to updates'); return; }
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
    if (!newAppTitle || !newAppUrl) return;
    if (!auth.currentUser?.uid) {
      alert('Please sign in to add an app');
      return;
    }
    
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

  const [welcomeUsers, setWelcomeUsers] = useState<UserProfile[]>([]);

  const [isLivePlayerExpanded, setIsLivePlayerExpanded] = useState(false);
  const [isLivePlaying, setIsLivePlaying] = useState(false);
  const [showFastChannel, setShowFastChannel] = useState(false);
  const [hasFastContent, setHasFastContent] = useState(false);
  const [showFastChannelManager, setShowFastChannelManager] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    if (profile.fastChannelEnabled || profile.liveStreamConfig?.fastChannelUrl) {
      fetchFastChannelVideos(profile.uid).then(vids => setHasFastContent(vids.length > 0));
    }
  }, [profile?.uid, profile?.fastChannelEnabled]);

  useEffect(() => {
    if (!isLivePlayerExpanded) {
      setIsLivePlaying(false);
    }
  }, [isLivePlayerExpanded]);

  useEffect(() => {
    if (uid !== auth.currentUser?.uid) return;
    fetchAllUsers().then(allUsers => {
      const others = allUsers.filter(u => u.uid !== uid && u.displayName);
      const seed = Math.floor(Date.now() / 86400000);
      const sorted = [...others].sort((a, b) => {
        const ha = parseInt(a.uid.slice(-6), 16) || 0;
        const hb = parseInt(b.uid.slice(-6), 16) || 0;
        return ((ha + seed) % 10000) - ((hb + seed) % 10000);
      });
      setWelcomeUsers(sorted.slice(0, 3));
    }).catch(() => {});
  }, [uid]);

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
    if (!auth.currentUser?.uid) {
      alert('Please sign in to claim your reward');
      return;
    }
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

      {/* ─── Cinematic Hero ───────────────────────────────────────────────────── */}
      {/* NO overflow-hidden here — the blurred layer intentionally bleeds below */}
      <div
        className={`relative group/header z-10 ${isMobile ? 'h-[44vh] min-h-[240px]' : 'h-[55vh] min-h-[360px]'}`}
      >
        {/* Layer 0 — Blurred atmospheric bleed.
            height: 155% so it extends ~55% below the hero boundary.
            CSS mask (not a gradient overlay) fades it to transparent — no hard black edge. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: '155%',
            zIndex: 0,
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 38%, transparent 100%)',
            maskImage:       'linear-gradient(to bottom, black 0%, black 38%, transparent 100%)',
          }}
        >
          <img
            src={profile.coverArt || profile.photoURL || `https://picsum.photos/seed/${profile.uid}/1920/1080`}
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{
              filter: 'blur(48px) saturate(2.6) brightness(0.55)',
              transform: 'scale(1.12)',
              transformOrigin: 'top center',
            }}
          />
          {/* Subtle top darkening only — no black at the bottom */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.28) 0%, transparent 30%)' }}
          />
        </div>

        {/* Layer 1 — Sharp banner, mask fades it bottom-to-transparent so no hard edge */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            zIndex: 1,
            WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
            maskImage:       'linear-gradient(to bottom, black 40%, transparent 100%)',
          }}
        >
          <ThreeDImage
            src={profile.coverArt || profile.photoURL || `https://picsum.photos/seed/${profile.uid}/1920/1080`}
            alt="Banner"
            containerClassName="w-full h-full"
            className="w-full h-full object-cover object-top transition-transform duration-[2500ms] group-hover/header:scale-[1.04]"
          />
          {/* Top nav darkening for back-button legibility */}
          <div
            className="absolute inset-x-0 top-0 pointer-events-none"
            style={{ height: '35%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)', zIndex: 2 }}
          />
        </div>

        {/* Layer 2 — Edit overlay (own profile) */}
        {isOwnProfile && (
          <label
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/header:opacity-100 transition-all cursor-pointer backdrop-blur-sm"
            style={{ zIndex: 20 }}
          >
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

        {/* Layer 3 — Back button */}
        <button
          onClick={onBack}
          className={`absolute ${isMobile ? 'top-3 left-3' : 'top-6 left-6'} p-2 lg:p-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-full hover:bg-white/20 transition-all`}
          style={{ zIndex: 30 }}
        >
          <ArrowLeft size={isMobile ? 18 : 20} />
        </button>
      </div>

      {/* Profile Info — floats up over the bleed zone */}
      <div className={`max-w-7xl mx-auto px-4 lg:px-16 ${isMobile ? '-mt-16' : '-mt-24 lg:-mt-36'} relative z-30`}>
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
          <div className="relative group/avatar flex flex-col items-center gap-2">
            <div className="absolute -inset-3 bg-gradient-to-r from-small-orange via-[#D40055] to-[#6B0099] rounded-[3rem] blur-xl opacity-20 group-hover/avatar:opacity-50 transition-all duration-[1200ms]" />
            <div className={`relative ${isMobile ? 'w-32 h-32' : 'w-40 h-40 lg:w-56 lg:h-56'} rounded-[2.5rem] lg:rounded-[3rem] overflow-hidden border-4 lg:border-8 border-theme bg-white/5`}>
              {profile.avatar?.isActive ? (
                <SafeAvatarViewer config={profile.avatar} compact autoRotate className="w-full h-full" />
              ) : (
                <ThreeDImage
                  src={profile.customPhotoURL || profile.photoURL || null}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
              )}
              {profile.liveStreamConfig?.isActive && (
                <div className="absolute top-3 right-3 lg:top-4 lg:right-4 z-20">
                  <div className="w-3 h-3 lg:w-4 lg:h-4 bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.8)] border-2 border-white" />
                </div>
              )}
              {isOwnProfile && !profile.avatar?.isActive && (
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
            {isOwnProfile && onNavigate && (
              <button
                onClick={() => onNavigate('AVATAR_STUDIO')}
                className="relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ff8c00]/15 border border-[#ff8c00]/30 text-[#ff8c00] text-[9px] font-black uppercase tracking-widest hover:bg-[#ff8c00]/25 transition-all"
              >
                ✦ Avatar Studio
              </button>
            )}
          </div>
          
          <div className="flex-1 w-full">
            <div className={`flex flex-col ${isMobile ? 'items-center' : 'lg:items-start'} gap-2 mb-4`}>
              {/* Name row — avatar standing to the left on desktop */}
              <div className={`flex ${isMobile ? 'flex-col items-center' : 'flex-row items-end'} gap-4`}>
                {/* Standing avatar next to name (desktop + active avatar only) */}
                {!isMobile && profile.avatar?.isActive && (
                  <div
                    className="shrink-0 self-end"
                    style={{ width: 90, height: 220 }}
                  >
                    <SafeAvatarViewer
                      config={profile.avatar}
                      compact
                      wave
                      autoRotate={false}
                      className="w-full h-full"
                    />
                  </div>
                )}
              {/* Name — standalone, no inline badges */}
              <motion.h1
                className={`${isMobile ? 'text-4xl' : 'text-5xl sm:text-7xl md:text-9xl lg:text-[12rem]'} font-black uppercase tracking-tighter break-words max-w-full text-white leading-[0.8] italic select-none`}
                animate={{ scale: [1, 1.013, 1], opacity: [1, 0.92, 1] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: 'left center' }}
              >
                {profile.displayName}
              </motion.h1>

              {/* Pill buttons are now rendered in the dedicated strip above the bio — removed from here */}

              </div>
              {/* ↑ closes flex flex-row items-end (avatar + name outer wrapper) */}
            </div>
            {/* ── Pill row: stats + badges + action buttons — horizontal above bio ── */}
            <div className={`flex flex-wrap items-center gap-3 mt-4 mb-3 ${isMobile ? 'justify-center' : ''}`}>
              {/* Stats */}
              <div className="flex items-center gap-6 pr-5 border-r border-white/10">
                <div className={isMobile ? 'text-center' : ''}>
                  <p className="text-2xl font-black text-white leading-none tabular-nums">{profile.followerCount?.toLocaleString()}</p>
                  <p className="text-[8px] font-black text-white/35 uppercase tracking-[0.3em] mt-0.5">Followers</p>
                </div>
                <div className={isMobile ? 'text-center' : ''}>
                  <p className="text-2xl font-black text-white leading-none tabular-nums">{profile.followingCount?.toLocaleString()}</p>
                  <p className="text-[8px] font-black text-white/35 uppercase tracking-[0.3em] mt-0.5">Following</p>
                </div>
              </div>

              {/* Pioneer badge */}
              {profile.tier === 'PIONEER' && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.3)] border border-yellow-400/30">
                  <Sparkles size={12} className="text-white" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white">Pioneer</span>
                </div>
              )}
              {isOwnProfile && profile.isPioneer && !profile.pioneerRewardClaimed && (
                <button
                  onClick={handleClaimPioneerReward}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full text-white text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                >
                  Claim Pioneer Reward
                </button>
              )}

              {/* Own-profile: Share + Plajah+ + X + Pay It Forward */}
              {isOwnProfile && (
                <>
                  <PayItForwardButton variant="FULL" />
                  <ShareButton
                    title={`${profile.displayName}'s Profile`}
                    text={`Check out ${profile.displayName} on Plajah!`}
                    url={`${window.location.origin}/profile/${profile.uid}`}
                    className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/60 hover:text-white"
                  />
                  <PlajahPlusButton
                    creatorId={profile.uid}
                    creatorName={profile.displayName}
                    isOwnProfile={true}
                    onOpenLanding={() => setShowPlajahPlusLanding(true)}
                  />
                  {(profile.xUrl || profile.xHandle) && (
                    <button
                      onClick={() => { setFeedInitialType('X_FEED'); setFeedKey(k => k + 1); setActiveTab('FEED'); }}
                      className="p-3 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all"
                      title="View X Feed"
                    >
                      <X size={16} />
                    </button>
                  )}
                </>
              )}

              {/* Visitor: Follow + Mailing List + Gifts + Plajah+ + Message */}
              {!isOwnProfile && (
                <>
                  <button
                    onClick={handleFollowToggle}
                    className={`px-5 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                      following
                        ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-500'
                        : 'bg-small-orange text-black hover:scale-105 active:scale-95'
                    }`}
                  >
                    {following ? <UserMinus size={12} /> : <UserPlus size={12} />}
                    {following ? 'Unfollow' : 'Follow'}
                  </button>
                  <button
                    onClick={handleMailingListToggle}
                    className={`px-5 py-2 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${
                      isSubscribed
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                    }`}
                  >
                    <Mail size={12} />
                    {isSubscribed ? 'Subscribed' : 'Mailing List'}
                  </button>
                  <button
                    onClick={() => setIsDonationModalOpen(true)}
                    className="px-5 py-2 bg-white/5 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                  >
                    <HeartHandshake size={12} className="text-small-orange" />
                    Gifts
                  </button>
                  <PlajahPlusButton
                    creatorId={profile.uid}
                    creatorName={profile.displayName}
                    isOwnProfile={false}
                    onOpenLanding={() => setShowPlajahPlusLanding(true)}
                  />
                  {onMessage && uid !== auth.currentUser?.uid && (
                    <button
                      onClick={() => onMessage(uid)}
                      className="px-5 py-2 bg-small-orange text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all flex items-center gap-2"
                    >
                      <MessageSquare size={12} />
                      Message
                    </button>
                  )}
                </>
              )}

              {/* Admin Panel */}
              {isOwnProfile && (profile.role === 'admin' || profile.role === 'staff') && (
                <button
                  onClick={() => { window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'ADMIN_DASHBOARD' } })); }}
                  className="px-5 py-2 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-red-700 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                >
                  <Shield size={12} />
                  Admin Panel
                </button>
              )}
            </div>

            {/* ── Action pill strip — single horizontal scroll row, above bio ── */}
            {(profile.liveStreamConfig?.isActive || profile.radioSettings?.enabled || profile.fastChannelEnabled || hasFastContent || profile.liveStreamConfig?.fastChannelUrl || (isOwnProfile && (profile.fastChannelEnabled || hasFastContent))) && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 mt-1 mb-3">
                {profile.liveStreamConfig?.isActive && (
                  <div className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-full flex items-center gap-1.5 shrink-0">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />On Air
                  </div>
                )}
                {profile.liveStreamConfig?.isActive && (
                  <button onClick={() => { setIsLivePlayerExpanded(!isLivePlayerExpanded); if (!isLivePlayerExpanded) setIsLivePlaying(true); }}
                    className={`px-4 py-1.5 rounded-full transition-all border flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${isLivePlayerExpanded ? 'bg-white text-black border-white' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}>
                    <Tv size={12} />{isLivePlayerExpanded ? 'Close' : 'Watch Live'}
                  </button>
                )}
                {profile.radioSettings?.enabled && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'RADIO', artistId: profile.uid } }))}
                    className="px-4 py-1.5 bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 text-[#00DAF3] rounded-full transition-all border border-[#00DAF3]/30 flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                    <Radio size={12} />Artist Radio
                  </button>
                )}
                {(profile.fastChannelEnabled || hasFastContent || profile.liveStreamConfig?.fastChannelUrl) && (
                  <button onClick={() => setShowFastChannel(true)}
                    className="px-4 py-1.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-[0_0_14px_rgba(107,0,153,0.35)]">
                    <Tv size={12} />Watch Channel
                  </button>
                )}
                {isOwnProfile && (profile.fastChannelEnabled || hasFastContent) && (
                  <button onClick={() => setShowFastChannelManager(true)}
                    className="px-4 py-1.5 bg-white/10 border border-white/10 text-white rounded-full transition-all hover:bg-white/20 active:scale-95 flex items-center gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                    <Radio size={12} />Manage Channel
                  </button>
                )}
              </div>
            )}

            {/* Bio / quote */}
            <div className={`mt-2 ${profile.bio ? 'pl-4 border-l-2 border-small-orange/40' : ''}`}>
              <p className={`text-white/55 max-w-2xl font-medium leading-relaxed ${isMobile ? 'text-xs' : 'text-sm'}`}>
                {profile.bio || <span className="italic text-white/25">No bio yet.</span>}
              </p>
            </div>
            
          </div>
        </div>

        {/* Pinned Items Row */}
        {profile.pinnedItems && profile.pinnedItems.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-4 mb-6">
              <span className="w-0.5 h-5 bg-gradient-to-b from-small-orange to-[#D40055] rounded-full shrink-0" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-2">
                <Sparkles size={12} className="text-small-orange" /> Pinned Items
              </h3>
              <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {profile.pinnedItems.map((pin, idx) => {
                 let displayItem: any = null;
                 if (pin.type === 'POST') displayItem = { title: 'Pinned Post', type: 'POST', cover: `https://picsum.photos/seed/${pin.id}/400/300` };
                 if (pin.type === 'VIDEO') displayItem = { title: 'Pinned Video', type: 'VIDEO', cover: `https://picsum.photos/seed/${pin.id}/400/300` };
                 if (pin.type === 'AUDIO') displayItem = { title: 'Pinned Audio', type: 'AUDIO', cover: `https://picsum.photos/seed/${pin.id}/400/300` };
                 
                 return (
                   <div key={pin.id} className="group relative aspect-video rounded-2xl overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                     <img loading="lazy" decoding="async" 
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

        {/* Affirmation Banner — unique per profile, rotates daily */}
        {(() => {
          const quotes = [
            { text: "Create without limits. The world needs what only you can make.", category: "creativity" },
            { text: "Every great artist was once a beginner. Keep going.", category: "growth" },
            { text: "Your story is worth telling. Your voice is worth hearing.", category: "creativity" },
            { text: "Consistency beats perfection. Show up, ship it, grow.", category: "growth" },
            { text: "The best time to share your art was yesterday. The next best time is now.", category: "creativity" },
            { text: "You are not too late. The world is still waiting for your work.", category: "motivation" },
            { text: "Doubt is just creativity looking for permission. Grant it.", category: "creativity" },
            { text: "Small steps daily build empires. Trust the process.", category: "growth" },
            { text: "Your passion is proof that you belong here. Own it.", category: "motivation" },
            { text: "Connection starts with one brave post. Make it.", category: "connection" },
            { text: "Art is not what you make — it is how you make people feel.", category: "creativity" },
            { text: "Rest is part of the process. You are still growing.", category: "growth" },
            { text: "The right people will always find your work. Keep creating.", category: "motivation" },
            { text: "Every upload is a conversation started. Someone needed to hear it.", category: "connection" },
            { text: "You don't need permission to be great. You already have it.", category: "motivation" },
            { text: "Collaboration multiplies talent. Reach out today.", category: "connection" },
            { text: "Progress over perfection — always.", category: "growth" },
            { text: "Your next fan is waiting for content you haven't posted yet.", category: "motivation" },
            { text: "Creativity is contagious. Pass it on.", category: "creativity" },
            { text: "The platform grows when you share something real.", category: "connection" },
            { text: "Every listen, every view, every read — someone chose you.", category: "motivation" },
            { text: "Build something worth returning to.", category: "creativity" },
            { text: "One post can change someone's entire day.", category: "connection" },
            { text: "The gap between dreaming and doing is just one action.", category: "growth" },
            { text: "Your art is an act of generosity. Keep giving.", category: "creativity" },
            { text: "Communities thrive when individuals show up authentically.", category: "connection" },
            { text: "Momentum is built post by post, day by day.", category: "growth" },
            { text: "What you share today becomes someone's discovery tomorrow.", category: "motivation" },
            { text: "Greatness lives inside consistency.", category: "growth" },
            { text: "Say what only you can say. The world is listening.", category: "creativity" },
          ];
          // Seed combines profile UID chars + day number → unique per profile, rotates daily
          const day = Math.floor(Date.now() / 86400000);
          const uidSeed = uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const idx = (day * 7 + uidSeed) % quotes.length;
          const quote = quotes[idx];
          return (
            <div className="mt-10 mb-2 relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-8 py-4 flex items-center gap-6">
              <div className="absolute inset-0 bg-gradient-to-r from-small-orange/5 via-transparent to-violet-500/5 pointer-events-none" />
              <div className="w-px h-8 bg-gradient-to-b from-small-orange to-violet-500 shrink-0 rounded-full opacity-70" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] lg:text-xs font-medium text-white/60 italic leading-relaxed truncate">"{quote.text}"</p>
              </div>
              <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.3em] text-white/20">— Plajah</span>
            </div>
          );
        })()}

        {/* Latest Releases Highlight Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-3">
              <span className="w-0.5 h-4 bg-gradient-to-b from-small-orange to-[#D40055] rounded-full" />
              <Sparkles size={12} className="text-small-orange" /> Latest Releases
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
                <img loading="lazy" decoding="async" 
                  src={release.coverImage || `https://picsum.photos/seed/${release.id}/400/500`} 
                  alt={release.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                {/* H&S button â€” owner only, ALBUM/MUSIC releases only */}
                {isOwnProfile && release.releaseType === 'ALBUM' && (release as any).type === 'MUSIC' && (
                  <button
                    onClick={e => { e.stopPropagation(); setHnsAlbum(release as Album); }}
                    title="Hide N Seek"
                    className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/40 hover:border-primary z-10"
                  >
                    <Shuffle size={12} className="text-white" />
                  </button>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-small-orange/20 text-small-orange text-[7px] font-black uppercase tracking-widest rounded-sm backdrop-blur-md border border-small-orange/20">
                      {release.releaseType}
                    </span>
                    {(release as any).hideNSeekConfig?.isEnabled && (
                      <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[7px] font-black uppercase tracking-widest rounded-sm backdrop-blur-md border border-primary/30">
                        H&amp;S
                      </span>
                    )}
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

        {/* Smart Weather + Activity Card */}
        <div className="mt-10">
          <ProfileSmartCard
            followedIds={followedArtists.map(a => a.uid)}
            profileUid={uid}
            upcomingAlbums={profileUpcomingAlbums}
            onSelectAlbum={onSelectAlbum}
          />
        </div>

        {/* Welcome Card — own profile only */}
        {isOwnProfile && welcomeUsers.length > 0 && (
          <div className="mt-6 relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-900/30 via-indigo-900/20 to-purple-900/30 border border-white/10 p-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.08),transparent_60%)]" />
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="flex-1">
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Say Hello! 👋</h3>
                <p className="text-xs text-white/40 leading-relaxed">You have {welcomeUsers.length} community members waiting to connect. Go introduce yourself!</p>
              </div>
              <div className="flex items-center gap-4">
                {welcomeUsers.map(u => (
                  <div key={u.uid} className="flex flex-col items-center gap-2 group">
                    <div
                      className="relative cursor-pointer"
                      onClick={() => onVisitUser(u.uid)}
                    >
                      <img
                        src={(u as any).customPhotoURL || u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`}
                        className="w-14 h-14 rounded-2xl border-2 border-white/20 group-hover:border-violet-400/50 transition-all object-cover"
                        alt=""
                      />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-black" />
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/50 truncate max-w-[64px] text-center">{u.displayName?.split(' ')[0] || 'User'}</p>
                    {onMessage && (
                      <button
                        onClick={() => onMessage(u.uid)}
                        className="px-3 py-1 bg-white/10 hover:bg-violet-500/30 border border-white/10 hover:border-violet-500/40 text-[8px] font-black uppercase tracking-widest rounded-full transition-all text-white/60 hover:text-white whitespace-nowrap"
                      >
                        Say Hi
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs Container (Sticky & Overflow Scroll) */}
        {(() => {
          const allTabs = [
            { id: 'FEED', label: isOwnProfile ? 'Feed' : 'Their Feed' },
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
            ...(isOwnProfile ? [{ id: 'MY_STATS', label: 'My Stats' }] : []),
            ...(isOwnProfile ? [{ id: 'MY_HABITS', label: 'My Habits' }] : []),
            ...(isOwnProfile && profile?.accountType !== 'FAN' ? [{ id: 'MANAGE', label: 'Management' }] : []),
            ...(profile?.accountType !== 'FAN' ? [{ id: 'MEMBERS', label: 'Sanctuary' }] : [])
          ];

          // Apply saved order: put saved-order IDs first, append any new tabs at the end
          const orderedTabs = tabOrder.length > 0
            ? [
                ...tabOrder.map(id => allTabs.find(t => t.id === id)).filter(Boolean) as typeof allTabs,
                ...allTabs.filter(t => !tabOrder.includes(t.id))
              ]
            : allTabs;

          const saveOrder = (order: string[]) => {
            setTabOrder(order);
            if (isOwnProfile) {
              try { localStorage.setItem(`plajah-tab-order-${uid}`, JSON.stringify(order)); } catch {}
            }
          };

          const moveTab = (idx: number, dir: -1 | 1) => {
            const ids = orderedTabs.map(t => t.id);
            const target = idx + dir;
            if (target < 0 || target >= ids.length) return;
            [ids[idx], ids[target]] = [ids[target], ids[idx]];
            saveOrder(ids);
          };

          const handleDragStart = (idx: number) => { dragTabRef.current = idx; };
          const handleDragOver = (e: React.DragEvent, idx: number) => {
            e.preventDefault();
            if (dragTabRef.current === null || dragTabRef.current === idx) return;
            const ids = orderedTabs.map(t => t.id);
            const [moved] = ids.splice(dragTabRef.current, 1);
            ids.splice(idx, 0, moved);
            dragTabRef.current = idx;
            saveOrder(ids);
          };
          const handleDragEnd = () => { dragTabRef.current = null; };

          return (
            <div className={`mt-12 lg:mt-16 sticky ${isMobile ? 'top-14' : 'top-0'} bg-black/55 backdrop-blur-2xl backdrop-saturate-150 z-40 border-b border-white/[0.08] -mx-4 px-4 lg:mx-0 lg:px-0`}>
              <ScrollableTabRow innerClassName="gap-1 py-2 translate-y-[1px] px-1">
                {orderedTabs.map((tab, idx) => (
                  <div
                    key={tab.id}
                    className="flex items-center flex-shrink-0 group/tab"
                    draggable={isOwnProfile}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                  >
                    {/* Left arrow â€” own profile only */}
                    {isOwnProfile && (
                      <button
                        onClick={() => moveTab(idx, -1)}
                        disabled={idx === 0}
                        className="opacity-0 group-hover/tab:opacity-100 transition-opacity p-0.5 text-white/20 hover:text-white/60 disabled:opacity-0 disabled:pointer-events-none"
                        aria-label="Move tab left"
                      >
                        <ChevronLeft size={10} />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        const el = document.getElementById(`tab-${tab.id}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                      }}
                      id={`tab-${tab.id}`}
                      className={`pb-4 px-2 text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] transition-all border-b-2 whitespace-nowrap ${
                        isOwnProfile ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        activeTab === tab.id
                          ? 'text-small-orange border-small-orange'
                          : 'text-white/20 border-transparent hover:text-white/40'
                      }`}
                    >
                      {tab.label}
                    </button>

                    {/* Right arrow â€” own profile only */}
                    {isOwnProfile && (
                      <button
                        onClick={() => moveTab(idx, 1)}
                        disabled={idx === orderedTabs.length - 1}
                        className="opacity-0 group-hover/tab:opacity-100 transition-opacity p-0.5 text-white/20 hover:text-white/60 disabled:opacity-0 disabled:pointer-events-none"
                        aria-label="Move tab right"
                      >
                        <ChevronRight size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </ScrollableTabRow>
            </div>
          );
        })()}

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
                  key={feedKey}
                  uid={uid}
                  profileName={profile.displayName}
                  onVisitUser={onVisitUser}
                  xHandle={profile.xHandle}
                  xEmbedHtml={profile.xEmbedHtml}
                  mastodonHandle={profile.mastodonHandle}
                  mastodonInstance={profile.mastodonInstance}
                  blueskyHandle={profile.blueskyHandle}
                  threadsHandle={profile.threadsHandle}
                  initialFeedType={feedInitialType}
                  onUpdateXHandle={async (handle) => {
                    if (!auth.currentUser?.uid || auth.currentUser.uid !== uid) return;
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
                {/* Sub-tab row + action button */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex gap-1 p-1 bg-white/5 rounded-full">
                    {(['PUBLISHED', 'SUBSCRIBED'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setPodcastSubTab(tab)}
                        className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                          podcastSubTab === tab
                            ? 'bg-small-orange text-white shadow-md'
                            : 'text-white/40 hover:text-white/70'
                        }`}
                      >
                        {tab === 'PUBLISHED' ? 'Published' : 'Subscribed'}
                      </button>
                    ))}
                  </div>
                  {isOwnProfile && podcastSubTab === 'PUBLISHED' && (
                    <button
                      onClick={() => {
                        const event = new CustomEvent('NAVIGATE', {
                          detail: { target: 'CREATOR', params: { editingAlbum: { type: 'MUSIC', subType: 'PODCAST', artist: profile.displayName } } }
                        });
                        window.dispatchEvent(event);
                      }}
                      className="flex items-center gap-2 px-6 py-3 bg-small-orange text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 transition-all shadow-lg"
                    >
                      <Plus size={14} />
                      Add Podcast
                    </button>
                  )}
                </div>

                {/* Published tab */}
                {podcastSubTab === 'PUBLISHED' && (
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
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">By {album.artist}</p>
                        {album.worldId && (
                          <div className="mb-3" onClick={e => e.stopPropagation()}>
                            <WorldBadge worldId={album.worldId} contentTitle={album.title} compact />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">{album.genre}</span>
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">{album.tracks?.length || 0} Eps</span>
                          </div>
                          {/* Subscribe button for non-own-profile viewers */}
                          {!isOwnProfile && auth.currentUser && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const isSubbed = podcastSubscribedIds.has(album.id);
                                if (isSubbed) {
                                  await unsubscribeFromPodcast(album.id);
                                  setPodcastSubscribedIds(prev => { const s = new Set(prev); s.delete(album.id); return s; });
                                  setSubscribedPodcasts(prev => prev.filter(p => p.id !== album.id));
                                } else {
                                  await subscribeToPodcast(album.id);
                                  setPodcastSubscribedIds(prev => new Set([...prev, album.id]));
                                }
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                                podcastSubscribedIds.has(album.id)
                                  ? 'bg-small-orange/20 text-small-orange border border-small-orange/30'
                                  : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                              }`}
                            >
                              {podcastSubscribedIds.has(album.id) ? <Check size={10} /> : <Plus size={10} />}
                              {podcastSubscribedIds.has(album.id) ? 'Subscribed' : 'Subscribe'}
                            </button>
                          )}
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
                )}

                {/* Subscribed tab */}
                {podcastSubTab === 'SUBSCRIBED' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {subscribedPodcasts.map(album => (
                      <div key={album.id} onClick={() => onSelectAlbum(album)} className="p-6 bg-white/[0.03] border border-white/5 rounded-[2.5rem] group hover:bg-white/[0.06] transition-all cursor-pointer">
                        <div className="aspect-square rounded-2xl overflow-hidden mb-6 relative">
                          <img src={album.coverImage || null} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" alt={album.title} />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play size={48} fill="white" className="text-white" />
                          </div>
                        </div>
                        <h4 className="text-sm font-black uppercase tracking-widest truncate mb-1">{album.title}</h4>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">By {album.artist}</p>
                        {album.worldId && (
                          <div className="mb-3" onClick={e => e.stopPropagation()}>
                            <WorldBadge worldId={album.worldId} contentTitle={album.title} compact />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">{album.genre}</span>
                            <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">{album.tracks?.length || 0} Eps</span>
                          </div>
                          {isOwnProfile && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await unsubscribeFromPodcast(album.id);
                                setSubscribedPodcasts(prev => prev.filter(p => p.id !== album.id));
                                setPodcastSubscribedIds(prev => { const s = new Set(prev); s.delete(album.id); return s; });
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all"
                            >
                              <X size={10} />
                              Unsubscribe
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {subscribedPodcasts.length === 0 && (
                      <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
                        <Radio size={48} className="text-white/5 mx-auto mb-4" />
                        <p className="text-white/20 uppercase font-black tracking-[0.5em]">
                          {isOwnProfile ? 'No subscribed podcasts yet. Browse the podcast section to subscribe.' : 'No subscribed podcasts.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
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
                                <img loading="lazy" decoding="async" src={theme.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                             ) : theme.assets && theme.assets.length > 0 ? (
                                theme.assets[0].type === 'PHOTO' ? <img loading="lazy" decoding="async" src={theme.assets[0].url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" /> : <video src={theme.assets[0].url} className="w-full h-full object-cover" muted loop autoPlay />
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
                                         if (!auth.currentUser?.uid) {
                                            alert('Please sign in to save themes');
                                            return;
                                         }
                                         try {
                                            const myProfile = await fetchUserProfile(auth.currentUser.uid);
                                            if (myProfile) {
                                               const currentSaved = myProfile.savedThemePresets || [];
                                               if (!currentSaved.includes(theme.id)) {
                                                  await updateUserProfile(auth.currentUser.uid, { savedThemePresets: [...currentSaved, theme.id] });
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
                <SanctuaryView
                  creatorId={profile.uid}
                  creatorProfile={profile}
                  isOwnProfile={isOwnProfile}
                />
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
                                <img loading="lazy" decoding="async" src={album.coverImage || null} className="w-full h-full object-cover" alt={album.title} />
                              </div>
                              <div>
                                <h4 className="text-sm font-black uppercase tracking-widest mb-1">{album.title}</h4>
                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{album.genre} â€¢ {album.type}</p>
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
                              <img loading="lazy" decoding="async" 
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
            ) : activeTab === 'MY_STATS' && isOwnProfile ? (
              <motion.div
                key="my-stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="pb-8"
              >
                <UserAnalyticsDashboard currentUser={profile} />
              </motion.div>
            ) : activeTab === 'MY_HABITS' && isOwnProfile ? (
              <motion.div
                key="my-habits"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-16"
              >
                {/* Header */}
                <div>
                  <span className="text-[9px] font-black uppercase tracking-[0.4em] text-small-orange block mb-2">Your Activity</span>
                  <h2 className="font-bebas text-5xl md:text-7xl uppercase tracking-tighter leading-[0.85]">My Habits</h2>
                  <p className="text-white/30 text-sm mt-3 max-w-md">Everything you've been into, right where you left off.</p>
                </div>

                {/* Pick Up Where You Left Off â€” Shows & Movies */}
                <section>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-primary block mb-1">In Progress</span>
                      <h3 className="font-bebas text-3xl uppercase tracking-tighter">Shows &amp; Movies</h3>
                    </div>
                    <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                    {[
                      { title: 'Across the Multiverse', type: 'TV', progress: 68, episode: 'S2 E4', thumb: null },
                      { title: 'The Silent Forest', type: 'Movie', progress: 42, episode: null, thumb: null },
                      { title: 'Nebula Whispers', type: 'TV', progress: 15, episode: 'S1 E2', thumb: null },
                      { title: 'Digital Uprising', type: 'Movie', progress: 91, episode: null, thumb: null },
                    ].map((item, i) => (
                      <div key={i} className="flex-shrink-0 min-w-[140px] group cursor-pointer">
                        <div className="aspect-[2/3] rounded-2xl bg-white/5 border border-white/5 overflow-hidden relative group-hover:border-white/20 transition-all">
                          {item.thumb ? <img loading="lazy" decoding="async" src={item.thumb} className="w-full h-full object-cover" alt="" /> : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/0">
                              <Play size={24} className="text-white/20" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          {item.episode && (
                            <span className="absolute top-2 left-2 bg-primary/80 text-white text-[7px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full">{item.episode}</span>
                          )}
                          {/* Progress bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                            <div className="h-full bg-small-orange rounded-full" style={{ width: `${item.progress}%` }} />
                          </div>
                          <div className="absolute bottom-3 left-2 right-2">
                            <p className="text-white text-[9px] font-black uppercase tracking-tight truncate">{item.title}</p>
                            <p className="text-white/40 text-[7px] uppercase tracking-widest mt-0.5">{item.progress}% Â· {item.type}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex-shrink-0 min-w-[140px] aspect-[2/3] rounded-2xl border-2 border-dashed border-white/5 flex items-center justify-center cursor-pointer hover:border-white/10 transition-colors group">
                      <span className="text-white/20 group-hover:text-white/40 font-black text-[8px] uppercase tracking-widest text-center px-4">Start<br/>Watching</span>
                    </div>
                  </div>
                </section>

                {/* Books */}
                <section>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-secondary block mb-1">Reading</span>
                      <h3 className="font-bebas text-3xl uppercase tracking-tighter">Books</h3>
                    </div>
                    <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[
                      { title: 'The Infinite Garden', author: 'A. Rivers', page: 142, total: 320, progress: 44 },
                      { title: 'Cosmic Architectures', author: 'M. Okafor', page: 89, total: 210, progress: 42 },
                      { title: 'Signal & Noise', author: 'J. Park', page: 23, total: 180, progress: 13 },
                    ].map((book, i) => (
                      <div key={i} className="flex gap-5 p-5 bg-white/[0.03] border border-white/5 rounded-2xl group hover:bg-white/[0.06] transition-all cursor-pointer">
                        <div className="w-14 h-20 rounded-lg bg-white/5 flex-shrink-0 border border-white/10 flex items-center justify-center">
                          <BookOpen size={20} className="text-white/20" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h4 className="font-black text-[11px] uppercase tracking-tight truncate">{book.title}</h4>
                            <p className="text-[9px] text-white/30 uppercase tracking-widest mt-0.5">{book.author}</p>
                          </div>
                          <div>
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5">
                              <span>Page {book.page} of {book.total}</span>
                              <span>{book.progress}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-secondary rounded-full" style={{ width: `${book.progress}%` }} />
                            </div>
                            <button className="mt-2.5 text-[8px] font-black uppercase tracking-widest text-secondary hover:text-white transition-colors">Jump to Page {book.page} â†’</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Albums & Songs */}
                <section>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-tertiary block mb-1">Listening</span>
                      <h3 className="font-bebas text-3xl uppercase tracking-tighter">Albums &amp; Songs</h3>
                    </div>
                    <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {content.filter(a => a.type === 'MUSIC').slice(0, 8).map((album, i) => (
                      <div
                        key={album.id}
                        className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-2xl group hover:bg-white/[0.06] transition-all cursor-pointer"
                        onClick={() => onSelectAlbum(album)}
                      >
                        {/* Thumbnail â€” small fixed size */}
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex-shrink-0 overflow-hidden relative border border-white/10">
                          {album.coverImage
                            ? <img loading="lazy" decoding="async" src={album.coverImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={album.title} />
                            : <div className="w-full h-full flex items-center justify-center"><Music size={16} className="text-white/20" /></div>
                          }
                        </div>
                        {/* Info + progress */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-[10px] uppercase tracking-tight truncate">{album.title}</h4>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest mt-0.5 truncate">{album.artist}</p>
                          <div className="mt-1.5 h-0.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-tertiary rounded-full" style={{ width: `${Math.floor(20 + i * 13) % 100}%` }} />
                          </div>
                        </div>
                        <Play size={14} className="text-white/20 group-hover:text-white/60 flex-shrink-0 transition-colors" />
                      </div>
                    ))}
                    {content.filter(a => a.type === 'MUSIC').length === 0 && (
                      <div className="col-span-2 py-10 border-2 border-dashed border-white/5 rounded-2xl text-center">
                        <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">No music played yet</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Last Game Played */}
                <section>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-small-orange block mb-1">Gaming</span>
                      <h3 className="font-bebas text-3xl uppercase tracking-tighter">Last Played</h3>
                    </div>
                  </div>
                  {profile?.games && profile.games.length > 0 ? (
                    <div className="flex gap-5 p-6 bg-white/[0.03] border border-white/5 rounded-2xl max-w-md group hover:bg-white/[0.06] transition-all cursor-pointer">
                      <div className="w-16 h-16 rounded-xl bg-white/5 flex-shrink-0 overflow-hidden border border-white/10">
                        {profile.games[0].thumbnailUrl ? <img loading="lazy" decoding="async" src={profile.games[0].thumbnailUrl} className="w-full h-full object-cover" alt="" /> : <Gamepad2 size={24} className="m-auto text-white/20" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black text-sm uppercase tracking-tight truncate">{profile.games[0].title}</h4>
                        <p className="text-[9px] text-white/30 uppercase tracking-widest mt-1">Last played recently</p>
                        <button className="mt-3 text-[8px] font-black uppercase tracking-widest text-small-orange hover:text-white transition-colors">Resume â†’</button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 px-8 border-2 border-dashed border-white/5 rounded-2xl max-w-md text-center">
                      <Gamepad2 size={32} className="text-white/10 mx-auto mb-3" />
                      <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">No games played yet</p>
                    </div>
                  )}
                </section>

                {/* Articles Reading */}
                <section>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/40 block mb-1">Reading</span>
                      <h3 className="font-bebas text-3xl uppercase tracking-tighter">Articles</h3>
                    </div>
                    <button className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors">See All</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {articles.slice(0, 6).map((article, i) => (
                      <div key={article.id} className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl group hover:bg-white/[0.06] transition-all cursor-pointer">
                        <span className="text-[7px] font-black uppercase tracking-widest text-white/20 block mb-2">Article</span>
                        <h4 className="font-black text-[11px] uppercase tracking-tight line-clamp-2 mb-3">{article.title}</h4>
                        <div className="h-0.5 bg-white/5 rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-white/20 rounded-full" style={{ width: `${Math.floor(10 + i * 17) % 90}%` }} />
                        </div>
                        <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">{Math.floor(10 + i * 17) % 90}% read</p>
                      </div>
                    ))}
                    {articles.length === 0 && (
                      <div className="col-span-full py-10 border-2 border-dashed border-white/5 rounded-2xl text-center">
                        <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">No articles in progress</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Fav & Likes / Bookmarks / Drafts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="p-6 bg-white/[0.03] border border-white/5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Heart size={16} className="text-small-orange" />
                      <h3 className="font-bebas text-xl uppercase tracking-tighter">Fav &amp; Likes</h3>
                    </div>
                    <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">Posts and content you've liked or favorited appear here.</p>
                    <div className="pt-2 space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-8 bg-white/5 rounded-xl border border-white/5" />
                      ))}
                    </div>
                  </div>
                  <div className="p-6 bg-white/[0.03] border border-white/5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Edit3 size={16} className="text-secondary" />
                      <h3 className="font-bebas text-xl uppercase tracking-tighter">Drafts</h3>
                    </div>
                    <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">Posts you started but haven't published yet. Come back and finish them.</p>
                    <div className="pt-2 space-y-2">
                      {[1, 2].map(i => (
                        <div key={i} className="h-8 bg-white/5 rounded-xl border border-white/5" />
                      ))}
                      <button className="w-full h-8 border-2 border-dashed border-white/5 rounded-xl text-white/20 hover:text-white/40 text-[8px] font-black uppercase tracking-widest transition-colors">New Draft</button>
                    </div>
                  </div>
                  <div className="p-6 bg-white/[0.03] border border-white/5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Bookmark size={16} className="text-tertiary" />
                      <h3 className="font-bebas text-xl uppercase tracking-tighter">Bookmarks</h3>
                    </div>
                    <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">Posts you bookmarked from the social section to revisit.</p>
                    <div className="pt-2 space-y-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-8 bg-white/5 rounded-xl border border-white/5" />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Personal Photo Gallery Preview */}
                <section>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/30 block mb-1">Gallery</span>
                      <h3 className="font-bebas text-3xl uppercase tracking-tighter">Personal Collection</h3>
                    </div>
                    <button
                      onClick={() => setActiveTab('PHOTOS')}
                      className="text-white/20 hover:text-white/50 text-[8px] font-black uppercase tracking-widest transition-colors"
                    >View Gallery â†’</button>
                  </div>
                  {profile?.photos && profile.photos.length > 0 ? (
                    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                      {profile.photos.slice(0, 14).map((photo, i) => (
                        <div key={i} className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/20 transition-all cursor-pointer group">
                          <img loading="lazy" decoding="async" src={photo.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                        </div>
                      ))}
                      <div
                        className="aspect-square rounded-xl border-2 border-dashed border-white/5 flex items-center justify-center cursor-pointer hover:border-white/15 transition-colors group"
                        onClick={() => setActiveTab('PHOTOS')}
                      >
                        <span className="text-white/15 group-hover:text-white/30 text-[7px] font-black uppercase tracking-widest text-center">View All</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 border-2 border-dashed border-white/5 rounded-2xl text-center">
                      <Camera size={32} className="text-white/10 mx-auto mb-3" />
                      <p className="text-white/20 text-[9px] font-black uppercase tracking-widest">No photos in your personal collection yet</p>
                      <button onClick={() => setActiveTab('PHOTOS')} className="mt-4 px-5 py-2 bg-white/5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors">Add Photos</button>
                    </div>
                  )}
                </section>
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
                                  <img loading="lazy" decoding="async" src={artist.photoURL || null} className="w-8 h-8 rounded-lg object-cover" />
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
                              <img loading="lazy" decoding="async" src={item.url} className="w-full h-full object-cover opacity-50" />
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
                              <img loading="lazy" decoding="async" src={item.coverImage || null} className="w-full h-full object-cover" />
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
                  <div className="flex justify-end gap-3">
                    {onOpenCreator && (
                      <button
                        onClick={() => onOpenCreator('GAME')}
                        className="flex items-center gap-2 px-6 py-3 bg-small-orange text-black font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,140,0,0.35)]"
                      >
                        <Plus size={14} />
                        New Game Project
                      </button>
                    )}
                    <button
                      onClick={() => setIsAddGameModalOpen(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:bg-white/20 transition-all"
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
                    <img loading="lazy" decoding="async" src={profile.coverArt || profile.photoURL || null} className="w-full h-full object-cover" alt="Hero banner" />
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
                          <img loading="lazy" decoding="async" 
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
                          <img loading="lazy" decoding="async" 
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

      <AnimatePresence>
        {showPlajahPlusLanding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setShowPlajahPlusLanding(false); }}
          >
            <div className="min-h-screen">
              <button
                onClick={() => setShowPlajahPlusLanding(false)}
                className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
              >
                <X size={18} />
              </button>
              <PlajahPlusLanding
                defaultCreatorId={profile.uid}
                defaultCreatorName={profile.displayName}
                onClose={() => setShowPlajahPlusLanding(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Hide N Seek Manager modal */}
      <AnimatePresence>
        {hnsAlbum && (
          <HideNSeekManager
            album={hnsAlbum}
            onClose={() => setHnsAlbum(null)}
            onSaved={updated => {
              setContent(prev => prev.map(a => a.id === updated.id ? updated : a));
              setHnsAlbum(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {signInAction && (
          <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
        )}
      </AnimatePresence>

      {showFastChannel && profile && (
        <FastChannelPlayer profile={profile} onClose={() => setShowFastChannel(false)} />
      )}

      {showFastChannelManager && profile && (
        <div className="fixed inset-0 z-[200]">
          <FastChannelManager user={profile} onBack={() => setShowFastChannelManager(false)} />
        </div>
      )}
    </div>
  );
};

export default UserProfileView;
