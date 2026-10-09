// magazinesC — MAGAZINE systems 9–12 (see magazines.ts for the registry and docs/tela/PUBLICATION_DESIGN_BRIEF.md).
//
// Indie literary journal · community digest · kids & family · photojournalism. Same twelve-page issue
// structure as magazinesA/B (cover · contents | letter · department | ad · feature opener | feature body ·
// feature body | interview · photo essay | colophon · back cover); art on the trim runs 0.125in into bleed.
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import {
  BL, SAFE, geo, spanOf, ground, photo, rule, vrule, caption, label, runHead, flow, balance, colFrames, pullQuote, sidebar, barcodeBox, adSlot, fade, slug, warnFlow, bottomOf, barChart, lineChart, sparkBars,
  rect, hr, vr, text, below, columns, mix, alpha, orn, type Grid, type Obj,
} from './magazineKit';
import { circle, ellipse, path, line } from '../../templateKit';

// ═════════════════════════════════════════════════════════════════════════════
// 9 · QUIRE — indie literary journal. Small trim, poems and fiction, no photographs.
//     Trim 6 × 9 in (576 × 864 px), perfect bound. 6-column grid, 17 px baseline; a single text measure.
// ═════════════════════════════════════════════════════════════════════════════
const QG: Grid = { cols: 6, gutter: 12, base: 17, top: 80, bottom: 88, inner: 68, outer: 52 };
const Q_PARAS = [
  'The first thing the water did, when it came into the village, was to take the sound out of things. Maren noticed it the way you notice a clock has stopped: not at once, but as a kind of widening in the room. The dog stopped barking. The road, which had been all gravel and engine, went quiet and bright. By noon the church bell was ringing under water, a slow green note that nobody was ringing at all.',
  'Her mother had said to move the photographs upstairs. Her mother was upstairs herself, in the narrow bed by the window, with a blanket over her knees and a transistor radio that hissed from a long way off. “Don’t fuss,” she said. “It has been here before.” Maren carried the photographs up anyway, a few at a time, the way one carries bread.',
  'There were nineteen of them in the hall, in the hall’s yellow light: a wedding, three christenings, a man holding a fish. A girl in a school coat she did not remember wearing. She was seven in the picture, squinting, one sock down. Behind her, in the grey field, was a line on the wall of the barn, a pale horizontal scar, and beneath it in her father’s hand: 1953.',
  'She had never asked what the scar was. It had been there, like the hill, like her mother’s long refusals. Now the water had come to it and stopped, politely, a hand’s breadth under the old mark, as if it had been introduced. Maren stood at the window and watched it sit there, brown and unhurried, the exact height of everything that had ever happened to them.',
  '“Come away from the glass,” her mother called. “You’ll catch your death.” But Maren stayed, and the afternoon went by without any sound, and the light on the water changed from copper to pewter to a kind of milk. A heron stood on the gatepost, thinking. Down the lane a door floated by, quite slowly, with its letterbox open, like a mouth about to say something.',
  'At dusk her mother asked for the radio to be turned off, and for the window to be opened, and for the lamp. They sat together without speaking. It was the longest Maren had been in the same room as her mother in eleven years, and what she felt was not forgiveness, exactly, nor even peace, but a sort of weight lifting and settling, as water does when it finds its level.',
  'In the morning the line on the barn was dry. The water had gone as it had come, without fuss, leaving behind a thin skin of silt and the smell of a different country. Maren went down in her father’s boots and stood in the garden and looked at the mark, and then, with a pencil from her coat, she wrote beneath it, small, in her own hand, the year.',
];
const Q_POEMS: Array<[string, string, string]> = [
  ['Inventory of a Small Kitchen', 'One kettle, dented on the left\nwhere my father dropped it in 1994.\nThree spoons that do not match.\nA knife that has opinions.\nThe window, which has never once\nbeen shut against the weather,\nand a calendar from a garage\nthat closed before I could read.\nNothing here is mine. Everything\nis how I know where to stand.', 'NIAMH BRENNAN'],
  ['What the Tide Table Says', 'High water at ten past six.\nLow at a quarter to one.\nBetween the two, the harbour\npractises being a field.\nBoats lean on their elbows.\nThe gulls hold a small parliament.\nI check the table again,\nas if it might say something else,\nas if the sea might read it too\nand decide, this once, to be early.', 'NIAMH BRENNAN'],
];
const Q_QA: Array<[string, string]> = [
  ['Where does a poem start for you?', 'Usually with something I have overheard and cannot stop hearing. A woman in a shop saying “it has been here before” about a flood. The rest is just walking around the sentence until it turns into a room.'],
  ['Do you revise a lot?', 'Obsessively, and mostly by taking things out. A poem is finished when I can no longer find the next thing to delete without losing its heartbeat.'],
  ['What makes a good ending?', 'An ending should feel like a door that was always in the wall. You should not see it until you are standing at it.'],
  ['Who do you read when you are stuck?', 'Old recipes, tide tables and bus timetables. They are the quietest poetry we have: nothing but information, and all of it hopeful.'],
  ['What would you tell a young writer?', 'Keep a small notebook. Write down what people say when they think no one is listening. Then, please, be kind with it.'],
];

const quire: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, QG), c = G.cols;
  const D = 'gloock' as const, T = 'lora' as const, M = 'dmMono' as const;
  const body = { font: T, size: 10.6, lead: 17, color: ink, weight: 400, indent: 18, role: 'BODY' as const };
  const head = (running: string) => [
    text(G.x, 40, G.w, running.toUpperCase(), { size: 7.5, font: M, weight: 500, color: alpha(ink, .7), tracking: .24, align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    hr(G.x, 58, G.w, accent, 1.25, { label: 'Running head rule' }),
    text(G.verso ? G.x : G.right - 40, H - 54, 40, String(G.pageNo), { size: 10, font: D, color: ink, align: G.verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
  ];
  const stars = (cx: number, y: number): Obj => text(cx - 30, y, 60, '*   *   *', { size: 11, font: T, color: accent, align: 'center', wrap: false, label: 'Section break', role: 'ORNAMENT' });
  const sig = (x: number, y: number, h = 70) => [vrule(x, y, h, alpha(ink, .25), .75, 'Signature stitch')];

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      // sewn-signature motif down the spine edge
      for (let i = 0; i < 7; i++) out.push(vrule(28 + i * 6, 0, H, alpha(ink, .08 + i * .018), .75, 'Signature fold'), ...(i % 2 ? [] : [rect(24 + i * 6, 120 + i * 110, 3, 26, accent, { label: 'Stitch', role: 'ORNAMENT' })]));
      out.push(rect(0, 0, 14, H, accent, { label: 'Spine band', role: 'ORNAMENT' }));
      out.push(text(88, 62, 420, 'A JOURNAL OF NEW FICTION & POETRY', { size: 7.5, font: M, weight: 500, color: ink, tracking: .3, wrap: false, label: 'Tagline', role: 'LABEL' }));
      out.push(text(78, 96, 480, 'Quire', { size: 160, font: D, color: ink, tracking: -.03, wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(hr(88, 290, W - 140, ink, 1.5, { label: 'Masthead rule' }), text(88, 300, 300, 'NUMBER 12  ·  AUTUMN 2026', { size: 7.5, font: M, weight: 500, color: ink, tracking: .26, wrap: false, label: 'Issue line', role: 'LABEL' }), text(W - 252, 300, 200, '$14  ·  £11  ·  €13', { size: 7.5, font: M, weight: 500, color: ink, tracking: .2, align: 'right', wrap: false, label: 'Price line', role: 'PRICE' }));
      const list: Array<[string, string]> = [['Aoife Callahan', 'The Weight of Water, a story'], ['Niamh Brennan', 'Two poems, and a conversation'], ['Ravi Anand', 'The Small Hours, a story'], ['Pilar Duarte', 'Notes on the Lost Letter'], ['Comfort Adeyemi', 'Four poems from the coast']];
      list.forEach(([a, t], i) => out.push(text(88, 376 + i * 66, W - 140, t, { size: i === 0 ? 27 : 21, font: D, color: i === 0 ? accent : ink, wrap: false, label: 'Cover line', role: 'COVER_LINE' }), text(88, 376 + i * 66 + (i === 0 ? 34 : 28), W - 140, a.toUpperCase(), { size: 7.5, font: M, weight: 500, color: alpha(ink, .7), tracking: .26, wrap: false, label: 'Cover line author', role: 'COVER_LINE' })));
      out.push(hr(88, 722, 40, ink, 1.5, { label: 'Short rule' }), text(88, 736, 400, 'Published three times a year in an edition of 1,200, on paper that wants to be held.', { size: 11, font: T, italic: true, color: alpha(ink, .85), leading: 1.55, label: 'Epigraph', role: 'DECK' }));
      out.push(...barcodeBox(W - 52 - 104, H - 84, 104, 50, { plate: paper, ink, seed, code: 'ISSN 2418 6603', note: 'QUIRE 12', font: M }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 90, G.w, 'Contents', { size: 54, font: D, color: ink, wrap: false, label: 'Contents title', role: 'HEADLINE' }), text(G.x, 156, G.w, 'NUMBER 12  ·  AUTUMN 2026', { size: 7.5, font: M, weight: 500, color: accent, tracking: .28, wrap: false, label: 'Issue line', role: 'LABEL' }));
      const secs: Array<[string, Array<[string, string, string]>]> = [['Fiction', [['11', 'The Weight of Water', 'Aoife Callahan'], ['34', 'The Small Hours', 'Ravi Anand']]], ['Poems', [['7', 'Inventory of a Small Kitchen', 'Niamh Brennan'], ['8', 'What the Tide Table Says', 'Niamh Brennan'], ['44', 'Four poems from the coast', 'Comfort Adeyemi']]], ['Essays & Conversation', [['22', 'Notes on the Lost Letter', 'Pilar Duarte'], ['30', 'A Conversation with Niamh Brennan', 'Edited by the editors']]], ['Broadside', [['32', 'High Water', 'A poem to be pinned up']]]];
      let y = 196;
      secs.forEach(([h, items]) => { out.push(text(G.x, y, G.w, h.toUpperCase(), { size: 7.5, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Section', role: 'KICKER' })); y += 22; items.forEach(([p, t, a]) => { out.push(text(G.x, y, 34, p, { size: 12, font: D, color: ink, wrap: false, label: 'Contents folio', role: 'FOLIO' }), text(G.x + 40, y, G.w - 40, t, { size: 17, font: T, italic: true, color: ink, wrap: false, label: 'Contents title', role: 'HEADLINE' }), text(G.x + 40, y + 24, G.w - 40, a.toUpperCase(), { size: 7, font: M, weight: 500, color: alpha(ink, .65), tracking: .22, wrap: false, label: 'Contents author', role: 'BYLINE' }), hr(G.x + 40, y + 42, G.w - 40, alpha(ink, .2), .5, { label: 'Contents rule', dash: [1, 3] })); y += 52; }); y += 12; });
      out.push(text(G.x, 770, G.w, 'Cover: lithograph after a sketch of the River Slaney in flood, from the editors’ collection.', { size: 9, font: T, italic: true, color: alpha(ink, .7), leading: 1.55, label: 'Cover note', role: 'CAPTION' }));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 90, G.w, 'FROM THE EDITORS', { size: 7.5, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(G.x, 110, G.w, 'On the small, difficult pleasure of finishing a sentence.', { size: 34, font: D, color: ink, leading: 1.08, label: 'Letter headline', role: 'HEADLINE' });
      out.push(t);
      const letter = 'Every issue of Quire begins with a pile. This autumn the pile was four hundred and eleven submissions, delivered mostly by email, some by post, and one, memorably, by hand, through the letterbox, by a man who then ran away. We read them on trains, in kitchens, and on the kind of bench where nobody can find you.\nWhat we look for is difficult to say and easy to feel. A sentence that has been finished, not merely stopped. A line break that knows where the breath goes. A story that trusts the reader enough to leave a door open at the end.\nThis issue we found it in a flood. Aoife Callahan’s story, which opens on page 11, puts a village under water and keeps its voice entirely dry; Niamh Brennan’s poems, which open the book, keep a kitchen and a harbour in exact, unshowy order. Between them are a sailor’s letter, a long essay on handwriting, and four poems from the coast that we wish we had written.\nQuire is made by three people and a very patient printer. We pay our contributors, which is the best thing we do, and we reply to everyone, which is the hardest. Thank you for reading, and for sending.';
      const r = flow(letter, [{ x: G.x, y: below(t, 30), w: G.w, b: 780 }], body, { dropCap: { lines: 3, font: D, color: accent, weight: 400, scale: 1.05 } }); warnFlow('quire letter', r); out.push(...r.objs);
      out.push(text(G.x, bottomOf(r.objs) + 18, G.w, 'The editors', { size: 17, font: T, italic: true, color: ink, align: 'right', wrap: false, label: 'Signature', role: 'BYLINE' }), stars(G.x + G.w / 2, bottomOf(r.objs) + 56));
      out.push(...head('From the editors'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 90, G.w, 'POEMS', { size: 7.5, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
      Q_POEMS.forEach(([t, p, a], i) => { const y0 = 112 + i * 340; out.push(text(G.x, y0, G.w, t, { size: 28, font: D, color: ink, leading: 1.1, label: 'Poem title', role: 'HEADLINE' })); const ptx = text(G.x + 24, y0 + 54, G.w - 24, p, { size: 11.6, font: T, color: ink, leading: 1.48, label: 'Poem', role: 'BODY' }); out.push(ptx, text(G.x + 24, below(ptx, 12), G.w - 24, a, { size: 7.5, font: M, weight: 500, color: alpha(ink, .65), tracking: .28, wrap: false, label: 'Poet', role: 'BYLINE' })); if (i === 0) out.push(stars(G.x + G.w / 2, y0 + 304)); });
      out.push(...head('Poems'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(G.x, 96, G.w, 360, { fill: mix(ink, .94), ink, accent, font: M, kind: 'Advertisement  ·  half page', spec: 'Half page  ·  4.5 × 5.2 in  ·  no bleed  ·  black & white or CMYK, 300 dpi', live: 12 }));
      out.push(text(G.x, 464, G.w, 'ADVERTISEMENT', { size: 7, font: M, weight: 500, color: alpha(ink, .5), tracking: .3, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(hr(G.x, 508, 40, accent, 1.5, { label: 'Short rule' }), text(G.x, 524, G.w, 'Send us your best.', { size: 36, font: D, color: ink, wrap: false, label: 'House ad headline', role: 'HEADLINE' }), text(G.x, 578, G.w, 'Quire reads fiction to 6,000 words and poems in groups of three, from 1 March to 15 April and from 1 September to 15 October. We pay $60 a page for prose and $80 a poem, and we answer, by hand, within eight weeks.', { size: 11, font: T, color: ink, leading: 1.6, label: 'House ad copy', role: 'BODY' }));
      out.push(text(G.x, 692, G.w, 'quirejournal.example/submit', { size: 10, font: M, weight: 500, color: accent, tracking: .16, wrap: false, label: 'House ad URL', role: 'LABEL' }), text(G.x, 724, G.w, 'Subscribe: three issues, $36, with a letterpress broadside. Gift subscriptions are wrapped in brown paper and string.', { size: 10, font: T, italic: true, color: alpha(ink, .8), leading: 1.6, label: 'House ad note', role: 'CAPTION' }));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 150, G.w, 'FICTION', { size: 7.5, font: M, weight: 500, color: accent, tracking: .4, align: 'center', wrap: false, label: 'Kicker', role: 'KICKER' }), hr(W / 2 - 20, 176, 40, accent, 1.5, { label: 'Short rule' }));
      const t = text(G.x, 206, G.w, 'The Weight\nof Water', { size: 66, font: D, color: ink, align: 'center', leading: 1.02, tracking: -.01, label: 'Feature headline', role: 'HEADLINE' });
      out.push(t, text(G.x, below(t, 26), G.w, 'a story by', { size: 12, font: T, italic: true, color: alpha(ink, .8), align: 'center', wrap: false, label: 'By', role: 'BYLINE' }), text(G.x, below(t, 50), G.w, 'AOIFE CALLAHAN', { size: 11, font: M, weight: 500, color: ink, tracking: .36, align: 'center', wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(path(W / 2 - 40, 520, 80, 24, orn.wavePath(3, 24, 14), accent, { label: 'Water motif' }));
      out.push(text(G.x + 40, 600, G.w - 80, '“It has been here before.”', { size: 15, font: T, italic: true, color: alpha(ink, .85), align: 'center', wrap: false, label: 'Epigraph', role: 'CAPTION' }), text(G.x + 40, 626, G.w - 80, 'after a woman in a shop, October 2025', { size: 7.5, font: M, weight: 500, color: alpha(ink, .6), tracking: .24, align: 'center', wrap: false, label: 'Epigraph source', role: 'CAPTION' }));
      out.push(text(G.x, 760, G.w, 'Aoife Callahan lives on the Slaney. This is her first story in Quire. It is, she says, about the weight of water, and the weight of not asking.', { size: 9.5, font: T, italic: true, color: alpha(ink, .75), leading: 1.6, align: 'center', label: 'Author note', role: 'CAPTION' }));
      out.push(...head('Fiction'));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        const r = flow(Q_PARAS.slice(0, 4).join('\n'), [{ x: G.x, y: 96, w: G.w, b: 790 }], body, { dropCap: { lines: 3, font: D, color: accent, weight: 400, scale: 1.05 } }); warnFlow('quire p7', r); out.push(...r.objs);
        out.push(stars(G.x + G.w / 2, Math.min(bottomOf(r.objs) + 24, 770)));
      } else {
        const r = flow(Q_PARAS.slice(4).join('\n') + '\n' + 'When she went back up, her mother was asleep. The transistor had been switched on again, very low, and a man’s voice was reading the shipping forecast to the empty room. Maren stood in the doorway and listened to the names of the sea areas, one after another, like a prayer for people who did not pray: Dogger, Fisher, German Bight. She had never learned them. She found, to her surprise, that she knew them all.', [{ x: G.x, y: 96, w: G.w, b: 700 }], { ...body, indent: 18 });
        warnFlow('quire p8', r); out.push(...r.objs);
        out.push(text(G.x, bottomOf(r.objs) + 24, G.w, 'END', { size: 7.5, font: M, weight: 500, color: accent, tracking: .4, align: 'center', wrap: false, label: 'End mark', role: 'ORNAMENT' }));
        out.push(rect(G.x, 730, G.w, 56, mix(ink, .94), { label: 'Contributor note panel', role: 'SIDEBAR' }), text(G.x + 14, 740, G.w - 28, 'Aoife Callahan’s stories have appeared in several small magazines that no longer exist. She is at work on a novel about a ferry.', { size: 9.2, font: T, italic: true, color: ink, leading: 1.5, label: 'Contributor note', role: 'CAPTION' }));
      }
      out.push(...head(pageIndex === 6 ? 'The Weight of Water' : 'The Weight of Water  ·  continued'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 90, G.w, 'A CONVERSATION', { size: 7.5, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(G.x, 110, G.w, 'Niamh Brennan, on tide tables', { size: 32, font: D, color: ink, leading: 1.08, label: 'Interview headline', role: 'HEADLINE' });
      out.push(t, text(G.x, below(t, 10), G.w, 'The poet, whose two poems open this issue, talks to the editors in her kitchen.', { size: 10.5, font: T, italic: true, color: alpha(ink, .8), leading: 1.55, label: 'Interview deck', role: 'DECK' }));
      let y = below(t, 70);
      Q_QA.forEach(([q, a]) => { const qq = text(G.x, y, G.w, q, { size: 11, font: T, italic: true, weight: 600, color: accent, leading: 1.5, label: 'Question', role: 'KICKER' }); const aa = text(G.x, below(qq, 4), G.w, a, { size: 10.6, font: T, color: ink, leading: 1.6, label: 'Answer', role: 'BODY' }); out.push(qq, aa); y = below(aa, 20); });
      out.push(stars(G.x + G.w / 2, Math.min(y + 8, 780)));
      out.push(...head('A Conversation'));
      return out;
    }

    case 'PHOTO ESSAY': {
      // No photographs in Quire: the “photo essay” slot is the issue’s typographic broadside, set to be pinned up.
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 90, G.w, 'BROADSIDE', { size: 7.5, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const words: Array<[string, number, number, string]> = [['High', 96, 120, ink], ['water', 118, 214, ink], ['at ten', 64, 346, accent], ['past six.', 64, 410, ink], ['Low at a', 30, 504, ink], ['quarter to one.', 30, 540, ink]];
      words.forEach(([w_, s, y, col], i) => out.push(text(G.x + (i % 2 ? 40 : 0), y, G.w, w_, { size: s, font: D, color: col, wrap: false, leading: 1, label: 'Broadside word', role: 'HEADLINE' })));
      out.push(path(G.x, 620, G.w, 60, orn.wavePath(5, 10, 12), alpha(accent, .8), { label: 'Tide line' }), path(G.x, 650, G.w, 60, orn.wavePath(5, 10, 12, 1.5), alpha(secondary, .6), { label: 'Tide line' }));
      out.push(text(G.x, 726, G.w, 'Between the two, the harbour\npractises being a field.', { size: 14, font: T, italic: true, color: ink, leading: 1.5, label: 'Broadside lines', role: 'BODY' }), text(G.x, 780, G.w, 'NIAMH BRENNAN  ·  LETTERPRESS BROADSIDE 12, FREE TO SUBSCRIBERS', { size: 7, font: M, weight: 500, color: alpha(ink, .65), tracking: .2, wrap: false, label: 'Credit', role: 'CREDIT' }));
      out.push(...head('Broadside'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 100, G.w, 'Quire', { size: 54, font: D, color: ink, wrap: false, tracking: -.02, label: 'Colophon masthead', role: 'COVER_TITLE' }), text(G.x, 164, G.w, 'A JOURNAL OF NEW FICTION & POETRY', { size: 7, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Colophon tagline', role: 'KICKER' }), hr(G.x, 184, G.w, ink, .75, { label: 'Rule' }));
      const staff: Array<[string, string]> = [['Editor', 'Nora Fenwick'], ['Fiction editor', 'Ravi Anand'], ['Poetry editor', 'Comfort Adeyemi'], ['Design & letterpress', 'Pilar Duarte'], ['Proofs', 'Tobias Wren'], ['Publisher', 'Quire Press']];
      staff.forEach(([r_, n], i) => out.push(text(G.x, 204 + i * 44, 140, r_.toUpperCase(), { size: 7, font: M, weight: 500, color: alpha(ink, .6), tracking: .22, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(G.x + 150, 200 + i * 44, G.w - 150, n, { size: 16, font: T, italic: true, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' })));
      out.push(text(G.x, 490, G.w, 'Quire is published three times a year in Kilkenny. It is set in Gloock and Lora, printed on 100 gsm uncoated stock and sewn in signatures of sixteen pages. Trim 6 × 9 in. Edition of 1,200.', { size: 10, font: T, color: ink, leading: 1.65, label: 'Colophon text', role: 'BODY' }));
      out.push(text(G.x, 586, G.w, 'SUBSCRIBE  ·  Three issues, $36 (€33). quirejournal.example/subscribe\nSUBMIT  ·  quirejournal.example/submit. Fiction to 6,000 words; poems in threes.\nWRITE  ·  Quire, 7 Abbey Row, Kilkenny R95 X2P, Ireland.', { size: 8.5, font: M, weight: 400, color: ink, leading: 2, label: 'Contact', role: 'CAPTION' }));
      out.push(text(G.x, 690, G.w, 'All rights revert to contributors on publication. We are grateful to Arts Council funding and to the readers who send us postal orders.', { size: 9, font: T, italic: true, color: alpha(ink, .75), leading: 1.6, label: 'Rights', role: 'FOOTNOTE' }));
      out.push(...barcodeBox(G.right - 104, 752, 104, 50, { plate: paper, ink, seed, code: 'ISSN 2418 6603', note: 'NO. 12', font: M }));
      out.push(...head('Colophon'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(W - 14, 0, 14, H, accent, { label: 'Fore-edge band', role: 'ORNAMENT' }));
      out.push(text(60, 150, W - 120, '“A magazine that sounds like someone reading aloud in the next room.”', { size: 30, font: D, color: ink, leading: 1.15, label: 'Blurb quotation', role: 'COVER_LINE' }), text(60, 340, W - 120, 'THE IRISH TIMES, ON QUIRE', { size: 7.5, font: M, weight: 500, color: accent, tracking: .3, wrap: false, label: 'Attribution', role: 'CAPTION' }));
      out.push(text(60, 420, W - 120, 'In this issue: a story about a flood and a mother; two poems about kitchens and harbours; a sailor’s letter; and a long essay on the dying art of the signature. Edited in Kilkenny, printed in Cork, read, we hope, in a quiet room.', { size: 11, font: T, color: ink, leading: 1.7, label: 'Back cover copy', role: 'BODY' }));
      out.push(text(60, 640, W - 120, 'Quire', { size: 42, font: D, color: ink, wrap: false, label: 'Masthead, small', role: 'COVER_TITLE' }), ...barcodeBox(W - 52 - 104, H - 100, 104, 50, { plate: paper, ink, seed, code: 'ISSN 2418 6603', note: 'QUIRE 12', font: M }), text(60, H - 90, 300, 'quirejournal.example', { size: 8, font: M, weight: 500, color: alpha(ink, .7), tracking: .2, wrap: false, label: 'URL', role: 'LABEL' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 10 · PORCH LIGHT — community, faith & local digest. Friendly rounded type, calendar, classifieds, tear-offs.
//      Trim 8.5 × 11 in (816 × 1056 px), saddle-stitched. 6-column grid, 14 px baseline.
// ═════════════════════════════════════════════════════════════════════════════
const CG: Grid = { cols: 6, gutter: 14, base: 14, top: 84, bottom: 74, inner: 54, outer: 44 };
const C_PARAS = [
  'Every first Saturday of the month, the back room of St. Anne’s hall smells of solder, tea and lemon biscuits. Folding tables stand in rows. On each there is a lamp, a toaster, a radio or a bicycle in some state of surrender, and next to each, a neighbour holding a cup, waiting, with the expression of a patient at the dentist. The repair café is open.',
  'It is run, in the loosest sense of the word, by Rosa Delgado, seventy-one, retired electrician, who arrives at eight with a toolbox that predates the hall. Rosa does not like to be called the boss. She prefers “the person who knows where the screwdrivers are.” By nine there are eleven volunteers and a queue out of the door.',
  'The idea came from a toaster. Three winters ago Rosa’s neighbour, Mr. Okoye, threw away a perfectly good toaster because a spring had broken. Rosa fished it from the bin, fixed it with a paper clip and returned it, still warm. Mr. Okoye ate toast for a week and told everyone. The next month there were nine toasters.',
  'Since then the café has repaired more than six hundred items: lamps, kettles, a harp, three prams and a sewing machine that belonged to someone’s grandmother and had not turned since 1982. It turned for forty minutes, and a small crowd gathered to watch, as if for a christening.',
  'Not everything is saved. Rosa keeps a shelf of the lost causes, each with a handwritten tag: reason, date, apology. It is, she says, the most important shelf in the hall. “We learn from the ones we cannot fix,” she says, “and we thank them for trying.”',
  'The café needs volunteers, especially anyone who can solder, sew or listen. It also needs jars, tea, and a second kettle. Come on the first Saturday, bring something broken, and stay for the biscuits. There is, Rosa promises, nothing that cannot at least be looked at kindly.',
];
const C_QA: Array<[string, string]> = [
  ['What is the best part of your job?', 'Watching a child find out that books can be borrowed for nothing. They look at you as if you have told them a secret.'],
  ['What are people reading right now?', 'Cookbooks, gardening books and anything with a dragon. Also, strangely, a great many tax guides.'],
  ['What would you change?', 'More hours, more chairs, a better kettle. A reading room you can fall asleep in without being judged.'],
  ['What do you wish people knew?', 'That the library is not quiet. It is just considerate.'],
  ['What should a new neighbour do first?', 'Get a library card. Then come to the soup swap. Then say hello to someone you do not know.'],
];

const porchlight: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, CG), c = G.cols, r = orn.rng(seed);
  const BA = 'baloo' as const, NU = 'nunito' as const, HW = 'patrickHand' as const;
  const sun = '#F2B63D', cream2 = mix(paper, -.05), blush = mix(accent, .86), mint = mix(secondary, .86), butter = mix(sun, .8);
  const body = { font: NU, size: 10.2, lead: 15, color: ink, weight: 400, gap: 7, role: 'BODY' as const };
  const head = (section: string) => [
    text(G.verso ? G.x : G.right - 300, 40, 300, G.verso ? 'PORCH LIGHT  ·  OCTOBER' : section, { size: 9, font: BA, weight: 700, color: accent, tracking: .1, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    path(G.verso ? G.x : G.right - 14, 62, 14, 8, orn.wavePath(2, 22, 20), accent, { label: 'Wave mark' }),
    circle(G.verso ? G.x + 16 : G.right - 16, H - 44, 16, secondary, { label: 'Folio badge' }), text(G.verso ? G.x : G.right - 32, H - 55, 32, String(G.pageNo), { size: 14, font: BA, weight: 800, color: paper, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x + 40 : G.x, H - 50, G.w - 40, G.verso ? section : 'PORCHLIGHT.EXAMPLE', { size: 8.5, font: NU, weight: 700, color: alpha(ink, .6), tracking: .12, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const lamp = (cx: number, cy: number, s: number): Obj[] => [circle(cx, cy, s * 1.9, sun, { opacity: .22, label: 'Lamp glow' }), circle(cx, cy, s * 1.3, sun, { opacity: .35, label: 'Lamp glow' }), ...orn.radialLines(cx, cy, s * 1.5, s * 2.2, 16, sun, 3, { label: 'Lamp rays' }), rect(cx - s * .5, cy - s * .7, s, s * 1.3, sun, { rx: s * .3, label: 'Lamp body' }), rect(cx - s * .6, cy - s * .9, s * 1.2, s * .24, ink, { rx: 3, label: 'Lamp cap' }), rect(cx - s * .06, cy + s * .6, s * .12, s * 1.6, ink, { label: 'Lamp post' })];
  const pill = (x: number, y: number, w: number, t: string, bg: string, fg = paper, size = 9): Obj[] => [rect(x, y, w, size + 8, bg, { rx: (size + 8) / 2, label: 'Tag pill', role: 'ORNAMENT' }), text(x + 8, y + 3.5, w - 16, t, { size, font: BA, weight: 700, color: fg, align: 'center', wrap: false, label: 'Tag', role: 'KICKER' })];
  const card = (x: number, y: number, w: number, h: number, fill: string, rx = 18): Obj => rect(x, y, w, h, fill, { rx, label: 'Card', role: 'SIDEBAR' });

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(-BL, -BL, W + BL * 2, 330, mix(sun, .55), { label: 'Sky band', role: 'ORNAMENT' }), ...lamp(702, 134, 34));
      out.push(text(36, 20, 640, 'Porch', { size: 150, font: BA, weight: 800, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }), text(36, 146, 640, 'Light', { size: 150, font: BA, weight: 800, color: accent, tracking: -.02, wrap: false, leading: 1, label: 'Masthead (second word)', role: 'COVER_TITLE' }));
      out.push(text(40, 296, 500, 'YOUR NEIGHBOURHOOD DIGEST  ·  ISSUE 38  ·  OCTOBER  ·  FREE, TAKE ONE', { size: 9, font: BA, weight: 700, color: ink, tracking: .14, wrap: false, label: 'Tagline', role: 'LABEL' }));
      out.push(...photo(ctx, 40, 346, W - 80, 420, { tone: 'light', shade: cream2, rx: 32, caption: 'Cover photograph · the block party on Maple Street, last August', label: 'Cover photograph' }));
      out.push(...pill(60, 362, 150, 'BLOCK PARTY EDITION', accent, paper, 10));
      // cover lines as colour tags
      const lines: Array<[string, string, string, string]> = [['Meet the woman who fixes everything', 'Rosa Delgado’s repair café, six hundred toasters later', '24', accent], ['The October calendar', 'Soup swap, harvest supper, Halloween walk', '12', secondary], ['Who to call', 'Plumbers, babysitters, and the man with the van', '58', sun]];
      lines.forEach(([t, d, p, col], i) => { const y = 790 + i * 62; out.push(circle(64, y + 22, 22, col, { label: 'Cover bullet' }), text(42, y + 9, 44, p, { size: 15, font: BA, weight: 800, color: col === sun ? ink : paper, align: 'center', wrap: false, label: 'Cover line page', role: 'COVER_LINE' }), text(98, y, 420, t, { size: 21, font: BA, weight: 800, color: ink, wrap: false, label: 'Cover line', role: 'COVER_LINE' }), text(98, y + 26, 420, d, { size: 11, font: NU, weight: 600, color: alpha(ink, .8), wrap: false, label: 'Cover line description', role: 'COVER_LINE' })); });
      out.push(...barcodeBox(W - 40 - 118, 962, 118, 62, { plate: paper, ink, seed, code: '0 74470 38038 8', note: 'PORCH LIGHT 38', font: 'ibmPlexMono' }), text(W - 40 - 330, 800, 330, 'Delivered free to 2,400 doors by 31 neighbours on bicycles.', { size: 17, font: HW, color: accent, align: 'right', leading: 1.1, rotation: -3, label: 'Handwritten note', role: 'CAPTION' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...lamp(G.x + 40, 130, 20), text(G.x + 84, 62, 500, 'What’s inside', { size: 64, font: BA, weight: 800, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Contents title', role: 'HEADLINE' }));
      const items: Array<[string, string, string, string, string]> = [['24', 'The woman who fixes everything', 'Meet Rosa Delgado and the repair café that has mended six hundred toasters.', 'NEIGHBOURS', accent], ['12', 'October calendar', 'Soup swap, harvest supper, block party, Halloween walk and every meeting you might need.', 'WHAT’S ON', secondary], ['34', 'Five questions', 'The librarian on dragons, tax guides and why a library is not quiet.', 'PEOPLE', sun], ['44', 'Block party in pictures', 'Forty neighbours, one very long table, two sets of bunting.', 'PHOTOS', accent], ['58', 'Who to call', 'The directory: plumbers, babysitters, dog-walkers and the man with the van.', 'USEFUL', secondary], ['62', 'Classifieds & notices', 'For sale, wanted, lost, found, free to a good home.', 'NOTICE BOARD', sun]];
      items.forEach(([p, t, d, tag, col], i) => { const y = 180 + i * 110; out.push(card(G.x, y, G.w, 96, i % 2 ? cream2 : butter, 22), rect(G.x + 14, y + 14, 68, 68, col, { rx: 18, label: 'Page tile', role: 'ORNAMENT' }), text(G.x + 14, y + 22, 68, p, { size: 40, font: BA, weight: 800, color: col === sun ? ink : paper, align: 'center', wrap: false, leading: 1, label: 'Contents folio', role: 'FOLIO' }), text(G.x + 100, y + 12, G.w - 120, tag, { size: 8.5, font: BA, weight: 700, color: col === sun ? accent : col, tracking: .14, wrap: false, label: 'Section tag', role: 'KICKER' }), text(G.x + 100, y + 26, G.w - 120, t, { size: 23, font: BA, weight: 800, color: ink, wrap: false, label: 'Contents title', role: 'HEADLINE' }), text(G.x + 100, y + 56, G.w - 120, d, { size: 10.5, font: NU, weight: 500, color: alpha(ink, .85), leading: 1.4, label: 'Contents description', role: 'BODY' })); });
      out.push(rect(G.x, 860, G.w, 120, blush, { rx: 24, label: 'Dates panel', role: 'SIDEBAR' }), text(G.x + 20, 872, 300, 'MARK THE DATE', { size: 10, font: BA, weight: 800, color: accent, tracking: .16, wrap: false, label: 'Dates label', role: 'KICKER' }));
      [['SAT 3', 'Repair café'], ['SAT 17', 'Block party'], ['SAT 24', 'Harvest supper'], ['SAT 31', 'Halloween walk']].forEach(([d, e], i) => out.push(text(G.x + 20 + i * 168, 896, 160, d, { size: 32, font: BA, weight: 800, color: ink, wrap: false, leading: 1, label: 'Date', role: 'HERO' }), text(G.x + 20 + i * 168, 934, 160, e, { size: 12, font: NU, weight: 700, color: ink, wrap: false, label: 'Event', role: 'CAPTION' })));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...pill(G.x, 84, 118, 'FROM THE PORCH', accent, paper, 10));
      out.push(text(G.x - 2, 112, G.w, 'It takes a lot of lemon biscuits to make a neighbourhood.', { size: 50, font: BA, weight: 800, color: ink, tracking: -.02, leading: 1.02, label: 'Letter headline', role: 'HEADLINE' }));
      const left = spanOf(c, 0, 3), right = spanOf(c, 4, 5);
      const letter = 'We started Porch Light on a kitchen table, in the winter of a very quiet year, because we wanted to know the name of the man who walked his dog past our window at seven every morning. His name is Desmond. He has a terrier called Pickle and a bad knee. We know this now because we asked, and then we printed it.\nThat is all this magazine is, really: a way of asking. It has a calendar so you know where to go, a directory so you know who to call, and a column of notices in which you will find a lost kite, a spare piano and a free-to-a-good-home sofa that has seen better decades. Behind every page is a neighbour on a bicycle who has delivered it by hand.\nThis month we meet Rosa, who fixes things; we count down to the block party, which needs forty more chairs; and we learn that there is a bat living behind the library, who has been formally asked to keep it down.\nThank you for reading, for writing, and for waving.';
      const rr = balance(letter, colFrames(columns(left.x, left.w, 2, 16), 300, 760), body, { dropCap: { lines: 3, font: BA, color: accent, weight: 800, scale: 1.25 } }); warnFlow('porch letter', rr); out.push(...rr.objs);
      out.push(text(left.x, bottomOf(rr.objs) + 12, 300, 'Aisha & the volunteers', { size: 30, font: HW, color: accent, wrap: false, rotation: -2, label: 'Signature', role: 'BYLINE' }));
      out.push(card(right.x, 300, right.w, 300, mint, 22), text(right.x + 16, 314, right.w - 32, 'THE MAIL BAG', { size: 10, font: BA, weight: 800, color: secondary, tracking: .16, wrap: false, label: 'Mail bag label', role: 'KICKER' }), text(right.x + 16, 336, right.w - 32, '“Thank you for printing the bin collection days. My husband has stopped asking me.”', { size: 12.5, font: NU, weight: 600, italic: true, color: ink, leading: 1.45, label: 'Letter quote', role: 'BODY' }), text(right.x + 16, 440, right.w - 32, '“More recipes, please. Fewer opinions about parking.”', { size: 12.5, font: NU, weight: 600, italic: true, color: ink, leading: 1.45, label: 'Letter quote', role: 'BODY' }));
      out.push(...photo(ctx, G.x, 640, spanOf(c, 0, 3).w, 300, { tone: 'light', rx: 26, caption: 'The porch, first of the month', label: 'Letter photograph' }), ...caption(G.x, 946, spanOf(c, 0, 3).w, 'The front porch on Maple Street where the first issue was folded by hand.', 'Photograph Pablo Ferrer', { font: NU, color: ink, size: 9, transform: 'none' }));
      out.push(card(right.x, 640, right.w, 300, butter, 22), ...lamp(right.x + right.w / 2, 700, 18), text(right.x + 16, 790, right.w - 32, 'Need a hand? Know someone who does? Call the porch: 555-0138, any evening.', { size: 13, font: HW, color: ink, align: 'center', leading: 1.25, label: 'Call note', role: 'CAPTION' }));
      out.push(...head('From the porch'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 70, 600, 'October', { size: 92, font: BA, weight: 800, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Department title', role: 'HEADLINE' }), ...pill(G.x + 400, 112, 120, 'WHAT’S ON', accent, paper, 11), text(G.x + 540, 108, 190, 'Everything that is happening, in one place, in pencil.', { size: 11, font: NU, weight: 600, color: ink, leading: 1.4, label: 'Department deck', role: 'DECK' }));
      const gx = G.x, gy = 210, cw = G.w / 7, chh = 102;
      ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach((d, i) => out.push(rect(gx + i * cw, gy, cw - 4, 24, i === 0 || i === 6 ? accent : secondary, { rx: 8, label: 'Weekday', role: 'ORNAMENT' }), text(gx + i * cw, gy + 6, cw - 4, d, { size: 10, font: BA, weight: 800, color: paper, align: 'center', tracking: .1, wrap: false, label: 'Weekday label', role: 'LABEL' })));
      const ev: Record<number, [string, string]> = { 3: ['Repair café', accent], 6: ['Council 7pm', secondary], 8: ['Choir', sun], 14: ['Parents’ coffee', secondary], 17: ['BLOCK PARTY', accent], 22: ['Library quiz', secondary], 24: ['Harvest supper', accent], 31: ['Halloween walk', sun] };
      const cells: Array<[number, boolean]> = [[27, false], [28, false], [29, false], [30, false], ...Array.from({ length: 31 }, (_, i) => [i + 1, true] as [number, boolean])];
      cells.forEach(([d, inMonth], i) => { const col = i % 7, row = Math.floor(i / 7), x = gx + col * cw, y = gy + 32 + row * (chh + 6); out.push(rect(x, y, cw - 4, chh, inMonth ? (col === 0 || col === 6 ? butter : cream2) : mix(paper, -.02), { rx: 10, label: 'Calendar cell', role: 'ORNAMENT' }), text(x + 7, y + 5, 30, String(d), { size: 15, font: BA, weight: 800, color: inMonth ? ink : alpha(ink, .3), wrap: false, label: 'Date number', role: 'LABEL' })); const e = inMonth ? ev[d] : undefined; if (e) out.push(rect(x + 4, y + chh - 40, cw - 12, 34, e[1], { rx: 8, label: 'Event pill', role: 'ORNAMENT' }), text(x + 8, y + chh - 36, cw - 20, e[0], { size: 9.5, font: BA, weight: 800, color: e[1] === sun ? ink : paper, leading: 1.05, label: 'Event', role: 'CAPTION' })); });
      const ty = gy + 32 + 5 * (chh + 6) + 20;
      out.push(text(G.x, ty, 300, 'THE BIG THREE', { size: 12, font: BA, weight: 800, color: accent, tracking: .14, wrap: false, label: 'Highlights label', role: 'KICKER' }));
      [['Sat 17 · Block party', 'Maple Street closes at noon. Bring a chair, a dish, and a sense of humour.'], ['Sat 24 · Harvest supper', 'St. Anne’s hall, 6pm. Soup, bread and a pie that has a name.'], ['Sat 31 · Halloween walk', 'Meet at the library at five. Costumes optional but lightly encouraged.']].forEach(([t, d], i) => { const x = G.x + i * (G.w / 3 + 2), w = G.w / 3 - 10; out.push(card(x, ty + 26, w, 140, i === 0 ? blush : i === 1 ? butter : mint, 20), text(x + 14, ty + 38, w - 28, t, { size: 15, font: BA, weight: 800, color: ink, leading: 1.1, label: 'Highlight title', role: 'HEADLINE' }), text(x + 14, ty + 80, w - 28, d, { size: 10.5, font: NU, weight: 500, color: ink, leading: 1.45, label: 'Highlight text', role: 'BODY' })); });
      out.push(...head('What’s on'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...pill(G.x, 84, 190, 'LOCAL BUSINESSES, LOCAL PAGES', secondary, paper, 10));
      out.push(text(G.x - 2, 112, G.w, 'Say hello to the shops.', { size: 52, font: BA, weight: 800, color: ink, tracking: -.02, wrap: false, label: 'Ad page headline', role: 'HEADLINE' }));
      out.push(...adSlot(G.x, 200, G.w, 200, { fill: butter, ink, accent, font: NU, kind: 'Advertisement  ·  banner', spec: 'Banner  ·  7.7 × 2.6 in  ·  no bleed  ·  300 dpi  ·  from $90 an issue', live: 12 }));
      const bc = columns(G.x, G.w, 3, 16);
      for (let i = 0; i < 6; i++) out.push(...adSlot(bc[i % 3].x, 430 + Math.floor(i / 3) * 214, bc[0].w, 198, { fill: [blush, mint, butter, cream2, blush, mint][i], ink, accent: [accent, secondary, sun, ink, accent, secondary][i], font: NU, kind: ['Bakery', 'Plumber', 'Café', 'Tutor', 'Garden', 'Cobbler'][i], spec: '2.4 × 2.6 in · $45', live: 10 }));
      out.push(text(G.x, 868, G.w, 'CLASSIFIEDS  ·  60 CENTS A WORD', { size: 11, font: BA, weight: 800, color: accent, tracking: .14, wrap: false, label: 'Classifieds label', role: 'KICKER' }), hr(G.x, 888, G.w, ink, 1.5, { label: 'Classifieds rule' }));
      const cl = [['FOR SALE', 'Upright piano, good bones, needs tuning, you collect. 555-0121'], ['WANTED', 'A second kettle for the repair café. Any colour. 555-0134'], ['FREE', 'Large sofa, seen better decades. Cats not included. 555-0177'], ['LOST', 'Red kite with long tail, last seen over Maple Street. 555-0166']];
      const cc = columns(G.x, G.w, 2, 24);
      cl.forEach(([k, t], i) => out.push(text(cc[i % 2].x, 900 + Math.floor(i / 2) * 44, 70, k, { size: 9, font: BA, weight: 800, color: accent, wrap: false, label: 'Classified kind', role: 'KICKER' }), text(cc[i % 2].x + 70, 899 + Math.floor(i / 2) * 44, cc[0].w - 70, t, { size: 10.2, font: NU, weight: 600, color: ink, leading: 1.35, label: 'Classified', role: 'BODY' })));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 24, 24, W - 48, 620, { tone: 'light', shade: cream2, rx: 44, caption: 'Opening photograph · Rosa Delgado at the repair café, St. Anne’s hall', label: 'Feature photograph' }));
      out.push(...pill(60, 60, 150, 'MEET THE NEIGHBOURS', accent, paper, 10));
      out.push(text(G.x - 6, 660, 740, 'The woman who\nfixes everything', { size: 70, font: BA, weight: 800, color: ink, tracking: -.02, leading: .94, label: 'Feature headline', role: 'HEADLINE' }));
      out.push(text(G.x, 850, 470, 'Rosa Delgado, seventy-one, retired electrician, runs the repair café in the back room of St. Anne’s hall. She has mended more than six hundred things, and says she has never once been the boss.', { size: 13, font: NU, weight: 500, color: ink, leading: 1.5, label: 'Deck', role: 'DECK' }), text(G.x, 962, 470, 'WORDS ·  IMANI COLE   PHOTOS · PABLO FERRER', { size: 9, font: BA, weight: 700, color: accent, tracking: .1, wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(circle(W - 160, 820, 78, sun, { label: 'Badge' }), text(W - 238, 782, 156, '600+', { size: 44, font: BA, weight: 800, color: ink, align: 'center', wrap: false, leading: 1, rotation: -8, label: 'Badge value', role: 'HERO' }), text(W - 238, 828, 156, 'THINGS MENDED', { size: 10, font: BA, weight: 800, color: ink, align: 'center', tracking: .1, wrap: false, rotation: -8, label: 'Badge label', role: 'LABEL' }));
      out.push(text(G.x - 14, 36, 40, String(G.pageNo), { size: 13, font: BA, weight: 800, color: ink, wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        out.push(...pill(G.x, 84, 128, 'REPAIR CAFÉ  ·  1', secondary, paper, 10));
        out.push(text(G.x - 2, 112, G.w, 'Every first Saturday, something broken becomes something useful.', { size: 38, font: BA, weight: 800, color: ink, leading: 1.04, tracking: -.01, label: 'Deck', role: 'DECK' }));
        const main = spanOf(c, 0, 3), side = spanOf(c, 4, 5), cols2 = columns(main.x, main.w, 2, 16), top = 240;
        const rr = balance(C_PARAS.slice(0, 4).join('\n'), colFrames(cols2, top, 800), body, { dropCap: { lines: 3, font: BA, color: accent, weight: 800, scale: 1.25 } }); warnFlow('porch p7', rr); out.push(...rr.objs);
        out.push(...photo(ctx, side.x, top, side.w, 260, { tone: 'light', rx: 22, caption: 'The spring that started it all', label: 'Inset photograph' }), ...caption(side.x, top + 266, side.w, 'The paper-clip toaster, now a museum piece on the shelf above the kettle.', 'Photograph Pablo Ferrer', { font: NU, color: ink, size: 9, transform: 'none' }));
        out.push(card(side.x, top + 360, side.w, 320, butter, 22), text(side.x + 16, top + 374, side.w - 32, 'NEIGHBOURHOOD NOTES', { size: 10, font: BA, weight: 800, color: accent, tracking: .14, wrap: false, label: 'Notes label', role: 'KICKER' }));
        ['The library now opens until 8 on Thursdays.', 'Bin collection moves to Wednesday on 21 October.', 'Maple Street is closed to cars on the 17th.', 'The bat behind the library has been asked to keep it down.'].forEach((n, i) => out.push(circle(side.x + 24, top + 412 + i * 62, 6, i % 2 ? secondary : accent, { label: 'Note bullet' }), text(side.x + 40, top + 402 + i * 62, side.w - 56, n, { size: 10.4, font: NU, weight: 600, color: ink, leading: 1.4, label: 'Neighbourhood note', role: 'SIDEBAR' })));
        out.push(...pullQuote(main.x, bottomOf(rr.objs) + 40, main.w, '“We learn from the ones we cannot fix, and we thank them for trying.”', 'Rosa Delgado', { font: BA, size: 26, weight: 800, color: accent, leading: 1.1, rule: 'left', ruleColor: sun, ruleWeight: 2.5, attribFont: NU }));
      } else {
        const cols3 = columns(G.x, G.w, 3, 16), top = 96;
        const rr = balance(C_PARAS.slice(4).join('\n') + '\n' + 'If you would like to volunteer, the café meets on the first Saturday of every month from nine until two, in the back room of St. Anne’s hall, with tea, lemon biscuits and a rota that Rosa updates in pencil. No experience is necessary. You do not have to be able to fix anything; you only have to be willing to hold the torch.\nThe next café is on Saturday the third. Bring a lamp, a radio or a small bicycle in trouble. If you are not sure whether it can be mended, bring it anyway. As Rosa says, there is nothing that cannot at least be looked at kindly.', [{ ...cols3[0], y: top, b: 480 }, { ...cols3[1], y: top, b: 480 }, { ...cols3[2], y: top + 230, b: 480 }], body);
        warnFlow('porch p8', rr); out.push(...rr.objs);
        out.push(card(cols3[2].x, top, cols3[2].w, 214, mint, 22), text(cols3[2].x + 16, top + 14, cols3[2].w - 32, 'LOST CAUSES', { size: 10, font: BA, weight: 800, color: secondary, tracking: .14, wrap: false, label: 'Panel label', role: 'KICKER' }), text(cols3[2].x + 16, top + 36, cols3[2].w - 32, '“Kettle, 2011. Element gone. Sorry, old friend.”\n“Radio, 1978. The valves, not the will.”\n“Toy robot. He walked off on his own.”', { size: 15, font: HW, color: ink, leading: 1.25, label: 'Handwritten tags', role: 'CAPTION' }));
        out.push(text(G.x, 530, 400, 'WHO TO CALL', { size: 12, font: BA, weight: 800, color: accent, tracking: .14, wrap: false, label: 'Directory label', role: 'KICKER' }), hr(G.x, 550, G.w, ink, 1.5, { label: 'Directory rule' }));
        const dir: Array<[string, string, string]> = [['Plumber', 'Okoye & Sons', '555-0101'], ['Electrician', 'Rosa Delgado (retired, still answers)', '555-0102'], ['Babysitter', 'Kayla, 16, very reliable', '555-0103'], ['Dog walker', 'Desmond & Pickle', '555-0104'], ['Man with a van', 'Big Tom', '555-0105'], ['Piano tuner', 'Mrs. Havel', '555-0106'], ['Snow clearing', 'The scouts, 7 a.m.', '555-0107'], ['Lost property', 'The porch, any evening', '555-0138']];
        const dc = columns(G.x, G.w, 2, 30);
        dir.forEach(([k, n, t], i) => { const x = dc[i % 2].x, y = 566 + Math.floor(i / 2) * 58; out.push(text(x, y, 110, k.toUpperCase(), { size: 9, font: BA, weight: 800, color: secondary, tracking: .1, wrap: false, label: 'Directory kind', role: 'KICKER' }), text(x, y + 14, dc[0].w - 90, n, { size: 11.5, font: NU, weight: 700, color: ink, leading: 1.25, label: 'Directory name', role: 'BODY' }), text(x + dc[0].w - 90, y + 13, 90, t, { size: 13, font: BA, weight: 800, color: accent, align: 'right', wrap: false, label: 'Directory phone', role: 'BODY' }), hr(x, y + 46, dc[0].w, alpha(ink, .2), .75, { label: 'Directory row rule', dash: [2, 3] })); });
        out.push(...photo(ctx, G.x, 830, spanOf(c, 0, 3).w, 150, { tone: 'light', rx: 22, caption: 'Sign-in sheet, repair café', label: 'Inset photograph' }), card(spanOf(c, 4, 5).x, 830, spanOf(c, 4, 5).w, 150, blush, 20), text(spanOf(c, 4, 5).x + 14, 846, spanOf(c, 4, 5).w - 28, 'Volunteers needed!', { size: 23, font: BA, weight: 800, color: accent, leading: 1.05, label: 'Callout', role: 'HEADLINE' }), text(spanOf(c, 4, 5).x + 14, 906, spanOf(c, 4, 5).w - 28, 'Solder, sew or simply listen. 555-0138.', { size: 11, font: NU, weight: 600, color: ink, leading: 1.4, label: 'Callout text', role: 'BODY' }));
      }
      out.push(...head(pageIndex === 6 ? 'Repair café' : 'Repair café  ·  continued'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...pill(G.x, 84, 134, 'FIVE QUESTIONS', accent, paper, 10));
      out.push(text(G.x - 2, 112, G.w, 'Dana Okonkwo,\nlibrarian', { size: 70, font: BA, weight: 800, color: ink, leading: .94, tracking: -.02, label: 'Interview headline', role: 'HEADLINE' }));
      out.push(...photo(ctx, G.right - 250, 100, 250, 270, { tone: 'light', rx: 125, caption: 'Dana Okonkwo', label: 'Portrait' }));
      let y = 340;
      C_QA.forEach(([q, a], i) => { const left = i % 2 === 0, w = 460, x = left ? G.x : G.right - w; const qq = text(x + 20, y + 16, w - 40, q, { size: 15, font: BA, weight: 800, color: i % 2 ? secondary : accent, leading: 1.15, label: 'Question', role: 'KICKER' }); const aa = text(x + 20, below(qq, 6), w - 40, a, { size: 11, font: NU, weight: 500, color: ink, leading: 1.5, label: 'Answer', role: 'BODY' }); const h = below(aa, 18) - y; out.push(rect(x, y, w, h, i % 2 ? mint : butter, { rx: 26, label: 'Speech bubble', role: 'SIDEBAR' }), path(left ? x + 40 : x + w - 70, y + h - 4, 30, 24, 'M0 0 L100 0 L40 100 Z', i % 2 ? mint : butter, { label: 'Bubble tail' }), qq, aa); y += h + 40; });
      out.push(text(G.x, 920, G.w, 'The library: Mon–Sat 10–6, Thursdays until 8. Cards are free. Dragons are on the second shelf.', { size: 13, font: HW, color: accent, leading: 1.2, rotation: -1, label: 'Handwritten note', role: 'CAPTION' }));
      out.push(...head('Five questions'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, cream2)];
      const flags = [accent, sun, secondary, accent, sun, secondary, accent, sun, secondary, accent, sun, secondary, accent, sun];
      out.push(path(-20, 56, W + 40, 24, orn.sineOpenPath(1, 40, 3.2), 'none', { stroke: ink, strokeWidth: 1.5, open: true, label: 'Bunting string' }));
      flags.forEach((col, i) => out.push(path(40 + i * 53, 60 + Math.sin(i * .45 + 3.2) * 6, 34, 44, 'M0 0 L100 0 L50 100 Z', col, { rotation: Math.sin(i) * 5, label: 'Bunting flag' })));
      out.push(text(G.x - 2, 130, G.w, 'The block party,\nin pictures', { size: 66, font: BA, weight: 800, color: ink, leading: .96, tracking: -.02, label: 'Essay headline', role: 'HEADLINE' }), text(G.right - 260, 150, 260, 'Forty neighbours, one very long table, two sets of bunting and a single, unrepeatable lemon cake.', { size: 11.5, font: NU, weight: 600, color: ink, leading: 1.45, label: 'Essay intro', role: 'DECK' }));
      const ph: Array<[number, number, number, number, number, string]> = [[G.x, 300, 360, 270, -2, 'The table, set at noon'], [G.x + 380, 320, 330, 240, 2, 'Chairs arriving, all different'], [G.x + 40, 600, 240, 300, 2.5, 'The lemon cake, before'], [G.x + 300, 620, 220, 160, -2, 'Bunting inspection'], [G.x + 540, 600, 200, 280, -1.5, 'Desmond & Pickle'], [G.x + 300, 800, 220, 140, 2, 'The lemon cake, after']];
      ph.forEach(([x, y, w, h, rot, cap]) => out.push(rect(x, y, w, h + 38, paper, { rx: 8, rotation: rot, shadow: { x: 0, y: 5, blur: 10, color: 'rgba(43,39,69,.22)' }, label: 'Photo frame', role: 'SIDEBAR' }), ...photo(ctx, x + 8, y + 8, w - 16, h - 10, { tone: 'light', caption: cap, rotation: rot, label: 'Party photograph' }), text(x + 10, y + h - 4, w - 20, cap, { size: 14, font: HW, color: ink, rotation: rot, wrap: false, label: 'Handwritten caption', role: 'CAPTION' })));
      out.push(text(G.x, 970, G.w, 'Photographs Pablo Ferrer & many neighbours with phones. Thank you for the chairs.', { size: 9, font: NU, weight: 600, color: alpha(ink, .7), wrap: false, label: 'Credit', role: 'CREDIT' }));
      out.push(...head('Block party'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...lamp(G.x + 40, 130, 20), text(G.x + 84, 66, 600, 'Who makes this', { size: 64, font: BA, weight: 800, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Colophon headline', role: 'HEADLINE' }));
      const vols: Array<[string, string]> = [['Aisha Rahman', 'Editor & chief folder'], ['Imani Cole', 'Features'], ['Pablo Ferrer', 'Photographs'], ['Marta Quill', 'Design'], ['Tobias Wren', 'Proofs & puns'], ['Rosa Delgado', 'Technical advice'], ['Kayla (16)', 'Distribution captain'], ['Desmond', 'Dog liaison']];
      vols.forEach(([n, r_], i) => { const x = G.x + (i % 2) * (G.w / 2 + 8), y = 190 + Math.floor(i / 2) * 78, w = G.w / 2 - 8; out.push(card(x, y, w, 64, [blush, mint, butter, cream2][(i + Math.floor(i / 2)) % 4], 18), circle(x + 32, y + 32, 20, [accent, secondary, sun][i % 3], { label: 'Volunteer badge' }), text(x + 12, y + 20, 40, n[0], { size: 22, font: BA, weight: 800, color: i % 3 === 2 ? ink : paper, align: 'center', wrap: false, leading: 1, label: 'Initial', role: 'LABEL' }), text(x + 62, y + 12, w - 72, n, { size: 17, font: BA, weight: 800, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' }), text(x + 62, y + 36, w - 72, r_.toUpperCase(), { size: 8.5, font: NU, weight: 700, color: alpha(ink, .65), tracking: .1, wrap: false, label: 'Credit role', role: 'CAPTION' })); });
      const info: Array<[string, string, string]> = [['SEND US NEWS', 'news@porchlight.example, or leave a note in the box by the library door. Deadline: the 15th.', accent], ['ADVERTISE', 'Banner $90, quarter page $45, classifieds 60¢ a word. All money pays for paper and the bicycle bells.', secondary], ['DELIVERY', 'Free to 2,400 doors. Not receiving it? Call 555-0138 and Kayla will fix it.', sun], ['THE SMALL PRINT', 'Printed on recycled paper, folded by hand. Trim 8.5 × 11 in, 0.125 in bleed. © 2026 Porch Light. Share it freely.', ink]];
      info.forEach(([h, t, col], i) => { const x = G.x + (i % 2) * (G.w / 2 + 8), y = 540 + Math.floor(i / 2) * 150, w = G.w / 2 - 8; out.push(rect(x, y, 6, 120, col, { rx: 3, label: 'Info bar', role: 'ORNAMENT' }), text(x + 18, y, w - 18, h, { size: 11, font: BA, weight: 800, color: col === sun ? ink : col, tracking: .14, wrap: false, label: 'Info heading', role: 'KICKER' }), text(x + 18, y + 20, w - 18, t, { size: 11, font: NU, weight: 500, color: ink, leading: 1.5, label: 'Info text', role: 'BODY' })); });
      out.push(...barcodeBox(G.x, 860, 118, 60, { plate: paper, ink, seed, code: 'ISSN 2744-3801', note: 'ISSUE 38', font: 'ibmPlexMono' }));
      out.push(...head('Who makes this'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, mix(sun, .62))];
      out.push(...lamp(W / 2, 170, 40));
      out.push(text(36, 266, W - 72, 'Next meeting', { size: 62, font: BA, weight: 800, color: ink, align: 'center', tracking: -.02, wrap: false, leading: 1, label: 'Back cover headline', role: 'COVER_LINE' }), text(36, 336, W - 72, 'TUESDAY 6 OCTOBER  ·  7 PM  ·  ST. ANNE’S HALL', { size: 14, font: BA, weight: 700, color: accent, align: 'center', tracking: .14, wrap: false, label: 'Meeting line', role: 'COVER_LINE' }));
      out.push(text(110, 392, W - 220, 'All welcome. We will talk about the crossing, the chairs, the bat and the lemon cake. Tea and biscuits at 6:30, a vote at 8, and a very short prayer for the bin lorries.', { size: 15, font: NU, weight: 600, color: ink, align: 'center', leading: 1.55, label: 'Back cover copy', role: 'COVER_LINE' }));
      out.push(card(60, 520, W - 120, 250, paper, 28), text(90, 540, W - 180, 'THE NOTICE BOARD', { size: 12, font: BA, weight: 800, color: accent, tracking: .16, wrap: false, label: 'Board label', role: 'KICKER' }), text(90, 566, W - 180, 'Wanted: seven volunteers to fold, deliver and wave.\nOffered: lemon biscuits and the gratitude of 2,400 doors.\nFound: one blue glove, one red kite, one very polite cat.\nLost: a fiddle, last seen being carried away by a toddler.', { size: 14, font: HW, color: ink, leading: 1.4, label: 'Notice text', role: 'BODY' }));
      // tear-off tabs
      const tabs = 8, tw = (W - 80) / tabs;
      out.push(hr(40, 810, W - 80, ink, 1.5, { label: 'Tear-off cut line', dash: [8, 5] }));
      for (let i = 0; i < tabs; i++) out.push(vrule(40 + i * tw, 810, 190, ink, 1, 'Tear-off cut'), text(40 + i * tw + tw / 2 - 60, 910, 120, 'PORCH LIGHT · 555-0138', { size: 11, font: BA, weight: 800, color: ink, tracking: .06, align: 'center', wrap: false, rotation: -90, label: 'Tear-off tab', role: 'LABEL' }));
      out.push(vrule(W - 40, 810, 190, ink, 1, 'Tear-off cut'), text(40, 1010, 400, 'Take a tab. Call the porch. Say hello.', { size: 14, font: HW, color: accent, wrap: false, label: 'Tab note', role: 'CAPTION' }), ...barcodeBox(W - 40 - 110, 1004, 110, 38, { plate: paper, ink, seed, code: '0 74470 38038 8', font: 'ibmPlexMono' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 11 · TUMBLE — kids & family. Alphabet-block masthead, big type, activity pages, board-game contents.
//      Trim 8.5 × 11 in (816 × 1056 px), saddle-stitched. 6-column grid, 20 px baseline (large type, wide leading).
// ═════════════════════════════════════════════════════════════════════════════
const KG: Grid = { cols: 6, gutter: 16, base: 20, top: 80, bottom: 76, inner: 52, outer: 46 };
const K_PARAS = [
  'Once upon a time, in a mountain so tall it wore a hat of cloud, there lived a dragon named Dot. Dot could breathe fire, fly upside down, and juggle seven boulders. But Dot could not, would not, absolutely never ever eat soup.',
  '“Soup is wet,” said Dot. “Soup is hot, and wet, and it has bits in it.” Dot’s mother, who was also a dragon, and very patient, set a small steaming bowl of tomato soup on the table every night. And every night Dot folded her arms, puffed out her cheeks, and breathed a tiny puff of smoke at it.',
  'One night a very small knight in very big boots knocked at the cave door. “Please,” said the knight, “I am cold, and I am hungry, and I have walked a hundred miles.” “Come in,” said Dot, “but I am warning you, we only have soup.”',
  'The knight, whose name was Pip, ate three bowls. “This,” said Pip, “is the best soup I have ever had in my life,” and Dot, who had never seen anyone so happy about something wet, felt something odd happen in her tummy.',
  '“Maybe,” said Dot, very quietly, “I could try a little bit.” She dipped one claw in. She sniffed. She licked. Her eyes grew as round as dinner plates. “Oh,” she said. “Oh, it is warm.”',
  'And from that night on, Dot ate soup every day, and Pip came every Thursday, and the cave smelled of tomatoes and friendship. And when anyone asked her if dragons could eat soup, Dot would puff out her chest and say, “Of course. We just like to be asked nicely.”',
];
const K_QA: Array<[string, string]> = [
  ['How old are you?', 'Nine and three quarters. The quarters matter.'],
  ['What did you invent?', 'A sock-sorting robot called Gregory. He has two arms and a lot of feelings.'],
  ['Does he work?', 'Mostly. He puts the blue ones with the green ones. But he is learning.'],
  ['What do you want to be?', 'An inventor, a chef and a lighthouse keeper. Probably all three.'],
  ['What is your best tip?', 'If it does not work, it is not broken. It is just not finished.'],
];

const tumble: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, KG), c = G.cols, r = orn.rng(seed);
  const FR = 'fredoka' as const, NU = 'nunito' as const, BG_ = 'bangers' as const;
  const sun = '#FFC93C', grape = '#7B5CFF', lime = '#7ED957', pinkish = mix(accent, .82), skyish = mix(secondary, .85), butter = mix(sun, .8);
  const body = { font: NU, size: 13, lead: 20, color: ink, weight: 600, gap: 10, role: 'BODY' as const };
  const head = (section: string) => [
    text(G.verso ? G.x : G.right - 300, 36, 300, G.verso ? 'TUMBLE  ·  OCTOBER' : section, { size: 11, font: FR, weight: 600, color: accent, tracking: .08, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    path(G.verso ? G.x + G.w - 36 : G.x, H - 62, 36, 36, orn.starPath(5, .45), sun, { rotation: 12, label: 'Folio star' }), text(G.verso ? G.x + G.w - 36 : G.x, H - 52, 36, String(G.pageNo), { size: 14, font: FR, weight: 700, color: ink, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x : G.right - 300, H - 52, 300, G.verso ? section : 'TUMBLEMAG.EXAMPLE', { size: 9, font: NU, weight: 800, color: alpha(ink, .55), tracking: .1, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const block = (x: number, y: number, s: number, ch: string, col: string, rot: number, fg = '#FFFFFF'): Obj[] => [rect(x, y, s, s, col, { rx: s * .2, rotation: rot, shadow: { x: 0, y: 5, blur: 0, color: alpha(ink, .25) }, label: 'Alphabet block', role: 'ORNAMENT' }), text(x, y + s * .02, s, ch, { size: s * .92, font: FR, weight: 700, color: fg, align: 'center', wrap: false, leading: 1, rotation: rot, label: 'Block letter', role: 'COVER_TITLE' })];
  const bubble = (x: number, y: number, w: number, h: number, fill: string, tail = 22): Obj => path(x, y, w, h, orn.balloonPath(tail), fill, { stroke: ink, strokeWidth: 2.5, label: 'Speech bubble', role: 'SIDEBAR' });
  const sticker = (cx: number, cy: number, rad: number, l1: string, l2: string, fill: string, fg = ink, rot = -8): Obj[] => [path(cx - rad, cy - rad, rad * 2, rad * 2, orn.burstPath(14, seed + 5), fill, { stroke: ink, strokeWidth: 2.5, rotation: rot, label: 'Sticker', role: 'ORNAMENT' }), text(cx - rad, cy - rad * .42, rad * 2, l1, { size: rad * .62, font: FR, weight: 700, color: fg, align: 'center', wrap: false, leading: 1, rotation: rot, label: 'Sticker line', role: 'LABEL' }), text(cx - rad, cy + rad * .26, rad * 2, l2, { size: Math.max(9, rad * .2), font: NU, weight: 900, color: fg, align: 'center', wrap: false, tracking: .06, rotation: rot, label: 'Sticker sub-line', role: 'LABEL' })];
  const doodle = (x: number, y: number, w: number, kind: number, col: string): Obj => path(x, y, w, w, kind === 0 ? orn.starPath(5, .45) : kind === 1 ? orn.polygonPath(3) : kind === 2 ? orn.blobPath(seed + kind, 6, .2) : orn.leafPath(), col, { rotation: kind * 37, label: 'Doodle', role: 'ORNAMENT' });

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(-BL, -BL, W + BL * 2, 300, mix(sun, .5), { label: 'Sky band', role: 'ORNAMENT' }));
      const cols = [accent, secondary, sun, grape, lime, accent], letters = ['T', 'U', 'M', 'B', 'L', 'E'], rots = [-6, 4, -3, 6, -5, 3];
      letters.forEach((l, i) => out.push(...block(36 + i * 122, 36 + (i % 2) * 18, 112, l, cols[i], rots[i], i === 2 || i === 4 ? ink : '#FFFFFF')));
      out.push(text(36, 190, 700, 'THE MAGAZINE FOR CURIOUS KIDS (AND THE GROWN-UPS WHO CARRY THEIR SNACKS)', { size: 11, font: NU, weight: 900, color: ink, tracking: .06, wrap: false, label: 'Tagline', role: 'LABEL' }), text(36, 214, 700, 'AGES 4–10  ·  ISSUE 22  ·  OCTOBER  ·  $5.99', { size: 12, font: FR, weight: 600, color: accent, tracking: .1, wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(path(150, 292, 520, 520, orn.burstPath(20, seed), grape, { stroke: ink, strokeWidth: 3, rotation: 8, label: 'Photo burst', role: 'ORNAMENT' }), ...photo(ctx, 196, 338, 428, 428, { tone: 'light', shade: butter, rx: 214, caption: 'Cover photograph · Dot the dragon, in costume, with soup', label: 'Cover photograph' }), circle(196 + 214, 338 + 214, 214, 'none', { stroke: ink, strokeWidth: 4, label: 'Photo outline' }));
      out.push(...sticker(110, 760, 76, 'NEW!', 'DRAGON STORY INSIDE', sun, ink, -10), ...sticker(704, 360, 66, '12', 'GAMES & PUZZLES', accent, '#FFFFFF', 10));
      out.push(bubble(40, 830, 340, 100, '#FFFFFF', 60), text(60, 842, 300, 'The Dragon Who Hated Soup!', { size: 22, font: FR, weight: 700, color: ink, leading: 1.05, label: 'Cover line', role: 'COVER_LINE' }), text(60, 892, 300, 'A story to read aloud. Page 24', { size: 11.5, font: NU, weight: 800, color: accent, wrap: false, label: 'Cover line page', role: 'COVER_LINE' }));
      out.push(bubble(404, 830, 280, 100, butter, 180), text(424, 842, 240, 'Build a robot from socks', { size: 20, font: FR, weight: 700, color: ink, leading: 1.05, label: 'Cover line', role: 'COVER_LINE' }), text(424, 892, 240, 'Meet inventor Zainab, age 9. Page 70', { size: 11.5, font: NU, weight: 800, color: secondary, wrap: false, label: 'Cover line page', role: 'COVER_LINE' }));
      out.push(...barcodeBox(W - 36 - 112, 958, 112, 60, { plate: paper, ink, seed, code: '0 74470 22022 5', note: 'TUMBLE 22', font: 'ibmPlexMono' }), text(40, 972, 400, 'Cut-out paper hat on the back cover!', { size: 18, font: BG_, color: accent, wrap: false, rotation: -2, label: 'Cover note', role: 'COVER_LINE' }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 56, 500, 'The Path', { size: 76, font: FR, weight: 700, color: ink, tracking: -.01, wrap: false, leading: 1, label: 'Contents title', role: 'HEADLINE' }), text(G.x + 4, 140, 500, 'Hop from stone to stone to find your favourite page!', { size: 14, font: NU, weight: 800, color: accent, wrap: false, label: 'Contents deck', role: 'DECK' }));
      const stops: Array<[string, string, string, string]> = [['6', 'Hello, grown-ups & kids', 'A letter from the editors', accent], ['12', 'Kitchen Fun', 'Make rainbow toast', secondary], ['24', 'The Dragon Who Hated Soup', 'A story to read aloud', sun], ['32', 'Word Search', 'Find the six hidden words', grape], ['44', 'Spot the Difference', 'Five tiny changes. Can you see them?', lime], ['70', 'Meet an Inventor', 'Zainab and her sock robot', accent], ['78', 'Party Photos', 'The best birthday ever, in pictures', secondary], ['96', 'Make a Paper Hat', 'Fold, snip, wear. Back cover.', sun]];
      const pos: Array<[number, number]> = [[110, 270], [330, 230], [560, 300], [640, 470], [420, 540], [150, 640], [130, 800], [640, 870]];
      out.push(path(60, 230, 700, 600, 'M12 6 C36 -6 50 12 68 8 C88 4 96 28 80 46 C60 70 34 40 14 56 C-6 72 10 92 36 90 C60 88 62 70 82 88', 'none', { stroke: ink, strokeWidth: 3, dash: [3, 9], open: true, opacity: .45, label: 'Path line' }));
      stops.forEach(([p, t, d, col], i) => { const [px, py] = pos[i]; out.push(circle(px, py, 40, col, { stroke: ink, strokeWidth: 3.5, shadow: { x: 0, y: 5, blur: 0, color: alpha(ink, .22) }, label: 'Stepping stone' }), text(px - 40, py - 22, 80, p, { size: 38, font: FR, weight: 700, color: col === sun || col === lime ? ink : '#FFFFFF', align: 'center', wrap: false, leading: 1, label: 'Contents folio', role: 'FOLIO' })); const right = px < 380; const tx = right ? px + 52 : px - 52 - 200; out.push(text(tx, py - 24, 200, t, { size: 17, font: FR, weight: 700, color: ink, align: right ? 'left' : 'right', leading: 1.05, label: 'Contents title', role: 'HEADLINE' }), text(tx, py + 18, 200, d, { size: 10.5, font: NU, weight: 700, color: alpha(ink, .75), align: right ? 'left' : 'right', leading: 1.35, label: 'Contents description', role: 'BODY' })); });
      out.push(doodle(660, 120, 70, 0, sun), doodle(40, 880, 56, 1, lime), doodle(720, 840, 60, 2, pinkish), ...sticker(690, 640, 58, 'START', 'HERE →', accent, '#FFFFFF', -14));
      out.push(text(G.x, 930, 520, 'Collect a star for every page you read. Ten stars wins a very large hug.', { size: 13, font: NU, weight: 800, color: ink, wrap: false, label: 'Contents note', role: 'CAPTION' }));
      out.push(...head('Contents'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      const l = spanOf(c, 0, 3), rr_ = spanOf(c, 4, 5);
      out.push(rect(G.x - 8, 76, G.w + 16, 470, pinkish, { rx: 34, label: 'Kids panel', role: 'SIDEBAR' }), text(G.x + 20, 90, 400, 'Hi, kids!', { size: 76, font: FR, weight: 700, color: accent, wrap: false, leading: 1, label: 'Letter headline', role: 'HEADLINE' }));
      const kid = 'This is YOUR page. Last month you sent us 412 drawings of dragons, 38 recipes for soup, and one letter that just said “MORE DINOSAURS.” We read every single one out loud to the office plant.\nThis month there is a story about a dragon who will not eat soup (and then does), a recipe for toast that looks like a rainbow, and a puzzle where you have to find six hidden words. Do the puzzle with a pencil. Do not look at the answers. Well, a bit.';
      const kr = flow(kid, [{ x: G.x + 20, y: 180, w: G.w - 220, b: 530 }], { ...body, size: 14.5, lead: 22 }); warnFlow('tumble kid letter', kr); out.push(...kr.objs);
      out.push(...photo(ctx, G.right - 200, 110, 180, 180, { tone: 'light', rx: 90, caption: 'Editors', label: 'Editors photograph' }), ...sticker(G.right - 90, 340, 62, 'WOOF', 'THE OFFICE DOG', sun, ink, 8), doodle(G.right - 220, 440, 60, 0, accent));
      out.push(text(G.x, 580, 300, 'Dear grown-ups,', { size: 32, font: FR, weight: 700, color: ink, wrap: false, label: 'Grown-ups headline', role: 'HEADLINE' }), hr(G.x, 622, G.w, ink, 2, { label: 'Rule' }));
      const grown = 'Tumble is a magazine for reading together. Each issue pairs a read-aloud story with an activity, a recipe or a puzzle that needs two sets of hands. The type is large and the sentences are short, so a new reader can have a go, and every page has a question at the bottom for you to ask.\nWe do not run advertisements for sugary food, and every product shown in these pages has been tried by someone under ten. The small print on page 88 explains our safety rules for the recipes and crafts. We hope you enjoy the quiet that follows.';
      const gr = balance(grown, colFrames(columns(G.x, G.w, 2, 24), 640, 900), { ...body, size: 11.5, lead: 18, weight: 500 }); warnFlow('tumble grown-ups', gr); out.push(...gr.objs);
      out.push(text(G.x, bottomOf(gr.objs) + 14, 400, '— The editors', { size: 22, font: BG_, color: accent, wrap: false, rotation: -2, label: 'Signature', role: 'BYLINE' }));
      out.push(...head('Hello'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 56, 700, 'Kitchen Fun', { size: 78, font: FR, weight: 700, color: ink, tracking: -.01, wrap: false, leading: 1, label: 'Department title', role: 'HEADLINE' }), rect(G.x, 146, 220, 34, secondary, { rx: 17, label: 'Recipe pill', role: 'ORNAMENT' }), text(G.x + 12, 152, 200, 'RAINBOW TOAST', { size: 15, font: FR, weight: 700, color: '#FFFFFF', wrap: false, tracking: .08, label: 'Recipe tag', role: 'KICKER' }), text(G.x + 240, 152, 400, 'Makes 4  ·  15 minutes  ·  Ask a grown-up for the toaster', { size: 11.5, font: NU, weight: 800, color: accent, wrap: false, label: 'Recipe meta', role: 'LABEL' }));
      out.push(text(G.x, 200, 360, 'YOU WILL NEED', { size: 14, font: FR, weight: 700, color: accent, tracking: .08, wrap: false, label: 'Ingredients label', role: 'KICKER' }));
      const ing: Array<[string, string]> = [['4', 'slices of bread'], ['1', 'cup of cream cheese'], ['3', 'drops of food colouring, any colours'], ['1', 'butter knife'], ['4', 'small paintbrushes']];
      ing.forEach(([n, t], i) => out.push(circle(G.x + 24, 246 + i * 52, 22, [accent, secondary, sun, grape, lime][i], { stroke: ink, strokeWidth: 2.5, label: 'Ingredient bubble' }), text(G.x, 232 + i * 52, 48, n, { size: 24, font: FR, weight: 700, color: i === 2 || i === 4 ? ink : '#FFFFFF', align: 'center', wrap: false, leading: 1, label: 'Quantity', role: 'LABEL' }), text(G.x + 56, 234 + i * 52, 260, t, { size: 15, font: NU, weight: 800, color: ink, leading: 1.2, label: 'Ingredient', role: 'BODY' })));
      out.push(...photo(ctx, G.x + 360, 200, G.w - 360, 270, { tone: 'light', rx: 36, shade: butter, caption: 'Finished rainbow toast', label: 'Recipe photograph' }), ...sticker(G.right - 40, 214, 52, 'YUM', 'AGES 4+', sun, ink, 10));
      const steps: Array<[string, string, string]> = [['Mix', 'Stir a few drops of colour into the cream cheese, one bowl for each colour.', accent], ['Paint', 'Use a clean brush to paint stripes of colour onto the plain bread.', secondary], ['Toast', 'Ask a grown-up to toast the bread until it is golden, not burnt.', sun], ['Munch', 'Cut into fingers, say ta-da, and share with the person who helped.', grape]];
      const sc = columns(G.x, G.w, 4, 14);
      steps.forEach(([t, d, col], i) => { const x = sc[i].x, y = 520; out.push(rect(x, y, sc[0].w, 380, i % 2 ? butter : skyish, { rx: 28, stroke: ink, strokeWidth: 2.5, label: 'Step card', role: 'SIDEBAR' }), circle(x + 36, y + 36, 24, col, { stroke: ink, strokeWidth: 2.5, label: 'Step number badge' }), text(x + 12, y + 14, 48, String(i + 1), { size: 30, font: FR, weight: 700, color: col === sun ? ink : '#FFFFFF', align: 'center', wrap: false, leading: 1, label: 'Step number', role: 'LABEL' }), ...photo(ctx, x + 14, y + 80, sc[0].w - 28, 130, { tone: 'light', rx: 18, caption: `Step ${i + 1}`, label: 'Step picture' }), text(x + 14, y + 224, sc[0].w - 28, t, { size: 22, font: FR, weight: 700, color: ink, wrap: false, leading: 1, label: 'Step title', role: 'HEADLINE' }), text(x + 14, y + 256, sc[0].w - 28, d, { size: 11.5, font: NU, weight: 700, color: ink, leading: 1.4, label: 'Step text', role: 'BODY' })); });
      out.push(text(G.x, 920, G.w, 'Safety: a grown-up must always handle the toaster. Wash hands before you start. Allergies? Swap the cream cheese for hummus.', { size: 10.5, font: NU, weight: 700, color: alpha(ink, .75), leading: 1.4, label: 'Safety note', role: 'FOOTNOTE' }));
      out.push(...head('Kitchen Fun'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(G.x, 84, G.w, 460, { fill: butter, ink, accent, font: NU, kind: 'Advertisement  ·  reviewed for under-tens', spec: 'Two-thirds page  ·  7.5 × 6.4 in  ·  no bleed  ·  every ad is read by the editors first', live: 14 }));
      out.push(text(G.x, 552, 300, 'ADVERTISEMENT', { size: 9, font: NU, weight: 900, color: alpha(ink, .5), tracking: .2, wrap: false, label: 'Ad label', role: 'CAPTION' }));
      out.push(rect(G.x, 600, G.w, 340, grape, { rx: 36, stroke: ink, strokeWidth: 3, label: 'House ad panel', role: 'AD_SLOT' }), text(G.x + 30, 622, 440, 'Join the Tumble Club!', { size: 52, font: FR, weight: 700, color: '#FFFFFF', leading: 1, label: 'House ad headline', role: 'HEADLINE' }), text(G.x + 30, 760, 380, 'Get a sticker sheet, a secret code and a birthday card from a dragon. Twelve issues, $48 a year, delivered flat so nothing gets squashed.', { size: 14, font: NU, weight: 700, color: '#FFFFFF', leading: 1.45, label: 'House ad copy', role: 'BODY' }), text(G.x + 30, 880, 420, 'tumblemag.example/club', { size: 20, font: FR, weight: 700, color: sun, wrap: false, label: 'House ad URL', role: 'LABEL' }));
      out.push(...sticker(G.right - 110, 780, 84, 'FREE', 'STICKER SHEET', sun, ink, 12), doodle(G.right - 220, 640, 60, 0, accent), doodle(G.right - 90, 910, 50, 1, lime));
      out.push(...head('Advertising'));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, mix(sun, .6))];
      out.push(path(-40, 90, W + 80, 700, orn.blobPath(seed + 2, 7, .16), skyish, { opacity: .85, label: 'Big blob', role: 'ORNAMENT' }), ...photo(ctx, 60, 90, W - 120, 470, { tone: 'light', rx: 60, shade: butter, caption: 'Opening illustration · Dot the dragon, at the cave table, with a bowl of soup', label: 'Feature illustration' }));
      const words: Array<[string, string, number, number, number]> = [['The', accent, 36, 580, -3], ['Dragon', secondary, 200, 580, 2], ['Who Hated', grape, 36, 672, -2], ['Soup!', accent, 470, 640, 3]];
      words.forEach(([w_, col, x, y, rot], i) => out.push(text(x as number, y as number, i === 3 ? 330 : 410, w_ as string, { size: i === 3 ? 108 : 84, font: FR, weight: 700, color: col as string, stroke: ink, strokeWidth: 3.5, wrap: false, leading: 1, rotation: rot as number, label: 'Feature headline word', role: 'HEADLINE' })));
      out.push(text(G.x, 790, 520, 'A story to read aloud, with a dragon, a very small knight and one bowl of tomato soup.', { size: 17, font: NU, weight: 800, color: ink, leading: 1.4, label: 'Deck', role: 'DECK' }), text(G.x, 890, 520, 'WORDS · MIRA BELL      PICTURES · LOU KIMURA', { size: 11, font: FR, weight: 600, color: accent, tracking: .08, wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(...sticker(W - 130, 880, 76, 'AGES', '4 TO 8', sun, ink, 10), doodle(W - 90, 46, 50, 0, accent), doodle(60, 960, 60, 2, lime), doodle(220, 980, 40, 0, accent), text(G.x - 14, 36, 40, String(G.pageNo), { size: 14, font: FR, weight: 700, color: ink, wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        out.push(...photo(ctx, G.x, 80, G.w, 340, { tone: 'light', rx: 40, shade: skyish, caption: 'Illustration · the cave, a table, a very small knight', label: 'Story illustration' }));
        const rr = flow(K_PARAS.slice(0, 3).join('\n'), [{ x: G.x, y: 454, w: spanOf(c, 0, 3).w, b: 960 }], { ...body, size: 15.5, lead: 24 }, { dropCap: { lines: 3, font: FR, color: accent, weight: 700, scale: 1.15 } }); warnFlow('tumble p7', rr); out.push(...rr.objs);
        out.push(...sticker(G.right - 60, 640, 58, 'READ', 'ME LOUD!', sun, ink, 10), bubble(spanOf(c, 4, 5).x, 740, spanOf(c, 4, 5).w, 130, '#FFFFFF', 30), text(spanOf(c, 4, 5).x + 14, 752, spanOf(c, 4, 5).w - 28, 'What do YOU think is in the soup?', { size: 16, font: FR, weight: 700, color: accent, leading: 1.1, label: 'Reader question', role: 'CAPTION' }));
      } else {
        const rr = flow(K_PARAS.slice(3).join('\n'), [{ x: G.x, y: 90, w: spanOf(c, 0, 4).w, b: 560 }], { ...body, size: 15.5, lead: 24 }); warnFlow('tumble p8', rr); out.push(...rr.objs);
        out.push(...photo(ctx, spanOf(c, 4, 5).x, 90, spanOf(c, 4, 5).w, 200, { tone: 'light', rx: 100, caption: 'Pip & Dot', label: 'Story illustration' }));
        // word search
        const gy = 610, cell = 38, gx = G.x + 4, grid: string[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => String.fromCharCode(65 + Math.floor(r() * 26))));
        const put = (w_: string, row: number, col: number, dr: number, dc: number) => [...w_].forEach((ch, k) => { grid[row + dr * k][col + dc * k] = ch; });
        put('DRAGON', 0, 0, 0, 1); put('CAVE', 2, 1, 0, 1); put('SMOKE', 4, 0, 0, 1); put('KNIGHT', 6, 1, 0, 1); put('SOUP', 2, 7, 1, 0); put('BOWL', 0, 6, 1, 0);
        out.push(rect(G.x - 8, gy - 54, 8 * cell + 30, 8 * cell + 66, butter, { rx: 28, stroke: ink, strokeWidth: 3, label: 'Puzzle panel', role: 'SIDEBAR' }), text(G.x + 8, gy - 44, 300, 'WORD SEARCH', { size: 24, font: FR, weight: 700, color: accent, wrap: false, label: 'Puzzle title', role: 'KICKER' }));
        grid.forEach((row, ri) => row.forEach((ch, ci) => out.push(text(gx + ci * cell, gy + ri * cell + 2, cell, ch, { size: 22, font: FR, weight: 600, color: ink, align: 'center', wrap: false, leading: 1, label: 'Puzzle letter', role: 'BODY' }))));
        const wl = ['DRAGON', 'CAVE', 'SMOKE', 'KNIGHT', 'SOUP', 'BOWL'];
        out.push(text(spanOf(c, 4, 5).x - 10, gy - 40, 220, 'FIND THESE', { size: 14, font: FR, weight: 700, color: ink, tracking: .08, wrap: false, label: 'Find label', role: 'KICKER' }), ...wl.map((w_, i) => [circle(spanOf(c, 4, 5).x - 2, gy + 6 + i * 40, 10, [accent, secondary, sun, grape, lime, accent][i], { stroke: ink, strokeWidth: 2, label: 'Word bullet' }), text(spanOf(c, 4, 5).x + 16, gy - 8 + i * 40, 170, w_, { size: 20, font: FR, weight: 700, color: ink, wrap: false, label: 'Search word', role: 'BODY' })]).flat());
        out.push(text(G.x, 970, G.w, 'Answers upside down on page 91. No peeking. Okay, peeking is allowed.', { size: 12, font: BG_, color: accent, wrap: false, rotation: -1, label: 'Answer note', role: 'CAPTION' }));
      }
      out.push(...head(pageIndex === 6 ? 'The Dragon Who Hated Soup' : 'Dragon & puzzle'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 60, 700, 'Meet an\nInventor', { size: 82, font: FR, weight: 700, color: ink, leading: .94, tracking: -.01, label: 'Interview headline', role: 'HEADLINE' }), ...photo(ctx, G.right - 250, 70, 250, 250, { tone: 'light', rx: 125, shade: butter, caption: 'Zainab, 9, & Gregory the robot', label: 'Portrait' }), ...sticker(G.right - 30, 330, 56, 'AGE', '9 ¾', accent, '#FFFFFF', -8));
      let y = 304;
      K_QA.forEach(([q, a], i) => { const left = i % 2 === 0, w = 480, x = left ? G.x : G.right - w; const qq = text(x + 22, y + 16, w - 44, q, { size: 20, font: FR, weight: 700, color: [accent, secondary, grape, accent, secondary][i], leading: 1.05, label: 'Question', role: 'KICKER' }); const aa = text(x + 22, below(qq, 6), w - 44, a, { size: 14, font: NU, weight: 700, color: ink, leading: 1.4, label: 'Answer', role: 'BODY' }); const h = below(aa, 20) - y; out.push(bubble(x, y, w, h + 18, i % 2 ? skyish : butter, left ? 40 : 360), qq, aa); y += h + 52; });
      out.push(text(G.x, y + 10, G.w, 'Zainab’s tip: Keep a notebook for ideas. Draw them first. Build them second.', { size: 17, font: FR, weight: 600, color: accent, leading: 1.2, rotation: -1.5, label: 'Tip', role: 'CAPTION' }));
      out.push(...head('Meet an inventor'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 56, 700, 'Spot the Difference', { size: 60, font: FR, weight: 700, color: ink, wrap: false, tracking: -.01, leading: 1, label: 'Essay headline', role: 'HEADLINE' }), text(G.x, 128, G.w, 'The picture on the right has five tiny changes. Can you find them all? Circle each one with a crayon.', { size: 14, font: NU, weight: 800, color: accent, leading: 1.35, label: 'Essay intro', role: 'DECK' }));
      const pw = (G.w - 24) / 2;
      ['A', 'B'].forEach((l, i) => { const x = G.x + i * (pw + 24); out.push(rect(x - 6, 200, pw + 12, 520, i ? skyish : butter, { rx: 30, stroke: ink, strokeWidth: 3, label: 'Picture card', role: 'SIDEBAR' }), ...photo(ctx, x + 6, 212, pw - 12, 440, { tone: 'light', rx: 20, shade: '#FFFFFF', caption: `Picture ${l} · the birthday cake table`, label: 'Puzzle picture' }), text(x, 662, pw, `PICTURE ${l}`, { size: 18, font: FR, weight: 700, color: ink, align: 'center', tracking: .1, wrap: false, label: 'Picture label', role: 'CAPTION' })); });
      [[.3, .25], [.6, .5], [.2, .7], [.75, .2], [.5, .85]].forEach(([px, py], i) => { const x = G.x + pw + 24 + 6 + px * (pw - 12), y = 212 + py * 440; out.push(circle(x, y, 22, 'none', { stroke: accent, strokeWidth: 3.5, dash: [6, 4], label: 'Difference ring' }), text(x - 12, y - 11, 24, String(i + 1), { size: 16, font: FR, weight: 700, color: accent, align: 'center', wrap: false, leading: 1, label: 'Ring number', role: 'LABEL' })); });
      out.push(rect(G.x, 750, G.w, 190, grape, { rx: 32, stroke: ink, strokeWidth: 3, label: 'Score panel', role: 'SIDEBAR' }), text(G.x + 26, 770, 400, 'HOW MANY DID YOU FIND?', { size: 22, font: FR, weight: 700, color: '#FFFFFF', wrap: false, label: 'Score label', role: 'KICKER' }));
      [['1–2', 'Warm up! Look again.'], ['3–4', 'Sharp eyes!'], ['5', 'Detective!']].forEach(([n, t], i) => out.push(circle(G.x + 70 + i * 232, 856, 42, [accent, sun, lime][i], { stroke: ink, strokeWidth: 3, label: 'Score badge' }), text(G.x + 28 + i * 232, 840, 84, n, { size: 26, font: FR, weight: 700, color: i === 0 ? '#FFFFFF' : ink, align: 'center', wrap: false, leading: 1, label: 'Score number', role: 'HERO' }), text(G.x + 120 + i * 232, 846, 110, t, { size: 13, font: NU, weight: 800, color: '#FFFFFF', leading: 1.25, label: 'Score text', role: 'BODY' })));
      out.push(text(G.x, 960, G.w, 'Pictures drawn by Lou Kimura. Answers: the cake, the third balloon, the cat’s tail, the flag, the number of candles.', { size: 10, font: NU, weight: 700, color: alpha(ink, .7), wrap: false, label: 'Credit', role: 'CREDIT' }));
      out.push(...head('Spot the difference'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x - 2, 56, 700, 'Grown-up page', { size: 70, font: FR, weight: 700, color: ink, wrap: false, tracking: -.01, leading: 1, label: 'Colophon headline', role: 'HEADLINE' }), text(G.x, 134, G.w, 'Everything you need to know, and one thing you do not (but may enjoy).', { size: 14, font: NU, weight: 800, color: accent, leading: 1.4, label: 'Colophon deck', role: 'DECK' }));
      const staff: Array<[string, string, string]> = [['Editor', 'Aisha Rahman', accent], ['Stories', 'Mira Bell', secondary], ['Pictures', 'Lou Kimura', sun], ['Puzzles', 'Tobias Wren', grape], ['Design', 'Marta Quill', lime], ['Publisher', 'Imani Cole', accent]];
      staff.forEach(([k, n, col], i) => { const x = G.x + (i % 3) * (G.w / 3 + 2), y = 196 + Math.floor(i / 3) * 96, w = G.w / 3 - 12; out.push(rect(x, y, w, 80, [pinkish, skyish, butter][i % 3], { rx: 22, stroke: ink, strokeWidth: 2.5, label: 'Credit card', role: 'SIDEBAR' }), circle(x + 30, y + 40, 18, col, { stroke: ink, strokeWidth: 2.5, label: 'Credit dot' }), text(x + 56, y + 14, w - 62, k.toUpperCase(), { size: 9.5, font: NU, weight: 900, color: alpha(ink, .6), tracking: .12, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(x + 56, y + 32, w - 62, n, { size: 18, font: FR, weight: 700, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' })); });
      const info: Array<[string, string]> = [['Ages & reading', 'Stories are written for ages 4–8 to read aloud and 7–10 to read alone. Activity pages are labelled with the age they suit best.'], ['Safety', 'Always supervise kitchen and craft activities. Scissors, toasters and glue guns are for grown-ups or for children with a grown-up present. Wash your hands first.'], ['Subscribe', '12 issues, $48. tumblemag.example/club. Gift subscriptions arrive with a sticker sheet and a birthday card.'], ['Contact', 'Tumble, 22 Marble Lane, Brooklyn NY 11215. hello@tumblemag.example. Children may write to us in crayon.']];
      info.forEach(([h, t], i) => { const x = G.x + (i % 2) * (G.w / 2 + 8), y = 420 + Math.floor(i / 2) * 190, w = G.w / 2 - 8; out.push(text(x, y, w, h, { size: 22, font: FR, weight: 700, color: [accent, secondary, grape, accent][i], wrap: false, label: 'Info heading', role: 'KICKER' }), hr(x, y + 34, w, ink, 2, { label: 'Rule' }), text(x, y + 46, w, t, { size: 11.5, font: NU, weight: 700, color: ink, leading: 1.5, label: 'Info text', role: 'BODY' })); });
      out.push(text(G.x, 820, G.w, '© 2026 Tumble Media. Printed on recycled paper with soy inks. Trim 8.5 × 11 in. Typeset in Fredoka and Nunito. No dragons were harmed, though one was asked to eat soup.', { size: 10, font: NU, weight: 700, color: alpha(ink, .65), leading: 1.5, label: 'Rights', role: 'FOOTNOTE' }));
      out.push(...barcodeBox(G.x, 884, 118, 60, { plate: paper, ink, seed, code: 'ISSN 2622-0922', note: 'ISSUE 22', font: 'ibmPlexMono' }), ...sticker(G.right - 80, 920, 62, 'THE', 'END?', sun, ink, 8));
      out.push(...head('Grown-up page'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, mix(secondary, .8))];
      out.push(text(36, 40, W - 72, 'Make a paper hat!', { size: 74, font: FR, weight: 700, color: ink, align: 'center', tracking: -.01, wrap: false, leading: 1, label: 'Back cover headline', role: 'COVER_LINE' }), text(36, 124, W - 72, 'CUT ALONG THE SOLID LINES · FOLD ALONG THE DASHED LINES · ASK A GROWN-UP FOR TAPE', { size: 11, font: NU, weight: 900, color: accent, align: 'center', tracking: .08, wrap: false, label: 'Back cover instruction', role: 'COVER_LINE' }));
      // hat net
      const hx = 150, hy = 180, hw = 516, hh = 360;
      out.push(rect(hx, hy, hw, hh, '#FFFFFF', { stroke: ink, strokeWidth: 3, rx: 6, label: 'Hat panel (cut line)', role: 'ORNAMENT' }), vrule(hx + hw / 2, hy, hh, ink, 2, 'Fold line'), hr(hx, hy + 110, hw, ink, 2, { label: 'Fold line' }), ...[0, 1, 2, 3, 4, 5, 6].map(i => path(hx + 18 + i * 68, hy + 10, 40, 40, orn.starPath(5, .45), [accent, sun, secondary, grape, lime, accent, sun][i], { label: 'Hat star' })));
      ['FOLD →', '← FOLD'].forEach((t, i) => out.push(text(hx + 10 + i * (hw / 2), hy + 124, hw / 2 - 20, t, { size: 13, font: BG_, color: accent, align: i ? 'right' : 'left', wrap: false, label: 'Fold label', role: 'CAPTION' })));
      out.push(text(hx + 20, hy + 160, hw - 40, 'Paint this side with your own pattern: stripes, spots, dragons, soup. Then wear it to the table.', { size: 17, font: FR, weight: 600, color: ink, align: 'center', leading: 1.25, label: 'Hat panel note', role: 'BODY' }));
      const steps = ['Cut out the big rectangle.', 'Fold in half the long way, then open.', 'Fold the top corners down to the middle line.', 'Fold the bottom edges up, both sides. Tape.'];
      const stc = columns(36, W - 72, 4, 14);
      steps.forEach((s, i) => out.push(circle(stc[i].x + 24, 640, 24, [accent, secondary, sun, grape][i], { stroke: ink, strokeWidth: 2.5, label: 'Step badge' }), text(stc[i].x, 626, 48, String(i + 1), { size: 28, font: FR, weight: 700, color: i === 2 ? ink : '#FFFFFF', align: 'center', wrap: false, leading: 1, label: 'Step number', role: 'LABEL' }), text(stc[i].x, 680, stc[0].w, s, { size: 12.5, font: NU, weight: 800, color: ink, leading: 1.4, label: 'Step text', role: 'BODY' })));
      out.push(...sticker(110, 860, 72, 'TA-DA!', 'NEXT: MONSTERS', sun, ink, -10), text(210, 840, 460, 'Next time in Tumble: monster cooking, a map of the garden, and how to say hello in nine languages.', { size: 16, font: NU, weight: 800, color: ink, leading: 1.4, label: 'Next issue copy', role: 'COVER_LINE' }));
      out.push(...barcodeBox(W - 36 - 112, 960, 112, 60, { plate: paper, ink, seed, code: '0 74470 22022 5', note: 'TUMBLE 22', font: 'ibmPlexMono' }), text(40, 980, 300, 'tumblemag.example', { size: 13, font: FR, weight: 600, color: accent, wrap: false, label: 'URL', role: 'LABEL' }));
      return out;
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 12 · WITNESS — photojournalism & documentary. Full-bleed pictures, minimal type, dateline captions, caption index.
//      Trim 9.5 × 12 in (912 × 1152 px), perfect bound. 12-column grid, 16 px baseline; type stays out of the picture's way.
// ═════════════════════════════════════════════════════════════════════════════
const WG: Grid = { cols: 12, gutter: 12, base: 16, top: 76, bottom: 84, inner: 72, outer: 56 };
const W_PARAS = [
  'At 5:40 every morning the ferry leaves the east bank with eleven people, a handcart and a goat. It has done so, with brief interruptions for flood, for forty-one years. On Friday it will make its last crossing, and the bridge, which has taken nine years and a good deal of money, will open to traffic at noon.',
  'I spent the last six weeks of the ferry’s life on board, sleeping, when I slept, on a bench behind the wheelhouse. The captain, a man named Joseph, who has crossed this river fourteen thousand times, says the water has never been the same twice. “You can step in the same river,” he says, “as long as you do not mind drowning.”',
  'What I wanted to photograph was not the ferry but the gap: the twelve minutes in the middle of the river when the passengers are nowhere. They have left one bank and not yet reached the other. A woman reads. A boy is asleep with his head on a sack of rice. A pair of teachers argues about football. Time, as they say, has been suspended.',
  'The bridge will cut the crossing to ninety seconds. Nobody I spoke to objects to this. They do not miss the delays or the diesel, and the morning ferry has often been late. But several of them said, independently, that they would miss the twelve minutes. “It is the only part of the day,” said one of the teachers, “when I am not required to be anywhere.”',
  'On the last night the crew held a supper on deck. There was rice, fish, a great deal of tea and a song that I did not know and could not stop humming. Joseph made a short speech, in which he thanked the river and apologised to the goat. Somebody turned off the engine and we drifted, for a minute, under a sky of ordinary stars.',
  'At noon on Friday the bridge opened. The ferry was already moored, its ropes slack, its paint lifting in the sun. A small crowd had gathered on the bank, not to cheer the bridge, which hummed with cars, but to wave at the boat. It did not wave back. It did something better, which was to be there, for one more hour, where it had always been.',
];
const W_QA: Array<[string, string]> = [
  ['Why a ferry?', 'Because crossing is the oldest story we have. Everyone has been on one side of something, waiting to be on the other.'],
  ['How do you decide when to press the shutter?', 'I do not decide. I wait until I stop being a person with a camera and become a person with a bench. The picture is usually taken a second after I have forgotten to look for it.'],
  ['What do you owe your subjects?', 'Everything, and the truth, which is not the same as the whole story. I show people the pictures first, and the ones that make them flinch stay in the drawer.'],
  ['What is the hardest thing about this work?', 'Leaving. You become part of a place, and then you are a visitor again, with a flight and a deadline.'],
  ['What would you tell a young photographer?', 'Stay longer. Then stay longer than that. The best frames are on the third day.'],
];

const witness: PublicationDesigner = (ctx) => {
  const { W, H, pageType, pageIndex, paper, ink, accent, secondary, seed } = ctx;
  const G = geo(ctx, WG), c = G.cols;
  const AR = 'archivo' as const, MO = 'ibmPlexMono' as const, LO = 'lora' as const;
  const dim = alpha(ink, .62), line_ = alpha(ink, .25), plate = mix(paper, .1);
  const body = { font: LO, size: 11.4, lead: 19, color: alpha(ink, .94), weight: 400, indent: 18, role: 'BODY' as const };
  const head = (section: string, color = ink) => [
    rect(G.verso ? G.x : G.right - 10, 34, 10, 10, accent, { label: 'Mark', role: 'ORNAMENT' }),
    text(G.verso ? G.x + 20 : G.x, 33, G.w - 20, G.verso ? 'WITNESS  ·  ISSUE 31' : section, { size: 8, font: AR, weight: 700, color, tracking: .34, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'RUNNING_HEAD' }),
    text(G.verso ? G.x : G.right - 40, H - 54, 40, String(G.pageNo).padStart(2, '0'), { size: 9, font: MO, weight: 600, color, align: G.verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
    text(G.verso ? G.x + 40 : G.x, H - 53, G.w - 40, G.verso ? section : 'WITNESSMAG.EXAMPLE', { size: 7.5, font: MO, weight: 500, color: alpha(color, .55), tracking: .2, transform: 'uppercase', align: G.verso ? 'left' : 'right', wrap: false, label: 'Running foot', role: 'RUNNING_HEAD' }),
  ];
  const cap = (x: number, y: number, w: number, dateline: string, t: string, credit: string, color = ink) => [text(x, y, w, dateline, { size: 7.5, font: MO, weight: 600, color: accent, tracking: .16, transform: 'uppercase', label: 'Dateline', role: 'CAPTION' }), ...caption(x, y + 14, w, t, credit, { font: AR, color, size: 9.4, weight: 400, leading: 1.55, transform: 'none', creditFont: MO })];
  const dark = (x: number, y: number, w: number, h: number, a: number): Obj => rect(x, y, w, h, '#000000', { opacity: a, label: 'Legibility shade', role: 'ORNAMENT' });

  switch (pageType) {
    case 'COVER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: '#2A2926', caption: 'Cover photograph · the 5:40 crossing, eleven passengers and a goat, Kossou, Ivory Coast', label: 'Cover photograph' }));
      out.push(rect(-BL, -BL, W + BL * 2, 200, '#000000', { gradient: fade(90, '#000000', .7, 0), label: 'Masthead shade' }), rect(-BL, H - 380, W + BL * 2, 380 + BL, '#000000', { gradient: fade(90, '#000000', 0, .85), label: 'Foot shade' }));
      out.push(rect(52, 50, 24, 24, accent, { label: 'Mark', role: 'ORNAMENT' }), text(90, 40, 600, 'WITNESS', { size: 54, font: AR, weight: 800, color: ink, tracking: .18, wrap: false, leading: 1, label: 'Masthead', role: 'COVER_TITLE' }));
      out.push(text(52, 112, 500, 'A QUARTERLY OF DOCUMENTARY PHOTOGRAPHY', { size: 8.5, font: MO, weight: 600, color: ink, tracking: .3, wrap: false, label: 'Tagline', role: 'LABEL' }), text(W - 352, 58, 300, 'ISSUE 31  ·  AUTUMN 2026  ·  $22', { size: 8.5, font: MO, weight: 600, color: ink, tracking: .2, align: 'right', wrap: false, label: 'Issue line', role: 'LABEL' }));
      out.push(text(52, H - 300, 600, 'The Last Ferry', { size: 78, font: AR, weight: 700, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Cover line', role: 'COVER_LINE' }), text(54, H - 208, 560, 'Imani Adeyemi spends six weeks on a river crossing that is about to be replaced by a bridge. Page 38.', { size: 12.5, font: AR, weight: 400, color: alpha(ink, .9), leading: 1.6, label: 'Cover line deck', role: 'COVER_LINE' }));
      out.push(text(52, H - 120, 520, 'ALSO IN THIS ISSUE', { size: 7.5, font: MO, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Also label', role: 'KICKER' }), text(52, H - 100, 560, '01  Salt, Not Snow, Mongolia   ·   02  The Night Market, Lima   ·   03  What the Flood Left   ·   04  Fifty Years of the Same Street', { size: 8.5, font: MO, weight: 500, color: alpha(ink, .82), leading: 1.8, label: 'Index line', role: 'COVER_LINE' }));
      out.push(...barcodeBox(W - 52 - 112, H - 108, 112, 52, { plate: ink, ink: paper, seed, code: '0 74470 31031 7', note: 'WITNESS 31', font: MO }));
      return out;
    }

    case 'CONTENTS': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 76, 300, 'Caption index', { size: 40, font: AR, weight: 600, color: ink, tracking: -.01, wrap: false, label: 'Contents title', role: 'HEADLINE' }), text(G.x, 126, 360, 'EVERY PICTURE IN THIS ISSUE, IN THE ORDER YOU WILL MEET IT.', { size: 7.5, font: MO, weight: 600, color: accent, tracking: .2, wrap: false, label: 'Contents intro', role: 'KICKER' }));
      const items: Array<[string, string, string, string]> = [['01', 'The Last Ferry', 'Imani Adeyemi', '38'], ['02', 'Salt, Not Snow', 'Odgerel Batbayar', '52'], ['03', 'The Night Market', 'Lucía Ferreira', '62'], ['04', 'What the Flood Left', 'Samir Batra', '70'], ['05', 'The Same Street', 'Ruth Abara', '82'], ['06', 'Dispatches', 'Agency pool', '12'], ['07', 'Imani Adeyemi, in conversation', 'Interview', '62'], ['08', 'The Contact Sheet', 'The photo desk', '96'], ['09', 'The Ethics of a Caption', 'Editors', '102'], ['10', 'Who Made This', 'Masthead', '108'], ['11', 'Letter from the editor', 'Editors', '6'], ['12', 'Index of places', 'Reference', '110']];
      const tc = columns(G.x, G.w, 4, 14), tw = tc[0].w, th = tw * 1.15;
      items.forEach(([n, t, a, p], i) => { const x = tc[i % 4].x, y = 190 + Math.floor(i / 4) * 290; out.push(...photo(ctx, x, y, tw, th, { tone: 'dark', shade: '#2E2D2A', caption: n, label: 'Index thumbnail' }), text(x, y + th + 8, 40, n, { size: 9, font: MO, weight: 700, color: accent, wrap: false, label: 'Index number', role: 'LABEL' }), text(x + 24, y + th + 6, tw - 60, t, { size: 11.5, font: AR, weight: 600, color: ink, leading: 1.15, label: 'Index title', role: 'HEADLINE' }), text(x + tw - 36, y + th + 8, 36, p, { size: 9, font: MO, weight: 600, color: dim, align: 'right', wrap: false, label: 'Index page', role: 'FOLIO' }), text(x + 24, y + th + 44, tw - 24, a, { size: 7.5, font: MO, weight: 500, color: dim, tracking: .12, transform: 'uppercase', wrap: false, label: 'Index credit', role: 'CREDIT' })); });
      out.push(hr(G.x, 1052, G.w, line_, .5, { label: 'Rule' }), text(G.x, 1062, G.w, 'Cover: the 5:40 ferry at Kossou, by Imani Adeyemi. All photographs are copyright their makers and reproduced with permission.', { size: 8, font: MO, color: dim, leading: 1.6, label: 'Cover credit', role: 'CREDIT' }));
      out.push(...head('Caption index'));
      return out;
    }

    case 'EDITOR’S NOTE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 90, 300, 'LETTER FROM THE EDITORS', { size: 7.5, font: MO, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(G.x, 112, spanOf(c, 0, 9).w, 'We print the caption before the picture, so you know what you are about to see.', { size: 40, font: AR, weight: 600, color: ink, leading: 1.08, tracking: -.01, label: 'Letter headline', role: 'HEADLINE' });
      out.push(t);
      const l = spanOf(c, 0, 3), r = spanOf(c, 5, 11);
      const letter = 'There is an old argument in photography about whether the picture should speak for itself. We think it should speak first, and then be spoken to. A photograph is an incomplete sentence; the caption is where it learns to finish.\nIn this issue you will find a ferry, a salt flat, a night market and a flood. You will find the date, the place and the name of every person whose face you are asked to look at for longer than a second. You will find the photographers’ own words on how they got in the room.\nWe believe the work of a documentary photographer is to be allowed in and to be worthy of it. We show subjects the pictures first. We print what they have asked us to correct. We print what we have got wrong. A magazine can do very little about the world, but it can be accurate about it.\nSo read the captions. They are the part that was said out loud.';
      const rr = balance(letter, colFrames(columns(r.x, r.w, 2, 24), below(t, 56), 900), body, { dropCap: { lines: 3, font: AR, color: accent, weight: 700, scale: 1.05 } }); warnFlow('witness letter', rr); out.push(...rr.objs);
      out.push(...photo(ctx, l.x, below(t, 56), l.w, 300, { tone: 'dark', shade: '#2E2D2A', caption: 'The photo desk', label: 'Editors photograph' }), ...cap(l.x, below(t, 56) + 312, l.w, 'London — 2 Sept 2026', 'The photo desk at midnight, deadline night. Left to right: three editors and a very large printer.', 'Photograph Ruth Abara'));
      out.push(text(r.x, bottomOf(rr.objs) + 20, r.w, 'The editors', { size: 18, font: LO, italic: true, color: ink, wrap: false, label: 'Signature', role: 'BYLINE' }));
      out.push(rect(G.x, 900, G.w, 150, mix(paper, .06), { label: 'Quote panel', role: 'SIDEBAR' }), ...pullQuote(G.x + 24, 920, G.w - 48, '“The caption is the part that was said out loud.”', null, { font: AR, size: 30, weight: 600, color: accent, leading: 1.1, rule: 'none' }));
      out.push(...head('Letter from the editors'));
      return out;
    }

    case 'DEPARTMENT': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(text(G.x, 76, 400, 'Dispatches', { size: 40, font: AR, weight: 600, color: ink, tracking: -.01, wrap: false, label: 'Department title', role: 'HEADLINE' }), text(G.x + 220, 90, 460, 'FROM THE AGENCY WIRE  ·  THREE FRAMES, THREE WEEKS', { size: 7.5, font: MO, weight: 600, color: accent, tracking: .2, wrap: false, label: 'Department deck', role: 'KICKER' }));
      const rows: Array<[string, string, string, string]> = [['KHERSON, UKRAINE — 14 MARCH 2026', 'Volunteers sort donated bread outside a school that has been a shelter since October. The queue formed at four in the morning, long before the delivery van arrived, and was quiet.', 'Photograph Odgerel Batbayar / Pool', ''], ['LIMA, PERU — 2 JUNE 2026', 'A fruit seller sets out her stall at the Surquillo market. She has been at the same place for thirty-four years and says the only thing that has changed is the price of lemons.', 'Photograph Lucía Ferreira', ''], ['DHAKA, BANGLADESH — 19 AUGUST 2026', 'Children cross a flooded lane on a door that has been taken off its hinges. Neighbours say the water reached this level twice in a month, which has not happened since 1998.', 'Photograph Samir Batra / Pool', '']];
      rows.forEach(([d, t, cr], i) => { const y = 150 + i * 310; out.push(...photo(ctx, i % 2 ? G.x + 160 : 0, y, i % 2 ? G.w - 160 : G.x + G.w - 160 + (G.verso ? 0 : 0), 230, { tone: 'dark', shade: '#2E2D2A', caption: ['Wire photograph 1', 'Wire photograph 2', 'Wire photograph 3'][i], label: 'Dispatch photograph' }), ...cap(i % 2 ? G.x + 160 : G.x, y + 244, 430, d, t, cr)); out.push(text(i % 2 ? G.x : G.right - 130, y + 240, 130, `0${i + 1}`, { size: 54, font: AR, weight: 700, color: alpha(ink, .12), align: i % 2 ? 'left' : 'right', wrap: false, leading: 1, label: 'Dispatch number', role: 'ORNAMENT' })); });
      out.push(...head('Dispatches'));
      return out;
    }

    case 'AD PAGE': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...adSlot(0, 0, W, H, { fill: '#252422', ink, accent, font: MO, kind: 'Advertisement  ·  full page, bleed', spec: 'Trim 9.5 × 12 in  ·  bleed 0.125 in  ·  live area 9.0 × 11.5 in  ·  300 dpi CMYK  ·  PDF/X-4', bleed: true, ctx, live: SAFE }));
      out.push(text(G.x, 40, 300, 'ADVERTISEMENT', { size: 7, font: MO, weight: 600, color: alpha(ink, .5), tracking: .3, wrap: false, label: 'Ad label', role: 'CAPTION' }), text(G.verso ? G.x : G.right - 40, H - 54, 40, String(G.pageNo).padStart(2, '0'), { size: 9, font: MO, weight: 600, color: alpha(ink, .55), align: G.verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'FEATURE OPENER': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: '#2A2926', caption: 'Opening photograph · the ferry at 5:40, mid-river, Kossou', label: 'Feature photograph' }));
      out.push(rect(-BL, H - 460, W + BL * 2, 460 + BL, '#000000', { gradient: fade(90, '#000000', 0, .88), label: 'Foot shade' }));
      out.push(rect(G.x, H - 360, 56, 4, accent, { label: 'Red rule' }), text(G.x, H - 340, 520, 'PHOTO ESSAY  ·  IVORY COAST', { size: 8, font: MO, weight: 600, color: ink, tracking: .26, wrap: false, label: 'Kicker', role: 'KICKER' }));
      out.push(text(G.x - 2, H - 316, 700, 'The Last Ferry', { size: 82, font: AR, weight: 700, color: ink, tracking: -.02, wrap: false, leading: 1, label: 'Feature headline', role: 'HEADLINE' }), text(G.x, H - 210, 440, 'For forty-one years the 5:40 has crossed the river with eleven people, a handcart and a goat. On Friday a bridge opens.', { size: 13, font: AR, weight: 400, color: alpha(ink, .92), leading: 1.6, label: 'Deck', role: 'DECK' }), text(G.x, H - 112, 500, 'PHOTOGRAPHS AND WORDS  IMANI ADEYEMI', { size: 8, font: MO, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Byline', role: 'BYLINE' }));
      out.push(...cap(G.right - 270, H - 210, 270, 'Kossou — 12 March 2026', 'The 5:40 crossing, mid-river, with eleven passengers. The captain says the water is never the same twice.', 'Photograph Imani Adeyemi'));
      out.push(text(G.x, 33, 40, String(G.pageNo).padStart(2, '0'), { size: 9, font: MO, weight: 600, color: ink, wrap: false, label: 'Folio', role: 'FOLIO' }));
      return out;
    }

    case 'ARTICLE': {
      const out: Obj[] = [ground(ctx, paper)];
      if (pageIndex === 6) {
        const txt = spanOf(c, 4, 10), side = spanOf(c, 0, 3);
        out.push(text(txt.x, 90, 300, 'THE LAST FERRY  ·  1', { size: 7.5, font: MO, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Kicker', role: 'KICKER' }));
        const dk = text(txt.x, 112, txt.w, 'At 5:40 every morning the ferry leaves the east bank with eleven people, a handcart and a goat.', { size: 30, font: LO, italic: true, color: ink, leading: 1.18, label: 'Deck', role: 'DECK' });
        out.push(dk);
        const rr = balance(W_PARAS.slice(0, 4).join('\n'), [{ x: txt.x, y: below(dk, 30), w: txt.w, b: 1000 }], body, { dropCap: { lines: 3, font: AR, color: accent, weight: 700, scale: 1.05 } }); warnFlow('witness p7', rr); out.push(...rr.objs);
        out.push(...photo(ctx, 0, 112, side.x + side.w, 560, { tone: 'dark', shade: '#2E2D2A', caption: 'The goat, 5:44', label: 'Essay photograph' }), ...cap(side.x, 684, side.w, 'Kossou — 14 March 2026', 'The goat, who rides free, inspects the handcart at 5:44. The captain says it has never once paid.', 'Photograph Imani Adeyemi'));
        out.push(...photo(ctx, txt.x, bottomOf(rr.objs) + 40, txt.w, 220, { tone: 'dark', shade: '#2E2D2A', caption: 'The bench behind the wheelhouse', label: 'Essay photograph' }), ...cap(txt.x, bottomOf(rr.objs) + 272, txt.w, 'Kossou — 20 March 2026', 'The bench behind the wheelhouse, where the photographer slept. The captain’s tea flask is beside it.', 'Photograph Imani Adeyemi'));
      } else {
        const txt = spanOf(c, 0, 6), side = spanOf(c, 8, 11);
        out.push(...photo(ctx, 0, 0, W, 420, { tone: 'dark', shade: '#2E2D2A', caption: 'The passengers, mid-river', label: 'Essay photograph' }), ...cap(G.x, 434, 400, 'Kossou — 2 April 2026', 'Mid-river, twelve minutes out: a woman reads, a boy sleeps on a sack of rice, two teachers argue about football.', 'Photograph Imani Adeyemi'));
        const rr = balance(W_PARAS.slice(4).join('\n') + '\n' + 'The photographs in this essay were taken over six weeks with a single camera and one lens. None has been cropped, and the captain has seen them all. He asked for two changes, to a date and to the spelling of the goat’s name, and we have made them both.', [{ x: txt.x, y: 540, w: txt.w, b: 1040 }], body);
        warnFlow('witness p8', rr); out.push(...rr.objs);
        out.push(text(side.x, 540, side.w, 'FIELD NOTES', { size: 7.5, font: MO, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Notes label', role: 'KICKER' }), hr(side.x, 560, side.w, line_, .5, { label: 'Rule' }));
        [['Day 3', 'The ferry has no timetable, only a bell.'], ['Day 14', 'Joseph says the river is brown because it is thinking.'], ['Day 29', 'Seven passengers asked me to photograph the goat, none the captain.'], ['Day 41', 'Last supper on deck. Tea, rice, fish, a song.']].forEach(([d, t], i) => out.push(text(side.x, 574 + i * 96, side.w, d.toUpperCase(), { size: 7.5, font: MO, weight: 700, color: accent, tracking: .2, wrap: false, label: 'Note day', role: 'LABEL' }), text(side.x, 590 + i * 96, side.w, t, { size: 10, font: LO, italic: true, color: alpha(ink, .9), leading: 1.55, label: 'Field note', role: 'SIDEBAR' })));
      }
      out.push(...head(pageIndex === 6 ? 'The Last Ferry' : 'The Last Ferry  ·  continued'));
      return out;
    }

    case 'INTERVIEW': {
      const out: Obj[] = [ground(ctx, paper)];
      const left = spanOf(c, 0, 4), right = spanOf(c, 6, 11);
      out.push(...photo(ctx, 0, 0, left.x + left.w, 760, { tone: 'dark', shade: '#2E2D2A', caption: 'Imani Adeyemi, Kossou', label: 'Portrait' }), ...cap(left.x, 776, left.w, 'Kossou — 22 March 2026', 'Imani Adeyemi on the ferry’s upper deck, between crossings, a camera she has used for eleven years round her neck.', 'Photograph Joseph Kouadio'));
      out.push(text(right.x, 90, 300, 'IN CONVERSATION', { size: 7.5, font: MO, weight: 700, color: accent, tracking: .24, wrap: false, label: 'Kicker', role: 'KICKER' }));
      const t = text(right.x, 112, right.w, '“Stay longer. The best frames are on the third day.”', { size: 36, font: AR, weight: 600, color: ink, leading: 1.1, tracking: -.01, label: 'Interview headline', role: 'HEADLINE' });
      out.push(t);
      let y = below(t, 46);
      W_QA.forEach(([q, a], i) => { const qq = text(right.x, y, right.w, q, { size: 9, font: MO, weight: 700, color: accent, tracking: .1, transform: 'uppercase', leading: 1.5, label: 'Question', role: 'KICKER' }); const aa = text(right.x, below(qq, 6), right.w, a, { size: 11.4, font: LO, color: alpha(ink, .94), leading: 1.65, label: 'Answer', role: 'BODY' }); out.push(qq, aa); y = below(aa, 28); });
      out.push(...head('In conversation'));
      return out;
    }

    case 'PHOTO ESSAY': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, 800, { tone: 'dark', shade: '#2A2926', caption: 'The Contact Sheet · frame 21, the last supper on deck', label: 'Hero photograph' }));
      [[.22, .3, '1'], [.5, .55, '2'], [.78, .35, '3'], [.62, .8, '4']].forEach(([px, py, n]) => out.push(circle(W * (px as number), 800 * (py as number), 11, 'none', { stroke: ink, strokeWidth: 1.5, label: 'Index marker' }), text(W * (px as number) - 10, 800 * (py as number) - 6, 20, n as string, { size: 9, font: MO, weight: 700, color: ink, align: 'center', wrap: false, label: 'Marker number', role: 'LABEL' })));
      out.push(text(G.x, 828, 400, 'Caption index', { size: 26, font: AR, weight: 600, color: ink, wrap: false, label: 'Essay headline', role: 'HEADLINE' }), text(G.x, 862, 300, 'FRAME 21  ·  THE LAST SUPPER ON DECK', { size: 7.5, font: MO, weight: 700, color: accent, tracking: .2, wrap: false, label: 'Essay kicker', role: 'KICKER' }));
      const items: Array<[string, string]> = [['1', 'Joseph, the captain, standing to make his speech. He thanked the river first.'], ['2', 'The goat, under the table, hoping for rice.'], ['3', 'A teacher holding the tea, who said she would miss the twelve minutes.'], ['4', 'The engineer, who has not been seen in daylight since March.']];
      const ic = columns(G.x, G.w, 2, 40);
      items.forEach(([n, t], i) => out.push(text(ic[i % 2].x, 894 + Math.floor(i / 2) * 76, 24, n, { size: 14, font: AR, weight: 700, color: accent, wrap: false, label: 'Caption number', role: 'LABEL' }), text(ic[i % 2].x + 26, 892 + Math.floor(i / 2) * 76, ic[0].w - 26, t, { size: 9.6, font: AR, weight: 400, color: alpha(ink, .9), leading: 1.55, label: 'Caption', role: 'CAPTION' })));
      out.push(text(G.x, 1052, G.w, 'KOSSOU, IVORY COAST — 14 APRIL 2026  ·  PHOTOGRAPH IMANI ADEYEMI', { size: 7.5, font: MO, weight: 600, color: dim, tracking: .16, wrap: false, label: 'Credit', role: 'CREDIT' }));
      out.push(...head('Contact sheet'));
      return out;
    }

    case 'COLOPHON': {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(rect(G.x, 90, 24, 24, accent, { label: 'Mark', role: 'ORNAMENT' }), text(G.x + 40, 80, 600, 'WITNESS', { size: 44, font: AR, weight: 800, color: ink, tracking: .16, wrap: false, leading: 1, label: 'Colophon masthead', role: 'COVER_TITLE' }));
      out.push(text(G.x, 164, spanOf(c, 0, 7).w, 'Our ethics, in one page.', { size: 40, font: AR, weight: 600, color: ink, leading: 1.08, label: 'Colophon headline', role: 'HEADLINE' }));
      const eth = ['Every photograph is captioned with the place, the date and the name of the person who made it.', 'We do not stage, alter, or crop a documentary picture in a way that changes what happened.', 'We show subjects their portraits before publication and print what they ask us to correct.', 'We pay our photographers within thirty days, and our fixers and translators in advance.', 'We publish our corrections on the page they appear on, and keep them there.'];
      eth.forEach((t, i) => out.push(text(G.x, 270 + i * 62, 30, String(i + 1).padStart(2, '0'), { size: 12, font: MO, weight: 700, color: accent, wrap: false, label: 'Principle number', role: 'LABEL' }), text(G.x + 40, 268 + i * 62, spanOf(c, 0, 7).w - 40, t, { size: 12, font: LO, color: alpha(ink, .94), leading: 1.6, label: 'Principle', role: 'BODY' }), hr(G.x, 270 + i * 62 - 12, spanOf(c, 0, 7).w, line_, .5, { label: 'Rule' })));
      const staff: Array<[string, string]> = [['Editor-in-chief', 'Ruth Abara'], ['Photo editor', 'Marguerite Ellis'], ['Picture research', 'Samir Batra'], ['Design', 'Pilar Duarte'], ['Fact-check & captions', 'Aiko Mori'], ['Publisher', 'Daniel Achebe']];
      const rc = spanOf(c, 8, 11);
      staff.forEach(([r_, n], i) => out.push(text(rc.x, 270 + i * 62, rc.w, r_.toUpperCase(), { size: 7, font: MO, weight: 600, color: dim, tracking: .18, wrap: false, label: 'Credit role', role: 'CAPTION' }), text(rc.x, 284 + i * 62, rc.w, n, { size: 15, font: AR, weight: 600, color: ink, wrap: false, label: 'Credit name', role: 'BYLINE' })));
      const info: Array<[string, string]> = [['Subscribe', 'Four issues, $84. witnessmag.example/subscribe.'], ['Submit', 'Portfolios to submissions@witnessmag.example. We reply to everyone.'], ['Write', 'Witness, 18 Alder Lane, London N1 5QA.'], ['Rights', '© 2026 Witness Editions. Photographs © their makers. Trim 9.5 × 12 in, 0.125 in bleed.']];
      info.forEach(([h, t], i) => { const x = G.x + (i % 2) * (G.w / 2 + 6), y = 780 + Math.floor(i / 2) * 110, w = G.w / 2 - 6; out.push(text(x, y, w, h.toUpperCase(), { size: 7.5, font: MO, weight: 700, color: accent, tracking: .22, wrap: false, label: 'Info heading', role: 'KICKER' }), text(x, y + 16, w, t, { size: 10, font: AR, color: alpha(ink, .9), leading: 1.6, label: 'Info text', role: 'BODY' })); });
      out.push(...barcodeBox(G.right - 112, 960, 112, 52, { plate: ink, ink: paper, seed, code: 'ISSN 2604-5517', note: 'ISSUE 31', font: MO }));
      out.push(...head('Masthead'));
      return out;
    }

    case 'BACK COVER':
    default: {
      const out: Obj[] = [ground(ctx, paper)];
      out.push(...photo(ctx, 0, 0, W, H, { tone: 'dark', shade: '#2A2926', caption: 'Back cover · the ferry, moored, ropes slack, noon on the last day', label: 'Back cover photograph' }));
      out.push(rect(-BL, H - 300, W + BL * 2, 300 + BL, '#000000', { gradient: fade(90, '#000000', 0, .85), label: 'Foot shade' }));
      out.push(rect(52, H - 216, 56, 4, accent, { label: 'Red rule' }), ...cap(52, H - 196, 440, 'Kossou, Ivory Coast — 18 April 2026', 'The ferry, moored, its ropes slack, an hour after the bridge opened. A small crowd on the bank waved at the boat. It did not wave back.', 'Photograph Imani Adeyemi'));
      out.push(text(W - 352, H - 196, 300, 'WITNESS', { size: 34, font: AR, weight: 800, color: ink, tracking: .18, align: 'right', wrap: false, leading: 1, label: 'Masthead, small', role: 'COVER_TITLE' }), text(W - 352, H - 150, 300, 'NEXT ISSUE  ·  ON SALE 15 DECEMBER\nSALT, NOT SNOW: SIX WEEKS ON THE MONGOLIAN STEPPE', { size: 8, font: MO, weight: 600, color: alpha(ink, .85), tracking: .14, align: 'right', leading: 1.7, label: 'Next issue', role: 'COVER_LINE' }), ...barcodeBox(W - 52 - 112, H - 88, 112, 52, { plate: ink, ink: paper, seed, code: '0 74470 31031 7', note: 'WITNESS 31', font: MO }));
      return out;
    }
  }
};

// __EXPORTS__
export const DESIGNS_C: Record<string, PublicationDesigner> = {
  'mag-photojournal': witness,
  'mag-kids-family': tumble,
  'mag-community-digest': porchlight,
  'mag-literary-journal': quire,
};

export const LESSONS_C: Record<string, DesignLesson> = {
  'mag-photojournal': {
    principle: 'Get out of the picture’s way: full-bleed images, one small wordmark and captions set in a quiet sans, so the photograph is read first and the words second.',
    history: 'The photo magazine took shape with Life (1936), Picture Post, Paris Match and later Magnum-era essays, where picture editors such as Wilson Hicks and designers such as Alexey Brodovitch sequenced photographs like a film. Documentary standards of the era, datelines, credit lines and honest captions, are still the backbone of photojournalism ethics, and independent quarterlies keep the dark ground and large format that made the pictures feel like prints.',
    tryThis: 'Replace the opener photograph with your own and rewrite its caption as a dateline plus one factual sentence. Does the picture look more or less true with the caption set in?',
    interestTag: 'Photojournalism',
    related: ['Photo essays', 'Caption writing', 'Magazine design'],
  },
  'mag-kids-family': {
    principle: 'Design for a reader who is shorter than the table: oversized type, bright separate colours, rounded containers, and every page asking the child to do something.',
    history: 'Children’s magazines such as St. Nicholas (1873), Highlights for Children (1946) and the Ladybird and Puffin Club publications paired short stories with puzzles, crafts and invitations to write in. Their layouts borrowed from picture books, big type and generous leading, and from the activity book: word searches, mazes and spot-the-difference pairs became standard devices for keeping a child inside the page.',
    tryThis: 'Replace the word-search words with the names of your own family or class, then check that every word is findable. Then make the puzzle two letters bigger for a younger reader.',
    interestTag: 'Kids’ publishing',
    related: ['Picture books', 'Activity design', 'Magazine design'],
  },
  'mag-community-digest': {
    principle: 'A community digest earns trust by being useful first: dates, names and phone numbers sit in friendly, rounded containers so a neighbour can find what they need in one glance.',
    history: 'The parish magazine, the church bulletin and the neighbourhood newsletter are among the oldest periodicals in the English-speaking world, produced on mimeograph and Gestetner machines by volunteers and delivered door to door. Community press movements in the 1970s, and today’s hyperlocal digests, kept the format: a calendar, a column of notices, classifieds, a directory and a friendly masthead, often hand-drawn.',
    tryThis: 'Fill the October calendar with your own events and give each a colour by type: meetings, food, children, faith. Does anyone need a legend to read it?',
    interestTag: 'Community newsletters',
    related: ['Calendars', 'Classifieds', 'Local publishing'],
  },
  'mag-literary-journal': {
    principle: 'With no images, the page is the picture: one measure, honest leading, a single accent rule and white space that is counted in lines, not pixels.',
    history: 'The little magazine, the literary journal printed in small editions for a community of writers, runs from The Dial and Poetry (founded in Chicago in 1912) through the mimeographed and letterpress journals of the 1960s to today’s small presses. These magazines favour small trims, plain covers, text stock and a classical book typography; the cover often does nothing more than state the title and list the contents, trusting the contents to do the rest.',
    tryThis: 'Paste a poem of your own into the poem page and adjust the indent until the longest line just fits. Then try breaking the same poem at different points and see how the white space changes its meaning.',
    interestTag: 'Literary magazines',
    related: ['Poetry layout', 'Book typography', 'Little magazines'],
  },
};
