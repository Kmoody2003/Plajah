// OrganizationAccountModal — shown when the user picks the ORGANIZATION account type.
// Asks which kind, switches the account type, and auto-creates + links the org once (idempotent).

import React, { useState } from 'react';
import { Loader2, X, Check } from 'lucide-react';
import type { Organization, OrgType } from '../../types';
import { ELEVATE_ORG_KINDS } from '../../services/elevateTemplates';
import { createOrgFromAccount } from '../../services/elevateService';
import { updateAccountType } from '../../services/backendService';

interface Props {
  linkedOrgId?: string;
  onClose: () => void;
  /** Called after the account is switched; org is the (new or existing) linked organization. */
  onDone: (org: Organization | null) => void;
  onOpenOrg?: (orgId: string) => void;
}

const OrganizationAccountModal: React.FC<Props> = ({ linkedOrgId, onClose, onDone, onOpenOrg }) => {
  const [kind, setKind] = useState<OrgType>('CHURCH');
  const [busy, setBusy] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [err, setErr] = useState('');

  const confirm = async () => {
    if (linkedOrgId) { onOpenOrg?.(linkedOrgId); onClose(); return; }
    setBusy(true); setErr('');
    try {
      await updateAccountType('ORGANIZATION' as any);
      const o = await createOrgFromAccount(kind);
      setOrg(o);
      onDone(o);
    } catch { setErr('Could not set up your organization. Please try again.'); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0b0b0d] border border-white/10 rounded-[2rem] p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black uppercase tracking-tight text-white">{org ? 'Organization ready' : 'What kind of organization?'}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        {org ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-3"><Check className="text-green-400" /></div>
            <p className="text-sm text-white/70 mb-5">{org.name} was created from your account profile and linked to it.</p>
            <button onClick={() => { onOpenOrg?.(org.id); onClose(); }} className="px-6 py-3 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest">Open my organization</button>
          </div>
        ) : linkedOrgId ? (
          <>
            <p className="text-sm text-white/60 mb-5">This account already has an organization linked.</p>
            <button onClick={confirm} className="w-full py-3 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest">Open my organization</button>
          </>
        ) : (
          <>
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
              {busy ? <><Loader2 size={14} className="animate-spin" /> Setting up…</> : 'Create my organization'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrganizationAccountModal;
