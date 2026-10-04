import React, { useMemo, useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import type { StoreProduct } from '../../types';
import { liveVariants, isTracked, STOCK_REASON_LABEL, type StockReason } from '../../services/inventoryCore';
import { adjustStock } from '../../services/inventoryService';
import { Button, IconButton, Chip } from '../ui';
import Sheet from './Sheet';

/**
 * Receive / recount / write-off for one product — every variant in one place, so restocking a
 * 6-size tee is one screen and one Apply, not six edits. Counts are typed or stepped to the NEW
 * on-hand number; Apply works out the difference and writes it (with a reason) to the ledger.
 */
const REASONS: StockReason[] = ['RECEIVE', 'COUNT', 'RETURN', 'DAMAGE', 'LOST'];

const StockSheet: React.FC<{
  product: StoreProduct;
  /** Pre-select a reason (e.g. RECEIVE from the restock list) and optionally prefill a variant's add. */
  reason?: StockReason;
  prefill?: { variantId?: string; add: number };
  onClose: () => void;
  onDone: (id: string) => void;
}> = ({ product, reason: initialReason = 'RECEIVE', prefill, onClose, onDone }) => {
  const rows = useMemo(
    () => (product.variants?.length
      ? liveVariants(product).map(v => ({ id: v.id as string | undefined, label: v.name, now: v.stock }))
      : [{ id: undefined as string | undefined, label: 'On hand', now: Math.max(0, product.stock ?? 0) }]),
    [product],
  );
  const [next, setNext] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    rows.forEach(r => { m[r.id ?? '_'] = r.now + (prefill && (prefill.variantId ?? undefined) === r.id ? prefill.add : 0); });
    return m;
  });
  const [reason, setReason] = useState<StockReason>(initialReason);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (id: string | undefined, n: number) => setNext(m => ({ ...m, [id ?? '_']: Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)) }));
  const changed = rows.filter(r => next[r.id ?? '_'] !== r.now);
  const totalDelta = changed.reduce((s, r) => s + (next[r.id ?? '_'] - r.now), 0);

  const apply = async () => {
    setBusy(true); setErr('');
    try {
      for (const r of changed) {
        await adjustStock({ product, variantId: r.id, setTo: next[r.id ?? '_'], reason, note: note.trim() || undefined });
      }
      onDone(product.id);
      onClose();
    } catch (e: any) { setErr(e?.message || 'Could not save — check your connection and try again.'); setBusy(false); }
  };

  if (!isTracked(product)) {
    return (
      <Sheet title={product.title} eyebrow="Stock" onClose={onClose}>
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>
          This item doesn't track stock (print-on-demand, digital or sold elsewhere) — it's always available. Turn stock tracking on in the product's settings if you'd rather count it.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={product.title}
      eyebrow="Update stock"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <p className="type-body-sm flex-1" style={{ color: 'var(--on-surface-variant)' }}>
            {changed.length === 0 ? 'Change a count to continue' : `${totalDelta >= 0 ? '+' : ''}${totalDelta} unit${Math.abs(totalDelta) === 1 ? '' : 's'} · ${STOCK_REASON_LABEL[reason]}`}
          </p>
          <Button variant="primary" size="md" icon={<Check />} loading={busy} disabled={changed.length === 0} onClick={apply}>Update stock</Button>
        </div>
      }
    >
      <div className="space-y-2">
        {rows.map(r => {
          const v = next[r.id ?? '_'];
          const diff = v - r.now;
          return (
            <div key={r.id ?? 'base'} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'var(--pj-glass-1)', border: '1px solid var(--pj-border)' }}>
              <div className="min-w-0 flex-1">
                <p className="type-label-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>{r.label}</p>
                <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                  Now {r.now}{diff !== 0 && <span style={{ color: diff > 0 ? 'var(--pj-success)' : 'var(--pj-warning)' }}> → {v} ({diff > 0 ? '+' : ''}{diff})</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <IconButton square variant="secondary" size="sm" aria-label={`Remove one ${r.label}`} onClick={() => set(r.id, v - 1)}><Minus /></IconButton>
                <input
                  inputMode="numeric" aria-label={`${r.label} count`}
                  value={v} onFocus={e => e.currentTarget.select()}
                  onChange={e => set(r.id, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
                  className="pj-input text-center font-black tabular-nums" style={{ width: 64 }}
                />
                <IconButton square variant="secondary" size="sm" aria-label={`Add one ${r.label}`} onClick={() => set(r.id, v + 1)}><Plus /></IconButton>
                <Button variant="ghost" size="xs" onClick={() => set(r.id, v + 10)}>+10</Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="pj-eyebrow mt-5 mb-2">What happened?</p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map(r => <Chip key={r} interactive selected={reason === r} onClick={() => setReason(r)}>{STOCK_REASON_LABEL[r]}</Chip>)}
      </div>
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Note (optional) — PO #, who counted, why…" className="pj-input mt-3 w-full" />
      {err && <p className="type-body-sm mt-3" role="alert" style={{ color: 'var(--pj-danger)' }}>{err}</p>}
    </Sheet>
  );
};

export default StockSheet;
