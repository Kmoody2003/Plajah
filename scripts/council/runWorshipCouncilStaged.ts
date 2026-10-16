// runWorshipCouncilStaged — the local Art Council, one model at a time, strictly sequential.
//
// The six-director parallel deliberation (runWorshipVisualizerCouncil.ts) crashed the laptop when 7B-class models,
// the diffusion sidecar and dev servers shared one 8 GB GPU for hours. This runner batches by STAGE so exactly one
// model is ever resident and every generation is short:
//   Stage A  Gemma 2 2B       — a proposal for every pending visualizer, in the voice of that visualizer's director  (≈350 tok)
//   Stage B  Nemotron-Mini 4B — a second proposal, in the voice of that director's standing rival                   (≈350 tok)
//   Stage C  PokeeResearch-7B — compares and contrasts the two, keeps the best of each, adds its own take, and writes
//            the council's synthesis (lead / counterpoint / editor, direction, quotes)                              (≈600 tok)
// Each stage loads its model, runs the whole batch, then UNLOADS it (VRAM returned) before the next stage starts.
// Every stage's output is written to docs/ambo/council/staged/<stage>/<visualizer>.json as it lands, so a run can
// resume mid-stage; finished syntheses become ordinary council sessions (docs/ambo/council/sessions/<id>.json +
// manifest.json, lane "local-staged") that applyWorshipVisualizerCouncil.ts consumes unchanged.
//
// This runner NEVER starts or stops a model process. The lane server is started by hand, when the machine is ready:
//     D:\ComfyUI_windows_portable\ComfyUI_windows_portable\python_embeded\python.exe -u scripts\localAi\council_local_lane.py
// and the lane enforces the GPU-side rails (scripts/localAi/council_local_lane.py):
//   • refuses to start while the diffusion sidecar, ComfyUI or another model process is running (names it)
//   • full GPU offload only — a model that does not fit in free VRAM is refused; there is no CPU fallback
//   • ≤ 4 CPU threads for the model; n_ctx 4096; no grammar sampling
//   • thermal guard: no generation starts while the GPU is ≥ 83 °C; it waits for ≤ 72 °C
// This runner runs no dev server, build or type-check.
//
// Run:  npx tsx scripts/council/runWorshipCouncilStaged.ts --pilot 3        # calm-11 + the next two pending, then stop
//       npx tsx scripts/council/runWorshipCouncilStaged.ts                  # every pending visualizer
//       --only <id,id,…>   --stage A|B|C (a single stage)   --force (redo stages already on disk)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COUNCIL_DIRECTORS } from '../../services/council/councilDirectors';
import { directorSystem, proposalUser, parseJson, readProposal, readSynthesis, synthesisSystem, briefText } from '../../services/council/councilPrompts';
import type { CouncilBrief, CouncilDirectorId, Deliberation, DirectorProposal } from '../../services/council/councilTypes';
import { ALL_WORSHIP_VISUALIZERS, resolveDirector, type CouncilDirector, type WorshipVisualizerDef } from '../../services/ambo/worshipVisualizers';
import { briefFor } from './worshipBriefs';
import { localHealth, LOCAL_URL } from './localLane';

const OUT = path.join('docs', 'ambo', 'council');
const STAGED = path.join(OUT, 'staged');
const SESSIONS = path.join(OUT, 'sessions');
const MANIFEST = path.join(OUT, 'manifest.json');
for (const d of ['A', 'B', 'C'].map(s => path.join(STAGED, s))) mkdirSync(d, { recursive: true });

const STAGES = {
  A: { model: 'gemma-2-2b', maxTokens: 350, label: 'Gemma 2 2B' },
  B: { model: 'nemotron-4b', maxTokens: 350, label: 'Nemotron-Mini 4B' },
  C: { model: 'pokee-7b', maxTokens: 600, label: 'PokeeResearch-7B' },
} as const;
type StageKey = keyof typeof STAGES;

/** The kit's director voices → council ids. */
const ID_OF: Record<CouncilDirector, CouncilDirectorId> = {
  'Classical Mind': 'CLASSICAL', 'Baroque Dramatist': 'BAROQUE', 'Radical Minimalist': 'RADICAL_MINIMAL',
  'Futurist': 'FUTURIST', 'World-Eclectic Traveller': 'WORLD_ECLECTIC', 'Rebellious Hand': 'REBEL',
};
/** Director A = the voice the visualizer already names (or the subgenre rule); B = A's first standing argument. */
function castFor(vis: WorshipVisualizerDef): { a: CouncilDirectorId; b: CouncilDirectorId } {
  const a = ID_OF[resolveDirector(vis)];
  const b = (Object.keys(COUNCIL_DIRECTORS[a].tensions)[0] as CouncilDirectorId) || 'RADICAL_MINIMAL';
  return { a, b };
}

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const PILOT = opt('pilot') ? Number(opt('pilot')) : 0;
const ONLY = opt('only')?.split(',').map(s => s.trim()).filter(Boolean);
const STAGE_ONLY = opt('stage') as StageKey | undefined;
const FORCE = args.includes('--force');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Manifest = { lane: string; startedAt: number; updatedAt: number; sessions: Record<string, any> };
const manifest: Manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { lane: 'local-staged', startedAt: Date.now(), updatedAt: Date.now(), sessions: {} };
const saveManifest = () => { manifest.updatedAt = Date.now(); writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2)); };

/* ── lane calls (the lane is already running; this file never spawns it) ────────────────────────────────────── */
let thermalWaitedMs = 0;
/** POST to the lane; a 503 thermal pause is waited out here (10 s polls of /health) and the call retried. */
async function post(route: string, body: Record<string, unknown>): Promise<any> {
  for (;;) {
    const r = await fetch(`${LOCAL_URL}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30 * 60e3) });
    const data: any = await r.json().catch(() => ({}));
    if (r.status === 503 && data?.thermalPause) {
      process.stdout.write(`   thermal pause: GPU ${data.temp} °C, waiting for ≤ ${data.resumeAt} °C`);
      const t0 = Date.now();
      for (;;) {
        await sleep(10000);
        const g = await gpu();
        process.stdout.write(` ${g.temp}`);
        if (g.temp > 0 && g.temp <= Number(data.resumeAt)) break;
      }
      thermalWaitedMs += Date.now() - t0;
      console.log(` → resuming after ${Math.round((Date.now() - t0) / 1000)} s`);
      continue;
    }
    if (!r.ok) throw new Error(data?.error || `${route} ${r.status}`);
    return data;
  }
}
async function gpu(): Promise<{ temp: number; freeMb: number }> {
  const h = await localHealth();
  return { temp: Number(h?.gpu?.temp ?? -1), freeMb: Number(h?.gpu?.freeMb ?? -1) };
}

interface StageStats { stage: StageKey; model: string; items: number; loadMs: number; genMs: number; tokens: number; peakTemp: number; tempBefore: number; tempAfter: number; vramMb: number; waitedMs: number }

/* ── per-visualizer prompts ─────────────────────────────────────────────────────────────────────────────────── */
function proposalPrompt(brief: CouncilBrief, self: CouncilDirectorId, other: CouncilDirectorId) {
  return { system: directorSystem(self), user: proposalUser(brief, [other]) + '\n\nKeep every field to one or two sentences: the whole JSON must stay under 300 words.' };
}
function synthesisPrompt(brief: CouncilBrief, a: DirectorProposal, b: DirectorProposal) {
  const line = (p: DirectorProposal) => `[${p.directorId}] ${COUNCIL_DIRECTORS[p.directorId].name} — "${p.title}": ${p.idea} | geometry: ${p.geometry} | type: ${p.typography} | image: ${p.imageLogic} | texture: ${p.texture} | motion: ${p.motion} | production: ${p.productionMethod} | trace: ${p.humanTrace} | risk: ${p.risk}`;
  const others = (Object.keys(COUNCIL_DIRECTORS) as CouncilDirectorId[]).filter(i => i !== a.directorId && i !== b.directorId);
  return {
    system: synthesisSystem(),
    user: `${briefText(brief)}

TWO PROPOSALS ARE ON THE TABLE:
${line(a)}
${line(b)}

Compare and contrast them: say concretely where they agree, where they differ, and which is stronger on geometry, typography, image logic, texture and motion. Keep the best of EACH, then add your own take — one thing neither proposed that the brief needs. Choose the lead from these two (${a.directorId} or ${b.directorId}); the other is the counterpoint; the editor is whichever of ${others.join(', ')} your own take speaks in.

Return JSON exactly:
{"lead":"${a.directorId}|${b.directorId}","counterpoint":"the other one","editor":"one of ${others.join('|')}","comparison":"two or three sentences: where they agree, where they split, which is stronger on what","direction":"the direction you are recommending, concrete: geometry, type, image, texture, motion, production — two to four sentences, drawing the best from both","keepFromCounterpoint":"the one thing from the counterpoint that must survive","editorCut":"your own take: what you add or remove that neither proposed, and why","openDecision":"the single decision the user must make","ariaSummary":"what you say to the user: two short paragraphs, naming where the two disagreed and which side you took","quotes":[{"directorId":"…","line":"a short line in that director's own words, drawn from their proposal"}]}
Keep the whole JSON under 450 words.`,
  };
}

/* ── stages ─────────────────────────────────────────────────────────────────────────────────────────────────── */
async function runStage(stage: StageKey, batch: WorshipVisualizerDef[], briefs: Map<string, CouncilBrief>): Promise<StageStats> {
  const cfg = STAGES[stage];
  const todo = batch.filter(v => FORCE || !existsSync(path.join(STAGED, stage, `${v.id}.json`)));
  const stats: StageStats = { stage, model: cfg.model, items: todo.length, loadMs: 0, genMs: 0, tokens: 0, peakTemp: 0, tempBefore: (await gpu()).temp, tempAfter: 0, vramMb: 0, waitedMs: 0 };
  if (!todo.length) { console.log(`[stage ${stage}] nothing to do (all ${batch.length} on disk)`); return stats; }
  console.log(`[stage ${stage}] ${cfg.label}: loading for ${todo.length} visualizer(s) · GPU ${stats.tempBefore} °C`);
  let t0 = Date.now();
  const loaded = await post('/load', { model: cfg.model });
  stats.loadMs = Date.now() - t0; stats.vramMb = Number(loaded?.vramMb ?? 0);
  console.log(`[stage ${stage}] loaded in ${(stats.loadMs / 1000).toFixed(1)} s · ${stats.vramMb} MB on the GPU`);
  try {
    for (const vis of todo) {
      const brief = briefs.get(vis.id)!;
      const { a, b } = castFor(vis);
      let body: { system: string; user: string }, schema: string;
      const prev: { a?: DirectorProposal; b?: DirectorProposal } = {};
      if (stage === 'A') { body = proposalPrompt(brief, a, b); schema = 'proposal'; }
      else if (stage === 'B') { body = proposalPrompt(brief, b, a); schema = 'proposal'; }
      else {
        const fa = path.join(STAGED, 'A', `${vis.id}.json`), fb = path.join(STAGED, 'B', `${vis.id}.json`);
        if (!existsSync(fa) || !existsSync(fb)) { console.log(`[stage C] ${vis.id}: missing stage A or B output, skipped`); continue; }
        prev.a = JSON.parse(readFileSync(fa, 'utf8')).proposal;
        prev.b = JSON.parse(readFileSync(fb, 'utf8')).proposal;
        body = synthesisPrompt(brief, prev.a!, prev.b!); schema = 'synthesis';
      }
      t0 = Date.now();
      let r = await post('/complete', { model: cfg.model, system: body.system, user: body.user, maxTokens: cfg.maxTokens, schema });
      // The small models sometimes run past the cap before the JSON closes (Gemma on a wordy brief): one more go, roomier and told to be brief.
      if (parseJson(String(r?.text || '')) === null) {
        const usedA = Number(r?.usage?.completion_tokens ?? 0);
        console.log(`[stage ${stage}] ${vis.id}: unreadable after ${usedA} tok, retrying with a larger budget`);
        const r2 = await post('/complete', { model: cfg.model, system: body.system, user: body.user + '\n\nKeep every field to one short sentence so the whole JSON object closes well within the length limit.', maxTokens: cfg.maxTokens + 300, schema });
        if (r2?.usage) r2.usage.completion_tokens = Number(r2.usage.completion_tokens ?? 0) + usedA;
        r = r2;
      }
      const waited = thermalWaitedMs; thermalWaitedMs = 0;
      const ms = Date.now() - t0 - waited;
      stats.genMs += ms; stats.tokens += Number(r?.usage?.completion_tokens ?? 0); stats.waitedMs += waited;
      stats.peakTemp = Math.max(stats.peakTemp, Number(r?.gpu?.peakTemp ?? r?.gpu?.temp ?? 0));
      const raw = parseJson(String(r?.text || ''));
      if (stage !== 'C') {
        const self = stage === 'A' ? a : b;
        const proposal = readProposal(self, raw);
        if (!proposal) { console.log(`[stage ${stage}] ${vis.id}: proposal unreadable, skipped`); continue; }
        writeFileSync(path.join(STAGED, stage, `${vis.id}.json`), JSON.stringify({ visualizer: vis.id, director: self, model: cfg.model, ms, tokens: r?.usage?.completion_tokens, proposal }, null, 2));
        console.log(`[stage ${stage}] ${vis.id} · ${COUNCIL_DIRECTORS[self].name} · "${proposal.title}" · ${r?.usage?.completion_tokens ?? '?'} tok · ${(ms / 1000).toFixed(1)} s · GPU ${r?.gpu?.temp ?? '?'} °C`);
      } else {
        const ids = Object.keys(COUNCIL_DIRECTORS) as CouncilDirectorId[];
        const syn = readSynthesis(raw, ids);
        if (!syn) { console.log(`[stage C] ${vis.id}: synthesis unreadable, skipped`); continue; }
        // lead / counterpoint must be the two proposers; the editor is the voice of Pokee's own take
        if (![a, b].includes(syn.lead)) syn.lead = a;
        syn.counterpoint = syn.lead === a ? b : a;
        if (syn.editor === syn.lead || syn.editor === syn.counterpoint) syn.editor = ids.find(i => i !== a && i !== b)!;
        const comparison = String(raw?.comparison || '').slice(0, 900);
        const session: Deliberation & { comparison?: string; lane?: string } = {
          id: `staged${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, uid: 'local-staged', createdAt: Date.now(), depth: 'QUICK', status: 'DONE',
          brief, directors: [a, b], proposals: [prev.a!, prev.b!], disputes: [], synthesis: syn, reflections: [], comparison, lane: 'local-staged',
        };
        writeFileSync(path.join(SESSIONS, `${session.id}.json`), JSON.stringify(session, null, 2));
        writeFileSync(path.join(STAGED, 'C', `${vis.id}.json`), JSON.stringify({ visualizer: vis.id, model: cfg.model, ms, tokens: r?.usage?.completion_tokens, sessionId: session.id, synthesis: syn, comparison }, null, 2));
        manifest.sessions[vis.id] = { number: vis.number, name: vis.name, category: vis.category, lane: 'local-staged', sessionId: session.id, status: 'DONE', lead: syn.lead, counterpoint: syn.counterpoint, editor: syn.editor, proposals: 2, disputes: 0, at: session.createdAt, seconds: Math.round(ms / 1000) };
        saveManifest();
        console.log(`[stage C] ${vis.id} · lead ${syn.lead} / ${syn.counterpoint} / editor ${syn.editor} · ${r?.usage?.completion_tokens ?? '?'} tok · ${(ms / 1000).toFixed(1)} s · GPU ${r?.gpu?.temp ?? '?'} °C`);
      }
    }
  } finally {
    await post('/unload', {});
    stats.tempAfter = (await gpu()).temp;
    console.log(`[stage ${stage}] unloaded · GPU ${stats.tempAfter} °C`);
  }
  return stats;
}

async function main() {
  const pending = ALL_WORSHIP_VISUALIZERS.filter(v => manifest.sessions[v.id]?.status !== 'DONE' || FORCE);
  let batch = ONLY ? ALL_WORSHIP_VISUALIZERS.filter(v => ONLY.includes(v.id)) : pending;
  if (PILOT) batch = batch.slice(0, PILOT);
  if (!batch.length) { console.log('nothing pending'); return; }
  console.log(`[staged] ${batch.length} visualizer(s): ${batch.map(v => v.id).join(', ')}`);
  const briefs = new Map(batch.map(v => [v.id, briefFor(v)] as const));
  const h = await localHealth();
  if (!h) throw new Error(`the council lane is not running on ${LOCAL_URL}. Start it by hand when the machine is ready:\n  D:\\ComfyUI_windows_portable\\ComfyUI_windows_portable\\python_embeded\\python.exe -u scripts\\localAi\\council_local_lane.py`);
  if (h.blockedBy?.length) throw new Error(`refusing to run: other GPU/model processes are running: ${h.blockedBy.join('; ')}`);
  if (!h.staged) throw new Error('the running lane is an older build without /load and /unload; restart it from the current scripts/localAi/council_local_lane.py');
  const stats: StageStats[] = [];
  const t0 = Date.now();
  for (const stage of (STAGE_ONLY ? [STAGE_ONLY] : (['A', 'B', 'C'] as StageKey[]))) {
    stats.push(await runStage(stage, batch, briefs));
    await sleep(3000); // let the driver settle between models
  }
  const total = Date.now() - t0;
  const peak = Math.max(0, ...stats.map(s => s.peakTemp));
  console.log('\n## staged council — timings\n');
  console.log('| stage | model | items | load s | gen s | tok | tok/s | peak °C | before→after °C | VRAM MB | thermal waits s |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of stats) console.log(`| ${s.stage} | ${s.model} | ${s.items} | ${(s.loadMs / 1000).toFixed(1)} | ${(s.genMs / 1000).toFixed(1)} | ${s.tokens} | ${s.genMs ? (s.tokens / (s.genMs / 1000)).toFixed(1) : '-'} | ${s.peakTemp} | ${s.tempBefore}→${s.tempAfter} | ${s.vramMb} | ${(s.waitedMs / 1000).toFixed(0)} |`);
  const perVis = total / batch.length;
  const remaining = ALL_WORSHIP_VISUALIZERS.filter(v => manifest.sessions[v.id]?.status !== 'DONE').length;
  console.log(`\ntotal ${(total / 1000).toFixed(0)} s for ${batch.length} → ${(perVis / 1000).toFixed(0)} s per visualizer · peak GPU ${peak} °C · remaining ${remaining} ≈ ${Math.round(remaining * perVis / 60000)} min at this pace`);
  writeFileSync(path.join(STAGED, `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`), JSON.stringify({ batch: batch.map(v => v.id), stats, totalMs: total, peakTemp: peak }, null, 2));
}
main().catch(e => { console.error(String(e?.message || e)); process.exit(1); });
