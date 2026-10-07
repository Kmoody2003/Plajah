// AmboVideoTransportBar.tsx — broadcast transport for the video on PROGRAM (or the one cued in PREVIEW).
//
// It no longer hunts <video> tags in the DOM (the sources' elements are never attached
// to it, which is why the old bar controlled nothing). It binds to the clip through
// services/ambo/videoSync: the Program clip is the single authority that every output
// window follows, so a command here moves the room's screens too. Preview commands drive
// the silent preview clip only. A clip that cannot be driven is shown disabled, with why.

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Repeat, Volume2, VolumeX, Film, RotateCw } from 'lucide-react';
import type { LayerContent } from '../../services/ambo/showModel';
import { command, getInfo, videoId, type VideoInfo } from '../../services/ambo/videoSync';
import { formatClock, predictedPosition, type VideoCommand } from '../../services/ambo/videoSyncMath';

interface AmboVideoTransportBarProps {
  videoContent: Extract<LayerContent, { kind: 'VIDEO' }> | null;
  label?: string;
  isLive?: boolean;
  onUpdateContent?: (updated: Partial<Extract<LayerContent, { kind: 'VIDEO' }>>) => void;
  onClose?: () => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const AmboVideoTransportBar: React.FC<AmboVideoTransportBarProps> = ({
  videoContent,
  label = 'Video Clip',
  isLive = true,
  onUpdateContent,
}) => {
  const id = videoContent?.src ? videoId(isLive ? 'program' : 'preview', videoContent.src) : '';
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const lastSeekAt = useRef(0);

  // Poll the real element (150 ms) so position / state are never guessed.
  useEffect(() => {
    if (!id) { setInfo(null); return; }
    const read = () => setInfo(getInfo(id));
    read();
    const t = setInterval(read, 150);
    return () => clearInterval(t);
  }, [id]);

  if (!videoContent) return null;

  const tr = info?.transport ?? null;
  const ok = !!tr && (info?.controllable ?? false);
  const playOnly = !!tr && !ok;          // e.g. live stream: play/pause still work
  const canAudio = !!tr && !!info?.audioControllable;
  const disabledWhy = !tr
    ? (info?.reason ?? 'Waiting for the clip to load in this window')
    : info?.reason;
  const send = (cmd: VideoCommand) => { if (id) command(id, cmd); setInfo(getInfo(id)); };

  const pos = scrub ?? (tr ? predictedPosition(tr, Date.now()) : 0);
  const dur = tr?.duration ?? 0;
  const playing = !!tr?.playing;
  const volume = tr?.volume ?? videoContent.volume ?? 1;
  const muted = tr?.muted ?? videoContent.muted ?? false;
  const looping = tr?.loop ?? videoContent.loop ?? true;
  const rate = tr?.rate ?? 1;

  const btn = (enabled: boolean) => `p-1 rounded transition-all ${enabled ? 'hover:bg-white/10 text-white/70 hover:text-white' : 'opacity-30 cursor-not-allowed text-white/50'}`;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-[#0b0816]/95 border-b border-white/10 text-white text-[11px] select-none backdrop-blur-md" title={disabledWhy}>
      {/* Status Badge */}
      <div className="flex items-center gap-1.5 flex-none">
        <Film size={13} className={isLive ? 'text-[#00DAF3]' : 'text-amber-400'} />
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
            isLive ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {isLive ? 'PGM VIDEO' : 'PRV VIDEO'}
        </span>
        <span className="font-semibold text-white/80 max-w-[140px] truncate" title={label}>{label}</span>
      </div>

      <div className="w-px h-4 bg-white/15 flex-none" />

      {/* Transport Buttons */}
      <div className="flex items-center gap-1 flex-none">
        <button type="button" disabled={!ok} onClick={() => send({ type: 'restart' })} className={btn(ok)} title="Restart (0:00)"><RotateCcw size={12} /></button>
        <button type="button" disabled={!ok} onClick={() => send({ type: 'skip', delta: -10 })} className={`${btn(ok)} font-mono text-[9px]`} title="Back 10 s">-10</button>
        <button
          type="button"
          disabled={!tr}
          onClick={() => send({ type: 'toggle' })}
          className={`p-1.5 rounded-lg flex items-center justify-center font-bold transition-all ${!tr ? 'opacity-30 cursor-not-allowed bg-white/10' : playing ? 'bg-[#00DAF3]/20 text-[#00DAF3] hover:bg-[#00DAF3]/30 border border-[#00DAF3]/30' : 'bg-white/10 text-white hover:bg-white/20'}`}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
        <button type="button" disabled={!ok} onClick={() => send({ type: 'skip', delta: 10 })} className={`${btn(ok)} font-mono text-[9px]`} title="Forward 10 s">+10</button>
      </div>

      {/* Progress Timeline Scrubber */}
      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
        <span className="font-mono text-[10px] text-white/60 tabular-nums w-10 text-right flex-none">{formatClock(pos)}</span>
        <input
          type="range"
          disabled={!ok || !dur}
          min={0}
          max={dur || 100}
          step={0.1}
          value={Math.min(pos, dur || 100)}
          onChange={e => {
            const v = parseFloat(e.target.value);
            setScrub(v);
            const n = Date.now();
            if (n - lastSeekAt.current > 120) { lastSeekAt.current = n; send({ type: 'seek', sec: v }); }
          }}
          onPointerUp={e => { const v = parseFloat((e.target as HTMLInputElement).value); send({ type: 'seek', sec: v }); setScrub(null); }}
          onKeyUp={() => setScrub(null)}
          className={`flex-1 h-1.5 rounded-lg bg-white/15 accent-[#00DAF3] ${ok ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
          title={playOnly ? disabledWhy : 'Scrub'}
        />
        <span className="font-mono text-[10px] text-white/40 tabular-nums w-10 flex-none">{dur ? formatClock(dur) : '--:--'}</span>
      </div>

      {/* Speed */}
      <select
        disabled={!ok}
        value={RATES.includes(rate) ? rate : 1}
        onChange={e => send({ type: 'rate', rate: parseFloat(e.target.value) })}
        className={`bg-white/5 border border-white/15 rounded px-1 py-0.5 text-[10px] font-mono flex-none ${ok ? '' : 'opacity-30 cursor-not-allowed'}`}
        title="Playback speed (Program and every output follow)"
      >
        {RATES.map(r => <option key={r} value={r} className="bg-[#0b0816]">{r}x</option>)}
      </select>

      {/* Loop Toggle */}
      <button
        type="button"
        disabled={!tr}
        onClick={() => { send({ type: 'loop', on: !looping }); onUpdateContent?.({ loop: !looping }); }}
        className={`px-1.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all flex-none ${!tr ? 'opacity-30 cursor-not-allowed' : looping ? 'bg-[#00DAF3]/20 text-[#00DAF3] border border-[#00DAF3]/40' : 'text-white/40 hover:text-white/70'}`}
        title={looping ? 'Looping enabled' : 'Play once'}
      >
        {looping ? <Repeat size={11} /> : <RotateCw size={11} />}
        <span className="text-[9px]">LOOP</span>
      </button>

      <div className="w-px h-4 bg-white/15 flex-none" />

      {/* Audio — Program only: Preview is always silent */}
      <div className="flex items-center gap-1.5 flex-none" title={canAudio ? undefined : 'Preview is always silent; audio is controlled on the Program clip'}>
        <button
          type="button"
          disabled={!canAudio}
          onClick={() => { send({ type: 'mute', muted: !muted }); onUpdateContent?.({ muted: !muted }); }}
          className={`p-1 rounded transition-all ${!canAudio ? 'opacity-30 cursor-not-allowed text-white/50' : muted || volume === 0 ? 'text-red-400' : 'text-white/70 hover:text-white'}`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input
          type="range" min={0} max={1} step={0.02} disabled={!canAudio}
          value={muted ? 0 : volume}
          onChange={e => { const v = parseFloat(e.target.value); send({ type: 'volume', volume: v }); if (v > 0) send({ type: 'mute', muted: false }); onUpdateContent?.({ volume: v, muted: v === 0 }); }}
          className={`w-16 h-1.5 rounded-lg bg-white/15 accent-[#00DAF3] ${canAudio ? 'cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
          title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
        />
        <span className="font-mono text-[9px] text-white/50 w-7 tabular-nums">{Math.round((muted ? 0 : volume) * 100)}%</span>
      </div>

      {!ok && disabledWhy && (
        <span className="text-[9px] text-amber-300/80 max-w-[200px] truncate flex-none" title={disabledWhy}>{disabledWhy}</span>
      )}
    </div>
  );
};
