// ─── Commercial network insights (read side of the Marketing Kit) ────────────
// SERVER-SIDE ONLY. Pulls audience, reach/impressions and recent-post engagement for the accounts a user (or a
// managed business/org) has connected.
//
// Metric names follow Meta's 2025–26 changes (legacy impressions/fans metrics were removed across ALL Graph API
// versions; "views" replaced "impressions"):
//   Facebook Page  — page_media_view (views/impressions), page_total_media_view_unique (reach)        [read_insights]
//                    posts: reactions/comments/shares                                                  [pages_read_engagement]
//   Instagram      — user: reach, views, accounts_engaged, total_interactions (metric_type=total_value) [instagram_manage_insights]
//                    media: reach, views, likes, comments, shares, saved                                [instagram_manage_insights]
//   X              — public_metrics incl. impression_count (X bills per READ → long cache)
//   LinkedIn       — NOT AVAILABLE: member analytics need r_member_social (approved partners only)
//
// RESILIENCE RULE: Meta rejects a WHOLE insights request when any one metric in it is invalid/removed, and metrics
// keep being retired. So every metric is requested on its own and fails on its own — a retired metric becomes a
// quiet "unavailable" for that number, never a broken card. A missing permission is reported as such so the UI can
// tell the user to reconnect (existing connections predate the insights scopes).

import type { SuiteNetwork } from '../managerSuite/networks';
import type { SocialCredentials } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';
const DAY = 86_400_000;

export interface PostInsight {
  id: string;
  text: string;
  url?: string;
  createdAt: number;
  likes: number;
  comments: number;
  shares: number;
  /** Views (Meta's replacement for impressions) or X impressions. */
  views?: number;
  /** Unique accounts reached (Meta only). */
  reach?: number;
}

export type ReachStatus = 'ok' | 'needs_permission' | 'unavailable';

export interface HistoryPoint { day: string; followers?: number; reach?: number; views?: number }

export interface AccountInsights {
  accountId: string;
  network: SuiteNetwork | string;
  handle: string;
  followers?: number;
  following?: number;
  postCount?: number;
  /** Account-level, last 7 days. */
  reach7d?: number;
  views7d?: number;
  engaged7d?: number;
  /** Whether reach/views could be read, and why not. */
  reachStatus?: ReachStatus;
  reachNote?: string;
  recent: PostInsight[];
  totals: { likes: number; comments: number; shares: number; views: number; reach: number };
  /** Followers gained vs the oldest daily snapshot in the last ~8 days (only once snapshots exist). */
  growth?: { delta: number; days: number };
  /** Daily snapshots (oldest → newest) for trend lines. */
  history?: HistoryPoint[];
  fetchedAt: number;
  /** A reason this network can't report analytics (not an error — a platform limit). */
  unavailable?: string;
  error?: string;
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const snip = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
const emptyTotals = () => ({ likes: 0, comments: 0, shares: 0, views: 0, reach: 0 });

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
}

function totalsOf(recent: PostInsight[]) {
  return recent.reduce((t, p) => ({
    likes: t.likes + p.likes, comments: t.comments + p.comments, shares: t.shares + p.shares,
    views: t.views + (p.views ?? 0), reach: t.reach + (p.reach ?? 0),
  }), emptyTotals());
}

function base(accountId: string, network: string, handle: string): AccountInsights {
  return { accountId, network, handle, recent: [], totals: emptyTotals(), fetchedAt: Date.now() };
}

// ── One Meta insights metric, isolated ───────────────────────────────────────

type MetricResult = { value?: number; status: 'ok' | 'needs_permission' | 'unavailable'; note?: string };

/** Meta permission/auth failures: 10 (permission denied), 200–299 (permission range), 190 (token). */
const isPermissionError = (code: number) => code === 10 || (code >= 200 && code <= 299) || code === 190;

function classify(r: { ok: boolean; status: number; json: any }): MetricResult | null {
  if (r.ok) return null;
  const code = num(r.json?.error?.code);
  const msg = String(r.json?.error?.message || `HTTP ${r.status}`);
  if (isPermissionError(code)) return { status: 'needs_permission', note: msg.slice(0, 160) };
  return { status: 'unavailable', note: msg.slice(0, 160) };
}

/** Last value of a time-series style insights response ({data:[{values:[{value,end_time}]}]}). */
async function fbPageMetric(pageId: string, token: string, metric: string, period: 'day' | 'week' | 'days_28'): Promise<MetricResult> {
  const r = await getJson(`${GRAPH}/${pageId}/insights?metric=${metric}&period=${period}&access_token=${token}`);
  const bad = classify(r);
  if (bad) return bad;
  const values: any[] = r.json?.data?.[0]?.values || [];
  const last = values[values.length - 1]?.value;
  return typeof last === 'number' ? { status: 'ok', value: last } : { status: 'unavailable', note: 'No data returned' };
}

/** Instagram user-level metric over the last 7 days (metric_type=total_value). */
async function igUserMetric(igId: string, token: string, metric: string): Promise<MetricResult> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 7 * 86_400;
  const r = await getJson(`${GRAPH}/${igId}/insights?metric=${metric}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${token}`);
  const bad = classify(r);
  if (bad) return bad;
  const v = r.json?.data?.[0]?.total_value?.value;
  return typeof v === 'number' ? { status: 'ok', value: v } : { status: 'unavailable', note: 'No data returned' };
}

/** A single media/post metric (lifetime). */
async function objectMetric(objectId: string, token: string, metric: string): Promise<MetricResult> {
  const r = await getJson(`${GRAPH}/${objectId}/insights?metric=${metric}&access_token=${token}`);
  const bad = classify(r);
  if (bad) return bad;
  const d = r.json?.data?.[0];
  const v = d?.values?.[0]?.value ?? d?.total_value?.value;
  return typeof v === 'number' ? { status: 'ok', value: v } : { status: 'unavailable' };
}

/** Collapse several per-metric results into one account-level reach status. */
function foldStatus(results: MetricResult[]): { status: ReachStatus; note?: string } {
  if (results.some(r => r.status === 'ok')) return { status: 'ok' };
  const perm = results.find(r => r.status === 'needs_permission');
  if (perm) return { status: 'needs_permission', note: perm.note };
  return { status: 'unavailable', note: results.find(r => r.note)?.note };
}

// ── Facebook Page ────────────────────────────────────────────────────────────

async function facebookInsights(accountId: string, handle: string, creds: SocialCredentials): Promise<AccountInsights> {
  const out = base(accountId, 'facebook', handle);
  const t = encodeURIComponent(creds.accessToken);
  const page = await getJson(`${GRAPH}/${creds.pageId}?fields=fan_count,followers_count&access_token=${t}`);
  if (!page.ok) throw new Error(page.json?.error?.message || `Facebook ${page.status}`);
  out.followers = num(page.json.followers_count ?? page.json.fan_count);

  const [posts, views, reach] = await Promise.all([
    getJson(`${GRAPH}/${creds.pageId}/posts?fields=id,message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)&limit=10&access_token=${t}`),
    fbPageMetric(creds.pageId!, t, 'page_media_view', 'week'),
    fbPageMetric(creds.pageId!, t, 'page_total_media_view_unique', 'week'),
  ]);
  if (views.status === 'ok') out.views7d = views.value;
  if (reach.status === 'ok') out.reach7d = reach.value;
  const fold = foldStatus([views, reach]);
  out.reachStatus = fold.status; out.reachNote = fold.note;

  if (posts.ok) {
    out.recent = (posts.json.data || []).map((p: any): PostInsight => ({
      id: p.id, text: snip(p.message), url: p.permalink_url, createdAt: Date.parse(p.created_time) || 0,
      likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count),
    }));
    // Per-post views/reach — best effort (Meta has not published a stable post-level mapping for every post type),
    // only worth asking when page-level insights worked, and only for the top few to bound API calls.
    if (out.reachStatus === 'ok') {
      await Promise.all(out.recent.slice(0, 6).map(async (p) => {
        const [v, r] = await Promise.all([objectMetric(p.id, t, 'post_media_view'), objectMetric(p.id, t, 'post_total_media_view_unique')]);
        if (v.status === 'ok') p.views = v.value;
        if (r.status === 'ok') p.reach = r.value;
      }));
    }
  }
  return out;
}

// ── Instagram ────────────────────────────────────────────────────────────────

async function instagramInsights(accountId: string, handle: string, creds: SocialCredentials): Promise<AccountInsights> {
  const out = base(accountId, 'instagram', handle);
  const t = encodeURIComponent(creds.accessToken);
  const me = await getJson(`${GRAPH}/${creds.igUserId}?fields=followers_count,follows_count,media_count&access_token=${t}`);
  if (!me.ok) throw new Error(me.json?.error?.message || `Instagram ${me.status}`);
  out.followers = num(me.json.followers_count);
  out.following = num(me.json.follows_count);
  out.postCount = num(me.json.media_count);

  const [media, reach, views, engaged] = await Promise.all([
    getJson(`${GRAPH}/${creds.igUserId}/media?fields=id,caption,timestamp,permalink,like_count,comments_count&limit=10&access_token=${t}`),
    igUserMetric(creds.igUserId!, t, 'reach'),
    igUserMetric(creds.igUserId!, t, 'views'),
    igUserMetric(creds.igUserId!, t, 'accounts_engaged'),
  ]);
  if (reach.status === 'ok') out.reach7d = reach.value;
  if (views.status === 'ok') out.views7d = views.value;
  if (engaged.status === 'ok') out.engaged7d = engaged.value;
  const fold = foldStatus([reach, views, engaged]);
  out.reachStatus = fold.status; out.reachNote = fold.note;

  if (media.ok) {
    out.recent = (media.json.data || []).map((m: any): PostInsight => ({
      id: m.id, text: snip(m.caption), url: m.permalink, createdAt: Date.parse(m.timestamp) || 0,
      likes: num(m.like_count), comments: num(m.comments_count), shares: 0,
    }));
    if (out.reachStatus === 'ok') {
      await Promise.all(out.recent.slice(0, 6).map(async (p) => {
        const [v, r, s] = await Promise.all([objectMetric(p.id, t, 'views'), objectMetric(p.id, t, 'reach'), objectMetric(p.id, t, 'shares')]);
        if (v.status === 'ok') p.views = v.value;
        if (r.status === 'ok') p.reach = r.value;
        if (s.status === 'ok') p.shares = s.value ?? 0;
      }));
    }
  }
  return out;
}

// ── X ────────────────────────────────────────────────────────────────────────

async function xInsights(accountId: string, handle: string, creds: SocialCredentials, remoteId: string): Promise<AccountInsights> {
  const out = base(accountId, 'x', handle);
  const h = { Authorization: `Bearer ${creds.accessToken}` };
  const me = await getJson(`https://api.twitter.com/2/users/${remoteId}?user.fields=public_metrics`, h);
  if (me.status === 401) throw new Error('X session expired — reconnect');
  if (me.status === 402 || me.status === 403) throw new Error('X API credits needed to read analytics');
  if (!me.ok) throw new Error(me.json?.detail || me.json?.title || `X ${me.status}`);
  const pm = me.json.data?.public_metrics || {};
  out.followers = num(pm.followers_count);
  out.following = num(pm.following_count);
  out.postCount = num(pm.tweet_count);
  const tw = await getJson(`https://api.twitter.com/2/users/${remoteId}/tweets?max_results=10&tweet.fields=public_metrics,created_at&exclude=retweets,replies`, h);
  if (tw.ok) {
    out.recent = (tw.json.data || []).map((p: any): PostInsight => ({
      id: p.id, text: snip(p.text), url: `https://x.com/i/status/${p.id}`, createdAt: Date.parse(p.created_at) || 0,
      likes: num(p.public_metrics?.like_count), comments: num(p.public_metrics?.reply_count),
      shares: num(p.public_metrics?.retweet_count) + num(p.public_metrics?.quote_count), views: num(p.public_metrics?.impression_count),
    }));
    out.reachStatus = 'ok';
    out.views7d = out.recent.filter(p => Date.now() - p.createdAt < 7 * DAY).reduce((n, p) => n + (p.views ?? 0), 0);
  }
  return out;
}

// ── Dispatcher + cache ───────────────────────────────────────────────────────

const TTL_MS: Record<string, number> = { x: 30 * 60_000, facebook: 5 * 60_000, instagram: 5 * 60_000 };
const cache = new Map<string, { at: number; data: AccountInsights }>();

export async function fetchAccountInsights(
  cacheKey: string, accountId: string, network: string, handle: string, creds: SocialCredentials, remoteId: string, force = false,
): Promise<AccountInsights> {
  if (network === 'linkedin') {
    return { ...base(accountId, network, handle), unavailable: 'LinkedIn only shares post analytics with approved partners, so Plajah can publish to LinkedIn but not report on it.' };
  }
  const hit = cache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < (TTL_MS[network] ?? 5 * 60_000)) return hit.data;
  try {
    const data = network === 'facebook' ? await facebookInsights(accountId, handle, creds)
      : network === 'instagram' ? await instagramInsights(accountId, handle, creds)
      : network === 'x' ? await xInsights(accountId, handle, creds, remoteId)
      : null;
    if (!data) return { ...base(accountId, network, handle), unavailable: 'No analytics for this network yet.' };
    data.totals = totalsOf(data.recent);
    cache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (e: any) {
    // Serve stale data over an error screen when we have it.
    if (hit) return { ...hit.data, error: String(e?.message || e).slice(0, 200) };
    return { ...base(accountId, network, handle), error: String(e?.message || e).slice(0, 200) };
  }
}
