// storybook/fromShowcase — the six showcase books as StoryBooks, losslessly, and the Remix entry point.
//
//   storyBookFromShowcase(book)   ShowcaseBook → StoryBook. Every ShowcaseBook field lands somewhere in the StoryBook;
//                                 toShowcaseBook() reverses it and tests/storybookModel.test.ts proves deepEqual for all six.
//   remixShowcase(id, owner)      a NEW draft StoryBook that starts from a showcase book (CC BY 4.0): new id, owner,
//                                 remixOf + the attribution line the licence requires, same art programs and kit.
//
// Programs per spread: the two ported designers ('port:story-bedtime', 'port:story-space') read the StoryBook itself
// (text, cast palette, beat order); the four not yet ported run their original designer ('legacy:<templateId>'), whose
// lettered story text is lifted into live text frames by the layout build, so their words are still editable.
import type { ShowcaseBook, ShowcaseCharacter, ShowcaseSpread } from '../../data/showcase/types';
import { showcaseById } from '../../data/showcase';
import { TELA_PUBLICATION_TEMPLATES } from '../telaPublicationTemplates';
import type { CharacterSpec } from '../tela/geometry/procedural/character';
import type { CharacterBible, NamedPose, StoryBook, StorySpread, SpreadLayout, EnvironmentKind, LayoutKind } from './model';
import { STORYBOOK_SCHEMA, storyFromText, storyPlain, trimForPx, spreadId } from './model';
import { kitForTemplate, type StyleKit } from './style/kit';
import { deriveBookVoca } from './voca/derive';
import { emptyLivingBook } from '../showcase/livingDoc';
import { PORTED_TEMPLATES } from './art/programs';

/** Fixed timestamp so conversions are byte-identical (the day the showcase books were published). */
export const SHOWCASE_EPOCH = Date.UTC(2026, 9, 9);

// ───────────── characters ─────────────

const has = (s: string, ...k: string[]) => k.some(x => new RegExp(`\\b${x}`, 'i').test(s));
const lum = (h: string) => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return v[0] * .3 + v[1] * .59 + v[2] * .11; };

/** A geometry CharacterSpec from the locked look + palette. Creatures the kit can draw get renderer 'kit'; vehicles, planets, bugs, fish... stay with their book's designer. */
export function specFor(c: Pick<ShowcaseCharacter, 'id' | 'name' | 'kind' | 'palette'>, kit: StyleKit, seed = 1): { spec: CharacterSpec; renderer: 'kit' | 'designer' } {
  const k = c.kind;
  const pal = c.palette.length ? c.palette : kit.palette.skin;
  const body = pal[0]; const belly = pal.find((x, i) => i > 0 && lum(x) > lum(body) + 30) ?? undefined;
  const ink = pal.slice().sort((a, b) => lum(a) - lum(b))[0]; const darkInk = lum(ink) < 70 ? ink : kit.palette.ink;
  const medium: CharacterSpec['medium'] = kit.texture.material === 'felt' ? 'felt' : kit.texture.material === 'watercolor' ? 'watercolor' : kit.texture.material === 'crayon' ? 'crayon' : kit.texture.material === 'flat' || kit.texture.material === 'cutpaper' || kit.texture.material === 'riso' ? 'flat' : 'gouache';
  const base = { name: c.name, seed, palette: { body, ...(belly ? { belly } : {}), ink: darkInk, cheek: '#f08a7e', ...(pal[2] ? { accent: pal[2] } : {}) }, lineWeight: Math.max(1.6, kit.line.weight || 2.4), medium, light: kit.lighting.direction };
  let spec: CharacterSpec; let renderer: 'kit' | 'designer' = 'kit';
  if (has(k, 'bear')) spec = { ...base, build: 'round', headRatio: .62, ears: 'round', tail: 'none' };
  else if (has(k, 'fox', 'wolf')) spec = { ...base, build: 'bean', headRatio: .58, ears: 'pointy', tail: 'fluffy' };
  else if (has(k, 'fawn', 'deer')) spec = { ...base, build: 'tall', headRatio: .56, ears: 'floppy', tail: 'none' };
  else if (has(k, 'pup', 'dog', 'puppy')) spec = { ...base, build: 'bean', headRatio: .6, ears: 'floppy', tail: 'thin' };
  else if (has(k, 'cat', 'kitten')) spec = { ...base, build: 'bean', headRatio: .58, ears: 'pointy', tail: 'thin' };
  else if (has(k, 'mouse', 'hamster')) spec = { ...base, build: 'round', headRatio: .62, ears: 'round', tail: 'thin' };
  else if (has(k, 'bunny', 'rabbit', 'hare')) spec = { ...base, build: 'pear', headRatio: .6, ears: 'floppy', tail: 'fluffy' };
  else if (has(k, 'astronaut', 'girl', 'boy', 'child', 'weaver', 'kid')) spec = { ...base, build: 'tall', headRatio: .62, ears: 'none', tail: 'none' };
  else { spec = { ...base, build: 'round', headRatio: .6, ears: 'none', tail: 'none' }; renderer = 'designer'; }
  return { spec, renderer };
}

/** Default turnaround + expression sheet for a character (what the Cast stage starts from). */
export function defaultTurnarounds(): NamedPose[] {
  return [
    { id: 'front', label: 'Front', view: 'front', pose: { expression: { eyes: 'open', mouth: 'smile' } } },
    { id: 'three-quarter', label: '3/4', view: 'threeQuarter', pose: { expression: { eyes: 'open', mouth: 'smile' } } },
    { id: 'side', label: 'Side', view: 'side', pose: { expression: { eyes: 'open', mouth: 'flat' } } },
    { id: 'back', label: 'Back', view: 'back', pose: {} },
    { id: 'happy', label: 'Happy', view: 'threeQuarter', pose: { armR: 140, expression: { eyes: 'happy', mouth: 'grin' } } },
    { id: 'surprised', label: 'Surprised', view: 'front', pose: { armL: 60, armR: 60, expression: { eyes: 'wide', mouth: 'o', brows: -.6 } } },
    { id: 'sad', label: 'Sad', view: 'threeQuarter', pose: { expression: { eyes: 'open', mouth: 'frown', brows: .8 } } },
    { id: 'sleepy', label: 'Sleepy', view: 'front', pose: { expression: { eyes: 'sleepy', mouth: 'flat' } } },
  ];
}

export function bibleFromShowcase(c: ShowcaseCharacter, kit: StyleKit, seed: number): CharacterBible {
  const { spec, renderer } = specFor(c, kit, seed);
  return {
    id: c.id, name: c.name, kind: c.kind, role: c.role, personality: [...c.personality], look: c.look, palette: [...c.palette],
    voice: c.voice, signature: c.signature, arc: c.arc, refs: {}, spec, renderer, turnarounds: defaultTurnarounds(), locked: true,
  };
}
export function bibleToShowcase(c: CharacterBible): ShowcaseCharacter {
  return { id: c.id, name: c.name, kind: c.kind, role: c.role, personality: [...c.personality], look: c.look, palette: [...c.palette], voice: c.voice, signature: c.signature, arc: c.arc };
}

// ───────────── spreads ─────────────

const LAYOUT_OF: Record<ShowcaseSpread['beat'], LayoutKind> = {
  cover: 'cover', back: 'back', hero: 'full-bleed', vignette: 'vignette', strip: 'strip', quiet: 'colour-block', reveal: 'scale-play', panorama: 'full-bleed', activity: 'vignette', closing: 'full-bleed',
};
const SETTING_OF: Record<string, EnvironmentKind> = { 'story-bedtime': 'bedroom', 'story-space': 'night-sky', 'story-forest': 'forest', 'story-ocean': 'ocean', 'story-city': 'city', 'story-folktale': 'village' };
export function programFor(templateId: string): string { return PORTED_TEMPLATES.includes(templateId) ? `port:${templateId}` : `legacy:${templateId}`; }

function spreadFromShowcase(book: ShowcaseBook, s: ShowcaseSpread, i: number): StorySpread {
  const id = spreadId(i + 1);
  const layout: SpreadLayout = { kind: LAYOUT_OF[s.beat] };
  return {
    id, n: s.n, beat: s.beat, ...(s.turn !== undefined ? { turn: s.turn } : {}),
    text: storyFromText(id, s.text),
    art: { brief: s.art, setting: SETTING_OF[book.templateId], programId: programFor(book.templateId), seed: `${book.id}/${id}` },
    cast: s.characters.map(cid => ({ id: cid })),
    ...(s.sfx !== undefined ? { sfx: s.sfx } : {}),
    voca: { level: 1, auto: true, targetWords: [] },
    layout,
    living: { page: s.n },
  };
}
function spreadToShowcase(sp: StorySpread): ShowcaseSpread {
  return { n: sp.n, beat: sp.beat, text: storyPlain(sp.text), art: sp.art.brief, characters: sp.cast.map(c => c.id), ...(sp.turn !== undefined ? { turn: sp.turn } : {}), ...(sp.sfx !== undefined ? { sfx: sp.sfx } : {}) };
}

// ───────────── the book ─────────────

export interface FromShowcaseOptions { ownerId?: string; now?: number }
export function storyBookFromShowcase(book: ShowcaseBook, o: FromShowcaseOptions = {}): StoryBook {
  const t = TELA_PUBLICATION_TEMPLATES.find(x => x.id === book.templateId);
  if (!t) throw new Error(`Template "${book.templateId}" is not registered`);
  const style = kitForTemplate(book.templateId);
  const now = o.now ?? SHOWCASE_EPOCH;
  const sb: StoryBook = {
    schema: STORYBOOK_SCHEMA, id: book.id, ownerId: o.ownerId ?? '', title: book.title, logline: book.logline, blurb: book.blurb,
    ageMin: book.ageMin, ageMax: book.ageMax, band: book.band, language: 'en', license: book.license, aiDisclosure: book.aiDisclosure, author: book.author,
    medium: book.medium, theme: book.theme, ...(book.refrain !== undefined ? { refrain: book.refrain } : {}),
    origin: { showcaseId: book.id, templateId: book.templateId },
    remixIdeas: [...book.remixIdeas], discussion: [...book.discussion], ...(book.glossary ? { glossary: book.glossary.map(g => ({ ...g })) } : {}),
    characters: book.characters.map((c, i) => bibleFromShowcase(c, style, i + 1)),
    spreads: book.spreads.map((s, i) => spreadFromShowcase(book, s, i)),
    style, trim: trimForPx(t.width, t.height),
    voca: { level: 1, auto: true },
    living: emptyLivingBook(book),
    status: 'published', version: 1, createdAt: now, updatedAt: now,
  };
  return deriveBookVoca(sb, { now });
}

/** StoryBook → ShowcaseBook (the inverse; requires `origin.templateId`, i.e. a book that came from or targets a showcase template). */
export function toShowcaseBook(sb: StoryBook): ShowcaseBook {
  if (!sb.origin) throw new Error(`"${sb.id}" has no showcase template`);
  return {
    id: sb.id, templateId: sb.origin.templateId, title: sb.title, blurb: sb.blurb, logline: sb.logline, ageMin: sb.ageMin, ageMax: sb.ageMax, band: sb.band,
    medium: sb.medium, theme: sb.theme, ...(sb.refrain !== undefined ? { refrain: sb.refrain } : {}), author: sb.author, aiDisclosure: sb.aiDisclosure,
    license: 'CC_BY', remixIdeas: [...sb.remixIdeas], characters: sb.characters.map(bibleToShowcase), spreads: sb.spreads.map(spreadToShowcase),
    discussion: [...sb.discussion], ...(sb.glossary ? { glossary: sb.glossary.map(g => ({ ...g })) } : {}),
  };
}

export const showcaseStoryBook = (id: string, o: FromShowcaseOptions = {}): StoryBook => {
  const b = showcaseById(id); if (!b) throw new Error(`Unknown showcase book "${id}"`); return storyBookFromShowcase(b, o);
};

export interface RemixOptions { ownerId: string; id: string; author: string; now?: number; title?: string }
/** Start a new book from a showcase book (CC BY 4.0). Keeps the story, cast, kit and programs; the author edits from there. */
export function remixShowcase(showcaseId: string, o: RemixOptions): StoryBook {
  const src = showcaseStoryBook(showcaseId, { now: o.now });
  const now = o.now ?? Date.now();
  const credit = `Based on "${src.title}" by ${src.author} (CC BY 4.0).`;
  const living = src.living ? { ...src.living, bookId: o.id } : undefined;
  return {
    ...src, id: o.id, ownerId: o.ownerId, author: o.author, title: o.title ?? src.title,
    remixOf: { bookId: src.id, title: src.title, author: src.author, license: 'CC BY 4.0', credit },
    characters: src.characters.map(c => ({ ...c, locked: false })),
    status: 'draft', version: 1, createdAt: now, updatedAt: now, living,
    spreads: src.spreads.map(s => ({ ...s, art: { ...s.art, seed: `${src.id}/${s.id}` } })),
  };
}
