// services/genCloud/catalog.ts — the Plajah engine list and where each one routes.
//
// Credits come from the pricing plan (1 credit = $0.01 at the $10 pack): markup is ~2–2.5× on
// images and lite video, ~1.7× on premium video. Provider costs are Nov-2026 estimates from public
// pricing roundups; every route is `verified: false` until it has run against the live API.
// `marginCheck()` (pricing.ts) fails the test suite if any engine drops below the markup floor.

import type { Engine, EngineId, ProviderRoute } from './types';

const r = (provider: ProviderRoute['provider'], model: string, costPerUnit: ProviderRoute['costPerUnit']): ProviderRoute =>
  ({ provider, model, costPerUnit, verified: false });

export const ENGINES: Engine[] = [
  // ── Images ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'spark-image', name: 'Spark Image', kind: 'image', lane: 'standard',
    blurb: 'Fast drafts and ideas',
    credits: { default: 4 },
    // Runware first: cheapest per draft. Imagen Fast and fal back it up.
    routes: [r('runware', 'runware:100@1', { default: 0.0013 }), r('google', 'imagen-4.0-fast-generate-001', { default: 0.02 }),
      r('fal', 'fal-ai/flux/schnell', { default: 0.004 })],
  },
  {
    id: 'pro-image', name: 'Pro Image', kind: 'image', lane: 'standard',
    blurb: 'Finished artwork, posters, covers',
    credits: { default: 10 },
    routes: [r('google', 'imagen-4.0-generate-001', { default: 0.04 }), r('fal', 'fal-ai/flux-pro/v1.1', { default: 0.04 }),
      r('runware', 'bfl:2@1', { default: 0.04 })],
  },
  {
    id: 'ultra-image', name: 'Ultra Image', kind: 'image', lane: 'premium',
    blurb: 'Highest detail for print',
    credits: { default: 15 },
    routes: [r('google', 'imagen-4.0-ultra-generate-001', { default: 0.06 })],
  },
  {
    id: 'edit-image', name: 'Edit Image', kind: 'image', lane: 'standard',
    blurb: 'Change an image with words',
    credits: { default: 10 },
    routes: [r('fal', 'fal-ai/flux-pro/kontext', { default: 0.04 })],
  },
  // ── Video (credits per second) ──────────────────────────────────────────────────────────────
  {
    id: 'motion-lite', name: 'Motion Lite', kind: 'video', lane: 'standard',
    blurb: 'Quick clips for social',
    credits: { '720p': 13, '1080p': 20 }, durations: [4, 6, 8], resolutions: ['720p', '1080p'],
    routes: [r('google', 'veo-3.1-lite-generate-preview', { '720p': 0.05, '1080p': 0.08 }),
      r('minimax', 'MiniMax-Hailuo-03', { '720p': 0.08, '1080p': 0.08 })],
  },
  {
    id: 'motion', name: 'Motion', kind: 'video', lane: 'standard',
    blurb: 'Smooth 1080p shots',
    credits: { '720p': 21, '1080p': 25 }, durations: [4, 6, 8], resolutions: ['720p', '1080p'],
    routes: [r('google', 'veo-3.1-fast-generate-preview', { '720p': 0.10, '1080p': 0.12 }),
      r('minimax', 'MiniMax-Hailuo-03', { '720p': 0.08, '1080p': 0.08 })],
  },
  {
    id: 'motion-pro', name: 'Motion Pro', kind: 'video', lane: 'premium',
    blurb: 'Strongest motion and performance',
    credits: { '1080p': 30 }, durations: [5, 10], resolutions: ['1080p'],
    routes: [r('fal', 'fal-ai/kling-video/v3/pro/text-to-video', { '1080p': 0.14 }),
      r('minimax', 'MiniMax-Hailuo-03', { '1080p': 0.13 })],
  },
  {
    id: 'motion-multi', name: 'Motion Multi-shot', kind: 'video', lane: 'premium', adultOnly: true,
    blurb: 'Several actions in one shot',
    credits: { '720p': 45, '1080p': 100 }, durations: [5, 10], resolutions: ['720p', '1080p'],
    routes: [r('fal', 'bytedance/seedance/v2.5/text-to-video', { '720p': 0.23, '1080p': 0.57 })],
  },
  {
    id: 'cinema', name: 'Cinema', kind: 'video', lane: 'premium', audio: true,
    blurb: 'Film-quality shots with sound and dialogue',
    credits: { '1080p': 70 }, durations: [4, 6, 8], resolutions: ['1080p'],
    routes: [r('google', 'veo-3.1-generate-preview', { '1080p': 0.40 })],
  },
  {
    id: 'cinema-4k', name: 'Cinema 4K', kind: 'video', lane: 'premium', audio: true,
    blurb: 'Cinema at 4K',
    credits: { '4k': 100 }, durations: [4, 6, 8], resolutions: ['4k'],
    routes: [r('google', 'veo-3.1-generate-preview', { '4k': 0.60 })],
  },
  // ── Voice (credits per minute of speech) ────────────────────────────────────────────────────
  {
    id: 'voice', name: 'Voice', kind: 'voice', lane: 'standard',
    blurb: 'Natural narration',
    credits: { default: 9 },
    routes: [r('elevenlabs', 'eleven_flash_v2_5', { default: 0.045 })],
  },
  {
    id: 'voice-studio', name: 'Voice Studio', kind: 'voice', lane: 'premium',
    blurb: 'Expressive performance voice',
    credits: { default: 18 },
    routes: [r('elevenlabs', 'eleven_v3', { default: 0.09 })],
  },
];

const BY_ID = new Map(ENGINES.map(e => [e.id, e]));
export const getEngine = (id: string): Engine | undefined => BY_ID.get(id as EngineId);

/**
 * Apply GENCLOUD_ROUTES overrides: JSON {"motion-pro":[{"provider":"fal","model":"…","costPerUnit":{…}}]}.
 * Lets ops swap a model id or provider without a deploy when a provider renames or reprices.
 */
export function withRouteOverrides(engines: Engine[], json?: string): Engine[] {
  if (!json) return engines;
  let o: Record<string, ProviderRoute[]>;
  try { o = JSON.parse(json); } catch { return engines; }
  return engines.map(e => Array.isArray(o[e.id]) && o[e.id].length
    ? { ...e, routes: o[e.id].map(x => ({ ...x, verified: !!x.verified })) }
    : e);
}

/** What a client may see about an engine: no provider, model or cost. */
export function publicEngine(e: Engine) {
  const { routes: _r, ...rest } = e;
  return rest;
}
