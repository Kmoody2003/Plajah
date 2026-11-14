import React from 'react';
import type { CaptionCue, CaptionFormat, FrameRate } from '../../services/crossover/captions';
import type { ConvertResult, Job, SourceFile } from '../../services/crossover';

/** One thing in the bin: media with an optional caption track, or a caption file on its own. */
export interface BinItem {
  id: string;
  source: SourceFile;
  /** What the player loads. Null until something makes the file playable. */
  playUrl: string | null;
  isCaption?: boolean;
  /** A review copy made because the player can't decode the original. */
  proxyUrl?: string;
  thumbUrl?: string;
}

export interface CaptionTrack {
  name: string;
  cues: CaptionCue[];
  sourceFormat?: CaptionFormat;
  warnings: string[];
  /** Set when the track was read from a broadcast file. */
  rateId?: string;
}

export interface QueueJob extends Omit<Job, 'source' | 'backend'> {
  itemId: string;
  source: SourceFile;
  label: string;
  backend?: ConvertResult['backend'];
  previewUrl?: string;
  previewCanvas?: HTMLCanvasElement;
  outSec?: number;
  outputProbe?: SourceFile['probe'];
  savedMessage?: string;
  /** A status line for before the percentages start, such as a codec pack downloading. */
  stage?: string;
}

export const humanSize = (b?: number) => {
  if (b === undefined || b === null) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

export const humanDuration = (sec?: number) => {
  if (!sec && sec !== 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

export const humanBitrate = (bps?: number) => (bps ? (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mb/s` : `${Math.round(bps / 1000)} kb/s`) : '');

export const eyebrow = 'pj-eyebrow';
export const mono: React.CSSProperties = { fontFamily: 'var(--font-mono-tech)', fontVariantNumeric: 'tabular-nums' };

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block type-label-md mb-1.5" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      {children}
      {hint && <span className="block type-body-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, ariaLabel }: { value?: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel?: string }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-[42px] px-3 type-body-md outline-none"
      style={{ background: 'var(--glass-2)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-md)', color: 'var(--text-primary)' }}
    >
      {options.map((o) => <option key={o.value} value={o.value} style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ label, sub, on, onToggle }: { label: string; sub?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="tap w-full flex items-center justify-between gap-3 py-2 text-left">
      <span>
        <span className="block type-body-md" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {sub && <span className="block type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{sub}</span>}
      </span>
      <span className="relative shrink-0 w-10 h-6" style={{ borderRadius: 'var(--pj-radius-full)', background: on ? 'var(--pj-grad-brand)' : 'var(--glass-3)' }}>
        <span className="absolute top-0.5 w-5 h-5 transition-all" style={{ left: on ? 18 : 2, borderRadius: 'var(--pj-radius-full)', background: 'var(--text-primary)' }} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; title?: string }[] }) {
  return (
    <div className="flex p-0.5 gap-0.5" role="tablist" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-full)' }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} title={o.title} onClick={() => onChange(o.value)}
          className="tap flex-1 px-3 h-8 type-label-md whitespace-nowrap transition-colors"
          style={{
            borderRadius: 'var(--pj-radius-full)',
            background: value === o.value ? 'var(--glass-4)' : 'transparent',
            color: value === o.value ? 'var(--text-primary)' : 'var(--on-surface-variant)',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--m3-border)' }}>
      <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
      <span className="type-body-sm text-right min-w-0 break-words" style={{ color: 'var(--text-primary)', ...mono }}>{value}</span>
    </div>
  );
}

export type { FrameRate };
