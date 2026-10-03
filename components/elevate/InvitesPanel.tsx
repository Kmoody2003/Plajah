// InvitesPanel — create role-setup invites (link / QR / email), list + revoke.
import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Mail, Link2, Loader2, Ban, Check } from 'lucide-react';
import type { Organization, OrgMembership, OrgInvite } from '../../types';
import { ELEVATE_ROLES, canAssignRole, elevatePermissions, getElevateRole } from '../../services/elevateRoles';
import { isOrgOwner } from '../../services/orgPermissions';
import { createOrgInvite, fetchOrgInvites, revokeOrgInvite, inviteUrl, inviteMailto } from '../../services/elevateService';
import { auth } from '../../services/backendService';

export interface InvitesPanelProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose?: () => void;
}

const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const pill = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all';

const InvitesPanel: React.FC<InvitesPanelProps> = ({ org, myMembership, onClose }) => {
  const roles = useMemo(() => ELEVATE_ROLES.filter(r => canAssignRole(myMembership, org, r.key)), [myMembership, org]);
  const allowed = isOrgOwner(auth.currentUser?.uid, org) || (!!myMembership && elevatePermissions(myMembership).has('MANAGE_INVITES'));

  const [roleKey, setRoleKey] = useState('');
  const [title, setTitle] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [approval, setApproval] = useState(false);
  const [team, setTeam] = useState(false);
  const [teamUses, setTeamUses] = useState(25);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<OrgInvite | null>(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<OrgInvite[]>([]);

  useEffect(() => { if (!roleKey && roles.length) setRoleKey(roles.find(r => r.key === 'VOLUNTEER')?.key || roles[0].key); }, [roles, roleKey]);
  const load = () => fetchOrgInvites(org.id).then(setInvites).catch(() => {});
  useEffect(() => { if (allowed) load(); /* eslint-disable-next-line */ }, [org.id, allowed]);
  useEffect(() => {
    if (!created) { setQr(''); return; }
    QRCode.toDataURL(inviteUrl(created.id), { width: 512, margin: 2 }).then(setQr).catch(() => setQr(''));
  }, [created]);

  if (!allowed) return <div className="p-6 text-sm text-white/50">You do not have permission to create invites.</div>;

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const inv = await createOrgInvite(org, myMembership, {
        roleKey, title: title.trim() || undefined, ministryId: ministryId || undefined,
        inviteeName: name.trim() || undefined, inviteeEmail: email.trim() || undefined,
        requireApproval: approval, maxUses: team ? Math.max(2, teamUses) : 1, expiresInDays: days,
      });
      setCreated(inv); load();
    } catch (e: any) { setErr(e?.message || 'Could not create invite.'); }
    setBusy(false);
  };

  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(inviteUrl(token)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };
  const downloadQr = () => {
    if (!qr || !created) return;
    const a = document.createElement('a'); a.href = qr; a.download = `invite-${org.name.replace(/\W+/g, '-').toLowerCase()}-${created.roleKey.toLowerCase()}.png`; a.click();
  };
  const revoke = async (t: string) => { await revokeOrgInvite(t).catch(() => {}); if (created?.id === t) setCreated(null); load(); };
  const status = (i: OrgInvite) => i.revoked ? 'Revoked' : i.expiresAt < Date.now() ? 'Expired' : i.uses >= i.maxUses ? 'Used' : 'Active';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-white">Invite people</h3>
          <p className="text-xs text-white/40">Send a link or QR code so someone can set up their own role and About blurb.</p>
        </div>
        {onClose && <button onClick={onClose} className={`${pill} bg-white/5 border-white/10 text-white/60 hover:bg-white/10`}>Close</button>}
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-2">
          <select className={field} value={roleKey} onChange={e => setRoleKey(e.target.value)}>
            {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <input className={field} placeholder={`Title (default: ${getElevateRole(roleKey)?.label || 'role'})`} value={title} onChange={e => setTitle(e.target.value)} />
          {(org.ministries || []).length > 0 && (
            <select className={field} value={ministryId} onChange={e => setMinistryId(e.target.value)}>
              <option value="">No specific ministry</option>
              {(org.ministries || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <input className={field} placeholder="Their name (optional)" value={name} onChange={e => setName(e.target.value)} />
          <input className={field} type="email" placeholder="Their email (optional)" value={email} onChange={e => setEmail(e.target.value)} />
          <select className={field} value={days} onChange={e => setDays(+e.target.value)}>
            {[1, 7, 14, 30, 90].map(d => <option key={d} value={d}>Expires in {d} day{d > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} /> Require approval before they appear on the roster</label>
        <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={team} onChange={e => setTeam(e.target.checked)} /> Team link (multiple people can use it)
          {team && <input type="number" min={2} max={500} value={teamUses} onChange={e => setTeamUses(+e.target.value)} className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs" />}
        </label>
        {err && <p className="text-xs text-red-300">{err}</p>}
        <button onClick={create} disabled={busy || !roleKey} className="px-6 py-2.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Create invite
        </button>
      </div>

      {created && (
        <div className="bg-white/[0.04] border border-small-orange/30 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center">
          {qr && <img src={qr} alt="Invite QR code" className="w-40 h-40 rounded-xl bg-white p-1 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-2 w-full">
            <p className="text-sm font-bold text-white">{created.title || getElevateRole(created.roleKey)?.label} invite ready</p>
            <input readOnly value={inviteUrl(created.id)} onFocus={e => e.currentTarget.select()} className={field + ' text-xs'} />
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => copy(created.id)} className={`${pill} bg-white text-black border-white flex items-center gap-1.5`}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}</button>
              <button onClick={downloadQr} className={`${pill} bg-white/5 border-white/10 text-white/70 flex items-center gap-1.5`}><Download size={12} /> QR PNG</button>
              <a href={inviteMailto(created)} className={`${pill} bg-white/5 border-white/10 text-white/70 flex items-center gap-1.5`}><Mail size={12} /> Email it</a>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Existing invites</p>
        {invites.length === 0 ? <p className="text-xs text-white/30">None yet.</p> : (
          <div className="space-y-1.5">
            {invites.map(i => {
              const st = status(i);
              return (
                <div key={i.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{i.title || getElevateRole(i.roleKey)?.label}{i.inviteeName ? ` — ${i.inviteeName}` : ''}</p>
                    <p className="text-[10px] text-white/40">{st} · {i.uses}/{i.maxUses} used · expires {new Date(i.expiresAt).toLocaleDateString()}</p>
                  </div>
                  {st === 'Active' && <>
                    <button onClick={() => copy(i.id)} className="p-1.5 text-white/50 hover:text-white" aria-label="Copy link"><Copy size={14} /></button>
                    <button onClick={() => setCreated(i)} className="p-1.5 text-white/50 hover:text-white" aria-label="Show QR"><Link2 size={14} /></button>
                    <button onClick={() => revoke(i.id)} className="p-1.5 text-red-400/70 hover:text-red-400" aria-label="Revoke"><Ban size={14} /></button>
                  </>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvitesPanel;
