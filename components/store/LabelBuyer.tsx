import React, { useState } from 'react';
import { Tag, Loader2, Printer } from 'lucide-react';
import { Button } from '../ui';
import { getLabelRates, buyLabel, type LabelRateOption } from '../../services/businessOpsService';

/**
 * Buy a shipping label for one order from the seller's own Shippo account: rates for the usual box (weight
 * editable), pick one, and the label PDF opens with the tracking number ready to mark the order shipped.
 */
const LabelBuyer: React.FC<{ orderId: string; onBought: (t: { trackingNumber: string; trackingCarrier: string; labelUrl: string }) => void; onClose: () => void }> = ({ orderId, onBought, onClose }) => {
  const [rates, setRates] = useState<LabelRateOption[] | null>(null);
  const [oz, setOz] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = async (weight?: number) => {
    setBusy('rates'); setErr('');
    try { const r = await getLabelRates(orderId, weight); setRates(r.rates); setOz(String(r.weightOz)); }
    catch (e: any) { setErr(e.message); setRates(null); }
    finally { setBusy(null); }
  };
  React.useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId]);

  const buy = async (r: LabelRateOption) => {
    if (!confirm(`Buy a ${r.carrier} ${r.service} label for $${Number(r.amount).toFixed(2)}? Shippo charges your account.`)) return;
    // Open the tab now (a pop-up opened after an await is blocked), then point it at the label.
    const w = window.open('', '_blank');
    setBusy(r.id); setErr('');
    try {
      const t = await buyLabel(orderId, r.id, r.carrier);
      if (w) w.location.href = t.labelUrl;
      onBought(t);
    } catch (e: any) { w?.close(); setErr(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: 'var(--pj-glass-2)', border: '1px solid var(--pj-border)' }}>
      <div className="flex items-center gap-2">
        <p className="type-label-lg font-bold flex-1 flex items-center gap-1.5"><Tag size={14} /> Buy a label</p>
        <label className="type-body-sm flex items-center gap-1.5">Weight
          <input className="pj-input text-center" style={{ width: 64, height: 30 }} inputMode="numeric" value={oz} onChange={e => setOz(e.target.value.replace(/\D/g, ''))} aria-label="Package weight in ounces" /> oz</label>
        <Button variant="ghost" size="sm" disabled={!!busy || !oz} onClick={() => load(Number(oz))}>Update</Button>
      </div>
      {busy === 'rates' && <p className="type-body-sm flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Getting rates…</p>}
      {err && <p role="alert" className="type-body-sm" style={{ color: 'var(--pj-danger)' }}>{err}</p>}
      {rates?.map(r => (
        <div key={r.id} className="flex items-center gap-2">
          <p className="type-body-md flex-1 min-w-0 truncate"><b>{r.carrier}</b> {r.service}{r.days ? <span style={{ color: 'var(--on-surface-variant)' }}> · about {r.days} day{r.days === 1 ? '' : 's'}</span> : null}</p>
          <Button variant="secondary" size="sm" icon={<Printer />} loading={busy === r.id} disabled={!!busy} onClick={() => buy(r)}>${Number(r.amount).toFixed(2)}</Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={onClose}>Back</Button>
    </div>
  );
};

export default LabelBuyer;
