// services/text — the platform text engine (public API).
//
//   const text = await createTextSystem();                    // engine + fonts + stylesheet
//   await text.ensure(story);                                  // fonts, fallbacks, hyphenation
//   const layout = text.layout(story, [frameA, frameB]);       // threaded, columns, wrap
//   const svg = layoutToSvg(text.engine, layout);              // or drawLayout(ctx, …)
//   const hit = pointToPosition(layout, x, y);                 // editing geometry
//
// See docs/text/TEXT_ENGINE.md for the architecture, the wasm ABI and the model.

import { getTextEngine, type TextEngine } from './engine/wasm';
import { FontRegistry, type FontManifest } from './fonts/registry';
import type { ByteCache } from './fonts/cache';
import { defaultStyleSheet, type StyleSheet, type TextStory } from './model';
import { ensureStoryResources, layoutStory, type LayoutOptions, type StoryLayout, type TextFrame } from './layout/flow';
import type { LayoutEnv } from './layout/paragraph';

export * from './model';
export * from './convert';
export * from './engine/wasm';
export * from './fonts/registry';
export { sniffFontFormat, toSfnt, woffToSfnt } from './fonts/woff';
export { ensureHyphenation, hyphLangFor, LANGS as HYPHENATION_LANGS } from './hyphenation';
export * from './layout/geometry';
export * from './layout/flow';
export { prepareParagraph, composeParagraph, compositionCacheStats, clearCompositionCache, type LayoutEnv, type PreparedParagraph } from './layout/paragraph';
export * from './render/svg';
export * from './render/canvas';
export { OutlineCache, opsToSvg } from './render/outlines';
export * from './editing/caret';

export interface TextSystem {
  engine: TextEngine;
  fonts: FontRegistry;
  sheet: StyleSheet;
  env: LayoutEnv;
  /** Load fonts, script fallbacks and hyphenation for a story. */
  ensure(story: TextStory): Promise<void>;
  layout(story: TextStory, frames: TextFrame[], opts?: LayoutOptions): StoryLayout;
}

export async function createTextSystem(opts: { sheet?: StyleSheet; fallbackFamily?: string; preload?: string[]; cache?: ByteCache; manifest?: FontManifest; fetcher?: (url: string) => Promise<Uint8Array>; registerDom?: boolean } = {}): Promise<TextSystem> {
  const engine = await getTextEngine();
  const fonts = new FontRegistry(engine, { cache: opts.cache, manifest: opts.manifest, fetcher: opts.fetcher, registerDom: opts.registerDom });
  const sheet = opts.sheet ?? defaultStyleSheet();
  const fallbackFamily = opts.fallbackFamily ?? 'Inter';
  await fonts.ensure([fallbackFamily, ...(opts.preload ?? [])]);
  const env: LayoutEnv = { engine, fonts, sheet, fallbackFamily };
  return {
    engine, fonts, sheet, env,
    ensure: story => ensureStoryResources(env, story),
    layout: (story, frames, o) => layoutStory(env, story, frames, o),
  };
}
