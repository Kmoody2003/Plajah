import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

const ARTIFACT_DIR = 'C:/Users/Kenne/.gemini/antigravity/brain/9b78b741-6715-4f68-8551-32743147f217';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function capture() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const htmlPath = path.resolve('live-tv-qr-preview.html');
  const fileUrl = pathToFileURL(htmlPath).href;

  console.log('Loading page:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'load' });

  // Wait 1s for canvas visualizer to render
  await new Promise(r => setTimeout(r, 1000));

  // 1. Full Player Overview with QR Bug in lower-left corner
  const fullPath = path.join(ARTIFACT_DIR, 'live_tv_qr_bug_preview.png');
  await page.screenshot({ path: fullPath });
  console.log('Captured full preview:', fullPath);

  // 2. High-res Close-up Zoom of the lower-left QR Bug
  const bugElement = await page.$('#channel-qr-bug');
  if (bugElement) {
    const zoomPath = path.join(ARTIFACT_DIR, 'live_tv_qr_bug_zoom.png');
    await bugElement.screenshot({ path: zoomPath });
    console.log('Captured zoom preview:', zoomPath);
  }

  // 3. Switch to Endless Hour CH 8.1 and capture
  await page.evaluate(() => changeChannel('8.1'));
  await new Promise(r => setTimeout(r, 600));

  const ch8Path = path.join(ARTIFACT_DIR, 'live_tv_qr_bug_channel_8_1.png');
  await page.screenshot({ path: ch8Path });
  console.log('Captured CH 8.1 preview:', ch8Path);

  // 4. Test Dissolve Off (fade-out state)
  await page.evaluate(() => toggleDissolveManual());
  // Wait 1.1s for 1000ms dissolve transition to complete
  await new Promise(r => setTimeout(r, 1100));

  const dissolvedPath = path.join(ARTIFACT_DIR, 'live_tv_qr_bug_dissolved.png');
  await page.screenshot({ path: dissolvedPath });
  console.log('Captured dissolved preview:', dissolvedPath);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

capture().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
