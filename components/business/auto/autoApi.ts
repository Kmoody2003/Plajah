// autoApi - typed client for the auto-repair routes (/api/auto/*) through the TicketApi `call` seam, so the same
// panels run against the real server and against the in-memory dev preview (components/business/auto/demoAutoApi).
import type { TicketApi } from '../../../services/ticketService';
import type { Vehicle } from '../../../services/vehicleCore';
import type { DecodedVehicle } from '../../../services/nhtsaCore';
import type { RecallInfo } from '../../../services/vehicleCore';
import type { Inspection } from '../../../services/inspectionCore';
import type { AdvisorDraft } from '../../../services/advisorCore';
import type { PassportEntry } from '../../../services/passportCore';

export interface DecodeResult { ok: boolean; vehicle?: DecodedVehicle; warnings?: string[]; cached?: boolean; manual?: boolean; error?: string }
export interface RecallsResult { ok: boolean; recalls?: RecallInfo[]; disclaimer?: string; cached?: boolean; stale?: boolean; error?: string; manual?: boolean; checkedAt?: number }
export interface AdvisorResult { source: 'AI' | 'TEMPLATE'; draft: AdvisorDraft; photosUsed: number; unavailable?: boolean; label: string }

export interface AutoApi {
  decodeVin(vin: string): Promise<DecodeResult>;
  recalls(a: { make: string; model: string; year: number; vehicleId?: string }): Promise<RecallsResult>;
  saveVehicle(a: { vehicleId?: string; vehicle: Record<string, any>; odometer?: number; odometerOverride?: boolean; managerPin?: string; ticketId?: string; note?: string; intervalOverrides?: Record<string, any> }): Promise<{ vehicle: Vehicle; warnings: string[] }>;
  listVehicles(q?: string): Promise<Vehicle[]>;
  getInspection(ticketId: string): Promise<Inspection | null>;
  saveInspection(ticketId: string, inspection: any): Promise<Inspection>;
  shareInspection(ticketId: string, share: boolean): Promise<void>;
  advisorDraft(ticketId: string, includePhotos: boolean): Promise<AdvisorResult>;
  publishPassport(ticketId: string): Promise<{ ok: boolean; alreadyPublished: boolean; passportKey: string; claimCode: string; ownerLinked: boolean }>;
  viewShared(token: string): Promise<{ meta: any; entries: PassportEntry[]; expiresAt: number }>;
  sendReminder(vehicleId: string, serviceKey: string, force?: boolean): Promise<{ sent: { push: boolean; email: boolean; sms: boolean }; reachable: boolean }>;
}

export function autoApiFor(api: TicketApi): AutoApi | null {
  const call = api.call; if (!call) return null;
  return {
    decodeVin: vin => call('auto/vin/decode', { vin }),
    recalls: a => call('auto/vin/recalls', a),
    saveVehicle: a => call('auto/vehicle/save', { vehicleId: a.vehicleId, vehicle: a.vehicle, odometer: a.odometer, odometerOverride: a.odometerOverride, managerPin: a.managerPin, ticketId: a.ticketId, note: a.note ? { text: a.note } : undefined, intervalOverrides: a.intervalOverrides }),
    listVehicles: async q => (await call('auto/vehicle/list', { q })).vehicles,
    getInspection: async id => (await call('auto/inspection/get', { ticketId: id })).inspection,
    saveInspection: async (id, inspection) => (await call('auto/inspection/save', { ticketId: id, inspection })).inspection,
    shareInspection: async (id, share) => { await call('auto/inspection/share', { ticketId: id, share }); },
    advisorDraft: (id, includePhotos) => call('auto/advisor/draft', { ticketId: id, includePhotos }),
    publishPassport: id => call('auto/passport/publish', { ticketId: id }),
    viewShared: token => call('auto/passport/viewShared', { token }),
    sendReminder: (vehicleId, serviceKey, force) => call('auto/reminders/send', { vehicleId, serviceKey, force }),
  };
}
