// Run the existing councils with a local session store, leaving account history untouched.
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { mkdir, writeFile } from 'node:fs/promises';
try { process.loadEnvFile('.env.local'); } catch {}
const out = 'artifacts/flux-council';
await mkdir(out, { recursive: true });
const ask = 'Direct four new real-time three.js Flux scenes: Deco Tapestry II (a new interpretation of the existing embroidered Art Deco gallery-wall visualizer), Flux Lattice, Flux Tunnel, Flux Aurora. Give each a distinct silhouette, material, palette and motion rule. My starting direction for II: midnight enamel, layered brass relief, stepped fans and choreographed grazing light. Preserve negative space. Use actual geometry and GPU shaders, no external assets. Audio controls light, amplitude and color; transport motion uses deterministic clip time, with no camera jumping on beats. Give specific buildable art direction and disagreements. This is a four-piece collection, not four palette swaps.';
async function model(system, user, maxTokens = 2600) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Council model HTTP ${r.status}`);
  return data.content.filter(x => x.type === 'text').map(x => x.text).join('\n');
}
const bridge = { name: 'council-model', setup(b) {
  b.onResolve({ filter: /geminiService$/ }, () => ({ path: 'model', namespace: 'council' }));
  b.onLoad({ filter: /.*/, namespace: 'council' }, () => ({ contents: 'export const callGemini = p => globalThis.askMotion(p);' }));
} };
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export {createCouncil} from './services/council/councilRoutes';
  export {deliberate,localAdvice} from './services/motion/council/motionCouncilService';
` }, bundle: true, write: false, platform: 'node', format: 'iife', globalName: 'Councils', plugins: [bridge], external: ['@google/genai'] });
const ctx = { console, process, fetch, AbortSignal, setTimeout, askMotion: p => model('Follow the Motion Council prompt and return its JSON schema.', p, 3600) };
runInNewContext(bundle.outputFiles[0].text, ctx);
const memory = new Map();
const store = { get: async p => memory.get(p) || null, set: async (p, o) => { memory.set(p, o); return true; }, list: async () => [] };
const art = ctx.Councils.createCouncil({ store, model, firestoreAuthHeaders: async () => ({}) });
const results = await Promise.all([
  art.deliberate('local-flux-build', { ask, surface: 'Flux / Pixels / DJ / Fabula', feeling: 'Material, architectural, musical; each scene has a distinct rule' }, { depth: 'FULL' }),
  ctx.Councils.deliberate({ ask, medium: 'generator' }, { fps: 60, tempo: 120, energy: 0.6, audioReactive: true }),
]);
await writeFile(`${out}/direction.json`, JSON.stringify({ art: results[0], motion: results[1] }, null, 2));
console.log(JSON.stringify({ artStatus: results[0].status, artError: results[0].error, synthesis: results[0].synthesis, motionSource: results[1].source, motionSummary: results[1].summary }));
