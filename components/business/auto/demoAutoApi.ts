// demoAutoApi - in-memory implementation of the /api/auto/* routes for the dev preview (auto-preview.html). Runs the
// REAL pure cores (inspection sanitising, advisor validation, passport entries); NHTSA responses come from the test
// FIXTURES (hand-written, not live captures) and the "model" is a canned reply that goes through the real validator.
import type { TicketApi } from '../../../services/ticketService';
import { parseDecodeVin, parseRecalls } from '../../../services/nhtsaCore';
import { validateVin, vehicleKey, addMileage, type Vehicle } from '../../../services/vehicleCore';
import { sanitizeInspection, newInspection, templateById, type Inspection } from '../../../services/inspectionCore';
import { buildFindings, validateAdvisorResponse, fallbackDraft } from '../../../services/advisorCore';
import { buildEntry, type PassportEntry } from '../../../services/passportCore';
import { DECODE_OK, RECALLS_OK } from '../../../tests/fixtures/nhtsa-fixtures';

export function withDemoAuto(api: TicketApi, opts: { aiDown?: boolean } = {}): TicketApi {
  const inspections = new Map<string, Inspection>(); const vehicles = new Map<string, Vehicle>(); const entries: PassportEntry[] = [];
  const wait = () => new Promise(r => setTimeout(r, 250));
  const call = async (route: string, body: any = {}): Promise<any> => {
    await wait();
    switch (route) {
      case 'auto/vin/decode': { const c = validateVin(body.vin); if (!c.valid) throw new Error(c.errors[0]); const p = parseDecodeVin(DECODE_OK, c.vin); return { ok: true, vehicle: { ...p.vehicle, vin: c.vin }, warnings: c.warnings, cached: false, source: 'NHTSA' }; }
      case 'auto/vin/recalls': return { ok: true, recalls: parseRecalls(RECALLS_OK).recalls, cached: false };
      case 'auto/vehicle/save': {
        const key = vehicleKey(body.vehicle || {}) || 'k'; const id = body.vehicleId || `vh_${key}`;
        let v: Vehicle = vehicles.get(id) || { id, businessUid: 'demo', key, mileage: [], services: [], notes: [], photos: [], createdAt: Date.now(), updatedAt: Date.now() };
        v = { ...v, ...body.vehicle, updatedAt: Date.now() };
        if (body.odometer) { const r = addMileage(v.mileage, { odometer: body.odometer, at: Date.now(), source: 'demo' }, { override: !!body.odometerOverride }); if (!r.check.ok) { const e: any = new Error(r.check.error); e.code = 'ODOMETER_LOWER'; throw e; } v.mileage = r.history; }
        vehicles.set(id, v); return { vehicle: v, warnings: [] };
      }
      case 'auto/vehicle/list': return { vehicles: [...vehicles.values()] };
      case 'auto/inspection/get': return { inspection: inspections.get(body.ticketId) || null };
      case 'auto/inspection/save': {
        const base = inspections.get(body.ticketId) || newInspection(body.ticketId, templateById(undefined).id, 'Demo Tech');
        const next = sanitizeInspection(body.inspection, { ...base, items: base.items }); inspections.set(body.ticketId, { ...next, sharedAt: base.sharedAt }); return { inspection: inspections.get(body.ticketId) };
      }
      case 'auto/inspection/share': { const i = inspections.get(body.ticketId); if (i) inspections.set(body.ticketId, { ...i, sharedAt: Date.now() }); return { shared: true }; }
      case 'auto/advisor/draft': {
        const i = inspections.get(body.ticketId)!; const f = buildFindings(i);
        if (opts.aiDown) return { source: 'TEMPLATE', draft: fallbackDraft(f), photosUsed: 0, unavailable: true, label: 'AI is unavailable right now. Standard wording shown; edit before sending.' };
        const raw = JSON.stringify({ summary: 'Brakes need attention now; the rest can be planned.', items: f.map(x => ({ itemId: x.itemId, explanation: x.status === 'FAIL' ? `Your ${x.label.toLowerCase()} ${x.measurement ? `(${x.measurement}) ` : ''}is worn past the point we are comfortable with, so we recommend replacing it.` : `${x.label} is getting worn. Not urgent, but worth planning for.`, priority: x.status === 'FAIL' ? 'SAFETY' : 'LATER', hoursLow: 1, hoursHigh: 2, parts: ['replacement part'] })) });
        const v = validateAdvisorResponse(raw, f); if (v.ok === false) throw new Error((v as any).error);
        return { source: 'AI', draft: v.draft, photosUsed: 0, label: 'AI draft. Review and edit before anything is sent.' };
      }
      case 'auto/passport/publish': {
        const t = (await api.get(body.ticketId)).ticket; const e = buildEntry({ id: t.id, passportKey: 'vin_demo', shopUid: 'demo', shopName: "Joe's Auto Care", ticketId: t.id, ticketNumber: t.number, at: Date.now(), lines: t.lines, serviceKeys: [] });
        if (e.entry) entries.push(e.entry); return { ok: true, alreadyPublished: false, passportKey: 'vin_demo', claimCode: t.customer.uid ? '' : 'K7QM-4XRD', ownerLinked: !!t.customer.uid };
      }
      case 'auto/passport/viewShared': return { meta: { year: 2019, make: 'Honda', model: 'Civic' }, entries, expiresAt: Date.now() + 1e7 };
      case 'auto/reminders/send': return { sent: { push: true, email: false, sms: false }, reachable: true };
      default: throw new Error(`demo: no route ${route}`);
    }
  };
  return { ...api, call, businessUid: 'demo', packId: 'auto_repair' };
}
