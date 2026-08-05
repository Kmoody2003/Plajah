import React, { useEffect, useState } from 'react';
import { Users, Clock, DollarSign, CalendarDays, Plus, Loader2, Check, X, Download, LogIn, LogOut, Trash2 } from 'lucide-react';
import type { StaffMember, Shift, TimeOffRequest } from '../types';
import {
  fetchStaff, addStaff, updateStaff, fetchShifts, clockInByPin, clockOutByPin,
  computePayroll, payrollCsv, fetchTimeOff, respondTimeOff, seedDemoTeam, type PayrollRow,
} from '../services/staffService';

/**
 * Team / HR for a business — roster, register PIN time-clock, timesheets → payroll export, and PTO
 * approvals. One data spine under businesses/{ownerUid}. Brand-consistent: dark, Plajah gradient.
 */
const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (n: number) => `$${(n || 0).toFixed(2)}`;
type Section = 'ROSTER' | 'CLOCK' | 'PAYROLL' | 'TIMEOFF';
const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'ROSTER', label: 'Roster', icon: Users }, { id: 'CLOCK', label: 'Time Clock', icon: Clock },
  { id: 'PAYROLL', label: 'Payroll', icon: DollarSign }, { id: 'TIMEOFF', label: 'Time Off', icon: CalendarDays },
];

const StaffHRManager: React.FC<{ businessUid: string; businessName: string }> = ({ businessUid, businessName }) => {
  const [section, setSection] = useState<Section>('ROSTER');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [pto, setPto] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'STAFF' as StaffMember['role'], payType: 'HOURLY' as StaffMember['payType'], payRate: 0, pin: '' });
  const [pin, setPin] = useState('');
  const [clockMsg, setClockMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [s, sh, p] = await Promise.all([fetchStaff(businessUid), fetchShifts(businessUid), fetchTimeOff(businessUid)]);
    setStaff(s); setShifts(sh); setPto(p); setLoading(false);
  };
  useEffect(() => { load(); }, [businessUid]);

  const openShiftIds = new Set(shifts.filter(s => !s.clockOut).map(s => s.staffId));

  const saveStaff = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await addStaff(businessUid, { name: form.name.trim(), role: form.role, payType: form.payType, payRate: Number(form.payRate) || 0, pin: form.pin.trim() || undefined, active: true });
      setForm({ name: '', role: 'STAFF', payType: 'HOURLY', payRate: 0, pin: '' }); setAdding(false); await load();
    } catch { /* */ } finally { setBusy(false); }
  };

  const doClock = async (dir: 'IN' | 'OUT') => {
    if (pin.length < 3 || busy) return;
    setBusy(true); setClockMsg('');
    try {
      const r = dir === 'IN' ? await clockInByPin(businessUid, pin) : await clockOutByPin(businessUid, pin);
      if (!r) setClockMsg(dir === 'IN' ? 'PIN not found or already clocked in.' : 'No open shift for that PIN.');
      else setClockMsg(dir === 'IN' ? `${(r as any).staffName} clocked in ✓` : `${(r as any).staffName} clocked out · ${(r as any).hours.toFixed(2)}h`);
      setPin(''); await load();
    } catch { setClockMsg('Something went wrong.'); } finally { setBusy(false); }
  };

  // Payroll: this pay period = last 14 days (demo default).
  const now = Date.now(); const periodStart = now - 14 * 86400000;
  const payroll: PayrollRow[] = computePayroll(staff, shifts, periodStart, now);
  const exportCsv = () => {
    const blob = new Blob([payrollCsv(payroll)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${businessName.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_payroll.csv`; a.click();
  };

  const respondPto = async (id: string, status: 'APPROVED' | 'DENIED') => {
    setBusy(true);
    try { await respondTimeOff(businessUid, id, status); setPto(ps => ps.map(x => x.id === id ? { ...x, status } : x)); }
    catch { /* */ } finally { setBusy(false); }
  };

  return (
    <div className="text-white">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-small-orange" />
        <h2 className="text-lg font-black uppercase tracking-tight">Team &amp; HR</h2>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar">
        {SECTIONS.map(s => {
          const Icon = s.icon; const on = section === s.id;
          return (
            <button key={s.id} onClick={() => setSection(s.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${on ? 'text-white' : 'bg-white/5 text-white/40 hover:text-white'}`} style={on ? { background: GRAD } : {}}>
              <Icon size={12} /> {s.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/40" /></div>
      ) : section === 'ROSTER' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setAdding(a => !a)} className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest" style={{ background: GRAD }}><Plus size={13} /> Add employee</button>
          </div>
          {adding && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2.5">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none">
                  {['STAFF', 'MANAGER', 'OWNER'].map(r => <option key={r} value={r} className="bg-black">{r}</option>)}
                </select>
                <select value={form.payType} onChange={e => setForm(f => ({ ...f, payType: e.target.value as any }))} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none">
                  {['HOURLY', 'SALARY'].map(r => <option key={r} value={r} className="bg-black">{r}</option>)}
                </select>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Rate ($/hr)<input type="number" value={form.payRate} onChange={e => setForm(f => ({ ...f, payRate: parseFloat(e.target.value) || 0 }))} className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" /></label>
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Register PIN<input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="4-digit" className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none tracking-[0.4em]" /></label>
              </div>
              <button onClick={saveStaff} disabled={busy || !form.name.trim()} className="w-full py-2.5 rounded-xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Add to roster</button>
            </div>
          )}
          {staff.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-white/30 text-sm">No employees yet.</p>
              <button onClick={async () => { setBusy(true); await seedDemoTeam(businessUid).catch(() => {}); await load(); setBusy(false); }} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Seed demo team
              </button>
            </div>
          ) : staff.map(m => (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black shrink-0" style={{ background: GRAD }}>{m.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black truncate">{m.name} {openShiftIds.has(m.id) && <span className="text-[8px] font-black uppercase tracking-widest text-green-400">· on the clock</span>}</p>
                <p className="text-[10px] text-white/40">{m.role} · {m.payType === 'HOURLY' ? `${money(m.payRate || 0)}/hr` : 'Salary'}{m.pin ? ` · PIN ${m.pin}` : ''}</p>
              </div>
              <button onClick={async () => { await updateStaff(businessUid, m.id, { active: !m.active }); setStaff(s => s.map(x => x.id === m.id ? { ...x, active: !x.active } : x)); }} className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.active ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/40'}`}>{m.active ? 'Active' : 'Inactive'}</button>
            </div>
          ))}
        </div>
      ) : section === 'CLOCK' ? (
        <div className="max-w-xs mx-auto text-center space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Enter your PIN to clock in / out</p>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" inputMode="numeric" className="w-full text-center text-3xl font-black tracking-[0.5em] bg-white/5 border border-white/10 rounded-2xl py-4 outline-none" />
          <div className="flex gap-2">
            <button onClick={() => doClock('IN')} disabled={busy} className="flex-1 py-3 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: GRAD }}><LogIn size={14} /> Clock in</button>
            <button onClick={() => doClock('OUT')} disabled={busy} className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"><LogOut size={14} /> Clock out</button>
          </div>
          {clockMsg && <p className="text-[12px] text-white/70">{clockMsg}</p>}
          {openShiftIds.size > 0 && <p className="text-[10px] text-white/40 pt-2">On the clock: {shifts.filter(s => !s.clockOut).map(s => s.staffName).join(', ')}</p>}
        </div>
      ) : section === 'PAYROLL' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Last 14 days · estimate</p>
            <button onClick={exportCsv} disabled={!payroll.length} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest disabled:opacity-40"><Download size={13} /> Export CSV</button>
          </div>
          {payroll.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No completed shifts this period.</p> : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-white/[0.06] text-[8px] font-black uppercase tracking-widest text-white/40"><span>Employee</span><span className="text-right">Hours</span><span className="text-right">Rate</span><span className="text-right">Gross</span></div>
              {payroll.map(r => (
                <div key={r.staffId} className="grid grid-cols-4 gap-2 px-3 py-2.5 border-t border-white/5 text-sm"><span className="truncate">{r.name}</span><span className="text-right tabular-nums">{r.hours}</span><span className="text-right tabular-nums text-white/50">{money(r.rate)}</span><span className="text-right tabular-nums font-black">{money(r.gross)}</span></div>
              ))}
            </div>
          )}
          <p className="text-[9px] text-white/30">Export imports into Gusto / QuickBooks / ADP / Paychex. Live payroll-provider sync is a fast-follow.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pto.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No time-off requests.</p> : pto.map(req => (
            <div key={req.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between"><p className="text-sm font-black">{req.staffName}</p><span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${req.status === 'APPROVED' ? 'bg-green-500/20 text-green-300' : req.status === 'DENIED' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/50'}`}>{req.status}</span></div>
              <p className="text-[10px] text-white/40">{req.kind} · {new Date(req.startDate).toLocaleDateString()}–{new Date(req.endDate).toLocaleDateString()}{req.hours ? ` · ${req.hours}h` : ''}</p>
              {req.reason && <p className="text-[11px] text-white/50 mt-1 italic">“{req.reason}”</p>}
              {req.status === 'PENDING' && (
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => respondPto(req.id, 'APPROVED')} disabled={busy} className="flex-1 py-2 rounded-xl bg-green-500/20 text-green-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"><Check size={12} /> Approve</button>
                  <button onClick={() => respondPto(req.id, 'DENIED')} disabled={busy} className="flex-1 py-2 rounded-xl bg-white/8 text-white/60 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"><X size={12} /> Deny</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StaffHRManager;
