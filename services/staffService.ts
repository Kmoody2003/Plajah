// staffService — Team / HR + time clock + payroll for a business. Roster (roles, pay, register PIN),
// clock in/out (by PIN at the register), timesheets, PTO/time-off requests, and payroll export with a
// provider-agnostic seam (CSV now; Gusto/ADP/QuickBooks/Paychex adapters are a fast-follow that map
// the same timesheet rows to each provider's import/API). Stored under businesses/{uid}/{staff,shifts,timeOff}.

import { collection, doc, addDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from './backendService';
import type { StaffMember, Shift, TimeOffRequest } from '../types';

const staffCol = (b: string) => collection(db, 'businesses', b, 'staff');
const shiftCol = (b: string) => collection(db, 'businesses', b, 'shifts');
const ptoCol = (b: string) => collection(db, 'businesses', b, 'timeOff');

// ── Roster / HR ──────────────────────────────────────────────────────────────
export async function fetchStaff(businessUid: string): Promise<StaffMember[]> {
  try {
    const snap = await getDocs(staffCol(businessUid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
}
export async function addStaff(businessUid: string, m: Omit<StaffMember, 'id' | 'businessUid' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(staffCol(businessUid), { ...m, businessUid, createdAt: Date.now() });
  return ref.id;
}
export async function updateStaff(businessUid: string, id: string, patch: Partial<StaffMember>): Promise<void> {
  await updateDoc(doc(db, 'businesses', businessUid, 'staff', id), patch as any);
}

// ── Time clock ───────────────────────────────────────────────────────────────
export async function fetchShifts(businessUid: string): Promise<Shift[]> {
  try {
    const snap = await getDocs(shiftCol(businessUid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)).sort((a, b) => b.clockIn - a.clockIn);
  } catch { return []; }
}
/** Clock a staff member IN by their register PIN. Returns the new shift id, or null if PIN unknown / already clocked in. */
export async function clockInByPin(businessUid: string, pin: string): Promise<{ shiftId: string; staffName: string } | null> {
  const staff = await fetchStaff(businessUid);
  const m = staff.find(s => s.active && s.pin && s.pin === pin);
  if (!m) return null;
  const shifts = await fetchShifts(businessUid);
  if (shifts.some(s => s.staffId === m.id && !s.clockOut)) return null; // already clocked in
  const ref = await addDoc(shiftCol(businessUid), { businessUid, staffId: m.id, staffName: m.name, clockIn: Date.now() } satisfies Omit<Shift, 'id'>);
  return { shiftId: ref.id, staffName: m.name };
}
/** Clock out a specific staff member's open shift (by PIN). Returns hours worked, or null. */
export async function clockOutByPin(businessUid: string, pin: string): Promise<{ staffName: string; hours: number } | null> {
  const staff = await fetchStaff(businessUid);
  const m = staff.find(s => s.active && s.pin && s.pin === pin);
  if (!m) return null;
  const shifts = await fetchShifts(businessUid);
  const open = shifts.find(s => s.staffId === m.id && !s.clockOut);
  if (!open) return null;
  const now = Date.now();
  await updateDoc(doc(db, 'businesses', businessUid, 'shifts', open.id), { clockOut: now });
  return { staffName: m.name, hours: (now - open.clockIn - (open.breakMinutes || 0) * 60000) / 3600000 };
}

// ── Payroll ──────────────────────────────────────────────────────────────────
export interface PayrollRow { staffId: string; name: string; hours: number; rate: number; gross: number; }

/** Sum each employee's paid hours over [start,end] and estimate gross (hourly). The rows map 1:1 to a
 *  payroll provider's import — the seam a Gusto/ADP/QuickBooks adapter plugs into. */
export function computePayroll(staff: StaffMember[], shifts: Shift[], start: number, end: number): PayrollRow[] {
  const byId = new Map(staff.map(s => [s.id, s]));
  const hoursById = new Map<string, number>();
  for (const sh of shifts) {
    if (!sh.clockOut || sh.clockIn < start || sh.clockIn > end) continue;
    const hrs = Math.max(0, (sh.clockOut - sh.clockIn - (sh.breakMinutes || 0) * 60000) / 3600000);
    hoursById.set(sh.staffId, (hoursById.get(sh.staffId) || 0) + hrs);
  }
  return [...hoursById.entries()].map(([staffId, hours]) => {
    const m = byId.get(staffId);
    const rate = m?.payType === 'HOURLY' ? (m.payRate || 0) : 0;
    return { staffId, name: m?.name || 'Employee', hours: Math.round(hours * 100) / 100, rate, gross: Math.round(hours * rate * 100) / 100 };
  }).sort((a, b) => b.gross - a.gross);
}

/** CSV a business can import into most payroll systems (Gusto/QuickBooks/ADP/Paychex accept this shape). */
export function payrollCsv(rows: PayrollRow[]): string {
  const head = 'Employee,Hours,Rate,Gross';
  const body = rows.map(r => `"${r.name.replace(/"/g, '""')}",${r.hours},${r.rate},${r.gross}`).join('\n');
  return `${head}\n${body}`;
}

// ── Time off / PTO ───────────────────────────────────────────────────────────
export async function fetchTimeOff(businessUid: string): Promise<TimeOffRequest[]> {
  try {
    const snap = await getDocs(ptoCol(businessUid));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeOffRequest)).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}
export async function requestTimeOff(businessUid: string, req: Omit<TimeOffRequest, 'id' | 'businessUid' | 'status' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(ptoCol(businessUid), { ...req, businessUid, status: 'PENDING', createdAt: Date.now() });
  return ref.id;
}
export async function respondTimeOff(businessUid: string, id: string, status: 'APPROVED' | 'DENIED'): Promise<void> {
  await updateDoc(doc(db, 'businesses', businessUid, 'timeOff', id), { status, respondedAt: Date.now() });
}

// ── Demo seed ─────────────────────────────────────────────────────────────────
/** Populate a demo team (employees + recent completed shifts + a pending PTO request) so the Team/HR
 *  stack has content for a presentation. Idempotent: skips if the roster is non-empty. */
export async function seedDemoTeam(businessUid: string): Promise<void> {
  const existing = await fetchStaff(businessUid);
  if (existing.length) return;
  const DAY = 86400000, now = Date.now();
  const roster: Array<Omit<StaffMember, 'id' | 'businessUid' | 'createdAt'>> = [
    { name: 'Maya Chen', role: 'MANAGER', payType: 'HOURLY', payRate: 24, pin: '1234', active: true },
    { name: 'Diego Rivera', role: 'STAFF', payType: 'HOURLY', payRate: 18, pin: '2345', active: true },
    { name: 'Aisha Bello', role: 'STAFF', payType: 'HOURLY', payRate: 19, pin: '3456', active: true },
    { name: 'Sam Park', role: 'STAFF', payType: 'HOURLY', payRate: 17, pin: '4567', active: true },
  ];
  for (const m of roster) {
    const ref = await addDoc(staffCol(businessUid), { ...m, businessUid, createdAt: now });
    // 3 completed ~7h shifts over the last week so payroll has data.
    for (let d = 1; d <= 3; d++) {
      const start = now - d * 2 * DAY + 9 * 3600000; // ~9am
      await addDoc(shiftCol(businessUid), { businessUid, staffId: ref.id, staffName: m.name, clockIn: start, clockOut: start + 7 * 3600000 + 15 * 60000, breakMinutes: 30 } satisfies Omit<Shift, 'id'>);
    }
  }
  await addDoc(ptoCol(businessUid), { businessUid, staffId: 'demo', staffName: 'Diego Rivera', kind: 'PTO', startDate: now + 5 * DAY, endDate: now + 7 * DAY, hours: 16, reason: 'Family trip', status: 'PENDING', createdAt: now } satisfies Omit<TimeOffRequest, 'id'>);
}
