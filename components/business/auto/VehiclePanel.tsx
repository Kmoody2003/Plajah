// VehiclePanel - ticket-detail plug-in: the vehicle on this repair order. Links/creates the shop's vehicle record
// (VIN, or plate+state), shows odometer history + rollback flags, open recalls (one-tap $0 "inform" line) and
// what service is coming due for THIS vehicle (shop-default intervals, projected from its own mileage history).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateVin, vehicleKey, hasRollbackFlag, describeVehicle, type Vehicle, type RecallInfo } from '../../../services/vehicleCore';
import { recallInspectionLine } from '../../../services/nhtsaCore';
import { predictNextService, resolveIntervals, INTERVALS_DISCLAIMER } from '../../../services/serviceReminderCore';
import { autoApiFor } from './autoApi';
import RecallBanner from './RecallBanner';
import type { DetailPanelProps } from '../tickets/panelRegistry';

const lbl = 'text-[10px] font-black uppercase tracking-widest text-white/40';
const inp = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-white/30 w-full text-white';
const STATUS_COLOR: Record<string, string> = { OVERDUE: '#D40055', DUE_SOON: '#FF8C00', OK: '#06D6A0', UNKNOWN: '#ffffff55' };
const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function VehiclePanel({ api, cfg, ticket, closed, onChanged }: DetailPanelProps) {
  const auto = useMemo(() => autoApiFor(api), [api]);
  const s = ticket.subject as Record<string, any>;
  const key = vehicleKey({ vin: String(s.vin || ''), plate: String(s.plate || ''), state: String(s.state || '') });
  const [veh, setVeh] = useState<Vehicle | null>(null);
  const [recalls, setRecalls] = useState<{ list: RecallInfo[]; stale?: boolean; note?: string } | null>(null);
  const [recallErr, setRecallErr] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [info, setInfo] = useState('');
  const [odo, setOdo] = useState(''); const [needOverride, setNeedOverride] = useState(false); const [pin, setPin] = useState('');
  const linked = useRef(false);

  const save = useCallback(async (extra: { odometer?: number; override?: boolean; pin?: string } = {}) => {
    if (!auto || !key) return;
    setBusy(true); setErr('');
    try {
      const r = await auto.saveVehicle({
        vehicle: { vin: s.vin, plate: s.plate, state: s.state, year: s.year, make: s.make, model: s.model, trim: s.trim, engine: s.engine, ownerCustomerName: ticket.customer.name, ownerUid: ticket.customer.uid, ownerPhone: ticket.customer.phone, ownerEmail: ticket.customer.email, decodeSource: s.vin ? 'NHTSA' : 'MANUAL' },
        odometer: extra.odometer, odometerOverride: extra.override, managerPin: extra.pin, ticketId: ticket.id,
      });
      setVeh(r.vehicle); setNeedOverride(false); setOdo(''); setInfo((r.warnings || []).join(' '));
      if (!s.vehicleId || s.vehicleId !== r.vehicle.id) { const nt = await api.update(ticket.id, { subject: { vehicleId: r.vehicle.id } }); onChanged(nt); }
    } catch (e: any) {
      if (e?.code === 'ODOMETER_LOWER') { setNeedOverride(true); setErr(e.message); }
      else if (e?.code === 'MANAGER_PIN') { setNeedOverride(true); setErr(e.message); }
      else setErr(e?.message || 'Could not save the vehicle.');
    } finally { setBusy(false); }
  }, [auto, key, s, ticket, api, onChanged]);

  // Link/refresh the vehicle record once per open ticket, recording the odometer-in as a reading.
  useEffect(() => {
    if (!auto || !key || linked.current || closed) return; linked.current = true;
    const od = Number(s.mileage_in);
    save(od > 0 ? { odometer: od } : {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, key]);
  useEffect(() => {
    if (!auto || !key || veh || !closed) return;
    auto.listVehicles(String(s.vin || s.plate || '')).then(l => setVeh(l[0] || null)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, key, closed]);
  useEffect(() => {
    if (!auto || !s.make || !s.model || !s.year) return;
    auto.recalls({ make: String(s.make), model: String(s.model), year: Number(s.year), vehicleId: veh?.id }).then(r => {
      if (r.ok) { setRecalls({ list: r.recalls || [], stale: r.stale, note: r.error }); setRecallErr(''); } else setRecallErr(r.error || 'Recall check unavailable.');
    }).catch(() => setRecallErr("Couldn't reach NHTSA for recalls."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, s.make, s.model, s.year, veh?.id]);

  const addRecallLine = async (r: RecallInfo) => {
    setBusy(true); setErr('');
    try {
      const l = recallInspectionLine(r);
      const t1 = await api.line(ticket.id, { op: 'add', line: l });
      const id = t1.lines[t1.lines.length - 1]?.id;
      // Informational $0 line: record it as acknowledged so it does not block the estimate.
      const t2 = id && cfg.requireApproval ? await api.line(ticket.id, { op: 'decide', decisions: { [id]: 'APPROVED' }, consentNote: 'Informational recall notice (no charge)' }) : t1;
      onChanged(t2); setAdded(a => new Set(a).add(r.campaign));
    } catch (e: any) { setErr(e?.message || 'Could not add the line.'); } finally { setBusy(false); }
  };

  const preds = useMemo(() => (veh ? predictNextService({ mileage: veh.mileage, services: veh.services, intervals: resolveIntervals((cfg.panelConfig as any)?.reminders?.intervals, veh.intervalOverrides) }) : []), [veh, cfg]);
  const pending = preds.filter(p => p.status === 'OVERDUE' || p.status === 'DUE_SOON');
  const check = s.vin ? validateVin(String(s.vin)) : null;
  if (!auto) return null;

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-3" data-testid="vehicle-panel">
      <div className="flex items-center justify-between gap-2">
        <div className={lbl}>Vehicle</div>
        {veh && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300">record linked</span>}
      </div>
      <div className="text-sm font-bold">{describeVehicle(s as any)}{s.engine ? <span className="text-white/50 font-normal"> · {String(s.engine)}</span> : null}</div>
      <div className="text-xs text-white/50 flex flex-wrap gap-x-4 gap-y-1">
        {s.vin ? <span className="font-mono">VIN {String(s.vin)}</span> : <span className="text-amber-300">No VIN yet. Scan or type it on the ticket for decode and recalls.</span>}
        {check?.valid && check.checkDigitOk === false && <span className="text-amber-300">check digit does not match</span>}
        {s.plate ? <span>Plate {String(s.plate)}{s.state ? ` (${String(s.state)})` : ''}</span> : null}
        {!key && <span className="text-amber-300">Add a VIN, or plate and state, to keep a vehicle record.</span>}
      </div>
      {err && <div role="alert" className="text-xs font-bold text-[#ff7aa8]">{err}</div>}
      {info && <div className="text-xs text-amber-300">{info}</div>}

      {recalls && <RecallBanner recalls={recalls.list} stale={recalls.stale} note={recalls.note} onAddLine={closed ? undefined : addRecallLine} busy={busy} added={added} />}
      {recallErr && !recalls && <div className="text-xs text-amber-300">{recallErr} Check nhtsa.gov/recalls by VIN.</div>}

      {veh && (
        <div className="space-y-1.5">
          <div className={lbl}>Odometer history</div>
          {hasRollbackFlag(veh.mileage) && <div className="text-xs font-bold text-[#ff7aa8]">Possible odometer rollback or replaced cluster recorded.</div>}
          <div className="text-xs text-white/60 flex flex-wrap gap-x-3 gap-y-0.5">{[...veh.mileage].reverse().slice(0, 6).map((m, i) => <span key={i} className={m.rollback ? 'text-[#ff7aa8]' : ''}>{m.odometer.toLocaleString()} mi · {fmtDate(m.at)}</span>)}{!veh.mileage.length && <span>No readings yet.</span>}</div>
          {!closed && (
            <div className="flex gap-2 items-center">
              <input value={odo} onChange={e => setOdo(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="New odometer reading" aria-label="Odometer reading" className={inp} />
              {needOverride && <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" placeholder="Manager PIN" aria-label="Manager PIN" className={inp + ' !w-28'} />}
              <button disabled={busy || !odo} onClick={() => save({ odometer: Number(odo), override: needOverride, pin })} className="shrink-0 min-h-[40px] px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase disabled:opacity-40">{needOverride ? 'Override' : 'Record'}</button>
            </div>
          )}
        </div>
      )}

      {veh && pending.length > 0 && (
        <div className="space-y-1.5">
          <div className={lbl}>Service coming due</div>
          {pending.map(p => (
            <div key={p.key} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[p.status] }} />
              <span className="font-bold">{p.label}</span><span className="text-white/50">{p.status === 'OVERDUE' ? 'overdue' : 'due soon'}{p.estimatedDueDate ? ` · ~${fmtDate(p.estimatedDueDate)}` : ''}</span>
            </div>
          ))}
          <div className="text-[10px] text-white/40">{INTERVALS_DISCLAIMER}</div>
        </div>
      )}
    </section>
  );
}
