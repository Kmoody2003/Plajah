// ─── YouTube publish adapter ──────────────────────────────────────────────────
// YouTube Data API v3 — videos.insert (resumable upload). Auth: Google OAuth
// 2.0 (scope: youtube.upload). No per-call fee, but a shared 10,000-units/day
// project quota (an upload ≈ 1,600 units → ~6/day default); request an
// increase. Pro-gated so demand is managed.
//
// Upload is a resumable two-step (start session → PUT bytes). The session start
// below is the documented entry point; streaming a Plajah-hosted video into the
// session completes once an OAuth app + quota are in place.

import { SocialPublishAdapter, SocialCredentials, PublishPayload, PublishResult, SocialPublishError } from './types';

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

export const youtubeAdapter: SocialPublishAdapter = {
  network: 'youtube',
  implemented: false, // resumable byte streaming completes once OAuth app + quota exist

  async publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult> {
    if (!creds.accessToken) throw new SocialPublishError('youtube', 'NOT_CONFIGURED', 'No YouTube channel connected');
    if (!payload.mediaUrls?.length) throw new SocialPublishError('youtube', 'MEDIA_REQUIRED', 'YouTube requires a video');

    // Start a resumable upload session with the video metadata.
    const meta = {
      snippet: { title: (payload.title || payload.text).slice(0, 100), description: payload.text.slice(0, 4500) },
      status: { privacyStatus: 'public' },
    };
    const res = await fetch(UPLOAD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });

    if (res.status === 401) throw new SocialPublishError('youtube', 'AUTH_EXPIRED', 'YouTube token expired — reconnect');
    if (res.status === 403) throw new SocialPublishError('youtube', 'PENDING_APPROVAL', 'YouTube quota/app not yet available');
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new SocialPublishError('youtube', 'API_ERROR', `YouTube session failed (${res.status}): ${err.slice(0, 160)}`);
    }

    // The resumable session URL — bytes are streamed here to finish the upload.
    const sessionUrl = res.headers.get('location') ?? '';
    return { id: '', url: sessionUrl || 'https://studio.youtube.com/' };
  },
};
