// SettingsTab - the owner-editable laundromat numbers: per-lb tiers, minimum, add-ons, turnaround, unclaimed rules,
// delivery fee, wallet top-up bonus, tax class. Saved server-side (laundrySettings/{businessUid}); money rules stay on the server.
import React, { useEffect, useState } from 'react';
import { cleanLaundrySettings, type LaundrySettings } from '../../../services/laundryDefaults';
import { computeTopUpBonus } from '../../../services/walletPromoCore';
import { validatePricing } from '../../../services/weighedCore';
import { useLaundry, useRun, Err, Ok, inp, lbl, money, toCents, pill, type ToolProps } from './shared';

const L = ({ t, children }: { t: string; children: React.ReactNode }) => <label className="text-xs text-white/50 space-y-1 block">{t}{children}</label>;

export default function SettingsTab({ api }: ToolProps) {
  const { laundry, settings: loaded } = useLaundry(api);
  const { busy, err, msg, setMsg, run } = useRun();
  const [s, setS] = useState<LaundrySettings>(loaded);
  useEffect(() => setS(loaded), [loaded]);
  if (!laundry) return null;
  const b0 = s.pricing.bands[0], b1 = s.pricing.bands[1];
  const setBands = (a: number, upTo: number | undefined, over: number | undefined) => setS({ ...s, pricing: { ...s.pricing, bands: [{ ...(upTo ? { upToLb: upTo } : {}), centsPerLb: a }, ...(upTo && over !== undefined ? [{ centsPerLb: over }] : [])] } });
  const bad = validatePricing(s.pricing)[0];
  const promoTier = s.promo.tiers[0] || { minLoadCents: 5000, bonusCents: 500 };
  const setTier = (patch: Partial<typeof promoTier>) => setS({ ...s, promo: { ...s.promo, tiers: [{ ...promoTier, ...patch }, ...s.promo.tiers.slice(1)] } });
  return (
    <div className="space-y-3">
      <Err text={err || bad || ''} /><Ok text={msg} />
      <div className={lbl}>Wash & fold pricing</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <L t="Price per lb ($)"><input value={(b0.centsPerLb / 100).toString()} onChange={e => setBands(toCents(e.target.value), b0.upToLb, b1?.centsPerLb)} inputMode="decimal" className={inp} /></L>
        <L t="Discount tier after (lb)"><input value={b0.upToLb ?? ''} placeholder="none" onChange={e => { const v = parseFloat(e.target.value); setBands(b0.centsPerLb, v > 0 ? v : undefined, b1?.centsPerLb ?? b0.centsPerLb); }} inputMode="decimal" className={inp} /></L>
        <L t="Price after that ($/lb)"><input disabled={!b0.upToLb} value={b1 ? (b1.centsPerLb / 100).toString() : ''} onChange={e => setBands(b0.centsPerLb, b0.upToLb, toCents(e.target.value))} inputMode="decimal" className={inp} /></L>
        <L t="Minimum order ($)"><input value={((s.pricing.minimumChargeCents || 0) / 100).toString()} onChange={e => setS({ ...s, pricing: { ...s.pricing, minimumChargeCents: toCents(e.target.value) } })} inputMode="decimal" className={inp} /></L>
        <L t="Bill at least (lb)"><input value={s.pricing.minimumLb || ''} placeholder="0" onChange={e => setS({ ...s, pricing: { ...s.pricing, minimumLb: parseFloat(e.target.value) || 0 } })} inputMode="decimal" className={inp} /></L>
        <L t="Rush add-on ($/lb)"><input value={((s.addons.find(a => a.key === 'rush')?.cents || 0) / 100).toString()} onChange={e => setS({ ...s, addons: s.addons.map(a => (a.key === 'rush' ? { ...a, cents: toCents(e.target.value) } : a)) })} inputMode="decimal" className={inp} /></L>
        <L t="Service tax class"><select value={s.serviceTaxClass} onChange={e => setS({ ...s, serviceTaxClass: e.target.value, pricing: { ...s.pricing, taxClass: e.target.value } })} className={inp}><option value="SERVICE">Service</option><option value="STANDARD">Standard sales tax</option><option value="EXEMPT">Exempt</option></select></L>
        <L t="Delivery fee ($)"><input value={(s.delivery.flatFeeCents / 100).toString()} onChange={e => setS({ ...s, delivery: { ...s.delivery, flatFeeCents: toCents(e.target.value) } })} inputMode="decimal" className={inp} /></L>
      </div>
      <div className="text-[11px] text-white/40">Whether laundry service is taxable depends on your state. Pick the class your accountant uses; the register applies the rate you set in Register settings.</div>
      <div className={lbl}>Turnaround & reminders</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <L t="Standard (open hours)"><input value={s.turnaround.standardHours} onChange={e => setS({ ...s, turnaround: { ...s.turnaround, standardHours: parseFloat(e.target.value) || 1 } })} inputMode="decimal" className={inp} /></L>
        <L t="Rush (open hours)"><input value={s.turnaround.rushHours} onChange={e => setS({ ...s, turnaround: { ...s.turnaround, rushHours: parseFloat(e.target.value) || 1 } })} inputMode="decimal" className={inp} /></L>
        <L t="Rush drop-off cutoff"><input type="time" value={s.turnaround.rushCutoff || '10:00'} onChange={e => setS({ ...s, turnaround: { ...s.turnaround, rushCutoff: e.target.value } })} className={inp} /></L>
        <L t="Disposal after (days)"><input value={s.unclaimed.disposalDays} onChange={e => setS({ ...s, unclaimed: { ...s.unclaimed, disposalDays: parseInt(e.target.value) || 30 } })} inputMode="numeric" className={inp} /></L>
        <L t="Timezone offset (min east of UTC)"><input value={s.tzOffsetMin} onChange={e => setS({ ...s, tzOffsetMin: parseInt(e.target.value) || 0 })} inputMode="numeric" className={inp} /></L>
      </div>
      <div className={lbl}>Wallet top-up bonus</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.promo.enabled} onChange={e => setS({ ...s, promo: { ...s.promo, enabled: e.target.checked } })} /> Give a bonus when customers load their wallet</label>
      {s.promo.enabled && <div className="grid grid-cols-2 gap-2">
        <L t="Load at least ($)"><input value={promoTier.minLoadCents / 100} onChange={e => setTier({ minLoadCents: toCents(e.target.value) })} inputMode="decimal" className={inp} /></L>
        <L t="Bonus ($)"><input value={(promoTier.bonusCents ?? 0) / 100} onChange={e => setTier({ bonusCents: toCents(e.target.value), bonusPct: undefined })} inputMode="decimal" className={inp} /></L>
        <div className="col-span-2 text-xs text-white/50">Customers who load {money(promoTier.minLoadCents)} get {money(computeTopUpBonus(s.promo, promoTier.minLoadCents).bonusCents)} extra. The bonus is promo cost, credited once per top-up, never repeated if a reload is retried.</div>
      </div>}
      <button disabled={busy || !!bad} onClick={() => run(() => laundry.saveSettings(cleanLaundrySettings(s)), r => { setS(r); setMsg('Saved.'); })} className="px-5 py-2.5 rounded-lg text-xs font-black uppercase text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>Save settings</button>
      <div className="text-[11px] text-white/40">Self-service machines (status and payment) are a later phase and are not controlled from here.</div>
    </div>
  );
}
void pill;
