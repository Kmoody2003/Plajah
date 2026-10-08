// MyProfileCard — self-service card a linked congregant sees (mount anywhere: <MyProfileCard orgId uid />).
// Lets them update contact info + directory privacy (firestore.rules allow ONLY those fields), self check in,
// and confirm / decline / request a swap on their volunteer shifts. Also exports <ClaimRecordCard token /> to redeem an invite.
import React, { useEffect, useState } from 'react';
import { Loader2, Check, Link2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { ChmsPerson } from '../../../types';
import type { ChmsShift, ChmsClaim } from '../../../services/chmsPeople';
import { fetchMyPerson, updateMyContact, selfCheckIn, serviceKey, todayISO, respondToShift, redeemClaim, fetchClaim, fullName } from '../../../services/chmsPeople';
import { card, field, btn, btnPrimary, h2, label } from './PeopleUI';

export const MyProfileCard: React.FC<{ orgId: string; uid: string; eventKey?: string; eventLabel?: string; onLinked?: () => void }> = ({ orgId, uid, eventKey, eventLabel }) => {
  const [p, setP] = useState<ChmsPerson | null | undefined>(undefined);
  const [f, setF] = useState({ preferredName: '', email: '', phone: '', line1: '', city: '', region: '', postal: '', directoryVisible: false });
  const [shifts, setShifts] = useState<ChmsShift[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    fetchMyPerson(orgId, uid).then(me => {
      if (!live) return; setP(me);
      if (me) setF({ preferredName: me.preferredName || '', email: me.email || '', phone: me.phone || '', line1: me.address?.line1 || '', city: me.address?.city || '', region: me.address?.region || '', postal: me.address?.postal || '', directoryVisible: !!me.directoryVisible });
    }).catch(() => live && setP(null));
    getDocs(query(collection(db, 'chmsShifts'), where('orgId', '==', orgId), where('assignedUids', 'array-contains', uid)))
      .then(s => live && setShifts(s.docs.map(d => ({ ...d.data(), id: d.id } as ChmsShift)).filter(x => x.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date)))).catch(() => {});
    return () => { live = false; };
  }, [orgId, uid]);

  if (p === undefined) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-white/30" size={18} /></div>;
  if (!p) return null;   // not linked to a congregation record in this org

  const save = async () => {
    setBusy(true);
    try {
      await updateMyContact(p.id, { preferredName: f.preferredName || undefined, email: f.email || undefined, phone: f.phone || undefined, address: { line1: f.line1, city: f.city, region: f.region, postal: f.postal }, directoryVisible: f.directoryVisible });
      setNote('Saved.');
    } catch (e: any) { setNote(e?.message || 'Could not save.'); }
    setBusy(false);
  };
  const checkIn = async () => {
    if (!eventKey) return; setBusy(true);
    try { await selfCheckIn(orgId, { eventKey, eventLabel: eventLabel || 'Service', date: todayISO() }, p); setNote('You are checked in. Welcome!'); } catch { setNote('Could not check in — ask a greeter.'); }
    setBusy(false);
  };
  const respond = async (s: ChmsShift, patch: Parameters<typeof respondToShift>[2]) => { const n = await respondToShift(s, p.id, patch).catch(() => null); if (n) setShifts(list => list.map(x => x.id === s.id ? n : x)); };
  const inp = (k: keyof typeof f, ph: string) => <input value={String(f[k])} onChange={e => setF(v => ({ ...v, [k]: e.target.value }))} placeholder={ph} className={field} />;

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex items-center justify-between"><h3 className={h2}>My profile · {fullName(p)}</h3>{eventKey && <button className={btnPrimary} onClick={checkIn} disabled={busy}><Check size={13} /> Check me in</button>}</div>
      <div className="grid sm:grid-cols-2 gap-2">{inp('preferredName', 'Preferred name')}{inp('email', 'Email')}{inp('phone', 'Phone')}{inp('line1', 'Street')}{inp('city', 'City')}
        <div className="flex gap-2">{inp('region', 'State')}{inp('postal', 'Zip')}</div></div>
      <label className="flex items-start gap-2 text-xs text-white/70"><input type="checkbox" className="mt-0.5" checked={f.directoryVisible} onChange={e => setF(v => ({ ...v, directoryVisible: e.target.checked }))} />
        <span>Show my name and contact info in the member directory. Off by default; you can change this any time.</span></label>
      <div className="flex items-center gap-3"><button className={btn} onClick={save} disabled={busy}>Save</button>{note && <span className="text-[11px] font-bold text-emerald-300">{note}</span>}</div>
      {shifts.length > 0 && (
        <div className="border-t border-white/10 pt-3 space-y-2"><p className={label}>My volunteer schedule</p>
          {shifts.map(s => { const a = s.assignments.find(x => x.personId === p.id); if (!a) return null; return (
            <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="flex-1 min-w-[160px] text-white font-bold">{s.title} · {s.date}{s.time ? ` ${s.time}` : ''} <span className="text-white/40">({s.positions.find(x => x.id === a.positionId)?.name})</span></span>
              <span className="text-[9px] font-black uppercase text-white/40">{a.swapRequested ? 'swap requested' : a.status}</span>
              <button className={btn} onClick={() => respond(s, { status: 'CONFIRMED', swapRequested: false })}>Confirm</button>
              <button className={btn} onClick={() => { const n = prompt('Why do you need a swap? (optional)') ?? ''; respond(s, { swapRequested: true, swapNote: n || undefined }); }}>Request swap</button>
              <button className={btn} onClick={() => respond(s, { status: 'DECLINED' })}>Decline</button></div>); })}
        </div>
      )}
    </div>
  );
};

/** Shown when a signed-in user opens a claim link (?elevateClaim=TOKEN). */
export const ClaimRecordCard: React.FC<{ token: string; onDone?: (orgId: string) => void }> = ({ token, onDone }) => {
  const [claim, setClaim] = useState<ChmsClaim | null | undefined>(undefined);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { fetchClaim(token).then(setClaim); }, [token]);
  if (claim === undefined) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-white/30" size={18} /></div>;
  if (!claim || claim.usedBy || claim.expiresAt < Date.now()) return <div className={`${card} p-6 text-sm text-white/60`}>This claim link is invalid, used, or expired. Ask {claim?.orgName || 'your church'} for a new one.</div>;
  return (
    <div className={`${card} p-6 space-y-3 text-center`}>
      <Link2 className="mx-auto text-small-orange" size={22} />
      <p className="text-sm text-white">Link your Plajah account to your <b>{claim.orgName}</b> record for <b>{claim.personName}</b>?</p>
      <p className="text-[11px] text-white/40">You'll be able to update your contact info and choose whether you appear in the member directory.</p>
      <button className={btnPrimary} disabled={busy} onClick={async () => { setBusy(true); try { await redeemClaim(token); setMsg('Linked!'); onDone?.(claim.orgId); } catch (e: any) { setMsg(e?.message || 'Could not link.'); } setBusy(false); }}>Yes, this is me</button>
      {msg && <p className="text-xs font-bold text-emerald-300">{msg}</p>}
    </div>
  );
};

export default MyProfileCard;
