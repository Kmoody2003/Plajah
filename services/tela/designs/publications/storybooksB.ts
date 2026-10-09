// storybooksB — children's picture books, wave B (v3 art direction): story-ocean and story-bedtime.
//
// Art direction: docs/tela/CHILDRENS_BOOK_ART_DIRECTION.md (v3: a different MEDIUM per book, different
// FORMATS per age group). v2's wax-resist crayon ocean and oil-pastel bedtime are REPLACED here:
//   story-ocean   "Below the Blue" -> WATERCOLOUR, ages 6-8, square 8.5 x 8.5 in (816 x 816), 13 pages  (storyOcean.ts + watercolorKit.ts)
//   story-bedtime "Moon Blanket"    -> FELT & STITCHED TEXTILE, ages 2-4, portrait 8 x 10 in (768 x 960), 11 pages (storyBedtime.ts + feltKit.ts)
// The STORY is data (data/showcase/books/*.ts, via showcaseByTemplate): page count, page order (beats), words and characters come from there.
// The designers pick a layout family from each spread's beat and keep
// invisible, labelled IMAGE_SLOT placeholders so generated art can be dropped in later. Every page is
// already finished and in-medium without any image.
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import { oceanPage } from './storyOcean';
import { bedtimePage } from './storyBedtime';
import { showcaseByTemplate } from '../../../../data/showcase';

const needBook = (templateId: string) => { const b = showcaseByTemplate(templateId); if (!b) throw new Error(`No showcase book for template ${templateId}`); return b; };

export const DESIGNS: Record<string, PublicationDesigner> = {
  'story-ocean': ctx => oceanPage(ctx.pageIndex, ctx.seed, needBook(ctx.template.id)),
  'story-bedtime': ctx => bedtimePage(ctx.pageIndex, ctx.seed, needBook(ctx.template.id)),
};

export const LESSONS: Record<string, DesignLesson> = {
  'story-ocean': {
    principle: 'Watercolour is built from transparency: pale washes laid over white paper, a darker wet edge where each wash dries, blooms and salt where the water ran back, and a loose pencil line the paint never quite obeys. The white you leave unpainted is a colour too.',
    history: 'Picture-book illustrators have painted in transparent watercolour since Beatrix Potter and Edward Lear; the soft, runny look children love comes from wet-in-wet painting, where colours are dropped into a still-damp wash and bleed together. Salt, spatter and lifted highlights are classic tricks the medium invented.',
    tryThis: 'Paint a wash of blue, then drop a pinch of salt in while it is wet. Leave a white gap where the light falls. Does the picture feel wet?',
    interestTag: 'Picture books',
    related: ['Wet-in-wet', 'Wet edge', 'Leave the paper white'],
  },
  'story-bedtime': {
    principle: 'Felt and thread make a picture you want to touch. Each piece is cut from cloth, layered on the one below, and held down with a visible running stitch; shadows are soft and stacked, and every colour is rich wool, never grey.',
    history: 'Appliqué (sewing cut shapes onto a ground) is centuries old, and quilted bedtime blankets are how many families first meet pictures. Felt-and-stitch illustration brings that homemade softness to the picture book, where the thread itself becomes the line drawing.',
    tryThis: 'Cut a moon, a star and a cloud from paper, stack them in layers and add a dashed pencil line just inside each edge. You have drawn a running stitch.',
    interestTag: 'Picture books',
    related: ['Appliqué', 'Running stitch', 'Soft shadows'],
  },
};
