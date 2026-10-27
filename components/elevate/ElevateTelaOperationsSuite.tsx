// components/elevate/ElevateTelaOperationsSuite.tsx
//
// Universal Organization Operations + Plajah Tela Stack Suite.
// Works across Churches, Nonprofits, Cultural Institutions/Museums, Clubs & Schools.
// Every pillar compounds directly with multi-frame TelaDoc canvases (TelaVector floorplans,
// TelaBase tables, TelaForm waivers, TelaWriter SOPs/IRS receipts, and TelaNotes call sheets).

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Bus,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  GitBranch,
  Home,
  Layers,
  Music,
  Pause,
  Play,
  Plus,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import type { Organization, OrgType, TelaDoc } from '../../types';
import {
  detectFacilityAndResourceConflicts,
  evaluateVolunteerMatrixEligibility,
  getVerticalOpsLexicon,
  loadCompoundBundle,
  openFacilityBookingInTela,
  openMatrixScheduleInTela,
  openNonCashIrsReceiptInTela,
  openRetreatLogisticsInTela,
  openWorkflowFormInTela,
  saveCompoundBundle,
  transposeChordProLines,
  type ClassroomRatioZone,
  type ElevateCompoundBundle,
  type ElevateRoomReservation,
  type NonCashAssetGift,
} from '../../services/elevateTelaCompoundService';
import { TelaDocumentPreviewModal } from '../church/TelaDocumentPreviewModal';
import { launchChoraEnvironment, MUSIC_SUB_DEPARTMENTS } from '../../services/melosService';
import { downloadCompleteOrgZeroLockInArchive } from '../../services/chmsExport';

export type CompoundSuiteTab =
  | 'FACILITIES'
  | 'MATRIX_SAFETY'
  | 'CHECKIN_RATIOS'
  | 'WORKFLOWS_FORMS'
  | 'RETREATS_CAMPS'
  | 'STAND_NONCASH';

export interface ElevateTelaOperationsSuiteProps {
  org: Organization;
  currentUserId?: string;
  canManage?: boolean;
  initialTab?: CompoundSuiteTab;
}

const KEYS_LIST = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'NASHVILLE'] as const;

const panel = 'rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6';
const inputCls =
  'w-full rounded-xl bg-black/45 border border-white/12 px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#FF8C00]/60 placeholder:text-white/30';
const pillBtn =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all';

export const ElevateTelaOperationsSuite: React.FC<ElevateTelaOperationsSuiteProps> = ({
  org,
  currentUserId = 'staff-user',
  canManage = true,
  initialTab = 'FACILITIES',
}) => {
  const [bundle, setBundle] = useState<ElevateCompoundBundle>(() => loadCompoundBundle(org));
  const [activeTab, setActiveTab] = useState<CompoundSuiteTab>(initialTab);
  const [verticalLens, setVerticalLens] = useState<OrgType>(org.orgType || 'CHURCH');
  const lexicon = useMemo(() => getVerticalOpsLexicon(verticalLens), [verticalLens]);

  // Inline Tela Document Preview modal state
  const [previewTelaDoc, setPreviewTelaDoc] = useState<{ title: string; doc: TelaDoc; folder: string } | null>(null);
  const [banner, setBanner] = useState<{ title: string; detail: string; tone?: 'emerald' | 'amber' | 'purple' } | null>(null);

  useEffect(() => {
    setBundle(loadCompoundBundle(org));
  }, [org.id]);

  const commit = (next: ElevateCompoundBundle) => {
    setBundle(next);
    saveCompoundBundle(next);
  };

  // ── Tab 1: Facility & Resource Reservation Draft State ──
  const [resDraft, setResDraft] = useState({
    title: '',
    departmentName: 'Operations & Events',
    dateISO: '2026-11-01',
    startTime: '09:00',
    endTime: '11:30',
    setupMins: 30,
    teardownMins: 30,
    roomId: bundle.rooms[0]?.id || 'room_sanctuary_main',
    expectedAttendees: 120,
    resourceId: 'res_av_mobile',
    resourceQty: 1,
    notes: '',
  });

  const liveConflict = useMemo(
    () =>
      detectFacilityAndResourceConflicts(
        {
          title: resDraft.title || 'Draft Event',
          departmentName: resDraft.departmentName,
          requestedBy: 'Staff',
          dateISO: resDraft.dateISO,
          startTime: resDraft.startTime,
          endTime: resDraft.endTime,
          setupMins: Number(resDraft.setupMins) || 0,
          teardownMins: Number(resDraft.teardownMins) || 0,
          roomId: resDraft.roomId,
          expectedAttendees: Number(resDraft.expectedAttendees) || 0,
          resources: resDraft.resourceQty > 0 ? [{ resourceId: resDraft.resourceId, quantity: Number(resDraft.resourceQty) }] : [],
        },
        bundle.reservations,
        bundle.rooms,
        bundle.resources
      ),
    [resDraft, bundle.reservations, bundle.rooms, bundle.resources]
  );

  // ── Tab 2: Matrix Scheduling & Blockout State ──
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<{ slotId: string; dateISO: string } | null>(null);
  const [newBlockout, setNewBlockout] = useState({
    personId: bundle.safetyRecords[0]?.personId || '',
    startISO: '2026-11-14',
    endISO: '2026-11-16',
    reason: '',
  });

  // ── Tab 3: Check-In Ratio & Thermal Printer State ──
  const [thermalFormat, setThermalFormat] = useState<'BROTHER_QL_62MM' | 'ZEBRA_ZD410_225' | 'DYMO_30256'>('BROTHER_QL_62MM');
  const [pageDraft, setPageDraft] = useState<Record<string, string>>({});

  // ── Tab 4: Workflow Intake Simulator State ──
  const [intakeDraft, setIntakeDraft] = useState({
    personName: '',
    personEmail: '',
    notes: '',
    signedWaiver: true,
  });

  // ── Tab 5: Retreat / Camp New Registrant State ──
  const [regDraft, setRegDraft] = useState({
    attendeeName: '',
    ageOrGrade: 'Grade 10',
    depositPaidUsd: 75,
    scholarshipUsd: 0,
    dietaryOrAllergy: '',
    tshirtSize: 'M' as const,
  });

  // ── Tab 6: Music Stand & Live Timer + Non-Cash Asset State ──
  const [activeCueIdx, setActiveCueIdx] = useState(1);
  const [targetKey, setTargetKey] = useState<string>('D');
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [nonCashDraft, setNonCashDraft] = useState({
    donorName: '',
    donorAddress: '',
    assetKind: 'PUBLIC_STOCK' as NonCashAssetGift['assetKind'],
    assetDescription: '',
    tickerOrIdentifier: 'AAPL',
    shareOrUnitCount: 25,
    fundName: 'General & Building Endowment',
    internalEstimatedValueUsd: 5500,
  });

  const activeCue = bundle.runOfShowCues[activeCueIdx] || bundle.runOfShowCues[0];

  useEffect(() => {
    if (activeCue?.songKey) setTargetKey(activeCue.songKey);
    setElapsedSec(activeCue?.actualElapsedSec || 0);
    setTimerRunning(false);
  }, [activeCueIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSec(s => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  // Foot-pedal / keyboard page turn in Music Stand tab
  useEffect(() => {
    if (activeTab !== 'STAND_NONCASH') return;
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName || '')) return;
      if (e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveCueIdx(i => Math.min(bundle.runOfShowCues.length - 1, i + 1));
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveCueIdx(i => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, bundle.runOfShowCues.length]);

  const fmtSec = (sec: number) => {
    const sign = sec < 0 ? '-' : '';
    const abs = Math.abs(sec);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return `${sign}${m}:${String(s).padStart(2, '0')}`;
  };

  // ── Handlers ──

  const handleBookFacility = () => {
    if (!resDraft.title.trim()) return;
    const newRes: ElevateRoomReservation = {
      id: `resv_${Date.now().toString(36)}`,
      title: resDraft.title.trim(),
      departmentName: resDraft.departmentName.trim() || 'Operations',
      requestedBy: 'Operations Studio',
      dateISO: resDraft.dateISO,
      startTime: resDraft.startTime,
      endTime: resDraft.endTime,
      setupMins: Number(resDraft.setupMins) || 0,
      teardownMins: Number(resDraft.teardownMins) || 0,
      roomId: resDraft.roomId,
      expectedAttendees: Number(resDraft.expectedAttendees) || 0,
      resources:
        Number(resDraft.resourceQty) > 0
          ? [{ resourceId: resDraft.resourceId, quantity: Number(resDraft.resourceQty) }]
          : [],
      approvalStatus: liveConflict.hasConflict ? 'CONFLICT_HOLD' : 'APPROVED',
      notes: resDraft.notes.trim() || undefined,
    };
    commit({ ...bundle, reservations: [newRes, ...bundle.reservations] });
    setResDraft(d => ({ ...d, title: '', notes: '' }));
    setBanner({
      title: liveConflict.hasConflict ? 'Saved on Conflict Hold' : 'Room & Equipment Reserved',
      detail: liveConflict.hasConflict
        ? 'Facility conflict detected — routed to Facilities Approval queue.'
        : `"${newRes.title}" is booked with ${newRes.setupMins}m setup and ${newRes.teardownMins}m teardown buffers.`,
      tone: liveConflict.hasConflict ? 'amber' : 'emerald',
    });
  };

  const handleOpenReservationTela = async (r: ElevateRoomReservation, previewOnly = true) => {
    const room = bundle.rooms.find(x => x.id === r.roomId);
    const doc = await openFacilityBookingInTela(org, r, room, bundle.resources, currentUserId, !previewOnly);
    if (previewOnly) {
      setPreviewTelaDoc({ title: doc.title, doc, folder: 'Facilities & Floorplans' });
    }
  };

  const handleAssignMatrix = (slotId: string, dateISO: string, personId: string | null) => {
    const person = bundle.safetyRecords.find(p => p.personId === personId);
    const nextSlots = bundle.matrixSlots.map(s => {
      if (s.id !== slotId) return s;
      const nextMap = { ...s.assignmentsByDate };
      if (!person) {
        nextMap[dateISO] = null;
      } else {
        nextMap[dateISO] = {
          personId: person.personId,
          personName: person.personName,
          status: 'CONFIRMED',
        };
      }
      return { ...s, assignmentsByDate: nextMap };
    });
    commit({ ...bundle, matrixSlots: nextSlots });
    setSelectedMatrixCell(null);
  };

  const handleAddBlockout = () => {
    const person = bundle.safetyRecords.find(p => p.personId === newBlockout.personId);
    if (!person || !newBlockout.startISO || !newBlockout.endISO) return;
    commit({
      ...bundle,
      blockouts: [
        {
          id: `blk_${Date.now().toString(36)}`,
          personId: person.personId,
          personName: person.personName,
          startISO: newBlockout.startISO,
          endISO: newBlockout.endISO,
          reason: newBlockout.reason.trim() || undefined,
        },
        ...bundle.blockouts,
      ],
    });
    setNewBlockout(b => ({ ...b, reason: '' }));
  };

  const handlePageGuardian = (
    zoneName: string,
    child: ClassroomRatioZone['checkedInChildren'][number]
  ) => {
    const customMsg =
      (pageDraft[child.id] || '').trim() ||
      `Hi ${child.guardianName}, please come to ${zoneName} (Pickup Security Code: ${child.securityCode}).`;
    const entry = {
      id: `pg_${Date.now().toString(36)}`,
      childName: child.childName,
      securityCode: child.securityCode,
      roomName: zoneName,
      guardianName: child.guardianName,
      message: customMsg,
      sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'DELIVERED_PUSH_AND_SMS' as const,
    };
    commit({ ...bundle, guardianPages: [entry, ...bundle.guardianPages] });
    setBanner({
      title: `Guardian Paged (${child.securityCode})`,
      detail: `Dispatched to ${child.guardianName} (${child.guardianMaskedPhone}) via Plajah Push + Masked SMS.`,
      tone: 'emerald',
    });
  };

  const handleAdvanceWorkflowCard = (wfId: string, cardId: string) => {
    const nextWfs = bundle.workflows.map(wf => {
      if (wf.id !== wfId) return wf;
      const nextCards = wf.cards.map(c => {
        if (c.id !== cardId) return c;
        const currIdx = wf.stages.findIndex(s => s.id === c.currentStageId);
        const nextStage = wf.stages[Math.min(wf.stages.length - 1, currIdx + 1)];
        return {
          ...c,
          currentStageId: nextStage.id,
          completedStageIds: Array.from(new Set([...c.completedStageIds, c.currentStageId])),
        };
      });
      return { ...wf, cards: nextCards };
    });
    commit({ ...bundle, workflows: nextWfs });
  };

  const handleAddWorkflowCard = (wfId: string) => {
    if (!intakeDraft.personName.trim()) return;
    const nextWfs = bundle.workflows.map(wf => {
      if (wf.id !== wfId) return wf;
      const firstStageId = wf.stages[0]?.id || 'st_1';
      return {
        ...wf,
        cards: [
          {
            id: `wfc_${Date.now().toString(36)}`,
            personName: intakeDraft.personName.trim(),
            personEmail: intakeDraft.personEmail.trim() || undefined,
            currentStageId: firstStageId,
            startedAtISO: new Date().toISOString().slice(0, 10),
            completedStageIds: [],
            mappedProfileFields: { Notes: intakeDraft.notes.trim() || 'Submitted via TelaForm' },
            eSignatureStamp: intakeDraft.signedWaiver
              ? `Signed via TelaForm · ${new Date().toISOString().slice(0, 10)}`
              : undefined,
          },
          ...wf.cards,
        ],
      };
    });
    commit({ ...bundle, workflows: nextWfs });
    setIntakeDraft({ personName: '', personEmail: '', notes: '', signedWaiver: true });
    setBanner({
      title: 'TelaForm Submitted → Workflow Triggered',
      detail: 'Profile fields mapped and Stage 1 automated outreach queued.',
      tone: 'emerald',
    });
  };

  const TABS: Array<{ id: CompoundSuiteTab; label: string; sub: string; icon: React.FC<any> }> = [
    { id: 'FACILITIES', label: 'Facilities & Rooms', sub: 'Conflict Engine + Floorplan Tela', icon: Building2 },
    { id: 'MATRIX_SAFETY', label: 'Matrix & Blockouts', sub: 'Multi-Week Grid + BG Check Gate', icon: Calendar },
    { id: 'CHECKIN_RATIOS', label: 'Ratios & Paging', sub: '1:4 Child Safety + Thermal Labels', icon: ShieldCheck },
    { id: 'WORKFLOWS_FORMS', label: 'Workflows & TelaForms', sub: 'Automated Pipelines + Waivers', icon: GitBranch },
    { id: 'RETREATS_CAMPS', label: 'Camps & Logistics', sub: 'Installments + Cabins & Buses', icon: Bus },
    { id: 'STAND_NONCASH', label: 'Music Stand & Assets', sub: 'Nashville Charts, Timers & Stock IRS', icon: Music },
  ];

  return (
    <div className="space-y-6 text-white">
      {/* Top Compound Header + Multi-Vertical Lens Switcher */}
      <div className="rounded-3xl border border-[#D40055]/35 bg-gradient-to-r from-[#6B0099]/25 via-[#D40055]/15 to-[#FF8C00]/15 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#FF8C00]">
              <Sparkles size={12} /> Plajah Elevate × Tela Stack Compound Engine
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Universal Operations, Safety &amp; Live Tela Studio
            </h2>
            <p className="text-xs text-white/65 leading-relaxed">
              Every module works for <b>Churches, Cultural Institutions, Nonprofits, Clubs &amp; Schools</b> and compiles directly into live, multi-frame <b>Tela Documents</b> (Vector floorplans, Base tables, Form waivers, and Writer dossiers).
            </p>
          </div>

          {/* Vertical Lens Switcher */}
          <div className="space-y-1.5">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/45">
              Organization Vertical Lens
            </div>
            <div className="inline-flex rounded-2xl bg-black/50 border border-white/15 p-1 gap-1">
              {(
                [
                  ['CHURCH', 'Church & Faith'],
                  ['CULTURAL', 'Museum & Cultural'],
                  ['NONPROFIT', 'Nonprofit & Civic'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setVerticalLens(k)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${
                    verticalLens === k ? 'bg-[#D40055] text-white shadow' : 'text-white/55 hover:text-white'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-amber-300/90 font-semibold">
                Active Vocabulary: {lexicon.orgKindLabel}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const files = await downloadCompleteOrgZeroLockInArchive(org);
                  setBanner({
                    title: 'Zero-Lock-In Complete Org Archive Exported',
                    detail: `Exported ${files.length} portable CSV & Master JSON files (People, Households, Giving, Pledges, Attendance, Groups, Departments, Chora Songs & Tela Operations).`,
                    tone: 'emerald',
                  });
                }}
                className="px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider transition"
              >
                Export Entire Org &amp; Chora Archive (Zero Lock-In)
              </button>
            </div>
          </div>
        </div>

        {/* 6-Pillar Navigation Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-5">
          {TABS.map(t => {
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  on
                    ? 'bg-white text-black border-white shadow-lg'
                    : 'bg-black/40 border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-xs">
                  <t.icon size={14} className={on ? 'text-[#D40055]' : 'text-[#FF8C00]'} />
                  <span className="truncate">{t.label}</span>
                </div>
                <div className={`text-[10px] mt-1 truncate ${on ? 'text-black/65 font-semibold' : 'text-white/40'}`}>
                  {t.sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {banner && (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 flex items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-black text-emerald-200">{banner.title}: </span>
            <span className="text-white/85">{banner.detail}</span>
          </div>
          <button onClick={() => setBanner(null)} className="text-[10px] font-black uppercase text-white/50 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* =====================================================================
          PILLAR 1: FACILITIES, ROOMS, EQUIPMENT & FLOORPLAN TELA STUDIO
          ===================================================================== */}
      {activeTab === 'FACILITIES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Rooms & Shared Equipment Inventory + Booking Creator */}
          <div className="lg:col-span-5 space-y-5">
            <div className={panel}>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00] mb-1">
                {lexicon.facilityLabel}
              </div>
              <h3 className="text-base font-black text-white mb-3">
                Reserve Space &amp; Shared Resources
              </h3>

              <div className="space-y-3">
                <input
                  value={resDraft.title}
                  onChange={e => setResDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder={`Event or gathering title (e.g. ${lexicon.roomExamples.split(',')[0]})`}
                  className={inputCls}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">Room / Space</label>
                    <select
                      value={resDraft.roomId}
                      onChange={e => setResDraft(d => ({ ...d, roomId: e.target.value }))}
                      className={inputCls}
                    >
                      {bundle.rooms.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} (Cap {r.capacity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">Date</label>
                    <input
                      type="date"
                      value={resDraft.dateISO}
                      onChange={e => setResDraft(d => ({ ...d, dateISO: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">Start</label>
                    <input
                      type="time"
                      value={resDraft.startTime}
                      onChange={e => setResDraft(d => ({ ...d, startTime: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">End</label>
                    <input
                      type="time"
                      value={resDraft.endTime}
                      onChange={e => setResDraft(d => ({ ...d, endTime: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">Setup (m)</label>
                    <input
                      type="number"
                      value={resDraft.setupMins}
                      onChange={e => setResDraft(d => ({ ...d, setupMins: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">Teardown</label>
                    <input
                      type="number"
                      value={resDraft.teardownMins}
                      onChange={e => setResDraft(d => ({ ...d, teardownMins: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-white/45 mb-1">Shared Equipment / Vehicle</label>
                    <select
                      value={resDraft.resourceId}
                      onChange={e => setResDraft(d => ({ ...d, resourceId: e.target.value }))}
                      className={inputCls}
                    >
                      {bundle.resources.map(res => (
                        <option key={res.id} value={res.id}>
                          {res.name} ({res.totalQuantity} total)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/45 mb-1">Expected Headcount</label>
                    <input
                      type="number"
                      value={resDraft.expectedAttendees}
                      onChange={e => setResDraft(d => ({ ...d, expectedAttendees: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Live Conflict Detection Readout */}
                {(liveConflict.hasConflict || liveConflict.capacityWarning) && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/15 p-3 space-y-1 text-xs">
                    <div className="font-black text-amber-200 flex items-center gap-1.5">
                      <AlertTriangle size={14} /> Real-Time Facility &amp; Buffer Conflict Check
                    </div>
                    {liveConflict.roomConflicts.map((c, i) => (
                      <p key={i} className="text-amber-100/90">• {c}</p>
                    ))}
                    {liveConflict.resourceConflicts.map((c, i) => (
                      <p key={i} className="text-amber-100/90">• {c}</p>
                    ))}
                    {liveConflict.capacityWarning && (
                      <p className="text-amber-200/80">• {liveConflict.capacityWarning}</p>
                    )}
                  </div>
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={handleBookFacility}
                    disabled={!resDraft.title.trim()}
                    className={`${pillBtn} w-full justify-center bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white py-3 disabled:opacity-40`}
                  >
                    <Plus size={14} /> Reserve Space &amp; Generate Floorplan Tela
                  </button>
                )}
              </div>
            </div>

            {/* Room & Fleet Inventory Summary */}
            <div className={panel}>
              <h4 className="text-xs font-black uppercase tracking-widest text-white/50 mb-3">
                Managed Spaces &amp; Shared Resources
              </h4>
              <div className="space-y-2">
                {bundle.rooms.map(rm => (
                  <div key={rm.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-xs">
                    <div>
                      <div className="font-bold text-white">{rm.name}</div>
                      <div className="text-[10px] text-white/45">
                        {rm.building} · Cap {rm.capacity} · Buffer +{rm.defaultSetupMins}m / +{rm.defaultTeardownMins}m
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[9px] font-black uppercase text-[#D0BCFF]">
                      {rm.floorplanPreset.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Active Reservations & Tela Floorplan Studio Launcher */}
          <div className="lg:col-span-7 space-y-4">
            <div className={panel}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#06D6A0]">
                    Facility Master Schedule &amp; Approvals
                  </div>
                  <h3 className="text-base font-black text-white">
                    Room Bookings + Interactive Tela Floorplans ({bundle.reservations.length})
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                {bundle.reservations.length === 0 ? (
                  <p className="text-xs text-white/45 py-8 text-center">
                    No facility reservations yet. Book a room on the left to generate its 3-frame Tela Floorplan &amp; Equipment Checklist.
                  </p>
                ) : (
                  bundle.reservations.map(r => {
                    const rm = bundle.rooms.find(x => x.id === r.roomId);
                    return (
                      <div key={r.id} className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-white">{r.title}</span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  r.approvalStatus === 'APPROVED'
                                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                                    : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                                }`}
                              >
                                {r.approvalStatus.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-xs text-white/55 mt-0.5">
                              {rm?.name || r.roomId} · {r.dateISO} · {r.startTime}–{r.endTime} (Setup {r.setupMins}m / Teardown {r.teardownMins}m) · {r.expectedAttendees} ppl
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleOpenReservationTela(r, true)}
                              className={`${pillBtn} bg-amber-400/20 border border-amber-400/40 text-amber-200 hover:bg-amber-400/30`}
                            >
                              <Layers size={12} /> Preview 3-Frame Tela
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleOpenReservationTela(r, false)}
                              className={`${pillBtn} bg-white/10 border border-white/15 text-white hover:bg-white/20`}
                            >
                              <ExternalLink size={12} /> Full Tela Canvas
                            </button>
                          </div>
                        </div>

                        {r.notes && <p className="text-[11px] text-white/50">{r.notes}</p>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PILLAR 2: MULTI-WEEK MATRIX SCHEDULER, BLOCKOUTS & SAFETY GATING
          ===================================================================== */}
      {activeTab === 'MATRIX_SAFETY' && (
        <div className="space-y-5">
          <div className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                  {lexicon.teamLabel} · Multi-Week Matrix
                </div>
                <h3 className="text-base font-black text-white">
                  Side-by-Side Matrix Planner with Background-Check &amp; Blockout Gating
                </h3>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const doc = await openMatrixScheduleInTela(
                    org,
                    bundle.matrixDates,
                    bundle.matrixSlots,
                    bundle.blockouts,
                    currentUserId,
                    false
                  );
                  setPreviewTelaDoc({ title: doc.title, doc, folder: 'Matrix Schedules & Call Sheets' });
                }}
                className={`${pillBtn} bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white`}
              >
                <Layers size={13} /> Open Matrix &amp; Call Sheet in Tela
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/15 text-left text-[10px] font-black uppercase tracking-widest text-white/50">
                    <th className="py-3 px-3">Team &amp; Position</th>
                    <th className="py-3 px-3">Safety Gate</th>
                    {bundle.matrixDates.map(d => (
                      <th key={d} className="py-3 px-3 min-w-[165px]">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bundle.matrixSlots.map(slot => (
                    <tr key={slot.id} className="border-b border-white/10">
                      <td className="py-3 px-3">
                        <div className="font-black text-white">{slot.positionTitle}</div>
                        <div className="text-[10px] text-white/45">{slot.teamName}</div>
                      </td>
                      <td className="py-3 px-3">
                        {slot.requiresBackgroundCheck ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 text-[9px] font-black uppercase">
                            <ShieldCheck size={11} /> BG Cleared Req
                          </span>
                        ) : (
                          <span className="text-[10px] text-white/40">Standard</span>
                        )}
                      </td>
                      {bundle.matrixDates.map(dateISO => {
                        const assigned = slot.assignmentsByDate[dateISO];
                        const isPicking =
                          selectedMatrixCell?.slotId === slot.id && selectedMatrixCell?.dateISO === dateISO;
                        return (
                          <td key={dateISO} className="py-3 px-3 align-top">
                            {isPicking ? (
                              <div className="rounded-2xl border border-[#FF8C00]/50 bg-black/85 p-2.5 space-y-1.5">
                                <div className="text-[9px] font-black uppercase tracking-widest text-[#FF8C00]">
                                  Assign for {dateISO}
                                </div>
                                {bundle.safetyRecords.map(p => {
                                  const check = evaluateVolunteerMatrixEligibility(
                                    p,
                                    slot,
                                    dateISO,
                                    bundle.matrixSlots,
                                    bundle.blockouts
                                  );
                                  return (
                                    <button
                                      key={p.personId}
                                      type="button"
                                      disabled={!check.eligible}
                                      onClick={() => handleAssignMatrix(slot.id, dateISO, p.personId)}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-[11px] transition ${
                                        check.eligible
                                          ? 'bg-white/5 border-white/10 hover:bg-emerald-500/20 text-white'
                                          : 'bg-rose-500/10 border-rose-500/30 text-white/40 cursor-not-allowed'
                                      }`}
                                    >
                                      <div className="font-bold">{p.personName}</div>
                                      {!check.eligible && (
                                        <div className="text-[9px] text-rose-300">{check.blockers.join(' · ')}</div>
                                      )}
                                      {check.eligible && check.warnings.length > 0 && (
                                        <div className="text-[9px] text-amber-300">{check.warnings.join(' · ')}</div>
                                      )}
                                    </button>
                                  );
                                })}
                                <div className="flex justify-between pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleAssignMatrix(slot.id, dateISO, null)}
                                    className="text-[9px] font-black uppercase text-rose-300"
                                  >
                                    Clear Slot
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMatrixCell(null)}
                                    className="text-[9px] font-black uppercase text-white/50"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            ) : assigned ? (
                              <button
                                type="button"
                                onClick={() => setSelectedMatrixCell({ slotId: slot.id, dateISO })}
                                className="w-full text-left px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-100 hover:bg-emerald-500/25 transition"
                              >
                                <div className="font-bold truncate">{assigned.personName}</div>
                                <div className="text-[9px] uppercase font-black text-emerald-300">
                                  {assigned.status}
                                </div>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectedMatrixCell({ slotId: slot.id, dateISO })}
                                className="w-full text-left px-3 py-2 rounded-xl border border-dashed border-white/20 text-white/45 hover:text-white hover:border-white/40 transition"
                              >
                                + Assign Volunteer
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Split: Date-Range Blockout Calendar + Background Check Clearance Roster */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={panel}>
              <h4 className="text-sm font-black text-white mb-2">
                Volunteer Date-Range Blockouts (Vacations &amp; Conflicts)
              </h4>
              <div className="grid sm:grid-cols-4 gap-2 mb-3">
                <select
                  value={newBlockout.personId}
                  onChange={e => setNewBlockout(b => ({ ...b, personId: e.target.value }))}
                  className={inputCls}
                >
                  {bundle.safetyRecords.map(p => (
                    <option key={p.personId} value={p.personId}>
                      {p.personName}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newBlockout.startISO}
                  onChange={e => setNewBlockout(b => ({ ...b, startISO: e.target.value }))}
                  className={inputCls}
                />
                <input
                  type="date"
                  value={newBlockout.endISO}
                  onChange={e => setNewBlockout(b => ({ ...b, endISO: e.target.value }))}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={handleAddBlockout}
                  className={`${pillBtn} justify-center bg-[#FF8C00] text-black`}
                >
                  Add Blockout
                </button>
              </div>
              <div className="space-y-2">
                {bundle.blockouts.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs">
                    <div>
                      <span className="font-bold text-white">{b.personName}</span>
                      <span className="text-amber-300 ml-2">
                        {b.startISO} → {b.endISO}
                      </span>
                      {b.reason && <span className="text-white/45 ml-2">({b.reason})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={panel}>
              <h4 className="text-sm font-black text-white mb-2">
                Background Check Screening &amp; Household Pairing Rules
              </h4>
              <div className="space-y-2">
                {bundle.safetyRecords.map(rec => (
                  <div key={rec.personId} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs">
                    <div>
                      <div className="font-bold text-white">{rec.personName}</div>
                      <div className="text-[10px] text-white/45">
                        {rec.provider || 'CHECKR'} · Household: {rec.householdRule || 'INDEPENDENT'}
                        {rec.partnerName ? ` (${rec.partnerName})` : ''}
                      </div>
                    </div>
                    <select
                      value={rec.backgroundCheckStatus}
                      onChange={e => {
                        const status = e.target.value as typeof rec.backgroundCheckStatus;
                        commit({
                          ...bundle,
                          safetyRecords: bundle.safetyRecords.map(x =>
                            x.personId === rec.personId ? { ...x, backgroundCheckStatus: status } : x
                          ),
                        });
                      }}
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase border bg-black ${
                        rec.backgroundCheckStatus === 'CLEARED'
                          ? 'text-emerald-300 border-emerald-400/40'
                          : 'text-amber-300 border-amber-400/40'
                      }`}
                    >
                      <option value="CLEARED">CLEARED ✓</option>
                      <option value="PENDING">PENDING</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PILLAR 3: CHECK-IN CLASSROOM RATIOS, THERMAL LABELS & GUARDIAN PAGING
          ===================================================================== */}
      {activeTab === 'CHECKIN_RATIOS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-4">
            {bundle.ratioZones.map(zone => {
              const count = zone.checkedInChildren.length;
              const maxAllowedByAdults = zone.activeAdults * zone.requiredChildrenPerAdult;
              const effectiveLimit = Math.min(zone.maxCapacity, maxAllowedByAdults);
              const ratioCompliant = count <= maxAllowedByAdults;

              return (
                <div key={zone.id} className={panel}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-white">{zone.roomName}</h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-black text-[#D0BCFF]">
                          {zone.ageOrGradeBand}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-0.5">
                        Required Ratio: <b>1 Adult : {zone.requiredChildrenPerAdult} Kids</b> · Active Cleared Leaders: <b>{zone.activeAdults}</b> · Safe Cap: <b>{effectiveLimit}</b>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          ratioCompliant
                            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                            : 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                        }`}
                      >
                        {count} / {effectiveLimit} Checked In · {ratioCompliant ? 'Ratio Safe ✓' : 'Ratio Overflow → Route to Overflow'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {zone.checkedInChildren.map(child => (
                      <div
                        key={child.id}
                        className="rounded-2xl border border-white/10 bg-black/45 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-white text-sm">{child.childName}</span>
                            <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 font-mono font-black text-xs">
                              TAG: {child.securityCode}
                            </span>
                            {child.allergies && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/25 border border-rose-400/40 text-rose-200 text-[10px] font-black uppercase">
                                ALLERGY: {child.allergies}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/50 mt-1">
                            Guardian: {child.guardianName} ({child.guardianMaskedPhone}) · Checked in {child.checkedInAt}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            value={pageDraft[child.id] || ''}
                            onChange={e => setPageDraft(p => ({ ...p, [child.id]: e.target.value }))}
                            placeholder="Custom note (optional)…"
                            className="rounded-xl bg-black/60 border border-white/15 px-3 py-1.5 text-xs text-white w-44"
                          />
                          <button
                            type="button"
                            onClick={() => handlePageGuardian(zone.roomName, child)}
                            className={`${pillBtn} bg-[#FF8C00] text-black`}
                          >
                            <Bell size={12} /> One-Tap Page Guardian
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Thermal Label Printer Profiles + Guardian Page Audit Log */}
          <div className="lg:col-span-4 space-y-5">
            <div className={panel}>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#06D6A0] mb-1">
                Direct Kiosk Hardware Profiles
              </div>
              <h4 className="text-sm font-black text-white mb-3">
                Thermal Label Format (Brother QL / Zebra / Dymo)
              </h4>
              <select
                value={thermalFormat}
                onChange={e => setThermalFormat(e.target.value as any)}
                className={`${inputCls} mb-3`}
              >
                <option value="BROTHER_QL_62MM">Brother QL-820NWB · 62mm Continuous Roll</option>
                <option value="ZEBRA_ZD410_225">Zebra ZD410 / ZD421 · 2.25&quot; × 1.25&quot; Direct Thermal</option>
                <option value="DYMO_30256">Dymo LabelWriter · 30256 Shipping/Badge</option>
              </select>

              {/* Simulated Thermal Badge Preview */}
              <div className="rounded-2xl bg-white text-black p-4 font-sans border-2 border-dashed border-black/30 space-y-1">
                <div className="flex items-center justify-between border-b border-black/20 pb-1">
                  <span className="text-[10px] font-black uppercase">{org.name}</span>
                  <span className="text-[10px] font-mono font-bold">{thermalFormat}</span>
                </div>
                <div className="text-lg font-black leading-tight pt-1">MICAH STERLING</div>
                <div className="text-2xl font-mono font-black tracking-widest">CODE: K7P4</div>
                <div className="text-[10px] font-black bg-black text-white px-2 py-0.5 rounded inline-block">
                  ALLERGY: PEANUTS &amp; TREE NUTS
                </div>
                <div className="text-[9px] text-black/70 pt-1">
                  Sprouts Nursery (101) · Match Parent Pickup Tag K7P4
                </div>
              </div>
            </div>

            <div className={panel}>
              <h4 className="text-sm font-black text-white mb-2">
                Guardian Pager Dispatch Log ({bundle.guardianPages.length})
              </h4>
              {bundle.guardianPages.length === 0 ? (
                <p className="text-xs text-white/40">
                  Tap &ldquo;One-Tap Page Guardian&rdquo; next to any checked-in child to alert parents without exposing phone numbers.
                </p>
              ) : (
                <div className="space-y-2">
                  {bundle.guardianPages.map(pg => (
                    <div key={pg.id} className="rounded-xl bg-black/40 border border-white/10 p-3 text-xs">
                      <div className="flex justify-between font-bold text-emerald-300">
                        <span>{pg.childName} ({pg.securityCode})</span>
                        <span>{pg.sentAt}</span>
                      </div>
                      <p className="text-white/75 mt-1">{pg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PILLAR 4: MULTI-STEP AUTOMATED WORKFLOWS & TELA-NATIVE FORMS
          ===================================================================== */}
      {activeTab === 'WORKFLOWS_FORMS' && (
        <div className="space-y-5">
          {bundle.workflows.map(wf => (
            <div key={wf.id} className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                    Trigger: {wf.triggerLabel}
                  </div>
                  <h3 className="text-lg font-black text-white">{wf.title}</h3>
                  <p className="text-xs text-white/55">{wf.description}</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const doc = await openWorkflowFormInTela(org, wf, currentUserId, false);
                    setPreviewTelaDoc({ title: doc.title, doc, folder: 'Workflows & TelaForms' });
                  }}
                  className={`${pillBtn} bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white`}
                >
                  <Layers size={13} /> Open TelaForm + Pipeline Base in Tela
                </button>
              </div>

              {/* Pipeline Stage Columns */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
                {wf.stages.map(st => {
                  const stageCards = wf.cards.filter(c => c.currentStageId === st.id);
                  return (
                    <div key={st.id} className="rounded-2xl border border-white/10 bg-black/40 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#D0BCFF]">
                          Stage {st.order} · SLA {st.slaHours}h
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-black text-white">
                          {stageCards.length}
                        </span>
                      </div>
                      <div className="text-xs font-black text-white">{st.title}</div>
                      <div className="text-[10px] text-white/45">Owner: {st.ownerRole}</div>

                      <div className="space-y-2 pt-2">
                        {stageCards.map(c => (
                          <div key={c.id} className="rounded-xl bg-white/[0.04] border border-white/10 p-2.5 space-y-1.5 text-xs">
                            <div className="font-bold text-white">{c.personName}</div>
                            {Object.entries(c.mappedProfileFields).map(([k, v]) => (
                              <div key={k} className="text-[10px] text-white/55">
                                <b>{k}:</b> {v}
                              </div>
                            ))}
                            {c.eSignatureStamp && (
                              <div className="text-[9px] text-emerald-300 font-bold flex items-center gap-1">
                                <FileCheck2 size={10} /> {c.eSignatureStamp}
                              </div>
                            )}
                            {st.order < wf.stages.length && (
                              <button
                                type="button"
                                onClick={() => handleAdvanceWorkflowCard(wf.id, c.id)}
                                className="w-full mt-1 py-1.5 rounded-lg bg-white/10 hover:bg-[#FF8C00] hover:text-black text-[10px] font-black uppercase transition"
                              >
                                Advance to Stage {st.order + 1} →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Intake / Waiver Submission Bar */}
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4 grid sm:grid-cols-5 gap-2 items-center">
                <input
                  value={intakeDraft.personName}
                  onChange={e => setIntakeDraft(d => ({ ...d, personName: e.target.value }))}
                  placeholder="Full Name"
                  className={inputCls}
                />
                <input
                  value={intakeDraft.personEmail}
                  onChange={e => setIntakeDraft(d => ({ ...d, personEmail: e.target.value }))}
                  placeholder="Email"
                  className={inputCls}
                />
                <input
                  value={intakeDraft.notes}
                  onChange={e => setIntakeDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Mapped Profile Fields (Skills, Allergies…)"
                  className={inputCls}
                />
                <label className="flex items-center gap-2 text-xs text-white/75 px-2">
                  <input
                    type="checkbox"
                    checked={intakeDraft.signedWaiver}
                    onChange={e => setIntakeDraft(d => ({ ...d, signedWaiver: e.target.checked }))}
                  />
                  E-Sign Waiver
                </label>
                <button
                  type="button"
                  onClick={() => handleAddWorkflowCard(wf.id)}
                  disabled={!intakeDraft.personName.trim()}
                  className={`${pillBtn} justify-center bg-[#06D6A0] text-black disabled:opacity-40`}
                >
                  <Plus size={13} /> Submit TelaForm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================================
          PILLAR 5: CAMPS, RETREATS, CONFERENCES & TRIPS LOGISTICS
          ===================================================================== */}
      {activeTab === 'RETREATS_CAMPS' && (
        <div className="space-y-5">
          {bundle.retreats.map(ret => (
            <div key={ret.id} className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                    {lexicon.retreatLabel}
                  </div>
                  <h3 className="text-lg font-black text-white">{ret.title}</h3>
                  <p className="text-xs text-white/55">
                    {ret.datesLabel} · {ret.location} · Base Fee ${ret.basePriceUsd} (${ret.depositRequiredUsd} Deposit + Installments)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const doc = await openRetreatLogisticsInTela(org, ret, currentUserId, false);
                    setPreviewTelaDoc({ title: doc.title, doc, folder: 'Camps, Retreats & Trip Dossiers' });
                  }}
                  className={`${pillBtn} bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white`}
                >
                  <Layers size={13} /> Open Cabin, Bus &amp; Medical Manifest in Tela
                </button>
              </div>

              {/* Lodging & Transport Units */}
              <div className="grid sm:grid-cols-3 gap-3 mb-5">
                {ret.lodgingUnits.map(u => {
                  const assignedCount = ret.registrants.filter(
                    r => r.assignedCabinId === u.id || r.assignedBusId === u.id
                  ).length;
                  return (
                    <div key={u.id} className="rounded-2xl border border-white/10 bg-black/40 p-3.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-white">{u.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-black text-emerald-300">
                          {assignedCount} / {u.capacity}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/45 mt-1">
                        {u.kind.replace(/_/g, ' ')} · {u.genderOrAgeRule} · Lead: {u.leaderName}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Registrants + Installment Balances + Cabin/Bus Assignment Table */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/15 text-left text-[10px] font-black uppercase tracking-widest text-white/50">
                      <th className="py-2.5 px-3">Attendee</th>
                      <th className="py-2.5 px-3">Installments &amp; Balance</th>
                      <th className="py-2.5 px-3">Cabin / Lodging</th>
                      <th className="py-2.5 px-3">Bus / Shuttle</th>
                      <th className="py-2.5 px-3">Dietary &amp; Waiver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ret.registrants.map(reg => {
                      const paid = reg.depositPaidUsd + reg.installmentsPaidUsd;
                      const due = Math.max(0, reg.totalFeeUsd - reg.scholarshipUsd - paid);
                      return (
                        <tr key={reg.id} className="border-b border-white/10">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">{reg.attendeeName}</div>
                            <div className="text-[10px] text-white/45">
                              {reg.ageOrGrade} · Shirt: {reg.tshirtSize}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-emerald-300">
                              Paid ${paid} {reg.scholarshipUsd > 0 ? `(+ $${reg.scholarshipUsd} Scholarship)` : ''}
                            </div>
                            <div className="text-[10px] text-amber-300">
                              {due > 0 ? `$${due} Remaining Balance` : 'Paid in Full ✓'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={reg.assignedCabinId || ''}
                              onChange={e => {
                                const cabinId = e.target.value || undefined;
                                commit({
                                  ...bundle,
                                  retreats: bundle.retreats.map(r =>
                                    r.id !== ret.id
                                      ? r
                                      : {
                                          ...r,
                                          registrants: r.registrants.map(x =>
                                            x.id === reg.id ? { ...x, assignedCabinId: cabinId } : x
                                          ),
                                        }
                                  ),
                                });
                              }}
                              className="rounded-xl bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="">Unassigned</option>
                              {ret.lodgingUnits
                                .filter(u => u.kind !== 'BUS_SHUTTLE')
                                .map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={reg.assignedBusId || ''}
                              onChange={e => {
                                const busId = e.target.value || undefined;
                                commit({
                                  ...bundle,
                                  retreats: bundle.retreats.map(r =>
                                    r.id !== ret.id
                                      ? r
                                      : {
                                          ...r,
                                          registrants: r.registrants.map(x =>
                                            x.id === reg.id ? { ...x, assignedBusId: busId } : x
                                          ),
                                        }
                                  ),
                                });
                              }}
                              className="rounded-xl bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="">Unassigned</option>
                              {ret.lodgingUnits
                                .filter(u => u.kind === 'BUS_SHUTTLE')
                                .map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-white/80">{reg.dietaryOrAllergy || 'None'}</div>
                            <div className="text-[10px] text-emerald-300">
                              {reg.waiverSigned ? `✓ ${reg.waiverSigner || 'Signed'}` : 'Waiver Pending'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =====================================================================
          PILLAR 6: CHORA MUSIC & SETLIST ENVIRONMENTS + NON-CASH ASSET IRS RECEIPTS
          ===================================================================== */}
      {activeTab === 'STAND_NONCASH' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 7 Cols: Chora Music Environment Launchpad + Live Cue Preview */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-3xl border border-[#FF8C00]/35 bg-gradient-to-br from-[#231036] via-[#130b20] to-[#0a0612] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                    Powered by Chora Service (melosService.ts)
                  </div>
                  <h3 className="text-sm font-black text-white">
                    Launch Organization Music in Chora Writing Pad, Tracklist &amp; Arrangement
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    launchChoraEnvironment({
                      orgId: org.id,
                      orgName: org.name,
                      room: 'pad',
                      padMode: 'stand',
                    })
                  }
                  className={`${pillBtn} bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white`}
                >
                  <ExternalLink size={12} /> Open Chora Stand &amp; Nashville Mode
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    launchChoraEnvironment({
                      orgId: org.id,
                      orgName: org.name,
                      room: 'pad',
                      padMode: 'lyrics',
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-black uppercase text-white transition"
                >
                  Chora Writing Pad
                </button>
                <button
                  type="button"
                  onClick={() =>
                    launchChoraEnvironment({
                      orgId: org.id,
                      orgName: org.name,
                      room: 'pad',
                      padMode: 'score',
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-black uppercase text-white transition"
                >
                  Chora Score &amp; Notation
                </button>
                <button
                  type="button"
                  onClick={() =>
                    launchChoraEnvironment({
                      orgId: org.id,
                      orgName: org.name,
                      room: 'tracklist',
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-black uppercase text-white transition"
                >
                  Chora Tracklist
                </button>
                <button
                  type="button"
                  onClick={() =>
                    launchChoraEnvironment({
                      orgId: org.id,
                      orgName: org.name,
                      room: 'arrange',
                      openLiveCueTimer: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-[10px] font-black uppercase text-emerald-200 transition"
                >
                  Chora Arrange &amp; Live Setlist Timer
                </button>
                {MUSIC_SUB_DEPARTMENTS.map(sub => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() =>
                      launchChoraEnvironment({
                        orgId: org.id,
                        orgName: org.name,
                        room: 'tracklist',
                        subDept: sub.key,
                      })
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-black/50 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-white/80 transition"
                  >
                    {sub.emoji} {sub.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]">
                    {lexicon.standLabel} · Bluetooth Foot-Pedal Ready (← / →)
                  </div>
                  <h3 className="text-base font-black text-white">
                    Live Production Countdown &amp; Instant Nashville / Key Transposer
                  </h3>
                </div>

                {/* Live Timer Pill */}
                {activeCue && (
                  <div className="flex items-center gap-2 rounded-2xl bg-black/60 border border-white/15 px-3.5 py-2">
                    <button
                      type="button"
                      onClick={() => setTimerRunning(r => !r)}
                      className="w-8 h-8 rounded-full bg-[#D40055] text-white grid place-items-center"
                    >
                      {timerRunning ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <div className="text-xs font-mono">
                      <div className="font-black text-white">
                        {fmtSec(elapsedSec)} / {fmtSec(activeCue.plannedDurationSec)}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          elapsedSec > activeCue.plannedDurationSec ? 'text-rose-400' : 'text-emerald-300'
                        }`}
                      >
                        {elapsedSec > activeCue.plannedDurationSec
                          ? `+${fmtSec(elapsedSec - activeCue.plannedDurationSec)} OVERRUN`
                          : `${fmtSec(activeCue.plannedDurationSec - elapsedSec)} REMAINING`}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cue Selector Strip */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {bundle.runOfShowCues.map((cue, idx) => (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={() => setActiveCueIdx(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      activeCueIdx === idx
                        ? 'bg-white text-black border-white'
                        : 'bg-black/40 border-white/10 text-white/65 hover:text-white'
                    }`}
                  >
                    {idx + 1}. {cue.title.slice(0, 26)} ({fmtSec(cue.plannedDurationSec)})
                  </button>
                ))}
              </div>

              {activeCue && (
                <div className="rounded-2xl border border-white/15 bg-[#0d0818] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <span className="text-xs font-black text-[#FF8C00] uppercase">
                        Cue #{activeCue.order} · {activeCue.category}
                      </span>
                      <h4 className="text-lg font-black text-white">{activeCue.title}</h4>
                      {activeCue.ccliNumber && (
                        <span className="text-[10px] text-white/45 font-mono">
                          CCLI SongSelect #{activeCue.ccliNumber} · BPM {activeCue.bpm}
                        </span>
                      )}
                    </div>

                    {activeCue.songKey && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase text-white/45">Transpose:</span>
                        {KEYS_LIST.map(k => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setTargetKey(k)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-black transition ${
                              targetKey === k
                                ? 'bg-[#FF8C00] text-black'
                                : 'bg-white/10 text-white/65 hover:text-white'
                            }`}
                          >
                            {k === 'NASHVILLE' ? 'Nashville #s' : k}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {activeCue.chordProLines?.length ? (
                    <div className="font-mono text-sm leading-relaxed space-y-2 bg-black/50 p-4 rounded-xl border border-white/10">
                      {transposeChordProLines(activeCue.chordProLines, activeCue.songKey || 'D', targetKey).map(
                        (line, idx) => (
                          <div key={idx} className="text-white">
                            {line.split(/(\[[A-G0-9#b/a-z]+\])/g).map((part, pIdx) =>
                              part.startsWith('[') && part.endsWith(']') ? (
                                <span
                                  key={pIdx}
                                  className="px-1.5 py-0.5 mx-0.5 rounded bg-[#D40055]/30 border border-[#D40055]/50 text-amber-300 font-black"
                                >
                                  {part.slice(1, -1)}
                                </span>
                              ) : (
                                <span key={pIdx}>{part}</span>
                              )
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-white/60 italic">{activeCue.performerNotes}</p>
                  )}

                  {activeCue.performerNotes && (
                    <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3.5 py-2.5">
                      <b>Stage &amp; MD Note:</b> {activeCue.performerNotes}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Non-Cash Asset Ledger (Stock / Crypto / DAF) + IRS Pub 1771 Tela Receipt */}
          <div className="lg:col-span-5 space-y-5">
            <div className={panel}>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#06D6A0] mb-1">
                Stock, Crypto, DAF &amp; In-Kind Giving
              </div>
              <h3 className="text-base font-black text-white mb-2">
                IRS Pub 1771 Non-Cash Asset Receipt Studio
              </h3>
              <p className="text-[11px] text-white/55 mb-3">
                IRS rules require stock/property receipts to describe the exact shares/property donated <b>without stating a dollar valuation</b> on the donor&apos;s tax acknowledgment.
              </p>

              <div className="space-y-2.5 mb-4">
                <input
                  value={nonCashDraft.donorName}
                  onChange={e => setNonCashDraft(d => ({ ...d, donorName: e.target.value }))}
                  placeholder="Donor Full Name / Household"
                  className={inputCls}
                />
                <input
                  value={nonCashDraft.donorAddress}
                  onChange={e => setNonCashDraft(d => ({ ...d, donorAddress: e.target.value }))}
                  placeholder="Mailing Address"
                  className={inputCls}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={nonCashDraft.assetKind}
                    onChange={e => setNonCashDraft(d => ({ ...d, assetKind: e.target.value as any }))}
                    className={inputCls}
                  >
                    <option value="PUBLIC_STOCK">Publicly Traded Stock (DTC)</option>
                    <option value="CRYPTO_ASSET">Cryptocurrency</option>
                    <option value="DONOR_ADVISED_FUND">Donor-Advised Fund (DAF)</option>
                    <option value="IN_KIND_EQUIPMENT">In-Kind Property / Equipment</option>
                  </select>
                  <input
                    value={nonCashDraft.tickerOrIdentifier}
                    onChange={e => setNonCashDraft(d => ({ ...d, tickerOrIdentifier: e.target.value }))}
                    placeholder="Ticker / Symbol (e.g. AAPL)"
                    className={inputCls}
                  />
                </div>
                <input
                  value={nonCashDraft.assetDescription}
                  onChange={e => setNonCashDraft(d => ({ ...d, assetDescription: e.target.value }))}
                  placeholder="Property description (e.g. 25 shares of Apple Inc. common stock)"
                  className={inputCls}
                />
                <button
                  type="button"
                  disabled={!nonCashDraft.donorName.trim() || !nonCashDraft.assetDescription.trim()}
                  onClick={() => {
                    const gift: NonCashAssetGift = {
                      id: `nc_${Date.now().toString(36)}`,
                      donorName: nonCashDraft.donorName.trim(),
                      donorAddress: nonCashDraft.donorAddress.trim() || 'Address on file',
                      dateReceivedISO: new Date().toISOString().slice(0, 10),
                      assetKind: nonCashDraft.assetKind,
                      assetDescription: nonCashDraft.assetDescription.trim(),
                      tickerOrIdentifier: nonCashDraft.tickerOrIdentifier.trim() || undefined,
                      shareOrUnitCount: Number(nonCashDraft.shareOrUnitCount) || undefined,
                      fundName: nonCashDraft.fundName,
                      internalEstimatedValueUsd: Number(nonCashDraft.internalEstimatedValueUsd) || 0,
                      irsReceiptGenerated: true,
                    };
                    commit({ ...bundle, nonCashGifts: [gift, ...bundle.nonCashGifts] });
                    setNonCashDraft(d => ({ ...d, donorName: '', assetDescription: '' }));
                  }}
                  className={`${pillBtn} w-full justify-center bg-[#06D6A0] text-black disabled:opacity-40`}
                >
                  <Plus size={13} /> Record Non-Cash Asset &amp; Issue IRS Tela Receipt
                </button>
              </div>

              <div className="space-y-2.5">
                {bundle.nonCashGifts.map(g => (
                  <div key={g.id} className="rounded-2xl border border-white/10 bg-black/40 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white">{g.donorName}</span>
                      <span className="text-[10px] text-emerald-300 font-bold">{g.dateReceivedISO}</span>
                    </div>
                    <p className="text-white/70">{g.assetDescription}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        const doc = await openNonCashIrsReceiptInTela(org, g, currentUserId, false);
                        setPreviewTelaDoc({ title: doc.title, doc, folder: 'Finance Hub · IRS Non-Cash Receipts' });
                      }}
                      className={`${pillBtn} bg-white/10 hover:bg-white/20 text-white`}
                    >
                      <Layers size={12} /> Open IRS Pub 1771 Tela Receipt
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Multi-Frame Tela Document Preview Modal */}
      {previewTelaDoc && (
        <TelaDocumentPreviewModal
          isOpen={true}
          onClose={() => setPreviewTelaDoc(null)}
          title={previewTelaDoc.title}
          telaDoc={previewTelaDoc.doc}
          orgName={org.name}
          departmentFolder={previewTelaDoc.folder}
        />
      )}
    </div>
  );
};

export default ElevateTelaOperationsSuite;
