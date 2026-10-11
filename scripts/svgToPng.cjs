// svgToPng — rasterize SVG files (proof pages) with headless Chrome: node scripts/svgToPng.cjs in.svg [out.png] [scale]
const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const [inp, outp = inp.replace(/\.svg$/, '.png'), scale = '1'] = process.argv.slice(2);
  const svg = fs.readFileSync(inp, 'utf8');
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const w = Math.ceil(+m[1]), h = Math.ceil(+m[2]);
  const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: +scale });
  await page.setContent(`<html><body style="margin:0;background:#888">${svg}</body></html>`);
  await page.screenshot({ path: outp, clip: { x: 0, y: 0, width: w, height: h } });
  await browser.close();
  console.log(outp);
})();
