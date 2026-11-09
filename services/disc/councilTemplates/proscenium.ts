// Proscenium — Feature Presentation.
// Art Council: lead CLASSICAL ("The Archival Cantus Firmus"), counterpoint REBEL (zero-latency state
// flips), editor RADICAL_MINIMAL (cut the manuscript corner brackets and grid lines).
// Animation lead: Golden-Age Feature Naturalist (24 fps on ones, ease-in-out). Graphic designer:
// Modernist Title Designer. Lighting director: single motivated top-light upper right, slate falloff,
// the gold bar is the only warm source.
// Structure: a vertical navigation bay on the left third; the film breathes in the open right two-thirds.
import { button, glow, linear, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';

const SLATE = '#14161B', SILVER = '#C5C8D0', DIM = '#7E838F', GOLD = '#D4AF37', GOLD_HI = '#E9C85B', LINE = '#3A3E48';
const BAY_X = 192, BAY_W = 384;

function navLabel(item: Item, w: number, h: number, s: State): O[] {
  const on = s !== 'normal';
  const out: O[] = [];
  if (on) out.push(T.rect(0, (h - 32) / 2, 4, 32, s === 'activated' ? GOLD_HI : GOLD, { label: 'Gold rule' }));
  out.push(txt(22, (h - 40) / 2, w - 30, item.label.toUpperCase(), 32, 'marcellus', s === 'activated' ? GOLD_HI : on ? GOLD : SILVER, { tracking: 0.08 }));
  return out;
}

/** Room light: the film loop sits under this. Top-light upper right, slate falloff, vignette. */
function room(withBay = true): O[] {
  return [
    T.rect(0, 0, W, H, SLATE, { opacity: 0.0, label: 'Plane' }),
    T.rect(0, 0, W, H, '#000', { gradient: linear(90, [['#14161B', 0, 0.92], ['#14161B', 0.32, 0.78], ['#14161B', 0.55, 0.08], ['#14161B', 1, 0]]), label: 'Bay shade' }),
    glow(1500, 120, 900, 520, '#FFF4DC', 0.10, 'Top light'),
    T.rect(0, 0, W, H, '#000', { gradient: { kind: 'RADIAL', stops: [{ color: '#000', offset: 0.55, opacity: 0 }, { color: '#000', offset: 1, opacity: 0.55 }] }, label: 'Vignette' }),
    ...(withBay ? [T.rect(BAY_X + 660, 160, 1, 760, LINE, { label: 'Bay edge' })] : []),
  ];
}

export const proscenium: Design = {
  id: 'feature',
  background: ctx => (ctx.main ? { kind: 'title', value: SLATE, titleId: ctx.main.id, fromSec: Math.min(600, ctx.main.source.durationSec * 0.3), loopSec: 30 } : { kind: 'color', value: SLATE }),
  subBackground: () => ({ kind: 'color', value: SLATE }),

  main(ctx, items) {
    const art: O[] = [
      ...room(),
      txt(BAY_X, 300, 900, ctx.title.toUpperCase(), 56, 'cormorant', SILVER, { tracking: 0.12, weight: 500 }),
      T.rect(BAY_X, 386, 96, 2, GOLD, { label: 'Title rule' }),
      txt(BAY_X, 404, 700, ctx.tagline, 28, 'ebGaramond', DIM, { italic: true }),
    ];
    const buttons = items.map((it, i) => button(it, BAY_X - 4, 520 + i * 64, BAY_W, 56, s => navLabel(it, BAY_W, 56, s)));
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const art: O[] = [...room(false),
      txt(BAY_X, 120, 900, 'SCENE SELECTION', 40, 'cormorant', SILVER, { tracking: 0.12 }),
      txt(1728 - 400, 132, 400, pages > 1 ? `${page + 1} / ${pages}` : '', 28, 'ebGaramond', DIM, { align: 'right' }),
      T.rect(BAY_X, 176, 1536, 1, LINE)];
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const buttons = chapters.map((it, i) => {
      const x = 192 + (i % 3) * 528, y = 216 + Math.floor(i / 3) * 312, w = 480, h = 270 + 34;
      return button(it, x, y, w, h, s => {
        const on = s !== 'normal';
        return [
          T.rect(0, 0, w, 270, 'none', { stroke: on ? (s === 'activated' ? GOLD_HI : GOLD) : LINE, strokeWidth: on ? 4 : 2, label: 'Frame' }),
          txt(0, 280, 60, String(it.index).padStart(2, '0'), 26, 'marcellus', on ? GOLD : DIM),
          txt(56, 280, w - 160, it.label, 26, 'ebGaramond', on ? SILVER : DIM),
          txt(w - 110, 280, 110, it.meta || '', 24, 'ebGaramond', DIM, { align: 'right' }),
        ];
      });
    });
    nav.forEach((it, i) => buttons.push(button(it, 192 + i * 260, 900, 240, 56, s => navLabel(it, 240, 56, s))));
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const art: O[] = [...room(), txt(BAY_X, 200, 900, heading.toUpperCase(), 44, 'cormorant', SILVER, { tracking: 0.12 }), T.rect(BAY_X, 268, 96, 2, GOLD)];
    let group = '';
    let y = 320;
    const buttons = items.map(it => {
      if (it.sub && it.sub !== group) { group = it.sub; art.push(txt(BAY_X, y + 8, 400, group.toUpperCase(), 24, 'marcellus', DIM, { tracking: 0.1 })); y += 44; }
      if (it.role === 'back') y = Math.max(y + 20, 880);
      const b = button(it, BAY_X - 4, y, 760, 56, s => {
        const o = navLabel(it, 760, 56, s);
        if (it.meta) o.push(txt(560, 12, 190, it.meta, 26, 'ebGaramond', DIM, { align: 'right' }));
        return o;
      });
      y += 60;
      return b;
    });
    return { art, buttons };
  },

  popup(ctx, items) {
    // The dado band: y 864–1026, the picture's centre stays clear.
    const art: O[] = [
      T.rect(0, 864, W, 162, SLATE, { opacity: 0.88, label: 'Dado band' }),
      T.rect(0, 864, W, 2, GOLD, { opacity: 0.8, label: 'Dado rule' }),
      txt(BAY_X, 884, 600, ctx.title.toUpperCase(), 24, 'marcellus', DIM, { tracking: 0.12 }),
    ];
    const chapters = items.filter(i => i.index != null);
    const resume = items.find(i => i.role === 'primary')!, home = items.find(i => i.role === 'back')!;
    const buttons = [button(resume, BAY_X - 4, 930, 220, 56, s => navLabel(resume, 220, 56, s))];
    chapters.forEach((it, i) => buttons.push(button(it, 440 + i * 128, 930, 116, 56, s => {
      const on = s !== 'normal';
      return [T.rect(0, 52, 116, on ? 4 : 1, on ? GOLD : LINE), txt(0, 8, 116, `${roman2(it.index!)}`, 30, 'marcellus', on ? GOLD : SILVER, { align: 'center', tracking: 0.06 })];
    })));
    buttons.push(button(home, 1500, 930, 240, 56, s => navLabel(home, 240, 56, s)));
    return { art, buttons };
  },

  motion: () => ({
    // Golden-Age naturalist: the light breathes, nothing performs. One slow top-light drift.
    layers: [{ art: [glow(300, 300, 300, 300, '#FFF4DC', 0.07, 'Drifting key')], w: 600, h: 600, from: [1180, -200], to: [1320, -140], periodSec: 16, ease: 'sine', blend: 'screen' }],
    grain: 6,
    note: 'Linear 200 ms architecture (Classical); state flips are instant (Rebel). Only the light moves.',
  }),
};

const roman2 = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || String(n);
