import React, { useState, useEffect, lazy, Suspense, useCallback, useRef } from 'react';
import { Album, AppView, ThemeType, Game, IPWorld } from './types';
import Logo from './components/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { recoverFromStaleChunk } from './src/lib/staleChunk';

// Suppress Firestore SDK internal assertion errors that occur during onSnapshot teardown.
// This is a known Firestore SDK bug (ID: b815/ca9) where the watch stream delivers
// a batched update after a listener's target has been removed from internal state.
// The error fires asynchronously inside the SDK and cannot be caught by Error Boundaries.
if (typeof window !== 'undefined') {
  const _isFSAssertion = (msg?: string) =>
    typeof msg === 'string' && msg.includes('FIRESTORE') && msg.includes('INTERNAL ASSERTION FAILED');
  window.addEventListener('error', e => {
    if (_isFSAssertion(e?.message)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('unhandledrejection', e => {
    if (_isFSAssertion(e?.reason?.message)) { e.preventDefault(); }
  });
}

// Standard lazy loading with retry logic for network stability
const retryLazy = <T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  retriesLeft = 3
): T => {
  return lazy(async () => {
    for (let i = 0; i < retriesLeft; i++) {
      try {
        return await componentImport();
      } catch (error: any) {
        console.warn(`Retry lazy load failed (${i + 1}/${retriesLeft}). Error:`, error);
        if (i === retriesLeft - 1) {
          // Chunk is gone (a newer deploy rehashed assets and a stale SW is serving the
          // old index.html). Bust the SW + caches and hard-reload — a plain reload would
          // just re-serve the same stale shell. Loop-guarded inside recoverFromStaleChunk.
          recoverFromStaleChunk();
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
      }
    }
    throw new Error("Failed to load component");
  }) as any;
};
const AlbumCreator = retryLazy(() => import('./components/AlbumCreator'));
const EarthGlobe = retryLazy(() => import('./components/EarthGlobe')); // home hero globe
const PlayerView = retryLazy(() => import('./components/PlayerView'));
const SearchView = retryLazy(() => import('./components/SearchView'));
const FeedView = retryLazy(() => import('./components/FeedView'));
const LiveHubView = retryLazy(() => import('./components/LiveHubView'));
const MobileLiveHub = retryLazy(() => import('./components/MobileLiveHub'));
const MyOrdersView = retryLazy(() => import('./components/MyOrdersView'));
const CharacterProfileView = retryLazy(() => import('./components/CharacterProfileView'));
const CharacterChat = retryLazy(() => import('./components/CharacterChat'));
const UserProfileView = retryLazy(() => import('./components/UserProfileView'));
const RadioView = retryLazy(() => import('./components/RadioView'));
const TVView = retryLazy(() => import('./components/TVView'));
const GamesView = retryLazy(() => import('./components/GamesView'));
const MusicView = retryLazy(() => import('./components/MusicView'));
const ArtGalleryView = retryLazy(() => import('./components/ArtGalleryView'));
const ChoraConservatory = retryLazy(() => import('./components/ChoraConservatory'));
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
const AvatarStudio = retryLazy(() => import('./components/AvatarStudio'));
const BrowserPanel = retryLazy(() => import('./components/BrowserPanel'));
// Internal pitch documents — not in nav, accessed via ?view=pitch-music|pitch-film|pitch-writer
const MusicPitchDoc   = retryLazy(() => import('./components/SegmentLandingMusic'));
const FilmPitchDoc    = retryLazy(() => import('./components/SegmentLandingFilm'));
const WritersPitchDoc = retryLazy(() => import('./components/SegmentLandingWriters'));
// Book Authoring Studio
const BookAuthoringStudio = retryLazy(() => import('./components/BookAuthoringStudio'));
// Script Writing Studio — film, TV, stage
const ScriptWritingStudio = retryLazy(() => import('./components/ScriptWritingStudio'));
// Pitch Deck Studio + Viewer
const PitchDeckStudio  = retryLazy(() => import('./components/PitchDeckStudio'));
const PitchDeckViewer  = retryLazy(() => import('./components/PitchDeckViewer'));
// History Moments (Chora + Taleo)
const HistoryMomentsView = retryLazy(() => import('./components/HistoryMomentsView'));
// AudioBook Studio — Lorea (MAI Voice 2 + MAI Transcribe 1.5)
const AudioBookStudio = retryLazy(() => import('./components/AudioBookStudio'));
// Music Theory Studio (Chora)
const MusicTheoryStudio = retryLazy(() => import('./components/MusicTheoryStudio'));
// Film & TV School (Taleo)
const FilmSchoolView = retryLazy(() => import('./components/FilmSchoolView'));
// Math Classroom BETA (Classrooms)
const MathClassroom = retryLazy(() => import('./components/MathClassroom'));
// Science & Engineering hub
const PlajahLabsView = retryLazy(() => import('./components/PlajahLabsView'));
// Health & Fitness hub
const PlajahHealthFitnessView = retryLazy(() => import('./components/PlajahHealthFitnessView'));
// Plajah Research Manifesto
const PlajahResearchPage = retryLazy(() => import('./components/PlajahResearchPage'));
// TV Studio — browser production switcher
const TVStudio = retryLazy(() => import('./components/TVStudio'));

import ExperiencePicker from './components/ExperiencePicker';
import GlobalPlayer from './components/GlobalPlayer';
import InAppBrowserPrompt from './components/InAppBrowserPrompt';
import AutoPlayCountdown from './components/AutoPlayCountdown';
import TVNavigationLayer from './components/TVNavigationLayer';
import { getPlatformInfo } from './hooks/usePlatform';
import LiveFollowPills from './components/LiveFollowPills';
import { measurePerfTier, subscribePerfTier, shouldEnableEffect, getPerfTier } from './services/tvPerformance';
import TvUnavailableNotice from './components/TvUnavailableNotice';
import TvTopTabs from './components/TvTopTabs';
const TvSignInView = retryLazy(() => import('./components/TvSignInView'));
const ChoraTvView = retryLazy(() => import('./components/tv/ChoraTvView'));
const TvSearchView = retryLazy(() => import('./components/tv/TvSearchView'));
const MoviesTvView = retryLazy(() => import('./components/tv/MoviesTvView'));
const TvNowPlayingBar = retryLazy(() => import('./components/tv/TvNowPlayingBar'));
const TvFxSurface = retryLazy(() => import('./components/tv/TvFxSurface'));
const ReelloTvView = retryLazy(() => import('./components/tv/ReelloTvView'));
const TvSlideshowSurface = retryLazy(() => import('./components/tv/TvSlideshowSurface'));
const TvLinkApproval = retryLazy(() => import('./components/TvLinkApproval'));
const TvSettingsView = retryLazy(() => import('./components/TvSettingsView'));
import { type TvDisabledFeature, TV_NAV_VIEWS, getTvHome, isViewAllowedOnTv, themesAllowed } from './services/tvCapabilities';
import { useTvShellFocus, setShellFocus } from './hooks/useTvShellFocus';
import TooltipSuppressor from './components/TooltipSuppressor';
import ResumeUploadPrompt from './components/ResumeUploadPrompt';
import SanctuaryDemoView from './components/sanctuary/SanctuaryDemoView';
import StoreDemoView from './components/StoreDemoView';
import { DEMO_SANCTUARY_ID, DEMO_STORE_ID, DEMO_STORE_PRODUCTS } from './data/demoShowcase';
import PlajahAgent from './components/PlajahAgent';
import { resolveAgentTier } from './services/agentService';

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
import WelcomeAchievement from './components/WelcomeAchievement';
import PioneerGoldFrame from './components/PioneerGoldFrame';
const WelcomePackageModal = retryLazy(() => import('./components/WelcomePackageModal'));
const ReleaseCountdownPage = retryLazy(() => import('./components/ReleaseCountdownPage'));
const AdminDashboard = retryLazy(() => import('./components/AdminDashboard'));
const PartnerDashboard = retryLazy(() => import('./components/PartnerDashboard'));
const HelpCenter = retryLazy(() => import('./components/HelpCenter'));
const MyLibraryView = retryLazy(() => import('./components/MyLibraryView'));
const NewstandView = retryLazy(() => import('./components/newstand/NewstandView').then(m => ({ default: m.NewstandView })));
const PlajahSportsView = retryLazy(() => import('./components/PlajahSportsView').then(m => ({ default: m.PlajahSportsView })));
const AthleteShowcaseView = retryLazy(() => import('./components/AthleteShowcaseView'));
const MatchFanRoomsView = retryLazy(() => import('./components/MatchFanRoomsView'));
const RoomView = retryLazy(() => import('./components/RoomView'));
const PodcastStudio = retryLazy(() => import('./components/PodcastStudio'));
const LiveTranslation = retryLazy(() => import('./components/LiveTranslation'));
const PodcastCallIn = retryLazy(() => import('./components/PodcastCallIn'));
const PodcastListen = retryLazy(() => import('./components/PodcastListen'));
const ClassPointsView = retryLazy(() => import('./components/ClassPointsView'));
const ReadingQuestView = retryLazy(() => import('./components/ReadingQuestView'));
const ScienceQuestView = retryLazy(() => import('./components/ScienceQuestView'));
const HistoryQuestView = retryLazy(() => import('./components/HistoryQuestView'));
const LearnerLedgerView = retryLazy(() => import('./components/LearnerLedgerView'));
const TeacherToolsView = retryLazy(() => import('./components/TeacherToolsView'));
const KidsLibraryView = retryLazy(() => import('./components/KidsLibraryView'));
import KidsSessionGuard from './components/KidsSessionGuard';
import KidsModeBar from './components/KidsModeBar';
const ArticleEditor = retryLazy(() => import('./components/ArticleEditor'));
const ArticleView = retryLazy(() => import('./components/ArticleView'));
const BrandDashboard = retryLazy(() => import('./components/BrandDashboard'));
const OrgHub = retryLazy(() => import('./components/OrgHub'));
const PlajahElevate = retryLazy(() => import('./components/PlajahElevate'));
const PlatformChangelog = retryLazy(() => import('./components/PlatformChangelog'));
const UpdateNotification = retryLazy(() => import('./components/UpdateNotification'));
const BugReportButton = retryLazy(() => import('./components/BugReportButton'));
const VideoRouterConsole = retryLazy(() => import('./components/mediaEngine/VideoRouterConsole'));
const CreatorPaymentDashboard = retryLazy(() => import('./components/CreatorPaymentDashboard'));
const EventCreationWizard = retryLazy(() => import('./components/EventCreationWizard'));
const EventLandingPage = retryLazy(() => import('./components/EventLandingPage'));
const EventTicketingDashboard = retryLazy(() => import('./components/EventTicketingDashboard'));
const TicketView = retryLazy(() => import('./components/TicketView'));
const KioskMode = retryLazy(() => import('./components/KioskMode'));
const TicketScanner = retryLazy(() => import('./components/TicketScanner'));
const VideoManager = retryLazy(() => import('./components/VideoManager'));
const ArtistMembersArea = retryLazy(() => import('./components/ArtistMembersArea'));
const MerchStorefront = retryLazy(() => import('./components/MerchStorefront'));
const SanctuaryView = retryLazy(() => import('./components/SanctuaryView'));
const SanctuaryHubView = retryLazy(() => import('./components/SanctuaryHubView'));
const StorePageView = retryLazy(() => import('./components/StorePageView'));
const StoreHubView = retryLazy(() => import('./components/StoreHubView'));
const GarageSaleView = retryLazy(() => import('./components/GarageSaleView'));
const BusinessPublicPage = retryLazy(() => import('./components/BusinessPublicPage'));
const BrandPublicPage = retryLazy(() => import('./components/BrandPublicPage'));
const MovieUXView = retryLazy(() => import('./components/MovieUXView'));
const MoviesTVView = retryLazy(() => import('./components/MoviesTVView'));
const ClubsView = retryLazy(() => import('./components/ClubsView'));
const CharityView = retryLazy(() => import('./components/CharityView'));
const ChallengeHub = retryLazy(() => import('./components/ChallengeHub'));
const BroadcastChannelView = retryLazy(() => import('./components/BroadcastChannelView'));
const CloseFriendsView = retryLazy(() => import('./components/CloseFriendsView'));
const PollResultsArchive = retryLazy(() => import('./components/PollResultsArchive'));
const SocialInsightsDashboard = retryLazy(() => import('./components/SocialInsightsDashboard'));
/**
 * Views that are switched off on a television, and which explanation each one gets.
 *
 * These are mouse-and-keyboard tools: timelines, mixers, file pickers, text editors. Opening
 * one on a TV produces a screen a remote cannot drive, so the router shows the reason instead
 * — see components/TvUnavailableNotice.tsx for why this is a notice and not a hidden button.
 */
const TV_BLOCKED_VIEWS: Partial<Record<string, { feature: TvDisabledFeature; title: string }>> = {
  FABULA:          { feature: 'creatorStudio', title: 'Fabula' },
  PLAJAH_STUDIO:   { feature: 'creatorStudio', title: 'Studio' },
  PLAJAH_PIXELS:   { feature: 'creatorStudio', title: 'Pixels' },
  TV_STUDIO:       { feature: 'creatorStudio', title: 'TV Studio' },
  MEDIA_ROUTER:    { feature: 'creatorStudio', title: 'Router & Switcher' },
  AVATAR_STUDIO:   { feature: 'camera',        title: 'Avatar Studio' },
  PODCAST_STUDIO:  { feature: 'creatorStudio', title: 'Podcast Studio' },
  EVENT_PRODUCTION_STUDIO: { feature: 'creatorStudio', title: 'Event Production' },
  TICKET_DESIGNER: { feature: 'creatorStudio', title: 'Ticket Designer' },
  CROSSOVER:       { feature: 'fileConversion', title: 'Crossover' },
  MEDIA_CONVERTER: { feature: 'fileConversion', title: 'Media Converter' },
  SPATIAL_MIXER:   { feature: 'creatorStudio', title: 'Spatial Mixer' },
  TELEPROMPTER:    { feature: 'documentEditing', title: 'Teleprompter' },
  ARTICLE_EDITOR:  { feature: 'documentEditing', title: 'The editor' },
  CREATOR:         { feature: 'upload',         title: 'Uploading' },
  UPLOAD:          { feature: 'upload',         title: 'Uploading' },
};

const AppsView = retryLazy(() => import('./components/AppsView'));
const CrossoverView = retryLazy(() => import('./components/CrossoverView'));
const PlajahPixelsView = retryLazy(() => import('./components/PlajahPixelsView'));
const TeleprompterApp = retryLazy(() => import('./components/teleprompter/TeleprompterApp'));
const SpatialMixer = retryLazy(() => import('./components/spatialMixer/SpatialMixer'));
const MediaConverter = retryLazy(() => import('./components/MediaConverter'));
const SmartDirectorView = retryLazy(() => import('./components/SmartDirectorView'));
const ComicMangaMuseum = retryLazy(() => import('./components/ComicMangaMuseum'));
const AudiusArtistPage = retryLazy(() => import('./components/AudiusArtistPage'));
const BrandActivationPanel = retryLazy(() => import('./components/BrandActivationPanel'));
const LicenseRequestsInbox = retryLazy(() => import('./components/LicenseRequestsInbox'));
const LicenseForFilmModal = retryLazy(() => import('./components/LicenseForFilmModal'));
import { acceptNibbleInvite, pendingNibbleCode } from './services/nibbleInvites';
const BibleExperience = retryLazy(() => import('./components/BibleExperience'));

const AriaEventBridge: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener('OPEN_ARIA', handler as EventListener);
    return () => window.removeEventListener('OPEN_ARIA', handler as EventListener);
  }, [onOpen]);
  return null;
};
const PersistentChatDrawer = retryLazy(() => import('./components/PersistentChatDrawer'));
const CitrusWaterDrops = retryLazy(() => import('./components/CitrusWaterDrops'));
const DiscussionView = retryLazy(() => import('./components/DiscussionView'));
const DebateView     = retryLazy(() => import('./components/DebateView'));
import { ChallengeVsController } from './components/ChallengeVsScreen';
import { TrackBreakdownController } from './components/TrackBreakdownModal';
import { LoreaScoresController } from './components/LoreaScoresModal';
import { initLoreaScoreListener } from './services/loreaScoreService';
import { fetchAudiusArtistById, fetchAudiusPlaylistTracks, audiusAlbumToNativeAlbum, type AudiusArtist } from './services/audiusService';
const BusinessDashboard = retryLazy(() => import('./components/BusinessDashboard'));
const PlajahBusinessHub = retryLazy(() => import('./components/PlajahBusinessHub'));
const TerraHub = retryLazy(() => import('./components/terra/TerraHub'));
const TerraExplorer = retryLazy(() => import('./components/terra/TerraExplorer'));
const PropertyPassport = retryLazy(() => import('./components/terra/PropertyPassport'));
const ParcelStudio = retryLazy(() => import('./components/terra/ParcelStudio'));
const SiteScout = retryLazy(() => import('./components/terra/SiteScout'));
const ListingFilm = retryLazy(() => import('./components/terra/ListingFilm'));
const TerraFeed = retryLazy(() => import('./components/terra/TerraFeed'));
const TerraListings = retryLazy(() => import('./components/terra/ListingsManager'));
const AdPackageManager = retryLazy(() => import('./components/AdPackageManager'));
const ArtistProjectManager = retryLazy(() => import('./components/ArtistProjectManager'));
const StudioView = retryLazy(() => import('./components/ManagerSuite/StudioView'));
const Fabula = retryLazy(() => import('./components/Fabula/Fabula'));
const ArtistBoards = retryLazy(() => import('./components/ArtistBoards'));
const EventProductionStudio = retryLazy(() => import('./components/EventProductionStudio'));
const TicketDesigner = retryLazy(() => import('./components/TicketDesigner'));
const LiveEventsGallery = retryLazy(() => import('./components/LiveEventsGallery'));
const PlajahPlusBanner = retryLazy(() => import('./components/PlajahPlusBanner'));
const PlajahPlusLandingModal = retryLazy(() => import('./components/PlajahPlusLanding'));
const AlbumAdBillboard = retryLazy(() => import('./components/AlbumAdBillboard'));
const AdBillboardRenderer = retryLazy(() => import('./components/AdBillboardRenderer'));
const RelloView = retryLazy(() => import('./components/RelloView'));

import { useGlobalPlayer, useGlobalPlayerState, useGlobalPlayerProgress } from './contexts/GlobalPlayerContext';

type AdSlot =
  | { kind: 'plus' }
  | { kind: 'profile'; profile: import('./types').UserProfile }
  | { kind: 'album'; album: import('./types').Album; profile: import('./types').UserProfile }
  | { kind: 'custom_ad'; ad: import('./types').UserAd; profile: import('./types').UserProfile }
  | { kind: 'product'; product: import('./data/demoShowcase').DemoProduct };

const AD_DURATION: Record<AdSlot['kind'], number> = {
  plus:      25000,
  profile:   15000,
  album:     45000,
  custom_ad: 30000,
  product:   20000,
};

// ~14-frame crossfade at 60 fps ≈ 233 ms
const AD_CROSSFADE_MS = 233;

// Theme base backgrounds — matched to index.css per-theme gradients.
// Rendered as inline styles so they are immune to CSS cascade / Tailwind layer conflicts.
const THEME_BG: Record<string, string> = {
  PLAJAH: [
    'radial-gradient(ellipse 90% 70% at 15% 10%, rgba(107,0,153,0.85) 0%, transparent 55%)',
    'radial-gradient(ellipse 70% 60% at 85% 85%, rgba(212,0,85,0.70) 0%, transparent 55%)',
    'radial-gradient(ellipse 55% 45% at 55% 45%, rgba(255,140,0,0.22) 0%, transparent 60%)',
    '#0d0015',
  ].join(','),
  DARK: [
    'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(255,140,0,0.12) 0%, transparent 65%)',
    'radial-gradient(ellipse 60% 50% at 80% 90%, rgba(107,0,153,0.12) 0%, transparent 65%)',
    '#020202',
  ].join(','),
  LIGHT: [
    'radial-gradient(ellipse 80% 60% at 25% 15%, rgba(186,230,255,0.55) 0%, transparent 65%)',
    'radial-gradient(ellipse 60% 50% at 75% 80%, rgba(253,186,234,0.40) 0%, transparent 65%)',
    'radial-gradient(ellipse 50% 40% at 55% 45%, rgba(221,214,254,0.30) 0%, transparent 60%)',
    '#f8fafc',
  ].join(','),
  PASTEL: '#fdf6e3',
  BIG_SCREEN: '#00050a',
  PHONE: '#000000',
  ETHEREAL: [
    'radial-gradient(ellipse 75% 65% at 30% 20%, rgba(208,188,255,0.55) 0%, transparent 55%)',
    'radial-gradient(ellipse 65% 55% at 70% 75%, rgba(0,218,243,0.35) 0%, transparent 55%)',
    'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255,182,141,0.20) 0%, transparent 60%)',
    '#0f0f10',
  ].join(','),
  NEBULA: [
    'radial-gradient(ellipse 85% 65% at 35% 25%, rgba(99,102,241,0.65) 0%, transparent 55%)',
    'radial-gradient(ellipse 65% 60% at 70% 75%, rgba(139,92,246,0.50) 0%, transparent 55%)',
    'radial-gradient(ellipse 55% 45% at 55% 50%, rgba(34,211,238,0.25) 0%, transparent 60%)',
    '#050510',
  ].join(','),
  CITRUS: [
    'radial-gradient(ellipse 75% 65% at 80% 15%, rgba(255,100,0,0.80) 0%, transparent 55%)',
    'radial-gradient(ellipse 65% 60% at 15% 80%, rgba(200,40,0,0.60) 0%, transparent 55%)',
    'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255,170,0,0.25) 0%, transparent 60%)',
    '#080200',
  ].join(','),
};
import { fetchProjectFromCloud, fetchAllPublicAlbums, deleteCloudAlbum, checkCloudConnection, loginWithGoogle, loginWithTwitter, logout, onAuthUpdate, seedMockUsers, seedPublicDomainBooks, createChatRoom, updateGamePlayCount, fetchUserProfile, listenToUserProfile, listenToMyPayItForwardWins, simulateDailySelection, createDemoArticle, updateOnboardingStatus, updateTooltipSettings, updateUserProfile, createIPWorld, updateIPWorld, seedDemoWorlds, fetchThemePresetById, fetchFeaturedProfiles, fetchLatestAlbumForUser, loadUserAd, fetchSystemSettingsConfig } from './services/backendService';
import { initFeatureFlagListener } from './services/featureFlagService';
import { Plus, Music2, Layers, Mic, Play, Pause, SkipBack, SkipForward, Maximize2, Trash2, User, Share2, Check, Box, Globe, ShieldCheck, ShieldAlert, Shield, ShoppingBag, LogOut, LogIn, Search, Rss, Sun, Moon, Palette, Radio, Sparkles, Database, Tv, Gamepad2, MessageSquare, MessageCircle, GraduationCap, Ticket, Video as VideoIcon, BookOpen, ChevronLeft, ChevronRight, Camera, Settings, Heart, Pen, Newspaper, Megaphone, HelpCircle, ChevronDown, ChevronUp, Home, Film, Users, AppWindow, Mail, X as XIcon, Upload, Zap, Monitor, Briefcase, TrendingUp, FlaskConical, Clapperboard, AlignJustify, Pin, Activity, Repeat, Repeat1, Volume2, VolumeX, Headphones, RotateCcw, Bell, Compass, Landmark, Cctv, Bug, AlertTriangle, MapPin } from 'lucide-react';
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
import { UserProfile, PayItForwardWinner, Article, LiveFeed, PitchDeck, ExperienceMode } from './types';
import { UploadProvider } from './contexts/UploadContext';
import { AchievementProvider } from './contexts/AchievementContext';
import { PointsProvider } from './contexts/PointsContext';
import { BadgeProvider } from './contexts/BadgeContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { SpatialProvider } from './contexts/SpatialContext';
import { FediverseProvider } from './contexts/FediverseContext';
import NotificationCenter from './components/NotificationCenter';
import AchievementListView from './components/AchievementListView';
import UploadManager from './components/UploadManager';
import { PublishQueueProvider } from './contexts/PublishQueueContext';
import PublishTray from './components/PublishTray';
import { CallProvider } from './contexts/CallContext';
import { ActiveIdentityProvider } from './contexts/ActiveIdentityContext';
import ProjectTray from './components/ProjectTray';

import SpatialToggle from './components/SpatialToggle';
import SpatialImage from './components/SpatialImage';
import { useSpatial } from './contexts/SpatialContext';
import ArchiveItemCard from './components/ArchiveItemCard';

import SpatialUIRoot from './components/SpatialUIRoot';
import SidebarSearch from './components/SidebarSearch';
import SmartGuide from './components/SmartGuide';
import AccountSwitcher, { HotSwitchOverlay, LinkedAccount } from './components/AccountSwitcher';
import { loadRoster, upsertAccount } from './services/accountRoster';
import { buildShareUrl } from './services/deepLinkService';
import StartRoomModal from './components/StartRoomModal';
import WalkieStandby from './components/WalkieStandby';
import { initPodcastLibrarySync } from './services/podcastLibraryService';
import { saveStudioEpisode } from './services/podcastStudio/studioService';
import { installGlobalErrorReporting } from './services/errorReporting';
import { installSessionTrace, traceView } from './services/sessionTrace';
import { installHealthMonitor } from './services/healthMonitor';
import { useHardwareBack } from './hooks/useHardwareBack';
import { useNavLayout } from './hooks/useNavLayout';
import { ChoraNavBar, NavLayoutSwitcher, type NavPage } from './components/ChoraCompactNav';

const App: React.FC = () => {
  // Check for ?view=pitch-music|pitch-film|pitch-writer|research and ?room=<id> on load
  const pitchParam = new URLSearchParams(window.location.search).get('view');
  const roomParam = new URLSearchParams(window.location.search).get('room');
  const callinParam = new URLSearchParams(window.location.search).get('callin');
  const listenParam = new URLSearchParams(window.location.search).get('listen');
  const pitchInitialView: AppView =
    callinParam                   ? 'PODCAST_CALLIN'     :
    listenParam                   ? 'PODCAST_LISTEN'     :
    roomParam                     ? 'ROOM'               :
    pitchParam === 'pitch-music'  ? 'PITCH_MUSIC'        :
    pitchParam === 'pitch-film'   ? 'PITCH_FILM'         :
    pitchParam === 'pitch-writer' ? 'PITCH_WRITER'       :
    // research manifesto — admin only (kmoody2003@gmail.com or role=admin)
    pitchParam === 'research'     ? 'RESEARCH_MANIFESTO' :
    pitchParam === 'crossover'    ? 'CROSSOVER'          :
    pitchParam === 'terra'        ? 'TERRA'              :
    pitchParam === 'business'     ? 'PLAJAH_BUSINESS'    :
    'LANDING';

  // Is the app being opened on a shared deep link? If so, a signed-out visitor must
  // NOT be bounced to LANDING — the deep-link handler owns the initial view.
  const hasDeepLink = (() => {
    const sp = new URLSearchParams(window.location.search);
    if (['id', 'type', 'org', 'elevate', 'debate', 'club', 'livestream', 'stream', 'room', 'callin', 'listen', 'invite', 'pitch', 'view'].some(k => sp.get(k))) return true;
    // /link (TV sign-in approval) must not bounce a signed-out visitor to LANDING — they may
    // need to sign in on the phone first and then approve, and losing the ?c= code mid-flow
    // means walking back to the television for a new one.
    if (window.location.pathname.startsWith('/link')) return true;
    return /^\/(profile|release|event|clubs|athlete|book)\//.test(window.location.pathname);
  })();

  const [view, setViewInternal] = useState<AppView>(pitchInitialView);
  // Admin kill-switch for the standalone Crossover converter (systemConfig/settings).
  const [crossoverSystemEnabled, setCrossoverSystemEnabled] = useState(true);
  useEffect(() => { fetchSystemSettingsConfig().then(c => setCrossoverSystemEnabled(c?.crossoverEnabled !== false)).catch(() => {}); }, []);
  // Load platform feature flags (config/featureFlags) + live-update — without this,
  // isFeatureEnabled() always returns the built-in defaults (e.g. CONTENT_LICENSING off).
  useEffect(() => { const unsub = initFeatureFlagListener(); return () => unsub(); }, []);
  const [fanRoomMatchId, setFanRoomMatchId] = useState<string | undefined>(undefined);
  const [fanRoomMatch, setFanRoomMatch] = useState<any | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | undefined>(roomParam || undefined);
  const [callinShowId] = useState<string | undefined>(callinParam || undefined);
  const [listenShowId] = useState<string | undefined>(listenParam || undefined);
  const [showStartRoom, setShowStartRoom] = useState(false);
  // In-session Kids Mode: when a parent switches into a child, the app behaves AS that
  // child (safe content + screen-time) without a separate login.
  const [activeChildProfile, setActiveChildProfile] = useState<UserProfile | null>(null);

  const setView = useCallback((newView: AppView | ((prev: AppView) => AppView), path?: string) => {
    setViewInternal((prev) => {
      let nextView = typeof newView === 'function' ? newView(prev) : newView;
      // One choke point for the whole TV surface. A stray deep link, a recommendation card, a
      // notification tap — anything aimed at a destination a television doesn't serve lands on
      // the TV home instead of mounting a view the remote cannot drive. Doing it HERE rather
      // than at each call site is what makes the guarantee hold: there is no other way in.
      // TV_BLOCKED_VIEWS still handles the studios, which show an explanation rather than
      // silently redirecting, because the viewer asked for those by name.
      if (!isViewAllowedOnTv(nextView) && !TV_BLOCKED_VIEWS[nextView]) nextView = getTvHome() as AppView;
      if (prev !== nextView || path) {
        window.history.pushState({ view: nextView }, '', path || window.location.pathname);
      }
      return nextView;
    });
  }, []);

  // Open a specific match's fan room from anywhere (live match cards dispatch this).
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent)?.detail || {}; setFanRoomMatchId(d.matchId); setFanRoomMatch(d.match || null); setView('MATCH_FAN_ROOMS'); };
    window.addEventListener('plajah:open-fanroom', h);
    return () => window.removeEventListener('plajah:open-fanroom', h);
  }, [setView]);

  // Enter Kids Mode for a child — the app then behaves as that child + lands on a safe home.
  useEffect(() => {
    const h = (e: Event) => { const child = (e as CustomEvent)?.detail?.child; if (child) { setActiveChildProfile(child); setView('KIDS_LIBRARY'); } };
    window.addEventListener('plajah:enter-kids', h);
    return () => window.removeEventListener('plajah:enter-kids', h);
  }, [setView]);

  // Live Rooms — open a room from anywhere (feed cards / shared links), or open the start composer.
  useEffect(() => {
    const open = (e: Event) => { const id = (e as CustomEvent)?.detail?.roomId; if (id) { setCurrentRoomId(id); setView('ROOM'); } };
    const start = () => setShowStartRoom(true);
    window.addEventListener('plajah:open-room', open);
    window.addEventListener('plajah:start-room', start);
    return () => { window.removeEventListener('plajah:open-room', open); window.removeEventListener('plajah:start-room', start); };
  }, [setView]);

  // Open the Chora podcast directory (from the profile "Following" library).
  useEffect(() => {
    const openPods = () => { setMusicInitialTab('PODCASTS'); setView('MUSIC'); };
    window.addEventListener('plajah:open-chora-podcasts', openPods);
    return () => window.removeEventListener('plajah:open-chora-podcasts', openPods);
  }, [setView]);

  // Open the Podcast Studio (from content-upload "Produce").
  useEffect(() => {
    const open = () => setView('PODCAST_STUDIO');
    window.addEventListener('plajah:open-podcast-studio', open);
    return () => window.removeEventListener('plajah:open-podcast-studio', open);
  }, [setView]);

  // Open Live Translation (on-device dubbing).
  useEffect(() => {
    const open = () => setView('LIVE_TRANSLATION');
    window.addEventListener('plajah:open-live-translation', open);
    return () => window.removeEventListener('plajah:open-live-translation', open);
  }, [setView]);

  // Platform-wide error capture (uncaught errors + unhandled rejections → errorReports).
  useEffect(() => { installGlobalErrorReporting(); installSessionTrace(); installHealthMonitor(); }, []);
  // Android hardware back → go back a screen in-app instead of exiting the APK.
  useHardwareBack();
  useEffect(() => { traceView(view); }, [view]);

  useEffect(() => {
    // Replace current state so we can navigate back to initial view
    // Preserve query string and hash so deep-links (?type=album&id=xxx) survive replaceState
    window.history.replaceState({ view: 'LANDING' }, '', window.location.pathname + window.location.search + window.location.hash);

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
  // The profile the app behaves as — the active child overrides the logged-in parent.
  const effectiveProfile = activeChildProfile || userProfile;
  const profileUnsubRef = useRef<(() => void) | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'createdAt' | 'title' | 'genre' | 'artist'; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [pitchDeckInitialDeck, setPitchDeckInitialDeck] = useState<PitchDeck | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [partyIdForPlayer, setPartyIdForPlayer] = useState<string | null>(null);
  const [videoQueue, setVideoQueue] = useState<any[]>([]);  // playlist autoplay queue
  const [countdownAlbumId, setCountdownAlbumId] = useState<string | null>(null);
  const [countdownInitialAlbum, setCountdownInitialAlbum] = useState<Album | null>(null);
  const [selectedMovieItem, setSelectedMovieItem] = useState<any | null>(null);
  const [selectedBook, setSelectedBook] = useState<Album | null>(null);
  const [partyIdForReader, setPartyIdForReader] = useState<string | null>(null);
  const [partyIdForAlbum, setPartyIdForAlbum] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | undefined>(undefined);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [selectedRadioArtistId, setSelectedRadioArtistId] = useState<string | undefined>(undefined);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  // True while a capture screen has handed keyboard focus up to the TV tab bar.
  // Owned by hooks/useTvShellFocus so every capture screen can hand the remote up without
  // each one having to be wired for it individually.
  const tvTabsFocused = useTvShellFocus();
  const [showBrandActivation, setShowBrandActivation] = useState(false);
  const [licenseForFilm, setLicenseForFilm] = useState<{ track: any; album: any } | null>(null);
  const [audiusArtist, setAudiusArtist] = useState<AudiusArtist | null>(null);
  const [isMuseOpen, setIsMuseOpen] = useState(false);
  const [creatorInitialType, setCreatorInitialType] = useState<string | undefined>(undefined);
  const [isCreatorMinimized, setIsCreatorMinimized] = useState(false);
  const [isProjectTrayOpen, setIsProjectTrayOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [dashboardInitialTab, setDashboardInitialTab] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [wcMobileBannerDismissed, setWcMobileBannerDismissed] = useState(() => !!localStorage.getItem('wc26_mobile_banner_dismissed'));
  const [isPublicView, setIsPublicView] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<'CONNECTED' | 'OFFLINE' | 'CHECKING'>('CHECKING');
  const [user, setUser] = useState<FirebaseUser | null>(null);

  // Sync the followed-podcast library to Firestore so it's available on every device.
  useEffect(() => {
    if (user?.uid) return initPodcastLibrarySync(user.uid);
  }, [user?.uid]);
  const [theme, setTheme] = useState<ThemeType>('PLAJAH');
  // Remember the user's desktop theme so we can restore it when the window is resized
  // back up from a mobile/PHONE width (checkDevice forces PHONE going down).
  const lastDesktopThemeRef = useRef<ThemeType>('PLAJAH');
  useEffect(() => { if (theme !== 'PHONE' && theme !== 'BIG_SCREEN') lastDesktopThemeRef.current = theme; }, [theme]);
  // The user's explicit color-theme choice, persisted locally. Mobile layout is driven by
  // `isMobile` (not the theme), so we keep the chosen COLOR on mobile instead of resetting it
  // to PHONE/black on every navigation (the bug where the theme "never stayed").
  const chosenThemeRef = useRef<ThemeType | null>((() => {
    try { return (typeof localStorage !== 'undefined' ? localStorage.getItem('plajah:theme') : null) as ThemeType | null; } catch { return null; }
  })());
  
  // Theme Asset Cycle
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<any>(null);
  const [themeAssetIndex, setThemeAssetIndex] = useState(0);
  const [themeAssetLoopCount, setThemeAssetLoopCount] = useState(0);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const [initialProfileTab, setInitialProfileTab] = useState<string | undefined>(undefined);
  const [selectedBusinessPage, setSelectedBusinessPage] = useState<any>(null);
  const [terraPassportTarget, setTerraPassportTarget] = useState<{ parcelId?: string; listingKey?: string } | null>(null);
  const [terraStudioParcel, setTerraStudioParcel] = useState<string | undefined>(undefined);
  const [selectedBrandPage, setSelectedBrandPage] = useState<any>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedWorld, setSelectedWorld] = useState<IPWorld | null>(null);
  const [worldFocus, setWorldFocus] = useState<{ worldId: string; characterId?: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDockedFlipped, setIsDockedFlipped] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'og' | 'grouped' | 'pinned'>(() =>
    (localStorage.getItem('plajah_sidebar_mode_v1') as 'og' | 'grouped' | 'pinned') || 'og'
  );
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['discover', 'entertain', 'creator']);
  const [pinnedNavItems, setPinnedNavItems] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('plajah_pinned_nav_v1') || '["USER_PROFILE","DASHBOARD","MUSIC","VIDEOS","PLAJAH_SPORTS","FEED","LIVE_HUB","POSTMAN"]'); }
    catch { return ['USER_PROFILE', 'DASHBOARD', 'MUSIC', 'VIDEOS', 'PLAJAH_SPORTS', 'FEED', 'LIVE_HUB', 'POSTMAN']; }
  });
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [notifDrawerTrigger, setNotifDrawerTrigger] = useState<{ tab: string; ts: number } | null>(null);
  const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | undefined>(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pixelsPayload, setPixelsPayload] = useState<{ album?: any; track?: any } | null>(null);
  const [smartDirectorPayload, setSmartDirectorPayload] = useState<{ productionId?: string; event?: any } | null>(null);
  const [labsDiscipline, setLabsDiscipline] = useState<string | null>(null);
  // Shared-track landing: shows the 5s auto-play countdown, then plays that track.
  const [autoPlayShare, setAutoPlayShare] = useState<{ album: any; track: any } | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [kioskEventId, setKioskEventId] = useState<string | null>(null);
  const [scannerEventId, setScannerEventId] = useState<string | null>(null);
  const [isPIFModalOpen, setIsPIFModalOpen] = useState(false);
  const [pifWins, setPifWins] = useState<PayItForwardWinner[]>([]);
  const [activeLiveFeed, setActiveLiveFeed] = useState<LiveFeed | null>(null);
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [characterProfile, setCharacterProfile] = useState<any | null>(null);
  const [characterChat, setCharacterChat] = useState<any | null>(null);
  const [isMobile, setIsMobile] = useState(() => {
    const ua = navigator.userAgent;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
      (ua.includes('Mac') && navigator.maxTouchPoints > 1) || // iPad OS 13+ reports Mac UA
      window.innerWidth < 768
    );
  });
  const [isBottomSectionExpanded, setIsBottomSectionExpanded] = useState(false);
  const [drawerSearchFocused, setDrawerSearchFocused] = useState(false);
  const [adSlots, setAdSlots] = useState<AdSlot[]>([]);
  const [adSlotIdx, setAdSlotIdx] = useState(0);
  const [showPlajahPlusBillboard, setShowPlajahPlusBillboard] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  // Adaptive nav layout — slim rail on compact desktop (12–20"), horizontal bar on
  // touch tablets, split pillars as an opt-in. See hooks/useNavLayout.
  const navLayout = useNavLayout();
  // Transient red warning toast (e.g. nano view isn't available in bar mode).
  const [navWarning, setNavWarning] = useState<string | null>(null);
  const navWarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barSettledRef = useRef(false);
  const showNavWarning = useCallback((msg: string) => {
    setNavWarning(msg);
    if (navWarnTimer.current) clearTimeout(navWarnTimer.current);
    navWarnTimer.current = setTimeout(() => setNavWarning(null), 3200);
  }, []);
  // Curated primary destinations for the compact top bar (Concept C). The full sidebar
  // config still lives in the vertical rail; the bar shows the headline pages + "More".
  const barPages: NavPage[] = [
    { id: 'DASHBOARD', label: 'Home', icon: Home },
    { id: 'MUSIC', label: 'Chora', icon: Music2 },
    { id: 'VIDEOS', label: 'Reello', icon: VideoIcon },
    { id: 'MOVIES_TV', label: 'Taleo', icon: Film },
    { id: 'PLAJAH_SPORTS', label: 'Sports', icon: Zap },
    { id: 'BOOKS', label: 'Lorea', icon: BookOpen },
    { id: 'FEED', label: 'Social', icon: Rss },
    { id: 'CHAT', label: 'Chat', icon: MessageSquare },
    { id: 'GAMES', label: 'Games', icon: Gamepad2 },
    { id: 'APPS', label: 'Apps', icon: AppWindow },
  ];
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
  const [showExperiencePicker, setShowExperiencePicker] = useState(false);
  // Smart Guide
  const [smartGuideEnabled, setSmartGuideEnabled] = useState(false);
  const [hasSeenSmartGuide, setHasSeenSmartGuide] = useState(false);
  const [orgHubInitial, setOrgHubInitial] = useState<{ orgId: string; give?: boolean } | null>(null);
  const [relloInitialVideoId, setRelloInitialVideoId] = useState<string | undefined>(undefined);
  const [videoPlaylistInitialId, setVideoPlaylistInitialId] = useState<string | undefined>(undefined);
  const [clubInitialId, setClubInitialId] = useState<string | undefined>(undefined);
  // Account Switcher
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [hotSwitchSlot, setHotSwitchSlot] = useState<number | null>(null);
  const hotSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertPressedRef = useRef(false);
  const [showWelcomeAchievement, setShowWelcomeAchievement] = useState(false);
  const [showWelcomePackage, setShowWelcomePackage] = useState(false);
  const [selectedDebateId, setSelectedDebateId] = useState<string | null>(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const [is3DDepthEnabled, setIs3DDepthEnabled] = useState(false);

  const isFirstWeek = userProfile?.onboardingStartTimestamp 
    ? (Date.now() - userProfile.onboardingStartTimestamp) < (7 * 24 * 60 * 60 * 1000)
    : true;

  const tooltipsActive = userProfile?.tooltipsEnabled ?? isFirstWeek;

  const { isShrunk, setIsShrunk, setView: setGlobalView, analyser, isPlaying, isNanoView, setIsNanoView, isNanoDocked, setIsNanoDocked, currentTrack, currentAlbum, playTrack, pause, resume, next, prev, isMinimized, setIsMinimized, transportForced, setTransportForced, repeatMode, setRepeatMode, volume, setVolume, isFrequencyVisualizerEnabled, setIsFrequencyVisualizerEnabled, isSlideshowActive, setIsSlideshowActive, isMiniPlayerActive, setIsMiniPlayerActive, isThreeDEnabled, setIsThreeDEnabled, isSpatialAudioEnabled, setSpatialAudioEnabled, audioSource } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();
  // Persistent now-playing pill: tap → tracklist, swipe-up → extra-settings drawer.
  const nowPlayingTouchY = useRef<number | null>(null);
  const nowPlayingSwiped = useRef(false);
  // Double-tap the Chora nav icon to reveal the transport controls in place.
  const lastChoraTapRef = useRef(0);
  const choraTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A shared album opens in public PLAYER view where the sidebar (and its player "Controller")
  // is hidden. The player defaults to docked-nano, which renders nothing — so a visitor could
  // play a track but had no transport controls. Force the standard bottom mini-player bar.
  useEffect(() => {
    if (isPublicView && view === 'PLAYER') { setIsNanoView(false); setIsNanoDocked(false); }
  }, [isPublicView, view, setIsNanoView, setIsNanoDocked]);

  // Horizontal-bar (Concept C) nav: the floating nano player fights the top bar and hides the
  // transport — keep the full global bottom bar instead. If the user tries to turn nano ON here,
  // revert it and pop a red warning (rather than the controls silently vanishing). Switching INTO
  // bar mode with nano already on just turns it off quietly (barSettledRef guards the warning).
  useEffect(() => {
    if (!navLayout.isBar) { barSettledRef.current = false; return; }
    if (isNanoView || isNanoDocked) {
      setIsNanoView(false);
      setIsNanoDocked(false);
      if (barSettledRef.current) showNavWarning('Nano view unavailable in this view');
    }
    barSettledRef.current = true;
  }, [navLayout.isBar, isNanoView, isNanoDocked, setIsNanoView, setIsNanoDocked, showNavWarning]);

  useEffect(() => {
    setGlobalView(view);
  }, [view, setGlobalView]);

  // Docked nano: it loads collapsed and only WAKES when there's something to control —
  // playback starting, or the user loading a different asset. There is deliberately no idle
  // timer: the old 20s auto-shrink made the UI feel like it was fighting you and stole space
  // mid-task. Collapsing is now an explicit action (the red minimize dash) only.
  const nanoSeenTrackRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isNanoDocked) return;
    const id = currentTrack?.id ?? null;
    const firstRun = nanoSeenTrackRef.current === undefined;
    // A track restored from a previous session shouldn't pop the player open on arrival —
    // only a genuine change after mount counts as "the user picked something".
    const pickedSomethingNew = !firstRun && id !== null && id !== nanoSeenTrackRef.current;
    nanoSeenTrackRef.current = id;
    if (isPlaying || pickedSomethingNew) setIsMinimized(false);
  }, [isNanoDocked, isPlaying, currentTrack?.id, setIsMinimized]);

  // Persist transcribed scores exported from the Breakdown into Lorea.
  useEffect(() => initLoreaScoreListener(), []);

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

    const handleOpenDebate = (e: any) => {
      setSelectedDebateId(e.detail.debateId);
      setView('DEBATE_DETAIL');
    };
    window.addEventListener('OPEN_DEBATE', handleOpenDebate);

    const handlePlayLive = (e: any) => {
      setActiveLiveFeed(e.detail.feed);
    };
    window.addEventListener('PLAY_LIVE_FEED', handlePlayLive);

    // Order tracking: open on demand, and auto-open after a store/kiosk checkout returns (?order=success).
    const handleOpenOrders = () => setShowMyOrders(true);
    window.addEventListener('OPEN_MY_ORDERS', handleOpenOrders);
    const handleOpenCharacter = (e: any) => { if (e.detail?.character) setCharacterProfile(e.detail.character); };
    window.addEventListener('OPEN_CHARACTER_PROFILE', handleOpenCharacter);
    const handleCharacterChat = (e: any) => { if (e.detail?.character) setCharacterChat(e.detail.character); };
    window.addEventListener('OPEN_CHARACTER_CHAT', handleCharacterChat);
    // Open a seller's store (e.g. "Buy" on the in-store Now Playing card / music pulse).
    const handleOpenStore = (e: any) => { const sid = e.detail?.sellerId; if (sid) { setViewedUserId(sid); setView('STORE'); } };
    window.addEventListener('OPEN_STORE', handleOpenStore);
    try {
      if (new URLSearchParams(window.location.search).get('order') === 'success') {
        setShowMyOrders(true);
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch { /* */ }

    // Open the Plajah Pixels visualizer. detail: { album?, track? }. Empty detail
    // (from the Apps page) opens the standalone studio. The wrapper handles any
    // seamless playback start via the global player.
    const handleOpenPixels = (e: any) => {
      // Pixels is a real-time GPU compositor. On a TV it is both undrivable with a remote and
      // far beyond the SoC's budget, so the event is answered with the explanation rather than
      // by opening a view that would crawl. Routing through the view keeps one code path:
      // TV_BLOCKED_VIEWS turns PLAJAH_PIXELS into the notice.
      setPixelsPayload(e?.detail || {});
      setView('PLAJAH_PIXELS');
    };
    window.addEventListener('OPEN_PLAJAH_PIXELS', handleOpenPixels);

    const handleOpenBible = () => setView('BIBLE');
    window.addEventListener('OPEN_BIBLE', handleOpenBible);

    const handleOpenTeleprompter = () => setView('TELEPROMPTER');
    window.addEventListener('OPEN_TELEPROMPTER', handleOpenTeleprompter);

    const handleOpenSpatialMixer = () => setView('SPATIAL_MIXER' as AppView);
    window.addEventListener('OPEN_SPATIAL_MIXER', handleOpenSpatialMixer);

    const handleOpenMediaConverter = () => setView('MEDIA_CONVERTER' as AppView);
    window.addEventListener('OPEN_MEDIA_CONVERTER', handleOpenMediaConverter);

    // Smart Director — multi-camera auto-production. detail: { productionId?, event? }.
    const handleOpenSmartDirector = (e: Event) => { setSmartDirectorPayload((e as CustomEvent)?.detail || {}); setView('SMART_DIRECTOR' as AppView); };
    window.addEventListener('OPEN_SMART_DIRECTOR', handleOpenSmartDirector);

    // Learn chips — deep-link any content into its Labs discipline. detail: { disciplineId }.
    const handleOpenLabsDiscipline = (e: Event) => {
      const id = (e as CustomEvent)?.detail?.disciplineId;
      if (id) { setLabsDiscipline(id); setView('PLAJAH_LABS' as AppView); }
    };
    window.addEventListener('OPEN_LABS_DISCIPLINE', handleOpenLabsDiscipline);

    const handleOpenBrandActivation = () => { if (!user) { loginWithGoogle(); return; } setShowBrandActivation(true); };
    window.addEventListener('OPEN_BRAND_ACTIVATION', handleOpenBrandActivation);

    // Audius artist navigation (related-artists, artist links) → the artist landing page.
    const handleAudiusArtist = (e: Event) => {
      const a = (e as CustomEvent).detail;
      if (a?.id) { setAudiusArtist(a); setSelectedAlbum(null); setView('AUDIUS_ARTIST' as AppView); }
    };
    window.addEventListener('audius-artist', handleAudiusArtist);

    // Open a specific live stream from anywhere (e.g. a "Live now" post in the social feed).
    // Mirrors the ?livestream=<id> deep-link's open logic.
    const handleOpenLivestream = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!d.streamId) return;
      setActiveLiveFeed({ id: d.streamId, streamId: d.streamId, url: `livestream:${d.streamId}`, status: 'LIVE', isPublic: true, ownerId: d.ownerId || '', ownerName: d.ownerName || '', title: d.title || 'Live Stream', timestamp: Date.now() } as any);
    };
    window.addEventListener('OPEN_LIVESTREAM', handleOpenLivestream);

    // Open the Album Creator seeded with a prebuilt release (e.g. a Spatial Mixer → Chora publish).
    const handleOpenAlbumCreator = (e: Event) => {
      const seed = (e as CustomEvent).detail?.album;
      if (seed) setEditingAlbum(seed);
      setShowCreator(true);
    };
    window.addEventListener('OPEN_ALBUM_CREATOR', handleOpenAlbumCreator);

    // Open Fabula (e.g. after a Pixels → Fabula export; Fabula reads the idb handoff on boot).
    const handleOpenFabula = () => setView('FABULA' as AppView);
    window.addEventListener('OPEN_FABULA', handleOpenFabula);

    // License a Chora song for a film: pick a Fabula project, license + drop it into
    // that film's Media Pool. detail: { track, album }.
    const handleLicenseForFilm = (e: Event) => {
      if (!user) { loginWithGoogle(); return; }
      const d = (e as CustomEvent).detail;
      if (d?.track && d?.album) setLicenseForFilm({ track: d.track, album: d.album });
    };
    window.addEventListener('OPEN_LICENSE_FOR_FILM', handleLicenseForFilm);

    return () => {
      window.removeEventListener('START_CHAT', handleStartChat);
      window.removeEventListener('OPEN_PIF_MODAL', handleOpenPIF);
      window.removeEventListener('OPEN_DEBATE', handleOpenDebate);
      window.removeEventListener('NAVIGATE', handleNavigate);
      window.removeEventListener('PLAY_LIVE_FEED', handlePlayLive);
      window.removeEventListener('OPEN_MY_ORDERS', handleOpenOrders);
      window.removeEventListener('OPEN_CHARACTER_PROFILE', handleOpenCharacter);
      window.removeEventListener('OPEN_CHARACTER_CHAT', handleCharacterChat);
      window.removeEventListener('OPEN_STORE', handleOpenStore);
      window.removeEventListener('OPEN_PLAJAH_PIXELS', handleOpenPixels);
      window.removeEventListener('OPEN_BIBLE', handleOpenBible);
      window.removeEventListener('OPEN_TELEPROMPTER', handleOpenTeleprompter);
      window.removeEventListener('OPEN_SPATIAL_MIXER', handleOpenSpatialMixer);
      window.removeEventListener('OPEN_MEDIA_CONVERTER', handleOpenMediaConverter);
      window.removeEventListener('OPEN_SMART_DIRECTOR', handleOpenSmartDirector);
      window.removeEventListener('OPEN_LABS_DISCIPLINE', handleOpenLabsDiscipline);
      window.removeEventListener('OPEN_BRAND_ACTIVATION', handleOpenBrandActivation);
      window.removeEventListener('audius-artist', handleAudiusArtist);
      window.removeEventListener('OPEN_LIVESTREAM', handleOpenLivestream);
      window.removeEventListener('OPEN_ALBUM_CREATOR', handleOpenAlbumCreator);
      window.removeEventListener('OPEN_FABULA', handleOpenFabula);
      window.removeEventListener('OPEN_LICENSE_FOR_FILM', handleLicenseForFilm);
    };
  }, [user]);

  // Nibble invite links (?nibble=<code>): once signed in, link the invitee to the
  // inviter as partner. If not signed in yet, stash the code for after login.
  const nibbleHandledRef = useRef(false);
  useEffect(() => {
    const code = pendingNibbleCode() || (typeof localStorage !== 'undefined' ? localStorage.getItem('pending_nibble') : null);
    if (!code || nibbleHandledRef.current) return;
    if (!user) { try { localStorage.setItem('pending_nibble', code); } catch { /* private mode */ } return; }
    nibbleHandledRef.current = true;
    (async () => {
      try {
        const prof = userProfile || await fetchUserProfile(user.uid);
        if (!prof) { nibbleHandledRef.current = false; return; }
        const res = await acceptNibbleInvite(code, prof);
        try { localStorage.removeItem('pending_nibble'); } catch { /* ignore */ }
        try { const u = new URL(window.location.href); u.searchParams.delete('nibble'); window.history.replaceState({}, '', u.toString()); } catch { /* ignore */ }
        if (res.ok) { alert(`You're linked with ${res.inviterName} on Plajah 💞 Open your profile to confirm and start Nibbles together.`); setView('CREATOR'); }
        else if (res.reason) { alert(res.reason); }
      } catch { nibbleHandledRef.current = false; }
    })();
  }, [user, userProfile]);

  useEffect(() => {
    const checkDevice = () => {
      const ua = navigator.userAgent;
      const mobile = (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
        (ua.includes('Mac') && navigator.maxTouchPoints > 1) || // iPad OS 13+
        window.innerWidth < 768
      );
      // TV is decided by usePlatform (native leanback flag → OEM tokens → input shape),
      // NOT by a UA keyword list here. The old local copy tested "mobile" first, that test
      // matches /Android/i, and so every Android TV took the phone branch and never reached
      // the TV check — which is exactly why the APK booted into the mobile UI on a TV.
      const isTV = getPlatformInfo().isTV;
      setIsMobile(mobile && !isTV);

      if (isTV) {
        // Hard TV-first: on a television this is the only layout, at every size.
        setTheme('BIG_SCREEN');
      } else if (mobile) {
        // Mobile LAYOUT is driven by `isMobile` (set above), so we no longer clobber the
        // COLOR theme to PHONE/black on every navigation. Keep the user's chosen theme;
        // fall back to PHONE only when they've never picked one.
        const chosen = chosenThemeRef.current;
        const wanted: ThemeType = (chosen && chosen !== 'BIG_SCREEN') ? chosen : 'PHONE';
        setTheme(prev => prev === wanted ? prev : wanted);
      } else {
        // Resized back up to desktop → restore the desktop theme so the layout reflows.
        setTheme(prev => prev === 'PHONE' ? lastDesktopThemeRef.current : prev);
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
      }, 6000);
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

  const handleExperiencePicked = async (mode: ExperienceMode) => {
    setShowExperiencePicker(false);
    if (user) {
      updateUserProfile(user.uid, {
        experienceMode: mode,
        hasCompletedOnboarding: true,
      } as any).catch(() => {});
    }
    const expRouteMap: Record<ExperienceMode, AppView> = {
      RAW_DOG:          'DASHBOARD',
      MUSIC_CREATOR:    'MUSIC',
      WRITER:           'BOOKS',
      SPORTS_FAN:       'PLAJAH_SPORTS',
      STORY_TELLER:     'MOVIES_TV',
      CONTENT_CREATOR:  'VIDEOS',
      SCIENCE_ENGINEER: 'PLAJAH_LABS',
    };
    setView(expRouteMap[mode]);
    // Show feature highlights tour immediately after experience picker
    // The feature tour is off by default on TV: it is built for taps, it traps a remote in a
    // flow that is hard to dismiss with a D-pad, and it is the first thing a viewer sees on a
    // 10-foot screen. Reachable from settings if someone wants it.
    if (!getPlatformInfo().isTV) setTimeout(() => setShowOnboarding(true), 400);
  };

  const handleEnterApp = () => {
    const isTV = getPlatformInfo().isTV;
    const isMobileDevice = !isTV && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 640);

    if (isTV) {
      // A television opens on its home destination — Taleo by default, so the app behaves like
      // a streaming service rather than dropping the viewer into a creation hub.
      setView(getTvHome());
      setTheme('BIG_SCREEN');
      // Refresh the Android TV home-screen "continue watching" row from cross-device history.
      // No-op on non-Android-TV; deferred so it never competes with first paint.
      import('./services/watchHistoryService')
        .then(m => setTimeout(() => m.reconcileWatchNext().catch(() => {}), 3000))
        .catch(() => {});
    } else if (isMobileDevice) {
      setView('MUSIC');
      setTheme('PHONE');
    } else {
      const expRouteMap: Record<ExperienceMode, AppView> = {
        RAW_DOG:          'DASHBOARD',
        MUSIC_CREATOR:    'MUSIC',
        WRITER:           'BOOKS',
        SPORTS_FAN:       'PLAJAH_SPORTS',
        STORY_TELLER:     'MOVIES_TV',
        CONTENT_CREATOR:  'VIDEOS',
        SCIENCE_ENGINEER: 'PLAJAH_LABS',
      };
      const expMode = userProfile?.experienceMode;
      setView(expMode ? (expRouteMap[expMode] ?? 'DASHBOARD') : 'DASHBOARD');
    }
  };

  const handleSelectItem = (item: any) => {
    const subType = item.subType || '';
    const genre = item.genre || '';
    const TALEO_GENRES = ['Movie', 'Movies', 'Short Film', 'Short', 'Teaser', 'Trailer', 'Feature Film'];
    const isMovie = item.category === 'MOVIE' || subType === 'MOVIE' || subType === 'Movie' || subType === 'Short Film' || TALEO_GENRES.includes(genre);
    const isTV = subType === 'TV_SERIES' || subType === 'TV Series' || genre === 'TV Series';
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
      // Show release countdown page for scheduled albums that haven't dropped yet,
      // unless the current user is the owner (they can always preview their own work).
      const isUnreleased = item.isScheduled && item.releaseDate && item.releaseDate > Date.now();
      const isOwner = user && item.ownerId && user.uid === item.ownerId;
      if (isUnreleased && !isOwner) {
        setCountdownInitialAlbum(item as Album);
        setCountdownAlbumId(item.id);
        return;
      }
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

  const handleGlobalNavigate = async (target: string, params?: any) => {
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
        const signedInUser = await loginWithGoogle();
        if (signedInUser) {
          handleVisitUser(signedInUser.uid);
        }
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
      if (!user) { loginWithGoogle(); return; }
      setView('CREATOR');
    } else if (target === 'CREATOR') {
      if (!user) {
        loginWithGoogle();
        return;
      }
      if (params?.editingAlbum) {
        setEditingAlbum(params.editingAlbum);
      }
      if (params?.creatorInitialType) {
        setCreatorInitialType(params.creatorInitialType);
      }
      setShowCreator(true);
    } else if (target === 'CONTENT_MANAGER') {
      // Open the account dashboard directly on the content Asset Manager tab.
      if (!user) { loginWithGoogle(); return; }
      setDashboardInitialTab('ASSETS');
      setView('CREATOR');
    } else if (target === 'BRAND_ACTIVATION') {
      if (!user) { loginWithGoogle(); return; }
      setShowBrandActivation(true);
    } else if (target === 'COMIC_MUSEUM') {
      setView('COMIC_MUSEUM');
    } else if (target === 'LICENSE_REQUESTS') {
      if (!user) { loginWithGoogle(); return; }
      setView('LICENSE_REQUESTS');
    } else if (target === 'BOOK_STUDIO' || target === 'COMIC_STUDIO') {
      setView('BOOK_STUDIO');
    } else if (target === 'SANCTUARY_HUB') {
      setView('SANCTUARY_HUB');
    } else if (target === 'SANCTUARY') {
      setViewedUserId(params?.artistId || user?.uid);
      setView('SANCTUARY');
    } else if (target === 'STORE_HUB') {
      setView('STORE_HUB');
    } else if (target === 'STORE') {
      setView('STORE');
    } else if (target === 'GARAGE_SALE') {
      setView('GARAGE_SALE');
    } else if (target === 'PLAJAH_BUSINESS') {
      setView('PLAJAH_BUSINESS');
    } else if (target === 'BUSINESS_DASHBOARD') {
      setView('BUSINESS_DASHBOARD');
    } else if (target === 'TERRA') {
      setView('TERRA');
    } else if (target === 'TERRA_MAP') {
      setView('TERRA_MAP');
    } else if (target === 'TERRA_STUDIO') {
      setTerraStudioParcel(params?.terraTarget?.parcelId);
      setView('TERRA_STUDIO');
    } else if (target === 'TERRA_SCOUT') {
      setView('TERRA_SCOUT');
    } else if (target === 'TERRA_FILM') {
      setView('TERRA_FILM');
    } else if (target === 'TERRA_FEED') {
      setView('TERRA_FEED');
    } else if (target === 'TERRA_LISTINGS') {
      setView('TERRA_LISTINGS');
    } else if (target === 'TERRA_PASSPORT') {
      setTerraPassportTarget(params?.terraTarget || null);
      setView('TERRA_PASSPORT');
    } else if (target === 'BUSINESS_PUBLIC') {
      if (params?.businessPage) setSelectedBusinessPage(params.businessPage);
      setView('BUSINESS_PUBLIC');
    } else if (target === 'BRAND_PUBLIC') {
      if (params?.brandPage) setSelectedBrandPage(params.brandPage);
      setView('BRAND_PUBLIC');
    } else if (target === 'ADMIN_DASHBOARD') {
      setView('ADMIN_DASHBOARD');
    } else if (target === 'ADMIN_AD_DASHBOARD') {
      setView('ADMIN_AD_DASHBOARD');
    } else if (target === 'PARTNER_DASHBOARD') {
      setView('PARTNER_DASHBOARD');
    } else if (target === 'MOVIES_TV') {
      setView('MOVIES_TV');
    } else if (target === 'CLASS_POINTS') {
      setView('CLASS_POINTS');
    } else if (target === 'READING_QUEST') {
      setView('READING_QUEST');
    } else if (target === 'HISTORY_QUEST') {
      setView('HISTORY_QUEST');
    } else if (target === 'SCIENCE_QUEST') {
      setView('SCIENCE_QUEST');
    } else if (target === 'LEARNER_LEDGER') {
      setView('LEARNER_LEDGER');
    } else if (target === 'TEACHER_TOOLS') {
      setView('TEACHER_TOOLS');
    } else if (target === 'KIDS_LIBRARY') {
      setView('KIDS_LIBRARY');
    } else if (target === 'HELP_CENTER') {
      setView('HELP_CENTER');
    } else if (target === 'BRAND_DASHBOARD') {
      setView('BRAND_DASHBOARD');
    } else if (target === 'ORG_HUB') {
      setView('ORG_HUB');
    } else if (target === 'CREATOR_PAYMENTS') {
      if (!user) { loginWithGoogle(); return; }
      setView('CREATOR_PAYMENTS');
    } else if (target === 'ARTIST_MANAGER' || target === 'AD_PACKAGES' || target === 'ARTIST_BOARDS' || target === 'EVENT_PRODUCTION_STUDIO' || target === 'TICKET_DESIGNER') {
      if (!user) { loginWithGoogle(); return; }
      setView(target as any);
    } else if (target === 'EVENTS') {
      setView('EVENTS');
    } else if (target === 'EVENT_DETAIL') {
      if (params?.eventId) setSelectedEventId(params.eventId);
      setView('EVENT_DETAIL');
    } else if (target === 'EVENT_CREATE') {
      if (!user) { loginWithGoogle(); return; }
      setView('EVENT_CREATE');
    } else if (target === 'EVENT_DASHBOARD') {
      if (!user) { loginWithGoogle(); return; }
      setView('EVENT_DASHBOARD');
    } else if (target === 'MY_TICKETS') {
      if (!user) { loginWithGoogle(); return; }
      setView('MY_TICKETS');
    } else if (target === 'EVENT_KIOSK') {
      if (!user) { loginWithGoogle(); return; }
      if (params?.eventId) setKioskEventId(params.eventId);
      setView('EVENT_KIOSK');
    } else if (target === 'VIDEO_MANAGER') {
      setView('VIDEO_MANAGER');
    } else if (target === 'PLAYER') {
      if (params?.album) {
        setSelectedAlbum(params.album);
        setSelectedVideo(null);
      } else if (params?.video) {
        setSelectedVideo(params.video);
        setSelectedAlbum(null);
      }
      setView('PLAYER');
    } else if (target === 'RELLO' || target === 'VIDEOS') {
      // Reello playback. With a videoId, land ON that short in the reel feed (same path as a
      // shared /share?type=video link); without one, open the Reello feed. Fabula uses this to
      // deep-link straight to a just-published video instead of dropping the user on a generic feed.
      if (params?.videoId) { setRelloInitialVideoId(params.videoId); setView('RELLO'); }
      else setView('VIDEOS');
    } else if (target === 'CLUBS') {
      setView('CLUBS');
    } else if (target === 'LIVE_HUB') {
      setView('LIVE_HUB');
    }
  };

  const loadAlbums = async () => {
    const cloudAlbums = await fetchAllPublicAlbums();
    setAlbums(cloudAlbums);
  };

  useEffect(() => {
    const unsubscribe = onAuthUpdate(async (u) => {
      setUser(u);

      // Tear down any previous profile listener on auth change
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (u) {
        // Immediately route away from LANDING — device-aware only (no profile yet)
        setViewInternal(prev => {
          if (prev === 'LANDING') {
            const ua = navigator.userAgent;
            // TV first — the mobile regex below matches Android TVs, so testing it first
            // silently sent every TV to the phone layout.
            if (getPlatformInfo().isTV) { setTheme('BIG_SCREEN'); return getTvHome(); }
            const isMobileDevice =
              /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
              (ua.includes('Mac') && navigator.maxTouchPoints > 1) ||
              window.innerWidth < 768;
            if (isMobileDevice) { setTheme('PHONE'); return 'MUSIC'; }
            return 'DASHBOARD';
          }
          return prev;
        });

        // One-time fetch for initialization actions
        const p = await fetchUserProfile(u.uid);
        setUserProfile(p);

        // Apply experience-mode routing now that profile is available
        if (p?.experienceMode && p.experienceMode !== 'RAW_DOG') {
          const expRouteMap: Record<ExperienceMode, AppView> = {
            RAW_DOG:          'DASHBOARD',
            MUSIC_CREATOR:    'MUSIC',
            WRITER:           'BOOKS',
            SPORTS_FAN:       'PLAJAH_SPORTS',
            STORY_TELLER:     'MOVIES_TV',
            CONTENT_CREATOR:  'VIDEOS',
            SCIENCE_ENGINEER: 'PLAJAH_LABS',
          };
          setViewInternal(prev => prev === 'DASHBOARD' ? (expRouteMap[p.experienceMode!] ?? 'DASHBOARD') : prev);
        }

        if (p?.uiSettings?.lastTheme) {
          // Restore the saved COLOR theme on every device. Mobile layout is driven by
          // isMobile (not the theme), so this no longer risks the mobile layout — and it
          // fixes the saved theme not coming back on a phone. Seed the choice ref + local
          // store so the checkDevice effect keeps it across navigation instead of forcing PHONE.
          const saved = p.uiSettings.lastTheme as ThemeType;
          if (saved !== 'BIG_SCREEN') {
            chosenThemeRef.current = saved;
            try { localStorage.setItem('plajah:theme', saved); } catch { /* */ }
            setTheme(saved);
          }
        }

        seedDemoWorlds();

        // One-time-per-browser guard. The Firestore flags below don't persist
        // reliably (a failed/raced write re-showed onboarding AND re-awarded the
        // welcome points on every refresh). This makes each fire at most once per
        // account on this device, regardless of whether the profile write lands.
        // (A backend/admin reset can clear these keys to re-trigger onboarding.)
        const firstTime = (name: string) => {
          try {
            const k = `plj_once_${name}_${u.uid}`;
            if (localStorage.getItem(k)) return false;
            localStorage.setItem(k, '1');
            return true;
          } catch { return true; }
        };

        if (p && !p.hasCompletedOnboarding && firstTime('onboard')) {
          setShowExperiencePicker(true);
        }

        if (p && !p.welcomeAchievementShown && firstTime('welcome_achievement')) {
          setShowWelcomeAchievement(true);
          updateUserProfile(u.uid, { welcomeAchievementShown: true, totalPoints: (p.totalPoints || 0) + 100 } as any).catch(() => {});
        }

        if (p && !p.hasSeenWelcomePackage && firstTime('welcome_package')) {
          // Show on next login — slight delay so the UI is settled
          setTimeout(() => setShowWelcomePackage(true), 1200);
        }

        // Smart Guide — auto-enable for new users
        setHasSeenSmartGuide(!!p?.hasSeenSmartGuide);
        setSmartGuideEnabled(p?.smartGuideEnabled ?? !p?.hasSeenSmartGuide);
        // Load linked accounts for hot-switch. The DEVICE roster (localStorage) is
        // the source of truth so saved slots survive account switches; seed it from
        // the profile's list on first run, then upsert the now-active account.
        if (!loadRoster().length && p?.linkedAccounts?.length) {
          p.linkedAccounts.forEach(a => upsertAccount(a as any));
        }
        const roster = upsertAccount({
          uid: u.uid, email: u.email, displayName: u.displayName,
          photoURL: u.photoURL, provider: u.providerData[0]?.providerId || 'google.com',
        });
        setLinkedAccounts(roster);
        updateUserProfile(u.uid, { linkedAccounts: roster } as any).catch(() => {});

        if (u.email === 'kmoody2003@gmail.com') {
          const cloudAlbums = await fetchAllPublicAlbums();
          if (!cloudAlbums.some(a => a.type === 'BOOK')) {
            await seedPublicDomainBooks();
            const updatedAlbums = await fetchAllPublicAlbums();
            setAlbums(updatedAlbums);
          }
        }

        // Register for push notifications + store the FCM token. Native (APK / Fire TV)
        // uses the Capacitor plugin for real system-tray delivery even when the app is
        // killed; web / PWA uses the Firebase JS SDK + service worker. Both surface an
        // in-app toast on foreground arrival, and taps route through the same handler.
        import('./hooks/usePlatform').then(({ getPlatformInfo }) => {
          if (getPlatformInfo().isNative) {
            import('./services/nativePushService').then(({ initNativePush }) => {
              initNativePush({
                onForeground: (title, body) => {
                  window.dispatchEvent(new CustomEvent('PUSH_TOAST', { detail: { title, body } }));
                },
                onNavigate: (data) => { handleNotificationNavigate(data); },
              });
            });
          } else {
            import('./services/pushNotificationService').then(({ requestPushPermission, onForegroundMessage }) => {
              requestPushPermission().catch(() => {});
              onForegroundMessage((payload) => {
                const title = payload.notification?.title || 'New notification';
                const body = payload.notification?.body || '';
                window.dispatchEvent(new CustomEvent('PUSH_TOAST', { detail: { title, body } }));
              });
            });
          }
        });

        // Real-time listener keeps userProfile fresh after any profile edits
        // (background changes, theme activation, etc.) without requiring re-login
        profileUnsubRef.current = listenToUserProfile(u.uid, (liveProfile) => {
          setUserProfile(liveProfile);
        });
      } else {
        setUserProfile(null);
        // Don't clobber a shared deep-link view (profile/video/album/etc.) for
        // signed-out visitors — that's how public share links reach the content.
        if (!hasDeepLink) setViewInternal('LANDING');
      }
    });
    return () => {
      unsubscribe();
      if (profileUnsubRef.current) profileUnsubRef.current();
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      // Run connectivity check
      const isConnected = await checkCloudConnection();
      setCloudStatus(isConnected ? 'CONNECTED' : 'OFFLINE');

      const params = new URLSearchParams(window.location.search);
      const projectId = params.get('id');
      const shareType = params.get('type');

      // Deep-link: ?elevate=1 — open the Plajah Elevate directory (faith/culture/nonprofits)
      if (params.get('elevate')) {
        setView('PLAJAH_ELEVATE');
        setIsLoading(false);
        return;
      }

      // Deep-link: ?org={id} (&give=1) — open an organization / church page (or its giving flow)
      const orgIdParam = params.get('org');
      if (orgIdParam) {
        setOrgHubInitial({ orgId: orgIdParam, give: params.get('give') === '1' });
        setView('ORG_HUB');
        setIsLoading(false);
        return;
      }

      // Deep-link: ?debate={id} — open the debate directly.
      const debateIdParam = params.get('debate');
      if (debateIdParam) {
        setSelectedDebateId(debateIdParam);
        setView('DEBATE_DETAIL');
        setIsLoading(false);
        return;
      }

      // Deep-link: ?club={id} — open the specific club.
      const clubIdParam = params.get('club');
      if (clubIdParam) {
        setClubInitialId(clubIdParam);
        setView('CLUBS');
        setIsLoading(false);
        return;
      }

      // Deep-link: ?livestream={id} — opens the WebRTC viewer directly
      const lsId = params.get('livestream');
      if (lsId) {
        setActiveLiveFeed({ id: lsId, streamId: lsId, url: `livestream:${lsId}`, status: 'LIVE', isPublic: true, ownerId: '', ownerName: '', title: 'Live Stream', timestamp: Date.now() } as any);
        document.title = 'Live Stream | Plajah';
        setIsLoading(false);
        return;
      }

      // Deep-link: ?party={id} — join a synchronized watch/read/listen party and follow the host.
      const partyParam = params.get('party');
      if (partyParam) {
        import('./services/partyService').then(async (ps) => {
          const p = await ps.fetchParty(partyParam).catch(() => null);
          if (p && p.isActive !== false && p.kind === 'WATCH') {
            const m = await import('./services/backendService');
            let vid: any = await m.fetchVideoById(p.content.id).catch(() => null);
            if (!vid) vid = { id: p.content.id, title: p.content.title || 'Watch Party', url: p.content.url, muxPlaybackId: p.content.muxPlaybackId, thumbnailUrl: p.content.thumbnail, ownerId: p.hostId, timestamp: Date.now() };
            setPartyIdForPlayer(partyParam);
            setSelectedVideo(vid);
            setView('PLAYER');
            document.title = `Watch Party · ${vid.title} | Plajah`;
          } else if (p && p.isActive !== false && p.kind === 'READ') {
            const m = await import('./services/backendService');
            const book = await m.fetchAlbumById(p.content.id).catch(() => null);
            if (book) {
              setPartyIdForReader(partyParam);
              setSelectedBook(book);
              setView('BOOK_READER');
              document.title = `Read-Along · ${book.title} | Plajah`;
            }
          } else if (p && p.isActive !== false && p.kind === 'LISTEN') {
            const m = await import('./services/backendService');
            const alb = await m.fetchAlbumById(p.content.id).catch(() => null);
            if (alb) {
              setPartyIdForAlbum(partyParam);
              setSelectedAlbum(alb);
              setView('PLAYER');
              document.title = `Listening Party · ${alb.title} | Plajah`;
            }
          }
          setIsLoading(false);
        }).catch(() => setIsLoading(false));
        return;
      }

      if (projectId) {
        if (shareType === 'video') {
          import('./services/backendService').then(async (m) => {
            try {
               // Fetch the EXACT video by id (fetchAllVideos is only the recent-50).
               const video = await m.fetchVideoById(projectId);
               setIsPublicView(true);
               if (video) {
                 document.title = `${video.title} | Plajah`;
                 // Reello (UGC) videos play in the Rello feed at that video; every
                 // other video opens the full-screen single-video PLAYER (the VIDEOS
                 // view is only the browse grid). Either way, land ON the asset.
                 if (video.isRello) {
                   setRelloInitialVideoId(video.id);
                   setView('RELLO');
                 } else {
                   setSelectedVideo(video);
                   setView('PLAYER');
                 }
               } else {
                 // Unknown/removed — open Rello and let it try to fetch by id.
                 setRelloInitialVideoId(projectId);
                 setView('RELLO');
               }
            } catch(e) {}
          });
          setIsLoading(false);
          return;
        } else if (shareType === 'movie') {
          // A shared Taleo film/TV title — always lands on the Taleo movie page
          // (MOVIE_UX). Reconstruct it from wherever it lives: creator film (album),
          // a movie-category video, or an archive title.
          import('./services/backendService').then(async (m) => {
            try {
              let it: any = await fetchProjectFromCloud(projectId).catch(() => null);
              if (!it) it = await m.fetchVideoById(projectId).catch(() => null);
              if (!it) { try { const arch = await import('./services/archiveContentService'); it = await arch.fetchArchiveVideoById(projectId); } catch {} }
              if (it) {
                setSelectedMovieItem(it);
                setIsPublicView(true);
                setView('MOVIE_UX');
                document.title = `${it.title} | Plajah`;
              }
            } catch {}
          });
          setIsLoading(false);
          return;
        } else if (shareType === 'videoPlaylist') {
          // A shared video playlist — open Reello (VIDEOS) and jump straight to it.
          setVideoPlaylistInitialId(projectId);
          setIsPublicView(true);
          setView('VIDEOS');
          document.title = 'Playlist | Plajah';
          setIsLoading(false);
          return;
        } else if (shareType === 'feed') {
          setView('FEED');
          setIsLoading(false);
          return;
        } else if (shareType === 'book') {
          const remoteAlbum = await fetchProjectFromCloud(projectId);
          if (remoteAlbum) {
            setSelectedBook(remoteAlbum); setView('BOOK_READER'); setIsPublicView(true);
            document.title = `${remoteAlbum.title} | Plajah`;
          }
          setIsLoading(false);
          return;
        } else if (shareType === 'article') {
          import('./services/backendService').then(async (m) => {
            try { const a = await m.fetchArticleById(projectId); if (a) { setSelectedArticle(a); setView('ARTICLE_VIEW'); setIsPublicView(true); document.title = `${a.title} | Plajah`; } } catch {}
          });
          setIsLoading(false);
          return;
        } else if (shareType === 'game') {
          import('./services/backendService').then(async (m) => {
            try { const games = await m.fetchGames(); const g = games.find((x: any) => x.id === projectId); if (g) { setSelectedGame(g); setView('GAME_PLAYER'); setIsPublicView(true); document.title = `${g.title} | Plajah`; } } catch {}
          });
          setIsLoading(false);
          return;
        } else if (shareType === 'archive') {
          // A shared archive film (Taleo) — reconstruct the item from its archive.org id.
          import('./services/archiveContentService').then(async (m) => {
            try { const item = await m.fetchArchiveVideoById(projectId); if (item) { setSelectedMovieItem(item); setView('MOVIE_UX'); setIsPublicView(true); document.title = `${item.title} | Plajah`; } } catch {}
          });
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
            document.title = `${remoteAlbum.title} | Plajah`;
            const isUnreleased = remoteAlbum.isScheduled && remoteAlbum.releaseDate && remoteAlbum.releaseDate > Date.now();
            if (isUnreleased) {
              setCountdownInitialAlbum(remoteAlbum);
              setCountdownAlbumId(remoteAlbum.id);
            } else {
              setSelectedAlbum(remoteAlbum);
              setView('PLAYER');
              setIsPublicView(true);
              // Shared a specific track → show the 5s auto-play countdown for it.
              const sharedTrackId = params.get('track');
              const sharedTrack = sharedTrackId ? (remoteAlbum.tracks || []).find((t: any) => t.id === sharedTrackId) : null;
              if (sharedTrack) setAutoPlayShare({ album: remoteAlbum, track: sharedTrack });
            }
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

      // Handle release landing page deep-links: /release/:albumId
      if (pathParts[1] === 'release' && pathParts[2]) {
        const releaseAlbumId = pathParts[2];
        setCountdownAlbumId(releaseAlbumId);
        setIsLoading(false);
        return;
      }

      // Event deep-links: /event/:eventId
      if (pathParts[1] === 'event' && pathParts[2]) {
        setSelectedEventId(pathParts[2]);
        setView('EVENT_DETAIL');
        setIsLoading(false);
        return;
      }

      await loadAlbums();
      setIsLoading(false);
    };

    init();
  }, []);

  // Measure what this device can actually render, then re-render once the verdict lands so a
  // capable machine UPGRADES out of its conservative provisional tier. Self-defers to idle
  // after first paint, so it never competes with startup.
  const [, setPerfTick] = useState(0);
  useEffect(() => {
    measurePerfTier();
    return subscribePerfTier(() => setPerfTick(t => t + 1));
  }, []);

  // Is the CURRENT view one we refuse to open on a TV? Computed once per render and used both
  // to suppress the real component and to render the explanation in its place, so the two can
  // never disagree (a mounted studio behind a notice, or a notice over a working screen).
  const tvBlocked = getPlatformInfo().isTV ? TV_BLOCKED_VIEWS[view] : undefined;

  // CSS-level blur kill switch. index.css has ~30 backdrop-filter declarations, many !important,
  // that no component-level gate can reach — and backdrop-filter is the single worst offender on
  // a TV compositor. One class on <html> lets one stylesheet rule switch them all off.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('perf-no-blur', !shouldEnableEffect('blur'));
    root.classList.toggle('perf-low', getPerfTier() === 'low');
  });

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
    // Preserve has-custom-background — className= replaces everything,
    // so we re-add it after the theme class is applied.
    const hadCustomBg = document.body.classList.contains('has-custom-background');
    // Hard TV-first: on a television the big-screen theme is the ONLY theme. Anything that
    // tries to set a phone/desktop theme (a resize handler, a restored preference, a stray
    // setTheme) is overridden here rather than at each call site, so a remote can never end
    // up driving a touch layout.
    const platform = getPlatformInfo();
    // Themes are desktop personalisation. A TV gets one high-contrast look built for distance
    // viewing — and pinning it means the alternate themes' gradients and background media are
    // never requested at all, which on a 2GB TV matters more than the styling does.
    document.body.className = platform.isTV || !themesAllowed() ? 'theme-big-screen' : themeClasses[theme];
    if (hadCustomBg) document.body.classList.add('has-custom-background');
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

  // Insert + 1-4 hot switch handler
  useEffect(() => {
    if (!user) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Insert') { insertPressedRef.current = true; return; }
      if (insertPressedRef.current && ['1','2','3','4'].includes(e.key)) {
        e.preventDefault();
        const slot = parseInt(e.key) as 1|2|3|4;
        const target = linkedAccounts.find(a => a.slot === slot);
        if (!target || target.uid === user.uid) return;
        setHotSwitchSlot(slot);
        if (hotSwitchTimerRef.current) clearTimeout(hotSwitchTimerRef.current);
        hotSwitchTimerRef.current = setTimeout(() => setHotSwitchSlot(null), 2000);
        // Trigger account switch via Google, pre-selecting this slot's account.
        loginWithGoogle(target.email).then(() => {
          setHotSwitchSlot(null);
        }).catch(() => setHotSwitchSlot(null));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Insert') insertPressedRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [user, linkedAccounts]);

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
    // Publishing runs in the BACKGROUND now (the creator closes on submit and the
    // upload finishes in the tray). So this fires when a background job completes —
    // surface the result QUIETLY and never hijack navigation (the user may be
    // elsewhere). Ignore non-album results (e.g. a Reello Video, which already
    // lives in its own collection) so we don't push a malformed album into PREVIEW.
    const item = newAlbum as any;
    if (!item || !item.id || !item.type || !Array.isArray(item.tracks)) {
      if (editingAlbum) setEditingAlbum(null);
      return;
    }
    setAlbums(prev => prev.some(a => a.id === item.id) ? prev.map(a => a.id === item.id ? newAlbum : a) : [newAlbum, ...prev]);
    // If the user is currently viewing this album (PlayerView renders selectedAlbum),
    // refresh it too — otherwise edits (e.g. renamed tracks) don't appear until refetch.
    setSelectedAlbum(prev => (prev && prev.id === item.id ? newAlbum : prev));
    if (editingAlbum) setEditingAlbum(null);
  };

  const handleDeleteAlbum = async (id: string) => {
    await deleteCloudAlbum(id);
    setAlbums(albums.filter(a => a.id !== id));
    setShowDeleteConfirm(null);
  };

  const handleShareAlbum = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Direct link to the album itself — not `${pathname}?id=` (which was often the
    // homepage). buildShareUrl produces a URL the boot handler opens straight onto it.
    navigator.clipboard.writeText(buildShareUrl('album', id));
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

  // Back from a Chora album → the main Chora page (also the fallback when the album
  // was opened directly from a shared link, where there's no in-app history to pop).
  const handleBackToChora = () => {
    setSelectedAlbum(null);
    setSelectedGame(null);
    setSelectedVideo(null);
    setSelectedBook(null);
    setPartyIdForAlbum(null);
    if (isPublicView) setIsPublicView(false);
    setView('MUSIC', isPublicView ? '/' : undefined);
    loadAlbums();
  };

  const [visitedProfile, setVisitedProfile] = useState<UserProfile | null>(null);

  const handleVisitUser = async (uid: string, initialTab?: string) => {
    // Audius artists live off-platform — route to the Audius artist landing page.
    if (uid && uid.startsWith('audius:')) {
      const id = uid.replace(/^audius:/, '');
      if (id) {
        const art = await fetchAudiusArtistById(id).catch(() => null);
        if (art) { setAudiusArtist(art); setSelectedAlbum(null); setView('AUDIUS_ARTIST' as AppView); return; }
      }
    }
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

  const handleWelcomePackageDismiss = async () => {
    setShowWelcomePackage(false);
    if (!user) return;
    import('./services/backendService').then(({ updateUserProfile, sendSystemWelcomeDM }) => {
      updateUserProfile(user.uid, { hasSeenWelcomePackage: true, isPioneer: true } as any).catch(() => {});
      sendSystemWelcomeDM(user.uid, user.displayName || 'Creator').catch(() => {});
    });
  };

  const handleNotificationNavigate = async (notif: any) => {
    const link = notif.link as string | undefined;
    const targetId = notif.targetId as string | undefined;
    if (!link) return;

    // Helper: after navigating, fire OPEN_COMMENTS so the player/article scrolls to comments
    const openComments = (id: string) => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('OPEN_COMMENTS', { detail: { targetId: id } }));
      }, 400);
    };

    switch (link) {
      case 'CHAT': setView('CHAT'); break;
      case 'DEBATE_DETAIL':
        if (targetId) {
          // For DEBATE_CHALLENGE notifications, show the VS screen first
          if (notif.type === 'DEBATE_CHALLENGE') {
            window.dispatchEvent(new CustomEvent('CHALLENGE_VS', {
              detail: {
                debateId:       targetId,
                challengerId:   notif.senderId   ?? '',
                challengerName: notif.senderName ?? 'Challenger',
                challengerPhoto: notif.senderPhoto ?? '',
              },
            }));
            // Also navigate so DebateView is ready after VS screen closes
            setSelectedDebateId(targetId);
            setView('DEBATE_DETAIL');
          } else {
            setSelectedDebateId(targetId);
            setView('DEBATE_DETAIL');
          }
        }
        break;
      case 'FEED': setView('FEED'); break;
      case 'LIVE_HUB': setView('LIVE_HUB'); break;
      case 'LIVETALK': setView('LIVE_HUB'); break;

      case 'READ':
        if (targetId) {
          setView('ARTICLES');
          openComments(targetId);
        }
        break;

      case 'ALBUM':
        if (targetId) {
          try {
            // Audius albums (`audius:album:<id>`) live on the network, not Firestore —
            // rehydrate them through the Audius resolver so deep-links/reloads work.
            if (targetId.startsWith('audius:album:')) {
              const { resolveNativeAudiusAlbum } = await import('./services/audiusService');
              const aud = await resolveNativeAudiusAlbum(targetId);
              if (aud) { handleSelectItem(aud); } else { setView('MUSIC'); }
              break;
            }
            const { fetchAlbumById } = await import('./services/backendService');
            const album = await fetchAlbumById(targetId);
            if (album) {
              handleSelectItem(album);
              openComments(targetId);
            } else {
              setView('MUSIC');
            }
          } catch { setView('MUSIC'); }
        }
        break;

      case 'VIDEO':
        if (targetId) {
          try {
            const { fetchVideoById } = await import('./services/backendService') as any;
            const video = fetchVideoById ? await fetchVideoById(targetId) : null;
            if (video) {
              handleSelectItem(video);
              openComments(targetId);
            } else {
              setView('VIDEOS');
            }
          } catch { setView('VIDEOS'); }
        }
        break;

      case 'DISCUSSION': setView('DISCUSSION'); break;

      case 'PROFILE':
        if (targetId) handleVisitUser(targetId);
        else if (notif.senderId) handleVisitUser(notif.senderId);
        break;

      case 'PROFILE_SETTINGS':
        // Relationship request/confirm → open my account settings (relationship section).
        setDashboardInitialTab('ACCOUNT');
        setView('CREATOR');
        break;

      default:
        if (notif.senderId) handleVisitUser(notif.senderId);
        break;
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
    const bgAllowed = activeProfile?.customBgEnabled !== false;
    const themeAllowed = activeProfile?.customThemeEnabled !== false;
    // Only mark the body as having a custom background when something will actually render.
    // bgAllowed: user's frosted/video bg is enabled AND a URL exists
    // themeAllowed: user has an active theme preset with assets
    const hasBg =
      (bgAllowed && !!(activeProfile?.frostedBackground || activeProfile?.videoBackgroundUrl)) ||
      (themeAllowed && !!(activeTheme?.assets?.length));
    if (hasBg) {
      document.body.classList.add('has-custom-background');
    } else {
      document.body.classList.remove('has-custom-background');
    }
  }, [view, visitedProfile, userProfile, activeTheme]);

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

  // Build the ad slot pool once on mount — profiles + latest album + custom user ads
  useEffect(() => {
    fetchFeaturedProfiles().then(async profiles => {
      const seed = Math.floor(Date.now() / 86400000);
      const shuffled = [...profiles].sort((a, b) => {
        const ha = (a.uid.charCodeAt(0) + seed) % 97;
        const hb = (b.uid.charCodeAt(0) + seed) % 97;
        return ha - hb;
      });
      // Fetch latest album AND custom ad for the first 10 profiles in parallel
      const top = shuffled.slice(0, 10);
      const [albumEntries, adEntries] = await Promise.all([
        Promise.all(top.map(p => fetchLatestAlbumForUser(p.uid).then(a => [p.uid, a] as const))),
        Promise.all(top.map(p => loadUserAd(p.uid).then(a => [p.uid, a] as const))),
      ]);
      const albumMap = new Map(albumEntries.filter(([, a]) => !!a) as [string, import('./types').Album][]);
      const adMap   = new Map(adEntries.filter(([, a]) => !!a)   as [string, import('./types').UserAd][]);

      const slots: AdSlot[] = [{ kind: 'plus' }];
      // A demo product ad in the rotation — shows what advertising your store looks like.
      if (DEMO_STORE_PRODUCTS[0]) slots.push({ kind: 'product', product: DEMO_STORE_PRODUCTS[0] });
      for (const profile of shuffled) {
        const customAd = adMap.get(profile.uid);
        if (customAd) {
          // Custom ad takes precedence — profile slot is skipped, custom_ad is 30 s
          slots.push({ kind: 'custom_ad', ad: customAd, profile });
        } else {
          slots.push({ kind: 'profile', profile });
          const album = albumMap.get(profile.uid);
          if (album) slots.push({ kind: 'album', album, profile });
        }
      }
      setAdSlots(slots);
    }).catch(() => {});
  }, []);

  // Variable-duration timer: profile = 15s, album = 45s, plus = 25s
  useEffect(() => {
    if (adSlots.length === 0) return;
    const current = adSlots[adSlotIdx % adSlots.length];
    const duration = AD_DURATION[current.kind];
    const t = setTimeout(() => setAdSlotIdx(i => i + 1), duration);
    return () => clearTimeout(t);
  }, [adSlotIdx, adSlots]);

  if (isLoading && view !== 'LANDING') {
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
    chosenThemeRef.current = newTheme;
    try { localStorage.setItem('plajah:theme', newTheme); } catch { /* private mode */ }
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
      <FediverseProvider>
      <BadgeProvider>
        <PointsProvider>
          <AchievementProvider>
            <UploadProvider>
              <PublishQueueProvider>
              <NotificationProvider>
                <ActiveIdentityProvider>
                <CallProvider>
                <SpatialProvider initialValue={userProfile?.uiSettings?.isSpatialModeEnabled}>
        <TVNavigationLayer />
        <TooltipSuppressor />
        <ResumeUploadPrompt />
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
          {/* /link is the phone half of TV sign-in, reached by scanning the QR on the television.
              It is tested FIRST, before any view routing, because a fresh page load computes
              view = 'LANDING' — which used to render the marketing page instead, leaving the
              approval screen unreachable and the TV waiting forever. It renders signed-in or
              not; TvLinkApproval itself asks the viewer to sign in when there is no session. */}
          {typeof window !== 'undefined' && window.location.pathname.startsWith('/link') ? (
            <Suspense fallback={null}><TvLinkApproval /></Suspense>
          ) : /* A television never sees the marketing landing page. It gets the sign-in screen a TV
              actually needs — logo, saved profiles, QR — because the alternative is asking
              someone to type a password with a D-pad. */
          view === 'LANDING' && getPlatformInfo().isTV && !user ? (
          <Suspense fallback={null}>
            <TvSignInView
              savedProfiles={(userProfile as any)?.linkedAccounts || []}
              onSignedIn={() => setView(getTvHome() as AppView)}
            />
          </Suspense>
        ) : view === 'LANDING' ? (
          <LandingPage 
            onEnter={handleEnterApp} 
            onVisitUser={handleVisitUser}
          />
        ) : (
          <div className={`h-real-screen w-full flex flex-col lg:flex-row relative z-0 overflow-hidden bg-transparent no-select ${((view === 'USER_PROFILE' ? visitedProfile : userProfile)?.frostedBackground || (view === 'USER_PROFILE' ? visitedProfile : userProfile)?.videoBackgroundUrl) ? 'is-custom-bg' : ''}`}>
            {/* Universal Background Layer — inline styles bypass CSS/Tailwind layer conflicts */}
            <div
              id="universal-background"
              style={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' }}
            >
              {/* Base theme gradient — always present so the background is never blank */}
              <div
                className="absolute inset-0 transition-all duration-700"
                style={{ background: THEME_BG[theme] ?? THEME_BG.PLAJAH }}
              />
              <AnimatePresence mode="wait">
                {(() => {
                  // A looping video under blur-[40px] plus a full-viewport backdrop-blur is the
                  // single most expensive thing on the page, and TV compositors handle it worst.
                  // The base gradient above stays unconditional, so dropping this is never blank.
                  if (!shouldEnableEffect('customBackground')) return null;
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
                      
                      {videoBackgroundFrosted !== false && shouldEnableEffect('blur') && (
                        <div className="absolute inset-0 backdrop-blur-[100px] bg-black/30" />
                      )}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>

            {shouldEnableEffect('visualizer') && <BackgroundFrequencyGraph />}

            {theme === 'CITRUS' && shouldEnableEffect('parallax') && <CitrusWaterDrops />}
            {theme === 'NEBULA' && (
              <>
                {shouldEnableEffect('parallax') && <NebulaBackground />}
                {view !== 'VIDEOS' && view !== 'MOVIES_TV' && view !== 'MOVIE_UX' && view !== 'PLAYER' && view !== 'AVATAR_STUDIO' && (
                  shouldEnableEffect('visualizer') && <NebulaVisualizer analyser={analyser} isPlaying={isPlaying} />
                )}
              </>
            )}
            {/* Ad Billboard — full-height canvas. Sits on the LEFT normally; Split (B) AND the
                horizontal Bar (C) move it to the FAR RIGHT (order + left border); Bar makes it
                narrower and drops it below the fixed top nav bar. */}
          {(!isPublicView && view !== 'MOVIE_UX' && view !== 'GAME_PLAYER' && view !== 'EVENT_PHOTO_POOL') && (
            <aside className={`hidden lg:block z-50 shrink-0 overflow-hidden border-white/[0.06] relative ${
              navLayout.isBar
                ? 'lg:order-last border-l lg:w-56 sticky lg:top-14 h-[calc(100vh-3.5rem)]'
                : navLayout.isSplit
                  ? 'lg:order-last border-l lg:w-80 sticky top-0 h-screen'
                  : 'lg:w-80 border-r sticky top-0 h-screen'
            }`}>
              <AnimatePresence mode="sync">
              {(() => {
                const slots = adSlots.length > 0 ? adSlots : [{ kind: 'plus' as const }];
                const currentSlot = slots[adSlotIdx % slots.length];
                const dotTotal = Math.min(slots.length, 7);
                const dotActive = adSlotIdx % dotTotal;
                const poolSize = dotTotal; // keep for dot rendering compat
                const slot = dotActive;    // keep for dot rendering compat
                const fadeS = AD_CROSSFADE_MS / 1000;

                /* ── Compute slot content, then crossfade-wrap ── */
                let slotContent: React.ReactNode;

                if (currentSlot.kind === 'custom_ad') {
                  slotContent = (
                    <Suspense fallback={null}>
                      <AdBillboardRenderer
                        ad={currentSlot.ad}
                        profile={currentSlot.profile}
                        onVisitProfile={handleVisitUser}
                        onOpenAsset={ad => {
                          if (ad.promotedAssetId && ad.promotedType === 'MUSIC') {
                            const fullAlbum = albums.find(a => a.id === ad.promotedAssetId) || { id: ad.promotedAssetId, title: ad.promotedAssetTitle, coverImage: ad.promotedAssetImageUrl } as any;
                            setSelectedAlbum(fullAlbum);
                            setView('PLAYER');
                          }
                        }}
                        dotCount={dotTotal}
                        dotIdx={dotActive}
                      />
                    </Suspense>
                  );
                } else if (currentSlot.kind === 'album') {
                  slotContent = (
                    <Suspense fallback={null}>
                      <AlbumAdBillboard
                        album={currentSlot.album}
                        profile={currentSlot.profile}
                        onOpenAlbum={album => { setSelectedAlbum(album); setView('PLAYER'); }}
                        dotCount={dotTotal}
                        dotIdx={dotActive}
                      />
                    </Suspense>
                  );
                } else if (currentSlot.kind === 'product') {
                  const pr = currentSlot.product;
                  slotContent = (
                    <button
                      key="demo-product-ad"
                      onClick={() => { setViewedUserId(DEMO_STORE_ID); setView('STORE'); }}
                      className="group relative block w-full h-full text-left overflow-hidden cursor-pointer"
                    >
                      <img src={pr.images[0]} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1200ms]" alt="" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      <div className="absolute top-3 left-3">
                        <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[8px] font-black uppercase tracking-widest text-small-orange border border-small-orange/30">Demo · Sponsored</span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-small-orange mb-1">In the store</p>
                        <p className="text-white font-black text-lg leading-tight line-clamp-2 mb-1.5">{pr.title}</p>
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-white font-black text-base tabular-nums">${pr.price.toFixed(2)}</span>
                          {pr.compareAt && <span className="text-white/40 line-through text-xs tabular-nums">${pr.compareAt.toFixed(2)}</span>}
                          <span className="text-[9px] text-white/50">★ {pr.rating.toFixed(1)} ({pr.reviewCount})</span>
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest group-hover:scale-105 transition-transform">Shop now →</span>
                      </div>
                    </button>
                  );
                } else if (currentSlot.kind !== 'profile') {
                  /* ── Plajah+ subscription tiers billboard ── */
                  slotContent = (
                    <button
                      key="plajah-plus-ad"
                      onClick={() => setShowPlajahPlusBillboard(true)}
                      className="group relative block w-full h-full text-left cursor-pointer"
                    >
                      {/* Background: loop a video from the ad pool if available, else dark gradient */}
                      {(() => {
                        const videoSlot = adSlots.find(s => s.kind === 'custom_ad' && (s as any).ad?.backgroundType === 'video' && (s as any).ad?.backgroundUrl)
                          || adSlots.find(s => s.kind === 'album' && (s as any).album?.tracks?.find((t: any) => t.videoUrl));
                        const videoUrl = videoSlot?.kind === 'custom_ad' ? (videoSlot as any).ad.backgroundUrl
                          : videoSlot?.kind === 'album' ? (videoSlot as any).album.tracks.find((t: any) => t.videoUrl)?.videoUrl
                          : null;
                        return videoUrl ? (
                          <video src={videoUrl} autoPlay muted loop playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{ filter: 'brightness(0.15) saturate(0.7)' }} />
                        ) : null;
                      })()}
                      <div className="absolute inset-0 bg-[#080008]" style={{ opacity: adSlots.some(s => s.kind === 'custom_ad') ? 0.6 : 1 }} />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(255,140,0,0.18)_0%,transparent_55%)]" />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_55%,rgba(107,0,153,0.22)_0%,transparent_55%)]" />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_90%,rgba(212,0,85,0.22)_0%,transparent_50%)]" />

                      {/* System message */}
                      <div className="absolute top-0 left-0 right-0 z-20">
                        <SystemMessageBanner />
                      </div>

                      {/* Plajah+ badge */}
                      <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
                        <span className="flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[7px] font-black uppercase tracking-[0.35em] text-white/50">
                          <Sparkles size={7} className="text-[#FF8C00]" /> Plajah+
                        </span>
                      </div>

                      {/* Main content — vertically centered */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-5 gap-3.5">

                        {/* Wordmark */}
                        <div className="text-center mb-1">
                          <p className="text-[32px] font-black tracking-tight text-white leading-none">
                            Plajah<span style={{ background: 'linear-gradient(90deg,#D40055,#FF8C00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>+</span>
                          </p>
                          <p className="text-[8px] text-white/35 font-semibold mt-2 max-w-[190px] mx-auto leading-[1.6] italic">
                            "the only subscription service where the creators get more than the platform"
                          </p>
                        </div>

                        {/* Tier 1 — Starter (least, at top) */}
                        <div className="w-full rounded-2xl border border-[#FF8C00]/25 bg-[#FF8C00]/8 p-3.5 group-hover:border-[#FF8C00]/40 transition-colors">
                          <div className="flex items-start justify-between mb-1.5">
                            <div>
                              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#FF8C00] mb-0.5">Starter</p>
                              <p className="text-[22px] font-black text-white leading-none">$4.99<span className="text-[10px] font-medium text-white/35">/mo</span></p>
                            </div>
                            <div className="text-right pt-0.5">
                              <p className="text-[6.5px] uppercase tracking-widest text-white/25 mb-0.5">creator gets</p>
                              <p className="text-[13px] font-black text-green-400 leading-none">$3.00</p>
                              <p className="text-[6px] text-white/20 mt-0.5">platform: $1.99</p>
                            </div>
                          </div>
                          <p className="text-[7.5px] text-white/40 leading-relaxed">50 GB storage · 100 pts/mo · 10% off everything</p>
                        </div>

                        {/* Tier 2 — Pro (mid) */}
                        <div className="w-full rounded-2xl border border-[#6B0099]/45 bg-[#6B0099]/12 p-3.5 ring-1 ring-[#6B0099]/20 group-hover:border-[#6B0099]/60 transition-colors">
                          <div className="flex items-start justify-between mb-1.5">
                            <div>
                              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#9B59B6] mb-0.5">Pro</p>
                              <p className="text-[22px] font-black text-white leading-none">$9.99<span className="text-[10px] font-medium text-white/35">/mo</span></p>
                            </div>
                            <div className="text-right pt-0.5">
                              <p className="text-[6.5px] uppercase tracking-widest text-white/25 mb-0.5">creator gets</p>
                              <p className="text-[13px] font-black text-green-400 leading-none">$7.00</p>
                              <p className="text-[6px] text-white/20 mt-0.5">platform: $2.99</p>
                            </div>
                          </div>
                          <p className="text-[7.5px] text-white/40 leading-relaxed">75 GB · 300 pts/mo · 15% off · TV & Pay-Per-View</p>
                        </div>

                        {/* Tier 3 — Elite (highest, at bottom) */}
                        <div className="w-full rounded-2xl border border-[#D40055]/35 bg-[#D40055]/8 p-3.5 group-hover:border-[#D40055]/55 transition-colors">
                          <div className="flex items-start justify-between mb-1.5">
                            <div>
                              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#D40055] mb-0.5">Elite</p>
                              <p className="text-[22px] font-black text-white leading-none">$14.99<span className="text-[10px] font-medium text-white/35">/mo</span></p>
                            </div>
                            <div className="text-right pt-0.5">
                              <p className="text-[6.5px] uppercase tracking-widest text-white/25 mb-0.5">creator gets</p>
                              <p className="text-[13px] font-black text-green-400 leading-none">$11.00</p>
                              <p className="text-[6px] text-white/20 mt-0.5">platform: $3.99</p>
                            </div>
                          </div>
                          <p className="text-[7.5px] text-white/40 leading-relaxed">100 GB · 1,000 pts/mo · 20% off · Max promo boost</p>
                        </div>

                        {/* CTA */}
                        <div className="mt-1 px-7 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white transition-all"
                          style={{ background: 'linear-gradient(90deg,#D40055,#6B0099,#FF8C00)', boxShadow: '0 0 20px rgba(212,0,85,0.35)' }}>
                          Subscribe →
                        </div>
                      </div>

                      {/* Dot indicators */}
                      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
                        {Array.from({ length: Math.min(poolSize, 7) }).map((_, i) => (
                          <span key={i} className="rounded-full transition-all duration-300"
                            style={{ width: i === slot % Math.min(poolSize, 7) ? '16px' : '5px', height: '5px', background: i === slot % Math.min(poolSize, 7) ? '#ff8c00' : 'rgba(255,255,255,0.2)' }} />
                        ))}
                      </div>
                    </button>
                  );

                /* ── User profile billboard ── */
                } else {
                const profile = currentSlot.profile;
                slotContent = (
                  <div key={`profile-ad-${profile.uid}`} className="relative w-full h-full group">

                    {/* Cover art fills entire billboard, auto-cropped center */}
                    {profile.coverArt ? (
                      <img
                        src={profile.coverArt}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-[8s] group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{ background: `linear-gradient(180deg, ${profile.brandColor || '#1a0035'} 0%, #0a0a0a 100%)` }}
                      />
                    )}

                    {/* Cinematic gradient scrims: heavy at bottom for legibility, light at top */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/50" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />

                    {/* Sponsored label — top-center */}
                    <div className="absolute top-4 left-0 right-0 flex justify-center z-10">
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-black/50 backdrop-blur-md border border-white/10 rounded-full text-[7px] font-black uppercase tracking-[0.35em] text-white/45">
                        <Sparkles size={7} /> Featured Creator
                      </span>
                    </div>

                    {/* System message at very top */}
                    <div className="absolute top-0 left-0 right-0 z-20">
                      <SystemMessageBanner />
                    </div>

                    {/* Avatar — centered horizontally, sits at ~40% from top */}
                    <div className="absolute inset-0 flex flex-col items-center" style={{ paddingTop: '38%' }}>
                      <button
                        onClick={() => handleVisitUser(profile.uid)}
                        className="relative w-24 h-24 rounded-full overflow-hidden ring-[3px] ring-white/30 hover:ring-small-orange transition-all duration-300 shadow-[0_0_40px_rgba(0,0,0,0.8)] hover:scale-105 active:scale-95"
                        title={`Visit ${profile.displayName}'s profile`}
                      >
                        <img
                          src={profile.photoURL}
                          alt={profile.displayName}
                          className="w-full h-full object-cover"
                        />
                        {/* Subtle inner glow ring on hover */}
                        <div className="absolute inset-0 rounded-full border border-white/20" />
                      </button>
                    </div>

                    {/* Name, bio, follower count — anchored to bottom */}
                    <div className="absolute bottom-0 left-0 right-0 px-6 pb-16 text-center">
                      <p className="text-xl font-black uppercase tracking-tight text-white leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                        {profile.displayName}
                      </p>
                      {profile.bio && (
                        <p className="text-[10px] text-white/45 font-medium mt-2 leading-relaxed line-clamp-3 max-w-[220px] mx-auto">
                          {profile.bio}
                        </p>
                      )}
                      {profile.followerCount > 0 && (
                        <p className="text-[9px] text-small-orange font-black uppercase tracking-[0.3em] mt-3">
                          {profile.followerCount >= 1000
                            ? `${(profile.followerCount / 1000).toFixed(1)}k`
                            : profile.followerCount} followers
                        </p>
                      )}
                      <button
                        onClick={() => handleVisitUser(profile.uid)}
                        className="mt-4 px-6 py-2 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white hover:text-black text-white rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-300"
                      >
                        View Profile
                      </button>
                    </div>

                    {/* Pill dots — just above the bottom text */}
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
                      {Array.from({ length: Math.min(poolSize, 7) }).map((_, i) => (
                        <span key={i} className="rounded-full transition-all duration-300"
                          style={{ width: i === slot % Math.min(poolSize, 7) ? '16px' : '5px', height: '5px', background: i === slot % Math.min(poolSize, 7) ? '#ff8c00' : 'rgba(255,255,255,0.2)' }} />
                      ))}
                    </div>
                  </div>
                ); // end profile slotContent
                } // end else

                return (
                  <motion.div
                    key={adSlotIdx}
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: fadeS, ease: 'linear' }}
                  >
                    {slotContent}
                  </motion.div>
                );
              })()}
              </AnimatePresence>
            </aside>
          )}

          {/* Concept C — horizontal top bar for touch tablets / portrait (fixed chrome) */}
          {(!isPublicView && !navLayout.isPhone && navLayout.isBar) && (
            <ChoraNavBar
              pages={barPages}
              activeView={view}
              onNavigate={(id) => setView(id as AppView)}
              onMore={() => setView('DASHBOARD')}
              onCreate={() => setShowCreator(true)}
              switcher={<NavLayoutSwitcher pref={navLayout.pref} onSetPref={navLayout.setPref} compact />}
            />
          )}

          {/* Transient red warning toast (e.g. nano view blocked in bar mode) */}
          {navWarning && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-600/90 backdrop-blur-xl border border-red-400/40 shadow-2xl animate-in fade-in slide-in-from-top-2"
                 role="alert" style={{ top: 'calc(3.5rem + env(safe-area-inset-top) + 0.5rem)' }}>
              <AlertTriangle size={13} className="text-white shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-widest text-white">{navWarning}</span>
            </div>
          )}

          {(!isPublicView && !isMobile && theme !== 'PHONE' && !navLayout.isBar) && (
            <aside className={`${isSidebarCollapsed ? 'w-24' : (theme === 'BIG_SCREEN' ? 'w-24 hover:w-80' : (navLayout.isSlim || navLayout.isSplit) ? 'w-52' : 'w-80')} border-r border-white/[0.07] hidden lg:flex flex-col ${(navLayout.isSlim || navLayout.isSplit) && !isSidebarCollapsed ? 'p-3 lg:p-4' : 'p-4 lg:p-6'} sticky top-0 h-screen glass-high transition-colors duration-300 group/sidebar z-50 overflow-x-hidden shrink-0`}>
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

              {/* ── Universal Sidebar Search ── */}
              <SidebarSearch
                isSidebarCollapsed={isSidebarCollapsed}
                theme={theme}
                onVisitUser={handleVisitUser}
                onSelectItem={handleSelectItem}
                onSelectArticle={(article) => { setSelectedArticle(article); setView('ARTICLE_VIEW'); }}
                onSelectGame={handleSelectGame}
                onSelectView={(v) => setView(v as any)}
                onSelectLiveFeed={setActiveLiveFeed}
              />

              {/* ── Sidebar Mode Toggle ── */}
              <div className={`flex items-center justify-center gap-1.5 py-2 mb-1 ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:flex' : 'flex')}`}>
                {([
                  { mode: 'og' as const, icon: AlignJustify, label: 'Default List' },
                  { mode: 'grouped' as const, icon: Layers, label: 'Grouped Sections' },
                  { mode: 'pinned' as const, icon: Pin, label: 'Pinned Favorites' },
                ] as const).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => { setSidebarMode(mode); localStorage.setItem('plajah_sidebar_mode_v1', mode); setShowMoreDrawer(false); }}
                    title={label}
                    className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200 ${
                      sidebarMode === mode
                        ? 'bg-white text-black shadow-lg'
                        : 'text-white/30 hover:text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <Icon size={13} />
                  </button>
                ))}
              </div>

              {/* ── Nav Layout control (Concept A↔C responsive + Split opt-in) ── */}
              <div className={`flex items-center justify-center gap-1 pb-2 mb-1 ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:flex' : 'flex')}`}>
                <NavLayoutSwitcher pref={navLayout.pref} onSetPref={navLayout.setPref} compact />
              </div>

              {sidebarMode === 'og' && <nav className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar overflow-x-hidden w-full">
                {(() => {
                  const baseConfig = [
                    { id: 'USER_PROFILE', order: 0, isVisible: true },
                    { id: 'DASHBOARD', order: 1, isVisible: true },
                    { id: 'WORLDS', order: 1.5, isVisible: true },
                    { id: 'MUSIC', order: 2, isVisible: true },
                    { id: 'VIDEOS', order: 3, isVisible: true },
                    { id: 'MOVIES_TV', order: 4.5, isVisible: true },
                    { id: 'PLAJAH_SPORTS', order: 4, isVisible: true },
                    { id: 'HEALTH_FITNESS', order: 4.3, isVisible: true },
                    { id: 'ARTICLES', order: 5, isVisible: true },
                    { id: 'BOOKS', order: 6, isVisible: true },
                    { id: 'PLAJAH_LABS', order: 6.5, isVisible: true },
                    { id: 'RADIO', order: 7, isVisible: true },
                    { id: 'APPS', order: 8.5, isVisible: true },
                    { id: 'CROSSOVER', order: 8.6, isVisible: crossoverSystemEnabled },
                    { id: 'GAMES', order: 4.5, isVisible: true },
                    { id: 'CLUBS', order: 0.5, isVisible: true },
                    { id: 'CHARITY', order: 11, isVisible: true },
                    { id: 'PLAJAH_ELEVATE', order: 10.8, isVisible: true },
                    { id: 'SANCTUARY_HUB', order: 10, isVisible: true },
                    { id: 'STORE_HUB', order: 10.5, isVisible: true },
                    { id: 'CLASSROOMS', order: 12, isVisible: true },
                    { id: 'GLOBAL_PHOTOS', order: 14, isVisible: true },
                    { id: 'PAY_IT_FORWARD', order: 16, isVisible: true },
                    { id: 'CHAT', order: 17, isVisible: true },
                    { id: 'DISCUSSION', order: 17.5, isVisible: true },
                    { id: 'FEED', order: 0.1, isVisible: true },
                    { id: 'LIVE_HUB', order: 19, isVisible: true },
                    { id: 'FABULA', order: 19.05, isVisible: true },
                    { id: 'TV_STUDIO', order: 19.1, isVisible: true },
                    { id: 'MEDIA_ROUTER', order: 19.15, isVisible: true },
                    { id: 'POSTMAN', order: 19.5, isVisible: true },
                    { id: 'SEARCH', order: 20, isVisible: true },
                    { id: 'HELP_CENTER', order: 21, isVisible: true },
                    { id: 'BROWSER', order: 22, isVisible: true },
                    ...(user ? [
                      { id: 'PLAJAH_STUDIO', order: 9.4, isVisible: true },
                      { id: 'BUSINESS_DASHBOARD', order: 9.5, isVisible: true },
                      { id: 'TERRA', order: 9.55, isVisible: true },
                      { id: 'AD_PACKAGES', order: 9.6, isVisible: true },
                      { id: 'ARTIST_MANAGER', order: 9.7, isVisible: true },
                    ] : [])
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
                        PLAJAH_SPORTS: { label: 'Plajah Sports', icon: Zap },
                        HEALTH_FITNESS: { label: 'Health & Fitness', icon: Activity },
                        ARTICLES: { label: 'The Newstand', icon: Newspaper },
                        BOOKS: { label: 'Lorea', icon: BookOpen },
                        PLAJAH_LABS: { label: 'Plajah Labs', icon: FlaskConical },
                        RADIO: { label: 'Radio', icon: Radio },
                        LIVE_TV: { label: 'Live TV', icon: Tv },
                        APPS: { label: 'Apps', icon: AppWindow },
                        CROSSOVER: { label: 'Crossover', icon: Repeat },
                        GAMES: { label: 'Games', icon: Gamepad2 },
                        CLUBS: { label: 'Clubs', icon: Users },
                        CHARITY: { label: 'Charity', icon: Heart },
                        PLAJAH_ELEVATE: { label: 'Plajah Elevate', icon: Landmark },
                        SANCTUARY_HUB: { label: 'Sanctuary', icon: Shield },
                        STORE_HUB: { label: 'Plajah Store', icon: ShoppingBag },
                        CLASSROOMS: { label: 'Plajah Academia', icon: GraduationCap },
                        PPV_EVENTS: { label: 'Live Events', icon: Ticket },
                        GLOBAL_PHOTOS: { label: 'Photos', icon: Camera },
                        PAY_IT_FORWARD: { label: 'Pay It Forward', icon: Heart },
                        CHAT: { label: 'Chat', icon: MessageSquare },
                        DISCUSSION: { label: 'Discussion', icon: MessageCircle },
                        POSTMAN: { label: 'The Postman', icon: Mail },
                        FEED: { label: 'Plajah Social', icon: Rss },
                        LIVE_HUB: { label: 'Live Hub', icon: Sparkles },
                        FABULA: { label: 'Fabula', icon: Film },
                        TV_STUDIO: { label: 'TV Studio', icon: Clapperboard },
                        MEDIA_ROUTER: { label: 'Router & Switcher', icon: Cctv },
                        SEARCH: { label: 'Find People', icon: Search },
                        HELP_CENTER: { label: 'Help Center', icon: HelpCircle },
                        ADMIN_AD_DASHBOARD: { label: 'Ad Platform', icon: Megaphone },
                        PARTNER_DASHBOARD: { label: 'Partner Portal', icon: Database },
                        BROWSER: { label: 'Partner Sites', icon: Monitor },
                        BUSINESS_DASHBOARD: { label: 'Plajah Business', icon: Briefcase },
                        TERRA: { label: 'Terra', icon: MapPin },
                        AD_PACKAGES: { label: 'Promote', icon: TrendingUp },
                        ARTIST_MANAGER: { label: 'Artist Manager', icon: Music2 },
                        PLAJAH_STUDIO: { label: 'Creator Tool Bag', icon: Sparkles },
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
                        PLAJAH_LABS: "Science, engineering, and academia hub — research tools, STEM classrooms, and peer discussion.",
                        RADIO: "Tune into live artist stations and curated broadcasts.",
                        LIVE_TV: "Watch continuous video streams and live FAST channels.",
                        APPS: "Install and run community web applications and tools.",
                        CROSSOVER: "Convert video, audio, and images into almost any format - hardware-accelerated, no paid encoders.",
                        GAMES: "Play interactive web games directly in your browser.",
                        CLUBS: "Join free community groups based on shared interests.",
                        CHARITY: "Support non-profits and explore fundraising campaigns.",
                        PLAJAH_ELEVATE: "The directory for churches, religious organizations, cultural institutions, and nonprofits.",
                        SANCTUARY_HUB: "Support your favorite creators with exclusive memberships, private content, and more.",
                        STORE_HUB: "Shop merch, collectibles, and digital goods from artists across the platform.",
                        CLASSROOMS: "Plajah Academia — world history, architecture, interactive modules, and expert-led classes.",
                        PPV_EVENTS: "Join live pay-per-view events and exclusive broadcasts.",
                        GLOBAL_PHOTOS: "Explore photos, art gallery views, event albums, imports, portfolios, and spatial media.",
                        PAY_IT_FORWARD: "Support the community through our unique giving platform.",
                        CHAT: "Connect with artists and fans in private or group chats.",
                        DISCUSSION: "Join community discussion boards and open forums.",
                        POSTMAN: "Access the formal AI-Studio dispatch system.",
                        FEED: "See the latest updates and posts from everyone you follow.",
                        LIVE_HUB: "Discover what's happening live on the platform right now.",
                        TV_STUDIO: "Browser-based TV production switcher — cameras, graphics, audio mixing, lighting, NDI, EDL export.",
                        SEARCH: "Find specific artists, albums, or content.",
                        HELP_CENTER: "Access documentation, tutorials, and platform guides.",
                        ADMIN_AD_DASHBOARD: "Manage platform advertisements and promotions.",
                        PARTNER_DASHBOARD: "Configure cloud storage and partner integrations.",
                        BROWSER: "Access partner websites (Impact, Mainstreem) inside Plajah without iframe restrictions.",
                        BUSINESS_DASHBOARD: "Browse all businesses and brands on Plajah, or manage your own business dashboard.",
                        AD_PACKAGES: "Boost your content visibility with ad packages and off-platform promotions.",
                        ARTIST_MANAGER: "Manage band payroll, contracts, invoices, tasks, vendors, venues, events, visual boards, and all your ads from one place."
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
                              } else if (config.id === 'PLAJAH_SPORTS') {
                                setView('PLAJAH_SPORTS');
                              } else if (config.id === 'ADMIN_AD_DASHBOARD') {
                                setView('ADMIN_AD_DASHBOARD');
                              } else if (config.id === 'PARTNER_DASHBOARD') {
                                setView('PARTNER_DASHBOARD');
                              } else if (config.id === 'BUSINESS_DASHBOARD') {
                                setView('PLAJAH_BUSINESS');
                              } else if (config.id === 'AD_PACKAGES') {
                                setView('AD_PACKAGES');
                              } else if (config.id === 'ARTIST_MANAGER') {
                                setView('ARTIST_MANAGER');
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
                            <span className={`text-[12.5px] uppercase tracking-widest text-center flex-1 transition-all duration-300 whitespace-nowrap opacity-0
                              ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'group-hover/sidebar:opacity-100' : 'opacity-100')}
                              ${(view === config.id && (config.id !== 'USER_PROFILE' || viewedUserId === user?.uid)) ? 'font-black' : 'font-black group-hover:font-black'}`}>
                              {item.label}
                            </span>
                          </button>
                        </Tooltip>
                      );
                    });
                })()}
              </nav>}

              {/* ── Grouped Accordion Nav ── */}
              {sidebarMode === 'grouped' && (
                <nav className="flex-1 flex flex-col overflow-y-auto pr-1 custom-scrollbar overflow-x-hidden w-full">
                  {(() => {
                    const allNavItems: { [k: string]: { label: string; icon: any } } = {
                      USER_PROFILE: { label: 'My Profile', icon: User }, DASHBOARD: { label: 'Global Archive', icon: Settings },
                      MUSIC: { label: 'Chora', icon: Music2 }, WORLDS: { label: 'Worlds', icon: Globe },
                      VIDEOS: { label: 'Reello', icon: VideoIcon }, MOVIES_TV: { label: 'Taleo', icon: Film },
                      PLAJAH_SPORTS: { label: 'Plajah Sports', icon: Zap }, HEALTH_FITNESS: { label: 'Health & Fitness', icon: Activity },
                      ARTICLES: { label: 'The Newstand', icon: Newspaper },
                      BOOKS: { label: 'Lorea', icon: BookOpen }, PLAJAH_LABS: { label: 'Plajah Labs', icon: FlaskConical },
                      RADIO: { label: 'Radio', icon: Radio }, APPS: { label: 'Apps', icon: AppWindow }, CROSSOVER: { label: 'Crossover', icon: Repeat },
                      GAMES: { label: 'Games', icon: Gamepad2 }, CLUBS: { label: 'Clubs', icon: Users },
                      CHARITY: { label: 'Charity', icon: Heart }, PLAJAH_ELEVATE: { label: 'Plajah Elevate', icon: Landmark }, SANCTUARY_HUB: { label: 'Sanctuary', icon: Shield },
                      STORE_HUB: { label: 'Plajah Store', icon: ShoppingBag }, CLASSROOMS: { label: 'Plajah Academia', icon: GraduationCap },
                      GLOBAL_PHOTOS: { label: 'Photos', icon: Camera },
                      PAY_IT_FORWARD: { label: 'Pay It Forward', icon: Heart }, CHAT: { label: 'Chat', icon: MessageSquare },
                      DISCUSSION: { label: 'Discussion', icon: MessageCircle }, POSTMAN: { label: 'The Postman', icon: Mail },
                      FEED: { label: 'Plajah Social', icon: Rss }, LIVE_HUB: { label: 'Live Hub', icon: Sparkles },
                      FABULA: { label: 'Fabula', icon: Film }, TV_STUDIO: { label: 'TV Studio', icon: Clapperboard }, MEDIA_ROUTER: { label: 'Router & Switcher', icon: Cctv }, SEARCH: { label: 'Find People', icon: Search },
                      HELP_CENTER: { label: 'Help Center', icon: HelpCircle }, BROWSER: { label: 'Partner Sites', icon: Monitor },
                      BUSINESS_DASHBOARD: { label: 'Plajah Business', icon: Briefcase }, TERRA: { label: 'Terra', icon: MapPin }, AD_PACKAGES: { label: 'Promote', icon: TrendingUp },
                      ARTIST_MANAGER: { label: 'Artist Manager', icon: Music2 },
                      PLAJAH_STUDIO: { label: 'Creator Tool Bag', icon: Sparkles },
                      CREATOR: { label: 'Creator Hub', icon: Clapperboard },
                    };
                    // A television gets five destinations, in TV order. Everything else is
                    // uncontrollable with a remote, meaningless at ten feet, or too costly to
                    // keep resident — and on a 2GB TV, "never mounted" is the cheapest
                    // optimisation available.
                    const navItems: { [k: string]: { label: string; icon: any } } = getPlatformInfo().isTV
                      ? Object.fromEntries(TV_NAV_VIEWS.filter(v => allNavItems[v]).map(v => [v, allNavItems[v]]))
                      : allNavItems;
                    const handleNavClick = (id: string) => {
                      if (id === 'PAY_IT_FORWARD') { setIsPIFModalOpen(true); return; }
                      if (id === 'USER_PROFILE') { if (user) { handleVisitUser(user.uid); } else { loginWithGoogle(); } return; }
                      if (id === 'BUSINESS_DASHBOARD') { setView('PLAJAH_BUSINESS'); return; }
                      if (id === 'AD_PACKAGES') { setView('AD_PACKAGES'); return; }
                      if (id === 'ARTIST_MANAGER') { setView('ARTIST_MANAGER'); return; }
                      setView(id as any);
                    };
                    const isActive = (id: string) => {
                      if (id === 'USER_PROFILE') return view === id && viewedUserId === user?.uid;
                      if (id === 'CREATOR') return view === 'CREATOR';
                      return view === id;
                    };
                    const groups = [
                      { id: 'discover', label: 'Discover', ids: ['USER_PROFILE', 'DASHBOARD', 'FEED', 'WORLDS', 'SEARCH'] },
                      { id: 'entertain', label: 'Entertainment', ids: ['MUSIC', 'VIDEOS', 'MOVIES_TV', 'RADIO', 'GAMES', 'APPS', ...(crossoverSystemEnabled ? ['CROSSOVER'] : []), 'GLOBAL_PHOTOS'] },
                      { id: 'sports', label: 'Sports & News', ids: ['PLAJAH_SPORTS', 'HEALTH_FITNESS', 'ARTICLES'] },
                      { id: 'education', label: 'Education', ids: ['BOOKS', 'CLASSROOMS', 'PLAJAH_LABS'] },
                      { id: 'community', label: 'Community', ids: ['CLUBS', 'CHAT', 'DISCUSSION', 'PLAJAH_ELEVATE', 'CHARITY', 'PAY_IT_FORWARD', 'SANCTUARY_HUB', 'STORE_HUB'] },
                      { id: 'creator', label: 'Creator Tools', ids: ['CREATOR', ...(user ? ['ARTIST_MANAGER', 'PLAJAH_STUDIO', 'BUSINESS_DASHBOARD', 'TERRA', 'AD_PACKAGES'] : []), 'LIVE_HUB', 'FABULA', 'TV_STUDIO', 'MEDIA_ROUTER', 'POSTMAN'] },
                      { id: 'platform', label: 'Platform', ids: ['HELP_CENTER', 'BROWSER'] },
                    ];
                    return groups.map(group => {
                      const expanded = expandedGroups.includes(group.id);
                      const hasActive = group.ids.some(id => isActive(id));
                      return (
                        <div key={group.id} className="mb-0.5">
                          <button
                            onClick={() => setExpandedGroups(prev => expanded ? prev.filter(g => g !== group.id) : [...prev, group.id])}
                            className={`w-full flex items-center justify-between px-4 py-1.5 rounded-xl text-[8px] uppercase tracking-[0.2em] font-black transition-all ${isSidebarCollapsed ? 'hidden' : ''} ${hasActive ? 'text-small-orange' : 'text-white/25 hover:text-white/50'}`}
                          >
                            <span>{group.label}</span>
                            <ChevronDown size={10} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                          {(expanded || isSidebarCollapsed) && (
                            <div className={`flex flex-col gap-0.5 ${!isSidebarCollapsed ? 'pl-1' : ''}`}>
                              {group.ids.map(id => {
                                const item = navItems[id];
                                if (!item) return null;
                                const active = isActive(id);
                                const Icon = item.icon;
                                return (
                                  <button key={id} onClick={() => handleNavClick(id)}
                                    className={`flex items-center transition-all duration-200 overflow-hidden rounded-[1.2rem] mx-auto
                                      ${isSidebarCollapsed ? 'w-12 h-10 justify-center' : 'w-full h-10 px-5'}
                                      ${active ? 'bg-white text-black shadow-xl' : 'text-primary/40 hover:text-primary hover:bg-white/5'}`}
                                  >
                                    <Icon size={18} className={`shrink-0 ${!isSidebarCollapsed ? 'mr-3' : ''} ${active ? 'text-black' : ''}`} />
                                    {!isSidebarCollapsed && <span className="text-[11px] uppercase tracking-widest font-black whitespace-nowrap">{item.label}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </nav>
              )}

              {/* ── Pinned Favorites Nav ── */}
              {sidebarMode === 'pinned' && (
                <nav className="flex-1 flex flex-col overflow-y-auto pr-1 custom-scrollbar overflow-x-hidden w-full">
                  {(() => {
                    const navItems: { [k: string]: { label: string; icon: any } } = {
                      USER_PROFILE: { label: 'My Profile', icon: User }, DASHBOARD: { label: 'Global Archive', icon: Settings },
                      MUSIC: { label: 'Chora', icon: Music2 }, WORLDS: { label: 'Worlds', icon: Globe },
                      VIDEOS: { label: 'Reello', icon: VideoIcon }, MOVIES_TV: { label: 'Taleo', icon: Film },
                      PLAJAH_SPORTS: { label: 'Plajah Sports', icon: Zap }, HEALTH_FITNESS: { label: 'Health & Fitness', icon: Activity },
                      ARTICLES: { label: 'The Newstand', icon: Newspaper },
                      BOOKS: { label: 'Lorea', icon: BookOpen }, PLAJAH_LABS: { label: 'Plajah Labs', icon: FlaskConical },
                      RADIO: { label: 'Radio', icon: Radio }, APPS: { label: 'Apps', icon: AppWindow }, CROSSOVER: { label: 'Crossover', icon: Repeat },
                      GAMES: { label: 'Games', icon: Gamepad2 }, CLUBS: { label: 'Clubs', icon: Users },
                      CHARITY: { label: 'Charity', icon: Heart }, PLAJAH_ELEVATE: { label: 'Plajah Elevate', icon: Landmark }, SANCTUARY_HUB: { label: 'Sanctuary', icon: Shield },
                      STORE_HUB: { label: 'Plajah Store', icon: ShoppingBag }, CLASSROOMS: { label: 'Plajah Academia', icon: GraduationCap },
                      GLOBAL_PHOTOS: { label: 'Photos', icon: Camera },
                      PAY_IT_FORWARD: { label: 'Pay It Forward', icon: Heart }, CHAT: { label: 'Chat', icon: MessageSquare },
                      DISCUSSION: { label: 'Discussion', icon: MessageCircle }, POSTMAN: { label: 'The Postman', icon: Mail },
                      FEED: { label: 'Plajah Social', icon: Rss }, LIVE_HUB: { label: 'Live Hub', icon: Sparkles },
                      FABULA: { label: 'Fabula', icon: Film }, TV_STUDIO: { label: 'TV Studio', icon: Clapperboard }, MEDIA_ROUTER: { label: 'Router & Switcher', icon: Cctv }, SEARCH: { label: 'Find People', icon: Search },
                      HELP_CENTER: { label: 'Help Center', icon: HelpCircle }, BROWSER: { label: 'Partner Sites', icon: Monitor },
                      BUSINESS_DASHBOARD: { label: 'Plajah Business', icon: Briefcase }, TERRA: { label: 'Terra', icon: MapPin }, AD_PACKAGES: { label: 'Promote', icon: TrendingUp },
                      ARTIST_MANAGER: { label: 'Artist Manager', icon: Music2 },
                      PLAJAH_STUDIO: { label: 'Creator Tool Bag', icon: Sparkles },
                      CREATOR: { label: 'Creator Hub', icon: Clapperboard },
                    };
                    const allNavIds = ['USER_PROFILE', 'DASHBOARD', 'FEED', 'WORLDS', 'SEARCH', 'MUSIC', 'VIDEOS', 'MOVIES_TV', 'RADIO', 'GAMES', 'APPS', 'GLOBAL_PHOTOS', 'PLAJAH_SPORTS', 'HEALTH_FITNESS', 'ARTICLES', 'BOOKS', 'CLASSROOMS', 'PLAJAH_LABS', 'CLUBS', 'CHAT', 'DISCUSSION', 'PLAJAH_ELEVATE', 'CHARITY', 'PAY_IT_FORWARD', 'SANCTUARY_HUB', 'STORE_HUB', 'LIVE_HUB', 'FABULA', 'TV_STUDIO', 'MEDIA_ROUTER', 'POSTMAN', 'HELP_CENTER', 'BROWSER', 'CREATOR', ...(user ? ['ARTIST_MANAGER', 'PLAJAH_STUDIO', 'BUSINESS_DASHBOARD', 'TERRA', 'AD_PACKAGES'] : [])];
                    const handleNavClick = (id: string) => {
                      if (id === 'PAY_IT_FORWARD') { setIsPIFModalOpen(true); return; }
                      if (id === 'USER_PROFILE') { if (user) { handleVisitUser(user.uid); } else { loginWithGoogle(); } return; }
                      if (id === 'BUSINESS_DASHBOARD') { setView('PLAJAH_BUSINESS'); return; }
                      if (id === 'AD_PACKAGES') { setView('AD_PACKAGES'); return; }
                      if (id === 'ARTIST_MANAGER') { setView('ARTIST_MANAGER'); return; }
                      setView(id as any);
                    };
                    const isActive = (id: string) => view === id && (id !== 'USER_PROFILE' || viewedUserId === user?.uid);
                    const togglePin = (id: string) => {
                      setPinnedNavItems(prev => {
                        const next = prev.includes(id) ? prev.filter(p => p !== id) : prev.length < 8 ? [...prev, id] : prev;
                        localStorage.setItem('plajah_pinned_nav_v1', JSON.stringify(next));
                        return next;
                      });
                    };
                    const effectivePinned = pinnedNavItems.filter(id => allNavIds.includes(id));
                    if (showMoreDrawer && !isSidebarCollapsed) {
                      return (
                        <div className="flex flex-col h-full">
                          <div className="flex items-center justify-between px-2 py-2 mb-2">
                            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/50">All Sections ({pinnedNavItems.length}/8)</span>
                            <button onClick={() => setShowMoreDrawer(false)} className="text-white/30 hover:text-white transition-colors p-1"><XIcon size={13} /></button>
                          </div>
                          <div className="flex flex-col gap-0.5 overflow-y-auto custom-scrollbar flex-1">
                            {allNavIds.map(id => {
                              const item = navItems[id];
                              if (!item) return null;
                              const pinned = pinnedNavItems.includes(id);
                              const active = isActive(id);
                              const Icon = item.icon;
                              return (
                                <div key={id} className="flex items-center gap-1 group/pinitem">
                                  <button onClick={() => { handleNavClick(id); setShowMoreDrawer(false); }}
                                    className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200
                                      ${active ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                                  >
                                    <Icon size={15} />
                                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{item.label}</span>
                                  </button>
                                  <button onClick={() => togglePin(id)}
                                    title={pinned ? 'Unpin' : pinnedNavItems.length < 8 ? 'Pin' : 'Max 8 pinned'}
                                    className={`shrink-0 p-1.5 rounded-lg transition-all ${pinned ? 'text-small-orange' : 'text-white/20 hover:text-white/50 opacity-0 group-hover/pinitem:opacity-100'}`}
                                  >
                                    <Pin size={11} className={pinned ? 'fill-current' : ''} />
                                  </button>
                                </div>
                              );
                            })}
                            {/* Report a bug — an action, not a view. Lives here now instead of a floating button. */}
                            <button
                              onClick={() => { window.dispatchEvent(new CustomEvent('OPEN_BUG_REPORT')); setShowMoreDrawer(false); }}
                              className="flex items-center gap-2.5 px-3 py-2 mt-1 pt-3 border-t border-white/5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all duration-200"
                            >
                              <Bug size={15} className="text-[#EF4444]" />
                              <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Report a bug</span>
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-col gap-1 h-full">
                        <div className="flex flex-col gap-1 flex-1">
                          {effectivePinned.map(id => {
                            const item = navItems[id];
                            if (!item) return null;
                            const active = isActive(id);
                            const Icon = item.icon;
                            return (
                              <button key={id} onClick={() => handleNavClick(id)}
                                className={`flex items-center transition-all duration-200 overflow-hidden rounded-[1.2rem] mx-auto
                                  ${isSidebarCollapsed ? 'w-12 h-12 justify-center' : 'w-full h-12 px-6'}
                                  ${active ? 'bg-white text-black shadow-xl' : 'text-primary/40 hover:text-primary hover:bg-white/5'}`}
                              >
                                <Icon size={20} className={`shrink-0 ${active ? 'text-black' : ''}`} />
                                {!isSidebarCollapsed && <span className="ml-3 text-[12.5px] uppercase tracking-widest font-black whitespace-nowrap">{item.label}</span>}
                              </button>
                            );
                          })}
                        </div>
                        {!isSidebarCollapsed && (
                          <button onClick={() => setShowMoreDrawer(true)}
                            className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white/35 hover:text-white/70 text-[8px] uppercase tracking-[0.2em] font-black transition-all w-full"
                          >
                            <ChevronDown size={11} /> More
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </nav>
              )}

              <div className={`mt-4 space-y-4 ${isSidebarCollapsed ? 'px-2' : 'px-6 group-hover/sidebar:px-6'}`}>
                <SpatialToggle collapsed={isSidebarCollapsed || theme === 'BIG_SCREEN'} />
                <div className={`flex items-center justify-center gap-1.5 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
                  {/* Chat — jump to messages; incoming calls ring as a card near here */}
                  {user && (
                    <button
                      onClick={() => setView('CHAT')}
                      title="Chat"
                      className="relative shrink-0 p-2.5 rounded-2xl transition-all border"
                      style={view === 'CHAT'
                        ? { background: 'rgba(255,140,0,0.18)', border: '1px solid rgba(255,140,0,0.35)' }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <MessageSquare size={16} className={view === 'CHAT' ? 'text-small-orange' : 'text-white/40'} />
                    </button>
                  )}
                  <div className="shrink-0">
                    <NotificationCenter onNavigate={handleNotificationNavigate} onOpenAlerts={() => setNotifDrawerTrigger({ tab: 'ALERTS', ts: Date.now() })} />
                  </div>
                  {/* Sign Out — quick access next to notification bell */}
                  {user && (
                    <button
                      onClick={() => logout()}
                      title="Sign out"
                      className="shrink-0 p-2.5 rounded-2xl transition-all border"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <LogOut size={16} className="text-white/30 hover:text-red-400 transition-colors" />
                    </button>
                  )}
                  {/* Smart Guide toggle */}
                  {user && (
                    <button
                      onClick={() => {
                        const next = !smartGuideEnabled;
                        setSmartGuideEnabled(next);
                        updateUserProfile(user.uid, { smartGuideEnabled: next } as any).catch(() => {});
                      }}
                      title={smartGuideEnabled ? 'Smart Guide on — click to turn off' : 'Smart Guide off — click to enable feature hints'}
                      className="shrink-0 p-2.5 rounded-2xl transition-all border"
                      style={smartGuideEnabled
                        ? { background: 'rgba(255,140,0,0.18)', border: '1px solid rgba(255,140,0,0.35)' }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <Compass size={16} className={smartGuideEnabled ? 'text-small-orange' : 'text-white/30'} />
                    </button>
                  )}
                  {/* Settings → User Account */}
                  <button
                    onClick={() => { if (user) setView('CREATOR'); else loginWithGoogle(); }}
                    title="Settings"
                    className="shrink-0 p-2.5 rounded-2xl transition-all border"
                    style={(view === 'USER_PROFILE' && (!viewedUserId || viewedUserId === user?.uid))
                      ? { background: 'rgba(255,140,0,0.18)', border: '1px solid rgba(255,140,0,0.35)' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <Settings size={16} className={(view === 'USER_PROFILE' && (!viewedUserId || viewedUserId === user?.uid)) ? 'text-small-orange' : 'text-white/40'} />
                  </button>
                  {/* Project Tray toggle */}
                  <button
                    onClick={() => setIsProjectTrayOpen(v => !v)}
                    title="My Projects"
                    className="relative shrink-0 p-2.5 rounded-2xl transition-all border"
                    style={isProjectTrayOpen || isCreatorMinimized
                      ? { background: 'linear-gradient(135deg,rgba(107,0,153,0.35),rgba(255,140,0,0.25))', border: '1px solid rgba(255,140,0,0.3)' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <Layers size={16} className={isProjectTrayOpen || isCreatorMinimized ? 'text-orange-300' : 'text-white/40'} />
                    {isCreatorMinimized && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-400 ring-2 ring-[#0a0a0a]" />
                    )}
                  </button>
                </div>
              </div>

              {/* ── Docked Nano Player ── always above the profile card */}
              {!isSidebarCollapsed && (
                <div className="px-2 pt-3 pb-2 border-t border-white/[0.06]">
                  {(currentTrack || isNanoView) ? (() => {
                    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
                    const coverSrc = currentAlbum?.coverImage;
                    const fmtTime = (s: number) => {
                      if (!isFinite(s) || s < 0) return '0:00';
                      const m = Math.floor(s / 60), ss = Math.floor(s % 60);
                      return `${m}:${ss.toString().padStart(2, '0')}`;
                    };
                    return (
                      <div data-guide="Nano Controller" style={{ perspective: '1400px', borderRadius: '1.5rem', boxShadow: '0 16px 48px rgba(0,0,0,0.85), 0 4px 20px rgba(0,0,0,0.6)' }}>
                        <motion.div
                          animate={{ rotateY: isDockedFlipped ? 180 : 0 }}
                          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                          style={{ transformStyle: 'preserve-3d', position: 'relative' }}
                        >
                          {/* ══ FRONT FACE ══ */}
                          <div
                            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                            className="overflow-hidden bg-black/70 backdrop-blur-2xl relative rounded-3xl"
                          >
                            {coverSrc && (
                              <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 pointer-events-none" style={{ filter: 'blur(32px) brightness(0.22) saturate(1.6)', zIndex: 0 }} />
                            )}
                            <div className="relative z-10">

                              {/* ── EXPANDED ── */}
                              <AnimatePresence>
                              {!isMinimized && (
                                <motion.div
                                  key="expanded"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1, transition: { duration: 0.3 } }}
                                  exit={{ opacity: 0, transition: { duration: 2, ease: 'easeInOut' } }}
                                >
                                  {/* ── Navigate row ── */}
                                  <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/[0.06]">
                                    <div className="flex items-center gap-0.5">
                                      <button onClick={() => setView('DASHBOARD')} className={`p-2 rounded-xl transition-all ${view === 'DASHBOARD' ? 'bg-small-orange/15 text-small-orange' : 'text-white/35 hover:text-white hover:bg-white/5'}`} title="Home"><Home size={13} /></button>
                                      <button onClick={() => { setViewedUserId(user?.uid ?? null); setView('USER_PROFILE'); }} className={`p-2 rounded-xl transition-all ${view === 'USER_PROFILE' ? 'bg-small-orange/15 text-small-orange' : 'text-white/35 hover:text-white hover:bg-white/5'}`} title="My Profile"><User size={13} /></button>
                                      <button onClick={() => setView('SEARCH')} className={`p-2 rounded-xl transition-all ${view === 'SEARCH' ? 'bg-small-orange/15 text-small-orange' : 'text-white/35 hover:text-white hover:bg-white/5'}`} title="Search"><Search size={13} /></button>
                                      <button onClick={() => { if (user) setView('CREATOR'); }} className="p-2 rounded-xl text-white/35 hover:text-white hover:bg-white/5 transition-all" title="Settings"><Settings size={13} /></button>
                                    </div>
                                    <span className="text-[7px] font-black uppercase tracking-widest text-white/20">Navigate</span>
                                  </div>

                                  {/* ── Theme row ── */}
                                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
                                    <div className="flex items-center gap-0.5 p-1 bg-black/30 rounded-xl">
                                      <button onClick={() => handleSetTheme('DARK')} className={`p-1.5 rounded-lg transition-all ${theme === 'DARK' ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white'}`} title="Dark"><Moon size={11} /></button>
                                      <button onClick={() => handleSetTheme('LIGHT')} className={`p-1.5 rounded-lg transition-all ${theme === 'LIGHT' ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`} title="Light"><Sun size={11} /></button>
                                      <button onClick={() => handleSetTheme('PLAJAH')} className={`p-1.5 rounded-lg transition-all ${theme === 'PLAJAH' ? 'bg-small-orange text-white' : 'text-white/30 hover:text-white'}`} title="Plajah"><Sparkles size={11} /></button>
                                      <button onClick={() => handleSetTheme('NEBULA')} className={`p-1.5 rounded-lg transition-all ${theme === 'NEBULA' ? 'bg-indigo-500 text-white' : 'text-white/30 hover:text-white'}`} title="Nebula"><Globe size={11} /></button>
                                    </div>
                                    <span className="text-[7px] font-black uppercase tracking-widest text-white/20">Themes</span>
                                  </div>

                                  {/* Cover art + spinning vinyl */}
                                  <div className="relative w-full overflow-hidden" style={{ height: '200px' }}>
                                    {coverSrc
                                      ? <img src={coverSrc} alt={currentAlbum?.title} className="w-full h-full object-cover" />
                                      : <div className="w-full h-full bg-white/5 flex items-center justify-center"><Music2 size={40} className="text-white/15" /></div>
                                    }
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                                    {/* Spinning vinyl */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                      <motion.div
                                        animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                                        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                                        className="w-28 h-28 rounded-full border-[6px] border-white/5 shadow-2xl relative overflow-hidden ring-1 ring-white/10"
                                        style={{ opacity: 0.72 }}
                                      >
                                        {coverSrc && <img src={coverSrc} alt="" className="w-full h-full object-cover" />}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="w-7 h-7 rounded-full bg-black/90 border border-white/20" />
                                        </div>
                                      </motion.div>
                                    </div>
                                    {/* Top overlay: flip + pop-out */}
                                    <div className="absolute top-2 left-3 right-3 flex justify-between pointer-events-auto">
                                      <button
                                        onClick={() => setIsDockedFlipped(true)}
                                        className="p-1.5 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10 text-white/40 hover:text-small-orange hover:border-small-orange/30 transition-all"
                                        title="Flip to back"
                                      ><Layers size={11} /></button>
                                      <button
                                        onClick={() => { setIsNanoDocked(false); setIsNanoView(false); }}
                                        className="p-1.5 rounded-xl bg-black/50 backdrop-blur-sm border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all"
                                        title="Full Player"
                                      ><Maximize2 size={11} /></button>
                                    </div>
                                    {/* Track info */}
                                    <div className="absolute bottom-2 left-3 right-3">
                                      <p className="text-[11px] font-black uppercase tracking-tight text-white leading-tight truncate">{currentTrack?.title || 'Nothing playing'}</p>
                                      <p className="text-[8px] font-bold text-small-orange/80 uppercase tracking-widest truncate">{currentAlbum?.artist || ''}</p>
                                    </div>
                                  </div>

                                  {/* Seek bar */}
                                  <div className="px-4 pt-3 pb-1">
                                    <div className="h-1 bg-white/10 rounded-full relative cursor-pointer group" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * duration); }}>
                                      <div className="h-full bg-small-orange rounded-full group-hover:bg-orange-400 transition-colors" style={{ width: `${pct}%` }} />
                                      <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-all pointer-events-none" style={{ left: `calc(${pct}% - 5px)` }} />
                                    </div>
                                    <div className="flex justify-between mt-1">
                                      <span className="text-[7px] font-bold text-white/30 tabular-nums">{fmtTime(currentTime)}</span>
                                      <span className="text-[7px] font-bold text-white/30 tabular-nums">{fmtTime(duration)}</span>
                                    </div>
                                  </div>

                                  {/* Playback row */}
                                  <div className="flex items-center justify-center gap-3 px-4 pb-2">
                                    <button onClick={prev} className="p-2 text-white/40 hover:text-white transition-all rounded-lg hover:bg-white/5"><SkipBack size={15} /></button>
                                    <button onClick={() => isPlaying ? pause() : resume()} className="w-11 h-11 rounded-full bg-small-orange flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,140,0,0.45)]">
                                      {isPlaying ? <Pause size={16} className="text-black" /> : <Play size={16} className="text-black fill-black" />}
                                    </button>
                                    <button onClick={next} className="p-2 text-white/40 hover:text-white transition-all rounded-lg hover:bg-white/5"><SkipForward size={15} /></button>
                                  </div>

                                  {/* Repeat + volume row */}
                                  <div className="flex items-center gap-2 px-4 pb-2">
                                    <button onClick={() => setRepeatMode(repeatMode === 'OFF' ? 'ALL' : repeatMode === 'ALL' ? 'ONE' : 'OFF')} className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/5" title={`Repeat: ${repeatMode}`}>
                                      {repeatMode === 'ONE' ? <Repeat1 size={13} className="text-small-orange" /> : <Repeat size={13} className={repeatMode === 'ALL' ? 'text-small-orange' : 'text-white/25'} />}
                                    </button>
                                    <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)} className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/5">
                                      {volume === 0 ? <VolumeX size={13} className="text-white/25" /> : <Volume2 size={13} className="text-white/40" />}
                                    </button>
                                    <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => setVolume(parseFloat(e.target.value))} className="flex-1 h-1 rounded-full appearance-none cursor-pointer" style={{ accentColor: '#FF8C00' }} />
                                  </div>

                                  {/* FX row + compact toggle */}
                                  <div className="flex items-center justify-between px-3 pb-3 border-t border-white/[0.05] pt-2">
                                    <div className="flex items-center gap-0.5">
                                      <button onClick={() => setIsFrequencyVisualizerEnabled(!isFrequencyVisualizerEnabled)} className={`p-1.5 rounded-lg transition-all ${isFrequencyVisualizerEnabled ? 'text-small-orange bg-small-orange/10' : 'text-white/20 hover:text-white hover:bg-white/5'}`} title="Frequency Visualizer"><Activity size={12} /></button>
                                      <button onClick={() => setIsMiniPlayerActive(!isMiniPlayerActive)} className={`p-1.5 rounded-lg transition-all ${isMiniPlayerActive ? 'text-small-orange bg-small-orange/10' : 'text-white/20 hover:text-white hover:bg-white/5'}`} title="Mini Player"><Tv size={12} /></button>
                                      <button onClick={() => setIsThreeDEnabled(!isThreeDEnabled)} className={`p-1.5 rounded-lg transition-all ${isThreeDEnabled ? 'text-small-orange bg-small-orange/10' : 'text-white/20 hover:text-white hover:bg-white/5'}`} title="3D Depth"><Box size={12} /></button>
                                      <button onClick={() => setSpatialAudioEnabled(!isSpatialAudioEnabled)} className={`p-1.5 rounded-lg transition-all ${isSpatialAudioEnabled ? 'text-violet-400 bg-violet-500/10' : 'text-white/20 hover:text-white hover:bg-white/5'}`} title="Spatial Audio"><Headphones size={12} /></button>
                                    </div>
                                    {/* Minimize — deliberately the loudest control in the row.
                                        Bold red dash + a subtle pulse so the way out is always
                                        obvious now that the player never collapses itself. */}
                                    <button
                                      onClick={() => setIsMinimized(true)}
                                      className="group/min p-1.5 rounded-lg transition-all hover:bg-red-500/15 active:scale-90"
                                      title="Minimize player"
                                      aria-label="Minimize player"
                                    >
                                      <span className="block w-4 h-[3px] rounded-full bg-red-500 group-hover/min:bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.65)] animate-pulse" />
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                              </AnimatePresence>

                              {/* ── COMPACT bar ── */}
                              <AnimatePresence>
                              {isMinimized && (
                                <motion.div
                                  key="compact"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1, transition: { duration: 0.4 } }}
                                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                >
                                  <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1">
                                    {coverSrc
                                      ? <img src={coverSrc} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0 border border-white/10" />
                                      : <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><Music2 size={14} className="text-white/20" /></div>
                                    }
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[9px] font-black uppercase tracking-tight text-white truncate leading-tight">{currentTrack?.title || 'Nothing playing'}</p>
                                      <p className="text-[7px] font-bold text-small-orange/70 uppercase tracking-widest truncate">{currentAlbum?.artist || ''}</p>
                                    </div>
                                    <button onClick={() => { setIsNanoDocked(false); setIsNanoView(false); }} className="p-1 rounded-lg text-white/25 hover:text-white transition-all" title="Full Player"><Maximize2 size={10} /></button>
                                  </div>
                                  <div className="h-[2px] bg-white/10 cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * duration); }}>
                                    <div className="h-full bg-small-orange" style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="flex items-center justify-between px-3 py-2">
                                    <button onClick={prev} className="p-1 text-white/35 hover:text-white transition-all"><SkipBack size={12} /></button>
                                    <button onClick={() => isPlaying ? pause() : resume()} className="w-7 h-7 rounded-full bg-small-orange flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
                                      {isPlaying ? <Pause size={11} className="text-black" /> : <Play size={11} className="text-black fill-black" />}
                                    </button>
                                    <button onClick={next} className="p-1 text-white/35 hover:text-white transition-all"><SkipForward size={12} /></button>
                                    <button onClick={() => setIsMinimized(false)} className="p-1 text-white/20 hover:text-white/60 transition-all" title="Expand"><ChevronUp size={11} /></button>
                                  </div>
                                </motion.div>
                              )}
                              </AnimatePresence>
                            </div>
                          </div>

                          {/* ══ BACK FACE ══ */}
                          <div
                            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                            className="overflow-hidden rounded-3xl flex flex-col"
                          >
                            {/* Full-bleed cover art */}
                            {coverSrc
                              ? <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.32) saturate(1.7)' }} />
                              : <div className="absolute inset-0 bg-gradient-to-br from-purple-900/60 to-black" />
                            }
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />

                            {/* Flip-back button */}
                            <div className="relative z-10 flex justify-end p-4">
                              <button
                                onClick={() => setIsDockedFlipped(false)}
                                className="p-1.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/15 text-white/40 hover:text-white transition-all"
                                title="Flip back"
                              ><RotateCcw size={11} /></button>
                            </div>

                            {/* Content — fills remaining height */}
                            <div className="relative z-10 flex flex-col flex-1 justify-end px-5 pb-5 gap-4">
                              {/* Track info */}
                              <div>
                                <p className="text-[8px] font-black text-small-orange uppercase tracking-widest mb-0.5">{currentAlbum?.artist || ''}</p>
                                <p className="text-sm font-black uppercase tracking-tight text-white leading-tight truncate">{currentTrack?.title || 'Nothing playing'}</p>
                                {currentAlbum?.title && <p className="text-[8px] text-white/35 uppercase tracking-widest mt-0.5 truncate">{currentAlbum.title}</p>}
                              </div>
                              {/* Seek */}
                              <div>
                                <div className="h-0.5 bg-white/20 rounded-full cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * duration); }}>
                                  <div className="h-full bg-small-orange rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-[7px] font-bold text-white/30 tabular-nums">{fmtTime(currentTime)}</span>
                                  <span className="text-[7px] font-bold text-white/30 tabular-nums">{fmtTime(duration)}</span>
                                </div>
                              </div>
                              {/* Controls */}
                              <div className="flex items-center justify-center gap-5">
                                <button onClick={prev} className="p-2 text-white/50 hover:text-white transition-all"><SkipBack size={18} /></button>
                                <button
                                  onClick={() => isPlaying ? pause() : resume()}
                                  className="w-12 h-12 rounded-full bg-small-orange flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_24px_rgba(255,140,0,0.5)]"
                                >
                                  {isPlaying ? <Pause size={18} className="text-black" /> : <Play size={18} className="text-black fill-black" />}
                                </button>
                                <button onClick={next} className="p-2 text-white/50 hover:text-white transition-all"><SkipForward size={18} /></button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    );
                  })() : (
                    /* Empty state */
                    <div className="rounded-[2rem] border border-white/[0.06] bg-white/[0.02] flex items-center justify-center py-5 gap-2.5">
                      <Music2 size={14} className="text-white/15" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/15">Player</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-theme space-y-4 px-4">
                <div data-guide="Profile Card" className={`p-4 bg-white/[0.04] border border-theme rounded-[2rem] shadow-inner ${isSidebarCollapsed ? 'p-2 rounded-2xl flex flex-col items-center gap-4' : ''}`}>
                  <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : (theme === 'BIG_SCREEN' ? 'justify-center group-hover/sidebar:justify-start' : '')}`}>
                     <button
                       onClick={() => user && setShowAccountSwitcher(v => !v)}
                       title="Switch accounts"
                       className="shrink-0 relative group/avatar transition-all"
                     >
                     <PioneerGoldFrame active={!!userProfile?.hasSeenWelcomePackage} size="sm">
                       <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                         {user?.photoURL ? <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" /> : <User size={20} className="text-white/40" />}
                       </div>
                     </PioneerGoldFrame>
                     {/* Slot badge */}
                     {linkedAccounts.length > 1 && (() => {
                       const slot = linkedAccounts.find(a => a.uid === user?.uid)?.slot;
                       return slot ? (
                         <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full text-[7px] font-black text-white flex items-center justify-center" style={{ background: ['','#6B0099','#FF8C00','#0070FF','#00C878'][slot], border: '1px solid rgba(0,0,0,0.5)' }}>{slot}</span>
                       ) : null;
                     })()}
                     </button>
                     <div className={`overflow-hidden ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:block' : 'block')}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{user?.displayName || 'Guest Artist'}</p>
                        <p className="text-[8px] font-bold text-small-orange truncate opacity-60">{user ? user.email : 'Public Instance'}</p>
                     </div>
                  </div>

                  {/* ── Creator Tools Persistent Shortcut ── */}
                  {user && (
                    <button
                      onClick={() => setView('PLAJAH_STUDIO')}
                      className={`mt-3 flex items-center gap-3 text-[9px] font-black uppercase tracking-widest rounded-xl px-3 py-2.5 transition-all w-full ${
                        view === 'PLAJAH_STUDIO'
                          ? 'bg-[#FF8C00] text-black'
                          : 'bg-[#FF8C00]/10 border border-[#FF8C00]/20 text-[#FF8C00] hover:bg-[#FF8C00]/20'
                      } ${isSidebarCollapsed ? 'justify-center' : (theme === 'BIG_SCREEN' ? 'justify-center group-hover/sidebar:justify-start' : '')}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${view === 'PLAJAH_STUDIO' ? 'bg-black/20' : 'bg-[#FF8C00]/15'}`}>
                        <Clapperboard size={14} className={view === 'PLAJAH_STUDIO' ? 'text-black' : 'text-[#FF8C00]'} />
                      </div>
                      <span className={isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:inline' : '')}>Creator Tools</span>
                    </button>
                  )}
                </div>

                {/* Lighthouse brand attribution */}
                <p
                  className={`brand-shimmer text-center text-[9px] font-bold uppercase tracking-[0.14em] leading-tight select-none ${isSidebarCollapsed ? 'hidden' : (theme === 'BIG_SCREEN' ? 'hidden group-hover/sidebar:block' : 'block')}`}
                  title="Plajah is a Lighthouse Enterprises LLC brand"
                >
                  A Lighthouse Enterprises LLC Brand
                </p>
              </div>
            </aside>
          )}

          {/* Mobile Bottom Tab Bar */}
          {(isMobile || theme === 'PHONE') && (
            <>
              {/* Fixed bottom tab bar — 5 primary destinations + narrow More trigger */}
              <nav className="fixed bottom-0 left-0 right-0 z-[150] glass-nav gpu">
                {/* Brand-gradient paint server for the active tab's icon stroke (an SVG icon can't
                    take a CSS gradient — it needs a referenced <linearGradient>). Left→right
                    purple→magenta→orange, matching the label gradient below and the TV top tabs. */}
                <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
                  <defs>
                    <linearGradient id="plajah-nav-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6B0099" />
                      <stop offset="55%" stopColor="#D40055" />
                      <stop offset="100%" stopColor="#FF8C00" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="flex items-center px-1 pt-1 pb-android-nav gap-0">
                  {[
                    { id: 'MUSIC',     icon: Music2,        label: 'Chora'  },
                    { id: 'VIDEOS',    icon: VideoIcon,     label: 'Reello' },
                    { id: 'DASHBOARD', icon: Home,          label: 'Home'   },
                    { id: 'CHAT',      icon: MessageSquare, label: 'Chat'   },
                    { id: 'FEED',      icon: Rss,           label: 'Social' },
                  ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = view === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          // Chora (Music) tab: double-tap reveals the transport controls in
                          // place; a single tap navigates to Chora (delayed to detect the double).
                          if (tab.id === 'MUSIC') {
                            const now = Date.now();
                            if (now - lastChoraTapRef.current < 280) {
                              if (choraTapTimer.current) { clearTimeout(choraTapTimer.current); choraTapTimer.current = null; }
                              lastChoraTapRef.current = 0;
                              setTransportForced(true);
                              setIsBottomSectionExpanded(false);
                              return;
                            }
                            lastChoraTapRef.current = now;
                            choraTapTimer.current = setTimeout(() => {
                              setView('MUSIC'); setIsBottomSectionExpanded(false); choraTapTimer.current = null;
                            }, 280);
                            return;
                          }
                          setView(tab.id as any); setIsBottomSectionExpanded(false);
                        }}
                        className="flex flex-col items-center gap-0.5 flex-1 py-1.5 android-press"
                        style={{ minHeight: 48 }}
                      >
                        <div className={`w-10 h-7 rounded-2xl flex items-center justify-center transition-colors ${isActive ? 'bg-gradient-to-br from-[#6B0099]/25 via-[#D40055]/20 to-[#FF8C00]/25' : ''}`}>
                          {/* Selected tab wears the full brand gradient — icon stroke + label — so you
                              always know which experience you're in (matches the TV top tabs). */}
                          <Icon size={20} className={isActive ? '' : 'text-white/50'} style={isActive ? { stroke: 'url(#plajah-nav-grad)' } : undefined} />
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-wider ${isActive ? 'bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] bg-clip-text text-transparent' : 'text-white/40'}`}>{tab.label}</span>
                      </button>
                    );
                  })}

                  {/* Player restore — only when nano player is active */}
                  {isNanoView && (
                    <button
                      onClick={() => { setIsNanoView(false); setIsShrunk(false); }}
                      title="Restore player"
                      className="flex flex-col items-center justify-center py-1.5 android-press shrink-0"
                      style={{ minHeight: 48, width: 36 }}
                    >
                      <div className="w-8 h-7 rounded-xl flex items-center justify-center bg-violet-500/20 border border-violet-500/30">
                        <Zap size={13} className="text-violet-400" />
                      </div>
                    </button>
                  )}

                  {/* Narrow More button — chevron only, no label */}
                  <button
                    onClick={() => setIsBottomSectionExpanded(v => !v)}
                    className="flex flex-col items-center justify-center py-1.5 android-press shrink-0"
                    style={{ minHeight: 48, width: 32 }}
                  >
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${isBottomSectionExpanded ? 'bg-white/15' : 'hover:bg-white/8'}`}>
                      <ChevronUp
                        size={14}
                        className={`transition-transform duration-200 ${isBottomSectionExpanded ? 'rotate-180 text-white/70' : 'text-white/35'}`}
                      />
                    </div>
                  </button>
                </div>
              </nav>

              {/* Persistent "back to Now Playing" chevron — floats centered above the Home tab
                  on mobile whenever something is queued and you're away from the music views,
                  so the tracklist of what's playing is always one tap away. */}
              {(isMobile || theme === 'PHONE') && currentTrack && !isBottomSectionExpanded && !transportForced && !['MUSIC', 'PLAYER', 'RADIO'].includes(view) && (
                <button
                  onTouchStart={(e) => { nowPlayingTouchY.current = e.touches[0].clientY; nowPlayingSwiped.current = false; }}
                  onTouchMove={(e) => { if (nowPlayingTouchY.current != null && nowPlayingTouchY.current - e.touches[0].clientY > 24) nowPlayingSwiped.current = true; }}
                  onTouchEnd={() => { if (nowPlayingSwiped.current) window.dispatchEvent(new CustomEvent('PLAJAH_OPEN_PLAYER_DRAWER')); nowPlayingTouchY.current = null; }}
                  onClick={() => {
                    if (nowPlayingSwiped.current) { nowPlayingSwiped.current = false; return; } // was a swipe-up, not a tap
                    setIsMinimized(false);
                    if (currentAlbum) handleGlobalNavigate('PLAYER', { album: currentAlbum });
                    else setView('MUSIC');
                  }}
                  title={`Now playing: ${currentTrack.title} — tap for tracklist, swipe up for controls`}
                  className="fixed left-1/2 -translate-x-1/2 z-[151] flex items-center gap-1.5 max-w-[72vw] pl-2 pr-3 py-1.5 rounded-full border border-white/15 shadow-[0_6px_24px_rgba(107,0,153,0.45)] android-press"
                  style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 6px)', background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)' }}
                >
                  <ChevronUp size={16} className={`text-white shrink-0 ${isPlaying ? 'animate-pulse' : ''}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white truncate drop-shadow">{currentTrack.title || currentAlbum?.title || 'Now Playing'}</span>
                </button>
              )}

              {/* Full app drawer — slides up from bottom tab bar */}
              <AnimatePresence>
                {isBottomSectionExpanded && (
                  <motion.div
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                    className={`fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-[145] glass-sheet rounded-t-m3-2xl max-h-[65vh] gpu${drawerSearchFocused ? '' : ' overflow-y-auto'}`}
                  >
                    <div className="sticky top-0 glass-nav rounded-t-m3-2xl border-b border-white/5">
                      <div className="flex items-center justify-between px-5 pt-3 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">All Sections</span>
                        <button onClick={() => setIsBottomSectionExpanded(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <ChevronDown size={16} className="text-white/60" />
                        </button>
                      </div>
                      {/* Search bar — full live search, same as desktop sidebar */}
                      <div className="px-2 pb-2">
                        <SidebarSearch
                          isSidebarCollapsed={false}
                          theme={theme}
                          onVisitUser={(uid) => { handleVisitUser(uid); setIsBottomSectionExpanded(false); }}
                          onSelectItem={(item) => { handleSelectItem(item); setIsBottomSectionExpanded(false); }}
                          onSelectArticle={(article) => { setSelectedArticle(article); setView('ARTICLE_VIEW'); setIsBottomSectionExpanded(false); }}
                          onSelectGame={(game) => { handleSelectGame(game); setIsBottomSectionExpanded(false); }}
                          onSelectView={(v) => { setView(v as any); setIsBottomSectionExpanded(false); }}
                          onSelectLiveFeed={(feed) => { setActiveLiveFeed(feed); setIsBottomSectionExpanded(false); }}
                          onFocusChange={setDrawerSearchFocused}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-4">
                      {[
                        { id: 'USER_PROFILE', icon: User, label: 'Profile' },
                        { id: 'DASHBOARD', icon: Home, label: 'Home' },
                        { id: 'MUSIC', icon: Music2, label: 'Music' },
                        { id: 'VIDEOS', icon: VideoIcon, label: 'Videos' },
                        { id: 'MOVIES_TV', icon: Film, label: 'Movies' },
                        { id: 'BOOKS', icon: BookOpen, label: 'Lorea' },
                        { id: 'PLAJAH_LABS', icon: FlaskConical, label: 'Labs' },
                        { id: 'ARTICLES', icon: Newspaper, label: 'Newsstand' },
                        { id: 'RADIO', icon: Radio, label: 'Radio' },
                        { id: 'LIVE_HUB', icon: Sparkles, label: 'Live' },
                        { id: 'GAMES', icon: Gamepad2, label: 'Games' },
                        { id: 'APPS', icon: AppWindow, label: 'Apps' },
                        { id: 'CLUBS', icon: Users, label: 'Clubs' },
                        { id: 'CHAT', icon: MessageSquare, label: 'Chat' },
                        { id: 'FEED', icon: Rss, label: 'Social' },
                        { id: 'CLASSROOMS', icon: GraduationCap, label: 'Academia' },
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

          <SpatialUIRoot className={`flex-1 flex flex-col w-full overflow-y-auto overflow-x-hidden custom-scrollbar ${navLayout.isBar && !navLayout.isPhone ? 'pt-16' : ''} ${(isMobile || theme === 'PHONE') ? (isShrunk ? (isLandscape ? 'pt-2 pb-20 transition-all duration-500' : 'pt-2 pb-40 transition-all duration-500') : (isLandscape ? 'pt-2 pb-24 transition-all duration-500' : 'pt-2 pb-64 transition-all duration-500')) : 'pb-40 lg:pb-0'}`}>
            {/* World Cup temporary banner — mobile only, expires 2026-07-29 (epoch 1753747200000) */}
            {(isMobile || theme === 'PHONE') && !wcMobileBannerDismissed && view !== 'PLAJAH_SPORTS' && Date.now() < 1753747200000 && (
              <div className="mx-3 mt-2 mb-1 flex items-center gap-3 px-4 py-3 rounded-2xl relative overflow-hidden"
                style={{ background: 'linear-gradient(90deg, #004d00 0%, #006400 40%, #FF8C00 100%)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <span className="text-2xl select-none shrink-0">⚽</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white leading-none">Step into the World Cup</p>
                  <p className="text-[8px] text-white/60 mt-0.5">FIFA WC 2026 — Live in Plajah Sports</p>
                </div>
                <button
                  onClick={() => setView('PLAJAH_SPORTS' as any)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white text-black"
                >
                  Go
                </button>
                <button
                  onClick={() => { localStorage.setItem('wc26_mobile_banner_dismissed', '1'); setWcMobileBannerDismissed(true); }}
                  className="shrink-0 w-6 h-6 rounded-full bg-black/30 flex items-center justify-center text-white/50 text-xs"
                >
                  ×
                </button>
              </div>
            )}
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
                onNavigate={(v) => setView(v as any)}
              />
            )}

            {view === 'PLAJAH_SPORTS' && (
              <PlajahSportsView onVisitUser={handleVisitUser} currentUser={userProfile} onOpenAthletes={() => setView('ATHLETE_SHOWCASE')} onOpenFanRooms={() => { setFanRoomMatchId(undefined); setFanRoomMatch(null); setView('MATCH_FAN_ROOMS'); }} />
            )}

            {view === 'ATHLETE_SHOWCASE' && (
              <AthleteShowcaseView onBack={() => setView('PLAJAH_SPORTS')} />
            )}

            {view === 'MATCH_FAN_ROOMS' && (
              <MatchFanRoomsView currentUser={user} initialMatchId={fanRoomMatchId} initialMatch={fanRoomMatch} onBack={() => setView('PLAJAH_SPORTS')} />
            )}

            {view === 'CLASS_POINTS' && (
              <ClassPointsView onBack={() => setView('CLASSROOMS')} onOpenReadingQuest={() => setView('READING_QUEST')} />
            )}

            {view === 'ROOM' && currentRoomId && (
              <RoomView roomId={currentRoomId} user={user} onBack={() => setView(user ? 'FEED' : 'DASHBOARD')} />
            )}

            {view === 'PODCAST_STUDIO' && (
              <PodcastStudio
                selfUid={user?.uid}
                onFinish={async (blob, durationMs) => {
                  if (!user?.uid) return;
                  try { await saveStudioEpisode({ uid: user.uid, blob, title: 'New Episode', durationMs }); } catch (e) { console.error('[studio] save failed', e); }
                  setMusicInitialTab('PODCASTS'); setView('MUSIC');
                }}
                onClose={() => setView(user ? 'FEED' : 'DASHBOARD')}
              />
            )}

            {view === 'LIVE_TRANSLATION' && (
              <LiveTranslation onBack={() => setView(user ? 'FEED' : 'DASHBOARD')} />
            )}

            {view === 'PODCAST_CALLIN' && callinShowId && (
              <PodcastCallIn showId={callinShowId} onClose={() => setView(user ? 'FEED' : 'DASHBOARD')} />
            )}

            {view === 'PODCAST_LISTEN' && listenShowId && (
              <PodcastListen showId={listenShowId} onClose={() => setView(user ? 'FEED' : 'DASHBOARD')} />
            )}

            {view === 'READING_QUEST' && (
              <ReadingQuestView onBack={() => setView('CLASSROOMS')} user={user} />
            )}

            {view === 'SCIENCE_QUEST' && (
              <ScienceQuestView onBack={() => setView('CLASSROOMS')} user={user} />
            )}

            {view === 'HISTORY_QUEST' && (
              <HistoryQuestView onBack={() => setView('CLASSROOMS')} user={user} />
            )}

            {view === 'LEARNER_LEDGER' && (
              <LearnerLedgerView onBack={() => setView('CLASSROOMS')} user={user} />
            )}

            {view === 'TEACHER_TOOLS' && (
              <TeacherToolsView onBack={() => setView('CLASSROOMS')} user={user} />
            )}

            {view === 'KIDS_LIBRARY' && (
              <KidsLibraryView onBack={() => setView('BOOKS')} />
            )}

            {view === 'PLAJAH_LABS' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-[#00B4D8]/30 border-t-[#00B4D8] rounded-full animate-spin" /></div>}>
                <PlajahLabsView
                  currentUser={userProfile}
                  onNavigate={setView}
                  onVisitUser={handleVisitUser}
                  initialDiscipline={labsDiscipline}
                  onDisciplineConsumed={() => setLabsDiscipline(null)}
                />
              </Suspense>
            )}

            {view === 'HEALTH_FITNESS' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-[#E63946]/30 border-t-[#E63946] rounded-full animate-spin" /></div>}>
                <PlajahHealthFitnessView currentUser={userProfile} />
              </Suspense>
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

            {view === 'ORG_HUB' && user && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <OrgHub user={user} onBack={() => { setOrgHubInitial(null); setView('CREATOR'); }} initialOrgId={orgHubInitial?.orgId} initialGive={orgHubInitial?.give} onVisitUser={(uid) => { setViewedUserId(uid); setView('USER_PROFILE'); }} />
              </Suspense>
            )}

            {view === 'PLAJAH_ELEVATE' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <PlajahElevate
                  isSignedIn={!!user}
                  isAdmin={userProfile?.role === 'admin' || user?.email === 'kmoody2003@gmail.com'}
                  onOpenOrg={(orgId) => { if (user) { setOrgHubInitial({ orgId }); setView('ORG_HUB'); } else { loginWithGoogle(); } }}
                  onCreate={() => { if (user) { setView('CREATOR'); } else { loginWithGoogle(); } }}
                />
              </Suspense>
            )}

            {view === 'MEDIA_ROUTER' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <VideoRouterConsole onBack={() => setView('TV_STUDIO')} />
              </Suspense>
            )}

            {view === 'PLATFORM_CHANGELOG' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <PlatformChangelog
                  onBack={() => setView('HELP_CENTER')}
                  showTechnical={userProfile?.role === 'admin' || user?.email === 'kmoody2003@gmail.com'}
                />
              </Suspense>
            )}

            {view === 'TERRA' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <TerraHub onNavigate={handleGlobalNavigate} />
              </Suspense>
            )}

            {view === 'TERRA_MAP' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <TerraExplorer
                  onBack={() => setView('TERRA')}
                  onOpenPassport={(parcelId) => { setTerraPassportTarget({ parcelId }); setView('TERRA_PASSPORT'); }}
                  onOpenStudio={(parcelId) => { setTerraStudioParcel(parcelId); setView('TERRA_STUDIO'); }}
                />
              </Suspense>
            )}

            {view === 'TERRA_PASSPORT' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <PropertyPassport
                  parcelId={terraPassportTarget?.parcelId}
                  listingKey={terraPassportTarget?.listingKey}
                  currentUser={userProfile}
                  onBack={() => setView('TERRA')}
                />
              </Suspense>
            )}

            {view === 'TERRA_STUDIO' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <ParcelStudio parcelId={terraStudioParcel} currentUser={userProfile} onBack={() => setView('TERRA')} />
              </Suspense>
            )}

            {view === 'TERRA_SCOUT' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <SiteScout currentUser={userProfile} onBack={() => setView('TERRA')} />
              </Suspense>
            )}

            {view === 'TERRA_FILM' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <ListingFilm currentUser={userProfile} onBack={() => setView('TERRA')} onOpenFabula={() => setView('FABULA')} />
              </Suspense>
            )}

            {view === 'TERRA_FEED' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <TerraFeed
                  onBack={() => setView('TERRA')}
                  onOpenListing={(listingKey) => { setTerraPassportTarget({ listingKey }); setView('TERRA_PASSPORT'); }}
                />
              </Suspense>
            )}

            {view === 'TERRA_LISTINGS' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <div className="h-full flex flex-col bg-transparent text-white">
                  <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4 shrink-0">
                    <div className="max-w-4xl mx-auto flex items-center gap-3">
                      <button onClick={() => setView('TERRA')} className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white/90 transition-colors shrink-0" title="Back to Terra">
                        <ChevronLeft size={14} />
                      </button>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ background: '#5B8DEF20', borderColor: '#5B8DEF40' }}>
                        <Home size={16} style={{ color: '#5B8DEF' }} />
                      </div>
                      <div>
                        <h1 className="text-sm font-black uppercase tracking-widest text-white">Listings</h1>
                        <p className="text-[10px] font-bold" style={{ color: '#5B8DEF' }}>Create · publish · manage — on the open record</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-4xl mx-auto px-6 py-6">
                      <TerraListings currentUser={userProfile} onNavigate={handleGlobalNavigate} />
                    </div>
                  </div>
                </div>
              </Suspense>
            )}

            {view === 'PLAJAH_BUSINESS' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <PlajahBusinessHub
                  onNavigate={handleGlobalNavigate}
                  currentUser={userProfile}
                  isLoggedIn={!!user}
                />
              </Suspense>
            )}

            {view === 'BUSINESS_DASHBOARD' && user && userProfile && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <BusinessDashboard currentUser={userProfile} onNavigate={handleGlobalNavigate} />
              </Suspense>
            )}

            {view === 'AD_PACKAGES' && user && userProfile && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <AdPackageManager currentUser={userProfile} />
              </Suspense>
            )}

            {view === 'VIDEO_MANAGER' && user && (
              <VideoManager 
                user={user}
                onBack={() => setView('CREATOR')}
              />
            )}

            {view === 'SANCTUARY_HUB' && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <SanctuaryHubView
                  onBack={() => setView('DASHBOARD')}
                  onVisitProfile={(uid) => { setViewedUserId(uid); setView('USER_PROFILE'); }}
                  onOpenDemo={() => { setViewedUserId(DEMO_SANCTUARY_ID); setView('SANCTUARY'); }}
                  currentUserId={user?.uid}
                  currentUserProfile={userProfile ?? undefined}
                />
              </Suspense>
            )}

            {view === 'SANCTUARY' && viewedUserId === DEMO_SANCTUARY_ID && (
              <SanctuaryDemoView
                onBack={() => setView('SANCTUARY_HUB')}
                onCreate={() => { setViewedUserId(null); setView('SANCTUARY'); }}
              />
            )}
            {view === 'SANCTUARY' && viewedUserId !== DEMO_SANCTUARY_ID && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <SanctuaryView
                  creatorId={viewedUserId || user?.uid || ''}
                  currentUserProfile={userProfile ?? undefined}
                  isOwnProfile={!viewedUserId || viewedUserId === user?.uid}
                  onBack={() => setView('SANCTUARY_HUB')}
                  onCreatePitchDeck={(deck) => { setPitchDeckInitialDeck(deck); setView('PITCH_DECK_STUDIO'); }}
                />
              </Suspense>
            )}

            {view === 'STORE_HUB' && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <StoreHubView
                  onBack={() => setView('DASHBOARD')}
                  onVisitStore={(uid) => { setViewedUserId(uid); setView('STORE'); }}
                  currentUserId={user?.uid}
                />
              </Suspense>
            )}

            {view === 'STORE' && viewedUserId === DEMO_STORE_ID && (
              <StoreDemoView
                onBack={() => setView('STORE_HUB')}
                onCreate={() => { if (user) { setViewedUserId(user.uid); setView('STORE'); } else loginWithGoogle(); }}
              />
            )}
            {view === 'STORE' && viewedUserId !== DEMO_STORE_ID && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <StorePageView
                  onBack={() => setView('STORE_HUB')}
                  onGarageSale={() => setView('GARAGE_SALE')}
                  sellerId={viewedUserId ?? undefined}
                />
              </Suspense>
            )}

            {view === 'GARAGE_SALE' && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <GarageSaleView
                  onBack={() => setView('STORE')}
                  currentUserId={user?.uid}
                  currentUserName={user?.displayName ?? undefined}
                  currentUserPhoto={user?.photoURL ?? undefined}
                />
              </Suspense>
            )}

            {view === 'BUSINESS_PUBLIC' && selectedBusinessPage && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <BusinessPublicPage
                  business={selectedBusinessPage}
                  onBack={() => setView('DASHBOARD')}
                  currentUserId={user?.uid}
                  currentUserName={user?.displayName ?? undefined}
                  onCreatePitchDeck={(deck) => { setPitchDeckInitialDeck(deck); setView('PITCH_DECK_STUDIO'); }}
                />
              </Suspense>
            )}

            {view === 'BRAND_PUBLIC' && selectedBrandPage && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <BrandPublicPage
                  brand={selectedBrandPage}
                  onBack={() => setView('DASHBOARD')}
                />
              </Suspense>
            )}

            {view === 'DASHBOARD' && (
              <div className="relative flex flex-col lg:flex-row w-full h-full">
                {/* Hero globe — the same moving Earth from the landing, filling the top of the
                    page and fading into the background as it reaches the content/categories
                    (like the Chora page). Lazy + error-boundaried; pointer-events-none so it
                    never blocks the UI. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[85vh] overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
                  <Suspense fallback={null}>
                    <div className="absolute inset-0 opacity-[0.55]"><EarthGlobe /></div>
                  </Suspense>
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(2,2,2,0.10) 0%, rgba(2,2,2,0.45) 48%, var(--bg-color, #020202) 92%)' }} />
                </div>
                <div className="relative z-10 flex-1 p-6 lg:p-16 max-w-7xl mx-auto w-full">
                  <header className="mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                    <div>
                      <h1 className="text-5xl md:text-[9rem] lg:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.82] italic select-none mb-6 text-center lg:text-left">Plajah Global Archive</h1>
                      {/* Intro copy — centered in its own frosted panel for symmetry (was loose,
                          left-ragged text that read as sloppy). */}
                      <div className="mx-auto lg:mx-0 max-w-2xl mb-6 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md px-6 py-5 sm:px-8 sm:py-6 text-center space-y-3 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]">
                        <p className="text-white/75 text-[13px] sm:text-[15px] leading-relaxed text-balance">Stream music, movies, and books — then connect directly with the creators who made them. Plajah is the <span className="text-small-orange font-semibold">social network and streaming platform</span> built to do right by every creator, no matter how or what they create.</p>
                        <p className="text-white/55 text-[13px] sm:text-[15px] leading-relaxed text-balance">The simplest, most transparent way to share your work, grow a real audience, and earn from what you love — on a platform with a <span className="text-white font-semibold">purpose bigger than the bottom line</span>.</p>
                        <p className="text-white/35 text-[10px] sm:text-[11px] font-black tracking-[0.25em] uppercase pt-1">Explore what inspires you · Upload what defines you</p>
                      </div>
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
                      <Suspense fallback={null}>
                        <PlajahPlusBanner className="mb-8 max-w-2xl" />
                      </Suspense>

                      {/* ── World Cup 2026 Archive Banner (temporary — expires July 29 2026) ── */}
                      {!wcMobileBannerDismissed && Date.now() < 1753747200000 && (
                        <div
                          className="relative flex items-center gap-5 px-6 py-5 rounded-[1.5rem] mb-8 max-w-2xl overflow-hidden cursor-pointer group hover:scale-[1.01] transition-transform"
                          style={{ background: 'linear-gradient(100deg, #003d00 0%, #005a00 35%, #b35c00 75%, #ff8c00 100%)', border: '1px solid rgba(255,255,255,0.12)' }}
                          onClick={() => setView('PLAJAH_SPORTS' as any)}
                        >
                          {/* Subtle flag-stripe overlay */}
                          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.3) 40px, rgba(255,255,255,0.3) 41px)' }} />
                          <span className="text-4xl select-none shrink-0 drop-shadow-lg">⚽</span>
                          <div className="flex-1 min-w-0 relative z-10">
                            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60 mb-0.5">FIFA World Cup 2026</p>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white leading-none">Step into the World Cup</h3>
                            <p className="text-xs text-white/50 mt-1">Live scores · Fan clubs · National anthems · 48 nations</p>
                          </div>
                          <div className="relative z-10 flex items-center gap-3 shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); setView('PLAJAH_SPORTS' as any); }}
                              className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-black hover:bg-small-orange hover:text-white transition-colors shadow-lg"
                            >
                              Explore →
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); localStorage.setItem('wc26_mobile_banner_dismissed', '1'); setWcMobileBannerDismissed(true); }}
                              className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white/40 hover:text-white transition-colors text-sm"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-6 mt-8 overflow-x-auto no-scrollbar pb-2">
                        {(['MUSIC', 'WORLDS', 'CLUBS', 'SOCIAL', 'SPORTS', 'LIVE_HUB', 'VIDEO', 'MOVIES_TV', 'BOOK', 'GAMES', 'MODULES', 'MY_ARCHIVE'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => {
                              if (tab === 'WORLDS') setView('WORLDS');
                              else if (tab === 'CLUBS') setView('CLUBS');
                              else if (tab === 'SOCIAL') setView('FEED');
                              else if (tab === 'SPORTS') setView('PLAJAH_SPORTS');
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
                            {tab === 'MY_ARCHIVE' ? 'My Archive' : tab === 'MOVIES_TV' ? 'Movies & TV' : tab === 'VIDEO' ? 'Videos' : tab === 'LIVE_HUB' ? 'Live' : tab === 'SPORTS' ? 'Sports' : tab === 'SOCIAL' ? 'Social' : tab}
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
                            <button onClick={() => loginWithGoogle()} className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest">Sign In</button>
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
            {view === 'VIDEOS' && !getPlatformInfo().isTV && <VideoTab profile={userProfile} isOwner={false} onSelectVideo={handleSelectItem} currentUser={userProfile} onVisitUser={handleVisitUser} initialPlaylistId={videoPlaylistInitialId} onPlaylistOpened={() => setVideoPlaylistInitialId(undefined)} onSetQueue={setVideoQueue} />}
            {view === 'ADMIN_AD_DASHBOARD' && (userProfile?.role === 'admin' || userProfile?.role === 'staff') && (
              <AdminAdDashboard onBack={() => setView('DASHBOARD')} />
            )}
            {view === 'PARTNER_DASHBOARD' && (userProfile?.accountType === 'PARTNER' || userProfile?.role === 'admin' || userProfile?.role === 'staff') && userProfile && (
              <PartnerDashboard profile={userProfile} onBack={() => setView('DASHBOARD')} />
            )}

            {view === 'CREATOR_PAYMENTS' && userProfile && (
              <CreatorPaymentDashboard currentUser={userProfile} />
            )}

            {view === 'ARTIST_MANAGER' && user && userProfile && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <ArtistProjectManager currentUser={userProfile} />
              </Suspense>
            )}


            {/* On a TV the four tabs ARE the navigation — see TvTopTabs for why a sidebar is the
                wrong shape for a remote.
                ORDER MATTERS: every TV screen must render AFTER this block. The screens are
                h-full, so anything rendered above the bar takes the whole viewport and pushes the
                bar off the top — which is exactly what happened to Reello. */}
            {getPlatformInfo().isTV && (
              <TvTopTabs
                activeView={view}
                onSelect={(v) => setView(v as AppView)}
                focused={tvTabsFocused}
                onExitDown={() => setShellFocus(false)}
                onOpenSearch={() => { setShellFocus(false); setView('TV_SEARCH' as AppView); }}
                onOpenNowPlaying={() => {
                  setShellFocus(false);
                  // Go back to the SOURCE that is playing, not a generic player: an album
                  // returns to its album screen, radio to Radio. Landing somewhere that isn't
                  // what you're hearing is disorienting on a TV, where there is no address bar
                  // to tell you where you are.
                  if (audioSource === 'RADIO') { setView('RADIO' as AppView); return; }
                  if (currentAlbum) { handleSelectItem(currentAlbum); return; }
                  setView('PLAYER' as AppView);
                }}
              />
            )}

            {/* Reello on a television is its own screen, modelled on the YouTube TV app —
                landscape rows, a fixed destination rail, and selection going straight to
                fullscreen playback. VideoTab is a pointer-and-scroll surface and does not
                survive a D-pad. */}
            {view === 'VIDEOS' && getPlatformInfo().isTV && (
              <Suspense fallback={null}>
                <ReelloTvView
                  userProfile={userProfile}
                  onSelectVideo={handleSelectItem}
                  onVisitChannel={(p) => handleVisitUser(p.uid)}
                />
              </Suspense>
            )}

            {/* Global TV search — reachable from the top bar's Search chip. handleSelectItem is the
                universal router (album→player, film→MOVIE_UX, video→player), so all three catalogues
                open exactly where their own home screens would send them. */}
            {view === 'TV_SEARCH' && getPlatformInfo().isTV && (
              <Suspense fallback={null}>
                <TvSearchView
                  onBack={() => setView('MOVIES_TV' as AppView)}
                  onSelectAlbum={handleSelectItem}
                  onSelectMovie={handleSelectItem}
                  onSelectVideo={handleSelectItem}
                />
              </Suspense>
            )}

            {/* Profile on a TV is the short settings list, not the full desktop surface. */}
            {getPlatformInfo().isTV && view === 'USER_PROFILE' && (
              <Suspense fallback={null}>
                <TvSettingsView
                  userProfile={userProfile}
                  subscriptionLabel={(userProfile as any)?.subscriptionTier || 'Free'}
                  onSignOut={() => { try { logout(); } catch { /* ignore */ } }}
                  onSwitchAccount={() => { try { logout(); } catch { /* ignore */ } }}
                  onOpenPurchases={() => setView('CREATOR_PAYMENTS' as AppView)}
                />
              </Suspense>
            )}

            {/* Lean-back slideshow. The context already starts one after twenty seconds of
                uninterrupted TV playback; until now nothing on television drew it. Mounted
                outside the view switch because it belongs to playback, not to whichever screen
                the viewer happens to have left open. */}
            {getPlatformInfo().isTV && (
              <Suspense fallback={null}><TvSlideshowSurface /></Suspense>
            )}

            {/* FX Stage on TV — the audio-reactive visualizer, opened from the Chora album screen.
                A fullscreen takeover like the slideshow; renders only when isTvFxActive. */}
            {getPlatformInfo().isTV && (
              <Suspense fallback={null}><TvFxSurface /></Suspense>
            )}

            {/* The persistent TV transport — always at the bottom once something is playing, so the
                viewer never loses pause/play wherever they browse. Suppressed on the Chora album
                screen (it draws its own bottom transport) and during the slideshow (its own controls),
                so there is never a second transport on screen — the bar handles that itself, but we
                also tell it when the album view owns the screen. */}
            {getPlatformInfo().isTV && (
              <Suspense fallback={null}>
                <TvNowPlayingBar albumViewActive={view === 'PLAYER' || view === 'PREVIEW'} />
              </Suspense>
            )}

            {/* A view we deliberately don't run on TV — say so, and say where it does live. */}
            {tvBlocked && (
              <TvUnavailableNotice
                feature={tvBlocked.feature}
                title={tvBlocked.title}
                onBack={() => setView('DASHBOARD')}
              />
            )}

            {view === 'PLAJAH_STUDIO' && user && userProfile && !tvBlocked && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <StudioView />
              </Suspense>
            )}

            {view === 'FABULA' && user && !tvBlocked && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <Fabula />
              </Suspense>
            )}

            {view === 'ARTIST_BOARDS' && user && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <ArtistBoards onBack={() => setView('ARTIST_MANAGER')} />
              </Suspense>
            )}

            {view === 'EVENT_PRODUCTION_STUDIO' && user && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <EventProductionStudio
                  onBack={() => setView('ARTIST_MANAGER')}
                  onOpenTicketDesigner={() => setView('TICKET_DESIGNER')}
                  onOpenBoards={() => setView('ARTIST_BOARDS')}
                />
              </Suspense>
            )}

            {view === 'TICKET_DESIGNER' && user && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <TicketDesigner onBack={() => setView('EVENT_PRODUCTION_STUDIO')} />
              </Suspense>
            )}

            {view === 'EVENTS' && (
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <LiveEventsGallery />
              </Suspense>
            )}

            {view === 'EVENT_DETAIL' && selectedEventId && (
              <EventLandingPage eventId={selectedEventId} currentUser={userProfile} onBack={() => setView('EVENTS')} onSignIn={() => loginWithGoogle()} />
            )}

            {view === 'EVENT_CREATE' && userProfile && (
              <EventCreationWizard currentUser={userProfile} onSaved={id => { setSelectedEventId(id); setView('EVENT_DETAIL'); }} onBack={() => setView('EVENT_DASHBOARD')} />
            )}

            {view === 'EVENT_DASHBOARD' && userProfile && (
              <EventTicketingDashboard
                currentUser={userProfile}
                onCreateEvent={() => setView('EVENT_CREATE')}
                onEditEvent={id => { setSelectedEventId(id); setView('EVENT_CREATE'); }}
                onViewEvent={id => { setSelectedEventId(id); setView('EVENT_DETAIL'); }}
                onLaunchKiosk={id => { setKioskEventId(id); setView('EVENT_KIOSK'); }}
                onLaunchScanner={id => { setScannerEventId(id); setView('EVENT_DASHBOARD'); }}
              />
            )}

            {view === 'MY_TICKETS' && selectedTicketId && userProfile && (
              <TicketView ticketId={selectedTicketId} currentUser={userProfile} onBack={() => setView('MY_TICKETS')} />
            )}

            {view === 'EVENT_KIOSK' && kioskEventId && userProfile && (
              <KioskMode eventId={kioskEventId} eventTitle="Live Event" creatorUid={userProfile.uid} currentUser={userProfile} onExit={() => { setKioskEventId(null); setView('EVENT_DASHBOARD'); }} />
            )}

            {scannerEventId && (
              <TicketScanner eventId={scannerEventId} onBack={() => setScannerEventId(null)} />
            )}
            {view === 'HELP_CENTER' && (
              <HelpCenter onBack={() => setView('DASHBOARD')} onOpenChangelog={() => setView('PLATFORM_CHANGELOG')} />
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
            {/* Chora on a television is a separate screen, not the web view with things hidden.
                It declares its own D-pad model (see hooks/useTvGrid) instead of relying on
                geometric inference, which is what made the adapted version unpredictable.
                Album playback still uses the existing TV album/player layout. */}
            {view === 'MUSIC' && getPlatformInfo().isTV && (
              <Suspense fallback={<div className="h-full grid place-items-center text-white/30 text-xs font-black uppercase tracking-[0.3em]">Loading Chora…</div>}>
                <ChoraTvView
                  userProfile={userProfile}
                  onSelectAlbum={handleSelectItem}
                  onOpenSection={() => { /* sections render in-place; nothing to route yet */ }}
                  onOpenPlus={() => setView('SANCTUARY_HUB' as AppView)}
                />
              </Suspense>
            )}

            {view === 'MUSIC' && !getPlatformInfo().isTV && (
              <MusicView
                onBack={() => setView('DASHBOARD')}
                onSelectAlbum={handleSelectItem}
                onVisitUser={handleVisitUser}
                userProfile={userProfile}
                initialTab={musicInitialTab}
                onUploadMusic={() => setShowCreator(true)}
                onNavigate={(v) => setView(v as any)}
              />
            )}
            {view === 'BOOKS' && (
              <div className="bg-transparent min-h-screen">
                <BookTab
                  onSelectBook={(b) => {
                    setSelectedAlbum(null);
                    setSelectedVideo(null);
                    setSelectedGame(null);
                    setSelectedBook(b);
                    setView('BOOK_READER');
                  }}
                  onVisitUser={(uid, tab) => handleVisitUser(uid, tab as any)}
                  onCreateBook={() => setView('BOOK_STUDIO')}
                  onCreateScript={() => { setSelectedScriptId(undefined); setView('SCRIPT_STUDIO'); }}
                />
              </div>
            )}
            {view === 'BOOK_STUDIO' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading studio…</div>}>
                <BookAuthoringStudio onBack={() => setView('BOOKS')} />
              </Suspense>
            )}
            {view === 'COMIC_MUSEUM' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading museum…</div>}>
                <ComicMangaMuseum
                  onBack={() => setView('BOOKS')}
                  onSelectBook={(b) => { setSelectedBook(b); setView('BOOK_READER'); }}
                />
              </Suspense>
            )}
            {view === 'LICENSE_REQUESTS' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading requests…</div>}>
                <LicenseRequestsInbox onBack={() => setView('CREATOR')} onOpenFilm={() => setView('FABULA' as AppView)} />
              </Suspense>
            )}
            {view === 'AUDIUS_ARTIST' && audiusArtist && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading artist…</div>}>
                <AudiusArtistPage
                  artist={audiusArtist}
                  onBack={() => setView('MUSIC')}
                  onSelectAlbum={async (album) => {
                    const tracks = await fetchAudiusPlaylistTracks(album.id).catch(() => []);
                    setSelectedVideo(null); setSelectedBook(null);
                    setSelectedAlbum(audiusAlbumToNativeAlbum(album, tracks, audiusArtist));
                    setView('PLAYER');
                  }}
                />
              </Suspense>
            )}

            {/* ── Script Writing Studio — film, TV, stage ── */}
            {view === 'SCRIPT_STUDIO' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading Script Studio…</div>}>
                <ScriptWritingStudio
                  scriptId={selectedScriptId}
                  onBack={() => { setSelectedScriptId(undefined); setView('BOOKS'); }}
                  user={user}
                  onNavigate={(v) => setView(v as any)}
                />
              </Suspense>
            )}

            {/* ── AudioBook Studio (MAI Voice 2 + MAI Transcribe 1.5) ── */}
            {view === 'AUDIO_BOOK_STUDIO' && selectedBook && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading Audio Studio…</div>}>
                <AudioBookStudio book={selectedBook} onBack={() => setView('BOOKS')} user={user} />
              </Suspense>
            )}

            {/* ── History Moments ── */}
            {view === 'CHORA_HISTORY' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <HistoryMomentsView category="MUSIC" onBack={() => setView('MUSIC')} user={user} />
              </Suspense>
            )}
            {view === 'TALEO_HISTORY' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <HistoryMomentsView category="FILM_TV" onBack={() => setView('MOVIES_TV')} user={user} />
              </Suspense>
            )}

            {/* ── Music Theory Studio ── */}
            {view === 'MUSIC_THEORY' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <MusicTheoryStudio onBack={() => setView('MUSIC')} user={user} />
              </Suspense>
            )}

            {/* ── Chora Conservatory — music museum + history ── */}
            {view === 'CHORA_CONSERVATORY' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <ChoraConservatory onBack={() => setView('MUSIC')} />
              </Suspense>
            )}

            {/* ── Film & TV School ── */}
            {view === 'FILM_SCHOOL' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <FilmSchoolView onBack={() => setView('MOVIES_TV')} user={user} />
              </Suspense>
            )}

            {/* ── Math Classroom (BETA) ── */}
            {view === 'MATH_CLASSROOM' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <MathClassroom onBack={() => setView('CLASSROOMS')} user={user} />
              </Suspense>
            )}
            {view === 'BOOK_READER' && selectedBook && (
              // Relative, full-height wrapper so the CONTAINED reader (absolute inset-0)
              // fills the content column between the pillars and the right edge.
              <div className="relative flex-1 min-h-0 w-full">
              <ErrorBoundary onReset={() => { setSelectedBook(null); setView('BOOKS'); }}>
                <Suspense fallback={
                  <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center gap-4">
                    <div className="w-10 h-10 border-2 border-[--small-orange]/20 border-t-[--small-orange] rounded-full animate-spin" />
                    <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Opening your book…</p>
                  </div>
                }>
                  <BookReader
                    book={selectedBook}
                    onBack={() => { setSelectedBook(null); setPartyIdForReader(null); setView('BOOKS'); }}
                    currentUser={user}
                    onVisitUser={handleVisitUser}
                    onOpenAudioStudio={() => setView('AUDIO_BOOK_STUDIO')}
                    partyId={partyIdForReader || undefined}
                  />
                </Suspense>
              </ErrorBoundary>
              </div>
            )}
            {view === 'CREATOR' && user && <UserDashboard user={user} initialTab={dashboardInitialTab} onBack={() => setView('DASHBOARD')} onOpenTVStudio={() => setView('TV_STUDIO')} onOpenScriptStudio={(fmt) => { setSelectedScriptId(undefined); setView('SCRIPT_STUDIO'); }} />}
            {(view === 'SEARCH' || view === 'PEOPLE') && <SearchView onBack={() => setView('DASHBOARD')} onVisitUser={handleVisitUser} currentUser={user} initialQuery={searchQuery} initialFilter={view === 'PEOPLE' ? 'PEOPLE' : undefined} />}
            {view === 'FEED' && (
              <FeedView
                onBack={() => setView('DASHBOARD')}
                currentUser={user}
                onVisitUser={handleVisitUser}
                onMessage={handleMessage}
                onSelectGame={handleSelectGame}
                viewerProfile={effectiveProfile}
              />
            )}
            {view === 'LIVE_HUB' && ((isMobile || theme === 'PHONE') ? (
              // Phones get the chat-first / vertical-FAST hub; rotate to landscape → full-screen video.
              <MobileLiveHub onBack={() => setView('DASHBOARD')} uid={user?.uid} />
            ) : (
              <LiveHubView
                onBack={() => setView('DASHBOARD')}
                currentUser={user}
                onJoinPool={(poolId) => {
                  setSelectedPoolId(poolId);
                  setView('EVENT_PHOTO_POOL');
                }}
                onOpenTVStudio={() => setView('TV_STUDIO')}
              />
            ))}
            {view === 'RADIO' && <RadioView onBack={() => setView('DASHBOARD')} artistId={selectedRadioArtistId} />}
            {/* Taleo on a TV gets the purpose-built declarative-grid screen (like Chora/Reello);
                pointer/desktop keeps the geometric MoviesTVView. Selection is identical. */}
            {view === 'MOVIES_TV' && getPlatformInfo().isTV && (
              <Suspense fallback={null}>
                <MoviesTvView onBack={() => setView('DASHBOARD')} onSelectMovie={(m) => { setSelectedMovieItem(m); setView('MOVIE_UX'); }} />
              </Suspense>
            )}
            {view === 'MOVIES_TV' && !getPlatformInfo().isTV && <MoviesTVView onBack={() => setView('DASHBOARD')} onSelectMovie={(m) => { setSelectedMovieItem(m); setView('MOVIE_UX'); }} onNavigate={(v) => setView(v as any)} />}
            {view === 'GAMES' && <GamesView onBack={() => setView('DASHBOARD')} onSelectGame={handleSelectGame} />}
            {view === 'APPS' && <AppsView onBack={() => setView('DASHBOARD')} currentUser={userProfile} />}
            {view === 'CROSSOVER' && !tvBlocked && (
              <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-zinc-950"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <CrossoverView onBack={() => setView('DASHBOARD')} userProfile={userProfile} onNavigate={(v) => setView(v as any)} enabled={crossoverSystemEnabled} />
              </Suspense>
            )}
            {view === 'PLAJAH_PIXELS' && !tvBlocked && <PlajahPixelsView payload={pixelsPayload} onClose={() => { setPixelsPayload(null); setView(pixelsPayload?.album || pixelsPayload?.track ? 'PLAYER' : 'APPS'); }} />}

            {view === 'TELEPROMPTER' && !tvBlocked && (
              <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-zinc-950"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <TeleprompterApp onClose={() => setView('APPS')} />
              </Suspense>
            )}
            {view === 'SPATIAL_MIXER' && (
              <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-zinc-950"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <SpatialMixer onClose={() => setView('APPS')} />
              </Suspense>
            )}
            {view === 'MEDIA_CONVERTER' && (
              <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-zinc-950"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <MediaConverter onClose={() => setView('APPS')} />
              </Suspense>
            )}
            {view === 'SMART_DIRECTOR' && (
              <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-zinc-950"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>}>
                <SmartDirectorView productionId={smartDirectorPayload?.productionId} event={smartDirectorPayload?.event} currentUser={userProfile} onBack={() => setView('DASHBOARD')} />
              </Suspense>
            )}
            {view === 'BIBLE' && <BibleExperience onBack={() => setView('BOOKS')} />}
            {view === 'CLASSROOMS' && <ClassroomsView onBack={() => setView('DASHBOARD')} user={user} onNavigate={(v) => setView(v as any)} />}
            {view === 'GLOBAL_PHOTOS' && <GlobalPhotosView onVisitUser={handleVisitUser} initialMode="WATERFALL" onOpenArtMuseum={() => setView('ART_GALLERY')} />}
            {view === 'ART_GALLERY' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading…</div>}>
                <ArtGalleryView onBack={() => setView('GLOBAL_PHOTOS')} currentUser={user} />
              </Suspense>
            )}
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
              <ErrorBlock componentName="UserProfileView">
                <UserProfileView
                  uid={viewedUserId}
                  onBack={() => { handleBackToDashboard(); setInitialProfileTab(undefined); }}
                  onSelectAlbum={handleSelectItem}
                  onSelectGame={handleSelectGame}
                  onVisitUser={handleVisitUser}
                  onMessage={handleMessage}
                  onSelectArticle={(article) => { setSelectedArticle(article); setView('ARTICLE_VIEW'); }}
                  initialTab={initialProfileTab as any}
                  onNavigate={setView}
                  onNotificationNavigate={handleNotificationNavigate}
                  onOpenCreator={(type) => {
                    setCreatorInitialType(type);
                    setEditingAlbum(null);
                    setShowCreator(true);
                  }}
                />
              </ErrorBlock>
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
                onBack={handleBackToChora}
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
                onOpenItem={handleSelectItem}
                onNavigateToWorld={(worldId, characterId) => { setViewedUserId(selectedAlbum.ownerId || user?.uid || ''); setWorldFocus({ worldId, characterId }); setView('WORLDS'); }}
                isPublic={isPublicView}
                isPreview={view === 'PREVIEW'}
                user={user}
                partyId={partyIdForAlbum || undefined}
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
                  onNavigateToWorld={(worldId, characterId) => { setViewedUserId((selectedMovieItem as any).ownerId || user?.uid || ''); setWorldFocus({ worldId, characterId }); setView('WORLDS'); }}
                  onOpenItem={(it) => { setSelectedMovieItem(it); try { window.scrollTo({ top: 0 }); } catch {} }}
                  onEditFilm={(it) => { setEditingAlbum(it as Album); setCreatorInitialType(undefined); setShowCreator(true); }}
                  currentUser={user}
                />
              </ErrorBlock>
            )}
            {view === 'CLUBS' && <ClubsView onBack={() => setView('DASHBOARD')} currentUser={user} initialClubId={clubInitialId} onCreatePitchDeck={(deck) => { setPitchDeckInitialDeck(deck); setView('PITCH_DECK_STUDIO'); }} />}
            {view === 'RELLO' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <RelloView onBack={handleBackToDashboard} currentUser={user} initialVideoId={relloInitialVideoId} />
              </Suspense>
            )}
            {view === 'CHARITY' && <CharityView onBack={() => setView('DASHBOARD')} />}
            {view === 'CHALLENGES' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <ChallengeHub onBack={() => setView('DASHBOARD')} />
              </Suspense>
            )}
            {view === 'BROADCAST_CHANNELS' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <BroadcastChannelView onBack={() => setView('DASHBOARD')} profileUid={user?.uid} />
              </Suspense>
            )}
            {view === 'CLOSE_FRIENDS' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <CloseFriendsView onBack={() => setView('DASHBOARD')} onVisitUser={handleVisitUser} />
              </Suspense>
            )}
            {view === 'POLL_ARCHIVE' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <PollResultsArchive onBack={() => setView('DASHBOARD')} />
              </Suspense>
            )}
            {view === 'SOCIAL_INSIGHTS' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <SocialInsightsDashboard onBack={() => setView('DASHBOARD')} />
              </Suspense>
            )}
            {view === 'DISCUSSION' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <DiscussionView onBack={() => setView('DASHBOARD')} currentUser={user} />
              </Suspense>
            )}
            {view === 'DEBATE_DETAIL' && selectedDebateId && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-orange-400 animate-spin" /></div>}>
                <DebateView debateId={selectedDebateId} onBack={() => setView('DASHBOARD')} />
              </Suspense>
            )}
            {view === 'WORLDS' && <WorldsView onNavigate={setView} onEdit={(world) => { setSelectedWorld(world); setView('WORLD_MANAGER'); }} userProfile={userProfile} artistUid={viewedUserId || user?.uid || ''} focus={worldFocus} onFocusConsumed={() => setWorldFocus(null)} />}
            {view === 'WORLD_MANAGER' && (
              <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-10 h-10 border-2 border-[--small-orange]/30 border-t-[--small-orange] rounded-full animate-spin" /></div>}>
                <ErrorBoundary>
                  <WorldManagerView
                    initialWorld={selectedWorld || undefined}
                    onSave={async (w) => {
                      if (w.id) {
                        await updateIPWorld(w.id, w);
                      } else {
                        await createIPWorld({ ...w, creatorId: user?.uid });
                      }
                      setSelectedWorld(null);
                      setView('WORLDS');
                    }}
                    onPreview={(w) => {
                      setSelectedWorld(w);
                      setView('WORLDS');
                    }}
                  />
                </ErrorBoundary>
              </Suspense>
            )}
            {view === 'AVATAR_STUDIO' && userProfile && (
              <AvatarStudio
                userProfile={userProfile}
                onBack={() => setView('USER_PROFILE')}
                onSave={async (config) => {
                  await updateUserProfile(userProfile.uid, { avatar: config } as any);
                  setUserProfile(prev => prev ? { ...prev, avatar: config } : prev);
                  setView('USER_PROFILE');
                }}
              />
            )}
            {view === 'BROWSER' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-xs uppercase tracking-widest">Loading Browser...</div>}>
                <BrowserPanel initialUrl="https://impact.com" />
              </Suspense>
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
                  setVideoQueue([]);
                  setPartyIdForPlayer(null);
                  setView('VIDEOS');
                }}
                currentUser={user}
                queue={videoQueue}
                onPlayQueued={(v) => setSelectedVideo(v)}
                partyId={partyIdForPlayer || undefined}
              />
            )}
            {/* ── Internal pitch documents ── not linked in nav ────────────── */}
            {view === 'PITCH_MUSIC'   && <Suspense fallback={null}><MusicPitchDoc /></Suspense>}
            {view === 'PITCH_FILM'    && <Suspense fallback={null}><FilmPitchDoc /></Suspense>}
            {view === 'PITCH_WRITER'  && <Suspense fallback={null}><WritersPitchDoc /></Suspense>}
            {view === 'RESEARCH_MANIFESTO' && (userProfile?.role === 'admin' || user?.email === 'kmoody2003@gmail.com') && (
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-[#3DFFC0]/30 border-t-[#3DFFC0] rounded-full animate-spin" /></div>}>
                <PlajahResearchPage onBack={() => setView('PLAJAH_LABS')} />
              </Suspense>
            )}
            {view === 'RESEARCH_MANIFESTO' && userProfile?.role !== 'admin' && user?.email !== 'kmoody2003@gmail.com' && (
              <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-white/30">
                <span className="text-4xl">🔒</span>
                <p className="text-[10px] font-black uppercase tracking-widest">Admin access required</p>
              </div>
            )}
            {/* ── TV Studio ── */}
            {view === 'TV_STUDIO' && !tvBlocked && (
              <Suspense fallback={<div className="fixed inset-0 bg-[#0b0b0b] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#6B0099]/30 border-t-[#6B0099] rounded-full animate-spin" /></div>}>
                <TVStudio
                  currentUser={user}
                  onBack={() => setView('LIVE_HUB')}
                />
              </Suspense>
            )}
            {/* ── Pitch Deck Studio ── */}
            {view === 'PITCH_DECK_STUDIO' && (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/20 text-sm">Loading studio…</div>}>
                <PitchDeckStudio
                  onBack={() => { setPitchDeckInitialDeck(null); setView('DASHBOARD'); }}
                  initialDeck={pitchDeckInitialDeck ?? undefined}
                />
              </Suspense>
            )}
          </SpatialUIRoot>
          {showCreator && (
            <AlbumCreator
              onCreated={(alb) => {
                handleCreateAlbum(alb);
                setShowCreator(false);
                setIsCreatorMinimized(false);
                setCreatorInitialType(undefined);
                // If we were editing the film that's open in the detail page, refresh it.
                if (editingAlbum && alb && (alb as any).id === editingAlbum.id) {
                  setSelectedMovieItem((prev: any) => (prev && prev.id === (alb as any).id ? { ...prev, ...alb } : prev));
                }
                setEditingAlbum(null);
              }}
              onCancel={() => {
                setShowCreator(false);
                setEditingAlbum(null);
                setIsCreatorMinimized(false);
                setCreatorInitialType(undefined);
              }}
              onMinimize={() => { setIsCreatorMinimized(true); setIsProjectTrayOpen(true); }}
              isMinimized={isCreatorMinimized}
              initialAlbum={editingAlbum || undefined}
              initialType={creatorInitialType as any}
            />
          )}
          
          {showBrandActivation && (
            <Suspense fallback={null}>
              <BrandActivationPanel
                onClose={() => setShowBrandActivation(false)}
                onDone={() => { setDashboardInitialTab('STORE_MANAGEMENT'); }}
              />
            </Suspense>
          )}

          {showWelcomeAchievement && (
            <WelcomeAchievement onDone={() => setShowWelcomeAchievement(false)} />
          )}

          {showWelcomePackage && (
            <WelcomePackageModal
              displayName={user?.displayName || userProfile?.displayName}
              onDismiss={handleWelcomePackageDismiss}
            />
          )}

          <KidsSessionGuard profile={effectiveProfile} />
          {activeChildProfile && <KidsModeBar child={activeChildProfile} onExit={() => setActiveChildProfile(null)} />}
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
            else if (view === 'GLOBAL_PHOTOS') defaultType = 'PHOTO';
            setEditingAlbum({ type: defaultType } as any);
            setShowCreator(true);
          }}
          onOpenChat={() => setView('CHAT')}
          onOpenAria={() => setIsMuseOpen(o => !o)}
          userProfile={userProfile}
          onUpdateUserProfile={async (updates) => {
            if (!user) return;
            await updateUserProfile(user.uid, updates);
            setUserProfile(prev => prev ? { ...prev, ...updates } : prev);
          }}
        />

         {/* Custom Delete Confirmation Modal */}
        {/* Not on TV: the floating chat widget is a 10-foot irrelevance, and worse, its focusable
            controls sit in a fixed off-screen overlay that trapped D-pad focus — the remote could
            walk into it and never get out. */}
        {user && !isMobile && !getPlatformInfo().isTV && (
          <ChatFlyout
            onNavigateToChat={() => setView('CHAT')}
            onSelectRoom={(roomId) => setSelectedChatRoomId(roomId)}
            userProfile={userProfile}
          />
        )}

        {/* ── Plajah Aria — private creative agent ── */}
        <AriaEventBridge onOpen={() => setIsMuseOpen(true)} />
        <PlajahAgent
          isOpen={isMuseOpen}
          onClose={() => setIsMuseOpen(false)}
          isMobile={isMobile || theme === 'PHONE'}
          tier={resolveAgentTier(
            userProfile?.tier,
            userProfile?.accountType,
          )}
          context={{
            currentView: view,
            userInterests: userProfile?.publicInterests ?? [],
          }}
          onApplyBuild={(build) => {
            console.log('[Aria] Build applied:', build);
          }}
        />
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

      {/* What's-new notification — shows once per new build, splits major/minor */}
      <Suspense fallback={null}>
        <UpdateNotification onOpenChangelog={() => setView('PLATFORM_CHANGELOG')} />
      </Suspense>

      {/* Someone you follow is live → stackable pop-up pill with a Watch jump (below the notification). */}
      {user && !getPlatformInfo().isTV && (
        <LiveFollowPills uid={user.uid} isMobile={isMobile || theme === 'PHONE'} onWatch={(feed) => setActiveLiveFeed(feed as any)} />
      )}

      {/* Customer order tracking — opened on demand (OPEN_MY_ORDERS) or auto after a checkout returns. */}
      {showMyOrders && (
        <Suspense fallback={null}>
          <div className="fixed inset-0 z-[1250] bg-[#0a0a0a] overflow-y-auto pt-6">
            <MyOrdersView onBack={() => setShowMyOrders(false)} />
          </div>
        </Suspense>
      )}

      {/* Character profile — the violet living-character page, opened via OPEN_CHARACTER_PROFILE. */}
      {characterProfile && (
        <Suspense fallback={null}>
          <div className="fixed inset-0 z-[1250] overflow-y-auto">
            <CharacterProfileView
              character={characterProfile}
              worldName={characterProfile.worldName}
              onBack={() => setCharacterProfile(null)}
              onVisitWorld={(wid) => { setCharacterProfile(null); window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'WORLDS', worldId: wid } })); }}
            />
          </div>
        </Suspense>
      )}

      {/* Character chat — talk to a living character persona (OPEN_CHARACTER_CHAT). */}
      {characterChat && (
        <Suspense fallback={null}>
          <CharacterChat character={characterChat} onClose={() => setCharacterChat(null)} />
        </Suspense>
      )}

      {/* Platform-wide bug reporting — attaches the last 5 min of session activity.
          Gated to authenticated users (incl. guests) since errorReports create is auth-only. */}
      {view !== 'LANDING' && !!user && (
        <Suspense fallback={null}>
          <BugReportButton currentView={view} />
        </Suspense>
      )}

      {/* Shared-track landing: 5s auto-play countdown, then plays the shared track. */}
      {autoPlayShare && (
        <AutoPlayCountdown
          trackTitle={autoPlayShare.track.title || 'This track'}
          artist={autoPlayShare.track.artist || autoPlayShare.album.artist || 'Unknown artist'}
          onComplete={() => { playTrack(autoPlayShare.track, autoPlayShare.album, 'LIBRARY'); setAutoPlayShare(null); }}
          onDismiss={() => setAutoPlayShare(null)}
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
      <PublishTray />
      <ProjectTray
        isOpen={isProjectTrayOpen}
        onClose={() => setIsProjectTrayOpen(false)}
        isCreatorMinimized={isCreatorMinimized}
        creatorProjectTitle={editingAlbum?.title || undefined}
        onRestoreCreator={() => { setIsCreatorMinimized(false); setIsProjectTrayOpen(false); }}
        recentAlbums={albums.filter(a => a.ownerId === user?.uid).slice(0, 6)}
      />
      <LiveFeedPlayer
        feed={activeLiveFeed}
        onClose={() => setActiveLiveFeed(null)}
      />

      {/* Release Countdown Page — shown when a scheduled album is opened before its release date */}
      {countdownAlbumId && (
        <Suspense fallback={null}>
          <ReleaseCountdownPage
            albumId={countdownAlbumId}
            initialAlbum={countdownInitialAlbum ?? undefined}
            onClose={() => { setCountdownAlbumId(null); setCountdownInitialAlbum(null); }}
            onUnlock={(album) => {
              setCountdownAlbumId(null);
              setCountdownInitialAlbum(null);
              setSelectedAlbum(album);
              setSelectedVideo(null);
              setSelectedGame(null);
              setView('PLAYER');
            }}
          />
        </Suspense>
      )}

      {/* Plajah+ Billboard modal */}
      <AnimatePresence>
        {showPlajahPlusBillboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setShowPlajahPlusBillboard(false); }}
          >
            <button
              onClick={() => setShowPlajahPlusBillboard(false)}
              className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
            >
              <XIcon size={18} />
            </button>
            <Suspense fallback={null}>
              <PlajahPlusLandingModal onClose={() => setShowPlajahPlusBillboard(false)} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Experience Picker — shown once for new users before onboarding tour */}
      <AnimatePresence>
        {showExperiencePicker && user && (
          <ExperiencePicker onPick={handleExperiencePicked} />
        )}
      </AnimatePresence>

      {/* Challenge VS screen — fires on CHALLENGE_VS custom event */}
      {user && <ChallengeVsController />}

      {/* The Breakdown — fires on OPEN_BREAKDOWN custom event */}
      <TrackBreakdownController onOpenTheoryStudio={() => setView('MUSIC_THEORY')} />

      {/* License a Chora song for a Fabula film — fires on OPEN_LICENSE_FOR_FILM */}
      {licenseForFilm && (
        <Suspense fallback={null}>
          <LicenseForFilmModal
            track={licenseForFilm.track}
            album={licenseForFilm.album}
            onOpenFabula={() => { setLicenseForFilm(null); setView('FABULA' as AppView); }}
            onClose={() => setLicenseForFilm(null)}
          />
        </Suspense>
      )}

      {/* Lorea Scores — saves transcribed notation; opens on OPEN_LOREA_SCORES */}
      <LoreaScoresController />

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
      {/* Not on a television: the drawer's pull-tab floats over every screen at the right edge,
          no D-pad can reach it, and chat without a keyboard is not something anyone wants from a
          sofa. Gated here rather than inside the component, which would mean returning before its
          hooks. */}
      {user && !getPlatformInfo().isTV && <PersistentChatDrawer currentView={view} onNotificationNavigate={handleNotificationNavigate} externalTrigger={notifDrawerTrigger} />}

      {/* Nudge users stuck in an in-app WebView (Google app, etc.) into Chrome. Self-gates:
          renders nothing unless it detects a genuine embedded browser on Android. */}
      <InAppBrowserPrompt />

      {/* Start a Room composer (global overlay; opened via plajah:start-room) */}
      {showStartRoom && <StartRoomModal user={user} onClose={() => setShowStartRoom(false)} />}

      {/* Smart Guide */}
      {user && (
        <SmartGuide
          view={view}
          enabled={smartGuideEnabled}
          onToggle={() => {
            const next = !smartGuideEnabled;
            setSmartGuideEnabled(next);
            updateUserProfile(user.uid, { smartGuideEnabled: next } as any).catch(() => {});
          }}
          isFirstTime={!hasSeenSmartGuide}
          onDismissFirst={() => {
            setHasSeenSmartGuide(true);
            updateUserProfile(user.uid, { hasSeenSmartGuide: true, smartGuideEnabled: true } as any).catch(() => {});
          }}
        />
      )}

      {/* Account Switcher */}
      <AccountSwitcher
        isOpen={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
        currentUser={user}
        linkedAccounts={linkedAccounts}
        onSwitchAccount={async (slot) => {
          const target = linkedAccounts.find(a => a.slot === slot);
          if (!target || target.uid === user?.uid) return;
          setShowAccountSwitcher(false);
          // Pre-select the target account so the switch lands on the right silo.
          await loginWithGoogle(target.email);
        }}
        onAddAccount={async () => {
          // Force the account chooser so a genuinely different account is added.
          const result = await loginWithGoogle();
          if (result) {
            const roster = upsertAccount({
              uid: result.uid, email: result.email, displayName: result.displayName,
              photoURL: result.photoURL, provider: result.providerData[0]?.providerId || 'google.com',
            });
            setLinkedAccounts(roster);
            updateUserProfile(result.uid, { linkedAccounts: roster } as any).catch(() => {});
          }
        }}
        onSignOut={async () => {
          setShowAccountSwitcher(false);
          await logout();
        }}
        hotSwitchSlot={hotSwitchSlot}
      />

      {/* Hot Switch Overlay */}
      <HotSwitchOverlay
        slot={hotSwitchSlot ?? 1}
        account={linkedAccounts.find(a => a.slot === hotSwitchSlot) as any}
        active={hotSwitchSlot !== null}
      />

      {/* Walkie-Talkie always-on standby HUD (renders only when Live Standby is enabled) */}
      <WalkieStandby selfUid={user?.uid} selfName={user?.displayName ?? undefined} />

      </Suspense>
            </SpatialProvider>
                </CallProvider>
                </ActiveIdentityProvider>
          </NotificationProvider>
              </PublishQueueProvider>
        </UploadProvider>
      </AchievementProvider>
        </PointsProvider>
      </BadgeProvider>
      </FediverseProvider>
    </ErrorBoundary>
  );
};

export default App;
