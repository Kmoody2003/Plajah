// Dev-only: the laundromat flow with in-memory demo data (no sign-in, no network, nothing persists).
//   /laundry-preview.html                    board + Laundry desk + ticket panels (weigh-in, bag tags, delivery, pickup)
//   /laundry-preview.html?screen=weigh       the generic WeighLineSheet on its own
//   /laundry-preview.html?screen=tags        printable bag tags (label layout)
//   /laundry-preview.html?screen=customer    the customer status page (mobile-first)
//   /laundry-preview.html?screen=route       the printable driver route list
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import TicketsBoard from '../components/business/tickets/TicketsBoard';
import WeighLineSheet from '../components/WeighLineSheet';
import { createDemoApi, DEMO_TAX } from '../services/ticketDemoApi';
import { LAUNDRY_TICKET } from '../services/verticalPacks/packs/ticketConfigs';
import { newTicket, cleanLine, applyTransition, toPublicView, type Ticket } from '../services/ticketCore';
import { renderTicketPage } from '../services/ticketPublicPage';
import { attachLaundryApi, createDemoLaundryApi } from '../services/laundryService';
import { DEFAULT_LAUNDRY } from '../services/laundryDefaults';
import { makeTagCodes, tagLabels, routeStops, routeListHtml } from '../services/laundryCore';
import { tagSheetHtml } from '../services/laundryPrint';
import { cleanAccount } from '../services/commercialCore';

const NOW = Date.now(), H = 3_600_000, cfg = LAUNDRY_TICKET;
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);
function build(seq: number, name: string, subject: any, lines: any[], path: string[], uid?: string): Ticket {
  let t = newTicket(cfg, { id: `tk_demo${seq}`, seq, businessUid: 'demo', packId: 'demo', customer: { name, phone: '555-010' + (seq % 10), email: `${name.split(' ')[0].toLowerCase()}@example.com`, ...(uid ? { uid } : {}) }, subject, by: 'Demo Owner', now: NOW - 30 * H });
  lines.forEach((l, i) => { const r = cleanLine(cfg, l, `l${i + 1}`); if (r.line) t = { ...t, lines: [...t.lines, r.line] }; });
  path.forEach((s, i) => { t = applyTransition(t, cfg, s, 'Demo Owner', { now: NOW - (28 - i * 4) * H }); });
  return t;
}
const due = (h: number) => new Date(NOW + h * H).toISOString();
const SEED: Ticket[] = [
  build(217, 'Jo Marsh', { bags: 2, weight_lb: 18.5, tags: makeTagCodes('WF-217', 2), rack: 'R4', rush: 'Standard', due_at: due(6), detergent: 'Free & clear' }, [{ kind: 'BY_WEIGHT', description: 'Wash & fold', qty: 18.5, unit: 'lb', unitPriceCents: 185 }], ['washing', 'drying']),
  build(216, 'Sam Ortiz', { bags: 3, weight_lb: 31, tags: makeTagCodes('WF-216', 3), picked_tags: ['WF-216-1'], rack: 'R2', due_at: due(-20) }, [{ kind: 'BY_WEIGHT', description: 'Wash & fold', qty: 31, unit: 'lb', unitPriceCents: 185 }, { kind: 'SERVICE', description: 'Comforter, king', qty: 1, unitPriceCents: 2800 }], ['washing', 'drying', 'folded', 'ready'], 'u_sam'),
  build(218, 'Tess Lund', { bags: 1, rush: 'Rush', care: 'Hang dry the blue shirts', due_at: due(-2), svc: 'Pickup & delivery', addr: '12 Elm St, Apt 3', pu_date: day(0), pu_start: '09:00', pu_end: '11:00', dl_date: day(1), dl_start: '17:00', dl_end: '19:00' }, [{ kind: 'BY_WEIGHT', description: 'Same-day wash & fold', qty: 12, unit: 'lb', unitPriceCents: 285 }], ['washing']),
  build(219, 'Grand Hotel', { bags: 6, account: 'ac_hotel', svc: 'Pickup', pu_date: day(0), pu_start: '07:00', pu_end: '09:00', addr: '1 Grand Ave (service dock)' }, [], []),
];
const ACCOUNTS = [
  cleanAccount({ name: 'Grand Hotel', contactName: 'Ana Ruiz', email: 'ap@grand.test', termsDays: 30, pricePerLbCents: 140, schedules: [{ id: 'mwf', days: [1, 3, 5], start: '07:00', end: '09:00', address: '1 Grand Ave (service dock)' }] }, 'ac_hotel', 'demo').account!,
  cleanAccount({ name: 'Iron & Oak Gym', termsDays: 15, taxExempt: true, pricePerLbCents: 150, schedules: [{ id: 'tt', days: [2, 4], start: '06:00', end: '07:00', address: '88 Fitness Way' }] }, 'ac_gym', 'demo').account!,
];

const q = new URLSearchParams(location.search); const screen = q.get('screen');
const api = createDemoApi(cfg, SEED);
attachLaundryApi(api, createDemoLaundryApi({ accounts: ACCOUNTS, wallet: { u_sam: 1200 } }));

const frame = (srcDoc: string, w = 390, h = 800) => <iframe title="preview" srcDoc={srcDoc} style={{ width: w, height: h, border: '1px solid #333', borderRadius: 24, margin: '16px auto', display: 'block', background: '#fff' }} />;

function App() {
  if (screen === 'weigh') return <div className="min-h-screen bg-[#0a0a0f]"><WeighLineSheet pricing={DEFAULT_LAUNDRY.pricing} addons={DEFAULT_LAUNDRY.addons} pieces={DEFAULT_LAUNDRY.pieces} initial={{ grossLb: 22.4, bags: 2 }} onCancel={() => {}} onConfirm={r => alert(JSON.stringify(r.quote.lines, null, 1))} /></div>;
  if (screen === 'tags') { const t = SEED[0]; return frame(tagSheetHtml(tagLabels(t, makeTagCodes(t.number, 2), 'Tue 5:00 PM'), 'label'), 330, 220); }
  if (screen === 'customer') return frame(renderTicketPage(toPublicView(SEED[0], cfg, 'Suds & Co Laundromat', DEMO_TAX), { token: 'demo', preview: true }));
  if (screen === 'route') return frame(routeListHtml(routeStops(SEED, day(0)), { date: day(0), businessName: 'Suds & Co' }), 900, 600);
  return <div className="min-h-screen bg-[#0a0a0f] text-white p-4 max-w-6xl mx-auto"><TicketsBoard api={api} cfg={cfg} businessName="Suds & Co Laundromat" /></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
