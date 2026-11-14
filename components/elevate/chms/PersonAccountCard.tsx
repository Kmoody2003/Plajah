// PersonAccountCard — the "Plajah account" block on a congregation record.
//   • Claimed   → linked uid, member ID, nothing to do.
//   • Provisioned → member ID + claim link / QR to hand over; staff can re-point role / departments.
//   • Nothing yet → "Pre-provision an account" (role + departments) or "Link an existing Plajah user" (search).
// Everything goes through services/elevateAccounts; the member claims on the server.
import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Link2, Loader2, Mail, Search, UserPlus, QrCode } from 'lucide-react';
import type { ChmsPerson, Organization, OrgMembership, UserProfile } from '../../../types';
import { ELEVATE_ROLES, canAssignRole, getElevateRole } from '../../../services/elevateRoles';
import { provisionAccount, linkPersonToUser, claimUrl, updateProvisionedSeat, importRoleToKey, canProvision, sendClaimInvites, describeInviteResult, inviteStatusLabel, claimInvitesConfigured } from '../../../services/elevateAccounts';
import { searchUserProfiles } from '../../../services/backendService';
import { btn, btnPrimary, field, label } from './PeopleUI';

interface Props {
  org: Organization;
  myMembership: OrgMembership | null;
  person: ChmsPerson;
  members: OrgMembership[];
  onChanged: () => Promise<void> | void;
}

const PersonAccountCard: React.FC<Props> = ({ org, myMembership, person, members, onChanged }) => {
  const seat = useMemo(() => members.find(m => m.provisionedPersonId === person.id || (person.provisionedUid && m.userId === person.provisionedUid)), [members, person]);
  const linkedMember = useMemo(() => person.linkedUid ? members.find(m => m.userId === person.linkedUid) : undefined, [members, person.linkedUid]);
  const roles = useMemo(() => ELEVATE_ROLES.filter(r => canAssignRole(myMembership, org, r.key)), [myMembership, org]);
  const allowed = canProvision(org, myMembership);
  const guessRole = importRoleToKey(person.custom?.Role || person.custom?.role);
  const [roleKey, setRoleKey] = useState(roles.some(r => r.key === guessRole) ? guessRole : (roles.some(r => r.key === 'MEMBER') ? 'MEMBER' : roles[0]?.key || 'MEMBER'));
  const [deptIds, setDeptIds] = useState<string[]>(person.ministryIds || []);
  const [mode, setMode] = useState<'idle' | 'provision' | 'link'>('idle');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [mailReady, setMailReady] = useState<boolean | null>(null);
  useEffect(() => { if (seat && allowed) claimInvitesConfigured().then(setMailReady); }, [seat, allowed]);

  const link = useMemo(() => claimUrl(org, person.memberNumber || seat?.memberNumber), [org, person.memberNumber, seat?.memberNumber]);
  useEffect(() => { if (seat) QRCode.toDataURL(link, { width: 360, margin: 2 }).then(setQr).catch(() => setQr('')); }, [seat, link]);
  useEffect(() => {
    if (mode !== 'link' || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { searchUserProfiles(q.trim(), 8, { excludeRestricted: true }).then(r => setResults(r || [])).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg('');
    try { await fn(); await onChanged(); setMsg(ok); setMode('idle'); } catch (e: any) { setMsg(e?.message || 'Something went wrong.'); }
    setBusy(false);
  };
  const sendInvite = async () => {
    if (!seat) return;
    setBusy(true); setMsg('');
    try { const r = await sendClaimInvites(org.id, { seatIds: [seat.id] }); await onChanged(); setMsg(r.sent ? `Invitation sent to ${seat.claimEmailLower || person.email}.` : describeInviteResult(r)); }
    catch (e: any) { setMsg(e?.message || 'Could not send the invitation.'); }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ } };
  const toggleDept = (id: string) => setDeptIds(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);

  const DeptPicker = () => (org.ministries || []).length ? (
    <div className="flex flex-wrap gap-1.5">
      {(org.ministries || []).map(m => (
        <button key={m.id} type="button" onClick={() => toggleDept(m.id)} className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${deptIds.includes(m.id) ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{m.iconEmoji} {m.name}</button>
      ))}
    </div>
  ) : null;

  // ── Claimed ──
  if (person.linkedUid) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-emerald-300 font-bold flex items-center gap-1.5"><Check size={13} /> Claimed — this person signs in to Plajah as {linkedMember?.displayName || 'themselves'}{linkedMember?.title ? ` · ${linkedMember.title}` : ''}.</p>
        {person.memberNumber && <p className="text-[11px] text-white/50">Member ID <span className="font-mono text-white/80 select-all">{person.memberNumber}</span></p>}
        <p className="text-[11px] text-white/35">They can update their own contact info, directory privacy, and see their department feeds and chat rooms.</p>
      </div>
    );
  }

  // ── Provisioned, waiting to be claimed ──
  if (seat) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-sky-300 font-bold flex items-center gap-1.5"><UserPlus size={13} /> Account ready to claim · {seat.title || getElevateRole(seat.roleKey)?.label}</p>
        <div className="flex flex-wrap gap-4 items-start">
          {qr && <img src={qr} alt="Claim QR" className="w-28 h-28 rounded-xl bg-white p-1 shrink-0" />}
          <div className="text-[11px] text-white/60 space-y-2 min-w-0 flex-1">
            <p>Member ID <span className="font-mono text-base text-white select-all">{seat.memberNumber || person.memberNumber}</span></p>
            <p className="text-white/40">They claim it with this member ID + last name{person.email ? `, or by signing in with ${person.email}` : ''}. Share the link, the QR, or the organization's join link.</p>
            <p className="break-all select-all text-white/40">{link}</p>
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy claim link'}</button>
              {person.email && allowed && mailReady && (
                <button className={btnPrimary} disabled={busy || seat.claimInviteStatus === 'OPTED_OUT'} onClick={sendInvite}>
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} {seat.claimInviteStatus ? 'Resend invite' : 'Send invite email'}
                </button>
              )}
              {person.email && mailReady === false && <a className={btn} href={`mailto:${person.email}?subject=${encodeURIComponent(`Your ${org.name} account on Plajah is ready`)}&body=${encodeURIComponent(`Hi ${person.preferredName || person.firstName},\n\n${org.name} has set up your Plajah account. Claim it here:\n${link}\n\nYour member ID is ${seat.memberNumber || person.memberNumber}.`)}`}><Mail size={12} /> Email it from my mail app</a>}
            </div>
            {inviteStatusLabel(seat) && <p className={seat.claimInviteStatus === 'BOUNCED' || seat.claimInviteStatus === 'FAILED' ? 'text-amber-300' : 'text-white/40'}>{inviteStatusLabel(seat)}</p>}
          </div>
        </div>
        {allowed && (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-white/40 hover:text-white">Change the seat's role or departments</summary>
            <div className="mt-2 space-y-2">
              <select className={field} value={roleKey} onChange={e => setRoleKey(e.target.value)}>{roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
              <DeptPicker />
              <button className={btnPrimary} disabled={busy} onClick={() => run(() => updateProvisionedSeat(org, seat, { roleKey, ministryIds: deptIds }), 'Seat updated.')}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save seat</button>
            </div>
          </details>
        )}
        {msg && <p className="text-[11px] text-white/60">{msg}</p>}
      </div>
    );
  }

  // ── Nothing yet ──
  if (!allowed) return <p className="text-[11px] text-white/35">No Plajah account yet.</p>;
  return (
    <div className="space-y-3">
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={() => setMode('provision')}><UserPlus size={13} /> Pre-provision a Plajah account</button>
          <button className={btn} onClick={() => setMode('link')}><Link2 size={13} /> Link an existing Plajah user</button>
        </div>
      )}
      {mode === 'provision' && (
        <div className="space-y-2">
          <p className={label}>Role in {org.name}</p>
          <select className={field} value={roleKey} onChange={e => setRoleKey(e.target.value)}>{roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
          {(org.ministries || []).length > 0 && <><p className={label}>Departments</p><DeptPicker /></>}
          <p className="text-[11px] text-white/40">Creates their account and seat now. They claim it with their member ID + last name or {person.email ? `by signing in with ${person.email}` : 'their email on file'}; until then it shows as "ready to claim".</p>
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy} onClick={() => run(() => provisionAccount(org, person, { roleKey, ministryIds: deptIds }), 'Account provisioned.')}>{busy ? <Loader2 size={12} className="animate-spin" /> : <QrCode size={12} />} Provision</button>
            <button className={btn} onClick={() => setMode('idle')}>Cancel</button>
          </div>
        </div>
      )}
      {mode === 'link' && (
        <div className="space-y-2">
          <div className="relative"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" /><input autoFocus className={field + ' pl-10'} placeholder="Search Plajah users by name or @handle…" value={q} onChange={e => setQ(e.target.value)} /></div>
          {results.map(u => (
            <button key={u.uid} disabled={busy} onClick={() => run(() => linkPersonToUser(org, person, u, { roleKey, ministryIds: deptIds }), `Linked to ${u.displayName}.`)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-white/10">
              <span className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">{u.photoURL && <img src={u.photoURL} alt="" className="w-full h-full object-cover" />}</span>
              <span className="text-sm text-white flex-1">{u.displayName}{(u as any).handle ? <span className="text-white/40"> @{(u as any).handle}</span> : null}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-small-orange">Link</span>
            </button>
          ))}
          <button className={btn} onClick={() => setMode('idle')}>Cancel</button>
        </div>
      )}
      {msg && <p className="text-[11px] text-white/60">{msg}</p>}
    </div>
  );
};

export default PersonAccountCard;
