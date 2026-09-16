// Isolated UI smoke test: real panel and project model, supplied engine states, no inference.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('artifacts/melos-generation-ui');
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'index.html'), '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./preview.tsx"></script></body></html>');
await writeFile(path.join(dir, 'preview.tsx'), `
import React from 'react'; import { createRoot } from 'react-dom/client';
import GenerationPanel from '../../components/melos/beats/composer/GenerationPanel';
import { newGrooveDoc } from '../../services/melos/beats/grooveDoc';
import './preview.css';
const engines = [
 {id:'ace-step',name:'ACE-Step 1.5',kinds:['audio','sample'],access:{allowed:true,reason:'Admin evaluation only'}},
 {id:'qwen-score',name:'Qwen3 score composer',kinds:['midi'],access:{allowed:true,reason:'Admin evaluation only'}},
 {id:'yue2',name:'YuE2',kinds:['audio','midi'],access:{allowed:false,reason:'Written evaluation permission pending'}},
 {id:'basic-pitch',name:'Basic Pitch',kinds:['transcribe'],access:{allowed:false,reason:'Browser model'}},
];
createRoot(document.getElementById('root')!).render(<div style={{height:'100vh',display:'flex',justifyContent:'flex-end',background:'#0c0812',fontFamily:'sans-serif'}}><GenerationPanel doc={newGrooveDoc('preview')} engines={engines as any} startBeats={8} initialDestination="timeline" onClose={()=>{}} onInsert={async()=>{}} /></div>);
`);
await writeFile(path.join(dir, 'preview.css'), '@import "tailwindcss" source(none); @source "../../components/melos/beats/composer/GenerationPanel.tsx"; body { margin: 0; }');
const server = await createServer({ configFile: false, plugins: [react(), tailwind()], server: { host: '127.0.0.1', port: 4319, strictPort: true, watch: { ignored: ['**/artifacts/melos-runtime/**'] } }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react'] } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Preview page:', error.message); });
  await page.goto('http://127.0.0.1:4319/artifacts/melos-generation-ui/index.html');
  await page.getByRole('heading', { name: 'Generate', exact: true }).waitFor();
  await page.getByLabel('Describe the sound').fill('A gentle four-bar piano melody');
  await page.screenshot({ path: path.join(dir, 'audio.png'), fullPage: true });
  await page.locator('select').nth(1).selectOption('yue2');
  if (!await page.getByRole('button', { name: 'Generate & insert', exact: true }).isDisabled()) throw new Error('YuE2 permission gate missing');
  await page.locator('select').nth(0).selectOption('midi');
  await page.locator('select').nth(1).selectOption('qwen-score');
  await page.locator('select').nth(2).selectOption('glass');
  await page.screenshot({ path: path.join(dir, 'midi-glass.png'), fullPage: true });
  await page.locator('select').nth(0).selectOption('sample');
  await page.locator('select').nth(1).selectOption('ace-step');
  await page.screenshot({ path: path.join(dir, 'sample.png'), fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Panel renders; audio/MIDI/sample controls and YuE2 disabled state verified. Screenshots:', dir);
} finally { await browser.close(); await server.close(); }
