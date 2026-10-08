/**
 * Uploads the Dossier MP4s in docs/dossier to Mux and records the result in a local manifest.
 *
 * What is uploaded by default: the four council exhibit films (douglass, ford, persia, partition) AND the animated Bunker
 * Hill painting (founding-battle-demo), which is INTERACTIVE CONTENT inside the Founding Era exhibit, not an exhibit film.
 * The older pre-council explainers are skipped unless asked for. Playback is PUBLIC only (signed is not supported).
 *
 *   npx tsx scripts/dossier/uploadExperiences.ts                    # DRY RUN (default): hashes files, prints the plan, touches nothing
 *   npx tsx scripts/dossier/uploadExperiences.ts --upload           # really upload (needs MUX_TOKEN_ID + MUX_TOKEN_SECRET)
 *
 * Options
 *   --include-legacy        also plan the three older (pre-council) explainers (excluded by default)
 *   --only=id1,id2          limit to catalog ids (douglass-council, ford-council, persia-council, partition-council,
 *                           founding-battle-demo, douglass-legacy, ford-legacy, persia-legacy)
 *   --policy=public         Mux playback policy. Only "public" is supported (the platform players cannot play signed assets);
 *                           --policy=signed is refused.
 *   --quality=basic|plus|premium   Mux video quality (default plus = what the platform's "smart" tier maps to)
 *   --manifest=path         default data/dossier/experiences-manifest.json
 *   --force                 re-upload even when the manifest says this exact file is already on Mux
 *
 * Idempotent: each MP4 is hashed (sha256); a file whose hash is already in the manifest WITH a Mux asset id is skipped.
 * The manifest is saved after every step, so an interrupted run is resumable and never double-uploads a finished file.
 * The script never deletes anything on Mux. Credentials come from the environment (or .env.local via
 * scripts/loadLocalEnv.ts) and are never printed.
 *
 * Afterwards: open Admin -> Experiences -> "Import manifest" and pick the manifest file to create the admin-only
 * Firestore records, then attach captions. For each exhibit FILM: "Publish as Reello video" (the canonical step; public on
 * Reello needs the explicit choice and a confirm), then "Use in the hall" once it is public. The animated painting is
 * interactive content: it only needs the upload, and has no Reello or hall actions.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadEnvFiles } from '../loadLocalEnv';
import {
  EXPERIENCE_CATALOG, emptyManifest, planUploads, type ExperiencesManifest, type FileFact, type PlaybackPolicy,
} from '../../services/dossier/experiences/experienceModel';
import { runUploads, summarizePlan, type FileProbe, type MuxUploadClient } from '../../services/dossier/experiences/uploader';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const arg = (k: string, d?: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const flag = (k: string) => process.argv.includes(`--${k}`);

const UPLOAD = flag('upload');
if (UPLOAD && flag('dry-run')) { console.error('Pass either --dry-run (default) or --upload, not both.'); process.exit(2); }
const POLICY: PlaybackPolicy = 'public';
if (arg('policy', 'public') !== 'public') { console.error('--policy: only "public" is supported. Signed playback is not supported by the platform players (or by Reello), so a signed asset could not be played.'); process.exit(2); }
const QUALITY = arg('quality', 'plus') as 'basic' | 'plus' | 'premium';
if (!['basic', 'plus', 'premium'].includes(QUALITY)) { console.error('--quality must be basic, plus or premium'); process.exit(2); }
const MANIFEST = path.resolve(ROOT, arg('manifest', 'data/dossier/experiences-manifest.json')!);
const FFDIR = process.env.FFMPEG_DIR || 'C:\\Users\\Kenne\\tools\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin';

const abs = (rel: string) => path.resolve(ROOT, rel);
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

function sha256File(file: string): string {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

/** ffprobe is optional: without it the manifest just lacks duration/size and the admin UI fills them from Mux. */
function probe(rel: string): FileProbe {
  const file = abs(rel);
  const out: FileProbe = {};
  try { out.renderedAt = Math.round(fs.statSync(file).mtimeMs); } catch { /* missing */ }
  try {
    const exe = path.join(FFDIR, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    const j = JSON.parse(execFileSync(exe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
    out.durationSec = Math.round(Number(j.format?.duration) * 100) / 100 || undefined;
    out.width = j.streams?.[0]?.width; out.height = j.streams?.[0]?.height;
  } catch { /* ffprobe not available */ }
  return out;
}

function loadManifest(): ExperiencesManifest {
  try { const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); if (m?.version === 1 && m.entries) return m; } catch { /* none yet */ }
  return emptyManifest();
}
function saveManifest(m: ExperiencesManifest) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  const tmp = MANIFEST + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n');
  fs.renameSync(tmp, MANIFEST);
}

/** The only code in this repo path that talks to Mux. Constructed lazily, and only when --upload is passed. */
async function realClient(): Promise<MuxUploadClient> {
  const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
    console.error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are not set (checked the environment, .env.local and .env). Nothing was uploaded.');
    process.exit(3);
  }
  const Mux = (await import('@mux/mux-node')).default;
  const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  return {
    async createDirectUpload({ passthrough, policy }) {
      const u = await mux.video.uploads.create({
        cors_origin: '*',
        timeout: 86400,
        new_asset_settings: {
          playback_policy: [policy],
          video_quality: QUALITY,
          max_resolution_tier: '1080p',          // the films are 1920x1080 masters; no reason to pay for more
          mp4_support: 'standard',               // same as the platform's uploads: the progressive MP4 is the Android-TV no-MSE fallback
          normalize_audio: false,                // keep the authored mix (score ducking, silence holds); platform uploads normalise
          passthrough,
        },
      });
      return { id: u.id, url: u.url };
    },
    async putFile(url, file, _size, onProgress) {
      const body = fs.readFileSync(abs(file));
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: body as any });
      if (!res.ok) throw new Error(`Mux upload PUT failed: HTTP ${res.status}`);
      onProgress?.(1);
    },
    async waitForAsset(uploadId) {
      for (let i = 0; i < 150; i++) {            // up to ~10 min
        const u = await mux.video.uploads.retrieve(uploadId);
        if (u.asset_id) return u.asset_id;
        if (u.status === 'errored' || u.status === 'cancelled' || u.status === 'timed_out') throw new Error(`Mux upload ${u.status}: ${u.error?.message || ''}`);
        await sleep(4000);
      }
      throw new Error('Timed out waiting for Mux to create the asset');
    },
    async waitForReady(assetId) {
      for (let i = 0; i < 225; i++) {            // up to ~15 min
        const a = await mux.video.assets.retrieve(assetId);
        if (a.status === 'ready' || a.status === 'errored') return a as any;
        await sleep(4000);
      }
      throw new Error('Timed out waiting for the asset to become ready');
    },
  };
}

async function main() {
  const only = arg('only')?.split(',').map(s => s.trim()).filter(Boolean);
  const unknown = (only || []).filter(id => !EXPERIENCE_CATALOG.some(c => c.id === id));
  if (unknown.length) { console.error(`Unknown --only id(s): ${unknown.join(', ')}`); process.exit(2); }

  // Hash first: it is local, free, and is what makes the run idempotent.
  const files: Record<string, FileFact> = {};
  for (const c of EXPERIENCE_CATALOG) {
    if (only && !only.includes(c.id)) continue;
    const f = abs(c.file);
    files[c.id] = fs.existsSync(f) ? { exists: true, sha256: sha256File(f), sizeBytes: fs.statSync(f).size } : { exists: false };
  }
  const manifest = loadManifest();
  const plan = planUploads(EXPERIENCE_CATALOG, manifest, files, { includeLegacy: flag('include-legacy'), only, force: flag('force') });

  console.log(`\nDossier experiences: ${UPLOAD ? 'UPLOAD' : 'DRY RUN (nothing is sent to Mux)'}  policy=${POLICY}  quality=${QUALITY}\n`);
  for (const p of plan) {
    const tag = p.action.padEnd(17);
    console.log(`  ${tag} ${p.entry.id.padEnd(22)} [${p.entry.kind}] ${p.entry.file}${p.sizeBytes ? `  (${mb(p.sizeBytes)})` : ''}\n${' '.repeat(20)}${p.reason}`);
  }
  const s = summarizePlan(plan, probe);
  console.log(`\nWould send ${s.files} file(s), ${mb(s.bytes)}, about ${s.minutes} min of video${s.unknownDurations ? ` (+${s.unknownDurations} of unknown length)` : ''}.`);
  console.log('Mux bills by video minute (encoding by quality tier, storage per stored minute per month, delivery per minute streamed); see Mux pricing for current rates.');

  const nothing = s.files === 0;
  if (!UPLOAD) {
    const cmd = `npx tsx scripts/dossier/uploadExperiences.ts --upload${flag('include-legacy') ? ' --include-legacy' : ''}${only ? ` --only=${only.join(',')}` : ''}`;
    console.log(nothing ? '\nNothing to upload.' : `\nTo upload for real:\n  ${cmd}\n`);
    return;
  }
  if (nothing) { console.log('\nNothing to upload.'); return; }

  loadEnvFiles();
  const client = await realClient();
  const outcomes = await runUploads(plan, { client, manifest, save: saveManifest, probe, policy: POLICY, log: l => console.log('  ' + l) });
  console.log('\nResult');
  for (const o of outcomes.filter(x => x.result !== 'skipped')) console.log(`  ${o.result.padEnd(9)} ${o.id.padEnd(22)} ${o.assetId ? `asset ${o.assetId}` : ''} ${o.error ? '- ' + o.error : ''}`);
  console.log(`\nManifest: ${path.relative(ROOT, MANIFEST)}\nNext: Admin -> Experiences -> Import manifest.`);
  if (outcomes.some(o => o.result === 'errored')) process.exit(1);
}

main().catch(e => { console.error(e?.message || e); process.exit(1); });
