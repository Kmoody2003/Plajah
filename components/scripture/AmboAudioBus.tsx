// AmboAudioBus — the always-available audio playlist, docked in the presenter.
//
// Independent of the slide/layer stack: a TAKE, CLEAR or blackout never touches
// it. The only coupling is the video-priority policy (keep playing / duck /
// pause-and-resume while a video with sound is on Program), set here.

import React, { useRef, useState, useSyncExternalStore } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, VolumeX,
  ListMusic, ChevronDown, ChevronUp, X, FolderOpen, ArrowUp, ArrowDown, Trash2,
  StickyNote, Layers, Film, TrendingDown, AlertTriangle, Disc3,
} from 'lucide-react';
import { bus, registerLocalFiles, isTrackPlayable, isAudioFile, type BusTrack } from '../../services/ambo/audioBus';
import {
  getAudioPriority, setAudioPriority, subscribeAudioPriority,
  type VideoAudioPolicy,
} from '../../services/ambo/audioPriority';
import { getCue, setCue, subscribeCues, cuesVersion, cueHex } from '../../services/ambo/audioCues';
import AmboCueEditor, { CueRowStyle } from './AmboCueEditor';

const fmt = (s: number) => (!isFinite(s) || s <= 0) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function useAudioBus() {
  return useSyncExternalStore(bus.subscribe, bus.getSnapshot);
}
export function useAudioPriority() {
  return useSyncExternalStore(subscribeAudioPriority, getAudioPriority);
}
export function useCuesVersion() {
  return useSyncExternalStore(subscribeCues, cuesVersion);
}

const POLICIES: Array<{ id: VideoAudioPolicy; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'parallel', label: 'Keep playing', hint: 'Audio plays on top of videos', icon: <Layers size={11} /> },
  { id: 'duck', label: 'Duck', hint: 'Lower the music while a video plays', icon: <TrendingDown size={11} /> },
  { id: 'pause', label: 'Pause & resume', hint: 'Pause while a video plays, resume after', icon: <Film size={11} /> },
];

/** `controlsSlot`: presenter-owned controls on the bar (Mixer, Lyrics — they write the mixer and the Program stack). */
export const AmboAudioBus: React.FC<{ controlsSlot?: React.ReactNode; deckOpen?: boolean; onToggleDeck?: () => void }> = ({ controlsSlot, deckOpen, onToggleDeck }) => {
  const s = useAudioBus();
  const pr = useAudioPriority();
  useCuesVersion();
  const [open, setOpen] = useState(false);
  const [cueFor, setCueFor] = useState<{ el: HTMLElement; t: BusTrack } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cur = s.queue[s.index];
  const curCue = cur ? getCue(cur.cueScope, cur.id) : null;
  const curHex = cueHex(curCue?.color);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const tracks = registerLocalFiles(files);
    if (tracks.length) bus.enqueue(tracks);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter(isAudioFile);
    if (files.length) { addFiles(files); return; }
    // A track dragged from the Chora library.
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json') || 'null');
      if (data?.type === 'ambo-audio' && data.track) bus.enqueue([data.track]);
    } catch { /* */ }
  };

  return (
    <div
      className="flex-none border-t relative"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(10,7,17,0.92)' }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-10 grid place-items-center pointer-events-none border-2 border-dashed border-[#D0BCFF]/60 bg-[#D0BCFF]/10 text-[11px] font-bold text-[#D0BCFF]">
          Drop audio files or Chora tracks to queue them
        </div>
      )}

      {/* ── Transport strip ── */}
      <div className="flex items-center gap-3 px-3 py-1.5">
        <div className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-white/40 flex-none">
          <ListMusic size={12} className="text-[#D0BCFF]" /> Audio
        </div>

        <div className="w-8 h-8 rounded-md overflow-hidden bg-white/5 flex-none grid place-items-center" style={curHex ? { boxShadow: `0 0 0 2px ${curHex}` } : undefined}>
          {cur?.coverImage ? <img src={cur.coverImage} alt="" className="w-full h-full object-cover" /> : <ListMusic size={14} className="text-white/25" />}
        </div>

        <div className="min-w-0 w-48 flex-none">
          <div className="text-[11px] font-semibold text-white truncate">{cur?.title ?? 'Nothing queued'}</div>
          <div className="text-[9.5px] text-white/45 truncate">
            {curCue ? (
              <span style={{ color: curHex ?? undefined }} className="font-bold">{curCue.label || 'Cue'}{curCue.note ? ' · ' : ''}</span>
            ) : null}
            {curCue?.note ? <span className="text-white/60">{curCue.note}</span> : (cur?.artist ?? 'Queue songs from Chora or local files')}
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-none">
          <button onClick={() => bus.prev()} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10" title="Previous"><SkipBack size={13} /></button>
          <button
            onClick={() => bus.toggle()}
            disabled={!s.queue.length}
            className="p-1.5 rounded-full bg-white text-[#0b0812] hover:scale-105 transition-transform disabled:opacity-30"
            title={s.playing ? 'Pause' : 'Play'}
          >{s.playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
          <button onClick={() => bus.next()} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10" title="Next"><SkipForward size={13} /></button>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[120px]">
          <span className="font-mono text-[9.5px] text-white/45 w-8 text-right">{fmt(s.currentTime)}</span>
          <input
            type="range" min={0} max={s.duration || 0} step={0.1} value={Math.min(s.currentTime, s.duration || 0)}
            onChange={e => bus.seek(Number(e.target.value))}
            className="flex-1 accent-[#D0BCFF] h-1"
            aria-label="Seek"
          />
          <span className="font-mono text-[9.5px] text-white/45 w-8">{fmt(s.duration)}</span>
        </div>

        {s.heldByVideo && (
          <span className="flex-none px-1.5 py-0.5 rounded text-[9px] font-bold text-[#FF8C00] bg-[#FF8C00]/15 border border-[#FF8C00]/30" title="Paused while a video with sound is on Program — resumes when it ends">
            HELD BY VIDEO
          </span>
        )}
        {pr.videoAudible && pr.policy === 'duck' && s.playing && (
          <span className="flex-none px-1.5 py-0.5 rounded text-[9px] font-bold text-[#00DAF3] bg-[#00DAF3]/10 border border-[#00DAF3]/30">DUCKED</span>
        )}

        <div className="flex items-center gap-1 flex-none">
          <button onClick={() => bus.setShuffle(!s.shuffle)} className={`p-1.5 rounded hover:bg-white/10 ${s.shuffle ? 'text-[#D0BCFF]' : 'text-white/45'}`} title="Shuffle"><Shuffle size={12} /></button>
          <button
            onClick={() => bus.setRepeat(s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off')}
            className={`p-1.5 rounded hover:bg-white/10 ${s.repeat !== 'off' ? 'text-[#D0BCFF]' : 'text-white/45'}`}
            title={`Repeat: ${s.repeat}`}
          >{s.repeat === 'one' ? <Repeat1 size={12} /> : <Repeat size={12} />}</button>
          <button onClick={() => bus.setMuted(!s.muted)} className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10" title={s.muted ? 'Unmute' : 'Mute'}>
            {s.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={e => bus.setVolume(Number(e.target.value))} className="w-20 accent-[#D0BCFF] h-1" aria-label="Playlist volume" />
          {onToggleDeck && (
            <button
              onClick={onToggleDeck}
              disabled={!cur}
              className={`ml-1 px-2 py-1 rounded text-[9.5px] font-bold border flex items-center gap-1 disabled:opacity-30 ${deckOpen ? 'text-black bg-[#FF8C00] border-[#FF8C00]' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
              title={deckOpen ? 'Back to the compact player — the song keeps playing' : 'Expand this song into the DJ deck — waveform, EQ, loops, hot cues (no restart)'}
            >
              <Disc3 size={11} /> {deckOpen ? 'DJ Deck ▾' : 'DJ Deck'}
            </button>
          )}
          {s.deck && !deckOpen && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold text-[#FF8C00] bg-[#FF8C00]/15">ON DECK</span>}
          {controlsSlot && <span className="ml-1 flex items-center gap-1">{controlsSlot}</span>}
          <button onClick={() => bus.fadeOut(3)} disabled={!s.playing} className="ml-1 px-2 py-1 rounded text-[9.5px] font-bold text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 disabled:opacity-30" title="Fade the music out over 3 seconds">Fade out</button>
          <button
            onClick={() => setOpen(o => !o)}
            className={`ml-1 px-2 py-1 rounded text-[9.5px] font-bold border flex items-center gap-1 ${open ? 'text-[#D0BCFF] bg-[#D0BCFF]/15 border-[#D0BCFF]/30' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
          >
            Queue {s.queue.length > 0 && <span className="font-mono opacity-70">{s.queue.length}</span>}
            {open ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        </div>
      </div>

      {s.error && (
        <div className="px-3 pb-1 flex items-center gap-1.5 text-[9.5px] text-[#F5C542]">
          <AlertTriangle size={10} /> <span className="truncate">{s.error}</span>
        </div>
      )}

      {/* ── Queue drawer ── */}
      {open && (
        <div className="border-t flex min-h-0" style={{ borderColor: 'rgba(255,255,255,0.06)', height: 260 }}>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">Up next</span>
              <div className="flex-1" />
              <button onClick={() => fileRef.current?.click()} className="px-2 py-0.5 rounded text-[9.5px] font-semibold text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 flex items-center gap-1">
                <FolderOpen size={10} /> Add local files
              </button>
              <button onClick={() => bus.organizeByCue()} disabled={s.queue.length < 2} className="px-2 py-0.5 rounded text-[9.5px] font-semibold text-white/70 bg-white/5 hover:bg-white/15 border border-white/10 flex items-center gap-1 disabled:opacity-30" title="Order the queue by cue colour, then label">
                <StickyNote size={10} /> Organize by cue
              </button>
              <button onClick={() => bus.clearQueue()} disabled={!s.queue.length} className="px-2 py-0.5 rounded text-[9.5px] font-semibold text-white/50 hover:text-[#FF5A5F] bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30">Clear</button>
              <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {s.queue.length === 0 && (
                <div className="h-full grid place-items-center text-center text-[10.5px] text-white/35 px-6">
                  Queue songs from the Chora tab (Play / Queue / playlist Play), add local files, or drop audio here.
                </div>
              )}
              {s.queue.map((t, i) => {
                const cue = getCue(t.cueScope, t.id);
                const hex = cueHex(cue?.color);
                const isCur = i === s.index;
                const playable = isTrackPlayable(t);
                return (
                  <div
                    key={`${t.id}_${i}`}
                    className={`group flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border transition-all ${isCur ? 'border-[#FF8C00]/50' : 'border-white/5 hover:border-white/15'}`}
                    style={{ ...(isCur ? { background: 'rgba(255,140,0,0.08)' } : { background: 'rgba(255,255,255,0.02)' }), ...CueRowStyle(hex) }}
                    onDoubleClick={() => bus.jumpTo(i)}
                  >
                    <span className="w-4 text-center font-mono text-[9px] text-white/35 flex-none">{isCur && s.playing ? '▶' : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] font-semibold truncate ${playable ? 'text-white' : 'text-white/35 line-through'}`}>{t.title}</div>
                      <div className="text-[9.5px] truncate">
                        {cue && <span className="font-bold mr-1" style={{ color: hex ?? undefined }}>{cue.label || 'Cue'}</span>}
                        <span className={cue?.note ? 'text-white/70' : 'text-white/40'}>{cue?.note || t.artist || ''}</span>
                        {!playable && <span className="text-[#F5C542] ml-1">· local file not linked — add it again</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-none opacity-60 group-hover:opacity-100">
                      <button onClick={() => bus.jumpTo(i)} className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10" title="Play now"><Play size={10} /></button>
                      <button onClick={e => setCueFor({ el: e.currentTarget, t })} className="p-1 rounded hover:bg-white/10" style={{ color: hex ?? 'rgba(255,255,255,0.6)' }} title="Cue note"><StickyNote size={10} /></button>
                      <button onClick={() => bus.move(i, i - 1)} disabled={i === 0} className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20" title="Move up"><ArrowUp size={10} /></button>
                      <button onClick={() => bus.move(i, i + 1)} disabled={i === s.queue.length - 1} className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20" title="Move down"><ArrowDown size={10} /></button>
                      <button onClick={() => bus.remove(i)} className="p-1 rounded text-white/50 hover:text-[#FF5A5F] hover:bg-white/10" title="Remove"><Trash2 size={10} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Video priority ── */}
          <div className="w-60 flex-none border-l p-3 flex flex-col gap-2 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="text-[9px] font-extrabold uppercase tracking-wider text-white/40">When a video with sound plays</div>
            {POLICIES.map(p => (
              <button
                key={p.id}
                onClick={() => setAudioPriority({ policy: p.id })}
                className={`text-left px-2.5 py-1.5 rounded-lg border transition-all ${pr.policy === p.id ? 'border-[#D0BCFF]/40 bg-[#D0BCFF]/12 text-white' : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold">{p.icon} {p.label}</div>
                <div className="text-[9px] text-white/45 mt-0.5">{p.hint}</div>
              </button>
            ))}
            {pr.policy === 'duck' && (
              <label className="flex items-center gap-2 text-[9.5px] text-white/60">
                Duck to
                <input type="range" min={0.05} max={0.6} step={0.05} value={pr.duckLevel} onChange={e => setAudioPriority({ duckLevel: Number(e.target.value) })} className="flex-1 accent-[#D0BCFF] h-1" />
                <span className="font-mono w-8 text-right">{Math.round(pr.duckLevel * 100)}%</span>
              </label>
            )}
            <label className={`flex items-start gap-2 text-[10px] ${pr.policy === 'parallel' ? 'text-white/30' : 'text-white/70'}`}>
              <input
                type="checkbox"
                disabled={pr.policy === 'parallel'}
                checked={pr.scope === 'all'}
                onChange={e => setAudioPriority({ scope: e.target.checked ? 'all' : 'playlist' })}
                className="mt-0.5 accent-[#D0BCFF]"
              />
              <span>Apply to everything else too — slide audio beds and the DJ deck</span>
            </label>
            <div className="mt-auto pt-2 border-t border-white/5">
              <label className="flex items-center gap-2 text-[9.5px] text-white/60">
                Crossfade
                <input type="range" min={0} max={12} step={1} value={s.crossfadeSec} onChange={e => bus.setCrossfade(Number(e.target.value))} className="flex-1 accent-[#D0BCFF] h-1" />
                <span className="font-mono w-6 text-right">{s.crossfadeSec}s</span>
              </label>
              {pr.videoAudible && <div className="mt-1.5 text-[9px] text-[#FF8C00] font-bold">● Video with sound on Program</div>}
            </div>
          </div>
        </div>
      )}

      {cueFor && (
        <AmboCueEditor
          anchor={cueFor.el}
          trackTitle={cueFor.t.title}
          value={getCue(cueFor.t.cueScope, cueFor.t.id)}
          onSave={cue => setCue(cueFor.t.cueScope, cueFor.t.id, cue)}
          onClose={() => setCueFor(null)}
        />
      )}
    </div>
  );
};

export default AmboAudioBus;
