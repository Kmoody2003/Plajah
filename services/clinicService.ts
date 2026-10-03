import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import type {
  ClinicalSoapNote,
  PatientIntakeForm,
  ToothRecord,
  Superbill,
  AuditLogEntry,
  EducationalPrescription,
} from '../types/clinic';
import { ROSTER, RosterCourse } from '../data/lawMedicineRoster';

const SOAP_STORAGE_KEY = 'plajah_soap_notes_cache';
const INTAKE_STORAGE_KEY = 'plajah_intake_forms_cache';
const AUDIT_STORAGE_KEY = 'plajah_hipaa_audit_cache';

// Seed demo SOAP notes
const DEFAULT_DEMO_SOAP_NOTES: ClinicalSoapNote[] = [
  {
    id: 'soap-001',
    appointmentId: 'apt-001',
    businessId: 'demo-health-clinic',
    patientName: 'Elena Rostova',
    providerId: 'dr-vance',
    providerName: 'Dr. Marcus Vance, MD',
    encounterDate: new Date().toISOString().split('T')[0],
    encounterType: 'TELEHEALTH',
    subjective: {
      chiefComplaint: 'Follow-up hypertension and mild fatigue on lisinopril 10mg.',
      hpi: 'Patient is a 37-year-old female presenting via telehealth for 3-month blood pressure review. Reports taking lisinopril 10mg daily in the morning. Home automated cuff readings over past 14 days average 138/86 mmHg. Denies chest pain, shortness of breath, visual disturbances, or peripheral edema. Reports occasional dizziness when standing up quickly.',
      onset: '3 months ago',
      character: 'Asymptomatic hypertension, mild postural lightheadedness',
      severity: 3,
    },
    objective: {
      vitals: {
        bpSystolic: 136,
        bpDiastolic: 84,
        heartRate: 72,
        respiratoryRate: 16,
        temperatureF: 98.4,
        o2Saturation: 99,
        weightLbs: 148,
        heightInches: 66,
        bmi: 23.9,
      },
      physicalExamFindings: 'Telehealth inspection: Patient appears alert, energetic, in no acute distress. Well-hydrated. Speech fluent and clear. No respiratory effort visible. Peripheral extremity inspection via camera shows no gross ankle swelling.',
    },
    assessment: {
      diagnoses: [
        { code: 'I10', description: 'Essential (primary) hypertension, moderately controlled', type: 'PRIMARY' },
        { code: 'R42', description: 'Mild orthostatic dizziness, likely secondary to ACE inhibitor timing', type: 'SECONDARY' },
      ],
      clinicalRationale: 'Blood pressure is improved from baseline 152/96 but remains slightly above ACC/AHA target of <130/80. Dizziness is consistent with orthostasis; recommend taking dose at bedtime and increasing hydration.',
    },
    plan: {
      ordersAndTreatment: 'Maintain lisinopril 10mg once daily; shift ingestion time to bedtime (QHS) to avoid daytime postural drops. Basic Metabolic Panel (BMP) ordered to monitor creatinine and potassium.',
      prescriptions: [
        { drugName: 'Lisinopril 10 MG Oral Tablet', sig: 'Take 1 tablet by mouth daily at bedtime', quantity: '90 tablets', refills: 3 },
      ],
      educationalPrescriptions: [
        {
          courseId: 'med-clin-fm',
          lessonId: 'med-clin-fm.l04',
          title: 'Primary Prevention and Hypertension Management',
          blurb: 'Dietary sodium reduction, DASH diet protocols, and home BP tracking best practices.',
          assignedAt: Date.now(),
        },
      ],
      followUp: 'Repeat telehealth follow-up in 8 weeks with 2-week home BP log.',
      patientInstructions: 'Hydrate with at least 2L of water daily. Stand up gradually from lying down. Log BP morning and evening.',
    },
    isLocked: true,
    lockedAt: Date.now() - 3600000,
    signedBy: 'Dr. Marcus Vance, MD (NPI: 1982736451)',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 3600000,
  },
];

// Seed demo Intake forms
const DEFAULT_DEMO_INTAKE: PatientIntakeForm[] = [
  {
    id: 'intake-001',
    appointmentId: 'apt-002',
    businessId: 'demo-health-clinic',
    patientName: 'David K. Miller',
    dob: '1976-11-22',
    gender: 'Male',
    phone: '(415) 555-0189',
    email: 'david.miller@example.com',
    address: '420 Pine St, Apt 3B, San Francisco, CA',
    emergencyContact: {
      name: 'Sarah Miller',
      phone: '(415) 555-0190',
      relationship: 'Spouse',
    },
    chiefComplaint: 'Sharp pain in lower right tooth when drinking cold water or chewing granola.',
    allergies: ['Penicillin (Hives)', 'Sulfa drugs (Nausea)'],
    currentMedications: [
      { name: 'Atorvastatin', dosage: '20mg', frequency: 'Daily' },
      { name: 'Multivitamin', dosage: '1 tablet', frequency: 'Daily' },
    ],
    pastMedicalHistory: ['Hyperlipidemia', 'Mild GERD'],
    surgicalHistory: ['Appendectomy (2004)', 'Knee Arthroscopy (2018)'],
    hasDentalAnxiety: true,
    insuranceProvider: 'Delta Dental Premier',
    policyNumber: 'DD-8849201',
    groupNumber: 'GRP-994',
    consentSigned: true,
    consentSignerName: 'David K. Miller',
    consentDate: new Date().toISOString().split('T')[0],
    createdAt: Date.now() - 86400000,
  },
];

// In-memory fallbacks for node/testing environments
let inMemoryAuditLogs: AuditLogEntry[] = [];
let inMemorySoapNotes: ClinicalSoapNote[] = [...DEFAULT_DEMO_SOAP_NOTES];
let inMemoryIntakeForms: PatientIntakeForm[] = [...DEFAULT_DEMO_INTAKE];

export async function fetchSoapNotesForBusiness(businessId: string): Promise<ClinicalSoapNote[]> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SOAP_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {}
  return inMemorySoapNotes;
}

export async function getSoapNoteByAppointmentId(appointmentId: string): Promise<ClinicalSoapNote | null> {
  const notes = await fetchSoapNotesForBusiness('demo');
  return notes.find(n => n.appointmentId === appointmentId) || null;
}

export async function saveSoapNote(note: ClinicalSoapNote): Promise<ClinicalSoapNote> {
  const notes = await fetchSoapNotesForBusiness(note.businessId);
  const index = notes.findIndex(n => n.id === note.id);
  if (index >= 0) {
    notes[index] = note;
  } else {
    notes.unshift(note);
  }
  inMemorySoapNotes = notes;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOAP_STORAGE_KEY, JSON.stringify(notes));
    }
  } catch (e) {}

  // Log HIPAA audit
  await logHipaaAudit({
    businessId: note.businessId,
    actorId: auth?.currentUser?.uid || 'provider-active',
    actorName: note.providerName,
    action: note.isLocked ? 'LOCK_NOTE' : 'EDIT_SOAP_NOTE',
    targetPatientName: note.patientName,
  });

  return note;
}

export async function fetchIntakeByAppointmentId(appointmentId: string): Promise<PatientIntakeForm | null> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(INTAKE_STORAGE_KEY);
      const forms: PatientIntakeForm[] = raw ? JSON.parse(raw) : DEFAULT_DEMO_INTAKE;
      return forms.find(f => f.appointmentId === appointmentId) || forms[0] || null;
    }
  } catch (e) {}
  return inMemoryIntakeForms.find(f => f.appointmentId === appointmentId) || inMemoryIntakeForms[0] || null;
}

export async function saveIntakeForm(form: PatientIntakeForm): Promise<PatientIntakeForm> {
  const idx = inMemoryIntakeForms.findIndex(f => f.id === form.id);
  if (idx >= 0) inMemoryIntakeForms[idx] = form;
  else inMemoryIntakeForms.unshift(form);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(INTAKE_STORAGE_KEY, JSON.stringify(inMemoryIntakeForms));
    }
  } catch (e) {}
  return form;
}

// ── Medical Curriculum Bridge ───────────────────────────────────────────────

/**
 * Returns available medical & clinical courses from Plajah's curriculum
 * so providers can prescribe lessons or reference clinical guides.
 */
export function getAvailableMedicalCourses(): RosterCourse[] {
  return ROSTER.filter(r => r.subject === 'medicine');
}

// ── Common ICD-10 and CPT / CDT Code Directory ──────────────────────────────

export const COMMON_ICD10_CODES = [
  { code: 'I10', desc: 'Essential (primary) hypertension' },
  { code: 'E11.9', desc: 'Type 2 diabetes mellitus without complications' },
  { code: 'J02.9', desc: 'Acute pharyngitis, unspecified' },
  { code: 'J06.9', desc: 'Acute upper respiratory infection, unspecified' },
  { code: 'K02.9', desc: 'Dental caries, unspecified' },
  { code: 'K04.0', desc: 'Pulpitis (reversible or irreversible)' },
  { code: 'K05.10', desc: 'Chronic gingivitis, plaque induced' },
  { code: 'K05.30', desc: 'Chronic periodontitis, unspecified' },
  { code: 'L20.9', desc: 'Atopic dermatitis, unspecified' },
  { code: 'M54.5', desc: 'Low back pain' },
  { code: 'R51.9', desc: 'Headache, unspecified' },
];

export const COMMON_PROCEDURE_CODES = [
  // Medical CPT
  { code: '99213', desc: 'Office/Outpatient visit, established patient, low MDM (20-29 min)', fee: 110, type: 'CPT' },
  { code: '99214', desc: 'Office/Outpatient visit, established patient, moderate MDM (30-39 min)', fee: 165, type: 'CPT' },
  { code: '99203', desc: 'Office/Outpatient visit, new patient, low MDM (30-44 min)', fee: 145, type: 'CPT' },
  { code: '99442', desc: 'Telephone evaluation and management service (11-20 min)', fee: 85, type: 'CPT' },
  // Dental CDT
  { code: 'D0120', desc: 'Periodic oral evaluation - established patient', fee: 65, type: 'CDT' },
  { code: 'D0150', desc: 'Comprehensive oral evaluation - new or established patient', fee: 95, type: 'CDT' },
  { code: 'D1110', desc: 'Prophylaxis - adult (routine cleaning)', fee: 110, type: 'CDT' },
  { code: 'D0274', desc: 'Bitewings - four radiographic images', fee: 75, type: 'CDT' },
  { code: 'D2391', desc: 'Resin-based composite - one surface, posterior', fee: 195, type: 'CDT' },
  { code: 'D2740', desc: 'Crown - porcelain/ceramic substrate', fee: 950, type: 'CDT' },
  { code: 'D3330', desc: 'Endodontic therapy, molar tooth (excluding final restoration)', fee: 1150, type: 'CDT' },
  { code: 'D4341', desc: 'Periodontal scaling and root planing - four or more teeth per quadrant', fee: 260, type: 'CDT' },
];

// ── HIPAA Audit Logger ───────────────────────────────────────────────────────

export async function logHipaaAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    device: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server',
  };

  inMemoryAuditLogs.unshift(fullEntry);
  if (inMemoryAuditLogs.length > 500) inMemoryAuditLogs.length = 500;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(inMemoryAuditLogs));
    }
  } catch (e) {}

  return fullEntry;
}

export function fetchAuditLogs(): AuditLogEntry[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {}
  return inMemoryAuditLogs;
}
