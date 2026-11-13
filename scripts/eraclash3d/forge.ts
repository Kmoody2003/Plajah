/**
 * forge.ts — the Character Forge, end to end: a character's art in, a fitted, painted, scored character and its kit out.
 *
 *   FORGE_SPEC=scripts/eraclash3d/characters/<id>/forge.json npx tsx scripts/eraclash3d/forge.ts [stage...] [--force]
 *
 * Stages, in order (name some to run only those; a stage whose inputs have not changed since it last ran is skipped):
 *   intake      measure the art: turnaround views, sole, chin, face length; portrait landmarks; flat-lay pieces cut
 *   context     who this is: archetype and tradition recognised from the kit and flat-lay, the Heritage Codex's arms,
 *               measured from the flat-lay and held to the historical record, museum objects and the Combat Atlas
 *   build       body from the anatomy, face from the art, wardrobe, rig; the kit's assets painted from the flat-lay
 *   fit-head    the head and neck bent to the art's outline, row by row, until it stops improving
 *   parts       the art cut into its parts by SAM, prompted by the model's own parts
 *   fit-body    the body's build, musculature and weight searched against the art (the anatomy grows from them)
 *   fit-armour  the kit's shape searched against those parts and the whole silhouette (a parallel pattern search)
 *   paint       everything the turnaround draws painted from it: clothes, armour, lacing, skin, scalp and face
 *   score       every view and every part against the art, checked against the spec's gates -> report.md
 * Each stage's log is in the work folder; the report says what passed, what did not, and by how much.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { spec, SPEC_FILE, DATA_DIR, WORK_DIR, dataFile } from './forgeSpec';

const STAGES = ['intake', 'context', 'build', 'fit-head', 'parts', 'fit-body', 'fit-armour', 'paint', 'score'] as const;
type Stage = (typeof STAGES)[number];
const args = process.argv.slice(2);
const only = args.filter((a) => (STAGES as readonly string[]).includes(a)) as Stage[];
const force = args.includes('--force');
fs.mkdirSync(WORK_DIR, { recursive: true });
// one run per character at a time: two would share the work folder's scratch files (the searches' slots, the atlases)
const LOCK = path.join(WORK_DIR, 'forge.lock');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
if (fs.existsSync(LOCK)) {
  const held = Number(fs.readFileSync(LOCK, 'utf8'));
  if (held && held !== process.pid && alive(held)) { console.error(`[forge] ${spec.id} is already running (pid ${held}); wait for it, or end it first`); process.exit(1); }
}
fs.writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.unlinkSync(LOCK); } catch { /* gone */ } });
const env = { ...process.env, FORGE_SPEC: SPEC_FILE };
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const t0 = Date.now();
const say = (s: string) => console.log(`[forge ${spec.id} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
/** Run a Forge script, its output to the stage's log; returns its stdout. */
const tsx = (stage: string, file: string, ...a: string[]) => {
  const out = execFileSync(npx, ['tsx', `scripts/eraclash3d/${file}`, ...a], { env, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
  fs.appendFileSync(path.join(WORK_DIR, `${stage}.log`), out);
  return out;
};

// ---- what each stage depends on: if none of it changed, the stage's last result stands -------------------------------
const fileSig = (f: string) => { try { const s = fs.statSync(f); return `${f}:${s.size}:${s.mtimeMs}`; } catch { return `${f}:-`; } };
const SRC = (names: string[]) => names.map((n) => fileSig(path.join('scripts/eraclash3d', n)));
const DEPS: Record<Stage, () => string[]> = {
  intake: () => [fileSig(SPEC_FILE), fileSig(spec.art.portrait), fileSig(spec.art.turnaround), fileSig(spec.art.flatLay ?? ''), fileSig(dataFile('flatlay_pieces.json')), ...SRC(['forgeIntake.ts'])],
  context: () => [fileSig(SPEC_FILE), fileSig(dataFile('intake.json')), fileSig(spec.art.flatLay ?? ''), ...SRC(['forgeContext.ts']), fileSig('services/argilla/heritage/codex.ts')],
  build: () => [fileSig(SPEC_FILE), fileSig(dataFile('intake.json')), fileSig(dataFile('context.json')), ...SRC(['forgeArms.ts', 'forgeArmsLook.ts']), fileSig('services/argilla/creature/koshirae.ts'), fileSig(dataFile('body_fit.json')), fileSig(dataFile('flatlay_paint.json')), fileSig(dataFile('head_warp.json')), fileSig(dataFile('armour_fit.json')), ...SRC(['forgeBuild.ts', 'forgeLook.ts', 'forgeFaceFit.ts', 'forgeKit.ts', 'forgeKitPaint.ts']), fileSig('services/argilla/creature/wardrobe.ts'), fileSig('services/argilla/creature/human.ts'), fileSig('services/argilla/creature/hairSystem.ts')],
  'fit-head': () => [...DEPS.build(), ...SRC(['forgeFidelity.ts'])],
  parts: () => [fileSig(spec.out.character), ...SRC(['forgeParts.ts'])],
  'fit-body': () => [fileSig(SPEC_FILE), fileSig(dataFile('head_warp.json')), fileSig(dataFile('context.json')), ...SRC(['forgeArmourFit.ts'])],
  'fit-armour': () => [fileSig(spec.out.character), fileSig(dataFile('body_fit.json')), ...SRC(['forgeArmourFit.ts'])],
  paint: () => [fileSig(spec.out.character), ...SRC(['forgePaint.ts'])],
  score: () => [fileSig(spec.out.character), fileSig(dataFile('armour_fit.json')), fileSig(dataFile('head_warp.json'))],
};
const stampFile = path.join(WORK_DIR, 'stages.json');
const stamps: Record<string, string> = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, 'utf8')) : {};
const sig = (s: Stage) => createHash('sha1').update(DEPS[s]().join('|')).digest('hex').slice(0, 16);
const stale = (s: Stage) => force || stamps[s] !== sig(s);
const done = (s: Stage) => { stamps[s] = sig(s); fs.writeFileSync(stampFile, JSON.stringify(stamps, null, 2)); };
const fidelity = () => JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'fidelity', 'fidelity.json'), 'utf8'));

// ---- the stages ---------------------------------------------------------------------------------------------------
const RUN: Record<Stage, () => void> = {
  intake() { tsx('intake', 'forgeIntake.ts'); const r = JSON.parse(fs.readFileSync(dataFile('intake.json'), 'utf8')); say(`intake: ${r.checks.length ? `checks: ${r.checks.join('; ')}` : 'all checks pass'}`); },
  context() { const out = tsx('context', 'forgeContext.ts'); for (const l of out.split(/\r?\n/).filter((x) => /archetype|tradition|arm |museum:|atlas:/.test(x))) say(l.replace('[context] ', 'context: ')); },
  build() { const out = tsx('build', 'forgeBuild.ts'); say(`build: ${(out.match(/kit: (\d+) assets/) ?? [])[1] ?? '?'} kit assets, ${(out.match(/wrote .* \(([\d.]+ MB)\)/) ?? [])[1] ?? '?'}`); },
  'fit-head'() {
    // build, measure the outline, fold 80% of the gap into the warp; again until the head stops improving
    let best = -1;
    for (let pass = 1; pass <= Number(process.env.FORGE_HEAD_PASSES ?? 4); pass++) {
      tsx('fit-head', 'forgeBuild.ts');
      tsx('fit-head', 'forgeFidelity.ts', '--update-warp');
      const f = fidelity(), head = (['front', 'side', 'back'] as const).reduce((a, v) => a + f.views[v].regions.head.iou, 0) / 3;
      say(`fit-head pass ${pass}: head IoU ${(head * 100).toFixed(1)}%`);
      if (head <= best + 0.002) break;
      best = head;
    }
    tsx('fit-head', 'forgeBuild.ts'); // the character on disk carries the last warp
  },
  parts() { const out = tsx('parts', 'forgeFidelity.ts', '--parts'); say(`parts: ${out.split('\n').filter((l) => /^\w+\s+[\d.]+%/.test(l)).length} parts cut from the art`); },
  'fit-body'() { const out = tsx('fit-body', 'forgeArmourFit.ts', String(Number(process.env.FORGE_BODY_ROUNDS ?? 3)), '--body'); say(`fit-body: ${(out.match(/best ([\d.]+%)/) ?? [])[1] ?? '?'}`); },
  'fit-armour'() { const out = tsx('fit-armour', 'forgeArmourFit.ts', String(Number(process.env.FORGE_ARMOUR_ROUNDS ?? 3))); say(`fit-armour: ${(out.match(/best ([\d.]+%)/) ?? [])[1] ?? '?'}`); },
  paint() { tsx('paint', 'forgeBuild.ts'); tsx('paint', 'forgeFidelity.ts', '--paint', spec.out.character); say('paint: everything the turnaround draws painted from it'); },
  score() {
    tsx('score', 'forgeFidelity.ts');
    tsx('score', 'forgeFidelity.ts', '--parts');
    report();
  },
};

// ---- the report ---------------------------------------------------------------------------------------------------
/** Who the Forge built, and what it anchored the build to (context.json). */
function contextSection(): string[] {
  const f = dataFile('context.json');
  if (!fs.existsSync(f)) return [];
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  const a = c.recognised.archetype, t = c.recognised.tradition;
  const arms = (c.arms as { id: string; label?: string; role?: string; why?: string; dims?: Record<string, number>; features?: Record<string, unknown>; notes?: string[]; missing?: boolean; note?: string }[]);
  return [
    '## Who the Forge built',
    '',
    `- **${a.label}** (${Math.round(a.confidence * 100)}%, from ${a.cues.join(', ')}); bearing *${c.bearing.label}*; body searched within build ${c.body.bounds.build.join('–')}, musculature ${c.body.bounds.musculature.join('–')}, weight ${c.body.bounds.weight.join('–')}.`,
    `- **${t.culture}, ${t.era} (${t.years.join('–')})** (${Math.round(t.confidence * 100)}%, from ${t.cues.slice(0, 8).join(', ')}${t.cues.length > 8 ? ', …' : ''}).`,
    ...arms.map((x) => x.missing ? `- ${x.id}: ${x.note}` : `- **${x.label}**, ${x.role} (${x.why}): blade ${x.dims!.nagasa} m, sori ${x.dims!.sori} m, tsuka ${x.dims!.tsuka} m, saya ${x.dims!.saya} m${x.features!.bohi ? ', bo-hi' : ''}, ${x.features!.hamon} hamon.${x.notes!.length ? ` ${x.notes!.join('; ')}.` : ''}`),
    `- Worn: ${c.wear[0]}`,
    `- Anchored to ${c.museum.objects?.length ?? 0} museum objects (materials recorded: ${Object.entries(c.museum.materials ?? {}).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', ')}) and the Combat Atlas: ${c.atlas.map((x: { name: string; code: string }) => `${x.name} (${x.code})`).join(', ')}.`,
    '',
  ];
}

function report() {
  const f = fidelity();
  const parts = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'fidelity', 'parts.json'), 'utf8')) as Record<string, Record<string, { iou: number; outlineMm: number; deltaE: number; area: number; reliable: boolean; why?: string }>>;
  const g = spec.gates, pass = (v: number, t: number) => (v >= t ? 'pass' : `**${((t - v) * 100).toFixed(0)} short**`);
  const names = [...new Set(Object.values(parts).flatMap((v) => Object.keys(v)))];
  const partRow = (n: string) => {
    const rows = (['front', 'side', 'back'] as const).map((v) => parts[v]?.[n]).filter((r) => r && r.reliable);
    const w = rows.reduce((a, r) => a + r!.area, 0) || 1, iou = rows.reduce((a, r) => a + r!.iou * r!.area, 0) / w;
    const per = (['front', 'side', 'back'] as const).map((v) => { const r = parts[v]?.[n]; return !r ? '–' : r.reliable ? `${(r.iou * 100).toFixed(0)}` : '?'; }).join(' / ');
    return { n, iou, per, de: rows.reduce((a, r) => a + r!.deltaE * r!.area, 0) / w };
  };
  const table = names.map(partRow).sort((a, b) => a.iou - b.iou);
  const head = (['front', 'side', 'back'] as const).reduce((a, v) => a + f.views[v].regions.head.iou, 0) / 3;
  const md = [
    `# ${spec.name}: Forge report`,
    '',
    `${new Date().toISOString().slice(0, 16).replace('T', ' ')} · spec \`${SPEC_FILE}\` · character \`${spec.out.character}\` · kit \`${spec.out.kit}\``,
    '',
    '## Against the gates',
    '',
    '| Gate | Target | Now | |',
    '|---|---|---|---|',
    `| Overall (shape and colour, every view) | ${(g.overall * 100).toFixed(0)}% | ${(f.overall * 100).toFixed(1)}% | ${pass(f.overall, g.overall)} |`,
    `| Head (outline overlap, mean of views) | ${(g.head * 100).toFixed(0)}% | ${(head * 100).toFixed(1)}% | ${pass(head, g.head)} |`,
    `| Every part (overlap with the art's own part) | ${(g.part * 100).toFixed(0)}% | weakest ${table[0]?.n} ${((table[0]?.iou ?? 0) * 100).toFixed(1)}% | ${pass(table[0]?.iou ?? 0, g.part)} |`,
    '',
    '## By view',
    '',
    '| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |',
    '|---|---|---|---|---|---|',
    ...(['front', 'side', 'back'] as const).map((v) => `| ${v} | ${(f.axes[v].shape * 100).toFixed(1)}% | ${(f.axes[v].colour * 100).toFixed(1)}% | ${f.views[v].regions.head.iou} | ${f.views[v].regions.torso.iou} | ${f.views[v].regions.legs.iou} |`),
    '',
    '## By part (weakest first)',
    '',
    '| Part | IoU | Front / side / back | Colour ΔE | Gate |',
    '|---|---|---|---|---|',
    ...table.map((r) => `| ${r.n} | ${(r.iou * 100).toFixed(1)}% | ${r.per} | ${r.de.toFixed(1)} | ${pass(r.iou, g.part)} |`),
    '',
    ...contextSection(),
    `Images: \`${path.join(WORK_DIR, 'fidelity')}\` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).`,
    '',
  ].join('\n');
  fs.writeFileSync(dataFile('report.md'), md);
  say(`score: overall ${(f.overall * 100).toFixed(1)}% (gate ${(g.overall * 100).toFixed(0)}%), head ${(head * 100).toFixed(1)}%, weakest part ${table[0]?.n} ${((table[0]?.iou ?? 0) * 100).toFixed(1)}% -> ${dataFile('report.md')}`);
}

for (const s of STAGES) {
  if (only.length && !only.includes(s)) continue;
  if (!only.length && !stale(s)) { say(`${s}: unchanged, skipped`); continue; }
  const st = Date.now();
  RUN[s]();
  done(s);
  say(`${s} done in ${((Date.now() - st) / 1000).toFixed(0)} s`);
}
void DATA_DIR;
