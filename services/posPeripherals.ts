// posPeripherals — the hardware-abstraction seam for the POS register. The register calls these
// methods and never touches a device directly, so it works with zero hardware and lights up more as
// peripherals are connected:
//   • Receipt  — prints via QZ Tray + ESC/POS if QZ is running; otherwise a browser print window
//                (works on any device, no install).
//   • Drawer   — kicks a cash drawer through the receipt printer via QZ Tray (RJ11/RJ12), else no-op.
//   • Card     — Stripe Terminal card-present. Available only when @stripe/terminal-js is installed AND
//                a reader is paired; until then canCollectCard() is false and the register uses cash.
//
// QZ Tray (https://qz.io) exposes a `window.qz` API when its client + web bridge are loaded on the
// page; we use it if present and degrade cleanly if not. Nothing here throws when hardware is absent.

export interface ReceiptLine { title: string; qty: number; unitAmount: number; }
export interface ReceiptData {
  businessName: string;
  orderId: string;
  lines: ReceiptLine[];
  subtotalCents: number;
  discountCents?: number;
  totalCents: number;
  tender: string;
  pointsEarned?: number;
  customerName?: string;
  when?: number;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const qz = () => (typeof window !== 'undefined' ? (window as any).qz : undefined);

/** Is QZ Tray present and connected (so we can drive a physical printer + drawer)? */
export function isQzAvailable(): boolean {
  const q = qz();
  try { return !!q && !!q.websocket && typeof q.websocket.isActive === 'function' && q.websocket.isActive(); }
  catch { return false; }
}

async function ensureQzConnected(): Promise<boolean> {
  const q = qz();
  if (!q?.websocket) return false;
  try {
    if (q.websocket.isActive()) return true;
    await q.websocket.connect();
    return q.websocket.isActive();
  } catch { return false; }
}

async function defaultPrinter(): Promise<string | null> {
  const q = qz();
  try { return (await q.printers.getDefault()) || null; } catch { return null; }
}

// ── ESC/POS receipt bytes (for QZ raw printing) ────────────────────────────────
function escposReceipt(r: ReceiptData): string {
  const ESC = '\x1B', GS = '\x1D';
  const nl = '\n';
  let s = '';
  s += ESC + '@';                    // init
  s += ESC + 'a' + '\x01';           // center
  s += ESC + '!' + '\x38' + r.businessName + nl; // big
  s += ESC + '!' + '\x00';           // normal
  s += new Date(r.when || Date.now()).toLocaleString() + nl;
  if (r.customerName) s += r.customerName + nl;
  s += ESC + 'a' + '\x00';           // left
  s += '--------------------------------' + nl;
  for (const l of r.lines) {
    const left = `${l.qty}x ${l.title}`.slice(0, 22).padEnd(22, ' ');
    const right = money(l.unitAmount * l.qty).padStart(10, ' ');
    s += left + right + nl;
  }
  s += '--------------------------------' + nl;
  s += `Subtotal`.padEnd(22) + money(r.subtotalCents).padStart(10) + nl;
  if (r.discountCents) s += `Discount`.padEnd(22) + ('-' + money(r.discountCents)).padStart(10) + nl;
  s += ESC + '!' + '\x10' + `TOTAL`.padEnd(18) + money(r.totalCents).padStart(9) + nl;
  s += ESC + '!' + '\x00';
  s += `Paid: ${r.tender}` + nl;
  if (r.pointsEarned) s += `Points earned: ${r.pointsEarned}` + nl;
  s += nl + ESC + 'a' + '\x01' + 'Thank you!' + nl + nl + nl;
  s += GS + 'V' + '\x42' + '\x00';   // partial cut
  return s;
}

// Human-readable HTML for the browser-print fallback (no hardware needed).
function receiptHtml(r: ReceiptData): string {
  const rows = r.lines.map(l => `<tr><td>${l.qty}× ${l.title}</td><td style="text-align:right">${money(l.unitAmount * l.qty)}</td></tr>`).join('');
  return `<html><head><title>Receipt ${r.orderId}</title><style>
    body{font-family:ui-monospace,Menlo,monospace;max-width:320px;margin:0 auto;padding:16px;color:#000}
    h1{text-align:center;font-size:18px;margin:0 0 4px} .muted{text-align:center;color:#555;font-size:12px}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px} td{padding:2px 0}
    hr{border:none;border-top:1px dashed #999} .tot{display:flex;justify-content:space-between;font-weight:800;font-size:16px}
    .thanks{text-align:center;margin-top:16px;font-weight:700}</style></head>
    <body><h1>${r.businessName}</h1><div class="muted">${new Date(r.when || Date.now()).toLocaleString()}${r.customerName ? ' · ' + r.customerName : ''}</div>
    <hr/><table>${rows}</table><hr/>
    <div class="tot"><span>Subtotal</span><span>${money(r.subtotalCents)}</span></div>
    ${r.discountCents ? `<div class="tot" style="font-weight:400;color:#b00"><span>Discount</span><span>-${money(r.discountCents)}</span></div>` : ''}
    <div class="tot"><span>TOTAL</span><span>${money(r.totalCents)}</span></div>
    <div class="muted" style="margin-top:6px">Paid: ${r.tender}${r.pointsEarned ? ` · +${r.pointsEarned} pts` : ''}</div>
    <div class="thanks">Thank you!</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
    </body></html>`;
}

/** Print a receipt. Uses QZ Tray + ESC/POS when available, else a browser print window. */
export async function printReceipt(r: ReceiptData): Promise<{ ok: boolean; via: 'qz' | 'browser' | 'none' }> {
  if (isQzAvailable() && await ensureQzConnected()) {
    try {
      const q = qz();
      const printer = await defaultPrinter();
      if (printer) {
        const cfg = q.configs.create(printer);
        await q.print(cfg, [{ type: 'raw', format: 'plain', data: escposReceipt(r) }]);
        return { ok: true, via: 'qz' };
      }
    } catch { /* fall through to browser */ }
  }
  try {
    const w = window.open('', '_blank', 'width=360,height=640');
    if (!w) return { ok: false, via: 'none' };
    w.document.write(receiptHtml(r));
    w.document.close();
    return { ok: true, via: 'browser' };
  } catch { return { ok: false, via: 'none' }; }
}

/** Kick the cash drawer (through the receipt printer). Requires QZ Tray + a connected printer. */
export async function openCashDrawer(): Promise<boolean> {
  if (!isQzAvailable() || !(await ensureQzConnected())) return false;
  try {
    const q = qz();
    const printer = await defaultPrinter();
    if (!printer) return false;
    const cfg = q.configs.create(printer);
    // Standard ESC/POS drawer-kick pulse on pin 2.
    await q.print(cfg, [{ type: 'raw', format: 'plain', data: '\x1B\x70\x00\x19\xFA' }]);
    return true;
  } catch { return false; }
}

// ── Card-present (Stripe Terminal) seam ────────────────────────────────────────
// Available only when @stripe/terminal-js is installed AND a reader is paired. Kept as a graceful
// probe so the register can flip the Card button on once hardware is added — no crash meanwhile.
export async function canCollectCard(): Promise<boolean> {
  try {
    // Computed specifier + @vite-ignore so the bundler never statically resolves (the package isn't a
    // dependency yet). Installing @stripe/terminal-js + pairing a reader flips this true at runtime.
    const pkg = ['@stripe', 'terminal-js'].join('/');
    const mod = await import(/* @vite-ignore */ pkg).catch(() => null as any);
    return !!mod?.loadStripeTerminal;
  } catch { return false; }
}
