// Dev-only: renders the ticket board / detail / customer page with in-memory demo tickets (no sign-in, no network).
//   /tickets-preview.html?pack=auto|laundromat   (board; click a card for the detail)
//   /tickets-preview.html?pack=auto&screen=customer   (the public /t/:token page, mobile-first)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import TicketsBoard from '../components/business/tickets/TicketsBoard';
import { createDemoApi, DEMO_TAX } from '../services/ticketDemoApi';
import { AUTO_TICKET, LAUNDRY_TICKET } from '../services/verticalPacks/packs/ticketConfigs';
import { newTicket, cleanLine, applyTransition, decideLines, toPublicView, type Ticket, type TicketConfig } from '../services/ticketCore';
import { renderTicketPage } from '../services/ticketPublicPage';

const NOW = Date.now(), H = 3_600_000;
const photo = (emoji: string, a: string, b: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="140" fill="url(#g)"/><text x="100" y="92" font-size="64" text-anchor="middle">${emoji}</text></svg>`)}`;

function build(cfg: TicketConfig, seq: number, name: string, subject: any, lines: any[], path: string[], extra: Partial<Ticket> = {}): Ticket {
  let t = newTicket(cfg, { id: `tk_demo${seq}`, seq, businessUid: 'demo', packId: 'demo', customer: { name, phone: '555-010' + seq, email: `${name.split(' ')[0].toLowerCase()}@example.com` }, subject, by: 'Demo Owner', now: NOW - (30 - seq) * H });
  lines.forEach((l, i) => { const r = cleanLine(cfg, l, `l${i + 1}`); if (r.line) t = { ...t, lines: [...t.lines, { ...r.line, ...(l.approval ? { approval: l.approval } : {}) }] }; });
  for (const s of path) t = applyTransition(t, cfg, s, 'Demo Owner', { now: NOW - (30 - seq) * H + 1000 });
  return { ...t, updatedAt: NOW - (30 - seq) * H * 0.1, ...extra };
}

const AUTO: Ticket[] = [
  build(AUTO_TICKET, 1042, 'Dana Cruz', { year: 2019, make: 'Honda', model: 'Civic', plate: 'KXT-4410', mileage_in: 48210, complaint: 'Grinding when braking' }, [
    { kind: 'SERVICE', description: 'Front brake pads & rotors', qty: 1, unitPriceCents: 42000 }, { kind: 'PART', description: 'Brake hardware kit', qty: 1, unitPriceCents: 2800, costCents: 1100 }, { kind: 'LABOR', description: 'Brake fluid flush', qty: 0.75, unitPriceCents: 13500 }], ['estimate', 'awaiting_approval'],
    { attachments: [{ id: 'a1', url: photo('🛞', '#1f2a44', '#D40055'), kind: 'image', lineId: 'l1', at: NOW, visibleToCustomer: true }] }),
  build(AUTO_TICKET, 1041, 'Marcus Webb', { year: 2015, make: 'Ford', model: 'F-150', plate: 'TRK-9921', mileage_in: 112004 }, [
    { kind: 'SERVICE', description: 'Oil & filter (full synthetic)', qty: 1, unitPriceCents: 9500, approval: 'APPROVED' }, { kind: 'PART', description: 'Cabin air filter', qty: 1, unitPriceCents: 2800, approval: 'APPROVED' }], ['estimate', 'approved', 'in_progress']),
  build(AUTO_TICKET, 1040, 'Priya Nair', { year: 2021, make: 'Toyota', model: 'RAV4', mileage_in: 22300 }, [
    { kind: 'SERVICE', description: 'Tire rotation & balance', qty: 1, unitPriceCents: 6000, approval: 'APPROVED' }], ['estimate', 'approved', 'in_progress', 'ready']),
  build(AUTO_TICKET, 1043, 'Leo Park', { make: 'Subaru', model: 'Outback', complaint: 'Check engine light' }, [], []),
  build(AUTO_TICKET, 1039, 'Ines Alvarez', { year: 2012, make: 'Nissan', model: 'Altima' }, [{ kind: 'SERVICE', description: 'Check engine diagnostic', qty: 1, unitPriceCents: 13500, approval: 'APPROVED' }], ['estimate', 'approved']),
];
const LAUNDRY: Ticket[] = [
  build(LAUNDRY_TICKET, 217, 'Jo Marsh', { bags: 2, weight_lb: 18.5, tags: ['A12', 'A13'], detergent: 'Free & clear' }, [{ kind: 'BY_WEIGHT', description: 'Wash & fold', qty: 18.5, unitPriceCents: 185, unit: 'lb' }], ['washing']),
  build(LAUNDRY_TICKET, 216, 'Sam Ortiz', { bags: 1, weight_lb: 11, tags: ['B04'] }, [{ kind: 'BY_WEIGHT', description: 'Wash & fold', qty: 11, unitPriceCents: 185, unit: 'lb' }, { kind: 'SERVICE', description: 'Comforter, king', qty: 1, unitPriceCents: 2800 }], ['washing', 'drying', 'folded', 'ready']),
  build(LAUNDRY_TICKET, 218, 'Tess Lund', { bags: 3, weight_lb: 27, care: 'Hang dry the blue shirts' }, [{ kind: 'BY_WEIGHT', description: 'Same-day wash & fold', qty: 27, unitPriceCents: 285, unit: 'lb' }], []),
];

const q = new URLSearchParams(location.search);
const isLaundry = q.get('pack') === 'laundromat';
const cfg = isLaundry ? LAUNDRY_TICKET : AUTO_TICKET;
const api = createDemoApi(cfg, isLaundry ? LAUNDRY : AUTO);

function Customer() {
  const base = AUTO[0];
  const view = toPublicView(base, AUTO_TICKET, 'Joe\'s Auto Care', DEMO_TAX);
  return <iframe title="customer ticket page" srcDoc={renderTicketPage(view, { token: 'demo', preview: true })} style={{ width: 390, height: 800, border: '1px solid #333', borderRadius: 24, margin: '16px auto', display: 'block', background: '#000' }} />;
}

function App() {
  if (q.get('screen') === 'customer') return <Customer />;
  return <div className="min-h-screen bg-[#0a0a0f] text-white p-4 max-w-6xl mx-auto"><TicketsBoard api={api} cfg={cfg} businessName={isLaundry ? 'Suds & Co Laundromat' : "Joe's Auto Care"} /></div>;
}
void decideLines;
createRoot(document.getElementById('root')!).render(<App />);
