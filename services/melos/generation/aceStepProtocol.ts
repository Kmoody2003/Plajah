// The ACE-Step wire protocol, in one place.
//
// ACE-Step is reached two ways: by the SERVER (the admin evaluation lab, adapters.ts) against a
// runtime the operator configured, and by the BROWSER (localAceStep.ts) against a copy the user is
// running on their own machine. Both must send the same task and read the same reply, so the body
// and the result parsing live here — pure, no I/O, importable from either side.

import type { GenerationRequest } from './types';

export const ACE_STEP_MIN_SECONDS = 10;

/** The `/release_task` body for a request. `thinking` enables the runtime's planning pass (full songs only). */
export function buildAceStepTask(request: Pick<GenerationRequest, 'engine' | 'kind' | 'prompt' | 'lyrics' | 'seconds' | 'bpm' | 'key' | 'seed'>, opts: { thinking?: boolean } = {}): Record<string, unknown> {
  const isFullSong = request.kind === 'audio';
  const isUltraEngine = request.engine === 'ace-step-2.5';
  const defaultInstrumentalArrangement = isFullSong
    ? '[Instrumental]\n[Intro - Atmospheric Motif & Texture]\n[Verse - Tight Pocket Groove & Bassline]\n[Chorus - Full Harmonic Lift & Layered Arrangement]\n[Bridge - Dynamic Breakdown]\n[Outro - Warm Fade]'
    : '[Instrumental]';
  const studioPrompt = request.kind === 'sample'
    ? `${request.prompt}. Isolated musical sample, no vocals.`
    : `${request.prompt}. Studio master quality, wide stereo separation, crisp transient definition, rich harmonic arrangement.`;
  return {
    prompt: studioPrompt,
    lyrics: request.lyrics || defaultInstrumentalArrangement, audio_duration: Math.max(ACE_STEP_MIN_SECONDS, request.seconds),
    bpm: Math.round(request.bpm), key_scale: request.key, time_signature: '4',
    seed: request.seed, use_random_seed: false, batch_size: 1, audio_format: 'wav',
    thinking: isFullSong && !!opts.thinking, use_cot_caption: false, use_cot_language: false, use_format: false,
    inference_steps: isUltraEngine ? 16 : 8, infer_method: 'ode', shift: 3.0,
    // Omit dcw_enabled: this runtime resolves it by checkpoint. Forcing it on
    // incompatible checkpoints can distort audio (upstream issue #1259).
    task_type: 'text2music',
  };
}

export function aceStepTaskId(reply: any): string {
  const taskId = reply?.data?.task_id;
  if (typeof taskId !== 'string' || !taskId) throw new Error('ACE-Step did not return a task ID');
  return taskId;
}

/** Read a `/query_result` reply for one task: null while it is still running, the audio URL when it
 *  is done. The URL is checked to be the runtime's own `/v1/audio` — a reply must never be able to
 *  point the caller at some other host or path. */
export function aceStepAudioUrl(poll: any, taskId: string, baseUrl: string): URL | null {
  const job = poll?.data?.find((item: any) => item.task_id === taskId);
  if (Number(job?.status) === 2) throw new Error('ACE-Step generation failed; inspect its local log');
  if (Number(job?.status) !== 1) return null;
  const items = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
  const file = items?.[0]?.file;
  if (typeof file !== 'string') throw new Error('ACE-Step returned no audio');
  const url = new URL(file, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || url.pathname !== '/v1/audio') throw new Error('ACE-Step returned an unexpected audio location');
  return url;
}
