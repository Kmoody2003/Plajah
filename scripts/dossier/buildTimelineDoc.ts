/**
 * npx tsx scripts/dossier/buildTimelineDoc.ts [douglass|ford|persia]
 * Writes data/dossier/<slug>Timeline.tela.json (a real Tela document: timeline + "faces/artifacts" frame).
 */
import fs from 'node:fs';
import { buildTimelineDoc } from '../../services/dossier/timelineDoc';

const slug = (process.argv[2] ?? 'douglass') as 'douglass' | 'ford' | 'persia';

async function load() {
  if (slug === 'douglass') {
    const [d, t] = await Promise.all([import('../../data/dossier/douglass'), import('../../data/dossier/douglassTimeline')]);
    return { dossier: d.douglassDossier, milestones: t.douglassMilestones, portraits: t.douglassPortraits };
  }
  if (slug === 'ford') {
    const [d, t] = await Promise.all([import('../../data/dossier/ford'), import('../../data/dossier/fordTimeline')]);
    return { dossier: d.fordDossier, milestones: t.fordMilestones, portraits: t.fordPortraits };
  }
  const [d, t] = await Promise.all([import('../../data/dossier/persia'), import('../../data/dossier/persiaTimeline')]);
  return { dossier: d.persiaDossier, milestones: t.persiaMilestones, portraits: t.persiaPortraits };
}

const { dossier, milestones, portraits } = await load();
const doc = buildTimelineDoc(dossier, milestones, portraits as any);
const out = `data/dossier/${slug}Timeline.tela.json`;
fs.writeFileSync(out, JSON.stringify(doc, null, 1));
const objs = Object.values(doc.devices).reduce((n: number, d: any) => n + d.objects.length, 0);
console.log(`wrote ${out}: ${doc.frames.length} frames, ${objs} objects`);
