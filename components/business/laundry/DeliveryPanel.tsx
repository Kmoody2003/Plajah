// DeliveryPanel - pickup & delivery (light v1): service type, address, time windows, driver, and the delivery fee line.
// No maps and no route optimisation: the day's stops are listed sorted by window on the Laundry desk (Route tab).
import React, { useEffect, useState } from 'react';
import { SERVICES, deliveryFeeCents, type Service } from '../../../services/laundryCore';
import { computeTicketTotals } from '../../../services/ticketCore';
import { Section, useLaundry, useRun, Err, inp, lbl, money, pill, type PanelProps } from './shared';

const F = ['svc', 'addr', 'addr_note', 'pu_date', 'pu_start', 'pu_end', 'dl_date', 'dl_start', 'dl_end'] as const;
const FEE_DESC = 'Pickup & delivery fee';

export default function DeliveryPanel({ api, cfg, ticket: t, apply, closed }: PanelProps) {
  const { settings } = useLaundry(api);
  const { busy, err, run } = useRun();
  const init = () => Object.fromEntries(F.map(k => [k, String(t.subject[k] ?? '')])) as Record<typeof F[number], string>;
  const [f, setF] = useState(init); const [driver, setDriver] = useState(t.assignedTo?.name || '');
  useEffect(() => { setF(init()); setDriver(t.assignedTo?.name || ''); /* eslint-disable-next-line */ }, [t.id, t.updatedAt]);
  const svc = (f.svc || 'In-store') as Service;
  const set = (k: typeof F[number], v: string) => setF(p => ({ ...p, [k]: v }));
  const lineSum = computeTicketTotals({ lines: t.lines.filter(l => l.description !== FEE_DESC), deposits: [], paidCents: 0 }, cfg).estimate.subtotalCents;
  const fee = deliveryFeeCents(svc, lineSum, settings.delivery);
  const hasFee = t.lines.find(l => l.description === FEE_DESC);
  const wantsPu = svc === 'Pickup' || svc === 'Pickup & delivery', wantsDl = svc === 'Delivery' || svc === 'Pickup & delivery';

  const save = () => run(async () => {
    const subject: Record<string, string> = {}; for (const k of F) subject[k] = f[k];
    let nt = await api.update(t.id, { subject, assignedTo: driver.trim() ? { id: `drv_${driver.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}`, name: driver.trim() } : null });
    if (svc === 'In-store' && hasFee) nt = await api.line(t.id, { op: 'remove', lineId: hasFee.id });
    return nt;
  }, apply);
  const addFee = () => run(async () => {
    let nt = t; if (hasFee) nt = await api.line(t.id, { op: 'remove', lineId: hasFee.id });
    if (fee > 0) nt = await api.line(t.id, { op: 'add', line: { kind: 'FEE', description: FEE_DESC, qty: 1, unitPriceCents: fee, taxClass: settings.serviceTaxClass } });
    return nt;
  }, apply);

  return (
    <Section title="Pickup & delivery" right={hasFee ? <span className="text-[10px] font-black uppercase text-emerald-300">fee {money(hasFee.unitPriceCents)} on ticket</span> : undefined}>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1"><span className={lbl}>Service</span>
          <select value={f.svc || 'In-store'} disabled={closed} onChange={e => set('svc', e.target.value)} className={inp} aria-label="Service type">{SERVICES.map(s => <option key={s}>{s}</option>)}</select></label>
        {svc !== 'In-store' && <>
          <input value={f.addr} disabled={closed} onChange={e => set('addr', e.target.value)} placeholder="Address" aria-label="Address" className={inp + ' col-span-2'} />
          <input value={f.addr_note} disabled={closed} onChange={e => set('addr_note', e.target.value)} placeholder="Gate code, leave with doorman..." aria-label="Address note" className={inp + ' col-span-2'} />
          {wantsPu && <><div className={lbl + ' col-span-2'}>Pickup window</div>
            <input type="date" value={f.pu_date} disabled={closed} onChange={e => set('pu_date', e.target.value)} aria-label="Pickup date" className={inp + ' col-span-2'} />
            <input type="time" value={f.pu_start} disabled={closed} onChange={e => set('pu_start', e.target.value)} aria-label="Pickup from" className={inp} /><input type="time" value={f.pu_end} disabled={closed} onChange={e => set('pu_end', e.target.value)} aria-label="Pickup until" className={inp} /></>}
          {wantsDl && <><div className={lbl + ' col-span-2'}>Delivery window</div>
            <input type="date" value={f.dl_date} disabled={closed} onChange={e => set('dl_date', e.target.value)} aria-label="Delivery date" className={inp + ' col-span-2'} />
            <input type="time" value={f.dl_start} disabled={closed} onChange={e => set('dl_start', e.target.value)} aria-label="Delivery from" className={inp} /><input type="time" value={f.dl_end} disabled={closed} onChange={e => set('dl_end', e.target.value)} aria-label="Delivery until" className={inp} /></>}
          <input value={driver} disabled={closed} onChange={e => setDriver(e.target.value)} placeholder="Driver (name)" aria-label="Driver" className={inp + ' col-span-2'} />
        </>}
      </div>
      <Err text={err} />
      {!closed && <div className="flex gap-2 flex-wrap">
        <button disabled={busy} onClick={save} className={pill}>Save</button>
        {svc !== 'In-store' && <button disabled={busy} onClick={addFee} className={pill}>{fee > 0 ? `${hasFee ? 'Update' : 'Add'} fee ${money(fee)}` : hasFee ? 'Remove fee (free over threshold)' : 'No fee (free over threshold)'}</button>}
      </div>}
    </Section>
  );
}
