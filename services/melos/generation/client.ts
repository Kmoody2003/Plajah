import { auth } from '../../firebase';
import type { MusicEngineId } from '../../musicEnginePolicy';
import type { GenerationJob, GenerationKind, GenerationRequest } from './types';

export interface EngineStatus {
  id: MusicEngineId; name: string; purpose: string; kinds: GenerationKind[];
  runtimeConnected: boolean; access: { allowed: boolean; reason: string };
}
async function authorizedFetch(path: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in as an admin to use the music lab');
  const response = await fetch(`/api/admin/music-lab${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Music lab request failed (${response.status})`);
  }
  return response;
}
export async function getMusicEngines(signal?: AbortSignal): Promise<EngineStatus[]> {
  const data = await (await authorizedFetch('/engines', { signal })).json();
  return data.engines;
}
export async function startMusicGeneration(request: GenerationRequest): Promise<GenerationJob> {
  return (await authorizedFetch(`/engines/${request.engine}/generate`, { method: 'POST', body: JSON.stringify(request) })).json();
}
export async function getMusicGeneration(id: string, signal?: AbortSignal): Promise<GenerationJob> {
  return (await authorizedFetch(`/jobs/${encodeURIComponent(id)}`, { signal })).json();
}
export async function cancelMusicGeneration(id: string): Promise<GenerationJob> {
  return (await authorizedFetch(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' })).json();
}
export async function getGeneratedAudio(id: string, signal?: AbortSignal): Promise<Blob> {
  return (await authorizedFetch(`/jobs/${encodeURIComponent(id)}/audio`, { signal })).blob();
}
