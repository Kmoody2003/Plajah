import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon, Clock, Video, User, Plus, Search,
  Filter, CheckCircle2, ChevronRight, FileText, Phone, Mail,
  DollarSign, Activity, AlertCircle, Play, Shield, RefreshCw,
  Sparkles, Layers, Printer, Stethoscope
} from 'lucide-react';
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  ClinicalSoapNote,
  PatientIntakeForm,
  Superbill
} from '../../types/clinic';
import {
  fetchAppointmentsForBusiness,
  saveAppointment,
  updateAppointmentStatus,
  generateTimeSlots
} from '../../services/appointmentService';
import {
  getSoapNoteByAppointmentId,
  fetchIntakeByAppointmentId,
  COMMON_ICD10_CODES,
  COMMON_PROCEDURE_CODES
} from '../../services/clinicService';
import TelehealthVisitRoom from './TelehealthVisitRoom';
import ClinicalSoapNoteEditor from './ClinicalSoapNoteEditor';
import PatientIntakeModal from './PatientIntakeModal';
import DentalOdontogram from './DentalOdontogram';
import SuperbillModal from './SuperbillModal';
import CodingScrubberConsole from './CodingScrubberConsole';
import { realLookingContact } from '../../services/clinic/phiGuard';

interface AppointmentsManagerProps {
  businessId: string;
  businessName?: string;
  isHealthOrDental?: boolean;
}

export const AppointmentsManager: React.FC<AppointmentsManagerProps> = ({
  businessId,
  businessName = 'Clinic',
  isHealthOrDental = true,
}) => {
  const [activeView, setActiveView] = useState<'VISITS' | 'CODES'>('VISITS');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'TELEHEALTH' | 'IN_PERSON'>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modals & Active Workspaces
  const [activeTelehealthApt, setActiveTelehealthApt] = useState<Appointment | null>(null);
  const [activeSoapNote, setActiveSoapNote] = useState<ClinicalSoapNote | null>(null);
  const [activeIntake, setActiveIntake] = useState<PatientIntakeForm | null>(null);
  const [activeDentalChartApt, setActiveDentalChartApt] = useState<Appointment | null>(null);
  const [activeSuperbill, setActiveSuperbill] = useState<Superbill | null>(null);
  const [showNewAptModal, setShowNewAptModal] = useState(false);

  // New Appointment Form State
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newScheduledDate, setNewScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newDuration, setNewDuration] = useState(30);
  const [newType, setNewType] = useState<AppointmentType>('IN_PERSON');
  const [newServiceName, setNewServiceName] = useState(isHealthOrDental ? 'General Consultation / Exam' : 'Appointment Service');
  const [newProviderName, setNewProviderName] = useState('Dr. Marcus Vance, MD');
  const [newPrice, setNewPrice] = useState(95);
  const [newChiefComplaint, setNewChiefComplaint] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAppointmentsForBusiness(businessId);
      setAppointments(data);
    } catch (e) {
      console.error('Failed to load appointments', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId]);

  // Available Time Slots
  const availableSlots = useMemo(() => generateTimeSlots(8, 18, 30), []);

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter(apt => {
      const matchesSearch =
        apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        apt.patientPhone.includes(searchQuery);

      const matchesType =
        filterType === 'ALL' || apt.type === filterType;

      const matchesStatus =
        filterStatus === 'ALL' || apt.status === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [appointments, searchQuery, filterType, filterStatus]);

  // Statistics Ribbon
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayList = appointments.filter(a => a.scheduledDate === today);
    const checkedIn = appointments.filter(a => a.status === 'CHECKED_IN').length;
    const teleToday = todayList.filter(a => a.type === 'TELEHEALTH').length;
    const completed = appointments.filter(a => a.status === 'COMPLETED').length;
    const totalRevenue = appointments.reduce((sum, a) => sum + (a.price || 0), 0);

    return {
      total: appointments.length,
      todayCount: todayList.length,
      checkedIn,
      teleToday,
      completed,
      totalRevenue,
    };
  }, [appointments]);

  // Status Advancement
  const advanceStatus = async (apt: Appointment, nextStatus: AppointmentStatus) => {
    await updateAppointmentStatus(apt.id, nextStatus);
    setAppointments(prev =>
      prev.map(a => (a.id === apt.id ? { ...a, status: nextStatus, updatedAt: Date.now() } : a))
    );
  };

  // Launch SOAP Note editor
  const handleOpenSoapNote = async (apt: Appointment) => {
    const existing = await getSoapNoteByAppointmentId(apt.id);
    if (existing) {
      setActiveSoapNote(existing);
    } else {
      const newNote: ClinicalSoapNote = {
        id: `soap-${apt.id}`,
        appointmentId: apt.id,
        businessId: apt.businessId,
        patientName: apt.patientName,
        providerId: apt.providerId,
        providerName: apt.providerName,
        encounterDate: apt.scheduledDate,
        encounterType: apt.type === 'TELEHEALTH' ? 'TELEHEALTH' : apt.serviceName.toLowerCase().includes('dental') ? 'DENTAL_EXAM' : 'IN_PERSON',
        subjective: {
          chiefComplaint: apt.chiefComplaint || apt.serviceName,
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
          physicalExamFindings: '',
        },
        assessment: {
          diagnoses: [],
        },
        plan: {
          ordersAndTreatment: '',
          prescriptions: [],
          educationalPrescriptions: [],
          followUp: 'Follow up in 4 weeks',
          patientInstructions: '',
        },
        isLocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setActiveSoapNote(newNote);
    }
  };

  // Launch Intake form modal
  const handleOpenIntake = async (apt: Appointment) => {
    const intake = await fetchIntakeByAppointmentId(apt.id);
    if (intake) {
      setActiveIntake(intake);
    } else {
      setActiveIntake({
        id: `intake-${apt.id}`,
        appointmentId: apt.id,
        businessId: apt.businessId,
        patientName: apt.patientName,
        dob: '1990-01-01',
        phone: apt.patientPhone,
        email: apt.patientEmail,
        chiefComplaint: apt.chiefComplaint || apt.serviceName,
        allergies: [],
        currentMedications: [],
        pastMedicalHistory: [],
        surgicalHistory: [],
        consentSigned: true,
        consentSignerName: apt.patientName,
        consentDate: apt.scheduledDate,
        createdAt: Date.now(),
      });
    }
  };

  // Launch Superbill
  const handleOpenSuperbill = (apt: Appointment) => {
    const sb: Superbill = {
      id: `sb-${apt.id}`,
      appointmentId: apt.id,
      businessId: apt.businessId,
      patientName: apt.patientName,
      providerName: apt.providerName,
      providerNpi: '1982736451',
      clinicTaxId: '82-9481029',
      dateOfService: apt.scheduledDate,
      icd10Codes: [
        { code: 'I10', desc: 'Essential (primary) hypertension' },
      ],
      procedureCodes: [
        { code: apt.type === 'TELEHEALTH' ? '99442' : '99213', desc: apt.serviceName, units: 1, fee: apt.price || 110 },
      ],
      totalBilled: apt.price || 110,
      patientPaid: apt.paymentStatus === 'PAID' ? (apt.price || 110) : 0,
      balanceDue: apt.paymentStatus === 'PAID' ? 0 : (apt.price || 110),
    };
    setActiveSuperbill(sb);
  };

  // Handle New Appointment Submission
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;

    // Calculate end time
    const [h, m] = newStartTime.split(':').map(Number);
    const endMinutes = h * 60 + m + newDuration;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const calcEndTime = `${pad(endH)}:${pad(endM)}`;

    const saved = await saveAppointment({
      businessId,
      patientName: newPatientName,
      patientEmail: newPatientEmail,
      patientPhone: newPatientPhone,
      scheduledDate: newScheduledDate,
      startTime: newStartTime,
      endTime: calcEndTime,
      durationMinutes: newDuration,
      type: newType,
      serviceName: newServiceName,
      providerName: newProviderName,
      price: Number(newPrice),
      chiefComplaint: newChiefComplaint,
      status: 'SCHEDULED',
      paymentStatus: 'UNPAID',
    });

    setAppointments(prev => [saved, ...prev]);
    setShowNewAptModal(false);
    // Reset form
    setNewPatientName('');
    setNewPatientEmail('');
    setNewPatientPhone('');
    setNewChiefComplaint('');
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'CHECKED_IN':
        return { label: 'Checked In', color: '#00DAF3', bg: '#00DAF315' };
      case 'IN_CONSULTATION':
        return { label: 'In Exam / Visit', color: '#06D6A0', bg: '#06D6A020' };
      case 'COMPLETED':
        return { label: 'Completed', color: '#06D6A0', bg: '#06D6A010' };
      case 'CONFIRMED':
        return { label: 'Confirmed', color: '#FFD166', bg: '#FFD16615' };
      case 'CANCELLED':
        return { label: 'Cancelled', color: '#EF4444', bg: '#EF444415' };
      default:
        return { label: 'Scheduled', color: '#ffffff80', bg: '#ffffff0a' };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Telehealth Fullscreen Stage (if active) */}
      {activeTelehealthApt && (
        <TelehealthVisitRoom
          appointment={activeTelehealthApt}
          onEndCall={() => {
            advanceStatus(activeTelehealthApt, 'COMPLETED');
            setActiveTelehealthApt(null);
          }}
        />
      )}

      {/* Top Controls & Metrics Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
          <span className="text-[10px] font-mono text-white/50 uppercase block">TODAY'S SCHEDULE</span>
          <div className="text-2xl font-black font-['Space_Grotesk'] text-white mt-1">
            {stats.todayCount} Visits
          </div>
          <span className="text-[10px] text-white/40 font-mono">Total on calendar</span>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
          <span className="text-[10px] font-mono text-[#00DAF3] uppercase block font-bold">WAITING ROOM</span>
          <div className="text-2xl font-black font-['Space_Grotesk'] text-[#00DAF3] mt-1">
            {stats.checkedIn} Checked-In
          </div>
          <span className="text-[10px] text-white/40 font-mono">Ready for rooming</span>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
          <span className="text-[10px] font-mono text-[#06D6A0] uppercase block font-bold">TELEHEALTH TODAY</span>
          <div className="text-2xl font-black font-['Space_Grotesk'] text-[#06D6A0] mt-1">
            {stats.teleToday} Virtual
          </div>
          <span className="text-[10px] text-white/40 font-mono">P2P Encrypted visits</span>
        </div>

        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
          <span className="text-[10px] font-mono text-white/50 uppercase block">COMPLETED</span>
          <div className="text-2xl font-black font-['Space_Grotesk'] text-white mt-1">
            {stats.completed} Done
          </div>
          <span className="text-[10px] text-white/40 font-mono">Encounters signed</span>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
          <span className="text-[10px] font-mono text-[#FFD166] uppercase block font-bold">BILLED VALUE</span>
          <div className="text-2xl font-black font-['Space_Grotesk'] text-[#FFD166] mt-1">
            ${stats.totalRevenue.toLocaleString()}
          </div>
          <span className="text-[10px] text-white/40 font-mono">Services & Copays</span>
        </div>
      </div>

      {/* View Selector: Visits vs On-Platform Coding Scrubber */}
      <div className="flex items-center gap-2 p-1.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveView('VISITS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeView === 'VISITS'
              ? 'bg-white text-black shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <CalendarIcon size={13} /> Schedule & Care Pipeline
        </button>
        <button
          type="button"
          onClick={() => setActiveView('CODES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeView === 'CODES'
              ? 'bg-[#06D6A0] text-black shadow-md shadow-[#06D6A0]/20'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Sparkles size={13} /> On-Platform Coding & Scrubber
        </button>
      </div>

      {activeView === 'CODES' ? (
        <CodingScrubberConsole />
      ) : (
        <>
          {/* Main Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search patient, phone, or clinical service..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#00DAF3] transition-all"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                filterType === 'ALL' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setFilterType('TELEHEALTH')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                filterType === 'TELEHEALTH' ? 'bg-[#06D6A0] text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              <Video size={11} /> Telehealth
            </button>
            <button
              type="button"
              onClick={() => setFilterType('IN_PERSON')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                filterType === 'IN_PERSON' ? 'bg-[#00DAF3] text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              In-Clinic
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowNewAptModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00DAF3] text-black shadow-lg shadow-[#00DAF3]/20 hover:brightness-110 transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus size={14} /> New Appointment
          </button>
        </div>
      </div>

      {/* Appointment Cards Feed */}
      <div className="space-y-3">
        {filteredAppointments.length === 0 ? (
          <div className="p-12 text-center bg-white/[0.02] border border-white/10 rounded-3xl space-y-3">
            <CalendarIcon size={36} className="mx-auto text-white/30" />
            <h4 className="text-base font-bold text-white">No Appointments Found</h4>
            <p className="text-xs text-white/50 max-w-sm mx-auto">
              There are no scheduled visits matching your search criteria. Click "+ New Appointment" to book a patient slot.
            </p>
          </div>
        ) : (
          filteredAppointments.map(apt => {
            const badge = getStatusBadge(apt.status);
            const isDental = apt.serviceName.toLowerCase().includes('oral') || apt.serviceName.toLowerCase().includes('dental') || apt.serviceName.toLowerCase().includes('crown');

            return (
              <motion.div
                key={apt.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/[0.03] border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left: Time & Patient Core Info */}
                <div className="flex items-start gap-4">
                  {/* Time Badge */}
                  <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.04] border border-white/10 min-w-[76px] text-center">
                    <span className="text-sm font-black font-mono text-white">{apt.startTime}</span>
                    <span className="text-[10px] font-mono text-white/50">{apt.durationMinutes} min</span>
                    <span className="text-[9px] font-mono uppercase text-[#00DAF3] mt-0.5">
                      {apt.type === 'TELEHEALTH' ? 'Virtual' : 'Clinic'}
                    </span>
                  </div>

                  {/* Patient Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white font-['Space_Grotesk']">
                        {apt.patientName}
                      </h4>
                      <span
                        className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider"
                        style={{ color: badge.color, backgroundColor: badge.bg }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-[#00DAF3]">
                      {apt.serviceName}
                    </div>

                    {apt.chiefComplaint && (
                      <p className="text-xs text-white/60 line-clamp-1 italic max-w-xl">
                        "{apt.chiefComplaint}"
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-white/40 pt-1">
                      <span>Provider: <strong className="text-white/70">{apt.providerName}</strong></span>
                      <span>•</span>
                      <span>Phone: {apt.patientPhone || '—'}</span>
                      <span>•</span>
                      <span>Fee: <strong className="text-white/80">${apt.price || 0}</strong> ({apt.paymentStatus})</span>
                    </div>
                  </div>
                </div>

                {/* Right: Clinical Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
                  
                  {/* Telehealth Launch Button */}
                  {apt.type === 'TELEHEALTH' && apt.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => {
                        advanceStatus(apt, 'IN_CONSULTATION');
                        setActiveTelehealthApt(apt);
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#06D6A0] text-black shadow-lg shadow-[#06D6A0]/20 hover:brightness-110 transition-all flex items-center gap-1.5"
                    >
                      <Video size={13} />
                      <span>Start Visit</span>
                    </button>
                  )}

                  {/* Check-In Toggle */}
                  {apt.type === 'IN_PERSON' && apt.status === 'SCHEDULED' && (
                    <button
                      type="button"
                      onClick={() => advanceStatus(apt, 'CHECKED_IN')}
                      className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 hover:bg-white/15 text-[#00DAF3] transition-all"
                    >
                      Check In
                    </button>
                  )}

                  {apt.status === 'CHECKED_IN' && (
                    <button
                      type="button"
                      onClick={() => advanceStatus(apt, 'IN_CONSULTATION')}
                      className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#06D6A0]/20 border border-[#06D6A0]/40 text-[#06D6A0] hover:bg-[#06D6A0]/30 transition-all"
                    >
                      Room Patient
                    </button>
                  )}

                  {/* SOAP Note Launcher */}
                  <button
                    type="button"
                    onClick={() => handleOpenSoapNote(apt)}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 hover:bg-white/15 text-white/80 hover:text-white transition-all flex items-center gap-1"
                  >
                    <FileText size={12} />
                    <span>SOAP Note</span>
                  </button>

                  {/* Digital Intake Packet */}
                  <button
                    type="button"
                    onClick={() => handleOpenIntake(apt)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 hover:bg-white/15 text-white/60 hover:text-white transition-all"
                    title="View Patient Intake Packet"
                  >
                    Intake
                  </button>

                  {/* Dental Odontogram (for oral health visits) */}
                  {isDental && (
                    <button
                      type="button"
                      onClick={() => setActiveDentalChartApt(apt)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#A855F7]/15 border border-[#A855F7]/30 text-[#A855F7] hover:bg-[#A855F7]/25 transition-all"
                      title="Open 32-Tooth Odontogram"
                    >
                      🦷 Teeth
                    </button>
                  )}

                  {/* Superbill Statement */}
                  <button
                    type="button"
                    onClick={() => handleOpenSuperbill(apt)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 hover:bg-white/15 text-white/60 hover:text-white transition-all"
                    title="Export Superbill for Insurance"
                  >
                    📄 Bill
                  </button>

                  {apt.status === 'IN_CONSULTATION' && (
                    <button
                      type="button"
                      onClick={() => advanceStatus(apt, 'COMPLETED')}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-[#06D6A0] transition-all flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} /> Complete
                    </button>
                  )}

                </div>
              </motion.div>
            );
          })
        )}
      </div>
      </>
      )}

      {/* Modal: SOAP Note Editor */}
      {activeSoapNote && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto">
            <ClinicalSoapNoteEditor
              note={activeSoapNote}
              onSave={saved => {
                setActiveSoapNote(saved);
              }}
              onClose={() => setActiveSoapNote(null)}
              onOpenSuperbill={() => {
                const matchedApt = appointments.find(a => a.id === activeSoapNote.appointmentId);
                if (matchedApt) handleOpenSuperbill(matchedApt);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal: Patient Intake */}
      {activeIntake && (
        <PatientIntakeModal
          intake={activeIntake}
          onSave={saved => setActiveIntake(saved)}
          onClose={() => setActiveIntake(null)}
        />
      )}

      {/* Modal: Dental Odontogram */}
      {activeDentalChartApt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setActiveDentalChartApt(null)}
                className="px-3 py-1 rounded-xl text-xs bg-white/10 hover:bg-white/20 text-white font-bold"
              >
                ✕ Close Odontogram
              </button>
            </div>
            <DentalOdontogram
              patientName={activeDentalChartApt.patientName}
              onSave={() => {}}
            />
          </div>
        </div>
      )}

      {/* Modal: Superbill */}
      {activeSuperbill && (
        <SuperbillModal
          superbill={activeSuperbill}
          onClose={() => setActiveSuperbill(null)}
        />
      )}

      {/* Modal: Book New Appointment */}
      {showNewAptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0e0719] border border-white/15 rounded-3xl max-w-xl w-full p-6 text-white shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#00DAF3] uppercase tracking-wider block">
                  Universal Booking Engine
                </span>
                <h3 className="text-xl font-black font-['Space_Grotesk'] text-white">
                  Schedule New Appointment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewAptModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-4">
              
              {/* Type Switcher: In-Person vs Telehealth */}
              <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setNewType('IN_PERSON')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                    newType === 'IN_PERSON'
                      ? 'bg-white text-black shadow-md'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  🏥 In-Clinic Visit
                </button>
                <button
                  type="button"
                  onClick={() => setNewType('TELEHEALTH')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    newType === 'TELEHEALTH'
                      ? 'bg-[#06D6A0] text-black shadow-md shadow-[#06D6A0]/20'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Video size={13} /> Virtual Telehealth
                </button>
              </div>

              {/* Patient Demographics */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/50 uppercase block">Patient Name *</label>
                <input
                  type="text"
                  required
                  value={newPatientName}
                  onChange={e => setNewPatientName(e.target.value)}
                  placeholder="Full name (e.g. Johnathan Vance)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newPatientPhone}
                    onChange={e => setNewPatientPhone(e.target.value)}
                    placeholder="(415) 555-0199"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={newPatientEmail}
                    onChange={e => setNewPatientEmail(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
              </div>
              {realLookingContact(newPatientEmail, newPatientPhone) && (
                <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                  {realLookingContact(newPatientEmail, newPatientPhone)} Only fictional patients belong in this demo.
                </div>
              )}

              {/* Date & Time Slot Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newScheduledDate}
                    onChange={e => setNewScheduledDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Start Time</label>
                  <select
                    value={newStartTime}
                    onChange={e => setNewStartTime(e.target.value)}
                    className="w-full bg-[#120722] border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  >
                    {availableSlots.map(s => (
                      <option key={s.startTime} value={s.startTime}>
                        {s.startTime}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Duration</label>
                  <select
                    value={newDuration}
                    onChange={e => setNewDuration(Number(e.target.value))}
                    className="w-full bg-[#120722] border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </div>
              </div>

              {/* Service & Provider */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Clinical Service</label>
                  <input
                    type="text"
                    value={newServiceName}
                    onChange={e => setNewServiceName(e.target.value)}
                    placeholder="e.g. Oral Health Exam, Telehealth Follow-up"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Rendering Clinician</label>
                  <input
                    type="text"
                    value={newProviderName}
                    onChange={e => setNewProviderName(e.target.value)}
                    placeholder="Dr. Sarah Chen, DDS"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
              </div>

              {/* Chief Complaint & Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Chief Complaint / Reason</label>
                  <input
                    type="text"
                    value={newChiefComplaint}
                    onChange={e => setNewChiefComplaint(e.target.value)}
                    placeholder="e.g. Follow-up on lab results, tooth sensitivity..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-white/50 uppercase block mb-1">Fee ($)</label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={e => setNewPrice(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#00DAF3]"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAptModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00DAF3] text-black shadow-lg shadow-[#00DAF3]/20 hover:brightness-110 transition-all"
                >
                  Confirm & Schedule
                </button>
              </div>

            </form>

          </motion.div>
        </div>
      )}

    </div>
  );
};

export default AppointmentsManager;
