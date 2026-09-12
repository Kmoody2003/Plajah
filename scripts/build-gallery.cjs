// build-gallery.cjs — Extracts shader data and generates a WORKING live WebGL gallery
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Kenne/plajah';
const PRESET_DIR = path.join(ROOT, 'components/plajahPixels/engine/presets');

// ── Extract Kit Code ──
const sigSrc = fs.readFileSync(path.join(PRESET_DIR, 'signatureShaders.ts'), 'utf-8');

function extractQuotedString(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return '';
  let i = start + marker.length;
  let chars = [];
  while (i < src.length) {
    if (src[i] === '\\' && i + 1 < src.length) {
      const next = src[i+1];
      if (next === 'n') { chars.push('\n'); i += 2; continue; }
      if (next === 't') { chars.push('\t'); i += 2; continue; }
      if (next === '"') { chars.push('"'); i += 2; continue; }
      if (next === "'") { chars.push("'"); i += 2; continue; }
      if (next === '\\') { chars.push('\\'); i += 2; continue; }
      chars.push(next); i += 2; continue;
    }
    if (src[i] === '"') break;
    chars.push(src[i]); i++;
  }
  return chars.join('');
}

let KIT = extractQuotedString(sigSrc, 'export const SIGNATURE_KIT = "');
let KIT3D = extractQuotedString(sigSrc, 'export const SIGNATURE_KIT_3D = "');

// Keep texture() as-is — WebGL2 / GLSL 300 es uses texture(), not texture2D()

console.log(`KIT: ${KIT.length} chars, KIT3D: ${KIT3D.length} chars`);

// ── Parse Shader Files ──
const files = ['seriesVII_atelier.ts','seriesVII_manifesto.ts','seriesVII_phosphor.ts','seriesVII_salon.ts'];

function parseShaderFile(filePath, fileName) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const results = [];
  
  // Find the array start
  const arrStart = src.indexOf('[');
  if (arrStart < 0) return results;
  
  // Find each object by tracking braces at depth 1 (inside the array)
  let depth = 0;
  let objStart = -1;
  let objects = [];
  
  for (let i = arrStart + 1; i < src.length; i++) {
    const ch = src[i];
    // Skip strings
    if (ch === '"' || ch === "'" || ch === '`') {
      const delim = ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === delim) break;
        i++;
      }
      continue;
    }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        objects.push(src.substring(objStart, i + 1));
        objStart = -1;
      }
    }
  }
  
  for (const obj of objects) {
    const idM = obj.match(/id:\s*['"]([^'"]+)['"]/);
    const nM = obj.match(/\bn:\s*(\d+)/);
    const nameM = obj.match(/name:\s*['"]([^'"]+)['"]/);
    const setM = obj.match(/\bset:\s*['"]([^'"]+)['"]/);
    const kit3dM = obj.match(/kit3d:\s*(true|false)/);
    const lineM = obj.match(/line:\s*['"]([^'"]+)['"]/);
    
    if (!idM) continue;
    
    // Extract body string
    let body = '';
    const bodyIdx = obj.indexOf('body:');
    if (bodyIdx < 0) continue;
    
    let bi = bodyIdx + 5;
    while (bi < obj.length && /\s/.test(obj[bi])) bi++;
    const delim = obj[bi];
    
    if (delim === '`') {
      // Template literal
      bi++;
      let endIdx = obj.indexOf('`', bi);
      body = obj.substring(bi, endIdx);
    } else if (delim === '"' || delim === "'") {
      // Escaped string
      bi++;
      let chars = [];
      while (bi < obj.length) {
        if (obj[bi] === '\\' && bi + 1 < obj.length) {
          const next = obj[bi+1];
          if (next === 'n') { chars.push('\n'); bi += 2; continue; }
          if (next === 't') { chars.push('\t'); bi += 2; continue; }
          if (next === '"') { chars.push('"'); bi += 2; continue; }
          if (next === "'") { chars.push("'"); bi += 2; continue; }
          if (next === '\\') { chars.push('\\'); bi += 2; continue; }
          chars.push(next); bi += 2; continue;
        }
        if (obj[bi] === delim) break;
        chars.push(obj[bi]); bi++;
      }
      body = chars.join('');
    }
    
    if (!body) continue;
    
    // Keep texture() as-is for WebGL2
    
    results.push({
      id: idM[1],
      n: nM ? parseInt(nM[1]) : 0,
      name: nameM ? nameM[1] : idM[1],
      set: setM ? setM[1] : 'unknown',
      kit3d: kit3dM ? kit3dM[1] === 'true' : false,
      line: lineM ? lineM[1] : '',
      body: body,
    });
  }
  return results;
}

let shaders = [];
for (const f of files) {
  const parsed = parseShaderFile(path.join(PRESET_DIR, f), f);
  shaders = shaders.concat(parsed);
  console.log(`${f}: ${parsed.length} shaders`);
}
console.log(`\nTotal: ${shaders.length} shaders`);
shaders.forEach(s => console.log(`  #${s.n} ${s.id} [${s.set}] kit3d:${s.kit3d} body:${s.body.split('\n').length}lines`));

// ── Lottie Catalog ──
let lottieCatalog = [];
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/fabula/lottie/catalog.json'), 'utf-8'));
  lottieCatalog = raw.assets || raw || [];
  if (!Array.isArray(lottieCatalog)) lottieCatalog = [];
} catch(e) { console.error('Lottie:', e.message); }
console.log(`\nLottie: ${lottieCatalog.length} assets`);

// ── Generate HTML ──
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Plajah — Live Shader + Lottie Gallery</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=JetBrains+Mono:wght@400&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#08080d;--card:#111118;--border:#1c1c2a;--accent:#D40055;--cyan:#00DAF3;--purple:#6B0099}
body{background:var(--bg);color:#ddd;font-family:'Inter',sans-serif}
header{padding:2.5rem 2rem 1rem;text-align:center}
header h1{font-size:2.6rem;font-weight:800;
  background:linear-gradient(135deg,var(--accent),var(--purple),var(--cyan));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
header p{color:#666;font-size:0.9rem;margin-top:0.3rem}
.stats{display:flex;justify-content:center;gap:2rem;padding:0.75rem;margin:0.5rem 2rem 1rem;
  background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid var(--border)}
.stat .n{font-family:'JetBrains Mono',monospace;font-size:1.6rem;font-weight:800;color:var(--cyan);text-align:center}
.stat .l{font-size:0.65rem;color:#555;text-transform:uppercase;letter-spacing:0.12em;text-align:center}
.sec{padding:1.5rem 2rem 0.5rem;display:flex;align-items:baseline;gap:0.8rem;border-top:1px solid #151520;margin-top:0.5rem}
.sec h2{font-size:1.3rem;font-weight:800;color:#fff}
.sec .t{font-family:'JetBrains Mono',monospace;font-size:0.65rem;padding:0.15rem 0.5rem;border-radius:5px;
  background:rgba(212,0,85,0.15);color:var(--accent);text-transform:uppercase;letter-spacing:0.1em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:1.25rem;padding:1rem 2rem 2rem}
.card{background:var(--card);border-radius:14px;overflow:hidden;border:1px solid var(--border);
  transition:border-color 0.3s,transform 0.2s,box-shadow 0.3s}
.card:hover{border-color:var(--accent);transform:translateY(-3px);box-shadow:0 8px 32px rgba(212,0,85,0.12)}
.card canvas{width:100%;aspect-ratio:16/9;display:block;cursor:pointer;background:#000}
.card .m{padding:0.6rem 1rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap}
.card .m .nm{font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--accent);
  background:rgba(212,0,85,0.1);padding:0.12rem 0.4rem;border-radius:4px}
.card .m h3{font-size:0.9rem;font-weight:600;color:#eee;flex:1}
.card .m .sb{font-family:'JetBrains Mono',monospace;font-size:0.55rem;color:var(--cyan);
  background:rgba(0,218,243,0.1);padding:0.12rem 0.4rem;border-radius:4px;text-transform:uppercase}
.card .m .k3{font-size:0.55rem;color:#FFD166;background:rgba(255,209,102,0.12);
  padding:0.12rem 0.35rem;border-radius:3px}
.card .d{padding:0 1rem 0.7rem;font-size:0.75rem;color:#666;line-height:1.35}
.card .err{color:var(--accent);font-size:0.7rem;font-family:'JetBrains Mono',monospace;
  padding:0.5rem 1rem;background:rgba(212,0,85,0.05);white-space:pre-wrap;word-break:break-all;max-height:80px;overflow:auto}

.card.fs{position:fixed;inset:0;z-index:1000;border-radius:0;border:none;background:#000;display:flex;flex-direction:column}
.card.fs canvas{flex:1;aspect-ratio:unset;width:100%;height:100%}
.card.fs .m{position:absolute;bottom:0;left:0;right:0;background:rgba(8,8,13,0.85);backdrop-filter:blur(12px)}
.card.fs .d{display:none}
#esc{position:fixed;top:1rem;right:1rem;background:rgba(0,0,0,0.8);color:#aaa;
  padding:0.3rem 0.7rem;border-radius:6px;font-size:0.7rem;display:none;z-index:1001;
  border:1px solid #333;font-family:'JetBrains Mono',monospace}

.lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;padding:1rem 2rem 3rem}
.lc{background:var(--card);border-radius:12px;overflow:hidden;border:1px solid var(--border);
  padding:1rem;text-align:center;transition:border-color 0.3s,transform 0.2s}
.lc:hover{border-color:var(--cyan);transform:translateY(-2px)}
.lc dotlottie-player{width:100%;height:180px;border-radius:8px;background:#0a0a12}
.lc .ln{font-size:0.85rem;font-weight:600;margin-top:0.5rem;color:#ccc}
.lc .ld{font-size:0.7rem;color:#555;margin-top:0.2rem;line-height:1.3}
.lc .lcat{font-family:'JetBrains Mono',monospace;font-size:0.55rem;color:var(--purple);
  background:rgba(107,0,153,0.12);padding:0.1rem 0.4rem;border-radius:4px;display:inline-block;margin-top:0.35rem}
.lc .sw{display:flex;gap:3px;justify-content:center;margin-top:0.4rem}
.lc .sw div{width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,0.1)}

@media(max-width:900px){.grid{grid-template-columns:1fr}}
</style>
<script src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs" type="module"></script>
</head>
<body>
<header>
  <h1>Plajah Series VII + Motion Library</h1>
  <p>Live WebGL shaders · Lottie animations · Click any shader to fullscreen · ESC to exit</p>
</header>
<div class="stats">
  <div class="stat"><div class="n">${shaders.length}</div><div class="l">Live Shaders</div></div>
  <div class="stat"><div class="n">${lottieCatalog.length}</div><div class="l">Lottie Animations</div></div>
  <div class="stat"><div class="n">4</div><div class="l">Shader Sets</div></div>
  <div class="stat"><div class="n">18</div><div class="l">Art Directors</div></div>
</div>
<div id="esc">ESC to exit</div>

${['atelier','manifesto','phosphor','salon'].map(set => {
  const ss = shaders.filter(s => s.set === set);
  const titles = {atelier:'Atelier — Classical · Editorial · Ink',manifesto:'Manifesto — Brutalist · Minimal · Rebel',
    phosphor:'Phosphor — Electronic · Neon · Glass',salon:'Salon — Crossover Collaborations'};
  return `
<div class="sec"><h2>${titles[set]}</h2><span class="t">${ss.length} shaders</span></div>
<div class="grid">
${ss.map(s => `<div class="card" data-sid="${s.id}">
  <canvas id="c-${s.id}" width="840" height="472"></canvas>
  <div class="m"><span class="nm">#${s.n}</span><h3>${s.name}</h3><span class="sb">${s.set}</span>${s.kit3d?'<span class="k3">3D</span>':''}</div>
  <p class="d">${s.line}</p>
</div>`).join('')}
</div>`;
}).join('')}

<div class="sec"><h2>Fabula Lottie Library</h2><span class="t">${lottieCatalog.length} animations</span></div>
<div class="lgrid">
${lottieCatalog.map(a => `<div class="lc">
  <dotlottie-player src="${a.url}" autoplay loop mode="normal" speed="1" background="transparent"></dotlottie-player>
  <div class="ln">${a.name||a.id}</div>
  <div class="ld">${a.description||''}</div>
  <span class="lcat">${a.category||''}</span>
  <div class="sw">${(a.colors||[]).map(c=>'<div style="background:'+c+'"></div>').join('')}</div>
</div>`).join('')}
</div>

<script>
// ── GLSL Kit (WebGL 2.0 / GLSL ES 3.00) ──
const KIT = ${JSON.stringify(KIT)};
const KIT3D = ${JSON.stringify(KIT3D)};
const SHADERS = ${JSON.stringify(shaders.map(s=>({id:s.id,kit3d:s.kit3d,body:s.body})))};

const VERT = '#version 300 es\nin vec2 pos; void main(){gl_Position=vec4(pos,0,1);}';

function buildFrag(s) {
  // WebGL 2.0 / GLSL ES 3.00 — supports bitwise ops, integer types
  let src = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
  src += 'uniform float iTime;\n';
  src += 'uniform vec2 iResolution;\n';
  src += 'uniform vec4 iMouse;\n';
  src += 'uniform float iParam0, iParam1, iParam2, iParam3;\n';
  src += 'uniform sampler2D iChannel0;\n';
  src += 'out vec4 _fragOut;\n';
  src += KIT + '\n';
  if (s.kit3d) src += KIT3D + '\n';
  src += s.body + '\n';
  // Shadertoy -> WebGL 2.0 wrapper
  src += 'void main(){ vec4 fragColor; mainImage(fragColor, gl_FragCoord.xy); _fragOut = fragColor; }\n';
  return src;
}

function initGL(canvas, shader) {
  const gl = canvas.getContext('webgl2', {antialias:false});
  if (!gl) return null;
  
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VERT); gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error('VS:', gl.getShaderInfoLog(vs)); return null; }
  
  const fragSrc = buildFrag(shader);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSrc); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(fs);
    console.error(shader.id + ':', log);
    // Show error on card
    const card = canvas.closest('.card');
    if (card) {
      const errDiv = document.createElement('div');
      errDiv.className = 'err';
      errDiv.textContent = log.substring(0, 300);
      card.appendChild(errDiv);
    }
    return null;
  }
  
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(shader.id, 'link fail'); return null; }
  
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  
  // Audio texture: generate fake sine-based FFT + waveform
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,2,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(512*2*4));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  
  return { gl, prog, buf, tex, posLoc: gl.getAttribLocation(prog,'pos'),
    uTime: gl.getUniformLocation(prog,'iTime'), uRes: gl.getUniformLocation(prog,'iResolution'),
    uMouse: gl.getUniformLocation(prog,'iMouse'), uCh0: gl.getUniformLocation(prog,'iChannel0'),
    uP0: gl.getUniformLocation(prog,'iParam0'), uP1: gl.getUniformLocation(prog,'iParam1'),
    uP2: gl.getUniformLocation(prog,'iParam2'), uP3: gl.getUniformLocation(prog,'iParam3'),
    visible: false };
}

function updateAudio(ctx, t) {
  const d = new Uint8Array(512*2*4);
  // Row 0 (y=0.25): fake FFT — simulate music with multiple sine beats
  for (let i=0;i<512;i++){
    const f=i/512;
    // Fake beat at ~2Hz, harmonics, frequency falloff
    const beat = Math.pow(Math.max(0, Math.sin(t*6.28*2)), 4) * 0.3;
    const v = Math.max(0, Math.min(255,
      (0.35 + beat*Math.exp(-f*5) +
       Math.sin(t*2.3+f*8)*0.15 +
       Math.sin(t*3.7+f*15)*0.1*Math.exp(-f*2) +
       Math.sin(t*1.1)*0.15*Math.exp(-f*4) +
       Math.sin(t*0.7)*0.1) * 255));
    d[i*4]=v; d[i*4+1]=v; d[i*4+2]=v; d[i*4+3]=255;
  }
  // Row 1 (y=0.75): fake waveform
  for (let i=0;i<512;i++){
    const f=i/512;
    const v = Math.max(0, Math.min(255,
      (0.5 + Math.sin(t*4+f*25)*0.25 + Math.sin(t*7.3+f*10)*0.1 +
       Math.sin(t*2.1)*0.15*Math.sin(f*40)) * 255));
    d[(512+i)*4]=v; d[(512+i)*4+1]=v; d[(512+i)*4+2]=v; d[(512+i)*4+3]=255;
  }
  ctx.gl.bindTexture(ctx.gl.TEXTURE_2D, ctx.tex);
  ctx.gl.texImage2D(ctx.gl.TEXTURE_2D,0,ctx.gl.RGBA,512,2,0,ctx.gl.RGBA,ctx.gl.UNSIGNED_BYTE,d);
}

function render(ctx, canvas, t) {
  const gl = ctx.gl;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.useProgram(ctx.prog);
  updateAudio(ctx,t);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,ctx.tex);
  gl.uniform1i(ctx.uCh0,0);
  gl.uniform1f(ctx.uTime,t); gl.uniform2f(ctx.uRes,canvas.width,canvas.height);
  gl.uniform4f(ctx.uMouse,0,0,0,0);
  gl.uniform1f(ctx.uP0,0.35); gl.uniform1f(ctx.uP1,0.4);
  gl.uniform1f(ctx.uP2,0.3); gl.uniform1f(ctx.uP3,0.3);
  gl.bindBuffer(gl.ARRAY_BUFFER,ctx.buf);
  gl.enableVertexAttribArray(ctx.posLoc);
  gl.vertexAttribPointer(ctx.posLoc,2,gl.FLOAT,false,0,0);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}

// ── Init ──
const ctxMap = {};
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    const id = e.target.dataset?.sid;
    if (id && ctxMap[id]) ctxMap[id].visible = e.isIntersecting;
  });
}, {threshold:0.05, rootMargin:'300px'});

let compiled = 0, failed = 0;
SHADERS.forEach(s => {
  const canvas = document.getElementById('c-'+s.id);
  if (!canvas) return;
  const ctx = initGL(canvas, s);
  if (ctx) { ctxMap[s.id] = ctx; observer.observe(canvas.closest('.card')); compiled++; }
  else { failed++; }
});
console.log('Compiled: ' + compiled + ', Failed: ' + failed);

let t0 = performance.now();
(function loop(){
  const t = (performance.now()-t0)/1000;
  for (const id in ctxMap) if (ctxMap[id].visible) render(ctxMap[id], document.getElementById('c-'+id), t);
  requestAnimationFrame(loop);
})();

// ── Fullscreen ──
document.querySelectorAll('.card').forEach(card => {
  card.querySelector('canvas')?.addEventListener('click', () => {
    const was = card.classList.contains('fs');
    card.classList.toggle('fs');
    document.getElementById('esc').style.display = was?'none':'block';
    const c = card.querySelector('canvas');
    if (!was){c.width=window.innerWidth;c.height=window.innerHeight;}
    else{c.width=840;c.height=472;}
  });
});
document.addEventListener('keydown', e => {
  if(e.key==='Escape'){
    document.querySelectorAll('.card.fs').forEach(c=>{c.classList.remove('fs');const cv=c.querySelector('canvas');cv.width=840;cv.height=472;});
    document.getElementById('esc').style.display='none';
  }
});
window.addEventListener('resize',()=>{document.querySelectorAll('.card.fs canvas').forEach(c=>{c.width=innerWidth;c.height=innerHeight;});});
</script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'public/shader-gallery.html'), html);
console.log(`\nGallery: ${Math.round(html.length/1024)}KB -> public/shader-gallery.html`);
