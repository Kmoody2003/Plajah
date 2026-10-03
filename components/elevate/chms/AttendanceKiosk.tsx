// Check-in Kiosk — large-touch, name search, family check-in, child security code matching pickup tag,
// badge-ready print view (window.print; @media print shows only the badge sheet).
import React, { useMemo, useState } from 'react';
import { Search, Check, Printer, UserPlus, Users, Maximize2 } from 'lucide-react';
import type { ChmsPerson } from '../../../types';
import { fullName, isMinor, newSecurityCode, recordAttendance, savePerson, ageOf } from '../../../services/chmsPeople';
import { usePeople, card, field, btnPrimary, btn, label } from './PeopleUI';
import { useEventPicker } from './Attendance';

interface Badge { id: string; name: string; child: boolean; code: string; allergy?: string; event: string; parents: string }

const AttendanceKiosk: React.FC = () => {
  const { org, people, households, access, patchAttendance, reload } = usePeople();
  const { ev, picker } = useEventPicker();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<Badge[] | null>(null);
  const [guest, setGuest] = useState<{ name: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase(); if (n.length < 2) return [];
    return people.filter(p => (p.status !== 'DECEASED' && p.status !== 'TRANSFERRED') && `${p.firstName} ${p.lastName} ${p.preferredName || ''}`.toLowerCase().includes(n)).slice(0, 12);
  }, [people, q]);
  // Expand a hit into its family so one tap checks in everybody.
  const family = (p: ChmsPerson) => p.householdId ? people.filter(x => x.householdId === p.householdId && x.status !== 'DECEASED') : [p];
  const hhName = (p: ChmsPerson) => households.find(h => h.id === p.householdId)?.name || `${p.lastName} family`;

  const pickFamily = (p: ChmsPerson) => { setPicked(new Set(family(p).map(x => x.id))); setQ(''); };
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = people.filter(p => picked.has(p.id));

  const checkIn = async () => {
    if (!ev || !chosen.length) return;
    setBusy(true);
    try {
      const codeByHousehold = new Map<string, string>(); const out: Badge[] = [];
      const parents = chosen.filter(p => !isMinor(p)).map(p => p.firstName).join(' & ');
      for (const p of chosen) {
        const child = isMinor(p);
        const key = p.householdId || p.id;
        if (!codeByHousehold.has(key)) codeByHousehold.set(key, newSecurityCode());   // one code per family per visit
        const code = codeByHousehold.get(key)!;
        const rec = await recordAttendance(org.id, ev, { personId: p.id, householdId: p.householdId, securityCode: child ? code : undefined });
        patchAttendance(a => [...a.filter(x => x.id !== rec.id), rec]);
        out.push({ id: p.id, name: fullName(p), child, code, allergy: p.custom?.allergies || p.custom?.Allergies, event: ev.eventLabel, parents: parents || hhName(p) });
      }
      setBadges(out); setPicked(new Set());
    } catch (e: any) { alert(e?.message || 'Check-in failed.'); }
    setBusy(false);
  };
  const addGuest = async () => {
    if (!guest?.name.trim() || !ev) return;
    const [first, ...rest] = guest.name.trim().split(/\s+/);
    const p = await savePerson(org.id, { firstName: first, lastName: rest.join(' ') || '(guest)', phone: guest.phone || undefined, status: 'VISITOR' });
    const rec = await recordAttendance(org.id, ev, { personId: p.id, visitor: { phone: guest.phone || undefined } });
    patchAttendance(a => [...a, rec]); setGuest(null); await reload();
    setBadges([{ id: p.id, name: fullName(p), child: false, code: '', event: ev.eventLabel, parents: '' }]);
  };
  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  if (!access.staff) return <div className={`${card} p-8 text-center text-xs text-white/40`}>The kiosk requires roster access.</div>;

  return (
    <div className="space-y-5">
      <style>{`@media print{body *{visibility:hidden!important}.kiosk-print,.kiosk-print *{visibility:visible!important}.kiosk-print{position:absolute;left:0;top:0;width:100%;background:#fff;color:#000}.kiosk-badge{page-break-inside:avoid;border:2px solid #000;margin:8px;padding:12px;width:3.5in;display:inline-block;vertical-align:top}}`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">{picker}<button className={btn} onClick={fullscreen}><Maximize2 size={13} /> Full screen</button></div>

      {!ev ? <div className={`${card} p-8 text-center text-xs text-white/40`}>Pick an event above.</div> : badges ? (
        <div className="space-y-4">
          <div className="kiosk-print">
            {badges.map(b => (
              <div key={b.id} className="kiosk-badge">
                <p style={{ fontSize: 22, fontWeight: 900 }}>{b.name}</p>
                <p style={{ fontSize: 11 }}>{b.event}</p>
                {b.child && <><p style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6, margin: '6px 0' }}>{b.code}</p><p style={{ fontSize: 10 }}>Pickup code — match the parent tag · Guardians: {b.parents}</p>{b.allergy && <p style={{ fontSize: 11, fontWeight: 900, color: '#b00' }}>ALLERGY: {b.allergy}</p>}</>}
              </div>
            ))}
            {badges.some(b => b.child) && (
              <div className="kiosk-badge" style={{ borderStyle: 'dashed' }}>
                <p style={{ fontSize: 11, fontWeight: 900 }}>PARENT PICKUP TAG</p>
                <p style={{ fontSize: 34, fontWeight: 900, letterSpacing: 6 }}>{badges.find(b => b.child)!.code}</p>
                <p style={{ fontSize: 10 }}>{badges.filter(b => b.child).map(b => b.name).join(', ')}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button className={btnPrimary} onClick={() => window.print()}><Printer size={14} /> Print badges</button>
            <button className={btn} onClick={() => setBadges(null)}>Next family</button>
          </div>
          <p className="text-center text-xs text-emerald-300 font-bold">Checked in. Security code shown above must match the parent tag at pickup.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative"><Search size={22} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type your name…" className={`${field} !text-2xl !py-6 !pl-14`} /></div>
          {matches.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {matches.map(p => (
                <button key={p.id} onClick={() => pickFamily(p)} className={`${card} p-5 text-left hover:bg-white/[0.07]`}>
                  <p className="text-xl font-black text-white">{fullName(p)}</p>
                  <p className="text-[11px] text-white/40 flex items-center gap-1.5 mt-1"><Users size={12} /> {family(p).length > 1 ? `${hhName(p)} · ${family(p).length} people` : 'Individual'}</p>
                </button>
              ))}
            </div>
          )}
          {chosen.length > 0 && (
            <div className={`${card} p-5 space-y-3`}>
              <p className={label}>Who is checking in?</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {chosen.length > 0 && family(chosen[0]).map(p => {
                  const on = picked.has(p.id);
                  return <button key={p.id} onClick={() => toggle(p.id)} className={`flex items-center gap-3 px-5 py-4 rounded-2xl text-lg font-black border ${on ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200' : 'bg-white/5 border-white/10 text-white/60'}`}>
                    <span className={`w-6 h-6 rounded-md border flex items-center justify-center ${on ? 'bg-emerald-400 border-emerald-400' : 'border-white/30'}`}>{on && <Check size={16} className="text-black" />}</span>
                    {p.preferredName || p.firstName}{isMinor(p) && <span className="text-[10px] uppercase text-white/40">child · {ageOf(p) ?? ''}</span>}
                  </button>;
                })}
              </div>
              <button className={`${btnPrimary} !text-sm !py-4 w-full`} disabled={busy || !chosen.length} onClick={checkIn}>Check in {chosen.length}</button>
            </div>
          )}
          <div className="text-center">
            {guest ? (
              <div className={`${card} p-5 grid sm:grid-cols-3 gap-2`}>
                <input value={guest.name} onChange={e => setGuest({ ...guest, name: e.target.value })} placeholder="Your name" className={field} />
                <input value={guest.phone} onChange={e => setGuest({ ...guest, phone: e.target.value })} placeholder="Phone (optional)" className={field} />
                <button className={btnPrimary} onClick={addGuest} disabled={!guest.name.trim()}>Check in as guest</button>
              </div>
            ) : <button className={btn} onClick={() => setGuest({ name: '', phone: '' })}><UserPlus size={13} /> First time here?</button>}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceKiosk;
