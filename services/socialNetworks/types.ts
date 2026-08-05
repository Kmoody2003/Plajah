// ─── Commercial social network publish layer ─────────────────────────────────
// Lightweight, publish-focused adapters for the centralized networks (X, Meta
// IG/FB, LinkedIn, TikTok, YouTube). Unlike the fediverse adapters (which also
// do timelines/likes/follows), these only need to PUBLISH on behalf of a
// connected account — that's all the Studio requires.
//
// Each adapter is a pure function of (credentials, payload) → result, so the
// scheduled-post publisher can fan out to any network the same way it fans out
// to the fediverse. SERVER-SIDE ONLY — secrets and tokens never touch the client.

import type { SuiteNetwork } from '../managerSuite/networks';

export interface SocialCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Network-specific identifiers resolved at connect time. */
  userId?: string;        // generic remote user id
  igUserId?: string;      // Instagram Business/Creator account id (Meta)
  pageId?: string;        // Facebook Page id (Meta)
  authorUrn?: string;     // LinkedIn person/organization URN
  openId?: string;        // TikTok open_id
  channelId?: string;     // YouTube channel id
}

export interface PublishPayload {
  text: string;
  /** Public media URLs already hosted on Plajah storage. Some networks
   *  (Instagram, TikTok, YouTube) REQUIRE media; others treat it as optional. */
  mediaUrls?: string[];
  /** Optional link to attach (LinkedIn/Facebook render a card). */
  linkUri?: string;
  title?: string;
}

export interface PublishResult {
  id: string;
  url: string;
}

export class SocialPublishError extends Error {
  constructor(
    public network: SuiteNetwork,
    public code: 'AUTH_EXPIRED' | 'RATE_LIMITED' | 'MEDIA_REQUIRED' | 'NOT_CONFIGURED' | 'API_ERROR' | 'PENDING_APPROVAL',
    message: string,
  ) {
    super(message);
    this.name = 'SocialPublishError';
  }
}

export interface SocialPublishAdapter {
  network: SuiteNetwork;
  /** True once the adapter's publish path is implemented (not a stub). */
  implemented: boolean;
  publish(creds: SocialCredentials, payload: PublishPayload): Promise<PublishResult>;
}
