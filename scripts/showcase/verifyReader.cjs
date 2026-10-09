// verifyReader: drive the REAL BookReader (reader-lab.html) with a REAL published picture book and assert that every way of turning
// a page works: Next/Prev buttons, ArrowRight/ArrowLeft, tap zones, and the table of contents page grid.
//   1) npx vite --config reader-lab.vite.config.mjs           (serves http://127.0.0.1:3150)
//   2) node scripts/showcase/verifyReader.cjs [albumId ...]   (default: all six showcase albums)
// Exit code 1 if anything fails. Added after a real bug: story text stored on an image-page chapter switched the reader into text mode,
// so buttons / taps / table of contents stopped moving the picture pages.
const { createRequire } = require('module'); const req = createRequire(process.cwd() + '/package.json');
const { chromium } = req('playwright');
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['moon-blanket', 'beep-block-street', 'orbit-party', 'little-fox-big-trees', 'below-the-blue', 'golden-thread'].map(x => `showcase_${x}`);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  let failed = 0;
  for (const id of IDS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`http://127.0.0.1:3150/reader-lab.html?id=${id}`, { waitUntil: 'commit', timeout: 240000 });
    await page.waitForSelector('img[alt="Page 1"]', { timeout: 240000 }).catch(() => {});
    const at = () => page.evaluate(() => { const m = document.body.innerText.match(/(\d+) \/ (\d+)/); return m ? { i: +m[1], n: +m[2] } : null; });
    const settle = () => page.waitForTimeout(1400);
    const results = [];
    const check = async (name, fn, expect) => { const before = await at(); await fn(); await settle(); const after = await at(); const ok = before && after && expect(before.i, after.i, after.n); results.push(`${ok ? 'ok  ' : 'FAIL'} ${name} (${before && before.i} -> ${after && after.i})`); if (!ok) failed++; };
    const first = await at();
    if (!first) { console.log(`${id}: FAIL reader did not show a page counter`); failed++; await page.close(); continue; }
    await check('Next button', () => page.locator('button:has(svg.lucide-chevron-right)').last().click(), (a, b) => b === a + 1);
    await check('ArrowRight', () => page.keyboard.press('ArrowRight'), (a, b) => b === a + 1);
    await check('tap zone right', () => page.mouse.click(1200 * 0.9, 900 * 0.45), (a, b) => b === a + 1);
    await check('tap zone left', () => page.mouse.click(1200 * 0.1, 900 * 0.45), (a, b) => b === a - 1);
    await check('ArrowLeft', () => page.keyboard.press('ArrowLeft'), (a, b) => b === a - 1);
    // table of contents: open, expect a thumbnail per page, jump to the last page
    const tocBtn = page.locator('button[title*="ontents" i], button[aria-label*="ontents" i]').first();
    if (await tocBtn.count()) await tocBtn.click(); await page.waitForTimeout(700);
    const thumbs = page.locator('button[aria-label^="Go to page"]'); const nT = await thumbs.count();
    const tocOk = nT === first.n; results.push(`${tocOk ? 'ok  ' : 'FAIL'} TOC shows a thumbnail per page (${nT} of ${first.n})`); if (!tocOk) failed++;
    if (nT) await check('TOC jump to last page', async () => { await thumbs.nth(nT - 1).click(); }, (a, b, n) => b === n);
    console.log(`${id}\n  ` + results.join('\n  '));
    await page.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall reader checks passed');
  process.exit(failed ? 1 : 0);
})();
