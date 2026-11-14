// Copyright notices (DMCA 17 U.S.C. § 512) — PURE: validation, strike counting, the counter-notice
// clock. No I/O, no Date.now(). Shared by routes/copyright.ts and components/DMCARequestForm.tsx so the
// form and the server reject the same incomplete notices.
//
// A takedown is only "notice" under § 512(c)(3) if it has every element, and a counter-notice only
// works under § 512(g)(3) with its own set — an incomplete one is answered with what's missing, not
// acted on. Plain-language drafting, not legal advice.

export type NoticeKind = 'takedown' | 'counter' | 'dispute';
export type NoticeStatus = 'received' | 'needs_info' | 'removed' | 'rejected' | 'counter_received' | 'restored' | 'retracted' | 'closed';

export const COPYRIGHT_AGENT_EMAIL = 'copyright@plajah.com';

/** Content a takedown can disable. Each maps to one Firestore document. */
export type TargetKind = 'album' | 'video' | 'post' | 'track';
export const TARGET_COLLECTION: Record<TargetKind, string> = { album: 'albums', video: 'videos', post: 'posts', track: 'tracks' };
export interface NoticeTarget { kind: TargetKind; id: string }

export interface NoticeInput {
  kind: NoticeKind;
  name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  org?: string;
  onBehalfOf?: string;
  /** takedown: the copyrighted work(s); counter: what was removed; dispute: the issue. */
  description: string;
  originalWork?: string;
  /** takedown: where the infringing material is; counter: where it was before removal. */
  urls: string[];
  /** counter: the takedown being answered, when known. */
  noticeId?: string;
  goodFaith?: boolean;
  perjury?: boolean;
  consentJurisdiction?: boolean;
  acceptService?: boolean;
  signature: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseNotice(raw: any): NoticeInput {
  const kind: NoticeKind = raw?.kind === 'counter' ? 'counter' : raw?.kind === 'dispute' ? 'dispute' : 'takedown';
  const urls = (Array.isArray(raw?.urls) ? raw.urls : typeof raw?.urls === 'string' ? raw.urls.split(/\s+/) : [])
    .map((u: unknown) => str(u, 500)).filter(Boolean).slice(0, 25);
  return {
    kind,
    name: str(raw?.name, 120), email: str(raw?.email, 200).toLowerCase(), phone: str(raw?.phone, 40),
    address: str(raw?.address, 400), country: str(raw?.country, 60),
    org: str(raw?.org, 160) || undefined, onBehalfOf: str(raw?.onBehalfOf, 160) || undefined,
    description: str(raw?.description, 4000), originalWork: str(raw?.originalWork, 1000) || undefined,
    urls, noticeId: str(raw?.noticeId, 80) || undefined,
    goodFaith: raw?.goodFaith === true, perjury: raw?.perjury === true,
    consentJurisdiction: raw?.consentJurisdiction === true, acceptService: raw?.acceptService === true,
    signature: str(raw?.signature, 120),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** What the notice is missing, in the words the sender sees. Empty = complete. */
export function missingElements(n: NoticeInput): string[] {
  const miss: string[] = [];
  if (!n.name) miss.push('your full legal name');
  if (!EMAIL.test(n.email)) miss.push('a working email address');
  if (n.kind !== 'dispute') {
    if (n.phone.replace(/\D/g, '').length < 7) miss.push('a phone number');
    if (n.address.length < 10) miss.push('a physical mailing address');
  }
  if (n.description.length < 10) miss.push(n.kind === 'counter' ? 'a description of the material that was removed' : n.kind === 'takedown' ? 'identification of the copyrighted work' : 'a description of the issue');
  if (n.kind !== 'dispute' && !n.urls.length) miss.push(n.kind === 'counter' ? 'where the material was before it was removed' : 'the location (URL) of the material on Plajah');
  if (n.kind === 'takedown') {
    if (!n.goodFaith) miss.push('the good-faith statement');
    if (!n.perjury) miss.push('the statement under penalty of perjury that you own the right or are authorised to act for the owner');
  }
  if (n.kind === 'counter') {
    if (!n.perjury) miss.push('the statement under penalty of perjury that the material was removed by mistake or misidentification');
    if (!n.consentJurisdiction) miss.push('consent to the jurisdiction of the court');
    if (!n.acceptService) miss.push('agreement to accept service of process from the person who sent the notice');
  }
  if (!n.signature) miss.push('your electronic signature');
  else if (n.name && !norm(n.signature).includes(norm(n.name).slice(0, 4))) miss.push('a signature that matches your legal name');
  return miss;
}

/** Plajah content URLs → targets, where the URL shape names one (admins can always add more). */
export function targetsFromUrls(urls: string[]): NoticeTarget[] {
  const out: NoticeTarget[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    let url: URL;
    try { url = new URL(u); } catch { continue; }
    if (!/(^|\.)plajah\.com$/i.test(url.hostname) && !/^localhost$/i.test(url.hostname)) continue;
    const q = url.searchParams;
    const pairs: Array<[TargetKind, string | null]> = [
      ['album', q.get('album') || q.get('albumId')], ['video', q.get('video') || q.get('videoId') || q.get('v')],
      ['post', q.get('post') || q.get('postId')], ['track', q.get('track') || q.get('trackId')],
    ];
    const m = /\/(album|albums|video|videos|watch|post|posts|track|tracks)\/([\w-]{6,128})/i.exec(url.pathname);
    if (m) {
      const k = m[1].toLowerCase();
      pairs.push([k.startsWith('album') ? 'album' : k.startsWith('post') ? 'post' : k.startsWith('track') ? 'track' : 'video', m[2]]);
    }
    for (const [kind, id] of pairs) {
      if (!id || !/^[\w-]{6,128}$/.test(id)) continue;
      const key = `${kind}:${id}`;
      if (!seen.has(key)) { seen.add(key); out.push({ kind, id }); }
    }
  }
  return out;
}

export function parseTargets(raw: unknown): NoticeTarget[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((t: any) => t && t.kind in TARGET_COLLECTION && typeof t.id === 'string' && /^[\w-]{6,128}$/.test(t.id))
    .map((t: any) => ({ kind: t.kind as TargetKind, id: t.id as string }))
    .slice(0, 25);
}

// ── Repeat infringers (§ 512(i)) ─────────────────────────────────────────────

export interface Strike { noticeId: string; at: number; status: 'active' | 'retracted' | 'restored'; target?: NoticeTarget }

export const STRIKE_WINDOW_MS = 365 * 86_400_000;
export const STRIKES_TO_CLOSE = 3;

export function activeStrikes(strikes: Strike[], now: number): Strike[] {
  return strikes.filter((s) => s.status === 'active' && now - s.at < STRIKE_WINDOW_MS);
}

/** One strike per notice, however many items it named. */
export function addStrike(strikes: Strike[], s: Strike): Strike[] {
  return strikes.some((x) => x.noticeId === s.noticeId) ? strikes : [...strikes, s];
}

export function clearStrike(strikes: Strike[], noticeId: string, why: 'retracted' | 'restored'): Strike[] {
  return strikes.map((s) => (s.noticeId === noticeId && s.status === 'active' ? { ...s, status: why } : s));
}

export function isRepeatInfringer(strikes: Strike[], now: number): boolean {
  return activeStrikes(strikes, now).length >= STRIKES_TO_CLOSE;
}

export const REPEAT_INFRINGER_RULE = 'repeat_copyright';
export const REPEAT_INFRINGER_TEXT =
  `Your account received ${STRIKES_TO_CLOSE} valid copyright notices within 12 months, so uploading and publishing are closed under Plajah's repeat-infringer policy. Strikes are removed when a notice is withdrawn or your material is restored after a counter-notice. You can appeal.`;

// ── The counter-notice clock (§ 512(g)(2)(C)) ────────────────────────────────

/** Add US business days (Mon–Fri; federal holidays not counted, so this errs early by at most a few days). */
export function addBusinessDays(at: number, days: number): number {
  const d = new Date(at);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.getTime();
}

/** Restore no sooner than 10 and no later than 14 business days after the counter-notice, unless the claimant sues. */
export function restoreWindow(counterAt: number): { earliest: number; latest: number } {
  // 11 so the earliest falls strictly after the 10th business day even with an uncounted holiday nearby.
  return { earliest: addBusinessDays(counterAt, 11), latest: addBusinessDays(counterAt, 14) };
}
