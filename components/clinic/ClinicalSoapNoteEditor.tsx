import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, Activity, Stethoscope, CheckCircle2, Lock,
  Plus, Trash2, Printer, Sparkles, BookOpen, AlertCircle,
  Clock, ShieldAlert, Award, ChevronDown, Check, ArrowRight, Mic
} from 'lucide-react';
import type { ClinicalSoapNote, ClinicPrescription, EducationalPrescription } from '../../types/clinic';
import {
  saveSoapNote,
  getAvailableMedicalCourses,
  COMMON_ICD10_CODES,
  COMMON_PROCEDURE_CODES
} from '../../services/clinicService';
import DentalOdontogram from './DentalOdontogram';
import AmbientClinicalScribeModal from './AmbientClinicalScribe';

interface ClinicalSoapNoteEditorProps {
  note: ClinicalSoapNote;
  onSave?: (savedNote: ClinicalSoapNote) => void;
  onClose?: () => void;
  onOpenSuperbill?: () => void;
}

export const ClinicalSoapNoteEditor: React.FC<ClinicalSoapNoteEditorProps> = ({
  note: initialNote,
  onSave,
  onClose,
  onOpenSuperbill,
}) => {
  const [note, setNote] = useState<ClinicalSoapNote>(initialNote);
  const [showAmbientScribe, setShowAmbientScribe] = useState(false);
  const [activeTab, setActiveTab] = useState<'S' | 'O' | 'A' | 'P' | 'DENTAL'>('S');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showEducationPicker, setShowEducationPicker] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  const medicalCourses = useMemo(() => getAvailableMedicalCourses(), []);

  // Calculate BMI dynamically
  const calculatedBmi = useMemo(() => {
    const w = note.objective.vitals?.weightLbs;
    const h = note.objective.vitals?.heightInches;
    if (w && h && h > 0) {
      return Number(((w / (h * h)) * 703).toFixed(1));
    }
    return note.objective.vitals?.bmi;
  }, [note.objective.vitals?.weightLbs, note.objective.vitals?.heightInches]);

  const handleSave = async (lock: boolean = false) => {
    setIsSaving(true);
    const updatedNote: ClinicalSoapNote = {
      ...note,
      isLocked: lock ? true : note.isLocked,
      lockedAt: lock ? Date.now() : note.lockedAt,
      signedBy: lock ? (note.providerName + ' (MD/DDS Verified)') : note.signedBy,
      updatedAt: Date.now(),
      objective: {
        ...note.objective,
        vitals: {
          ...note.objective.vitals,
          bmi: calculatedBmi,
        },
      },
    };

    try {
      const saved = await saveSoapNote(updatedNote);
      setNote(saved);
      if (onSave) onSave(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error('Failed to save SOAP note', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Add prescription helper
  const addPrescription = () => {
    const current = note.plan.prescriptions || [];
    setNote({
      ...note,
      plan: {
        ...note.plan,
        prescriptions: [
          ...current,
          { drugName: '', sig: 'Take 1 tablet by mouth daily', quantity: '30 tablets', refills: 1 },
        ],
      },
    });
  };

  const removePrescription = (idx: number) => {
    const current = [...(note.plan.prescriptions || [])];
    current.splice(idx, 1);
    setNote({
      ...note,
      plan: { ...note.plan, prescriptions: current },
    });
  };

  // Add educational module prescription
  const prescribeEducation = (courseId: string, title: string, blurb?: string) => {
    const current = note.plan.educationalPrescriptions || [];
    if (current.some(e => e.courseId === courseId)) return;
    const newPrescription: EducationalPrescription = {
      courseId,
      title,
      blurb,
      assignedAt: Date.now(),
    };
    setNote({
      ...note,
      plan: {
        ...note.plan,
        educationalPrescriptions: [...current, newPrescription],
      },
    });
    setShowEducationPicker(false);
  };

  const removeEducation = (courseId: string) => {
    const current = (note.plan.educationalPrescriptions || []).filter(e => e.courseId !== courseId);
    setNote({
      ...note,
      plan: { ...note.plan, educationalPrescriptions: current },
    });
  };

  // Quick OLDCARTS helper for Subjective
  const insertOldcartsTemplate = () => {
    const template = `\n[OLDCARTS Breakdown]\n• Onset: \n• Location: \n• Duration: \n• Character: \n• Aggravating: \n• Relieving: \n• Timing: \n• Severity (1-10): `;
    setNote({
      ...note,
      subjective: {
        ...note.subjective,
        hpi: (note.subjective.hpi || '') + template,
      },
    });
  };

  // Merge ambient clinical scribe transcription and entities into current SOAP note
  const handleApplyAmbientScribe = (ambientDraft: Partial<ClinicalSoapNote>) => {
    setNote(prev => ({
      ...prev,
      subjective: {
        ...prev.subjective,
        chiefComplaint: ambientDraft.subjective?.chiefComplaint || prev.subjective?.chiefComplaint || '',
        hpi: prev.subjective?.hpi
          ? `${prev.subjective.hpi}\n\n[Ambient Scribe HPI]\n${ambientDraft.subjective?.hpi || ''}`
          : (ambientDraft.subjective?.hpi || ''),
        duration: ambientDraft.subjective?.duration || prev.subjective?.duration,
      },
      objective: {
        ...prev.objective,
        physicalExamFindings: prev.objective?.physicalExamFindings
          ? `${prev.objective.physicalExamFindings}\n\n[Ambient Exam]\n${ambientDraft.objective?.physicalExamFindings || ''}`
          : (ambientDraft.objective?.physicalExamFindings || ''),
      },
      assessment: {
        ...prev.assessment,
        diagnoses: [
          ...(prev.assessment?.diagnoses || []),
          ...(ambientDraft.assessment?.diagnoses || []).filter(
            d => !(prev.assessment?.diagnoses || []).some(existing => existing.code === d.code)
          ),
        ],
        clinicalRationale: prev.assessment?.clinicalRationale
          ? `${prev.assessment.clinicalRationale}\n\n${ambientDraft.assessment?.clinicalRationale || ''}`
          : (ambientDraft.assessment?.clinicalRationale || ''),
      },
      plan: {
        ...prev.plan,
        ordersAndTreatment: prev.plan?.ordersAndTreatment
          ? `${prev.plan.ordersAndTreatment}\n${ambientDraft.plan?.ordersAndTreatment || ''}`
          : (ambientDraft.plan?.ordersAndTreatment || ''),
        prescriptions: [
          ...(prev.plan?.prescriptions || []),
          ...(ambientDraft.plan?.prescriptions || []),
        ],
        followUp: ambientDraft.plan?.followUp || prev.plan?.followUp || '',
        patientInstructions: prev.plan?.patientInstructions
          ? `${prev.plan.patientInstructions}\n${ambientDraft.plan?.patientInstructions || ''}`
          : (ambientDraft.plan?.patientInstructions || ''),
      },
    }));
    setShowAmbientScribe(false);
  };

  return (
    <div className="bg-[#0b0514] border border-white/10 rounded-3xl p-6 text-white backdrop-blur-2xl shadow-2xl flex flex-col gap-6 max-w-5xl mx-auto">
      
      {/* Top Banner & Patient Identification */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#6B0099]/30 border border-[#6B0099]/60 text-[#D0BCFF] uppercase tracking-wider">
              Clinical Encounter Note
            </span>
            <span className="text-xs text-white/50">• {note.encounterType}</span>
            {note.isLocked && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#06D6A0]/20 text-[#06D6A0] border border-[#06D6A0]/30">
                <Lock size={10} /> Locked & Signed
              </span>
            )}
          </div>
          <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white mt-1">
            {note.patientName}
          </h3>
          <p className="text-xs text-white/60 font-mono mt-0.5">
            Provider: {note.providerName} • Date: {note.encounterDate}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!note.isLocked && (
            <button
              type="button"
              onClick={() => setShowAmbientScribe(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#A855F7]/15 border border-[#A855F7]/40 text-[#D0BCFF] hover:bg-[#A855F7]/25 transition-all flex items-center gap-1.5 shadow-lg shadow-[#A855F7]/10"
              title="Ambient Clinical Scribe (Speech-to-Code)"
            >
              <Mic size={13} className="text-[#A855F7] animate-pulse" />
              <span>Ambient Scribe</span>
            </button>
          )}

          {onOpenSuperbill && (
            <button
              type="button"
              onClick={onOpenSuperbill}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/15 text-white hover:bg-white/10 transition-all"
            >
              📄 Superbill
            </button>
          )}

          {!note.isLocked ? (
            <>
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00DAF3] text-black shadow-lg shadow-[#00DAF3]/20 hover:brightness-110 transition-all flex items-center gap-1.5"
              >
                {isSaving ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#D40055] to-[#6B0099] text-white shadow-lg shadow-[#D40055]/30 hover:brightness-110 transition-all flex items-center gap-1.5"
              >
                <Lock size={12} /> Sign & Lock
              </button>
            </>
          ) : (
            <div className="text-right text-[11px] font-mono text-[#06D6A0]">
              Signed by {note.signedBy}
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* S-O-A-P Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl">
        {[
          { id: 'S', label: 'S · Subjective', desc: 'Patient story & symptoms', color: '#00DAF3' },
          { id: 'O', label: 'O · Objective', desc: 'Vitals & exam findings', color: '#06D6A0' },
          { id: 'A', label: 'A · Assessment', desc: 'Diagnosis & ICD-10', color: '#FFD166' },
          { id: 'P', label: 'P · Plan', desc: 'Rx, education, follow-up', color: '#D40055' },
          { id: 'DENTAL', label: '🦷 Dental Chart', desc: '32-Tooth Odontogram', color: '#A855F7' },
        ].map(t => {
          const isSel = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-left transition-all ${
                isSel
                  ? 'bg-white/10 border border-white/20 shadow-md'
                  : 'hover:bg-white/[0.04] text-white/50 hover:text-white'
              }`}
            >
              <div
                className="text-xs font-bold font-['Space_Grotesk']"
                style={{ color: isSel ? t.color : 'inherit' }}
              >
                {t.label}
              </div>
              <div className="text-[10px] text-white/40 truncate hidden sm:block">
                {t.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Tab S: Subjective */}
      {activeTab === 'S' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-white/60 uppercase tracking-wider">
              Chief Complaint (CC):
            </label>
            <span className="text-[10px] font-mono text-white/40">In patient's own words</span>
          </div>
          <input
            type="text"
            disabled={note.isLocked}
            value={note.subjective.chiefComplaint}
            onChange={e =>
              setNote({
                ...note,
                subjective: { ...note.subjective, chiefComplaint: e.target.value },
              })
            }
            placeholder="e.g. Hypertension follow-up, mild dizziness in morning..."
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00DAF3] transition-all"
          />

          <div className="flex items-center justify-between pt-2">
            <label className="text-xs font-mono text-white/60 uppercase tracking-wider">
              History of Present Illness (HPI):
            </label>
            {!note.isLocked && (
              <button
                type="button"
                onClick={insertOldcartsTemplate}
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] hover:bg-[#00DAF3]/25 transition-all flex items-center gap-1"
              >
                <Sparkles size={11} /> + Insert OLDCARTS Framework
              </button>
            )}
          </div>
          <textarea
            disabled={note.isLocked}
            rows={8}
            value={note.subjective.hpi}
            onChange={e =>
              setNote({
                ...note,
                subjective: { ...note.subjective, hpi: e.target.value },
              })
            }
            placeholder="Chronological narrative of the condition: onset, location, duration, character, aggravating and alleviating factors, radiation, timing, and severity..."
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00DAF3] transition-all leading-relaxed font-sans resize-y"
          />
        </div>
      )}

      {/* Tab O: Objective */}
      {activeTab === 'O' && (
        <div className="space-y-6">
          {/* Vitals Strip */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-[#06D6A0]" />
              <label className="text-xs font-mono text-white/60 uppercase tracking-wider">
                Objective Vital Signs
              </label>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {/* BP Systolic */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">BP SYSTOLIC</span>
                <input
                  type="number"
                  disabled={note.isLocked}
                  value={note.objective.vitals?.bpSystolic || ''}
                  onChange={e =>
                    setNote({
                      ...note,
                      objective: {
                        ...note.objective,
                        vitals: { ...note.objective.vitals, bpSystolic: Number(e.target.value) },
                      },
                    })
                  }
                  placeholder="120"
                  className="w-full bg-transparent text-lg font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[9px] font-mono text-white/40">mmHg</span>
                {(note.objective.vitals?.bpSystolic || 0) >= 140 && (
                  <span className="text-[9px] font-mono text-[#EF4444] block font-bold mt-0.5">Stage 2 HTN</span>
                )}
              </div>

              {/* BP Diastolic */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">BP DIASTOLIC</span>
                <input
                  type="number"
                  disabled={note.isLocked}
                  value={note.objective.vitals?.bpDiastolic || ''}
                  onChange={e =>
                    setNote({
                      ...note,
                      objective: {
                        ...note.objective,
                        vitals: { ...note.objective.vitals, bpDiastolic: Number(e.target.value) },
                      },
                    })
                  }
                  placeholder="80"
                  className="w-full bg-transparent text-lg font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[9px] font-mono text-white/40">mmHg</span>
              </div>

              {/* Heart Rate */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">PULSE / HR</span>
                <input
                  type="number"
                  disabled={note.isLocked}
                  value={note.objective.vitals?.heartRate || ''}
                  onChange={e =>
                    setNote({
                      ...note,
                      objective: {
                        ...note.objective,
                        vitals: { ...note.objective.vitals, heartRate: Number(e.target.value) },
                      },
                    })
                  }
                  placeholder="72"
                  className="w-full bg-transparent text-lg font-mono font-bold text-[#06D6A0] focus:outline-none"
                />
                <span className="text-[9px] font-mono text-white/40">bpm</span>
              </div>

              {/* Temp */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">TEMP (°F)</span>
                <input
                  type="number"
                  step="0.1"
                  disabled={note.isLocked}
                  value={note.objective.vitals?.temperatureF || ''}
                  onChange={e =>
                    setNote({
                      ...note,
                      objective: {
                        ...note.objective,
                        vitals: { ...note.objective.vitals, temperatureF: Number(e.target.value) },
                      },
                    })
                  }
                  placeholder="98.6"
                  className="w-full bg-transparent text-lg font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[9px] font-mono text-white/40">oral</span>
              </div>

              {/* SpO2 */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">SpO2</span>
                <input
                  type="number"
                  disabled={note.isLocked}
                  value={note.objective.vitals?.o2Saturation || ''}
                  onChange={e =>
                    setNote({
                      ...note,
                      objective: {
                        ...note.objective,
                        vitals: { ...note.objective.vitals, o2Saturation: Number(e.target.value) },
                      },
                    })
                  }
                  placeholder="99"
                  className="w-full bg-transparent text-lg font-mono font-bold text-[#00DAF3] focus:outline-none"
                />
                <span className="text-[9px] font-mono text-white/40">%</span>
              </div>

              {/* Weight */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">WEIGHT (LBS)</span>
                <input
                  type="number"
                  disabled={note.isLocked}
                  value={note.objective.vitals?.weightLbs || ''}
                  onChange={e =>
                    setNote({
                      ...note,
                      objective: {
                        ...note.objective,
                        vitals: { ...note.objective.vitals, weightLbs: Number(e.target.value) },
                      },
                    })
                  }
                  placeholder="150"
                  className="w-full bg-transparent text-lg font-mono font-bold text-white focus:outline-none"
                />
                <span className="text-[9px] font-mono text-white/40">lbs</span>
              </div>

              {/* Calculated BMI */}
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <span className="text-[10px] font-mono text-white/50 block">CALCULATED BMI</span>
                <div className="text-lg font-mono font-bold text-[#FFD166] mt-0.5">
                  {calculatedBmi || '—'}
                </div>
                <span className="text-[9px] font-mono text-white/40">kg/m²</span>
              </div>
            </div>
          </div>

          {/* Physical Exam Findings */}
          <div>
            <label className="text-xs font-mono text-white/60 uppercase tracking-wider block mb-2">
              Physical Examination & Clinical Observations:
            </label>
            <textarea
              disabled={note.isLocked}
              rows={6}
              value={note.objective.physicalExamFindings || ''}
              onChange={e =>
                setNote({
                  ...note,
                  objective: { ...note.objective, physicalExamFindings: e.target.value },
                })
              }
              placeholder="Constitutional, HEENT, Cardiovascular, Pulmonary, Abdominal, Musculoskeletal, Neurological, Skin findings..."
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#06D6A0] transition-all leading-relaxed font-sans resize-y"
            />
          </div>
        </div>
      )}

      {/* Tab A: Assessment */}
      {activeTab === 'A' && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-mono text-white/60 uppercase tracking-wider">
                Diagnoses & ICD-10 Classification:
              </label>
              <span className="text-[10px] font-mono text-white/40">Standardized Medical Billing Codes</span>
            </div>

            {/* Quick Common ICD-10 Buttons */}
            {!note.isLocked && (
              <div className="flex flex-wrap gap-1.5 mb-3 p-3 bg-white/[0.02] border border-white/[0.07] rounded-xl">
                <span className="text-[10px] font-mono text-white/40 mr-1 self-center">Quick Pick:</span>
                {COMMON_ICD10_CODES.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      const existing = note.assessment.diagnoses || [];
                      if (!existing.some(d => d.code === c.code)) {
                        setNote({
                          ...note,
                          assessment: {
                            ...note.assessment,
                            diagnoses: [...existing, { code: c.code, description: c.desc, type: existing.length === 0 ? 'PRIMARY' : 'SECONDARY' }],
                          },
                        });
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-mono border border-white/10 bg-white/5 hover:bg-white/15 text-white/80 transition-all"
                  >
                    <strong>{c.code}</strong> {c.desc.slice(0, 24)}...
                  </button>
                ))}
              </div>
            )}

            {/* Selected Diagnoses List */}
            <div className="space-y-2">
              {(note.assessment.diagnoses || []).map((diag, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-white/[0.04] border border-white/10 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FFD166]/20 text-[#FFD166] border border-[#FFD166]/30">
                      {diag.code || 'ICD-10'}
                    </span>
                    <span className="text-sm font-medium text-white">{diag.description}</span>
                    <span className="text-[9px] font-mono uppercase text-white/40 px-1.5 py-0.5 rounded bg-white/5">
                      {diag.type}
                    </span>
                  </div>
                  {!note.isLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...note.assessment.diagnoses];
                        updated.splice(idx, 1);
                        setNote({ ...note, assessment: { ...note.assessment, diagnoses: updated } });
                      }}
                      className="text-white/40 hover:text-[#EF4444] transition-all p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-white/60 uppercase tracking-wider block mb-2">
              Clinical Reasoning & Diagnostic Rationale:
            </label>
            <textarea
              disabled={note.isLocked}
              rows={4}
              value={note.assessment.clinicalRationale || ''}
              onChange={e =>
                setNote({
                  ...note,
                  assessment: { ...note.assessment, clinicalRationale: e.target.value },
                })
              }
              placeholder="Synthesize the findings, risk factors, and rationale for selected diagnoses..."
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FFD166] transition-all resize-y"
            />
          </div>
        </div>
      )}

      {/* Tab P: Plan */}
      {activeTab === 'P' && (
        <div className="space-y-6">
          {/* Orders & Treatment */}
          <div>
            <label className="text-xs font-mono text-white/60 uppercase tracking-wider block mb-2">
              Orders, Lab Diagnostics & In-Clinic Treatment:
            </label>
            <textarea
              disabled={note.isLocked}
              rows={3}
              value={note.plan.ordersAndTreatment}
              onChange={e =>
                setNote({
                  ...note,
                  plan: { ...note.plan, ordersAndTreatment: e.target.value },
                })
              }
              placeholder="e.g. BMP lab order, blood pressure monitor instruction, composite restoration..."
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#D40055] transition-all resize-none"
            />
          </div>

          {/* Rx Pad (Prescriptions) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                💊 Prescriptions (Rx):
              </label>
              {!note.isLocked && (
                <button
                  type="button"
                  onClick={addPrescription}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-[#D40055]/20 border border-[#D40055]/40 text-[#D40055] hover:bg-[#D40055]/30 transition-all flex items-center gap-1"
                >
                  <Plus size={12} /> Add Medication
                </button>
              )}
            </div>

            {(note.plan.prescriptions || []).map((rx, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-white/[0.03] border border-white/10 rounded-xl items-center"
              >
                <input
                  type="text"
                  disabled={note.isLocked}
                  value={rx.drugName}
                  onChange={e => {
                    const list = [...note.plan.prescriptions];
                    list[idx].drugName = e.target.value;
                    setNote({ ...note, plan: { ...note.plan, prescriptions: list } });
                  }}
                  placeholder="Drug name & strength (e.g. Amoxicillin 500mg)"
                  className="col-span-1 md:col-span-2 bg-transparent border-b border-white/20 p-1 text-xs text-white focus:outline-none focus:border-[#D40055]"
                />
                <input
                  type="text"
                  disabled={note.isLocked}
                  value={rx.sig}
                  onChange={e => {
                    const list = [...note.plan.prescriptions];
                    list[idx].sig = e.target.value;
                    setNote({ ...note, plan: { ...note.plan, prescriptions: list } });
                  }}
                  placeholder="Sig (Directions)"
                  className="bg-transparent border-b border-white/20 p-1 text-xs text-white focus:outline-none focus:border-[#D40055]"
                />
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    disabled={note.isLocked}
                    value={rx.quantity}
                    onChange={e => {
                      const list = [...note.plan.prescriptions];
                      list[idx].quantity = e.target.value;
                      setNote({ ...note, plan: { ...note.plan, prescriptions: list } });
                    }}
                    placeholder="Qty: 30"
                    className="w-16 bg-transparent border-b border-white/20 p-1 text-xs text-white focus:outline-none focus:border-[#D40055]"
                  />
                  {!note.isLocked && (
                    <button
                      type="button"
                      onClick={() => removePrescription(idx)}
                      className="text-white/40 hover:text-[#EF4444] transition-all p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Educational Prescriptions (Leveraging Plajah's Medical Curriculum!) */}
          <div className="space-y-3 p-4 bg-gradient-to-r from-[#6B0099]/15 to-[#00DAF3]/10 border border-[#00DAF3]/30 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#00DAF3] uppercase tracking-wider block">
                  Plajah Medical Curriculum Bridge
                </span>
                <h4 className="text-sm font-bold text-white font-['Space_Grotesk']">
                  Point-of-Care Educational Prescriptions
                </h4>
              </div>
              {!note.isLocked && (
                <button
                  type="button"
                  onClick={() => setShowEducationPicker(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#00DAF3] text-black shadow-md shadow-[#00DAF3]/20 hover:brightness-110 transition-all flex items-center gap-1"
                >
                  <BookOpen size={12} /> + Prescribe Learning
                </button>
              )}
            </div>

            {/* Prescribed Curriculum Modules */}
            <div className="space-y-2 mt-2">
              {(note.plan.educationalPrescriptions || []).map((edu, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-black/40 border border-white/10 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#00DAF3]/20 border border-[#00DAF3]/40 flex items-center justify-center text-[#00DAF3]">
                      <BookOpen size={14} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{edu.title}</div>
                      <div className="text-[10px] text-white/50">{edu.blurb || 'Assigned to patient portal'}</div>
                    </div>
                  </div>
                  {!note.isLocked && (
                    <button
                      type="button"
                      onClick={() => removeEducation(edu.courseId)}
                      className="text-white/40 hover:text-[#EF4444] transition-all p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Curriculum Picker Modal */}
            {showEducationPicker && (
              <div className="p-4 bg-black/80 border border-white/20 rounded-xl mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Select Course to Prescribe:</span>
                  <button
                    type="button"
                    onClick={() => setShowEducationPicker(false)}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {medicalCourses.map(c => (
                    <div
                      key={c.id}
                      onClick={() => prescribeEducation(c.id, c.title, c.blurb)}
                      className="p-2.5 rounded-lg bg-white/5 hover:bg-[#00DAF3]/20 border border-white/10 hover:border-[#00DAF3] cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{c.title}</div>
                        <div className="text-[10px] text-white/50 truncate max-w-md">{c.blurb}</div>
                      </div>
                      <span className="text-[10px] font-mono text-[#00DAF3] font-bold">Assign →</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Follow-up & Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-white/60 uppercase tracking-wider block mb-1.5">
                Follow-Up Interval:
              </label>
              <input
                type="text"
                disabled={note.isLocked}
                value={note.plan.followUp}
                onChange={e =>
                  setNote({
                    ...note,
                    plan: { ...note.plan, followUp: e.target.value },
                  })
                }
                placeholder="e.g. Return in 8 weeks for BP check or sooner if dizzy..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#D40055]"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/60 uppercase tracking-wider block mb-1.5">
                Patient Self-Care Instructions:
              </label>
              <input
                type="text"
                disabled={note.isLocked}
                value={note.plan.patientInstructions}
                onChange={e =>
                  setNote({
                    ...note,
                    plan: { ...note.plan, patientInstructions: e.target.value },
                  })
                }
                placeholder="e.g. Hydrate with 2L water, log BP morning and night..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#D40055]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Dental Chart */}
      {activeTab === 'DENTAL' && (
        <DentalOdontogram
          patientName={note.patientName}
          readOnly={note.isLocked}
          initialChart={note.objective.dentalChartSnapshot}
          onSave={chart => {
            setNote({
              ...note,
              objective: {
                ...note.objective,
                dentalChartSnapshot: chart,
              },
            });
          }}
        />
      )}

      {/* Ambient Clinical Scribe Modal */}
      {showAmbientScribe && (
        <AmbientClinicalScribeModal
          patientName={note.patientName}
          onApplyToNote={handleApplyAmbientScribe}
          onClose={() => setShowAmbientScribe(false)}
        />
      )}

    </div>
  );
};

export default ClinicalSoapNoteEditor;
