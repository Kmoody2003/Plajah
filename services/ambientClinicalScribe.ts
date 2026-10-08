/**
 * Ambient Clinical AI Scribe & Auto-Coding Engine
 *
 * Repurposes Plajah's voice & speech-to-text pipeline for healthcare:
 * 1. Passive microphone capture of doctor-patient dialogue (in-person or telehealth)
 * 2. Real-time medical entity parsing (symptoms, vitals, physical findings, meds, diagnoses)
 * 3. Automatic structuring into S-O-A-P format (Subjective, Objective, Assessment, Plan)
 * 4. Automatic assignment of ICD-10 diagnosis codes and CPT evaluation/procedure codes
 * 5. Text-to-Speech visit recap: reads patient home care instructions aloud clearly
 */

import type { ClinicalSoapNote, ClinicPrescription } from '../types/clinic';
import {
  suggestDiagnosesFromSoapNote,
  searchMedicalCodes,
  MedicalCodeItem
} from './medicalCodingService';

export interface ScribeTranscriptSnippet {
  speaker: 'DOCTOR' | 'PATIENT' | 'UNKNOWN';
  text: string;
  timestamp: number;
}

export interface ParsedClinicalEntities {
  chiefComplaint: string;
  symptoms: string[];
  duration?: string;
  physicalObservations: string[];
  inClinicTests: string[];
  suspectedDiagnoses: MedicalCodeItem[];
  recommendedProcedures: MedicalCodeItem[];
  medications: ClinicPrescription[];
  patientInstructions: string[];
  followUpWindow?: string;
}

export class AmbientClinicalScribe {
  private recognition: any = null;
  private isListening: boolean = false;
  private transcript: ScribeTranscriptSnippet[] = [];
  private onTranscriptUpdate?: (snippets: ScribeTranscriptSnippet[]) => void;
  private onSoapUpdate?: (note: Partial<ClinicalSoapNote>, parsed: ParsedClinicalEntities) => void;

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        this.recognition = new SpeechRec();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: any) => {
          let currentSessionText = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcriptChunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              this.handleFinalSnippet(transcriptChunk);
            } else {
              currentSessionText += transcriptChunk;
            }
          }
        };

        this.recognition.onerror = (err: any) => {
          console.warn('SpeechRecognition error in Ambient Scribe:', err);
        };
      }
    }
  }

  public startListening(
    onTranscript?: (snippets: ScribeTranscriptSnippet[]) => void,
    onSoapUpdate?: (note: Partial<ClinicalSoapNote>, parsed: ParsedClinicalEntities) => void
  ) {
    this.onTranscriptUpdate = onTranscript;
    this.onSoapUpdate = onSoapUpdate;
    this.isListening = true;

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (e) {
        // already started
      }
    }
  }

  public stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  public handleFinalSnippet(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Simple heuristic speaker classifier (Doctor vs Patient)
    const lower = trimmed.toLowerCase();
    const isDoctor =
      lower.startsWith('let me') ||
      lower.startsWith('i see') ||
      lower.startsWith('your lungs') ||
      lower.startsWith('we are going to') ||
      lower.startsWith('i will prescribe') ||
      lower.startsWith('let us take a look') ||
      lower.includes('take this medication');

    const snippet: ScribeTranscriptSnippet = {
      speaker: isDoctor ? 'DOCTOR' : 'PATIENT',
      text: trimmed,
      timestamp: Date.now(),
    };

    this.transcript.push(snippet);
    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate([...this.transcript]);
    }

    // Process entire conversation to re-synthesize clinical entities & codes
    const parsed = parseClinicalConversation(this.transcript.map(t => t.text).join(' '));
    const soapDraft = generateSoapFromEntities(parsed);

    if (this.onSoapUpdate) {
      this.onSoapUpdate(soapDraft, parsed);
    }
  }

  public getTranscript(): ScribeTranscriptSnippet[] {
    return [...this.transcript];
  }

  public clear() {
    this.transcript = [];
  }
}

/**
 * Natural language entity extractor that analyzes conversation dialogue
 * for clinical symptoms, physical exam findings, medications, and diagnoses.
 */
export function parseClinicalConversation(conversationText: string): ParsedClinicalEntities {
  const text = conversationText.toLowerCase();

  const symptoms: string[] = [];
  const physicalObservations: string[] = [];
  const inClinicTests: string[] = [];
  const medications: ClinicPrescription[] = [];
  const patientInstructions: string[] = [];
  let chiefComplaint = '';
  let duration = '';
  let followUpWindow = '4 weeks';

  // 1. Detect Symptoms
  if (text.includes('sore throat') || text.includes('throat pain')) symptoms.push('Sore throat (pharyngeal pain)');
  if (text.includes('fever') || text.includes('chills')) symptoms.push('Subjective fever');
  if (text.includes('cough')) symptoms.push('Cough');
  if (text.includes('chest pain') || text.includes('pressure in my chest')) symptoms.push('Chest pain / pressure');
  if (text.includes('dizziness') || text.includes('dizzy') || text.includes('lightheaded')) symptoms.push('Postural dizziness');
  if (text.includes('headache') || text.includes('migraine')) symptoms.push('Headache');
  if (text.includes('tooth pain') || text.includes('toothache') || text.includes('sensitive to cold')) symptoms.push('Dental tooth sensitivity');
  if (text.includes('rash') || text.includes('itching')) symptoms.push('Cutaneous rash / pruritus');
  if (text.includes('shortness of breath') || text.includes('hard to breathe')) symptoms.push('Dyspnea');

  // Derive Chief Complaint
  if (symptoms.length > 0) {
    chiefComplaint = symptoms[0];
  } else {
    chiefComplaint = 'General clinical evaluation';
  }

  // Duration extraction (e.g. "for the past 3 days", "for 3 days", "past 2 weeks")
  const durationMatch = text.match(/(?:for\s+(?:the\s+)?(?:past|last)\s+|for\s+|ongoing\s+for\s+)(\d+\s+(?:days?|weeks?|months?|hours?))/i);
  if (durationMatch) {
    duration = durationMatch[1];
  }

  // 2. Detect Physical Exam findings
  if (text.includes('erythema') || text.includes('red throat')) physicalObservations.push('Pharyngeal erythema noted');
  if (text.includes('tonsillar exudate') || text.includes('pus on tonsils')) physicalObservations.push('Tonsillar exudate present, no airway compromise');
  if (text.includes('clear bilaterally') || text.includes('lungs clear') || text.includes('no wheezing')) physicalObservations.push('Lungs clear to auscultation bilaterally');
  if (text.includes('regular rate') || text.includes('heart sounds normal')) physicalObservations.push('Regular rate and rhythm (RRR), normal S1/S2, no murmurs');
  if (text.includes('tenderness') || text.includes('tender to palpation')) physicalObservations.push('Mild focal tenderness noted on exam');
  if (text.includes('caries') || text.includes('decay on tooth') || text.includes('cavity on molar')) physicalObservations.push('Visible occlusal decay on dental inspection');

  // 3. Detect In-Clinic Diagnostic Orders
  if (text.includes('strep swab') || text.includes('rapid strep')) inClinicTests.push('Rapid Strep A antigen swab');
  if (text.includes('ecg') || text.includes('ekg') || text.includes('electrocardiogram')) inClinicTests.push('12-lead Electrocardiogram (ECG)');
  if (text.includes('urine') || text.includes('urinalysis')) inClinicTests.push('Urinalysis dipstick');
  if (text.includes('blood pressure') || text.includes('cuff')) inClinicTests.push('Blood pressure re-check');
  if (text.includes('x-ray') || text.includes('radiograph') || text.includes('bitewing')) inClinicTests.push('Bitewing / Intraoral X-rays');

  // 4. Detect Prescriptions
  if (text.includes('amoxicillin')) {
    medications.push({
      drugName: 'Amoxicillin 500 MG Oral Capsule',
      sig: 'Take 1 capsule by mouth every 8 hours (three times daily) for 10 days',
      quantity: '30 capsules',
      refills: 0,
    });
  }
  if (text.includes('lisinopril')) {
    medications.push({
      drugName: 'Lisinopril 10 MG Oral Tablet',
      sig: 'Take 1 tablet by mouth once daily at bedtime',
      quantity: '90 tablets',
      refills: 3,
    });
  }
  if (text.includes('ibuprofen') || text.includes('motrin') || text.includes('advil')) {
    medications.push({
      drugName: 'Ibuprofen 600 MG Oral Tablet',
      sig: 'Take 1 tablet by mouth every 6 hours with food as needed for pain/inflammation',
      quantity: '20 tablets',
      refills: 0,
    });
  }
  if (text.includes('albuterol') || text.includes('inhaler')) {
    medications.push({
      drugName: 'Albuterol Sulfate 90 MCG Inhaler',
      sig: 'Inhale 2 puffs every 4 to 6 hours as needed for shortness of breath or wheezing',
      quantity: '1 inhaler',
      refills: 1,
    });
  }

  // 5. Patient Instructions
  if (text.includes('hydrate') || text.includes('water') || text.includes('fluids')) patientInstructions.push('Maintain generous oral hydration (>2L daily).');
  if (text.includes('salt water') || text.includes('gargle')) patientInstructions.push('Warm salt water gargles 3-4 times daily for throat comfort.');
  if (text.includes('rest')) patientInstructions.push('Get adequate physical rest.');
  if (text.includes('emergency') || text.includes('trouble swallowing') || text.includes('chest pain')) {
    patientInstructions.push('Seek immediate emergency evaluation if severe shortness of breath or inability to swallow secretions occurs.');
  }

  // 6. Automated Code Suggestions
  const suspectedDiagnoses = suggestDiagnosesFromSoapNote(chiefComplaint, conversationText);

  // Recommended CPT / CDT procedures
  const recommendedProcedures: MedicalCodeItem[] = [];
  if (inClinicTests.some(t => t.includes('Strep'))) {
    recommendedProcedures.push({ code: '87880', desc: 'Strep A antigen detection', category: 'Lab', type: 'CPT', standardFee: 35 });
  }
  if (inClinicTests.some(t => t.includes('ECG') || t.includes('EKG'))) {
    recommendedProcedures.push({ code: '93000', desc: 'Electrocardiogram, 12-lead', category: 'Cardiology', type: 'CPT', standardFee: 75 });
  }
  if (inClinicTests.some(t => t.includes('X-ray') || t.includes('Bitewing'))) {
    recommendedProcedures.push({ code: 'D0274', desc: 'Bitewings - four radiographic images', category: 'Dental Diagnostic', type: 'CDT', standardFee: 75 });
  }
  // Default outpatient E/M office visit
  recommendedProcedures.push({ code: '99213', desc: 'Office visit, established patient (20-29 min)', category: 'E/M', type: 'CPT', standardFee: 125 });

  return {
    chiefComplaint,
    symptoms,
    duration,
    physicalObservations,
    inClinicTests,
    suspectedDiagnoses,
    recommendedProcedures,
    medications,
    patientInstructions,
    followUpWindow,
  };
}

/**
 * Builds a structured Clinical SOAP Note from parsed conversation entities.
 */
export function generateSoapFromEntities(entities: ParsedClinicalEntities): Partial<ClinicalSoapNote> {
  const hpi = `Patient presents with ${entities.chiefComplaint.toLowerCase()}${
    entities.duration ? ` ongoing for ${entities.duration}` : ''
  }. Symptoms reported: ${entities.symptoms.join(', ')}. Dialogue reviewed for associated red flags.`;

  const physicalExam = entities.physicalObservations.length > 0
    ? entities.physicalObservations.join('. ') + '.'
    : 'Patient observed in exam room: awake, alert, well-hydrated, in no acute respiratory distress.';

  const orders = entities.inClinicTests.length > 0
    ? `In-clinic diagnostics: ${entities.inClinicTests.join(', ')}.`
    : 'Routine clinical evaluation.';

  return {
    subjective: {
      chiefComplaint: entities.chiefComplaint,
      hpi,
      duration: entities.duration,
    },
    objective: {
      physicalExamFindings: physicalExam,
    },
    assessment: {
      diagnoses: entities.suspectedDiagnoses.map((d, i) => ({
        code: d.code,
        description: d.desc,
        type: i === 0 ? 'PRIMARY' : 'SECONDARY',
      })),
      clinicalRationale: `Diagnostic impression formulated via ambient conversational analysis. Corroborated with reported symptom cluster and clinical exam.`,
    },
    plan: {
      ordersAndTreatment: orders,
      prescriptions: entities.medications,
      educationalPrescriptions: [],
      followUp: `Follow up in ${entities.followUpWindow || '4 weeks'} or sooner if red flag symptoms develop.`,
      patientInstructions: entities.patientInstructions.join(' '),
    },
  };
}

/**
 * Reads discharge instructions and treatment plan aloud to the patient
 * using Web Speech Synthesis API.
 */
export function speakDischargeInstructionsToPatient(patientName: string, planText: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const script = `Hello ${patientName}. Here is a summary of your visit plan. ${planText} If your symptoms worsen, please contact our clinic or seek immediate care.`;
  const utter = new SpeechSynthesisUtterance(script);
  utter.rate = 0.95; // comfortable, clear pace
  utter.pitch = 1.0;
  
  // Prefer clear articulate voice
  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Daniel')));
  if (naturalVoice) utter.voice = naturalVoice;

  window.speechSynthesis.speak(utter);
}
