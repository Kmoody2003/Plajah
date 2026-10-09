// magazinesA — MAGAZINE systems 1–6 (see magazines.ts for the registry and docs/tela/PUBLICATION_DESIGN_BRIEF.md).
//
// Each title is its own publication system: a trim size, a Grid constant, a type
// stack, a masthead idea, and a composition for all twelve pages of an issue
// (cover · contents | editor’s letter · department | ad · feature opener | feature
// body · feature body | interview · photo essay | colophon · back cover). Pages
// are numbered from the cover (p.1, a recto); pageIndex 1 is p.2, the verso of the
// first spread. Art that touches the trim runs 0.125in (12 px) into the bleed;
// live type stays inside the 0.25in safe area.
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import {
  BL, SAFE, geo, spanOf, ground, photo, rule, vrule, caption, label, runHead, flow, balance, colFrames, pullQuote, sidebar, barcodeBox, adSlot, fade, slug, warnFlow, bottomOf, barChart, lineChart, sparkBars,
  rect, hr, vr, text, below, columns, mix, alpha, orn, type Grid, type Obj,
} from './magazineKit';
import { circle, ellipse, path, line } from '../../templateKit';

// ═════════════════════════════════════════════════════════════════════════════
// 1 · VESPER — fashion monthly. Didone masthead, huge crops, tight captions.
//     Trim 8.375 × 10.875 in (804 × 1044 px), perfect bound.
// ═════════════════════════════════════════════════════════════════════════════
const VG: Grid = { cols: 6, gutter: 14, base: 14, top: 70, bottom: 74, inner: 64, outer: 46 };
const V_PARAS = [
  'The atelier occupies the top floor of a former glove factory, and in the afternoon the light comes through the north windows as flat and even as a paper lantern. Amara Diallo likes it that way. “Colour lies under shadow,” she says, pinning a sleeve to a form without looking at it. “Light like this tells the truth about a seam.”',
  'She trained in Dakar and Antwerp, worked for a house she declines to name, and left at thirty-one with a sewing machine, a lease and a rule: no garment leaves the room until it can be worn in the rain, climbed into a taxi and slept on. The rule has cost her two buyers and, she estimates, a great many sleepless Februaries. It has also given her something nobody else on the schedule can claim, which is a customer who comes back for repairs.',
  'This season’s collection runs to thirty-eight looks and almost no embellishment. There is a wool-crepe coat with a single, extraordinary shoulder; a column dress whose entire argument is a bias cut; a trouser that sits exactly where a trouser ought to sit and has therefore, in this climate, become radical. Buyers call it quiet. Diallo calls it finished.',
  'What does restraint cost? More than excess, as it happens. A heavily decorated garment forgives its maker; a plain one does not. Every dart is visible to the person who wears it, and there are people, Diallo among them, who can feel a millimetre of error through a lining. “Cutting less is cutting harder,” she says. “You cannot hide in a white shirt.”',
  'The business model is as unfashionable as the clothes. Production is capped, waiting lists are real, and a small repair studio on the ground floor will rework any piece, for life, at cost. The studio loses money. The accountant, a brisk man named Ilya who has worked with Diallo since the beginning, has stopped suggesting that she close it.',
  'On the last afternoon of our visit a woman arrives carrying a camel coat bought in 2011, its lining worn to lace. Diallo turns it inside out, runs a thumb along the hem, and smiles for the first time all day. “Ah,” she says. “She is still good.” She is talking about the coat, though it is not entirely clear.',
  'Ask her what comes next and she shrugs, which in this building is a form of planning. Autumn will be a little longer in the body and a little shorter in the sleeve. There will be fewer buttons. There will be, for the first time, a coat with no lining at all, which she describes as “the bravest thing I have ever sewn, and the easiest to wear.”',
  'Not everyone is persuaded. A buyer for one of the large department stores, speaking on condition that her store not be named, calls the collection “beautiful and impossible to merchandise.” There is no obvious hook, no logo to photograph, no colour story for the window. “It sells to people who already know,” she says. “Which is a small, loyal market, and I would kill for it.”',
  'That loyalty is the business. Diallo can name, from memory, the first forty customers she ever had, and tell you what each of them bought and when it came back for alteration. A tall woman from the university who wears the trousers to teach. A retired judge who commissioned a single overcoat in 2016 and has had it let out twice. “People ask me about growth,” she says. “I tell them the coat is growing. Slowly, with the judge.”',
  'She is aware of the contradiction. A designer who sells less so that her clothes last longer is, in the industry’s terms, a poor student of the form. But she points out that there are other terms. Her repair book now runs to nine hundred entries. Her atelier employs eleven people on full contracts with holidays. The glove factory’s landlord, a man not given to sentiment, has twice lowered the rent.',
  'Outside, the glove factory’s old loading dock has become a smokers’ corner for three different ateliers, and the talk there is of fabric mills closing and rents rising. Diallo does not join in. She is upstairs with the north light, taking a seam apart for the fourth time, listening to a radio play she has heard before.',
  'At six o’clock the light goes blue and then grey, and the cutters put down their shears one by one. Diallo stays, as she always does, to hang the day’s work on the long rail by the north windows. Thirty-eight looks, each facing the same direction like a congregation. She stands back, tilts her head, and moves one sleeve a quarter of an inch. “There,” she says, to nobody. “Now it is quiet.”',
];
const V_QA = [
  ['What did you want to be?', 'A tailor. I know that is not an answer a person gives at thirty-four, but it is the honest one. I wanted to make one thing very well, and then I wanted to make the next.'],
  ['Does a client ever argue with you about the cut?', 'Constantly, and I love it. People think they want what they have seen. What they want is to be seen. The cut is how we get there.'],
  ['What is the most overrated idea in fashion?', 'Novelty. Almost nothing is new. A good sleeve was a good sleeve in 1938.'],
  ['And the most underrated?', 'Mending. A repaired garment carries its own history. It is the opposite of disposable, and it is beautiful.'],
  ['What do you wear to work?', 'The same navy trousers, every day, in three slightly different weights. I am not interested in being photographed. I am interested in being comfortable on a ladder.'],
  ['Who taught you to hem?', 'My mother, on a kitchen table, with a pencil in her mouth. She said a hem is the last thing anyone sees and the first thing anyone feels. I have never found a reason to disagree.'],
  ['Do you ever turn a job down?', 'Every week. If a person wants a suit for a photograph and not for a life, I say no and I send them to a very good shop two streets over. I am not offended. They are not offended. It is efficient.'],
  ['What would you say to someone buying their first good coat?', 'Put your hands in the pockets. Raise your arms. Sit down in it. If it complains, it is the wrong coat, whatever the label says.'],
];

const vesper: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, VG);
  const D = 'bodoni' as const, S = 'karla' as const;
  const dark = mix(ink, .16), body = { font: S, size: 10, lead: 14, color: ink, weight: 400, indent: 14, role: 'BODY' as const };
  const head = (section: string, color = ink) => runHead(G, { title: 'Vesper', section, color, font: S, where: 'bottom', rule: alpha(color, .35), accent });
  const folioTop = (section: string, color = ink) => runHead(G, { title: 'Vesper  ·  September 2026', section, color, font: S, where: 'top', accent, tracking: .22 });

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, dark)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: mix(ink, .24), caption: 'Cover photograph · Amara Diallo, wool-crepe coat, north light', label: 'Cover photograph' }));
      out.push(rect(-BL, H * .5, W + BL * 2, H * .5 + BL, ink, { gradient: fade(90, ink, 0, .82), label: 'Legibility gradient' }));
      out.push(rect(-BL, -BL, W + BL * 2, 240, ink, { gradient: fade(90, ink, .6, 0), label: 'Masthead gradient' }));
      out.push(hr(46, 44, 712, paper, .75, { label: 'Masthead rule' }));
      out.push(text(26, 6, 752, 'VESPER', { size: 190, font: D, weight: 600, color: paper, align: 'center', wrap: false, tracking: -.012, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(hr(46, 224, 712, paper, .75, { label: 'Masthead rule' }));
      out.push(slug(46, 232, 240, 'The fashion monthly', S, paper));
      out.push(slug(282, 232, 240, 'September 2026  ·  No. 214', S, paper, { align: 'center' }));
      out.push(slug(518, 232, 240, 'The autumn tailoring issue', S, paper, { align: 'right' }));
      // principal cover line, bottom-left
      out.push(text(46, 618, 360, 'COVER STORY', { size: 8, font: S, weight: 800, color: secondary, tracking: .28, wrap: false, label: 'Cover line kicker', role: 'KICKER' }));
      const big = text(42, 638, 560, 'The Quiet\nRevolution', { size: 112, font: D, weight: 500, italic: true, color: paper, leading: .86, tracking: -.01, label: 'Cover line', role: 'COVER_LINE' });
      out.push(big);
      out.push(text(48, below(big, 10), 380, 'Amara Diallo on the radical act of cutting less, and the coat she will not make again.', { size: 12.5, font: S, weight: 400, color: paper, leading: 1.45, label: 'Cover line deck', role: 'COVER_LINE' }));
      // right-hand secondary lines
      const lines: Array<[string, string, string]> = [['Coats worth owning', 'Fourteen, tested in rain', '112'], ['Inside the ateliers', 'Paris, after the strike', '140'], ['Skin', 'Why nothing is the new something', '96']];
      lines.forEach(([t, d, p], i) => {
        const y = 650 + i * 62;
        out.push(text(556, y, 202, t, { size: 19, font: D, weight: 500, italic: true, color: paper, align: 'right', wrap: false, label: 'Cover line', role: 'COVER_LINE' }));
        out.push(text(556, y + 24, 202, `${d}  ${p}`, { size: 8, font: S, weight: 500, color: alpha(paper, .8), align: 'right', tracking: .06, wrap: false, label: 'Cover line page', role: 'COVER_LINE' }));
      });
      out.push(...barcodeBox(626, 934, 132, 64, { plate: paper, ink: ink, seed, code: '0 74470 02140 9', note: 'VESPER 09 / 2026' }));
      out.push(text(46, 962, 260, '$12.00 US  ·  $16.00 CAN  ·  £9.50 UK', { size: 8, font: S, weight: 600, color: paper, tracking: .14, wrap: false, label: 'Price line', role: 'PRICE' }));
      out.push(text(46, 978, 300, 'vespermag.example  ·  Display until 30 October', { size: 8, font: S, weight: 400, color: alpha(paper, .75), tracking: .08, wrap: false, label: 'Issue line', role: 'LABEL' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      const c1 = spanOf(G.cols, 0, 1), c2 = spanOf(G.cols, 2, 5);
      out.push(...photo(ctx, 0, 0, c1.x + c1.w, 760, { tone: 'light', caption: 'Look 14, wool crepe and horn  ·  Ayo Bello', label: 'Contents photograph' }));
      out.push(...caption(G.x, 770, c1.w, 'Look fourteen: wool crepe, a single shoulder, nothing else.', 'Photograph Ayo Bello', { font: S, color: ink, transform: 'none', size: 8, weight: 500 }));
      out.push(text(c2.x, G.y - 6, c2.w, 'In this\nissue', { size: 76, font: D, weight: 500, italic: true, color: ink, leading: .88, label: 'Contents title', role: 'HEADLINE' }));
      const groups: Array<[string, Array<[string, string, string]>]> = [
        ['Features', [['84', 'The Art of Cutting Less', 'Amara Diallo, her glove-factory atelier and a very long waiting list.'], ['112', 'Fourteen Coats', 'Tested in rain, on trains, over three weeks of an unforgiving autumn.'], ['140', 'After the Strike', 'Inside the Paris ateliers that stopped, and then started again.']]],
        ['Beauty & Culture', [['96', 'Nothing Is the New Something', 'A dermatologist, a chemist and the case for fewer steps.'], ['124', 'Mending as Method', 'The repair studios keeping good clothes in service.']]],
        ['Front of book', [['16', 'The Edit', 'Eight things to wear before the weather turns.'], ['22', 'Contributors', 'Who made this issue, and what they are carrying.']]],
      ];
      let y = 232;
      groups.forEach(([g, items]) => {
        out.push(hr(c2.x, y, c2.w, ink, .75, { label: 'Contents group rule' }));
        out.push(label(c2.x, y + 8, 200, g, S, accent, { size: 7.5, tracking: .24 }));
        y += 30;
        items.forEach(([pg, t, d]) => {
          out.push(text(c2.x, y - 2, 50, pg, { size: 24, font: D, weight: 500, italic: true, color: accent, wrap: false, label: 'Contents folio', role: 'FOLIO' }));
          const tt = text(c2.x + 56, y, c2.w - 56, t, { size: 17, font: D, weight: 500, color: ink, wrap: true, label: 'Contents title', role: 'HEADLINE' });
          const dd = text(c2.x + 56, below(tt, 3), c2.w - 70, d, { size: 8.5, font: S, color: alpha(ink, .78), leading: 1.4, label: 'Contents description', role: 'BODY' });
          out.push(tt, dd); y = below(dd, 17);
        });
        y += 10;
      });
      out.push(...folioTop('Contents'));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      const wide = spanOf(G.cols, 1, 5);
      out.push(label(G.x, G.y - 4, 260, 'Editor’s letter', S, accent, { size: 7.5, tracking: .26 }));
      const hd = text(wide.x, G.y + 18, wide.w, 'Dear reader, the best clothes are the ones you stop noticing.', { size: 46, font: D, weight: 500, italic: true, color: ink, leading: 1.02, label: 'Letter headline', role: 'HEADLINE' });
      out.push(hd);
      out.push(...photo(ctx, G.x, below(hd, 26), G.cols[0].w, 132, { tone: 'light', caption: 'Editor', label: 'Editor portrait' }));
      out.push(...caption(G.x, below(hd, 26) + 140, G.cols[0].w, 'Noor Haddad, editor-in-chief, in her own coat.', 'Photograph Ayo Bello', { font: S, color: ink, size: 7.5, transform: 'none', weight: 500 }));
      const cols2 = columns(wide.x, wide.w, 2, 18);
      const letter = 'There is a coat in this issue that I have worn every autumn for nine years. It is not a famous coat. It has no label I could tell you about at a dinner. But the shoulder sits where my shoulder sits, and the pockets are deep enough for the things I actually carry, and when I put it on in October something in me settles. That is all I want from clothing. It is more than most of it delivers.\nThis month we set out to find the people who make that feeling on purpose. Céleste Marchand spent a week in Amara Diallo’s north-lit atelier, watching a woman take a seam apart for the fourth time. Ayo Bello photographed the result. The pages that follow are the quietest we have ever run, and I am more proud of them than of anything else we have printed.\nWe also tested fourteen coats in the rain. Not in a studio, in the rain, on the 7:40, with a bag and an umbrella and a child. Several did not survive the experience with their dignity. The ones that did are on page 112.\nThank you, as ever, for reading slowly.';
      const r = balance(letter, colFrames(cols2, below(hd, 26), below(hd, 26) + 380), { ...body, size: 10.5, lead: 15 }, { dropCap: { lines: 3, font: D, color: accent, weight: 600 } });
      warnFlow('vesper letter', r); out.push(...r.objs);
      out.push(text(cols2[1].x, Math.max(...r.objs.map(o => o.y + o.h)) + 14, cols2[1].w, 'Noor Haddad', { size: 24, font: D, weight: 500, italic: true, color: ink, wrap: false, label: 'Signature', role: 'BYLINE' }));
      // contributors
      const cy = 640;
      out.push(hr(G.x, cy, G.w, ink, .75, { label: 'Contributors rule' }));
      out.push(label(G.x, cy + 10, 200, 'Contributors', S, accent, { size: 7.5, tracking: .26 }));
      const who: Array<[string, string]> = [['Céleste Marchand', 'writes about cloth and the people who cut it. This issue: Diallo.'], ['Ayo Bello', 'photographs in natural light only. Shot the cover in forty minutes.'], ['Noor Haddad', 'styled every look from the studio’s own rails. Owns four navy coats.'], ['Ilya Wren', 'tailor, 71. Interviewed on page 128 while pinning a hem.'], ['Mei Tanaka', 'illustrated the coat diagrams from memory, on a train.'], ['Jonas Reyes', 'reported from Paris during a strike, mostly on foot.']];
      const ccols = columns(G.x, G.w, 3, 14);
      who.forEach(([n, d], i) => {
        const cx = ccols[i % 3].x, yy = cy + 38 + Math.floor(i / 3) * 112;
        out.push(...photo(ctx, cx, yy, 54, 54, { tone: 'light', rx: 27, silent: true, label: 'Contributor portrait' }));
        out.push(text(cx + 64, yy + 2, ccols[0].w - 64, n, { size: 14, font: D, weight: 500, italic: true, color: ink, label: 'Contributor name', role: 'BYLINE' }));
        out.push(text(cx + 64, yy + 22, ccols[0].w - 64, d, { size: 8, font: S, color: alpha(ink, .78), leading: 1.4, label: 'Contributor note', role: 'CAPTION' }));
      });
      out.push(...folioTop('Editor’s letter'));
      out.push(...head('Editor’s letter'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, G.y - 10, 470, 'The Edit', { size: 82, font: D, weight: 500, italic: true, color: ink, wrap: false, label: 'Department title', role: 'HEADLINE' }));
      out.push(text(G.x + 480, G.y + 20, G.w - 480, 'Eight things to wear before the weather turns, chosen by people who have to wear them.', { size: 10, font: S, color: ink, leading: 1.45, label: 'Department deck', role: 'DECK' }));
      out.push(label(G.x, G.y + 82, 200, 'Fashion  /  Front of book', S, accent, { size: 7.5, tracking: .24 }));
      out.push(hr(G.x, G.y + 100, G.w, ink, .75, { label: 'Department rule' }));
      const items: Array<[string, string, string]> = [['Silk faille trench', 'Maison Orel', '$2,890'], ['Horn-button cardigan', 'Studio Hollis', '$640'], ['Pleated wool trouser', 'Atelier Nine', '$480'], ['Calf-leather loafer', 'Kerrin & Dunn', '$710'], ['Cashmere scarf, undyed', 'North Isle', '$260'], ['Felted pocket square', 'Wren & Co.', '$85']];
      const tcols = columns(G.x, G.w, 3, 18); const th = 292;
      items.forEach(([n, b, pr], i) => {
        const cx = tcols[i % 3].x, cy = G.y + 124 + Math.floor(i / 3) * (th + 72);
        out.push(...photo(ctx, cx, cy, tcols[0].w, th, { tone: 'light', caption: `Item ${i + 1}`, label: 'Product photograph' }));
        out.push(text(cx, cy + th + 8, tcols[0].w - 54, n, { size: 13, font: D, weight: 500, italic: true, color: ink, label: 'Item name', role: 'CAPTION' }));
        out.push(text(cx + tcols[0].w - 60, cy + th + 11, 60, pr, { size: 8.5, font: S, weight: 700, color: accent, align: 'right', wrap: false, label: 'Price', role: 'PRICE' }));
        out.push(label(cx, cy + th + 32, tcols[0].w, b, S, alpha(ink, .7), { size: 7, tracking: .2, name: 'Brand' }));
      });
      out.push(...folioTop('The Edit'));
      out.push(...head('The Edit'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(0, 0, W, H, { fill: mix(ink, .1), ink: paper, accent: alpha(paper, .6), font: S, kind: 'Advertisement  ·  full page', spec: 'Trim 8.375 × 10.875 in  ·  bleed 0.125 in  ·  live area 7.875 × 10.375 in  ·  300 dpi CMYK', bleed: true, ctx, live: SAFE }));
      out.push(slug(G.x, 16, 200, 'Advertisement', S, alpha(paper, .6), { size: 7 }));
      out.push(text(G.right - 40, H - 40, 40, String(G.pageNo), { size: 8, font: S, weight: 700, color: alpha(paper, .7), align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, dark)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: mix(ink, .22), caption: 'Opening photograph · Diallo at the cutting table, north light', label: 'Feature photograph' }));
      out.push(rect(-BL, H * .42, W + BL * 2, H * .58 + BL, ink, { gradient: fade(90, ink, 0, .88), label: 'Legibility gradient' }));
      out.push(label(G.x, 566, 300, 'Portrait  ·  Fashion', S, secondary, { size: 8, tracking: .28, role: 'KICKER', name: 'Feature kicker' }));
      const t = text(G.x - 4, 578, 740, 'The Art of\nCutting Less', { size: 124, font: D, weight: 500, color: paper, leading: .88, tracking: -.012, label: 'Feature headline', role: 'HEADLINE' });
      out.push(t);
      const d = text(G.x, below(t, 38), 420, 'Amara Diallo makes four hundred garments a year and would like you to keep one for thirty.', { size: 18, font: D, weight: 400, italic: true, color: paper, leading: 1.3, label: 'Feature deck', role: 'DECK' });
      out.push(d);
      out.push(text(G.x, below(d, 14), 440, 'Words by Céleste Marchand  ·  Photographs by Ayo Bello  ·  Styling by Noor Haddad', { size: 8, font: S, weight: 600, color: alpha(paper, .85), tracking: .12, transform: 'uppercase', leading: 1.6, label: 'Byline', role: 'BYLINE' }));
      out.push(text(G.right - 40, H - 40, 40, String(G.pageNo), { size: 8, font: S, weight: 700, color: alpha(paper, .8), wrap: false, label: 'Folio', role: 'FOLIO' }));
      out.push(...caption(G.right - 180, 56, 180, 'Diallo in the atelier, 4 p.m. Coat: her own.', 'Photograph Ayo Bello', { font: S, color: paper, creditColor: alpha(paper, .7), size: 7.5, align: 'right', transform: 'none', weight: 500 }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      const first = pageIndex === 6;
      if (first) {
        // p.7 — deck, byline, three wide columns with a drop cap, inset photo in the last.
        const wide = spanOf(G.cols, 0, 4);
        out.push(label(G.x, G.y - 4, 300, 'Portrait  ·  The Art of Cutting Less', S, accent, { size: 7.5, tracking: .24 }));
        const deck = text(wide.x, G.y + 18, wide.w, 'She trained in Dakar and Antwerp, left a house she declines to name, and set one rule: nothing leaves the room until it can be slept in.', { size: 25, font: D, weight: 400, italic: true, color: ink, leading: 1.18, label: 'Deck', role: 'DECK' });
        out.push(deck, text(wide.x, below(deck, 14), wide.w, 'WORDS  CÉLESTE MARCHAND      PHOTOGRAPHS  AYO BELLO', { size: 7.5, font: S, weight: 700, color: ink, tracking: .2, wrap: false, label: 'Byline', role: 'BYLINE' }));
        const top = below(deck, 52);
        out.push(hr(G.x, top - 14, G.w, ink, .75, { label: 'Body rule' }));
        const c3 = columns(G.x, G.w, 3, 18);
        const photoH = 250;
        const frames = [{ x: c3[0].x, y: top, w: c3[0].w, b: G.bottom - 14 }, { x: c3[1].x, y: top, w: c3[1].w, b: G.bottom - 14 }, { x: c3[2].x, y: top + photoH + 60, w: c3[2].w, b: G.bottom - 14 }];
        out.push(...photo(ctx, c3[2].x, top, c3[2].w, photoH, { tone: 'light', caption: 'Inset photograph', label: 'Inset photograph' }));
        out.push(...caption(c3[2].x, top + photoH + 8, c3[2].w, 'The north windows, where every seam is judged. Diallo takes the light as a collaborator.', 'Photograph Ayo Bello', { font: S, color: ink, size: 7.5, transform: 'none', weight: 500 }));
        const r = balance(V_PARAS.slice(0, 7).join('\n'), frames, body, { dropCap: { lines: 3, font: D, color: accent, weight: 600 } });
        warnFlow('vesper p7', r); out.push(...r.objs);
      } else {
        // p.8 — big pull quote, two columns + sidebar, landscape strip.
        const c = G.cols;
        out.push(...pullQuote(c[0].x, G.y - 4, spanOf(c, 0, 4).w, '“Cutting less is cutting harder. You cannot hide in a white shirt.”', 'Amara Diallo', { font: D, size: 46, italic: true, weight: 400, color: ink, leading: 1.08, rule: 'top', ruleColor: accent, ruleWeight: 2, attribFont: S, pad: 14 }));
        const top = 296;
        const a = spanOf(c, 0, 1), b = spanOf(c, 2, 3), s = spanOf(c, 4, 5);
        const strip = 176;
        const r = balance(V_PARAS.slice(7).join('\n'), [{ x: a.x, y: top, w: a.w, b: G.bottom - strip - 56 }, { x: b.x, y: top, w: b.w, b: G.bottom - strip - 56 }], body);
        warnFlow('vesper p8', r); out.push(...r.objs);
        out.push(...sidebar(s.x, top, s.w, 'Diallo’s five rules', ['Wear it in the rain before you sell it.', 'One seam, one maker, one initial in the hem.', 'Never cut a lining you would not show a stranger.', 'Repairs are free for life, or the garment was not finished.', 'Say no to the third button.'], { fill: mix(secondary, .62), titleFont: D, titleColor: ink, bodyFont: S, bodyColor: ink, numbered: true, accent, titleSize: 15, size: 9.5, lead: 13.5, pad: 14, rule: ink }).map(o => o.kind === 'TEXT' && o.objectLabel === 'Sidebar title' ? { ...o, textTransform: 'none' as const, fontStyle: 'italic' as const, letterSpacing: 0 } : o));
        out.push(...photo(ctx, G.x, G.bottom - strip - 30, G.w, strip, { tone: 'light', caption: 'Landscape inset  ·  the ground-floor repair studio', label: 'Inset photograph' }));
        out.push(...caption(G.x, G.bottom - 24, G.w, 'The repair studio, ground floor: forty-one garments waiting, one tailor, a very good radio.', 'Photograph Ayo Bello', { font: S, color: ink, size: 7.5, transform: 'none', weight: 500 }));
      }
      out.push(...folioTop('The Art of Cutting Less'));
      out.push(...head(first ? 'Portrait' : 'Portrait  ·  continued'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      const left = spanOf(G.cols, 0, 2), right = spanOf(G.cols, 3, 5);
      out.push(...photo(ctx, 0, 0, left.x + left.w, 560, { tone: 'light', caption: 'Ilya Wren, tailor, at the pressing table', label: 'Interview portrait' }));
      out.push(...caption(G.x, 570, left.w, 'Ilya Wren, 71, has pinned the hems of three generations of this city’s best-dressed people.', 'Photograph Ayo Bello', { font: S, color: ink, size: 7.5, transform: 'none', weight: 500 }));
      out.push(label(right.x, G.y - 4, right.w, 'In conversation', S, accent, { size: 7.5, tracking: .26 }));
      const t = text(right.x, G.y + 14, right.w, 'Ilya Wren on hems, honesty and not being photographed.', { size: 34, font: D, weight: 500, italic: true, color: ink, leading: 1.04, label: 'Interview headline', role: 'HEADLINE' });
      out.push(t);
      const dk = text(right.x, below(t, 12), right.w, 'Interviewed by Céleste Marchand', { size: 7.5, font: S, weight: 700, color: ink, tracking: .2, transform: 'uppercase', wrap: false, label: 'Byline', role: 'BYLINE' });
      out.push(dk);
      let y = below(dk, 24);
      V_QA.forEach(([q, a], i) => {
        const qq = text(right.x, y, right.w, q, { size: 10, font: S, weight: 800, color: accent, leading: 1.35, label: 'Question', role: 'KICKER' });
        const aa = text(right.x, below(qq, 4), right.w, a, { size: 10, font: S, color: ink, leading: 1.4, label: 'Answer', role: 'BODY' });
        if (below(aa, 0) > G.bottom - 8) return;
        out.push(qq, aa); y = below(aa, 16);
        if (i === 1) { const pq = pullQuote(right.x, y, right.w, '“A good sleeve was a good sleeve in 1938.”', null, { font: D, size: 24, italic: true, color: ink, rule: 'both', ruleColor: ink, ruleWeight: .75, leading: 1.12, pad: 8 }); out.push(...pq); y = Math.max(...pq.map(o => o.y + o.h)) + 20; }
      });
      out.push(...folioTop('In conversation'));
      out.push(...head('In conversation'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      const big = spanOf(G.cols, 0, 3), sm = spanOf(G.cols, 4, 5);
      out.push(...photo(ctx, 0, 0, big.x + big.w, 700, { tone: 'light', caption: '01  ·  Rack, east wall', label: 'Essay photograph 1' }));
      out.push(...photo(ctx, sm.x, 0, sm.w, 330, { tone: 'light', caption: '02', label: 'Essay photograph 2' }));
      out.push(...photo(ctx, sm.x, 344, sm.w, 356, { tone: 'light', caption: '03', label: 'Essay photograph 3' }));
      out.push(...caption(sm.x, 708, sm.w, '01–03  Looks 9, 14 and 22, photographed against the atelier’s unplastered north wall.', 'Photographs Ayo Bello', { font: S, color: ink, size: 7.5, transform: 'none', weight: 500 }));
      out.push(text(G.x, 744, 560, 'Look\nagain', { size: 112, font: D, weight: 500, italic: true, color: ink, leading: .84, tracking: -.012, label: 'Essay headline', role: 'HEADLINE' }));
      out.push(text(sm.x, 800, sm.w, 'Eight frames, shot in one afternoon, for people who say they do not notice clothes.', { size: 11, font: S, color: ink, leading: 1.45, label: 'Essay intro', role: 'DECK' }));
      out.push(...folioTop('Photo essay'));
      out.push(...head('Photo essay'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, G.y - 8, 340, 'VESPER', { size: 70, font: D, weight: 600, color: ink, wrap: false, tracking: -.01, label: 'Colophon masthead', role: 'COVER_TITLE' }));
      out.push(label(G.x, G.y + 72, 400, 'The fashion monthly  ·  Masthead & credits', S, accent, { size: 7.5, tracking: .24 }));
      out.push(hr(G.x, G.y + 90, G.w, ink, .75, { label: 'Colophon rule' }));
      const people: Array<[string, Array<[string, string]>]> = [
        ['Editorial', [['Editor-in-chief', 'Noor Haddad'], ['Features editor', 'Céleste Marchand'], ['Fashion director', 'Mei Tanaka'], ['Beauty editor', 'Imogen Park'], ['Copy chief', 'Tobias Wren']]],
        ['Art & photography', [['Creative director', 'Ayo Bello'], ['Art director', 'Lena Okafor'], ['Photo editor', 'Rashid Aziz'], ['Designer', 'Pilar Duarte'], ['Retouching', 'Studio Ninety']]],
        ['Business', [['Publisher', 'Daniel Achebe'], ['Advertising', 'Sofia Lindgren'], ['Circulation', 'Marcus Teller'], ['Subscriptions', 'Rhea Kapoor'], ['Production', 'Hollis Grange']]],
      ];
      const cc = columns(G.x, G.w, 3, 22);
      people.forEach(([h, rows], i) => {
        let y = G.y + 112;
        out.push(label(cc[i].x, y, cc[i].w, h, S, ink, { size: 7.5, tracking: .24 }));
        y += 22;
        rows.forEach(([role, name]) => { out.push(text(cc[i].x, y, cc[i].w, role, { size: 7.5, font: S, weight: 500, color: alpha(ink, .65), tracking: .12, transform: 'uppercase', wrap: false, label: 'Credit role', role: 'CAPTION' }), text(cc[i].x, y + 11, cc[i].w, name, { size: 15, font: D, italic: true, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' })); y += 46; });
      });
      const ly = 640;
      out.push(hr(G.x, ly, G.w, ink, .75, { label: 'Colophon rule' }));
      const blocks: Array<[string, string]> = [['Subscribe', 'Twelve issues, $96 a year. vespermag.example/subscribe or call 1 800 555 0142. Back issues $14 including postage.'], ['Write to us', 'Letters may be edited for length. Vesper, 410 Glove Factory Row, Suite 6, Brooklyn NY 11222, letters@vespermag.example.'], ['Advertising', 'Rate card and closing dates at vespermag.example/advertise. Full page 8.375 × 10.875 in plus 0.125 in bleed.'], ['Rights', 'Vesper is published monthly. All contents © 2026 Vesper Media LLC. Reproduction without permission is prohibited. Printed in the USA on FSC-certified paper.']];
      const bc = columns(G.x, G.w, 2, 40);
      blocks.forEach(([h, t], i) => {
        const x = bc[i % 2].x, y = ly + 24 + Math.floor(i / 2) * 110;
        out.push(label(x, y, bc[0].w, h, S, accent, { size: 7.5, tracking: .24 }), text(x, y + 16, bc[0].w, t, { size: 9, font: S, color: ink, leading: 1.5, label: 'Colophon text', role: 'BODY' }));
      });
      out.push(...barcodeBox(G.right - 132, G.bottom - 70, 132, 64, { plate: paper, ink, seed, code: 'ISSN 0042-2214', note: 'VOL. XIX  NO. 9' }).map(o => o));
      out.push(...folioTop('Masthead'));
      out.push(...head('Masthead'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, ink)];
      out.push(...adSlot(0, 0, W, H - 96, { fill: mix(ink, .18), ink: paper, accent: alpha(paper, .5), font: S, kind: 'Back cover advertisement', spec: 'Cover 4  ·  trim 8.375 × 10.875 in  ·  bleed 0.125 in  ·  live area 7.875 × 10.375 in', bleed: true, ctx, live: SAFE }));
      out.push(rect(-BL, H - 96, W + BL * 2, 96 + BL, paper, { label: 'Next-issue strap' }));
      out.push(label(46, H - 76, 200, 'Next month', S, accent, { size: 7.5, tracking: .28 }));
      out.push(text(46, H - 62, 520, 'The Collections Issue: forty-two looks.', { size: 24, font: D, italic: true, weight: 500, color: ink, wrap: false, label: 'Next-issue line', role: 'COVER_LINE' }));
      out.push(text(560, H - 70, 198, 'VESPER', { size: 34, font: D, weight: 600, color: ink, align: 'right', wrap: false, label: 'Masthead, small', role: 'COVER_TITLE' }));
      out.push(slug(560, H - 32, 198, 'On sale 22 September', S, alpha(ink, .7), { align: 'right' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 2 · VECTOR — technology & science review. Grotesk + mono, figures, data callouts.
//     Trim 8.5 × 11 in (816 × 1056 px), perfect bound. 12-column grid, 12 px baseline.
// ═════════════════════════════════════════════════════════════════════════════
const TG: Grid = { cols: 12, gutter: 12, base: 12, top: 72, bottom: 72, inner: 60, outer: 44 };
const T_PARAS = [
  'Every phone, car and cloud server contains a surface carved in light. The carving happens in a room cleaner than an operating theatre, inside a machine the size of a bus, and it has one job: to draw lines on silicon thinner than a virus. For fifty years the industry has made those lines smaller by a steady ratio. That ratio is now running into physics.',
  'The trouble is wavelength. Light cannot draw a feature much smaller than half its own wavelength, and the light that served the industry for two decades, deep ultraviolet at 193 nanometres, ran out of road in the mid-2010s. The only way forward was a shorter wavelength: 13.5 nanometres, extreme ultraviolet, a colour so energetic that air, glass and almost everything else swallow it whole.',
  'Making it requires a small, violent miracle. A generator spits molten tin droplets, each a fraction of a hair’s width, across a vacuum chamber at seventy metres a second. A pre-pulse flattens each droplet into a pancake. A second laser pulse, at thirty kilowatts, vaporises the pancake into a plasma hot enough to emit the light. This happens fifty thousand times every second.',
  'The light is then collected by mirrors, because lenses would absorb it, and each mirror is polished so smooth that, scaled to the size of Germany, its largest bump would be a fraction of a millimetre high. Even then, only about two percent of the light survives the journey from source to wafer. The rest is heat, and heat is the enemy.',
  'Engineers describe the result as an optical system you can fall in love with and cannot afford. A single machine costs roughly as much as a regional airliner and ships in forty crates. There are, at the time of writing, perhaps two hundred in the world, and the company that makes them has a waiting list that runs into the next decade.',
  'What comes next is harder still. The next generation of machine widens the numerical aperture of the optics, which narrows the field the light can expose and doubles the number of exposures needed for a chip. Some designers are already asking whether the answer is not smaller lines but smarter stacking: building up, in layers, rather than shrinking down.',
  'Whatever the route, the laws of thermodynamics are unmoved. A transistor cannot be made smaller than its atoms, and the industry has perhaps three more generations before it meets them. The question that keeps engineers awake is not whether the curve will bend, but whether anyone will notice when it does.',
  'The honest answer, says one veteran process engineer who asked not to be named, is that most users already have. “Your phone is not twice as fast as it was two years ago. It is just better at hiding the wait.” It is a modest claim for a technology that sounds like science fiction. It may also be the most accurate thing anyone has said about the industry in years.',
];
const T_QA = [
  ['What does a nanometre feel like to you?', 'Like a very polite tolerance. We work in picometres on the good days. Nobody feels a nanometre, but everybody pays for the ones we lose.'],
  ['Why is the light so hard to make?', 'Because nature does not want it to exist. Extreme ultraviolet is absorbed by everything, including the mirror you are trying to bounce it off. We are building a lighthouse inside a vacuum and bribing every surface to cooperate.'],
  ['Is Moore’s law dead?', 'It is tired. The cost per transistor stopped falling a while ago. What continues is cleverness: packaging, stacking, better software. Scaling has become a team sport.'],
  ['What would surprise the public?', 'How much of it is cleaning. A third of the process steps exist to remove something we put there on purpose, a step earlier.'],
  ['What should a curious reader take from all this?', 'That every object around you is a stack of agreements between physics, chemistry and a great deal of patience. Look at your phone and imagine it as a promise.'],
  ['Do you ever doubt it will work?', 'Every Monday. Then the Monday data arrives, and the doubt is replaced by a better question.'],
  ['What keeps you up at night?', 'A single tin droplet that misses. It sounds trivial. Then you do the arithmetic at fifty thousand a second, and it is a very long night.'],
];

const vector: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, TG), c = G.cols, r = orn.rng(seed);
  const S = 'spaceGrotesk' as const, B = 'inter' as const, M = 'ibmPlexMono' as const;
  const navy = ink, steel = mix(ink, .2), body = { font: B, size: 9.6, lead: 13, color: ink, weight: 400, gap: 6, role: 'BODY' as const };
  const head = (section: string, color = ink, bg?: string) => runHead(G, { title: 'VECTOR  ·  AUG 2026', section, color, font: M, where: 'top', rule: alpha(color, .4), accent, size: 7.5, tracking: .2, weight: 600, y: 40 });
  const figLabel = (x: number, y: number, n: string, t: string, w = 300, color = ink) => [text(x, y, 40, `FIG. ${n}`, { size: 8, font: M, weight: 700, color: accent, wrap: false, tracking: .1, label: 'Figure number', role: 'KICKER' }), text(x + 42, y, w - 42, t, { size: 8, font: M, color: alpha(color, .75), tracking: .02, label: 'Figure title', role: 'CAPTION' })];
  const callout = (x: number, y: number, w: number, value: string, unit: string, lab: string, color = ink, size = 58) => { const v = text(x, y, w, value, { size, font: S, weight: 700, color: accent, tracking: -.03, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }); const u = text(x, below(v, 2), w, unit, { size: 9, font: M, weight: 700, color, tracking: .1, transform: 'uppercase', label: 'Data unit', role: 'KICKER' }); const l = text(x, below(u, 4), w, lab, { size: 8.5, font: B, color: alpha(color, .78), leading: 1.4, label: 'Data label', role: 'CAPTION' }); return [v, u, l]; };
  const corner = (x: number, y: number, w: number, h: number, color: string): Obj[] => [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].flatMap(([cx, cy, sx, sy]) => [hr(cx, cy, 10 * sx, color, 1, { label: 'Frame mark' }), vr(cx, cy, 10 * sy, color, 1, { label: 'Frame mark' })]);

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, navy)];
      // wafer map
      const cx = 548, cy = 452, R = 236, die = 38, gap = 3, n = 13;
      out.push(circle(cx, cy, R + 16, 'none', { stroke: alpha(paper, .25), strokeWidth: .75, label: 'Wafer ring' }), circle(cx, cy, R, steel, { label: 'Wafer' }));
      let k = 0; const dead = new Set([9, 26, 41, 63]);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const dx = cx + (i - (n - 1) / 2) * (die + gap), dy = cy + (j - (n - 1) / 2) * (die + gap);
        if (Math.hypot(Math.abs(dx - cx) + die / 2, Math.abs(dy - cy) + die / 2) > R - 5) continue;
        k++; const bad = dead.has(k), hot = k === 48;
        out.push(rect(dx - die / 2, dy - die / 2, die, die, bad ? accent : hot ? paper : mix(secondary, -.2 + ((i * 7 + j * 3) % 5) * .05), { rx: 1.5, opacity: bad || hot ? 1 : .9, label: bad ? 'Failed die' : 'Die', role: 'ORNAMENT' }));
      }
      out.push(hr(cx - R - 40, cy, R * 2 + 80, alpha(paper, .35), .75, { label: 'Axis' }), vr(cx, cy - R - 40, R * 2 + 80, alpha(paper, .35), .75, { label: 'Axis' }));
      out.push(...orn.radialLines(cx, cy, R + 22, R + 34, 72, alpha(paper, .5), .75, { label: 'Degree ticks' }));
      // callouts
      const ann: Array<[number, number, number, number, string, string, number, number, 'left' | 'right']> = [[430, 330, 150, 292, 'A', 'KILLED DIE\n3 OF 71', 166, 284, 'left'], [660, 292, 744, 252, 'B', 'λ = 13.5 nm', 640, 262, 'right'], [660, 600, 742, 664, 'C', '300 mm wafer', 640, 674, 'right']];
      ann.forEach(([ax, ay, bx, by, l, t, tx, ty, al]) => { out.push(line(ax, ay, bx, by, accent, 1, { label: 'Callout leader' }), circle(bx, by, 9, accent, { label: 'Callout marker' }), text(bx - 9, by - 6, 18, l, { size: 9, font: M, weight: 800, color: paper, align: 'center', wrap: false, label: 'Callout letter', role: 'LABEL' }), text(tx, ty, al === 'right' ? 130 : 110, t, { size: 8, font: M, weight: 600, color: alpha(paper, .85), tracking: .08, leading: 1.4, align: al === 'right' ? 'right' : 'left', label: 'Callout caption', role: 'CAPTION' })); });
      // masthead
      out.push(text(36, 22, 560, 'vector', { size: 132, font: S, weight: 700, color: paper, tracking: -.05, wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(path(458, 66, 70, 70, 'M10 10 L90 10 L90 90 L72 90 L72 40 L22 92 L8 78 L58 28 L10 28 Z', accent, { label: 'Masthead arrow' }));
      out.push(text(40, 170, 420, 'TECHNOLOGY & SCIENCE REVIEW', { size: 9, font: M, weight: 700, color: paper, tracking: .32, wrap: false, label: 'Tagline', role: 'LABEL' }));
      out.push(text(430, 170, 346, 'VOL. 12 · NO. 8 · AUGUST 2026 · $9.95', { size: 8, font: M, weight: 600, color: alpha(paper, .75), tracking: .14, align: 'right', wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(hr(40, 190, 736, alpha(paper, .4), .75, { label: 'Masthead rule' }));
      // headline
      out.push(text(40, 664, 300, 'COVER STORY  /  PAGE 24', { size: 8.5, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Cover line kicker', role: 'KICKER' }));
      const hd = text(36, 680, 600, 'The Last\nNanometre', { size: 92, font: S, weight: 700, color: paper, leading: .94, tracking: -.035, label: 'Cover headline', role: 'COVER_LINE' });
      out.push(hd, text(40, below(hd, 14), 420, 'Inside the machine that prints the future, and the physics that is about to say no.', { size: 13, font: B, weight: 400, color: alpha(paper, .85), leading: 1.45, label: 'Cover deck', role: 'COVER_LINE' }));
      const cl: Array<[string, string, string]> = [['02', 'Cold atoms, warm hospitals', 'QUANTUM  ·  p.38'], ['03', 'What the reef remembers', 'CLIMATE  ·  p.52'], ['04', 'Reading a preprint', 'METHOD  ·  p.66']];
      cl.forEach(([nn, t, tag], i) => { const x = 40 + i * 190; out.push(hr(x, 932, 172, alpha(paper, .4), .75, { label: 'Cover line rule' }), text(x, 940, 40, nn, { size: 9, font: M, weight: 800, color: accent, wrap: false, label: 'Cover line number', role: 'COVER_LINE' }), text(x, 956, 172, t, { size: 15, font: S, weight: 600, color: paper, leading: 1.15, label: 'Cover line', role: 'COVER_LINE' }), text(x, 996, 172, tag, { size: 7.5, font: M, weight: 600, color: alpha(paper, .6), tracking: .12, wrap: false, label: 'Cover line tag', role: 'COVER_LINE' })); });
      out.push(...barcodeBox(640, 936, 136, 66, { plate: paper, ink: navy, seed, code: '0 74470 08812 5', note: 'VECTOR 08 / 2026', font: M }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 70, 500, 'Contents', { size: 62, font: S, weight: 700, color: ink, tracking: -.035, wrap: false, label: 'Contents title', role: 'HEADLINE' }));
      out.push(text(G.right - 220, 92, 220, 'NO. 88\nAUGUST 2026', { size: 8.5, font: M, weight: 600, color: alpha(ink, .7), tracking: .14, align: 'right', leading: 1.5, label: 'Issue slug', role: 'LABEL' }));
      const feats: Array<[string, string, string]> = [['24', 'The Last Nanometre', 'The machine that prints every chip on Earth, and the physics that is about to say no.'], ['38', 'Cold Atoms, Warm Hospitals', 'A quantum sensor small enough to ride in an ambulance has just passed its first clinical trial.'], ['52', 'What the Reef Remembers', 'Coral skeletons hold four centuries of ocean temperature. We are finally learning to read them.']];
      feats.forEach(([pg, t, d], i) => {
        const y = 156 + i * 150;
        out.push(hr(G.x, y, G.w, ink, 1.25, { label: 'Feature rule' }), text(G.x, y + 12, 90, pg, { size: 52, font: M, weight: 700, color: accent, wrap: false, tracking: -.04, label: 'Contents folio', role: 'FOLIO' }));
        out.push(text(c[2].x, y + 14, spanOf(c, 2, 8).w, t, { size: 27, font: S, weight: 700, color: ink, tracking: -.02, label: 'Contents title', role: 'HEADLINE' }), text(c[2].x, y + 54, spanOf(c, 2, 7).w, d, { size: 10, font: B, color: alpha(ink, .82), leading: 1.45, label: 'Contents description', role: 'BODY' }));
        out.push(...photo(ctx, c[9].x, y + 12, spanOf(c, 9, 11).w, 112, { tone: 'light', caption: `Fig. ${i + 1}`, label: 'Contents thumbnail' }), ...corner(c[9].x - 3, y + 9, spanOf(c, 9, 11).w + 6, 118, ink));
      });
      const y0 = 156 + 3 * 150 + 14;
      out.push(hr(G.x, y0, G.w, ink, 1.25, { label: 'Departments rule' }), text(G.x, y0 + 10, 200, 'DEPARTMENTS', { size: 8, font: M, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Departments label', role: 'KICKER' }));
      const deps: Array<[string, string, string]> = [['10', 'Signals', 'Eight numbers that moved this month'], ['14', 'Lab notes', 'Three small results worth your attention'], ['64', 'Instruments', 'Eight tools, photographed at scale'], ['66', 'Method', 'How to read a preprint without being fooled'], ['72', 'In conversation', 'Dr. Imran Sethi on the cost of a nanometre'], ['76', 'Correction', 'What we got wrong, and how']];
      const dc = columns(G.x, G.w, 2, 36);
      deps.forEach(([pg, t, d], i) => { const x = dc[i % 2].x, y = y0 + 38 + Math.floor(i / 2) * 54; out.push(text(x, y, 30, pg, { size: 13, font: M, weight: 700, color: accent, wrap: false, label: 'Contents folio', role: 'FOLIO' }), text(x + 36, y - 1, dc[0].w - 36, t, { size: 14, font: S, weight: 600, color: ink, wrap: false, label: 'Department', role: 'HEADLINE' }), text(x + 36, y + 17, dc[0].w - 36, d, { size: 8.5, font: B, color: alpha(ink, .72), label: 'Department description', role: 'CAPTION' })); });
      // by the numbers
      const by = y0 + 38 + 3 * 54 + 10;
      out.push(rect(G.x, by, G.w, 92, ink, { label: 'By the numbers panel', role: 'SIDEBAR' }));
      [['14', 'figures'], ['31', 'sources cited'], ['2', 'corrections'], ['1', 'tin droplet that missed']].forEach(([v, l], i) => { const x = G.x + 20 + i * 176; out.push(text(x, by + 12, 70, v, { size: 34, font: S, weight: 700, color: accent, wrap: false, tracking: -.03, label: 'Stat value', role: 'HERO' }), text(x + (v.length > 1 ? 62 : 38), by + 28, 100, l, { size: 8, font: M, color: paper, tracking: .1, transform: 'uppercase', leading: 1.3, label: 'Stat label', role: 'CAPTION' })); });
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      const left = spanOf(c, 0, 2), right = spanOf(c, 3, 11);
      out.push(text(left.x - 6, 90, left.w + 20, '88', { size: 150, font: S, weight: 700, color: accent, tracking: -.07, wrap: false, leading: 1, label: 'Issue number', role: 'HERO' }));
      out.push(text(left.x, 252, left.w, 'ISSUE', { size: 8, font: M, weight: 700, color: ink, tracking: .3, wrap: false, label: 'Issue label', role: 'KICKER' }), hr(left.x, 270, left.w, ink, 1.25, { label: 'Rule' }));
      [['14', 'figures'], ['31', 'sources'], ['2', 'corrections'], ['0', 'adjectives we regret']].forEach(([v, l], i) => out.push(text(left.x, 282 + i * 44, 44, v, { size: 22, font: M, weight: 700, color: ink, wrap: false, label: 'Stat', role: 'LABEL' }), text(left.x + 42, 289 + i * 44, left.w - 42, l, { size: 8.5, font: B, color: alpha(ink, .75), leading: 1.3, label: 'Stat label', role: 'CAPTION' })));
      out.push(text(right.x, 78, right.w, 'FROM THE EDITOR', { size: 8, font: M, weight: 700, color: accent, tracking: .28, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const hd = text(right.x, 96, right.w, 'Our best argument is a number you can check.', { size: 40, font: S, weight: 700, color: ink, leading: 1.02, tracking: -.03, label: 'Letter headline', role: 'HEADLINE' });
      out.push(hd);
      const lead = text(right.x, below(hd, 20), right.w, 'This month we followed a single tin droplet for 24 pages, and what we found is that the most extraordinary machines are also the most ordinary: a loop of small corrections, repeated until the result looks inevitable.', { size: 15, font: B, weight: 400, color: ink, leading: 1.4, label: 'Letter lead', role: 'DECK' });
      out.push(lead);
      const cols2 = columns(right.x, right.w, 2, 14), y1 = below(lead, 22);
      const letter = 'Science writing has a habit of treating its subjects as miracles. We would rather treat them as engineering. The extreme ultraviolet scanner on page 24 is a miracle only in the way a bridge is a miracle: someone did the arithmetic, and then did it again, and then paid for the steel.\nThat is the spirit we hope you find here. Every figure in this issue has a source line, every source line has a date, and every date can be argued with. Our fact-checkers, Aiko and Rowan, would like you to try.\nWe made two mistakes in issue 87, both about units, and both are corrected below. We would rather you caught the next one before we do. Write to us; we read everything, and the best letters go on our wall.\nEnjoy the issue. Check the numbers.';
      const rr = balance(letter, colFrames(cols2, y1, y1 + 330), body); warnFlow('vector letter', rr); out.push(...rr.objs);
      out.push(text(cols2[1].x, bottomOf(rr.objs) + 16, cols2[1].w, 'Priya Raman, Editor', { size: 12, font: S, weight: 600, color: ink, wrap: false, label: 'Signature', role: 'BYLINE' }));
      const cy = 600;
      out.push(rect(right.x, cy, right.w, 130, mix(secondary, .86), { label: 'Corrections box', role: 'SIDEBAR' }), rect(right.x, cy, 4, 130, secondary, { label: 'Corrections rule' }));
      out.push(text(right.x + 20, cy + 14, 300, 'CORRECTIONS  ·  ISSUE 87', { size: 8, font: M, weight: 700, color: secondary, tracking: .2, wrap: false, label: 'Corrections label', role: 'KICKER' }), text(right.x + 20, cy + 34, right.w - 40, 'In “The Reef Memory” we gave a coral core’s age as 40 years; the correct figure is 400. In “Grid Storage” a table headed kWh should have read MWh. Both are fixed in the online edition, and both are our fault, not the authors’.', { size: 9.6, font: B, color: ink, leading: 1.45, label: 'Corrections text', role: 'BODY' }));
      out.push(...photo(ctx, right.x, 756, spanOf(c, 3, 5).w, 170, { tone: 'light', caption: 'Lab photograph', label: 'Letter photograph' }), ...caption(right.x, 932, spanOf(c, 3, 5).w, 'The editors’ wall of reader letters, now in its fourth year.', 'Photograph Ola Ade', { font: M, color: ink, size: 7.5, transform: 'none' }));
      out.push(...head('From the editor'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 64, 560, 'Signals', { size: 56, font: S, weight: 700, color: ink, tracking: -.035, wrap: false, label: 'Department title', role: 'HEADLINE' }));
      out.push(text(G.x + 330, 82, G.w - 330, 'Eight numbers that moved this month, and what moved them.', { size: 11, font: B, color: ink, leading: 1.4, align: 'right', label: 'Department deck', role: 'DECK' }));
      out.push(hr(G.x, 138, G.w, ink, 1.25, { label: 'Department rule' }));
      const tiles: Array<[string, string, string, string, number[]]> = [['73', '%', 'of new solar capacity in 2025 was built outside the OECD', 'IEA', [3, 4, 4, 6, 7, 9]], ['4.1', 'nm', 'smallest feature printed in volume', 'Industry roadmap', [9, 8, 6, 5, 4, 4]], ['1.2', 'kW', 'power drawn by a single training rack, up 4×', 'Uptime Inst.', [2, 2, 3, 5, 8, 11]], ['−38', '%', 'cost of grid batteries since 2022', 'BNEF', [11, 10, 8, 7, 6, 5]], ['412', 'ppm', 'monthly CO₂ at Mauna Loa, a new record', 'NOAA', [8, 8, 9, 9, 10, 10]], ['9', 'min', 'longest clinical quantum sensor scan so far', 'Trial no. 3', [1, 2, 3, 4, 7, 9]]];
      const tc = columns(G.x, G.w, 3, 18);
      tiles.forEach(([v, u, l, src, sp], i) => {
        const x = tc[i % 3].x, y = 156 + Math.floor(i / 3) * 258;
        out.push(rect(x, y, tc[0].w, 238, i === 1 ? ink : mix(ink, .94), { label: 'Signal tile', role: 'SIDEBAR' }));
        const fg = i === 1 ? paper : ink;
        out.push(text(x + 16, y + 14, tc[0].w - 32, v, { size: 62, font: S, weight: 700, color: accent, tracking: -.05, wrap: false, leading: 1, label: 'Data callout', role: 'HERO' }), text(x + 18, y + 80, 100, u, { size: 12, font: M, weight: 700, color: fg, wrap: false, label: 'Data unit', role: 'KICKER' }), text(x + 16, y + 104, tc[0].w - 32, l, { size: 10, font: B, color: fg, leading: 1.4, label: 'Data label', role: 'CAPTION' }));
        out.push(...sparkBars(x + 16, y + 170, tc[0].w - 32, 36, sp, alpha(fg, .35), accent), text(x + 16, y + 216, tc[0].w - 32, `SOURCE ${src.toUpperCase()}`, { size: 7, font: M, weight: 600, color: alpha(fg, .6), tracking: .12, wrap: false, label: 'Source', role: 'CREDIT' }));
      });
      const ly = 700;
      out.push(hr(G.x, ly, G.w, ink, 1.25, { label: 'Lab notes rule' }), text(G.x, ly + 10, 240, 'LAB NOTES', { size: 8, font: M, weight: 700, color: accent, tracking: .28, wrap: false, label: 'Lab notes label', role: 'KICKER' }));
      const notes: Array<[string, string, string]> = [['Materials', 'A glass that heals itself in the sun', 'Researchers in Lyon report a chalcogenide that closes its own hairline cracks in hours under ordinary light.'], ['Biology', 'Ants keep a ledger of the dead', 'Colony workers carry corpses to a single refuse zone and then, strikingly, avoid it for weeks.'], ['Computing', 'The cheapest bit ever stored', 'A group at Delft wrote one bit to one atom; reading it back took eleven hours and a great deal of coffee.']];
      notes.forEach(([k, t, d], i) => { const x = tc[i].x; out.push(text(x, ly + 34, tc[0].w, k.toUpperCase(), { size: 7.5, font: M, weight: 700, color: secondary, tracking: .2, wrap: false, label: 'Note kicker', role: 'KICKER' }), text(x, ly + 50, tc[0].w, t, { size: 15, font: S, weight: 600, color: ink, leading: 1.15, label: 'Note headline', role: 'HEADLINE' }), text(x, ly + 90, tc[0].w, d, { size: 9.6, font: B, color: ink, leading: 1.45, label: 'Note body', role: 'BODY' })); });
      out.push(...head('Signals'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(G.x, 76, G.w, 470, { fill: mix(ink, .93), ink, accent, font: M, kind: 'Advertisement  ·  half page', spec: 'Half page horizontal  ·  7.375 × 4.9 in  ·  bleed N/A  ·  300 dpi CMYK  ·  PDF/X-4', live: 12 }));
      out.push(text(G.x, 556, 300, 'ADVERTISEMENT', { size: 7, font: M, weight: 600, color: alpha(ink, .5), tracking: .2, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      // house ad
      const hy = 600;
      out.push(rect(G.x, hy, G.w, 340, navy, { label: 'House ad panel', role: 'AD_SLOT' }));
      out.push(text(G.x + 28, hy + 26, 420, 'Read the data.', { size: 50, font: S, weight: 700, color: paper, tracking: -.04, leading: 1, label: 'House ad headline', role: 'HEADLINE' }), text(G.x + 28, hy + 90, 400, 'Vector delivers every figure, source and method behind the stories, in print and in a searchable archive. Twelve issues, one honest argument at a time.', { size: 11, font: B, color: alpha(paper, .85), leading: 1.5, label: 'House ad copy', role: 'BODY' }));
      [['Print', '$89 / year'], ['Print + archive', '$119 / year'], ['Students & labs', '$49 / year']].forEach(([a, b], i) => out.push(hr(G.x + 28, hy + 190 + i * 38, 380, alpha(paper, .3), .75, { label: 'Price rule' }), text(G.x + 28, hy + 200 + i * 38, 200, a, { size: 13, font: S, weight: 600, color: paper, wrap: false, label: 'Plan', role: 'LABEL' }), text(G.x + 228, hy + 201 + i * 38, 180, b, { size: 11, font: M, weight: 700, color: accent, align: 'right', wrap: false, label: 'Plan price', role: 'PRICE' })));
      // QR-like code
      const qx = G.x + G.w - 28 - 132, qy = hy + 26, cell = 12, n = 11;
      out.push(rect(qx - 8, qy - 8, cell * n + 16, cell * n + 16, paper, { label: 'QR plate' }));
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const fin = (i < 3 && j < 3) || (i > 7 && j < 3) || (i < 3 && j > 7); if (fin ? !((i % 2 === 1 && j % 2 === 1) && false) : r() > .52) out.push(rect(qx + i * cell, qy + j * cell, cell - 1, cell - 1, navy, { label: 'QR module' })); }
      out.push(text(qx - 8, qy + cell * n + 14, cell * n + 16, 'vectorreview.example/join', { size: 7.5, font: M, color: paper, align: 'center', wrap: false, label: 'House ad URL', role: 'CAPTION' }));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, navy)];
      out.push(...photo(ctx, 0, 0, W, 560, { tone: 'dark', shade: steel, caption: 'Opening photograph · Extreme ultraviolet scanner, cutaway', label: 'Feature photograph' }));
      out.push(...corner(60, 60, W - 120, 440, alpha(paper, .6)));
      out.push(text(60, 74, 300, 'FIG. 0  ·  THE SCANNER, 1:40', { size: 8, font: M, weight: 600, color: paper, tracking: .14, wrap: false, label: 'Figure label', role: 'CAPTION' }));
      [[300, 250, 520, 200, 'A  Source vessel'], [380, 380, 560, 330, 'B  Collector mirror']].forEach(([ax, ay, bx, by, t]) => out.push(line(ax as number, ay as number, bx as number, by as number, accent, 1, { label: 'Callout leader' }), circle(ax as number, ay as number, 4, accent, { label: 'Callout dot' }), text((bx as number) + 6, (by as number) - 6, 200, t as string, { size: 8, font: M, weight: 700, color: paper, tracking: .08, wrap: false, label: 'Callout', role: 'CAPTION' })));
      out.push(text(G.x, 584, 300, 'COVER STORY  /  SEMICONDUCTORS', { size: 8.5, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(G.x - 4, 602, 720, 'The Last\nNanometre', { size: 108, font: S, weight: 700, color: paper, leading: .93, tracking: -.04, label: 'Feature headline', role: 'HEADLINE' });
      out.push(t);
      const dk = text(G.x, below(t, 16), 480, 'To keep Moore’s law alive, one company fires a laser at tin droplets fifty thousand times a second. Here is how, and what it will cost when it stops working.', { size: 15, font: B, color: alpha(paper, .9), leading: 1.4, label: 'Deck', role: 'DECK' });
      out.push(dk, text(G.x, below(dk, 12), 480, 'WORDS  DR. LENA HAUGEN   ·   ILLUSTRATION  OLA ADE', { size: 8, font: M, weight: 600, color: alpha(paper, .7), tracking: .12, wrap: false, label: 'Byline', role: 'BYLINE' }));
      // stat strip on the right
      [['13.5', 'nm', 'wavelength'], ['50k', '/s', 'droplets hit'], ['2', '%', 'light survives']].forEach(([v, u, l], i) => { const y = 618 + i * 108; out.push(vrule(G.right - 150, y, 82, alpha(paper, .4), 1, 'Stat rule'), text(G.right - 136, y - 6, 150, v, { size: 44, font: S, weight: 700, color: accent, wrap: false, tracking: -.03, label: 'Data callout', role: 'HERO' }), text(G.right - 136, y + 46, 150, `${u.toUpperCase()}  ${l.toUpperCase()}`, { size: 7.5, font: M, weight: 600, color: paper, tracking: .14, wrap: false, label: 'Data label', role: 'CAPTION' })); });
      out.push(text(G.x, H - 54, 100, String(G.pageNo), { size: 8, font: M, weight: 700, color: alpha(paper, .7), wrap: false, label: 'Folio', role: 'FOLIO' }), ...caption(G.x + 40, H - 58, 400, 'EUV scanner module in a clean room in Veldhoven; lens assemblies are shipped in forty crates.', 'Photograph Ola Ade', { font: M, color: alpha(paper, .7), creditColor: alpha(paper, .5), size: 7.5, transform: 'none' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        const main = { ...spanOf(c, 0, 7), w: spanOf(c, 0, 7).w - 14 }, side = spanOf(c, 8, 11);
        out.push(text(main.x, 74, main.w, 'FEATURE  /  THE LAST NANOMETRE', { size: 8, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Kicker', role: 'KICKER' }));
        const dk = text(main.x, 92, main.w, 'The light that draws a chip is made by hitting a falling drop of molten tin with a laser, twice, fifty thousand times a second.', { size: 22, font: S, weight: 600, color: ink, leading: 1.22, tracking: -.015, label: 'Deck', role: 'DECK' });
        out.push(dk);
        const by = below(dk, 12);
        out.push(text(main.x, by, main.w, 'BY DR. LENA HAUGEN  ·  ILLUSTRATIONS BY OLA ADE', { size: 7.5, font: M, weight: 600, color: alpha(ink, .7), tracking: .14, wrap: false, label: 'Byline', role: 'BYLINE' }), hr(G.x, by + 20, G.w, ink, 1.25, { label: 'Body rule' }));
        const y = by + 42, cols2 = columns(main.x, main.w, 2, 18);
        const rr = balance(T_PARAS.slice(0, 6).join('\n'), colFrames(cols2, y, G.bottom - 96), body, { dropCap: { lines: 3, font: S, color: accent, weight: 700 } }); warnFlow('vector p7', rr); out.push(...rr.objs);
        // sidebar: figure + data callout + how it works
        out.push(...callout(side.x, y, side.w, '13.5', 'nanometres', 'The wavelength of the light that now prints the most advanced chips, one tenth of the deep UV that came before it.', ink, 64));
        const fy = y + 190;
        out.push(...figLabel(side.x, fy, '1', 'Smallest printed feature, nm', side.w));
        out.push(...lineChart(side.x, fy + 18, side.w, 130, [[0, .92], [.18, .7], [.36, .5], [.52, .38], [.7, .24], [.88, .12], [1, .06]], { font: M, ink, accent, size: 7.5, endLabel: '4 nm', fill: alpha(accent, .1), xlabels: ['1995', '2010', '2025'] }));
        out.push(...sidebar(side.x, fy + 178, side.w, 'How the light is made', ['A tin droplet falls through the chamber at 70 m/s.', 'A pre-pulse flattens it into a disc.', 'A 30 kW pulse turns the disc into plasma.', 'Mirrors collect the glow and aim it at the wafer.'], { fill: ink, titleFont: M, titleColor: accent, bodyFont: B, bodyColor: paper, numbered: true, accent, size: 9, lead: 12.5, titleSize: 8, pad: 14, tracking: .2 }));
        out.push(hr(main.x, G.bottom - 78, main.w, ink, .75, { label: 'Footnote rule' }));
        out.push(text(main.x, G.bottom - 68, main.w, 'NOTES', { size: 7, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Notes label', role: 'KICKER' }));
        ['Extreme ultraviolet is absorbed by almost every material, including air, so the whole optical path is a vacuum.', 'Figures from the manufacturer’s technical report, rounded; the 2% efficiency figure is end to end.', 'A nanometre is one billionth of a metre. A human hair is roughly 80,000 of them across.'].forEach((n, i) => out.push(text(main.x, G.bottom - 54 + i * 17, 16, String(i + 1), { size: 7.5, font: M, weight: 700, color: accent, wrap: false, label: 'Note number', role: 'FOOTNOTE' }), text(main.x + 16, G.bottom - 54 + i * 17, main.w - 16, n, { size: 7.5, font: B, color: alpha(ink, .8), label: 'Footnote', role: 'FOOTNOTE' })));
      } else {
        const wide = spanOf(c, 0, 11);
        out.push(...figLabel(G.x, 72, '2', 'From droplet to wafer: where the light goes', 420));
        const dy = 92, dh = 190, boxes = ['Droplet generator', 'Pre-pulse laser', 'Main pulse, 30 kW', 'Collector mirror', 'Wafer'], bw = 118, step = (G.w - bw) / 4;
        boxes.forEach((b, i) => { const x = G.x + i * step; out.push(rect(x, dy + 30, bw, 84, i === 4 ? accent : mix(ink, .92), { stroke: ink, strokeWidth: 1, rx: 2, label: `Stage: ${b}`, role: 'ORNAMENT' }), text(x + 8, dy + 40, bw - 16, `0${i + 1}`, { size: 9, font: M, weight: 700, color: i === 4 ? paper : accent, wrap: false, label: 'Stage number', role: 'LABEL' }), text(x + 8, dy + 60, bw - 16, b, { size: 11.5, font: S, weight: 600, color: i === 4 ? paper : ink, leading: 1.15, label: 'Stage name', role: 'LABEL' })); if (i < 4) out.push(line(x + bw + 3, dy + 72, x + step - 3, dy + 72, ink, 1.25, { label: 'Flow arrow' }), path(x + step - 9, dy + 66, 8, 12, 'M0 0 L100 50 L0 100 Z', ink, { label: 'Arrowhead' })); });
        const pct = [100, 62, 31, 12, 2];
        pct.forEach((p, i) => { const x = G.x + i * step; out.push(rect(x, dy + 130, bw, 8, mix(ink, .88), { label: 'Light bar track' }), rect(x, dy + 130, bw * p / 100, 8, accent, { label: 'Light bar' }), text(x, dy + 144, bw, `${p}% of light remains`, { size: 7.5, font: M, color: alpha(ink, .75), wrap: false, label: 'Light remaining', role: 'CAPTION' })); });
        out.push(hr(G.x, dy + 178, G.w, ink, 1.25, { label: 'Body rule' }));
        const y = dy + 202, c3 = columns(G.x, G.w, 3, 18);
        out.push(...pullQuote(c3[2].x, y, c3[2].w, '“Your phone is not twice as fast as it was two years ago. It is just better at hiding the wait.”', 'Process engineer', { font: S, size: 20, weight: 600, color: ink, leading: 1.18, rule: 'left', ruleColor: accent, attribFont: M, tracking: -.01 }));
        const pq = y + 168;
        out.push(...figLabel(c3[2].x, pq, '3', 'Light surviving each stage, %', c3[2].w));
        out.push(...barChart(c3[2].x, pq + 16, c3[2].w, 130, [['Src', 100], ['Pre', 62], ['Mir', 31], ['Opt', 12], ['Wfr', 2]], { font: M, ink, accent, highlight: 4, size: 7.5, gap: 6 }));
        const rr = balance(T_PARAS.slice(6).join('\n') + '\n' + 'The measure that will matter, says the company’s chief scientist, is not the headline resolution but the yield: how many of the dies on a wafer survive the process intact. Each tin droplet that misses is a defect waiting to happen, and defects are multiplied across a billion transistors. A chip that works is not a triumph of optics; it is a triumph of statistics.\nThere is, finally, the question of cost. The newest scanners consume enough electricity to power a small town, and cooling them is a project in itself. The people who run them speak about their work in the plain, resigned tone of those who maintain something indispensable and unglamorous. They are, in the end, plumbers of the very small.', [{ x: c3[0].x, y, w: c3[0].w, b: 680 }, { x: c3[1].x, y, w: c3[1].w, b: 680 }, { x: c3[2].x, y: pq + 168, w: c3[2].w, b: 680 }], body);
        warnFlow('vector p8', rr); out.push(...rr.objs);
        const ty = 700;
        out.push(...figLabel(G.x, ty, '4', 'Four generations of scanner, side by side', 420), hr(G.x, ty + 20, G.w, ink, 1.25, { label: 'Table rule' }));
        const tcol = [0, 150, 270, 400, 540].map(o => G.x + o);
        [['GENERATION', 'YEAR', 'APERTURE', 'WAFERS / HOUR', 'PRICE'], ['NXE:3300', '2012', '0.33', '43', '$65 M'], ['NXE:3400', '2017', '0.33', '125', '$120 M'], ['NXE:3600', '2021', '0.33', '160', '$160 M'], ['EXE:5000', '2025', '0.55', '185', '$380 M']].forEach((row, ri) => { row.forEach((cell, ci) => out.push(text(tcol[ci], ty + 30 + ri * 24, 140, cell, { size: ri === 0 ? 7 : 10.5, font: ri === 0 ? M : B, weight: ri === 0 ? 700 : ri === 4 ? 700 : 400, color: ri === 0 ? alpha(ink, .6) : ri === 4 ? accent : ink, tracking: ri === 0 ? .14 : 0, wrap: false, label: ri === 0 ? 'Table head' : 'Table cell', role: ri === 0 ? 'LABEL' : 'BODY' }))); out.push(hr(G.x, ty + 48 + ri * 24, G.w, alpha(ink, ri === 0 ? .7 : .16), ri === 0 ? 1 : .6, { label: 'Table row rule' })); });
        out.push(text(G.x, ty + 156, G.w, 'SOURCE  MANUFACTURER TECHNICAL REPORTS; PRICES ARE REPORTED ESTIMATES.', { size: 7, font: M, color: alpha(ink, .55), tracking: .1, wrap: false, label: 'Source', role: 'CREDIT' }));
      }
      out.push(...head(pageIndex === 6 ? 'Semiconductors' : 'Semiconductors  ·  cont.'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      const l = spanOf(c, 0, 3), rt = spanOf(c, 4, 11);
      out.push(...photo(ctx, l.x, 76, l.w, 270, { tone: 'light', caption: 'Dr. Imran Sethi, process engineer', label: 'Portrait' }), ...corner(l.x - 4, 72, l.w + 8, 278, ink));
      out.push(...caption(l.x, 356, l.w, 'Sethi in the lab where the tin droplet is tuned.', 'Photograph Ola Ade', { font: M, color: ink, size: 7.5, transform: 'none' }));
      const card: Array<[string, string]> = [['NAME', 'Imran Sethi, Ph.D.'], ['ROLE', 'Principal process engineer'], ['FIELD', 'Extreme ultraviolet lithography'], ['LAB', 'Veldhoven Process Group'], ['PAPERS', '61'], ['LIKES', 'Long tolerances, short meetings']];
      out.push(rect(l.x, 410, l.w, 224, mix(ink, .94), { label: 'Profile card', role: 'SIDEBAR' }), text(l.x + 12, 422, l.w - 24, 'PROFILE CARD', { size: 7.5, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Profile label', role: 'KICKER' }));
      card.forEach(([k, v], i) => out.push(hr(l.x + 12, 442 + i * 30, l.w - 24, alpha(ink, .18), .6, { label: 'Card rule' }), text(l.x + 12, 449 + i * 30, 56, k, { size: 7, font: M, weight: 700, color: alpha(ink, .6), tracking: .14, wrap: false, label: 'Card key', role: 'LABEL' }), text(l.x + 68, 447 + i * 30, l.w - 80, v, { size: 9, font: B, color: ink, leading: 1.2, label: 'Card value', role: 'BODY' })));
      out.push(text(rt.x, 74, rt.w, 'IN CONVERSATION', { size: 8, font: M, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(rt.x, 92, rt.w, 'The cost of a nanometre', { size: 44, font: S, weight: 700, color: ink, tracking: -.035, leading: 1, label: 'Interview headline', role: 'HEADLINE' });
      out.push(t, text(rt.x, below(t, 10), rt.w, 'Interviewed by Priya Raman. Edited for length and clarity.', { size: 9, font: M, color: alpha(ink, .7), label: 'Byline', role: 'BYLINE' }));
      let y = below(t, 46);
      T_QA.forEach(([q, a], i) => {
        const qn = text(rt.x, y, 36, `Q${i + 1}`, { size: 9, font: M, weight: 800, color: accent, wrap: false, label: 'Question number', role: 'LABEL' });
        const qq = text(rt.x + 36, y - 3, rt.w - 36, q, { size: 15, font: S, weight: 600, color: ink, leading: 1.2, label: 'Question', role: 'KICKER' });
        const aa = text(rt.x + 36, below(qq, 6), rt.w - 36, a, { size: 10, font: B, color: ink, leading: 1.5, label: 'Answer', role: 'BODY' });
        out.push(qn, qq, aa); y = below(aa, 20);
        if (i === 1) { const pq = pullQuote(rt.x + 36, y, rt.w - 36, '“We are building a lighthouse inside a vacuum and bribing every surface to cooperate.”', null, { font: S, size: 21, weight: 600, color: accent, leading: 1.18, rule: 'top', ruleColor: ink, ruleWeight: 1, pad: 8 }); out.push(...pq); y = bottomOf(pq) + 24; }
      });
      out.push(...head('In conversation'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 66, 620, 'Eight instruments,\none lab', { size: 46, font: S, weight: 700, color: ink, tracking: -.035, leading: 1, label: 'Essay headline', role: 'HEADLINE' }));
      out.push(text(G.right - 200, 78, 200, 'Photographed at scale in the Veldhoven process group. Each frame is 1:1 with a printed scale bar.', { size: 9.5, font: B, color: alpha(ink, .8), leading: 1.45, label: 'Essay intro', role: 'DECK' }));
      const items: Array<[string, string, string]> = [['Cryostat', '10 mK base temperature', 'Dilution refrigerator'], ['Source vessel', '25 kW tin plasma', 'EUV light source'], ['Mirror blank', '0.05 nm RMS surface', 'Ultra-low-expansion glass'], ['Metrology tool', '0.2 nm repeatability', 'Overlay and focus'], ['Vacuum pump', '10⁻⁹ mbar', 'Cryo and turbo stack'], ['Wafer stage', '2 nm tracking at 7 g', 'Magnetic levitation']];
      const gc = columns(G.x, G.w, 2, 20);
      items.forEach(([n, spec, sub], i) => {
        const x = gc[i % 2].x, y = 166 + Math.floor(i / 2) * 262, h = 198;
        out.push(...photo(ctx, x, y, gc[0].w, h, { tone: 'light', caption: `Fig. ${i + 4}  ·  ${n}`, label: 'Instrument photograph' }), ...corner(x - 3, y - 3, gc[0].w + 6, h + 6, ink));
        out.push(text(x, y + h + 10, 50, `FIG. ${i + 4}`, { size: 8, font: M, weight: 800, color: accent, wrap: false, label: 'Figure number', role: 'KICKER' }), text(x + 50, y + h + 8, gc[0].w - 50, n, { size: 13, font: S, weight: 600, color: ink, wrap: false, label: 'Instrument', role: 'CAPTION' }), text(x + 50, y + h + 26, gc[0].w - 50, `${spec}  ·  ${sub}`, { size: 8, font: M, color: alpha(ink, .72), leading: 1.4, label: 'Instrument spec', role: 'CAPTION' }));
        out.push(hr(x + gc[0].w - 60, y + h - 12, 48, paper, 2, { label: 'Scale bar' }), text(x + gc[0].w - 60, y + h - 26, 48, '1 cm', { size: 7, font: M, color: paper, align: 'center', wrap: false, label: 'Scale label', role: 'CAPTION' }));
      });
      out.push(...head('Instruments'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 64, 360, 'vector', { size: 62, font: S, weight: 700, color: ink, tracking: -.05, wrap: false, label: 'Colophon masthead', role: 'COVER_TITLE' }), text(G.x, 130, 400, 'MASTHEAD & METHODS', { size: 8, font: M, weight: 700, color: accent, tracking: .26, wrap: false, label: 'Colophon label', role: 'KICKER' }));
      out.push(hr(G.x, 148, G.w, ink, 1.25, { label: 'Colophon rule' }));
      const staff: Array<[string, string]> = [['Editor', 'Priya Raman'], ['Deputy editor', 'Tomas Eklund'], ['Science editor', 'Dr. Lena Haugen'], ['Technology editor', 'Samir Batra'], ['Data editor', 'Rowan Pike'], ['Art director', 'Ola Ade'], ['Illustration', 'Mika Soto'], ['Fact-check', 'Aiko Mori'], ['Copy', 'Jude Okafor'], ['Publisher', 'Daniel Achebe']];
      const l = spanOf(c, 0, 4), rt = spanOf(c, 6, 11);
      staff.forEach(([role, name], i) => { const y = 168 + i * 44; out.push(text(l.x, y, 120, role.toUpperCase(), { size: 7.5, font: M, weight: 600, color: alpha(ink, .6), tracking: .12, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(l.x + 126, y - 2, l.w - 126, name, { size: 12.5, font: S, weight: 600, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' }), hr(l.x, y + 26, l.w, alpha(ink, .15), .6, { label: 'Credit rule' })); });
      const boxes: Array<[string, string]> = [['METHODS', 'Every figure carries a source line. Datasets are archived at vectorreview.example/data. Where we have rounded, we say so. Where a number is an estimate, it is printed in grey.'], ['TYPE', 'Set in Space Grotesk, Inter and IBM Plex Mono. Figures are drawn in the studio from the sources named in each caption.'], ['PRINT', 'Printed on 80 lb. FSC-certified text, 120 lb. cover, perfect bound. Trim 8.5 × 11 in. Bleed 0.125 in.'], ['RIGHTS', 'Vector is published monthly by Vector Media Ltd. © 2026. Reproduction without permission is prohibited. Letters: letters@vectorreview.example.']];
      let y = 164;
      boxes.forEach(([h, t]) => { const tt = text(rt.x, y + 18, rt.w, t, { size: 9.4, font: B, color: ink, leading: 1.5, label: 'Colophon text', role: 'BODY' }); out.push(text(rt.x, y, rt.w, h, { size: 7.5, font: M, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Colophon heading', role: 'KICKER' }), tt); y = below(tt, 34); });
      out.push(...barcodeBox(rt.x, G.bottom - 80, 140, 70, { plate: paper, ink, seed, code: 'ISSN 2033-1842', note: 'VOL. 12  NO. 8', font: M }), text(rt.x + 160, G.bottom - 70, rt.w - 160, 'Subscriptions\n1 800 555 0198\nvectorreview.example/join', { size: 9, font: M, color: ink, leading: 1.5, label: 'Contact', role: 'CAPTION' }));
      out.push(...head('Masthead'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, navy)];
      out.push(text(36, 40, 700, '89', { size: 360, font: S, weight: 700, color: steel, tracking: -.08, wrap: false, leading: 1, label: 'Next issue numeral', role: 'HERO' }));
      out.push(text(40, 420, 400, 'NEXT ISSUE  ·  ON SALE 15 SEPTEMBER', { size: 8.5, font: M, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Next issue kicker', role: 'KICKER' }));
      const t = text(36, 440, 700, 'The grid is\nthe machine', { size: 76, font: S, weight: 700, color: paper, leading: .96, tracking: -.04, label: 'Back cover headline', role: 'COVER_LINE' });
      out.push(t, text(40, below(t, 18), 440, 'How a continent’s power network learned to balance itself, second by second, with no one in charge.', { size: 14, font: B, color: alpha(paper, .85), leading: 1.45, label: 'Back cover deck', role: 'COVER_LINE' }));
      [['40', 'Seconds to rebalance a blackout'], ['3', 'Million sensors, one clock'], ['0', 'People in the control room at night']].forEach(([v, l], i) => out.push(hr(40 + i * 184, 790, 160, alpha(paper, .35), .75, { label: 'Stat rule' }), text(40 + i * 184, 800, 160, v, { size: 40, font: S, weight: 700, color: accent, wrap: false, tracking: -.03, label: 'Data callout', role: 'HERO' }), text(40 + i * 184, 850, 160, l, { size: 8.5, font: M, color: alpha(paper, .8), leading: 1.4, label: 'Data label', role: 'CAPTION' })));
      out.push(...barcodeBox(640, 930, 136, 70, { plate: paper, ink: navy, seed, code: '0 74470 08812 5', note: 'VECTOR 08 / 2026', font: M }));
      out.push(text(40, 960, 400, 'vectorreview.example  ·  Free app for subscribers', { size: 8, font: M, color: alpha(paper, .7), tracking: .1, wrap: false, label: 'URL', role: 'LABEL' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 3 · LYCEUM — culture & arts quarterly. Literary serif, wide margins, marginalia.
//     Trim 7.5 × 10 in (720 × 960 px), perfect bound. 8-column grid, 16 px baseline;
//     the text block takes six columns and the outer two hold the marginal notes.
// ═════════════════════════════════════════════════════════════════════════════
const LG: Grid = { cols: 8, gutter: 14, base: 16, top: 96, bottom: 100, inner: 84, outer: 112 };
const L_PARAS = [
  'The reading room at Aldersey Street has no clock. This was a decision, the librarian told me, taken in 1911 and never revised, and it explains a great deal about the people who work there. They look up when the light changes. They know it is four o’clock by the way the dust finds the third window, and they say so, quietly, with a certainty no watch could give them.',
  'I have been coming to this room for nineteen years, and I have never once finished a book in it. This is not a confession so much as a method. One does not finish a book in a library; one is merely interrupted by it, pleasantly, at intervals, by the weather. A bird crosses the window. A radiator knocks. A stranger turns a page with the exact care you were about to use, and for a moment the two of you are collaborators.',
  'The catalogue, by contrast, is a document of perfect confidence. Every book has a place, and the place is a number, and the number is true. I admire the catalogue the way I admire a map of a country I will never visit. But the window disagrees with it constantly. The window insists that the interesting thing is not where the book is but what the afternoon is doing to the person who has picked it up.',
  'This argument, between the catalogue and the window, is the oldest in the history of reading. Monastic librarians knew it. They chained their books to desks so that they would stay put, and then built the desks beside windows so that the readers could not help but look up. Whether this was a joke or an admission, the records do not say.',
  'What the Victorians added was heating, which changed everything. A warm room invites a long book; a cold one invites a short poem and a quick exit. The great public libraries of the 1880s were built, whatever their architects claimed, as machines for the production of one particular kind of attention: the sustained, slightly drowsy, utterly private attention of a person who has nowhere else to be.',
  'That attention is now the rarest thing in the building. The reading room is full, but the faces are lit from below. I do not say this to scold. I say it because the weather in the library has begun to change, and nobody has updated the catalogue. The light still crosses the third window at four o’clock. The people who notice it can be counted, on a good day, on one hand.',
  'I asked the librarian whether she minded. She considered the question with the seriousness of a person who has been asked it before. “A library is not a place where people read,” she said at last. “It is a place where reading is permitted. The difference is the whole point.” Then she looked at the window, and then at me, and said it was a quarter past four.',
];
const L_QA: Array<[string, string]> = [
  ['Lyceum', 'You have been working on one painting for eleven years. Why?'], ['Okonkwo', 'Because it keeps telling me what is wrong with it. That is the best sort of collaborator, and the most exhausting.'],
  ['Lyceum', 'Do you ever finish a work?'], ['Okonkwo', 'Finishing is a kind of agreement. I would rather reach one by exhaustion than by decision. Most of my paintings are finished by the person who buys them.'],
  ['Lyceum', 'What do you look at when you are not looking at it?'], ['Okonkwo', 'The wall behind it. Walls are underrated. They have very good manners.'],
  ['Lyceum', 'What does a gallery get wrong?'], ['Okonkwo', 'Silence. People think it is respectful. It is only quiet.'],
  ['Lyceum', 'And what does it get right?'], ['Okonkwo', 'Light. When the light is right in a room I can forgive the rest.'],
  ['Lyceum', 'What would you say to a young painter?'], ['Okonkwo', 'Look longer. Then look away. Then look again, when you have forgotten what you hoped to see.'],
];

const lyceum: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, LG);
  const D = 'cormorant' as const, T = 'cardo' as const, L = 'tenor' as const;
  const sp = G.verso ? { notes: spanOf(G.cols, 0, 1), main: spanOf(G.cols, 2, 7) } : { main: spanOf(G.cols, 0, 5), notes: spanOf(G.cols, 6, 7) };
  const body = { font: T, size: 11, lead: 16, color: ink, weight: 400, indent: 16, role: 'BODY' as const };
  const note = (x: number, y: number, w: number, value: string, o: { align?: 'left' | 'right' } = {}) => text(x, y, w, value, { size: 8.8, font: T, italic: true, color: alpha(ink, .78), leading: 1.45, align: o.align, label: 'Marginal note', role: 'SIDEBAR' });
  const fleuron = (cx: number, y: number, color = accent): Obj[] => [-14, 0, 14].map((d, i) => path(cx + d - 3.5, y, i === 1 ? 7 : 5, i === 1 ? 7 : 5, orn.polygonPath(4, 0), color, { label: 'Fleuron' }));
  const head = (running: string) => [
    text(G.x, 48, G.w, running, { size: 9.5, font: T, italic: true, color: alpha(ink, .7), align: 'center', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    hr(G.x, 66, G.w, alpha(ink, .35), .5, { label: 'Running head rule' }),
    text(G.x, H - 56, G.w, String(G.pageNo), { size: 10, font: D, weight: 600, color: ink, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }),
  ];
  const plate = (x: number, y: number, w: number, h: number, cap: string): Obj[] => [rect(x - 6, y - 6, w + 12, h + 12, 'none', { stroke: alpha(ink, .55), strokeWidth: .75, label: 'Plate frame (outer)', role: 'RULE' }), ...photo(ctx, x, y, w, h, { tone: 'light', caption: cap, label: 'Plate' })];

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(30, 30, W - 60, H - 60, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Cover frame (outer)', role: 'RULE' }), rect(38, 38, W - 76, H - 76, 'none', { stroke: ink, strokeWidth: .5, label: 'Cover frame (inner)', role: 'RULE' }));
      out.push(text(60, 62, W - 120, 'THE', { size: 11, font: L, color: accent, tracking: .6, align: 'center', wrap: false, label: 'Masthead prefix', role: 'LABEL' }));
      out.push(text(40, 74, W - 80, 'LYCEUM', { size: 104, font: D, weight: 500, color: ink, tracking: .06, align: 'center', wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(hr(70, 196, W - 140, ink, 1.25, { label: 'Masthead rule' }), hr(70, 201, W - 140, ink, .5, { label: 'Masthead rule' }));
      out.push(text(70, 210, W - 140, 'A QUARTERLY OF ESSAYS, POEMS, FICTION & THE ARTS', { size: 8.5, font: L, color: ink, tracking: .3, align: 'center', wrap: false, label: 'Tagline', role: 'LABEL' }));
      out.push(text(70, 226, W - 140, 'VOLUME XIV  ·  NUMBER 3  ·  AUTUMN 2026', { size: 8, font: L, color: alpha(ink, .7), tracking: .3, align: 'center', wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(...plate(150, 268, W - 300, 330, 'Cover plate · The third window, Aldersey Street reading room'));
      out.push(text(110, 612, W - 220, 'Frontispiece: the reading room at four o’clock.', { size: 10, font: T, italic: true, color: alpha(ink, .75), align: 'center', wrap: false, label: 'Plate caption', role: 'CAPTION' }));
      out.push(...fleuron(W / 2, 640));
      const list: Array<[string, string]> = [['Ines Calloway', 'The Weather in the Library'], ['Tomas Verhoeven', 'Three Poems'], ['Adaeze Nwosu', 'The Tailor’s Apprentice, a story'], ['Mireille Okonkwo', 'In Conversation, on looking longer']];
      list.forEach(([a, t], i) => { const y = 668 + i * 44; out.push(text(70, y, W - 140, t, { size: i === 0 ? 24 : 19, font: D, weight: i === 0 ? 600 : 500, italic: true, color: i === 0 ? accent : ink, align: 'center', wrap: false, label: 'Cover line', role: 'COVER_LINE' }), text(70, y + (i === 0 ? 27 : 22), W - 140, a.toUpperCase(), { size: 7.5, font: L, color: alpha(ink, .7), tracking: .3, align: 'center', wrap: false, label: 'Cover line author', role: 'COVER_LINE' })); });
      out.push(...barcodeBox(W / 2 - 54, 860, 108, 52, { plate: paper, ink, seed, code: 'ISSN 1042 9917', note: '$18.00 US  ·  £14', font: 'ibmPlexMono' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(sp.main.x, 86, sp.main.w, 'Contents', { size: 58, font: D, weight: 500, italic: true, color: ink, wrap: false, label: 'Contents title', role: 'HEADLINE' }));
      out.push(text(sp.main.x, 154, sp.main.w, 'AUTUMN 2026  ·  VOLUME XIV  ·  NUMBER 3', { size: 7.5, font: L, color: accent, tracking: .3, wrap: false, label: 'Issue line', role: 'LABEL' }));
      const sections: Array<[string, Array<[string, string, string]>]> = [
        ['Essays', [['Ines Calloway', 'The Weather in the Library', '22'], ['Dorothea Lang-Wei', 'What the Footnote Knew', '38'], ['Samuel Achterberg', 'A Defence of the Long Sentence', '46']]],
        ['Poems', [['Tomas Verhoeven', 'Three Poems', '31'], ['Lucia Ferreira', 'Inventory of a Small Room', '33']]],
        ['Fiction', [['Adaeze Nwosu', 'The Tailor’s Apprentice', '54']]],
        ['Conversation & Reviews', [['Mireille Okonkwo', 'In Conversation, on looking longer', '68'], ['Various hands', 'Notes & Reviews', '12']]],
      ];
      let y = 190;
      sections.forEach(([h, items]) => {
        out.push(text(sp.main.x, y, sp.main.w, h.toUpperCase(), { size: 8, font: L, color: accent, tracking: .34, wrap: false, label: 'Section label', role: 'KICKER' }), hr(sp.main.x, y + 16, sp.main.w, ink, .5, { label: 'Section rule' }));
        y += 28;
        items.forEach(([a, t, p]) => {
          out.push(text(sp.main.x, y, 40, p, { size: 15, font: D, weight: 600, color: ink, wrap: false, label: 'Contents folio', role: 'FOLIO' }));
          out.push(text(sp.main.x + 44, y - 2, sp.main.w - 44, t, { size: 18, font: D, weight: 500, italic: true, color: ink, label: 'Contents title', role: 'HEADLINE' }));
          out.push(text(sp.main.x + 44, y + 22, sp.main.w - 44, a.toUpperCase(), { size: 7.5, font: L, color: alpha(ink, .65), tracking: .26, wrap: false, label: 'Contents author', role: 'BYLINE' }));
          y += 52;
        });
        y += 10;
      });
      out.push(note(sp.notes.x, 190, sp.notes.w, 'Pages 31 and 33 are printed on a heavier stock, as poems like to be held.', { align: G.verso ? 'right' : 'left' }));
      out.push(note(sp.notes.x, 280, sp.notes.w, 'Cover: the third window at Aldersey Street, photographed at four o’clock.', { align: G.verso ? 'right' : 'left' }));
      out.push(...head('Lyceum'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(sp.main.x, 92, sp.main.w, 'FROM THE EDITOR', { size: 8, font: L, color: accent, tracking: .34, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(sp.main.x, 110, sp.main.w, 'On waiting for the thought to arrive', { size: 38, font: D, weight: 500, italic: true, color: ink, leading: 1.04, label: 'Letter headline', role: 'HEADLINE' });
      out.push(t, hr(sp.main.x, below(t, 16), 40, accent, 1.5, { label: 'Short rule' }));
      const letter = 'This autumn issue arrives later than promised and, we hope, a little wiser. We spent the summer arguing about what a quarterly is for. In a season when the news arrives every four minutes, a magazine that appears every three months is making a claim about time: that some thoughts are worth waiting for, and that a few of them improve by being left alone.\nIn these pages you will find Ines Calloway on the weather in a reading room, three new poems by Tomas Verhoeven, a story by Adaeze Nwosu that begins in a tailor’s shop and does not end there, and a conversation with the painter Mireille Okonkwo, who has been looking at the same canvas for eleven years and says she is nearly ready to begin.\nWe have made small changes. The type is larger; the margins are wider; there are fewer pictures and they are better. We have also added a column of marginal notes, in the old style, because a page should be able to talk to itself.\nThank you for your patience. Please keep reading slowly.';
      const r = flow(letter, [{ x: sp.main.x, y: below(t, 40), w: sp.main.w, b: G.bottom + 400 }], body, { dropCap: { lines: 3, font: D, color: accent, weight: 600 } }); warnFlow('lyceum letter', r); out.push(...r.objs);
      const ey = bottomOf(r.objs) + 22;
      out.push(text(sp.main.x, ey, sp.main.w, 'Edith Calder', { size: 22, font: D, italic: true, weight: 500, color: ink, align: 'right', wrap: false, label: 'Signature', role: 'BYLINE' }), text(sp.main.x, ey + 26, sp.main.w, 'EDITOR', { size: 7.5, font: L, color: alpha(ink, .65), tracking: .3, align: 'right', wrap: false, label: 'Signature role', role: 'CAPTION' }));
      out.push(note(sp.notes.x, 150, sp.notes.w, 'The quarterly has appeared, without a missed issue, since 2013. This is number fifty-five.', { align: G.verso ? 'right' : 'left' }));
      out.push(note(sp.notes.x, 280, sp.notes.w, 'Letters are welcome and are answered, slowly, by hand.', { align: G.verso ? 'right' : 'left' }));
      out.push(...photo(ctx, sp.main.x, ey + 72, 120, 140, { tone: 'light', caption: 'Editor', label: 'Editor portrait' }), ...caption(sp.main.x + 136, ey + 72, sp.main.w - 136, 'Edith Calder at her desk in the old tailor’s shop that now houses the Lyceum office, summer 2026.', 'Photograph Ruth Abara', { font: T, color: ink, size: 9, italic: true, transform: 'none' }));
      out.push(...head('Lyceum'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(sp.main.x, 86, sp.main.w, 'Notes & Reviews', { size: 46, font: D, weight: 500, italic: true, color: ink, wrap: false, label: 'Department title', role: 'HEADLINE' }), hr(sp.main.x, 146, sp.main.w, ink, .5, { label: 'Department rule' }));
      const rv: Array<[string, string, string, string, number, string]> = [
        ['The Salt Year', 'Hana Petrova  ·  Lantern Press  ·  $26', 'A novel', 'A fisherman’s widow keeps a ledger of everything the sea returns: a shoe, a door, a wedding dress, a child’s drawing of a boat. The book is built, entry by entry, like a tide table, and it carries its sorrow so lightly that the reader forgives the one false chapter near the end. A small masterpiece of restraint.', 4, 'Reviewed by Callum Reyes'],
        ['Small Stages', 'Corvin Gallery  ·  through 14 December', 'An exhibition', 'Thirty painters were each given a shoebox and a fortnight. The results are by turns clever, tender and unaccountably moving; the best, by a retired signwriter, shows a street at dusk lit by a single bulb. The hanging is generous and the wall labels are mercifully short.', 5, 'Reviewed by Hana Petrova'],
        ['Night Shift at the Opera', 'Aldersey Recordings  ·  2 discs', 'A recording', 'A chamber orchestra rehearses after hours, and the microphones simply stay on. What emerges is an unpolished, wholly absorbing document of how music is argued into shape. The conductor’s murmured corrections are worth the price on their own.', 3, 'Reviewed by Tomas Verhoeven'],
      ];
      rv.forEach(([t, meta, kind, text_, stars, by], i) => {
        const y = 164 + i * 232;
        out.push(...photo(ctx, sp.notes.x, y + 4, sp.notes.w, 150, { tone: 'light', caption: kind, label: 'Cover or poster' }));
        out.push(note(sp.notes.x, y + 162, sp.notes.w, meta, { align: G.verso ? 'right' : 'left' }));
        out.push(text(sp.main.x, y, sp.main.w, kind.toUpperCase(), { size: 7.5, font: L, color: accent, tracking: .3, wrap: false, label: 'Review kicker', role: 'KICKER' }));
        const tt = text(sp.main.x, y + 16, sp.main.w, t, { size: 28, font: D, weight: 500, italic: true, color: ink, wrap: false, label: 'Review title', role: 'HEADLINE' });
        out.push(tt);
        for (let s = 0; s < 5; s++) out.push(circle(sp.main.x + 6 + s * 16, y + 64, 4.5, s < stars ? accent : 'none', { stroke: accent, strokeWidth: 1, label: 'Rating mark' }));
        out.push(text(sp.main.x, y + 80, sp.main.w, text_, { size: 10.6, font: T, color: ink, leading: 1.5, label: 'Review text', role: 'BODY' }));
        out.push(text(sp.main.x, y + 188, sp.main.w, by.toUpperCase(), { size: 7.5, font: L, color: alpha(ink, .65), tracking: .26, wrap: false, label: 'Review byline', role: 'BYLINE' }));
        if (i < 2) out.push(...fleuron(sp.main.x + sp.main.w / 2, y + 214, alpha(ink, .5)));
      });
      out.push(...head('Notes & Reviews'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      const w = sp.main.w, x = sp.main.x;
      out.push(...adSlot(x, 120, w, 560, { fill: mix(ink, .93), ink, accent, font: L, kind: 'Publisher’s advertisement', spec: 'Two-thirds page vertical  ·  5.4 × 5.8 in  ·  no bleed  ·  grayscale or CMYK, 300 dpi', live: 14 }));
      out.push(text(x, 700, w, 'ADVERTISEMENT', { size: 7, font: L, color: alpha(ink, .55), tracking: .34, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(hr(x, 730, w, ink, .5, { label: 'Rule' }), text(x, 744, w, 'Advertise in Lyceum', { size: 22, font: D, italic: true, weight: 500, color: ink, wrap: false, label: 'House ad headline', role: 'HEADLINE' }));
      out.push(text(x, 776, w, 'Readers of Lyceum buy books, attend plays, take courses and travel slowly. Full, half and third-page placements; presses, galleries, festivals and residencies welcome. Rates and the production calendar at lyceumquarterly.example/advertise, or write to advertising@lyceumquarterly.example.', { size: 10, font: T, color: ink, leading: 1.5, label: 'House ad copy', role: 'BODY' }));
      out.push(note(sp.notes.x, 124, sp.notes.w, 'We accept advertising only from presses, galleries, theatres and schools whose work we would be glad to review.', { align: G.verso ? 'right' : 'left' }));
      out.push(...head('Lyceum'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 92, G.w, 'ESSAY', { size: 8, font: L, color: accent, tracking: .4, align: 'center', wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(...plate(G.x + 40, 124, G.w - 80, 292, 'Plate · The reading room, Aldersey Street, 4 p.m.'));
      out.push(text(G.x + 40, 426, G.w - 80, 'The third window, shortly after four. Photograph by Ruth Abara.', { size: 9, font: T, italic: true, color: alpha(ink, .7), align: 'center', wrap: false, label: 'Plate caption', role: 'CAPTION' }));
      const t = text(G.x, 470, G.w, 'The Weather in\nthe Library', { size: 60, font: D, weight: 500, color: ink, align: 'center', leading: .98, label: 'Feature headline', role: 'HEADLINE' });
      out.push(t, ...fleuron(W / 2, below(t, 18)));
      const dk = text(G.x + 30, below(t, 40), G.w - 60, 'On reading in rooms that were built to be quiet, and the long argument between the catalogue and the window.', { size: 16, font: D, italic: true, weight: 500, color: alpha(ink, .85), align: 'center', leading: 1.35, label: 'Deck', role: 'DECK' });
      out.push(dk, text(G.x, below(dk, 18), G.w, 'INES CALLOWAY', { size: 9, font: L, color: ink, tracking: .4, align: 'center', wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(text(G.x + 70, 790, G.w - 140, '“A library is a place where reading is permitted.”', { size: 10, font: T, italic: true, color: alpha(ink, .7), align: 'center', wrap: false, label: 'Epigraph', role: 'CAPTION' }));
      out.push(text(G.x, H - 56, G.w, String(G.pageNo), { size: 10, font: D, weight: 600, color: ink, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      const first = pageIndex === 6;
      if (first) {
        out.push(text(sp.main.x, 92, sp.main.w, 'THE WEATHER IN THE LIBRARY', { size: 8, font: L, color: accent, tracking: .34, wrap: false, label: 'Kicker', role: 'KICKER' }));
        const r = flow(L_PARAS.slice(0, 5).join('\n'), [{ x: sp.main.x, y: 120, w: sp.main.w, b: G.bottom + 560 }], body, { dropCap: { lines: 3, font: D, color: accent, weight: 600 } }); warnFlow('lyceum p7', r); out.push(...r.objs);
        out.push(note(sp.notes.x, 124, sp.notes.w, '¹ Aldersey Street opened in 1888 as a mechanics’ institute and became a public library in 1911.', { align: G.verso ? 'right' : 'left' }), note(sp.notes.x, 300, sp.notes.w, '² Chained libraries survive at Hereford and Zutphen; the desks are original.', { align: G.verso ? 'right' : 'left' }), note(sp.notes.x, 470, sp.notes.w, '³ The first heated reading room in England is thought to be the one at Manchester, 1852.', { align: G.verso ? 'right' : 'left' }));
      } else {
        const top = 120;
        out.push(...pullQuote(G.x + (G.verso ? 0 : 0), top, G.w, '“A library is not a place where people read. It is a place where reading is permitted.”', null, { font: D, size: 30, italic: true, weight: 500, color: accent, leading: 1.18, align: 'center', rule: 'both', ruleColor: alpha(ink, .5), ruleWeight: .5, pad: 14 }));
        const y = top + 156;
        const r = flow(L_PARAS.slice(5).join('\n') + '\n' + 'There is a version of this essay that ends with a lament. I have drafted it several times, and each time the room has talked me out of it. The people at the long tables are, after all, doing precisely what the library was built to permit: they are sitting very still while something happens to them. Whether that something is a novel, a spreadsheet or a long look out of the window is not for the architecture to say.\nWhat I will say is that the third window is still there, and so is four o’clock, and the dust finds its place in the light with a precision that no catalogue has ever matched. If you come, bring a book you do not intend to finish. Sit where you can see the glass. Wait, and see what the weather does.', [{ x: sp.main.x, y, w: sp.main.w, b: 700 }], body);
        warnFlow('lyceum p8', r); out.push(...r.objs);
        const py = Math.min(bottomOf(r.objs) + 40, 690); out.push(...plate(sp.main.x + 20, py, sp.main.w - 40, 150, 'Plate · the radiator, the stranger, the bird'));
        out.push(note(sp.notes.x, y + 4, sp.notes.w, '⁴ The librarian asked not to be named. She is, I should say, extremely good at her job.', { align: G.verso ? 'right' : 'left' }), note(sp.notes.x, y + 150, sp.notes.w, '⁵ The window faces west.', { align: G.verso ? 'right' : 'left' }));
        out.push(text(sp.main.x, py + 166, sp.main.w, 'Photograph, the radiator that knocks, Aldersey Street.  Ruth Abara', { size: 8.5, font: T, italic: true, color: alpha(ink, .7), align: 'center', wrap: false, label: 'Plate caption', role: 'CAPTION' }));
      }
      out.push(...head('The Weather in the Library'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(sp.main.x, 92, sp.main.w, 'IN CONVERSATION', { size: 8, font: L, color: accent, tracking: .34, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(sp.main.x, 110, sp.main.w, 'Mireille Okonkwo, on looking longer', { size: 36, font: D, weight: 500, italic: true, color: ink, leading: 1.04, label: 'Interview headline', role: 'HEADLINE' });
      out.push(t, text(sp.main.x, below(t, 10), sp.main.w, 'The painter, who has worked on one canvas for eleven years, talks to Edith Calder in her studio above the old tailor’s shop.', { size: 11, font: T, italic: true, color: alpha(ink, .8), leading: 1.45, label: 'Interview deck', role: 'DECK' }));
      let y = 244;
      for (let i = 0; i < L_QA.length; i += 2) {
        const q = L_QA[i], a = L_QA[i + 1];
        const qt = text(sp.main.x, y, sp.main.w, q[1], { size: 11, font: T, italic: true, color: alpha(ink, .75), leading: 1.45, label: 'Question', role: 'BODY' });
        const at = text(sp.main.x, below(qt, 5), sp.main.w, a[1], { size: 11, font: T, color: ink, leading: 1.45, label: 'Answer', role: 'BODY' });
        out.push(text(sp.notes.x, y + 3, sp.notes.w, q[0].toUpperCase(), { size: 7, font: L, color: alpha(ink, .55), tracking: .3, align: G.verso ? 'right' : 'left', wrap: false, label: 'Speaker', role: 'LABEL' }), qt, text(sp.notes.x, below(qt, 5) + 3, sp.notes.w, a[0].toUpperCase(), { size: 7, font: L, color: accent, tracking: .3, align: G.verso ? 'right' : 'left', wrap: false, label: 'Speaker', role: 'LABEL' }), at);
        y = below(at, 16);
      }
      out.push(...photo(ctx, sp.main.x, y + 6, 150, 168, { tone: 'light', caption: 'Mireille Okonkwo', label: 'Portrait' }), ...caption(sp.main.x + 166, y + 6, sp.main.w - 166, 'Okonkwo in the studio, in front of the canvas she is “nearly ready to begin”. The wall behind it is, she insists, the best part.', 'Photograph Ruth Abara', { font: T, color: ink, size: 9, italic: true, transform: 'none' }));
      out.push(...head('In Conversation'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 84, G.w, 'PLATES  VII – VIII', { size: 8, font: L, color: accent, tracking: .4, align: 'center', wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(...plate(G.x + 24, 112, G.w - 48, 430, 'Plate VII · Tenor of the afternoon'));
      out.push(text(G.x, 560, G.w, 'VII.  The tenor of the afternoon, from the north gallery.', { size: 10, font: T, italic: true, color: alpha(ink, .8), align: 'center', wrap: false, label: 'Plate caption', role: 'CAPTION' }));
      out.push(...plate(G.x + 24, 612, 200, 176, 'Plate VIII'), ...plate(G.x + 24 + 230, 612, G.w - 48 - 230, 176, 'Plate IX'));
      out.push(text(G.x + 24, 812, 200, 'VIII.  A chair, a coat, a book left open.', { size: 9, font: T, italic: true, color: alpha(ink, .75), leading: 1.4, label: 'Plate caption', role: 'CAPTION' }), text(G.x + 24 + 230, 812, G.w - 48 - 230, 'IX.  The seam in the light, 4:15 p.m.  Photographs by Ruth Abara.', { size: 9, font: T, italic: true, color: alpha(ink, .75), leading: 1.4, label: 'Plate caption', role: 'CAPTION' }));
      out.push(...head('Plates'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 100, G.w, 'LYCEUM', { size: 40, font: D, weight: 500, color: ink, tracking: .12, align: 'center', wrap: false, label: 'Colophon masthead', role: 'COVER_TITLE' }), ...fleuron(W / 2, 156));
      out.push(text(G.x + 20, 184, G.w - 40, 'Lyceum is published quarterly by the Lyceum Trust in the old tailor’s shop at 14 Aldersey Street. It is edited, designed and packed in the same room, and printed on uncoated paper made from recycled cotton. The text is set in Cardo; the titles and numerals in Cormorant; the small capitals in Tenor Sans.', { size: 10.5, font: T, color: ink, leading: 1.55, align: 'center', label: 'Colophon text', role: 'BODY' }));
      const staff: Array<[string, string]> = [['Editor', 'Edith Calder'], ['Poetry editor', 'Tomas Verhoeven'], ['Fiction editor', 'Adaeze Nwosu'], ['Reviews', 'Callum Reyes'], ['Design', 'Marta Quill'], ['Photography', 'Ruth Abara'], ['Copyediting', 'Samuel Achterberg'], ['Publisher', 'The Lyceum Trust']];
      const cc = columns(G.x + 20, G.w - 40, 2, 30);
      staff.forEach(([r, n], i) => { const x = cc[i % 2].x, y = 328 + Math.floor(i / 2) * 50; out.push(text(x, y, cc[0].w, r.toUpperCase(), { size: 7.5, font: L, color: alpha(ink, .6), tracking: .3, align: i % 2 ? 'left' : 'right', wrap: false, label: 'Credit role', role: 'CAPTION' }), text(x, y + 14, cc[0].w, n, { size: 15, font: D, italic: true, weight: 500, color: ink, align: i % 2 ? 'left' : 'right', wrap: false, label: 'Credit name', role: 'BYLINE' })); });
      out.push(vrule(W / 2, 322, 200, alpha(ink, .35), .5, 'Credits divider'));
      out.push(hr(G.x + 100, 560, G.w - 200, ink, .5, { label: 'Rule' }));
      out.push(text(G.x + 20, 580, G.w - 40, 'SUBSCRIBE  ·  Four issues, $64 a year, post free in the US. Single copies $18. lyceumquarterly.example/subscribe. Back numbers are kept in print for ten years.', { size: 9, font: L, color: ink, tracking: .12, leading: 1.7, align: 'center', label: 'Subscriptions', role: 'CAPTION' }));
      out.push(text(G.x + 20, 650, G.w - 40, 'Submissions open in March and September. Poems in groups of three; fiction to 6,000 words; essays to 4,000. Please send nothing by post, which we love but cannot answer.', { size: 10, font: T, italic: true, color: alpha(ink, .85), leading: 1.55, align: 'center', label: 'Submissions', role: 'BODY' }));
      out.push(text(G.x + 20, 750, G.w - 40, '© 2026 The Lyceum Trust. All rights revert to contributors on publication. Printed in the United Kingdom on FSC-certified paper. Trim 7.5 × 10 in, 0.125 in bleed.', { size: 8.5, font: T, color: alpha(ink, .7), leading: 1.5, align: 'center', label: 'Rights', role: 'FOOTNOTE' }));
      out.push(...head('Colophon'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(30, 30, W - 60, H - 60, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Cover frame (outer)', role: 'RULE' }), rect(38, 38, W - 76, H - 76, 'none', { stroke: ink, strokeWidth: .5, label: 'Cover frame (inner)', role: 'RULE' }));
      out.push(text(80, 150, W - 160, 'THE QUARTERLY OF THE SLOW AND ATTENTIVE', { size: 8, font: L, color: accent, tracking: .4, align: 'center', wrap: false, label: 'Kicker', role: 'KICKER' }));
      const q = text(100, 190, W - 200, '“A magazine that appears every three months is making a claim about time: that some thoughts are worth waiting for.”', { size: 34, font: D, italic: true, weight: 500, color: ink, align: 'center', leading: 1.2, label: 'Back cover quotation', role: 'COVER_LINE' });
      out.push(q, ...fleuron(W / 2, below(q, 28)));
      out.push(text(100, below(q, 60), W - 200, 'From the editor’s letter, autumn 2026', { size: 10, font: T, italic: true, color: alpha(ink, .7), align: 'center', wrap: false, label: 'Attribution', role: 'CAPTION' }));
      out.push(text(100, 640, W - 200, 'Next issue: winter 2026\nEssays on weather, translation and the afterlife of buildings. Poems by Lucia Ferreira. A long story by Samuel Achterberg.', { size: 11, font: T, color: ink, leading: 1.6, align: 'center', label: 'Next issue', role: 'BODY' }));
      out.push(text(70, 790, W - 140, 'LYCEUM', { size: 26, font: D, weight: 500, color: ink, tracking: .12, align: 'center', wrap: false, label: 'Masthead, small', role: 'COVER_TITLE' }));
      out.push(...barcodeBox(W / 2 - 54, 836, 108, 52, { plate: paper, ink, seed, code: 'ISSN 1042 9917', note: 'VOL. XIV  NO. 3', font: 'ibmPlexMono' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 4 · OVERTIME — sports weekly. Condensed type, stat boxes, action crops, a tilted masthead.
//     Trim 8.5 × 11 in (816 × 1056 px), saddle-stitched. 6-column grid, 12 px baseline.
// ═════════════════════════════════════════════════════════════════════════════
const SG: Grid = { cols: 6, gutter: 12, base: 12, top: 74, bottom: 70, inner: 48, outer: 40 };
const S_PARAS = [
  'The ball left Dani Okafor’s hand with 1.4 seconds on the clock and the whole building stopped breathing. Fourteen thousand people watched it rise, hang, and fall through the net with a sound that one courtside photographer described as a door closing on a very loud room. Final: Harbor 98, Rapids 96. The arena did not so much cheer as exhale.',
  'It was the fourth game-winner of the season for a guard who, eighteen months earlier, was playing in a regional league for a salary that required a second job. Okafor stocked shelves at a hardware store on Tuesdays and Thursdays. The manager still keeps her old schedule taped inside the staff-room door. “We’re not taking it down,” he says. “Bad luck.”',
  'What changed was not talent, which scouts had never doubted, but patience. Okafor spent a summer working with a shooting coach in a converted church hall, taking the same twelve-foot jump shot for six hours a day, until the movement became, in her words, boring enough to be true. The coach filmed every attempt. The footage runs to forty-one terabytes and one very small change in her elbow.',
  'Teammates talk about her stillness. In a sport built on motion, she is the player who waits, who lets the defence commit, who treats the final possession as a sentence to be read slowly aloud. “She never rushes,” says veteran center Marta Ilves. “You can see the whole play happen in her eyes before it happens on the floor.”',
  'The numbers back the story. Okafor leads the league in clutch scoring, shooting 61 percent in the final two minutes of one-possession games, and she has not turned the ball over in a crunch-time possession since February. Analysts, a species not usually given to poetry, have started calling it the Okafor window: the three seconds in which a game decides itself.',
  'Fame has been slow and sideways. She is recognised by cashiers more than by crowds. She has turned down four shoe contracts, taken a fifth, and used the money to resurface the court behind her old school. “Everybody wanted to talk about the shot,” she says. “I wanted to talk about the net. It had a hole in it, and nobody fixed it for years.”',
  'On Saturday the Harbor travel to Denver for a game that, on paper, they should lose. Okafor expects to play forty minutes. She expects to be tired. And, with the quiet confidence of someone who has done the boring thing six hours a day for a whole summer, she expects the ball to find her in the last two minutes. “It always does,” she says. “You just have to be standing still when it gets there.”',
];
const S_QA: Array<[string, string]> = [
  ['Take us to the last second.', 'Honestly? I was thinking about my sandwich. The play broke down, Marta found me, and my feet were already set. My body had done this ten thousand times when nobody was watching.'],
  ['What does a quiet mind feel like on court?', 'Like a lake at six in the morning. The crowd is there, but it is on the far shore.'],
  ['Who do you call after a win?', 'My brother, who is a plumber. He tells me what I did wrong. It is the most useful call of my week.'],
  ['Does the pressure get lighter?', 'No. You just get better at carrying it. Like a bag. Same weight, better handle.'],
  ['What is the worst advice you have had?', 'Believe in the shot. Do not believe in the shot, believe in the work. The shot is just the receipt.'],
];

const overtime: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, SG), c = G.cols;
  const HD = 'bigShoulders' as const, O = 'oswald' as const, B = 'archivo' as const;
  const navy = ink, body = { font: B, size: 9.8, lead: 13, color: ink, weight: 400, gap: 6, role: 'BODY' as const };
  const head = (section: string, color = ink) => [
    rect(G.x, 36, G.w, 20, color === ink ? ink : paper, { label: 'Running head bar', role: 'RULE' }),
    text(G.x + 8, 40, G.w * .6, G.verso ? 'OVERTIME  ·  WK 14' : section, { size: 9.5, font: O, weight: 600, color: color === ink ? paper : ink, tracking: .2, transform: 'uppercase', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    text(G.right - 128, 40, 120, String(G.pageNo), { size: 12, font: O, weight: 700, color: color === ink ? paper : ink, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    ...(G.verso ? [text(G.x + G.w - 330, 40, 190, section, { size: 9.5, font: O, weight: 500, color: alpha(color === ink ? paper : ink, .75), tracking: .2, transform: 'uppercase', align: 'right', wrap: false, label: 'Section', role: 'RUNNING_HEAD' })] : []),
  ];
  const stat = (x: number, y: number, w: number, v: string, l: string, fg = ink, bg?: string, size = 54): Obj[] => [
    ...(bg ? [rect(x, y, w, size + 44, bg, { label: 'Stat box', role: 'SIDEBAR' })] : []),
    text(x + 10, y + 4, w - 20, v, { size, font: HD, weight: 900, color: bg ? paper : accent, wrap: false, leading: 1, label: 'Stat value', role: 'HERO' }),
    text(x + 10, y + size + 14, w - 20, l, { size: 9, font: O, weight: 500, color: bg ? alpha(paper, .85) : fg, tracking: .16, transform: 'uppercase', label: 'Stat label', role: 'CAPTION' }),
  ];
  const slab = (x: number, y: number, w: number, label_: string, bg = accent, fg = paper, size = 13): Obj[] => [rect(x, y, w, size + 10, bg, { label: 'Label slab', role: 'ORNAMENT' }), text(x + 8, y + 4, w - 16, label_, { size, font: HD, weight: 900, color: fg, tracking: .08, transform: 'uppercase', wrap: false, label: 'Subhead', role: 'KICKER' })];

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, navy)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: mix(ink, .22), caption: 'Cover photograph · Dani Okafor, 1.4 seconds left, Harbor Arena', label: 'Cover photograph' }));
      out.push(rect(-BL, H * .46, W + BL * 2, H * .54 + BL, navy, { gradient: fade(90, navy, 0, .92), label: 'Legibility gradient' }));
      // tilted masthead
      out.push(rect(-30, 28, W + 60, 168, accent, { rotation: -2, label: 'Masthead banner' }));
      out.push(text(36, 4, W - 72, 'OVERTIME', { size: 196, font: HD, weight: 900, color: paper, tracking: -.01, wrap: false, leading: 1, rotation: -2, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(rect(-30, 196, W + 60, 30, navy, { rotation: -2, label: 'Ticker strip' }));
      out.push(text(36, 201, W - 72, 'WEEK 14  ·  OCT 8 2026  ·  HARBOR 98 RAPIDS 96  ·  UNITED 2 CITY 1  ·  DENVER 31 AUSTIN 27  ·  $5.99', { size: 11, font: O, weight: 500, color: paper, tracking: .22, wrap: false, rotation: -2, label: 'Score ticker', role: 'LABEL' }));
      // cover line
      out.push(rect(40, 580, 120, 24, accent, { label: 'Kicker slab' }), text(48, 584, 110, 'COVER STORY', { size: 14, font: HD, weight: 900, color: paper, tracking: .1, wrap: false, label: 'Cover line kicker', role: 'KICKER' }));
      out.push(text(36, 592, 500, 'THE LAST\nSHOT', { size: 120, font: HD, weight: 900, color: paper, leading: .82, tracking: -.005, wrap: false, label: 'Cover headline', role: 'COVER_LINE' }));
      out.push(text(40, 830, 450, 'How Dani Okafor stopped trying to be a hero and started being still.', { size: 19, font: O, weight: 500, color: paper, leading: 1.25, label: 'Cover deck', role: 'COVER_LINE' }));
      [['38', 'PTS'], ['12', 'REB'], ['9', 'AST']].forEach(([v, l], i) => out.push(rect(40 + i * 92, 900, 84, 54, secondary, { label: 'Stat chip' }), text(40 + i * 92, 902, 84, v, { size: 36, font: HD, weight: 900, color: paper, align: 'center', wrap: false, leading: 1, label: 'Chip value', role: 'HERO' }), text(40 + i * 92, 940, 84, l, { size: 10, font: O, weight: 600, color: paper, tracking: .2, align: 'center', wrap: false, label: 'Chip label', role: 'CAPTION' })));
      // right-hand cover lines
      const lines: Array<[string, string]> = [['MOCK DRAFT 2.0', 'The 14 picks that changed our minds  p.34'], ['FOUR-MINUTE MILE', 'Inside the 1,500 m that broke the record  p.46'], ['SOCCER’S NEW MATH', 'Why the best clubs have stopped scoring  p.58']];
      lines.forEach(([t, d], i) => out.push(rect(560, 624 + i * 76, 6, 58, accent, { label: 'Cover line bar' }), text(576, 622 + i * 76, 200, t, { size: 22, font: HD, weight: 900, color: paper, wrap: false, label: 'Cover line', role: 'COVER_LINE' }), text(576, 648 + i * 76, 200, d, { size: 10.5, font: O, weight: 400, color: alpha(paper, .85), leading: 1.3, label: 'Cover line description', role: 'COVER_LINE' })));
      out.push(...barcodeBox(640, 940, 136, 66, { plate: paper, ink: navy, seed, code: '0 74470 14014 2', note: 'OVERTIME 14 / 2026', font: 'ibmPlexMono' }));
      out.push(text(40, 976, 400, 'ISSUE 14 · VOL. 9 · THE WEEKLY OF THE GAME', { size: 10, font: O, weight: 500, color: alpha(paper, .8), tracking: .22, wrap: false, label: 'Issue line', role: 'LABEL' }), text(40, 992, 400, 'overtimeweekly.example', { size: 10, font: O, weight: 500, color: alpha(paper, .6), tracking: .1, wrap: false, label: 'URL', role: 'LABEL' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(G.x, 80, G.w, 100, navy, { label: 'Scoreboard header', role: 'ORNAMENT' }), text(G.x + 16, 76, G.w, 'THIS\nWEEK', { size: 60, font: HD, weight: 900, color: paper, leading: .82, wrap: false, label: 'Contents title', role: 'HEADLINE' }));
      out.push(text(G.x + 170, 94, 200, 'WEEK 14\nOCT 8 2026', { size: 20, font: O, weight: 500, color: accent, leading: 1.2, tracking: .1, wrap: false, label: 'Issue slug', role: 'LABEL' }));
      ['FEATURES', 'GAME DAY', 'THE LOCKER ROOM'].forEach((t, i) => out.push(text(G.x + 300 + i * 120, 98, 118, t, { size: 11, font: O, weight: 600, color: i === 0 ? accent : alpha(paper, .8), tracking: .2, wrap: false, label: 'Scoreboard tab', role: 'LABEL' })));
      const rows: Array<[string, string, string, string]> = [['24', 'THE LAST SHOT', 'Dani Okafor and the three seconds that decide everything.', 'COVER STORY'], ['34', 'MOCK DRAFT 2.0', 'Fourteen picks that changed our minds, and one that did not.', 'DRAFT'], ['46', 'FOUR-MINUTE MILE', 'Inside the 1,500 m that rewrote the record book.', 'TRACK'], ['58', 'SOCCER’S NEW MATH', 'Why the best clubs have stopped trying to score more.', 'SOCCER'], ['70', 'LOCKER ROOM', 'Okafor on stillness, sandwiches and sore elbows.', 'INTERVIEW'], ['78', 'THE SEQUENCE', 'One shot, frame by frame, in twelve photographs.', 'PHOTO ESSAY'], ['10', 'BOX SCORES', 'Standings, results and the week’s stat leaders.', 'GAME DAY']];
      rows.forEach(([pg, t, d, tag], i) => {
        const y = 196 + i * 92;
        out.push(rect(G.x, y, 62, 76, i === 0 ? accent : navy, { label: 'Page box', role: 'ORNAMENT' }), text(G.x, y + 4, 62, pg, { size: 52, font: HD, weight: 900, color: paper, align: 'center', wrap: false, leading: 1, label: 'Contents folio', role: 'FOLIO' }));
        out.push(text(G.x + 78, y - 4, G.w - 80, t, { size: 48, font: HD, weight: 900, color: ink, wrap: false, leading: 1, label: 'Contents title', role: 'HEADLINE' }), text(G.x + 80, y + 48, G.w - 280, d, { size: 10.5, font: B, color: alpha(ink, .85), leading: 1.35, label: 'Contents description', role: 'BODY' }), text(G.right - 160, y + 52, 160, tag, { size: 11, font: O, weight: 600, color: accent, tracking: .2, align: 'right', wrap: false, label: 'Section tag', role: 'KICKER' }));
        out.push(hr(G.x, y + 84, G.w, alpha(ink, .25), .75, { label: 'Contents rule' }));
      });
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...slab(G.x, 76, 110, 'The Huddle'));
      out.push(text(G.x - 2, 100, 520, 'THE GAME BEHIND\nTHE GAME', { size: 84, font: HD, weight: 900, color: ink, leading: .86, wrap: false, label: 'Letter headline', role: 'HEADLINE' }));
      const main = spanOf(c, 0, 3), side = spanOf(c, 4, 5);
      out.push(text(main.x, 286, main.w, 'Every week we get the same letter, in a hundred different hands. It says: more of the part you do not see. The warm-up, the film room, the long bus. The three seconds before the three seconds that everyone replays.', { size: 17, font: O, weight: 400, color: ink, leading: 1.35, label: 'Letter lead', role: 'DECK' }));
      const cols2 = columns(main.x, main.w, 2, 14);
      const letter = 'So this issue we went looking for stillness. Marcus Teller followed Dani Okafor through nine days of the most ordinary basketball of her career, and the story that came back is the one on page 24. It is about a shot, but it is mostly about a hardware store, a church hall and a very patient elbow.\nElsewhere you will find our mock draft, rebuilt from scratch after the combine changed everything we thought we knew; a long look at why the best soccer clubs have stopped chasing goals; and a track feature that begins at the starting line and ends, three thousand words later, in a physiotherapist’s kitchen.\nThere are changes, too. Box scores are back on page 10, where they belong. The stat of the week now has a box of its own. And we have decided that the rumour column was a mistake, and have buried it quietly in the garden.\nSee you on the sidelines.';
      const ly0 = 400; const rr = balance(letter, colFrames(cols2, ly0, 720), { ...body, size: 10.5, lead: 14.5 }, { dropCap: { lines: 3, font: HD, color: accent, weight: 900, scale: 1.22 } }); warnFlow('overtime letter', rr); out.push(...rr.objs);
      out.push(text(cols2[1].x, bottomOf(rr.objs) + 14, cols2[1].w, 'Kofi Mensah, Editor', { size: 14, font: O, weight: 700, color: ink, tracking: .06, wrap: false, label: 'Signature', role: 'BYLINE' }));
      out.push(...stat(side.x, 280, side.w, '61%', 'Okafor’s shooting in the last two minutes of one-possession games', ink, navy, 66));
      out.push(...slab(side.x, 410, side.w, 'The Pick', secondary), text(side.x, 444, side.w, 'DENVER +3.5. The visitors rested everyone but the starters, and the starters are tired. Take the home underdog and a deep breath.', { size: 10.5, font: B, color: ink, leading: 1.4, label: 'The pick', role: 'BODY' }));
      out.push(...photo(ctx, G.x, 730, G.w, 210, { tone: 'light', caption: 'Locker room, 30 minutes before tip', label: 'Letter photograph' }), ...caption(G.x, 946, G.w, 'The Harbor locker room, half an hour before tip-off. Okafor is the one sitting very still.', 'Photograph Kofi Mensah', { font: O, color: ink, size: 9, transform: 'none' }));
      out.push(...head('The Huddle'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 70, 700, 'BOX SCORES', { size: 96, font: HD, weight: 900, color: ink, wrap: false, leading: 1, label: 'Department title', role: 'HEADLINE' }), rect(G.x + 396, 98, G.w - 396, 14, accent, { label: 'Department bar' }));
      // standings
      const tw = spanOf(c, 0, 3);
      out.push(...slab(tw.x, 180, tw.w, 'Eastern Conference  ·  Standings'));
      const teams: Array<[string, string, string, string, string]> = [['Harbor', '11', '3', '.786', 'W4'], ['Rapids', '10', '4', '.714', 'L1'], ['Summit', '9', '5', '.643', 'W2'], ['Pioneers', '8', '6', '.571', 'W1'], ['Bluffs', '7', '7', '.500', 'L3'], ['Foundry', '6', '8', '.429', 'W1'], ['Lakers FC', '4', '10', '.286', 'L5'], ['Ironside', '2', '12', '.143', 'L7']];
      const colx = [0, 190, 240, 290, 350].map(o => tw.x + o);
      out.push(...['TEAM', 'W', 'L', 'PCT', 'STK'].map((h, i) => text(colx[i] + (i ? 0 : 8), 214, 60, h, { size: 9, font: O, weight: 600, color: alpha(ink, .65), tracking: .2, wrap: false, label: 'Table head', role: 'LABEL' })));
      teams.forEach((t, i) => { const y = 232 + i * 26; out.push(rect(tw.x, y, tw.w, 26, i % 2 ? paper : mix(ink, .93), { label: 'Row band', role: 'ORNAMENT' }), ...t.map((v, k) => text(colx[k] + (k ? 0 : 8), y + 4, k ? 60 : 180, v, { size: k ? 13 : 15, font: k ? O : HD, weight: k ? 600 : 900, color: k === 4 ? (v[0] === 'W' ? secondary : accent) : ink, tracking: k ? .03 : .02, transform: k ? undefined : 'uppercase', wrap: false, label: 'Table cell', role: 'BODY' }))); });
      // leaders chart
      const lw = spanOf(c, 4, 5);
      out.push(...slab(lw.x, 180, lw.w, 'Scoring leaders', navy));
      out.push(...barChart(lw.x, 214, lw.w, 218, [['OKA', 29], ['RIV', 27], ['HAN', 26], ['LEE', 24], ['DUR', 23]], { font: O, ink, accent, size: 10, highlight: 0, gap: 6, barColor: navy, ticks: 3 }));
      // recaps
      const rcs: Array<[string, string, string, string, string]> = [['HARBOR', '98', 'RAPIDS', '96', 'Okafor’s buzzer-beater from 25 feet ends Rapids’ eight-game run.'], ['UNITED', '2', 'CITY', '1', 'Late header settles the derby; City down to ten after the 70th minute.'], ['DENVER', '31', 'AUSTIN', '27', 'Fourth-quarter pick-six turns a one-score game into a rout.'], ['SUMMIT', '112', 'BLUFFS', '108', 'Four players score twenty as Summit complete the season sweep.']];
      rcs.forEach(([a, as, b, bs, d], i) => {
        const x = G.x + (i % 2) * (G.w / 2 + 6), y = 460 + Math.floor(i / 2) * 200, w = G.w / 2 - 6;
        out.push(rect(x, y, w, 184, i === 0 ? navy : mix(ink, .93), { label: 'Recap tile', role: 'SIDEBAR' }));
        const fg = i === 0 ? paper : ink;
        out.push(text(x + 14, y + 10, w - 28, 'FINAL', { size: 10, font: O, weight: 600, color: accent, tracking: .24, wrap: false, label: 'Recap label', role: 'KICKER' }), text(x + 14, y + 26, 110, as, { size: 76, font: HD, weight: 900, color: fg, wrap: false, leading: 1, label: 'Home score', role: 'HERO' }), text(x + w / 2 + 10, y + 26, 110, bs, { size: 76, font: HD, weight: 900, color: i === 0 ? alpha(paper, .55) : alpha(ink, .45), wrap: false, leading: 1, label: 'Away score', role: 'HERO' }), text(x + 14, y + 100, w / 2 - 14, a, { size: 13, font: O, weight: 600, color: fg, tracking: .12, wrap: false, label: 'Home team', role: 'LABEL' }), text(x + w / 2 + 10, y + 100, w / 2 - 14, b, { size: 13, font: O, weight: 600, color: fg, tracking: .12, wrap: false, label: 'Away team', role: 'LABEL' }), text(x + 14, y + 128, w - 28, d, { size: 10, font: B, color: fg, leading: 1.4, label: 'Recap text', role: 'BODY' }));
      });
      out.push(...head('Game Day'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...slab(G.x, 76, 118, 'Subscribe & save', navy));
      out.push(text(G.x - 2, 100, 600, 'EVERY WEEK.\nEVERY GAME.', { size: 116, font: HD, weight: 900, color: ink, leading: .84, wrap: false, label: 'House ad headline', role: 'HEADLINE' }));
      [['52', 'issues a year'], ['$2.40', 'an issue, delivered'], ['0', 'ads before the box scores']].forEach(([v, l], i) => out.push(...stat(G.x + i * 232, 340, 220, v, l, ink, i === 1 ? accent : navy, 62)));
      out.push(text(G.x, 470, 420, 'Join 140,000 readers who start the week with the scores, the long read and the one photograph that explains the weekend. Gift subscriptions include a signed print.', { size: 12, font: B, color: ink, leading: 1.5, label: 'House ad copy', role: 'BODY' }), text(G.x, 548, 420, 'overtimeweekly.example/join  ·  1 800 555 0114', { size: 18, font: O, weight: 600, color: accent, tracking: .06, wrap: false, label: 'House ad URL', role: 'LABEL' }));
      out.push(...adSlot(0, 610, W, 380, { fill: mix(ink, .9), ink, accent, font: O, kind: 'Advertisement  ·  bleed banner', spec: 'Full-width banner  ·  8.375 × 5.0 in plus 0.125 in bleed on three sides  ·  300 dpi CMYK', bleed: true, ctx, live: 20 }));
      out.push(text(G.x, 996, 200, 'ADVERTISEMENT', { size: 8, font: O, weight: 600, color: alpha(ink, .5), tracking: .24, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(...head('Subscribe'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, navy)];
      out.push(path(-BL, -BL, W + BL * 2, 760 + BL, 'M0 0 L100 0 L100 88 L0 100 Z', mix(ink, .22), { role: 'IMAGE_SLOT', label: 'Photograph (angled crop)' }));
      out.push(text(40, 340, W - 80, 'ACTION PHOTOGRAPH  ·  OKAFOR RELEASES, 1.4 SECONDS LEFT', { size: 10, font: 'inter', weight: 700, color: 'rgba(255,255,255,.55)', tracking: .14, align: 'center', label: 'Image slot hint', role: 'LABEL' }));
      out.push(rect(-BL, 640, W + BL * 2, 120, navy, { gradient: fade(90, navy, 0, .55), label: 'Photo foot gradient' }));
      out.push(rect(G.x, 588, 112, 24, accent, { label: 'Kicker slab' }), text(G.x + 8, 592, 100, 'COVER STORY', { size: 14, font: HD, weight: 900, color: paper, tracking: .1, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 2 + 4, 620 + 4, 740, 'THE LAST\nSHOT', { size: 124, font: HD, weight: 900, color: accent, leading: .82, wrap: false, label: 'Headline misregistration', role: 'ORNAMENT' }), text(G.x - 2, 620, 740, 'THE LAST\nSHOT', { size: 124, font: HD, weight: 900, color: paper, leading: .82, wrap: false, label: 'Feature headline', role: 'HEADLINE' }));
      out.push(text(G.x + 480, 670, 262, 'Dani Okafor spent a summer taking the same jump shot for six hours a day. This is what stillness looks like at 1.4 seconds.', { size: 19, font: O, weight: 400, color: paper, leading: 1.3, label: 'Deck', role: 'DECK' }), text(G.x + 480, 810, 262, 'BY MARCUS TELLER   ·   PHOTOGRAPHS BY KOFI MENSAH', { size: 10, font: O, weight: 600, color: alpha(paper, .75), tracking: .16, wrap: false, label: 'Byline', role: 'BYLINE' }));
      [['98–96', 'FINAL'], ['1.4', 'SECONDS LEFT'], ['25 FT', 'RELEASE POINT']].forEach(([v, l], i) => out.push(rect(G.x + i * 160, 934, 150, 70, accent, { label: 'Stat chip' }), text(G.x + i * 160, 938, 150, v, { size: 34, font: HD, weight: 900, color: paper, align: 'center', wrap: false, leading: 1, label: 'Chip value', role: 'HERO' }), text(G.x + i * 160, 978, 150, l, { size: 9.5, font: O, weight: 600, color: paper, tracking: .2, align: 'center', wrap: false, label: 'Chip label', role: 'CAPTION' })));
      out.push(text(G.right - 60, H - 38, 60, String(G.pageNo), { size: 12, font: O, weight: 700, color: paper, align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        out.push(...slab(G.x, 76, 100, 'Cover story'));
        out.push(text(G.x - 2, 100, 500, 'THE QUIET\nOF A CLUTCH', { size: 70, font: HD, weight: 900, color: ink, leading: .86, wrap: false, label: 'Subhead', role: 'HEADLINE' }));
        const ph = spanOf(c, 4, 5), tx = spanOf(c, 0, 3);
        out.push(...photo(ctx, ph.x, 84, ph.w, 190, { tone: 'light', caption: 'Okafor, set and still', label: 'Action crop' }), ...caption(ph.x, 280, ph.w, 'Okafor’s feet are set before the pass arrives. “She is early to everything,” says her coach.', 'Photograph Kofi Mensah', { font: O, color: ink, size: 9, transform: 'none' }));
        const top = 340, cols2 = columns(tx.x, tx.w, 2, 14);
        const rr = balance(S_PARAS.slice(0, 4).join('\n'), colFrames(cols2, top, 800), { ...body, size: 10.8, lead: 15 }, { dropCap: { lines: 3, font: HD, color: accent, weight: 900, scale: 1.22 } });
        warnFlow('overtime p7', rr); out.push(...rr.objs);
        out.push(rect(ph.x, top, ph.w, 224, navy, { label: 'By the numbers panel', role: 'SIDEBAR' }), text(ph.x + 12, top + 10, ph.w - 24, 'BY THE NUMBERS', { size: 11, font: O, weight: 600, color: accent, tracking: .22, wrap: false, label: 'Panel title', role: 'KICKER' }));
        [['61%', 'CLUTCH FG'], ['4', 'GAME-WINNERS'], ['0', 'LATE TURNOVERS'], ['6 H', 'DAILY PRACTICE']].forEach(([v, l], i) => { const x = ph.x + 12 + (i % 2) * (ph.w / 2 - 6), y = top + 34 + Math.floor(i / 2) * 92; out.push(text(x, y, ph.w / 2 - 14, v, { size: 46, font: HD, weight: 900, color: paper, wrap: false, leading: 1, label: 'Stat value', role: 'HERO' }), text(x, y + 50, ph.w / 2 - 14, l, { size: 9, font: O, weight: 500, color: alpha(paper, .8), tracking: .16, wrap: false, label: 'Stat label', role: 'CAPTION' })); });
        out.push(...photo(ctx, ph.x, top + 240, ph.w, 220, { tone: 'light', caption: 'The hardware store, 6:10 a.m.', label: 'Inset photograph' }), ...caption(ph.x, top + 466, ph.w, 'Where Okafor stocked shelves two summers ago. The schedule is still on the door.', 'Photograph Kofi Mensah', { font: O, color: ink, size: 9, transform: 'none' }));
        const sy = 820;
        out.push(...slab(G.x, sy, 168, 'Season, game by game', navy));
        const res = [['W', '102–97'], ['W', '88–80'], ['L', '91–94'], ['W', '110–99'], ['W', '97–95'], ['W', '84–70'], ['L', '99–101'], ['W', '105–92'], ['W', '93–90'], ['W', '98–96']];
        const cw = (G.w - 9 * 6) / 10;
        res.forEach(([r, sc], i) => { const x = G.x + i * (cw + 6); out.push(rect(x, sy + 38, cw, 64, r === 'W' ? navy : accent, { label: r === 'W' ? 'Win' : 'Loss', role: 'ORNAMENT' }), text(x, sy + 40, cw, r, { size: 38, font: HD, weight: 900, color: paper, align: 'center', wrap: false, leading: 1, label: 'Result', role: 'HERO' }), text(x, sy + 84, cw, sc, { size: 8.5, font: O, weight: 500, color: alpha(paper, .85), align: 'center', wrap: false, label: 'Score', role: 'CAPTION' })); });
      } else {
        out.push(rect(G.x, 76, G.w, 190, accent, { label: 'Pull quote slab', role: 'ORNAMENT' }));
        out.push(...pullQuote(G.x + 20, 90, G.w - 40, '“You just have to be standing still when it gets there.”', 'DANI OKAFOR  ·  HARBOR GUARD', { font: HD, size: 66, weight: 900, color: paper, leading: .92, rule: 'none', attribFont: O, attribColor: paper, transform: 'uppercase' }));
        const top = 296, tx = spanOf(c, 0, 3), cols2 = columns(tx.x, tx.w, 2, 14);
        const rr = balance(S_PARAS.slice(4).join('\n') + '\n' + 'Denver, then, is the test. A home crowd of twenty thousand, a defence that has held eight of its last ten opponents under ninety, and a travelling party that left the arena after midnight. If Okafor is tired, she does not say so. If she is nervous, she says only that she has packed the same sandwich, and that it is, as always, the correct sandwich.\nSomewhere in a hardware store a manager checks the clock. He has a new sheet of paper in his drawer, ready to tape inside the staff-room door beside the old one. It is headed, in his own careful capitals, SHE’S ON.', colFrames(cols2, top, 700), { ...body, size: 10.8, lead: 15 });
        warnFlow('overtime p8', rr); out.push(...rr.objs);
        const pc = spanOf(c, 4, 5);
        out.push(rect(pc.x, top, pc.w, 214, mix(ink, .93), { label: 'Player card', role: 'SIDEBAR' }), ...photo(ctx, pc.x + 10, top + 10, 66, 82, { tone: 'light', silent: true, label: 'Player headshot' }), text(pc.x + 86, top + 8, pc.w - 96, 'DANI\nOKAFOR', { size: 28, font: HD, weight: 900, color: ink, leading: .9, wrap: false, label: 'Player name', role: 'HEADLINE' }), text(pc.x + 86, top + 64, pc.w - 96, 'GUARD · #23 · 6′ 0″', { size: 9.5, font: O, weight: 500, color: accent, tracking: .1, wrap: false, label: 'Player position', role: 'LABEL' }));
        [['PPG', '24.1'], ['APG', '6.3'], ['3P%', '41.8'], ['CLUTCH', '61.0']].forEach(([k, v], i) => out.push(text(pc.x + 10 + i * 52, top + 108, 50, k, { size: 8.5, font: O, weight: 600, color: alpha(ink, .6), tracking: .16, wrap: false, label: 'Stat key', role: 'LABEL' }), text(pc.x + 10 + i * 52, top + 122, 50, v, { size: 24, font: HD, weight: 900, color: ink, wrap: false, leading: 1, label: 'Stat value', role: 'HERO' })));
        out.push(...sparkBars(pc.x + 10, top + 160, pc.w - 20, 42, [3, 5, 4, 7, 6, 9, 8, 11], alpha(ink, .35), accent));
        out.push(...slab(pc.x, top + 230, pc.w, 'Fast facts', navy), ...['Age 27, born in Tulsa', 'Draft: undrafted, 2023', 'Signed with Harbor, 2025', 'Favourite sandwich: egg and chive'].map((t, i) => text(pc.x + 4, top + 268 + i * 22, pc.w - 8, t, { size: 10, font: B, color: ink, label: 'Fast fact', role: 'SIDEBAR' })));
        out.push(...photo(ctx, G.x, 740, spanOf(c, 0, 3).w, 200, { tone: 'light', caption: 'Court behind the old school, resurfaced', label: 'Inset photograph' }), ...caption(spanOf(c, 4, 5).x, 740, spanOf(c, 4, 5).w, 'The court behind Okafor’s old school, resurfaced last spring. The hoops are new. The graffiti, she insisted, stays.', 'Photograph Kofi Mensah', { font: O, color: ink, size: 10, transform: 'none' }));
        out.push(...slab(spanOf(c, 4, 5).x, 850, spanOf(c, 4, 5).w, 'Points by quarter', navy), ...barChart(spanOf(c, 4, 5).x, 884, spanOf(c, 4, 5).w, 56, [['Q1', 22], ['Q2', 26], ['Q3', 24], ['Q4', 26]], { font: O, ink, accent, size: 8, highlight: 3, gap: 8, barColor: navy, grid: false }));
      }
      out.push(...head(pageIndex === 6 ? 'Cover story' : 'Cover story  ·  cont.'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 10, 40, 560, '23', { size: 560, font: HD, weight: 900, color: mix(ink, .92), wrap: false, leading: 1, label: 'Jersey numeral', role: 'ORNAMENT' }));
      out.push(...slab(G.x, 76, 130, 'Locker room'));
      out.push(text(G.x - 2, 100, 640, 'ONE BREATH\nBEFORE THE SHOT', { size: 76, font: HD, weight: 900, color: ink, leading: .86, wrap: false, label: 'Interview headline', role: 'HEADLINE' }));
      const left = spanOf(c, 0, 3), right = spanOf(c, 4, 5);
      let y = 290;
      S_QA.forEach(([q, a], i) => {
        const qq = text(left.x, y, left.w, q, { size: 21, font: HD, weight: 900, color: accent, leading: 1.02, tracking: .02, transform: 'uppercase', label: 'Question', role: 'KICKER' });
        const aa = text(left.x, below(qq, 5), left.w, a, { size: 10.8, font: B, color: ink, leading: 1.45, label: 'Answer', role: 'BODY' });
        out.push(qq, aa); y = below(aa, 20);
      });
      out.push(...photo(ctx, right.x, 290, right.w, 330, { tone: 'light', caption: 'Dani Okafor', label: 'Portrait' }), ...caption(right.x, 626, right.w, 'Okafor after practice, still in warm-ups. The elbow, she says, is fine.', 'Photograph Kofi Mensah', { font: O, color: ink, size: 9.5, transform: 'none' }));
      out.push(...stat(right.x, 730, right.w, '23', 'The number she asked for at fourteen, and has not changed since', ink, navy, 76));
      out.push(...head('Locker room'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, navy)];
      out.push(text(G.x - 2, 70, 700, 'THE SEQUENCE', { size: 108, font: HD, weight: 900, color: paper, wrap: false, leading: 1, label: 'Essay headline', role: 'HEADLINE' }), text(G.x, 178, 460, 'One shot, twelve frames, 1.4 seconds. Photographed at 40 frames a second from the baseline.', { size: 14, font: O, weight: 400, color: alpha(paper, .85), leading: 1.35, label: 'Essay intro', role: 'DECK' }));
      out.push(...photo(ctx, G.x, 230, G.w, 410, { tone: 'dark', caption: 'Frame 07 · release · +0.62 s', label: 'Hero frame' }), rect(G.x, 600, 70, 40, accent, { label: 'Frame tag' }), text(G.x, 604, 70, '07', { size: 30, font: HD, weight: 900, color: paper, align: 'center', wrap: false, leading: 1, label: 'Frame number', role: 'FOLIO' }));
      const fw = (G.w - 5 * 8) / 6;
      for (let i = 0; i < 6; i++) { const x = G.x + i * (fw + 8); out.push(...photo(ctx, x, 664, fw, 150, { tone: 'dark', silent: true, label: `Sequence frame ${i + 1}` }), rect(x, 664, fw, 18, i === 3 ? accent : alpha(paper, .85), { label: 'Frame header', role: 'ORNAMENT' }), text(x + 5, 667, fw - 10, `${String(i * 2 + 1).padStart(2, '0')}`, { size: 11, font: O, weight: 700, color: i === 3 ? paper : ink, wrap: false, label: 'Frame number', role: 'LABEL' }), text(x, 822, fw, `+${(i * 0.24).toFixed(2)} s`, { size: 9, font: O, weight: 500, color: alpha(paper, .75), tracking: .1, wrap: false, label: 'Timecode', role: 'CAPTION' })); }
      out.push(...caption(G.x, 856, G.w * .6, 'From the top: the pass arrives; Okafor’s feet are already set; the release at 0.62 s; the follow-through with the elbow held; the ball in flight; the net, 1.31 s later.', 'Photographs Kofi Mensah  ·  Edited by Marguerite Ellis', { font: O, color: paper, creditColor: alpha(paper, .6), size: 10.5, transform: 'none' }));
      out.push(text(G.x + G.w * .66, 862, G.w * .34, '“The shot is just the receipt.”', { size: 26, font: HD, weight: 900, color: accent, leading: 1, label: 'Quote', role: 'PULLQUOTE' }));
      out.push(...head('Photo essay', paper));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 70, 700, 'THE ROSTER', { size: 108, font: HD, weight: 900, color: ink, wrap: false, leading: 1, label: 'Colophon title', role: 'HEADLINE' }), rect(G.x + 440, 118, G.w - 440, 14, accent, { label: 'Colophon bar' }));
      const roster: Array<[string, string, string]> = [['01', 'Kofi Mensah', 'Editor-in-chief'], ['02', 'Marcus Teller', 'Senior writer, basketball'], ['03', 'Marta Ilves', 'Soccer editor'], ['04', 'Priya Raman', 'Track & field'], ['05', 'Daniel Achebe', 'Publisher'], ['06', 'Marguerite Ellis', 'Photo editor'], ['07', 'Hollis Grange', 'Design'], ['08', 'Sofia Lindgren', 'Advertising'], ['09', 'Tobias Wren', 'Copy chief'], ['10', 'Rhea Kapoor', 'Subscriptions']];
      roster.forEach(([n, name, role], i) => { const x = G.x + (i % 2) * (G.w / 2 + 6), y = 190 + Math.floor(i / 2) * 64, w = G.w / 2 - 6; out.push(rect(x, y, w, 52, mix(ink, .94), { label: 'Roster row', role: 'SIDEBAR' }), rect(x, y, 44, 52, i === 0 ? accent : navy, { label: 'Roster number box' }), text(x, y + 6, 44, n, { size: 30, font: HD, weight: 900, color: paper, align: 'center', wrap: false, leading: 1, label: 'Roster number', role: 'FOLIO' }), text(x + 56, y + 4, w - 64, name.toUpperCase(), { size: 20, font: HD, weight: 900, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' }), text(x + 56, y + 30, w - 64, role.toUpperCase(), { size: 9.5, font: O, weight: 500, color: alpha(ink, .65), tracking: .16, wrap: false, label: 'Credit role', role: 'CAPTION' })); });
      const rules: Array<[string, string]> = [['SUBSCRIPTIONS', '52 issues, $124 a year. overtimeweekly.example/join or 1 800 555 0114. Gift subscriptions include a signed print.'], ['LETTERS', 'Overtime, 60 Pier Road, Harbor City HB4 2PR. letters@overtimeweekly.example. We read every one and print the angriest.'], ['ADVERTISING', 'Full page 8.375 × 10.875 in plus 0.125 in bleed. Rate card and closing dates at overtimeweekly.example/advertise.'], ['RULES OF THE HOUSE', '© 2026 Overtime Media. Photographs are the property of their creators. Scores are correct as of Tuesday night and not a minute after.']];
      rules.forEach(([h, t], i) => { const x = G.x + (i % 2) * (G.w / 2 + 6), y = 540 + Math.floor(i / 2) * 150, w = G.w / 2 - 6; out.push(...slab(x, y, w, h, i === 0 ? accent : navy, paper, 12), text(x, y + 38, w, t, { size: 10.5, font: B, color: ink, leading: 1.5, label: 'Colophon text', role: 'BODY' })); });
      out.push(...barcodeBox(G.x, 860, 136, 70, { plate: paper, ink, seed, code: 'ISSN 2140-9031', note: 'WEEK 14  VOL. 9', font: 'ibmPlexMono' }));
      out.push(...head('The Roster'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, navy)];
      out.push(rect(-30, 26, W + 60, 90, accent, { rotation: -2, label: 'Masthead banner' }), text(36, 30, W - 72, 'THIS WEEK', { size: 96, font: HD, weight: 900, color: paper, wrap: false, leading: 1, rotation: -2, label: 'Back cover title', role: 'COVER_TITLE' }));
      const games: Array<[string, string, string, string]> = [['SAT 10', 'HARBOR  at  DENVER', '8:30 PM ET', 'SPORTS 1'], ['SAT 10', 'UNITED  vs  RIVERSIDE', '3:00 PM ET', 'CITY TV'], ['SUN 11', 'SUMMIT  at  PIONEERS', '1:00 PM ET', 'SPORTS 2'], ['SUN 11', 'BLUFFS  vs  FOUNDRY', '4:30 PM ET', 'SPORTS 1'], ['MON 12', 'AUSTIN  at  RAPIDS', '8:00 PM ET', 'SPORTS 1'], ['TUE 13', 'LAKERS FC  vs  IRONSIDE', '7:30 PM ET', 'STREAM']];
      games.forEach(([d, g, t, n], i) => { const y = 170 + i * 78; out.push(hr(G.x, y, G.w, alpha(paper, .3), .75, { label: 'Schedule rule' }), text(G.x, y + 8, 110, d, { size: 34, font: HD, weight: 900, color: accent, wrap: false, leading: 1, label: 'Date', role: 'LABEL' }), text(G.x + 130, y + 6, 420, g, { size: 44, font: HD, weight: 900, color: paper, wrap: false, leading: 1, label: 'Fixture', role: 'HEADLINE' }), text(G.right - 190, y + 8, 190, t, { size: 18, font: O, weight: 500, color: paper, align: 'right', wrap: false, label: 'Time', role: 'LABEL' }), text(G.right - 190, y + 34, 190, n, { size: 11, font: O, weight: 500, color: alpha(paper, .6), tracking: .2, align: 'right', wrap: false, label: 'Network', role: 'CAPTION' })); });
      out.push(text(G.x, 680, 700, 'NEXT WEEK', { size: 12, font: O, weight: 600, color: accent, tracking: .3, wrap: false, label: 'Next kicker', role: 'KICKER' }), text(G.x - 2, 698, 740, 'THE FOUR-MINUTE\nMILE, REWRITTEN', { size: 90, font: HD, weight: 900, color: paper, leading: .86, wrap: false, label: 'Next headline', role: 'COVER_LINE' }));
      out.push(...barcodeBox(640, 936, 136, 66, { plate: paper, ink: navy, seed, code: '0 74470 14014 2', note: 'OVERTIME 14 / 2026', font: 'ibmPlexMono' }), text(40, 960, 400, 'OVERTIME  ·  THE WEEKLY OF THE GAME  ·  $5.99', { size: 11, font: O, weight: 500, color: alpha(paper, .7), tracking: .22, wrap: false, label: 'Imprint', role: 'LABEL' }));
      return out;
    }
  }
};

// __EXPORTS__
export const DESIGNS_A: Record<string, PublicationDesigner> = {
  'mag-sports-weekly': overtime,
  'mag-culture-quarterly': lyceum,
  'mag-fashion-monthly': vesper,
  'mag-tech-review': vector,
};

export const LESSONS_A: Record<string, DesignLesson> = {
  'mag-sports-weekly': {
    principle: 'A sports weekly is built from loud and quiet in alternation: huge condensed headlines and stat boxes for the scan, a plain narrow text column for the read.',
    history: 'Sports magazines took their look from the poster and the scoreboard. Sports Illustrated, launched in 1954, paired large action photography with tight condensed headlines, while tabloids like the New York Daily News taught the trade that a single word set enormously could carry a front page. Condensed gothics such as Franklin Gothic and, later, Knockout and Big Shoulders descend from wood-type used on nineteenth-century handbills for races and prize fights.',
    tryThis: 'Change the cover headline to two other words, then adjust the stat chips so the numbers say the same thing as the headline. Does the chip row now compete with the cover line, or support it?',
    interestTag: 'Sports magazines',
    related: ['Condensed type', 'Data callouts', 'Magazine design'],
  },
  'mag-culture-quarterly': {
    principle: 'Wide outer margins are not wasted space: they are where the page thinks aloud, holding glosses, speaker names and notes beside a single, unhurried column of text.',
    history: 'The marginal gloss descends from the manuscript page, where scribes and readers wrote commentary beside the text; the printed book kept the habit in shoulder notes and in the generous margins of Renaissance humanist editions such as those from the Aldine Press. Twentieth-century literary quarterlies from the Hogarth Press to the Paris Review kept the quiet, text-first page, with small capitals, numbered plates and discreet running heads. The format signals that reading, not scanning, is expected.',
    tryThis: 'Write three one-line glosses for the essay in the margin column, then delete the pull quote. Notice how the page now has two voices, and which one a reader hears first.',
    interestTag: 'Literary magazines',
    related: ['Book typography', 'Marginalia', 'Magazine design'],
  },
  'mag-tech-review': {
    principle: 'Make the number the hero: a data callout at 60 px and a labelled figure teach faster than a paragraph, so the text can stay small and quiet around them.',
    history: 'Science and technology magazines grew out of the nineteenth-century journal, where engraved figures carried the argument, and were reshaped by the grotesque sans-serifs and modular grids of Swiss-influenced design after the 1950s. Publications such as Scientific American and later Wired showed that diagrams, numbered figures and annotated cutaways could be the main event, not decoration. Monospaced type for measurements recalls the instrument readout.',
    tryThis: 'Replace the line chart data with your own series, then cut the paragraph beside it in half. Does the figure now carry the argument by itself?',
    interestTag: 'Technology & science magazines',
    related: ['Information design', 'Data visualisation', 'Magazine design'],
  },
  'mag-fashion-monthly': {
    principle: 'Let one crop and one Didone masthead carry the issue: scale and contrast do the selling, so the captions can stay tiny and tight.',
    history: 'The fashion monthly was built by art directors such as Alexey Brodovitch at Harper’s Bazaar in the 1930s–50s, who treated the spread as a stage for photography, white space and high-contrast Didone type. Later directors kept the formula: a hairline-thin masthead, one cover line, full-bleed pictures and credits set in a quiet sans. Fashion pages are still designed around the photograph and the gutter, not the grid.',
    tryThis: 'Swap the cover photograph, then shrink the masthead until it just touches the model’s head. Notice how the issue slug and cover line must move to keep the diagonal.',
    interestTag: 'Fashion editorial',
    related: ['Magazine design', 'Didone type', 'Art direction'],
  },
};
