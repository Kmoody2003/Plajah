// ─── NIP-57 zaps (Lightning tips straight to the creator) ─────────────────────
// Owner rule "no held money": the invoice comes from the CREATOR's own LNURL server (their lud16 Lightning
// address), the fan's wallet pays it, the creator's wallet receives it. Plajah only:
//   1. resolves the creator's Lightning address (LNURL-pay metadata),
//   2. builds the kind-9734 zap request template the fan signs with their own signer,
//   3. forwards the signed request to the creator's LNURL callback and hands the invoice back,
//   4. reads public kind-9735 receipts from relays to show totals.
// No funds, no custody, no Plajah wallet at any step.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { bech32Encode } from './bech32';
import { verifyEvent, tagValues, nowSec, KIND, type NostrEvent, type UnsignedEvent } from './event';

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;
export type HostCheck = (url: string) => Promise<void>;

const LUD16 = /^([a-z0-9._+-]{1,64})@([a-z0-9.-]{1,253}\.[a-z]{2,63})$/i;

export function parseLud16(addr: string): { name: string; domain: string; url: string } | null {
  const m = LUD16.exec(String(addr || '').trim());
  if (!m) return null;
  const name = m[1].toLowerCase(), domain = m[2].toLowerCase();
  return { name, domain, url: `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}` };
}

export const lnurlEncode = (url: string) => bech32Encode('lnurl', new TextEncoder().encode(url));

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') ;
}

/** SSRF guard: creator-supplied Lightning domains must be https on a public address. */
export const assertPublicHttps: HostCheck = async (url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Lightning address must use https');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Lightning address host not allowed');
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Lightning address host not allowed');
};

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs = 6000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    const text = await r.text();
    if (text.length > 100_000) throw new Error('LNURL response too large');
    let body: any; try { body = JSON.parse(text); } catch { throw new Error('LNURL server did not return JSON'); }
    if (!r.ok || body?.status === 'ERROR') throw new Error(String(body?.reason || `LNURL server error ${r.status}`).slice(0, 200));
    return body;
  } finally { clearTimeout(t); }
}

export interface LnurlPay {
  lud16: string;
  lnurl: string;
  callback: string;
  minSendable: number;  // msats
  maxSendable: number;  // msats
  commentAllowed: number;
  allowsNostr: boolean;
  nostrPubkey?: string; // the key that signs this provider's zap receipts
}

export async function resolveLnurlPay(lud16: string, deps: { fetch: FetchLike; hostCheck: HostCheck }): Promise<LnurlPay> {
  const p = parseLud16(lud16);
  if (!p) throw new Error('Not a Lightning address');
  await deps.hostCheck(p.url);
  const meta = await getJson(deps.fetch, p.url);
  if (meta?.tag !== 'payRequest' || typeof meta.callback !== 'string') throw new Error('Not an LNURL-pay endpoint');
  await deps.hostCheck(meta.callback);
  const nostrPubkey = typeof meta.nostrPubkey === 'string' && /^[0-9a-f]{64}$/.test(meta.nostrPubkey) ? meta.nostrPubkey : undefined;
  return {
    lud16: `${p.name}@${p.domain}`, lnurl: lnurlEncode(p.url), callback: meta.callback,
    minSendable: Number(meta.minSendable) || 1000, maxSendable: Number(meta.maxSendable) || 0,
    commentAllowed: Number(meta.commentAllowed) || 0,
    allowsNostr: meta.allowsNostr === true && !!nostrPubkey, nostrPubkey,
  };
}

/** The kind-9734 template the FAN signs (NIP-07/NIP-46). */
export function buildZapRequestTemplate(o: {
  recipientPubkey: string; amountMsats: number; relays: string[]; lnurl: string; eventId?: string; aTag?: string; comment?: string;
}): UnsignedEvent {
  const tags: string[][] = [['relays', ...o.relays.slice(0, 8)], ['amount', String(o.amountMsats)], ['lnurl', o.lnurl], ['p', o.recipientPubkey]];
  if (o.eventId) tags.push(['e', o.eventId]);
  if (o.aTag) tags.push(['a', o.aTag]);
  return { kind: KIND.ZAP_REQUEST, created_at: nowSec(), content: (o.comment ?? '').slice(0, 280), tags };
}

/** NIP-57 Appendix D checks a recipient's LNURL server runs; we run them first so bad requests never leave Plajah. */
export function validateZapRequest(e: unknown, expect: { recipientPubkey: string; amountMsats: number }): string | null {
  if (!verifyEvent(e)) return 'Zap request signature is invalid';
  if (e.kind !== KIND.ZAP_REQUEST) return 'Not a zap request';
  const ps = tagValues(e, 'p');
  if (ps.length !== 1 || ps[0] !== expect.recipientPubkey) return 'Zap request is for a different recipient';
  if (tagValues(e, 'e').length > 1) return 'Zap request has more than one e tag';
  if (!e.tags.some(t => t[0] === 'relays' && t.length > 1)) return 'Zap request lists no relays';
  const amt = tagValues(e, 'amount')[0];
  if (amt && Number(amt) !== expect.amountMsats) return 'Zap request amount does not match';
  if (Math.abs(nowSec() - e.created_at) > 600) return 'Zap request is too old';
  return null;
}

/** Amount of a BOLT-11 invoice in millisatoshis (null = amountless or unparsable). */
export function bolt11AmountMsats(pr: string): number | null {
  const s = String(pr || '').toLowerCase().replace(/^lightning:/, '');
  const sep = s.lastIndexOf('1');
  if (sep < 0) return null;
  const m = /^ln(?:bcrt|bc|tbs|tb|sb)(\d+)([munp]?)$/.exec(s.slice(0, sep));
  if (!m) return null;
  const n = BigInt(m[1]);
  const msat = m[2] === 'm' ? n * 100_000_000n : m[2] === 'u' ? n * 100_000n : m[2] === 'n' ? n * 100n
    : m[2] === 'p' ? (n % 10n === 0n ? n / 10n : -1n) : n * 100_000_000_000n;
  return msat < 0n ? null : Number(msat);
}

/** Forward the request to the creator's own LNURL callback; the invoice pays THEM. */
export async function requestInvoice(pay: LnurlPay, o: { amountMsats: number; zapRequest?: NostrEvent; comment?: string }, deps: { fetch: FetchLike; hostCheck: HostCheck }): Promise<{ pr: string; verify?: string }> {
  if (!Number.isInteger(o.amountMsats) || o.amountMsats < pay.minSendable || (pay.maxSendable && o.amountMsats > pay.maxSendable)) {
    throw new Error(`Amount must be between ${Math.ceil(pay.minSendable / 1000)} and ${Math.floor(pay.maxSendable / 1000)} sats`);
  }
  const u = new URL(pay.callback);
  u.searchParams.set('amount', String(o.amountMsats));
  if (o.zapRequest && pay.allowsNostr) {
    u.searchParams.set('nostr', JSON.stringify(o.zapRequest));
    u.searchParams.set('lnurl', pay.lnurl);
  } else if (o.comment && pay.commentAllowed > 0) {
    u.searchParams.set('comment', o.comment.slice(0, pay.commentAllowed));
  }
  await deps.hostCheck(u.toString());
  const body = await getJson(deps.fetch, u.toString(), 8000);
  const pr = String(body?.pr || '');
  if (!/^ln[a-z0-9]+$/i.test(pr)) throw new Error('LNURL server returned no invoice');
  const amt = bolt11AmountMsats(pr);
  if (amt !== null && amt !== o.amountMsats) throw new Error('Invoice amount does not match the request');
  return { pr, verify: typeof body?.verify === 'string' ? body.verify : undefined };
}

export interface ZapTotals { count: number; msats: number; byEvent: Record<string, { count: number; msats: number }> }

/** Sum valid kind-9735 receipts. If providerPubkeys is given, receipts not signed by one of them are ignored
 *  (otherwise anyone could publish fake receipts). */
export function sumZapReceipts(receipts: NostrEvent[], opts: { providerPubkeys?: string[]; recipientPubkey?: string } = {}): ZapTotals {
  const out: ZapTotals = { count: 0, msats: 0, byEvent: {} };
  const seen = new Set<string>();
  for (const r of receipts) {
    if (r.kind !== KIND.ZAP_RECEIPT || seen.has(r.id)) continue;
    if (opts.providerPubkeys?.length && !opts.providerPubkeys.includes(r.pubkey)) continue;
    const bolt11 = tagValues(r, 'bolt11')[0];
    const amt = bolt11 ? bolt11AmountMsats(bolt11) : null;
    if (!amt) continue;
    let zr: any;
    try { zr = JSON.parse(tagValues(r, 'description')[0] || ''); } catch { continue; }
    if (zr?.kind !== KIND.ZAP_REQUEST) continue;
    const reqAmt = (zr.tags as string[][] | undefined)?.find(t => t[0] === 'amount')?.[1];
    if (reqAmt && Number(reqAmt) !== amt) continue;
    if (opts.recipientPubkey && tagValues(r, 'p')[0] !== opts.recipientPubkey) continue;
    seen.add(r.id);
    out.count++; out.msats += amt;
    for (const e of tagValues(r, 'e')) {
      const b = (out.byEvent[e] ??= { count: 0, msats: 0 });
      b.count++; b.msats += amt;
    }
  }
  return out;
}
