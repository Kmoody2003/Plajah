// /opt/plajah-live/auth.mjs — Livewire origin gate. MediaMTX (authMethod: http) asks this before
// every publish/read. Mirrors services/livewire/token.ts decideOriginAuth (keep the two in step),
// plus the 'src' passthrough rung: the broadcaster's single stream, used before the GPU ladder ships.
//   node auth.mjs                         → serve on 127.0.0.1:9100
//   node auth.mjs mint <streamId> [hours] → print a publish token (testing / manual OBS)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const SECRET = process.env.LIVEWIRE_SECRET || '';
const PULL = process.env.LIVE_PULL_SECRET || '';
if (SECRET.length < 32) { console.error('LIVEWIRE_SECRET must be at least 32 characters'); process.exit(1); }

const STREAM_ID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const RUNG_RE = /^(src|1080p|720p|480p|360p|av1_1080p|av1_720p|audio)$/;
const LOCAL_IP = /^(127\.|::1$|::ffff:127\.)/;
const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (p) => createHmac('sha256', SECRET).update(p).digest();
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

function mint(streamId, uid, expiresAt) {
  if (!STREAM_ID_RE.test(streamId)) throw new Error('bad stream id');
  const payload = b64u(JSON.stringify({ s: streamId, u: uid, e: Math.floor(expiresAt) }));
  return `${payload}.${b64u(sign(payload))}`;
}

function verify(token) {
  const dot = (token || '').indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const want = sign(payload);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof p.s !== 'string' || typeof p.u !== 'string' || typeof p.e !== 'number') return null;
    if (p.e < Date.now() / 1000) return null;
    return { streamId: p.s, uid: p.u, expiresAt: p.e };
  } catch { return null; }
}

function decide(req) {
  const path = (req.path || '').replace(/^\/+/, '');
  const m = path.match(/^live\/([A-Za-z0-9_-]{6,128})\/([a-z0-9_]+)$/);
  if (req.action === 'publish') {
    if (!m || !RUNG_RE.test(m[2])) return false;
    const g = verify(req.password || req.token || '');
    return !!g && g.streamId === m[1];
  }
  if (req.action === 'read' || req.action === 'playback') {
    if (!m) return false;
    if (req.ip && LOCAL_IP.test(req.ip)) return true;
    const given = req.password || req.token || '';
    return !!PULL && !!given && eq(given, PULL);
  }
  return !!req.ip && LOCAL_IP.test(req.ip);
}

if (process.argv[2] === 'mint') {
  const id = process.argv[3]; const hours = Number(process.argv[4] || 6);
  console.log(mint(id, 'manual', Date.now() / 1000 + hours * 3600));
  process.exit(0);
}

createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy(); });
  req.on('end', () => {
    let r; try { r = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
    const ok = decide(r);
    if (r.action === 'publish' || !ok) console.log(`${ok ? 'allow' : 'deny'} ${r.action} ${r.path || '-'} ${r.ip || '-'} ${r.protocol || '-'}`);
    res.writeHead(ok ? 200 : 401).end();
  });
}).listen(9100, '127.0.0.1', () => console.log('livewire auth on 127.0.0.1:9100'));
