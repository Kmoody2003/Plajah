/**
 * Laundromat wash-and-fold ticket config (stages, subject schema, plug-in seams). Re-exported from ticketConfigs.ts.
 * Everything laundry specific that is not generic ticket data lives in the subject field bag, so the shared
 * ticket server/core never need laundry code: bag tags, rack, due time, rush, delivery window, commercial account.
 * Pure data + two pure hooks; rules are in services/laundryCore.ts (tests: npm run test:laundry).
 */
import type { TicketConfig } from '../../ticketCore';
import { laundryPublicExtras, SERVICES } from '../../laundryCore';

export const LAUNDRY_TICKET: TicketConfig = {
  prefix: 'WF', startAt: 1,
  noun: 'ticket', nounPlural: 'tickets',
  subjectLabel: 'Bag',
  subjectFields: [
    { id: 'bags', label: 'Bags', type: 'number', required: true },
    { id: 'weight_lb', label: 'Weight', type: 'number', unit: 'lb', hint: 'Set by the weigh-in on the ticket (manual or scale).' },
    { id: 'rush', label: 'Service level', type: 'select', options: ['Standard', 'Rush'] },
    { id: 'svc', label: 'Drop-off / delivery', type: 'select', options: SERVICES },
    { id: 'detergent', label: 'Detergent', type: 'select', options: ['Store brand', 'Free & clear', 'Customer supplied'] },
    { id: 'care', label: 'Special care', type: 'text' },
    // Bookkeeping fields (hidden from intake and from the customer page):
    { id: 'tags', label: 'Bag tags', type: 'tags', hidden: true },
    { id: 'picked_tags', label: 'Bags picked up', type: 'tags', hidden: true },
    { id: 'missing_tags', label: 'Bags reported missing', type: 'tags', hidden: true },
    { id: 'wi_lines', label: 'Weigh-in line ids', type: 'tags', hidden: true },
    { id: 'rack', label: 'Rack / shelf', type: 'text', hidden: true },
    { id: 'due_at', label: 'Ready by', type: 'text', hidden: true },
    { id: 'addr', label: 'Address', type: 'text', hidden: true },
    { id: 'addr_note', label: 'Address note', type: 'text', hidden: true },
    { id: 'pu_date', label: 'Pickup date', type: 'text', hidden: true }, { id: 'pu_start', label: 'Pickup from', type: 'text', hidden: true }, { id: 'pu_end', label: 'Pickup until', type: 'text', hidden: true },
    { id: 'dl_date', label: 'Delivery date', type: 'text', hidden: true }, { id: 'dl_start', label: 'Delivery from', type: 'text', hidden: true }, { id: 'dl_end', label: 'Delivery until', type: 'text', hidden: true },
    { id: 'account', label: 'Commercial account', type: 'text', hidden: true },
    { id: 'sched_key', label: 'Schedule key', type: 'text', hidden: true },
  ],
  requireApproval: false,
  taxClassByKind: { BY_WEIGHT: 'SERVICE', SERVICE: 'SERVICE', FEE: 'SERVICE', PART: 'STANDARD', LABOR: 'SERVICE' },
  stages: [
    { id: 'received', label: 'Received', kind: 'INTAKE', next: ['washing', 'cancelled'] },
    { id: 'washing', label: 'Washing', kind: 'IN_PROGRESS', next: ['drying', 'cancelled'] },
    { id: 'drying', label: 'Drying', kind: 'IN_PROGRESS', next: ['folded', 'cancelled'] },
    { id: 'folded', label: 'Folding', kind: 'IN_PROGRESS', next: ['ready', 'cancelled'] },
    { id: 'ready', label: 'Ready for pickup', kind: 'READY', notify: true, next: ['picked_up', 'cancelled'] },
    { id: 'picked_up', label: 'Picked up', kind: 'DONE' },
    { id: 'cancelled', label: 'Cancelled', kind: 'CANCELLED' },
  ],
  // Per-pound lines come from the weigh-in (tiers, minimums, rush), never from a fixed template.
  lineTemplates: [
    { key: 'comforter_q', label: 'Comforter, queen/full', kind: 'SERVICE', unitPriceCents: 2200 },
    { key: 'comforter_k', label: 'Comforter, king', kind: 'SERVICE', unitPriceCents: 2800 },
    { key: 'delivery_fee', label: 'Delivery fee', kind: 'FEE', unitPriceCents: 500 },
  ],
  consentText: 'I agree to the ticket above. Items are washed per the care notes; the store is not responsible for items left in pockets.',
  ui: {
    boardTools: ['laundry-desk'],
    detailPanels: ['laundry-weighin', 'laundry-bags', 'laundry-delivery', 'laundry-account', 'laundry-pickup'],
  },
  hooks: { publicExtras: laundryPublicExtras },
};
