import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const server = await createServer({ configFile: 'scripts/halloween/preview.config.mjs' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${server.resolvedUrls.local[0]}scripts/halloween/preview.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(20000);
  await mkdir('artifacts/ravencrest-review', { recursive: true });
  await page.screenshot({ path: 'artifacts/ravencrest-review/reference-initial.png' });
  const result = { errors, canvases: await page.locator('canvas').count(), text: (await page.locator('body').innerText()).slice(0, 1500) };
  await writeFile('artifacts/ravencrest-review/runtime.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await server.close();
}
