// AmboTabbedLibrary — Docked Multi-Source Library across the bottom of Ambo Pro.
// Inspired by FreeShow's 2-column dock (Subcategories on left, items/search on right).
// Tabs:
//   1. Shows       — Service plans, presentations, playlists
//   2. Media       — Local mapped OS folders, pinned folders, video loops, Plajah photos, NDI feeds
//   3. Scripture   — Lectio-powered 66-book canon with full text, exact scripture search
//                    highlighting the target verse in chapter context (not isolated),
//                    double-click to Program Out, and single-click transitions when live
//   4. Chora       — On-platform worship music, hymns, 12-key ambient drone pads, stems
//   5. Reello      — User videos, platform video search, 9:16 social reels, sermon highlights
//   6. Taleo       — Narrative series, films, documentaries
//   7. Visualizers — Flux series VI, Series VII, GLSL shaders, Milkdrop presets, audio-reactive
//   8. Assets      — 24 Fabula DotLottie presets, Tela documents, Lower Thirds, and Fabula Transitions

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, BookOpen, Film, Music, Sparkles, Layers, Tv, Video,
  Sliders, Plus, Play, Eye, Check, Radio, FileText, Flame, Activity,
  Maximize2, ChevronRight, Grid, List, Volume2, RefreshCw, X, AlignLeft,
  Type, MoveHorizontal, Compass, Clock, Folder, FolderPlus, Pin, Trash2,
  Image, ChevronDown, ChevronUp, SlidersHorizontal, Wand2, ChevronLeft
} from 'lucide-react';
import { BOOKS, TRANSLATIONS, type BibleBook, type BibleVerse } from '../../services/bibleService';
import { parseRef, formatRef, type ScriptureRef } from '../../services/scriptureRef';
import { getChapter, DEFAULT_TRANSLATION } from '../../services/scriptureText';
import { newId, type Slide, type Show } from '../../services/ambo/showModel';
import { GENERATOR_ITEMS } from '../../services/ambo/mediaLibrary';
import {
  pickAndSaveBrowserFolder, loadFolderHandle, deleteFolderHandle, ensurePermission, scanBrowserFolder,
  scanWindowsMediaFolder, pickWindowsMediaFolder, revokeFolderUrls, browserFolderAccessSupported,
  getImportTarget, setImportTarget, importFilesIntoTarget, filesFromDataTransfer, createSubfolderIn,
  UNSUPPORTED_MESSAGE, type FolderMediaItem,
} from '../../services/ambo/mediaFolders';
import { type NativeSourceInfo } from '../../services/mediaEngine/bridge';
import { type AmboMediaSourceItem } from './AmboMediaBin';
import { type ScriptureCue } from './AmboScriptureDock';

import {
  isWindowsApp,
  scanWindowsLibrary,
  pickWindowsFolder,
  type WindowsPickedFile,
} from '../../services/windowsBridgeService';
import {
  fetchAllPublicAlbums, fetchPersonalTracks, fetchPersonalAlbums, fetchPersonalPlaylists, updatePlaylist,
  fetchAllVideos, fetchUserVideos, fetchGlobalPhotos, fetchUserPhotos, auth,
} from '../../services/backendService';
import type { Video, Album, Photo } from '../../types';
import { gridSrc } from '../../services/imageDerivatives';
import { thumb, THUMB } from '../../src/lib/imageThumb';
import { searchAudius, fetchAudiusTrending } from '../../services/audiusService';
import { SHADER_LIBRARY, type ShaderLibraryEntry } from '../plajahPixels/components/ShaderPanel';
import { SCENE_CATALOG } from '../plajahPixels/engine/sceneCatalog';
import { AmboVisualizerThumb } from './AmboVisualizerThumb';
import { AmboPoster } from './AmboPoster';
import { AmboShowStill } from './AmboShowStill';
import { AmboLottieStill, AmboTransitionDemo } from './AmboAssetTiles';
import { SquareFrame, squareGridStyle, SQUARE_GRID_CLASS } from './AmboSquareThumb';
import { MILKDROP_PREFIX, TYPO_PREFIX } from '../../services/ambo/layerSources';
import { TYPO_CATALOG } from '../../services/ambo/typoCatalog';
import { type AmboDJTrack } from './AmboDJTrackPlayer';
import { AmboNewAudioPlaylistModal, type AmboAudioPlaylist } from './AmboNewAudioPlaylistModal';
import AmboChoraAudioPanel from './AmboChoraAudioPanel';
import AmboScriptureLook from './AmboScriptureLook';
import { ScriptureQuickBar } from './AmboTemplateMenus';
import { getAutoCueNext, subscribeAutoCueNext } from '../../services/ambo/scriptureAutoCue';
import { rememberLyrics } from '../../services/ambo/lyricFeed';
import { AmboSlideTemplateEntry } from './AmboSlideTemplateGallery';
import AmboRoutinesPanel from './AmboRoutinesPanel';

export type AmboLibraryTab =
  | 'shows'
  | 'media'
  | 'scripture'
  | 'chora'
  | 'reello'
  | 'taleo'
  | 'visualizers'
  | 'assets'
  | 'live'
  | 'routines';

interface PinnedFolder {
  id: string;
  name: string;
  path: string;
  isSystem?: boolean;
  libraryType?: string;
  itemCount: number;
  /** User-added folder: 'handle' = browser directory handle in IndexedDB (id is the key), 'windows' = path via the WinUI bridge. */
  kind?: 'handle' | 'windows';
}

interface FolderStatus {
  state: 'loading' | 'ok' | 'needs-permission' | 'error';
  message?: string;
  truncated?: boolean;
}

interface AmboTabbedLibraryProps {
  activeTab: AmboLibraryTab;
  onSelectTab: (tab: AmboLibraryTab) => void;
  onPreviewSource: (item: AmboMediaSourceItem) => void;
  onProgramSource: (item: AmboMediaSourceItem) => void;
  onFireScripture: (cue: ScriptureCue) => void;
  onCueScripture?: (cue: ScriptureCue) => void;
  onInsertScriptureSlide?: (slide: Slide) => void;
  onPlayAudioTrack?: (track: AmboDJTrack) => void;
  onCueAudioTrack?: (track: AmboDJTrack) => void;
  onTakeAudioTrack?: (track: AmboDJTrack) => void;
  onInsertAudioSlide?: (track: AmboDJTrack) => void;
  onInsertMediaSlide?: (item: AmboMediaSourceItem) => void;
  /** Insert a Tela-designed slide template into the active show (Shows tab). */
  onInsertTemplateSlide?: (slide: Slide) => void;
  currentPlayingAudioId?: string | null;
  nativeSources: NativeSourceInfo[];
  onScanNdi: () => void;
  isScanningNdi: boolean;
  currentLiveInputId?: string | null;
  currentPreviewInputId?: string | null;
  shows?: Show[];
  activeShowId?: string;
  onSelectShow?: (showId: string) => void;
  isScriptureLive?: boolean;
  /** Reference of the scripture on Program / cued in Preview, so the verse list can label them whoever put them there. */
  liveScriptureRef?: string;
  cuedScriptureRef?: string;
  activeTransition?: string;
  transitionDurationSec?: number;
  onSelectTransition?: (transition: string) => void;
  onChangeTransitionDuration?: (sec: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

const BRAND = 'linear-gradient(135deg,#6B0099,#D40055)';
const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const GOLD = '#E3C57E';
const LILAC = '#D0BCFF';
const EMERALD = '#10B981';
const line = 'rgba(255,255,255,0.09)';

/** Merge playlists from the Chora service: the server copy replaces any older local copy. */
function mergeChoraPlaylists(prev: AmboAudioPlaylist[], incoming: AmboAudioPlaylist[]): AmboAudioPlaylist[] {
  const byId = new Map(incoming.map(p => [p.id, p]));
  const kept = prev.filter(p => !byId.has(p.id));
  return [...kept, ...incoming];
}
const glass = 'rgba(255,255,255,0.035)';

// ── Default OS Mapped Folders ──
const DEFAULT_PINNED_FOLDERS: PinnedFolder[] = [
  { id: 'f_videos', name: 'Videos', path: 'Videos', libraryType: 'videos', isSystem: true, itemCount: 18 },
  { id: 'f_music', name: 'Music', path: 'Music', libraryType: 'music', isSystem: true, itemCount: 24 },
  { id: 'f_photos', name: 'Pictures / Photos', path: 'Pictures', libraryType: 'pictures', isSystem: true, itemCount: 45 },
  { id: 'f_downloads', name: 'Downloads', path: 'Downloads', libraryType: 'downloads', isSystem: true, itemCount: 12 },
  { id: 'f_church', name: 'Church Service Media', path: 'D:\\Media\\Services\\2026', isSystem: false, itemCount: 32 },
  { id: 'f_motion', name: 'Motion Backgrounds', path: 'D:\\Media\\Motion Loops', isSystem: false, itemCount: 50 },
];

// ── Real Media Loops & Local Assets ──
const DEFAULT_MEDIA_FILES: AmboMediaSourceItem[] = [
  { id: 'mf_1', name: 'Ethereal Dawn Worship Loop', kind: 'VIDEO', sub: '4K ProRes · 30s Loop', tags: ['motion', 'worship', 'calm'], gradient: 'radial-gradient(120% 90% at 20% 10%, rgba(0,218,243,.7), transparent 60%), radial-gradient(120% 90% at 90% 90%, #6b0099, transparent 55%), #160a26' },
  { id: 'mf_2', name: 'Prismatic Light Refractions', kind: 'VIDEO', sub: '1080p60 · Seamless', tags: ['motion', 'bright'], gradient: 'linear-gradient(120deg,#00daf3,#6b0099 60%,#d40055)' },
  { id: 'mf_3', name: 'Deep Nebula Celestial Dust', kind: 'VIDEO', sub: '4K H.264 · 45s', tags: ['motion', 'space'], gradient: 'radial-gradient(100% 100% at 70% 30%, rgba(212,0,85,.8), transparent 55%), #0a0713' },
  { id: 'mf_4', name: 'Golden Hour Mountain Mist', kind: 'IMAGE', sub: 'High-Res Still · 3840×2160', tags: ['photos', 'nature', 'still'], gradient: 'linear-gradient(135deg,#5e3a00,#1f1300)' },
  { id: 'mf_5', name: 'Grace City Sanctuary Interior', kind: 'IMAGE', sub: 'Church Photography', tags: ['photos', 'sanctuary'], gradient: 'linear-gradient(135deg,#2e1c3b,#0e0914)' },
  { id: 'mf_6', name: 'Service Countdown 5-Min Timer', kind: 'VIDEO', sub: 'Countdown Video · 5:00', tags: ['countdown', 'service'], gradient: 'linear-gradient(135deg,#00334d,#00141f)' },
  { id: 'mf_7', name: 'Communion Bread & Cup Still', kind: 'IMAGE', sub: 'Sacrament Still · 4K', tags: ['photos', 'communion'], gradient: 'linear-gradient(135deg,#42121b,#120407)' },
  { id: 'mf_8', name: 'Fluid Glass Waves Worship', kind: 'VIDEO', sub: '1080p60 · Seamless Loop', tags: ['motion', 'worship'], gradient: 'linear-gradient(135deg,#0d324d,#7f5a83)' },
];

// ── Plajah Photos Libraries ──
const PLAJAH_PHOTOS: AmboMediaSourceItem[] = [
  { id: 'ph_1', name: 'Flora Botanical Collection 01', kind: 'IMAGE', sub: 'Plajah Nature Flora', tags: ['photos', 'flora'], gradient: 'linear-gradient(135deg,#0f3822,#05140c)' },
  { id: 'ph_2', name: 'Flora Botanical Collection 02', kind: 'IMAGE', sub: 'Plajah Nature Flora', tags: ['photos', 'flora'], gradient: 'linear-gradient(135deg,#1c452c,#0a1f13)' },
  { id: 'ph_3', name: 'Congregational Worship Candids', kind: 'IMAGE', sub: 'Organization Media', tags: ['photos', 'organization'], gradient: 'linear-gradient(135deg,#361f47,#12091a)' },
  { id: 'ph_4', name: 'Baptism Sunday 2026 High-Res', kind: 'IMAGE', sub: 'Organization Media', tags: ['photos', 'organization'], gradient: 'linear-gradient(135deg,#0d384d,#041117)' },
  { id: 'ph_5', name: 'Youth Camp Sunset Fellowship', kind: 'IMAGE', sub: 'Personal Photo Library', tags: ['photos', 'personal'], gradient: 'linear-gradient(135deg,#4d2b0d,#1a0e04)' },
  { id: 'ph_6', name: 'Candlelight Vigil Communion', kind: 'IMAGE', sub: 'Personal Photo Library', tags: ['photos', 'personal'], gradient: 'linear-gradient(135deg,#47221f,#170908)' },
];

// ── Chora Worship Tracks, Hymns, Ambient Pads & Stems ──
const CHORA_TRACKS = [
  { id: 'chora_1', title: 'Graves Into Gardens', artist: 'Elevation Worship', key: 'Key of B', bpm: 70, duration: '5:48', category: 'Worship Anthems' },
  { id: 'chora_2', title: 'Goodness of God', artist: 'Bethel Music', key: 'Key of Ab', bpm: 68, duration: '4:56', category: 'Worship Anthems' },
  { id: 'chora_3', title: 'What A Beautiful Name', artist: 'Hillsong Worship', key: 'Key of D', bpm: 68, duration: '5:42', category: 'Worship Anthems' },
  { id: 'chora_4', title: 'Great Are You Lord', artist: 'All Sons & Daughters', key: 'Key of A', bpm: 72, duration: '4:55', category: 'Worship Anthems' },
  { id: 'chora_5', title: 'Way Maker', artist: 'Sinach / Leeland', key: 'Key of E', bpm: 68, duration: '6:12', category: 'Worship Anthems' },
  { id: 'chora_6', title: 'Gratitude', artist: 'Brandon Lake', key: 'Key of B', bpm: 78, duration: '5:37', category: 'Worship Anthems' },
  { id: 'chora_7', title: 'Holy, Holy, Holy! Lord God Almighty', artist: 'Traditional Hymnal', key: 'Key of E', bpm: 64, duration: '3:40', category: 'Anthems & Hymns' },
  { id: 'chora_8', title: 'Amazing Grace (My Chains Are Gone)', artist: 'Traditional / Tomlin', key: 'Key of F', bpm: 60, duration: '4:26', category: 'Anthems & Hymns' },
  { id: 'chora_9', title: 'It Is Well With My Soul', artist: 'Horatio Spafford', key: 'Key of C', bpm: 58, duration: '4:15', category: 'Anthems & Hymns' },
  { id: 'chora_10', title: 'Be Thou My Vision', artist: 'Ancient Irish Hymn', key: 'Key of Eb', bpm: 66, duration: '3:50', category: 'Anthems & Hymns' },
];

// 12-Key Ambient Drone Pads
const DRONE_PAD_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const CHORA_PADS = DRONE_PAD_KEYS.map(k => ({
  id: `pad_${k.replace('#', 's')}`,
  title: `Ambient Warm Drone Pad · Key of ${k}`,
  artist: 'Plajah Sound Lab',
  key: `Key of ${k}`,
  bpm: 0,
  duration: 'Continuous',
  category: 'Ambient Pads (12 Keys)',
}));

// Multitrack Stems
const CHORA_STEMS = [
  { id: 'stem_1', title: 'Way Maker — Multitrack Stems (Click, Guide, Pad, Bass, Drums, Keys)', artist: 'Multitrack Master', key: 'Key of E', bpm: 68, duration: '6:12', category: 'Multitrack Stems' },
  { id: 'stem_2', title: 'Graves Into Gardens — 6-Channel Stem Pack', artist: 'Multitrack Master', key: 'Key of B', bpm: 70, duration: '5:48', category: 'Multitrack Stems' },
  { id: 'stem_3', title: 'Goodness of God — Acoustic + Pad Stem', artist: 'Multitrack Master', key: 'Key of Ab', bpm: 68, duration: '4:56', category: 'Multitrack Stems' },
];

// ── Reello Platform Videos & User Reels ──
const REELLO_CLIPS = [
  { id: 'reel_1', title: 'Sunday Service Welcome & Announcements', ratio: '16:9', duration: '0:45', category: 'Announcements', author: 'Grace Media Team', isUserVideo: true },
  { id: 'reel_2', title: 'Pastor Mark: Grace Under Fire Highlight', ratio: '9:16', duration: '1:15', category: 'Sermon Cuts', author: 'Pastor Mark', isUserVideo: true },
  { id: 'reel_3', title: 'Youth Summer Camp 2026 Recap Reel', ratio: '9:16', duration: '0:58', category: 'Social 9:16', author: 'Youth Ministry', isUserVideo: false },
  { id: 'reel_4', title: 'Water Baptism Testimonies Montage', ratio: '16:9', duration: '2:30', category: 'Testimonies', author: 'Story Team', isUserVideo: false },
  { id: 'reel_5', title: 'Golden Hour Drone Over Sanctuary B-Roll', ratio: '16:9', duration: '1:20', category: 'B-Roll', author: 'Grace Media Team', isUserVideo: true },
  { id: 'reel_6', title: 'Global Missions Update: Kenya Orphanage', ratio: '16:9', duration: '3:10', category: 'Missions', author: 'Outreach Team', isUserVideo: false },
];

// ── Taleo Series & Documentaries ──
const TALEO_SERIES = [
  { id: 'taleo_1', title: 'The Prodigal Chronicles', season: 'Season 1', episodes: 6, category: 'Narrative Films', duration: '24m avg' },
  { id: 'taleo_2', title: 'Echoes of the Reformation', season: 'Docuseries', episodes: 4, category: 'Documentaries', duration: '38m avg' },
  { id: 'taleo_3', title: 'Little Disciples Scripture Adventure', season: 'Season 2', episodes: 12, category: 'Kids & Family', duration: '12m avg' },
  { id: 'taleo_4', title: 'Walk As Children of Light', season: 'Miniseries', episodes: 3, category: 'Narrative Films', duration: '18m avg' },
];

// ── Visualizers: Signature Series VI (Flux), Series VII, Classic, GLSL, Butterchurn ──
const FLUX_SERIES_VI: AmboMediaSourceItem[] = [
  { id: 'flux_ignition', name: 'Flux: Ignition', kind: 'GENERATOR', mode: 'FLUX_IGNITION', sub: 'Series VI · High-Energy Particles', tags: ['flux', 'series6', 'particles'], gradient: 'linear-gradient(135deg, #FF8C00, #D40055)' },
  { id: 'flux_prism', name: 'Flux: Prism Crystalline', kind: 'GENERATOR', mode: 'FLUX_PRISM', sub: 'Series VI · Refractive Caustics', tags: ['flux', 'series6', 'refraction'], gradient: 'linear-gradient(135deg, #00DAF3, #6B0099)' },
  { id: 'flux_theorem', name: 'Flux: Theorem Manifold', kind: 'GENERATOR', mode: 'FLUX_THEOREM', sub: 'Series VI · Vector Field Geometry', tags: ['flux', 'series6', 'geometry'], gradient: 'linear-gradient(135deg, #10B981, #0080FF)' },
];

const SERIES_VII_ART_DIRECTORS: AmboMediaSourceItem[] = [
  { id: 's7_atelier', name: 'Atelier Wash', kind: 'GENERATOR', mode: 'SERIES7_ATELIER', sub: 'Series VII · Architectural Canvas', tags: ['series7', 'minimal', 'wash'], gradient: 'linear-gradient(135deg, #2A2035, #120D1A)' },
  { id: 's7_manifesto', name: 'Manifesto Kinetic', kind: 'GENERATOR', mode: 'SERIES7_MANIFESTO', sub: 'Series VII · Graphic Pulse', tags: ['series7', 'bold', 'kinetic'], gradient: 'linear-gradient(135deg, #E3C57E, #2A1A05)' },
  { id: 's7_phosphor', name: 'Phosphor CRT Scan', kind: 'GENERATOR', mode: 'SERIES7_PHOSPHOR', sub: 'Series VII · Luminescent Glow', tags: ['series7', 'crt', 'glow'], gradient: 'linear-gradient(135deg, #00FF88, #052010)' },
  { id: 's7_salon', name: 'Salon Velvet Light', kind: 'GENERATOR', mode: 'SERIES7_SALON', sub: 'Series VII · Chromatic Chiaroscuro', tags: ['series7', 'velvet', 'worship'], gradient: 'linear-gradient(135deg, #D40055, #350516)' },
];

const BUTTERCHURN_MILKDROP_PRESETS: AmboMediaSourceItem[] = [
  { id: 'bc_cosmic', name: 'Cosmic Milk Reactive', kind: 'GENERATOR', mode: 'BUTTERCHURN_COSMIC', sub: 'Milkdrop · Audio Driven', tags: ['milkdrop', 'reactive'], gradient: 'radial-gradient(circle, #8a2be2, #000033)' },
  { id: 'bc_acid', name: 'Acid Reactive Geometry', kind: 'GENERATOR', mode: 'BUTTERCHURN_ACID', sub: 'Milkdrop · Fast Pulse', tags: ['milkdrop', 'audio'], gradient: 'radial-gradient(circle, #ff007f, #1a0033)' },
  { id: 'bc_neon', name: 'Neon Flow Dissolve', kind: 'GENERATOR', mode: 'BUTTERCHURN_NEON', sub: 'Milkdrop · Ambient', tags: ['milkdrop', 'flow'], gradient: 'linear-gradient(135deg, #00ffff, #ff00ff)' },
  { id: 'bc_lorenz', name: 'Lorenz Chaser Harmonic', kind: 'GENERATOR', mode: 'BUTTERCHURN_LORENZ', sub: 'Milkdrop · Mathematical', tags: ['milkdrop', 'lorenz'], gradient: 'linear-gradient(135deg, #ffd700, #ff4500)' },
];

// ── Assets: 24 Real DotLottie Presets + Tela Templates + Fabula Transitions ──
const FABULA_LOTTIE_PRESETS = [
  { id: 'lot_afrofuture', title: 'Afrofuture Pulse', file: 'afrofuture-pulse.lottie', category: 'DotLottie Animations' },
  { id: 'lot_bauhaus', title: 'Bauhaus Orbit', file: 'bauhaus-orbit.lottie', category: 'DotLottie Animations' },
  { id: 'lot_botanical', title: 'Botanical Field', file: 'botanical-field.lottie', category: 'DotLottie Animations' },
  { id: 'lot_byzantine', title: 'Byzantine Luminous', file: 'byzantine-luminous.lottie', category: 'DotLottie Animations' },
  { id: 'lot_chromatic', title: 'Chromatic Wipe', file: 'chromatic-wipe.lottie', category: 'DotLottie Animations' },
  { id: 'lot_constellation', title: 'Constellation Network', file: 'constellation-network.lottie', category: 'DotLottie Animations' },
  { id: 'lot_constructivist', title: 'Constructivist Cut', file: 'constructivist-cut.lottie', category: 'DotLottie Animations' },
  { id: 'lot_deco', title: 'Deco Halo', file: 'deco-halo.lottie', category: 'DotLottie Animations' },
  { id: 'lot_editorial', title: 'Editorial Cascade', file: 'editorial-cascade.lottie', category: 'DotLottie Animations' },
  { id: 'lot_harlem', title: 'Harlem Rhythm', file: 'harlem-rhythm.lottie', category: 'DotLottie Animations' },
  { id: 'lot_iris', title: 'Iris Bloom', file: 'iris-bloom.lottie', category: 'DotLottie Animations' },
  { id: 'lot_memphis', title: 'Memphis Bounce', file: 'memphis-bounce.lottie', category: 'DotLottie Animations' },
  { id: 'lot_modular', title: 'Modular Metrics', file: 'modular-metrics.lottie', category: 'DotLottie Animations' },
  { id: 'lot_mosaic', title: 'Mosaic Fold', file: 'mosaic-fold.lottie', category: 'DotLottie Animations' },
  { id: 'lot_particle', title: 'Particle Converge', file: 'particle-converge.lottie', category: 'DotLottie Animations' },
  { id: 'lot_prism', title: 'Prism Bars', file: 'prism-bars.lottie', category: 'DotLottie Animations' },
  { id: 'lot_radial', title: 'Radial Bloom', file: 'radial-bloom.lottie', category: 'DotLottie Animations' },
  { id: 'lot_ribbon', title: 'Ribbon Current', file: 'ribbon-current.lottie', category: 'DotLottie Animations' },
  { id: 'lot_shutter', title: 'Shutter Star', file: 'shutter-star.lottie', category: 'DotLottie Animations' },
  { id: 'lot_signal', title: 'Signal Gauge', file: 'signal-gauge.lottie', category: 'DotLottie Animations' },
  { id: 'lot_stream', title: 'Stream Graph', file: 'stream-graph.lottie', category: 'DotLottie Animations' },
  { id: 'lot_swiss', title: 'Swiss Signal', file: 'swiss-signal.lottie', category: 'DotLottie Animations' },
  { id: 'lot_ukiyo', title: 'Ukiyo Tide', file: 'ukiyo-tide.lottie', category: 'DotLottie Animations' },
  { id: 'lot_vaporwave', title: 'Vaporwave Portal', file: 'vaporwave-portal.lottie', category: 'DotLottie Animations' },
];

const TELA_DESIGN_TEMPLATES = [
  { id: 'tela_lt_lilac', title: 'Modern Lilac Lower Third', kind: 'Lower Thirds', category: 'Tela Lower Thirds', sub: 'Animated Speaker Banner' },
  { id: 'tela_lt_scripture', title: 'Scripture Reference Banner', kind: 'Lower Thirds', category: 'Tela Lower Thirds', sub: 'Book / Chapter / Verse Tag' },
  { id: 'tela_lt_minimal', title: 'Minimalist Dark Accent Bar', kind: 'Lower Thirds', category: 'Tela Lower Thirds', sub: 'Subtle Corner Bug' },
  { id: 'tela_doc_sermon', title: 'Sermon Outline Master Slide', kind: 'Tela Document', category: 'Tela Documents', sub: 'Multi-Point Layout' },
  { id: 'tela_doc_liturgy', title: 'Call & Response Liturgy Sheet', kind: 'Tela Document', category: 'Tela Documents', sub: 'Two-Column Verse' },
  { id: 'tela_vis_giving', title: 'Dynamic Giving QR Code Card', kind: 'Data Visualizer', category: 'Data Visualizers', sub: 'Interactive Mobile Giving' },
  { id: 'tela_vis_timer', title: '5-Minute Service Countdown Clock', kind: 'Data Visualizer', category: 'Data Visualizers', sub: 'Live Vector Timer' },
];

// Module-level data cache — survives tab switches, only refetches if stale
const _cache = {
  chora: { data: null as any, ts: 0 },
  reello: { data: null as any, ts: 0 },
  taleo: { data: null as any, ts: 0 },
  photos: { data: null as any, ts: 0 },
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const isFresh = (key: keyof typeof _cache) => _cache[key].data && (Date.now() - _cache[key].ts) < CACHE_TTL;

// ── Complete 16 Fabula Native Transitions from transitionRenderer.ts ──
export const FABULA_TRANSITIONS = [
  { id: 'cut', name: 'Cut', sub: 'Instantaneous 0-frame switch', duration: 0 },
  { id: 'cross_dissolve', name: 'Cross Dissolve', sub: 'Smooth gamma-corrected mix (Default)', duration: 0.8 },
  { id: 'luma_dissolve', name: 'Luma Dissolve', sub: 'Brightness key gradient reveal', duration: 1.0 },
  { id: 'light_leak', name: 'Organic Light Leak', sub: 'Warm anamorphic optical flare sweep', duration: 1.2 },
  { id: 'whip_pan', name: 'Whip Pan', sub: 'Dynamic horizontal directional motion blur', duration: 0.6 },
  { id: 'prism_warp', name: 'Prism Warp', sub: 'Radial chromatic dispersion warp', duration: 0.9 },
  { id: 'ink_reveal', name: 'Ink Reveal', sub: 'Organic simplex noise paper bleed', duration: 1.2 },
  { id: 'glow_dissolve', name: 'Glow Dissolve', sub: 'Highlight bloom luminescent transition', duration: 1.0 },
  { id: 'blur_dissolve', name: 'Blur Dissolve', sub: 'Gaussian depth-of-field soft focus', duration: 0.8 },
  { id: 'bokeh_dissolve', name: 'Bokeh Dissolve', sub: 'Lens hexagonal optical bokeh blur', duration: 1.0 },
  { id: 'zoom_pull', name: 'Zoom Pull', sub: 'Cinematic push-pull focal length crash', duration: 0.7 },
  { id: 'film_roll', name: 'Film Roll', sub: 'Vertical 35mm projector gate slip', duration: 0.6 },
  { id: 'glitch_cut', name: 'Glitch Cut', sub: 'Digital broadcast sync error & bit slippage', duration: 0.4 },
  { id: 'rgb_split', name: 'RGB Split', sub: 'Three-color channel chromatic aberration', duration: 0.5 },
  { id: 'burn_flash', name: 'Burn / Flash', sub: 'High-energy whiteover ignition flash', duration: 0.5 },
  { id: 'push_slide', name: 'Push Slide', sub: 'Broadcast DVE side-by-side push', duration: 0.7 },
  { id: 'shape_wipe', name: 'Shape Wipe', sub: 'Geometric radial iris expand & collapse', duration: 0.8 },
];

export const AmboTabbedLibrary: React.FC<AmboTabbedLibraryProps> = ({
  activeTab,
  onSelectTab,
  onPreviewSource,
  onProgramSource,
  onFireScripture,
  onCueScripture,
  onInsertScriptureSlide,
  onPlayAudioTrack,
  onCueAudioTrack,
  onTakeAudioTrack,
  onInsertAudioSlide,
  onInsertMediaSlide,
  onInsertTemplateSlide,
  currentPlayingAudioId,
  nativeSources,
  onScanNdi,
  isScanningNdi,
  currentLiveInputId,
  currentPreviewInputId,
  shows = [],
  activeShowId,
  onSelectShow,
  isScriptureLive = false,
  liveScriptureRef,
  cuedScriptureRef,
  activeTransition = 'Cross Dissolve',
  transitionDurationSec = 0.8,
  onSelectTransition,
  onChangeTransitionDuration,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}) => {
  // ── Global Search and Subcategory selection ──
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const [selectedSubcat, setSelectedSubcat] = useState<string>('all');

  const INITIAL_RENDER_LIMIT = 50;
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [activeTab, selectedSubcat]);

  // ── Chora Platform Music, Locker Tracks & Audio Playlists ──
  const [choraPublicTracks, setChoraPublicTracks] = useState<AmboDJTrack[]>([]);
  const [personalLockerTracks, setPersonalLockerTracks] = useState<AmboDJTrack[]>([]);
  const [audioPlaylists, setAudioPlaylists] = useState<AmboAudioPlaylist[]>(() => {
    try {
      const saved = localStorage.getItem('ambo_audio_playlists');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: 'ap_1', title: 'Sunday Morning Prelude', category: 'Prelude & Walk-In Music', trackIds: ['chora_1', 'chora_2', 'chora_6'], createdAt: Date.now() - 100000 },
      { id: 'ap_2', title: 'Communion & Prayer Atmosphere', category: 'Communion & Meditation', trackIds: ['chora_9', 'chora_10', 'pad_D', 'pad_G'], createdAt: Date.now() - 50000 },
      { id: 'ap_3', title: 'Worship Set Essentials', category: 'Worship Anthems', trackIds: ['chora_3', 'chora_4', 'chora_5'], createdAt: Date.now() - 20000 },
    ];
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isNewAudioPlaylistModalOpen, setIsNewAudioPlaylistModalOpen] = useState(false);
  
  const [choraPublicAlbums, setChoraPublicAlbums] = useState<Album[]>([]);
  const [personalLockerAlbums, setPersonalLockerAlbums] = useState<Album[]>([]);
  const [audiusTrending, setAudiusTrending] = useState<AmboDJTrack[]>([]);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);

  const [isLoadingChora, setIsLoadingChora] = useState(false);

  useEffect(() => {
    let active = true;
    const loadChora = async () => {
      if (isFresh('chora')) {
        const c = _cache.chora.data;
        setChoraPublicAlbums(c.albums);
        setPersonalLockerAlbums(c.pAlbums);
        setAudiusTrending(c.audius);
        setChoraPublicTracks(c.pub);
        setPersonalLockerTracks(c.locker);
        rememberLyrics([...c.pub, ...c.locker]);
        if (c.mappedPlaylists) {
          setAudioPlaylists(prev => mergeChoraPlaylists(prev, c.mappedPlaylists));
        }
        return;
      }
      
      try {
        setIsLoadingChora(true);
        const uid = auth.currentUser?.uid;
        const [albums, personal, pAlbums, pPlaylists, audiusRes] = await Promise.all([
          fetchAllPublicAlbums().catch(() => []),
          fetchPersonalTracks().catch(() => []),
          fetchPersonalAlbums().catch(() => []),
          uid ? fetchPersonalPlaylists(uid).catch(() => []) : Promise.resolve([]),
          fetchAudiusTrending('Electronic', 20).catch(() => []),
        ]);

        if (!active) return;
        
        setChoraPublicAlbums(albums || []);
        setPersonalLockerAlbums(pAlbums || []);
        
        const mappedAudius: AmboDJTrack[] = (audiusRes || []).map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          url: t.url,
          duration: t.duration,
          coverImage: t.thumbnailUrl,
          category: 'Audius',
        }));
        setAudiusTrending(mappedAudius);

        // Flatten all public album tracks from artists across Chora
        const pub: AmboDJTrack[] = [];
        for (const al of (albums || [])) {
          for (const t of (al.tracks || [])) {
            pub.push({
              id: t.id,
              title: t.title,
              artist: t.artist || al.artist || 'Chora Artist',
              url: t.url,
              duration: t.duration,
              coverImage: al.coverImage,
              key: (t as any).key || 'Key of C',
              bpm: (t as any).bpm || 72,
              category: 'Artists & Albums',
              timeCodedLyrics: (t as any).timeCodedLyrics,
            });
          }
        }
        setChoraPublicTracks(pub);

        // Personal locker tracks
        const locker: AmboDJTrack[] = (personal || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist || 'My Music Locker',
          url: t.url,
          duration: t.duration,
          coverImage: t.coverImage,
          key: t.key || 'Key of G',
          bpm: t.bpm || 70,
          category: 'Personal Music Locker',
          timeCodedLyrics: t.timeCodedLyrics,
        }));
        setPersonalLockerTracks(locker);
        // Lyric sync resolves songs queued from a snapshot through this cache.
        rememberLyrics([...pub, ...locker]);

        let mappedPlaylists: AmboAudioPlaylist[] = [];
        if (pPlaylists && pPlaylists.length > 0) {
          mappedPlaylists = pPlaylists.map((p: any) => ({
            id: p.id,
            title: p.title || p.name || 'Playlist',
            description: p.description,
            category: 'Audio Playlists',
            trackIds: p.trackIds || [],
            createdAt: p.createdAt || p.timestamp || Date.now(),
            source: 'chora' as const,
            tracks: (p.tracks || []).map((t: any) => ({
              id: t.id, title: t.title, artist: t.artist, url: t.url,
              duration: t.duration, coverImage: t.coverImage || p.coverImage, category: 'Audio Playlists',
            })),
          }));
          setAudioPlaylists(prev => mergeChoraPlaylists(prev, mappedPlaylists));
        }
        
        _cache.chora = {
          data: {
            albums: albums || [],
            pAlbums: pAlbums || [],
            audius: mappedAudius,
            pub,
            locker,
            mappedPlaylists
          },
          ts: Date.now()
        };
      } catch (err) {
        console.warn('[AmboTabbedLibrary] Failed loading Chora tracks', err);
      } finally {
        setIsLoadingChora(false);
      }
    };
    loadChora();
  }, []);

  // ── On-Platform Reello Videos & User Uploads ──
  const [platformVideos, setPlatformVideos] = useState<Video[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);

  // ── On-Platform Taleo Series, Documentaries & Films ──
  const [taleoReleases, setTaleoReleases] = useState<Album[]>([]);
  const [isLoadingTaleo, setIsLoadingTaleo] = useState(false);

  // ── Complete Milkdrop Presets Library (Butterchurn) ──
  const [milkdropNames, setMilkdropNames] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    const loadReello = async () => {
      if (isFresh('reello')) {
        const c = _cache.reello.data;
        setPlatformVideos(c.platform);
        setUserVideos(c.user);
        return;
      }
      setIsLoadingVideos(true);
      try {
        const vids = await fetchAllVideos().catch(() => []);
        let uVids: Video[] = [];
        if (auth.currentUser?.uid) {
          uVids = await fetchUserVideos(auth.currentUser.uid).catch(() => []);
        }
        if (!active) return;
        setPlatformVideos(vids || []);
        setUserVideos(uVids || []);
        _cache.reello = { data: { platform: vids || [], user: uVids || [] }, ts: Date.now() };
      } catch (err) {
        console.warn('[AmboTabbedLibrary] Failed loading platform videos', err);
      } finally {
        if (active) setIsLoadingVideos(false);
      }
    };
    loadReello();

    const loadTaleo = async () => {
      if (isFresh('taleo')) {
        setTaleoReleases(_cache.taleo.data);
        return;
      }
      setIsLoadingTaleo(true);
      try {
        const albums = await fetchAllPublicAlbums().catch(() => []);
        if (!active) return;
        if (albums) {
          const taleo = albums.filter(
            a =>
              a.type === 'VIDEO' ||
              a.subType === 'MOVIE' ||
              a.subType === 'TV_SERIES' ||
              Boolean(a.movieMetadata) ||
              Boolean(a.filmDistribution) ||
              (a.seasons && a.seasons.length > 0)
          );
          setTaleoReleases(taleo);
          _cache.taleo = { data: taleo, ts: Date.now() };
        }
      } catch (err) {
        console.warn('[AmboTabbedLibrary] Failed loading Taleo series', err);
      } finally {
        if (active) setIsLoadingTaleo(false);
      }
    };
    loadTaleo();

    // Load full Butterchurn Milkdrop preset names
    import('butterchurn-presets')
      .then(mod => {
        const api = (mod as any).default || mod;
        const presets = api.getPresets ? api.getPresets() : api;
        const names = Object.keys(presets || {}).sort();
        if (active && names.length > 0) {
          setMilkdropNames(names);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Only Ambo's own playlists are stored locally; Chora playlists live in the
  // Chora service and are re-read from it.
  const persistPlaylists = (list: AmboAudioPlaylist[]) => {
    try { localStorage.setItem('ambo_audio_playlists', JSON.stringify(list.filter(x => x.source !== 'chora'))); } catch {}
  };

  const handleCreateAudioPlaylist = (newPl: AmboAudioPlaylist) => {
    setAudioPlaylists(prev => {
      const updated = [{ ...newPl, source: 'local' as const }, ...prev];
      persistPlaylists(updated);
      return updated;
    });
    setSelectedPlaylistId(newPl.id);
    setSelectedSubcat('Audio Playlists');
  };

  const handleUpdateAudioPlaylist = (id: string, patch: Partial<AmboAudioPlaylist>) => {
    const target = audioPlaylists.find(x => x.id === id);
    setAudioPlaylists(prev => {
      const updated = prev.map(x => (x.id === id ? { ...x, ...patch } : x));
      persistPlaylists(updated);
      return updated;
    });
    // Edits to a Chora playlist go back to the Chora service, so the same
    // playlist is current in the Chora app.
    if (target?.source === 'chora' && patch.trackIds) {
      void updatePlaylist(id, { trackIds: patch.trackIds }).catch(err => console.warn('[Ambo] Chora playlist sync failed', err));
    }
  };

  const handleDeleteAudioPlaylist = (id: string) => {
    setAudioPlaylists(prev => {
      const updated = prev.filter(x => x.id !== id);
      persistPlaylists(updated);
      return updated;
    });
  };

  // ── Local OS Pinned Folders ──
  const [pinnedFolders, setPinnedFolders] = useState<PinnedFolder[]>(() => {
    try {
      const saved = localStorage.getItem('ambo_pinned_folders');
      return saved ? JSON.parse(saved) : DEFAULT_PINNED_FOLDERS;
    } catch {
      return DEFAULT_PINNED_FOLDERS;
    }
  });

  const [activeFolderId, setActiveFolderId] = useState<string>('f_videos');
  const [customFolderFiles, setCustomFolderFiles] = useState<AmboMediaSourceItem[]>([]);
  const [realFolderFiles, setRealFolderFiles] = useState<AmboMediaSourceItem[]>([]);
  const [isLoadingFolderFiles, setIsLoadingFolderFiles] = useState<boolean>(false);
  const [platformPhotos, setPlatformPhotos] = useState<AmboMediaSourceItem[]>([]);

  const [folderStatus, setFolderStatus] = useState<Record<string, FolderStatus>>({});
  const [folderNotice, setFolderNotice] = useState<string | null>(null);
  const [scanTick, setScanTick] = useState(0);
  const [importTargetId, setImportTargetId] = useState<string | null>(() => getImportTarget()?.folderId ?? null);
  const setStatus = (id: string, st: FolderStatus) => setFolderStatus(prev => ({ ...prev, [id]: st }));
  const savePinned = (list: PinnedFolder[]) => {
    setPinnedFolders(list);
    try { localStorage.setItem('ambo_pinned_folders', JSON.stringify(list)); } catch {}
  };
  const toSourceItem = (it: FolderMediaItem, folder: PinnedFolder): AmboMediaSourceItem => {
    const kind = it.kind === 'DOC' ? 'IMAGE' : it.kind;
    const where = it.relPath.includes('/') ? it.relPath.slice(0, it.relPath.lastIndexOf('/')) : '';
    return {
      id: `fm_${it.id}`,
      name: it.name,
      kind,
      sub: `${(it.size / (1024 * 1024)).toFixed(1)} MB · ${folder.name}${where ? ` / ${where}` : ''}`,
      src: it.url,
      thumb: kind === 'IMAGE' ? it.url : undefined,
      tags: ['local', folder.name.toLowerCase(), kind.toLowerCase()],
    };
  };

  // Scan the active folder. Custom folders: browser handle (IndexedDB, recursive) or Windows path (bridge).
  useEffect(() => {
    let cancelled = false;
    const activeFolder = pinnedFolders.find(f => f.id === activeFolderId);
    if (!activeFolder) return;
    const finish = (items: AmboMediaSourceItem[], truncated = false) => {
      setIsLoadingFolderFiles(false);
      setRealFolderFiles(items);
      setStatus(activeFolder.id, { state: 'ok', truncated });
      setPinnedFolders(prev => prev.map(pf => pf.id === activeFolder.id && pf.itemCount !== items.length ? { ...pf, itemCount: items.length } : pf));
    };
    const fail = (message: string, state: FolderStatus['state'] = 'error') => {
      setIsLoadingFolderFiles(false);
      setRealFolderFiles([]);
      setStatus(activeFolder.id, { state, message });
    };

    if (activeFolder.kind === 'handle') {
      setIsLoadingFolderFiles(true);
      (async () => {
        const handle = await loadFolderHandle(activeFolder.id);
        if (cancelled) return;
        if (!handle) return fail('This folder is no longer linked in this browser. Remove it and add it again.');
        const perm = await ensurePermission(handle, false);
        if (cancelled) return;
        if (perm !== 'granted') return fail('The browser needs your OK to open this folder again.', 'needs-permission');
        const res = await scanBrowserFolder(activeFolder.id, handle);
        if (cancelled) return;
        finish(res.items.map(it => toSourceItem(it, activeFolder)), res.truncated);
        if (res.errors.length) setStatus(activeFolder.id, { state: 'ok', truncated: res.truncated, message: `${res.errors.length} item(s) could not be read.` });
      })().catch(e => { if (!cancelled) fail(e?.message || 'Could not read this folder.'); });
    } else if (activeFolder.kind === 'windows') {
      if (!isWindowsApp()) { fail('This folder lives on a Windows PC — open it in the Plajah Windows app.'); return; }
      setIsLoadingFolderFiles(true);
      scanWindowsMediaFolder(activeFolder.id, activeFolder.path)
        .then(res => {
          if (cancelled) return;
          if (res.errors.length && res.items.length === 0) return fail(res.errors[0]);
          finish(res.items.map(it => toSourceItem(it, activeFolder)), res.truncated);
        })
        .catch(e => { if (!cancelled) fail(e?.message || 'Could not read this folder.'); });
    } else if (isWindowsApp()) {
      setIsLoadingFolderFiles(true);
      scanWindowsLibrary(activeFolder.libraryType || activeFolder.name.toLowerCase(), activeFolder.path)
        .then(res => {
          if (cancelled) return;
          if (res && res.success && res.files) {
            finish(res.files.map(f => {
              const kind = f.kind || (/\.(mp4|mov|webm|mkv|avi|wmv)$/i.test(f.name) ? 'VIDEO' : /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name) ? 'AUDIO' : 'IMAGE');
              const streamUrl = f.streamUrl || f.path;
              return {
                id: `win_${f.path}`,
                name: f.name,
                kind,
                sub: `${(f.size / (1024 * 1024)).toFixed(1)} MB · ${activeFolder.name}`,
                src: streamUrl,
                thumb: kind === 'IMAGE' ? streamUrl : undefined,
                tags: ['local', activeFolder.name.toLowerCase(), kind.toLowerCase()],
              };
            }));
          } else {
            fail(res?.error || 'This folder is unavailable (moved, renamed, or offline).');
          }
        })
        .catch(() => { if (!cancelled) fail('Could not read this folder.'); });
    } else {
      // Plain browser, built-in shortcut folder (Videos / Music / ...): there is nothing to read.
      setRealFolderFiles([]);
    }
    return () => {
      cancelled = true;
    };
  }, [activeFolderId, activeTab, scanTick]);

  // Load real Platform Photos and User Locker Photos
  useEffect(() => {
    let cancelled = false;
    const loadPhotos = async () => {
      if (isFresh('photos')) {
        setPlatformPhotos(_cache.photos.data);
        return;
      }
      try {
        const photos = await fetchGlobalPhotos(false);
        if (cancelled || !photos) return;
        let userPhotosList: Photo[] = [];
        const currentUid = auth.currentUser?.uid;
        if (currentUid) {
          try {
            userPhotosList = await fetchUserPhotos(currentUid);
          } catch {}
        }
        if (cancelled) return;
        const allPhotos = [...userPhotosList, ...photos];
        const seen = new Set<string>();
        const unique = allPhotos.filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });

        const mapped: AmboMediaSourceItem[] = unique.map(p => {
          const isUser = p.ownerId === currentUid;
          const displayTags = [
            'photos',
            ...(p.tags || []),
            isUser ? 'personal' : 'organization',
            'platform',
          ];
          const imgUrl = p.thumbUrl || gridSrc(p) || p.url;
          return {
            id: `plat_photo_${p.id}`,
            name: p.title || p.description || 'Plajah Photo',
            kind: 'IMAGE',
            sub: p.tags && p.tags.length ? p.tags.slice(0, 2).join(', ') : isUser ? 'My Photo Locker' : 'Plajah Photos Library',
            src: p.url,
            thumb: imgUrl,
            tags: displayTags,
          };
        });
        setPlatformPhotos(mapped);
        _cache.photos = { data: mapped, ts: Date.now() };
      } catch (err) {
        // ignore
      }
    };
    loadPhotos();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddFolder = async () => {
    setFolderNotice(null);
    const id = `f_${Date.now()}`;
    try {
      let folder: PinnedFolder | null = null;
      if (isWindowsApp()) {
        const picked = await pickWindowsMediaFolder();
        if (picked) folder = { id, name: picked.name, path: picked.path, isSystem: false, itemCount: 0, kind: 'windows' };
      } else if (browserFolderAccessSupported()) {
        const picked = await pickAndSaveBrowserFolder(id);
        if (picked) folder = { id, name: picked.name, path: `Local Folder: ${picked.name}`, isSystem: false, itemCount: 0, kind: 'handle' };
      } else {
        setFolderNotice(UNSUPPORTED_MESSAGE);
        return;
      }
      if (!folder) return; // cancelled
      savePinned([...pinnedFolders, folder]);
      setSelectedSubcat('Pinned Folders');
      setActiveFolderId(folder.id);
      setScanTick(t => t + 1);
    } catch (e: any) {
      setFolderNotice(`Could not add the folder: ${e?.message || 'access was blocked'}`);
    }
  };

  const handleRemoveFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const gone = pinnedFolders.find(f => f.id === folderId);
    const updated = pinnedFolders.filter(f => f.id !== folderId);
    if (gone?.kind === 'handle') { revokeFolderUrls(folderId); void deleteFolderHandle(folderId); }
    if (getImportTarget()?.folderId === folderId) { setImportTarget(null); setImportTargetId(null); }
    if (activeFolderId === folderId) {
      setRealFolderFiles([]);
      if (updated.length > 0) setActiveFolderId(updated[0].id);
    }
    savePinned(updated);
  };

  const handleRenameFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const f = pinnedFolders.find(x => x.id === folderId);
    const name = f && window.prompt('Rename folder (display name only — the folder on disk is not renamed):', f.name)?.trim();
    if (!f || !name) return;
    savePinned(pinnedFolders.map(x => (x.id === folderId ? { ...x, name } : x)));
    const t = getImportTarget();
    if (t?.folderId === folderId) setImportTarget({ ...t, name });
  };

  const handleRescanFolder = (folderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (folderId !== activeFolderId) { setSelectedSubcat('Pinned Folders'); setActiveFolderId(folderId); }
    setScanTick(t => t + 1);
  };

  /** Must run from a click: the browser only re-grants folder access on a user gesture. */
  const handleReconnectFolder = async (folderId: string) => {
    const handle = await loadFolderHandle(folderId);
    if (!handle) { setStatus(folderId, { state: 'error', message: 'This folder is no longer linked in this browser. Remove it and add it again.' }); return; }
    const perm = await ensurePermission(handle, true);
    if (perm === 'granted') setScanTick(t => t + 1);
    else setStatus(folderId, { state: 'needs-permission', message: 'Access was not granted. Choose Allow when the browser asks.' });
  };

  const handleToggleImportTarget = (folder: PinnedFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!folder.kind) return;
    if (importTargetId === folder.id) { setImportTarget(null); setImportTargetId(null); return; }
    setImportTarget({ folderId: folder.id, kind: folder.kind, path: folder.kind === 'windows' ? folder.path : undefined, name: folder.name });
    setImportTargetId(folder.id);
  };

  /** Copy OS files into a custom folder so they persist, then rescan. */
  const handleImportIntoFolder = async (folder: PinnedFolder, files: File[]) => {
    if (!folder.kind || files.length === 0) return;
    if (folder.kind === 'windows' && !isWindowsApp()) { setFolderNotice('Writing to a Windows folder needs the Plajah Windows app.'); return; }
    setFolderNotice(null);
    const res = await importFilesIntoTarget(files, { folderId: folder.id, kind: folder.kind, path: folder.kind === 'windows' ? folder.path : undefined, name: folder.name });
    const bad = res.filter(r => !r.persisted);
    setFolderNotice(bad.length ? `${res.length - bad.length} of ${res.length} copied into "${folder.name}". ${bad[0].note || 'Some files could not be copied.'}` : `Copied ${res.length} file${res.length === 1 ? '' : 's'} into "${folder.name}".`);
    setScanTick(t => t + 1);
  };

  const handleNewSubfolder = async (folder: PinnedFolder) => {
    if (folder.kind !== 'handle') { setFolderNotice('Creating subfolders from Ambo works with browser-linked folders; use Explorer for Windows folders.'); return; }
    const name = window.prompt('New subfolder name:')?.trim();
    if (!name) return;
    try {
      const handle = await loadFolderHandle(folder.id);
      if (!handle) throw new Error('folder is not linked');
      if ((await ensurePermission(handle, true)) !== 'granted') throw new Error('permission was not granted');
      const made = await createSubfolderIn(handle, name);
      setFolderNotice(`Created "${made}" in ${folder.name}. Drop files in it from your computer, or import above.`);
    } catch (e: any) {
      setFolderNotice(`Could not create the subfolder: ${e?.message || 'failed'}`);
    }
  };

  // ── Scripture (Lectio) Specific State ──
  const [scriptureTestament, setScriptureTestament] = useState<'ALL' | 'OT' | 'NT'>('ALL');
  const [selectedBookNum, setSelectedBookNum] = useState<number>(43); // Default: John (43)
  const [selectedChapter, setSelectedChapter] = useState<number>(3);  // Default: John 3
  const [highlightVerseNum, setHighlightVerseNum] = useState<number | null>(16); // Default: John 3:16
  const autoCueOn = useSyncExternalStore(subscribeAutoCueNext, getAutoCueNext);
  const chapterGridRef = useRef<HTMLDivElement>(null);
  /** "All chapters" popup — every chapter of the open book at once (the inline box scrolls for long books). */
  const chapterColRef = useRef<HTMLDivElement>(null);
  const chapterPopRef = useRef<HTMLDivElement>(null);
  const [chapterPopup, setChapterPopup] = useState<{ left: number; bottom: number; maxH: number } | null>(null);
  const openChapterPopup = () => {
    const r = chapterColRef.current?.getBoundingClientRect();
    if (!r) return;
    const bottom = Math.max(8, window.innerHeight - r.bottom);
    setChapterPopup({ left: Math.max(8, Math.min(r.right + 6, window.innerWidth - 580)), bottom, maxH: Math.min(window.innerHeight - bottom - 12, 720) });
  };
  useEffect(() => {
    if (!chapterPopup) return;
    const down = (e: PointerEvent) => { if (chapterPopRef.current && !chapterPopRef.current.contains(e.target as Node)) setChapterPopup(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setChapterPopup(null); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [chapterPopup]);
  useEffect(() => {
    chapterGridRef.current?.querySelector(`[data-ch="${selectedChapter}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedChapter, selectedBookNum]);
  /** Does a reference like "John 3:16" or "John 3:16-17" cover this verse of the open chapter? */
  const refCovers = (ref: string | undefined, verse: number): boolean => {
    if (!ref || !activeBook) return false;
    const m = ref.trim().match(/^(.*?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m || m[1].toLowerCase() !== activeBook.name.toLowerCase() || +m[2] !== selectedChapter) return false;
    const lo = +m[3], hi = m[4] ? +m[4] : lo;
    return verse >= lo && verse <= hi;
  };
  const [translationSlug, setTranslationSlug] = useState<string>(DEFAULT_TRANSLATION);
  const [chapterVerses, setChapterVerses] = useState<BibleVerse[]>([]);
  const [loadingVerses, setLoadingVerses] = useState<boolean>(false);
  const [scriptureViewMode, setScriptureViewMode] = useState<'single' | 'passage' | 'reflow'>('single');
  const [autoTextFit, setAutoTextFit] = useState<boolean>(true);
  const [reflowAroundObjects, setReflowAroundObjects] = useState<boolean>(true);
  const [referencePlacement, setReferencePlacement] = useState<'bottom' | 'top' | 'badge'>('bottom');
  const verseListRef = useRef<HTMLDivElement>(null);
  const verseItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Filter 66 Books by testament and search
  const filteredBooks = useMemo(() => {
    return BOOKS.filter(b => {
      if (scriptureTestament !== 'ALL' && b.testament !== scriptureTestament) return false;
      if (debouncedSearch && debouncedSearch.trim() && activeTab === 'scripture') {
        const q = debouncedSearch.toLowerCase().trim();
        return (b.name && b.name.toLowerCase().includes(q)) || String(b.num) === q;
      }
      return true;
    });
  }, [scriptureTestament, debouncedSearch, activeTab]);

  const activeBook = useMemo(() => {
    return BOOKS.find(b => b.num === selectedBookNum) || BOOKS[42]; // Fallback John
  }, [selectedBookNum]);

  // Load verses for active book & chapter
  useEffect(() => {
    let cancelled = false;
    setLoadingVerses(true);
    getChapter(translationSlug, selectedBookNum, selectedChapter)
      .then(verses => {
        if (!cancelled) {
          setChapterVerses(verses || []);
          setLoadingVerses(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChapterVerses([]);
          setLoadingVerses(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBookNum, selectedChapter, translationSlug]);

  // Handle Exact Scripture Search
  const handleScriptureSearchSubmit = (text: string) => {
    if (!text || !text.trim()) return;
    const parsed = parseRef(text.trim());
    if (parsed) {
      setSelectedBookNum(parsed.book);
      setSelectedChapter(parsed.chapterStart);
      if (parsed.verseStart) {
        setHighlightVerseNum(parsed.verseStart);
      }
    }
  };

  // Scroll to highlighted verse in chapter context
  useEffect(() => {
    if (highlightVerseNum != null && verseItemRefs.current.has(highlightVerseNum)) {
      const el = verseItemRefs.current.get(highlightVerseNum);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightVerseNum, chapterVerses]);

  // Build Scripture Cue from verse
  const buildScriptureCue = (verse: BibleVerse): ScriptureCue => {
    const bookName = activeBook?.name || 'Scripture';
    return {
      refId: `${bookName.toLowerCase()}.${selectedChapter}.${verse.verse}`,
      reference: `${bookName} ${selectedChapter}:${verse.verse}`,
      translation: translationSlug.toUpperCase(),
      lines: [verse.text],
    };
  };

  // Scripture interaction contract:
  // 1. Double-click: ALWAYS sends to Program Out (Take Live)
  // 2. Single-click when isScriptureLive is true: smoothly TRANSITIONS Program Out to this next verse!
  // 3. Single-click when NOT live: cues in Preview and highlights in context
  /** Take a verse to Program. With Auto-cue next on, the presenter cues the following verse into Preview; here the list follows it. */
  const fireVerse = (verse: BibleVerse) => {
    onFireScripture(buildScriptureCue(verse));
    if (getAutoCueNext()) {
      const next = chapterVerses.find(v => v.verse > verse.verse);
      setHighlightVerseNum(next ? next.verse : verse.verse);
    } else {
      setHighlightVerseNum(verse.verse);
    }
  };

  const handleVerseClick = (verse: BibleVerse) => {
    if (isScriptureLive) {
      fireVerse(verse);
    } else {
      setHighlightVerseNum(verse.verse);
      if (onCueScripture) onCueScripture(buildScriptureCue(verse));
    }
  };

  const handleVerseDoubleClick = (verse: BibleVerse) => {
    fireVerse(verse);
  };

  const handleInsertScriptureAsSlide = (verse: BibleVerse) => {
    const bookName = activeBook?.name || 'Scripture';
    const slide: Slide = {
      id: newId('scr_slide'),
      label: `${bookName} ${selectedChapter}:${verse.verse}`,
      group: 'Scripture Reading',
      groupColor: GOLD,
      layers: [
        {
          id: newId('ly_bg'),
          slot: 'background',
          content: {
            kind: 'GENERATOR',
            mode: 'STUDIO_AURORA',
          },
        },
        {
          id: newId('ly_scr'),
          slot: 'scripture',
          content: {
            kind: 'SCRIPTURE',
            refId: `${bookName.toLowerCase()}.${selectedChapter}.${verse.verse}`,
            reference: `${bookName} ${selectedChapter}:${verse.verse}`,
            translation: translationSlug.toUpperCase(),
            lines: [verse.text],
          },
        },
      ],
    };
    if (onInsertScriptureSlide) {
      onInsertScriptureSlide(slide);
    }
  };

  // ── Combined Visualizers List: SCENE_CATALOG + SHADER_LIBRARY + Butterchurn Milkdrop ──
  const visualizerItems: AmboMediaSourceItem[] = useMemo(() => {
    // 1. Plajah Pixels Generators (SCENE_CATALOG)
    const sceneItems: AmboMediaSourceItem[] = SCENE_CATALOG.map(s => ({
      id: `scn_${s.mode}`,
      name: s.name,
      kind: 'GENERATOR',
      mode: s.mode,
      sub: s.cat,
      tags: ['generator', 'pixels', s.kind, s.cat.toLowerCase(), s.name.toLowerCase()],
      gradient:
        s.kind === 'three'
          ? 'linear-gradient(135deg, #00DAF3, #6B0099)'
          : s.cat.includes('Energy') || s.cat.includes('Spiral')
          ? 'linear-gradient(135deg, #701a75, #db2777)'
          : s.cat.includes('Space') || s.cat.includes('3D')
          ? 'linear-gradient(135deg, #0f172a, #334155)'
          : 'linear-gradient(135deg, #1e1b4b, #4338ca)',
    }));

    // 2. Plajah Pixels Shaders (SHADER_LIBRARY)
    const shaderItems: AmboMediaSourceItem[] = SHADER_LIBRARY.map((s, idx) => ({
      id: `sh_${idx}_${s.name.replace(/\s+/g, '_')}`,
      name: s.name,
      // Library shaders are Shadertoy sources, not generator modes — they render
      // through ShaderSource. `mode` mirrors src so cue/live highlighting matches.
      kind: 'SHADER',
      src: s.src,
      mode: s.src,
      sub: `${s.setTitle || s.cat || 'Shader'}${s.series ? ` · Series ${s.series}` : ''}`,
      tags: [
        'shader',
        s.kind || 'glsl',
        (s.cat || '').toLowerCase(),
        s.series ? `series${s.series.toLowerCase()}` : '',
        s.series === 'VI' ? 'flux' : '',
        s.series === 'VII' ? 'series7' : '',
        s.name.toLowerCase(),
      ].filter(Boolean),
      gradient:
        s.series === 'VI'
          ? 'linear-gradient(135deg, #FF8C00, #D40055)'
          : s.series === 'VII'
          ? 'linear-gradient(135deg, #D0BCFF, #6B0099)'
          : 'linear-gradient(135deg, #0d9488, #111827)',
    }));

    // 3. Milkdrop Presets (Butterchurn)
    const effectiveMilkdropNames = milkdropNames.length > 0 ? milkdropNames : [
      'Flexi, martin + geiss - dedicated to the sherwin brothers',
      'Geiss - Artifact',
      'Rovastar - Explosive Fireworks',
      'Martin - city lights',
      'Flexi - alien machine',
      'Geiss - Tokamak fallout',
      'Unchained - God of the Mind',
      'Adam FX - Geiss Nebula 3',
      'Flexi - complex brain waves',
      'Zylot - Light of the Sea',
      'Eo.S. - galactic breath',
      'CTho - Rainbow Spiral',
    ];
    const milkPresets: AmboMediaSourceItem[] = effectiveMilkdropNames.slice(0, 160).map((name, i) => ({
      id: `milk_${i}`,
      name: name.length > 36 ? name.slice(0, 34) + '…' : name,
      kind: 'GENERATOR',
      mode: `${MILKDROP_PREFIX}${name}`,
      sub: 'Milkdrop Preset',
      tags: ['milkdrop', 'butterchurn', name.toLowerCase()],
      gradient: 'linear-gradient(135deg, #120a1f, #2e1065)',
    }));

    const baseItems: AmboMediaSourceItem[] = GENERATOR_ITEMS.map(g => ({
      id: g.id,
      name: g.name,
      kind: 'GENERATOR',
      mode: g.content.kind === 'GENERATOR' ? g.content.mode : 'STUDIO_AURORA',
      sub: g.category,
      tags: g.tags,
      gradient:
        g.category === 'Atmosphere'
          ? 'linear-gradient(135deg, #1e1b4b, #4338ca)'
          : g.category === 'Energy'
          ? 'linear-gradient(135deg, #701a75, #db2777)'
          : g.category === 'Graphic'
          ? 'linear-gradient(135deg, #0f172a, #334155)'
          : 'linear-gradient(135deg, #042f2e, #0d9488)',
    }));

    // (The hand-written FLUX_SERIES_VI / SERIES_VII_ART_DIRECTORS cards named modes
    // that exist nowhere in Pixels; the real Series VI / VII works arrive through
    // SHADER_LIBRARY above, tagged 'flux' / 'series7'.)
    const typoItems: AmboMediaSourceItem[] = TYPO_CATALOG.map(t => ({
      id: `typo_${t.key}`,
      name: `Typo · ${t.name}`,
      kind: 'GENERATOR',
      mode: `${TYPO_PREFIX}${t.key}`,
      sub: 'Kinetic typography · audio-reactive',
      tags: ['typo', 'typography', 'kinetic', 'text', t.name.toLowerCase()],
      gradient: 'linear-gradient(135deg, #111827, #D40055)',
    }));
    return [
      ...sceneItems,
      ...shaderItems,
      ...baseItems,
      ...typoItems,
      ...milkPresets,
    ];
  }, [milkdropNames]);
  const [hoverVizId, setHoverVizId] = useState<string | null>(null);

  // ── Combined Reello Videos List (Platform + User Uploads + Fallback) ──
  const activeReelloClips = useMemo(() => {
    const all = [...userVideos, ...platformVideos];
    const unique = new Map<string, Video>();
    for (const v of all) {
      if (!unique.has(v.id)) unique.set(v.id, v);
    }

    if (unique.size > 0) {
      return Array.from(unique.values()).map(v => {
        const isUser = v.ownerId === auth.currentUser?.uid;
        const isVertical = (v.tags || []).some(t => t.toLowerCase().includes('9:16') || t.toLowerCase().includes('reel'));
        const videoSrc = v.url || (v.muxPlaybackId ? `https://stream.mux.com/${v.muxPlaybackId}.m3u8` : '');
        const durationFmt = v.duration ? `${Math.floor(v.duration / 60)}:${String(Math.floor(v.duration % 60)).padStart(2, '0')}` : isVertical ? '0:45' : '1:30';
        return {
          id: v.id,
          name: v.title || 'Untitled Video',
          kind: 'VIDEO' as const,
          src: videoSrc,
          sub: `${v.artist || (isUser ? 'My Video' : 'Reello')} · ${durationFmt}`,
          tags: [
            'reello',
            isUser ? 'user' : 'platform',
            isVertical ? '9:16' : '16:9',
            ...(v.tags || []).map(t => t.toLowerCase()),
            (v.title || '').toLowerCase(),
          ],
          coverImage: v.thumbnailUrl || v.coverImageUrl,
          ratio: isVertical ? '9:16' : '16:9',
          isUserVideo: isUser,
          author: v.artist || (isUser ? 'My Upload' : 'Plajah Creator'),
          duration: durationFmt,
          category: (v.tags || []).some(t => t.toLowerCase().includes('sermon'))
            ? 'Sermon Cuts'
            : isVertical
            ? 'Social 9:16'
            : (v.tags || []).some(t => t.toLowerCase().includes('announcement'))
            ? 'Announcements'
            : 'All Clips',
        };
      });
    }

    return REELLO_CLIPS.map(r => ({
      id: r.id,
      name: r.title,
      kind: 'VIDEO' as const,
      src: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
      sub: `${r.ratio} · ${r.duration}`,
      tags: ['reello', r.ratio, r.category.toLowerCase(), r.isUserVideo ? 'user' : 'platform'],
      coverImage: undefined,
      ratio: r.ratio,
      isUserVideo: r.isUserVideo,
      author: r.author,
      duration: r.duration,
      category: r.category,
    }));
  }, [platformVideos, userVideos]);

  // ── Combined Taleo Media List (Platform Series, Films & Docuseries) ──
  const activeTaleoSeries = useMemo(() => {
    if (taleoReleases.length > 0) {
      return taleoReleases.map(alb => {
        const epCount = (alb.tracks?.length || 0) + (alb.musicVideos?.length || 0);
        const isMovie = alb.subType === 'MOVIE' || Boolean(alb.movieMetadata);
        const seasonLabel = isMovie ? 'Feature Film' : alb.seasons?.length ? `${alb.seasons.length} Seasons` : 'Vol. 1';
        const durationLabel = alb.movieMetadata?.runtime ? `${alb.movieMetadata.runtime}m` : epCount ? `${epCount} eps` : 'Feature';
        const videoSrc = alb.customVideoUrl || alb.tracks?.[0]?.url || (alb.musicVideos?.[0] as any)?.url || '';
        return {
          id: alb.id,
          title: alb.title,
          coverImage: alb.coverImage,
          category: alb.genre || (isMovie ? 'Narrative Films' : 'Documentaries'),
          episodes: epCount || 1,
          season: seasonLabel,
          duration: durationLabel,
          videoSrc,
          artist: alb.artist,
          description: alb.description,
        };
      });
    }

    return TALEO_SERIES.map(t => ({
      ...t,
      coverImage: undefined,
      videoSrc: 'https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4',
      artist: 'Taleo Original',
      description: 'Platform narrative production',
    }));
  }, [taleoReleases]);

  const ndiMediaSources: AmboMediaSourceItem[] = useMemo(() => {
    return (nativeSources || [])
      .filter(s => s && (s.kind === 'ndi' || (s.label && s.label.toLowerCase().includes('ndi')) || (s.streamName && s.streamName.toLowerCase().includes('ndi'))))
      .map(s => ({
        id: s.id,
        name: s.streamName || s.label || 'NDI Source',
        kind: 'LIVE',
        inputId: s.id,
        sub: s.machineName || 'NDI Network Stream',
        tags: ['ndi', 'live'],
      }));
  }, [nativeSources]);

  // Live Feeds tab (moved here from the old side media bin): the switcher and
  // capture inputs Ambo always offers, plus every native/NDI source found.
  const liveFeedItems: AmboMediaSourceItem[] = useMemo(() => {
    const core: AmboMediaSourceItem[] = [
      { id: 'switcher:pgm', name: 'Switcher PGM', kind: 'LIVE', inputId: 'switcher:pgm', sub: 'Broadcast program bus', tags: ['switcher'] },
      { id: 'switcher:aux1', name: 'Switcher AUX 1', kind: 'LIVE', inputId: 'switcher:aux1', sub: 'Camera aux', tags: ['switcher'] },
      { id: 'decklink_input1', name: 'DeckLink SDI', kind: 'LIVE', inputId: 'decklink_input1', sub: '1080p59.94 SDI', tags: ['sdi'] },
    ];
    const seen = new Set(core.map(c => c.id));
    const native: AmboMediaSourceItem[] = (nativeSources || [])
      .filter(s => s && !seen.has(s.id))
      .map(s => ({
        id: s.id,
        name: s.streamName || s.label || 'Live source',
        kind: 'LIVE' as const,
        inputId: s.id,
        sub: s.machineName || (s.kind === 'ndi' ? 'NDI network stream' : s.kind === 'srt' ? (s.status || 'SRT endpoint') : String(s.kind || 'Capture input')),
        tags: [String(s.kind || 'live')],
        online: s.online,
      }));
    return [...core, ...native];
  }, [nativeSources]);

  // Combined Media Tab files
  const activeMediaItems: AmboMediaSourceItem[] = useMemo(() => {
    const allPhotos = platformPhotos.length > 0 ? platformPhotos : PLAJAH_PHOTOS;
    let items = [...DEFAULT_MEDIA_FILES, ...allPhotos, ...customFolderFiles, ...ndiMediaSources];

    if (selectedSubcat === 'Pinned Folders' || selectedSubcat === 'All Folders') {
      const activeFolder = pinnedFolders.find(f => f.id === activeFolderId);
      if (realFolderFiles.length > 0 || activeFolder?.kind) {
        items = realFolderFiles; // a custom folder shows exactly what is on disk, even when empty
      } else if (activeFolder) {
        items = items.filter(it => it.tags?.some(t => t.toLowerCase().includes(activeFolder.name.toLowerCase())) || it.sub?.includes(activeFolder.name));
      }
    } else if (selectedSubcat === 'Personal Photos') {
      items = allPhotos.filter(p => p.tags?.includes('personal'));
    } else if (selectedSubcat === 'Organization Photos') {
      items = allPhotos.filter(p => p.tags?.includes('organization') || p.tags?.includes('sanctuary'));
    } else if (selectedSubcat === 'Flora Stills') {
      items = allPhotos.filter(p => p.tags?.includes('flora'));
    } else if (selectedSubcat === 'Motion Backgrounds') {
      items = DEFAULT_MEDIA_FILES.filter(m => m.kind === 'VIDEO');
    } else if (selectedSubcat === 'NDI Network') {
      items = ndiMediaSources;
    }

    if (debouncedSearch.trim() && activeTab === 'media') {
      const q = debouncedSearch.toLowerCase().trim();
      items = items.filter(it => it.name.toLowerCase().includes(q) || it.sub?.toLowerCase().includes(q));
    }

    return items;
  }, [selectedSubcat, activeFolderId, realFolderFiles, platformPhotos, customFolderFiles, ndiMediaSources, debouncedSearch, activeTab, pinnedFolders]);

  // Drag-and-drop helper
  const handleDragStart = (e: React.DragEvent, item: AmboMediaSourceItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ambo-source', source: item }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const activeFolderCustom = selectedSubcat === 'Pinned Folders' ? pinnedFolders.find(f => f.id === activeFolderId && f.kind) : undefined;
  const activeFolderStatus = selectedSubcat === 'Pinned Folders' ? folderStatus[activeFolderId] : undefined;

  // 8 Tabs configuration
  const tabs = [
    { id: 'shows', label: 'Shows', icon: <Layers size={13} />, count: shows.length || 3 },
    { id: 'media', label: 'Media', icon: <Film size={13} />, count: activeMediaItems.length },
    { id: 'scripture', label: 'Scripture', icon: <BookOpen size={13} />, count: 66, highlight: true },
    { id: 'chora', label: 'Chora', icon: <Music size={13} />, count: CHORA_TRACKS.length + CHORA_PADS.length },
    { id: 'reello', label: 'Reello', icon: <Video size={13} />, count: activeReelloClips.length },
    { id: 'taleo', label: 'Taleo', icon: <Film size={13} />, count: activeTaleoSeries.length },
    { id: 'visualizers', label: 'Visualizers', icon: <Sparkles size={13} />, count: visualizerItems.length },
    { id: 'assets', label: 'Assets', icon: <FileText size={13} />, count: FABULA_LOTTIE_PRESETS.length + FABULA_TRANSITIONS.length },
    { id: 'live', label: 'Live Feeds', icon: <Radio size={13} />, count: liveFeedItems.length },
    { id: 'routines', label: 'Routines', icon: <Clock size={13} /> },
  ] as const;

  if (isCollapsed) {
    return (
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-t select-none transition-colors ${className}`}
        style={{ borderColor: line, background: 'rgba(9,6,15,0.98)' }}
      >
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70 hover:text-white transition-colors"
              title="Expand Tabbed Media Library"
            >
              <ChevronUp size={14} className="text-[#00DAF3]" />
              <span className="tracking-wide">MEDIA LIBRARY</span>
            </button>
          )}
          <div className="h-3 w-[1px] bg-white/20 mx-1" />
          <span className="text-[10px] text-white/40">
            Active: <span className="text-white capitalize font-semibold">{activeTab}</span>
          </span>
          {isScriptureLive && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#E3C57E]/20 text-[#E3C57E]">
              Scripture Live (Click transitions)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="px-2 py-0.5 rounded text-[10px] font-medium text-white/60 hover:text-white hover:bg-white/10"
            >
              Open Dock
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full select-none overflow-hidden ${className}`}
      style={{ background: 'rgba(9,6,15,0.98)', borderColor: line }}
    >
      {/* ── Top Tabs Bar across the bottom dock ── */}
      <div
        className="grid items-center gap-3 px-3 border-b flex-none"
        style={{ borderColor: line, background: 'rgba(15,10,24,0.95)', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}
      >
        <div className="flex items-center gap-1 overflow-x-auto py-1 min-w-0">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSelectTab(tab.id);
                  setSelectedSubcat('all');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex-none border ${
                  isActive
                    ? 'text-white border-white/20 shadow-sm'
                    : 'text-white/60 hover:text-white/90 border-transparent hover:bg-white/5'
                }`}
                style={{
                  background: isActive ? (tab.id === 'scripture' ? 'rgba(227,197,126,0.18)' : 'rgba(255,255,255,0.1)') : 'transparent',
                  color: isActive ? (tab.id === 'scripture' ? GOLD : '#fff') : undefined,
                  borderColor: isActive ? (tab.id === 'scripture' ? 'rgba(227,197,126,0.4)' : 'rgba(255,255,255,0.18)') : 'transparent',
                }}
              >
                <span style={{ color: isActive ? (tab.id === 'scripture' ? GOLD : CYAN) : undefined }}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className="font-mono text-[9px] px-1 py-0.2 rounded-full"
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global Search Bar — centred in the header */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && activeTab === 'scripture') {
                  handleScriptureSearchSubmit(searchQuery);
                }
              }}
              placeholder={activeTab === 'scripture' ? 'Search John 3:16 or verse...' : `Search ${activeTab}...`}
              className="pl-7 pr-7 py-1 w-56 lg:w-80 text-[11px] rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/30 focus:border-[#00DAF3] focus:outline-hidden transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Look picker, live badge and collapse — right side */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          {activeTab === 'scripture' && <AmboScriptureLook />}
          {activeTab === 'scripture' && isScriptureLive && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[#E3C57E]/20 text-[#E3C57E] border border-[#E3C57E]/40 flex items-center gap-1 flex-none">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E3C57E] animate-pulse" />
              <span>LIVE: Single-click transitions</span>
            </span>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Collapse Dock"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── 2-Column Body (FreeShow Style: Subcategories on left, items/content on right) ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* TAB 1: SCRIPTURE (Lectio-Powered 66-Book Browser & Chapter Context Reader) */}
        {/* ========================================================================= */}
        {activeTab === 'scripture' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left: Books column + Chapters column */}
            <div className="flex flex-none min-h-0">
            {/* Books: Testament + 66 Books */}
            <div
              className="w-52 border-r flex flex-col flex-none min-h-0"
              style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}
            >
              {/* Testament Selector */}
              <div className="flex items-center gap-1 p-2 border-b" style={{ borderColor: line }}>
                {(['ALL', 'OT', 'NT'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setScriptureTestament(t)}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                      scriptureTestament === t
                        ? 'bg-[#E3C57E] text-[#1a1405]'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {t === 'ALL' ? '66 Books' : t === 'OT' ? 'Old Test (39)' : 'New Test (27)'}
                  </button>
                ))}
              </div>

              {/* Book List */}
              <div className="flex-1 overflow-y-auto min-h-0 p-1.5 divide-y divide-white/5">
                {filteredBooks.map(b => {
                  const isSel = b.num === selectedBookNum;
                  return (
                    <button
                      key={b.num}
                      onClick={() => {
                        setSelectedBookNum(b.num);
                        setSelectedChapter(1);
                        setHighlightVerseNum(null);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11px] font-medium transition-all ${
                        isSel
                          ? 'bg-[#E3C57E]/20 text-[#E3C57E] font-bold border border-[#E3C57E]/30'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono text-[9px] text-white/30 w-4">{b.num}</span>
                        <span className="truncate">{b.name}</span>
                      </div>
                      <span className="font-mono text-[9px] text-white/30 px-1 rounded bg-white/5">
                        {b.chapters} ch
                      </span>
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Chapters: every chapter of the book in a box of big buttons — nothing rolls off the edge */}
            <div
              ref={chapterColRef}
              className="w-60 border-r flex flex-col flex-none min-h-0"
              style={{ borderColor: line, background: 'rgba(0,0,0,0.3)' }}
            >
              <div className="px-2.5 py-1.5 border-b flex-none flex items-center gap-2" style={{ borderColor: line }}>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[11px] font-extrabold text-white truncate">{activeBook.name}</div>
                  <div className="text-[9.5px] text-white/50">{activeBook.chapters} chapter{activeBook.chapters === 1 ? '' : 's'} · <span className="text-[#E3C57E] font-mono font-bold">Ch {selectedChapter}</span></div>
                </div>
                <button
                  onClick={openChapterPopup}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold flex-none"
                  style={{ background: 'rgba(227,197,126,0.14)', color: '#E3C57E', border: '1px solid rgba(227,197,126,0.35)' }}
                  title={`See all ${activeBook.chapters} chapters of ${activeBook.name} at once`}
                >
                  <Maximize2 size={10} /> All
                </button>
              </div>
              <div
                ref={chapterGridRef}
                role="listbox"
                aria-label={`${activeBook.name} chapters`}
                className="flex-1 min-h-0 overflow-y-auto p-2 grid grid-cols-6 gap-1 content-start custom-scrollbar"
              >
                {Array.from({ length: activeBook.chapters }, (_, i) => i + 1).map(ch => (
                  <button
                    key={ch}
                    data-ch={ch}
                    role="option"
                    aria-selected={selectedChapter === ch}
                    onClick={() => {
                      setSelectedChapter(ch);
                      setHighlightVerseNum(null);
                    }}
                    className={`h-8 rounded-md flex items-center justify-center font-mono text-[12px] font-bold transition-all ${
                      selectedChapter === ch
                        ? 'bg-[#E3C57E] text-[#1a1405] shadow-[0_0_10px_rgba(227,197,126,0.35)]'
                        : 'bg-white/5 text-white/75 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            </div>

            {/* "All chapters" popup — the whole book, big buttons */}
            {chapterPopup && typeof document !== 'undefined' && createPortal(
              <div
                ref={chapterPopRef}
                role="dialog"
                aria-label={`All ${activeBook.name} chapters`}
                className="fixed z-[230] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
                style={{ left: chapterPopup.left, bottom: chapterPopup.bottom, width: 560, maxHeight: chapterPopup.maxH, background: 'rgba(14,10,22,0.98)', borderColor: 'rgba(227,197,126,0.4)', boxShadow: '0 24px 70px rgba(0,0,0,0.65)', backdropFilter: 'blur(14px)' }}
              >
                <div className="px-4 py-2.5 border-b flex items-center gap-2 flex-none" style={{ borderColor: line }}>
                  <span className="text-[13px] font-extrabold text-[#E3C57E]">{activeBook.name}</span>
                  <span className="text-[10.5px] text-white/50">{activeBook.chapters} chapter{activeBook.chapters === 1 ? '' : 's'}</span>
                  <div className="flex-1" />
                  <button onClick={() => setChapterPopup(null)} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-lg text-white/55 hover:text-white hover:bg-white/10"><X size={14} /></button>
                </div>
                <div className="p-3 overflow-y-auto grid grid-cols-12 gap-1.5 content-start custom-scrollbar">
                  {Array.from({ length: activeBook.chapters }, (_, i) => i + 1).map(ch => (
                    <button
                      key={ch}
                      data-popch={ch}
                      onClick={() => { setSelectedChapter(ch); setHighlightVerseNum(null); setChapterPopup(null); }}
                      className={`h-9 rounded-lg flex items-center justify-center font-mono text-[13px] font-bold transition-all ${
                        selectedChapter === ch ? 'bg-[#E3C57E] text-[#1a1405] shadow-[0_0_12px_rgba(227,197,126,0.4)]' : 'bg-white/6 text-white/80 hover:bg-white/15 hover:text-white'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>,
              document.body,
            )}

            {/* Right Column: Verses in Chapter Context */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Context Header & Controls */}
              <div
                className="flex items-center justify-between px-4 py-2 border-b flex-none"
                style={{ borderColor: line, background: 'rgba(227,197,126,0.04)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-extrabold text-[#E3C57E]">
                      {activeBook.name} {selectedChapter}
                    </span>
                    {highlightVerseNum && (
                      <span className="px-1.5 py-0.5 rounded bg-[#E3C57E]/20 text-[#E3C57E] font-mono text-[10px] font-bold">
                        Verse {highlightVerseNum}
                      </span>
                    )}
                  </div>

                  {/* Translation Selector */}
                  <select
                    value={translationSlug}
                    onChange={e => setTranslationSlug(e.target.value)}
                    className="bg-black/50 border border-white/15 rounded-md px-2 py-0.5 text-[10px] text-white font-medium focus:outline-hidden focus:border-[#E3C57E]"
                  >
                    {TRANSLATIONS.map(t => (
                      <option key={t.slug} value={t.slug} className="bg-[#120a1f] text-white">
                        {t.label} ({t.slug.toUpperCase()})
                      </option>
                    ))}
                  </select>

                  {/* Active Transition Badge */}
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#00DAF3]/10 text-[#00DAF3] border border-[#00DAF3]/30">
                    Tx: {activeTransition} ({transitionDurationSec}s)
                  </span>
                </div>

                {/* Predetermined Scripture Views & Formatting */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: line, background: glass }}>
                    <button
                      onClick={() => setScriptureViewMode('single')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        scriptureViewMode === 'single' ? 'bg-[#E3C57E] text-[#1a1405]' : 'text-white/60'
                      }`}
                      title="1 Scripture Verse at a time"
                    >
                      1 Verse
                    </button>
                    <button
                      onClick={() => setScriptureViewMode('passage')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        scriptureViewMode === 'passage' ? 'bg-[#E3C57E] text-[#1a1405]' : 'text-white/60'
                      }`}
                      title="Passage / Full Reading"
                    >
                      Passage
                    </button>
                  </div>

                  <button
                    onClick={() => setAutoTextFit(v => !v)}
                    className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 ${
                      autoTextFit ? 'border-[#00DAF3]/50 bg-[#00DAF3]/10 text-[#00DAF3]' : 'border-white/10 text-white/40'
                    }`}
                    title="Auto Adjust Text Box Size Dynamically"
                  >
                    <Type size={11} />
                    <span>Auto-Fit</span>
                  </button>

                  <button
                    onClick={() => setReflowAroundObjects(v => !v)}
                    className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 ${
                      reflowAroundObjects ? 'border-[#E3C57E]/50 bg-[#E3C57E]/10 text-[#E3C57E]' : 'border-white/10 text-white/40'
                    }`}
                    title="Reflow Scripture Around Objects on Slide"
                  >
                    <MoveHorizontal size={11} />
                    <span>Reflow</span>
                  </button>

                  <select
                    value={referencePlacement}
                    onChange={e => setReferencePlacement(e.target.value as any)}
                    className="bg-black/50 border border-white/15 rounded-md px-1.5 py-0.5 text-[10px] text-white/80 focus:outline-hidden"
                    title="Scripture Reference Placement"
                  >
                    <option value="bottom">Ref: Footer</option>
                    <option value="top">Ref: Header</option>
                    <option value="badge">Ref: Badge</option>
                  </select>
                </div>
              </div>

              {/* Look + Auto-cue: change the scripture look any time; the next verse cues itself into Preview */}
              <div className="flex items-center gap-3 px-4 py-1.5 border-b flex-none flex-wrap" style={{ borderColor: line, background: 'rgba(255,255,255,0.02)' }}>
                <ScriptureQuickBar sample={(() => {
                  const hv = chapterVerses.find(v => v.verse === highlightVerseNum);
                  return hv ? { text: hv.text, reference: `${activeBook.name} ${selectedChapter}:${hv.verse}`, translation: translationSlug.toUpperCase() } : undefined;
                })()} />
                <span className="text-[10px] text-white/40 leading-snug flex-1 min-w-[180px]">
                  {autoCueOn
                    ? 'Take a verse and the next one is cued into Preview — one tap to follow the reading.'
                    : 'Auto-cue is off — cue verses yourself, or turn it on to preview the next verse automatically.'}
                </span>
              </div>

              {/* Verses List / Context View (Double click takes live; single click transitions when live) */}
              <div
                ref={verseListRef}
                className="flex-1 overflow-y-auto p-3 space-y-2 select-text"
                style={{ background: 'rgba(5,3,9,0.7)' }}
              >
                {loadingVerses ? (
                  <div className="flex items-center justify-center h-32 gap-2 text-white/50 text-[12px]">
                    <RefreshCw size={14} className="animate-spin text-[#E3C57E]" />
                    <span>Loading {activeBook.name} {selectedChapter}...</span>
                  </div>
                ) : chapterVerses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-white/40 text-[12px]">
                    <span>No verses available for this chapter offline.</span>
                  </div>
                ) : (
                  chapterVerses.map(v => {
                    const isHighlighted = v.verse === highlightVerseNum;
                    return (
                      <div
                        key={v.verse}
                        ref={el => {
                          if (el) verseItemRefs.current.set(v.verse, el);
                          else verseItemRefs.current.delete(v.verse);
                        }}
                        onClick={() => handleVerseClick(v)}
                        onDoubleClick={() => handleVerseDoubleClick(v)}
                        className={`group relative rounded-xl p-3 border transition-all cursor-pointer ${
                          isHighlighted
                            ? 'border-[#E3C57E] bg-[#E3C57E]/10 shadow-[0_0_20px_rgba(227,197,126,0.18)] ring-1 ring-[#E3C57E]/50'
                            : 'border-white/5 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]'
                        }`}
                        title={
                          isScriptureLive
                            ? 'Click to transition Program Out to this verse | Double-click to take live'
                            : 'Double-click to Take Live to Program Out | Click to preview'
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`font-mono text-[11px] font-extrabold px-1.5 py-0.5 rounded ${
                                  isHighlighted ? 'bg-[#E3C57E] text-[#1a1405]' : 'bg-white/10 text-white/70'
                                }`}
                              >
                                {v.verse}
                              </span>
                              <span className="text-[10px] font-mono text-white/40 uppercase">
                                {activeBook.name} {selectedChapter}:{v.verse}
                              </span>
                              {isHighlighted && (
                                <span className="text-[9px] font-bold text-[#E3C57E] uppercase tracking-wide">
                                  ● Target in Context
                                </span>
                              )}
                              {isScriptureLive && (liveScriptureRef ? refCovers(liveScriptureRef, v.verse) : isHighlighted) && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-[#FF8C00] text-[#1a1405] uppercase">
                                  LIVE ON PGM
                                </span>
                              )}
                              {refCovers(cuedScriptureRef, v.verse) && !refCovers(liveScriptureRef, v.verse) && (
                                <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-[#00DAF3] text-[#04222a] uppercase" title="Cued in Preview — TAKE sends it to Program">
                                  {autoCueOn && isScriptureLive ? 'NEXT · IN PREVIEW' : 'IN PREVIEW'}
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[13px] leading-relaxed select-text font-serif ${
                                isHighlighted ? 'text-amber-100 font-medium' : 'text-white/80'
                              }`}
                              style={{ fontFamily: 'Palatino Linotype, Palatino, Georgia, serif' }}
                            >
                              {v.text}
                            </p>
                          </div>

                          {/* Quick Action Buttons for this verse */}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity flex-none">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (onCueScripture) onCueScripture(buildScriptureCue(v));
                              }}
                              className="px-2 py-1 rounded text-[10px] font-bold text-[#00DAF3] bg-[#00DAF3]/10 hover:bg-[#00DAF3]/20 border border-[#00DAF3]/30 transition-all flex items-center gap-1"
                              title="Cue verse into Preview"
                            >
                              <Eye size={11} />
                              <span>Cue</span>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                fireVerse(v);
                              }}
                              className="px-2 py-1 rounded text-[10px] font-bold text-[#FF8C00] bg-[#FF8C00]/15 hover:bg-[#FF8C00]/25 border border-[#FF8C00]/40 transition-all flex items-center gap-1"
                              title="Take verse directly to Program Out"
                            >
                              <Play size={11} fill="#FF8C00" />
                              <span>Take</span>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleInsertScriptureAsSlide(v);
                              }}
                              className="px-2 py-1 rounded text-[10px] font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                              title="Insert as a slide in active presentation"
                            >
                              + Slide
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SHOWS (Presentations, Playlists, Service Plans) */}
        {/* ========================================================================= */}
        {activeTab === 'shows' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-56 border-r p-2 flex flex-col gap-1 flex-none" style={{ borderColor: line }}>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">
                Show Collections
              </div>
              {['All Shows', 'Sunday Services', 'Youth Night', 'Vespers', 'Midweek', 'Archival'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedSubcat(cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {/* Tela slide templates — opens the template gallery (inserts into the active show) */}
              <AmboSlideTemplateEntry onInsert={onInsertTemplateSlide} activeShowTitle={shows.find(sh => sh.id === activeShowId)?.title} />
            </div>
            <div className={`${SQUARE_GRID_CLASS} p-3`} style={squareGridStyle()}>
              {shows.map(show => {
                const isActive = show.id === activeShowId;
                return (
                  <div
                    key={show.id}
                    onClick={() => onSelectShow && onSelectShow(show.id)}
                    className={`rounded-xl overflow-hidden border cursor-pointer transition-all ${
                      isActive
                        ? 'border-[#00DAF3] bg-[#00DAF3]/10 shadow-[0_0_16px_rgba(0,218,243,0.15)]'
                        : 'border-white/10 hover:border-white/20 bg-white/5'
                    }`}
                  >
                    <SquareFrame className="bg-[#0c0914]">
                      <AmboShowStill show={show} />
                      <span className="absolute top-1 left-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-white/80">
                        {show.kind || 'PRESENTATION'}
                      </span>
                      {isActive && <span className="absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#00DAF3] text-[#04222a]">ACTIVE</span>}
                    </SquareFrame>
                    <div className="p-2 bg-black/60">
                      <div className="text-[12px] font-bold text-white truncate">{show.title}</div>
                      <div className="text-[10px] text-white/40">{show.slides?.length || 0} Slides</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: MEDIA (Local Folders, Pinned Folders, Photos, NDI Feeds) */}
        {/* ========================================================================= */}
        {activeTab === 'media' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Column: Folders & Hot-Switching Navigation */}
            <div className="w-60 border-r p-2 flex flex-col gap-1.5 flex-none min-h-0 overflow-y-auto" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
              <div className="flex items-center justify-between px-1 mb-0.5">
                <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40">Local & Pinned</span>
                <button
                  onClick={handleAddFolder}
                  className="font-mono text-[9px] text-[#00DAF3] hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#00DAF3]/10 border border-[#00DAF3]/20"
                  title="Add Folder from Local Computer..."
                >
                  <FolderPlus size={10} />
                  <span>Add Folder...</span>
                </button>
              </div>

              {/* Pinned Folders List with Hot-Switching */}
              <div className="space-y-1">
                {pinnedFolders.map(folder => {
                  const isSelected = selectedSubcat === 'Pinned Folders' && activeFolderId === folder.id;
                  return (
                    <div
                      key={folder.id}
                      onClick={() => {
                        setSelectedSubcat('Pinned Folders');
                        setActiveFolderId(folder.id);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-[#00DAF3]/15 text-[#00DAF3] font-bold border border-[#00DAF3]/30'
                          : 'text-white/70 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder size={13} className={isSelected ? 'text-[#00DAF3]' : 'text-white/40'} />
                        <span className="truncate">{folder.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-none">
                        {folderStatus[folder.id]?.state === 'needs-permission' && (
                          <span className="font-mono text-[8.5px] text-[#FF8C00]" title="Needs reconnecting">!</span>
                        )}
                        <span className="font-mono text-[9px] text-white/30">{folder.kind || folderStatus[folder.id]?.state === 'ok' ? folder.itemCount : '–'}</span>
                        {folder.kind && (
                          <>
                            <button
                              onClick={e => handleToggleImportTarget(folder, e)}
                              className={`p-0.5 transition-opacity hover:text-[#E3C57E] ${importTargetId === folder.id ? 'opacity-100 text-[#E3C57E]' : 'opacity-0 group-hover:opacity-100'}`}
                              title={importTargetId === folder.id ? 'Dropped files are copied into this folder (click to stop)' : 'Copy dropped files into this folder'}
                            >
                              <Pin size={10} />
                            </button>
                            <button onClick={e => handleRescanFolder(folder.id, e)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[#00DAF3] transition-opacity" title="Rescan folder">
                              <RefreshCw size={10} />
                            </button>
                            <button onClick={e => handleRenameFolder(folder.id, e)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-white transition-opacity" title="Rename">
                              <Type size={10} />
                            </button>
                          </>
                        )}
                        {!folder.isSystem && (
                          <button
                            onClick={e => handleRemoveFolder(folder.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-opacity"
                            title="Unpin folder"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="h-px bg-white/10 my-1.5" />

              {/* Subcategories & Photo Libraries */}
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 px-1 mb-0.5">
                Media Collections
              </div>
              {[
                { id: 'all', label: 'All Media Items' },
                { id: 'Personal Photos', label: 'Personal Photos' },
                { id: 'Organization Photos', label: 'Organization Photos' },
                { id: 'Flora Stills', label: 'Flora Nature Stills' },
                { id: 'Motion Backgrounds', label: 'Motion Backgrounds' },
                { id: 'NDI Network', label: 'NDI Network Video' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedSubcat(cat.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat.id ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              <div className="mt-auto pt-2 border-t border-white/10">
                <button
                  onClick={onScanNdi}
                  disabled={isScanningNdi}
                  className="w-full py-1.5 rounded-lg text-[10px] font-semibold text-[#00DAF3] bg-[#00DAF3]/10 hover:bg-[#00DAF3]/20 border border-[#00DAF3]/30 transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={11} className={isScanningNdi ? 'animate-spin' : ''} />
                  <span>Scan NDI on LAN</span>
                </button>
              </div>
            </div>

            {/* Right Column: Media Grid with Drag & Double-click Take */}
            <div
              className="flex-1 p-3 overflow-y-auto"
              onDragOver={e => { if (activeFolderCustom && e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
              onDrop={async e => {
                if (!activeFolderCustom || !e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                const files = await filesFromDataTransfer(e.dataTransfer);
                void handleImportIntoFolder(activeFolderCustom, files);
              }}
            >
              {folderNotice && (
                <div className="mb-2 px-3 py-2 rounded-lg text-[11px] flex items-start gap-2 border border-[#FF8C00]/30 bg-[#FF8C00]/10 text-[#FFD9A0]">
                  <span className="flex-1">{folderNotice}</span>
                  <button onClick={() => setFolderNotice(null)} className="text-white/50 hover:text-white" title="Dismiss"><X size={11} /></button>
                </div>
              )}
              {activeFolderCustom && (
                <div className="mb-2 flex items-center gap-1.5 flex-wrap text-[10px]">
                  <span className="font-semibold text-white/70 truncate max-w-[40%]" title={activeFolderCustom.path}>{activeFolderCustom.name}</span>
                  <span className="text-white/35">{activeFolderCustom.itemCount} item{activeFolderCustom.itemCount === 1 ? '' : 's'}{folderStatus[activeFolderCustom.id]?.truncated ? ' (first batch — folder is larger)' : ''}</span>
                  <div className="flex-1" />
                  <label className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer" title="Copy files from your computer into this folder">
                    Import files...
                    <input type="file" multiple accept="image/*,video/*,audio/*,.lottie,.json" className="hidden"
                      onChange={e => { const fl = Array.from(e.target.files || []); e.target.value = ''; void handleImportIntoFolder(activeFolderCustom, fl); }} />
                  </label>
                  {activeFolderCustom.kind === 'handle' && (
                    <button onClick={() => handleNewSubfolder(activeFolderCustom)} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/80">New subfolder</button>
                  )}
                </div>
              )}
              {activeFolderStatus && (activeFolderStatus.state === 'needs-permission' || activeFolderStatus.state === 'error') && !isLoadingFolderFiles ? (
                <div className="h-full flex flex-col items-center justify-center text-white/50 gap-2 py-12 text-center px-6">
                  <Folder size={32} className={activeFolderStatus.state === 'error' ? 'text-red-400/60' : 'text-[#FF8C00]/70'} />
                  <span className="text-[12.5px] font-medium">{activeFolderStatus.state === 'needs-permission' ? 'Folder needs reconnecting' : 'Folder unavailable'}</span>
                  <span className="text-[11px] text-white/40 max-w-sm">{activeFolderStatus.message}</span>
                  {activeFolderStatus.state === 'needs-permission' && activeFolderCustom && (
                    <button onClick={() => handleReconnectFolder(activeFolderCustom.id)} className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#00DAF3]/20 text-[#00DAF3] border border-[#00DAF3]/40 hover:bg-[#00DAF3]/30">Reconnect</button>
                  )}
                </div>
              ) : isLoadingFolderFiles ? (
                <div className="h-full flex flex-col items-center justify-center text-white/40 gap-2 py-12">
                  <RefreshCw size={24} className="animate-spin text-[#00DAF3]" />
                  <span className="text-[12px]">Scanning disk folder...</span>
                </div>
              ) : activeMediaItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/40 gap-2 py-12">
                  <Folder size={32} className="text-white/20" />
                  <span className="text-[12.5px] font-medium">No media files in this folder</span>
                  <span className="text-[11px] text-white/30">Drop desktop video, audio, or image files or add a new folder</span>
                </div>
              ) : (
                <div style={squareGridStyle()}>
                  {activeMediaItems.slice(0, renderLimit).map(item => {
                    const isLive = currentLiveInputId === item.id || currentLiveInputId === item.mode || currentLiveInputId === item.inputId;
                    const isPrev = currentPreviewInputId === item.id || currentPreviewInputId === item.inputId;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={e => handleDragStart(e, item)}
                        onClick={() => onPreviewSource(item)}
                        onDoubleClick={() => onProgramSource(item)}
                        className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                          isLive
                            ? 'border-[#FF8C00] shadow-[0_0_18px_rgba(255,140,0,0.3)] ring-1 ring-[#FF8C00]'
                            : isPrev
                            ? 'border-[#00DAF3] shadow-[0_0_14px_rgba(0,218,243,0.2)]'
                            : 'border-white/10 hover:border-white/30 hover:shadow-lg'
                        }`}
                        title="Click to preview | Double-click to take live | Drag onto slide"
                      >
                        <SquareFrame className="bg-[#120a1f]" style={item.gradient ? { background: item.gradient } : undefined}>
                          <AmboPoster
                            label={item.name}
                            cover={item.thumb || (item.kind === 'IMAGE' ? item.src : undefined)}
                            videoSrc={item.kind === 'VIDEO' ? item.src : undefined}
                            gradient={item.gradient}
                            kind={item.kind === 'VIDEO' ? 'video' : item.kind === 'IMAGE' ? 'image' : item.kind === 'AUDIO' ? 'audio' : 'other'}
                          />

                          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 font-mono text-[8.5px] text-white/90 backdrop-blur-sm">
                            {item.kind}
                          </div>
                          {isLive && (
                            <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-[#FF8C00] font-mono text-[8.5px] font-bold text-[#1a1405]">
                              LIVE
                            </div>
                          )}
                          {!isLive && isPrev && (
                            <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-[#00DAF3] font-mono text-[8.5px] font-bold text-[#04222a]">
                              PREVIEW
                            </div>
                          )}

                          {/* Quick Hover Actions Bar */}
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 px-2">
                            {onInsertMediaSlide && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onInsertMediaSlide(item);
                                }}
                                className="px-2 py-1 rounded-md text-[10px] font-bold bg-white/20 hover:bg-white/30 text-white flex items-center gap-1 transition-all"
                                title="Add as new presentation slide"
                              >
                                <Plus size={11} />
                                <span>Slide</span>
                              </button>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onPreviewSource(item);
                              }}
                              className="px-2 py-1 rounded-md text-[10px] font-bold bg-[#00DAF3]/30 hover:bg-[#00DAF3]/50 text-[#00DAF3] flex items-center gap-1 transition-all"
                              title="Preview"
                            >
                              <Eye size={11} />
                              <span>Prev</span>
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onProgramSource(item);
                              }}
                              className="px-2 py-1 rounded-md text-[10px] font-bold bg-[#FF8C00] hover:bg-[#ff9d26] text-[#1a1405] flex items-center gap-1 transition-all"
                              title="Take to Program Out"
                            >
                              <Play size={11} />
                              <span>Take</span>
                            </button>
                          </div>
                        </SquareFrame>
                        <div className="p-2 bg-black/75">
                          <div className="text-[11px] font-semibold text-white truncate" title={item.name}>{item.name}</div>
                          <div className="text-[9px] text-white/40 truncate">{item.sub || item.kind}</div>
                        </div>
                      </div>
                    );
                  })}
                  {activeMediaItems.length > renderLimit && (
                    <button onClick={() => setRenderLimit(r => r + 50)} className="col-span-full py-2 text-center text-xs text-white/50 hover:text-white">
                      Show more ({activeMediaItems.length - renderLimit} remaining)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: CHORA (All Artists, Albums, Personal Music Locker, Playlists & DJ) */}
        {/* ========================================================================= */}
        {activeTab === 'chora' && (
          <AmboChoraAudioPanel
            choraPublicTracks={choraPublicTracks}
            personalLockerTracks={personalLockerTracks}
            audiusTrending={audiusTrending}
            choraPublicAlbums={choraPublicAlbums}
            isLoadingChora={isLoadingChora}
            audioPlaylists={audioPlaylists}
            onUpdatePlaylist={handleUpdateAudioPlaylist}
            onDeletePlaylist={handleDeleteAudioPlaylist}
            onOpenNewPlaylist={() => setIsNewAudioPlaylistModalOpen(true)}
            selectedSubcat={selectedSubcat}
            setSelectedSubcat={setSelectedSubcat}
            selectedPlaylistId={selectedPlaylistId}
            setSelectedPlaylistId={setSelectedPlaylistId}
            expandedAlbumId={expandedAlbumId}
            setExpandedAlbumId={setExpandedAlbumId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            debouncedSearch={debouncedSearch}
            onPlayAudioTrack={onPlayAudioTrack}
            onCueAudioTrack={onCueAudioTrack}
            onTakeAudioTrack={onTakeAudioTrack}
            onInsertAudioSlide={onInsertAudioSlide}
            currentPlayingAudioId={currentPlayingAudioId}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 5: REELLO (User Videos, Platform Video Search, Social 9:16 Cuts) */}
        {/* ========================================================================= */}
        {activeTab === 'reello' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-56 border-r p-2 flex flex-col gap-1 flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Reello Feeds</div>
              {['All Clips', 'My Videos', 'Sermon Cuts', 'Social 9:16', 'Announcements', 'Testimonies', 'B-Roll'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedSubcat(cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className={`${SQUARE_GRID_CLASS} p-3`} style={squareGridStyle()}>
              {activeReelloClips
                .filter(r => {
                  if (debouncedSearch.trim() && activeTab === 'reello') {
                    const q = debouncedSearch.toLowerCase().trim();
                    const match = r.name.toLowerCase().includes(q) || r.author.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q);
                    if (!match) return false;
                  }
                  if (selectedSubcat === 'My Videos') return r.isUserVideo;
                  if (selectedSubcat !== 'all' && selectedSubcat !== 'All Clips') {
                    return r.category === selectedSubcat || r.tags?.includes(selectedSubcat.toLowerCase());
                  }
                  return true;
                })
                .map(r => {
                  const item: AmboMediaSourceItem = {
                    id: r.id,
                    name: r.name,
                    kind: 'VIDEO',
                    src: r.src,
                    sub: `${r.ratio} · ${r.duration}`,
                    tags: r.tags,
                    coverImage: r.coverImage,
                  };
                  return (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={e => handleDragStart(e, item)}
                      onClick={() => onPreviewSource(item)}
                      onDoubleClick={() => onProgramSource(item)}
                      className="rounded-xl border border-white/10 hover:border-white/30 overflow-hidden bg-black/40 cursor-grab group transition-all flex flex-col relative"
                    >
                      <SquareFrame style={{ background: 'linear-gradient(135deg,#1f1338,#0a0814)' }}>
                        <AmboPoster label={r.name} cover={r.coverImage} videoSrc={r.src} kind="video" gradient="linear-gradient(135deg,#1f1338,#0a0814)" />
                        <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/70 backdrop-blur-sm text-[8px] font-mono text-[#00DAF3] z-10">
                          {r.ratio}
                        </span>
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/70 backdrop-blur-sm text-[8px] font-mono text-white/80 z-10">
                          {r.duration}
                        </span>

                        {/* Quick Action Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity z-20">
                          {onInsertMediaSlide && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onInsertMediaSlide(item);
                              }}
                              className="px-2 py-1 rounded bg-white/20 hover:bg-white/40 text-[10px] font-bold text-white transition-colors"
                              title="Insert as presentation slide"
                            >
                              + Slide
                            </button>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onPreviewSource(item);
                            }}
                            className="px-2 py-1 rounded bg-[#00DAF3]/80 hover:bg-[#00DAF3] text-[10px] font-bold text-black transition-colors"
                            title="Cue in Preview"
                          >
                            Preview
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onProgramSource(item);
                            }}
                            className="px-2 py-1 rounded bg-[#FF8C00]/90 hover:bg-[#FF8C00] text-[10px] font-bold text-black transition-colors"
                            title="Take to Program Out"
                          >
                            Take
                          </button>
                        </div>
                      </SquareFrame>
                      <div className="p-2 flex-1 flex flex-col justify-between">
                        <div className="text-[11px] font-semibold text-white truncate" title={r.name}>{r.name}</div>
                        <div className="text-[9px] text-white/40 truncate">{r.author}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: TALEO (Narrative Films, Documentaries, Episodic Media) */}
        {/* ========================================================================= */}
        {activeTab === 'taleo' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-56 border-r p-2 flex flex-col gap-1 flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Taleo Releases</div>
              {['All Series', 'Narrative Films', 'Documentaries', 'Kids & Family'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedSubcat(cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className={`${SQUARE_GRID_CLASS} p-3`} style={squareGridStyle()}>
              {activeTaleoSeries
                .filter(t => {
                  if (debouncedSearch.trim() && activeTab === 'taleo') {
                    const q = debouncedSearch.toLowerCase().trim();
                    const match = t.title.toLowerCase().includes(q) || (t.artist && t.artist.toLowerCase().includes(q));
                    if (!match) return false;
                  }
                  if (selectedSubcat !== 'all' && selectedSubcat !== 'All Series') {
                    return t.category === selectedSubcat;
                  }
                  return true;
                })
                .map(t => {
                  const item: AmboMediaSourceItem = {
                    id: t.id,
                    name: t.title,
                    kind: 'VIDEO',
                    src: t.videoSrc,
                    sub: `${t.season} · ${t.duration}`,
                    tags: ['taleo', t.category.toLowerCase()],
                    coverImage: t.coverImage,
                  };
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={e => handleDragStart(e, item)}
                      onClick={() => onPreviewSource(item)}
                      onDoubleClick={() => onProgramSource(item)}
                      className="rounded-xl border border-white/10 hover:border-white/30 overflow-hidden bg-black/40 cursor-grab group transition-all relative flex flex-col"
                    >
                      <SquareFrame style={{ background: 'linear-gradient(135deg,#360924,#0c0612)' }}>
                        <AmboPoster label={t.title} cover={t.coverImage} videoSrc={t.videoSrc} kind="video" gradient="linear-gradient(135deg,#360924,#0c0612)" />
                        <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/70 backdrop-blur-sm text-[8px] font-mono text-[#E3C57E] z-10">
                          {t.season}
                        </span>
                        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/70 backdrop-blur-sm text-[8px] font-mono text-white/80 z-10">
                          {t.duration}
                        </span>

                        {/* Quick Action Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity z-20">
                          {onInsertMediaSlide && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onInsertMediaSlide(item);
                              }}
                              className="px-2 py-1 rounded bg-white/20 hover:bg-white/40 text-[10px] font-bold text-white transition-colors"
                              title="Insert as presentation slide"
                            >
                              + Slide
                            </button>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onPreviewSource(item);
                            }}
                            className="px-2 py-1 rounded bg-[#00DAF3]/80 hover:bg-[#00DAF3] text-[10px] font-bold text-black transition-colors"
                            title="Cue in Preview"
                          >
                            Preview
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onProgramSource(item);
                            }}
                            className="px-2 py-1 rounded bg-[#FF8C00]/90 hover:bg-[#FF8C00] text-[10px] font-bold text-black transition-colors"
                            title="Take to Program Out"
                          >
                            Take
                          </button>
                        </div>
                      </SquareFrame>
                      <div className="p-2 flex-1 flex flex-col justify-between">
                        <div className="text-[12px] font-bold text-white truncate" title={t.title}>{t.title}</div>
                        <div className="text-[9px] text-white/40">{t.episodes} Episodes · {t.artist || 'Taleo Production'}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: VISUALIZERS (Flux Series VI, Series VII, GLSL, Butterchurn) */}
        {/* ========================================================================= */}
        {activeTab === 'visualizers' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-56 border-r p-2 flex flex-col gap-1 flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Visualizer Modes</div>
              {[
                'All Visualizers',
                'Plajah Pixels Generators',
                'Flux Series VI',
                'Series VII (ADC)',
                'GLSL Shaders',
                'Milkdrop Presets',
                'Atmosphere',
                'Energy',
                'Graphic'
              ].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedSubcat(cat)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className={`${SQUARE_GRID_CLASS} p-3`} style={squareGridStyle()}>
              {visualizerItems
                .filter(item => {
                  if (debouncedSearch.trim() && activeTab === 'visualizers') {
                    const q = debouncedSearch.toLowerCase().trim();
                    const match =
                      item.name.toLowerCase().includes(q) ||
                      (item.mode && item.mode.toLowerCase().includes(q)) ||
                      (item.sub && item.sub.toLowerCase().includes(q));
                    if (!match) return false;
                  }
                  if (selectedSubcat === 'Plajah Pixels Generators') return item.tags?.includes('generator') || item.tags?.includes('pixels');
                  if (selectedSubcat === 'Flux Series VI') return item.tags?.includes('flux');
                  if (selectedSubcat === 'Series VII (ADC)') return item.tags?.includes('series7');
                  if (selectedSubcat === 'GLSL Shaders') return item.tags?.includes('shader') || item.tags?.includes('glsl');
                  if (selectedSubcat === 'Milkdrop Presets') return item.tags?.includes('milkdrop');
                  if (selectedSubcat !== 'all' && selectedSubcat !== 'All Visualizers') return item.sub === selectedSubcat;
                  return true;
                })
                .map(item => {
                  const isLive = currentLiveInputId === item.mode;
                  const isPrev = currentPreviewInputId === item.mode;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={e => handleDragStart(e, item)}
                      onClick={() => onPreviewSource(item)}
                      onDoubleClick={() => onProgramSource(item)}
                      onMouseEnter={() => setHoverVizId(item.id)}
                      onMouseLeave={() => setHoverVizId(h => (h === item.id ? null : h))}
                      className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                        isLive
                          ? 'border-[#FF8C00] shadow-[0_0_18px_rgba(255,140,0,0.3)] ring-1 ring-[#FF8C00]'
                          : isPrev
                          ? 'border-[#00DAF3] shadow-[0_0_14px_rgba(0,218,243,0.2)]'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                      title="Single-click preview | Double-click take to Program Out"
                    >
                      <SquareFrame style={{ background: item.gradient || '#120a1f' }}>
                        <AmboVisualizerThumb item={item} hovered={hoverVizId === item.id} />
                        <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/60 font-mono text-[8px] text-white/80 max-w-[90%] truncate">
                          {item.sub || 'GLSL'}
                        </div>
                        {isLive && (
                          <div className="absolute top-1 right-1 px-1.5 py-0.2 rounded bg-[#FF8C00] font-mono text-[8px] font-bold text-[#1a1405]">
                            LIVE
                          </div>
                        )}
                        {!isLive && isPrev && (
                          <div className="absolute top-1 right-1 px-1.5 py-0.2 rounded bg-[#00DAF3] font-mono text-[8px] font-bold text-[#04222a]">
                            PREVIEW
                          </div>
                        )}

                        {/* Quick Action Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity z-20">
                          {onInsertMediaSlide && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onInsertMediaSlide(item);
                              }}
                              className="px-2 py-1 rounded bg-white/20 hover:bg-white/40 text-[10px] font-bold text-white transition-colors"
                              title="Insert as visualizer slide"
                            >
                              + Slide
                            </button>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onPreviewSource(item);
                            }}
                            className="px-2 py-1 rounded bg-[#00DAF3]/80 hover:bg-[#00DAF3] text-[10px] font-bold text-black transition-colors"
                            title="Cue in Preview"
                          >
                            Preview
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onProgramSource(item);
                            }}
                            className="px-2 py-1 rounded bg-[#FF8C00]/90 hover:bg-[#FF8C00] text-[10px] font-bold text-black transition-colors"
                            title="Take to Program Out"
                          >
                            Take
                          </button>
                        </div>
                      </SquareFrame>
                      <div className="p-2 bg-black/60">
                        <div className="text-[11px] font-semibold text-white truncate">{item.name}</div>
                        <div className="text-[9px] text-white/40 truncate">{item.kind === 'SHADER' || item.mode?.startsWith(MILKDROP_PREFIX) ? (item.kind === 'SHADER' ? 'GLSL shader' : 'Milkdrop') : item.mode}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: ASSETS (Fabula Lottie, Lower Thirds, Tela Docs, Transition Library) */}
        {/* ========================================================================= */}
        {activeTab === 'assets' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-60 border-r p-2 flex flex-col gap-1 flex-none" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1">Asset Libraries</div>
              {[
                { id: 'all', label: 'All Assets' },
                { id: 'Transitions', label: 'Fabula Transitions (16)' },
                { id: 'DotLottie Animations', label: '24 DotLottie Presets' },
                { id: 'Tela Lower Thirds', label: 'Tela Lower Thirds' },
                { id: 'Tela Documents', label: 'Tela Documents' },
                { id: 'Data Visualizers', label: 'Data Visualizers' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedSubcat(cat.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    selectedSubcat === cat.id ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              {/* Active Transition Selector in Sidebar */}
              <div className="mt-auto pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[9.5px] font-bold text-white/70">
                  <span>ACTIVE LIVE TRANSITION</span>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-[#00DAF3]/10 border border-[#00DAF3]/30 text-[#00DAF3] text-[11px] font-bold flex items-center justify-between">
                  <span>{activeTransition}</span>
                  <span className="font-mono text-[9px]">{transitionDurationSec}s</span>
                </div>
                {onChangeTransitionDuration && (
                  <div className="flex items-center gap-1.5 text-[9px] text-white/60">
                    <span>Duration:</span>
                    <input
                      type="range"
                      min={0.2}
                      max={3.0}
                      step={0.1}
                      value={transitionDurationSec}
                      onChange={e => onChangeTransitionDuration(Number(e.target.value))}
                      className="flex-1 accent-[#00DAF3] h-1"
                    />
                    <span className="font-mono">{transitionDurationSec}s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Asset Grid / Transitions Catalog */}
            <div className="flex-1 p-3 overflow-y-auto">
              {/* TRANSITIONS SECTION */}
              {(selectedSubcat === 'all' || selectedSubcat === 'Transitions') && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#00DAF3] flex items-center gap-1.5">
                      <Wand2 size={13} />
                      Fabula Video Transition Library (16 Native FX)
                    </span>
                    <span className="text-[9px] text-white/40">Click any transition to set as active live transition</span>
                  </div>
                  <div style={squareGridStyle(130, 10)}>
                    {FABULA_TRANSITIONS.map(tx => {
                      const isSelected = activeTransition === tx.name;
                      return (
                        <div
                          key={tx.id}
                          onClick={() => onSelectTransition && onSelectTransition(tx.name)}
                          className={`rounded-xl overflow-hidden border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#00DAF3] bg-[#00DAF3]/15 shadow-[0_0_16px_rgba(0,218,243,0.25)] ring-1 ring-[#00DAF3]'
                              : 'border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.05]'
                          }`}
                        >
                          <SquareFrame>
                            <AmboTransitionDemo id={tx.id} label={tx.name} active={isSelected} />
                            {isSelected && (
                              <span className="absolute top-1 right-1 text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-[#00DAF3] text-[#04222a] font-extrabold">ACTIVE</span>
                            )}
                          </SquareFrame>
                          <div className="p-2">
                            <div className="text-[12px] font-bold text-white truncate">{tx.name}</div>
                            <div className="text-[9.5px] text-white/50 truncate" title={tx.sub}>{tx.sub}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DOTLOTTIE ANIMATIONS SECTION */}
              {(selectedSubcat === 'all' || selectedSubcat === 'DotLottie Animations') && (
                <div className="mb-5">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#E3C57E] mb-2 flex items-center gap-1.5">
                    <Sparkles size={13} />
                    DotLottie Presets (24 Files in dist/fabula/lottie)
                  </div>
                  <div style={squareGridStyle(130, 10)}>
                    {FABULA_LOTTIE_PRESETS.map(lot => (
                      <div
                        key={lot.id}
                        onMouseEnter={() => setHoverVizId(lot.id)}
                        onMouseLeave={() => setHoverVizId(h => (h === lot.id ? null : h))}
                        className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all"
                      >
                        <SquareFrame>
                          <AmboLottieStill file={lot.file} label={lot.title} hovered={hoverVizId === lot.id} />
                          <span className="absolute top-1 left-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-purple-300">.LOTTIE</span>
                        </SquareFrame>
                        <div className="p-2">
                          <div className="text-[12px] font-semibold text-white truncate">{lot.title}</div>
                          <div className="text-[9px] font-mono text-white/40 truncate">{lot.file}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TELA LOWER THIRDS & TEMPLATES SECTION */}
              {(selectedSubcat === 'all' || selectedSubcat === 'Tela Lower Thirds' || selectedSubcat === 'Tela Documents' || selectedSubcat === 'Data Visualizers') && (
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#D0BCFF] mb-2 flex items-center gap-1.5">
                    <FileText size={13} />
                    Tela Design Templates & Lower Thirds
                  </div>
                  <div style={squareGridStyle(130, 10)}>
                    {TELA_DESIGN_TEMPLATES.map(t => (
                      <div
                        key={t.id}
                        className="rounded-xl overflow-hidden border border-white/10 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all"
                      >
                        <SquareFrame>
                          <AmboPoster label={t.title} gradient="linear-gradient(135deg,#1d2b4a,#0b0f1c)" />
                          <span className="absolute top-1 left-1 text-[8px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-cyan-300">{t.kind}</span>
                        </SquareFrame>
                        <div className="p-2">
                          <div className="text-[12px] font-semibold text-white truncate">{t.title}</div>
                          <div className="text-[9.5px] text-white/40 truncate">{t.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LIVE FEEDS — switcher buses, SDI capture, NDI and native inputs           */}
        {/* Single-click: Preview · Double-click: Take to Program · drag onto a slide */}
        {/* ========================================================================= */}
        {activeTab === 'routines' && <AmboRoutinesPanel shows={shows} />}

        {activeTab === 'live' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/30">
              <div className="text-[10px] text-white/50">Single-click: <span className="text-[#00DAF3] font-bold">Preview</span> · Double-click: <span className="text-[#FF8C00] font-bold">Take</span> · Drag onto a slide for a live background</div>
              <button
                onClick={onScanNdi}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white/80 bg-white/5 hover:bg-white/15 border border-white/10 flex items-center gap-1"
                title="NDI and OMT sources appear automatically; click to force a rescan"
              >
                <RefreshCw size={11} className={isScanningNdi ? 'animate-spin' : ''} />
                <span>{isScanningNdi ? 'Scanning…' : 'Rescan'}</span>
              </button>
            </div>
            <div className={`${SQUARE_GRID_CLASS} p-3`} style={squareGridStyle(150, 8)}>
              {liveFeedItems.map(item => {
                const id = item.inputId || item.id;
                const isLive = currentLiveInputId === id;
                const isPrev = !isLive && currentPreviewInputId === id;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ambo-source', source: item })); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => onPreviewSource(item)}
                    onDoubleClick={() => onProgramSource(item)}
                    className="group relative rounded-xl border p-2.5 cursor-pointer transition-all select-none"
                    style={{
                      background: isLive ? 'rgba(255,140,0,0.16)' : isPrev ? 'rgba(0,218,243,0.12)' : 'rgba(255,255,255,0.03)',
                      borderColor: isLive ? '#FF8C00' : isPrev ? '#00DAF3' : line,
                      boxShadow: isLive ? '0 0 14px rgba(255,140,0,0.25)' : isPrev ? '0 0 12px rgba(0,218,243,0.2)' : 'none',
                    }}
                    title={`${item.name} — click to preview, double-click to take live`}
                  >
                    <SquareFrame className="rounded-lg mb-2 border border-white/5" style={{ background: 'linear-gradient(135deg,#14202b,#0a0f14)' }}>
                      <div className="w-full h-full grid place-items-center">
                        <Radio size={30} className={isLive ? 'text-[#FF8C00]' : isPrev ? 'text-[#00DAF3]' : 'text-white/25'} />
                      </div>
                    </SquareFrame>
                    <div className="text-[11px] font-semibold text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{item.name}</span>
                      {item.online !== undefined && <span title={item.online ? 'Online' : 'Offline'} className="inline-block w-1.5 h-1.5 rounded-full flex-none" style={{ background: item.online ? '#34d399' : '#6b7280' }} />}
                      {['ndi', 'omt', 'srt'].includes(item.tags?.[0] ?? '') && <span className="px-1 rounded text-[7px] font-black font-mono uppercase bg-white/10 text-white/60">{item.tags?.[0]}</span>}
                    </div>
                    <div className="text-[9.5px] text-white/40 truncate">{item.sub}</div>
                    {isLive && <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-[#FF8C00] text-black">LIVE</span>}
                    {isPrev && <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-[#00DAF3] text-black">PREVIEW</span>}
                  </div>
                );
              })}
              {liveFeedItems.length <= 3 && (
                <div className="col-span-full text-[10px] text-white/35 px-1 pt-1">
                  No NDI, OMT or SRT sources yet. They appear here automatically when they come online (Rescan forces a check). SRT is not announced: save an endpoint in the Router Receiver.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AmboNewAudioPlaylistModal
        isOpen={isNewAudioPlaylistModalOpen}
        onClose={() => setIsNewAudioPlaylistModalOpen(false)}
        onCreatePlaylist={handleCreateAudioPlaylist}
      />
    </div>
  );
};

export default React.memo(AmboTabbedLibrary);
