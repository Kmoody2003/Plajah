// Node-side helper: bundles the render entry with esbuild and opens it in headless Chromium (Playwright, already a repo dependency).
// Returns null when no Chromium is available so the offline-render tests can skip honestly instead of failing.

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RenderPage { page: any; call<T = any>(expr: string): Promise<T>; close(): Promise<void>; consoleErrors: string[] }

export async function openRenderPage(): Promise<RenderPage | null> {
  let chromium: any;
  try { ({ chromium } = await import('playwright')); } catch { return null; }
  const out = path.join(os.tmpdir(), `living-audio-render-${process.pid}.js`);
  await build({
    entryPoints: [path.resolve('tests/support/livingAudioRender.entry.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
    outfile: out, logLevel: 'silent', sourcemap: false,
  });
  let browser: any;
  try {
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  } catch { try { fs.unlinkSync(out); } catch { /* ignore */ } return null; }
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('pageerror', (e: Error) => consoleErrors.push(String(e)));
  page.on('console', (m: any) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto('about:blank');
  await page.addScriptTag({ content: fs.readFileSync(out, 'utf8') });
  return {
    page, consoleErrors,
    call: (expr: string) => page.evaluate(`(async () => { return await (${expr}); })()`),
    close: async () => { await browser.close(); try { fs.unlinkSync(out); } catch { /* ignore */ } },
  };
}
