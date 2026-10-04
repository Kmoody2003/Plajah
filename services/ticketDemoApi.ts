// ticketDemoApi - in-memory TicketApi for the dev preview. Uses the real ticketCore rules (guards, totals,
// approvals), so the preview behaves like the server; it just never touches the network or Firestore.
import {
  type Ticket, type TicketConfig, newTicket, cleanLine, cleanSubject, canTransition, applyTransition, decideLines, addDeposit, startTimer, stopTimer,
  audit, matchesQuery, lineFromTemplate, computeTicketTotals, stageKind, stageOfKind, allowedNext, makeId,
} from './ticketCore';
import type { TicketApi } from './ticketService';
import { parseTaxSettings } from './taxCore';

export const DEMO_TAX = parseTaxSettings({ defaultRateBps: 825, rates: { LABOR: 0, SERVICE: 0 } });

export function createDemoApi(cfg: TicketConfig, seed: Ticket[] = [], opts: { latencyMs?: number } = {}): TicketApi & { all(): Ticket[] } {
  let db = [...seed]; let seq = Math.max(cfg.startAt - 1, ...seed.map(t => t.seq)) + 1;
  const wait = () => new Promise(r => setTimeout(r, opts.latencyMs ?? 120));
  const find = (id: string) => { const t = db.find(x => x.id === id); if (!t) throw new Error('Ticket not found.'); return t; };
  const put = (t: Ticket) => { db = db.map(x => (x.id === t.id ? { ...t, updatedAt: Date.now() } : x)); return db.find(x => x.id === t.id)!; };
  const by = 'Demo Owner';
  return {
    all: () => db,
    async list(q) { await wait(); return db.filter(t => matchesQuery(t, q || '')).sort((a, b) => b.updatedAt - a.updatedAt); },
    async get(id) { await wait(); return { ticket: find(id), link: `https://plajah.com/t/${id}.1.demo` }; },
    async create(input) {
      await wait();
      const cs = cleanSubject(cfg, input.subject); if (cs.errors.length) throw new Error(cs.errors[0]);
      if (!input.customer.name?.trim()) throw new Error('Customer name is required.');
      let t = newTicket(cfg, { id: makeId('tk'), seq: seq++, businessUid: 'demo', packId: 'demo', customer: input.customer, subject: cs.subject, by });
      let n = 0;
      for (const k of input.templates || []) { const raw = lineFromTemplate(cfg, k); const cl = raw && cleanLine(cfg, raw, `l${++n}`); if (cl?.line) t = { ...t, lines: [...t.lines, cl.line] }; }
      db = [t, ...db]; return t;
    },
    async update(id, p) {
      await wait(); let t = find(id);
      if (p.customer) t = { ...t, customer: { ...t.customer, ...p.customer } };
      if (p.subject) { const cs = cleanSubject(cfg, { ...t.subject, ...p.subject }); if (cs.errors.length) throw new Error(cs.errors[0]); t = { ...t, subject: cs.subject }; }
      if (p.assignedTo !== undefined) t = audit({ ...t, assignedTo: p.assignedTo || undefined }, { by, type: 'ASSIGN', detail: p.assignedTo?.name || 'unassigned' });
      if (p.note?.text) t = { ...t, notes: [...t.notes, { id: makeId('n'), text: p.note.text, internal: p.note.internal !== false, by, at: Date.now() }] };
      if (p.attachment?.url) t = audit({ ...t, attachments: [...t.attachments, { id: makeId('a'), url: p.attachment.url, kind: p.attachment.kind || 'image', lineId: p.attachment.lineId, by, at: Date.now(), visibleToCustomer: p.attachment.visibleToCustomer !== false }] }, { by, type: 'ATTACH' });
      if (p.removeAttachmentId) t = { ...t, attachments: t.attachments.filter(a => a.id !== p.removeAttachmentId) };
      if (p.timer) { const r = p.timer === 'start' ? startTimer(t, { id: makeId('tm'), staffId: 'demo', staffName: by }) : stopTimer(t, 'demo'); if (r.error) throw new Error(r.error); t = r.ticket!; }
      return put(t);
    },
    async line(id, b) {
      await wait(); const t = find(id);
      if (t.saleOrderId) throw new Error('This ticket is already paid.');
      let nt = t;
      if (b.op === 'add') { const cl = cleanLine(cfg, b.line, makeId('l')); if (!cl.line) throw new Error(cl.error); nt = audit({ ...t, lines: [...t.lines, cl.line] }, { by, type: 'LINE', detail: `+ ${cl.line.description}` }); }
      else if (b.op === 'remove') nt = audit({ ...t, lines: t.lines.filter(l => l.id !== b.lineId) }, { by, type: 'LINE', detail: '- line' });
      else if (b.op === 'edit') {
        const cur = t.lines.find(l => l.id === b.lineId)!; const cl = cleanLine(cfg, { ...cur, ...b.line }, cur.id); if (!cl.line) throw new Error(cl.error);
        const money = cl.line.unitPriceCents !== cur.unitPriceCents || cl.line.qty !== cur.qty;
        nt = audit({ ...t, lines: t.lines.map(l => (l.id === cur.id ? { ...cl.line!, approval: money && cur.approval !== 'PENDING' && cfg.requireApproval ? 'PENDING' : cur.approval } : l)) }, { by, type: 'LINE', detail: '~ line' });
      } else if (b.op === 'decide') nt = decideLines(t, b.decisions, { ip: 'staff', consentText: 'Recorded by staff', via: 'STAFF', by }).ticket;
      return put(nt);
    },
    async transition(id, to, o = {}) {
      await wait(); const t = find(id);
      const c = canTransition(t, cfg, to, { override: !!o.override, tax: DEMO_TAX });
      if (c.ok === false) { const e: any = new Error(c.error); e.code = c.canOverride ? `OVERRIDABLE_${c.code}` : c.code; throw e; }
      return { ticket: put(applyTransition(t, cfg, to, by, { overridden: c.overridden, reason: o.reason })), notified: { push: true, email: false, sms: false } };
    },
    async deposit(id, amountCents, method, reference) { await wait(); const r = addDeposit(find(id), { id: makeId('d'), amountCents, method, reference, by }); if (r.error) throw new Error(r.error); return put(r.ticket!); },
    async link(id) { await wait(); return `https://plajah.com/t/${id}.1.demo`; },
    async uploadPhoto(file) { return URL.createObjectURL(file); },
    async payContext(_t, subtotal) { return { tax: DEMO_TAX, tipPresets: [15, 18, 20], discountCents: 0 }; },
    async pay(t, a) {
      await wait();
      const tot = computeTicketTotals(t, cfg, DEMO_TAX);
      let nt = audit({ ...t, saleOrderId: makeId('pos'), paidAt: Date.now(), paidCents: tot.balanceCents + a.tipCents }, { by, type: 'PAYMENT', detail: 'demo payment' });
      if (stageKind(cfg, nt.stage) === 'READY') { const d = stageOfKind(cfg, 'DONE'); if (d && allowedNext(cfg, nt.stage).includes(d.id)) nt = applyTransition(nt, cfg, d.id, by, { reason: 'paid at register' }); }
      put(nt); return { orderId: nt.saleOrderId!, paidCents: tot.balanceCents + a.tipCents };
    },
  };
}
