// services/text/document — the paginated document layer (Writer today; Layout and Storybook next).
//
//   const env = documentEnv(textSystem, doc);           // the text system with the doc's stylesheet
//   await ensureDocumentResources(env, doc);             // fonts + hyphenation for every story
//   const layout = layoutDocument(env, doc);             // pages, tables, notes, headers, floats
//   const list = pageDisplayList(env, doc, layout.pages[0]);   // → SVG (displayListToSvgMarkup) or PDF
//
// See docs/tela/WRITER.md.

import type { TextSystem } from '../index';
import { ensureStoryResources } from '../layout/flow';
import type { LayoutEnv } from '../layout/paragraph';
import type { TextStory } from '../model';
import type { WriterDocument } from './types';

export * from './types';
export * from './defaults';
export * from './ops';
export * from './blocks';
export * from './display';
export * from './paginate';
export * from './render';

const envs = new WeakMap<object, WeakMap<object, LayoutEnv>>();
/** A LayoutEnv bound to the document's stylesheet (memoised so caches keep hitting). */
export function documentEnv(system: Pick<TextSystem, 'env'>, doc: Pick<WriterDocument, 'styles'>): LayoutEnv {
  let m = envs.get(system.env);
  if (!m) envs.set(system.env, (m = new WeakMap()));
  let e = m.get(doc.styles);
  if (!e) m.set(doc.styles, (e = { ...system.env, sheet: doc.styles }));
  return e;
}

/** Every story of a document: body, table cells, notes, headers and footers. */
export function allStories(doc: WriterDocument): TextStory[] {
  const out: TextStory[] = [];
  const add = (s: TextStory) => { out.push(s); for (const p of s.paragraphs) if (p.table) for (const r of p.table.rows) for (const c of r.cells) add(c.story); };
  add(doc.story);
  for (const n of Object.values(doc.notes)) add(n.story);
  for (const h of Object.values(doc.headerFooters)) add(h);
  return out;
}

export async function ensureDocumentResources(env: LayoutEnv, doc: WriterDocument): Promise<void> {
  const stories = allStories(doc);
  // One combined story keeps font/hyphenation loading to a single pass.
  await ensureStoryResources(env, { id: 'all', paragraphs: stories.flatMap(s => s.paragraphs.filter(p => !p.table)) });
}
export * from './revisions';
export * from './tables';
export * from './commands';
