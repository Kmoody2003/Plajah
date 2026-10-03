// InviteRedeemView — landing screen for ?elevateInvite=TOKEN. Renders as a full-screen overlay.
import React, { useEffect, useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import type { OrgInvite, OrgMembership } from '../../types';
import { fetchInvite, redeemOrgInvite } from '../../services/elevateService';
import { getElevateRole } from '../../services/elevateRoles';

export interface InviteRedeemViewProps {
  token: string;
  signedIn: boolean;
  onSignIn: () => void;
  onClose: () => void;
  onOpenOrg: (orgId: string) => void;
}

const InviteRedeemView: React.FC<InviteRedeemViewProps> = ({ token, signedIn, onSignIn, onClose, onOpenOrg }) => {
  const [inv, setInv] = useState<OrgInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState('');
  const [sync, setSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<OrgMembership | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInvite(token).then(i => { if (alive) setInv(i); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const invalid = !!inv && (inv.revoked || inv.expiresAt < Date.now() || inv.uses >= inv.maxUses);
  const roleLabel = inv ? (inv.title || getElevateRole(inv.roleKey)?.label || 'Member') : '';

  const accept = async () => {
    setBusy(true); setErr(null);
    try { setDone(await redeemOrgInvite(token, { syncToProfile: sync, aboutInOrg: about.trim() || undefined })); }
    catch (e: any) { setErr(e?.message || 'Could not accept this invite.'); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#0b0b0e] border border-white/10 rounded-[2rem] p-6 sm:p-8 text-white">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white" aria-label="Close"><X size={18} /></button>
        {loading ? <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>
          : !inv || invalid ? (
            <div className="text-center py-6 space-y-3">
              <h2 className="text-xl font-black">Invite unavailable</h2>
              <p className="text-sm text-white/50">{!inv ? 'We could not find this invite.' : 'This invite has expired, been used, or was revoked. Ask the organization for a new one.'}</p>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest">Close</button>
            </div>
          ) : done ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 grid place-items-center mx-auto"><Check className="text-emerald-300" /></div>
              <h2 className="text-xl font-black">{done.status === 'PENDING' ? 'Request sent' : `Welcome to ${inv.orgName}`}</h2>
              <p className="text-sm text-white/55">{done.status === 'PENDING'
                ? `A leader at ${inv.orgName} will approve your ${roleLabel} role. You will be added to the roster once approved.`
                : `You are now ${roleLabel} at ${inv.orgName}.`}</p>
              <button onClick={() => onOpenOrg(inv.orgId)} className="px-6 py-2.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest">Open {inv.orgName}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">You are invited to join</p>
                <h2 className="text-2xl font-black mt-1">{inv.orgName}</h2>
                <p className="text-sm text-small-orange font-bold mt-1">{roleLabel}</p>
                {getElevateRole(inv.roleKey)?.description && <p className="text-xs text-white/40 mt-1">{getElevateRole(inv.roleKey)?.description}</p>}
                {inv.requireApproval && <p className="text-[11px] text-white/40 mt-2">A leader will approve your role before it goes live.</p>}
              </div>
              {!signedIn ? (
                <button onClick={onSignIn} className="w-full py-3 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-widest">Sign in to continue</button>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">About you at {inv.orgName}</label>
                    <textarea rows={4} value={about} onChange={e => setAbout(e.target.value)} placeholder="A short bio people will see on the organization's page…"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 resize-none placeholder:text-white/25" />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-white/70"><input type="checkbox" className="mt-0.5" checked={sync} onChange={e => setSync(e.target.checked)} /> Show this role on my personal Plajah profile</label>
                  {err && <p className="text-xs text-red-300">{err}</p>}
                  <button onClick={accept} disabled={busy} className="w-full py-3 rounded-full bg-small-orange text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                    {busy && <Loader2 size={13} className="animate-spin" />} Accept invite
                  </button>
                </>
              )}
            </div>
          )}
      </div>
    </div>
  );
};

export default InviteRedeemView;
