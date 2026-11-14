import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Globe, Loader2, Lock } from 'lucide-react';
import type { Organization, OrgMembership } from '../types';
import type { OrgAsset } from '../services/orgAssets';
import { listHqOrgShares, setHqAssetAccess, setHqOrgShare } from '../services/orgAssets';
import { fetchOrganization, fetchOrgMembers, fetchPublicOrganizations } from '../services/organizationService';
import { ELEVATE_ROLES } from '../services/elevateRoles';
import { auth } from '../services/firebase';

type Mode = 'open' | 'restricted' | 'revoked';

/** Who can use a Content HQ file: everyone in the org, chosen departments/roles/people, or nobody (author revoke). */
export const HqAccessForm: React.FC<{ asset: OrgAsset; onChanged?: () => void }> = ({ asset, onChanged }) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [mode, setMode] = useState<Mode>(asset.access || 'open');
  const [departments, setDepartments] = useState<string[]>(asset.accessSpec?.departments || []);
  const [roles, setRoles] = useState<string[]>(asset.accessSpec?.roles || []);
  const [users, setUsers] = useState<string[]>(asset.accessSpec?.users || []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    fetchOrganization(asset.scopeId).then(o => { if (live) setOrg(o); }).catch(() => {});
    fetchOrgMembers(asset.scopeId).then(m => { if (live) setMembers(m.filter(x => x.status === 'ACTIVE')); }).catch(() => {});
    return () => { live = false; };
  }, [asset.scopeId]);

  const uid = auth.currentUser?.uid;
  const canManage = !!uid && (asset.uploadedByUid === uid || org?.creatorId === uid || !!org?.itAdminUids?.includes(uid));
  const roleOptions = useMemo(() => ELEVATE_ROLES.filter(r => r.key !== 'MEMBER'), []);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const save = async (next: Mode) => {
    if (next === 'revoked' && !window.confirm(`Revoke use of "${asset.name}"? Nobody but you and IT Admins can open it, and its review links stop working.`)) return;
    if (next === 'restricted' && !departments.length && !roles.length && !users.length) { setNote('Choose at least one department, role or person.'); return; }
    setBusy(true); setNote('');
    try {
      await setHqAssetAccess(asset.id, next, { departments, roles, users });
      setMode(next);
      setNote(next === 'open' ? 'Everyone with Content HQ access can use this file.' : next === 'revoked' ? 'Use revoked.' : 'Access saved.');
      onChanged?.();
    } catch (e: any) { setNote(e?.message || 'Could not save.'); } finally { setBusy(false); }
  };

  if (!org) return <div className="grid place-items-center h-24 text-white/40"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  if (!canManage) {
    return <p className="text-xs text-white/50">{mode === 'open' ? 'Everyone with Content HQ access can use this file.' : 'Access to this file is limited.'} Its author or an IT Admin can change this.</p>;
  }

  const chip = (on: boolean) => `px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${on ? 'bg-[#34e0d0]/15 border-[#34e0d0]/50 text-[#34e0d0]' : 'bg-white/[0.03] border-white/10 text-white/60'}`;
  const heading = 'text-[10px] font-black uppercase tracking-widest text-white/40 mb-2';

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <button disabled={busy} onClick={() => save('open')} className={chip(mode === 'open')}><Globe className="inline w-3.5 h-3.5 mr-1.5" />Whole org</button>
      <button disabled={busy} onClick={() => setMode('restricted')} className={chip(mode === 'restricted')}><Lock className="inline w-3.5 h-3.5 mr-1.5" />Restricted</button>
    </div>
    {mode === 'restricted' && <>
      <div><div className={heading}>Departments</div><div className="flex flex-wrap gap-1.5">
        {(org.ministries || []).map(d => <button key={d.id} onClick={() => toggle(departments, setDepartments, d.id)} className={chip(departments.includes(d.id))}>{d.name}</button>)}
      </div></div>
      <div><div className={heading}>Roles</div><div className="flex flex-wrap gap-1.5">
        {roleOptions.map(r => <button key={r.key} onClick={() => toggle(roles, setRoles, r.key)} className={chip(roles.includes(r.key))}>{r.label}</button>)}
      </div></div>
      <div><div className={heading}>People</div><div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        {members.map(m => <button key={m.id} onClick={() => toggle(users, setUsers, m.userId)} className={chip(users.includes(m.userId))}>{m.displayName || 'Member'}</button>)}
      </div></div>
      <button disabled={busy} onClick={() => save('restricted')} className="w-full py-2.5 rounded-xl bg-[#34e0d0] text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Save access</button>
    </>}
    {mode === 'revoked'
      ? <p className="text-xs text-red-300/80">Use is revoked. Choose Whole org or Restricted to allow it again.</p>
      : <button disabled={busy} onClick={() => save('revoked')} className="w-full py-2.5 rounded-xl bg-white/5 text-red-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"><Ban className="inline w-3.5 h-3.5 mr-1.5" />Revoke use</button>}
    <p className="text-[11px] text-white/40">The owner and IT Admins can always open this file. Copies already downloaded or pasted into another document aren't recalled.</p>
    {note && <p className="text-xs text-white/60">{note}</p>}
    {org.creatorId === uid || org.itAdminUids?.includes(uid || '') ? <OrgShareForm asset={asset} open={mode === 'open'} /> : null}
  </div>;
};

/** Hands the file to another org, read-only. Their people see it under Shared with me in that org's HQ, nowhere else. */
const OrgShareForm: React.FC<{ asset: OrgAsset; open: boolean }> = ({ asset, open }) => {
  const [shared, setShared] = useState<{ id: string; name: string }[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    listHqOrgShares(asset.id).then(rows => { if (live && rows) setShared(rows); }).catch(() => {});
    fetchPublicOrganizations().then(rows => { if (live) setOrgs(rows); }).catch(() => {});
    return () => { live = false; };
  }, [asset.id]);

  const change = async (id: string, name: string, on: boolean) => {
    setBusy(true); setNote('');
    try {
      await setHqOrgShare(asset.id, id, on);
      setShared(list => (on ? [...list.filter(x => x.id !== id), { id, name }] : list.filter(x => x.id !== id)));
      setQ('');
    } catch (e: any) { setNote(e?.message || 'Could not save.'); } finally { setBusy(false); }
  };

  const needle = q.trim().toLowerCase();
  const matches = needle ? orgs.filter(o => o.id !== asset.scopeId && !shared.some(s => s.id === o.id) && (o.name || '').toLowerCase().includes(needle)).slice(0, 6) : [];

  return <div className="pt-4 border-t border-white/10 space-y-2">
    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Other organizations</div>
    {shared.map(s => <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/10">
      <span className="text-xs text-white/80 flex-1 truncate">{s.name}</span>
      <button disabled={busy} onClick={() => change(s.id, s.name, false)} className="text-[10px] font-black uppercase tracking-widest text-red-300 disabled:opacity-50">Take back</button>
    </div>)}
    {open
      ? <><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an organization to share with" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" />
        {matches.map(o => <button key={o.id} disabled={busy} onClick={() => change(o.id, o.name, true)} className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/70 hover:text-white disabled:opacity-50">Share with {o.name}</button>)}
        <p className="text-[11px] text-white/40">They can view and download it. They can't change it, and it never reaches anyone's personal account.</p></>
      : <p className="text-[11px] text-white/40">Only a file open to the whole org can be shared with another organization.</p>}
    {note && <p className="text-xs text-red-300">{note}</p>}
  </div>;
};

export default HqAccessForm;
