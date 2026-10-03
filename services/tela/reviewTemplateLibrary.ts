import { EVENT_REVIEW_TEMPLATES } from './eventTemplateCollection';
import { TICKER_REVIEW_TEMPLATES } from './tickerTemplateCollection';
import { REVIEW_PROMO_SUITES } from '../chora/promoTypes';
import type { TelaDesignTemplate } from './telaTemplateRegistry';
import { createTemplateLibrary, type LibraryStorage, type TemplatePreview } from './universalTemplateLibrary';

/** Review is a separate catalog. No new designs enter Tela's available template registry. */
export const reviewTemplates: TelaDesignTemplate[] = [...EVENT_REVIEW_TEMPLATES, ...TICKER_REVIEW_TEMPLATES].map(t => ({
  id: t.id, name: t.name, collection: 'POSTER', group: t.kind.toUpperCase(),
  tagline: t.description, description: t.description, palette: [...t.palette], fonts: [],
  width: t.width, height: t.height, frameKind: 'SCREEN', pages: [{ label: t.name, build: t.build }],
  lesson: { history: t.council.rationale, principle: t.description, tryThis: 'Review the design, motion, and sound together before approving installation.', interestTag: t.kind },
  tags: [...t.tags, 'motion', 'review'],
}));

export function createReviewTemplateLibrary(storage?: LibraryStorage) {
  const previewOverrides: Record<string, TemplatePreview[]> = {};
  for (const t of [...EVENT_REVIEW_TEMPLATES, ...TICKER_REVIEW_TEMPLATES]) {
    previewOverrides[`builtin:tela:${t.id}`] = [
      { kind: 'static', renderer: 'tela', sourceId: t.id },
      { kind: 'motion', renderer: 'tela-keyframes', sourceId: t.id, reducedMotion: 'static', recipe: t.motion },
      { kind: 'audio', source: 'synthesized-score', available: true, recipe: t.audio, label: 'Original synthesized preview score; enable sound to audition.' },
    ];
  }
  return createTemplateLibrary({ reviewTemplates, reviewPromos: REVIEW_PROMO_SUITES, storage, previewOverrides });
}
