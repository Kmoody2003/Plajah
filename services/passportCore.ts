// passportCore - PURE rules for the customer-owned Vehicle Passport (v1): shop-verified service entries, short-lived
// share tokens, claim codes and a printable resale history. Writes happen ONLY on the server; the owner reads their
// own garage; a different shop sees entries only through a share token the owner created. No Firebase / node imports
// (the HMAC is injected so tests can use a fake). Tests: npm run test:auto

export interface PassportEntry {
  id: string; passportKey: string;
  shopUid: string; shopName: string; ticketId: string; ticketNumber: string;
  at: number; odometer?: number;
  /** What was done, in words. No prices or customer contact data (this history gets shared). */
  work: { kind: string; description: string }[];
  /** Counts only; the customer's full inspection report stays on the ticket link. */
  inspection?: { pass: number; watch: number; fail: number };
  serviceKeys: string[];
  /** Always true for entries written by the server from a paid / closed ticket. */
  verified: true;
}
export interface PassportMeta {
  key: string; vin?: string; plate?: string; state?: string;
  year?: number; make?: string; model?: string; trim?: string;
  ownerUid: string;               // '' until claimed / linked
  createdAt: number; updatedAt: number;
}

/** Build an entry from a closed ticket's facts. Strips prices; caps sizes; refuses entries with no work. */
export function buildEntry(a: {
  id: string; passportKey: string; shopUid: string; shopName: string; ticketId: string; ticketNumber: string; at: number; odometer?: number;
  lines: { kind: string; description: string; approval: string }[]; inspection?: { pass: number; watch: number; fail: number }; serviceKeys?: string[];
}): { entry?: PassportEntry; error?: string } {
  const work = a.lines.filter(l => l.approval === 'APPROVED').map(l => ({ kind: String(l.kind).slice(0, 12), description: String(l.description).slice(0, 160) })).slice(0, 40);
  if (!work.length) return { error: 'No approved work to record.' };
  if (!a.shopUid || !a.shopName) return { error: 'Shop identity is required.' };
  const od = a.odometer !== undefined && Number.isFinite(a.odometer) && a.odometer >= 0 ? Math.round(a.odometer) : undefined;
  return { entry: { id: a.id, passportKey: a.passportKey, shopUid: a.shopUid, shopName: a.shopName.slice(0, 80), ticketId: a.ticketId, ticketNumber: a.ticketNumber.slice(0, 20), at: a.at, ...(od !== undefined ? { odometer: od } : {}), work, ...(a.inspection ? { inspection: a.inspection } : {}), serviceKeys: (a.serviceKeys || []).slice(0, 12), verified: true } };
}

/** Who may read a passport's entries: the owner always; a shop only with a valid share token for that passport; nobody else. */
export function canReadEntries(a: { ownerUid: string; viewerUid?: string; shareOk?: boolean }): boolean {
  return (!!a.viewerUid && !!a.ownerUid && a.viewerUid === a.ownerUid) || a.shareOk === true;
}
/** A shop sees its OWN entries without a token (it wrote them) but nobody else's. */
export const visibleToShop = (entries: PassportEntry[], shopUid: string, shareOk: boolean): PassportEntry[] =>
  entries.filter(e => shareOk || e.shopUid === shopUid).sort((a, b) => b.at - a.at);

// ── Claim code (printed on the invoice / handed over by the shop when the customer has no Plajah link) ──
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeClaimCode(bytes: ArrayLike<number>): string { let s = ''; for (let i = 0; i < 8; i++) s += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length]; return `${s.slice(0, 4)}-${s.slice(4)}`; }
export const normalizeClaimCode = (raw: string): string => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

// ── Short-lived share token: base64url(JSON{k,exp,s}).mac ─────────────────────────────────────────
export type ShareScope = 'view' | 'shop';
export const SHARE_TTL_MS = 48 * 3_600_000;
const b64 = (s: string) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => { const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4); return typeof atob === 'function' ? decodeURIComponent(escape(atob(p))) : Buffer.from(p, 'base64').toString('utf8'); };
export function formatShareToken(p: { key: string; scope: ShareScope; exp: number }, mac: (body: string) => string): string {
  const body = b64(JSON.stringify({ k: p.key, s: p.scope, e: Math.round(p.exp) }));
  return `${body}.${mac(body)}`;
}
export function parseShareToken(tok: string, mac: (body: string) => string, now = Date.now()): { key: string; scope: ShareScope; exp: number } | { error: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' } {
  const m = /^([A-Za-z0-9_-]{8,400})\.([A-Za-z0-9_-]{16,64})$/.exec(String(tok || ''));
  if (!m) return { error: 'MALFORMED' };
  if (mac(m[1]) !== m[2]) return { error: 'BAD_SIGNATURE' };
  let j: any; try { j = JSON.parse(unb64(m[1])); } catch { return { error: 'MALFORMED' }; }
  if (!j || typeof j.k !== 'string' || (j.s !== 'view' && j.s !== 'shop') || !Number.isFinite(j.e)) return { error: 'MALFORMED' };
  if (now >= j.e) return { error: 'EXPIRED' };
  return { key: j.k, scope: j.s, exp: j.e };
}

// ── Printable history (resale) ────────────────────────────────────────────────────────────────────
const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
export function renderPassportHtml(p: Pick<PassportMeta, 'vin' | 'year' | 'make' | 'model' | 'trim'>, entries: PassportEntry[], opts: { generatedAt?: number } = {}): string {
  const name = [p.year, p.make, p.model, p.trim].filter(Boolean).join(' ') || 'Vehicle';
  const rows = [...entries].sort((a, b) => b.at - a.at).map(e => `<section><h3>${esc(new Date(e.at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }))} - ${esc(e.shopName)}${e.odometer !== undefined ? ` - ${esc(e.odometer.toLocaleString('en-US'))} mi` : ''}</h3><ul>${e.work.map(w => `<li>${esc(w.description)}</li>`).join('')}</ul><p class="m">Shop-verified entry, ticket ${esc(e.ticketNumber)}${e.inspection ? ` - inspection: ${e.inspection.fail} urgent, ${e.inspection.watch} watch, ${e.inspection.pass} good` : ''}</p></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(name)} - service history</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 16px}h1{margin:0}h3{margin:18px 0 4px}.m{color:#666;font-size:12px;margin:4px 0}.b{border:1px solid #ccc;border-radius:8px;padding:10px;font-size:12px;color:#444;margin:12px 0}@media print{.np{display:none}}</style></head><body><h1>${esc(name)}</h1>${p.vin ? `<div class="m">VIN ${esc(p.vin)}</div>` : ''}<div class="b">Service history assembled from entries written by the shops that did the work, on Plajah. Entries are shop-verified and cannot be edited by the owner. This is not a manufacturer record or a CARFAX-style report; it only lists shops that use Plajah.</div>${rows || '<p>No entries yet.</p>'}<p class="m">Generated ${esc(new Date(opts.generatedAt ?? Date.now()).toLocaleDateString('en-US'))}</p><button class="np" onclick="print()">Print / save as PDF</button></body></html>`;
}
