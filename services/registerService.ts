// registerService — client side of the register floor: owner-entered settings (tax etc.), the v2
// POS sale (server-computed tax + split tenders + EBT), and receipt shaping. Decision logic lives in
// the pure cores (taxCore / ebtCore / tenderCore / refundCore / drawerCore) shared with the server.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './backendService';
import type { RegisterSettings } from '../types';
import { parseTaxSettings, type TaxSettings } from './taxCore';
import type { Tender } from './tenderCore';
import type { ReceiptData } from './posPeripherals';

export interface LoadedRegisterSettings { tax: TaxSettings; refundApprovalCents: number; discountLimitPct: number; tipPresets: number[]; raw: RegisterSettings }

export async function fetchRegisterSettings(businessUid: string): Promise<LoadedRegisterSettings> {
  let raw: RegisterSettings = {};
  try {
    const snap = await getDoc(doc(db, 'businesses', businessUid));
    const v = snap.exists() ? (snap.data() as any).registerSettings : null;
    raw = typeof v === 'string' ? JSON.parse(v) : (v || {});
  } catch { /* no settings = no tax */ }
  return {
    tax: parseTaxSettings(raw.tax),
    refundApprovalCents: Number.isFinite(Number(raw.refundApprovalCents)) ? Number(raw.refundApprovalCents) : 5000,
    tipPresets: Array.isArray(raw.tipPresets) && raw.tipPresets.length ? raw.tipPresets : [15, 18, 20],
    discountLimitPct: Number.isFinite(Number(raw.discountLimitPct)) ? Number(raw.discountLimitPct) : 10,
    raw,
  };
}

/** Owner-only (Firestore rules: businesses/{uid} writable by the owner). Stored as a JSON string, which is what the server reads. */
export async function saveRegisterSettings(businessUid: string, s: RegisterSettings): Promise<void> {
  await setDoc(doc(db, 'businesses', businessUid), { registerSettings: JSON.stringify(s), updatedAt: Date.now() }, { merge: true });
}

export async function authedFetch(path: string, body: any, extraHeaders: Record<string, string> = {}) {
  const token = await auth.currentUser?.getIdToken?.();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data.error || 'Request failed'); e.code = data.code; e.data = data; throw e; }
  return data;
}

export interface PosSaleOutV2 {
  orderId: string; subtotalCents: number; offerDiscountCents: number; redeemCents: number; discountCents: number;
  taxCents: number; tipCents: number; totalCents: number; paidCents: number; tenders: Tender[]; changeCents: number;
  snapCents: number; manualDiscountCents?: number; lines: { title: string; qty: number; unitAmount: number; chargeCents: number; taxCents: number; variantName?: string | null }[];
  staffName?: string; pointsEarned: number; oversold?: boolean;
  /** Gift cards sold on this ticket. `code` is the full code, returned ONCE (null if the sale was an idempotent replay). */
  giftCards?: { cardId: string; code: string | null; last4: string; amountCents: number; emailed: boolean }[];
  storedValueSoldCents?: number;
}

export interface GiftLineIn { amountCents: number; recipientEmail?: string; recipientName?: string; message?: string }
export async function posSaleV2(input: {
  businessUid: string;
  items: { productId: string; variantId?: string; qty: number }[];
  tenders: Tender[];
  tipCents?: number;
  manualDiscount?: { type: 'PCT' | 'AMOUNT'; value: number };   // PCT: percent, AMOUNT: cents
  managerPin?: string;
  customerUid?: string;
  redeemPoints?: number;
  ageVerified?: boolean;
  giftCards?: GiftLineIn[];
  businessName?: string;
}, sessionToken?: string | null): Promise<PosSaleOutV2> {
  return authedFetch('/api/store/pos-sale', input, sessionToken ? { 'X-Register-Session': sessionToken } : {});
}

/** Shape a completed sale into receipt data (print / email / link all read this). */
export function receiptFromSale(businessName: string, out: PosSaleOutV2, extra: { customerName?: string; ebtBalanceNote?: boolean } = {}): ReceiptData {
  const ebt = (out.tenders || []).filter(t => t.type === 'EXTERNAL' && (t.kind === 'EBT_SNAP' || t.kind === 'EBT_CASH'));
  return {
    businessName, orderId: out.orderId,
    lines: [...out.lines.map(l => ({ title: `${l.title}${l.variantName ? ` (${l.variantName})` : ''}`, qty: l.qty, unitAmount: Math.round(l.chargeCents / Math.max(1, l.qty)) })),
      ...(out.giftCards || []).map(g => ({ title: `Gift card ...${g.last4}`, qty: 1, unitAmount: g.amountCents }))],
    subtotalCents: out.subtotalCents + (out.storedValueSoldCents || 0), discountCents: out.discountCents, taxCents: out.taxCents, tipCents: out.tipCents,
    totalCents: out.totalCents + (out.storedValueSoldCents || 0), paidCents: out.paidCents, changeCents: out.changeCents,
    tender: out.tenders.length > 1 ? 'Split' : labelOf(out.tenders[0]),
    tenders: out.tenders.map(t => ({ label: labelOf(t), amountCents: t.amountCents, reference: t.reference, balanceCents: t.balanceCents })),
    pointsEarned: out.pointsEarned, customerName: extra.customerName, staffName: out.staffName, when: Date.now(),
    ebtLines: ebt.map(t => ({ label: labelOf(t), amountCents: t.amountCents, reference: t.reference, balanceCents: t.balanceCents })),
    ...((out.giftCards || []).length ? { giftCards: (out.giftCards || []).filter(g => g.code).map(g => ({ code: g.code as string, amountCents: g.amountCents })) } : {}),
  };
}
function labelOf(t?: Tender): string {
  if (!t) return '';
  if (t.type === 'EXTERNAL') return ({ EBT_SNAP: 'EBT SNAP', EBT_CASH: 'EBT Cash', CHECK: 'Check', OTHER: 'Other' } as Record<string, string>)[t.kind || 'OTHER'] || 'Other';
  return ({ CASH: 'Cash', CARD: 'Card', GIFT: 'Gift card', STORE_CREDIT: 'Store credit', WALLET: 'Wallet' } as Record<string, string>)[t.type] || t.type;
}

// ── Staff PIN session ────────────────────────────────────────────────────────────────────────────
export interface RegisterStaffSession { token: string; expiresAt: number; staff: { id: string; name: string; role: string; permissions: string[] } }
export async function registerPinLogin(businessUid: string, pin: string): Promise<RegisterStaffSession> {
  return authedFetch('/api/register/pin-login', { businessUid, pin });
}
/** Owner: store a staff member's PIN as a salted hash (server-side). */
export async function setStaffPin(staffId: string, pin: string): Promise<void> {
  await authedFetch('/api/register/set-pin', { staffId, pin });
}
const sh = (token?: string | null): Record<string, string> => (token ? { 'X-Register-Session': token } : {});

// ── Refunds ──────────────────────────────────────────────────────────────────────────────────────
export interface PosRefundInput {
  businessUid: string; orderId: string; lines: { index: number; qty: number; restock?: boolean }[];
  method: 'ORIGINAL' | 'CASH' | 'STORE_CREDIT'; reason: string; note?: string; managerPin?: string; idempotencyKey: string;
}
export async function posRefund(input: PosRefundInput, token?: string | null): Promise<{ ok: true; refundId: string; amountCents: number; taxCents: number; allocations: { type: string; kind?: string; amountCents: number }[]; restocked: number; fullyRefunded: boolean; duplicate?: boolean; approvedBy?: string; credits?: { kind: string; cardId: string; last4: string; amountCents: number; code: string | null; restoredToOriginal: boolean }[] }> {
  return authedFetch('/api/store/pos-refund', input, sh(token));
}

// ── Drawer ───────────────────────────────────────────────────────────────────────────────────────
import type { DrawerMovement, ZReport } from './drawerCore';
export interface DrawerView { id: string; openedAt: number; openedByName?: string; startFloatCents: number; movements: DrawerMovement[]; status: string }
export const drawerStatus = (businessUid: string, token?: string | null): Promise<{ open: DrawerView | null; z?: ZReport }> => authedFetch('/api/register/drawer', { businessUid, action: 'status' }, sh(token));
export const drawerOpen = (businessUid: string, startFloatCents: number, token?: string | null): Promise<{ open: DrawerView }> => authedFetch('/api/register/drawer', { businessUid, action: 'open', startFloatCents }, sh(token));
export const drawerMove = (businessUid: string, movement: { type: string; amountCents: number; note?: string }, token?: string | null): Promise<{ open: DrawerView }> => authedFetch('/api/register/drawer', { businessUid, action: 'move', movement }, sh(token));
export const drawerClose = (businessUid: string, countedCents: number, token?: string | null): Promise<{ closed: true; z: ZReport }> => authedFetch('/api/register/drawer', { businessUid, action: 'close', countedCents }, sh(token));

// ── Receipt link / email ────────────────────────────────────────────────────────────────────────
export const receiptLink = (businessUid: string, orderId: string, businessName: string, email?: string, token?: string | null): Promise<{ url: string; emailed: boolean; emailConfigured: boolean }> =>
  authedFetch('/api/store/receipt-link', { businessUid, orderId, businessName, email }, sh(token));

// ── Reads for reports / returns (owner; rules gate on sellerId) ─────────────────────────────────
import { collection, query, where, getDocs } from 'firebase/firestore';
export async function fetchPosOrders(businessUid: string): Promise<any[]> {
  try {
    const snap = await getDocs(query(collection(db, 'storeOrders'), where('sellerId', '==', businessUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((o: any) => o.source === 'POS').sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
}
export async function fetchRefunds(businessUid: string): Promise<any[]> {
  try {
    const snap = await getDocs(query(collection(db, 'storeRefunds'), where('sellerId', '==', businessUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}


// ── Stored value (gift cards / store credit / wallets) ─────────────────────────────────────────────
import type { CardKind, LiabilityReport, LedgerEntry } from './storedValueCore';
export interface BalanceOut { ok: true; kind: CardKind; balanceCents: number; last4: string; expiresAt?: number }
/** Public, rate-limited. Any failure is the same 'Invalid card.' */
export async function svBalance(businessUid: string, code: string): Promise<BalanceOut> {
  const r = await fetch('/api/stored-value/balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessUid, code }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(d.error || 'Invalid card.'); e.code = d.code; throw e; }
  return d;
}
export const svCustomer = (businessUid: string, customerUid: string, token?: string | null): Promise<{ wallet: { cardId: string; balanceCents: number; last4: string } | null; credit: { cardId: string; balanceCents: number; last4: string } | null }> =>
  authedFetch('/api/stored-value/customer', { businessUid, customerUid }, sh(token));
export const svIssue = (input: { businessUid: string; kind: CardKind; amountCents?: number; reason?: string; customerUid?: string; recipientEmail?: string; managerPin?: string; businessName?: string; idempotencyKey?: string }, token?: string | null): Promise<{ ok: true; cardId: string; code?: string | null; last4: string; balanceCents: number; emailed?: boolean }> =>
  authedFetch('/api/stored-value/issue', input, sh(token));
export const svReload = (input: { businessUid: string; customerUid: string; amountCents: number; tenders: Tender[] }, token?: string | null): Promise<{ ok: true; orderId: string; balanceCents: number; changeCents: number }> =>
  authedFetch('/api/stored-value/reload', input, sh(token));
export const svModify = (input: { businessUid: string; cardId: string; action: 'VOID' | 'ADJUST'; reason: string; deltaCents?: number; managerPin?: string }, token?: string | null): Promise<{ ok: true; balanceCents: number }> =>
  authedFetch('/api/stored-value/modify', input, sh(token));
export interface SvAdminCard { id: string; kind: CardKind; status: string; balanceCents: number; initialCents: number; last4: string; createdAt: number; updatedAt: number; customerUid?: string; recipientEmail?: string; recipientName?: string; expiresAt?: number }
export const svAdmin = (input: { businessUid: string; q?: string; from?: number; to?: number; cardId?: string }, token?: string | null): Promise<{ report: LiabilityReport; cards: SvAdminCard[]; ledger: (LedgerEntry & { byName?: string })[]; truncated: boolean }> =>
  authedFetch('/api/stored-value/admin', input, sh(token));
/** Storefront: start Stripe checkout for digital gift cards. */
export const buyGiftCardsOnline = (businessUid: string, giftCards: GiftLineIn[]): Promise<{ url: string; orderId: string }> =>
  authedFetch('/api/stored-value/buy-online', { businessUid, giftCards });
