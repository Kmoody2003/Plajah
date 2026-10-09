// Accessibility readiness score (0-100) from EPUB Accessibility 1.1 style signals. This is a readiness hint for
// authors, NOT a conformance claim — real conformance needs a human audit (Ace by DAISY, Benetech's checklist).

import type { BookDraft, Finding } from './types';

export interface A11yInput {
  language: string;
  chapterCount: number;
  headingChapters: number;        // chapters that start with a real heading
  hasNav: boolean;                // EPUB nav / generated TOC
  imageCount: number;
  imagesWithAlt: number;
  declaredAltText: boolean;       // author attests alt text is present (for non-EPUB sources)
  features: string[];             // schema:accessibilityFeature values
  summary?: string;
  hasHazardDeclaration: boolean;
}

export interface A11yResult { score: number; items: { label: string; ok: boolean; weight: number; tip?: string }[]; findings: Finding[] }

export function scoreAccessibility(i: A11yInput): A11yResult {
  const noImages = i.imageCount === 0;
  const altOk = noImages || i.imagesWithAlt >= i.imageCount || i.declaredAltText;
  const items = [
    { label: 'Language declared', ok: !!i.language, weight: 20, tip: 'Set the book language so screen readers pick the right voice.' },
    { label: 'Logical reading order', ok: i.chapterCount > 0 && i.headingChapters >= Math.ceil(i.chapterCount * 0.8), weight: 20, tip: 'Start each chapter with a real heading (Heading 1/2 style), not bold text.' },
    { label: 'Navigable table of contents', ok: i.hasNav, weight: 20, tip: 'Plajah generates a TOC from your chapters; EPUB uploads need a nav document.' },
    { label: noImages ? 'No images to describe' : 'Images have alt text', ok: altOk, weight: 25, tip: 'Add a short description to each meaningful image.' },
    { label: 'Accessibility features declared', ok: i.features.length > 0 || !!i.summary, weight: 10, tip: 'Add an accessibility summary (e.g. "Text is reflowable; images have descriptions").' },
    { label: 'Hazards declared', ok: i.hasHazardDeclaration, weight: 5, tip: 'State flashing/motion/sound hazards, or "none".' },
  ];
  const score = Math.round(items.filter(x => x.ok).reduce((s, x) => s + x.weight, 0));
  const findings: Finding[] = [];
  if (!altOk) findings.push({ code: 'a11y.alt_text', severity: 'warning', area: 'accessibility', message: 'Some images lack alt text.', fix: 'Add alt text, or tick the alt-text attestation if you have added it in your source file.', mirrors: 'EPUB Accessibility 1.1 / EU Accessibility Act' });
  if (score < 50) findings.push({ code: 'a11y.low', severity: 'info', area: 'accessibility', message: `Accessibility readiness is ${score}/100.`, fix: 'Each missing item above is a quick fix, and accessible ebooks reach more readers.' });
  return { score, items, findings };
}

/** Score straight from a draft (live as the author fills in the Rights step). */
export function computeA11y(d: BookDraft): A11yResult {
  const chs = (d.manuscript?.chapters ?? []).filter(c => c.included && (c.kind ?? 'chapter') === 'chapter');
  const base = d.a11yBase;
  const withHeading = chs.filter(c => /<h[1-6]>/.test(c.html) || d.manuscript?.source !== 'epub').length;
  return scoreAccessibility({
    language: d.metadata.language, chapterCount: chs.length, headingChapters: withHeading,
    hasNav: base ? base.hasNav : chs.length > 0,            // non-EPUB sources get a generated TOC from the chapter list
    imageCount: base?.imageCount ?? 0, imagesWithAlt: base?.imagesWithAlt ?? 0,
    declaredAltText: d.metadata.accessibility.altTextDeclared,
    features: [...(base?.features ?? []), ...(d.metadata.accessibility.summary.trim() ? ['summary'] : [])],
    summary: d.metadata.accessibility.summary.trim() || base?.summary,
    hasHazardDeclaration: !!d.metadata.accessibility.summary.trim() || !!base?.features.length,
  });
}
