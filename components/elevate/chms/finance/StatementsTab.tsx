// Statements — per-giver / household year-end, quarterly or custom-range giving statements with IRS-style
// "no goods or services" language, print/PDF, batch generate, Plajah-notify, mailing labels, duplicate log.
import React, { useMemo, useState } from 'react';
import { Bell, FileText, Mail, MapPin, Printer } from 'lucide-react';
import { alreadySent, logStatementRun, notifyStatements, statementMailto } from '../../../../services/chmsFinance';
import { buildStatements, curQuarter, downloadText, mailingLabelsCsv, money, quarterRange, statementsHtml, yearRange, type DateRange } from '../../../../services/chmsFinanceReports';
import { finAudit } from '../../../../services/chmsFinance';
import { isFaithOrg } from '../../../../services/elevateTemplates';
import { card, fieldSm, btnPrimary, btnGhost, heading, label, Pill, Empty, RangePicker, useAction, Busy, printHtml, type TabProps } from './shared';

const StatementsTab: React.FC<TabProps> = ({ org, snap, reload, canManage }) => {
  const y = new Date().getFullYear();
  const [preset, setPreset] = useState('LASTYEAR');
  const [custom, setCustom] = useState({ from: `${y}-01-01`, to: `${y}-12-31` });
  const [byHousehold, setByHousehold] = useState(true);
  const [skipSent, setSkipSent] = useState(false);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const act = useAction();

  const range: DateRange = useMemo(() => {
    if (preset === 'LASTYEAR') return yearRange(y - 1);
    if (preset === 'THISYEAR') return { ...yearRange(y), label: `${y} (to date)` };
    if (preset === 'Q') return curQuarter();
    if (preset === 'LASTQ') { const cq = Math.floor(new Date().getMonth() / 3) + 1; return cq === 1 ? quarterRange(y - 1, 4) : quarterRange(y, cq - 1); }
    return { from: custom.from, to: custom.to, label: `${custom.from} – ${custom.to}` };
  }, [preset, custom, y]);

  const all = useMemo(() => buildStatements(snap.ledger, snap.people, snap.households, range, byHousehold), [snap, range, byHousehold]);
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
    downloadText(`statement-email-list-${range.label.replace(/\W+/g, '-')}.csv`, 'Name,Email,Total\r\n' + withMail.map(s => `"${s.name.replace(/"/g, '""')}",${s.email},${s.total.toFixed(2)}`).join('\r\n'));
    await finAudit(org.id, 'FIN_EXPORT', 'statement email list', { count: withMail.length }); setMsg(`Exported ${withMail.length} emails. Use Print → Save as PDF, then attach per giver or mail-merge.`);
  });
  const one = (s: typeof all[number]) => act.run(async () => { printHtml(statementsHtml([s], orgInfo)); await logStatementRun(org, range, 'PRINT', byHousehold, [s]); await reload(); });

  return (
    <div className="space-y-6">
      {(!org.legalName || !org.ein) && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">Set your organization’s legal name and EIN in Settings so statements carry the information donors need for their tax records.</div>}

      <div className={`${card} p-5`}>
        <h3 className={heading}>Statement run</h3>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          {[['LASTYEAR', `Year-end ${y - 1}`], ['THISYEAR', `${y} to date`], ['LASTQ', 'Last quarter'], ['Q', 'This quarter'], ['CUSTOM', 'Custom']].map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${preset === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>
          ))}
          {preset === 'CUSTOM' && <RangePicker from={custom.from} to={custom.to} onChange={(a, b) => setCustom({ from: a, to: b })} />}
        </div>
        <div className="flex flex-wrap gap-4 items-center text-[11px] text-white/60 mb-4">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={byHousehold} onChange={e => setByHousehold(e.target.checked)} /> One statement per household</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={skipSent} onChange={e => setSkipSent(e.target.checked)} /> Hide already generated</label>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name" className={`${fieldSm} w-44`} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div><p className={label}>Statements</p><p className="text-xl font-black text-white">{list.length}</p></div>
          <div><p className={label}>Total</p><p className="text-xl font-black text-white tabular-nums">{money(totalAmt)}</p></div>
          <div><p className={label}>No address</p><p className={`text-xl font-black ${noAddr ? 'text-amber-300' : 'text-white'}`}>{noAddr}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => printSome()} disabled={act.busy || !list.length} className={btnPrimary}><Busy on={act.busy}><Printer size={12} /> Print / PDF all ({list.length})</Busy></button>
          <button onClick={notify} disabled={act.busy || !list.length} className={btnGhost}><Bell size={12} /> Notify in Plajah</button>
          <button onClick={emailList} disabled={!list.length} className={btnGhost}><Mail size={12} /> Email list (CSV)</button>
          <button onClick={labels} disabled={!list.length} className={btnGhost}><MapPin size={12} /> Mailing labels (CSV)</button>
        </div>
        {msg && <p className="text-[11px] text-green-400 mt-3">{msg}</p>}
        <p className="text-[9px] text-white/30 mt-3">Only POSTED, tax-deductible gifts are included — voids and non-deductible gifts are excluded. Statements carry “no goods or services provided” language.</p>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Preview — {range.label}</h3>
        {list.length === 0 ? <Empty>No deductible gifts in this range.</Empty> : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {list.slice(0, 300).map(s => (
              <div key={s.key} className="flex items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]">
                <span className="flex-1 text-white truncate">{s.name} <span className="text-white/30">· {s.lines.length} gift(s)</span></span>
                {sent.has(s.key) && <Pill tone="ok">generated</Pill>}
                {!s.address?.line1 && <Pill tone="warn">no address</Pill>}
                {s.linkedUids.length > 0 && <Pill>plajah</Pill>}
                <span className="tabular-nums text-white">{money(s.total)}</span>
                {s.email && <a href={statementMailto(s, org)} className="text-white/40 hover:text-white" title="Email (attach the PDF)"><Mail size={13} /></a>}
                <button onClick={() => one(s)} className="text-white/40 hover:text-white" title="Print this statement"><FileText size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h3 className={heading}>Statement log (duplicate guard)</h3>
        {snap.statementLogs.length === 0 ? <p className="text-[11px] text-white/40">No statement runs yet.</p> : (
          <div className="space-y-1">{snap.statementLogs.slice(0, 20).map(l => <div key={l.id} className="flex gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03]"><span className="text-white/40 w-36 shrink-0">{new Date(l.at).toLocaleString()}</span><span className="flex-1 text-white">{l.rangeLabel} · {l.mode} · {l.byHousehold ? 'households' : 'individuals'}</span><span className="tabular-nums text-white/70">{l.count}</span></div>)}</div>
        )}
      </div>
    </div>
  );
};

export default StatementsTab;
