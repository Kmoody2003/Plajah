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

// Tela Diffusion Runtime (engines/tela-diffusion): Plajah's own PyTorch/diffusers image engine — generative fill,
// outpaint and text-to-image for Tela documents, no ComfyUI. Lives in its own env on D: (C: has no room).
const TELA_RUNTIME_PORT = 51123;
const TELA_RUNTIME_ROOT = process.env.TELA_RUNTIME_ROOT || 'D:\\Plajah Runtime';
let telaRuntimeProcess: any = null;

function ensureTelaRuntimeRunning(): void {
  if (telaRuntimeProcess && !telaRuntimeProcess.killed && telaRuntimeProcess.exitCode === null) return;
  const pythonExe = path.join(TELA_RUNTIME_ROOT, 'tela-py', 'Scripts', 'python.exe');
  const scriptPath = path.resolve('engines/tela-diffusion/tela_runtime.py');
  if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath)) return;
  try {
    telaRuntimeProcess = spawn(pythonExe, ['-u', scriptPath, '--port', String(TELA_RUNTIME_PORT)], {
      cwd: path.dirname(scriptPath),
      detached: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        HF_HOME: path.join(TELA_RUNTIME_ROOT, 'cache', 'hf'),
        TMP: path.join(TELA_RUNTIME_ROOT, 'tmp'),
        TEMP: path.join(TELA_RUNTIME_ROOT, 'tmp'),
        PYTHONIOENCODING: 'utf-8',
      },
    });
    telaRuntimeProcess.on('error', () => { telaRuntimeProcess = null; });
    telaRuntimeProcess.unref();
    console.log(`[Local AI] Started Tela Diffusion Runtime on port ${TELA_RUNTIME_PORT}`);
  } catch (err) {
    console.warn('[Local AI] Failed to start Tela Diffusion Runtime:', err);
  }
}

// Tela 3D Runtime (engines/tela-3d): image → GLB with Stable Fast 3D / TripoSR / Hunyuan3D-2mini on the local GPU.
// Its own env on D: (tela3d-py) — the 3D repos pin different torch extras than the diffusion env. Started on demand,
// not on router load: it holds up to ~7 GB of VRAM once a model is resident.
const TELA3D_PORT = 51124;
let tela3dProcess: any = null;

function ensureTela3dRunning(): boolean {
  if (tela3dProcess && !tela3dProcess.killed && tela3dProcess.exitCode === null) return true;
  const pythonExe = path.join(TELA_RUNTIME_ROOT, 'tela3d-py', 'Scripts', 'python.exe');
  const scriptPath = path.resolve('engines/tela-3d/tela3d_runtime.py');
  if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath)) return false;
  try {
    tela3dProcess = spawn(pythonExe, ['-u', '-W', 'ignore', scriptPath, '--port', String(TELA3D_PORT)], {
      cwd: path.dirname(scriptPath),
      detached: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        HF_HOME: path.join(TELA_RUNTIME_ROOT, 'cache', 'hf'),
        TMP: path.join(TELA_RUNTIME_ROOT, 'tmp'),
        TEMP: path.join(TELA_RUNTIME_ROOT, 'tmp'),
        PYTHONIOENCODING: 'utf-8',
      },
    });
    tela3dProcess.on('error', () => { tela3dProcess = null; });
    tela3dProcess.unref();
    console.log(`[Local AI] Started Tela 3D Runtime on port ${TELA3D_PORT}`);
    return true;
  } catch (err) {
    console.warn('[Local AI] Failed to start Tela 3D Runtime:', err);
    return false;
  }
}

// Ensure sidecar is active on router load
ensureSidecarRunning();
ensureTelaRuntimeRunning();

localAiRouter.post('/tela3d/ensure', (_req: Request, res: Response) => {
  const started = ensureTela3dRunning();
  res.json({ success: started, port: TELA3D_PORT, error: started ? undefined : 'tela3d-py env or engines/tela-3d missing on this machine' });
});

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

async function waitForSidecarReady(maxWaitMs = 8000): Promise<boolean> {
  ensureSidecarRunning();
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 800);
      const r = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return true;
    } catch {
      // Still booting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

localAiRouter.post('/generate', async (req: Request, res: Response) => {
  ensureSidecarRunning();
  const forwardGenerate = async () => {
    const ctrl = new AbortController();
    // Allow up to 90 seconds for heavy generation
    const t = setTimeout(() => ctrl.abort(), 90000);
    try {
      return await fetch(`${SIDECAR_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    let r: globalThis.Response;
    try {
      r = await forwardGenerate();
    } catch {
      // Sidecar may still be booting after ensureSidecarRunning(); wait up to 8s and retry once
      await waitForSidecarReady(8000);
      r = await forwardGenerate();
    }

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

localAiRouter.post('/encode-jxl', async (req: Request, res: Response) => {
  ensureSidecarRunning();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(`${SIDECAR_URL}/encode_jxl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      return res.json(await r.json());
    }
    return res.status(r.status).json({ success: false, error: await r.text() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'JXL encode failed' });
  }
});

localAiRouter.post('/decode-jxl', async (req: Request, res: Response) => {
  ensureSidecarRunning();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(`${SIDECAR_URL}/decode_jxl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      return res.json(await r.json());
    }
    return res.status(r.status).json({ success: false, error: await r.text() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'JXL decode failed' });
  }
});

