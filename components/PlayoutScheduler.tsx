import React, { useMemo, useRef, useState } from 'react';
import {
  Film, DollarSign, Radio, Megaphone, Scissors, Copy, ClipboardPaste, Trash2, Plus,
  GripVertical, ChevronUp, ChevronDown, Save, RefreshCw, Clock, FileText, Download,
  Tv, Music2, CircleDot, AlertTriangle, CopyPlus,
} from 'lucide-react';
import { FastChannelSchedule, FastChannelSlot, FastChannelSlotType, ChannelBumper, Video } from '../types';
import { slotDurationSec, buildAsRunLog, localMidnightMs, DAY_SEC } from '../services/fastChannelTimeline';

/**
 * PlayoutScheduler — a graphical, drag-and-drop LINEAR timeline for a FAST channel or radio station.
 * Rich manual playout controls: reorder by drag, cut/copy/paste/duplicate, insert ad breaks, bumpers
 * and channel promos between content, set mid-roll ad markers inside a program, flag Reello replays,
 * per-weekday schedules, a midnight-anchored 24h loop that never clips an asset (off-air "resumes at
 * midnight" card), and an as-run log + exportable report proving exactly what played and when.
 */

type DayTab = 'every' | 0 | 1 | 2 | 3 | 4 | 5 | 6;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_META: Record<FastChannelSlotType, { label: string; color: string; icon: React.ReactNode }> = {
  VIDEO: { label: 'Program', color: '#6B0099', icon: <Film size={12} /> },
  PUBLIC_DOMAIN: { label: 'Public Domain', color: '#2563eb', icon: <Film size={12} /> },
  BUMPER: { label: 'Bumper', color: '#0d9488', icon: <CircleDot size={12} /> },
  AD_BREAK: { label: 'Ad Break', color: '#ca8a04', icon: <DollarSign size={12} /> },
  LIVE_INTERRUPT: { label: 'Live', color: '#dc2626', icon: <Radio size={12} /> },
};

const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s ? s + 's' : ''}`.trim() : `${s}s`;
};
const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export interface LiveAudioSource {
  kind: 'reello_live' | 'live_talk' | 'podcast';
  id?: string;
  url?: string;
  title: string;
  durationSec?: number;
}

interface Props {
  schedule: FastChannelSchedule;
  onChange: (next: FastChannelSchedule) => void;
  videos: Video[];
  bumpers: ChannelBumper[];
  adDurationSeconds: number;
  onSave: () => void;
  saving?: boolean;
  /** 'tv' = FAST video channel, 'radio' = audio station. TV and radio run side-by-side (a parent
   *  station switch chooses which one this editor targets — they are never mutually exclusive). */
  mode?: 'tv' | 'radio';
  /** Live audio/video feeds that can be scheduled as LIVE slots — the account's Reello live stream,
   *  a Live Talk room, or a podcast episode (radio can break to live audio inline). */
  liveSources?: LiveAudioSource[];
  /** Radio: the station's existing `radioSettings.stingers` URLs — surfaced in the Stingers rail so
   *  the scheduler taps the SAME station assets rather than a parallel set. */
  stingers?: string[];
  /** Radio: the station's existing `radioSettings.ads` URLs — surfaced in the Ads rail. */
  audioAds?: string[];
  /** Plajah platform library assets any broadcast can pull branding from (bumpers/promos/ads/programs). */
  platformAssets?: import('../types').PlatformMediaAsset[];
}

const PlayoutScheduler: React.FC<Props> = ({ schedule, onChange, videos, bumpers, adDurationSeconds, onSave, saving, mode = 'tv', liveSources = [], stingers = [], audioAds = [], platformAssets = [] }) => {
  const isRadio = mode === 'radio';
  const stingerName = (url: string) => { try { return decodeURIComponent(url.split('/').pop() || 'Station ID').split('?')[0]; } catch { return 'Station ID'; } };
  const newStinger = (url: string): FastChannelSlot => ({ id: `sting_${Date.now()}`, type: 'BUMPER', order: 0, assetKind: 'audio', bumperUrl: url, bumperTitle: stingerName(url), bumperDurationSeconds: 8 });
  const newAudioAd = (url: string): FastChannelSlot => ({ id: `aad_${Date.now()}`, type: 'VIDEO', order: 0, assetKind: 'audio', videoUrl: url, videoTitle: stingerName(url) || 'Ad', videoDurationSeconds: 30 });
  const [day, setDay] = useState<DayTab>('every');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clip, setClip] = useState<FastChannelSlot | null>(null);
  const [rail, setRail] = useState<'library' | 'bumpers' | 'promos' | 'ads' | 'live'>('library');
  const [showReport, setShowReport] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // The slot list currently being edited: the per-day override when a weekday tab is active, else the
  // shared "every day" loop. A weekday tab seeds its list from the default loop on first edit.
  const editing: FastChannelSlot[] = useMemo(() => {
    if (day === 'every') return schedule.slots || [];
    return schedule.weeklySlots?.[day] ?? schedule.slots ?? [];
  }, [schedule, day]);

  const commit = (slots: FastChannelSlot[]) => {
    const reindexed = slots.map((s, i) => ({ ...s, order: i }));
    if (day === 'every') { onChange({ ...schedule, slots: reindexed }); return; }
    onChange({ ...schedule, weeklySlots: { ...(schedule.weeklySlots || {}), [day]: reindexed } });
  };

  const usesPerDay = day !== 'every' && !!schedule.weeklySlots?.[day];

  // ── day math ──────────────────────────────────────────────────────────────
  const totalSec = editing.reduce((a, s) => a + slotDurationSec(s), 0);
  const overflows = totalSec > DAY_SEC;
  const fillPct = Math.min(100, (totalSec / DAY_SEC) * 100);
  const midnight = localMidnightMs(Date.now());
  const asRun = useMemo(() => buildAsRunLog(editing, midnight), [editing, midnight]);
  // running start offset (sec) for each slot, for the on-screen clock times
  const starts = useMemo(() => {
    const arr: number[] = []; let acc = 0;
    for (const s of editing) { arr.push(acc); acc += slotDurationSec(s); }
    return arr;
  }, [editing]);

  // ── slot ops ──────────────────────────────────────────────────────────────
  const patchSlot = (id: string, patch: Partial<FastChannelSlot>) =>
    commit(editing.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeSlot = (id: string) => { commit(editing.filter(s => s.id !== id)); if (selectedId === id) setSelectedId(null); };
  const duplicateSlot = (id: string) => {
    const idx = editing.findIndex(s => s.id === id); if (idx < 0) return;
    const copy = { ...editing[idx], id: `${editing[idx].type.toLowerCase()}_${Date.now()}` };
    commit([...editing.slice(0, idx + 1), copy, ...editing.slice(idx + 1)]);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const t = idx + dir; if (t < 0 || t >= editing.length) return;
    const s = [...editing]; [s[idx], s[t]] = [s[t], s[idx]]; commit(s);
  };
  const insertAt = (idx: number, slot: FastChannelSlot) =>
    commit([...editing.slice(0, idx), slot, ...editing.slice(idx)]);
  const append = (slot: FastChannelSlot) => commit([...editing, slot]);

  const newAd = (): FastChannelSlot => ({ id: `ad_${Date.now()}`, type: 'AD_BREAK', order: 0, adDurationSeconds });
  const newBumper = (b: ChannelBumper, promo = false): FastChannelSlot => ({
    id: `bmp_${b.id}_${Date.now()}`, type: 'BUMPER', order: 0,
    bumperId: b.id, bumperUrl: b.url, bumperTitle: b.title, bumperDurationSeconds: b.durationSeconds || 15,
    isPromo: promo || b.type === 'PROMO', bugLabel: promo || b.type === 'PROMO' ? 'PROMO' : undefined,
  });
  const newVideo = (v: Video): FastChannelSlot => ({
    id: `vid_${v.id}_${Date.now()}`, type: 'VIDEO', order: 0,
    // Resolve a Mux id to its master .m3u8 so the slot is playable (Reello videos often carry only a
    // muxPlaybackId, not a direct url) — matches slotsFromVideos / the shared resolver.
    videoId: v.id, videoUrl: (v as any).muxPlaybackId ? `https://stream.mux.com/${(v as any).muxPlaybackId}.m3u8` : (v.url || ''),
    videoTitle: v.title, videoThumbnail: v.thumbnailUrl || v.coverImageUrl,
    // Real length only when known (>0), else leave undefined so slotDurationSec uses the default block.
    videoDurationSeconds: Math.round(Number((v as any).duration) || 0) > 0 ? Math.round(Number((v as any).duration)) : undefined,
    isReplay: !!(v as any).isLiveRecording, bugLabel: (v as any).isLiveRecording ? 'REPLAY' : undefined,
    assetKind: isRadio ? 'audio' : 'video',
  });
  const newLive = (src: LiveAudioSource): FastChannelSlot => ({
    id: `live_${src.kind}_${Date.now()}`, type: 'LIVE_INTERRUPT', order: 0,
    assetKind: isRadio ? 'audio' : 'video',
    liveSourceKind: src.kind, liveSourceId: src.id, liveSourceUrl: src.url,
    liveSourceTitle: src.title, videoTitle: src.title,
    liveInterruptMaxDurationSeconds: src.durationSec || 1800,
    bugLabel: 'LIVE',
  });

  // clipboard
  const cut = (id: string) => { const s = editing.find(x => x.id === id); if (s) { setClip(s); removeSlot(id); } };
  const copy = (id: string) => { const s = editing.find(x => x.id === id); if (s) setClip(s); };
  const paste = () => {
    if (!clip) return;
    const pasted = { ...clip, id: `${clip.type.toLowerCase()}_${Date.now()}` };
    const idx = selectedId ? editing.findIndex(s => s.id === selectedId) + 1 : editing.length;
    insertAt(idx, pasted);
  };

  // drag reorder
  const onDrop = (to: number) => {
    const from = dragFrom.current; dragFrom.current = null; setDragOver(null);
    if (from === null || from === to) return;
    const s = [...editing]; const [m] = s.splice(from, 1); s.splice(from < to ? to - 1 : to, 0, m); commit(s);
  };

  const setPerDay = (on: boolean) => {
    if (day === 'every') return;
    const wk = { ...(schedule.weeklySlots || {}) };
    if (on) wk[day] = (schedule.weeklySlots?.[day] ?? schedule.slots ?? []).map(s => ({ ...s }));
    else delete wk[day];
    onChange({ ...schedule, weeklySlots: wk });
  };

  const exportCsv = () => {
    const rows = [['Start', 'End', 'Type', 'Title', 'Duration (s)', 'Ad', 'Replay', 'Promo']];
    asRun.forEach(e => rows.push([
      new Date(e.startMs).toISOString(), new Date(e.endMs).toISOString(), e.type, e.title.replace(/"/g, "'"),
      String(e.durationSec), e.isAd ? 'YES' : '', e.isReplay ? 'YES' : '', e.isPromo ? 'YES' : '',
    ]));
    const csv = rows.map(r => r.map(c => /[",]/.test(c) ? `"${c}"` : c).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `as-run_${DAY_LABELS[new Date(midnight).getDay()]}_${new Date(midnight).toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const promos = bumpers.filter(b => b.type === 'PROMO');
  const plainBumpers = bumpers.filter(b => b.type !== 'PROMO');
  const adReels = videos.filter(v => /\bad\b|advert|commercial|promo/i.test(v.title || ''));

  // Plajah platform-library assets any broadcast can pull branding from.
  const platformBumpers = platformAssets.filter(a => a.kind === 'PLATFORM_BUMPER');
  const platformPromos = platformAssets.filter(a => a.kind === 'CHANNEL_PROMO');
  const platformProgs = platformAssets.filter(a => a.kind === 'PLATFORM_PROGRAM' || a.kind === 'PLATFORM_AD');
  const newPlatformBumper = (a: any, promo = false): FastChannelSlot => ({ id: `plb_${a.id}_${Date.now()}`, type: 'BUMPER', order: 0, bumperUrl: a.url, bumperTitle: a.title, bumperDurationSeconds: a.durationSeconds || 10, isPromo: promo || undefined, bugLabel: promo ? 'PROMO' : undefined });
  const newPlatformProgram = (a: any): FastChannelSlot => ({ id: `plp_${a.id}_${Date.now()}`, type: 'VIDEO', order: 0, videoUrl: a.url, videoTitle: a.title, videoThumbnail: a.thumbnailUrl, videoDurationSeconds: a.durationSeconds });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
      {/* ── LEFT: controls + timeline ─────────────────────────────────────── */}
      <div className="min-w-0">
        {/* header row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
              {isRadio ? <Music2 size={20} className="text-small-orange" /> : <Tv size={20} className="text-small-orange" />}
              {isRadio ? 'Radio Scheduler' : 'Playout Scheduler'}
            </h2>
            <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold mt-1">
              {editing.length} slots · {fmtDur(totalSec)} of 24h {usesPerDay ? `· ${DAY_LABELS[day as number]} override` : '· same every day'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowReport(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/10">
              <FileText size={12} /> As-Run
            </button>
            <button onClick={onSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-40">
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} Save
            </button>
          </div>
        </div>

        {/* midnight loop toggle (TV/Radio is chosen by the parent station switch — both run at once) */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button onClick={() => onChange({ ...schedule, midnightAnchored: !schedule.midnightAnchored })}
            className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-colors ${schedule.midnightAnchored ? 'bg-indigo-500/15 border-indigo-400/30 text-indigo-200' : 'bg-white/5 border-white/10 text-white/40'}`}>
            <Clock size={11} /> {schedule.midnightAnchored ? 'Midnight-anchored loop' : 'Continuous loop'}
          </button>
        </div>

        {/* day-of-week tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['every', 0, 1, 2, 3, 4, 5, 6] as DayTab[]).map(d => {
            const active = day === d;
            const hasOverride = d !== 'every' && !!schedule.weeklySlots?.[d as number];
            return (
              <button key={String(d)} onClick={() => setDay(d)}
                className={`relative px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors ${active ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                {d === 'every' ? 'Every day' : DAY_LABELS[d as number]}
                {hasOverride && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-small-orange" />}
              </button>
            );
          })}
        </div>

        {day !== 'every' && (
          <button onClick={() => setPerDay(!usesPerDay)}
            className={`mb-3 w-full text-left px-4 py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${usesPerDay ? 'bg-small-orange/10 border-small-orange/30 text-small-orange' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
            <CopyPlus size={12} /> {usesPerDay ? `Custom ${DAY_LABELS[day as number]} schedule — editing this day only` : `Use the default loop on ${DAY_LABELS[day as number]} · tap to make a custom day`}
          </button>
        )}

        {/* fill / overlap meter */}
        <div className="mb-4">
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full ${overflows ? 'bg-red-500' : 'bg-gradient-to-r from-[#6B0099] to-[#D40055]'}`} style={{ width: `${fillPct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{fmtDur(totalSec)} programmed</span>
            {overflows
              ? <span className="text-[8px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1"><AlertTriangle size={10} /> Over 24h — last assets roll to tomorrow</span>
              : <span className="text-[8px] font-black uppercase tracking-widest text-white/30">{fmtDur(DAY_SEC - totalSec)} → resumes at midnight</span>}
          </div>
        </div>

        {/* quick insert bar */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => append(newAd())} className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-yellow-500/20"><DollarSign size={11} /> Ad Break</button>
          {clip && <button onClick={paste} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-white/10"><ClipboardPaste size={11} /> Paste {TYPE_META[clip.type].label}</button>}
        </div>

        {/* THE TIMELINE */}
        {editing.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-white/10 rounded-2xl">
            <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Add programs from the library →</p>
          </div>
        ) : (
          <div className="relative space-y-1">
            {editing.map((s, i) => {
              const dur = slotDurationSec(s);
              const meta = TYPE_META[s.type];
              const h = Math.max(52, Math.min(180, 40 + (dur / DAY_SEC) * 900));
              const selected = selectedId === s.id;
              const crossesMidnight = starts[i] + dur > DAY_SEC && starts[i] < DAY_SEC;
              return (
                <React.Fragment key={s.id}>
                  {dragOver === i && <div className="h-1.5 rounded-full bg-small-orange" />}
                  <div
                    draggable
                    onDragStart={() => { dragFrom.current = i; }}
                    onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                    onDrop={() => onDrop(i)}
                    onClick={() => setSelectedId(selected ? null : s.id)}
                    style={{ minHeight: h, borderLeftColor: meta.color }}
                    className={`group flex items-stretch gap-3 rounded-xl border border-white/10 border-l-4 bg-white/[0.03] px-3 py-2.5 cursor-pointer transition-all ${selected ? 'ring-2 ring-small-orange bg-white/[0.06]' : 'hover:bg-white/[0.05]'}`}
                  >
                    <div className="flex flex-col items-center justify-center text-white/20 shrink-0">
                      <GripVertical size={14} />
                      <span className="text-[8px] font-black tabular-nums mt-1 text-white/30">{fmtClock(midnight + starts[i] * 1000)}</span>
                    </div>
                    {s.type === 'VIDEO' && (s.videoThumbnail) && (
                      <div className="w-20 rounded-lg overflow-hidden bg-black/40 shrink-0 self-center aspect-video">
                        <img src={s.videoThumbnail} className="w-full h-full object-cover" alt="" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ color: meta.color }} className="shrink-0">{meta.icon}</span>
                        <span className="text-xs font-black uppercase tracking-tight truncate text-white">
                          {s.type === 'AD_BREAK' ? 'Commercial Break' : s.type === 'BUMPER' ? (s.bumperTitle || 'Bumper') : (s.videoTitle || meta.label)}
                        </span>
                        {s.isReplay && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[7px] font-black uppercase tracking-widest">Replay</span>}
                        {s.isPromo && <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-300 text-[7px] font-black uppercase tracking-widest">Promo</span>}
                        {crossesMidnight && <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[7px] font-black uppercase tracking-widest">Rolls over</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[8px] font-black uppercase tracking-widest text-white/40">
                        <span>{fmtDur(dur)}</span>
                        <span>{meta.label}</span>
                        {!!s.adMarkersSeconds?.length && <span className="text-yellow-400/70">{s.adMarkersSeconds.length} ad marker{s.adMarkersSeconds.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    {/* row actions */}
                    <div className="flex flex-col items-center justify-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-0.5">
                        <button onClick={e => { e.stopPropagation(); move(i, -1); }} className="p-1 rounded hover:bg-white/10 text-white/50"><ChevronUp size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); move(i, 1); }} className="p-1 rounded hover:bg-white/10 text-white/50"><ChevronDown size={12} /></button>
                      </div>
                      <div className="flex gap-0.5">
                        <button title="Copy" onClick={e => { e.stopPropagation(); copy(s.id); }} className="p-1 rounded hover:bg-white/10 text-white/50"><Copy size={12} /></button>
                        <button title="Cut" onClick={e => { e.stopPropagation(); cut(s.id); }} className="p-1 rounded hover:bg-white/10 text-white/50"><Scissors size={12} /></button>
                        <button title="Duplicate" onClick={e => { e.stopPropagation(); duplicateSlot(s.id); }} className="p-1 rounded hover:bg-white/10 text-white/50"><CopyPlus size={12} /></button>
                        <button title="Delete" onClick={e => { e.stopPropagation(); removeSlot(s.id); }} className="p-1 rounded hover:bg-red-500/20 text-red-400"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>

                  {/* selected slot inspector */}
                  {selected && (
                    <div className="ml-8 mb-2 p-3 rounded-xl bg-black/30 border border-white/10 space-y-2.5">
                      {(s.type === 'AD_BREAK' || s.type === 'BUMPER' || !s.videoDurationSeconds) && (
                        <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/50">
                          Duration (s)
                          <input type="number" min={1} value={s.type === 'AD_BREAK' ? (s.adDurationSeconds || adDurationSeconds) : s.type === 'BUMPER' ? (s.bumperDurationSeconds || 15) : (s.videoDurationSeconds || 0)}
                            onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 1); patchSlot(s.id, s.type === 'AD_BREAK' ? { adDurationSeconds: v } : s.type === 'BUMPER' ? { bumperDurationSeconds: v } : { videoDurationSeconds: v }); }}
                            className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-[10px] outline-none focus:border-white/30" />
                        </label>
                      )}
                      {(s.type === 'VIDEO' || s.type === 'PUBLIC_DOMAIN') && (
                        <>
                          <label className="flex items-start gap-2 text-[9px] font-black uppercase tracking-widest text-white/50">
                            Ad markers (sec, comma-sep)
                            <input type="text" defaultValue={(s.adMarkersSeconds || []).join(', ')}
                              onBlur={e => patchSlot(s.id, { adMarkersSeconds: e.target.value.split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b) })}
                              placeholder="e.g. 300, 900, 1500"
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-[10px] outline-none focus:border-yellow-500/40" />
                          </label>
                          <div className="flex items-center gap-2">
                            <button onClick={() => patchSlot(s.id, { isReplay: !s.isReplay, bugLabel: !s.isReplay ? 'REPLAY' : undefined })}
                              className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${s.isReplay ? 'bg-red-500/15 border-red-400/30 text-red-300' : 'bg-white/5 border-white/10 text-white/40'}`}>Replay bug</button>
                          </div>
                        </>
                      )}
                      {/* insert after */}
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/25 self-center">Insert after:</span>
                        <button onClick={() => insertAt(i + 1, newAd())} className="px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-300 text-[8px] font-black uppercase tracking-widest hover:bg-yellow-500/20 flex items-center gap-1"><DollarSign size={10} /> Ad</button>
                        {plainBumpers[0] && <button onClick={() => insertAt(i + 1, newBumper(plainBumpers[0]))} className="px-2 py-1 rounded-lg bg-teal-500/10 text-teal-300 text-[8px] font-black uppercase tracking-widest hover:bg-teal-500/20 flex items-center gap-1"><CircleDot size={10} /> Bumper</button>}
                        {promos[0] && <button onClick={() => insertAt(i + 1, newBumper(promos[0], true))} className="px-2 py-1 rounded-lg bg-fuchsia-500/10 text-fuchsia-300 text-[8px] font-black uppercase tracking-widest hover:bg-fuchsia-500/20 flex items-center gap-1"><Megaphone size={10} /> Promo</button>}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {/* drop at end */}
            <div onDragOver={e => { e.preventDefault(); setDragOver(editing.length); }} onDrop={() => onDrop(editing.length)}
              className={`h-6 rounded-lg ${dragOver === editing.length ? 'bg-small-orange/30' : ''}`} />
          </div>
        )}
      </div>

      {/* ── RIGHT: source rail + as-run report ────────────────────────────── */}
      <div className="space-y-4">
        {showReport ? (
          <div className="p-4 rounded-2xl bg-black/30 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60 flex items-center gap-2"><FileText size={13} /> As-Run Log</h3>
              <button onClick={exportCsv} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/10"><Download size={11} /> CSV</button>
            </div>
            <p className="text-[8px] text-white/30 uppercase tracking-widest mb-3">{DAY_LABELS[new Date(midnight).getDay()]} · proof of what airs & when (esp. ads)</p>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {asRun.map((e, k) => (
                <div key={k} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[9px] ${e.isAd ? 'bg-yellow-500/[0.06] border border-yellow-500/15' : e.type === 'OFF_AIR' ? 'bg-indigo-500/[0.06] border border-indigo-500/15' : 'bg-white/[0.02]'}`}>
                  <span className="tabular-nums text-white/40 font-black shrink-0">{fmtClock(e.startMs)}</span>
                  <span className="flex-1 min-w-0 truncate font-bold text-white/70">{e.title}</span>
                  {e.isAd && <span className="text-[7px] font-black uppercase text-yellow-400">AD</span>}
                  {e.isReplay && <span className="text-[7px] font-black uppercase text-red-400">RPL</span>}
                  <span className="tabular-nums text-white/30 shrink-0">{fmtDur(e.durationSec)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
            {/* rail tabs */}
            <div className="flex gap-1 mb-3">
              {([
                ['library', isRadio ? 'Tracks' : 'Library', <Film size={11} key="l" />],
                ['bumpers', isRadio ? 'Stingers' : 'Bumpers', <CircleDot size={11} key="b" />],
                ['promos', 'Promos', <Megaphone size={11} key="p" />],
                ['ads', 'Ads', <DollarSign size={11} key="a" />],
                ['live', 'Live', <Radio size={11} key="lv" />],
              ] as const).map(([k, label, icon]) => (
                <button key={k} onClick={() => setRail(k as any)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-colors ${rail === k ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
                  {icon} {label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
              {rail === 'library' && (
                <>
                  {videos.length === 0 && platformProgs.length === 0 && <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-6">No FAST videos yet — enable them in Video Manager.</p>}
                  {videos.map(v => (
                    <button key={v.id} onClick={() => append(newVideo(v))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                      <div className="w-12 h-8 rounded-lg overflow-hidden shrink-0 bg-white/5">{(v.thumbnailUrl || v.coverImageUrl) && <img src={v.thumbnailUrl || v.coverImageUrl} className="w-full h-full object-cover" alt="" />}</div>
                      <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{v.title}</span>
                      {(v as any).isLiveRecording && <span className="text-[7px] font-black uppercase text-red-400 shrink-0">RPL</span>}
                      <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                    </button>
                  ))}
                  {platformProgs.length > 0 && <p className="text-[8px] font-black uppercase tracking-widest text-small-orange/70 mt-2 mb-1">Plajah Programming</p>}
                  {platformProgs.map(a => (
                    <button key={a.id} onClick={() => append(newPlatformProgram(a))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                      <div className="w-12 h-8 rounded-lg overflow-hidden shrink-0 bg-white/5">{a.thumbnailUrl && <img src={a.thumbnailUrl} className="w-full h-full object-cover" alt="" />}</div>
                      <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{a.title}</span>
                      <span className="text-[7px] text-small-orange/60 uppercase shrink-0">Plajah</span>
                      <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                    </button>
                  ))}
                </>
              )}
              {rail === 'bumpers' && isRadio && (stingers.length === 0
                ? <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-6">No station IDs yet — add stingers to your radio station.</p>
                : stingers.map((url, i) => (
                  <button key={`st_${i}`} onClick={() => append(newStinger(url))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                    <CircleDot size={13} className="text-teal-400 shrink-0" />
                    <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{stingerName(url)}</span>
                    <span className="text-[7px] text-white/30 uppercase shrink-0">Station ID</span>
                    <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                  </button>
                )))}
              {rail === 'bumpers' && !isRadio && (
                <>
                  {plainBumpers.length === 0 && platformBumpers.length === 0 && <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-6">No bumpers — add your own in the Bumpers tab, or use Plajah's below.</p>}
                  {plainBumpers.map(b => (
                    <button key={b.id} onClick={() => append(newBumper(b))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                      <CircleDot size={13} className="text-teal-400 shrink-0" />
                      <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{b.title}</span>
                      <span className="text-[7px] text-white/30 uppercase shrink-0">{b.type.replace('_', ' ')}</span>
                      <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                    </button>
                  ))}
                  {platformBumpers.length > 0 && <p className="text-[8px] font-black uppercase tracking-widest text-small-orange/70 mt-2 mb-1">From Plajah Library</p>}
                  {platformBumpers.map(a => (
                    <button key={a.id} onClick={() => append(newPlatformBumper(a))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                      <CircleDot size={13} className="text-small-orange shrink-0" />
                      <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{a.title}</span>
                      <span className="text-[7px] text-small-orange/60 uppercase shrink-0">Plajah</span>
                      <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                    </button>
                  ))}
                </>
              )}
              {rail === 'promos' && (
                <>
                  {promos.length === 0 && platformPromos.length === 0 && <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-6">No channel promos — set a Bumper's type to PROMO, or use Plajah's below.</p>}
                  {promos.map(b => (
                    <button key={b.id} onClick={() => append(newBumper(b, true))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                      <Megaphone size={13} className="text-fuchsia-400 shrink-0" />
                      <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{b.title}</span>
                      <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                    </button>
                  ))}
                  {platformPromos.length > 0 && <p className="text-[8px] font-black uppercase tracking-widest text-small-orange/70 mt-2 mb-1">From Plajah Library</p>}
                  {platformPromos.map(a => (
                    <button key={a.id} onClick={() => append(newPlatformBumper(a, true))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                      <Megaphone size={13} className="text-small-orange shrink-0" />
                      <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{a.title}</span>
                      <span className="text-[7px] text-small-orange/60 uppercase shrink-0">Plajah</span>
                      <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                    </button>
                  ))}
                </>
              )}
              {rail === 'ads' && (
                <>
                  <button onClick={() => append(newAd())} className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[9px] font-black uppercase tracking-widest hover:bg-yellow-500/20 mb-2">
                    <DollarSign size={12} /> Insert {adDurationSeconds}s Ad Break
                  </button>
                  {isRadio && audioAds.length > 0 && (
                    <>
                      <p className="text-[8px] text-white/30 uppercase tracking-widest mb-1.5">Your station ads (radioSettings)</p>
                      {audioAds.map((url, i) => (
                        <button key={`aad_${i}`} onClick={() => append(newAudioAd(url))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group mb-1">
                          <DollarSign size={12} className="text-yellow-400 shrink-0" />
                          <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{stingerName(url)}</span>
                          <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                        </button>
                      ))}
                    </>
                  )}
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-1.5">Your ad reels (from Artist Manager)</p>
                  {adReels.length === 0
                    ? <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-4">No ad creatives found in your library.</p>
                    : adReels.map(v => (
                      <button key={v.id} onClick={() => append({ ...newVideo(v), bugLabel: undefined })} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                        <DollarSign size={12} className="text-yellow-400 shrink-0" />
                        <span className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{v.title}</span>
                        <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                      </button>
                    ))}
                </>
              )}
              {rail === 'live' && (
                <>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-1.5">
                    {isRadio ? 'Break to live audio — your Reello stream, a Live Talk room, or a podcast episode' : 'Schedule a live break inline in the loop'}
                  </p>
                  {liveSources.length === 0
                    ? <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-4">No live sources available. Go live on Reello or add a podcast to schedule live audio.</p>
                    : liveSources.map((src, i) => (
                      <button key={`${src.kind}_${i}`} onClick={() => append(newLive(src))} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-left group">
                        <Radio size={12} className="text-red-400 shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white">{src.title}</span>
                          <span className="block text-[7px] text-white/30 uppercase tracking-widest">{src.kind.replace('_', ' ')}</span>
                        </span>
                        <Plus size={12} className="text-white/20 group-hover:text-white shrink-0" />
                      </button>
                    ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayoutScheduler;
