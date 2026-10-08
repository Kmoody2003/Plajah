/**
 * Clinic, Dental & Appointment OS Types for Plajah Business.
 *
 * Supports:
 * - Multi-industry Appointment Scheduling (universal across clinics, salons, trades, legal, consulting)
 * - Telehealth Virtual Visits (integrated with Plajah rtcCore WebRTC)
 * - Digital Patient Intake & Medical/Dental Questionnaires
 * - Clinician SOAP Notes with structured OLDCARTS helpers & curriculum-assisted diagnosis
 * - Interactive 32-Tooth Dental Odontogram (Adult & Pediatric)
 * - Superbills (CPT, CDT, ICD-10) for insurance reimbursement
 * - HIPAA-grade tamper-evident audit logging
 */

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentType = 'IN_PERSON' | 'TELEHEALTH';

export interface Appointment {
  id: string;
  businessId: string;
  customerId?: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientDob?: string;
  providerId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string;     // HH:MM (24-hr)
  endTime: string;       // HH:MM (24-hr)
  durationMinutes: number;
  type: AppointmentType;
  telehealthRoomId?: string;
  status: AppointmentStatus;
  intakeFormId?: string;
  clinicalNoteId?: string;
  chiefComplaint?: string;
  price?: number;
  paymentStatus?: 'UNPAID' | 'PAID' | 'INSURANCE_PENDING';
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PatientIntakeForm {
  id: string;
  appointmentId?: string;
  businessId: string;
  patientName: string;
  dob: string;
  gender?: string;
  phone: string;
  email: string;
  address?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  chiefComplaint: string;
  historyOfPresentIllness?: string;
  allergies: string[];
  currentMedications: {
    name: string;
    dosage?: string;
    frequency?: string;
  }[];
  pastMedicalHistory: string[];
  surgicalHistory: string[];
  familyHistory?: string;
  hasDentalAnxiety?: boolean;
  insuranceProvider?: string;
  policyNumber?: string;
  groupNumber?: string;
  consentSigned: boolean;
  consentSignerName?: string;
  consentDate?: string;
  createdAt: number;
}

export type ToothSurface = 'M' | 'O' | 'D' | 'B' | 'L'; // Mesial, Occlusal/Incisal, Distal, Buccal/Facial, Lingual

export type DentalCondition =
  | 'HEALTHY'
  | 'CARIES'
  | 'RESTORED'
  | 'CROWN'
  | 'MISSING'
  | 'ROOT_CANAL'
  | 'IMPLANT'
  | 'WATCH';

export interface ToothRecord {
  toothNumber: number | string; // 1-32 or A-T
  condition: DentalCondition;
  surfaces: ToothSurface[];
  periodontalPocketMm?: number; // 1-12
  notes?: string;
  updatedAt: number;
}

export interface EducationalPrescription {
  courseId: string;
  lessonId?: string;
  title: string;
  blurb?: string;
  assignedAt: number;
  patientViewed?: boolean;
}

export interface ClinicPrescription {
  drugName: string;
  sig: string;         // e.g. "Take 1 tablet by mouth every 8 hours as needed for pain"
  quantity: string;    // e.g. "20 tablets"
  refills: number;
}

export interface ClinicalSoapNote {
  id: string;
  appointmentId: string;
  businessId: string;
  patientId?: string;
  patientName: string;
  providerId: string;
  providerName: string;
  encounterDate: string;
  encounterType: 'TELEHEALTH' | 'IN_PERSON' | 'DENTAL_EXAM' | 'PROCEDURE';
  
  // Subjective
  subjective: {
    chiefComplaint: string;
    hpi: string;
    onset?: string;
    location?: string;
    duration?: string;
    character?: string;
    aggravating?: string;
    relieving?: string;
    timing?: string;
    severity?: number; // 1-10
    reviewOfSystems?: Record<string, boolean | string>;
  };

  // Objective
  objective: {
    vitals?: {
      bpSystolic?: number;
      bpDiastolic?: number;
      heartRate?: number;
      respiratoryRate?: number;
      temperatureF?: number;
      o2Saturation?: number;
      weightLbs?: number;
      heightInches?: number;
      bmi?: number;
    };
    physicalExamFindings?: string;
    dentalChartSnapshot?: Record<string, ToothRecord>;
  };

  // Assessment
  assessment: {
    diagnoses: {
      code?: string; // ICD-10
      description: string;
      type: 'PRIMARY' | 'SECONDARY';
    }[];
    clinicalRationale?: string;
  };

  // Plan
  plan: {
    ordersAndTreatment: string;
    prescriptions: ClinicPrescription[];
    educationalPrescriptions: EducationalPrescription[];
    followUp: string;
    patientInstructions: string;
  };

  isLocked: boolean;
  lockedAt?: number;
  signedBy?: string;
  billingSuperbill?: Superbill;
  createdAt: number;
  updatedAt: number;
}

export interface Superbill {
  id: string;
  appointmentId: string;
  businessId: string;
  patientName: string;
  providerName: string;
  providerNpi?: string;
  clinicTaxId?: string;
  dateOfService: string;
  icd10Codes: { code: string; desc: string }[];
  procedureCodes: {
    code: string; // CPT or CDT
    desc: string;
    units: number;
    fee: number;
  }[];
  totalBilled: number;
  patientPaid: number;
  balanceDue: number;
  notes?: string;
}

export interface AuditLogEntry {
  id: string;
  businessId: string;
  actorId: string;
  actorName: string;
  action:
    | 'VIEW_PATIENT_CHART'
    | 'CREATE_SOAP_NOTE'
    | 'EDIT_SOAP_NOTE'
    | 'LOCK_NOTE'
    | 'EXPORT_SUPERBILL'
    | 'LAUNCH_TELEHEALTH'
    | 'SUBMIT_INTAKE';
  targetPatientName: string;
  timestamp: number;
  device?: string;
}
