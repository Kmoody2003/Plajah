// runFluxCanvasCouncil — convene the councils on each Flux Canvas image and turn their direction into data.
//
// Seats at the table, from the platform's own councils:
//   Art Council — the six directors (services/council/councilDirectors)
//   Game & Interactive / 3D council — the four specialists (services/aria/ariaCreativeRoles)
//   Motion & VFX council — the 3D Dramatist, Generative Artist and Signal Bender (services/motion/council)
//   Lighting Director — calls looks from the Plajah looks library (services/lighting/looks)
//
// Two cloud passes per image (Gemini, which sees the image itself):
//   1. DELIBERATE — every seat proposes and disputes how the image should play the song, section by section.
//   2. SYNTHESISE — the room settles on one WorldDirection, in the engine's vocabulary only.
// Output: docs/flux-canvas/council/<id>.json (full record) and
//         components/plajahPixels/engine/core/imageWorldDirection.data.ts (what the engine reads).
//
// Run: npx tsx scripts/fluxCanvas/runFluxCanvasCouncil.ts [imageId ...]   (resumable; COUNCIL_FORCE=1 redoes)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { geminiGenerate, summarizeUsage, type GeminiUsage } from '../../services/ai/geminiLane';
import { COUNCIL_LIST } from '../../services/council/councilDirectors';
import { ARIA_GAME_DIRECTOR_COUNCIL } from '../../services/aria/ariaCreativeRoles';
import { MOTION_PERSONAS } from '../../services/motion/council/motionCouncilPersonas';
import { LOOK_PRESETS } from '../../services/lighting/looks';
import { IMAGE_WORLDS } from '../../components/plajahPixels/engine/core/fluxImageWorlds';
import { SECTION_KINDS, WORLD_SHOTS, PLATE_SHOTS, DROP_GESTURES, BUILD_GESTURES, BREAK_GESTURES, resolveDirection, type WorldDirection } from '../../components/plajahPixels/engine/core/imageWorldDirection';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }

const OUT = path.join('docs', 'flux-canvas', 'council'); mkdirSync(OUT, { recursive: true });
const DATA = path.join('components', 'plajahPixels', 'engine', 'core', 'imageWorldDirection.data.ts');
const usage: GeminiUsage[] = [];
const MODEL = process.env.IMAGE_WORLDS_COUNCIL_MODEL || undefined;

const art = COUNCIL_LIST.map(d => `- ${d.name}, ${d.epithet} (Art Council). Voice: ${d.voice}`).join('\n');
const game = (ARIA_GAME_DIRECTOR_COUNCIL as any[]).map((g: any) => `- ${g.name} (Game & Interactive / 3D council). Medium: ${g.medium}. Conviction: ${g.conviction} Protects: ${g.protects}`).join('\n');
const motion = (['CINEMATIC', 'GENERATIVE', 'SIGNAL'] as const).map(id => { const p = (MOTION_PERSONAS as any)[id]; return `- ${p.name}, ${p.epithet} (Motion & VFX council).`; }).join('\n');
const lookNames = LOOK_PRESETS.filter(l => ['Concert', 'Effects', 'Worship', 'Theatre'].includes(l.category)).map(l => `${l.name} [${l.category}: ${l.palette.join(' ')}${l.effects.length ? '; ' + l.effects.map(e => e.kind).join('+') : ''}]`);
const LD = `- The Lighting Director (Plajah lighting board). Calls looks by name from the library, lights to the kick, the snare, the bar and the drop, and keeps the image's own palette in charge.`;

const ENGINE = `How the engine plays a song (you are directing THIS, not an imaginary renderer):
- Every image exists two ways. PLATE (2.5D): the picture as a depth-displaced relief whose materials stream along their own contours, a Trapcode-Form point layer, glows on its brightest materials. WORLD (3D): the picture rebuilt as an explorable space (ribbons, crystals, glass, bubbles, mist, cloth, terrain, embers, point-cloud forms, a light rig) coloured from the image.
- Audio is split like a lighting desk hears it: kick, snare and hat onsets; a tempo-locked beat clock; bass wobble; energy; drops, builds and breakdowns — from live analysis, and from a song map (sections + energy curve) when the track is analysed in advance.
- A beat-locked director cuts on bar lines: long shots in intros/breakdowns, accelerating cuts through builds, a hard cut on the drop; camera speed follows the energy curve; kicks punch the lens, wobble throbs it, the snare jolts the roll.
- SHOW mode cuts between plate and world by section.
- It must run everywhere on the platform (phones included): favour moves that are cheap and strong.
Section kinds: ${SECTION_KINDS.join(', ')}.
World shots: ${WORLD_SHOTS.join(', ')}. Plate shots: ${PLATE_SHOTS.join(', ')}.
Drop gestures: ${DROP_GESTURES.join(', ')}. Build gestures: ${BUILD_GESTURES.join(', ')}. Breakdown gestures: ${BREAK_GESTURES.join(', ')}.
Looks library (name [category: palette; effects]):\n${lookNames.join('\n')}`;

const SCHEMA = `{"summary": string (2 sentences: how this image interprets a song),
 "looks": {"intro": lookName, "verse": lookName, "build": lookName, "drop": lookName, "breakdown": lookName, "outro": lookName},
 "lightPalette": [2-3 hex colours taken from the image],
 "shots": {"world": {sectionKind: [2-4 world shots, best first]}, "plate": {sectionKind: [2-4 plate shots]}},
 "show": {sectionKind: "plate"|"world"},
 "gestures": {"drop": [1-3 drop gestures], "build": [1-3 build gestures], "breakdown": [1-2 breakdown gestures]},
 "intensity": {"camera": 0.5-1.5, "reactivity": 0.5-1.5, "glow": 0.5-1.5},
 "notes": {"art": string, "threeD": string, "motion": string, "lighting": string, "performance": string}}`;

async function ask(system: string, text: string, image: Buffer, maxTokens: number) {
  const { text: out } = await geminiGenerate({
    model: MODEL, system, json: true, maxTokens, temperature: 0.55, timeoutMs: 120_000, onUsage: u => usage.push(u),
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } }, { text }] }],
  });
  return JSON.parse(out.replace(/^```json\s*|```\s*$/g, ''));
}

async function convene(w: typeof IMAGE_WORLDS[number]) {
  const file = path.join(OUT, `${w.id}.json`);
  if (existsSync(file) && !process.env.COUNCIL_FORCE) { console.log(`${w.id}: already directed`); return JSON.parse(readFileSync(file, 'utf8')); }
  const image = readFileSync(path.join('public', 'visualizers', 'canvas', 'plates', `${w.id}.jpg`));
  const brief = `IMAGE: "${w.name}" (${w.mood}).\nCurrent plate: ${w.plate}\nCurrent world: ${w.world}\nThe owner's notes: the visuals must interpret the song itself — drops, bass wobble and tempo must land; camera cuts on the beat and its movement follows the song's energy up and down; the 3D worlds felt too small on wide shots; sometimes both ways are great and sometimes boring. Raise the wow, keep it efficient.`;

  const room = `You are convening Plajah's councils on one visualizer. Seats:\n${art}\n${game}\n${motion}\n${LD}\n\n${ENGINE}`;
  const deliberation = await ask(room + `\n\nAnswer JSON: {"proposals":[{"seat": name, "proposal": string (how this image should play a song, concrete, in the vocabulary), "risk": string}], "disputes":[{"between":[seat,seat],"issue":string,"resolution":string}], "consensus": string}. Every seat speaks once; disputes are real disagreements (e.g. 3D scale vs performance, stillness vs spectacle).`,
    brief, image, 6000);
  const synthesis = await ask(room + `\n\nYou are the synthesiser. Settle the room's deliberation into ONE direction for the engine. Use only vocabulary words and look names from the library. Answer JSON exactly in this shape:\n${SCHEMA}`,
    brief + `\n\nTHE ROOM'S DELIBERATION:\n${JSON.stringify(deliberation)}`, image, 3000);
  const direction = resolveDirection(synthesis);
  const record = { id: w.id, name: w.name, at: new Date().toISOString(), deliberation, synthesis, direction };
  writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(`${w.id}: ${direction.summary.slice(0, 110)}`);
  return record;
}

const want = process.argv.slice(2);
const started = Date.now();
const records: Record<string, WorldDirection> = {};
for (const w of IMAGE_WORLDS) {
  if (want.length && !want.includes(w.id)) {
    const f = path.join(OUT, `${w.id}.json`); if (existsSync(f)) records[w.id] = JSON.parse(readFileSync(f, 'utf8')).direction;
    continue;
  }
  try { records[w.id] = (await convene(w)).direction; }
  catch (e) { console.warn(`${w.id}: council failed — ${(e as Error).message}`); }
}
writeFileSync(DATA, `// GENERATED by scripts/fluxCanvas/runFluxCanvasCouncil.ts — the councils' direction per image world.\n// Full deliberations: docs/flux-canvas/council/<id>.json. Re-run the script to refresh; don't hand-edit.\nimport type { WorldDirection } from './imageWorldDirection';\n\nexport const IMAGE_WORLD_DIRECTION: Record<string, WorldDirection> = ${JSON.stringify(records, null, 2)};\n`);
const s = summarizeUsage(usage, (Date.now() - started) / 1000);
console.log(`done: ${Object.keys(records).length} directed · ${s.calls} calls · ${s.inTokens} in / ${s.outTokens} out tokens · ${s.costUsd == null ? 'cost n/a' : '$' + s.costUsd.toFixed(3)} · ${Math.round(s.seconds)}s`);
