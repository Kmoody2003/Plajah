// Steam link for the Plajah Gamer Network — the pure + fetch half (routes/gamerNet.ts owns storage).
//
//   1. Ownership: Steam OpenID 2.0. The player signs in on steamcommunity.com and Steam redirects back with a
//      signed assertion; we ask Steam to check the signature (check_authentication) and read the SteamID64 from
//      the claimed id. Nobody types an ID, so nobody can link someone else's account.
//   2. Library: Steam Web API behind the server-only env key STEAM_WEB_API_KEY — GetPlayerSummaries (is the
//      profile public?), GetOwnedGames (playtime_forever, minutes), GetPlayerAchievements per game.
//   3. Import: planImports() diffs the library against the baseline stored on the link and returns only the
//      change in minutes and achievements per game. Baselines only ever go up (max), so refunds, hidden games
//      or a Steam-side reset can never make a later sync count the same playtime twice.
//
// Every network call goes through an injected fetch, so tests and the games lab run with no key and no Steam.

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<any> }>;

export const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const API = 'https://api.steampowered.com';

// ── 1. OpenID ─────────────────────────────────────────────────────────────────────────────────
/** URL that sends the player to Steam's sign-in page. `loginBase` is overridable only for the offline lab. */
export function steamLoginUrl(returnTo: string, realm: string, loginBase = STEAM_OPENID): string {
  const q = new URLSearchParams({
    'openid.ns': OPENID_NS, 'openid.mode': 'checkid_setup', 'openid.return_to': returnTo, 'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT, 'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${loginBase}?${q.toString()}`;
}

export type OpenIdCheck = { ok: true; steamId: string } | { ok: false; reason: string };

/**
 * Verify Steam's redirect back to us. `params` is every query parameter Steam sent; `expectedReturnTo` is the
 * exact return_to we generated (it carries the one-time state), so an assertion minted for another site or
 * another sign-in attempt is refused before we even ask Steam.
 */
export async function verifySteamAssertion(params: Record<string, string>, expectedReturnTo: string, fetchFn: Fetch): Promise<OpenIdCheck> {
  if (params['openid.mode'] !== 'id_res') return { ok: false, reason: params['openid.mode'] === 'cancel' ? 'cancelled' : 'not a sign-in response' };
  if (params['openid.ns'] !== OPENID_NS) return { ok: false, reason: 'wrong OpenID namespace' };
  if (params['openid.op_endpoint'] !== STEAM_OPENID) return { ok: false, reason: 'not signed by Steam' };
  if (params['openid.return_to'] !== expectedReturnTo) return { ok: false, reason: 'return address mismatch' };
  const claimed = params['openid.claimed_id'] ?? '';
  const m = CLAIMED_RE.exec(claimed);
  if (!m || params['openid.identity'] !== claimed) return { ok: false, reason: 'no SteamID in the response' };
  const signed = (params['openid.signed'] ?? '').split(',');
  for (const f of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']) {
    if (!signed.includes(f)) return { ok: false, reason: `Steam did not sign ${f}` };
  }
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  try {
    const res = await fetchFn(STEAM_OPENID, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const text = res.ok ? await res.text() : '';
    if (!/(^|\n)is_valid:true(\n|$)/.test(text)) return { ok: false, reason: 'Steam rejected the sign-in' };
  } catch {
    return { ok: false, reason: 'could not reach Steam' };
  }
  return { ok: true, steamId: m[1] };
}

// ── 2. Web API ────────────────────────────────────────────────────────────────────────────────
export interface SteamSummary { steamId: string; name: string; avatar: string; profileUrl: string; isPublic: boolean }
export interface SteamGame { appid: number; name: string; minutes: number }

export class SteamApiError extends Error { constructor(msg: string, readonly code: 'private' | 'unavailable' | 'no-key') { super(msg); } }

async function getJson(fetchFn: Fetch, url: string): Promise<{ status: number; json: any }> {
  const res = await fetchFn(url);
  let json: any = null; try { json = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, json };
}

export async function steamSummary(fetchFn: Fetch, key: string, steamId: string): Promise<SteamSummary> {
  const { status, json } = await getJson(fetchFn, `${API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${steamId}`);
  const p = json?.response?.players?.[0];
  if (status !== 200 || !p) throw new SteamApiError('Steam did not return this profile', 'unavailable');
  return {
    steamId, name: String(p.personaname ?? '').slice(0, 64), avatar: String(p.avatarfull ?? p.avatar ?? '').slice(0, 500),
    profileUrl: String(p.profileurl ?? '').slice(0, 300), isPublic: Number(p.communityvisibilitystate) === 3,
  };
}

export async function steamOwnedGames(fetchFn: Fetch, key: string, steamId: string): Promise<SteamGame[]> {
  const { status, json } = await getJson(fetchFn, `${API}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`);
  if (status !== 200) throw new SteamApiError('Steam library unavailable', 'unavailable');
  const games = json?.response?.games;
  // A private profile (or private "Game details") answers 200 with an empty response object.
  if (!Array.isArray(games)) throw new SteamApiError('Your Steam game details are private', 'private');
  return games
    .filter((g: any) => Number.isInteger(g?.appid))
    .map((g: any) => ({ appid: g.appid, name: String(g.name ?? `App ${g.appid}`).slice(0, 120), minutes: Math.max(0, Math.floor(Number(g.playtime_forever) || 0)) }));
}

/** Unlocked achievement count, or null when the game has no achievements / stats (Steam answers 400). */
export async function steamAchievements(fetchFn: Fetch, key: string, steamId: string, appid: number): Promise<number | null> {
  try {
    const { status, json } = await getJson(fetchFn, `${API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&appid=${appid}`);
    const list = json?.playerstats?.achievements;
    if (status !== 200 || json?.playerstats?.success === false || !Array.isArray(list)) return null;
    return list.filter((a: any) => Number(a?.achieved) === 1).length;
  } catch { return null; }
}

// ── 3. Diff ───────────────────────────────────────────────────────────────────────────────────
/** Per game: minutes and achievements already imported; `c` = achievements were checked at least once. */
export interface Baseline { m: number; a: number; c?: boolean }
export type Baselines = Record<string, Baseline>;

/** Games worth touching this pass, most-played first: new playtime, or never checked for achievements. */
export function candidates(library: SteamGame[], base: Baselines): SteamGame[] {
  return library
    .filter(g => { const b = base[g.appid]; return !b || g.minutes > b.m || (!b.c && g.minutes > 0); })
    .sort((x, y) => y.minutes - x.minutes || x.appid - y.appid);
}

export interface PlannedImport { appid: number; name: string; minutes: number; achievements: number; next: Baseline }

/** The change since the baseline. `ach` is the fetched count (null = no stats / not fetched). */
export function planImport(g: SteamGame, b: Baseline | undefined, ach: number | null): PlannedImport {
  const prev = b ?? { m: 0, a: 0 };
  const a = ach ?? prev.a;
  return {
    appid: g.appid, name: g.name,
    minutes: Math.max(0, g.minutes - prev.m), achievements: Math.max(0, a - prev.a),
    next: { m: Math.max(prev.m, g.minutes), a: Math.max(prev.a, a), c: prev.c || g.minutes > 0 },
  };
}

/** Ledger key for one game's import: tied to the totals it brings the game up to, so a retried pass
 *  produces the same key (and is dropped), while a later pass with new playtime gets a new one. */
export const importKey = (steamId: string, appid: number, sync: number, next: Baseline) => `steam:${steamId}:${appid}:s${sync}:m${next.m}:a${next.a}`;

export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
