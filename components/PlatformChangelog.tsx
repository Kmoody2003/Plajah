import React, { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Wrench, ChevronDown, Rocket } from 'lucide-react';
import { CHANGELOG, ChangelogEntry, ChangeLevel } from '../data/changelog';

interface PlatformChangelogProps {
  onBack: () => void;
  /** Admins may reveal the technical description under each change. */
  showTechnical?: boolean;
}

const AREA_COLORS: Record<string, string> = {
  Sharing: '#00B4D8', Elevate: '#8B5CF6', Church: '#F59E0B', Teleprompter: '#EF4444',
  Organizations: '#10B981', Accounts: '#7B2FBE', default: '#9CA3AF',
};

const LevelBadge: React.FC<{ level: ChangeLevel }> = ({ level }) => (
  level === 'major'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 text-[#C4B5FD] text-[8px] font-black uppercase tracking-widest"><Rocket size={9} /> New</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-white/45 text-[8px] font-black uppercase tracking-widest"><Wrench size={9} /> Improved</span>
);

const EntryRow: React.FC<{ entry: ChangelogEntry; showTechnical?: boolean }> = ({ entry, showTechnical }) => {
  const [open, setOpen] = useState(false);
  const accent = AREA_COLORS[entry.area] || AREA_COLORS.default;
  return (
    <div className="relative pl-6 pb-6 last:pb-0">
      {/* timeline dot + line */}
      <span className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-black" style={{ background: accent }} />
      <span className="absolute left-[4.5px] top-4 bottom-0 w-px bg-white/10" />
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <LevelBadge level={entry.level} />
        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: accent }}>{entry.area}</span>
        <span className="text-[9px] text-white/25 font-bold">{entry.time}</span>
      </div>
      <p className="text-[13px] font-black text-white leading-tight">{entry.title}</p>
      <p className="text-[12px] text-white/55 leading-relaxed mt-1">{entry.plain}</p>
      {showTechnical && (
        <button onClick={() => setOpen(o => !o)} className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
          <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} /> Technical · {entry.id}
        </button>
      )}
      {showTechnical && open && (
        <p className="mt-1.5 text-[11px] text-white/40 leading-relaxed font-mono bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2">{entry.technical}</p>
      )}
    </div>
  );
};

const PlatformChangelog: React.FC<PlatformChangelogProps> = ({ onBack, showTechnical }) => {
  const grouped = useMemo(() => {
    const byDate: { date: string; entries: ChangelogEntry[] }[] = [];
    for (const e of CHANGELOG) {
      let g = byDate.find(x => x.date === e.date);
      if (!g) { g = { date: e.date, entries: [] }; byDate.push(g); }
      g.entries.push(e);
    }
    return byDate;
  }, []);

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const majorCount = CHANGELOG.filter(e => e.level === 'major').length;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#8B5CF6]" />
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/70">What's New</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">How Plajah is evolving</h1>
        <p className="text-white/50 text-sm mt-2 leading-relaxed max-w-xl">
          A running record of everything we ship, in plain English — {majorCount} new features and many
          refinements. Newest changes first.
        </p>

        <div className="mt-8">
          {grouped.map(group => (
            <section key={group.date} className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">{fmtDate(group.date)}</h2>
                <span className="flex-1 h-px bg-white/8" />
                <span className="text-[9px] text-white/25 font-bold">{group.entries.length} update{group.entries.length !== 1 ? 's' : ''}</span>
              </div>
              <div>
                {group.entries.map(e => <EntryRow key={e.id} entry={e} showTechnical={showTechnical} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlatformChangelog;
