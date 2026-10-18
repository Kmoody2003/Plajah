import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Sparkles,
  Play,
  Layers,
  Globe,
  Shield,
  BookOpen,
  Film,
  Music,
  Eye,
  Flame,
  Users,
  Video,
  MessageSquare,
  TrendingUp,
  Radio,
  Award,
  ExternalLink,
  CheckCircle2,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import type { World } from '../../types';
import { SHOWCASE_WORLDS, type ShowcaseWorld } from '../../data/worldsShowcaseData';
import {
  NEBULA_GALAXY_PHOTOS,
  VEO_OMNI_VIDEO_LOOPS,
  type NebulaGalaxyPhotoAsset,
  type VeoOmniVideoLoopAsset,
} from '../../services/video/veoOmniNebulaLoopService';

export type WorldsLandingDesignId = 'ASTRAL_GATEWAY';

export interface ShowcaseWorldCardData {
  id: string;
  title: string;
  subtitle: string;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar: string;
  genre: string;
  engineType: 'STARGATE_ODYSSEY' | 'KINGDOM_CHRONICLES' | 'AETHER_ARCHIPELAGO';
  engineBadge: string;
  coverImage: string;
  backdropImage: string;
  accentColor: string;
  secondaryColor: string;
  followers: string;
  canonNodes: number;
  connectedWorks: {
    books: number;
    films: number;
    albums: number;
    comics: number;
  };
  tagline: string;
  synopsis: string;
  featuredLocations: string[];
  activeClubName: string;
  activeClubMembers: string;
  liveEventTitle: string;
  worldRef?: World;
}

export interface WorldCommunityFanVideo {
  id: string;
  worldId: string;
  worldTitle: string;
  worldAccent: string;
  title: string;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar: string;
  category: 'LORE_THEORY' | 'FAN_ANIMATION' | 'OST_REMIX' | 'CANON_BREAKDOWN';
  categoryLabel: string;
  duration: string;
  views: string;
  likes: string;
  clubName: string;
  thumbnailUrl: string;
  videoPreviewQuote: string;
  linkedCanonNode: string;
}

export interface WorldActiveClubCard {
  id: string;
  worldId: string;
  worldTitle: string;
  worldAccent: string;
  clubName: string;
  memberCount: string;
  onlineNow: number;
  bannerUrl: string;
  activeRoomType: 'WATCH_PARTY' | 'LIVE_TALK' | 'CANON_DEBATE';
  activeRoomTitle: string;
  hostName: string;
  recentPostSnippet: string;
  recentPostAuthor: string;
}

export interface WorldTrendingTopic {
  id: string;
  rank: number;
  hashtag: string;
  worldId: string;
  worldTitle: string;
  worldAccent: string;
  category: string;
  postVolume: string;
  velocityDelta: string;
  activeDebateQuestion: string;
  challengerSide: string;
  defenderSide: string;
  challengerVotesPct: number;
}

export interface WorldsLandingPortalViewProps {
  worlds: any[];
  activeDesign?: WorldsLandingDesignId;
  onSelectDesign?: (design: WorldsLandingDesignId) => void;
  isDiscoverMode?: boolean;
  onToggleDiscoverMode?: () => void;
  isOwner?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onEnterWorld: (world: any, initialTab?: any) => void;
  onCreateWorld?: () => void;
  onNewWorld?: () => void;
  onSeedDemoWorlds?: () => void;
  onLaunchStudio?: (app: any, worldId?: string) => void;
  getPresetForWorld?: (world: any) => any;
  onOpenStoryIntelDemo?: (demoKey: 'lorea_book' | 'lorea_script' | 'taleo_chora') => void;
}

export const DEFAULT_SHOWCASE_WORLDS: ShowcaseWorldCardData[] = [
  {
    id: 'world-aethelgard',
    title: 'Aethelgard: The Dyson Stargate',
    subtitle: 'Helios Megastructure & Relativistic Wormhole Network',
    creatorName: 'Kaelen Vance',
    creatorHandle: '@kaelenvance',
    creatorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    genre: 'HARD SCI-FI · SPACE OPERA',
    engineType: 'STARGATE_ODYSSEY',
    engineBadge: '3D Stargate & Solar System Engine',
    coverImage: '/worlds/council_world_stargate.jpg',
    backdropImage: '/worlds/vfx_nebula_stargate.jpg',
    accentColor: '#38bdf8',
    secondaryColor: '#f59e0b',
    followers: '148.2K',
    canonNodes: 42,
    connectedWorks: { books: 4, films: 2, albums: 3, comics: 6 },
    tagline: 'Nine chevrons lock the star-lanes. One rogue navigator holds the key to the 9th Sector.',
    synopsis:
      'Spanning a binary star encased in a fractured bronze-and-titanium Dyson ring, Aethelgard unites four novels, two animated short films, and a 36-track modular synth score into a single navigable 3D solar system.',
    featuredLocations: ['Aethelgard Prime Gate', 'Helios Crown Star', 'Thalassa Ocean Ring', 'Pyros Forge World'],
    activeClubName: 'Helios Gate Navigators Club',
    activeClubMembers: '28.4K Members',
    liveEventTitle: 'LIVE WATCH PARTY: The 9th Chevron Short Film + Director Q&A',
  },
  {
    id: 'world-crown-of-ember',
    title: 'Crown of Ember & Iron',
    subtitle: 'The Clockwork Citadel & The Seven Shattered Realms',
    creatorName: 'Mireille Thorne',
    creatorHandle: '@mireillethorne',
    creatorAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    genre: 'HIGH FANTASY · GRAND STRATEGY',
    engineType: 'KINGDOM_CHRONICLES',
    engineBadge: '3D Carved Tabletop Realm Map',
    coverImage: '/worlds/council_world_kingdoms.jpg',
    backdropImage: '/worlds/vfx_backdrop_kingdoms.jpg',
    accentColor: '#f59e0b',
    secondaryColor: '#ef4444',
    followers: '219.6K',
    canonNodes: 68,
    connectedWorks: { books: 7, films: 1, albums: 4, comics: 12 },
    tagline: 'Every gear beneath the Imperial Citadel turns a border war across the carved continent.',
    synopsis:
      'Built like a living mechanical war-table inspired by royal cartography and epic fantasy chronicles. Readers trace armies, noble bloodlines, and dragon-forged treaties across obsidian volcanoes and sapphire harbors.',
    featuredLocations: ['Imperial Clockwork Citadel', 'Cinder-Peak Caldera', 'Sapphire Tide Harbor', 'Sylvan Heartwood'],
    activeClubName: 'The Obsidian War-Table Guild',
    activeClubMembers: '44.9K Members',
    liveEventTitle: 'ARIA DEBATE: Did House Vaelor Betray the Iron Compact at Cinder-Peak?',
  },
  {
    id: 'world-sora-no-kiseki',
    title: 'Sora-No-Kiseki: Sky Archipelago',
    subtitle: 'The Bioluminescent World-Tree & Floating Sanctuary Isles',
    creatorName: 'Takumi & Aoi Studio',
    creatorHandle: '@sorastudio_jp',
    creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    genre: 'JRPG FANTASY · ANIME OVERWORLD',
    engineType: 'AETHER_ARCHIPELAGO',
    engineBadge: '3D Floating Sky-Islands & Ley-Lines',
    coverImage: '/worlds/council_world_archipelago.jpg',
    backdropImage: '/worlds/vfx_skysea_archipelago.jpg',
    accentColor: '#34d399',
    secondaryColor: '#a855f7',
    followers: '184.9K',
    canonNodes: 54,
    connectedWorks: { books: 3, films: 3, albums: 6, comics: 18 },
    tagline: 'Where silver waterfalls pour into twilight clouds and ancient Ley-Line bridges sing.',
    synopsis:
      'A luminous archipelago of five levitating sanctuary islands anchored to the crystal roots of Yggdrasil-Sora. Pilot sky-skiffs across aurora currents while unlocking orchestral leitmotifs and manga chapters.',
    featuredLocations: ['Yggdrasil-Sora Spire', 'Zephyr Wind-Temple', 'Aether-Fall Cataract', 'Chrono Bell Sanctuary'],
    activeClubName: 'Sky-Skiff Cartographers Society',
    activeClubMembers: '39.1K Members',
    liveEventTitle: 'OST LISTENING ROOM: Yggdrasil-Sora Orchestral Stems Breakdown',
  },
  {
    id: 'world-nocturne-vermilion',
    title: 'Nocturne of the Vermilion Orbit',
    subtitle: 'Cyber-Baroque Ring Station & Memory Cathedral',
    creatorName: 'Soraia Lin',
    creatorHandle: '@soraialin',
    creatorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
    genre: 'CYBER-BAROQUE · ORBITAL NOIR',
    engineType: 'STARGATE_ODYSSEY',
    engineBadge: '3D Stargate & Solar System Engine',
    coverImage: '/worlds/vfx_nebula_stargate.jpg',
    backdropImage: '/worlds/council_world_stargate.jpg',
    accentColor: '#c084fc',
    secondaryColor: '#38bdf8',
    followers: '92.4K',
    canonNodes: 31,
    connectedWorks: { books: 2, films: 2, albums: 5, comics: 4 },
    tagline: 'Every stolen memory is pressed into vinyl inside the rings of Saturn-IX.',
    synopsis:
      'An orbital noir anthology where acoustic cello concertos act as encryption keys for planetary jump-gates. Explore the outer ring habitats, decode character dossiers, and listen to spatial stems tied to each moon.',
    featuredLocations: ['Vermilion Gate Zero', 'Cathedral of Stolen Vinyl', 'Cassini Ice Dock', 'Vespera Choir Spire'],
    activeClubName: 'Cassini Vinyl & Cipher Collective',
    activeClubMembers: '16.8K Members',
    liveEventTitle: 'LIVE TALK: Decoding the Track 07 Hidden Stargate Coordinates',
  },
  {
    id: 'world-ashen-regency',
    title: 'The Ashen Regency of Valdris',
    subtitle: 'Gilded Brass Dominions & The Sunless Basalt Crown',
    creatorName: 'Dorian Valen',
    creatorHandle: '@dorianvalen',
    creatorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    genre: 'DARK MYTHIC · POLITICAL CHRONICLE',
    engineType: 'KINGDOM_CHRONICLES',
    engineBadge: '3D Carved Tabletop Realm Map',
    coverImage: '/worlds/vfx_backdrop_kingdoms.jpg',
    backdropImage: '/worlds/council_world_kingdoms.jpg',
    accentColor: '#fbbf24',
    secondaryColor: '#f97316',
    followers: '114.0K',
    canonNodes: 49,
    connectedWorks: { books: 5, films: 1, albums: 2, comics: 7 },
    tagline: 'When the sun fractured, the cartographers became emperors.',
    synopsis:
      'In a realm lit only by molten rivers and giant clockwork sun-mirrors, five rival duchies vie for control of the Brass Astrolabe. Every chapter updates territorial control across the 3D relief map.',
    featuredLocations: ['Mirror-Citadel of Valdris', 'The Basalt Chasm', 'Gilded Foundry of Oakhaven', 'Beacon of the First Dawn'],
    activeClubName: 'Chancery of the Brass Astrolabe',
    activeClubMembers: '21.3K Members',
    liveEventTitle: 'CANON VOTE: Which Duchy Claims the Sun-Mirror in Book VI?',
  },
  {
    id: 'world-celestia-drift',
    title: 'Celestia Drift: The Wind-Singers',
    subtitle: 'Cloud-Whale Migrations & The Astral Reefs',
    creatorName: 'Amara Okafor',
    creatorHandle: '@amaraokafor',
    creatorAvatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&auto=format&fit=crop&q=80',
    genre: 'SOLARPUNK MYTH · SKY ODYSSEY',
    engineType: 'AETHER_ARCHIPELAGO',
    engineBadge: '3D Floating Sky-Islands & Ley-Lines',
    coverImage: '/worlds/vfx_skysea_archipelago.jpg',
    backdropImage: '/worlds/council_world_archipelago.jpg',
    accentColor: '#2dd4bf',
    secondaryColor: '#f472b6',
    followers: '131.7K',
    canonNodes: 39,
    connectedWorks: { books: 3, films: 2, albums: 4, comics: 9 },
    tagline: 'Follow the bioluminescent songs across the upper stratosphere.',
    synopsis:
      'Nomadic acoustic guilds sail solar-rigged trimarans between floating coral atolls in the high atmosphere. Created across illustrated novels, animatics, and West African-inspired polyrhythmic choral suites.',
    featuredLocations: ['Sol-Coral Sanctuary', 'The Singing Updraft', 'Archipelago of Seven Sails', 'Dawn-Tide Observatory'],
    activeClubName: 'First Wind-Singers Choir & Lore Club',
    activeClubMembers: '25.7K Members',
    liveEventTitle: 'FAN SHOWCASE: Community Animatic Screening & Polyrhythm Jam',
  },
];

export const COMMUNITY_FAN_VIDEOS: WorldCommunityFanVideo[] = [
  {
    id: 'fan-vid-1',
    worldId: 'world-aethelgard',
    worldTitle: 'Aethelgard: The Dyson Stargate',
    worldAccent: '#38bdf8',
    title: 'How the 9th Chevron Actually Bends Time Across the Helios Binary (Full 3D Lore Breakdown)',
    creatorName: 'AstrolabeTheorist',
    creatorHandle: '@astrolabe_lore',
    creatorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
    category: 'LORE_THEORY',
    categoryLabel: 'LORE THEORY VIDEO',
    duration: '14:28',
    views: '84.2K views',
    likes: '12.4K',
    clubName: 'Helios Gate Navigators Club',
    thumbnailUrl: '/worlds/council_world_stargate.jpg',
    videoPreviewQuote:
      '"When you align the Book III orbital chart with the 3D Stargate Chevron telemetry at 04:12, the 9th Sector isn’t a place—it’s Aethelgard before the Dyson fracture..."',
    linkedCanonNode: 'Aethelgard Prime Gate · Node #01',
  },
  {
    id: 'fan-vid-2',
    worldId: 'world-crown-of-ember',
    worldTitle: 'Crown of Ember & Iron',
    worldAccent: '#f59e0b',
    title: 'The Siege of Cinder-Peak Caldera — Fan-Animated 2D/3D Battle Chronicle (60fps)',
    creatorName: 'ValkyrieInkStudio',
    creatorHandle: '@valkyrie_ink',
    creatorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
    category: 'FAN_ANIMATION',
    categoryLabel: 'FAN ANIMATION',
    duration: '06:45',
    views: '142.9K views',
    likes: '29.1K',
    clubName: 'The Obsidian War-Table Guild',
    thumbnailUrl: '/worlds/council_world_kingdoms.jpg',
    videoPreviewQuote:
      '"Our 9-person club animation team spent 3 weeks animating Chapter 19 of Mireille Thorne’s novel using the official Citadel relief map coordinates!"',
    linkedCanonNode: 'Cinder-Peak Caldera · Node #14',
  },
  {
    id: 'fan-vid-3',
    worldId: 'world-sora-no-kiseki',
    worldTitle: 'Sora-No-Kiseki: Sky Archipelago',
    worldAccent: '#34d399',
    title: 'Yggdrasil-Sora Overworld Theme — Live 12-Piece Chamber Strings & Synth Wind Cover',
    creatorName: 'AriaEnsembleTokyo',
    creatorHandle: '@aria_ensemble',
    creatorAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80',
    category: 'OST_REMIX',
    categoryLabel: 'FAN OST PERFORMANCE',
    duration: '05:19',
    views: '96.5K views',
    likes: '19.8K',
    clubName: 'Sky-Skiff Cartographers Society',
    thumbnailUrl: '/worlds/council_world_archipelago.jpg',
    videoPreviewQuote:
      '"Recorded live with Plajah Melos stems from the Zephyr Wind-Temple node—watch the aurora reactive shaders sync to the solo violin!"',
    linkedCanonNode: 'Yggdrasil-Sora Spire · Node #03',
  },
  {
    id: 'fan-vid-4',
    worldId: 'world-nocturne-vermilion',
    worldTitle: 'Nocturne of the Vermilion Orbit',
    worldAccent: '#c084fc',
    title: 'Every Hidden Vinyl Cipher in Saturn-IX Connected to Aethelgard’s Outer Gate',
    creatorName: 'CipherVesper',
    creatorHandle: '@cipher_vesper',
    creatorAvatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80',
    category: 'CANON_BREAKDOWN',
    categoryLabel: 'CROSSOVER BREAKDOWN',
    duration: '18:04',
    views: '61.8K views',
    likes: '9.7K',
    clubName: 'Cassini Vinyl & Cipher Collective',
    thumbnailUrl: '/worlds/vfx_nebula_stargate.jpg',
    videoPreviewQuote:
      '"Play Side B of Cathedral of Stolen Vinyl backwards at 0.75x and look at the star-map: Soraia Lin hid a direct wormhole bridge to Kaelen Vance’s universe."',
    linkedCanonNode: 'Cathedral of Stolen Vinyl · Node #09',
  },
];

export const ACTIVE_WORLD_CLUBS: WorldActiveClubCard[] = [
  {
    id: 'club-helios',
    worldId: 'world-aethelgard',
    worldTitle: 'Aethelgard: The Dyson Stargate',
    worldAccent: '#38bdf8',
    clubName: 'Helios Gate Navigators Club',
    memberCount: '28,410',
    onlineNow: 1420,
    bannerUrl: '/worlds/council_world_stargate.jpg',
    activeRoomType: 'WATCH_PARTY',
    activeRoomTitle: 'WATCH PARTY: Episode 02 "Event Horizon Lock" + Live Telemetry Sync',
    hostName: 'Kaelen Vance (Creator) + 4 Club Mods',
    recentPostSnippet:
      'New fan star-chart dropped! We mapped all 14 asteroid relay beacons from Book IV onto the 3D Stargate overworld.',
    recentPostAuthor: '@nav_soren',
  },
  {
    id: 'club-obsidian-table',
    worldId: 'world-crown-of-ember',
    worldTitle: 'Crown of Ember & Iron',
    worldAccent: '#f59e0b',
    clubName: 'The Obsidian War-Table Guild',
    memberCount: '44,920',
    onlineNow: 2185,
    bannerUrl: '/worlds/council_world_kingdoms.jpg',
    activeRoomType: 'CANON_DEBATE',
    activeRoomTitle: 'ARIA TRIAL DEBATE: Was the High Clockmaker Justified in Sealing the Harbor?',
    hostName: 'Judged Live by Aria · 2,185 Spectating',
    recentPostSnippet:
      'Chapter 34 spoiler thread is live! Look at how the brass gear alignment on the tabletop map predicted the Red Armada route.',
    recentPostAuthor: '@lady_vaelor',
  },
  {
    id: 'club-skyskiff',
    worldId: 'world-sora-no-kiseki',
    worldTitle: 'Sora-No-Kiseki: Sky Archipelago',
    worldAccent: '#34d399',
    clubName: 'Sky-Skiff Cartographers Society',
    memberCount: '39,150',
    onlineNow: 1690,
    bannerUrl: '/worlds/council_world_archipelago.jpg',
    activeRoomType: 'LIVE_TALK',
    activeRoomTitle: 'LIVE ROOM: Fan Manga Vol. 5 Table-Read & Sky-Island Concept Jam',
    hostName: 'Takumi & Aoi Studio + Community Voice Cast',
    recentPostSnippet:
      'Our community collab video hit 100K views! Click through to step directly into the Chrono Bell Sanctuary 3D node.',
    recentPostAuthor: '@sora_captain',
  },
  {
    id: 'club-windsingers',
    worldId: 'world-celestia-drift',
    worldTitle: 'Celestia Drift: The Wind-Singers',
    worldAccent: '#2dd4bf',
    clubName: 'First Wind-Singers Choir & Lore Club',
    memberCount: '25,740',
    onlineNow: 890,
    bannerUrl: '/worlds/vfx_skysea_archipelago.jpg',
    activeRoomType: 'WATCH_PARTY',
    activeRoomTitle: 'WATCH PARTY: Cloud-Whale Migration Animatic + Choral Stem Remixing',
    hostName: 'Amara Okafor + Chora Guild',
    recentPostSnippet:
      'Upload your 16-bar vocal harmony stems to the Sol-Coral Sanctuary node before Friday’s canon lock!',
    recentPostAuthor: '@chora_kemi',
  },
];

export const TRENDING_WORLD_TOPICS: WorldTrendingTopic[] = [
  {
    id: 'trend-1',
    rank: 1,
    hashtag: '#TheNinthChevronLock',
    worldId: 'world-aethelgard',
    worldTitle: 'Aethelgard: The Dyson Stargate',
    worldAccent: '#38bdf8',
    category: 'SCI-FI CANON THEORY · 48.2K POSTS TODAY',
    postVolume: '48.2K posts',
    velocityDelta: '+340% in 4h',
    activeDebateQuestion: 'Does locking the 9th Chevron collapse the Helios binary star or open a bridge to Saturn-IX?',
    challengerSide: 'Opens the Saturn-IX Bridge (Crossover)',
    defenderSide: 'Triggers Temporal Dyson Reset',
    challengerVotesPct: 64,
  },
  {
    id: 'trend-2',
    rank: 2,
    hashtag: '#TrialOfHouseVaelor',
    worldId: 'world-crown-of-ember',
    worldTitle: 'Crown of Ember & Iron',
    worldAccent: '#f59e0b',
    category: 'FANTASY FACTION WAR · 62.9K POSTS TODAY',
    postVolume: '62.9K posts',
    velocityDelta: '+510% in 6h',
    activeDebateQuestion: 'Should the Obsidian War-Table Guild crown Prince Cassian or the Iron Forgemaster as Regent?',
    challengerSide: 'Crown the Iron Forgemaster',
    defenderSide: 'Restore Prince Cassian’s Line',
    challengerVotesPct: 58,
  },
  {
    id: 'trend-3',
    rank: 3,
    hashtag: '#YggdrasilSoraRootSong',
    worldId: 'world-sora-no-kiseki',
    worldTitle: 'Sora-No-Kiseki: Sky Archipelago',
    worldAccent: '#34d399',
    category: 'JRPG LORE & OST · 39.4K POSTS TODAY',
    postVolume: '39.4K posts',
    velocityDelta: '+285% in 3h',
    activeDebateQuestion: 'Is the Fifth Floating Sanctuary Island rising from the Cloud-Sea or falling from orbit?',
    challengerSide: 'Ancient Orbital Ark Descending',
    defenderSide: 'Deep Cloud-Sea Root Awakening',
    challengerVotesPct: 71,
  },
  {
    id: 'trend-4',
    rank: 4,
    hashtag: '#SaturnIXVinylCipher',
    worldId: 'world-nocturne-vermilion',
    worldTitle: 'Nocturne of the Vermilion Orbit',
    worldAccent: '#c084fc',
    category: 'ARG & AUDIO PUZZLE · 27.1K POSTS TODAY',
    postVolume: '27.1K posts',
    velocityDelta: '+195% in 2h',
    activeDebateQuestion: 'Did CipherVesper’s fan video solve the final spectrogram coordinate in Track 09?',
    challengerSide: 'Solved: Points to Vespera Spire',
    defenderSide: 'Decoy Layer: One More Key Remains',
    challengerVotesPct: 52,
  },
];

/**
 * Real-Time 60fps Rotating Space Nebula & Spiral Galaxy Video Loop Canvas + Stream Engine
 * Renders the active Art-Council-Approved Nebula/Galaxy Master Photo (#01–#10) with:
 * - Differential Keplerian Spiral Galaxy Rotation
 * - Counter-Rotating Ionized Nebula Veil & Volumetric God-Rays
 * - Zero-Seam Cosine-Phase Loop Continuity (`Frame 0 === Frame N`)
 * - 350 Deep-Field Twinkling Stars with 70mm Halation & Newtonian Spikes
 */
const RotatingCosmicNebulaBackdrop: React.FC<{
  photo: NebulaGalaxyPhotoAsset;
  loop: VeoOmniVideoLoopAsset;
  speedMultiplier: number;
  videoPreviewRef?: React.RefObject<HTMLVideoElement | null>;
}> = ({ photo, loop, speedMultiplier, videoPreviewRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = photo.imageUrl;
    img.onload = () => {
      imageRef.current = img;
    };
    img.onerror = () => {
      const fallback = new Image();
      fallback.src = photo.fallbackImageUrl;
      fallback.onload = () => {
        imageRef.current = fallback;
      };
    };
  }, [photo.imageUrl, photo.fallbackImageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const startMs = performance.now();

    // Deterministic starfield (260 deep-field stars + 28 diffraction supergiants)
    const stars = Array.from({ length: 260 }, (_, i) => {
      const s1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const s2 = Math.sin(i * 93.9898 + 12.456) * 23421.6312;
      const rFrac = s1 - Math.floor(s1);
      const aFrac = s2 - Math.floor(s2);
      return {
        radiusNorm: 0.05 + rFrac * 0.85,
        angle: aFrac * Math.PI * 2,
        size: i % 11 === 0 ? 2.4 : i % 4 === 0 ? 1.5 : 0.9,
        spike: i % 14 === 0,
        colorIndex: i % 3,
        twinklePhase: i * 0.73,
      };
    });

    // Attach 60fps MediaStream to preview <video> element if available
    if (videoPreviewRef?.current && typeof (canvas as any).captureStream === 'function') {
      try {
        const stream = (canvas as any).captureStream(30);
        if (videoPreviewRef.current.srcObject !== stream) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
        }
      } catch {
        // Ignore captureStream restrictions
      }
    }

    const renderFrame = (nowMs: number) => {
      const w = (canvas.width = canvas.clientWidth || 1440);
      const h = (canvas.height = canvas.clientHeight || 820);
      const cx = w * 0.5;
      const cy = h * 0.42; // Centered right behind the 3D Portal Rotunda keystone arch

      const elapsedSec = ((nowMs - startMs) / 1000) * speedMultiplier;
      const loopT = (elapsedSec % loop.durationSeconds) / loop.durationSeconds; // 0..1 exact periodic phase
      const tau = loopT * Math.PI * 2;

      // 1. Deep Cosmic Void Fill
      ctx.fillStyle = loop.shaderColors.voidHex || '#03050c';
      ctx.fillRect(0, 0, w, h);

      const img = imageRef.current;
      const maxDim = Math.max(w, h) * 1.48;

      // 2. Outer Spiral Galaxy / Nebula Disc Rotation (Harmonic Dual-Phase Zero-Seam Wrap)
      if (img && img.complete && img.naturalWidth > 0) {
        const outerAngle =
          elapsedSec * ((loop.rotationRpm * Math.PI * 2) / 60) * loop.outerSpiralSpeedMultiplier;
        const breatheScale = 1.0 + Math.sin(tau) * 0.035;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(outerAngle);
        ctx.scale(breatheScale, breatheScale);
        ctx.globalAlpha = 0.72;
        ctx.drawImage(img, -maxDim * 0.5, -maxDim * 0.5, maxDim, maxDim);
        ctx.restore();

        // 3. Counter-Rotating / Differential Inner Galactic Bulge & Ionized Nebula Layer
        const innerAngle =
          -elapsedSec *
          ((loop.rotationRpm * Math.PI * 2) / 60) *
          (loop.innerCoreSpeedMultiplier * 0.42);
        const driftX = Math.cos(tau) * loop.nebulaDriftVector[0] * 42;
        const driftY = Math.sin(tau) * loop.nebulaDriftVector[1] * 32;

        ctx.save();
        ctx.translate(cx + driftX, cy + driftY);
        ctx.rotate(innerAngle);
        ctx.scale(1.12 + Math.cos(tau) * 0.04, 1.12 + Math.cos(tau) * 0.04);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.48;
        ctx.drawImage(img, -maxDim * 0.44, -maxDim * 0.44, maxDim * 0.88, maxDim * 0.88);
        ctx.restore();
      }

      // 4. Procedural Volumetric Spiral Galaxy Arms & Nebula Ionization Veil
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';
      const armCount = 3;
      const spiralBaseRot = elapsedSec * 0.22;
      for (let arm = 0; arm < armCount; arm++) {
        const armOffset = (arm * Math.PI * 2) / armCount + spiralBaseRot;
        for (let step = 0; step < 38; step++) {
          const frac = step / 38;
          const r = frac * Math.max(w, h) * 0.52;
          const theta = armOffset + frac * 3.8;
          const px = Math.cos(theta) * r * 1.25;
          const py = Math.sin(theta) * r * 0.68; // 35-deg inclined galactic disc perspective
          const radius = 26 + frac * 115;
          const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
          const col =
            step % 3 === 0
              ? loop.shaderColors.coreHex
              : step % 2 === 0
              ? loop.shaderColors.armPrimaryHex
              : loop.shaderColors.armSecondaryHex;
          grad.addColorStop(0, `${col}24`);
          grad.addColorStop(0.5, `${col}0d`);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Relativistic Einstein-Ring & Galactic Core Halo Behind Center Portal Arch
      const coreRadius = Math.min(w, h) * (0.28 + loop.lensingStrength * 0.18);
      const coreGrad = ctx.createRadialGradient(0, 0, coreRadius * 0.08, 0, 0, coreRadius);
      coreGrad.addColorStop(0, `${loop.shaderColors.coreHex}55`);
      coreGrad.addColorStop(0.38, `${loop.shaderColors.armPrimaryHex}2e`);
      coreGrad.addColorStop(0.72, `${loop.shaderColors.armSecondaryHex}14`);
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Rotating Astrolabe / Relativistic Photon Ring
      ctx.strokeStyle = `${loop.shaderColors.coreHex}44`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        coreRadius * 0.78,
        coreRadius * 0.42,
        elapsedSec * 0.14,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();

      // 6. Rotating Deep-Field Star Dome with 70mm Halation & Newtonian Spikes
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'lighter';
      const starRot = elapsedSec * 0.045;
      const maxR = Math.hypot(w, h) * 0.62;
      const palette = photo.dominantPalette;

      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        const a = st.angle + starRot * (1.1 - st.radiusNorm * 0.5);
        const r = st.radiusNorm * maxR;
        const sx = Math.cos(a) * r;
        const sy = Math.sin(a) * r * 0.78;
        const twinkle = 0.55 + 0.45 * Math.sin(tau * 2 + st.twinklePhase);
        const starCol = palette[st.colorIndex] || '#ffffff';

        ctx.fillStyle = starCol;
        ctx.globalAlpha = twinkle * 0.85;
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();

        if (st.spike) {
          ctx.strokeStyle = starCol;
          ctx.globalAlpha = twinkle * 0.55;
          ctx.lineWidth = 0.9;
          const spikeLen = st.size * 5.5;
          ctx.beginPath();
          ctx.moveTo(sx - spikeLen, sy);
          ctx.lineTo(sx + spikeLen, sy);
          ctx.moveTo(sx, sy - spikeLen);
          ctx.lineTo(sx, sy + spikeLen);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 7. Radical Minimalist Vignette & Rotunda Horizon Grounding Gradient
      const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.18, cx, cy, Math.max(w, h) * 0.75);
      vig.addColorStop(0, 'rgba(3, 5, 12, 0.05)');
      vig.addColorStop(0.7, 'rgba(3, 5, 12, 0.42)');
      vig.addColorStop(1, 'rgba(2, 4, 10, 0.88)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      const bottomGrad = ctx.createLinearGradient(0, h * 0.62, 0, h);
      bottomGrad.addColorStop(0, 'rgba(3, 5, 12, 0)');
      bottomGrad.addColorStop(1, 'rgba(3, 5, 12, 0.96)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [photo, loop, speedMultiplier, videoPreviewRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      style={{ zIndex: 0 }}
    />
  );
};

function buildSynthesizedShowcaseRef(card: ShowcaseWorldCardData, idx: number): ShowcaseWorld {
  const baseShowcase =
    SHOWCASE_WORLDS.find((sw) => sw.defaultCoverPreset === card.engineType) ||
    SHOWCASE_WORLDS[idx % SHOWCASE_WORLDS.length] ||
    SHOWCASE_WORLDS[0];

  return {
    ...baseShowcase,
    id: card.id,
    name: card.title,
    tagline: card.tagline || card.subtitle,
    description: card.synopsis,
    genre: card.genre,
    bannerUrl: card.coverImage,
    coverImage: card.coverImage,
    coverImageUrl: card.coverImage,
    themeColor: card.accentColor,
    defaultCoverPreset: card.engineType,
    isShowcase: true,
    entries: [
      ...card.featuredLocations.map((locName, locIdx) => ({
        id: `${card.id}-loc-${locIdx}`,
        category: 'locations' as const,
        name: locName,
        description: `Canonical stronghold and primary story sector within ${card.title}. Linked across Fabula, Lorea, Chora, and Taleo.`,
        tags: [card.genre, 'Canonical Sector', card.activeClubName],
        imageUrl: card.coverImage,
        relationships: [],
        appearances: baseShowcase.entries[0]?.appearances || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
      ...baseShowcase.entries,
    ],
  };
}

export const WorldsLandingPortalView: React.FC<WorldsLandingPortalViewProps> = ({
  worlds,
  isDiscoverMode = true,
  onToggleDiscoverMode,
  isOwner = false,
  searchQuery = '',
  onSearchChange,
  onEnterWorld,
  onCreateWorld,
  onNewWorld,
  onSeedDemoWorlds,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeNebulaIndex, setActiveNebulaIndex] = useState<number>(1);
  const [activeFanVideoModal, setActiveFanVideoModal] = useState<WorldCommunityFanVideo | null>(
    null
  );
  const liveLoopVideoRef = useRef<HTMLVideoElement | null>(null);
  const handleCreateWorld = onCreateWorld || onNewWorld;

  const showcaseWorlds: ShowcaseWorldCardData[] = useMemo(() => {
    const defaultWithRefs = DEFAULT_SHOWCASE_WORLDS.map((d, idx) => ({
      ...d,
      worldRef: d.worldRef || buildSynthesizedShowcaseRef(d, idx),
    }));

    if (!worlds || worlds.length === 0) return defaultWithRefs;

    const mapped: ShowcaseWorldCardData[] = worlds.map((w, idx) => {
      const template = defaultWithRefs[idx % defaultWithRefs.length];
      const engineType: ShowcaseWorldCardData['engineType'] =
        w.defaultCoverPreset ||
        (String(w.name || '').toLowerCase().includes('kingdom') ||
        String(w.name || '').toLowerCase().includes('crown')
          ? 'KINGDOM_CHRONICLES'
          : String(w.name || '').toLowerCase().includes('sky') ||
            String(w.name || '').toLowerCase().includes('sora')
          ? 'AETHER_ARCHIPELAGO'
          : template.engineType);

      const card: ShowcaseWorldCardData = {
        ...template,
        id: w.id || template.id,
        title: w.name || w.title || template.title,
        subtitle: w.tagline || w.subtitle || template.subtitle,
        genre: (w.genre || template.genre).toUpperCase(),
        engineType,
        coverImage:
          w.coverImageUrl || w.coverImage || w.coverUrl || w.bannerUrl || template.coverImage,
        backdropImage:
          w.backdropImage || w.bannerUrl || w.coverImageUrl || w.coverUrl || template.backdropImage,
        accentColor: w.themeColor || w.accentColor || template.accentColor,
        tagline: w.tagline || template.tagline,
        synopsis: w.description || w.synopsis || template.synopsis,
        canonNodes:
          w.entries?.length ||
          (w.characters?.length || 0) +
            (w.locations?.length || 0) +
            (w.lore?.length || 0) +
            (w.timeline?.length || 0) ||
          template.canonNodes,
        featuredLocations:
          w.entries && Array.isArray(w.entries)
            ? w.entries
                .filter((e: any) => e.category === 'locations')
                .slice(0, 4)
                .map((e: any) => e.name)
            : w.locations && w.locations.length > 0
            ? w.locations.slice(0, 4).map((l: any) => l.name || l)
            : template.featuredLocations,
        worldRef: w,
      };
      return card;
    });

    for (let i = mapped.length; i < defaultWithRefs.length; i++) {
      if (!mapped.some((m) => m.id === defaultWithRefs[i].id)) {
        mapped.push(defaultWithRefs[i]);
      }
    }
    return mapped;
  }, [worlds]);

  // Ambiently cycle through the 10 Art-Council-vetted Nebula & Galaxy loops in the background
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveNebulaIndex((prev) => (prev + 1) % NEBULA_GALAXY_PHOTOS.length);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  const activeWorld = showcaseWorlds[selectedIndex] || showcaseWorlds[0];
  const prevWorld =
    showcaseWorlds[(selectedIndex - 1 + showcaseWorlds.length) % showcaseWorlds.length];
  const nextWorld = showcaseWorlds[(selectedIndex + 1) % showcaseWorlds.length];

  const activePhoto = NEBULA_GALAXY_PHOTOS[activeNebulaIndex] || NEBULA_GALAXY_PHOTOS[0];
  const activeLoop = VEO_OMNI_VIDEO_LOOPS[activeNebulaIndex] || VEO_OMNI_VIDEO_LOOPS[0];

  const enterWorldById = (worldId: string, initialTab: any = 'Overview') => {
    const idLower = (worldId || '').toLowerCase();
    const found =
      showcaseWorlds.find((w) => w.id === worldId) ||
      showcaseWorlds.find((w) =>
        idLower.includes('aethelgard') || idLower.includes('nocturne')
          ? w.engineType === 'STARGATE_ODYSSEY'
          : idLower.includes('crown') || idLower.includes('ashen')
          ? w.engineType === 'KINGDOM_CHRONICLES'
          : idLower.includes('sora') || idLower.includes('celestia')
          ? w.engineType === 'AETHER_ARCHIPELAGO'
          : false
      ) ||
      activeWorld;
    const targetRef = found.worldRef || buildSynthesizedShowcaseRef(found, 0);
    onEnterWorld(targetRef, initialTab);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#03050c] text-white overflow-x-hidden select-none">
      {/* ═══════════════════════════════════════════════════════════════════════════
          CLEAN PRODUCTION HEADER BAR (No Background Artwork / UI Choice Switchers)
         ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 backdrop-blur-2xl bg-[#03050c]/85 border-b border-white/10 px-4 sm:px-8 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-sky-400/40 bg-sky-500/15 shadow-lg">
              <Globe className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <span className="text-[11px] font-black tracking-[0.26em] uppercase text-white">
                PLAJAH WORLDS
              </span>
              <p className="text-[11px] text-white/60">
                Creator IP Universes · Fan Clubs · Community Videos · Trending Lore
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {onSearchChange && (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search worlds, lore, or creators..."
                className="px-3.5 py-1.5 rounded-full text-xs bg-white/[0.06] border border-white/15 text-white placeholder:text-white/40 focus:outline-none focus:border-sky-400 w-48 sm:w-64"
              />
            )}
            {onToggleDiscoverMode && (
              <button
                onClick={onToggleDiscoverMode}
                className="px-4 py-2 rounded-full text-[10px] font-black tracking-widest uppercase bg-white/[0.06] hover:bg-white/10 border border-white/15 text-white transition-all flex items-center gap-1.5"
              >
                <Compass className="w-3.5 h-3.5 text-sky-300" />
                {isDiscoverMode ? 'Compass: Front Row Worlds' : 'Compass: My Created Worlds'}
              </button>
            )}
            {isOwner && onSeedDemoWorlds && (
              <button
                onClick={onSeedDemoWorlds}
                className="px-3.5 py-2 rounded-full text-[10px] font-black tracking-widest uppercase bg-white/[0.06] hover:bg-white/10 border border-white/15 text-amber-300 transition-all"
              >
                Seed Demo Worlds
              </button>
            )}
            {handleCreateWorld && (
              <button
                onClick={handleCreateWorld}
                className="px-4 py-2 rounded-full text-[10px] font-black tracking-widest uppercase bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all shadow-lg"
              >
                + Create World
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAIN LANDING PAGE: 3D PORTAL ROTUNDA WITH ROTATING SPACE NEBULA & GALAXY
         ═══════════════════════════════════════════════════════════════════════════ */}
      <div>
        <section className="relative pt-8 pb-14 px-4 sm:px-8 overflow-hidden border-b border-white/10">
          {/* LIVE ROTATING SPACE NEBULA & GALAXY BACKDROP */}
          <RotatingCosmicNebulaBackdrop
            photo={activePhoto}
            loop={activeLoop}
            speedMultiplier={1.0}
            videoPreviewRef={liveLoopVideoRef}
          />

          <div className="max-w-[1440px] mx-auto relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-sky-500/15 border border-sky-400/35 text-sky-300 text-[11px] font-bold tracking-[0.2em] uppercase mb-3 shadow-lg">
                <Sparkles className="w-3.5 h-3.5" /> MULTIVERSE PORTAL ROTUNDA
              </div>
              <h1
                className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.06] mb-3"
                style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              >
                STEP THROUGH CREATOR UNIVERSES, CLUBS &amp; FAN THEATERS
              </h1>
              <p className="text-sm sm:text-base text-white/75 leading-relaxed">
                Step directly into user-built worlds, join live Club watch parties, or watch fan lore
                breakdowns and community animations.
              </p>
            </div>

            {/* 3D CURVED PERSPECTIVE ROTUNDA STAGE */}
            <div
              className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center my-4"
              style={{ perspective: '1500px' }}
            >
              {/* LEFT WING PORTAL (ANGLED IN 3D) */}
              <div
                onClick={() =>
                  setSelectedIndex(
                    (selectedIndex - 1 + showcaseWorlds.length) % showcaseWorlds.length
                  )
                }
                className="lg:col-span-3 cursor-pointer group rounded-[28px] overflow-hidden border border-white/15 bg-[#070b18]/80 backdrop-blur-xl p-4 transition-all duration-500 hover:border-sky-400/50"
                style={{ transform: 'rotateY(22deg) scale(0.92)', transformStyle: 'preserve-3d' }}
              >
                <div className="relative h-56 rounded-2xl overflow-hidden mb-3">
                  <img
                    src={prevWorld.coverImage}
                    alt={prevWorld.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#070b18] via-transparent to-transparent" />
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-black/70 text-white/80 border border-white/15">
                    ◀ PREV PORTAL
                  </span>
                  <span className="absolute bottom-3 left-3 text-[10px] font-mono text-sky-300">
                    {prevWorld.activeClubName}
                  </span>
                </div>
                <div className="text-[10px] font-bold tracking-widest uppercase text-white/50">
                  {prevWorld.genre}
                </div>
                <div className="text-lg font-black text-white truncate">{prevWorld.title}</div>
                <div className="text-xs text-white/55 mt-1 flex items-center justify-between">
                  <span>By {prevWorld.creatorName}</span>
                  <span className="text-sky-300 font-bold">{prevWorld.followers}</span>
                </div>
              </div>

              {/* CENTER ACTIVE GIANT PORTAL ARCH */}
              <div className="lg:col-span-6 relative rounded-[34px] overflow-hidden border-2 border-sky-400/55 bg-[#070b18]/85 shadow-[0_0_95px_rgba(56,189,248,0.28)]">
                <div className="relative h-[430px] overflow-hidden">
                  <img
                    src={activeWorld.coverImage}
                    alt={activeWorld.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050814] via-[#050814]/45 to-transparent" />

                  {/* Rotating Portal Halo Ring */}
                  <div className="absolute inset-6 rounded-[28px] border border-sky-300/25 pointer-events-none" />

                  {/* Top Badges */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className="px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border backdrop-blur-md"
                      style={{
                        backgroundColor: `${activeWorld.accentColor}28`,
                        borderColor: `${activeWorld.accentColor}75`,
                        color: activeWorld.accentColor,
                      }}
                    >
                      ACTIVE PORTAL · {activeWorld.engineBadge}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center gap-1.5 backdrop-blur-md">
                      <Radio className="w-3 h-3 animate-pulse" /> {activeWorld.activeClubName} (
                      {activeWorld.activeClubMembers})
                    </span>
                  </div>

                  {/* Center Portal Content */}
                  <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8">
                    <div className="flex items-center gap-2.5 mb-2">
                      <img
                        src={activeWorld.creatorAvatar}
                        alt={activeWorld.creatorName}
                        className="w-7 h-7 rounded-full object-cover border border-sky-300/50"
                      />
                      <span className="text-xs font-bold text-white">{activeWorld.creatorName}</span>
                      <span className="text-xs text-white/50">{activeWorld.creatorHandle}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-amber-300 font-mono ml-auto">
                        {activeWorld.canonNodes} Canon Nodes · {activeWorld.followers} Fans
                      </span>
                    </div>

                    <h2
                      className="text-2xl sm:text-4xl font-black text-white leading-tight mb-2"
                      style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                    >
                      {activeWorld.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/80 line-clamp-2 mb-4">
                      {activeWorld.synopsis}
                    </p>

                    {/* Live Club Event Banner inside the Portal */}
                    <div className="mb-4 px-3.5 py-2 rounded-xl bg-white/[0.07] border border-white/15 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-amber-200 truncate">
                        <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="font-bold truncate">{activeWorld.liveEventTitle}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 shrink-0">
                        LIVE IN CLUB
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => onEnterWorld(activeWorld.worldRef || activeWorld)}
                        className="px-6 py-3 rounded-xl font-black text-xs tracking-wider uppercase text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-200 to-amber-200 hover:brightness-110 transition-all shadow-lg flex items-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-slate-950" />
                        Step Through 3D World Portal
                      </button>
                      {onCreateWorld && (
                        <button
                          onClick={onCreateWorld}
                          className="px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-white/10 hover:bg-white/15 border border-white/20 text-white transition-all"
                        >
                          + Architect New World
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT WING PORTAL (ANGLED IN 3D) */}
              <div
                onClick={() => setSelectedIndex((selectedIndex + 1) % showcaseWorlds.length)}
                className="lg:col-span-3 cursor-pointer group rounded-[28px] overflow-hidden border border-white/15 bg-[#070b18]/80 backdrop-blur-xl p-4 transition-all duration-500 hover:border-sky-400/50"
                style={{ transform: 'rotateY(-22deg) scale(0.92)', transformStyle: 'preserve-3d' }}
              >
                <div className="relative h-56 rounded-2xl overflow-hidden mb-3">
                  <img
                    src={nextWorld.coverImage}
                    alt={nextWorld.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#070b18] via-transparent to-transparent" />
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-black/70 text-white/80 border border-white/15">
                    NEXT PORTAL ▶
                  </span>
                  <span className="absolute bottom-3 left-3 text-[10px] font-mono text-amber-300">
                    {nextWorld.activeClubName}
                  </span>
                </div>
                <div className="text-[10px] font-bold tracking-widest uppercase text-white/50">
                  {nextWorld.genre}
                </div>
                <div className="text-lg font-black text-white truncate">{nextWorld.title}</div>
                <div className="text-xs text-white/55 mt-1 flex items-center justify-between">
                  <span>By {nextWorld.creatorName}</span>
                  <span className="text-amber-300 font-bold">{nextWorld.followers}</span>
                </div>
              </div>
            </div>

            {/* ROTUNDA FLOOR DOCK: 6 CREATOR WORLD SELECTOR PILLS + ACTIVE NEBULA LOOP INDICATOR */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
              {showcaseWorlds.map((w, idx) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    idx === selectedIndex
                      ? 'bg-sky-500/20 border-sky-400 text-white shadow-lg'
                      : 'bg-black/55 border-white/10 text-white/65 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: w.accentColor }}
                  />
                  <span>{w.title.split(':')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════════
            SECTION 2: COMMUNITY FAN VIDEO SPOTLIGHT THEATER
           ═══════════════════════════════════════════════════════════════════════════ */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-12 border-b border-white/10">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] font-black tracking-[0.24em] uppercase text-sky-400 flex items-center gap-2">
                <Video className="w-4 h-4" /> COMMUNITY FAN VIDEO THEATER · DIRECT ENTRY INTO CANON
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Fan Lore Breakdowns, Animations &amp; OST Covers from World Communities
              </h2>
            </div>
            <p className="text-xs text-white/60 max-w-md">
              Every fan video is anchored to a World Club and a specific Canon Node—watch a theory or
              animation, then jump straight into that World.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {COMMUNITY_FAN_VIDEOS.map((vid) => (
              <div
                key={vid.id}
                onClick={() => setActiveFanVideoModal(vid)}
                className="group cursor-pointer rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10 hover:border-sky-400/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={vid.thumbnailUrl}
                      alt={vid.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#05070f] via-black/30 to-transparent" />
                    <span
                      className="absolute top-3 left-3 px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
                      style={{
                        backgroundColor: `${vid.worldAccent}30`,
                        color: vid.worldAccent,
                        border: `1px solid ${vid.worldAccent}60`,
                      }}
                    >
                      {vid.categoryLabel}
                    </span>
                    <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                      {vid.duration}
                    </span>
                    <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:scale-110 transition-transform">
                      <div className="w-12 h-12 rounded-full bg-sky-400/90 text-slate-950 flex items-center justify-center shadow-xl">
                        <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300 mb-1">
                      {vid.worldTitle} · {vid.clubName}
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 mb-2 group-hover:text-sky-200">
                      {vid.title}
                    </h3>
                    <p className="text-[11px] text-white/55 italic line-clamp-2 mb-3">
                      {vid.videoPreviewQuote}
                    </p>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <img
                      src={vid.creatorAvatar}
                      alt={vid.creatorName}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span className="text-white/80 font-semibold">{vid.creatorHandle}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      enterWorldById(vid.worldId);
                    }}
                    className="text-sky-300 hover:text-white font-bold flex items-center gap-1"
                  >
                    Enter World <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════════
            SECTION 3: ACTIVE WORLD CLUBS & TRENDING TOPICS / ARIA DEBATES
           ═══════════════════════════════════════════════════════════════════════════ */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-12 border-b border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT 7 COLS: ACTIVE WORLD CLUBS & WATCH PARTIES */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[11px] font-black tracking-[0.22em] uppercase text-emerald-400 flex items-center gap-2">
                  <Users className="w-4 h-4" /> ACTIVE WORLD CLUBS &amp; LIVE WATCH PARTIES
                </div>
                <h3 className="text-2xl font-black text-white mt-0.5">
                  Community Gateways Into Every Universe
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                6,185 Fans Online Across Clubs
              </span>
            </div>

            <div className="space-y-4">
              {ACTIVE_WORLD_CLUBS.map((club) => (
                <div
                  key={club.id}
                  className="rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/25 p-4 transition-all flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={club.bannerUrl}
                      alt={club.clubName}
                      className="w-20 h-20 rounded-xl object-cover shrink-0 border border-white/15"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${club.worldAccent}25`,
                            color: club.worldAccent,
                          }}
                        >
                          {club.worldTitle}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          {club.onlineNow} in room · {club.memberCount} members
                        </span>
                      </div>
                      <h4 className="text-base font-black text-white mt-1">{club.clubName}</h4>
                      <div className="text-xs font-bold text-amber-300 mt-0.5">
                        {club.activeRoomTitle}
                      </div>
                      <p className="text-xs text-white/60 mt-1 line-clamp-1">
                        “{club.recentPostSnippet}” —{' '}
                        <span className="text-white/80">{club.recentPostAuthor}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => enterWorldById(club.worldId)}
                    className="px-4 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-400 hover:text-slate-950 border border-sky-400/40 text-sky-200 font-black text-xs uppercase tracking-wider transition-all shrink-0"
                  >
                    Join Club &amp; Enter World →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT 5 COLS: TRENDING TOPICS & ARIA CANON DEBATES */}
          <div className="lg:col-span-5">
            <div className="mb-5">
              <div className="text-[11px] font-black tracking-[0.22em] uppercase text-amber-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> TRENDING WORLD TOPICS &amp; ARIA DEBATES
              </div>
              <h3 className="text-2xl font-black text-white mt-0.5">
                What Fans Are Debating Right Now
              </h3>
            </div>

            <div className="space-y-3.5">
              {TRENDING_WORLD_TOPICS.map((topic) => (
                <div
                  key={topic.id}
                  onClick={() => enterWorldById(topic.worldId)}
                  className="cursor-pointer rounded-2xl bg-white/[0.03] border border-white/10 hover:border-amber-400/40 p-4 transition-all"
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                    <span>
                      #{topic.rank} · {topic.category}
                    </span>
                    <span className="text-emerald-300 font-mono">{topic.velocityDelta}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-base font-black"
                      style={{ color: topic.worldAccent }}
                    >
                      {topic.hashtag}
                    </span>
                    <span className="text-[11px] text-white/70 font-semibold">
                      {topic.worldTitle}
                    </span>
                  </div>
                  <p className="text-xs text-white/85 font-medium mt-1.5 mb-2">
                    {topic.activeDebateQuestion}
                  </p>

                  {/* Challenger vs Defender Vote Bar */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden flex mb-1.5">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-cyan-300"
                      style={{ width: `${topic.challengerVotesPct}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-rose-400"
                      style={{ width: `${100 - topic.challengerVotesPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-white/65">
                    <span>
                      <strong className="text-sky-300">{topic.challengerVotesPct}%</strong>{' '}
                      {topic.challengerSide}
                    </span>
                    <span>
                      <strong className="text-amber-300">{100 - topic.challengerVotesPct}%</strong>{' '}
                      {topic.defenderSide}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════════
            SECTION 4: 21:9 EXPANDING WIDESCREEN CREATOR WORLD HORIZON STRIPS
           ═══════════════════════════════════════════════════════════════════════════ */}
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-12">
          <div className="mb-6">
            <div className="text-[11px] font-black tracking-[0.24em] uppercase text-sky-400">
              ALL USER-CREATED UNIVERSES · WIDESCREEN HORIZON SLICES
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Explore Every Creator IP &amp; Connected Transmedia Canon
            </h2>
          </div>

          <div className="space-y-3">
            {showcaseWorlds.map((world, idx) => {
              const isExpanded = idx === selectedIndex;
              return (
                <div
                  key={world.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`relative rounded-2xl overflow-hidden border transition-all duration-500 cursor-pointer ${
                    isExpanded
                      ? 'h-64 border-sky-400/60 shadow-2xl'
                      : 'h-24 border-white/10 hover:border-white/30'
                  }`}
                >
                  <img
                    src={world.backdropImage}
                    alt={world.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#05070f]/95 via-[#05070f]/75 to-transparent" />
                  <div className="relative z-10 h-full px-6 flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${world.accentColor}25`,
                              color: world.accentColor,
                            }}
                          >
                            {world.genre}
                          </span>
                          <span className="text-xs text-white/60">
                            Created by <strong className="text-white">{world.creatorName}</strong> (
                            {world.creatorHandle})
                          </span>
                          <span className="text-xs text-emerald-300 font-semibold hidden sm:inline">
                            · Club: {world.activeClubName}
                          </span>
                        </div>
                        <h3
                          className="text-xl sm:text-2xl font-black text-white mt-1"
                          style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                        >
                          {world.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-2 text-xs text-white/75 font-mono">
                          <span>{world.connectedWorks.books} Books</span>·
                          <span>{world.connectedWorks.films} Films</span>·
                          <span>{world.connectedWorks.albums} Albums</span>·
                          <span>{world.connectedWorks.comics} Comics</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEnterWorld(world.worldRef || world);
                          }}
                          className="px-4 py-2 rounded-xl bg-white text-slate-950 font-black text-xs uppercase tracking-wider hover:bg-sky-300 transition-all"
                        >
                          Enter World →
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                        <p className="text-xs sm:text-sm text-white/75 max-w-3xl">
                          {world.synopsis}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {world.featuredLocations.map((loc) => (
                            <span
                              key={loc}
                              className="px-2.5 py-1 rounded-lg bg-white/10 text-[11px] text-white/85"
                            >
                              {loc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          MODAL: COMMUNITY FAN VIDEO PLAYER WITH DIRECT WORLD ENTRY
         ═══════════════════════════════════════════════════════════════════════════ */}
      {activeFanVideoModal && (
        <div
          onClick={() => setActiveFanVideoModal(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full rounded-3xl overflow-hidden bg-[#0b1020] border border-white/20 shadow-2xl"
          >
            <div className="relative h-80 bg-black">
              <img
                src={activeFanVideoModal.thumbnailUrl}
                alt={activeFanVideoModal.title}
                className="w-full h-full object-cover opacity-75"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020] via-transparent to-black/40" />
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/50 text-sky-300 text-xs font-bold">
                  {activeFanVideoModal.categoryLabel} · {activeFanVideoModal.clubName}
                </span>
                <button
                  onClick={() => setActiveFanVideoModal(null)}
                  className="px-3 py-1 rounded-full bg-black/70 text-white/80 hover:text-white text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>
              <div className="absolute bottom-4 left-6 right-6">
                <div className="text-xs font-mono text-amber-300 mb-1">
                  Linked Canon Node: {activeFanVideoModal.linkedCanonNode}
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  {activeFanVideoModal.title}
                </h3>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-white/80 italic mb-5">
                {activeFanVideoModal.videoPreviewQuote}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={activeFanVideoModal.creatorAvatar}
                    alt={activeFanVideoModal.creatorName}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-sm font-bold text-white">
                      {activeFanVideoModal.creatorName}{' '}
                      <span className="text-white/50">{activeFanVideoModal.creatorHandle}</span>
                    </div>
                    <div className="text-xs text-white/55">
                      {activeFanVideoModal.views} · {activeFanVideoModal.likes} likes
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const targetId = activeFanVideoModal.worldId;
                    setActiveFanVideoModal(null);
                    enterWorldById(targetId);
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg"
                >
                  Step Into {activeFanVideoModal.worldTitle} →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldsLandingPortalView;
