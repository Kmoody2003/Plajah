// Statements — per-giver / household year-end, quarterly or custom-range giving statements with IRS-style
// "no goods or services" language, print/PDF, batch generate, Plajah-notify, mailing labels, duplicate log,
// and 4-Scope Family & Household Tax Statement generation (Joint Household, Head & Spouse, Individual, Family Packet).
import React, { useMemo, useState } from 'react';
import { Bell, FileText, Mail, MapPin, Printer, Users } from 'lucide-react';
import type { ChmsTaxStatementScope } from '../../../../types';
import { alreadySent, logStatementRun, notifyStatements, statementMailto } from '../../../../services/chmsFinance';
import { curQuarter, downloadText, mailingLabelsCsv, money, quarterRange, statementsHtml, yearRange, type DateRange } from '../../../../services/chmsFinanceReports';
import { buildScopedTaxStatements, type ScopedStatementData } from '../../../../services/chmsKinshipAndStatements';
import { finAudit } from '../../../../services/chmsFinance';
import { isFaithOrg } from '../../../../services/elevateTemplates';
import { card, fieldSm, btnPrimary, btnGhost, heading, label, Pill, Empty, RangePicker, useAction, Busy, printHtml, type TabProps } from './shared';

const STATEMENT_SCOPES: Array<{ id: ChmsTaxStatementScope; label: string; desc: string }> = [
  {
    id: 'JOINT_HOUSEHOLD',
    label: 'Joint Household (Head + Spouse + Children)',
    desc: '1 combined IRS statement per family household with itemized member sub-ledgers',
  },
  {
    id: 'HEAD_AND_SPOUSE',
    label: 'Head & Spouse Joint (Children Separate)',
    desc: 'Joint statement for Head of Household & Spouse; separate receipts for dependents/others',
  },
  {
    id: 'INDIVIDUAL',
    label: 'Individual Member Statements',
    desc: 'Every individual family member receives their own separate tax receipt',
  },
  {
    id: 'FAMILY_PACKET',
    label: 'Full Family Tax Packet',
    desc: 'Combined Household Cover Summary + separate individual sub-statements in one packet',
  },
];

const StatementsTab: React.FC<TabProps> = ({ org, snap, reload, canManage }) => {
  const y = new Date().getFullYear();
  const [preset, setPreset] = useState('LASTYEAR');
  const [custom, setCustom] = useState({ from: `${y}-01-01`, to: `${y}-12-31` });
  const [scope, setScope] = useState<ChmsTaxStatementScope>('JOINT_HOUSEHOLD');
  const [skipSent, setSkipSent] = useState(false);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const act = useAction();

  const byHousehold = scope !== 'INDIVIDUAL';

  const range: DateRange = useMemo(() => {
    if (preset === 'LASTYEAR') return yearRange(y - 1);
    if (preset === 'THISYEAR') return { ...yearRange(y), label: `${y} (to date)` };
    if (preset === 'Q') return curQuarter();
    if (preset === 'LASTQ') { const cq = Math.floor(new Date().getMonth() / 3) + 1; return cq === 1 ? quarterRange(y - 1, 4) : quarterRange(y, cq - 1); }
    return { from: custom.from, to: custom.to, label: `${custom.from} – ${custom.to}` };
  }, [preset, custom, y]);

  const all: ScopedStatementData[] = useMemo(
    () => buildScopedTaxStatements(snap.ledger, snap.people, snap.households, range, scope),
    [snap, range, scope]
  );
  const sent = useMemo(() => alreadySent(snap.statementLogs, range), [snap.statementLogs, range]);
  const list = all.filter(s => (!filter || s.name.toLowerCase().includes(filter.toLowerCase())) && (!skipSent || !sent.has(s.key)));
  const noAddr = all.filter(s => !s.address?.line1).length;
  const orgInfo = { name: org.name, legalName: org.legalName, ein: org.ein, statementFooter: org.statementFooter, intro: org.financeSettings?.statementIntro, address: org.location?.address ? `${org.location.address}${org.location.city ? ', ' + org.location.city : ''}` : undefined, faith: isFaithOrg(org.orgType) };
  const totalAmt = list.reduce((a, s) => a + s.total, 0);

  if (!canManage) return <Empty>Statements are limited to finance roles.</Empty>;

  const printSome = (stmts = list, mode: 'PRINT' | 'PDF' = 'PRINT') => act.run(async () => {
    if (!stmts.length) { alert('No statements to print.'); return; }
    const dupes = stmts.filter(s => sent.has(s.key)).length;
    if (dupes && !confirm(`${dupes} of these statements were already generated for ${range.label}. Print duplicates anyway?`)) return;
    printHtml(statementsHtml(stmts, orgInfo));
    await logStatementRun(org, range, mode, byHousehold, stmts); await reload();
  });
  const notify = () => act.run(async () => {
    if (!confirm(`Send a "statement ready" notification (no amounts) to ${list.filter(s => s.linkedUids.length).length} linked accounts?`)) return;
    const r = await notifyStatements(org, list);
    await logStatementRun(org, range, 'NOTIFY', byHousehold, list.filter(s => s.linkedUids.length));
    setMsg(`Notified ${r.sent} giver(s). ${r.skipped} have no linked Plajah account — print or email those.`); await reload();
  });
  const labels = () => act.run(async () => { downloadText(`statement-labels-${range.label.replace(/\W+/g, '-')}.csv`, mailingLabelsCsv(list)); await logStatementRun(org, range, 'LABELS', byHousehold, list.filter(s => s.address?.line1)); await reload(); });
  const emailList = () => act.run(async () => {
    const withMail = list.filter(s => s.email);
    downloadText(`statement-email-list-${range.label.replace(/\W+/g, '-')}.csv`, 'Name,Email,Scope,Total\r\n' + withMail.map(s => `"${s.name.replace(/"/g, '""')}",${s.email},${s.scope},${s.total.toFixed(2)}`).join('\r\n'));
    await finAudit(org.id, 'FIN_EXPORT', 'statement email list', { count: withMail.length, scope }); setMsg(`Exported ${withMail.length} emails. Use Print → Save as PDF, then attach per giver or mail-merge.`);
  });
  const one = (s: typeof all[number]) => act.run(async () => { printHtml(statementsHtml([s], orgInfo)); await logStatementRun(org, range, 'PRINT', byHousehold, [s]); await reload(); });

  return (
    <div className="space-y-6">
      {(!org.legalName || !org.ein) && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">Set your organization’s legal name and EIN in Settings so statements carry the information donors need for their tax records.</div>}

      <div className={`${card} p-5`}>
        <h3 className={heading}>Statement run & Family Household Tax Scope</h3>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          {[['LASTYEAR', `Year-end ${y - 1}`], ['THISYEAR', `${y} to date`], ['LASTQ', 'Last quarter'], ['Q', 'This quarter'], ['CUSTOM', 'Custom']].map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${preset === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>
          ))}
          {preset === 'CUSTOM' && <RangePicker from={custom.from} to={custom.to} onChange={(a, b) => setCustom({ from: a, to: b })} />}
        </div>

        {/* 4-Scope Household / Family / Individual Selector */}
        <div className="mb-4">
          <p className={`${label} mb-1.5 flex items-center gap-1.5`}><Users size={11} /> Household & Family Tax Statement Scope (Head of Household · Spouse · Dependents)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {STATEMENT_SCOPES.map(opt => (
              <button
                key={opt.id}
                onClick={() => setScope(opt.id)}
                className={`text-left p-2.5 rounded-xl border transition-all ${
                  scope === opt.id
                    ? 'bg-white/12 border-white text-white'
                    : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white'
                }`}
              >
                <div className="text-[11px] font-bold">{opt.label}</div>
                <div className="text-[9.5px] text-white/45 mt-0.5 leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center text-[11px] text-white/60 mb-4">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={skipSent} onChange={e => setSkipSent(e.target.checked)} /> Hide already generated</label>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by household or member name" className={`${fieldSm} w-56`} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div><p className={label}>Statements ({scope.replace(/_/g, ' ')})</p><p className="text-xl font-black text-white">{list.length}</p></div>
          <div><p className={label}>Total Deductible</p><p className="text-xl font-black text-white tabular-nums">{money(totalAmt)}</p></div>
          <div><p className={label}>No address</p><p className={`text-xl font-black ${noAddr ? 'text-amber-300' : 'text-white'}`}>{noAddr}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => printSome()} disabled={act.busy || !list.length} className={btnPrimary}><Busy on={act.busy}><Printer size={12} /> Print / PDF all ({list.length})</Busy></button>
          <button onClick={notify} disabled={act.busy || !list.length} className={btnGhost}><Bell size={12} /> Notify in Plajah</button>
          <button onClick={emailList} disabled={!list.length} className={btnGhost}><Mail size={12} /> Email list (CSV)</button>
          <button onClick={labels} disabled={!list.length} className={btnGhost}><MapPin size={12} /> Mailing labels (CSV)</button>
        </div>
        {msg && <p className="text-[11px] text-green-400 mt-3">{msg}</p>}
        <p className="text-[9px] text-white/30 mt-3">Only POSTED, tax-deductible gifts are included — voids and non-deductible gifts are excluded. Statements carry IRS 501(c)(3) “no goods or services provided” language and respect Head of Household, Spouse, and Dependent roles.</p>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Preview — {range.label} ({STATEMENT_SCOPES.find(s => s.id === scope)?.label})</h3>
        {list.length === 0 ? <Empty>No deductible gifts in this range.</Empty> : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {list.slice(0, 300).map(s => (
              <div key={s.key} className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex-1 text-white font-semibold truncate">
                    {s.name} <span className="text-white/35 font-normal">· {s.lines.length} gift(s)</span>
                  </span>
                  <span className="text-[10px] text-white/45 hidden md:inline">{s.householdRoleSummary}</span>
                  {sent.has(s.key) && <Pill tone="ok">generated</Pill>}
                  {!s.address?.line1 && <Pill tone="warn">no address</Pill>}
                  {s.linkedUids.length > 0 && <Pill>plajah</Pill>}
                  <span className="tabular-nums font-bold text-white">{money(s.total)}</span>
                  {s.email && <a href={statementMailto(s, org)} className="text-white/40 hover:text-white" title="Email (attach the PDF)"><Mail size={13} /></a>}
                  <button onClick={() => one(s)} className="text-white/40 hover:text-white" title="Print this statement"><FileText size={13} /></button>
                </div>
                {s.memberSubtotals.length > 1 && (
                  <div className="flex flex-wrap gap-2 text-[10px] text-white/55 pl-2">
                    {s.memberSubtotals.map(m => (
                      <span key={m.personId} className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        <b className="text-white/80">{m.role}:</b> {m.name} ({money(m.subtotal)} · {m.giftCount} gifts)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Statement log (duplicate guard)</h3>
        {snap.statementLogs.length === 0 ? <p className="text-[11px] text-white/40">No statement runs yet.</p> : (
          <div className="space-y-1">{snap.statementLogs.slice(0, 20).map(l => <div key={l.id} className="flex gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]"><span className="text-white/40 w-36 shrink-0">{new Date(l.at).toLocaleDateString()}</span><span className="flex-1 text-white">{l.rangeLabel} · {l.mode} · {l.byHousehold ? 'households' : 'individuals'}</span><span className="tabular-nums text-white/70">{l.count}</span></div>)}</div>
        )}
      </div>
    </div>
  );
};

export default StatementsTab;
