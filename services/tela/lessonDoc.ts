// lessonDoc: an Academia lesson expressed as a native Tela document. Text becomes a Writer device (callouts carry a `lesson`
// role), data charts become CHART devices, everything else becomes FIGURE devices. The lesson presenter renders this doc through
// the shared Tela renderer, so a lesson can be stored, versioned, embedded and, with a teacher overlay, rebuilt from the same
// pure function. No lesson content is rewritten here: this only reshapes it.
import type { TelaDoc, TelaDevice, TelaBlock, TelaChartDevice } from '../../types';
import { parseFolio } from '../../components/learn/lesson/folioParse';
import type { Figure } from '../../components/learn/lesson/figures';

export interface LessonDocInput { lessonId: string; title: string; courseTitle?: string; body: string; figures?: Figure[]; theme?: string }

/** Tela's chart art directions that match each lesson look. */
export const CHART_STYLE_FOR_THEME: Record<string, TelaChartDevice['style']> = { default: 'EDITORIAL', baroque: 'BAROQUE', eclectic: 'WORLD_ATLAS' };

const sameXs = (xs: number[][]) => xs.every(a => a.length === xs[0].length && a.every((v, i) => v === xs[0][i]));
const fmtX = (n: number) => String(+n.toPrecision(6));

/** A data chart can ride the native CHART device only when it loses nothing: shared x values, bar or line. */
export function nativeChartFor(f: Figure, id: string, theme: string): TelaChartDevice | null {
  if (f.type !== 'chart' || f.kind === 'scatter' || !f.series.length || f.series.length > 3) return null;
  const xs = f.series.map(s => s.points.map(p => p[0]));
  if (xs[0].length < 2 || !sameXs(xs) || f.series.some(s => s.points.some(p => !isFinite(p[0]) || !isFinite(p[1]) || p[1] < 0))) return null;
  const unit = (a: { label: string; unit?: string }) => a.unit ? `${a.label} (${a.unit})` : a.label;
  return {
    id, type: 'CHART', name: f.title, title: f.title, subtitle: `${unit(f.y)} by ${unit(f.x)}`, width: 960, height: 540,
    kind: f.kind === 'bar' ? 'BAR' : 'LINE', style: CHART_STYLE_FOR_THEME[theme] || 'EDITORIAL',
    binding: { sourceType: 'INLINE', labels: xs[0].map(fmtX), series: f.series.map((s, i) => ({ id: `${id}_s${i}`, name: s.name, values: s.points.map(p => p[1]) })) },
    showLegend: f.series.length > 1, showValues: f.kind === 'bar' && xs[0].length <= 8, interactive: true,
    // The lesson's own scroll reveal draws the chart (telaMotion), so the chart's mount-time animation stays off.
    animation: { preset: 'NONE', durationMs: 0, staggerMs: 0 }, transition: { in: 'NONE', out: 'NONE' },
  };
}

export function lessonToTelaDoc(i: LessonDocInput): TelaDoc {
  const theme = i.theme || 'default';
  const { blocks } = parseFolio(i.body);
  const wid = `${i.lessonId}:text`;
  const tb: TelaBlock[] = [{ id: `${wid}:h`, kind: 'h2', text: i.title }];
  for (const b of blocks) {
    if (b.kind === 'list') {
      (b.items || []).forEach((it, k) => tb.push({ id: `${wid}:${b.index}:${k}`, kind: 'li', text: it, lesson: { role: 'list', bullet: b.marker, item: k, section: b.section, sourceIndex: b.index } }));
      continue;
    }
    tb.push({
      id: `${wid}:${b.index}`, kind: 'p', text: b.text,
      lesson: { role: b.kind === 'callout' ? 'callout' : b.kind, variant: b.variant, label: b.label, emphasised: b.emphasised, section: b.section, sourceIndex: b.index },
    });
  }
  const devices: Record<string, TelaDevice> = { [wid]: { id: wid, type: 'WRITER', mode: 'DOCUMENT', blocks: tb } };
  const order = [wid];
  const textCount = blocks.filter(b => b.kind !== 'callout').length;
  const figs: NonNullable<TelaDoc['lesson']>['figures'] = [];
  (i.figures || []).forEach(f => {
    const id = `${i.lessonId}:fig:${f.id}`;
    const native = nativeChartFor(f, id, theme);
    devices[id] = native || { id, type: 'FIGURE', figure: f };
    order.push(id);
    figs.push({ deviceId: id, after: Math.min(Math.max(0, f.after ?? 0), Math.max(0, textCount - 1)), caption: f.caption, credit: f.credit, sourceUrl: f.sourceUrl, alt: f.alt, layout: f.layout });
  });
  const now = 0; // deterministic: the same lesson always yields the same doc
  return {
    id: `lesson:${i.lessonId}`, ownerId: 'plajah-academia', title: i.title, createdAt: now, updatedAt: now,
    frames: [{ id: `${i.lessonId}:frame`, kind: 'SCREEN', preset: 'FREE', x: 0, y: 0, w: 720, h: 1200, deviceIds: order, label: i.title }],
    devices, lesson: { lessonId: i.lessonId, courseTitle: i.courseTitle, theme, figures: figs },
  };
}
