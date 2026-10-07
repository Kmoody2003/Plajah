/**
 * Convenes the platform's Council of Art Directors on a Dossier brief WITHOUT the server route.
 *
 * Why: services/council/councilRoutes.ts needs a working ANTHROPIC_API_KEY on the server. This driver
 * uses the Council's own definitions, prompts and parsers (councilDirectors, councilPrompts) and lets
 * any capable model play each director, one file per director per round, so the real protocol
 * (PROPOSE -> DISPUTE -> SYNTHESISE -> REFLECT) runs unchanged. Set a valid key and use the in-app
 * Council room to run it on the platform instead.
 *
 *   npx tsx scripts/dossier/councilConvene.ts p1 <workdir>      write round-1 prompts (propose)
 *   npx tsx scripts/dossier/councilConvene.ts p2 <workdir>      read proposals, write round-2 prompts (dispute)
 *   npx tsx scripts/dossier/councilConvene.ts p3 <workdir>      read disputes, write the synthesis prompt (Aria)
 *   npx tsx scripts/dossier/councilConvene.ts p4 <workdir>      read synthesis, write reflection prompts
 *   npx tsx scripts/dossier/councilConvene.ts report <workdir>  assemble docs/dossier/council/<name>.{json,md}
 */
import fs from 'node:fs';
import path from 'node:path';
import { COUNCIL_DIRECTORS } from '../../services/council/councilDirectors';
import { COUNCIL_DIRECTOR_IDS, type CouncilBrief, type Deliberation, type CouncilDirectorId, type DirectorProposal, type Dispute } from '../../services/council/councilTypes';
import { directorSystem, disputeUser, parseJson, proposalUser, readDispute, readProposal, readSynthesis, reflectionUser, synthesisSystem, synthesisUser } from '../../services/council/councilPrompts';

const stage = process.argv[2];
const work = path.resolve(process.argv[3] ?? '.council-work');
const briefPath = path.join(work, 'brief.json');
const brief: CouncilBrief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const materials: Array<{ file: string; what: string }> = JSON.parse(fs.readFileSync(path.join(work, 'materials.json'), 'utf8'));
const ids = [...COUNCIL_DIRECTOR_IDS] as CouncilDirectorId[];

/** Directors answer in their own voice ("minimalist", "BAROQUE_DRAMATIST"); map loose names to exact ids. */
const normId = (x: unknown): string => {
  const t = String(x ?? '').toLowerCase();
  if (t.includes('minim')) return 'RADICAL_MINIMAL';
  if (t.includes('rebel')) return 'REBEL';
  if (t.includes('baroq')) return 'BAROQUE';
  if (t.includes('class')) return 'CLASSICAL';
  if (t.includes('futur')) return 'FUTURIST';
  if (t.includes('eclect') || t.includes('world')) return 'WORLD_ECLECTIC';
  return String(x ?? '');
};
const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const ans = (round: string, who: string) => parseJson(read(path.join(work, round, `${who}.answer.json`)));
const dir = (round: string) => { const d = path.join(work, round); fs.mkdirSync(d, { recursive: true }); return d; };

function write(round: string, who: string, system: string, user: string) {
  const answer = path.join(work, round, `${who}.answer.json`);
  const imgs = materials.map(m => `- ${m.file}\n    ${m.what}`).join('\n');
  const body = [
    '# SYSTEM (this is who you are)', system, '',
    '# USER (the task)', user, '',
    '# WHAT THE COUNCIL IS LOOKING AT',
    'Before you answer, open EACH of these images with the Read tool and really look at them. Your answer must respond to what is actually on screen, not to the description.', imgs, '',
    '# HOW TO ANSWER',
    `Play this role fully, in voice, taking real positions. Then write ONLY the JSON object the task asks for to:\n${answer}\nusing the Write tool, and reply with the single word DONE. No other output.`,
  ].join('\n');
  fs.writeFileSync(path.join(dir(round), `${who}.prompt.md`), body);
}

if (stage === 'p1') {
  for (const id of ids) write('r1', id, directorSystem(id), proposalUser(brief, ids.filter(o => o !== id)));
  console.log(`round 1: wrote ${ids.length} prompts to ${path.join(work, 'r1')}`);
}

if (stage === 'p2') {
  const proposals = ids.map(id => {
    const raw: any = ans('r1', id);
    if (raw?.arguesWith?.directorId) raw.arguesWith.directorId = normId(raw.arguesWith.directorId);
    return readProposal(id, raw);
  }).filter(Boolean) as DirectorProposal[];
  console.log(`proposals read: ${proposals.length}/${ids.length}`, ids.filter(i => !proposals.some(p => p.directorId === i)).map(i => 'MISSING ' + i).join(' '));
  fs.writeFileSync(path.join(work, 'proposals.json'), JSON.stringify(proposals, null, 2));
  for (const p of proposals) write('r2', p.directorId, directorSystem(p.directorId), disputeUser(p.directorId, proposals));
  console.log(`round 2: wrote ${proposals.length} prompts`);
}

if (stage === 'p3') {
  const proposals: DirectorProposal[] = JSON.parse(read(path.join(work, 'proposals.json')));
  const present = proposals.map(p => p.directorId);
  const disputes = present.map(i => {
    const raw: any = ans('r2', i);
    if (raw?.against) raw.against = normId(raw.against);
    return readDispute(i, raw, present);
  }).filter(Boolean) as Dispute[];
  console.log(`disputes read: ${disputes.length}/${present.length}`);
  fs.writeFileSync(path.join(work, 'disputes.json'), JSON.stringify(disputes, null, 2));
  write('r3', 'aria', synthesisSystem(), synthesisUser(brief, proposals, disputes));
  console.log('round 3: wrote the synthesis prompt for Aria');
}

if (stage === 'p4') {
  const proposals: DirectorProposal[] = JSON.parse(read(path.join(work, 'proposals.json')));
  const disputes: Dispute[] = JSON.parse(read(path.join(work, 'disputes.json')));
  const present = proposals.map(p => p.directorId);
  const synthesis = readSynthesis(ans('r3', 'aria'), present);
  if (!synthesis) throw new Error('Aria synthesis missing or unreadable');
  fs.writeFileSync(path.join(work, 'synthesis.json'), JSON.stringify(synthesis, null, 2));
  const d: Deliberation = { id: 'convened', uid: 'local', createdAt: Date.now(), depth: 'FULL', status: 'DONE', brief, directors: present, proposals, disputes, reflections: [], synthesis };
  for (const id of present) write('r4', id, directorSystem(id), reflectionUser(id, d));
  console.log(`round 4: wrote ${present.length} reflection prompts; lead=${synthesis.lead} counterpoint=${synthesis.counterpoint} editor=${synthesis.editor}`);
}

if (stage === 'report') {
  const proposals: DirectorProposal[] = JSON.parse(read(path.join(work, 'proposals.json')));
  const disputes: Dispute[] = JSON.parse(read(path.join(work, 'disputes.json')));
  const synthesis = JSON.parse(read(path.join(work, 'synthesis.json')));
  const reflections = proposals.map(p => ({ directorId: p.directorId, note: String(ans('r4', p.directorId)?.note ?? '').trim() })).filter(r => r.note);
  const name = process.argv[4] ?? 'exhibits-look-and-feel';
  const d: Deliberation = { id: name, uid: 'local', createdAt: Date.now(), depth: 'FULL', status: 'DONE', brief, directors: proposals.map(p => p.directorId), proposals, disputes, reflections, synthesis };
  const out = path.join('docs', 'dossier', 'council'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(d, null, 2));
  const nm = (i: string) => COUNCIL_DIRECTORS[i as CouncilDirectorId]?.name ?? i;
  const md: string[] = [`# The Council on: ${brief.ask.slice(0, 120)}…`, '', `**Convened:** ${new Date().toISOString().slice(0, 10)} · six directors, four rounds (propose, dispute, synthesise, reflect) using the platform Council's own prompts.`, '',
    '## Aria to you', '', synthesis.ariaSummary, '',
    '## The decision', '', `**Lead:** ${nm(synthesis.lead)} · **Counterpoint:** ${nm(synthesis.counterpoint)} · **Editor:** ${nm(synthesis.editor)}`, '',
    synthesis.direction, '', `**Kept from the counterpoint:** ${synthesis.keepFromCounterpoint}`, '', `**The editor cut:** ${synthesis.editorCut}`, '', `**Open decision for you:** ${synthesis.openDecision}`, '',
    '## The six proposals', ''];
  for (const p of proposals) {
    md.push(`### ${nm(p.directorId)} — ${p.title}`, '', p.idea, '', `- **Geometry:** ${p.geometry}`, `- **Type:** ${p.typography}`, `- **Image logic:** ${p.imageLogic}`, `- **Texture:** ${p.texture}`, `- **Motion:** ${p.motion}`, `- **Production:** ${p.productionMethod}`, `- **Human trace:** ${p.humanTrace}`, `- **Risk:** ${p.risk}`, p.arguesWith ? `- **Argues with ${nm(p.arguesWith.directorId)}:** ${p.arguesWith.why}` : '', '');
  }
  md.push('## The disagreements, said out loud', '');
  for (const x of disputes) md.push(`- **${nm(x.from)} against ${nm(x.against)}:** ${x.objection}${x.concession ? ` _(concedes: ${x.concession})_` : ''}`);
  md.push('', '## What each director wrote to themselves afterwards', '');
  for (const r of reflections) md.push(`- **${nm(r.directorId)}:** ${r.note}`);
  fs.writeFileSync(path.join(out, `${name}.md`), md.filter(l => l !== undefined).join('\n'));
  console.log(`wrote docs/dossier/council/${name}.{json,md}`);
}
