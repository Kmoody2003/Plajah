// docTemplates/preview — a structure page dressed in a theme, as SVG. Drawn by the same text
// engine and the same flourish code as the live page, so a library thumbnail is the page you get.
import type { TextSystem } from '../../text';
import { ensureStoryResources, layoutStory, type TextFrame } from '../../text/layout/flow';
import type { LayoutEnv } from '../../text/layout/paragraph';
import { layoutToSvgMarkup } from '../../text/render/svg';
import { pageFlourishSvg, styleFlourishSvg, themedMargins } from '../../text/document/theme';
import type { StyleSheet } from '../../text/model';
import { structureSetup, structureStory, themeStyleSheet, writerTheme } from './build';
import type { DocTheme, StructurePage } from './types';

const sheets = new WeakMap<DocTheme, StyleSheet>();
const envs = new WeakMap<object, WeakMap<StyleSheet, LayoutEnv>>();
function envFor(system: Pick<TextSystem, 'env'>, theme: DocTheme): LayoutEnv {
  let sheet = sheets.get(theme);
  if (!sheet) sheets.set(theme, (sheet = themeStyleSheet(theme)));
  let m = envs.get(system.env);
  if (!m) envs.set(system.env, (m = new WeakMap()));
  let e = m.get(sheet);
  if (!e) m.set(sheet, (e = { ...system.env, sheet }));
  return e;
}

export interface PagePreview { width: number; height: number; /** Inner SVG markup (no <svg> wrapper). */ markup: string; overflow: boolean; missing: number }

export async function previewPage(system: Pick<TextSystem, 'env' | 'engine'>, page: StructurePage, theme: DocTheme): Promise<PagePreview> {
  const env = envFor(system, theme);
  const story = structureStory(page);
  await ensureStoryResources(env, story);
  const setup = structureSetup(page);
  const wt = writerTheme(theme);
  const m = themedMargins(wt, setup.margins);
  const content = { x: m.left, y: m.top, width: setup.width - m.left - m.right, height: setup.height - m.top - m.bottom };
  const frames: TextFrame[] = [{ id: 'body', ...content, columns: setup.columns.count, gutter: setup.columns.gap }];
  const layout = layoutStory(env, story, frames);
  const markup = pageFlourishSvg(wt, { width: setup.width, height: setup.height, content }) + styleFlourishSvg(wt, layout, story, env.sheet.defaultParagraph) + layoutToSvgMarkup(system.engine, layout);
  return { width: setup.width, height: setup.height, markup, overflow: layout.overflow, missing: layout.missing.length };
}

export function previewSvg(p: PagePreview): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.width} ${p.height}" width="${p.width}" height="${p.height}">${p.markup}</svg>`;
}
