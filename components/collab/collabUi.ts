// components/collab/collabUi.ts — shared styling tokens for the collaboration dock.

export const lbl = 'text-[.6rem] font-extrabold uppercase tracking-[.14em] text-white/40';
export const btn =
  'h-7 px-2.5 rounded-[8px] text-[.66rem] font-bold flex items-center justify-center gap-1 border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] text-white/85 disabled:opacity-40 disabled:pointer-events-none transition-colors';
export const btnPrimary =
  'h-7 px-3 rounded-[8px] text-[.66rem] font-extrabold flex items-center justify-center gap-1 bg-[var(--pj-cyan,#00DAF3)] text-black hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none transition';
export const input =
  'h-8 w-full rounded-[8px] bg-black/30 border border-white/10 px-2.5 text-[.72rem] text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--pj-cyan,#00DAF3)]/60';
export const card = 'rounded-[10px] border border-white/[0.08] bg-white/[0.03]';

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}
