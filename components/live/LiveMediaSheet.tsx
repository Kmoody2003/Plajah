/**
 * LiveMediaSheet — the one "camera · mic · effects" panel for every live video surface (chat calls,
 * huddles, collab calls, campus broadcasts, class lectures). Mic + camera pickers with a level meter
 * on the track being SENT, and the platform's lenses, looks and cinematic LUTs (hooks/useLiveFx),
 * which are baked into the outgoing video.
 *
 * Surfaces lazy-load it, so calls that never open it never load the composer or the LUT library.
 */
import React, { useRef } from 'react';
import { X, Mic, Camera } from 'lucide-react';
import type { UseRtcSession } from '../../hooks/useRtcSession';
import type { LiveFx } from '../../hooks/useLiveFx';
import { LOOKS } from '../../services/liveComposer';
import { CINEMATIC_LUTS } from '../../services/color/cinematicLutLibrary';
import { LensPicker } from '../LensVideoOverlay';
import { LevelMeter } from './LevelMeter';

/** The platform's cinematic LUT library as a horizontal chip strip. */
export const LutStrip: React.FC<{ lookId: string; onPick: (id: string) => void }> = ({ lookId, onPick }) => (
  <div className="pt-2">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-1 pb-1.5">Cinematic LUTs</p>
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CINEMATIC_LUTS.map(l => (
        <button key={l.id} type="button" onClick={() => onPick(l.id)} title={`${l.categoryLabel} — ${l.description}`}
          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${lookId === `lut:${l.id}` ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.accentColor }} />{l.name}
        </button>
      ))}
    </div>
  </div>
);

type SheetRtc = Pick<UseRtcSession, 'devices' | 'activeDevices' | 'localAudioTrack' | 'refreshDevices' | 'switchAudioDevice'>;

const LiveMediaSheet: React.FC<{
  rtc: SheetRtc;
  fx: LiveFx;
  /** Omit for an inline (always-open) panel — hides the close button. */
  onClose?: () => void;
  micMuted?: boolean;
  /** Audio-only rooms hide the camera + effects sections. */
  video?: boolean;
  className?: string;
  /** Extra controls under the mic (e.g. "use desktop audio"). */
  children?: React.ReactNode;
}> = ({ rtc, fx, onClose, micMuted, video = true, className = '', children }) => {
  const cubeRef = useRef<HTMLInputElement>(null);
  const select = 'flex-1 min-w-0 bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 text-[12px] font-bold text-white focus:outline-none [&>option]:bg-zinc-900';
  return (
    <div className={`w-[min(92vw,360px)] max-h-[70dvh] overflow-y-auto rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-white/10 p-3 space-y-3 shadow-2xl text-white ${className}`}
      data-live-media-sheet>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-widest">{video ? 'Camera, mic & effects' : 'Microphone'}</p>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/70"><X size={14} /></button>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Mic size={14} className="text-white/50 shrink-0" />
          <select aria-label="Microphone" className={select} value={rtc.activeDevices.micId || ''}
            onFocus={() => rtc.refreshDevices()} onChange={e => rtc.switchAudioDevice(e.target.value)}>
            {rtc.devices.mics.length === 0 && <option value="">Default microphone</option>}
            {rtc.devices.mics.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
          </select>
        </div>
        <LevelMeter source={rtc.localAudioTrack} label="Mic" muted={micMuted} />
        {children}
        {video && (
          <div className="flex items-center gap-2">
            <Camera size={14} className="text-white/50 shrink-0" />
            <select aria-label="Camera" className={select} value={rtc.activeDevices.cameraId || ''}
              onFocus={() => rtc.refreshDevices()} onChange={e => fx.switchCamera(e.target.value)}>
              {rtc.devices.cameras.length === 0 && <option value="">Default camera</option>}
              {rtc.devices.cameras.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          </div>
        )}
      </div>

      {video && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Lenses — everyone sees them</p>
            {fx.active && (
              <button type="button" onClick={fx.off} disabled={fx.busy} className="text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-40">All off</button>
            )}
          </div>
          <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <LensPicker compact value={fx.lens} onChange={fx.setLens} status={fx.lensStatus} busy={fx.busy} />
          </div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 pt-1">Looks</p>
          <div className="flex flex-wrap gap-1.5">
            {LOOKS.map(l => (
              <button key={l.id} type="button" onClick={() => fx.setLook(l.id)} disabled={fx.busy}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${fx.look === l.id ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>{l.label}</button>
            ))}
            <button type="button" onClick={() => cubeRef.current?.click()}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${fx.look === 'custom' ? 'bg-orange-500 text-black' : 'bg-white/[0.06] text-white/80'}`}>+ .cube LUT</button>
            <input ref={cubeRef} type="file" accept=".cube" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) fx.loadCube(f); e.currentTarget.value = ''; }} />
          </div>
          <LutStrip lookId={fx.look} onPick={fx.setLut} />
          {fx.error && (
            <button type="button" onClick={fx.clearError} className="w-full text-left text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-2 py-1.5">{fx.error}</button>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveMediaSheet;
