// Session Band voice picker — a small local page to audition each character's three ElevenLabs
// previews and pick the one that becomes their voice. "Use this voice" saves that preview in the
// ElevenLabs account (designBandVoices.ts --pick) and records it in elevenVoices.json. When you're
// done, render their lines with scripts/band/renderBandLines.ts (characters whose voice changed are
// re-rendered automatically).
//
//   npx tsx scripts/band/voicePicker.ts      → http://127.0.0.1:3199

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'scratch/band-voices');
const JSON_PATH = path.join(ROOT, 'services/melos/beats/band/character/elevenVoices.json');
const PORT = Number(process.env.PICKER_PORT) || 3199;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function page(): Promise<string> {
  const { VOICE_BRIEFS } = await import('../../services/melos/beats/band/character/voiceDesign');
  const saved: Record<string, { preview: number; name: string }> = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : {};
  let h = `<!doctype html><meta charset=utf-8><title>Band voice picker</title><style>
body{font:14px system-ui;background:#111;color:#eee;padding:16px 20px;max-width:960px;margin:auto}h3{margin:20px 0 4px}p{color:#aaa;margin:2px 0 8px;font-size:12px}
.who{display:flex;gap:14px;align-items:flex-start;margin-top:22px}.who img{width:132px;height:132px;border-radius:14px;object-fit:cover;flex:none;border:2px solid #333}.who h3{margin:0 0 4px}.row{display:flex;gap:10px;flex-wrap:wrap}.c{padding:8px;border:1px solid #333;border-radius:10px;display:flex;flex-direction:column;gap:6px}.c.s{border-color:#E86A33;background:#E86A3314}
button{background:#E86A33;color:#000;border:0;border-radius:6px;padding:5px 10px;font-weight:700;cursor:pointer}button:disabled{opacity:.4;cursor:default}.msg{color:#7DD3FC;font-size:12px;min-height:1em}</style>
<h2>Session Band voice picker</h2><p>Listen, then press <b>Use this voice</b> on the one you like — it becomes that character's voice in ElevenLabs. The outlined one is the current voice.</p>`;
  for (const b of VOICE_BRIEFS) {
    const cur = saved[b.id]?.preview;
    h += `<div class="who"><img src="/portrait/${b.id}.webp" alt="${esc(saved[b.id]?.name ?? b.id)}"><div><h3>${esc(saved[b.id]?.name ?? b.id)}</h3><p>${esc(b.prompt)}</p><div class="row">`;
    for (let n = 0; n < 3; n++) {
      if (!fs.existsSync(path.join(DIR, `${b.id}-${n}.mp3`))) continue;
      h += `<div class="c${n === cur ? ' s' : ''}" id="${b.id}-${n}">Preview ${n}${n === cur ? ' · current voice' : ''}<audio controls preload="none" src="/audio/${b.id}-${n}.mp3"></audio>
        <button ${n === cur ? 'disabled' : ''} onclick="pick('${b.id}',${n},this)">${n === cur ? 'In use' : 'Use this voice'}</button></div>`;
    }
    h += `</div><div class="msg" id="msg-${b.id}"></div></div></div>`;
  }
  h += `<script>async function pick(id,n,btn){const m=document.getElementById('msg-'+id);btn.disabled=true;m.textContent='Saving preview '+n+' as '+id+'\\'s voice…';
const r=await fetch('/pick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,n})});const j=await r.json();
if(!r.ok){m.textContent='Could not save: '+j.error;btn.disabled=false;return;}m.textContent='Saved — '+id+' now uses preview '+n+'.';
document.querySelectorAll('[id^="'+id+'-"]').forEach(el=>{const k=Number(el.id.split('-').pop());el.classList.toggle('s',k===n);const b=el.querySelector('button');b.disabled=k===n;b.textContent=k===n?'In use':'Use this voice';});}</script>`;
  return h;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(await page()); return; }
    const pic = req.url?.match(/^\/portrait\/([a-z]+)\.webp$/);
    if (req.method === 'GET' && pic) {
      const f = path.join(ROOT, 'public/band', `${pic[1]}.webp`);
      if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/webp' }); fs.createReadStream(f).pipe(res); return;
    }
    const m = req.url?.match(/^\/audio\/([a-z]+-\d)\.mp3$/);
    if (req.method === 'GET' && m) {
      const f = path.join(DIR, `${m[1]}.mp3`);
      if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); fs.createReadStream(f).pipe(res); return;
    }
    if (req.method === 'POST' && req.url === '/pick') {
      let body = ''; for await (const c of req) body += c;
      const { id, n } = JSON.parse(body || '{}');
      if (!/^[a-z]+$/.test(id) || ![0, 1, 2].includes(n)) { res.writeHead(400); res.end(JSON.stringify({ error: 'bad pick' })); return; }
      execFile(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'scripts/band/designBandVoices.ts', id, '--pick', String(n)], { cwd: ROOT, timeout: 120_000 }, (err, stdout, stderr) => {
        res.writeHead(err ? 500 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err ? { error: (stderr || String(err)).slice(0, 300) } : { ok: true, out: stdout.trim() }));
      });
      return;
    }
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Band voice picker: http://127.0.0.1:${PORT}`));
