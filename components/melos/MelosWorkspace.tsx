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
  Sparkles, Loader2, Drum,
} from 'lucide-react';
import { UserProfile } from '../../types';
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
import { uploadFile } from '../../services/backendService';
import { useViewport } from '../../hooks/useViewport';
import { toMelosSampleRefs } from './beats/melosSamples';

import PadRoom from './PadRoom';
import TracklistRoom from './TracklistRoom';
import ArrangeRoom from './ArrangeRoom';
import BoardRoom from './BoardRoom';
// Beats is heavy (audio engine + worklet + four views) — load it only when its room opens.
const BeatsRoom = React.lazy(() => import('./beats/BeatsRoom'));

// ─── Rooms ──────────────────────────────────────────────────────────────────

export type MelosRoom = 'pad' | 'tracklist' | 'arrange' | 'board' | 'beats';

interface RoomMeta {
  id: MelosRoom;
  label: string;
  icon: React.ReactNode;
  /** Which surface tier the room lives on. Drives the wrapper class. */
  tier: 'paper' | 'instrument';
}

const ROOMS: RoomMeta[] = [
  { id: 'pad',       label: 'Pad',       icon: <PenLine size={13} />,    tier: 'paper' },
  { id: 'tracklist', label: 'Tracklist', icon: <ListMusic size={13} />,  tier: 'paper' },
  { id: 'arrange',   label: 'Arrange',   icon: <Layers size={13} />,     tier: 'paper' },
  { id: 'board',     label: 'Board',     icon: <LayoutGrid size={13} />, tier: 'paper' },
  // The instrument tier: matte #0A0A0D in every skin, inheriting only the accent (blueprint §6).
  // Crossing this door should read as a lamp swinging over, not a different app opening.
  { id: 'beats',     label: 'Beats',     icon: <Drum size={13} />,       tier: 'instrument' },
];

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

// ─── Beats host ─────────────────────────────────────────────────────────────
// Bridges the workspace to the instrument tier: the production's samples reach the pads with
// their clearance state, and a bounce lands as a take on the selected song.

const BeatsHost: React.FC = () => {
  const { prodId, samples, selectedSong, editSong } = useMelos();
  const melosSamples = useMemo(() => toMelosSampleRefs(samples), [samples]);

  const onRenderTake = useCallback(async (take: { blob: Blob; name: string; durationSec: number }) => {
    const song = selectedSong;
    if (!song) return;
    let url: string | undefined;
    try {
      const uid = auth.currentUser?.uid;
      if (uid) url = await uploadFile(`personal/${uid}/melos/${prodId}/takes/${song.id}-${Date.now()}.wav`, take.blob);
    } catch { /* keep the take even if the upload fails — the groove itself is still saved */ }
    const next: SongTake = {
      id: `take_${Date.now().toString(36)}`,
      label: take.name,
      url,
      source: 'BEATS',
      fromBeats: true,
      durationSec: take.durationSec,
      createdAt: Date.now(),
    };
    // A bounce is proof the song has a demo — advance the process axis, never the commitment one
    // (whether it makes the record stays the artist's call).
    const advanced = song.state === 'SPARK' || song.state === 'WRITING';
    editSong(song.id, {
      takes: [...(song.takes || []), next],
      ...(advanced ? { state: 'DEMO' as MelosSong['state'] } : {}),
    });
  }, [prodId, selectedSong, editSong]);

  return (
    <div className="relative h-full">
      <Suspense fallback={<div className="h-full grid place-items-center" style={{ background: '#0A0A0D' }}><Loader2 size={20} className="animate-spin text-white/40" /></div>}>
        <BeatsRoom
          embedded
          onClose={() => { /* the shell's own rail owns navigation */ }}
          production={{ prodId }}
          melosSamples={melosSamples}
          onRenderTake={selectedSong ? (t) => { void onRenderTake(t); } : undefined}
          takeTargetName={selectedSong?.title}
        />
      </Suspense>
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
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const [songs, setSongs] = useState<MelosSong[]>([]);
  const [arrangements, setArrangements] = useState<MelosArrangement[]>([]);
  const [pins, setPins] = useState<InspirationPin[]>([]);
  const [samples, setSamples] = useState<SampleCandidate[]>([]);
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [people, setPeople] = useState<Collaborator[]>([]);

  // A fully-populated, in-memory demo record ("Mercy, Michigan") — no Firestore, no
  // uid required. Auto-loaded when there's nothing else, so a brand-new (or signed-out)
  // artist opens Melos into a finished-feeling album to explore instead of a blank room.
  const demoSeed = useMemo(() => buildDemoProduction(uid || 'demo_owner', currentUser?.displayName || 'You'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const DEMO_ID = demoSeed.production.id;
  const isDemo = prodId === DEMO_ID;

  // Productions list — falls back to the demo when the artist has none yet.
  useEffect(() => {
    if (!uid) {
      setProductions([demoSeed.production]);
      setProdId(cur => cur || DEMO_ID);
      setLoading(false);
      return;
    }
    const un = subProductions(uid, rows => {
      if (rows.length === 0) {
        setProductions([demoSeed.production]);
        setProdId(cur => cur || DEMO_ID);
      } else {
        setProductions(rows);
        setProdId(cur => cur || rows[0]?.id || '');
      }
      setLoading(false);
    });
    return un;
  }, [uid, demoSeed, DEMO_ID]);

  // Subcollections for the open production
  useEffect(() => {
    if (prodId === DEMO_ID) {
      // Feed every room straight from the in-memory seed; skip all live subscriptions.
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

  // ── Mutators ──────────────────────────────────────────────────────────────
  // The in-memory demo is read-only: writes are no-ops so exploring it never
  // persists a phantom production to Firestore.
  const canWrite = (id: string) => !!id && id !== DEMO_ID;
  const saveSong = useCallback((s: MelosSong) => { if (canWrite(prodId)) putSong(prodId, s); }, [prodId, DEMO_ID]);
  const editSong = useCallback((id: string, patch: Partial<MelosSong>) => { if (canWrite(prodId)) patchSong(prodId, id, patch); }, [prodId, DEMO_ID]);
  const dropSong = useCallback((id: string) => { if (canWrite(prodId)) removeSong(prodId, id); }, [prodId, DEMO_ID]);
  const addSong = useCallback(() => {
    if (!canWrite(prodId)) return;
    const s = newSong(songs.length, { title: 'Untitled' });
    putSong(prodId, s);
    setSelectedSongId(s.id);
    setRoom('pad');
  }, [prodId, songs.length, DEMO_ID]);

  const saveArrangement = useCallback((a: MelosArrangement) => { if (canWrite(prodId)) putArrangement(prodId, a); }, [prodId, DEMO_ID]);
  const editArrangement = useCallback((id: string, patch: Partial<MelosArrangement>) => { if (canWrite(prodId)) patchArrangement(prodId, id, patch); }, [prodId, DEMO_ID]);
  const dropArrangement = useCallback((id: string) => { if (canWrite(prodId)) removeArrangement(prodId, id); }, [prodId, DEMO_ID]);

  const savePin = useCallback((p: InspirationPin) => { if (canWrite(prodId)) putPin(prodId, p); }, [prodId, DEMO_ID]);
  const editPin = useCallback((id: string, patch: Partial<InspirationPin>) => { if (canWrite(prodId)) patchPin(prodId, id, patch); }, [prodId, DEMO_ID]);
  const dropPin = useCallback((id: string) => { if (canWrite(prodId)) removePin(prodId, id); }, [prodId, DEMO_ID]);

  const ctx: MelosCtx = {
    prodId, production, songs, arrangements, pins, samples, sessions, people,
    selectedSongId, selectSong: setSelectedSongId, selectedSong,
    saveSong, editSong, dropSong, addSong,
    saveArrangement, editArrangement, dropArrangement,
    savePin, editPin, dropPin,
    goRoom: setRoom,
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
    // Optimistic — the subscription confirms.
    setProductions(cur => cur.map(p => (p.id === prodId ? { ...p, padSkin: s } : p)));
  };

  const ready = useMemo(() => readiness(songs, samples), [songs, samples]);
  const statusMeta = PRODUCTION_STATUSES.find(s => s.key === production?.status);

  // ── Empty states ──────────────────────────────────────────────────────────
  // Signed-out visitors still land in the populated demo (loaded above); only show
  // the sign-in note if even that somehow failed to load.
  if (!uid && !production && !loading) {
    return (
      <div className="melos melos-paper min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <Disc3 size={36} style={{ color: 'var(--mel-accent)' }} className="mx-auto mb-4 opacity-70" />
          <h1 className="text-2xl font-semibold m-0" style={{ color: 'var(--mel-ink)' }}>Melos</h1>
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
          <h1 className="text-4xl font-light tracking-tight m-0" style={{ color: 'var(--mel-ink)' }}>
            M<span className="font-bold" style={{ color: 'var(--mel-accent)' }}>e</span>los
          </h1>
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
            <button
              onClick={startDemo}
              disabled={seeding}
              className="px-5 py-3 rounded-2xl text-xs font-semibold uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
              style={{ background: 'var(--mel-paper)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
            >
              <Sparkles size={12} className="inline mr-2 -mt-[2px]" />
              Look around a finished one
            </button>
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

  return (
    <Ctx.Provider value={ctx}>
      {/* On a phone the app's content wrapper is an overflow-y-auto scroll column, and `min-h-screen`
          has no DEFINITE height there — so the flex-1 room area collapses and rooms (which size with
          h-full) render at ~0px, leaving only the near-black shell. Escaping to a definite-height
          fixed shell gives the room area real height (a focused takeover, exited via the back arrow —
          the same paradigm as Beats). Desktop is unchanged. */}
      <div className={`melos flex flex-col ${vp.isPhone ? 'fixed inset-0 z-[90]' : 'min-h-screen'}`} data-skin={skin}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header
          className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b flex-wrap"
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

          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="text-[13px] font-bold tracking-[0.18em] uppercase shrink-0" style={{ color: 'var(--mel-accent)' }}>Melos</span>
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--mel-ink)' }}>{production.title}</span>
            {production.workingTitle && (
              <span className="melos-hand text-[13px] hidden md:inline shrink-0">— {production.workingTitle}</span>
            )}
          </div>

          {statusMeta && (
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

          {/* Skin switcher — Lamplight default, Onion Skin one click away. */}
          <div className="flex items-center gap-1 rounded-full p-1 shrink-0" style={{ background: 'var(--mel-hover)' }}>
            {PAD_SKINS.map(s => (
              <button
                key={s.key}
                onClick={() => setSkin(s.key)}
                title={s.blurb}
                aria-pressed={skin === s.key}
                className="w-6 h-6 rounded-full transition-all"
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
              className="text-[11px] rounded-lg px-2 py-1.5 shrink-0"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
            >
              {productions.map(p => <option key={p.id} value={p.id} style={{ background: '#111' }}>{p.title}</option>)}
            </select>
          )}
        </header>

        {/* ── Room nav ────────────────────────────────────────────────────── */}
        <nav
          className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b overflow-x-auto"
          style={{ borderColor: 'var(--mel-edge)', background: 'var(--mel-rail)' }}
        >
          {ROOMS.map(r => {
            const on = r.id === room;
            return (
              <button
                key={r.id}
                onClick={() => setRoom(r.id)}
                aria-current={on ? 'page' : undefined}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap transition-colors"
                style={{
                  background: on ? 'var(--mel-hover)' : 'transparent',
                  color: on ? 'var(--mel-accent)' : 'var(--mel-faint)',
                  border: 0,
                }}
              >
                {r.icon}{r.label}
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            onClick={addSong}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
          >
            <Plus size={12} />New song
          </button>
        </nav>

        {/* ── Room ────────────────────────────────────────────────────────── */}
        <div className={`flex-1 min-h-0 ${activeRoom.tier === 'paper' ? 'melos-paper' : 'melos-instr'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={room}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="h-full"
            >
              {room === 'pad'       && <PadRoom />}
              {room === 'tracklist' && <TracklistRoom />}
              {room === 'arrange'   && <ArrangeRoom />}
              {room === 'board'     && <BoardRoom />}
              {room === 'beats'     && <BeatsHost />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Ctx.Provider>
  );
};

export default MelosWorkspace;
