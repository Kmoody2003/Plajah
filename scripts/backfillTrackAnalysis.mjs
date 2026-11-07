#!/usr/bin/env node
// Backfill the shared track analysis (waveform, beat grid, meter, song map) for every song uploaded before
// Music Intelligence started writing it at upload. Drives POST /api/music-intel/backfill-analysis, one
// bounded slice after another, until a slice reports the walk complete. Resumable: progress lives in
// musicIntelBackfill/state, so this can be stopped and restarted at any point. The Music Intelligence
// cron also spends its spare time on it, so the backfill finishes on its own if this is never run.
//
//   CHORA_CRON_KEY=... node scripts/backfillTrackAnalysis.mjs [--base https://plajah.com] [--restart] [--max-runs 500]
//   (or PLAJAH_ID_TOKEN=<an admin's Firebase ID token> instead of the cron key)

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const base = String(opt('base', process.env.PLAJAH_API_BASE || 'https://plajah.com')).replace(/\/+$/, '');
const maxRuns = Number(opt('max-runs', 500));
let restart = args.includes('--restart');
const key = process.env.CHORA_CRON_KEY, token = process.env.PLAJAH_ID_TOKEN;
if (!key && !token) { console.error('Set CHORA_CRON_KEY (the Cloud Run service key) or PLAJAH_ID_TOKEN (an admin ID token).'); process.exit(1); }
const headers = { 'Content-Type': 'application/json', ...(key ? { 'x-chora-cron-key': key } : { Authorization: `Bearer ${token}` }) };
const status = async () => (await fetch(`${base}/api/music-intel/backfill-analysis`)).json().catch(() => ({}));

console.log('before:', await status());
for (let run = 1; run <= maxRuns; run++) {
  const res = await fetch(`${base}/api/music-intel/backfill-analysis`, {
    method: 'POST', headers, body: JSON.stringify({ restart }), signal: AbortSignal.timeout(320_000),
  }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));
  restart = false;
  const s = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`run ${run}: HTTP ${res.status}`, s); await new Promise(r => setTimeout(r, 15000)); continue; }
  if (s.status === 'skipped') { console.log(`run ${run}: another slice is running, waiting`); await new Promise(r => setTimeout(r, 30000)); continue; }
  console.log(`run ${run}: ${s.status} · +${s.analyzed ?? 0} analysed, ${s.skipped ?? 0} already done, ${s.failed ?? 0} failed, ${s.albums ?? 0} albums · totals ${JSON.stringify(s.totals)}`);
  if (s.errors?.length) console.log('  ', s.errors.slice(0, 3).join(' | '));
  if (s.status === 'complete') break;
}
console.log('after:', await status());
