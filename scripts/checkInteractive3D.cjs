const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(pathToFileURL(path.resolve('public/interactive-3d-ticket.html')).href);
  await page.waitForTimeout(1000);

  // Take screenshot of 3D Ticket Front
  await page.screenshot({ path: 'public/template-review-assets/interactive-3d-front.png' });

  // Flip card
  await page.locator('#btn-flip').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'public/template-review-assets/interactive-3d-back.png' });

  // Switch to Evite concept (Venetian Masquerade)
  await page.locator('[data-concept="masque"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'public/template-review-assets/interactive-3d-evite.png' });

  // Simulate Check-in
  await page.locator('#btn-checkin').click();
  await page.waitForTimeout(400);

  await browser.close();

  if (errors.length) {
    throw new Error('Browser errors detected:\n' + errors.join('\n'));
  }

  console.log('PASS: Interactive 3D Realtime E-Ticket verified with 0 errors.');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
