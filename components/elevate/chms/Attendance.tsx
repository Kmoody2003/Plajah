// Attendance — services + ministry/group meetings: roll call, visitor capture, self check-in link/QR,
// trends (weekly totals, retention), dropped-off alert, history + CSV.
import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, UserPlus, Download, Link2, AlertTriangle } from 'lucide-react';
import {
  todayISO, serviceKey, groupKey, recordAttendance, removeAttendance, weeklyTotals, retentionRate, lapsedPeople, attendanceCSV,
  savePerson, fullName, selfCheckInUrl, downloadText, ageBand, weeksSince, lastAttendanceByPerson,
} from '../../../services/chmsPeople';
import type { AttEvent } from '../../../services/chmsPeople';
import { usePeople, card, field, fieldSm, btn, btnPrimary, h2, label, Stat, Bars, Empty } from './PeopleUI';

export const useEventPicker = () => {
  const { org, access } = usePeople();
  const ministries = (org.ministries || []).filter(m => !access.ministryScope || access.ministryScope.includes(m.id));
  const [kind, setKind] = useState<'service' | 'group'>(access.ministryScope ? 'group' : 'service');
  const [date, setDate] = useState(todayISO());
  const [svc, setSvc] = useState('Sunday Service');
  const [mid, setMid] = useState(ministries[0]?.id || '');
  const ev: AttEvent | null = kind === 'service'
    ? (access.ministryScope ? null : { eventKey: serviceKey(date, svc), eventLabel: `${svc} · ${date}`, date })
    : mid ? { eventKey: groupKey(mid, date), eventLabel: `${ministries.find(m => m.id === mid)?.name || 'Group'} · ${date}`, date, ministryId: mid } : null;
  const picker = (
    <div className="flex flex-wrap gap-2 items-center">
      {!access.ministryScope && <select value={kind} onChange={e => setKind(e.target.value as any)} className={fieldSm}><option value="service">Service</option><option value="group">Group / ministry</option></select>}
      {kind === 'service'
        ? <input value={svc} onChange={e => setSvc(e.target.value)} className={`${fieldSm} w-40`} placeholder="Service name" />
        : <select value={mid} onChange={e => setMid(e.target.value)} className={fieldSm}><option value="">Pick ministry…</option>{ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
      <input type="date" value={date} onChange={e => setDate(e.target.value)} className={fieldSm} />
    </div>
  );
  return { ev, picker };
};

const Attendance: React.FC = () => {
  const { org, people, attendance, access, reload, patchAttendance } = usePeople();
  const { ev, picker } = useEventPicker();
  const [q, setQ] = useState('');
  const [guest, setGuest] = useState({ name: '', phone: '', email: '', note: '' });
  const [qr, setQr] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [ministryFilter, setMinistryFilter] = useState('');

  const present = useMemo(() => new Map(attendance.filter(a => ev && a.eventKey === ev.eventKey && a.personId).map(a => [a.personId!, a])), [attendance, ev?.eventKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const guests = attendance.filter(a => ev && a.eventKey === ev.eventKey && !a.personId);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = ev?.ministryId ? people.filter(p => p.ministryIds?.includes(ev.ministryId!)) : people;
    const pool = n || !ev?.ministryId ? people : base;   // searching always spans everyone
    return pool.filter(p => (p.status !== 'DECEASED' && p.status !== 'TRANSFERRED') && (!n || fullName(p).toLowerCase().includes(n))).slice(0, 120);
  }, [people, q, ev?.ministryId]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ev && access.staff) QRCode.toDataURL(selfCheckInUrl(org.id, ev.eventKey), { width: 320, margin: 2 }).then(setQr).catch(() => setQr('')); else setQr(''); }, [ev?.eventKey, org.id, access.staff]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (id: string) => {
    if (!ev) return;
    const ex = present.get(id);
    if (ex) { patchAttendance(a => a.filter(x => x.id !== ex.id)); await removeAttendance(ex.id).catch(() => reload()); }
    else { const p = people.find(x => x.id === id); const rec = await recordAttendance(org.id, ev, { personId: id, householdId: p?.householdId }); patchAttendance(a => [...a.filter(x => x.id !== rec.id), rec]); }
  };
  const addGuest = async () => {
    if (!ev || !guest.name.trim()) return;
    const [first, ...rest] = guest.name.trim().split(/\s+/);
    // A visitor is also created as a VISITOR record so follow-up care picks them up.
    const p = access.staff ? await savePerson(org.id, { firstName: first, lastName: rest.join(' ') || '(guest)', phone: guest.phone || undefined, email: guest.email || undefined, status: 'VISITOR' }).catch(() => null) : null;
    const rec = await recordAttendance(org.id, ev, p ? { personId: p.id, visitor: { phone: guest.phone || undefined, email: guest.email || undefined, note: guest.note || undefined } } : { guestName: guest.name.trim(), visitor: { phone: guest.phone || undefined, email: guest.email || undefined, note: guest.note || undefined } });
    patchAttendance(a => [...a, rec]); setGuest({ name: '', phone: '', email: '', note: '' }); if (p) reload();
  };

  const scoped = useMemo(() => ministryFilter ? attendance.filter(a => a.ministryId === ministryFilter) : attendance, [attendance, ministryFilter]);
  const weekly = useMemo(() => weeklyTotals(scoped, ministryFilter ? undefined : { servicesOnly: true }).slice(-12), [scoped, ministryFilter]);
  const retention = useMemo(() => retentionRate(attendance), [attendance]);
  const lapsed = useMemo(() => lapsedPeople(people, attendance, weeks), [people, attendance, weeks]);
  const avg = weekly.length ? Math.round(weekly.reduce((s, w) => s + w.total, 0) / weekly.length) : 0;
  const lastSeen = useMemo(() => lastAttendanceByPerson(attendance), [attendance]);
  void ageBand; void weeksSince;

  return (
    <div className="space-y-6">
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center gap-3 justify-between"><h3 className={h2}>Record attendance</h3>{picker}</div>
        {!ev ? <p className="text-xs text-white/40">Pick a ministry to take attendance for.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search to check someone in…" className={`${field} flex-1 min-w-[200px]`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-small-orange">{present.size + guests.length} present</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-80 overflow-y-auto">
              {list.map(p => {
                const on = present.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-left border transition-all ${on ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/10'}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-emerald-400 border-emerald-400' : 'border-white/30'}`}>{on && <Check size={11} className="text-black" />}</span>
                    <span className="truncate">{fullName(p)}</span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className={`${label} mb-2`}>Visitor / guest</p>
              <div className="grid sm:grid-cols-5 gap-2">
                <input value={guest.name} onChange={e => setGuest(g => ({ ...g, name: e.target.value }))} placeholder="Name" className={fieldSm} />
                <input value={guest.phone} onChange={e => setGuest(g => ({ ...g, phone: e.target.value }))} placeholder="Phone" className={fieldSm} />
                <input value={guest.email} onChange={e => setGuest(g => ({ ...g, email: e.target.value }))} placeholder="Email" className={fieldSm} />
                <input value={guest.note} onChange={e => setGuest(g => ({ ...g, note: e.target.value }))} placeholder="Note (invited by…)" className={fieldSm} />
                <button className={btnPrimary} onClick={addGuest} disabled={!guest.name.trim()}><UserPlus size={13} /> Add</button>
              </div>
              {guests.length > 0 && <p className="text-[10px] text-white/40 mt-2">Unlinked guests: {guests.map(g => g.guestName).join(', ')}</p>}
            </div>
            {access.staff && qr && (
              <div className="border-t border-white/10 pt-4 flex flex-wrap gap-4 items-center">
                <img src={qr} alt="Self check-in QR" className="w-24 h-24 rounded-xl bg-white p-1" />
                <div className="text-[11px] text-white/50 space-y-1.5 min-w-0">
                  <p className={label}>Self check-in (linked Plajah accounts)</p>
                  <p className="break-all select-all">{selfCheckInUrl(org.id, ev.eventKey)}</p>
                  <button className={btn} onClick={() => navigator.clipboard?.writeText(selfCheckInUrl(org.id, ev.eventKey))}><Link2 size={12} /> Copy link</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Avg weekly (12 wk)" value={avg} />
        <Stat label="Last week" value={weekly[weekly.length - 1]?.total ?? 0} hint={weekly[weekly.length - 1]?.week} />
        <Stat label="4-week retention" value={retention === null ? '—' : `${retention}%`} hint="seen before, seen again" />
        <Stat label="Dropped off" value={lapsed.length} hint={`${weeks}+ weeks away`} />
      </div>

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={h2}>Weekly totals</h3>
          <div className="flex gap-2">
            <select value={ministryFilter} onChange={e => setMinistryFilter(e.target.value)} className={fieldSm}><option value="">Services</option>{(org.ministries || []).filter(m => !access.ministryScope || access.ministryScope.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <button className={btn} onClick={() => downloadText('attendance.csv', attendanceCSV([...attendance], people))}><Download size={12} /> CSV</button>
          </div>
        </div>
        {weekly.length ? <Bars rows={weekly.map(w => ({ label: w.week.slice(5), value: w.total }))} /> : <Empty>No attendance recorded yet.</Empty>}
      </div>

      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`${h2} flex items-center gap-1.5`}><AlertTriangle size={12} /> Hasn't attended in</h3>
          <select value={weeks} onChange={e => setWeeks(Number(e.target.value))} className={fieldSm}>{[2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n} weeks</option>)}</select>
        </div>
        {lapsed.length === 0 ? <p className="text-xs text-white/40">Nobody has dropped off.</p> : (
          <div className="grid sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
            {lapsed.slice(0, 100).map(x => (
              <div key={x.person.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                <span className="font-bold text-white flex-1 truncate">{fullName(x.person)}</span><span className="text-amber-300">{x.weeks} wk</span><span className="text-white/30">{lastSeen.get(x.person.id)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Attendance;
