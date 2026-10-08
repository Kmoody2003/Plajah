import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Appointment, AppointmentStatus, AppointmentType } from '../types/clinic';

const LOCAL_STORAGE_KEY = 'plajah_appointments_cache';

// Rich demo appointments to showcase out of the box
const DEFAULT_DEMO_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-001',
    businessId: 'demo-health-clinic',
    patientName: 'Elena Rostova',
    patientEmail: 'elena.rostova@example.com',
    patientPhone: '(415) 555-0143',
    patientDob: '1989-05-14',
    providerId: 'dr-vance',
    providerName: 'Dr. Marcus Vance, MD',
    serviceId: 'srv-telehealth-eval',
    serviceName: 'Virtual Telehealth Follow-up (Hypertension)',
    scheduledDate: new Date().toISOString().split('T')[0],
    startTime: '09:30',
    endTime: '10:00',
    durationMinutes: 30,
    type: 'TELEHEALTH',
    telehealthRoomId: 'telehealth-elena-001',
    status: 'CONFIRMED',
    chiefComplaint: 'Follow-up on lisinopril 10mg dosage and home BP readings averaging 138/86.',
    price: 95,
    paymentStatus: 'PAID',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'apt-002',
    businessId: 'demo-health-clinic',
    patientName: 'David K. Miller',
    patientEmail: 'david.miller@example.com',
    patientPhone: '(415) 555-0189',
    patientDob: '1976-11-22',
    providerId: 'dr-chen-dds',
    providerName: 'Dr. Sarah Chen, DDS',
    serviceId: 'srv-dental-exam',
    serviceName: 'Comprehensive Oral Exam & Odontogram',
    scheduledDate: new Date().toISOString().split('T')[0],
    startTime: '10:30',
    endTime: '11:15',
    durationMinutes: 45,
    type: 'IN_PERSON',
    status: 'CHECKED_IN',
    chiefComplaint: 'Sensitivity to cold liquids on lower right molar (#19) for past 2 weeks.',
    price: 185,
    paymentStatus: 'INSURANCE_PENDING',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 1800000,
  },
  {
    id: 'apt-003',
    businessId: 'demo-health-clinic',
    patientName: 'Maya Patel',
    patientEmail: 'maya.patel@example.com',
    patientPhone: '(415) 555-0271',
    patientDob: '2001-03-08',
    providerId: 'dr-vance',
    providerName: 'Dr. Marcus Vance, MD',
    serviceId: 'srv-urgent-tele',
    serviceName: 'Telehealth Acute Consult (Rash & Allergies)',
    scheduledDate: new Date().toISOString().split('T')[0],
    startTime: '13:00',
    endTime: '13:20',
    durationMinutes: 20,
    type: 'TELEHEALTH',
    telehealthRoomId: 'telehealth-maya-003',
    status: 'SCHEDULED',
    chiefComplaint: 'Mild contact dermatitis rash after using new laundry detergent.',
    price: 75,
    paymentStatus: 'PAID',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'apt-004',
    businessId: 'demo-health-clinic',
    patientName: 'Marcus Aurelius Brooks',
    patientEmail: 'marcus.brooks@example.com',
    patientPhone: '(415) 555-0922',
    patientDob: '1962-08-30',
    providerId: 'dr-chen-dds',
    providerName: 'Dr. Sarah Chen, DDS',
    serviceId: 'srv-dental-crown',
    serviceName: 'Crown Prep & Temp Placement (Tooth #14)',
    scheduledDate: new Date().toISOString().split('T')[0],
    startTime: '14:30',
    endTime: '15:30',
    durationMinutes: 60,
    type: 'IN_PERSON',
    status: 'SCHEDULED',
    chiefComplaint: 'Fractured mesial-lingual cusp on upper left molar.',
    price: 450,
    paymentStatus: 'UNPAID',
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 4,
  },
];

function getLocalStore(): Appointment[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // fallback
  }
  return DEFAULT_DEMO_APPOINTMENTS;
}

function saveLocalStore(items: Appointment[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    // ignore
  }
}

export async function fetchAppointmentsForBusiness(businessId: string): Promise<Appointment[]> {
  try {
    if (db) {
      const q = query(
        collection(db, 'appointments'),
        where('businessId', '==', businessId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
      }
    }
  } catch (err) {
    console.warn('Firestore fetchAppointments failed, using local store', err);
  }

  // Fallback to local store
  const local = getLocalStore();
  return local.filter(a => a.businessId === businessId || businessId === 'demo' || a.businessId === 'demo-health-clinic');
}

export async function saveAppointment(apt: Partial<Appointment>): Promise<Appointment> {
  const now = Date.now();
  const id = apt.id || `apt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const fullApt: Appointment = {
    id,
    businessId: apt.businessId || 'demo-health-clinic',
    patientName: apt.patientName || 'New Patient',
    patientEmail: apt.patientEmail || '',
    patientPhone: apt.patientPhone || '',
    patientDob: apt.patientDob,
    providerId: apt.providerId || 'dr-primary',
    providerName: apt.providerName || 'Primary Care Provider',
    serviceId: apt.serviceId || 'consult',
    serviceName: apt.serviceName || 'General Consultation',
    scheduledDate: apt.scheduledDate || new Date().toISOString().split('T')[0],
    startTime: apt.startTime || '09:00',
    endTime: apt.endTime || '09:30',
    durationMinutes: apt.durationMinutes || 30,
    type: apt.type || 'IN_PERSON',
    telehealthRoomId: apt.type === 'TELEHEALTH' ? (apt.telehealthRoomId || `telehealth-${id}`) : undefined,
    status: apt.status || 'SCHEDULED',
    chiefComplaint: apt.chiefComplaint || '',
    price: apt.price ?? 100,
    paymentStatus: apt.paymentStatus || 'UNPAID',
    notes: apt.notes || '',
    createdAt: apt.createdAt || now,
    updatedAt: now,
  };

  try {
    if (db) {
      const cleanData: any = { ...fullApt };
      Object.keys(cleanData).forEach(k => {
        if (cleanData[k] === undefined) delete cleanData[k];
      });
      await setDoc(doc(db, 'appointments', id), cleanData);
    }
  } catch (err) {
    console.warn('Firestore setDoc failed, saving locally', err);
  }

  // Update local store
  const current = getLocalStore();
  const index = current.findIndex(a => a.id === id);
  if (index >= 0) {
    current[index] = fullApt;
  } else {
    current.unshift(fullApt);
  }
  saveLocalStore(current);

  return fullApt;
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
  try {
    if (db) {
      await updateDoc(doc(db, 'appointments', id), { status, updatedAt: Date.now() });
    }
  } catch (err) {
    console.warn('Firestore updateDoc failed, updating locally', err);
  }

  const current = getLocalStore();
  const item = current.find(a => a.id === id);
  if (item) {
    item.status = status;
    item.updatedAt = Date.now();
    saveLocalStore(current);
  }
}

export async function deleteAppointment(id: string): Promise<void> {
  try {
    if (db) {
      await deleteDoc(doc(db, 'appointments', id));
    }
  } catch (err) {
    console.warn('Firestore deleteDoc failed', err);
  }
  const current = getLocalStore().filter(a => a.id !== id);
  saveLocalStore(current);
}

/**
 * Universal slot generator for clinics, salons, fitness, consulting.
 * Generates slots between startHour and endHour based on durationMinutes.
 */
export function generateTimeSlots(
  startHour: number = 8,
  endHour: number = 17,
  durationMinutes: number = 30
): { startTime: string; endTime: string }[] {
  const slots: { startTime: string; endTime: string }[] = [];
  let currentMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  while (currentMinutes + durationMinutes <= endMinutes) {
    const sH = Math.floor(currentMinutes / 60);
    const sM = currentMinutes % 60;
    const eH = Math.floor((currentMinutes + durationMinutes) / 60);
    const eM = (currentMinutes + durationMinutes) % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    slots.push({
      startTime: `${pad(sH)}:${pad(sM)}`,
      endTime: `${pad(eH)}:${pad(eM)}`,
    });

    currentMinutes += durationMinutes;
  }

  return slots;
}
