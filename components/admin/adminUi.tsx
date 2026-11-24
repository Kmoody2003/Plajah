import React from 'react';

/** Shared building blocks for the System Admin consoles, so every section reads the same. */

export const nf = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());
export const usd = (n: number | null | undefined) => (n == null ? '—' : '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const cents = (n: number | null | undefined) => (n == null ? '—' : usd(n / 100));
export const pct = (n: number | null | undefined) => (n == null ? '—' : (n * 100).toFixed(2) + '%');
export const when = (ms?: number) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export const Header: React.FC<{ title: string; sub?: string; right?: React.ReactNode }> = ({ title, sub, right }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div>
      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white leading-none">{title}</h1>
      {sub && <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-2">{sub}</p>}
    </div>
    {right}
  </header>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad'; onClick?: () => void }> = ({ label, value, hint, tone = 'default', onClick }) => {
  const color = { default: 'text-white', good: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400' }[tone];
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={'text-left p-5 bg-white/5 border border-white/5 rounded-3xl ' + (onClick ? 'hover:bg-white/10 transition-colors' : '')}>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className={'text-2xl font-black tracking-tight ' + color}>{value}</p>
      {hint && <p className="text-[10px] text-white/30 mt-1">{hint}</p>}
    </Tag>
  );
};

export const Panel: React.FC<{ title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, sub, right, children, className = '' }) => (
  <section className={'p-6 bg-white/5 border border-white/5 rounded-3xl ' + className}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-white">{title}</h3>
        {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

const PILL: Record<string, string> = {
  good: 'bg-emerald-500/15 text-emerald-300', warn: 'bg-amber-500/15 text-amber-300', bad: 'bg-red-500/15 text-red-300', info: 'bg-sky-500/15 text-sky-300', mute: 'bg-white/5 text-white/40',
};
export const Pill: React.FC<{ tone?: 'good' | 'warn' | 'bad' | 'info' | 'mute'; children: React.ReactNode }> = ({ tone = 'mute', children }) => (
  <span className={'inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ' + PILL[tone]}>{children}</span>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' }> = ({ tone = 'ghost', className = '', ...p }) => (
  <button {...p} className={'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:pointer-events-none ' + (
    tone === 'primary' ? 'bg-white text-black hover:scale-105' : tone === 'danger' ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
  ) + ' ' + className} />
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-white/30 py-6 text-center border border-dashed border-white/10 rounded-2xl">{children}</p>
);

export const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs">
      <thead><tr className="text-[9px] font-black uppercase tracking-widest text-white/30">{head.map(h => <th key={h} className="py-2 pr-4 font-black">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-white/5">{children}</tbody>
    </table>
  </div>
);

/** Loads once, exposes reload; keeps errors on screen instead of swallowing them. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const reload = React.useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fn()); } catch (e: any) { setError(e?.message || 'Failed to load'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}
