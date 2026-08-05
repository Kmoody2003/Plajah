// ─── Fediverse Unified Type Layer ────────────────────────────────────────────
// Abstracts Mastodon (ActivityPub), Bluesky (AT Protocol), and Threads (Meta)
// behind a single interface so the rest of the platform never talks to a
// specific protocol directly.

export type FediverseProtocol = 'mastodon' | 'bluesky' | 'threads';

// ─── Account ────────────────────────────────────────────────────────────────

export interface FediverseCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  // AT Protocol specific
  did?: string;
  pdsUrl?: string;
  // Mastodon specific
  instanceUrl?: string;
}

export interface FediverseAccount {
  id: string;                     // generated UUID stored in Firestore
  protocol: FediverseProtocol;
  handle: string;                 // e.g. @user@mastodon.social | user.bsky.social | @user
  displayName: string;
  avatarUrl?: string;
  instanceUrl?: string;           // Mastodon only
  credentials: FediverseCredentials;
  connectedAt: number;
  isActive: boolean;
  profileUrl: string;
}

// ─── Post ───────────────────────────────────────────────────────────────────

export type FediverseVisibility = 'public' | 'unlisted' | 'followers' | 'direct';

export interface FediverseMedia {
  type: 'image' | 'video' | 'gifv' | 'audio';
  url: string;
  previewUrl?: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface FediversePost {
  id: string;
  uri: string;                    // canonical AT-URI or URL for deduplication
  protocol: FediverseProtocol;
  accountId: string;              // local FediverseAccount.id that fetched this
  authorHandle: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  authorDid?: string;             // Bluesky DID
  content: string;                // may contain HTML (Mastodon) or plain text
  contentText: string;            // always stripped plain text
  createdAt: number;              // unix ms
  url: string;                    // web-browsable URL
  replyCount: number;
  repostCount: number;
  likeCount: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  likeUri?: string;               // AT-URI of the like record (Bluesky), needed to unlike
  repostUri?: string;             // AT-URI of the repost record (Bluesky), needed to unrepost
  media: FediverseMedia[];
  inReplyToId?: string;
  inReplyToUri?: string;
  sensitive?: boolean;
  spoilerText?: string;
  visibility?: FediverseVisibility;
  lang?: string[];
}

// ─── Profile ────────────────────────────────────────────────────────────────

export interface FediverseProfile {
  id: string;
  did?: string;
  protocol: FediverseProtocol;
  handle: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  headerUrl?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  url: string;
  followRecordUri?: string;       // AT-URI of follow record (Bluesky), needed to unfollow
}

// ─── Notification ───────────────────────────────────────────────────────────

export type FediverseNotifType =
  | 'mention' | 'reply' | 'reblog' | 'repost'
  | 'favourite' | 'like' | 'follow' | 'quote';

export interface FediverseNotification {
  id: string;
  protocol: FediverseProtocol;
  type: FediverseNotifType;
  createdAt: number;
  isRead: boolean;
  actor?: FediverseProfile;
  post?: FediversePost;
}

// ─── Post Options ────────────────────────────────────────────────────────────

export interface CreatePostOptions {
  inReplyToId?: string;
  inReplyToUri?: string;         // Bluesky needs the AT-URI for replies
  inReplyToRootUri?: string;     // Bluesky thread root URI
  inReplyToRootCid?: string;
  inReplyToCid?: string;
  visibility?: FediverseVisibility;
  sensitive?: boolean;
  spoilerText?: string;
  langs?: string[];
}

// ─── Adapter Interface ───────────────────────────────────────────────────────

export interface FediverseAdapter {
  readonly protocol: FediverseProtocol;

  /** Verify credentials and return the authed profile. */
  verifyCredentials(creds: FediverseCredentials): Promise<FediverseProfile>;

  /** Home timeline (people the account follows). */
  getHomeTimeline(creds: FediverseCredentials, cursor?: string): Promise<{
    posts: FediversePost[];
    cursor?: string;
  }>;

  /** Public/discover timeline. */
  getPublicTimeline(creds: FediverseCredentials, cursor?: string): Promise<{
    posts: FediversePost[];
    cursor?: string;
  }>;

  /** Create a new post. */
  createPost(
    creds: FediverseCredentials,
    content: string,
    options?: CreatePostOptions
  ): Promise<FediversePost>;

  /** Delete own post by its native ID. */
  deletePost(creds: FediverseCredentials, postId: string): Promise<void>;

  /** Like a post. Returns updated like state. */
  likePost(creds: FediverseCredentials, post: FediversePost): Promise<Partial<FediversePost>>;

  /** Unlike a post. */
  unlikePost(creds: FediverseCredentials, post: FediversePost): Promise<void>;

  /** Repost / boost a post. */
  repost(creds: FediverseCredentials, post: FediversePost): Promise<Partial<FediversePost>>;

  /** Undo a repost. */
  unrepost(creds: FediverseCredentials, post: FediversePost): Promise<void>;

  /** Follow a profile. Returns updated follow state. */
  followProfile(
    creds: FediverseCredentials,
    profile: Pick<FediverseProfile, 'id' | 'did' | 'handle'>
  ): Promise<Partial<FediverseProfile>>;

  /** Unfollow a profile. */
  unfollowProfile(
    creds: FediverseCredentials,
    profile: Pick<FediverseProfile, 'id' | 'did' | 'handle' | 'followRecordUri'>
  ): Promise<void>;

  /** Fetch recent notifications. */
  getNotifications(creds: FediverseCredentials): Promise<FediverseNotification[]>;

  /** Look up a profile by handle or ID. */
  lookupProfile(creds: FediverseCredentials, handleOrId: string): Promise<FediverseProfile>;
}

// ─── Error ──────────────────────────────────────────────────────────────────

export type FediverseErrorCode =
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'UNSUPPORTED'
  | 'API_ERROR';

export class FediverseError extends Error {
  constructor(
    public readonly protocol: FediverseProtocol,
    public readonly code: FediverseErrorCode,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(`[${protocol}] ${code}: ${message}`);
    this.name = 'FediverseError';
  }
}

// ─── Firestore shape ─────────────────────────────────────────────────────────
// Stored at: users/{uid}/fediverseAccounts/{accountId}

export interface FediverseAccountDoc {
  id: string;
  protocol: FediverseProtocol;
  handle: string;
  displayName: string;
  avatarUrl: string;
  instanceUrl: string;
  profileUrl: string;
  credentials: FediverseCredentials;
  connectedAt: number;
  isActive: boolean;
}
