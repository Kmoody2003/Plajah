import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

// Load .env / .env.local so Chora's Gemini API key is available
for (const envFile of ['.env.local', '.env']) {
  const full = path.join(process.cwd(), envFile);
  if (fs.existsSync(full)) {
    const content = fs.readFileSync(full, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

const geminiKey =
  process.env.GOOGLE_AI_API_KEY ||
  process.env.VITE_GOOGLE_AI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  '';

const genai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

/**
 * Chora's exact `transcribeAudioWindow` from `server.ts`:
 * Uses `gemini-3.6-flash` multimodal audio understanding to transcribe sung or spoken
 * vocals directly from full music mixes with 0.1s relative timestamps.
 */
async function transcribeAudioWindow(base64, mimeType, meta = {}) {
  if (!genai) throw new Error('Gemini API key not configured');
  const isSpeech = meta.kind === 'speech';
  const secs = Math.max(1, Math.round(Number(meta.windowSec) || 15));
  const title = String(meta.title || 'Worship Track').slice(0, 160);
  const artist = String(meta.artist || '').slice(0, 160);

  const prompt = `You are a precise audio transcription engine. This is a ${secs}-second EXCERPT clipped from "${title}"${artist ? ` by "${artist}"` : ''}.
Transcribe ${isSpeech ? 'every spoken phrase' : 'every sung or spoken line'} you can clearly hear in THIS excerpt.
Rules:
- Timestamps are RELATIVE TO THE START OF THIS EXCERPT: 0.0 is the clip's first sample. Precise to 0.1s.
- The clip is only ${secs} seconds long, so NO timestamp may be negative or exceed ${secs}.
- Each "text" entry is one natural ${isSpeech ? 'phrase or sentence clause (~6-15 words)' : 'line (~3-8 words)'}. Do not merge multiple lines.
- The clip may begin or end mid-line — still transcribe the partial lines you clearly hear.
- Do NOT invent, guess, or summarise. Only transcribe clearly audible words. If the clip is purely instrumental or silent, return [].
- Sort entries by ascending time.`;

  const response = await genai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [
      { inlineData: { data: base64, mimeType: mimeType || 'audio/wav' } },
      { text: prompt },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            time: { type: Type.NUMBER },
            text: { type: Type.STRING },
          },
          required: ['time', 'text'],
        },
      },
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  });

  const raw = response?.text || '[]';
  let arr = [];
  try {
    arr = JSON.parse(raw);
  } catch {
    const cut = raw.lastIndexOf('}');
    if (cut > 0) {
      try {
        arr = JSON.parse(raw.slice(0, cut + 1) + ']');
      } catch {
        arr = [];
      }
    }
  }
  const maxSec = Number(meta.windowSec) || secs;
  return Array.isArray(arr)
    ? arr
        .filter(
          c =>
            typeof c?.time === 'number' &&
            !Number.isNaN(c.time) &&
            typeof c?.text === 'string' &&
            c.text.trim() &&
            !/^[\s(\[♪]*(?:instrumental|music|silence|applause)[\s)\]♪]*$/i.test(c.text.trim()),
        )
        .map(c => ({
          time: Math.min(Math.max(0, c.time), maxSec),
          text: c.text.trim(),
        }))
    : [];
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // Chora Gemini Windowed Audio Caption Endpoint
  if (req.method === 'POST' && urlPath === '/api/ai/captions-window') {
    try {
      const chunks = [];
      let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > 25 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const { audioBase64, mimeType = 'audio/wav', title, artist, kind, windowSec = 15 } = body;
      if (!audioBase64) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'audioBase64 required' }));
        return;
      }
      const captions = await transcribeAudioWindow(audioBase64, mimeType, {
        title,
        artist,
        kind,
        windowSec,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ captions, engine: 'chora-gemini-3.6-flash' }));
    } catch (err) {
      console.error('[ChoraCaptionsServer] Error:', err?.message || err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message || err) }));
    }
    return;
  }

  let rel = urlPath === '/' ? '/worship-gallery.html' : urlPath;
  let fp = path.join(process.cwd(), rel);
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    fp = path.join(process.cwd(), 'public', rel);
  }

  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(fp).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

const PORT = Number(process.env.PORT) || 8787;
server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[WorshipGalleryServer] Serving on http://localhost:${PORT}/worship-gallery.html (Chora Gemini 3.6-Flash Audio ASR: ${Boolean(genai)})`,
  );
});
