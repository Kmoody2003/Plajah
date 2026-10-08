// inspectionPublicHtml - PURE html section for the customer ticket page: the inspection as a traffic-light report.
// Input is toPublicInspection() output only (no tech notes, https photos only). Everything is escaped.
import type { PublicInspection } from './inspectionCore';

const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const COLOR = { PASS: '#06D6A0', WATCH: '#FFD166', FAIL: '#D40055' } as const;
const WORD = { PASS: 'Good', WATCH: 'Watch', FAIL: 'Needs attention' } as const;

export function renderInspectionSection(p: PublicInspection, opts: { shopName?: string } = {}): string {
  if (!p.sections.length) return '';
  const dot = (s: 'PASS' | 'WATCH' | 'FAIL') => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${COLOR[s]};flex:none;margin-top:3px" aria-hidden="true"></span>`;
  const sections = p.sections.map(sec => `<div style="margin-top:12px"><div class="sub">${esc(sec.name)}</div>${sec.items.map(i => `
<div class="line" style="padding:10px 0"><div class="row" style="justify-content:flex-start;gap:10px">${dot(i.status)}<div style="flex:1"><div class="d">${esc(i.label)} <span style="color:${COLOR[i.status]};font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em">${esc(WORD[i.status])}</span></div>${i.detail ? `<div class="note">${esc(i.detail)}</div>` : ''}${i.note ? `<div class="note" style="color:inherit;opacity:.85">${esc(i.note)}</div>` : ''}</div></div>${i.photos.length ? `<div class="photos">${i.photos.map(u => `<img src="${esc(u)}" alt="${esc(i.label)} photo" loading="lazy">`).join('')}</div>` : ''}</div>`).join('')}</div>`).join('');
  return `<div class="card" id="inspection"><div class="sub">Vehicle inspection${opts.shopName ? ` by ${esc(opts.shopName)}` : ''}</div>
<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
<span class="pill" style="background:${COLOR.FAIL}">${p.counts.fail} need attention</span><span class="pill" style="background:${COLOR.WATCH};color:#1a1400">${p.counts.watch} to watch</span><span class="pill" style="background:${COLOR.PASS};color:#001a12">${p.counts.pass} good</span></div>
${sections}<p class="fine" style="margin-top:12px">Colors show what the technician found today. Recommended work is listed below under Do now / Soon / Later, and you choose what to approve.</p></div>`;
}
