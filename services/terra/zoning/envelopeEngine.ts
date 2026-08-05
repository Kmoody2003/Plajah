/**
 * Buildable-envelope engine.
 *
 * Pure functions: parcel + zoning rule → the legal buildable envelope, and a
 * proposed massing → a compliance verdict. No React, no I/O — unit-testable.
 *
 * The honest core: this is a small rule INTERPRETER, not a lookup. Setbacks can
 * be scalars, "each / combined" pairs, or length-and-height formulas, so the
 * engine evaluates expressions rather than reading fixed numbers. It also refuses
 * to compute when a real-world condition (overlay, historic district, missing
 * parcel dimensions) would make the answer unreliable — it FLAGS instead.
 *
 * Nothing this produces is a zoning determination. Every result carries the
 * disclaimer. Confirm with the city before design work.
 */

import type {
  TerraParcel, ZoningRule, DimensionExpr, SetbackRule, BuildableEnvelope, EnvelopeBlocker,
} from '../terraTypes';
import { ENVELOPE_DISCLAIMER } from '../terraTypes';

/** Assumed floor-to-floor height when converting height ↔ storeys. */
export const FLOOR_TO_FLOOR_FT = 10;

/** Districts whose envelope is negotiated per project, not fixed by a table. */
const PLANNED_DISTRICTS = new Set(['PD', 'PC', 'PCA', 'PR', 'B6']);

export interface ProposedMassing {
  storeys: number;
  /** Fraction of the buildable footprint the building occupies (0..1). */
  footprintFill: number;
  roof: 'flat' | 'gable';
}

export interface EnvelopeCompliance {
  withinEnvelope: boolean;
  // proposed vs allowed
  heightFt: number; maxHeightFt: number; heightOk: boolean;
  footprintSqFt: number; maxFootprintSqFt: number; footprintOk: boolean;
  coveragePct: number; maxCoveragePct?: number; coverageOk: boolean;
  floorAreaSqFt: number; maxFloorAreaSqFt: number | null; farOk: boolean;
  storeys: number; maxStoreys: number; storeysOk: boolean;
  // building footprint dims (feet), centred in the buildable rectangle
  buildingWidthFt: number; buildingDepthFt: number;
}

/**
 * Evaluate a single dimension expression to feet.
 * `percent`/`ratio` return 0 here — they apply against lot area, handled by the
 * caller (coverage / FAR), not as a linear setback.
 */
export function evalDimension(
  expr: DimensionExpr | undefined,
  ctx: { lengthFt?: number; heightFt?: number } = {},
): number {
  if (!expr) return 0;
  switch (expr.kind) {
    case 'fixed': return Math.max(0, expr.feet);
    case 'formula': {
      const L = ctx.lengthFt ?? 0;
      const H = ctx.heightFt ?? 0;
      const v = (expr.lengthCoeff * L + expr.heightCoeff * H) / (expr.divisor || 1);
      return Math.max(v, expr.minFeet ?? 0);
    }
    case 'percent':
    case 'ratio':
    case 'none':
    default:
      return 0;
  }
}

/** Effective per-side setback: the larger of each-side minimum and combined/2. */
export function effectiveSideFt(rule: SetbackRule | undefined, ctx: { lengthFt?: number; heightFt?: number }): number {
  if (!rule) return 0;
  const each = evalDimension(rule.each, ctx);
  const fromCombined = rule.combinedMinFeet ? rule.combinedMinFeet / 2 : 0;
  return Math.max(each, fromCombined);
}

/** Why an envelope can't be computed. Empty = safe to compute. */
export function detectBlockers(parcel: TerraParcel, rule: ZoningRule | null): EnvelopeBlocker[] {
  const blockers: EnvelopeBlocker[] = [];
  const district = (parcel.zoningDistrict || '').toUpperCase();

  if (district && PLANNED_DISTRICTS.has(district)) blockers.push('PLANNED_DEVELOPMENT');
  if (parcel.localHistoricDistrict) blockers.push('HISTORIC_DISTRICT');

  const hasDims = (parcel.frontageFt && parcel.depthFt) || parcel.lotSqFt;
  if (!hasDims) blockers.push('NO_PARCEL_DIMENSIONS');

  // Only report "no rule" if nothing else already blocks — it's the least useful
  // message when the real problem is an overlay or missing geometry.
  if (!rule && !blockers.length) blockers.push('NO_RULE_ENCODED');
  else if (!rule && !blockers.includes('NO_RULE_ENCODED')) blockers.push('NO_RULE_ENCODED');

  return blockers;
}

/**
 * Compute the legal buildable envelope. Returns a BuildableEnvelope with
 * `buildableAreaSqFt === null` and populated `blockers` when it can't safely
 * compute — never a partial guess.
 *
 * Setbacks that depend on building size are evaluated at the MAXIMUM height and
 * full buildable depth — the conservative direction (larger required setback),
 * so a proposal that fits this envelope also fits the true one.
 */
export function computeEnvelope(parcel: TerraParcel, rule: ZoningRule | null): BuildableEnvelope {
  const district = (parcel.zoningDistrict || '').toUpperCase();
  const blockers = detectBlockers(parcel, rule);

  const base: BuildableEnvelope = {
    parcelId: parcel.id,
    district,
    useKey: rule?.useKey || '',
    buildableAreaSqFt: null,
    maxHeightFt: null,
    maxFloorAreaSqFt: null,
    blockers,
    disclaimer: ENVELOPE_DISCLAIMER,
    rule: rule || undefined,
  };

  if (blockers.length || !rule) return base;

  const lotWidth = parcel.frontageFt ?? (parcel.lotSqFt && parcel.depthFt ? parcel.lotSqFt / parcel.depthFt : 0);
  const lotDepth = parcel.depthFt ?? (parcel.lotSqFt && parcel.frontageFt ? parcel.lotSqFt / parcel.frontageFt : 0);
  const lotArea = parcel.lotSqFt ?? (lotWidth * lotDepth);

  const maxHeight = rule.maxHeightFt ?? 35;
  const ctx = { lengthFt: lotDepth, heightFt: maxHeight };

  const frontSet = evalDimension(rule.frontSetback, ctx);
  const rearSet = evalDimension(rule.rearSetback, ctx);
  const sideSet = effectiveSideFt(rule.sideSetback, ctx);

  const buildableWidth = Math.max(0, lotWidth - 2 * sideSet);
  const buildableDepth = Math.max(0, lotDepth - frontSet - rearSet);
  const setbackFootprint = buildableWidth * buildableDepth;

  const coverageCap = rule.maxLotCoveragePct != null ? lotArea * (rule.maxLotCoveragePct / 100) : Infinity;
  const maxFootprint = Math.min(setbackFootprint, coverageCap);

  const maxStoreys = Math.max(1, Math.floor(maxHeight / FLOOR_TO_FLOOR_FT));
  const farCap = rule.maxFar != null ? rule.maxFar * lotArea : Infinity;
  const maxGFA = Math.min(maxFootprint * maxStoreys, farCap);

  return {
    ...base,
    buildableAreaSqFt: Math.round(maxFootprint),
    maxHeightFt: maxHeight,
    maxFloorAreaSqFt: Math.round(maxGFA),
    frontSetbackFt: round1(frontSet),
    sideSetbackFt: round1(sideSet),
    rearSetbackFt: round1(rearSet),
    lotAreaSqFt: Math.round(lotArea),
    lotWidthFt: round1(lotWidth),
    lotDepthFt: round1(lotDepth),
    buildableWidthFt: round1(buildableWidth),
    buildableDepthFt: round1(buildableDepth),
    maxStoreys,
    coverageCapSqFt: Number.isFinite(coverageCap) ? Math.round(coverageCap) : undefined,
    farCapSqFt: Number.isFinite(farCap) ? Math.round(farCap) : undefined,
  };
}

/**
 * Check a proposed massing against a computed envelope. The building is centred
 * in the buildable rectangle; footprintFill scales both plan dimensions by
 * sqrt(fill) so the aspect ratio is preserved.
 */
export function checkCompliance(env: BuildableEnvelope, proposed: ProposedMassing): EnvelopeCompliance | null {
  if (env.buildableAreaSqFt == null || env.maxHeightFt == null
    || env.buildableWidthFt == null || env.buildableDepthFt == null) return null;

  const fill = clamp(proposed.footprintFill, 0.1, 1);
  const scale = Math.sqrt(fill);
  const buildingWidth = env.buildableWidthFt * scale;
  const buildingDepth = env.buildableDepthFt * scale;
  const footprint = buildingWidth * buildingDepth;

  const heightFt = proposed.storeys * FLOOR_TO_FLOOR_FT;
  const floorArea = footprint * proposed.storeys;
  const lotArea = env.lotAreaSqFt ?? 0;
  const coveragePct = lotArea > 0 ? (footprint / lotArea) * 100 : 0;

  const maxStoreys = env.maxStoreys ?? 1;
  const maxCoveragePct = env.rule?.maxLotCoveragePct;
  const maxGFA = env.maxFloorAreaSqFt;

  const heightOk = heightFt <= (env.maxHeightFt ?? Infinity) + 0.01;
  const storeysOk = proposed.storeys <= maxStoreys;
  const footprintOk = footprint <= env.buildableAreaSqFt + 0.5;
  const coverageOk = maxCoveragePct == null ? true : coveragePct <= maxCoveragePct + 0.01;
  const farOk = maxGFA == null ? true : floorArea <= maxGFA + 0.5;

  return {
    withinEnvelope: heightOk && storeysOk && footprintOk && coverageOk && farOk,
    heightFt: round1(heightFt), maxHeightFt: env.maxHeightFt ?? 0, heightOk,
    footprintSqFt: Math.round(footprint), maxFootprintSqFt: env.buildableAreaSqFt, footprintOk,
    coveragePct: round1(coveragePct), maxCoveragePct, coverageOk,
    floorAreaSqFt: Math.round(floorArea), maxFloorAreaSqFt: maxGFA, farOk,
    storeys: proposed.storeys, maxStoreys, storeysOk,
    buildingWidthFt: round1(buildingWidth), buildingDepthFt: round1(buildingDepth),
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
