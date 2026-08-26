/**
 * Terra — core types for the parcel spine.
 *
 * Scope decision (locked): Detroit only. The zoning rule store is hand-encoded
 * per jurisdiction, and Detroit is one ordinance covering ~377k parcels. Going
 * regional means ~132 municipalities, each with its own district nomenclature.
 *
 * Design rule that shapes every type here: NOTHING renders without a vintage.
 * Some sources update daily (parcels, permits, blight, 311); others are frozen
 * artefacts years old. Both are useful; conflating them is not. Every record
 * therefore carries `sources` with a retrieval time and an observed/estimated
 * flag, and the UI is expected to show it.
 */

import type { OlrSource } from './olr';

export type TerraJurisdiction = 'detroit';

// ─── Parcel — the spine ──────────────────────────────────────────────────────

/**
 * A normalised parcel. Field names are Terra's own (the source's are snake_case
 * and jurisdiction-specific); `sources` records where each snapshot came from.
 */
export interface TerraParcel {
  /** Terra id: `<jurisdiction>:<parcelNumber>` */
  id: string;
  jurisdiction: TerraJurisdiction;
  /** The assessor's parcel number, verbatim. */
  parcelNumber: string;

  // Address
  address?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;

  // Geometry — GeoJSON Polygon/MultiPolygon in WGS84, plus a cheap centroid.
  geometry?: GeoJsonGeometry;
  centroidLat?: number;
  centroidLng?: number;

  // Dimensions — the parcel-side inputs to a buildable envelope.
  frontageFt?: number;
  depthFt?: number;
  lotSqFt?: number;
  lotAcres?: number;

  // Zoning as recorded ON the parcel. NOTE: cross-check against the zoning
  // polygon layer — the city's own map disclaimer warns of inconsistencies.
  zoningDistrict?: string;

  // Structure
  isImproved?: boolean;
  yearBuilt?: number;
  floorAreaSqFt?: number;
  buildingStyle?: string;
  buildingCount?: number;
  propertyClass?: string;
  useCode?: string;

  // Valuation — assessments, NOT an appraisal or a market value.
  assessedValue?: number;
  taxableValue?: number;
  /** Exemption status. This is NOT delinquency — a widely-made misreading. */
  taxStatus?: string;

  // Last recorded transfer
  lastSaleDate?: string;
  lastSalePrice?: number;

  // Owner of record (public record; see the redistribution note in the OLR spec)
  taxpayerName?: string;
  taxpayerAddress?: string;

  // Flags that must SUPPRESS envelope computation rather than adjust it
  localHistoricDistrict?: string;
  nezDistrict?: string;

  legalDescription?: string;
  ward?: string;

  sources: OlrSource[];
  updatedAt: number;
}

export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point' | 'LineString';
  coordinates: any;
}

// ─── Stored-form codec ───────────────────────────────────────────────────────
//
// ⚠️ Firestore rejects arrays nested directly inside arrays, and GeoJSON
// coordinates are exactly that (Polygon = number[][][]). A parcel written with
// its geometry intact fails with INVALID_ARGUMENT — and because the write
// helpers swallow errors, the symptom is "ingestion ran, saved 0". So the
// geometry crosses the Firestore boundary as a JSON string (`geometryJson`)
// and is rehydrated on read. Both the server ingestion path and the client
// admin path MUST write through packParcel and read through unpackParcel.

export type StoredTerraParcel = Omit<TerraParcel, 'geometry'> & { geometryJson?: string };

export function packParcel(p: TerraParcel): StoredTerraParcel {
  const { geometry, ...rest } = p;
  return geometry ? { ...rest, geometryJson: JSON.stringify(geometry) } : rest;
}

export function unpackParcel(stored: StoredTerraParcel | TerraParcel | null | undefined): TerraParcel | null {
  if (!stored) return null;
  const { geometryJson, ...rest } = stored as StoredTerraParcel & { geometry?: GeoJsonGeometry };
  if (rest.geometry || !geometryJson) return rest as TerraParcel;
  try { return { ...rest, geometry: JSON.parse(geometryJson) as GeoJsonGeometry }; }
  catch { return rest as TerraParcel; }
}

// ─── Civic records ───────────────────────────────────────────────────────────

export type CivicRecordKind =
  | 'PERMIT'            // building / trade permits
  | 'BLIGHT_TICKET'     // code violations
  | 'DEMOLITION'        // pipeline + completed
  | 'RENTAL_COMPLIANCE' // registration vs certificate
  | 'SERVICE_REQUEST'   // 311
  | 'LAND_BANK'         // public land inventory
  | 'FORECLOSURE';      // historical only — see the honesty note below

/**
 * One civic event attached to a parcel.
 *
 * ⚠️ FORECLOSURE is HISTORY, NOT STATUS. There is no current tax-delinquency or
 * foreclosure feed available: the city's layer is frozen at 2017 data and the
 * county treasurer publishes no machine-readable source. Never present a
 * FORECLOSURE record as a property's present condition.
 */
export interface TerraCivicRecord {
  id: string;
  jurisdiction: TerraJurisdiction;
  kind: CivicRecordKind;
  /** Join key back to the parcel spine. */
  parcelNumber?: string;
  address?: string;

  /** Short human summary rendered in the UI. */
  summary: string;
  /** Source's own status text, unmapped. */
  status?: string;
  /** When the event occurred (not when we ingested it). */
  occurredAt?: number;
  /** Money attached to the event, where meaningful. */
  amount?: number;

  lat?: number;
  lng?: number;

  /** Everything the source gave us that we did not normalise. */
  raw?: Record<string, any>;

  sources: OlrSource[];
  updatedAt: number;
}

// ─── Zoning rules — an interpreter, not a lookup table ───────────────────────
//
// Reading the actual ordinance changed this design. Two findings:
//   1. Standards are keyed to (district × USE), not district alone — one
//      residential district carries ~10 distinct use rows with different setbacks.
//   2. Several values are not scalars. Side setbacks appear as
//      "4 ft minimum / 14 ft combined", and some are FORMULAS driven by building
//      length and height.
// So a dimension is an expression with an optional combined-minimum companion,
// and the envelope engine evaluates it against a candidate massing.

export type DimensionExpr =
  | { kind: 'fixed'; feet: number }
  | { kind: 'percent'; percent: number }
  | { kind: 'ratio'; ratio: number }
  /** e.g. (length + 2 * height) / divisor — the ordinance's own formula shape. */
  | { kind: 'formula'; lengthCoeff: number; heightCoeff: number; divisor: number; minFeet?: number }
  | { kind: 'none' };

export interface SetbackRule {
  each: DimensionExpr;
  /** "4 ft min / 14 ft combined" → each = fixed 4, combinedMinFeet = 14. */
  combinedMinFeet?: number;
}

/** Dimensional standards for one (district × use) pair. */
export interface ZoningRule {
  /** `<jurisdiction>:<district>:<useKey>` */
  id: string;
  jurisdiction: TerraJurisdiction;
  district: string;
  /** Normalised use, e.g. 'single_family', 'multiple_family', 'all_other'. */
  useKey: string;
  useLabel: string;

  minLotSqFt?: number;
  minLotWidthFt?: number;
  frontSetback?: DimensionExpr;
  sideSetback?: SetbackRule;
  rearSetback?: DimensionExpr;
  maxHeightFt?: number;
  maxLotCoveragePct?: number;
  maxFar?: number;

  /** Cross-references in the ordinance that can further modify the envelope. */
  additionalRegulations?: string[];
  /** Ordinance section this row was transcribed from. */
  citation?: string;
  /** Rules are versioned — the city's housing reform is pending and would move these. */
  effectiveDate: string;
  supersededDate?: string;
  sources: OlrSource[];
}

/**
 * Why an envelope could not be computed. We FLAG these rather than guessing —
 * overlays override base setbacks and are not published as data, so a computed
 * envelope on an overlay parcel would be confidently wrong.
 */
export type EnvelopeBlocker =
  | 'PLANNED_DEVELOPMENT'   // standards are negotiated per project
  | 'HISTORIC_DISTRICT'     // design review governs
  | 'MAIN_STREET_OVERLAY'   // overlay setbacks supersede; geometry unpublished
  | 'NO_RULE_ENCODED'       // district/use pair not yet transcribed
  | 'NO_PARCEL_DIMENSIONS'; // missing frontage/depth

export interface BuildableEnvelope {
  parcelId: string;
  district: string;
  useKey: string;
  /** Null when blockers is non-empty — never a partial guess. */
  buildableAreaSqFt: number | null;
  maxHeightFt: number | null;
  maxFloorAreaSqFt: number | null;
  frontSetbackFt?: number;
  sideSetbackFt?: number;
  rearSetbackFt?: number;
  // Geometry the 3D view + compliance check need. Feet.
  lotAreaSqFt?: number;
  lotWidthFt?: number;
  lotDepthFt?: number;
  buildableWidthFt?: number;
  buildableDepthFt?: number;
  maxStoreys?: number;
  coverageCapSqFt?: number;
  farCapSqFt?: number;
  blockers: EnvelopeBlocker[];
  /** Always shown with the result — this is guidance, never a determination. */
  disclaimer: string;
  rule?: ZoningRule;
}

export const ENVELOPE_DISCLAIMER =
  'Estimated from published zoning standards for guidance only. Not a zoning determination. '
  + 'Overlays, variances and site conditions can change these limits — confirm with the city before design work.';

// ─── Ingestion run summary (mirrors the sports worker's contract) ────────────

export interface TerraIngestionSummary {
  id: string;
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
  scope: TerraIngestionScope;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  counts: Record<string, number>;
  errors: string[];
}

export type TerraIngestionScope = 'lite' | 'standard' | 'deep';
