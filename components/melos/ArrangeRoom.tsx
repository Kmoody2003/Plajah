/**
 * Melos › Arrange — album running orders, side by side. Paper tier.
 *
 * Upgraded with:
 * - Side-by-side album audio arrangements with energy curve visualization
 * - Drag-and-drop / import audio files directly into an arrangement sequence
 * - Inline track playback + continuous sequence auditioning
 * - Touch-friendly Up/Down reorder & remove controls (works on mobile & desktop)
 * - 1-click "Send to Chora Mastering Desk →" CTA to load the arrangement for mastering & distribution
 * - Dedicated Mobile Sequence Switcher Layout (`vp.isPhone`)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Star, Trash2, GripVertical, Copy, Upload, Play, Pause,
  ArrowUp, ArrowDown, Disc3, X, Volume2, Timer, BookOpen, ChevronRight,
} from 'lucide-react';
import { useMelos, Label } from './MelosWorkspace';
import {
  MelosArrangement, MelosSong, arrangementStats, fmtRuntime, fmtDuration,
  stateMeta, uid, setPrimaryArrangement, songDuration, MUSIC_SUB_DEPARTMENTS,
  type ArrangementSlotCue, type MusicSubCategoryKey,
} from '../../services/melosService';
import { useViewport } from '../../hooks/useViewport';

/** The shape of the record — energy per song across the running order. */
const EnergyCurve: React.FC<{
  points: { songId: string; title: string; energy: number; hasFeel: boolean }[];
}> = ({ points }) => {
  const W = 100, H = 30;
  if (points.length < 2) return null;
  const step = W / (points.length - 1);
  const y = (e: number) => H - e * (H - 4) - 2;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${y(p.energy).toFixed(2)}`).join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[46px]" role="img"
      aria-label={`Energy curve across ${points.length} songs`}>
      <path d={area} fill="var(--mel-accent)" opacity=".13" />
      <path d={path} fill="none" stroke="var(--mel-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle
          key={p.songId + i}
          cx={i * step} cy={y(p.energy)} r="1.6"
          fill={p.hasFeel ? 'var(--mel-accent)' : 'transparent'}
          stroke="var(--mel-accent)" strokeWidth="0.8" vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
};

const ArrangeRoom: React.FC = () => {
  const {
    prodId, songs, arrangements, saveArrangement, editArrangement, dropArrangement,
    importAudioFilesAsSongs, openInMasteringDesk, selectSong, goRoom,
    activeArrangementId, setActiveArrangementId, setRequestedPadMode,
    openLiveCueTimerRequest, setOpenLiveCueTimerRequest,
  } = useMelos();
  const vp = useViewport();

  const [drag, setDrag] = useState<{ arrId: string; index: number } | null>(null);
  const [dragOverArrId, setDragOverArrId] = useState<string | null>(null);
  const [uploadingArrId, setUploadingArrId] = useState<string | null>(null);
  const [mobileArrId, setMobileArrId] = useState<string | null>(null);

  // Live Setlist & Run-of-Show Cue Timer state
  const [showLiveTimer, setShowLiveTimer] = useState<boolean>(() => prodId.startsWith('melos_church_'));
  const [liveTimerRunning, setLiveTimerRunning] = useState<boolean>(false);
  const [activeCueIdx, setActiveCueIdx] = useState<number>(0);

  useEffect(() => {
    if (openLiveCueTimerRequest) {
      setShowLiveTimer(true);
      setOpenLiveCueTimerRequest(false);
    }
  }, [openLiveCueTimerRequest, setOpenLiveCueTimerRequest]);

  // Inline audio player for auditioning tracks or sequences
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackKey, setPlayingTrackKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetArrForUpload, setTargetArrForUpload] = useState<string | null>(null);

  const byId = useMemo(() => new Map(songs.map(s => [s.id, s])), [songs]);

  const activeCueArr = useMemo(
    () =>
      arrangements.find(a => a.id === activeArrangementId) ||
      arrangements.find(a => a.isPrimary) ||
      arrangements[0] ||
      null,
    [arrangements, activeArrangementId],
  );

  // Tick the live run-of-show timer every second when running
  useEffect(() => {
    if (!liveTimerRunning || !activeCueArr) return;
    const sid = activeCueArr.songIds[activeCueIdx];
    if (!sid) return;
    const id = window.setInterval(() => {
      const existingCue = activeCueArr.slotCues?.[sid] || {
        songId: sid,
        plannedSec: byId.get(sid)?.durationSec || 240,
        actualSec: 0,
      };
      const nextActual = (existingCue.actualSec || 0) + 1;
      editArrangement(activeCueArr.id, {
        slotCues: {
          ...(activeCueArr.slotCues || {}),
          [sid]: {
            ...existingCue,
            actualSec: nextActual,
          },
        },
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [liveTimerRunning, activeCueArr, activeCueIdx, byId, editArrangement]);

  const updateSlotCue = (arr: MelosArrangement, songId: string, patch: Partial<ArrangementSlotCue>) => {
    const prev = arr.slotCues?.[songId] || { songId };
    editArrangement(arr.id, {
      slotCues: {
        ...(arr.slotCues || {}),
        [songId]: { ...prev, ...patch },
      },
    });
  };

  const getSongAudioUrl = (s: MelosSong) => s.trackRef?.url || s.takes?.find(t => !!t.url)?.url || null;

  const togglePlaySongInArr = (arrId: string, s: MelosSong) => {
    const url = getSongAudioUrl(s);
    if (!url || !audioRef.current) return;
    const key = `${arrId}:${s.id}`;
    if (playingTrackKey === key && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    audioRef.current.src = url;
    setPlayingTrackKey(key);
    void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const addArrangement = () => {
    const now = Date.now();
    const id = uid('arr');
    saveArrangement({
      id,
      name: `Arrangement ${String.fromCharCode(65 + arrangements.length)}`,
      songIds: songs.filter(s => s.commitment === 'VERIFIED' || s.commitment === 'WORKING_ON_IT').map(s => s.id),
      isPrimary: arrangements.length === 0,
      createdAt: now,
      updatedAt: now,
    });
    setMobileArrId(id);
  };

  const cloneArrangement = (a: MelosArrangement) => {
    const now = Date.now();
    const id = uid('arr');
    saveArrangement({
      ...a,
      id,
      name: `${a.name} (Alt)`,
      isPrimary: false,
      songIds: [...a.songIds],
      createdAt: now,
      updatedAt: now,
    });
    setMobileArrId(id);
  };

  const reorder = (a: MelosArrangement, from: number, to: number) => {
    if (from === to || to < 0 || to >= a.songIds.length) return;
    const next = [...a.songIds];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    editArrangement(a.id, { songIds: next });
  };

  const removeFromArrangement = (a: MelosArrangement, idx: number) => {
    const next = a.songIds.filter((_, i) => i !== idx);
    editArrangement(a.id, { songIds: next });
  };

  const makePrimary = (arrId: string) => {
    arrangements.forEach(a => {
      if ((a.id === arrId) !== !!a.isPrimary) {
        editArrangement(a.id, { isPrimary: a.id === arrId });
      }
    });
    void setPrimaryArrangement(prodId, arrangements, arrId);
  };

  const handleDropAudioOnArrangement = async (arrId: string, files: FileList | File[]) => {
    setUploadingArrId(arrId);
    try {
      await importAudioFilesAsSongs(files, { arrangementId: arrId });
    } finally {
      setUploadingArrId(null);
    }
  };

  if (!arrangements.length) {
    return (
      <div className="h-full flex items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <p className="text-sm m-0" style={{ color: 'var(--mel-dim)' }}>
            No album arrangements yet. Create different running orders for your record,
            drop audio files right into a sequence, and send your chosen arrangement to the Chora Mastering Desk.
          </p>
          <button
            onClick={addArrangement}
            className="mt-4 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
          >Build first arrangement</button>
        </div>
      </div>
    );
  }

  const activeMobileArr = arrangements.find(a => a.id === mobileArrId) || arrangements.find(a => a.isPrimary) || arrangements[0];

  const renderArrangementCard = (a: MelosArrangement, fullWidth = false) => {
    const stats = arrangementStats(a, songs);
    const isDragTarget = dragOverArrId === a.id;
    const isUploadingThis = uploadingArrId === a.id;

    return (
      <section
        key={a.id}
        onDragOver={e => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) setDragOverArrId(a.id);
        }}
        onDragLeave={() => setDragOverArrId(null)}
        onDrop={e => {
          e.preventDefault();
          setDragOverArrId(null);
          if (e.dataTransfer.files?.length) {
            void handleDropAudioOnArrangement(a.id, e.dataTransfer.files);
          }
        }}
        className="melos-sheet p-4 flex flex-col gap-3 shrink-0 transition-all"
        style={{
          width: fullWidth ? '100%' : 326,
          outline: isDragTarget ? '2px dashed var(--mel-accent)' : a.isPrimary ? '1.5px solid rgba(244,162,97,0.45)' : 'none',
        }}
      >
        {/* Sequence Header */}
        <div className="flex items-center gap-2">
          <input
            value={a.name}
            onChange={e => editArrangement(a.id, { name: e.target.value })}
            aria-label="Arrangement name"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14.5px] font-bold"
            style={{ color: 'var(--mel-ink)' }}
          />
          <button
            onClick={() => makePrimary(a.id)}
            title={a.isPrimary ? 'Primary album arrangement' : 'Set as primary album arrangement'}
            className="p-1 rounded"
            style={{ background: 'none', border: 0, color: a.isPrimary ? 'var(--mel-accent)' : 'var(--mel-faint)' }}
          >
            <Star size={14} fill={a.isPrimary ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => cloneArrangement(a)}
            title="Duplicate arrangement"
            className="p-1 rounded"
            style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
          >
            <Copy size={12} />
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${a.name}"?`)) dropArrangement(a.id); }}
            title="Delete arrangement"
            className="p-1 rounded"
            style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Stats & Import Audio CTA */}
        <div className="flex items-center justify-between gap-2 text-[10.5px]" style={{ color: 'var(--mel-faint)' }}>
          <div className="flex items-baseline gap-2.5">
            <span className="tabular-nums font-semibold" style={{ color: 'var(--mel-dim)' }}>{a.songIds.length} tracks</span>
            <span className="tabular-nums">{fmtRuntime(stats.totalSec)}</span>
            {a.isPrimary && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(244,162,97,0.16)', color: 'var(--mel-accent)' }}>
                Primary
              </span>
            )}
          </div>
          <button
            onClick={() => { setTargetArrForUpload(a.id); fileInputRef.current?.click(); }}
            disabled={isUploadingThis}
            className="px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
            title="Import audio files directly into this arrangement"
          >
            <Upload size={10} />
            {isUploadingThis ? 'Importing…' : '+ Audio'}
          </button>
        </div>

        {/* Energy Curve */}
        <div>
          <Label className="mb-1">Album Energy Curve</Label>
          <EnergyCurve points={stats.curve} />
        </div>

        {/* Running Order List */}
        <ol className="list-none p-0 m-0 flex flex-col gap-2">
          {a.songIds.map((sid, i) => {
            const s = byId.get(sid);
            if (!s) return null;
            const audioUrl = getSongAudioUrl(s);
            const trackKey = `${a.id}:${s.id}`;
            const isPlayingThis = playingTrackKey === trackKey && isPlaying;
            const slotCue = a.slotCues?.[sid];
            const subMeta = MUSIC_SUB_DEPARTMENTS.find(d => d.key === slotCue?.assignedSubDept);
            const isLiveCue = showLiveTimer && activeCueArr?.id === a.id && activeCueIdx === i;

            return (
              <li
                key={`${a.id}-${sid}-${i}`}
                draggable={!vp.isPhone}
                onDragStart={() => setDrag({ arrId: a.id, index: i })}
                onDragEnd={() => setDrag(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  if (drag && drag.arrId === a.id) reorder(a, drag.index, i);
                  setDrag(null);
                }}
                className="flex flex-col gap-1.5 px-2.5 py-2 rounded-xl transition-colors"
                style={{
                  background: isLiveCue
                    ? 'rgba(16,185,129,0.16)'
                    : isPlayingThis
                    ? 'rgba(244,162,97,0.14)'
                    : 'var(--mel-hover)',
                  border: isLiveCue
                    ? '1px solid rgba(16,185,129,0.55)'
                    : isPlayingThis
                    ? '1px solid var(--mel-accent)'
                    : '1px solid transparent',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] font-mono tabular-nums w-4 shrink-0" style={{ color: 'var(--mel-faint)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {audioUrl ? (
                    <button
                      onClick={() => togglePlaySongInArr(a.id, s)}
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
                      title={isPlayingThis ? 'Pause track' : 'Audition track'}
                    >
                      {isPlayingThis ? <Pause size={9} /> : <Play size={9} className="ml-0.5" />}
                    </button>
                  ) : (
                    <i className="w-[6px] h-[6px] rounded-full shrink-0 mx-1" style={{ background: stateMeta(s.state).color }} />
                  )}

                  <button
                    onClick={() => {
                      selectSong(s.id);
                      setRequestedPadMode('lyrics');
                      goRoom('pad');
                    }}
                    className="text-[12px] font-semibold flex-1 truncate text-left"
                    style={{ color: 'var(--mel-ink)', background: 'none', border: 0, padding: 0 }}
                    title="Open in Chora Writing Pad"
                  >
                    {s.title}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      selectSong(s.id);
                      setRequestedPadMode('stand');
                      goRoom('pad');
                    }}
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1"
                    style={{ background: 'rgba(245,158,11,0.18)', color: '#FCD34D', border: 0 }}
                    title="Open in Chora Music Stand & Nashville Number System"
                  >
                    <BookOpen size={9} />Stand
                  </button>

                  {audioUrl && <Volume2 size={10} style={{ color: 'var(--mel-accent)' }} className="shrink-0 opacity-70" />}

                  <span className="text-[9.5px] font-mono tabular-nums shrink-0" style={{ color: 'var(--mel-faint)' }}>
                    {fmtDuration(slotCue?.plannedSec || songDuration(s))}
                  </span>

                  {/* Up / Down / Remove touch-friendly controls */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => reorder(a, i, i - 1)}
                      disabled={i === 0}
                      className="p-0.5 disabled:opacity-20"
                      style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                      title="Move track up"
                    ><ArrowUp size={10} /></button>
                    <button
                      onClick={() => reorder(a, i, i + 1)}
                      disabled={i === a.songIds.length - 1}
                      className="p-0.5 disabled:opacity-20"
                      style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                      title="Move track down"
                    ><ArrowDown size={10} /></button>
                    <button
                      onClick={() => removeFromArrangement(a, i)}
                      className="p-0.5 hover:opacity-100 opacity-60"
                      style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                      title="Remove from arrangement"
                    ><X size={10} /></button>
                  </div>

                  {!vp.isPhone && <GripVertical size={10} style={{ color: 'var(--mel-faint)', cursor: 'grab' }} className="shrink-0" />}
                </div>

                {/* Per-Slot Setlist Cue Details (Key, BPM, Ensemble Unit & Moment) */}
                <div className="flex items-center gap-1.5 flex-wrap pl-5">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/30 text-amber-300">
                    Key {slotCue?.performanceKey || s.keySig || 'G'} · {slotCue?.bpm || s.tempo || 84} BPM
                  </span>
                  <select
                    value={slotCue?.assignedSubDept || ''}
                    onChange={e =>
                      updateSlotCue(a, sid, {
                        assignedSubDept: (e.target.value || undefined) as Exclude<MusicSubCategoryKey, 'ALL'> | undefined,
                      })
                    }
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded outline-none"
                    style={{
                      background: subMeta ? `${subMeta.badgeColor}24` : 'var(--mel-card)',
                      color: subMeta ? subMeta.badgeColor : 'var(--mel-dim)',
                      border: '1px solid var(--mel-edge)',
                    }}
                  >
                    <option value="" style={{ background: '#141418', color: '#ccc' }}>All Ensemble Units</option>
                    {MUSIC_SUB_DEPARTMENTS.map(d => (
                      <option key={d.key} value={d.key} style={{ background: '#141418', color: '#eee' }}>
                        {d.emoji} {d.shortLabel}
                      </option>
                    ))}
                  </select>
                  {slotCue?.momentInService && (
                    <span className="text-[9px] truncate" style={{ color: 'var(--mel-dim)' }}>
                      · {slotCue.momentInService}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Songs not in this sequence — one click to add them */}
        {(() => {
          const missing = songs.filter(s => !a.songIds.includes(s.id) && s.commitment !== 'CUT');
          if (!missing.length) return null;
          return (
            <div>
              <Label className="mb-1.5">Available in Tracklist</Label>
              <div className="flex flex-wrap gap-1">
                {missing.map(s => (
                  <button
                    key={s.id}
                    onClick={() => editArrangement(a.id, { songIds: [...a.songIds, s.id] })}
                    className="text-[9.5px] px-2 py-1 rounded-md transition-colors hover:border-amber-400/50"
                    style={{ background: 'transparent', color: 'var(--mel-dim)', border: '1px dashed var(--mel-edge)' }}
                  >+ {s.title}</button>
                ))}
              </div>
            </div>
          );
        })()}

        <textarea
          value={a.notes || ''}
          onChange={e => editArrangement(a.id, { notes: e.target.value })}
          placeholder="Notes on this album arrangement…"
          rows={2}
          aria-label="Sequence notes"
          className="w-full bg-transparent outline-none resize-none melos-hand text-[13.5px]"
          style={{ border: '1px dashed var(--mel-edge)', borderRadius: 10, padding: '8px 10px', transform: 'none' }}
        />

        {/* Send to Chora Mastering Desk CTA */}
        <button
          onClick={() => openInMasteringDesk(a.id)}
          className="w-full py-2.5 px-3 rounded-xl text-[10.5px] font-extrabold uppercase tracking-[0.14em] flex items-center justify-center gap-2 transition-all"
          style={{
            background: 'linear-gradient(135deg, #6B0099, #D40055)',
            color: '#fff',
            border: 0,
            boxShadow: '0 6px 20px rgba(212,0,85,0.28)',
          }}
        >
          <Disc3 size={13} />
          Send to Chora Mastering Desk →
        </button>
      </section>
    );
  };

  return (
    <div className="h-full overflow-auto px-4 sm:px-7 py-5 sm:py-6">
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files?.length && targetArrForUpload) {
            void handleDropAudioOnArrangement(targetArrForUpload, e.target.files);
          }
          e.target.value = '';
          setTargetArrForUpload(null);
        }}
      />

      {/* Top Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <Label className="mb-1">Arrange · Album Sequences, Setlists &amp; Live Cue Timer</Label>
          <p className="text-[12.5px] m-0" style={{ color: 'var(--mel-dim)' }}>
            {arrangements.length} arrangement{arrangements.length === 1 ? '' : 's'} side by side.
            Sequence album tracks or live worship/concert setlists, run the live cue timer, or jump any song straight into Chora Stand Mode.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowLiveTimer(v => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: showLiveTimer ? 'rgba(16,185,129,0.2)' : 'var(--mel-hover)',
              color: showLiveTimer ? '#6EE7B7' : 'var(--mel-ink)',
              border: showLiveTimer ? '1px solid rgba(16,185,129,0.45)' : '1px solid var(--mel-edge)',
            }}
          >
            <Timer size={12} />
            {showLiveTimer ? '✓ Live Setlist Cue Timer' : 'Live Setlist Cue Timer'}
          </button>
          <button
            onClick={addArrangement}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
          ><Plus size={12} />New Arrangement / Setlist</button>
        </div>
      </div>

      {/* Live Setlist & Run-of-Show Cue Timer Panel */}
      {showLiveTimer && activeCueArr && (
        <div
          className="mb-5 rounded-2xl p-4 flex flex-col gap-3"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(245,158,11,0.08))',
            border: '1px solid rgba(16,185,129,0.35)',
          }}
        >
          {(() => {
            const activeSongId = activeCueArr.songIds[activeCueIdx];
            const activeCueSong = activeSongId ? byId.get(activeSongId) : undefined;
            const activeSlotCue = activeSongId ? activeCueArr.slotCues?.[activeSongId] : undefined;
            const planned = activeSlotCue?.plannedSec || (activeCueSong ? songDuration(activeCueSong) : 240) || 240;
            const actual = activeSlotCue?.actualSec || 0;
            const diff = actual - planned;
            const totalPlanned = activeCueArr.songIds.reduce((sum, sid) => {
              const sc = activeCueArr.slotCues?.[sid];
              const s = byId.get(sid);
              return sum + (sc?.plannedSec || (s ? songDuration(s) : 240) || 240);
            }, 0);
            const totalActual = activeCueArr.songIds.reduce((sum, sid) => {
              return sum + (activeCueArr.slotCues?.[sid]?.actualSec || 0);
            }, 0);
            const totalVariance = totalActual - totalPlanned;

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                      ⏱ Live Setlist Cue Clock
                    </span>
                    <select
                      value={activeCueArr.id}
                      onChange={e => {
                        setActiveArrangementId(e.target.value);
                        setActiveCueIdx(0);
                      }}
                      className="rounded-xl px-3 py-1.5 text-xs font-bold outline-none"
                      style={{ background: 'var(--mel-card)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
                    >
                      {arrangements.map(arr => (
                        <option key={arr.id} value={arr.id} style={{ background: '#141418' }}>
                          {arr.name}
                        </option>
                      ))}
                    </select>
                    {activeCueSong && (
                      <span className="text-xs font-bold" style={{ color: 'var(--mel-ink)' }}>
                        Cue #{activeCueIdx + 1}: <span className="text-amber-300">{activeCueSong.title}</span>
                        {' '}({fmtDuration(actual)} / {fmtDuration(planned)})
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-mono font-black px-2.5 py-1 rounded-lg border ${
                        diff > 0
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      Cue Variance: {diff > 0 ? `+${fmtDuration(diff)} OVER` : `-${fmtDuration(Math.abs(diff))} ON TIME`}
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--mel-dim)' }}>
                      Setlist Total: {fmtDuration(totalActual)} / {fmtDuration(totalPlanned)} ({totalVariance > 0 ? `+${fmtDuration(totalVariance)}` : `-${fmtDuration(Math.abs(totalVariance))}`})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLiveTimerRunning(r => !r)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 ${
                        liveTimerRunning ? 'bg-amber-400 text-black' : 'bg-emerald-400 text-black'
                      }`}
                    >
                      {liveTimerRunning ? <Pause size={13} /> : <Play size={13} />}
                      {liveTimerRunning ? 'Pause Cue Clock' : 'Start Live Cue Clock'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveCueIdx(i => (i + 1) % Math.max(1, activeCueArr.songIds.length))
                      }
                      className="px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1"
                      style={{ background: 'var(--mel-card)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
                    >
                      Advance Cue <ChevronRight size={13} />
                    </button>
                    {activeCueSong && (
                      <button
                        type="button"
                        onClick={() => {
                          selectSong(activeCueSong.id);
                          setRequestedPadMode('stand');
                          goRoom('pad');
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-black bg-amber-400/20 text-amber-200 border border-amber-400/40 inline-flex items-center gap-1.5"
                      >
                        <BookOpen size={12} /> Open Active Cue in Stand Mode
                      </button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Dedicated Mobile Sequence Switcher Layout */}
      {vp.isPhone ? (
        <div className="flex flex-col gap-3 pb-10">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {arrangements.map(a => {
              const on = a.id === activeMobileArr?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setMobileArrId(a.id)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 shrink-0"
                  style={{
                    background: on ? 'var(--mel-hover)' : 'transparent',
                    color: on ? 'var(--mel-accent)' : 'var(--mel-dim)',
                    border: on ? '1px solid var(--mel-accent)' : '1px solid var(--mel-edge)',
                  }}
                >
                  {a.isPrimary && <Star size={10} fill="currentColor" />}
                  {a.name} ({a.songIds.length})
                </button>
              );
            })}
          </div>
          {activeMobileArr && renderArrangementCard(activeMobileArr, true)}
        </div>
      ) : (
        /* Desktop Side-by-Side Columns */
        <div className="flex gap-4 items-start pb-6" style={{ minWidth: 'min-content' }}>
          {arrangements.map(a => renderArrangementCard(a, false))}
        </div>
      )}
    </div>
  );
};

export default ArrangeRoom;
