// runEviteMotionCouncil — the Motion Graphics & VFX Council (6 directors + a cast Studio Roster crew) directs the
// motion of each evite collection: entrance, idle, tilt parallax, the game/scratch moment, the RSVP celebration,
// and the reduced-motion version. Uses the council's own prompt + parser; the model lane is Claude.
//
// Run: npx tsx scripts/council/runEviteMotionCouncil.ts [collectionKey ...]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDeliberationPrompt, parseDeliberation } from '../../services/motion/council/motionCouncilService';
import { castCrew } from '../../services/motion/council/motionRoster';
import type { MotionBrief } from '../../services/motion/council/motionCouncilTypes';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

async function claude(prompt: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.COUNCIL_CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 6000, temperature: 0.8, messages: [{ role: 'user', content: prompt }] }),
    }).catch(() => null);
    const data: any = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) return data?.content?.[0]?.text || '';
    if (attempt < 6 && (!r || r.status === 429 || r.status >= 500)) { await new Promise(res => setTimeout(res, 8000 * (attempt + 1))); continue; }
    throw new Error(data?.error?.message || `Claude ${r?.status}`);
  }
}

const COMMON = 'Surface: a Plajah evite opened in a phone browser (390px wide, mid-range Android at 60 fps is the floor). It is a layered Tela document: generated art plate, 2 to 4 transparent cut-outs with tilt/pointer parallax, a WebGL effects layer through masks (foil, light, particles), and live text that must be readable within 1.5 s. Production is generative/procedural only. Direct: (1) the entrance, under 2.2 s, ending on a complete readable card; (2) the idle loop (what moves, how far, how slowly); (3) tilt response; (4) the interactive moment for this collection; (5) the RSVP "yes" celebration; (6) the prefers-reduced-motion version, which must still feel finished. Give frame counts, ease curves, durations and pixel distances.';

const BRIEFS: Record<string, { ask: string; guilds?: string[] }> = {
  kids: { ask: `Kids' birthday evites (dinosaurs, space, unicorns, mermaids, circus, slime lab…). Interactive moment: a 15-second tap game or scratch-and-reveal; every game shares one spring feel. ${COMMON}`, guilds: ['CARTOON', 'GAME', 'ANIME'] },
  kaiju: { ask: `Evites starring Plajah's kaiju mascots Chora and Reello (rigged 3D and 2D puppet versions exist, with spring-physics fins and a face rig). Interactive moment: tap a mascot and it bursts beyond the frame and reacts. ${COMMON}`, guilds: ['CARTOON', 'CG', 'ANIME'] },
  gaming: { ask: `Gaming evites: pixel arcade, retro 8-bit, neon esports, blocky voxel worlds, laser tag. Interactive moment: a "press start" boot-up and a tiny playable beat. ${COMMON}`, guilds: ['GAME', 'EXPERIMENTAL'] },
  sports: { ask: `Sports evites by sport (basketball, football, soccer, racing…) with cinematic arena light. Interactive moment: one physical action per sport (swish, kick, launch) on tap. ${COMMON}`, guilds: ['CG', 'GRAPHIC'] },
  adult: { ask: `Adult party evites: cocktails, disco, dinner parties, milestones, speakeasy, 80s/90s. Interactive moment: a single elegant reveal (curtain, toast, glitter-ball light sweep). ${COMMON}`, guilds: ['GRAPHIC', 'CG'] },
  formal: { ask: `Weddings, anniversaries and faith milestones: watercolor botanicals, painted villas, emerald deco, candlelight. Interactive moment: the envelope/seal opening and a foil-catch on tilt. Restraint over spectacle. ${COMMON}`, guilds: ['GRAPHIC', 'STOP_MOTION', 'WORLD'] },
  civic: { ask: `Patriotic and military evites (welcome home, Veterans Day, Independence Day fireworks, Memorial Day remembrance). Interactive moment: flag-cloth wave and fireworks for celebrations; stillness and a single light for remembrance. ${COMMON}`, guilds: ['GRAPHIC', 'CG'] },
  seasonal: { ask: `Holiday, life-moment and gathering evites (Diwali lamps, Lunar New Year, Halloween, baby shower, graduation, string-light backyards). Interactive moment: one holiday-true gesture each (light a lamp, toss a cap, pop a confetti cannon). ${COMMON}`, guilds: ['WORLD', 'CARTOON', 'GRAPHIC'] },
};

async function main() {
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BRIEFS);
  const out = path.join('docs', 'evites', 'motion'); mkdirSync(out, { recursive: true });
  for (const key of keys) {
    const b = BRIEFS[key];
    const crew = castCrew({ ask: b.ask, medium: 'mograph', guilds: b.guilds as any, size: 4 }).map(m => m.id);
    const brief: MotionBrief = { ask: b.ask, medium: 'mograph', crew, spec: { fps: 60, aspect: '9:16', energy: key === 'formal' ? 0.25 : key === 'kids' || key === 'gaming' ? 0.8 : 0.5 } };
    const t0 = Date.now();
    try {
      const prompt = buildDeliberationPrompt(brief, brief.spec!) + '\nKeep it tight: at most 5 moves per proposal, at most 8 plan moves, one-sentence moves. Output strictly valid JSON (escape quotes inside strings).';
      let d: ReturnType<typeof parseDeliberation> | null = null, lastErr: unknown;
      for (let i = 0; i < 3 && !d; i++) { try { d = parseDeliberation(await claude(prompt), brief, brief.spec!); } catch (e) { lastErr = e; } }
      if (!d) throw lastErr;
      writeFileSync(path.join(out, `${key}.json`), JSON.stringify(d, null, 2));
      console.log(`[${key}] ${Math.round((Date.now() - t0) / 1000)}s · crew ${crew.join(', ')} · proposals ${d.proposals.length} · plan ${d.plan.length}`);
    } catch (e) { console.log(`[${key}] FAILED ${(e as Error).message}`); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
