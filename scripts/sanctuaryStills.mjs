// sanctuaryStills — render Series VIII (Sanctuary Light) works to PNG with headless Chrome.
//   node scripts/sanctuaryStills.mjs [filter] [times=6,18]
// Bundles the TS presets with esbuild, draws each work through the same Shadertoy
// header shaderRenderer uses (WebGL2) with a synthetic "worship pad" audio texture
// (soft C-major chroma, gentle level), and writes:
//   .tela-proofs/sanctuary/<id>-t<sec>.png   one still per time
//   .tela-proofs/sanctuary/sheet.png         contact sheet (first time only)
// Exits non-zero and prints the GLSL log if any work fails to compile.
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const filter = process.argv[2] && process.argv[2] !== '*' ? process.argv[2] : '';
const times = (process.argv[3] || '6,18').split(',').map(Number);
const out = path.resolve('.tela-proofs/sanctuary');
fs.mkdirSync(out, { recursive: true });

const tmp = path.join(os.tmpdir(), `sanct-${Date.now()}.mjs`);
await build({ entryPoints: ['components/plajahPixels/engine/presets/sanctuaryShaders.ts'], bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'warning' });
const { SANCTUARY_WORKS } = await import(pathToFileURL(tmp).href);
const works = SANCTUARY_WORKS.filter(w => !filter || w.id.includes(filter) || w.name.toLowerCase().includes(filter.toLowerCase()));
if (!works.length) { console.error('no works match', filter); process.exit(1); }

const W = 960, H = 540;
const page_html = `<!doctype html><html><body style="margin:0;background:#000"><canvas id=c width=${W} height=${H}></canvas><script>
const HEADER = \`#version 300 es
precision highp float;
uniform vec3 iResolution; uniform float iTime; uniform float iTimeDelta; uniform int iFrame; uniform vec4 iMouse;
uniform sampler2D iChannel0; uniform float iBass, iMid, iTreble, iLevel; uniform float iParam0, iParam1, iParam2, iParam3;
out vec4 _frag;
\`;
const FOOT = \`
void main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); _frag = c; }\`;
const gl = document.getElementById('c').getContext('webgl2', { preserveDrawingBuffer: true });
const vs = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(vs, '#version 300 es\\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }'); gl.compileShader(vs);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
// synthetic worship pad: falling spectrum, C-major chroma in alpha
const px = new Uint8Array(512*2*4);
for (let x=0;x<512;x++){ const f = Math.round(200*Math.exp(-x/90)+20*Math.random()); const o=x*4; px[o]=px[o+1]=px[o+2]=f; px[o+3]=0;
  const o2=(512+x)*4; const w=128+Math.round(40*Math.sin(x*.2)); px[o2]=px[o2+1]=px[o2+2]=w; px[o2+3]=60; }
[[0,230],[4,190],[7,210],[11,60],[2,50],[9,70]].forEach(([pc,v])=>{ px[pc*4+3]=v; });
const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,512,2,0,gl.RGBA,gl.UNSIGNED_BYTE,px);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
window.renderWork = (src, t, params) => {
  const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, HEADER + src + FOOT); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return { error: gl.getShaderInfoLog(fs) };
  const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { error: gl.getProgramInfoLog(p) };
  gl.useProgram(p); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const u = n => gl.getUniformLocation(p, n);
  gl.uniform3f(u('iResolution'), ${W}, ${H}, 1); gl.uniform1f(u('iTime'), t); gl.uniform1f(u('iTimeDelta'), 1/60);
  gl.uniform1i(u('iFrame'), Math.floor(t*60)); gl.uniform4f(u('iMouse'),0,0,0,0); gl.uniform1i(u('iChannel0'), 2);
  gl.uniform1f(u('iBass'), .42); gl.uniform1f(u('iMid'), .35); gl.uniform1f(u('iTreble'), .2); gl.uniform1f(u('iLevel'), .38);
  ['iParam0','iParam1','iParam2','iParam3'].forEach((n,i)=>gl.uniform1f(u(n), params[i] ?? .5));
  gl.viewport(0,0,${W},${H}); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
  return { ok: true };
};
</script></body></html>`;
const htmlPath = path.join(os.tmpdir(), 'sanct-harness.html');
fs.writeFileSync(htmlPath, page_html);

const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--no-sandbox', '--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href);
let failed = 0;
const sheet = [];
for (const w of works) {
  for (const t of times) {
    const r = await page.evaluate((src, t) => window.renderWork(src, t, [.5, .5, .5, .5]), w.src, t);
    if (r.error) { failed++; console.error(`✖ ${w.id}: ${r.error}`); break; }
    const png = await (await page.$('#c')).screenshot({ type: 'png' });
    const file = path.join(out, `${w.id}-t${t}.png`);
    fs.writeFileSync(file, png);
    if (t === times[0]) sheet.push({ w, png });
    console.log(`✔ ${w.id} t=${t} → ${file}`);
  }
}
await browser.close();
if (sheet.length > 1) {
  const cols = 4, tw = 480, th = 270, lab = 26;
  const rows = Math.ceil(sheet.length / cols);
  const comps = [];
  for (let i = 0; i < sheet.length; i++) {
    const x = (i % cols) * (tw + 8), y = Math.floor(i / cols) * (th + lab + 8);
    comps.push({ input: await sharp(sheet[i].png).resize(tw, th).png().toBuffer(), left: x, top: y });
    const label = `<svg width="${tw}" height="${lab}"><text x="4" y="18" font-family="Segoe UI,Arial" font-size="15" fill="#eee">${i + 1}. ${sheet[i].w.name} · ${sheet[i].w.energy} · ${sheet[i].w.director}</text></svg>`;
    comps.push({ input: Buffer.from(label), left: x, top: y + th });
  }
  await sharp({ create: { width: cols * (tw + 8), height: rows * (th + lab + 8), channels: 3, background: '#0d0b10' } })
    .composite(comps).png().toFile(path.join(out, filter ? `sheet-${filter}.png` : 'sheet.png'));
  console.log('sheet →', path.join(out, filter ? `sheet-${filter}.png` : 'sheet.png'));
}
fs.rmSync(tmp, { force: true });
process.exit(failed ? 1 : 0);
