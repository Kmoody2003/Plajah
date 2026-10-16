// runCouncilResearch — send one director of the Council of Art Directors to research a topic, on-device.
//
// Uses the council's own research lane (createCouncil().research: grounded search → attributable influences →
// the director's note, saved into their real Firestore profile), with the grounded lane served locally by
// scripts/localAi/council_local_lane.py (a Pokee-style search → read → verify loop on PokeeResearch-7B when it is
// on disk, else Qwen2.5-7B, else Nemotron 4B) and the director's own voice on the local deliberation lane.
//
// Run: npx tsx scripts/council/runCouncilResearch.ts WORLD_ECLECTIC "Byzantine gold leaf illumination"
//      COUNCIL_RESEARCH_LANE=gemini  uses the app's Gemini + Google Search lane instead (needs GEMINI_API_KEY)
//      COUNCIL_LANE=claude           writes the director's note with Claude instead of the local lane
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCouncil, makeStore } from '../../services/council/councilRoutes';
import { COUNCIL_DIRECTORS } from '../../services/council/councilDirectors';
import type { CouncilDirectorId } from '../../services/council/councilTypes';
import { ensureLocalLane, localGrounded, localHealth, localLane, stopLocalLane } from './localLane';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

const GCLOUD = path.join(process.env.LOCALAPPDATA || '', 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd');
let token = '', tokenAt = 0;
async function headers() {
  if (!token || Date.now() - tokenAt > 30 * 60e3) { token = execSync(`"${GCLOUD}" auth print-access-token`, { shell: true } as any).toString().trim(); tokenAt = Date.now(); }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function main() {
  const [id, ...rest] = process.argv.slice(2);
  const topic = rest.join(' ').trim();
  if (!(id in COUNCIL_DIRECTORS) || topic.length < 3) {
    console.error(`usage: npx tsx scripts/council/runCouncilResearch.ts <${Object.keys(COUNCIL_DIRECTORS).join('|')}> "<topic>"`);
    process.exit(2);
  }
  const useLocalModel = process.env.COUNCIL_LANE !== 'claude';
  const useLocalResearch = process.env.COUNCIL_RESEARCH_LANE !== 'gemini';
  if (useLocalModel || useLocalResearch) {
    await ensureLocalLane();
    const h = await localHealth();
    console.log(`[local] research model: ${h?.research_model ?? '?'} · route: ${JSON.stringify(h?.route ?? {})} · available: ${JSON.stringify(h?.available ?? {})}`);
  }
  const council = createCouncil({
    authMiddleware: null, apiLimiter: null, firestoreAuthHeaders: headers, store: makeStore(headers),
    ...(useLocalModel ? { model: localLane } : {}),
    ...(useLocalResearch ? { grounded: localGrounded } : {}),
  } as any);
  const t0 = Date.now();
  const result = await council.research(id as CouncilDirectorId, topic);
  const out = path.join('docs', 'ambo', 'council', 'research');
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${id}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}.json`);
  writeFileSync(file, JSON.stringify({ ...result, lane: useLocalResearch ? 'local' : 'gemini', seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
  console.log(`${COUNCIL_DIRECTORS[id as CouncilDirectorId].name} researched "${topic}" in ${Math.round((Date.now() - t0) / 1000)}s → ${file}`);
  for (const i of result.influences) console.log(`- ${i.finding}${i.source ? ` (${i.source.title}${i.source.url ? ` · ${i.source.url}` : ''})` : ''}`);
  console.log(`note: ${result.note}`);
  stopLocalLane();
}
main().catch(e => { console.error(e); stopLocalLane(); process.exit(1); });
