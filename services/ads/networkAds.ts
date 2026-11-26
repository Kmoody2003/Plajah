/**
 * Network ads: the share of Plajah's ad inventory filled by an outside network (Google Ad Manager /
 * AdSense) instead of Plajah's own campaigns. Pure rules only, no browser or Firestore, so the server
 * (routes/adPlatform.ts) and the app read the same ones and the tests can pin them.
 *
 *   • The admin sets it up in Ad Platform → Rotation mix (stored at systemConfig/settings.adNetwork).
 *   • The third-party % in the same screen (adRatios.thirdParty) is the share of rail slots it gets.
 *   • Child accounts, anyone under 18 and education accounts never get network ads on any surface.
 *   • Anything missing or invalid means "off": a half-filled form never puts an empty box on screen.
 */

export interface AdNetworkConfig {
  /** Master switch. Off = every surface shows only Plajah's own ads. */
  enabled: boolean;
  /** Google Ad Manager network code (digits), e.g. 21812345678. */
  networkCode: string;
  /** Ad Manager ad unit for the side ad panel, e.g. /21812345678/plajah_rail. */
  railUnitPath: string;
  /** VAST tag (from Ad Manager) for TV / FAST channel ad breaks. */
  videoTagUrl: string;
  /** VAST tag for the Plajah FM tune-in spot. Audio or video creatives both work. */
  audioTagUrl: string;
  /** AdSense publisher id (ca-pub-…). Used by web games and written into ads.txt. */
  adsensePubId: string;
  /** Show Google's ads in the web games (AdSense for Games: a short ad as the game loads). */
  gamesEnabled: boolean;
  /** Extra ads.txt lines from other sellers, one per line. The AdSense line is added for you. */
  adsTxtExtra: string;
  /** Use Google's public sample units instead of yours: safe to switch on before approval. */
  testMode: boolean;
  /** Treat signed-out visitors like child accounts (no network ads). Off = general audience. */
  restrictSignedOut: boolean;
  updatedAt?: number;
}

export const DEFAULT_AD_NETWORK: AdNetworkConfig = {
  enabled: false,
  networkCode: '',
  railUnitPath: '',
  videoTagUrl: '',
  audioTagUrl: '',
  adsensePubId: '',
  gamesEnabled: false,
  adsTxtExtra: '',
  testMode: false,
  restrictSignedOut: false,
};

/** Google's published sample inventory: always fills, never pays. */
export const GOOGLE_TEST_RAIL_UNIT = '/6355419/Travel/Europe';
export const GOOGLE_TEST_VAST =
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=';

/** Google's certification authority id for AdSense / Ad Manager seller lines in ads.txt. */
export const GOOGLE_ADS_TXT_CERT = 'f08c47fec0942fa0';

const NETWORK_CODE = /^\d{3,20}$/;
const UNIT_PATH = /^\/\d{3,20}(\/[A-Za-z0-9_.\-]{1,100}){1,5}$/;
const PUB_ID = /^(ca-)?pub-\d{10,20}$/;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Only https VAST tags on Google's ad servers or a host the admin typed — never javascript:, never http. */
export function cleanTagUrl(v: unknown): string {
  const s = str(v, 2000);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch { return ''; }
}

/** Keep only well-formed ads.txt records ("domain, id, DIRECT|RESELLER[, cert]") and comments. */
export function cleanAdsTxtLines(v: unknown): string {
  return str(v, 20_000)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l === '' || l.startsWith('#') || /^[A-Za-z0-9.\-]+\s*,\s*[A-Za-z0-9_.\-]+\s*,\s*(DIRECT|RESELLER)\s*(,\s*[A-Za-z0-9]+)?\s*$/i.test(l)
      || /^(contact|subdomain|ownerdomain|managerdomain)\s*=\s*\S+$/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Whatever is stored (or posted by the admin form) → a config the app can trust. */
export function normalizeAdNetwork(raw: unknown): AdNetworkConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const networkCode = str(r.networkCode, 20);
  const railUnitPath = str(r.railUnitPath, 300);
  const pub = str(r.adsensePubId, 40);
  return {
    enabled: r.enabled === true,
    networkCode: NETWORK_CODE.test(networkCode) ? networkCode : '',
    railUnitPath: UNIT_PATH.test(railUnitPath) ? railUnitPath : '',
    videoTagUrl: cleanTagUrl(r.videoTagUrl),
    audioTagUrl: cleanTagUrl(r.audioTagUrl),
    adsensePubId: PUB_ID.test(pub) ? (pub.startsWith('ca-') ? pub : `ca-${pub}`) : '',
    gamesEnabled: r.gamesEnabled === true,
    adsTxtExtra: cleanAdsTxtLines(r.adsTxtExtra),
    testMode: r.testMode === true,
    restrictSignedOut: r.restrictSignedOut === true,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : undefined,
  };
}

/** What each surface should actually load: null = show Plajah's own ads only. */
export function railUnitFor(c: AdNetworkConfig): string | null {
  if (!c.enabled) return null;
  if (c.testMode) return GOOGLE_TEST_RAIL_UNIT;
  return c.railUnitPath || null;
}
export function videoTagFor(c: AdNetworkConfig): string | null {
  if (!c.enabled) return null;
  return c.testMode ? GOOGLE_TEST_VAST : c.videoTagUrl || null;
}
export function audioTagFor(c: AdNetworkConfig): string | null {
  if (!c.enabled) return null;
  return c.testMode ? GOOGLE_TEST_VAST : c.audioTagUrl || c.videoTagUrl || null;
}
export function gamesPubFor(c: AdNetworkConfig): string | null {
  if (!c.enabled || !c.gamesEnabled) return null;
  return c.adsensePubId || (c.testMode ? 'ca-pub-0000000000000000' : null);
}

/** Fill in the VAST macros Google expects at request time: a fresh correlator, the page, a size. */
export function finalizeVastUrl(tag: string, opts: { pageUrl?: string; width?: number; height?: number; now?: number; maxAdSec?: number } = {}): string {
  try {
    const u = new URL(tag);
    if (u.hostname.endsWith('doubleclick.net') || u.hostname.endsWith('g.doubleclick.net')) {
      u.searchParams.set('correlator', String(opts.now ?? Date.now()));
      if (opts.pageUrl && !u.searchParams.get('url')) u.searchParams.set('url', opts.pageUrl);
      if (opts.width && opts.height && !u.searchParams.get('sz')) u.searchParams.set('sz', `${Math.round(opts.width)}x${Math.round(opts.height)}`);
      if (opts.maxAdSec) u.searchParams.set('max_ad_duration', String(Math.round(opts.maxAdSec * 1000)));
    }
    return u.toString();
  } catch { return tag; }
}

/** The ads.txt file Plajah serves at /ads.txt. */
export function buildAdsTxt(c: AdNetworkConfig): string {
  const lines: string[] = ['# Plajah ads.txt: authorized sellers of Plajah ad inventory'];
  const pub = c.adsensePubId.replace(/^ca-/, '');
  if (pub) lines.push(`google.com, ${pub}, DIRECT, ${GOOGLE_ADS_TXT_CERT}`);
  if (c.adsTxtExtra) lines.push(c.adsTxtExtra);
  if (lines.length === 1) lines.push('# No sellers are authorized yet.');
  return lines.join('\n') + '\n';
}

// ── Who may see network ads ──────────────────────────────────────────────────

export type AdAudience = 'general' | 'restricted';

export interface AudienceInputs {
  signedIn: boolean;
  isChild?: boolean;
  accountType?: string;
  birthYear?: number;
  /** services/intimateGating.isEducationAccount(profile) */
  isEducation?: boolean;
  now?: number;
}

/** 'restricted' = no network ads anywhere. Under-18 counts by birth year (the conservative reading). */
export function adAudienceFor(p: AudienceInputs, cfg: Pick<AdNetworkConfig, 'restrictSignedOut'>): AdAudience {
  if (!p.signedIn) return cfg.restrictSignedOut ? 'restricted' : 'general';
  if (p.isChild || String(p.accountType || '').toUpperCase() === 'CHILD' || p.isEducation) return 'restricted';
  if (typeof p.birthYear === 'number' && p.birthYear > 1900) {
    const year = new Date(p.now ?? Date.now()).getUTCFullYear();
    // Birth year only: someone turning 18 this year may still be 17, so they count as under 18.
    if (year - p.birthYear <= 18) return 'restricted';
  }
  return 'general';
}

/** Placeholder url for the network ad's reserved spot in a TV break (services/fast/breakPlan). */
export const NETWORK_SPOT_URL = 'network:vast';

/** How long a TV break gives the network ad: none in short breaks, 15 s in medium ones, else 30 s. */
export function networkSpotSec(breakSec: number): number {
  if (!Number.isFinite(breakSec) || breakSec < 40) return 0;
  return breakSec >= 75 ? 30 : 15;
}

/** The key the app writes so same-origin pages (the web games) know the viewer's audience. */
export const AD_AUDIENCE_STORAGE_KEY = 'plajah.adAudience';

// ── The rail's share ─────────────────────────────────────────────────────────

/**
 * Spread network slots through Plajah's own rotation so they make up `pct`% of it.
 * With n house slots, k network slots gives k / (n + k) = pct  →  k = n·pct / (100 − pct).
 */
export function interleaveNetworkSlots<T>(house: T[], pct: number, make: (i: number) => T): T[] {
  const share = Math.max(0, Math.min(90, Number.isFinite(pct) ? pct : 0));
  if (!house.length || share <= 0) return house;
  const k = Math.max(1, Math.round((house.length * share) / (100 - share)));
  const total = house.length + k;
  const out: T[] = [];
  let placed = 0;
  let h = 0;
  for (let i = 0; i < total; i++) {
    // Place network slot j at the position that keeps them evenly spaced; never first (Plajah leads).
    const due = Math.floor(((placed + 1) * total) / (k + 1));
    if (placed < k && i >= due && i > 0) out.push(make(placed++));
    else if (h < house.length) out.push(house[h++]);
    else out.push(make(placed++));
  }
  return out;
}
