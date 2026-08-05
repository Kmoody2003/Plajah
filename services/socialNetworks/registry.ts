// ─── Commercial network publish registry ─────────────────────────────────────
// Maps each commercial SuiteNetwork to its publish adapter and exposes a single
// publishToNetwork() the scheduled-post publisher uses to fan out, mirroring how
// the fediverse broadcast fans out to Mastodon/Bluesky/Threads. SERVER-SIDE.

import type { SuiteNetwork } from '../managerSuite/networks';
import { SocialPublishAdapter, SocialCredentials, PublishPayload, PublishResult, SocialPublishError } from './types';
import { xAdapter } from './x';
import { facebookAdapter, instagramAdapter } from './meta';
import { linkedinAdapter } from './linkedin';
import { tiktokAdapter } from './tiktok';
import { youtubeAdapter } from './youtube';

// Networks handled by the fediverse layer (services/fediverse) — not here.
const FEDIVERSE = new Set<SuiteNetwork>(['mastodon', 'bluesky', 'threads', 'plajah']);

export const SOCIAL_ADAPTERS: Partial<Record<SuiteNetwork, SocialPublishAdapter>> = {
  x: xAdapter,
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  linkedin: linkedinAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
};

export function isCommercialNetwork(network: SuiteNetwork): boolean {
  return !FEDIVERSE.has(network) && !!SOCIAL_ADAPTERS[network];
}

/** Publish to one commercial network. Throws SocialPublishError on failure. */
export async function publishToNetwork(
  network: SuiteNetwork,
  creds: SocialCredentials,
  payload: PublishPayload,
): Promise<PublishResult> {
  const adapter = SOCIAL_ADAPTERS[network];
  if (!adapter) throw new SocialPublishError(network, 'NOT_CONFIGURED', `No adapter for ${network}`);
  return adapter.publish(creds, payload);
}

/** Which commercial adapters are fully implemented vs awaiting approval/credentials. */
export function adapterReadiness(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [net, adapter] of Object.entries(SOCIAL_ADAPTERS)) {
    if (adapter) out[net] = adapter.implemented;
  }
  return out;
}
