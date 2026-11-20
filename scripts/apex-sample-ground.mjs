// Sample the drawn ground (hAt, metres; < 2.5 is water) on a grid in the running game and save it, for planning layouts off-line.
// usage: APEX_URL=http://127.0.0.1:4333 node scripts/apex-sample-ground.mjs out.json x0 x1 z0 z1 step
import {chromium} from 'playwright';
import fs from 'node:fs';
const [out, x0, x1, z0, z1, step] = [process.argv[2], ...process.argv.slice(3).map(Number)];
const browser = await chromium.launch({args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 800, height: 450}});
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4333') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.countryShots, null, {timeout: 300000, polling: 1000});
const g = await page.evaluate(([x0, x1, z0, z1, step]) => {
  const R = window.regionViewer, rows = [];
  for (let z = z0; z <= z1; z += step) { const row = []; for (let x = x0; x <= x1; x += step) row.push(+R.hAt(x, z).toFixed(1)); rows.push(row); }
  return rows;
}, [x0, x1, z0, z1, step]);
fs.writeFileSync(out, JSON.stringify({x0, x1, z0, z1, step, h: g}));
console.log('rows', g.length, 'cols', g[0].length);
await browser.close();
