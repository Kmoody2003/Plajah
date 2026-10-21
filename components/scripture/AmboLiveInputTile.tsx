// AmboLiveInputTile — the picture inside a Live Feeds card: the feed's actual moving image (NDI
// via the Windows shell), a stereo meter so the operator can see whether it carries sound, and the
// audio switch. Live inputs are ALWAYS muted until that switch is turned on — previewing or taking
// an input to Program never makes it audible by itself.
import React from 'react';
import { Radio, Volume2, VolumeX } from 'lucide-react';
import { isNativeLiveInput, liveLevel, liveInputError, isLiveAudioOn, setLiveAudio, useLiveInputs, useLiveFrameCanvas } from '../../services/ambo/liveInputs';
import { isWindowsApp } from '../../services/windowsBridgeService';

const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -90);
/** -60 dB → 0, 0 dB → 1 */
const meterPos = (v: number) => Math.min(1, Math.max(0, (toDb(v) + 60) / 60));

const Bar: React.FC<{ peak: number; rms: number }> = ({ peak, rms }) => {
  const p = meterPos(peak), r = meterPos(rms);
  const hot = toDb(peak) > -3;
  return (
    <div className="relative w-1.5 h-full rounded-sm bg-black/60 overflow-hidden">
      <div className="absolute bottom-0 inset-x-0" style={{ height: `${r * 100}%`, background: 'linear-gradient(to top,#22c55e,#a3e635 70%,#facc15 90%,#ef4444)' }} />
      <div className="absolute inset-x-0 h-[2px]" style={{ bottom: `${p * 100}%`, background: hot ? '#ef4444' : '#e5e7eb' }} />
    </div>
  );
};

export const AmboLiveInputTile: React.FC<{ inputId: string; tint: string }> = ({ inputId, tint }) => {
  useLiveInputs();
  const native = isNativeLiveInput(inputId) && isWindowsApp();
  const canvasRef = useLiveFrameCanvas(native ? inputId : undefined, 320);
  const lvl = native ? liveLevel(inputId) : undefined;
  const err = native ? (liveInputError(inputId) || (lvl?.status === 'error' ? lvl.error || 'Feed lost' : undefined)) : undefined;
  const audioOn = isLiveAudioOn(inputId);
  const live = lvl?.status === 'live';

  return (
    <div className="absolute inset-0">
      {native && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain bg-black" />}
      {(!native || !live) && (
        <div className="absolute inset-0 grid place-items-center text-center px-2">
          <div className="flex flex-col items-center gap-1">
            <Radio size={26} style={{ color: tint }} />
            {native && !err && <span className="text-[9px] text-white/50">Connecting…</span>}
            {err && <span className="text-[9px] leading-tight text-[#FFB27A]">{err}</span>}
            {!native && isNativeLiveInput(inputId) && <span className="text-[9px] text-white/45">Live picture needs the Plajah Windows app</span>}
          </div>
        </div>
      )}
      {native && (
        <>
          {/* Stereo meter: shows whether the feed carries sound, even while it's muted. */}
          <div className="absolute right-1 top-1 bottom-1 flex gap-[2px] p-[2px] rounded bg-black/40" title={lvl?.hasAudio ? 'Feed audio level' : 'No audio in this feed'}>
            <Bar peak={lvl?.peak?.[0] ?? 0} rms={lvl?.rms?.[0] ?? 0} />
            <Bar peak={lvl?.peak?.[1] ?? 0} rms={lvl?.rms?.[1] ?? 0} />
          </div>
          <button
            onClick={e => { e.stopPropagation(); setLiveAudio(inputId, !audioOn); }}
            onDoubleClick={e => e.stopPropagation()}
            className={`absolute left-1 bottom-1 h-6 px-1.5 rounded-md flex items-center gap-1 text-[9px] font-black border ${audioOn ? 'bg-[#FF8C00] text-black border-[#FF8C00]' : 'bg-black/70 text-white/80 border-white/20 hover:bg-black/85'}`}
            title={audioOn ? 'This feed’s sound is ON in Stage’s mix. Click to mute.' : 'Muted. Click to deliberately put this feed’s sound into Stage’s mix.'}
            aria-pressed={audioOn}
            data-live-audio={audioOn ? 'on' : 'off'}
          >
            {audioOn ? <Volume2 size={11} /> : <VolumeX size={11} />}
            {audioOn ? 'AUDIO ON' : 'MUTED'}
          </button>
          {live && lvl?.width ? <span className="absolute left-1 top-1 px-1 rounded bg-black/60 font-mono text-[8px] text-white/70">{lvl.width}×{lvl.height}</span> : null}
        </>
      )}
    </div>
  );
};

export default AmboLiveInputTile;
