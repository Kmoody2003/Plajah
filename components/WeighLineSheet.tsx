// WeighLineSheet - GENERIC weigh-in sheet: weight (typed, or from a USB-serial / Bluetooth scale), tare, bag count,
// price tiers + minimums, add-ons and by-the-piece items, with the live quote that will become ticket lines.
// Used by the laundry weigh-in today. The grocery produce case can reuse it (single band, no add-ons) but the
// REGISTER (PosRegister) does not sell weighed products yet, so WEIGHED_ITEMS is "partial: tickets only".
// Manual entry is always available; the scale is a convenience, never required. Pricing is pure (services/weighedCore).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { quoteWeighIn, createStabilizer, type WeighPricing, type WeighAddon, type PieceItem, type WeighQuote, type ScaleReading } from '../services/weighedCore';
import { connectSerialScale, connectBleScale, isSerialSupported, isBluetoothSupported, type ScaleConnection } from '../services/scaleClient';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (c: number) => `$${(Math.max(0, c) / 100).toFixed(2)}`;
const inp = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-base outline-none focus:border-white/30 w-full text-white';
const lbl = 'text-[10px] font-black uppercase tracking-widest text-white/40';

export interface WeighResult { quote: WeighQuote; grossLb: number; bags: number; addonKeys: string[]; pieces: Record<string, number> }
interface Props {
  title?: string; pricing: WeighPricing; addons?: WeighAddon[]; pieces?: PieceItem[];
  tarePerBagLb?: number; tareLb?: number; showBags?: boolean;
  initial?: { grossLb?: number; bags?: number; addonKeys?: string[]; pieces?: Record<string, number> };
  /** Account price override: replaces every band with one flat price (cents per lb). */
  priceOverrideCentsPerLb?: number; priceOverrideNote?: string;
  confirmLabel?: string; busy?: boolean; error?: string;
  onConfirm: (r: WeighResult) => void; onCancel: () => void;
}

export default function WeighLineSheet({ title = 'Weigh in', pricing, addons = [], pieces = [], tarePerBagLb = 0, tareLb = 0, showBags = true, initial, priceOverrideCentsPerLb, priceOverrideNote, confirmLabel = 'Save weigh-in', busy, error, onConfirm, onCancel }: Props) {
  const [gross, setGross] = useState(initial?.grossLb ? String(initial.grossLb) : '');
  const [tare, setTare] = useState(tareLb ? String(tareLb) : '');
  const [bags, setBags] = useState(String(initial?.bags ?? 1));
  const [sel, setSel] = useState<string[]>(initial?.addonKeys || []);
  const [pc, setPc] = useState<Record<string, number>>(initial?.pieces || {});
  const [scale, setScale] = useState<{ conn: ScaleConnection | null; live: ScaleReading | null; stable: boolean; err: string }>({ conn: null, live: null, stable: false, err: '' });
  const stab = useRef(createStabilizer({ needed: 3, tolLb: 0.05 }));
  const connRef = useRef<ScaleConnection | null>(null);

  useEffect(() => () => { connRef.current?.close().catch(() => {}); }, []);
  const onReading = (r: ScaleReading) => {
    const s = stab.current.push(r);
    setScale(p => ({ ...p, live: r, stable: s.stable }));
    if (s.stable && s.weightLb !== null) setGross(String(Math.round(s.weightLb * 10) / 10));
  };
  const connect = async (kind: 'serial' | 'ble') => {
    try {
      setScale(p => ({ ...p, err: '' }));
      const c = await (kind === 'serial' ? connectSerialScale : connectBleScale)(onReading, e => setScale(p => ({ ...p, err: e, conn: null })));
      connRef.current = c; setScale(p => ({ ...p, conn: c }));
    } catch (e: any) { setScale(p => ({ ...p, err: e?.name === 'NotFoundError' ? 'No scale was chosen.' : e?.message || 'Could not connect. Type the weight instead.' })); }
  };
  const disconnect = async () => { await connRef.current?.close(); connRef.current = null; setScale({ conn: null, live: null, stable: false, err: '' }); stab.current.reset(); };

  const effective: WeighPricing = useMemo(() => (priceOverrideCentsPerLb !== undefined ? { ...pricing, bands: [{ centsPerLb: priceOverrideCentsPerLb }], minimumChargeCents: 0, minimumLb: 0 } : pricing), [pricing, priceOverrideCentsPerLb]);
  const g = parseFloat(gross) || 0;
  const quote = useMemo(() => quoteWeighIn({
    grossLb: g, tareLb: parseFloat(tare) || 0, bags: parseInt(bags) || 0, tarePerBagLb, pricing: effective,
    addons: addons.filter(a => sel.includes(a.key)).map(def => ({ def })),
    pieces: pieces.filter(p => (pc[p.key] || 0) > 0).map(def => ({ def, qty: pc[def.key] })),
  }), [g, tare, bags, tarePerBagLb, effective, addons, pieces, sel, pc]);

  return createPortal(
    <div className="fixed inset-0 z-[170] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full sm:max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#12121a]/95 backdrop-blur-xl border border-white/10 text-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-black italic uppercase" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</div>
          <button onClick={onCancel} className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20">Cancel</button>
        </div>
        {error && <div role="alert" className="rounded-xl border border-[#D40055]/50 bg-[#D40055]/10 p-3 text-sm font-bold text-[#ff7aa8]">{error}</div>}
        {priceOverrideNote && <div className="rounded-xl border border-[#00B4D8]/40 bg-[#00B4D8]/10 p-2.5 text-xs font-bold text-[#7fe3f5]">{priceOverrideNote}</div>}

        <div className="grid grid-cols-3 gap-2 items-end">
          <label className="col-span-2 space-y-1"><span className={lbl}>Weight (lb)</span>
            <input autoFocus value={gross} onChange={e => setGross(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.0" aria-label="Weight in pounds" className={inp + ' !text-3xl !font-black'} /></label>
          {showBags && <label className="space-y-1"><span className={lbl}>Bags</span><input value={bags} onChange={e => setBags(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" aria-label="Bags" className={inp} /></label>}
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={lbl}>Scale</span>
            {scale.conn
              ? <button onClick={disconnect} className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-white/10">Disconnect {scale.conn.label}</button>
              : <div className="flex gap-1.5">
                  {isSerialSupported() && <button onClick={() => connect('serial')} className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-white/10 hover:bg-white/20">USB / serial</button>}
                  {isBluetoothSupported() && <button onClick={() => connect('ble')} className="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-white/10 hover:bg-white/20">Bluetooth</button>}
                  {!isSerialSupported() && !isBluetoothSupported() && <span className="text-[11px] text-white/40">This browser cannot talk to scales (use Chrome or Edge). Type the weight.</span>}
                </div>}
          </div>
          {scale.conn && <div className="text-sm font-bold">{scale.live ? <>{scale.live.weightLb.toFixed(2)} lb <span className={scale.stable ? 'text-emerald-300' : 'text-amber-300'}>{scale.stable ? 'steady, filled in' : 'settling...'}</span></> : 'Waiting for the scale...'}</div>}
          {scale.err && <div className="text-xs text-[#ff7aa8]">{scale.err}</div>}
          <div className="text-[10px] text-white/35">Use an NTEP-approved scale for per-pound pricing. Typing the weight always works.</div>
          <label className="flex items-center gap-2 text-xs text-white/60">Extra tare (lb) <input value={tare} onChange={e => setTare(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inp + ' !w-24 !py-1.5'} aria-label="Tare in pounds" /></label>
        </div>

        {!!addons.length && <div className="space-y-1.5"><div className={lbl}>Add-ons</div>
          <div className="flex flex-wrap gap-1.5">{addons.map(a => {
            const on = sel.includes(a.key);
            return <button key={a.key} onClick={() => setSel(on ? sel.filter(k => k !== a.key) : [...sel, a.key])} aria-pressed={on} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${on ? 'text-white' : 'bg-white/10 text-white/70'}`} style={on ? { background: GRAD } : undefined}>
              {a.label} {a.mode === 'PER_LB' ? `+${money(a.cents || 0)}/lb` : a.mode === 'PCT' ? `+${a.pct}%` : `+${money(a.cents || 0)}`}</button>;
          })}</div></div>}

        {!!pieces.length && <div className="space-y-1.5"><div className={lbl}>Bulky items (by the piece)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">{pieces.map(p => (
            <div key={p.key} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5 text-sm"><span>{p.label} <span className="text-white/40">{money(p.cents)}</span></span>
              <span className="flex items-center gap-2"><button aria-label={`Fewer ${p.label}`} onClick={() => setPc({ ...pc, [p.key]: Math.max(0, (pc[p.key] || 0) - 1) })} className="w-7 h-7 rounded-full bg-white/10 font-black">-</button><b className="w-5 text-center">{pc[p.key] || 0}</b><button aria-label={`More ${p.label}`} onClick={() => setPc({ ...pc, [p.key]: (pc[p.key] || 0) + 1 })} className="w-7 h-7 rounded-full bg-white/10 font-black">+</button></span></div>))}</div></div>}

        <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3 space-y-1" aria-live="polite">
          <div className={lbl}>This is what the ticket will charge</div>
          {quote.ok ? <>
            <div className="text-[11px] text-white/45">Net {quote.netLb} lb{quote.tareLb ? ` (after ${quote.tareLb} lb tare)` : ''}{quote.minimumLbApplied ? `, billed as ${quote.billableLb} lb minimum` : ''}</div>
            {quote.lines.map((l, i) => <div key={i} className="flex justify-between text-sm"><span>{l.description}{l.kind === 'BY_WEIGHT' ? <span className="text-white/40"> {l.qty} lb x {money(l.unitPriceCents)}</span> : l.qty !== 1 ? <span className="text-white/40"> x{l.qty}</span> : null}</span><b>{money(l.grossCents)}</b></div>)}
            <div className="flex justify-between text-xl font-black pt-1 border-t border-white/10"><span>Before tax</span><span>{money(quote.subtotalCents)}</span></div>
          </> : <div className="text-sm text-white/45">{g > 0 || Object.values(pc).some(v => v > 0) ? quote.errors[0] : 'Enter the weight to see the price.'}</div>}
        </div>

        <button disabled={busy || !quote.ok} onClick={() => onConfirm({ quote, grossLb: g, bags: parseInt(bags) || 0, addonKeys: sel, pieces: pc })} className="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ background: GRAD }}>{busy ? 'Saving...' : confirmLabel}</button>
      </div>
    </div>,
    document.body,
  );
}
