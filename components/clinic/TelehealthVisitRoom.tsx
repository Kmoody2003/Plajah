import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Monitor,
  FileText, Activity, BookOpen, Layers, Sparkles,
  Maximize2, Minimize2, CheckCircle2, ChevronRight, User,
  Share2, Shield, Heart, Eye, MessageSquare, Send, Copy, ExternalLink, FlaskConical, Loader2, Users
} from 'lucide-react';
import type { Appointment, ClinicalSoapNote } from '../../types/clinic';
import { getSoapNoteByAppointmentId, getAvailableMedicalCourses, saveSoapNote } from '../../services/clinicService';
import ClinicalSoapNoteEditor from './ClinicalSoapNoteEditor';
import TelehealthPatientView from './TelehealthPatientView';
import { VisitCall, newVisitSessionId, patientJoinUrl, type VisitChatMessage } from '../../services/clinic/telehealthCall';
import { ensureGuestAuth } from '../../services/backendService';

interface TelehealthVisitRoomProps {
  appointment: Appointment;
  onEndCall: () => void;
}

export const TelehealthVisitRoom: React.FC<TelehealthVisitRoomProps> = ({
  appointment,
  onEndCall,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'SOAP' | 'ANATOMY' | 'EDUCATION' | 'CHAT'>('SOAP');
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Active anatomical system for 3D education
  const [selectedAnatomySystem, setSelectedAnatomySystem] = useState<string>('cardiovascular');

  // Load or initialize SOAP note
  const [soapNote, setSoapNote] = useState<ClinicalSoapNote>({
    id: `soap-${appointment.id}`,
    appointmentId: appointment.id,
    businessId: appointment.businessId,
    patientName: appointment.patientName,
    providerId: appointment.providerId,
    providerName: appointment.providerName,
    encounterDate: appointment.scheduledDate,
    encounterType: 'TELEHEALTH',
    subjective: {
      chiefComplaint: appointment.chiefComplaint || 'Virtual telemedicine consultation',
      hpi: '',
    },
    objective: {
      vitals: {
        bpSystolic: 120,
        bpDiastolic: 80,
        heartRate: 72,
        temperatureF: 98.6,
        o2Saturation: 99,
      },
      physicalExamFindings: 'Patient observed via telehealth: alert, oriented, comfortable.',
    },
    assessment: {
      diagnoses: [],
    },
    plan: {
      ordersAndTreatment: '',
      prescriptions: [],
      educationalPrescriptions: [],
      followUp: 'Follow up as needed in 4 weeks',
      patientInstructions: '',
    },
    isLocked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // ── Real call (demo): provider side. The patient joins from a link or the on-device preview. ──
  const [sessionId] = useState(newVisitSessionId);
  const callRef = useRef<VisitCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [patientHere, setPatientHere] = useState(false);
  const [patientConsented, setPatientConsented] = useState(false);
  const [connState, setConnState] = useState<RTCPeerConnectionState>('new');
  const [callError, setCallError] = useState<string | null>(null);
  const [chat, setChat] = useState<VisitChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [previewPatient, setPreviewPatient] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const joinLink = patientJoinUrl(sessionId, appointment.patientName);
  const connected = connState === 'connected' && !!remoteStream;

  // Call timer
  useEffect(() => {
    const timer = setInterval(() => setCallDuration(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Real WebRTC call: camera/mic capture + signalling run through the platform's rtcCore.
  useEffect(() => {
    let cancelled = false;
    const call = new VisitCall(sessionId, 'provider', appointment.providerName || 'Provider', {
      onLocal: setLocalStream,
      onRemote: setRemoteStream,
      onPeerLeft: () => { setRemoteStream(null); setConnState('disconnected'); },
      onPresence: here => setPatientHere(here),
      onState: setConnState,
      onChat: m => setChat(c => [...c, m]),
      onConsent: () => setPatientConsented(true),
      onError: setCallError,
    });
    callRef.current = call;
    ensureGuestAuth().then(() => { if (!cancelled) call.join().catch(() => { /* shown via onError */ }); });
    return () => { cancelled = true; call.leave().catch(() => {}); callRef.current = null; };
  }, [sessionId]);

  useEffect(() => { if (localVideoRef.current) localVideoRef.current.srcObject = localStream; }, [localStream]);
  useEffect(() => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream; }, [remoteStream, connected]);

  useEffect(() => {

    // Load existing SOAP note if present
    getSoapNoteByAppointmentId(appointment.id).then(existing => {
      if (existing) setSoapNote(existing);
    });
  }, [appointment.id]);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const medicalCourses = getAvailableMedicalCourses();

  return (
    <div className="fixed inset-0 z-50 bg-[#07030d] text-white flex flex-col overflow-hidden font-sans">
      
      {/* Top Telehealth Navigation Bar */}
      <div className="h-16 px-6 bg-black/60 border-b border-white/10 backdrop-blur-xl flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#06D6A0] animate-pulse" />
            <span className="text-xs font-mono font-bold tracking-widest text-[#06D6A0] uppercase">
              LIVE TELEHEALTH ENCOUNTER
            </span>
          </div>
          <span className="text-white/30 hidden sm:inline">•</span>
          <div className="hidden sm:block">
            <h2 className="text-sm font-bold text-white font-['Space_Grotesk']">
              {appointment.patientName}
            </h2>
            <span className="text-[10px] font-mono text-white/50">
              {appointment.serviceName}
            </span>
          </div>
        </div>

        {/* Timer & Encryption Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/70">
            <span className="text-white/40">Duration:</span>
            <strong className="text-white">{formatSeconds(callDuration)}</strong>
          </div>
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#06D6A0]/10 border border-[#06D6A0]/30 text-[10px] font-mono text-[#06D6A0] font-bold">
            <Shield size={11} /> Demo · encrypted in transit
          </div>
          <button
            type="button"
            onClick={onEndCall}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-[#EF4444]/30 transition-all flex items-center gap-1.5"
          >
            <PhoneOff size={13} /> Complete Visit
          </button>
        </div>
      </div>

      {/* Main Stage: Left Video Area + Right Clinical Drawer */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left: Video Consult Canvas */}
        <div className="flex-1 relative bg-gradient-to-br from-[#0e0719] via-[#080310] to-[#000000] flex flex-col items-center justify-center p-6">
          
          {/* Main Remote Video (Patient View Canvas) */}
          <div className="relative w-full max-w-4xl h-full max-h-[720px] rounded-3xl overflow-hidden border border-white/10 bg-black/60 shadow-2xl flex items-center justify-center">
            
            {/* Remote video: the patient, once connected */}
            <video ref={remoteVideoRef} autoPlay playsInline className={`absolute inset-0 w-full h-full object-cover ${connected ? 'block' : 'hidden'}`} />

            {!connected && (
              <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-md">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#6B0099] via-[#00DAF3] to-[#06D6A0] flex items-center justify-center text-white mb-4 shadow-2xl border-2 border-white/20">
                  <User size={48} className="text-white/90" />
                </div>
                <h3 className="text-2xl font-black text-white font-['Space_Grotesk']">{appointment.patientName}</h3>
                <p className="text-xs font-mono text-[#FFD166] mt-1 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  {patientHere ? 'Patient is in the room — connecting…' : 'Waiting for the patient to join'}
                </p>
                {callError && <p className="text-xs text-red-300 mt-2">{callError}</p>}
                <div className="mt-4 w-full rounded-2xl bg-black/50 border border-white/10 p-3 text-left space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/50 block">Invite the (demo) patient</span>
                  <div className="flex items-center gap-2">
                    <input readOnly value={joinLink} onFocus={e => e.currentTarget.select()} className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white/80 font-mono" />
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(joinLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); }).catch(() => {}); }} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1"><Copy size={12} /> {linkCopied ? 'Copied' : 'Copy'}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => window.open(joinLink, '_blank', 'noopener')} className="px-2.5 py-1.5 rounded-lg bg-[#00DAF3] text-black text-[11px] font-bold flex items-center gap-1"><ExternalLink size={12} /> Open patient view in a new window</button>
                    <button type="button" onClick={() => setPreviewPatient(p => !p)} className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold flex items-center gap-1"><Users size={12} /> {previewPatient ? 'Hide' : 'Preview'} patient on this device</button>
                  </div>
                  <p className="text-[10px] text-white/40">Open the link on a phone or another computer to try a real two-way call. Demo patients only.</p>
                </div>
              </div>
            )}

            {connected && (
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 border border-white/15 text-[10px] font-mono text-white/80">
                <span className="w-2 h-2 rounded-full bg-[#06D6A0]" /> {appointment.patientName}
                {patientConsented && <span className="text-[#06D6A0]">· accepted demo notice</span>}
              </div>
            )}

            {/* On-device preview of what the patient sees (a second real peer in this window) */}
            {previewPatient && (
              <div className="absolute bottom-24 left-4 z-30 w-56 h-40 rounded-2xl overflow-hidden border-2 border-[#FFD166] shadow-2xl">
                <div className="absolute top-0 inset-x-0 z-10 px-2 py-0.5 bg-black/70 text-[9px] font-mono text-[#FFD166] uppercase tracking-wider">Patient's view (preview)</div>
                <TelehealthPatientView embedded sessionId={sessionId} patientName={appointment.patientName} />
              </div>
            )}

            {/* Picture-in-Picture: Doctor Self View */}
            <div className="absolute top-4 right-4 z-20 w-36 h-28 sm:w-44 sm:h-32 rounded-2xl overflow-hidden border-2 border-[#00DAF3] shadow-2xl bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`}
              />
              {isVideoOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black/90 text-white/40 text-xs">
                  <VideoOff size={18} />
                  <span className="text-[10px] mt-1 font-mono">Camera Off</span>
                </div>
              )}
              <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[9px] font-mono text-white/80">
                {appointment.providerName} (You)
              </div>
            </div>

            {/* In-Call Controls Floating Bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-black/80 border border-white/20 backdrop-blur-2xl shadow-2xl">
              <button
                type="button"
                onClick={() => { const m = !isMuted; setIsMuted(m); callRef.current?.setMuted(m); }}
                className={`p-3 rounded-xl transition-all ${
                  isMuted ? 'bg-[#EF4444] text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              <button
                type="button"
                onClick={() => { const o = !isVideoOff; setIsVideoOff(o); callRef.current?.setVideoOff(o); }}
                className={`p-3 rounded-xl transition-all ${
                  isVideoOff ? 'bg-[#EF4444] text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
              </button>

              <button
                type="button"
                onClick={async () => { if (isScreenSharing) { callRef.current?.stopShare(); setIsScreenSharing(false); } else { setIsScreenSharing(await (callRef.current?.startShare() ?? Promise.resolve(false))); } }}
                className={`p-3 rounded-xl transition-all ${
                  isScreenSharing ? 'bg-[#00DAF3] text-black font-bold' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title="Share Screen"
              >
                <Monitor size={18} />
              </button>

              <div className="h-6 w-px bg-white/20 mx-1" />

              <button
                type="button"
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isDrawerOpen ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <FileText size={15} />
                <span>Clinical Companion</span>
              </button>
            </div>

          </div>

        </div>

        {/* Right: Collapsible Clinical Companion Drawer */}
        <AnimatePresence>
          {isDrawerOpen && (
            <motion.div
              initial={{ x: 420, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 420, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full md:w-[480px] lg:w-[540px] bg-[#0c0617] border-l border-white/10 flex flex-col z-20 shadow-2xl overflow-hidden"
            >
              {/* Drawer Tab Headers */}
              <div className="p-3 bg-white/[0.02] border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveDrawerTab('SOAP')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeDrawerTab === 'SOAP'
                        ? 'bg-[#00DAF3] text-black shadow-md shadow-[#00DAF3]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <FileText size={13} /> SOAP Note
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDrawerTab('ANATOMY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeDrawerTab === 'ANATOMY'
                        ? 'bg-[#06D6A0] text-black shadow-md shadow-[#06D6A0]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Layers size={13} /> 3D Anatomy
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDrawerTab('EDUCATION')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeDrawerTab === 'EDUCATION'
                        ? 'bg-[#A855F7] text-white shadow-md shadow-[#A855F7]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <BookOpen size={13} /> Prescribe
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveDrawerTab('CHAT')}
                  className={`ml-auto mr-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeDrawerTab === 'CHAT' ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <MessageSquare size={13} /> Chat{chat.length ? ` (${chat.length})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-white/40 hover:text-white p-1"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* Tab 1: Live SOAP Note */}
                {activeDrawerTab === 'SOAP' && (
                  <div>
                    <ClinicalSoapNoteEditor
                      note={soapNote}
                      onSave={saved => setSoapNote(saved)}
                    />
                  </div>
                )}

                {/* Tab 2: 3D Interactive Anatomy Visualizer */}
                {activeDrawerTab === 'ANATOMY' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#06D6A0] uppercase tracking-wider block">
                          Patient Education Visualizer
                        </span>
                        <h4 className="text-base font-bold text-white font-['Space_Grotesk']">
                          Interactive 3D Body & Systems
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#06D6A0]/20 text-[#06D6A0] border border-[#06D6A0]/30 font-bold">
                        WebGL Active
                      </span>
                    </div>

                    {/* System Switcher */}
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'cardiovascular', label: '❤️ Cardiovascular' },
                        { id: 'respiratory', label: '🫁 Respiratory' },
                        { id: 'dental', label: '🦷 Dental & Maxillofacial' },
                        { id: 'skeletal', label: '🦴 Skeletal & Joints' },
                        { id: 'nervous', label: '🧠 Nervous System' },
                      ].map(sys => (
                        <button
                          key={sys.id}
                          type="button"
                          onClick={() => setSelectedAnatomySystem(sys.id)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                            selectedAnatomySystem === sys.id
                              ? 'bg-[#06D6A0] text-black border-[#06D6A0]'
                              : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {sys.label}
                        </button>
                      ))}
                    </div>

                    {/* 3D Viewport Simulation / Interactive Model Display */}
                    <div className="h-72 rounded-2xl bg-black border border-white/15 relative overflow-hidden flex flex-col items-center justify-center p-4">
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#06D6A0]/10 via-transparent to-black" />
                      
                      <div className="relative z-10 text-center space-y-2">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#06D6A0]/30 to-[#00DAF3]/30 border border-[#06D6A0]/40 flex items-center justify-center text-[#06D6A0] shadow-xl">
                          <Activity size={32} />
                        </div>
                        <h5 className="text-sm font-bold text-white capitalize">
                          {selectedAnatomySystem} Architecture
                        </h5>
                        <p className="text-[11px] text-white/60 max-w-xs mx-auto">
                          Interactive 3D model active. Click and drag on screen to rotate, zoom, and highlight anatomical structures for the patient.
                        </p>
                      </div>

                      <div className="absolute bottom-3 left-3 text-[9px] font-mono text-white/40">
                        Human Body Explorer • Plajah 3D Mesh Engine
                      </div>
                      <div className="absolute bottom-3 right-3">
                        <button
                          type="button"
                          onClick={() => alert('Broadcasting 3D model viewport to patient video canvas...')}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-[#00DAF3] text-black shadow-md hover:brightness-110 transition-all flex items-center gap-1"
                        >
                          <Share2 size={10} /> Share 3D to Call
                        </button>
                      </div>
                    </div>

                    {/* Clinical Explanations Card */}
                    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-2">
                      <h6 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                        Patient Explanatory Guide:
                      </h6>
                      <p className="text-xs text-white/70 leading-relaxed">
                        {selectedAnatomySystem === 'cardiovascular' &&
                          'Show the patient how arterial resistance affects systolic workload, demonstrating why medication reduces stress on the left ventricle.'}
                        {selectedAnatomySystem === 'dental' &&
                          'Demonstrate how enamel demineralization progresses past the dentinoenamel junction (DEJ) into the dental pulp, causing sensitivity.'}
                        {selectedAnatomySystem === 'respiratory' &&
                          'Illustrate bronchiolar constriction during reactive airway episodes and how inhalers relax smooth muscle.'}
                        {selectedAnatomySystem === 'skeletal' &&
                          'Highlight the lumbar disc herniation impinging on the L5 nerve root, validating their radiating leg symptoms.'}
                        {selectedAnatomySystem === 'nervous' &&
                          'Explain how benign paroxysmal positional vertigo (BPPV) dislodges canaliths in the posterior semicircular canal.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Tab 3: Prescribe Curriculum Modules */}
                {/* Tab: visit chat (demo — ephemeral, nothing is stored) */}
                {activeDrawerTab === 'CHAT' && (
                  <div className="flex flex-col h-[60vh]">
                    <div className="flex-1 overflow-y-auto space-y-2 text-sm pr-1">
                      {chat.length === 0 && <p className="text-xs text-white/40">Visit chat with the patient. In this demo messages are not saved anywhere.</p>}
                      {chat.map(m => (
                        <div key={m.id} className={m.who === 'me' ? 'text-right' : ''}>
                          <span className={`inline-block px-3 py-1.5 rounded-2xl text-xs ${m.who === 'me' ? 'bg-[#00DAF3] text-black' : 'bg-white/10 text-white'}`}>{m.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 flex gap-2">
                      <input value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { callRef.current?.sendChat(chatDraft); setChatDraft(''); } }} placeholder="Message the patient…" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#00DAF3]" />
                      <button type="button" onClick={() => { callRef.current?.sendChat(chatDraft); setChatDraft(''); }} className="px-3 rounded-xl bg-[#00DAF3] text-black" aria-label="Send"><Send size={14} /></button>
                    </div>
                  </div>
                )}

                {activeDrawerTab === 'EDUCATION' && (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-[#A855F7] uppercase tracking-wider block">
                        Prescribe Knowledge
                      </span>
                      <h4 className="text-base font-bold text-white font-['Space_Grotesk']">
                        Medical Curriculum Modules
                      </h4>
                      <p className="text-xs text-white/60">
                        Assign plain-language or in-depth interactive courses to {appointment.patientName}'s portal.
                      </p>
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {medicalCourses.map(c => {
                        const isPrescribed = (soapNote.plan.educationalPrescriptions || []).some(
                          e => e.courseId === c.id
                        );
                        return (
                          <div
                            key={c.id}
                            className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#A855F7]/50 transition-all flex items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/60 uppercase">
                                  {c.stage}
                                </span>
                                <h5 className="text-xs font-bold text-white">{c.title}</h5>
                              </div>
                              <p className="text-[11px] text-white/50 leading-snug">{c.blurb}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const current = soapNote.plan.educationalPrescriptions || [];
                                if (isPrescribed) {
                                  const updated = current.filter(e => e.courseId !== c.id);
                                  setSoapNote({ ...soapNote, plan: { ...soapNote.plan, educationalPrescriptions: updated } });
                                } else {
                                  const updated = [...current, { courseId: c.id, title: c.title, blurb: c.blurb, assignedAt: Date.now() }];
                                  setSoapNote({ ...soapNote, plan: { ...soapNote.plan, educationalPrescriptions: updated } });
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all ${
                                isPrescribed
                                  ? 'bg-[#06D6A0]/20 text-[#06D6A0] border border-[#06D6A0]/30'
                                  : 'bg-[#A855F7] text-white hover:brightness-110 shadow-md shadow-[#A855F7]/20'
                              }`}
                            >
                              {isPrescribed ? 'Prescribed ✓' : '+ Prescribe'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

    </div>
  );
};

export default TelehealthVisitRoom;
