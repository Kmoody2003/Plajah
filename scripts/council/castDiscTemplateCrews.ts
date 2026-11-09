// castDiscTemplateCrews — the Motion Council casts a crew for every Fabula disc template from the
// template's own concept: animation crew (any guild), a graphic designer (Graphic & Mograph guild),
// and the lighting director (the council's CINEMATIC seat — light and lens). Deterministic: no model
// calls, so it never touches the Gemini quota. The art council's own syntheses (docs/disc/council/
// <slot>.json, where a FULL session finished) are attached as the art direction.
//
// Run: npx tsx scripts/council/castDiscTemplateCrews.ts   → docs/disc/council/crews.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { castCrew, type RosterMember } from '../../services/motion/council/motionRoster';
import { MOTION_PERSONAS } from '../../services/motion/council/motionCouncilPersonas';
import { DISC_CONCEPTS } from '../../services/disc/councilTemplates/concepts';

const used = new Set<string>();
const brief = (m: RosterMember) => ({ id: m.id, name: m.name, guild: m.guild, lineage: m.lineage, ethos: m.ethos, protects: m.protects, timing: (m as any).timing });
const crews = DISC_CONCEPTS.map(c => {
  // Leads must differ across templates — a shared lead is how a family turns into recolours.
  const anim = castCrew({ ask: c.animationAsk, medium: 'title', pinned: [c.pins.anim], size: 3 });
  const lead = anim[0];
  if (used.has(lead.id)) throw new Error(`${lead.id} already leads another template`);
  used.add(lead.id);
  const graphic = castCrew({ ask: c.graphicAsk, pinned: [c.pins.graphic], size: 1 })[0];
  if (used.has(graphic.id)) throw new Error(`${graphic.id} already designs another template`);
  used.add(graphic.id);
  const lighting = (MOTION_PERSONAS as any).CINEMATIC;
  const art = existsSync(`docs/disc/council/${c.id}.json`) ? JSON.parse(readFileSync(`docs/disc/council/${c.id}.json`, 'utf8')) : null;
  return {
    id: c.id, name: c.name, concept: c.concept,
    animationLead: brief(lead), animationCrew: anim.filter(m => m.id !== lead.id).slice(0, 2).map(brief),
    graphicDesigner: brief(graphic),
    lightingDirector: { seat: 'CINEMATIC', name: lighting?.name || 'The 3D Dramatist', plan: c.lighting },
    artCouncil: art?.status === 'DONE' ? { lead: art.synthesis.lead, counterpoint: art.synthesis.counterpoint, direction: art.synthesis.direction, keep: art.synthesis.keepFromCounterpoint, cut: art.synthesis.editorCut } : null,
  };
});
writeFileSync('docs/disc/council/crews.json', JSON.stringify({ generatedBy: 'scripts/council/castDiscTemplateCrews.ts', crews }, null, 2));
for (const c of crews) console.log(`${c.name.padEnd(26)} anim: ${c.animationLead.name.padEnd(42)} graphic: ${c.graphicDesigner.name.padEnd(36)} art: ${c.artCouncil?.lead || '—'}`);
