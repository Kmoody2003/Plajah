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

// ─── Bluesky helpers ──────────────────────────────────────────────────────────

/**
 * Compute byte-indexed facets for all URLs in a piece of text.
 * Bluesky requires these for links to be rendered clickably.
 * Uses TextEncoder so multi-byte characters are handled correctly.
 */
function buildUrlFacets(
  text: string,
  urls: string[],
): Array<{
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri: string }>;
}> {
  const enc = new TextEncoder();
  const facets: ReturnType<typeof buildUrlFacets> = [];

  for (const url of urls) {
    let searchFrom = 0;
    while (true) {
      const charIdx = text.indexOf(url, searchFrom);
      if (charIdx === -1) break;
      const byteStart = enc.encode(text.slice(0, charIdx)).length;
      const byteEnd = byteStart + enc.encode(url).length;
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      });
      searchFrom = charIdx + url.length;
    }
  }
  return facets;
}

/**
 * Upload a remote image to the Bluesky PDS blob store and return the
 * blob reference for inclusion in an embed. Fails gracefully to undefined.
 */
async function uploadThumbToBluesky(
  thumbnailUrl: string,
  creds: FediverseCredentials,
): Promise<Record<string, unknown> | undefined> {
  try {
    const pds = (creds.pdsUrl ?? 'https://bsky.social').replace(/\/$/, '');
    const imgRes = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) return undefined;
    const buffer = await imgRes.arrayBuffer();
    const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';

    const res = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': mimeType,
      },
      body: buffer,
    });
    if (!res.ok) return undefined;
    const data = await res.json() as { blob: Record<string, unknown> };
    return data.blob;
  } catch {
    return undefined;
  }
}

/**
 * Build a complete Bluesky post record (app.bsky.feed.post) from a
 * BroadcastPayload, including URL facets and an optional link card embed.
 */
async function buildBlueskyRecord(
  payload: BroadcastPayload,
  creds: FediverseCredentials,
): Promise<Record<string, unknown>> {
  const { text, uri, title, description, thumbnail, langs } = payload;

  // Append URI to text if not already present
  const body = uri && !text.includes(uri) ? `${text}\n\n${uri}` : text;
  const allUrls = uri ? [uri] : [];
  const facets = buildUrlFacets(body, allUrls);

  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: body,
    createdAt: new Date().toISOString(),
    langs: langs ?? ['en'],
  };

  if (facets.length) record.facets = facets;

  // Build external link card embed when a URI is present
  if (uri) {
    let thumb: Record<string, unknown> | undefined;
    if (thumbnail) {
      thumb = await uploadThumbToBluesky(thumbnail, creds);
    }

    const externalEmbed: Record<string, unknown> = {
      $type: 'app.bsky.embed.external',
      external: {
        uri,
        title: title ?? 'Plajah',
        description: description ?? '',
        ...(thumb ? { thumb } : {}),
      },
    };
    record.embed = externalEmbed;
  }

  return record;
}

// ─── Per-network dispatchers ──────────────────────────────────────────────────

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
  });

  return {
    accountId: account.id,
    protocol: 'mastodon',
    postId: post.id,
    postUrl: post.url,
  };
}

async function postToBluesky(
  account: FediverseAccount,
  payload: BroadcastPayload,
): Promise<BroadcastOutcome> {
  const pds = (account.credentials.pdsUrl ?? 'https://bsky.social').replace(/\/$/, '');
  const record = await buildBlueskyRecord(payload, account.credentials);

  const res = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repo: account.credentials.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });

  if (res.status === 400) {
    const err = await res.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (String(err.error).includes('ExpiredToken') || String(err.error).includes('InvalidToken')) {
      throw new FediverseError('bluesky', 'AUTH_EXPIRED', 'Bluesky session expired — reconnect');
    }
    throw new FediverseError('bluesky', 'API_ERROR', String(err.message ?? err.error ?? 'Post failed'));
  }
  if (!res.ok) {
    throw new FediverseError('bluesky', 'API_ERROR', `HTTP ${res.status}`);
  }

  const data = await res.json() as { uri: string; cid: string };
  const rkey = data.uri.split('/').at(-1) ?? '';
  const handle = account.handle.replace(/^@/, '');
  return {
    accountId: account.id,
    protocol: 'bluesky',
    postId: data.cid,
    postUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
  };
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
