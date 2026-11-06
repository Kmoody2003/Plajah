import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui';
import { fetchEntityPlus, startEntityPlusCheckout, openEntityPlusBilling, type EntityPlusStatus } from '../../services/businessOpsService';

/**
 * Plajah+ for the organization or business that owns this shop: 0% Plajah fee on its direct sales
 * (card processing still applies). Shown only to the people who can pay for it (org finance staff, the business owner).
 */
const EntityPlusCard: React.FC<{ shopId: string }> = ({ shopId }) => {
  const [st, setSt] = useState<EntityPlusStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    fetchEntityPlus(shopId).then(s => { if (live) setSt(s); }).catch(() => { /* not a billing manager: hide the card */ });
    return () => { live = false; };
  }, [shopId]);

  if (!st) return null;
  const who = st.kind === 'ORG' ? 'organization' : 'business';
  const go = async (fn: (b: string) => Promise<{ url: string }>) => {
    setBusy(true); setErr('');
    try { window.location.href = (await fn(shopId)).url; } catch (e: any) { setErr(e?.message || 'Something went wrong.'); setBusy(false); }
  };
  const price = st.price ? `$${(st.price.amountCents / 100).toFixed(2)}/${st.price.interval}` : '';
  const until = st.currentPeriodEnd ? new Date(st.currentPeriodEnd).toLocaleDateString() : '';

  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-container)', border: '1px solid var(--outline-variant)' }}>
      <p className="type-title-sm font-bold flex items-center gap-2"><Sparkles size={16} /> Plajah+ for your {who}</p>
      {st.active ? (
        <>
          <p className="type-body-md">
            Active{st.status === 'past_due' ? ' (payment due)' : ''}. Your shop pays a 0% Plajah fee; card processing still applies.
            {until && (st.cancelAtPeriodEnd ? ` Ends ${until}.` : ` Renews ${until}.`)}
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => go(openEntityPlusBilling)}>Manage billing</Button>
        </>
      ) : (
        <>
          <p className="type-body-md">Without Plajah+, Plajah keeps 5% of each sale (never on tax). With it, your {who} pays 0%{price ? ` for ${price}` : ''}.</p>
          {st.priceConfigured
            ? <Button disabled={busy} onClick={() => go(startEntityPlusCheckout)}>Get Plajah+</Button>
            : <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Coming soon.</p>}
        </>
      )}
      {err && <p className="type-body-sm" style={{ color: 'var(--error)' }}>{err}</p>}
    </div>
  );
};

export default EntityPlusCard;
