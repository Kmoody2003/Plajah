// services/elevateTelaCompoundService.ts
//
// Universal Organization Operations + Plajah Tela Stack Compound Engine.
// Brings every Planning Center capability (Calendar/Facilities, Services Matrix/Blockouts,
// Check-In Ratios/Thermal Badges/Guardian Paging, Multi-Step Workflows & Tela Forms,
// Camp/Retreat/Trip Registrations with Installments & Cabin/Bus Assignments,
// Music Stand Transposition & Live Production Timers, and Non-Cash Stock/In-Kind Tax Receipts)
// into Plajah Elevate for BOTH churches AND non-church groups (Nonprofits, Museums/Cultural,
// Clubs, Schools, Civic Orgs), natively backed by bidirectional TelaDoc canvases.

import type {
  Organization,
  OrgType,
  TelaBaseDevice,
  TelaBlock,
  TelaDoc,
  TelaField,
  TelaFormDevice,
  TelaNotesDevice,
  TelaRow,
  TelaVectorDevice,
  TelaVectorObject,
  TelaWriterDevice,
} from '../types';
import { loadTelaDoc, saveTelaDoc } from './telaStore';
import { isDemoOrg } from './elevateTruth';

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

// ── 1. Multi-Vertical Lexicon (Works for Churches AND Non-Church Orgs) ────────

export interface VerticalOpsLexicon {
  orgKindLabel: string;
  facilityLabel: string;
  roomExamples: string;
  teamLabel: string;
  memberLabel: string;
  youthSafetyLabel: string;
  retreatLabel: string;
  lodgingLabel: string;
  standLabel: string;
}

export function getVerticalOpsLexicon(orgType?: OrgType | string): VerticalOpsLexicon {
  switch (orgType) {
    case 'CULTURAL':
      return {
        orgKindLabel: 'Museum & Cultural Institution',
        facilityLabel: 'Galleries, Wing Spaces & Equipment',
        roomExamples: 'Main Exhibition Hall, Lecture Theater, Conservation Studio',
        teamLabel: 'Docents, Curators & Event Crew',
        memberLabel: 'Patrons & Members',
        youthSafetyLabel: 'School Tour & Youth Workshop Ratios',
        retreatLabel: 'Symposia, Galas & Field Excursions',
        lodgingLabel: 'Cohort / Shuttle / Gallery Group',
        standLabel: 'Ensemble & Stage Cue Stand',
      };
    case 'NONPROFIT':
      return {
        orgKindLabel: 'Nonprofit & Community Organization',
        facilityLabel: 'Centers, Rooms & Fleet Resources',
        roomExamples: 'Community Commons, Distribution Bay, Training Room A',
        teamLabel: 'Field Volunteers & Shift Leads',
        memberLabel: 'Constituents & Supporters',
        youthSafetyLabel: 'Youth Program & Vulnerable-Adult Safety',
        retreatLabel: 'Summits, Drives & Multi-Day Camps',
        lodgingLabel: 'Cabin / Bus / Action Cohort',
        standLabel: 'Program Run-of-Show & Script Stand',
      };
    default:
      return {
        orgKindLabel: 'Church, Ministry & Fellowship',
        facilityLabel: 'Sanctuary, Rooms & Shared Equipment',
        roomExamples: 'Main Sanctuary, Fellowship Hall, Kids Room 204, Church Van',
        teamLabel: 'Worship, Production & Ministry Teams',
        memberLabel: 'Congregants & Families',
        youthSafetyLabel: 'Nursery & Kids Check-In Ratios + Paging',
        retreatLabel: 'Youth Camps, Retreats & Conferences',
        lodgingLabel: 'Cabin / Bunk / Bus Assignment',
        standLabel: 'Worship Music Stand & Live Timers',
      };
  }
}

// ── 2. Facilities, Rooms & Resource Calendar Models ───────────────────────────

export interface ElevateFacilityRoom {
  id: string;
  name: string;
  building: string;
  capacity: number;
  defaultSetupMins: number;
  defaultTeardownMins: number;
  requiresApproval: boolean;
  amenities: string[];
  floorplanPreset: 'SANCTUARY_THEATER' | 'BANQUET_ROUNDS' | 'CLASSROOM_ROWS' | 'GALLERY_OPEN';
}

export interface ElevateSharedResource {
  id: string;
  name: string;
  category: 'VEHICLE' | 'AV_TECH' | 'FURNITURE' | 'HOSPITALITY';
  totalQuantity: number;
}

export interface ElevateRoomReservation {
  id: string;
  title: string;
  departmentName: string;
  requestedBy: string;
  dateISO: string;
  startTime: string; // "09:00" 24h
  endTime: string;   // "11:30" 24h
  setupMins: number;
  teardownMins: number;
  roomId: string;
  expectedAttendees: number;
  resources: Array<{ resourceId: string; quantity: number }>;
  approvalStatus: 'APPROVED' | 'PENDING_FACILITIES' | 'CONFLICT_HOLD';
  notes?: string;
  telaDocId?: string;
}

export interface FacilityConflictReport {
  hasConflict: boolean;
  roomConflicts: string[];
  resourceConflicts: string[];
  capacityWarning?: string;
}

// ── 3. Matrix Scheduling, Date-Range Blockouts & Safety Gating Models ─────────

export interface VolunteerBlockoutRange {
  id: string;
  personId: string;
  personName: string;
  startISO: string;
  endISO: string;
  reason?: string;
}

export interface VolunteerSafetyRecord {
  personId: string;
  personName: string;
  roleSkills: string[];
  backgroundCheckStatus: 'CLEARED' | 'PENDING' | 'EXPIRED' | 'NOT_STARTED';
  backgroundClearedAt?: string;
  backgroundExpiresAt?: string;
  provider?: 'CHECKR' | 'STERLING' | 'MANUAL_VERIFIED';
  householdId?: string;
  householdRule?: 'TOGETHER_ALWAYS' | 'NEVER_SIMULTANEOUS' | 'INDEPENDENT';
  partnerName?: string;
}

export interface MatrixPositionSlot {
  id: string;
  teamName: string;
  positionTitle: string;
  requiresBackgroundCheck: boolean;
  requiredSkill?: string;
  assignmentsByDate: Record<string, { personId: string; personName: string; status: 'CONFIRMED' | 'PENDING' | 'DECLINED' } | null>;
}

// ── 4. Check-In Classroom Ratios, Thermal Badges & Guardian Paging Models ────

export interface ClassroomRatioZone {
  id: string;
  roomName: string;
  ageOrGradeBand: string;
  maxCapacity: number;
  requiredChildrenPerAdult: number; // e.g. 4 means 1:4 ratio
  activeAdults: number;
  checkedInChildren: Array<{
    id: string;
    childName: string;
    ageLabel: string;
    securityCode: string;
    guardianName: string;
    guardianMaskedPhone: string;
    allergies?: string;
    checkedInAt: string;
  }>;
  overflowRoomId?: string;
}

export interface GuardianPageLog {
  id: string;
  childName: string;
  securityCode: string;
  roomName: string;
  guardianName: string;
  message: string;
  sentAt: string;
  status: 'DELIVERED_PUSH_AND_SMS' | 'ACKNOWLEDGED';
}

// ── 5. Multi-Step Workflows & Tela-Native Forms Models ────────────────────────

export interface WorkflowStage {
  id: string;
  order: number;
  title: string;
  actionKind: 'AUTO_EMAIL_NOTIFY' | 'ASSIGN_CALL_TASK' | 'VERIFY_WAIVER_OR_BG' | 'COMPLETE_PLACEMENT';
  ownerRole: string;
  slaHours: number;
}

export interface WorkflowCardInstance {
  id: string;
  personName: string;
  personEmail?: string;
  currentStageId: string;
  startedAtISO: string;
  completedStageIds: string[];
  mappedProfileFields: Record<string, string>;
  eSignatureStamp?: string;
}

export interface ElevateAutomatedWorkflow {
  id: string;
  title: string;
  description: string;
  triggerLabel: string;
  telaFormDocId?: string;
  stages: WorkflowStage[];
  cards: WorkflowCardInstance[];
}

// ── 6. Retreats, Camps & Conferences Logistics Models ─────────────────────────

export interface RetreatLodgingUnit {
  id: string;
  name: string;
  kind: 'CABIN' | 'HOTEL_ROOM' | 'BUS_SHUTTLE' | 'COHORT_GROUP';
  capacity: number;
  genderOrAgeRule: string;
  leaderName: string;
}

export interface RetreatRegistrant {
  id: string;
  attendeeName: string;
  ageOrGrade: string;
  totalFeeUsd: number;
  depositPaidUsd: number;
  installmentsPaidUsd: number;
  scholarshipUsd: number;
  waiverSigned: boolean;
  waiverSigner?: string;
  dietaryOrAllergy?: string;
  tshirtSize: 'YS' | 'YM' | 'YL' | 'S' | 'M' | 'L' | 'XL' | '2XL';
  assignedCabinId?: string;
  assignedBusId?: string;
}

export interface ElevateRetreatEvent {
  id: string;
  title: string;
  datesLabel: string;
  location: string;
  basePriceUsd: number;
  depositRequiredUsd: number;
  lodgingUnits: RetreatLodgingUnit[];
  registrants: RetreatRegistrant[];
  telaDocId?: string;
}

// ── 7. Music Stand, Live Timers & Non-Cash Asset Models ───────────────────────

export interface LiveRunOfShowCue {
  id: string;
  order: number;
  title: string;
  category: 'COUNTDOWN' | 'WORSHIP_SONG' | 'HOST_WELCOME' | 'SCRIPTURE' | 'KEYNOTE_MESSAGE' | 'RESPONSE';
  plannedDurationSec: number;
  actualElapsedSec?: number;
  songKey?: string;
  bpm?: number;
  ccliNumber?: string;
  chordProLines?: string[];
  performerNotes?: string;
}

export interface NonCashAssetGift {
  id: string;
  donorName: string;
  donorAddress: string;
  dateReceivedISO: string;
  assetKind: 'PUBLIC_STOCK' | 'CRYPTO_ASSET' | 'DONOR_ADVISED_FUND' | 'IN_KIND_EQUIPMENT';
  assetDescription: string; // e.g., "45 shares of AAPL common stock"
  tickerOrIdentifier?: string;
  shareOrUnitCount?: number;
  fundName: string;
  internalEstimatedValueUsd: number; // Never printed on IRS donor receipt!
  irsReceiptGenerated: boolean;
  telaReceiptDocId?: string;
}

export interface ElevateCompoundBundle {
  orgId: string;
  rooms: ElevateFacilityRoom[];
  resources: ElevateSharedResource[];
  reservations: ElevateRoomReservation[];
  matrixDates: string[];
  blockouts: VolunteerBlockoutRange[];
  safetyRecords: VolunteerSafetyRecord[];
  matrixSlots: MatrixPositionSlot[];
  ratioZones: ClassroomRatioZone[];
  guardianPages: GuardianPageLog[];
  workflows: ElevateAutomatedWorkflow[];
  retreats: ElevateRetreatEvent[];
  runOfShowCues: LiveRunOfShowCue[];
  nonCashGifts: NonCashAssetGift[];
  updatedAt: number;
}

const STORAGE_KEY = (orgId: string) => `plajah_elevate_tela_compound_v1_${orgId}`;

// ── Pure Conflict, Ratio, Scheduling & Transposition Engines ──────────────────

function parseMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return 540;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Checks room double-booking AND shared equipment quantity exhaustion across overlapping
 * time windows, including setup and teardown buffers.
 */
export function detectFacilityAndResourceConflicts(
  candidate: Omit<ElevateRoomReservation, 'id' | 'approvalStatus'>,
  existing: ElevateRoomReservation[],
  rooms: ElevateFacilityRoom[],
  resources: ElevateSharedResource[],
  ignoreReservationId?: string
): FacilityConflictReport {
  const candStart = parseMinutes(candidate.startTime) - (candidate.setupMins || 0);
  const candEnd = parseMinutes(candidate.endTime) + (candidate.teardownMins || 0);
  const room = rooms.find(r => r.id === candidate.roomId);

  const sameDay = existing.filter(
    r => r.dateISO === candidate.dateISO && r.id !== ignoreReservationId
  );

  const overlapping = sameDay.filter(r => {
    const start = parseMinutes(r.startTime) - (r.setupMins || 0);
    const end = parseMinutes(r.endTime) + (r.teardownMins || 0);
    return candStart < end && candEnd > start;
  });

  const roomConflicts: string[] = [];
  for (const ov of overlapping) {
    if (ov.roomId === candidate.roomId) {
      roomConflicts.push(
        `${room?.name || 'Room'} is already booked for "${ov.title}" (${ov.startTime}–${ov.endTime} incl. buffer).`
      );
    }
  }

  const resourceConflicts: string[] = [];
  for (const req of candidate.resources || []) {
    if (req.quantity <= 0) continue;
    const resMeta = resources.find(x => x.id === req.resourceId);
    if (!resMeta) continue;
    const usedElsewhere = overlapping.reduce((sum, ov) => {
      const match = (ov.resources || []).find(x => x.resourceId === req.resourceId);
      return sum + (match ? match.quantity : 0);
    }, 0);
    if (usedElsewhere + req.quantity > resMeta.totalQuantity) {
      resourceConflicts.push(
        `${resMeta.name}: requested ${req.quantity}, but only ${Math.max(0, resMeta.totalQuantity - usedElsewhere)} of ${resMeta.totalQuantity} available during this window.`
      );
    }
  }

  const capacityWarning =
    room && candidate.expectedAttendees > room.capacity
      ? `Expected attendance (${candidate.expectedAttendees}) exceeds ${room.name} capacity (${room.capacity}).`
      : undefined;

  return {
    hasConflict: roomConflicts.length > 0 || resourceConflicts.length > 0,
    roomConflicts,
    resourceConflicts,
    capacityWarning,
  };
}

/**
 * Validates whether a volunteer can be scheduled into a Matrix Position on a given date:
 * checks (1) Date-range blockouts, (2) Background check clearance if required,
 * (3) Double-booking on the same date, and (4) Household scheduling rules.
 */
export function evaluateVolunteerMatrixEligibility(
  person: VolunteerSafetyRecord,
  slot: MatrixPositionSlot,
  dateISO: string,
  allSlots: MatrixPositionSlot[],
  blockouts: VolunteerBlockoutRange[]
): { eligible: boolean; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Blockout date range check
  const activeBlockout = blockouts.find(
    b => b.personId === person.personId && dateISO >= b.startISO && dateISO <= b.endISO
  );
  if (activeBlockout) {
    blockers.push(`Blocked out ${activeBlockout.startISO} to ${activeBlockout.endISO}${activeBlockout.reason ? ` (${activeBlockout.reason})` : ''}`);
  }

  // 2. Background check gate
  if (slot.requiresBackgroundCheck && person.backgroundCheckStatus !== 'CLEARED') {
    blockers.push(`Position requires a CLEARED background check (current: ${person.backgroundCheckStatus})`);
  }

  // 3. Double-booking check on same date
  const alreadyAssigned = allSlots.find(
    s => s.id !== slot.id && s.assignmentsByDate[dateISO]?.personId === person.personId
  );
  if (alreadyAssigned) {
    blockers.push(`Already scheduled in "${alreadyAssigned.positionTitle}" on ${dateISO}`);
  }

  // 4. Household rules
  if (person.householdRule === 'NEVER_SIMULTANEOUS' && person.partnerName) {
    const partnerScheduled = allSlots.find(
      s => s.assignmentsByDate[dateISO]?.personName === person.partnerName
    );
    if (partnerScheduled) {
      blockers.push(`Household rule: Never schedule simultaneously with ${person.partnerName}`);
    }
  } else if (person.householdRule === 'TOGETHER_ALWAYS' && person.partnerName) {
    const partnerScheduled = allSlots.find(
      s => s.assignmentsByDate[dateISO]?.personName === person.partnerName
    );
    if (!partnerScheduled) {
      warnings.push(`Household preference: Schedule alongside ${person.partnerName}`);
    }
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ── ChordPro / Semitone / Nashville Number System Transposer ──────────────────

const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

function noteIndex(note: string): number {
  const clean = note.trim();
  const sIdx = CHROMATIC_SHARP.indexOf(clean);
  if (sIdx !== -1) return sIdx;
  return CHROMATIC_FLAT.indexOf(clean);
}

export function transposeChordToken(
  chord: string,
  fromKey: string,
  toKeyOrNashville: string
): string {
  const fromRoot = fromKey.replace(/\s*(Major|Minor|m)$/i, '').trim();
  const fromIdx = noteIndex(fromRoot);
  if (fromIdx === -1) return chord;

  const m = /^([A-G][#b]?)(.*)$/.exec(chord.trim());
  if (!m) return chord;
  const [, root, suffix] = m;
  const rootIdx = noteIndex(root);
  if (rootIdx === -1) return chord;

  // Nashville Number System conversion (1, 2m, 4, 5, 6m...)
  if (toKeyOrNashville === 'NASHVILLE') {
    const relSemitones = (rootIdx - fromIdx + 12) % 12;
    const degIdx = MAJOR_SCALE_INTERVALS.indexOf(relSemitones);
    const degLabel =
      degIdx !== -1
        ? String(degIdx + 1)
        : relSemitones === 10
        ? 'b7'
        : relSemitones === 3
        ? 'b3'
        : relSemitones === 8
        ? 'b6'
        : `#${MAJOR_SCALE_INTERVALS.findIndex(x => x > relSemitones)}`;
    return `${degLabel}${suffix}`;
  }

  const toRoot = toKeyOrNashville.replace(/\s*(Major|Minor|m)$/i, '').trim();
  const toIdx = noteIndex(toRoot);
  if (toIdx === -1) return chord;

  const useFlats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(toRoot);
  const scale = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  const shiftedIdx = (rootIdx + (toIdx - fromIdx) + 12) % 12;

  // Handle slash chords like Eb/G
  const slashParts = suffix.split('/');
  if (slashParts.length === 2 && /^[A-G][#b]?$/.test(slashParts[1])) {
    const bassIdx = noteIndex(slashParts[1]);
    const shiftedBass = bassIdx !== -1 ? scale[(bassIdx + (toIdx - fromIdx) + 12) % 12] : slashParts[1];
    return `${scale[shiftedIdx]}${slashParts[0]}/${shiftedBass}`;
  }

  return `${scale[shiftedIdx]}${suffix}`;
}

export function transposeChordProLines(
  lines: string[],
  fromKey: string,
  targetKeyOrNashville: string
): string[] {
  if (!targetKeyOrNashville || targetKeyOrNashville === fromKey) return lines;
  return lines.map(line =>
    line.replace(/\[([A-G][#b]?[^\]]*)\]/g, (_full, chord) => {
      return `[${transposeChordToken(chord, fromKey, targetKeyOrNashville)}]`;
    })
  );
}

// ── Tela Stack Compounding Builders (Real Multi-Frame TelaDocs) ───────────────

function openTelaDocInStudio(docId: string) {
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }));
}

/**
 * 1. Opens a Facility Room Reservation as a 3-Frame Tela Document:
 *    - Frame 1 (VECTOR): Interactive Room Floorplan & Stage/Seating Layout Diagram
 *    - Frame 2 (BASE): Equipment, Resource & Custodial Checklist Table
 *    - Frame 3 (WRITER): Event Run-of-Show & Setup Instructions
 */
export async function openFacilityBookingInTela(
  org: Organization,
  reservation: ElevateRoomReservation,
  room: ElevateFacilityRoom | undefined,
  resources: ElevateSharedResource[],
  ownerId: string,
  autoDispatch = true
): Promise<TelaDoc> {
  const docId = `tela_elevate_facility_${org.id}_${reservation.id}`.replace(/[^a-z0-9_-]/gi, '_');
  const prior = await loadTelaDoc(docId);
  const now = Date.now();

  // Frame 1: Vector Floorplan Diagram
  const vectorId = uid('vec_floorplan');
  const objects: TelaVectorObject[] = [
    {
      id: uid('bg'),
      kind: 'RECT',
      x: 40,
      y: 40,
      w: 720,
      h: 480,
      fill: '#130d1f',
      stroke: '#8B5CF6',
      strokeWidth: 2,
      rotation: 0,
      opacity: 1,
      rx: 18,
    },
    {
      id: uid('stage'),
      kind: 'RECT',
      x: 200,
      y: 65,
      w: 400,
      h: 72,
      fill: '#D40055',
      stroke: '#FF8C00',
      strokeWidth: 2,
      rotation: 0,
      opacity: 0.9,
      rx: 10,
    },
    {
      id: uid('stage_lbl'),
      kind: 'TEXT',
      x: 240,
      y: 88,
      w: 320,
      h: 32,
      fill: '#FFFFFF',
      stroke: 'none',
      strokeWidth: 0,
      rotation: 0,
      opacity: 1,
      text: `${room?.name || 'Main Space'} · Stage / Focal Wall`,
      fontSize: 16,
      fontWeight: 800,
      textAlign: 'center',
    },
  ];

  // Add seating / table zones based on room preset
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      objects.push({
        id: uid(`zone_${row}_${col}`),
        kind: room?.floorplanPreset === 'BANQUET_ROUNDS' ? 'ELLIPSE' : 'RECT',
        x: 110 + col * 210,
        y: 190 + row * 135,
        w: 150,
        h: 85,
        fill: '#231836',
        stroke: '#06D6A0',
        strokeWidth: 1.5,
        rotation: 0,
        opacity: 0.95,
        rx: 12,
      });
    }
  }

  const vectorDevice: TelaVectorDevice = {
    id: vectorId,
    type: 'VECTOR',
    name: `${room?.name || 'Facility'} Floorplan`,
    width: 800,
    height: 560,
    objects,
  };

  // Frame 2: Base Checklist for Equipment & Custodial
  const baseId = uid('base_resources');
  const fields: TelaField[] = [
    { id: 'f_item', name: 'Resource / Setup Item', type: 'TEXT' },
    { id: 'f_qty', name: 'Qty / Window', type: 'TEXT' },
    { id: 'f_dept', name: 'Owner', type: 'SELECT', options: ['Facilities', 'A/V Tech', 'Hospitality', 'Event Lead'] },
    { id: 'f_ready', name: 'Verified', type: 'CHECKBOX' },
  ];
  const rows: TelaRow[] = [
    {
      id: uid('r'),
      values: {
        f_item: `Room Unlock & HVAC (${room?.name || 'Space'})`,
        f_qty: `${reservation.setupMins}m prior (${reservation.startTime})`,
        f_dept: 'Facilities',
        f_ready: '1',
      },
    },
    ...(reservation.resources || []).map(req => {
      const meta = resources.find(x => x.id === req.resourceId);
      return {
        id: uid('r'),
        values: {
          f_item: meta?.name || req.resourceId,
          f_qty: String(req.quantity),
          f_dept: meta?.category === 'AV_TECH' ? 'A/V Tech' : 'Facilities',
          f_ready: '1',
        },
      };
    }),
    {
      id: uid('r'),
      values: {
        f_item: `Teardown & Reset (${room?.floorplanPreset || 'Standard'})`,
        f_qty: `+${reservation.teardownMins}m (${reservation.endTime})`,
        f_dept: 'Facilities',
        f_ready: '',
      },
    },
  ];

  const baseDevice: TelaBaseDevice = {
    id: baseId,
    type: 'BASE',
    name: 'Facility & Resource Checklist',
    fields,
    rows,
  };

  // Frame 3: Writer Setup & Run-of-Show Brief
  const writerId = uid('writer_brief');
  const blocks: TelaBlock[] = [
    {
      id: uid('blk'),
      kind: 'h1',
      text: escHtml(`${reservation.title} — Facility & Setup Packet`),
    },
    {
      id: uid('blk'),
      kind: 'p',
      text: escHtml(
        `Organization: ${org.name}\nSpace: ${room?.name || 'Assigned Room'} (${room?.building || 'Main Campus'})\nDate & Window: ${reservation.dateISO} · ${reservation.startTime}–${reservation.endTime} (Setup: ${reservation.setupMins}m, Teardown: ${reservation.teardownMins}m)\nExpected Attendance: ${reservation.expectedAttendees} (Room Cap: ${room?.capacity || 100})\nStatus: ${reservation.approvalStatus}`
      ),
    },
    {
      id: uid('blk'),
      kind: 'p',
      text: escHtml(reservation.notes || 'Standard room setup and safety walkthrough completed.'),
    },
  ];

  const writerDevice: TelaWriterDevice = {
    id: writerId,
    type: 'WRITER',
    blocks,
  };

  const doc: TelaDoc = {
    id: docId,
    ownerId,
    title: `${reservation.title} · Facility & Floorplan Tela`,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    bindings: [],
    frames: [
      {
        id: prior?.frames[0]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 0,
        y: 0,
        w: 820,
        h: 600,
        deviceIds: [vectorId],
        label: 'Frame 1: Interactive Room Floorplan (TelaVector)',
      },
      {
        id: prior?.frames[1]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 880,
        y: 0,
        w: 760,
        h: 600,
        deviceIds: [baseId],
        label: 'Frame 2: Equipment & Custodial Base (TelaBase)',
      },
      {
        id: prior?.frames[2]?.id || uid('frame'),
        kind: 'PAPER',
        preset: 'LETTER',
        orientation: 'PORTRAIT',
        x: 1700,
        y: 0,
        w: 816,
        h: 1056,
        deviceIds: [writerId],
        label: 'Frame 3: Operations & Setup Brief (TelaWriter)',
      },
    ],
    devices: {
      [vectorId]: vectorDevice,
      [baseId]: baseDevice,
      [writerId]: writerDevice,
    },
  };

  await saveTelaDoc(doc);
  if (autoDispatch) openTelaDocInStudio(docId);
  return doc;
}

/**
 * 2. Opens the Multi-Week Volunteer Matrix & Safety Roster in Tela:
 *    - Frame 1 (BASE): Multi-Week Matrix Schedule Grid
 *    - Frame 2 (NOTES): Team Call Times, Safety Clearances & Blockout Digest
 */
export async function openMatrixScheduleInTela(
  org: Organization,
  dates: string[],
  slots: MatrixPositionSlot[],
  blockouts: VolunteerBlockoutRange[],
  ownerId: string,
  autoDispatch = true
): Promise<TelaDoc> {
  const docId = `tela_elevate_matrix_${org.id}`.replace(/[^a-z0-9_-]/gi, '_');
  const prior = await loadTelaDoc(docId);
  const now = Date.now();

  const baseId = uid('base_matrix');
  const fields: TelaField[] = [
    { id: 'f_team', name: 'Team', type: 'TEXT' },
    { id: 'f_pos', name: 'Position', type: 'TEXT' },
    { id: 'f_bg', name: 'Safety Gate', type: 'TEXT' },
    ...dates.map((d, idx) => ({ id: `f_d_${idx}`, name: d, type: 'TEXT' as const })),
  ];

  const rows: TelaRow[] = slots.map(slot => {
    const values: Record<string, string> = {
      f_team: slot.teamName,
      f_pos: slot.positionTitle,
      f_bg: slot.requiresBackgroundCheck ? 'BG Check Req' : 'Standard',
    };
    dates.forEach((d, idx) => {
      const a = slot.assignmentsByDate[d];
      values[`f_d_${idx}`] = a ? `${a.personName} (${a.status === 'CONFIRMED' ? '✓' : '?'})` : 'OPEN';
    });
    return { id: slot.id, values };
  });

  const baseDevice: TelaBaseDevice = {
    id: baseId,
    type: 'BASE',
    name: `${org.name} · Multi-Week Matrix`,
    fields,
    rows,
  };

  const notesId = uid('notes_matrix');
  const notesDevice: TelaNotesDevice = {
    id: notesId,
    type: 'NOTES',
    name: 'Blockout & Safety Briefing',
    defaultKind: 'NOTE',
    entries: [
      {
        id: uid('entry'),
        kind: 'NOTE',
        title: 'Active Blockout Dates & Household Rules',
        blocks: [
          {
            id: uid('blk'),
            kind: 'p',
            text: escHtml(
              blockouts.length
                ? blockouts.map(b => `• ${b.personName}: ${b.startISO} → ${b.endISO} (${b.reason || 'Unavailable'})`).join('\n')
                : 'No active volunteer blockouts.'
            ),
          },
        ],
        tags: ['matrix', 'scheduling'],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  const doc: TelaDoc = {
    id: docId,
    ownerId,
    title: `${org.name} · Multi-Week Matrix Schedule`,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    bindings: [],
    frames: [
      {
        id: prior?.frames[0]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 0,
        y: 0,
        w: 980,
        h: 620,
        deviceIds: [baseId],
        label: 'Frame 1: Multi-Week Matrix Base (TelaBase)',
      },
      {
        id: prior?.frames[1]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 1040,
        y: 0,
        w: 680,
        h: 620,
        deviceIds: [notesId],
        label: 'Frame 2: Blockouts & Call Sheet Notes (TelaNotes)',
      },
    ],
    devices: {
      [baseId]: baseDevice,
      [notesId]: notesDevice,
    },
  };

  await saveTelaDoc(doc);
  if (autoDispatch) openTelaDocInStudio(docId);
  return doc;
}

/**
 * 3. Opens a Workflow + Intake Form as a connected TelaForm + TelaBase + TelaWriter canvas.
 */
export async function openWorkflowFormInTela(
  org: Organization,
  workflow: ElevateAutomatedWorkflow,
  ownerId: string,
  autoDispatch = true
): Promise<TelaDoc> {
  const docId = `tela_elevate_workflow_${org.id}_${workflow.id}`.replace(/[^a-z0-9_-]/gi, '_');
  const prior = await loadTelaDoc(docId);
  const now = Date.now();

  const baseId = uid('base_wf');
  const formId = uid('form_wf');
  const writerId = uid('writer_wf');

  const fields: TelaField[] = [
    { id: 'wf_name', name: 'Full Name', type: 'TEXT' },
    { id: 'wf_email', name: 'Email Address', type: 'TEXT' },
    { id: 'wf_stage', name: 'Current Pipeline Stage', type: 'SELECT', options: workflow.stages.map(s => s.title) },
    { id: 'wf_allergies', name: 'Medical / Dietary / Notes', type: 'TEXT' },
    { id: 'wf_waiver', name: 'E-Sign Waiver Verified', type: 'CHECKBOX' },
  ];

  const rows: TelaRow[] = workflow.cards.map(c => {
    const st = workflow.stages.find(s => s.id === c.currentStageId);
    return {
      id: c.id,
      values: {
        wf_name: c.personName,
        wf_email: c.personEmail || '',
        wf_stage: st?.title || workflow.stages[0]?.title || '',
        wf_allergies: Object.entries(c.mappedProfileFields).map(([k, v]) => `${k}: ${v}`).join('; '),
        wf_waiver: c.eSignatureStamp ? '1' : '',
      },
    };
  });

  const baseDevice: TelaBaseDevice = {
    id: baseId,
    type: 'BASE',
    name: `${workflow.title} · Submissions & Pipeline`,
    fields,
    rows,
  };

  const formDevice: TelaFormDevice = {
    id: formId,
    type: 'FORM',
    baseDeviceId: baseId,
    title: `${workflow.title} · Intake & Waiver Form`,
    presentation: 'FLOW',
  };

  const writerDevice: TelaWriterDevice = {
    id: writerId,
    type: 'WRITER',
    blocks: [
      { id: uid('blk'), kind: 'h1', text: escHtml(`${workflow.title} — Automated Pipeline SOP`) },
      { id: uid('blk'), kind: 'p', text: escHtml(`Trigger: ${workflow.triggerLabel}\n${workflow.description}`) },
      ...workflow.stages.map(s => ({
        id: uid('blk'),
        kind: 'p' as const,
        text: escHtml(`Stage ${s.order}: ${s.title} (${s.actionKind}) · Owner: ${s.ownerRole} · SLA: ${s.slaHours}h`),
      })),
    ],
  };

  const doc: TelaDoc = {
    id: docId,
    ownerId,
    title: `${workflow.title} · Tela Form & Pipeline`,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    bindings: [],
    frames: [
      {
        id: prior?.frames[0]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 0,
        y: 0,
        w: 500,
        h: 680,
        deviceIds: [formId],
        label: 'Frame 1: Public Intake & Waiver Form (TelaForm)',
      },
      {
        id: prior?.frames[1]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 560,
        y: 0,
        w: 840,
        h: 680,
        deviceIds: [baseId],
        label: 'Frame 2: Live Submissions & Pipeline Base (TelaBase)',
      },
      {
        id: prior?.frames[2]?.id || uid('frame'),
        kind: 'PAPER',
        preset: 'LETTER',
        orientation: 'PORTRAIT',
        x: 1460,
        y: 0,
        w: 816,
        h: 1056,
        deviceIds: [writerId],
        label: 'Frame 3: Pipeline Automation SOP (TelaWriter)',
      },
    ],
    devices: {
      [formId]: formDevice,
      [baseId]: baseDevice,
      [writerId]: writerDevice,
    },
  };

  await saveTelaDoc(doc);
  if (autoDispatch) openTelaDocInStudio(docId);
  return doc;
}

/**
 * 4. Opens a Camp / Retreat / Conference Logistics Dossier in Tela:
 *    - Frame 1 (BASE): Registrants, Installment Balances, Cabin & Bus Assignments
 *    - Frame 2 (WRITER): Trip Master Manifest, Medical Alerts & Lodging Summary
 */
export async function openRetreatLogisticsInTela(
  org: Organization,
  retreat: ElevateRetreatEvent,
  ownerId: string,
  autoDispatch = true
): Promise<TelaDoc> {
  const docId = `tela_elevate_retreat_${org.id}_${retreat.id}`.replace(/[^a-z0-9_-]/gi, '_');
  const prior = await loadTelaDoc(docId);
  const now = Date.now();

  const baseId = uid('base_retreat');
  const writerId = uid('writer_retreat');

  const fields: TelaField[] = [
    { id: 'r_name', name: 'Attendee', type: 'TEXT' },
    { id: 'r_band', name: 'Age / Group', type: 'TEXT' },
    { id: 'r_cabin', name: 'Lodging / Cabin', type: 'TEXT' },
    { id: 'r_bus', name: 'Transport / Bus', type: 'TEXT' },
    { id: 'r_paid', name: 'Paid ($)', type: 'NUMBER' },
    { id: 'r_due', name: 'Balance Due ($)', type: 'NUMBER' },
    { id: 'r_med', name: 'Dietary / Allergy', type: 'TEXT' },
    { id: 'r_waiver', name: 'Waiver Signed', type: 'CHECKBOX' },
  ];

  const rows: TelaRow[] = retreat.registrants.map(reg => {
    const cabin = retreat.lodgingUnits.find(u => u.id === reg.assignedCabinId)?.name || 'Unassigned';
    const bus = retreat.lodgingUnits.find(u => u.id === reg.assignedBusId)?.name || 'Unassigned';
    const paid = reg.depositPaidUsd + reg.installmentsPaidUsd;
    const due = Math.max(0, reg.totalFeeUsd - reg.scholarshipUsd - paid);
    return {
      id: reg.id,
      values: {
        r_name: reg.attendeeName,
        r_band: reg.ageOrGrade,
        r_cabin: cabin,
        r_bus: bus,
        r_paid: String(paid),
        r_due: String(due),
        r_med: reg.dietaryOrAllergy || 'None',
        r_waiver: reg.waiverSigned ? '1' : '',
      },
    };
  });

  const baseDevice: TelaBaseDevice = {
    id: baseId,
    type: 'BASE',
    name: `${retreat.title} · Logistics Manifest`,
    fields,
    rows,
  };

  const writerDevice: TelaWriterDevice = {
    id: writerId,
    type: 'WRITER',
    blocks: [
      { id: uid('blk'), kind: 'h1', text: escHtml(`${retreat.title} — Master Trip & Lodging Dossier`) },
      {
        id: uid('blk'),
        kind: 'p',
        text: escHtml(`Organization: ${org.name}\nDates: ${retreat.datesLabel}\nLocation: ${retreat.location}\nRegistrants: ${retreat.registrants.length}`),
      },
      {
        id: uid('blk'),
        kind: 'p',
        text: escHtml(
          retreat.lodgingUnits
            .map(u => `• ${u.name} (${u.kind}) — Leader: ${u.leaderName} · Rule: ${u.genderOrAgeRule} · Cap: ${u.capacity}`)
            .join('\n')
        ),
      },
    ],
  };

  const doc: TelaDoc = {
    id: docId,
    ownerId,
    title: `${retreat.title} · Logistics & Cabin Manifest`,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    bindings: [],
    frames: [
      {
        id: prior?.frames[0]?.id || uid('frame'),
        kind: 'BOARD',
        preset: 'FREE',
        x: 0,
        y: 0,
        w: 1020,
        h: 640,
        deviceIds: [baseId],
        label: 'Frame 1: Cabin, Bus & Installment Ledger (TelaBase)',
      },
      {
        id: prior?.frames[1]?.id || uid('frame'),
        kind: 'PAPER',
        preset: 'LETTER',
        orientation: 'PORTRAIT',
        x: 1080,
        y: 0,
        w: 816,
        h: 1056,
        deviceIds: [writerId],
        label: 'Frame 2: Trip Leader & Medical Dossier (TelaWriter)',
      },
    ],
    devices: {
      [baseId]: baseDevice,
      [writerId]: writerDevice,
    },
  };

  await saveTelaDoc(doc);
  if (autoDispatch) openTelaDocInStudio(docId);
  return doc;
}

/**
 * 5. Generates an IRS Publication 1771 Non-Cash Asset Tax Acknowledgment (Stock / Crypto / In-Kind)
 *    as a formal Tela Document (describes the exact asset/shares without assigning a dollar value).
 */
export async function openNonCashIrsReceiptInTela(
  org: Organization,
  gift: NonCashAssetGift,
  ownerId: string,
  autoDispatch = true
): Promise<TelaDoc> {
  const docId = `tela_elevate_noncash_receipt_${org.id}_${gift.id}`.replace(/[^a-z0-9_-]/gi, '_');
  const prior = await loadTelaDoc(docId);
  const now = Date.now();

  const writerId = uid('writer_irs');
  const writerDevice: TelaWriterDevice = {
    id: writerId,
    type: 'WRITER',
    blocks: [
      {
        id: uid('blk'),
        kind: 'h1',
        text: escHtml(`${org.legalName || org.name} — Official Non-Cash Contribution Acknowledgment`),
      },
      {
        id: uid('blk'),
        kind: 'p',
        text: escHtml(
          `Donor: ${gift.donorName}\nAddress: ${gift.donorAddress}\nDate Received: ${gift.dateReceivedISO}\nAsset Category: ${gift.assetKind.replace(/_/g, ' ')}\nDesignated Fund: ${gift.fundName}`
        ),
      },
      {
        id: uid('blk'),
        kind: 'p',
        text: escHtml(
          `Description of Contributed Property (Per IRS Publication 1771):\n"${gift.assetDescription}"${
            gift.tickerOrIdentifier ? ` (Identifier/Ticker: ${gift.tickerOrIdentifier}, Units/Shares: ${gift.shareOrUnitCount || 1})` : ''
          }\n\nNote: Per IRS regulations for non-cash gifts of securities or property, the receiving organization acknowledges the specific property received above and does not state a dollar valuation. No goods or services were provided in exchange for this contribution.`
        ),
      },
    ],
  };

  const doc: TelaDoc = {
    id: docId,
    ownerId,
    title: `IRS Non-Cash Receipt · ${gift.donorName} (${gift.dateReceivedISO})`,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    bindings: [],
    frames: [
      {
        id: prior?.frames[0]?.id || uid('frame'),
        kind: 'PAPER',
        preset: 'LETTER',
        orientation: 'PORTRAIT',
        x: 0,
        y: 0,
        w: 816,
        h: 1056,
        deviceIds: [writerId],
        label: 'Official IRS Pub 1771 Non-Cash Receipt (TelaWriter)',
      },
    ],
    devices: { [writerId]: writerDevice },
  };

  await saveTelaDoc(doc);
  if (autoDispatch) openTelaDocInStudio(docId);
  return doc;
}

// ── Default Seed Data & Persistence ───────────────────────────────────────────

export function createDefaultCompoundBundle(org: Organization): ElevateCompoundBundle {
  const demo = isDemoOrg(org);
  const rooms: ElevateFacilityRoom[] = [
    {
      id: 'room_sanctuary_main',
      name: org.orgType === 'CULTURAL' ? 'Grand Rotunda & Auditorium' : 'Main Sanctuary / Assembly Hall',
      building: 'Main Building · Floor 1',
      capacity: 450,
      defaultSetupMins: 45,
      defaultTeardownMins: 30,
      requiresApproval: true,
      amenities: ['NDI Dual Projection', 'Soundboard & Stems', 'Wheelchair Accessible', 'Livestream Cameras'],
      floorplanPreset: 'SANCTUARY_THEATER',
    },
    {
      id: 'room_fellowship_commons',
      name: org.orgType === 'CULTURAL' ? 'Atrium Banquet & Workshop Hall' : 'Fellowship Hall & Commons',
      building: 'West Wing · Ground',
      capacity: 180,
      defaultSetupMins: 30,
      defaultTeardownMins: 30,
      requiresApproval: true,
      amenities: ['Commercial Kitchen', 'Round Banquet Tables', 'Portable PA'],
      floorplanPreset: 'BANQUET_ROUNDS',
    },
    {
      id: 'room_ed_204',
      name: org.orgType === 'CULTURAL' ? 'Education Studio 204' : 'Kids & Youth Wing · Room 204',
      building: 'Education Wing · Floor 2',
      capacity: 40,
      defaultSetupMins: 15,
      defaultTeardownMins: 15,
      requiresApproval: false,
      amenities: ['Check-In Kiosk Printer', 'Interactive Tela Wall', 'Child Safety Lock'],
      floorplanPreset: 'CLASSROOM_ROWS',
    },
  ];

  const resources: ElevateSharedResource[] = [
    { id: 'res_van_15', name: '15-Passenger Transit Van', category: 'VEHICLE', totalQuantity: 2 },
    { id: 'res_av_mobile', name: 'Mobile Wireless Mic & PA Rig', category: 'AV_TECH', totalQuantity: 3 },
    { id: 'res_tables_round', name: '60" Round Banquet Tables (Set of 10)', category: 'FURNITURE', totalQuantity: 4 },
    { id: 'res_coffee_urns', name: 'Hospitality Espresso & Urn Station', category: 'HOSPITALITY', totalQuantity: 2 },
  ];

  const reservations: ElevateRoomReservation[] = demo
    ? [
        {
          id: 'resv_sunday_main',
          title: 'Sunday Morning Gathering & Live Broadcast',
          departmentName: 'Worship & Sanctuary Arts',
          requestedBy: 'Pastor & Production Lead',
          dateISO: '2026-11-01',
          startTime: '08:30',
          endTime: '12:30',
          setupMins: 45,
          teardownMins: 30,
          roomId: 'room_sanctuary_main',
          expectedAttendees: 340,
          resources: [{ resourceId: 'res_coffee_urns', quantity: 1 }],
          approvalStatus: 'APPROVED',
          notes: 'Stage plots set for full band + 38-voice choir; Follow-Along Scripture active.',
        },
        {
          id: 'resv_newcomers_lunch',
          title: 'Newcomers & Welcome Table Luncheon',
          departmentName: 'Hospitality & Assimilation',
          requestedBy: 'Elena Sterling',
          dateISO: '2026-11-01',
          startTime: '12:45',
          endTime: '14:30',
          setupMins: 30,
          teardownMins: 30,
          roomId: 'room_fellowship_commons',
          expectedAttendees: 85,
          resources: [
            { resourceId: 'res_tables_round', quantity: 2 },
            { resourceId: 'res_av_mobile', quantity: 1 },
          ],
          approvalStatus: 'APPROVED',
          notes: '9 round tables + welcome packet Tela QR at each table.',
        },
      ]
    : [];

  const matrixDates = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22'];

  const safetyRecords: VolunteerSafetyRecord[] = demo
    ? [
        {
          personId: 'vol_camille',
          personName: 'Sister Camille Vance',
          roleSkills: ['Vocals', 'Choir Director', 'Keys'],
          backgroundCheckStatus: 'CLEARED',
          backgroundClearedAt: '2026-01-14',
          backgroundExpiresAt: '2028-01-14',
          provider: 'CHECKR',
          householdId: 'hh_vance',
          householdRule: 'TOGETHER_ALWAYS',
          partnerName: 'Devon Vance',
        },
        {
          personId: 'vol_devon',
          personName: 'Devon Vance',
          roleSkills: ['FOH Audio', 'NDI Camera', 'Stage Switcher'],
          backgroundCheckStatus: 'CLEARED',
          backgroundClearedAt: '2026-01-14',
          backgroundExpiresAt: '2028-01-14',
          provider: 'CHECKR',
          householdId: 'hh_vance',
          householdRule: 'TOGETHER_ALWAYS',
          partnerName: 'Sister Camille Vance',
        },
        {
          personId: 'vol_naomi',
          personName: 'Naomi Osei',
          roleSkills: ['Nursery Lead', 'Kids Check-In', 'Elementary Teacher'],
          backgroundCheckStatus: 'CLEARED',
          backgroundClearedAt: '2026-03-10',
          backgroundExpiresAt: '2028-03-10',
          provider: 'CHECKR',
          householdRule: 'INDEPENDENT',
        },
        {
          personId: 'vol_marcus',
          personName: 'Marcus Sterling',
          roleSkills: ['Youth Mentor', 'Acoustic Guitar', 'Greeter'],
          backgroundCheckStatus: 'PENDING',
          provider: 'CHECKR',
          householdRule: 'INDEPENDENT',
        },
      ]
    : [];

  const blockouts: VolunteerBlockoutRange[] = demo
    ? [
        {
          id: 'blk_1',
          personId: 'vol_camille',
          personName: 'Sister Camille Vance',
          startISO: '2026-11-14',
          endISO: '2026-11-16',
          reason: 'Regional Choral Symposium out of town',
        },
      ]
    : [];

  const matrixSlots: MatrixPositionSlot[] = [
    {
      id: 'mslot_worship_lead',
      teamName: 'Worship & Stage',
      positionTitle: 'Worship Vocal / Choir Director',
      requiresBackgroundCheck: false,
      requiredSkill: 'Vocals',
      assignmentsByDate: demo
        ? {
            '2026-11-01': { personId: 'vol_camille', personName: 'Sister Camille Vance', status: 'CONFIRMED' },
            '2026-11-08': { personId: 'vol_camille', personName: 'Sister Camille Vance', status: 'CONFIRMED' },
            '2026-11-15': null,
            '2026-11-22': { personId: 'vol_camille', personName: 'Sister Camille Vance', status: 'PENDING' },
          }
        : {},
    },
    {
      id: 'mslot_foh_audio',
      teamName: 'Production & Broadcast',
      positionTitle: 'FOH Audio & Ambo Stage Operator',
      requiresBackgroundCheck: false,
      requiredSkill: 'FOH Audio',
      assignmentsByDate: demo
        ? {
            '2026-11-01': { personId: 'vol_devon', personName: 'Devon Vance', status: 'CONFIRMED' },
            '2026-11-08': { personId: 'vol_devon', personName: 'Devon Vance', status: 'CONFIRMED' },
            '2026-11-15': null,
            '2026-11-22': null,
          }
        : {},
    },
    {
      id: 'mslot_kids_lead',
      teamName: 'NextGen & Kids Safety',
      positionTitle: 'Nursery & Room 204 Classroom Lead',
      requiresBackgroundCheck: true,
      requiredSkill: 'Nursery Lead',
      assignmentsByDate: demo
        ? {
            '2026-11-01': { personId: 'vol_naomi', personName: 'Naomi Osei', status: 'CONFIRMED' },
            '2026-11-08': { personId: 'vol_naomi', personName: 'Naomi Osei', status: 'CONFIRMED' },
            '2026-11-15': { personId: 'vol_naomi', personName: 'Naomi Osei', status: 'PENDING' },
            '2026-11-22': null,
          }
        : {},
    },
  ];

  const ratioZones: ClassroomRatioZone[] = [
    {
      id: 'zone_nursery_a',
      roomName: 'Sprouts Nursery (Room 101)',
      ageOrGradeBand: 'Ages 0–2',
      maxCapacity: 8,
      requiredChildrenPerAdult: 4, // 1:4 strict infant/toddler ratio
      activeAdults: 2,
      overflowRoomId: 'zone_elementary_b',
      checkedInChildren: demo
        ? [
            {
              id: 'chk_1',
              childName: 'Micah Sterling',
              ageLabel: '18 mos',
              securityCode: 'K7P4',
              guardianName: 'Elena & Marcus Sterling',
              guardianMaskedPhone: '•••-•••-8821',
              allergies: 'Peanuts & Tree Nuts',
              checkedInAt: '08:52 AM',
            },
            {
              id: 'chk_2',
              childName: 'Zion Osei',
              ageLabel: '2 yrs',
              securityCode: 'M9R2',
              guardianName: 'Naomi Osei',
              guardianMaskedPhone: '•••-•••-2044',
              checkedInAt: '08:55 AM',
            },
          ]
        : [],
    },
    {
      id: 'zone_elementary_b',
      roomName: 'Kingdom Explorers (Room 204)',
      ageOrGradeBand: 'Grades K–5',
      maxCapacity: 24,
      requiredChildrenPerAdult: 8, // 1:8 elementary ratio
      activeAdults: 3,
      checkedInChildren: demo
        ? [
            {
              id: 'chk_3',
              childName: 'Aria Vance',
              ageLabel: 'Grade 3',
              securityCode: 'T4W8',
              guardianName: 'Camille & Devon Vance',
              guardianMaskedPhone: '•••-•••-5190',
              checkedInAt: '08:50 AM',
            },
          ]
        : [],
    },
  ];

  const workflows: ElevateAutomatedWorkflow[] = [
    {
      id: 'wf_newcomer_assimilation',
      title: 'Newcomer & Member Assimilation Pipeline',
      description: 'Multi-step automated pathway from first-time guest card to active team/ministry placement.',
      triggerLabel: 'First-Time Visitor Check-In or Digital Connect TelaForm',
      stages: [
        { id: 'st_1', order: 1, title: '24h Welcome Note & Digital Guide', actionKind: 'AUTO_EMAIL_NOTIFY', ownerRole: 'Hospitality Bot + Pastor', slaHours: 24 },
        { id: 'st_2', order: 2, title: 'Personal Coffee / Phone Check-In', actionKind: 'ASSIGN_CALL_TASK', ownerRole: 'Assimilation Lead', slaHours: 72 },
        { id: 'st_3', order: 3, title: 'Foundations Class & Gifts Assessment', actionKind: 'VERIFY_WAIVER_OR_BG', ownerRole: 'Education Director', slaHours: 168 },
        { id: 'st_4', order: 4, title: 'Active Team / Group Placement', actionKind: 'COMPLETE_PLACEMENT', ownerRole: 'Ministry Head', slaHours: 336 },
      ],
      cards: demo
        ? [
            {
              id: 'wfc_1',
              personName: 'Jordan & Maya Lin',
              personEmail: 'jordan.lin@example.org',
              currentStageId: 'st_2',
              startedAtISO: '2026-10-24',
              completedStageIds: ['st_1'],
              mappedProfileFields: { Interests: 'Music & Youth Mentoring', Household: '2 Adults, 1 Child', ShirtSize: 'L' },
              eSignatureStamp: 'Signed via TelaForm · 2026-10-24',
            },
            {
              id: 'wfc_2',
              personName: 'malik.t@example.org (Malik Thompson)',
              personEmail: 'malik.t@example.org',
              currentStageId: 'st_3',
              startedAtISO: '2026-10-18',
              completedStageIds: ['st_1', 'st_2'],
              mappedProfileFields: { Skills: 'Broadcast Camera & Video Editing', Allergies: 'None' },
              eSignatureStamp: 'Signed via TelaForm · 2026-10-18',
            },
          ]
        : [],
    },
  ];

  const retreats: ElevateRetreatEvent[] = [
    {
      id: 'ret_winter_summit',
      title: org.orgType === 'CULTURAL' ? 'Annual Fellows & Curators Retreat' : 'Winter Youth & Young Adults Summit',
      datesLabel: 'Nov 13–15, 2026 · 3 Days / 2 Nights',
      location: 'Blue Ridge Conference & Retreat Center',
      basePriceUsd: 350,
      depositRequiredUsd: 75,
      lodgingUnits: [
        { id: 'cab_pine_a', name: 'Pine Ridge Cabin A', kind: 'CABIN', capacity: 12, genderOrAgeRule: 'High School Girls', leaderName: 'Naomi Osei' },
        { id: 'cab_oak_b', name: 'Oak Creek Cabin B', kind: 'CABIN', capacity: 12, genderOrAgeRule: 'High School Boys', leaderName: 'Devon Vance' },
        { id: 'bus_charter_1', name: 'Coach Bus #1 (Main Sanctuary Departure)', kind: 'BUS_SHUTTLE', capacity: 48, genderOrAgeRule: 'All Registrants', leaderName: 'Marcus Sterling' },
      ],
      registrants: demo
        ? [
            {
              id: 'reg_1',
              attendeeName: 'Chloe Henderson',
              ageOrGrade: 'Grade 11',
              totalFeeUsd: 350,
              depositPaidUsd: 75,
              installmentsPaidUsd: 175,
              scholarshipUsd: 50,
              waiverSigned: true,
              waiverSigner: 'Sarah Henderson (Parent E-Sign)',
              dietaryOrAllergy: 'Gluten-Free',
              tshirtSize: 'M',
              assignedCabinId: 'cab_pine_a',
              assignedBusId: 'bus_charter_1',
            },
            {
              id: 'reg_2',
              attendeeName: 'Caleb Vance',
              ageOrGrade: 'Grade 10',
              totalFeeUsd: 350,
              depositPaidUsd: 75,
              installmentsPaidUsd: 275,
              scholarshipUsd: 0,
              waiverSigned: true,
              waiverSigner: 'Devon Vance (Parent E-Sign)',
              dietaryOrAllergy: 'None',
              tshirtSize: 'L',
              assignedCabinId: 'cab_oak_b',
              assignedBusId: 'bus_charter_1',
            },
          ]
        : [],
    },
  ];

  const runOfShowCues: LiveRunOfShowCue[] = [
    {
      id: 'cue_1',
      order: 1,
      title: '5-Minute Pre-Service Sanctuary Countdown & Walk-In Loop',
      category: 'COUNTDOWN',
      plannedDurationSec: 300,
      actualElapsedSec: 300,
      performerNotes: 'House lights at 40%; NDI wall displaying Welcome QR.',
    },
    {
      id: 'cue_2',
      order: 2,
      title: 'Holy, Holy, Holy! Lord God Almighty',
      category: 'WORSHIP_SONG',
      plannedDurationSec: 270,
      actualElapsedSec: 285,
      songKey: 'D',
      bpm: 92,
      ccliNumber: '1156',
      chordProLines: [
        '[D]Holy, [Bm]holy, [A]ho - [D]ly! [G]Lord God Al - [D]migh - ty!',
        '[A]Early in the [D]morn - [Bm]ing our [E7]song shall rise to [A]Thee;',
        '[D]Holy, [Bm]holy, [A]ho - [D]ly! [G]Merciful and [D]migh - ty!',
        '[Bm]God in three [F#m]Per - [G]sons, [Em]blessed [A7]Trin - i - [D]ty!',
      ],
      performerNotes: 'Brass & organ fanfare on final stanza; modulate to Eb on tag.',
    },
    {
      id: 'cue_3',
      order: 3,
      title: 'Altar of Living Stones (Collective Original)',
      category: 'WORSHIP_SONG',
      plannedDurationSec: 330,
      songKey: 'Eb',
      bpm: 74,
      ccliNumber: '7210492',
      chordProLines: [
        '[Eb]Before a single word is [Abmaj7]spoken in this room',
        '[Cm7]Your mercy rises like the [Bb]morning over gloom',
        '[Fm7]We lay our crowns beside the [Eb]threshold of Your grace',
        '[Ab]Living stones gathered in this [Bb]holy [Eb]place',
      ],
      performerNotes: 'Spontaneous prayer underscore at end of Bridge.',
    },
    {
      id: 'cue_4',
      order: 4,
      title: 'Scripture Reading & Keynote Message (Isaiah 40:31)',
      category: 'KEYNOTE_MESSAGE',
      plannedDurationSec: 2100,
      performerNotes: 'Fire Ambo Follow-Along Scripture cues to pews + lower thirds.',
    },
  ];

  const nonCashGifts: NonCashAssetGift[] = demo
    ? [
        {
          id: 'nc_1',
          donorName: 'Dr. Arthur & Evelyn Pendelton',
          donorAddress: '1140 Peachtree Battle Ave NW, Atlanta, GA 30327',
          dateReceivedISO: '2026-10-15',
          assetKind: 'PUBLIC_STOCK',
          assetDescription: '50 shares of Microsoft Corp. (MSFT) common stock transferred via DTC brokerage',
          tickerOrIdentifier: 'MSFT',
          shareOrUnitCount: 50,
          fundName: 'Building & Sanctuary Endowment Fund',
          internalEstimatedValueUsd: 21400,
          irsReceiptGenerated: true,
        },
      ]
    : [];

  return {
    orgId: org.id,
    rooms,
    resources,
    reservations,
    matrixDates,
    blockouts,
    safetyRecords,
    matrixSlots,
    ratioZones,
    guardianPages: [],
    workflows,
    retreats,
    runOfShowCues,
    nonCashGifts,
    updatedAt: Date.now(),
  };
}

export function loadCompoundBundle(org: Organization): ElevateCompoundBundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(org.id));
    if (raw) {
      const parsed = JSON.parse(raw) as ElevateCompoundBundle;
      if (parsed && parsed.orgId === org.id) return parsed;
    }
  } catch {
    /* ignore */
  }
  return createDefaultCompoundBundle(org);
}

export function saveCompoundBundle(bundle: ElevateCompoundBundle): void {
  try {
    localStorage.setItem(
      STORAGE_KEY(bundle.orgId),
      JSON.stringify({ ...bundle, updatedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}
