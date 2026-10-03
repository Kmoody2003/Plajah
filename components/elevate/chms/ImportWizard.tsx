// ImportWizard — bring Servant Keeper (and Planning Center / Breeze / CCB / generic) data into Plajah.
// drop files -> review mapping (only if unsure) -> DRY RUN (nothing written) -> commit with progress -> results + rollback.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, FileText, Check, AlertTriangle, Loader2, Download, RotateCcw, BookOpen, History, ShieldCheck, ChevronRight } from 'lucide-react';
import type { Organization, OrgMembership, ChmsImport } from '../../../types';
import { elevateCan } from '../../../services/elevateRoles';
import { auth } from '../../../services/backendService';
import {
  ALL_KINDS, KIND_LABEL, SOURCE_LABEL, SAMPLE_TEMPLATES, parseCsvFile, type ChmsFileKind, type ChmsSourceSystem,
} from '../../../services/chmsFormats';
import {
  analyzeFile, reanalyzeFile, setColumnField, columnsNeedingReview, unmappedColumns, fileProblems, fieldDefsFor, allowedKinds,
  buildPlan, commitPlan, buildIssuesCsv, adjustedCounts, fetchImports, rollbackImport,
  type ImportFile, type ImportPlan, type CommitProgress,
} from '../../../services/chmsImport';
import { downloadCsv } from '../../../services/chmsExport';

export interface ImportWizardProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onClose: () => void;
  onDone?: () => void;
}

const field = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const card = 'p-4 rounded-2xl bg-white/[0.03] border border-white/10';
const lbl = 'text-[10px] font-black uppercase tracking-widest';
const btnPrimary = 'px-5 py-2.5 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center gap-2';
const btnGhost = 'px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-30 flex items-center gap-2';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

type Step = 'files' | 'mapping' | 'preview' | 'commit' | 'done';
type Tab = 'import' | 'history';

const GUIDE: { title: string; steps: string[] }[] = [
  { title: 'Members / individuals (people + families)', steps: [
    'In Servant Keeper open the Individuals (Members) list and select everyone you want to move - use Group > Select All, include inactive members if you want their history.',
    'Choose Group > Group Export (some versions: File > Export). Pick "Comma separated (CSV)" as the format.',
    'Tick every field you can: Individual / Member #, Family ID, Envelope #, Last + First Name, Family Role, Member Status, Date Joined, Birth Date, Baptism Date, Marital Status, Home Phone, Cell, E-mail, Address, City, State, Zip. Extra fields are all kept - nothing is dropped.',
    'Save the file and drop it here. Do the same for the Family / Household list if it is a separate export.'] },
  { title: 'Contributions (gifts and pledges)', steps: [
    'Open Contribution Manager and choose Reports / Export > Contribution Export (detail, not summary).',
    'Pick the date range. For very large histories export one or two years at a time - Plajah handles many files at once and ignores repeats.',
    'Include: Gift Date, Envelope # (or Individual ID), Name, Fund, Amount, Check #, Batch, Pledge, Memo. Export as CSV.',
    'Export Pledges the same way if you track them. Drop every file here together.'] },
  { title: 'Attendance and groups', steps: [
    'Attendance: use the Attendance report export (one row per person per date) and save as CSV.',
    'Groups: from the Group list use Group Export with the group name column included.',
    'Import People first (or in the same session) so attendance and groups can find each person.'] },
  { title: 'Good to know', steps: [
    'Nothing is written until you approve the dry-run report. You can roll the whole import back later from Import History.',
    'Re-importing the same file is safe: matching records are updated or skipped, never duplicated.',
    'Servant Keeper versions differ - if a menu name is different, look for "Export" or "Save as CSV". Detection works on the column titles, so any CSV is fine.',
    'Excel files (.xlsx): open in Excel and Save As CSV first.'] },
];

const ImportWizard: React.FC<ImportWizardProps> = ({ org, myMembership, onClose, onDone }) => {
  const uid = auth.currentUser?.uid || '';
  const canMoney = elevateCan(myMembership, org, 'MANAGE_GIVING');
  const canPeople = elevateCan(myMembership, org, 'MANAGE_ROSTER');
  const allowed = useMemo(() => allowedKinds(org, myMembership), [org, myMembership]);

  const [tab, setTab] = useState<Tab>('import');
  const [step, setStep] = useState<Step>('files');
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [parsing, setParsing] = useState<string[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [drag, setDrag] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [planMsg, setPlanMsg] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<CommitProgress | null>(null);
  const [result, setResult] = useState<{ completed: boolean; ledger: ChmsImport } | null>(null);
  const [commitErr, setCommitErr] = useState('');
  const [history, setHistory] = useState<(ChmsImport & { rollbackAllowed?: boolean; totals?: { gifts: number; amount: number } })[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [rbBusy, setRbBusy] = useState<string | null>(null);
  const [rbConfirm, setRbConfirm] = useState<string | null>(null);
  const [rbMsg, setRbMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx = useMemo(() => ({ org, uid }), [org, uid]);

  const loadHistory = useCallback(() => {
    setHistBusy(true);
    fetchImports(org.id).then(setHistory).catch(() => setHistory([])).finally(() => setHistBusy(false));
  }, [org.id]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

  if (!allowed.length) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-4">
        <ShieldCheck size={28} className="mx-auto text-white/30" />
        <p className="text-sm text-white/60">Importing needs the Giving or Roster permission in this organization. Ask an owner or pastor to grant it.</p>
        <button onClick={onClose} className={btnGhost + ' mx-auto'}>Close</button>
      </div>
    );
  }

  // ── Step 1: files ──
  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    setFileErrors([]);
    for (const file of arr) {
      setParsing(p => [...p, file.name]);
      try {
        const table = await parseCsvFile(file);
        if (!table.rows.length) throw new Error('No data rows found.');
        let f = analyzeFile(file.name, table);
        if (!allowed.includes(f.kind)) {
          const alt = f.alternatives.find(k => allowed.includes(k));
          if (alt) f = reanalyzeFile(f, { kind: alt }); // keep it visible; flagged below if still not importable
        }
        setFiles(prev => [...prev, f]);
      } catch (e: any) {
        setFileErrors(prev => [...prev, `${file.name}: ${e?.message || 'could not be read'}`]);
      }
      setParsing(p => p.filter(n => n !== file.name));
    }
  };
  const updateFile = (id: string, fn: (f: ImportFile) => ImportFile) => setFiles(prev => prev.map(f => (f.id === id ? fn(f) : f)));

  const blocked = files.filter(f => !allowed.includes(f.kind));
  const problems = files.flatMap(f => fileProblems(f).map(p => `${f.name}: ${p}`));
  const reviewFiles = files.filter(f => columnsNeedingReview(f).length || fileProblems(f).length);

  const runPlan = async (ov: Record<string, string>) => {
    setPlanBusy(true); setPlanMsg('Starting…');
    try {
      const p = await buildPlan(ctx, files, { fundOverrides: ov }, setPlanMsg);
      setPlan(p);
    } catch (e: any) {
      setPlan(null); setCommitErr(e?.message || 'Could not build the preview.');
    }
    setPlanBusy(false);
  };
  const goPreview = async () => { setStep('preview'); setOverrides({}); setCommitErr(''); await runPlan({}); };
  const next1 = () => { if (reviewFiles.length) setStep('mapping'); else goPreview(); };

  const doCommit = async () => {
    if (!plan) return;
    setStep('commit'); setCommitErr(''); setProgress({ phase: 'ledger', done: 0, total: plan.ops.length });
    try {
      const r = await commitPlan(plan, ctx, setProgress);
      setResult(r); setStep('done');
      if (r.completed) onDone?.();
    } catch (e: any) {
      setCommitErr(e?.message || 'Import was interrupted. Nothing is lost - you can resume.');
    }
  };

  const reset = () => { setFiles([]); setPlan(null); setResult(null); setStep('files'); setProgress(null); setCommitErr(''); setOverrides({}); };

  const doRollback = async (id: string) => {
    setRbBusy(id); setRbMsg('');
    try {
      const r = await rollbackImport(org.id, id, uid, { canMoney, canPeople });
      setRbMsg(r.message); setRbConfirm(null); loadHistory(); onDone?.();
    } catch (e: any) { setRbMsg(`Rollback failed: ${e?.message || 'error'}`); }
    setRbBusy(null);
  };

  const countRows = (c: Record<string, { created: number; updated: number; skipped: number; failed: number }>) =>
    Object.entries(c).filter(([, v]) => v.created + v.updated + v.skipped + v.failed > 0);

  // ── UI ──
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight">Import your records</h2>
          <p className={`${lbl} text-white/40`}>Servant Keeper · Planning Center · Breeze · CCB · any CSV</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/5 hover:bg-white/10"><X size={16} /></button>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl w-fit">
        {([['import', 'Import', Upload], ['history', 'Import history', History]] as const).map(([t, l, I]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl ${lbl} transition-all ${tab === t ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}><I size={12} /> {l}</button>
        ))}
      </div>

      {tab === 'history' && (
        <div className="space-y-3">
          {rbMsg && <div className={`${card} text-xs text-white/70`}>{rbMsg}</div>}
          {histBusy && <p className="text-xs text-white/40 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading…</p>}
          {!histBusy && !history.length && <p className="text-xs text-white/40">No imports yet.</p>}
          {history.map(h => {
            const rows = countRows(h.counts || {});
            const canRb = h.status === 'DONE' && h.rollbackAllowed !== false;
            return (
              <div key={h.id} className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{(h.fileNames || []).join(', ') || h.id}</p>
                    <p className="text-[10px] text-white/40">{new Date(h.startedAt).toLocaleString()} · {h.sourceSystem}</p>
                  </div>
                  <span className={`${lbl} px-2 py-1 rounded-full border ${h.status === 'DONE' ? 'border-green-500/30 text-green-400' : h.status === 'ROLLED_BACK' ? 'border-white/20 text-white/40' : 'border-amber-500/30 text-amber-400'}`}>{h.status.replace('_', ' ')}</span>
                </div>
                <p className="text-[11px] text-white/50 mt-2">{rows.map(([k, v]) => `${v.created + v.updated} ${k}${v.failed ? ` (${v.failed} failed)` : ''}`).join(' · ') || 'No records'}{h.totals?.gifts ? ` · ${money(h.totals.amount)} in gifts` : ''}</p>
                {canRb && (rbConfirm === h.id ? (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-amber-300">Removes everything this import created. Gifts are voided (never deleted).</span>
                    <button disabled={rbBusy === h.id} onClick={() => doRollback(h.id)} className={btnPrimary}>{rbBusy === h.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Confirm rollback</button>
                    <button onClick={() => setRbConfirm(null)} className={btnGhost}>Cancel</button>
                  </div>
                ) : <button onClick={() => setRbConfirm(h.id)} className={btnGhost + ' mt-3'}><RotateCcw size={12} /> Roll back</button>)}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'import' && (
        <>
          {/* Stepper */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {([['files', 'Files'], ['mapping', 'Columns'], ['preview', 'Dry run'], ['commit', 'Import'], ['done', 'Results']] as [Step, string][]).map(([s, l], i) => (
              <React.Fragment key={s}>
                {i > 0 && <ChevronRight size={11} className="text-white/20" />}
                <span className={`${lbl} px-2.5 py-1 rounded-full ${step === s ? 'bg-small-orange text-black' : 'bg-white/5 text-white/30'}`}>{l}</span>
              </React.Fragment>
            ))}
          </div>

          {step === 'files' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer text-center p-8 rounded-3xl border-2 border-dashed transition-all ${drag ? 'border-small-orange bg-small-orange/10' : 'border-white/15 bg-white/[0.02] hover:border-white/30'}`}
              >
                <Upload size={26} className="mx-auto text-small-orange mb-2" />
                <p className="text-sm font-bold">Drop all your export files here</p>
                <p className="text-[11px] text-white/40 mt-1">People, families, gifts, pledges, attendance - any mix, any order. CSV (Excel: Save As CSV first).</p>
                <input ref={inputRef} type="file" multiple accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv" className="hidden" onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setShowGuide(v => !v)} className={btnGhost}><BookOpen size={12} /> How to export from Servant Keeper</button>
                {(['people', 'contributions', 'pledges', 'attendance'] as const).filter(k => allowed.includes(k)).map(k => (
                  <button key={k} onClick={() => downloadCsv(`sample-${k}.csv`, SAMPLE_TEMPLATES[k])} className={btnGhost}><Download size={12} /> Sample {k}</button>
                ))}
              </div>

              {showGuide && (
                <div className={`${card} space-y-4`}>
                  {GUIDE.map(g => (
                    <div key={g.title}>
                      <p className={`${lbl} text-small-orange mb-1.5`}>{g.title}</p>
                      <ol className="list-decimal pl-5 space-y-1 text-[12px] text-white/60">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    </div>
                  ))}
                </div>
              )}

              {parsing.map(n => <p key={n} className="text-xs text-white/50 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Reading {n}…</p>)}
              {fileErrors.map((e, i) => <p key={i} className="text-xs text-red-400 flex items-start gap-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {e}</p>)}

              {files.map(f => (
                <div key={f.id} className={card}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <FileText size={16} className="text-white/40 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{f.name}</p>
                      <p className="text-[10px] text-white/40">{f.table.rows.length.toLocaleString()} rows · {f.table.headers.length} columns · {f.table.encoding || 'utf-8'}{f.table.leadingRowsSkipped ? ` · ${f.table.leadingRowsSkipped} title rows skipped` : ''}</p>
                    </div>
                    <select value={f.kind} onChange={e => updateFile(f.id, x => reanalyzeFile(x, { kind: e.target.value as ChmsFileKind }))} className={field + ' !w-auto'}>
                      {ALL_KINDS.filter(k => allowed.includes(k) || k === f.kind).map(k => <option key={k} value={k}>{KIND_LABEL[k]}{!allowed.includes(k) ? ' (not permitted)' : ''}</option>)}
                    </select>
                    <select value={f.source} onChange={e => updateFile(f.id, x => reanalyzeFile(x, { source: e.target.value as ChmsSourceSystem }))} className={field + ' !w-auto'}>
                      {(Object.keys(SOURCE_LABEL) as ChmsSourceSystem[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                    </select>
                    <button onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} aria-label="Remove file" className="p-1.5 rounded-full hover:bg-white/10"><X size={13} /></button>
                  </div>
                  <p className="text-[10px] mt-2 text-white/40">
                    Detected {SOURCE_LABEL[f.source]} · {KIND_LABEL[f.kind]} ({Math.round(f.kindConfidence * 100)}% sure){columnsNeedingReview(f).length ? ` · ${columnsNeedingReview(f).length} column(s) to confirm` : ''}
                  </p>
                  {!allowed.includes(f.kind) && <p className="text-[11px] text-red-400 mt-1">Your role cannot import {KIND_LABEL[f.kind].toLowerCase()}. Change the type or remove the file.</p>}
                </div>
              ))}

              {blocked.length > 0 && <p className="text-[11px] text-amber-300">Remove or re-type the files marked "not permitted" to continue.</p>}
              <div className="flex justify-end">
                <button disabled={!files.length || blocked.length > 0 || parsing.length > 0} onClick={next1} className={btnPrimary}>{reviewFiles.length ? 'Review columns' : 'Preview import'} <ChevronRight size={12} /></button>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <p className="text-xs text-white/50">Plajah was not sure about these columns. Confirm or change them. Anything left as "keep as custom field" is still saved on the record - nothing is dropped.</p>
              {files.filter(f => reviewFiles.includes(f) || fileProblems(f).length).map(f => (
                <div key={f.id} className={card}>
                  <p className="text-sm font-bold mb-2">{f.name} <span className="text-white/30 font-normal">· {KIND_LABEL[f.kind]}</span></p>
                  {fileProblems(f).map((p, i) => <p key={i} className="text-[11px] text-red-400 mb-1 flex gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{p}</p>)}
                  <div className="space-y-1.5">
                    {[...columnsNeedingReview(f), ...unmappedColumns(f)].map(m => (
                      <div key={m.index} className="grid grid-cols-[1fr_1fr] gap-2 items-center">
                        <div className="min-w-0"><p className="text-xs font-bold truncate">{m.header}</p><p className="text-[10px] text-white/30 truncate">e.g. {f.table.rows.find(r => r[m.index])?.[m.index] || '-'}</p></div>
                        <select value={m.field || ''} onChange={e => updateFile(f.id, x => setColumnField(x, m.index, e.target.value || null))} className={field}>
                          <option value="">Keep as custom field</option>
                          {fieldDefsFor(f.kind).map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-between">
                <button onClick={() => setStep('files')} className={btnGhost}>Back</button>
                <button disabled={problems.length > 0} onClick={goPreview} className={btnPrimary}>Preview import <ChevronRight size={12} /></button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {planBusy && <p className="text-xs text-white/50 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {planMsg}</p>}
              {commitErr && !plan && <p className="text-xs text-red-400">{commitErr}</p>}
              {plan && !planBusy && (
                <>
                  <div className={`${card} border-small-orange/30`}>
                    <p className={`${lbl} text-small-orange mb-2 flex items-center gap-1.5`}><ShieldCheck size={13} /> Dry run - nothing has been written yet</p>
                    <ul className="space-y-1.5">
                      {plan.checklist.map((c, i) => <li key={i} className="text-[12px] text-white/70 flex gap-2"><Check size={12} className="text-green-400 shrink-0 mt-0.5" /> {c}</li>)}
                    </ul>
                  </div>

                  <div className={card}>
                    <p className={`${lbl} text-white/40 mb-2`}>What will happen</p>
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-white/30 text-left"><th className="py-1">Kind</th><th>New</th><th>Updated</th><th>Skipped</th><th>Failed</th></tr></thead>
                      <tbody>{countRows(plan.counts).map(([k, v]) => <tr key={k} className="border-t border-white/5"><td className="py-1 capitalize">{k}</td><td className="text-green-400">{v.created}</td><td>{v.updated}</td><td className="text-white/40">{v.skipped}</td><td className={v.failed ? 'text-red-400' : 'text-white/30'}>{v.failed}</td></tr>)}</tbody>
                    </table>
                  </div>

                  {plan.funds.length > 0 && (
                    <div className={card}>
                      <p className={`${lbl} text-white/40 mb-2`}>Funds - match to yours or create new</p>
                      <div className="space-y-1.5">
                        {plan.funds.map(fr => (
                          <div key={fr.key} className="grid grid-cols-[1fr_1fr] gap-2 items-center">
                            <div className="min-w-0"><p className="text-xs font-bold truncate">{fr.sourceName}</p><p className="text-[10px] text-white/30">{fr.count.toLocaleString()} gifts · {money(fr.total)}{fr.suggestion && fr.create ? ` · maybe "${fr.suggestion.fundName}"` : ''}</p></div>
                            <select value={fr.create ? '__new' : fr.fundId} onChange={e => { const ov = { ...overrides, [fr.key]: e.target.value }; setOverrides(ov); runPlan(ov); }} className={field}>
                              <option value="__new">Create new fund "{fr.sourceName}"</option>
                              {(org.givingFunds || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {plan.totals.gifts > 0 && (
                    <div className={card}>
                      <p className={`${lbl} text-white/40 mb-2`}>Reconcile against Servant Keeper - total {money(plan.totals.amount)} · {plan.totals.gifts.toLocaleString()} gifts</p>
                      <div className="grid sm:grid-cols-2 gap-4 text-[11px]">
                        <div>{Object.entries(plan.totals.byFund).sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => <div key={k} className="flex justify-between border-t border-white/5 py-1"><span className="truncate pr-2">{k}</span><span className="text-white/60">{money(v.amount)} <span className="text-white/30">({v.count})</span></span></div>)}</div>
                        <div>{Object.entries(plan.totals.byYear).sort().map(([k, v]) => <div key={k} className="flex justify-between border-t border-white/5 py-1"><span>{k}</span><span className="text-white/60">{money(v.amount)} <span className="text-white/30">({v.count})</span></span></div>)}</div>
                      </div>
                    </div>
                  )}

                  {plan.unmatchedGivers.length > 0 && (
                    <div className={`${card} border-amber-500/20`}>
                      <p className={`${lbl} text-amber-300 mb-2 flex items-center gap-1.5`}><AlertTriangle size={12} /> {plan.unmatchedGivers.length} givers without a matching person</p>
                      <p className="text-[11px] text-white/40 mb-2">Their gifts import by name and wait in the "Match givers" queue. Importing People first (or adding envelope numbers) fixes most of these.</p>
                      {plan.unmatchedGivers.slice(0, 8).map(u => <div key={u.label} className="flex justify-between text-[11px] border-t border-white/5 py-1"><span className="truncate pr-2">{u.label}</span><span className="text-white/50">{u.gifts} · {money(u.total)}</span></div>)}
                    </div>
                  )}

                  {plan.possibleDuplicates.length > 0 && (
                    <div className={card}>
                      <p className={`${lbl} text-white/40 mb-2`}>Possible duplicate people (kept separate - review later)</p>
                      {plan.possibleDuplicates.slice(0, 6).map((d, i) => <p key={i} className="text-[11px] text-white/50 border-t border-white/5 py-1">{d.name} ≈ {d.candidate} <span className="text-white/30">({d.reason})</span></p>)}
                    </div>
                  )}

                  {Object.keys(plan.samples).length > 0 && (
                    <details className={card}>
                      <summary className={`${lbl} text-white/40 cursor-pointer`}>Sample of what will be written</summary>
                      <div className="mt-2 space-y-2">{Object.entries(plan.samples).map(([k, rows]) => <div key={k}><p className="text-[10px] font-black uppercase text-small-orange">{k}</p>{rows.map((r, i) => <p key={i} className="text-[11px] text-white/50">{r.action}: {r.text}</p>)}</div>)}</div>
                    </details>
                  )}

                  {(plan.issues.length > 0 || plan.warnings.length > 0) && (
                    <div className={card}>
                      <div className="flex items-center justify-between mb-1">
                        <p className={`${lbl} text-white/40`}>{plan.issues.filter(i => i.level === 'error').length} errors · {plan.issues.filter(i => i.level === 'warning').length} warnings</p>
                        <button onClick={() => downloadCsv('import-issues.csv', buildIssuesCsv(plan))} className={btnGhost}><Download size={11} /> Download</button>
                      </div>
                      {plan.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300">{w}</p>)}
                      {plan.issues.filter(i => i.level !== 'info').slice(0, 5).map((i, k) => <p key={k} className="text-[11px] text-white/45">{i.file} row {i.row}: {i.message}</p>)}
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button onClick={() => setStep(reviewFiles.length ? 'mapping' : 'files')} className={btnGhost}>Back</button>
                    <button disabled={!plan.ops.length} onClick={doCommit} className={btnPrimary}>Import {plan.ops.length.toLocaleString()} records <ChevronRight size={12} /></button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'commit' && (
            <div className={`${card} space-y-3`}>
              <p className="text-sm font-bold flex items-center gap-2">{commitErr ? <AlertTriangle size={15} className="text-red-400" /> : <Loader2 size={15} className="animate-spin" />} {commitErr ? 'Import paused' : 'Importing - keep this window open'}</p>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-small-orange transition-all" style={{ width: `${progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 4}%` }} /></div>
              <p className="text-[11px] text-white/50">{progress?.message || 'Preparing…'}</p>
              {commitErr && (<><p className="text-[11px] text-red-400">{commitErr}</p><button onClick={doCommit} className={btnPrimary}>Resume where it stopped</button></>)}
            </div>
          )}

          {step === 'done' && result && plan && (
            <div className="space-y-4">
              <div className={`${card} ${result.completed ? 'border-green-500/30' : 'border-amber-500/30'}`}>
                <p className={`${lbl} ${result.completed ? 'text-green-400' : 'text-amber-300'} mb-2 flex items-center gap-1.5`}>{result.completed ? <Check size={13} /> : <AlertTriangle size={13} />} {result.completed ? 'Import complete' : 'Import stopped early'}</p>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-white/30 text-left"><th className="py-1">Kind</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Failed</th></tr></thead>
                  <tbody>{countRows(adjustedCounts(plan)).map(([k, v]) => <tr key={k} className="border-t border-white/5"><td className="py-1 capitalize">{k}</td><td className="text-green-400">{v.created}</td><td>{v.updated}</td><td className="text-white/40">{v.skipped}</td><td className={v.failed ? 'text-red-400' : 'text-white/30'}>{v.failed}</td></tr>)}</tbody>
                </table>
                {plan.totals.gifts > 0 && <p className="text-[11px] text-white/50 mt-2">Gifts imported: {money(plan.totals.amount)} (compare with your Servant Keeper report).</p>}
                {plan.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300 mt-1">{w}</p>)}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => downloadCsv('import-skipped-and-errors.csv', buildIssuesCsv(plan))} className={btnGhost}><Download size={12} /> Error / skipped rows CSV</button>
                {!result.completed && <button onClick={doCommit} className={btnPrimary}>Resume import</button>}
                <button onClick={() => { setTab('history'); }} className={btnGhost}><History size={12} /> Import history / rollback</button>
              </div>
              <div className="flex justify-between">
                <button onClick={reset} className={btnGhost}>Import more files</button>
                <button onClick={onClose} className={btnPrimary}>Done</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ImportWizard;
