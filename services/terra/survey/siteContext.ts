/**
 * Site context — the public infrastructure around one surveyed parcel, measured
 * in the parcel's own local frame (feet): nearest hydrant, utility covers and
 * lights along the frontage, recorded vacations/openings touching the lot, and
 * every building footprint on it with its setback to each lot side and the lot
 * coverage.
 */

import type { ParcelSurvey } from './parcelSurvey';
import { outerRing } from './parcelSurvey';
import { type Pt, signedArea, centroid, pointInPolygon, distanceToPolygon, pointSegmentDistance } from './cogo';
import type { InfraFeature, InfraKind } from '../infraLayers';
import type { GeoJsonGeometry } from '../terraTypes';

export interface BuildingOnLot {
  id: string;
  name?: string;
  footprintSqFt: number;
  stories?: number;
  heightFt?: number;
  yearBuilt?: number;
  /** Minimum distance from the footprint to each mapped side, by side index. */
  setbacks: number[];
}

export interface SiteContext {
  nearestHydrant?: { distanceFt: number; label: string };
  /** Counts within `radiusFt` of the lot line. */
  near: Partial<Record<InfraKind, number>>;
  radiusFt: number;
  rowRecords: { kind: 'ROW_VACATION' | 'ROW_OPENING'; props: Record<string, any>; distanceFt: number }[];
  buildings: BuildingOnLot[];
  /** Σ footprint / lot area, %. */
  lotCoveragePct?: number;
}

function pointOf(g: GeoJsonGeometry): [number, number] | null {
  if (g.type === 'Point') return g.coordinates as any;
  return null;
}

export function siteContext(survey: ParcelSurvey, infra: InfraFeature[], parcelNumber?: string, radiusFt = 100): SiteContext {
  const lot = survey.mapped?.vertices;
  const ctx: SiteContext = { near: {}, radiusFt, rowRecords: [], buildings: [] };
  if (!lot) return ctx;
  const loc = (c: number[]) => survey.toLocal(c[0], c[1]);
  const dLot = (p: Pt) => (pointInPolygon(p, lot) ? 0 : distanceToPolygon(p, lot));

  for (const f of infra) {
    const pt = pointOf(f.geometry);
    if (pt) {
      const d = dLot(loc(pt));
      if (f.kind === 'HYDRANT' && (!ctx.nearestHydrant || d < ctx.nearestHydrant.distanceFt)) {
        ctx.nearestHydrant = { distanceFt: d, label: String(f.props.DFDHYDRANTID ?? f.props.LOCDESC ?? 'hydrant') };
      }
      if (d <= radiusFt) ctx.near[f.kind] = (ctx.near[f.kind] ?? 0) + 1;
      continue;
    }
    if (f.kind === 'ROW_VACATION' || f.kind === 'ROW_OPENING') {
      const ring = outerRing(f.geometry);
      if (!ring) continue;
      const r = ring.map(loc);
      // Closest approach between the two polygons (vertex-to-boundary both ways).
      let d = Infinity;
      for (const p of r) d = Math.min(d, dLot(p));
      for (const p of lot) d = Math.min(d, pointInPolygon(p, r) ? 0 : distanceToPolygon(p, r));
      if (d <= 10) ctx.rowRecords.push({ kind: f.kind, props: f.props, distanceFt: d });
      continue;
    }
    if (f.kind === 'FOOTPRINT') {
      const ring = outerRing(f.geometry);
      if (!ring) continue;
      const r = ring.map(loc);
      if (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y) r.pop();
      const onLot = (parcelNumber && (f.props.APN === parcelNumber || f.props.parcelID === parcelNumber)) || pointInPolygon(centroid(r), lot);
      if (!onLot) continue;
      const sides = survey.mapped!.sides;
      const setbacks = sides.map(sd => {
        let m = Infinity;
        for (const p of r) m = Math.min(m, pointSegmentDistance(p, sd.from, sd.to).d);
        return m;
      });
      ctx.buildings.push({
        id: f.id,
        name: typeof f.props.AKA === 'string' && f.props.AKA.trim() ? f.props.AKA.trim() : undefined,
        footprintSqFt: Math.abs(signedArea(r)),
        stories: f.props.STORIES || undefined,
        heightFt: f.props.MEDIAN_HGT || undefined,
        yearBuilt: f.props.YEAR_BUILT || undefined,
        setbacks,
      });
    }
  }
  const lotArea = survey.mapped!.areaSqFt;
  if (ctx.buildings.length && lotArea > 0) {
    ctx.lotCoveragePct = (ctx.buildings.reduce((s, b) => s + b.footprintSqFt, 0) / lotArea) * 100;
  }
  return ctx;
}
