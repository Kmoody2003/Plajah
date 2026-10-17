// PayrollImport — staff from the payroll system → Elevate staff seats + pre-provisioned accounts.
// Three doors: the file export (Paychex Flex, ADP, Gusto, QuickBooks Payroll, …) always works; "Connect payroll"
// (Finch — any provider, OAuth-style popup) and the direct Paychex Flex API light up when the server has keys.
// Only names, titles, departments and work contact come across — pay, SSN and bank columns are dropped on parse,
// and the API paths never request them.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, Check, Loader2, AlertTriangle, Link2, FileSpreadsheet, ShieldCheck, Plug, Unplug } from 'lucide-react';
import type { Organization, OrgMembership, ChmsPerson } from '../../types';
import { parseCsvFile } from '../../services/chmsFormats';
import {
  parsePayrollTable, previewPayrollStage, stagePayrollWorkers, PROVIDER_LABEL,
  paychexStatus, fetchPaychexWorkers, connectPaychex,
  finchStatus, openFinchConnect, connectFinch, disconnectFinch, fetchFinchWorkers, finchProviderToPayrollProvider,
  type PayrollProvider, type PayrollWorker, type StagePreviewRow, type PaychexStatus, type FinchStatus,
} from '../../services/payrollImport';
import { getElevateRole } from '../../services/elevateRoles';
import { canProvision } from '../../services/elevateAccounts';

interface Props { org: Organization; myMembership: OrgMembership | null; people: ChmsPerson[]; onDone: () => void }

const card = 'bg-white/[0.03] border border-white/10 rounded-[2rem] p-5';
const pill = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5';

const PayrollImport: React.FC<Props> = ({ org, myMembership, people, onDone }) => {
  const allowed = canProvision(org, myMembership);
  const [provider, setProvider] = useState<PayrollProvider>('generic');
  const [workers, setWorkers] = useState<PayrollWorker[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; provisioned: number } | null>(null);
  const [err, setErr] = useState('');
  const [paychex, setPaychex] = useState<PaychexStatus | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [finch, setFinch] = useState<FinchStatus | null>(null);

  const refreshFinch = useCallback(() => finchStatus(org.id).then(setFinch), [org.id]);
  useEffect(() => { paychexStatus(org.id).then(setPaychex); refreshFinch(); }, [org.id, refreshFinch]);
  const rows: StagePreviewRow[] = useMemo(() => previewPayrollStage(org, workers, people, { includeInactive }), [org, workers, people, includeInactive]);
  const counts = useMemo(() => ({ create: rows.filter(r => r.action === 'create').length, update: rows.filter(r => r.action === 'update').length, skip: rows.filter(r => r.action === 'skip').length }), [rows]);

  if (!allowed) return null;

  const finchLabel = finch?.providerName || finch?.provider || 'payroll';
  const finchState: 'unconfigured' | 'disconnected' | 'connected' = !finch?.configured ? 'unconfigured' : finch.connected ? 'connected' : 'disconnected';

  const onFile = async (f?: File | null) => {
    if (!f) return;
    setErr(''); setResult(null); setBusy('Reading file…');
    try {
      const table = await parseCsvFile(f);
      const p = parsePayrollTable(table);
      setProvider(p.provider); setWorkers(p.workers); setDropped(p.dropped); setIssues(p.issues);
    } catch (e: any) { setErr(e?.message || 'Could not read that file.'); }
    setBusy(null);
  };
  const pullPaychex = async () => {
    setErr(''); setResult(null); setBusy('Connecting to Paychex Flex…');
    try { const r = await fetchPaychexWorkers(org.id); setProvider('paychex'); setWorkers(r.workers); setDropped([]); setIssues([]); }
    catch (e: any) { setErr(e?.message || 'Paychex request failed.'); }
    setBusy(null);
  };
  /** Finch Connect popup → authorization code → server exchanges + stores the token. Owners / admins only. */
  const connectPayroll = async () => {
    if (!finch) return;
    setErr(''); setResult(null); setBusy('Waiting for the payroll sign-in window…');
    try {
      const { code } = await openFinchConnect(finch);
      setBusy('Finishing the connection…');
      await connectFinch(org.id, code);
      await refreshFinch();
    } catch (e: any) { setErr(e?.message || 'Could not connect payroll.'); }
    setBusy(null);
  };
  const disconnectPayroll = async () => {
    if (!window.confirm(`Disconnect ${finchLabel} from ${org.name}? Staff already imported stay; you can reconnect any time.`)) return;
    setErr(''); setBusy('Disconnecting…');
    try { await disconnectFinch(org.id); await refreshFinch(); }
    catch (e: any) { setErr(e?.message || 'Could not disconnect.'); }
    setBusy(null);
  };
  const pullFinch = async () => {
    setErr(''); setResult(null); setBusy(`Pulling the directory from ${finchLabel}…`);
    try {
      const r = await fetchFinchWorkers(org.id);
      setProvider(finchProviderToPayrollProvider(r.provider || finch?.provider)); setWorkers(r.workers); setDropped([]);
      setIssues(r.workers.length === 0 ? ['The payroll directory came back empty — Finch may still be syncing this account; try again in a few minutes.'] : []);
    } catch (e: any) { setErr(e?.message || 'Payroll request failed.'); }
    setBusy(null);
  };
  const stage = async () => {
    setErr(''); setBusy('Staging…');
    try { const r = await stagePayrollWorkers(org, rows, provider, setBusy); setResult(r); setWorkers([]); onDone(); }
    catch (e: any) { setErr(e?.message || 'Import failed.'); }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-1">Import staff from payroll</h3>
        <p className="text-xs text-white/50">Connect your payroll (Paychex Flex, ADP, Gusto, QuickBooks Payroll, Paylocity, Paycor, Rippling, BambooHR and 200+ more) or drop in its employee export. We keep names, job titles, departments and work emails — <span className="text-white/80 font-bold">pay, SSN, bank and birth-date columns are discarded before anything is saved</span>, and the connected path never asks for them. Each person becomes a staff record with a pre-provisioned Plajah account in the matching department.</p>
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <label className={`${pill} bg-small-orange text-black border-small-orange cursor-pointer`}>
            <Upload size={12} /> Choose export (CSV / TSV)
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          </label>

          {/* Finch — any provider */}
          {finchState === 'connected' ? (
            <button onClick={pullFinch} disabled={!!busy} title={`Connected to ${finchLabel} via Finch${finch?.connectedAt ? ` · ${new Date(finch.connectedAt).toLocaleDateString()}` : ''}`}
              className={`${pill} bg-white text-black border-white disabled:opacity-40`}><Link2 size={12} /> Pull from {finchLabel}</button>
          ) : (
            <button onClick={connectPayroll} disabled={finchState !== 'disconnected' || !finch?.canConnect || !!busy}
              title={finchState === 'unconfigured' ? 'Finch is not configured on the server (FINCH_CLIENT_ID / FINCH_CLIENT_SECRET)' : !finch?.canConnect ? 'Only org owners / admins can connect payroll' : 'Sign in to your payroll provider in a popup; Plajah only reads the staff directory'}
              className={`${pill} bg-white/5 border-white/10 text-white/70 disabled:opacity-40`}><Plug size={12} /> Connect payroll (any provider){finchState === 'unconfigured' ? ' · not configured' : ''}</button>
          )}

          {/* Paychex Flex direct (only while no Finch connection is active) */}
          {finchState !== 'connected' && (
            <button onClick={pullPaychex} disabled={!paychex?.connected || !!busy} title={paychex?.connected ? `Connected: ${paychex.companyName || paychex.companyId}` : paychex?.configured ? 'Connect this organization to Paychex in Settings' : 'Paychex Flex API keys are not configured on the server'}
              className={`${pill} bg-white/5 border-white/10 text-white/70 disabled:opacity-40`}><Link2 size={12} /> Pull from Paychex Flex{paychex?.connected ? '' : ' (not connected)'}</button>
          )}
          {busy && <span className="text-[11px] text-white/50 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {busy}</span>}
        </div>

        {/* Finch status line */}
        {finch && finchState === 'connected' && (
          <p className="text-[10px] text-white/45 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5"><ShieldCheck size={11} className="text-green-400" /> Payroll connected: <span className="text-white/80 font-bold">{finchLabel}</span> via Finch · products: {(finch.products || ['directory']).join(', ')}{!(finch.products || []).includes('employment') && <span className="text-white/35"> (no job titles — roles default to Staff; edit after import)</span>}</span>
            {finch.canConnect && <button onClick={disconnectPayroll} disabled={!!busy} className="text-white/40 hover:text-red-300 flex items-center gap-1"><Unplug size={10} /> Disconnect</button>}
          </p>
        )}
        {finch && finchState === 'disconnected' && (
          <p className="text-[10px] text-white/35 mt-2 flex items-center gap-1.5"><ShieldCheck size={11} /> {finch.canConnect ? 'Connect payroll opens your provider\'s sign-in in a popup (powered by Finch). Plajah asks only for the staff directory — never pay, tax or bank data.' : 'An org owner or admin needs to connect payroll first; then you can pull the directory here.'}</p>
        )}
        {finch && finchState === 'unconfigured' && !paychex?.connected && (
          <p className="text-[10px] text-white/35 mt-2 flex items-center gap-1.5"><ShieldCheck size={11} /> {finch.message || 'Direct payroll sync is not configured on this server yet. The file export works today.'}</p>
        )}

        {/* Paychex direct connect (shown only when Finch isn't the active path) */}
        {finchState !== 'connected' && paychex?.configured && !paychex.connected && (
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <input value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="Paychex company ID" className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-sm text-white outline-none focus:border-small-orange/50 w-56" />
            <button disabled={!companyId.trim() || !!busy} onClick={async () => { setBusy('Connecting…'); setErr(''); try { await connectPaychex(org.id, companyId.trim()); setPaychex(await paychexStatus(org.id)); } catch (e: any) { setErr(e?.message || 'Could not connect.'); } setBusy(null); }} className={`${pill} bg-white text-black border-white disabled:opacity-40`}><Link2 size={12} /> Connect Paychex company</button>
            <span className="text-[10px] text-white/35">Found in Paychex Flex under Company Settings → Connected Applications (authorize the Plajah app there first).</span>
          </div>
        )}
        {finchState !== 'connected' && paychex && !paychex.connected && finchState === 'unconfigured' && paychex.configured && <p className="text-[10px] text-white/35 mt-2 flex items-center gap-1.5"><ShieldCheck size={11} /> {paychex.message}</p>}
        {err && <p className="text-[11px] text-red-400 mt-2">{err}</p>}
      </div>

      {result && (
        <div className={`${card} border-green-500/30`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-green-400 flex items-center gap-1.5"><Check size={12} /> Staff imported</p>
          <p className="text-xs text-white/70 mt-1">{result.created} added · {result.updated} updated · {result.skipped} skipped · <span className="text-sky-300 font-bold">{result.provisioned} Plajah accounts pre-provisioned</span>. They claim them with their member ID + last name or by signing in with their work email.</p>
        </div>
      )}

      {workers.length > 0 && (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-white/70 flex items-center gap-1.5"><FileSpreadsheet size={13} className="text-white/40" /> <span className="font-bold text-white">{PROVIDER_LABEL[provider]}</span> · {workers.length} workers · {counts.create} new · {counts.update} matched · {counts.skip} skipped</p>
            <label className="flex items-center gap-2 text-[11px] text-white/60"><input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} /> Include inactive / terminated</label>
          </div>
          {dropped.length > 0 && <p className="text-[10px] text-white/35 mb-2 flex items-center gap-1.5"><ShieldCheck size={11} /> Dropped before saving: {dropped.join(', ')}</p>}
          {issues.slice(0, 5).map((m, i) => <p key={i} className="text-[11px] text-amber-300 flex items-center gap-1.5"><AlertTriangle size={11} /> {m}</p>)}
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-white/5 rounded-2xl">
            <table className="w-full text-[11px]">
              <thead className="text-white/30 text-left sticky top-0 bg-[#0c0c10]"><tr><th className="px-3 py-2">Name</th><th>Title → role</th><th>Department</th><th>Email</th><th>Action</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-1.5 font-bold text-white whitespace-nowrap">{r.worker.firstName} {r.worker.lastName}</td>
                    <td className="py-1.5 text-white/60">{r.worker.title || '—'} <span className="text-white/30">→</span> <span className="text-white/80">{getElevateRole(r.roleKey)?.label}</span></td>
                    <td className="py-1.5 text-white/60">{r.worker.department || '—'}{r.ministryName ? <span className="text-sky-300"> → {r.ministryName}</span> : r.worker.department ? <span className="text-amber-300/80"> (no match)</span> : null}</td>
                    <td className="py-1.5 text-white/50">{r.worker.email || '—'}</td>
                    <td className={`py-1.5 pr-3 ${r.action === 'create' ? 'text-green-400' : r.action === 'update' ? 'text-white/70' : 'text-white/30'}`}>{r.action}{r.why ? ` · ${r.why}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={stage} disabled={!!busy || counts.create + counts.update === 0} className={`${pill} bg-white text-black border-white disabled:opacity-40`}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Add {counts.create + counts.update} staff &amp; provision accounts</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollImport;
