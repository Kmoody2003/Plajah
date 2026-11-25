// Lexicon perf probe: real rAF fps + GPU adapter in a headed Playwright Chromium (WebGPU). node scripts/lexicon/probe.mjs ["&query"]
import { chromium } from 'playwright';
const q = process.argv[2] ?? '';
const b = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--use-webgpu-power-preference=force-low-power', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || t.includes('[lexicon]')) console.log('[page]', t.slice(0, 160)); });
await p.goto('http://127.0.0.1:4392/?lexdebug' + q);
await p.waitForFunction(() => window.__lex && window.__lex.post && document.getElementById('startBtn').textContent === 'Begin', null, { timeout: 120000 });
const r = await p.evaluate(async () => {
  const a = await navigator.gpu?.requestAdapter(); const info = a?.info ? `${a.info.vendor} ${a.info.architecture} ${a.info.description}` : 'n/a';
  window.__lex.state.save.met.push('elder'); document.getElementById('startBtn').click();
  await new Promise((res) => setTimeout(res, 6000)); // warm-up: shader compiles and impostor bakes hitch the first seconds
  let n = 0, worst = 0, prev = performance.now(); const t0 = prev; await new Promise((res) => { const f = () => { const now = performance.now(); worst = Math.max(worst, now - prev); prev = now; n++; if (now - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return { info, fps: (n / ((performance.now() - t0) / 1000)).toFixed(1), worstMs: Math.round(worst), tris: window.__lex.state.budget.triangles, draws: window.__lex.state.budget.drawCalls };
});
console.log(q || '(default)', JSON.stringify(r));
await b.close();
