// ─── Meta publish adapters: Facebook + Instagram ─────────────────────────────
// Graph API v21.0. Auth: OAuth via Meta App Review.
//   Facebook  — page access token; pages_manage_posts. Text/link posts free.
//   Instagram — IG Business/Creator account id + token; instagram_content_publish.
//               REQUIRES an image/video (no text-only). Two-step: create media
//               container → publish.
// Both share one Meta app (the same one already used for Threads).

import { SocialPublishAdapter, SocialCredentials, PublishPayload, PublishResult, SocialPublishError } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

// ── Facebook (Page feed) ──────────────────────────────────────────────────────

export const facebookAdapter: SocialPublishAdapter = {
  network: 'facebook',
  implemented: true,

  async publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult> {
    if (!creds.pageId) throw new SocialPublishError('facebook', 'NOT_CONFIGURED', 'No Facebook Page connected');

    const params = new URLSearchParams({ message: payload.text, access_token: creds.accessToken });
    if (payload.linkUri) params.set('link', payload.linkUri);

    // Photo posts use /photos with url; text/link posts use /feed.
    const hasPhoto = !!payload.mediaUrls?.length && !payload.linkUri;
    const endpoint = hasPhoto ? `${GRAPH}/${creds.pageId}/photos` : `${GRAPH}/${creds.pageId}/feed`;
    if (hasPhoto) { params.delete('message'); params.set('caption', payload.text); params.set('url', payload.mediaUrls![0]); }

    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(),
    });
    if (res.status === 401) throw new SocialPublishError('facebook', 'AUTH_EXPIRED', 'Facebook token expired — reconnect');
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new SocialPublishError('facebook', 'API_ERROR', `Facebook post failed (${res.status}): ${err.slice(0, 160)}`);
    }
    const data = await res.json() as { id?: string; post_id?: string };
    const id = data.post_id ?? data.id ?? '';
    return { id, url: `https://www.facebook.com/${id}` };
  },
};

// ── Instagram (Business/Creator) ──────────────────────────────────────────────

export const instagramAdapter: SocialPublishAdapter = {
  network: 'instagram',
  implemented: true,

  async publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult> {
    if (!creds.igUserId) throw new SocialPublishError('instagram', 'NOT_CONFIGURED', 'No Instagram account connected');
    if (!payload.mediaUrls?.length) {
      throw new SocialPublishError('instagram', 'MEDIA_REQUIRED', 'Instagram posts require an image or video');
    }

    // Step 1 — create media container
    const createParams = new URLSearchParams({
      image_url: payload.mediaUrls[0],
      caption: payload.text,
      access_token: creds.accessToken,
    });
    const created = await fetch(`${GRAPH}/${creds.igUserId}/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: createParams.toString(),
    });
    if (created.status === 401) throw new SocialPublishError('instagram', 'AUTH_EXPIRED', 'Instagram token expired — reconnect');
    if (!created.ok) {
      const err = await created.text().catch(() => '');
      throw new SocialPublishError('instagram', 'API_ERROR', `IG container failed (${created.status}): ${err.slice(0, 160)}`);
    }
    const container = await created.json() as { id: string };

    // Step 2 — publish the container
    const publishParams = new URLSearchParams({ creation_id: container.id, access_token: creds.accessToken });
    const published = await fetch(`${GRAPH}/${creds.igUserId}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: publishParams.toString(),
    });
    if (!published.ok) {
      const err = await published.text().catch(() => '');
      throw new SocialPublishError('instagram', 'API_ERROR', `IG publish failed (${published.status}): ${err.slice(0, 160)}`);
    }
    const data = await published.json() as { id: string };
    return { id: data.id, url: `https://www.instagram.com/p/${data.id}` };
  },
};
