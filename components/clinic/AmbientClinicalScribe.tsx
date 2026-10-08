import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, Volume2, Sparkles, CheckCircle2,
  FileText, Activity, ShieldCheck, ArrowRight, RefreshCw,
  Play, Pause, Stethoscope, Award
} from 'lucide-react';
import type { ClinicalSoapNote } from '../../types/clinic';
import {
  AmbientClinicalScribe,
  ScribeTranscriptSnippet,
  ParsedClinicalEntities,
  parseClinicalConversation,
  generateSoapFromEntities,
  speakDischargeInstructionsToPatient
} from '../../services/ambientClinicalScribe';

interface AmbientClinicalScribeProps {
  patientName?: string;
  onApplyToNote?: (note: Partial<ClinicalSoapNote>) => void;
  onClose?: () => void;
}

export const AmbientClinicalScribeModal: React.FC<AmbientClinicalScribeProps> = ({
  patientName = 'Patient',
  onApplyToNote,
  onClose,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [snippets, setSnippets] = useState<ScribeTranscriptSnippet[]>([]);
  const [parsedEntities, setParsedEntities] = useState<ParsedClinicalEntities | null>(null);
  const [generatedSoap, setGeneratedSoap] = useState<Partial<ClinicalSoapNote> | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const scribeRef = useRef<AmbientClinicalScribe | null>(null);

  // Initialize scribe instance
  useEffect(() => {
    scribeRef.current = new AmbientClinicalScribe();
    return () => {
      scribeRef.current?.stopListening();
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      scribeRef.current?.stopListening();
      setIsRecording(false);
    } else {
      scribeRef.current?.startListening(
        updatedSnippets => setSnippets(updatedSnippets),
        (soapDraft, parsed) => {
          setGeneratedSoap(soapDraft);
          setParsedEntities(parsed);
        }
      );
      setIsRecording(true);
    }
  };

  // Demo simulation feeder to demonstrate instant auto-coding without needing live mic access
  const loadRealisticClinicalSimulation = () => {
    const demoConversation = `
      Patient: Doctor, for the past 4 days my throat has felt like sandpaper, and I started running a fever yesterday. It hurts when I swallow anything cold or warm.
      Doctor: Let me examine your pharynx. I see significant bilateral pharyngeal erythema and tonsillar exudate present. Your lungs are clear bilaterally with no wheezing.
      Doctor: We are going to run a rapid strep swab right now. In the meantime, I am going to prescribe Amoxicillin 500mg three times a day for 10 days.
      Doctor: Make sure you maintain generous oral hydration with plenty of water, and do warm salt water gargles 3 times daily. If you have severe trouble swallowing, seek immediate emergency care. Let's follow up in 2 weeks.
    `;

    const parsed = parseClinicalConversation(demoConversation);
    const soapDraft = generateSoapFromEntities(parsed);

    const demoSnippets: ScribeTranscriptSnippet[] = [
      { speaker: 'PATIENT', text: "Doctor, for the past 4 days my throat has felt like sandpaper, and I started running a fever yesterday. It hurts when I swallow.", timestamp: Date.now() - 30000 },
      { speaker: 'DOCTOR', text: "Let me examine your pharynx. I see bilateral pharyngeal erythema and tonsillar exudate present. Lungs clear bilaterally.", timestamp: Date.now() - 20000 },
      { speaker: 'DOCTOR', text: "We will order a rapid strep swab and start Amoxicillin 500mg three times daily for 10 days. Maintain generous hydration and salt water gargles.", timestamp: Date.now() - 10000 },
    ];

    setSnippets(demoSnippets);
    setParsedEntities(parsed);
    setGeneratedSoap(soapDraft);
  };

  const handleReadAloud = () => {
    if (!parsedEntities) return;
    setIsSpeaking(true);
    const instructions = parsedEntities.patientInstructions.join(' ');
    const meds = parsedEntities.medications.map(m => `${m.drugName}, ${m.sig}`).join('. ');
    const speech = `Your diagnosis is ${parsedEntities.suspectedDiagnoses[0]?.desc || 'evaluated condition'}. We have prescribed ${meds}. Please ${instructions}`;
    speakDischargeInstructionsToPatient(patientName, speech);
    setTimeout(() => setIsSpeaking(false), 8000);
  };

  const handleApply = () => {
    if (generatedSoap && onApplyToNote) {
      onApplyToNote(generatedSoap);
    }
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#0c0517] border border-white/15 rounded-3xl max-w-4xl w-full p-6 text-white shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto font-sans"
      >
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#06D6A0]/20 border border-[#06D6A0]/40 text-[#06D6A0] uppercase tracking-wider">
                Ambient AI Clinical Scribe
              </span>
              <span className="text-xs text-white/50">• {patientName}</span>
            </div>
            <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white mt-1">
              Live Doctor-Patient Auto-Coding Engine
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadRealisticClinicalSimulation}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/15 text-white/80 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5"
            >
              <Sparkles size={12} className="text-[#00DAF3]" /> Load Clinical Demo
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Ambient Listening Control Stage */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleRecording}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-xl ${
                isRecording
                  ? 'bg-[#EF4444] text-white animate-pulse shadow-[#EF4444]/40'
                  : 'bg-[#06D6A0] text-black hover:brightness-110 shadow-[#06D6A0]/30'
              }`}
            >
              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <div>
              <div className="text-sm font-bold text-white font-['Space_Grotesk']">
                {isRecording ? 'Listening Ambiently in Exam Room...' : 'Ambient Scribe Ready'}
              </div>
              <p className="text-xs text-white/60">
                {isRecording
                  ? 'Passively analyzing doctor-patient dialogue to extract symptoms, observations, and codes.'
                  : 'Click the microphone to begin listening, or tap "Load Clinical Demo" to preview.'}
              </p>
            </div>
          </div>

          {parsedEntities && (
            <button
              type="button"
              onClick={handleReadAloud}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-[#00DAF3]/20 border border-[#00DAF3]/40 text-[#00DAF3] hover:bg-[#00DAF3]/30 transition-all flex items-center gap-1.5 whitespace-nowrap"
            >
              <Volume2 size={14} />
              <span>{isSpeaking ? 'Reading Aloud...' : 'Read Plan to Patient'}</span>
            </button>
          )}
        </div>

        {/* Real-time Extracted Code Pills (The Live Auto-Coding Output!) */}
        {parsedEntities && (
          <div className="p-5 bg-gradient-to-r from-[#00DAF3]/10 via-[#06D6A0]/10 to-transparent border border-[#00DAF3]/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#00DAF3] uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-[#06D6A0]" />
                Auto-Populated Diagnostic & Procedure Codes
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-white/60">
                Sub-Millisecond Crosswalk
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {/* Auto Diagnoses */}
              {parsedEntities.suspectedDiagnoses.map(diag => (
                <div
                  key={diag.code}
                  className="px-3 py-1.5 rounded-xl bg-[#FFD166]/15 border border-[#FFD166]/30 text-xs font-mono text-white flex items-center gap-2 shadow-sm"
                >
                  <span className="px-1.5 py-0.5 rounded bg-[#FFD166]/30 text-[#FFD166] font-bold text-[10px]">
                    ICD-10 {diag.code}
                  </span>
                  <span>{diag.desc}</span>
                </div>
              ))}

              {/* Auto Procedures */}
              {parsedEntities.recommendedProcedures.map(proc => (
                <div
                  key={proc.code}
                  className="px-3 py-1.5 rounded-xl bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-xs font-mono text-white flex items-center gap-2 shadow-sm"
                >
                  <span className="px-1.5 py-0.5 rounded bg-[#00DAF3]/30 text-[#00DAF3] font-bold text-[10px]">
                    {proc.type} {proc.code}
                  </span>
                  <span>{proc.desc}</span>
                  {proc.standardFee && (
                    <strong className="text-[#06D6A0]">${proc.standardFee}</strong>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Conversation Transcript Stream */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-white/50 uppercase tracking-wider block">
            Live Conversation Transcript:
          </label>
          <div className="p-4 bg-black/40 border border-white/10 rounded-2xl max-h-48 overflow-y-auto space-y-2 text-xs font-sans">
            {snippets.length === 0 ? (
              <span className="text-white/30 italic">
                Awaiting speech input... Speak normally in the room with your patient.
              </span>
            ) : (
              snippets.map((s, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase mt-0.5 ${
                      s.speaker === 'DOCTOR'
                        ? 'bg-[#00DAF3]/20 text-[#00DAF3]'
                        : 'bg-[#FFD166]/20 text-[#FFD166]'
                    }`}
                  >
                    {s.speaker}
                  </span>
                  <span className="text-white/80 leading-relaxed">{s.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Structured S-O-A-P Preview Generated Automatically */}
        {generatedSoap && (
          <div className="space-y-3 p-5 bg-white/[0.02] border border-white/10 rounded-2xl">
            <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={13} className="text-[#06D6A0]" />
              Structured SOAP Note (Ready for Medical Record):
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-1">
                <span className="text-[10px] font-mono font-bold text-[#00DAF3] uppercase block">
                  Subjective (S)
                </span>
                <p className="text-white/70 leading-relaxed">{generatedSoap.subjective?.hpi}</p>
              </div>

              <div className="p-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-1">
                <span className="text-[10px] font-mono font-bold text-[#06D6A0] uppercase block">
                  Objective (O)
                </span>
                <p className="text-white/70 leading-relaxed">
                  {generatedSoap.objective?.physicalExamFindings}
                </p>
              </div>

              <div className="p-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-1">
                <span className="text-[10px] font-mono font-bold text-[#FFD166] uppercase block">
                  Assessment (A)
                </span>
                <p className="text-white/70 leading-relaxed">
                  {generatedSoap.assessment?.diagnoses?.map(d => `${d.code} - ${d.description}`).join('; ')}
                </p>
              </div>

              <div className="p-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-1">
                <span className="text-[10px] font-mono font-bold text-[#D40055] uppercase block">
                  Plan & Rx (P)
                </span>
                <p className="text-white/70 leading-relaxed">
                  {generatedSoap.plan?.ordersAndTreatment} {generatedSoap.plan?.patientInstructions}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <div className="text-[11px] font-mono text-white/40">
            Ambient NLP • HIPAA-safe local in-memory processing
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!generatedSoap}
              onClick={handleApply}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#00DAF3] to-[#06D6A0] text-black shadow-lg shadow-[#00DAF3]/25 hover:brightness-110 transition-all disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} />
              <span>Apply Directly to Encounter Chart</span>
            </button>
          </div>
        </div>

      </motion.div>
    </div>
  );
};

export default AmbientClinicalScribeModal;
