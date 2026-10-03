// scripts/generateTutorialPack.mjs
// Automated Feature Tutorial Builder: captures pixel-perfect screenshots with SVG spotlight markups & callout arrows.
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const OUTPUT_BASE_DIR = path.resolve('public/tutorials');

// ── Shared Tailwind & Typography Header ───────────────────────────────────────
const htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <style>
    * { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="bg-[#0A0711] text-white p-0 m-0 overflow-hidden antialiased">`;

const htmlFooter = `</body></html>`;

// ── Feature Step Frame Generator ──────────────────────────────────────────────
function generateStepHtml(feature, step) {
  const markupsHtml = step.markups.map(m => {
    if (m.shape === 'spotlight-rect' || m.shape === 'spotlight-circle') {
      const isCircle = m.shape === 'spotlight-circle';
      const color = m.color || '#ff8c00';
      return `
        <div style="position: absolute; left: ${m.x}%; top: ${m.y}%; width: ${m.width || 30}%; height: ${m.height || 30}%; border: 3px solid ${color}; ${isCircle ? 'border-radius: 9999px;' : 'border-radius: 1.5rem;'}; box-shadow: 0 0 35px ${color}88, inset 0 0 20px ${color}33; z-index: 30; pointer-events: none;">
          ${m.label ? `<span style="position: absolute; top: -14px; left: 18px; background: ${color}; color: #000; font-size: 11px; font-weight: 900; text-transform: uppercase; padding: 2px 10px; border-radius: 6px; letter-spacing: 0.1em; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">${m.label}</span>` : ''}
        </div>
      `;
    }
    if (m.shape === 'arrow') {
      return `
        <div style="position: absolute; left: ${m.x}%; top: ${m.y}%; z-index: 40; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; pointer-events: none;">
          <div style="background: #ff8c00; color: #000; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 6px 14px; border-radius: 9999px; box-shadow: 0 0 25px rgba(255,140,0,0.8); border: 2px solid #ffffff; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
            <span>👉 ${m.label || 'Action Target'}</span>
          </div>
          <svg style="width: 28px; height: 28px; color: #ff8c00; filter: drop-shadow(0 0 8px #ff8c00); margin-top: 4px;" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
          </svg>
        </div>
      `;
    }
    if (m.shape === 'pulse-badge') {
      const color = m.color || '#10b981';
      return `
        <div style="position: absolute; left: ${m.x}%; top: ${m.y}%; z-index: 40; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 8px; pointer-events: none;">
          <div style="width: 20px; height: 20px; border-radius: 9999px; background: ${color}; border: 3px solid #fff; box-shadow: 0 0 20px ${color};"></div>
          ${m.label ? `<div style="background: ${color}dd; color: #fff; font-size: 11px; font-weight: 900; text-transform: uppercase; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); box-shadow: 0 4px 16px rgba(0,0,0,0.5);">${m.label}</div>` : ''}
        </div>
      `;
    }
    return '';
  }).join('');

  return `
${htmlHeader}
<div class="w-[1280px] h-[720px] bg-[#090613] p-8 flex flex-col justify-between relative overflow-hidden">
  <!-- Ambient Backdrop -->
  <div class="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[#ff8c00]/15 rounded-full blur-[140px] pointer-events-none"></div>
  <div class="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-[#8b5cf6]/15 rounded-full blur-[130px] pointer-events-none"></div>

  <!-- Header Card -->
  <div class="relative z-10 flex items-center justify-between pb-4 border-b border-white/10 bg-white/[0.02] px-6 py-3 rounded-2xl">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl bg-[#ff8c00] flex items-center justify-center text-black font-black text-xs shadow-md shadow-orange-500/30">
        ${step.stepNumber}
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-black uppercase tracking-[0.25em] text-[#ff8c00]">${feature.moduleName}</span>
          <span class="text-white/30 text-xs">•</span>
          <span class="text-xs font-bold text-white/50">${feature.featureName}</span>
        </div>
        <h1 class="text-xl font-black uppercase tracking-tight text-white">${step.title}</h1>
      </div>
    </div>
    <div class="flex items-center gap-2">
      ${(step.badges || []).map(b => `<span class="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-emerald-400">${b}</span>`).join('')}
      ${step.hotkey ? `<span class="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-[10px] font-mono text-purple-300 font-bold">Hotkey: ${step.hotkey}</span>` : ''}
    </div>
  </div>

  <!-- Main Viewport Canvas with Markups -->
  <div class="relative flex-1 my-4 rounded-2xl bg-[#0e091d] border border-white/10 overflow-hidden shadow-2xl">
    <!-- Mock UI Layout Skeleton -->
    <div class="absolute inset-0 p-6 flex flex-col opacity-30 select-none">
      <div class="flex items-center justify-between border-b border-white/10 pb-4">
        <div class="flex gap-2">
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
          <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div class="text-xs font-mono text-white/40 tracking-wider">[Live Studio Engine Active]</div>
      </div>
      <div class="flex-1 grid grid-cols-12 gap-4 pt-4">
        <div class="col-span-3 bg-white/5 rounded-xl p-4 flex flex-col gap-3">
          <div class="w-3/4 h-5 bg-white/10 rounded"></div>
          <div class="w-full h-8 bg-white/5 rounded"></div>
          <div class="w-5/6 h-8 bg-white/5 rounded"></div>
          <div class="mt-auto w-full h-10 bg-[#ff8c00]/20 border border-[#ff8c00]/40 rounded-xl"></div>
        </div>
        <div class="col-span-6 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-center p-8">
          <div class="text-center">
            <div class="w-20 h-20 rounded-full border-2 border-white/10 mx-auto flex items-center justify-center text-white/20 text-3xl font-black">P</div>
            <div class="mt-4 text-xs font-mono text-white/30 uppercase tracking-widest">${feature.featureName} Active Canvas</div>
          </div>
        </div>
        <div class="col-span-3 bg-white/5 rounded-xl p-4 flex flex-col gap-3">
          <div class="w-full h-5 bg-white/10 rounded"></div>
          <div class="w-full h-32 bg-white/5 rounded-lg border border-white/5"></div>
          <div class="w-full h-16 bg-white/5 rounded-lg"></div>
        </div>
      </div>
    </div>

    <!-- Render Vector Markups -->
    ${markupsHtml}
  </div>

  <!-- Instruction Footer Bar -->
  <div class="relative z-10 px-6 py-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <span class="text-xs font-black uppercase tracking-widest text-[#ff8c00]">Instruction:</span>
      <p class="text-sm font-medium text-white/80">${step.instruction}</p>
    </div>
    <div class="text-xs font-mono font-bold text-white/40">
      Step ${step.stepNumber} // Plajah Automated Tutorial
    </div>
  </div>
</div>
${htmlFooter}`;
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function run() {
  console.log('🚀 Initializing Plajah Automated Feature Tutorial Generator...');

  const { TUTORIAL_REGISTRY } = await import('../services/tutorial/tutorialRegistry.js').catch(async () => {
    // If running under tsx / Node ESM
    return await import('../services/tutorial/tutorialRegistry.ts');
  });

  const features = Object.values(TUTORIAL_REGISTRY);
  console.log(`📦 Loaded ${features.length} feature tutorial definitions.`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

    for (const feature of features) {
      const featDir = path.join(OUTPUT_BASE_DIR, feature.featureId);
      fs.mkdirSync(featDir, { recursive: true });

      console.log(`\n📸 Generating tutorial pack for: ${feature.featureName} (${feature.featureId})`);

      for (const step of feature.steps) {
        const stepHtml = generateStepHtml(feature, step);
        await page.setContent(stepHtml, { waitUntil: 'networkidle0' });

        const imagePath = path.join(featDir, `step-${step.stepNumber}.png`);
        await page.screenshot({ path: imagePath, type: 'png' });
        console.log(`  ✓ Rendered step ${step.stepNumber}: ${imagePath}`);
      }

      // Write metadata manifest
      fs.writeFileSync(
        path.join(featDir, 'manifest.json'),
        JSON.stringify(feature, null, 2),
        'utf8'
      );
      console.log(`  ✓ Manifest saved: ${path.join(featDir, 'manifest.json')}`);
    }

    console.log('\n✨ All feature tutorial packs generated successfully!');
  } finally {
    await browser.close();
  }
}

// Allow direct CLI execution
run().catch(err => {
  console.error('❌ Tutorial generation failed:', err);
  process.exit(1);
});
