// Batches — open → enter → balance vs deposit slip → post → deposited. Posted batches are immutable:
// corrections are VOID (with reason) + re-enter. Two-person integrity approvals live here too.
import React, { useMemo, useState } from 'react';
import { Ban, CheckCircle2, Landmark, Lock, Printer, ShieldCheck } from 'lucide-react';
import type { ChmsBatch } from '../../../../types';
import {
  approveBatchOverride, approveVoid, depositBatch, postBatch, rejectBatchOverride, rejectVoid, settingsOf, updateBatchControl, voidGift,
} from '../../../../services/chmsFinance';
import { batchTotals, depositSlipHtml, money, type LedgerRow } from '../../../../services/chmsFinanceReports';
import { card, field, fieldSm, btnPrimary, btnGhost, heading, label, Pill, Empty, useAction, Busy, printHtml, type TabProps } from './shared';

const tone = (s: ChmsBatch['status']) => s === 'DEPOSITED' ? 'ok' : s === 'POSTED' ? 'info' : 'warn';

const BatchesTab: React.FC<TabProps> = ({ org, snap, reload, canManage, uid }) => {
  const [sel, setSel] = useState<string>('');
  const [override, setOverride] = useState('');
  const [depRef, setDepRef] = useState('');
  const [voidFor, setVoidFor] = useState<string>(''); const [voidWhy, setVoidWhy] = useState('');
  const [ctl, setCtl] = useState({ total: '', count: '' });
  const act = useAction();
  const st = settingsOf(org);

  const batch = snap.batches.find(b => b.id === sel);
  const t = batch ? batchTotals(batch, snap.ledger) : null;
  const rows = useMemo(() => batch ? snap.ledger.filter(r => r.batchId === batch.id).sort((a, b) => b.createdAt - a.createdAt) : [], [batch, snap.ledger]);
  const immutable = !!batch && (batch.status === 'POSTED' || batch.status === 'DEPOSITED');

  const pendingBatches = snap.batches.filter(b => b.overrideRequest);
  const pendingVoids = useMemo(() => {
    const seen = new Set<string>(); const out: LedgerRow[] = [];
    snap.ledger.filter(r => r.voidRequest && r.status !== 'VOID').forEach(r => { const k = r.splitGroupId || r.id; if (!seen.has(k)) { seen.add(k); out.push(r); } });
    return out;
  }, [snap.ledger]);

  const pick = (b: ChmsBatch) => { setSel(b.id); setOverride(''); setDepRef(''); setCtl({ total: b.expectedTotal != null ? String(b.expectedTotal) : '', count: b.expectedCount != null ? String(b.expectedCount) : '' }); setVoidFor(''); };
  const after = async () => { await reload(); };

  const saveCtl = () => batch && act.run(async () => { await updateBatchControl(org, batch, { expectedTotal: ctl.total ? Number(ctl.total) : null, expectedCount: ctl.count ? Number(ctl.count) : null }); await after(); });
  const doPost = () => batch && t && act.run(async () => {
    const r = await postBatch(org, batch, { total: t.total, count: t.count, variance: t.variance, countVariance: t.countVariance, balanced: t.balanced, hasControl: t.expectedTotal != null }, override);
    if (r === 'PENDING_APPROVAL') alert(`This override is above ${money(st.approvalThreshold)}, so a second authorised user must approve it before the batch posts.`);
    setOverride(''); await after();
  });
  const doVoid = (r: LedgerRow) => act.run(async () => {
    const res = await voidGift(org, r, snap.ledger, voidWhy);
    if (res === 'PENDING_APPROVAL') alert('Void requested. A second authorised user must approve it (two-person integrity).');
    setVoidFor(''); setVoidWhy(''); await after();
  });

  if (!snap.batches.length && !canManage) return <Empty>No batches yet.</Empty>;

  return (
    <div className="space-y-6">
      {(pendingBatches.length > 0 || pendingVoids.length > 0) && (
        <div className={`${card} p-5 border-amber-500/30`}>
          <h3 className={heading}><ShieldCheck size={12} className="inline mr-1.5" />Approvals — second person required</h3>
          <div className="space-y-2">
            {pendingBatches.map(b => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.04]">
                <span className="flex-1 text-white">Post batch “{b.name}” out of balance by {money(b.overrideRequest!.variance)} <span className="text-white/40">— {b.overrideRequest!.reason} · requested by {b.overrideRequest!.byName || b.overrideRequest!.by.slice(0, 6)}</span></span>
                {canManage && (b.overrideRequest!.by === uid
                  ? <Pill>awaiting another approver</Pill>
                  : <><button className={btnPrimary} onClick={() => act.run(async () => { await approveBatchOverride(org, b); await after(); })}>Approve</button><button className={btnGhost} onClick={() => act.run(async () => { await rejectBatchOverride(org, b); await after(); })}>Reject</button></>)}
              </div>
            ))}
            {pendingVoids.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.04]">
                <span className="flex-1 text-white">Void {money(r.splitGroupId ? snap.ledger.filter(x => x.splitGroupId === r.splitGroupId).reduce((a, x) => a + x.amount, 0) : r.amount)} · {canManage ? snap.idx.nameOf(r.personId, r.giverName) : 'Giver'} · {r.date} <span className="text-white/40">— {r.voidRequest!.reason} · requested by {r.voidRequest!.byName || r.voidRequest!.by.slice(0, 6)}</span></span>
                {canManage && (r.voidRequest!.by === uid
                  ? <Pill>awaiting another approver</Pill>
                  : <><button className={btnPrimary} onClick={() => act.run(async () => { await approveVoid(org, r, snap.ledger); await after(); })}>Approve void</button><button className={btnGhost} onClick={() => act.run(async () => { await rejectVoid(org, r, snap.ledger); await after(); })}>Reject</button></>)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className={`${card} p-5 lg:col-span-1 max-h-[640px] overflow-y-auto`}>
          <h3 className={heading}>Batches</h3>
          {snap.batches.length === 0 && <Empty>Open a batch from the Enter Gifts tab.</Empty>}
          <div className="space-y-1.5">
            {snap.batches.map(b => {
              const bt = batchTotals(b, snap.ledger);
              return (
                <button key={b.id} onClick={() => pick(b)} className={`w-full text-left px-3 py-2.5 rounded-2xl border transition-all ${sel === b.id ? 'bg-white text-black border-white' : 'bg-white/[0.03] border-white/10 text-white hover:bg-white/10'}`}>
                  <div className="flex justify-between gap-2 text-xs font-bold"><span className="truncate">{b.name}</span><span className="tabular-nums">{money(bt.total)}</span></div>
                  <div className={`flex justify-between text-[10px] mt-0.5 ${sel === b.id ? 'text-black/50' : 'text-white/40'}`}><span>{b.date} · {bt.count} items</span><span>{b.overrideRequest ? 'PENDING APPROVAL' : b.status}</span></div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!batch || !t ? <div className={`${card} p-5`}><Empty>Select a batch to balance, post, print or deposit it.</Empty></div> : (
            <>
              <div className={`${card} p-5`}>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <h3 className="text-sm font-black text-white flex-1">{batch.name}</h3>
                  <Pill tone={tone(batch.status)}>{batch.status}</Pill>
                  {immutable && <Pill><Lock size={9} className="inline mr-1" />immutable</Pill>}
                  <button onClick={() => printHtml(depositSlipHtml(batch, snap.ledger, snap.idx, org.legalName || org.name))} className={btnGhost}><Printer size={12} /> Deposit slip</button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 mb-4">
                  <div><p className={label}>Entered</p><p className="text-xl font-black text-white tabular-nums">{money(t.total)}</p><p className="text-[10px] text-white/40">{t.count} items</p></div>
                  <div><p className={label}>Deposit slip</p>
                    {immutable ? <p className="text-xl font-black text-white tabular-nums">{t.expectedTotal != null ? money(t.expectedTotal) : '—'}</p> : (
                      <div className="flex gap-1.5 mt-1"><input value={ctl.total} onChange={e => setCtl(v => ({ ...v, total: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="Total $" className={`${fieldSm} w-24`} /><input value={ctl.count} onChange={e => setCtl(v => ({ ...v, count: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="Items" className={`${fieldSm} w-16`} />{canManage && <button onClick={saveCtl} className="text-[9px] font-black uppercase tracking-widest text-small-orange">Save</button>}</div>
                    )}
                  </div>
                  <div><p className={label}>Variance</p>
                    <p className={`text-xl font-black tabular-nums ${t.expectedTotal == null ? 'text-white/30' : t.balanced ? 'text-green-400' : 'text-red-400'}`}>{t.expectedTotal == null ? 'no control' : money(t.variance)}</p>
                    {t.expectedTotal != null && t.countVariance !== 0 && <p className="text-[10px] text-red-400">{t.countVariance > 0 ? '+' : ''}{t.countVariance} items vs slip</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-[11px] text-white/50 mb-4">
                  {Object.entries(t.byFund).map(([f, v]) => <span key={f}>{f}: <b className="text-white">{money(v)}</b></span>)}
                  {Object.entries(t.byMethod).map(([f, v]) => <span key={f} className="text-white/30">{f}: {money(v)}</span>)}
                </div>

                {batch.overrideReason && <p className="text-[11px] text-amber-300 mb-3">Posted with override: {batch.overrideReason} (variance {money(batch.overrideVariance || 0)}){batch.approvedBy ? ' — approved by a second user' : ''}</p>}

                {canManage && !immutable && !batch.overrideRequest && (
                  <div className="space-y-2">
                    {!t.balanced && (
                      <input value={override} onChange={e => setOverride(e.target.value)} placeholder={t.expectedTotal != null ? 'Out of balance — override reason (required to post)' : 'No control total — reason to post without one'} className={field} />
                    )}
                    <button onClick={doPost} disabled={act.busy || t.count === 0} className={btnPrimary}><Busy on={act.busy}><CheckCircle2 size={12} /> {t.balanced ? 'Post batch' : 'Post with override'}</Busy></button>
                    <p className="text-[9px] text-white/30">Overrides at or above {money(st.approvalThreshold)} need a second authorised approver.</p>
                  </div>
                )}
                {batch.overrideRequest && <p className="text-[11px] text-amber-300">Override pending a second approver.</p>}
                {canManage && batch.status === 'POSTED' && (
                  <div className="flex gap-2 mt-3"><input value={depRef} onChange={e => setDepRef(e.target.value)} placeholder="Bank deposit reference (optional)" className={field} /><button onClick={() => act.run(async () => { await depositBatch(org, batch, depRef); await after(); })} disabled={act.busy} className={btnPrimary}><Landmark size={12} /> Mark deposited</button></div>
                )}
              </div>

              <div className={`${card} p-5`}>
                <h3 className={heading}>Gifts in this batch</h3>
                {rows.length === 0 ? <Empty>No gifts yet.</Empty> : (
                  <div className="space-y-1 max-h-[420px] overflow-y-auto">
                    {rows.map(r => (
                      <div key={r.id}>
                        <div className={`flex items-center gap-3 text-xs px-3 py-2 rounded-xl bg-white/[0.03] ${r.status === 'VOID' ? 'opacity-40' : ''}`}>
                          <span className="text-white/40 w-20 shrink-0">{r.date}</span>
                          <span className={`flex-1 truncate text-white ${r.status === 'VOID' ? 'line-through' : ''}`}>{r.anonymous ? 'Anonymous' : canManage ? snap.idx.nameOf(r.personId, r.giverName) : 'Giver'} <span className="text-white/30">· {r.fundName} · {r.method}{r.checkNumber ? ` #${r.checkNumber}` : ''}{r.splitGroupId ? ' · split' : ''}</span></span>
                          {r.voidRequest && r.status !== 'VOID' && <Pill tone="warn">void pending</Pill>}
                          {r.status === 'VOID' && <Pill tone="bad">void: {r.voidReason}</Pill>}
                          <span className="tabular-nums text-white">{money(r.amount)}</span>
                          {canManage && r.status !== 'VOID' && !r.voidRequest && <button title="Void" onClick={() => { setVoidFor(voidFor === r.id ? '' : r.id); setVoidWhy(''); }} className="text-white/30 hover:text-red-400"><Ban size={13} /></button>}
                        </div>
                        {voidFor === r.id && (
                          <div className="flex gap-2 mt-1 ml-3"><input autoFocus value={voidWhy} onChange={e => setVoidWhy(e.target.value)} placeholder="Reason for voiding (required — then re-enter the corrected gift)" className={fieldSm + ' flex-1'} /><button onClick={() => doVoid(r)} disabled={act.busy || !voidWhy.trim()} className={btnPrimary}>Void{r.splitGroupId ? ' whole split' : ''}</button></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {immutable && <p className="text-[9px] text-white/30 mt-3">This batch is posted. To correct a gift: void it above (reason required), then re-enter the right amount in a new batch.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchesTab;
