import { randomUUID } from 'node:crypto';
import { musicEngineAccess, type MusicEngineId } from '../../musicEnginePolicy';
import { runGeneration, runtimeConfigured, type AdapterResult, type EngineConfigs } from './adapters';
import { validateGenerationRequest, type GenerationJob, type GenerationRequest } from './types';

export class GenerationError extends Error { constructor(public status: number, message: string) { super(message); } }
interface StoredJob extends GenerationJob { owner: string; controller: AbortController; audio?: Buffer }
export class MusicGenerationJobs {
  private jobs = new Map<string, StoredJob>();
  private active = false;
  constructor(private configs: EngineConfigs, private permission: (id: MusicEngineId) => string | undefined,
    private runner: typeof runGeneration = runGeneration) {}
  configured(id: MusicEngineId) { return runtimeConfigured(this.configs[id]); }
  private prune() {
    for (const [id, job] of this.jobs) if (job.status !== 'running' && Date.now() - job.createdAt > 30 * 60 * 1000) this.jobs.delete(id);
    while (this.jobs.size >= 3) {
      const oldest = [...this.jobs.values()].find(job => job.status !== 'running');
      if (!oldest) break;
      this.jobs.delete(oldest.id);
    }
  }
  start(owner: string, raw: unknown): GenerationJob {
    let request: GenerationRequest;
    try { request = validateGenerationRequest(raw); } catch (error) { throw new GenerationError(400, (error as Error).message); }
    const access = musicEngineAccess(request.engine, { isAdmin: true, evaluationPermission: this.permission(request.engine), runtimeConnected: this.configured(request.engine) });
    if (!access.allowed) throw new GenerationError(access.status, access.reason);
    if (this.active) throw new GenerationError(409, 'Another generation is using the local runtime. Wait for it to finish.');
    this.prune();
    const job: StoredJob = { id: randomUUID(), owner, engine: request.engine, createdAt: Date.now(), status: 'running', message: 'Starting generation…', controller: new AbortController() };
    this.jobs.set(job.id, job); this.active = true;
    void this.execute(job, request);
    return this.view(job);
  }
  private async execute(job: StoredJob, request: GenerationRequest) {
    const timeout = setTimeout(() => job.controller.abort(new Error('Generation timed out after 20 minutes')), 20 * 60 * 1000);
    try {
      const result: AdapterResult = await this.runner(request, this.configs[request.engine]!, job.controller.signal,
        message => { if (job.status === 'running') job.message = message; });
      if (job.status === 'cancelled') return;
      job.controller.signal.throwIfAborted();
      job.audio = result.audio;
      job.result = { notes: result.notes, abc: result.abc, mime: result.mime, warning: result.warning, audioAvailable: !!result.audio };
      job.status = 'succeeded'; job.message = 'Ready to insert';
    } catch (error) {
      if (job.status !== 'cancelled') {
        job.status = 'failed';
        // Avoid exposing local paths, keys, request text or raw engine responses.
        job.message = job.controller.signal.aborted ? 'Generation timed out' : 'Generation failed. Verify the runtime, model files and available memory.';
        console.warn('[music-lab] generation failed', job.engine, error instanceof GenerationError ? error.status : 'runtime');
      }
    } finally { clearTimeout(timeout); this.active = false; }
  }
  private owned(owner: string, id: string) {
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner || Date.now() - job.createdAt > 30 * 60 * 1000) throw new GenerationError(404, 'Generation not found or expired');
    return job;
  }
  private view(job: StoredJob): GenerationJob {
    return { id: job.id, engine: job.engine, createdAt: job.createdAt, status: job.status, message: job.message, result: job.result };
  }
  get(owner: string, id: string) { return this.view(this.owned(owner, id)); }
  audio(owner: string, id: string) {
    const job = this.owned(owner, id);
    if (job.status !== 'succeeded' || !job.audio) throw new GenerationError(404, 'Audio is not ready');
    return { bytes: job.audio, mime: job.result?.mime || 'audio/wav' };
  }
  cancel(owner: string, id: string) {
    const job = this.owned(owner, id);
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.message = job.engine === 'ace-step' ? 'Cancelled in Melos. ACE-Step may finish its submitted task in the background.' : 'Generation cancelled';
      // ACE's API has no documented cancellation. Keep its GPU slot occupied until it finishes.
      if (job.engine !== 'ace-step') job.controller.abort();
    }
    return this.view(job);
  }
}
