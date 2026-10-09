import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Finding } from '../../services/bookmeta/types';

// Shared primitives for the book submission flow. Visual language matches BookCreatorWizard:
// #0d0d0d cards, white/5 fields, amber (#f59e0b) primary, #FF8C00 secondary.

export const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-amber-400/50 transition-all';
export const labelCls = 'block text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-2';
export const hintCls = 'text-[11px] text-white/35 mt-1.5 leading-snug';

export function Field({ label, hint, children, className = '' }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

export function Card({ title, subtitle, children, tone = 'default' }: { title?: string; subtitle?: React.ReactNode; children: React.ReactNode; tone?: 'default' | 'amber' | 'danger' }) {
  const tones = { default: 'border-white/10 bg-white/[0.02]', amber: 'border-amber-400/25 bg-amber-400/[0.05]', danger: 'border-red-400/30 bg-red-500/[0.05]' };
  return (
    <section className={`rounded-3xl border p-5 space-y-4 ${tones[tone]}`}>
      {(title || subtitle) && (
        <header>
          {title && <h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3>}
          {subtitle && <p className="text-[11px] text-white/40 mt-1 leading-snug">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all disabled:opacity-40 ${on ? 'border-amber-400/40 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
      <span className={`w-9 h-5 rounded-full relative flex-shrink-0 transition-all ${on ? 'bg-amber-400' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-all ${on ? 'left-[18px]' : 'left-0.5 bg-white/70'}`} />
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-black uppercase tracking-widest ${on ? 'text-white' : 'text-white/55'}`}>{label}</span>
        {sub && <span className="block text-[11px] text-white/35 mt-0.5 leading-snug normal-case tracking-normal font-normal">{sub}</span>}
      </span>
    </button>
  );
}

export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))` }}>
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={`p-3 rounded-2xl border text-left transition-all ${value === o.id ? 'border-amber-400/50 bg-amber-400/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
          <span className={`block text-xs font-black uppercase tracking-widest ${value === o.id ? 'text-white' : 'text-white/55'}`}>{o.label}</span>
          {o.sub && <span className="block text-[11px] text-white/35 mt-0.5 leading-snug">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

const SEV = {
  error: { icon: XCircle, cls: 'text-red-400', bg: 'border-red-400/25 bg-red-500/[0.05]', label: 'Must fix' },
  warning: { icon: AlertTriangle, cls: 'text-amber-400', bg: 'border-amber-400/25 bg-amber-400/[0.05]', label: 'Should fix' },
  info: { icon: Info, cls: 'text-sky-300', bg: 'border-white/10 bg-white/[0.02]', label: 'Note' },
} as const;

export function FindingRow({ f, onFix }: { f: Finding; onFix?: (f: Finding) => void }) {
  const s = SEV[f.severity]; const Icon = s.icon;
  return (
    <li className={`rounded-2xl border p-3 flex gap-3 ${s.bg}`}>
      <Icon size={16} className={`${s.cls} flex-shrink-0 mt-0.5`} aria-label={s.label} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-white/85 leading-snug">{f.message}</p>
        {f.fix && <p className="text-[12px] text-white/50 mt-1 leading-snug"><span className="text-white/70 font-bold">Fix: </span>{f.fix}</p>}
        {f.mirrors && <p className="text-[10px] text-white/25 mt-1 uppercase tracking-widest">Mirrors: {f.mirrors}</p>}
      </div>
      {onFix && <button type="button" onClick={() => onFix(f)} className="self-start text-[10px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300 flex-shrink-0">Go fix</button>}
    </li>
  );
}

export function FindingList({ findings, onFix, empty }: { findings: Finding[]; onFix?: (f: Finding) => void; empty?: string }) {
  if (!findings.length) return empty ? <p className="text-xs text-emerald-300/80 flex items-center gap-2"><CheckCircle2 size={14} /> {empty}</p> : null;
  const order = { error: 0, warning: 1, info: 2 } as const;
  return <ul className="space-y-2">{[...findings].sort((a, b) => order[a.severity] - order[b.severity]).map(f => <FindingRow key={`${f.code}${f.message}`} f={f} onFix={onFix} />)}</ul>;
}

export function Meter({ value, max, warnAt, label }: { value: number; max: number; warnAt?: number; label?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const over = value > max, warn = warnAt != null && value >= warnAt;
  return (
    <div className="mt-1.5">
      <div className="h-1 rounded-full bg-white/10 overflow-hidden"><div className={`h-full transition-all ${over ? 'bg-red-400' : warn ? 'bg-amber-400' : 'bg-emerald-400/70'}`} style={{ width: `${pct}%` }} /></div>
      <p className={`text-[11px] mt-1 tabular-nums ${over ? 'text-red-400' : 'text-white/35'}`}>{label ?? `${value.toLocaleString()} / ${max.toLocaleString()}`}</p>
    </div>
  );
}

export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 px-6 py-3 min-h-[44px] rounded-2xl text-[11px] font-black uppercase tracking-widest bg-amber-400 text-black hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-2xl text-[11px] font-black uppercase tracking-widest border border-white/10 text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-30';
