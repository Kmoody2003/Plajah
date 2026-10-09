#!/usr/bin/env node
// Backfill time-coded lyrics across the whole Chora catalogue.
//
// Drives the same server-side worker the cron uses (POST /api/lyrics/cron → services/lyricSyncWorker),
// one bounded run after another, until a run finds nothing left to do. Each run stays inside Cloud
// Run's request budget and records every attempt in lyricSyncJobs/, so this can be stopped and
// restarted at any point without double-spending a track.
//
//   CHORA_CRON_KEY=... node scripts/backfillLyricSync.mjs [--base https://plajah.com] [--max-runs 200]
//
// Coverage at any time: GET <base>/api/lyrics/status

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const base = String(opt('base', process.env.PLAJAH_API_BASE || 'https://plajah.com')).replace(/\/+$/, '');
const maxRuns = Number(opt('max-runs', 200));
const key = process.env.CHORA_CRON_KEY;
if (!key) { console.error('Set CHORA_CRON_KEY (the same key the Cloud Run service has).'); process.exit(1); }

const status = async () => (await fetch(`${base}/api/lyrics/status`)).json().catch(() => ({}));

console.log('before:', await status());
let total = { synced: 0, empty: 0, failed: 0 };
for (let run = 1; run <= maxRuns; run++) {
  const res = await fetch(`${base}/api/lyrics/cron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chora-cron-key': key },
    body: JSON.stringify({ reason: 'backfill' }),
    signal: AbortSignal.timeout(310_000),
  }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));
  const s = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`run ${run}: HTTP ${res.status}`, s); await new Promise(r => setTimeout(r, 15000)); continue; }
  if (s.status === 'skipped') { console.log(`run ${run}: another run is active, waiting`); await new Promise(r => setTimeout(r, 30000)); continue; }
  total = { synced: total.synced + s.synced, empty: total.empty + s.empty, failed: total.failed + s.failed };
  console.log(`run ${run}: +${s.synced} synced, ${s.empty} instrumental, ${s.failed} failed, ${s.remaining} remaining (${Math.round(s.durationMs / 1000)}s)`);
  if (s.errors?.length) console.log('  ', s.errors.slice(0, 3).join(' | '));
  if (!s.remaining && !s.synced && !s.empty && !s.failed) break;   // nothing left that is due
}
console.log('totals:', total);
console.log('after:', await status());
