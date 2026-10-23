/**
 * Melos — workspace shell.
 *
 * Owns the production subscription, the room nav, and the skin. Rooms read
 * everything off MelosContext rather than prop-drilling.
 *
 * TIER RULE (see styles/melos.css): paper-tier rooms wrap in `.melos-paper` and
 * take the skin tokens. Instrument-tier rooms wrap in `.melos-instr` and inherit
 * only --mel-accent. Do not cross the streams.
 */

import React, {
  createContext, useContext, useEffect, useMemo, useState, useCallback, Suspense,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PenLine, ListMusic, Layers, LayoutGrid, Disc3, Plus, ChevronLeft,
  Sparkles, Loader2, Drum, Sliders, Briefcase, Music2, Megaphone,
  Mic, MapPin, Truck, Users, FileText, Receipt, CheckSquare, Download,
} from 'lucide-react';
import { UserProfile } from '../../types';
import {
  OverviewTab, CareerImportLaunchTab, EventsLaunchTab,
  AdHubTab, PayrollTab, ContractsTab, InvoicesTab,
  TasksTab, VendorsTab, VenuesTab, PMTab,
} from '../ArtistProjectManager';
import { MusicReleasesTab } from '../music/MusicReleasesTab';
import {
  MelosProduction, MelosSong, MelosArrangement, InspirationPin, SampleCandidate,
  StudioSession, Collaborator, PadSkin, SongTake,
  PAD_SKINS, DEFAULT_SKIN, PRODUCTION_STATUSES,
  subProductions, subSongs, subArrangements, subPins, subSamples, subSessions, subPeople,
  putSong, patchSong, removeSong, putArrangement, patchArrangement, removeArrangement,
  putPin, patchPin, removePin, updateProduction,
  createProduction, seedDemoProduction, buildDemoProduction, newSong, readiness,
} from '../../services/melosService';

import { auth } from '../../services/firebase';
import { newGrooveDoc } from '../../services/melos/beats/grooveDoc';
import { saveGroove } from '../../services/melos/beats/grooveStore';
import { uploadFile } from '../../services/backendService';
import { isDemoMode, subscribeDemoMode } from '../../services/demoMode';
import { useViewport } from '../../hooks/useViewport';
import { toMelosSampleRefs } from './beats/melosSamples';
import { ingestMelosAudioFile, isAudioFile } from './melosAudioImport';
import { useBeatsDoc } from './beats/useBeatsDoc';
import { StudioMenuProvider, StudioMenuBar } from './StudioMenus';
import type { MenuGroup } from './beats/shared/MenuBar';
import { useEngineBridge } from './beats/useEngineBridge';

import PadRoom from './PadRoom';
import TracklistRoom from './TracklistRoom';
import ArrangeRoom from './ArrangeRoom';
import BoardRoom from './BoardRoom';
// Beats & Mastering Desk load on demand.
const BeatsRoom = React.lazy(() => import('./beats/BeatsRoom'));
const ProjectView = React.lazy(() =>
  import('./beats/project/ProjectView').then((m) => ({ default: m.ProjectView })),
);
const ChoraStudioMixer = React.lazy(() => import('../chora/ChoraStudioMixer'));

// ─── Rooms ("Concept to Concert" Pipeline) ──────────────────────────────────

export type ArtistManagerRoom =
  | 'overview'
  | 'releases'
  | 'promote'
  | 'events'
  | 'venues'
  | 'vendors'
  | 'payroll'
  | 'contracts'
  | 'invoices'
  | 'tasks'
  | 'import';

export type MelosRoom =
  | 'pad'
  | 'tracklist'
  | 'arrange'
  | 'board'
  | 'beats'
  | 'master'
  | 'mixer'
  | ArtistManagerRoom;

interface RoomMeta {
  id: MelosRoom;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  /** Which surface tier the room lives on. Drives the wrapper class. */
  tier: 'paper' | 'instrument';
  /** Pipeline stage from Concept to Concert. */
  stage: 'concept' | 'studio' | 'concert';
  /** Optional stage accent color for active pill styling. */
  accent?: string;
}

const ROOMS: RoomMeta[] = [
  // 1. Concept & Creation (Paper Tier)
  { id: 'pad',       label: 'Pad',                  shortLabel: 'Pad',       icon: <PenLine size={13} />,     tier: 'paper',      stage: 'concept' },
  { id: 'tracklist', label: 'Tracklist',            shortLabel: 'Tracks',    icon: <ListMusic size={13} />,   tier: 'paper',      stage: 'concept' },
  { id: 'arrange',   label: 'Arrange',              shortLabel: 'Arrange',   icon: <Layers size={13} />,      tier: 'paper',      stage: 'concept' },
  { id: 'board',     label: 'Board',                shortLabel: 'Board',     icon: <LayoutGrid size={13} />,  tier: 'paper',      stage: 'concept' },
  // 2. Studio, Mastering & Live Mix (Instrument Tier)
  { id: 'beats',     label: 'Chora Studio',         shortLabel: 'Studio',    icon: <Drum size={13} />,        tier: 'instrument', stage: 'studio' },
  { id: 'master',    label: 'Chora Mastering Desk', shortLabel: 'Mastering', icon: <Disc3 size={13} />,       tier: 'instrument', stage: 'studio' },
  { id: 'mixer',     label: 'Chora Mixer',          shortLabel: 'Mixer',     icon: <Sliders size={13} />,     tier: 'instrument', stage: 'studio' },
  // 3. Release, Promotion, Touring & Operations — "Concept to Concert" (Artist Manager Tools)
  { id: 'overview',  label: 'Artist Manager',       shortLabel: 'Manager',   icon: <Briefcase size={13} />,   tier: 'instrument', stage: 'concert', accent: '#FF8C00' },
  { id: 'releases',  label: 'Releases',             shortLabel: 'Releases',  icon: <Music2 size={13} />,      tier: 'instrument', stage: 'concert', accent: '#FF8C00' },
  { id: 'promote',   label: 'Promote',              shortLabel: 'Promote',   icon: <Megaphone size={13} />,   tier: 'instrument', stage: 'concert', accent: '#6366f1' },
  { id: 'events',    label: 'Events & Tour',        shortLabel: 'Tour',      icon: <Mic size={13} />,         tier: 'instrument', stage: 'concert', accent: '#FF8C00' },
  { id: 'venues',    label: 'Venues',               shortLabel: 'Venues',    icon: <MapPin size={13} />,      tier: 'instrument', stage: 'concert', accent: '#ef4444' },
  { id: 'vendors',   label: 'Vendors & Crew',       shortLabel: 'Vendors',   icon: <Truck size={13} />,       tier: 'instrument', stage: 'concert', accent: '#f59e0b' },
  { id: 'payroll',   label: 'Band Payroll',         shortLabel: 'Payroll',   icon: <Users size={13} />,       tier: 'instrument', stage: 'concert', accent: '#FF8C00' },
  { id: 'contracts', label: 'Contracts',            shortLabel: 'Contracts', icon: <FileText size={13} />,    tier: 'instrument', stage: 'concert', accent: '#a855f7' },
  { id: 'invoices',  label: 'Invoices',             shortLabel: 'Invoices',  icon: <Receipt size={13} />,     tier: 'instrument', stage: 'concert', accent: '#10b981' },
  { id: 'tasks',     label: 'Tasks',                shortLabel: 'Tasks',     icon: <CheckSquare size={13} />, tier: 'instrument', stage: 'concert', accent: '#3b82f6' },
  { id: 'import',    label: 'Import Work',          shortLabel: 'Import',    icon: <Download size={13} />,    tier: 'instrument', stage: 'concert', accent: '#a855f7' },
];

const ARTIST_MANAGER_ROOM_IDS = new Set<string>([
  'overview', 'releases', 'promote', 'events', 'venues', 'vendors',
  'payroll', 'contracts', 'invoices', 'tasks', 'import',
]);

// ─── Context ────────────────────────────────────────────────────────────────

interface MelosCtx {
  prodId: string;
  production: MelosProduction | null;
  songs: MelosSong[];
  arrangements: MelosArrangement[];
  pins: InspirationPin[];
  samples: SampleCandidate[];
  sessions: StudioSession[];
  people: Collaborator[];
  selectedSongId: string | null;
  selectSong: (id: string | null) => void;
  selectedSong: MelosSong | null;
  saveSong: (s: MelosSong) => void;
  editSong: (id: string, patch: Partial<MelosSong>) => void;
  dropSong: (id: string) => void;
  addSong: () => void;
  saveArrangement: (a: MelosArrangement) => void;
  editArrangement: (id: string, patch: Partial<MelosArrangement>) => void;
  dropArrangement: (id: string) => void;
  savePin: (p: InspirationPin) => void;
  editPin: (id: string, patch: Partial<InspirationPin>) => void;
  dropPin: (id: string) => void;
  goRoom: (r: MelosRoom) => void;
  /** Import an audio file directly onto an existing song (sets trackRef, adds take, computes Feel). */
  importAudioToSong: (songId: string, file: File) => Promise<void>;
  /** Import one or more audio files as new songs (or attach to arrangement if arrangementId passed). */
  importAudioFilesAsSongs: (files: FileList | File[], opts?: { arrangementId?: string }) => Promise<string[]>;
  /** Append a song to a specific arrangement (or the primary arrangement). */
  addSongToArrangement: (songId: string, arrangementId?: string) => void;
  /** Open the Chora Mastering Desk tab, optionally pre-loading a specific arrangement. */
  openInMasteringDesk: (arrangementId?: string) => void;
  activeArrangementId: string | null;
  setActiveArrangementId: (id: string | null) => void;
}

const Ctx = createContext<MelosCtx | null>(null);

export const useMelos = (): MelosCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMelos must be used inside MelosWorkspace');
  return v;
};

// ─── Shared bits rooms reuse ────────────────────────────────────────────────

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`melos-label m-0 ${className}`}>{children}</p>
);

/** Love rating — how much the artist likes it FOR THIS PROJECT. Not quality. */
export const Hearts: React.FC<{ value: number; onChange?: (v: number) => void; size?: number }> = ({ value, onChange, size = 13 }) => (
  <div className="flex gap-[3px]" role={onChange ? 'group' : undefined} aria-label="How much I love it">
    {[1, 2, 3, 4, 5].map(n => (
      <button
        key={n}
        type="button"
        disabled={!onChange}
        onClick={() => onChange?.(n === value ? n - 1 : n)}
        aria-label={`${n} of 5`}
        aria-pressed={n <= value}
        className={`leading-none transition-opacity ${onChange ? 'cursor-pointer hover:opacity-100' : 'cursor-default'}`}
        style={{ fontSize: size, color: 'var(--mel-accent)', opacity: n <= value ? 1 : 0.2, background: 'none', border: 0, padding: 0 }}
      >♥</button>
    ))}
  </div>
);

// ─── Beats host (Chora Studio DAW) ──────────────────────────────────────────

const BeatsHost: React.FC<{ musicLabAdmin?: boolean }> = ({ musicLabAdmin }) => {
  const { prodId, samples, selectedSong, editSong } = useMelos();
  const melosSamples = useMemo(() => toMelosSampleRefs(samples), [samples]);

  const onRenderTake = useCallback(async (take: { blob: Blob; name: string; durationSec: number }) => {
    const song = selectedSong;
    if (!song) return;
    let url: string | undefined;
    try {
      const uid = auth.currentUser?.uid;
      if (uid) url = await uploadFile(`personal/${uid}/melos/${prodId}/takes/${song.id}-${Date.now()}.wav`, take.blob);
    } catch { /* keep the take even if the upload fails — local blob URL fallback */ }
    if (!url) url = URL.createObjectURL(take.blob);
    const next: SongTake = {
      id: `take_${Date.now().toString(36)}`,
      label: take.name,
      url,
      source: 'BEATS',
      fromBeats: true,
      durationSec: take.durationSec,
      createdAt: Date.now(),
    };
    const advanced = song.state === 'SPARK' || song.state === 'WRITING';
    editSong(song.id, {
      takes: [...(song.takes || []), next],
      trackRef: song.trackRef?.url ? song.trackRef : {
        title: take.name,
        url,
        durationSec: Math.round(take.durationSec),
        source: 'UPLOAD',
      },
      ...(advanced ? { state: 'DEMO' as MelosSong['state'] } : {}),
    });
  }, [prodId, selectedSong, editSong]);

  return (
    <div className="relative h-full">
      <Suspense fallback={<div className="h-full grid place-items-center" style={{ background: '#0A0A0D' }}><Loader2 size={20} className="animate-spin text-white/40" /></div>}>
        <BeatsRoom
          key={selectedSong?.grooveId || selectedSong?.id || 'blank'}
          embedded
          onClose={() => { /* the shell's own rail owns navigation */ }}
          production={{ prodId }}
          payload={selectedSong?.grooveId ? { grooveId: selectedSong.grooveId, productionId: prodId } : null}
          melosSamples={melosSamples}
          onRenderTake={selectedSong ? (t) => { void onRenderTake(t); } : undefined}
          takeTargetName={selectedSong?.title}
          musicLabAdmin={musicLabAdmin}
        />
      </Suspense>
    </div>
  );
};

// ─── Chora Mastering Desk host ──────────────────────────────────────────────

const MasteringDeskHost: React.FC = () => {
  const { prodId, selectedSong, songs, arrangements, activeArrangementId, goRoom } = useMelos();
  const { doc, mutate } = useBeatsDoc(selectedSong?.grooveId, prodId);
  const snap = useEngineBridge();

  return (
    <div className="relative h-full flex flex-col" style={{ background: '#0A0A0D' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 border-b border-white/[0.06] bg-[#0E0E13] shrink-0">
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          <Disc3 size={13} className="text-[#D0BCFF]" />
          <span className="font-bold uppercase tracking-wider text-white/85">Chora Mastering Desk</span>
          <span className="hidden sm:inline text-white/40">· Final arrangement mastering & distribution prep</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => goRoom('releases')}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#FF8C00]/15 hover:bg-[#FF8C00]/25 text-[#FF8C00] border border-[#FF8C00]/30 transition"
          >
            <Music2 size={11} />
            Releases & Distribution →
          </button>
          <button
            type="button"
            onClick={() => goRoom('events')}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/75 border border-white/10 transition"
          >
            <Mic size={11} />
            Tour & Shows →
          </button>
          <button
            type="button"
            onClick={() => goRoom('overview')}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/75 border border-white/10 transition"
          >
            <Briefcase size={11} />
            Artist Manager
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="h-full grid place-items-center" style={{ background: '#0A0A0D' }}><Loader2 size={20} className="animate-spin text-white/40" /></div>}>
          <ProjectView
            doc={doc}
            snap={snap}
            onMutate={mutate}
            productionId={prodId}
            melosSongs={songs}
            melosArrangements={arrangements}
            activeArrangementId={activeArrangementId}
          />
        </Suspense>
      </div>
    </div>
  );
};

// ─── Artist Manager ("Concept to Concert") host ─────────────────────────────

const ArtistManagerHost: React.FC<{
  tab: ArtistManagerRoom;
  currentUser?: UserProfile | null;
  onSwitchRoom: (r: MelosRoom) => void;
}> = ({ tab, currentUser, onSwitchRoom }) => {
  const { production, songs, arrangements } = useMelos();
  const primaryArr = useMemo(
    () => arrangements.find(a => a.isPrimary) || arrangements[0] || null,
    [arrangements],
  );
  const finishedCount = useMemo(
    () => songs.filter(s => s.state === 'FINISHED' || s.state === 'MIXING').length,
    [songs],
  );

  const handleOverviewSwitch = useCallback((next: PMTab) => {
    if (next === 'productions') { onSwitchRoom('tracklist'); return; }
    if (next === 'boards') { onSwitchRoom('board'); return; }
    if (ARTIST_MANAGER_ROOM_IDS.has(next)) {
      onSwitchRoom(next as MelosRoom);
    }
  }, [onSwitchRoom]);

  const renderManagerTab = () => {
    switch (tab) {
      case 'overview':  return <OverviewTab onSwitchTab={handleOverviewSwitch} />;
      case 'releases':  return <MusicReleasesTab currentUser={currentUser} />;
      case 'promote':   return <AdHubTab />;
      case 'events':    return <EventsLaunchTab />;
      case 'venues':    return <VenuesTab />;
      case 'vendors':   return <VendorsTab />;
      case 'payroll':   return <PayrollTab />;
      case 'contracts': return <ContractsTab />;
      case 'invoices':  return <InvoicesTab />;
      case 'tasks':     return <TasksTab />;
      case 'import':    return <CareerImportLaunchTab />;
      default:          return <OverviewTab onSwitchTab={handleOverviewSwitch} />;
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar text-white" style={{ background: '#0A0A0D' }}>
      {/* Concept-to-Concert Pipeline Context Bar */}
      <div className="border-b border-white/[0.06] bg-[#0E0E13]/90 backdrop-blur-xl px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30 shrink-0">
              Concept to Concert
            </span>
            <span className="text-xs font-bold text-white truncate">
              {production?.title || 'Active Production'}
            </span>
            <span className="text-[11px] text-white/45 hidden sm:inline">
              · {songs.length} track{songs.length === 1 ? '' : 's'} ({finishedCount} mix/master ready)
              {primaryArr ? ` · Sequence: ${primaryArr.name}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSwitchRoom('master')}
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/75 border border-white/10 transition"
            >
              ← Mastering Desk
            </button>
            <button
              type="button"
              onClick={() => onSwitchRoom('releases')}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition ${
                tab === 'releases'
                  ? 'bg-[#FF8C00]/20 text-[#FF8C00] border-[#FF8C00]/40'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/65 border-white/10'
              }`}
            >
              Release Record
            </button>
            <button
              type="button"
              onClick={() => onSwitchRoom('events')}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition ${
                tab === 'events'
                  ? 'bg-[#FF8C00]/20 text-[#FF8C00] border-[#FF8C00]/40'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/65 border-white/10'
              }`}
            >
              Book Tour & Shows →
            </button>
          </div>
        </div>
      </div>

      {/* Hosted Artist Manager Tool Surface */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {renderManagerTab()}
      </div>
    </div>
  );
};

// ─── Shell ──────────────────────────────────────────────────────────────────

interface Props {
  currentUser?: UserProfile | null;
  /** Open straight into a production. */
  initialProductionId?: string;
  initialRoom?: MelosRoom;
  onBack?: () => void;
}

const MelosWorkspace: React.FC<Props> = ({ currentUser, initialProductionId, initialRoom, onBack }) => {
  const uid = currentUser?.uid || '';
  const vp = useViewport();

  const [productions, setProductions] = useState<MelosProduction[]>([]);
  const [prodId, setProdId] = useState<string>(initialProductionId || '');
  const [room, setRoom] = useState<MelosRoom>(initialRoom || 'pad');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [activeArrangementId, setActiveArrangementId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [demoOn, setDemoOn] = useState(() => isDemoMode());
  useEffect(() => subscribeDemoMode(setDemoOn), []);

  const [songs, setSongs] = useState<MelosSong[]>([]);
  const [arrangements, setArrangements] = useState<MelosArrangement[]>([]);
  const [pins, setPins] = useState<InspirationPin[]>([]);
  const [samples, setSamples] = useState<SampleCandidate[]>([]);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [people, setPeople] = useState<Collaborator[]>([]);

  const demoSeed = useMemo(() => buildDemoProduction(uid || 'demo_owner', currentUser?.displayName || 'You'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const DEMO_ID = demoSeed.production.id;

  // Productions list — falls back to the demo when the artist has none yet.
  useEffect(() => {
    if (!uid) {
      setProductions(demoOn ? [demoSeed.production] : []);
      setProdId(cur => cur || (demoOn ? DEMO_ID : ''));
      setLoading(false);
      return;
    }
    const un = subProductions(uid, rows => {
      if (rows.length === 0) {
        setProductions(demoOn ? [demoSeed.production] : []);
        setProdId(cur => cur || (demoOn ? DEMO_ID : ''));
      } else {
        setProductions(rows);
        setProdId(cur => cur || rows[0]?.id || '');
      }
      setLoading(false);
    });
    return un;
  }, [uid, demoSeed, DEMO_ID, demoOn]);

  // Subcollections for the open production
  useEffect(() => {
    if (prodId === DEMO_ID) {
      setSongs(demoSeed.songs); setArrangements(demoSeed.arrangements);
      setPins(demoSeed.pins); setSamples(demoSeed.samples);
      setSessions(demoSeed.sessions); setPeople(demoSeed.people);
      return;
    }
    if (!prodId) {
      setSongs([]); setArrangements([]); setPins([]); setSamples([]); setSessions([]); setPeople([]);
      return;
    }
    const uns = [
      subSongs(prodId, setSongs),
      subArrangements(prodId, setArrangements),
      subPins(prodId, setPins),
      subSamples(prodId, setSamples),
      subSessions(prodId, setSessions),
      subPeople(prodId, setPeople),
    ];
    return () => uns.forEach(u => { try { u(); } catch {} });
  }, [prodId, DEMO_ID, demoSeed]);

  const production = useMemo(
    () => productions.find(p => p.id === prodId) || null,
    [productions, prodId],
  );

  const skin: PadSkin = production?.padSkin || DEFAULT_SKIN;

  // Keep a valid selection as the song list changes.
  useEffect(() => {
    if (!songs.length) { setSelectedSongId(null); return; }
    setSelectedSongId(cur => (cur && songs.some(s => s.id === cur) ? cur : songs[0].id));
  }, [songs]);

  const selectedSong = useMemo(
    () => songs.find(s => s.id === selectedSongId) || null,
    [songs, selectedSongId],
  );

  // ── Optimistic + Firestore Mutators ────────────────────────────────────────
  const canWrite = useCallback((id: string) => !!id && id !== DEMO_ID, [DEMO_ID]);

  const saveSong = useCallback((s: MelosSong) => {
    setSongs(cur => (cur.some(x => x.id === s.id) ? cur.map(x => (x.id === s.id ? s : x)) : [...cur, s]));
    if (canWrite(prodId)) void putSong(prodId, s);
  }, [prodId, canWrite]);

  const editSong = useCallback((id: string, patch: Partial<MelosSong>) => {
    setSongs(cur => cur.map(s => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)));
    if (canWrite(prodId)) void patchSong(prodId, id, patch);
  }, [prodId, canWrite]);

  const dropSong = useCallback((id: string) => {
    setSongs(cur => cur.filter(s => s.id !== id));
    if (canWrite(prodId)) void removeSong(prodId, id);
  }, [prodId, canWrite]);

  const addSong = useCallback(() => {
    const groove = newGrooveDoc(auth.currentUser?.uid || '', 'Untitled');
    const s = newSong(songs.length, { title: 'Untitled', grooveId: groove.id });
    setSongs(cur => [...cur, s]);
    if (canWrite(prodId)) {
      void putSong(prodId, s);
      void saveGroove(prodId, groove);
    }
    setSelectedSongId(s.id);
    setRoom('pad');
  }, [prodId, songs.length, canWrite]);

  const saveArrangement = useCallback((a: MelosArrangement) => {
    setArrangements(cur => (cur.some(x => x.id === a.id) ? cur.map(x => (x.id === a.id ? a : x)) : [...cur, a]));
    if (canWrite(prodId)) void putArrangement(prodId, a);
  }, [prodId, canWrite]);

  const editArrangement = useCallback((id: string, patch: Partial<MelosArrangement>) => {
    setArrangements(cur => cur.map(a => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)));
    if (canWrite(prodId)) void patchArrangement(prodId, id, patch);
  }, [prodId, canWrite]);

  const dropArrangement = useCallback((id: string) => {
    setArrangements(cur => cur.filter(a => a.id !== id));
    if (canWrite(prodId)) void removeArrangement(prodId, id);
  }, [prodId, canWrite]);

  const savePin = useCallback((p: InspirationPin) => {
    setPins(cur => (cur.some(x => x.id === p.id) ? cur.map(x => (x.id === p.id ? p : x)) : [p, ...cur]));
    if (canWrite(prodId)) void putPin(prodId, p);
  }, [prodId, canWrite]);

  const editPin = useCallback((id: string, patch: Partial<InspirationPin>) => {
    setPins(cur => cur.map(p => (p.id === id ? { ...p, ...patch } : p)));
    if (canWrite(prodId)) void patchPin(prodId, id, patch);
  }, [prodId, canWrite]);

  const dropPin = useCallback((id: string) => {
    setPins(cur => cur.filter(p => p.id !== id));
    if (canWrite(prodId)) void removePin(prodId, id);
  }, [prodId, canWrite]);

  // ── Audio Ingestion & Arrangement Helpers ──────────────────────────────────

  const importAudioToSong = useCallback(async (songId: string, file: File) => {
    const ingested = await ingestMelosAudioFile(file);
    const take: SongTake = {
      id: `take_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      label: ingested.title,
      url: ingested.url,
      source: 'UPLOAD',
      durationSec: ingested.durationSec,
      createdAt: Date.now(),
    };
    setSongs(cur => cur.map(s => {
      if (s.id !== songId) return s;
      const nextTakes = [take, ...(s.takes || [])];
      const nextState = s.state === 'SPARK' || s.state === 'WRITING' ? 'DEMO' : s.state;
      const patch: Partial<MelosSong> = {
        trackRef: {
          title: ingested.title,
          url: ingested.url,
          durationSec: ingested.durationSec,
          source: 'UPLOAD',
        },
        takes: nextTakes,
        durationSec: s.durationSec || ingested.durationSec,
        tempo: s.tempo || ingested.feel?.bpm,
        feel: ingested.feel || s.feel,
        state: nextState,
      };
      if (canWrite(prodId)) void patchSong(prodId, songId, patch);
      return { ...s, ...patch, updatedAt: Date.now() };
    }));
  }, [prodId, canWrite]);

  const addSongToArrangement = useCallback((songId: string, arrangementId?: string) => {
    setArrangements(cur => {
      const target = (arrangementId && cur.find(a => a.id === arrangementId)) || cur.find(a => a.isPrimary) || cur[0];
      if (!target) {
        const now = Date.now();
        const created: MelosArrangement = {
          id: `arr_${now.toString(36)}`,
          name: 'Album Sequence A',
          notes: 'Primary running order',
          songIds: [songId],
          isPrimary: true,
          createdAt: now,
          updatedAt: now,
        };
        if (canWrite(prodId)) void putArrangement(prodId, created);
        return [created];
      }
      if (target.songIds.includes(songId)) return cur;
      const nextSongIds = [...target.songIds, songId];
      if (canWrite(prodId)) void patchArrangement(prodId, target.id, { songIds: nextSongIds });
      return cur.map(a => (a.id === target.id ? { ...a, songIds: nextSongIds, updatedAt: Date.now() } : a));
    });
  }, [prodId, canWrite]);

  const importAudioFilesAsSongs = useCallback(async (
    files: FileList | File[],
    opts?: { arrangementId?: string },
  ): Promise<string[]> => {
    const audioFiles = Array.from(files).filter(isAudioFile);
    const createdIds: string[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const ingested = await ingestMelosAudioFile(file);
      const groove = newGrooveDoc(auth.currentUser?.uid || '', ingested.title);
      const take: SongTake = {
        id: `take_${Date.now().toString(36)}_${i}`,
        label: ingested.title,
        url: ingested.url,
        source: 'UPLOAD',
        durationSec: ingested.durationSec,
        createdAt: Date.now(),
      };
      const song = newSong(songs.length + i, {
        title: ingested.title,
        commitment: 'VERIFIED',
        state: 'DEMO',
        grooveId: groove.id,
        durationSec: ingested.durationSec,
        tempo: ingested.feel?.bpm,
        feel: ingested.feel,
        trackRef: {
          title: ingested.title,
          url: ingested.url,
          durationSec: ingested.durationSec,
          source: 'UPLOAD',
        },
        takes: [take],
      });
      createdIds.push(song.id);
      setSongs(cur => [...cur, song]);
      if (canWrite(prodId)) {
        void putSong(prodId, song);
        void saveGroove(prodId, groove);
      }
      if (opts?.arrangementId) {
        addSongToArrangement(song.id, opts.arrangementId);
      }
    }
    if (createdIds.length > 0) {
      setSelectedSongId(createdIds[0]);
    }
    return createdIds;
  }, [songs.length, prodId, canWrite, addSongToArrangement]);

  const openInMasteringDesk = useCallback((arrangementId?: string) => {
    if (arrangementId) setActiveArrangementId(arrangementId);
    setRoom('master');
  }, []);

  const ctx: MelosCtx = {
    prodId, production, songs, arrangements, pins, samples, sessions, people,
    selectedSongId, selectSong: setSelectedSongId, selectedSong,
    saveSong, editSong, dropSong, addSong,
    saveArrangement, editArrangement, dropArrangement,
    savePin, editPin, dropPin,
    goRoom: setRoom,
    importAudioToSong,
    importAudioFilesAsSongs,
    addSongToArrangement,
    openInMasteringDesk,
    activeArrangementId,
    setActiveArrangementId,
  };

  const startBlank = async () => {
    if (!uid) return;
    setSeeding(true);
    try {
      const p = await createProduction(uid, { title: 'Untitled Production', artistName: currentUser?.displayName });
      setProductions(cur => (cur.some(x => x.id === p.id) ? cur : [p, ...cur]));
      setProdId(p.id);
      setRoom('pad');
    } finally { setSeeding(false); }
  };

  const startDemo = async () => {
    if (!uid) return;
    setSeeding(true);
    try {
      const seed = await seedDemoProduction(uid, currentUser?.displayName);
      setProductions(cur => (cur.some(x => x.id === seed.production.id) ? cur : [seed.production, ...cur]));
      setProdId(seed.production.id);
      setRoom('pad');
    } finally { setSeeding(false); }
  };

  const setSkin = (s: PadSkin) => {
    if (canWrite(prodId)) updateProduction(prodId, { padSkin: s });
    setProductions(cur => cur.map(p => (p.id === prodId ? { ...p, padSkin: s } : p)));
  };

  const ready = useMemo(() => readiness(songs, samples), [songs, samples]);
  const statusMeta = PRODUCTION_STATUSES.find(s => s.key === production?.status);

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!uid && !production && !loading) {
    return (
      <div className="melos melos-paper min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <Disc3 size={36} style={{ color: 'var(--mel-accent)' }} className="mx-auto mb-4 opacity-70" />
          <h1 className="text-2xl font-semibold m-0" style={{ color: 'var(--mel-ink)' }}>Chora Studio</h1>
          <p className="text-[10px] uppercase font-bold tracking-widest text-amber-400 mt-1">
            Powered by Melos
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--mel-dim)' }}>
            Sign in to start a production.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="melos melos-paper min-h-screen flex items-center justify-center">
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--mel-faint)' }} />
      </div>
    );
  }

  if (!production) {
    return (
      <div className="melos melos-paper min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <p className="melos-label mb-3">Chora · Production</p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-white">
            Chora Studio
          </h1>
          <p className="text-[10px] uppercase font-bold tracking-widest text-amber-400 mt-1">
            Powered by the Melos Intelligence Engine
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--mel-dim)' }}>
            The room where an album gets made, before it's an album. Write, sequence,
            collect what caught your ear, and keep the whole record in one place.
          </p>
          <div className="flex flex-col gap-2 mt-7">
            <button
              onClick={startBlank}
              disabled={seeding}
              className="px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-[0.16em] transition-opacity disabled:opacity-50"
              style={{ background: 'var(--pj-grad-brand, linear-gradient(120deg,#6B0099,#D40055))', color: '#fff', border: 0 }}
            >
              {seeding ? 'Opening…' : 'Start a production'}
            </button>
            {demoOn && (
              <button
                onClick={startDemo}
                disabled={seeding}
                className="px-5 py-3 rounded-2xl text-xs font-semibold uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                style={{ background: 'var(--mel-paper)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
              >
                <Sparkles size={12} className="inline mr-2 -mt-[2px]" />
                Look around a finished one
              </button>
            )}
          </div>
          {onBack && (
            <button onClick={onBack} className="mt-6 text-[11px] tracking-wider uppercase" style={{ color: 'var(--mel-faint)', background: 'none', border: 0 }}>
              Back to Chora
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeRoom = ROOMS.find(r => r.id === room) || ROOMS[0];

  // The shell's half of the studio menu bar — what's true in every environment. The room on
  // screen merges its own File / Edit / View items (and any menus of its own) underneath.
  const shellMenus: MenuGroup[] = [
    {
      label: 'File',
      items: [
        { id: 'shell-new-production', label: 'New production', disabled: seeding, onSelect: () => { void startBlank(); } },
        { id: 'shell-new-song', label: 'New song', onSelect: addSong },
        ...(productions.length > 1 ? ['sep' as const, ...productions.map(p => ({
          id: `shell-prod-${p.id}`, label: p.title || 'Untitled production', checked: p.id === prodId, onSelect: () => setProdId(p.id),
        }))] : []),
        ...(onBack ? ['sep' as const, { id: 'shell-back', label: 'Back to Chora', onSelect: onBack }] : []),
      ],
    },
    {
      label: 'View',
      items: [
        ...ROOMS.filter(r => r.stage !== 'concert').map(r => ({ id: `shell-room-${r.id}`, label: r.label, checked: r.id === room, onSelect: () => setRoom(r.id) })),
        'sep' as const,
        ...PAD_SKINS.map(s => ({ id: `shell-skin-${s.key}`, label: `Skin · ${s.label}`, checked: skin === s.key, onSelect: () => setSkin(s.key) })),
      ],
    },
    {
      label: 'Window',
      items: ROOMS.filter(r => r.stage === 'concert').map(r => ({ id: `shell-room-${r.id}`, label: r.label, checked: r.id === room, onSelect: () => setRoom(r.id) })),
    },
  ];

  return (
    <Ctx.Provider value={ctx}>
     <StudioMenuProvider>
      <div className={`melos flex flex-col ${vp.isPhone ? 'fixed inset-0 z-[90]' : 'min-h-screen'}`} data-skin={skin}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header
          className="flex items-center gap-2.5 px-3 sm:px-6 py-2.5 border-b flex-wrap shrink-0"
          style={{ borderColor: 'var(--mel-edge)', background: 'var(--mel-rail)' }}
        >
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to Chora"
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
            >
              <ChevronLeft size={15} />
            </button>
          )}

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[12px] sm:text-[13px] font-bold tracking-[0.16em] uppercase shrink-0" style={{ color: 'var(--mel-accent)' }}>Chora Studio</span>
            <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400/90 bg-amber-500/10 hidden md:inline-block shrink-0">Powered by Melos</span>
            <span className="text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--mel-ink)' }}>{production.title}</span>
            {production.workingTitle && !vp.isPhone && (
              <span className="melos-hand text-[13px] hidden md:inline shrink-0">— {production.workingTitle}</span>
            )}
          </div>

          {/* The studio menu bar — the environment below decides most of what's in it. */}
          <div className="order-last w-full sm:order-none sm:w-auto min-w-0 overflow-x-auto no-scrollbar">
            <StudioMenuBar base={shellMenus} />
          </div>

          {statusMeta && !vp.isPhone && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full shrink-0"
              style={{ background: `${statusMeta.color}22`, color: statusMeta.color }}
            >{statusMeta.label}</span>
          )}

          <div className="flex-1" />

          {/* Readiness — stated plainly, never as a shaming bar. */}
          <span className="text-[10px] tracking-wider hidden lg:inline" style={{ color: 'var(--mel-faint)' }}>
            {ready.finished} of {ready.onRecord.length} finished
            {ready.blocked.length > 0 && (
              <span style={{ color: 'var(--mel-warn)' }}> · {ready.blocked.length} sample{ready.blocked.length > 1 ? 's' : ''} to clear</span>
            )}
          </span>

          {/* Skin switcher */}
          <div className="flex items-center gap-1 rounded-full p-1 shrink-0" style={{ background: 'var(--mel-hover)' }}>
            {PAD_SKINS.map(s => (
              <button
                key={s.key}
                onClick={() => setSkin(s.key)}
                title={s.blurb}
                aria-pressed={skin === s.key}
                className="w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-all"
                style={{
                  background: s.ground,
                  border: skin === s.key ? `1.5px solid ${s.accent}` : '1.5px solid transparent',
                  boxShadow: skin === s.key ? `0 0 10px ${s.accent}55` : 'none',
                }}
              >
                <span className="sr-only">{s.label}</span>
              </button>
            ))}
          </div>

          {productions.length > 1 && (
            <select
              value={prodId}
              onChange={e => setProdId(e.target.value)}
              aria-label="Switch production"
              className="text-[11px] rounded-lg px-2 py-1.5 shrink-0 max-w-[140px]"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
            >
              {productions.map(p => <option key={p.id} value={p.id} style={{ background: '#111' }}>{p.title}</option>)}
            </select>
          )}
        </header>

        {/* ── Desktop Room nav ("Concept to Concert" Pipeline) ────────────── */}
        {!vp.isPhone && (
          <nav
            className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b overflow-x-auto no-scrollbar shrink-0"
            style={{ borderColor: 'var(--mel-edge)', background: 'var(--mel-rail)' }}
          >
            {ROOMS.map((r, idx) => {
              const on = r.id === room;
              const prevStage = idx > 0 ? ROOMS[idx - 1].stage : null;
              const showStageHeader = r.stage !== prevStage;
              const isInstrument = r.tier === 'instrument' && r.stage === 'studio';
              const isConcert = r.stage === 'concert';
              const accentColor = r.accent || '#FF8C00';

              return (
                <React.Fragment key={r.id}>
                  {showStageHeader && idx > 0 && (
                    <div
                      className="h-5 w-[1px] mx-1.5 shrink-0"
                      style={{ background: 'var(--mel-edge)' }}
                      aria-hidden="true"
                    />
                  )}
                  {showStageHeader && r.stage === 'concert' && (
                    <span
                      className="text-[9px] font-black uppercase tracking-[0.18em] px-2 py-1 rounded-md shrink-0 select-none"
                      style={{
                        background: 'rgba(255,140,0,0.12)',
                        color: '#FF8C00',
                        border: '1px solid rgba(255,140,0,0.28)',
                      }}
                      title="Concept to Concert — Release, Promotion, Touring & Artist Operations"
                    >
                      Concept → Concert
                    </span>
                  )}
                  <button
                    onClick={() => setRoom(r.id)}
                    aria-current={on ? 'page' : undefined}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap transition-colors shrink-0"
                    style={{
                      background: on
                        ? isConcert
                          ? `${accentColor}24`
                          : isInstrument
                          ? 'rgba(208,188,255,0.14)'
                          : 'var(--mel-hover)'
                        : 'transparent',
                      color: on
                        ? isConcert
                          ? accentColor
                          : isInstrument
                          ? '#D0BCFF'
                          : 'var(--mel-accent)'
                        : 'var(--mel-faint)',
                      border: on
                        ? isConcert
                          ? `1px solid ${accentColor}55`
                          : isInstrument
                          ? '1px solid rgba(208,188,255,0.32)'
                          : '1px solid transparent'
                        : '1px solid transparent',
                    }}
                  >
                    {r.icon}{r.label}
                  </button>
                </React.Fragment>
              );
            })}
            <div className="flex-1 min-w-[12px]" />
            <button
              onClick={addSong}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap shrink-0"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
            >
              <Plus size={12} />New song
            </button>
          </nav>
        )}

        {/* ── Room Surface ────────────────────────────────────────────────── */}
        <div className={`flex-1 min-h-0 overflow-hidden ${activeRoom.tier === 'paper' ? 'melos-paper' : 'melos-instr'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={room}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="h-full"
            >
              {room === 'pad'       && <PadRoom />}
              {room === 'tracklist' && <TracklistRoom />}
              {room === 'arrange'   && <ArrangeRoom />}
              {room === 'board'     && <BoardRoom />}
              {room === 'beats'     && <BeatsHost musicLabAdmin={currentUser?.role === 'admin' || currentUser?.email?.toLowerCase() === 'kmoody2003@gmail.com'} />}
              {room === 'master'    && <MasteringDeskHost />}
              {room === 'mixer'     && (
                <Suspense fallback={<div className="h-full grid place-items-center bg-[#090A0F]"><div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /></div>}>
                  <ChoraStudioMixer onClose={() => setRoom('beats')} embedded={true} />
                </Suspense>
              )}
              {ARTIST_MANAGER_ROOM_IDS.has(room) && (
                <ArtistManagerHost
                  tab={room as ArtistManagerRoom}
                  currentUser={currentUser}
                  onSwitchRoom={setRoom}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Mobile Bottom Room Navigation Bar ───────────────────────────── */}
        {vp.isPhone && (
          <nav
            className="flex items-center gap-1 px-2 py-1.5 border-t overflow-x-auto no-scrollbar shrink-0"
            style={{
              borderColor: 'var(--mel-edge)',
              background: 'var(--mel-rail)',
              paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))',
            }}
          >
            {ROOMS.map((r, idx) => {
              const on = r.id === room;
              const prevStage = idx > 0 ? ROOMS[idx - 1].stage : null;
              const showDivider = idx > 0 && r.stage !== prevStage;
              const isConcert = r.stage === 'concert';
              const accentColor = r.accent || '#FF8C00';
              return (
                <React.Fragment key={r.id}>
                  {showDivider && (
                    <div
                      className="h-6 w-[1px] mx-0.5 shrink-0"
                      style={{ background: 'var(--mel-edge)' }}
                      aria-hidden="true"
                    />
                  )}
                  <button
                    onClick={() => setRoom(r.id)}
                    aria-current={on ? 'page' : undefined}
                    className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-xl min-w-[54px] shrink-0 transition-colors"
                    style={{
                      background: on
                        ? isConcert
                          ? `${accentColor}24`
                          : 'var(--mel-hover)'
                        : 'transparent',
                      color: on
                        ? isConcert
                          ? accentColor
                          : 'var(--mel-accent)'
                        : 'var(--mel-faint)',
                      border: 0,
                    }}
                  >
                    {r.icon}
                    <span className="text-[9px] font-bold uppercase tracking-wider leading-none">{r.shortLabel}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        )}
      </div>
     </StudioMenuProvider>
    </Ctx.Provider>
  );
};

export default MelosWorkspace;
