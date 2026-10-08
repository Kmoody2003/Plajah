// laundryPrint - printable bag tags, rack labels and day sheets (browser print window; thermal-label friendly).
// The HTML builders are pure strings (tested); only `printHtml` touches window. Tags carry a Code 128 barcode AND a QR
// of the same text (WF-217-2), so any USB wedge scanner, phone camera (BarcodeScanner) or typing the code works.
// Roll printers: choose "label" (2.25 x 1.25 in, one tag per page). Office printers: "sheet" (3 x 10 per Letter page).
// Raw ZPL/ESC-POS label printing through QZ Tray is NOT built (receipts already use QZ in posPeripherals).
import { code128Svg } from './code128';
import { ticketQrSvg } from './tela/ticketQr';
import { escapeHtml, type TagLabel } from './laundryCore';

export type TagLayout = 'label' | 'sheet';
const CSS = {
  label: '@page{size:2.25in 1.25in;margin:0}body{margin:0}.tag{width:2.25in;height:1.25in;box-sizing:border-box;padding:.06in .08in;page-break-after:always;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}',
  sheet: '@page{size:letter;margin:.5in .19in}body{margin:0;display:grid;grid-template-columns:repeat(3,2.625in);grid-auto-rows:1in;column-gap:.12in}.tag{width:2.625in;height:1in;box-sizing:border-box;padding:.05in .08in;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}',
};
const BASE = 'body{font-family:system-ui,Arial,sans-serif;color:#000}.hd{display:flex;justify-content:space-between;align-items:baseline;font-weight:800;font-size:11pt}.rush{background:#000;color:#fff;padding:0 4px;border-radius:3px;font-size:8pt}.mid{display:flex;gap:6px;align-items:center}.mid svg{height:.5in;width:auto;max-width:1.4in}.qr svg{height:.5in;width:.5in}.ft{font-size:7.5pt;display:flex;justify-content:space-between}.n{font-weight:800}';

export function tagHtml(l: TagLabel): string {
  const bc = code128Svg(l.code, { height: 40, moduleW: 1 });
  let qr = ''; try { qr = ticketQrSvg(l.code, 60); } catch { /* QR is a bonus; the barcode alone is enough */ }
  return `<div class="tag"><div class="hd"><span>${escapeHtml(l.number)}</span><span class="n">${l.n}/${l.of}</span>${l.rush ? '<span class="rush">RUSH</span>' : ''}</div><div class="mid">${bc}<span class="qr">${qr}</span></div><div class="ft"><span>${escapeHtml(l.customer)}</span><span>${escapeHtml([l.rack && `Rack ${l.rack}`, l.dueText].filter(Boolean).join(' · '))}</span></div></div>`;
}
export function tagSheetHtml(labels: TagLabel[], layout: TagLayout = 'label'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bag tags</title><style>${BASE}${CSS[layout]}</style></head><body>${labels.map(tagHtml).join('')}</body></html>`;
}
export function rackLabelHtml(rack: string, ticketNumber: string, customer: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Rack label</title><style>${BASE}${CSS.label}.big{font-size:30pt;font-weight:900;text-align:center}</style></head><body><div class="tag"><div class="hd"><span>${escapeHtml(ticketNumber)}</span><span>${escapeHtml(customer)}</span></div><div class="big">${escapeHtml(rack || '-')}</div></div></body></html>`;
}

/** Open a print window with `html`. Returns false if the browser blocked the popup. */
export function printHtml(html: string): boolean {
  try {
    const w = window.open('', '_blank', 'width=480,height=640'); if (!w) return false;
    w.document.write(html + '<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>'); w.document.close(); return true;
  } catch { return false; }
}
