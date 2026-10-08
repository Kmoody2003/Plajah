// Shared context + primitives for the Elevate ChMS People hub (styling matches components/elevate/*).
import React, { createContext, useContext } from 'react';
import { X } from 'lucide-react';
import type { Organization, OrgMembership, ChmsPerson, ChmsHousehold, ChmsAttendance, ChmsMemberStatus } from '../../../types';
import type { PeopleAccess, ChmsTask, ChmsShift } from '../../../services/chmsPeople';

export const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
export const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
export const fieldSm = 'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-small-orange/50 placeholder:text-white/25';
export const btn = 'px-4 py-2.5 rounded-full bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 disabled:opacity-30 transition-all inline-flex items-center gap-2 justify-center';
export const btnPrimary = 'px-5 py-2.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-30 transition-all inline-flex items-center gap-2 justify-center';
export const label = 'text-[9px] font-black uppercase tracking-widest text-white/40';
export const h2 = 'text-[10px] font-black uppercase tracking-widest text-small-orange';

export const STATUSES: ChmsMemberStatus[] = ['VISITOR', 'REGULAR', 'MEMBER', 'INACTIVE', 'TRANSFERRED', 'DECEASED'];
export const statusColor: Record<ChmsMemberStatus, string> = {
  VISITOR: 'bg-sky-500/15 text-sky-300', REGULAR: 'bg-indigo-500/15 text-indigo-300', MEMBER: 'bg-emerald-500/15 text-emerald-300',
  INACTIVE: 'bg-white/10 text-white/50', TRANSFERRED: 'bg-amber-500/15 text-amber-300', DECEASED: 'bg-white/5 text-white/30',
};

export interface PeopleCtxValue {
  org: Organization;
  myMembership: OrgMembership | null;
  access: PeopleAccess;
  /** Redacted + ministry-scoped list the viewer is allowed to see. */
  people: ChmsPerson[];
  households: ChmsHousehold[];
  attendance: ChmsAttendance[];
  tasks: ChmsTask[];
  shifts: ChmsShift[];
  /** Set of personIds who gave in the last 12 months (flag only), null if the viewer cannot read finance data. */
  gaveFlags: Set<string> | null;
  members: OrgMembership[];
  reload: () => Promise<void>;
  /** Optimistic local update of the attendance list (roll-call / kiosk) without a full refetch. */
  patchAttendance: (fn: (a: ChmsAttendance[]) => ChmsAttendance[]) => void;
  openPerson: (id: string) => void;
}
export const PeopleCtx = createContext<PeopleCtxValue | null>(null);
export const usePeople = () => { const c = useContext(PeopleCtx); if (!c) throw new Error('PeopleCtx missing'); return c; };

export const StatusPill: React.FC<{ s: ChmsMemberStatus }> = ({ s }) => (
  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusColor[s]}`}>{s}</span>
);

export const Modal: React.FC<{ title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, onClose, wide, children }) => (
  <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-8 overflow-y-auto" onClick={onClose}>
    <div className={`bg-[#0b0b0f] border border-white/10 rounded-[2rem] w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} p-5 sm:p-7`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">{title}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>
      {children}
    </div>
  </div>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label: l, value, hint }) => (
  <div className={`${card} p-4`}>
    <p className="text-2xl font-black text-white">{value}</p>
    <p className={`${label} mt-1`}>{l}</p>
    {hint && <p className="text-[9px] text-white/30 mt-0.5">{hint}</p>}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={`${card} p-8 text-center text-xs text-white/40`}>{children}</div>
);

/** Simple horizontal bar list (no chart dependency). */
export const Bars: React.FC<{ rows: { label: string; value: number }[]; max?: number }> = ({ rows, max }) => {
  const m = max ?? Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2 text-[10px]">
          <span className="w-20 shrink-0 text-white/50 font-bold truncate">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-small-orange" style={{ width: `${(r.value / m) * 100}%` }} /></div>
          <span className="w-8 text-right text-white/60 font-bold">{r.value}</span>
        </div>
      ))}
    </div>
  );
};

export const fmtDate = (iso?: string) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : iso; };
