// Dev-only: auto repair layer with in-memory demo data (no sign-in, no network, NHTSA responses are fixtures).
//   /auto-preview.html                    board + ticket detail (VIN decode, recalls, inspection, passport)
//   /auto-preview.html?screen=customer    the customer estimate page with the traffic-light inspection + Do now / Soon / Later
//   /auto-preview.html?screen=garage      My Garage (needs a server; shows the layout with an empty state)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import TicketsBoard from '../components/business/tickets/TicketsBoard';
import { createDemoApi, DEMO_TAX } from '../services/ticketDemoApi';
import { withDemoAuto } from '../components/business/auto/demoAutoApi';
import { AUTO_TICKET } from '../services/verticalPacks/packs/ticketConfigs';
import { newTicket, cleanLine, applyTransition, toPublicView, type Ticket } from '../services/ticketCore';
import { renderTicketPage } from '../services/ticketPublicPage';
import { sanitizeInspection, newInspection, toPublicInspection, recommendations, priceAll } from '../services/inspectionCore';
import { renderInspectionSection } from '../services/inspectionPublicHtml';

const NOW = Date.now();
const photo = (emoji: string, a: string, b: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="140" fill="url(#g)"/><text x="100" y="92" font-size="64" text-anchor="middle">${emoji}</text></svg>`)}`;

function demoTicket(): Ticket {
  let t = newTicket(AUTO_TICKET, { id: 'tk_a1', seq: 1042, businessUid: 'demo', packId: 'auto_repair', customer: { name: 'Dana Cruz', phone: '555-0101', email: 'dana@example.com' }, subject: { year: 2019, make: 'Honda', model: 'Civic', trim: 'EX', plate: 'KXT4410', state: 'TX', mileage_in: 48210, complaint: 'Grinding when braking' }, by: 'Demo', now: NOW - 3_600_000 });
  t = applyTransition(t, AUTO_TICKET, 'estimate', 'Demo', { now: NOW - 3_000_000 });
  return t;
}

function Customer() {
  let t = demoTicket();
  const insp = sanitizeInspection({ items: {
    brk_front: { status: 'FAIL', measurement: 2, customerNote: 'Your front pads are down to 2 mm. We recommend replacing them now for safe stopping.', attachments: [{ url: 'https://example.com/x.jpg', kind: 'image' }] },
    tire_lf: { status: 'WATCH', measurement: 4, customerNote: 'Left front tire has some life left; plan to replace within a few months.' },
    tire_rf: { status: 'PASS', measurement: 7 }, fl_oil: { status: 'PASS' }, batt_test: { status: 'PASS', measurement: 12.6 }, lt_head: { status: 'PASS' },
    flt_cabin: { status: 'WATCH', customerNote: 'Cabin filter is dirty. Not urgent.' },
  } }, newInspection('tk_a1', undefined, 'Demo Tech'), NOW);
  const lines = priceAll(recommendations(insp), { laborRateCents: 13500, partsMarkupPct: 40, priceBook: { brk_front: { partCostCents: 6200 }, tire_lf: { partCostCents: 11000 } } });
  lines.filter(l => !l.needsPrice).forEach((l, i) => { const r = cleanLine(AUTO_TICKET, { kind: l.kind, description: l.description, qty: l.qty, unitPriceCents: l.unitPriceCents, unit: l.unit, group: l.group }, `l${i + 1}`); if (r.line) t = { ...t, lines: [...t.lines, r.line] }; });
  t = applyTransition(t, AUTO_TICKET, 'awaiting_approval', 'Demo', { now: NOW });
  const pub = toPublicInspection(insp);
  pub.sections.forEach(s => s.items.forEach(i => { if (i.label === 'Front brake pads') i.photos = [photo('🛞', '#1f2a44', '#D40055')]; }));
  const view = toPublicView(t, AUTO_TICKET, "Joe's Auto Care", DEMO_TAX);
  return <iframe title="customer ticket page" srcDoc={renderTicketPage(view, { token: 'demo', preview: true, extraHtml: renderInspectionSection(pub, { shopName: "Joe's Auto Care" }) })} style={{ width: 390, height: 900, border: '1px solid #333', borderRadius: 24, margin: '16px auto', display: 'block', background: '#000' }} />;
}

const q = new URLSearchParams(location.search);
const api = withDemoAuto(createDemoApi(AUTO_TICKET, [demoTicket()]), { aiDown: q.get('ai') === 'down' });

function App() {
  if (q.get('screen') === 'customer') return <Customer />;
  if (q.get('screen') === 'garage') { const G = React.lazy(() => import('../components/MyGarageView')); return <React.Suspense fallback={null}><div className="min-h-screen bg-[#0a0a0a] pt-6 text-white"><G /></div></React.Suspense>; }
  return <div className="min-h-screen bg-[#0a0a0f] text-white p-4 max-w-6xl mx-auto"><TicketsBoard api={api} cfg={AUTO_TICKET} businessName="Joe's Auto Care" /></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
