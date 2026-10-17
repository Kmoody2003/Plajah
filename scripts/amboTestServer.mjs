import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.AMBO_TEST_PORT || 8788);
const TMP_DIR = path.join(ROOT, '.tmp-asr-test');
const WIN_SPEECH_WORKER = path.join(ROOT, 'scripts', 'winSpeechWorker.ps1');

await fsp.mkdir(TMP_DIR, { recursive: true });

// Load .env.local or .env
for (const envFile of ['.env.local', '.env']) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, envFile), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
    break;
  } catch { /* */ }
}

// Pre-warm local Node ONNX Whisper (`onnx-community/whisper-base`) on native C++ onnxruntime-node
let nodeAsrPromise = null;
let nodeAsrReady = false;
function getNodeAsr() {
  if (!nodeAsrPromise) {
    nodeAsrPromise = (async () => {
      const t0 = Date.now();
      console.log('[AmboTestServer] Loading local ONNX Whisper (onnx-community/whisper-base, q8) on native onnxruntime-node...');
      const { pipeline, env } = await import('@huggingface/transformers');
      env.localModelPath = path.join(ROOT, 'public', 'models');
      env.allowLocalModels = true;
      const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
        dtype: 'q8',
      });
      nodeAsrReady = true;
      console.log(`[AmboTestServer] Local ONNX Whisper ready in ${Date.now() - t0}ms`);
      return asr;
    })().catch(err => {
      console.error('[AmboTestServer] Local ONNX Whisper load failed:', err);
      nodeAsrPromise = null;
      throw err;
    });
  }
  return nodeAsrPromise;
}

void getNodeAsr();

/** Synthesize 16kHz 16-bit mono WAV using Windows System.Speech.Synthesis */
async function synthesizeSpeechWav(text) {
  const cleanText = String(text || '').trim().slice(0, 800);
  if (!cleanText) throw new Error('text required');
  const hash = crypto.createHash('sha1').update(cleanText).digest('hex').slice(0, 14);
  const wavPath = path.join(TMP_DIR, `tts_${hash}.wav`);
  try {
    const st = await fsp.stat(wavPath);
    if (st.size > 1000) return wavPath;
  } catch { /* generate */ }

  const escaped = cleanText.replace(/'/g, "''");
  const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile('${wavPath.replace(/'/g, "''")}', $fmt)
$synth.Speak('${escaped}')
$synth.Dispose()
`;
  await new Promise((resolve, reject) => {
    const p = spawn('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`PowerShell TTS exited with ${code}`)));
  });
  return wavPath;
}

/** Decode 16-bit PCM WAV buffer into Float32Array */
function decodeWavToFloat32(wavBuf) {
  let offset = 44;
  for (let i = 12; i < Math.min(wavBuf.byteLength - 8, 256); i++) {
    if (wavBuf[i] === 0x64 && wavBuf[i + 1] === 0x61 && wavBuf[i + 2] === 0x74 && wavBuf[i + 3] === 0x61) {
      offset = i + 8;
      break;
    }
  }
  if (wavBuf.byteLength <= offset) return new Float32Array(0);
  const sampleCount = Math.floor((wavBuf.byteLength - offset) / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const s = wavBuf.readInt16LE(offset + i * 2);
    out[i] = s / 32768;
  }
  return out;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Dynamic esbuild bundle for amboTestClient.ts (~100ms, no full build required!)
    if (pathname === '/amboTestClient.js') {
      const result = await esbuild.build({
        entryPoints: [path.join(ROOT, 'scripts', 'amboTestClient.ts')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        write: false,
        sourcemap: 'inline',
        define: {
          'process.env.NODE_ENV': '"development"',
          'global': 'globalThis',
        },
        plugins: [
          {
            name: 'browser-node-shims',
            setup(build) {
              build.onResolve({ filter: /^(fs|path|os|crypto|stream|react-native-fs)$/ }, args => ({
                path: args.path,
                namespace: 'node-shim',
              }));
              build.onLoad({ filter: /.*/, namespace: 'node-shim' }, () => ({
                contents: 'export default {};',
                loader: 'js',
              }));
            },
          },
        ],
      });
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(result.outputFiles[0].text);
      return;
    }

    // 2. Real-Time Windows Native SAPI Live Microphone SSE Stream (/api/ai/live-speech-stream)
    if (pathname === '/api/ai/live-speech-stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_SPEECH_WORKER, '-Mode', 'mic'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let buf = '';
      ps.stdout.on('data', chunk => {
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (t.startsWith('{') && t.endsWith('}')) {
            res.write(`data: ${t}\n\n`);
          }
        }
      });
      req.on('close', () => {
        try { ps.stdin.write('STOP\n'); } catch { /* */ }
        setTimeout(() => { try { ps.kill(); } catch { /* */ } }, 200);
      });
      return;
    }

    // 3. Real-Time WAV Speech Recognition SSE Stream (/api/ai/wav-speech-stream?text=...)
    if (pathname === '/api/ai/wav-speech-stream' && req.method === 'GET') {
      const text = url.searchParams.get('text') || 'Turn with me to Romans chapter 8 verse 28.';
      const wavPath = await synthesizeSpeechWav(text);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_SPEECH_WORKER, '-Mode', 'wav', '-WavPath', wavPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let buf = '';
      ps.stdout.on('data', chunk => {
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (t.startsWith('{') && t.endsWith('}')) {
            res.write(`data: ${t}\n\n`);
          }
        }
      });
      ps.on('close', () => {
        res.write(`data: {"type":"done"}\n\n`);
        res.end();
      });
      req.on('close', () => {
        try { ps.kill(); } catch { /* */ }
      });
      return;
    }

    // 4. Rolling window transcription (/api/ai/captions-window)
    if (pathname === '/api/ai/captions-window' && req.method === 'POST') {
      const t0 = Date.now();
      const body = await readJsonBody(req);
      const { audioBase64, kind = 'speech' } = body;
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'audioBase64 required' }));
        return;
      }

      const wavBuf = Buffer.from(audioBase64, 'base64');
      const float32 = decodeWavToFloat32(wavBuf);
      if (float32.length < 1600) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ captions: [], latencyMs: 0 }));
        return;
      }

      // For speech mode on Windows, use fast C# SAPI if WAV is valid, with Node ONNX Whisper fallback
      if (kind === 'speech' && process.platform === 'win32' && fs.existsSync(WIN_SPEECH_WORKER)) {
        const tmpWav = path.join(TMP_DIR, `win_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`);
        try {
          await fsp.writeFile(tmpWav, wavBuf);
          const finals = await new Promise((resolve) => {
            const arr = [];
            let lastPartial = '';
            const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_SPEECH_WORKER, '-Mode', 'wav', '-WavPath', tmpWav]);
            let b = '';
            ps.stdout.on('data', d => {
              b += d.toString('utf8');
              const lines = b.split(/\r?\n/);
              b = lines.pop() || '';
              for (const l of lines) {
                try {
                  const o = JSON.parse(l.trim());
                  if (o.type === 'final' && o.text) { arr.push(o.text); lastPartial = ''; }
                  else if (o.type === 'partial' && o.text) { lastPartial = o.text; }
                } catch { /* */ }
              }
            });
            ps.on('close', () => {
              if (!arr.length && lastPartial) arr.push(lastPartial);
              resolve(arr);
            });
            ps.on('error', () => resolve([]));
          });
          await fsp.rm(tmpWav, { force: true }).catch(() => {});
          const joined = finals.join(' ').trim();
          if (joined) {
            const latencyMs = Date.now() - t0;
            console.log(`[AmboTestServer] /api/ai/captions-window (win-sapi-speech, ${(float32.length / 16000).toFixed(2)}s) -> ${latencyMs}ms: "${joined}"`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              captions: [{ time: 0, text: joined }],
              engine: 'windows-sapi-scripture',
              kind,
              latencyMs,
            }));
            return;
          }
        } catch {
          await fsp.rm(tmpWav, { force: true }).catch(() => {});
        }
      }

      const asr = await getNodeAsr();
      const out = await asr(float32, { language: 'en', task: 'transcribe' });
      const text = String(out?.text || '').trim();
      const latencyMs = Date.now() - t0;
      console.log(`[AmboTestServer] /api/ai/captions-window (${kind}, ${(float32.length / 16000).toFixed(2)}s audio) -> ${latencyMs}ms: "${text}"`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        captions: text ? [{ time: 0, text }] : [],
        engine: 'node-whisper-onnx',
        kind,
        latencyMs,
      }));
      return;
    }

    // 5. On-demand Windows TTS WAV generator (/api/tts-wav?text=...)
    if (pathname === '/api/tts-wav' && req.method === 'GET') {
      const text = url.searchParams.get('text') || 'Turn with me to Romans chapter 8 verse 28. And we know that all things work together for good to them that love God.';
      const wavPath = await synthesizeSpeechWav(text);
      const stat = await fsp.stat(wavPath);
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(wavPath).pipe(res);
      return;
    }

    // 6. Health & status check
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        nodeAsrReady,
        modelPath: path.join(ROOT, 'public', 'models', 'onnx-community', 'whisper-base'),
      }));
      return;
    }

    // 7. Static file serving (/ambo-test.html, /public/*, /ort/*)
    let filePath = null;
    if (pathname === '/' || pathname === '/ambo-test.html') {
      filePath = path.join(ROOT, 'ambo-test.html');
    } else if (pathname.startsWith('/ort/')) {
      filePath = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist', pathname.slice(5));
    } else {
      const pubCandidate = path.join(ROOT, 'public', pathname);
      const rootCandidate = path.join(ROOT, pathname);
      if (fs.existsSync(pubCandidate) && fs.statSync(pubCandidate).isFile()) {
        filePath = pubCandidate;
      } else if (fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isFile()) {
        filePath = rootCandidate;
      }
    }

    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const stat = await fsp.stat(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${pathname}`);
  } catch (err) {
    console.error('[AmboTestServer] Request error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================================`);
  console.log(`  AMBO LIVE SIGNAL-CHAIN TEST HARNESS RUNNING ON:`);
  console.log(`  http://localhost:${PORT}/ambo-test.html`);
  console.log(`======================================================================\n`);
});
