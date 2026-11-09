// Fabric, waste and cost per size from the cutting marker: draft (or grade) each size, lay its
// marker on each fabric, and price the metres. Waste is the marker area the pieces do not cover.

import type { Pattern, SoftTemplate, ParamValue, FabricRole } from '../patterns';
import { softDefaults } from '../patterns';
import { marker, rolesOf, yardage } from '../layout';
import { type GradedPattern, gradePattern } from './grading';

export interface CostLine { role: FabricRole; metres: number; widthMm: number; efficiency: number; price: number; cost: number }
export interface CostRow { size: string; lines: CostLine[]; metres: number; wastePct: number; cost: number }

export const DEFAULT_PRICE: Record<FabricRole, number> = { main: 14, contrast: 12, lining: 8, rib: 14, fur: 18, interfacing: 4 };

export function costFor(p: Pattern, prices: Partial<Record<FabricRole, number>> = {}, widths: Partial<Record<FabricRole, number>> = {}): CostRow {
  const lines: CostLine[] = rolesOf(p).map(role => { const mk = marker(p, role, widths[role] ?? p.fabricWidth); const y = yardage(mk); const price = prices[role] ?? DEFAULT_PRICE[role]; return { role, metres: y.metres, widthMm: mk.width, efficiency: mk.efficiency, price, cost: Math.round(y.metres * price * 100) / 100 }; });
  const used = lines.reduce((s, l) => s + l.metres * l.widthMm * l.efficiency, 0), bought = lines.reduce((s, l) => s + l.metres * l.widthMm, 0);
  return { size: p.size ?? '', lines, metres: Math.round(lines.reduce((s, l) => s + l.metres, 0) * 10) / 10, wastePct: bought ? (1 - used / bought) * 100 : 0, cost: Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100 };
}

export function costPerSize(src: { template: SoftTemplate; params: Record<string, ParamValue> } | { graded: GradedPattern }, sizes: string[], prices: Partial<Record<FabricRole, number>> = {}, widths: Partial<Record<FabricRole, number>> = {}): CostRow[] {
  return sizes.map(size => { const p = 'graded' in src ? gradePattern(src.graded, size) : src.template.build({ ...softDefaults(src.template), ...src.params, size }); return { ...costFor(p, prices, widths), size }; });
}
