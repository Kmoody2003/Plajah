// CameraDeck — the small on-camera controls for capture surfaces: lens pills (.5 / 1 / 2), the swipeable
// effect-lens row, a bottom sheet for everything else, and the "camera couldn't start" card.
// The rule for this file: nothing here may cover the picture unless the person opened it.
import React, { useEffect, useRef } from 'react';
import { CameraOff, RotateCcw, X } from 'lucide-react';
import { LENSES, type LensId } from '../../services/lenses/lensEngine';
import { FilmStockToggle } from '../LensVideoOverlay';
import { lensPills, type RigState } from '../../services/camera/cameraRig';

/** One button per physical lens on the side of the phone in use, plus a zoom step when the sensor has one. */
export const LensPills: React.FC<{ rig: RigState; onLens: (deviceId: string) => void; onZoom: (v: number) => void }> = ({ rig, onLens, onZoom }) => {
  const pills = lensPills(rig.cameras, rig.facing);
  const zoomSteps = !pills.length && rig.zoom && rig.zoom.max >= 2 ? [rig.zoom.min, 2] : [];
  if (!pills.length && !zoomSteps.length) return null;
  const base = 'w-9 h-9 rounded-full text-[12px] font-black grid place-items-center transition-colors active:scale-90';
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-black/35 backdrop-blur" data-lens-pills>
      {pills.map(p => (
        <button key={p.deviceId} onClick={() => onLens(p.deviceId)} aria-label={`Lens ${p.label}`} aria-pressed={rig.deviceId === p.deviceId}
          className={`${base} ${rig.deviceId === p.deviceId ? 'bg-white text-black' : 'text-white'}`}>{p.label}</button>
      ))}
      {zoomSteps.map(z => {
        const on = Math.abs((rig.zoom?.value ?? 1) - z) < 0.05;
        return <button key={z} onClick={() => onZoom(z)} aria-label={`Zoom ${z}x`} aria-pressed={on}
          className={`${base} ${on ? 'bg-white text-black' : 'text-white'}`}>{z < 1 ? `.${Math.round(z * 10)}` : z}</button>;
      })}
    </div>
  );
};

/** The effect lenses as one row of round buttons. A tap applies it right away; nothing blocks the next tap. */
export const LensRow: React.FC<{ value: LensId; onChange: (id: LensId) => void; status?: string }> = ({ value, onChange, status }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [value]);
  const active = LENSES.find(l => l.id === value);
  return (
    <div className="w-full" data-lens-row>
      <p className="text-center text-[12px] font-bold text-white drop-shadow pb-1.5 min-h-[20px]">
        {value === 'none' ? '' : status || active?.label}
      </p>
      <div ref={rowRef} className="flex gap-2.5 overflow-x-auto px-4 pb-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LENSES.map(l => (
          <button key={l.id} onClick={() => onChange(l.id)} title={l.blurb} aria-label={l.label} aria-pressed={value === l.id}
            className={`shrink-0 snap-center w-[52px] h-[52px] rounded-full grid place-items-center text-[22px] transition-all active:scale-90 ${value === l.id ? 'bg-white/25 ring-[3px] ring-white' : 'bg-black/35 backdrop-blur'}`}>
            {l.icon}
          </button>
        ))}
      </div>
      {value === 'colorize' && <div className="flex justify-center"><FilmStockToggle /></div>}
    </div>
  );
};

/** Bottom sheet that holds the settings so the camera screen doesn't have to. */
export const CameraSheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="absolute inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-label={title}>
    <button aria-label="Close" className="flex-1 min-h-[18dvh]" onClick={onClose} />
    <div className="bg-[#111014]/95 backdrop-blur-2xl rounded-t-3xl border-t border-white/10 max-h-[82dvh] flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
        <p className="text-[15px] font-bold text-white">{title}</p>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white"><X size={16} /></button>
      </div>
      <div className="overflow-y-auto px-4 pb-6 space-y-3" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>{children}</div>
    </div>
  </div>
);

/** Shown over the viewfinder when there's no camera. Says why and offers the way back, never a dead end. */
export const CameraProblem: React.FC<{ message: string; onRetry: () => void; onClose: () => void }> = ({ message, onRetry, onClose }) => (
  <div className="absolute inset-0 z-[55] bg-black flex flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
    <CameraOff size={38} className="text-white/50" />
    <p className="text-white font-bold">Camera isn't on</p>
    <p className="text-white/55 text-sm max-w-xs">{message}</p>
    <button onClick={onRetry} className="mt-2 px-6 py-3 bg-white text-black rounded-full font-bold flex items-center gap-2"><RotateCcw size={16} /> Try again</button>
    <button onClick={onClose} className="px-6 py-2 text-white/60 text-sm font-semibold">Back</button>
  </div>
);

/** A settings row with a switch. */
export const SheetToggle: React.FC<{ on: boolean; onToggle: () => void; icon: React.ReactNode; title: string; hint: string }> = ({ on, onToggle, icon, title, hint }) => (
  <button onClick={onToggle} role="switch" aria-checked={on} className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-2xl bg-white/[0.05]">
    <span className={on ? 'text-white' : 'text-white/45'}>{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-[13px] font-semibold text-white leading-tight">{title}</span>
      <span className="block text-[11px] text-white/45 leading-snug mt-0.5">{hint}</span>
    </span>
    <span className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? 'bg-white' : 'bg-white/15'}`}>
      <span className={`block w-5 h-5 rounded-full transition-transform ${on ? 'translate-x-4 bg-black' : 'bg-white'}`} />
    </span>
  </button>
);
