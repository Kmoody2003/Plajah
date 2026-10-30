// AccountsPanel — "Accounts & Access" in Elevate Ops.
//   • Join link + QR code (claim a pre-provisioned account / join as a new member)
//   • Claim stats: people · provisioned · claimed · nobody yet
//   • Provision everyone who doesn't have an account yet (one click, batched)
//   • Member ID cards CSV (name, member ID, claim link) for the office to print / mail-merge
//   • Payroll import (Paychex / ADP / Gusto / QuickBooks export → staff seats with roles + departments)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Check, Download, Link2, Loader2, QrCode, Users, UserPlus, Briefcase, RefreshCw, Mail } from 'lucide-react';
import type { Organization, OrgMembership, ChmsPerson } from '../../types';
import { fetchPeople, toCSV, downloadText } from '../../services/chmsPeople';
import { fetchOrgMembers, updateOrganization } from '../../services/organizationService';
import { accountStats, provisionAccountsBulk, joinUrl, joinQr, claimUrl, importRoleToKey, canProvision, memberNumberPrefix, sendClaimInvites, describeInviteResult, claimInvitesConfigured } from '../../services/elevateAccounts';
import PayrollImport from './PayrollImport';

interface Props { org: Organization; myMembership: OrgMembership | null; onOrgChange?: (o: Organization) => void }

const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem]';
const pill = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5';
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';

const AccountsPanel: React.FC<Props> = ({ org, myMembership, onOrgChange }) => {
  const allowed = canProvision(org, myMembership);
  const [people, setPeople] = useState<ChmsPerson[]>([]);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [prefix, setPrefix] = useState(org.memberNumberPrefix || '');
  const [onImport, setOnImport] = useState(org.accountProvisioning?.onImport !== false);
  const [tab, setTab] = useState<'access' | 'payroll'>('access');
  const [mailReady, setMailReady] = useState<boolean | null>(null);
  const [inviting, setInviting] = useState(false);
  useEffect(() => { if (allowed) claimInvitesConfigured().then(setMailReady); }, [allowed]);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, m] = await Promise.all([fetchPeople(org.id).catch(() => [] as ChmsPerson[]), fetchOrgMembers(org.id).catch(() => [] as OrgMembership[])]);
    setPeople(p); setMembers(m); setLoading(false);
  }, [org.id]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);
  useEffect(() => { joinQr(org).then(setQr).catch(() => setQr('')); }, [org.id, org.handle]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => accountStats(people, members), [people, members]);
  // Unclaimed seats with an address on file that haven't been invited yet (the server re-checks every rule).
  const uninvited = useMemo(() => {
    const emailOf = new Map(people.map(p => [p.id, p.email]));
    return members.filter(m => m.isProvisioned && !m.claimInviteStatus && (m.claimEmailLower || (m.provisionedPersonId && emailOf.get(m.provisionedPersonId)))).length;
  }, [people, members]);
  const unclaimedWithEmail = useMemo(() => members.filter(m => m.isProvisioned && m.claimEmailLower).length, [members]);
  const url = joinUrl(org);

  if (!allowed) return <div className={`${card} p-6 text-sm text-white/50`}>Accounts &amp; access is for roster staff (pastors, admins, department heads).</div>;

  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ } };
  const downloadQr = () => { if (!qr) return; const a = document.createElement('a'); a.href = qr; a.download = `join-${org.name.replace(/\W+/g, '-').toLowerCase()}.png`; a.click(); };

  const provisionAll = async () => {
    const todo = people.filter(p => !p.linkedUid && !p.provisionedUid && !p.archived);
    if (!todo.length) { setMsg('Everyone already has an account or a seat.'); return; }
    if (!window.confirm(`Pre-provision Plajah accounts for ${todo.length} people? Roles come from each record's Role field (else Member); departments from their ministries.`)) return;
    setBusy({ done: 0, total: todo.length }); setMsg('');
    try {
      const r = await provisionAccountsBulk(org, todo, p => ({ roleKey: importRoleToKey(p.custom?.Role), ministryIds: p.ministryIds }), pr => setBusy({ done: pr.done, total: pr.total }));
      setMsg(`${r.provisioned.length} accounts pre-provisioned. Share the join link or QR so people can claim them.`);
      await load();
    } catch (e: any) { setMsg(e?.message || 'Could not provision.'); }
    setBusy(null);
  };

  const inviteAll = async () => {
    if (!window.confirm(`Email claim invitations to ${uninvited ? `${uninvited} people who haven't been invited yet` : 'everyone still unclaimed'}? People invited in the last 24 hours, bounced addresses and anyone who opted out are skipped. Up to 100 go out per click.`)) return;
    setInviting(true); setMsg('');
    try { setMsg(`Invitations: ${describeInviteResult(await sendClaimInvites(org.id, { all: true }))}`); await load(); }
    catch (e: any) { setMsg(e?.message || 'Could not send invitations.'); }
    setInviting(false);
  };

  const cardsCsv = () => {
    const rows = people.filter(p => !p.archived && (p.provisionedUid || p.linkedUid)).map(p => [p.lastName, p.firstName, p.memberNumber || '', p.linkedUid ? 'Claimed' : 'Ready to claim', p.email || '', claimUrl(org, p.memberNumber)]);
    downloadText(`member-ids-${org.name.replace(/\W+/g, '-').toLowerCase()}.csv`, toCSV([['Last', 'First', 'Member ID', 'Account', 'Email', 'Claim link'], ...rows]));
  };

  const saveSettings = async () => {
    const patch: Partial<Organization> = { memberNumberPrefix: prefix.trim().toUpperCase().slice(0, 4) || undefined, accountProvisioning: { ...(org.accountProvisioning || {}), onImport } };
    await updateOrganization(org.id, patch).catch(() => {});
    onOrgChange?.({ ...org, ...patch });
    setMsg('Settings saved.');
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5">
        {([['access', 'Join link & accounts', Users], ['payroll', 'Import staff from payroll', Briefcase]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className={`${pill} ${tab === k ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}><I size={12} /> {l}</button>
        ))}
      </div>

      {tab === 'payroll' && <PayrollImport org={org} myMembership={myMembership} people={people} onDone={load} />}

      {tab === 'access' && (
        <>
          <div className={`${card} p-5 sm:p-6`}>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-1">Your join link</h3>
            <p className="text-xs text-white/50 mb-4">One link and one QR for everyone: people with a pre-provisioned account claim it with their member ID or email; everyone else joins (or requests to join) as a new member. Put it on the bulletin, the screen, the welcome card.</p>
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {qr ? <img src={qr} alt="Join QR code" className="w-40 h-40 rounded-2xl bg-white p-1.5 shrink-0" /> : <div className="w-40 h-40 rounded-2xl bg-white/5 grid place-items-center"><QrCode className="text-white/20" /></div>}
              <div className="flex-1 min-w-0 space-y-3 w-full">
                <input readOnly value={url} onFocus={e => e.currentTarget.select()} className={field + ' text-xs'} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={copy} className={`${pill} bg-white text-black border-white`}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}</button>
                  <button onClick={downloadQr} className={`${pill} bg-white/5 border-white/10 text-white/70`}><Download size={12} /> QR PNG</button>
                  <a href={`mailto:?subject=${encodeURIComponent(`Join ${org.name} on Plajah`)}&body=${encodeURIComponent(`${org.name} is on Plajah. Claim your account (member ID or email) or join here:\n${url}`)}`} className={`${pill} bg-white/5 border-white/10 text-white/70`}><Link2 size={12} /> Email it</a>
                </div>
                <p className="text-[11px] text-white/35">Member IDs look like <span className="font-mono text-white/60">{memberNumberPrefix(org)}-48213</span>. Role-specific invite links (Pastor, Media Team…) live under Invites.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[['People on file', stats.people], ['Ready to claim', stats.provisioned], ['Claimed', stats.claimed], ['No account yet', stats.unlinked]].map(([l, v]) => (
              <div key={String(l)} className={`${card} p-4`}>
                <p className="text-2xl font-black text-white">{loading ? '…' : v}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mt-1">{l}</p>
              </div>
            ))}
          </div>

          <div className={`${card} p-5 sm:p-6 space-y-3`}>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Provision accounts</h3>
            <p className="text-xs text-white/50">Every person in the directory can have a Plajah account waiting for them. Imports do this automatically (toggle below); use this for people added before, or by hand.</p>
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={provisionAll} disabled={!!busy || loading || stats.unlinked === 0} className={`${pill} bg-small-orange text-black border-small-orange disabled:opacity-40`}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} {busy ? `${busy.done} / ${busy.total}` : `Provision ${stats.unlinked} ${stats.unlinked === 1 ? 'person' : 'people'}`}
              </button>
              {mailReady && (
                <button onClick={inviteAll} disabled={inviting || loading || (uninvited === 0 && unclaimedWithEmail === 0)} className={`${pill} bg-white text-black border-white disabled:opacity-40`}>
                  {inviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} {inviting ? 'Sending…' : uninvited ? `Email ${uninvited} claim ${uninvited === 1 ? 'invite' : 'invites'}` : 'Re-send claim invites'}
                </button>
              )}
              <button onClick={cardsCsv} disabled={loading || (stats.provisioned + stats.claimed) === 0} className={`${pill} bg-white/5 border-white/10 text-white/70 disabled:opacity-40`}><Download size={12} /> Member ID list (CSV)</button>
              <button onClick={load} className={`${pill} bg-white/5 border-white/10 text-white/50`}><RefreshCw size={12} /> Refresh</button>
            </div>
            {mailReady === false && <p className="text-[11px] text-white/35">Email invitations turn on once Plajah's email sender is configured. Until then, use the Member ID list or each person's claim link.</p>}
            {msg && <p className="text-[11px] text-sky-300">{msg}</p>}
          </div>

          <div className={`${card} p-5 sm:p-6 space-y-3`}>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Settings</h3>
            <div className="grid sm:grid-cols-2 gap-3 items-end">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">Member ID prefix</p>
                <input className={field} value={prefix} onChange={e => setPrefix(e.target.value)} placeholder={memberNumberPrefix({ ...org, memberNumberPrefix: undefined })} maxLength={4} />
              </div>
              <label className="flex items-center gap-2 text-xs text-white/70 pb-2"><input type="checkbox" checked={onImport} onChange={e => setOnImport(e.target.checked)} /> Pre-provision accounts automatically on every people import</label>
            </div>
            <button onClick={saveSettings} className={`${pill} bg-white text-black border-white`}><Check size={12} /> Save</button>
          </div>
        </>
      )}
    </div>
  );
};

export default AccountsPanel;
