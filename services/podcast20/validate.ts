// Validation + normalisation for owner-submitted Podcasting 2.0 settings. Pure; the settings UI
// runs the same checks the server enforces.

import { isUuid } from './guid';
import {
  PODCAST_MEDIUMS,
  type Podcast20Settings, type ValueBlock, type ValueRecipient, type PodcastPerson, type PodcastLocation,
  type FundingLink, type RemoteItem, type LiveItemSettings, type EpisodeExtras, type Chapter, type Soundbite,
  type AlternateEnclosure, type ExternalTranscript, type PodcastMedium,
} from './types';

/** 33-byte compressed secp256k1 pubkey, hex. */
export const isNodePubkey = (s: string): boolean => /^0[23][0-9a-f]{64}$/i.test(s.trim());

/** name@domain.tld, the LUD-16 Lightning address form. */
export function isLightningAddress(s: string): boolean {
  const v = s.trim();
  if (v.length > 320) return false;
  const m = /^([a-z0-9._+-]{1,64})@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,63})$/i.exec(v);
  if (!m) return false;
  return !m[2].split('.').some(p => p.startsWith('-') || p.endsWith('-'));
}

export const isHttpsUrl = (s: unknown): s is string => {
  if (typeof s !== 'string' || s.length > 2048) return false;
  try { const u = new URL(s); return u.protocol === 'https:'; } catch { return false; }
};

const isHttpUrl = (s: unknown): s is string => {
  if (typeof s !== 'string' || s.length > 2048) return false;
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};

/** RFC 5870 geo URI, e.g. geo:30.2672,-97.7431 or geo:30.2,-97.7,150;u=350 */
export function isGeoUri(s: string): boolean {
  const m = /^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?(?:;u=\d+(?:\.\d+)?)?$/.exec(s.trim());
  if (!m) return false;
  return Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180;
}

export const isOsmRef = (s: string): boolean => /^[NWR]\d{1,12}(?:#\d{1,12})?$/.test(s.trim());

const isEmail = (s: string) => /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}\.[a-z]{2,63}$/i.test(s.trim());

export interface ValidationResult { ok: boolean; errors: string[]; value: Podcast20Settings }

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {});

const SPLIT_EPS = 0.001;

/** Check one value block. Errors are prefixed with `where`. */
export function validateValueBlock(raw: unknown, where: string, errors: string[]): ValueBlock | undefined {
  const r = rec(raw);
  const list = arr(r.recipients, 50);
  if (!list.length) return undefined;
  const recipients: ValueRecipient[] = [];
  list.forEach((x, i) => {
    const o = rec(x);
    const label = `${where} recipient ${i + 1}`;
    const name = str(o.name, 128);
    const address = str(o.address, 320);
    const type = o.type === 'node' || o.type === 'lnaddress' ? o.type : undefined;
    const split = num(o.split);
    if (!name) errors.push(`${label}: name is required`);
    if (!type) errors.push(`${label}: type must be "node" or "lnaddress"`);
    if (!address) errors.push(`${label}: address is required`);
    else if (type === 'node' && !isNodePubkey(address)) errors.push(`${label}: node address must be a 66-character hex pubkey starting with 02 or 03`);
    else if (type === 'lnaddress' && !isLightningAddress(address)) errors.push(`${label}: Lightning address must look like name@domain.com`);
    if (split === undefined || split <= 0 || split > 100) errors.push(`${label}: split must be more than 0 and at most 100`);
    const customKey = str(o.customKey, 64);
    const customValue = str(o.customValue, 256);
    if (customKey && !/^\d{1,20}$/.test(customKey)) errors.push(`${label}: customKey must be a numeric TLV record type`);
    if (customValue && !customKey) errors.push(`${label}: customValue needs a customKey`);
    if (customKey && type === 'lnaddress') errors.push(`${label}: customKey/customValue only apply to node (keysend) recipients`);
    recipients.push({
      name: name ?? '', type: (type ?? 'node') as ValueRecipient['type'],
      address: type === 'node' ? (address ?? '').toLowerCase() : (address ?? ''),
      split: split ?? 0,
      ...(customKey ? { customKey } : {}), ...(customValue ? { customValue } : {}),
      ...(o.fee === true ? { fee: true } : {}),
    });
  });
  const shared = recipients.filter(x => !x.fee).reduce((s, x) => s + x.split, 0);
  const fees = recipients.filter(x => x.fee).reduce((s, x) => s + x.split, 0);
  if (!recipients.some(x => !x.fee)) errors.push(`${where}: at least one non-fee recipient is required`);
  else if (Math.abs(shared - 100) > SPLIT_EPS) errors.push(`${where}: splits must add up to 100 (they add up to ${+shared.toFixed(3)})`);
  if (fees >= 100) errors.push(`${where}: fee recipients must take less than 100%`);
  const seen = new Set<string>();
  for (const x of recipients) {
    const k = `${x.type}:${x.address.toLowerCase()}:${x.customKey ?? ''}:${x.customValue ?? ''}`;
    if (seen.has(k)) errors.push(`${where}: ${x.address} is listed twice`);
    seen.add(k);
  }
  let suggested: string | undefined;
  if (r.suggested !== undefined && r.suggested !== '') {
    const s = String(r.suggested).trim();
    if (!/^\d{1,3}(?:\.\d{1,11})?$/.test(s) || Number(s) <= 0) errors.push(`${where}: suggested must be a positive BTC amount like 0.00000005000`);
    else suggested = s;
  }
  return { type: 'lightning', method: 'keysend', ...(suggested ? { suggested } : {}), recipients };
}

function persons(raw: unknown, where: string, errors: string[]): PodcastPerson[] | undefined {
  const out: PodcastPerson[] = [];
  arr(raw, 50).forEach((x, i) => {
    const o = rec(x);
    const name = str(o.name, 128);
    if (!name) { errors.push(`${where} person ${i + 1}: name is required`); return; }
    const img = str(o.img, 2048); const href = str(o.href, 2048);
    if (img && !isHttpUrl(img)) errors.push(`${where} person ${i + 1}: img must be a URL`);
    if (href && !isHttpUrl(href)) errors.push(`${where} person ${i + 1}: href must be a URL`);
    out.push({
      name,
      ...(str(o.role, 64) ? { role: str(o.role, 64)!.toLowerCase() } : {}),
      ...(str(o.group, 64) ? { group: str(o.group, 64)!.toLowerCase() } : {}),
      ...(img ? { img } : {}), ...(href ? { href } : {}),
    });
  });
  return out.length ? out : undefined;
}

function location(raw: unknown, where: string, errors: string[]): PodcastLocation | undefined {
  const o = rec(raw);
  const name = str(o.name, 128);
  const geo = str(o.geo, 128); const osm = str(o.osm, 32);
  if (!name && !geo && !osm) return undefined;
  if (!name) errors.push(`${where} location: name is required`);
  if (geo && !isGeoUri(geo)) errors.push(`${where} location: geo must look like geo:30.2672,-97.7431`);
  if (osm && !isOsmRef(osm)) errors.push(`${where} location: osm must look like R113314`);
  const rel = o.rel === 'subject' || o.rel === 'creator' ? o.rel : undefined;
  return { name: name ?? '', ...(geo ? { geo } : {}), ...(osm ? { osm } : {}), ...(rel ? { rel } : {}) };
}

function remoteItems(raw: unknown, where: string, errors: string[]): RemoteItem[] | undefined {
  const out: RemoteItem[] = [];
  arr(raw, 200).forEach((x, i) => {
    const o = rec(x);
    const feedGuid = str(o.feedGuid, 64);
    if (!feedGuid || !isUuid(feedGuid)) { errors.push(`${where} item ${i + 1}: feedGuid must be a podcast:guid (UUID)`); return; }
    const feedUrl = str(o.feedUrl, 2048);
    if (feedUrl && !isHttpUrl(feedUrl)) errors.push(`${where} item ${i + 1}: feedUrl must be a URL`);
    const medium = PODCAST_MEDIUMS.includes(o.medium) ? o.medium as PodcastMedium : undefined;
    out.push({ feedGuid: feedGuid.toLowerCase(), ...(feedUrl ? { feedUrl } : {}), ...(str(o.itemGuid, 256) ? { itemGuid: str(o.itemGuid, 256) } : {}), ...(medium ? { medium } : {}), ...(str(o.title, 256) ? { title: str(o.title, 256) } : {}) });
  });
  return out.length ? out : undefined;
}

function socialInteract(raw: unknown, where: string, errors: string[]): EpisodeExtras['socialInteract'] {
  const o = rec(raw);
  const uri = str(o.uri, 2048);
  if (!uri) return undefined;
  const protocol = typeof o.protocol === 'string' ? o.protocol : 'activitypub';
  const allowed = ['activitypub', 'atproto', 'twitter', 'lightning', 'nostr', 'matrix', 'hive', 'disabled'];
  if (!allowed.includes(protocol)) errors.push(`${where} socialInteract: unknown protocol`);
  if (protocol !== 'disabled' && protocol !== 'atproto' && protocol !== 'nostr' && !isHttpsUrl(uri)) errors.push(`${where} socialInteract: uri must be an https URL`);
  const accountUrl = str(o.accountUrl, 2048);
  if (accountUrl && !isHttpUrl(accountUrl)) errors.push(`${where} socialInteract: accountUrl must be a URL`);
  return { uri, protocol: protocol as any, ...(str(o.accountId, 256) ? { accountId: str(o.accountId, 256) } : {}), ...(accountUrl ? { accountUrl } : {}) };
}

function chapters(raw: unknown, where: string, errors: string[]): Chapter[] | undefined {
  const out: Chapter[] = [];
  arr(raw, 500).forEach((x, i) => {
    const o = rec(x);
    const startTime = num(o.startTime);
    if (startTime === undefined || startTime < 0) { errors.push(`${where} chapter ${i + 1}: startTime must be 0 or more seconds`); return; }
    const img = str(o.img, 2048); const url = str(o.url, 2048);
    if (img && !isHttpUrl(img)) errors.push(`${where} chapter ${i + 1}: img must be a URL`);
    if (url && !isHttpUrl(url)) errors.push(`${where} chapter ${i + 1}: url must be a URL`);
    const endTime = num(o.endTime);
    out.push({ startTime, ...(str(o.title, 256) ? { title: str(o.title, 256) } : {}), ...(img ? { img } : {}), ...(url ? { url } : {}), ...(o.toc === false ? { toc: false } : {}), ...(endTime !== undefined && endTime > startTime ? { endTime } : {}) });
  });
  return out.length ? out.sort((a, b) => a.startTime - b.startTime) : undefined;
}

function soundbites(raw: unknown, where: string, errors: string[]): Soundbite[] | undefined {
  const out: Soundbite[] = [];
  arr(raw, 20).forEach((x, i) => {
    const o = rec(x);
    const startTime = num(o.startTime); const duration = num(o.duration);
    if (startTime === undefined || startTime < 0 || duration === undefined || duration <= 0 || duration > 600) { errors.push(`${where} soundbite ${i + 1}: needs startTime >= 0 and a duration of 1-600 seconds`); return; }
    out.push({ startTime, duration, ...(str(o.title, 128) ? { title: str(o.title, 128) } : {}) });
  });
  return out.length ? out : undefined;
}

const TRANSCRIPT_TYPES: ExternalTranscript['type'][] = ['text/vtt', 'application/x-subrip', 'application/json', 'text/html', 'text/plain'];

function transcripts(raw: unknown, where: string, errors: string[]): ExternalTranscript[] | undefined {
  const out: ExternalTranscript[] = [];
  arr(raw, 10).forEach((x, i) => {
    const o = rec(x);
    const url = str(o.url, 2048);
    if (!isHttpUrl(url)) { errors.push(`${where} transcript ${i + 1}: url must be a URL`); return; }
    if (!TRANSCRIPT_TYPES.includes(o.type)) { errors.push(`${where} transcript ${i + 1}: unsupported type`); return; }
    out.push({ url, type: o.type, ...(str(o.language, 16) ? { language: str(o.language, 16) } : {}), ...(o.captions === true ? { captions: true } : {}) });
  });
  return out.length ? out : undefined;
}

function altEnclosures(raw: unknown, where: string, errors: string[]): AlternateEnclosure[] | undefined {
  const out: AlternateEnclosure[] = [];
  arr(raw, 10).forEach((x, i) => {
    const o = rec(x);
    const uri = str(o.uri, 2048); const type = str(o.type, 128);
    if (!uri || !isHttpUrl(uri) || !type || !/^[a-z]+\/[a-z0-9.+-]+$/i.test(type)) { errors.push(`${where} alternate enclosure ${i + 1}: needs a URL and a MIME type`); return; }
    const pick = (k: string) => { const n = num(o[k]); return n !== undefined && n > 0 ? { [k]: Math.round(n) } : {}; };
    out.push({ uri, type, ...pick('length'), ...pick('bitrate'), ...pick('height'), ...(str(o.lang, 16) ? { lang: str(o.lang, 16) } : {}), ...(str(o.title, 32) ? { title: str(o.title, 32) } : {}), ...(str(o.rel, 32) ? { rel: str(o.rel, 32) } : {}), ...(o.default === true ? { default: true } : {}) });
  });
  return out.length ? out : undefined;
}

function liveItems(raw: unknown, errors: string[]): LiveItemSettings[] | undefined {
  const out: LiveItemSettings[] = [];
  arr(raw, 20).forEach((x, i) => {
    const o = rec(x);
    const where = `Live item ${i + 1}`;
    const title = str(o.title, 256);
    const status = o.status === 'pending' || o.status === 'live' || o.status === 'ended' ? o.status : undefined;
    const start = num(o.start); const end = num(o.end);
    const streamUrl = str(o.streamUrl, 2048);
    if (!title) errors.push(`${where}: title is required`);
    if (!status) errors.push(`${where}: status must be pending, live or ended`);
    if (start === undefined || start <= 0) errors.push(`${where}: start time is required`);
    if (end !== undefined && start !== undefined && end <= start) errors.push(`${where}: end must be after start`);
    if (!isHttpsUrl(streamUrl)) errors.push(`${where}: stream URL must be https`);
    const contentLinks = arr(o.contentLinks, 5).map(rec).filter(c => isHttpUrl(c.href)).map(c => ({ href: String(c.href), ...(str(c.label, 128) ? { label: str(c.label, 128) } : {}) }));
    const image = str(o.image, 2048);
    const id = str(o.id, 64) && /^[A-Za-z0-9_-]+$/.test(String(o.id)) ? String(o.id) : `live-${start ?? i}`;
    const lp = persons(o.persons, where, errors);
    const ls = socialInteract(o.socialInteract, where, errors);
    const lv = o.value ? validateValueBlock(o.value, `${where} value`, errors) : undefined;
    out.push({
      id, title: title ?? '', status: (status ?? 'pending') as LiveItemSettings['status'], start: start ?? 0,
      ...(end !== undefined ? { end } : {}), streamUrl: streamUrl ?? '',
      ...(str(o.streamType, 128) ? { streamType: str(o.streamType, 128) } : {}),
      ...(str(o.description, 4000) ? { description: str(o.description, 4000) } : {}),
      ...(image && isHttpUrl(image) ? { image } : {}),
      ...(contentLinks.length ? { contentLinks } : {}),
      ...(lp ? { persons: lp } : {}),
      ...(ls ? { socialInteract: ls } : {}),
      ...(lv ? { value: lv } : {}),
    });
  });
  return out.length ? out : undefined;
}

/**
 * Validate and normalise untrusted settings. Unknown fields are dropped; server bookkeeping
 * (ownerId, updatedAt, guid, podcastIndexNotifiedAt) is never taken from the client.
 */
export function validatePodcast20Settings(input: unknown, opts: { trackIds?: string[] } = {}): ValidationResult {
  const r = rec(input);
  const errors: string[] = [];
  const out: Podcast20Settings = {};

  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  if (r.medium !== undefined && r.medium !== '') {
    if (PODCAST_MEDIUMS.includes(r.medium)) out.medium = r.medium;
    else errors.push('Medium is not one of the Podcasting 2.0 values');
  }
  if (typeof r.locked === 'boolean') out.locked = r.locked;
  const lockedOwner = str(r.lockedOwner, 254);
  if (lockedOwner) { if (isEmail(lockedOwner)) out.lockedOwner = lockedOwner; else errors.push('Locked owner must be an email address'); }

  const funding: FundingLink[] = [];
  arr(r.funding, 10).forEach((x, i) => {
    const o = rec(x);
    if (!isHttpsUrl(o.url)) { errors.push(`Funding link ${i + 1}: must be an https URL`); return; }
    funding.push({ url: o.url, ...(str(o.label, 128) ? { label: str(o.label, 128) } : {}) });
  });
  if (funding.length) out.funding = funding;

  const p = persons(r.persons, 'Show', errors); if (p) out.persons = p;
  const loc = location(r.location, 'Show', errors); if (loc) out.location = loc;

  const lic = rec(r.license);
  const licName = str(lic.name, 128);
  if (licName) {
    const licUrl = str(lic.url, 2048);
    if (licUrl && !isHttpUrl(licUrl)) errors.push('License URL must be a URL');
    out.license = { name: licName, ...(licUrl ? { url: licUrl } : {}) };
  }

  const txt = arr(r.txt, 10).map(rec).map(o => ({ value: str(o.value, 4000), purpose: str(o.purpose, 128) })).filter(t => t.value) as { value: string; purpose?: string }[];
  if (txt.length) out.txt = txt.map(t => ({ value: t.value, ...(t.purpose ? { purpose: t.purpose } : {}) }));

  const pr = remoteItems(r.podroll, 'Podroll', errors); if (pr) out.podroll = pr;
  const ri = remoteItems(r.remoteItems, 'Remote', errors); if (ri) out.remoteItems = ri;

  if (r.value) { const v = validateValueBlock(r.value, 'Value', errors); if (v) out.value = v; }

  const li = liveItems(r.liveItems, errors); if (li) out.liveItems = li;

  const eps = rec(r.episodes);
  const allowed = opts.trackIds ? new Set(opts.trackIds) : null;
  const episodes: Record<string, EpisodeExtras> = {};
  for (const [trackId, raw] of Object.entries(eps).slice(0, 500)) {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(trackId)) { errors.push(`Episode id ${trackId.slice(0, 20)} is not valid`); continue; }
    if (allowed && !allowed.has(trackId)) { errors.push(`Episode ${trackId} is not on this album`); continue; }
    const o = rec(raw);
    const where = `Episode ${trackId}`;
    const e: EpisodeExtras = {};
    const c = chapters(o.chapters, where, errors); if (c) e.chapters = c;
    const s = soundbites(o.soundbites, where, errors); if (s) e.soundbites = s;
    const t = transcripts(o.transcripts, where, errors); if (t) e.transcripts = t;
    const ep = persons(o.persons, where, errors); if (ep) e.persons = ep;
    const el = location(o.location, where, errors); if (el) e.location = el;
    const ae = altEnclosures(o.alternateEnclosures, where, errors); if (ae) e.alternateEnclosures = ae;
    const si = socialInteract(o.socialInteract, where, errors); if (si) e.socialInteract = si;
    if (str(o.seasonName, 128)) e.seasonName = str(o.seasonName, 128);
    if (str(o.episodeDisplay, 32)) e.episodeDisplay = str(o.episodeDisplay, 32);
    if (o.value) { const v = validateValueBlock(o.value, `${where} value`, errors); if (v) e.value = v; }
    const pub = num(o.publishedAt); if (pub !== undefined && pub > 0) e.publishedAt = pub;
    if (Object.keys(e).length) episodes[trackId] = e;
  }
  if (Object.keys(episodes).length) out.episodes = episodes;

  return { ok: errors.length === 0, errors, value: out };
}
