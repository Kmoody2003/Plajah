import { Router, Request, Response } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export const localAiRouter = Router();

const SIDECAR_PORT = 51122;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;
let sidecarProcess: any = null;

function ensureSidecarRunning(): void {
  // If already spawned and still alive, return
  if (sidecarProcess && !sidecarProcess.killed && sidecarProcess.exitCode === null) {
    return;
  }

  const pythonExe = 'D:\\ComfyUI_windows_portable\\ComfyUI_windows_portable\\python_embeded\\python.exe';
  const scriptPath = path.resolve('scripts/localAi/plajah_gpu_sidecar.py');
  const cwd = 'D:\\ComfyUI_windows_portable\\ComfyUI_windows_portable';

  if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath)) {
    return;
  }

  try {
    sidecarProcess = spawn(pythonExe, ['-u', scriptPath], {
      cwd,
      detached: false,
      stdio: 'ignore',
    });
    sidecarProcess.unref();
    console.log('[Local AI] Auto-spawned NVIDIA GPU sidecar process on port 51122');
  } catch (err) {
    console.warn('[Local AI] Failed to spawn GPU sidecar:', err);
  }
}

// Ensure sidecar is active on router load
ensureSidecarRunning();

localAiRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      return res.json(data);
    }
  } catch {
    ensureSidecarRunning();
  }

  return res.json({
    status: 'starting',
    engine: 'Plajah Native GPU Sidecar',
    online: false,
    gpuName: 'NVIDIA GeForce RTX 4070 Laptop GPU',
    vramTotalMb: 8188,
    backend: 'cuda',
  });
});

localAiRouter.get('/status', async (req: Request, res: Response) => {
  return localAiRouter.handle(req, res, () => {});
});

localAiRouter.get('/models', async (_req: Request, res: Response) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(`${SIDECAR_URL}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      return res.json(data);
    }
  } catch {
    ensureSidecarRunning();
  }

  // Fallback map based on verified installed models in D:\Plajah Models
  return res.json({
    installed: {
      sdxl_turbo: true,
      sdxl_lightning: true,
      animagine_xl: true,
      sd15_base: true,
      flux_schnell: true,
      svd_video: true,
      ic_light_fc: true,
      ipadapter_faceid: true,
      nvidia_nemotron: true,
      nvidia_cosmos: true,
      nvidia_mistral_nemo: true,
      qwen25_7b: true,
      supir_detail: false,
      wan_video_14b: false,
    }
  });
});

localAiRouter.post('/generate', async (req: Request, res: Response) => {
  ensureSidecarRunning();
  try {
    const ctrl = new AbortController();
    // Allow up to 90 seconds for heavy generation
    const t = setTimeout(() => ctrl.abort(), 90000);
    const r = await fetch(`${SIDECAR_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (r.ok) {
      const data = await r.json();
      return res.json(data);
    } else {
      const errText = await r.text();
      return res.status(r.status).json({ success: false, error: errText });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Generation request failed' });
  }
});
