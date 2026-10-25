// Local lane — run a model on the user's own PC through the Plajah desktop app (NativeLlmService:
// llama.cpp on the GPU via Vulkan). Nothing leaves the machine. Every call is timed so the next time
// estimate uses this PC's measured speed instead of the tier default (services/ai/aiLane.ts).
import { getNativeLlmStatus, isWindowsApp, nativeLlmChat } from '../windowsBridgeService';
import { estTokens, gpuTier, qualifies, type GpuTier, type LocalSample } from './aiLane';
import type { LaneFn } from './geminiLane';

export interface LocalStatus {
  available: boolean;
  qualifies: boolean;
  tier: GpuTier;
  gpu: string;
  backend: string;
  /** The model the desktop engine will pick (its catalog order: Gemma 4, Qwen 7B, Nemotron 4B, Gemma 2 2B). */
  model?: string;
}

const SAMPLES_KEY = 'plajah.localLlm.samples';

export function readSamples(): LocalSample[] {
  try { const v = JSON.parse(localStorage.getItem(SAMPLES_KEY) || '[]'); return Array.isArray(v) ? v.slice(-20) : []; } catch { return []; }
}
function addSample(s: LocalSample) {
  try { localStorage.setItem(SAMPLES_KEY, JSON.stringify([...readSamples(), s].slice(-20))); } catch { /* storage may be blocked */ }
}

export async function localStatus(): Promise<LocalStatus> {
  const none: LocalStatus = { available: false, qualifies: false, tier: 'cpu', gpu: '', backend: '' };
  if (!isWindowsApp()) return none;
  try {
    const s = await getNativeLlmStatus();
    const present = s.models.filter(m => m.present);
    const loaded = s.models.find(m => m.loaded && m.present);
    return {
      available: present.length > 0,
      qualifies: qualifies(s),
      tier: gpuTier(s.gpu, s.backend),
      gpu: s.gpu, backend: s.backend,
      model: (loaded || present[0])?.label,
    };
  } catch { return none; }
}

/**
 * A lane over the desktop model. `onCall` reports progress (calls finished so far). Calls queue on the
 * one GPU, so a council's five seats run one after another here — the estimate accounts for that.
 */
export function createLocalLane(opts: { onCall?: (done: number) => void; signal?: AbortSignal } = {}): LaneFn {
  let done = 0;
  return async (system, user, maxTokens = 900) => {
    const reply = await nativeLlmChat(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      // Low temperature: fidelity work. The JSON request is in the prompt; the council parser tolerates fences.
      { maxTokens, temperature: 0.3, signal: opts.signal },
    );
    if (!reply.success) throw new Error(reply.error || 'The on-device model could not answer.');
    addSample({ inTokens: estTokens(system.length + user.length), outTokens: reply.tokensUsed, seconds: reply.seconds });
    opts.onCall?.(++done);
    return reply.text;
  };
}
