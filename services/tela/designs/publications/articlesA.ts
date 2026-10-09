// articlesA — ARTICLE templates 1–4: Longform Feature, Breaking News, Investigative Dossier, Op-Ed.
//
// Every template here is its own system (grid, type pairing, rule weights, palette logic, and its own
// treatment of dateline / byline / standfirst / caption / credit / pull quote / footnote). Body copy is
// poured with `typeset` (pubKit) so columns fill to the baseline and never overflow. Text objects carry
// templateRole so Aria and the "bind to story" tool can find headline, deck, byline, dateline, body,
// pullquote, caption, credit, sidebar and hero.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import { rect, circle, hr, vr, path, text, below, imageSlot, mix, alpha } from '../../templateKit';
import * as orn from '../../ornaments';
import { typeset, pour, cols, figure, pullQuote, table, pill, button, barcode, meter, checkbox, runningFoot, label, verso } from './pubKit';

const obj = (...parts: Array<TelaVectorObject | TelaVectorObject[]>): TelaVectorObject[] => parts.flat();

// ═════════════════════════════════════════════════════════════════════════════
// 1 · art-longform — The Long Read (Letter, magazine feature in the New York Times Magazine mould)
// ═════════════════════════════════════════════════════════════════════════════
const LF = {
  head: 'The Last Light on Cape Harrow',
  deck: 'For two hundred years someone has climbed these stairs at dusk. This autumn, a woman named Ines Varga will climb them one final time, and the coast will have to learn to see without her.',
  paras: [
    'The stairs have 143 steps, and Ines Varga has counted them every evening for nineteen years. She does not need to. Her knees keep the number the way a pianist’s hands keep a scale, and on cold nights in November they remind her before she has reached the lamp room. “It is a good staircase,” she says, stopping on the ninety-first step to let the wind finish with the shutters. “It has never once lied to me.”',
    'Cape Harrow Light was first lit in 1824, when the sea off this headland was a graveyard that insurers refused to price. The tower is rubble-built, whitewashed every third spring, and narrow enough that two people must negotiate who goes first. At the top, behind a lens the size of a small car, the entire coast turns slowly around a single flame, then a single bulb, and since March of this year a sealed unit that needs nothing but electricity and a technician with a laptop every ninth month.',
    'The Coast Authority calls this “transition to unattended operation,” a phrase that appears in eleven documents Ines has been asked to sign. It is the fourth lighthouse in the region to go dark in the human sense, though never in the literal one. The beam will keep sweeping. What leaves is the logbook, the polish rag, the person who notices when a fishing boat has not come home by the usual hour.',
    'I first met her in August, on the gallery rail, eating a sandwich with the concentration of someone defusing it. She had been awake since two. A trawler captain had radioed about a drifting container; she had logged it, phoned the harbour master, and then, because nobody had told her not to, climbed up to watch it pass. “Automation is very good at the beam,” she said. “It is not good at being curious.”',
    'The harbour at Cape Harrow holds eleven working boats now, down from sixty in the year she was born. Their owners keep a habit that predates the radio: when they pass the point at dawn they flash their deck lights twice, and when Ines is awake she answers with the lamp. It is not in any regulation. It is not in her contract. “It is only manners,” she says, “and manners are what keep a place from becoming a map.”',
    'Technicians from the Authority visited in June to commission the new unit. They were polite, quick and slightly embarrassed, the way people are when they have come to retire something that still works. The lead engineer, a man named Gideon Roche who grew up two bays south, asked if he might see the logbook. He read the entries from 1998 standing up, and when he finished he asked where the pen was kept.',
    'There is a story the town tells about the winter of 1998, when the old keeper, Aldous Penry, held the lamp turning by hand through a four-day power failure, cranking the clockwork every twenty minutes and refusing to be relieved. The story is mostly true. What the town leaves out is that Penry taught Ines the crank when she was twelve and visiting on a school trip, and that she has never forgotten how heavy the silence was between turns.',
    'What the unit gives is reliability: it does not oversleep, fall ill or fall in love and move inland, which is what happened to Ines’s predecessor in 2003. What it cannot give is memory. For nineteen years the logbook recorded not only weather and lamp hours but the small, unclassifiable events of the sea: a seal with a net around its neck, a yacht flying its ensign upside down, a swimmer at six in the morning in January. None of it was required. All of it was read, eventually, by someone.',
    'Lighthouses were never really about light. They were about the promise that someone, somewhere, was paying attention. For most of the nineteenth century that promise was enforced by law and by fear: a keeper who let the lamp die could be dismissed, or worse. Today it is enforced by a monitoring contract, a sensor array and an uptime figure of 99.97 percent, which the Authority is proud of and which Ines describes, without malice, as “the number of times nothing went wrong.”',
    'On her last Friday the town held a supper in the oil house. There were speeches, one of them in verse. A boy of nine asked whether the lamp would be lonely. She considered it with the seriousness it deserved. “No,” she said at last. “But you might be, a little, when you look up and no one is looking back.”',
    'The Authority has promised that the tower will stay open to visitors in summer and that the keeper’s cottage will be let as a holiday home. The town council has asked, so far without an answer, whether one room might be kept for a person. Ines has not asked for anything. She has, however, begun teaching the crank to the boy who wanted to know about loneliness, on Saturdays, when the weather is fine and the stairs are dry.',
    'In the morning she cleaned the lens one last time, though there was nobody to impress and the unit above it would never notice a fingerprint. She wrote the final entry in the logbook in the same blue ink as the first. Then she went down the stairs, all 143 of them, and counted.',
  ],
  pull: '“Automation is very good at the beam. It is not good at being curious.”',
  pullBy: 'Ines Varga, keeper, 2005–2024',
};

const longform: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, pageType } = ctx;
  const M = 64, R = W - M, soft = mix(ink, .5), hair = alpha(ink, .28), tint = mix(paper, -.045);
  const G = rect(0, 0, W, H, pageType === 'PULL QUOTE' ? ink : paper, { role: 'GROUND', label: 'Page ground' });
  const foot = (c = soft) => runningFoot(ctx, { left: M, right: R, y: H - 40, font: 'inter', size: 8.5, color: c, head: 'The Long Read  ·  Cape Harrow', rule: pageType === 'PULL QUOTE' ? alpha('#fff', .25) : hair });
  const body = { size: 13, font: 'crimson' as const, color: ink, leading: 1.5, after: 7 };
  const topHead = (): TelaVectorObject[] => [label(M, 30, 300, 'The Long Read', { size: 9, font: 'inter', color: ink, weight: 800, tracking: .24 }), label(R - 300, 30, 300, 'Feature  ·  Coasts', { size: 9, font: 'inter', color: soft, align: 'right', tracking: .2 }), hr(M, 50, R - M, ink, .75, { label: 'Head rule' })];
  // One story, poured through three pages: body page (2 cols + quote band), sidebar page (1 col around a figure), end page.
  const textW = 492, mw = 436;
  const pages = pour([{ t: LF.paras[0], drop: { font: 'gloock', lines: 3, color: accent } }, ...LF.paras.slice(1)], [
    [...cols(M, 96, textW, 404, 2, 20), ...cols(M, 676, textW, 316, 2, 20)],
    [{ x: M, y: 96, w: mw, h: 346 }, { x: M, y: 792, w: mw, h: 184 }],
    [{ x: M, y: 96, w: mw, h: 150 }],
  ], body);

  switch (pageType) {
    case 'LONG-FORM OPENER': {
      const photo = figure(0, 0, W, 540, { tone: 'dark', shade: mix(ink, .26), hint: 'Lead photograph · full bleed · 816 × 540', hero: true, label: 'Hero photograph' });
      const cap = text(R - 380, 552, 380, 'The lamp room at dusk, seen from the gallery rail after the last visitors had gone.', { size: 11.5, font: 'instrumentSerif', italic: true, color: soft, align: 'right', leading: 1.3, label: 'Hero caption', role: 'CAPTION' });
      const cred = label(R - 380, below(cap, 4), 380, 'Photograph by Tobias Lindqvist', { size: 7.5, font: 'inter', color: soft, align: 'right', tracking: .14, role: 'CREDIT', label: 'Hero credit' });
      const kicker = label(M, 590, 360, 'Feature  ·  Coasts', { size: 10, font: 'inter', color: accent, weight: 800, tracking: .24, role: 'KICKER', label: 'Kicker' });
      const hed = text(M, 614, 700, 'The Last Light\non Cape Harrow', { size: 64, font: 'gloock', color: ink, leading: .98, tracking: -.012, label: 'Headline', role: 'HEADLINE' });
      const dy = below(hed, 24);
      const deck = text(M, dy, 468, LF.deck, { size: 20.5, font: 'instrumentSerif', italic: true, color: mix(ink, .18), leading: 1.3, label: 'Standfirst', role: 'DECK' });
      const bx = 580, bw = R - bx;
      const by = obj(hr(bx, dy + 4, bw, ink, 2, { label: 'Byline rule' }),
        label(bx, dy + 16, bw, 'Words', { size: 7.5, font: 'inter', color: soft, tracking: .2 }),
        text(bx, dy + 29, bw, 'Maren Oyelaran', { size: 14, font: 'gloock', color: ink, label: 'Byline', role: 'BYLINE', wrap: false }),
        label(bx, dy + 58, bw, 'Photographs', { size: 7.5, font: 'inter', color: soft, tracking: .2 }),
        text(bx, dy + 71, bw, 'Tobias Lindqvist', { size: 14, font: 'gloock', color: ink, label: 'Photographer byline', role: 'BYLINE', wrap: false }),
        hr(bx, dy + 102, bw, hair, .6),
        text(bx, dy + 112, bw, 'CAPE HARROW  ·  OCT 8, 2026', { size: 8.5, font: 'inter', weight: 700, color: accent, tracking: .14, wrap: false, label: 'Dateline', role: 'DATELINE' }),
        label(bx, dy + 128, bw, '24 minute read', { size: 8.5, font: 'inter', color: soft, tracking: .14 }));
      const slugY = 944;
      const slug = obj(hr(M, slugY, R - M, ink, .75, { label: 'Slug rule' }), ...[['Reported over', '11 weeks on the coast'], ['Photographs', '14 plates, medium format'], ['Listen', 'Audio edition, 31 min']].map(([a, b], i) => [label(M + i * 232, slugY + 12, 220, a, { size: 7.5, font: 'inter', color: accent, weight: 800, tracking: .22 }), text(M + i * 232, slugY + 26, 220, b, { size: 13, font: 'instrumentSerif', italic: true, color: ink, wrap: false, label: 'Slug detail', role: 'LABEL' })]));
      return obj(G, photo.objs, label(M, 34, 300, 'The Long Read', { size: 9, font: 'inter', color: '#fff', weight: 800, tracking: .26, label: 'Masthead on image' }), label(R - 220, 34, 220, 'No. 112  ·  Autumn', { size: 8.5, font: 'inter', color: alpha('#fff', .85), align: 'right', tracking: .22 }), cap, cred, kicker, hed, deck, by, slug, foot());
    }
    case 'BODY PAGE': {
      const q = pullQuote(M, 524, textW, LF.pull, { size: 25, font: 'gloock', color: accent, rule: 'both', ruleColor: ink, ruleW: 1.5, attrib: LF.pullBy, attribColor: soft, pad: 14, leading: 1.18 });
      const mx = 592, mwid = R - mx;
      const fig = figure(mx, 96, mwid, 214, { tone: 'dark', shade: mix(ink, .22), hint: 'Portrait · 3:4', caption: 'Ines Varga on the gallery rail at 5:40 a.m., the hour she says the coast is most honest.', credit: 'Tobias Lindqvist', capFont: 'instrumentSerif', capSize: 11, capItalic: true, capColor: soft, creditColor: soft, label: 'Margin portrait' });
      const lamp = table(mx, fig.bottom + 26, [{ w: 72, color: soft, font: 'inter', size: 8 }, { w: mwid - 72, font: 'gloock', size: 11 }], [['First lit', '1824'], ['Tower', '143 steps'], ['Focal height', '62 metres'], ['Range', '22 nautical miles'], ['Since March', 'Unattended']], { size: 10, font: 'inter', color: ink, rule: hair, pad: 5, label: 'Lamp facts', role: 'SIDEBAR', head: ['The lamp', ''], headSize: 8, headColor: accent, headRule: ink });
      return obj(G, topHead(), pages[0].objs, q.objs, fig.objs, lamp.objs, foot());
    }
    case 'PULL QUOTE': {
      const beam = path(0, 150, W, 760, 'M0 52 L100 0 L100 100 Z', paper, { opacity: .07, label: 'Lamp beam', gradient: { kind: 'LINEAR', angle: 0, stops: [{ offset: 0, color: '#FFFFFF', opacity: .5 }, { offset: 1, color: '#FFFFFF', opacity: 0 }] } });
      const rings = orn.rings(0, 540, [40, 90, 150, 220], paper, 1, { opacity: .18, label: 'Lens rings' });
      const mark = text(M - 6, 190, 200, '“', { size: 260, font: 'gloock', color: accent, wrap: false, leading: 1, label: 'Quotation mark', role: 'ORNAMENT' });
      const qt = text(M, 400, 640, LF.pull.replace(/[“”]/g, ''), { size: 50, font: 'gloock', color: paper, leading: 1.1, tracking: -.01, label: 'Pull quote', role: 'PULLQUOTE' });
      const by = obj(rect(M, below(qt, 34), 48, 4, accent, { label: 'Attribution bar', role: 'RULE' }), label(M, below(qt, 52), 600, LF.pullBy, { size: 10, font: 'inter', color: alpha('#fff', .8), weight: 700, tracking: .22, role: 'CREDIT', label: 'Attribution' }));
      const ctxLine = text(M, 880, 420, 'From the logbook of Cape Harrow Light, entry for August 14: “Container sighted 4 nm SW, drifting east. Logged, reported, watched until out of sight.”', { size: 12.5, font: 'crimson', italic: true, color: alpha('#fff', .7), leading: 1.45, label: 'Marginal note', role: 'SIDEBAR' });
      return obj(G, beam, rings, mark, qt, by, ctxLine, hr(M, 862, 420, alpha('#fff', .3), .75), foot(alpha('#fff', .7)));
    }
    case 'SIDEBAR': {
      const fig = figure(M, 464, mw, 242, { tone: 'light', shade: mix(paper, -.1), hint: 'Archive photograph · 16:9', caption: 'The oil house on the night of the farewell supper. Folding tables came from the church hall; the chowder, by common agreement, did not.', credit: 'Tobias Lindqvist', capFont: 'instrumentSerif', capSize: 11.5, capItalic: true, capColor: soft, label: 'Inline figure' });
      const sx = 540, sw = R - sx;
      const stats = [['1824', 'the year the lamp was first lit'], ['143', 'steps from door to lamp room'], ['99.97%', 'uptime of the unattended unit'], ['4', 'lights automated on this coast since 2019']];
      let sy = 118; const st: TelaVectorObject[] = [label(sx + 18, sy, sw - 36, 'By the numbers', { size: 8.5, font: 'inter', color: accent, weight: 800, tracking: .24, role: 'SIDEBAR' }), hr(sx + 18, sy + 18, sw - 36, ink, 1.5)];
      sy += 34;
      for (const [n, l] of stats) { const big = text(sx + 18, sy, sw - 36, n, { size: 38, font: 'gloock', color: ink, wrap: false, leading: 1, label: 'Stat figure', role: 'SIDEBAR' }); const cap = text(sx + 18, below(big, 4), sw - 36, l, { size: 11, font: 'inter', color: soft, leading: 1.35, label: 'Stat caption', role: 'SIDEBAR' }); st.push(big, cap, hr(sx + 18, below(cap, 12), sw - 36, hair, .6)); sy = below(cap, 24); }
      sy += 4; st.push(label(sx + 18, sy, sw - 36, 'Timeline', { size: 8.5, font: 'inter', color: accent, weight: 800, tracking: .24, role: 'SIDEBAR' }));
      const tl = [['1824', 'Tower built, first lit'], ['1892', 'Fresnel lens installed'], ['1971', 'Electrified'], ['2019', 'First nearby light automated'], ['2024', 'Harrow goes unattended']]; sy += 24;
      st.push(vr(sx + 24, sy + 4, tl.length * 38 - 20, ink, 1, { label: 'Timeline spine' }));
      tl.forEach(([y, t], i) => { st.push(circle(sx + 24, sy + 7 + i * 38, 4, i === tl.length - 1 ? accent : paper, { stroke: ink, strokeWidth: 1.2, label: 'Timeline dot' }), text(sx + 40, sy + i * 38, 46, y, { size: 12, font: 'gloock', color: ink, wrap: false, role: 'SIDEBAR', label: 'Timeline year' }), text(sx + 40 + 44, sy + 2 + i * 38, sw - 36 - 54, t, { size: 10.5, font: 'inter', color: soft, leading: 1.3, role: 'SIDEBAR', label: 'Timeline entry' })); });
      const panel = rect(sx, 96, sw, sy + tl.length * 38 + 10 - 96, tint, { label: 'Sidebar panel', role: 'SIDEBAR' });
      return obj(G, topHead(), pages[1].objs, fig.objs, panel, st, foot());
    }
    default: { // END PAGE
      const A = pages[2];
      const endMark = rect(A.endX + 6, A.endY + 4, 8, 8, accent, { label: 'End mark', role: 'ORNAMENT' });
      const aboutY = 290;
      const av = imageSlot(M, aboutY, 84, 84, { tone: 'light', shade: mix(paper, -.1), rx: 42, caption: 'Author', label: 'Author portrait' });
      const about = obj(hr(M, aboutY - 18, 372, ink, 1.5, { label: 'Section rule' }), label(M, aboutY - 8, 200, 'About the writer', { size: 8.5, font: 'inter', color: accent, weight: 800, tracking: .24 }), av,
        text(M + 104, aboutY + 4, 268, 'Maren Oyelaran is a staff writer who covers coasts, ports and the people who work between them. She reported this story over eleven weeks and is at work on a book about working lights of the North Atlantic.', { size: 12.5, font: 'crimson', color: ink, leading: 1.45, label: 'Author note', role: 'SIDEBAR' }));
      const cr = table(M, aboutY + 130, [{ w: 120, color: soft, font: 'inter', size: 8, weight: 700, tracking: .14 }, { w: 252, font: 'gloock', size: 12 }], [['Reporting', 'Maren Oyelaran'], ['Photography', 'Tobias Lindqvist'], ['Editing', 'Priya Natarajan'], ['Fact-checking', 'Hallam Ede'], ['Copy desk', 'Rosa Delgado'], ['Design', 'The Long Read studio']], { size: 11, font: 'inter', color: ink, rule: hair, pad: 6, head: ['Credits', ''], headColor: accent, headSize: 8, headRule: ink, label: 'Credits' });
      const rx = 480, rw = R - rx;
      const rel: TelaVectorObject[] = [hr(rx, aboutY - 18, rw, ink, 1.5), label(rx, aboutY - 8, rw, 'Keep reading', { size: 8.5, font: 'inter', color: accent, weight: 800, tracking: .24 })];
      const items = [['Essay', 'What a fog signal remembers'], ['Photographs', 'Nine lights, one night'], ['Interview', 'The harbour master on the radio and the rule book']];
      let ry = aboutY + 26; items.forEach(([k, t]) => { const kk = label(rx, ry, rw, k, { size: 7.5, font: 'inter', color: soft, tracking: .22 }); const tt = text(rx, ry + 18, rw, t, { size: 18, font: 'gloock', color: ink, leading: 1.15, label: 'Related headline', role: 'HEADLINE' }); const ph = imageSlot(rx, below(tt, 10), rw, 70, { tone: 'light', shade: mix(paper, -.09), silent: true, label: 'Related image' }); rel.push(kk, tt, ...ph, hr(rx, below(ph[0], 14), rw, hair, .6)); ry = below(ph[0], 30); });
      const colo = text(M, 800, 372, 'This story appeared in The Long Read, No. 112. Set in Gloock, Crimson Pro and Inter. Photographs were made on assignment with the co-operation of the Coast Authority; the keeper’s quotations were recorded and checked with her before publication.', { size: 9.5, font: 'inter', color: soft, leading: 1.5, label: 'Colophon', role: 'FOOTNOTE' });
      const fin = obj(rect(0, 986, W, 70, ink, { label: 'Closing band' }), text(M, 1004, 440, 'The Long Read', { size: 26, font: 'gloock', color: paper, wrap: false, label: 'Closing masthead', role: 'LOGO' }), label(R - 260, 1014, 260, 'Subscribe  ·  thelongread.example', { size: 8.5, font: 'inter', color: alpha('#fff', .8), align: 'right', tracking: .18 }));
      return obj(G, topHead(), A.objs, endMark, about, cr.objs, rel, colo, fin);
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 2 · art-breaking — Wire Desk (web 1080 × 1500; compact wire-service page)
// ═════════════════════════════════════════════════════════════════════════════
const BK = {
  head: 'Floodwater closes Riverton bridges as river crest nears record',
  deck: 'Mayor orders evacuation of low-lying districts; rail and road links cut as 3,200 residents move to shelters.',
  lead: 'RIVERTON, Oct 8 (Wire Desk) – The Calder River rose past its 1983 record on Wednesday morning, forcing the closure of all four city bridges and prompting an evacuation order for eleven low-lying districts, officials said.',
  paras: [
    'The river gauge at Hollis Quay read 7.42 metres at 09:00 local time, 12 centimetres above the previous high, and was still rising by roughly 3 centimetres an hour, the regional water authority said. The authority expects the crest to arrive between 15:00 and 18:00.',
    'Mayor Dalia Okonkwo told a briefing at City Hall that about 3,200 people had so far registered at nine emergency shelters, and that police and volunteers were going door to door in the Tanner Street and Millrace districts. “If you are asked to leave, leave,” she said. “Property can be replaced.”',
    'Rail operator NorthLine suspended all services across the Calder viaduct from 06:30 and said it did not expect to resume before Friday. Two of the three main road routes into the city were closed by flooding; a third, the A41 from the north, remained open to emergency vehicles only.',
    'Hospital managers said Riverton General was operating on backup power after a substation was switched off as a precaution, and that elective surgery had been postponed. No injuries had been linked to the flooding by midday, the health service said, although two people were treated for hypothermia after being rescued from a stranded car.',
    'Forecasters said the heaviest rain had now moved east but warned that saturated ground and a high spring tide at the coast would slow the river’s fall. A further yellow weather warning for rain is in place from Thursday night.',
    'Insurers said it was too early to estimate losses. The last major flood in 1983 caused damage worth the equivalent of about 410 million dollars in today’s money, according to the national flood agency.',
    'The disruption reached well beyond the water’s edge. Supermarkets in the north of the city reported empty shelves after delivery lorries were turned back at the flood barriers, and the university said it would stay closed until at least Monday. Taxi firms said they had stopped taking bookings south of the river.',
    'The government said ministers would chair an emergency committee this evening and that army engineers were being sent to reinforce the embankment at Hollis Quay, where a section of the sandbag wall was reported to be leaking. “We are taking this extremely seriously,” a spokesperson said.',
    'Residents were urged to avoid driving through floodwater and to check on elderly neighbours. A telephone helpline for evacuees has been opened on 0800 555 0142.',
  ],
  keys: ['Calder River at 7.42 m, above 1983 record; crest expected 15:00–18:00', 'All four city bridges closed; rail across the viaduct suspended until Friday', '3,200 residents in nine shelters; eleven districts under evacuation order'],
};

const breaking: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const M = 48, MAIN = 668, RX = M + MAIN + 40, RW = W - M - RX, soft = mix(ink, .45), hair = alpha(ink, .18), tint = mix(paper, -.04);
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Page ground' });
  const body = { size: 16.5, font: 'inter' as const, color: mix(ink, .1), leading: 1.6, after: 12 };
  const mast = (): TelaVectorObject[] => {
    const live = pill(M + 168, 21, 'Live', { fill: accent, color: '#fff', size: 9, h: 20, font: 'archivo', tracking: .18 });
    let nx = M; const nav: TelaVectorObject[] = [];
    ['World', 'Weather', 'Business', 'Politics', 'Technology', 'Sport'].forEach((s, i) => { nav.push(label(nx, 64, 120, s, { size: 11, font: 'archivo', color: i === 1 ? accent : ink, weight: 700, tracking: .12 })); nx += s.length * 9.2 + 30; });
    return obj(rect(0, 0, W, 8, accent, { label: 'Alert bar', role: 'ORNAMENT' }),
      text(M, 20, 190, 'WIRE DESK', { size: 24, font: 'archivo', weight: 900, color: ink, tracking: .02, wrap: false, label: 'Masthead', role: 'LOGO' }), live.objs,
      text(W - M - 420, 26, 420, 'Updated 14:32 UTC  ·  Wednesday 8 October 2026', { size: 11, font: 'ibmPlexMono', color: soft, align: 'right', wrap: false, label: 'Timestamp', role: 'DATELINE' }),
      nav, hr(0, 90, W, ink, 1.5, { label: 'Nav rule' }));
  };
  /** Right rail: a titled list of timed headlines; returns objects and the y below. */
  const rail = (y: number, items: Array<[string, string]>, title: string, timed = true): { objs: TelaVectorObject[]; bottom: number } => {
    const out: TelaVectorObject[] = [label(RX, y, RW, title, { size: 10, font: 'archivo', color: accent, weight: 800, tracking: .2, role: 'SIDEBAR' }), hr(RX, y + 20, RW, ink, 2)];
    let yy = y + 42;
    items.forEach(([t, s], i) => {
      const hh = text(RX + 18, yy + 14, RW - 18, s, { size: 14, font: 'archivo', weight: 700, color: ink, leading: 1.28, role: 'SIDEBAR', label: 'Update headline' });
      out.push(circle(RX + 5, yy + 6, 4, i === 0 && timed ? accent : ink, { label: 'Update marker' }), text(RX + 18, yy - 4, RW - 18, t, { size: 10, font: 'ibmPlexMono', color: soft, wrap: false, role: 'DATELINE', label: 'Update time' }), hh);
      if (i < items.length - 1) out.push(vr(RX + 5, yy + 12, below(hh, 16) - yy - 12, hair, 1, { label: 'Update line' }));
      yy = below(hh, 24);
    });
    return { objs: out, bottom: yy };
  };
  const f = (y: number) => obj(hr(M, y, W - 2 * M, hair, .75), text(M, y + 12, 500, 'Wire Desk  ·  Riverton floods  ·  Page ' + (pageIndex + 1), { size: 10, font: 'ibmPlexMono', color: soft, wrap: false, label: 'Page footer', role: 'FOLIO' }), text(W - M - 300, y + 12, 300, 'Corrections: standards@wiredesk.example', { size: 10, font: 'ibmPlexMono', color: soft, align: 'right', wrap: false, label: 'Corrections line', role: 'FOLIO' }));
  const divider = vr(RX - 20, 112, H - 190, hair, 1, { label: 'Rail divider' });
  const latest: Array<[string, string]> = [['14:32', 'Crest now forecast for 16:30; Hollis Quay gauge at 7.42 m'], ['13:50', 'A41 north route restricted to emergency vehicles'], ['12:15', 'Riverton General on backup power, surgery postponed'], ['10:40', 'Evacuation extended to Millrace and Tanner Street'], ['09:05', 'All four bridges closed to traffic and pedestrians']];
  const pages = pour([{ t: BK.lead, size: 18, weight: 600, color: ink, leading: 1.5 }, ...BK.paras.map(t => ({ t }))], [
    [{ x: M, y: 1056, w: MAIN, h: 340 }],
    [{ x: M, y: 120, w: MAIN, h: 330 }, { x: M, y: 1086, w: MAIN, h: 310 }],
    [{ x: M, y: 120, w: MAIN, h: 220 }],
  ], body);

  switch (pageType) {
    case 'ARTICLE HEADER': {
      const chip = pill(M, 112, 'Breaking  ·  Floods', { fill: accent, color: '#fff', size: 10, h: 24, font: 'archivo', tracking: .16 });
      const hed = text(M, 150, MAIN + 40, BK.head, { size: 50, font: 'archivo', weight: 800, color: ink, leading: 1.04, tracking: -.012, label: 'Headline', role: 'HEADLINE' });
      const deck = text(M, below(hed, 18), MAIN, BK.deck, { size: 20, font: 'inter', color: mix(ink, .3), leading: 1.42, label: 'Deck', role: 'DECK' });
      const by = below(deck, 20);
      const bylineRow = obj(hr(M, by, MAIN, hair, .75), text(M, by + 12, 400, 'By Priya Natarajan and Joel Adeyemi', { size: 12.5, font: 'archivo', weight: 700, color: ink, wrap: false, label: 'Byline', role: 'BYLINE' }), text(M + MAIN - 280, by + 13, 280, 'Edited by Hallam Ede', { size: 11, font: 'ibmPlexMono', color: soft, align: 'right', wrap: false, label: 'Editor credit', role: 'CREDIT' }));
      const kp = by + 46;
      const kb = typeset(BK.keys.map(k => ({ t: k, marker: { t: '■', dx: -16, size: 8, color: accent, dy: 5 }, after: 8, size: 15, font: 'inter' as const, weight: 600, color: ink })), [{ x: M + 34, y: kp + 44, w: MAIN - 64, h: 150 }], { size: 15, font: 'inter', color: ink });
      const kbox = obj(rect(M, kp, MAIN, kb.ends[0] + 8 - kp, tint, { label: 'Key points panel', role: 'SIDEBAR' }), rect(M, kp, 6, kb.ends[0] + 8 - kp, secondary, { label: 'Key points bar', role: 'RULE' }), label(M + 34, kp + 16, 300, 'Key points', { size: 10, font: 'archivo', color: ink, weight: 800, tracking: .22, role: 'SIDEBAR' }), kb.objs);
      const ph = figure(M, kb.ends[0] + 30, MAIN, 330, { tone: 'dark', shade: mix(ink, .3), hint: 'Lead photo · 16:9', hero: true, label: 'Hero photograph', caption: 'Volunteers carry sandbags along Hollis Quay as the Calder River spills over the embankment on Wednesday.', credit: 'Wire Desk / Sana Qureshi', capFont: 'inter', capSize: 12, capColor: soft });
      const dl = text(M, 1032, MAIN, 'RIVERTON  ·  OCT 8  ·  WIRE DESK', { size: 11, font: 'ibmPlexMono', weight: 700, color: accent, tracking: .08, wrap: false, label: 'Dateline', role: 'DATELINE' });
      const r1 = rail(112, latest, 'Latest updates'); const r2 = rail(r1.bottom + 30, [['Explainer', 'How a river gauge works, and what 7.42 metres means'], ['Map', 'The eleven districts under evacuation order'], ['Archive', 'The 1983 flood: what changed after the water fell']], 'Related', false);
      return obj(G, mast(), chip.objs, hed, deck, bylineRow, kbox, ph.objs, dl, pages[0].objs, r1.objs, r2.objs, divider, f(H - 56));
    }
    case 'BODY PAGE': {
      const ph = figure(M, 470, MAIN, 300, { tone: 'dark', shade: mix(ink, .28), hint: 'Inline photo · 16:9', caption: 'Residents of Millrace queue for a shuttle to Riverton Arena, one of nine emergency shelters.', credit: 'Wire Desk / Joel Adeyemi', capFont: 'inter', capSize: 12, capColor: soft });
      const q = pullQuote(M, ph.bottom + 34, MAIN, '“If you are asked to leave, leave. Property can be replaced.”', { size: 30, font: 'archivo', weight: 800, color: ink, rule: 'left', ruleColor: accent, ruleW: 6, attrib: 'Dalia Okonkwo, Mayor of Riverton', attribColor: soft, pad: 20, leading: 1.14 });
      const fact = obj(rect(RX, 120, RW, 430, tint, { label: 'Factbox', role: 'SIDEBAR' }), rect(RX, 120, RW, 5, ink, { label: 'Factbox rule', role: 'RULE' }), label(RX + 18, 140, RW - 36, 'Factbox  ·  Calder River', { size: 10, font: 'archivo', color: ink, weight: 800, tracking: .18, role: 'SIDEBAR' }),
        table(RX + 8, 168, [{ w: 118, font: 'inter', size: 11, color: soft }, { w: RW - 134, font: 'archivo', size: 13, weight: 700 }], [['Gauge, 09:00', '7.42 m'], ['1983 record', '7.30 m'], ['Rise per hour', '+3 cm'], ['Crest due', '15:00–18:00'], ['Shelters open', '9'], ['People sheltered', '3,200'], ['Bridges closed', '4 of 4']], { size: 12, font: 'inter', color: ink, rule: hair, pad: 8, label: 'Factbox', role: 'SIDEBAR' }).objs);
      const r = rail(590, latest.slice(0, 4), 'Latest updates');
      return obj(G, mast(), pages[1].objs, ph.objs, q.objs, fact, r.objs, divider, f(H - 56));
    }
    case 'SIDEBAR': {
      const cardW = (MAIN - 24) / 2, cy = 360;
      const know = ['Four city bridges are closed and will stay closed through the crest.', 'Eleven districts are under mandatory evacuation.', 'Rail services across the viaduct are suspended until at least Friday.', 'Hospital power is on backup; emergency care continues.'];
      const dont = ['How many homes have flooded so far.', 'Whether the Hollis Quay embankment will hold at crest.', 'When the A41 north route will fully reopen.', 'The total cost of damage.'];
      const mk = (x: number, y: number, title: string, items: string[], col: string, mark: string): TelaVectorObject[] => {
        const cardH = 430; const t = typeset(items.map(s => ({ t: s, marker: { t: mark, dx: -24, size: 15, color: col, font: 'archivo' as const, dy: -1 }, after: 14 })), [{ x: x + 44, y: y + 70, w: cardW - 68, h: cardH - 84 }], { size: 15.5, font: 'inter', color: ink, leading: 1.45 });
        return obj(rect(x, y, cardW, cardH, tint, { label: `${title} card`, role: 'SIDEBAR' }), rect(x, y, cardW, 6, col, { label: 'Card bar', role: 'RULE' }), text(x + 24, y + 28, cardW - 48, title, { size: 22, font: 'archivo', weight: 800, color: ink, wrap: false, label: 'Card title', role: 'SIDEBAR' }), t.objs);
      };
      const cards = obj(mk(M, cy, 'What we know', know, secondary, '✓'), mk(M + cardW + 24, cy, 'What we do not know', dont, accent, '?'));
      const ty = cy + 430 + 44;
      const tl: TelaVectorObject[] = [label(M, ty, 500, 'Water level at Hollis Quay (metres)', { size: 10, font: 'archivo', color: ink, weight: 800, tracking: .16, role: 'SIDEBAR' }), hr(M, ty + 20, MAIN, ink, 2)];
      const vals = [5.1, 5.4, 5.9, 6.3, 6.8, 7.1, 7.42]; const cw = (MAIN - 20) / vals.length; const base = ty + 340;
      vals.forEach((v, i) => { const h = (v - 4.5) * 108; tl.push(rect(M + 10 + i * cw + 8, base - h, cw - 16, h, i === vals.length - 1 ? accent : mix(ink, .55), { label: 'Gauge bar', role: 'ORNAMENT' }), text(M + 10 + i * cw, base + 8, cw, ['03:00', '05:00', '07:00', '08:00', '08:30', '08:45', '09:00'][i], { size: 10, font: 'ibmPlexMono', color: soft, align: 'center', wrap: false, role: 'CAPTION', label: 'Axis label' }), text(M + 10 + i * cw, base - h - 20, cw, v.toFixed(2), { size: 11, font: 'archivo', weight: 700, color: ink, align: 'center', wrap: false, role: 'CAPTION', label: 'Bar value' })); });
      const recY = base - (7.3 - 4.5) * 108;
      tl.push(hr(M, base, MAIN, ink, 1, { label: 'Axis' }), hr(M, recY, MAIN, accent, 1, { dash: [4, 4], label: '1983 record line' }), text(M, recY - 17, 200, '1983 record  7.30 m', { size: 10, font: 'ibmPlexMono', color: accent, wrap: false, role: 'CAPTION', label: 'Record label' }));
      const src = text(M, base + 34, MAIN, 'Source: regional water authority gauge, Hollis Quay. Readings before 08:00 are hourly averages.', { size: 11, font: 'ibmPlexMono', color: soft, leading: 1.5, label: 'Chart source', role: 'FOOTNOTE' });
      const sy2 = base + 84; const bigStats = [['7.42 m', 'gauge reading, 09:00'], ['+12 cm', 'above the 1983 record'], ['15:00', 'start of the forecast crest window']].map(([n, c], i) => { const x = M + i * (MAIN / 3); return [hr(x, sy2, MAIN / 3 - 24, ink, 2, { label: 'Stat rule' }), text(x, sy2 + 12, MAIN / 3 - 24, n, { size: 44, font: 'archivo', weight: 800, color: i === 1 ? accent : ink, wrap: false, label: 'Stat figure', role: 'SIDEBAR' }), text(x, sy2 + 66, MAIN / 3 - 24, c, { size: 13, font: 'inter', color: soft, leading: 1.4, label: 'Stat caption', role: 'SIDEBAR' })]; }).flat();
      const r1 = rail(112, latest, 'Latest updates');
      return obj(G, mast(), pages[2].objs, cards, tl, src, bigStats, r1.objs, divider, f(H - 56));
    }
    default: {
      const y0 = 130;
      const sec = (y: number, k: string, rows: Array<[string, string]>): TelaVectorObject[] => [label(M, y, 400, k, { size: 10, font: 'archivo', color: accent, weight: 800, tracking: .2 }), hr(M, y + 20, MAIN, ink, 2), ...rows.flatMap(([a, b], i) => [text(M, y + 34 + i * 30, 180, a, { size: 13, font: 'archivo', weight: 700, color: ink, wrap: false, role: 'CREDIT', label: 'Credit role' }), text(M + 190, y + 34 + i * 30, MAIN - 190, b, { size: 13, font: 'inter', color: mix(ink, .15), wrap: false, role: 'CREDIT', label: 'Credit name' })])];
      const cx = sec(y0, 'Reporting and editing', [['Reporting', 'Priya Natarajan, Joel Adeyemi'], ['Photography', 'Sana Qureshi'], ['Graphics', 'Marlon Fitch'], ['Editing', 'Hallam Ede'], ['Standards', 'Rosa Delgado']]);
      const corr = obj(rect(M, y0 + 220, MAIN, 130, tint, { label: 'Corrections box', role: 'SIDEBAR' }), rect(M, y0 + 220, 6, 130, secondary, { label: 'Corrections bar', role: 'RULE' }), label(M + 28, y0 + 240, 300, 'Corrections and clarifications', { size: 10, font: 'archivo', color: ink, weight: 800, tracking: .18, role: 'SIDEBAR' }), text(M + 28, y0 + 266, MAIN - 56, 'An earlier version of this story gave the 1983 gauge reading as 7.4 metres. The correct figure is 7.30 metres. It was corrected at 11:05 UTC.', { size: 14, font: 'inter', color: mix(ink, .15), leading: 1.5, role: 'SIDEBAR', label: 'Correction text' }));
      const st = obj(label(M, y0 + 390, 400, 'Our standards', { size: 10, font: 'archivo', color: accent, weight: 800, tracking: .2 }), hr(M, y0 + 410, MAIN, ink, 2), text(M, y0 + 428, MAIN, 'Wire Desk reports what it can confirm from two independent sources and labels everything else. Figures are attributed. Updates replace earlier versions; the history of material changes is kept below the story.', { size: 15, font: 'inter', color: mix(ink, .15), leading: 1.55, role: 'BODY', label: 'Standards statement' }));
      const cardY = y0 + 640, cw = (MAIN - 32) / 3;
      const more = obj(label(M, cardY - 36, 300, 'More from the desk', { size: 10, font: 'archivo', color: accent, weight: 800, tracking: .2 }), hr(M, cardY - 16, MAIN, ink, 2), ...[['Weather', 'Thursday warning: what a second band of rain could mean'], ['Cities', 'Shelter map and volunteer sign-up for Riverton'], ['Business', 'Insurers brace for a flood season that will not end']].map(([k, t], i) => { const x = M + i * (cw + 16); const im = figure(x, cardY, cw, 130, { tone: 'dark', shade: mix(ink, .3), hint: '3:2' }); const kk = label(x, im.bottom + 12, cw, k, { size: 9, font: 'ibmPlexMono', color: soft, transform: 'none', tracking: .06 }); const hh = text(x, im.bottom + 30, cw, t, { size: 15, font: 'archivo', weight: 700, color: ink, leading: 1.25, label: 'Related headline', role: 'HEADLINE' }); return [im.objs, kk, hh]; }).flat());
      const btn = button(M, cardY + 250, 280, 52, 'Sign up for bulletins', { fill: accent, color: '#fff', font: 'archivo', size: 15, rx: 4 });
      const r1 = rail(112, latest.slice(0, 3), 'Latest updates');
      return obj(G, mast(), cx, corr, st, more, btn, r1.objs, divider, f(H - 56));
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 3 · art-dossier — Case File (A4; investigative documents, redaction bars, source panels)
// ═════════════════════════════════════════════════════════════════════════════
const DS = {
  summary: 'A review of 214 pages of procurement records, 31 emails and three internal audit drafts shows that the Ardale Flood Barrier contract was awarded without the competitive tender the city’s own manual requires. The 48.3 million dollar award was signed eleven days before the evaluation panel first met.',
  paras: [
    'The tender notice was published on 4 March 2024 and closed on 29 March. Two firms collected the documents. Only one, Halden-Brook Marine, submitted a bid. Under section 4.2 of the procurement manual, a tender with a single bidder must be re-advertised for a further fourteen days unless the chief procurement officer certifies an emergency.',
    'No such certificate appears in the file. Instead, a one-page memorandum dated 9 April calls the project “time-critical” and recommends proceeding. It carries two signatures. One belongs to the deputy city manager. The other has been redacted by the city in response to our request, a decision it says is “in the interests of staff safety.”',
    'The contract’s terms are unusual. Payment is front-loaded: 40 percent on signature, against an industry norm of 10. A clause titled “mobilisation” allowed the company to invoice for equipment before it was on site. Two engineers who reviewed the document for us called it one of the more generous contracts they had seen for work of this kind.',
    'Halden-Brook’s registered address is a serviced office above a dry cleaner two hours from the river. Company filings show it was incorporated nineteen months before the tender, with a single director and no previous public work. The firm subcontracted the dredging and steelwork to two companies we were able to identify; the city’s file names neither.',
    'The evaluation panel’s scoring sheet, obtained from a source with access to the contract system, gives Halden-Brook 91 out of 100. The sheet is undated. Its metadata shows it was created on 21 April, eleven days after the contract was signed and two days before the panel’s first recorded meeting.',
    'Three current and former officials told us the panel “never really scored anything.” One called the process “a ratification.” Another said the panel chair received the pre-filled sheet by email and asked colleagues to initial it. We have seen the email. It is reproduced as Exhibit C.',
    'We asked the city who had nominated the project for emergency treatment. Its answer, after nineteen working days, was that “no individual” had done so. We then asked who drafted the 9 April memorandum. The city said it held “no record of authorship.” The document’s metadata names the deputy city manager’s assistant.',
    'The company’s managing director, Ruth Ayodele, said Halden-Brook had followed every instruction it was given and was “not involved in the city’s internal processes.” The city’s communications office said the project was delivered “in accordance with the law and all applicable policies” and declined to answer questions about the missing certificate.',
    'In September an internal audit draft flagged the award as a “high-risk irregularity.” A second draft, circulated in November, removed the finding and substituted a recommendation to “update documentation.” The audit manager who wrote the first draft left the city in December. She declined to comment.',
    'The mayor, Diane Kessler, said she was “not aware of any irregularity” and that the project had been overseen by “professionals.” Asked whether she would support an independent review, she said she would “consider any proposal brought to council.” Two of the nine councillors told us they would back one.',
    'The barrier is half built. Costs have risen by 6.1 million dollars. The next payment, 9.4 million, falls due on 15 December. Council members have been asked to approve it in a closed session.',
    'Questions we put to the city: Why was no emergency certificate issued? Who signed the 9 April memorandum? When did the evaluation panel first see the bids? We will publish the answers, or the absence of them, in the next installment.',
  ],
  pull: 'No one on the evaluation panel recalls scoring the second bidder.',
  notes: ['City of Ardale Procurement Manual, section 4.2 (2019 revision), single-bid rule.', 'Scoring sheet metadata: created 21 April 2024, 09:14, author field blank.', 'Memorandum of 9 April 2024, two signatories; second redacted under privacy exemption.'],
};

const dossier: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const sheetC = mix(paper, .55), soft = mix(ink, .4), hair = alpha(ink, .3), tabC = mix(paper, -.14);
  const SX = 26, SY = 46, SW = W - 52, SH = H - 86, M = 62, R = SX + SW - 36, CW = 7;
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Folder ground' });
  /** Typewriter segments: plain strings or { r: n } redaction bars measured in characters (courier advance = 7px at 12px). */
  const typed = (x: number, y: number, segs: Array<string | { r: number }>, o: { size?: number; color?: string; weight?: number; font?: 'courierPrime' | 'specialElite'; role?: any; label?: string } = {}): TelaVectorObject[] => {
    const size = o.size ?? 12, cw = Math.round(.6 * size); let cx = x; const out: TelaVectorObject[] = [];
    for (let s of segs) {
      if (typeof s === 'string') { s = s.replace(/^ +/, m => '\u00A0'.repeat(m.length)).replace(/ +$/, m => '\u00A0'.repeat(m.length)); out.push(text(cx, y, s.length * cw + 4, s, { size, font: o.font ?? 'courierPrime', weight: o.weight ?? 400, color: o.color ?? ink, wrap: false, label: o.label ?? 'Typed line', role: o.role ?? 'BODY' })); cx += s.length * cw; }
      else { out.push(rect(cx - 1, y + size * .14, s.r * cw + 2, size * .86, '#0b0b0b', { label: 'Redaction bar', role: 'ORNAMENT' })); cx += s.r * cw; }
    }
    return out;
  };
  const sheet = (): TelaVectorObject[] => obj(
    rect(0, 0, 210, 34, tabC, { rx: 0, label: 'Folder tab', role: 'ORNAMENT' }), path(210, 0, 34, 34, 'M0 0 L100 100 L0 100 Z', tabC, { label: 'Folder tab edge' }),
    label(18, 11, 190, 'Case 24-0117', { size: 10, font: 'ibmPlexMono', color: ink, weight: 600, tracking: .2 }),
    rect(SX, SY, SW, SH, sheetC, { label: 'Document sheet', role: 'ORNAMENT', shadow: { x: 0, y: 3, blur: 10, color: 'rgba(40,30,10,.28)' } }),
    ...[SY + 130, SY + SH / 2, SY + SH - 130].map(y => circle(SX + 16, y, 6, paper, { stroke: hair, strokeWidth: 1, label: 'Punch hole' })));
  const stamp = (x: number, y: number, t: string, rot: number, size = 26, col = accent): TelaVectorObject[] => { const w = t.length * size * .56 + 30; return [rect(x, y, w, size + 22, 'none', { stroke: col, strokeWidth: 3, rx: 3, rotation: rot, opacity: .82, label: 'Stamp frame', role: 'ORNAMENT' }), text(x, y + 10, w, t, { size, font: 'anton', color: col, align: 'center', tracking: .12, wrap: false, rotation: rot, opacity: .82, label: 'Stamp text', role: 'LABEL' })]; };
  const head = (n: number): TelaVectorObject[] => obj(label(M, SY + 22, 340, 'Investigations unit  ·  Case file 24-0117', { size: 8, font: 'ibmPlexMono', color: soft, tracking: .16 }), label(R - 240, SY + 22, 240, `Page ${n} of 4  ·  Copy 3 of 5`, { size: 8, font: 'ibmPlexMono', color: soft, align: 'right', tracking: .16 }), hr(M, SY + 40, R - M, hair, .75, { label: 'Head rule' }));
  const foot = (): TelaVectorObject[] => obj(hr(M, SY + SH - 44, R - M, hair, .75, { label: 'Foot rule' }), ...barcode(R - 110, SY + SH - 34, 110, 20, ink, ctx.seed), label(M, SY + SH - 30, 400, 'Handle as confidential  ·  do not copy  ·  ref 24-0117/' + String(pageIndex + 1).padStart(2, '0'), { size: 8, font: 'ibmPlexMono', color: soft, tracking: .12, role: 'FOLIO' }));
  const tabs = (active: number): TelaVectorObject[] => ['A', 'B', 'C', 'D'].flatMap((l, i) => [rect(SX + SW - 2, SY + 180 + i * 64, 20, 44, i === active ? accent : secondary, { rx: 3, label: 'Index tab', role: 'ORNAMENT' }), text(SX + SW - 2, SY + 194 + i * 64, 20, l, { size: 11, font: 'ibmPlexMono', weight: 700, color: '#fff', align: 'center', wrap: false, label: 'Tab letter', role: 'LABEL' })]);
  const tape = (x: number, y: number, rot: number) => rect(x, y, 56, 18, alpha('#E9DFA8', .78), { rotation: rot, label: 'Tape', role: 'ORNAMENT' });
  const body = { size: 12, font: 'courierPrime' as const, color: ink, leading: 1.5, after: 10 };
  const meter5 = (x: number, y: number, n: number): TelaVectorObject[] => Array.from({ length: 5 }, (_, i) => rect(x + i * 11, y, 8, 8, i < n ? ink : 'none', { stroke: ink, strokeWidth: 1, label: 'Reliability pip', role: 'ORNAMENT' }));
  const flow = pour(DS.paras.map(t => ({ t })), [
    [{ x: M, y: 650, w: 470, h: 330 }],
    [{ x: M, y: 112, w: 330, h: 640 }],
    [{ x: M, y: 112, w: 396, h: 540 }],
    [{ x: M, y: 112, w: 400, h: 110 }],
  ], body);

  switch (pageType) {
    case 'ARTICLE HEADER': {
      const hed = text(M, SY + 66, 560, 'THE CONTRACT\nTHAT WASN’T', { size: 76, font: 'bigShoulders', weight: 800, color: ink, leading: .92, label: 'Headline', role: 'HEADLINE' });
      const kick = label(M, SY + 52, 400, 'Investigation  /  Procurement', { size: 10, font: 'specialElite', color: accent, tracking: .2, transform: 'none', role: 'KICKER', label: 'Kicker' });
      const dy = below(hed, 18);
      const deck = typed(M, dy, ['A river barrier, a ', { r: 11 }, ' award and a bid', ' that nobody'], { size: 14, role: 'DECK', label: 'Deck' });
      const deck2 = typed(M, dy + 21, ['scored. Inside the file on Ardale’s ', { r: 8 }, '.'], { size: 14, role: 'DECK', label: 'Deck' });
      const kv = [['SUBJECT', ['Ardale Flood Barrier, contract AFB-2024-07']], ['FILED BY', ['N. Hadley, with ', { r: 9 }]], ['VALUE', ['USD 48.3m  (revised ', { r: 5 }, ')']], ['STATUS', ['Open  ·  second installment pending']]] as Array<[string, Array<string | { r: number }>]>;
      const ky = dy + 62;
      const kvObjs = kv.flatMap(([k, v], i) => [text(M, ky + i * 24, 90, k, { size: 10, font: 'ibmPlexMono', weight: 700, color: soft, tracking: .12, wrap: false, role: 'LABEL', label: 'Field name' }), ...typed(M + 96, ky + i * 24 - 1, v, { size: 12, label: 'Field value' }), hr(M, ky + i * 24 + 18, 424, hair, .5, { label: 'Field rule' })]);
      const ex = figure(R - 232, SY + 292, 220, 168, { tone: 'light', shade: mix(paper, -.02), frame: hair, hint: 'Scanned document · landscape', caption: 'EXHIBIT A — bid evaluation sheet, page 3 (names redacted by the city)', credit: 'Obtained by the Desk', capFont: 'courierPrime', capSize: 9, capColor: soft, label: 'Exhibit A' });
      const exTilt = ex.objs.map(o => ({ ...o }));
      exTilt.forEach(o => { if (o.kind === 'RECT' && o.templateRole === 'IMAGE_SLOT') o.rotation = -2; });
      const src = [label(M, 560, 300, 'Source key', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22, role: 'SIDEBAR' }), hr(M, 576, 470, ink, 1.25, { label: 'Source rule' }),
        ...[['S-1', 'Procurement officer, current', 4], ['S-2', 'Audit staff, former', 3], ['S-3', 'Contract system export', 5]].flatMap(([id, d, n], i) => [text(M, 586 + i * 20, 32, String(id), { size: 11, font: 'ibmPlexMono', weight: 700, color: ink, wrap: false, role: 'SIDEBAR', label: 'Source id' }), text(M + 40, 586 + i * 20, 300, String(d), { size: 11, font: 'courierPrime', color: ink, wrap: false, role: 'SIDEBAR', label: 'Source description' }), ...meter5(M + 360, 590 + i * 20, n as number)]), label(M + 330, 566, 140, 'Reliability', { size: 7, font: 'ibmPlexMono', color: soft, tracking: .14, role: 'SIDEBAR', label: 'Reliability label' })];
      const sum = text(M, ky + 98, 410, DS.summary, { size: 12, font: 'courierPrime', weight: 700, color: ink, leading: 1.5, label: 'Summary', role: 'DECK' });
      return obj(G, sheet(), head(1), kick, hed, deck, deck2, kvObjs, tape(R - 220, SY + 284, -8), tape(R - 36, SY + 440, 6), exTilt, stamp(R - 190, SY + 70, 'CONFIDENTIAL', -9), src, sum, flow[0].objs, foot(), tabs(0));
    }
    case 'BODY PAGE': {
      const exx = 440, exw = R - exx;
      const ex = figure(exx, 126, exw, 200, { tone: 'light', shade: mix(paper, -.03), frame: hair, hint: 'Scanned document · portrait crop', caption: 'EXHIBIT B — memorandum of 9 April 2024. The second signature has been blacked out by the city.', credit: 'City of Ardale, released under request', capFont: 'courierPrime', capSize: 9, capColor: soft, label: 'Exhibit B' });
      ex.objs.forEach(o => { if (o.kind === 'RECT' && o.templateRole === 'IMAGE_SLOT') o.rotation = 1.5; });
      const redact = [rect(exx + 18, 262, 120, 14, '#0b0b0b', { rotation: 1.5, label: 'Redaction bar', role: 'ORNAMENT' }), rect(exx + 18, 284, 84, 14, '#0b0b0b', { rotation: 1.5, label: 'Redaction bar', role: 'ORNAMENT' })];
      const q = obj(rect(exx, ex.bottom + 34, exw, 112, 'none', { stroke: accent, strokeWidth: 3, label: 'Key finding frame', role: 'ORNAMENT' }), rect(exx + 14, ex.bottom + 26, 120, 18, sheetC, { label: 'Frame label mask', role: 'ORNAMENT' }), label(exx + 18, ex.bottom + 29, 120, 'Key finding', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22 }),
        text(exx + 18, ex.bottom + 58, exw - 36, DS.pull.toUpperCase(), { size: 16, font: 'specialElite', color: ink, leading: 1.3, label: 'Pull quote', role: 'PULLQUOTE' }));
      const fnY = SY + SH - 190;
      const fns = obj(hr(M, fnY, 200, ink, .75, { label: 'Footnote rule' }), ...DS.notes.map((n, i) => text(M, fnY + 10 + i * 36, R - M, `${i + 1}  ${n}`, { size: 9, font: 'courierPrime', color: soft, leading: 1.35, label: 'Footnote', role: 'FOOTNOTE' })));
      const ch = typed(exx, ex.bottom + 170, ['SEE ALSO  ·  exhibits C and D, p. 4'], { size: 10, color: soft, label: 'Cross reference', role: 'FOOTNOTE' });
      return obj(G, sheet(), head(2), flow[1].objs, ex.objs.filter(o => !(o.kind === 'RECT' && o.templateRole === 'IMAGE_SLOT')), ex.objs.filter(o => o.kind === 'RECT' && o.templateRole === 'IMAGE_SLOT'), redact, tape(exx + 70, 118, 4), tape(exx + 150, 308, -5), q, ch, fns, foot(), tabs(1));
    }
    case 'SIDEBAR': {
      const sx = 490, sw = R - sx;
      const panel = rect(sx, 112, sw, 560, mix(paper, .25), { stroke: hair, strokeWidth: 1, label: 'Source panel', role: 'SIDEBAR' });
      const cards = [['S-1', 'Procurement officer, current', 'Documents and interview. Corroborated by S-3.', 4], ['S-2', 'Audit staff, former', 'Interview only. Draft audit seen, not retained.', 3], ['S-3', 'Contract system export', 'Native files with metadata. Hash recorded.', 5]];
      const pc: TelaVectorObject[] = [label(sx + 16, 126, sw - 32, 'Source panel', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22, role: 'SIDEBAR' }), hr(sx + 16, 144, sw - 32, ink, 1.25)];
      cards.forEach(([id, d, m, n], i) => { const y = 160 + i * 168; pc.push(rect(sx + 16, y, sw - 32, 150, sheetC, { stroke: hair, strokeWidth: 1, label: 'Source card', role: 'SIDEBAR' }), text(sx + 28, y + 12, 60, String(id), { size: 24, font: 'bigShoulders', weight: 800, color: ink, wrap: false, role: 'SIDEBAR', label: 'Source id' }), text(sx + 28, y + 46, sw - 56, String(d), { size: 11, font: 'courierPrime', weight: 700, color: ink, leading: 1.3, role: 'SIDEBAR', label: 'Source description' }), text(sx + 28, y + 82, sw - 56, String(m), { size: 10, font: 'courierPrime', color: soft, leading: 1.35, role: 'SIDEBAR', label: 'Source method' }), label(sx + 28, y + 126, 90, 'Reliability', { size: 7, font: 'ibmPlexMono', color: soft, tracking: .14, role: 'SIDEBAR' }), ...meter5(sx + 100, y + 125, n as number)); });
      const log = table(M, 700, [{ w: 64, font: 'ibmPlexMono' }, { w: 210, font: 'courierPrime' }, { w: 150, font: 'courierPrime' }, { w: 246, font: 'ibmPlexMono', color: soft }], [['12 Jun', 'Procurement file, 214 pp.', 'N. Hadley (copy)', 'a41f 90c2 77de'], ['19 Jun', 'Scoring sheet, native .xlsx', 'N. Hadley', '7be3 11a8 c04f'], ['24 Jun', 'Email, panel chair to panel', 'S. Marsh (counsel)', '0d58 e2b6 913a'], ['02 Jul', 'Audit drafts 1 and 2', 'N. Hadley', 'c9a7 3340 5fe1'], ['15 Jul', 'Memorandum of 9 April', 'City release', '41b0 d6e2 08cc']], { size: 10, font: 'courierPrime', color: ink, rule: hair, pad: 6, head: ['Date', 'Item', 'Handled by', 'Hash (first 12)'], headSize: 8, headFont: 'ibmPlexMono', headColor: soft, headRule: ink, label: 'Chain of custody' });
      const logHead = obj(label(M, 678, 300, 'Chain of custody', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22, role: 'SIDEBAR' }));
      return obj(G, sheet(), head(3), flow[2].objs, panel, pc, logHead, log.objs, foot(), tabs(2));
    }
    default: {
      const A = flow[3];
      const dispY = 262;
      const chk = [['Two independent sources for every material claim', true], ['Documents authenticated against originals or metadata', true], ['Right of reply offered to the city and the company', true], ['Legal review completed', true], ['Second installment: payment vote still pending', false]] as Array<[string, boolean]>;
      const form = obj(label(M, dispY, 300, 'Disposition', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22 }), hr(M, dispY + 18, R - M, ink, 1.25, { label: 'Disposition rule' }), chk.flatMap(([t, c], i) => checkbox(M, dispY + 34 + i * 26, t, { color: ink, font: 'courierPrime', textSize: 12, w: 460, checked: c, accent: ink })));
      const sig = obj(hr(M, dispY + 214, 220, ink, 1, { label: 'Signature line' }), text(M + 6, dispY + 186, 220, 'N. Hadley', { size: 30, font: 'caveat', weight: 600, color: mix(secondary, -.3), wrap: false, label: 'Signature', role: 'BYLINE' }), label(M, dispY + 222, 220, 'Reporter  ·  N. Hadley', { size: 8, font: 'ibmPlexMono', color: soft, tracking: .14 }),
        hr(M + 270, dispY + 214, 200, ink, 1, { label: 'Signature line' }), text(M + 276, dispY + 192, 200, 'P. Marsh', { size: 28, font: 'caveat', weight: 600, color: mix(secondary, -.3), wrap: false, label: 'Signature', role: 'BYLINE' }), label(M + 270, dispY + 222, 220, 'Editor  ·  P. Marsh', { size: 8, font: 'ibmPlexMono', color: soft, tracking: .14 }));
      const methods = obj(label(M, 540, 300, 'Methods and limits', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22 }), hr(M, 558, R - M, ink, 1.25), text(M, 570, 470, 'This report rests on records released by the city, a native export of the contract system and interviews with five people, three of whom asked not to be named. We could not obtain the evaluation panel’s minutes. Figures are in US dollars at the contract date.', { size: 11, font: 'courierPrime', color: ink, leading: 1.5, label: 'Methods statement', role: 'BODY' }));
      const tip = obj(rect(M, 700, R - M, 118, mix(paper, .25), { stroke: hair, strokeWidth: 1, label: 'Tip box', role: 'SIDEBAR' }), label(M + 16, 714, 300, 'Send a document', { size: 9, font: 'ibmPlexMono', color: accent, weight: 700, tracking: .22, role: 'SIDEBAR' }), ...typed(M + 16, 740, ['Secure drop:  ', { r: 22 }, '.example/tips'], { size: 12, role: 'SIDEBAR', label: 'Contact line' }), ...typed(M + 16, 762, ['Signal:  +1 ', { r: 3 }, ' ', { r: 3 }, ' ', { r: 4 }], { size: 12, role: 'SIDEBAR', label: 'Contact line' }), text(M + 16, 786, R - M - 32, 'Do not use work email or a work device. We will not publish your name.', { size: 10, font: 'courierPrime', color: soft, wrap: false, role: 'SIDEBAR', label: 'Contact note' }));
      const sh = A.objs.length ? 0 : 126; const up = (arr: TelaVectorObject[]) => { arr.forEach(o => { o.y -= sh; if (o.points) o.points = o.points.map((v, i) => (i % 2 ? v - sh : v)); }); return arr; };
      return obj(G, sheet(), head(4), A.objs, up(obj(form, sig, methods, tip, stamp(R - 250, 860, 'FILE OPEN', -7, 34))), foot(), tabs(3));
    }
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// 4 · art-oped — The Column (Letter; opinion page with a portrait rail)
// ═════════════════════════════════════════════════════════════════════════════
const OP = {
  head: 'Our libraries are not a luxury. They are the last public room.',
  deck: 'Closing four branches will save less than resurfacing a ring road, and cost a town the one place where nobody is asked to buy anything.',
  paras: [
    'On a wet Tuesday afternoon last month I counted the people in the reading room of the Ashgrove branch library. There were forty-one. A man was filling in a visa form with the help of a volunteer. Two teenagers were pretending not to share a laptop. A woman I took to be a retired teacher was reading a newspaper with the focus of someone defusing it. No one was buying anything. No one was being sold anything. It was, I realised, the only room of its kind left on the high street.',
    'We are told, with some regularity, that libraries are a relic. The argument goes that books are cheap, information is free and the money would be better spent elsewhere. It is a persuasive argument if you believe a library is a warehouse for paper. It is a very poor argument if you have ever watched what a library actually does.',
    'A library is the last place in most towns where you can sit down without paying, ask a question without being profiled, and be treated, whoever you are, as a reader. It is where the unemployed print their CVs, where children without a quiet bedroom do their homework and where the lonely, who are far more numerous than we admit, go to be lonely in company.',
    'The council has proposed closing four of our eleven branches to save 1.8 million pounds. That is roughly the cost of resurfacing two kilometres of the ring road. I do not say resurfacing is unimportant. I say that nobody has ever met their neighbours on a ring road.',
    'Defenders of the cuts like to say that services can be “digital by default.” But the people who use the library most are the ones for whom the default is least available: those without broadband, without a device, without confidence. A closed branch does not move that person online. It moves them nowhere.',
    'There is also the question of what we are willing to call essential. We do not ask the fire station to turn a profit. We do not require the park to submit a business case for its benches. We understand, without needing a spreadsheet, that some things exist so that the rest of life can happen around them. A library belongs on that list.',
    'I have heard it said that this is sentimental. Perhaps. But sentiment is simply what we call evidence we have not yet learned to count. The council’s own survey found that 71 percent of residents had used a library in the past year, more than voted in the last local election. Whatever else that figure measures, it measures trust.',
    'So here is a modest proposal. Before the vote on 21 October, every councillor should spend one hour in a branch they intend to close. Not a visit with a photographer. An hour, on a wet Tuesday, in the reading room. Count the people. Then decide what kind of town you want to be the custodian of.',
  ],
  pull: '“Nobody has ever met their neighbours on a ring road.”',
};

const oped: PublicationDesigner = (ctx) => {
  const { W, H, paper, ink, accent, secondary, pageType, pageIndex } = ctx;
  const M = 48, RAILW = 184, MX = M + RAILW + 44, MW = W - M - MX, soft = mix(ink, .45), hair = alpha(ink, .22), tint = mix(paper, -.05);
  const G = rect(0, 0, W, H, paper, { role: 'GROUND', label: 'Page ground' });
  const body = { size: 14, font: 'spectral' as const, color: ink, leading: 1.55, after: 9 };
  const top = (n: string): TelaVectorObject[] => obj(rect(0, 0, W, 10, ink, { label: 'Top bar', role: 'ORNAMENT' }), text(M, 24, 300, 'The Column', { size: 22, font: 'fraunces', weight: 700, italic: true, color: ink, wrap: false, label: 'Masthead', role: 'LOGO' }), ...pill(M + 128, 28, 'Opinion', { fill: accent, color: '#fff', size: 8, h: 18, font: 'dmSans', tracking: .2 }).objs, label(W - M - 300, 30, 300, 'Thursday 8 October 2026  ·  ' + n, { size: 8.5, font: 'dmSans', color: soft, align: 'right', tracking: .14, role: 'DATELINE' }), hr(M, 58, W - 2 * M, ink, 1, { label: 'Masthead rule' }), vr(MX - 22, 78, H - 78 - 64, hair, 1, { label: 'Rail divider' }));
  const foot = (): TelaVectorObject[] => runningFoot(ctx, { left: M, right: W - M, y: H - 38, font: 'dmSans', size: 8.5, color: soft, head: 'The Column  ·  Opinion', rule: hair });
  const portrait = (y: number, size = 120): TelaVectorObject[] => imageSlot(M + (RAILW - size) / 2, y, size, size, { tone: 'light', shade: mix(paper, -.1), rx: size / 2, caption: 'Portrait', label: 'Author portrait' });
  const pages = pour([{ t: OP.paras[0], drop: { font: 'fraunces', lines: 3, color: accent, weight: 800 } }, ...OP.paras.slice(1).map(t => ({ t }))], [
    [{ x: MX, y: 384, w: MW, h: 232 }, { x: MX, y: 722, w: MW, h: 266 }],
    [{ x: MX, y: 96, w: MW, h: 300 }, { x: MX, y: 738, w: MW, h: 250 }],
    [{ x: MX, y: 96, w: MW, h: 250 }],
    [{ x: MX, y: 96, w: MW, h: 150 }],
  ], body);

  switch (pageType) {
    case 'ARTICLE HEADER': {
      const hed = text(MX, 84, MW, OP.head, { size: 44, font: 'fraunces', weight: 800, color: ink, leading: 1.03, tracking: -.01, label: 'Headline', role: 'HEADLINE' });
      const deck = text(MX, below(hed, 16), MW, OP.deck, { size: 19, font: 'fraunces', italic: true, weight: 400, color: mix(ink, .25), leading: 1.32, label: 'Standfirst', role: 'DECK' });
      const rail = obj(...portrait(94), text(M, 232, RAILW, 'Odalys Reyes', { size: 20, font: 'fraunces', weight: 700, color: ink, align: 'center', wrap: false, label: 'Byline', role: 'BYLINE' }), label(M, 260, RAILW, 'Library trustee and columnist', { size: 8.5, font: 'dmSans', color: accent, weight: 700, align: 'center', tracking: .14, role: 'BYLINE', label: 'Author role' }), hr(M + 40, 282, RAILW - 80, hair, .75),
        text(M, 294, RAILW, 'Odalys Reyes has chaired the Ashgrove library trust for nine years and writes about civic life on Thursdays.', { size: 11.5, font: 'spectral', color: soft, leading: 1.5, align: 'center', label: 'Author bio', role: 'SIDEBAR' }),
        label(M, 372, RAILW, 'oreyes@thecolumn.example', { size: 8, font: 'dmSans', color: soft, align: 'center', tracking: .06, transform: 'none', role: 'SIDEBAR' }));
      const more = obj(label(M, 640, RAILW, 'More by Odalys Reyes', { size: 8, font: 'dmSans', color: accent, weight: 800, tracking: .2, role: 'SIDEBAR' }), hr(M, 658, RAILW, ink, 1.25), ...['The quiet case for the bus pass', 'Why the park bench matters', 'Counting what we cannot count'].flatMap((t, i) => [text(M, 670 + i * 62, RAILW, t, { size: 15, font: 'fraunces', weight: 600, color: ink, leading: 1.2, role: 'SIDEBAR', label: 'Related headline' }), hr(M, 718 + i * 62 - 2, RAILW, hair, .6)]));
      const q = pullQuote(MX, 624, MW, OP.pull, { size: 28, font: 'fraunces', weight: 700, italic: true, color: accent, rule: 'left', ruleColor: accent, ruleW: 5, pad: 18, leading: 1.14 });
      return obj(G, top('Page 1'), hed, deck, rail, more, pages[0].objs, q.objs, foot());
    }
    case 'BODY PAGE': {
      const ill = figure(MX, 412, MW, 268, { tone: 'light', shade: mix(paper, -.1), hint: 'Illustration · 16:9', caption: 'Ashgrove branch, a wet Tuesday: forty-one readers by the count of the author.', credit: 'Illustration by Lotte Brandt', capFont: 'dmSans', capSize: 10, capColor: soft, label: 'Opinion illustration' });
      const rail = obj(text(M, 76, 90, '“', { size: 120, font: 'fraunces', weight: 800, color: accent, wrap: false, leading: 1, label: 'Quotation mark', role: 'ORNAMENT' }), text(M, 150, RAILW, OP.pull.replace(/[“”]/g, ''), { size: 24, font: 'fraunces', italic: true, weight: 600, color: accent, leading: 1.15, label: 'Pull quote', role: 'PULLQUOTE' }),
        hr(M, 396, RAILW, ink, 1.25), label(M, 406, RAILW, 'Library visits, Ashgrove', { size: 8, font: 'dmSans', color: accent, weight: 800, tracking: .18, role: 'SIDEBAR' }),
        ...[['2019', 82], ['2021', 41], ['2023', 77], ['2025', 96]].flatMap(([y, v], i) => [text(M, 430 + i * 28, 34, String(y), { size: 10, font: 'dmSans', color: soft, wrap: false, role: 'SIDEBAR', label: 'Year' }), ...meter(M + 40, 434 + i * 28, 104, 10, v as number, 100, i === 3 ? accent : ink, tint, { rx: 0 }), text(M + 150, 430 + i * 28, 34, String(v) + 'k', { size: 10, font: 'dmSans', weight: 700, color: ink, wrap: false, role: 'SIDEBAR', label: 'Value' })]));
      return obj(G, top('Page 2'), rail, pages[1].objs, ill.objs, foot());
    }
    case 'SIDEBAR': {
      const box = rect(MX, 372, MW, 340, tint, { label: 'Counterpoint panel', role: 'SIDEBAR' });
      const cp = obj(rect(MX, 372, 6, 340, ink, { label: 'Counterpoint bar', role: 'RULE' }), label(MX + 28, 392, 300, 'The other side', { size: 9, font: 'dmSans', color: accent, weight: 800, tracking: .22, role: 'SIDEBAR' }),
        text(MX + 28, 414, MW - 56, '“Every pound spent on a half-empty building is a pound not spent on the vulnerable. We are keeping the seven busiest branches and investing in a mobile service.”', { size: 17, font: 'fraunces', italic: true, color: ink, leading: 1.32, label: 'Counterpoint quote', role: 'SIDEBAR' }), label(MX + 28, 518, MW - 56, 'Councillor Hugh Ferrant, finance chair', { size: 8.5, font: 'dmSans', color: soft, weight: 700, tracking: .12, role: 'SIDEBAR' }),
        hr(MX + 28, 546, MW - 56, hair, .75), label(MX + 28, 558, 300, 'A reader replies', { size: 9, font: 'dmSans', color: accent, weight: 800, tracking: .22, role: 'SIDEBAR' }),
        text(MX + 28, 580, MW - 56, '“Mobile libraries are lovely. They are also not open on Sundays, have no desks, and cannot print a CV. Please do not mistake a van for a branch.”', { size: 14, font: 'spectral', italic: true, color: ink, leading: 1.45, label: 'Reader response', role: 'SIDEBAR' }), label(MX + 28, 668, MW - 56, 'Imani Wright, Ashgrove', { size: 8.5, font: 'dmSans', color: soft, weight: 700, tracking: .12, role: 'SIDEBAR' }));
      const claims = obj(label(M, 76, RAILW, 'Checked', { size: 8, font: 'dmSans', color: accent, weight: 800, tracking: .22, role: 'SIDEBAR' }), hr(M, 94, RAILW, ink, 1.25), ...[['71 percent of residents used a library last year', 'Council survey, 2025'], ['Four of eleven branches proposed for closure', 'Cabinet paper, 9 Sept'], ['1.8 million pounds saved by closure', 'Finance report, p. 14']].flatMap(([c, s], i) => { const y = 108 + i * 118; return [circle(M + 8, y + 8, 8, accent, { label: 'Check badge' }), text(M + 3, y + 1, 12, '✓', { size: 11, font: 'dmSans', weight: 800, color: '#fff', wrap: false, label: 'Check mark', role: 'ORNAMENT' }), text(M + 26, y, RAILW - 26, c as string, { size: 12.5, font: 'fraunces', weight: 600, color: ink, leading: 1.3, role: 'SIDEBAR', label: 'Claim' }), text(M + 26, y + 62, RAILW - 26, 'Source: ' + s, { size: 9, font: 'dmSans', color: soft, leading: 1.4, role: 'FOOTNOTE', label: 'Claim source' }), hr(M, y + 100, RAILW, hair, .6)]; }));
      const letters = obj(label(MX, 740, 300, 'Write to us', { size: 9, font: 'dmSans', color: accent, weight: 800, tracking: .22 }), hr(MX, 758, MW, ink, 1.25), text(MX, 770, MW, 'Letters of up to 250 words may be sent to letters@thecolumn.example with your name and town. We publish a selection each Saturday and edit for length and clarity only.', { size: 12.5, font: 'spectral', color: soft, leading: 1.5, label: 'Letters policy', role: 'SIDEBAR' }));
      return obj(G, top('Page 3'), claims, pages[2].objs, box, cp, letters, foot());
    }
    default: {
      const A = pages[3];
      const has = A.objs.length > 0; const sign = obj(text(MX, has ? A.endY + 36 : 110, 240, 'Odalys Reyes', { size: 34, font: 'caveat', weight: 600, color: ink, wrap: false, label: 'Signature', role: 'BYLINE' }), has ? rect(A.endX + 6, A.endY + 4, 8, 8, accent, { label: 'End mark', role: 'ORNAMENT' }) : rect(MX + 190, 140, 8, 8, accent, { label: 'End mark', role: 'ORNAMENT' }));
      const card = obj(rect(MX, 330, MW, 214, tint, { label: 'Author card', role: 'SIDEBAR' }), ...imageSlot(MX + 20, 350, 130, 174, { tone: 'light', shade: mix(paper, -.12), caption: 'Portrait', label: 'Author portrait' }), label(MX + 172, 352, 260, 'About the author', { size: 8.5, font: 'dmSans', color: accent, weight: 800, tracking: .22, role: 'SIDEBAR' }), text(MX + 172, 372, MW - 192, 'Odalys Reyes is a library trustee, a former schools inspector and the author of Open Doors, a history of public reading rooms. She lives in Ashgrove with two cats and an overdue book.', { size: 13, font: 'spectral', color: ink, leading: 1.5, label: 'Author biography', role: 'SIDEBAR' }));
      const more = obj(label(MX, 580, 300, 'More opinion', { size: 8.5, font: 'dmSans', color: accent, weight: 800, tracking: .22 }), hr(MX, 598, MW, ink, 1.25), ...[['Taxes are how strangers say thank you', 'Arjun Rao'], ['In defence of the boring committee', 'Wen Li'], ['What the pothole knows', 'Maude Fenwick']].flatMap(([t, a], i) => { const y = 614 + i * 92; return [text(MX, y, 36, String(i + 1), { size: 38, font: 'fraunces', weight: 800, color: accent, wrap: false, label: 'Number', role: 'LABEL' }), text(MX + 52, y + 2, MW - 52, t, { size: 19, font: 'fraunces', weight: 700, color: ink, leading: 1.15, role: 'HEADLINE', label: 'Related headline' }), label(MX + 52, y + 54, MW - 52, 'By ' + a, { size: 8.5, font: 'dmSans', color: soft, tracking: .12, transform: 'none', role: 'BYLINE' }), hr(MX, y + 78, MW, hair, .6)]; }));
      const rail = obj(...portrait(94), text(M, 232, RAILW, 'Odalys Reyes', { size: 20, font: 'fraunces', weight: 700, color: ink, align: 'center', wrap: false, label: 'Byline', role: 'BYLINE' }), label(M, 260, RAILW, 'Follow  ·  Newsletter', { size: 8.5, font: 'dmSans', color: accent, weight: 700, align: 'center', tracking: .14, role: 'SIDEBAR' }), ...button(M + 12, 296, RAILW - 24, 40, 'Read the replies', { fill: ink, color: paper, font: 'dmSans', size: 12, rx: 0 }), text(M, 360, RAILW, 'This column reflects the views of its author. Corrections: standards@thecolumn.example.', { size: 10, font: 'dmSans', color: soft, leading: 1.5, align: 'center', role: 'FOOTNOTE', label: 'Disclaimer' }));
      return obj(G, top('Page 4'), A.objs, sign, rail, card, more, foot());
    }
  }
};

export const DESIGNS_A: Record<string, PublicationDesigner> = { 'art-longform': longform, 'art-breaking': breaking, 'art-dossier': dossier, 'art-oped': oped };
export const LESSONS_A: Record<string, DesignLesson> = {
  'art-longform': { principle: 'A feature earns its length by starting quiet: one image, one headline, one deck, and nothing competing until the reader decides to commit.', history: 'The modern magazine feature grew from the Sunday supplements and the long-form house styles of the New Yorker, Harper’s and, from 1970, the New York Times Magazine, where large photography over a measured serif headline became the model for narrative journalism. Standfirsts, pull quotes and drop caps are older still, borrowed from book design to give long texts a way in.', tryThis: 'Swap the hero for your own picture and cut the headline to five words. Notice how much louder the standfirst becomes.', interestTag: 'Magazine design', related: ['Longform journalism', 'Editorial typography', 'Drop caps'] },
  'art-breaking': { principle: 'A wire story is built for scanning under pressure: slug, headline, key points, then the facts in descending order of importance.', history: 'The inverted pyramid took hold in the telegraph era, when a line could drop mid-sentence and editors needed the essential facts first. Wire services standardised the dateline, the attribution and the tight paragraph, and the habit survived into web design as the key-points box and the live updates rail.', tryThis: 'Rewrite the headline in nine words or fewer without losing the number, then move the rail’s newest update to the top of the deck.', interestTag: 'News design', related: ['Inverted pyramid', 'Live blogs', 'Information hierarchy'] },
  'art-dossier': { principle: 'Evidence is the design: exhibit tabs, redaction bars and a source key tell the reader how much to trust each line before they read it.', history: 'Document-led reporting borrows the look of the case file: typewritten pages, index tabs and rubber stamps from police and intelligence archives. Modern investigative teams kept the conventions, such as exhibit numbering, source grading and chain-of-custody logs, because they make a story auditable as well as readable.', tryThis: 'Replace one redaction bar with the real text and ask whether the sentence still needs the bar, or the bar was doing the work.', interestTag: 'Investigative journalism', related: ['Source protection', 'Document design', 'Typewriter type'] },
  'art-oped': { principle: 'An opinion page puts a person next to an argument: a portrait rail gives the voice a face, and one ruled column keeps the reasoning in a straight line.', history: 'The op-ed, short for opposite the editorial page, was introduced by the New York Times in 1970 to print views from outside its own staff. Its layout, a byline with a photograph beside a single measured column, became the template for commentary across newspapers and sites.', tryThis: 'Cut the headline to a verb and a noun, then check that the pull quote disagrees with nobody but the opposing side.', interestTag: 'Opinion writing', related: ['Op-ed', 'Commentary', 'Fraunces'] },
};
