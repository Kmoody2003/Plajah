import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { Album, AppView, ThemeType, Game, IPWorld } from './types';
import Logo from './components/Logo';
import { motion, AnimatePresence } from 'motion/react';

// Standard lazy loading with retry logic for network stability
const retryLazy = <T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>, 
  retriesLeft = 3
): T => {
  return lazy(async () => {
    for (let i = 0; i < retriesLeft; i++) {
        try {
            return await componentImport();
        } catch (error) {
            console.warn(`Retry lazy load failed (${i + 1}/${retriesLeft}). Error:`, error);
            if (i === retriesLeft - 1) {
                // If it's a chunk loading error, try to force a cache refresh without a full reload if possible
                // but usually browsers need a reload. For now we throw to trigger ErrorBoundary, 
                // but with a descriptive error.
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    throw new Error("Failed to load component");
  }) as any;
};
const AlbumCreator = retryLazy(() => import('./components/AlbumCreator'));
const PlayerView = retryLazy(() => import('./components/PlayerView'));
const SearchView = retryLazy(() => import('./components/SearchView'));
const FeedView = retryLazy(() => import('./components/FeedView'));
const LiveHubView = retryLazy(() => import('./components/LiveHubView'));
const UserProfileView = retryLazy(() => import('./components/UserProfileView'));
const RadioView = retryLazy(() => import('./components/RadioView'));
const TVView = retryLazy(() => import('./components/TVView'));
const GamesView = retryLazy(() => import('./components/GamesView'));
const MusicView = retryLazy(() => import('./components/MusicView'));
const PrivateBoardsView = retryLazy(() => import('./components/PrivateBoardsView'));
const AdminAdDashboard = retryLazy(() => import('./components/AdminAdDashboard'));
const ChatSystem = retryLazy(() => import('./components/ChatSystem'));
const ChatFlyout = retryLazy(() => import('./components/ChatFlyout'));
const ClassroomsView = retryLazy(() => import('./components/ClassroomsView'));
const PPVEventsView = retryLazy(() => import('./components/PPVEventsView'));
const GamePlayerView = retryLazy(() => import('./components/GamePlayerView'));
const PostmanView = retryLazy(() => import('./components/PostmanView'));
const WorldsView = retryLazy(() => import('./components/WorldsView'));
const WorldManagerView = retryLazy(() => import('./components/WorldManagerView'));
const TeamDetailView = retryLazy(() => import('./components/TeamDetailView').then(m => ({ default: m.TeamDetailView })));
const PlayerDetailView = retryLazy(() => import('./components/PlayerDetailView').then(m => ({ default: m.PlayerDetailView })));

import GlobalPlayer from './components/GlobalPlayer';

import NebulaBackground from './components/NebulaBackground';
import NebulaVisualizer from './components/NebulaVisualizer';
import BackgroundFrequencyGraph from './components/BackgroundFrequencyGraph';
const VideoTab = retryLazy(() => import('./components/VideoTab'));
const VideoPlayer = retryLazy(() => import('./components/VideoPlayer'));
const BookTab = retryLazy(() => import('./components/BookTab'));
const BookReader = retryLazy(() => import('./components/BookReader'));
const UserDashboard = retryLazy(() => import('./components/UserDashboard'));
const GlobalPhotosView = retryLazy(() => import('./components/GlobalPhotosView'));
const EventPhotoPoolView = retryLazy(() => import('./components/EventPhotoPoolView'));
import LandingPage from './components/LandingPage';
const AdminDashboard = retryLazy(() => import('./components/AdminDashboard'));
const PartnerDashboard = retryLazy(() => import('./components/PartnerDashboard'));
const HelpCenter = retryLazy(() => import('./components/HelpCenter'));
const MyLibraryView = retryLazy(() => import('./components/MyLibraryView'));
const NewstandView = retryLazy(() => import('./components/newstand/NewstandView').then(m => ({ default: m.NewstandView })));
const ArticleEditor = retryLazy(() => import('./components/ArticleEditor'));
const ArticleView = retryLazy(() => import('./components/ArticleView'));
const BrandDashboard = retryLazy(() => import('./components/BrandDashboard'));
const VideoManager = retryLazy(() => import('./components/VideoManager'));
const ArtistMembersArea = retryLazy(() => import('./components/ArtistMembersArea'));
const MerchStorefront = retryLazy(() => import('./components/MerchStorefront'));
const MovieUXView = retryLazy(() => import('./components/MovieUXView'));
const MoviesTVView = retryLazy(() => import('./components/MoviesTVView'));
const ClubsView = retryLazy(() => import('./components/ClubsView'));
const CharityView = retryLazy(() => import('./components/CharityView'));
const AppsView = retryLazy(() => import('./components/AppsView'));
const PersistentChatDrawer = retryLazy(() => import('./components/PersistentChatDrawer'));
const CitrusWaterDrops = retryLazy(() => import('./components/CitrusWaterDrops'));
const DiscussionView = retryLazy(() => import('./components/DiscussionView'));

import { useGlobalPlayer, useGlobalPlayerState } from './contexts/GlobalPlayerContext';
import { fetchProjectFromCloud, fetchAllPublicAlbums, deleteCloudAlbum, checkCloudConnection, loginWithGoogle, loginWithTwitter, logout, onAuthUpdate, seedMockUsers, seedPublicDomainBooks, createChatRoom, updateGamePlayCount, fetchUserProfile, listenToMyPayItForwardWins, simulateDailySelection, createDemoArticle, updateOnboardingStatus, updateTooltipSettings, updateUserProfile, createIPWorld, updateIPWorld, seedDemoWorlds, fetchThemePresetById } from './services/backendService';
import { Plus, Music2, Layers, Play, Trash2, User, Share2, Check, Box, Globe, ShieldCheck, ShieldAlert, LogOut, LogIn, Search, Rss, Sun, Moon, Palette, Radio, Sparkles, Database, Tv, Gamepad2, MessageSquare, MessageCircle, GraduationCap, Ticket, Video as VideoIcon, BookOpen, ChevronLeft, ChevronRight, Camera, Settings, Heart, Pen, Newspaper, Megaphone, HelpCircle, ChevronDown, ChevronUp, Home, Film, Users, AppWindow, Mail, X as XIcon, Upload, Zap } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';

class ErrorBlock extends React.Component<{ componentName: string, children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    console.error(`Error in ${this.props.componentName}:`, error, info);
  }
  render() {
    if (this.state.hasError) return <div className="text-red-500 p-8 z-50 relative bg-black/80">Error in {this.props.componentName}</div>;
    return this.props.children;
  }
}

import SystemMessageBanner from './components/SystemMessageBanner';
import { User as FirebaseUser } from 'firebase/auth';
import PayItForwardModal from './components/PayItForwardModal';
import PayItForwardNotification from './components/PayItForwardNotification';
import LiveFeedPlayer from './components/LiveFeedPlayer';
import OnboardingTour from './components/OnboardingTour';
import Tooltip from './components/Tooltip';
import { UserProfile, PayItForwardWinner, Article, LiveFeed } from './types';
import { UploadProvider } from './contexts/UploadContext';
import { AchievementProvider } from './contexts/AchievementContext';
import { PointsProvider } from './contexts/PointsContext';
import { BadgeProvider } from './contexts/BadgeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SpatialProvider } from './contexts/SpatialContext';
import NotificationCenter from './components/NotificationCenter';
import AchievementListView from './components/AchievementListView';
import UploadManager from './components/UploadManager';

import SpatialToggle from './components/SpatialToggle';
import SpatialImage from './components/SpatialImage';
import { useSpatial } from './contexts/SpatialContext';
import ArchiveItemCard from './components/ArchiveItemCard';

import SpatialUIRoot from './components/SpatialUIRoot';

const App: React.FC = () => {
  const [view, setViewInternal] = useState<AppView>('LANDING');
  
  const setView = useCallback((newView: AppView | ((prev: AppView) => AppView), path?: string) => {
    setViewInternal((prev) => {
      const nextView = typeof newView === 'function' ? newView(prev) : newView;
      if (prev !== nextView || path) {
        window.history.pushState({ view: nextView }, '', path || window.location.pathname);
      }
      return nextView;
    });
  }, []);

  useEffect(() => {
    // Replace current state so we can navigate back to initial view
    window.history.replaceState({ view: 'LANDING' }, '', window.location.pathname);

    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setViewInternal(event.state.view);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [archiveTab, setArchiveTab] = useState<'MUSIC' | 'VIDEO' | 'MOVIES_TV' | 'BOOK' | 'GAMES' | 'MY_ARCHIVE'>('MUSIC');
  const [musicInitialTab, setMusicInitialTab] = useState<'NEW' | 'FOR_YOU' | 'ARTISTS' | 'ALBUMS' | 'GENRES' | 'VAULT' | 'PODCASTS' | 'AUDIO_BOOKS' | 'MY_LIBRARY' | 'PLAYLISTS'>('NEW');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'createdAt' | 'title' | 'genre' | 'artist'; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [selectedMovieItem, setSelectedMovieItem] = useState<any | null>(null);
  const [selectedBook, setSelectedBook] = useState<Album | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [selectedRadioArtistId, setSelectedRadioArtistId] = useState<string | undefined>(undefined);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [creatorInitialType, setCreatorInitialType] = useState<string | undefined>(undefined);
  const [isCreatorMinimized, setIsCreatorMinimized] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublicView, setIsPublicView] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'CONNECTED' | 'OFFLINE' | 'CHECKING'>('CHECKING');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [theme, setTheme] = useState<ThemeType>('PLAJAH');
  
  // Theme Asset Cycle
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<any>(null);
  const [themeAssetIndex, setThemeAssetIndex] = useState(0);
  const [themeAssetLoopCount, setThemeAssetLoopCount] = useState(0);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [initialProfileTab, setInitialProfileTab] = useState<string | undefined>(undefined);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedWorld, setSelectedWorld] = useState<IPWorld | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | undefined>(undefined);
  const [isPIFModalOpen, setIsPIFModalOpen] = useState(false);
  const [pifWins, setPifWins] = useState<PayItForwardWinner[]>([]);
  const [activeLiveFeed, setActiveLiveFeed] = useState<LiveFeed | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isBottomSectionExpanded, setIsBottomSectionExpanded] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamLeague, setSelectedTeamLeague] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 500);
    };
    checkOrientation();
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(checkOrientation, 150); };
    window.addEventListener('resize', onResize, { passive: true });
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, []);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [is3DDepthEnabled, setIs3DDepthEnabled] = useState(false);

  const isFirstWeek = userProfile?.onboardingStartTimestamp 
    ? (Date.now() - userProfile.onboardingStartTimestamp) < (7 * 24 * 60 * 60 * 1000)
    : true;

  const tooltipsActive = userProfile?.tooltipsEnabled ?? isFirstWeek;

  const { isShrunk, setIsShrunk, setView: setGlobalView, analyser, isPlaying, isNanoView, setIsNanoView } = useGlobalPlayerState();

  useEffect(() => {
    setGlobalView(view);
  }, [view, setGlobalView]);

  useEffect(() => {
    if (user) {
      const unsubscribe = listenToMyPayItForwardWins(setPifWins);
      
      // Simulate daily selection for admin to keep the feature active in demo
      if (user.email === 'kmoody2003@gmail.com') {
        simulateDailySelection();
      }
      
      return () => unsubscribe();
    } else {
      setPifWins([]);
    }
  }, [user]);

  useEffect(() => {
    const handleStartChat = async (e: any) => {
      const targetUserId = e.detail.userId;
      if (!user || targetUserId === user.uid) return;
      
      try {
        const roomId = await createChatRoom([user.uid, targetUserId], 'PRIVATE');
        setView('CHAT');
        setSelectedChatRoomId(roomId);
      } catch (error) {
        console.error("Failed to start chat:", error);
      }
    };

    window.addEventListener('START_CHAT', handleStartChat);
    
    const handleOpenPIF = () => setIsPIFModalOpen(true);
    window.addEventListener('OPEN_PIF_MODAL', handleOpenPIF);

    const handleNavigate = (e: any) => {
      handleGlobalNavigate(e.detail.target, e.detail.params);
    };
    window.addEventListener('NAVIGATE', handleNavigate);

    const handlePlayLive = (e: any) => {
      setActiveLiveFeed(e.detail.feed);
    };
    window.addEventListener('PLAY_LIVE_FEED', handlePlayLive);

    return () => {
      window.removeEventListener('START_CHAT', handleStartChat);
      window.removeEventListener('OPEN_PIF_MODAL', handleOpenPIF);
      window.removeEventListener('NAVIGATE', handleNavigate);
      window.removeEventListener('PLAY_LIVE_FEED', handlePlayLive);
    };
  }, [user]);

  useEffect(() => {
    const checkDevice = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 640;
      setIsMobile(mobile);
      
      // Device-specific defaults for initial load
      if (view === 'LANDING') {
        const tvKeywords = ['tv', 'smarttv', 'googletv', 'appletv', 'tizen', 'webos', 'hbbtv', 'pov_tv', 'netcast.tv'];
        const isTV = tvKeywords.some(keyword => navigator.userAgent.toLowerCase().includes(keyword));
        
        if (mobile) {
          setTheme('PHONE');
        } else if (isTV) {
          setTheme('BIG_SCREEN');
        }
      }
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, [view]);

  useEffect(() => {
    if (!isBottomSectionExpanded) return;

    let timeout: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setIsBottomSectionExpanded(false);
      }, 3000);
    };

    resetTimer(); // Start initial timer

    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('scroll', resetTimer);
    window.addEventListener('click', resetTimer);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [isBottomSectionExpanded]);

  const handleEnterApp = () => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 640;
    const tvKeywords = ['tv', 'smarttv', 'googletv', 'appletv', 'tizen', 'webos', 'hbbtv', 'pov_tv', 'netcast.tv'];
    const isTV = tvKeywords.some(keyword => navigator.userAgent.toLowerCase().includes(keyword));

    if (isMobileDevice) {
      setView('MUSIC');
      setTheme('PHONE');
    } else if (isTV) {
      setView('LIVE_HUB');
      setTheme('BIG_SCREEN');
    } else {
      setView('DASHBOARD');
    }
  };

  const handleSelectItem = (item: any) => {
    const subType = item.subType || '';
    const isMovie = item.category === 'MOVIE' || subType === 'MOVIE' || subType === 'Movie' || subType === 'Short Film' || item.genre === 'Movies';
    const isTV = subType === 'TV_SERIES' || subType === 'TV Series' || item.genre === 'TV Series';
    const isLive = item.ownerName && item.url && item.status !== undefined;

    if (isLive) {
      setActiveLiveFeed(item);
      return;
    }

    if (item.type === 'BOOK') {
      setSelectedBook(item);
      setSelectedAlbum(null);
      setSelectedVideo(null);
      setSelectedGame(null);
      setView('BOOK_READER');
    } else if (isMovie || isTV) {
      setSelectedMovieItem(item);
      setView('MOVIE_UX');
    } else if (item.tracks) {
      setSelectedAlbum(item);
      setSelectedVideo(null);
      setSelectedGame(null);
      setView('PLAYER');
    } else {
      setSelectedVideo(item);
      setSelectedAlbum(null);
      setSelectedGame(null);
      setView('PLAYER');
    }
  };

  const handleGlobalNavigate = (target: string, params?: any) => {
    if (target === 'LIBRARY') {
      if (!user) {
        setView('DASHBOARD');
        alert('Please sign in to access your library');
        return;
      }
      setViewedUserId(user.uid);
      setInitialProfileTab('LIBRARY');
      setView('USER_PROFILE');
      window.history.replaceState({ view: 'USER_PROFILE' }, '', `/profile/${user.uid}`);
    } else if (target === 'DASHBOARD') {
      handleBackToDashboard();
    } else if (target === 'LANDING') {
      setView('LANDING');
    } else if (target === 'USER_PROFILE') {
      if (user) {
        handleVisitUser(user.uid);
      } else {
        loginWithGoogle();
      }
    } else if (target === 'SEARCH') {
      setSearchQuery(params?.query || '');
      setView('SEARCH');
    } else if (target === 'RADIO') {
      setSelectedRadioArtistId(params?.artistId);
      setView('RADIO');
    } else if (target === 'CHAT') {
      setView('CHAT');
    } else if (target === 'SETTINGS') {
      if (!user) {
        loginWithGoogle();
        return;
      }
      setView('CREATOR');
    } else if (target === 'CREATOR') {
      if (!user) {
        loginWithGoogle();
        return;
      }
      if (params?.editingAlbum) {
        setEditingAlbum(params.editingAlbum);
        setShowCreator(true);
      } else {
        setView('CREATOR');
      }
    } else if (target === 'SANCTUARY') {
      setViewedUserId(params?.artistId || user?.uid);
      setView('SANCTUARY');
    } else if (target === 'STORE') {
      setView('STORE');
    } else if (target === 'ADMIN_DASHBOARD') {
      setView('ADMIN_DASHBOARD');
    } else if (target === 'ADMIN_AD_DASHBOARD') {
      setView('ADMIN_AD_DASHBOARD');
    } else if (target === 'PARTNER_DASHBOARD') {
      setView('PARTNER_DASHBOARD');
    } else if (target === 'HELP_CENTER') {
      setView('HELP_CENTER');
    } else if (target === 'BRAND_DASHBOARD') {
      setView('BRAND_DASHBOARD');
    } else if (target === 'VIDEO_MANAGER') {
      setView('VIDEO_MANAGER');
    }
  };

  const loadAlbums = async () => {
    const cloudAlbums = await fetchAllPublicAlbums();
    setAlbums(cloudAlbums);
  };

  useEffect(() => {
    const unsubscribe = onAuthUpdate(async (u) => {
      setUser(u);
      if (u) {
        setViewInternal(prev => {
          if (prev === 'LANDING') {
            const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 640;
            const tvKeywords = ['tv', 'smarttv', 'googletv', 'appletv', 'tizen', 'webos', 'hbbtv', 'pov_tv', 'netcast.tv'];
            const isTV = tvKeywords.some(keyword => navigator.userAgent.toLowerCase().includes(keyword));
            if (isMobileDevice) {
              setTheme('PHONE');
              return 'MUSIC';
            } else if (isTV) {
              setTheme('BIG_SCREEN');
              return 'LIVE_HUB';
            }
            return 'DASHBOARD';
          }
          return prev;
        });

        const p = await fetchUserProfile(u.uid);
        setUserProfile(p);
        
        if (p?.uiSettings?.lastTheme) {
          setTheme(p.uiSettings.lastTheme);
        }

        // Initialize demo worlds
        seedDemoWorlds();

        if (p && !p.hasCompletedOnboarding) {
          setShowOnboarding(true);
        }

        // Seed public domain books if none exist and user is admin
        if (u.email === 'kmoody2003@gmail.com') {
          const cloudAlbums = await fetchAllPublicAlbums();
          if (!cloudAlbums.some(a => a.type === 'BOOK')) {
            await seedPublicDomainBooks();
            const updatedAlbums = await fetchAllPublicAlbums();
            setAlbums(updatedAlbums);
          }
        }
      } else {
        setUserProfile(null);
        // Auto-enter the app for unauthenticated guests — skip requiring manual "Enter As Guest" click
        setViewInternal(prev => prev === 'LANDING' ? 'DASHBOARD' : prev);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const init = async () => {
      // Run connectivity check
      const isConnected = await checkCloudConnection();
      setCloudStatus(isConnected ? 'CONNECTED' : 'OFFLINE');

      const params = new URLSearchParams(window.location.search);
      const projectId = params.get('id');
      const shareType = params.get('type');
      
      if (projectId) {
        if (shareType === 'video') {
          import('./services/backendService').then(async (m) => {
            try {
               const vids = await m.fetchAllVideos();
               const video = vids.find(v => v.id === projectId);
               if (video) {
                 setSelectedVideo(video);
                 setView('VIDEOS');
                 setIsPublicView(true);
                 document.title = `${video.title} | Plajah`;
               }
            } catch(e) {}
          });
          setIsLoading(false);
          return;
        } else if (shareType === 'feed') {
          setView('FEED');
          setIsLoading(false);
          return;
        } else if (shareType === 'comment') {
          const parentId = params.get('parent');
          if (parentId) {
            import('./services/backendService').then(async (m) => {
               try {
                 const remoteAlbum = await m.fetchProjectFromCloud(parentId);
                 if (remoteAlbum) {
                   setSelectedAlbum(remoteAlbum);
                   setView('PLAYER');
                   setIsPublicView(true);
                   document.title = `${remoteAlbum.title} | Plajah`;
                 }
               } catch(e) {}
            });
          }
          setIsLoading(false);
          return;
        } else {
          // Defaults to album
          const remoteAlbum = await fetchProjectFromCloud(projectId);
          if (remoteAlbum) {
            setSelectedAlbum(remoteAlbum);
            setView('PLAYER');
            setIsPublicView(true);
            document.title = `${remoteAlbum.title} | Plajah`;
            setIsLoading(false);
            return;
          }
        }
      }

      // Handle profile routing
      const pathParts = window.location.pathname.split('/');
      if (pathParts[1] === 'profile' && pathParts[2]) {
        setViewedUserId(pathParts[2]);
        setView('USER_PROFILE');
        setIsLoading(false);
        return;
      }

      await loadAlbums();
      setIsLoading(false);
    };

    init();
  }, []);

  useEffect(() => {
    const themeClasses: Record<ThemeType, string> = {
      'DARK': '',
      'LIGHT': 'theme-light',
      'PASTEL': 'theme-pastel',
      'PLAJAH': 'theme-plajah',
      'BIG_SCREEN': 'theme-big-screen',
      'PHONE': 'theme-phone',
      'ETHEREAL': 'theme-ethereal',
      'NEBULA': 'theme-nebula',
      'CITRUS': 'theme-citrus'
    };
    document.body.className = themeClasses[theme];
  }, [theme]);

  useEffect(() => {
    if (theme !== 'BIG_SCREEN') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const elements = Array.from(document.querySelectorAll(focusableSelector)) as HTMLElement[];
      const active = document.activeElement as HTMLElement;
      const currentIndex = elements.indexOf(active);

      if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
        let nextIndex = currentIndex;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          nextIndex = (currentIndex + 1) % elements.length;
        } else {
          nextIndex = (currentIndex - 1 + elements.length) % elements.length;
        }
        elements[nextIndex]?.focus();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [theme]);

  const getThemeStyles = () => {
    switch (theme) {
      case 'LIGHT':
        return {
          bg: 'bg-[#FDFDFD]',
          text: 'text-black',
          subtext: 'text-black/60',
          nav: 'bg-white/80 border-black/5',
          tabActive: 'text-small-orange border-small-orange shadow-[0_4px_12px_rgba(255,140,0,0.2)]',
          tabInactive: 'text-black/30 hover:text-black',
        };
      case 'PASTEL':
        return {
          bg: 'bg-[#F9F5F1]',
          text: 'text-rose-900',
          subtext: 'text-rose-700/60',
          nav: 'bg-[#eee8d5]/80 border-black/5',
          tabActive: 'text-small-orange border-small-orange shadow-[0_4px_12px_rgba(255,140,0,0.2)]',
          tabInactive: 'text-[#073642]/30 hover:text-[#073642]',
        };
      case 'ETHEREAL':
        return {
          bg: 'bg-[#06060f]',
          text: 'text-cyan-50',
          subtext: 'text-cyan-200/60',
          nav: 'bg-[#131314]/80 border-purple-500/20',
          tabActive: 'text-small-orange border-small-orange shadow-[0_0_20px_rgba(255,140,0,0.3)]',
          tabInactive: 'text-white/20 hover:text-white',
        };
      case 'NEBULA':
        return {
          bg: 'bg-[#050510]',
          text: 'text-indigo-50',
          subtext: 'text-indigo-200/60',
          nav: 'bg-black/20 border-white/10 backdrop-blur-md',
          tabActive: 'text-cyan-400 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]',
          tabInactive: 'text-white/20 hover:text-white',
        };
      case 'CITRUS':
        return {
          bg: 'bg-[#0A0A0A]',
          text: 'text-white',
          subtext: 'text-white/60',
          nav: 'bg-black/80 border-[#FF3B00]/20 backdrop-blur-md',
          tabActive: 'text-[#FF3B00] border-[#FF3B00] shadow-[0_0_15px_rgba(255,59,0,0.3)]',
          tabInactive: 'text-white/40 hover:text-white',
        };
      default: // PLAJAH and fallback
        return {
          bg: 'bg-transparent',
          text: 'text-white',
          subtext: 'text-white/40',
          nav: 'bg-black/40 border-white/5',
          tabActive: 'text-small-orange border-small-orange shadow-[0_0_20px_rgba(255,140,0,0.3)]',
          tabInactive: 'text-white/40 hover:text-white',
        };
    }
  };

  const s = getThemeStyles();

  const handleCreateAlbum = async (newAlbum: Album) => {
    if (editingAlbum) {
      setAlbums(albums.map(a => a.id === newAlbum.id ? newAlbum : a));
      setEditingAlbum(null);
    } else {
      setAlbums([newAlbum, ...albums]);
    }
    setShowCreator(false);
    setSelectedAlbum(newAlbum);
    setView('PREVIEW');
  };

  const handleDeleteAlbum = async (id: string) => {
    await deleteCloudAlbum(id);
    setAlbums(albums.filter(a => a.id !== id));
    setShowDeleteConfirm(null);
  };

  const handleShareAlbum = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}?id=${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBackToDashboard = () => {
    setSelectedAlbum(null);
    setSelectedGame(null);
    setSelectedVideo(null);
    setSelectedBook(null);
    setSelectedPoolId(null);
    setSelectedClassId(null);
    setViewedUserId(null);

    const path = isPublicView ? window.location.pathname : '/';
    if (isPublicView) {
      setIsPublicView(false);
    }
    
    setView('DASHBOARD', path);
    loadAlbums();
  };

  const [visitedProfile, setVisitedProfile] = useState<UserProfile | null>(null);

  const handleVisitUser = async (uid: string, initialTab?: string) => {
    setViewedUserId(uid);
    setInitialProfileTab(initialTab);
    setSelectedAlbum(null);
    setSelectedGame(null);
    setSelectedVideo(null);
    setSelectedBook(null);
    setSelectedPoolId(null);
    setSelectedClassId(null);
    
    setView('USER_PROFILE', `/profile/${uid}`);
    
    try {
      const p = await fetchUserProfile(uid);
      setVisitedProfile(p);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMessage = async (uid: string) => {
    if (!user) {
      await loginWithGoogle();
      return;
    }
    await createChatRoom([user.uid, uid], 'PRIVATE');
    setView('CHAT');
  };

  const sortedItems = [...albums]
    .filter(album => (album.type || 'MUSIC') === archiveTab)
    .sort((a, b) => {
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const handlePurchase = (item: any, isAlbum: boolean) => {
    if (!user) {
      alert("Please sign in to make a purchase.");
      loginWithGoogle();
      return;
    }
    // Replaced alert with console log and ideally we'd show a modal
    console.log(`Purchase requested for ${isAlbum ? 'Album' : 'Item'}: ${item.title}. Price: $${item.price || '9.99'}`);
    // You could set a 'showPurchaseModal' state here
  };

  const handleSelectGame = async (game: Game) => {
    setSelectedAlbum(null);
    setSelectedVideo(null);
    setSelectedBook(null);
    setSelectedGame(game);
    setView('GAME_PLAYER');
    await updateGamePlayCount(game.id);
  };

  useEffect(() => {
    const activeProfile = view === 'USER_PROFILE' ? visitedProfile : userProfile;
    const hasBg = !!(activeProfile?.frostedBackground || activeProfile?.videoBackgroundUrl);
    if (hasBg) {
      document.body.classList.add('has-custom-background');
    } else {
      document.body.classList.remove('has-custom-background');
    }
  }, [view, visitedProfile, userProfile]);

  useEffect(() => {
    const activeProfile = view === 'USER_PROFILE' ? visitedProfile : userProfile;
    const curId = activeProfile?.activeThemePresetId || null;
    if (curId !== activeThemeId) {
      setActiveThemeId(curId);
      setThemeAssetIndex(0);
      setThemeAssetLoopCount(0);
      if (curId) {
        fetchThemePresetById(curId).then(theme => setActiveTheme(theme)).catch(console.error);
      } else {
        setActiveTheme(null);
      }
    }
  }, [view, visitedProfile, userProfile, activeThemeId]);

  useEffect(() => {
    if (!activeTheme || !activeTheme.assets || activeTheme.assets.length <= 1) return;
    const asset = activeTheme.assets[themeAssetIndex % activeTheme.assets.length];
    if (asset && asset.type === 'PHOTO') {
      const timeout = setTimeout(() => {
        setThemeAssetIndex((prev) => (prev + 1) % activeTheme.assets.length);
      }, 15000); // 15 seconds for photos
      return () => clearTimeout(timeout);
    }
  }, [activeTheme, themeAssetIndex]);

  useEffect(() => {
    if (viewedUserId && view === 'USER_PROFILE' && (!visitedProfile || visitedProfile.uid !== viewedUserId)) {
      fetchUserProfile(viewedUserId).then(setVisitedProfile).catch(console.error);
    }
  }, [viewedUserId, view, visitedProfile]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-[2.5rem] flex items-center justify-center shadow-[0_0_50px_rgba(107,0,153,0.3)]">
            <Logo size={48} />
          </div>
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-small-orange">Synchronizing Global Archive</p>
      </div>
    );
  }

  const handleSetTheme = (newTheme: ThemeType) => {
    setTheme(newTheme);
    if (userProfile?.uid) {
      updateUserProfile(userProfile.uid, {
        uiSettings: {
          ...userProfile.uiSettings,
          lastTheme: newTheme
        }
      });
    }
  };

  return (
    <ErrorBoundary>
      <BadgeProvider>
        <PointsProvider>
          <AchievementProvider>
            <UploadProvider>
              <NotificationProvider>
                <SpatialProvider initialValue={userProfile?.uiSettings?.isSpatialModeEnabled}>
        <Suspense fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-black z-[200]">
            <div className="flex flex-col items-center gap-4">
              <Logo className="w-24 h-24" />
              <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="w-full h-full bg-small-orange"
                />
              </div>
            </div>
          </div>
        }>
          {view === 'LANDING' ? (
          <LandingPage 
            onEnter={handleEnterApp} 
            onVisitUser={handleVisitUser}
          />
        ) : (
          <div className={`h-real-screen w-full flex flex-col lg:flex-row relative z-0 overflow-hidden bg-transparent no-select ${((view === 'USER_PROFILE' ? visitedProfile : userProfile)?.frostedBackground || (view === 'USER_PROFILE' ? visitedProfile : userProfile)?.videoBackgroundUrl) ? 'is-custom-bg' : ''}`}>
            {/* Universal Background Layer */}
            <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-theme" id="universal-background">
              <AnimatePresence mode="wait">
                {(() => {
                  const activeProfile = view === 'USER_PROFILE' ? visitedProfile : userProfile;
                  if (!activeProfile) return null;

                  const {
                    videoBackgroundUrl,
                    frostedBackground,
                    videoBackgroundBlur = true,
                    videoBackgroundFrosted = true,
                    customBgEnabled,
                    customThemeEnabled
                  } = activeProfile;

                  const bgAllowed = customBgEnabled !== false;
                  const themeAllowed = customThemeEnabled !== false;

                  let finalVideoUrl = bgAllowed ? videoBackgroundUrl : null;
                  let finalPhotoUrl = bgAllowed ? frostedBackground : null;

                  // Evaluate active theme assets
                  if (themeAllowed && activeTheme && activeTheme.assets && activeTheme.assets.length > 0) {
                      const asset = activeTheme.assets[themeAssetIndex % activeTheme.assets.length];
                      if (asset.type === 'VIDEO') {
                          finalVideoUrl = asset.url;
                          finalPhotoUrl = null;
                      } else {
                          finalPhotoUrl = asset.url;
                          finalVideoUrl = null;
                      }
                  }

                  if (!finalVideoUrl && !finalPhotoUrl) return null;

                  return (
                    <motion.div
                      key={finalVideoUrl || finalPhotoUrl}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.5 }}
                      className="absolute inset-0 w-screen h-screen"
                    >
                      {finalVideoUrl ? (
                        <video
                          src={finalVideoUrl}
                          autoPlay
                          muted
                          playsInline
                          onEnded={(e) => {
                             if (activeTheme && activeTheme.assets && activeTheme.assets.length > 1) {
                                 const nextCount = themeAssetLoopCount + 1;
                                 if (nextCount > 2) { // 3 loops (0, 1, 2)
                                     setThemeAssetLoopCount(0);
                                     setThemeAssetIndex((prev) => (prev + 1) % activeTheme.assets.length);
                                 } else {
                                     setThemeAssetLoopCount(nextCount);
                                     e.currentTarget.play(); // Play again
                                 }
                             } else {
                                 e.currentTarget.play(); // No other assets, just loop
                             }
                          }}
                          className={`w-full h-full object-cover transition-all duration-1000 ${videoBackgroundBlur !== false ? 'blur-[40px] scale-105' : ''}`}
                        />
                      ) : finalPhotoUrl ? (
                        <div
                          className={`w-full h-full bg-cover bg-center transition-all duration-1000 ${videoBackgroundBlur !== false ? 'blur-[40px] scale-105' : ''}`}
                          style={{ backgroundImage: `url(${finalPhotoUrl})` }}
                        />
                      ) : null}
                      
                      {videoBackgroundFrosted !== false && (
                        <div className="absolute inset-0 backdrop-blur-[100px] bg-black/30" />
                      )}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>

            <BackgroundFrequencyGraph />

            {theme === 'CITRUS' && <CitrusWaterDrops />}
            {theme === 'NEBULA' && (
              <>
                <NebulaBackground />
                {view !== 'VIDEOS' && view !== 'MOVIES_TV' && view !== 'MOVIE_UX' && view !== 'PLAYER' && (
                  <NebulaVisualizer analyser={analyser} isPlaying={isPlaying} />
                )}
              </>
            )}
            {/* Left Ad Area (Moved to far left) */}
          {(!isPublicView && view !== 'MOVIE_UX' && view !== 'GAME_PLAYER' && view !== 'EVENT_PHOTO_POOL') && (
            <aside className="lg:w-80 p-8 border-r border-white/5 bg-black/40 backdrop-blur-3xl hidden lg:flex flex-col gap-8 sticky top-0 h-screen z-50 overflow-y-auto custom-scrollbar overflow-x-hidden">
              <SystemMessageBanner />
              <div className="flex items-center gap-3 mb-4">
                <Sparkles size={16} className="text-small-orange" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Sponsored Content</span>
              </div>
              <a 
                href="https://google.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group relative aspect-video w-full bg-gradient-to-br from-[#6B0099] to-[#FF8C00] rounded-[2rem] overflow-hidden shadow-2xl hover:scale-105 transition-all active:scale-95"
              >
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <Logo size={40} className="mb-4" />
                  <p className="text-sm font-black uppercase tracking-tighter text-white mb-2">Upgrade to Pro</p>
                  <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Unlock Global Distribution</p>
                </div>
                <div className="absolute bottom-4 right-4 p-2 bg-white/10 backdrop-blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <Share2 size={12} className="text-white" />
                </div>
              </a>
              <div className="mt-auto p-6 bg-white/5 rounded-[2rem] border border-white/5">
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em] leading-loose">Support the creators of Plajah by exploring our partner network.</p>
              </div>
            </aside>
          )}

          {(!isPublicView && !isMobile && theme !== 'PHONE') && (
            <aside className={`${isSidebarCollapsed ? 'w-24' : (theme === 'BIG_SCREEN' ? 'w-24 hover:w-80' : 'w-80')} border-r border-white/[0.07] hidden lg:flex flex-col p-4 lg:p-6 sticky top-0 h-screen glass-high transition-all duration-500 group/sidebar z-50 overflow-x-hidden shrink-0`}>
              <div className={`flex items-center gap-4 mb-10 px-1 h-14 ${isSidebarCollapsed ? 'justify-center' : (theme === 'BIG_SCREEN' ? 'justify-center group-hover/sidebar:justify-start' : '')}`}>
                <button 
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="w-12 h-12 rounded-xl bg-transparent flex items-center justify-center shadow-2xl hover:bg-white/5 transition-all shrink-0 border border-white/20 cursor-pointer hover:scale-105"
                  title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                  <Logo size={28} />
                </button>
                <div className={`${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:block' : 'block')} transition-all duration-300`}>
                  <span className="font-display font-black text-2xl tracking-tighter block leading-none text-white">Plajah</span>
                  <span className="bg-small-orange text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full ml-2">Early Access: Pardon Our Dust</span>
                  <span className="text-small-orange font-black uppercase tracking-[0.3em] text-[8px]">Playgrounds</span>
                </div>
              </div>
              
              <nav className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar overflow-x-hidden w-full">
                {(() => {
                  const baseConfig = [
                    { id: 'USER_PROFILE', order: 0, isVisible: true },
                    { id: 'DASHBOARD', order: 1, isVisible: true },
                    { id: 'WORLDS', order: 1.5, isVisible: true },
                    { id: 'MUSIC', order: 2, isVisible: true },
                    { id: 'VIDEOS', order: 3, isVisible: true },
                    { id: 'MOVIES_TV', order: 4, isVisible: true },
                    { id: 'ARTICLES', order: 5, isVisible: true },
                    { id: 'BOOKS', order: 6, isVisible: true },
                    { id: 'RADIO', order: 7, isVisible: true },
                    { id: 'APPS', order: 8.5, isVisible: true },
                    { id: 'GAMES', order: 9, isVisible: true },
                    { id: 'CLUBS', order: 10, isVisible: true },
                    { id: 'CHARITY', order: 11, isVisible: true },
                    { id: 'CLASSROOMS', order: 12, isVisible: true },
                    { id: 'GLOBAL_PHOTOS', order: 14, isVisible: true },
                    { id: 'ART_GALLERY', order: 15, isVisible: true },
                    { id: 'PAY_IT_FORWARD', order: 16, isVisible: true },
                    { id: 'CHAT', order: 17, isVisible: true },
                    { id: 'DISCUSSION', order: 17.5, isVisible: true },
                    { id: 'FEED', order: 18, isVisible: true },
                    { id: 'LIVE_HUB', order: 19, isVisible: true },
                    { id: 'POSTMAN', order: 19.5, isVisible: true },
                    { id: 'SEARCH', order: 20, isVisible: true },
                    { id: 'HELP_CENTER', order: 21, isVisible: true }
                  ];

                  let displayConfig = [...baseConfig];
                  if (userProfile?.sidebarConfig && userProfile.sidebarConfig.length > 0) {
                    displayConfig = [...userProfile.sidebarConfig];
                    baseConfig.forEach(baseItem => {
                      if (!displayConfig.find(item => item.id === baseItem.id)) {
                        displayConfig.push(baseItem);
                      }
                    });
                  }

                  return displayConfig
                    .filter(item => item.isVisible)
                    .sort((a, b) => a.order - b.order)
                    .map(config => {
                      const items = {
                        USER_PROFILE: { label: 'My Profile', icon: User },
                        DASHBOARD: { label: 'Global Archive', icon: Settings },
                        MUSIC: { label: 'Chora', icon: Music2 },
                        WORLDS: { label: 'Worlds', icon: Globe },
                        VIDEOS: { label: 'Reello', icon: VideoIcon },
                        MOVIES_TV: { label: 'Taleo', icon: Film },
                        ARTICLES: { label: 'The Newstand', icon: Newspaper },
                        BOOKS: { label: 'The Book Shelf', icon: BookOpen },
                        RADIO: { label: 'Radio', icon: Radio },
                        LIVE_TV: { label: 'Live TV', icon: Tv },
                        APPS: { label: 'Apps', icon: AppWindow },
                        GAMES: { label: 'Games', icon: Gamepad2 },
                        CLUBS: { label: 'Clubs', icon: Users },
                        CHARITY: { label: 'Charity', icon: Heart },
                        CLASSROOMS: { label: 'Classrooms', icon: GraduationCap },
                        PPV_EVENTS: { label: 'Live Events', icon: Ticket },
                        GLOBAL_PHOTOS: { label: 'Photos', icon: Camera },
                        ART_GALLERY: { label: 'Art Gallery', icon: Sparkles },
                        PAY_IT_FORWARD: { label: 'Pay It Forward', icon: Heart },
                        CHAT: { label: 'Messages', icon: MessageSquare },
                        DISCUSSION: { label: 'Discussion', icon: MessageCircle },
                        POSTMAN: { label: 'The Postman', icon: Mail },
                        FEED: { label: 'Global Feed', icon: Rss },
                        LIVE_HUB: { label: 'Live Hub', icon: Sparkles },
                        SEARCH: { label: 'Find Artists', icon: Search },
                        HELP_CENTER: { label: 'Help Center', icon: HelpCircle },
                        ADMIN_AD_DASHBOARD: { label: 'Ad Platform', icon: Megaphone },
                        PARTNER_DASHBOARD: { label: 'Partner Portal', icon: Database }
                      };
                      const item = items[config.id as keyof typeof items];
                      if (!item) return null;

                      const tooltipContent = {
                        USER_PROFILE: "View and edit your public artistic profile and account settings.",
                        DASHBOARD: "Explore the global archive of music, videos, and books.",
                        MUSIC: "Listen to the latest tracks and albums from our community.",
                        WORLDS: "Explore and interlink your created IP.",
                        VIDEOS: "Watch music videos, vlogs, and original video content.",
                        MOVIES_TV: "Stream full-length movies and television series in high definition.",
                        ARTICLES: "Read newsletters and articles from your favorite writers.",
                        BOOKS: "Browse and read digital books, comics, and graphic novels.",
                        RADIO: "Tune into live artist stations and curated broadcasts.",
                        LIVE_TV: "Watch continuous video streams and live FAST channels.",
                        APPS: "Install and run community web applications and tools.",
                        GAMES: "Play interactive web games directly in your browser.",
                        CLUBS: "Join free community groups based on shared interests.",
                        CHARITY: "Support non-profits and explore fundraising campaigns.",
                        CLASSROOMS: "Learn new skills from experts in our interactive classrooms.",
                        PPV_EVENTS: "Join live pay-per-view events and exclusive broadcasts.",
                        GLOBAL_PHOTOS: "Explore a world of photography and visual art.",
                        ART_GALLERY: "A curated experience of the finest visual works.",
                        PAY_IT_FORWARD: "Support the community through our unique giving platform.",
                        CHAT: "Connect with artists and fans in private or group chats.",
                        DISCUSSION: "Join community discussion boards and open forums.",
                        POSTMAN: "Access the formal AI-Studio dispatch system.",
                        FEED: "See the latest updates and posts from everyone you follow.",
                        LIVE_HUB: "Discover what's happening live on the platform right now.",
                        SEARCH: "Find specific artists, albums, or content.",
                        HELP_CENTER: "Access documentation, tutorials, and platform guides.",
                        ADMIN_AD_DASHBOARD: "Manage platform advertisements and promotions.",
                        PARTNER_DASHBOARD: "Configure cloud storage and partner integrations."
                      }[config.id] || "Navigate to this section.";

                      return (
                        <Tooltip key={config.id} content={tooltipContent} enabled={tooltipsActive}>
                          <button 
                            onClick={() => {
                              if (config.id === 'PAY_IT_FORWARD') {
                                setIsPIFModalOpen(true);
                                return;
                              }
                              if (config.id === 'LIVE_TV') {
                                setView('LIVE_TV');
                                return;
                              }
                              if (config.id === 'MOVIES_TV') {
                                setView('MOVIES_TV');
                                return;
                              }
                              if (config.id === 'WORLDS') {
                                setView('WORLDS');
                                return;
                              }
                              if (config.id === 'USER_PROFILE') {
                                if (user) {
                                  handleVisitUser(user.uid);
                                } else {
                                  loginWithGoogle();
                                }
                              } else if (config.id === 'MUSIC') {
                                setView('MUSIC');
                              } else if (config.id === 'ADMIN_AD_DASHBOARD') {
                                setView('ADMIN_AD_DASHBOARD');
                              } else if (config.id === 'PARTNER_DASHBOARD') {
                                setView('PARTNER_DASHBOARD');
                              } else {
                                setView(config.id as any);
                              }
                            }} 
                            className={`flex items-center relative transition-all duration-300 overflow-hidden rounded-[1.2rem] mx-auto group
                              ${isSidebarCollapsed 
                                  ? 'w-12 h-12 justify-center group-hover/sidebar:w-12 group-hover/sidebar:px-0' 
                                  : (theme === 'BIG_SCREEN' ? 'w-12 h-12 justify-center group-hover/sidebar:w-full group-hover/sidebar:px-6' : 'w-full h-12 px-6')}
                              ${(view === config.id && (config.id !== 'USER_PROFILE' || viewedUserId === user?.uid)) 
                                ? 'bg-white text-black shadow-xl' 
                                : 'text-primary/40 hover:text-primary hover:bg-white/5 bg-transparent'
                              }`}
                          >
                            {(() => {
                              const Icon = item.icon;
                              return <Icon size={20} className={`shrink-0 absolute left-1/2 -translate-x-1/2 transition-all duration-300 
                                ${isSidebarCollapsed ? 'left-1/2 -translate-x-1/2' : (theme === 'BIG_SCREEN' ? 'group-hover/sidebar:left-6 group-hover/sidebar:translate-x-0' : 'left-6 translate-x-0')} 
                                ${(view === config.id && (config.id !== 'USER_PROFILE' || viewedUserId === user?.uid)) ? 'text-black' : 'group-hover:scale-110'}`} />
                            })()}
                            <span className={`text-[11px] uppercase tracking-widest text-center flex-1 transition-all duration-300 whitespace-nowrap opacity-0 
                              ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'group-hover/sidebar:opacity-100' : 'opacity-100')} 
                              ${(view === config.id && (config.id !== 'USER_PROFILE' || viewedUserId === user?.uid)) ? 'font-black' : 'font-semibold group-hover:font-black'}`}>
                              {item.label}
                            </span>
                          </button>
                        </Tooltip>
                      );
                    });
                })()}
              </nav>

              <div className={`mt-4 space-y-4 ${isSidebarCollapsed ? 'px-2' : 'px-6 group-hover/sidebar:px-6'}`}>
                <SpatialToggle collapsed={isSidebarCollapsed || theme === 'BIG_SCREEN'} />
                <button
                  onClick={() => { setIsNanoView(false); setIsShrunk(false); }}
                  className={`w-full flex items-center transition-all group overflow-hidden relative ${
                    (isSidebarCollapsed || theme === 'BIG_SCREEN') ? 'justify-center p-3 rounded-2xl' : 'gap-5 px-6 py-5 rounded-[2rem]'
                  } bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 text-violet-400 hover:from-violet-500/30 hover:to-purple-600/30 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all`}
                  title="Open Controller"
                >
                  <div className="absolute inset-0 bg-violet-400/5 blur-xl pointer-events-none animate-pulse" />
                  <div className="relative flex items-center justify-center min-w-[22px] shrink-0">
                    <Zap size={22} className="text-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
                  </div>
                  {!(isSidebarCollapsed || theme === 'BIG_SCREEN') && (
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Controller</span>
                      <span className="text-[8px] font-bold opacity-40 uppercase tracking-widest">Open Player</span>
                    </div>
                  )}
                </button>
                <div className={`${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
                  <NotificationCenter />
                </div>
              </div>

              <div className="pt-10 border-t border-theme space-y-6">
                <div className={`p-6 bg-white/[0.04] border border-theme rounded-[2.5rem] shadow-inner ${isSidebarCollapsed ? 'p-2 rounded-2xl flex flex-col items-center gap-4' : ''}`}>
                  <div className={`flex items-center gap-4 ${isSidebarCollapsed ? 'mb-0 justify-center' : (theme === 'BIG_SCREEN' ? 'mb-6 justify-center group-hover/sidebar:justify-start' : 'mb-6')}`}>
                     <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden ring-2 ring-white/5 shrink-0">
                        {user?.photoURL ? <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" /> : <User size={20} className="text-white/40" />}
                     </div>
                     <div className={`overflow-hidden ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:block' : 'block')}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{user?.displayName || 'Guest Artist'}</p>
                        <p className="text-[8px] font-bold text-small-orange truncate opacity-60">{user ? user.email : 'Public Instance'}</p>
                     </div>
                  </div>
                  
                  <div className={`flex flex-col gap-3 ${isSidebarCollapsed ? 'items-center' : (theme === 'BIG_SCREEN' ? 'items-center group-hover/sidebar:items-start' : '')}`}>
                    <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${cloudStatus === 'CONNECTED' ? 'text-green-500' : cloudStatus === 'OFFLINE' ? 'text-red-500' : 'text-white/20'}`}>
                      {cloudStatus === 'CONNECTED' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      <span className={isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:inline' : '')}>
                        {cloudStatus === 'CONNECTED' ? 'Cloud Verified' : cloudStatus === 'OFFLINE' ? 'Connection Lost' : 'Checking Link...'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/5 flex flex-col gap-3">
                    {user ? (
                      <button onClick={logout} className={`flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-xl px-3 py-2 transition-all ${isSidebarCollapsed ? 'justify-center' : (theme === 'BIG_SCREEN' ? 'justify-center group-hover/sidebar:justify-start' : '')}`}>
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                          <LogOut size={14} className="text-red-400" />
                        </div>
                        <span className={isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:inline' : '')}>Sign Out</span>
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button onClick={loginWithGoogle} className={`flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary hover:bg-white/5 rounded-xl px-3 py-2 transition-all ${isSidebarCollapsed ? 'justify-center' : (theme === 'BIG_SCREEN' ? 'justify-center group-hover/sidebar:justify-start' : '')}`}>
                          <div className="w-8 h-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                            <LogIn size={14} />
                          </div>
                          <span className={isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:inline' : '')}>Sign In with Google</span>
                        </button>
                        <button onClick={loginWithTwitter} className={`flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary hover:bg-white/5 rounded-xl px-3 py-2 transition-all ${isSidebarCollapsed ? 'justify-center' : (theme === 'BIG_SCREEN' ? 'justify-center group-hover/sidebar:justify-start' : '')}`}>
                          <div className="w-8 h-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                            <XIcon size={14} />
                          </div>
                          <span className={isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:inline' : '')}>Sign In with X</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Mobile Bottom Tab Bar */}
          {(isMobile || theme === 'PHONE') && (
            <>
              {/* Fixed bottom tab bar — 5 primary destinations */}
              <nav className="fixed bottom-0 left-0 right-0 z-[150] glass-nav gpu">
                <div className="flex items-center justify-around px-1 pt-1 pb-android-nav">
                  {[
                    { id: 'MUSIC', icon: Music2, label: 'Chora' },
                    { id: 'ARTICLES', icon: Newspaper, label: 'News' },
                    { id: 'DASHBOARD', icon: Home, label: 'Home' },
                    { id: 'SEARCH', icon: Search, label: 'Search' },
                    { id: '__MORE__', icon: ChevronUp, label: 'More' },
                  ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = tab.id !== '__MORE__' && view === tab.id;
                    const isMore = tab.id === '__MORE__';
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (isMore) {
                            setIsBottomSectionExpanded(v => !v);
                          } else if (tab.id === 'USER_PROFILE') {
                            if (user) handleVisitUser(user.uid);
                            else loginWithGoogle();
                          } else {
                            setView(tab.id as any);
                            setIsBottomSectionExpanded(false);
                          }
                        }}
                        className="flex flex-col items-center gap-0.5 flex-1 py-1.5 android-press"
                        style={{ minHeight: 48, minWidth: 48 }}
                      >
                        <div className={`w-12 h-8 rounded-2xl flex items-center justify-center transition-colors ${isActive ? 'bg-small-orange/20' : (isMore && isBottomSectionExpanded) ? 'bg-white/10' : ''}`}>
                          <Icon size={22} className={isActive ? 'text-small-orange' : 'text-white/50'} />
                        </div>
                        <span className={`text-[9px] font-black uppercase tracking-wider ${isActive ? 'text-small-orange' : 'text-white/40'}`}>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              {/* Full app drawer — slides up from bottom tab bar */}
              <AnimatePresence>
                {isBottomSectionExpanded && (
                  <motion.div
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                    className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-[145] glass-sheet rounded-t-m3-2xl max-h-[65vh] overflow-y-auto gpu"
                  >
                    <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-white/5 glass-nav rounded-t-m3-2xl">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">All Sections</span>
                      <button onClick={() => setIsBottomSectionExpanded(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <ChevronDown size={16} className="text-white/60" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-4">
                      {[
                        { id: 'USER_PROFILE', icon: User, label: 'Profile' },
                        { id: 'DASHBOARD', icon: Home, label: 'Home' },
                        { id: 'MUSIC', icon: Music2, label: 'Music' },
                        { id: 'VIDEOS', icon: VideoIcon, label: 'Videos' },
                        { id: 'MOVIES_TV', icon: Film, label: 'Movies' },
                        { id: 'BOOKS', icon: BookOpen, label: 'Books' },
                        { id: 'ARTICLES', icon: Newspaper, label: 'Newsstand' },
                        { id: 'RADIO', icon: Radio, label: 'Radio' },
                        { id: 'LIVE_HUB', icon: Sparkles, label: 'Live' },
                        { id: 'GAMES', icon: Gamepad2, label: 'Games' },
                        { id: 'APPS', icon: AppWindow, label: 'Apps' },
                        { id: 'CLUBS', icon: Users, label: 'Clubs' },
                        { id: 'CHAT', icon: MessageSquare, label: 'Messages' },
                        { id: 'FEED', icon: Rss, label: 'Feed' },
                        { id: 'CLASSROOMS', icon: GraduationCap, label: 'Classes' },
                        { id: 'GLOBAL_PHOTOS', icon: Camera, label: 'Photos' },
                        { id: 'SEARCH', icon: Search, label: 'Search' },
                        { id: 'HELP_CENTER', icon: HelpCircle, label: 'Help' },
                      ].map(section => {
                        const Icon = section.icon;
                        const isActive = view === section.id;
                        return (
                          <button
                            key={section.id}
                            onClick={() => {
                              if (section.id === 'USER_PROFILE') {
                                if (user) handleVisitUser(user.uid);
                                else loginWithGoogle();
                              } else {
                                setView(section.id as any);
                              }
                              setIsBottomSectionExpanded(false);
                            }}
                            className={`flex flex-col items-center gap-2 p-3 rounded-m3-lg transition-all android-press ${isActive ? 'bg-small-orange/15 border border-small-orange/30' : 'glass-low m3-state-hover'}`}
                          >
                            <Icon size={22} className={isActive ? 'text-small-orange' : 'text-white/60'} />
                            <span className={`text-[8px] font-black uppercase tracking-wider text-center leading-tight ${isActive ? 'text-small-orange' : 'text-white/50'}`}>{section.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Auth row at bottom of drawer */}
                    {!user && (
                      <div className="flex gap-3 px-4 pb-4">
                        <button onClick={() => { loginWithGoogle(); setIsBottomSectionExpanded(false); }} className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/60">
                          <LogIn size={14} /> Sign In
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <SpatialUIRoot className={`flex-1 flex flex-col w-full overflow-y-auto overflow-x-hidden custom-scrollbar ${(isMobile || theme === 'PHONE') ? (isShrunk ? (isLandscape ? 'pt-2 pb-20 transition-all duration-500' : 'pt-2 pb-40 transition-all duration-500') : (isLandscape ? 'pt-2 pb-24 transition-all duration-500' : 'pt-2 pb-64 transition-all duration-500')) : 'pb-40 lg:pb-0'}`}>
            {view === 'POSTMAN' && <PostmanView />}

            {view === 'ARTICLES' && (
              <NewstandView 
                onVisitUser={handleVisitUser}
                onSelectArticle={(article) => {
                  setSelectedArticle(article);
                  setView('ARTICLE_VIEW');
                }}
                onNewArticle={() => setView('ARTICLE_EDITOR')}
                currentUser={userProfile}
              />
            )}

            {view === 'ARTICLE_EDITOR' && userProfile && (
              <ArticleEditor 
                article={editingArticle || undefined}
                user={userProfile}
                onSave={(id) => {
                  setView('ARTICLES');
                }}
                onCancel={() => setView('ARTICLES')}
              />
            )}

            {view === 'ARTICLE_VIEW' && selectedArticle && (
              <ArticleView 
                article={selectedArticle}
                currentUser={userProfile}
                onBack={() => setView('ARTICLES')}
                onVisitUser={handleVisitUser}
              />
            )}

            {view === 'BRAND_DASHBOARD' && user && (
              <BrandDashboard 
                user={user}
                onBack={() => setView('CREATOR')}
              />
            )}

            {view === 'VIDEO_MANAGER' && user && (
              <VideoManager 
                user={user}
                onBack={() => setView('CREATOR')}
              />
            )}

            {view === 'SANCTUARY' && viewedUserId && (
              <ArtistMembersArea 
                artistId={viewedUserId} 
                onBack={() => setView('DASHBOARD')} 
              />
            )}

            {view === 'STORE' && (
              <MerchStorefront 
                onClose={() => setView('DASHBOARD')} 
              />
            )}

            {view === 'DASHBOARD' && (
              <div className="flex flex-col lg:flex-row w-full h-full">
                <div className="flex-1 p-6 lg:p-16 max-w-7xl mx-auto w-full">
                  <header className="mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                    <div>
                      <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-4">Global Archive</h1>
                      <p className="text-white/60 mb-6 text-sm lg:text-base leading-relaxed max-w-3xl">Explore and Discover new Music, New Stories, New Creators and New Voices. The Global Archive is your playground to new content experience. Much of it free, We hope you Support the creators generously if you find what they make speaks to you.</p>
                      {/* Creators Upload Here — pulsing CTA */}
                      <div className="relative inline-flex items-center justify-center mb-8">
                        <span className="absolute inset-0 rounded-full bg-small-orange opacity-25 animate-ping" style={{ animationDuration: '2s' }} />
                        <span className="absolute inset-0 rounded-full bg-small-orange opacity-15 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.8s' }} />
                        <button
                          onClick={() => { setEditingAlbum(null); setShowCreator(true); }}
                          className="relative inline-flex items-center gap-2 px-6 py-3 bg-small-orange text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-lg shadow-small-orange/40 animate-pulse"
                          style={{ animationDuration: '3s' }}
                        >
                          <Upload size={13} />
                          Creators Upload Here
                        </button>
                      </div>
                      <div className="flex items-center gap-6 mt-8 overflow-x-auto no-scrollbar pb-2">
                        {(['MUSIC', 'WORLDS', 'LIVE_HUB', 'VIDEO', 'MOVIES_TV', 'BOOK', 'GAMES', 'MODULES', 'MY_ARCHIVE'] as const).map(tab => (
                          <button 
                            key={tab}
                            onClick={() => {
                              if (tab === 'WORLDS') setView('WORLDS');
                              else if (tab === 'LIVE_HUB') setView('LIVE_HUB');
                              else if (tab === 'GAMES') setView('GAMES');
                              else if (tab === 'VIDEO') setView('VIDEOS');
                              else if (tab === 'MOVIES_TV') setView('MOVIES_TV');
                              else if (tab === 'BOOK') setView('BOOKS');
                              else if (tab === 'MODULES') setView('CLASSROOMS');
                              else if (tab === 'MY_ARCHIVE' && !user) loginWithGoogle();
                              else setArchiveTab(tab as any);
                            }}
                            className={`text-sm font-black uppercase tracking-[0.3em] transition-all pb-2 border-b-2 whitespace-nowrap shrink-0 ${archiveTab === tab ? 'text-white border-white' : 'text-white/20 border-transparent hover:text-white/40'}`}
                          >
                            {tab === 'MY_ARCHIVE' ? 'My Archive' : tab === 'MOVIES_TV' ? 'Movies & TV' : tab === 'VIDEO' ? 'Videos' : tab === 'LIVE_HUB' ? 'Live' : tab}
                          </button>
                        ))}
                      </div>
                      {archiveTab === 'MUSIC' && (
                        <div className="flex items-center gap-6 mt-4 overflow-x-auto no-scrollbar pb-2 border-b border-white/10">
                          {(['NEW', 'FOR_YOU', 'ARTISTS', 'ALBUMS', 'GENRES', 'VAULT', 'PODCASTS', 'AUDIO_BOOKS', 'MY_LIBRARY', 'PLAYLISTS'] as const).map(tab => (
                            <button
                              key={tab}
                              onClick={() => { setMusicInitialTab(tab); setView('MUSIC'); }}
                              className="text-xs font-black uppercase tracking-[0.3em] whitespace-nowrap transition-all pb-2 border-b-2 text-white/30 border-transparent hover:text-white/60 hover:border-white/30"
                            >
                              {tab === 'VAULT' ? 'The Vault' : tab.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 items-center">
                      <div className="flex items-center gap-3 bg-white/5 px-6 py-3 rounded-full border border-white/10">
                        <Palette size={14} className="text-small-orange" />
                        <select
                          value={sortConfig.key}
                          onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value as any })}
                          className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white outline-none cursor-pointer"
                        >
                          <option value="createdAt" className="bg-[#0a0a0a]">Date Created</option>
                          <option value="title" className="bg-[#0a0a0a]">Alphabetical</option>
                          <option value="genre" className="bg-[#0a0a0a]">Genre</option>
                          <option value="artist" className="bg-[#0a0a0a]">Artist</option>
                        </select>
                      </div>
                      {!isPublicView && (
                        <div className="lg:hidden flex gap-4">
                          <button onClick={() => setView('FEED')} className="p-5 bg-white/5 rounded-2xl text-primary"><Rss size={20} /></button>
                          <button onClick={() => setView('SEARCH')} className="p-5 bg-white/5 rounded-2xl text-primary"><Search size={20} /></button>
                          <button onClick={() => { setEditingAlbum(null); setShowCreator(true); }} className="flex-1 flex items-center justify-center gap-3 py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">
                            <Plus size={18} /> New
                          </button>
                        </div>
                      )}
                    </div>
                  </header>

                  <div className={`grid gap-12 ${theme === 'BIG_SCREEN' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
                    {archiveTab === 'MY_ARCHIVE' ? (
                      <div className="col-span-full">
                        {userProfile ? (
                          <MyLibraryView profile={userProfile} onUpdate={setUserProfile} />
                        ) : (
                          <div className="py-40 text-center flex flex-col items-center gap-6 opacity-40">
                            <Layers size={48} className="mb-4" />
                            <p className="text-xs font-black uppercase tracking-widest">Sign in to access your personal archive</p>
                            <button onClick={loginWithGoogle} className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest">Sign In</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      sortedItems.map((album) => (
                        <ArchiveItemCard 
                          key={album.id}
                          album={album}
                          theme={theme}
                          user={user}
                          copiedId={copiedId}
                          handleSelectItem={handleSelectItem}
                          handleShareAlbum={handleShareAlbum}
                          handleDeleteAlbum={(id) => setShowDeleteConfirm(id)}
                          handlePurchase={handlePurchase}
                        />
                      ))
                    )}
                    {archiveTab !== 'MY_ARCHIVE' && sortedItems.length === 0 && (
                      <div className="col-span-full py-40 text-center flex flex-col items-center gap-6">
                         <div className="w-20 h-20 bg-white/5 rounded-[1.5rem] flex items-center justify-center border border-white/5">
                            <Play fill="white" size={32} className="ml-1 text-white/10" />
                         </div>
                         <p className="text-small-orange uppercase font-black tracking-[0.4em]">No {archiveTab.toLowerCase()} deployments found.</p>
                         <button onClick={() => { setEditingAlbum(null); setShowCreator(true); }} className="px-8 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Start Your First Deployment</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {view === 'VIDEOS' && <VideoTab profile={userProfile} isOwner={false} onSelectVideo={handleSelectItem} currentUser={userProfile} onVisitUser={handleVisitUser} />}
            {view === 'ADMIN_AD_DASHBOARD' && (userProfile?.role === 'admin' || userProfile?.role === 'staff') && (
              <AdminAdDashboard onBack={() => setView('DASHBOARD')} />
            )}
            {view === 'PARTNER_DASHBOARD' && (userProfile?.accountType === 'PARTNER' || userProfile?.role === 'admin' || userProfile?.role === 'staff') && userProfile && (
              <PartnerDashboard profile={userProfile} onBack={() => setView('DASHBOARD')} />
            )}
            {view === 'HELP_CENTER' && (
              <HelpCenter onBack={() => setView('DASHBOARD')} />
            )}
            {view === 'ADMIN_DASHBOARD' && (userProfile?.role === 'admin' || userProfile?.role === 'staff') && (
              <AdminDashboard 
                onBack={() => setView('DASHBOARD')} 
                onReadBook={(book) => {
                  setSelectedBook(book);
                  setView('BOOK_READER');
                }}
                currentUser={userProfile}
              />
            )}
            {view === 'MUSIC' && (
              <MusicView
                onBack={() => setView('DASHBOARD')}
                onSelectAlbum={handleSelectItem}
                onVisitUser={handleVisitUser}
                userProfile={userProfile}
                initialTab={musicInitialTab}
                onUploadMusic={() => setShowCreator(true)}
              />
            )}
            {view === 'BOOKS' && (
              <div className="bg-transparent min-h-screen">
                <BookTab onSelectBook={(b) => { 
                  setSelectedAlbum(null);
                  setSelectedVideo(null);
                  setSelectedGame(null);
                  setSelectedBook(b); 
                  setView('BOOK_READER'); 
                }} 
                onVisitUser={(uid, tab) => {
                  handleVisitUser(uid, tab as any);
                }}
                />
              </div>
            )}
            {view === 'BOOK_READER' && selectedBook && (
              <BookReader 
                book={selectedBook} 
                onBack={() => {
                  setSelectedBook(null);
                  setView('BOOKS');
                }} 
                currentUser={user}
                onVisitUser={handleVisitUser}
              />
            )}
            {view === 'CREATOR' && user && <UserDashboard user={user} onBack={() => setView('DASHBOARD')} />}
            {view === 'SEARCH' && <SearchView onBack={() => setView('DASHBOARD')} onVisitUser={handleVisitUser} currentUser={user} initialQuery={searchQuery} />}
            {view === 'FEED' && (
              <FeedView 
                onBack={() => setView('DASHBOARD')} 
                currentUser={user} 
                onVisitUser={handleVisitUser} 
                onMessage={handleMessage}
                onSelectGame={handleSelectGame}
              />
            )}
            {view === 'LIVE_HUB' && (
              <LiveHubView 
                onBack={() => setView('DASHBOARD')} 
                currentUser={user} 
                onJoinPool={(poolId) => {
                  setSelectedPoolId(poolId);
                  setView('EVENT_PHOTO_POOL');
                }}
              />
            )}
            {view === 'RADIO' && <RadioView onBack={() => setView('DASHBOARD')} artistId={selectedRadioArtistId} />}
            {view === 'MOVIES_TV' && <MoviesTVView onBack={() => setView('DASHBOARD')} onSelectMovie={(m) => { setSelectedMovieItem(m); setView('MOVIE_UX'); }} />}
            {view === 'GAMES' && <GamesView onBack={() => setView('DASHBOARD')} onSelectGame={handleSelectGame} />}
            {view === 'APPS' && <AppsView onBack={() => setView('DASHBOARD')} currentUser={userProfile} />}
            {view === 'CLASSROOMS' && <ClassroomsView onBack={() => setView('DASHBOARD')} user={user} />}
            {view === 'GLOBAL_PHOTOS' && <GlobalPhotosView onVisitUser={handleVisitUser} initialMode="WATERFALL" />}
            {view === 'ART_GALLERY' && <GlobalPhotosView onVisitUser={handleVisitUser} initialMode="GALLERY" />}
            {view === 'EVENT_PHOTO_POOL' && selectedPoolId && (
              <EventPhotoPoolView 
                poolId={selectedPoolId} 
                onBack={() => setView('PPV_EVENTS')} 
              />
            )}
            {view === 'CHAT' && (
              <div className="bg-transparent h-screen">
                <ChatSystem 
                  onBack={() => setView('DASHBOARD')} 
                  initialRoomId={selectedChatRoomId}
                />
              </div>
            )}
            {view === 'PRIVATE_BOARDS' && userProfile && (
              <PrivateBoardsView currentUser={userProfile} />
            )}
            {view === 'USER_PROFILE' && viewedUserId && (
              <div className="relative">
                <UserProfileView
                  uid={viewedUserId}
                  onBack={() => { handleBackToDashboard(); setInitialProfileTab(undefined); }}
                  onSelectAlbum={handleSelectItem}
                  onSelectGame={handleSelectGame}
                  onVisitUser={handleVisitUser}
                  onMessage={handleMessage}
                  initialTab={initialProfileTab as any}
                  onOpenCreator={(type) => {
                    setCreatorInitialType(type);
                    setEditingAlbum(null);
                    setShowCreator(true);
                  }}
                />
              </div>
            )}
            {view === 'GAME_PLAYER' && selectedGame && (
              <GamePlayerView 
                game={selectedGame} 
                onBack={() => {
                  if (viewedUserId) setView('USER_PROFILE');
                  else setView('GAMES');
                }} 
              />
            )}
            {(view === 'PLAYER' || view === 'PREVIEW') && selectedAlbum && (
              <PlayerView 
                album={selectedAlbum} 
                onBack={handleBackToDashboard} 
                onEdit={(alb) => {
                  setEditingAlbum(alb);
                  setShowCreator(true);
                }}
                onUpdate={(updatedAlbum) => {
                  setSelectedAlbum(updatedAlbum);
                  setAlbums(prev => prev.map(a => a.id === updatedAlbum.id ? updatedAlbum : a));
                }}
                onPurchase={handlePurchase}
                onVisitUser={handleVisitUser}
                isPublic={isPublicView}
                isPreview={view === 'PREVIEW'}
                user={user}
              />
            )}
            {view === 'MOVIE_UX' && selectedMovieItem && (
              <ErrorBlock componentName="MovieUXView">
                <MovieUXView 
                  item={selectedMovieItem} 
                  onBack={() => {
                    setSelectedMovieItem(null);
                    handleBackToDashboard();
                  }} 
                  onVisitUser={handleVisitUser}
                  currentUser={user}
                />
              </ErrorBlock>
            )}
            {view === 'CLUBS' && <ClubsView onBack={() => setView('DASHBOARD')} currentUser={user} />}
            {view === 'CHARITY' && <CharityView onBack={() => setView('DASHBOARD')} />}
            {view === 'DISCUSSION' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <DiscussionView onBack={() => setView('DASHBOARD')} currentUser={user} />
              </Suspense>
            )}
            {view === 'WORLDS' && <WorldsView onNavigate={setView} onEdit={(world) => { setSelectedWorld(world); setView('WORLD_MANAGER'); }} userProfile={userProfile} artistUid={viewedUserId || user?.uid || ''} />}
            {view === 'WORLD_MANAGER' && (
              <WorldManagerView 
                initialWorld={selectedWorld || undefined}
                onSave={async (w) => { 
                  if (w.id) {
                    await updateIPWorld(w.id, w);
                  } else {
                    await createIPWorld({ ...w, creatorId: user?.uid });
                  }
                  setSelectedWorld(null);
                  setView('USER_PROFILE'); 
                }} 
                onPreview={(w) => {
                  setSelectedWorld(w);
                  setView('WORLDS');
                }}
              />
            )}
            {view === 'TEAM_DETAIL' && selectedTeamName && (
              <TeamDetailView 
                teamName={selectedTeamName}
                onBack={() => setView('ARTICLES')}
                onNavigate={setView}
                onSelectPlayer={(p) => { setSelectedPlayer(p); setView('PLAYER_DETAIL'); }}
              />
            )}
            {view === 'PLAYER_DETAIL' && selectedPlayer && (
              <PlayerDetailView 
                player={selectedPlayer}
                league={selectedTeamLeague || ''}
                teamName={selectedTeamName || ''}
                onBack={() => setView('TEAM_DETAIL')}
              />
            )}
            {view === 'PLAYER' && selectedVideo && (
              <VideoPlayer 
                video={selectedVideo} 
                onBack={() => {
                  setSelectedVideo(null);
                  setView('VIDEOS');
                }} 
                currentUser={user} 
              />
            )}
          </SpatialUIRoot>
          {showCreator && (
            <AlbumCreator
              onCreated={(alb) => {
                handleCreateAlbum(alb);
                setShowCreator(false);
                setIsCreatorMinimized(false);
                setCreatorInitialType(undefined);
              }}
              onCancel={() => {
                setShowCreator(false);
                setEditingAlbum(null);
                setIsCreatorMinimized(false);
                setCreatorInitialType(undefined);
              }}
              onMinimize={() => setIsCreatorMinimized(true)}
              isMinimized={isCreatorMinimized}
              initialAlbum={editingAlbum || undefined}
              initialType={creatorInitialType as any}
            />
          )}
          
          <GlobalPlayer 
            onNavigate={handleGlobalNavigate} 
            bottomOffset={(isMobile || theme === 'PHONE') ? "0px" : "0px"} 
            topOffset={undefined}
            isMobile={isMobile}
            theme={theme}
            setTheme={handleSetTheme}
            currentUser={user}
            onLogout={logout}
            view={view}
            onOpenAchievements={() => setShowAchievements(true)}
            onUpload={() => {
              let defaultType: 'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO' = 'MUSIC';
            if (view === 'VIDEOS') defaultType = 'VIDEO';
            else if (view === 'BOOKS') defaultType = 'BOOK';
            else if (view === 'GLOBAL_PHOTOS' || view === 'ART_GALLERY') defaultType = 'PHOTO';
            setEditingAlbum({ type: defaultType } as any);
            setShowCreator(true);
          }}
          onOpenChat={() => setView('CHAT')}
          userProfile={userProfile}
          onUpdateUserProfile={async (updates) => {
            if (!user) return;
            await updateUserProfile(user.uid, updates);
            setUserProfile(prev => prev ? { ...prev, ...updates } : prev);
          }}
        />

         {/* Custom Delete Confirmation Modal */}
        {user && !isMobile && (
          <ChatFlyout 
            onNavigateToChat={() => setView('CHAT')}
            onSelectRoom={(roomId) => setSelectedChatRoomId(roomId)}
            userProfile={userProfile}
          />
        )}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#0a0a0a] border border-white/10 p-10 rounded-[2.5rem] text-center shadow-3xl">
              <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-8">
                <Trash2 size={32} className="text-red-500" />
              </div>
              <h2 className="text-3xl font-display font-black tracking-tight mb-4 uppercase">Delete Project?</h2>
              <p className="text-xs font-bold text-white/30 mb-10 tracking-widest uppercase leading-loose">This action is permanent and will remove the album from the global cloud archive.</p>
              <div className="flex flex-col gap-4">
                <button onClick={() => handleDeleteAlbum(showDeleteConfirm)} className="w-full py-5 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-red-600 transition-all">Confirm Deletion</button>
                <button onClick={() => setShowDeleteConfirm(null)} className="w-full py-5 bg-white/5 text-white/40 font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
      {isPIFModalOpen && (
        <PayItForwardModal 
          isOpen={isPIFModalOpen} 
          onClose={() => setIsPIFModalOpen(false)} 
          userProfile={userProfile}
        />
      )}

      {pifWins.map(win => (
        <PayItForwardNotification 
          key={win.id} 
          winnerRecord={win} 
          onClose={() => setPifWins(prev => prev.filter(w => w.id !== win.id))} 
        />
      ))}
      <UploadManager 
        isMinimizedCreator={isCreatorMinimized} 
        onRestoreCreator={() => setIsCreatorMinimized(false)} 
      />
      <LiveFeedPlayer 
        feed={activeLiveFeed} 
        onClose={() => setActiveLiveFeed(null)} 
      />

      {/* Achievement Sidebar */}
      <AnimatePresence>
        {showAchievements && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed top-0 right-0 bottom-0 w-full lg:w-[450px] z-[600] shadow-3xl"
          >
            <AchievementListView onClose={() => setShowAchievements(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Tour */}
      {showOnboarding && user && (
        <OnboardingTour 
          onComplete={async () => {
            setShowOnboarding(false);
            await updateOnboardingStatus(user.uid, true);
            const p = await fetchUserProfile(user.uid);
            setUserProfile(p);
          }}
          onSkip={async () => {
            setShowOnboarding(false);
            await updateOnboardingStatus(user.uid, true);
            const p = await fetchUserProfile(user.uid);
            setUserProfile(p);
          }}
        />
      )}
      {user && <PersistentChatDrawer />}
      </Suspense>
            </SpatialProvider>
          </NotificationProvider>
        </UploadProvider>
      </AchievementProvider>
        </PointsProvider>
      </BadgeProvider>
    </ErrorBoundary>
  );
};

export default App;
