import { expandYear } from '../../services/yearCurriculum/yearPlan';
import { buildWorksheet } from '../../services/yearCurriculum/worksheetBuilder';
import { worksheetToTela } from '../../services/yearCurriculum/telaWorksheet';
const l = expandYear('g6', 'ela').find(x => x.day === 2)!; const ws = buildWorksheet(l, { tier: 'core' });
const r = worksheetToTela(ws); console.log(l.title, r.pages.length, ws.sections.map(s => `${s.kind}:${s.items.length}`).join(' '));
for (const p of r.pages) console.log(p.id.slice(-3), p.objects.filter(o => o.kind === 'TEXT').map(o => `${Math.round(o.y)}+${Math.round(o.h)} "${(o.text||'').slice(0,18)}"`).slice(0, 14).join(' | '));
