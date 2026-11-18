/**
 * localLlm.ts — the photo → 3D loop's local lane: llama.cpp's llama-server on the PC's GPU running Gemma 4 E4B
 * with its vision projector (desktop-first AI; Gemini is the fallback, never the default).
 *
 * Binary: D:\Plajah Runtime\bin\llama-b12138\llama-server.exe (official ggml-org/llama.cpp release b12138,
 * CUDA 12.4 build). Its CUDA runtime DLLs come from the Tela 3D env's torch install, so no separate CUDA
 * runtime download is needed. Weights: D:\Plajah Models\llm\gemma-4-e4b (Q4_K_M + f16 mmproj).
 *
 * This is the dev harness lane. In the desktop app the same calls go through NativeLlmService (LOCAL_LLM_*).
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

export const LOCAL_LLM_PORT = 51127;
const URL_BASE = `http://127.0.0.1:${LOCAL_LLM_PORT}`;
const BIN = 'D:/Plajah Runtime/bin/llama-b12138/llama-server.exe';
const MODEL = 'D:/Plajah Models/llm/gemma-4-e4b/google_gemma-4-E4B-it-Q4_K_M.gguf';
const MMPROJ = 'D:/Plajah Models/llm/gemma-4-e4b/mmproj-google_gemma-4-E4B-it-f16.gguf';
const CUDA_DLLS = 'D:/Plajah Runtime/tela3d-py/Lib/site-packages/torch/lib';

async function healthy(): Promise<boolean> {
  try { const r = await fetch(`${URL_BASE}/health`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

/** Start the server if it isn't running (it stays up between runs; the first load takes ~1 minute). */
export async function ensureLocalLlm(log: (s: string) => void = () => {}): Promise<boolean> {
  if (await healthy()) return true;
  if (!fs.existsSync(BIN) || !fs.existsSync(MODEL) || !fs.existsSync(MMPROJ)) { log('local lane: llama-server or Gemma 4 weights missing'); return false; }
  log('local lane: starting llama-server (Gemma 4 E4B vision) on the GPU…');
  const child = spawn(BIN, ['-m', MODEL, '--mmproj', MMPROJ, '--host', '127.0.0.1', '--port', String(LOCAL_LLM_PORT), '-c', '16384'], {
    env: { ...process.env, PATH: `${CUDA_DLLS};${process.env.PATH ?? ''}` },
    detached: true, stdio: ['ignore', fs.openSync('D:/Plajah Runtime/bin/llama-server-51127.log', 'a'), fs.openSync('D:/Plajah Runtime/bin/llama-server-51127.log', 'a')],
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 180; i++) { if (await healthy()) return true; await new Promise(r => setTimeout(r, 1000)); }
  log('local lane: llama-server did not come up in 3 minutes');
  return false;
}

export interface LocalUsage { model: string; inTokens: number; outTokens: number; seconds: number }

/** One chat turn. Text and images interleave in order; thinking is off (it spent whole budgets before answering). */
export async function localChat(o: { system: string; parts: ({ text: string } | { png: Buffer })[]; json?: boolean; maxTokens?: number; temperature?: number }): Promise<{ text: string; usage: LocalUsage }> {
  const t0 = Date.now();
  const content = o.parts.map(p => 'text' in p ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:image/png;base64,${p.png.toString('base64')}` } });
  const body = {
    messages: [{ role: 'system', content: o.system }, { role: 'user', content }],
    max_tokens: o.maxTokens ?? 2000, temperature: o.temperature ?? 0.2,
    ...(o.json ? { response_format: { type: 'json_object' } } : {}),
    chat_template_kwargs: { enable_thinking: false },
  };
  const r = await fetch(`${URL_BASE}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`local lane answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d: any = await r.json();
  const text = String(d.choices?.[0]?.message?.content ?? '');
  if (!text.trim()) throw new Error('local lane returned an empty answer');
  return { text, usage: { model: 'gemma-4-e4b (local GPU)', inTokens: d.usage?.prompt_tokens ?? 0, outTokens: d.usage?.completion_tokens ?? 0, seconds: (Date.now() - t0) / 1000 } };
}
