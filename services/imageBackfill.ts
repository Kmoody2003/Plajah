// imageBackfill — retro-fit optimised derivatives onto content uploaded before the pipeline existed.
//
// Runs in the BROWSER, deliberately. A Node script would need `sharp`, a heavy native dependency,
// and would encode subtly differently from the client path — so backfilled images would not match
// newly-uploaded ones. Reusing makeDerivatives() here guarantees they are identical.
//
// Safe to stop and re-run: every pass skips rows that already carry an original, so progress is
// never lost and nothing is processed twice. Dry-run first — it reports the saving without writing.

import { collection, getDocs, doc, updateDoc, query, limit as qLimit } from 'firebase/firestore';
import { db } from './firebase';
import { uploadImageWithDerivatives } from './backendService';
import { describeSaving, isOptimizable } from './imageDerivatives';

export interface BackfillOptions {
  /** Report what WOULD happen without writing anything. Always run this first. */
  dryRun?: boolean;
  /** Stop after this many rows (per collection). Omit for everything. */
  limit?: number;
  onProgress?: (msg: string) => void;
  /** Checked between rows so a long run can be stopped from the UI. */
  shouldStop?: () => boolean;
}

export interface BackfillReport {
  scanned: number;
  converted: number;
  skipped: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
}

const empty = (): BackfillReport => ({ scanned: 0, converted: 0, skipped: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 });

/** Pull an already-uploaded image back down so it can be re-encoded. */
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const b = await res.blob();
    return isOptimizable(b) ? b : null;
  } catch {
    // Firebase Storage serves permissive CORS on download URLs, but a custom domain or a
    // deleted object will land here. Treated as a skip, never a failure of the whole run.
    return null;
  }
}

interface RowSpec {
  /** Firestore collection to walk. */
  path: string;
  /** Field holding the current (unoptimised) URL. */
  urlField: string;
  /** Field that, once set, means this row is already done. */
  doneField: string;
  /** Storage path prefix for the derivatives, given the row id. */
  storageBase: (id: string) => string;
  /** Build the Firestore patch from the upload result. */
  patch: (r: { display: string; thumb?: string; original: string; width?: number; height?: number }) => Record<string, any>;
}

async function runSpec(spec: RowSpec, opts: BackfillOptions): Promise<BackfillReport> {
  const rep = empty();
  const log = (m: string) => opts.onProgress?.(m);
  const snap = await getDocs(opts.limit ? query(collection(db, spec.path), qLimit(opts.limit)) : collection(db, spec.path));

  for (const d of snap.docs) {
    if (opts.shouldStop?.()) { log('Stopped.'); break; }
    rep.scanned++;
    const data: any = d.data();
    const url: string = data?.[spec.urlField] || '';

    if (!url || !/^https?:/.test(url) || data?.[spec.doneField]) { rep.skipped++; continue; }

    const blob = await fetchBlob(url);
    if (!blob) { rep.skipped++; continue; }

    if (opts.dryRun) {
      // Derive locally to measure the saving, but upload nothing and touch no document.
      try {
        const { makeDerivatives } = await import('./imageDerivatives');
        const set = await makeDerivatives(blob);
        if (set?.display) {
          rep.bytesBefore += blob.size;
          rep.bytesAfter += set.display.blob.size;
          rep.converted++;
          log(`${d.id}: ${describeSaving(blob.size, set.display.blob.size)}`);
        } else { rep.skipped++; }
      } catch { rep.failed++; }
      continue;
    }

    try {
      const img = await uploadImageWithDerivatives(spec.storageBase(d.id), blob);
      if (img.display === img.original) { rep.skipped++; continue; } // nothing gained
      await updateDoc(doc(db, spec.path, d.id), spec.patch(img));
      rep.bytesBefore += blob.size;
      rep.converted++;
      log(`${d.id}: optimised ✓`);
    } catch (e: any) {
      rep.failed++;
      log(`${d.id}: failed — ${e?.message || e}`);
    }
  }
  return rep;
}

/** Album artwork — the biggest win, since these were written as lossless PNG. */
export function backfillAlbumCovers(opts: BackfillOptions = {}): Promise<BackfillReport> {
  return runSpec({
    path: 'albums',
    urlField: 'coverImage',
    doneField: 'coverOriginal',
    storageBase: id => `albums/${id}/cover_bf`,
    patch: r => ({
      coverImage: r.display,
      coverOriginal: r.original,
      ...(r.thumb ? { coverThumb: r.thumb } : {}),
    }),
  }, opts);
}

/** Photos — the highest volume, since raw camera files were stored untouched. */
export function backfillPhotos(opts: BackfillOptions = {}): Promise<BackfillReport> {
  return runSpec({
    path: 'photos',
    urlField: 'url',
    doneField: 'originalUrl',
    storageBase: id => `photos/${id}/img_bf`,
    patch: r => ({
      url: r.display,
      originalUrl: r.original,
      ...(r.thumb ? { thumbUrl: r.thumb } : {}),
      ...(r.width ? { width: r.width, height: r.height } : {}),
    }),
  }, opts);
}

export function summarize(r: BackfillReport): string {
  const saved = r.bytesBefore - r.bytesAfter;
  const mb = (n: number) => `${(Math.max(0, n) / 1e6).toFixed(1)} MB`;
  return `scanned ${r.scanned} · optimised ${r.converted} · skipped ${r.skipped} · failed ${r.failed}`
    + (r.bytesBefore ? ` · ${mb(r.bytesBefore)} → ${mb(r.bytesAfter)} (saved ${mb(saved)})` : '');
}
