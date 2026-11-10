// Games lab only: a stand-in for Steam so the whole link flow runs offline — the sign-in page, OpenID
// check_authentication and the three Web API calls. No key, no network, no real account.
// games-lab.vite.config.mjs passes labSteamFetch to the real router and serves labSteamLogin at /__steam-stub/login.

import { STEAM_OPENID } from '../../services/gamerNet/links/steam';

const LIBRARY = [
  { appid: 1145360, name: 'Hades', playtime_forever: 4260, ach: 38 },
  { appid: 413150, name: 'Stardew Valley', playtime_forever: 7815, ach: 29 },
  { appid: 367520, name: 'Hollow Knight', playtime_forever: 2940, ach: 41 },
  { appid: 730, name: 'Counter-Strike 2', playtime_forever: 1210, ach: 0 },
  { appid: 1086940, name: "Baldur's Gate 3", playtime_forever: 9120, ach: 34 },
  { appid: 620, name: 'Portal 2', playtime_forever: 0, ach: 0 },
];

/** Each lab uid gets its own fake SteamID so two tabs can both link. */
export const labSteamId = (uid: string) => `7656119${String([...uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)).padStart(10, '0').slice(0, 10)}`;

export async function labSteamFetch(url: string, init?: { method?: string }) {
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body });
  if (url === STEAM_OPENID && init?.method === 'POST') return reply(200, 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
  const q = new URL(url).searchParams;
  if (url.includes('/GetPlayerSummaries/')) return reply(200, { response: { players: [{ steamid: q.get('steamids'), personaname: 'lab-player', avatarfull: '', profileurl: '', communityvisibilitystate: 3 }] } });
  if (url.includes('/GetOwnedGames/')) return reply(200, { response: { game_count: LIBRARY.length, games: LIBRARY.map(({ ach: _a, ...g }) => g) } });
  if (url.includes('/GetPlayerAchievements/')) {
    const g = LIBRARY.find(x => x.appid === Number(q.get('appid')));
    if (!g?.ach) return reply(400, { playerstats: { success: false, error: 'Requested app has no stats' } });
    return reply(200, { playerstats: { success: true, achievements: Array.from({ length: g.ach + 5 }, (_, i) => ({ achieved: i < g.ach ? 1 : 0 })) } });
  }
  return reply(404, {});
}

/** The "Steam sign-in page": sends the browser straight back with a well-formed id_res assertion.
 *  The fake SteamID comes from the lab page's ?as= (via Referer), so alice and bob get different accounts. */
export function labSteamLogin(query: URLSearchParams, referer = ''): string {
  const returnTo = query.get('openid.return_to') ?? '/';
  let as = 'lab'; try { as = new URL(referer).searchParams.get('as') || 'lab'; } catch { /* no referer */ }
  const id = `https://steamcommunity.com/openid/id/${labSteamId(as)}`;
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_OPENID,
    'openid.claimed_id': id, 'openid.identity': id, 'openid.return_to': returnTo,
    'openid.response_nonce': `${new Date().toISOString().slice(0, 19)}Zlab`, 'openid.assoc_handle': 'lab',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', 'openid.sig': 'bGFi',
  });
  return `${returnTo}&${p.toString()}`;
}
