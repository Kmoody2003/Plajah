// OrganizationAccountModal — shown when the user picks the ORGANIZATION account type.
// Lets the account become one of the organizations it already owns (e.g. a brand account that already
// set up a church) or create a new one, and sets the organization's kind. The org page then IS the
// account's profile page.

import React, { useEffect, useState } from 'react';
import { Loader2, X, Check, Building2, Plus } from 'lucide-react';
import type { Organization, OrgType } from '../../types';
import { ELEVATE_ORG_KINDS } from '../../services/elevateTemplates';
import { convertOrgToElevate, createOrgFromAccount, linkAccountToOrg } from '../../services/elevateService';
import { fetchOrganization, fetchUserOrganizations } from '../../services/organizationService';
import { auth, updateAccountType } from '../../services/backendService';

interface Props {
  linkedOrgId?: string;
  onClose: () => void;
  /** Called after the account is switched; org is the (new or existing) linked organization. */
  onDone: (org: Organization | null) => void;
  onOpenOrg?: (orgId: string) => void;
}

const NEW = '__new__';

const OrganizationAccountModal: React.FC<Props> = ({ linkedOrgId, onClose, onDone, onOpenOrg }) => {
  const [owned, setOwned] = useState<Organization[] | null>(null);
  const [pick, setPick] = useState<string>(linkedOrgId || NEW);
  const [kind, setKind] = useState<OrgType>('CHURCH');
  const [busy, setBusy] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [err, setErr] = useState('');

  // Orgs this account created (plus the linked one, even if the membership row is missing).
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setOwned([]); return; }
    (async () => {
      const mine = (await fetchUserOrganizations(uid).catch(() => [] as Organization[])).filter(o => o.creatorId === uid && !o.isDemo);
      if (linkedOrgId && !mine.some(o => o.id === linkedOrgId)) {
        const linked = await fetchOrganization(linkedOrgId).catch(() => null);
        if (linked) mine.unshift(linked);
      }
      setOwned(mine);
      const start = mine.find(o => o.id === linkedOrgId) || mine[0];
      if (start) setPick(start.id);
    })();
  }, [linkedOrgId]);

  // Preselect the picked org's current kind when it is already an Elevate kind.
  useEffect(() => {
    const o = owned?.find(x => x.id === pick);
    if (o && ELEVATE_ORG_KINDS.some(k => k.orgType === o.orgType)) setKind(o.orgType);
  }, [pick, owned]);

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      await updateAccountType('ORGANIZATION' as any);
      const label = ELEVATE_ORG_KINDS.find(k => k.orgType === kind)?.label;
      let result: Organization | null;
      if (pick === NEW) {
        result = await createOrgFromAccount(kind, { orgKindLabel: label }, true);
      } else {
        const existing = owned?.find(o => o.id === pick) || null;
        if (!existing) throw new Error('missing org');
        // Same provisioning a fresh Grace Chapel-template setup gets: departments + feeds + chat + lead role.
        result = await convertOrgToElevate(existing, kind, label);
        if (existing.id !== linkedOrgId || existing.accountUid !== auth.currentUser?.uid) await linkAccountToOrg(existing.id);
      }
      setOrg(result);
      onDone(result);
    } catch { setErr('Could not switch this account to an organization. Please try again.'); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0b0b0d] border border-white/10 rounded-[2rem] p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">{org ? 'Organization account ready' : 'Organization account'}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        {org ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-3"><Check className="text-green-400" /></div>
            <p className="text-sm text-white/70 mb-5">This account is now <b className="text-white">{org.name}</b>. Your profile page shows the organization page with its tabs.</p>
            <button onClick={() => { onOpenOrg?.(org.id); onClose(); }} className="px-6 py-3 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest">Open my organization</button>
          </div>
        ) : owned === null ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" size={22} /></div>
        ) : (
          <>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Which organization is this account?</p>
            <div className="grid grid-cols-1 gap-2 mb-5">
              {owned.map(o => (
                <button key={o.id} onClick={() => setPick(o.id)}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${pick === o.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                  <span className="w-9 h-9 rounded-xl overflow-hidden bg-black/30 grid place-items-center shrink-0">
                    {o.logoUrl ? <img src={o.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={15} />}
                  </span>
                  <span className="min-w-0">
                    <span className="text-xs font-black block truncate">{o.name}</span>
                    <span className={`text-[10px] uppercase tracking-widest ${pick === o.id ? 'text-black/50' : 'text-white/40'}`}>{o.orgKindLabel || o.orgType}{o.id === linkedOrgId ? ' · linked' : ''}</span>
                  </span>
                </button>
              ))}
              <button onClick={() => setPick(NEW)}
                className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${pick === NEW ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                <span className="w-9 h-9 rounded-xl bg-black/30 grid place-items-center shrink-0"><Plus size={15} /></span>
                <span className="text-xs font-black">Create a new organization from my profile</span>
              </button>
            </div>

            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">What kind of organization?</p>
            <div className="grid grid-cols-1 gap-2 mb-5">
              {ELEVATE_ORG_KINDS.map(k => (
                <button key={k.orgType} onClick={() => setKind(k.orgType)}
                  className={`p-3 rounded-2xl border text-left transition-all ${kind === k.orgType ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                  <span className="text-xs font-black uppercase tracking-widest block">{k.label}</span>
                  <span className={`text-[11px] ${kind === k.orgType ? 'text-black/60' : 'text-white/40'}`}>{k.blurb}</span>
                </button>
              ))}
            </div>
            {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
            <button onClick={confirm} disabled={busy} className="w-full py-3 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Switching…</> : pick === NEW ? 'Create & make this my account' : 'Make this my account type'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrganizationAccountModal;
