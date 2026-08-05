// ─── X (Twitter) publish adapter ─────────────────────────────────────────────
// API v2. Auth: OAuth 2.0 user-context bearer token (scopes: tweet.read,
// tweet.write, users.read, offline.access). The connect flow stores the
// access/refresh token as SocialCredentials.
//
// Text posts work on every paid tier (Basic $200/mo+). Media requires the v1.1
// media/upload endpoint first (chunked) — implemented as a follow-up; text +
// link posts cover the Studio's core use today.

import { SocialPublishAdapter, SocialCredentials, PublishPayload, PublishResult, SocialPublishError } from './types';

const API = 'https://api.twitter.com/2';
const UPLOAD = 'https://upload.twitter.com/1.1/media/upload.json';

async function uploadMedia(token: string, mediaUrl: string): Promise<string | null> {
  try {
    const imgRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const body = new URLSearchParams({ media_data: buf.toString('base64') });
    const res = await fetch(UPLOAD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return null;
    const data = await res.json() as { media_id_string?: string };
    return data.media_id_string ?? null;
  } catch {
    return null;
  }
}

export const xAdapter: SocialPublishAdapter = {
  network: 'x',
  implemented: true,

  async publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult> {
    const text = payload.linkUri && !payload.text.includes(payload.linkUri)
      ? `${payload.text}\n\n${payload.linkUri}`
      : payload.text;

    const body: Record<string, unknown> = { text };

    // Attach the first image if present (best-effort; failure → text-only post).
    if (payload.mediaUrls?.length) {
      const mediaId = await uploadMedia(creds.accessToken, payload.mediaUrls[0]);
      if (mediaId) body.media = { media_ids: [mediaId] };
    }

    const res = await fetch(`${API}/tweets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 401) throw new SocialPublishError('x', 'AUTH_EXPIRED', 'X token expired — reconnect');
    if (res.status === 429) throw new SocialPublishError('x', 'RATE_LIMITED', 'X rate limit reached');
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new SocialPublishError('x', 'API_ERROR', `X post failed (${res.status}): ${err.slice(0, 160)}`);
    }

    const data = await res.json() as { data?: { id: string } };
    const id = data.data?.id ?? '';
    const handle = creds.userId || 'i/web';
    return { id, url: `https://twitter.com/${handle}/status/${id}` };
  },
};
