// Fabric, waste and cost for every size, from each size's own cutting marker.

import React, { useMemo, useState } from 'react';
import type { FabricRole, ParamValue, Pattern, SoftTemplate } from '../../../services/soft/patterns';
import { costPerSize, costFor, DEFAULT_PRICE } from '../../../services/soft/drape/cost';
import { FABRIC_LABEL, rolesOf } from '../../../services/soft/layout';

export default function CostPanel({ pattern, template, params, unit }: { pattern: Pattern; template: SoftTemplate; params: Record<string, ParamValue>; unit: 'cm' | 'in' }) {
  const roles = rolesOf(pattern); const [prices, setPrices] = useState<Partial<Record<FabricRole, number>>>({});
  const sizes = pattern.grading?.sizes ?? []; const rows = useMemo(() => (sizes.length ? costPerSize({ template, params }, sizes, prices) : [{ ...costFor(pattern, prices), size: pattern.size ?? 'as drafted' }]), [pattern, template, params, JSON.stringify(prices)]); // eslint-disable-line react-hooks/exhaustive-deps
  const len = (m: number) => (unit === 'in' ? `${(m * 39.37 / 36).toFixed(2)} yd` : `${m.toFixed(1)} m`);
  return <div data-testid="drape-cost" className="text-[12px]">
    <div className="sew-h">Price per metre (USD)</div>
    <div className="grid grid-cols-2 gap-1 mb-2">{roles.map(r => <label key={r} className="text-[10.5px]" style={{ color: 'rgba(255,255,255,.55)' }}>{FABRIC_LABEL[r]}<input className="w-full h-7 rounded bg-white/5 border border-white/10 px-1 text-white" type="number" step="0.5" value={prices[r] ?? DEFAULT_PRICE[r]} onChange={e => setPrices(p => ({ ...p, [r]: Number(e.target.value) }))}/></label>)}</div>
    <table className="w-full text-[11px]" data-testid="drape-cost-table"><thead><tr style={{ color: 'rgba(255,255,255,.5)' }}><td>Size</td><td>Fabric</td><td>Waste</td><td>Cost</td></tr></thead>
      <tbody>{rows.map(r => <tr key={r.size} className="border-t" style={{ borderColor: 'rgba(255,255,255,.08)' }}><td className="py-1 font-bold">{r.size}</td><td>{len(r.metres)}</td><td>{Math.round(r.wastePct)}%</td><td>${r.cost.toFixed(2)}</td></tr>)}</tbody></table>
    <div className="text-[10.5px] mt-2" style={{ color: 'rgba(255,255,255,.45)' }}>Single-layer marker per size, grain along the selvedge, +10% and 10 cm for shrinkage and squaring. Waste is bought fabric the pieces do not use. Thread and notions not included.</div>
  </div>;
}
