import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  FileText, Shield, AlertTriangle, CheckCircle2, User,
  Heart, X, Save, Sparkles, Plus, Trash2, Calendar
} from 'lucide-react';
import type { PatientIntakeForm } from '../../types/clinic';
import { saveIntakeForm } from '../../services/clinicService';

interface PatientIntakeModalProps {
  intake: PatientIntakeForm;
  onSave?: (saved: PatientIntakeForm) => void;
  onClose: () => void;
  readOnly?: boolean;
}

export const PatientIntakeModal: React.FC<PatientIntakeModalProps> = ({
  intake: initialIntake,
  onSave,
  onClose,
  readOnly = false,
}) => {
  const [form, setForm] = useState<PatientIntakeForm>(initialIntake);
  const [newAllergy, setNewAllergy] = useState('');
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedFreq, setNewMedFreq] = useState('');

  const handleSave = async () => {
    const saved = await saveIntakeForm(form);
    if (onSave) onSave(saved);
    onClose();
  };

  const addAllergy = () => {
    if (!newAllergy.trim()) return;
    setForm({
      ...form,
      allergies: [...(form.allergies || []), newAllergy.trim()],
    });
    setNewAllergy('');
  };

  const removeAllergy = (idx: number) => {
    const list = [...(form.allergies || [])];
    list.splice(idx, 1);
    setForm({ ...form, allergies: list });
  };

  const addMedication = () => {
    if (!newMedName.trim()) return;
    setForm({
      ...form,
      currentMedications: [
        ...(form.currentMedications || []),
        { name: newMedName.trim(), dosage: newMedDosage.trim(), frequency: newMedFreq.trim() },
      ],
    });
    setNewMedName('');
    setNewMedDosage('');
    setNewMedFreq('');
  };

  const removeMedication = (idx: number) => {
    const list = [...(form.currentMedications || [])];
    list.splice(idx, 1);
    setForm({ ...form, currentMedications: list });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#0e0619] border border-white/15 rounded-3xl max-w-3xl w-full p-6 text-white shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00DAF3]/20 border border-[#00DAF3]/40 text-[#00DAF3] uppercase tracking-wider">
                Digital Clinical Intake
              </span>
              <span className="text-xs text-white/50">• Pre-Visit Registration</span>
            </div>
            <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white mt-1">
              {form.patientName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        {/* Section 1: Demographics & Contact */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono text-white/60 uppercase tracking-wider flex items-center gap-1.5">
            <User size={13} className="text-[#00DAF3]" /> Patient Demographics:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-mono text-white/40 block mb-1">Date of Birth</label>
              <input
                type="date"
                disabled={readOnly}
                value={form.dob}
                onChange={e => setForm({ ...form, dob: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-white/40 block mb-1">Phone Number</label>
              <input
                type="text"
                disabled={readOnly}
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-white/40 block mb-1">Email Address</label>
              <input
                type="email"
                disabled={readOnly}
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Chief Complaint & Symptoms */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-white/60 uppercase tracking-wider block">
            Reason for Today's Visit / Chief Complaint:
          </label>
          <textarea
            disabled={readOnly}
            rows={2}
            value={form.chiefComplaint}
            onChange={e => setForm({ ...form, chiefComplaint: e.target.value })}
            placeholder="Describe your current symptoms or reason for visit..."
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#00DAF3] resize-none"
          />
        </div>

        {/* Section 3: Allergies (High Visibility Red Badges) */}
        <div className="space-y-3 p-4 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-2xl">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono text-[#EF4444] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={13} /> Documented Allergies & Drug Reactions:
            </h4>
            <span className="text-[10px] font-mono text-white/50">Critical Safety Check</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {(form.allergies || []).map((allergy, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#EF4444]/20 border border-[#EF4444]/50 text-white flex items-center gap-1.5"
              >
                <span>{allergy}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeAllergy(idx)}
                    className="text-white/60 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {(form.allergies || []).length === 0 && (
              <span className="text-xs text-white/50 italic">No known drug allergies (NKDA)</span>
            )}
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newAllergy}
                onChange={e => setNewAllergy(e.target.value)}
                placeholder="e.g. Penicillin, Sulfa, Latex, Peanuts..."
                className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#EF4444]"
              />
              <button
                type="button"
                onClick={addAllergy}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-[#EF4444] text-white hover:bg-[#DC2626] transition-all"
              >
                + Add Allergy
              </button>
            </div>
          )}
        </div>

        {/* Section 4: Current Medications */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono text-white/60 uppercase tracking-wider flex items-center gap-1.5">
            💊 Current Medications & Supplements:
          </h4>
          <div className="space-y-2">
            {(form.currentMedications || []).map((med, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-white/5 border border-white/10 rounded-xl text-xs"
              >
                <div className="flex items-center gap-3">
                  <strong className="text-white">{med.name}</strong>
                  <span className="text-white/60">{med.dosage}</span>
                  <span className="text-white/40">({med.frequency})</span>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeMedication(idx)}
                    className="text-white/40 hover:text-[#EF4444] transition-all p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {!readOnly && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
              <input
                type="text"
                value={newMedName}
                onChange={e => setNewMedName(e.target.value)}
                placeholder="Medication name"
                className="sm:col-span-2 bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
              />
              <input
                type="text"
                value={newMedDosage}
                onChange={e => setNewMedDosage(e.target.value)}
                placeholder="Dosage (e.g. 20mg)"
                className="bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMedFreq}
                  onChange={e => setNewMedFreq(e.target.value)}
                  placeholder="Daily"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                />
                <button
                  type="button"
                  onClick={addMedication}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-[#00DAF3] text-black hover:brightness-110 transition-all whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 5: Dental Anxiety Flag & Medical History */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2">
            <span className="text-[10px] font-mono text-white/50 uppercase block">Clinical Comfort</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={form.hasDentalAnxiety || false}
                onChange={e => setForm({ ...form, hasDentalAnxiety: e.target.checked })}
                className="w-4 h-4 accent-[#00DAF3]"
              />
              <span className="text-xs font-bold text-white">
                Patient notes high dental/medical procedure anxiety
              </span>
            </label>
            <p className="text-[11px] text-white/50">
              Flags the care team to offer calming ambient music, topical numbing, or step-by-step procedure explanations.
            </p>
          </div>

          <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2">
            <span className="text-[10px] font-mono text-white/50 uppercase block">Insurance Coverage</span>
            <div className="text-xs text-white space-y-1">
              <div>Provider: <strong className="text-[#00DAF3]">{form.insuranceProvider || 'Self-Pay / None'}</strong></div>
              <div>Policy #: <span className="font-mono text-white/70">{form.policyNumber || '—'}</span></div>
            </div>
          </div>
        </div>

        {/* Section 6: Consent Signature */}
        <div className="p-4 bg-black/40 border border-white/10 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#06D6A0]" />
            <span className="text-xs text-white/70">
              Consent for Medical Evaluation & Treatment signed electronically by{' '}
              <strong className="text-white">{form.consentSignerName || form.patientName}</strong> on {form.consentDate || 'Today'}
            </span>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#06D6A0] text-black shadow-lg shadow-[#06D6A0]/20 hover:brightness-110 transition-all flex items-center gap-1.5 whitespace-nowrap"
            >
              <Save size={13} /> Save Intake Packet
            </button>
          )}
        </div>

      </motion.div>
    </div>
  );
};

export default PatientIntakeModal;
