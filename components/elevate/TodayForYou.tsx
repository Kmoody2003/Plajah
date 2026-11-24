// TodayForYou — the Member home's one "to do" surface: at most three things, each with one action.
// Live classes first, then open shifts and to-dos by due date. Same records as the full My work panel
// (services/memberTasksService, Christian Ed classes); "See all" opens that panel.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { Ministry, Organization } from '../../types';
import type { ChurchProgram } from '../../services/churchEducationService';
import { auth } from '../../services/backendService';
import { myClassRoles } from '../../services/memberDepartments';
import { loadMemberTasks, setMemberTaskDone, dueLabel, isOverdue, type MemberTaskItem } from '../../services/memberTasksService';
import { useClassLiveNow } from '../../hooks/useClassLiveNow';
import { EV } from './vellum';

type Row = {
  key: string;
  badge: string;
  tone: 'violet' | 'green' | 'gold' | 'live';
  title: string;
  sub: string;
  action: string;
  onAction: () => void | Promise<void>;
};

const TONE: Record<Row['tone'], { bg: string; fg: string }> = {
  violet: { bg: 'rgba(122,31,192,0.18)', fg: '#D0BCFF' },
  green: { bg: 'rgba(127,216,176,0.14)', fg: '#7FD8B0' },
  gold: { bg: 'rgba(226,194,126,0.14)', fg: '#E2C27E' },
  live: { bg: 'rgba(212,0,85,0.22)', fg: '#FF8FB4' },
};

const dayBadge = (iso?: string) => {
  if (!iso) return '•';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '•' : d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3);
};

export const TodayForYou: React.FC<{
  org: Organization;
  departments: Ministry[];
  programs: ChurchProgram[] | null;
  seesAllClasses?: boolean;
  /** Showcase rows for the demo church. */
  demo?: boolean;
  onOpenClass?: (classId: string) => void;
  onOpenServe?: () => void;
  onSeeAll?: () => void;
  seeAllOpen?: boolean;
}> = ({ org, departments, programs, seesAllClasses, demo, onOpenClass, onOpenServe, onSeeAll, seeAllOpen }) => {
  const uid = auth.currentUser?.uid || '';
  const [tasks, setTasks] = useState<MemberTaskItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (demo || !uid) { setTasks([]); return; }
    const r = await loadMemberTasks(org.id).catch(() => ({ items: [] as MemberTaskItem[] }));
    setTasks(r.items);
  }, [org.id, uid, demo]);
  useEffect(() => { setTasks(null); void reload(); }, [reload]);

  const { teaching, enrolled } = useMemo(() => myClassRoles(programs || [], uid), [programs, uid]);
  const myClasses = useMemo(() => {
    if (!programs) return [];
    if (seesAllClasses) return programs.filter(p => !p.publicCard);
    return programs.filter(p => teaching.includes(p) || enrolled.includes(p));
  }, [programs, seesAllClasses, teaching, enrolled]);
  const live = useClassLiveNow(useMemo(() => myClasses.map(p => p.id), [myClasses]));

  const deptName = (id?: string) => (id ? departments.find(d => d.id === id)?.name || (org.ministries || []).find(m => m.id === id)?.name || '' : '');

  const rows: Row[] = useMemo(() => {
    if (demo) {
      return [
        { key: 'd1', badge: 'THU', tone: 'violet', title: 'Choir rehearsal', sub: 'Worship & Arts · 7:00 pm · Sanctuary', action: 'I’ll be there', onAction: () => onOpenServe?.() },
        { key: 'd2', badge: 'SUN', tone: 'green', title: 'Greeter shift · 8:30 am', sub: 'Hospitality Team · North door', action: 'Confirm', onAction: () => onOpenServe?.() },
        { key: 'd3', badge: '✓', tone: 'gold', title: 'Learn the new arrangement', sub: 'From your choir director · due Thu', action: 'Done', onAction: () => {} },
      ];
    }
    const out: Row[] = [];
    myClasses.filter(p => !!live[p.id]).forEach(p => out.push({
      key: `live:${p.id}`, badge: 'LIVE', tone: 'live', title: p.title || 'Class', sub: 'Your class is live now', action: 'Join', onAction: () => onOpenClass?.(p.id),
    }));
    const open = (tasks || []).filter(t => !t.done && t.shiftStatus !== 'DECLINED')
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    open.forEach(t => {
      const where = [deptName(t.ministryId), t.positionName].filter(Boolean).join(' · ');
      const when = dueLabel(t);
      const sub = [where, when && (isOverdue(t) ? `${when} · overdue` : when)].filter(Boolean).join(' · ') || (t.source === 'SHIFT' ? 'Scheduled shift' : 'To-do');
      if (t.source === 'SHIFT') {
        out.push({ key: t.key, badge: dayBadge(t.dueDate), tone: 'green', title: t.title, sub, action: t.shiftStatus === 'CONFIRMED' ? 'View' : 'Confirm', onAction: () => onOpenServe?.() });
      } else {
        out.push({
          key: t.key, badge: '✓', tone: 'gold', title: t.title, sub, action: 'Done',
          onAction: async () => {
            setBusy(t.key);
            setTasks(prev => (prev || []).map(x => (x.key === t.key ? { ...x, done: true } : x)));
            try { await setMemberTaskDone(t, true); } catch { setTasks(prev => (prev || []).map(x => (x.key === t.key ? { ...x, done: false } : x))); }
            setBusy(null);
          },
        });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, tasks, myClasses, live, departments]);

  const shown = rows.slice(0, 3);
  const more = rows.length - shown.length;
  const loading = !demo && tasks === null;

  return (
    <section aria-label="Today for you" className="rounded-2xl border px-[18px] pt-4 pb-1.5" style={{ background: EV.panel, borderColor: EV.line }} data-testid="today-for-you">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: EV.muted }}>Today for you</p>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-[12px] font-semibold" style={{ color: EV.violetText }}>
            {seeAllOpen ? 'Hide' : more > 0 ? `See all (${rows.length})` : 'See all'}
          </button>
        )}
      </div>
      {loading ? (
        <div className="py-5 flex justify-center"><Loader2 size={16} className="animate-spin text-white/30" /></div>
      ) : shown.length === 0 ? (
        <p className="m-0 py-4 text-[14px]" style={{ color: EV.ink2 }}>You’re all caught up. Shifts, class times and to-dos from {org.name} will show up here.</p>
      ) : (
        <ul className="m-0 p-0 list-none mt-2.5">
          {shown.map(r => (
            <li key={r.key} className="flex items-center gap-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <span className="w-9 h-9 rounded-[10px] shrink-0 grid place-items-center text-[11px] font-bold" style={{ background: TONE[r.tone].bg, color: TONE[r.tone].fg }}>{r.badge}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-white truncate">{r.title}</span>
                <span className="block text-[12px] truncate" style={{ color: EV.muted }}>{r.sub}</span>
              </span>
              <button onClick={() => void r.onAction()} disabled={busy === r.key}
                className="shrink-0 min-h-[34px] px-3.5 rounded-full border text-[12px] font-semibold text-white hover:bg-white/[0.06] disabled:opacity-50 inline-flex items-center gap-1.5"
                style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
                {busy === r.key ? <Loader2 size={12} className="animate-spin" /> : r.action === 'Done' ? <Check size={12} /> : null}{r.action}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default TodayForYou;
