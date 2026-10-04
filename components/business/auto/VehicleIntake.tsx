// VehicleIntake - intake plug-in for auto repair: type or scan the VIN, decode it through the SERVER (NHTSA vPIC,
// cached), autofill year/make/model/trim/engine, and warn about open recalls. NHTSA never gets called from the
// browser. If NHTSA is slow/down the shop just types the vehicle in; nothing here is a gate.
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { validateVin, normalizeVin } from '../../../services/vehicleCore';
import { autoApiFor } from './autoApi';
import RecallBanner from './RecallBanner';
import type { IntakePanelProps } from '../tickets/panelRegistry';
import type { RecallInfo } from '../../../services/vehicleCore';

const BarcodeScanner = lazy(() => import('../../inventory/BarcodeScanner'));
const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-white/30 w-full text-white';

export default function VehicleIntake({ api, subject, onSubject }: IntakePanelProps) {
  const auto = autoApiFor(api);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [recalls, setRecalls] = useState<{ list: RecallInfo[]; stale?: boolean; note?: string } | null>(null);
  const lastDecoded = useRef('');
  const vin = String(subject.vin || '');
  const check = vin.length >= 11 ? validateVin(vin) : null;

  const decode = async (raw: string) => {
    const c = validateVin(raw);
    if (!auto) return;
    if (!c.valid) { setMsg({ tone: 'warn', text: c.errors[0] }); return; }
    setBusy(true); setMsg(null); setRecalls(null);
    try {
      const r = await auto.decodeVin(c.vin);
      lastDecoded.current = c.vin;
      if (r.ok && r.vehicle) {
        const v = r.vehicle;
        onSubject({ vin: c.vin, ...(v.year ? { year: v.year } : {}), ...(v.make ? { make: v.make } : {}), ...(v.model ? { model: v.model } : {}), ...(v.trim ? { trim: v.trim } : {}), ...(v.engine ? { engine: v.engine } : {}) });
        setMsg({ tone: (r.warnings || []).length ? 'warn' : 'ok', text: `Filled from NHTSA${r.cached ? ' (saved earlier)' : ''}.${(r.warnings || []).length ? ' ' + (r.warnings || []).join(' ') : ''}` });
        if (v.year && v.make && v.model) {
          auto.recalls({ make: v.make, model: v.model, year: v.year }).then(rr => {
            if (rr.ok) setRecalls({ list: rr.recalls || [], stale: rr.stale, note: rr.error });
            else setMsg(m => ({ tone: 'warn', text: `${m?.text || ''} Recall check unavailable: ${rr.error || 'try again later'}` }));
          }).catch(() => {});
        }
      } else {
        onSubject({ vin: c.vin });
        setMsg({ tone: 'warn', text: r.error || "Couldn't reach NHTSA. Enter the vehicle details manually." });
      }
    } catch (e: any) {
      onSubject({ vin: c.vin });
      setMsg({ tone: 'warn', text: "Couldn't reach NHTSA. Enter the vehicle details manually." });
    } finally { setBusy(false); }
  };

  // Decode automatically once a complete, valid VIN is typed or scanned (once per VIN).
  useEffect(() => { if (auto && vin.length === 17 && validateVin(vin).valid && lastDecoded.current !== normalizeVin(vin)) decode(vin); /* eslint-disable-next-line */ }, [vin]);

  if (!auto) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="vehicle-intake">
      <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Scan or type the VIN</div>
      <div className="flex gap-2">
        <input className={inp + ' font-mono tracking-wider uppercase'} aria-label="VIN" placeholder="17-character VIN" value={vin} maxLength={20}
          onChange={e => onSubject({ vin: normalizeVin(e.target.value) })} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button type="button" onClick={() => setScan(true)} className="shrink-0 px-4 min-h-[44px] rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-black uppercase">Scan</button>
        <button type="button" disabled={busy || !check?.valid} onClick={() => decode(vin)} className="shrink-0 px-4 min-h-[44px] rounded-lg text-[11px] font-black uppercase text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>{busy ? 'Looking up...' : 'Decode'}</button>
      </div>
      {check && !check.valid && <div className="text-xs text-amber-300">{check.errors[0]}</div>}
      {check?.valid && check.checkDigitOk === false && !msg && <div className="text-xs text-amber-300">{check.warnings[0]}</div>}
      {busy && <div className="text-xs text-white/50">NHTSA can take a few seconds. You can keep typing the rest of the form.</div>}
      {msg && <div role="status" className={`text-xs font-bold ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</div>}
      {recalls && <RecallBanner recalls={recalls.list} stale={recalls.stale} note={recalls.note} hint="Open the ticket to add a recall line for the customer." />}
      {scan && <Suspense fallback={null}><BarcodeScanner title="Scan the VIN" hint="Windshield or door-jamb barcode (Code 39 / Code 128). If it will not read, type it." onDetect={code => { setScan(false); onSubject({ vin: normalizeVin(code) }); }} onClose={() => setScan(false)} /></Suspense>}
    </div>
  );
}
