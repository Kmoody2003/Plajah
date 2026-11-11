// Podcasting 2.0 (https://podcastindex.org/namespace/1.0) settings for one Plajah album feed.
// Stored server-only at podcast20Feeds/{albumId}; every field is optional and every tag stays off until data is present.

export const PODCAST_NS = 'https://podcastindex.org/namespace/1.0';

export const PODCAST_MEDIUMS = [
  'podcast', 'music', 'video', 'film', 'audiobook', 'newsletter', 'blog', 'publisher', 'course',
  'mixed',
  'podcastL', 'musicL', 'videoL', 'filmL', 'audiobookL', 'newsletterL', 'blogL', 'publisherL', 'courseL',
] as const;
export type PodcastMedium = typeof PODCAST_MEDIUMS[number];

export interface FundingLink { url: string; label?: string }

/** podcast:person. role/group follow the Podcast Taxonomy (https://github.com/Podcastindex-org/podcast-namespace/blob/main/taxonomy.json). */
export interface PodcastPerson { name: string; role?: string; group?: string; img?: string; href?: string }

/** podcast:location — geo is an RFC 5870 geo: URI, osm is an OpenStreetMap [N|W|R]id. */
export interface PodcastLocation { name: string; geo?: string; osm?: string; rel?: 'subject' | 'creator' }

export interface PodcastLicense { name: string; url?: string }

export interface PodcastTxt { value: string; purpose?: string }

export interface RemoteItem { feedGuid: string; feedUrl?: string; itemGuid?: string; medium?: PodcastMedium; title?: string }

/**
 * One payee in podcast:value. Payments stream from the listener's app straight to `address`
 * (their own node or Lightning address). Plajah never receives or holds any of it, and takes no
 * share unless the owner lists Plajah here explicitly.
 */
export interface ValueRecipient {
  name: string;
  /** 'node' = 66-hex Lightning node pubkey (keysend). 'lnaddress' = name@domain Lightning address. */
  type: 'node' | 'lnaddress';
  address: string;
  /** Percentage share (whole or decimal). Non-fee recipients must sum to 100. */
  split: number;
  /** keysend TLV record for routing to a wallet behind a shared node (e.g. 696969). */
  customKey?: string;
  customValue?: string;
  /** Spec "fee" recipient: taken off the top before the shared splits. Only when the owner adds one. */
  fee?: boolean;
}

export interface ValueBlock {
  /** Only lightning is offered today. */
  type: 'lightning';
  method: 'keysend';
  /** Suggested amount per minute, in BTC (spec unit), e.g. "0.00000005000". */
  suggested?: string;
  recipients: ValueRecipient[];
}

export interface Chapter {
  startTime: number;
  title?: string;
  img?: string;
  url?: string;
  /** false = hidden from the table of contents (spec "toc"). */
  toc?: boolean;
  endTime?: number;
}

export interface Soundbite { startTime: number; duration: number; title?: string }

export interface AlternateEnclosure {
  type: string;
  uri: string;
  length?: number;
  bitrate?: number;
  height?: number;
  lang?: string;
  title?: string;
  rel?: string;
  default?: boolean;
}

export interface ExternalTranscript { url: string; type: 'text/vtt' | 'application/x-subrip' | 'application/json' | 'text/html' | 'text/plain'; language?: string; captions?: boolean }

/** Extras for one episode (track). */
export interface EpisodeExtras {
  chapters?: Chapter[];
  soundbites?: Soundbite[];
  transcripts?: ExternalTranscript[];
  persons?: PodcastPerson[];
  location?: PodcastLocation;
  alternateEnclosures?: AlternateEnclosure[];
  /** ActivityPub note (or other) URI where replies to this episode live. */
  socialInteract?: { uri: string; protocol?: 'activitypub' | 'atproto' | 'twitter' | 'lightning' | 'nostr' | 'matrix' | 'hive' | 'disabled'; accountId?: string; accountUrl?: string };
  seasonName?: string;
  episodeDisplay?: string;
  /** Item-level value block overriding the channel one (e.g. a featured artist on one track). */
  value?: ValueBlock;
  /** Real publish time (ms). Falls back to the track's own timestamps, then the album's. */
  publishedAt?: number;
}

export type LiveStatus = 'pending' | 'live' | 'ended';

export interface LiveItemSettings {
  id: string;
  title: string;
  description?: string;
  status: LiveStatus;
  start: number;
  end?: number;
  /** The public stream (HLS .m3u8 or Icecast mp3). */
  streamUrl: string;
  streamType?: string;
  image?: string;
  /** Where a listener can watch/chat (e.g. the Plajah On-air page). */
  contentLinks?: { href: string; label?: string }[];
  persons?: PodcastPerson[];
  socialInteract?: EpisodeExtras['socialInteract'];
  value?: ValueBlock;
}

export interface Podcast20Settings {
  /** Owner opt-in for publishing a public feed of this album when it is not already a podcast album. */
  enabled?: boolean;
  medium?: PodcastMedium;
  locked?: boolean;
  /** Email shown in podcast:locked owner=, used by hosts to verify an import. */
  lockedOwner?: string;
  /** Pinned podcast:guid. Set on first save so moving the feed URL never changes the show's identity. */
  guid?: string;
  funding?: FundingLink[];
  persons?: PodcastPerson[];
  location?: PodcastLocation;
  license?: PodcastLicense;
  txt?: PodcastTxt[];
  podroll?: RemoteItem[];
  /** Channel-level remote items (list feeds: musicL / podcastL ...). */
  remoteItems?: RemoteItem[];
  value?: ValueBlock;
  liveItems?: LiveItemSettings[];
  episodes?: Record<string, EpisodeExtras>;
  /** Server bookkeeping. */
  ownerId?: string;
  updatedAt?: number;
  podcastIndexNotifiedAt?: number;
}

/** What the feed builder needs besides the settings: where things are served. */
export interface Podcast20FeedContext {
  settings: Podcast20Settings;
  /** The canonical public URL of this feed (atom:link self + podcast:guid source). */
  feedUrl?: string;
  /** URL of the chapters JSON for a track, when it has chapters. */
  chaptersUrl?: (trackId: string) => string | undefined;
  /** Generated transcript URLs for a track (VTT/SRT), when it has timed text. */
  transcriptUrls?: (trackId: string) => { url: string; type: ExternalTranscript['type']; captions?: boolean; language?: string }[];
  /** Album license id (licensingService ContentLicenseId) used when settings.license is unset. */
  albumLicenseId?: string;
}
