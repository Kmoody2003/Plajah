// telaTemplateRegistry — ONE gallery over every Tela template family.
//
// Style eras, publications and creative templates keep their own metadata
// modules (TelaView already calls them); this registry adapts all of them into
// TelaDesignTemplate so the gallery UI, the proof-sheet script and the tests
// see one shape with pages, a lesson and an interest tag.
import type { TelaVectorObject } from '../../types';
import { TELA_STYLE_ERAS, instantiateStyleEraPages, resolveStyleEra } from '../telaStyleEraLibrary';
import { TELA_PUBLICATION_TEMPLATES, instantiatePublicationPage } from '../telaPublicationTemplates';
import { TELA_CREATIVE_TEMPLATES, instantiateTelaTemplate, type TelaTemplateCategory } from '../telaCreativeEngine';
import { lessonFor } from './designLessons';
import { LOWER_THIRDS } from '../fabula/lowerThirdRegistry';
import { lowerThirdToTelaObjects } from '../fabula/lowerThirdToTela';
import { LT_W, LT_H } from '../fabula/lowerThirds';
import { fontKeysInStacks, type FontKey } from './telaFonts';
import type { GalleryCollection, TelaDesignTemplate } from './designs/types';
export type { TelaDesignTemplate, DesignLesson } from './designs/types';

const memo = <T,>(fn: () => T) => { let v: T | undefined, done = false; return () => { if (!done) { v = fn(); done = true; } return v as T; }; };

const eraTemplates: TelaDesignTemplate[] = TELA_STYLE_ERAS.map(raw => {
  const e = resolveStyleEra(raw);
  const pages = memo(() => instantiateStyleEraPages(e));
  const n = 2; // designers deliver an opener + an interior; the generic composer one page
  const specs = Array.from({ length: n }, (_, i) => ({ label: i === 0 ? 'Opener' : 'Interior', build: () => pages()[i] || [] })).filter((_, i) => i === 0 || true);
  return {
    id: `era:${e.id}`, family: e.id, name: e.name, collection: 'DESIGN_HISTORY' as GalleryCollection, group: e.category,
    tagline: e.description, description: `${e.period} · ${e.region}. ${e.typography}.`, audience: e.culturalNote,
    palette: [...e.palette], fonts: [], width: 816, height: 1056, frameKind: 'PAPER',
    pages: specs.filter((s, i) => i === 0 || pages().length > i),
    lesson: lessonFor('era', e.id, { interestTag: e.name, history: `${e.name} (${e.period}, ${e.region}): ${e.description}` }),
    tags: [...e.traits, e.category.toLowerCase(), ...e.museumPath.split('·').map(s => s.trim().toLowerCase())],
  };
});

const publicationTemplates: TelaDesignTemplate[] = TELA_PUBLICATION_TEMPLATES.map(t => ({
  id: `pub:${t.id}`, name: t.name, collection: 'PUBLICATION', group: t.category,
  tagline: t.description, description: t.audience, audience: t.audience,
  palette: [...t.palette], fonts: [], width: t.width, height: t.height, frameKind: t.category === 'EMAIL BLAST' ? 'SCREEN' : 'PAPER',
  pages: t.pages.map((pageType, i) => ({ label: `${i + 1} · ${pageType}`, build: () => instantiatePublicationPage(t, pageType, i) })),
  lesson: lessonFor('publication', t.id, { interestTag: t.category === 'COMIC & MANGA' ? 'Comics & manga' : t.category === 'CHILDREN’S BOOK' ? 'Picture books' : t.category === 'PHOTO BOOK' ? 'Photo books' : t.category === 'MAGAZINE' ? 'Magazine design' : t.category === 'NEWSLETTER' ? 'Newsletter design' : 'Email design' }),
  tags: [t.category.toLowerCase(), t.fontMood.toLowerCase(), t.audience.toLowerCase()],
}));

const CREATIVE_COLLECTION: Record<TelaTemplateCategory, GalleryCollection> = { DOCUMENT: 'DOCUMENT', POSTER: 'POSTER', LOWER_THIRD: 'LOWER_THIRD', MENU: 'MENU', PRESENTATION: 'PRESENTATION', SOCIAL: 'SOCIAL', WEB: 'WEB' };
const creativeTemplates: TelaDesignTemplate[] = TELA_CREATIVE_TEMPLATES.filter(t => t.category !== 'LOWER_THIRD').map(t => ({
  id: `creative:${t.id}`, name: t.name, collection: CREATIVE_COLLECTION[t.category], group: t.category.replace('_', ' '),
  tagline: `${t.tone.charAt(0)}${t.tone.slice(1).toLowerCase()} ${t.category.toLowerCase().replace('_', ' ')}`, description: '',
  palette: [...t.palette], fonts: [], width: t.width, height: t.height, frameKind: t.category === 'DOCUMENT' || t.category === 'POSTER' || t.category === 'MENU' ? 'PAPER' : 'SCREEN',
  pages: [{ label: t.category === 'PRESENTATION' ? 'Title slide' : 'Design', build: () => instantiateTelaTemplate(t) }],
  lesson: lessonFor('creative', t.name, { interestTag: t.category === 'POSTER' ? 'Poster design' : t.category === 'SOCIAL' ? 'Social media design' : t.category === 'PRESENTATION' ? 'Presentation design' : t.category === 'WEB' ? 'Web design' : t.category === 'MENU' ? 'Menu design' : 'Document design' }),
  tags: [t.category.toLowerCase(), t.tone.toLowerCase()],
}));

// Fabula lower thirds appear in the gallery as their resting frame on a 1920×1080
// screen; choosing one from Tela opens the design as an editable page, while
// Fabula's own gallery adds it to a timeline with motion.
const lowerThirdTemplates: TelaDesignTemplate[] = LOWER_THIRDS.map(s => ({
  id: `lower:${s.id}`, family: s.family, name: s.name, collection: 'LOWER_THIRD', group: s.group,
  tagline: s.tagline, description: `${s.layers.length} animated layers · ${Math.round(s.duration)}s · title, subtitle${s.tag ? ', tag' : ''}.`,
  palette: [s.colors.paper, s.colors.ink, s.colors.accent, s.colors.secondary], fonts: [s.title.font, s.subtitle.font],
  width: LT_W, height: LT_H, frameKind: 'SCREEN',
  pages: [{ label: 'Resting frame', build: () => lowerThirdToTelaObjects(s) }],
  lesson: s.lesson, tags: [...s.tags, 'motion', 'fabula', s.group.toLowerCase()],
}));

export const TELA_TEMPLATE_GALLERY: TelaDesignTemplate[] = [...eraTemplates, ...publicationTemplates, ...creativeTemplates, ...lowerThirdTemplates];

export const GALLERY_COLLECTIONS: Array<{ id: GalleryCollection; label: string; blurb: string }> = [
  { id: 'DESIGN_HISTORY', label: 'Design history', blurb: 'Movements and traditions as editable documents, each with its lesson.' },
  { id: 'PUBLICATION', label: 'Publications', blurb: 'Magazines, newsletters, books, albums, comics — whole page systems.' },
  { id: 'DOCUMENT', label: 'Documents', blurb: 'Reports, proposals, résumés, lesson plans, press kits.' },
  { id: 'POSTER', label: 'Posters', blurb: 'Events, exhibitions, launches — one page that has to stop someone.' },
  { id: 'SOCIAL', label: 'Social', blurb: 'Square and story formats for feeds.' },
  { id: 'PRESENTATION', label: 'Presentations', blurb: 'Title slides that set a deck’s voice.' },
  { id: 'WEB', label: 'Web', blurb: 'Landing heroes and page systems.' },
  { id: 'MENU', label: 'Menus', blurb: 'Cafés, bistros, pop-ups, kids.' },
  { id: 'LOWER_THIRD', label: 'Lower thirds', blurb: 'Motion graphics for Fabula, editable to the keyframe.' },
];

/** Fonts a template needs (from its first page). */
export function templateFonts(t: TelaDesignTemplate): FontKey[] {
  const objects: TelaVectorObject[] = t.pages[0]?.build() || [];
  return fontKeysInStacks(objects.map(o => o.fontFamily));
}

export function findTemplate(id: string): TelaDesignTemplate | undefined { return TELA_TEMPLATE_GALLERY.find(t => t.id === id); }
