// ─── broadcastToDecentralizedWeb ─────────────────────────────────────────────
// SERVER-SIDE ONLY — do not import from browser/React code.
//
// Maps a unified BroadcastPayload into the precise format each network demands:
//   • Mastodon: status text with URL appended (instance auto-generates link card
//     from OG tags, so no extra work needed)
//   • Bluesky: app.bsky.feed.post with computed byte-indexed URL facets and an
//     app.bsky.embed.external link card (uploads thumbnail blob when provided)
//
// Both networks are called concurrently via Promise.allSettled so a failure on
// one network never blocks or corrupts the result from the other.

import { v4 as uuidv4 } from 'uuid';
import { decryptCreds } from './auth';
import { mastodonAdapter } from './mastodon';
import { blueskyadapter } from './bluesky';
import { threadsAdapter } from './threads';
import type {
  FediverseAccount, FediverseProtocol, FediverseCredentials,
} from './types';
import { FediverseError } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BroadcastPayload {
  /** Main post text. Keep under 500 chars for Mastodon / 300 chars for Bluesky. */
  text: string;
  /** URL to a Plajah resource (video, album, post). Appended to text and used
   *  to build a Bluesky link card embed. */
  uri?: string;
  /** OG title for the Bluesky link card. Defaults to "Plajah" if omitted. */
  title?: string;
  /** OG description for the Bluesky link card. */
  description?: string;
  /** Public thumbnail URL for the Bluesky link card (uploaded as a blob). */
  thumbnail?: string;
  /** BCP-47 language tags e.g. ['en']. Default: ['en']. */
  langs?: string[];
  /** Public https image URLs to attach (max 4). Bluesky: uploaded as blobs; Mastodon: uploaded as media. */
  mediaUrls?: string[];
}

export interface BroadcastOutcome {
  accountId: string;
  protocol: FediverseProtocol;
  postId: string;
  postUrl: string;
}

export interface BroadcastResult {
  succeeded: BroadcastOutcome[];
  failed: { accountId: string; protocol: FediverseProtocol; error: string }[];
}

// ─── Bluesky / Mastodon dispatchers ───────────────────────────────────────────
// Both go through the adapters: Bluesky gets real facets (links, @mentions, #tags), uploaded images or a link card,
// and Mastodon gets uploaded media. Doing it here once keeps the Studio, the cron publisher and the chat share on
// the same behaviour.

const BSKY_LIMIT = 300;
const graphemes = (t: string): string[] =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }).segment(t), (x: any) => x.segment)
    : Array.from(t);

/**
 * Fit "text + link" into Bluesky's 300-grapheme limit by trimming the TEXT (never the link), so a long caption
 * still posts with its link instead of failing at the PDS.
 */
export function fitForBluesky(text: string, uri?: string): string {
  const withLink = (t: string) => (uri && !t.includes(uri) ? `${t}\n\n${uri}` : t);
  if (graphemes(withLink(text)).length <= BSKY_LIMIT) return withLink(text);
  const reserved = uri ? graphemes(`\n\n${uri}`).length : 0;
  const budget = Math.max(0, BSKY_LIMIT - reserved - 1);
  const body = graphemes(text.replace(uri ?? '', '').trim()).slice(0, budget).join('').trimEnd();
  return withLink(`${body}…`);
}

async function postToMastodon(
  account: FediverseAccount,
  payload: BroadcastPayload,
): Promise<BroadcastOutcome> {
  const { text, uri } = payload;
  // Mastodon auto-generates link cards from OG tags; just include the URL
  const status = uri && !text.includes(uri) ? `${text}\n\n${uri}` : text;

  const post = await mastodonAdapter.createPost(account.credentials, status, {
    visibility: 'public',
    langs: payload.langs,
    images: payload.mediaUrls?.slice(0, 4).map(url => ({ url })),
  });

  return { accountId: account.id, protocol: 'mastodon', postId: post.id, postUrl: post.url };
}

async function postToBluesky(
  account: FediverseAccount,
  payload: BroadcastPayload,
): Promise<BroadcastOutcome> {
  const images = payload.mediaUrls?.slice(0, 4).map(url => ({ url }));
  const post = await blueskyadapter.createPost(account.credentials, fitForBluesky(payload.text, payload.uri), {
    langs: payload.langs,
    // Pictures win; otherwise a link gets a card (with the thumbnail uploaded as a blob).
    ...(images?.length ? { images } : payload.uri ? { link: { uri: payload.uri, title: payload.title ?? 'Plajah', description: payload.description, thumbUrl: payload.thumbnail } } : {}),
  });
  return { accountId: account.id, protocol: 'bluesky', postId: post.id, postUrl: post.url };
}

async function postToThreads(
  account: FediverseAccount,
  payload: BroadcastPayload,
): Promise<BroadcastOutcome> {
  const { text, uri } = payload;
  const content = uri && !text.includes(uri) ? `${text}\n\n${uri}` : text;
  const post = await threadsAdapter.createPost(account.credentials, content);
  return {
    accountId: account.id,
    protocol: 'threads',
    postId: post.id,
    postUrl: post.url,
  };
}

// ─── Dispatcher map ───────────────────────────────────────────────────────────

const DISPATCH: Record<
  FediverseProtocol,
  (account: FediverseAccount, payload: BroadcastPayload) => Promise<BroadcastOutcome>
> = {
  mastodon: postToMastodon,
  bluesky: postToBluesky,
  threads: postToThreads,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Broadcast a unified payload to every active Fediverse account tied to `uid`.
 * Pass `targetAccountIds` to restrict posting to a subset of accounts.
 *
 * @param accounts      The user's decrypted FediverseAccount list (from auth service)
 * @param payload       Unified content payload
 * @param targetIds     Optional whitelist of account IDs
 */
export async function broadcastToDecentralizedWeb(
  accounts: FediverseAccount[],
  payload: BroadcastPayload,
  targetIds?: string[],
): Promise<BroadcastResult> {
  const targets = accounts.filter(a =>
    a.isActive && (!targetIds?.length || targetIds.includes(a.id))
  );

  if (!targets.length) {
    return { succeeded: [], failed: [] };
  }

  const settlements = await Promise.allSettled(
    targets.map(acc => DISPATCH[acc.protocol](acc, payload))
  );

  const succeeded: BroadcastOutcome[] = [];
  const failed: BroadcastResult['failed'] = [];

  for (let i = 0; i < settlements.length; i++) {
    const s = settlements[i];
    if (s.status === 'fulfilled') {
      succeeded.push(s.value);
    } else {
      failed.push({
        accountId: targets[i].id,
        protocol: targets[i].protocol,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  }

  return { succeeded, failed };
}
