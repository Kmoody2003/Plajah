/**
 * Film Production Management Service
 * ----------------------------------
 * The on-set execution layer for the Film discipline in Artist Manager.
 *
 * One shared data model — production → members → scenes → call sheets → briefs
 * → tasks → craft services — so nothing is re-keyed and versions never drift.
 * Backed by Firestore for multi-user sync (offsite producers, crew daily briefs),
 * with a rich demo seed so the suite is gorgeous the moment it opens.
 *
 * Firestore layout:
 *   productions/{prodId}
 *   productions/{prodId}/members/{memberId}
 *   productions/{prodId}/scenes/{sceneId}
 *   productions/{prodId}/callsheets/{callSheetId}
 *   productions/{prodId}/tasks/{taskId}
 *   productions/{prodId}/craftMenu/{itemId}
 *   productions/{prodId}/craftOrders/{orderId}
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp, runTransaction, writeBatch,
} from 'firebase/firestore';
import { db, auth } from './backendService';
import type { ScriptData, ScriptElement, RevisionColor } from '../types';
import {
  makeScriptDraft, projectScriptScenes, reconcileSceneProjection,
  nextRevisionColor, diffDraftScenes, draftScriptBlocks,
  type ScriptDraft, type WorkflowEvent,
} from './productionGraph';

// ─── Departments — the atom that drives per-role briefs ──────────────────────

export type DeptKey =
  | 'PRODUCTION' | 'DIRECTION' | 'CAMERA' | 'GRIP_ELECTRIC' | 'SOUND'
  | 'ART' | 'WARDROBE' | 'HAIR_MAKEUP' | 'LOCATIONS' | 'TRANSPORT'
  | 'STUNTS_SFX' | 'SCRIPT' | 'CRAFT_CATERING' | 'CAST' | 'POST' | 'OTHER';

export interface DeptMeta {
  key: DeptKey;
  label: string;
  emoji: string;
  color: string;
  /** Default call offset in minutes relative to the general crew call (negative = earlier). */
  callOffset: number;
  /** Default walkie channel. */
  channel: number;
  /** What this department actually needs on a shoot day — drives the brief checklist. */
  focus: string[];
}

export const DEPARTMENTS: DeptMeta[] = [
  { key: 'PRODUCTION',    label: 'Production / AD',   emoji: '🎬', color: '#a855f7', callOffset: 0,   channel: 1, focus: ['Full call sheet & schedule', 'Cast statuses & movement', 'Safety paperwork & insurance', 'Daily Production Report'] },
  { key: 'DIRECTION',     label: 'Direction',         emoji: '🎥', color: '#a855f7', callOffset: 0,   channel: 1, focus: ['Shot list & coverage plan', 'Scene order & priorities', 'Performance notes'] },
  { key: 'CAMERA',        label: 'Camera',            emoji: '📷', color: '#38bdf8', callOffset: -30, channel: 2, focus: ['Shot list & lens plan', 'Format / frame-rate notes', 'Day/Night lighting intent', 'Camera reports & media offload'] },
  { key: 'GRIP_ELECTRIC', label: 'Grip & Electric',   emoji: '💡', color: '#f59e0b', callOffset: -60, channel: 3, focus: ['Lighting & rigging plan per setup', 'Power distribution', 'Company-move rig list'] },
  { key: 'SOUND',         label: 'Sound',             emoji: '🎙️', color: '#22c55e', callOffset: 0,   channel: 4, focus: ['Dialogue scenes & wireless plan', 'Quiet-set timing', 'Sound report'] },
  { key: 'ART',           label: 'Art & Design',      emoji: '🖼️', color: '#ec4899', callOffset: -60, channel: 5, focus: ['Set dressing schedule', 'Props list per scene', 'Continuity & resets'] },
  { key: 'WARDROBE',      label: 'Wardrobe',          emoji: '🧵', color: '#f472b6', callOffset: -45, channel: 6, focus: ['Characters & changes shooting today', 'Continuity notes', 'On-set standby'] },
  { key: 'HAIR_MAKEUP',   label: 'Hair & Makeup',     emoji: '💄', color: '#fb7185', callOffset: -90, channel: 6, focus: ['Cast makeup call order', 'Look continuity', 'Touch-up standby'] },
  { key: 'LOCATIONS',     label: 'Locations',         emoji: '📍', color: '#ef4444', callOffset: -30, channel: 7, focus: ['Address, parking & basecamp', 'Permits & neighbor constraints', 'Company moves'] },
  { key: 'TRANSPORT',     label: 'Transportation',    emoji: '🚐', color: '#eab308', callOffset: -60, channel: 8, focus: ['Cast & crew pickups', 'Basecamp / crew park', 'Equipment & move logistics'] },
  { key: 'STUNTS_SFX',    label: 'Stunts / SFX',      emoji: '💥', color: '#f97316', callOffset: -30, channel: 3, focus: ['Scene safety plan & rehearsal', 'Armorer / SFX prep', 'Medic coordination'] },
  { key: 'SCRIPT',        label: 'Script / Continuity', emoji: '📝', color: '#8b5cf6', callOffset: 0, channel: 1, focus: ['Scene order & page counts', 'Take notes & continuity', 'Feeds the DPR'] },
  { key: 'CRAFT_CATERING',label: 'Craft & Catering',  emoji: '🍽️', color: '#14b8a6', callOffset: -90, channel: 9, focus: ['Called headcount today', 'Meal times & dietary manifest', 'Crafty restocks'] },
  { key: 'CAST',          label: 'Cast / Talent',     emoji: '⭐', color: '#facc15', callOffset: -60, channel: 6, focus: ['Your pickup / MU / wardrobe / set calls', 'Your scenes & sides', 'Transport & basecamp'] },
  { key: 'POST',          label: 'Post-Production',   emoji: '✂️', color: '#64748b', callOffset: 0,   channel: 1, focus: ['Daily media & reports', 'Editorial notes'] },
  { key: 'OTHER',         label: 'Other',             emoji: '🎯', color: '#94a3b8', callOffset: 0,   channel: 1, focus: ['Call sheet & schedule'] },
];

export const deptMeta = (k: DeptKey): DeptMeta => DEPARTMENTS.find(d => d.key === k) || DEPARTMENTS[DEPARTMENTS.length - 1];

// ─── Model ───────────────────────────────────────────────────────────────────

export type MemberStatus = 'ACTIVE' | 'PENDING' | 'ON_HOLD' | 'WRAPPED';

export type ProductionPermission =
  | 'MANAGE_ROSTER' | 'MANAGE_HIRING' | 'EDIT_SCRIPT_BREAKDOWN' | 'MANAGE_SCHEDULE'
  | 'MANAGE_CALL_SHEETS' | 'MANAGE_TASKS' | 'MANAGE_CRAFT'
  | 'MANAGE_REPORTS' | 'MANAGE_BUDGET' | 'MANAGE_LOCATIONS'
  | 'MANAGE_POST' | 'VIEW_SENSITIVE_CONTACTS' | 'MANAGE_DEPARTMENT_BREAKDOWN';

export type ProductionRoleKey =
  | 'EXECUTIVE_PRODUCER' | 'PRODUCER' | 'DIRECTOR' | 'FIRST_AD'
  | 'SCRIPT_SUPERVISOR' | 'DEPARTMENT_HEAD' | 'CREW' | 'CAST' | 'VIEWER';

export interface ProductionAuthority {
  roleKey: ProductionRoleKey;
  position: string;
  department?: DeptKey;
  permissions: ProductionPermission[];
  assignedBy: string;
  assignedAt: number;
}

export const ALL_PRODUCTION_PERMISSIONS: ProductionPermission[] = [
  'MANAGE_ROSTER', 'MANAGE_HIRING', 'EDIT_SCRIPT_BREAKDOWN', 'MANAGE_SCHEDULE',
  'MANAGE_CALL_SHEETS', 'MANAGE_TASKS', 'MANAGE_CRAFT',
  'MANAGE_REPORTS', 'MANAGE_BUDGET', 'MANAGE_LOCATIONS',
  'MANAGE_POST', 'VIEW_SENSITIVE_CONTACTS', 'MANAGE_DEPARTMENT_BREAKDOWN',
];

export const PRODUCTION_ROLE_TEMPLATES: Array<{
  key: ProductionRoleKey; label: string; description: string; permissions: ProductionPermission[];
}> = [
  { key: 'EXECUTIVE_PRODUCER', label: 'Executive Producer', description: 'Full operational authority except ownership transfer.', permissions: [...ALL_PRODUCTION_PERMISSIONS] },
  { key: 'PRODUCER', label: 'Producer', description: 'Runs people, hiring, schedule, budget, locations, call sheets, tasks, and reports.', permissions: ['MANAGE_ROSTER', 'MANAGE_HIRING', 'MANAGE_SCHEDULE', 'MANAGE_CALL_SHEETS', 'MANAGE_TASKS', 'MANAGE_REPORTS', 'MANAGE_BUDGET', 'MANAGE_LOCATIONS', 'VIEW_SENSITIVE_CONTACTS'] },
  { key: 'DIRECTOR', label: 'Director', description: 'Controls creative breakdown, schedule input, reports, and post handoff.', permissions: ['EDIT_SCRIPT_BREAKDOWN', 'MANAGE_SCHEDULE', 'MANAGE_TASKS', 'MANAGE_REPORTS', 'MANAGE_POST'] },
  { key: 'FIRST_AD', label: '1st Assistant Director', description: 'Controls crew staffing, breakdown, schedule, call sheets, tasks, and daily reports.', permissions: ['MANAGE_HIRING', 'EDIT_SCRIPT_BREAKDOWN', 'MANAGE_SCHEDULE', 'MANAGE_CALL_SHEETS', 'MANAGE_TASKS', 'MANAGE_REPORTS', 'VIEW_SENSITIVE_CONTACTS'] },
  { key: 'SCRIPT_SUPERVISOR', label: 'Script Supervisor', description: 'Maintains breakdown, continuity, sides, and production reports.', permissions: ['EDIT_SCRIPT_BREAKDOWN', 'MANAGE_REPORTS'] },
  { key: 'DEPARTMENT_HEAD', label: 'Department Head', description: 'Runs department breakdown, tasks, and reports without changing production-wide authority.', permissions: ['MANAGE_DEPARTMENT_BREAKDOWN', 'MANAGE_TASKS', 'MANAGE_REPORTS'] },
  { key: 'CREW', label: 'Crew', description: 'Receives briefs and completes assigned work.', permissions: [] },
  { key: 'CAST', label: 'Cast', description: 'Receives personal calls, sides, and approved production information.', permissions: [] },
  { key: 'VIEWER', label: 'Viewer / Offsite Producer', description: 'Read-only production access.', permissions: [] },
];

export function permissionsForRole(roleKey: ProductionRoleKey): ProductionPermission[] {
  return [...(PRODUCTION_ROLE_TEMPLATES.find(r => r.key === roleKey)?.permissions || [])];
}

export function hasProductionPermission(
  prod: Pick<Production, 'ownerUid' | 'authority'> | null | undefined,
  uid: string | null | undefined,
  permission: ProductionPermission,
): boolean {
  if (!prod || !uid) return false;
  return prod.ownerUid === uid || !!prod.authority?.[uid]?.permissions?.includes(permission);
}

export interface ProductionMember {
  id: string;
  uid?: string;              // linked Plajah account → unlocks their personal brief + confirmations
  name: string;
  role: string;              // job title, e.g. "1st AC", "Gaffer", "Maya (Lead)"
  dept: DeptKey;
  email?: string;
  phone?: string;
  isCast?: boolean;
  character?: string;        // for cast
  dietary?: string[];        // persistent, travels with the person
  dietaryNotes?: string;
  rate?: string;
  notes?: string;
  status: MemberStatus;
  roleKey?: ProductionRoleKey;
  createdAt: number;
}

export interface ProductionScene {
  id: string;
  sceneNum: string;
  intExt: 'INT' | 'EXT' | 'INT/EXT';
  dayNight: 'DAY' | 'NIGHT' | 'DUSK' | 'DAWN' | 'CONTINUOUS';
  set: string;
  synopsis: string;
  characters: string[];      // character names appearing
  pages: number;             // eighths as decimal (e.g. 1.5 = 1 4/8)
  shootDay: number;
  status: 'NOT_SHOT' | 'SHOT' | 'PARTIAL' | 'OMIT';
  notes?: string;
  locationId?: string;
  sourceScriptId?: string;
  sourceDraftId?: string;
  sourceElementId?: string;
  heading?: string;
  order?: number;
  projectionVersion?: number;
  // Revision marks (stamped by reconcileSceneProjection on a colored revision).
  revisionColor?: import('../types').RevisionColor;
  changedInRevision?: string;
  isNewInRevision?: boolean;
}

export interface ProductionBudgetLine {
  id: string; department: string; lineItem: string;
  estimated: number; actual: number; notes: string; createdAt: number; updatedAt?: number;
  // Accounting maturity (all optional / backward-compatible).
  accountCode?: string;   // e.g. "2100" camera dept account
  category?: 'ATL' | 'BTL' | 'POST' | 'OTHER'; // above/below-the-line / post
  fringePct?: number;     // payroll fringes as a % of the estimate
  committed?: number;     // legacy manual commitment; live commitment is summed from POs
}

// ─── Production accounting — POs, petty cash, timecards, cost report ──────────
// Closes the "accounting cliff": a producer can budget but must also RUN the money —
// commit it (purchase orders), spend it in the field (petty cash), and pay labor
// (timecards, auto-seeded from the DPR's actual call/wrap times). The cost report
// rolls Estimated vs Committed (POs) vs Actual (line actuals + petty + labor).

export type POStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'VOID';
export interface PurchaseOrder {
  id: string; poNumber: string; vendor: string; department: string;
  budgetLineId?: string; amount: number; status: POStatus; date: string;
  docUrl?: string; docAssetId?: string; notes?: string; createdAt: number; updatedAt?: number;
}

export interface PettyCashEntry {
  id: string; date: string; department: string;
  spentByMemberId?: string; spentByName?: string; amount: number; category: string;
  budgetLineId?: string; receiptUrl?: string; receiptAssetId?: string;
  reconciled: boolean; notes?: string; createdAt: number; updatedAt?: number;
}

export interface Timecard {
  id: string; memberId: string; memberName: string; department: string;
  shootDay: number; date: string; callTime?: string; wrapTime?: string;
  mealOut?: string; mealIn?: string; hoursStraight: number; hoursOT: number;
  ratePreview?: number; notes?: string; source?: 'DPR' | 'MANUAL'; createdAt: number; updatedAt?: number;
}

export interface CostReportRow {
  department: string; estimated: number; fringe: number; committed: number; actual: number; variance: number;
}

/** Pure roll-up: Estimated (+fringe) vs Committed (POs) vs Actual (line actuals + petty + labor). */
export function buildCostReport(
  lines: ProductionBudgetLine[], pos: PurchaseOrder[], petty: PettyCashEntry[], timecards: Timecard[],
): { rows: CostReportRow[]; totals: CostReportRow } {
  const depts = [...new Set([
    ...lines.map(l => l.department), ...pos.map(p => p.department),
    ...petty.map(p => p.department), ...timecards.map(t => t.department),
  ].filter(Boolean))].sort();
  const rows: CostReportRow[] = depts.map(dept => {
    const dl = lines.filter(l => l.department === dept);
    const estimated = dl.reduce((s, l) => s + (l.estimated || 0), 0);
    const fringe = dl.reduce((s, l) => s + (l.estimated || 0) * ((l.fringePct || 0) / 100), 0);
    const committed = pos.filter(p => p.department === dept && p.status !== 'VOID').reduce((s, p) => s + (p.amount || 0), 0);
    const lineActual = dl.reduce((s, l) => s + (l.actual || 0), 0);
    const pettyActual = petty.filter(p => p.department === dept).reduce((s, p) => s + (p.amount || 0), 0);
    const laborActual = timecards.filter(t => t.department === dept).reduce((s, t) => s + (t.ratePreview || 0), 0);
    const actual = lineActual + pettyActual + laborActual;
    return { department: dept, estimated, fringe, committed, actual, variance: estimated + fringe - actual };
  });
  const sum = (key: keyof Omit<CostReportRow, 'department'>) => rows.reduce((total, row) => total + row[key], 0);
  return { rows, totals: { department: 'TOTAL', estimated: sum('estimated'), fringe: sum('fringe'), committed: sum('committed'), actual: sum('actual'), variance: sum('variance') } };
}

/** Worked hours from actual call/wrap (minus meal), split at the 12-hour OT threshold. */
export function computeWorkHours(call?: string, wrap?: string, mealOut?: string, mealIn?: string): { straight: number; ot: number } {
  if (!call || !wrap) return { straight: 0, ot: 0 };
  const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  let total = toM(wrap) - toM(call);
  if (total < 0) total += 1440; // wrapped past midnight
  const meal = (mealOut && mealIn) ? Math.max(0, toM(mealIn) - toM(mealOut)) : 0;
  const worked = Math.max(0, total - meal) / 60;
  const straight = Math.min(worked, 12);
  return { straight: Math.round(straight * 10) / 10, ot: Math.round(Math.max(0, worked - 12) * 10) / 10 };
}

function estimateLaborCost(member: ProductionMember, straight: number, ot: number): number | undefined {
  const numeric = parseFloat((member.rate || '').replace(/[^0-9.]/g, ''));
  if (!numeric || Number.isNaN(numeric)) return undefined;
  if (/hr|hour/i.test(member.rate || '')) return Math.round(numeric * (straight + ot * 1.5));
  return Math.round(numeric); // treat as a flat day rate
}

/** Auto-seed a timecard per active crew member from a DPR's actual times. IDs are stable per (day, member) so re-seeding merges. */
export function timecardsFromDpr(dpr: DailyProductionReport, members: ProductionMember[]): Timecard[] {
  const { straight, ot } = computeWorkHours(dpr.crewCallActual || dpr.crewCallSched, dpr.wrapActual || dpr.wrapSched, dpr.lunchOut, dpr.lunchIn);
  return members.filter(m => m.status === 'ACTIVE').map(m => ({
    id: `tc_${dpr.shootDay}_${m.id}`, memberId: m.id, memberName: m.name, department: deptMeta(m.dept).label,
    shootDay: dpr.shootDay, date: dpr.date || '', callTime: dpr.crewCallActual || dpr.crewCallSched, wrapTime: dpr.wrapActual || dpr.wrapSched,
    mealOut: dpr.lunchOut, mealIn: dpr.lunchIn, hoursStraight: straight, hoursOT: ot,
    ratePreview: estimateLaborCost(m, straight, ot), source: 'DPR', createdAt: Date.now(),
  }));
}

export interface ProductionLocation {
  id: string; name: string; type: 'INT' | 'EXT' | 'BOTH';
  address: string; city: string; contactName: string; contactPhone: string;
  permitStatus: 'SCOUTED' | 'PENDING' | 'APPROVED' | 'DENIED' | 'WRAPPED';
  rentalFee: number; notes: string; createdAt: number; updatedAt?: number;
}

export interface ProductionFestival {
  id: string; festival: string; tier: 'A' | 'B' | 'C' | 'D'; deadline: number; fee: number;
  status: 'PLANNING' | 'SUBMITTED' | 'OFFICIAL_SELECTION' | 'REJECTED' | 'WINNER' | 'WITHDRAWN';
  category: string; notes: string; createdAt: number; updatedAt?: number;
}

// ─── Clearances / releases / chain-of-title — the legal gate on delivery ──────
// A production cannot lawfully distribute without these. Each clearance links to
// the entity it clears (a cast member's release, a location's permit, a scene's
// minor/intimacy clearance, a music/clip licence) so the schedule engine can flag
// shooting a scene whose clearances aren't in hand. Documents are stored PRIVATELY
// in Content HQ (protected-hq/, virus-scanned, streamed via an authed endpoint) —
// releases and COIs carry signatures and PII — so `docUrl` is an authed URL and
// `docAssetId` is the orgAssets id, never a public Storage URL.

export type ClearanceType =
  | 'TALENT_RELEASE' | 'LOCATION_RELEASE' | 'MINOR' | 'MUSIC_SYNC' | 'CLIP'
  | 'INSURANCE_COI' | 'PERMIT' | 'CHAIN_OF_TITLE' | 'OTHER';
export type ClearanceStatus = 'NEEDED' | 'REQUESTED' | 'RECEIVED' | 'APPROVED' | 'EXPIRED' | 'NA';

/** A clearance is "in hand" (won't block scheduling/delivery) only when APPROVED, RECEIVED, or N/A. */
export const CLEARED_STATUSES: ClearanceStatus[] = ['APPROVED', 'RECEIVED', 'NA'];
export const isClearanceCleared = (c: Pick<ProductionClearance, 'status'>) => CLEARED_STATUSES.includes(c.status);

export interface ProductionClearance {
  id: string;
  type: ClearanceType;
  title: string;
  status: ClearanceStatus;
  // What this clearance covers (any subset). Drives the schedule conflict engine.
  memberId?: string;
  locationId?: string;
  sceneId?: string;
  elementId?: string;
  // Private document held in Content HQ (authed download URL + orgAssets id).
  docUrl?: string;
  docAssetId?: string;
  docName?: string;
  expiresAt?: number;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CallSheetDeptCall { dept: DeptKey; callTime: string; note?: string; }
export interface CallSheetCastRow {
  memberId?: string; character: string; actor?: string;
  pickup?: string; makeup?: string; wardrobe?: string; onSet?: string; status?: string; note?: string;
}
export interface CallSheetSceneRow {
  sceneId?: string; sceneNum: string; intExt: string; dayNight: string; set: string; synopsis: string; pages: number; characters: string[];
}

/** A user's enrollment/employment relationship to one production. */
export interface ProductionMembership extends ProductionMember {
  productionId?: string;
  joinedVia?: 'OWNER' | 'INVITE' | 'HIRING' | 'MANUAL';
  joinedAt?: number;
}
export interface MealBlock { label: string; time: string; note?: string; }
export interface Weather { summary: string; high?: number; low?: number; precip?: number; sunrise?: string; sunset?: string; }

export interface CallSheet {
  id: string;
  prodId: string;
  shootDay: number;
  dayOf: number;
  totalDays: number;
  date: string;                 // ISO yyyy-mm-dd
  generalCall: string;          // "07:00"
  shootingCall?: string;
  estWrap?: string;
  locationName: string;
  locationAddress?: string;
  mapUrl?: string;
  parkingNote?: string;
  basecampNote?: string;
  nearestHospital?: string;
  hospitalAddress?: string;
  safetyNotes?: string;
  weather?: Weather;
  walkie?: Record<string, number>;
  deptCalls: CallSheetDeptCall[];
  castRows: CallSheetCastRow[];
  sceneRows: CallSheetSceneRow[];
  meals: MealBlock[];
  notes?: string;
  advanceNote?: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt?: number;
  changeLog?: { at: number; summary: string }[];
  confirmations?: Record<string, number>;   // memberId → confirmedAt ms
  schedulePlanId?: string;
  scheduleVersion?: number;
  scheduleDayId?: string;
  createdAt: number;
  updatedAt: number;
}

export type TaskPriority = 'LOW' | 'MED' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'DOING' | 'DONE';
export interface ProdTask {
  id: string;
  title: string;
  dept?: DeptKey;
  assigneeMemberId?: string;
  assigneeName?: string;
  shootDay?: number;
  due?: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
}

export type CraftCategory = 'MEAL' | 'SNACK' | 'DRINK' | 'COFFEE' | 'SPECIAL';
export interface CraftItem {
  id: string;
  name: string;
  category: CraftCategory;
  desc?: string;
  dietaryTags?: string[];
  available: boolean;
  createdAt: number;
}

export type OrderStatus = 'REQUESTED' | 'PREPPING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export interface CraftOrder {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  forMemberId?: string;
  requestedByUid?: string;
  requestedByName: string;
  dept?: DeptKey;
  note?: string;
  dietary?: string[];
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Production {
  id: string;
  ownerUid: string;
  title: string;
  format?: string;             // "Feature" | "Short" | "Series" | "Commercial"
  memberUids: string[];        // denormalized for rules + "productions I'm in" queries
  authority?: Record<string, ProductionAuthority>; // uid -> server-enforced role and scopes
  totalDays: number;
  productionOffice?: string;
  emergencyContact?: string;
  timezone?: string;
  lat?: number;
  lng?: number;
  linkedScriptId?: string;
  currentDraftId?: string;
  approvedScheduleId?: string;
  approvedScheduleVersion?: number;
  status?: 'ACTIVE' | 'ARCHIVED';
  sampleAppliedAt?: number;
  legacyImportedAt?: number;
  chatProvisionedAt?: number;
  chatChannelKeys?: string[];
  isShowcase?: boolean;
  templateKey?: string;
  templateVersion?: number;
  copiedFromTemplateKey?: string;
  copiedAt?: number;
  showcaseSeeding?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Takes — the link between a shot proxy and a script scene (Set-to-Cut) ────
// Nothing else ties footage to a scene. A take is one recorded attempt of a
// scene, carrying its proxy (for editing), the director's circle/rating, and —
// later — a transcript + match score. These auto-assemble into a Fabula project
// (see services/filmEditBridge.ts): a bin per scene, the circled/best take per
// scene laid as a living rough cut.

export type TakeStatus = 'GOOD' | 'NG' | 'HOLD' | 'SELECT';
export interface ProductionTake {
  id: string;
  sceneId: string;
  sceneNum: string;
  takeNumber: number;
  cameraId?: string;
  proxyUrl?: string;        // playable proxy (Storage URL) — for editing
  proxyAssetId?: string;    // OPFS studio:blob id (live-stream tier)
  duration?: number;        // seconds
  circled?: boolean;        // the director's circle-take
  rating?: number;          // 1–5
  status: TakeStatus;
  note?: string;
  transcript?: Array<{ time: number; speaker?: string; text: string }>; // P2 (analyzeClipForScript)
  matchScore?: number;      // P2 — transcript vs scripted dialogue
  byMemberId?: string;
  byName?: string;
  createdAt: number;
  updatedAt?: number;
}

// Continuity Eye P1 — a saved still-vs-still continuity comparison for a scene.
// Stores the numeric verdict only (thumbs stay in-session); advisory to the Script Supervisor.
export interface ContinuityCheck {
  id: string;
  sceneId: string;
  sceneNum: string;
  label?: string;            // e.g. "Take 5 reset"
  score: number;             // 0–100 overall
  propsScore: number;
  lightingScore: number;
  lumaDelta: number;         // signed mean-luminance change
  colorTempNote: string;     // "+430K warmer" etc.
  flagCount: number;
  note?: string;
  byMemberId?: string;
  byName?: string;
  createdAt: number;
}

// ─── Time helpers ────────────────────────────────────────────────────────────

export function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60), nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function fmtCall(hhmm?: string): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function pagesToEighths(pages: number): string {
  const whole = Math.floor(pages);
  const eighths = Math.round((pages - whole) * 8);
  if (whole === 0 && eighths === 0) return '0';
  if (whole === 0) return `${eighths}/8`;
  if (eighths === 0) return `${whole}`;
  return `${whole} ${eighths}/8`;
}

// ─── Solar sunrise/sunset (NOAA approximation) ───────────────────────────────
// Real, offline, no API key. Used when the production has lat/lng.

export function computeSunTimes(lat: number, lng: number, dateISO: string, tzOffsetMin: number): { sunrise: string; sunset: string } | null {
  try {
    const date = new Date(dateISO + 'T12:00:00Z');
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
    const rad = Math.PI / 180;
    const declination = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
    const latRad = lat * rad, decRad = declination * rad;
    const cosH = -Math.tan(latRad) * Math.tan(decRad);
    if (cosH > 1 || cosH < -1) return null; // polar day/night
    const H = Math.acos(cosH) / rad;         // half-day arc in degrees
    const solarNoonMin = 720 - 4 * lng - equationOfTime(dayOfYear) + tzOffsetMin;
    const sunriseMin = solarNoonMin - 4 * H;
    const sunsetMin = solarNoonMin + 4 * H;
    const toHHMM = (min: number) => {
      let t = ((Math.round(min) % 1440) + 1440) % 1440;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };
    return { sunrise: toHHMM(sunriseMin), sunset: toHHMM(sunsetMin) };
  } catch { return null; }
}

function equationOfTime(dayOfYear: number): number {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

// ─── Call sheet auto-generation — the core wedge ─────────────────────────────

export interface GenerateOpts {
  date?: string;
  generalCall?: string;
  locationName?: string;
  locationAddress?: string;
}

export function generateCallSheet(
  prod: Production,
  scenes: ProductionScene[],
  members: ProductionMember[],
  shootDay: number,
  opts: GenerateOpts = {},
): CallSheet {
  const dayScenes = scenes.filter(s => s.shootDay === shootDay && s.status !== 'OMIT');
  const generalCall = opts.generalCall || '07:00';
  const shootingCall = addMinutes(generalCall, 30);

  // Departments present on this production → personalized call times.
  const presentDepts = [...new Set(members.filter(m => m.dept !== 'CAST' && m.status === 'ACTIVE').map(m => m.dept))];
  const deptCalls: CallSheetDeptCall[] = presentDepts
    .map(dept => ({ dept, callTime: addMinutes(generalCall, deptMeta(dept).callOffset) }))
    .sort((a, b) => a.callTime.localeCompare(b.callTime));

  // Cast needed today (characters appearing in today's scenes) with staggered calls.
  const charsToday = new Set(dayScenes.flatMap(s => s.characters.map(c => c.toUpperCase())));
  const castMembers = members.filter(m => (m.isCast || m.dept === 'CAST') && m.status === 'ACTIVE');
  const castRows: CallSheetCastRow[] = castMembers
    .filter(m => {
      const key = (m.character || m.role || m.name).toUpperCase();
      return charsToday.size === 0 || [...charsToday].some(c => key.includes(c) || c.includes(key.split(' ')[0]));
    })
    .map(m => ({
      memberId: m.id,
      character: m.character || m.role,
      actor: m.name,
      pickup: addMinutes(generalCall, -90),
      makeup: addMinutes(generalCall, -60),
      wardrobe: addMinutes(generalCall, -30),
      onSet: generalCall,
      status: 'SW',
    }));

  const walkie: Record<string, number> = {};
  presentDepts.forEach(d => { walkie[deptMeta(d).label] = deptMeta(d).channel; });

  const location = dayScenes[0]?.set || opts.locationName || 'TBD';
  const now = Date.now();

  let weather: Weather | undefined;
  if (opts.date && prod.lat != null && prod.lng != null) {
    const tzOff = -(new Date().getTimezoneOffset());
    const sun = computeSunTimes(prod.lat, prod.lng, opts.date, tzOff);
    if (sun) weather = { summary: 'Check forecast day-of', sunrise: sun.sunrise, sunset: sun.sunset };
  }

  return {
    id: `cs_${shootDay}_${now.toString(36)}`,
    prodId: prod.id,
    shootDay,
    dayOf: shootDay,
    totalDays: prod.totalDays || Math.max(shootDay, ...scenes.map(s => s.shootDay), 1),
    date: opts.date || '',
    generalCall,
    shootingCall,
    estWrap: addMinutes(generalCall, 12 * 60),
    locationName: opts.locationName || location,
    locationAddress: opts.locationAddress || '',
    weather,
    walkie,
    deptCalls,
    castRows,
    sceneRows: dayScenes.map(s => ({
      sceneId: s.id, sceneNum: s.sceneNum, intExt: s.intExt, dayNight: s.dayNight, set: s.set,
      synopsis: s.synopsis, pages: s.pages, characters: s.characters,
    })),
    meals: [
      { label: 'Breakfast', time: addMinutes(generalCall, -30), note: 'Hot breakfast at crew park' },
      { label: 'Lunch', time: addMinutes(generalCall, 6 * 60), note: '6 hrs from crew call — watch meal penalty' },
    ],
    notes: '',
    advanceNote: '',
    version: 1,
    status: 'DRAFT',
    changeLog: [{ at: now, summary: 'Auto-generated from schedule' }],
    confirmations: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Live view projection: a scene edit is visible everywhere without rewriting the call-sheet document. */
export function projectCallSheetScenes(callSheet: CallSheet, scenes: ProductionScene[]): CallSheet {
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const byNumber = new Map(scenes.map(scene => [scene.sceneNum, scene]));
  return {
    ...callSheet,
    sceneRows: callSheet.sceneRows.map(row => {
      const scene = (row.sceneId && byId.get(row.sceneId)) || byNumber.get(row.sceneNum);
      return scene ? {
        sceneId: scene.id, sceneNum: scene.sceneNum, intExt: scene.intExt,
        dayNight: scene.dayNight, set: scene.set, synopsis: scene.synopsis,
        pages: scene.pages, characters: scene.characters,
      } : row;
    }),
  };
}

// ─── Per-role daily brief derivation ─────────────────────────────────────────

export interface DailyBrief {
  member: ProductionMember;
  dept: DeptMeta;
  yourCall: string;
  callBreakdown?: { label: string; time: string }[]; // cast staggered calls
  location: string;
  locationAddress?: string;
  mapUrl?: string;
  weather?: Weather;
  scenes: CallSheetSceneRow[];
  focus: string[];
  channel: number;
  meals: MealBlock[];
  safetyNotes?: string;
  nearestHospital?: string;
  confirmed: boolean;
  callSheet: CallSheet;
}

export function buildDailyBrief(cs: CallSheet, member: ProductionMember): DailyBrief {
  const dm = deptMeta(member.dept);
  const isCast = member.isCast || member.dept === 'CAST';
  const castRow = cs.castRows.find(r => r.memberId === member.id);
  const deptCall = cs.deptCalls.find(d => d.dept === member.dept);

  let yourCall = cs.generalCall;
  let callBreakdown: { label: string; time: string }[] | undefined;
  if (isCast && castRow) {
    yourCall = castRow.pickup || castRow.onSet || cs.generalCall;
    callBreakdown = [
      castRow.pickup ? { label: 'Pickup', time: castRow.pickup } : null,
      castRow.makeup ? { label: 'Makeup', time: castRow.makeup } : null,
      castRow.wardrobe ? { label: 'Wardrobe', time: castRow.wardrobe } : null,
      castRow.onSet ? { label: 'On set', time: castRow.onSet } : null,
    ].filter(Boolean) as { label: string; time: string }[];
  } else if (deptCall) {
    yourCall = deptCall.callTime;
  }

  // Cast see only their scenes; crew see the full day.
  const scenes = isCast
    ? cs.sceneRows.filter(s => s.characters.some(c => (member.character || member.role || '').toUpperCase().includes(c.toUpperCase()) || c.toUpperCase().includes((member.character || member.role || '').toUpperCase())))
    : cs.sceneRows;

  const confirmed = !!(cs.confirmations && (cs.confirmations[member.id] || (member.uid && cs.confirmations[member.uid])));

  return {
    member, dept: dm, yourCall, callBreakdown,
    location: cs.locationName, locationAddress: cs.locationAddress, mapUrl: cs.mapUrl,
    weather: cs.weather,
    scenes: scenes.length ? scenes : cs.sceneRows,
    focus: dm.focus, channel: dm.channel,
    meals: cs.meals, safetyNotes: cs.safetyNotes, nearestHospital: cs.nearestHospital,
    confirmed, callSheet: cs,
  };
}

// ─── Daily Production Report (DPR) — the day's legal record ──────────────────

export type SceneShootStatus = 'COMPLETED' | 'PARTIAL' | 'NOT_SHOT' | 'OMITTED';
export type CastWorkCode = 'SW' | 'W' | 'WF' | 'SWF' | 'H' | 'T' | 'R';

export interface DprSceneRow {
  sceneNum: string; set: string; intExt: string; dayNight: string;
  status: SceneShootStatus; scheduledPages: number; pagesShot: number; setups: number; takes: number;
}
export interface DprCastRow { memberId?: string; character: string; actor?: string; work: CastWorkCode; }

export interface DailyProductionReport {
  id: string;
  prodId: string;
  callSheetId?: string;
  shootDay: number;
  date: string;
  // Actuals vs the call sheet's scheduled times
  crewCallSched?: string; crewCallActual?: string;
  firstShotActual?: string;
  lunchOut?: string; lunchIn?: string;
  secondMealOut?: string; secondMealIn?: string;
  wrapSched?: string; wrapActual?: string; cameraWrap?: string;
  sceneRows: DprSceneRow[];
  castRows: DprCastRow[];
  bgCount?: number;
  weather?: string;
  delays?: string;
  accidents?: string;
  generalNotes?: string;
  preparedBy?: string;
  status: 'DRAFT' | 'FINAL';
  finalizedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Build a DPR skeleton from a call sheet — scenes/cast/times prefilled, actuals blank. */
export function generateDPR(prod: Production, cs: CallSheet, preparedBy?: string): DailyProductionReport {
  const now = Date.now();
  return {
    id: `dpr_${cs.shootDay}_${now.toString(36)}`,
    prodId: prod.id,
    callSheetId: cs.id,
    shootDay: cs.shootDay,
    date: cs.date || '',
    crewCallSched: cs.generalCall,
    crewCallActual: '',
    wrapSched: cs.estWrap,
    sceneRows: cs.sceneRows.map(s => ({
      sceneNum: s.sceneNum, set: s.set, intExt: s.intExt, dayNight: s.dayNight,
      status: 'NOT_SHOT' as SceneShootStatus, scheduledPages: s.pages, pagesShot: 0, setups: 0, takes: 0,
    })),
    castRows: cs.castRows.map(r => ({ memberId: r.memberId, character: r.character, actor: r.actor, work: 'SW' as CastWorkCode })),
    bgCount: 0,
    weather: cs.weather?.summary || '',
    status: 'DRAFT',
    preparedBy,
    createdAt: now,
    updatedAt: now,
  };
}

export interface DprTotals { scenesShot: number; scenesScheduled: number; pagesShot: number; pagesScheduled: number; setups: number; }
export function dprDayTotals(d: DailyProductionReport): DprTotals {
  return {
    scenesScheduled: d.sceneRows.length,
    scenesShot: d.sceneRows.filter(s => s.status === 'COMPLETED').length,
    pagesScheduled: d.sceneRows.reduce((s, r) => s + r.scheduledPages, 0),
    pagesShot: d.sceneRows.reduce((s, r) => s + r.pagesShot, 0),
    setups: d.sceneRows.reduce((s, r) => s + r.setups, 0),
  };
}

// ─── Sides — the pocket pages of the day's scenes ────────────────────────────

export interface SidePage {
  sceneNum: string;
  slug: string;
  dayNight: string;
  pages: number;
  characters: string[];
  body: string;
}

/**
 * Build printable sides from a call sheet. If a linked screenplay's scene
 * blocks are supplied (heading + full text), each side is enriched with the
 * real page text matched by set-name; otherwise the scene synopsis is used.
 */
export function buildSides(cs: CallSheet, scriptBlocks?: { heading: string; text: string }[]): SidePage[] {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  return cs.sceneRows.map(s => {
    let body = s.synopsis;
    if (scriptBlocks && scriptBlocks.length) {
      const setKey = norm(s.set);
      const firstWord = setKey.split(' ')[0];
      const match =
        scriptBlocks.find(b => firstWord && norm(b.heading).includes(firstWord) && norm(b.heading).includes(s.dayNight)) ||
        scriptBlocks.find(b => setKey && norm(b.heading).includes(setKey.slice(0, 8)));
      if (match && match.text.trim()) body = match.text.trim();
    }
    return {
      sceneNum: s.sceneNum,
      slug: `${s.intExt}. ${s.set} — ${s.dayNight}`,
      dayNight: s.dayNight,
      pages: s.pages,
      characters: s.characters,
      body,
    };
  });
}

// ─── Firestore I/O ───────────────────────────────────────────────────────────

const stripUndefined = <T extends object>(o: T): T =>
  JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? undefined : v)));

const prodRef = (prodId: string) => doc(db, 'productions', prodId);
const sub = (prodId: string, name: string) => collection(db, 'productions', prodId, name);

/** The signed-in user's default production id. One primary production per user for v1. */
export function defaultProductionId(uid: string) { return `film_${uid}`; }

export async function createProduction(uid: string, title = 'Untitled Production', format = 'Feature'): Promise<Production> {
  if (!uid) throw new Error('Sign in to create a production.');
  const now = Date.now();
  const id = `prod_${uid8()}`;
  const prod: Production = {
    id, ownerUid: uid, title: title.trim() || 'Untitled Production', format,
    memberUids: [uid], totalDays: 1, status: 'ACTIVE',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    createdAt: now, updatedAt: now,
  };
  await setDoc(prodRef(id), stripUndefined(prod));
  await putMember(id, {
    id: uid, uid, name: auth.currentUser?.displayName || 'Production Owner',
    role: 'Executive Producer', dept: 'PRODUCTION', status: 'ACTIVE',
    roleKey: 'EXECUTIVE_PRODUCER', createdAt: now,
  });
  return prod;
}

export async function fetchProduction(prodId: string): Promise<Production | null> {
  try {
    const snap = await getDoc(prodRef(prodId));
    return snap.exists() ? (snap.data() as Production) : null;
  } catch { return null; }
}

export async function ensureProduction(uid: string, title = 'Untitled Production'): Promise<Production> {
  const id = defaultProductionId(uid);
  const existing = await fetchProduction(id);
  if (existing) return existing;
  const now = Date.now();
  const prod: Production = {
    id, ownerUid: uid, title, format: 'Feature', memberUids: [uid],
    totalDays: 7, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, createdAt: now, updatedAt: now,
  };
  try { await setDoc(prodRef(id), stripUndefined(prod)); } catch { /* offline: return in-memory */ }
  return prod;
}

export async function updateProduction(prodId: string, patch: Partial<Production>) {
  try { await updateDoc(prodRef(prodId), stripUndefined({ ...patch, updatedAt: Date.now() })); } catch {}
}

/** Owner-only authority assignment. The parent production map is the rules source of truth. */
export async function assignProductionAuthority(
  prodId: string,
  member: ProductionMember,
  roleKey: ProductionRoleKey,
  permissions: ProductionPermission[] = permissionsForRole(roleKey),
): Promise<void> {
  if (!member.uid) throw new Error('A linked Plajah user ID is required before authority can be assigned.');
  const memberUid = member.uid;
  const actorUid = currentUid();
  if (!actorUid) throw new Error('Sign in to assign production authority.');
  const cleanPermissions = [...new Set(permissions)].filter(p => ALL_PRODUCTION_PERMISSIONS.includes(p));
  await runTransaction(db, async tx => {
    const pRef = prodRef(prodId);
    const snap = await tx.get(pRef);
    if (!snap.exists()) throw new Error('Production not found.');
    const production = snap.data() as Production;
    if (production.ownerUid !== actorUid) throw new Error('Only the production owner can assign authority.');
    const authority: Record<string, ProductionAuthority> = { ...(production.authority || {}) };
    authority[memberUid] = {
      roleKey, position: member.role, department: member.dept,
      permissions: cleanPermissions, assignedBy: actorUid, assignedAt: Date.now(),
    };
    tx.update(pRef, { authority, memberUids: [...new Set([...(production.memberUids || []), memberUid])], updatedAt: Date.now() });
    tx.set(doc(db, 'productions', prodId, 'members', member.id), stripUndefined({ ...member, roleKey }), { merge: true });
  });
}

export async function revokeProductionAuthority(prodId: string, member: ProductionMember): Promise<void> {
  if (!member.uid) return;
  const memberUid = member.uid;
  const actorUid = currentUid();
  if (!actorUid) throw new Error('Sign in to change production authority.');
  await runTransaction(db, async tx => {
    const pRef = prodRef(prodId);
    const snap = await tx.get(pRef);
    if (!snap.exists()) throw new Error('Production not found.');
    const production = snap.data() as Production;
    if (production.ownerUid !== actorUid) throw new Error('Only the production owner can revoke authority.');
    const authority = { ...(production.authority || {}) };
    delete authority[memberUid];
    tx.update(pRef, { authority, memberUids: (production.memberUids || []).filter(x => x !== memberUid), updatedAt: Date.now() });
    tx.update(doc(db, 'productions', prodId, 'members', member.id), { roleKey: 'VIEWER', updatedAt: Date.now() });
  });
}

/** Productions the user is a crew member on (besides their own). */
export async function fetchMyProductions(uid: string): Promise<Production[]> {
  try {
    const q = query(collection(db, 'productions'), where('memberUids', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Production)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch { return []; }
}

export async function archiveProduction(prodId: string): Promise<void> {
  await updateDoc(prodRef(prodId), { status: 'ARCHIVED', updatedAt: Date.now() });
}

export async function greenlightScriptToProduction(
  prodId: string,
  script: ScriptData,
  actorUid: string,
): Promise<{ draft: ScriptDraft; scenes: ProductionScene[] }> {
  if (!actorUid) throw new Error('Sign in to greenlight a script.');
  const production = await fetchProduction(prodId);
  if (!production) throw new Error('Production not found.');
  if (!hasProductionPermission(production, actorUid, 'EDIT_SCRIPT_BREAKDOWN')) {
    throw new Error('Your production role cannot greenlight or revise the script.');
  }
  const existingSnap = await getDocs(sub(prodId, 'scenes'));
  const existing = existingSnap.docs.map(d => d.data() as ProductionScene);
  const now = Date.now();
  const isRevision = !!production.currentDraftId;

  // Load the prior locked draft so we can advance the colour and mark what changed.
  let priorElements: ScriptElement[] = [];
  let priorLabel = 'WHITE';
  if (isRevision && production.currentDraftId) {
    const priorSnap = await getDoc(doc(db, 'productions', prodId, 'scriptDrafts', production.currentDraftId));
    if (priorSnap.exists()) {
      const priorDraft = priorSnap.data() as ScriptDraft;
      priorElements = priorDraft.elements || [];
      priorLabel = priorDraft.revisionLabel || 'WHITE';
    }
  }

  const draft = makeScriptDraft(prodId, script, actorUid, now);
  // First greenlight keeps the writer's colour (usually WHITE); each later revision advances the ladder.
  if (isRevision) draft.revisionLabel = nextRevisionColor(priorLabel);
  const revColor = isRevision ? (draft.revisionLabel as RevisionColor) : undefined;
  const changedIds = isRevision ? diffDraftScenes(priorElements, script.elements, script.id) : undefined;

  const projected = projectScriptScenes({ scriptId: script.id, draftId: draft.id, elements: script.elements });
  const scenes = reconcileSceneProjection(projected, existing, changedIds, revColor);
  const event: WorkflowEvent = {
    id: `evt_${uid8()}`, productionId: prodId,
    type: isRevision ? 'SCRIPT_REVISED' : 'SCRIPT_GREENLIT',
    actorUid, entityType: 'scriptDraft', entityId: draft.id,
    summary: `${draft.title} ${isRevision ? `${draft.revisionLabel} revision approved (${changedIds?.size || 0} scenes changed)` : 'greenlit for production'}`,
    data: { scriptId: script.id, sceneCount: scenes.length, revisionLabel: draft.revisionLabel, changedScenes: changedIds ? [...changedIds] : [] }, createdAt: now,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'productions', prodId, 'scriptDrafts', draft.id), stripUndefined(draft));
  scenes.forEach(scene => batch.set(doc(db, 'productions', prodId, 'scenes', scene.id), stripUndefined(scene), { merge: true }));
  batch.set(doc(db, 'productions', prodId, 'workflowEvents', event.id), stripUndefined(event));
  batch.update(prodRef(prodId), {
    linkedScriptId: script.id, currentDraftId: draft.id, updatedAt: now,
  });
  await batch.commit();
  return { draft, scenes };
}

// Generic subcollection helpers
function subscribe<T>(prodId: string, name: string, cb: (rows: T[]) => void): () => void {
  try {
    return onSnapshot(sub(prodId, name),
      s => cb(s.docs.map(d => d.data() as T)),
      e => { console.warn(`[filmProduction] ${name} sub failed:`, (e as Error)?.message?.slice(0, 160)); });
  } catch { return () => {}; }
}
async function put<T extends { id: string }>(prodId: string, name: string, row: T) {
  try { await setDoc(doc(db, 'productions', prodId, name, row.id), stripUndefined(row)); } catch {}
}
async function patch(prodId: string, name: string, id: string, p: object) {
  try { await updateDoc(doc(db, 'productions', prodId, name, id), stripUndefined({ ...p, updatedAt: Date.now() })); } catch {}
}
async function remove(prodId: string, name: string, id: string) {
  try { await deleteDoc(doc(db, 'productions', prodId, name, id)); } catch {}
}

// Members
export const subMembers = (p: string, cb: (r: ProductionMember[]) => void) => subscribe<ProductionMember>(p, 'members', cb);
export const putMember = (p: string, m: ProductionMember) => put(p, 'members', m);
export const patchMember = (p: string, id: string, x: Partial<ProductionMember>) => patch(p, 'members', id, x);
export const removeMember = (p: string, id: string) => remove(p, 'members', id);

// Scenes
export const subScenes = (p: string, cb: (r: ProductionScene[]) => void) => subscribe<ProductionScene>(p, 'scenes', cb);
export const putScene = (p: string, s: ProductionScene) => put(p, 'scenes', s);
export const patchScene = (p: string, id: string, x: Partial<ProductionScene>) => patch(p, 'scenes', id, x);
export const removeScene = (p: string, id: string) => remove(p, 'scenes', id);

// Script drafts (immutable colored-revision snapshots).
export async function fetchScriptDrafts(prodId: string): Promise<ScriptDraft[]> {
  try {
    const snap = await getDocs(sub(prodId, 'scriptDrafts'));
    return snap.docs.map(d => d.data() as ScriptDraft).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
}
/** Locked side blocks from a specific draft — sides read this instead of the live editable script. */
export async function fetchDraftBlocks(prodId: string, draftId: string): Promise<{ heading: string; text: string }[]> {
  try {
    const snap = await getDoc(doc(db, 'productions', prodId, 'scriptDrafts', draftId));
    return snap.exists() ? draftScriptBlocks((snap.data() as ScriptDraft).elements || []) : [];
  } catch { return []; }
}
/** Raw elements of a draft — for per-scene scripted-dialogue extraction (Set-to-Cut scoring). */
export async function fetchDraftElements(prodId: string, draftId: string): Promise<ScriptElement[]> {
  try {
    const snap = await getDoc(doc(db, 'productions', prodId, 'scriptDrafts', draftId));
    return snap.exists() ? ((snap.data() as ScriptDraft).elements || []) : [];
  } catch { return []; }
}

// Shared planning records used by Artist Manager and the on-set suite.
export const subBudgetLines = (p: string, cb: (r: ProductionBudgetLine[]) => void) => subscribe<ProductionBudgetLine>(p, 'budgetLines', cb);
export const putBudgetLine = (p: string, row: ProductionBudgetLine) => put(p, 'budgetLines', row);
export const removeBudgetLine = (p: string, id: string) => remove(p, 'budgetLines', id);
export const subLocations = (p: string, cb: (r: ProductionLocation[]) => void) => subscribe<ProductionLocation>(p, 'locations', cb);
export const putLocation = (p: string, row: ProductionLocation) => put(p, 'locations', row);
export const removeLocation = (p: string, id: string) => remove(p, 'locations', id);
export const subFestivals = (p: string, cb: (r: ProductionFestival[]) => void) => subscribe<ProductionFestival>(p, 'festivals', cb);
export const putFestival = (p: string, row: ProductionFestival) => put(p, 'festivals', row);
export const removeFestival = (p: string, id: string) => remove(p, 'festivals', id);
// Accounting — purchase orders, petty cash, timecards.
export const subPurchaseOrders = (p: string, cb: (r: PurchaseOrder[]) => void) => subscribe<PurchaseOrder>(p, 'purchaseOrders', cb);
export const putPurchaseOrder = (p: string, row: PurchaseOrder) => put(p, 'purchaseOrders', row);
export const patchPurchaseOrder = (p: string, id: string, x: Partial<PurchaseOrder>) => patch(p, 'purchaseOrders', id, x);
export const removePurchaseOrder = (p: string, id: string) => remove(p, 'purchaseOrders', id);
export const subPettyCash = (p: string, cb: (r: PettyCashEntry[]) => void) => subscribe<PettyCashEntry>(p, 'pettyCash', cb);
export const putPettyCash = (p: string, row: PettyCashEntry) => put(p, 'pettyCash', row);
export const patchPettyCash = (p: string, id: string, x: Partial<PettyCashEntry>) => patch(p, 'pettyCash', id, x);
export const removePettyCash = (p: string, id: string) => remove(p, 'pettyCash', id);
export const subTimecards = (p: string, cb: (r: Timecard[]) => void) => subscribe<Timecard>(p, 'timecards', cb);
export const putTimecard = (p: string, row: Timecard) => put(p, 'timecards', row);
export const patchTimecard = (p: string, id: string, x: Partial<Timecard>) => patch(p, 'timecards', id, x);
export const removeTimecard = (p: string, id: string) => remove(p, 'timecards', id);
/** Write a full day's auto-seeded timecards in one batch. */
export async function seedTimecardsFromDpr(prodId: string, dpr: DailyProductionReport, members: ProductionMember[]): Promise<number> {
  const cards = timecardsFromDpr(dpr, members);
  if (!cards.length) return 0;
  const batch = writeBatch(db);
  cards.forEach(card => batch.set(doc(db, 'productions', prodId, 'timecards', card.id), stripUndefined(card), { merge: true }));
  try { await batch.commit(); return cards.length; } catch { return 0; }
}

// Clearances / releases / chain-of-title.
export const subClearances = (p: string, cb: (r: ProductionClearance[]) => void) => subscribe<ProductionClearance>(p, 'clearances', cb);
export const patchClearance = (p: string, id: string, x: Partial<ProductionClearance>) => patch(p, 'clearances', id, x);
export const removeClearance = (p: string, id: string) => remove(p, 'clearances', id);
// Takes (Set-to-Cut).
export const subTakes = (p: string, cb: (r: ProductionTake[]) => void) => subscribe<ProductionTake>(p, 'takes', cb);
export const putTake = (p: string, row: ProductionTake) => put(p, 'takes', row);
export const patchTake = (p: string, id: string, x: Partial<ProductionTake>) => patch(p, 'takes', id, x);
export const removeTake = (p: string, id: string) => remove(p, 'takes', id);
// Continuity checks (Continuity Eye).
export const subContinuityChecks = (p: string, cb: (r: ContinuityCheck[]) => void) => subscribe<ContinuityCheck>(p, 'continuityChecks', cb);
export const putContinuityCheck = (p: string, row: ContinuityCheck) => put(p, 'continuityChecks', row);
export const removeContinuityCheck = (p: string, id: string) => remove(p, 'continuityChecks', id);
/** Write a clearance and append a workflow-ledger event in one batch, so the On-Set activity feed sees legal changes. */
export async function putClearanceWithEvent(prodId: string, clearance: ProductionClearance, actorUid: string, summary: string): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, 'productions', prodId, 'clearances', clearance.id), stripUndefined({ ...clearance, updatedAt: now }));
  const event: WorkflowEvent = {
    id: `evt_${uid8()}`, productionId: prodId, type: 'CLEARANCE_UPDATED', actorUid,
    entityType: 'clearance', entityId: clearance.id, summary, createdAt: now,
  };
  batch.set(doc(db, 'productions', prodId, 'workflowEvents', event.id), stripUndefined(event));
  try { await batch.commit(); } catch { /* offline: the optimistic UI already reflects it */ }
}
export const subWorkflowEvents = (p: string, cb: (r: WorkflowEvent[]) => void) => subscribe<WorkflowEvent>(p, 'workflowEvents', cb);

// Call sheets
export const subCallSheets = (p: string, cb: (r: CallSheet[]) => void) => subscribe<CallSheet>(p, 'callsheets', cb);
export const putCallSheet = (p: string, c: CallSheet) => put(p, 'callsheets', c);
export const patchCallSheet = (p: string, id: string, x: Partial<CallSheet>) => patch(p, 'callsheets', id, x);
export const removeCallSheet = (p: string, id: string) => remove(p, 'callsheets', id);

// Tasks
export const subTasks = (p: string, cb: (r: ProdTask[]) => void) => subscribe<ProdTask>(p, 'tasks', cb);
export const putTask = (p: string, t: ProdTask) => put(p, 'tasks', t);
export const patchTask = (p: string, id: string, x: Partial<ProdTask>) => patch(p, 'tasks', id, x);
export const removeTask = (p: string, id: string) => remove(p, 'tasks', id);

// Craft menu + orders
export const subCraftMenu = (p: string, cb: (r: CraftItem[]) => void) => subscribe<CraftItem>(p, 'craftMenu', cb);
export const putCraftItem = (p: string, i: CraftItem) => put(p, 'craftMenu', i);
export const removeCraftItem = (p: string, id: string) => remove(p, 'craftMenu', id);
// Daily Production Reports
export const subDprs = (p: string, cb: (r: DailyProductionReport[]) => void) => subscribe<DailyProductionReport>(p, 'dprs', cb);
export const putDpr = (p: string, d: DailyProductionReport) => put(p, 'dprs', d);
export const patchDpr = (p: string, id: string, x: Partial<DailyProductionReport>) => patch(p, 'dprs', id, x);
export const removeDpr = (p: string, id: string) => remove(p, 'dprs', id);

export const subCraftOrders = (p: string, cb: (r: CraftOrder[]) => void) => subscribe<CraftOrder>(p, 'craftOrders', cb);
export const putCraftOrder = (p: string, o: CraftOrder) => put(p, 'craftOrders', o);
export const patchCraftOrder = (p: string, id: string, x: Partial<CraftOrder>) => patch(p, 'craftOrders', id, x);

export function uid8() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
export const currentUid = () => auth?.currentUser?.uid;

// ─── Demo seed — a gorgeous, coherent production out of the box ───────────────

export function demoMembers(): ProductionMember[] {
  const now = Date.now();
  const m = (name: string, role: string, dept: DeptKey, extra: Partial<ProductionMember> = {}): ProductionMember =>
    ({ id: uid8(), name, role, dept, status: 'ACTIVE', createdAt: now, ...extra });
  return [
    m('Aria Chen', 'Director', 'DIRECTION'),
    m('Sofia Reyes', '1st Assistant Director', 'PRODUCTION', { dietary: ['vegetarian'] }),
    m('Marcus Webb', 'Line Producer', 'PRODUCTION'),
    m('Priya Kapoor', '2nd AD', 'PRODUCTION'),
    m('James Liu', 'Director of Photography', 'CAMERA'),
    m('Devon Clark', '1st AC', 'CAMERA'),
    m('Riley Kim', '2nd AC', 'CAMERA'),
    m('Derek Holmes', 'Gaffer', 'GRIP_ELECTRIC'),
    m('Tomas Vega', 'Key Grip', 'GRIP_ELECTRIC', { dietary: ['gluten-free'] }),
    m('Amara Diallo', 'Production Sound Mixer', 'SOUND'),
    m('Noah Bennett', 'Boom Operator', 'SOUND'),
    m('Elena Rossi', 'Production Designer', 'ART'),
    m('Grace Park', 'Costume Supervisor', 'WARDROBE'),
    m('Lila Moreno', 'Key Hair & Makeup', 'HAIR_MAKEUP'),
    m('Ben Foster', 'Location Manager', 'LOCATIONS'),
    m('Carlos Vega', 'Maya', 'CAST', { isCast: true, character: 'MAYA', role: 'Maya (Lead)', dietary: ['nut-allergy'], dietaryNotes: 'Severe — EpiPen on set' }),
    m('Nina Torres', 'Det. Ramos', 'CAST', { isCast: true, character: 'DET. RAMOS', role: 'Det. Ramos' }),
    m('Omar Said', 'Carlos (CI)', 'CAST', { isCast: true, character: 'CARLOS', role: 'Carlos (CI)', dietary: ['halal'] }),
  ];
}

export function demoScenes(): ProductionScene[] {
  const s = (sceneNum: string, intExt: ProductionScene['intExt'], dayNight: ProductionScene['dayNight'], set: string, synopsis: string, characters: string[], pages: number, shootDay: number): ProductionScene =>
    ({ id: uid8(), sceneNum, intExt, dayNight, set, synopsis, characters, pages, shootDay, status: 'NOT_SHOT' });
  return [
    s('1', 'INT', 'DAY', "MAYA'S APARTMENT", 'Maya reviews evidence. Unknown caller. She hesitates.', ['MAYA'], 1.0, 1),
    s('4', 'EXT', 'DUSK', 'RIVERSIDE PARK', 'Maya meets CI. Whispered exchange of intel.', ['MAYA', 'CARLOS'], 1.5, 1),
    s('2', 'EXT', 'NIGHT', 'DOWNTOWN PARKING GARAGE', 'Maya tails the suspect into the building.', ['MAYA'], 1.5, 2),
    s('3', 'INT', 'DAY', 'POLICE PRECINCT – BULLPEN', 'Det. Ramos confronts Maya about going off-book.', ['MAYA', 'DET. RAMOS'], 2.0, 3),
    s('5', 'INT', 'NIGHT', 'ABANDONED WAREHOUSE', 'Climax. Maya corners suspect. A shot rings out.', ['MAYA', 'DET. RAMOS'], 3.0, 7),
  ];
}

export function demoCraftMenu(): CraftItem[] {
  const now = Date.now();
  const c = (name: string, category: CraftCategory, desc: string, dietaryTags: string[] = []): CraftItem =>
    ({ id: uid8(), name, category, desc, dietaryTags, available: true, createdAt: now });
  return [
    c('Hot Lunch — Grilled Chicken', 'MEAL', 'Herb chicken, roast veg, rice'),
    c('Hot Lunch — Vegan Bowl', 'MEAL', 'Chickpea & quinoa power bowl', ['vegan', 'gluten-free', 'nut-free']),
    c('Turkey Club Wrap', 'SNACK', 'Grab-and-go from crafty'),
    c('Fresh Fruit Cup', 'SNACK', 'Seasonal', ['vegan', 'gluten-free', 'nut-free']),
    c('Espresso / Latte', 'COFFEE', 'Barista cart, oat milk available'),
    c('Cold Brew', 'COFFEE', 'On tap all day'),
    c('Electrolyte Water', 'DRINK', 'Cold, restocked hourly', ['vegan', 'gluten-free']),
    c('Gluten-Free Snack Box', 'SPECIAL', 'Certified GF', ['gluten-free']),
  ];
}

/** Optional starter data, installed only after the owner explicitly chooses it. */
export async function applySampleProduction(prodId: string, actorUid: string): Promise<void> {
  const production = await fetchProduction(prodId);
  if (!production || production.ownerUid !== actorUid) throw new Error('Only the production owner can apply the sample template.');
  if (production.sampleAppliedAt) throw new Error('The sample template is already installed.');
  const now = Date.now();
  const batch = writeBatch(db);
  demoMembers().forEach(row => batch.set(doc(db, 'productions', prodId, 'members', row.id), stripUndefined(row)));
  demoScenes().forEach(row => batch.set(doc(db, 'productions', prodId, 'scenes', row.id), stripUndefined(row)));
  demoCraftMenu().forEach(row => batch.set(doc(db, 'productions', prodId, 'craftMenu', row.id), stripUndefined(row)));
  const event: WorkflowEvent = {
    id: `evt_${uid8()}`, productionId: prodId, type: 'SAMPLE_APPLIED', actorUid,
    entityType: 'production', entityId: prodId, summary: 'Sample production template applied', createdAt: now,
  };
  batch.set(doc(db, 'productions', prodId, 'workflowEvents', event.id), event);
  batch.update(prodRef(prodId), { sampleAppliedAt: now, updatedAt: now });
  await batch.commit();
}
