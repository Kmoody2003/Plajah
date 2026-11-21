// Captures Project Firstlight screenshots for the Games catalog (public/games/screens/firstlight-*.jpg).
// Needs the Firstlight lab running: npx vite --config firstlight.vite.config.mjs --port 3110
//   node scripts/firstlight-shots.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3110';
const out = 'public/games/screens';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${base}/firstlight.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/firstlight-menu.jpg`, type: 'jpeg', quality: 82 });

await page.getByText('SOL League Simulation', { exact: false }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/firstlight-setup.jpg`, type: 'jpeg', quality: 82 });

// The kick-off button sits below the fold of the setup sheet; Space is its keyboard shortcut.
await page.keyboard.press('Space');
await page.waitForTimeout(12000);
await page.screenshot({ path: `${out}/firstlight-snap.jpg`, type: 'jpeg', quality: 82 });

await browser.close();
console.log('saved firstlight-menu, firstlight-setup, firstlight-snap');
