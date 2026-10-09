import React from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import type { Fidelity, PageFidelity } from '../../services/bookTela/types';
import { READER_ONLY_NOTES } from '../../services/bookTela/model';

const LOOK: Record<Fidelity, { label: string; color: string; bg: string; Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }> = {
  FULL: { label: 'Full', color: 'var(--pj-success, #06D6A0)', bg: 'var(--pj-success-soft, rgba(6,214,160,.14))', Icon: CheckCircle2 },
  DEGRADED: { label: 'Degraded', color: 'var(--pj-warning, #F59E0B)', bg: 'var(--pj-warning-soft, rgba(245,158,11,.14))', Icon: AlertTriangle },
  OMITTED: { label: 'Omitted', color: 'var(--pj-danger, #EF4444)', bg: 'var(--pj-danger-soft, rgba(239,68,68,.14))', Icon: MinusCircle },
};

/** Export-fidelity chip. Always carries text, never colour alone. */
export function FidelityBadge({ fidelity, title }: { fidelity: Fidelity; title?: string }) {
  const l = LOOK[fidelity];
  return (
    <span title={title} aria-label={`Export fidelity: ${l.label}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest"
      style={{ color: l.color, background: l.bg }}>
      <l.Icon size={10} aria-hidden /> {l.label}
    </span>
  );
}

/** Per-page list: every page that is not FULL, with what changes. */
export function FidelityReport({ pages, max = 12, readerOnly = [] }: { pages: PageFidelity[]; max?: number; /** extra reader-only lines for a living book (fidelityFor(...).readerOnly) */ readerOnly?: string[] }) {
  const bad = pages.filter(p => p.fidelity !== 'FULL');
  const full = pages.length - bad.length;
  return (
    <div>
      <p className="text-[11px] text-white/50 mb-2" role="status">{full} of {pages.length} pages export exactly as designed.{bad.length ? ` ${bad.length} change:` : ''}</p>
      {bad.length > 0 && (
        <ul className="space-y-1.5">
          {bad.slice(0, max).map(p => (
            <li key={p.frameId} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-2 flex-wrap"><FidelityBadge fidelity={p.fidelity} /><span className="text-xs font-bold text-white/80 truncate">{p.label}</span></div>
              <ul className="mt-1 text-[11px] text-white/45 leading-snug list-disc pl-4">{p.changes.map(c => <li key={c}>{c}</li>)}</ul>
            </li>
          ))}
          {bad.length > max && <li className="text-[11px] text-white/35">+{bad.length - max} more pages</li>}
        </ul>
      )}
      {[...READER_ONLY_NOTES, ...readerOnly].map(n => <p key={n} className="text-[11px] text-white/40 mt-3 leading-snug">{n}</p>)}
    </div>
  );
}
