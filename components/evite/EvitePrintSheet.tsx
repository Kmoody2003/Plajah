/**
 * EvitePrintSheet — the host's "Print it" sheet. Pick a size, paper and quantity, see the ACTUAL print file (the same
 * renderer that makes the 300 dpi file, scaled down) with optional trim / safe guides, enter where to ship, get a price
 * at cost, then pay through Stripe Checkout. Plajah adds nothing on top (PRINT_MARGIN_PCT), and the card carries a QR
 * back to the living invite.
 *
 * Everything server-side goes through the small EvitePrintApi so previews and tests can run against a fake.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PRINT_PRODUCTS, PRINT_PAPERS, PRINT_QTY_TIERS, PRINT_COUNTRIES, PRINT_MARGIN_PCT, printLayout, printProduct, cleanAddress, money,
  type PrintProductId, type PrintPaperId, type PrintAddress, type PrintQuote, type Rect,
} from '../../services/evite/evitePrintCore';
import { renderPrintFile, blobToBase64 } from '../../services/evite/evitePrintRender';
import type { EviteFields } from '../../services/evite/eviteTypes';

export interface PrintOrderBody { id: string; product: PrintProductId; paper: PrintPaperId; qty: number; address: PrintAddress }
export interface PrintQuoteResponse { quote: PrintQuote; marginPct: number; delivery?: { name: string; minDays: number | null; maxDays: number | null }; warning?: string }
export interface EvitePrintApi {
  quote(b: PrintOrderBody): Promise<PrintQuoteResponse>;
  upload(b: { id: string; product: PrintProductId; jpegBase64: string }): Promise<{ fileId: string }>;
  checkout(b: PrintOrderBody & { fileId: string }): Promise<{ url: string }>;
}

/** Default API: POST JSON with the Firebase ID token (registerService.authedFetch). Loaded lazily so the sheet's
 *  module graph doesn't pull Firebase in until the host actually asks for a price. */
const authed = async (path: string, body: unknown) => (await import('../../services/registerService')).authedFetch(path, body);
export const httpPrintApi: EvitePrintApi = {
  quote: b => authed('/api/evite/print/quote', b),
  upload: b => authed('/api/evite/print/upload', b),
  checkout: b => authed('/api/evite/print/checkout', b),
};

export interface EvitePrintSheetProps { inviteId: string; plateId: string; fields: EviteFields; accent: string; onClose(): void; api?: EvitePrintApi }

const EMPTY: PrintAddress = { name: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'US' };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const box = (r: Rect, L: { widthPx: number; heightPx: number }): React.CSSProperties => ({ left: pct(r.x, L.widthPx), top: pct(r.y, L.heightPx), width: pct(r.w, L.widthPx), height: pct(r.h, L.heightPx) });

export default function EvitePrintSheet({ inviteId, plateId, fields, accent, onClose, api = httpPrintApi }: EvitePrintSheetProps) {
  const [product, setProduct] = useState<PrintProductId>('card_5x7');
  const [paper, setPaper] = useState<PrintPaperId>('silk');
  const [qty, setQty] = useState<number>(25);
  const [addr, setAddr] = useState<PrintAddress>(EMPTY);
  const [guides, setGuides] = useState(true);
  const [preview, setPreview] = useState('');
  const [previewErr, setPreviewErr] = useState('');
  const [rendering, setRendering] = useState(false);
  const [quote, setQuote] = useState<PrintQuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);
  const [busy, setBusy] = useState('');
  const [payErr, setPayErr] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const prod = printProduct(product)!;
  const L = useMemo(() => printLayout(prod), [prod]);
  const inviteUrl = `${typeof location !== 'undefined' ? location.origin : 'https://plajah.com'}/i/${inviteId}`;
  const checked = useMemo(() => cleanAddress(addr), [addr]);
  const addressOk = checked.ok;
  // Parents often rebuild `fields` each render; re-render the preview only when the text actually changes.
  const fieldsKey = JSON.stringify(fields);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // Live preview: the real renderer at ~1/3 scale, debounced; the object URL is revoked when replaced.
  useEffect(() => {
    let alive = true; let url = '';
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        const b = await renderPrintFile({ inviteFields: fields, plateId, product: prod, accent, inviteUrl, scale: 0.34, quality: 0.85 });
        if (!alive) return;
        url = URL.createObjectURL(b); setPreview(url); setPreviewErr('');
      } catch (e: any) { if (alive) setPreviewErr(e?.message || 'Preview unavailable.'); }
      finally { if (alive) setRendering(false); }
    }, 180);
    return () => { alive = false; clearTimeout(t); if (url) setTimeout(() => URL.revokeObjectURL(url), 2000); };
  }, [fieldsKey, plateId, prod, accent, inviteUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Price: asked of the server whenever the order is complete enough to ship, debounced.
  useEffect(() => {
    setQuote(null); setQuoteErr('');
    if (!checked.ok || notConfigured) return;
    let alive = true;
    const t = setTimeout(async () => {
      setQuoting(true);
      try { const r = await api.quote({ id: inviteId, product, paper, qty, address: checked.value }); if (alive) setQuote(r); }
      catch (e: any) { if (!alive) return; if (e?.code === 'PRINT_NOT_CONFIGURED') setNotConfigured(true); setQuoteErr(e?.message || 'Could not get a price.'); }
      finally { if (alive) setQuoting(false); }
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [api, inviteId, product, paper, qty, checked, notConfigured]);

  const pay = async () => {
    if (!checked.ok || !quote) return;
    setPayErr('');
    try {
      setBusy('Rendering your cards at full size…');
      const file = await renderPrintFile({ inviteFields: fields, plateId, product: prod, accent, inviteUrl });
      setBusy('Sending the print file…');
      const { fileId } = await api.upload({ id: inviteId, product, jpegBase64: await blobToBase64(file) });
      setBusy('Opening secure checkout…');
      const { url } = await api.checkout({ id: inviteId, product, paper, qty, address: checked.value, fileId });
      location.href = url;
    } catch (e: any) {
      if (e?.code === 'PRINT_NOT_CONFIGURED') setNotConfigured(true);
      setPayErr(e?.message || 'Something went wrong. Try again.'); setBusy('');
    }
  };

  const set = (k: keyof PrintAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddr(a => ({ ...a, [k]: e.target.value }));
  const q = quote?.quote;
  const days = quote?.delivery && quote.delivery.minDays != null && quote.delivery.maxDays != null ? `${quote.delivery.minDays}–${quote.delivery.maxDays} business days` : '';

  return (
    <div className="ep-scrim" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }} style={{ ['--acc' as any]: accent }}>
      <style>{CSS}</style>
      <div className="ep-sheet" role="dialog" aria-modal="true" aria-labelledby="ep-title">
        <div className="ep-grab" aria-hidden="true" />
        <header className="ep-head">
          <h2 id="ep-title">Print your invitations</h2>
          <button ref={closeRef} className="ep-x" onClick={onClose} disabled={!!busy} aria-label="Close">×</button>
        </header>

        <section className="ep-preview" aria-label="Print preview">
          <div className="ep-paper" style={{ aspectRatio: `${L.widthPx} / ${L.heightPx}` }}>
            {preview ? <img src={preview} alt={`Preview of the printed ${prod.label} card`} /> : <div className="ep-skel" />}
            {guides && <>
              <div className="ep-guide bleed" style={box(L.bleed, L)} />
              <div className="ep-guide trim" style={box(L.trim, L)} />
              <div className="ep-guide safe" style={box(L.safe, L)} />
            </>}
            {rendering && preview && <div className="ep-busy" aria-hidden="true" />}
          </div>
          {previewErr && <p className="ep-err" role="alert">{previewErr}</p>}
          <label className="ep-check"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} /> Show cut and safe lines</label>
          {guides && <p className="ep-legend"><span className="k trim" />Cut line <span className="k safe" />Safe area (text stays inside) <span className="k bleed" />Bleed (trimmed off)</p>}
        </section>

        <section className="ep-sec">
          <h3>Size</h3>
          <div className="ep-seg" role="radiogroup" aria-label="Card size">
            {PRINT_PRODUCTS.map(p => <button key={p.id} type="button" role="radio" aria-checked={product === p.id} className={product === p.id ? 'on' : ''} onClick={() => setProduct(p.id)}><b>{p.label}</b><small>{p.blurb}</small></button>)}
          </div>
          <h3>Paper</h3>
          <div className="ep-seg" role="radiogroup" aria-label="Paper">
            {PRINT_PAPERS.map(p => <button key={p.id} type="button" role="radio" aria-checked={paper === p.id} className={paper === p.id ? 'on' : ''} onClick={() => setPaper(p.id)}><b>{p.label}</b><small>{p.blurb}</small></button>)}
          </div>
          <h3>How many</h3>
          <div className="ep-chips" role="radiogroup" aria-label="Quantity">
            {PRINT_QTY_TIERS.map(n => <button key={n} type="button" role="radio" aria-checked={qty === n} className={`ep-chip${qty === n ? ' on' : ''}`} onClick={() => setQty(n)}>{n}</button>)}
          </div>
        </section>

        <section className="ep-sec">
          <h3>Ship to</h3>
          <div className="ep-form">
            <input className="ep-in full" placeholder="Full name" value={addr.name} onChange={set('name')} autoComplete="shipping name" maxLength={80} aria-label="Full name" />
            <input className="ep-in full" placeholder="Street address" value={addr.line1} onChange={set('line1')} autoComplete="shipping address-line1" maxLength={120} aria-label="Street address" />
            <input className="ep-in full" placeholder="Apt, suite (optional)" value={addr.line2 || ''} onChange={set('line2')} autoComplete="shipping address-line2" maxLength={120} aria-label="Apartment or suite" />
            <input className="ep-in" placeholder="City" value={addr.city} onChange={set('city')} autoComplete="shipping address-level2" maxLength={80} aria-label="City" />
            <input className="ep-in" placeholder={addr.country === 'CA' ? 'Province' : 'State'} value={addr.state || ''} onChange={set('state')} autoComplete="shipping address-level1" maxLength={40} aria-label="State or province" />
            <input className="ep-in" placeholder={addr.country === 'US' ? 'ZIP' : 'Postal code'} value={addr.postalCode} onChange={set('postalCode')} autoComplete="shipping postal-code" maxLength={16} aria-label="Postal code" />
            <select className="ep-in" value={addr.country} onChange={set('country')} autoComplete="shipping country" aria-label="Country">
              {PRINT_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          {!addressOk && (addr.name || addr.line1 || addr.postalCode) && checked.ok === false && <p className="ep-hint">{checked.error}</p>}
        </section>

        <section className="ep-sec ep-quote" aria-live="polite">
          {notConfigured ? <p className="ep-note">{quoteErr || 'Printed invitations aren’t switched on yet.'}</p>
            : !addressOk ? <p className="ep-note">Add where to ship and we’ll show the exact price.</p>
              : quoting && !q ? <p className="ep-note">Asking the printer for a price…</p>
                : quoteErr ? <p className="ep-err" role="alert">{quoteErr}</p>
                  : q ? <>
                    <div className="ep-row"><span>{q.qty} cards · {prod.label} · {PRINT_PAPERS.find(p => p.id === paper)?.label}</span><span>{money(q.itemsCents)}</span></div>
                    <div className="ep-row"><span>Shipping{days ? ` · ${days}` : ''}</span><span>{money(q.shippingCents)}</span></div>
                    <div className="ep-row"><span>Card processing</span><span>{money(q.processingCents)}</span></div>
                    <div className="ep-row"><span>Plajah</span><span>{q.marginCents ? money(q.marginCents) : '$0.00'}</span></div>
                    <div className="ep-row total"><span>Total</span><span>{money(q.totalCents)}</span></div>
                    <p className="ep-note">{(quote?.marginPct ?? PRINT_MARGIN_PCT) === 0 ? 'At cost: you pay what the printer, the shipper and the card network charge. Plajah adds nothing.' : `Includes a ${quote?.marginPct}% Plajah margin.`} About {money(q.perCardCents)} a card.</p>
                    {quote?.warning && <p className="ep-hint">{quote.warning}</p>}
                  </> : null}
        </section>

        {payErr && <p className="ep-err" role="alert">{payErr}</p>}
        <button className="ep-btn" onClick={pay} disabled={!q || !!busy || notConfigured || quoting}>{busy || (q ? `Pay ${money(q.totalCents)} and print` : 'Pay and print')}</button>
        <p className="ep-fine">Each card has a small QR code that opens your live invitation, so guests can still RSVP. Printed and shipped by our print partner; you’ll get a receipt by email.</p>
      </div>
    </div>
  );
}

const CSS = `
.ep-scrim{position:fixed;inset:0;z-index:1000;background:rgba(5,3,9,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;font:15px/1.45 Inter,system-ui,sans-serif;color:#f4f1fa}
.ep-scrim *{box-sizing:border-box}
.ep-sheet{width:100%;max-width:560px;max-height:94vh;overflow:auto;overscroll-behavior:contain;background:linear-gradient(180deg,rgba(32,16,52,.94),rgba(14,8,24,.97));border:1px solid rgba(244,241,250,.12);border-bottom:0;border-radius:26px 26px 0 0;padding:8px 16px calc(18px + env(safe-area-inset-bottom));display:grid;gap:14px;box-shadow:0 -30px 80px -30px rgba(107,0,153,.6)}
@media (min-width:720px){.ep-scrim{align-items:center}.ep-sheet{border-radius:26px;border-bottom:1px solid rgba(244,241,250,.12);max-height:90vh}}
.ep-grab{justify-self:center;width:44px;height:5px;border-radius:9px;background:rgba(244,241,250,.25)}
.ep-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ep-head h2{margin:0;font:900 italic 21px Outfit,sans-serif;text-transform:uppercase;letter-spacing:-.01em}
.ep-x{width:44px;height:44px;border-radius:50%;border:1px solid rgba(244,241,250,.18);background:rgba(255,255,255,.05);color:#fff;font:400 26px/1 Inter;cursor:pointer}
.ep-preview{display:grid;justify-items:center;gap:8px}
.ep-paper{position:relative;width:min(72vw,300px);border-radius:6px;overflow:hidden;background:#1a1028;box-shadow:0 24px 60px -24px rgba(0,0,0,.9),0 0 0 1px rgba(244,241,250,.08)}
.ep-paper img{position:absolute;inset:0;width:100%;height:100%;display:block}
.ep-skel{position:absolute;inset:0;background:linear-gradient(110deg,#140b22 30%,#20123a 50%,#140b22 70%);background-size:200% 100%;animation:epsk 1.4s linear infinite}
.ep-busy{position:absolute;inset:0;background:rgba(5,3,9,.25)}
@keyframes epsk{to{background-position:-200% 0}}
.ep-guide{position:absolute;pointer-events:none}
.ep-guide.bleed{outline:2px solid rgba(212,0,85,.55);outline-offset:-2px}
.ep-guide.trim{border:1.5px solid #FF8C00}
.ep-guide.safe{border:1.5px dashed rgba(244,241,250,.75)}
.ep-legend{margin:0;font-size:12px;color:rgba(244,241,250,.65);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;justify-content:center}
.ep-legend .k{display:inline-block;width:14px;height:0;border-top:2px solid;vertical-align:middle;margin-right:2px}.k.trim{border-color:#FF8C00}.k.safe{border-top:2px dashed rgba(244,241,250,.75)}.k.bleed{border-color:#D40055}
.ep-check{display:flex;gap:8px;align-items:center;font-size:13px;color:rgba(244,241,250,.85)}.ep-check input{width:20px;height:20px;accent-color:#D40055}
.ep-sec{display:grid;gap:8px;background:rgba(255,255,255,.045);border:1px solid rgba(244,241,250,.1);border-radius:20px;padding:14px}
.ep-sec h3{margin:4px 0 0;font:800 11px Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:rgba(244,241,250,.6)}
.ep-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ep-seg button{min-height:64px;border-radius:14px;border:1px solid rgba(244,241,250,.16);background:rgba(255,255,255,.04);color:#f4f1fa;padding:8px;display:grid;gap:2px;align-content:center;text-align:center;cursor:pointer;font:inherit}
.ep-seg button b{font:800 14px Inter}.ep-seg button small{font-size:11px;line-height:1.25;color:rgba(244,241,250,.6)}
.ep-seg button.on{border-color:transparent;background:linear-gradient(135deg,rgba(107,0,153,.75),rgba(212,0,85,.7));box-shadow:0 0 0 2px #FF8C00 inset}
.ep-seg button.on small{color:rgba(255,255,255,.85)}
.ep-chips{display:flex;flex-wrap:wrap;gap:8px}
.ep-chip{min-width:52px;min-height:42px;padding:0 14px;border-radius:999px;border:1px solid rgba(244,241,250,.18);background:rgba(255,255,255,.04);color:#f4f1fa;font:800 14px Inter;cursor:pointer}
.ep-chip.on{background:#FF8C00;border-color:#FF8C00;color:#1a0d00}
.ep-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ep-in.full{grid-column:1/-1}
.ep-in{width:100%;min-height:46px;border-radius:14px;border:1px solid rgba(244,241,250,.16);background:rgba(0,0,0,.28);color:#f4f1fa;padding:10px 12px;font:16px Inter,sans-serif}
.ep-in option{background:#1a1028}
.ep-in:focus-visible,.ep-seg button:focus-visible,.ep-chip:focus-visible,.ep-btn:focus-visible,.ep-x:focus-visible{outline:2px solid #FF8C00;outline-offset:2px}
.ep-quote{gap:4px}
.ep-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid rgba(244,241,250,.07);font-size:14px}.ep-row span:last-child{font-variant-numeric:tabular-nums;font-weight:700}
.ep-row.total{border-bottom:0;font:800 17px Inter;padding-top:8px}
.ep-note{margin:4px 0 0;font-size:13px;color:rgba(244,241,250,.65)}
.ep-hint{margin:0;font-size:13px;color:#FFB45C}
.ep-err{margin:0;color:#ff8a8a;font-weight:700;font-size:14px}
.ep-btn{min-height:54px;border:0;border-radius:999px;background:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);color:#fff;font:800 14px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.ep-btn:disabled{opacity:.5;cursor:default}
.ep-fine{margin:0;text-align:center;font-size:12px;color:rgba(244,241,250,.5)}
@media (prefers-reduced-motion:reduce){.ep-skel{animation:none}}
`;
