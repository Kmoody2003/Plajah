// Reports: membership roll, directory print (privacy-respecting), birthdays/anniversaries, new members,
// status changes, demographics, growth trend. All exports are audit-logged.
import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  membershipRollCSV, directoryCSV, directoryPrintable, demographics, growthByMonth, statusChanges, downloadText, fullName, toCSV, todayISO,
} from '../../../services/chmsPeople';
import { logOrgAction } from '../../../services/orgAudit';
import { usePeople, card, fieldSm, btn, h2, Bars, Stat, Empty, StatusPill, fmtDate } from './PeopleUI';

type R = 'roll' | 'directory' | 'dates' | 'new' | 'status' | 'demo' | 'growth';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PeopleReports: React.FC = () => {
  const { org, people, access } = usePeople();
  const [r, setR] = useState<R>('demo');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [since, setSince] = useState(todayISO(new Date(Date.now() - 90 * 86400000)));
  const live = useMemo(() => people.filter(p => !p.archived), [people]);
  const demo = useMemo(() => demographics(live), [live]);
  const growth = useMemo(() => growthByMonth(live), [live]);
  const dates = useMemo(() => live.flatMap(p => [['Birthday', p.birthDate], ['Anniversary', p.anniversary]].filter(([, d]) => d && Number((d as string).slice(5, 7)) === month).map(([k, d]) => ({ p, k: k as string, d: d as string }))).sort((a, b) => a.d.slice(8).localeCompare(b.d.slice(8))), [live, month]);
  const newMembers = useMemo(() => live.filter(p => p.status === 'MEMBER' && (p.memberSince || '') >= since).sort((a, b) => (b.memberSince || '').localeCompare(a.memberSince || '')), [live, since]);
  const changes = useMemo(() => statusChanges(live, new Date(since).getTime()), [live, since]);
  const printable = live.filter(directoryPrintable);

  const out = (name: string, csv: string) => { logOrgAction(org.id, 'CHMS_EXPORT', { meta: { what: name } }); downloadText(`${name}.csv`, csv); };
  const exportBtn = (name: string, csv: () => string) => <button className={btn} onClick={() => out(name, csv())}><Download size={12} /> CSV</button>;
  const tabs: [R, string][] = [['demo', 'Demographics'], ['growth', 'Growth'], ['roll', 'Membership roll'], ['directory', 'Directory'], ['dates', 'Birthdays & anniversaries'], ['new', 'New members'], ['status', 'Status changes']];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">{tabs.map(([k, l]) => <button key={k} onClick={() => setR(k)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${r === k ? 'bg-white text-black' : 'bg-white/5 text-white/50'}`}>{l}</button>)}</div>
      {access.financeOnly && <p className="text-[10px] text-white/30">Finance view: minors' details are withheld.</p>}

      {r === 'demo' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Stat label="People" value={demo.total} /><Stat label="Members" value={demo.status.MEMBER || 0} /><Stat label="Visitors" value={demo.status.VISITOR || 0} /><Stat label="Regulars" value={demo.status.REGULAR || 0} /></div>
          <div className="grid md:grid-cols-2 gap-4">
            {([['Status', demo.status], ['Age bands', demo.age], ['Gender', demo.gender], ['Marital status', demo.marital]] as [string, Record<string, number>][]).map(([t, m]) => (
              <div key={t} className={`${card} p-5`}><h3 className={`${h2} mb-3`}>{t}</h3><Bars rows={Object.entries(m).map(([label, value]) => ({ label, value }))} /></div>
            ))}
          </div>
        </div>
      )}

      {r === 'growth' && <div className={`${card} p-5`}><h3 className={`${h2} mb-3`}>New records per month (last 12)</h3><Bars rows={growth.map(g => ({ label: g.month.slice(2), value: g.added }))} />
        <h3 className={`${h2} mt-5 mb-3`}>New members per month</h3><Bars rows={growth.map(g => ({ label: g.month.slice(2), value: g.members }))} /></div>}

      {r === 'roll' && (
        <div className={`${card} p-5`}><div className="flex justify-between mb-3"><h3 className={h2}>Membership roll ({live.filter(p => p.status === 'MEMBER').length})</h3><div className="flex gap-2">{exportBtn('membership-roll', () => membershipRollCSV(live))}<button className={btn} onClick={() => window.print()}><Printer size={12} /> Print</button></div></div>
          <div className="text-xs divide-y divide-white/5 max-h-[60vh] overflow-y-auto">{live.filter(p => p.status === 'MEMBER').map(p => <div key={p.id} className="py-1.5 flex gap-3"><span className="flex-1 text-white font-bold">{p.lastName}, {p.firstName}</span><span className="text-white/40">{fmtDate(p.memberSince)}</span></div>)}</div></div>
      )}

      {r === 'directory' && (
        <div className={`${card} p-5`}><div className="flex justify-between mb-1"><h3 className={h2}>Member directory ({printable.length})</h3><div className="flex gap-2">{exportBtn('directory', () => directoryCSV(live))}<button className={btn} onClick={() => { logOrgAction(org.id, 'CHMS_EXPORT', { meta: { what: 'directory-print' } }); window.print(); }}><Printer size={12} /> Print</button></div></div>
          <p className="text-[10px] text-white/40 mb-3">Only adult members/regulars who opted in ({live.filter(p => (p.status === 'MEMBER' || p.status === 'REGULAR')).length - printable.length} excluded by privacy or age).</p>
          {printable.length === 0 ? <Empty>No one has opted in to the directory yet. Invite people to claim their record and choose visibility.</Empty> : (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">{printable.map(p => <div key={p.id}><p className="font-black text-white">{p.lastName}, {p.firstName}</p><p className="text-white/50">{[p.phone, p.email].filter(Boolean).join(' · ')}</p><p className="text-white/40">{[p.address?.line1, p.address?.city].filter(Boolean).join(', ')}</p></div>)}</div>)}</div>
      )}

      {r === 'dates' && (
        <div className={`${card} p-5`}><div className="flex justify-between mb-3"><select value={month} onChange={e => setMonth(Number(e.target.value))} className={fieldSm}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          {exportBtn('birthdays-anniversaries', () => toCSV([['Date', 'Type', 'Name'], ...dates.map(x => [x.d, x.k, fullName(x.p)])]))}</div>
          <div className="text-xs divide-y divide-white/5">{dates.map((x, i) => <div key={i} className="py-1.5 flex gap-3"><span className="w-12 text-white/40">{x.d.slice(5)}</span><span className="flex-1 text-white font-bold">{fullName(x.p)}</span><span className="text-white/40">{x.k}</span></div>)}{!dates.length && <p className="text-white/30 py-2">None this month.</p>}</div></div>
      )}

      {(r === 'new' || r === 'status') && <div className="flex items-center gap-2 text-[10px] text-white/50 font-bold">Since <input type="date" value={since} onChange={e => setSince(e.target.value)} className={fieldSm} /></div>}
      {r === 'new' && (
        <div className={`${card} p-5`}><div className="flex justify-between mb-3"><h3 className={h2}>New members ({newMembers.length})</h3>{exportBtn('new-members', () => toCSV([['Name', 'Member since', 'Email', 'Phone'], ...newMembers.map(p => [fullName(p), p.memberSince, p.email, p.phone])]))}</div>
          <div className="text-xs divide-y divide-white/5">{newMembers.map(p => <div key={p.id} className="py-1.5 flex gap-3"><span className="flex-1 text-white font-bold">{fullName(p)}</span><span className="text-white/40">{fmtDate(p.memberSince)}</span></div>)}{!newMembers.length && <p className="text-white/30 py-2">No new members in this window.</p>}</div></div>
      )}
      {r === 'status' && (
        <div className={`${card} p-5`}><div className="flex justify-between mb-3"><h3 className={h2}>Status changes ({changes.length})</h3>{exportBtn('status-changes', () => toCSV([['Date', 'Name', 'New status', 'Note'], ...changes.map(c => [new Date(c.at).toISOString().slice(0, 10), fullName(c.person), c.status, c.note])]))}</div>
          <div className="text-xs divide-y divide-white/5">{changes.map((c, i) => <div key={i} className="py-1.5 flex gap-3 items-center"><span className="w-24 text-white/40">{new Date(c.at).toLocaleDateString()}</span><span className="flex-1 text-white font-bold">{fullName(c.person)}</span><StatusPill s={c.status} /></div>)}{!changes.length && <p className="text-white/30 py-2">No changes.</p>}</div></div>
      )}
    </div>
  );
};

export default PeopleReports;
