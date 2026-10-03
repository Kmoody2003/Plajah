// SpendingSettings — approval limits, finance-team + external-accountant invites, and the auditor's "export everything".
// Rendered inside Finance Settings (one small mount) and reused by the Setup guide.
import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import type { Organization, OrgMembership, OrgInvite } from '../../../../types';
import { createOrgInvite, fetchOrgInvites, inviteMailto, inviteUrl, revokeOrgInvite } from '../../../../services/elevateService';
import { getElevateRole } from '../../../../services/elevateRoles';
import { markSetupStep, saveSpendingSettings, todayISO } from '../../../../services/acctSpending';
import { finAudit, type FinanceSnapshot } from '../../../../services/chmsFinance';
import { loadBooks } from '../../../../services/acctService';
import { downloadText } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, heading, label, btnPrimary, btnGhost } from './shared';
import { useDo, useToast } from './SpendingUi';

const numStr = (n?: number) => (n == null ? '' : String(n));

export const ApprovalLimits: React.FC<{ org: Organization; onSaved: (o: Organization) => void }> = ({ org, onSaved }) => {
  const act = useDo(); const s = org.financeSettings || {};
  const [auto, setAuto] = useState(numStr(s.autoApproveUnder)); const [dual, setDual] = useState(numStr(s.dualApprovalAbove));
  const [dept, setDept] = useState<Record<string, string>>(Object.fromEntries(Object.entries(s.deptAutoApprove || {}).map(([k, v]) => [k, String(v)])));
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/[^0-9.]/g, '')));
  const save = () => act.run(async () => {
    const deptAutoApprove: Record<string, number> = {}; Object.entries(dept).forEach(([k, v]) => { const x = n(v); if (x != null && !Number.isNaN(x)) deptAutoApprove[k] = x; });
    let next = await saveSpendingSettings(org, { autoApproveUnder: n(auto), dualApprovalAbove: n(dual), deptAutoApprove: Object.keys(deptAutoApprove).length ? deptAutoApprove : undefined });
    next = await markSetupStep(next, 'limits', true);
    onSaved(next);
  }, 'Approval limits saved');
  return (
    <div className={`${card} p-5`}>
      <h3 className={heading}>Spending approvals</h3>
      <p className="text-[11px] text-white/50 mb-3">Department heads approve their own department; pastors and finance approve the rest. Small purchases can skip the line entirely.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><p className={`${label} mb-1`}>Auto-approve anything under</p><div className="flex items-center gap-2"><span className="text-white/40">$</span><input inputMode="decimal" value={auto} onChange={e => setAuto(e.target.value)} placeholder="e.g. 100 (blank = never)" className={field} /></div></div>
        <div><p className={`${label} mb-1`}>Needs two approvals at or above</p><div className="flex items-center gap-2"><span className="text-white/40">$</span><input inputMode="decimal" value={dual} onChange={e => setDual(e.target.value)} placeholder="e.g. 2500 (blank = never)" className={field} /></div></div>
      </div>
      {(org.ministries || []).length > 0 && (
        <details className="mt-4"><summary className="text-[10px] font-black uppercase tracking-widest text-white/40 cursor-pointer">Per-department auto-approve limits</summary>
          <div className="grid sm:grid-cols-2 gap-2 mt-3">{(org.ministries || []).map(m => <div key={m.id} className="flex items-center gap-2"><span className="text-xs text-white/70 flex-1 truncate">{m.name}</span><span className="text-white/40">$</span><input inputMode="decimal" value={dept[m.id] ?? ''} onChange={e => setDept({ ...dept, [m.id]: e.target.value })} placeholder={auto || '—'} className={`${fieldSm} w-24`} /></div>)}</div></details>
      )}
      <button onClick={save} disabled={act.busy} className={`${btnPrimary} mt-4`}>Save limits</button>
    </div>
  );
};

const FINANCE_ROLES = ['ACCOUNTANT', 'BOOKKEEPER', 'TREASURER', 'FINANCE_DIRECTOR'] as const;
export const FinanceTeamInvite: React.FC<{ org: Organization; member: OrgMembership | null; defaultRole?: typeof FINANCE_ROLES[number]; onInvited?: () => void }> = ({ org, member, defaultRole = 'ACCOUNTANT', onInvited }) => {
  const act = useDo(); const toast = useToast();
  const [role, setRole] = useState<string>(defaultRole); const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [made, setMade] = useState<OrgInvite | null>(null); const [open, setOpen] = useState<OrgInvite[]>([]);
  const loadOpen = () => fetchOrgInvites(org.id).then(l => setOpen(l.filter(i => FINANCE_ROLES.includes(i.roleKey as any) && !i.revoked && i.uses < i.maxUses && i.expiresAt > Date.now()))).catch(() => {});
  useEffect(() => { loadOpen(); }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = getElevateRole(role);
  const create = () => act.run(async () => {
    const inv = await createOrgInvite(org, member, { roleKey: role, title: def?.label, inviteeName: name.trim() || undefined, inviteeEmail: email.trim() || undefined, maxUses: 1, expiresInDays: role === 'ACCOUNTANT' ? 7 : 14 });
    setMade(inv); finAudit(org.id, 'FIN_ACCOUNTANT_INVITE', def?.label || role, { role, expires: inv.expiresAt }); loadOpen(); onInvited?.(); return inv;
  }, 'Invite ready — share the link');
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast('Link copied'); } catch { toast('Copy failed — select the link and copy it manually.', { tone: 'warn' }); } };
  return (
    <div className={`${card} p-5`}>
      <h3 className={heading}>Invite your accountant or finance team</h3>
      <p className="text-[11px] text-white/50 mb-3">{role === 'ACCOUNTANT' ? <><b className="text-white">Read-only</b> access to the books and giving records — perfect for your CPA or auditor. The link expires in 7 days and works once.</> : def?.description}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">{FINANCE_ROLES.map(r => <button key={r} onClick={() => { setRole(r); setMade(null); }} className={`px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${role === r ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{r === 'ACCOUNTANT' ? 'Accountant (read-only)' : getElevateRole(r)?.label}</button>)}</div>
      <div className="grid sm:grid-cols-2 gap-3"><input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" className={field} /><input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" className={field} /></div>
      <button onClick={create} disabled={act.busy} className={`${btnPrimary} mt-3`}><UserPlus size={12} /> {role === 'ACCOUNTANT' ? 'Invite my accountant' : 'Create invite'}</button>
      {made && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5"><Check size={12} /> Invite ready</p>
          <input readOnly value={inviteUrl(made.id)} onFocus={e => e.currentTarget.select()} className={`${fieldSm} w-full`} />
          <div className="flex gap-2"><button onClick={() => copy(inviteUrl(made.id))} className={btnGhost}><Copy size={12} /> Copy link</button><a href={inviteMailto(made)} className={btnGhost}><Mail size={12} /> Email it</a></div>
        </div>
      )}
      {open.length > 0 && (
        <div className="mt-4"><p className={`${label} mb-2`}>Pending invites</p><div className="space-y-1.5">{open.map(i => (
          <div key={i.id} className="flex items-center gap-2 text-xs"><span className="flex-1 min-w-0 truncate text-white/70">{i.inviteeName || i.inviteeEmail || getElevateRole(i.roleKey)?.label} · expires {todayISO(new Date(i.expiresAt))}</span>
            <button onClick={() => copy(inviteUrl(i.id))} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">Copy</button>
            <button onClick={() => act.run(async () => { await revokeOrgInvite(i.id); await loadOpen(); }, 'Invite revoked')} className="text-[10px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400">Revoke</button></div>))}</div></div>
      )}
    </div>
  );
};

/** Auditor / accountant: everything, as CSV, in one click. */
export const ExportEverything: React.FC<{ org: Organization; snap?: FinanceSnapshot | null }> = ({ org, snap }) => {
  const act = useDo();
  const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = (head: string[], rows: any[][]) => [head.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n');
  const go = () => act.run(async () => {
    const b = await loadBooks(org.id); const name = (id: string) => b.accounts.find(a => a.id === id)?.name || id; const d = todayISO();
    downloadText(`journal-lines-${d}.csv`, csv(['Date', 'Period', 'Memo', 'Status', 'Account', 'Debit', 'Credit', 'Fund', 'Dept', 'Source'], b.journals.flatMap(j => j.lines.map(l => [j.date, j.period, j.memo, j.status, name(l.accountId), l.debit, l.credit, l.fundId || '', l.deptId || '', j.source.kind]))));
    downloadText(`expenses-${d}.csv`, csv(['Date', 'Kind', 'Vendor', 'Description', 'Amount', 'Status', 'Category', 'Dept', 'Submitted by', 'Approved by', 'Paid', 'Method', 'Check #'], b.expenses.map(e => [e.date, e.isRequest ? 'REQUEST' : e.kind, e.vendorName || '', e.description, e.amount, e.status, name(e.accountId), e.deptName || e.deptId || '', e.submittedByName || '', (e.approvals || []).map(a => a.name).join('; '), e.paidAt ? todayISO(new Date(e.paidAt)) : '', e.paymentMethod || '', e.checkNumber || ''])));
    downloadText(`vendors-${d}.csv`, csv(['Name', 'Email', 'Tax ID', '1099', 'W-9 on file'], b.vendors.map(v => [v.name, v.email || '', v.taxId || '', v.is1099 ? 'yes' : '', v.w9Url ? 'yes' : ''])));
    if (snap) downloadText(`gifts-${d}.csv`, csv(['Date', 'Fund', 'Amount', 'Method', 'Status', 'Batch'], snap.ledger.map(r => [r.date, r.fundName, r.amount, r.method, r.status, r.batchId || ''])));
    finAudit(org.id, 'FIN_EXPORT', 'Export everything', { journals: b.journals.length, expenses: b.expenses.length });
    return b.journals.length;
  }, n => `Exported the books (${n} journals) as CSV`);
  return (
    <div className={`${card} p-5`}>
      <h3 className={heading}>Audit export</h3>
      <p className="text-[11px] text-white/50 mb-3">Journal lines, expenses with approvers, vendors and gifts — everything an auditor asks for, as CSV. Logged in the audit trail.</p>
      <button onClick={go} disabled={act.busy} className={btnGhost}><Download size={12} /> Export everything</button>
    </div>
  );
};

const SpendingSettings: React.FC<{ org: Organization; member: OrgMembership | null; snap?: FinanceSnapshot | null; onSaved: (o: Organization) => void }> = ({ org, member, snap, onSaved }) => (
  <div className="space-y-6">
    <ApprovalLimits org={org} onSaved={onSaved} />
    <FinanceTeamInvite org={org} member={member} />
    <ExportEverything org={org} snap={snap} />
    <p className="text-[10px] text-white/30 flex items-center gap-1.5"><ShieldCheck size={11} /> Every approval, payment and void is recorded in the audit trail.</p>
  </div>
);

export default SpendingSettings;
