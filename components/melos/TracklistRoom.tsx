/**
 * Melos › Tracklist — the complete list of song projects, audio files, and written songs.
 * Paper tier.
 *
 * Upgraded with:
 * - Complete view of DAW song projects (`grooveId`), audio files (`trackRef` / `takes`), and written songs (`lyrics` / `sheetNotes`)
 * - Drag-and-drop & file import for audio (batch import as new songs or drop onto a specific song row)
 * - Inline audio playback right inside the Tracklist
 * - Quick actions to open in Pad, open in Chora Studio (DAW), or add to an Album Arrangement
 * - Dedicated touch-optimized Mobile Card Layout (`vp.isPhone`)
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Plus, Music4, Upload, AlertTriangle, Trash2, Check, LayoutPanelTop,
  Play, Pause, PenLine, Drum, Layers, FileText, Disc3, BookOpen,
} from 'lucide-react';
import { useMelos, Label, Hearts } from './MelosWorkspace';
import {
  MelosSong, Commitment, COMMITMENTS, SONG_STATES, stateMeta, commitmentMeta,
  fmtDuration, songDuration, blockingSamples, IS_ON_RECORD, MUSIC_SUB_DEPARTMENTS,
} from '../../services/melosService';
import { openMelosTracklistInTela } from '../../services/telaDomainAdapters';
import { importBulkWorshipChartsAndStems } from '../../services/choraSovereignWorshipService';
import { auth } from '../../services/firebase';
import { useViewport } from '../../hooks/useViewport';

type Filter = 'ALL' | 'ON_RECORD' | 'AUDIO_FILES' | 'DAW_PROJECTS' | 'WRITTEN' | Commitment;

const TracklistRoom: React.FC = () => {
  const {
    prodId, songs, arrangements, samples, editSong, saveSong, dropSong, addSong, selectSong, goRoom,
    importAudioToSong, importAudioFilesAsSongs, addSongToArrangement, openInMasteringDesk,
    setRequestedPadMode, activeSubDept, setOpenHymnalRequest,
  } = useMelos();
  const vp = useViewport();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [openingTela, setOpeningTela] = useState(false);
  const [isDraggingBatch, setIsDraggingBatch] = useState(false);
  const [dragOverSongId, setDragOverSongId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Inline audio player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const batchInputRef = useRef<HTMLInputElement>(null);
  const rowInputRef = useRef<HTMLInputElement>(null);
  const [targetSongIdForUpload, setTargetSongIdForUpload] = useState<string | null>(null);

  const hasAudio = (s: MelosSong) => !!(s.trackRef?.url || s.takes?.some(t => !!t.url));
  const getAudioUrl = (s: MelosSong) => s.trackRef?.url || s.takes?.find(t => !!t.url)?.url || null;
  const hasWrittenLyrics = (s: MelosSong) =>
    (s.lyrics || []).some(b => b.lines.some(l => l.trim().length > 0)) || (s.sheetNotes?.length || 0) > 0;
  const hasDawProject = (s: MelosSong) => !!(s.grooveId || s.takes?.some(t => t.fromBeats));
  const matchesSubDept = (s: MelosSong) =>
    activeSubDept === 'ALL' || !s.assignedSubDepts?.length || s.assignedSubDepts.includes(activeSubDept);

  const deptScopedSongs = useMemo(
    () => songs.filter(matchesSubDept),
    [songs, activeSubDept], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const counts = useMemo(() => ({
    all: deptScopedSongs.length,
    onRecord: deptScopedSongs.filter(s => IS_ON_RECORD.includes(s.commitment)).length,
    audio: deptScopedSongs.filter(hasAudio).length,
    daw: deptScopedSongs.filter(hasDawProject).length,
    written: deptScopedSongs.filter(hasWrittenLyrics).length,
  }), [deptScopedSongs]);

  const rows = useMemo(() => {
    if (filter === 'ALL') return deptScopedSongs;
    if (filter === 'ON_RECORD') return deptScopedSongs.filter(s => IS_ON_RECORD.includes(s.commitment));
    if (filter === 'AUDIO_FILES') return deptScopedSongs.filter(hasAudio);
    if (filter === 'DAW_PROJECTS') return deptScopedSongs.filter(hasDawProject);
    if (filter === 'WRITTEN') return deptScopedSongs.filter(hasWrittenLyrics);
    return deptScopedSongs.filter(s => s.commitment === filter);
  }, [deptScopedSongs, filter]);

  const totalSec = rows.reduce((n, s) => n + songDuration(s), 0);

  const openInPad = (s: MelosSong) => { selectSong(s.id); setRequestedPadMode('lyrics'); goRoom('pad'); };
  const openInStand = (s: MelosSong) => { selectSong(s.id); setRequestedPadMode('stand'); goRoom('pad'); };
  const openInStudio = (s: MelosSong) => { selectSong(s.id); goRoom('beats'); };

  const togglePlaySong = (s: MelosSong) => {
    const url = getAudioUrl(s);
    if (!url || !audioRef.current) return;
    if (playingSongId === s.id && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    if (playingSongId !== s.id) {
      audioRef.current.src = url;
      setPlayingSongId(s.id);
    }
    void audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const handleBatchFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      const arr = Array.from(files);
      const hasChartFiles = arr.some(f => /\.(usr|cho|chordpro|pro|txt|xml)$/i.test(f.name));
      if (hasChartFiles) {
        const res = await importBulkWorshipChartsAndStems(arr, prodId, songs.length);
        res.songs.forEach(s => saveSong(s));
        if (res.songs[0]) selectSong(res.songs[0].id);
      } else {
        await importAudioFilesAsSongs(files);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRowFile = async (songId: string, file: File) => {
    setUploading(true);
    try {
      await importAudioToSong(songId, file);
    } finally {
      setUploading(false);
    }
  };

  const renderAssetBadges = (s: MelosSong) => {
    const audio = hasAudio(s);
    const written = hasWrittenLyrics(s);
    const daw = hasDawProject(s);
    const lineCount = (s.lyrics || []).reduce((sum, b) => sum + b.lines.filter(l => l.trim()).length, 0);
    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-1">
        {(s.keySig || s.tempo) && (
          <span
            className="text-[8.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(245,158,11,0.16)', color: '#FCD34D' }}
          >
            {s.keySig ? `Key ${s.keySig}` : ''}{s.keySig && s.tempo ? ' · ' : ''}{s.tempo ? `${s.tempo} BPM` : ''}
          </span>
        )}
        {written && (
          <span
            className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ background: 'rgba(6,214,160,0.14)', color: '#06D6A0' }}
          >
            <FileText size={8} />Written ({lineCount}L)
          </span>
        )}
        {daw && (
          <span
            className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ background: 'rgba(208,188,255,0.14)', color: '#D0BCFF' }}
          >
            <Drum size={8} />Chora Project
          </span>
        )}
        {audio && (
          <span
            className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ background: 'rgba(244,162,97,0.16)', color: 'var(--mel-accent)' }}
          >
            <Music4 size={8} />Audio ({s.takes?.length || 1})
          </span>
        )}
        {(s.assignedSubDepts || []).map(deptKey => {
          const meta = MUSIC_SUB_DEPARTMENTS.find(d => d.key === deptKey);
          if (!meta) return null;
          return (
            <span
              key={deptKey}
              className="text-[8px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: `${meta.badgeColor}20`, color: meta.badgeColor }}
            >
              {meta.emoji} {meta.shortLabel}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="h-full overflow-y-auto px-4 sm:px-7 py-5 sm:py-6"
      onDragOver={e => { e.preventDefault(); setIsDraggingBatch(true); }}
      onDragLeave={() => setIsDraggingBatch(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDraggingBatch(false);
        if (e.dataTransfer.files?.length) void handleBatchFiles(e.dataTransfer.files);
      }}
    >
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
      />
      <input
        ref={batchInputRef}
        type="file"
        accept="audio/*,.usr,.cho,.chordpro,.pro,.txt,.xml"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files?.length) void handleBatchFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={rowInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && targetSongIdForUpload) void handleRowFile(targetSongIdForUpload, f);
          e.target.value = '';
          setTargetSongIdForUpload(null);
        }}
      />

      {/* Header + Actions */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <Label className="mb-1">Tracklist · Song Projects, Audio Files & Written Songs</Label>
          <p className="text-[12.5px] m-0" style={{ color: 'var(--mel-dim)' }}>
            {rows.length} of {songs.length} item{songs.length === 1 ? '' : 's'}
            {totalSec > 0 && <> · {fmtDuration(totalSec)} total runtime</>}
            {' · '}{counts.written} written · {counts.daw} DAW projects · {counts.audio} audio files
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => batchInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
            title="Bulk import Audio Stems, SongSelect (.usr/.txt), ChordPro (.cho), or PraiseCharts files"
          >
            <Upload size={11} />
            {uploading ? 'Importing…' : 'Bulk Import Audio / SongSelect (.USR/.CHO)'}
          </button>

          <button
            onClick={addSong}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
          >
            <Plus size={11} />New Song Project
          </button>

          <button
            type="button"
            onClick={() => {
              setOpenHymnalRequest(true);
              goRoom('pad');
            }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5"
            style={{ background: 'rgba(245,158,11,0.16)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            <BookOpen size={11} />Hymnal &amp; Gospel Catalog
          </button>

          <button
            onClick={() => openInMasteringDesk()}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5"
            style={{ background: 'rgba(208,188,255,0.14)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.3)' }}
          >
            <Disc3 size={11} />Mastering Desk
          </button>

          <button
            disabled={openingTela}
            onClick={async () => {
              setOpeningTela(true);
              try { await openMelosTracklistInTela(prodId, songs, auth.currentUser?.uid || 'local'); }
              finally { setOpeningTela(false); }
            }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
            title="Edit this live tracklist as a bidirectional Tela Base"
          >
            <LayoutPanelTop size={11} />{openingTela ? 'Opening…' : 'Open in Tela'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
        {([
          ['ALL', `All (${counts.all})`],
          ['ON_RECORD', `On Record (${counts.onRecord})`],
          ['AUDIO_FILES', `Audio Files (${counts.audio})`],
          ['DAW_PROJECTS', `DAW Projects (${counts.daw})`],
          ['WRITTEN', `Written Songs (${counts.written})`],
          ...COMMITMENTS.map(c => [c.key, c.label] as [Filter, string]),
        ] as [Filter, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap shrink-0"
            style={{
              background: filter === k ? 'var(--mel-hover)' : 'transparent',
              color: filter === k ? 'var(--mel-accent)' : 'var(--mel-faint)',
              border: filter === k ? '1px solid var(--mel-accent)' : '1px solid var(--mel-edge)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Dropzone Hint Banner when dragging files */}
      {isDraggingBatch && (
        <div
          className="mb-4 p-4 rounded-2xl text-center text-xs font-bold uppercase tracking-wider"
          style={{ background: 'rgba(244,162,97,0.14)', border: '1.5px dashed var(--mel-accent)', color: 'var(--mel-accent)' }}
        >
          Drop audio files here to add them as tracks in your Tracklist (or drop onto a specific song row to attach audio)
        </div>
      )}

      {/* ── Dedicated Mobile Card Layout (vp.isPhone) ───────────────────────── */}
      {vp.isPhone ? (
        <div className="flex flex-col gap-3 pb-10">
          {rows.map(s => {
            const blocked = blockingSamples(s, samples);
            const audioUrl = getAudioUrl(s);
            const playingThis = playingSongId === s.id && isPlaying;
            return (
              <div
                key={s.id}
                className="rounded-2xl p-3.5 flex flex-col gap-2.5"
                style={{ background: 'var(--mel-card)', border: '1px solid var(--mel-edge)' }}
              >
                <div className="flex items-start gap-2.5">
                  {audioUrl ? (
                    <button
                      onClick={() => togglePlaySong(s)}
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
                    >
                      {playingThis ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setTargetSongIdForUpload(s.id); rowInputRef.current?.click(); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'var(--mel-hover)', color: 'var(--mel-faint)', border: '1px dashed var(--mel-edge)' }}
                      title="Upload audio for this song"
                    >
                      <Upload size={12} />
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => openInPad(s)}
                      className="text-left w-full"
                      style={{ background: 'none', border: 0, padding: 0 }}
                    >
                      <span className="text-[14px] font-bold block truncate" style={{ color: 'var(--mel-ink)' }}>
                        {s.title}
                      </span>
                    </button>
                    {renderAssetBadges(s)}
                  </div>

                  <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--mel-dim)' }}>
                    {fmtDuration(songDuration(s))}
                  </span>
                </div>

                {/* State, Commitment & Love row */}
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={s.state}
                      onChange={e => editSong(s.id, { state: e.target.value as MelosSong['state'] })}
                      className="text-[9.5px] font-bold uppercase tracking-wider rounded-md px-2 py-1"
                      style={{ background: `${stateMeta(s.state).color}1f`, color: stateMeta(s.state).color, border: 0 }}
                    >
                      {SONG_STATES.map(o => <option key={o.key} value={o.key} style={{ background: '#111', color: '#eee' }}>{o.label}</option>)}
                    </select>

                    <select
                      value={s.commitment}
                      onChange={e => editSong(s.id, { commitment: e.target.value as Commitment })}
                      className="text-[9.5px] font-bold uppercase tracking-wider rounded-md px-2 py-1"
                      style={{ background: `${commitmentMeta(s.commitment).color}1f`, color: commitmentMeta(s.commitment).color, border: 0 }}
                    >
                      {COMMITMENTS.map(o => <option key={o.key} value={o.key} style={{ background: '#111', color: '#eee' }}>{o.label}</option>)}
                    </select>
                  </div>

                  <Hearts value={s.love} onChange={v => editSong(s.id, { love: v })} size={13} />
                </div>

                {blocked.length > 0 && (
                  <div className="text-[9.5px] flex items-center gap-1" style={{ color: 'var(--mel-warn)' }}>
                    <AlertTriangle size={10} />{blocked.length} sample{blocked.length > 1 ? 's' : ''} to clear
                  </div>
                )}

                {/* Quick Mobile Action Bar */}
                <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--mel-edge)' }}>
                  <button
                    onClick={() => openInPad(s)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
                    style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: 0 }}
                  >
                    <PenLine size={11} />Pad
                  </button>
                  <button
                    onClick={() => openInStudio(s)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
                    style={{ background: 'rgba(208,188,255,0.12)', color: '#D0BCFF', border: 0 }}
                  >
                    <Drum size={11} />Studio
                  </button>
                  {arrangements.length > 0 && (
                    <button
                      onClick={() => addSongToArrangement(s.id)}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
                      style={{ background: 'var(--mel-hover)', color: 'var(--mel-accent)', border: 0 }}
                    >
                      <Layers size={11} />+ Arrange
                    </button>
                  )}
                  <button
                    onClick={() => { setTargetSongIdForUpload(s.id); rowInputRef.current?.click(); }}
                    className="p-1.5 rounded-lg"
                    style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
                    title="Attach audio file"
                  >
                    <Upload size={12} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove "${s.title}"?`)) dropSong(s.id); }}
                    className="p-1.5 rounded-lg"
                    style={{ background: 'transparent', color: 'var(--mel-faint)', border: 0 }}
                    title="Delete song"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Desktop Table Layout ─────────────────────────────────────────── */
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                {['', 'Song / Project / Assets', "Where it's at", 'Commitment', 'Love', 'Confidence', 'Length', 'Audio & Playback', 'Actions'].map((h, i) => (
                  <th
                    key={i}
                    className="melos-label text-left font-bold pb-2.5 px-2"
                    style={{ borderBottom: '1px solid var(--mel-edge)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(s => {
                const blocked = blockingSamples(s, samples);
                const audioUrl = getAudioUrl(s);
                const playingThis = playingSongId === s.id && isPlaying;
                const isDragRow = dragOverSongId === s.id;

                return (
                  <tr
                    key={s.id}
                    className="group transition-colors"
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverSongId(s.id); }}
                    onDragLeave={() => setDragOverSongId(null)}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverSongId(null);
                      setIsDraggingBatch(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleRowFile(s.id, f);
                    }}
                    style={{
                      borderBottom: '1px solid var(--mel-edge)',
                      background: isDragRow ? 'rgba(244,162,97,0.12)' : 'transparent',
                    }}
                  >
                    <td className="py-3 px-2 w-6">
                      <i className="block w-[7px] h-[7px] rounded-full" style={{ background: stateMeta(s.state).color }} />
                    </td>

                    <td className="py-3 px-2">
                      <button
                        onClick={() => openInPad(s)}
                        className="text-left"
                        style={{ background: 'none', border: 0, padding: 0 }}
                      >
                        <span className="text-[13.5px] font-semibold block" style={{ color: 'var(--mel-ink)' }}>{s.title}</span>
                        {s.workingTitle && (
                          <span className="melos-hand text-[12px] block" style={{ transform: 'none' }}>— {s.workingTitle}</span>
                        )}
                      </button>
                      {renderAssetBadges(s)}
                      <div className="flex items-center gap-2 mt-1">
                        {s.lyricsLockedAt && (
                          <span className="text-[8.5px] uppercase tracking-[0.12em] flex items-center gap-1" style={{ color: 'var(--mel-ok)' }}>
                            <Check size={8} />Lyrics locked
                          </span>
                        )}
                        {blocked.length > 0 && (
                          <span className="text-[8.5px] uppercase tracking-[0.12em] flex items-center gap-1" style={{ color: 'var(--mel-warn)' }}>
                            <AlertTriangle size={8} />{blocked.length} sample{blocked.length > 1 ? 's' : ''} to clear
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-2">
                      <select
                        value={s.state}
                        onChange={e => editSong(s.id, { state: e.target.value as MelosSong['state'] })}
                        aria-label={`${s.title} state`}
                        className="text-[10px] font-bold uppercase tracking-[0.1em] rounded-md px-2 py-1"
                        style={{ background: `${stateMeta(s.state).color}1f`, color: stateMeta(s.state).color, border: 0 }}
                      >
                        {SONG_STATES.map(o => <option key={o.key} value={o.key} style={{ background: '#111', color: '#eee' }}>{o.label}</option>)}
                      </select>
                    </td>

                    <td className="py-3 px-2">
                      <select
                        value={s.commitment}
                        onChange={e => editSong(s.id, { commitment: e.target.value as Commitment })}
                        aria-label={`${s.title} commitment`}
                        className="text-[10px] font-bold uppercase tracking-[0.1em] rounded-md px-2 py-1"
                        style={{ background: `${commitmentMeta(s.commitment).color}1f`, color: commitmentMeta(s.commitment).color, border: 0 }}
                      >
                        {COMMITMENTS.map(o => <option key={o.key} value={o.key} style={{ background: '#111', color: '#eee' }}>{o.label}</option>)}
                      </select>
                    </td>

                    <td className="py-3 px-2">
                      <Hearts value={s.love} onChange={v => editSong(s.id, { love: v })} size={12} />
                    </td>

                    <td className="py-3 px-2 w-[110px]">
                      <div className="flex items-center gap-2">
                        <div className="h-[4px] rounded-full flex-1 overflow-hidden" style={{ background: 'var(--mel-hover)' }}>
                          <i className="block h-full rounded-full" style={{ width: `${s.confidence}%`, background: 'var(--mel-accent)' }} />
                        </div>
                        <span className="text-[10px] tabular-nums" style={{ color: 'var(--mel-faint)' }}>{s.confidence}</span>
                      </div>
                    </td>

                    <td className="py-3 px-2 text-[11.5px] tabular-nums font-mono" style={{ color: 'var(--mel-dim)' }}>
                      {fmtDuration(songDuration(s))}
                    </td>

                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        {audioUrl ? (
                          <button
                            onClick={() => togglePlaySong(s)}
                            className="h-7 px-2.5 rounded-full text-[10px] font-bold flex items-center gap-1.5"
                            style={{
                              background: playingThis ? 'var(--mel-accent)' : 'rgba(6,214,160,0.14)',
                              color: playingThis ? '#12101A' : '#06D6A0',
                              border: 0,
                            }}
                          >
                            {playingThis ? <Pause size={10} /> : <Play size={10} />}
                            {playingThis ? 'Playing' : 'Play Audio'}
                          </button>
                        ) : null}
                        <button
                          onClick={() => { setTargetSongIdForUpload(s.id); rowInputRef.current?.click(); }}
                          className="h-7 px-2 rounded-lg text-[10px] flex items-center gap-1"
                          style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
                          title="Import or replace audio file for this song"
                        >
                          <Upload size={10} />
                          {audioUrl ? 'Replace' : 'Attach Audio'}
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openInPad(s)}
                          className="h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1"
                          style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: 0 }}
                          title="Write lyrics & sheet music in Pad"
                        >
                          <PenLine size={10} />Pad
                        </button>
                        <button
                          onClick={() => openInStand(s)}
                          className="h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1"
                          style={{ background: 'rgba(245,158,11,0.16)', color: '#FCD34D', border: 0 }}
                          title="Open in Chora Music Stand & Nashville Number System"
                        >
                          <BookOpen size={10} />Stand
                        </button>
                        <button
                          onClick={() => openInStudio(s)}
                          className="h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1"
                          style={{ background: 'rgba(208,188,255,0.12)', color: '#D0BCFF', border: 0 }}
                          title="Open DAW project in Chora Studio"
                        >
                          <Drum size={10} />Studio
                        </button>
                        {arrangements.length > 0 && (
                          <select
                            value=""
                            onChange={e => { if (e.target.value) addSongToArrangement(s.id, e.target.value); }}
                            className="h-7 px-1.5 rounded-lg text-[10px] outline-none"
                            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
                            title="Add song to an album arrangement"
                          >
                            <option value="">+ Arrange</option>
                            {arrangements.map(a => (
                              <option key={a.id} value={a.id} style={{ background: '#141418' }}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => { if (confirm(`Remove "${s.title}" from this production?`)) dropSong(s.id); }}
                          aria-label={`Remove ${s.title}`}
                          className="p-1.5 opacity-40 hover:opacity-100 transition-opacity"
                          style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TracklistRoom;
