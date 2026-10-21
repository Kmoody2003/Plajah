// Team accounts — staff work the business from their OWN Plajah accounts. The owner invites by role (from the
// business type's roles), picks exactly what each seat can do, and shares a one-time code or link. The team
// member accepts it signed in as themselves (StaffJoinGateway); the business then appears under "Work" in
// their account menu. Seats are written only by the server (routes/businessStaff.ts).

import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Loader2, Share2, Trash2, UserPlus, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { BusinessPage, StaffMember } from '../../types';
import { packForPage } from '../../services/verticalPacks';
import {
  ALL_BIZ_PERMS, BIZ_PERM_LABEL, DEFAULT_PERMS, inviteLink, normalizePerms, seatDefaultsForPackRole,
  type BizPerm, type StaffSeat, type StaffSeatRole,
} from '../../services/businessStaffCore';
import { createStaffInvite, listStaffInvites, removeStaffSeat, revokeStaffInvite, updateStaffSeat } from '../../services/businessStaffService';
import { fetchStaff } from '../../services/staffService';
import { BO, BoLabel, BoSectionHead, BoEmpty } from './opsKit';

export interface StaffSeatsPanelProps {
  page: BusinessPage;
  currentUid: string;
  /** Owner: invite, edit, remove. Staff: read-only roster of who's on the team. */
  canManage: boolean;
  accent?: string;
  onChanged?: (page: BusinessPage) => void;
}

const PermChips: React.FC<{ value: BizPerm[]; onToggle?: (p: BizPerm) => void }> = ({ value, onToggle }) => (
  <div className="flex flex-wrap gap-1.5">
    {(onToggle ? ALL_BIZ_PERMS : value).map(p => (
      <button key={p} type="button" disabled={!onToggle} aria-pressed={onToggle ? value.includes(p) : undefined} onClick={() => onToggle?.(p)}
        title={BIZ_PERM_LABEL[p].desc} className="bo-chip" style={!onToggle ? { cursor: 'default' } : undefined}>
        {BIZ_PERM_LABEL[p].label}
      </button>
    ))}
  </div>
);

export default function StaffSeatsPanel({ page, currentUid, canManage, accent = BO.orange, onChanged }: StaffSeatsPanelProps) {
  const pack = packForPage(page);
  const roleOptions = useMemo(() => (pack?.roles ?? []).filter(r => r.key !== 'OWNER'), [pack]);
  const seats: StaffSeat[] = useMemo(
    () => (page.staffUids ?? []).map(uid => page.staffSeats?.[uid]).filter((s): s is StaffSeat => Boolean(s)).sort((a, b) => a.name.localeCompare(b.name)),
    [page.staffUids, page.staffSeats],
  );

  const [inviting, setInviting] = useState(false);
  const [roleKey, setRoleKey] = useState<string>(roleOptions[roleOptions.length - 1]?.key ?? '');
  const [seatRole, setSeatRole] = useState<StaffSeatRole>('STAFF');
  const [perms, setPerms] = useState<BizPerm[]>(DEFAULT_PERMS.STAFF);
  const [staffMemberId, setStaffMemberId] = useState('');
  const [roster, setRoster] = useState<StaffMember[]>([]);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [invites, setInvites] = useState<{ id: string; role: StaffSeatRole; roleLabel?: string; expiresAt: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<BizPerm[]>([]);

  const refreshPage = async () => {
    const snap = await getDoc(doc(db, 'businessPages', page.id));
    if (snap.exists()) onChanged?.({ id: snap.id, ...snap.data() } as BusinessPage);
  };
  const refreshInvites = () => { if (canManage) listStaffInvites(page.id).then(r => setInvites(r.invites)).catch(() => setInvites([])); };

  useEffect(() => { refreshInvites(); }, [page.id, canManage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (canManage && inviting) fetchStaff(page.ownerId).then(setRoster).catch(() => setRoster([])); }, [canManage, inviting, page.ownerId]);

  const pickRole = (key: string) => {
    setRoleKey(key);
    const d = seatDefaultsForPackRole(roleOptions.find(r => r.key === key));
    setSeatRole(d.role); setPerms(d.perms);
  };
  useEffect(() => { if (roleKey) pickRole(roleKey); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (list: BizPerm[], p: BizPerm) => normalizePerms(list.includes(p) ? list.filter(x => x !== p) : [...list, p]);
  const link = code ? inviteLink(window.location.origin, code.code) : '';

  const createInvite = async () => {
    setBusy('invite'); setErr('');
    try {
      const r = roleOptions.find(x => x.key === roleKey);
      const res = await createStaffInvite({ pageId: page.id, role: seatRole, roleKey: r?.key, roleLabel: r?.label, perms, staffMemberId: staffMemberId || undefined });
      setCode(res); refreshInvites();
    } catch (e: any) { setErr(e?.message || 'Could not create the invite.'); } finally { setBusy(null); }
  };

  const saveSeat = async (seat: StaffSeat) => {
    setBusy(`seat:${seat.uid}`); setErr('');
    try { await updateStaffSeat({ pageId: page.id, uid: seat.uid, perms: editPerms }); setEditing(null); await refreshPage(); }
    catch (e: any) { setErr(e?.message || 'Could not save.'); } finally { setBusy(null); }
  };
  const remove = async (seat: StaffSeat) => {
    if (!window.confirm(`Remove ${seat.name} from ${page.businessName}? They keep their personal Plajah account.`)) return;
    setBusy(`seat:${seat.uid}`); setErr('');
    try { await removeStaffSeat(page.id, seat.uid); await refreshPage(); }
    catch (e: any) { setErr(e?.message || 'Could not remove.'); } finally { setBusy(null); }
  };

  return (
    <section>
      <BoSectionHead
        title="Team accounts"
        sub={canManage
          ? 'Your team signs in with their own Plajah accounts. Invite each person to a role, choose what they can do, and change or remove access any time.'
          : 'Everyone who works here with their own Plajah account.'}
        action={canManage && !inviting ? <button className="bo-btn bo-btn-primary" onClick={() => { setInviting(true); setCode(null); }}><UserPlus size={16} /> Invite a team member</button> : undefined}
      />

      {canManage && inviting && (
        <div className="bo-panel p-6 mb-8 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="m-0 bo-title text-[22px] text-white">{code ? 'Share this invite' : 'New team invite'}</h3>
            <button aria-label="Close" onClick={() => { setInviting(false); setCode(null); }} className="w-10 h-10 grid place-items-center rounded-xl text-[#A39BAE] hover:text-white"><X size={18} /></button>
          </div>

          {!code ? (
            <>
              {roleOptions.length > 0 && (
                <div>
                  <BoLabel className="mb-2">Role</BoLabel>
                  <div className="flex flex-wrap gap-2">
                    {roleOptions.map(r => (
                      <button key={r.key} type="button" aria-pressed={roleKey === r.key} onClick={() => pickRole(r.key)} className="bo-chip" title={r.description} style={{ minHeight: 36, padding: '0 14px' }}>{r.label}</button>
                    ))}
                  </div>
                  {roleOptions.find(r => r.key === roleKey)?.description && <p className="m-0 mt-2 text-[13px] text-[#A39BAE]">{roleOptions.find(r => r.key === roleKey)!.description}</p>}
                </div>
              )}
              <div>
                <BoLabel className="mb-2">They can</BoLabel>
                <PermChips value={perms} onToggle={p => setPerms(v => toggle(v, p))} />
              </div>
              {roster.length > 0 && (
                <label className="flex flex-col gap-2">
                  <BoLabel>Link to a roster entry (optional: keeps their PIN, shifts and pay together)</BoLabel>
                  <select className="bo-input" value={staffMemberId} onChange={e => setStaffMemberId(e.target.value)}>
                    <option value="">Not linked</option>
                    {roster.filter(m => m.active && !m.linkedUid && m.role !== 'OWNER').map(m => <option key={m.id} value={m.id}>{m.name} · {m.role === 'MANAGER' ? 'Manager' : 'Staff'}</option>)}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button className="bo-btn bo-btn-primary" disabled={busy === 'invite' || perms.length === 0} onClick={createInvite}>
                  {busy === 'invite' ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Create invite
                </button>
                <span className="text-[13px] text-[#A39BAE]">One person, one use, expires in 7 days.</span>
              </div>
            </>
          ) : (
            <>
              <div className="bo-paper p-6 text-center">
                <BoLabel className="mb-2">Staff code</BoLabel>
                <div className="bo-num" style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', letterSpacing: '0.08em' }}>{code.code}</div>
                <div className="text-[13px] bo-muted mt-2">Expires {new Date(code.expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}. Shown once: share it now.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="bo-btn bo-btn-primary" onClick={() => navigator.clipboard?.writeText(link)}><Copy size={16} /> Copy link</button>
                {typeof navigator !== 'undefined' && (navigator as any).share && (
                  <button className="bo-btn bo-btn-ghost" onClick={() => (navigator as any).share({ title: `Join ${page.businessName} on Plajah`, text: `Your staff code: ${code.code}`, url: link }).catch(() => {})}><Share2 size={16} /> Share</button>
                )}
                <button className="bo-btn bo-btn-ghost" onClick={() => navigator.clipboard?.writeText(code.code)}><Copy size={16} /> Copy code</button>
                <button className="bo-btn bo-btn-ghost" onClick={() => setCode(null)}>Invite someone else</button>
              </div>
              <p className="m-0 text-[13px] text-[#A39BAE]">They open the link (or enter the code from their account menu), sign in as themselves, and accept. You’ll see them here once they join.</p>
            </>
          )}
        </div>
      )}

      {err && <p className="text-sm mb-4" style={{ color: BO.warn }}>{err}</p>}

      {seats.length === 0 ? (
        <BoEmpty title="No team accounts yet" body={canManage ? 'Invite your first team member. They keep their personal account and switch to Work when they clock in.' : 'Only you so far.'} />
      ) : (
        <div className="bo-rule" style={{ borderTop: `1px solid ${BO.line}` }}>
          {seats.map(seat => {
            const me = seat.uid === currentUid;
            const isEditing = editing === seat.uid;
            return (
              <div key={seat.uid} className="py-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-10 h-10 rounded-xl grid place-items-center text-[15px] font-bold shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: accent }}>{seat.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold text-white truncate">{seat.name}{me && <span className="text-[13px] font-normal text-[#A39BAE]"> · you</span>}</div>
                    <div className="text-[13px] text-[#A39BAE]">{seat.roleLabel || (seat.role === 'MANAGER' ? 'Manager' : 'Team member')} · joined {new Date(seat.addedAt).toLocaleDateString()}</div>
                  </div>
                  {canManage && !isEditing && (
                    <div className="flex gap-2">
                      <button className="bo-btn bo-btn-ghost bo-btn-sm" onClick={() => { setEditing(seat.uid); setEditPerms(normalizePerms(seat.perms)); }}>Edit access</button>
                      <button className="bo-btn bo-btn-ghost bo-btn-sm" aria-label={`Remove ${seat.name}`} disabled={busy === `seat:${seat.uid}`} onClick={() => remove(seat)}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="flex flex-col gap-3 pl-[52px]">
                    <PermChips value={editPerms} onToggle={p => setEditPerms(v => toggle(v, p))} />
                    <div className="flex gap-2">
                      <button className="bo-btn bo-btn-primary bo-btn-sm" disabled={busy === `seat:${seat.uid}`} onClick={() => saveSeat(seat)}>Save</button>
                      <button className="bo-btn bo-btn-ghost bo-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="pl-[52px]"><PermChips value={normalizePerms(seat.perms)} /></div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && invites.length > 0 && (
        <div className="mt-8">
          <BoLabel className="mb-2">Open invites</BoLabel>
          <div className="bo-rule">
            {invites.map(inv => (
              <div key={inv.id} className="py-3 flex items-center gap-3">
                <span className="flex-1 text-[14px] text-white">{inv.roleLabel || (inv.role === 'MANAGER' ? 'Manager' : 'Team member')}</span>
                <span className="text-[13px] text-[#A39BAE]">expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                <button className="bo-btn bo-btn-ghost bo-btn-sm" onClick={() => revokeStaffInvite(inv.id).then(refreshInvites).catch(e => setErr(e?.message || 'Could not revoke.'))}>Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
