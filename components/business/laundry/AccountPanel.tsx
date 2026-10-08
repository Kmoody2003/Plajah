// AccountPanel - attach a commercial account to the ticket and "Charge to account" (invoice-only: no payment is taken).
// Charging records an ACCOUNT deposit equal to the balance so the ticket can be completed; the amount is collected
// later through a net-terms invoice (Laundry desk > Accounts). NO new payment rail.
import React, { useEffect, useState } from 'react';
import { computeTicketTotals } from '../../../services/ticketCore';
import { billedToAccount, type CommercialAccount } from '../../../services/commercialCore';
import { Section, useLaundry, useRun, Err, Ok, inp, money, pill, type PanelProps } from './shared';

export default function AccountPanel({ api, cfg, ticket: t, apply, closed }: PanelProps) {
  const { laundry } = useLaundry(api);
  const { busy, err, run } = useRun();
  const [accts, setAccts] = useState<CommercialAccount[]>([]); const [msg, setMsg] = useState('');
  useEffect(() => { laundry?.accounts().then(setAccts).catch(() => {}); }, [laundry]);
  if (!laundry || (!accts.length && !t.subject.account)) return null;      // shops with no commercial accounts see nothing
  const accId = String(t.subject.account || ''); const acc = accts.find(a => a.id === accId);
  const billed = billedToAccount(t); const tot = computeTicketTotals(t, cfg);
  return (
    <Section title="Commercial account">
      <select value={accId} disabled={closed || busy || billed > 0} onChange={e => run(() => api.update(t.id, { subject: { account: e.target.value } }), apply)} className={inp} aria-label="Commercial account">
        <option value="">No account (walk-in)</option>{accts.filter(a => a.active || a.id === accId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {acc && <div className="text-xs text-white/50">Net {acc.termsDays}{acc.pricePerLbCents !== undefined ? ` · ${money(acc.pricePerLbCents)}/lb negotiated` : ''}{acc.taxExempt ? ' · tax exempt' : ''}. Weigh in AFTER choosing the account so its price applies.</div>}
      <Err text={err} /><Ok text={msg} />
      {acc && !closed && !billed && tot.approvedCount > 0 && !t.saleOrderId && (
        <button disabled={busy} onClick={() => run(() => laundry.billToAccount(t.id), nt => { apply(nt); setMsg('Charged to the account. It will appear on the next invoice once the ticket is picked up.'); })} className={pill}>Charge {money(tot.balanceCents)} to {acc.name}</button>)}
      {billed > 0 && <div className="text-xs text-emerald-300">Charged {money(billed)} to the account (invoice later).</div>}
    </Section>
  );
}
