/** npx tsx scripts/dossier/buildTimelineDoc.ts  ->  data/dossier/douglassTimeline.tela.json */
import fs from 'node:fs';
import { douglassDossier } from '../../data/dossier/douglass';
import { douglassMilestones, douglassPortraits } from '../../data/dossier/douglassTimeline';
import { buildTimelineDoc } from '../../services/dossier/timelineDoc';

const doc = buildTimelineDoc(douglassDossier, douglassMilestones, douglassPortraits);
fs.writeFileSync('data/dossier/douglassTimeline.tela.json', JSON.stringify(doc, null, 1));
const objs = Object.values(doc.devices).reduce((n: number, d: any) => n + d.objects.length, 0);
console.log(`wrote timeline doc: ${doc.frames.length} frames, ${objs} objects`);
