import React from 'react';
import { X } from 'lucide-react';

export type CardAccent = 'orange' | 'magenta' | 'cyan' | 'purple' | 'lilac';

const ACCENT: Record<CardAccent, { color: string; soft: string }> = {
  orange:  { color: 'var(--pj-orange)',  soft: 'var(--pj-orange-soft)' },
  magenta: { color: 'var(--pj-magenta)', soft: 'var(--pj-magenta-soft)' },
  cyan:    { color: 'var(--pj-cyan)',    soft: 'var(--pj-cyan-soft)' },
  purple:  { color: 'var(--pj-lilac)',   soft: 'var(--pj-purple-soft)' },
  lilac:   { color: 'var(--pj-lilac)',   soft: 'var(--pj-glass-2)' },
};

/**
 * The one consistent frame for every native timeline card: icon + kicker header, a content slot, and a
 * single primary CTA. All colours are design tokens (styles/plajah-ds.css).
 */
const FeedCardFrame: React.FC<{
  icon: React.ReactNode;
  kicker: string;
  accent?: CardAccent;
  cta: string;
  onOpen: () => void;
  /** Optional "not interested in this kind of card" affordance. */
  onDismiss?: () => void;
  /** Pulsing dot, for LIVE_NOW. */
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ icon, kicker, accent = 'orange', cta, onOpen, onDismiss, live, children, className = '' }) => {
  const a = ACCENT[accent];
  return (
    <article
      className={`relative overflow-hidden rounded-3xl border p-4 ${className}`}
      style={{ background: 'var(--pj-glass-1)', borderColor: 'var(--pj-border)', boxShadow: 'var(--pj-elev-1)' }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: a.color, opacity: 0.55 }} aria-hidden />
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: a.soft, color: a.color }}>
          {icon}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: a.color }}>{kicker}</span>
        {live && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--pj-danger)' }} aria-hidden />}
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label={`Hide ${kicker} cards`} className="ml-auto rounded-full p-1 opacity-50 transition-opacity hover:opacity-100">
            <X size={14} />
          </button>
        )}
      </header>
      {children}
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex w-full items-center justify-center rounded-full px-4 text-xs font-black uppercase tracking-widest text-white transition-transform active:scale-95"
        style={{ height: 'var(--pj-ctl-h-sm)', background: a.color === 'var(--pj-cyan)' ? 'var(--pj-grad-spatial)' : 'var(--pj-grad-ember)' }}
      >
        {cta}
      </button>
    </article>
  );
};

export default FeedCardFrame;
