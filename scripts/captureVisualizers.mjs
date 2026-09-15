import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = 'C:\\Users\\Kenne\\.gemini\\antigravity\\brain\\abf24b6f-d434-4cf0-898d-3e180448494e';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log(`[BROWSER ${m.type()}]`, m.text()));
  page.on('pageerror', e => console.error('[PAGEERROR]', e.message));

  console.log('Navigating to flux gallery...');
  await page.goto('http://localhost:3000/flux-gallery.html');
  await page.waitForFunction(() => window.fluxProof, { timeout: 30000 });

  const scenes = ['field', 'lattice', 'tunnel', 'aurora', 'sanctum'];
  const audio = { bass: 0.85, mid: 0.65, treble: 0.75, level: 0.8, beat: 1.0 };

  for (const scene of scenes) {
    console.log(`Rendering Flux scene: ${scene}...`);
    const dataUrl = await page.evaluate(async ({ scene, audio }) => {
      await window.fluxProof.renderFlux({ scene }, 1280, 720, 2.0, audio);
      const canvas = await window.fluxProof.renderFlux({ scene }, 1280, 720, 3.5, audio);
      return canvas ? canvas.toDataURL('image/png') : null;
    }, { scene, audio });

    if (dataUrl) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const filePath = path.join(outDir, `flux_${scene}.png`);
      await writeFile(filePath, Buffer.from(base64Data, 'base64'));
      console.log(`Saved screenshot: flux_${scene}.png`);
    } else {
      console.error(`Failed to render flux_${scene}`);
    }
  }
} catch (err) {
  console.error('Error during capture:', err);
} finally {
  await browser.close();
}
