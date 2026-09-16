// templateLint — the objective half of template QA.
//
// Catches what a designer's eye catches on a proof: copy running off the page,
// placeholder text left in, missing ground, unknown fonts, palette-swap clones.
import type { TelaVectorObject } from '../../types';
import { fontKeysInStacks } from './telaFonts';

export interface LintIssue { severity: 'error' | 'warn'; message: string; objectLabel?: string }

const BANNED = [/lorem/i, /replace this/i, /your story/i, /add image/i, /placeholder/i, /dialogue goes here/i, /editable text/i];

export function lintPage(objects: TelaVectorObject[], W: number, H: number, opts: { minObjects?: number; maxObjects?: number; requireHeadline?: boolean } = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const min = opts.minObjects ?? 10, max = opts.maxObjects ?? 260;
  if (objects.length < min) issues.push({ severity: 'error', message: `Only ${objects.length} objects — a real page needs at least ${min}` });
  if (objects.length > max) issues.push({ severity: 'warn', message: `${objects.length} objects — heavy for a template (limit ${max})` });
  const ground = objects[0];
  if (!ground || ground.kind !== 'RECT' || ground.x > 0 || ground.y > 0 || ground.x + ground.w < W || ground.y + ground.h < H) issues.push({ severity: 'error', message: 'First object must be a full-page ground RECT' });
  let headline = false;
  for (const o of objects) {
    if (o.kind === 'TEXT') {
      const size = o.fontSize || 24;
      if (size >= 34) headline = true;
      if (o.x < -1 || o.y < -1 || o.x + o.w > W + 1 || o.y + o.h > H + 1) issues.push({ severity: 'error', message: `Text runs off the page (${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}×${Math.round(o.h)})`, objectLabel: o.objectLabel || o.text?.slice(0, 30) });
      if (!o.wrap && (o.text || '').length > 60 && !(o.text || '').includes('\n')) issues.push({ severity: 'warn', message: 'Long unwrapped text line', objectLabel: o.objectLabel || o.text?.slice(0, 30) });
      for (const re of BANNED) if (re.test(o.text || '')) issues.push({ severity: 'error', message: `Placeholder copy: "${(o.text || '').slice(0, 40)}"`, objectLabel: o.objectLabel });
      if (!fontKeysInStacks([o.fontFamily]).length) issues.push({ severity: 'warn', message: `Font stack not from telaFonts: ${o.fontFamily}`, objectLabel: o.objectLabel });
      if (size < 7) issues.push({ severity: 'warn', message: `Type too small to read (${size}px)`, objectLabel: o.objectLabel });
    } else if (o.kind !== 'LINE') {
      if (o.x + o.w < -W * .3 || o.y + o.h < -H * .3 || o.x > W * 1.3 || o.y > H * 1.3) issues.push({ severity: 'warn', message: 'Object entirely off the page', objectLabel: o.objectLabel });
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.w) || !Number.isFinite(o.h)) issues.push({ severity: 'error', message: 'Non-finite geometry', objectLabel: o.objectLabel });
    }
  }
  if (opts.requireHeadline && !headline) issues.push({ severity: 'warn', message: 'No headline-scale type (≥34px) on this page' });
  return issues;
}

/** Geometry fingerprint — two templates sharing one are palette swaps. */
export function pageSignature(objects: TelaVectorObject[]): string {
  return objects.map(o => `${o.kind}:${Math.round(o.x / 4)}:${Math.round(o.y / 4)}:${Math.round(o.w / 4)}:${Math.round(o.h / 4)}`).join('|');
}

export function formatIssues(name: string, issues: LintIssue[]): string {
  return issues.map(i => `  [${i.severity}] ${name}: ${i.message}${i.objectLabel ? ` — ${i.objectLabel}` : ''}`).join('\n');
}
