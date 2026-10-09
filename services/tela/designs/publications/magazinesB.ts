// magazinesB — MAGAZINE systems 5–8 (see magazines.ts for the registry and docs/tela/PUBLICATION_DESIGN_BRIEF.md).
//
// Food & travel · business weekly · music & nightlife zine · home & design. Same twelve-page issue
// structure as magazinesA (cover · contents | letter · department | ad · feature opener | feature body ·
// feature body | interview · photo essay | colophon · back cover); art on the trim runs 0.125in into bleed.
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import {
  BL, SAFE, geo, spanOf, ground, photo, rule, vrule, caption, label, runHead, flow, balance, colFrames, pullQuote, sidebar, barcodeBox, adSlot, fade, slug, warnFlow, bottomOf, barChart, lineChart, sparkBars,
  rect, hr, vr, text, below, columns, mix, alpha, orn, type Grid, type Obj,
} from './magazineKit';
import { circle, ellipse, path, line } from '../../templateKit';

// ═════════════════════════════════════════════════════════════════════════════
// 5 · TABLE & TRAIL — food & travel. Warm paper, recipe and itinerary spreads, route-map contents.
//     Trim 8.375 × 10.875 in (804 × 1044 px), perfect bound. 6-column grid, 15 px baseline.
// ═════════════════════════════════════════════════════════════════════════════
const FG: Grid = { cols: 6, gutter: 16, base: 15, top: 82, bottom: 82, inner: 66, outer: 50 };
const F_PARAS = [
  'The salt harvest begins when the weather says so, which is to say not on any date the calendar would recognise. On the morning we arrive, Mathis Le Gall is standing at the edge of a clay pan the colour of wet slate, looking at the sky the way other men look at a bank statement. “Tomorrow,” he says, and walks away to find coffee.',
  'This is the first lesson of the coast: nobody hurries, and everything arrives. The salt arrives, crystal by crystal, from seawater let in at the spring tides and left alone with the sun and the wind. The oysters arrive, in crates stacked on a bicycle trailer. The bread arrives at a quarter to eight, in the arms of a woman who has made it, daily, since 1987, and who will not tell you the secret, which is that there is no secret.',
  'We stay in a former customs house at the end of a causeway that floods twice a day. The room has a bed, a table, a kettle and a window with the best view in the department. The owner leaves a jar of last year’s fleur de sel on the sill, with a note: use freely, it is only the sea.',
  'Over six days we follow the salt inland. A paludier’s rake, a long wooden tool called a lasse, skims the white crust into small pyramids at dusk. A cooperative shop sells it in paper bags, with a leaflet explaining that three grains on a ripe tomato is, in the cooperative’s opinion, the whole of cookery. We test the claim on a tomato from the next village. The cooperative is right.',
  'The food here is built on this logic of restraint. A sardine, grilled; a bowl of white beans with sorrel; a cheese from a farm you can see from the table. Nothing is announced. Everything is offered, in a plain dish, on a plain cloth, by someone who is already thinking about the next course or, more likely, the weather.',
  'On the last evening Mathis takes us out onto the pans at sunset. The water is a sheet of rose and pewter. He lifts the lasse, draws it across the surface, and the crust parts like a skin. “That is a day,” he says. “Not much to look at.” He pours a handful of the new salt into my palm. It is warm and faintly damp, and it tastes, unmistakably, of the afternoon.',
  'We leave on the 06:40 ferry, as is only right, with a bag of salt, a loaf of the secretless bread and an open invitation to return in the spring. Mathis waves from the causeway until we are too far to see. By the time the mainland appears we have already begun, quietly, planning the next trip.',
];
const F_QA: Array<[string, string]> = [
  ['What did you cook first?', 'Eggs, for my brother, when I was seven. He said they were the best he had ever had. He was being kind. They were terrible. I decided to get better.'],
  ['What is the most useful thing in your kitchen?', 'A very sharp knife and a very old wooden spoon. The spoon has been to three countries and has opinions.'],
  ['How do you shop?', 'Slowly, and badly. I go for one thing and come home with eleven. The market is a conversation. You cannot have it at speed.'],
  ['What do people get wrong about simple food?', 'They think it is easy. Simple food has nowhere to hide. If the tomato is not good, nothing will save it.'],
  ['What is your last meal?', 'Bread, butter, a tomato, salt. Possibly a very small glass of something cold. The rest is decoration.'],
];

const tabletrail: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, FG), c = G.cols, r = orn.rng(seed);
  const D = 'fraunces' as const, B = 'workSans' as const, M = 'courierPrime' as const, HW = 'caveat' as const;
  const cream = mix(paper, .35), sand = mix(paper, -.06), clay = mix(accent, .78);
  const body = { font: B, size: 10, lead: 15, color: ink, weight: 400, gap: 7, role: 'BODY' as const };
  const head = (section: string, color = ink) => [
    text(G.verso ? G.x : G.right - 300, 40, 300, G.verso ? 'TABLE & TRAIL  ·  AUTUMN 2026' : section, { size: 8, font: M, weight: 700, color: alpha(color, .75), tracking: .16, align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    hr(G.x, 58, G.w, alpha(color, .3), .75, { label: 'Running head rule', dash: [3, 4] }),
    text(G.verso ? G.x : G.right - 40, H - 54, 40, String(G.pageNo), { size: 13, font: D, weight: 700, color: accent, align: G.verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x + 30 : G.x, H - 52, G.w - 30, G.verso ? section : 'TABLE & TRAIL', { size: 7.5, font: M, weight: 600, color: alpha(color, .65), tracking: .18, align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const stamp = (cx: number, cy: number, rad: number, l1: string, l2: string, color = accent, rot = -12): Obj[] => [
    circle(cx, cy, rad, 'none', { stroke: color, strokeWidth: 2, label: 'Postmark ring' }), circle(cx, cy, rad - 6, 'none', { stroke: color, strokeWidth: .75, dash: [2, 3], label: 'Postmark inner ring' }),
    text(cx - rad, cy - 20, rad * 2, l1, { size: rad * .36, font: D, weight: 800, color, align: 'center', wrap: false, leading: 1, rotation: rot, label: 'Postmark line', role: 'LABEL' }),
    text(cx - rad, cy + 14, rad * 2, l2, { size: 7.5, font: M, weight: 700, color, tracking: .14, align: 'center', wrap: false, rotation: rot, label: 'Postmark sub-line', role: 'LABEL' }),
  ];
  const routeX = (t: number, cx: number, amp: number) => cx + amp * Math.sin(t * Math.PI * 2 * 1.6 + .6);
  const mapFrame = (x: number, y: number, w: number, h: number, caption_: string): Obj[] => {
    const out: Obj[] = [rect(x, y, w, h, cream, { rx: 10, stroke: ink, strokeWidth: 1.25, label: 'Map frame', role: 'SIDEBAR' })];
    for (let k = 0; k < 6; k++) out.push(path(x + 10, y + 14 + k * ((h - 60) / 6), w - 20, 30, orn.sineOpenPath(1 + (k % 3), 8 + k * 2, k * 1.3), 'none', { stroke: alpha(ink, .16), strokeWidth: .75, open: true, label: 'Map contour' }));
    out.push(path(x + 12, y + 28, w - 24, h - 80, orn.sineOpenPath(1, 30, 1.4), 'none', { stroke: accent, strokeWidth: 2, dash: [5, 4], open: true, label: 'Route line' }));
    [[.14, .55], [.5, .32], [.86, .62]].forEach(([px, py], i) => out.push(circle(x + 12 + (w - 24) * px, y + 20 + (h - 60) * py, 6, i === 2 ? accent : cream, { stroke: accent, strokeWidth: 1.75, label: 'Route stop' })));
    out.push(text(x + 12, y + h - 24, w - 24, caption_, { size: 7.5, font: M, weight: 700, color: ink, tracking: .12, transform: 'uppercase', wrap: false, label: 'Map caption', role: 'CAPTION' }));
    return out;
  };

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 52, 214, W - 104, 640, { tone: 'light', shade: sand, caption: 'Cover photograph · tomatoes, sea salt and a long table on the causeway', rx: 300, label: 'Cover photograph (arch)' }));
      out.push(rect(0, 730, W, 140, paper, { label: 'Arch mask' }));
      out.push(text(36, 44, 420, 'Table', { size: 108, font: D, weight: 800, color: ink, tracking: -.03, wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(text(300, 62, 220, '&', { size: 160, font: D, weight: 400, italic: true, color: accent, wrap: false, leading: 1, label: 'Masthead ampersand', role: 'COVER_TITLE' }));
      out.push(text(330, 44, 440, 'Trail', { size: 108, font: D, weight: 800, color: ink, tracking: -.03, align: 'right', wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(hr(40, 170, W - 80, ink, 1.25, { label: 'Masthead rule' }), text(40, 180, 320, 'FOOD · TRAVEL · THE LONG WAY ROUND', { size: 8, font: M, weight: 700, color: ink, tracking: .2, wrap: false, label: 'Tagline', role: 'LABEL' }), text(W - 360, 180, 320, 'AUTUMN 2026  ·  NO. 31  ·  $11.95', { size: 8, font: M, weight: 700, color: ink, tracking: .2, align: 'right', wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(...stamp(W - 108, 262, 62, 'Autumn', '32 RECIPES', accent, -10));
      out.push(text(40, 748, 450, 'Following\nthe Salt', { size: 70, font: D, weight: 700, italic: true, color: ink, tracking: -.02, wrap: false, leading: .95, label: 'Cover headline', role: 'COVER_LINE' }));
      out.push(text(44, 880, 400, 'Six days on a coast where nothing is hurried and everything arrives: the pans, the oysters, the bread.', { size: 13, font: B, weight: 400, color: ink, leading: 1.5, label: 'Cover deck', role: 'COVER_LINE' }));
      [['Slow tomatoes', 'The only recipe you need this month', '48'], ['Eat your way across Puglia', 'Nine days, forty-one tables', '62'], ['The ferry to nowhere', 'An island with one café', '78']].forEach(([t, d, p], i) => { const x = 500; out.push(rect(x - 14, 780 + i * 52 - 2, 4, 40, i === 0 ? accent : secondary, { label: 'Cover line bar' }), text(x, 778 + i * 52, 240, t, { size: 16, font: D, weight: 700, color: ink, wrap: false, label: 'Cover line', role: 'COVER_LINE' }), text(x, 799 + i * 52, 250, `${d}  ·  ${p}`, { size: 8.5, font: B, color: alpha(ink, .75), wrap: false, label: 'Cover line description', role: 'COVER_LINE' })); });
      out.push(...barcodeBox(W - 40 - 128, 940, 128, 64, { plate: paper, ink, seed, code: '0 74470 03112 7', note: 'TABLE & TRAIL 31', font: 'ibmPlexMono' }), text(44, 990, 340, 'tableandtrail.example  ·  Display until 31 December', { size: 8, font: M, color: alpha(ink, .7), tracking: .1, wrap: false, label: 'URL', role: 'LABEL' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 70, 300, 'The\nroute', { size: 80, font: D, weight: 800, italic: true, color: ink, tracking: -.02, leading: .9, wrap: false, label: 'Contents title', role: 'HEADLINE' }));
      out.push(text(G.x, 232, 240, 'THE TRAIL FROM PAGE 8 TO 96, WITH A FEW DETOURS.', { size: 8.5, font: M, weight: 600, color: accent, tracking: .1, leading: 1.5, label: 'Contents intro', role: 'KICKER' }));
      const cx = 400, amp = 70, y0 = 120, y1 = 940; const pts: string[] = [];
      for (let i = 0; i <= 64; i++) { const t = i / 64; pts.push(`${i ? 'L' : 'M'}${(50 + (routeX(t, 0, amp) / 140) * 100).toFixed(2)} ${(t * 100).toFixed(2)}`); }
      out.push(path(cx - 70, y0, 140, y1 - y0, pts.join(' '), 'none', { stroke: accent, strokeWidth: 2.5, dash: [2, 7], open: true, label: 'Route line' }));
      const stops: Array<[string, string, string, string]> = [['08', 'Letter from the table', 'Why we went the long way round', 'FRONT'], ['16', 'The pantry', 'Slow tomatoes, burrata and sea salt', 'RECIPE'], ['24', 'Following the salt', 'Six days on a coast where everything arrives', 'FEATURE'], ['38', 'A day on the causeway', 'Where to sleep, eat and wait for the tide', 'ITINERARY'], ['52', 'Table talk', 'The chef Odile Marchetti on very good eggs', 'CONVERSATION'], ['64', 'Market day', 'Eight stalls, one afternoon', 'PHOTO ESSAY'], ['78', 'The ferry to nowhere', 'An island with exactly one café', 'TRAVEL']];
      stops.forEach(([pg, t, d, tag], i) => {
        const tt = (i + .5) / stops.length, sx = cx + routeX(tt, 0, amp), sy = y0 + tt * (y1 - y0), right = i % 2 === 0;
        out.push(circle(sx, sy, 20, i === 2 ? accent : cream, { stroke: accent, strokeWidth: 2, label: 'Route stop' }), text(sx - 20, sy - 9, 40, pg, { size: 14, font: D, weight: 800, color: i === 2 ? paper : accent, align: 'center', wrap: false, label: 'Contents folio', role: 'FOLIO' }));
        const tx = right ? sx + 34 : G.x, tw = right ? G.right - (sx + 34) : sx - 34 - G.x, al = right ? 'left' as const : 'right' as const;
        out.push(text(tx, sy - 30, tw, tag, { size: 7.5, font: M, weight: 700, color: secondary, tracking: .2, align: al, wrap: false, label: 'Section tag', role: 'KICKER' }), text(tx, sy - 16, tw, t, { size: 22, font: D, weight: 700, color: ink, align: al, leading: 1.05, label: 'Contents title', role: 'HEADLINE' }), text(tx, sy + 12, tw, d, { size: 9.5, font: B, color: alpha(ink, .8), align: al, leading: 1.4, label: 'Contents description', role: 'BODY' }));
      });
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 84, 300, 'LETTER FROM THE TABLE', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(G.x, 102, 470, 'Why we went the long way round.', { size: 46, font: D, weight: 700, color: ink, tracking: -.02, leading: 1.02, label: 'Letter headline', role: 'HEADLINE' });
      out.push(t);
      const left = spanOf(c, 0, 3), side = spanOf(c, 4, 5);
      const letter = 'There is a ferry in this issue that leaves at 06:40, which is a time no one should have to be awake. We took it anyway, because on the other side was a café with exactly one table and a woman who made bread she would not talk about. The bread was the best I have ever eaten. I have not stopped thinking about it. I am not sure I want to.\nThat is the spirit of this magazine, and of this issue in particular: that the point of going somewhere is not to arrive but to be slightly changed by the arriving. A good meal does it. A good road does it. A good meal at the end of a bad road does it twice.\nIn these pages you will find a tomato recipe that will ruin all other tomato recipes, a long walk along a coast of salt, a chef who talks about eggs with more passion than most people talk about love, and a market in a city we will not name, because it would be spoiled by the telling.\nCome with us. Bring something warm.';
      const rr = balance(letter, colFrames(columns(left.x, left.w, 2, 16), 206, 520), body, { dropCap: { lines: 3, font: D, color: accent, weight: 800 } }); warnFlow('t&t letter', rr); out.push(...rr.objs);
      out.push(text(left.x, bottomOf(rr.objs) + 10, 300, 'Nora Whitfield', { size: 38, font: HW, weight: 700, color: ink, wrap: false, rotation: -2, label: 'Signature', role: 'BYLINE' }), text(left.x, bottomOf(rr.objs) + 52, 300, 'EDITOR-AT-LARGE', { size: 7.5, font: M, weight: 700, color: alpha(ink, .6), tracking: .2, wrap: false, label: 'Signature role', role: 'CAPTION' }));
      // postcard
      out.push(rect(side.x - 4, 206, side.w + 8, 280, cream, { rx: 3, stroke: alpha(ink, .5), strokeWidth: 1, rotation: 2.5, shadow: { x: 0, y: 6, blur: 12, color: 'rgba(40,24,12,.18)' }, label: 'Postcard', role: 'SIDEBAR' }));
      out.push(...photo(ctx, side.x + 6, 218, side.w - 12, 150, { tone: 'light', caption: 'Postcard photo', rotation: 2.5, label: 'Postcard photograph' }));
      out.push(text(side.x + 10, 386, side.w - 20, 'Dear all — the bread is real. The tide is not on time. Wish you were here, but not too many of you.', { size: 20, font: HW, weight: 600, color: ink, leading: 1.1, rotation: 2.5, label: 'Handwritten note', role: 'CAPTION' }));
      out.push(...stamp(side.x + side.w - 36, 480, 38, 'Île', 'OCT 2026', accent, -14));
      // contributors
      const cy = 600;
      out.push(hr(G.x, cy, G.w, ink, 1.25, { label: 'Contributors rule' }), text(G.x, cy + 12, 300, 'WHO WENT WHERE', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Contributors label', role: 'KICKER' }));
      const who: Array<[string, string]> = [['Nora Whitfield', 'ate the bread, wrote the letter, still thinking about it'], ['Mathis Le Gall', 'paludier, fourth generation; raked, poured, waved'], ['Odile Marchetti', 'chef; has opinions about eggs, stands by them'], ['Pablo Ferrer', 'photographed the salt pans in a single dawn'], ['Imani Cole', 'tested every recipe twice, once for fun'], ['Lars Ekblad', 'drew the maps by hand, on a ferry, badly lit']];
      const cc = columns(G.x, G.w, 3, 16);
      who.forEach(([n, d], i) => { const x = cc[i % 3].x, y = cy + 42 + Math.floor(i / 3) * 118; out.push(...photo(ctx, x, y, 56, 56, { tone: 'light', rx: 28, silent: true, label: 'Contributor portrait' }), text(x + 66, y + 2, cc[0].w - 66, n, { size: 16, font: D, weight: 700, italic: true, color: ink, leading: 1.05, label: 'Contributor name', role: 'BYLINE' }), text(x, y + 66, cc[0].w, d, { size: 8.8, font: B, color: alpha(ink, .8), leading: 1.4, label: 'Contributor note', role: 'CAPTION' })); });
      out.push(...head('Letter from the table'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 84, 300, 'THE PANTRY  ·  RECIPE', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 2, 102, G.w, 'Slow tomatoes,\nburrata & sea salt', { size: 54, font: D, weight: 800, color: ink, tracking: -.02, leading: .98, label: 'Recipe title', role: 'HEADLINE' }));
      const meta: Array<[string, string]> = [['SERVES', '4'], ['PREP', '15 min'], ['COOK', '2 hrs'], ['LEVEL', 'Easy']];
      meta.forEach(([k, v], i) => out.push(rect(G.x + i * 124, 214, 116, 48, i % 2 ? clay : sand, { rx: 4, label: 'Recipe meta chip' }), text(G.x + i * 124 + 10, 220, 100, k, { size: 7, font: M, weight: 700, color: alpha(ink, .6), tracking: .2, wrap: false, label: 'Meta key', role: 'LABEL' }), text(G.x + i * 124 + 10, 234, 100, v, { size: 16, font: D, weight: 700, color: ink, wrap: false, label: 'Meta value', role: 'LABEL' })));
      const left = spanOf(c, 0, 2), right = spanOf(c, 3, 5);
      out.push(...photo(ctx, right.x, 280, right.w, 260, { tone: 'light', caption: 'Recipe photograph · slow tomatoes on toast', label: 'Recipe photograph' }), ...caption(right.x, 546, right.w, 'Roast until the edges catch and the juices have thickened to syrup.', 'Photograph Pablo Ferrer', { font: M, color: ink, size: 8, transform: 'none' }));
      out.push(text(left.x, 282, left.w, 'INGREDIENTS', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Ingredients label', role: 'KICKER' }), hr(left.x, 300, left.w, ink, 1, { label: 'Ingredients rule' }));
      const ing: Array<[string, string]> = [['1 kg', 'ripe tomatoes, halved'], ['6 tbsp', 'olive oil'], ['4', 'garlic cloves, unpeeled'], ['1 tsp', 'fleur de sel'], ['1 tsp', 'sugar'], ['4', 'sprigs of thyme'], ['2', 'balls of burrata'], ['1 bunch', 'basil, torn'], ['to serve', 'good bread, warm']];
      ing.forEach(([a, n], i) => out.push(text(left.x, 312 + i * 24, 58, a, { size: 9.5, font: M, weight: 700, color: accent, align: 'right', wrap: false, label: 'Amount', role: 'LABEL' }), text(left.x + 68, 311 + i * 24, left.w - 68, n, { size: 10.5, font: B, color: ink, wrap: false, label: 'Ingredient', role: 'BODY' }), hr(left.x, 330 + i * 24, left.w, alpha(ink, .15), .6, { label: 'Ingredient rule' })));
      out.push(text(G.x, 590, 300, 'METHOD', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Method label', role: 'KICKER' }), hr(G.x, 608, G.w, ink, 1, { label: 'Method rule' }));
      const steps = ['Heat the oven to 150°C. Lay the tomatoes cut side up in a single layer in a roasting tin, tuck in the garlic and thyme, and drizzle with the oil.', 'Scatter over the salt and sugar. Roast for 1 hour 45 minutes, until the tomatoes have collapsed and the edges are caramelised.', 'Leave to cool for ten minutes. Squeeze the soft garlic out of its skins and mash it into the pan juices.', 'Tear the burrata over a warm plate, spoon the tomatoes and their syrup around it, and finish with basil and a few extra grains of salt.', 'Serve straight away, with bread for the juices. Do not apologise for the second helping.'];
      const sc = columns(G.x, G.w, 2, 24);
      steps.forEach((st, i) => { const col = i < 3 ? 0 : 1, row = i < 3 ? i : i - 3, y = 624 + row * 92; out.push(text(sc[col].x, y, 32, String(i + 1), { size: 34, font: D, weight: 800, italic: true, color: accent, wrap: false, leading: 1, label: 'Step number', role: 'LABEL' }), text(sc[col].x + 36, y + 2, sc[col].w - 36, st, { size: 10, font: B, color: ink, leading: 1.5, label: 'Method step', role: 'BODY' })); });
      out.push(rect(sc[1].x, 624 + 2 * 92 - 8, sc[1].w, 88, clay, { rx: 4, label: 'Cook’s note panel', role: 'SIDEBAR' }), text(sc[1].x + 14, 624 + 2 * 92 + 2, sc[1].w - 28, 'Cook’s note: the oven is the quiet one. Open it as rarely as you can, and the tomatoes will repay you.', { size: 19, font: HW, weight: 600, color: ink, leading: 1.1, label: 'Cook’s note', role: 'CAPTION' }));
      out.push(...head('The Pantry'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(G.x, 86, G.w, 520, { fill: sand, ink, accent, font: M, kind: 'Advertisement  ·  two-thirds page', spec: '2/3 page  ·  6.1 × 7.0 in  ·  no bleed  ·  300 dpi CMYK, PDF/X-4', live: 14 }));
      out.push(text(G.x, 614, 300, 'ADVERTISEMENT', { size: 7, font: M, weight: 700, color: alpha(ink, .5), tracking: .22, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(rect(G.x, 650, G.w, 300, secondary, { rx: 6, label: 'House ad panel', role: 'AD_SLOT' }));
      out.push(text(G.x + 28, 668, 360, 'Take the long\nway round.', { size: 46, font: D, weight: 800, italic: true, color: paper, leading: 1, label: 'House ad headline', role: 'HEADLINE' }), text(G.x + 28, 770, 340, 'Four issues a year, delivered to your door, with a pocket map folded into every one. A year is $38; a gift subscription comes in a tin with a tomato seed packet.', { size: 11, font: B, color: paper, leading: 1.5, label: 'House ad copy', role: 'BODY' }), text(G.x + 28, 880, 340, 'tableandtrail.example/join', { size: 14, font: M, weight: 700, color: paper, wrap: false, label: 'House ad URL', role: 'LABEL' }));
      out.push(...stamp(G.right - 100, 760, 62, 'Join', 'FOUR ISSUES · $38', paper, -8));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, ink)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: mix(ink, .22), caption: 'Opening photograph · the salt pans at first light', label: 'Feature photograph' }));
      out.push(rect(-BL, H * .46, W + BL * 2, H * .54 + BL, ink, { gradient: fade(90, ink, 0, .88), label: 'Legibility gradient' }));
      out.push(text(G.x, 566, 360, 'FIELD NOTES  ·  47.6° N  12.7° E', { size: 9, font: M, weight: 700, color: mix(secondary, .55), tracking: .2, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 4, 586, 700, 'Following\nthe Salt', { size: 128, font: D, weight: 800, color: paper, tracking: -.03, leading: .9, label: 'Feature headline', role: 'HEADLINE' }));
      out.push(text(G.x, 862, 390, 'Six days on a coast where nothing is hurried and everything arrives: the pans, the oysters, the bread that no one will explain.', { size: 14, font: B, color: paper, leading: 1.5, label: 'Deck', role: 'DECK' }), text(G.x, 944, 400, 'WORDS NORA WHITFIELD  ·  PHOTOGRAPHS PABLO FERRER', { size: 8, font: M, weight: 700, color: alpha(paper, .8), tracking: .14, wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(...mapFrame(G.right - 230, 740, 230, 238, 'The salt coast  ·  6 days'));
      out.push(text(G.x - 14, 36, 340, String(G.pageNo), { size: 12, font: D, weight: 700, color: paper, wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        out.push(text(G.x, 84, 300, 'FOLLOWING THE SALT  ·  1', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
        const dk = text(G.x, 102, spanOf(c, 0, 4).w, 'The salt harvest begins when the weather says so, which is to say not on any date the calendar would recognise.', { size: 28, font: D, weight: 600, italic: true, color: ink, leading: 1.14, tracking: -.01, label: 'Deck', role: 'DECK' });
        out.push(dk, hr(G.x, below(dk, 18), G.w, ink, 1.25, { label: 'Body rule' }));
        const top = below(dk, 40), main = spanOf(c, 0, 3), side = spanOf(c, 4, 5);
        const cols2 = columns(main.x, main.w, 2, 18);
        const rr = balance(F_PARAS.slice(0, 5).join('\n'), colFrames(cols2, top, G.bottom - 50), body, { dropCap: { lines: 3, font: D, color: accent, weight: 800 } }); warnFlow('t&t p7', rr); out.push(...rr.objs);
        const by7 = bottomOf(rr.objs) + 30; out.push(...photo(ctx, main.x, by7, main.w, 250, { tone: 'light', caption: 'The causeway at dawn', label: 'Wide photograph' }), ...caption(main.x, by7 + 256, main.w, 'The customs house at the end of the causeway, tide out. The room with the best view in the department is the one on the left.', 'Photograph Pablo Ferrer', { font: M, color: ink, size: 8, transform: 'none' }));
        out.push(...photo(ctx, side.x, top, side.w, 250, { tone: 'light', caption: 'Mathis Le Gall at the pans', label: 'Inset photograph' }), ...caption(side.x, top + 256, side.w, 'Mathis Le Gall draws the lasse across the pan at dusk. “That is a day,” he says.', 'Photograph Pablo Ferrer', { font: M, color: ink, size: 8, transform: 'none' }));
        out.push(...pullQuote(side.x, top + 340, side.w, '“Three grains on a ripe tomato is the whole of cookery.”', 'Cooperative leaflet', { font: D, size: 22, weight: 600, italic: true, color: accent, leading: 1.14, rule: 'top', ruleColor: accent, ruleWeight: 2, attribFont: M, pad: 12 }));
        out.push(...sidebar(side.x, top + 500, side.w, 'Where to eat', ['Chez Odile — sardines, white beans, a cheese you can see.', 'La Cale — oysters off the bicycle trailer.', 'Boulangerie du Port — the bread.'], { fill: clay, titleFont: M, titleColor: ink, bodyFont: B, bodyColor: ink, size: 9, lead: 13, titleSize: 8, pad: 12, rx: 4, rule: ink }));
      } else {
        out.push(text(G.x, 84, 300, 'A DAY ON THE CAUSEWAY  ·  ITINERARY', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
        out.push(text(G.x - 2, 102, G.w, 'Three days, one tide table.', { size: 50, font: D, weight: 800, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Itinerary headline', role: 'HEADLINE' }));
        const days: Array<[string, string, Array<[string, string]>]> = [['Day one', 'Arrive late', [['16:10', 'Cross the causeway before the tide.'], ['18:00', 'Customs house: kettle, window, salt jar.'], ['20:15', 'Sardines at Chez Odile.']]], ['Day two', 'Follow the salt', [['06:40', 'Ferry, coffee, bread that no one explains.'], ['10:00', 'Pans with Mathis; try the lasse.'], ['19:30', 'Oysters off the trailer, on the quay.']]], ['Day three', 'Wait for the tide', [['08:00', 'Long breakfast, slow tomatoes.'], ['12:30', 'Market: cheese, sorrel, white beans.'], ['17:45', 'The last ferry, if you must.']]]];
        const dc = columns(G.x, G.w, 3, 18);
        days.forEach(([d, t, rows], i) => { const x = dc[i].x; out.push(rect(x, 172, dc[0].w, 5, i === 1 ? accent : secondary, { label: 'Day bar' }), text(x, 184, dc[0].w, d.toUpperCase(), { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Day label', role: 'KICKER' }), text(x, 198, dc[0].w, t, { size: 24, font: D, weight: 700, color: ink, leading: 1.05, label: 'Day title', role: 'HEADLINE' })); rows.forEach(([tm, ds], k) => out.push(text(x, 252 + k * 66, 44, tm, { size: 10, font: M, weight: 700, color: accent, wrap: false, label: 'Time', role: 'LABEL' }), text(x + 48, 251 + k * 66, dc[0].w - 48, ds, { size: 10, font: B, color: ink, leading: 1.45, label: 'Itinerary entry', role: 'BODY' }), hr(x, 244 + k * 66, dc[0].w, alpha(ink, .2), .6, { label: 'Entry rule', dash: [2, 3] }))); });
        out.push(...photo(ctx, G.x, 470, spanOf(c, 0, 3).w, 220, { tone: 'light', caption: 'The causeway at low tide', label: 'Inset photograph' }), ...mapFrame(spanOf(c, 4, 5).x, 470, spanOf(c, 4, 5).w, 220, 'Day two  ·  the pans'));
        out.push(...caption(G.x, 696, spanOf(c, 0, 3).w, 'The causeway floods twice a day; the tide table is pinned inside the customs-house door, in four languages and a drawing.', 'Photograph Pablo Ferrer', { font: M, color: ink, size: 8, transform: 'none' }));
        const rr = balance(F_PARAS.slice(5).join('\n') + '\n' + 'A note on getting there: the nearest station is an hour away, the bus runs on Tuesdays, and the best advice we were given was to hire a bicycle. The ride is flat, the wind is on your back in the morning and in your face by evening, and there is salt in the air from the moment you leave the road.', colFrames(columns(G.x, G.w, 3, 18), 760, G.bottom - 16), body);
        warnFlow('t&t p8', rr); out.push(...rr.objs);
      }
      out.push(...head(pageIndex === 6 ? 'Following the Salt' : 'Itinerary'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 84, 300, 'TABLE TALK', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 2, 102, G.w, 'Odile Marchetti\non very good eggs', { size: 52, font: D, weight: 800, color: ink, tracking: -.02, leading: .98, label: 'Interview headline', role: 'HEADLINE' }));
      const left = spanOf(c, 0, 1), right = spanOf(c, 2, 5);
      out.push(...photo(ctx, left.x, 252, left.w, left.w, { tone: 'light', rx: left.w / 2, caption: 'Odile Marchetti', label: 'Portrait' }), ...caption(left.x, 252 + left.w + 10, left.w, 'Marchetti at Chez Odile, between lunch and dinner, shelling peas.', 'Photograph Pablo Ferrer', { font: M, color: ink, size: 8, transform: 'none' }));
      out.push(rect(left.x, 580, left.w, 220, clay, { rx: 6, label: 'Pantry panel', role: 'SIDEBAR' }), text(left.x + 14, 592, left.w - 28, 'HER PANTRY', { size: 8, font: M, weight: 700, color: ink, tracking: .22, wrap: false, label: 'Pantry label', role: 'KICKER' }));
      ['Anchovies in oil', 'Flaky salt', 'Dried oregano', 'Lemons, always', 'Good vinegar', 'Eggs, naturally'].forEach((p, i) => out.push(text(left.x + 14, 614 + i * 28, left.w - 28, p, { size: 21, font: HW, weight: 600, color: ink, wrap: false, label: 'Pantry item', role: 'SIDEBAR' })));
      let y = 252;
      F_QA.forEach(([q, a], i) => { const qq = text(right.x, y, right.w, q, { size: 17, font: D, weight: 700, italic: true, color: accent, leading: 1.12, label: 'Question', role: 'KICKER' }); const aa = text(right.x, below(qq, 6), right.w, a, { size: 10.5, font: B, color: ink, leading: 1.55, label: 'Answer', role: 'BODY' }); out.push(qq, aa); y = below(aa, 22); if (i === 1) { const pq = pullQuote(right.x, y, right.w, '“If the tomato is not good, nothing will save it.”', null, { font: D, size: 26, weight: 600, italic: true, color: ink, leading: 1.14, rule: 'both', ruleColor: accent, ruleWeight: 1.25, pad: 10 }); out.push(...pq); y = bottomOf(pq) + 26; } });
      out.push(...head('Table talk'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, sand)];
      out.push(text(G.x - 2, 78, G.w, 'Market day', { size: 78, font: D, weight: 800, italic: true, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Essay headline', role: 'HEADLINE' }), text(G.x, 172, 380, 'Eight stalls, one afternoon, and a man who sells only onions and does not apologise.', { size: 11, font: B, color: ink, leading: 1.5, label: 'Essay intro', role: 'DECK' }));
      const polaroids: Array<[number, number, number, number, number, string, string]> = [[G.x, 232, 250, 270, -3, 'Onions, in rows, with opinions', 'Stall 3'], [G.x + 266, 262, 200, 220, 2.5, 'Cheese the size of a hat', 'Stall 5'], [G.x + 478, 226, 220, 250, -2, 'The only queue worth joining', 'Stall 1'], [G.x + 20, 548, 220, 240, 3, 'Sorrel & white beans', 'Stall 7'], [G.x + 256, 530, 260, 280, -2.5, 'Salt, three kinds, one scoop', 'Stall 2'], [G.x + 530, 520, 190, 220, 2, 'Honey, with a bee', 'Stall 8']];
      polaroids.forEach(([x, y, w, h, rot, cap, tag]) => { out.push(rect(x, y, w, h, paper, { rx: 2, rotation: rot, shadow: { x: 0, y: 6, blur: 12, color: 'rgba(40,24,12,.2)' }, label: 'Polaroid frame', role: 'SIDEBAR' }), ...photo(ctx, x + 10, y + 10, w - 20, h - 60, { tone: 'light', caption: tag, rotation: rot, label: 'Polaroid photograph' }), text(x + 12, y + h - 42, w - 24, cap, { size: 17, font: HW, weight: 600, color: ink, leading: 1.05, rotation: rot, label: 'Handwritten caption', role: 'CAPTION' })); });
      out.push(text(G.x, 840, G.w, 'Photographs Pablo Ferrer, shot on a borrowed camera in a single afternoon. Captions written on the train home.', { size: 8.5, font: M, color: alpha(ink, .75), leading: 1.5, label: 'Credit', role: 'CREDIT' }));
      out.push(...head('Market day'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 84, 300, 'POSTCARD FROM THE OFFICE', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 2, 102, G.w, 'The people who made this.', { size: 44, font: D, weight: 800, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Colophon headline', role: 'HEADLINE' }));
      const card = { x: G.x, y: 190, w: G.w, h: 560 };
      out.push(rect(card.x, card.y, card.w, card.h, cream, { rx: 4, stroke: alpha(ink, .5), strokeWidth: 1, label: 'Postcard back', role: 'SIDEBAR' }), vrule(card.x + card.w * .52, card.y + 24, card.h - 48, alpha(ink, .4), 1, 'Postcard divider'));
      const staff: Array<[string, string]> = [['Editor-at-large', 'Nora Whitfield'], ['Food editor', 'Imani Cole'], ['Travel editor', 'Lars Ekblad'], ['Photography', 'Pablo Ferrer'], ['Maps & drawings', 'Lars Ekblad'], ['Copy', 'Tobias Wren'], ['Design', 'Marta Quill'], ['Publisher', 'Daniel Achebe']];
      staff.forEach(([role, name], i) => out.push(text(card.x + 28, card.y + 36 + i * 58, 220, role.toUpperCase(), { size: 7.5, font: M, weight: 700, color: alpha(ink, .6), tracking: .2, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(card.x + 28, card.y + 50 + i * 58, 250, name, { size: 28, font: HW, weight: 700, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' })));
      const rx0 = card.x + card.w * .52 + 28, rw = card.w * .48 - 56;
      out.push(rect(rx0 + rw - 74, card.y + 28, 74, 90, 'none', { stroke: accent, strokeWidth: 2, dash: [3, 3], label: 'Stamp box' }), text(rx0 + rw - 74, card.y + 52, 74, 'STAMP\nHERE', { size: 9, font: M, weight: 700, color: accent, align: 'center', leading: 1.3, tracking: .12, label: 'Stamp text', role: 'LABEL' }));
      out.push(text(rx0, card.y + 40, rw - 90, 'Write to us at the address below. We reply to everything, slowly, in ink.', { size: 22, font: HW, weight: 600, color: ink, leading: 1.1, label: 'Postcard note', role: 'CAPTION' }));
      ['Table & Trail', '14 Causeway Row, Suite 2', 'Brooklyn, NY 11201', 'letters@tableandtrail.example'].forEach((l, i) => out.push(text(rx0, card.y + 160 + i * 34, rw, l, { size: i === 0 ? 24 : 21, font: HW, weight: 600, color: ink, wrap: false, label: 'Address line', role: 'CAPTION' }), hr(rx0, card.y + 186 + i * 34, rw, alpha(ink, .35), .75, { label: 'Address rule' })));
      out.push(text(rx0, card.y + 330, rw, 'Subscribe: four issues, $38. Back issues $12. tableandtrail.example/join', { size: 9.5, font: B, color: ink, leading: 1.55, label: 'Subscriptions', role: 'BODY' }), text(rx0, card.y + 390, rw, 'Printed on uncoated paper, FSC-certified. Trim 8.375 × 10.875 in, 0.125 in bleed. © 2026 Table & Trail Media. Maps are not to scale and should not be used for navigation by sea.', { size: 8.5, font: B, color: alpha(ink, .75), leading: 1.5, label: 'Rights', role: 'FOOTNOTE' }));
      out.push(...barcodeBox(rx0, card.y + 470, 120, 62, { plate: cream, ink, seed, code: 'ISSN 2234-7811', note: 'NO. 31  AUTUMN', font: 'ibmPlexMono' }));
      out.push(...head('Masthead'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 52, 70, W - 104, 640, { tone: 'light', shade: sand, caption: 'Back cover · a long table, set for twelve, on the quay', rx: 320, label: 'Back cover photograph (arch)' }));
      out.push(rect(0, 560, W, 150, paper, { label: 'Arch mask' }));
      out.push(text(40, 640, W - 80, 'Next time: the harvest.', { size: 66, font: D, weight: 700, italic: true, color: ink, tracking: -.02, align: 'center', wrap: false, leading: 1, label: 'Next issue headline', role: 'COVER_LINE' }));
      out.push(text(120, 740, W - 240, 'Winter 2026: a week among the olive pickers, forty recipes for a cold kitchen, and one very long soup.', { size: 14, font: B, color: ink, leading: 1.55, align: 'center', label: 'Next issue copy', role: 'COVER_LINE' }));
      out.push(...stamp(W / 2, 880, 54, 'Winter', 'ON SALE 20 NOV', accent, -8));
      out.push(text(40, 960, 300, 'TABLE & TRAIL', { size: 12, font: D, weight: 800, color: ink, tracking: .1, wrap: false, label: 'Masthead, small', role: 'COVER_TITLE' }), ...barcodeBox(W - 40 - 120, 940, 120, 60, { plate: paper, ink, seed, code: '0 74470 03112 7', note: 'NO. 31', font: 'ibmPlexMono' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 6 · THE LEDGER — business & finance weekly. Tabloid newsprint page, dense columns, charts, ticker.
//     Trim 11 × 17 in (1056 × 1632 px), saddle-stitched. 8-column grid, 12 px baseline.
// ═════════════════════════════════════════════════════════════════════════════
const BG: Grid = { cols: 8, gutter: 14, base: 12, top: 104, bottom: 88, inner: 48, outer: 48 };
const B_PARAS = [
  'The factory floor in Dayton smells of hot metal and floor wax, which is how a factory floor should smell and how, for a quarter of a century, this one did not. Until last spring the building held a furniture warehouse, a failed gym and, for a short, optimistic period, a company that made scented candles. Now it holds eleven hundred jobs, forty robots and a canteen with a queue.',
  'The change is part of what economists have started to call the Great Reshoring: the slow, uneven return of manufacturing to the rich world after three decades of drift to cheaper shores. Since 2022 American firms have announced more than $1.2tn in new factory investment. Europe, never quite as ready to let go of its industrial base, has quietly done the same. Asia is watching, and in some places copying.',
  'The causes are tedious and powerful. Shipping costs, which collapsed in the 1990s, are now volatile. Wages in once-cheap economies have risen by an average of 9% a year for a decade. Governments, anxious about chips, drugs and batteries, have rediscovered subsidy. And the robots, which cost less each year, do not mind the cold or the commute.',
  'But reshoring is not a return. The Dayton factory employs a fraction of the people its predecessor did, and most of them are technicians, not assemblers. The average job pays well, but demands a certificate that did not exist in 2015. In the town, enthusiasm is mixed with unease. “They gave us the factory back,” says a former assembly worker, “but not the job.”',
  'The economics are fragile too. A reshored product typically costs 15–30% more to make than its offshore equivalent. Firms hope to recover the difference in speed, quality and resilience. Customers, in surveys, say they would pay more for the privilege. In shops, they mostly do not. The gap between what people say and what people buy is the great unexamined risk of the new industrial policy.',
  'There is a cheerier view. Productivity in the new plants is up by almost a third, and the cost of being wrong about a supply chain, as the pandemic taught, is higher than the cost of paying for a closer one. Executives speak of optionality, a word that sounds like a hedge fund but means, in this case, the ability to make a thing in the same time zone as the person who wants it.',
  'What will decide the outcome is not subsidy but skill. The factories are being built faster than the workforce to run them. Dayton’s community college has doubled its technician programme, and still has a waiting list. If the reshoring succeeds it will be because a few thousand welders, programmers and maintenance electricians decided to stay.',
  'Back on the floor, a shift supervisor named Rosalind Okafor presses a button, and a line of robot arms begins to move in a quiet, unhurried choreography. She watches with the expression of a woman who has seen a great many promises made. “It is good,” she says. “It is real. Ask me again in five years.”',
];
const B_QA: Array<[string, string]> = [
  ['You are building four plants at once. Is that brave or reckless?', 'Both, on different days. The reckless part is the schedule. The brave part is believing in a workforce that does not exist yet and training it ourselves.'],
  ['What does a reshored product cost you?', 'About eighteen percent more at the factory gate. We recover about twelve of it in lower freight, lower inventory and fewer fires. The rest, frankly, is the cost of sleeping.'],
  ['Will customers pay for it?', 'Some will. Hospitals, defence, anyone who has waited eleven weeks for a part. The rest will tell you they would and then buy the cheaper thing. We plan for the second group.'],
  ['What would make you stop?', 'A skills gap I could not close. Subsidies come and go. Welders do not.'],
  ['What is the one number you watch?', 'Time from order to door. If that falls and the quality holds, the rest is accounting.'],
];

const ledger: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, BG), c = G.cols, r = orn.rng(seed);
  const D = 'playfair' as const, T = 'spectral' as const, S = 'inter' as const, M = 'ibmPlexMono' as const;
  const up = '#1A7F4B', dn = secondary, mute = alpha(ink, .6), tint = mix(paper, -.05);
  const body = { font: T, size: 10.4, lead: 13.5, color: ink, weight: 400, gap: 0, indent: 12, role: 'BODY' as const };
  const head = (section: string) => [
    hr(G.x, 62, G.w, ink, 2.5, { label: 'Running head rule' }), hr(G.x, 67, G.w, ink, .5, { label: 'Running head rule' }),
    text(G.verso ? G.x : G.right - 420, 44, 420, G.verso ? 'THE LEDGER  ·  BUSINESS, MARKETS & POLICY  ·  8 OCTOBER 2026' : section, { size: 8.5, font: S, weight: 700, color: ink, tracking: .16, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    text(G.verso ? G.right - 60 : G.x, 40, 60, String(G.pageNo), { size: 18, font: D, weight: 900, color: ink, align: G.verso ? 'right' : 'left', wrap: false, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x : G.right - 420, H - 52, 420, G.verso ? section : 'THE LEDGER', { size: 8, font: S, weight: 600, color: mute, tracking: .16, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const tri = (x: number, y: number, isUp: boolean, color: string) => path(x, y, 7, 6, orn.polygonPath(3, isUp ? -90 : 90), color, { label: isUp ? 'Up marker' : 'Down marker' });
  const kicker = (x: number, y: number, w: number, t: string, color = accent) => text(x, y, w, t, { size: 8.5, font: S, weight: 800, color, tracking: .16, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'KICKER' });
  const fig = (x: number, y: number, n: string, t: string, w = 360) => [text(x, y, 40, `Fig ${n}`, { size: 8.5, font: S, weight: 800, color: accent, wrap: false, label: 'Figure number', role: 'KICKER' }), text(x + 38, y, w - 38, t, { size: 8.5, font: S, weight: 600, color: ink, wrap: false, label: 'Figure title', role: 'CAPTION' })];
  const src = (x: number, y: number, t: string) => text(x, y, Math.min(400, W - x - 24), `Source: ${t}`, { size: 7.5, font: S, color: mute, label: 'Source', role: 'CREDIT' });
  const ticker = (x: number, y: number, w: number): Obj[] => {
    const items: Array<[string, string, boolean]> = [['DOW', '41,882  +0.8%', true], ['S&P 500', '5,631  +0.6%', true], ['FTSE 100', '8,342  −0.2%', false], ['NIKKEI', '38,114  +1.1%', true], ['EUR/USD', '1.094  −0.1%', false], ['GOLD', '2,481  +0.4%', true], ['BRENT', '79.4  −1.3%', false], ['BITCOIN', '63,420  +2.1%', true]];
    const out: Obj[] = [rect(x, y, w, 28, ink, { label: 'Ticker strip', role: 'ORNAMENT' })]; const step = w / items.length;
    items.forEach(([n, v, u], i) => out.push(text(x + i * step + 10, y + 5, 70, n, { size: 8.5, font: M, weight: 700, color: paper, tracking: .04, wrap: false, label: 'Ticker name', role: 'LABEL' }), text(x + i * step + 10, y + 16, step - 24, v, { size: 8, font: M, color: u ? '#7FD6A4' : '#FF9AAA', wrap: false, label: 'Ticker value', role: 'LABEL' }), tri(x + i * step + step - 18, y + 11, u, u ? '#7FD6A4' : '#FF9AAA')));
    return out;
  };
  const story = (x: number, y: number, w: number, k: string, h: string, d: string, hs = 24): { objs: Obj[]; bottom: number } => {
    const kk = kicker(x, y, w, k), hh = text(x, y + 14, w, h, { size: hs, font: D, weight: 900, color: ink, leading: 1.02, tracking: -.01, label: 'Story headline', role: 'HEADLINE' }), dd = text(x, below(hh, 6), w, d, { size: 10.4, font: T, color: ink, leading: 1.3, label: 'Story summary', role: 'BODY' });
    return { objs: [kk, hh, dd], bottom: below(dd, 0) };
  };

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 30, 300, 'MONDAY 8 OCTOBER 2026', { size: 8.5, font: S, weight: 700, color: ink, tracking: .14, wrap: false, label: 'Issue date', role: 'LABEL' }), text(G.x, 30, G.w, 'VOL. 41  ·  NO. 14  ·  PRICE $5.50', { size: 8.5, font: S, weight: 700, color: ink, tracking: .14, align: 'right', wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(hr(G.x, 54, G.w, ink, 3, { label: 'Masthead rule' }), text(G.x, 36, G.w, 'The Ledger', { size: 172, font: D, weight: 900, italic: true, color: ink, tracking: -.03, align: 'center', wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(hr(G.x, 216, G.w, ink, .75, { label: 'Masthead rule' }), text(G.x, 224, G.w, 'BUSINESS  ·  MARKETS  ·  POLICY  ·  THE WEEK’S ARGUMENT IN NUMBERS', { size: 9, font: S, weight: 700, color: accent, tracking: .3, align: 'center', wrap: false, label: 'Tagline', role: 'LABEL' }), hr(G.x, 244, G.w, ink, 3, { label: 'Masthead rule' }));
      out.push(...ticker(G.x, 252, G.w));
      const lead = spanOf(c, 0, 4), rail = spanOf(c, 5, 7);
      out.push(kicker(lead.x, 304, lead.w, 'Industry  ·  Cover story', secondary));
      const hd = text(lead.x, 322, lead.w, 'The Great Reshoring', { size: 104, font: D, weight: 900, color: ink, tracking: -.03, leading: .94, label: 'Cover headline', role: 'COVER_LINE' });
      out.push(hd, text(lead.x, below(hd, 10), lead.w, 'Factories are coming home, and they are bringing fewer jobs than anyone promised.', { size: 25, font: D, weight: 400, italic: true, color: ink, leading: 1.2, label: 'Cover deck', role: 'COVER_LINE' }));
      const hy = 640;
      out.push(...photo(ctx, lead.x, hy, lead.w, 380, { tone: 'light', caption: 'Cover photograph · the Dayton line, second shift', label: 'Cover photograph' }), ...caption(lead.x, hy + 386, lead.w, 'Robot arms on the new Dayton line, where forty machines and eleven hundred people now share a floor that was empty two years ago.', 'Photograph Kofi Mensah', { font: S, color: ink, size: 8.5, transform: 'none' }));
      out.push(text(lead.x, hy + 430, lead.w, 'By Daniel Achebe, industry editor  ·  Page 24', { size: 9, font: S, weight: 700, color: accent, wrap: false, label: 'Byline', role: 'BYLINE' }));
      // right rail: markets table
      out.push(rect(rail.x, 304, rail.w, 360, tint, { label: 'Markets panel', role: 'SIDEBAR' }), hr(rail.x, 304, rail.w, ink, 2.5, { label: 'Panel rule' }), kicker(rail.x + 12, 316, rail.w - 24, 'Markets at a glance', ink));
      const mk: Array<[string, string, string, boolean, number[]]> = [['S&P 500', '5,631', '+0.6%', true, [4, 5, 5, 6, 6, 8]], ['Nasdaq', '17,884', '+0.9%', true, [3, 4, 5, 5, 7, 8]], ['FTSE 100', '8,342', '−0.2%', false, [7, 7, 6, 6, 5, 5]], ['Nikkei', '38,114', '+1.1%', true, [3, 3, 4, 6, 6, 8]], ['10-yr yield', '4.18%', '−4bp', false, [8, 7, 6, 6, 5, 5]], ['Brent', '$79.4', '−1.3%', false, [7, 8, 7, 6, 5, 5]], ['Gold', '$2,481', '+0.4%', true, [4, 4, 5, 5, 6, 7]]];
      mk.forEach(([n, v, ch, u, sp], i) => { const y = 342 + i * 44; out.push(hr(rail.x + 12, y, rail.w - 24, alpha(ink, .25), .5, { label: 'Row rule' }), text(rail.x + 12, y + 8, 100, n, { size: 11, font: S, weight: 700, color: ink, wrap: false, label: 'Market name', role: 'LABEL' }), text(rail.x + 12, y + 24, 100, v, { size: 13, font: D, weight: 900, color: ink, wrap: false, label: 'Market value', role: 'LABEL' }), ...sparkBars(rail.x + 130, y + 10, 56, 24, sp, alpha(ink, .3), u ? up : dn), tri(rail.x + rail.w - 76, y + 14, u, u ? up : dn), text(rail.x + rail.w - 66, y + 10, 56, ch, { size: 10.5, font: M, weight: 700, color: u ? up : dn, wrap: false, label: 'Market change', role: 'LABEL' })); });
      let sy = 690;
      const stories: Array<[string, string, string]> = [['Central banks', 'Rates hold, but the argument has moved', 'Governors who spent two years saying “higher for longer” are now debating how long is long.'], ['Technology', 'The chip that took the economy’s temperature', 'A single export-control rule has done more to cool a boom than a decade of interest rates.'], ['Energy', 'Wind finally pays, at the wrong time of day', 'Cheap midday power has created a glut that the grid cannot yet store or sell.']];
      stories.forEach(([k, h, d], i) => { const s = story(rail.x, sy, rail.w, k, h, d, 22); out.push(...s.objs); sy = s.bottom + 14; if (i < 2) out.push(hr(rail.x, sy - 6, rail.w, alpha(ink, .35), .5, { label: 'Story rule' })); });
      out.push(rect(rail.x, sy + 8, rail.w, 120, ink, { label: 'Chart of the week panel', role: 'SIDEBAR' }), text(rail.x + 14, sy + 18, rail.w - 28, 'CHART OF THE WEEK', { size: 8, font: S, weight: 800, color: '#FFB3C0', tracking: .2, wrap: false, label: 'Panel label', role: 'KICKER' }), text(rail.x + 14, sy + 34, rail.w - 28, '38%', { size: 52, font: D, weight: 900, color: paper, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }), text(rail.x + 100, sy + 46, rail.w - 114, 'fewer hours of assembly per car than in 2015, in plants built since 2022', { size: 9.5, font: T, italic: true, color: alpha(paper, .9), leading: 1.3, label: 'Data label', role: 'CAPTION' }));
      out.push(...barcodeBox(G.right - 130, 1534, 130, 62, { plate: paper, ink, seed, code: '0 74470 41014 0', note: 'THE LEDGER 14', font: M }), text(G.x, 1540, 500, 'theledger.example  ·  Subscribers read the full archive  ·  Display until 14 October', { size: 8.5, font: S, weight: 600, color: mute, tracking: .06, wrap: false, label: 'URL', role: 'LABEL' }), hr(G.x, 1520, G.w, ink, 3, { label: 'Foot rule' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 78, 600, 'Inside', { size: 92, font: D, weight: 900, italic: true, color: ink, tracking: -.03, wrap: false, leading: 1, label: 'Contents title', role: 'HEADLINE' }), text(G.right - 360, 100, 360, 'THE WEEK IN BUSINESS, FROM PAGE 8 TO PAGE 96', { size: 9, font: S, weight: 700, color: accent, tracking: .16, align: 'right', wrap: false, label: 'Contents intro', role: 'KICKER' }));
      out.push(...ticker(G.x, 196, G.w));
      const secs: Array<[string, Array<[string, string, string]>]> = [
        ['The Week', [['8', 'Leader', 'Why a factory is not a promise'], ['10', 'Markets', 'Stocks, bonds and the dollar'], ['14', 'Letters', 'Readers on the rate debate'], ['16', 'Briefing', 'Twelve things the week changed']]],
        ['Features', [['24', 'The Great Reshoring', 'Factories are coming home; the jobs are not'], ['34', 'The Four-Day Fund', 'A pension scheme bets on shorter weeks'], ['44', 'Salt, Steel & Sand', 'The quiet economics of the materials boom']]],
        ['Companies', [['52', 'Chief executive Q&A', 'Building four plants at once'], ['58', 'Earnings', 'The numbers behind the headlines'], ['62', 'Mergers', 'Who bought whom this week']]],
        ['Data & Charts', [['66', 'Ten charts', 'The week in small multiples'], ['72', 'Economic indicators', 'Growth, jobs, prices and the rest'], ['76', 'The long view', 'Twenty years of the same argument']]],
      ];
      const cc = columns(G.x, G.w, 4, 18);
      secs.forEach(([h, items], i) => {
        const x = cc[i].x; out.push(hr(x, 252, cc[0].w, ink, 2.5, { label: 'Section rule' }), text(x, 262, cc[0].w, h, { size: 22, font: D, weight: 900, italic: true, color: accent, wrap: false, label: 'Section', role: 'KICKER' }));
        items.forEach(([pg, t, d], k) => { const y = 308 + k * 132; out.push(text(x, y, 56, pg, { size: 46, font: D, weight: 900, color: ink, wrap: false, leading: 1, label: 'Contents folio', role: 'FOLIO' }), text(x + 62, y + 4, cc[0].w - 62, t, { size: 17, font: D, weight: 900, color: ink, leading: 1.05, label: 'Contents title', role: 'HEADLINE' }), text(x + 62, y + 44, cc[0].w - 62, d, { size: 10.4, font: T, color: ink, leading: 1.35, label: 'Contents description', role: 'BODY' }), hr(x, y + 100, cc[0].w, alpha(ink, .3), .5, { label: 'Contents rule' })); });
      });
      // by-the-numbers table
      const ty = 880;
      out.push(hr(G.x, ty, G.w, ink, 2.5, { label: 'Table rule' }), text(G.x, ty + 10, 400, 'THE WEEK IN NUMBERS', { size: 9, font: S, weight: 800, color: accent, tracking: .2, wrap: false, label: 'Table label', role: 'KICKER' }));
      const nums: Array<[string, string, string]> = [['$1.2tn', 'announced US factory investment since 2022', 'p.24'], ['4.18%', '10-year Treasury yield, down 4bp', 'p.10'], ['−38%', 'assembly hours per car, new plants vs. 2015', 'p.1'], ['1,100', 'jobs at the Dayton line, with 40 robots', 'p.24'], ['9%', 'annual wage growth in once-cheap economies', 'p.26'], ['18%', 'extra cost to make a reshored product', 'p.52']];
      const nc = columns(G.x, G.w, 6, 14);
      nums.forEach(([v, d, p], i) => out.push(text(nc[i].x, ty + 38, nc[0].w, v, { size: 40, font: D, weight: 900, color: ink, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }), text(nc[i].x, ty + 90, nc[0].w, d, { size: 9.5, font: T, italic: true, color: ink, leading: 1.35, label: 'Data label', role: 'CAPTION' }), text(nc[i].x, ty + 140, nc[0].w, p, { size: 8, font: S, weight: 800, color: accent, tracking: .14, wrap: false, label: 'Page ref', role: 'LABEL' })));
      out.push(...photo(ctx, G.x, 1120, G.w, 340, { tone: 'light', caption: 'The week’s picture · Dayton, second shift', label: 'Contents photograph' }), ...caption(G.x, 1466, G.w, 'Rosalind Okafor, shift supervisor, on the Dayton line. “Ask me again in five years.” Page 24.', 'Photograph Kofi Mensah', { font: S, color: ink, size: 8.5, transform: 'none' }));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(kicker(G.x, 86, 300, 'Leader'));
      out.push(text(G.x - 2, 104, spanOf(c, 0, 5).w, 'A factory is not a promise', { size: 70, font: D, weight: 900, color: ink, tracking: -.025, leading: .98, label: 'Leader headline', role: 'HEADLINE' }));
      out.push(text(G.x, 250, spanOf(c, 0, 5).w, 'Governments are paying to bring manufacturing home. They should also pay attention to what comes with it.', { size: 22, font: D, italic: true, weight: 400, color: ink, leading: 1.25, label: 'Leader deck', role: 'DECK' }));
      const body3 = spanOf(c, 0, 5), side = spanOf(c, 6, 7);
      const cols3 = columns(body3.x, body3.w, 3, 18);
      const leader = 'Walk through any new factory in the rich world and you will hear the same words: resilience, security, optionality. They are good words, and the policies behind them are not foolish. A country that cannot make its own medicines, chips or batteries is, as the pandemic reminded everyone, at the mercy of the nearest port.\nBut the language of resilience has a way of crowding out the language of arithmetic. A factory is not a promise; it is a cost, borne first by taxpayers and then, in higher prices, by everyone who buys what it makes. The question for governments is not whether to support industry but how to do so without teaching it to expect support for ever.\nThe record of industrial policy is mixed, which is a polite way of saying that for every programme that built an industry there are two that built a lobby. The best examples share three features. They are narrow, aimed at a particular market failure rather than a general nostalgia. They are temporary, with a sunset written in. And they are measured, with a published accounting of what was spent and what was got.\nThe worst examples share the opposite. They are broad, open-ended and unaudited, and they reward the firms best at lobbying rather than the firms best at making things. Several of the largest announcements of the past two years fall into this second group, and the early evidence is not encouraging: plants announced with great fanfare quietly postponed, jobs promised in the thousands delivered in the hundreds.\nThere is a better way to think about the Great Reshoring, and it begins with the workers. The scarce resource is not capital, which is abundant, but skill. Every dollar of subsidy that does not go towards training is a dollar spent on a building with no one to run it. Dayton’s community college has doubled its technician programme and still has a waiting list. That, rather than the ribbon-cutting, is the number to watch.\nThe honest conclusion is a modest one. Reshoring can be good policy, if it is aimed, timed and counted. It is not a substitute for competitiveness, and it is certainly not a promise to workers who were told, a generation ago, that the same factories were not coming back.';
      const rr = balance(leader, colFrames(cols3, 346, 1100), body, { dropCap: { lines: 3, font: D, color: accent, weight: 900 } }); warnFlow('ledger leader', rr); out.push(...rr.objs);
      out.push(rect(side.x, 100, side.w, 600, tint, { label: 'Letters panel', role: 'SIDEBAR' }), hr(side.x, 100, side.w, ink, 2.5, { label: 'Panel rule' }), kicker(side.x + 14, 112, side.w - 28, 'From the letters page', ink));
      [['Rate debate', '“You say the central bank has moved the argument. It has moved the argument about the argument.” S. Whitcombe, Leeds'], ['Salt, steel & sand', '“A fine piece on materials. May I add that the real shortage is sand, and that nobody will believe me.” R. Okeke, Lagos'], ['Charts', '“More charts, please. Fewer adjectives. Yours, a reader since 1986.” M. Haldane, Edinburgh']].forEach(([h, t], i) => out.push(text(side.x + 14, 142 + i * 168, side.w - 28, h, { size: 15, font: D, weight: 900, italic: true, color: accent, leading: 1.1, label: 'Letter heading', role: 'KICKER' }), text(side.x + 14, 166 + i * 168, side.w - 28, t, { size: 10.4, font: T, color: ink, leading: 1.4, label: 'Letter text', role: 'BODY' }), hr(side.x + 14, 142 + (i + 1) * 168 - 12, side.w - 28, alpha(ink, .3), .5, { label: 'Letter rule' })));
      out.push(...photo(ctx, side.x, 740, side.w, 220, { tone: 'light', caption: 'The leader writer’s desk', label: 'Leader photograph' }));
      out.push(...pullQuote(G.x, 1120, G.w, '“The scarce resource is not capital, which is abundant, but skill.”', 'The Ledger’s leader', { font: D, size: 54, weight: 900, italic: true, color: secondary, leading: 1.04, rule: 'both', ruleColor: ink, ruleWeight: 2.5, attribFont: S, pad: 16, tracking: -.01 }));
      out.push(...head('Leader'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 80, 600, 'Markets', { size: 92, font: D, weight: 900, italic: true, color: ink, tracking: -.03, wrap: false, leading: 1, label: 'Department title', role: 'HEADLINE' }), text(G.right - 400, 108, 400, 'Close of trading, Friday 5 October', { size: 10, font: S, weight: 600, color: mute, align: 'right', wrap: false, label: 'Department slug', role: 'LABEL' }));
      out.push(...ticker(G.x, 196, G.w));
      const main = spanOf(c, 0, 4), side = spanOf(c, 5, 7);
      out.push(...fig(main.x, 252, '1', 'S&P 500, 12 months to Friday', main.w));
      const pts: Array<[number, number]> = Array.from({ length: 25 }, (_, i) => [i / 24, .12 + .55 * (i / 24) + .1 * Math.sin(i * .9) + .06 * Math.sin(i * 2.3) * (i / 24)]);
      out.push(...lineChart(main.x, 268, main.w, 320, pts, { font: S, ink, accent, size: 8.5, endLabel: '5,631', fill: alpha(accent, .08), xlabels: ['Oct 2025', 'Apr', 'Oct 2026'], weight: 2.5 }), src(main.x, 596, 'Bloomberg, The Ledger’s calculations'));
      out.push(...fig(side.x, 252, '2', 'Biggest movers, % change', side.w));
      out.push(...barChart(side.x, 268, side.w, 320, [['NVD', 8.2], ['BA', 5.1], ['JPM', 3.4], ['XOM', -1.2], ['TSL', -3.9], ['AMZ', 2.2], ['MSF', 1.4]].map(([k, v]) => [k as string, Math.abs(v as number)] as [string, number]), { font: S, ink, accent, size: 8.5, highlight: 0, gap: 8, barColor: alpha(ink, .75), unit: '%', ticks: 4 }), src(side.x, 596, 'Refinitiv'));
      // index table
      const ty = 650;
      out.push(hr(G.x, ty, G.w, ink, 2.5, { label: 'Table rule' }), kicker(G.x, ty + 10, 300, 'Indices'));
      const rows: Array<[string, string, string, string, string, boolean]> = [['S&P 500', '5,631.2', '+0.6%', '+16.0%', '5,654.1', true], ['Dow Jones', '41,882.0', '+0.8%', '+11.1%', '41,960.8', true], ['Nasdaq', '17,884.3', '+0.9%', '+19.2%', '18,006.2', true], ['FTSE 100', '8,342.6', '−0.2%', '+7.9%', '8,445.8', false], ['DAX', '19,121.7', '+0.1%', '+14.3%', '19,200.0', true], ['Nikkei 225', '38,114.2', '+1.1%', '+13.9%', '40,888.4', true], ['Hang Seng', '17,622.0', '−0.5%', '+3.4%', '19,706.0', false], ['10-yr Treasury', '4.18%', '−4bp', '+30bp', '4.74%', false]];
      const tx = [0, 260, 400, 520, 650, 800].map(o => G.x + o);
      ['INDEX', 'CLOSE', 'WEEK', 'YEAR TO DATE', '12M HIGH'].forEach((h, i) => out.push(text(tx[i] + (i ? 0 : 0), ty + 34, 200, h, { size: 8, font: S, weight: 800, color: mute, tracking: .16, wrap: false, label: 'Table head', role: 'LABEL' })));
      rows.forEach((row, i) => { const y = ty + 54 + i * 28; out.push(hr(G.x, y, G.w, alpha(ink, i === 0 ? .6 : .2), .5, { label: 'Row rule' }), text(tx[0], y + 7, 250, row[0], { size: 12, font: D, weight: 900, color: ink, wrap: false, label: 'Index', role: 'LABEL' }), text(tx[1], y + 8, 130, row[1], { size: 11, font: M, color: ink, wrap: false, label: 'Close', role: 'LABEL' }), tri(tx[2], y + 11, row[5], row[5] ? up : dn), text(tx[2] + 12, y + 8, 110, row[2], { size: 11, font: M, weight: 700, color: row[5] ? up : dn, wrap: false, label: 'Week change', role: 'LABEL' }), text(tx[3], y + 8, 120, row[3], { size: 11, font: M, color: ink, wrap: false, label: 'YTD', role: 'LABEL' }), text(tx[4] + 150, y + 8, 120, row[4], { size: 11, font: M, color: mute, wrap: false, label: '12M high', role: 'LABEL' })); });
      // commodities small multiples
      const my = 960;
      out.push(hr(G.x, my, G.w, ink, 2.5, { label: 'Table rule' }), kicker(G.x, my + 10, 400, 'Commodities, currencies & crypto'));
      const smalls: Array<[string, string, string, boolean, number[]]> = [['Brent crude', '$79.4', '−1.3%', false, [8, 8, 7, 6, 6, 5, 5]], ['Gold', '$2,481', '+0.4%', true, [4, 4, 5, 5, 6, 7, 7]], ['Copper', '$4.62', '+1.9%', true, [3, 4, 4, 5, 6, 7, 9]], ['EUR / USD', '1.094', '−0.1%', false, [7, 6, 7, 6, 6, 5, 5]], ['USD / JPY', '147.2', '+0.6%', true, [4, 5, 5, 6, 6, 7, 7]], ['Bitcoin', '$63.4k', '+2.1%', true, [3, 4, 3, 5, 6, 7, 9]]];
      const sc = columns(G.x, G.w, 6, 14);
      smalls.forEach(([n, v, ch, u, sp], i) => out.push(text(sc[i].x, my + 38, sc[0].w, n, { size: 10, font: S, weight: 700, color: ink, wrap: false, label: 'Small name', role: 'LABEL' }), text(sc[i].x, my + 54, sc[0].w, v, { size: 22, font: D, weight: 900, color: ink, wrap: false, label: 'Small value', role: 'LABEL' }), ...sparkBars(sc[i].x, my + 92, sc[0].w, 46, sp, alpha(ink, .28), u ? up : dn), tri(sc[i].x, my + 148, u, u ? up : dn), text(sc[i].x + 11, my + 144, 100, ch, { size: 10.5, font: M, weight: 700, color: u ? up : dn, wrap: false, label: 'Small change', role: 'LABEL' })));
      out.push(hr(G.x, 1180, G.w, ink, .5, { label: 'Rule' }), text(G.x, 1196, spanOf(c, 0, 4).w, 'Markets commentary', { size: 22, font: D, weight: 900, italic: true, color: accent, wrap: false, label: 'Commentary heading', role: 'KICKER' }));
      const mc = columns(G.x, G.w, 3, 18);
      const rr = balance('Equities ended the week at fresh highs as investors read a soft inflation print as permission to stop worrying about the central bank and start worrying about earnings. The rally was narrow: three in every four stocks in the S&P 500 lagged the index, a pattern that has persisted for most of the year and which strategists describe, depending on temperament, as concentration or as faith.\nBonds were calmer than their reputation. The ten-year yield slipped four basis points to 4.18%, extending a decline that has now run for three weeks and taken the market’s estimate of the final policy rate below four percent for the first time since spring.\nOil gave back a little of its recent gains as inventories in the United States rose by more than expected, while copper, the metal economists consult when they want to know what manufacturers are thinking, rose almost 2%, on hopes that the great reshoring will eventually need a great deal of wire.\nIn currencies the dollar was stable against the euro and a little firmer against the yen, whose weakness has begun to alarm officials in Tokyo. Bitcoin, which does not read central bank statements, rose by 2.1% and lost most of it again overnight.', colFrames(mc, 1232, 1520), body, { dropCap: { lines: 3, font: D, color: accent, weight: 900 } });
      warnFlow('ledger markets', rr); out.push(...rr.objs);
      out.push(...head('Markets'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(G.x, 92, G.w, 700, { fill: tint, ink, accent, font: S, kind: 'Advertisement  ·  half-page horizontal', spec: 'Half page  ·  10.0 × 7.3 in  ·  bleed N/A  ·  CMYK or greyscale, 300 dpi  ·  PDF/X-4', live: 16 }));
      out.push(text(G.x, 800, 400, 'ADVERTISEMENT', { size: 7.5, font: S, weight: 700, color: mute, tracking: .24, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(hr(G.x, 840, G.w, ink, 2.5, { label: 'Appointments rule' }), text(G.x - 2, 850, 600, 'Appointments & notices', { size: 38, font: D, weight: 900, italic: true, color: ink, wrap: false, label: 'Appointments title', role: 'HEADLINE' }), text(G.right - 360, 868, 360, 'TOMBSTONE ADS  ·  SINGLE-COLUMN  ·  2.3 × 3.0 IN', { size: 8, font: S, weight: 700, color: mute, tracking: .14, align: 'right', wrap: false, label: 'Appointments spec', role: 'CAPTION' }));
      const ac = columns(G.x, G.w, 4, 18);
      for (let i = 0; i < 8; i++) { const x = ac[i % 4].x, y = 912 + Math.floor(i / 4) * 300; out.push(...adSlot(x, y, ac[0].w, 280, { fill: i % 3 === 0 ? mix(secondary, .9) : tint, ink, accent: i % 3 === 0 ? secondary : accent, font: S, kind: ['Chief Financial Officer', 'Non-executive director', 'Fund manager', 'Public notice', 'Head of strategy', 'Auction', 'Chief economist', 'Legal notice'][i], spec: '2.3 × 3.0 in', live: 10 })); }
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, ink)];
      out.push(...photo(ctx, 0, 0, W, 800, { tone: 'dark', shade: mix(ink, .2), caption: 'Opening photograph · the Dayton line, second shift', label: 'Feature photograph' }));
      out.push(rect(-BL, 520, W + BL * 2, 280 + BL, ink, { gradient: fade(90, ink, 0, .95), label: 'Legibility gradient' }));
      out.push(rect(G.x, 560, 160, 24, secondary, { label: 'Kicker slab' }), text(G.x + 10, 564, 150, 'COVER STORY  ·  INDUSTRY', { size: 8.5, font: S, weight: 800, color: paper, tracking: .14, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 4, 590, 980, 'The Great\nReshoring', { size: 152, font: D, weight: 900, italic: true, color: paper, tracking: -.035, leading: .92, label: 'Feature headline', role: 'HEADLINE' }));
      const dk = text(G.x, 930, 560, 'Factories are coming home to the rich world after thirty years away. They are bringing machines, certificates and a great deal of subsidy. What they are not bringing, yet, is the jobs.', { size: 22, font: D, italic: true, color: ink === paper ? ink : paper, leading: 1.3, label: 'Deck', role: 'DECK' });
      out.push(dk);
      out.push(text(G.x, 1090, 560, 'BY DANIEL ACHEBE, INDUSTRY EDITOR  ·  PHOTOGRAPHS BY KOFI MENSAH', { size: 9, font: S, weight: 700, color: alpha(paper, .8), tracking: .12, wrap: false, label: 'Byline', role: 'BYLINE' }));
      const cs = columns(G.x + 640, G.w - 640, 2, 18);
      [['$1.2tn', 'US factory investment announced since 2022'], ['40', 'robots on the Dayton floor'], ['−38%', 'assembly hours per car vs. 2015'], ['+18%', 'extra cost to make a reshored product']].forEach(([v, l], i) => { const x = cs[i % 2].x, y = 930 + Math.floor(i / 2) * 170; out.push(hr(x, y, cs[0].w, alpha(paper, .4), .75, { label: 'Stat rule' }), text(x, y + 10, cs[0].w, v, { size: 42, font: D, weight: 900, color: i === 2 ? '#FFB3C0' : paper, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }), text(x, y + 64, cs[0].w, l, { size: 10, font: T, italic: true, color: alpha(paper, .85), leading: 1.35, label: 'Data label', role: 'CAPTION' })); });
      out.push(...caption(G.x, 1250, 540, 'The Dayton line, second shift. Forty robot arms share the floor with eleven hundred people; the canteen, a supervisor notes, has the longest queue.', 'Photograph Kofi Mensah', { font: S, color: paper, creditColor: alpha(paper, .6), size: 9, transform: 'none' }));
      out.push(...lineChart(G.x + 640, 1280, G.w - 640, 220, [[0, .8], [.2, .74], [.4, .6], [.6, .5], [.75, .35], [.9, .22], [1, .12]], { font: S, ink: paper, accent: '#FFB3C0', size: 8.5, endLabel: '1.2tn', fill: 'rgba(255,179,192,.12)', xlabels: ['2020', '2023', '2026'] }));
      out.push(...fig(G.x + 640, 1262, '1', 'Announced US factory investment, $tn', 320).map(o => ({ ...o, fill: o.objectLabel === 'Figure title' ? paper : o.fill })));
      out.push(text(G.x, H - 52, 60, String(G.pageNo), { size: 18, font: D, weight: 900, color: paper, wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        const main = spanOf(c, 0, 5), side = spanOf(c, 6, 7);
        out.push(kicker(G.x, 86, 300, 'The Great Reshoring  ·  1'), hr(G.x, 106, G.w, ink, 1, { label: 'Rule' }));
        const dk = text(main.x, 118, main.w, 'Since 2022 American firms have announced more than $1.2tn in new factory investment. The robots are in; the question is who will run them.', { size: 30, font: D, weight: 700, italic: true, color: ink, leading: 1.18, tracking: -.01, label: 'Deck', role: 'DECK' });
        out.push(dk);
        const top = below(dk, 30), cols3 = columns(main.x, main.w, 3, 18);
        const rr = balance(B_PARAS.slice(0, 7).join('\n'), [{ ...cols3[0], y: top, b: 1100 }, { ...cols3[1], y: top, b: 1100 }, { ...cols3[2], y: top, b: 1100 }], body, { dropCap: { lines: 3, font: D, color: accent, weight: 900 } });
        warnFlow('ledger p7', rr); out.push(...rr.objs);
        out.push(...pullQuote(side.x, 118, side.w, '“They gave us the factory back, but not the job.”', 'Former assembly worker, Dayton', { font: D, size: 30, weight: 900, italic: true, color: secondary, leading: 1.08, rule: 'top', ruleColor: ink, ruleWeight: 2.5, attribFont: S, pad: 12 }));
        out.push(...fig(side.x, 330, '2', 'Jobs per $1m of factory investment', side.w));
        out.push(...barChart(side.x, 346, side.w, 250, [['1990', 14], ['2000', 11], ['2010', 8], ['2020', 5], ['2026', 3]], { font: S, ink, accent, size: 8.5, highlight: 4, gap: 10, barColor: alpha(ink, .75), ticks: 3 }), src(side.x, 604, 'BLS of Labor Statistics; Ledger estimates'));
        out.push(rect(side.x, 640, side.w, 230, ink, { label: 'Data callout panel', role: 'SIDEBAR' }), text(side.x + 16, 654, side.w - 32, '1,100', { size: 66, font: D, weight: 900, color: paper, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }), text(side.x + 16, 726, side.w - 32, 'JOBS AT THE DAYTON LINE', { size: 8.5, font: S, weight: 800, color: '#FFB3C0', tracking: .2, wrap: false, label: 'Data unit', role: 'KICKER' }), text(side.x + 16, 746, side.w - 32, 'About a third of the number at the plant it replaced. Median pay is up 40%.', { size: 10.4, font: T, italic: true, color: paper, leading: 1.35, label: 'Data label', role: 'CAPTION' }));
        // wide chart below
        const wy = Math.max(bottomOf(rr.objs), 900) + 40;
        out.push(hr(G.x, wy, G.w, ink, 2.5, { label: 'Rule' }), ...fig(G.x, wy + 12, '3', 'Where reshored factories are going, new investment by sector, $bn', 520));
        out.push(...barChart(G.x, wy + 30, spanOf(c, 0, 5).w, 250, [['Semis', 410], ['EVs', 280], ['Batteries', 190], ['Pharma', 150], ['Solar', 90], ['Steel', 60], ['Aero', 55]], { font: S, ink, accent, size: 9, highlight: 0, gap: 14, barColor: alpha(ink, .75), ticks: 4 }), src(G.x, wy + 296, 'Company announcements; Ledger analysis'));
        out.push(...photo(ctx, side.x, wy + 30, side.w, 230, { tone: 'light', caption: 'Technician, Dayton', label: 'Inset photograph' }), ...caption(side.x, wy + 266, side.w, 'A maintenance technician, one of the roles the new plants cannot fill fast enough.', 'Photograph Kofi Mensah', { font: S, color: ink, size: 8.5, transform: 'none' }));
        const ty7 = wy + 360;
        out.push(hr(G.x, ty7, G.w, ink, 2.5, { label: 'Rule' }), ...fig(G.x, ty7 + 12, '4', 'Four of the new plants, compared', 420));
        const tx7 = [0, 250, 430, 560, 700, 820].map(o => G.x + o);
        ['PLANT', 'LOCATION', 'JOBS', 'ROBOTS', 'MEDIAN PAY', 'OPENS'].forEach((h, i) => out.push(text(tx7[i], ty7 + 40, 160, h, { size: 8, font: S, weight: 800, color: mute, tracking: .14, wrap: false, label: 'Table head', role: 'LABEL' })));
        [['Dayton line', 'Ohio', '1,100', '40', '$68,000', '2026'], ['Lakeshore cells', 'Michigan', '860', '34', '$71,500', '2026'], ['Foundry Two', 'Texas', '640', '52', '$64,200', '2027'], ['Summit packs', 'Nevada', '1,420', '71', '$66,800', '2027']].forEach((row, ri) => { const y = ty7 + 58 + ri * 28; out.push(hr(G.x, y, G.w, alpha(ink, .25), .5, { label: 'Row rule' }), ...row.map((cell, ci) => text(tx7[ci], y + 7, ci === 5 ? 120 : 220, cell, { size: ci === 0 ? 12 : 11, font: ci === 0 ? D : M, weight: ci === 0 ? 900 : 400, color: ink, wrap: false, label: 'Table cell', role: 'BODY' }))); });
        out.push(...[['1', 'Figures from company announcements; “investment” includes subsidies and tax credits.'], ['2', 'Wages at the Dayton plant, 2026 dollars; predecessor employer’s 2019 median.'], ['3', 'Technician certificates are issued by state community colleges; the programme did not exist in 2015.']].flatMap(([n, t], i) => [text(G.x, 1520 + i * 14 - 18, 14, n, { size: 7.5, font: S, weight: 800, color: accent, wrap: false, label: 'Note number', role: 'FOOTNOTE' }), text(G.x + 14, 1520 + i * 14 - 18, G.w - 14, t, { size: 7.5, font: S, color: mute, wrap: false, label: 'Footnote', role: 'FOOTNOTE' })]).map(o => ({ ...o, y: o.y - 0 })));
      } else {
        const main = spanOf(c, 0, 5), side = spanOf(c, 6, 7);
        out.push(kicker(G.x, 86, 300, 'The Great Reshoring  ·  2'), hr(G.x, 106, G.w, ink, 1, { label: 'Rule' }));
        out.push(...pullQuote(G.x, 124, G.w, '“It is good. It is real. Ask me again in five years.”', 'Rosalind Okafor, shift supervisor', { font: D, size: 66, weight: 900, italic: true, color: ink, leading: 1.02, rule: 'both', ruleColor: secondary, ruleWeight: 3, attribFont: S, pad: 16, tracking: -.02 }));
        const top = 340, cols3 = columns(main.x, main.w, 3, 18);
        const rr = balance(B_PARAS.slice(5).join('\n') + '\n' + 'The wider lesson, if there is one, is about patience. Industrial change is slow and its costs arrive before its benefits. The towns that reshoring is meant to help were hollowed out over three decades; they will not be restored in three years. Politicians who promise otherwise are, at best, optimists, and at worst auctioneers.\nWhat can be done is modest and measurable. Fund the training before the building. Publish the subsidy per job. Insist on a sunset. And let the factories prove, in the only way that counts, that they can make a thing at a price that people will pay. Dayton is a start. It is not yet an answer.', [{ ...cols3[0], y: top, b: 900 }, { ...cols3[1], y: top, b: 900 }, { ...cols3[2], y: top, b: 900 }], body);
        warnFlow('ledger p8', rr); out.push(...rr.objs);
        out.push(...sidebar(side.x, top, side.w, 'The numbers', ['$1.2tn announced since 2022', '40 robots, 1,100 people', '18% extra cost, reshored', '9% annual wage growth abroad', '31% productivity gain in new plants'], { fill: tint, titleFont: S, titleColor: accent, bodyFont: T, bodyColor: ink, size: 10.4, lead: 14, titleSize: 9, pad: 14, rule: ink, numbered: true, accent, tracking: .2 }));
        out.push(...fig(G.x, 780, '5', 'Wages in once-cheap economies, % annual growth', 460));
        out.push(...lineChart(G.x, 796, spanOf(c, 0, 3).w, 380, [[0, .3], [.15, .34], [.3, .42], [.45, .5], [.6, .62], [.75, .72], [.9, .8], [1, .86]], { font: S, ink, accent, size: 8.5, endLabel: '9%', fill: alpha(accent, .09), xlabels: ['2014', '2020', '2026'], weight: 2.5 }), src(G.x, 1190, 'National statistics offices; Ledger calculations'));
        out.push(...photo(ctx, spanOf(c, 4, 7).x, 780, spanOf(c, 4, 7).w, 390, { tone: 'light', caption: 'Community college, Dayton', label: 'Inset photograph' }), ...caption(spanOf(c, 4, 7).x, 1176, spanOf(c, 4, 7).w, 'Dayton’s community college has doubled its technician programme and still has a waiting list of more than six hundred.', 'Photograph Kofi Mensah', { font: S, color: ink, size: 8.5, transform: 'none' }));
        out.push(hr(G.x, 1280, G.w, ink, 2.5, { label: 'Rule' }), kicker(G.x, 1292, 300, 'Further reading'), ...['“Made in America, again” — the Ledger special report, July 2026', '“The cost of resilience” — a working paper from the Brookfield Institute', '“Why skills, not subsidies, decide the outcome” — Daniel Achebe, online'].map((t, i) => text(G.x, 1316 + i * 24, G.w, t, { size: 10.4, font: T, italic: true, color: ink, label: 'Reading list', role: 'BODY' })));
      }
      out.push(...head(pageIndex === 6 ? 'The Great Reshoring' : 'The Great Reshoring  ·  continued'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(kicker(G.x, 86, 300, 'Chief executive Q&A'), hr(G.x, 106, G.w, ink, 1, { label: 'Rule' }));
      out.push(text(G.x - 2, 116, spanOf(c, 0, 5).w, '“Welders do not come and go.”', { size: 80, font: D, weight: 900, italic: true, color: ink, tracking: -.03, leading: .98, label: 'Interview headline', role: 'HEADLINE' }));
      const left = spanOf(c, 0, 2), right = spanOf(c, 3, 7);
      out.push(...photo(ctx, left.x, 320, left.w, 400, { tone: 'light', caption: 'Imani Okeke, chief executive', label: 'Portrait' }), ...caption(left.x, 726, left.w, 'Imani Okeke, chief executive of Harbor Industrial, in the lobby of the new Dayton plant.', 'Photograph Kofi Mensah', { font: S, color: ink, size: 8.5, transform: 'none' }));
      out.push(rect(left.x, 800, left.w, 360, tint, { label: 'Profile box', role: 'SIDEBAR' }), hr(left.x, 800, left.w, ink, 2.5, { label: 'Profile rule' }), kicker(left.x + 12, 812, left.w - 24, 'The company', ink));
      [['Founded', '1962'], ['Revenue', '$11.4bn'], ['Employees', '31,000'], ['New plants', '4 (2024–27)'], ['Capex plan', '$6.8bn'], ['Share price, YTD', '+22%']].forEach(([k, v], i) => out.push(text(left.x + 12, 842 + i * 50, left.w - 24, k.toUpperCase(), { size: 7.5, font: S, weight: 800, color: mute, tracking: .14, wrap: false, label: 'Profile key', role: 'LABEL' }), text(left.x + 12, 856 + i * 50, left.w - 24, v, { size: 20, font: D, weight: 900, color: ink, wrap: false, label: 'Profile value', role: 'LABEL' })));
      let y = 330;
      B_QA.forEach(([q, a], i) => { const qq = text(right.x, y, right.w, q, { size: 17, font: D, weight: 900, color: accent, leading: 1.15, label: 'Question', role: 'KICKER' }); const aa = text(right.x, below(qq, 6), right.w, a, { size: 11.5, font: T, color: ink, leading: 1.5, label: 'Answer', role: 'BODY' }); out.push(qq, aa); y = below(aa, 26); if (i === 1) { const pq = pullQuote(right.x, y, right.w, '“The rest is, frankly, the cost of sleeping.”', null, { font: D, size: 36, weight: 900, italic: true, color: secondary, leading: 1.08, rule: 'top', ruleColor: ink, ruleWeight: 2.5, pad: 12 }); out.push(...pq); y = bottomOf(pq) + 32; } });
      out.push(...head('Chief executive Q&A'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 76, 700, 'Ten charts', { size: 92, font: D, weight: 900, italic: true, color: ink, tracking: -.03, wrap: false, leading: 1, label: 'Essay headline', role: 'HEADLINE' }), text(G.right - 420, 104, 420, 'THE WEEK IN SMALL MULTIPLES', { size: 9, font: S, weight: 800, color: accent, tracking: .2, align: 'right', wrap: false, label: 'Essay kicker', role: 'KICKER' }));
      const items: Array<[string, string, string, number[], boolean]> = [['Jobs added', '142k', 'Payrolls, monthly', [6, 8, 5, 9, 7, 10], true], ['Inflation', '2.4%', 'Consumer prices, annual', [9, 8, 7, 6, 5, 4], false], ['Unemployment', '4.1%', 'Rate, monthly', [4, 4, 5, 5, 6, 6], false], ['Retail sales', '+0.7%', 'Month on month', [5, 6, 4, 7, 8, 9], true], ['Factory orders', '+1.9%', 'Durable goods', [4, 5, 5, 7, 8, 10], true], ['Housing starts', '1.31m', 'Annualised', [8, 7, 7, 6, 6, 5], false], ['Consumer mood', '98.7', 'Index, 1985 = 100', [5, 6, 5, 6, 7, 7], true], ['Oil stocks', '421m', 'Barrels, US crude', [5, 6, 8, 8, 9, 10], true], ['Freight rates', '$2,140', 'Container, per FEU', [9, 9, 8, 6, 5, 4], false], ['Chip sales', '$52bn', 'Global, monthly', [3, 4, 5, 6, 8, 10], true], ['Credit growth', '3.8%', 'Annual', [4, 5, 5, 5, 6, 6], true], ['Dollar index', '102.4', 'Trade-weighted', [7, 7, 6, 6, 6, 5], false]];
      const gc = columns(G.x, G.w, 4, 18);
      items.forEach(([n, v, d, sp, u], i) => { const x = gc[i % 4].x, y = 168 + Math.floor(i / 4) * 360, w = gc[0].w; out.push(hr(x, y, w, ink, 2.5, { label: 'Cell rule' }), text(x, y + 10, w, `Fig ${i + 1}`, { size: 8, font: S, weight: 800, color: accent, wrap: false, label: 'Figure number', role: 'KICKER' }), text(x, y + 26, w, n, { size: 21, font: D, weight: 900, italic: true, color: ink, wrap: false, label: 'Chart title', role: 'HEADLINE' }), text(x, y + 56, w, v, { size: 46, font: D, weight: 900, color: u ? ink : secondary, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }), ...sparkBars(x, y + 128, w, 130, sp.map(k => k * 1.0), alpha(ink, .25), u ? up : dn), text(x, y + 270, w, d, { size: 9.5, font: T, italic: true, color: ink, label: 'Chart caption', role: 'CAPTION' }), text(x, y + 306, w, 'SOURCE  OFFICIAL STATISTICS', { size: 7, font: S, weight: 600, color: mute, tracking: .12, wrap: false, label: 'Source', role: 'CREDIT' })); });
      out.push(...head('Ten charts'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 70, W - 120, 'The Ledger', { size: 130, font: D, weight: 900, italic: true, color: ink, tracking: -.03, wrap: false, leading: 1, label: 'Colophon masthead', role: 'COVER_TITLE' }), hr(G.x, 214, G.w, ink, 3, { label: 'Rule' }));
      const staff: Array<[string, Array<[string, string]>]> = [['Editorial', [['Editor-in-chief', 'Daniel Achebe'], ['Deputy editor', 'Priya Raman'], ['Industry editor', 'Daniel Achebe'], ['Markets editor', 'Tomas Eklund'], ['Economics editor', 'Mei Tanaka'], ['Data editor', 'Rowan Pike']]], ['Art & production', [['Art director', 'Hollis Grange'], ['Photo editor', 'Marguerite Ellis'], ['Chart design', 'Lena Okafor'], ['Copy chief', 'Tobias Wren'], ['Production', 'Studio Ninety'], ['Prepress', 'Press Group 4']]], ['Business', [['Publisher', 'Imani Cole'], ['Advertising', 'Sofia Lindgren'], ['Circulation', 'Marcus Teller'], ['Subscriptions', 'Rhea Kapoor'], ['Events', 'Callum Reyes'], ['Legal', 'Samuel Achterberg']]]];
      const cc = columns(G.x, G.w, 3, 28);
      staff.forEach(([h, rows], i) => { out.push(kicker(cc[i].x, 238, cc[0].w, h, ink), hr(cc[i].x, 256, cc[0].w, ink, 1, { label: 'Column rule' })); rows.forEach(([role, name], k) => out.push(text(cc[i].x, 270 + k * 52, 160, role.toUpperCase(), { size: 7.5, font: S, weight: 700, color: mute, tracking: .14, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(cc[i].x, 284 + k * 52, cc[0].w, name, { size: 20, font: D, weight: 900, italic: true, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' }))); });
      const boxes: Array<[string, string]> = [['Corrections & clarifications', 'In our issue of 1 October the chart on page 14 gave the dollar index as 120.4; it should have read 102.4. A caption on page 31 described a pension fund as having $4bn in assets; the correct figure is $4.4bn. We regret both errors. Corrections: corrections@theledger.example.'], ['How to subscribe', '52 issues of print and full digital access are $249 a year ($14 a month for the first year). Students and educators $89. Corporate licences from $1,400 for five readers. theledger.example/subscribe or call 1 800 555 0141. Back issues $9 each.'], ['Contact & advertising', 'The Ledger, 100 Exchange Place, Suite 2200, New York, NY 10005. Newsdesk: news@theledger.example. Advertising: advertising@theledger.example. Full page 10.875 × 16.875 in with 0.125 in bleed; half page 10 × 7.3 in. Rate card online.'], ['Rights & printing', '© 2026 The Ledger Media Group. Reproduction prohibited without written permission. Printed on 40 lb. newsprint stock by Press Group 4 in Cleveland, Ohio and Kent, England. Trim size 11 × 17 in; saddle-stitched.']];
      boxes.forEach(([h, t], i) => { const x = cc[0].x + (i % 2) * (G.w / 2 + 14), y = 700 + Math.floor(i / 2) * 330, w = G.w / 2 - 14; out.push(hr(x, y, w, ink, 2.5, { label: 'Box rule' }), text(x, y + 10, w, h, { size: 22, font: D, weight: 900, italic: true, color: accent, label: 'Box heading', role: 'KICKER' }), text(x, y + 46, w, t, { size: 11.5, font: T, color: ink, leading: 1.55, label: 'Colophon text', role: 'BODY' })); });
      out.push(...barcodeBox(G.right - 140, 1420, 140, 66, { plate: paper, ink, seed, code: 'ISSN 0042-1234', note: 'VOL. 41  NO. 14', font: M }));
      out.push(...head('Masthead'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, ink)];
      out.push(text(G.x, 50, 400, 'THE LONG VIEW', { size: 10, font: S, weight: 800, color: '#FFB3C0', tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }), hr(G.x, 72, G.w, paper, 2.5, { label: 'Rule' }));
      out.push(text(G.x - 4, 86, W - 80, 'Twenty years of\nthe same argument', { size: 120, font: D, weight: 900, italic: true, color: paper, tracking: -.03, leading: .96, label: 'Back cover headline', role: 'COVER_LINE' }));
      out.push(text(G.x, 430, 620, 'Since 2006 the world has had a financial crisis, a pandemic, a trade war and a hot war. The share of manufacturing in rich-world output has barely moved. The argument about whether it should is as lively as ever.', { size: 20, font: D, italic: true, color: alpha(paper, .9), leading: 1.35, label: 'Back cover deck', role: 'COVER_LINE' }));
      const pts: Array<[number, number]> = Array.from({ length: 21 }, (_, i) => [i / 20, .52 + .1 * Math.sin(i * .7) - .16 * (i / 20) + (i === 6 ? -.18 : 0) + (i === 7 ? -.12 : 0)]);
      out.push(...lineChart(G.x, 640, G.w, 640, pts, { font: S, ink: paper, accent: '#FFB3C0', size: 9, endLabel: '10.6%', fill: 'rgba(255,179,192,.1)', xlabels: ['2006', '2016', '2026'], weight: 3 }));
      out.push(...fig(G.x, 612, '', 'Manufacturing’s share of rich-world output, %', 560).map(o => ({ ...o, fill: o.objectLabel === 'Figure title' ? paper : o.fill })));
      [[.30, 'Financial crisis'], [.6, 'Pandemic'], [.82, 'Reshoring begins']].forEach(([px, l], i) => out.push(vrule(G.x + (px as number) * G.w, 660, 560, alpha(paper, .25), .75, 'Event marker'), text(G.x + (px as number) * G.w + 8, 670 + i * 16, 160, l as string, { size: 9, font: S, weight: 700, color: alpha(paper, .85), wrap: false, label: 'Event label', role: 'CAPTION' })));
      out.push(hr(G.x, 1320, G.w, paper, 2.5, { label: 'Rule' }), text(G.x, 1336, 620, 'Read the argument every week.', { size: 32, font: D, weight: 900, italic: true, color: paper, wrap: false, label: 'Back cover call', role: 'COVER_LINE' }), text(G.x, 1384, 620, 'theledger.example/subscribe  ·  1 800 555 0141  ·  52 issues, $249', { size: 11, font: S, weight: 600, color: alpha(paper, .8), tracking: .06, wrap: false, label: 'Back cover URL', role: 'LABEL' }));
      out.push(...barcodeBox(G.right - 140, 1456, 140, 66, { plate: paper, ink, seed, code: '0 74470 41014 0', note: 'THE LEDGER 14', font: M }), text(G.x, 1480, 500, 'THE LEDGER  ·  BUSINESS, MARKETS & POLICY', { size: 9, font: S, weight: 700, color: alpha(paper, .7), tracking: .2, wrap: false, label: 'Imprint', role: 'LABEL' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 7 · BASEMENT STATIC — music & nightlife zine-magazine. Collage, overprint, brutal type, tape and torn paper.
//     Trim 8.5 × 11 in (816 × 1056 px), saddle-stitched with two staples. 12-column grid, 14 px baseline —
//     used loudly and broken on purpose.
// ═════════════════════════════════════════════════════════════════════════════
const ZG: Grid = { cols: 12, gutter: 8, base: 14, top: 62, bottom: 62, inner: 44, outer: 30 };
const Z_PARAS = [
  'The stairs down to The Sump are steep, unlit, and smell of spilled cider and wet concrete. At nine on a Thursday there are eleven people in the room, one of whom is the sound engineer, who is also the bartender, who is also, he will tell you, the landlord’s nephew. By ten there are two hundred and the ceiling is sweating.',
  'This is the whole secret of the basement: it does not have to be good, it has to be near. A venue is a decision a neighbourhood makes about where noise is allowed to live. The Sump was an oil-tank cellar, then a dubious sauna, then nothing; in 2019 four friends and a van load of used PA gear turned it into the loudest ninety square metres in the city.',
  'Tonight the bill is four bands and a man with a drum machine and a leaf blower. The first act, a three-piece called Wet Concrete, plays nine songs in eleven minutes. The second, a duo, appears to be having a fight and calls it a ballad. Nobody leaves. The bar sells out of the cheap lager by half ten, which is how everyone knows it is going well.',
  'Booking at The Sump is done by one woman, a former librarian called Dot, on a phone with a cracked screen, in a notebook with a sticker on the front that says, simply, NO. She says it often. “A venue is mostly the art of saying no politely,” she tells me, “and yes to the weird one at the back who sent a cassette.”',
  'The cassette, in this case, was from a trio who now sell out three nights in a row. Dot keeps the original in a shoebox with a few hundred others. She plays one a week, on the bar speaker, while she counts the float. “Some of them are terrible,” she says. “Some of them are the best thing I will hear this year. You cannot know until you press play.”',
  'The economics are absurd. The room holds 220; tickets are eight pounds; the headliner takes sixty percent; the rest pays for a fire inspection, a PA, a soundman and a very large amount of tape. The Sump has lost money in four of its five years. It will, Dot says, keep doing so until it stops being fun, and she does not expect that to happen soon.',
  'At midnight the last band, a gloriously out-of-tune seven-piece with a trombone, begins to play something between a hymn and a riot. The ceiling drips on the front row. A boy in a borrowed suit is lifted onto shoulders and, for four minutes, is the most important person in the city. Then the lights come on, and it is a basement again.',
  'On the stairs back up, in the cold, there is a queue for the next night’s tickets. A girl in the line is holding a cassette. “It is my first one,” she says. “Do you think she will listen?” I say yes. I think, as I climb into the street, that this is what a scene is: a stranger with a cassette and a stranger with a shoebox, and a room, below ground, between them.',
];
const Z_QA: Array<[string, string]> = [
  ['WHO ARE YOU?', 'Dot. I run the door, the booking and the mop. Sometimes in that order.'],
  ['FIRST GIG YOU EVER WENT TO?', 'A church hall in 1998. Four people, two amps, one very sincere drummer.'],
  ['WORST NIGHT AT THE SUMP?', 'The night the ceiling actually fell. We did the second set by torchlight. It was better.'],
  ['WHAT MAKES A GOOD BAND?', 'They arrive early, they leave the room better than they found it, and they are loud on purpose.'],
  ['WHAT DO YOU LISTEN TO AT HOME?', 'Silence. Honestly. I have heard enough.'],
  ['WHAT IS THE FUTURE OF LIVE MUSIC?', 'A basement, a bar and somebody who will say yes.'],
  ['ANYTHING TO ADD?', 'Please buy a drink. The cheap lager is not a joke.'],
];

const static_: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, ZG), c = G.cols, r = orn.rng(seed);
  const AN = 'anton' as const, AB = 'archivoBlack' as const, TW = 'specialElite' as const, MO = 'spaceMono' as const, MK = 'permanentMarker' as const;
  const white = '#FBFAF5';
  const tape = (x: number, y: number, w: number, rot: number, color = 'rgba(255,255,255,.55)') => rect(x, y, w, 22, color, { rotation: rot, stroke: 'rgba(0,0,0,.08)', strokeWidth: .5, label: 'Tape', role: 'ORNAMENT' });
  const specks = (x: number, y: number, w: number, h: number, n: number, color = ink) => orn.specks(x, y, w, h, n, color, seed + 3, .35);
  const halftone = (x: number, y: number, w: number, h: number, color: string, op = .55) => orn.stripes(x, y, w, h, Math.max(4, Math.min(34, Math.round(h / 18))), 2.6, color, { opacity: op, label: 'Halftone scanlines' });
  const stapleMarks = (): Obj[] => G.verso || ctx.pageIndex === 0 ? [] : [];
  const staples = (): Obj[] => [rect(-2, H * .25 - 1, 14, 3, '#9A9A96', { label: 'Staple' }), rect(-2, H * .75 - 1, 14, 3, '#9A9A96', { label: 'Staple' })];
  const head = (section: string, color = ink) => [
    text(G.verso ? G.x : G.right - 300, 26, 300, G.verso ? 'BASEMENT STATIC  ·  ISSUE 09' : section, { size: 9, font: MO, weight: 700, color, tracking: .08, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    rect(G.verso ? G.right - 46 : G.x, H - 48, 46, 24, color, { label: 'Folio plate', role: 'ORNAMENT' }), text(G.verso ? G.right - 46 : G.x, H - 46, 46, String(G.pageNo), { size: 18, font: AN, color: color === ink ? paper : ink, align: 'center', wrap: false, leading: 1, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x : G.right - 300, H - 44, 300, G.verso ? section : 'BASEMENTSTATIC.EXAMPLE', { size: 8, font: MO, weight: 700, color, tracking: .08, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const body = { font: TW, size: 10.4, lead: 14, color: ink, weight: 400, gap: 6, role: 'BODY' as const };
  const sticker = (cx: number, cy: number, rad: number, l1: string, l2: string, fill: string, fg: string, rot = -8): Obj[] => [path(cx - rad, cy - rad, rad * 2, rad * 2, orn.burstPath(16, seed), fill, { rotation: rot, label: 'Sticker burst' }), text(cx - rad, cy - rad * .42, rad * 2, l1, { size: rad * .52, font: AN, color: fg, align: 'center', wrap: false, leading: 1, rotation: rot, label: 'Sticker line', role: 'LABEL' }), text(cx - rad, cy + rad * .22, rad * 2, l2, { size: 8, font: MO, weight: 700, color: fg, align: 'center', wrap: false, tracking: .08, rotation: rot, label: 'Sticker sub-line', role: 'LABEL' })];

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 40));
      out.push(...photo(ctx, 120, 470, 600, 540, { tone: 'dark', shade: '#24201C', caption: 'Cover photograph · Wet Concrete, The Sump, 11:42 p.m.', rotation: 2.5, label: 'Cover photograph' }));
      out.push(...halftone(130, 480, 580, 520, accent, .35));
      out.push(text(14, 0, 790, 'BASEMENT', { size: 212, font: AN, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(rect(-BL, 232, W + BL * 2, 200, accent, { blend: 'multiply', label: 'Overprint bar', role: 'ORNAMENT' }), text(14, 154, 790, 'STATIC', { size: 282, font: AN, color: ink, tracking: .02, wrap: false, leading: 1, blend: 'multiply', label: 'Masthead (second line)', role: 'COVER_TITLE' }));
      out.push(text(26, 14, 240, 'LOUD · LOCAL · LATE', { size: 10, font: MO, weight: 700, color: ink, tracking: .14, wrap: false, label: 'Tagline', role: 'LABEL' }), text(W - 266, 14, 240, 'ISSUE 09  ·  NOV 2026  ·  £6', { size: 10, font: MO, weight: 700, color: ink, tracking: .1, align: 'right', wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(tape(150, 460, 120, -14), tape(590, 454, 120, 12));
      out.push(rect(36, 520, 250, 118, secondary, { rotation: -4, label: 'Cover sticker', role: 'ORNAMENT' }), text(48, 530, 230, 'WET CONCRETE', { size: 38, font: AN, color: ink, wrap: false, leading: 1, rotation: -4, label: 'Cover line', role: 'COVER_LINE' }), text(48, 574, 230, '9 SONGS IN 11 MINUTES. THE BEST SET OF THE YEAR.', { size: 11, font: MO, weight: 700, color: ink, leading: 1.4, rotation: -4, label: 'Cover line deck', role: 'COVER_LINE' }));
      out.push(rect(520, 700, 250, 108, white, { rotation: 3, shadow: { x: 2, y: 3, blur: 4, color: 'rgba(0,0,0,.25)' }, label: 'Cover sticker', role: 'ORNAMENT' }), text(534, 710, 226, 'THE ROOM WHERE EVERYTHING GETS LOUD', { size: 24, font: AN, color: ink, leading: 1.02, rotation: 3, label: 'Cover line', role: 'COVER_LINE' }), text(534, 772, 226, 'P.24', { size: 12, font: MO, weight: 700, color: accent, rotation: 3, wrap: false, label: 'Cover line page', role: 'COVER_LINE' }));
      [['40 BEST CASSETTES', 'P.46', 36, 830, -3], ['THE LEAF-BLOWER DRUMMER', 'P.58', 50, 888, 2], ['WHY EVERY CITY NEEDS A BASEMENT', 'P.70', 30, 946, -2]].forEach(([t, p, x, y, rot]) => out.push(rect(x as number, y as number, 330, 42, ink, { rotation: rot as number, label: 'Cover line bar', role: 'ORNAMENT' }), text((x as number) + 10, (y as number) + 8, 310, `${t}  ${p}`, { size: 17, font: AN, color: paper, wrap: false, tracking: .04, leading: 1, rotation: rot as number, label: 'Cover line', role: 'COVER_LINE' })));
      out.push(...sticker(716, 500, 60, 'FREE', 'SPLIT 7 INCH', accent, ink, 10));
      out.push(...barcodeBox(676, 968, 128, 56, { plate: white, ink, seed, code: '0 74470 09009 7', note: 'STATIC 09', font: 'ibmPlexMono' }));
      out.push(...staples());
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 30));
      out.push(rect(-BL, 38, W + BL * 2, 150, ink, { label: 'Title band', role: 'ORNAMENT' }), text(G.x - 4, 6, 740, 'SIDE', { size: 238, font: AN, color: paper, wrap: false, leading: 1, label: 'Contents title', role: 'HEADLINE' }), text(G.x + 400, 6, 300, 'A', { size: 238, font: AN, color: accent, wrap: false, leading: 1, label: 'Contents title', role: 'HEADLINE' }));
      out.push(text(G.x, 204, 600, 'TRACKLIST  ·  PAGES 08–44  ·  33⅓ RPM', { size: 11, font: MO, weight: 700, color: ink, tracking: .12, wrap: false, label: 'Contents intro', role: 'KICKER' }));
      const tracks: Array<[string, string, string, string]> = [['01', 'THE ROOM WHERE EVERYTHING GETS LOUD', 'A night at The Sump, with Dot and the cassette shoebox', '24'], ['02', '10 QUESTIONS WITH DOT', 'Booker, door, mop. Please buy a drink.', '70'], ['03', 'GIG GUIDE', 'Forty shows in the dark, with the cheap ones in bold', '12'], ['04', 'OUR 40 BEST CASSETTES', 'Tape, glorious tape, ranked by volume', '46'], ['05', 'THE LEAF-BLOWER DRUMMER', 'A man, a machine, a long extension lead', '58'], ['06', 'CONTACT SHEET', 'Wet Concrete, from the third row, at 11:42', '78'], ['07', 'LETTERS & LIES', 'Your angriest mail, set in type', '08']];
      tracks.forEach(([n, t, d, p], i) => { const y = 242 + i * 106; out.push(text(G.x, y, 90, n, { size: 72, font: AN, color: i === 0 ? accent : ink, wrap: false, leading: 1, label: 'Track number', role: 'FOLIO' }), text(G.x + 98, y + 2, 500, t, { size: 34, font: AN, color: ink, leading: 1, label: 'Contents title', role: 'HEADLINE' }), text(G.x + 98, y + 64, 480, d, { size: 10.4, font: TW, color: ink, leading: 1.4, label: 'Contents description', role: 'BODY' }), text(G.right - 106, y + 6, 106, `P.${p}`, { size: 26, font: MO, weight: 700, color: ink, align: 'right', wrap: false, label: 'Contents folio', role: 'FOLIO' }), hr(G.x, y + 96, G.w, ink, 2, { label: 'Track rule', dash: [8, 5] })); });
      out.push(rect(G.x + 560, 262, 180, 62, secondary, { rotation: 5, blend: 'multiply', label: 'Highlight', role: 'ORNAMENT' }), text(G.x + 566, 280, 170, 'THE COVER STORY', { size: 18, font: MK, color: ink, wrap: false, rotation: 5, label: 'Handwritten flag', role: 'CAPTION' }));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 30));
      out.push(text(G.x, 54, 700, 'DEAR\nBASEMENT,', { size: 120, font: AN, color: ink, leading: .86, wrap: false, label: 'Letter headline', role: 'HEADLINE' }));
      out.push(rect(G.x + 6, 206, 360, 56, accent, { blend: 'multiply', rotation: -1, label: 'Overprint bar', role: 'ORNAMENT' }));
      const sheet = { x: 70, y: 292, w: 430, h: 640 };
      out.push(rect(sheet.x, sheet.y, sheet.w, sheet.h, white, { rotation: -1.5, shadow: { x: 3, y: 5, blur: 8, color: 'rgba(0,0,0,.28)' }, label: 'Typed letter sheet', role: 'SIDEBAR' }), tape(sheet.x + 150, sheet.y - 10, 100, 3), tape(sheet.x + sheet.w - 40, sheet.y + sheet.h - 12, 90, -40));
      const letter = 'Issue nine is late because we took the printer’s advice and went looking for the loudest room in the country. We found it under a hardware shop in the north. It holds two hundred people, one trombone and an astonishing amount of damp.\nThis is not a polished issue. The staples are visible, the photographs are mostly out of focus, and at least one of the interviews was conducted through a hole in a door. We think that is correct.\nInside: a night at The Sump with the woman who says no for a living; forty cassettes, ranked by how much we wanted to play them twice; a man with a leaf blower; and the best set of the year, in nine songs, in eleven minutes.\nSend us your tapes. Send us your angry letters. Bring a coat.';
      const rr = flow(letter, [{ x: sheet.x + 28, y: sheet.y + 40, w: sheet.w - 56, b: sheet.y + sheet.h - 120 }], { ...body, size: 11, lead: 15.5 }); warnFlow('static letter', rr); out.push(...rr.objs.map(o => ({ ...o, rotation: -1.5 })));
      out.push(text(sheet.x + 28, sheet.y + sheet.h - 96, 300, 'LOVE AND NOISE,', { size: 11, font: TW, color: ink, wrap: false, rotation: -1.5, label: 'Letter sign-off', role: 'BODY' }), text(sheet.x + 28, sheet.y + sheet.h - 72, 300, 'the editors', { size: 40, font: MK, color: accent, wrap: false, rotation: -3, label: 'Signature', role: 'BYLINE' }));
      out.push(...photo(ctx, 540, 296, 216, 300, { tone: 'light', caption: 'The editors, in the rain', rotation: 4, label: 'Editors photograph' }), ...halftone(540, 296, 216, 300, ink, .35), tape(600, 280, 100, -6));
      out.push(text(540, 626, 216, 'THE CREW (L–R): ONE EDITOR, ONE PHOTOGRAPHER, ONE VERY BORED DOG', { size: 9, font: MO, weight: 700, color: ink, leading: 1.4, rotation: 4, label: 'Caption', role: 'CAPTION' }));
      out.push(...sticker(640, 790, 82, 'ISSUE', '9 / 12 PAGES OF NOISE', secondary, ink, -12));
      out.push(text(520, 890, 250, 'circle the word you hate →', { size: 20, font: MK, color: accent, wrap: false, rotation: -6, label: 'Handwritten note', role: 'CAPTION' }));
      out.push(...head('Letter'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 30));
      out.push(text(G.x - 4, 40, 780, 'GIG GUIDE', { size: 188, font: AN, color: ink, wrap: false, leading: 1, label: 'Department title', role: 'HEADLINE' }), rect(G.x - 8, 224, 480, 30, accent, { blend: 'multiply', rotation: -1, label: 'Overprint bar', role: 'ORNAMENT' }), text(G.x, 228, 500, 'FORTY SHOWS IN THE DARK. THE BOLD ONES ARE CHEAP.', { size: 12, font: MO, weight: 700, color: ink, wrap: false, label: 'Department deck', role: 'DECK' }));
      const days: Array<[string, Array<[string, string, string, string, boolean]>]> = [['THU 08', [['21:00', 'THE SUMP', 'WET CONCRETE / MAGPIE / LEAF', '£8', true], ['20:00', 'KILN ROOM', 'DOUBLE DEAD / SALT FLATS', '£6', false]]], ['FRI 09', [['22:00', 'THE SUMP', 'BIG HOLE / THE EXPLAINERS', '£8', false], ['19:30', 'OLD TANNERY', 'ORCHARD 4 / SUBWAY JIM', '£10', false], ['23:00', 'BOX 17', 'DRUM MACHINE NIGHT', 'FREE', true]]], ['SAT 10', [['21:00', 'THE SUMP', 'THE 7-PIECE WITH TROMBONE', '£8', true], ['20:00', 'ST. JUDE’S HALL', 'CHOIR OF NO ONE', '£5', false], ['22:30', 'KILN ROOM', 'HOUSE WIPE / SONIC SOUP', '£8', false]]], ['SUN 11', [['16:00', 'RECORD SHOP', 'ALL-DAYER: 11 BANDS', 'FREE', true], ['19:00', 'THE SUMP', 'OPEN-MIC OF SHAME', '£2', false]]]];
      const colw = (G.w - 24) / 2;
      days.forEach(([d, gigs], i) => {
        const x = G.x + (i % 2) * (colw + 24), y0 = 288 + Math.floor(i / 2) * 330;
        out.push(rect(x, y0, colw, 48, ink, { label: 'Day bar', role: 'ORNAMENT' }), text(x + 10, y0 - 8, colw, d, { size: 54, font: AN, color: i % 2 ? accent : paper, wrap: false, leading: 1, label: 'Day', role: 'HEADLINE' }));
        gigs.forEach(([tm, v, bands, pr_, pick], k) => { const y = y0 + 60 + k * 82; if (pick) out.push(rect(x - 4, y - 4, colw + 8, 72, secondary, { blend: 'multiply', rotation: k % 2 ? .6 : -.6, label: 'Pick highlight', role: 'ORNAMENT' })); out.push(text(x, y, 60, tm, { size: 13, font: MO, weight: 700, color: ink, wrap: false, label: 'Time', role: 'LABEL' }), text(x + 66, y - 3, colw - 150, v, { size: 22, font: AN, color: ink, wrap: false, leading: 1, label: 'Venue', role: 'HEADLINE' }), text(x + colw - 80, y - 1, 80, pr_, { size: 22, font: AN, color: pr_ === 'FREE' ? accent : ink, align: 'right', wrap: false, leading: 1, label: 'Price', role: 'PRICE' }), text(x + 66, y + 26, colw - 70, bands, { size: 10.4, font: TW, color: ink, leading: 1.35, label: 'Bands', role: 'BODY' }), hr(x, y + 68, colw, ink, 1, { label: 'Listing rule', dash: [4, 3] })); });
      });
      out.push(text(G.x, 950, 560, 'LISTINGS CHANGE. THE BASEMENT DOES NOT. CHECK THE DOOR.', { size: 14, font: MK, color: accent, wrap: false, rotation: -1, label: 'Handwritten note', role: 'CAPTION' }));
      out.push(...head('Gig guide'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 28));
      out.push(...adSlot(0, 0, W, 760, { fill: '#D4CFC0', ink, accent: accent, font: MO, kind: 'Advertisement  ·  record label', spec: 'Three-quarter page  ·  8.5 × 8.3 in  ·  bleed 0.125 in top, left, right  ·  CMYK, 300 dpi  ·  PDF/X-4', bleed: true, ctx, live: 26 }));
      out.push(...halftone(0, 520, W, 240, ink, .25));
      out.push(rect(36, 784, 380, 54, ink, { rotation: -1.5, label: 'Rates bar', role: 'ORNAMENT' }), text(48, 790, 360, 'ADVERTISE IN THE STATIC', { size: 34, font: AN, color: paper, wrap: false, leading: 1, rotation: -1.5, label: 'Rates headline', role: 'HEADLINE' }));
      out.push(text(36, 862, 420, 'Full page £220. Half £130. Quarter £60. The back of the staple pays double. Labels, venues, instrument shops and anyone who owns a van. We do not take adverts for energy drinks or things we would not buy.', { size: 11, font: TW, color: ink, leading: 1.45, label: 'Rates copy', role: 'BODY' }));
      out.push(...sticker(640, 880, 86, 'GET', 'LOUD', secondary, ink, 8), text(540, 960, 240, 'ads@basementstatic.example', { size: 10, font: MO, weight: 700, color: ink, wrap: false, label: 'Contact', role: 'LABEL' }));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, ink)];
      out.push(...specks(0, 0, W, H, 40, paper));
      out.push(...photo(ctx, -20, 40, 860, 520, { tone: 'dark', shade: '#2B2723', caption: 'Opening photograph · The Sump, ceiling sweating, 11:50 p.m.', rotation: -2, label: 'Feature photograph' }), ...halftone(0, 40, W, 520, accent, .45));
      out.push(text(14, 330, 800, 'NOISE', { size: 250, font: AN, color: 'none', stroke: paper, strokeWidth: 3, wrap: false, leading: 1, label: 'Outlined word', role: 'ORNAMENT' }));
      const words: Array<[string, number, number, number, string, string, 'a' | 'b' | 'c' | 'd']> = [['THE', 36, 606, -3, paper, ink, 'b'], ['ROOM', 160, 586, 2, accent, ink, 'a'], ['WHERE', 372, 612, -2, secondary, ink, 'c'], ['EVERYTHING', 40, 700, 1.2, paper, ink, 'a'], ['GETS', 36, 806, -2, ink, paper, 'd'], ['LOUD', 190, 790, 2.5, accent, ink, 'a']];
      words.forEach(([w_, x, y, rot, bg, fg, k]) => { const fs_ = k === 'a' ? 92 : k === 'b' ? 48 : k === 'c' ? 66 : 74; const font = k === 'b' ? TW : k === 'c' ? AB : AN; const bw = w_.length * fs_ * (font === AB ? .86 : font === TW ? .62 : .5) + 22; out.push(rect(x, y, bw, fs_ * 1.05, bg, { rotation: rot, label: 'Ransom block', role: 'ORNAMENT' }), text(x + 11, y + (font === AN ? -fs_ * .08 : fs_ * .04), bw, w_, { size: fs_, font, color: fg, wrap: false, leading: 1, rotation: rot, label: 'Feature headline word', role: 'HEADLINE' })); });
      out.push(text(G.x + 400, 818, 330, 'A night at The Sump, a basement venue with a leaking ceiling, a trombone and a woman who says no for a living.', { size: 13, font: TW, color: paper, leading: 1.5, label: 'Deck', role: 'DECK' }), text(G.x + 400, 930, 330, 'WORDS BY MARROW  ·  PHOTOS BY KOFI MENSAH', { size: 10, font: MO, weight: 700, color: accent, tracking: .08, wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(...sticker(620, 980, 56, '24', 'COVER STORY', secondary, ink, 10), text(G.x, H - 42, 60, String(G.pageNo), { size: 16, font: AN, color: paper, wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 30));
      if (pageIndex === 6) {
        out.push(text(G.x, 46, 700, 'THE SUMP,\nTHURSDAY', { size: 118, font: AN, color: ink, leading: .86, wrap: false, label: 'Subhead', role: 'HEADLINE' }), rect(G.x - 6, 214, 330, 30, accent, { blend: 'multiply', rotation: -1, label: 'Overprint bar', role: 'ORNAMENT' }));
        const cols3 = columns(G.x, G.w, 3, 16);
        const rr = balance(Z_PARAS.slice(0, 6).join('\n'), [{ ...cols3[0], y: 272, b: 960 }, { ...cols3[1], y: 272, b: 960 }, { ...cols3[2], y: 560, b: 960 }], body, { dropCap: { lines: 3, font: AN, color: accent, weight: 400, scale: 1.3 } }); warnFlow('static p7', rr); out.push(...rr.objs);
        out.push(...photo(ctx, cols3[2].x, 272, cols3[2].w, 250, { tone: 'dark', shade: '#2B2723', caption: 'The queue, 8:45 p.m.', rotation: 2, label: 'Inset photograph' }), ...halftone(cols3[2].x, 272, cols3[2].w, 250, ink, .3), tape(cols3[2].x + 60, 262, 80, -5), text(cols3[2].x, 536, cols3[2].w, 'THE QUEUE FOR THE 9 P.M. DOORS. STAIRS DOWN, EYEBROWS UP.', { size: 8.5, font: MO, weight: 700, color: ink, leading: 1.4, label: 'Caption', role: 'CAPTION' }));
        out.push(rect(G.x - 8, 940, 350, 54, secondary, { blend: 'multiply', rotation: -.8, label: 'Continued bar', role: 'ORNAMENT' }), text(G.x + 4, 946, 330, 'CONTINUED OVERLEAF  →', { size: 34, font: AN, color: ink, wrap: false, leading: 1, rotation: -.8, label: 'Jump line', role: 'LABEL' }));
      } else {
        out.push(rect(G.x, 50, G.w, 300, accent, { rotation: -.8, blend: 'multiply', label: 'Pull quote block', role: 'ORNAMENT' }));
        out.push(...pullQuote(G.x + 20, 76, G.w - 40, '“A VENUE IS MOSTLY THE ART OF SAYING NO POLITELY.”', 'DOT, BOOKER, THE SUMP', { font: AN, size: 58, weight: 400, color: ink, leading: .98, rule: 'none', attribFont: MO, attribColor: ink }));
        const cols3 = columns(G.x, G.w, 3, 16);
        const rr = balance(Z_PARAS.slice(6).join('\n') + '\n' + 'The Sump will celebrate its fifth birthday on the last Saturday of the month with an all-night bill of twenty-two bands, two of whom have not yet been told. Entry is eight pounds, or a cassette. Dot asks that you bring both.\nShe is not sentimental. When I ask what the room has meant to her she looks around at the black walls, the leaking pipe, the stage made of pallets, and says, “It is a basement.” Then she smiles. “It is my basement.”', [{ ...cols3[0], y: 380, b: 960 }, { ...cols3[1], y: 380, b: 960 }, { ...cols3[2], y: 640, b: 960 }], body);
        warnFlow('static p8', rr); out.push(...rr.objs);
        out.push(...sidebar(cols3[2].x, 380, cols3[2].w, 'THE SETLIST, AS IT HAPPENED', ['WET CONCRETE — 9 songs, 11 minutes', 'DUO WHO ARE FIGHTING — the ballad', 'LEAF + MACHINE — 14 minutes, 1 plug', 'THE 7-PIECE — hymn/riot, trombone', 'ENCORE: the lights, unplanned'], { fill: white, titleFont: MO, titleColor: ink, bodyFont: TW, bodyColor: ink, size: 9.6, lead: 14, titleSize: 9, pad: 12, rule: ink, stroke: ink, numbered: true, accent, tracking: .06 }));
        out.push(...photo(ctx, G.x, 640, spanOf(c, 0, 5).w, 310, { tone: 'dark', shade: '#2B2723', caption: 'Wet Concrete, third row', rotation: -1.5, label: 'Inset photograph' }), ...halftone(G.x, 640, spanOf(c, 0, 5).w, 310, ink, .3), ellipse(G.x + 190, 740, 140, 120, 'none', { stroke: accent, strokeWidth: 4, rotation: -10, label: 'Grease-pencil circle' }), text(G.x + 330, 700, 220, '← HIM. THE ONE WITH THE LEAF BLOWER.', { size: 18, font: MK, color: accent, leading: 1.1, rotation: -4, label: 'Handwritten note', role: 'CAPTION' }), tape(G.x + 40, 628, 90, -14), tape(G.x + 400, 934, 90, 12));
      }
      out.push(...head(pageIndex === 6 ? 'The Sump' : 'The Sump  ·  cont.'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 30));
      out.push(text(G.x - 4, 40, 760, '10 QUESTIONS', { size: 134, font: AN, color: ink, wrap: false, leading: 1, label: 'Interview headline', role: 'HEADLINE' }), text(G.x, 176, 700, 'WITH DOT', { size: 134, font: AN, color: accent, wrap: false, leading: 1, blend: 'multiply', label: 'Interview headline (second line)', role: 'HEADLINE' }));
      out.push(...photo(ctx, G.x + 420, 330, 310, 400, { tone: 'dark', shade: '#2B2723', caption: 'Dot, with the shoebox', rotation: 3, label: 'Portrait' }), ...halftone(G.x + 420, 330, 310, 400, accent, .45), tape(G.x + 520, 318, 100, -6), text(G.x + 420, 750, 310, 'DOT, IN THE DOORWAY, WITH THE SHOEBOX OF CASSETTES SHE HAS NOT YET PLAYED.', { size: 9, font: MO, weight: 700, color: ink, leading: 1.4, rotation: 3, label: 'Caption', role: 'CAPTION' }));
      let y = 318;
      Z_QA.forEach(([q, a], i) => { const qt = text(G.x + 8, y + 5, 390, q, { size: 15, font: AN, color: paper, tracking: .04, wrap: false, leading: 1, label: 'Question', role: 'KICKER' }); out.push(rect(G.x, y, Math.min(400, q.length * 9.4 + 24), 28, ink, { rotation: i % 2 ? .6 : -.6, label: 'Question bar', role: 'ORNAMENT' }), qt, text(G.x, y + 38, 400, a, { size: 11, font: TW, color: ink, leading: 1.4, label: 'Answer', role: 'BODY' })); y += 38 + Math.ceil(a.length / 44) * 15.4 + 22; });
      out.push(text(G.x + 420, 840, 320, 'Bring a coat. Bring a tape. Bring cash.', { size: 24, font: MK, color: accent, leading: 1.1, rotation: -3, label: 'Handwritten note', role: 'CAPTION' }));
      out.push(...head('10 questions'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, '#161412')];
      out.push(...specks(0, 0, W, H, 40, paper));
      out.push(text(G.x - 4, 30, 780, 'CONTACT', { size: 124, font: AN, color: paper, wrap: false, leading: 1, label: 'Essay headline', role: 'HEADLINE' }), text(G.x + 400, 30, 300, 'SHEET', { size: 124, font: AN, color: accent, wrap: false, leading: 1, label: 'Essay headline (second word)', role: 'HEADLINE' }));
      const cols4 = columns(G.x, G.w, 4, 10), fh = 150;
      for (let row = 0; row < 4; row++) {
        const y = 196 + row * (fh + 40);
        out.push(rect(G.x - 6, y - 14, G.w + 12, fh + 28, '#0B0A09', { label: 'Film strip', role: 'ORNAMENT' }));
        for (let k = 0; k < 16; k++) out.push(rect(G.x - 2 + k * ((G.w + 4) / 16) + 2, y - 11, 8, 5, '#E8E3D6', { rx: 1, label: 'Sprocket hole' }), rect(G.x - 2 + k * ((G.w + 4) / 16) + 2, y + fh + 6, 8, 5, '#E8E3D6', { rx: 1, label: 'Sprocket hole' }));
        for (let col = 0; col < 4; col++) { const n = row * 4 + col + 1; out.push(...photo(ctx, cols4[col].x, y, cols4[col].w, fh, { tone: 'dark', shade: '#3A3530', caption: `Frame ${n}`, label: 'Contact frame', silent: n % 2 === 0 }), text(cols4[col].x + 4, y + fh + 9, 80, `${n}A`, { size: 8.5, font: MO, weight: 700, color: secondary, wrap: false, label: 'Frame number', role: 'LABEL' })); }
      }
      out.push(ellipse(cols4[1].x + 20, 196 + (fh + 40) * 1 + 6, cols4[1].w - 40, fh - 12, 'none', { stroke: accent, strokeWidth: 3.5, rotation: -4, label: 'Grease-pencil circle' }), ellipse(cols4[2].x + 10, 196 + (fh + 40) * 2 + 10, cols4[2].w - 20, fh - 20, 'none', { stroke: secondary, strokeWidth: 3.5, rotation: 3, label: 'Grease-pencil circle' }), text(cols4[1].x, 196 + (fh + 40) * 2 - 28, 160, 'THIS ONE', { size: 22, font: MK, color: accent, wrap: false, rotation: -6, label: 'Handwritten note', role: 'CAPTION' }), text(cols4[2].x + 30, 196 + (fh + 40) * 3 - 34, 200, 'NO. THIS ONE.', { size: 22, font: MK, color: secondary, wrap: false, rotation: 4, label: 'Handwritten note', role: 'CAPTION' }));
      out.push(text(G.x, 1004, 500, 'WET CONCRETE, THE SUMP, 11:42 P.M. 24 FRAMES, ONE ROLL, NO FLASH. PHOTOGRAPHS KOFI MENSAH.', { size: 8.5, font: MO, weight: 700, color: alpha(paper, .8), leading: 1.4, label: 'Credit', role: 'CREDIT' }));
      out.push(...head('Contact sheet', paper));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...specks(0, 0, W, H, 30));
      out.push(text(G.x - 2, 44, 760, 'LINER\nNOTES', { size: 168, font: AN, color: ink, leading: .86, wrap: false, label: 'Colophon title', role: 'HEADLINE' }), rect(G.x - 6, 260, 360, 30, accent, { blend: 'multiply', rotation: -1, label: 'Overprint bar', role: 'ORNAMENT' }));
      const cr: Array<[string, string]> = [['EDITED BY', 'MARROW'], ['PHOTOGRAPHS', 'KOFI MENSAH'], ['DESIGN & STAPLES', 'PILAR DUARTE'], ['WORDS', 'DOT, MARROW, IMANI COLE'], ['COPY & TYPOS', 'TOBIAS WREN'], ['PRINTED AT', 'THE COPY SHOP, REAR UNIT'], ['PAPER', '80GSM, SLIGHTLY DAMP'], ['TYPE', 'ANTON, ARCHIVO BLACK, SPECIAL ELITE, SPACE MONO']];
      cr.forEach(([k, v], i) => { const y = 392 + i * 62; out.push(text(G.x, y, 200, k, { size: 9.5, font: MO, weight: 700, color: accent, tracking: .1, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(G.x, y + 14, 520, v, { size: 28, font: AN, color: ink, leading: 1.04, label: 'Credit name', role: 'BYLINE' }), hr(G.x, y + 54, 520, ink, 1, { label: 'Credit rule', dash: [3, 3] })); });
      const sheet = { x: 548, y: 392, w: 220, h: 380 };
      out.push(rect(sheet.x, sheet.y, sheet.w, sheet.h, white, { rotation: 2, shadow: { x: 2, y: 4, blur: 6, color: 'rgba(0,0,0,.25)' }, label: 'Small-print sheet', role: 'SIDEBAR' }), tape(sheet.x + 60, sheet.y - 10, 90, -4));
      out.push(text(sheet.x + 14, sheet.y + 22, sheet.w - 28, 'SUBSCRIBE: six issues, £30, posted flat. basementstatic.example/join\n\nSEND TAPES TO: Basement Static, Rear Unit 3, 12 Tanner’s Yard.\n\nCONTRIBUTE: we pay in beer and credit. Email marrow@basementstatic.example.\n\n© 2026 THE STATIC. Photocopy us. Please credit us. Please buy us a drink.', { size: 9.6, font: TW, color: ink, leading: 1.45, rotation: 2, label: 'Small print', role: 'FOOTNOTE' }));
      out.push(...sticker(660, 880, 76, 'NO', 'FEATURES NO FEARS', secondary, ink, -10));
      out.push(...barcodeBox(G.x, 910, 128, 62, { plate: white, ink, seed, code: 'ISSN 2088-0909', note: 'STATIC 09', font: 'ibmPlexMono' }));
      out.push(...head('Liner notes'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, ink)];
      out.push(...specks(0, 0, W, H, 60, paper));
      out.push(...halftone(0, 520, W, 536, accent, .55));
      out.push(text(26, 20, 760, 'NOV 14', { size: 322, font: AN, color: paper, wrap: false, leading: 1, label: 'Back cover date', role: 'COVER_TITLE' }));
      out.push(rect(-BL, 372, W + BL * 2, 62, accent, { blend: 'screen', label: 'Overprint bar', role: 'ORNAMENT' }), text(26, 372, 780, 'THE SUMP  ·  THE SUMP  ·  THE SUMP', { size: 62, font: AN, color: ink, wrap: false, leading: 1, label: 'Venue strip', role: 'HEADLINE' }));
      ['WET CONCRETE', 'MAGPIE', 'LEAF + MACHINE', 'THE 7-PIECE WITH TROMBONE', 'DOUBLE DEAD', 'AND SOMEONE WHO SENT A CASSETTE'].forEach((t, i) => out.push(text(30, 470 + i * 62, 760, t, { size: i === 0 ? 70 : 46, font: AN, color: i % 2 ? paper : secondary, wrap: false, leading: 1, label: 'Lineup', role: 'HEADLINE' })));
      out.push(rect(30, 880, 420, 54, paper, { rotation: -1.5, label: 'Ticket bar', role: 'ORNAMENT' }), text(42, 890, 400, 'DOORS 8  ·  £8 OR A TAPE', { size: 32, font: AN, color: ink, wrap: false, leading: 1, rotation: -1.5, label: 'Ticket line', role: 'PRICE' }));
      out.push(...sticker(630, 900, 84, 'ALL', 'AGES TILL 10', secondary, ink, 10));
      out.push(rect(704, 960, 72, 74, white, { label: 'Barcode sticker' }), ...barcodeBox(670, 964, 134, 62, { plate: white, ink, seed, code: '0 74470 09009 7', note: 'STATIC 09', font: 'ibmPlexMono' }));
      out.push(...staples());
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 8 · ATRIUM — home, design & architecture. Airy, caption-led, plans and swatches.
//     Trim 9 × 11 in (864 × 1056 px), perfect bound. 12-column grid, 17 px baseline, wide white margins.
// ═════════════════════════════════════════════════════════════════════════════
const AG: Grid = { cols: 12, gutter: 16, base: 17, top: 84, bottom: 92, inner: 76, outer: 64 };
const A_PARAS = [
  'From the street, Casa Alvar gives almost nothing away. A windowless wall of pale lime plaster rises to a parapet, broken only by a door the colour of weathered oak. It is only when the door opens that the house begins to speak: a corridor, a turn, and then a courtyard so full of sky that visitors tend to stop mid-sentence.',
  'The architect, Elena Vidal, calls the courtyard the house’s lung. Every room opens onto it or looks across it, and the rooms themselves are arranged in a loose spiral, so that the light moves through the building across the day like a slow tide. Morning is in the kitchen, noon in the long room, afternoon on the stairs, evening in the bedrooms.',
  'The palette is deliberately small. Lime plaster, oak, travertine, linen; a few brass fittings that will, in time, darken. Vidal specified nothing that could not be repaired. “A house should be able to age without apologising,” she says. “The patina is not damage. It is the record of being lived in.”',
  'Nothing is hidden. Joints are expressed, pipes are brought into view and painted the colour of the wall, and every cupboard door has the same handle, hand-turned in a workshop eight minutes’ walk from the site. The effect is not austere but calm, in the way that a well-edited sentence is calm.',
  'The clients, a couple who had spent years in small rented flats, asked for three things: a place to put books, a table that could seat twelve, and silence. The books got a wall. The table got a room. The silence, Vidal says, was the hardest, and she achieved it by the simple expedient of making the house thick: forty-centimetre walls, double-glazed slots, a roof garden that swallows the rain.',
  'At dusk the courtyard turns the colour of honey, and the walls give the day’s warmth back to the air. The couple eat there, most evenings, without speaking much. It is, they say, the first place either of them has lived where the house seems to be doing most of the work.',
];
const A_QA: Array<[string, string]> = [
  ['How do you begin a house?', 'By standing in the empty plot at different times of day and doing nothing. People find this unprofessional. It is the whole method.'],
  ['What does a client usually get wrong?', 'They ask for more rooms. What they want is more light, and the right amount of nothing.'],
  ['What is your favourite material?', 'Plaster, because it takes a fingerprint and keeps it. A good wall should remember who touched it.'],
  ['What makes a room calm?', 'Proportion, and the absence of decisions. If your eye has to choose, the room has failed.'],
  ['How do you know when a house is finished?', 'When the people have moved in and started to disagree with it. Then it is theirs.'],
];

const atrium: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, AG), c = G.cols;
  const D = 'instrumentSerif' as const, B = 'manrope' as const, M = 'dmMono' as const;
  const sand = mix(paper, -.05), stone = mix(paper, -.12);
  const body = { font: B, size: 10, lead: 17, color: ink, weight: 300, gap: 8, role: 'BODY' as const };
  const head = (section: string, color = ink) => [
    text(G.verso ? G.x : G.right - 300, 40, 300, G.verso ? 'ATRIUM' : section, { size: 8, font: M, weight: 500, color: alpha(color, .7), tracking: .3, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    text(G.verso ? G.x : G.right - 40, H - 52, 40, String(G.pageNo), { size: 9, font: M, weight: 500, color: alpha(color, .8), align: G.verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x + 40 : G.x, H - 52, G.w - 40, G.verso ? section : 'AUTUMN 2026', { size: 8, font: M, weight: 500, color: alpha(color, .55), tracking: .3, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const cap = (x: number, y: number, w: number, n: string, t: string, credit: string, color = ink) => [text(x, y, 24, n, { size: 8, font: M, weight: 600, color: accent, wrap: false, label: 'Caption number', role: 'CAPTION' }), ...caption(x + 24, y, w - 24, t, credit, { font: B, color, size: 9, weight: 300, leading: 1.6, transform: 'none', creditFont: M })];

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'light', shade: stone, caption: 'Cover photograph · the courtyard of Casa Alvar, Lisbon, at noon', label: 'Cover photograph' }));
      out.push(text(56, 56, 400, 'A  T  R  I  U  M', { size: 15, font: B, weight: 500, color: ink, tracking: .5, wrap: false, label: 'Masthead (small, tracked)', role: 'COVER_TITLE' }));
      out.push(text(W - 400, 58, 344, 'HOME  ·  DESIGN  ·  ARCHITECTURE', { size: 8, font: M, weight: 500, color: ink, tracking: .32, align: 'right', wrap: false, label: 'Tagline', role: 'LABEL' }));
      out.push(hr(56, 90, W - 112, ink, .5, { label: 'Masthead rule' }));
      out.push(text(56, 98, 400, 'AUTUMN 2026  ·  NO. 17  ·  €14', { size: 8, font: M, weight: 500, color: alpha(ink, .75), tracking: .26, wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(text(56, H - 296, 420, 'A house built around light.', { size: 62, font: D, color: ink, leading: .98, tracking: -.01, label: 'Cover line', role: 'COVER_LINE' }));
      out.push(text(58, H - 120, 400, 'Casa Alvar, Lisbon. Elena Vidal’s courtyard house, in which every room is arranged around the time of day. Page 48.', { size: 10.5, font: B, weight: 300, color: ink, leading: 1.65, label: 'Cover caption', role: 'COVER_LINE' }));
      out.push(text(W - 380, H - 120, 324, 'ALSO  ·  The plaster revival, p.30\nThirteen lamps, p.62  ·  A kitchen for twelve, p.76', { size: 8, font: M, weight: 500, color: ink, tracking: .14, leading: 1.9, align: 'right', label: 'Secondary cover lines', role: 'COVER_LINE' }));
      out.push(...barcodeBox(W - 56 - 112, H - 70, 112, 48, { plate: paper, ink, seed, code: '0 74470 17017 3', note: 'ATRIUM 17', font: M }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 100, 300, 'Contents', { size: 60, font: D, color: ink, wrap: false, label: 'Contents title', role: 'HEADLINE' }), text(G.x, 172, 400, 'AUTUMN 2026  ·  NO. 17', { size: 8, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Issue line', role: 'LABEL' }));
      const left = spanOf(c, 0, 4), right = spanOf(c, 6, 11);
      const secs: Array<[string, Array<[string, string, string]>]> = [['Rooms', [['30', 'The plaster revival', 'Lime, clay and the return of the hand-troweled wall'], ['48', 'A house built around light', 'Elena Vidal’s Casa Alvar, Lisbon'], ['76', 'A kitchen for twelve', 'The table that organises a household']]], ['Things', [['62', 'Thirteen lamps', 'Light you can carry from room to room'], ['66', 'Material', 'Eight finishes for a calmer house']]], ['People', [['88', 'In the studio', 'Elena Vidal on proportion, plaster and doing nothing'], ['96', 'The long view', 'A last look, in light']]]];
      let y = 230;
      secs.forEach(([h, items]) => {
        out.push(text(right.x, y, right.w, h.toUpperCase(), { size: 8, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Section', role: 'KICKER' }), hr(right.x, y + 18, right.w, alpha(ink, .35), .5, { label: 'Section rule' }));
        y += 34;
        items.forEach(([p, t, d]) => { out.push(text(right.x, y, 44, p, { size: 11, font: M, weight: 500, color: ink, wrap: false, label: 'Contents folio', role: 'FOLIO' }), text(right.x + 52, y - 4, right.w - 52, t, { size: 26, font: D, color: ink, wrap: false, label: 'Contents title', role: 'HEADLINE' }), text(right.x + 52, y + 28, right.w - 52, d, { size: 9.5, font: B, weight: 300, color: alpha(ink, .8), leading: 1.6, label: 'Contents description', role: 'BODY' })); y += 78; });
        y += 14;
      });
      out.push(...photo(ctx, left.x, 230, left.w, 460, { tone: 'light', caption: 'The courtyard, Casa Alvar', label: 'Contents photograph' }), ...cap(left.x, 698, left.w, '1', 'The courtyard of Casa Alvar, looking south at 12:40. The oak door is at left; the long room is behind the glass.', 'Photograph Rui Matos'));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      const small = spanOf(c, 0, 3), main = spanOf(c, 4, 9);
      out.push(text(main.x, 120, 300, 'Letter', { size: 8, font: M, weight: 500, color: accent, tracking: .3, transform: 'uppercase', wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(main.x, 142, main.w + 40, 'Houses are rooms for the weather to happen in.', { size: 54, font: D, color: ink, leading: 1.02, tracking: -.01, label: 'Letter headline', role: 'HEADLINE' });
      out.push(t);
      const cols2 = columns(main.x, main.w, 2, 24);
      const letter = 'There is a moment, in every good house, when you stop looking at the architecture and start looking at the afternoon. The wall becomes a place for the light to land, the window a way of arranging the sky. That, I have come to think, is what a house is for: not to impress, but to make the day visible.\nThis issue is a long look at that idea. We went to Lisbon to spend a week in a courtyard house that has no interest in being photographed and every interest in being lived in. We talked to a plasterer who has not used a machine in thirty years. We measured a table that seats twelve and has never once been empty.\nWe have also made small changes of our own. The pages are quieter, the captions are longer, and the pictures are given room to breathe. If a house can be calm, so can a magazine.';
      const rr = balance(letter, colFrames(cols2, below(t, 36), 800), body, { dropCap: { lines: 3, font: D, color: accent, weight: 400, scale: 1.1 } }); warnFlow('atrium letter', rr); out.push(...rr.objs);
      out.push(text(cols2[1].x, bottomOf(rr.objs) + 20, cols2[1].w, 'Marguerite Lin', { size: 26, font: D, italic: true, color: ink, wrap: false, label: 'Signature', role: 'BYLINE' }), text(cols2[1].x, bottomOf(rr.objs) + 50, cols2[1].w, 'EDITOR-IN-CHIEF', { size: 7.5, font: M, weight: 500, color: alpha(ink, .6), tracking: .3, wrap: false, label: 'Signature role', role: 'CAPTION' }));
      out.push(...photo(ctx, small.x, 142, small.w, 220, { tone: 'light', caption: 'Editor', label: 'Editor portrait' }), ...cap(small.x, 372, small.w, '1', 'Marguerite Lin in the plaster workshop, Lisbon, with a trowel she was not permitted to use.', 'Photograph Rui Matos'));
      out.push(...photo(ctx, main.x, 780, main.w, 160, { tone: 'light', caption: 'The long room, 4 p.m.', label: 'Letter photograph' }));
      out.push(...head('Letter'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 100, 300, 'Material', { size: 60, font: D, color: ink, wrap: false, label: 'Department title', role: 'HEADLINE' }), text(G.x, 172, 460, 'Eight finishes for a calmer house, chosen for how they age.', { size: 11, font: B, weight: 300, color: ink, leading: 1.65, label: 'Department deck', role: 'DECK' }));
      const sw: Array<[string, string, string, string]> = [['Lime plaster', '#E7DFD0', 'Hand-troweled, breathable', '€48 / m²'], ['Travertine', '#D9CBB4', 'Honed, filled, Tivoli', '€210 / m²'], ['Oiled oak', '#B98F5E', 'Quarter-sawn, 22 mm', '€130 / m²'], ['Linen', '#CFC6B4', 'Stonewashed, 280 gsm', '€64 / m'], ['Clay tile', '#B8765A', 'Wood-fired, 200 × 200', '€95 / m²'], ['Brass', '#A88A4F', 'Unlacquered, brushed', '€72 / piece'], ['Sage render', '#8FA091', 'Mineral pigment', '€52 / m²'], ['Black steel', '#2B2D2C', 'Waxed, mill finish', '€160 / m']];
      const gc = columns(G.x, G.w, 4, 18);
      sw.forEach(([n, col, spec, price], i) => { const x = gc[i % 4].x, y = 260 + Math.floor(i / 4) * 330; out.push(rect(x, y, gc[0].w, 210, col, { label: `Swatch: ${n}`, role: 'IMAGE_SLOT' }), rect(x + 16, y + 150, 44, 44, mix(col, -.18), { label: 'Swatch detail', role: 'ORNAMENT' }), text(x, y + 224, gc[0].w, n, { size: 22, font: D, color: ink, wrap: false, label: 'Material', role: 'HEADLINE' }), text(x, y + 254, gc[0].w, spec, { size: 9, font: B, weight: 300, color: alpha(ink, .8), leading: 1.55, label: 'Spec', role: 'CAPTION' }), text(x, y + 280, gc[0].w, price.toUpperCase(), { size: 7.5, font: M, weight: 500, color: accent, tracking: .2, wrap: false, label: 'Price', role: 'PRICE' })); });
      out.push(text(G.x, 930, G.w * .6, 'Prices are approximate, supply only, in euros. Colours are indicative; ask for a sample before you commit.', { size: 8.5, font: B, weight: 300, color: alpha(ink, .7), leading: 1.6, label: 'Note', role: 'FOOTNOTE' }));
      out.push(...head('Material'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(G.x + 60, 130, G.w - 120, 700, { fill: sand, ink, accent, font: M, kind: 'Advertisement  ·  full page, framed', spec: 'Full page, white margin  ·  live image 6.3 × 8.2 in  ·  no bleed  ·  300 dpi', live: 14 }));
      out.push(text(G.x + 60, 842, 400, 'LUMEN & CO.  ·  LAMPS MADE IN PORTUGAL, SINCE 1964', { size: 8, font: M, weight: 500, color: ink, tracking: .22, wrap: false, label: 'Advertiser', role: 'CAPTION' }), text(G.x + 60, 862, G.w - 120, 'Each shade is blown, cooled and cut by hand in the workshop behind our shop in Marinha Grande. We make about forty a week, and we would rather make fewer than make them badly.', { size: 10, font: B, weight: 300, color: ink, leading: 1.7, label: 'Ad copy', role: 'BODY' }));
      out.push(text(G.x + 60, 944, 300, 'lumen.example', { size: 9, font: M, weight: 500, color: accent, tracking: .2, wrap: false, label: 'Ad URL', role: 'LABEL' }), text(G.x + 60, 108, 300, 'ADVERTISEMENT', { size: 7, font: M, weight: 500, color: alpha(ink, .5), tracking: .3, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'light', shade: stone, caption: 'Opening photograph · the courtyard, Casa Alvar, 12:40', label: 'Feature photograph' }));
      out.push(rect(G.x - 24, 640, 440, 330, paper, { opacity: .96, label: 'Caption panel', role: 'SIDEBAR' }));
      out.push(text(G.x, 664, 300, 'ROOMS  ·  CASA ALVAR, LISBON', { size: 8, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(G.x, 686, 400, 'A house built around light', { size: 52, font: D, color: ink, leading: 1, tracking: -.01, label: 'Feature headline', role: 'HEADLINE' });
      out.push(t, text(G.x, below(t, 16), 380, 'Elena Vidal’s courtyard house in Lisbon arranges its rooms so that the day moves through them like a tide: morning in the kitchen, noon in the long room, evening in the bedrooms.', { size: 10.5, font: B, weight: 300, color: ink, leading: 1.7, label: 'Deck', role: 'DECK' }), text(G.x, 912, 380, 'WORDS MARGUERITE LIN  ·  PHOTOGRAPHS RUI MATOS', { size: 7.5, font: M, weight: 500, color: alpha(ink, .7), tracking: .2, wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(text(G.right - 40, 40, 40, String(G.pageNo), { size: 9, font: M, weight: 500, color: paper, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
      out.push(hr(G.x, 900, 380, alpha(ink, .5), .5, { label: 'Byline rule' }), hr(G.x, 650 - 28, 60, accent, 2, { label: 'Short rule' }), ...caption(G.right - 220, 100, 220, 'The courtyard at 12:40, looking south. The oak door is at left.', 'Photograph Rui Matos', { font: B, color: ink, creditFont: M, size: 8.5, weight: 300, transform: 'none', align: 'right' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        const capCol = spanOf(c, 0, 3), main = spanOf(c, 4, 9);
        out.push(text(main.x, 100, 400, 'ROOMS  ·  1', { size: 8, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
        const dk = text(main.x, 122, main.w, 'From the street, Casa Alvar gives almost nothing away.', { size: 34, font: D, color: ink, leading: 1.08, label: 'Deck', role: 'DECK' });
        out.push(dk);
        const top = below(dk, 34);
        const rr = balance(A_PARAS.slice(0, 3).join('\n'), [{ x: main.x, y: top, w: main.w, b: 700 }], body, { dropCap: { lines: 3, font: D, color: accent, weight: 400, scale: 1.1 } }); warnFlow('atrium p7', rr); out.push(...rr.objs);
        // floor plan
        const px = capCol.x, py = 122, pw = capCol.w, ph = 300;
        out.push(rect(px, py, pw, ph, 'none', { stroke: ink, strokeWidth: 1.25, label: 'Plan outline', role: 'RULE' }), rect(px + pw * .34, py + ph * .3, pw * .34, ph * .34, stone, { stroke: ink, strokeWidth: .75, label: 'Courtyard', role: 'ORNAMENT' }), text(px + pw * .34, py + ph * .43, pw * .34, 'COURT', { size: 7, font: M, weight: 500, color: ink, tracking: .2, align: 'center', wrap: false, label: 'Room label', role: 'LABEL' }));
        [[0, 0, .34, .3, 'KITCHEN'], [.34, 0, .66, .3, 'LONG ROOM'], [0, .3, .34, .7, 'STAIR'], [.68, .3, .32, .7, 'BED'], [.34, .64, .34, .36, 'STUDY']].forEach(([x, y, w, h, l]) => out.push(rect(px + (x as number) * pw, py + (y as number) * ph, (w as number) * pw, (h as number) * ph, 'none', { stroke: ink, strokeWidth: .75, label: 'Room', role: 'RULE' }), text(px + (x as number) * pw, py + ((y as number) + (h as number) / 2) * ph - 5, (w as number) * pw, l as string, { size: 7, font: M, weight: 500, color: alpha(ink, .75), tracking: .2, align: 'center', wrap: false, label: 'Room label', role: 'LABEL' })));
        out.push(circle(px + pw * .1, py + ph * .12, 8, accent, { label: 'Plan marker' }), text(px + pw * .1 - 8, py + ph * .12 - 5, 16, '1', { size: 8, font: M, weight: 600, color: paper, align: 'center', wrap: false, label: 'Plan marker number', role: 'LABEL' }), circle(px + pw * .5, py + ph * .76, 8, accent, { label: 'Plan marker' }), text(px + pw * .5 - 8, py + ph * .76 - 5, 16, '2', { size: 8, font: M, weight: 600, color: paper, align: 'center', wrap: false, label: 'Plan marker number', role: 'LABEL' }));
        out.push(text(px, py + ph + 8, pw, 'GROUND FLOOR PLAN  ·  1 : 200', { size: 7, font: M, weight: 500, color: alpha(ink, .6), tracking: .2, wrap: false, label: 'Plan caption', role: 'CAPTION' }));
        out.push(...cap(capCol.x, 490, capCol.w, '1', 'The kitchen faces east. In the morning the floor of oak and travertine is warm before the room is.', 'Photograph Rui Matos'), ...cap(capCol.x, 600, capCol.w, '2', 'The study, a quiet room with a high north slot of glass, where Elena Vidal draws on Sundays.', 'Photograph Rui Matos'));
        out.push(...photo(ctx, main.x, bottomOf(rr.objs) + 44, main.w, 280, { tone: 'light', caption: 'The long room, 4 p.m.', label: 'Inset photograph' }), ...cap(main.x, bottomOf(rr.objs) + 332, main.w, '3', 'The long room at four, with the table set for twelve and nobody yet seated. The linen is stonewashed; the oak will darken.', 'Photograph Rui Matos'));
      } else {
        const main = spanOf(c, 0, 6), side = spanOf(c, 8, 11);
        out.push(...photo(ctx, G.x, 100, spanOf(c, 0, 7).w, 400, { tone: 'light', caption: 'The stair, afternoon', label: 'Inset photograph' }), ...cap(G.x, 512, spanOf(c, 0, 5).w, '4', 'The stair in the afternoon: poured plaster treads, a brass rail that will in time turn the colour of honey, and a slot of sky.', 'Photograph Rui Matos'));
        const cols2 = columns(G.x, spanOf(c, 0, 7).w, 2, 24);
        const rr = balance(A_PARAS.slice(3).join('\n'), colFrames(cols2, 620, 900), body); warnFlow('atrium p8', rr); out.push(...rr.objs);
        out.push(...pullQuote(side.x, 100, side.w, '“A house should be able to age without apologising.”', 'Elena Vidal', { font: D, size: 34, color: accent, leading: 1.08, rule: 'top', ruleColor: ink, ruleWeight: .5, attribFont: M, pad: 14 }));
        out.push(...photo(ctx, side.x, 340, side.w, 320, { tone: 'light', caption: 'Roof garden', label: 'Inset photograph' }), ...cap(side.x, 672, side.w, '5', 'The roof garden, which swallows the rain and the noise of the street.', 'Photograph Rui Matos'));
        out.push(text(side.x, 770, side.w, 'MATERIALS', { size: 8, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Materials label', role: 'KICKER' }), hr(side.x, 788, side.w, alpha(ink, .35), .5, { label: 'Rule' }), ...['Lime plaster, three coats', 'Quarter-sawn oak, oiled', 'Honed travertine, Tivoli', 'Stonewashed linen', 'Unlacquered brass'].map((t, i) => text(side.x, 800 + i * 26, side.w, t, { size: 10, font: B, weight: 300, color: ink, wrap: false, label: 'Material', role: 'SIDEBAR' })));
      }
      out.push(...head(pageIndex === 6 ? 'Casa Alvar' : 'Casa Alvar  ·  continued'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      const left = spanOf(c, 0, 4), right = spanOf(c, 6, 11);
      out.push(text(right.x, 100, 300, 'IN THE STUDIO', { size: 8, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(right.x, 122, right.w, 'Elena Vidal on proportion, plaster and doing nothing.', { size: 44, font: D, color: ink, leading: 1.02, tracking: -.01, label: 'Interview headline', role: 'HEADLINE' });
      out.push(t);
      out.push(...photo(ctx, left.x, 122, left.w, 520, { tone: 'light', caption: 'Elena Vidal, studio, Lisbon', label: 'Portrait' }), ...cap(left.x, 654, left.w, '1', 'Vidal in her studio in the Alfama, with the model of Casa Alvar. “Everyone asks what it cost,” she says. “No one asks what it weighs.”', 'Photograph Rui Matos'));
      let y = below(t, 40);
      A_QA.forEach(([q, a], i) => { const qq = text(right.x, y, right.w, q, { size: 22, font: D, italic: true, color: accent, leading: 1.1, label: 'Question', role: 'KICKER' }); const aa = text(right.x, below(qq, 8), right.w, a, { size: 10.5, font: B, weight: 300, color: ink, leading: 1.75, label: 'Answer', role: 'BODY' }); out.push(qq, aa); y = below(aa, 30); });
      out.push(...head('In the studio'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 100, 400, 'Light', { size: 96, font: D, color: ink, wrap: false, leading: 1, tracking: -.02, label: 'Essay headline', role: 'HEADLINE' }), text(G.x + 330, 130, G.w - 330, 'Five rooms, five times of day, one house. Photographed on a single Tuesday in September.', { size: 11, font: B, weight: 300, color: ink, leading: 1.7, label: 'Essay intro', role: 'DECK' }));
      const spots: Array<[number, number, number, number, string, string]> = [[0, 250, 5, 280, '07:40', 'The kitchen, first light on the oak.'], [6, 300, 5, 360, '12:40', 'The courtyard at noon, the shadows gone.'], [0, 610, 3, 250, '15:10', 'The stair, a slot of sun on the plaster.'], [3, 700, 3, 190, '17:55', 'The study, a lamp, the first blue hour.'], [8, 750, 4, 180, '20:30', 'The courtyard, honey-coloured, empty.']];
      spots.forEach(([col, y, span, h, tm, tx], i) => { const x = c[col].x, w = c[col + span - 1].x + c[col + span - 1].w - x; out.push(...photo(ctx, x, y, w, h, { tone: 'light', caption: tm, label: 'Essay photograph' }), text(x, y + h + 8, 40, tm, { size: 8, font: M, weight: 600, color: accent, wrap: false, label: 'Time', role: 'CAPTION' }), text(x + 44, y + h + 7, w - 44, tx, { size: 9, font: B, weight: 300, color: ink, leading: 1.5, label: 'Caption', role: 'CAPTION' })); });
      out.push(...head('Light'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 100, 300, 'A T R I U M', { size: 20, font: B, weight: 500, color: ink, tracking: .5, wrap: false, label: 'Colophon masthead', role: 'COVER_TITLE' }), text(G.x, 140, 500, 'Made by a small group of people in a plaster-coloured office in Lisbon.', { size: 34, font: D, color: ink, leading: 1.08, label: 'Colophon headline', role: 'HEADLINE' }));
      const staff: Array<[string, string]> = [['Editor-in-chief', 'Marguerite Lin'], ['Architecture editor', 'Tomás Reis'], ['Interiors editor', 'Inês Barbosa'], ['Photography', 'Rui Matos'], ['Design', 'Marta Quill'], ['Copy', 'Tobias Wren'], ['Publisher', 'Daniel Achebe'], ['Advertising', 'Sofia Lindgren']];
      const cc = columns(G.x, G.w, 4, 18);
      staff.forEach(([r_, n], i) => out.push(text(cc[i % 4].x, 340 + Math.floor(i / 4) * 80, cc[0].w, r_.toUpperCase(), { size: 7.5, font: M, weight: 500, color: alpha(ink, .6), tracking: .22, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(cc[i % 4].x, 358 + Math.floor(i / 4) * 80, cc[0].w, n, { size: 20, font: D, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' })));
      const bl: Array<[string, string]> = [['Subscribe', 'Four issues a year, €56. atrium.example/subscribe. Back issues €16 including post.'], ['Write', 'Atrium, Rua da Fábrica 12, 1100-045 Lisboa. letters@atrium.example. We answer every letter, slowly.'], ['Advertise', 'Full page 9 × 11 in plus 0.125 in bleed. Rate card at atrium.example/advertise.'], ['Rights', '© 2026 Atrium Editions. Printed on uncoated FSC paper. Trim 9 × 11 in. Typeset in Instrument Serif and Manrope.']];
      bl.forEach(([h, t], i) => { const x = cc[i].x, y = 560; out.push(text(x, y, cc[0].w, h.toUpperCase(), { size: 8, font: M, weight: 500, color: accent, tracking: .28, wrap: false, label: 'Colophon heading', role: 'KICKER' }), hr(x, y + 18, cc[0].w, alpha(ink, .35), .5, { label: 'Rule' }), text(x, y + 30, cc[0].w, t, { size: 9, font: B, weight: 300, color: ink, leading: 1.7, label: 'Colophon text', role: 'BODY' })); });
      out.push(...barcodeBox(G.right - 112, 860, 112, 48, { plate: paper, ink, seed, code: 'ISSN 2491-3318', note: 'NO. 17', font: M }));
      out.push(...head('Masthead'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, 760, { tone: 'light', shade: stone, caption: 'Back cover · the courtyard, honey at dusk', label: 'Back cover photograph' }));
      out.push(text(56, 800, 500, 'Next time: the winter house.', { size: 46, font: D, color: ink, wrap: false, label: 'Next issue headline', role: 'COVER_LINE' }), text(56, 862, 420, 'Low sun, thick walls and a stove that has not been lit for forty years. Five houses that keep the cold out and the light in. On sale 20 December.', { size: 10.5, font: B, weight: 300, color: ink, leading: 1.7, label: 'Next issue copy', role: 'COVER_LINE' }));
      out.push(text(W - 300, 806, 244, 'A T R I U M', { size: 14, font: B, weight: 500, color: ink, tracking: .5, align: 'right', wrap: false, label: 'Masthead, small', role: 'COVER_TITLE' }), ...barcodeBox(W - 56 - 112, H - 100, 112, 48, { plate: paper, ink, seed, code: '0 74470 17017 3', note: 'ATRIUM 17', font: M }));
      return out;
    }
  }
};

// __EXPORTS__
export const DESIGNS_B: Record<string, PublicationDesigner> = {
  'mag-home-design': atrium,
  'mag-nightlife-zine': static_,
  'mag-business-weekly': ledger,
  'mag-food-travel': tabletrail,
};

export const LESSONS_B: Record<string, DesignLesson> = {
  'mag-home-design': {
    principle: 'Let the picture and its caption do the talking: generous margins, a light sans for reading, and one idea per page keep the eye resting on the room.',
    history: 'Architecture and interiors magazines such as Domus (founded by Gio Ponti in 1928), L’Architecture d’Aujourd’hui and Casabella taught readers to look at buildings through plans, sections and carefully lit photographs. Postwar Swiss and Italian editorial design added wide margins, small sans-serif text and long, informative captions, an approach later adopted by contemporary title such as Apartamento and Kinfolk, where the white space is itself a statement about calm.',
    tryThis: 'Delete the headline on the opener and let the first caption carry the story. Does the page feel quieter, and does the reader still know where they are?',
    interestTag: 'Architecture & interiors',
    related: ['Caption-led layout', 'Floor plans', 'Magazine design'],
  },
  'mag-nightlife-zine': {
    principle: 'Make the roughness systematic: overprint, tape, a grease-pencil circle and one wrong-on-purpose rotation per page, over a grid that is quietly still there.',
    history: 'The music zine descends from the 1970s punk fanzine, where photocopiers, Letraset, ransom-note lettering and cut-and-paste layout turned the page into a flyer for a scene; titles such as Sniffin’ Glue made typos part of the voice. Riot grrrl zines, hardcore flyers and later club-night posters kept the collage, while risograph and screen-print overprint brought a limited-colour aesthetic back to nightlife print.',
    tryThis: 'Change the pink overprint bar to the lime colour on the masthead, then rotate it two degrees. Does the headline still read, and does the page still feel dangerous but intentional?',
    interestTag: 'Zines & music culture',
    related: ['Collage', 'Overprint', 'Punk graphics'],
  },
  'mag-business-weekly': {
    principle: 'In a business weekly the chart is the paragraph: every figure carries a number, a source and a one-line argument, and the dense serif text around it is there to be checked, not skimmed.',
    history: 'The financial press was shaped by the broadsheet and the ticker. The Financial Times, printed on salmon-pink paper since 1893, the Wall Street Journal with its hedcut portraits and The Economist with its signature leader and tight charts, taught readers to expect narrow columns, serif text, small-multiple charts and a front page that works as an index. Newsprint tabloid sizes keep the weekly portable while preserving the density of a daily.',
    tryThis: 'Replace the line chart on the Markets page with your own series, then rewrite its caption as a single sentence beginning with a verb. If the chart needs more than that to make its point, it is not finished.',
    interestTag: 'Business magazines',
    related: ['Information design', 'Chart design', 'Newspaper design'],
  },
  'mag-food-travel': {
    principle: 'Warmth comes from the handmade details around an orderly grid: a recipe laid out like a ledger, an itinerary like a timetable, and a signature in real handwriting.',
    history: 'Food and travel journalism grew up together in the mid-twentieth century: Gourmet (1941) and Holiday (1946) paired recipes and itineraries with colour photography and a confident, literate voice, and Elizabeth David’s cookbooks taught readers to treat a market as a destination. The recipe format, with ingredients set in a tabular column and numbered method, was standardised by cookery columns and index cards. Maps hand-drawn in the margin remain a signature of the genre.',
    tryThis: 'Replace the route in the contents with the stops of your own trip, then rewrite each description as a single sentence that could be said in the time it takes to order a coffee.',
    interestTag: 'Food & travel magazines',
    related: ['Recipe design', 'Maps and itineraries', 'Magazine design'],
  },
};
