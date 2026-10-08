// Per-person profile: contact/dates, status workflow + history, family, ministries, attendance, engagement,
// pastoral notes (tiered), and Plajah-account claim invite. Minors are staff-only (redacted upstream).
import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Link2, Mail, Archive, Save, Lock } from 'lucide-react';
import type { ChmsPerson, ChmsNote, ChmsMemberStatus } from '../../../types';
import {
  savePerson, changeStatus, archivePerson, moveToHousehold, saveHousehold, fullName, ageOf, isMinor, engagementScore,
  fetchNotes, addNote, auditSensitive, createClaim, claimUrl, todayISO,
} from '../../../services/chmsPeople';
import { auth } from '../../../services/firebase';
import { usePeople, Modal, field, btn, btnPrimary, h2, label, StatusPill, STATUSES, fmtDate } from './PeopleUI';

const Row: React.FC<{ l: string; children: React.ReactNode }> = ({ l, children }) => (<div><p className={`${label} mb-1`}>{l}</p>{children}</div>);
const csvIn = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

const PeopleProfile: React.FC<{ personId: string | null; onClose: () => void; onSaved: () => void; draftKey?: string }> = ({ personId, onClose, onSaved }) => {
  const { org, people, households, attendance, shifts, access, gaveFlags, myMembership, reload } = usePeople();
  const existing = people.find(p => p.id === personId) || null;
  const canEdit = access.staff;
  const [f, setF] = useState<Partial<ChmsPerson>>(existing || { firstName: '', lastName: '', status: 'VISITOR' });
  const [tags, setTags] = useState((existing?.tags || []).join(', '));
  const [skills, setSkills] = useState((existing?.skills || []).join(', '));
  const [avail, setAvail] = useState(existing?.custom?.availability || '');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<ChmsNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteVis, setNoteVis] = useState<'STAFF' | 'PASTORAL'>('STAFF');
  const [noteKind, setNoteKind] = useState<ChmsNote['kind']>('CARE');
  const [claim, setClaim] = useState<{ url: string; qr: string } | null>(null);
  const showNotes = !!existing && (access.staff || access.pastoral) && !access.financeOnly;
  const set = <K extends keyof ChmsPerson>(k: K, v: ChmsPerson[K] | undefined) => setF(p => ({ ...p, [k]: v }));
  const setAddr = (k: string, v: string) => setF(p => ({ ...p, address: { ...(p.address || {}), [k]: v } }));

  useEffect(() => {
    if (!existing) return;
    if (isMinor(existing)) auditSensitive(org.id, 'minor-profile', existing);
    if (showNotes) { auditSensitive(org.id, 'notes-viewed', existing); fetchNotes(org.id, existing.id, access.pastoral).then(setNotes).catch(() => {}); }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const eng = useMemo(() => existing ? engagementScore(existing, attendance, {
    gave: gaveFlags ? gaveFlags.has(existing.id) : null,
    servedRecently: shifts.some(s => s.assignments.some(a => a.personId === existing.id && a.status === 'CONFIRMED')),
  }) : null, [existing, attendance, gaveFlags, shifts]);
  const myAtt = existing ? attendance.filter(a => a.personId === existing.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const family = existing?.householdId ? people.filter(p => p.householdId === existing.householdId && p.id !== existing.id) : [];

  const save = async () => {
    if (!f.firstName?.trim() || !f.lastName?.trim()) { alert('First and last name are required.'); return; }
    setBusy(true);
    try {
      const custom = { ...(f.custom || {}) }; if (avail.trim()) custom.availability = avail.trim(); else delete custom.availability;
      const saved = await savePerson(org.id, { ...f, firstName: f.firstName.trim(), lastName: f.lastName.trim(), tags: csvIn(tags), skills: csvIn(skills), custom } as any);
      if (f.householdId && f.householdId !== existing?.householdId) await moveToHousehold(saved, f.householdId, f.householdRole);
      await reload(); onSaved(); onClose();
    } catch (e: any) { alert(e?.message || 'Could not save.'); }
    setBusy(false);
  };
  const setStatus = async (s: ChmsMemberStatus) => {
    if (!existing || s === existing.status) return;
    const note = s === 'DECEASED' || s === 'TRANSFERRED' ? (prompt('Optional note for the status history:') || undefined) : undefined;
    await changeStatus(existing, s, note); await reload(); setF(p => ({ ...p, status: s }));
  };
  const makeClaim = async () => {
    if (!existing) return;
    setBusy(true);
    try { const c = await createClaim(org, existing); const url = claimUrl(c.id); setClaim({ url, qr: await QRCode.toDataURL(url, { width: 360, margin: 2 }).catch(() => '') }); }
    catch (e: any) { alert(e?.message || 'Could not create the link.'); }
    setBusy(false);
  };
  const postNote = async () => {
    if (!existing || !noteText.trim()) return;
    const name = myMembership?.displayName || auth.currentUser?.displayName || 'Staff';
    await addNote(org.id, existing.id, noteText.trim(), noteKind, noteVis, name);
    setNoteText(''); setNotes(await fetchNotes(org.id, existing.id, access.pastoral));
  };
  const makeHousehold = async () => {
    if (!existing) return;
    const h = await saveHousehold(org.id, { name: `${existing.lastName} Household`, headPersonId: existing.id, address: existing.address });
    await moveToHousehold(existing, h.id, 'HEAD'); await reload(); set('householdId', h.id); set('householdRole', 'HEAD');
  };

  const minor = existing ? isMinor(existing) : false;
  return (
    <Modal title={existing ? fullName(existing) : 'Add person'} onClose={onClose} wide>
      {minor && <p className="mb-3 text-[10px] font-bold text-amber-300 flex items-center gap-1.5"><Lock size={11} /> Minor — record visible to staff with roster access only; access is audited.</p>}
      <div className="grid sm:grid-cols-3 gap-3">
        <Row l="First name"><input disabled={!canEdit} value={f.firstName || ''} onChange={e => set('firstName', e.target.value)} className={field} /></Row>
        <Row l="Last name"><input disabled={!canEdit} value={f.lastName || ''} onChange={e => set('lastName', e.target.value)} className={field} /></Row>
        <Row l="Preferred name"><input disabled={!canEdit} value={f.preferredName || ''} onChange={e => set('preferredName', e.target.value)} className={field} /></Row>
        <Row l="Email"><input disabled={!canEdit} value={f.email || ''} onChange={e => set('email', e.target.value)} className={field} /></Row>
        <Row l="Phone"><input disabled={!canEdit} value={f.phone || ''} onChange={e => set('phone', e.target.value)} className={field} /></Row>
        <Row l="Gender"><input disabled={!canEdit} value={f.gender || ''} onChange={e => set('gender', e.target.value)} className={field} /></Row>
        <Row l="Birth date"><input type="date" disabled={!canEdit} value={f.birthDate || ''} onChange={e => set('birthDate', e.target.value)} className={field} /></Row>
        <Row l="Anniversary"><input type="date" disabled={!canEdit} value={f.anniversary || ''} onChange={e => set('anniversary', e.target.value)} className={field} /></Row>
        <Row l="Marital status"><input disabled={!canEdit} value={f.maritalStatus || ''} onChange={e => set('maritalStatus', e.target.value)} className={field} /></Row>
        <Row l="Baptism date"><input type="date" disabled={!canEdit} value={f.baptismDate || ''} onChange={e => set('baptismDate', e.target.value)} className={field} /></Row>
        <Row l="Member since"><input type="date" disabled={!canEdit} value={f.memberSince || ''} onChange={e => set('memberSince', e.target.value)} className={field} /></Row>
        {!existing && <Row l="Status"><select value={f.status} onChange={e => set('status', e.target.value as ChmsMemberStatus)} className={field}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Row>}
      </div>
      <div className="grid sm:grid-cols-4 gap-3 mt-3">
        <div className="sm:col-span-2"><Row l="Street"><input disabled={!canEdit} value={f.address?.line1 || ''} onChange={e => setAddr('line1', e.target.value)} className={field} /></Row></div>
        <Row l="City"><input disabled={!canEdit} value={f.address?.city || ''} onChange={e => setAddr('city', e.target.value)} className={field} /></Row>
        <div className="grid grid-cols-2 gap-2"><Row l="State"><input disabled={!canEdit} value={f.address?.region || ''} onChange={e => setAddr('region', e.target.value)} className={field} /></Row>
          <Row l="Zip"><input disabled={!canEdit} value={f.address?.postal || ''} onChange={e => setAddr('postal', e.target.value)} className={field} /></Row></div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-3">
        <Row l="Tags (comma)"><input disabled={!canEdit} value={tags} onChange={e => setTags(e.target.value)} className={field} placeholder="first-time-giver, choir…" /></Row>
        <Row l="Skills / spiritual gifts"><input disabled={!canEdit} value={skills} onChange={e => setSkills(e.target.value)} className={field} placeholder="audio, teaching, hospitality" /></Row>
        <Row l="Volunteer availability"><input disabled={!canEdit} value={avail} onChange={e => setAvail(e.target.value)} className={field} placeholder="Sun, Wed" /></Row>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-3">
        <Row l="Household">
          <select disabled={!canEdit} value={f.householdId || ''} onChange={e => set('householdId', e.target.value || undefined)} className={field}>
            <option value="">— none —</option>{households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Row>
        <Row l="Household role">
          <select disabled={!canEdit} value={f.householdRole || ''} onChange={e => set('householdRole', (e.target.value || undefined) as any)} className={field}>
            <option value="">—</option><option>HEAD</option><option>SPOUSE</option><option>CHILD</option><option>OTHER</option>
          </select>
        </Row>
        <Row l="Directory privacy">
          <label className="flex items-center gap-2 text-xs text-white/70 py-3"><input type="checkbox" disabled={!canEdit} checked={!!f.directoryVisible} onChange={e => set('directoryVisible', e.target.checked)} /> Opted in to the member directory</label>
        </Row>
      </div>
      {existing && !existing.householdId && canEdit && <button className={`${btn} mt-2`} onClick={makeHousehold}>Create household from this person</button>}

      {canEdit && (
        <div className="flex gap-2 mt-5">
          <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
          {existing && <button className={btn} onClick={async () => { if (confirm(existing.archived ? 'Restore?' : 'Archive this person?')) { await archivePerson(existing.id, !existing.archived); await reload(); onClose(); } }}><Archive size={13} /> Archive</button>}
        </div>
      )}

      {existing && (
        <div className="mt-6 space-y-5">
          <div>
            <h4 className={`${h2} mb-2`}>Status workflow</h4>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {STATUSES.map(s => <button key={s} disabled={!canEdit} onClick={() => setStatus(s)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${existing.status === s ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>{s}</button>)}
            </div>
            <div className="text-[10px] text-white/40 space-y-0.5">
              {(existing.statusHistory || []).slice().reverse().map((h, i) => <p key={i}><StatusPill s={h.status} /> {new Date(h.at).toLocaleDateString()}{h.note ? ` — ${h.note}` : ''}</p>)}
            </div>
          </div>

          {eng && (
            <div>
              <h4 className={`${h2} mb-2`}>Engagement</h4>
              <p className="text-xs text-white/70"><span className="text-xl font-black text-white">{eng.score}</span> / 100 · <span className={eng.band === 'DRIFTING' || eng.band === 'DORMANT' ? 'text-amber-300 font-bold' : 'text-emerald-300 font-bold'}>{eng.band}</span> — {eng.reasons.join(' · ')}</p>
              <p className="text-[9px] text-white/30 mt-1">Giving counts only as a yes/no flag; amounts are never shown here.</p>
            </div>
          )}

          {family.length > 0 && (
            <div><h4 className={`${h2} mb-2`}>Family</h4>
              <div className="flex flex-wrap gap-2">{family.map(m => <span key={m.id} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">{fullName(m)} <span className="text-white/30">{m.householdRole || ''}{ageOf(m) !== null ? ` · ${ageOf(m)}` : ''}</span></span>)}</div></div>
          )}

          <div>
            <h4 className={`${h2} mb-2`}>Attendance history ({myAtt.length})</h4>
            <div className="max-h-32 overflow-y-auto text-[11px] text-white/50 space-y-0.5">{myAtt.slice(0, 40).map(a => <p key={a.id}>{fmtDate(a.date)} — {a.eventLabel}</p>)}{!myAtt.length && <p>No attendance recorded.</p>}</div>
          </div>

          {canEdit && !minor && (
            <div>
              <h4 className={`${h2} mb-2`}>Plajah account</h4>
              {existing.linkedUid ? <p className="text-xs text-emerald-300 font-bold">Linked — this person can update their own contact info and directory privacy.</p> : (
                <>
                  <button className={btn} disabled={busy} onClick={makeClaim}><Link2 size={13} /> Invite to claim this record</button>
                  {claim && (
                    <div className="mt-3 flex flex-wrap gap-4 items-center">
                      {claim.qr && <img src={claim.qr} alt="Claim QR" className="w-28 h-28 rounded-xl bg-white p-1" />}
                      <div className="text-[11px] text-white/60 space-y-2 min-w-0">
                        <p className="break-all select-all">{claim.url}</p>
                        <div className="flex gap-2"><button className={btn} onClick={() => navigator.clipboard?.writeText(claim.url)}>Copy link</button>
                          {existing.email && <a className={btn} href={`mailto:${existing.email}?subject=${encodeURIComponent(`Claim your ${org.name} profile`)}&body=${encodeURIComponent(`Link your Plajah account to your ${org.name} member record:\n${claim.url}`)}`}><Mail size={12} /> Email it</a>}</div>
                        <p className="text-white/30">Single use, expires in 30 days.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {showNotes && (
            <div>
              <h4 className={`${h2} mb-2 flex items-center gap-1.5`}><Lock size={11} /> Care notes</h4>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {notes.map(n => (
                  <div key={n.id} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                    <p className="text-white/80 whitespace-pre-wrap">{n.text}</p>
                    <p className="text-[9px] text-white/30 mt-1">{n.kind} · {n.visibility === 'PASTORAL' ? 'Pastoral only' : 'Staff'} · {n.authorName} · {new Date(n.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
                {!notes.length && <p className="text-[11px] text-white/30">No notes.</p>}
              </div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} className={field} placeholder="Add a care note…" />
              <div className="flex flex-wrap gap-2 mt-2">
                <select value={noteKind} onChange={e => setNoteKind(e.target.value as any)} className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"><option>CARE</option><option>VISIT</option><option>COUNSEL</option><option>GENERAL</option></select>
                <select value={noteVis} onChange={e => setNoteVis(e.target.value as any)} className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"><option value="STAFF">Visible to staff</option>{access.pastoral && <option value="PASTORAL">Pastoral only</option>}</select>
                <button className={btnPrimary} onClick={postNote} disabled={!noteText.trim()}>Add note</button>
              </div>
            </div>
          )}
          <p className="text-[9px] text-white/25">Record created {new Date(existing.createdAt).toLocaleDateString()}{existing.source ? ` · imported from ${existing.source.system}` : ''} · today {todayISO()}</p>
        </div>
      )}
    </Modal>
  );
};

export default PeopleProfile;
