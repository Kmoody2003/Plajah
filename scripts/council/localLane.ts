// localLane — the Council of Art Directors' on-device lanes, as seen from the Node runners.
//
// Talks to scripts/localAi/council_local_lane.py (llama-cpp-python on the NVIDIA GPU, Gemma 2 2B / Nemotron 4B /
// Qwen2.5-7B / PokeeResearch-7B from D:\Plajah Models\llm) over http://127.0.0.1:51133:
//   localLane(system, user, maxTokens)  the deliberation lane: PROPOSE / DISPUTE / SYNTHESISE / REFLECT (deps.model)
//   localGrounded(prompt)               the research lane: a Pokee-style search → read → verify loop (deps.grounded)
// The server is spawned here when nothing is listening, calls are serialised (one GPU), and a lane that dies
// (a CUDA fault) is brought back and the round answered again.
//
// Env: COUNCIL_LOCAL_PORT (51133), COUNCIL_LOCAL_PYTHON (ComfyUI embedded python), and the server's own
// COUNCIL_LOCAL_PRESET / COUNCIL_LOCAL_ROUTE / COUNCIL_LOCAL_MODEL / COUNCIL_LOCAL_RESEARCH_MODEL pass through.
import { existsSync } from 'node:fs';
import path from 'node:path';

const rawFetch = globalThis.fetch;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const LOCAL_PORT = Number(process.env.COUNCIL_LOCAL_PORT || 51133);
export const LOCAL_URL = `http://127.0.0.1:${LOCAL_PORT}`;
export const PYTHON = process.env.COUNCIL_LOCAL_PYTHON || 'D:\\ComfyUI_windows_portable\\ComfyUI_windows_portable\\python_embeded\\python.exe';

export type CouncilRound = 'proposal' | 'dispute' | 'synthesis' | 'reflection';
/** Which council round a prompt belongs to, read off the JSON shape it asks for (councilPrompts.ts). */
export function roundOf(user: string): CouncilRound | undefined {
  if (user.includes('"humanTrace"')) return 'proposal';
  if (user.includes('"ariaSummary"')) return 'synthesis';
  if (user.includes('"against"')) return 'dispute';
  if (user.includes('{"note"')) return 'reflection';
  return undefined;
}
// Small models, small context: cap each round so six proposals + six disputes still fit the synthesis prompt.
const LOCAL_MAX: Record<CouncilRound, number> = { proposal: 520, dispute: 220, synthesis: 900, reflection: 120 };

/** Calls in flight against the lane (so a runner can wait for the last reflections before exiting). */
export let localInFlight = 0;

let localServer: import('node:child_process').ChildProcess | null = null;
export async function localHealthy(): Promise<boolean> {
  try { const r = await rawFetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
}
export async function localHealth(): Promise<any> {
  try { const r = await rawFetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function ensureLocalLane() {
  if (await localHealthy()) { console.log(`[local] council lane already listening on ${LOCAL_URL}`); return; }
  const { spawn } = await import('node:child_process');
  if (!existsSync(PYTHON)) throw new Error(`local lane needs llama-cpp-python; ${PYTHON} not found (set COUNCIL_LOCAL_PYTHON)`);
  localServer = spawn(PYTHON, ['-u', path.resolve('scripts/localAi/council_local_lane.py')], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  localServer.stdout!.on('data', (b: Buffer) => process.stdout.write(b.toString()));
  localServer.stderr!.on('data', (b: Buffer) => { const s = b.toString(); if (/error|Traceback/i.test(s)) process.stderr.write(s); });
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await localHealthy()) return; if (localServer.exitCode !== null) break; }
  throw new Error('local council lane did not come up (see scripts/localAi/council_local_lane.py output above)');
}
/** Stops a lane this process spawned (one another process started is left alone). */
export function stopLocalLane() {
  if (localServer && localServer.exitCode === null) localServer.kill();
}

// The council fires six director calls at once; one GPU answers one at a time. Queue here rather than on the socket,
// where a request left waiting in the server's backlog past Node's 300 s header timeout gets aborted.
let localQueue: Promise<unknown> = Promise.resolve();
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = localQueue.then(job);
  localQueue = run.catch(() => undefined);
  return run;
}

async function post(route: string, body: Record<string, unknown>): Promise<any> {
  localInFlight++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await rawFetch(`${LOCAL_URL}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30 * 60e3) });
        const data: any = await r.json().catch(() => ({}));
        if (r.ok) return data;
        throw new Error(data?.error || `local lane ${r.status}`);
      } catch (e) {
        if (attempt >= 2) throw e;
        // A CUDA fault takes the whole lane process down; bring it back and answer again.
        if (!(await localHealthy())) { console.log(`[local] lane is down (${(e as Error).message}); restarting it`); await ensureLocalLane(); }
        else await sleep(3000);
      }
    }
  } finally { localInFlight--; }
}

/** Deliberation lane: drop-in for CouncilDeps.model. */
export function localLane(system: string, user: string, maxTokens = 1200): Promise<string> {
  const round = roundOf(user);
  return queued(async () => String((await post('/complete', { system, user, schema: round, maxTokens: Math.min(maxTokens, round ? LOCAL_MAX[round] : 600) }))?.text || ''));
}

/** Research lane: drop-in for CouncilDeps.grounded. The prompt is researchUser(id, topic) from councilPrompts.ts. */
export function localGrounded(prompt: string): Promise<string> {
  return queued(async () => String((await post('/research', { prompt }))?.text || ''));
}
