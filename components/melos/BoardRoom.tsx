/**
 * Melos › Board — the freeform work board where all ideas and assets freely exist.
 * Paper tier.
 *
 * Upgraded with:
 * - Full multi-asset work board: Sticky Notes (`STICKY`), Notepads (`TEXT`), Tela Docs (`TELA`),
 *   Unfinished Tracks (`TRACK`), Audio Files (`AUDIO`), Samples (`SAMPLE`), Videos (`VIDEO`),
 *   Images (`IMAGE`), Links (`LINK`), and Color Swatches (`COLOR`).
 * - Auto-resizing Notepad text boxes: pasting or typing text into a Board note (or pasting
 *   directly onto the Board canvas) automatically resizes the notepad width & height so the
 *   FULL body of text is visible without internal scrollbars.
 * - Drag-and-drop & file import for audio, video, images, and text files.
 * - Inline audio playback + 1-click promotion of Board audio / unfinished tracks to the
 *   Tracklist or directly into an Album Arrangement.
 * - Powered by Tela integration (`openMelosBoardInTela`).
 * - Dedicated Mobile Layout (`vp.isPhone`) with Stream + Canvas views.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Type, StickyNote, Link2, Palette, Trash2, Image as ImageIcon, Filter,
  Music, Disc3, Video, Upload, Play, Pause, LayoutPanelTop, ArrowUpRight,
  Plus, Layers, Sparkles, ExternalLink, FileText,
} from 'lucide-react';
import { useMelos, Label } from './MelosWorkspace';
import { InspirationPin, PinKind, uid, newSong, fmtDuration } from '../../services/melosService';
import { openMelosBoardInTela } from '../../services/telaDomainAdapters';
import { auth } from '../../services/firebase';
import { newGrooveDoc } from '../../services/melos/beats/grooveDoc';
import { useViewport } from '../../hooks/useViewport';
import {
  ingestMelosAudioFile, isAudioFile, isVideoFile, isImageFile, cleanMediaTitle,
} from './melosAudioImport';

const SWATCHES = ['#4A3D5C', '#7A4A2E', '#2F4547', '#5E5544', '#6B0099', '#D40055', '#E9A85C', '#00DAF3'];
const STICKY_COLORS = ['#FEF08A', '#FDE68A', '#A7F3D0', '#BFDBFE', '#DDD6FE', '#FBCFE8'];

/** Compute optimal notepad width so pasted multi-line or long text reads cleanly as a full notepad. */
function computeNotepadWidth(text: string, currentW?: number): number {
  const len = (text || '').length;
  const maxLine = (text || '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  let target = 250;
  if (len > 600 || maxLine > 64) target = 420;
  else if (len > 260 || maxLine > 44) target = 340;
  else if (len > 110) target = 290;
  return Math.max(currentW || 240, target);
}

/** Auto-resizing notepad textarea that always expands to show the full body of text. */
const AutoSizingNotepad: React.FC<{
  pin: InspirationPin;
  isSticky?: boolean;
  onChangeText: (text: string, autoWidth: number, autoHeight: number) => void;
  onChangeTitle?: (title: string) => void;
}> = ({ pin, isSticky, onChangeText, onChangeTitle }) => {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const adjustSize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextH = Math.max(isSticky ? 96 : 84, el.scrollHeight + 6);
    el.style.height = `${nextH}px`;
  }, [isSticky]);

  useLayoutEffect(() => {
    adjustSize();
  }, [pin.text, pin.w, adjustSize]);

  useEffect(() => {
    window.addEventListener('resize', adjustSize);
    return () => window.removeEventListener('resize', adjustSize);
  }, [adjustSize]);

  const handleTextChange = (val: string) => {
    const el = taRef.current;
    let measuredH = 100;
    if (el) {
      el.style.height = 'auto';
      measuredH = Math.max(isSticky ? 96 : 84, el.scrollHeight + 8);
      el.style.height = `${measuredH}px`;
    }
    const nextW = computeNotepadWidth(val, pin.w);
    onChangeText(val, nextW, measuredH + 46);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {onChangeTitle && (
        <input
          value={pin.title || ''}
          onChange={e => onChangeTitle(e.target.value)}
          onPointerDown={e => e.stopPropagation()}
          placeholder={isSticky ? 'Sticky title…' : 'Notepad title…'}
          className="w-full bg-transparent border-0 outline-none text-[12px] font-bold"
          style={{ color: isSticky ? '#1F1B16' : 'var(--mel-ink)' }}
        />
      )}
      <textarea
        ref={taRef}
        value={pin.text || ''}
        onChange={e => handleTextChange(e.target.value)}
        onPaste={e => {
          // Stop canvas-level paste handler from duplicating when pasting inside an existing notepad
          e.stopPropagation();
          requestAnimationFrame(() => adjustSize());
        }}
        onPointerDown={e => e.stopPropagation()}
        placeholder={isSticky ? 'Jot a quick sticky note or paste lyrics…' : 'Write or paste any text — notepad auto-resizes to show the full body…'}
        aria-label={isSticky ? 'Sticky note' : 'Notepad text'}
        className={`w-full bg-transparent border-0 outline-none resize-none overflow-hidden ${isSticky ? 'melos-hand text-[15px] leading-[1.55]' : 'text-[13px] leading-[1.68]'}`}
        style={{
          color: isSticky ? '#1C1917' : 'var(--mel-ink)',
          transform: 'none',
          minHeight: isSticky ? 96 : 84,
        }}
      />
    </div>
  );
};

const BoardRoom: React.FC = () => {
  const {
    prodId, production, pins, savePin, editPin, dropPin,
    songs, arrangements, saveSong, addSongToArrangement, selectSong, goRoom,
  } = useMelos();
  const vp = useViewport();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [scope, setScope] = useState<'ALL' | 'RECORD' | string>('ALL');
  const [kindFilter, setKindFilter] = useState<'ALL' | 'NOTES' | 'AUDIO' | 'MEDIA' | 'TELA'>('ALL');
  const [mobileViewMode, setMobileViewMode] = useState<'stream' | 'canvas'>('stream');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingTela, setOpeningTela] = useState(false);
  const [playingPinId, setPlayingPinId] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [promotedPinIds, setPromotedPinIds] = useState<Record<string, string>>({});

  const shown = useMemo(() => {
    return pins.filter(p => {
      if (scope === 'RECORD' && p.songId) return false;
      if (scope !== 'ALL' && scope !== 'RECORD' && p.songId !== scope) return false;
      if (kindFilter === 'NOTES') return p.kind === 'TEXT' || p.kind === 'STICKY';
      if (kindFilter === 'AUDIO') return p.kind === 'AUDIO' || p.kind === 'TRACK' || p.kind === 'SAMPLE';
      if (kindFilter === 'MEDIA') return p.kind === 'IMAGE' || p.kind === 'VIDEO' || p.kind === 'LINK' || p.kind === 'COLOR';
      if (kindFilter === 'TELA') return p.kind === 'TELA';
      return true;
    });
  }, [pins, scope, kindFilter]);

  const nextCoords = useCallback((idxOffset = 0) => {
    const col = (pins.length + idxOffset) % 3;
    const row = Math.floor((pins.length + idxOffset) / 3);
    return {
      x: 36 + col * 310 + Math.round(Math.random() * 24),
      y: 36 + row * 210 + Math.round(Math.random() * 20),
    };
  }, [pins.length]);

  const addPinOfKind = (kind: PinKind, overrides?: Partial<InspirationPin>) => {
    const pos = nextCoords();
    const base: InspirationPin = {
      id: uid('pin'),
      kind,
      x: pos.x,
      y: pos.y,
      w: kind === 'COLOR' ? 150 : kind === 'TEXT' || kind === 'STICKY' ? 280 : 290,
      h: kind === 'COLOR' ? 140 : undefined,
      rotation: kind === 'STICKY' ? (Math.random() * 2.4 - 1.2) : 0,
      songId: scope !== 'ALL' && scope !== 'RECORD' ? scope : undefined,
      createdAt: Date.now(),
      ...overrides,
    };

    if (kind === 'TEXT' && !base.text) {
      base.title = 'Studio Notepad';
      base.text = '';
    }
    if (kind === 'STICKY' && !base.text) {
      base.title = 'Quick Idea';
      base.text = '';
      base.color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
    }
    if (kind === 'COLOR' && !base.color) {
      base.color = SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      base.title = base.color;
    }
    if (kind === 'LINK' && !base.title) {
      base.title = 'Inspiration Link';
      base.url = '';
    }
    if (kind === 'TELA' && !base.title) {
      base.title = 'Tela Creative Spec';
      base.text = 'Bidirectional Tela block on the Board — open in Tela to expand with tables, callouts, and embeds.';
    }
    if ((kind === 'TRACK' || kind === 'AUDIO' || kind === 'SAMPLE') && !base.title) {
      base.title = kind === 'TRACK' ? 'Unfinished Track Idea' : kind === 'SAMPLE' ? 'Sample Chop' : 'Audio Reference';
      base.trackTag = kind === 'TRACK' ? 'UNFINISHED' : kind === 'SAMPLE' ? 'SAMPLE' : 'IDEA';
    }
    savePin(base);
  };

  // Handle pasting text directly onto the Board surface -> creates an auto-sized Notepad!
  useEffect(() => {
    const onGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return; // Handled by the focused input/textarea itself
      }
      const pastedText = e.clipboardData?.getData('text/plain');
      if (!pastedText || !pastedText.trim()) return;
      e.preventDefault();
      const firstLine = pastedText.trim().split('\n')[0]?.slice(0, 42) || 'Pasted Notepad';
      const w = computeNotepadWidth(pastedText, 280);
      const lineCount = pastedText.split('\n').length;
      const estimatedH = Math.max(120, lineCount * 22 + 64);
      addPinOfKind('TEXT', {
        title: firstLine,
        text: pastedText,
        w,
        h: estimatedH,
        rotation: 0,
      });
    };
    window.addEventListener('paste', onGlobalPaste);
    return () => window.removeEventListener('paste', onGlobalPaste);
  });

  // Handle dropping or selecting any files (audio, video, image, text) onto the Board
  const handleFilesDrop = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const pos = nextCoords(i);
        if (isAudioFile(file)) {
          const ingested = await ingestMelosAudioFile(file);
          savePin({
            id: uid('pin'),
            kind: 'TRACK',
            title: ingested.title,
            url: ingested.url,
            durationSec: ingested.durationSec,
            trackTag: 'UNFINISHED',
            note: ingested.feel?.bpm ? `${Math.round(ingested.feel.bpm)} BPM · Dropped on Board` : 'Audio dropped on Board',
            x: pos.x,
            y: pos.y,
            w: 300,
            rotation: 0,
            songId: scope !== 'ALL' && scope !== 'RECORD' ? scope : undefined,
            createdAt: Date.now(),
          });
        } else if (isVideoFile(file)) {
          const url = URL.createObjectURL(file);
          savePin({
            id: uid('pin'),
            kind: 'VIDEO',
            title: cleanMediaTitle(file.name),
            url,
            x: pos.x,
            y: pos.y,
            w: 310,
            rotation: 0,
            songId: scope !== 'ALL' && scope !== 'RECORD' ? scope : undefined,
            createdAt: Date.now(),
          });
        } else if (isImageFile(file)) {
          const url = URL.createObjectURL(file);
          savePin({
            id: uid('pin'),
            kind: 'IMAGE',
            title: cleanMediaTitle(file.name),
            url,
            x: pos.x,
            y: pos.y,
            w: 280,
            rotation: 0,
            songId: scope !== 'ALL' && scope !== 'RECORD' ? scope : undefined,
            createdAt: Date.now(),
          });
        } else if (file.type.startsWith('text/') || /\.(txt|md|lrc)$/i.test(file.name)) {
          const text = await file.text();
          savePin({
            id: uid('pin'),
            kind: 'TEXT',
            title: cleanMediaTitle(file.name),
            text,
            x: pos.x,
            y: pos.y,
            w: computeNotepadWidth(text, 290),
            rotation: 0,
            songId: scope !== 'ALL' && scope !== 'RECORD' ? scope : undefined,
            createdAt: Date.now(),
          });
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // Play / Pause inline audio on a Board card
  const togglePlayPinAudio = (p: InspirationPin) => {
    if (!p.url || !audioRef.current) return;
    if (playingPinId === p.id && isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }
    if (playingPinId !== p.id) {
      audioRef.current.src = p.url;
      setPlayingPinId(p.id);
    }
    void audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => setIsPlayingAudio(false));
  };

  // Promote a Board audio/unfinished track card into a full Song on the Tracklist (and optionally an Arrangement)
  const promotePinToSong = (p: InspirationPin, arrangementId?: string) => {
    const existingSongId = promotedPinIds[p.id] || p.songId;
    if (existingSongId && songs.some(s => s.id === existingSongId)) {
      if (arrangementId) addSongToArrangement(existingSongId, arrangementId);
      selectSong(existingSongId);
      return existingSongId;
    }
    const title = p.title || 'Board Idea';
    const groove = newGrooveDoc(auth.currentUser?.uid || '', title);
    const created = newSong(songs.length, {
      title,
      commitment: 'WORKING_ON_IT',
      state: p.url ? 'DEMO' : 'SPARK',
      grooveId: groove.id,
      durationSec: p.durationSec || 180,
      notes: p.note || p.text || 'Promoted from the Melos Work Board',
      trackRef: p.url
        ? {
            title,
            url: p.url,
            durationSec: p.durationSec || 180,
            source: 'UPLOAD',
          }
        : undefined,
      takes: p.url
        ? [
            {
              id: `take_${Date.now().toString(36)}`,
              label: `${title} (Board)`,
              url: p.url,
              source: 'UPLOAD',
              durationSec: p.durationSec,
              createdAt: Date.now(),
            },
          ]
        : [],
    });
    saveSong(created);
    editPin(p.id, { songId: created.id });
    setPromotedPinIds(cur => ({ ...cur, [p.id]: created.id }));
    if (arrangementId) {
      addSongToArrangement(created.id, arrangementId);
    }
    return created.id;
  };

  const onPointerDown = (e: React.PointerEvent, p: InspirationPin) => {
    if (vp.isPhone && mobileViewMode === 'stream') return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id: p.id, dx: e.clientX - rect.left - p.x, dy: e.clientY - rect.top - p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.round(e.clientX - rect.left - drag.dx));
    const y = Math.max(0, Math.round(e.clientY - rect.top - drag.dy));
    editPin(drag.id, { x, y });
  };

  const endDrag = () => setDrag(null);

  // Render an individual Board Card (used in both 2D Canvas and Mobile Stream)
  const renderPinCard = (p: InspirationPin, isStreamCard = false) => {
    const song = p.songId ? songs.find(s => s.id === p.songId) : null;
    const isSticky = p.kind === 'STICKY';
    const isPlayingThis = playingPinId === p.id && isPlayingAudio;

    return (
      <div
        key={p.id}
        className={`${isStreamCard ? 'w-full' : 'absolute'} group`}
        style={
          isStreamCard
            ? undefined
            : {
                left: p.x,
                top: p.y,
                width: p.w || 260,
                transform: `rotate(${p.rotation || 0}deg)`,
                cursor: drag?.id === p.id ? 'grabbing' : 'grab',
              }
        }
        onPointerDown={isStreamCard ? undefined : e => onPointerDown(e, p)}
      >
        <div
          className="melos-sheet p-3.5 relative flex flex-col gap-2 transition-shadow"
          style={
            isSticky
              ? {
                  background: p.color || '#FEF08A',
                  color: '#1C1917',
                  border: '1px solid rgba(0,0,0,0.12)',
                  boxShadow: '0 14px 28px -10px rgba(0,0,0,0.45)',
                }
              : p.kind === 'TELA'
              ? {
                  border: '1px solid rgba(212,0,85,0.4)',
                  boxShadow: '0 12px 30px -10px rgba(107,0,153,0.35)',
                }
              : undefined
          }
        >
          {/* Card Top Type Badge + Delete */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[8.5px] font-extrabold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full flex items-center gap-1"
              style={
                isSticky
                  ? { background: 'rgba(0,0,0,0.1)', color: '#1C1917' }
                  : p.kind === 'TELA'
                  ? { background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff' }
                  : p.kind === 'TRACK' || p.kind === 'AUDIO' || p.kind === 'SAMPLE'
                  ? { background: 'rgba(244,162,97,0.18)', color: 'var(--mel-accent)' }
                  : { background: 'var(--mel-hover)', color: 'var(--mel-faint)' }
              }
            >
              {p.kind === 'TEXT' ? 'Notepad' : p.kind === 'STICKY' ? 'Sticky Note' : p.kind === 'TRACK' ? (p.trackTag || 'Unfinished Track') : p.kind}
            </span>

            {isSticky && (
              <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
                {STICKY_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => editPin(p.id, { color: c })}
                    className="w-3 h-3 rounded-full"
                    style={{
                      background: c,
                      border: p.color === c ? '1.5px solid #111' : '1px solid rgba(0,0,0,0.2)',
                    }}
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => dropPin(p.id)}
              onPointerDown={e => e.stopPropagation()}
              aria-label="Remove pin"
              className="w-5 h-5 rounded-full flex items-center justify-center opacity-60 hover:opacity-100"
              style={{
                background: isSticky ? 'rgba(0,0,0,0.08)' : 'var(--mel-hover)',
                color: isSticky ? '#1C1917' : 'var(--mel-faint)',
                border: 0,
              }}
            >
              <Trash2 size={10} />
            </button>
          </div>

          {/* 1) NOTEPAD (`TEXT`) & STICKY NOTE (`STICKY`) — Auto-resizes to fit full body of text */}
          {(p.kind === 'TEXT' || p.kind === 'STICKY') && (
            <AutoSizingNotepad
              pin={p}
              isSticky={isSticky}
              onChangeTitle={title => editPin(p.id, { title })}
              onChangeText={(text, autoWidth, autoHeight) => {
                editPin(p.id, {
                  text,
                  w: isStreamCard ? p.w : autoWidth,
                  h: autoHeight,
                });
              }}
            />
          )}

          {/* 2) TELA POWERED CARD (`TELA`) */}
          {p.kind === 'TELA' && (
            <div className="flex flex-col gap-2" onPointerDown={e => e.stopPropagation()}>
              <AutoSizingNotepad
                pin={p}
                onChangeTitle={title => editPin(p.id, { title })}
                onChangeText={(text, autoWidth, autoHeight) => {
                  editPin(p.id, { text, w: isStreamCard ? p.w : autoWidth, h: autoHeight });
                }}
              />
              <button
                onClick={async () => {
                  setOpeningTela(true);
                  try {
                    await openMelosBoardInTela(prodId, pins, songs, auth.currentUser?.uid || 'local');
                  } finally {
                    setOpeningTela(false);
                  }
                }}
                className="w-full py-1.5 px-2.5 rounded-lg text-[9.5px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
              >
                <LayoutPanelTop size={10} />Open in Tela Engine
              </button>
            </div>
          )}

          {/* 3) AUDIO, UNFINISHED TRACK & SAMPLE CARDS (`AUDIO` | `TRACK` | `SAMPLE`) */}
          {(p.kind === 'AUDIO' || p.kind === 'TRACK' || p.kind === 'SAMPLE') && (
            <div className="flex flex-col gap-2" onPointerDown={e => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                {p.url ? (
                  <button
                    onClick={() => togglePlayPinAudio(p)}
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
                  >
                    {isPlayingThis ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                  </button>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px dashed var(--mel-edge)' }}
                    title="Attach audio file"
                  >
                    <Upload size={12} />
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <input
                    value={p.title || ''}
                    onChange={e => editPin(p.id, { title: e.target.value })}
                    placeholder="Track / Sample title…"
                    className="w-full bg-transparent border-0 outline-none text-[12.5px] font-bold"
                    style={{ color: 'var(--mel-ink)' }}
                  />
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--mel-faint)' }}>
                    {p.durationSec ? <span className="font-mono">{fmtDuration(p.durationSec)}</span> : null}
                    <select
                      value={p.trackTag || 'UNFINISHED'}
                      onChange={e => editPin(p.id, { trackTag: e.target.value as InspirationPin['trackTag'] })}
                      className="bg-transparent text-[9.5px] font-bold uppercase tracking-wider outline-none"
                      style={{ color: 'var(--mel-accent)', border: 0 }}
                    >
                      <option value="UNFINISHED" style={{ background: '#141418' }}>Unfinished Track</option>
                      <option value="IDEA" style={{ background: '#141418' }}>Voice / Beat Idea</option>
                      <option value="DEMO" style={{ background: '#141418' }}>Rough Demo</option>
                      <option value="STEM" style={{ background: '#141418' }}>Stem / Loop</option>
                      <option value="SAMPLE" style={{ background: '#141418' }}>Sample Chop</option>
                    </select>
                  </div>
                </div>
              </div>

              <textarea
                value={p.note || ''}
                onChange={e => editPin(p.id, { note: e.target.value })}
                placeholder="Notes on this track idea, sample clearance, or arrangement…"
                rows={2}
                className="w-full bg-transparent outline-none resize-none text-[11.5px] rounded-lg p-2"
                style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
              />

              {/* Promote to Tracklist or Arrangement */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => {
                    const sid = promotePinToSong(p);
                    selectSong(sid);
                    goRoom('tracklist');
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
                  style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
                  title="Promote this Board track to the Tracklist"
                >
                  <ArrowUpRight size={10} />To Tracklist
                </button>

                {arrangements.length > 0 && (
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) {
                        promotePinToSong(p, e.target.value);
                      }
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg text-[9.5px] font-bold uppercase tracking-wider outline-none"
                    style={{ background: 'rgba(244,162,97,0.14)', color: 'var(--mel-accent)', border: '1px solid rgba(244,162,97,0.3)' }}
                  >
                    <option value="">+ Arrangement…</option>
                    {arrangements.map(a => (
                      <option key={a.id} value={a.id} style={{ background: '#141418' }}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* 4) VIDEO CARD (`VIDEO`) */}
          {p.kind === 'VIDEO' && (
            <div className="flex flex-col gap-2" onPointerDown={e => e.stopPropagation()}>
              <input
                value={p.title || ''}
                onChange={e => editPin(p.id, { title: e.target.value })}
                placeholder="Video clip title…"
                className="w-full bg-transparent border-0 outline-none text-[12px] font-bold"
                style={{ color: 'var(--mel-ink)' }}
              />
              {p.url ? (
                <video src={p.url} controls className="w-full rounded-lg max-h-[190px] bg-black" />
              ) : (
                <input
                  value={p.url || ''}
                  onChange={e => editPin(p.id, { url: e.target.value })}
                  placeholder="Paste video URL or drop an MP4/WebM file…"
                  className="w-full bg-transparent border-0 outline-none text-[11px]"
                  style={{ color: 'var(--mel-dim)' }}
                />
              )}
            </div>
          )}

          {/* 5) IMAGE CARD (`IMAGE`) */}
          {p.kind === 'IMAGE' && (
            <div className="flex flex-col gap-2" onPointerDown={e => e.stopPropagation()}>
              {p.url ? (
                <img src={p.url} alt={p.title || 'Pinned image'} className="w-full rounded-lg block max-h-[220px] object-cover" draggable={false} />
              ) : null}
              <input
                value={p.title || ''}
                onChange={e => editPin(p.id, { title: e.target.value })}
                placeholder="Image caption…"
                className="w-full bg-transparent border-0 outline-none text-[11.5px] font-semibold"
                style={{ color: 'var(--mel-ink)' }}
              />
              <input
                value={p.url || ''}
                onChange={e => editPin(p.id, { url: e.target.value })}
                placeholder="Paste image URL or drop image file…"
                className="w-full bg-transparent border-0 outline-none text-[10px]"
                style={{ color: 'var(--mel-faint)' }}
              />
            </div>
          )}

          {/* 6) LINK CARD (`LINK`) */}
          {p.kind === 'LINK' && (
            <div className="flex flex-col gap-1.5" onPointerDown={e => e.stopPropagation()}>
              <input
                value={p.title || ''}
                onChange={e => editPin(p.id, { title: e.target.value })}
                placeholder="Reference title…"
                className="w-full bg-transparent border-0 outline-none text-[12.5px] font-bold"
                style={{ color: 'var(--mel-ink)' }}
              />
              <div className="flex items-center gap-1.5">
                <input
                  value={p.url || ''}
                  onChange={e => editPin(p.id, { url: e.target.value })}
                  placeholder="https://…"
                  className="flex-1 bg-transparent border-0 outline-none text-[10.5px] truncate"
                  style={{ color: 'var(--mel-accent)' }}
                />
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded"
                    style={{ color: 'var(--mel-accent)' }}
                    title="Open link"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <textarea
                value={p.note || ''}
                onChange={e => editPin(p.id, { note: e.target.value })}
                placeholder="Why this link matters for the record…"
                rows={2}
                className="w-full bg-transparent border-0 outline-none resize-none text-[11px]"
                style={{ color: 'var(--mel-dim)' }}
              />
            </div>
          )}

          {/* 7) COLOR SWATCH (`COLOR`) */}
          {p.kind === 'COLOR' && (
            <div onPointerDown={e => e.stopPropagation()}>
              <div className="rounded-lg mb-2" style={{ height: (p.h || 130) - 54, background: p.color }} />
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={p.color || '#7A4A2E'}
                  onChange={e => editPin(p.id, { color: e.target.value })}
                  className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  value={p.title || ''}
                  onChange={e => editPin(p.id, { title: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[10.5px]"
                  style={{ color: 'var(--mel-dim)', fontFamily: 'var(--font-mono-tech, monospace)' }}
                />
              </div>
            </div>
          )}

          {song && (
            <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] pt-1" style={{ color: isSticky ? '#44403C' : 'var(--mel-faint)' }}>
              Linked: {song.title}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      onDragOver={e => { e.preventDefault(); setIsDraggingFiles(true); }}
      onDragLeave={() => setIsDraggingFiles(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDraggingFiles(false);
        if (e.dataTransfer.files?.length) void handleFilesDrop(e.dataTransfer.files);
      }}
    >
      <audio
        ref={audioRef}
        onEnded={() => setIsPlayingAudio(false)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*,image/*,.txt,.md,.lrc"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files?.length) void handleFilesDrop(e.target.files);
          e.target.value = '';
        }}
      />

      {/* ── Top Board Toolbar ──────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3.5 sm:px-7 py-2.5 border-b overflow-x-auto shrink-0"
        style={{ borderColor: 'var(--mel-edge)', background: 'var(--mel-rail)' }}
      >
        <Label className="shrink-0 mr-1">Work Board</Label>

        {([
          ['TEXT', 'Notepad', <Type size={11} key="t" />],
          ['STICKY', 'Sticky', <StickyNote size={11} key="s" />],
          ['TRACK', 'Unfinished Track', <Disc3 size={11} key="tr" />],
          ['SAMPLE', 'Sample', <Music size={11} key="sa" />],
          ['TELA', 'Tela Doc', <Sparkles size={11} key="te" />],
          ['LINK', 'Link', <Link2 size={11} key="l" />],
          ['IMAGE', 'Image', <ImageIcon size={11} key="i" />],
          ['VIDEO', 'Video', <Video size={11} key="v" />],
          ['COLOR', 'Swatch', <Palette size={11} key="c" />],
        ] as [PinKind, string, React.ReactNode][]).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => addPinOfKind(k)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9.5px] font-bold uppercase tracking-[0.11em] whitespace-nowrap shrink-0"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
          >
            {icon}{label}
          </button>
        ))}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9.5px] font-bold uppercase tracking-[0.11em] whitespace-nowrap shrink-0"
          style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
        >
          <Upload size={11} />
          {uploading ? 'Importing…' : 'Import Files'}
        </button>

        <div className="flex-1" />

        <button
          disabled={openingTela}
          onClick={async () => {
            setOpeningTela(true);
            try {
              await openMelosBoardInTela(prodId, pins, songs, auth.currentUser?.uid || 'local');
            } finally {
              setOpeningTela(false);
            }
          }}
          className="px-3 py-1.5 rounded-lg text-[9.5px] font-extrabold uppercase tracking-[0.12em] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
          title="Open the entire Work Board inside the Tela Document Engine"
        >
          <LayoutPanelTop size={11} />
          {openingTela ? 'Opening…' : 'Powered by Tela'}
        </button>
      </div>

      {/* ── Secondary Filter & Scope Bar ───────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2 px-3.5 sm:px-7 py-2 border-b overflow-x-auto shrink-0"
        style={{ borderColor: 'var(--mel-edge)', background: 'var(--mel-paper)' }}
      >
        <div className="flex items-center gap-1">
          {([
            ['ALL', `All (${pins.length})`],
            ['NOTES', 'Notepads & Stickies'],
            ['AUDIO', 'Audio, Samples & Unfinished'],
            ['MEDIA', 'Images, Video & Links'],
            ['TELA', 'Tela Docs'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className="px-2.5 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider whitespace-nowrap"
              style={{
                background: kindFilter === k ? 'var(--mel-hover)' : 'transparent',
                color: kindFilter === k ? 'var(--mel-accent)' : 'var(--mel-faint)',
                border: kindFilter === k ? '1px solid var(--mel-accent)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {vp.isPhone && (
            <div className="flex rounded-lg p-0.5" style={{ background: 'var(--mel-hover)' }}>
              <button
                onClick={() => setMobileViewMode('stream')}
                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{
                  background: mobileViewMode === 'stream' ? 'var(--mel-accent)' : 'transparent',
                  color: mobileViewMode === 'stream' ? '#12101A' : 'var(--mel-dim)',
                  border: 0,
                }}
              >Stream</button>
              <button
                onClick={() => setMobileViewMode('canvas')}
                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{
                  background: mobileViewMode === 'canvas' ? 'var(--mel-accent)' : 'transparent',
                  color: mobileViewMode === 'canvas' ? '#12101A' : 'var(--mel-dim)',
                  border: 0,
                }}
              >Canvas</button>
            </div>
          )}

          <Filter size={11} style={{ color: 'var(--mel-faint)' }} />
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            aria-label="Filter pins by song"
            className="text-[10.5px] rounded-lg px-2 py-1"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
          >
            <option value="ALL" style={{ background: '#111' }}>All Board Assets</option>
            <option value="RECORD" style={{ background: '#111' }}>Album-wide only</option>
            {songs.map(s => <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.title}</option>)}
          </select>
        </div>
      </div>

      {/* Dropzone Overlay */}
      {isDraggingFiles && (
        <div
          className="mx-5 mt-3 p-4 rounded-2xl text-center text-xs font-bold uppercase tracking-wider shrink-0"
          style={{ background: 'rgba(244,162,97,0.14)', border: '1.5px dashed var(--mel-accent)', color: 'var(--mel-accent)' }}
        >
          Drop audio files, unfinished tracks, samples, images, videos, or text files onto the Work Board
        </div>
      )}

      {/* ── Board Surface (Mobile Stream vs Freeform 2D Canvas) ────────────── */}
      {vp.isPhone && mobileViewMode === 'stream' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3 pb-10">
          {shown.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[13px] m-0" style={{ color: 'var(--mel-faint)' }}>
                Throw anything on the Board — sticky notes, Tela docs, links, images, videos, samples, or unfinished tracks.
              </p>
            </div>
          ) : (
            shown.map(p => renderPinCard(p, true))
          )}
        </div>
      ) : (
        <div
          ref={surfaceRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="relative flex-1 overflow-auto"
          style={{ minHeight: 480, touchAction: 'pan-x pan-y' }}
        >
          {shown.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
              <p className="text-[13px] m-0 text-center max-w-md leading-relaxed" style={{ color: 'var(--mel-faint)' }}>
                Drop audio files, unfinished tracks, samples, images, videos, or links anywhere on the Board —
                or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono text-[11px]">Ctrl/Cmd+V</kbd> to paste text into an auto-sizing notepad.
              </p>
            </div>
          )}

          {shown.map(p => renderPinCard(p, false))}
        </div>
      )}
    </div>
  );
};

export default BoardRoom;
