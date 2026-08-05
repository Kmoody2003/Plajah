// ─── TikTok publish adapter ───────────────────────────────────────────────────
// Content Posting API (Direct Post). Auth: OAuth 2.0 (scope:
// video.publish / video.upload). Requires TikTok app approval.
//
// TikTok is video-only and uses a multi-step upload (init → chunked upload →
// status poll). The init call below is the documented entry point; the chunked
// upload from a Plajah-hosted video URL is wired once an approved app + a real
// video asset are available. Until then this surfaces a clear PENDING_APPROVAL
// so the UI can show "connect after approval" rather than failing opaquely.

import { SocialPublishAdapter, SocialCredentials, PublishPayload, PublishResult, SocialPublishError } from './types';

const INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/';

export const tiktokAdapter: SocialPublishAdapter = {
  network: 'tiktok',
  implemented: false, // video upload pipeline completes once an approved app exists

  async publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult> {
    if (!creds.accessToken) throw new SocialPublishError('tiktok', 'NOT_CONFIGURED', 'No TikTok account connected');
    if (!payload.mediaUrls?.length) throw new SocialPublishError('tiktok', 'MEDIA_REQUIRED', 'TikTok requires a video');

    // Documented Direct-Post init (PULL_FROM_URL source). Full chunked-upload
    // + status polling is enabled once the app clears TikTok review.
    const res = await fetch(INIT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: payload.text.slice(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE' },
        source_info: { source: 'PULL_FROM_URL', video_url: payload.mediaUrls[0] },
      }),
    });

    if (res.status === 401) throw new SocialPublishError('tiktok', 'AUTH_EXPIRED', 'TikTok token expired — reconnect');
    if (res.status === 403) throw new SocialPublishError('tiktok', 'PENDING_APPROVAL', 'TikTok app not yet approved for direct posting');
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new SocialPublishError('tiktok', 'API_ERROR', `TikTok init failed (${res.status}): ${err.slice(0, 160)}`);
    }
    const data = await res.json() as { data?: { publish_id?: string } };
    const id = data.data?.publish_id ?? '';
    return { id, url: 'https://www.tiktok.com/' };
  },
};
