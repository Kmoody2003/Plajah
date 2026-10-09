// articlesC — ARTICLE templates 9–12: Review, Profile, Newsletter Essay, Research Brief.
//
// Same contract as articlesA/B. Review = score block + pros/cons; Profile = layered portrait hero and fact box;
// Newsletter = one 560 px column, email-safe type; Research brief = two-column paper with figures and references.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import { rect, circle, hr, vr, path, text, below, imageSlot, mix, alpha } from '../../templateKit';
import * as orn from '../../ornaments';
import { typeset, pour, cols, figure, pullQuote, table, pill, button, meter, checkbox, runningFoot, label, verso } from './pubKit';

const obj = (...parts: Array<TelaVectorObject | TelaVectorObject[]>): TelaVectorObject[] => parts.flat();

// ═════════════════════════════════════════════════════════════════════════════
// 9 · art-review — The Verdict (Letter; score block, pros/cons, spec strip)
// ═════════════════════════════════════════════════════════════════════════════
const RV = {
  head: 'Halcyon H2: the quiet ones are finally good',
  deck: 'Noise-cancelling headphones have spent a decade getting better at silence and worse at everything else. This pair refuses the trade.',
  paras: [
    'Noise-cancelling headphones have spent a decade getting better at silence and worse at everything else: the sound goes thin, the fit goes tight, and the case grows to the size of a loaf. The Halcyon H2 is the first pair we have tested in a long while that refuses that trade.',
    'Start with the sound. The H2’s 40 mm drivers are tuned with a gentle lift in the bass and a calm, unhurried midrange, so voices sound like voices and cellos sound like cellos. There is none of the scooped, shouty treble that makes cheaper pairs tiring after an hour. On a long flight we forgot we were wearing them, which is the highest praise we have.',
    'Noise cancelling is excellent, if not class-leading. Engine drone and air conditioning vanish; office chatter is softened to a murmur. A sudden clatter still breaks through, and wind on a platform makes the microphones fuss, but the transparency mode is natural enough that we left it on while ordering coffee.',
    'Comfort is where the H2 pulls ahead. At 254 grams it is lighter than its rivals, and the headband spreads weight so evenly that we wore a pair for nine hours without a pressure point. The memory-foam pads are replaceable with a screwdriver, a small gesture of respect for the owner.',
    'Battery life is 38 hours with cancelling on, and a ten-minute charge buys five hours more. The companion app is simple, with an equaliser that actually does something audible and settings that persist when you change phones. Multipoint pairing worked reliably with a laptop and a phone throughout testing.',
    'There are flaws. The touch panel mistakes a brushing sleeve for a double tap. Calls are clear in quiet rooms but turn nasal in a crowd. And at 349 dollars the H2 is not cheap, though it does undercut the best-known rivals by around fifty.',
    'Build is plastic and aluminium rather than anything fancier, but the hinges feel durable and the case folds flat enough to slide into a jacket pocket. After six weeks of commuting the finish shows a few scuffs and nothing else.',
    'So who should buy them? Anyone who travels, commutes or works in a noisy space and wants cancelling that does not make the music worse. Audiophiles will want a wired, open-back pair for the weekend. For everyone else, this is the pair to beat.',
  ],
  pros: ['Natural, balanced sound', 'Excellent comfort for long wear', '38-hour battery with fast charge', 'Reliable multipoint pairing'],
  cons: ['Touch panel is over-sensitive', 'Mediocre call quality in crowds', 'No wired audio over USB-C'],
  specs: [['Driver', '40 mm'], ['Battery', '38 h'], ['Weight', '254 g'], ['Codecs', 'AAC · LDAC'], ['Price', '$349']],
  scores: [['Sound', 9.0], ['Comfort', 9.0], ['Noise cancelling', 8.5], ['Battery', 8.5], ['Calls', 6.5], ['Value', 8.0]] as Array<[string, number]>,
  rivals: [['Halcyon H2', '$349', '8.4', '38 h'], ['Northbridge N5', '$399', '8.6', '30 h'], ['Aria Studio', '$299', '7.9', '42 h'], ['Cove ANC 3', '$249', '7.4', '35 h']],
  pull: '“The first noise-cancelling pair in years that does not make the music worse.”',
};

const review: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const M = 48, R = W - M, soft = mix(ink, .45), hair = alpha(ink, .2), tint = mix(paper, -.04), green = '#1F9D6B';
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Page ground' });
  const body = { size: 13, font: 'bitter' as const, color: mix(ink, .1), leading: 1.6, after: 9 };
  const bar = (): TelaVectorObject[] => obj(rect(0, 0, W, 40, ink, { label: 'Top bar', role: 'ORNAMENT' }), text(M, 11, 300, 'THE VERDICT', { size: 16, font: 'archivoBlack', color: accent, tracking: .06, wrap: false, label: 'Masthead', role: 'LOGO' }), label(R - 300, 15, 300, 'Reviews  /  Audio  /  Headphones', { size: 8.5, font: 'karla', color: '#FFFFFF', align: 'right', tracking: .18, weight: 700 }));
  const foot = (): TelaVectorObject[] => runningFoot(ctx, { left: M, right: R, y: H - 38, font: 'karla', size: 9, color: soft, head: 'The Verdict  ·  Halcyon H2', rule: hair, weight: 700 });
  const scoreBlock = (x: number, y: number, s: number): TelaVectorObject[] => obj(rect(x, y, s, s, accent, { label: 'Score block', role: 'SIDEBAR' }), text(x, y + s * .02, s, '8.4', { size: Math.round(s * .6), font: 'anton', color: ink, align: 'center', wrap: false, leading: 1, label: 'Score', role: 'HERO' }), text(x, y + s * .66, s, '/ 10', { size: Math.round(s * .09), font: 'karla', weight: 800, color: ink, align: 'center', tracking: .2, wrap: false, label: 'Score scale', role: 'LABEL' }), rect(x, y + s - 38, s, 38, ink, { label: 'Score label band', role: 'SIDEBAR' }), text(x, y + s - 28, s, 'GREAT', { size: 16, font: 'archivoBlack', color: accent, align: 'center', tracking: .3, wrap: false, label: 'Score verdict', role: 'LABEL' }));
  const flow = pour(RV.paras.map(t => ({ t })), [
    [{ x: M, y: 808, w: 330, h: 182 }, { x: M + 354, y: 808, w: 330, h: 182 }],
    [...cols(M, 96, W - 2 * M, 306, 2, 24)],
    [{ x: M, y: 96, w: 400, h: 520 }],
  ], body);

  switch (pageType) {
    case 'ARTICLE HEADER': {
      const img = figure(M, 64, 440, 290, { tone: 'dark', shade: mix(ink, .22), vignette: true, hint: 'Product photograph · 5:4', hero: true, label: 'Hero product photo' });
      const badge = pill(M + 14, 78, 'Editors’ choice', { fill: accent, color: ink, size: 9, h: 24, font: 'karla', tracking: .16 });
      const sb = scoreBlock(R - 228, 64, 228);
      const price = obj(label(R - 228, 304, 228, 'Price', { size: 8, font: 'karla', color: soft, weight: 700, tracking: .2 }), text(R - 228, 316, 228, '$349', { size: 30, font: 'archivoBlack', color: ink, wrap: false, label: 'Price', role: 'PRICE' }), label(R - 130, 324, 130, 'Tested 6 weeks', { size: 8, font: 'karla', color: soft, weight: 700, tracking: .14, align: 'right' }));
      const hed = text(M, 374, W - 2 * M, RV.head, { size: 44, font: 'archivoBlack', color: ink, leading: 1.05, tracking: -.01, label: 'Headline', role: 'HEADLINE' });
      const deck = text(M, below(hed, 12), 600, RV.deck, { size: 16, font: 'bitter', italic: true, color: mix(ink, .25), leading: 1.45, label: 'Standfirst', role: 'DECK' });
      const by = text(M, below(deck, 10), 600, 'REVIEWED BY KOFI MENSAH  ·  TESTED AUGUST TO SEPTEMBER 2026', { size: 8.5, font: 'karla', weight: 800, color: soft, tracking: .16, wrap: false, label: 'Byline', role: 'BYLINE' });
      const py = below(by, 22); const colW = (W - 2 * M - 40) / 2;
      const list = (x: number, title: string, items: string[], col: string, mark: string): TelaVectorObject[] => { const t = typeset(items.map(s => ({ t: s, marker: { t: mark, dx: -26, size: 15, color: '#fff', font: 'archivoBlack' as const, dy: -1, w: 20 }, after: 8 })), [{ x: x + 28, y: py + 34, w: colW - 28, h: 130 }], { size: 13, font: 'bitter', color: ink, leading: 1.35, weight: 500 }); const dots = items.map((_, i) => circle(x + 10, py + 42 + i * (items.length > 3 ? 27 : 27), 9, col, { label: 'Marker badge' })); return obj(text(x, py, colW, title, { size: 12, font: 'archivoBlack', color: col, tracking: .16, transform: 'uppercase', wrap: false, label: 'List heading', role: 'LABEL' } as any), hr(x, py + 22, colW, col, 2, { label: 'List rule' }), dots, t.objs.map(o => (o.templateRole === 'LABEL' ? { ...o, x: o.x + 7 } : o))); };
      const specY = 724;
      const specs = obj(rect(M, specY, W - 2 * M, 1.5, ink, { label: 'Spec rule', role: 'RULE' }), ...RV.specs.flatMap(([k, v], i) => { const cw = (W - 2 * M) / 5, x = M + i * cw; return [label(x + 8, specY + 12, cw - 16, k, { size: 7.5, font: 'karla', color: soft, weight: 800, tracking: .2, role: 'SPEC' }), text(x + 8, specY + 26, cw - 16, v, { size: 16, font: 'archivoBlack', color: ink, wrap: false, label: 'Spec value', role: 'SPEC' }), ...(i ? [vr(x, specY + 12, 38, hair, 1, { label: 'Spec divider' })] : [])]; }), rect(M, specY + 62, W - 2 * M, 1.5, ink, { label: 'Spec rule', role: 'RULE' }));
      return obj(G, bar(), img.objs, badge.objs, sb, price, hed, deck, by, list(M, 'What we liked', RV.pros, green, '+'), list(M + colW + 40, 'What we did not', RV.cons, secondary, '−'), specs, flow[0].objs, foot());
    }
    case 'BODY PAGE': {
      const q = pullQuote(M, 430, W - 2 * M, RV.pull, { size: 26, font: 'archivoBlack', color: ink, rule: 'top', ruleColor: accent, ruleW: 8, attrib: 'Verdict in one line', attribColor: soft, attribFont: 'karla', pad: 22, leading: 1.18 });
      const ph = figure(M, 620, 330, 190, { tone: 'dark', shade: mix(ink, .22), vignette: true, hint: 'Detail · hinge and pad', caption: 'The hinge is metal; the memory-foam pads come off with a screwdriver.', credit: 'Kofi Mensah', capFont: 'karla', capSize: 10, capColor: soft, label: 'Detail photo' });
      const ph2 = figure(M + 354, 620, 330, 190, { tone: 'dark', shade: mix(ink, .22), vignette: true, hint: 'In use · commute', caption: 'Nine hours in the air, no pressure points, one very patient seatmate.', credit: 'Kofi Mensah', capFont: 'karla', capSize: 10, capColor: soft, label: 'In-use photo' });
      const sub = text(M, 64, 400, 'The sound, the fit, the catch', { size: 11, font: 'karla', weight: 800, color: secondary, tracking: .22, transform: 'uppercase', wrap: false, label: 'Subhead', role: 'KICKER' });
      const tiles = [['9 h', 'longest single wear'], ['41 dB', 'mean low-frequency cut'], ['5 h', 'from a 10-minute charge']].flatMap(([v, l], i) => { const tw = (W - 2 * M - 48) / 3, x = M + i * (tw + 24); return [rect(x, 892, tw, 90, tint, { label: 'Test stat tile', role: 'SIDEBAR' }), rect(x, 892, tw, 5, accent, { label: 'Tile bar', role: 'RULE' }), text(x + 16, 906, tw - 32, v, { size: 30, font: 'anton', color: ink, wrap: false, role: 'SIDEBAR', label: 'Test stat' }), label(x + 16, 952, tw - 32, l, { size: 8, font: 'karla', color: soft, weight: 800, tracking: .16, role: 'SIDEBAR' })]; });
      return obj(G, bar(), sub, flow[1].objs, q.objs, ph.objs, ph2.objs, tiles, foot());
    }
    case 'SIDEBAR': {
      const sx = 484, sw = R - sx;
      const panel = rect(sx, 80, sw, 520, tint, { label: 'Score panel', role: 'SIDEBAR' });
      const rows = RV.scores.flatMap(([k, v], i) => { const y = 124 + i * 60; return [text(sx + 20, y, sw - 40, k, { size: 12, font: 'karla', weight: 800, color: ink, wrap: false, role: 'SIDEBAR', label: 'Sub-score name' }), text(sx + sw - 70, y - 4, 50, v.toFixed(1), { size: 20, font: 'anton', color: ink, align: 'right', wrap: false, role: 'SIDEBAR', label: 'Sub-score value' }), ...meter(sx + 20, y + 24, sw - 40, 12, v, 10, v < 7 ? secondary : (v >= 9 ? green : accent), alpha(ink, .12), { rx: 0 })]; });
      const sp = obj(label(sx + 20, 94, sw - 40, 'Scores out of ten', { size: 9, font: 'karla', color: soft, weight: 800, tracking: .22, role: 'SIDEBAR' }), rows);
      const cmp = table(M, 650, [{ w: 170, font: 'archivoBlack', size: 12 }, { w: 80, font: 'bitter', size: 12 }, { w: 80, font: 'anton', size: 16, align: 'right' }, { w: 90, font: 'bitter', size: 12, align: 'right' }], RV.rivals, { size: 12, font: 'bitter', color: ink, rule: hair, pad: 8, head: ['How it compares', 'Price', 'Score', 'Battery'], headFont: 'karla', headSize: 8.5, headColor: soft, headRule: ink, label: 'Comparison table', zebra: tint });
      const buy = obj(rect(M + 440, 650, W - 2 * M - 440, 200, ink, { label: 'Where to buy card', role: 'SIDEBAR' }), label(M + 460, 668, 180, 'Where to buy', { size: 8.5, font: 'karla', color: accent, weight: 800, tracking: .22, role: 'SIDEBAR' }), text(M + 460, 692, 170, 'Direct from Halcyon, or any major audio retailer. Street prices run $30 under list.', { size: 12, font: 'bitter', color: '#FFFFFF', leading: 1.45, role: 'SIDEBAR', label: 'Where to buy text' }), ...button(M + 460, 790, 160, 40, 'Check prices', { fill: accent, color: ink, font: 'archivoBlack', size: 12, rx: 0 }));
      return obj(G, bar(), flow[2].objs, panel, sp, cmp.objs, buy, foot());
    }
    default: {
      const seal = obj(circle(M + 100, 200, 96, accent, { label: 'Seal disc' }), circle(M + 100, 200, 82, 'none', { stroke: ink, strokeWidth: 2, label: 'Seal ring' }), circle(M + 100, 200, 70, 'none', { stroke: ink, strokeWidth: 1, dash: [3, 3], label: 'Seal inner ring' }), text(M, 150, 200, 'EDITORS’', { size: 18, font: 'archivoBlack', color: ink, align: 'center', tracking: .12, wrap: false, label: 'Seal text', role: 'LABEL' }), text(M, 174, 200, 'CHOICE', { size: 30, font: 'anton', color: ink, align: 'center', tracking: .08, wrap: false, label: 'Seal text', role: 'LABEL' }), text(M, 214, 200, '2026', { size: 22, font: 'archivoBlack', color: ink, align: 'center', wrap: false, label: 'Seal year', role: 'LABEL' }));
      const final = obj(label(M + 240, 112, 400, 'The final verdict', { size: 10, font: 'karla', color: secondary, weight: 800, tracking: .24, role: 'KICKER' }), text(M + 240, 134, 430, 'Buy it if you want silence that sounds good.', { size: 30, font: 'archivoBlack', color: ink, leading: 1.1, label: 'Verdict headline', role: 'HEADLINE' }), text(M + 240, 224, 430, 'The Halcyon H2 is not the cheapest, the loudest or the most fashionable. It is the most considered pair we tested this year, and the one we kept wearing after the review was filed.', { size: 14, font: 'bitter', color: mix(ink, .1), leading: 1.6, label: 'Verdict text', role: 'BODY' }));
      const bi = (x: number, title: string, items: string[], col: string): TelaVectorObject[] => obj(rect(x, 400, 348, 230, tint, { label: 'Buy or skip card', role: 'SIDEBAR' }), rect(x, 400, 348, 8, col, { label: 'Card bar', role: 'RULE' }), text(x + 20, 424, 280, title, { size: 18, font: 'archivoBlack', color: ink, wrap: false, role: 'SIDEBAR', label: 'Card title' }), typeset(items.map(t => ({ t, marker: { t: '→', dx: -20, size: 13, color: col, font: 'archivoBlack' as const, dy: 1 }, after: 8 })), [{ x: x + 44, y: 458, w: 260, h: 160 }], { size: 13, font: 'bitter', color: ink, leading: 1.4 }).objs);
      const meth = obj(label(M, 670, 300, 'How we test', { size: 9, font: 'karla', color: secondary, weight: 800, tracking: .22 }), hr(M, 688, W - 2 * M, ink, 2), text(M, 700, 400, 'Every pair is worn for at least six weeks on commutes, flights and in open offices. Scores are agreed by two reviewers independently and averaged. We buy test units at retail or return loaners; no manufacturer sees a review before it runs.', { size: 12, font: 'bitter', color: soft, leading: 1.6, label: 'Test methodology', role: 'FOOTNOTE' }), ...imageSlot(M + 440, 700, 56, 56, { tone: 'light', shade: mix(paper, -.1), rx: 28, caption: 'Author', silent: true, label: 'Reviewer portrait' }), text(M + 508, 704, 170, 'Kofi Mensah', { size: 14, font: 'archivoBlack', color: ink, wrap: false, label: 'Reviewer name', role: 'BYLINE' }), text(M + 508, 726, 170, 'Audio editor. Has worn headphones on four continents.', { size: 10.5, font: 'bitter', color: soft, leading: 1.4, label: 'Reviewer bio', role: 'SIDEBAR' }));
      const more = obj(label(M, 820, 300, 'More reviews', { size: 9, font: 'karla', color: secondary, weight: 800, tracking: .22 }), hr(M, 838, W - 2 * M, ink, 2), ...[['Speakers', 'Aria Studio 2: big sound, small room'], ['Earbuds', 'Cove Buds Pro: better than they look'], ['Players', 'Pocket Hi-Fi 3: the return of the walkman']].flatMap(([k, t], i) => { const cw = (W - 2 * M - 40) / 3, x = M + i * (cw + 20); const im = figure(x, 852, cw, 90, { tone: 'dark', shade: mix(ink, .22), hint: 'Thumbnail', label: 'Related thumbnail' }); return [im.objs, label(x, 950, cw, k, { size: 7.5, font: 'karla', color: soft, weight: 800, tracking: .2 }), text(x, 962, cw, t, { size: 12, font: 'archivoBlack', color: ink, leading: 1.2, role: 'HEADLINE', label: 'Related headline' })].flat(); }));
      return obj(G, bar(), seal, final, bi(M, 'Buy if', ['You commute, fly or work in a noisy space', 'You want comfort over a long day', 'You switch between a phone and a laptop'], green), bi(M + 372, 'Skip if', ['You want wired, open-back sound', 'You take calls in crowds', 'You need the very longest battery life'], secondary), meth, more, foot());
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 10 · art-profile — Portrait (A4; layered portrait hero, fact box, timeline)
// ═════════════════════════════════════════════════════════════════════════════
const PR = {
  head: 'Anselm Ode',
  deck: 'The furniture maker who repairs more than he builds, and believes a chair should be able to forgive you.',
  paras: [
    'Anselm Ode keeps a chair in his workshop that nobody is allowed to fix. It is a plain ash dining chair with a left rear leg a quarter inch short, and it has wobbled since 1994. “It reminds me who I work for,” he says, nudging it with his boot. “The person who sits on it has no say in how it is made.”',
    'Ode is sixty-one, tall, quiet and permanently dusted with sawdust, and he runs what may be the last furniture workshop on Quay Lane that does more repair than new work. In a good week he restores six chairs. In a bad one he turns down thirty customers who want him to make them look old.',
    'He was born in Rotterdam to a ship’s carpenter and a piano teacher, and the house was divided between the two crafts: one trusted the eye, the other the ear. “My father could tell you a joint was bad by looking at it. My mother could tell me by the sound it made when I sat down.”',
    'He moved to Scotland at twenty-three for a job restoring pews, stayed for a woman who later became his wife, and opened his own shop in 1996 with a bench, a lathe and a loan from a cousin. The first thing he made was a stool for the cousin’s daughter. She is thirty-one now and still sits on it.',
    'What distinguishes Ode’s work is not a signature style but a kind of courtesy. Drawers run silently. Backs curve where backs curve. Every piece carries a small brass plate on the underside with the date, the wood and a line of his handwriting: “Mend me.”',
    'This year he took on his largest commission yet, forty reading chairs for the Ashgrove library, which is fighting to stay open. He does the work at cost. “A library chair has to be comfortable for a student and survive a toddler,” he says. “That is the same requirement as any good chair.”',
    'He is not sentimental about tools. His favourite is a cheap Japanese pull saw he bought in a hardware store for eight pounds. His least favourite is the router. “It makes everything fast and nothing good. I keep it so I can hate it.”',
    'Asked what he wants to be remembered for, Ode takes the question seriously, for longer than most. “That people sat down,” he says finally. “That is all a chair is for. The rest is conversation.”',
  ],
  facts: [['Born', '1968, Rotterdam'], ['Lives', 'Leith, Scotland'], ['Known for', 'Repairs and the Wobble Chair'], ['Workshop', '14 Quay Lane'], ['Now', '40 reading chairs for Ashgrove library']],
  timeline: [['1968', 'Born in Rotterdam'], ['1991', 'Apprentice in a pew restoration workshop'], ['1996', 'Opens his own bench on Quay Lane'], ['2008', 'The Wobble Chair is first exhibited'], ['2019', 'Craft Council fellowship'], ['2026', 'Ashgrove library commission']],
  pull: '“That people sat down. That is all a chair is for. The rest is conversation.”',
  qa: [['Favourite wood?', 'Ash. It forgives.'], ['Worst habit?', 'Keeping offcuts. I have a shed of regret.'], ['Advice to apprentices?', 'Sit on everything you make, every day.']],
};

const profile: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const M = 56, R = W - M, soft = mix(ink, .45), hair = alpha(ink, .22), tint = mix(paper, -.05);
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Page ground' });
  const body = { size: 13, font: 'lora' as const, color: ink, leading: 1.6, after: 9 };
  const foot = (): TelaVectorObject[] => runningFoot(ctx, { left: M, right: R, y: H - 38, font: 'karla', size: 9, color: soft, head: 'Portrait  ·  Anselm Ode', rule: hair, weight: 700 });
  const pages = pour([{ t: PR.paras[0], drop: { font: 'cormorant', lines: 3, color: accent, weight: 600 } }, ...PR.paras.slice(1).map(t => ({ t }))], [
    [{ x: 300, y: 112, w: 440, h: 640 }],
    [{ x: 300, y: 112, w: 440, h: 600 }],
    [{ x: M, y: 112, w: 440, h: 0 }],
  ], body);

  switch (pageType) {
    case 'LONG-FORM OPENER': {
      const hero = figure(250, 0, W - 250, 770, { tone: 'dark', shade: mix(ink, .25), vignette: true, hint: 'Portrait · full height · 4:5', hero: true, label: 'Hero portrait' });
      const vk = text(125, 200, 200, 'PROFILE  ·  ISSUE 38', { size: 9, font: 'karla', weight: 800, color: accent, tracking: .3, wrap: false, rotation: -90, label: 'Vertical kicker', role: 'KICKER' });
      const fact = obj(rect(M - 12, 520, 270, 232, paper, { label: 'Fact box', role: 'SIDEBAR', shadow: { x: 0, y: 10, blur: 24, color: 'rgba(36,26,26,.28)' } }), rect(M - 12, 520, 270, 8, accent, { label: 'Fact box bar', role: 'RULE' }), label(M + 8, 544, 220, 'At a glance', { size: 9, font: 'karla', color: accent, weight: 800, tracking: .24, role: 'SIDEBAR' }), table(M - 4, 566, [{ w: 80, font: 'karla', size: 8.5, weight: 800, color: soft, tracking: .1 }, { w: 170, font: 'lora', size: 12 }], PR.facts, { size: 12, font: 'lora', color: ink, rule: hair, pad: 6, label: 'Fact box', role: 'SIDEBAR' }).objs);
      const name = text(M - 4, 792, 440, 'Anselm\nOde', { size: 118, font: 'cormorant', weight: 600, italic: true, color: ink, leading: .86, tracking: -.02, label: 'Headline', role: 'HEADLINE' });
      const deck = text(480, 812, W - 480 - M, PR.deck, { size: 16, font: 'lora', italic: true, color: mix(ink, .2), leading: 1.5, label: 'Standfirst', role: 'DECK' });
      const by = obj(hr(480, below(deck, 18), 48, accent, 2, { label: 'Byline rule' }), text(480, below(deck, 28), 260, 'BY IMANI WRIGHT', { size: 8.5, font: 'karla', weight: 800, color: ink, tracking: .2, wrap: false, label: 'Byline', role: 'BYLINE' }), text(480, below(deck, 44), 260, 'PHOTOGRAPHS BY ADA NJOKU  ·  LEITH, OCTOBER', { size: 8, font: 'karla', weight: 700, color: soft, tracking: .16, wrap: false, label: 'Dateline', role: 'DATELINE' }));
      return obj(G, hero.objs, vk, fact, name, deck, by, label(R - 300, H - 38, 300, 'Photograph: Ada Njoku', { size: 7.5, font: 'karla', color: soft, tracking: .16, align: 'right', role: 'CREDIT', label: 'Hero credit' }));
    }
    case 'BODY PAGE': {
      const portrait = obj(...imageSlot(M, 112, 190, 190, { tone: 'light', shade: mix(paper, -.1), rx: 95, caption: 'Detail', label: 'Detail portrait' }));
      const cap = text(M, 312, 190, 'The Wobble Chair, 1994, ash. “It has never once lied to me.”', { size: 10.5, font: 'lora', italic: true, color: soft, leading: 1.45, label: 'Caption', role: 'CAPTION' });
      const cr = label(M, below(cap, 4), 190, 'Ada Njoku', { size: 7.5, font: 'karla', color: soft, tracking: .16, role: 'CREDIT', label: 'Photo credit' });
      const q = pullQuote(M, 470, 214, PR.pull, { size: 24, font: 'cormorant', weight: 600, italic: true, color: accent, rule: 'mark', markColor: accent, leading: 1.15, attrib: 'Anselm Ode', attribColor: soft, attribFont: 'karla' });
      return obj(G, label(M, 40, 400, 'Portrait  /  Anselm Ode', { size: 8.5, font: 'karla', color: accent, weight: 800, tracking: .22, role: 'KICKER' }), hr(M, 62, R - M, ink, 1, { label: 'Head rule' }), portrait, cap, cr, q.objs, pages[0].objs, foot());
    }
    case 'SIDEBAR': {
      const tl = obj(label(M, 112, 200, 'A life in dates', { size: 9, font: 'karla', color: accent, weight: 800, tracking: .24, role: 'SIDEBAR' }), vr(M + 36, 150, PR.timeline.length * 100 - 40, ink, 1.5, { label: 'Timeline spine' }), ...PR.timeline.flatMap(([y, t], i) => [circle(M + 36, 156 + i * 100, 6, i === PR.timeline.length - 1 ? accent : paper, { stroke: ink, strokeWidth: 1.5, label: 'Timeline dot' }), text(M, 146 + i * 100, 30, y, { size: 16, font: 'cormorant', weight: 700, color: ink, wrap: false, role: 'SIDEBAR', label: 'Timeline year' }), text(M + 56, 148 + i * 100, 150, t, { size: 12, font: 'lora', color: soft, leading: 1.4, role: 'SIDEBAR', label: 'Timeline entry' })]));
      const txt = pages[1];
      const q = pullQuote(300, txt.ends[0] + 14, 440, '“Don’t try to make good furniture. Try to make the same chair twice.”', { size: 27, font: 'cormorant', weight: 600, italic: true, color: ink, rule: 'both', ruleColor: accent, ruleW: 2, pad: 18, leading: 1.15, attrib: 'A neighbour’s advice to Ode, 1996', attribColor: soft, attribFont: 'karla' });
      return obj(G, label(M, 40, 400, 'Portrait  /  Anselm Ode', { size: 8.5, font: 'karla', color: accent, weight: 800, tracking: .22, role: 'KICKER' }), hr(M, 62, R - M, ink, 1, { label: 'Head rule' }), tl, txt.objs, q.objs, foot());
    }
    default: {
      const big = text(M, 130, W - 2 * M, PR.pull, { size: 48, font: 'cormorant', weight: 600, italic: true, color: accent, leading: 1.08, label: 'Closing quote', role: 'PULLQUOTE' });
      const qy = below(big, 40);
      const qa = obj(label(M, qy, 300, 'In his words', { size: 9, font: 'karla', color: ink, weight: 800, tracking: .24 }), hr(M, qy + 18, R - M, ink, 1.5), ...PR.qa.flatMap(([q, a], i) => { const cw = (R - M - 40) / 3, x = M + i * (cw + 20); return [text(x, qy + 34, cw, q, { size: 9, font: 'karla', weight: 800, color: accent, tracking: .16, transform: 'uppercase', leading: 1.35, role: 'SIDEBAR', label: 'Question' }), text(x, qy + 60, cw, a, { size: 17, font: 'cormorant', weight: 600, italic: true, color: ink, leading: 1.2, role: 'SIDEBAR', label: 'Answer' })]; }));
      const A = pages[2];
      const cy = qy + 190;
      const cr = table(M, cy, [{ w: 130, font: 'karla', size: 8.5, weight: 800, color: soft, tracking: .14 }, { w: 330, font: 'cormorant', size: 17, weight: 600 }], [['Words', 'Imani Wright'], ['Photographs', 'Ada Njoku'], ['Edited by', 'Priya Natarajan'], ['Fact-checking', 'Hallam Ede']], { size: 14, font: 'lora', color: ink, rule: hair, pad: 8, label: 'Credits', head: ['Credits', ''], headFont: 'karla', headSize: 8.5, headColor: accent, headRule: ink });
      const next = obj(rect(540, cy, R - 540, 250, ink, { label: 'Next profile card', role: 'SIDEBAR' }), ...imageSlot(540, cy, R - 540, 130, { tone: 'dark', shade: mix(ink, .2), silent: true, label: 'Next portrait' }), label(556, cy + 146, 160, 'Next profile', { size: 8, font: 'karla', color: secondary, weight: 800, tracking: .22, role: 'SIDEBAR' }), text(556, cy + 164, R - 540 - 32, 'Odile Ferreira, who teaches the city to dance', { size: 18, font: 'cormorant', weight: 600, italic: true, color: paper, leading: 1.15, role: 'HEADLINE', label: 'Next headline' }));
      return obj(G, label(M, 40, 400, 'Portrait  /  Anselm Ode', { size: 8.5, font: 'karla', color: accent, weight: 800, tracking: .22, role: 'KICKER' }), hr(M, 62, R - M, ink, 1, { label: 'Head rule' }), big, qa, cr.objs, next, foot());
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 11 · art-newsletter — Sunday Letter (680 × 1500; one 560 px column, email-safe)
// ═════════════════════════════════════════════════════════════════════════════
const NL = {
  head: 'On being a beginner at bread',
  deck: 'What twelve hours of doing nothing taught me about interfering.',
  paras: [
    'Three weeks ago I decided to learn how to bake bread. This was not a bold decision. It was a Tuesday, I had a bag of flour that had outlived two moves, and I was tired of being good at only the things I was already good at.',
    'The first loaf was a brick. I mean this precisely: it was the shape of a brick, the weight of a brick, and when I dropped it on the counter to see what would happen, the counter lost. The second was better. The third rose, collapsed, and rose again in a way I took personally.',
    'What I did not expect was how much of baking is waiting. You mix flour, water, salt and a pinch of yeast, and then you do nothing for twelve hours. The dough does the work. Your only job is not to interfere, which, it turns out, is the hardest job I have had in years.',
    'I have spent most of my working life being rewarded for interfering: for fixing, tidying, replying within the hour. Bread does not care about any of it. It rises at the speed of the room. If the kitchen is cold, it takes longer. If you check on it every ten minutes, it takes exactly as long as it would have anyway.',
    'There is a lesson in that, and I distrust lessons, so I will say only this: I have started leaving my phone in the other room while the dough proves. The first time, I stood in the kitchen for forty minutes and felt like a person waiting for a bus that had been cancelled. The fourth time, I read a whole chapter of a novel.',
    'My neighbour, who has baked every Sunday for thirty years, gave me a piece of advice over the fence. “Don’t try to make good bread,” she said. “Try to make the same bread twice.” It is the best creative advice I have received, and it was about flour.',
    'So this week I am making the same loaf again. Same flour, same water, same cold kitchen. I will let you know how it goes, if it goes anywhere. In the meantime, here are three things that kept me company while I waited.',
  ],
  links: [['The sourdough starter that has been alive since 1847', 'A baker’s notes on keeping something going'], ['A short film about a baker who works at night', '11 minutes, no dialogue'], ['Why beginners are happier than experts', 'An essay with an unexpected ending']],
  pull: '“Try to make the same bread twice.”',
};

const newsletter: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const X = 60, CW = W - 120, soft = mix(ink, .45), hair = alpha(ink, .2), sand = mix(secondary, .55);
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Page ground' });
  const body = { size: 18, font: 'lora' as const, color: ink, leading: 1.62, after: 16 };
  const pages = pour(NL.paras.map(t => ({ t })), [
    [{ x: X, y: 880, w: CW, h: 520 }],
    [{ x: X, y: 100, w: CW, h: 330 }, { x: X, y: 800, w: CW, h: 600 }],
    [{ x: X, y: 640, w: CW, h: 0 }],
  ], body);
  const pre = (): TelaVectorObject[] => obj(text(X, 22, CW, 'View in browser  ·  Issue 214  ·  6 minute read', { size: 11, font: 'inter', color: soft, align: 'center', wrap: false, label: 'Preheader', role: 'LABEL' }), hr(X, 48, CW, hair, 1, { label: 'Preheader rule' }));

  switch (pageType) {
    case 'ARTICLE HEADER': {
      const mast = obj(text(X, 70, CW, 'The Sunday Letter', { size: 34, font: 'lora', weight: 700, italic: true, color: ink, align: 'center', wrap: false, label: 'Wordmark', role: 'LOGO' }), hr(X + 180, 128, 90, accent, 1.5, { label: 'Ornament rule' }), path(W / 2 - 6, 122, 12, 12, orn.polygonPath(4, 0), accent, { label: 'Ornament diamond' }), hr(W - X - 270, 128, 90, accent, 1.5, { label: 'Ornament rule' }), text(X, 144, CW, 'SUNDAY 12 OCTOBER 2026', { size: 11, font: 'inter', weight: 700, color: soft, tracking: .24, align: 'center', wrap: false, label: 'Dateline', role: 'DATELINE' }));
      const kick = text(X, 206, CW, 'ESSAY', { size: 11, font: 'inter', weight: 800, color: accent, tracking: .24, wrap: false, label: 'Kicker', role: 'KICKER' });
      const hed = text(X, 228, CW, NL.head, { size: 42, font: 'lora', weight: 700, color: ink, leading: 1.12, tracking: -.01, label: 'Headline', role: 'HEADLINE' });
      const deck = text(X, below(hed, 14), CW, NL.deck, { size: 20, font: 'lora', italic: true, color: mix(ink, .25), leading: 1.45, label: 'Standfirst', role: 'DECK' });
      const by = below(deck, 20);
      const byrow = obj(...imageSlot(X, by, 44, 44, { tone: 'light', shade: sand, rx: 22, silent: true, label: 'Author avatar' }), text(X + 58, by + 4, 400, 'By Imani Wright', { size: 14, font: 'inter', weight: 700, color: ink, wrap: false, label: 'Byline', role: 'BYLINE' }), text(X + 58, by + 24, 400, 'Written in a cold kitchen on a Tuesday', { size: 12, font: 'inter', color: soft, wrap: false, label: 'Byline note', role: 'DATELINE' }));
      const hero = figure(X, by + 70, CW, 300, { tone: 'light', shade: sand, hint: 'Lead image · 560 × 300', hero: true, label: 'Hero image', caption: 'The second loaf. It rose; it also, regrettably, leaned.', capFont: 'lora', capSize: 13, capItalic: true, capColor: soft });
      return obj(G, pre(), mast, kick, hed, deck, byrow, hero.objs, pages[0].objs, rect(0, H - 6, W, 6, accent, { label: 'Bottom bar', role: 'ORNAMENT' }));
    }
    case 'BODY PAGE': {
      const sub = text(X, 74, CW, 'The waiting is the work', { size: 26, font: 'lora', weight: 700, color: ink, wrap: false, label: 'Subhead', role: 'HEADLINE' });
      const fig = figure(X, 450, CW, 280, { tone: 'light', shade: sand, hint: 'Inline image · 560 × 280', caption: 'Proving overnight in the coldest corner of the kitchen. The towel is optional; the patience is not.', capFont: 'lora', capSize: 13, capItalic: true, capColor: soft, label: 'Inline image' });
      const sub2 = text(X, 744, CW, 'The same bread twice', { size: 26, font: 'lora', weight: 700, color: ink, wrap: false, label: 'Subhead', role: 'HEADLINE' });
      return obj(G, pre(), sub, pages[1].objs.filter(o => o.y < 700), fig.objs, sub2, pages[1].objs.filter(o => o.y >= 700), rect(0, H - 6, W, 6, accent, { label: 'Bottom bar', role: 'ORNAMENT' }));
    }
    case 'PULL QUOTE': {
      const q = obj(hr(X, 110, CW, ink, 2, { label: 'Quote rule' }), text(X, 130, 60, '“', { size: 120, font: 'lora', weight: 700, color: accent, wrap: false, leading: 1, label: 'Quotation mark', role: 'ORNAMENT' }), text(X, 240, CW, NL.pull.replace(/[“”]/g, ''), { size: 44, font: 'lora', weight: 700, italic: true, color: ink, leading: 1.15, label: 'Pull quote', role: 'PULLQUOTE' }), text(X, 390, CW, 'A NEIGHBOUR, OVER THE FENCE', { size: 11, font: 'inter', weight: 800, color: accent, tracking: .22, wrap: false, label: 'Attribution', role: 'CREDIT' }), hr(X, 430, CW, ink, 2, { label: 'Quote rule' }));
      const ps = obj(text(X, 470, CW, 'Three things that kept me company', { size: 26, font: 'lora', weight: 700, color: ink, wrap: false, label: 'Subhead', role: 'HEADLINE' }), ...NL.links.flatMap(([t, d], i) => { const y = 524 + i * 112; const tt = text(X + 48, y, CW - 48, t, { size: 19, font: 'lora', weight: 700, color: accent, leading: 1.3, label: 'Link title', role: 'BODY' }); return [text(X, y - 6, 40, String(i + 1), { size: 34, font: 'lora', weight: 700, color: sand === '#000' ? ink : mix(secondary, -.1), wrap: false, label: 'Link number', role: 'LABEL' }), tt, text(X + 48, below(tt, 4), CW - 48, d, { size: 14, font: 'inter', color: soft, leading: 1.45, label: 'Link description', role: 'CAPTION' }), hr(X, y + 90, CW, hair, 1, { label: 'Link rule' })]; }));
      const psx = obj(text(X, 900, CW, 'P.S.', { size: 18, font: 'lora', weight: 700, italic: true, color: ink, wrap: false, label: 'Postscript label', role: 'LABEL' }), text(X + 44, 900, CW - 44, 'If you have a loaf you have made twice, send me a photo. I read every reply, and I promise to be encouraging about the lean.', { size: 17, font: 'lora', color: ink, leading: 1.6, label: 'Postscript', role: 'BODY' }));
      const cta = button(X, 1040, 270, 56, 'Reply to this email', { fill: accent, color: '#FFFFFF', font: 'inter', size: 16, rx: 6 });
      const fwd = text(X + 296, 1058, 264, 'or forward it to a friend who needs a slower Sunday', { size: 13, font: 'inter', color: soft, leading: 1.45, label: 'Forward prompt', role: 'CAPTION' });
      const rec = obj(rect(X, 1150, CW, 250, sand, { rx: 10, label: 'Recipe card', role: 'SIDEBAR' }), label(X + 28, 1172, 300, 'The recipe, twice', { size: 11, font: 'inter', color: mix(secondary, -.5), weight: 800, tracking: .22, role: 'SIDEBAR' }), text(X + 28, 1198, CW - 56, 'Same loaf, every time', { size: 24, font: 'lora', weight: 700, color: ink, wrap: false, role: 'SIDEBAR', label: 'Recipe title' }), typeset(['500 g strong white flour', '350 g cold water', '10 g fine salt', '2 g instant yeast', 'Twelve hours, one cold corner, no peeking'].map(t => ({ t, marker: { t: '–', dx: -18, size: 16, color: accent, font: 'lora' as const, weight: 700 }, after: 4 })), [{ x: X + 48, y: 1244, w: CW - 76, h: 150 }], { size: 16, font: 'lora', color: ink, leading: 1.45 }).objs);
      return obj(G, pre(), q, ps, psx, cta, fwd, rec, rect(0, H - 6, W, 6, accent, { label: 'Bottom bar', role: 'ORNAMENT' }));
    }
    default: {
      const sign = obj(text(X, 110, CW, 'Until next Sunday,', { size: 18, font: 'lora', italic: true, color: ink, wrap: false, label: 'Sign-off', role: 'BODY' }), text(X, 142, 300, 'Imani', { size: 52, font: 'caveat', weight: 600, color: accent, wrap: false, label: 'Signature', role: 'BYLINE' }));
      const share = obj(label(X, 250, 300, 'Pass it on', { size: 11, font: 'inter', color: soft, weight: 800, tracking: .22 }), hr(X, 272, CW, ink, 1.5), ...['Forward by email', 'Copy link', 'Post a quote'].flatMap((t, i) => pill(X + i * 180, 290, t, { fill: 'none', stroke: ink, color: ink, size: 11, h: 36, font: 'inter', tracking: .02, padX: 16 }).objs));
      const sub = obj(rect(X, 380, CW, 220, sand, { rx: 10, label: 'Subscribe card', role: 'SIDEBAR' }), text(X + 32, 408, CW - 64, 'Get the Letter every Sunday', { size: 24, font: 'lora', weight: 700, color: ink, wrap: false, role: 'SIDEBAR', label: 'Subscribe heading' }), text(X + 32, 446, CW - 64, 'One essay, three links, no ads. Free, and always will be.', { size: 15, font: 'lora', color: mix(ink, .15), leading: 1.5, role: 'SIDEBAR', label: 'Subscribe text' }), rect(X + 32, 500, 330, 46, paper, { rx: 6, stroke: hair, strokeWidth: 1, label: 'Email field', role: 'ORNAMENT' }), text(X + 46, 513, 300, 'you@example.com', { size: 15, font: 'inter', color: soft, wrap: false, label: 'Email placeholder', role: 'LABEL' }), ...button(X + 374, 500, 154, 46, 'Subscribe', { fill: accent, color: '#FFFFFF', font: 'inter', size: 15, rx: 6 }));
      const prev = obj(label(X, 650, 300, 'Last week', { size: 11, font: 'inter', color: soft, weight: 800, tracking: .22 }), hr(X, 672, CW, ink, 1.5), ...imageSlot(X, 690, 120, 90, { tone: 'light', shade: sand, silent: true, label: 'Previous issue thumbnail' }), text(X + 140, 692, CW - 140, 'The quiet case for the long walk to work', { size: 20, font: 'lora', weight: 700, color: ink, leading: 1.25, label: 'Previous headline', role: 'HEADLINE' }), text(X + 140, 748, CW - 140, 'Issue 213  ·  5 minute read', { size: 12, font: 'inter', color: soft, wrap: false, label: 'Previous meta', role: 'CAPTION' }));
      const f = obj(hr(X, 1220, CW, hair, 1, { label: 'Footer rule' }), text(X, 1240, CW, 'You are receiving this because you subscribed at thesundayletter.example. If it is no longer welcome, you can unsubscribe in one click.', { size: 12, font: 'inter', color: soft, leading: 1.6, align: 'center', label: 'Footer note', role: 'FOOTNOTE' }), text(X, 1304, CW, 'The Sunday Letter  ·  14 Quay Lane, Leith EH6 7AA, United Kingdom', { size: 12, font: 'inter', color: soft, align: 'center', label: 'Postal address', role: 'FOOTNOTE' }), text(X, 1332, CW, 'Unsubscribe   ·   Manage preferences   ·   Privacy', { size: 12, font: 'inter', weight: 600, color: accent, align: 'center', wrap: false, label: 'Footer links', role: 'FOOTNOTE' }), ...[0, 1, 2].map(i => circle(W / 2 - 40 + i * 40, 1396, 14, ink, { label: 'Social icon' })));
      return obj(G, pre(), sign, share, sub, prev, f, rect(0, H - 6, W, 6, accent, { label: 'Bottom bar', role: 'ORNAMENT' }));
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 12 · art-research — Research Brief (A4; abstract, two columns, figures, references)
// ═════════════════════════════════════════════════════════════════════════════
const RS = {
  title: 'Later school start times, longer sleep and better recall in adolescents: a cluster-randomised trial',
  authors: 'Hana Petrova¹, Samir Batra², Lena Haugen¹ and Kofi Mensah²',
  affil: ['¹ Department of Education and Psychology, Northbridge University', '² Centre for Sleep and Cognition, Ardale Institute'],
  abstract: 'Background. Adolescents sleep less than they need, partly because school starts early. We tested whether delaying the first lesson by 50 minutes changes next-day recall. Methods. In a cluster-randomised trial across 12 secondary schools (n = 1,842, ages 13 to 16), six schools moved the start of the day from 8:10 to 9:00 for one term; six kept the original schedule. The primary outcome was delayed recall on a standardised word-list task. Results. Students in later-start schools slept a mean 41 minutes longer on school nights (95% CI 33 to 49) and recalled 7.2 percent more words (95% CI 3.1 to 11.3). Effects were largest among students with the shortest baseline sleep. Conclusions. A modest delay in start time was associated with longer sleep and better recall. Longer follow-up is needed to test whether the gains persist.',
  keywords: 'sleep · adolescence · school start time · memory · cluster-randomised trial',
  keys: ['Moving the school day 50 minutes later added 41 minutes of sleep.', 'Recall improved by 7.2 percent.', 'Gains were about twice as large among the shortest sleepers.'],
  paras: [
    ['1  Introduction', 'Sleep need peaks in adolescence, yet the typical teenager sleeps one to two hours less than recommended on school nights [1]. Biological changes at puberty delay the timing of the circadian clock, making early waking difficult independent of habit or screen use [2].'],
    ['', 'Observational studies have linked later school start times to longer sleep, fewer absences and lower rates of low mood [3,4]. Randomised evidence is rarer, and most existing trials measure sleep rather than learning. We therefore asked a narrower question: does a later start improve next-day memory, measured directly?'],
    ['', 'Existing school-based trials are small, short or unmasked. The few that tested memory used self-reported measures or a single classroom. A cluster design across several schools, with objective sleep measurement and a standard recall task, can answer a more precise question about whether the benefit is real and who gains most.'],
    ['2  Methods', 'Twelve schools in three districts were matched on size and prior attainment, then randomised in pairs. Intervention schools moved the first lesson from 8:10 to 9:00 for the autumn term without shortening the school day. Students wore wrist actigraphs for one week at baseline and one week in week ten. Recall was assessed with a 40-item word-list task administered at 11:00 on a Tuesday, the day after a controlled evening of learning.'],
    ['', 'Recall was assessed with a 40-item list of concrete nouns balanced for frequency and length, read aloud and presented once. Students wrote what they remembered after a 20-minute delay filled with unrelated tasks. Two blinded markers scored each response; disagreements were resolved by a third.'],
    ['', 'Eligible students were in years 9 to 11 and attended participating schools full-time. Parents could opt out; 3.1 percent did. Of 1,903 eligible students, 1,842 contributed baseline data and 1,771 completed week-ten assessments, with similar attrition in both arms.'],
    ['', 'The primary analysis compared recall between arms using a mixed model with school as a random effect and baseline sleep as a covariate. Secondary outcomes were sleep duration, absences and self-reported mood. The trial was registered before enrolment and approved by the university ethics committee.'],
    ['3  Results', 'Baseline sleep did not differ between arms (mean 7 h 02 min). By week ten, intervention students slept 41 minutes longer (95% CI 33 to 49), mostly through later waking rather than earlier bedtimes. Recall scores were 7.2 percent higher (95% CI 3.1 to 11.3; p = 0.002). Effects were roughly twice as large in the lowest sleep quartile (Figure 1).'],
    ['', 'Adjusting for age, sex and baseline sleep did not change the estimates materially, and a sensitivity analysis excluding the two schools with the largest transport changes gave similar results (recall difference 6.8 percent; 95% CI 2.4 to 11.2).'],
    ['', 'Subgroup estimates were consistent in direction. Girls and boys gained similar amounts of sleep (42 and 40 minutes). Students who commuted more than 30 minutes gained less (29 minutes), which may reflect fixed early bus timetables, a point for local transport planning.'],
    ['', 'Absences fell by 11 percent in intervention schools, though the trial was not powered for this outcome. Head teachers reported no adverse effects on after-school activities or transport.'],
    ['', 'Sleep was estimated from actigraphy with a validated algorithm; nights with fewer than six hours of wear were excluded. Students completed a short mood questionnaire on the same Tuesday, and absences were taken from school registers for the term. Researchers scoring recall were blind to arm.'],
    ['', 'Sleep gains emerged in the second week, as the new timetable began, and held for the rest of the term (Figure 2). Bedtimes shifted by a median of 6 minutes; waking times by 47. Students in the lowest quartile of baseline sleep gained 58 minutes, those in the highest quartile 22.'],
    ['', 'Self-reported mood improved slightly (difference 0.2 points on a five-point scale; 95% CI 0.0 to 0.4). The effect on absences, a secondary outcome, was consistent in direction across all six school pairs.'],
    ['4  Discussion', 'A 50-minute delay was enough to produce measurable gains in memory, supporting the view that sleep is a plausible mechanism for the association between school timing and attainment. The result should be read with caution. Recall was tested once, in a single term, and schools were not blinded to allocation.'],
    ['', 'The most likely mechanism is straightforward: more sleep before memory consolidation, and more alertness at the time of testing. We cannot separate these routes in this design. Nor can we exclude a motivational effect of a more relaxed morning, though no such effect appeared in the mood measures.'],
    ['', 'Three limitations deserve mention. The trial covered one term, so novelty effects cannot be ruled out. Recall is only one aspect of learning and may not translate into exam results. And the schools that agreed to take part may have been more receptive to change than the average school.'],
    ['', 'Strengths of the study include randomisation, objective sleep measurement and a direct test of memory. Limitations include a single term of follow-up, a single recall task, and the fact that schools, not students, were randomised, which limits statistical power for subgroup comparisons.'],
    ['', 'The larger benefit in the shortest sleepers matters for policy: it suggests the gain is concentrated among those who need it most. Whether it persists, grows or fades over a full school year is the question for the second phase of the trial.'],
    ['', 'Implications for schools are practical. A 50-minute delay required no change to the length of the day, only the order of the bells; transport and after-school provision were adjusted locally at modest cost. Schools should plan the change with parents and drivers well before term begins.'],
  ] as Array<[string, string]>,
  conclusion: 'Moving the start of the school day later by under an hour lengthened sleep and improved recall in adolescents. Schools considering a change can reasonably expect measurable benefits without shortening instructional time.',
  refs: ['Hale L, Okafor T. Sleep duration and timing in adolescents: a review of national surveys. Sleep Health. 2021;7(2):112–120.', 'Carskadon MA. Sleep in adolescents: the perfect storm. Pediatr Clin North Am. 2011;58(3):637–647.', 'Wahlstrom K. Changing times: findings from the first longitudinal study of later high school start times. NASSP Bull. 2002;86(633):3–21.', 'Minges KE, Redeker NS. Delayed school start times and adolescent sleep: a systematic review. Sleep Med Rev. 2016;28:86–95.', 'Dewald JF, Meijer AM, Oort FJ, Kerkhof GA, Bögels SM. The influence of sleep quality, sleep duration and sleepiness on school performance. Sleep Med Rev. 2010;14(3):179–189.', 'Walker MP. The role of sleep in cognition and emotion. Ann N Y Acad Sci. 2009;1156:168–197.'],
};

const research: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const M = 54, R = W - M, soft = mix(ink, .45), hair = alpha(ink, .25), tint = mix(accent, .93), cw = (W - 2 * M - 24) / 2;
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Page ground' });
  const body = { size: 12, font: 'crimson' as const, color: ink, leading: 1.42, after: 6 };
  const sec = (t: string) => ({ t, font: 'libreBaskerville' as const, weight: 700, size: 12, color: accent, leading: 1.3, before: 6, after: 4, keepNext: true, label: 'Section heading', role: 'HEADLINE' as const });
  const blocks = RS.paras.flatMap(([h, t]) => h ? [sec(h), { t }] : [{ t }]);
  const flow = pour(blocks, [
    [{ x: M, y: 600, w: cw, h: 462 }, { x: M + cw + 24, y: 600, w: cw, h: 462 }],
    [{ x: M, y: 90, w: cw, h: 560 }, { x: M + cw + 24, y: 556, w: cw, h: 94 }],
    [{ x: M, y: 90, w: 380, h: 480 }],
  ], body);
  const strip = (): TelaVectorObject[] => obj(label(M, 24, 400, 'Research Brief  ·  Vol. 14, No. 3', { size: 8, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .12, transform: 'none' }), label(R - 340, 24, 340, 'DOI 10.0000/rb.2026.0314  ·  Open access (CC BY)', { size: 8, font: 'ibmPlexMono', color: soft, align: 'right', tracking: .04, transform: 'none' }), hr(M, 44, R - M, ink, 1.5, { label: 'Journal rule' }));
  const foot = (): TelaVectorObject[] => runningFoot(ctx, { left: M, right: R, y: H - 34, font: 'ibmPlexMono', size: 8, color: soft, head: 'Petrova et al.  ·  School start times and recall', rule: hair, weight: 500, tracking: .06 });
  const figCap = (x: number, y: number, w: number, n: string, t: string): TelaVectorObject => text(x, y, w, `${n}  ${t}`, { size: 9.5, font: 'crimson', italic: false, color: soft, leading: 1.4, label: 'Figure caption', role: 'CAPTION' });

  switch (pageType) {
    case 'ARTICLE HEADER': {
      const hed = text(M, 62, W - 2 * M, RS.title, { size: 34, font: 'libreBaskerville', weight: 700, color: ink, leading: 1.2, tracking: -.005, label: 'Title', role: 'HEADLINE' });
      const au = text(M, below(hed, 14), W - 2 * M, RS.authors, { size: 13, font: 'crimson', weight: 600, color: ink, leading: 1.35, label: 'Authors', role: 'BYLINE' });
      const af = text(M, below(au, 6), W - 2 * M, RS.affil.join('\n'), { size: 9.5, font: 'crimson', italic: true, color: soft, leading: 1.4, label: 'Affiliations', role: 'DATELINE' });
      const ay = below(af, 16);
      const ab = text(M + 18, ay + 36, W - 2 * M - 36, RS.abstract, { size: 11, font: 'crimson', color: ink, leading: 1.42, label: 'Abstract', role: 'BODY' });
      const box = obj(rect(M, ay, W - 2 * M, ab.h + 50 + 40, tint, { label: 'Abstract panel', role: 'SIDEBAR' }), rect(M, ay, 5, ab.h + 90, accent, { label: 'Abstract bar', role: 'RULE' }), label(M + 18, ay + 14, 200, 'Abstract', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .2, role: 'SIDEBAR' }), ab, text(M + 18, ay + ab.h + 50, W - 2 * M - 36, 'Keywords: ' + RS.keywords, { size: 9.5, font: 'ibmPlexMono', color: soft, leading: 1.4, label: 'Keywords', role: 'CAPTION' }));
      const kp = ay + ab.h + 100;
      const keys = obj(label(M, kp, 300, 'Key points', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .2 }), hr(M, kp + 16, R - M, ink, 1, { label: 'Key points rule' }), ...RS.keys.flatMap((t, i) => { const w = (W - 2 * M - 40) / 3, x = M + i * (w + 20); return [text(x, kp + 28, 30, String(i + 1), { size: 24, font: 'libreBaskerville', weight: 700, color: accent, wrap: false, role: 'SIDEBAR', label: 'Point number' }), text(x + 28, kp + 30, w - 28, t, { size: 11, font: 'crimson', color: ink, leading: 1.35, role: 'SIDEBAR', label: 'Key point' })]; }));
      return obj(G, strip(), hed, au, af, box, keys, flow[0].objs.map(o => ({ ...o, y: o.y + (kp + 82 - 722 > 0 ? 0 : 0) })), foot());
    }
    case 'BODY PAGE': {
      const x2 = M + cw + 24;
      const bars = [['Control', 41.0, 38.6, 43.4], ['Intervention', 48.2, 45.9, 50.5]] as Array<[string, number, number, number]>;
      const fx = x2, fy = 108, fw = cw, fh = 220; const y0 = fy + fh - 30, yScale = (fh - 70) / 60;
      const chart = obj(label(fx, fy - 4, fw, 'Figure 1', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .16 }), ...[0, 20, 40, 60].flatMap(v => [hr(fx + 30, y0 - v * yScale, fw - 30, hair, .6, { label: 'Gridline' }), text(fx, y0 - v * yScale - 6, 26, String(v), { size: 8.5, font: 'ibmPlexMono', color: soft, align: 'right', wrap: false, role: 'CAPTION', label: 'Axis value' })]), ...bars.flatMap(([n, v, lo, hi], i) => { const bx = fx + 56 + i * 130; return [rect(bx, y0 - v * yScale, 70, v * yScale, i ? accent : mix(ink, .55), { label: 'Bar', role: 'ORNAMENT' }), vr(bx + 35, y0 - hi * yScale, (hi - lo) * yScale, ink, 1.5, { label: 'Confidence interval' }), hr(bx + 27, y0 - hi * yScale, 16, ink, 1.5, { label: 'CI cap' }), hr(bx + 27, y0 - lo * yScale, 16, ink, 1.5, { label: 'CI cap' }), text(bx - 20, y0 + 6, 110, n, { size: 10, font: 'crimson', weight: 600, color: ink, align: 'center', wrap: false, role: 'CAPTION', label: 'Bar label' }), text(bx - 10, y0 - v * yScale - hi * 0 - 36 + 4, 90, v.toFixed(1), { size: 11, font: 'ibmPlexMono', weight: 600, color: ink, align: 'center', wrap: false, role: 'CAPTION', label: 'Bar value' })]; }), hr(fx + 30, y0, fw - 30, ink, 1, { label: 'Axis' }), figCap(fx, fy + fh + 4, fw, 'Figure 1.', 'Delayed recall (percent of words) by arm. Bars show means; whiskers show 95% confidence intervals.'));
      const tb = table(x2, 408, [{ w: 100, font: 'crimson', size: 10.5 }, { w: 60, font: 'ibmPlexMono', size: 9.5, align: 'right' }, { w: 70, font: 'ibmPlexMono', size: 9.5, align: 'right' }, { w: cw - 230, font: 'ibmPlexMono', size: 9.5, align: 'right' }], [['Sleep (min)', '422', '463', '+41'], ['Recall (%)', '41.0', '48.2', '+7.2'], ['Absences', '6.1', '5.4', '−11%'], ['Mood score', '3.4', '3.6', '+0.2']], { size: 10.5, font: 'crimson', color: ink, rule: hair, pad: 4, head: ['Table 1', 'Control', 'Later start', 'Difference'], headFont: 'ibmPlexMono', headSize: 7.5, headColor: accent, headRule: ink, label: 'Results table' });
      const q = obj(rect(M, 730, W - 2 * M, 130, tint, { label: 'Key finding panel', role: 'SIDEBAR' }), rect(M, 730, 5, 130, accent, { label: 'Panel bar', role: 'RULE' }), label(M + 22, 746, 300, 'Key finding', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .2, role: 'SIDEBAR' }), text(M + 22, 768, W - 2 * M - 44, 'A 50-minute delay lengthened sleep by 41 minutes and raised recall by 7.2 percent, with the largest gains among the shortest sleepers.', { size: 17, font: 'libreBaskerville', italic: true, color: ink, leading: 1.35, label: 'Pull quote', role: 'PULLQUOTE' }));
      return obj(G, strip(), flow[1].objs, chart, tb.objs, q, foot());
    }
    case 'SIDEBAR': {
      const sx = 460, sw = R - sx;
      const tx = typeset(blocks.slice(Math.max(0, blocks.length - 3)), [{ x: M, y: 90, w: 380, h: 480 }], body);
      void tx;
      const methods = obj(rect(sx, 90, sw, 420, tint, { label: 'Methods sidebar', role: 'SIDEBAR' }), rect(sx, 90, sw, 4, accent, { label: 'Sidebar rule', role: 'RULE' }), label(sx + 14, 106, sw - 28, 'Study design at a glance', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .1, transform: 'none', role: 'SIDEBAR' }), table(sx + 6, 128, [{ w: 76, font: 'ibmPlexMono', size: 8, color: soft }, { w: sw - 88, font: 'crimson', size: 11 }], [['Design', 'Cluster-randomised, 12 schools'], ['Sample', '1,842 students, ages 13 to 16'], ['Arms', 'Start 9:00 vs. start 8:10'], ['Duration', 'One school term, 12 weeks'], ['Measure', 'Actigraphy; 40-item recall'], ['Registered', 'Before enrolment'], ['Ethics', 'University committee']], { size: 11, font: 'crimson', color: ink, rule: hair, pad: 6, label: 'Methods sidebar', role: 'SIDEBAR' }).objs);
      const lx = M, ly = 560, lw = W - 2 * M, lh = 190;
      const wk = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; const px = (i: number) => lx + 50 + i * ((lw - 70) / 9); const py = (m: number) => ly + lh - 24 - (m - 400) / 80 * (lh - 54);
      const line = (arr: number[], color: string): TelaVectorObject => { const pts = arr.map((v, i) => [px(i), py(v)] as [number, number]); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0 || 1; return path(x0, y0, w, h, pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '), 'none', { stroke: color, strokeWidth: 2, open: true, origin: { x: x0, y: y0, w, h }, label: 'Series line', role: 'ORNAMENT' }); };
      const ctl = [421, 424, 420, 423, 422, 419, 424, 421, 423, 422], itv = [424, 440, 452, 458, 461, 463, 462, 464, 463, 463];
      const fig2 = obj(label(lx, ly - 6, 200, 'Figure 2', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .16 }), ...[400, 440, 480].flatMap(v => [hr(lx + 40, py(v), lw - 40, hair, .6, { label: 'Gridline' }), text(lx, py(v) - 6, 34, String(v), { size: 8.5, font: 'ibmPlexMono', color: soft, align: 'right', wrap: false, role: 'CAPTION', label: 'Axis value' })]), ...wk.map((w, i) => text(px(i) - 10, ly + lh - 18, 20, String(w), { size: 8.5, font: 'ibmPlexMono', color: soft, align: 'center', wrap: false, role: 'CAPTION', label: 'Axis week' })), line(ctl, mix(ink, .55)), line(itv, accent), circle(px(9), py(463), 4, accent, { label: 'End point' }), circle(px(9), py(422), 4, mix(ink, .55), { label: 'End point' }), text(px(9) - 120, py(463) - 20, 120, 'Later start', { size: 10, font: 'crimson', weight: 700, color: accent, align: 'right', wrap: false, role: 'CAPTION', label: 'Series label' }), text(px(9) - 120, py(422) + 6, 120, 'Control', { size: 10, font: 'crimson', weight: 700, color: mix(ink, .3), align: 'right', wrap: false, role: 'CAPTION', label: 'Series label' }), figCap(lx, ly + lh + 4, lw, 'Figure 2.', 'Mean nightly sleep (minutes) by week of term. The gap opens in week two, when the new timetable begins, and holds for the rest of the term.'));
      const fn = obj(hr(M, 842, 140, ink, .75, { label: 'Footnote rule' }), text(M, 852, R - M, '¹ Recall was scored by two blinded markers; inter-rater agreement was 0.96.  ² Sleep was measured by wrist actigraphy validated against polysomnography in adolescents.', { size: 9, font: 'crimson', color: soft, leading: 1.4, label: 'Footnote', role: 'FOOTNOTE' }));
      return obj(G, strip(), flow[2].objs, methods, fig2, fn, foot());
    }
    default: {
      const con = obj(text(M, 62, 300, '5  Conclusions', { size: 12, font: 'libreBaskerville', weight: 700, color: accent, wrap: false, label: 'Section heading', role: 'HEADLINE' }), typeset([RS.conclusion], [{ x: M, y: 84, w: cw, h: 130 }], body).objs);
      const ack = obj(text(M + cw + 24, 62, 300, 'Acknowledgments and funding', { size: 12, font: 'libreBaskerville', weight: 700, color: accent, wrap: false, label: 'Section heading', role: 'HEADLINE' }), typeset(['We thank the head teachers, students and families who took part. The trial was funded by the Ardale Institute. The funder had no role in design, analysis or reporting.', 'Author contributions: HP and LH designed the study; SB led analysis; KM supervised data collection. All authors approved the final text.'].map(t => ({ t })), [{ x: M + cw + 24, y: 84, w: cw, h: 190 }], { ...body, size: 11 }).objs);
      const refY = 220;
      const refs = typeset(RS.refs.map((t, i) => ({ t, marker: { t: `[${i + 1}]`, dx: -2, size: 10, font: 'ibmPlexMono' as const, color: accent, weight: 600, w: 30 }, indent: 30, after: 7 })), [{ x: M, y: refY + 30, w: W - 2 * M, h: 360 }], { size: 11, font: 'crimson', color: ink, leading: 1.4 });
      const refHead = obj(text(M, refY, 300, 'References', { size: 12, font: 'libreBaskerville', weight: 700, color: accent, wrap: false, label: 'Section heading', role: 'HEADLINE' }), hr(M, refY + 20, R - M, ink, 1, { label: 'References rule' }));
      const cite = obj(rect(M, 540, W - 2 * M, 130, tint, { label: 'How to cite panel', role: 'SIDEBAR' }), rect(M, 540, 5, 130, accent, { label: 'Panel bar', role: 'RULE' }), label(M + 22, 556, 300, 'How to cite', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .2, role: 'SIDEBAR' }), text(M + 22, 578, W - 2 * M - 44, 'Petrova H, Batra S, Haugen L, Mensah K. Later school start times, longer sleep and better recall in adolescents: a cluster-randomised trial. Research Brief. 2026;14(3):1–4. doi:10.0000/rb.2026.0314', { size: 12, font: 'ibmPlexMono', color: ink, leading: 1.55, label: 'Citation', role: 'BODY' }));
      const meta = obj(label(M, 700, 300, 'Article information', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .2 }), hr(M, 716, R - M, ink, 1), table(M, 724, [{ w: 130, font: 'ibmPlexMono', size: 8.5, color: soft }, { w: 180, font: 'crimson', size: 11 }, { w: 130, font: 'ibmPlexMono', size: 8.5, color: soft }, { w: 200, font: 'crimson', size: 11 }], [['Received', '14 May 2026', 'Corresponding', 'h.petrova@northbridge.example'], ['Accepted', '2 August 2026', 'Data', 'Available on request'], ['Published', '8 October 2026', 'Licence', 'CC BY 4.0']], { size: 11, font: 'crimson', color: ink, rule: hair, pad: 5, label: 'Article information' }).objs);
      const rel = obj(label(M, 860, 300, 'Related research briefs', { size: 8.5, font: 'ibmPlexMono', color: accent, weight: 600, tracking: .2 }), hr(M, 876, R - M, ink, 1), ...[['Sleep and screens before bed: a diary study of 900 teenagers', 'Okafor and Lindqvist, 2025'], ['Start times and school transport: costs and workarounds', 'Reyes and Wright, 2026'], ['Does a later start change absence? Pooled analysis of five trials', 'Batra et al., 2026']].flatMap(([t, a], i) => { const w = (W - 2 * M - 40) / 3, x = M + i * (w + 20); return [rect(x, 892, w, 120, tint, { label: 'Related card', role: 'SIDEBAR' }), rect(x, 892, w, 4, accent, { label: 'Card bar', role: 'RULE' }), text(x + 14, 908, w - 28, t, { size: 13, font: 'libreBaskerville', weight: 700, color: ink, leading: 1.25, role: 'SIDEBAR', label: 'Related title' }), text(x + 14, 992, w - 28, a, { size: 8.5, font: 'ibmPlexMono', color: soft, wrap: false, role: 'SIDEBAR', label: 'Related authors' })]; }));
      return obj(G, strip(), con, ack, refHead, refs.objs, cite, meta, rel, foot());
    }
  }
};

export const DESIGNS_C: Record<string, PublicationDesigner> = { 'art-review': review, 'art-profile': profile, 'art-newsletter': newsletter, 'art-research': research };
export const LESSONS_C: Record<string, DesignLesson> = {
  'art-review': { principle: 'A review earns trust by showing its verdict before its argument: one large score, a plain-spoken pros and cons, and the numbers a buyer needs to compare.', history: 'Consumer reviewing grew from the testing labs of Consumer Reports, founded in 1936, and the star-and-scorecard formats of gramophone, film and computer magazines. The yellow score block, pros-and-cons columns and spec strip are the grammar of 1990s games and hi-fi magazines, kept alive because they let a reader decide in ten seconds and read on for ten minutes.', tryThis: 'Change the score and notice what else must change: the label band, the sub-score bars and the headline tone.', interestTag: 'Review design', related: ['Product reviews', 'Scorecards', 'Consumer journalism'] },
  'art-profile': { principle: 'A profile is a portrait first and a biography second: the image carries the person, the fact box carries the data, and the prose is free to carry character.', history: 'The magazine profile was perfected at the New Yorker in the 1930s and by Gay Talese’s “Frank Sinatra Has a Cold” in 1966, which proved reporting could read like fiction. Visual editors added the layered portrait and the fact box so a reader could meet the subject at a glance before committing to the story.', tryThis: 'Move the fact box off the portrait and see how much weight the photograph loses.', interestTag: 'Profile writing', related: ['Portraiture', 'Fact boxes', 'Cormorant'] },
  'art-newsletter': { principle: 'An email essay is one column, one voice and one action: type sized for a phone, a single image, and a footer that obeys the law.', history: 'Email newsletters descend from the mailed letter and the nineteenth-century broadside; the modern single-author letter took off on platforms such as Substack and Buttondown from 2017. Their design is deliberately plain because clients strip styling, and because the writer’s voice is the product.', tryThis: 'Delete the hero image and read the first paragraph aloud. If it stands alone, the design is doing its job.', interestTag: 'Newsletter design', related: ['Email design', 'Substack', 'Single-column layout'] },
  'art-research': { principle: 'A research brief puts the answer first: abstract and key points up top, then the paper in the order a sceptic will check it.', history: 'The structured abstract and IMRaD layout (introduction, methods, results and discussion) became the standard for scientific papers in the 1970s, driven by journals such as the British Medical Journal. Open-access briefs keep the structure but add key points and plain figures for readers who will not read the full paper.', tryThis: 'Rewrite the first key point as a headline for a general audience, then check the abstract supports every word.', interestTag: 'Scientific communication', related: ['IMRaD', 'Abstracts', 'Figures'] },
};
