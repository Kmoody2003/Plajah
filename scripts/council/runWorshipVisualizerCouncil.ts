// runWorshipVisualizerCouncil — convene the real Council of Art Directors (services/council) on each of the
// 72 Ambo church / worship / praise / hymnal / scripture visualizers: one full deliberation per visualizer.
//
// Uses the council's own engine (createCouncil: PROPOSE -> DISPUTE -> SYNTHESISE -> REFLECT), the directors' real,
// evolving profiles in Firestore, and persists sessions + reflections exactly as the app does (the app's own
// Firestore store), mirrored under docs/ambo/council so the apply step works offline:
//   docs/ambo/council/manifest.json         visualizer id -> session id / status / casting
//   docs/ambo/council/briefs/<vis id>.json  the brief each visualizer was taken to the room with
//   docs/ambo/council/sessions/<id>.json    the deliberation (proposals, disputes, synthesis, reflections)
//   docs/ambo/council/profiles/<dir>.json   the directors' profiles as they moved during the run
//
// Run:  npx tsx scripts/council/runWorshipVisualizerCouncil.ts [visualizerId ...]
//       Resumable: visualizers whose session is DONE are skipped unless COUNCIL_FORCE=1.
// Lane: Claude (the council's own lane, as councilRoutes) by default; COUNCIL_LANE=gemini is an explicit fallback;
// COUNCIL_LANE=local runs the council on-device (scripts/council/localLane.ts → scripts/localAi/council_local_lane.py).
// Then: npx tsx scripts/council/applyWorshipVisualizerCouncil.ts
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCouncil, makeStore, type CouncilStore } from '../../services/council/councilRoutes';
import type { CouncilBrief, Deliberation } from '../../services/council/councilTypes';
import { ensureLocalLane, localInFlight, localLane, stopLocalLane } from './localLane';
import { briefFor } from './worshipBriefs';
export { briefFor };
import {
  ALL_WORSHIP_VISUALIZERS,
  type WorshipCategory,
} from '../../services/ambo/worshipVisualizers';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

// Network hiccups (ETIMEDOUT on Firestore when many directors read profiles at once) retry instead of killing the run.
const rawFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  for (let a = 0; ; a++) {
    try { return await rawFetch(input, init); }
    catch (e) { if (a >= 4) throw e; await new Promise(r => setTimeout(r, 2000 * (a + 1))); }
  }
}) as typeof fetch;

const OWNER_UID = 'hiP7PGj15eTq0r0ZH2XwN00AS2h1';
const OUT = path.join('docs', 'ambo', 'council');
const BRIEFS = path.join(OUT, 'briefs');
const SESSIONS = path.join(OUT, 'sessions');
const PROFILES = path.join(OUT, 'profiles');
const MANIFEST = path.join(OUT, 'manifest.json');
for (const d of [BRIEFS, SESSIONS, PROFILES]) mkdirSync(d, { recursive: true });

const GCLOUD = path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd');
let token = '', tokenAt = 0;
async function headers() {
  if (!token || Date.now() - tokenAt > 30 * 60e3) { token = execSync(`"${GCLOUD}" auth print-access-token`, { shell: true } as any).toString().trim(); tokenAt = Date.now(); }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/* ─── Model lanes ────────────────────────────────────────────────────────────────────────── */
let inFlight = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The council's own Claude lane (same model + settings as councilRoutes), with retry and a generous output budget. */
async function claudeLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  inFlight++;
  try {
    for (let attempt = 0; ; attempt++) {
      let r: Response;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: Math.max(4096, maxTokens), temperature: 0.9, system, messages: [{ role: 'user', content: user }] }),
          signal: AbortSignal.timeout(150000),
        });
      } catch (e) { if (attempt >= 4) throw e; await sleep(5000 * (attempt + 1)); continue; }
      const data: any = await r.json().catch(() => ({}));
      if (r.ok) return data?.content?.[0]?.text || '';
      console.log(`[lane] HTTP ${r.status} ${data?.error?.message || ''}`);
      if ((r.status === 429 || r.status === 529 || r.status >= 500) && attempt < 8) { await sleep(8000 * (attempt + 1)); continue; }
      throw new Error(data?.error?.message || `Claude ${r.status}`);
    }
  } finally { inFlight--; }
}

async function geminiLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  inFlight++;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '' });
    for (let attempt = 0; ; attempt++) {
      try {
        const r: any = await genai.models.generateContent({
          model: process.env.COUNCIL_GEMINI_MODEL || 'gemini-3.5-flash',
          contents: user,
          config: { systemInstruction: system, temperature: 0.9, maxOutputTokens: Math.max(4096, maxTokens * 4) },
        });
        return r?.text || '';
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/.test(msg) || /PerDay/.test(msg) || attempt >= 6) throw e;
        await sleep(15000 * (attempt + 1));
      }
    }
  } finally { inFlight--; }
}

/* ─── The briefs live in worshipBriefs.ts (shared with runWorshipCouncilStaged.ts) ─────────── */

/* ─── Store: the app's Firestore store, mirrored to docs/ambo/council ─────────────────────── */
function mirror(p: string, obj: Record<string, any>) {
  const s = /^users\/[^/]+\/council_sessions\/([a-z0-9]+)$/.exec(p);
  if (s) { writeFileSync(path.join(SESSIONS, `${s[1]}.json`), JSON.stringify(obj, null, 2)); return; }
  const d = /^council_directors\/([A-Z_]+)$/.exec(p);
  if (d) writeFileSync(path.join(PROFILES, `${d[1]}.json`), JSON.stringify(obj, null, 2));
}

type ManifestEntry = { number: number; name: string; category: WorshipCategory; lane: string; sessionId?: string; status: 'DONE' | 'FAILED'; lead?: string; counterpoint?: string; editor?: string; proposals?: number; disputes?: number; at: number; seconds: number; error?: string };
type Manifest = { lane: string; startedAt: number; updatedAt: number; sessions: Record<string, ManifestEntry> };

async function main() {
  const laneName = process.env.COUNCIL_LANE === 'gemini' ? 'gemini' : process.env.COUNCIL_LANE === 'local' ? 'local' : 'claude';
  const lane = laneName === 'gemini' ? geminiLane : laneName === 'local' ? localLane : claudeLane;
  if (laneName === 'claude' && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured (set COUNCIL_LANE=gemini or COUNCIL_LANE=local).');
  if (laneName === 'local') await ensureLocalLane();
  const firestore = makeStore(headers);
  const store: CouncilStore = { get: firestore.get, list: firestore.list, set: async (p, obj) => { mirror(p, obj); return firestore.set(p, obj); } };
  const council = createCouncil({ authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: headers, store, model: lane } as any);

  const manifest: Manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { lane: laneName, startedAt: Date.now(), updatedAt: Date.now(), sessions: {} };
  const save = () => { manifest.updatedAt = Date.now(); writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2)); };
  const wanted = process.argv.slice(2);
  const force = !!process.env.COUNCIL_FORCE;
  const queue = ALL_WORSHIP_VISUALIZERS
    .filter(v => !wanted.length || wanted.includes(v.id))
    .filter(v => force || manifest.sessions[v.id]?.status !== 'DONE');
  // One GPU answers one director at a time, so the local lane runs one deliberation at a time.
  const concurrency = Number(process.env.COUNCIL_CONCURRENCY || (laneName === 'local' ? 1 : 4));
  console.log(`[council] ${queue.length} visualizer(s) to take to the room · lane ${laneName} · concurrency ${concurrency} · ${Object.values(manifest.sessions).filter(s => s.status === 'DONE').length} already DONE`);

  const worker = async () => {
    for (let vis = queue.shift(); vis; vis = queue.shift()) {
      const brief = briefFor(vis);
      writeFileSync(path.join(BRIEFS, `${vis.id}.json`), JSON.stringify(brief, null, 2));
      const t0 = Date.now();
      let d: Deliberation | null = null;
      try { d = await council.deliberate(OWNER_UID, brief, { depth: 'FULL' }); }
      catch (e) { console.log(`[${vis.id}] threw ${(e as Error).message}`); }
      const seconds = Math.round((Date.now() - t0) / 1000);
      const s = d?.synthesis;
      manifest.sessions[vis.id] = {
        number: vis.number, name: vis.name, category: vis.category, lane: laneName, sessionId: d?.id, status: d?.status === 'DONE' ? 'DONE' : 'FAILED',
        lead: s?.lead, counterpoint: s?.counterpoint, editor: s?.editor, proposals: d?.proposals.length, disputes: d?.disputes.length,
        at: d?.createdAt ?? t0, seconds, error: d?.error,
      };
      save();
      console.log(`[${vis.id}] ${d?.status ?? 'FAILED'} in ${seconds}s · proposals ${d?.proposals.length ?? 0} · disputes ${d?.disputes.length ?? 0} · lead ${s?.lead ?? '-'} / ${s?.counterpoint ?? '-'} / ${s?.editor ?? '-'}${d?.error ? ' · ' + d.error : ''}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Reflections run after each answer (the team's taste moving); wait for the last model calls to land before exiting.
  const t1 = Date.now();
  while ((inFlight > 0 || localInFlight > 0) && Date.now() - t1 < 240000) await sleep(2000);
  await sleep(5000);
  const all = Object.values(manifest.sessions);
  console.log(`done · DONE ${all.filter(s => s.status === 'DONE').length} · FAILED ${all.filter(s => s.status === 'FAILED').length} · leads ${JSON.stringify(all.reduce((m, s) => { if (s.lead) m[s.lead] = (m[s.lead] || 0) + 1; return m; }, {} as Record<string, number>))}`);
  stopLocalLane();
}
main().catch(e => { console.error(e); process.exit(1); });
