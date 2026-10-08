/**
 * Ticket-engine configs for service packs (pure data; the engine lives in services/ticketCore.ts).
 * Auto repair legacy `stages` ids (estimate, approved, in_progress, ready, picked_up) are all present here.
 * Subject schemas are plain field lists so later waves (VIN decode, inspection checklists, scale input) can
 * add fields or typed field kinds without touching the engine.
 */
import type { TicketConfig } from '../../ticketCore';

export const AUTO_TICKET: TicketConfig = {
  prefix: 'RO', startAt: 1001,
  noun: 'repair order', nounPlural: 'repair orders',
  subjectLabel: 'Vehicle',
  subjectFields: [
    { id: 'vin', label: 'VIN', type: 'text', hint: '17 characters. Scan the windshield barcode or type it; NHTSA decode fills the rest.' },
    { id: 'plate', label: 'License plate', type: 'text' },
    { id: 'state', label: 'Plate state', type: 'text' },
    { id: 'year', label: 'Year', type: 'number' },
    { id: 'make', label: 'Make', type: 'text' },
    { id: 'model', label: 'Model', type: 'text', required: true },
    { id: 'trim', label: 'Trim', type: 'text' },
    { id: 'engine', label: 'Engine', type: 'text' },
    { id: 'vehicleId', label: 'Vehicle record', type: 'text', hint: 'Linked vehicle record id (set automatically).' },
    { id: 'mileage_in', label: 'Mileage in', type: 'number', unit: 'mi' },
    { id: 'complaint', label: 'Customer concern', type: 'text' },
  ],
  requireApproval: true,
  taxClassByKind: { PART: 'STANDARD', LABOR: 'LABOR', SERVICE: 'SERVICE', FEE: 'STANDARD' },
  laborRateCents: 13500, partsMarkupPct: 40,
  // Auto-repair plug-ins (components/business/auto/*): VIN intake, vehicle record, digital inspection, passport.
  intakePanel: 'auto_vehicle_intake',
  panels: ['auto_vehicle', 'auto_inspection', 'auto_passport', 'auto_reminders'],
  panelConfig: {
    inspection: { templateId: 'auto_multipoint_v1', /** price book by template item id: { hours?, partCostCents?, partPriceCents? } - empty = shop defaults only, parts flagged "needs price" */ priceBook: {} },
    reminders: { intervals: {} },
  },
  stages: [
    { id: 'intake', label: 'Checked in', kind: 'INTAKE', next: ['estimate', 'cancelled'] },
    { id: 'estimate', label: 'Estimate', kind: 'ESTIMATE', next: ['awaiting_approval', 'approved', 'cancelled'] },
    { id: 'awaiting_approval', label: 'Awaiting approval', kind: 'AWAITING_APPROVAL', notify: true, next: ['approved', 'estimate', 'cancelled'] },
    { id: 'approved', label: 'Approved', kind: 'APPROVED', next: ['in_progress', 'awaiting_approval', 'cancelled'] },
    { id: 'in_progress', label: 'Work in progress', kind: 'IN_PROGRESS', next: ['ready', 'awaiting_approval', 'cancelled'] },
    { id: 'ready', label: 'Ready for pickup', kind: 'READY', notify: true, next: ['picked_up', 'in_progress', 'cancelled'] },
    { id: 'picked_up', label: 'Picked up', kind: 'DONE' },
    { id: 'cancelled', label: 'Cancelled', kind: 'CANCELLED' },
  ],
  lineTemplates: [
    { key: 'labor_hr', label: 'Labor (per hour)', kind: 'LABOR', unitPriceCents: 13500, unit: 'hr' },
    { key: 'diag', label: 'Check engine diagnostic', kind: 'SERVICE', unitPriceCents: 13500 },
    { key: 'oil_synth', label: 'Oil & filter change (full synthetic)', kind: 'SERVICE', unitPriceCents: 9500 },
    { key: 'part', label: 'Part (cost + 40%)', kind: 'PART', unitPriceCents: 0 },
    { key: 'shop_fee', label: 'Shop supplies & disposal', kind: 'FEE', unitPriceCents: 500 },
  ],
  consentText: 'I authorize the repairs and charges I approved above. Declined items will not be done. The shop will call me before adding anything.',
};

// Laundromat config lives in its own file (laundry plug-in seams). Re-exported here so existing imports keep working.
export { LAUNDRY_TICKET } from './laundryTicket';
