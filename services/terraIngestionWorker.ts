/**
 * Terra ingestion worker.
 *
 * Mirrors the sports ingestion spine deliberately: an in-process scheduler on the
 * long-lived Cloud Run container, a module-level single-flight guard so overlapping
 * ticks cannot double-run, and a run summary persisted for the admin console.
 *
 * Scope: Detroit only. Parcels are the spine; civic feeds hang off them by parcel
 * number. Detroit publishes daily, so a nightly pass is ample — this is not a
 * real-time source and pretending otherwise would only add load and cost.
 *
 * Env:
 *   TERRA_INGESTION_WORKER=false     disable entirely
 *   TERRA_INGESTION_INTERVAL_MS      override the interval (default 24h)
 *   TERRA_INGESTION_MAX_PARCELS      cap per run (default 5000; 0 = uncapped)
 */

import {
  CIVIC_FEEDS, aggregateEnergyReadings, fetchDetroitBusinessLicenses, fetchDetroitCivic,
  fetchDetroitEnergyReadings, fetchDetroitParcels, fetchDetroitRentalCompliance, type CivicFeed,
} from './terra/detroitAdapter';
// Server-side persistence: the worker runs unauthenticated, so it writes through
// the service account (rules-exempt), NOT the client-SDK terraService — otherwise
// every write is denied by `terraParcels write: if isAdmin()`.
import {
  getCursorServer, recordRunServer, saveBusinessServer, saveCivicServer, saveEnergyServer,
  saveParcelsServer, saveRentalServer, setCursorServer,
} from './terra/terraServerWrite';
import type { TerraIngestionScope, TerraIngestionSummary } from './terra/terraTypes';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_PARCELS = 5000;
/** Key for the persisted parcel page offset. */
const PARCEL_CURSOR = 'detroit_parcels';

let activeRun: Promise<TerraIngestionSummary> | null = null;
let schedulerStarted = false;

export interface TerraIngestionOptions {
  scope?: TerraIngestionScope;
  /** Restrict to specific civic feeds; omit for the scope's default set. */
  feeds?: CivicFeed[];
  /** Override the per-run parcel ceiling. */
  maxParcels?: number;
  reason?: string;
  signal?: AbortSignal;
}

/** How much each scope pulls. `deep` is a full-city refresh and takes a while. */
function planFor(scope: TerraIngestionScope): { parcels: number; civicPerFeed: number; feeds: CivicFeed[]; extras: boolean } {
  switch (scope) {
    case 'lite':
      return { parcels: 500, civicPerFeed: 250, feeds: ['permits', 'blightTickets'], extras: false };
    case 'deep':
      return { parcels: 0, civicPerFeed: 5000, feeds: [...CIVIC_FEEDS], extras: true };
    case 'standard':
    default:
      return { parcels: 5000, civicPerFeed: 1000, feeds: [...CIVIC_FEEDS], extras: true };
  }
}

async function runTerraIngestion(options: TerraIngestionOptions = {}): Promise<TerraIngestionSummary> {
  const scope = options.scope ?? 'standard';
  const startedAt = new Date();
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const plan = planFor(scope);

  const envCap = Number(process.env.TERRA_INGESTION_MAX_PARCELS);
  const maxParcels = options.maxParcels
    ?? (Number.isFinite(envCap) ? envCap : (plan.parcels || DEFAULT_MAX_PARCELS));

  // ── Parcels (the spine) ──
  // Bounded runs resume from a persisted offset so successive passes walk the
  // whole city instead of re-fetching page one forever. An uncapped (deep) run
  // pulls everything and resets the cursor.
  const uncapped = maxParcels <= 0;
  try {
    const startOffset = uncapped ? 0 : await getCursorServer(PARCEL_CURSOR);
    const parcels = await fetchDetroitParcels({
      maxRecords: uncapped ? undefined : maxParcels,
      resultOffset: startOffset,
      signal: options.signal,
    });
    counts.parcelsFetched = parcels.length;
    counts.parcelsOffset = startOffset;
    counts.parcelsSaved = await saveParcelsServer(parcels);

    if (uncapped) {
      await setCursorServer(PARCEL_CURSOR, 0);
    } else {
      // A short page means we reached the end — wrap around to refresh from the top.
      const next = parcels.length < maxParcels ? 0 : startOffset + parcels.length;
      await setCursorServer(PARCEL_CURSOR, next);
      counts.parcelsNextOffset = next;
    }
  } catch (err: any) {
    errors.push(`parcels: ${err?.message || err}`);
  }

  // ── Civic feeds ──
  const feeds = options.feeds?.length ? options.feeds : plan.feeds;
  for (const feed of feeds) {
    try {
      const records = await fetchDetroitCivic(feed, {
        maxRecords: plan.civicPerFeed,
        signal: options.signal,
      });
      counts[`${feed}Fetched`] = records.length;
      counts[`${feed}Saved`] = await saveCivicServer(records);
    } catch (err: any) {
      errors.push(`${feed}: ${err?.message || err}`);
    }
  }

  // ── Whole-layer joins (energy, business, rental) ──
  // Each is small enough to pull complete and write in one pass rather than
  // cursor: energy ~112 docs, business ~1.9k, rental ~22.6k. Skipped on `lite`,
  // which exists to be quick. Each is independently guarded so one failing
  // source can't sink the others.
  if (plan.extras) {
    try {
      const readings = await fetchDetroitEnergyReadings({ signal: options.signal });
      const rollups = aggregateEnergyReadings(readings);
      counts.energyReadings = readings.length;
      counts.energyParcels = rollups.length;
      counts.energySaved = await saveEnergyServer(rollups);
    } catch (err: any) {
      errors.push(`energy: ${err?.message || err}`);
    }

    try {
      const licenses = await fetchDetroitBusinessLicenses({ signal: options.signal });
      counts.businessFetched = licenses.length;
      counts.businessSaved = await saveBusinessServer(licenses);
    } catch (err: any) {
      errors.push(`business: ${err?.message || err}`);
    }

    try {
      const rental = await fetchDetroitRentalCompliance({ signal: options.signal });
      counts.rentalFetched = rental.length;
      counts.rentalCertified = rental.filter(r => r.certified).length;
      counts.rentalSaved = await saveRentalServer(rental);
    } catch (err: any) {
      errors.push(`rental: ${err?.message || err}`);
    }
  }

  const finishedAt = new Date();
  const summary: TerraIngestionSummary = {
    id: `terra-${startedAt.toISOString().replace(/[:.]/g, '-')}`,
    status: errors.length && !counts.parcelsSaved ? 'failed' : 'completed',
    reason: options.reason,
    scope,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    counts,
    errors,
  };
  await recordRunServer(summary);
  return summary;
}

/** Single-flight entry point. Concurrent callers get a `skipped` summary. */
export function runTerraIngestionWorker(options: TerraIngestionOptions = {}): Promise<TerraIngestionSummary> {
  if (activeRun) {
    const now = new Date().toISOString();
    return Promise.resolve({
      id: `terra-skipped-${now.replace(/[:.]/g, '-')}`,
      status: 'skipped',
      reason: 'already_running',
      scope: options.scope ?? 'standard',
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      counts: {},
      errors: [],
    });
  }
  activeRun = runTerraIngestion(options).finally(() => { activeRun = null; });
  return activeRun;
}

export function startTerraIngestionScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(() => {
    runTerraIngestionWorker({ scope: 'standard', reason: 'scheduled_interval' }).catch(err => {
      console.warn('[Terra Ingestion] Scheduled run failed:', err?.message || err);
    });
  }, intervalMs);

  // A small warm pass shortly after boot so a fresh deploy has data to serve.
  setTimeout(() => {
    runTerraIngestionWorker({ scope: 'lite', reason: 'startup' }).catch(err => {
      console.warn('[Terra Ingestion] Startup run failed:', err?.message || err);
    });
  }, 45_000);
}
