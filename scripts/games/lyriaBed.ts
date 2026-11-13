/**
 * Lyria RealTime bed capture (Kith Quest film-score experiment, 2026-11-13). Kenne: "still retro gaming sounds … feel
 * like a score composed for a movie … you can use our generative models". Records `models/lyria-realtime-exp` steered
 * by weighted prompts, at the cue's tempo and scale, to a WAV for auditioning / layering under the Chora themes.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/games/lyriaBed.ts <out.wav> <seconds> <bpm> <SCALE> "<prompt>" ["<prompt2>:<weight>" ...]
 *   SCALE: a Lyria scale enum name, e.g. F_MAJOR_D_MINOR, D_MAJOR_B_MINOR
 */
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^(GEMINI_API_KEY|GOOGLE_AI_API_KEY)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY is not configured.');

const [out = 'lyria.wav', secs = '40', bpm = '108', scale = 'F_MAJOR_D_MINOR', ...prompts] = process.argv.slice(2);
const weighted = (prompts.length ? prompts : ['Lush cinematic orchestral film score, sweeping legato strings, warm French horns, timpani, concert hall']).map((p) => {
  const m = /^(.*):([\d.]+)$/.exec(p);
  return m ? { text: m[1], weight: Number(m[2]) } : { text: p, weight: 1 };
});

const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: 'v1alpha' } });
const chunks: Buffer[] = [];
let bytes = 0;
const want = Number(secs) * 48000 * 4;
let resolveDone!: () => void;
const done = new Promise<void>((r) => { resolveDone = r; });
const session = await ai.live.music.connect({
  model: 'models/lyria-realtime-exp',
  callbacks: {
    onmessage: (msg: any) => {
      if (msg?.filteredPrompt) console.log('filtered prompt:', JSON.stringify(msg.filteredPrompt));
      for (const ch of msg?.serverContent?.audioChunks ?? []) {
        if (!ch?.data) continue;
        const b = Buffer.from(ch.data, 'base64'); chunks.push(b); bytes += b.length;
        if (bytes >= want) resolveDone();
      }
    },
    onerror: (e: any) => { console.log('lyria error', e?.message ?? e); resolveDone(); },
    onclose: (e: any) => { console.log('lyria closed', e?.reason ?? ''); resolveDone(); },
  },
});
await session.setWeightedPrompts({ weightedPrompts: weighted });
await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: Number(bpm), scale: scale as any, density: Number(process.env.LYRIA_DENSITY ?? 0.6), brightness: Number(process.env.LYRIA_BRIGHTNESS ?? 0.55), guidance: 4.5, temperature: 1.0 } });
session.play();
const timer = setTimeout(resolveDone, (Number(secs) + 60) * 1000);
await done; clearTimeout(timer);
try { session.close(); } catch { /* closed */ }

const pcm = Buffer.concat(chunks).subarray(0, want);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(48000, 24); hdr.writeUInt32LE(48000 * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(out, Buffer.concat([hdr, pcm]));
console.log(`${out}: ${(pcm.length / 192000).toFixed(1)} s`);
process.exit(0);
