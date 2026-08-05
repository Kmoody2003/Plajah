// ─── LinkedIn publish adapter ─────────────────────────────────────────────────
// Posts API. Auth: OAuth 2.0 (scope: w_member_social). Requires Marketing
// Developer Platform approval. Text + article-link posts are free.
// authorUrn is resolved at connect time (urn:li:person:{id} or
// urn:li:organization:{id}).

import { SocialPublishAdapter, SocialCredentials, PublishPayload, PublishResult, SocialPublishError } from './types';

const API = 'https://api.linkedin.com/v2/ugcPosts';

export const linkedinAdapter: SocialPublishAdapter = {
  network: 'linkedin',
  implemented: true,

  async publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult> {
    if (!creds.authorUrn) throw new SocialPublishError('linkedin', 'NOT_CONFIGURED', 'No LinkedIn author connected');

    const text = payload.linkUri && !payload.text.includes(payload.linkUri)
      ? `${payload.text}\n\n${payload.linkUri}`
      : payload.text;

    const body = {
      author: creds.authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: payload.linkUri ? 'ARTICLE' : 'NONE',
          ...(payload.linkUri ? { media: [{ status: 'READY', originalUrl: payload.linkUri }] } : {}),
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) throw new SocialPublishError('linkedin', 'AUTH_EXPIRED', 'LinkedIn token expired — reconnect');
    if (res.status === 429) throw new SocialPublishError('linkedin', 'RATE_LIMITED', 'LinkedIn rate limit reached');
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new SocialPublishError('linkedin', 'API_ERROR', `LinkedIn post failed (${res.status}): ${err.slice(0, 160)}`);
    }

    // The post id is returned in the x-restli-id header (or body id).
    const id = res.headers.get('x-restli-id') ?? '';
    return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : 'https://www.linkedin.com/feed/' };
  },
};
