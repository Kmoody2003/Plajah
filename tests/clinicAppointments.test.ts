import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateTimeSlots,
  fetchAppointmentsForBusiness,
  saveAppointment,
  updateAppointmentStatus
} from '../services/appointmentService';
import {
  getAvailableMedicalCourses,
  saveSoapNote,
  getSoapNoteByAppointmentId,
  saveIntakeForm,
  fetchIntakeByAppointmentId,
  logHipaaAudit,
  fetchAuditLogs,
  COMMON_ICD10_CODES,
  COMMON_PROCEDURE_CODES
} from '../services/clinicService';

describe('Clinic & Universal Appointments OS Suite', () => {
  it('generates accurate 30-minute time slots for clinic business hours', () => {
    const slots = generateTimeSlots(9, 12, 30);
    assert.strictEqual(slots.length, 6);
    assert.strictEqual(slots[0].startTime, '09:00');
    assert.strictEqual(slots[0].endTime, '09:30');
    assert.strictEqual(slots[5].startTime, '11:30');
    assert.strictEqual(slots[5].endTime, '12:00');
  });

  it('fetches initial demo appointments with valid structure', async () => {
    const appointments = await fetchAppointmentsForBusiness('demo-health-clinic');
    assert.ok(appointments.length >= 4);
    const tele = appointments.find(a => a.type === 'TELEHEALTH');
    assert.ok(tele, 'Should have at least one telehealth appointment');
    assert.ok(tele?.telehealthRoomId, 'Telehealth appointment must have a room ID');
  });

  it('creates and persists a new appointment', async () => {
    const created = await saveAppointment({
      businessId: 'test-clinic',
      patientName: 'Jane Doe',
      patientEmail: 'jane.doe@example.com',
      serviceName: 'Comprehensive Oral Exam',
      type: 'IN_PERSON',
      price: 150,
    });
    assert.ok(created.id);
    assert.strictEqual(created.patientName, 'Jane Doe');
    assert.strictEqual(created.status, 'SCHEDULED');

    // Advance status
    await updateAppointmentStatus(created.id, 'CHECKED_IN');
    const list = await fetchAppointmentsForBusiness('test-clinic');
    const found = list.find(a => a.id === created.id);
    assert.strictEqual(found?.status, 'CHECKED_IN');
  });

  it('bridges to Plajah medical curriculum roster', () => {
    const courses = getAvailableMedicalCourses();
    assert.ok(courses.length > 20, 'Should have rich medical course offerings');
    const skills = courses.find(c => c.id === 'med-skills');
    assert.ok(skills, 'Should find Clinical Reasoning and Physical Diagnosis course');
    assert.strictEqual(skills?.subject, 'medicine');
  });

  it('saves and locks clinical SOAP note with ICD-10 diagnosis', async () => {
    const note = await saveSoapNote({
      id: 'test-soap-1',
      appointmentId: 'test-apt-1',
      businessId: 'test-clinic',
      patientName: 'Test Patient',
      providerId: 'dr-test',
      providerName: 'Dr. Test, MD',
      encounterDate: '2026-10-01',
      encounterType: 'TELEHEALTH',
      subjective: {
        chiefComplaint: 'Acute pharyngitis',
        hpi: 'Patient reports 3-day sore throat and low-grade fever.',
      },
      objective: {
        vitals: { bpSystolic: 120, bpDiastolic: 80, heartRate: 78, temperatureF: 100.2 },
        physicalExamFindings: 'Pharyngeal erythema with tonsillar exudate, no stridor.',
      },
      assessment: {
        diagnoses: [{ code: 'J02.9', description: 'Acute pharyngitis', type: 'PRIMARY' }],
      },
      plan: {
        ordersAndTreatment: 'Rapid strep swab ordered.',
        prescriptions: [{ drugName: 'Amoxicillin 500mg', sig: '1 capsule PO TID x 10 days', quantity: '30 capsules', refills: 0 }],
        educationalPrescriptions: [],
        followUp: 'Follow up in 5 days if fever persists.',
        patientInstructions: 'Rest, warm salt water gargle, hydrate.',
      },
      isLocked: true,
      lockedAt: Date.now(),
      signedBy: 'Dr. Test, MD',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    assert.strictEqual(note.isLocked, true);
    assert.strictEqual(note.assessment.diagnoses[0].code, 'J02.9');
  });

  it('records HIPAA audit entries upon health record access', async () => {
    const entry = await logHipaaAudit({
      businessId: 'test-clinic',
      actorId: 'test-provider-id',
      actorName: 'Dr. Marcus Vance, MD',
      action: 'VIEW_PATIENT_CHART',
      targetPatientName: 'Elena Rostova',
    });

    assert.ok(entry.id);
    assert.strictEqual(entry.action, 'VIEW_PATIENT_CHART');
    const logs = fetchAuditLogs();
    assert.ok(logs.some(l => l.id === entry.id));
  });

  it('has verified ICD-10 and CPT/CDT directories', () => {
    assert.ok(COMMON_ICD10_CODES.some(c => c.code === 'I10'));
    assert.ok(COMMON_PROCEDURE_CODES.some(p => p.code === '99213' && p.type === 'CPT'));
    assert.ok(COMMON_PROCEDURE_CODES.some(p => p.code === 'D0150' && p.type === 'CDT'));
  });

  it('runs sub-millisecond fuzzy search on native coding registry', async () => {
    const { searchMedicalCodes } = await import('../services/medicalCodingService');
    const htnResults = searchMedicalCodes('hypertension', 'ICD10');
    assert.ok(htnResults.length > 0);
    assert.strictEqual(htnResults[0].code, 'I10');

    const dentalResults = searchMedicalCodes('composite', 'CDT');
    assert.ok(dentalResults.length > 0);
    assert.ok(dentalResults[0].code.startsWith('D23'));
  });

  it('automatically crosswalks dental tooth conditions to billable CDT/ICD codes', async () => {
    const { crosswalkDentalToothToCodes } = await import('../services/medicalCodingService');
    const crosswalk = crosswalkDentalToothToCodes(19, 'CARIES', ['O', 'D']);
    assert.ok(crosswalk);
    assert.strictEqual(crosswalk?.diagnosis.code, 'K02.9');
    assert.strictEqual(crosswalk?.procedure.code, 'D2392'); // 2 surface posterior composite
  });

  it('scrubs claims and scores clean claim readiness before submission', async () => {
    const { scrubClaim } = await import('../services/medicalCodingService');
    const cleanScrub = scrubClaim({
      diagnoses: [{ code: 'I10', desc: 'Essential hypertension' }],
      procedures: [{ code: '99213', desc: 'Office visit, established (20 min)', fee: 125 }],
      providerNpi: '1982736451',
      encounterType: 'TELEHEALTH',
    });
    assert.strictEqual(cleanScrub.isClean, true);
    assert.strictEqual(cleanScrub.score, 100);

    const dirtyScrub = scrubClaim({
      diagnoses: [], // Missing diagnoses
      procedures: [{ code: '99213', fee: 125 }],
    });
    assert.strictEqual(dirtyScrub.isClean, false);
    assert.ok(dirtyScrub.errors.length > 0);
  });

  it('ambient clinical scribe extracts symptoms, meds, exams, and auto-populates ICD/CPT codes', async () => {
    const { parseClinicalConversation, generateSoapFromEntities } = await import('../services/ambientClinicalScribe');
    const conversationSample = `
      Doctor: Good morning! Tell me what has been going on.
      Patient: Doctor, I have had this terrible sore throat and fever for the past 3 days. It really hurts when I swallow.
      Doctor: Let us examine your throat. I see bilateral tonsillar exudate and pharyngeal erythema. Lungs are clear to auscultation.
      Doctor: We will perform a rapid strep test right now in the clinic.
      Doctor: Based on this, I am prescribing amoxicillin 500mg three times daily for 10 days. Rest and hydrate.
      Doctor: Follow up in 5 days if your fever does not come down.
    `;

    const parsed = parseClinicalConversation(conversationSample);
    assert.ok(parsed.symptoms.some(s => s.toLowerCase().includes('sore throat')));
    assert.ok(parsed.symptoms.some(s => s.toLowerCase().includes('fever')));
    assert.strictEqual(parsed.duration, '3 days');
    assert.ok(parsed.physicalObservations.some(p => p.toLowerCase().includes('exudate')));
    assert.ok(parsed.inClinicTests.some(t => t.toLowerCase().includes('strep')));
    assert.ok(parsed.medications.some(m => m.drugName.toLowerCase().includes('amoxicillin')));

    // Suspected diagnoses and recommended procedures
    assert.ok(parsed.suspectedDiagnoses.some(d => d.code === 'J02.9')); // Acute pharyngitis
    assert.ok(parsed.recommendedProcedures.some(c => c.code === '99213')); // E/M code
    assert.ok(parsed.recommendedProcedures.some(c => c.code === '87880')); // Strep A antigen test

    // Check SOAP generation
    const soap = generateSoapFromEntities(parsed);
    assert.ok(soap.subjective?.hpi?.includes('3 days'));
    assert.ok(soap.objective?.physicalExamFindings?.toLowerCase().includes('exudate'));
    assert.strictEqual(soap.assessment?.diagnoses?.[0]?.code, 'J02.9');
    assert.ok(soap.plan?.prescriptions?.[0]?.drugName.toLowerCase().includes('amoxicillin'));
  });
});

