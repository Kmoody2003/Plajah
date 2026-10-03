// MyOrgRoles — settings panel: every org the viewer belongs to, profile-sync toggle + org-specific About.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { OrgMembership, Organization } from '../../types';
import { fetchUserMemberships, fetchOrganization } from '../../services/organizationService';
import { syncMembershipToProfile, updateRosterEntry } from '../../services/elevateService';
import { getElevateRole } from '../../services/elevateRoles';

export interface MyOrgRolesProps { uid: string }

type Row = { m: OrgMembership; org: Organization | null };

const MyOrgRoles: React.FC<MyOrgRolesProps> = ({ uid }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ms = (await fetchUserMemberships(uid)).filter(m => m.status === 'ACTIVE');
        const out = await Promise.all(ms.map(async m => ({ m, org: await fetchOrganization(m.orgId).catch(() => null) })));
        if (!alive) return;
        setRows(out.filter(r => r.org));
        setDrafts(Object.fromEntries(out.map(r => [r.m.id, r.m.aboutInOrg || ''])));
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, [uid]);

  if (!rows) return <div className="py-4"><Loader2 size={16} className="animate-spin text-white/30" /></div>;
  if (!rows.length) return null;

  const toggle = async (r: Row) => {
    const next = !r.m.syncToProfile;
    setBusy(r.m.id);
    try {
      await syncMembershipToProfile(r.m.orgId, uid, next);
      setRows(rs => rs && rs.map(x => x.m.id === r.m.id ? { ...x, m: { ...x.m, syncToProfile: next } } : x));
    } catch { /* ignore */ }
    setBusy(null);
  };
  const saveAbout = async (r: Row) => {
    setBusy(r.m.id);
    try {
      await updateRosterEntry(r.m.id, { aboutInOrg: drafts[r.m.id] || '' });
      if (r.m.syncToProfile) await syncMembershipToProfile(r.m.orgId, uid, true);
      setSaved(r.m.id); setTimeout(() => setSaved(null), 1800);
    } catch { /* ignore */ }
    setBusy(null);
  };

  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 ml-2">My organizations &amp; roles</label>
      {rows.map(r => (
        <div key={r.m.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 grid place-items-center text-xs font-black text-white/50">
              {r.org?.logoUrl ? <img src={r.org.logoUrl} alt="" className="w-full h-full object-cover" /> : r.org?.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">{r.org?.name}</p>
              <p className="text-[11px] text-white/45 truncate">{r.m.title || getElevateRole(r.m.roleKey)?.label || 'Member'}</p>
            </div>
            <button type="button" onClick={() => toggle(r)} disabled={busy === r.m.id} role="switch" aria-checked={!!r.m.syncToProfile}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${r.m.syncToProfile ? 'bg-small-orange' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${r.m.syncToProfile ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          <p className="text-[10px] text-white/35 -mt-1">Show this role on my personal profile</p>
          <textarea rows={3} value={drafts[r.m.id] ?? ''} onChange={e => setDrafts(d => ({ ...d, [r.m.id]: e.target.value }))}
            placeholder={`About me at ${r.org?.name}…`}
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 resize-none placeholder:text-white/25" />
          <div className="flex justify-end">
            <button type="button" onClick={() => saveAbout(r)} disabled={busy === r.m.id || (drafts[r.m.id] || '') === (r.m.aboutInOrg || '')}
              className="px-4 py-1.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
              {saved === r.m.id ? 'Saved' : 'Save about'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MyOrgRoles;
