/**
 * photo3dLoop.ts — one photo → 3D fidelity run, end to end (docs/game-studio-photo-to-3d.md §6).
 *
 *   node --import tsx scripts/gamestudio/photo3dLoop.ts <photo> [--backend hunyuan_mini|triposr|sf3d]
 *        [--out dir] [--rounds 5] [--lane gemini|rules] [--rescan] [--subject "conga drum"]
 *
 * 1. cut the subject out (rembg, tela3d env) and scan it (Tela 3D runtime on :51124, local GPU);
 * 2. fit the scan into clay space, turn it into an SDF field, align the photo's camera;
 * 3. loop: replay → render (photo camera + 3 angles) → score → the eye (Gemini vision) → Aria's agent
 *    (Gemini text, rules as fallback) → apply as one undoable batch;
 * 4. writes round_<n>.png (photo | photo-camera render | side | back | other side), rounds.json,
 *    history.txt (the op sentences) and model.json (the editable doc) to --out.
 *
 * Owner-run dev tool. The in-app path runs the same loop with the desktop's local lanes first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { readGlb } from '../../services/gamestudio/photo3d/mesh';
import { fitToClay, toClay, scanField, scanBase, encodeScanField, decodeScanField } from '../../services/gamestudio/photo3d/replay';
import { ensureLocalLlm, localChat } from './localLlm';
import { alignToPhoto, refineCamera } from '../../services/gamestudio/photo3d/align';
import { ModelHistory } from '../../services/gamestudio/photo3d/modelOps';
import { runFidelityLoop, type Lanes } from '../../services/gamestudio/photo3d/loop';
import { gapPrompt } from '../../services/gamestudio/photo3d/gapReport';
import { sideBySide } from '../../services/gamestudio/photo3d/render';
import { emptyModelDoc } from '../../services/gamestudio/photo3d/schema';
import type { Picture } from '../../services/gamestudio/photo3d/score';

const args = process.argv.slice(2);
const flag = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const photoPath = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
if (!photoPath) { console.error('usage: photo3dLoop.ts <photo> [--backend …] [--out dir]'); process.exit(1); }
const backend = flag('backend', 'hunyuan_mini')!;
const out = path.resolve(flag('out', path.join('D:/Plajah Runtime/photo3d', path.basename(photoPath, path.extname(photoPath))))!);
/** 'local' (default): Gemma 4 on this GPU, Gemini only if the local lane fails. 'gemini': cloud only. 'rules': no models. */
const lane = flag('lane', 'local');
const maxRounds = Number(flag('rounds', '5'));
fs.mkdirSync(out, { recursive: true });

// Gemini key from .env.local (only the AI keys; nothing else is read).
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(GEMINI_API_KEY|GOOGLE_AI_API_KEY|VITE_GOOGLE_AI_API_KEY|AI_COUNCIL_MODEL|PHOTO3D_MODEL)\s*=\s*"?([^"\r\n]*)"?/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

// 1. Cut out.
const cutPath = path.join(out, 'cutout.png');
if (!fs.existsSync(cutPath)) {
  const py = 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';
  const r = spawnSync(py, ['scripts/gamestudio/photo3d_cutout.py', photoPath, cutPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`cut-out failed: ${r.stderr || r.stdout}`);
  log(r.stdout.trim());
}

// 2. Scan.
const scanPath = path.join(out, `scan_${backend}.glb`);
if (!fs.existsSync(scanPath) || args.includes('--rescan')) {
  const health = await fetch('http://127.0.0.1:51124/health').then(r => r.json()).catch(() => null);
  if (!health?.ok) throw new Error('Tela 3D runtime is not running on :51124 (engines/tela-3d/restart.ps1)');
  log(`scanning with ${backend} (GPU ${health.gpuTempC} °C)…`);
  const image = `data:image/png;base64,${fs.readFileSync(cutPath).toString('base64')}`;
  const res = await fetch('http://127.0.0.1:51124/tela3d/image-to-mesh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, backend, quality: 'detail', options: {} }) });
  const data: any = await res.json();
  if (!res.ok || !data.glbBase64) throw new Error(`scan failed: ${data.error ?? res.status}`);
  fs.writeFileSync(scanPath, Buffer.from(data.glbBase64, 'base64'));
  fs.writeFileSync(path.join(out, `scan_${backend}.json`), JSON.stringify({ ...data, glbBase64: undefined }, null, 2));
  log(`scan: ${data.faces} faces in ${(data.executionTimeMs / 1000).toFixed(1)} s, steps ${JSON.stringify(data.steps)}`);
}

const decode = async (bytes: Uint8Array) => { const r = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: r.info.width, height: r.info.height, data: new Uint8Array(r.data) }; };
const scanRaw = await readGlb(new Uint8Array(fs.readFileSync(scanPath)), decode);
const fit = fitToClay(scanRaw.positions);
const scanMesh = toClay(scanRaw, fit);
const textured = backend !== 'hunyuan_mini';
log(`scan mesh ${scanMesh.indices.length / 3} tris, ${textured ? 'textured' : 'shape only'}`);
// The clay field depends only on the scan: voxelize once, keep it next to the scan.
const fieldPath = scanPath.replace(/\.glb$/, '.field24.bin');
const cachedField = fs.existsSync(fieldPath) && fs.statSync(fieldPath).mtimeMs >= fs.statSync(scanPath).mtimeMs ? decodeScanField(new Uint8Array(fs.readFileSync(fieldPath))) : undefined;
const scan = await scanField(scanMesh, 24, cachedField);
if (!cachedField) fs.writeFileSync(fieldPath, encodeScanField(scan.field));
log(cachedField ? 'scan clay field loaded from cache' : 'scan voxelized into clay (cached for next time)');

// The photo at working size, with its mask.
const H = 512;
const cut = await sharp(cutPath).resize({ height: H }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const photo: Picture = { width: cut.info.width, height: cut.info.height, data: new Uint8Array(cut.data) };

// 3. Align and set up the doc.
const tAlign = Date.now();
const coarse = alignToPhoto(scanMesh, photo, { workHeight: 128 });
log(`aligned (coarse): yaw ${coarse.camera.yawDeg.toFixed(1)}°, pitch ${coarse.camera.pitchDeg.toFixed(1)}°, IoU ${(coarse.iou * 100).toFixed(1)}% (${coarse.tried} tries)`);
const al = args.includes('--no-refine') ? coarse : refineCamera(scanMesh, photo, coarse.camera);
log(`aligned (refined): yaw ${al.camera.yawDeg.toFixed(1)}°, pitch ${al.camera.pitchDeg.toFixed(1)}°, roll ${(al.camera.rollDeg ?? 0).toFixed(1)}°, lens ${al.camera.fovDeg.toFixed(1)}°, IoU ${(al.iou * 100).toFixed(1)}% (${al.tried} tries, ${((Date.now() - tAlign) / 1000).toFixed(1)} s total)`);
const doc = { ...emptyModelDoc(`photo3d-${path.basename(out)}`, path.basename(photoPath)), subject: flag('subject', '')!, references: [{ name: 'photo', url: cutPath }], base: scanBase(scanPath, backend, fit) };
const history = new ModelHistory(doc);
history.apply({ op: 'setCamera', view: 'photo', camera: al.camera }, 'aria');

const png = async (p: Picture, width?: number) => {
  let s = sharp(Buffer.from(p.data), { raw: { width: p.width, height: p.height, channels: 4 } }).flatten({ background: '#ffffff' });
  if (width) s = s.resize({ width });
  return s.png().toBuffer();
};

// 4. Lanes.
const { geminiGenerate, geminiConfigured, laneModel } = await import('../../services/ai/geminiLane');
const usage: { model: string; inTokens: number; outTokens: number; costUsd: number | null; seconds: number }[] = [];
const eyeModel = flag('eye-model', process.env.PHOTO3D_EYE_MODEL || 'gemini-3.6-flash')!;
const agentModel = flag('agent-model', process.env.PHOTO3D_AGENT_MODEL || 'gemini-3.6-flash')!;
void laneModel;
/** Gemini answers 503 under load; geminiGenerate retries twice quickly, this waits longer, then tries the lite model. */
async function patient<T>(fn: (model: string) => Promise<T>, model: string): Promise<T> {
  for (const [wait, m] of [[0, model], [8000, model], [20000, model], [5000, 'gemini-3.5-flash-lite']] as [number, string][]) {
    if (wait) { log(`  (Gemini busy, retrying ${m} in ${wait / 1000} s)`); await new Promise(r => setTimeout(r, wait)); }
    try { return await fn(m); } catch (e: any) { if (![429, 500, 503].includes(Number(e?.status))) throw e; }
  }
  throw new Error('Gemini stayed unavailable');
}
const localUp = lane === 'local' ? await ensureLocalLlm(log) : false;
if (lane === 'local') log(localUp ? 'local lane: Gemma 4 E4B on the GPU (llama-server b12138)' : 'local lane unavailable: falling back to Gemini');
const lanes: Lanes = {
  look: async (inp) => {
    const p = gapPrompt({ subject: inp.subject, renders: inp.renders.map(r => r.name), round: inp.round, openItems: inp.openItems });
    if (localUp) {
      try {
        const parts: ({ text: string } | { png: Buffer })[] = [{ text: p.user }, { text: 'photo' }, { png: await png(inp.photo) }];
        for (const r of inp.renders) parts.push({ text: r.name }, { png: await png(r.picture) });
        const { text, usage: u } = await localChat({ system: p.system, parts, json: true, maxTokens: 2500 });
        usage.push({ ...u, costUsd: 0 });
        fs.writeFileSync(path.join(out, `eye_${inp.round}.json`), text);
        return { raw: text, source: u.model };
      } catch (e) { log(`  local eye failed (${(e as Error).message.slice(0, 120)}), asking Gemini`); }
    }
    if (lane === 'rules' || !geminiConfigured()) return { raw: { items: [] }, source: 'none (no vision lane)' };
    const parts: any[] = [{ text: p.user }, { inlineData: { mimeType: 'image/png', data: (await png(inp.photo)).toString('base64') } }];
    for (const r of inp.renders) parts.push({ text: r.name }, { inlineData: { mimeType: 'image/png', data: (await png(r.picture)).toString('base64') } });
    const { text, usage: u } = await patient(m => geminiGenerate({ model: m, system: p.system, contents: [{ role: 'user', parts }], json: true, maxTokens: 3000, temperature: 0.2, timeoutMs: 120_000 }), eyeModel);
    usage.push(u);
    fs.writeFileSync(path.join(out, `eye_${inp.round}.json`), text);
    return { raw: text, source: u.model };
  },
  ...(lane !== 'rules' ? {
    agent: async (p: { system: string; user: string }) => {
      if (localUp) {
        try {
          const { text, usage: u } = await localChat({ system: p.system, parts: [{ text: p.user }], json: true, maxTokens: 4000 });
          usage.push({ ...u, costUsd: 0 });
          fs.writeFileSync(path.join(out, `agent_${p.user.match(/Round (\d+)\./)?.[1] ?? 'x'}.json`), text);
          return text;
        } catch (e) { log(`  local agent failed (${(e as Error).message.slice(0, 120)}), asking Gemini`); }
      }
      const { text, usage: u } = await patient(m => geminiGenerate({ model: m, system: p.system, contents: p.user, json: true, maxTokens: 6000, temperature: 0.2, timeoutMs: 120_000 }), agentModel);
      fs.writeFileSync(path.join(out, `agent_${p.user.match(/Round (\d+)\./)?.[1] ?? 'x'}.json`), text);
      usage.push(u);
      return text;
    },
  } : {}),
};

const rounds = await runFidelityLoop(history, {
  scan, scanUntextured: !textured, photo, pictures: { photo }, resolution: 176, viewSize: 384,
  policy: { target: 0.95, aim: 0.99, minGain: 0.005, patience: 2, maxRounds },
  onRound: async (rec) => {
    const strip = sideBySide([photo, rec.renders[0].picture, ...rec.renders.slice(1).map(r => ({ ...r.picture }))]);
    fs.writeFileSync(path.join(out, `round_${rec.round}.png`), await png(strip));
    const s = rec.score;
    log(`round ${rec.round}: ${(s.overall * 100).toFixed(1)}%  [${Object.entries(s.axes).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}`).join(', ')}]  IoU ${(s.pixel!.iou * 100).toFixed(1)}%, ΔE ${s.pixel!.deltaE.toFixed(1)}${s.visionScore !== undefined ? `, eye says ${s.visionScore}` : ''}, strict ${(rec.strictScore.overall * 100).toFixed(1)}%  → ${rec.verdict.stop ? 'stop: ' : ''}${rec.verdict.why}`);
    if (rec.rejected) log(`  ↩ undid the last round: it took the score from ${(rec.rejected.from * 100).toFixed(1)}% to ${(rec.rejected.to * 100).toFixed(1)}%`);
    log(`  eye (${rec.report.source}): ${rec.report.items.length} items${rec.warnings.length ? `, ${rec.warnings.length} warnings` : ''}`);
    for (const w of rec.warnings) log(`    ! ${w}`);
    for (const it of rec.report.items) log(`    ${it.id} [${it.axis}/${it.kind}/${it.severity}] ${it.description}`);
    log(`  ${rec.planner}: ${rec.applied.length} ops${rec.dropped.length ? `, ${rec.dropped.length} dropped` : ''}`);
    const tm = rec.timings;
    log(`  time: measure ${(tm.measure / 1000).toFixed(1)} s, eye ${(tm.eye / 1000).toFixed(1)} s, agent ${(tm.agent / 1000).toFixed(1)} s, ${tm.trialCount} edit trials ${(tm.trials / 1000).toFixed(1)} s, round ${(rec.ms / 1000).toFixed(1)} s`);
    for (const t of rec.trials) log(`    ~ ${t}`);
    for (const a of rec.applied) log(`    + ${a}`);
    for (const d of rec.dropped) log(`    - ${d}`);
  },
}, lanes);

const final = rounds[rounds.length - 1];
fs.writeFileSync(path.join(out, 'rounds.json'), JSON.stringify(rounds.map(r => ({ ...r, renders: undefined })), null, 2));
fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(history.doc, null, 2));
fs.writeFileSync(path.join(out, 'history.txt'), history.entries.map(e => `${e.by === 'aria' ? 'Aria' : 'You'}: ${e.label}`).join('\n') + '\n');
const cost = usage.reduce((a, u) => a + (u.costUsd ?? 0), 0);
log(`done: ${rounds.map(r => (r.score.overall * 100).toFixed(1)).join(' → ')}%, ${final.verdict.why}; ${usage.length} model calls, $${cost.toFixed(4)}; written to ${out}`);
