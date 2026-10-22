// Print a spread of generated lessons and items so wording can be reviewed by eye.
import { expandYear } from '../../services/yearCurriculum/yearPlan';
import { buildWorksheet } from '../../services/yearCurriculum/worksheetBuilder';
import { makeRng } from '../../services/yearCurriculum/rng';
import { storyWorld } from '../../services/yearCurriculum/storyIntel';
import { MATH_SKILLS } from '../../services/yearCurriculum/mathSkills';
import { ELA_SKILLS } from '../../services/yearCurriculum/elaSkills';
const mode = process.argv[2] || 'lessons';
if (mode === 'items') {
  for (const [id, s] of Object.entries({ ...MATH_SKILLS, ...ELA_SKILLS })) {
    const out = [1, 2].map(i => s.gen({ rng: makeRng(id + i), level: (i + 1) as 2 | 3, tier: 'core', params: {}, world: storyWorld(makeRng(i), ['soccer']), idx: i }));
    for (const o of out) console.log(`${id} | ${o.prompt.replace(/\n/g, ' ')} => ${o.answer}${o.choices ? ' [' + o.choices.join(' / ') + ']' : ''}`);
  }
} else {
  for (const [g, s] of [['k', 'math'], ['g2', 'ela'], ['g5', 'math'], ['g7', 'ela']] as const) {
    const ls = expandYear(g, s);
    for (const d of [1, 2, 4, 5, 9, 33, 34, 35]) { const l = ls[d - 1]; console.log(`\n${l.id} [${l.kind}] ${l.title}\n  obj: ${l.objective}\n  warm: ${l.warmUp}\n  I: ${l.miniLesson.iDo}\n  We: ${l.miniLesson.weDo}\n  You: ${l.miniLesson.youDo}\n  disc: ${l.discussion} | exit: ${l.exitTicket}`);
      const ws = buildWorksheet(l, { tier: 'core', interests: ['music'] });
      console.log('  WS:', ws.sections.map(x => `${x.title} — ${x.directions}`).join(' || '));
    }
  }
}
