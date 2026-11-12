// services/genCloud/types.ts — Plajah's white-label cloud generation (images, video, voice).
//
// Users see Plajah engines ("Motion Pro", "Cinema"), never provider names. Each engine routes to
// one or more provider models in fallback order; jobs are paid in Plajah credits from the user's
// own balance (tier allowance + packs). This is a separate lane from Fabula's genAgent, which drives
// providers on the USER's linked accounts — here Plajah resells on its own provider accounts.
// Local generation (Windows app GPU) stays free on every tier and never touches this module.

export type GenKind = 'image' | 'video' | 'voice';

/** standard = Glow+ (or pack credits); premium = Nova+. Tier rules live in tiers.ts. */
export type Lane = 'standard' | 'premium';

export type EngineId =
  | 'spark-image' | 'pro-image' | 'ultra-image' | 'edit-image'
  | 'motion-lite' | 'motion' | 'motion-pro' | 'motion-multi'
  | 'cinema' | 'cinema-4k'
  | 'voice' | 'voice-studio';

export type ProviderId = 'google' | 'fal' | 'runware' | 'minimax' | 'elevenlabs';

export type Resolution = '720p' | '1080p' | '4k';

export interface ProviderRoute {
  provider: ProviderId;
  /** Provider's model/endpoint id. Overridable at runtime (GENCLOUD_ROUTES) — ids drift. */
  model: string;
  /** Provider cost estimate in USD per unit (image, video second, or voice minute), by resolution. */
  costPerUnit: Partial<Record<Resolution | 'default', number>>;
  /** false = id/price copied from docs or roundups, not yet exercised against the live API. */
  verified: boolean;
}

export interface Engine {
  id: EngineId;
  /** User-facing name. No provider names anywhere a user can see. */
  name: string;
  kind: GenKind;
  lane: Lane;
  blurb: string;
  /** Credits per unit (image / video second / voice minute) by resolution. 1 credit = $0.01 at base pack. */
  credits: Partial<Record<Resolution | 'default', number>>;
  /** Video: allowed durations (seconds). */
  durations?: number[];
  resolutions?: Resolution[];
  /** Generates synced audio with the video. */
  audio?: boolean;
  /** Likeness/realistic video or a provider with data-residency concerns: 18+ verified accounts only. */
  adultOnly?: boolean;
  routes: ProviderRoute[];
}

export interface GenRequest {
  engine: EngineId;
  prompt: string;
  /** Video seconds (video) or estimated minutes of speech (voice, from text length). */
  seconds?: number;
  resolution?: Resolution;
  count?: number;           // images per request
  aspect?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  /** Reference/first-frame image URL (already in Plajah storage). */
  imageUrl?: string;
  /** Voice: the text to speak. */
  text?: string;
  voiceId?: string;
}

export interface Quote {
  engine: EngineId;
  units: number;
  unitLabel: 'image' | 'second' | 'minute';
  credits: number;
  /** Provider cost estimate for the first route (USD). Server-only — never sent to clients. */
  estCostUsd: number;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** A provider result: a URL to download (server-side, via the adapter) or the bytes themselves. */
export interface GenOutput { url?: string; bytes?: Uint8Array; mime: string; width?: number; height?: number; seconds?: number }

export interface ProviderSubmit { providerJobId: string; /** Some providers answer synchronously. */ outputs?: GenOutput[] }

export interface ProviderPoll { status: JobStatus; outputs?: GenOutput[]; error?: string }

/** One provider adapter. Every network call goes through the injected fetch so tests run offline. */
export interface ProviderAdapter {
  id: ProviderId;
  configured(): boolean;
  submit(route: ProviderRoute, req: GenRequest): Promise<ProviderSubmit>;
  poll(route: ProviderRoute, providerJobId: string): Promise<ProviderPoll>;
  /** Download a result URL with the provider's credentials (keys never go into URLs or to clients). */
  download(url: string): Promise<Uint8Array>;
}
