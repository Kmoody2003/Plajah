// PassportPanel - Vehicle Passport (v1) from the shop side: publish a shop-verified service entry from a finished
// ticket to the customer's history, and read OTHER shops' entries only with a short-lived code the owner shares.
import React, { useMemo, useState } from 'react';
import { autoApiFor } from './autoApi';
import type { PassportEntry } from '../../../services/passportCore';
import type { DetailPanelProps } from '../tickets/panelRegistry';

const lbl = 'text-[10px] font-black uppercase tracking-widest text-white/40';
const inp = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-white/30 w-full text-white';

export default function PassportPanel({ api, ticket, closed }: DetailPanelProps) {
  const auto = useMemo(() => autoApiFor(api), [api]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [res, setRes] = useState<{ claimCode: string; ownerLinked: boolean; already: boolean } | null>(null);
  const [code, setCode] = useState(''); const [shared, setShared] = useState<{ entries: PassportEntry[]; meta: any } | null>(null);
  if (!auto) return null;
  const publish = async () => {
    setBusy(true); setErr('');
    try { const r = await auto.publishPassport(ticket.id); setRes({ claimCode: r.claimCode, ownerLinked: r.ownerLinked, already: r.alreadyPublished }); }
    catch (e: any) { setErr(e?.message || 'Could not publish.'); } finally { setBusy(false); }
  };
  const view = async () => {
    setBusy(true); setErr(''); setShared(null);
    try { const r = await auto.viewShared(code.trim()); setShared({ entries: r.entries, meta: r.meta }); }
    catch (e: any) { setErr(e?.message || 'Could not open that code.'); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2" data-testid="passport-panel">
      <div className={lbl}>Vehicle Passport (customer-owned history)</div>
      {closed ? (
        <>
          <button disabled={busy} onClick={publish} className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase disabled:opacity-40">Add to customer's vehicle history</button>
          <div className="text-[11px] text-white/45">Records the approved work (no prices or contact details) as a shop-verified entry. The customer cannot edit it.</div>
        </>
      ) : <div className="text-[11px] text-white/45">After pickup, you can add this visit to the customer's vehicle history.</div>}
      {res && (
        <div role="status" className="rounded-lg bg-emerald-400/10 border border-emerald-400/30 p-2 text-xs text-emerald-200 space-y-1">
          <div>{res.already ? 'This visit was already in the history.' : 'Added to the vehicle history.'} {res.ownerLinked ? 'It is in the customer\'s My Garage.' : ''}</div>
          {!res.ownerLinked && res.claimCode && <div>This customer is not linked to a Plajah account. Give them this claim code to add the vehicle in My Garage: <b className="font-mono text-base text-white">{res.claimCode}</b></div>}
        </div>
      )}
      {err && <div role="alert" className="text-xs font-bold text-[#ff7aa8]">{err}</div>}
      <div className="pt-1 space-y-1.5">
        <div className={lbl}>Customer shared history with you?</div>
        <div className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value)} placeholder="Paste their share code" aria-label="Share code" className={inp} /><button disabled={busy || code.length < 20} onClick={view} className="shrink-0 min-h-[40px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase disabled:opacity-40">View</button></div>
        {shared && (
          <div className="space-y-1.5">
            <div className="text-xs text-white/60">{[shared.meta?.year, shared.meta?.make, shared.meta?.model].filter(Boolean).join(' ')} · {shared.entries.length} shop-verified entries. Read-only, expires soon.</div>
            {shared.entries.map(e => <div key={e.id} className="text-xs rounded-lg bg-white/5 p-2"><b>{new Date(e.at).toLocaleDateString()}</b> · {e.shopName}{e.odometer !== undefined ? ` · ${e.odometer.toLocaleString()} mi` : ''}<div className="text-white/60">{e.work.map(w => w.description).join('; ')}</div></div>)}
          </div>
        )}
      </div>
    </section>
  );
}
