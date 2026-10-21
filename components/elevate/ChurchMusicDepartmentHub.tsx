import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Music,
  Mic2,
  Guitar,
  Users,
  Sparkles,
  Plus,
  FileScan,
  FileText,
  BookOpen,
  ListMusic,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Wand2,
  Download,
  ExternalLink,
  Check,
  Search,
  Globe,
  Send,
  MessageSquare,
  Loader2,
  Radio,
} from 'lucide-react';
import type { Organization } from '../../types';
import {
  PUBLIC_DOMAIN_HYMNS,
  PUBLIC_DOMAIN_GOSPEL_SONGS,
  GLOBAL_PLATFORM_SCORES,
  buildHymnSheetMusicNotation,
  openHymnOrPrayerInLorea,
  type SacredHymnOrPrayer,
  type GlobalPlatformScoreEntry,
} from '../../data/sacredHymnsAndPrayers';
import {
  BLOCK_KINDS,
  blockMeta,
  PAD_SKINS,
  skinMeta,
  autoLabelBlocks,
  duplicateBlock,
  moveBlock,
  syllables,
  type BlockKind,
  type LyricBlock,
  type MelosSong,
  type PadSkin,
} from '../../services/melosService';
import { openMelosSongInTela } from '../../services/telaDomainAdapters';
import { digitizeWorksheetOnDevice } from '../../services/worksheetLocalVision';
import { notationToMusicXML } from '../../services/musicNotation';
import { saveChurchSong } from '../../services/ambo/songLibrary';
import { orgRoomId } from '../../services/orgChatService';
import SheetMusic from '../SheetMusic';
import VerovioScore from '../VerovioScore';
import LoreaScoresModal from '../LoreaScoresModal';
import { isDemoOrg } from '../../services/elevateTruth';

export type MusicSubCategoryKey =
  | 'ALL'
  | 'music-worship-teams'
  | 'music-band'
  | 'music-choir'
  | 'music-collective';

export interface MusicSubDepartmentMeta {
  key: Exclude<MusicSubCategoryKey, 'ALL'>;
  name: string;
  shortLabel: string;
  emoji: string;
  badgeColor: string;
  leadTitle: string;
  callTime: string;
  focus: string;
  rosterCount: number;
}

export const MUSIC_SUB_DEPARTMENTS: MusicSubDepartmentMeta[] = [
  {
    key: 'music-worship-teams',
    name: 'Worship Teams',
    shortLabel: 'Worship Teams',
    emoji: '🎤',
    badgeColor: '#F59E0B',
    leadTitle: 'Praise & Worship Vocalists · Frontline Leaders',
    callTime: 'Sundays 7:30 AM Vocal Warmup · Thursdays 6:30 PM',
    focus: 'Congregational worship leading, three-part praise harmonies, prophetic transitions & altar ministry.',
    rosterCount: 14,
  },
  {
    key: 'music-band',
    name: 'Band',
    shortLabel: 'Band',
    emoji: '🎸',
    badgeColor: '#38BDF8',
    leadTitle: 'Sanctuary Band · Keys, Hammond B3, Guitars, Bass, Drums & Horns',
    callTime: 'Sundays 7:00 AM Soundcheck · Thursdays 7:00 PM Band Run-Through',
    focus: 'Chord charts, Nashville number system, click/stems, organ accompaniment & dynamic transitions.',
    rosterCount: 11,
  },
  {
    key: 'music-choir',
    name: 'Choir',
    shortLabel: 'Choir',
    emoji: '🎶',
    badgeColor: '#A855F7',
    leadTitle: 'Sanctuary SATB Choir & Gospel Mass Choir',
    callTime: 'Sundays 8:00 AM Choir Loft · Thursdays 7:15 PM SATB Sectionals',
    focus: 'Four-part SATB hymnal harmony, Gospel choir anthems, classical motets & liturgical responses.',
    rosterCount: 38,
  },
  {
    key: 'music-collective',
    name: 'Collective Music Department',
    shortLabel: 'Collective',
    emoji: '🎼',
    badgeColor: '#10B981',
    leadTitle: 'Collective Music Department · Songwriters, Arrangers & Producers',
    callTime: 'Tuesdays 7:00 PM Chora Scratchpad Lab & Melos Studio',
    focus: 'Writing original sanctuary worship songs, re-arranging public-domain hymns, Melos stems & Tela songwriting.',
    rosterCount: 19,
  },
];

export interface ScratchpadSongItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'HYMN' | 'GOSPEL' | 'ORIGINAL_COLLECTIVE' | 'SCANNED_PAPER';
  assignedSubDepts: Array<Exclude<MusicSubCategoryKey, 'ALL'>>;
  key: string;
  availableKeys: string[];
  bpm: number;
  timeSignature: string;
  chordProgression: string[];
  blocks: LyricBlock[];
  sacredSource?: SacredHymnOrPrayer;
  historyNote?: string;
}

export interface WorshipSetlistSlot {
  id: string;
  songId: string;
  songTitle: string;
  assignedSubDept: Exclude<MusicSubCategoryKey, 'ALL'>;
  performanceKey: string;
  bpm: number;
  leadVocalistOrDirector: string;
  momentInService: string;
  notes?: string;
}

export interface WorshipServiceSetlist {
  id: string;
  serviceTitle: string;
  serviceDate: string;
  liturgicalTheme: string;
  slots: WorshipSetlistSlot[];
}

function hymnToScratchpadSong(item: SacredHymnOrPrayer): ScratchpadSongItem {
  const isGospel = item.kind === 'PUBLIC_DOMAIN_GOSPEL';
  const blocks: LyricBlock[] = [];

  item.stanzas.forEach((stanza, idx) => {
    blocks.push({
      id: `${item.id}_v_${idx + 1}`,
      kind: 'VERSE',
      label: `Verse ${idx + 1}`,
      lines: stanza.split('\n'),
    });
    if (idx === 0 && item.refrain) {
      blocks.push({
        id: `${item.id}_refrain`,
        kind: 'REFRAIN',
        label: 'Refrain / Chorus',
        lines: item.refrain.split('\n'),
      });
    }
  });

  if (item.score?.chordProgression?.length) {
    blocks.push({
      id: `${item.id}_chords_note`,
      kind: 'NOTE',
      label: 'Arrangement & Cadence Notes',
      lines: [
        `Tune: ${item.score.tuneName} (${item.score.meter}) · ${item.score.tempoMarking}`,
        `Cadence Chords: ${item.score.chordProgression.join('  |  ')}`,
      ],
    });
  }

  const bpmMatch = /(\d{2,3})/.exec(item.score?.tempoMarking || '84');
  const bpm = bpmMatch ? parseInt(bpmMatch[1], 10) : 84;

  return {
    id: item.id,
    title: item.title,
    subtitle: `${item.author} (${item.year})`,
    category: isGospel ? 'GOSPEL' : 'HYMN',
    assignedSubDepts: isGospel
      ? ['music-choir', 'music-worship-teams', 'music-band', 'music-collective']
      : ['music-worship-teams', 'music-choir', 'music-band', 'music-collective'],
    key: item.score?.defaultKey || 'D Major',
    availableKeys: item.score?.availableKeys || ['C Major', 'D Major', 'F Major', 'G Major'],
    bpm,
    timeSignature: item.score?.timeSignature || '4/4',
    chordProgression: item.score?.chordProgression || ['I', 'IV', 'V7', 'I'],
    blocks,
    sacredSource: item,
    historyNote: item.historyEssay,
  };
}

// Sample original song for the demo church only.
const DEFAULT_COLLECTIVE_ORIGINALS: ScratchpadSongItem[] = [
  {
    id: 'collective-orig-sanctuary-fire',
    title: 'Altar of Living Stones (Collective Original)',
    subtitle: 'Collective Music Department · Written in Chora Scratchpad',
    category: 'ORIGINAL_COLLECTIVE',
    assignedSubDepts: ['music-collective', 'music-worship-teams', 'music-band', 'music-choir'],
    key: 'Eb Major',
    availableKeys: ['C Major', 'D Major', 'Eb Major', 'F Major', 'G Major'],
    bpm: 74,
    timeSignature: '4/4',
    chordProgression: ['Eb', 'Abmaj7', 'Cm7', 'Bb(add4)', 'Fm7', 'Eb/G', 'Ab', 'Bb'],
    historyNote:
      'Original congregational anthem co-written by the Collective Music Department during Tuesday night Chora Studio sessions, drawing on 1 Peter 2:4-5 and Isaiah 6:1-8.',
    blocks: [
      {
        id: 'orig_v1',
        kind: 'VERSE',
        label: 'Verse 1',
        lines: [
          'Before a single word is spoken in this room',
          'Your mercy rises like the morning over gloom',
          'We lay our crowns beside the threshold of Your grace',
          'Living stones gathered in this holy place',
        ],
      },
      {
        id: 'orig_c1',
        kind: 'CHORUS',
        label: 'Chorus',
        lines: [
          'Holy, worthy is the Lamb upon the throne',
          'Build Your sanctuary in the hearts You own',
          'From the choir loft unto the altar floor',
          'Jesus, Name above all names forevermore',
        ],
      },
      {
        id: 'orig_b1',
        kind: 'BRIDGE',
        label: 'Bridge (Choir + Band Build)',
        lines: [
          'Let the organ swell and let the elders cry',
          'Glory to the Risen King Who reigns on high',
          'Every generation lifting up one sound',
          'On this covenant and consecrated ground',
        ],
      },
    ],
  },
];

// Sample setlists (with sample vocalists) for the demo church only; real churches start empty.
const INITIAL_SETLISTS: WorshipServiceSetlist[] = [
  {
    id: 'setlist-sunday-sanctuary',
    serviceTitle: 'Sunday 9:00 AM · Historic Sanctuary Liturgy',
    serviceDate: 'This Sunday · 9:00 AM',
    liturgicalTheme: 'Covenant Faithfulness & Trinity Praise',
    slots: [
      {
        id: 'slot-1',
        songId: 'pd-hymn-holy-holy-holy',
        songTitle: 'Holy, Holy, Holy! Lord God Almighty',
        assignedSubDept: 'music-choir',
        performanceKey: 'D Major',
        bpm: 92,
        leadVocalistOrDirector: 'Sanctuary SATB Choir & Pipe Organ',
        momentInService: 'Opening Processional',
        notes: 'Full 4 stanzas; brass & organ fanfare on Stanza 4.',
      },
      {
        id: 'slot-2',
        songId: 'pd-hymn-be-thou-my-vision',
        songTitle: 'Be Thou My Vision',
        assignedSubDept: 'music-worship-teams',
        performanceKey: 'D Major',
        bpm: 84,
        leadVocalistOrDirector: 'Worship Team A (Acoustic & Cello)',
        momentInService: 'Prayer of Illumination (Before Scripture)',
        notes: 'A cappella congregation on final stanza ("High King of Heaven").',
      },
      {
        id: 'slot-3',
        songId: 'pd-gospel-his-eye-is-on-the-sparrow',
        songTitle: 'His Eye Is on the Sparrow',
        assignedSubDept: 'music-choir',
        performanceKey: 'C Major',
        bpm: 56,
        leadVocalistOrDirector: 'Sister Camille Vance & Gospel Choir',
        momentInService: 'Offertory & Ministry of Music',
        notes: 'Piano & Hammond B3 accompaniment; choir enters on second refrain.',
      },
      {
        id: 'slot-4',
        songId: 'pd-hymn-great-is-thy-faithfulness',
        songTitle: 'Great Is Thy Faithfulness',
        assignedSubDept: 'music-band',
        performanceKey: 'D Major',
        bpm: 88,
        leadVocalistOrDirector: 'Full Band, Worship Team & Choir',
        momentInService: 'Altar Response & Benediction',
        notes: 'Modulate D -> Eb on final refrain.',
      },
    ],
  },
  {
    id: 'setlist-sunday-celebration',
    serviceTitle: 'Sunday 11:15 AM · Gospel & Contemporary Worship',
    serviceDate: 'This Sunday · 11:15 AM',
    liturgicalTheme: 'Redemption, Joy & Living Stones',
    slots: [
      {
        id: 'slot-201',
        songId: 'pd-gospel-leaning-on-everlasting-arms',
        songTitle: 'Leaning on the Everlasting Arms',
        assignedSubDept: 'music-band',
        performanceKey: 'A Major',
        bpm: 100,
        leadVocalistOrDirector: 'Sanctuary Band & Praise Team',
        momentInService: 'Call to Worship',
      },
      {
        id: 'slot-202',
        songId: 'pd-gospel-blessed-assurance',
        songTitle: 'Blessed Assurance, Jesus Is Mine',
        assignedSubDept: 'music-worship-teams',
        performanceKey: 'D Major',
        bpm: 62,
        leadVocalistOrDirector: 'Brother Marcus & Frontline Vocalists',
        momentInService: 'Congregational Praise',
      },
      {
        id: 'slot-203',
        songId: 'collective-orig-sanctuary-fire',
        songTitle: 'Altar of Living Stones (Collective Original)',
        assignedSubDept: 'music-collective',
        performanceKey: 'Eb Major',
        bpm: 74,
        leadVocalistOrDirector: 'Collective Music Department',
        momentInService: 'Sermon Response & Altar Call',
      },
    ],
  },
];

const STORAGE_SONGS_KEY = (orgId: string) => `plajah_church_music_songs_v1_${orgId}`;
const STORAGE_SETLISTS_KEY = (orgId: string) => `plajah_church_music_setlists_v1_${orgId}`;

interface ChurchMusicDepartmentHubProps {
  church: Organization;
  canEdit?: boolean;
  initialSubDept?: MusicSubCategoryKey;
  onOpenChatRoom?: (roomId: string) => void;
}

export const ChurchMusicDepartmentHub: React.FC<ChurchMusicDepartmentHubProps> = ({
  church,
  canEdit = true,
  initialSubDept = 'ALL',
  onOpenChatRoom,
}) => {
  // Only the demo church shows sample rosters, call times, setlists and the sample original song.
  const isDemo = isDemoOrg(church);
  const [activeSubDept, setActiveSubDept] = useState<MusicSubCategoryKey>(initialSubDept);
  const [activeSurface, setActiveSurface] = useState<
    'CHORA_SCRATCHPAD' | 'SETLIST_BUILDER' | 'GLOBAL_SCORES_ARCHIVE'
  >('CHORA_SCRATCHPAD');

  // Song Library state (Hymns + Gospel + Collective Originals + Scanned Paper Songs)
  const baseCatalog = useMemo<ScratchpadSongItem[]>(() => {
    const hymns = PUBLIC_DOMAIN_HYMNS.map(hymnToScratchpadSong);
    const gospel = PUBLIC_DOMAIN_GOSPEL_SONGS.map(hymnToScratchpadSong);
    return [...hymns, ...gospel, ...(isDemo ? DEFAULT_COLLECTIVE_ORIGINALS : [])];
  }, [isDemo]);

  const [customSongs, setCustomSongs] = useState<ScratchpadSongItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SONGS_KEY(church.id));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [songOverrides, setSongOverrides] = useState<Record<string, ScratchpadSongItem>>({});

  const allSongs = useMemo(() => {
    const merged = [...customSongs, ...baseCatalog].map(s => songOverrides[s.id] || s);
    return merged;
  }, [customSongs, baseCatalog, songOverrides]);

  const [songCategoryFilter, setSongCategoryFilter] = useState<
    'ALL' | 'HYMN' | 'GOSPEL' | 'ORIGINAL_COLLECTIVE' | 'SCANNED_PAPER'
  >('ALL');
  const [songSearch, setSongSearch] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string>(
    PUBLIC_DOMAIN_HYMNS[0]?.id || 'pd-hymn-be-thou-my-vision'
  );
  const [padSkin, setPadSkin] = useState<PadSkin>('LAMPLIGHT');
  const [showEngravedNotation, setShowEngravedNotation] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Setlists state
  const [setlists, setSetlists] = useState<WorshipServiceSetlist[]>(() => {
    const fallback = isDemo ? INITIAL_SETLISTS : [];
    try {
      const raw = localStorage.getItem(STORAGE_SETLISTS_KEY(church.id));
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as WorshipServiceSetlist[];
      if (!Array.isArray(parsed)) return fallback;
      if (isDemo) return parsed;
      // Earlier builds saved the sample setlists for every church; drop those leftovers.
      const sampleIds = new Set(INITIAL_SETLISTS.map(sl => sl.id));
      return parsed.filter(sl => !sampleIds.has(sl.id));
    } catch {
      return fallback;
    }
  });
  const [activeSetlistId, setActiveSetlistId] = useState<string>(() => setlists[0]?.id || '');

  // Paper Song Scanner (Worksheet Digitizer Tech)
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [scanningPaperSong, setScanningPaperSong] = useState(false);

  // Global Scores Archive state
  const [globalEraFilter, setGlobalEraFilter] = useState<string>('ALL');
  const [globalOnlyVerovio, setGlobalOnlyVerovio] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [selectedGlobalScore, setSelectedGlobalScore] = useState<GlobalPlatformScoreEntry>(
    GLOBAL_PLATFORM_SCORES.find(s => s.mxlUrl) || GLOBAL_PLATFORM_SCORES[0]
  );
  const [openLoreaScoreModal, setOpenLoreaScoreModal] = useState<GlobalPlatformScoreEntry | null>(null);

  useEffect(() => {
    if (initialSubDept) setActiveSubDept(initialSubDept);
  }, [initialSubDept]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const filteredSongs = useMemo(() => {
    return allSongs.filter(s => {
      if (activeSubDept !== 'ALL' && !s.assignedSubDepts.includes(activeSubDept)) return false;
      if (songCategoryFilter !== 'ALL' && s.category !== songCategoryFilter) return false;
      if (songSearch.trim()) {
        const q = songSearch.toLowerCase();
        const inTitle = s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q);
        const inLyrics = s.blocks.some(b => b.lines.some(l => l.toLowerCase().includes(q)));
        if (!inTitle && !inLyrics) return false;
      }
      return true;
    });
  }, [allSongs, activeSubDept, songCategoryFilter, songSearch]);

  const activeSong = useMemo(
    () => allSongs.find(s => s.id === selectedSongId) || filteredSongs[0] || allSongs[0],
    [allSongs, selectedSongId, filteredSongs]
  );

  const updateActiveSong = (patch: Partial<ScratchpadSongItem>) => {
    if (!activeSong) return;
    const updated: ScratchpadSongItem = { ...activeSong, ...patch };
    setSongOverrides(prev => ({ ...prev, [updated.id]: updated }));
    if (customSongs.some(c => c.id === updated.id)) {
      const nextCustom = customSongs.map(c => (c.id === updated.id ? updated : c));
      setCustomSongs(nextCustom);
      try {
        localStorage.setItem(STORAGE_SONGS_KEY(church.id), JSON.stringify(nextCustom));
      } catch {
        // ignore
      }
    }
  };

  const updateBlocks = (nextBlocks: LyricBlock[]) => {
    updateActiveSong({ blocks: nextBlocks });
  };

  const addBlock = (kind: BlockKind) => {
    if (!activeSong) return;
    const nextBlocks = autoLabelBlocks([
      ...activeSong.blocks,
      {
        id: `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        kind,
        label: blockMeta(kind).label,
        lines: [''],
      },
    ]);
    updateBlocks(nextBlocks);
  };

  const handleCreateBlankScratchpadSong = () => {
    const newSong: ScratchpadSongItem = {
      id: `song_${Date.now().toString(36)}`,
      title: 'Untitled Sanctuary Anthem',
      subtitle: `${church.name} · Collective Music Department`,
      category: 'ORIGINAL_COLLECTIVE',
      assignedSubDepts:
        activeSubDept === 'ALL'
          ? ['music-collective', 'music-worship-teams', 'music-band', 'music-choir']
          : [activeSubDept],
      key: 'D Major',
      availableKeys: ['C Major', 'D Major', 'Eb Major', 'F Major', 'G Major', 'A Major'],
      bpm: 78,
      timeSignature: '4/4',
      chordProgression: ['D', 'Bm7', 'Gmaj7', 'Asus4', 'A'],
      blocks: [
        { id: `b_v1_${Date.now()}`, kind: 'VERSE', label: 'Verse 1', lines: ['Write opening stanza here...'] },
        { id: `b_c1_${Date.now()}`, kind: 'CHORUS', label: 'Chorus', lines: ['Write congregational refrain here...'] },
      ],
    };
    const nextCustom = [newSong, ...customSongs];
    setCustomSongs(nextCustom);
    try {
      localStorage.setItem(STORAGE_SONGS_KEY(church.id), JSON.stringify(nextCustom));
    } catch {
      // ignore
    }
    setSelectedSongId(newSong.id);
    setActiveSurface('CHORA_SCRATCHPAD');
    triggerToast('Created new song in Chora Studio Song Scratchpad.');
  };

  // Scan a paper song sheet using the Academia Worksheet Digitizer tech!
  const handleScanPaperSongSheet = async (file: File) => {
    setScanningPaperSong(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read image file.'));
        reader.readAsDataURL(file);
      });
      const res = await digitizeWorksheetOnDevice(dataUrl, church.creatorId || church.id, () => {});
      const digitized = res.sheet;
      const extractedBlocks: LyricBlock[] = [];
      let detectedChords: string[] = ['G', 'C', 'Em7', 'D', 'G'];

      (digitized.segments || []).forEach((seg, idx) => {
        const segText = seg.text || '';
        const lines = segText
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return;

        // Detect chord tokens if present
        const chordMatches = segText.match(/\b[A-G](?:#|b)?(?:m|maj7|m7|sus4|dim|7|add9)?(?:\/[A-G](?:#|b)?)?\b/g);
        if (chordMatches && chordMatches.length >= 3) {
          detectedChords = Array.from(new Set(chordMatches)).slice(0, 8);
        }

        const isChorus = /chorus|refrain/i.test(segText);
        const isBridge = /bridge|vamp/i.test(segText);
        const kind: BlockKind = isChorus ? 'CHORUS' : isBridge ? 'BRIDGE' : 'VERSE';

        extractedBlocks.push({
          id: `scan_blk_${idx}_${Date.now()}`,
          kind,
          label: isChorus ? 'Chorus' : isBridge ? 'Bridge' : `Verse ${extractedBlocks.length + 1}`,
          lines,
        });
      });

      if (extractedBlocks.length === 0) {
        extractedBlocks.push({
          id: `scan_fallback_${Date.now()}`,
          kind: 'VERSE',
          label: 'Scanned Verse 1',
          lines: [`[Scanned from ${file.name}] No lyrics were recognized. Type the words here.`],
        });
      }

      const scannedSong: ScratchpadSongItem = {
        id: `scanned_song_${Date.now().toString(36)}`,
        title: digitized.title || file.name.replace(/\.[^.]+$/, ''),
        subtitle: `Scanned from Paper via Worksheet Digitizer · ${new Date().toLocaleDateString()}`,
        category: 'SCANNED_PAPER',
        assignedSubDepts: ['music-worship-teams', 'music-band', 'music-choir', 'music-collective'],
        key: 'G Major',
        availableKeys: ['F Major', 'G Major', 'A Major', 'Bb Major', 'C Major'],
        bpm: 82,
        timeSignature: '4/4',
        chordProgression: detectedChords,
        blocks: autoLabelBlocks(extractedBlocks),
      };

      const nextCustom = [scannedSong, ...customSongs];
      setCustomSongs(nextCustom);
      try {
        localStorage.setItem(STORAGE_SONGS_KEY(church.id), JSON.stringify(nextCustom));
      } catch {
        // ignore
      }
      setSelectedSongId(scannedSong.id);
      setActiveSurface('CHORA_SCRATCHPAD');
      triggerToast(`Scanned "${scannedSong.title}" from paper into Chora Scratchpad blocks!`);
    } catch {
      triggerToast('Could not read that sheet. Started a blank song instead.');
      handleCreateBlankScratchpadSong();
    } finally {
      setScanningPaperSong(false);
    }
  };

  // Convert active ScratchpadSongItem to a MelosSong for Tela Songwriting Mode or Melos Studio
  const toMelosSong = (s: ScratchpadSongItem): { prodId: string; song: MelosSong; allSongs: MelosSong[] } => {
    const prodId = `melos_church_${church.id}`;
    const mapOne = (item: ScratchpadSongItem, idx: number): MelosSong => ({
      id: item.id,
      title: item.title,
      workingTitle: item.subtitle,
      state: 'WRITING',
      commitment: 'WORKING_ON_IT',
      love: 5,
      confidence: 90,
      lyrics: item.blocks,
      notes: item.historyNote || `Chords: ${item.chordProgression.join(' - ')}`,
      tempo: item.bpm,
      keySig: item.key.split(' ')[0] || 'D',
      timeSig: item.timeSignature || '4/4',
      takes: [],
      credits: [
        {
          id: `cred_${item.id}`,
          name: item.subtitle,
          role: 'WRITER',
        },
      ],
      sampleIds: [],
      images: [],
      tags: ['church', 'worship', item.category.toLowerCase()],
      order: idx,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const melosSong = mapOne(s, 0);
    const allMelos = allSongs.slice(0, 20).map((item, idx) => (item.id === s.id ? melosSong : mapOne(item, idx)));
    return { prodId, song: melosSong, allSongs: allMelos };
  };

  // Deep link 1: Open in Tela Document in Songwriting Mode (`mode: 'SONGWRITING'`)
  const handleOpenInTelaSongwritingMode = async () => {
    if (!activeSong) return;
    const { prodId, song, allSongs: prodSongs } = toMelosSong(activeSong);
    await openMelosSongInTela(prodId, song, prodSongs, church.creatorId || 'elevate-music');
    triggerToast(`Opened "${activeSong.title}" in Tela Songwriting Mode!`);
  };

  // Deep link 2: Open in Melos Studio Workspace
  const handleOpenInMelosStudio = () => {
    if (!activeSong) return;
    const { prodId, song } = toMelosSong(activeSong);
    window.dispatchEvent(
      new CustomEvent('plajah:openMelosSong', { detail: { productionId: prodId, songId: song.id } })
    );
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'MELOS' } }));
    triggerToast(`Synced "${activeSong.title}" to Melos Studio!`);
  };

  // Push active song to Ambo Live Service Lyrics Library
  const handleSyncSongToAmbo = async () => {
    if (!activeSong) return;
    const stanzas = activeSong.blocks
      .filter(b => b.kind !== 'NOTE')
      .map(b => b.lines.join('\n'))
      .filter(Boolean);
    await saveChurchSong(church.id, {
      id: activeSong.id,
      title: activeSong.title,
      author: activeSong.subtitle,
      stanzas,
      key: activeSong.key,
      bpm: activeSong.bpm,
      ccli: 'Public Domain / Church Collective',
    });
    triggerToast(`Synced "${activeSong.title}" to Stage Live Projection Library!`);
  };

  // Export engraved sheet music as MusicXML (.musicxml)
  const handleDownloadMusicXML = () => {
    if (!activeSong) return;
    const sourceHymn: SacredHymnOrPrayer = activeSong.sacredSource || {
      id: activeSong.id,
      kind: 'PUBLIC_DOMAIN_HYMN',
      title: activeSong.title,
      tradition: 'ECUMENICAL_HYMN',
      author: activeSong.subtitle,
      year: new Date().getFullYear().toString(),
      scriptureRefs: [],
      stanzas: activeSong.blocks.map(b => b.lines.join('\n')),
      historyTitle: activeSong.title,
      historyEssay: activeSong.historyNote || '',
      score: {
        tuneName: activeSong.title.toUpperCase(),
        meter: 'Regular',
        defaultKey: activeSong.key,
        availableKeys: activeSong.availableKeys,
        timeSignature: activeSong.timeSignature,
        tempoMarking: `Moderato (♩ = ${activeSong.bpm})`,
        arrangement: 'SATB_HYMNAL',
        sopranoNotes: (activeSong.blocks[0]?.lines[0] || 'Praise the Lord')
          .split(/\s+/)
          .slice(0, 8)
          .map((word, idx) => ({
            pitch: ['D4', 'F#4', 'A4', 'G4', 'F#4', 'E4', 'D4', 'A4'][idx % 8],
            lyric: word,
            beat: idx + 1,
          })),
        chordProgression: activeSong.chordProgression,
      },
    };
    const notation = buildHymnSheetMusicNotation(sourceHymn, activeSong.key);
    const xml = notationToMusicXML(
      notation,
      activeSong.title,
      activeSong.sacredSource?.composer || activeSong.subtitle,
      {
        lyricist: activeSong.sacredSource?.author || church.name,
        rights: 'Public Domain / Sanctuary Music Department Edition',
      }
    );
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSong.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast(`Exported MusicXML score for "${activeSong.title}".`);
  };

  // Setlist Builder helpers
  const activeSetlist = useMemo(
    () => setlists.find(s => s.id === activeSetlistId) || setlists[0],
    [setlists, activeSetlistId]
  );

  const persistSetlists = (next: WorshipServiceSetlist[]) => {
    setSetlists(next);
    try {
      localStorage.setItem(STORAGE_SETLISTS_KEY(church.id), JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleAddSongToActiveSetlist = (
    song: ScratchpadSongItem,
    subDept: Exclude<MusicSubCategoryKey, 'ALL'> = 'music-worship-teams'
  ) => {
    const subMeta = MUSIC_SUB_DEPARTMENTS.find(d => d.key === subDept) || MUSIC_SUB_DEPARTMENTS[0];
    const newSlot: WorshipSetlistSlot = {
      id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      songId: song.id,
      songTitle: song.title,
      assignedSubDept: subDept,
      performanceKey: song.key,
      bpm: song.bpm,
      leadVocalistOrDirector: `${subMeta.name} Lead`,
      momentInService: 'Congregational Worship',
    };
    if (!activeSetlist) {
      // No setlist yet: start one with this song.
      const created: WorshipServiceSetlist = {
        id: `setlist_${Date.now().toString(36)}`,
        serviceTitle: 'New Worship Service Setlist',
        serviceDate: 'Upcoming Service',
        liturgicalTheme: '',
        slots: [newSlot],
      };
      persistSetlists([created, ...setlists]);
      setActiveSetlistId(created.id);
      triggerToast(`Started a new setlist with "${song.title}".`);
      return;
    }
    const updated = setlists.map(sl =>
      sl.id === activeSetlist.id ? { ...sl, slots: [...sl.slots, newSlot] } : sl
    );
    persistSetlists(updated);
    triggerToast(`Added "${song.title}" to "${activeSetlist.serviceTitle}"!`);
  };

  const handleRemoveSlot = (slotId: string) => {
    if (!activeSetlist) return;
    const updated = setlists.map(sl =>
      sl.id === activeSetlist.id ? { ...sl, slots: sl.slots.filter(x => x.id !== slotId) } : sl
    );
    persistSetlists(updated);
  };

  const handleCreateSetlist = () => {
    const created: WorshipServiceSetlist = {
      id: `setlist_${Date.now().toString(36)}`,
      serviceTitle: `New Worship Service Setlist (${setlists.length + 1})`,
      serviceDate: 'Upcoming Service',
      liturgicalTheme: isDemo ? 'Sanctuary Praise & Word' : '',
      slots: [],
    };
    const next = [created, ...setlists];
    persistSetlists(next);
    setActiveSetlistId(created.id);
    setActiveSurface('SETLIST_BUILDER');
  };

  // Engraved notation for the active song
  const activeNotation = useMemo(() => {
    if (!activeSong) return null;
    const sourceHymn: SacredHymnOrPrayer = activeSong.sacredSource || {
      id: activeSong.id,
      kind: 'PUBLIC_DOMAIN_HYMN',
      title: activeSong.title,
      tradition: 'ECUMENICAL_HYMN',
      author: activeSong.subtitle,
      year: '2026',
      scriptureRefs: [],
      stanzas: activeSong.blocks.map(b => b.lines.join('\n')),
      historyTitle: activeSong.title,
      historyEssay: activeSong.historyNote || '',
      score: {
        tuneName: activeSong.title.toUpperCase(),
        meter: 'Common Meter',
        defaultKey: activeSong.key,
        availableKeys: activeSong.availableKeys,
        timeSignature: activeSong.timeSignature,
        tempoMarking: `Moderato (♩ = ${activeSong.bpm})`,
        arrangement: 'SATB_HYMNAL',
        sopranoNotes: (activeSong.blocks[0]?.lines[0] || 'Holy Lord God Almighty')
          .split(/\s+/)
          .slice(0, 8)
          .map((word, idx) => ({
            pitch: ['D4', 'F#4', 'A4', 'B4', 'A4', 'G4', 'F#4', 'D4'][idx % 8],
            lyric: word.replace(/[^a-zA-Z’'-]/g, ''),
            beat: idx + 1,
          })),
        chordProgression: activeSong.chordProgression,
      },
    };
    return buildHymnSheetMusicNotation(sourceHymn, activeSong.key);
  }, [activeSong]);

  // Filtered Global Scores
  const filteredGlobalScores = useMemo(() => {
    return GLOBAL_PLATFORM_SCORES.filter(item => {
      if (globalEraFilter !== 'ALL' && item.era !== globalEraFilter) return false;
      if (globalOnlyVerovio && !item.mxlUrl) return false;
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !item.composer.toLowerCase().includes(q) &&
          !item.instrumentation.toLowerCase().includes(q) &&
          !item.region.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [globalEraFilter, globalOnlyVerovio, globalSearch]);

  const skin = skinMeta(padSkin);

  return (
    <div
      className="space-y-5 text-white"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-amber-400 text-black font-black text-xs shadow-2xl flex items-center gap-2">
          <Check size={15} /> {toastMessage}
        </div>
      )}

      {/* Hidden File Input for Paper Song Scanner (Worksheet Digitizer Tech) */}
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleScanPaperSongSheet(f);
          e.target.value = '';
        }}
      />

      {/* Top Banner: Music Department Header & Quick Deep Links */}
      <div
        className="rounded-3xl border border-amber-400/25 p-5 space-y-4"
        style={{
          background:
            'radial-gradient(circle at 12% 20%, rgba(212,175,55,0.16), transparent 55%), radial-gradient(circle at 88% 80%, rgba(99,102,241,0.16), transparent 55%), #0D101B',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-200 text-[10px] font-black uppercase tracking-widest">
              <Music size={12} /> {church.name} · Music &amp; Worship Arts Department
            </div>
            <h2
              className="text-2xl font-black tracking-tight text-white"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Sanctuary Music Department &amp; Chora Songwriting Scratchpad
            </h2>
            <p className="text-xs text-white/65 max-w-3xl leading-relaxed">
              Organized across <strong className="text-white">Worship Teams</strong>,{' '}
              <strong className="text-white">Band</strong>, <strong className="text-white">Choir</strong>, and the{' '}
              <strong className="text-white">Collective Music Department</strong>. Manage the complete Public-Domain Hymnal,
              Gospel &amp; Spirituals Archive, and Global Conservatory Scores, build service setlists, scan paper song sheets
              using the Worksheet Digitizer, or write directly in Chora Studio, Melos, and Tela Songwriting Mode.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={scanningPaperSong}
              onClick={() => scanInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl bg-emerald-400 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg hover:brightness-105 transition"
            >
              {scanningPaperSong ? <Loader2 size={14} className="animate-spin" /> : <FileScan size={14} />}
              {scanningPaperSong ? 'Scanning Paper Song...' : 'Scan Song from Paper'}
            </button>
            <button
              type="button"
              onClick={handleOpenInTelaSongwritingMode}
              className="px-3.5 py-2 rounded-xl bg-indigo-400 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg hover:brightness-105 transition"
            >
              <FileText size={14} /> Write in Tela (Songwriting Mode)
            </button>
            <button
              type="button"
              onClick={handleOpenInMelosStudio}
              className="px-3.5 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5 shadow-lg hover:brightness-105 transition"
            >
              <Wand2 size={14} /> Write / Produce in Melos
            </button>
          </div>
        </div>

        {/* 4 Music Department Sub-Categories Switcher */}
        <div className="grid sm:grid-cols-5 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setActiveSubDept('ALL')}
            className={`text-left rounded-2xl p-3 border transition ${
              activeSubDept === 'ALL'
                ? 'bg-amber-400/20 border-amber-400 text-white'
                : 'bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.06]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg">🎵</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10">
                All 4 Units
              </span>
            </div>
            <p className="font-black text-xs mt-1.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
              All Music Units
            </p>
            <p className="text-[10px] text-white/50 mt-0.5 line-clamp-1">
              Unified Hymnal, Gospel &amp; Setlists
            </p>
          </button>

          {MUSIC_SUB_DEPARTMENTS.map(sub => {
            const active = activeSubDept === sub.key;
            const chatRoomId = orgRoomId(church.id, `team-${sub.name}`);
            return (
              <div
                key={sub.key}
                onClick={() => setActiveSubDept(sub.key)}
                className={`cursor-pointer rounded-2xl p-3 border transition flex flex-col justify-between ${
                  active
                    ? 'bg-white/[0.1] border-amber-400 text-white shadow-lg'
                    : 'bg-white/[0.03] border-white/10 text-white/75 hover:bg-white/[0.06]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-lg">{sub.emoji}</span>
                    {isDemo && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold"
                        style={{
                          background: `${sub.badgeColor}22`,
                          color: sub.badgeColor,
                          border: `1px solid ${sub.badgeColor}55`,
                        }}
                      >
                        {sub.rosterCount} Members
                      </span>
                    )}
                  </div>
                  <p
                    className="font-black text-xs mt-1.5 text-white"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {sub.name}
                  </p>
                  <p className="text-[10px] text-white/55 mt-0.5 line-clamp-2 leading-snug">
                    {sub.focus}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-1 pt-2 mt-2 border-t border-white/10">
                  <span className="text-[9px] text-amber-200/80 truncate">{isDemo ? sub.callTime.split('·')[0] : ''}</span>
                  {onOpenChatRoom && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenChatRoom(chatRoomId);
                      }}
                      className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[9px] font-bold text-white inline-flex items-center gap-1"
                      title={`Open ${sub.name} Chat Room`}
                    >
                      <MessageSquare size={9} /> Chat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Surface Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveSurface('CHORA_SCRATCHPAD')}
              className={`px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-2 transition ${
                activeSurface === 'CHORA_SCRATCHPAD'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              <Sparkles size={14} /> Chora Studio Song Scratchpad &amp; Hymnal ({filteredSongs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSurface('SETLIST_BUILDER')}
              className={`px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-2 transition ${
                activeSurface === 'SETLIST_BUILDER'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              <ListMusic size={14} /> Worship Service Setlist Builder ({setlists.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSurface('GLOBAL_SCORES_ARCHIVE')}
              className={`px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-2 transition ${
                activeSurface === 'GLOBAL_SCORES_ARCHIVE'
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              <Globe size={14} /> Global Public-Domain Scores &amp; Notation ({GLOBAL_PLATFORM_SCORES.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreateBlankScratchpadSong}
            className="px-3.5 py-2 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 text-xs font-black inline-flex items-center gap-1.5"
          >
            <Plus size={13} /> New Scratchpad Song
          </button>
        </div>
      </div>

      {/* =====================================================================
          SURFACE 1: CHORA STUDIO SONGWRITING SCRATCHPAD UI + HYMNAL & NOTATION
          ===================================================================== */}
      {activeSurface === 'CHORA_SCRATCHPAD' && activeSong && (
        <div
          className="rounded-3xl border overflow-hidden grid lg:grid-cols-12"
          style={{
            background: skin.ground,
            borderColor: 'rgba(255,255,255,0.12)',
            minHeight: 680,
          }}
        >
          {/* LEFT COLUMN (4 cols): Song Gallery Rail (Hymns, Gospel, Originals, Scanned) */}
          <div
            className="lg:col-span-4 border-b lg:border-b-0 lg:border-r p-4 flex flex-col gap-3"
            style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.28)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[11px] font-black uppercase tracking-widest"
                style={{ color: skin.accent, fontFamily: "'Outfit', sans-serif" }}
              >
                Song Gallery &amp; Hymnal
              </span>
              <div className="flex items-center gap-1">
                {PAD_SKINS.map(sk => (
                  <button
                    key={sk.key}
                    type="button"
                    onClick={() => setPadSkin(sk.key)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      padSkin === sk.key
                        ? 'bg-amber-400 text-black'
                        : 'bg-white/5 text-white/50 hover:text-white'
                    }`}
                  >
                    {sk.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-2.5 text-white/40" />
              <input
                value={songSearch}
                onChange={e => setSongSearch(e.target.value)}
                placeholder="Search hymns, gospel, lyrics, tunes..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-amber-400/50"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'ALL', label: 'All Songs' },
                  { id: 'HYMN', label: 'Hymnal (PD)' },
                  { id: 'GOSPEL', label: 'Gospel & Spirituals' },
                  { id: 'ORIGINAL_COLLECTIVE', label: 'Collective Originals' },
                  { id: 'SCANNED_PAPER', label: 'Scanned Paper' },
                ] as const
              ).map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSongCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                    songCategoryFilter === cat.id
                      ? 'bg-amber-400 text-black'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Song Rail List */}
            <div className="space-y-1.5 overflow-y-auto max-h-[540px] pr-1">
              {filteredSongs.map(song => {
                const selected = song.id === activeSong.id;
                return (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => setSelectedSongId(song.id)}
                    className={`w-full text-left rounded-2xl p-3 border transition ${
                      selected
                        ? 'bg-amber-400/15 border-amber-400/70'
                        : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
                        style={{
                          background:
                            song.category === 'GOSPEL'
                              ? 'rgba(168,85,247,0.2)'
                              : song.category === 'HYMN'
                              ? 'rgba(245,158,11,0.2)'
                              : song.category === 'SCANNED_PAPER'
                              ? 'rgba(16,185,129,0.2)'
                              : 'rgba(56,189,248,0.2)',
                          color:
                            song.category === 'GOSPEL'
                              ? '#E9D5FF'
                              : song.category === 'HYMN'
                              ? '#FDE68A'
                              : song.category === 'SCANNED_PAPER'
                              ? '#A7F3D0'
                              : '#BAE6FD',
                        }}
                      >
                        {song.category === 'GOSPEL'
                          ? 'Gospel / Spiritual'
                          : song.category === 'HYMN'
                          ? 'Public-Domain Hymn'
                          : song.category === 'SCANNED_PAPER'
                          ? 'Scanned Paper'
                          : 'Collective Original'}
                      </span>
                      <span className="text-[10px] font-mono text-white/55">
                        {song.key} · {song.bpm} BPM
                      </span>
                    </div>
                    <p
                      className="font-black text-sm text-white mt-1"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      {song.title}
                    </p>
                    <p className="text-[11px] text-white/50 truncate">{song.subtitle}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {song.assignedSubDepts.map(sd => {
                        const meta = MUSIC_SUB_DEPARTMENTS.find(d => d.key === sd);
                        if (!meta) return null;
                        return (
                          <span
                            key={sd}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/65"
                          >
                            {meta.emoji} {meta.shortLabel}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN (8 cols): Chora Studio Songwriting Scratchpad + Live Engraved Notation */}
          <div className="lg:col-span-8 p-5 space-y-5 overflow-y-auto max-h-[760px]">
            {/* Song Title & Metadata Bar */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[240px]">
                  <input
                    value={activeSong.title}
                    onChange={e => updateActiveSong({ title: e.target.value })}
                    className="w-full bg-transparent text-xl font-black text-white outline-none border-b border-transparent focus:border-amber-400/50"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  />
                  <p className="text-xs text-white/60 mt-0.5">{activeSong.subtitle}</p>
                </div>

                {/* Key Transposer, BPM & Time Signature */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase text-white/45">Key</span>
                    <select
                      aria-label="Song Key"
                      value={activeSong.key}
                      onChange={e => updateActiveSong({ key: e.target.value })}
                      className="bg-transparent text-xs font-mono font-bold text-amber-300 outline-none"
                    >
                      {Array.from(new Set([activeSong.key, ...activeSong.availableKeys])).map(k => (
                        <option key={k} value={k} className="bg-zinc-900 text-white">
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-black/50 border border-white/15 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase text-white/45">BPM</span>
                    <input
                      aria-label="Song BPM"
                      type="number"
                      value={activeSong.bpm}
                      onChange={e => updateActiveSong({ bpm: parseInt(e.target.value, 10) || 80 })}
                      className="w-12 bg-transparent text-xs font-mono font-bold text-white outline-none"
                    />
                  </div>

                  <span className="px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white/80">
                    {activeSong.timeSignature}
                  </span>
                </div>
              </div>

              {/* Harmonic Chord Progression Strip */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45 mr-1">
                  Harmonic Cadence:
                </span>
                {activeSong.chordProgression.map((ch, idx) => (
                  <span
                    key={`${ch}_${idx}`}
                    className="px-2.5 py-0.5 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-200 font-mono text-xs font-bold"
                  >
                    {ch}
                  </span>
                ))}
              </div>

              {/* Assigned Music Sub-Departments for this Song */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Assigned Units:
                  </span>
                  {MUSIC_SUB_DEPARTMENTS.map(sub => {
                    const assigned = activeSong.assignedSubDepts.includes(sub.key);
                    return (
                      <button
                        key={sub.key}
                        type="button"
                        onClick={() => {
                          const next = assigned
                            ? activeSong.assignedSubDepts.filter(x => x !== sub.key)
                            : [...activeSong.assignedSubDepts, sub.key];
                          updateActiveSong({ assignedSubDepts: next });
                        }}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                          assigned
                            ? 'bg-white text-black border-white'
                            : 'border-white/15 text-white/50 hover:text-white'
                        }`}
                      >
                        {sub.emoji} {sub.shortLabel}
                      </button>
                    );
                  })}
                </div>

                {/* Action Bar: Add to Setlist, Lorea, Ambo, MusicXML */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleAddSongToActiveSetlist(
                        activeSong,
                        activeSubDept === 'ALL' ? 'music-worship-teams' : activeSubDept
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-amber-400 text-black text-[11px] font-black inline-flex items-center gap-1"
                  >
                    <Plus size={11} /> Add to Setlist
                  </button>
                  {activeSong.sacredSource && (
                    <button
                      type="button"
                      onClick={() => openHymnOrPrayerInLorea(activeSong.sacredSource!)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <BookOpen size={11} /> Open in Lorea
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSyncSongToAmbo}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Radio size={11} /> Push to Stage Live
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMusicXML}
                    className="px-2.5 py-1 rounded-lg border border-white/15 text-white/80 hover:text-white text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Download size={11} /> MusicXML
                  </button>
                </div>
              </div>
            </div>

            {/* Engraved Sheet Music Notation Toggle & Viewer (`<SheetMusic />`) */}
            <div className="rounded-2xl border border-amber-400/25 bg-black/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                    Chora Studio Engraved Accompaniment Score · SATB &amp; Keyboard
                  </span>
                  <h4
                    className="text-sm font-black text-white"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {activeSong.title} ({activeSong.key} · {activeSong.timeSignature})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEngravedNotation(v => !v)}
                  className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white"
                >
                  {showEngravedNotation ? 'Hide Engraved Score' : 'Show Engraved Score'}
                </button>
              </div>

              {showEngravedNotation && activeNotation && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-white p-2">
                  <SheetMusic notation={activeNotation} measuresPerSystem={4} />
                </div>
              )}
            </div>

            {/* Chora Studio Songwriting Scratchpad Blocks (PadRoom UI) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span
                    className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: skin.accent, fontFamily: "'Outfit', sans-serif" }}
                  >
                    Chora Studio Lyric &amp; Chord Scratchpad Blocks
                  </span>
                  <p className="text-[11px] text-white/50">
                    Typed songwriting blocks with live syllable scansion counter, reorder controls, and lock protection.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {BLOCK_KINDS.slice(0, 7).map(bm => (
                    <button
                      key={bm.key}
                      type="button"
                      onClick={() => addBlock(bm.key)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black border border-white/15 hover:bg-white/10 transition"
                      style={{ color: bm.color }}
                    >
                      + {bm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {activeSong.blocks.map((blk, bIdx) => {
                  const meta = blockMeta(blk.kind);
                  return (
                    <div
                      key={blk.id}
                      className="rounded-2xl border p-3.5 space-y-2.5 transition"
                      style={{
                        borderColor: `${meta.color}44`,
                        background: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider"
                            style={{ background: `${meta.color}25`, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <input
                            value={blk.label}
                            disabled={blk.locked}
                            onChange={e => {
                              const next = activeSong.blocks.map((x, idx) =>
                                idx === bIdx ? { ...x, label: e.target.value } : x
                              );
                              updateBlocks(next);
                            }}
                            className="bg-transparent text-xs font-black text-white outline-none"
                            style={{ fontFamily: "'Outfit', sans-serif" }}
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateBlocks(moveBlock(activeSong.blocks, bIdx, bIdx - 1))}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
                            title="Move block up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBlocks(moveBlock(activeSong.blocks, bIdx, bIdx + 1))}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
                            title="Move block down"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateBlocks(duplicateBlock(activeSong.blocks, bIdx))}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
                            title="Duplicate block"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = activeSong.blocks.map((x, idx) =>
                                idx === bIdx ? { ...x, locked: !x.locked } : x
                              );
                              updateBlocks(next);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
                            title={blk.locked ? 'Unlock block' : 'Lock block'}
                          >
                            {blk.locked ? <Lock size={13} className="text-amber-300" /> : <Unlock size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateBlocks(activeSong.blocks.filter((_, idx) => idx !== bIdx))
                            }
                            className="p-1 rounded hover:bg-rose-500/20 text-white/40 hover:text-rose-300"
                            title="Remove block"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Lyric Lines + Syllable Meter Hint */}
                      <div className="space-y-1.5">
                        {blk.lines.map((line, lIdx) => {
                          const syl = syllables(line);
                          return (
                            <div key={lIdx} className="flex items-center gap-2">
                              <input
                                value={line}
                                disabled={blk.locked}
                                onChange={e => {
                                  const nextLines = blk.lines.map((l, i) =>
                                    i === lIdx ? e.target.value : l
                                  );
                                  const nextBlocks = activeSong.blocks.map((x, idx) =>
                                    idx === bIdx ? { ...x, lines: nextLines } : x
                                  );
                                  updateBlocks(nextBlocks);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !blk.locked) {
                                    e.preventDefault();
                                    const nextLines = [
                                      ...blk.lines.slice(0, lIdx + 1),
                                      '',
                                      ...blk.lines.slice(lIdx + 1),
                                    ];
                                    const nextBlocks = activeSong.blocks.map((x, idx) =>
                                      idx === bIdx ? { ...x, lines: nextLines } : x
                                    );
                                    updateBlocks(nextBlocks);
                                  }
                                }}
                                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:border-amber-400/50"
                                placeholder="Type lyric or chord line..."
                              />
                              <span
                                className="w-14 text-right font-mono text-[10px] px-2 py-1 rounded bg-black/40 text-white/55"
                                title="Syllable count for hymnal meter scansion"
                              >
                                {syl} syl
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historical Provenance & Hymn Background Note */}
            {activeSong.historyNote && (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                  Hymnology &amp; Historical Provenance
                </p>
                <p className="text-xs text-white/75 leading-relaxed">{activeSong.historyNote}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SURFACE 2: WORSHIP SERVICE SETLIST BUILDER
          ===================================================================== */}
      {activeSurface === 'SETLIST_BUILDER' && (
        <div className="grid lg:grid-cols-12 gap-4">
          {/* Setlist Selector Rail (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-black uppercase tracking-widest text-amber-300"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Worship Service Setlists
              </span>
              <button
                type="button"
                onClick={handleCreateSetlist}
                className="px-3 py-1 rounded-xl bg-amber-400 text-black text-[11px] font-black inline-flex items-center gap-1"
              >
                <Plus size={12} /> New Setlist
              </button>
            </div>

            <div className="space-y-2">
              {setlists.length === 0 && (
                <p className="text-xs text-white/50 leading-relaxed">
                  No setlists yet. Start one for your next service, or add a song from the song gallery.
                </p>
              )}
              {setlists.map(sl => {
                const active = sl.id === activeSetlist?.id;
                return (
                  <button
                    key={sl.id}
                    type="button"
                    onClick={() => setActiveSetlistId(sl.id)}
                    className={`w-full text-left rounded-2xl p-3.5 border transition ${
                      active
                        ? 'bg-amber-400/15 border-amber-400 text-white'
                        : 'bg-black/30 border-white/10 text-white/75 hover:bg-white/[0.06]'
                    }`}
                  >
                    <p
                      className="font-black text-sm text-white"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      {sl.serviceTitle}
                    </p>
                    <p className="text-[11px] text-amber-200/80 mt-0.5">{sl.serviceDate}</p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {sl.liturgicalTheme ? `Theme: ${sl.liturgicalTheme} · ` : ''}{sl.slots.length} songs
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Setlist Editor (8 cols) */}
          {activeSetlist && (
            <div className="lg:col-span-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div className="space-y-1 flex-1 min-w-[240px]">
                  <input
                    value={activeSetlist.serviceTitle}
                    onChange={e => {
                      const next = setlists.map(s =>
                        s.id === activeSetlist.id ? { ...s, serviceTitle: e.target.value } : s
                      );
                      persistSetlists(next);
                    }}
                    className="w-full bg-transparent text-xl font-black text-white outline-none"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  />
                  <div className="flex flex-wrap gap-2 text-xs text-white/60">
                    <span>🗓️ {activeSetlist.serviceDate}</span>
                    {activeSetlist.liturgicalTheme && <span>• Theme: {activeSetlist.liturgicalTheme}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    for (const slot of activeSetlist.slots) {
                      const found = allSongs.find(s => s.id === slot.songId);
                      if (found) {
                        await saveChurchSong(church.id, {
                          id: found.id,
                          title: found.title,
                          author: found.subtitle,
                          stanzas: found.blocks.map(b => b.lines.join('\n')),
                          key: slot.performanceKey,
                          bpm: slot.bpm,
                        });
                      }
                    }
                    triggerToast(`Synced all ${activeSetlist.slots.length} setlist songs to Stage Live Service!`);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Send size={13} /> Push Entire Setlist to Stage Live
                </button>
              </div>

              {/* Slots List */}
              <div className="space-y-2.5">
                {activeSetlist.slots.length === 0 && (
                  <p className="text-xs text-white/50">No songs in this setlist yet. Add songs from the song gallery.</p>
                )}
                {activeSetlist.slots.map((slot, idx) => {
                  const deptMeta =
                    MUSIC_SUB_DEPARTMENTS.find(d => d.key === slot.assignedSubDept) ||
                    MUSIC_SUB_DEPARTMENTS[0];
                  return (
                    <div
                      key={slot.id}
                      className="rounded-2xl border border-white/10 bg-black/40 p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1 min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-300 font-mono text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
                            {slot.momentInService}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              background: `${deptMeta.badgeColor}22`,
                              color: deptMeta.badgeColor,
                            }}
                          >
                            {deptMeta.emoji} {deptMeta.name}
                          </span>
                        </div>
                        <p
                          className="font-black text-base text-white pl-8"
                          style={{ fontFamily: "'Outfit', sans-serif" }}
                        >
                          {slot.songTitle}
                        </p>
                        <p className="text-xs text-white/60 pl-8">
                          {[slot.leadVocalistOrDirector ? `Lead: ${slot.leadVocalistOrDirector}` : '', slot.notes || '']
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-white/10 font-mono text-xs font-bold text-amber-300">
                          {slot.performanceKey}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-white/5 font-mono text-xs text-white/70">
                          {slot.bpm} BPM
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSongId(slot.songId);
                            setActiveSurface('CHORA_SCRATCHPAD');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white"
                        >
                          Open in Chora
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSlot(slot.id)}
                            className="p-1.5 rounded-lg text-white/40 hover:text-rose-300"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick-Add Song Row */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/50">
                  Quick-Add Song from Hymnal, Gospel or Collective Library
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allSongs.slice(0, 10).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        handleAddSongToActiveSetlist(
                          s,
                          activeSubDept === 'ALL' ? 'music-worship-teams' : activeSubDept
                        )
                      }
                      className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/10 text-xs font-bold text-white inline-flex items-center gap-1"
                    >
                      <Plus size={11} /> {s.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SURFACE 3: GLOBAL PUBLIC-DOMAIN SCORES & NOTATION ARCHIVE
          ===================================================================== */}
      {activeSurface === 'GLOBAL_SCORES_ARCHIVE' && (
        <div className="grid lg:grid-cols-12 gap-4">
          {/* Left Rail: 72 Global Public-Domain Scores Filter & List */}
          <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                  Global Conservatory &amp; Sacred Repertoire
                </span>
                <h3
                  className="text-base font-black text-white"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  Public-Domain Scores Around the Globe ({filteredGlobalScores.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGlobalOnlyVerovio(v => !v)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                  globalOnlyVerovio
                    ? 'bg-emerald-400 text-black border-emerald-300'
                    : 'border-white/15 text-white/65'
                }`}
              >
                {globalOnlyVerovio ? '✓ Interactive MusicXML Only' : 'All Global Scores'}
              </button>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-3 top-2.5 text-white/40" />
              <input
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                placeholder="Search Bach, Handel, Palestrina, Mozart, Chant, region..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {['ALL', 'Medieval', 'Renaissance', 'Baroque', 'Classical', 'Romantic', 'Early 20th Century'].map(
                era => (
                  <button
                    key={era}
                    type="button"
                    onClick={() => setGlobalEraFilter(era)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      globalEraFilter === era
                        ? 'bg-amber-400 text-black'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {era}
                  </button>
                )
              )}
            </div>

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredGlobalScores.map(item => {
                const active = selectedGlobalScore?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedGlobalScore(item)}
                    className={`w-full text-left rounded-2xl p-3 border transition ${
                      active
                        ? 'bg-amber-400/15 border-amber-400'
                        : 'bg-black/30 border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-amber-300">
                        {item.era} · {item.year}
                      </span>
                      {item.mxlUrl && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                          Verovio MusicXML
                        </span>
                      )}
                    </div>
                    <p
                      className="font-black text-sm text-white mt-0.5"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      {item.title}
                    </p>
                    <p className="text-xs text-white/65">
                      {item.composer} · <span className="text-white/45">{item.instrumentation}</span>
                    </p>
                    <p className="text-[10px] text-white/45 mt-0.5">🌍 {item.region}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Viewer: Live Verovio Engraved Score + Audio + Lorea Modal */}
          {selectedGlobalScore && (
            <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                    {selectedGlobalScore.era} · {selectedGlobalScore.region}
                  </span>
                  <h3
                    className="text-xl font-black text-white mt-0.5"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {selectedGlobalScore.title}
                  </h3>
                  <p className="text-xs text-white/65">
                    {selectedGlobalScore.composer} ({selectedGlobalScore.year}) ·{' '}
                    {selectedGlobalScore.instrumentation}
                    {selectedGlobalScore.key ? ` · ${selectedGlobalScore.key}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenLoreaScoreModal(selectedGlobalScore)}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <BookOpen size={13} /> Open Full Score &amp; Audio in Lorea
                  </button>
                  <a
                    href={selectedGlobalScore.imslpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl border border-white/20 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-white/10"
                  >
                    <ExternalLink size={13} /> IMSLP Edition
                  </a>
                </div>
              </div>

              <p className="text-xs text-white/75 leading-relaxed">
                {selectedGlobalScore.historicalContext}
              </p>

              {selectedGlobalScore.mxlUrl ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                    Live Engraved OpenScore CC0 MusicXML (Verovio Renderer)
                  </p>
                  <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/10">
                    <VerovioScore mxlUrl={selectedGlobalScore.mxlUrl} />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center space-y-3">
                  <p className="text-sm font-bold text-white">
                    Full Public-Domain Score Edition Available via IMSLP &amp; Lorea Score Reader
                  </p>
                  <p className="text-xs text-white/60 max-w-md mx-auto">
                    Open the Lorea Score Reader modal to listen to the Internet Archive public-domain recording and view the complete historical score commentary.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpenLoreaScoreModal(selectedGlobalScore)}
                    className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <BookOpen size={13} /> Launch Lorea Score Reader
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {openLoreaScoreModal && (
        <LoreaScoresModal
          initialTrackId={openLoreaScoreModal.id}
          onClose={() => setOpenLoreaScoreModal(null)}
        />
      )}
    </div>
  );
};

export default ChurchMusicDepartmentHub;
