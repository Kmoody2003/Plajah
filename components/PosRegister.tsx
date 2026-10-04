// PosRegister — the staff-facing point-of-sale register. Sits on the SAME storeProducts inventory
// that backs the on-platform store, so ringing up a sale decrements the same stock the store shows.
// A cash sale posts through the server (/api/store/pos-sale): it records a CONFIRMED order, decrements
// stock atomically, awards/deducts loyalty points, and applies deals. Card-present tender (Stripe
// Terminal) and staff-PIN auth are follow-ups; v1 is the owner ringing cash sales.
//
// Deep integration, per the vision:
//   • Inventory      — grid is live storeProducts; sale decrements the same stock.
//   • Recognition    — attach a Plajah customer by name / @handle / phone / uid, or SCAN their QR.
//   • Loyalty        — earn on the amount paid; redeem points as a discount (server-validated).
//   • Deals          — active offers auto-apply to the ticket (best eligible one wins).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StoreProduct, StoreProductVariant, UserProfile } from '../types';
import { sellerProducts, findByCode } from '../services/inventoryService';
import { stockStatus, totalStock, unitPriceCents } from '../services/inventoryCore';
import VariantPicker from './inventory/VariantPicker';
import BarcodeScanner from './inventory/BarcodeScanner';
import { searchUsers } from '../services/backendService';
import { fetchLoyaltyPoints } from '../services/businessOpsService';
import { posSaleV2, fetchRegisterSettings, receiptFromSale, type GiftLineIn } from '../services/registerService';
import { computeTax, taxLabel, normalizeTaxClass, NO_TAX, type TaxSettings } from '../services/taxCore';
import { ebtGuidance } from '../services/ebtCore';
import { composeDiscounts } from '../services/registerAuthCore';
import type { Tender } from '../services/tenderCore';
import RegisterTenderSheet from './RegisterTenderSheet';
import RegisterReturnsSheet from './RegisterReturnsSheet';
import RegisterDrawerSheet from './RegisterDrawerSheet';
import RegisterGiftSheet, { type GiftSheetMode } from './RegisterGiftSheet';
import QRCode from 'qrcode';
import { registerPinLogin, receiptLink, type RegisterStaffSession } from '../services/registerService';
import { fetchOffers, bestOffer, type BusinessOffer } from '../services/offersService';
import { printReceipt, openCashDrawer, isQzAvailable, type ReceiptData } from '../services/posPeripherals';

const GRAD = 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)';
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const hasScanner = typeof window !== 'undefined' && 'BarcodeDetector' in window;

interface CartLine { product: StoreProduct; variant?: StoreProductVariant; qty: number; }
const lineKey = (l: { product: StoreProduct; variant?: StoreProductVariant }) => `${l.product.id}|${l.variant?.id || ''}`;
const lineCents = (l: { product: StoreProduct; variant?: StoreProductVariant }) => unitPriceCents(l.product, l.variant?.id);
interface Props { businessUid: string; businessName: string; onExit: () => void; }

// Pull a uid/handle token out of a scanned/typed value (profile link, plajah:cust:<uid>, @handle, raw).
function extractToken(raw: string): string {
  const s = raw.trim();
  const m = s.match(/(?:plajah:cust:|\/profile\/|\/u\/|@)([A-Za-z0-9_-]{2,})/);
  if (m) return m[1];
  return s.replace(/^@/, '');
}

export default function PosRegister({ businessUid, businessName, onExit }: Props) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState('');
  const [offers, setOffers] = useState<BusinessOffer[]>([]);
  const [picking, setPicking] = useState<StoreProduct | null>(null);
  const [scanItems, setScanItems] = useState(false);
  const [scanNote, setScanNote] = useState('');   // product awaiting a size/option choice

  // Customer recognition + loyalty
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<UserProfile[]>([]);
  const [customer, setCustomer] = useState<UserProfile | null>(null);
  const [custPoints, setCustPoints] = useState(0);
  const [redeem, setRedeem] = useState(false);

  // QR scan
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ total: number; points: number; saved: number } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState('');
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(NO_TAX);
  const [tipPresets, setTipPresets] = useState<number[]>([15, 18, 20]);
  const [tenderOpen, setTenderOpen] = useState(false);
  // Manual discount (cashier-entered). Auto offers + loyalty are separate and ungated; a manual discount over the
  // owner's limit needs DISCOUNT_OVERRIDE or a manager PIN (the server enforces it).
  const [discType, setDiscType] = useState<'PCT' | 'AMOUNT'>('PCT');
  const [discVal, setDiscVal] = useState('');
  const [discPin, setDiscPin] = useState('');
  const [discLimit, setDiscLimit] = useState(10);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Stored value: gift cards on this ticket (liability lines), the sheet, and the codes to hand over after the sale (shown ONCE).
  const [giftLines, setGiftLines] = useState<GiftLineIn[]>([]);
  const [giftSheet, setGiftSheet] = useState<GiftSheetMode | null>(null);
  const [issuedCodes, setIssuedCodes] = useState<{ code: string; amountCents: number; last4: string; emailed: boolean }[]>([]);
  // Staff PIN session (token goes in X-Register-Session; the server attributes + restricts by it)
  const [session, setSession] = useState<RegisterStaffSession | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinVal, setPinVal] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [lastOrderId, setLastOrderId] = useState('');
  const [rcptEmail, setRcptEmail] = useState('');
  const [rcptMsg, setRcptMsg] = useState('');
  const token = session && session.expiresAt > Date.now() ? session.token : null;
  const qzOn = isQzAvailable();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [list, us, offs] = await Promise.all([
        sellerProducts(businessUid).catch(() => [] as StoreProduct[]),
        searchUsers('').catch(() => [] as UserProfile[]),
        fetchOffers(businessUid).catch(() => [] as BusinessOffer[]),
      ]);
      setProducts(list.filter(p => p.isActive !== false));
      setAllUsers(us || []);
      setOffers(offs || []);
      setLoading(false);
      fetchRegisterSettings(businessUid).then(rs => { setTaxSettings(rs.tax); setTipPresets(rs.tipPresets); setDiscLimit(rs.discountLimitPct); }).catch(() => {});
    })();
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessUid]);

  // Recognition — match the cached user list by uid / @handle / phone / name (no extra query).
  useEffect(() => {
    const raw = custQuery.trim();
    if (raw.length < 2) { setCustResults([]); return; }
    const tok = extractToken(raw).toLowerCase();
    const digits = raw.replace(/\D/g, '');
    const nameQ = raw.toLowerCase();
    const res = allUsers.filter(u => {
      const uname = ((u as any).username || '').toLowerCase();
      const phone = ((u as any).phone || '').replace(/\D/g, '');
      return u.uid?.toLowerCase() === tok
        || (uname && uname === tok)
        || (uname && uname.includes(nameQ))
        || (digits.length >= 7 && phone && phone.endsWith(digits))
        || (u.displayName || '').toLowerCase().includes(nameQ);
    }).slice(0, 6);
    setCustResults(res);
  }, [custQuery, allUsers]);

  async function attachCustomer(u: UserProfile) {
    setCustomer(u); setCustResults([]); setCustQuery(''); setScanMsg('');
    const pts = await fetchLoyaltyPoints(businessUid, u.uid).catch(() => 0);
    setCustPoints(pts);
  }
  function detachCustomer() { setCustomer(null); setCustPoints(0); setRedeem(false); }

  function attachByToken(token: string): boolean {
    const tok = token.toLowerCase();
    const u = allUsers.find(x => x.uid?.toLowerCase() === tok || ((x as any).username || '').toLowerCase() === tok);
    if (u) { attachCustomer(u); return true; }
    return false;
  }

  // ── QR scan (progressive; only when BarcodeDetector exists) ────────────────────
  function stopScan() {
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }
  async function startScan() {
    if (!hasScanner) return;
    setScanMsg(''); setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopScan(); return; }
      video.srcObject = stream; await video.play().catch(() => {});
      // @ts-ignore - BarcodeDetector is not in the TS DOM lib yet
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            const token = extractToken(String(codes[0].rawValue || ''));
            stopScan();
            if (!attachByToken(token)) setScanMsg('That QR isn’t a Plajah customer.');
            return;
          }
        } catch { /* keep scanning */ }
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    } catch {
      setScanMsg('Camera unavailable.'); stopScan();
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter(p => p.title?.toLowerCase().includes(s)) : products;
  }, [products, q]);

  function addToCart(p: StoreProduct, variant?: StoreProductVariant) {
    if (p.variants?.length && !variant) { setPicking(p); return; }   // need a size/option first
    setReceipt(null); setError('');
    setCart(prev => {
      const key = lineKey({ product: p, variant });
      const i = prev.findIndex(l => lineKey(l) === key);
      if (i >= 0) { const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next; }
      return [...prev, { product: p, variant, qty: 1 }];
    });
  }
  function setQty(key: string, delta: number) {
    setCart(prev => prev.flatMap(l => {
      if (lineKey(l) !== key) return [l];
      const qty = l.qty + delta;
      return qty <= 0 ? [] : [{ ...l, qty }];
    }));
  }
  // A USB/bluetooth barcode scanner "types" the code then Enter — match it to a SKU/barcode and ring it.
  // Phone/tablet camera: stays open so a whole basket can be scanned item by item.
  function onItemScanned(code: string) {
    const hit = findByCode(products, code);
    if (!hit) { setScanNote(`No product with code ${code}`); return; }
    const v = hit.variantId ? hit.product.variants?.find(x => x.id === hit.variantId) : undefined;
    if (hit.product.variants?.length && !v) { setScanItems(false); addToCart(hit.product); return; }   // needs a size → picker
    addToCart(hit.product, v); setScanNote(`Added ${hit.product.title}${v ? ` (${v.name})` : ''}`);
  }
  function onSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const hit = findByCode(products, q);
    if (!hit) return;
    const v = hit.variantId ? hit.product.variants?.find(x => x.id === hit.variantId) : undefined;
    addToCart(hit.product, v); setQ('');
  }
  function clearCart() { setCart([]); setGiftLines([]); setRedeem(false); setError(''); }

  const subtotalCents = cart.reduce((s, l) => s + lineCents(l) * l.qty, 0);
  // Deals auto-apply: the single best eligible offer for this ticket.
  const applied = useMemo(() => bestOffer(offers, subtotalCents, !!customer), [offers, subtotalCents, customer]);
  const offerCents = applied?.discountCents || 0;
  // Loyalty redemption (1 pt = 1¢), applied on the remainder after the deal.
  const afterOffer = Math.max(0, subtotalCents - offerCents);
  const redeemCents = redeem && customer ? Math.min(custPoints, afterOffer) : 0;
  const manualIn = discVal ? { type: discType, value: discType === 'PCT' ? parseFloat(discVal) || 0 : Math.round((parseFloat(discVal) || 0) * 100) } : undefined;
  const dc = composeDiscounts({ subtotalCents, offerCents, redeemCents, manual: manualIn, limitPct: discLimit });
  const canOverride = !session || session.staff.permissions.includes('DISCOUNT_OVERRIDE');
  const discountAll = dc.totalCents;
  // Tax is shown here as an ESTIMATE before tender; the server recomputes (and SNAP-paid eligible items drop out of tax).
  const taxLines = useMemo(() => cart.map(l => ({ grossCents: lineCents(l) * l.qty, taxClass: normalizeTaxClass(l.product.taxClass), snapEligible: !!l.product.snapEligible })), [cart]);
  const taxed = useMemo(() => computeTax(taxLines, taxSettings, { discountCents: discountAll }), [taxLines, taxSettings, discountAll]);
  const guidance = useMemo(() => ebtGuidance(taxLines, taxSettings, discountAll), [taxLines, taxSettings, discountAll]);
  const giftCents = giftLines.reduce((n, g) => n + g.amountCents, 0);   // untaxed liability, not part of tax/discount math
  const totalCents = taxed.totalCents + giftCents;
  const ageMin = cart.reduce((m, l) => Math.max(m, l.product.ageRestricted || 0), 0);

  async function completeSale(tenders: Tender[], tipCents: number, ageVerified: boolean) {
    if ((!cart.length && !giftLines.length) || busy) return;
    setBusy(true); setError('');
    try {
      const out = await posSaleV2({
        businessUid,
        items: cart.map(l => ({ productId: l.product.id, variantId: l.variant?.id, qty: l.qty })),
        tenders, tipCents, ageVerified, businessName,
        ...(giftLines.length ? { giftCards: giftLines } : {}),
        ...(manualIn && dc.manualCents > 0 ? { manualDiscount: manualIn as { type: 'PCT' | 'AMOUNT'; value: number } } : {}),
        ...(dc.overLimit && !canOverride && discPin ? { managerPin: discPin } : {}),
        customerUid: customer?.uid,
        redeemPoints: redeemCents, // 1pt = 1c
      }, token);
      setLastOrderId(out.orderId); setRcptMsg(''); setRcptEmail('');
      setReceipt({ total: out.paidCents, points: out.pointsEarned, saved: out.discountCents });
      // Receipt for the peripherals layer (QZ Tray printer, or browser-print fallback): tax, tenders, EBT ref/balance, tip.
      const rd: ReceiptData = receiptFromSale(businessName, out, { customerName: customer?.displayName || (customer as any)?.username });
      const issued = (out.giftCards || []).filter(g => g.code).map(g => ({ code: g.code as string, amountCents: g.amountCents, last4: g.last4, emailed: g.emailed }));
      setIssuedCodes(issued);
      if (rd.giftCards?.length) rd.giftCards = await Promise.all(rd.giftCards.map(async g => ({ ...g, qr: await QRCode.toDataURL(g.code.replace(/-/g, ''), { margin: 1, width: 220 }).catch(() => undefined) })));
      setLastReceipt(rd);
      if (qzOn) { printReceipt(rd); if (tenders.some(t => t.type === 'CASH')) openCashDrawer(); } // auto with real hardware
      sellerProducts(businessUid).then(list => setProducts(list.filter(p => p.isActive !== false))).catch(() => {});
      setCart([]); setGiftLines([]); setRedeem(false); setTenderOpen(false); setDiscVal(''); setDiscPin('');
      if (customer) setCustPoints(p => Math.max(0, p - out.redeemCents) + out.pointsEarned);
    } catch (e: any) {
      setError(e?.message || 'Sale failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0f] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white" style={{ background: GRAD }}>Register</span>
          <span className="text-sm font-bold truncate max-w-[40vw]">{businessName}</span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${qzOn ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-white/40'}`} title={qzOn ? 'QZ Tray printer/drawer connected' : 'No hardware — receipts print in-browser'}>
            {qzOn ? '🖨 Hardware' : '🖨 Browser'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setPinErr(''); setPinVal(''); setPinOpen(true); }} className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-white/10 hover:bg-white/20">{session ? `${session.staff.name} (switch)` : 'Staff PIN'}</button>
          <button onClick={() => setReturnsOpen(true)} className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-white/10 hover:bg-white/20">Returns</button>
          <button onClick={() => setGiftSheet('SELL')} className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-white/10 hover:bg-white/20">Gift cards</button>
          <button onClick={() => setDrawerOpen(true)} className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-white/10 hover:bg-white/20">Drawer</button>
        <button onClick={() => { stopScan(); onExit(); }} className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">Close</button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Product grid */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/10">
          <div className="p-3 flex gap-2">
            <button onClick={() => { setScanNote(''); setScanItems(true); }} className="shrink-0 px-4 rounded-xl text-white text-[11px] font-black uppercase tracking-widest" style={{ background: GRAD }} aria-label="Scan items with camera">Scan</button>
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearchEnter} placeholder="Search products — or scan a barcode…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-white/30" />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {loading ? (
              <div className="text-center text-white/40 text-sm py-16">Loading inventory…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-white/40 text-sm py-16">No products. Add items in Inventory — they appear here instantly.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filtered.map(p => {
                  const st = stockStatus(p);
                  const out = st === 'OUT', low = st === 'LOW';
                  const left = totalStock(p);
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className="text-left rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 active:scale-[0.98] transition">
                      <div className="aspect-square bg-white/5 relative">
                        {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                        {st !== 'UNTRACKED' && (
                          <span className={`absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${out ? 'bg-red-600' : low ? 'bg-amber-500 text-black' : 'bg-black/60'}`}
                            title={out ? 'Count says 0 — you can still sell it; the sale flags a recount' : undefined}>
                            {out ? '0 · count?' : `${left} left`}
                          </span>
                        )}
                        {p.variants?.length ? <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-black/60">{p.variants.length} options</span> : null}
                      </div>
                      <div className="p-2">
                        <div className="text-[11px] font-bold leading-tight line-clamp-2">{p.title}</div>
                        <div className="text-sm font-black mt-0.5">{money(Math.round((p.price || 0) * 100))}{p.variants?.length ? '+' : ''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Ticket / checkout */}
        <div className="w-[340px] shrink-0 flex flex-col bg-black/30">
          {/* Customer */}
          <div className="p-3 border-b border-white/10">
            {customer ? (
              <div className="flex items-center justify-between gap-2 bg-white/5 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{customer.displayName || (customer as any).username}</div>
                  <div className="text-[10px] text-amber-300 font-black">{custPoints.toLocaleString()} pts</div>
                </div>
                <button onClick={detachCustomer} className="text-[10px] font-bold uppercase text-white/50 hover:text-white">Remove</button>
              </div>
            ) : scanning ? (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="w-full aspect-video rounded-xl bg-black object-cover" />
                <button onClick={stopScan} className="w-full text-[11px] font-bold uppercase tracking-widest py-2 rounded-xl bg-white/10 hover:bg-white/20">Cancel scan</button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2">
                  <input value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Name, @handle, phone…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-white/30" />
                  {hasScanner && (
                    <button onClick={startScan} title="Scan customer QR" className="shrink-0 px-3 rounded-xl text-white text-[10px] font-black" style={{ background: GRAD }}>QR</button>
                  )}
                </div>
                {scanMsg && <div className="text-[10px] text-amber-300 font-bold mt-1">{scanMsg}</div>}
                {custResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-[#15151d] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    {custResults.map(u => (
                      <button key={u.uid} onClick={() => attachCustomer(u)} className="w-full text-left px-3 py-2 hover:bg-white/10 text-xs flex items-center gap-2">
                        {u.photoURL && <img src={u.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />}
                        <span className="truncate">{u.displayName || (u as any).username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center text-white/30 text-xs py-12">Tap products to build the ticket.</div>
            ) : cart.map(l => (
              <div key={lineKey(l)} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{l.product.title}</div>
                  <div className="text-[10px] text-white/40">{l.variant ? `${l.variant.name} · ` : ''}{money(lineCents(l))} ea</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setQty(lineKey(l), -1)} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-sm leading-none">–</button>
                  <span className="w-5 text-center text-xs font-black">{l.qty}</span>
                  <button onClick={() => setQty(lineKey(l), +1)} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-sm leading-none">+</button>
                </div>
                <div className="w-14 text-right text-xs font-black">{money(lineCents(l) * l.qty)}</div>
              </div>
            ))}
          </div>

          {/* Totals + tender */}
          <div className="p-3 border-t border-white/10 space-y-2">
            {applied && (
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
                <span>🎉 {applied.offer.label}</span><span>–{money(offerCents)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5" data-testid="manual-discount">
              <select value={discType} onChange={e => setDiscType(e.target.value as 'PCT' | 'AMOUNT')} className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1.5 text-[11px] font-bold" aria-label="Discount type"><option value="PCT">% off</option><option value="AMOUNT">$ off</option></select>
              <input value={discVal} onChange={e => setDiscVal(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="Discount" aria-label="Manual discount" className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] outline-none" />
              {dc.manualCents > 0 && <span className="text-[11px] font-bold text-emerald-300">-{money(dc.manualCents)}</span>}
              {dc.overLimit && !canOverride && <input value={discPin} onChange={e => setDiscPin(e.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" placeholder="Manager PIN" aria-label="Manager PIN for discount" className="flex-1 min-w-0 bg-amber-400/10 border border-amber-400/40 rounded-lg px-2 py-1.5 text-[11px] outline-none" />}
            </div>
            {dc.overLimit && !canOverride && <div className="text-[10px] text-amber-300 font-bold">Over {discLimit}% - a manager PIN is needed.</div>}
            {customer && custPoints > 0 && afterOffer > 0 && (
              <label className="flex items-center justify-between text-[11px] font-bold cursor-pointer">
                <span className="text-amber-300">Redeem {Math.min(custPoints, afterOffer).toLocaleString()} pts</span>
                <input type="checkbox" checked={redeem} onChange={e => setRedeem(e.target.checked)} className="accent-amber-400" />
              </label>
            )}
            {giftLines.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-fuchsia-200">
                <span>Gift card{g.recipientEmail ? ` to ${g.recipientEmail}` : ''}</span>
                <span>{money(g.amountCents)} <button onClick={() => setGiftLines(ls => ls.filter((_, j) => j !== i))} className="ml-1 text-white/40 hover:text-white" aria-label="Remove gift card">x</button></span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Subtotal</span><span>{money(subtotalCents)}</span>
            </div>
            {redeemCents > 0 && (
              <div className="flex items-center justify-between text-xs text-amber-300">
                <span>Loyalty</span><span>–{money(redeemCents)}</span>
              </div>
            )}
            {taxed.taxCents > 0 && (
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>{taxLabel(taxSettings, taxed.lines)}</span><span>{money(taxed.taxCents)}</span>
              </div>
            )}
            {guidance.hasEligible && (
              <div className="rounded-lg bg-emerald-400/10 border border-emerald-400/30 px-2.5 py-1.5 text-[11px] font-bold text-emerald-200" data-testid="ebt-guidance">{guidance.message}</div>
            )}
            <div className="flex items-center justify-between text-lg font-black">
              <span>Total</span><span>{money(totalCents)}</span>
            </div>

            {receipt && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 space-y-2">
                <div className="text-[11px] text-emerald-300 font-bold">
                  Sale complete — {money(receipt.total)}
                  {receipt.saved > 0 ? ` · saved ${money(receipt.saved)}` : ''}
                  {receipt.points > 0 ? ` · +${receipt.points} pts` : ''}.
                </div>
                {lastReceipt?.ebtLines?.map((e, i) => (
                  <div key={i} className="text-[11px] text-emerald-200">{e.label} {money(e.amountCents)} - ref {e.reference || '-'}{typeof e.balanceCents === 'number' ? ` - balance ${money(e.balanceCents)}` : ''}</div>
                ))}
                {lastReceipt && (
                  <div className="flex gap-2">
                    <button onClick={() => printReceipt(lastReceipt)} className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-widest">🖨 Receipt</button>
                    <button onClick={() => openCashDrawer()} title={qzOn ? '' : 'Requires QZ Tray + a connected printer'} className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-widest">💵 Drawer</button>
                  </div>
                )}
              </div>
            )}
            {issuedCodes.length > 0 && (
              <div className="rounded-xl bg-fuchsia-500/10 border border-fuchsia-400/30 px-3 py-2 space-y-1" data-testid="issued-gift-codes">
                <div className="text-[11px] font-black text-fuchsia-200 uppercase tracking-widest">Gift card codes - shown once</div>
                {issuedCodes.map(g => <div key={g.code} className="font-mono text-sm font-black">{g.code} <span className="text-[10px] text-white/50 font-sans">{money(g.amountCents)}{g.emailed ? ' - emailed' : ''}</span></div>)}
                <button onClick={() => setIssuedCodes([])} className="text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white">Done - hide codes</button>
              </div>
            )}
            {receipt && lastOrderId && (
              <div className="flex gap-1.5">
                <input value={rcptEmail} onChange={e => setRcptEmail(e.target.value)} placeholder="Email receipt (optional)" className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] outline-none" aria-label="Receipt email" />
                <button onClick={async () => { try { const r = await receiptLink(businessUid, lastOrderId, businessName, rcptEmail || undefined, token); try { await navigator.clipboard?.writeText(r.url); } catch { /* no clipboard */ } setRcptMsg(r.emailed ? 'Emailed + link copied' : rcptEmail && !r.emailConfigured ? 'Email not set up - link copied' : 'Link copied'); } catch (e: any) { setRcptMsg(e?.message || 'Failed'); } }} className="shrink-0 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase">{rcptEmail ? 'Send' : 'Link'}</button>
              </div>
            )}
            {rcptMsg && <div className="text-[10px] text-emerald-300 font-bold">{rcptMsg}</div>}
            {error && !tenderOpen && <div className="text-[11px] text-red-400 font-bold">{error}</div>}

            <button disabled={(!cart.length && !giftLines.length) || busy} onClick={() => { setError(''); setIssuedCodes([]); setTenderOpen(true); }}
              className="w-full py-3.5 rounded-xl font-black text-sm text-white disabled:opacity-30" style={{ background: GRAD }}>
              {busy ? '...' : `Charge ${money(totalCents)}`}
            </button>
            {(cart.length > 0 || giftLines.length > 0) && (
              <button onClick={clearCart} className="w-full text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white pt-1">Clear ticket</button>
            )}
          </div>
        </div>
      </div>
      {scanItems && <BarcodeScanner continuous title="Scan items" hint={scanNote || 'Scan each item — they land on the ticket'} onDetect={onItemScanned} onClose={() => setScanItems(false)} />}
      {giftSheet && <RegisterGiftSheet mode={giftSheet} businessUid={businessUid} token={token} customer={customer ? { uid: customer.uid, name: customer.displayName || (customer as any).username || 'Customer' } : null} onAddGift={g => setGiftLines(ls => [...ls, g])} onClose={() => setGiftSheet(null)} />}
      {returnsOpen && <RegisterReturnsSheet businessUid={businessUid} token={token} onClose={() => setReturnsOpen(false)} />}
      {drawerOpen && <RegisterDrawerSheet businessUid={businessUid} token={token} onClose={() => setDrawerOpen(false)} />}
      {pinOpen && createPortal(
        <div className="fixed inset-0 z-[220] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Staff PIN">
          <form onSubmit={async e => { e.preventDefault(); setPinErr(''); try { const s = await registerPinLogin(businessUid, pinVal); setSession(s); setPinOpen(false); } catch (er: any) { setPinErr(er?.message || 'Could not sign in.'); } }} className="w-full max-w-xs rounded-3xl bg-[#12121a] border border-white/10 p-5 space-y-3 text-white">
            <div className="text-lg font-black italic" style={{ fontFamily: 'Outfit, sans-serif' }}>Staff sign-in</div>
            <input autoFocus value={pinVal} onChange={e => setPinVal(e.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" placeholder="Your PIN" aria-label="Register PIN" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.4em] outline-none" />
            {pinErr && <div className="text-xs text-red-400 font-bold">{pinErr}</div>}
            <div className="flex gap-2"><button type="button" onClick={() => setPinOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/10 text-xs font-black uppercase">Cancel</button><button type="submit" disabled={pinVal.length < 4} className="flex-1 py-2.5 rounded-xl text-white text-xs font-black uppercase disabled:opacity-30" style={{ background: GRAD }}>Start</button></div>
            {session && <button type="button" onClick={() => { setSession(null); setPinOpen(false); }} className="w-full text-[10px] font-bold uppercase text-white/40">Sign out {session.staff.name}</button>}
          </form>
        </div>, document.body)}
      {tenderOpen && <RegisterTenderSheet lines={taxLines} discountCents={discountAll} settings={taxSettings} tipPresets={tipPresets} ageMin={ageMin} giftCents={giftCents} businessUid={businessUid} customerUid={customer?.uid} busy={busy} error={error} onCancel={() => setTenderOpen(false)} onConfirm={completeSale} />}
      {picking && <VariantPicker product={picking} allowSoldOut onPick={v => addToCart(picking, v)} onClose={() => setPicking(null)} />}
    </div>
  );
}
