// ============================================================
// Plajah Academia — Teacher account + assignment library types
// Single source of truth for both client and Cloud Functions.
// ============================================================

export type PersonaKind = "district" | "independent";

export interface TeacherUser {
  role: "teacher";
  displayName: string;
  personas: {
    district?: DistrictPersona;
    independent?: IndependentPersona;
  };
  integritySettings: IntegritySettings;
}

export interface DistrictPersona {
  active: boolean;
  districtId: string;
  schoolIds: string[];
  verifiedAt: number; // epoch ms
}

export interface IndependentPersona {
  active: boolean;
  creatorId: string;
  payoutAccountId: string;
  activatedAt: number;
}

export interface IntegritySettings {
  /** "auto" = geofence + schedule fence; "manual" = teacher toggles;
   *  "off" only allowed when no active district persona. */
  campusSilentMode: "auto" | "manual" | "off";
  geofences: Geofence[];
  scheduleFence: ScheduleFence;
  disclosureAcknowledged: number | null;
}

export interface Geofence {
  schoolId: string;
  lat: number;
  lng: number;
  radiusMeters: number; // recommend 150-300m
}

export interface ScheduleFence {
  enabled: boolean;
  timezone: string; // IANA, e.g. "America/Detroit"
  contractHours: Array<{
    day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
    start: string; // "07:30"
    end: string;   // "15:45"
  }>;
}

/** Roster entries are salted hashes — raw student identity never
 *  touches Plajah servers. See functions/src/hash.ts. */
export interface RosterDoc {
  districtId: string;
  schoolId: string;
  students: string[]; // sha256(salt + normalizedStudentRef)
  expiresAt: number;  // term end — conflict dies with grading power
}

export type SilentModeTrigger = "geofence" | "schedule" | "network" | "manual";

export interface IntegrityEvent {
  at: number;
  kind: "silent_enter" | "silent_exit" | "disclosure_ack" | "conflict_block";
  trigger?: SilentModeTrigger;
  schoolId?: string;
}

// ---------------- Library & licensing ----------------

export type License = "PD" | "CC-BY" | "CC-BY-SA" | "CC-BY-NC" | "CC-BY-NC-SA";

export interface LibraryItem {
  source: string;        // "OpenStax", "Project Gutenberg", ...
  sourceUrl: string;
  license: License;
  commercialOk: boolean; // derived — see licenseGate.ts
  shareAlike: boolean;
  attribution: string;   // pre-composed, rendered wherever item appears
  subjects: Subject[];
  gradeBands: GradeBand[];
  standards: StandardRef[];
  title: string;
  format: "textbook" | "chapter" | "exercise-set" | "reading" | "primary-source";
}

export interface StandardRef {
  framework: "CCSS" | "NGSS" | "PISA";
  code: string;   // "CCSS.MATH.6.RP.A.1" | "MS-PS1-1" | "PISA.MATH.L4"
  label?: string;
}

// ---------------- Assignment templates ----------------

export type Subject = "ela" | "math" | "science" | "socialStudies" | "worldLang" | "arts";
export type GradeBand = "K-2" | "3-5" | "6-8" | "9-12";
export type TaskType =
  | "practiceSet" | "readingResponse" | "labReport" | "essay"
  | "projectBrief" | "exitTicket" | "quiz" | "discussion";

export interface AssignmentTemplate {
  ownerUid: string;
  subject: Subject;
  gradeBand: GradeBand;
  taskType: TaskType;
  visibility: "private" | "public";
  /** true when packaged into a paid Independent-persona course.
   *  Requires licenseValidated (server-checked: CC-BY / PD materials only). */
  commercialUse: boolean;
  licenseValidated: boolean;
  structure: {
    title: string;
    objective: string;
    standardsAlignment: StandardRef[];
    materials: string[]; // libraryItem ids — filtered by license gate
    steps: string[];
    differentiation: { support: string; extension: string };
    rubric: Rubric;
    estimatedMinutes: number;
  };
  remixOf: string | null; // provenance chain
  license: License;       // most restrictive of attached materials
}

export interface Rubric {
  criteria: Array<{
    name: string;
    levels: Array<{ label: string; descriptor: string; points: number }>;
  }>;
}

// ---------------- Conflict check ----------------

export interface ConflictCheckRequest {
  creatorUid: string;
  purchaserStudentHash: string; // hashed client-side w/ platform salt
  offeringType: "tutoring" | "course" | "workshop" | "event";
}

export interface ConflictCheckResponse {
  blocked: boolean;
  reason?: "ROSTER_MATCH";
}
