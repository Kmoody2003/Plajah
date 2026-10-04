// WeighInPanel - laundry ticket panel: weigh the bags (typed or scale), price with tiers/minimum/add-ons, and write the
// BY_WEIGHT lines onto the ticket. Re-weighing replaces ONLY the lines this panel wrote (ids kept in subject.wi_lines),
// never lines staff added by hand. Also sets bag count, bag tag codes and the ready-by time (rush / business hours aware).
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { computeTicketTotals, type Ticket } from '../../../services/ticketCore';
import { computeDueAt, hasBulkyLines, makeTagCodes, rushEligible } from '../../../services/laundryCore';
import type { CommercialAccount } from '../../../services/commercialCore';
import type { WeighResult } from '../../WeighLineSheet';
import { Section, useLaundry, useRun, Err, money, pill, type PanelProps } from './shared';

const WeighLineSheet = lazy(() => import('../../WeighLineSheet'));
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v ? String(v).split(/[,\s]+/).filter(Boolean) : []);

export default function WeighInPanel({ api, cfg, ticket: t, apply, closed }: PanelProps) {
  const { laundry, settings } = useLaundry(api);
  const { busy, err, setErr, run } = useRun();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<CommercialAccount | null>(null);
  const accId = String(t.subject.account || '');
  useEffect(() => { if (!accId || !laundry) { setAccount(null); return; } laundry.accounts().then(l => setAccount(l.find(a => a.id === accId) || null)).catch(() => {}); }, [accId, laundry]);

  const managed = new Set(arr(t.subject.wi_lines));
  const lines = t.lines.filter(l => managed.has(l.id));
  const tot = computeTicketTotals({ lines, deposits: [], paidCents: 0 }, cfg);

  const save = async (r: WeighResult) => {
    setErr('');
    const wantsRush = r.addonKeys.includes('rush');
    const receivedAt = t.createdAt || Date.now();
    if (wantsRush) { const el = rushEligible(Date.now(), settings.turnaround, settings.hours, settings.tzOffsetMin); if (!el.ok) { setErr(`${el.reason} Remove the Rush add-on to continue.`); return; } }
    await run(async () => {
      let cur: Ticket = t;
      for (const id of managed) if (cur.lines.some(l => l.id === id)) cur = await api.line(cur.id, { op: 'remove', lineId: id });
      const ids: string[] = [];
      for (const l of r.quote.lines) {
        const before = cur.lines.length;
        cur = await api.line(cur.id, { op: 'add', line: { kind: l.kind, description: l.description, qty: l.qty, ...(l.unit ? { unit: l.unit } : {}), unitPriceCents: l.unitPriceCents, taxClass: account?.taxExempt ? 'EXEMPT' : (l.taxClass || settings.serviceTaxClass) } });
        if (cur.lines.length > before) ids.push(cur.lines[cur.lines.length - 1].id);
      }
      const bulky = Object.values(r.pieces).some(v => v > 0) || hasBulkyLines(cur);
      const due = computeDueAt({ receivedAt: Math.max(receivedAt, Date.now() - 5 * 60_000), rush: wantsRush || t.subject.rush === 'Rush', bulky, rules: settings.turnaround, hours: settings.hours, tzOffsetMin: settings.tzOffsetMin });
      const oldTags = arr(t.subject.tags);
      const tags = oldTags.length === r.bags ? oldTags : makeTagCodes(t.number, r.bags);
      return api.update(cur.id, { subject: { weight_lb: r.quote.netLb, bags: r.bags, rush: due.rushApplied ? 'Rush' : 'Standard', tags, due_at: new Date(due.dueAt).toISOString(), wi_lines: ids } });
    }, nt => { apply(nt); setOpen(false); });
  };

  const price = account?.pricePerLbCents;
  return (
    <Section title="Weigh-in" right={!closed ? <button disabled={busy} onClick={() => { setErr(''); setOpen(true); }} className={pill}>{lines.length ? 'Re-weigh' : 'Weigh in'}</button> : undefined}>
      {lines.length === 0 && <div className="text-xs text-white/40">No weigh-in yet. Weigh the bags to price this ticket by the pound (tiers, minimums, rush and bulky items are applied for you).</div>}
      {lines.length > 0 && <div className="text-sm space-y-0.5">
        <div className="text-white/70">{String(t.subject.weight_lb ?? '')} lb · {String(t.subject.bags ?? '?')} bag(s){t.subject.rush === 'Rush' ? ' · RUSH' : ''}{t.subject.due_at ? ` · ready by ${new Date(String(t.subject.due_at)).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</div>
        <div className="text-[11px] text-white/40">Weigh-in lines total {money(tot.estimate.subtotalCents)} before tax.</div>
      </div>}
      <Err text={err} />
      {open && <Suspense fallback={null}><WeighLineSheet title={`Weigh in ${t.number}`} pricing={settings.pricing} addons={settings.addons} pieces={settings.pieces}
        tarePerBagLb={settings.tarePerBagLb} tareLb={settings.tareLb} initial={{ grossLb: Number(t.subject.weight_lb) || undefined, bags: Number(t.subject.bags) || 1, addonKeys: t.subject.rush === 'Rush' ? ['rush'] : [] }}
        priceOverrideCentsPerLb={price} priceOverrideNote={account ? `${account.name}: ${price !== undefined ? `negotiated ${money(price)}/lb, no minimum.` : 'standard pricing.'}${account.taxExempt ? ' Tax exempt.' : ''}` : undefined}
        busy={busy} error={err} onCancel={() => setOpen(false)} onConfirm={save} /></Suspense>}
    </Section>
  );
}
